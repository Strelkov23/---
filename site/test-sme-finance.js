const assert=require('node:assert/strict'),S=require('./sme-finance.js');
const d={declared:[{region:'77',class:'01',sme_total:10,income_sum:'9007199254740993',income_observations:4},{region:'71',class:'01',sme_total:5,income_sum:null,income_observations:0},{region:'50',class:'01',sme_total:5,income_sum:'0',income_observations:1}]};
const r=S.compare(d,'declared','01','income');assert.deepEqual(r.map(x=>x.region),['77','50','71']);assert.equal(r[0].coverage,40);assert.equal(r[2].value,null);assert.equal(S.fmt(null,'income'),'—');assert.equal(S.fmt('0','income'),'0,00');
