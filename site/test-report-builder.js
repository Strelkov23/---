const assert=require('node:assert/strict'),R=require('./report-builder.js');
const rows=[['2020',100],['2022',150],['2023',0]].map(([period,value])=>({period,value,territory:'Россия',kind:'Наблюдение'}));
const p={start:'2020',end:'2023',territory:'Россия'};
const a=R.describe(rows,p);assert.equal(a.observed,3);assert.equal(a.coverage,75);assert.equal(a.delta,-100);assert.equal(a.growth,-100);assert.equal(a.rows[1].value,null);assert.equal(a.min,0);assert.equal(a.first_observed,'2020');assert.equal(a.last_observed,'2023');assert.equal(a.rows[2].change,null);assert.equal(a.rows[3].change,-150);assert.equal(a.rows[3].growth,-100);
const b=R.describe(rows,{...p,end:'2024'});assert.equal(b.last,null);assert.equal(b.delta,null);assert.equal(b.growth,null);
assert.equal(R.describe(rows,{...p,start:'2021'}).delta,null);
assert.throws(()=>R.describe(rows,{...p,start:'2020-01',end:'2023-01'}));assert.throws(()=>R.describe(rows,{...p,territory:'X'}));assert.throws(()=>R.describe(rows.map(x=>({...x,kind:'Цель'})),p));
assert.equal(R.bibliography([{title:'A',url:'https://a.example'},{title:'A2',url:'https://a.example'},{title:'X',url:'javascript:alert(1)'}]).length,1);
console.log('Report builder: exact endpoints, coverage, missing data, source selection passed');
