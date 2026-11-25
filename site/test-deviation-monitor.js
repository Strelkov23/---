const assert=require('node:assert/strict'),M=require('./deviation-monitor.js');
const p={direction:'higher',mode:'absolute',warning:1,critical:3,streak:2,asOf:2026};
const rows=[{year:2021,target:10,fact:9},{year:2022,target:10,fact:7},{year:2023,target:10,fact:null},{year:2024,target:10,fact:8},{year:2026,target:10,fact:6},{year:2027,target:10,fact:0}];
let r=M.classify(rows,p);assert.deepEqual(r.rows.map(x=>x.status),['warning','critical','missing','warning','critical','future']);assert.deepEqual(r.rows.map(x=>x.run),[1,2,0,1,1,0]);assert.equal(r.persistent,1);
r=M.classify([{year:2021,target:0,fact:5},{year:2022,target:-10,fact:-13}],{...p,direction:'exact',mode:'relative'});assert.equal(r.rows[0].status,'undefined');assert.equal(r.rows[1].metric,30);
r=M.classify([{year:2021,target:3,fact:0},{year:2022,target:3,fact:5}],{...p,direction:'lower'});assert.deepEqual(r.rows.map(x=>x.status),['normal','warning']);
assert.equal(M.classify([{year:2021,target:10,fact:null,incompatible:true}],p).rows[0].status,'incompatible');
assert.throws(()=>M.classify(rows,{...p,critical:1}));assert.throws(()=>M.classify([...rows,rows[0]],p));
console.log('Deviation monitor: direction, thresholds, streak, gaps, future and zero targets OK');