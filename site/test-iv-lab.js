const assert=require('node:assert/strict'),L=require('./iv-lab.js');const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
let r=L.calc('labour',{output:10,productivity:10,wage:7,prices:7});near(r[0],0);near(r[1],0);
r=L.calc('basket',{foodshare:40,serviceshare:50,food:12,goods:6,services:9});near(r[0],9.3);near(r[1],30);
r=L.calc('basket',{foodshare:100,serviceshare:100,food:20,goods:0,services:0});near(r[0],20);near(r[1],0);
r=L.calc('budget',{income:35,expenses:40,gdp:200});near(r[0],-5);near(r[1],-2.5);
assert.throws(()=>L.calc('budget',{income:35,expenses:40,gdp:0}));assert.throws(()=>L.calc('labour',{output:NaN,productivity:10,wage:7,prices:7}));assert.throws(()=>L.calc('unknown',{}));console.log('IV lab: all checks passed');
