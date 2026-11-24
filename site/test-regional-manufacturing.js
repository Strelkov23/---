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

const groups=[{id:'total',section:'C'},{id:'light',section:'C'},{id:'mining_total',section:'B'},{id:'coal',section:'B'},{id:'energy_total',section:'D'},{id:'heat',section:'D'}];
const extra=[r(country,'mining_total',4000),r(country,'coal',1000),r(a,'mining_total',500),r(a,'coal',250),r(country,'energy_total',2000),r(country,'heat',100),r(a,'energy_total',100),r(a,'heat',10)];
const full={groups,rows:[...rows,...extra]};
for(const [g,n,reg,loc] of [['coal',25,50,2],['heat',5,10,2],['light',10,20,2]]){
 const x=M.calculate(full,g,2024,S.sample),v=x.rows.get('московская область');
 assert.equal(x.nationalShare,n);assert.equal(v.share,reg);assert.equal(v.localization,loc);
}
assert.equal(M.calculate({groups,rows:full.rows.filter(x=>x.group!=='mining_total')},'coal',2024,S.sample).rows.get('московская область').share,null);
assert.equal(M.calculate(full,'mining_total',2024,S.sample).nationalShare,100);
assert.equal(M.calculate(full,'energy_total',2024,S.sample).rows.get('московская область').localization,1);
console.log('Industry atlas: section denominators cannot be interchanged');
