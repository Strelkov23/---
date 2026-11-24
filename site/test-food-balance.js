const assert=require('node:assert/strict'),F=require('./food-balance.js');
const v={production:100,imports:20,exports:10,stock_change:5,supply:104};
const p={production:0,imports:0,exports:0,supply:0};
assert.equal(F.balance(v),1);assert.equal(F.scenario(v,p).surplus,0);
assert.equal(F.scenario(v,{...p,imports:-100}).additional_import,20);
assert.equal(F.scenario({...v,stock_change:-5,supply:115},p).surplus,0);
assert.throws(()=>F.scenario({...v,supply:90},p));
assert.throws(()=>F.scenario({...v,imports:null},p));
console.log('Food balance sign, zero shock, import loss and missing data passed');
