const assert=require('node:assert/strict'),D=require('./macro-diagnostics.js');
assert.equal(D.rules.length,13);assert.equal(D.value(10,20,'ratio100'),50);assert.equal(D.value(4,0,'ratio'),null);assert.equal(D.value(4,-2,'ratio'),null);assert.equal(D.value(null,2,'diff'),null);assert.equal(D.value(-4,2,'diff'),-6);
const r={a:'a',b:'b',op:'diff'},data={a:{values:{2020:5,2022:0}},b:{values:{2020:2,2021:1,2022:3}}};
assert.deepEqual(D.compute(r,data,2020,2022),[{year:2020,a:5,b:2,value:3},{year:2022,a:0,b:3,value:-3}]);
console.log('Macro diagnostics tests passed');
const snap=D.snapshot({[D.rules[0].a]:{values:{2020:5}},[D.rules[0].b]:{values:{2020:2}}},2020);assert.equal(snap[0].current.value,3);assert.equal(snap[0].change,null);assert.equal(snap.length,13);
assert.deepEqual(D.capacitySummary([{year:2024,utilization_pct:91},{year:2024,utilization_pct:40},{year:2024,utilization_pct:null},{year:2023,utilization_pct:99}],2024),{total:3,valid:2,high:1,low:1});

const history=[0,1,3,6,10,15,21,121].map((value,i)=>({year:2010+i,value}));let signal=D.changeSignals(history,2017,2017,10,3.5)[0];assert.equal(signal.status,'signal');assert.equal(signal.delta,100);assert.equal(signal.history.length,6);assert.equal(signal.median,3.5);assert.equal(signal.mad,1.5);assert.ok(signal.score>40);
assert.equal(D.changeSignals(history.filter(r=>r.year!==2016),2017,2017)[0].status,'missing');assert.equal(D.changeSignals(history,2013,2013)[0].status,'short');assert.equal(D.changeSignals(Array.from({length:8},(_,i)=>({year:2010+i,value:i})),2017,2017)[0].status,'constant');assert.equal(D.changeSignals([...history,{year:2017,value:999}],2017,2017)[0].status,'missing');
