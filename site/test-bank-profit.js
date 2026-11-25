const assert=require('node:assert/strict'),P=require('./bank-profit.js');
assert.equal(P.change('120','100'),20);assert.equal(P.change('-20','100'),-120);assert.equal(P.change('20','-100'),null);assert.equal(P.change('20',null),null);
assert.equal(P.fee({fee_income:'9007199254740993',fee_expense:'1'}),'9007199254740992');assert.equal(P.fee({fee_income:'1',fee_expense:null}),null);
assert.deepEqual(P.compare([{registration_number:'1',current:{profit:null}},{registration_number:'2',current:{profit:'-5'}},{registration_number:'3',current:{profit:'0'}}],'profit').map(r=>r.registration_number),['3','2','1']);
