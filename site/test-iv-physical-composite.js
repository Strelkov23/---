const A=require('node:assert/strict'),C=require('./iv-physical-composite.js'),d=require('./independent-physical.json');const w=[20,20,20,20,20];const r=C.calculate(d,2025,2023,w,true);A.equal(r.complete,true);A.ok(Math.abs(r.index-100-r.items.reduce((s,x)=>s+x.contribution,0))<1e-8);A.equal(C.calculate(d,2023,2023,w,true).index,100);A.equal(C.calculate(d,2020,2023,w,true).index,null);A.equal(C.calculate(d,2025,2023,[0,0,0,0,0]).index,null);A.ok(Math.abs(C.calculate(d,2025,2023,[0,0,100,0,0],true).index-100*1115.8/1232.2)<1e-8);A.throws(()=>C.calculate(d,2025,2023,[20,-1,20,20,20]));console.log('IV physical composite checks passed');
A.equal(C.calculate(d,2025,2023,w).index,null);A.equal(C.calculate(d,2025,2023,w).blocked,true);A.equal(C.calculate(d,2025,2023,w).pending,1);const verified={...d,companies:d.companies.map(c=>({...c,verification:'source_rechecked'}))};A.equal(C.calculate(verified,2023,2023,w).index,100);

A.equal(C.calculate(d,2025,2023,[20,20,0,20,0]).complete,true);A.equal(C.calculate(d,2025,2023,[20,20,0,20,0]).pending,0);

A.equal(C.calculate(d,2025,2023,[20,20,20,20,0]).complete,true);A.equal(C.calculate(d,2025,2023,[20,20,20,20,0]).pending,0);

A.equal(C.calculate(d,2024,2023,w).complete,true);A.equal(C.calculate(d,2024,2023,w).pending,0);A.equal(C.calculate(d,2024,2025,w).blocked,true);
