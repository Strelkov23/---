const assert=require('node:assert/strict'),S=require('./sme-matrix.js');
const d={regions:[{region:'77',difference:0,imported:10},{region:'71',difference:-1,imported:9}],declared:[{region:'77',class:'01',count:2},{region:'77',class:'62',count:8},{region:'71',class:'01',count:9}],reported:[]};
assert.equal(S.rows(d,'77','declared')[0].class,'62');assert.equal(S.rows(d,'77','declared')[0].share,80);assert.equal(S.rows(d,'71','declared').length,0);assert.throws(()=>S.rows(d,'77','bad'));
