const assert=require('node:assert/strict');
const R=require('./regional-disparities.js');
let s=R.stats([1,2,3,4]);assert.equal(s.median,2.5);assert.equal(s.p10,1.3);assert.equal(s.p90,3.7);assert.equal(s.gini,.25);
assert.equal(R.stats([0,0]).gini,null);assert.equal(R.stats([-1,2]).cv,null);assert.ok(Math.abs(R.stats([0,1,2]).ratio-9)<1e-10);
const rows=[{region:'г. Москва',year:2020,value:1},{region:'Санкт-Петербург',year:2020,value:2},{region:'Российская Федерация',year:2020,value:3},{region:'Архангельская область',year:2020,value:4},{region:'Ненецкий автономный округ',year:2020,value:5},{region:'Москва',year:2021,value:6}];
assert.equal(R.sample(rows.filter(r=>r.year===2020)).out.size,3);assert.equal(R.panel(rows,[2020,2021],true).common,1);assert.equal(R.panel(rows,[2020,2021],true).years[0].stats.n,1);
assert.equal(R.sample([{region:'Москва',value:1},{region:'г. Москва',value:2}]).out.size,0);
assert.equal(R.pearson([{x:1,y:2},{x:2,y:4},{x:3,y:6}]),1);assert.equal(R.pearson([{x:1,y:2},{x:1,y:4},{x:1,y:6}]),null);
console.log('Regional dispersion tests passed');
