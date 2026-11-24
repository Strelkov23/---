const assert=require('node:assert/strict'),d=require('./dynamic-plan.js');
const m={names:['A','B'],output:[100000,100000],demand:[100000,100000],imports:[10000,10000],effects:[[100000,0],[0,100000]]};
const p={years:3,spare:0,investment:10,capitalRatio:1,depreciation:0,importLimit:100,allocation:'gap',growth:[5,5]};
let r=d.calculate(m,p);
assert.equal(r[0].alpha,0);assert.equal(r[0].investment,10);assert.equal(r[1].available,10);assert.ok(r[1].alpha>0&&r[1].alpha<1);
assert.equal(r[2].available,20);assert.ok(r[2].groups.every(g=>g.realized<=g.available+1e-9));
r=d.calculate(m,{...p,spare:100,importLimit:0});assert.equal(r[0].alpha,0);assert.equal(r[0].importBinding,true);
r=d.calculate(m,{...p,growth:[0,0]});assert.equal(r[0].alpha,1);assert.equal(r[0].investment,0);assert.equal(r[0].unusedInvestment,10);
r=d.calculate(m,{...p,allocation:'output',depreciation:50});assert.equal(r[2].available,15);
assert.throws(()=>d.calculate(m,{...p,growth:[-1,5]}));
const fs=require('node:fs'),path=require('node:path');
const balancePath=path.join(__dirname,'sectors.json');
if(fs.existsSync(balancePath)){
 const real=JSON.parse(fs.readFileSync(balancePath,'utf8'));
 assert.equal(real.names.length,19);
 const rr=d.calculate(real,{...p,spare:5,investment:1000,importLimit:500,capitalRatio:3,years:5,growth:real.names.map(()=>3)});
 assert.equal(rr.length,5);
 assert.ok(rr.every(r=>r.alpha>=0&&r.alpha<=1&&r.actualImport<=500+1e-7));
 assert.ok(rr.every(r=>r.groups.every(g=>g.realized<=g.available+1e-7*Math.max(1,g.available))));
 console.log('Verified actual balance dimensions and feasible five-period scenario');
}
console.log('Dynamic plan tests passed');
