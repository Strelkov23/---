const assert=require('node:assert/strict'),B=require('./bank-directory.js');
const d={datasets:{system:{rows:[{registration_number:'1',name:'А',source_row:1}]},full:{rows:[{registration_number:'1',name:'А',license_status:'Действующая',source_row:2},{registration_number:'2',name:'Б',license_status:'Ликвидация',source_row:3}]}}};
assert.equal(B.rows(d,'system','','')[0].fullRow,2);
assert.equal(B.rows(d,'active','','').length,1);
assert.equal(B.rows(d,'full','','2')[0].system,false);
assert.equal(B.rows(d,'system','Ликвидация','').length,0);
assert.equal(B.rows({datasets:{...d.datasets,system:{rows:[]}}},'full','','')[0].system,null);
