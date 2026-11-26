const assert=require('node:assert/strict'),D=require('./literature-delivery.js');
const packed={schema:'literature-delivery-v1',encoding:'rows',meta:{registry:{}},shapes:[['journal','title'],['title']],strings:['J'],dictionary_fields:['journal'],rows:[[0,0,'A'],[0,null,'B'],[1,'C']]};
assert.deepEqual(D.decode(packed),{registry:{},articles:[{journal:'J',title:'A'},{journal:null,title:'B'},{title:'C'}]});
assert.throws(()=>D.decode({...packed,rows:[[0,99,'A']]}));
assert.throws(()=>D.decode({...packed,rows:[[1,'C','extra']]}));
assert.deepEqual(D.decode({schema:packed.schema,encoding:'plain',data:{articles:[]}}),{articles:[]});
