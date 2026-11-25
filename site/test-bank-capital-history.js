const assert=require('node:assert/strict'),H=require('./bank-capital-history.js');
assert.equal(H.delta('100','120'),20);assert.equal(H.delta('100','80'),-20);assert.equal(H.delta('0','100'),null);assert.equal(H.delta(null,'100'),null);
assert.equal(H.series({snapshots:{'2026-01-01':[{registration_number:'1',capital:'10'}],'2025-01-01':[]}},'1')[0].record,null);
