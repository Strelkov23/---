const assert=require('node:assert/strict'),B=require('./bank-directory.js');
const d={datasets:{system:{rows:[{registration_number:'1',name:'А',source_row:1}]},full:{rows:[{registration_number:'1',name:'А',license_status:'Действующая',source_row:2},{registration_number:'2',name:'Б',license_status:'Ликвидация',source_row:3}]}}};
assert.equal(B.rows(d,'system','','')[0].fullRow,2);
assert.equal(B.rows(d,'active','','').length,1);
assert.equal(B.rows(d,'full','','2')[0].system,false);
assert.equal(B.rows(d,'system','Ликвидация','').length,0);
assert.equal(B.rows({datasets:{...d.datasets,system:{rows:[]}}},'full','','')[0].system,null);

const disclosure={rows:[{forms:{123:{status:'ok',dates:['2026-10-01','2026-09-01']}}},{forms:{123:{status:'ok',dates:['2026-09-01']}}}]};
assert.deepEqual(B.commonDates(disclosure,'123'),['2026-09-01']);
assert.equal(B.commonDates(disclosure,'101'),null);
assert.equal(B.commonDates({rows:[]},'123'),null);
assert.deepEqual(B.commonDates({rows:[{forms:{123:{status:'ok',dates:[]}}}]},'123'),[]);

const profile=B.profile('1',{capital:{period:'2026-01-01',rows:[{registration_number:'1',capital:'10',source:'a',verification:'html'}]},profit:{period:'2026-Q1',rows:[{registration_number:'1',current:{profit:'0',net_interest:null},source:'b'}]}});
assert.equal(profile.length,2);assert.equal(profile[1].value,'0');assert.equal(profile[1].period,'2026-Q1');assert.equal(B.profile('2',{}).length,0);

const coverage=B.coverage('1',{
 capital:{period:'2026-01-01',rows:[{registration_number:'1',verification:'documentary'}]},
 balance:{period:'2026-01-01',rows:[],attempts:{'1':{checked:'2026-11-25',error:'Нет отчёта'}}},
 profit:{period:'2026-Q1',rows:[],cohort:['2']}
});
assert.deepEqual(coverage.map(c=>c.status),['Документальная сверка','Не подтверждено','Вне целевой выборки']);
assert.equal(coverage[1].error,'Нет отчёта');
assert.equal(coverage[1].checked,'2026-11-25');
assert.equal(B.coverage('1',{})[0].status,'Набор недоступен');
assert.equal(B.coverage('1',{capital:{rows:[]}})[0].status,'Нет записи');
assert.equal(B.coverage('1',{capital:{rows:[{registration_number:'1',verification:'html'}]}})[0].status,'Запись получена');
assert.equal(B.coverage('1',{capital:{rows:[],errors:[{registration_number:'1',error:'Недоступно'}]}})[0].error,'Недоступно');

const covFeeds={capital:{period:'2026-01-01',target_cohort:['1','2','3','4'],rows:[{registration_number:'1',verification:'html'},{registration_number:'2',verification:'documentary'},{registration_number:'5',verification:'html'}],attempts:{'3':{error:'нет'}}},balance:{period:'2026-01-01',cohort:['1','2','3'],rows:[{registration_number:'1'},{registration_number:'2'}]},profit:{period:'2026-Q1',cohort:['1','2','4'],rows:[{registration_number:'1'},{registration_number:'4'}]}};
const summary=B.coverageSummary(covFeeds);
assert.deepEqual(summary.forms[0],{form:'808',label:'Регуляторный капитал',period:'2026-01-01',target:4,verified:1,documentary:1,failed:1,pending:1,outside:1});
assert.equal(summary.commonTarget,2);
assert.equal(summary.allVerified,1);
assert.equal(summary.forms[1].pending,1);
assert.equal(B.coverageSummary({}).commonTarget,null);
assert.equal(B.coverageSummary({}).forms[0].verified,null);
assert.equal(B.coverageSummary({capital:covFeeds.capital}).allVerified,null);
assert.equal(B.coverageSummary({...covFeeds,profit:{cohort:['9'],rows:[]}}).commonTarget,0);
assert.equal(B.coverageSummary({capital:{target_cohort:['1'],rows:[{registration_number:'1',verification:'html'}],errors:[{registration_number:'1',error:'старое'}]}}).forms[0].failed,0);

assert.deepEqual(summary.distribution,[0,1,0,1]);
assert.equal(B.coverageSummary({}).distribution,null);
assert.deepEqual(B.coverageSummary({...covFeeds,profit:{cohort:['9'],rows:[]}}).distribution,[0,0,0,0]);
assert.deepEqual(B.coverageSummary({capital:{target_cohort:['1'],rows:[{registration_number:'1',verification:'documentary'}]},balance:{cohort:['1'],rows:[]},profit:{cohort:['1'],rows:[]}}).distribution,[1,0,0,0]);

assert.deepEqual(summary.commonRows,[{registration_number:'1',capital:true,balance:true,profit:true,count:3},{registration_number:'2',capital:false,balance:true,profit:false,count:1}]);
assert.equal(B.coverageSummary({}).commonRows,null);
assert.deepEqual(B.coverageSummary({...covFeeds,profit:{cohort:['9'],rows:[]}}).commonRows,[]);
assert.equal(summary.commonRows.reduce((n,r)=>n+r.count,0),summary.distribution.reduce((n,v,i)=>n+i*v,0));
