/* Linear allocation of additional domestic final demand, 2021 balance.
   All quantities are billion rubles in the base-year valuation. */
const ResourcePlan=(()=>{
 const EPS=1e-9,sum=a=>a.reduce((s,v)=>s+v,0);
 const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
 function solve(A,b,c){
  const n=c.length,m=b.length;
  if(!n||!m||A.length!==m||A.some(r=>r.length!==n||r.some(v=>!Number.isFinite(v)||v<0))||b.some(v=>!Number.isFinite(v)||v<0)||c.some(v=>!Number.isFinite(v)))throw Error('Invalid LP');
  // Nonnegative RHS: origin is feasible, slack variables provide the initial basis.
  const size=n+m,t=A.map((r,i)=>[...r,...Array.from({length:m},(_,j)=>i===j?1:0),b[i]]);
  t.push([...c.map(v=>-v),...Array(m).fill(0),0]);
  const basis=Array.from({length:m},(_,i)=>n+i);
  let iterations=0;
  // Bland's rule avoids cycling on degenerate constraints.
  for(;;){
   if(++iterations>10000)throw Error('LP iteration limit');
   const enter=t[m].slice(0,size).findIndex(v=>v< -EPS);
   if(enter<0)break;
   let leave=-1,best=Infinity;
   for(let i=0;i<m;i++)if(t[i][enter]>EPS){
    const q=Math.max(0,t[i][size])/t[i][enter];
    if(q<best-EPS||(Math.abs(q-best)<=EPS&&(leave<0||basis[i]<basis[leave]))){best=q;leave=i}
   }
   if(leave<0)throw Error('Unbounded objective');
   const pivot=t[leave][enter];t[leave]=t[leave].map(v=>v/pivot);
   for(let i=0;i<=m;i++)if(i!==leave){const k=t[i][enter];if(k!==0)t[i]=t[i].map((v,j)=>v-k*t[leave][j])}
   basis[leave]=enter;
  }
  const x=Array(n).fill(0);
  basis.forEach((j,i)=>{if(j<n)x[j]=Math.max(0,t[i][size])});
  const slack=b.map((v,i)=>v-dot(A[i],x));
  if(x.some(v=>!Number.isFinite(v))||slack.some((v,i)=>v< -1e-6*Math.max(1,b[i])))throw Error('LP feasibility check failed');
  const dual=t[m].slice(n,n+m),objective=dot(c,x),dualObjective=dot(dual,b);
  const dualSlack=c.map((v,j)=>sum(A.map((row,i)=>dual[i]*row[j]))-v);
  const gap=Math.abs(dualObjective-objective);
  if(dual.some(v=>!Number.isFinite(v)||v< -1e-7)||dualSlack.some((v,j)=>v< -1e-7*Math.max(1,Math.abs(c[j])))||gap>1e-6*Math.max(1,Math.abs(objective)))throw Error('LP optimality check failed');
  return {x,objective,slack,iterations,dual,dualObjective,gap};
 }
 function model(m,p){
  const n=m.names.length;
  if(n!==19||m.demand.length!==n||m.output.length!==n||m.imports.length!==n||m.effects.length!==n||m.effects.some(r=>r.length!==n)||m.demand.some(v=>!Number.isFinite(v)||v<=0)||m.output.some(v=>!Number.isFinite(v)||v<=0)||m.imports.some(v=>!Number.isFinite(v)||v<0)||m.effects.flat().some(v=>!Number.isFinite(v)||v<0))throw Error('Unsupported balance');
  if(![p.budget,p.importLimit,p.penalty].every(Number.isFinite)||p.budget<0||p.budget>100000||p.importLimit<0||p.importLimit>100000||p.penalty<0||p.penalty>10||[p.priority,p.maxDemand,p.cap].some(r=>r.length!==n)||p.priority.some(v=>!Number.isFinite(v)||v<0||v>10)||p.maxDemand.some(v=>!Number.isFinite(v)||v<0||v>20)||p.cap.some(v=>!Number.isFinite(v)||v<0||v>100))throw Error('Invalid constraints');
  const coeff=m.effects.map(row=>row.map((v,j)=>v/m.demand[j])),imp=m.imports.map((v,j)=>v/m.demand[j]);
  const A=[Array(n).fill(1),imp,...coeff,...Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0))];
  const b=[p.budget,p.importLimit,...m.output.map((v,i)=>v*p.cap[i]/100000),...m.demand.map((v,i)=>v*p.maxDemand[i]/100000)];
  const names=['Максимум конечного спроса','Максимум взвешенного спроса','Приоритеты с учётом импорта'];
  const objectives=[Array(n).fill(1),p.priority,p.priority.map((v,i)=>v-p.penalty*imp[i])];
  const results=objectives.map((c,i)=>{
   const r=solve(A,b,c),output=coeff.map(row=>dot(row,r.x)),imports=dot(imp,r.x),direct=sum(r.x),priority=dot(p.priority,r.x);
   return {...r,name:names[i],direct,imports,priority,output,gross:sum(output),usedBudget:p.budget-direct,unusedImport:p.importLimit-imports,capacitySlack:output.map((v,j)=>b[2+j]-v),objectiveCoefficients:c};
  });
  return {results,coeff,imp,A,b};
 }
 return {solve,model};
})();
if(typeof module!=='undefined')module.exports=ResourcePlan;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('opt-form');if(!form)return;
 const status=$('opt-status'),controls=$('opt-controls'),results=$('opt-results'),detail=$('opt-detail'),download=$('opt-csv'),select=$('opt-choice');
 const fmtValue=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—',fields=['opt-budget','opt-import','opt-penalty','opt-cap','opt-max'];
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const row of rows){const tr=b.insertRow();for(const v of row){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=v??'—'}}host.replaceChildren(t)};
 const field=(value,min,max,label)=>{const x=node('input','');x.type='number';x.value=value;x.min=min;x.max=max;x.step='0.1';x.setAttribute('aria-label',label);return x};
 try{
  const m=await load('sectors.json'),n=m.names.length,qs=new URLSearchParams(location.search);
  const vector=(name,d,min,max)=>{const raw=qs.get(name);if(!raw)return Array(n).fill(d);const v=raw.split(',').map(Number);return v.length===n&&v.every(x=>Number.isFinite(x)&&x>=min&&x<=max)?v:Array(n).fill(d)};
  const w=vector('opt-priority',1,0,10),caps=vector('opt-caps',10,0,100),max=vector('opt-maxima',20,0,20);
  const priority=m.names.map((v,i)=>field(w[i],0,10,'Вес: '+v)),cap=m.names.map((v,i)=>field(caps[i],0,100,'Предел выпуска: '+v)),maximum=m.names.map((v,i)=>field(max[i],0,20,'Предел спроса: '+v));
  table(controls,['Группа продукции','Приоритет (0–10)','Макс. прирост конечного спроса, %','Макс. прирост выпуска, %'],m.names.map((v,i)=>[v,priority[i],maximum[i],cap[i]]));
  restore(fields);
  let latest=null,params=null;
  function showDetail(){
   if(!latest)return;const r=latest.results[Number(select.value)||0];
   table(detail,['Группа','Прирост спроса, млрд ₽','Прирост спроса, % базы','Прирост выпуска, млрд ₽','Прирост выпуска, % базы','Импорт от спроса группы, млрд ₽','Остаток условного лимита выпуска, млрд ₽'],m.names.map((name,i)=>[name,fmtValue(r.x[i]),fmtValue(r.x[i]*100000/m.demand[i]),fmtValue(r.output[i]),fmtValue(r.output[i]*100000/m.output[i]),fmtValue(r.x[i]*latest.imp[i]),fmtValue(Math.max(0,r.capacitySlack[i]))]));
  }
  function draw(){
   results.replaceChildren();detail.replaceChildren();$('opt-chart').replaceChildren();download.disabled=true;latest=null;
   const all=[...priority,...cap,...maximum,...fields.map($)];
   if(all.some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber))){status.textContent='Проверьте допустимые пределы и веса.';return}
   const p={budget:$('opt-budget').valueAsNumber,importLimit:$('opt-import').valueAsNumber,penalty:$('opt-penalty').valueAsNumber,priority:priority.map(x=>x.valueAsNumber),maxDemand:maximum.map(x=>x.valueAsNumber),cap:cap.map(x=>x.valueAsNumber)};
   try{latest=ResourcePlan.model(m,p);params=p}catch(e){console.error(e);status.textContent='Не удалось получить допустимое решение. Проверьте данные и ограничения.';return}
   const r=latest.results;status.textContent='Рассчитано альтернатив: '+r.length+' · все решения проверены на соблюдение заданных ограничений.';
   table(results,['Критерий','Конечный спрос, млрд ₽','Взвешенный спрос, усл. ед.','Валовой выпуск, млрд ₽','Импортные затраты, млрд ₽','Неиспользованный лимит спроса, млрд ₽'],r.map(a=>[a.name,fmtValue(a.direct),fmtValue(a.priority),fmtValue(a.gross),fmtValue(a.imports),fmtValue(Math.max(0,a.usedBudget))]));
   const chart=$('opt-chart'),heading=node('h3','Сравнение рассчитанных альтернатив');chart.append(heading);
   for(const [label,key] of [['Дополнительный конечный спрос','direct'],['Дополнительный валовой выпуск','gross'],['Импортные промежуточные затраты','imports']]){
    const block=node('section','');block.className='opt-bars';block.append(node('h4',label+' · млрд ₽'));
    const max=Math.max(1,...r.map(a=>a[key]));
    for(const a of r){const row=node('div','');row.className='opt-bar-row';const text=node('p',a.name+' — '+fmtValue(a[key]));const meter=node('div','');meter.className='opt-bar-track';meter.setAttribute('aria-hidden','true');const fill=node('div','');fill.className='opt-bar-fill';fill.style.width=(100*a[key]/max)+'%';meter.append(fill);row.append(text,meter);block.append(row)}
    chart.append(block);
   }
   chart.append(node('p','Шкала едина внутри каждого показателя; между показателями длины полос не сопоставляются.'));
   chart.append(node('p','Численная проверка оптимальности: максимальное расхождение прямой и двойственной целей — '+Math.max(...r.map(a=>a.gap)).toExponential(2)+' усл. ед.'));
   showDetail();
   download.disabled=false;download.onclick=()=>csv('resource-allocation-2021.csv',[['Источник','https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'],['Версия',version||''],['Лимит спроса, млрд ₽',params.budget],['Лимит импорта, млрд ₽',params.importLimit],['Штраф импорта',params.penalty],['Альтернатива','Группа','Вес','Макс. прирост спроса, %','Макс. прирост выпуска, %','Дополнительный спрос, млрд ₽','Дополнительный выпуск, млрд ₽','Импорт от дополнительного спроса, млрд ₽','Коэффициент цели','Суммарное значение цели','Двойственная цель','Невязка оптимальности'],...r.flatMap(a=>m.names.map((name,i)=>[a.name,name,params.priority[i],params.maxDemand[i],params.cap[i],a.x[i],a.output[i],a.x[i]*latest.imp[i],a.objectiveCoefficients[i],a.objective,a.dualObjective,a.gap]))]);
   save(fields);const u=new URL(location.href);u.searchParams.set('opt-priority',p.priority.join(','));u.searchParams.set('opt-caps',p.cap.join(','));u.searchParams.set('opt-maxima',p.maxDemand.join(','));history.replaceState(null,'',u);
  }
  select.onchange=showDetail;
  $('opt-apply').onclick=()=>{const a=$('opt-cap'),b=$('opt-max');if(!a.validity.valid||!b.validity.valid||!a.value||!b.value)return;cap.forEach(x=>x.value=a.value);maximum.forEach(x=>x.value=b.value);draw()};
  $('opt-reset').onclick=()=>{priority.forEach(x=>x.value='1');cap.forEach(x=>x.value='10');maximum.forEach(x=>x.value='20');$('opt-budget').value='1000';$('opt-import').value='150';$('opt-penalty').value='2';$('opt-cap').value='10';$('opt-max').value='20';draw()};
  [...priority,...cap,...maximum].forEach(x=>x.oninput=draw);form.oninput=draw;form.onsubmit=e=>e.preventDefault();draw()
 }catch(e){console.error(e);status.textContent='Модель распределения недоступна в этой версии.'}
});
