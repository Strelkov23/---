/* Fixed-base valuation technology experiments, 19 aggregated product groups.
   No forecasts, physical engineering coefficients, or endogenous R&D costs. */
const Technology=(()=>{
 const P=typeof module!=='undefined'?require('./price-model.js'):PriceModel;
 const R=typeof module!=='undefined'?require('./resource-plan.js'):ResourcePlan;
 const sum=a=>a.reduce((s,v)=>s+v,0),dot=(a,b)=>sum(a.map((v,i)=>v*b[i])),finite=Number.isFinite;
 const within=(v,lo,hi)=>finite(v)&&v>=lo&&v<=hi;
 function structure(m,p){
  P.matrix(m);
  const n=m.names.length;
  if(!m.compatible||m.residual.some(v=>v< -1e-9)||m.imported.some(v=>v<0)||m.demand.some(v=>!finite(v)||v<0)||m.output.length!==n||m.output.some(v=>!finite(v)||v<=0))throw Error('Несовместимые исходные данные');
  const vector=(k,lo,hi)=>Array.isArray(p[k])&&p[k].length===n&&p[k].every(v=>within(v,lo,hi));
  if(!vector('material',-20,80)||!vector('imported',-20,80)||!vector('productivity',-20,200)||!vector('demand',0,20))throw Error('Недопустимые параметры технологии');
  if(p.hours!==null&&(!Array.isArray(p.hours)||p.hours.length!==n||p.hours.some(v=>!within(v,0,1e10))))throw Error('Введите все коэффициенты часов либо отключите труд');
  const A=m.A.map(row=>row.map((v,j)=>v*(1-p.material[j]/100)));
  const imp=m.imported.map((v,j)=>v*(1-p.imported[j]/100));
  const M=A.map((row,i)=>row.map((v,j)=>(i===j?1:0)-v));
  const transpose=M.map((_,i)=>M.map(row=>row[i]));
  const witness=P.linear(M,Array(n).fill(1));
  if(witness.some(v=>v<=0))throw Error('Изменённая технология не продуктивна: уменьшите рост затрат');
  const L=Array.from({length:n},(_,j)=>P.linear(M,Array.from({length:n},(_,i)=>i===j?1:0))).map((_,i,a)=>a.map(col=>col[i]));
  if(L.some(row=>row.some(v=>v< -1e-9)))throw Error('Некорректная обратная матрица');
  const demand=m.demand.map((v,i)=>v*p.demand[i]/100000);
  const hours=p.hours===null?null:p.hours.map((v,i)=>v/(1+p.productivity[i]/100));
  const costs=P.linear(transpose,imp.map((v,i)=>v+m.residual[i]));
  if(costs.some(v=>!finite(v)||v< -1e-9))throw Error('Недопустимый расчёт затрат');
  return {A,imp,M,L,demand,hours,costs};
 }
 function baseline(m,p){return structure(m,{...p,material:m.names.map(()=>0),imported:m.names.map(()=>0),productivity:m.names.map(()=>0)})}
 function summarize(s){
  const output=s.L.map(row=>dot(row,s.demand)),domestic=s.A.map(row=>dot(row,output));
  const imports=output.map((v,i)=>v*s.imp[i]),labor=s.hours===null?null:output.map((v,i)=>v*s.hours[i]);
  const residual=Math.max(...output.map((v,i)=>Math.abs(v-domestic[i]-s.demand[i])));
  if(residual>1e-7*Math.max(1,...output)||output.some(v=>v< -1e-8))throw Error('Ошибка баланса выпуска');
  return {output,domestic,imports,labor,totalOutput:sum(output),totalDomestic:sum(domestic),totalImports:sum(imports),totalLabor:labor===null?null:sum(labor),demand:sum(s.demand),basket:sum(s.demand)>0?100*dot(s.costs,s.demand)/sum(s.demand):null,residual};
 }
 function calculate(m,p){
  const s=structure(m,p),b=baseline(m,p);
  return {base:summarize(b),changed:summarize(s),structure:s,baseline:b};
 }
 function allocate(m,p,limits,changed=true){
  const s=changed?structure(m,p):baseline(m,p),n=m.names.length;
  if(!within(limits.budget,0,1e6)||!within(limits.importLimit,0,1e6)||!within(limits.spare,0,100)||s.hours!==null&&!within(limits.laborCap,0,1e13))throw Error('Недопустимые ресурсные ограничения');
  const priority=limits.priority;
  if(!Array.isArray(priority)||priority.length!==n||priority.some(v=>!within(v,0,10)))throw Error('Недопустимые веса');
  const importPer=s.L[0].map((_,j)=>sum(s.L.map((row,i)=>row[j]*s.imp[i])));
  const laborPer=s.hours===null?null:s.L[0].map((_,j)=>sum(s.L.map((row,i)=>row[j]*s.hours[i])));
  const constraints=[{id:'budget',title:'Бюджет конечного спроса',unit:'млрд ₽',a:Array(n).fill(1),b:limits.budget},{id:'imports',title:'Промежуточный импорт',unit:'млрд ₽',a:importPer,b:limits.importLimit},...s.L.map((a,i)=>({id:'capacity-'+i,title:'Мощность: '+m.names[i],unit:'млрд ₽',a,b:m.output[i]/1000*limits.spare/100}))];
  if(laborPer!==null)constraints.push({id:'labor',title:'Трудовые часы',unit:'часы',a:laborPer,b:limits.laborCap});
  constraints.push(...s.demand.map((b,i)=>({id:'demand-'+i,title:'Предел спроса: '+m.names[i],unit:'млрд ₽',a:Array.from({length:n},(_,j)=>i===j?1:0),b})));
  // Normalize rows and variables. Report duals back in original units.
  const scale=Math.max(1,limits.budget,...s.demand),objectiveScale=Math.max(1,scale*Math.max(...priority));
  const factors=constraints.map(r=>Math.max(1,r.b,...r.a.map(v=>Math.abs(v*scale))));
  const A=constraints.map((r,i)=>r.a.map(v=>v*scale/factors[i])),b=constraints.map((r,i)=>r.b/factors[i]),c=priority.map(v=>v*scale/objectiveScale);
  const lp=R.solve(A,b,c,{fast:true}),x=lp.x.map(v=>v*scale),score=dot(x,priority);
  const used=constraints.map(r=>dot(r.a,x));
  const dual=constraints.map((r,i)=>{
   const shadow=lp.dual[i]*objectiveScale/factors[i],slack=r.b-used[i],step=Math.max(r.b*.01,r.unit==='часы'?1000:.01);
   if(slack< -1e-6*Math.max(1,r.b))throw Error('Ошибка ресурсного ограничения');
   return {id:r.id,title:r.title,unit:r.unit,limit:r.b,used:used[i],slack,shadow,step};
  });
  // Selected-resource finite difference: valid LP shadow is an upper bound on objective gain
  // after a positive relaxation. Kinks can make it unequal to this finite increment.
  for(const d of dual.filter(r=>['budget','imports','labor'].includes(r.id)||r.shadow>1e-8&&r.id.startsWith('capacity-')).slice(0,8)){
   const i=constraints.findIndex(r=>r.id===d.id),next=[...b];next[i]+=d.step/factors[i];
   const test=R.solve(A,next,c,{fast:true});
   d.finiteGain=(test.objective-lp.objective)*objectiveScale;
   d.upperGain=d.shadow*d.step;
   if(d.finiteGain< -1e-5*Math.max(1,score)||d.finiteGain>d.upperGain+1e-5*Math.max(1,score))throw Error('Проверка двойственной оценки не пройдена');
  }
  return {x,score,totalDemand:sum(x),imports:dot(importPer,x),labor:laborPer===null?null:dot(laborPer,x),output:s.L.map(row=>dot(row,x)),dual,gap:lp.gap*objectiveScale,reference:{A,b,c,objective:lp.objective}};
 }
 return {structure,calculate,allocate};
})();
if(typeof module!=='undefined')module.exports=Technology;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('tech-form'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:7}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=String(v)}}host.replaceChildren(t)};
 const field=(v,min,max,label)=>{const e=document.createElement('input');e.type='number';e.min=min;e.max=max;e.step='any';e.value=v;e.setAttribute('aria-label',label);return e};
 try{
  const m=await load('price-data.json'),n=m.names.length;
  const keys=[['material',0,-20,80,'Экономия отечественных затрат'],['imported',0,-20,80,'Экономия импортных затрат'],['productivity',0,-20,200,'Рост производительности'],['demand',3,0,20,'Целевой прирост спроса'],['hours','',0,1e10,'Часы на млрд выпуска'],['priority',1,0,10,'Вес приоритета']];
  const fields=Object.fromEntries(keys.map(([k,v,lo,hi,label])=>[k,m.names.map(name=>field(v,lo,hi,label+': '+name))]));
  table($('tech-controls'),['Продуктовая группа','Экономия отеч. затрат, %','Экономия имп. затрат, %','Рост производительности, %','Прирост спроса, %','Прямые часы на млрд ₽','Вес спроса'],m.names.map((name,i)=>[name,...keys.map(([k])=>fields[k][i])]));
  const clear=()=>{for(const id of ['tech-summary','tech-detail','tech-alloc','tech-dual','tech-chart'])$(id).replaceChildren();$('tech-csv').disabled=true;$('tech-status').textContent='Параметры изменены. Запустите расчёт.'};
  const laborState=()=>{const enabled=$('tech-labor').checked;for(const e of [...fields.hours,$('tech-labor-cap')]){e.disabled=!enabled;e.required=enabled}};
  laborState();
  $('tech-form').addEventListener('input',()=>{laborState();clear()});$('tech-controls').addEventListener('input',clear);
  $('tech-form').addEventListener('submit',e=>{e.preventDefault();clear();
   try{
    const p=Object.fromEntries(keys.filter(([k])=>k!=='priority').map(([k])=>[k,k==='hours'&&!$('tech-labor').checked?null:fields[k].map(e=>e.valueAsNumber)])),limits={budget:$('tech-budget').valueAsNumber,importLimit:$('tech-import-limit').valueAsNumber,spare:$('tech-spare').valueAsNumber,laborCap:$('tech-labor-cap').valueAsNumber,priority:fields.priority.map(e=>e.valueAsNumber)};
    const r=Technology.calculate(m,p),a=Technology.allocate(m,p,limits,false),b=Technology.allocate(m,p,limits,true);
    const metrics=[['Одинаковый целевой спрос, млрд ₽','demand'],['Требуемый валовой выпуск, млрд ₽','totalOutput'],['Отечественные промежуточные затраты, млрд ₽','totalDomestic'],['Импортные промежуточные затраты, млрд ₽','totalImports'],['Полная потребность в часах','totalLabor'],['Условный индекс затрат (исходный = 100)','basket']];
    table($('tech-summary'),['Показатель','Базовая технология','Изменённая технология','Разница'],metrics.map(([label,k])=>[label,fmt(r.base[k]),fmt(r.changed[k]),fmt(r.base[k]===null||r.changed[k]===null?null:r.changed[k]-r.base[k])]));
    table($('tech-detail'),['Группа','Выпуск до, млрд ₽','Выпуск после, млрд ₽','Импорт до, млрд ₽','Импорт после, млрд ₽','Часы до','Часы после','Индекс затрат после'],m.names.map((name,i)=>[name,...[r.base.output[i],r.changed.output[i],r.base.imports[i],r.changed.imports[i],r.base.labor?.[i],r.changed.labor?.[i],r.structure.costs[i]*100].map(fmt)]));
    table($('tech-alloc'),['Технология','Взвешенная цель','Конечный спрос, млрд ₽','Импорт, млрд ₽','Часы'],[['Базовая',a],['Изменённая',b]].map(([label,x])=>[label,...[x.score,x.totalDemand,x.imports,x.labor].map(fmt)]));
    const shown=b.dual.filter(x=>!x.id.startsWith('demand-'));
    table($('tech-dual'),['Ограничение','Единица','Лимит','Использовано','Остаток','Двойственная оценка за единицу','Шаг проверки','Прирост цели','Верхняя граница прироста'],shown.map(x=>[x.title,x.unit,...[x.limit,x.used,x.slack,x.shadow,x.finiteGain===undefined?null:x.step,x.finiteGain,x.upperGain].map(fmt)]));
    const chart=$('tech-chart'),max=Math.max(1,...[a,b].map(x=>x.score));for(const [label,x] of [['Базовая технология',a],['Изменённая технология',b]]){const d=document.createElement('div'),p=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';p.textContent=label+' · '+fmt(x.score);track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=(x.score/max*100)+'%';track.append(fill);d.append(p,track);chart.append(d)}
    $('tech-status').textContent='Рассчитано '+n+' групп. Проверены балансовые равенства и двойственные оценки. Условный эксперимент, не прогноз.';
    $('tech-csv').disabled=false;$('tech-csv').onclick=()=>csv('technology-scenario.csv',[['Источник',m.source],['База',2021],['Трудовые часы',p.hours?'пользовательские допущения':'не учитываются'],...Object.entries(limits).filter(([k])=>k!=='priority'&&(k!=='laborCap'||p.hours)),['Группа',...keys.map(([k])=>k)],...m.names.map((name,i)=>[name,...keys.map(([k])=>k==='priority'?limits.priority[i]:p[k]?.[i])]),['Показатель','База','Сценарий'],...metrics.map(([label,k])=>[label,r.base[k],r.changed[k]]),['Группа','Выпуск до','Выпуск после','Импорт до','Импорт после','Часы до','Часы после','Индекс затрат','Распределение спроса до','Распределение спроса после'],...m.names.map((name,i)=>[name,r.base.output[i],r.changed.output[i],r.base.imports[i],r.changed.imports[i],r.base.labor?.[i],r.changed.labor?.[i],r.structure.costs[i]*100,a.x[i],b.x[i]]),['Технология','Ограничение','Единица','Лимит','Использовано','Остаток','Двойственная оценка','Шаг проверки','Прирост цели','Верхняя граница прироста'],...[[a,'Базовая'],[b,'Изменённая']].flatMap(([x,label])=>x.dual.map(d=>[label,d.title,d.unit,d.limit,d.used,d.slack,d.shadow,d.finiteGain===undefined?null:d.step,d.finiteGain,d.upperGain]))]);
   }catch(err){$('tech-status').textContent='Расчёт остановлен: '+err.message}
  });
  $('tech-example').onclick=()=>{fields.material.forEach(e=>e.value=10);fields.imported.forEach(e=>e.value=5);fields.productivity.forEach(e=>e.value=15);clear()};
  $('tech-reset').onclick=()=>{$('tech-form').reset();keys.forEach(([k,v])=>fields[k].forEach(e=>e.value=v));laborState();clear()};clear();
 }catch(err){console.error(err);$('tech-status').textContent='Не удалось загрузить баланс.'}
});
