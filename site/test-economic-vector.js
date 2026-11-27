"use strict";
const A=require("node:assert/strict"),V=require("./economic-vector-core.js");
async function run(){
 const index={schema:1,docs:Array.from({length:250},(_,i)=>({kind:"paper",href:"https://doi.org/10.1234/"+i,title:"Research "+i}))};
 index.docs.push({kind:"news",href:"https://example.org/news",title:"News"});
 const parts=Array.from({length:64},(_,i)=>V.targets(index,i));
 A.equal(parts.flat().length,250);
 A.equal(new Set(parts.flat().map(V.identity)).size,250);
 A.ok(parts.every((r,i)=>r.every(d=>V.bucket(d)===i)));
 A.throws(()=>V.targets(index,64));
 A.throws(()=>V.targets({...index,docs:[...index.docs,index.docs[0]]},0));
 const s=parts.findIndex(r=>r.length>1),sha="a".repeat(64),v=Array.from({length:384},(_,i)=>Number(i===0));
 const d=await V.build(index,s,sha,async()=>v);
 A.equal(d.rows.length,parts[s].length);A.ok(V.validate(d,index,sha,s));
 A.throws(()=>V.validate(d,index,"b".repeat(64),s));
 A.throws(()=>V.validate({...d,rows:d.rows.slice(1)},index,sha,s));
 A.throws(()=>V.validate({...d,model:{...d.model,revision:"wrong"}},index,sha,s));
 A.throws(()=>V.validate({...d,rows:d.rows.map((r,i)=>i===0?{...r,title:"Wrong"}:r)},index,sha,s));
 A.throws(()=>V.validate({...d,rows:d.rows.map((r,i)=>i===0?{...r,vector:Array(384).fill(0)}:r)},index,sha,s));
 const r=V.rank(v,[d],index,sha);A.equal(r.searched,d.rows.length);A.equal(r.complete,false);A.equal(r.rows[0].similarity,1);
 A.throws(()=>V.rank(v,[d,d],index,sha));
 const all=await Promise.all(parts.map((_,i)=>V.build(index,i,sha,async()=>v)));
 A.equal(V.rank(v,all,index,sha).complete,true);A.equal(V.rank(v,all,index,sha).searched,250);
 console.log("18 server vector index checks passed");
}
module.exports=run;
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
