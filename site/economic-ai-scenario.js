/* Explicit scenario command and local deterministic preview. */
const EconomicAIScenario=(function scenarioCore(){
 const fields=[
 ["years","горизонт",1,15,5,1],
 ["growth","рост",-10,20,3,0.1],
 ["productivity","производительность",-10,20,2,0.1],
 ["laborGrowth","занятость",-10,10,0,0.1],
 ["capitalRatio","капитал",0.1,10,3,0.1],
 ["depreciation","выбытие",0,30,5,0.1],
 ["budget","бюджет",0,100,20,0.1]
 ];
 function parse(text){
  if(typeof text!=="string"||text.length>600)throw Error("Некорректная команда");
  const parts=text.trim().replace(/^сценарий\s*:\s*/i,"").split(";").map(s=>s.trim()).filter(Boolean);
  if(!parts.length)throw Error("Введите хотя бы один параметр.");
  const params=Object.fromEntries(fields.map(([k,_label,_min,_max,d])=>[k,d])),seen=new Set();let year=null;
  for(const part of parts){const m=part.match(/^([а-яё]+)\s*=\s*([+-]?\d+(?:[.,]\d+)?)$/i);if(!m)throw Error("Используйте формат: рост=4; горизонт=5.");
   const label=m[1].toLowerCase().replaceAll("ё","е"),v=Number(m[2].replace(",","."));if(seen.has(label))throw Error("Повтор параметра: "+label);seen.add(label);
   if(label==="база"){if(!Number.isInteger(v)||v<1991||v>2100)throw Error("Некорректный базовый год.");year=v;continue}
   const f=fields.find(x=>x[1]===label);if(!f)throw Error("Неизвестный параметр: "+label);
   if(!Number.isFinite(v)||v<f[2]||v>f[3]||Math.abs(v/f[5]-Math.round(v/f[5]))>1e-8)throw Error("Параметр вне допустимых границ: "+label);
   params[f[0]]=v;
  }
  return {params,year,provided:[...seen]};
 }
 function selectBase(bases,year,closedYear){
  const valid=bases.filter(b=>Number.isInteger(b.year)&&b.year<=closedYear).sort((a,b)=>b.year-a.year);
  const base=year===null?valid[0]:valid.find(b=>b.year===year);
  if(!base)throw Error("Нет сопоставимой базы для выбранного закрытого года.");
  return base;
 }
 function summary(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error("Нет результатов");
  const last=rows.at(-1),sum=k=>rows.reduce((s,r)=>s+r[k],0);
  const out={year:last.year,gdp:last.gdp,investment:sum("required"),gap:sum("gap"),laborGap:last.laborGap};
  if(Object.values(out).some(x=>!Number.isFinite(x)))throw Error("Некорректный результат");
  return out;
 }
 function path(year,params){
  return "scenario.html?repro-base="+year+fields.map(([k])=>"&repro-"+k+"="+encodeURIComponent(params[k])).join("")+"#reproduction-plan";
 }
 function compare(base,a,b,calculate,summarize){
 if(a.year!==null&&a.year!==base.year||b.year!==null&&b.year!==base.year)throw Error("Для сравнения требуется одинаковый базовый год.");
 if(a.params.years!==b.params.years)throw Error("Для сравнения требуется одинаковый горизонт.");
 const left=summarize(calculate(base,a.params)),right=summarize(calculate(base,b.params));
 const delta=Object.fromEntries(["gdp","investment","gap","laborGap"].map(k=>[k,right[k]-left[k]]));
 if(Object.values(delta).some(v=>!Number.isFinite(v)))throw Error("Некорректная разность");
 return {left,right,delta};
}
 return {fields,parse,selectBase,summary,path,compare};
})();
if(typeof module!=="undefined")module.exports=EconomicAIScenario;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{
 const $=id=>document.getElementById("easc-"+id),command=$("command"),preview=$("preview"),apply=$("apply"),out=$("result"),status=$("status");if(!command)return;
 let pending=null,seq=0;const C=EconomicAIScenario,second=$("second"),applySecond=$("apply-second"),exportButton=$("export");let pendingSecond=null,report=null;
 const add=(tag,v)=>{const e=document.createElement(tag);e.textContent=v;out.append(e);return e};
 function script(name,ready){if(ready())return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=name;s.onload=()=>ready()?resolve():reject(Error("Модуль недоступен"));s.onerror=()=>reject(Error("Модуль недоступен"));document.head.append(s)})}
 command.oninput=second.oninput=()=>{seq++;pending=null;pendingSecond=null;report=null;apply.disabled=applySecond.disabled=exportButton.disabled=true;out.replaceChildren();status.textContent="Параметры изменены; выполните предварительный расчёт."};
 preview.onclick=async()=>{const id=++seq;preview.disabled=true;pending=null;pendingSecond=null;report=null;apply.disabled=applySecond.disabled=exportButton.disabled=true;out.replaceChildren();status.textContent="Проверка базы и расчёт…";
 try{
  const parsed=C.parse(command.value),alternative=second.value.trim()?C.parse(second.value):null;
  await script("provenance.js",()=>typeof Provenance!=="undefined");
  await script("reproduction-plan.js",()=>typeof ReproductionPlan!=="undefined");
  const m=await Provenance.validateManifest(await load("data-manifest.json"));
  const data=(await Provenance.get(m,"compare.json",root)).data;
  const closed=Number(m.built.slice(0,4))-1,base=C.selectBase(ReproductionPlan.baselines(data),parsed.year??alternative?.year??null,closed);
  const rows=ReproductionPlan.calculate(base,parsed.params),s=C.summary(rows),comparison=alternative?C.compare(base,parsed,alternative,ReproductionPlan.calculate,C.summary):null;
  if(id!==seq)return;
  add("p","База: "+base.year+" · SHA-256 "+m.data_fingerprint.slice(0,12));
  for(const [k,label] of C.fields)add("p",label+": "+parsed.params[k]+(parsed.provided.includes(label)?" (введено)":" (допущение по умолчанию)"));
  const f=v=>v.toLocaleString("ru",{maximumFractionDigits:2});
  add("p","Последний год: "+s.year+"; целевой ВВП: "+f(s.gdp/1e9)+" млрд долл. 2015 г.");
  add("p","Сумма необходимых инвестиций: "+f(s.investment/1e9)+" млрд долл.; сумма инвестиционных разрывов: "+f(s.gap/1e9)+" млрд долл.");
  add("p","Разрыв занятости последнего года: "+f(s.laborGap/1e6)+" млн чел.");
  if(comparison){
   add("h4","Сценарий Б и разница Б − А");
   for(const [k,label] of C.fields)add("p",label+": "+alternative.params[k]+(alternative.provided.includes(label)?" (введено)":" (допущение по умолчанию)"));
   const table=add("table",""),head=table.createTHead().insertRow();for(const name of ["Показатель","А","Б","Б − А"]){const th=document.createElement("th");th.textContent=name;head.append(th)}
   const body=table.createTBody();for(const [k,label,scale] of [["gdp","ВВП, млрд долл.",1e9],["investment","Инвестиции, млрд долл.",1e9],["gap","Разрыв инвестиций, млрд долл.",1e9],["laborGap","Разрыв труда, млн чел.",1e6]]){const tr=body.insertRow();for(const v of [label,f(comparison.left[k]/scale),f(comparison.right[k]/scale),f(comparison.delta[k]/scale)])tr.insertCell().textContent=v}
   const altUrl=new URL(C.path(base.year,alternative.params),location.href);if(typeof pinned!=="undefined"&&pinned)altUrl.searchParams.set("snapshot",pinned);pendingSecond=altUrl.href;applySecond.disabled=false;
  }
  report={schema:1,note:"Условные сценарии, не прогноз и не доказательство выполнимости. Денежные величины в долл. 2015 г., занятость в людях.",fingerprint:m.data_fingerprint,base,scenarioA:{params:parsed.params,rows,summary:s},scenarioB:alternative?{params:alternative.params,rows:ReproductionPlan.calculate(base,alternative.params),summary:comparison.right}:null,delta:comparison?.delta??null};
  exportButton.disabled=false;
  add("small","Условная траектория, не прогноз и не доказательство выполнимости. Все параметры показаны до перехода. На текущем архиве повторный расчёт может измениться при обновлении данных.");
  const u=new URL(C.path(base.year,parsed.params),location.href);if(typeof pinned!=="undefined"&&pinned)u.searchParams.set("snapshot",pinned);pending=u.href;apply.disabled=false;status.textContent="Предварительный расчёт готов. Подтвердите переход.";
 }catch(e){if(id===seq)status.textContent=e.message||"Расчёт недоступен."}finally{preview.disabled=false}};
 apply.onclick=()=>{if(pending)location.assign(pending)};
 applySecond.onclick=()=>{if(pendingSecond)location.assign(pendingSecond)};
 exportButton.onclick=()=>{if(!report)return;const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download="economic-scenario-comparison.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};
});
