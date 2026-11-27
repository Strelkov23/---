/* Assemble immutable shard files after checking actual bytes against their receipts. */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),V=require("./economic-vector-core.js");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function assemble(archive,inputs,out){
 const manifest=JSON.parse(fs.readFileSync(path.join(archive,"data-manifest.json"),"utf8"));
 const name="economic-search-index.json",raw=fs.readFileSync(path.join(archive,name)),source=hash(raw);
 if(manifest.files?.[name]?.sha256!==source||manifest.files?.[name]?.bytes!==raw.length)throw Error("Source manifest mismatch");
 const index=JSON.parse(raw.toString("utf8")),parts=[],payloads=[];
 for(const folder of inputs){
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,"receipt.json"),"utf8"));
  if(!/^research-title-shard-(?:0[0-9]|[1-5][0-9]|6[0-3])\.json$/.test(receipt.file||""))throw Error("Unsafe shard file");
  const bytes=fs.readFileSync(path.join(folder,receipt.file));
  if(hash(bytes)!==receipt.sha256||bytes.length!==receipt.bytes)throw Error("Shard checksum mismatch");
  parts.push({data:JSON.parse(bytes.toString("utf8")),receipt});payloads.push({name:receipt.file,bytes});
 }
 const catalog=V.catalog(index,source,parts);
 if(!catalog.entries.length)throw Error("No validated shards");
 // Validate all input before writing. A fresh destination avoids stale files.
 fs.mkdirSync(out,{recursive:false});
 for(const p of payloads)fs.writeFileSync(path.join(out,p.name),p.bytes);
 fs.writeFileSync(path.join(out,"research-title-catalog.json"),JSON.stringify(catalog));
 console.log("Validated",catalog.indexed,"of",catalog.total,"titles in",catalog.entries.length,"of",catalog.shards,"shards; complete:",catalog.complete);
 return catalog;
}
module.exports={assemble};
if(require.main===module){
 try{const [archive,out,...inputs]=process.argv.slice(2);if(!archive||!out||!inputs.length)throw Error("Usage: node economic-vector-pack.js ARCHIVE OUTPUT INPUT_DIR...");assemble(archive,inputs,out);}
 catch(e){console.error(e.message);process.exitCode=1;}
}
