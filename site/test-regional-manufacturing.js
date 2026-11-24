const assert=require('node:assert/strict'), M=require('./regional-manufacturing.js'), S=require('./regional-disparities.js');
let row=0;
function r(region,group,value,opts={}){return {region,group,value,year:2024,level:region==='Российская Федерация'?'Страна':'Регион',okato:region,oktmo:region,edition:'2025',version:'v20260313',row:++row,...opts}}
const country='Российская Федерация', a='Московская область', b='Свердловская область';
const rows=[r(country,'total',1000),r(country,'light',100),r(a,'total',200),r(a,'light',40),r(b,'total',100),r(b,'light',0)];
let d=M.calculate({rows},'light',2024,S.sample), v=[...d.rows.values()].find(x=>x.region===a);
assert.equal(d.nationalShare,10);assert.equal(v.share,20);assert.equal(v.localization,2);assert.equal(v.countryShare,40);
assert.equal([...d.rows.values()].find(x=>x.region===b).localization,0);
d=M.calculate({rows:[...rows,r(a,'light',50)]},'light',2024,S.sample);assert.equal(d.ambiguous,1);assert.equal([...d.rows.values()].some(x=>x.region===a),false);
d=M.calculate({rows:rows.map(x=>x.region===a&&x.group==='total'?{...x,edition:'old'}:x)},'light',2024,S.sample);assert.equal([...d.rows.values()].find(x=>x.region===a).share,null);
d=M.calculate({rows:rows.map(x=>x.region===a&&x.group==='light'?{...x,value:null}:x)},'light',2024,S.sample);assert.equal([...d.rows.values()].find(x=>x.region===a).localization,null);
assert.equal(M.share(20,10),null);assert.equal(M.quotient(0,10),0);assert.equal(M.quotient(1,0),null);
assert.deepEqual([null,0,.5,1,1.5,2].map(M.localizationBin),[-1,0,1,2,3,4]);
console.log('Manufacturing: exact editions, territorial conflicts, missing values and localization OK');
