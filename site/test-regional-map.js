const assert=require('node:assert/strict'),M=require('./regional-map.js');
assert.equal(M.key('RU-MOW'),'москва');
assert.equal(M.key('RU-ARK'),null);
assert.equal(M.key('UA-43'),null);
assert.ok(M.project(100,65).every(v=>Math.abs(v)<1e-10));
const a=M.project(180,65),b=M.project(-180,65);
assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-10));
assert.deepEqual(M.classes([3,3,3]),[3]);
assert.equal(M.bin(3,[3]),0);
assert.equal(M.bin(null,[1,2]),-1);
assert.equal(M.bin(3,[1,2,4]),1);
console.log('Regional map tests passed');
assert.equal(M.theme('GRP_PC_95b8dd2585'),'economy');
assert.equal(M.theme('R_347ab451705a6d33_031d7fe105'),'industry');
assert.equal(M.theme('unknown'),'all');
assert.equal(M.isGrowth('GRP_PC_VOLUME_95b8dd2585'),true);
assert.equal(M.isGrowth('GRP_PC_95b8dd2585'),false);
assert.deepEqual([94,95,99,100,101,105,106,null].map(M.growthBin),[0,1,1,2,3,3,4,-1]);

assert.equal(M.displayName('RU-TYU','Tyumen'),'Тюменская область');
assert.equal(M.key('RU-TYU'),null);
assert.equal(M.displayName('RU-MOW','Moscow'),'Москва');
assert.equal(M.displayName('XX','Original'),'Original');

const sample=values=>({out:new Map(values.map(r=>[r.region,r]))}),observations=[{region:'москва',year:2022,value:10},{region:'москва',year:2024,value:15},{region:'томская область',year:2023,value:20}];
assert.equal(M.profileObservation(observations,'москва',2023,sample).value,10);
assert.equal(M.profileObservation(observations,'москва',2024,sample).value,15);
assert.equal(M.profileObservation(observations,'москва',2021,sample),null);
assert.equal(M.profileObservation(observations,null,2024,sample),null);

assert.equal(M.theme('new','https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_13_socio_economic_102_v20260313.zip'),'agriculture');
assert.equal(M.theme('new','https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_16_socio_economic_102_v20260313.zip'),'transport');
