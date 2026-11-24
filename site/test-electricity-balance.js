const assert=require('node:assert/strict'),E=require('./electricity-balance.js');
const a={electricity_generation_twh:100,electricity_net_imports_twh:-10,electricity_demand_twh:90};
assert.equal(E.metrics(a).gap,0);
assert.ok(E.metrics(a).netShare<0);
assert.equal(E.scenario(a,{g:0,d:0,n:0}).gap,0);
assert.equal(E.scenario(a,{g:-10,d:0,n:0}).gap,-10);
assert.equal(E.metrics({}).gap,null);
assert.equal(E.metrics({...a,electricity_demand_twh:0}).netShare,null);
assert.throws(()=>E.scenario({...a,electricity_demand_twh:80},{g:0,d:0,n:0}));
