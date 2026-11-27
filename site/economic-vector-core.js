/* Server-built research TITLE embeddings. No abstract/full-text ingestion. */
"use strict";
const MODEL=Object.freeze({id:"Xenova/paraphrase-multilingual-MiniLM-L12-v2",revision:"7e3d5398ff67a776281d0a27b2d47a964d5bfffb",runtime:"@xenova/transformers@2.17.2",dimension:384,pooling:"mean",normalize:true,quantized:true,input:"title-v1-600"});
const SHARDS=64,MAX=512,KINDS=new Set(["paper","external","web"]);
function identity(d){return JSON.stringify([d.kind,d.href]);}
function bucket(d){
 let h=2166136261;
 for(const c of identity(d)){h=Math.imul(h^c.codePointAt(0),16777619)>>>0;}
 return h%SHARDS;
}
function eligible(d){
 return d&&KINDS.has(d.kind)&&typeof d.title==="string"&&d.title.trim()&&d.title.length<=350&&typeof d.href==="string"&&d.href.length<=2048&&/^https?:\/\/[^\s/@]+(?:\/|$)/.test(d.href)&&!/[\\\s]/.test(d.href);
}
function targets(index,shard){
 if(index?.schema!==1||!Array.isArray(index.docs)||!Number.isInteger(shard)||shard<0||shard>=SHARDS)throw Error("Invalid input index or shard");
 const seen=new Set(),out=[];
 for(const d of index.docs){
  if(!eligible(d))continue;
  const key=identity(d);if(seen.has(key))throw Error("Duplicate research identity");seen.add(key);
  if(bucket(d)===shard)out.push({kind:d.kind,href:d.href,title:d.title});
 }
 out.sort((a,b)=>identity(a)<identity(b)?-1:identity(a)>identity(b)?1:0);
 if(out.length>MAX)throw Error("Shard exceeds bounded capacity");
 return out;
}
function vectorOK(v){
 return Array.isArray(v)&&v.length===MODEL.dimension&&v.every(Number.isFinite)&&Math.abs(Math.hypot(...v)-1)<.001;
}
function digestOK(v){return typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);}
function reusable(prior,shard){
 const map=new Map();
 if(!prior)return map;
 if(prior.schema!==1||prior.scope!=="research-title-only"||prior.shard!==shard||prior.shards!==SHARDS||!digestOK(prior.source_sha256)||!prior.model||Object.keys(prior.model).length!==Object.keys(MODEL).length||Object.keys(MODEL).some(k=>prior.model[k]!==MODEL[k])||!Array.isArray(prior.rows)||prior.rows.length>MAX)throw Error("Invalid prior vector shard");
 for(const r of prior.rows){
  const key=identity(r);
  if(!eligible(r)||bucket(r)!==shard||map.has(key)||!vectorOK(r.vector))throw Error("Invalid prior vector row");
  map.set(key,r);
 }
 return map;
}
async function build(index,shard,source,encode,prior=null){
 if(!digestOK(source)||typeof encode!=="function")throw Error("Invalid source or encoder");
 const docs=targets(index,shard),rows=[],previous=reusable(prior,shard);
 for(const d of docs){
  const old=previous.get(identity(d));
  const v=old?.title===d.title?old.vector:Array.from(await encode(d.title.slice(0,600)));
  if(!vectorOK(v))throw Error("Invalid model embedding");
  rows.push({...d,vector:v.map(x=>Math.round(x*1e7)/1e7)});
 }
 const result={schema:1,model:{...MODEL},source_sha256:source,shard,shards:SHARDS,scope:"research-title-only",rows};
 validate(result,index,source,shard);return result;
}
function validate(d,index,source,expectedShard){
 if(d?.schema!==1||!digestOK(source)||d.source_sha256!==source||d.scope!=="research-title-only"||d.shards!==SHARDS||d.shard!==expectedShard||!Array.isArray(d.rows)||!d.model||Object.keys(d.model).length!==Object.keys(MODEL).length||Object.keys(MODEL).some(k=>d.model[k]!==MODEL[k]))throw Error("Invalid vector shard identity");
 const expected=targets(index,expectedShard);
 if(d.rows.length!==expected.length)throw Error("Incomplete shard");
 for(const [i,row] of d.rows.entries())if(identity(row)!==identity(expected[i])||row.title!==expected[i].title||!vectorOK(row.vector))throw Error("Invalid vector row");
 return true;
}
function rank(query,shards,index,source,limit=20){
 if(!vectorOK(query)||!Array.isArray(shards)||shards.length>SHARDS||!Number.isInteger(limit)||limit<1||limit>50)throw Error("Invalid vector query");
 const seen=new Set(),rows=[],norm=Math.hypot(...query);
 for(const d of shards){if(seen.has(d.shard))throw Error("Duplicate shard");seen.add(d.shard);validate(d,index,source,d.shard);
  for(const r of d.rows){const similarity=Math.max(-1,Math.min(1,r.vector.reduce((s,v,i)=>s+v*query[i],0)/(norm*Math.hypot(...r.vector))));rows.push({kind:r.kind,href:r.href,title:r.title,similarity});}}
 return {searched:rows.length,shards:seen.size,complete:seen.size===SHARDS,rows:rows.sort((a,b)=>b.similarity-a.similarity|| (identity(a)<identity(b)?-1:1)).slice(0,limit)};
}
function catalog(index,source,parts){
 if(!digestOK(source)||!Array.isArray(parts)||parts.length>SHARDS)throw Error("Invalid catalogue input");
 const expected=Array.from({length:SHARDS},(_,i)=>targets(index,i).length),seen=new Set(),entries=[];
 for(const p of parts){
  if(!p||!p.data||!p.receipt)throw Error("Missing shard receipt");
  const d=p.data,r=p.receipt,i=d.shard;
  if(seen.has(i))throw Error("Duplicate shard");seen.add(i);validate(d,index,source,i);
  const name="research-title-shard-"+String(i).padStart(2,"0")+".json";
  if(r.schema!==1||r.source_sha256!==source||r.shard!==i||r.rows!==d.rows.length||r.file!==name||!digestOK(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1||!r.model||Object.keys(r.model).length!==Object.keys(MODEL).length||Object.keys(MODEL).some(k=>r.model[k]!==MODEL[k]))throw Error("Invalid receipt");
  entries.push({shard:i,file:name,rows:r.rows,sha256:r.sha256,bytes:r.bytes});
 }
 entries.sort((a,b)=>a.shard-b.shard);
 const missing=Array.from({length:SHARDS},(_,i)=>i).filter(i=>!seen.has(i)),total=expected.reduce((a,b)=>a+b,0),indexed=entries.reduce((a,b)=>a+b.rows,0);
 return {schema:1,scope:"research-title-only",model:{...MODEL},source_sha256:source,shards:SHARDS,complete:missing.length===0,total,indexed,entries,missing};
}
module.exports={MODEL,SHARDS,MAX,identity,bucket,eligible,targets,vectorOK,build,validate,rank,catalog,reusable};
