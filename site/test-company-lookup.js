
const assert=require('node:assert/strict'),C=require('./company-lookup.js');
assert.equal(C.validInn('7707083893'),true);
assert.equal(C.validInn('7707083894'),false);
assert.equal(C.path('7707083893'),'company-index/inn-'+String(7707083893%512).padStart(3,'0')+'.json.gz');
assert.throws(()=>C.path('../bad'));
const r=['7707083893','А','А','9007199254740993',null,0,0,1,2,3];
assert.equal(C.row([r],'7707083893').income_cents,'9007199254740993');
assert.equal(C.row([r],'7707083893').workers,0);
assert.equal(C.row([r],'7704211201'),null);
assert.throws(()=>C.row([r,r],'7707083893'));

const name=C.path(r[0]),idx={files:{[name]:{count:1}},members:{income:['x'],employment:['x','y','z']}};
assert.equal(C.validateBlock([r],idx,name)[0][0],r[0]);
assert.throws(()=>C.validateBlock([[...r.slice(0,3),1,...r.slice(4)]],idx,name));
assert.throws(()=>C.validateBlock([[...r.slice(0,5),-1,...r.slice(6)]],idx,name));
assert.throws(()=>C.validateBlock([r],{...idx,members:{income:[],employment:[]}},name));
const rec={...C.row([r],r[0]),rank:1};
const rep={rankings:{income:{eligible:10,rows:[rec]},employment:{eligible:20,rows:[{...rec,rank:1}]}}};
assert.deepEqual(C.rankMatches(rep,r[0]).matches,{income:{rank:1,eligible:10},employment:{rank:1,eligible:20}});
assert.equal(C.rankMatches(rep,'7704211201').record,null);
assert.throws(()=>C.rankMatches({rankings:{income:rep.rankings.income,employment:{eligible:20,rows:[{...rec,workers:2}]}}},r[0]));
