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

assert.equal(M.passportTheme('chemical'),'chemical');
assert.equal(M.passportTheme('industry'),'manufacturing');
assert.equal(M.passportTheme('ict'),'digital');
assert.equal(M.passportTheme('prices'),null);
const F=require('./sector-passports.js').financeDelta;
const profitCurrent={year:2025,local_code:'20',metric:'sales',sign:'numeric',value:25.9},profitPrev={...profitCurrent,year:2024,value:27.6};
assert.equal(F(profitCurrent,[profitPrev]),-1.7);
assert.equal(F({...profitCurrent,value:0},[{...profitPrev,value:0}]),0);
assert.equal(F(profitCurrent,[{...profitPrev,sign:'negative_unspecified',value:null}]),null);
assert.equal(F({...profitCurrent,sign:'negative_unspecified',value:null},[profitPrev]),null);
assert.equal(F(profitCurrent,[{...profitPrev,year:2023}]),null);
assert.equal(F(profitCurrent,[{...profitPrev,local_code:'21'}]),null);
assert.equal(F(profitCurrent,[{...profitPrev,metric:'assets'}]),null);
assert.equal(F(profitCurrent,[profitPrev,profitPrev]),null);

const regionRow=(code,unit,value,year=2024,region='Московская область')=>({code,unit,r:{region,year,value}});
const profile=[
 regionRow('R_88230ed30f2f2738_bf6a5a3983','В фактически действовавших ценах, миллионов рублей',200),
 regionRow('GRP_95b8dd2585','млн руб.',1000),
 regionRow('R_65254a01945743d3_1db3db8e79','Тысяч человек',5),
 regionRow('R_77976ed27f49b4fd_28f4b5b380','млн руб.',80),
 regionRow('R_8728bc736516e87c_28f4b5b380','млн руб.',100),
 regionRow('R_88f3fb354016c809_4c391d1044','Число родившихся на 1000 человек населения',7),
 regionRow('R_2308ddd83ecf600c_4c391d1044','Число умерших на 1000 человек населения',10)
];
assert.deepEqual(M.deriveProfile(profile).map(x=>x.value),[20,200000,-20,-3]);
assert.deepEqual(M.deriveProfile([]).map(x=>x.value),[null,null,null,null]);
assert.equal(M.deriveProfile(profile.map((x,i)=>i===1?{...x,r:{...x.r,year:2023}}:x))[0].value,null);
assert.equal(M.deriveProfile(profile.map((x,i)=>i===1?{...x,r:{...x.r,region:'Москва'}}:x))[1].value,null);
assert.equal(M.deriveProfile(profile.map((x,i)=>i===2?{...x,r:{...x.r,value:0}}:x))[1].value,null);
assert.equal(M.deriveProfile(profile.map((x,i)=>i===3?{...x,unit:'млрд руб.'}:x))[2].value,null);
assert.equal(M.deriveProfile(profile.map((x,i)=>i===5?{...x,r:{...x.r,value:0}}:x))[3].value,-10);

const P=require('./sector-passports.js');
const product='Химия, фармацевтика, резиновые и пластмассовые изделия';
assert.deepEqual(P.relatedBalance('chemical',{names:['Химия',product]}),[{name:product,i:1}]);
assert.deepEqual(P.relatedBalance('pharma',{names:[product,product]}),[]);
assert.deepEqual(P.relatedBalance('light',{names:['Пищевая промышленность']}),[]);
const reg=[{code:'MFG_total_099b62c9d9'},{code:'MFG_chemical_099b62c9d9'},{code:'MFG_food_099b62c9d9'},{code:'legacy',title:'химическая промышленность'}];
assert.deepEqual(P.relatedRegional('chemical',reg).map(r=>r.code),['MFG_chemical_099b62c9d9']);
assert.deepEqual(P.relatedRegional('pharma',reg).map(r=>r.code),['MFG_chemical_099b62c9d9']);
assert.deepEqual(P.relatedRegional('food',reg).map(r=>r.code),['MFG_food_099b62c9d9']);

const cap={assets:[{code:'C',year:2024},{code:'D',year:2024},{code:'A',year:2023}],capacity:[{code:'acid',year:2024},{code:'refining',year:2024},{code:'tires',year:2024},{code:'cotton',year:2024},{code:'coal',year:2024},{code:'acid',year:2023}]};
assert.deepEqual(P.capitalRows('chemical',cap,2024).products.map(r=>r.code),['acid']);
assert.deepEqual(P.capitalRows('chemical',cap,2024).assets,[]);
assert.deepEqual(P.capitalRows('manufacturing',cap,2024).assets.map(r=>r.code),['C']);
assert.deepEqual(P.capitalRows('manufacturing',cap,2024).products.map(r=>r.code),['acid','refining','tires','cotton']);
assert.deepEqual(P.capitalRows('mining',cap,2024).products.map(r=>r.code),['coal']);
assert.deepEqual(P.capitalRows('materials',cap,2024).products.map(r=>r.code),['tires']);
assert.deepEqual(P.capitalRows('light',cap,2024).products.map(r=>r.code),['cotton']);
assert.deepEqual(P.capitalRows('pharma',cap,2024),{assets:[],products:[]});
assert.deepEqual(P.capitalRows('energy',cap,2024).assets.map(r=>r.code),['D']);
assert.deepEqual(P.capitalRows('chemical',cap,2023).products.map(r=>r.year),[2023]);

{const M=require('./regional-map.js');const ys=M.availableYears([{year:2022,value:0},{year:2020,value:1},{year:2021,value:null},{year:2022,value:2},{year:2023,value:NaN}]);require('node:assert/strict').deepEqual(ys,[2020,2022]);require('node:assert/strict').equal(M.temporalPosition(ys,2020),0);require('node:assert/strict').equal(M.temporalPosition(ys,2021),1);}

{const M=require('./regional-map.js'),A=require('node:assert/strict');let r=M.regionalInsight({year:2024,value:20},{year:2023,value:10},[10,20,20,40,NaN],'руб.');A.equal(r.median,20);A.equal(r.rank,2);A.equal(r.count,4);A.equal(r.change.delta,100);A.equal(M.regionalInsight(null,null,[0,1],'%').rank,null);r=M.regionalInsight({year:2024,value:0},{year:2022,value:10},[0,0,4],'руб.');A.equal(r.relative,null);A.equal(r.change,null);A.equal(r.rank,2);r=M.regionalInsight({year:2024,value:98},null,[98,102], '%',true);A.equal(r.change.delta,-2);A.equal(r.median,100);}

{const M=require('./regional-map.js'),A=require('node:assert/strict');A.equal(M.periodChange(120,100),20);A.ok(Math.abs(M.periodChange(120,100,true)-20)<1e-9);A.equal(M.periodChange(10,0,true),null);A.equal(M.periodChange(null,10),null);A.equal(M.periodChange(-5,-10),5);A.deepEqual([-6,-5,0,5,6,null].map(v=>M.changeBin(v,5)),[0,1,2,3,4,-1]);}
