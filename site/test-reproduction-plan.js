const assert=require('node:assert/strict'),P=require('./reproduction-plan.js');
const base={year:2025,gdp:100,employment:10},p={years:1,growth:10,productivity:0,laborGrowth:0,capitalRatio:2,depreciation:5,budget:20};
let r=P.calculate(base,p)[0];assert.ok(Math.abs(r.required-30)<1e-9);assert.ok(Math.abs(r.gap-10)<1e-9);assert.ok(Math.abs(r.laborGap-1)<1e-9);
r=P.calculate(base,{...p,growth:-10,depreciation:0})[0];assert.equal(r.required,0);assert.ok(Math.abs(r.surplusRetained-20)<1e-9);
assert.throws(()=>P.calculate(base,{...p,years:0}));
assert.equal(P.baselines({}).length,0);console.log('Reproduction plan tests passed');