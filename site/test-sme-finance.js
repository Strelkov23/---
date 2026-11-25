const assert=require('node:assert/strict'),S=require('./sme-finance.js');
const d={declared:[{region:'77',class:'01',sme_total:10,income_sum:'9007199254740993',income_observations:4},{region:'71',class:'01',sme_total:5,income_sum:null,income_observations:0},{region:'50',class:'01',sme_total:5,income_sum:'0',income_observations:1}]};
const r=S.compare(d,'declared','01','income');assert.deepEqual(r.map(x=>x.region),['77','50','71']);assert.equal(r[0].coverage,40);assert.equal(r[2].value,null);assert.equal(S.fmt(null,'income'),'—');assert.equal(S.fmt('0','income'),'0,00');

const cells=[{region:'77',sme_total:10,matched:8,observations:4,coverage:40,value:'9007199254740993'},{region:'50',sme_total:5,matched:2,observations:1,coverage:20,value:'0'},{region:'71',sme_total:5,matched:0,observations:0,coverage:0,value:null}];
assert.deepEqual(S.select(cells,30).map(r=>r.region),['77']);
assert.deepEqual(S.select(cells,0,'region').map(r=>r.region),['50','71','77']);
assert.deepEqual(S.select(cells,0,'coverage').map(r=>r.region),['77','50','71']);
assert.deepEqual(S.select(cells,0,'matched').map(r=>r.region),['77','50','71']);
assert.deepEqual(S.summary(cells),{total:20,matched:10,observations:5,coverage:25,known:2,sum:'9007199254740993'});
assert.equal(S.summary([cells[1]]).sum,'0');
assert.equal(S.summary([cells[2]]).sum,null);
assert.equal(S.summary([]).coverage,null);
assert.equal(S.summary([]).sum,null);
assert.throws(()=>S.select(cells,101));
assert.throws(()=>S.select(cells,0,'invalid'));
assert.equal(S.summary([{...cells[0],value:'-3'},{...cells[1],value:'2'}]).sum,'-1');
