const assert=require('node:assert/strict'),C=require('./cost-structure.js');
const row={materials:60,labor:20,insurance:5,depreciation:5,other:10,raw:40,fuel:5,energy:2};
const zero=Object.fromEntries(C.keys.map(k=>[k,0]));
assert.equal(C.calculate(row,zero).index,100);
assert.equal(C.calculate(row,{...zero,materials:10}).index,106);
assert.equal(C.calculate(row,{...zero,labor:-100}).index,80);
assert.equal(C.calculate({...row,other:10.1},zero).index,100);
assert.throws(()=>C.calculate(row,{...zero,labor:301}));
assert.throws(()=>C.calculate({...row,materials:61},zero));
console.log('Cost scenario: no double counting, rounding, zero shock, bounds passed');

const detailed=Object.fromEntries(C.detailed.map(k=>[k,0]));
assert.equal(C.calculate(row,{...detailed,fuel:20},'detailed').index,101);
assert.equal(C.calculate(row,{...detailed,raw:10,fuel:10,energy:10,remaining_materials:10},'detailed').index,106);
assert.equal(C.calculate(row,detailed,'detailed').parts.find(p=>p.key==='remaining_materials').original,13);
assert.throws(()=>C.calculate({...row,raw:70},detailed,'detailed'));
