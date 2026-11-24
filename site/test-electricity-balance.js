const assert=require('node:assert/strict'),E=require('./electricity-balance.js');
const a={electricity_generation_twh:100,electricity_net_imports_twh:-10,electricity_demand_twh:90};
assert.equal(E.metrics(a).gap,0);
assert.ok(E.metrics(a).netShare<0);
assert.equal(E.scenario(a,{g:0,d:0,n:0}).gap,0);
assert.equal(E.scenario(a,{g:-10,d:0,n:0}).gap,-10);
assert.equal(E.metrics({}).gap,null);
assert.equal(E.metrics({...a,electricity_demand_twh:0}).netShare,null);
assert.throws(()=>E.scenario({...a,electricity_demand_twh:80},{g:0,d:0,n:0}));

const fuelKeys=['coal','oil','gas'];
assert.equal(E.fuelSummary({coal:20,oil:30,gas:50},{coal:10,oil:30,gas:40},fuelKeys).growth,25);
assert.equal(E.fuelSummary({coal:20,oil:30},{},fuelKeys).total,null);
assert.equal(E.fuelSummary({coal:0,oil:0,gas:0},{},fuelKeys).shares.coal,null);
assert.equal(E.fuelSummary({coal:20,oil:30,gas:50},{},fuelKeys).growth,null);
