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

const base={region:a,level:'Регион',okato:'1',oktmo:'2',version:'v20260313',group:'coal',year:2022,value:100,share:20,localization:1.5};
const end={...base,year:2024,value:150,share:25,localization:2};
assert.deepEqual(M.changeBetween(base,end),{from:2022,to:2024,valueDelta:50,nominalChange:50,shareDelta:5,localizationDelta:.5});
assert.equal(M.changeBetween(base,{...end,okato:'3'}),null);
assert.equal(M.changeBetween(base,{...end,group:'heat'}),null);
assert.equal(M.changeBetween({...base,value:0},end).nominalChange,null);
assert.equal(M.changeBetween(base,{...end,value:null,share:null}).shareDelta,null);
assert.equal(M.changeBetween(end,base),null);

const profile=M.regionalProfile(full,'московская область',2024,S.sample);
assert.equal(profile.length,6);
assert.equal(M.profileFilter(profile,'','specialized').length,3);
assert.equal(M.profileFilter(profile,'D','specialized')[0].group,'heat');
assert.equal(M.profileFilter(profile,'B','all').length,2);
assert.equal(M.profileFilter(profile,'','missing').length,0);
assert.equal(profile.filter(x=>x.isTotal).length,3);
const absent=M.regionalProfile(full,'unknown region',2024,S.sample);
assert.equal(M.profileFilter(absent,'','missing').length,6);
assert.equal(M.profileFilter(absent,'','specialized').length,0);
assert.ok(absent.every(r=>r.observation===null));
const zero=M.regionalProfile(full,'свердловская область',2024,S.sample);
assert.equal(zero.find(r=>r.group==='light').observation.localization,0);
assert.ok(!M.profileFilter(zero,'','missing').some(r=>r.group==='light'));
console.log('Full regional profile: section scope, specialization, missing and zero OK');

const past=full.rows.map(x=>({...x,year:2022,row:++row,value:x.group==='light'&&x.region===a?20:x.value}));
const dset={groups,rows:[...full.rows,...past]};
const territories=[{key:'московская область',name:a,code:'RU-MOS'},{key:'свердловская область',name:b,code:'RU-SVE'},{key:'unknown',name:'Нет данных'}];
const changes=M.regionalChanges(dset,'light',2022,2024,territories,S.sample);
assert.equal(changes[0].delta.shareDelta,10);
assert.equal(changes[1].delta.shareDelta,0);
assert.equal(changes[2].delta,null);
assert.equal(M.orderChanges(changes,'shareDelta','asc')[0].key,'свердловская область');
assert.equal(M.orderChanges(changes,'shareDelta','desc','RU-MOS',true).length,1);
assert.equal(M.orderChanges(changes,'shareDelta','desc','',true).length,2);
assert.equal(M.regionalChanges(dset,'light',2024,2022,territories,S.sample).length,0);

const totalRow=r(a,'total',100),part1=r(a,'food',60),part2=r(a,'light',40);
const parts=[{group:'food',title:'Пищевая',observation:part1},{group:'light',title:'Лёгкая',observation:part2}];
let concentration=M.concentration(totalRow,parts,2);
assert.ok(Math.abs(concentration.hhi-.52)<1e-12);
assert.ok(Math.abs(concentration.effective-1/.52)<1e-12);
assert.equal(concentration.topShare,60);
assert.equal(M.concentration(totalRow,parts.slice(0,1),2).hhi,null);
assert.equal(M.concentration(totalRow,[parts[0],{...parts[1],observation:{...part2,edition:'old'}}],2).hhi,null);
assert.equal(M.concentration({...totalRow,value:120},parts,2).hhi,null);
assert.equal(M.concentration({...totalRow,value:100.2},parts,2).hhi,.52);
assert.equal(M.concentration(totalRow,[{...parts[0],observation:{...part1,value:100}},{...parts[1],observation:{...part2,value:0}}],2).hhi,1);
assert.equal(M.concentration({...totalRow,value:0},parts,2).hhi,null);

const old=M.concentration({...totalRow,year:2022},parts.map(p=>({...p,observation:{...p.observation,year:2022}})),2);
const next=M.concentration(totalRow,[{...parts[0],observation:{...part1,value:40}},{...parts[1],observation:{...part2,value:60}}],2);
const shifted=M.structuralShift({...old,total:{...totalRow,year:2022}},{...next,total:totalRow});
assert.equal(shifted.distance,20);assert.ok(Math.abs(shifted.hhiDelta)<1e-12);assert.equal(shifted.parts.reduce((s,p)=>s+p.delta,0),0);
assert.equal(M.structuralShift({...old,total:{...totalRow,year:2022}},{...next,total:{...totalRow,okato:'changed'}}).distance,null);
assert.equal(M.structuralShift({...old,total:{...totalRow,year:2022}},{...next,total:totalRow,hhi:null}).distance,null);
assert.equal(M.concentrationRows(full,'C',2024,territories,S.sample)[0].expected,13);

const gc=M.geographicConcentration({rows:[r(country,'light',100),r(a,'light',60),r(b,'light',20),r('Томская область','light',null)]},'light',2024,S.sample);
assert.equal(gc.coverage,80);assert.equal(gc.known,2);assert.equal(gc.missing,1);assert.equal(gc.hhi,.625);assert.equal(gc.cr3,100);assert.equal(gc.ranked[0].nationalShare,60);assert.equal(gc.ranked[0].sampleShare,75);
assert.equal(M.geographicConcentration({rows:[r(country,'light',100),r(a,'light',101)]},'light',2024,S.sample).hhi,null);
assert.equal(M.geographicConcentration({rows:[r(country,'light',100),r(a,'light',50,{edition:'old'})]},'light',2024,S.sample).hhi,null);
assert.equal(M.geographicConcentration({rows:[r(country,'light',100),r(a,'light',30),r(a,'light',30)]},'light',2024,S.sample).ambiguous,1);

// Shift-share reconciles two endpoint observations and retains true zero bases.
const ss0={...base,editionOK:true,value:100,total:200,national:1000,nationalTotal:5000,nationalShare:20,share:50};
const ss1={...ss0,year:2024,value:160,total:300,national:1300,nationalTotal:5500,nationalShare:1300/55,share:160/3};
const ss=M.shiftShare(ss0,ss1);
for(const [key,expected] of Object.entries({sectionEffect:10,industryEffect:20,regionalEffect:30,actual:60,residual:0}))assert.ok(Math.abs(ss[key]-expected)<1e-10,key);
assert.equal(M.shiftShare(ss0,{...ss1,editionOK:false}),null);
assert.equal(M.shiftShare(ss0,{...ss1,okato:'different'}),null);
assert.equal(M.shiftShare({...ss0,national:0},ss1),null);
assert.equal(M.shiftShare({...ss0,value:0,share:0},ss1).regionalEffect,160);
assert.equal(M.shiftShare(ss0,{...ss1,value:null}),null);
assert.equal(M.shiftShare(ss0,{...ss1,value:0,share:0,national:0,nationalShare:0}).actual,-100);
assert.equal(M.shiftShare(ss0,{...ss1,value:1400}),null);
console.log('Shift-share: reconciliation, territorial matching, zero and missing data OK');

const signal=M.relativeSignal({first:ss0,shiftShare:ss},10);assert.ok(Math.abs(signal.score-30)<1e-9);assert.equal(signal.bin,4);
for(const [score,bin] of [[-20,0],[-10,1],[-9,2],[0,2],[9,2],[10,3],[20,4]])assert.equal(M.relativeSignal({first:{value:100},shiftShare:{regionalEffect:score}},10).bin,bin);
assert.deepEqual(M.relativeSignal({first:{value:0},shiftShare:ss},10),{score:null,bin:-1});assert.equal(M.relativeSignal({first:ss0,shiftShare:null},10).bin,-1);assert.equal(M.relativeSignal({first:ss0,shiftShare:ss},0).bin,-1);
