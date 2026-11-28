const assert=require('node:assert/strict');const core=require('./global-economic-assistant.js');(function checks(c,assert){
 const r=[{title:"Инвестиции в промышленности",href:"industrial.html"},{title:"Банки",description:"Кредиты",href:"banks.html"},{title:"Сравнение регионов",questions:["где сравнить регионы"],href:"historical.html"}];
 assert(c.rank(r,"помоги найти инвестиции")[0].href==="industrial.html");assert(c.rank(r,"где сравнить регионы")[0].href==="historical.html");assert(c.rank(r,"что как").length===0);assert(c.internal("historical.html#hist-rank"));assert(!c.internal("../index.html"));assert(!c.internal("https://example.org/a"));assert(!c.external("https://a@b.org"));assert(!c.external("javascript:alert(1)"));assert(c.audit("[tool1] [fake]",[{id:"tool1"}]).join(",")==="fake");assert(c.prompt("x",{},[]).length===2)
})(core,assert.ok);console.log('10 global assistant checks passed');

const A=require("node:assert/strict");
A.deepEqual(core.companyCommand("ИНН: 7707083893"),{kind:"inn",value:"7707083893"});
A.deepEqual(core.companyCommand("7707083893"),{kind:"inn",value:"7707083893"});
A.deepEqual(core.companyCommand("компания: ПАО Сбербанк"),{kind:"name",value:"ПАО Сбербанк"});
A.equal(core.companyCommand("найти инвестиции"),null);
A.equal(core.companyCommand("ИНН: 123").kind,"invalid");
A.equal(core.money("9007199254740993"),"90071992547409,93 руб.");
A.equal(core.money("-1"),"−0,01 руб.");
A.equal(core.money(null),"нет данных");
const e=core.companyEvidence({inn:"7707083893",income_name:"Тест",income_cents:"100",expense_cents:null,workers:0},{year:2025,fingerprint:"abc"});
A.equal(e.href,"company-atlas.html?inn=7707083893");A.ok(e.description.includes("численность 0"));
console.log("10 company assistant checks passed");

const CL=require("./company-lookup.js");
A.equal(core.companyCommand("сравнить предприятия: 7707083893, 7704211201").kind,"compare");
A.equal(core.companyCommand("сравнить компании:").kind,"compare");
const cmp=core.comparison(["7707083893","7704211201"],[{status:"fulfilled",value:{inn:"7707083893",income_name:"A",income_cents:"10001",expense_cents:"8000",workers:2}},{status:"fulfilled",value:null}],{year:2025,fingerprint:"a"},CL.calculate,core.money,false);
A.equal(cmp.table.rows[0].values[3],"20,01 руб.");
A.equal(cmp.table.rows[0].values[4],"50,01 руб.");
A.equal(cmp.table.rows[0].values[5],"79,99%");
A.equal(cmp.table.rows[1].state,"missing");
A.equal(cmp.table.rows[1].values[0],"нет данных");
A.equal(cmp.failed,0);
const er=core.comparison(["7707083893","7704211201"],[{status:"rejected"},{status:"fulfilled",value:null}],{year:2025,fingerprint:"a"},CL.calculate,core.money,true);
A.equal(er.failed,1);A.ok(er.table.note.includes("текущей редакции"));
A.throws(()=>core.comparison(["7707083893","7707083893"],[],{year:2025},CL.calculate,core.money,false));
A.throws(()=>core.comparison(["7707083893","7704211201"],[{status:"fulfilled",value:{inn:"7704211201"}},{status:"fulfilled",value:null}],{year:2025},CL.calculate,core.money,false));
console.log("12 company comparison checks passed");

const pr={status:"matched",inn:"7707083893",edition:"2026-11-10",region:"77",declared:"64.19",dver:"2014",reported:null,rver:null,scope:"full_diagnostic"};
const pe=core.profileEvidence(pr,pr.inn);
A.ok(pe.description.includes("64.19"));A.ok(pe.description.includes("отчётный ОКВЭД нет данных"));A.ok(pe.limit.includes("не подтверждает фактическую"));
A.throws(()=>core.profileEvidence(pr,"7704211201"));
A.ok(core.profileEvidence({status:"outside_verified_index"},pr.inn).description.includes("не подтверждает отсутствие"));
A.ok(core.profileEvidence(null,pr.inn).description.includes("недоступен"));
const pr2={...pr,inn:"7704211201"};
A.equal(core.profileComparison([pr,pr2],[pr.inn,pr2.inn]).declared,"same_declared");
A.equal(core.profileComparison([pr,{...pr2,declared:"01.1"}],[pr.inn,pr2.inn]).declared,"different_declared");
A.equal(core.profileComparison([pr,{...pr2,dver:"2001"}],[pr.inn,pr2.inn]).declared,"unknown");
A.equal(core.profileComparison([pr,{...pr2,edition:"2026-10-10"}],[pr.inn,pr2.inn]).declared,"unknown");
A.equal(core.profileComparison([pr,null],[pr.inn,pr2.inn]).declared,"unknown");
console.log("11 company profile checks passed");

const SF=require("./sme-finance.js");
const ix={status:"ready",year:2025,fingerprint:"a"},mx={status:"diagnostic",edition:"2026-11-10",archive_sha256:"b",reference_sha256:"c",declared:[{region:"77",class:"10",count:10},{region:"78",class:"10",count:20}]},rg={period:mx.edition,sha256:"c",rows:[{code:"77",name:"Москва"},{code:"78",name:"Санкт-Петербург"}]};
const sector={status:"diagnostic",financial_year:2025,financial_fingerprint:"a",sme_edition:mx.edition,sme_archive_sha256:"b",reference_sha256:"c",paired_sums_version:1,declared:[{region:"77",class:"10",sme_total:10,matched:8,income_observations:8,income_sum:"10001",paired_money:6,paired_income_sum:"6000",paired_expense_sum:"3000"},{region:"78",class:"10",sme_total:20,matched:10,income_observations:10,income_sum:"20000",paired_money:9,paired_income_sum:"9000",paired_expense_sum:"6000"}]};
A.equal(core.industryCommand("отрасль: 10; доходы; заявительный; охват=70").min,70);
A.equal(core.industryCommand("отрасль: 10; доходы; охват=101").kind,"invalid");
A.equal(core.industryCommand("производство"),null);
const sectorResult=core.industryEvidence(core.industryCommand("отрасль: 10; доходы; охват=70"),sector,ix,mx,rg,SF,core.money);
A.equal(sectorResult.length,2);A.ok(sectorResult[0].description.includes("100,01 руб."));A.ok(sectorResult[0].description.includes("80.00%"));
const pairResult=core.industryEvidence(core.industryCommand("отрасль: 10; доля расходов"),sector,ix,mx,rg,SF,core.money);
A.ok(pairResult[0].description.includes("60,00%"));
A.throws(()=>core.industryEvidence(core.industryCommand("отрасль: 10"),sector,{...ix,year:2024},mx,rg,SF,core.money));
A.throws(()=>core.industryEvidence(core.industryCommand("отрасль: 10"),{...sector,declared:sector.declared.slice(0,1)},ix,mx,rg,SF,core.money));
console.log("9 industry assistant checks passed");

const BM=require("./balance-matrix.js"),CS=require("./chain-stress.js");
const mm={names:Array.from({length:19},(_,i)=>"Группа "+(i+1)),output:Array(19).fill(1000),demand:Array(19).fill(500),imports:Array(19).fill(50),flows:Array.from({length:19},()=>Array(19).fill(10)),effects:Array.from({length:19},(_,i)=>Array.from({length:19},(_,j)=>i===j?1000:10))};
A.deepEqual(core.balanceCommand("мрб: 9"),{kind:"balance",group:9});
A.deepEqual(core.balanceCommand("шок спроса: 9; -2,5%; предел=0"),{kind:"shock",group:9,shock:-2.5,cap:0});
A.equal(core.balanceCommand("шок спроса: 9; 21").kind,"invalid");
A.equal(core.balanceCommand("мрб: 20").kind,"invalid");
A.equal(core.balanceCommand("выпуск"),null);
const bal=core.balanceEvidence(core.balanceCommand("мрб: 9"),mm,BM,CS);
A.equal(bal.length,8);A.ok(bal[0].description.includes("HHI"));
const shock=core.balanceEvidence(core.balanceCommand("шок спроса: 9; 10; предел=0"),mm,BM,CS);
A.ok(shock[0].description.includes("допустимый масштаб 0%"));
A.ok(shock[0].href.includes("stress-shocks="));A.ok(shock[0].limit.includes("не ВВП"));
A.throws(()=>core.balanceEvidence({kind:"balance",group:20},mm,BM,CS));
console.log("11 balance assistant checks passed");

const multi=core.balanceCommand("шоки спроса: 9=10; 2=-2,5; предел=10; предел 9=5");
A.deepEqual(multi,{kind:"multi",shocks:{9:10,2:-2.5},limits:{9:5},cap:10});
A.deepEqual(core.balanceCommand("шоки спроса: 1=0"),{kind:"multi",shocks:{1:0},limits:{},cap:10});
for(const q of ["шоки спроса: 1=1; 01=2","шоки спроса: 20=2","шоки спроса: 1=21","шоки спроса: 1=2; предел 1=-1","шоки спроса: 1=2; предел=10; предел=9","шоки спроса: предел=5","шоки спроса: 1=2;","шоки спроса: 1=2; предел 2=3; предел 02=4"])A.equal(core.balanceCommand(q).kind,"invalid");
const mr=core.balanceEvidence(multi,mm,BM,CS),total=mr.find(r=>r.id==="shock-total"),params=mr.find(r=>r.id==="shock-params");
A.ok(params.description.includes("остальные группы: 0%"));
A.ok(params.description.includes("9: 5%"));
const url=new URL(total.href,"https://example.org/");
const sv=url.searchParams.get("stress-shocks").split(",").map(Number),cv=url.searchParams.get("stress-caps").split(",").map(Number);
A.equal(sv.length,19);A.equal(sv[1],-2.5);A.equal(sv[8],10);A.equal(cv[8],5);A.equal(cv[1],10);
const expected=CS.calculate(mm,sv,cv);
A.ok(total.description.includes((expected.alpha*100).toLocaleString("ru-RU",{maximumFractionDigits:3})+"%"));
A.throws(()=>core.balanceEvidence({kind:"multi",shocks:{20:5},limits:{},cap:10},mm,BM,CS));
console.log("19 multi-sector scenario checks passed");

const RP=require("./resource-plan.js");
const ac=core.allocationCommand("оптимизация: бюджет=1000; импорт=150; вес 9=5; предел 9=5; спрос 2=0");
A.equal(ac.kind,"allocation");A.equal(ac.priority[8],5);A.equal(ac.cap[8],5);A.equal(ac.maxDemand[1],0);A.equal(ac.cap[0],10);A.equal(ac.priority[0],1);
A.equal(core.allocationCommand("оптимизация: бюджет=0; импорт=0").budget,0);
A.equal(core.allocationCommand("ВВП"),null);
for(const q of ["оптимизация: бюджет=1","оптимизация: бюджет=1; импорт=-1","оптимизация: бюджет=1; импорт=1; вес 20=3","оптимизация: бюджет=1; импорт=1; вес 1=2; вес 01=3","оптимизация: бюджет=1; импорт=1; спрос=21","оптимизация: бюджет=1; импорт=1; предел=101","оптимизация: бюджет=1; импорт=1; бюджет=2","оптимизация: бюджет=1; импорт=1; вес=1","оптимизация: бюджет=1; импорт=1; штраф=1,25"])A.equal(core.allocationCommand(q).kind,"invalid");
const alloc=core.allocationEvidence(ac,mm,RP);
A.equal(alloc.length,4);A.ok(alloc[1].description.includes("невязка прямой/двойственной цели"));A.ok(alloc[1].limit.includes("не означает максимум ВВП"));
const au=new URL(alloc[0].href,"https://example.org/");
A.equal(au.searchParams.get("opt-budget"),"1000");A.equal(au.searchParams.get("opt-caps").split(",")[8],"5");
const zeroAlloc=core.allocationEvidence(core.allocationCommand("оптимизация: бюджет=0; импорт=0"),mm,RP);
A.ok(zeroAlloc[1].description.includes("распределение (млрд руб.): нулевое"));
console.log("23 resource allocation assistant checks passed");

const GP=require("./global-plan.js");
const hc=core.horizonCommand("многолетний план: горизонт=3; инвестиции=10; импорт=100; рост=5; рост 9=7; резерв=0; капиталоёмкость=1; выбытие=0; цель=финал");
A.equal(hc.kind,"horizon");A.equal(hc.p.growth[8],7);A.equal(hc.p.growth[0],5);A.equal(hc.objective,"terminal");A.equal(hc.p.labor,null);
A.equal(core.horizonCommand("план"),null);
for(const q of ["многолетний план: инвестиции=1","многолетний план: инвестиции=1; импорт=1; горизонт=16","многолетний план: инвестиции=1; импорт=1; рост 20=3","многолетний план: инвестиции=1; импорт=1; рост 1=2; рост 01=3","многолетний план: инвестиции=1; импорт=1; капиталоёмкость=0","многолетний план: инвестиции=1; импорт=1; цель=сумма; цель=финал"])A.equal(core.horizonCommand(q).kind,"invalid");
const hr=GP.solve(mm,hc.p,hc.objective),he=core.horizonEvidence(hc,mm,hr);
A.equal(he.filter(x=>/^horizon\d+$/.test(x.id)).length,3);A.ok(he[1].description.includes("двойственная граница"));A.ok(he[1].limit.includes("трудовое ограничение отключено"));
const hu=new URL(he[0].href,"https://example.org/");
A.equal(hu.searchParams.get("dyn-growth").split(",")[8],"7");A.equal(hu.searchParams.get("global-objective"),"terminal");
A.throws(()=>core.horizonEvidence(hc,mm,{...hr,upper:hr.score+100}));
console.log("18 horizon assistant checks passed");

const rc=core.robustnessCommand("устойчивость: горизонт=3; инвестиции=10; импорт=100; рост=5; резерв=0; капиталоёмкость=1; выбытие=0; шаг инвестиций=25; шаг импорта=10",core.horizonCommand);
A.equal(rc.kind,"robustness");A.equal(rc.joint.stepA,25);A.equal(rc.joint.stepB,10);
A.equal(core.robustnessCommand("устойчивость: инвестиции=0; импорт=0",core.horizonCommand).joint.stepB,25);
A.equal(core.robustnessCommand("план",core.horizonCommand),null);
for(const q of ["устойчивость: инвестиции=1; импорт=2; шаг импорта=0","устойчивость: инвестиции=1; импорт=2; шаг импорта=101","устойчивость: инвестиции=1; импорт=2; шаг импорта=5; шаг импорта=6","устойчивость: инвестиции=1"])A.equal(core.robustnessCommand(q,core.horizonCommand).kind,"invalid");
const rr=GP.jointSensitivity(mm,rc.p,rc.objective,rc.joint.keyA,rc.joint.stepA,rc.joint.keyB,rc.joint.stepB,rc.joint.mode);
const re=core.robustnessEvidence(rc,rr,core.horizonHref(rc));
A.equal(re.found.length,10);A.equal(re.failed,0);A.ok(re.found[0].description.includes("уникальных сочетаний 9"));A.ok(re.found[0].limit.includes("не вероятность"));
A.throws(()=>core.robustnessEvidence(rc,{...rr,rows:rr.rows.slice(1)},core.horizonHref(rc)));
const bad={...rr,rows:rr.rows.map((x,i)=>i===4?{...x,upper:x.score+100}:x)};
A.throws(()=>core.robustnessEvidence(rc,bad,core.horizonHref(rc)));
const zc=core.robustnessCommand("устойчивость: горизонт=2; инвестиции=0; импорт=0",core.horizonCommand);
const zr=GP.jointSensitivity(mm,zc.p,zc.objective,zc.joint.keyA,zc.joint.stepA,zc.joint.keyB,zc.joint.stepB,zc.joint.mode);
A.equal(core.robustnessEvidence(zc,zr,core.horizonHref(zc)).found.length,2);
console.log("16 robustness assistant checks passed");

const bc=core.bottleneckCommand("узкие места: горизонт=3; инвестиции=10; импорт=100; рост=5; резерв=0; капиталоёмкость=1; выбытие=0; шаг=25",core.horizonCommand);
A.equal(bc.kind,"bottleneck");A.equal(bc.step,25);
A.equal(core.bottleneckCommand("узкие места: инвестиции=1; импорт=2; шаг=0",core.horizonCommand).kind,"invalid");
A.equal(core.bottleneckCommand("узкие места: инвестиции=1; импорт=2; шаг=25; шаг=50",core.horizonCommand).kind,"invalid");
A.equal(core.bottleneckCommand("узкие места: инвестиции=1; импорт=2",core.horizonCommand).step,25);
A.equal(core.bottleneckCommand("план",core.horizonCommand),null);
const bn=GP.bottleneck(mm,bc.p,bc.objective,bc.step);
A.equal(bn.rows.length,5);A.equal(bn.rows.find(x=>x.key==="spare").status,"unchanged");
A.equal(bn.rows.find(x=>x.key==="depreciation").status,"unchanged");
A.ok(bn.rows.filter(x=>x.status==="verified").every(x=>x.delta>=-x.tolerance-bn.baseline.tolerance));
const be=core.bottleneckEvidence(bc,bn,core.horizonHref(bc));
A.equal(be.found.length,6);A.equal(be.failed,0);A.ok(be.found[0].limit.includes("не учитывает стоимость"));
A.throws(()=>core.bottleneckEvidence(bc,{...bn,rows:bn.rows.slice(1)},core.horizonHref(bc)));
A.throws(()=>core.bottleneckEvidence(bc,{...bn,baseline:{...bn.baseline,upper:bn.baseline.score+100}},core.horizonHref(bc)));
A.throws(()=>GP.bottleneck(mm,bc.p,bc.objective,0));
console.log("16 bottleneck assistant checks passed");

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js");
const x={title:"Выпуск",period:"2025",value:120,unit:"руб.",url:"https://example.org/",limit:"Паспорт",checked:"2026-01-01",comparison:{period:"2024",value:100,absolute:20,relativePercent:20}};
A.ok(core.seriesEvidence(x,"fact1").description.includes("относительное изменение 20%"));
A.ok(core.seriesEvidence({...x,comparison:{...x.comparison,relativePercent:null}},"fact1").description.includes("абсолютное изменение 20"));
A.ok(!core.seriesEvidence({...x,comparison:{...x.comparison,relativePercent:null}},"fact1").description.includes("относительное изменение"));
A.ok(core.seriesEvidence({...x,comparison:null},"fact1").description.includes("не подтверждено"));
A.equal(core.seriesEvidence({...x,value:NaN},"fact1"),null);
A.equal(core.seriesEvidence({...x,url:"javascript:alert(1)"},"fact1").href,null);
const row=(period,value,flag="")=>({period,value,flag}),s=(rows,status="ok")=>({rows,status,success:"2026-01-01"}),d={schema:1,unit:"млн евро",source:"https://example.org/",note:"Только товары",series:{MIO_EXP_VAL:s([row("2024",40),row("2025",60,"p"),row("2026",90)]),MIO_IMP_VAL:s([row("2024",60),row("2025",40),row("2026",10)]),MIO_BAL_VAL:s([row("2025",20.1)])}};
const e=core.tradeEvidence(d,2025);A.equal(e.period,"2025");A.ok(e.description.includes("оборот 100"));A.ok(e.description.includes("в пределах"));A.ok(e.description.includes("предыдущему году 0%"));A.ok(e.limit.includes("p / нет / нет"));
A.equal(core.tradeEvidence(d,2024).period,"2024");A.ok(core.tradeEvidence(d,2024).description.includes("сальдо источника отсутствует"));
const change=(key,rows)=>({...d,series:{...d.series,[key]:s(rows)}});
A.ok(core.tradeEvidence(change("MIO_BAL_VAL",[row("2025",25)]),2025).description.includes("требуется проверка"));
A.equal(core.tradeEvidence(change("MIO_IMP_VAL",[row("2023",10)]),2025),null);
A.equal(core.tradeEvidence(change("MIO_IMP_VAL",[row("2025",10),row("2025",20)]),2025),null);
A.equal(core.tradeEvidence(change("MIO_IMP_VAL",[row("2025",-1)]),2025),null);
A.equal(core.tradeEvidence({...d,unit:"руб."},2025),null);
A.equal(core.tradeEvidence({...d,source:"javascript:alert(1)"},2025),null);
A.ok(core.tradeEvidence(change("MIO_IMP_VAL",[row("2025",10)]),2025).description.includes("годовой темп не рассчитан"));
A.equal(core.tradeEvidence({...d,series:{...d.series,MIO_IMP_VAL:{...d.series.MIO_IMP_VAL,success:null}}},2025),null);
console.log("21 statistical evidence checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),IV=require("./iv-comparison.js");
const cmd=core.priceCommand("покупательная способность: 2024-05; год; зарплата=10%");
A.deepEqual(cmd,{kind:"price-power",period:"2024-05",basis:"yoy",wage:10});
A.equal(core.priceCommand("покупательная способность: 2024-05; месяц; оплата=-5,5").wage,-5.5);
A.equal(core.priceCommand("покупательная способность: 2024-05; с начала года; зарплата=0").basis,"ytd");
A.equal(core.priceCommand("инфляция"),null);
for(const q of ["покупательная способность: 2024-13; год; зарплата=10","покупательная способность: 2024-05; год; зарплата=101","покупательная способность: 2024-05; год; зарплата=-51","покупательная способность: 2024-05; квартал; зарплата=10"])A.equal(core.priceCommand(q).kind,"invalid");
const r={period:"2024-05",yoy:20,official:{yoy:[110]},url:"https://romir.ru/test"};
const d={schema:"iv-prices-v1",official_source:"https://example.org/cpi",rows:[r]};
const e=core.priceEvidence(cmd,d,IV,"2026-11");
A.equal(e.length,3);A.equal(e[0].value,10);A.equal(e[1].value,20);A.ok(e[2].description.includes("по ИПЦ 0%"));A.ok(e[2].description.includes("−8,3333%")||e[2].description.includes("-8,3333%"));A.ok(e[2].limit.includes("Не оценка ошибки Росстата"));
A.equal(core.priceEvidence(cmd,d,IV,"2024-05").length,0);
A.equal(core.priceEvidence({...cmd,period:"2024-06"},d,IV,"2026-11").length,0);
A.equal(core.priceEvidence(cmd,{...d,rows:[r,r]},IV,"2026-11").length,0);
A.equal(core.priceEvidence(cmd,{...d,rows:[{...r,yoy:-100}]},IV,"2026-11").length,0);
A.equal(core.priceEvidence(cmd,{...d,official_source:"javascript:alert(1)"},IV,"2026-11").length,0);
A.equal(core.priceEvidence(cmd,{...d,rows:[{...r,official:{}}]},IV,"2026-11").length,0);
console.log("20 purchasing power assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),IV=require("./iv-trade.js");
const cmd=core.partnerTradeCommand("торговля с США: 2026; месяцев=2");
A.deepEqual(cmd,{kind:"partner-trade",year:2026,months:2});A.equal(core.partnerTradeCommand("торговля"),null);
const r=(period,us_exports,us_imports)=>({period,us_exports,us_imports});
const d={schema:"iv-trade-v1",source:"https://www.census.gov/foreign-trade/balance/c4621.html",origin:"partner_customs",unit:"млн долл. США, текущие цены, без сезонной корректировки",status:"downloaded",last_success:"2026-03-01",source_sha256:"a".repeat(64),rows:[r("2025-01",10,20),r("2025-02",10,20),r("2026-01",20,10),r("2026-02",20,10)]};
for(const q of ["торговля с США: 1992; месяцев=2","торговля с США: 2026; месяцев=0","торговля с США: 2026; месяцев=13"])A.equal(core.partnerTradeCommand(q).kind,"invalid");
const e=core.partnerTradeEvidence(cmd,d,IV,"2026-03");
A.equal(e.length,3);A.ok(e[0].description.includes("100%"));A.ok(e[1].description.includes("-50%"));A.ok(e[2].description.includes("сальдо 20"));A.ok(e[2].description.includes("2 из 2"));
const partial=core.partnerTradeEvidence(cmd,d,IV,"2026-02");A.ok(partial[0].description.includes("НЕПОЛНЫЙ ПЕРИОД"));A.ok(partial[0].description.includes("02"));
A.equal(core.partnerTradeEvidence(cmd,d,IV,"2026-01").length,0);
A.equal(core.partnerTradeEvidence(cmd,{...d,rows:[...d.rows,d.rows[0]]},IV,"2026-03").length,0);
A.equal(core.partnerTradeEvidence(cmd,{...d,rows:[...d.rows,r("2024-01",-1,0)]},IV,"2026-03").length,0);
A.equal(core.partnerTradeEvidence(cmd,{...d,source_sha256:null},IV,"2026-03").length,0);
A.equal(core.partnerTradeEvidence(cmd,{...d,unit:"рубли"},IV,"2026-03").length,0);
A.equal(core.partnerTradeEvidence(cmd,{...d,status:"manual_seed",seed_verification:"documented_manual",seed_recheck_date:"2026-03-01"},IV,"2026-03").length,3);
A.equal(core.partnerTradeEvidence(cmd,{...d,status:"manual_seed"},IV,"2026-03").length,0);
console.log("19 partner trade assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),L=require("./iv-labour.js"),P=require("./iv-physical.js");
const l=core.labourCommand("рынок труда: 2026-10; база=2025");
A.deepEqual(l,{kind:"labour",year:"2026",month:"10",base:"2025"});
A.equal(core.labourCommand("рынок труда: 2026-13; база=2025").kind,"invalid");
A.equal(core.labourCommand("безработица"),null);
const r={period:"2026-10",value:9,source:"a"},b={period:"2025-10",value:7.3,source:"a"};
const d={schema:"iv-labour-v1",origin:"platform_primary",status:"manual_verified_labels",rows:[r,b],snapshots:[],sources:{a:{url:"https://example.org/a",page:5}},verification:{documents:[{source:"a",page:5}]}};
A.equal(core.labourEvidence(l,d,L,"2026-11").length,3);
A.equal(core.labourEvidence(l,d,L,"2026-10").length,0);
A.equal(core.labourEvidence(l,{...d,rows:[r,b,b]},L,"2026-11").length,0);
A.equal(core.labourEvidence(l,{...d,verification:{documents:[]}},L,"2026-11").length,0);
A.equal(core.labourEvidence(l,{...d,rows:[r]},L,"2026-11").length,0);
A.equal(core.labourEvidence({...l,base:"2026"},d,L,"2026-11").length,3);
const c=core.outputCommand("физический выпуск: nornickel; nickel; 2025; база=2024");
A.equal(c.kind,"physical-output");A.equal(core.outputCommand("физический выпуск: x").kind,"invalid");
const company={id:"nornickel",title:"Норникель",source:"https://example.org",scope:"Группа",verification:"source_rechecked",verification_date:"2026-11-26",metrics:[{id:"nickel",title:"Никель",unit:"т"}],rows:[{year:2024,nickel:100},{year:2025,nickel:90}]};
const p={schema:"iv-physical-v1",companies:[company]};
A.equal(core.outputEvidence(c,p,P,"2026-11").length,3);
A.ok(core.outputEvidence(c,p,P,"2026-11")[2].description.includes("90"));
A.equal(core.outputEvidence(c,p,P,"2025-12").length,0);
A.equal(core.outputEvidence(c,{...p,companies:[{...company,verification:"pending"}]},P,"2026-11").length,0);
A.equal(core.outputEvidence({...c,metric:"bad"},p,P,"2026-11").length,0);
A.equal(core.outputEvidence({...c,base:2023},p,P,"2026-11").length,0);
console.log("17 independent labour and output assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),P=require("./iv-physical-composite.js"),IV=require("./iv-physical.js");
const c=core.compositeCommand("индекс выпуска: 2025; база=2024; веса=20,20,20,20,0");
A.deepEqual(c,{kind:"physical-composite",year:2025,base:2024,weights:[20,20,20,20,0]});
A.equal(core.compositeCommand("выпуск"),null);
for(const q of ["индекс выпуска: 2025; база=2024; веса=0,0,0,0,0","индекс выпуска: 2025; база=2024; веса=101,0,0,0,0","индекс выпуска: 2025; база=2024; веса=1,2","индекс выпуска: 1980; база=2024; веса=1,1,1,1,1"])A.equal(core.compositeCommand(q).kind,"invalid");
const d={schema:"iv-physical-v1",companies:P.specs.map(([id,key,title],i)=>({id,title,source:"https://example.org/"+id,scope:"Группа",verification:i===4?"partial":"source_rechecked",verification_date:"2026-11-26",metrics:[{id:key,title,unit:"ед."}],rows:[{year:2024,[key]:100,verification:"source_rechecked"},{year:2025,[key]:i===0?80:120,verification:i===4?"secondary_rechecked":"source_rechecked"}]}))};
const a=core.compositeEvidence(c,d,IV,P,"2026-11");
A.equal(a.length,13);A.equal(a[0].id,"composite-result");A.ok(a[0].description.includes("110"));A.ok(a[0].description.includes("100%"));A.ok(a[0].description.includes("при исключении"));
const blocked=core.compositeEvidence({...c,weights:[20,20,20,20,20]},d,IV,P,"2026-11");
A.equal(blocked[0].id,"composite-blocked");A.ok(blocked[0].description.includes("Северсталь"));A.ok(!blocked.some(r=>r.id==="composite-result"));
A.equal(core.compositeEvidence(c,d,IV,P,"2025-12").length,0);
const missing={...d,companies:d.companies.slice(1)};
A.equal(core.compositeEvidence(c,missing,IV,P,"2026-11")[0].id,"composite-blocked");
const bad={...d,companies:d.companies.map((x,i)=>i===0?{...x,verification_date:"2027-01-01"}:x)};
A.equal(core.compositeEvidence(c,bad,IV,P,"2026-11")[0].id,"composite-blocked");
A.equal(core.compositeEvidence({...c,weights:[0,0,0,0,0]},d,IV,P,"2026-11")[0].id,"composite-blocked");
A.ok(a.filter(r=>r.kind==="Корпоративное наблюдение").every(r=>r.href.startsWith("https://")));
console.log("19 composite physical index assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),S=require("./iv-energy-structure.js"),E=require("./iv-ember.js");
const c=core.energyCommand("структура энергетики: 2025; база=2024; порог=5");
A.deepEqual(c,{kind:"energy-structure",year:2025,base:2024,threshold:5});
A.equal(core.energyCommand("структура энергетики: 2025; база=2024").threshold,5);
A.equal(core.energyCommand("структура энергетики: 2025; база=2024; порог=1,5").threshold,1.5);
A.equal(core.energyCommand("энергетика"),null);
A.equal(core.energyCommand("структура энергетики: 2025; база=2024; порог=101").kind,"invalid");
const vals=Object.fromEntries(S.types.map(k=>[k,10]));
const d={schema:"iv-ember-v1",origin:"external_compilation",unit:"TWh",source:"https://example.org/data",documentation:"https://example.org/method",success:"2026-01-01",sha256:"a".repeat(64),rows:[{year:2024,values:{...vals,total:90}},{year:2025,values:{...vals,total:90}}]};
const a=core.energyEvidence(c,d,S,E,"2026-11");
A.equal(a.length,13);A.ok(a[2].description.includes("общий структурный сдвиг 0"));A.ok(a[2].description.includes("9 из 9"));
const missing={...d,rows:d.rows.map(r=>({...r,values:{...r.values,other_renewables:null}}))};
const b=core.energyEvidence(c,missing,S,E,"2026-11");
A.ok(b[2].description.includes("HHI нет расчёта"));A.ok(b[2].description.includes("общий структурный сдвиг нет расчёта"));A.ok(b[2].description.includes("8 из 9"));A.ok(!b.some(r=>r.id==="energy-other_renewables"));
A.equal(core.energyEvidence(c,d,S,E,"2025-12").length,0);
A.equal(core.energyEvidence(c,{...d,rows:[d.rows[0]]},S,E,"2026-11").length,0);
A.equal(core.energyEvidence(c,{...d,rows:[...d.rows,d.rows[0]]},S,E,"2026-11").length,0);
A.equal(core.energyEvidence(c,{...d,sha256:null},S,E,"2026-11").length,0);
A.equal(core.energyEvidence(c,{...d,unit:"GWh"},S,E,"2026-11").length,0);
A.ok(a.at(-1).description.includes("Не переносить"));
console.log("18 energy structure assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),G=require("./global-plan.js"),T=require("./iv-trajectory.js");
const c=core.investmentComparisonCommand("сравнить инвестиции: инвестиции A=1000; инвестиции B=1500; импорт=500; горизонт=2; рост=3");
A.equal(c.kind,"investment-comparison");A.equal(c.p.investment,1000);A.equal(c.budgetB,1500);A.equal(c.p.years,2);A.equal(c.p.growth.length,19);
A.equal(core.investmentComparisonCommand("инвестиции"),null);
for(const q of ["сравнить инвестиции: инвестиции A=1; импорт=5","сравнить инвестиции: инвестиции A=1; инвестиции B=2; импорт=5; горизонт=11","сравнить инвестиции: инвестиции A=1; инвестиции A=2; инвестиции B=2; импорт=5","сравнить инвестиции: инвестиции A=1; инвестиции B=100001; импорт=5","сравнить инвестиции: инвестиции A=1; инвестиции B=2; инвестиции=3; импорт=5"])A.equal(core.investmentComparisonCommand(q).kind,"invalid");
const n=19,m={names:Array.from({length:n},(_,i)=>"Группа "+i),output:Array(n).fill(10000),demand:Array(n).fill(10000),imports:Array(n).fill(100),effects:Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?10000:0))};
const a=G.solve(m,c.p,c.objective),b=G.solve(m,{...c.p,investment:c.budgetB},c.objective);
const out=core.investmentComparisonEvidence(c,m,a,b,T);
A.equal(out.length,5);A.equal(out[0].id,"invest-compare");A.ok(out[0].description.includes("B − A"));A.ok(out[0].limit.includes("не ВВП"));A.ok(out[2].href.includes("dyn-investment=1500"));A.ok(b.score>=a.score-1e-6);
A.throws(()=>core.investmentComparisonEvidence(c,m,a,{...b,upper:b.upper+1e6},T));
A.throws(()=>core.investmentComparisonEvidence(c,m,a,{...b,rows:b.rows.slice(1)},T));
A.throws(()=>core.investmentComparisonEvidence(c,m,a,{...b,maxViolation:-1},T));
console.log("20 investment comparison assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),G=require("./global-plan.js"),T=require("./iv-trajectory.js");
const c=core.laborPlanCommand("трудовой план: инвестиции=1000; импорт=500; горизонт=2; труд=0; трудоёмкость=100; трудоёмкость 9=200; производительность=-2");
A.equal(c.kind,"labor-plan");A.equal(c.labor.cap,0);A.equal(c.labor.intensity[8],200);A.equal(c.labor.intensity[0],100);A.equal(c.labor.productivity,-2);A.equal(c.p.labor,null);
A.equal(core.laborPlanCommand("труд"),null);
for(const q of ["трудовой план: инвестиции=1; импорт=2; труд=0","трудовой план: инвестиции=1; импорт=2; труд=0; трудоёмкость=0","трудовой план: инвестиции=1; импорт=2; труд=-1; трудоёмкость=1","трудовой план: инвестиции=1; импорт=2; труд=0; трудоёмкость=1; трудоёмкость 20=1","трудовой план: инвестиции=1; импорт=2; труд=0; трудоёмкость=1; трудоёмкость 9=1; трудоёмкость 09=2","трудовой план: инвестиции=1; импорт=2; труд=0; трудоёмкость=1; производительность=21","трудовой план: инвестиции=1; импорт=2; труд=0; трудоёмкость=1; горизонт=11"])A.equal(core.laborPlanCommand(q).kind,"invalid");
const n=19,m={names:Array.from({length:n},(_,i)=>"Группа "+i),output:Array(n).fill(10000),demand:Array(n).fill(10000),imports:Array(n).fill(100),effects:Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?10000:0))};
const a=G.solve(m,c.p,c.objective),b=G.solve(m,{...c.p,labor:c.labor},c.objective);
A.ok(a.score>0);A.equal(b.score,0);A.ok(b.rows.every(r=>r.labor===0));
const o=core.laborPlanEvidence(c,m,a,b,T);
A.equal(o.length,4);A.ok(o[0].description.includes("человеко-лет"));A.ok(o[1].limit.includes("не измерены"));
A.throws(()=>core.laborPlanEvidence(c,m,a,{...b,rows:b.rows.map(r=>({...r,labor:1}))},T));
A.throws(()=>core.laborPlanEvidence(c,m,a,{...b,upper:b.upper+1e6},T));
console.log("22 labor-constrained planning assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),L=require("./labor-data.js");
const c=core.productivityCommand("производительность труда: 2025; база=2019");
A.deepEqual(c,{kind:"productivity-decomposition",year:2025,base:2019});
A.equal(core.productivityCommand("производительность"),null);
A.equal(core.productivityCommand("производительность труда: 2025; база=2025").kind,"invalid");
A.equal(core.productivityCommand("производительность труда: 2025; база=1990").kind,"invalid");
const codes=[["agriculture","AGR"],["industry","IND"],["services","SRV"]];
const rows=[2019,2025].flatMap(year=>codes.map(([sector,k],i)=>({year,sector,title:sector,productivity_usd2015_per_worker:100*(i+1)+(year===2025?20:0),employment_share_pct:[20,30,50][i],productivity_source:"https://api.worldbank.org/v2/country/RUS/indicator/NV."+k+".EMPL.KD",employment_source:"https://api.worldbank.org/v2/country/RUS/indicator/SL."+k+".EMPL.ZS",productivity_checked:"2026-01-01",employment_checked:"2026-01-01"})));
const d={built:"2026-01-01",broad:rows},e=core.productivityEvidence(c,d,L,"2026-11");
A.equal(e.length,8);A.equal(e[0].id,"prod-decomposition");A.ok(e[0].description.includes("внутри секторов 20"));A.ok(e[0].description.includes("структура занятости 0"));A.ok(e[7].description.includes("заблокирована"));
A.equal(core.productivityEvidence(c,d,L,"2025-12").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:rows.slice(1)},L,"2026-11").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:[...rows,rows[0]]},L,"2026-11").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:rows.map((r,i)=>i===0?{...r,employment_share_pct:0}:r)},L,"2026-11").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:rows.map((r,i)=>i===0?{...r,productivity_source:"https://example.org"}:r)},L,"2026-11").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:rows.map((r,i)=>i===0?{...r,employment_checked:null}:r)},L,"2026-11").length,0);
A.equal(core.productivityEvidence(c,{...d,broad:rows.map((r,i)=>i===0?{...r,productivity_checked:"2027-01-01"}:r)},L,"2026-11").length,0);
console.log("16 productivity decomposition assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js"),T=require("./technology.js"),V=require("./iv-tech.js");
const c=core.technologyCommand("технология: 9; материалы=10; импорт=5; спрос=3");
A.deepEqual(c,{kind:"technology",group:8,material:10,imported:5,demand:3});
A.equal(core.technologyCommand("технология: все; материалы=-20; импорт=80; спрос=0").group,-1);
A.equal(core.technologyCommand("технология"),null);
for(const q of ["технология: 20; материалы=10; импорт=5; спрос=3","технология: 9; материалы=81; импорт=5; спрос=3","технология: 9; материалы=-21; импорт=5; спрос=3","технология: 9; материалы=10; импорт=5; спрос=21"])A.equal(core.technologyCommand(q).kind,"invalid");
const n=19,m={year:2021,source:"https://example.org",names:Array.from({length:n},(_,i)=>"Группа "+i),A:Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?.2:0)),imported:Array(n).fill(.1),residual:Array(n).fill(.7),demand:Array(n).fill(10000),output:Array(n).fill(20000),compatible:true};
const e=core.technologyEvidence(c,m,T,V);A.equal(e.length,21);A.equal(e[1].id,"tech-result");A.ok(e[1].limit.includes("не рассчитаны"));A.ok(e[0].description.includes("Группа 8"));
const p=V.params(n,8,10,5,3),r=V.compare(m,p);A.ok(r.delta.output<0);A.ok(r.delta.imports<0);A.equal(r.base.demand,r.changed.demand);
A.equal(core.technologyEvidence(c,{...m,year:2022},T,V).length,0);A.equal(core.technologyEvidence(c,{...m,compatible:false},T,V).length,0);A.equal(core.technologyEvidence(c,{...m,source:"javascript:alert(1)"},T,V).length,0);
A.throws(()=>core.technologyEvidence(c,m,T,{...V,compare:()=>({...r,changed:{...r.changed,residual:100}})}));
console.log("18 technology assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js");
const c=core.forecastAuditCommand("точность прогноза: ny.gdp.mktp.kd.zg; горизонт=1");
A.deepEqual(c,{kind:"forecast-audit",code:"NY.GDP.MKTP.KD.ZG",horizon:1});
A.equal(core.forecastAuditCommand("прогноз"),null);A.equal(core.forecastAuditCommand("точность прогноза: X; горизонт=0").kind,"invalid");
const fold=(origin,target,prediction,actual)=>({origin,target,prediction,actual,error:prediction-actual});
const early=[fold("2020","2021",1,2)],late=[fold("2021","2022",2,3)];
const r={horizon:1,selected:"last",selection_cutoff:"2021",development:{last:{n:1,mae:1}},holdout:{last:{n:1,mae:1}},development_folds:{last:early},holdout_folds:{last:late}};
const s={code:c.code,title:"ВВП",source:"https://example.org",unit:"%",results:[r]},d={series:[s]},m={schema:1,rows:[]},t={schema:1,rows:[]},v={schema:1,trials:[]};
const a=core.forecastAuditEvidence(c,d,m,t,v);A.equal(a.length,3);A.ok(a[2].description.includes("фактов 0"));A.ok(a[2].limit.includes("Недостаточно"));A.equal(core.forecastAuditEvidence({...c,horizon:2},d,m,t,v).length,0);
A.throws(()=>core.forecastAuditEvidence(c,{series:[{...s,results:[{...r,holdout:{last:{n:1,mae:2}}}]}]},m,t,v));
A.equal(core.forecastAuditEvidence(c,{series:[{...s,results:[{...r,selection_cutoff:"2022"}]}]},m,t,v).length,0);
const p={code:c.code,source:s.source,unit:s.unit,horizon:1,origin:"2024",target:"2026",issued:"2025-11-01",point:2,naive:1,low:0,high:4,first_actual:3,first_seen:"2026-03-01"};
A.ok(core.forecastAuditEvidence(c,d,{...m,rows:[p]},t,v)[2].description.includes("фактов 1"));
A.throws(()=>core.forecastAuditEvidence(c,d,{...m,rows:[p,p]},t,v));
A.throws(()=>core.forecastAuditEvidence(c,d,{...m,rows:[{...p,issued:"2026-01-01"}]},t,v));
A.throws(()=>core.forecastAuditEvidence(c,d,{...m,rows:[{...p,first_seen:"2025-12-01"}]},t,v));
A.equal(core.forecastAuditEvidence(c,d,{...m,rows:[{...p,unit:"руб."}]},t,v)[2].description.includes("фактов 0"),true);
console.log("14 forecast audit assistant checks passed");}

{const A=require("node:assert/strict"),core=require("./global-economic-assistant.js");
const c=core.agentCommand("координация агентов: приоритеты");
A.deepEqual(c,{kind:"agent-coordination",mode:"priorities"});A.equal(core.agentCommand("агенты"),null);A.equal(core.agentCommand("координация агентов: запуск").kind,"invalid");
const agent=(id,state,metrics,items=[])=>({id,state,metrics,items,links:["forecast.html"]});
const d={schema:1,built:"2026-11-27",mode:"scheduled_refresh",agents:[agent("coverage","attention",{series_with_values:10}),agent("discovery","ok",{candidates:10,available:3}),agent("quality","attention",{backlog:5,recent_rejected:2}),agent("research","ok",{}),agent("forecast","waiting",{frozen:7,scored:0,adequate_sample_groups:0}),agent("search","ok",{abstracts:{indexed:0,catalogue:10}}),agent("diagnostics","attention",{counts:{signal:1}}),agent("planning","attention",{counts:{investigate:1,refresh_first:0,data_required:0,history_required:0,monitor:1}},[{priority:"investigate",title:"Труд",action:"Проверить",limit:"Не причина",href:"scenario.html#reproduction-plan"}])]};
const a=core.agentEvidence(c,d);A.equal(a[0].id,"agents-overview");A.equal(a[1].id,"agent-quality");A.ok(a.some(r=>r.id==="agent-route1"));A.ok(a.some(r=>r.id==="agent-forecast-wait"));A.ok(a.some(r=>r.id==="agent-abstracts"));A.ok(a.every(r=>r.limit.includes("не автономное выполнение")));
A.equal(core.agentEvidence({...c,mode:"all"},d).length,a.length+8);
A.equal(core.agentEvidence(c,{...d,agents:d.agents.slice(1)}).length,0);
A.equal(core.agentEvidence(c,{...d,agents:[...d.agents.slice(1),d.agents[1]]}).length,0);
const edit=(id,metrics)=>({...d,agents:d.agents.map(x=>x.id===id?{...x,metrics:{...x.metrics,...metrics}}:x)});
A.equal(core.agentEvidence(c,edit("quality",{backlog:-1})).length,0);A.equal(core.agentEvidence(c,edit("forecast",{scored:8})).length,0);A.equal(core.agentEvidence(c,edit("search",{abstracts:{indexed:11,catalogue:10}})).length,0);
A.ok(!core.agentEvidence(c,{...d,agents:d.agents.map(x=>x.id==="planning"?{...x,items:[{...x.items[0],href:"javascript:alert(1)"}]}:x)}).some(r=>r.id==="agent-route1"));
console.log("16 agent coordination checks passed");}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const meta={id:"paper1",kind:"Научная статья",href:"https://doi.org/10.1234/ABC",title:"A"};
 const abstract={...meta,id:"abstract1",kind:"Лицензированная аннотация",href:"https://dx.doi.org/10.1234/abc",description:"Текст"};
 const fact={id:"fact1",kind:"Наблюдение",href:meta.href,value:10},fact2={...fact,id:"fact2",value:20};
 A.deepEqual(C.researchDedup([meta,fact,abstract,fact2]),[abstract,fact,fact2]);
 A.deepEqual(C.researchDedup([abstract,meta]),[abstract]);
 A.deepEqual(C.researchDedup([fact,fact2]),[fact,fact2]);
 const a={id:"external1",kind:"Внешний препринт",href:"https://arxiv.org/abs/1234.5678v1"},b={...a,id:"external2",href:"https://arxiv.org/abs/1234.5678v2"},c={...a,id:"external3",href:a.href+"#abstract"};
 A.deepEqual(C.researchDedup([a,b,c]),[a,b]);
 const d={...a,id:"external4",href:a.href+"?version=3"};
 A.deepEqual(C.researchDedup([a,d]),[a,d]);
 const invalid={...meta,href:"https://doi.org/not-a-doi"};
 A.equal(C.researchDedup([invalid,invalid]).length,2);
 A.equal(C.researchDedup([{...meta,href:"javascript:alert(1)"},meta]).length,2);
 A.deepEqual(C.researchDedup([]),[]);
 console.log("8 research evidence deduplication checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const rows=[{id:"fact1",kind:"Наблюдение",title:"Выпуск",description:"2025 · 1 250,50 млн рублей · снижение −7% · 2 п.п.",period:"2025",value:1250.5,unit:"млн рублей"},{id:"fact2",kind:"Наблюдение",title:"Занятость",description:"0 человек",value:0,unit:"человек",href:"https://example.org/9000"}];
 A.deepEqual(C.answerEvidenceAudit("В 2025 году выпуск 1250,5 млн, снижение -7%, 2 процентных пункта [fact1].",rows),{unknown:[],missing:[],noCitation:false});
 A.deepEqual(C.answerEvidenceAudit("Выпуск 1250,5 млрд [fact1], рост 7%, изменение 2% [fake].",rows).missing,["1250.5 млрд","7%","2%"]);
 A.deepEqual(C.answerEvidenceAudit("Выпуск 1250,5 млрд [fact1] [fake].",rows).unknown,["fake"]);
 A.equal(C.answerEvidenceAudit("Выпуск 1250,5 млн.",rows).noCitation,true);
 A.equal(C.answerEvidenceAudit("Сведений нет.",rows).noCitation,false);
 A.deepEqual(C.answerEvidenceAudit("Занятость 0 [fact2].",rows).missing,[]);
 A.deepEqual(C.answerEvidenceAudit("Показатель 9000 [fact2].",rows).missing,["9000"]);
 A.deepEqual(C.answerEvidenceAudit("−0 [fact2]",rows).missing,[]);
 A.deepEqual(C.answerEvidenceAudit("1250,50 миллиона [fact1]",rows).missing,[]);
 A.deepEqual(C.answerEvidenceAudit("1 250,50 [fact1]",rows).missing,["1250.5"]);
 A.equal(C.answerEvidenceAudit("7% [unknown]",rows).noCitation,true);
 A.ok(C.answerEvidenceWarning(C.answerEvidenceAudit("7% [unknown]",rows)).includes("неизвестные ссылки"));
 A.ok(C.answerEvidenceWarning(C.answerEvidenceAudit("0 [fact2]",rows)).includes("не проверка фактов"));
 console.log("13 numerical answer audit checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const rows=[{id:"fact1",title:"Выпуск",description:"2025 · 100 млн · 7%",value:100,unit:"млн"},{id:"fact2",title:"Инвестиции",description:"2025 · 200 млн · 2 п.п.",value:200,unit:"млн"}];
 const audit=text=>C.citationEvidenceAudit(text,rows);
 A.deepEqual(audit("Выпуск 100 млн [fact1]. Инвестиции 200 млн [fact2]."),{unlinked:[],mismatched:[]});
 A.deepEqual(audit("Выпуск 200 млн [fact1].").mismatched,[{part:1,numbers:["200 млн"],refs:["fact1"]}]);
 A.deepEqual(C.answerEvidenceAudit("Выпуск 200 млн [fact1].",rows).missing,[]);
 A.deepEqual(audit("Выпуск 100 млн. Инвестиции 200 млн [fact2].").unlinked,[{part:1,numbers:["100 млн"]}]);
 A.deepEqual(audit("Изменения 7% и 2 п.п. [fact1] [fact2]."),{unlinked:[],mismatched:[]});
 A.deepEqual(audit("Выпуск 100 млн [fake].").unlinked,[{part:1,numbers:["100 млн"]}]);
 A.deepEqual(audit("1. Нет данных.\n2. Выпуск 100 млн [fact1]."),{unlinked:[],mismatched:[]});
 A.deepEqual(audit("Выпуск 100,00 млн [fact1].").mismatched,[]);
 A.deepEqual(audit("Рост 2% [fact2].").mismatched[0].numbers,["2%"]);
 A.deepEqual(audit("Выпуск 100 млн [fact1].\nИнвестиции 200 млн.").unlinked,[{part:2,numbers:["200 млн"]}]);
 A.ok(C.answerEvidenceWarning(C.answerEvidenceAudit("200 млн [fact1]",rows),audit("200 млн [fact1]")).includes("не найдены в указанных источниках"));
 A.ok(C.answerEvidenceWarning(C.answerEvidenceAudit("100 млн",rows),audit("100 млн")).includes("без ссылки в том же фрагменте"));
 A.deepEqual(audit("Сведения отсутствуют."),{unlinked:[],mismatched:[]});
 A.deepEqual(audit("100 млн [fact1]").mismatched,[]);
 console.log("14 citation-level numeric audit checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const check=(q,tool,command)=>A.deepEqual(C.naturalRoute(q),{tool,command});
 check("Как изменилась производительность труда в России в 2024 году по сравнению с 2020 годом?","productivity","производительность труда: 2024; база=2020");
 check("Покажи структуру энергетики России в 2024 году относительно 2020 года","energy","структура энергетики: 2024; база=2020");
 check("Сравни торговлю России с США за первые 6 месяцев 2024 года","trade","торговля с сша: 2024; месяцев=6");
 check("Покажи рынок труда России за 2024-06 относительно 2020 года","labour","рынок труда: 2024-06; база=2020");
 check("Проверь точность прогноза NY.GDP.MKTP.KD.ZG на горизонте 1 год","forecast","точность прогноза: ny.gdp.mktp.kd.zg; горизонт=1");
 check("Покажи приоритетные задачи аналитических агентов","agents","координация агентов: приоритеты");
 check("Перечисли состояние всех экономических агентов","agents","координация агентов: все");
 check("Рассчитай межотраслевой баланс для группы 9","balance","мрб: 9");
 for(const q of ["Покажи производительность труда","Покажи производительность труда в 2020 году относительно 2024 года","Сравни торговлю с США за первые 13 месяцев 2024 года","Покажи рынок труда за 2024-13 относительно 2020 года","Покажи межотраслевой баланс группы 20","Не показывай приоритетные задачи агентов","мрб: 9","Покажи межотраслевой баланс группы 9 и прогноз ВВП","Как развивается экономика России?"])A.equal(C.naturalRoute(q),null);
 A.equal(C.productivityCommand(C.naturalRoute("Покажи производительность труда в 2024 году относительно 2020 года").command).year,2024);
 console.log("18 natural-language routing checks passed");
}


{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const tokens=x=>[...C.explicitUnitTokens(x)];
 A.deepEqual(tokens("1 250,50 млн рублей; −7 тыс. тонн; 30 человек"),["1250.5 млн руб.","-7 тыс тонн","30 чел."]);
 A.deepEqual(tokens("5 млн долл. США; 6 USD; 7 евро; 8 юаней"),["5 млн USD","6 USD","7 EUR","8 CNY"]);
 A.deepEqual(tokens("100 МВт·ч; 30 МВт; 20 кВтч; 12 ГВт·ч"),["100 МВт·ч","30 МВт","20 кВт·ч","12 ГВт·ч"]);
 A.deepEqual(tokens("5 млн м³; 8 кв. м; 10 кг"),["5 млн м³","8 м²","10 кг"]);
 A.deepEqual(tokens("₽100; € 200; $ 5 млн"),["100 руб.","200 EUR","5 млн долл."]);
 A.deepEqual(tokens("100 инвестиций; 2025 год; 2%"),[]);
 A.deepEqual(tokens("100 рублёвых облигаций; 20 тоннель"),[]);
 A.deepEqual(tokens("https://example.org/90 [fact1]"),[]);
 const rows=[{id:"fact1",title:"Выпуск",description:"100 млн рублей; 20 тонн; 7 МВт·ч",value:100,unit:"млн руб."},{id:"fact2",title:"Оплата",description:"10 000 руб."}];
 A.deepEqual(C.unitEvidenceAudit("Выпуск 100 млн RUB, 20 т, 7 МВт·ч [fact1].",rows),[]);
 A.deepEqual(C.unitEvidenceAudit("Выпуск 100 млн USD, 20 кг, 7 МВт [fact1].",rows),["100 млн USD","20 кг","7 МВт"]);
 A.deepEqual(C.unitEvidenceAudit("10 тыс. руб. [fact2]",rows),["10 тыс руб."]);
 A.deepEqual(C.unitEvidenceAudit("Выпуск 100 млн [fact1].",rows),[]);
 A.deepEqual(C.unitEvidenceAudit("Выпуск 20 тонн [fact1].",[{...rows[0],description:"20",value:20,unit:"тонн"}]),[]);
 A.deepEqual(C.unitEvidenceAudit("20 тонн [fact1]",[{...rows[0],description:"20",unit:"",value:20,limit:"20 тонн"}]),["20 тонн"]);
 A.ok(C.unitEvidenceWarning(["20 кг"]).includes("нет буквального совпадения"));
 A.equal(C.unitEvidenceWarning([]),"");
 console.log("16 explicit unit evidence checks passed");
}


{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const a="Покажи межотраслевой баланс группы 9",b="Покажи приоритетные задачи агентов",c="Покажи структуру энергетики России в 2024 году относительно 2020 года";
 const plan=C.researchPlan("Исследование: "+a+" | "+b);
 A.equal(plan.kind,"research");A.equal(plan.steps.length,2);
 A.equal(C.researchPlan("исследование:\n"+a+"\n"+b+"\n"+c).steps.length,3);
 A.equal(C.researchPlan("Исследование: "+a+" | "+a).kind,"invalid");
 A.equal(C.researchPlan("Исследование: "+a+" | неизвестный вопрос").kind,"invalid");
 A.equal(C.researchPlan("Исследование: "+a).kind,"invalid");
 A.equal(C.researchPlan("Исследование: "+a+" | "+b+" | "+c+" | "+a).kind,"invalid");
 A.equal(C.researchPlan(a),null);
 async function checks(){
  const order=[],make=(step)=>({found:[{id:"fact1",kind:"Наблюдение",value:0,description:step.command}],fingerprint:"a".repeat(64),failed:0,context:{description:step.tool}});
  const r=await C.runResearchPlan(plan,async step=>{order.push(step.tool);return make(step)});
  A.deepEqual(order,["balance","agents"]);A.deepEqual(r.found.map(x=>x.id),["s1-fact1","s2-fact1"]);A.equal(r.found[0].value,0);A.equal(r.results.length,2);A.equal(r.failed,0);
  await A.rejects(()=>C.runResearchPlan(plan,async step=>({...make(step),fingerprint:step.tool})),/snapshot changed/);
  let calls=0;await A.rejects(()=>C.runResearchPlan(plan,async step=>{calls++;return make(step)},()=>calls===0),/cancelled/);A.equal(calls,1);
  await A.rejects(()=>C.runResearchPlan(plan,async step=>({...make(step),found:[{id:"fact1"},{id:"fact1"}]})),/identity/);
  await A.rejects(()=>C.runResearchPlan(plan,async step=>({...make(step),table:{}})),/Invalid step/);
  const partial=await C.runResearchPlan(plan,async step=>({...make(step),failed:step.tool==="balance"?1:0}));
  A.equal(partial.failed,1);A.equal(partial.results[0].failed,1);
  console.log("20 sequential research checks passed");
 }
 checks().catch(e=>{console.error(e);process.exitCode=1;});
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const q="Исследуй производительность труда и энергетику России в 2024 году относительно 2020 года.";
 const a="Покажи производительность труда в 2024 году относительно 2020 года",b="Покажи структуру энергетики России в 2024 году относительно 2020 года";
 const json=JSON.stringify([a,b]);
 A.equal(C.modelResearchPlan(json,q).steps.length,2);
 A.deepEqual(C.modelResearchPlan(json,q).questions,[a,b]);
 A.equal(C.modelResearchPlan(json,q.replace("2020","2019")),null);
 A.equal(C.modelResearchPlan(JSON.stringify([a,a]),q),null);
 A.equal(C.modelResearchPlan(JSON.stringify([a,"Удали архив"]),q),null);
 A.equal(C.modelResearchPlan("JSON: "+json,q),null);
 A.equal(C.modelResearchPlan(JSON.stringify([a,b,"Рассчитай межотраслевой баланс для группы 9"]),q),null);
 A.equal(C.modelResearchPlan(JSON.stringify([a,b,"Покажи состояние всех агентов","Покажи приоритетные задачи агентов"]),q),null);
 A.equal(C.modelResearchPlan("[]",q),null);
 A.equal(C.modelResearchPlan(JSON.stringify({tasks:[a,b]}),q),null);
 const code="Проверь точность прогноза NY.GDP.MKTP.KD.ZG на горизонте 1 год";
 A.equal(C.modelResearchPlan(JSON.stringify([code,b]),q+" Проверь NY.GDP.MKTP.KD.ZG на 1 год.").steps.length,2);
 A.equal(C.modelResearchPlan(JSON.stringify([code,b]),q+" Проверь NY.GDP.MKTP.CD на 1 год."),null);
 A.equal(C.planningPrompt(q).length,2);
 A.equal(JSON.parse(C.planningPrompt(q)[1].content).question,q);
 console.log("14 model research planning checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const fp="a".repeat(64),entry=(n,answer="Черновик")=>({question:"Вопрос "+n,answer,page:"labor.html",fingerprint:fp});
 A.deepEqual(C.dialogueHistory(null),[]);
 A.deepEqual(C.dialogueHistory([{},entry(1),{...entry(2),fingerprint:"invalid"}]),[entry(1)]);
 A.equal(C.dialogueHistory([entry(1,"a".repeat(2000))])[0].answer.length,1800);
 A.equal(C.dialogueHistory([{...entry(1),question:"x".repeat(700)}])[0].question.length,600);
 A.deepEqual(C.dialogueHistory([1,2,3,4,5].map(x=>entry(x))).map(x=>x.question),["Вопрос 2","Вопрос 3","Вопрос 4","Вопрос 5"]);
 A.equal(C.dialogueAppend([entry(1)],entry(1,"новый")).length,1);
 A.equal(C.dialogueAppend([entry(1)],entry(1,"новый"))[0].answer,"новый");
 A.equal(C.dialogueAppend([entry(1)],{...entry(1),fingerprint:"b".repeat(64)}).length,2);
 A.equal(C.dialogueAppend([entry(1)],{}).length,1);
 A.deepEqual(C.dialogueQuery("Почему?",[entry(1)],false),{query:"Почему?",context:null});
 const follow=C.dialogueQuery("Почему?",[entry(1),entry(2,"неверные 987654")],true);
 A.equal(follow.query,"Почему? Вопрос 2");
 A.equal(follow.context.previous_snapshot,fp);
 A.equal(follow.context.previous_question,"Вопрос 2");
 A.ok(!JSON.stringify(follow).includes("987654"));
 A.deepEqual(C.dialogueQuery("Почему?",[],true),{query:"Почему?",context:null});
 A.deepEqual(C.dialogueQuery("",[entry(1)],true),{query:"",context:null});
 console.log("16 dialogue history checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const fast=C.modelProfile("fast"),balanced=C.modelProfile("balanced"),research=C.modelProfile("research");
 A.equal(fast.id,"Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
 A.equal(balanced.id,"Qwen2.5-3B-Instruct-q4f16_1-MLC");
 A.equal(research.id,"Qwen2.5-7B-Instruct-q4f16_1-MLC");
 A.equal(research.vramMB,5106.67);
 A.ok(fast.vramMB<balanced.vramMB&&balanced.vramMB<research.vramMB);
 A.equal(C.modelProfile("unknown"),null);
 A.equal(C.modelProfile("__proto__"),null);
 A.equal(C.modelProfile("research",[]),null);
 A.equal(C.modelProfile("research",[{model_id:fast.id}]),null);
 A.deepEqual(C.modelProfile("research",[{model_id:research.id}]),research);
 A.equal(C.modelProfile("research",null),null);
 research.id="bad";A.equal(C.modelProfile("research").id,"Qwen2.5-7B-Instruct-q4f16_1-MLC");
 A.ok(C.modelHint("research").includes("5107"));
 A.ok(C.modelHint("research").includes("не гарантия"));
 A.ok(C.modelHint("unknown").includes("Неизвестный"));
 console.log("15 local model profile checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const q="Сравни показатели",ctx={heading:"Экономика"};
 const row=(id,value,description="Наблюдение")=>({id,title:"Ряд",kind:"Наблюдение",value,unit:"руб.",description,limit:"Ограничение источника"});
 const a=row("s1-fact1",100),b=row("s2-fact1",200),c=row("s1-fact2",300),huge=row("s1-huge",999,"Я".repeat(15000));
 const size=rows=>C.utf8Size(JSON.stringify(C.prompt(q,ctx,rows)));
 A.equal(C.utf8Size("AЯ😀"),7);
 A.deepEqual(C.prepareEvidence(q,ctx,[a,b],size([a,b])).rows,[a,b]);
 A.equal(C.prepareEvidence(q,ctx,[a],size([])-1).blocked,true);
 A.equal(C.prepareEvidence(q,ctx,[a],size([])).blocked,true);
 const r=C.prepareEvidence(q,ctx,[a,c,b],size([a,b]));
 A.deepEqual(r.rows,[a,b]);A.equal(r.omitted,1);A.ok(r.bytes<=r.budget);
 A.deepEqual(C.prepareEvidence(q,ctx,[huge,b],size([b])).rows,[b]);
 A.deepEqual(C.prepareEvidence(q,ctx,[a,{id:"auto-route",kind:"Выбранный инструмент"}],size([a])).rows,[a]);
 A.deepEqual(C.prepareEvidence(q,ctx,[a],size([a])).rows[0],a);
 A.deepEqual(C.audit("[s1-fact2]",r.rows),["s1-fact2"]);
 A.deepEqual(C.answerEvidenceAudit("300 [s1-fact1]",r.rows).missing,["300"]);
 A.throws(()=>C.prepareEvidence(q,ctx,[a,a]),/identity/);
 A.throws(()=>C.prepareEvidence(q,ctx,[a],-1),/budget/);
 A.ok(C.prepareEvidence(q,{heading:"Я".repeat(10000)},[a]).blocked);
 console.log("15 context budget checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const cmd=C.agentCommand("координация агентов: досье");
 A.deepEqual(cmd,{kind:"agent-coordination",mode:"dossiers"});
 A.deepEqual(C.agentCommand("координация агентов: досье age-dependency"),{...cmd,id:"age-dependency"});
 A.equal(C.agentCommand("координация агентов: все age-dependency").kind,"invalid");
 A.deepEqual(C.naturalRoute("Покажи исследовательские досье по экономическим сигналам"),{tool:"agents",command:"координация агентов: досье"});
 const x={id:"age-dependency",title:"Нагрузка",year:2025,value:27.3,unit:"чел.",formula:"A/B",codes:["A","B"],sources:["https://example.org/a"],score:4,note:"Не причинность.",status:"signal"};
 const p={id:x.id,year:x.year,status:x.status,inputs:x.codes,title:"Труд",href:"scenario.html#reproduction-plan",action:"Проверить ограничения",priority:"investigate"};
 const r={...x,limit:x.note,state:"check_inputs",transition:"initial",blockers:["quality"],route:{title:p.title,href:p.href,action:p.action,priority:p.priority}};
 const d={schema:1,built:"2026-11-28T10:00:00Z",mode:"scheduled_refresh",agents:[{id:"diagnostics",items:[x]},{id:"planning",items:[p]}],signal_dossiers:{schema:1,rows:[r],note:"Не результат оптимизации."}};
 const a=C.agentEvidence(cmd,d);
 A.equal(a.length,2);A.equal(a[0].value,27.3);A.equal(a[0].period,"2025");A.equal(a[1].href,p.href);A.ok(a[1].limit.includes("расчёт не выполнен"));
 A.deepEqual(C.agentEvidence({...cmd,id:"age-dependency"},d),a);
 A.equal(C.agentEvidence({...cmd,id:"other"},d)[0].id,"dossier-status");
 A.equal(C.agentEvidence(cmd,{...d,signal_dossiers:undefined})[0].id,"dossier-status");
 const edit=patch=>({...d,signal_dossiers:{...d.signal_dossiers,rows:[{...r,...patch}]}});
 A.deepEqual(C.agentEvidence(cmd,edit({value:123})),[]);
 A.deepEqual(C.agentEvidence(cmd,edit({year:2024})),[]);
 A.deepEqual(C.agentEvidence(cmd,edit({sources:["javascript:alert(1)"]})),[]);
 A.deepEqual(C.agentEvidence(cmd,edit({route:{...r.route,href:"javascript:alert(1)"}})),[]);
 A.deepEqual(C.agentEvidence(cmd,edit({codes:["other"]})),[]);
 A.deepEqual(C.agentEvidence(cmd,{...d,signal_dossiers:{...d.signal_dossiers,rows:[r,r]}}),[]);
 A.ok(C.agentEvidence(cmd,edit({route:null})).every(x=>x.id!=="route-age-dependency"));
 console.log("19 dossier assistant checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const paper=(id,date="2025-01-01")=>({doi:"10.1234/"+id,title:"Тема "+id,published:date,journal:"J"});
 const p=[paper("a"),paper("b"),paper("c","2027-01-01"),paper("d")];
 const doc=p=>({kind:"paper",code:p.doi,title:p.title,date:p.published,href:"https://doi.org/"+p.doi});
 const a={...doc(p[0]),authors:"Автор",text:"Текст",license:"CC BY",checked:"2026-01-01"};
 const index={docs:p.map(doc)},searcher={researchEvidence:(i,ps,q,c,n)=>[a],search:()=>[doc(p[0]),doc(p[1]),doc(p[2]),{...doc(p[3]),title:"Подмена"}]};
 const r=C.dossierLiterature("age-dependency",index,p,searcher,"2026-11");
 A.equal(r.length,2);A.equal(r[0].kind,"Лицензированная аннотация");A.ok(r[1].kind.includes("только метаданные"));A.ok(r[1].limit.includes("не прочитаны"));A.equal(r[1].href,"https://doi.org/10.1234/b");
 A.deepEqual(C.dossierLiterature("unknown",index,p,searcher,"2026-11"),[]);
 A.deepEqual(C.dossierLiterature("age-dependency",index,p,searcher,"bad"),[]);
 A.equal(C.dossierLiterature("age-dependency",index,[...p,p[0]],searcher,"2026-11").length,1);
 A.equal(C.dossierLiterature("age-dependency",index,p,{...searcher,researchEvidence:()=>[],search:()=>[] },"2026-11").length,0);
 A.equal(C.dossierLiterature("age-dependency",index,p,searcher,"2024-12").length,0);
 console.log("10 dossier literature checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const q=C.parseLocalTable('\uFEFFПериод;Выпуск\r\n2024;10,5\r\n2025;20,5\r\n2026;\r\n2027;нет',';');
 A.deepEqual(q.headers,["Период","Выпуск"]);
 A.equal(q.rows.length,4);
 A.deepEqual(C.summarizeLocalColumn(q,1,","),{column:"Выпуск",total:4,count:2,missing:1,invalid:1,min:10.5,max:20.5,mean:15.5,median:15.5});
 A.equal(C.summarizeLocalColumn(q,1,".").count,0);
 A.deepEqual(C.parseLocalTable('a,b\n"hello, world","a""b"\n"x\ny",3\n',",").rows,[["hello, world",'a"b'],["x\ny","3"]]);
 A.deepEqual(C.parseLocalTable("a\tb\n1\t2","\t").rows,[["1","2"]]);
 A.throws(()=>C.parseLocalTable('a,b\n"x,2',","));
 A.throws(()=>C.parseLocalTable("a,a\n1,2",","));
 A.throws(()=>C.parseLocalTable("a,b\n1",","));
 A.throws(()=>C.parseLocalTable('a,b\n"x"z,2',","));
 A.throws(()=>C.parseLocalTable("a,b\n1,2","|"));
 A.throws(()=>C.parseLocalTable("a\n"+"x".repeat(4097),","));
 A.throws(()=>C.parseLocalTable("a\n"+"1\n".repeat(5001),","));
 const r=C.summarizeLocalColumn(C.parseLocalTable("a\n0\n-5\n=SUM(1)\n9007199254740992\n10\n",","),0,".");
 A.equal(r.count,3);A.equal(r.invalid,2);A.equal(r.median,0);A.equal(r.min,-5);A.equal(r.max,10);
 A.ok(Math.abs(r.mean-5/3)<1e-12);
 console.log("19 local table checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const q=C.parseLocalTable("year;value\n2025;120\n2022;100\n2023;110\n2027;0\n2028;5\n2029;-2\n2030;4\n2030;6\n2031;8\n2032;\n2033;bad\nwrong;3",";");
 const r=C.localAnnualSeries(q,0,1,".");
 const get=y=>r.rows.find(x=>x.year===y);
 A.equal(r.invalidYears,1);A.equal(r.totalInputRows,12);
 A.deepEqual(r.counts,{ok:7,missing:1,invalid:1,gap:2,duplicate:1});
 A.equal(get(2023).delta,10);A.equal(get(2023).relativePercent,10);
 A.equal(get(2024).state,"gap");A.equal(get(2025).delta,null);
 A.equal(get(2027).delta,null);A.equal(get(2028).delta,5);A.equal(get(2028).relativePercent,null);
 A.equal(get(2029).delta,-7);A.equal(get(2029).relativePercent,null);
 A.equal(get(2030).state,"duplicate");A.equal(get(2030).value,null);A.equal(get(2031).delta,null);
 A.equal(get(2032).state,"missing");A.equal(get(2033).state,"invalid");
 A.equal(C.localAnnualSeries(C.parseLocalTable("y;v\n2024;2,5\n2025;5,0",";"),0,1,",").rows[1].relativePercent,100);
 A.deepEqual(C.localAnnualSeries(C.parseLocalTable("y;v\n1899;5\n2101;2",";"),0,1,".").rows,[]);
 A.throws(()=>C.localAnnualSeries(q,1,1,"."));
 console.log("20 annual table checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const local=C.localAnnualSeries(C.parseLocalTable("y;v\n2020;10\n2021;15\n2022;5\n2023;0\n2024;12\n2025;14\n2025;15\n2026;",";"),0,1,".");
 const registry={id:"wdi:TEST",group:"wdi",title:"Test",unit:"руб.",frequency:"годовая",territory:"Россия",mode:"auto",measurement_kind:"Факт"};
 const obs=(year,value,patch={})=>({id:registry.id,territory:registry.territory,unit:registry.unit,kind:"Наблюдение",period:String(year),value,...patch});
 const rows=[obs(2020,8),obs(2021,0),obs(2022,4),obs(2022,5),obs(2024,10),obs(2025,10)];
 const r=C.localArchiveComparison(local,registry,rows,"руб.",true);
 A.equal(r.matched,3);A.equal(r.rows[0].difference,2);A.equal(r.rows[0].relativePercent,25);
 A.equal(r.rows[1].relativePercent,null);A.equal(r.rows[2].state,"archive_duplicate");
 A.equal(r.rows[3].state,"archive_missing");A.equal(r.rows[3].difference,null);
 A.equal(r.rows[5].state,"local_duplicate");A.equal(r.rows[6].state,"local_missing");
 A.ok(Math.abs(r.meanAbsoluteDifference-19/3)<1e-12);
 A.throws(()=>C.localArchiveComparison(local,registry,rows,"тыс. руб.",true));
 A.throws(()=>C.localArchiveComparison(local,registry,rows,"руб.",false));
 A.throws(()=>C.localArchiveComparison(local,{...registry,frequency:"месячная"},rows,"руб.",true));
 A.throws(()=>C.localArchiveComparison(local,registry,[obs("2020-01",8)],"руб.",true));
 A.throws(()=>C.localArchiveComparison(local,registry,[obs(2020,8,{unit:"USD"})],"руб.",true));
 A.throws(()=>C.localArchiveComparison(local,registry,[obs(2020,8,{kind:"Цель"})],"руб.",true));
 A.equal(C.localArchiveComparison(local,{...registry,unit:"%"},[obs(2020,8,{unit:"%"})],"%",true).rows[0].relativePercent,null);
 A.equal(C.localArchiveComparison(local,registry,[],"руб.",true).meanAbsoluteDifference,null);
 console.log("18 local archive comparison checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const q=C.parseLocalTable("secret_year;secret_value\n2020;10\n2021;20\n2022;30\n2023;40\n2024;50\n2025;60",";");
 const a=C.localTableEvidence("summary",C.summarizeLocalColumn(q,1,"."));
 A.equal(a.length,7);A.equal(a.find(x=>x.id==="local-mean").value,35);
 A.ok(!JSON.stringify(a).includes("secret"));A.ok(a.every(x=>x.limit.includes("Не официальная статистика")));
 const b=C.localTableEvidence("annual",C.localAnnualSeries(q,0,1,"."));
 A.equal(b.filter(x=>x.id.startsWith("local-value-")).length,5);
 A.ok(!b.some(x=>x.period==="2020"));A.ok(b.some(x=>x.id==="local-rate-2021"&&x.value===100));
 A.ok(!JSON.stringify(C.localTablePrompt(b)).includes("secret"));
 A.equal(C.localTablePrompt(b)[0].role,"system");
 A.deepEqual(JSON.parse(C.localTablePrompt(b)[1].content).results,b);
 const c=C.localTableEvidence("comparison",{title:"secret",unit:"secret",matched:2,meanAbsoluteDifference:3,rows:[{year:2025,state:"matched",local:10,archive:7,difference:3},{year:2026,state:"archive_missing",local:100,archive:null}]});
 A.equal(c.length,5);A.ok(!JSON.stringify(c).includes("secret"));A.ok(!c.some(x=>x.period==="2026"));
 A.deepEqual(C.localTableEvidence("unknown",{}),[]);
 A.deepEqual(C.localTableEvidence("summary",{}),[]);
 A.ok(!C.localTableEvidence("summary",{count:0,min:null,mean:NaN}).some(x=>x.id==="local-mean"));
 console.log("16 local model table checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 A.deepEqual(C.xlsxCellColumn("A1"),{column:0,row:1});A.deepEqual(C.xlsxCellColumn("AN5001"),{column:39,row:5001});
 A.throws(()=>C.xlsxCellColumn("AO1"));A.throws(()=>C.xlsxCellColumn("A5002"));A.throws(()=>C.xlsxCellColumn("A0"));A.throws(()=>C.xlsxCellColumn("$A$1"));
 const r=C.xlsxGrid([{ref:"A1",value:"Год"},{ref:"B1",value:"Выпуск"},{ref:"B3",value:"20"},{ref:"A3",value:"2025"},{ref:"A4",value:"2026"},{ref:"B4",value:"[формула не вычислена]"}]);
 A.deepEqual(r.headers,["Год","Выпуск"]);A.deepEqual(r.rows,[["",""],["2025","20"],["2026","[формула не вычислена]"]]);
 A.equal(C.summarizeLocalColumn(r,1,".").invalid,1);A.equal(C.summarizeLocalColumn(r,1,".").missing,1);
 A.throws(()=>C.xlsxGrid([{ref:"A1",value:"x"},{ref:"A1",value:"y"},{ref:"A2",value:"1"}]));
 A.throws(()=>C.xlsxGrid([{ref:"A1",value:"x"},{ref:"B2",value:"1"}]));
 A.throws(()=>C.xlsxGrid([{ref:"A1",value:"x"},{ref:"B1",value:"x"},{ref:"B2",value:"1"}]));
 A.equal(C.xlsxCrc(new Uint8Array([49,50,51,52,53,54,55,56,57])),0xcbf43926);
 A.throws(()=>C.xlsxDirectory(new Uint8Array(22)));
 const name=[97],payload=[49],b=new Uint8Array(30+name.length+payload.length+46+name.length+22),v=new DataView(b.buffer),u16=(p,x)=>v.setUint16(p,x,true),u32=(p,x)=>v.setUint32(p,x,true),central=32,end=79;
 u32(0,0x04034b50);u16(26,1);b[30]=97;b[31]=49;
 u32(central,0x02014b50);u32(central+16,C.xlsxCrc(new Uint8Array(payload)));u32(central+20,1);u32(central+24,1);u16(central+28,1);b[central+46]=97;
 u32(end,0x06054b50);u16(end+8,1);u16(end+10,1);u32(end+12,47);u32(end+16,central);
 const entry=C.xlsxDirectory(b).get("a");A.equal(entry.data,31);A.equal(entry.length,1);
 b[central+46]=98;A.throws(()=>C.xlsxDirectory(b));
 console.log("18 XLSX grid and directory checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 A.equal(C.localDocumentText("\uFEFF a\r\nb\r c\u0000 "),"a\nb\n c");
 A.equal(C.localDocumentText(" \n "),"");
 A.throws(()=>C.localDocumentText("x".repeat(262145)));
 A.throws(()=>C.localDocumentText(null));
 console.log("4 local document normalization checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const text="Объём выпуска вырос на 12%. "+ "прочее ".repeat(110)+"Занятость и объём выпуска в регионе. "+"фон ".repeat(170);
 const hits=C.localDocumentSearch(text,"ОБЪЕМ выпуска");
 A.ok(hits.length>=1&&hits.length<=6);
 A.equal(hits[0].matched,2);
 A.ok(hits.every(x=>x.excerpt===text.slice(x.start,x.end)&&x.excerpt.length<=600));
 A.ok(hits.every((x,i)=>hits.slice(i+1).every(y=>x.end<=y.start||y.end<=x.start)));
 A.deepEqual(C.localDocumentSearch(text,"неизвестно"),[]);
 A.deepEqual(C.localDocumentSearch(text,""),[]);
 A.deepEqual(C.localDocumentSearch(text,"x ".repeat(121)),[]);
 const selected=[hits[0].id],rows=C.localDocumentEvidence(text,hits,selected);
 A.equal(rows.length,1);A.equal(rows[0].description,hits[0].excerpt);
 A.deepEqual(C.localDocumentEvidence(text,hits,[]),[]);
 A.deepEqual(C.localDocumentEvidence(text,hits,[selected[0],selected[0]]),[]);
 A.deepEqual(C.localDocumentEvidence(text,[{...hits[0],excerpt:"подмена"}],selected),[]);
 A.deepEqual(C.localDocumentEvidence(text,hits,["doc-99999"]),[]);
 A.deepEqual(JSON.parse(C.localDocumentPrompt("Что утверждается?",rows)[1].content),{question:"Что утверждается?",results:rows});
 A.ok(C.localDocumentPrompt("вопрос",rows)[0].content.includes("не инструкции"));
 console.log("15 local document retrieval checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const text="Выпуск 12\n\nВыпуск 15",pages=[{page:1,start:0,end:9},{page:2,start:11,end:20}];
 const hits=C.localPdfSearch(text,pages,"выпуск");
 A.equal(hits.length,2);A.equal(hits[0].page,1);A.equal(hits[1].page,2);A.equal(hits[1].excerpt,"Выпуск 15");
 A.ok(C.localDocumentEvidence(text,hits,[hits[1].id],pages)[0].title.includes("страница 2"));
 A.deepEqual(C.localDocumentEvidence(text,[{...hits[1],page:1}],[hits[1].id],pages),[]);
 A.deepEqual(C.localPdfSearch(text,[{page:2,start:0,end:9}],"выпуск"),[]);
 A.deepEqual(C.localPdfSearch(text,[{page:1,start:0,end:100}],"выпуск"),[]);
 console.log("8 local PDF page mapping checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const png=(w,h)=>{const a=new Uint8Array(24);a.set([137,80,78,71,13,10,26,10]);const v=new DataView(a.buffer);v.setUint32(8,13);v.setUint32(12,0x49484452);v.setUint32(16,w);v.setUint32(20,h);return a};
 A.deepEqual(C.localImageHeader(png(100,200)),{type:"image/png",width:100,height:200});
 A.throws(()=>C.localImageHeader(png(6000,6000)));A.throws(()=>C.localImageHeader(png(0,100)));A.throws(()=>C.localImageHeader(png(6001,1)));
 A.throws(()=>C.localImageHeader(new Uint8Array(24)));
 const jpeg=new Uint8Array(24);jpeg.set([255,216,255,192,0,8,8,0,100,0,200,1]);A.deepEqual(C.localImageHeader(jpeg),{type:"image/jpeg",width:200,height:100});
 jpeg[5]=40;A.throws(()=>C.localImageHeader(jpeg));
 A.deepEqual(C.localOcrResult({text:"  Выпуск 125\r\n",confidence:82},"rus"),{text:"Выпуск 125",confidence:82,language:"rus"});
 A.throws(()=>C.localOcrResult({text:"x",confidence:101},"rus"));A.throws(()=>C.localOcrResult({text:"x",confidence:NaN},"eng"));A.throws(()=>C.localOcrResult({text:"x",confidence:50},"unknown"));
 console.log("11 OCR input/result contract checks passed");
}
