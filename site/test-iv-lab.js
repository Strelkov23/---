const assert=require('node:assert/strict'),L=require('./iv-lab.js');const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
let r=L.calc('labour',{output:10,productivity:10,wage:7,prices:7});near(r[0],0);near(r[1],0);
r=L.calc('basket',{foodshare:40,serviceshare:50,food:12,goods:6,services:9});near(r[0],9.3);near(r[1],30);
r=L.calc('basket',{foodshare:100,serviceshare:100,food:20,goods:0,services:0});near(r[0],20);near(r[1],0);
r=L.calc('budget',{income:35,expenses:40,gdp:200});near(r[0],-5);near(r[1],-2.5);
assert.throws(()=>L.calc('budget',{income:35,expenses:40,gdp:0}));assert.throws(()=>L.calc('labour',{output:NaN,productivity:10,wage:7,prices:7}));assert.throws(()=>L.calc('unknown',{}));console.log('IV lab: all checks passed');

const V6=require('./iv-lab.js');
const exportRows=V6.exportRows('labour',{output:10,productivity:10,wage:10,prices:7});
require('node:assert/strict').equal(exportRows.find(row=>row[0]==='Условный результат')[2],0);
require('node:assert/strict').equal(exportRows.filter(row=>row[0]==='Условная предпосылка').length,4);
require('node:assert/strict').equal(V6.exportRows('budget',{income:35,expenses:40,gdp:200})[4][3],'трлн руб.');
require('node:assert/strict').throws(()=>V6.exportRows('budget',{income:35,expenses:40,gdp:0}));

const S=L.scale;assert.deepEqual(S(0),{bound:1,position:50,left:50,width:0,baseline:null});assert.deepEqual(S(-150,50),{bound:200,position:12.5,left:12.5,width:37.5,baseline:62.5});assert.equal(S(250).position<=100,true);assert.equal(S(-3,100).bound,100);assert.throws(()=>S(Infinity));assert.throws(()=>S(1,NaN));
