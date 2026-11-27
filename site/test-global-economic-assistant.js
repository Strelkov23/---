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
