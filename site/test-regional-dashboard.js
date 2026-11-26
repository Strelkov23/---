const assert=require('node:assert/strict'),D=require('./regional-dashboard.js'),S=require('./regional-disparities.js');
const r=(region,value,year=2024)=>({region,value,year});
const a={values:[r('Москва',10),r('Томская область',0),r('Омская область',10),r('Российская Федерация',1000),r('Москва',999,2023)]},b={values:[r('Москва',-5),r('Томская область',15)]};
let x=D.summarize(a,2024,['москва','томская область','неизвестный'],S.sample,S.stats);
assert.equal(x.median,10);assert.equal(x.n,3);assert.equal(x.regions[0].rank,1);assert.equal(x.regions[1].rank,3);assert.equal(x.regions[1].delta,-10);assert.equal(x.regions[2].row,null);
const common=D.common([a,b],2024,S.sample);assert.equal(common.size,2);
x=D.summarize(a,2024,['москва'],S.sample,S.stats,common);assert.equal(x.median,5);assert.equal(x.n,2);
x=D.summarize(b,2024,['москва'],S.sample,S.stats);assert.equal(x.regions[0].delta,-10);
assert.equal(D.summarize(a,2025,['москва'],S.sample,S.stats).median,null);
assert.equal(D.summarize(a,2024,['москва'],S.sample,S.stats,new Set()).n,0);
assert.equal(D.matches({code:D.specs[0][1],title:D.specs[0][2],unit:'wrong'},D.specs[0]),false);
console.log('Regional dashboard: exact year, independent medians, balanced sample and ties OK');

const opts=[{name:'Москва',iso:'RU-MOW',key:'москва'},{name:'Томская область',iso:'RU-TOM',key:'томская область'},{name:'Омская область',iso:'RU-OMS',key:'омская область'},{name:'Нет данных',key:'unknown'}];
const calc=[{result:D.summarize(a,2024,opts.map(o=>o.key),S.sample,S.stats)}];
assert.deepEqual(D.matrixRows(opts,calc,'','0','asc').map(x=>x.key),['томская область','москва','омская область','unknown']);
assert.equal(D.matrixRows(opts,calc,'RU-MOW').length,1);
assert.equal(D.matrixRows(opts,calc,'','name','desc','value',common).length,2);
assert.equal(D.matrixRows(opts,calc,'','name','desc','value',new Set()).length,0);

assert.equal(D.percentile([0,10,10],10),100*2/3);
assert.equal(D.percentile([0,10,10],0),100*.5/3);
assert.equal(D.percentile([],0),null);
const paired=D.matrixRows(opts,[...calc,{result:D.summarize(b,2024,opts.map(o=>o.key),S.sample,S.stats)}]);
assert.equal(D.pair(paired,0,1,S.pearson).rows.length,2);
assert.equal(D.pair(paired,0,1,S.pearson).correlation,null);
assert.equal(D.pair(paired,0,0,S.pearson).rows.length,0);

const M=require('./macro-diagnostics.js');
const note='source · Подраздел источника: labor · Издание: 2025 · Версия: 1 · Уровень территории: Регион · ОКТМО: 1 · ОКАТО: 2';
const hist=[0,1,3,6,10,15,21,121].map((value,i)=>({...r('Москва',value,2010+i),note}));
const ss=D.regionalSignals({values:hist},opts.slice(0,1),2017,10,3.5,'points',S.sample,M.assessChange)[0];
assert.equal(ss.status,'signal');assert.equal(ss.delta,100);assert.equal(ss.history.length,6);
const broken=hist.map(x=>x.year===2016?{...x,note:note.replace('ОКАТО: 2','ОКАТО: 3')}:x);
assert.equal(D.regionalSignals({values:broken},opts.slice(0,1),2017,10,3.5,'points',S.sample,M.assessChange)[0].delta,null);
assert.equal(D.scope({note:'missing'}),null);
const rel=D.regionalSignals({values:hist},opts.slice(0,1),2017,10,3.5,'relative',S.sample,M.assessChange)[0];
assert.ok(Math.abs(rel.delta-100*(121/21-1))<1e-9);
assert.equal(rel.history.length,5);

assert.equal(D.signalClass({score:4,status:'signal'}),'above');assert.equal(D.signalClass({score:-4,status:'signal'}),'below');assert.equal(D.signalClass({score:1,status:'ordinary'}),'ordinary');assert.equal(D.signalClass({score:null}),'missing');
const geo=['A','B','B','C','D'].map(iso_3166_2=>({properties:{iso_3166_2}}));const mapped=D.mapSignals(geo,[{key:'A',score:4,status:'signal'},{key:'B',score:-4,status:'signal'},{key:'C',score:null}],id=>id==='D'?null:id);assert.deepEqual(mapped.map(x=>x.category),['above','unmatched','unmatched','missing','unmatched']);

const panel={tagName:'DETAILS',open:false,contains:e=>e===panel||e===nested||e===child};const nested={tagName:'DETAILS',open:false,parentElement:panel},child={tagName:'DIV',parentElement:nested},outside={tagName:'DIV'};
const lookup=id=>({ 'geo-dashboard':panel,'gd-signals':nested,'gd-sig-table':child,'outside':outside }[id]);
assert.equal(D.reveal(panel,'#outside',lookup),false);assert.equal(panel.open,false);assert.equal(D.reveal(panel,'#%',lookup),false);assert.equal(D.reveal(panel,'#geo-dashboard',lookup),true);assert.equal(panel.open,true);assert.equal(nested.open,false);panel.open=false;assert.equal(D.reveal(panel,'#gd-sig-table',lookup),true);assert.equal(panel.open,true);assert.equal(nested.open,true);
