const assert=require('node:assert/strict'),B=require('./bank-capital.js');
const r=B.ranked([{registration_number:'2',capital:'100'},{registration_number:'1',capital:'100'},{registration_number:'3',capital:'-1'}]);assert.deepEqual(r.map(x=>x.registration_number),['1','2','3']);assert.deepEqual(r.map(x=>x.rank),[1,1,3]);
