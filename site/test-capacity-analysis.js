const assert=require('node:assert/strict'),M=require('./capital-data.js');
const rows=[0,25,50,75,90,100,null,NaN,101,-1].map((v,i)=>({code:String(i),title:'Product '+i,utilization_pct:v,change_pp:i%2?i:null}));
const d=M.distribution(rows);
assert.equal(d.total,10);assert.equal(d.valid,6);assert.equal(d.missing,4);assert.equal(d.min,0);assert.equal(d.max,100);
assert.deepEqual(d.bins.map(b=>b.count),[1,1,1,1,2]);
assert.deepEqual(M.sorted(rows.slice(0,6),'low').map(r=>r.utilization_pct),[0,25,50,75,90,100]);
assert.deepEqual(M.sorted(rows.slice(0,6),'change').map(r=>r.change_pp),[5,3,1,null,null,null]);
assert.equal(M.distribution([]).min,null);assert.equal(M.distribution([]).max,null);
console.log('Capacity analysis tests passed');

const r=(code,year,u,status='same_published_label',other={})=>({code,title:code,group:'G',year,utilization_pct:u,comparison_status:status,coverage:'scope',source:'edition',...other});
const sample=[r('high',2022,90,'first_year'),r('high',2023,92),r('high',2024,95),r('low',2022,30),r('low',2023,40),r('low',2024,0),r('gap',2022,20),r('gap',2024,20),r('change',2022,20),r('change',2023,20,'definition_changed'),r('change',2024,20),r('missing',2022,30),r('missing',2023,30),r('current',2022,20),r('current',2023,50),r('current',2024,91),r('dup',2022,20),r('dup',2023,20),r('dup',2023,20),r('dup',2024,20)];
const by=Object.fromEntries(M.capacitySignals(sample,2024,3,50,90,85).map(x=>[x.code,x]));
assert.equal(by.high.state,'persistent-high');assert.ok(by.high.headroom<0);assert.equal(by.low.state,'persistent-low');assert.equal(by.low.headroom,null);assert.equal(by.gap.state,'incomplete');assert.equal(by.change.state,'incomplete');assert.equal(by.missing.state,'missing');assert.equal(by.current.state,'current-high');assert.equal(by.dup.state,'incomplete');
assert.equal(M.capacitySignals([r('a',2023,25),r('a',2024,50)],2024,2,50,90,100)[0].headroom,100);
assert.equal(M.capacitySignals([r('a',2023,25,'same_published_label',{coverage:'other'}),r('a',2024,30)],2024,2,50,90,85)[0].comparable,false);
assert.throws(()=>M.capacitySignals(sample,2024,3,90,50,85));console.log('Capacity signals: persistent classes, gaps, definition change, duplicates and target headroom OK');
