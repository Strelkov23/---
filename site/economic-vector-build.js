/* Build one or all shards with a single lazily initialized inference model. */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{pathToFileURL}=require("node:url");
const V=require("./economic-vector-core.js"),{assemble}=require("./economic-vector-pack.js");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function readPrior(folder){
 if(!folder||!fs.existsSync(path.join(folder,"research-title-catalog.json")))return new Map();
 const c=JSON.parse(fs.readFileSync(path.join(folder,"research-title-catalog.json"),"utf8"));
 if(c.schema!==1||c.scope!=="research-title-only"||c.shards!==V.SHARDS||!Array.isArray(c.entries)||c.entries.length>V.SHARDS||!c.model||Object.keys(c.model).length!==Object.keys(V.MODEL).length||Object.keys(V.MODEL).some(k=>c.model[k]!==V.MODEL[k]))throw Error("Invalid previous catalogue");
 const result=new Map();
 for(const e of c.entries){
  const i=e.shard,name="research-title-shard-"+String(i).padStart(2,"0")+".json";
  if(!Number.isInteger(i)||i<0||i>=V.SHARDS||result.has(i)||e.file!==name)throw Error("Invalid previous catalogue entry");
  const b=fs.readFileSync(path.join(folder,name));
  if(b.length!==e.bytes||hash(b)!==e.sha256)throw Error("Previous vector checksum mismatch");
  const d=JSON.parse(b.toString("utf8"));
  if(d.source_sha256!==c.source_sha256||d.rows?.length!==e.rows)throw Error("Previous catalogue mismatch");
  V.reusable(d,i);result.set(i,d);
 }
 return result;
}
async function main(){
 const [archive,out,rawShard,runtime,priorFolder]=process.argv.slice(2);
 if(!archive||!out||!(rawShard==="all"||/^\d{1,2}$/.test(rawShard||""))||!runtime)throw Error("Usage: node economic-vector-build.js ARCHIVE OUTPUT SHARD_OR_ALL RUNTIME_DIR [PREVIOUS]");
 const requested=rawShard==="all"?Array.from({length:V.SHARDS},(_,i)=>i):[Number(rawShard)],file="economic-search-index.json";
 if(requested.some(i=>i<0||i>=V.SHARDS))throw Error("Invalid shard");
 const manifest=JSON.parse(fs.readFileSync(path.join(archive,"data-manifest.json"),"utf8"));
 const raw=fs.readFileSync(path.join(archive,file)),sha=hash(raw),meta=manifest.files?.[file];
 if(!meta||meta.sha256!==sha||meta.bytes!==raw.length)throw Error("Source manifest mismatch");
 const index=JSON.parse(raw.toString("utf8"));
 // An invalid previous artifact is never reused. Full rebuild is safe.
 let previous=new Map();
 try{previous=readPrior(priorFolder)}catch(e){console.warn("Previous artifact rejected:",e.message)}
 let encoder=null,encoded=0,reused=0;
 const encode=async text=>{
  if(!encoder){
   const entry=require.resolve("@xenova/transformers",{paths:[path.resolve(runtime)]});
   const lib=await import(pathToFileURL(entry).href);
   lib.env.allowLocalModels=false;lib.env.useBrowserCache=false;
   encoder=await lib.pipeline("feature-extraction",V.MODEL.id,{revision:V.MODEL.revision,quantized:true});
  }
  const tensor=await encoder(text,{pooling:"mean",normalize:true});
  if(tensor.dims?.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==V.MODEL.dimension)throw Error("Invalid tensor shape");
  encoded++;return tensor.data;
 };
 const work=out+"-parts";
 fs.mkdirSync(work,{recursive:false});
 const folders=[];
 for(const shard of requested){
  const before=encoded,result=await V.build(index,shard,sha,encode,previous.get(shard));
  V.validate(result,index,sha,shard);
  reused+=result.rows.length-(encoded-before);
  const folder=path.join(work,String(shard)),filename="research-title-shard-"+String(shard).padStart(2,"0")+".json",payload=JSON.stringify(result);
  fs.mkdirSync(folder);folders.push(folder);
  fs.writeFileSync(path.join(folder,filename),payload);
  fs.writeFileSync(path.join(folder,"receipt.json"),JSON.stringify({schema:1,source_sha256:sha,shard,rows:result.rows.length,file:filename,sha256:hash(payload),bytes:Buffer.byteLength(payload),model:V.MODEL}));
  console.log("Shard",shard,"verified",result.rows.length,"encoded",encoded-before);
 }
 const c=assemble(archive,folders,out);
 if(rawShard==="all"&&!c.complete)throw Error("Full build incomplete");
 console.log("Build summary: encoded",encoded,"reused",reused,"indexed",c.indexed,"source",sha);
}
module.exports={readPrior};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
