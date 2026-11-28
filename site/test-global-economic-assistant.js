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

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 A.equal(C.scanViewport(600,800),2.5);
 A.ok(C.scanViewport(2000,3000)<=1);
 const scale=C.scanViewport(1000,1000);A.ok(1000000*scale*scale<=6000000.00001);
 A.throws(()=>C.scanViewport(0,100));A.throws(()=>C.scanViewport(Infinity,100));A.throws(()=>C.scanViewport(1e-100,1e100));
 const text="Выпуск 12\n\nВыпуск 15",pages=[{page:1,start:0,end:9,origin:"text",confidence:null},{page:2,start:11,end:20,origin:"ocr",confidence:80}];
 const hits=C.localPdfSearch(text,pages,"выпуск");A.equal(hits[1].page,2);A.equal(hits[1].excerpt,"Выпуск 15");
 console.log("8 scan viewport and page identity checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const c=C.chartCalibration({x:10,y:110},{x:110,y:10},2020,0,2030,100);
 A.deepEqual(C.chartPoint(c,{x:60,y:60}),{x:2025,y:50,pixelX:60,pixelY:60,onePixelX:0.1,onePixelY:1});
 A.equal(C.chartPoint(c,{x:10,y:110}).y,0);A.equal(C.chartPoint(c,{x:110,y:10}).x,2030);
 A.throws(()=>C.chartPoint(c,{x:111,y:50}));A.throws(()=>C.chartPoint(c,{x:50,y:111}));
 A.throws(()=>C.chartCalibration({x:10,y:110},{x:15,y:10},0,0,1,1));
 A.throws(()=>C.chartCalibration({x:10,y:110},{x:110,y:10},0,0,0,1));
 A.throws(()=>C.chartCalibration({x:10,y:110},{x:110,y:10},0,NaN,1,1));
 const reverse=C.chartCalibration({x:0,y:100},{x:100,y:0},10,100,0,0);A.equal(C.chartPoint(reverse,{x:50,y:50}).y,50);
 A.equal(C.chartPointsCsv([C.chartPoint(c,{x:60,y:60})]),"x_estimate,y_estimate,pixel_x,pixel_y,x_per_pixel,y_per_pixel\n2025,50,60,60,0.1,1\n");
 A.throws(()=>C.chartPointsCsv([]));A.throws(()=>C.chartPointsCsv([{x:NaN}]));
 console.log("12 chart digitization checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const width=101,height=101,data=new Uint8ClampedArray(width*height*4);
 const raster={width,height,data},c=C.chartCalibration({x:0,y:100},{x:100,y:0},2020,0,2030,100);
 function pixel(x,y,r=37,g=99,b=235,a=255){data.set([r,g,b,a],4*(y*width+x))}
 for(let x=0;x<=100;x++){pixel(x,49);pixel(x,50);pixel(x,51)}
 pixel(25,10);for(let y=30;y<=44;y++)pixel(75,y);
 for(let y=49;y<=51;y++)pixel(50,y,0,0,0,0);
 const result=C.chartTrace(raster,c,"#2563eb",0,5);
 A.equal(result.sampled,5);A.equal(result.points.length,2);
 A.equal(result.points[0].y,50);A.equal(result.points[1].x,2030);
 A.deepEqual(result.skipped,[{pixelX:25,reason:"ambiguous"},{pixelX:50,reason:"missing"},{pixelX:75,reason:"ambiguous"}]);
 A.equal(C.chartTrace(raster,c,"#ffffff",0,5).points.length,0);
 A.equal(C.chartTrace(raster,c,"#2563eb",0,200).sampled,101);
 A.throws(()=>C.chartTrace(raster,c,"bad",0,5));
 A.throws(()=>C.chartTrace(raster,c,"#2563eb",101,5));
 A.throws(()=>C.chartTrace(raster,c,"#2563eb",0,201));
 A.throws(()=>C.chartTrace({...raster,data:new Uint8ClampedArray(4)},c,"#2563eb",0,5));
 A.throws(()=>C.chartTrace(raster,{...c,b:{x:101,y:0}},"#2563eb",0,5));
 console.log("12 chart color tracing checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const p=(x,y)=>({x,y,onePixelX:1,onePixelY:2});
 const r=C.chartResearchSummary([p(2025,120),p(2020,100),p(2022,500),p(2022,501)]);
 A.equal(r.unique,2);A.equal(r.duplicateX,2);A.equal(r.delta,20);A.equal(r.relativePercent,20);A.equal(r.max,120);A.equal(r.first.x,2020);
 A.equal(C.chartResearchSummary([p(1,10),p(2,11)]).relativePercent,null);
 A.equal(C.chartResearchSummary([p(1,10),p(2,11)]).belowPixelScale,true);
 A.equal(C.chartResearchSummary([p(1,0),p(2,10)]).relativePercent,null);
 A.equal(C.chartResearchSummary([p(1,10),p(1,20)]).unique,0);
 A.throws(()=>C.chartResearchSummary([p(1,NaN)]));
 A.throws(()=>C.chartResearchSummary([p(1,10)],{sampled:2,skipped:[]}));
 A.deepEqual(C.chartResearchSummary([p(1,10)],{sampled:2,skipped:[{reason:"ambiguous"}]}).coverage,{sampled:2,missing:0,ambiguous:1});
 A.deepEqual(C.chartResearchEvidence(r,"руб.",false),[]);
 A.ok(C.chartResearchEvidence(r,"руб.",true).every(x=>x.kind==="Оценка по изображению"));
 A.ok(!C.chartResearchEvidence(r,"%",true).some(x=>x.id==="chart-relative"));
 A.ok(C.chartResearchPrompt([])[0].content.includes("X может не быть временем"));
 console.log("17 chart research summary checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const row=(id,value,patch={})=>({id,kind:"Наблюдение",registryId:"wdi:TEST",title:"Ряд",period:"2025",unit:"руб.",href:"https://example.org/a",value,...patch});
 const a=row("s1-a",10),b=row("s1-b",11),c=row("s2-c",20,{period:"2024"}),d={id:"s2-status",kind:"Статус проверки",title:"Нет данных"},e={id:"auto-route",kind:"Выбранный инструмент"};
 A.deepEqual(C.sameSeriesDisagreements([a,b,c]),[["s1-a","s1-b"]]);
 A.deepEqual(C.sameSeriesDisagreements([a,{...b,registryId:"other"}]),[]);
 A.deepEqual(C.sameSeriesDisagreements([a,{...b,unit:"USD"}]),[]);
 A.deepEqual(C.sameSeriesDisagreements([a,{...b,href:"https://example.org/b"}]),[]);
 A.deepEqual(C.sameSeriesDisagreements([a,{...b,value:10}]),[]);
 A.equal(C.researchCardClass({kind:"Наблюдение",value:null}),"other");
 A.equal(C.researchCardClass({kind:"Условный расчёт",value:10}),"scenario");
 const scope=C.researchScope([a,b,c,d,e],[a,d],1,[{failed:0},{failed:1}]);
 A.equal(scope.omitted,3);A.equal(scope.transmitted_by_kind.observation,1);A.equal(scope.steps[1].observations,0);A.equal(scope.steps[1].unavailable_archives,1);
 A.deepEqual(scope.same_series_disagreements,[]);
 A.equal(C.researchScope([d],[d]).no_transmitted_observations,true);
 A.throws(()=>C.researchScope([a],[b]));
 const input=C.prepareResearchInput("вопрос",{research_steps:[{failed:0},{failed:1}]},[a,b,c,d,e],1);
 A.equal(input.blocked,false);A.ok(input.bytes<=input.budget);
 A.equal(input.context.research_scope.transmitted,input.rows.length);
 A.equal(input.bytes,C.utf8Size(JSON.stringify(C.prompt("вопрос",input.context,input.rows))));
 A.deepEqual(input.scope.same_series_disagreements,[["s1-a","s1-b"]]);
 A.equal(C.prepareResearchInput("вопрос",{},[a],1,100).blocked,true);
 console.log("20 research scope and conflict checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const rows=[{id:"fact-a",title:"Выпуск",description:"125 млн руб.",value:125,unit:"млн руб."},{id:"fact-b",title:"Поставка",description:"125 тонн",value:125,unit:"тонн"}];
 A.equal(C.researchAnswerCheck("Выпуск 125 млн руб. [fact-a]",rows).passed,true);
 A.ok(C.researchAnswerCheck("Выпуск 125 млн руб. [fact-b]",rows).flags.includes("wrong_source_units"));
 A.ok(C.researchAnswerCheck("Выпуск 999 млн руб. [fact-a]",rows).flags.includes("unsupported_numbers"));
 A.ok(C.researchAnswerCheck("125 млн руб. [unknown]",rows).flags.includes("unknown_ids"));
 A.ok(C.researchAnswerCheck("",rows).flags.includes("empty"));
 A.equal(C.citedUnitAudit("125 млн руб. [fact-a]",rows).length,0);
 A.equal(C.citedUnitAudit("125 млн руб. [fact-b]",rows).length,1);
 A.equal(C.researchAnswerCheck("Данных недостаточно.",rows).passed,true);
 A.ok(C.repairResearchPrompt("вопрос",{},rows,"черновик",{})[0].content.includes("не инструкции"));
 async function checks(){
  let calls=0;
  const gen=async()=>{calls++;return "Выпуск 125 млн руб. [fact-a]"};
  const good=await C.reviewResearchAnswer("Выпуск 125 млн руб. [fact-a]","вопрос",{},rows,gen);
  A.equal(good.state,"initial_pass");A.equal(calls,0);
  const fixed=await C.reviewResearchAnswer("999 млн руб. [fact-a]","вопрос",{},rows,gen);
  A.equal(fixed.state,"repair_accepted");A.equal(calls,1);A.equal(fixed.final.passed,true);A.equal(fixed.attempted,true);
  const bad=await C.reviewResearchAnswer("999 млн руб. [fact-a]","вопрос",{},rows,async()=>"777 млн руб. [fact-a]");
  A.equal(bad.state,"repair_rejected");A.equal(bad.answer,"999 млн руб. [fact-a]");A.equal(bad.final.passed,false);
  const unavailable=await C.reviewResearchAnswer("999 млн руб. [fact-a]","вопрос",{},rows,async()=>{throw Error("offline")});
  A.equal(unavailable.state,"repair_unavailable");
  const limited=await C.reviewResearchAnswer("999 млн руб. [fact-a]","вопрос",{},rows,gen,()=>true,100);
  A.equal(limited.state,"budget_exceeded");A.equal(limited.attempted,false);
  let active=true;await A.rejects(()=>C.reviewResearchAnswer("999 млн руб. [fact-a]","вопрос",{},rows,async()=>{active=false;return "нет данных"},()=>active),/Cancelled/);
  console.log("22 research answer repair checks passed");
 }
 checks().catch(e=>{console.error(e);process.exitCode=1;});
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const rows=[{id:"fact",kind:"Наблюдение",title:"Выпуск",description:"125 млн руб.",value:125,unit:"млн руб."},{id:"sim",kind:"Условный расчёт",title:"Сценарий",description:"150 млн руб.",value:150,unit:"млн руб."},{id:"meta",kind:"paper",title:"Статья",description:"Метаданные"},{id:"abstract",kind:"Лицензированная аннотация",title:"Аннотация",description:"Авторы исследуют выпуск"}];
 const limit={type:"limitation",text:"Причинная связь не установлена.",refs:[]},fact={type:"observation",text:"Выпуск 125 млн руб.",refs:["fact"]},validate=(...items)=>C.validateResearchFindings(JSON.stringify(items),rows);
 A.equal(validate(fact,limit).ok,true);
 A.equal(validate(limit).ok,true);
 A.equal(validate(fact).reason,"missing_limitation");
 A.equal(validate({...fact,refs:["sim"]},limit).reason,"source_class");
 A.equal(validate({...fact,refs:["unknown"]},limit).reason,"source_class");
 A.equal(validate({...fact,refs:[]},limit).reason,"missing_source");
 A.equal(validate({...fact,text:"Выпуск 999 млн руб."},limit).reason,"numeric_evidence");
 A.equal(validate({...fact,text:"Выпуск 125 тонн."},limit).reason,"numeric_evidence");
 A.equal(validate({...fact,text:"Выпуск [sim]"},limit).reason,"shape");
 A.equal(validate({...fact,other:1},limit).reason,"shape");
 A.equal(validate(fact,fact,limit).reason,"duplicate_finding");
 A.equal(validate({type:"literature",text:"Авторы доказали рост",refs:["meta"]},limit).reason,"source_class");
 A.equal(validate({type:"literature",text:"Авторы исследуют выпуск",refs:["abstract"]},limit).ok,true);
 A.equal(validate({type:"scenario",text:"Условный результат 150 млн руб.",refs:["sim"]},limit).ok,true);
 A.equal(validate({type:"hypothesis",text:"Возможна связь с выпуском.",refs:["fact"]},limit).ok,true);
 A.equal(validate({...limit,text:"Недостаёт 999 записей."}).reason,"numeric_evidence");
 A.equal(C.validateResearchFindings("not json",rows).reason,"json");
 A.ok(C.formatResearchFindings(validate({type:"hypothesis",text:"Возможна связь.",refs:["fact"]},limit).findings).includes("Гипотеза (не доказана)"));
 const input=C.structuredResearchInput("вопрос",{},rows,1);
 A.equal(input.blocked,false);A.ok(input.bytes<=input.budget);
 A.equal(JSON.parse(input.messages[1].content).results[0].evidence_class,"observation");
 A.equal(input.context.research_scope.transmitted,input.rows.length);
 A.equal(C.structuredResearchInput("вопрос",{},rows,0,100).blocked,true);
 console.log("23 structured research checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const rows=[{id:"fact",kind:"Наблюдение",title:"Выпуск",description:"125 млн руб.",value:125,unit:"млн руб.",href:"https://example.org/a"}];
 const h={type:"hypothesis",text:"Возможна связь с выпуском.",refs:["fact"]},fp="a".repeat(64),at="2026-11-28T10:00:00.000Z";
 const add=(j=[])=>C.addHypothesis(j,h,rows,fp,"Вопрос","h-1",at),j=add();
 A.equal(j.length,1);A.equal(j[0].fingerprint,fp);A.equal(j[0].events.length,0);A.equal(j[0].sources[0].class,"observation");
 A.throws(()=>add(j));A.throws(()=>C.addHypothesis([],h,rows,"bad","Вопрос","h-1",at));
 A.throws(()=>C.addHypothesis([],{...h,refs:["bad"]},rows,fp,"Вопрос","h-1",at));
 A.throws(()=>C.addHypothesis([],{...h,type:"observation"},rows,fp,"Вопрос","h-1",at));
 const updated=C.reviewHypothesis(j,"h-1","user_challenge","Нужны дополнительные данные.",at);
 A.equal(updated[0].events[0].state,"user_challenge");A.equal(j[0].events.length,0);
 A.throws(()=>C.reviewHypothesis(j,"h-1","verified","нет",at));A.throws(()=>C.reviewHypothesis(j,"h-1","investigating"," ",at));
 A.throws(()=>C.reviewHypothesis(j,"h-1","investigating","Проверка","2025-11-28T10:00:00.000Z"));
 A.throws(()=>C.hypothesisJournal([...j,...j]));
 A.throws(()=>C.hypothesisJournal([{...j[0],sources:[{...j[0].sources[0],href:"javascript:alert(1)"}]}]));
 A.equal(C.hypothesisJournal(JSON.parse(JSON.stringify(updated)))[0].text,h.text);
 A.throws(()=>C.hypothesisJournal([{...j[0],created:"2026-02-30T10:00:00.000Z"}]));
 A.throws(()=>C.hypothesisJournal(Array(31).fill(j[0])));
 console.log("18 hypothesis journal checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const fp="a".repeat(64),next="b".repeat(64),at="2026-11-28T10:00:00.000Z";
 const question="Производительность и энергетика России в 2025 году относительно 2020 года";
 const source={id:"fact",kind:"Наблюдение",title:"Выпуск",description:"Данные",value:10,unit:"руб."};
 const j=C.addHypothesis([],{type:"hypothesis",text:"Возможна связь с выпуском.",refs:["fact"]},[source],fp,question,"h-1",at),r=j[0];
 A.deepEqual(r.runs,[]);
 const questions=["Покажи производительность труда в 2025 году относительно 2020 года","Покажи структуру энергетики России в 2025 году относительно 2020 года"];
 const plan=C.hypothesisPlan(JSON.stringify(questions),r);A.equal(plan.kind,"research");
 A.equal(C.hypothesisPlan(JSON.stringify([questions[0],questions[1].replace("2025","2026")]),r),null);
 A.ok(C.hypothesisPlanPrompt(r)[0].content.includes("не доказана"));
 const result={fingerprint:next,failed:1,found:[{...source,id:"s1-fact"},{id:"s2-status",kind:"Статус проверки",title:"Нет данных"}],results:plan.steps.map((s,i)=>({step:i+1,command:s.command,count:1,failed:i}))};
 const receipt=C.hypothesisReceipt(r,plan,result,at);A.equal(receipt.same_snapshot,false);A.equal(receipt.eligible,1);A.equal(receipt.cards.length,1);A.equal(receipt.steps[1].observations,0);
 A.equal(C.hypothesisReceipt(r,plan,{...result,fingerprint:fp},at).same_snapshot,true);
 const saved=C.appendHypothesisRun(j,"h-1",plan,result,at);
 A.equal(saved[0].runs.length,1);A.equal(saved[0].events.length,0);A.equal(j[0].runs.length,0);
 A.throws(()=>C.hypothesisReceipt(r,plan,{...result,failed:0},at));
 A.throws(()=>C.hypothesisReceipt(r,plan,{...result,fingerprint:"bad"},at));
 A.throws(()=>C.hypothesisReceipt(r,{...plan,steps:plan.steps.slice().reverse()},result,at));
 A.throws(()=>C.hypothesisJournal([{...saved[0],runs:[{...receipt,same_snapshot:true}]}]));
 A.throws(()=>C.hypothesisJournal([{...saved[0],runs:[{...receipt,eligible:2}]}]));
 A.throws(()=>C.hypothesisJournal([{...saved[0],runs:Array(6).fill(receipt)}]));
 A.equal(C.hypothesisJournal(JSON.parse(JSON.stringify(saved)))[0].runs[0].fingerprint,next);
 console.log("19 hypothesis research receipt checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const fp="a".repeat(64),next="b".repeat(64),at="2026-11-28T10:00:00.000Z";
 const question="Производительность и энергетика России в 2025 году относительно 2020 года";
 const source={id:"fact",kind:"Наблюдение",title:"Выпуск",description:"Данные",value:10,unit:"руб.",href:"https://example.org/a"};
 const j=C.addHypothesis([],{type:"hypothesis",text:"Возможна связь с выпуском.",refs:["fact"]},[source],fp,question,"h-1",at);
 const questions=["Покажи производительность труда в 2025 году относительно 2020 года","Покажи структуру энергетики России в 2025 году относительно 2020 года"];
 const plan=C.hypothesisPlan(JSON.stringify(questions),j[0]);
 const result=(fingerprint,found,p=plan)=>({fingerprint,failed:0,found,results:p.steps.map((s,i)=>({step:i+1,command:s.command,count:found.filter(x=>x.id.startsWith("s"+(i+1)+"-")).length,failed:0}))});
 const a={...source,id:"s1-a"},b={...source,id:"s2-b",title:"Энергетика"},c={...a,description:"Другой текст"};
 const append=(journal,res,p=plan)=>C.appendHypothesisRun(journal,"h-1",p,res,at);
 A.equal(C.compareHypothesisRuns(j[0]).state,"insufficient_runs");
 const first=append(j,result(fp,[a,b]));const same=append(first,result(fp,[a,b]));
 const x=C.compareHypothesisRuns(same[0]).comparisons[0];A.equal(x.state,"same_snapshot");A.equal(x.counts.unchanged,2);A.equal(x.previous,1);
 const changed=append(same,result(next,[c,{...b,title:"Новая карточка"}]));
 const y=C.compareHypothesisRuns(changed[0]).comparisons[1];A.equal(y.state,"different_snapshot");A.equal(y.counts.changed_excerpt,1);A.equal(y.counts.only_previous_sample,1);A.equal(y.counts.only_current_sample,1);A.equal(y.previous,2);A.equal(y.completeSamples,true);
 const reverse=C.hypothesisPlan(JSON.stringify(questions.slice().reverse()),j[0]);
 const diff=append(first,result(next,[a,b],reverse),reverse);
 A.equal(C.compareHypothesisRuns(diff[0]).comparisons[0].state,"different_plan");
 const again=append(diff,result(next,[a,b]));A.equal(C.compareHypothesisRuns(again[0]).comparisons[1].previous,1);
 const amb=append(first,result(next,[a,{...a,id:"s1-a2"},b]));A.equal(C.compareHypothesisRuns(amb[0]).comparisons[0].counts.ambiguous,1);
 const many=Array.from({length:9},(_,i)=>({...a,id:"s1-a"+i,title:"Ряд "+i}));
 const partial=append(first,result(next,many));A.equal(C.compareHypothesisRuns(partial[0]).comparisons[0].completeSamples,false);
 A.equal(changed[0].events.length,0);
 A.ok(y.limit.includes("не является независимым"));
 console.log("17 hypothesis run comparison checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const fp="a".repeat(64),at="2026-11-28T10:00:00.000Z";
 const source={id:"fact",kind:"Наблюдение",title:"Выпуск",description:"125 млн руб.",value:125,unit:"млн руб.",href:"https://example.org/a"};
 const j=C.addHypothesis([],{type:"hypothesis",text:"Возможна связь с выпуском.",refs:["fact"]},[source],fp,"Вопрос","h-1",at),input=C.hypothesisArgumentInput(j[0]);
 A.equal(input.blocked,false);A.equal(input.cards.length,1);A.equal(input.cards[0].fingerprint,fp);A.ok(input.bytes<=input.budget);
 A.equal(C.hypothesisArgumentInput(j[0],100).blocked,true);
 const gap={type:"gap",text:"Необходима независимая проверка.",refs:[]},support={type:"support",text:"Выпуск 125 млн руб.",refs:["arg-1"]};
 const check=(...a)=>C.validateHypothesisArguments(JSON.stringify(a),input.cards);
 A.equal(check(gap,support).ok,true);
 A.equal(check(gap).ok,true);
 A.equal(check(support).reason,"missing_gap");
 A.equal(check(gap,{...support,refs:[]}).reason,"missing_source");
 A.equal(check(gap,{...support,refs:["bad"]}).reason,"unknown_source");
 A.equal(check(gap,{...support,text:"Выпуск 999 млн руб."}).reason,"numeric_evidence");
 A.equal(check(gap,{...support,text:"Выпуск 125 тонн."}).reason,"numeric_evidence");
 A.equal(check(gap,{...support,type:"proven"}).reason,"shape");
 A.equal(check(gap,support,support).reason,"duplicate_argument");
 A.equal(check(gap,{type:"challenge",text:"Связь требует проверки.",refs:["arg-1"]}).ok,true);
 A.equal(C.validateHypothesisArguments("invalid",input.cards).reason,"json");
 A.equal(j[0].events.length,0);
 console.log("17 hypothesis argument checks passed");
}

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const at="2026-11-28T10:00:00.000Z";
 A.ok(C.wikiSearchUrl("история & право","ru").includes("gsrsearch="+encodeURIComponent("история & право")));
 A.ok(C.wikiSearchUrl("history","en").startsWith("https://en.wikipedia.org/"));
 A.throws(()=>C.wikiSearchUrl("x","other"));A.throws(()=>C.wikiSearchUrl(" ", "ru"));A.throws(()=>C.wikiSearchUrl("x\nz","ru"));
 const page={ns:0,pageid:12,lastrevid:34,title:"History",extract:"Historical research.",index:2};
 const data={query:{pages:[page,{...page,pageid:13,lastrevid:35,title:"Law",index:1}]}};
 const rows=C.wikiReferenceCards(data,"en",at);
 A.equal(rows.length,2);A.equal(rows[0].id,"wiki-en-13");A.equal(rows[1].href,"https://en.wikipedia.org/w/index.php?oldid=34");
 A.equal(rows[1].checked,at);A.ok(rows[1].limit.includes("CC BY-SA"));
 A.deepEqual(C.wikiReferenceCards({batchcomplete:true},"ru",at),[]);
 A.deepEqual(C.wikiReferenceCards({query:{pages:[{...page,extract:""}]}},"en",at),[]);
 A.throws(()=>C.wikiReferenceCards({query:{pages:[page,page]}},"en",at));
 A.throws(()=>C.wikiReferenceCards({query:{pages:[{...page,ns:1}]}},"en",at));
 A.throws(()=>C.wikiReferenceCards({error:{code:"maxlag"}},"en",at));
 A.ok(C.wikiExplanationPrompt("history",rows)[0].content.includes("не проверенная научная база"));
 async function checks(){
  const fetched=await C.fetchWikiReferences("history","en",async(url,options)=>{A.ok(url.startsWith("https://en.wikipedia.org/"));A.equal(options.credentials,"omit");A.equal(options.redirect,"error");return {ok:true,text:async()=>JSON.stringify(data)}},null,at);
  A.equal(fetched.length,2);
  await A.rejects(()=>C.fetchWikiReferences("history","en",async()=>({ok:false}),null,at));
  await A.rejects(()=>C.fetchWikiReferences("history","en",async()=>({ok:true,text:async()=>"x".repeat(65537)}),null,at));
  console.log("22 online reference checks passed");
 }
 checks().catch(e=>{console.error(e);process.exitCode=1;});
}


 // v1.16: two language editions, independent transport failures and context budget.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const plan=C.wikiReferencePlan("история","both","history");
  A.deepEqual(plan,[{language:"ru",query:"история"},{language:"en",query:"history"}]);
  A.deepEqual(C.wikiReferencePlan(" history ","en"),[{language:"en",query:"history"}]);
  A.throws(()=>C.wikiReferencePlan("история","both",""));
  A.throws(()=>C.wikiReferencePlan("history","xx",""));
  const body=(lang)=>JSON.stringify({query:{pages:[1,2].map(i=>({ns:0,pageid:i,lastrevid:i+10,title:lang+i,extract:"Reference "+i,index:i}))}});
  const ok=async(url,options)=>{A.equal(options.credentials,"omit");A.equal(options.redirect,"error");return {ok:true,text:async()=>body(url.includes("//ru.")?"ru":"en")}};
  async function bilingualChecks(){
   const both=await C.fetchWikiComparison(plan,ok,null,stamp);
   A.deepEqual(both.rows.map(r=>r.id),["wiki-ru-1","wiki-en-1","wiki-ru-2","wiki-en-2"]);
   A.deepEqual(both.coverage.map(r=>[r.status,r.count]),[["ok",2],["ok",2]]);
   const partial=await C.fetchWikiComparison(plan,async(url,o)=>url.includes("//en.")?{ok:false}:ok(url,o),null,stamp);
   A.equal(partial.rows.length,2);A.equal(partial.coverage[1].status,"unavailable");
   const empty=await C.fetchWikiComparison(plan,async()=>({ok:true,text:async()=>JSON.stringify({batchcomplete:true})}),null,stamp);
   A.equal(empty.rows.length,0);A.ok(empty.coverage.every(r=>r.status==="empty"));
   const timed=await C.fetchWikiComparison(plan,async()=>{throw Error("aborted")},{aborted:true},stamp);
   A.ok(timed.coverage.every(r=>r.status==="timeout"));
   await A.rejects(()=>C.fetchWikiComparison([plan[0],plan[0]],ok,null,stamp));
   const full=C.wikiBudgetSelection("история",both.rows,both.coverage);
   A.equal(full.length,4);
   const max=C.utf8Size(JSON.stringify(C.wikiExplanationPrompt("история",both.rows.slice(0,2),both.coverage)));
   const selected=C.wikiBudgetSelection("история",both.rows,both.coverage,max);
   A.equal(selected.length,2);A.deepEqual(selected.map(r=>r.id),["wiki-ru-1","wiki-en-1"]);
   A.equal(C.wikiBudgetSelection("история",both.rows,both.coverage,1).length,0);
   A.ok(C.wikiExplanationPrompt("история",partial.rows,partial.coverage)[0].content.includes("не считай их независимыми подтверждениями"));
   A.equal(JSON.parse(C.wikiExplanationPrompt("история",partial.rows,partial.coverage)[1].content).coverage[1].status,"unavailable");
   console.log("v1.16 bilingual reference checks passed");
  }
  bilingualChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.17: live bibliographic search; never treat metadata as findings.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const item={DOI:"10.1234/Example(1)",title:["Economic planning"],author:[{given:"A",family:"B"}],published:{"date-parts":[[2025]]},"container-title":["Journal"],type:"journal-article"};
  const data={status:"ok","message-type":"work-list",message:{items:[item,{...item,DOI:"10.1234/example(1)"},{...item,DOI:"https://bad.org"},{...item,DOI:"10.1234/no-title",title:[]}]}};
  A.ok(C.crossrefSearchUrl("экономика & право").endsWith(encodeURIComponent("экономика & право")));
  A.throws(()=>C.crossrefSearchUrl(""));A.throws(()=>C.crossrefSearchUrl("x\ny"));A.throws(()=>C.crossrefSearchUrl("a".repeat(241)));
  const cards=C.crossrefReferenceCards(data,stamp);
  A.equal(cards.length,1);A.equal(cards[0].doi,"10.1234/example(1)");A.ok(cards[0].href.startsWith("https://doi.org/10.1234/"));
  A.ok(cards[0].description.includes("2025"));A.ok(cards[0].description.includes("A B"));A.ok(cards[0].limit.includes("Аннотация и полный текст не получены"));
  A.throws(()=>C.crossrefReferenceCards(data,"invalid"));A.throws(()=>C.crossrefReferenceCards({status:"failed"},stamp));
  A.deepEqual(C.crossrefReferenceCards({...data,message:{items:[]}},stamp),[]);
  A.ok(C.literatureExplanationPrompt("x",cards)[0].content.includes("нельзя утверждать результаты"));
  A.equal(JSON.parse(C.literatureExplanationPrompt("x",cards)[1].content).cards[0].id,"crossref-1");
  async function literatureChecks(){
   const found=await C.fetchCrossrefReferences("planning",async(url,opts)=>{A.ok(url.startsWith("https://api.crossref.org/works?"));A.equal(opts.credentials,"omit");A.equal(opts.redirect,"error");return {ok:true,text:async()=>JSON.stringify(data)}},null,stamp);
   A.equal(found.length,1);
   await A.rejects(()=>C.fetchCrossrefReferences("x",async()=>({ok:false,status:429}),null,stamp));
   await A.rejects(()=>C.fetchCrossrefReferences("x",async()=>({ok:true,text:async()=>"{invalid"}),null,stamp));
   await A.rejects(()=>C.fetchCrossrefReferences("x",async()=>({ok:true,text:async()=>"x".repeat(262145)}),null,stamp));
   console.log("v1.17 live literature checks passed");
  }
  literatureChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.18: federated search keeps independent provider status and evidence boundaries.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const wiki=JSON.stringify({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}});
  const papers=JSON.stringify({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/plan",title:["Planning"],type:"journal-article"}]}});
  const fetcher=async url=>({ok:true,text:async()=>url.includes("crossref")?papers:wiki});
  A.deepEqual(C.federatedReferencePlan("планирование"),[{language:"ru",query:"планирование"},{language:"crossref",query:"планирование"}]);
  A.deepEqual(C.federatedReferencePlan("планирование","planning").map(r=>r.query),["планирование","planning","planning"]);
  A.throws(()=>C.federatedReferencePlan("","planning"));
  A.throws(()=>C.federatedReferencePlan("x",123));
  A.throws(()=>C.federatedReferencePlan("x","a".repeat(241)));
  A.equal(C.federatedReferenceRank([{title:"Other"},{title:"Planning"}],"planning")[0].title,"Planning");
  A.equal(C.federatedReferenceRank([{title:"Other",doi:"x",description:"Planning"},{title:"Planning"}],"planning")[0].title,"Planning");
  async function federatedChecks(){
   const all=await C.fetchFederatedReferences("планирование","planning",fetcher,null,stamp);
   A.deepEqual(all.rows.map(r=>r.id),["wiki-ru-1","wiki-en-1","crossref-1"]);
   A.deepEqual(all.coverage.map(r=>r.status),["ok","ok","ok"]);
   const partial=await C.fetchFederatedReferences("планирование","planning",async u=>u.includes("crossref")?{ok:false,status:429}:fetcher(u),null,stamp);
   A.equal(partial.rows.length,2);A.equal(partial.coverage[2].status,"rate_limited");
   const failed=await C.fetchFederatedReferences("планирование","planning",async()=>{throw Error("offline")},null,stamp);
   A.equal(failed.rows.length,0);A.ok(failed.coverage.every(r=>r.status==="unavailable"));
   const timed=await C.fetchFederatedReferences("планирование","",async()=>{throw Error("timeout")},{aborted:true},stamp);
   A.ok(timed.coverage.every(r=>r.status==="timeout"));
   const context=C.onlineReferenceContext("планирование",all.rows,all.coverage,"federated");
   A.equal(context.selected.length,3);
   A.ok(context.messages[0].content.includes("название не подтверждает содержание"));
   A.equal(JSON.parse(context.messages[1].content).cards[2].kind,"Библиографическая запись Crossref");
   A.equal(C.onlineReferenceContext("планирование",all.rows,all.coverage,"federated",1).selected.length,0);
   A.ok(C.onlineReferenceContext("x",all.rows.filter(r=>r.doi),[],"papers").messages[0].content.includes("библиографических метаданных"));
   A.ok(C.onlineReferenceContext("x",all.rows.filter(r=>!r.doi),[],"both").messages[0].content.includes("Википедии"));
   console.log("v1.18 federated reference checks passed");
  }
  federatedChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.19: Europe PMC excerpts, licensing, deduplication and partial failure.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const row={source:"MED",id:"123",title:"Health economics",doi:"10.1234/plan",authorString:"A B",pubYear:"2025",isOpenAccess:"Y",license:"cc by",abstractText:"<b>Economic</b> study"};
  const data={hitCount:4,resultList:{result:[row,{...row,id:"124",license:"unknown",doi:"10.1234/other"},{...row,id:"125",isOpenAccess:"N",doi:null},{...row,id:"../bad"}]}};
  A.ok(C.epmcSearchUrl("health & economics").endsWith(encodeURIComponent("health & economics")));
  A.throws(()=>C.epmcSearchUrl(""));A.throws(()=>C.epmcSearchUrl("x\ny"));
  const cards=C.epmcReferenceCards(data,stamp);
  A.equal(cards.length,3);A.equal(cards[0].abstractAvailable,true);A.ok(cards[0].description.includes("Economic study"));
  A.equal(cards[0].href,"https://europepmc.org/article/MED/123");
  A.equal(cards[1].abstractAvailable,false);A.equal(cards[2].abstractAvailable,false);A.ok(!cards[1].description.includes("study"));
  A.equal(C.epmcReferenceCards({hitCount:1,resultList:{result:[{...row,abstractText:"x".repeat(1200)}]}},stamp)[0].description.endsWith("x".repeat(900)),true);
  A.throws(()=>C.epmcReferenceCards(data,"invalid"));A.throws(()=>C.epmcReferenceCards({hitCount:-1},stamp));
  A.deepEqual(C.epmcReferenceCards({hitCount:0,resultList:{result:[]}},stamp),[]);
  const wiki=JSON.stringify({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}});
  const papers=JSON.stringify({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/plan",title:["Planning"],type:"journal-article"}]}});
  const fetcher=async url=>({ok:true,text:async()=>url.includes("europepmc")?JSON.stringify(data):url.includes("crossref")?papers:wiki});
  async function extendedChecks(){
   const all=await C.fetchExtendedResearch("экономика","health economics",fetcher,null,stamp);
   A.equal(all.coverage.length,4);A.equal(all.rows.length,5);
   const merged=all.rows.find(r=>r.doi==="10.1234/plan");
   A.equal(merged.abstractAvailable,true);A.deepEqual(merged.providers,["Crossref","Europe PMC"]);
   A.ok(merged.limit.includes("не является независимым подтверждением"));
   const partial=await C.fetchExtendedResearch("экономика","health economics",async u=>u.includes("europepmc")?{ok:false,status:429}:fetcher(u),null,stamp);
   A.equal(partial.rows.length,3);A.equal(partial.coverage[3].status,"rate_limited");
   const direct=await C.fetchEpmcReferences("health",async(u,o)=>{A.equal(o.credentials,"omit");A.equal(o.redirect,"error");return fetcher(u)},null,stamp);
   A.equal(direct.length,3);
   await A.rejects(()=>C.fetchEpmcReferences("x",async()=>({ok:true,text:async()=>"{invalid"}),null,stamp));
   await A.rejects(()=>C.fetchEpmcReferences("x",async()=>({ok:true,text:async()=>"x".repeat(1048577)}),null,stamp));
   const ctx=C.onlineReferenceContext("экономика",all.rows,all.coverage,"research");
   A.ok(ctx.selected.length>0);A.ok(ctx.messages[0].content.includes("Препринты"));
   A.ok(ctx.messages[0].content.includes("не проверенные выводы"));
   console.log("v1.19 extended research checks passed");
  }
  extendedChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.20 source suitability and catalog metadata discrepancy checks.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const a=C.crossrefReferenceCards({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/plan",title:["Economic planning"],published:{"date-parts":[[2024]]},type:"posted-content"}]}},stamp)[0];
  const b=C.epmcReferenceCards({hitCount:1,resultList:{result:[{source:"MED",id:"123",title:"Health economics",doi:"10.1234/plan",pubYear:"2025",isOpenAccess:"Y",license:"cc by",abstractText:"Study"}]}},stamp)[0];
  A.equal(a.publicationYear,2024);A.equal(b.publicationYear,2025);
  A.equal(a.preprint,true);
  const merged=C.mergeResearchReferences([a,b]);
  A.equal(merged.length,1);A.equal(merged[0].abstractAvailable,true);
  A.equal(merged[0].preprint,true);
  A.deepEqual(merged[0].metadataDifferences.map(d=>d.field),["title","year"]);
  A.equal(merged[0].metadataRecords.length,2);
  A.equal(merged[0].metadataDifferences[0].values[0].href,a.href);
  A.deepEqual(C.referenceMetadataDifferences([{title:"Economic planning!",year:2024},{title:" ECONOMIC planning ",year:null}]),[]);
  A.deepEqual(C.referenceMetadataDifferences([{title:"Same",year:2024},{title:"Same",year:2025}]).map(d=>d.field),["year"]);
  const report=C.onlineSourceAudit([...merged,{id:"wiki-ru-1"},{id:"crossref-2"}],[{status:"timeout"}]);
  A.deepEqual(report.counts,{reference:1,abstract:1,metadata:1,preprint:1,merged:1,disputed:1});
  A.equal(report.fullTextVerified,false);A.equal(report.independentFindingsVerified,false);
  A.ok(report.gaps.some(x=>x.includes("неполное")));A.ok(report.gaps.some(x=>x.includes("издателя")));
  A.ok(C.onlineSourceAudit([],[]).gaps.some(x=>x.includes("Нет доступных аннотаций")));
  A.ok(C.extendedResearchPrompt("x",merged)[0].content.includes("без проверки у издателя"));
  A.deepEqual(C.epmcReferenceCards({hitCount:1,resultList:{result:[{source:"MED",id:"..",title:"Invalid"}]}},stamp),[]);
  console.log("v1.20 source suitability checks passed");
 }


 // v1.21–1.23 automatic research, run-local citations, bounded repair.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const plan=C.automaticOnlinePlan("Что такое планирование?","what is planning?");
  A.equal(plan.length,2);A.equal(plan[1].query,"планирование");A.equal(plan[1].english,"planning");
  A.equal(C.automaticOnlinePlan("экономика")[1].query,"экономика исследования");
  A.throws(()=>C.automaticOnlinePlan(""));A.throws(()=>C.automaticOnlinePlan("x","a".repeat(241)));
  const wiki={id:"wiki-ru-1",href:"https://ru.wikipedia.org/w/index.php?oldid=3",revision:3,title:"Planning",description:"Planning",limit:"Reference"};
  const a={id:"crossref-1",href:"https://doi.org/10.1234/one",doi:"10.1234/one",title:"One",description:"2025",limit:"Metadata"};
  const b={...a,href:"https://doi.org/10.1234/two",doi:"10.1234/two",title:"Two"};
  const unique=C.consolidateOnlineRuns([{rows:[wiki,a]},{rows:[wiki,b]}]);
  A.equal(unique.length,3);A.equal(new Set(unique.map(r=>r.id)).size,3);
  A.equal(unique[0].id,"wiki-run-1");A.equal(unique[2].id,"source-run-3");
  A.equal(C.onlineDraftAudit("Planning [wiki-run-1]",unique).passed,true);
  A.equal(C.onlineDraftAudit("Planning",unique).passed,false);
  A.ok(C.onlineDraftAudit("Planning [fake]",unique).flags.includes("unknown_ids"));
  const wikiJSON=JSON.stringify({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}});
  const papers=JSON.stringify({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/one",title:["One"],type:"journal-article"}]}});
  const empty=JSON.stringify({hitCount:0,resultList:{result:[]}});
  const epmc=JSON.stringify({hitCount:1,resultList:{result:[{source:"MED",id:"123",title:"Study",isOpenAccess:"Y",license:"cc by",abstractText:"Planning study"}]}});
  async function autoChecks(){
   let calls=0;
   const fetcher=async url=>{calls++;return {ok:true,text:async()=>url.includes("europepmc")?empty:url.includes("crossref")?papers:wikiJSON}};
   const run=await C.runAutomaticOnlineResearch("Что такое планирование?","what is planning?",fetcher,null,stamp);
   A.equal(run.completed,2);A.equal(calls,8);A.equal(run.coverage.length,8);A.equal(run.rows.length,3);
   A.equal(new Set(run.rows.map(r=>r.id)).size,run.rows.length);
   A.equal(run.coverage[4].step,2);
   const satisfied=await C.runAutomaticOnlineResearch("планирование","planning",async url=>({ok:true,text:async()=>url.includes("europepmc")?epmc:url.includes("crossref")?papers:wikiJSON}),null,stamp);
   A.equal(satisfied.completed,1);A.equal(satisfied.cancelled,false);
   const cancelled=await C.runAutomaticOnlineResearch("планирование","",fetcher,{aborted:true},stamp);
   A.equal(cancelled.completed,0);A.equal(cancelled.cancelled,true);
   const selected=[unique[0]],good="Planning [wiki-run-1]";
   let generated=0;const fix=async m=>{generated++;A.ok(m[0].content.includes("Исправь черновик"));return good;};
   A.equal((await C.repairOnlineDraft(good,"x",selected,[],"auto",fix)).state,"initial_pass");
   A.equal(generated,0);
   const repaired=await C.repairOnlineDraft("Planning","x",selected,[],"auto",fix);
   A.equal(repaired.state,"repaired");A.equal(repaired.answer,good);A.equal(generated,1);
   A.equal((await C.repairOnlineDraft("Planning","x",selected,[],"auto",async()=>"bad")).state,"repair_failed");
   A.equal((await C.repairOnlineDraft("Planning","x",selected,[],"auto",fix,()=>false)).state,"cancelled");
   A.equal((await C.repairOnlineDraft("Planning","x",selected,[],"auto",fix,()=>true,1)).state,"budget_exceeded");
   A.equal((await C.repairOnlineDraft("Planning","x",selected,[],"auto",async()=>{throw Error("offline")})).state,"repair_unavailable");
   console.log("v1.21–1.23 automatic research checks passed");
  }
  autoChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.24–1.26: explicit local research memory, source fidelity and comparison.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const wiki=C.wikiReferenceCards({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}},"en",stamp)[0];
  const a=C.crossrefReferenceCards({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/plan",title:["Economic planning"],published:{"date-parts":[[2024]]},type:"posted-content"}]}},stamp)[0];
  const b=C.epmcReferenceCards({hitCount:1,resultList:{result:[{source:"MED",id:"123",title:"Health economics",doi:"10.1234/plan",pubYear:"2025",isOpenAccess:"Y",license:"cc by",abstractText:"Study"}]}},stamp)[0];
  const rows=[wiki,...C.mergeResearchReferences([a,b])];
  const entry={id:"study-1",saved:stamp,mode:"research",question:"economic planning",rows,coverage:[{language:"en",query:"planning",status:"ok",count:1},{language:"crossref",query:"planning",status:"ok",count:1},{language:"epmc",query:"planning",status:"ok",count:1}]};
  const lib=C.addOnlineResearch([],entry);
  A.equal(lib.length,1);A.equal(lib[0].rows[0].href,wiki.href);A.equal(lib[0].rows[0].history,wiki.history);
  A.equal(lib[0].rows[1].license,"cc by");A.equal(lib[0].rows[1].preprint,true);
  A.equal(lib[0].rows[1].metadataDifferences.length,2);
  A.deepEqual(C.onlineResearchLibrary(JSON.parse(JSON.stringify(lib))),lib);
  A.equal(C.onlineSourceAudit(lib[0].rows,lib[0].coverage).counts.disputed,1);
  A.equal(C.findOnlineResearch(lib,"planning").length,1);A.equal(C.findOnlineResearch(lib,"unrelated").length,0);
  A.equal(C.findOnlineResearch(lib,"").length,1);
  A.throws(()=>C.addOnlineResearch(lib,entry));
  A.throws(()=>C.onlineResearchLibrary([{...entry,rows:[wiki,wiki]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,rows:[{...wiki,href:"javascript:alert(1)"}]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,rows:[{...wiki,history:"https://bad.example"}]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,rows:[{...b,license:"unknown"}]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,rows:[{...a,href:"https://doi.org/10.1234/wrong"}]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,coverage:[{language:"epmc",query:"x",status:"timeout",count:1}]}]));
  A.throws(()=>C.onlineResearchLibrary([{...entry,saved:"2026-11-27T10:00:00.000Z"}]));
  A.throws(()=>C.onlineResearchLibrary(Array.from({length:21},(_,i)=>({...entry,id:"study-"+i}))));
  A.equal(C.onlineMemoryUrl("https://europepmc.org/article/MED/.."),false);
  A.equal(C.onlineMemoryUrl("https://evil.example/https://doi.org/10.1234/plan"),false);
  const same=C.onlineResearchComparison(entry,entry);
  A.deepEqual([same.added,same.missing,same.changed],[[],[],[]]);
  const diff=C.onlineResearchComparison(entry,{...entry,id:"study-2",question:"other",rows:[{...wiki,description:"Revised"},a]});
  A.equal(diff.sameQuestion,false);A.equal(diff.changed.length,2);A.equal(diff.added.length,0);
  const subset=C.onlineResearchComparison(entry,{...entry,id:"study-3",rows:[wiki]});
  A.equal(subset.missing.length,1);A.ok(subset.note.includes("не означают"));
  console.log("v1.24–1.26 research memory checks passed");
 }


 // v1.27–1.29: coordinated local model roles, evidence scope and failure isolation.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const rows=[{id:"wiki-ru-1",title:"Planning",description:"Planning",kind:"Reference",limit:"Limited"},{id:"source-run-2",title:"Study",description:"Study",abstractAvailable:true,kind:"Abstract",limit:"Limited"},{id:"crossref-1",title:"Work",description:"Work",kind:"Metadata",limit:"Limited"}];
  const drafts={reference:"Planning [wiki-ru-1]",abstract:"Study [source-run-2]",bibliography:"Work [crossref-1]",synthesis:"Planning [wiki-ru-1]. Study [source-run-2]. Work [crossref-1]"};
  const plan=C.onlineAgentPlan(rows,"planning");
  A.deepEqual(plan.map(p=>p.role),["reference","abstract","bibliography"]);
  A.deepEqual(plan.map(p=>p.selected.map(r=>r.id)),[["wiki-ru-1"],["source-run-2"],["crossref-1"]]);
  A.throws(()=>C.onlineAgentPlan([...rows,rows[0]],"planning"));
  A.throws(()=>C.onlineAgentPlan(rows,""));
  A.throws(()=>C.onlineAgentPrompt("x","invalid",rows));
  A.ok(C.onlineAgentPrompt("x","bibliography",[rows[2]])[0].content.includes("Не утверждай их содержание"));
  A.ok(C.onlineAgentPrompt("x","abstract",[rows[1]])[0].content.includes("только утверждения авторов"));
  async function agentTeamChecks(){
   const progress=[],calls=[];
   const result=await C.runOnlineAgentTeam("planning",rows,[],async(m,role)=>{calls.push(role);return drafts[role];},()=>true,r=>progress.push(r));
   A.equal(result.state,"accepted");A.equal(result.partial,false);A.equal(result.answer,drafts.synthesis);
   A.equal(result.reports.length,3);A.equal(result.rolesUsed.length,3);
   A.deepEqual(calls,["reference","abstract","bibliography","synthesis"]);A.deepEqual(progress,calls);
   A.deepEqual(result.selected,rows.map(r=>r.id));
   const crossRole=await C.runOnlineAgentTeam("planning",rows,[],async(m,role)=>role==="reference"?"Work [crossref-1]":role==="synthesis"?"Study [source-run-2]":drafts[role]);
   A.equal(crossRole.reports[0].status,"rejected");A.equal(crossRole.reports[0].answer,null);
   A.equal(crossRole.state,"accepted");A.equal(crossRole.partial,true);
   const broken=await C.runOnlineAgentTeam("planning",rows,[],async(m,role)=>{if(role==="abstract")throw Error("offline");return role==="synthesis"?"Planning [wiki-ru-1]":drafts[role];});
   A.equal(broken.reports[1].status,"unavailable");A.equal(broken.state,"accepted");
   const fake=await C.runOnlineAgentTeam("planning",rows,[],async(m,role)=>role==="synthesis"?"Unknown [invented]":drafts[role]);
   A.equal(fake.state,"synthesis_rejected");A.equal(fake.answer,null);
   const noCite=await C.runOnlineAgentTeam("planning",rows,[],async()=>"No citation");
   A.equal(noCite.state,"no_accepted_drafts");A.equal(noCite.answer,null);
   let count=0;const cancelled=await C.runOnlineAgentTeam("planning",rows,[],async()=>{count++;return drafts.reference;},()=>count===0);
   A.equal(cancelled.state,"cancelled");A.equal(count,1);
   const small=await C.runOnlineAgentTeam("planning",rows,[],async()=>{throw Error("must not call")},()=>true,()=>{},1);
   A.equal(small.state,"no_accepted_drafts");A.ok(small.reports.every(r=>r.status==="budget_exceeded"));
   const empty=await C.runOnlineAgentTeam("planning",[],[],async()=>{throw Error("must not call")});
   A.equal(empty.state,"no_accepted_drafts");A.ok(empty.reports.every(r=>r.status==="no_evidence"));
   const failed=await C.runOnlineAgentTeam("planning",rows,[],async(m,role)=>{if(role==="synthesis")throw Error("offline");return drafts[role];});
   A.equal(failed.state,"synthesis_unavailable");
   const synthesis=C.onlineTeamSynthesis("planning",rows,[],result.reports,1);
   A.equal(synthesis.notes.length,0);
   console.log("v1.27–1.29 agent coordination checks passed");
  }
  agentTeamChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.30–1.32: typed synthesis of internal economics and external literature.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const ar={fingerprint:"a".repeat(64),failed:0,found:[{id:"obs",kind:"Наблюдение",title:"Выпуск",description:"2025 · 100 тонн",value:100,period:"2025",unit:"тонн"},{id:"sc",kind:"Условный расчёт",title:"Сценарий",description:"120 тонн"},{id:"calc",kind:"Историческая проверка",title:"Ошибка прогноза",description:"5%"},{id:"status",kind:"Статус расчёта",title:"Нет данных",description:"Недоступно"}]};
  const ext=[{id:"wiki-ru-1",title:"Производство",description:"Справка"},{id:"obs",title:"Публикация",description:"2024",abstractAvailable:false}];
  const ev=C.hybridEvidence(ar,ext);
  A.equal(ev.rows.length,5);A.equal(ev.excluded,1);A.equal(ev.fingerprint,ar.fingerprint);
  A.deepEqual(ev.rows.map(r=>r.category),["observation","scenario","calculation","reference","bibliography"]);
  A.equal(new Set(ev.rows.map(r=>r.id)).size,5);A.equal(ev.rows[4].originalId,"obs");
  A.throws(()=>C.hybridEvidence({...ar,fingerprint:"bad"},ext));
  A.throws(()=>C.hybridEvidence(ar,[ext[0],ext[0]]));
  const context=C.hybridResearchContext("Выпуск","мрб: 9",ev,[]);
  A.equal(context.rows.length,5);A.equal(context.omitted,0);
  A.equal(C.hybridResearchContext("Выпуск","мрб: 9",ev,[],1).rows.length,0);
  const limit={type:"limitation",text:"Сценарий не является фактом.",refs:[]};
  const items=[{type:"observation",text:"100 тонн",refs:["arc-1"]},{type:"scenario",text:"120 тонн",refs:["arc-2"]},{type:"calculation",text:"5%",refs:["arc-3"]},{type:"reference",text:"Справка",refs:["web-4"]},limit];
  const raw=JSON.stringify(items);
  A.equal(C.validateHybridFindings(raw,ev.rows).ok,true);
  A.equal(C.validateHybridFindings(JSON.stringify([{...items[1],type:"observation"},limit]),ev.rows).reason,"source_class");
  A.equal(C.validateHybridFindings(JSON.stringify([{...items[0],refs:["web-5"]},limit]),ev.rows).reason,"source_class");
  A.equal(C.validateHybridFindings(JSON.stringify([{...items[0],text:"120 тонн"},limit]),ev.rows).reason,"numeric_evidence");
  A.equal(C.validateHybridFindings(JSON.stringify([{...items[0],text:"100 кг"},limit]),ev.rows).reason,"numeric_evidence");
  A.equal(C.validateHybridFindings(JSON.stringify([items[0]]),ev.rows).reason,"missing_limitation");
  A.equal(C.validateHybridFindings(JSON.stringify([{...limit,refs:["arc-1"]}]),ev.rows).reason,"source_count");
  A.equal(C.validateHybridFindings("invalid",ev.rows).reason,"json");
  async function hybridChecks(){
   const progress=[];let query="";
   const result=await C.runHybridResearch("Выпуск","мрб: 9",ext,[],async q=>{query=q;return ar},async m=>{A.ok(m[0].content.includes("не прогноз и не факт"));return raw},()=>true,x=>progress.push(x));
   A.equal(result.state,"accepted");A.equal(result.partial,true);A.equal(result.evidence.excluded,1);A.ok(C.researchChatTurn(result).note.includes("исключено архивных карточек"));A.equal(query,"мрб: 9");A.deepEqual(progress,["archive","synthesis"]);
   const failed=await C.runHybridResearch("Выпуск","мрб: 9",ext,[],async()=>{throw Error("offline")},async()=>raw);
   A.equal(failed.state,"archive_unavailable");
   const partial=await C.runHybridResearch("Выпуск","мрб: 9",ext,[{status:"timeout"}],async()=>({...ar,failed:1}),async()=>raw);
   A.equal(partial.partial,true);
   const rejected=await C.runHybridResearch("Выпуск","мрб: 9",ext,[],async()=>ar,async()=>JSON.stringify([items[0]]));
   A.equal(rejected.state,"rejected");
   const empty=await C.runHybridResearch("Выпуск","мрб: 9",[],[],async()=>({...ar,found:[]}),async()=>{throw Error("must not call")});
   A.equal(empty.state,"no_evidence");
   const cancelled=await C.runHybridResearch("Выпуск","мрб: 9",ext,[],async()=>ar,async()=>raw,()=>false);
   A.equal(cancelled.state,"cancelled");
   const broken=await C.runHybridResearch("Выпуск","мрб: 9",ext,[],async()=>ar,async()=>{throw Error("offline")});
   A.equal(broken.state,"model_unavailable");
   console.log("v1.30–1.32 hybrid economic research checks passed");
  }
  hybridChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.33–1.35: conservative natural-language routing and explicit intent previews.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const route=(q,tool,command)=>A.deepEqual(C.expandedNaturalRoute(q),{tool,command});
  route("Как изменилась производительность труда в России с 2020 по 2024 год?","productivity","производительность труда: 2024; база=2020");
  route("Покажи структуру энергетики России с 2020 года по 2024 год","energy","структура энергетики: 2024; база=2020");
  route("Покажи торговлю с США за январь–июнь 2024 года","trade","торговля с сша: 2024; месяцев=6");
  route("Покажи рынок труда за март 2024 года относительно 2020 года","labour","рынок труда: 2024-03; база=2020");
  route("Найди предприятие по ИНН 7707083893","company","ИНН: 7707083893");
  route("Сравни компании по ИНН 7707083893 и 7704211201","company","сравнить предприятия: 7707083893, 7704211201");
  route("Рассчитай МРБ отраслевой группы № 9","balance","мрб: 9");
  route("Оцени качество прогноза NY.GDP.MKTP.KD.ZG через 2 года","forecast","точность прогноза: ny.gdp.mktp.kd.zg; горизонт=2");
  route("Покажи производительность труда в 2024 году относительно 2020 года","productivity","производительность труда: 2024; база=2020");
  for(const q of ["Покажи производительность труда","Покажи производительность труда с 2024 по 2020 год","Покажи торговлю с США за январь–абракадабра 2024 года","Покажи рынок труда за несуществующий 2024 года относительно 2020 года","Найди предприятие по ИНН 123","Сравни компании по ИНН 7707083893 и 7707083893","Рассчитай МРБ группы 20","Не показывай межотраслевой баланс группы 9","Покажи межотраслевой баланс группы 9 и прогноз ВВП"])A.equal(C.expandedNaturalRoute(q),null);
  const a="Покажи межотраслевой баланс группы 9",b="проверь точность прогноза NY.GDP.MKTP.KD.ZG на 1 год";
  A.equal(C.implicitEconomicPlan(a+" и "+b).steps.length,2);
  A.equal(C.implicitEconomicPlan(a+" и "+a),null);
  A.equal(C.implicitEconomicPlan(a+" и объясни экономику"),null);
  A.equal(C.economicIntent(a+" и "+b).kind,"plan");
  A.equal(C.economicIntent(a).kind,"tool");
  A.equal(C.economicIntent("Покажи рынок труда").kind,"clarify");
  A.equal(C.economicIntent("Что такое межотраслевой баланс?").kind,"search");
  A.equal(C.economicIntent("Не показывай межотраслевой баланс группы 9").kind,"search");
  A.equal(C.economicIntent("Как развивается экономика России?").kind,"search");
  A.equal(C.economicIntent("мрб: 9").kind,"search");
  A.equal(C.economicIntent("").kind,"empty");
  A.equal(C.researchPlan("Исследование: "+a+" | Покажи рынок труда за март 2024 года относительно 2020 года").steps.length,2);
  A.equal(C.modelResearchPlan(JSON.stringify([a,"Найди предприятие по ИНН 7707083893"]),a+" 7707083893"),null);
  console.log("v1.33–1.35 intent routing checks passed");
 }

{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");const q="Сравни компании по ИНН 7707083893 и 7704211201";A.equal(C.economicIntent(q).kind,"tool");A.equal(C.researchPlan("Исследование: "+q+" | Покажи межотраслевой баланс группы 9").kind,"invalid");}


 // v1.36–1.38: opt-in contextual follow-up with validated inherited parameters.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const fp="a".repeat(64),entry=(question,route)=>({question,route,answer:"Старый ответ: 99999",page:"index.html",fingerprint:fp});
  const follow=(question,prior,command)=>A.equal(C.dialogueFollowup(question,[prior],true).route?.command,command);
  const a=entry("Покажи производительность труда в 2024 году относительно 2020 года");
  follow("А за 2023 год?",a,"производительность труда: 2023; база=2020");
  follow("А относительно 2019 года?",a,"производительность труда: 2024; база=2019");
  follow("А за 2022 год?",entry("А за 2023 год?","производительность труда: 2023; база=2020"),"производительность труда: 2022; база=2020");
  follow("А за 2023 год?",entry("Энергетика","структура энергетики: 2024; база=2020; порог=7.5"),"структура энергетики: 2023; база=2020; порог=7.5");
  follow("А за первые 6 месяцев?",entry("Торговля","торговля с сша: 2024; месяцев=9"),"торговля с сша: 2024; месяцев=6");
  follow("А за 2023 год?",entry("Торговля","торговля с сша: 2024; месяцев=9"),"торговля с сша: 2023; месяцев=9");
  follow("А за 2023-02?",entry("Рынок труда","рынок труда: 2024-03; база=2020"),"рынок труда: 2023-02; база=2020");
  follow("А на горизонте 2 года?",entry("Прогноз","точность прогноза: NY.GDP.MKTP.KD.ZG; горизонт=1"),"точность прогноза: NY.GDP.MKTP.KD.ZG; горизонт=2");
  follow("А для группы 10?",entry("Баланс","мрб: 9"),"мрб: 10");
  A.equal(C.dialogueFollowup("А за 2023 год?",[a],false).kind,"clarify");
  A.equal(C.dialogueFollowup("А за 2023 год?",[],true).kind,"clarify");
  A.equal(C.dialogueFollowup("А за 2018 год?",[a],true).kind,"clarify");
  A.equal(C.dialogueFollowup("А для группы 10?",[a],true).kind,"clarify");
  A.equal(C.dialogueFollowup("А за 2023 год?",[a,entry("Что такое экономика?")],true).kind,"clarify");
  A.equal(C.dialogueFollowup("А почему?",[a],true).kind,"none");
  A.equal(C.dialogueFollowup("Не за 2023 год",[a],true).kind,"none");
  A.equal(C.dialogueFollowup("А за 2023 год? и удали архив",[a],true).kind,"none");
  A.equal(C.dialogueFollowup("А для группы 20?",[entry("Баланс","мрб: 9")],true).kind,"clarify");
  A.equal(C.dialogueToolRoute("шок спроса: 9; 10"),null);
  A.equal(C.dialogueToolRoute("мрб: 20"),null);
  A.equal(C.dialogueToolRoute("удали архив"),null);
  A.equal(C.dialogueHistory([entry("Уточнение","мрб: 9")])[0].route,"мрб: 9");
  A.equal(C.dialogueHistory([entry("Уточнение","удали архив")])[0].route,undefined);
  A.equal(C.dialogueAppend([] ,entry("Уточнение","мрб: 9"))[0].route,"мрб: 9");
  A.equal(C.dialogueSnapshotNote(fp,fp).sameSnapshot,true);
  A.equal(C.dialogueSnapshotNote(fp,"b".repeat(64)).sameSnapshot,false);
  A.ok(C.dialogueSnapshotNote(fp,"b".repeat(64)).note.includes("обновление данных"));
  A.throws(()=>C.dialogueSnapshotNote("bad",fp));
  A.ok(!JSON.stringify(C.dialogueFollowup("А за 2023 год?",[a],true)).includes("99999"));
  console.log("v1.36–1.38 contextual dialogue checks passed");
 }


 // v1.39–1.41: explicit ephemeral multimodal context and source-class isolation.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const table={id:"local-mean",kind:"Локальный расчёт",title:"Среднее",description:"100 тонн",limit:"Не проверено",value:100,unit:"тонн",period:""};
  const doc={id:"doc-0",kind:"Фрагмент пользовательского документа",title:"Документ",description:"Текст документа",limit:"Фрагмент"};
  const ocr={...doc,id:"doc-30",kind:"Распознанный текст изображения",description:"Распознанный текст"};
  const chart={...table,id:"chart-last",kind:"Оценка по изображению",title:"Оценка",description:"120 тонн",value:120};
  const basket={table:[table],document:[doc,ocr],chart:[chart]};
  A.deepEqual(C.localResearchBasket(basket),basket);
  A.throws(()=>C.localResearchBasket({other:[doc]}));
  A.throws(()=>C.localResearchBasket({table:[doc]}));
  A.throws(()=>C.localResearchBasket({document:[doc,doc]}));
  A.throws(()=>C.localResearchBasket({table:[{...table,value:Infinity}]}));
  A.throws(()=>C.localResearchBasket({document:[{...doc,description:"x".repeat(1001)}]}));
  A.equal(C.localResearchBasket({document:[{...doc,href:"https://bad.example"}]}).document[0].href,undefined);
  const local=C.multimodalEvidence(null,[],basket);
  A.equal(local.fingerprint,null);A.equal(local.rows.length,4);
  A.deepEqual(local.rows.map(r=>r.category),["local_table","local_document","local_ocr","local_chart"]);
  const archive={fingerprint:"a".repeat(64),failed:0,found:[{id:"obs",kind:"Наблюдение",title:"Выпуск",description:"100 тонн",value:100,unit:"тонн",period:"2025"}]};
  const online=[{id:"wiki-ru-1",title:"Справка",description:"Справка"}];
  const combined=C.multimodalEvidence(archive,online,basket);
  A.equal(combined.rows.length,6);A.equal(combined.fingerprint,archive.fingerprint);
  A.equal(new Set(combined.rows.map(r=>r.id)).size,6);
  const context=C.multimodalContext("Сравнение",combined,[]);
  A.equal(context.rows.length,6);A.equal(context.omitted,0);
  A.equal(C.multimodalContext("Сравнение",combined,[],1).rows.length,0);
  const limit={type:"limitation",text:"Нужна сверка.",refs:[]};
  const raw=JSON.stringify([{type:"local_table",text:"100 тонн",refs:["loc-1"]},{type:"local_ocr",text:"Распознанный текст",refs:["loc-3"]},limit]);
  async function multimodalChecks(){
   const result=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async messages=>{A.ok(messages[0].content.includes("не официальная статистика"));return raw;});
   A.equal(result.state,"accepted");A.equal(result.evidence.fingerprint,null);
   A.equal(result.partial,false);
   const falseObs=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async()=>JSON.stringify([{type:"observation",text:"100 тонн",refs:["loc-1"]},limit]));
   A.equal(falseObs.state,"rejected");A.equal(falseObs.checked.reason,"source_class");
   const falseOcr=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async()=>JSON.stringify([{type:"local_document",text:"Текст",refs:["loc-3"]},limit]));
   A.equal(falseOcr.checked.reason,"source_class");
   const wrongNumber=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async()=>JSON.stringify([{type:"local_table",text:"120 тонн",refs:["loc-1"]},limit]));
   A.equal(wrongNumber.checked.reason,"numeric_evidence");
   const joint=await C.runMultimodalResearch("Сравнение",basket,online,[],async()=>archive,async()=>JSON.stringify([{type:"observation",text:"100 тонн",refs:["arc-1"]},{type:"local_chart",text:"120 тонн",refs:["loc-6"]},limit]));
   A.equal(joint.state,"accepted");A.equal(joint.evidence.fingerprint,archive.fingerprint);
   const noData=await C.runMultimodalResearch("Сравнение",{},[],[],null,async()=>{throw Error("must not call")});
   A.equal(noData.state,"no_evidence");
   const failed=await C.runMultimodalResearch("Сравнение",basket,[],[],async()=>{throw Error("offline")},async()=>raw);
   A.equal(failed.state,"archive_unavailable");
   const cancelled=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async()=>raw,()=>false);
   A.equal(cancelled.state,"cancelled");
   const broken=await C.runMultimodalResearch("Сравнение",basket,[],[],null,async()=>{throw Error("offline")});
   A.equal(broken.state,"model_unavailable");
   A.equal(C.validateHybridFindings(raw,local.rows).ok,false);
   console.log("v1.39–1.41 multimodal research checks passed");
  }
  multimodalChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.42–1.44: approved unified research, separate public queries and partial failures.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const basket={document:[{id:"doc-0",kind:"Фрагмент пользовательского документа",title:"Документ",description:"PRIVATE_LOCAL_TEXT",limit:"Не проверено"}]};
  const raw=JSON.stringify([{type:"local_document",text:"PRIVATE_LOCAL_TEXT",refs:["loc-1"]},{type:"limitation",text:"Нужна сверка.",refs:[]}]);
  const p=C.unifiedResearchPlan("Частный вопрос",{archive:true,archiveQuery:"мрб: 9",local:true});
  A.equal(p.archiveQuery,"мрб: 9");A.equal(p.online,null);A.equal(p.local,true);
  A.throws(()=>C.unifiedResearchPlan("x",{}));
  A.throws(()=>C.unifiedResearchPlan("x",{web:true}));
  A.throws(()=>C.unifiedResearchPlan("x",{web:true,webQuery:""}));
  A.throws(()=>C.unifiedResearchPlan("Покажи рынок труда",{archive:true}));
  const w=C.unifiedResearchPlan("PRIVATE_QUESTION",{web:true,webQuery:"planning",englishQuery:"planning",local:true});
  A.equal(w.online.maxRequests,8);A.equal(w.online.steps.length,2);
  A.equal(C.unifiedResearchPlan("x",{web:true,webQuery:"planning"}).online.maxRequests,6);
  A.ok(!JSON.stringify(w.online).includes("PRIVATE_QUESTION"));
  async function unifiedChecks(){
   const failed=await C.runUnifiedResearch(p,basket,{archiveSearch:async()=>{throw Error("offline")},generate:async()=>raw});
   A.equal(failed.state,"accepted");A.equal(failed.partial,true);A.equal(failed.stages[0].status,"unavailable");
   A.equal(failed.stages[1].status,"ok");
   const local=C.unifiedResearchPlan("x",{local:true});
   const localResult=await C.runUnifiedResearch(local,basket,{fetcher:async()=>{throw Error("no network")},generate:async()=>raw});
   A.equal(localResult.state,"accepted");A.equal(localResult.partial,false);
   const urls=[];
   const wiki=JSON.stringify({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}});
   const papers=JSON.stringify({status:"ok","message-type":"work-list",message:{items:[]}});
   const empty=JSON.stringify({hitCount:0,resultList:{result:[]}});
   const web=await C.runUnifiedResearch(w,basket,{stamp,fetcher:async url=>{urls.push(url);return {ok:true,text:async()=>url.includes("europepmc")?empty:url.includes("crossref")?papers:wiki}},generate:async m=>{const r=JSON.parse(m[1].content).rows.find(x=>x.category==="local_document");return JSON.stringify([{type:"local_document",text:"PRIVATE_LOCAL_TEXT",refs:[r.id]},{type:"limitation",text:"Нужна сверка.",refs:[]}]);}});
   A.equal(web.state,"accepted");A.equal(web.partial,true);
   A.equal(urls.length,8);A.ok(urls.every(u=>!u.includes("PRIVATE_LOCAL_TEXT")&&!u.includes("PRIVATE_QUESTION")));
   A.equal(web.stages[0].stage,"online");
   await A.rejects(()=>C.runUnifiedResearch({...w,online:{...w.online,maxRequests:99}},basket,{generate:async()=>raw}));
   const cancelled=await C.runUnifiedResearch(w,basket,{active:()=>false,generate:async()=>{throw Error("must not call")}});
   A.equal(cancelled.state,"cancelled");
   const emptyResult=await C.runUnifiedResearch(local,{}, {generate:async()=>{throw Error("must not call")}});
   A.equal(emptyResult.state,"no_evidence");A.equal(emptyResult.partial,true);
   const denied=C.unifiedResearchPlan("x",{archive:true});
   const notLocal=await C.runUnifiedResearch(denied,basket,{archiveSearch:async()=>({fingerprint:"a".repeat(64),found:[],failed:0}),generate:async()=>{throw Error("must not call")}});
   A.equal(notLocal.state,"no_evidence");
   console.log("v1.42–1.44 unified research checks passed");
  }
  unifiedChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.45–1.47: dataset metadata discovery, cross-catalog provenance and memory.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const stamp="2026-11-28T10:00:00.000Z";
  const item={type:"dois",id:"10.1234/data",attributes:{doi:"10.1234/data",titles:[{title:"Economic data"}],creators:[{name:"A"}],publisher:{name:"Repository"},publicationYear:2024,types:{resourceTypeGeneral:"Dataset"},url:"https://bad.example/file",descriptions:[{description:"999999 tonnes"}]}};
  const fixture={data:[item]};
  const rows=C.dataciteReferenceCards(fixture,stamp),r=rows[0];
  A.equal(rows.length,1);A.equal(r.source,"datacite");A.equal(r.resourceType,"Dataset");A.equal(r.abstractAvailable,false);A.equal(r.href,"https://doi.org/10.1234/data");
  A.ok(r.description.includes("Repository"));A.ok(!r.description.includes("999999"));A.ok(r.limit.includes("Сами файлы"));
  A.equal(C.dataciteReferenceCards({data:[item,item]},stamp).length,1);
  A.equal(C.dataciteReferenceCards({data:[{...item,id:"10.1234/other"}]},stamp).length,0);
  A.equal(C.dataciteReferenceCards({data:[{...item,attributes:{...item.attributes,types:{resourceTypeGeneral:"Text"}}}]},stamp).length,0);
  A.throws(()=>C.dataciteReferenceCards({data:Array(6).fill(item)},stamp));
  A.throws(()=>C.dataciteReferenceCards(fixture,"invalid"));
  A.throws(()=>C.dataciteSearchUrl(""));A.throws(()=>C.dataciteSearchUrl("a".repeat(241)));
  A.ok(C.dataciteSearchUrl('data "x"').includes("resource-type-id=dataset"));A.ok(decodeURIComponent(C.dataciteSearchUrl('data "x"')).endsWith('query="data \\"x\\""'));
  const cross=C.crossrefReferenceCards({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/data",title:["Other title"],type:"dataset",published:{"date-parts":[[2023]]}}]}},stamp)[0];
  const merged=C.mergeResearchReferences([cross,r]);
  A.equal(merged.length,1);A.equal(merged[0].source,"datacite");A.deepEqual(merged[0].providers,["Crossref","DataCite"]);A.equal(merged[0].metadataDifferences.length,2);
  const entry={id:"study-dataset",mode:"datasets",saved:stamp,question:"data",rows:merged,coverage:[{language:"datacite",query:"data",status:"ok",count:1}]};
  const lib=C.onlineResearchLibrary([entry]);A.equal(lib[0].rows[0].source,"datacite");A.equal(lib[0].rows[0].resourceType,"Dataset");A.deepEqual(lib[0].rows[0].providers,["Crossref","DataCite"]);A.equal(lib[0].rows[0].metadataDifferences.length,2);
  A.deepEqual(C.onlineResearchLibrary(JSON.parse(JSON.stringify(lib))),lib);
  A.ok(C.onlineReferenceContext("data",rows,[],"datasets").messages[0].content.includes("файлы или числа"));
  async function datasetChecks(){
   const urls=[];
   const wiki=JSON.stringify({query:{pages:[{ns:0,pageid:1,lastrevid:3,title:"Planning",extract:"Economic planning",index:1}]}});
   const papers=JSON.stringify({status:"ok","message-type":"work-list",message:{items:[{DOI:"10.1234/data",title:["Economic data"],type:"dataset"}]}});
   const empty=JSON.stringify({hitCount:0,resultList:{result:[]}});
   const fetcher=async (u,o)=>{urls.push(u);A.equal(o.credentials,"omit");A.equal(o.redirect,"error");return {ok:true,text:async()=>u.includes("datacite")?JSON.stringify(fixture):u.includes("crossref")?papers:u.includes("europepmc")?empty:wiki};};
   const wide=await C.fetchWideResearch("планирование","planning",fetcher,null,stamp);
   A.equal(urls.length,5);A.equal(wide.coverage.length,5);A.equal(wide.coverage[4].language,"datacite");
   A.equal(wide.rows.filter(x=>x.doi==="10.1234/data").length,1);A.equal(wide.rows.find(x=>x.doi==="10.1234/data").source,"datacite");
   const denied=await C.fetchDatasetDiscovery("data",async()=>({ok:false,status:429}),null,stamp);A.equal(denied.coverage[0].status,"rate_limited");
   const malformed=await C.fetchDatasetDiscovery("data",async()=>({ok:true,text:async()=>"{invalid"}),null,stamp);A.equal(malformed.coverage[0].status,"unavailable");
   const partial=await C.fetchWideResearch("планирование","planning",async(u,o)=>u.includes("datacite")?{ok:false,status:503}:fetcher(u,o),null,stamp);
   A.equal(partial.coverage[4].status,"unavailable");A.ok(partial.rows.length>0);
   await A.rejects(()=>C.fetchDataciteReferences("data",async()=>({ok:true,text:async()=>"x".repeat(262145)}),null,stamp));
   console.log("v1.45–1.47 dataset discovery checks passed");
  }
  datasetChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.48–1.50: first-class chat transcript and bounded local dialogue.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const t=(question,answer,mode="general",state="complete")=>({question,answer,mode,state});
  const turns=[t("Привет","Здравствуйте"),t("Что такое МРБ?","Архивное заключение 12345","archive"),t("Объясни проще","Пример"),t("Ошибка","Неверный ответ","general","error")];
  const p=C.generalChatPrompt("Продолжи",turns);
  A.equal(p.used,2);A.equal(p.messages.length,6);
  A.deepEqual(p.messages.slice(1).map(x=>x.content),["Привет","Здравствуйте","Объясни проще","Пример","Продолжи"]);
  A.ok(!JSON.stringify(p.messages).includes("12345"));A.ok(!JSON.stringify(p.messages).includes("Неверный ответ"));
  A.equal(C.generalChatPrompt("Продолжи",turns,1).blocked,true);
  A.throws(()=>C.generalChatPrompt("",[]));
  A.equal(C.chatTranscript([{},...turns]).length,4);
  A.equal(C.chatTranscript(Array.from({length:25},(_,i)=>t(String(i),"a"))).length,20);
  A.equal(C.chatTranscript([t("a","x".repeat(7000))])[0].answer.length,6000);
  A.equal(C.chatTranscript([{...t("a","b"),sources:[{id:"s",title:"Test",description:"text",href:"javascript:alert(1)"}]}])[0].sources[0].href,null);
  A.equal(C.chatTranscript([{...t("a","b"),sources:[{id:"s",title:"Test",description:"text",href:"https://example.org/a"}]}])[0].sources[0].href,"https://example.org/a");
  A.equal(C.generalChatPrompt("x",Array.from({length:10},(_,i)=>t(String(i),"a"))).used,6);
  async function chatChecks(){
   const r=await C.runGeneralChat("Продолжи",turns,async m=>{A.equal(m.length,6);return "Ответ";});
   A.equal(r.state,"complete");A.equal(r.used,2);A.equal(r.answer,"Ответ");
   const empty=await C.runGeneralChat("x",[],async()=>"");A.equal(empty.state,"notice");
   const error=await C.runGeneralChat("x",[],async()=>{throw Error("offline")});A.equal(error.state,"error");
   const cancel=await C.runGeneralChat("x",[],async()=>{throw Error("must not call")},()=>false);A.equal(cancel.state,"cancelled");
   let active=true;const stopped=await C.runGeneralChat("x",[],async()=>{active=false;return "late"},()=>active);A.equal(stopped.state,"cancelled");A.equal(stopped.answer,"");
   const blocked=await C.runGeneralChat("x",[],async()=>{throw Error("must not call")},()=>true,1);A.equal(blocked.state,"notice");
   console.log("v1.48–1.50 chat checks passed");
  }
  chatChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.51–1.53: isolated threads, workspace validation and automatic local mode.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const t=(question,answer,mode="general",state="complete")=>({question,answer,mode,state});
  const h={question:"Покажи межотраслевой баланс группы 9",answer:"",page:"index.html",fingerprint:"a".repeat(64),route:"мрб: 9"};
  let w=C.newChatWorkspace("chat-a");
  A.equal(w.active,"chat-a");A.equal(w.threads.length,1);
  w=C.updateChatThread(w,"chat-a",[t("Первый вопрос","Первый ответ")],[h]);
  A.equal(w.threads[0].title,"Первый вопрос");A.equal(w.threads[0].archiveHistory[0].route,"мрб: 9");
  w=C.addChatThread(w,"chat-b");A.equal(w.active,"chat-b");
  A.equal(w.threads[1].turns.length,0);A.equal(w.threads[1].archiveHistory.length,0);
  w=C.updateChatThread(w,"chat-b",[t("Второй вопрос","Другой ответ")],[]);
  A.equal(w.threads[0].turns[0].answer,"Первый ответ");A.equal(w.threads[1].turns[0].answer,"Другой ответ");
  const selected=C.selectChatThread(w,"chat-a");A.equal(selected.active,"chat-a");
  A.equal(C.generalChatPrompt("Продолжи",selected.threads[0].turns).messages.some(m=>m.content==="Другой ответ"),false);
  A.deepEqual(C.chatWorkspace(JSON.parse(JSON.stringify(w))),w);
  A.throws(()=>C.addChatThread(w,"chat-a"));A.throws(()=>C.selectChatThread(w,"chat-unknown"));
  A.throws(()=>C.updateChatThread(w,"chat-unknown",[],[]));A.throws(()=>C.chatWorkspace({...w,schema:2}));
  let removed=C.removeChatThread(w,"chat-b","chat-c");A.equal(removed.active,"chat-a");A.equal(removed.threads.length,1);
  removed=C.removeChatThread(removed,"chat-a","chat-c");A.equal(removed.active,"chat-c");A.equal(removed.threads[0].turns.length,0);
  let many=C.newChatWorkspace("chat-0");for(let i=1;i<12;i++)many=C.addChatThread(many,"chat-"+i);A.equal(many.threads.length,12);A.throws(()=>C.addChatThread(many,"chat-12"));
  A.equal(C.chatModeRoute("Что такое история?",[],false),"general");
  A.equal(C.chatModeRoute("Покажи межотраслевой баланс группы 9",[],false),"archive");
  A.equal(C.chatModeRoute("мрб: 9",[],false),"archive");
  A.equal(C.chatModeRoute("Покажи рынок труда",[],false),"archive");
  A.equal(C.chatModeRoute("А для группы 10?",[h],true),"archive");
  A.equal(C.chatModeRoute("А для группы 10?",[h],false),"general");
  A.equal(C.chatModeRoute("Привет!",[h],true),"general");
  console.log("v1.51–1.53 chat workspace checks passed");
 }


 // v1.54–1.56: research messages and private local evidence exclusion.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const source={id:"loc-1",origin:"local",title:"PRIVATE TITLE",description:"PRIVATE TEXT",limit:"Не проверено"};
  const result={state:"accepted",checked:{ok:true,findings:[{type:"local_document",text:"PRIVATE FINDING",refs:["loc-1"]},{type:"limitation",text:"Нужна сверка.",refs:[]}]},context:{rows:[source],omitted:0},partial:true,stages:[{stage:"local",status:"ok",count:1}]};
  const turn=C.researchChatTurn(result);
  A.equal(turn.mode,"research");A.equal(turn.state,"complete");A.equal(turn.private,true);A.ok(turn.answer.includes("[loc-1]"));A.ok(turn.note.includes("Неполное покрытие"));A.ok(turn.note.includes("Локальные материалы"));
  A.equal(C.researchChatTurn({...result,state:"rejected"}).state,"notice");
  A.ok(!C.researchChatTurn({...result,state:"rejected"}).answer.includes("PRIVATE FINDING"));
  A.equal(C.researchChatTurn({state:"cancelled"},true).private,true);
  A.equal(C.researchChatTurn({state:"cancelled"}).state,"cancelled");
  let w=C.newChatWorkspace("chat-a");
  w=C.updateChatThread(w,"chat-a",[{...turn,question:"PRIVATE QUESTION"}],[]);
  A.equal(w.threads[0].title,"Новый чат");A.equal(w.threads[0].turns.length,1);
  A.equal(C.persistedChatWorkspace(w).threads[0].turns.length,0);
  A.ok(!JSON.stringify(C.persistedChatWorkspace(w)).includes("PRIVATE"));
  const ordinary={mode:"general",question:"Public",answer:"Answer",state:"complete"};
  w=C.updateChatThread(w,"chat-a",[...w.threads[0].turns,ordinary],[]);
  A.equal(w.threads[0].title,"Public");A.equal(C.persistedChatWorkspace(w).threads[0].turns.length,1);
  A.equal(C.chatWorkspace(JSON.parse(JSON.stringify(w))).threads[0].turns[0].private,true);
  A.ok(!JSON.stringify(C.generalChatPrompt("Continue",w.threads[0].turns)).includes("PRIVATE"));
  const publicSource={id:"web-1",origin:"online",title:"Public work",description:"Metadata",href:"https://doi.org/10.1234/abc"};
  const publicResult={state:"accepted",checked:{ok:true,findings:[{type:"bibliography",text:"Public work",refs:["web-1"]}]},context:{rows:[publicSource],omitted:0}};
  const publicTurn=C.researchChatTurn(publicResult);
  A.equal(publicTurn.private,false);
  w=C.updateChatThread(w,"chat-a",[...w.threads[0].turns,{...publicTurn,question:"Public research"}],[]);
  A.equal(C.persistedChatWorkspace(w).threads[0].turns.length,2);
  A.equal(C.persistedChatWorkspace(w).threads[0].turns[1].sources[0].href,publicSource.href);
  const lots=Array.from({length:30},(_,i)=>({...publicSource,id:"web-"+i}));
  const priority=C.researchChatTurn({...publicResult,checked:{ok:true,findings:[{type:"bibliography",text:"Public work",refs:["web-29"]}]},context:{rows:lots,omitted:0}});
  A.equal(priority.sources.length,24);A.equal(priority.sources[0].id,"web-29");A.ok(priority.note.includes("24 карточек"));
  A.equal(C.chatTranscript([{...priority,question:"Sources"}])[0].sources.length,24);
  A.equal(C.researchChatTurn(publicResult,true).private,true);
  console.log("v1.54–1.56 chat research checks passed");
 }


 // v1.57–1.59: streaming response and responsive chat controls.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  async function streamChecks(){
   const chunk=content=>({choices:[{delta:{content}}]});
   async function* sample(){yield chunk("При");yield {choices:[]};yield chunk("вет");yield chunk(null);}
   const updates=[];const r=await C.consumeChatStream(sample(),()=>true,x=>updates.push(x));
   A.equal(r.state,"complete");A.equal(r.text,"Привет");A.equal(r.truncated,false);A.deepEqual(updates,["При","Привет"]);
   const truncated=await C.consumeChatStream(sample(),()=>true,()=>{},4);
   A.equal(truncated.text,"Прив");A.equal(truncated.truncated,true);
   let active=true;const cancelled=await C.consumeChatStream(sample(),()=>active,()=>{active=false;});
   A.equal(cancelled.state,"cancelled");A.equal(cancelled.text,"");
   const empty=await C.consumeChatStream((async function*(){yield {choices:[]};})());A.equal(empty.text,"");
   await A.rejects(()=>C.consumeChatStream({}));await A.rejects(()=>C.consumeChatStream(sample(),()=>true,()=>{},0));
   await A.rejects(()=>C.consumeChatStream((async function*(){throw Error("stream");})()));
   A.ok(C.chatLayoutCss().includes("@media(max-width:600px)"));A.ok(C.chatLayoutCss().includes("overflow-wrap:anywhere"));
   console.log("v1.57–1.59 streaming checks passed");
  }
  streamChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


 // v1.66–1.68: actual citation coverage, insufficient evidence and repeated findings.
 {const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
  const ar={fingerprint:"a".repeat(64),failed:0,found:[{id:"obs",kind:"Наблюдение",title:"Выпуск",description:"100 тонн",value:100,unit:"тонн",period:"2025"}]};
  const online=[{id:"wiki-ru-1",title:"Справка",description:"Справка"}];
  const evidence=C.hybridEvidence(ar,online),limit={type:"limitation",text:"Нужна сверка.",refs:[]},fact={type:"observation",text:"100 тонн",refs:["arc-1"]};
  const checked=C.validateHybridFindings(JSON.stringify([fact,limit]),evidence.rows);
  const audit=C.researchCitationCoverage(evidence.rows,checked);
  A.equal(audit.cited,1);A.deepEqual(audit.missingOrigins,["online"]);A.deepEqual(audit.uncitedCategories,["reference"]);
  A.ok(C.citationCoverageNote(audit).includes("внешние источники 0/1"));
  A.equal(C.validateHybridFindings(JSON.stringify([fact,fact,limit]),evidence.rows).reason,"duplicate_finding");
  A.equal(C.hybridEvidence(ar,[null,...online]).rows.length,2);
  async function coverageChecks(){
   const insufficient=await C.runHybridResearch("Выпуск","мрб: 9",online,[],async()=>ar,async()=>JSON.stringify([limit]));
   A.equal(insufficient.state,"insufficient");A.equal(insufficient.partial,true);A.equal(insufficient.citationCoverage.cited,0);
   A.equal(C.researchChatTurn(insufficient).state,"notice");A.ok(C.researchChatTurn(insufficient).answer.includes("Нужна сверка."));
   const one=await C.runHybridResearch("Выпуск","мрб: 9",online,[],async()=>ar,async()=>JSON.stringify([fact,limit]));
   A.equal(one.state,"accepted");A.equal(one.partial,true);A.deepEqual(one.citationCoverage.missingOrigins,["online"]);
   const both=await C.runHybridResearch("Выпуск","мрб: 9",online,[],async()=>ar,async()=>JSON.stringify([fact,{type:"reference",text:"Справка",refs:["web-2"]},limit]));
   A.equal(both.state,"accepted");A.equal(both.partial,false);A.equal(both.citationCoverage.cited,2);
   const basket={document:[{id:"doc-0",kind:"Фрагмент пользовательского документа",title:"Документ",description:"Текст",limit:"Не проверено"}]};
   const local=await C.runMultimodalResearch("Вопрос",basket,[],[],null,async()=>JSON.stringify([limit]));
   A.equal(local.state,"insufficient");A.equal(local.partial,true);
   const plan=C.unifiedResearchPlan("Вопрос",{local:true});
   const unified=await C.runUnifiedResearch(plan,basket,{generate:async()=>JSON.stringify([limit])});
   A.equal(unified.state,"insufficient");A.equal(unified.partial,true);A.equal(C.researchChatTurn(unified,true).private,true);
   console.log("v1.66–1.68 research coverage checks passed");
  }
  coverageChecks().catch(e=>{console.error(e);process.exitCode=1;});
 }


// v1.69–1.71: bounded research repair; unchanged evidence and private omitted rows.
{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 async function recoveryChecks(){
  const ar={fingerprint:"a".repeat(64),failed:0,found:[{id:"obs",kind:"Наблюдение",title:"Выпуск",description:"100 тонн",value:100,unit:"тонн",period:"2025"}]};
  const online=[{id:"wiki-ru-1",title:"Справка",description:"Справка"}];
  const limit={type:"limitation",text:"Нужна сверка.",refs:[]},fact={type:"observation",text:"100 тонн",refs:["arc-1"]},reference={type:"reference",text:"Справка",refs:["web-2"]};
  const valid=JSON.stringify([fact,reference,limit]),bad=JSON.stringify([{...fact,text:"999 тонн"},reference,limit]);
  const run=(generate,active=()=>true,budget=9500,archive=ar)=>C.runHybridResearch("Выпуск","мрб: 9",online,[],async()=>archive,generate,active,()=>{},budget);
  let prompts=[];
  let r=await run(async m=>{prompts.push(m);return prompts.length===1?"INVALID MODEL CONTENT":valid});
  A.equal(r.state,"accepted");A.equal(r.repair.recovered,true);A.equal(r.repair.reason,"json");A.equal(prompts.length,2);A.deepEqual(prompts[0][1],prompts[1][1]);A.ok(!JSON.stringify(prompts[1]).includes("INVALID MODEL CONTENT"));A.equal(r.partial,false);
  A.ok(C.researchChatTurn(r).note.includes("повторно проверены"));
  prompts=[];r=await run(async m=>{prompts.push(m);return bad});
  A.equal(r.state,"rejected");A.equal(r.checked.reason,"numeric_evidence");A.equal(r.repair.recovered,false);A.equal(prompts.length,2);
  let n=0;r=await run(async()=>{n++;return valid});A.equal(n,1);A.equal(r.repair.attempted,false);
  n=0;r=await run(async()=>{if(++n===1)return "broken";throw Error("offline")});A.equal(r.state,"rejected");A.equal(r.repair.failed,true);A.equal(n,2);
  let active=true;n=0;r=await run(async()=>{if(++n===1)return "broken";active=false;return valid},()=>active);A.equal(r.state,"cancelled");A.equal(n,2);
  active=true;n=0;r=await run(async()=>{n++;active=false;return "broken"},()=>active);A.equal(r.state,"cancelled");A.equal(n,1);
  const rows=C.hybridEvidence(ar,online).rows,context={rows,messages:[{role:"system",content:"x"},{role:"user",content:"y"}]};
  n=0;const blocked=await C.checkedResearchGeneration(context,async()=>{n++;return "broken"},()=>true,[],80);
  A.equal(blocked.repair.budgetLimited,true);A.equal(n,1);A.ok(C.researchRepairNote(blocked.repair).includes("лимит"));
  r=await run(async()=>valid,()=>true,9500,{...ar,found:[...ar.found,{id:"excluded",kind:"Неизвестный вид",title:"Не включено",description:"Не включено"}]});A.equal(r.state,"accepted");A.equal(r.evidence.excluded,1);A.equal(r.partial,true);
  const basket={document:[{id:"doc-0",kind:"Фрагмент пользовательского документа",title:"Документ",description:"PRIVATE_LOCAL_TEXT",limit:"Не проверено"}]};
  const localValid=JSON.stringify([{type:"local_document",text:"PRIVATE_LOCAL_TEXT",refs:["loc-1"]},limit]);
  n=0;r=await C.runMultimodalResearch("Вопрос",basket,[],[],null,async()=>++n===1?"broken":localValid);A.equal(r.state,"accepted");A.equal(r.repair.recovered,true);A.equal(n,2);
  A.equal(C.researchChatTurn({state:"no_evidence",context:{rows:[],omitted:1},evidence:{rows:[{origin:"local"}]}}).private,true);
  A.equal((await C.runMultimodalResearch("Вопрос",{},[],[],null,async()=>{throw Error("must not call")})).partial,true);
  A.equal((await run(async()=>{throw Error("offline")})).partial,true);
  console.log("v1.69–1.71 research recovery checks passed");
 }
 recoveryChecks().catch(e=>{console.error(e);process.exitCode=1;});
}


// v1.72–1.74: explicit public research follow-up, private context isolation and coverage.
{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 const previous={mode:"research",state:"complete",question:"Выпуск стали",answer:"UNVERIFIED_OLD_ANSWER",sources:[{id:"old",title:"OLD_SOURCE",description:"OLD_DATA"}]};
 const draft=C.researchFollowupDraft(previous,"А за 2025 год?");
 A.ok(draft.question.includes("Выпуск стали"));A.ok(draft.question.includes("А за 2025 год?"));A.equal(draft.archiveQuery,"А за 2025 год?");A.equal(draft.truncated,false);
 A.ok(!JSON.stringify(draft).includes("UNVERIFIED_OLD_ANSWER"));A.ok(!JSON.stringify(draft).includes("OLD_SOURCE"));
 A.throws(()=>C.researchFollowupDraft({...previous,private:true},"Уточни"));
 A.throws(()=>C.researchFollowupDraft({...previous,state:"cancelled"},"Уточни"));
 A.throws(()=>C.researchFollowupDraft({...previous,mode:"general"},"Уточни"));
 A.throws(()=>C.researchFollowupDraft(previous,"  "));
 A.throws(()=>C.researchFollowupDraft(previous,"x".repeat(590)));
 const long=C.researchFollowupDraft({...previous,question:"x".repeat(570)+" Последняя тема"},"Что изменилось?");
 A.equal(long.truncated,true);A.equal(long.question.length,600);A.ok(long.question.includes("Последняя тема"));
 const plan=C.unifiedResearchPlan(draft.question,{archive:true,archiveQuery:draft.archiveQuery,local:false,web:false});
 A.equal(plan.archiveQuery,draft.archiveQuery);A.equal(plan.online,null);A.equal(plan.local,false);
 const general=C.generalChatPrompt("Что дальше?",[{mode:"general",state:"complete",question:"PRIVATE_QUESTION",answer:"PRIVATE_ANSWER",private:true},{mode:"general",state:"complete",question:"Открытый вопрос",answer:"Открытый ответ"}]);
 A.equal(general.used,1);A.ok(!JSON.stringify(general).includes("PRIVATE_"));
 A.equal(C.researchExcludedNote({excluded:0}),"");A.ok(C.researchExcludedNote({excluded:2}).includes("охват неполный"));
 console.log("v1.72–1.74 research dialogue checks passed");
}


// v1.75–1.77: verified single-tool receipts, contextual routing, and plan previews.
{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 async function contextualToolChecks(){
  const stamp="a".repeat(64),next="b".repeat(64);
  const rec=C.researchArchiveReceipt("производительность труда: 2025; база=2019",stamp);
  A.deepEqual(rec,{command:"производительность труда: 2025; база=2019",fingerprint:stamp});
  A.equal(C.researchArchiveReceipt("мрб: 99",stamp),null);
  A.equal(C.researchArchiveReceipt("мрб: 9","bad"),null);
  A.equal(C.researchArchiveReceipt("исследование: Покажи межотраслевой баланс группы 9 | Покажи межотраслевой баланс группы 10",stamp),null);
  const turn={mode:"research",question:"Производительность",answer:"Ответ",state:"complete",archiveReceipt:rec};
  const f=C.researchFollowupArchive(turn,"А за 2024 год?");
  A.equal(f.kind,"tool");A.equal(f.query,"производительность труда: 2024; база=2019");A.equal(f.previousSnapshot,stamp);
  A.equal(C.researchFollowupArchive(turn,"А за 2018 год?").kind,"clarify");
  A.equal(C.researchFollowupArchive({...turn,private:true},"А за 2024 год?").kind,"clarify");
  A.equal(C.researchFollowupArchive(null,"А за 2024 год?").kind,"clarify");
  A.equal(C.researchFollowupArchive(turn,"А за 2024 год?","мрб: 9").query,"мрб: 9");
  A.equal(C.researchFollowupArchive(turn,"Уточни","А за 2024 год?").kind,"clarify");
  A.equal(C.researchFollowupArchive(turn,"Инфляция").query,"Инфляция");
  A.deepEqual(C.researchArchiveSteps("Покажи межотраслевой баланс группы 9 и покажи межотраслевой баланс группы 10"),["мрб: 9","мрб: 10"]);
  A.deepEqual(C.researchArchiveSteps("мрб: 9"),["мрб: 9"]);
  A.deepEqual(C.researchArchiveSteps("Инфляция"),[]);
  A.throws(()=>C.researchArchiveSteps("Покажи рынок труда"));
  const ar={fingerprint:next,failed:0,found:[{id:"obs",kind:"Наблюдение",title:"Выпуск",description:"100 тонн",value:100,unit:"тонн"}]};
  const plan=C.unifiedResearchPlan("Сравни показатель",{archive:true,archiveQuery:f.query});
  let received,query,raw=JSON.stringify([{type:"observation",text:"100 тонн",refs:["arc-1"]},{type:"limitation",text:"Нужна сверка.",refs:[]}]);
  const r=await C.runUnifiedResearch(plan,{}, {archiveSearch:async q=>{query=q;return ar},generate:async messages=>{received=JSON.parse(messages[1].content);return raw}});
  A.equal(r.state,"accepted");A.equal(query,f.query);A.equal(received.archiveQuery,f.query);
  A.deepEqual(r.archiveReceipt,{command:f.query,fingerprint:next});
  const t={...C.researchChatTurn(r),question:plan.question};
  A.deepEqual(C.chatTranscript([t])[0].archiveReceipt,r.archiveReceipt);
  A.equal(C.researchFollowupArchive(t,"А за 2023 год?").query,"производительность труда: 2023; база=2019");
  A.equal(C.dialogueSnapshotNote(stamp,next).sameSnapshot,false);
  A.equal(C.chatTranscript([{...t,private:true}])[0].archiveReceipt,undefined);
  A.equal(C.researchChatTurn(r,true).archiveReceipt,undefined);
  A.equal(C.chatTranscript([{...t,archiveReceipt:{...r.archiveReceipt,fingerprint:"bad"}}])[0].archiveReceipt,undefined);
  const failed=await C.runUnifiedResearch(plan,{}, {archiveSearch:async()=>({...ar,failed:1}),generate:async()=>raw});
  A.equal(failed.archiveReceipt,undefined);
  const noData=await C.runUnifiedResearch(plan,{}, {archiveSearch:async()=>({...ar,found:[]}),generate:async()=>{throw Error("must not call")}});
  A.equal(noData.archiveReceipt,undefined);
  const privatePlan=C.unifiedResearchPlan("Локальная тема",{archive:true,archiveQuery:f.query,local:true});
  const privateResult=await C.runUnifiedResearch(privatePlan,{}, {archiveSearch:async()=>ar,generate:async()=>raw});
  A.equal(privateResult.archiveReceipt,undefined);
  console.log("v1.75–1.77 contextual tool checks passed");
 }
 contextualToolChecks().catch(e=>{console.error(e);process.exitCode=1;});
}


// v1.78–1.80: step provenance, fair context allocation and final citation coverage.
{const A=require("node:assert/strict"),C=require("./global-economic-assistant.js");
 async function stepAwareChecks(){
  const stamp="a".repeat(64),q="Покажи межотраслевой баланс группы 9 и покажи межотраслевой баланс группы 10";
  const plan=C.implicitEconomicPlan(q);
  const ar=await C.runResearchPlan(plan,async step=>({fingerprint:stamp,failed:0,found:[{id:"obs",kind:"Наблюдение",title:step.command==="мрб: 9"?"Сталь":"Уголь",description:step.command==="мрб: 9"?"100 тонн":"200 тонн",value:step.command==="мрб: 9"?100:200,unit:"тонн"}]}));
  const evidence=C.hybridEvidence(ar,[]);
  A.equal(evidence.steps.length,2);A.deepEqual(evidence.rows.map(r=>r.researchStep),[1,2]);
  A.deepEqual(C.researchStepManifest(ar).map(r=>r.command),["мрб: 9","мрб: 10"]);
  A.throws(()=>C.hybridEvidence({...ar,results:ar.results.map((r,i)=>i===0?{...r,count:2}:r)},[]));
  A.throws(()=>C.hybridEvidence({...ar,failed:1},[]));
  A.throws(()=>C.hybridEvidence({...ar,results:[ar.results[0],{...ar.results[1],command:ar.results[0].command}]},[]));
  const forged=C.hybridEvidence({fingerprint:stamp,failed:0,found:[{...ar.found[0],researchStep:99}]},[]);
  A.equal(forged.rows[0].researchStep,undefined);
  const fair=C.stepEvidenceGroups({...evidence,rows:[evidence.rows[0],{...evidence.rows[0],id:"extra"},evidence.rows[1]]},["observation"]);
  A.deepEqual(fair.map(g=>g.map(r=>r.id)),[["arc-1","extra"],["arc-2"]]);
  const ctx=C.multimodalContext(q,evidence,[]);
  const payload=JSON.parse(ctx.messages[1].content);
  A.equal(payload.researchSteps.length,2);A.deepEqual(payload.rows.map(r=>r.researchStep),[1,2]);
  const limit={type:"limitation",text:"Нужна сверка.",refs:[]};
  const first={type:"observation",text:"100 тонн",refs:["arc-1"]},second={type:"observation",text:"200 тонн",refs:["arc-2"]};
  const one=await C.runMultimodalResearch(q,{},[],[],async()=>ar,async()=>JSON.stringify([first,limit]));
  A.equal(one.state,"accepted");A.equal(one.partial,true);A.deepEqual(one.stepCoverage.map(x=>x.status),["cited","uncited"]);
  A.ok(C.researchChatTurn(one).note.includes("нет ссылок в ответе"));
  const both=await C.runMultimodalResearch(q,{},[],[],async()=>ar,async()=>JSON.stringify([first,second,limit]));
  A.equal(both.partial,false);A.deepEqual(both.stepCoverage.map(x=>x.cited),[1,1]);
  const restricted=C.researchStepCoverage(evidence,{rows:[evidence.rows[0]]},{ok:true,findings:[first,limit]});
  A.equal(restricted[1].status,"omitted");
  const unavailable={...ar,found:[ar.found[0]],results:[ar.results[0],{...ar.results[1],count:0}]};
  const missing=await C.runMultimodalResearch(q,{},[],[],async()=>unavailable,async()=>JSON.stringify([first,limit]));
  A.equal(missing.partial,true);A.equal(missing.stepCoverage[1].status,"no_evidence");
  const broken=await C.runMultimodalResearch(q,{},[],[],async()=>ar,async()=>{throw Error("model offline")});
  A.equal(broken.state,"model_unavailable");A.deepEqual(broken.stepCoverage.map(x=>x.status),["uncited","uncited"]);
  const unified=C.unifiedResearchPlan(q,{archive:true});
  const result=await C.runUnifiedResearch(unified,{}, {archiveSearch:async()=>ar,generate:async()=>JSON.stringify([first,limit])});
  A.equal(result.partial,true);A.equal(result.stepCoverage[1].status,"uncited");A.equal(result.archiveReceipt,undefined);
  const withWeb=await C.runHybridResearch(q,q,[{id:"wiki-ru-1",title:"Справка",description:"Текст"}],[],async()=>ar,async()=>JSON.stringify([first,second,{type:"reference",text:"Текст",refs:["web-3"]},limit]));
  A.equal(withWeb.partial,false);A.equal(withWeb.stepCoverage.length,2);
  console.log("v1.78–1.80 step-aware research checks passed");
 }
 stepAwareChecks().catch(e=>{console.error(e);process.exitCode=1;});
}
