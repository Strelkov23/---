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
 console.log('Provenance exact-byte verification passed');
})().catch(e=>{console.error(e);process.exitCode=1});
