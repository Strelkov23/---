/* Reuse the site's existing numerical diagnostics, no generated arithmetic. */
const EconomicAIDiagnostics=(function diagnosticCore(){
 const finite=x=>typeof x==="number"&&Number.isFinite(x);
 function build(macro,data,catalog,stamp){
  const year=Number(stamp.slice(0,4))-1;if(!Number.isInteger(year)||year<1991||year>2100)throw Error("Invalid build period");
  const rows=macro.rules.map(rule=>{
   const observations=macro.compute(rule,data,1991,year),last=observations.at(-1);
   const item={id:rule.id,title:rule.title,group:rule.group,unit:rule.unit,note:rule.note,formula:macro.formula(rule.op),codes:[rule.a,rule.b],sources:[catalog[rule.a]?.source||null,catalog[rule.b]?.source||null],count:observations.length};
   if(!last)return {...item,status:"missing",year:null,value:null,change:null,score:null,history_count:0,age:null,a:null,b:null};
   const s=macro.changeSignals(observations,last.year,last.year,10,3.5,5)[0];
   return {...item,status:s.status,year:last.year,value:last.value,change:s.delta,score:s.score,history_count:s.history.length,age:year-last.year,a:last.a,b:last.b,baseline_median:s.median,baseline_mad:s.mad};
  });
  const counts={signal:0,ordinary:0,missing:0,short:0,constant:0,unavailable:0};
  for(const r of rows){if(!Object.hasOwn(counts,r.status))throw Error("Unexpected status");counts[r.status]++;if(r.value!==null&&!finite(r.value))throw Error("Invalid value");}
  return {schema:1,built:stamp,closed_year:year,window:10,threshold:3.5,min_history:5,counts,rows,note:"Расчёты по последним редакциям годовых рядов WDI. Сигнал — необычное изменение диагностического показателя, не причинность, не ошибка источника и не рекомендация политики. Историческая доступность данных не реконструирована. Возраст измерен от последнего закрытого календарного года."};
 }
 return {build};
})();
module.exports=EconomicAIDiagnostics;
if(require.main===module){
 const fs=require("node:fs"),path=require("node:path"),macro=require("./macro-diagnostics.js");
 const out=process.argv[2],stamp=process.argv[3];
 if(!out||!stamp)throw Error("Output and timestamp required");
 const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),"utf8"));
 const report=EconomicAIDiagnostics.build(macro,read("compare.json"),read("catalog.json"),stamp);
 fs.writeFileSync(path.join(out,"economic-ai-diagnostics.json"),JSON.stringify(report),"utf8");
}
