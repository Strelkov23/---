const assert=require('node:assert/strict'),crypto=require('node:crypto');
if(!globalThis.crypto)globalThis.crypto=crypto.webcrypto;
const P=require('./provenance.js');
(async()=>{
 const data=new TextEncoder().encode('{"x":1}'),hash=crypto.createHash('sha256').update(data).digest('hex');
 const files={'a.json':{sha256:hash,bytes:data.length}},m={schema:'1',files,data_fingerprint:crypto.createHash('sha256').update('a.json\t'+hash+'\t'+data.length+'\n').digest('hex')};
 await P.validateManifest(m);assert.equal(await P.verify(m,'a.json',data),hash);
 await assert.rejects(P.verify(m,'a.json',new TextEncoder().encode('{"x":2}')));
 await assert.rejects(P.validateManifest({...m,data_fingerprint:'0'.repeat(64)}));
 assert.equal(P.validPath('../a.json'),false);assert.equal(P.validPath('regional-data/a.json'),true);
 const csv=new TextEncoder().encode('year,value\n2025,1\n'),csvHash=crypto.createHash('sha256').update(csv).digest('hex');
 const combined={...files,'federal-budget.csv':{sha256:csvHash,bytes:csv.length}};
 const canonical=Object.keys(combined).sort().map(k=>k+'\t'+combined[k].sha256+'\t'+combined[k].bytes+'\n').join('');
 const mixed={schema:'1',files:combined,data_fingerprint:crypto.createHash('sha256').update(canonical).digest('hex')};
 await P.validateManifest(mixed);
 assert.equal(P.validPath('federal-budget.csv'),true);
 assert.equal(P.validPath('other.csv'),false);
 assert.equal(P.validPath('../federal-budget.csv'),false);
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(csv);
  assert.equal((await P.getBytes(mixed,'federal-budget.csv')).sha256,csvHash);
  await assert.rejects(P.get(mixed,'federal-budget.csv'));
  globalThis.fetch=async()=>new Response('changed');
  await assert.rejects(P.getBytes(mixed,'federal-budget.csv'));
 }finally{globalThis.fetch=originalFetch}
 console.log('Provenance exact-byte verification passed');
})().catch(e=>{console.error(e);process.exitCode=1});
