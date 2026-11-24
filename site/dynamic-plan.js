/* Multi-period incremental capacity scenario over the domestic 2021 IO balance.
   Base quantities are million RUB; scenario output and spending are billion RUB.
   Baseline production and replacement of baseline capital are assumed maintained externally. */
const DynamicPlan=(()=>{
 const sum=a=>a.reduce((s,v)=>s+v,0), finite=Number.isFinite;
 function calculate(m,p){
  const n=m.names.length;
  if(!n||[m.output,m.demand,m.imports].some(v=>!Array.isArray(v)||v.length!==n||v.some(x=>!finite(x)||x<0))||m.output.some(v=>v<=0)||!Array.isArray(m.effects)||m.effects.length!==n||m.effects.some(r=>r.length!==n||r.some(v=>!finite(v)||v<0)))throw Error('Invalid balance');
  const limits={years:[1,15],spare:[0,100],investment:[0,100000],capitalRatio:[.1,20],depreciation:[0,100],importLimit:[0,100000]};
  if(Object.entries(limits).some(([k,[lo,hi]])=>!finite(p[k])||p[k]<lo||p[k]>hi)||!Number.isInteger(p.years)||!Array.isArray(p.growth)||p.growth.length!==n||p.growth.some(v=>!finite(v)||v<0||v>20)||!['output','gap'].includes(p.allocation))throw Error('Invalid parameters');
  const base=m.output.map(v=>v/1000), spare=base.map(v=>v*p.spare/100);
  let extra=base.map(()=>0);const years=[];
  for(let year=1;year<=p.years;year++){
   const shock=p.growth.map(v=>Math.pow(1+v/100,year)-1);
   const demand=m.demand.map((v,j)=>v*shock[j]/1000);
   const required=m.effects.map(row=>sum(row.map((v,j)=>v*shock[j]/1000)));
   const requiredImport=sum(m.imports.map((v,j)=>v*shock[j]/1000));
   const available=extra.map((v,i)=>v+spare[i]);
   const ratios=required.map((v,i)=>v>0?available[i]/v:Infinity);
   const importRatio=requiredImport>0?p.importLimit/requiredImport:Infinity;
   const alpha=Math.min(1,importRatio,...ratios);
   const realized=required.map(v=>v*alpha),actualDemand=demand.map(v=>v*alpha);
   // Investment chosen after this year's production and commissioned next year.
   const retained=extra.map(v=>v*(1-p.depreciation/100));
   const nextShock=p.growth.map(v=>Math.pow(1+v/100,year+1)-1);
   const nextRequired=m.effects.map(row=>sum(row.map((v,j)=>v*nextShock[j]/1000)));
   const gaps=nextRequired.map((v,i)=>Math.max(0,v-spare[i]-retained[i]));
   const weights=p.allocation==='gap'?gaps:base;
   const totalWeight=sum(weights);
   const invest=weights.map(v=>totalWeight>0?p.investment*v/totalWeight:0);
   const next=retained.map((v,i)=>v+invest[i]/p.capitalRatio);
   const groups=m.names.map((name,i)=>({name,demand:demand[i],actualDemand:actualDemand[i],required:required[i],realized:realized[i],available:available[i],extra:extra[i],invest:invest[i],nextExtra:next[i],shortfall:Math.max(0,required[i]-available[i]),binding:required[i]>0&&Math.abs(ratios[i]-alpha)<1e-9&&alpha<1}));
   const row={year,alpha,required:sum(required),realized:sum(realized),demand:sum(demand),actualDemand:sum(actualDemand),requiredImport,actualImport:requiredImport*alpha,investment:sum(invest),unusedInvestment:Math.max(0,p.investment-sum(invest)),available:sum(available),importBinding:requiredImport>0&&alpha<1&&Math.abs(importRatio-alpha)<1e-9,groups};
   if(groups.some(g=>g.realized>g.available+1e-7*Math.max(1,g.available))||row.actualImport>p.importLimit+1e-7*Math.max(1,p.importLimit)||row.investment>p.investment+1e-7*Math.max(1,p.investment)||!finite(row.realized))throw Error('Scenario feasibility failed');
   years.push(row);extra=next;
  }
  return years;
 }
 return {calculate};
})();
if(typeof module!=='undefined')module.exports=DynamicPlan;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('dyn-form');if(!form)return;
 const status=$('dyn-status'),controls=$('dyn-controls'),metrics=$('dyn-metrics'),out=$('dyn-results'),detail=$('dyn-detail'),chart=$('dyn-chart'),select=$('dyn-year'),download=$('dyn-csv');
 const fmtNum=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>{const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=String(v)})}host.replaceChildren(t)};
 try{
  const m=await load('sectors.json');
  const fields=m.names.map(name=>{const e=document.createElement('input');e.type='number';e.min=0;e.max=20;e.step=.1;e.value=3;e.setAttribute('aria-label','Годовой прирост спроса: '+name);return e});
  table(controls,['Группа продукции','Годовой прирост целевого спроса, %'],m.names.map((n,i)=>[n,fields[i]]));
  let rows=[];
  function showDetail(){const r=rows.find(r=>r.year===Number(select.value));if(!r){detail.replaceChildren();return}table(detail,['Группа','Требуемый прирост выпуска','Доступный прирост','Реализуемый прирост','Прямой целевой спрос','Инвестиции для следующего года','Доп. мощность следующего года','Ограничение'],r.groups.map(g=>[g.name,...[g.required,g.available,g.realized,g.demand,g.invest,g.nextExtra].map(fmtNum),g.binding?'Связывает сценарий':'—']))}
  function draw(){
   for(const e of [metrics,out,detail,chart])e.replaceChildren();download.disabled=true;rows=[];
   const p=Object.fromEntries(['years','spare','investment','capitalRatio','depreciation','importLimit'].map(k=>[k,$('dyn-'+k).valueAsNumber]));p.growth=fields.map(e=>e.valueAsNumber);p.allocation=$('dyn-allocation').value;
   try{if([...form.querySelectorAll('input'),...fields].some(e=>!e.validity.valid))throw Error('Invalid controls');rows=DynamicPlan.calculate(m,p)}catch(e){status.textContent='Проверьте параметры: '+e.message;return}
   const last=rows.at(-1);status.textContent='Рассчитано периодов: '+rows.length+' · условный сценарий в ценах баланса 2021 года, млрд ₽.';
   for(const [label,v] of [['Реализуемая доля целевого прироста в последнем году',fmtNum(last.alpha*100)+'%'],['Требуемый прирост валового выпуска',fmtNum(last.required)+' млрд ₽'],['Реализуемый прирост валового выпуска',fmtNum(last.realized)+' млрд ₽']]){const d=document.createElement('div');d.className='metric';const b=document.createElement('b'),s=document.createElement('span');b.textContent=v;s.textContent=label;d.append(b,s);metrics.append(d)}
   table(out,['Период','Целевой прирост выпуска','Реализуемый прирост','Доля, %','Промежуточный импорт','Инвестиции','Неисп. инвест. лимит','Главный ограничитель'],rows.map(r=>[r.year,...[r.required,r.realized,r.alpha*100,r.actualImport,r.investment,r.unusedInvestment].map(fmtNum),[...(r.importBinding?['Импорт']:[]),...r.groups.filter(g=>g.binding).map(g=>g.name)].join('; ')||'Нет связывающего ограничения']));
   const prior=select.value;select.replaceChildren(...rows.map(r=>new Option('Период '+r.year,String(r.year))));if(rows.some(r=>String(r.year)===prior))select.value=prior;else select.value=String(last.year);showDetail();
   const series=[{name:'Требуемый прирост',code:'required',values:rows.map(r=>r.required)},{name:'Реализуемый прирост',code:'realized',values:rows.map(r=>r.realized)}];
   const max=Math.max(1,...rows.map(r=>r.required));for(const r of rows){const d=document.createElement('div');d.className='dyn-bars';const p=document.createElement('p');p.textContent='Период '+r.year+': '+fmtNum(r.realized)+' / '+fmtNum(r.required)+' млрд ₽';const track=document.createElement('div'),goal=document.createElement('div'),fact=document.createElement('div');track.className='budget-bar-track';goal.className='dyn-goal';goal.style.width=(r.required/max*100)+'%';fact.className='budget-bar-fill';fact.style.width=(r.required?r.realized/r.required*100:0)+'%';goal.append(fact);track.append(goal);d.append(p,track);chart.append(d)}
   // Shared chart exporter includes sources and snapshot version. Period numbers are not calendar years.
   if(typeof chartTools==='function')chartTools(chart,'Условный прирост выпуска по периодам','млрд руб. в ценах 2021 года',rows.map(r=>2021+r.year),series,{source:'Росстат, баланс 2021; пользовательские допущения; годы — условная привязка к базе, не прогноз',url:'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'});
   download.disabled=false;download.onclick=()=>csv('dynamic-capacity-scenario.csv',[['Модель','Баланс 2021; условные периоды; млрд руб.'],['Версия',typeof version!=='undefined'?version:''],...Object.entries(p).filter(([k])=>k!=='growth'),['Группа','Годовой прирост спроса, %'],...m.names.map((n,i)=>[n,p.growth[i]]),['Период','Группа','Целевой спрос','Реализуемый спрос','Требуемый выпуск','Доступный выпуск','Реализуемый выпуск','Накопленная доп. мощность','Инвестиции','Доп. мощность следующего периода','Доля сценария','Промежуточный импорт всего'],...rows.flatMap(r=>r.groups.map(g=>[r.year,g.name,g.demand,g.actualDemand,g.required,g.available,g.realized,g.extra,g.invest,g.nextExtra,r.alpha,r.actualImport]))]);
  }
  form.addEventListener('input',draw);controls.addEventListener('input',draw);form.addEventListener('submit',e=>e.preventDefault());select.addEventListener('change',showDetail);
  $('dyn-apply').onclick=()=>{const v=$('dyn-uniform');if(v.validity.valid&&Number.isFinite(v.valueAsNumber)){fields.forEach(e=>e.value=v.value);draw()}};
  $('dyn-reset').onclick=()=>{form.reset();fields.forEach(e=>e.value=3);draw()};draw();
 }catch(e){status.textContent='Не удалось загрузить исходный баланс.';console.error(e)}
});
