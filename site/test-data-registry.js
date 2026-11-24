const assert=require('node:assert/strict'),R=require('./data-registry.js');
const rows=[{id:'a',title:'Объём производства стали',code:'24',unit:'тонны',group:'industry',mode:'auto',count:12},{id:'b',title:'Износ основных фондов',code:'C',group:'capital',mode:'manual',count:3},{id:'c',title:'Резервы',group:'national',mode:'auto',count:0}];
const p={q:'',group:'',mode:'',availability:'',onlySelected:false};
assert.deepEqual(R.filter(rows,{...p,q:'объем стали'},new Set()).map(x=>x.id),['a']);
assert.deepEqual(R.filter(rows,{...p,mode:'manual'},new Set()).map(x=>x.id),['b']);
assert.deepEqual(R.filter(rows,{...p,availability:'empty'},new Set()).map(x=>x.id),['c']);
assert.deepEqual(R.filter(rows,{...p,onlySelected:true},new Set(['b'])).map(x=>x.id),['b']);
console.log('Deterministic registry search tests passed');
