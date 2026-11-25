const assert=require('node:assert/strict'),B=require('./bank-balance.js');
assert.deepEqual(B.compare([{registration_number:'1',current:{assets:null}},{registration_number:'2',current:{assets:'0'}},{registration_number:'3',current:{assets:'9007199254740993'}}],'assets').map(r=>r.registration_number),['3','2','1']);
assert.equal(B.share('25','100'),25);assert.equal(B.share(null,'100'),null);assert.equal(B.share('1','0'),null);
