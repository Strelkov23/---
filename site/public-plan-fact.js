/* Documentary public plan/fact comparisons, preserving scope and plan vintage. */
const PublicPlanFact=(()=>{
 const finite=Number.isFinite,year=v=>Number.isInteger(v)&&v>=1991&&v<=2100,optional=v=>v===null||finite(v);
 const diff=(a,b)=>finite(a)&&finite(b)?a-b:null,ratio=(a,b)=>finite(a)&&finite(b)&&b!==0?100*a/b:null;
 function goals(data){
  if(!Array.isArray(data?.rows))throw Error('Некорректный архив целей');
  const seen=new Set();
  return data.rows.map(r=>{
   const k=JSON.stringify([r.id,r.year]);if(seen.has(k)||!year(r.year)||!finite(r.plan)||!optional(r.actual)||!['le','ge'].includes(r.direction)||!r.plan_source||!r.plan_vintage||finite(r.actual)&&!r.actual_source)throw Error('Некорректная строка цели');seen.add(k);
   const delta=diff(r.actual,r.plan),favorable=delta===null?null:r.direction==='le'?-delta:delta;
   if(favorable!==null&&finite(r.favorable_gap)&&Math.abs(favorable-r.favorable_gap)>1e-7*Math.max(1,Math.abs(favorable)))throw Error('Невязка отклонения цели');
   return {...r,delta,favorable,status:favorable===null?'Нет факта':favorable>=-1e-9?'Цель достигнута':'Отклонение'};
  });
 }
 function budgets(data,basis){
  if(!Array.isArray(data?.rows)||!['initial_law','amended_law','appropriation'].includes(basis))throw Error('Некорректная база бюджетного сравнения');
  const seen=new Set();
  return data.rows.map(r=>{
   const key=JSON.stringify([r.scope,r.id,r.year]);if(seen.has(key)||!year(r.year)||!r.scope||r.unit!=='млн руб.'||![r.initial_law,r.amended_law,r.appropriation,r.actual].every(optional))throw Error('Некорректная строка бюджета');seen.add(key);
   const plan=r[basis],gap=diff(r.actual,plan),execution=ratio(r.actual,plan);
   const revision=diff(r.appropriation,r.amended_law),cashGap=diff(r.actual,r.appropriation),net=diff(r.actual,r.amended_law);
   if([revision,cashGap,net].every(finite)&&Math.abs(net-revision-cashGap)>1e-7*Math.max(1,Math.abs(net)))throw Error('Невязка бюджета');
   return {...r,basis,plan,gap,execution,revision,cashGap,net,status:!finite(plan)?'Нет выбранного плана':!finite(r.actual)?'Нет факта':'Сопоставлено'};
  });
 }
 return {goals,budgets};
})();
if(typeof module!=='undefined')module.exports=PublicPlanFact;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('ppf-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const [a,b]=await Promise.all(['annual-goals.json','programme-budget.json'].map(n=>Provenance.get(manifest,n,root)));
  const goals=PublicPlanFact.goals(a.data),basis=$('ppf-basis'),period=$('ppf-year'),filter=$('ppf-filter'),exp=$('ppf-export');
  const years=[...new Set([...goals,...b.data.rows].map(r=>r.year))].sort((a,b)=>a-b);
  period.replaceChildren(new Option('Все годы',''),...years.map(y=>new Option(String(y),String(y))));period.value=String(years[0]);
  const labels={initial_law:'Первоначальный закон',amended_law:'Закон с изменениями',appropriation:'Сводная роспись'};
  function draw(){
   exp.disabled=true;const match=r=>!period.value||r.year===Number(period.value),g=goals.filter(match).filter(r=>filter.value==='all'||filter.value==='missing'&&r.status==='Нет факта'||filter.value==='deviation'&&r.status==='Отклонение'),bud=PublicPlanFact.budgets(b.data,basis.value).filter(match);
   const compared=goals.filter(match),known=compared.filter(r=>r.favorable!==null);
   $('ppf-summary').textContent='Целей: '+compared.length+' · с фактом: '+known.length+' · достигнуты: '+known.filter(r=>r.status==='Цель достигнута').length+' · отклонения: '+known.filter(r=>r.status==='Отклонение').length+' · без факта: '+(compared.length-known.length)+'. Это счётчик строк, не сводный индекс эффективности.';
   table($('ppf-goals'),['Год','Показатель','Единица','План','Факт','Благоприятное отклонение','Статус','Редакция плана'],g.map(r=>[r.year,r.title,r.unit,fmt(r.plan),fmt(r.actual),fmt(r.favorable),r.status,r.plan_vintage]));
   table($('ppf-budget'),['Год','Объект','Охват','Выбранный план, млн руб.','Факт','Факт − план','Исполнение, %','Роспись − изменённый закон','Факт − роспись','Статус'],bud.map(r=>[r.year,r.title,r.scope,fmt(r.plan),fmt(r.actual),fmt(r.gap),fmt(r.execution),fmt(r.revision),fmt(r.cashGap),r.status]));
   status.textContent='Документальные снимки: цели проверены '+(a.data.reviewed||'—')+', бюджет '+(b.data.reviewed||'—')+'. Новая сборка не означает обновление фактов.';
   exp.disabled=!g.length&&!bud.length;exp.onclick=()=>csv('public-plan-fact.csv',[['Тип','Год','Код','Объект','Охват','Единица','База плана','План','Факт','Факт − план','Благоприятное отклонение','Исполнение, %','Роспись − закон','Факт − роспись','Статус','Источник плана','Источник факта','Редакция / примечание','Проверено','SHA-256','Манифест'],...g.map(r=>['Цель',r.year,r.id,r.title,r.programme,r.unit,r.direction,r.plan,r.actual,r.delta,r.favorable,'','','',r.status,r.plan_source,r.actual_source,r.plan_vintage,a.data.reviewed,a.sha256,manifest.data_fingerprint]),...bud.map(r=>['Бюджет',r.year,r.id,r.title,r.scope,r.unit,labels[r.basis],r.plan,r.actual,r.gap,'',r.execution,r.revision,r.cashGap,r.status,r.plan_source,r.actual_source,r.note,b.data.reviewed,b.sha256,manifest.data_fingerprint])]);
  }
  [basis,period,filter].forEach(x=>x.onchange=draw);draw();
 }catch(e){console.error(e);status.textContent='Расчёт недоступен: '+String(e.message||e)}
});