const A=require('node:assert/strict'),S=require('./iv-energy-structure.js');
const v={total:100,coal:20,gas:30,other_fossil:0,nuclear:20,hydro:20,wind:5,solar:5,bioenergy:0,other_renewables:0};
let r=S.profile(v);A.equal(r.complete,true);A.equal(r.hhi,2150);A.equal(r.fossil,50);A.equal(r.renewables,30);A.equal(r.residual,0);
let missing={...v};delete missing.other_fossil;r=S.profile(missing);A.equal(r.complete,false);A.equal(r.hhi,null);A.equal(r.fossil,null);A.equal(r.coverage,100);
A.equal(S.profile({...v,gas:50}).consistent,false);A.equal(S.profile({total:0}).coverage,null);
r=S.compare([{year:2020,values:v},{year:2025,values:{...v,gas:20,wind:15}}],2025,2020,5);A.equal(r.shift,10);A.equal(r.flagged,2);A.equal(r.totalChange,0);
A.equal(S.compare([{year:2020,values:v},{year:2025,values:missing}],2025,2020).shift,null);
console.log('IV energy structure checks passed');
if(process.argv[2]){const d=require(require('node:path').resolve(process.argv[2]));const results=d.rows.map(x=>S.profile(x.values));A.ok(results.length>=5);A.ok(results.some(x=>x.total!==null));console.log('Live energy structure: years',results.length,'consistent',results.filter(x=>x.consistent).length,'complete',results.filter(x=>x.complete).length,'missing categories', [...new Set(results.flatMap(x=>x.missing))].join(', '));}
