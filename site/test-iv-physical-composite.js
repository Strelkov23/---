const A=require('node:assert/strict'),C=require('./iv-physical-composite.js'),d=require('./independent-physical.json');const w=[20,20,20,20,20];const r=C.calculate(d,2025,2023,w,true);A.equal(r.complete,true);A.ok(Math.abs(r.index-100-r.items.reduce((s,x)=>s+x.contribution,0))<1e-8);A.equal(C.calculate(d,2023,2023,w,true).index,100);A.equal(C.calculate(d,2020,2023,w,true).index,null);A.equal(C.calculate(d,2025,2023,[0,0,0,0,0]).index,null);A.ok(Math.abs(C.calculate(d,2025,2023,[0,0,100,0,0],true).index-100*1115.8/1232.2)<1e-8);A.throws(()=>C.calculate(d,2025,2023,[20,-1,20,20,20]));console.log('IV physical composite checks passed');
A.equal(C.calculate(d,2025,2023,w).index,null);A.equal(C.calculate(d,2025,2023,w).blocked,true);A.equal(C.calculate(d,2025,2023,w).pending,1);const verified={...d,companies:d.companies.map(c=>({...c,verification:'source_rechecked'}))};A.equal(C.calculate(verified,2023,2023,w).index,100);

A.equal(C.calculate(d,2025,2023,[20,20,0,20,0]).complete,true);A.equal(C.calculate(d,2025,2023,[20,20,0,20,0]).pending,0);

A.equal(C.calculate(d,2025,2023,[20,20,20,20,0]).complete,true);A.equal(C.calculate(d,2025,2023,[20,20,20,20,0]).pending,0);

A.equal(C.calculate(d,2024,2023,w).complete,true);A.equal(C.calculate(d,2024,2023,w).pending,0);A.equal(C.calculate(d,2024,2025,w).blocked,true);

A.deepEqual(C.verifiedPreset(d,2025,2023),[20,20,20,20,0]);A.deepEqual(C.verifiedPreset(d,2024,2023),w);A.deepEqual(C.verifiedPreset(d,2020,2023),[0,0,20,0,0]);
const four=C.calculate(d,2025,2023,C.verifiedPreset(d,2025,2023));const sens=C.sensitivity(four);A.equal(sens.trials.length,4);A.ok(sens.min<=four.index&&sens.max>=four.index);A.equal(C.sensitivity(C.calculate(d,2025,2023,w)),null);A.equal(C.sensitivity(C.calculate(d,2025,2023,[0,0,100,0,0])).trials.length,0);A.ok(sens.trials.every(t=>Number.isFinite(t.index)));
const synthetic={complete:true,items:[{title:'A',weight:.25,index:80},{title:'B',weight:.75,index:120}]};A.deepEqual(C.sensitivity(synthetic),{trials:[{title:'A',index:120},{title:'B',index:80}],min:80,max:120});
