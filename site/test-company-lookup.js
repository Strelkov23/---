
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
