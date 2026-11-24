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

const industrySource='https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_12_socio_economic_102_v20260313.zip';
assert.equal(M.industryTheme('Индексы производства: производство текстильных изделий',industrySource),'light');
assert.equal(M.industryTheme('Индексы производства: производство химических веществ',industrySource),'chemical');
assert.equal(M.industryTheme('Производство химических веществ','https://example.org/'),null);
assert.equal(M.industryTheme('Производство текстильных изделий и производство химических веществ',industrySource),null);
assert.ok(M.palette('light')[4]!==M.palette('chemical')[4]);
assert.deepEqual(M.palette('light','auto',true),M.palette('chemical','contrast',true));
assert.equal(M.theme('new',industrySource,'Объем отгруженных товаров: металлургическое производство'),'metal');

assert.deepEqual(M.trend({year:2024,value:110},{year:2023,value:100},'млн руб.'),{type:'relative',delta:10,base:100,year:2023});
assert.deepEqual(M.trend({year:2024,value:4},{year:2023,value:6},'%'),{type:'points',delta:-2,base:6,year:2023});
assert.deepEqual(M.trend({year:2024,value:103},null,'%',true),{type:'index',delta:3,base:100,year:2024});
assert.equal(M.trend({year:2024,value:100},{year:2022,value:80},'руб.'),null);
assert.equal(M.trend({year:2024,value:100},null,'руб.'),null);
assert.equal(M.trend({year:2024,value:5},{year:2023,value:0},'руб.').type,'absolute');

assert.equal(M.theme('new','https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_farming_102_v20260313.zip','Валовой сбор зерна'),'agriculture');
assert.equal(M.industryTheme('Индексы производства: производство химических веществ','https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_industry_102_v20260313.zip'),'chemical');

const cat=[{code:'x',source:industrySource,title:'Индексы производства: производство химических веществ',last:2024,regions:96},{code:'GRP_PC_95b8dd2585',last:2023,regions:95}];
assert.deepEqual(M.coverage(cat,'chemical'),{count:1,latest:2024,maxRegions:96});
assert.deepEqual(M.coverage(cat,'light'),{count:0,latest:null,maxRegions:null});
assert.equal(M.coverage(cat,'industry').count,1);
assert.equal(M.coverage(cat,'all').count,2);
assert.equal(M.isGrowth('new','Индексы производства','В процентах к предыдущему году'),true);
assert.equal(M.isGrowth('new','Доля организаций','%'),false);

const testItems=[{code:'a',value:10},{code:'b',value:20},{code:'c',value:20},{code:'d',value:null},{code:'z',value:0}];
assert.deepEqual(M.compareRows(testItems,['a','b','b','d']).map(x=>[x.code,x.rank,x.difference,x.ratio]),[['a',3,0,100],['b',1,10,200],['d',null,null,null]]);
assert.equal(M.compareRows(testItems,['z','a'])[1].ratio,null);
assert.equal(M.compareRows(testItems,['','a'])[0].difference,null);
assert.equal(M.compareRows(testItems,['d','a'])[1].ratio,null);

const addedThemes={'03':'living','09':'capital','17':'ict','20':'prices','21':'foreign_trade'};
const themeSources=Object.keys(addedThemes).map(n=>({code:'new-'+n,title:'Test',source:industrySource.replace('data_12_','data_'+n+'_'),last:2024,regions:96}));
for(const [n,id] of Object.entries(addedThemes)){
 const s=themeSources.find(s=>s.code==='new-'+n);
 assert.equal(M.theme(s.code,s.source,s.title),id);
 assert.equal(M.coverage(themeSources,id).count,1);
 assert.equal(M.palette(id).length,5);
 assert.notEqual(M.palette(id)[4],M.palette('all')[4]);
}
assert.equal(new Set(Object.values(addedThemes).map(id=>M.palette(id)[4])).size,5);

const sectorSource='https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_industry_102_v20260313.zip';
const a1={code:'a1',source:sectorSource,title:'Индексы производства: производство химических веществ',unit:'В процентах к предыдущему году',last:2024,count:1000};
const a2={code:'a2',source:sectorSource,title:'Объем отгруженных товаров: производство химических веществ',unit:'млн руб.',last:2024,count:1500};
const a3={code:'a3',source:sectorSource,title:'Индексы производства: производство химических веществ',unit:'В процентах к предыдущему году',last:2023,count:3000};
assert.deepEqual(M.rankProfileCandidates([a1,a2,a3],'chemical').map(s=>s.code),['a1','a2','a3']);
assert.equal(M.chooseProfileObservation([{m:a1,r:null},{m:a2,r:{year:2024,value:0}},{m:a3,r:{year:2023,value:105}}]).m.code,'a2');
assert.equal(M.chooseProfileObservation([{m:a2,r:{year:2024,value:100}},{m:a1,r:{year:2024,value:105}}]).m.code,'a1');
assert.equal(M.chooseProfileObservation([{m:a1,r:{year:2023,value:105}},{m:a2,r:{year:2024,value:100}}]).m.code,'a2');
assert.equal(M.chooseProfileObservation([{m:a1,r:null},{m:a2,r:{year:2024,value:null}}]),null);
