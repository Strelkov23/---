const assert=require('node:assert/strict'),R=require('./data-registry.js');
const rows=[{id:'a',title:'Объём производства стали',code:'24',unit:'тонны',group:'industry',mode:'auto',count:12},{id:'b',title:'Износ основных фондов',code:'C',group:'capital',mode:'manual',count:3},{id:'c',title:'Резервы',group:'national',mode:'auto',count:0}];
const p={q:'',group:'',mode:'',availability:'',onlySelected:false};
assert.deepEqual(R.filter(rows,{...p,q:'объем стали'},new Set()).map(x=>x.id),['a']);
assert.deepEqual(R.filter(rows,{...p,mode:'manual'},new Set()).map(x=>x.id),['b']);
assert.deepEqual(R.filter(rows,{...p,availability:'empty'},new Set()).map(x=>x.id),['c']);
assert.deepEqual(R.filter(rows,{...p,onlySelected:true},new Set(['b'])).map(x=>x.id),['b']);
const w={id:'wdi:A',group:'wdi',code:'A',title:'A',territory:'Россия',unit:'%',source:'https://example.org',count:2};
assert.deepEqual(R.observations(w,{A:{values:{2020:1,2021:0,2022:null}}}).map(x=>x.value),[1,0]);
assert.throws(()=>R.observations({...w,count:3},{A:{values:{2020:1,2021:0}}}));
const f={...w,group:'forecast',count:1};
const v=R.observations(f,{series:[{code:'A',last:'2025',source:w.source,results:[{target:'2026',point:3,low:1,high:5,horizon:1,selected:'last'}]}]})[0];
assert.equal(v.kind,'Расчётная экстраполяция');assert.equal(v.low,1);assert.equal(v.high,5);
const a={...w,group:'capital',code:'C.wear_pct',count:1};
assert.equal(R.observations(a,{assets:[{code:'C',year:2024,wear_pct:54.4},{code:'D',year:2024,wear_pct:51.6}]}).at(0).value,54.4);
console.log('Deterministic registry search and observations export tests passed');

assert.deepEqual(R.filter(rows,{...p,exactId:"b"},new Set()).map(x=>x.id),["b"]);
assert.deepEqual(R.filter([{...rows[0],method_level:"source"},{...rows[1],method_level:"explained"}],{...p,methodLevel:"source"},new Set()).map(x=>x.id),["a"]);
