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

const money={files:[{url:'https://rosstat.gov.ru/a.xls',sha256:'x',review:{kind:'reviewed_partial_cost',coverage:[{year:2021},{year:2022},{year:2023}]},rows:[{title:'A',metric:'cost_amount_total',year:2021,unit:'млн руб.',value:0,source:'https://rosstat.gov.ru/a.xls'},{title:'A',metric:'cost_amount_total',year:2023,unit:'млн руб.',value:10,source:'https://rosstat.gov.ru/a.xls'}]}]};
assert.deepEqual(C.monetarySeries(money,'A','cost_amount_total').values,[0,null,10]);
assert.throws(()=>C.monetarySeries({files:[]},'A','cost_amount_total'));
assert.throws(()=>C.monetarySeries(money,'A','cost_labor'));
assert.throws(()=>C.monetarySeries({files:[{...money.files[0],rows:[...money.files[0].rows,money.files[0].rows[0]]}]},'A','cost_amount_total'));
console.log('Monetary cost series: explicit gaps, zero, duplicate and scope checks passed');
