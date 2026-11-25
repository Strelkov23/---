const assert=require('node:assert/strict'),S=require('./sector-passports.js');
const m={names:['A','B','C'],flows:[[1,2,3],[4,5,6],[7,8,9]]};
let x=S.chain(m,1,'inputs');assert.equal(x.total,15);assert.deepEqual(x.rows.map(r=>r.value),[8,5,2]);assert.equal(x.rows[0].share,8/15);
x=S.chain(m,1,'outputs',false);assert.equal(x.total,10);assert.deepEqual(x.rows.map(r=>r.value),[6,4]);assert.equal(x.rows[0].share,.6);
assert.equal(S.chain(m,0,'inputs',false).total,11);
assert.equal(S.chain({names:['A'],flows:[[0]]},0,'inputs').rows[0].share,null);
assert.equal(S.chain({names:['A','B'],flows:[[2,0],[-1,0]]},0,'inputs').valid,false);
assert.throws(()=>S.chain(m,3,'inputs'));assert.throws(()=>S.chain(m,0,'other'));
const real=require('./sectors.json');for(let i=0;i<real.names.length;i++)for(const dir of ['inputs','outputs']){const r=S.chain(real,i,dir);assert.equal(r.rows.length,19);if(r.valid)assert.ok(Math.abs(r.rows.reduce((s,x)=>s+x.share,0)-1)<1e-9);}
console.log('Sector chain tests passed');

const n=S.network(m,1,true,1);
assert.equal(n.inputs.top[0].value,8);assert.equal(n.inputs.remaining,7);assert.equal(n.inputs.remainingCount,2);
assert.equal(n.outputs.top[0].value,6);assert.equal(n.outputs.remaining,9);
for(const side of [n.inputs,n.outputs])assert.ok(Math.abs(side.topShare+side.remainingShare-1)<1e-12);
assert.equal(S.network({names:['A'],flows:[[0]]},0).inputs,null);
assert.equal(S.network(m,1,false,1).inputs.total,10);
for(let i=0;i<real.names.length;i++){const n=S.network(real,i,true,5);for(const side of [n.inputs,n.outputs])if(side)assert.ok(Math.abs(side.topShare+side.remainingShare-1)<1e-9);}
