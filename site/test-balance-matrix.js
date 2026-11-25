const assert=require('node:assert/strict'),B=require('./balance-matrix.js');
const m={names:['A','B'],flows:[[10,20],[30,40]]};
let d=B.prepare(m);assert.equal(d.cells[0][1].value,20);assert.ok(Math.abs(d.cells[0][1].inputs-100/3)<1e-10);assert.ok(Math.abs(d.cells[0][1].outputs-200/3)<1e-10);
d=B.prepare(m,false);assert.equal(d.cells[0][0].value,null);assert.equal(d.cells[0][1].inputs,100);assert.equal(d.cells[0][1].outputs,100);
assert.equal(B.prepare({names:['A','B'],flows:[[1,-1],[2,3]]}).cells[0][0].outputs,null);
assert.equal(B.band(null,10),'missing');assert.equal(B.band(0,10),'zero');assert.equal(B.band(-1,10),'negative');assert.equal(B.band(10,10),'4');
const real=require('./sectors.json');d=B.prepare(real);assert.equal(d.cells.flat().length,361);
for(let i=0;i<19;i++){if(d.supply[i].valid&&d.supply[i].total>0)assert.ok(Math.abs(d.cells[i].reduce((s,c)=>s+c.outputs,0)-100)<1e-8);if(d.purchase[i].valid&&d.purchase[i].total>0)assert.ok(Math.abs(d.cells.reduce((s,r)=>s+r[i].inputs,0)-100)<1e-8);}
