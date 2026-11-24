const assert=require('node:assert/strict'),M=require('./sme-map.js');
assert.equal(M.key('77'),'RU-MOW');assert.equal(M.key('72'),null);assert.equal(M.key('99'),null);
const feature=c=>({properties:{iso_3166_2:c}}),rows=[{code:'77'},{code:'78'},{code:'72'}];
assert.equal(M.join(rows,[feature('RU-MOW'),feature('RU-SPE'),feature('RU-SPE'),feature('RU-TYU')]).size,1);
console.log('SME map tests passed');