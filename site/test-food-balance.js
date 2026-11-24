const assert=require('node:assert/strict'),F=require('./food-balance.js');
const v={production:100,imports:20,exports:10,stock_change:5,supply:104};
const p={production:0,imports:0,exports:0,supply:0};
assert.equal(F.balance(v),1);assert.equal(F.scenario(v,p).surplus,0);
assert.equal(F.scenario(v,{...p,imports:-100}).additional_import,20);
assert.equal(F.scenario({...v,stock_change:-5,supply:115},p).surplus,0);
assert.throws(()=>F.scenario({...v,supply:90},p));
assert.throws(()=>F.scenario({...v,imports:null},p));
console.log('Food balance sign, zero shock, import loss and missing data passed');

assert.equal(F.ratios({production:100,imports:20,exports:10,supply:80}).production_supply,125);
assert.equal(F.ratios({imports:0,supply:80}).import_supply,0);
assert.equal(F.ratios({production:0,exports:0,supply:0}).export_production,null);
assert.equal(F.ratios({imports:null,supply:80}).import_supply,null);
assert.equal(F.ratios({imports:-1,supply:80}).import_supply,null);
const trend=F.timeline([{code:'a',year:2020,values:{production:1}},{code:'a',year:2022,values:{production:2}},{code:'b',year:2010,values:{}}],'a');
assert.equal(trend.length,3);assert.equal(trend[1].year,2021);assert.equal(trend[1].row,undefined);assert.equal(trend[1].ratios.production_supply,null);assert.deepEqual(F.timeline([],'a'),[]);
console.log('Food balance ratios and calendar gaps passed');
