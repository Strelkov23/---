/* Run only on a trusted build runner, not on page load. */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{pathToFileURL}=require("node:url");
const V=require("./economic-vector-core.js");
async function main(){
 const [archive,out,rawShard,runtime]=process.argv.slice(2);
 if(!archive||!out||!/^\d{1,2}$/.test(rawShard||"")||!runtime)throw Error("Usage: node economic-vector-build.js ARCHIVE OUTPUT SHARD RUNTIME_DIR");
 const shard=Number(rawShard),file="economic-search-index.json";
 const manifest=JSON.parse(fs.readFileSync(path.join(archive,"data-manifest.json"),"utf8"));
 const raw=fs.readFileSync(path.join(archive,file)),sha=crypto.createHash("sha256").update(raw).digest("hex"),meta=manifest.files?.[file];
 if(!meta||meta.sha256!==sha||meta.bytes!==raw.length)throw Error("Source manifest mismatch");
 const index=JSON.parse(raw.toString("utf8")),targets=V.targets(index,shard);
 if(!targets.length)throw Error("Empty shard: no model run verified");
 const entry=require.resolve("@xenova/transformers",{paths:[path.resolve(runtime)]});
 const lib=await import(pathToFileURL(entry).href);
 lib.env.allowLocalModels=false;lib.env.useBrowserCache=false;
 const encoder=await lib.pipeline("feature-extraction",V.MODEL.id,{revision:V.MODEL.revision,quantized:true});
 let completed=0;
 const result=await V.build(index,shard,sha,async text=>{
  const tensor=await encoder(text,{pooling:"mean",normalize:true});
  if(tensor.dims?.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==V.MODEL.dimension)throw Error("Invalid tensor shape");
  if(++completed%25===0)console.log("Encoded",completed,"of",targets.length);
  return tensor.data;
 });
 V.validate(result,index,sha,shard);
 fs.mkdirSync(out,{recursive:true});
 const filename="research-title-shard-"+String(shard).padStart(2,"0")+".json",payload=JSON.stringify(result);
 fs.writeFileSync(path.join(out,filename),payload);
 fs.writeFileSync(path.join(out,"receipt.json"),JSON.stringify({schema:1,source_sha256:sha,shard,rows:result.rows.length,file:filename,sha256:crypto.createHash("sha256").update(payload).digest("hex"),bytes:Buffer.byteLength(payload),model:V.MODEL}));
 console.log("Verified title vectors:",result.rows.length,"source",sha);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
