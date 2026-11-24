const assert=require('node:assert/strict'),D=require('./macro-diagnostics.js');
assert.equal(D.rules.length,13);assert.equal(D.value(10,20,'ratio100'),50);assert.equal(D.value(4,0,'ratio'),null);assert.equal(D.value(4,-2,'ratio'),null);assert.equal(D.value(null,2,'diff'),null);assert.equal(D.value(-4,2,'diff'),-6);
const r={a:'a',b:'b',op:'diff'},data={a:{values:{2020:5,2022:0}},b:{values:{2020:2,2021:1,2022:3}}};
assert.deepEqual(D.compute(r,data,2020,2022),[{year:2020,a:5,b:2,value:3},{year:2022,a:0,b:3,value:-3}]);
console.log('Macro diagnostics tests passed');