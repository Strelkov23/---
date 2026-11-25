const assert=require('node:assert/strict'),M=require('./capital-data.js');
const rows=[0,25,50,75,90,100,null,NaN,101,-1].map((v,i)=>({code:String(i),title:'Product '+i,utilization_pct:v,change_pp:i%2?i:null}));
const d=M.distribution(rows);
assert.equal(d.total,10);assert.equal(d.valid,6);assert.equal(d.missing,4);assert.equal(d.min,0);assert.equal(d.max,100);
assert.deepEqual(d.bins.map(b=>b.count),[1,1,1,1,2]);
assert.deepEqual(M.sorted(rows.slice(0,6),'low').map(r=>r.utilization_pct),[0,25,50,75,90,100]);
assert.deepEqual(M.sorted(rows.slice(0,6),'change').map(r=>r.change_pp),[5,3,1,null,null,null]);
assert.equal(M.distribution([]).min,null);assert.equal(M.distribution([]).max,null);
console.log('Capacity analysis tests passed');
