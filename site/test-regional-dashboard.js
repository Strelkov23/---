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
