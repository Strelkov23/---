const assert=require('node:assert/strict'),E=require('./electricity.js');
const r={year:2024,values:{generation:110,consumption:100,capacity:20}};
assert.equal(E.scenario(r,0,0).gap,0);
assert.equal(E.scenario(r,-10,0).additional_generation,11);
assert.equal(E.scenario(r,0,0).hours,8784);
assert.equal(E.scenario({...r,year:2025},0,0).hours,8760);
assert.throws(()=>E.scenario(r,-101,0));
console.log('Electricity scenario: calendar hours, baseline residual, bounds passed');
