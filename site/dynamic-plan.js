/* Multi-period incremental capacity scenario over the domestic 2021 IO balance.
   Base quantities are million RUB; scenario output and spending are billion RUB.
   Baseline production and replacement of baseline capital are assumed maintained externally. */
const DynamicPlan=(()=>{
 const sum=a=>a.reduce((s,v)=>s+v,0), finite=Number.isFinite;
 // One-period optimum: maximize a common feasible demand fraction, then minimize expenditure.
 function allocateNext(required,capacity,investment,kappa,importNeed,importLimit,otherUpper=1){
  const n=required.length;
  if(!n||capacity.length!==n||[...required,...capacity,investment,importNeed,importLimit].some(v=>!finite(v)||v<0)||!finite(kappa)||kappa<=0||!finite(otherUpper)||otherUpper<0||otherUpper>1)throw Error('Invalid allocation');
  const upper=Math.min(otherUpper,importNeed>0?Math.min(1,importLimit/importNeed):1);
  const amounts=a=>required.map((v,i)=>kappa*Math.max(0,a*v-capacity[i]));
  const cost=a=>sum(amounts(a));
  let lo=0,hi=upper;
  if(cost(upper)<=investment)lo=upper;
  else for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(cost(mid)<=investment)lo=mid;else hi=mid}
  const invest=amounts(lo);
  if(sum(invest)>investment+1e-8*Math.max(1,investment))throw Error('Allocation exceeds budget');
  return {alpha:lo,invest,used:sum(invest),upper};
 }
 function validateLabor(labor,n){
  if(labor==null)return;
  if(!finite(labor.cap)||labor.cap<0||labor.cap>1e9||!finite(labor.productivity)||labor.productivity< -10||labor.productivity>20||!Array.isArray(labor.intensity)||labor.intensity.length!==n||labor.intensity.some(v=>!finite(v)||v<0||v>1e6))throw Error('Invalid labor assumptions');
 }
 function laborNeed(required,labor,period){
  if(labor==null)return null;
  const factor=(1+labor.productivity/100)**period;
  return sum(required.map((v,i)=>v*labor.intensity[i]/factor));
 }
 function laborUpper(required,labor,period){
  const need=laborNeed(required,labor,period);
  return need>0?Math.min(1,labor.cap/need):1;
 }
 function paramRows(p){
  return [...Object.entries(p).filter(([k])=>!['growth','labor'].includes(k)),
   ['Трудовое ограничение',p.labor?'включено':'выключено'],
   ...(p.labor?[['Лимит дополнительных человеко-лет',p.labor.cap],['Рост производительности, % за период',p.labor.productivity],...(p.labor.sources||[]).map((source,i)=>['Источник коэффициента группы '+(i+1),source])]:[])];
 }
 function calculate(m,p){
  const n=m.names.length;
  if(!n||[m.output,m.demand,m.imports].some(v=>!Array.isArray(v)||v.length!==n||v.some(x=>!finite(x)||x<0))||m.output.some(v=>v<=0)||!Array.isArray(m.effects)||m.effects.length!==n||m.effects.some(r=>r.length!==n||r.some(v=>!finite(v)||v<0)))throw Error('Invalid balance');
  const limits={years:[1,15],spare:[0,100],investment:[0,100000],capitalRatio:[.1,20],depreciation:[0,100],importLimit:[0,100000]};
  if(Object.entries(limits).some(([k,[lo,hi]])=>!finite(p[k])||p[k]<lo||p[k]>hi)||!Number.isInteger(p.years)||!Array.isArray(p.growth)||p.growth.length!==n||p.growth.some(v=>!finite(v)||v<0||v>20)||!['output','gap','maximin'].includes(p.allocation))throw Error('Invalid parameters');
  validateLabor(p.labor,n);
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
   const requiredLabor=laborNeed(required,p.labor,year),laborRatio=laborUpper(required,p.labor,year);
   const alpha=Math.min(1,importRatio,laborRatio,...ratios);
   const realized=required.map(v=>v*alpha),actualDemand=demand.map(v=>v*alpha);
   // Investment chosen after this year's production and commissioned next year.
   const retained=extra.map(v=>v*(1-p.depreciation/100));
   const nextShock=p.growth.map(v=>Math.pow(1+v/100,year+1)-1);
   const nextRequired=m.effects.map(row=>sum(row.map((v,j)=>v*nextShock[j]/1000)));
   const gaps=nextRequired.map((v,i)=>Math.max(0,v-spare[i]-retained[i]));
   const weights=p.allocation==='gap'?gaps:base;
   const totalWeight=sum(weights);
   const nextImport=sum(m.imports.map((v,j)=>v*nextShock[j]/1000));
   const optimal=allocateNext(nextRequired,retained.map((v,i)=>v+spare[i]),p.investment,p.capitalRatio,nextImport,p.importLimit,laborUpper(nextRequired,p.labor,year+1));
   const invest=p.allocation==='maximin'?optimal.invest:weights.map(v=>totalWeight>0?p.investment*v/totalWeight:0);
   const achievedNext=Math.min(1,laborUpper(nextRequired,p.labor,year+1),nextImport>0?p.importLimit/nextImport:Infinity,...nextRequired.map((v,i)=>v>0?(spare[i]+retained[i]+invest[i]/p.capitalRatio)/v:Infinity));
   if(achievedNext>optimal.alpha+1e-8||p.allocation==='maximin'&&Math.abs(achievedNext-optimal.alpha)>1e-8)throw Error('Next-period optimality check failed');
   const next=retained.map((v,i)=>v+invest[i]/p.capitalRatio);
   const groups=m.names.map((name,i)=>({name,demand:demand[i],actualDemand:actualDemand[i],required:required[i],realized:realized[i],available:available[i],extra:extra[i],invest:invest[i],nextExtra:next[i],shortfall:Math.max(0,required[i]-available[i]),binding:required[i]>0&&Math.abs(ratios[i]-alpha)<1e-9&&alpha<1}));
   const row={year,alpha,requiredLabor,actualLabor:requiredLabor===null?null:requiredLabor*alpha,laborBinding:requiredLabor>0&&alpha<1&&Math.abs(laborRatio-alpha)<1e-9,nextAlpha:achievedNext,nextUpper:optimal.alpha,required:sum(required),realized:sum(realized),demand:sum(demand),actualDemand:sum(actualDemand),requiredImport,actualImport:requiredImport*alpha,investment:sum(invest),unusedInvestment:Math.max(0,p.investment-sum(invest)),available:sum(available),importBinding:requiredImport>0&&alpha<1&&Math.abs(importRatio-alpha)<1e-9,groups};
   if(groups.some(g=>g.realized>g.available+1e-7*Math.max(1,g.available))||row.actualImport>p.importLimit+1e-7*Math.max(1,p.importLimit)||row.investment>p.investment+1e-7*Math.max(1,p.investment)||p.labor&&row.actualLabor>p.labor.cap+1e-7*Math.max(1,p.labor.cap)||!finite(row.realized))throw Error('Scenario feasibility failed');
   years.push(row);extra=next;
  }
  return years;
 }
 function compare(m,p){
  const variants=[
   {id:'output',label:'Пропорционально выпуску',p:{...p,allocation:'output'}},
   {id:'gap',label:'Пропорционально разрывам',p:{...p,allocation:'gap'}},
   {id:'maximin',label:'Максимум доли в следующем периоде',p:{...p,allocation:'maximin'}}
  ];
  return variants.map(v=>({id:v.id,label:v.label,rows:calculate(m,v.p)}));
 }
 function sensitivity(m,p){
  const specs=[['investment','Инвестиционный лимит'],['importLimit','Импортный лимит'],['capitalRatio','Капиталоёмкость'],['depreciation','Выбытие мощностей']];
  const limits={investment:[0,100000],importLimit:[0,100000],capitalRatio:[.1,20],depreciation:[0,100]};
  const baseline=calculate(m,p).at(-1).alpha;
  return specs.flatMap(([key,label])=>[-1,1].map(dir=>{
   // A zero baseline has no relative perturbation; keep it explicitly marked.
   const [min,max]=limits[key],value=Math.min(max,Math.max(min,p[key]*(1+dir*.25)));
   const rows=calculate(m,{...p,[key]:value}),last=rows.at(-1);
   return {key,label,dir,base:p[key],value,changed:value!==p[key],alpha:last.alpha,deltaPP:(last.alpha-baseline)*100,realized:last.realized};
  }));
 }
 return {calculate,allocateNext,compare,sensitivity,laborNeed,laborUpper,paramRows};
})();
if(typeof module!=='undefined')module.exports=DynamicPlan;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('dyn-form');if(!form)return;
 const alternatives=$('dyn-alternatives'),sensitivityHost=$('dyn-sensitivity'),compareChart=$('dyn-compare-chart'),compareDownload=$('dyn-compare-csv');
 const status=$('dyn-status'),controls=$('dyn-controls'),metrics=$('dyn-metrics'),out=$('dyn-results'),detail=$('dyn-detail'),chart=$('dyn-chart'),select=$('dyn-year'),download=$('dyn-csv');
 const fmtNum=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>{const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=String(v)})}host.replaceChildren(t)};
 try{
  const m=await load('sectors.json');
  const fields=m.names.map(name=>{const e=document.createElement('input');e.type='number';e.min=0;e.max=20;e.step=.1;e.value=3;e.setAttribute('aria-label','Годовой прирост спроса: '+name);return e});
  const laborFields=m.names.map(name=>{const e=document.createElement('input');e.type='number';e.min=0;e.max=1000000;e.step='any';e.placeholder='Не задано';e.disabled=true;e.setAttribute('aria-label','Человеко-лет на млрд ₽: '+name);return e});
  table(controls,['Группа продукции','Годовой прирост целевого спроса, %','Доп. человеко-лет на млрд ₽ выпуска в базе (гипотеза)'],m.names.map((n,i)=>[n,fields[i],laborFields[i]]));
  let rows=[],calibration=null;
  const calibrationStatus=$('dyn-calibration-status'),calibrationTable=$('dyn-calibration-multipliers');
  const calibrationFile=$('dyn-calibration-file');
  calibrationFile.addEventListener('change',async()=>{
   const file=calibrationFile.files?.[0];calibrationFile.value='';if(!file)return;
   try{if(file.size>200000)throw Error('Файл слишком большой');const parsed=LaborCalibration.parse(await file.text(),m);calibration=parsed;laborFields.forEach((e,i)=>e.value=String(parsed[i].intensity));$('dyn-laborEnabled').checked=true;draw();calibrationStatus.textContent='Импортировано '+parsed.length+' коэффициентов из пользовательского файла. Проверьте источники; задайте лимит человеко-лет.'}
   catch(e){calibrationStatus.textContent='Файл не принят: '+e.message+'; прежние параметры сохранены.'}
  });
  const global=typeof GlobalPlan!=='undefined'?GlobalPlan.mount(m):null;
  function showDetail(){const r=rows.find(r=>r.year===Number(select.value));if(!r){detail.replaceChildren();return}table(detail,['Группа','Требуемый прирост выпуска','Доступный прирост','Реализуемый прирост','Прямой целевой спрос','Инвестиции для следующего года','Доп. мощность следующего года','Ограничение'],r.groups.map(g=>[g.name,...[g.required,g.available,g.realized,g.demand,g.invest,g.nextExtra].map(fmtNum),g.binding?'Связывает сценарий':'—']))}
  function draw(){
   for(const e of [metrics,out,detail,chart,alternatives,sensitivityHost,compareChart])e.replaceChildren();download.disabled=true;compareDownload.disabled=true;rows=[];if(global)global.setParams(null);
   const p=Object.fromEntries(['years','spare','investment','capitalRatio','depreciation','importLimit'].map(k=>[k,$('dyn-'+k).valueAsNumber]));p.growth=fields.map(e=>e.valueAsNumber);p.allocation=$('dyn-allocation').value;
   calibrationTable.replaceChildren();
   if(calibration&&laborFields.some((e,i)=>Number(e.value)!==calibration[i].intensity||e.value==='')){calibration=null;calibrationStatus.textContent='Коэффициенты изменены вручную; исходная привязка к файлу снята.'}
   const laborOn=$('dyn-laborEnabled').checked;for(const e of [...laborFields,$('dyn-laborCap'),$('dyn-laborProductivity')]){e.disabled=!laborOn;e.required=laborOn}
   p.labor=laborOn?{cap:$('dyn-laborCap').valueAsNumber,productivity:$('dyn-laborProductivity').valueAsNumber,intensity:laborFields.map(e=>e.valueAsNumber),sources:calibration?calibration.map(r=>r.source):null}:null;
   if(laborOn&&p.labor.intensity.every(v=>Number.isFinite(v)&&v>=0&&v<=1e6)){const mult=LaborCalibration.multipliers(m,p.labor.intensity);table(calibrationTable,['Группа конечного спроса','Полная потребность, человеко-лет / млрд ₽ спроса в оценке 2021'],mult.map(r=>[r.name,fmtNum(r.perBillion)]))}
   try{if([...form.querySelectorAll('input'),...fields,...laborFields].some(e=>!e.validity.valid))throw Error('Invalid controls');rows=DynamicPlan.calculate(m,p)}catch(e){status.textContent='Проверьте параметры: '+e.message;return}
   if(global)global.setParams(p);
   const last=rows.at(-1);status.textContent='Рассчитано периодов: '+rows.length+' · условный сценарий в ценах баланса 2021 года, млрд ₽.';
   for(const [label,v] of [['Реализуемая доля целевого прироста в последнем году',fmtNum(last.alpha*100)+'%'],['Требуемый прирост валового выпуска',fmtNum(last.required)+' млрд ₽'],['Реализуемый прирост валового выпуска',fmtNum(last.realized)+' млрд ₽']]){const d=document.createElement('div');d.className='metric';const b=document.createElement('b'),s=document.createElement('span');b.textContent=v;s.textContent=label;d.append(b,s);metrics.append(d)}
   table(out,['Период','Целевой прирост выпуска','Реализуемый прирост','Доля, %','Промежуточный импорт','Доп. человеко-лет','Инвестиции','Неисп. инвест. лимит','Доля следующего периода, %','Локальный максимум, %','Главный ограничитель'],rows.map(r=>[r.year,...[r.required,r.realized,r.alpha*100,r.actualImport,r.actualLabor,r.investment,r.unusedInvestment,r.nextAlpha*100,r.nextUpper*100].map(fmtNum),[...(r.importBinding?['Импорт']:[]),...(r.laborBinding?['Трудовые ресурсы']:[]),...r.groups.filter(g=>g.binding).map(g=>g.name)].join('; ')||'Нет связывающего ограничения']));
   const prior=select.value;select.replaceChildren(...rows.map(r=>new Option('Период '+r.year,String(r.year))));if(rows.some(r=>String(r.year)===prior))select.value=prior;else select.value=String(last.year);showDetail();
   const series=[{name:'Требуемый прирост',code:'required',values:rows.map(r=>r.required)},{name:'Реализуемый прирост',code:'realized',values:rows.map(r=>r.realized)}];
   const max=Math.max(1,...rows.map(r=>r.required));for(const r of rows){const d=document.createElement('div');d.className='dyn-bars';const p=document.createElement('p');p.textContent='Период '+r.year+': '+fmtNum(r.realized)+' / '+fmtNum(r.required)+' млрд ₽';const track=document.createElement('div'),goal=document.createElement('div'),fact=document.createElement('div');track.className='budget-bar-track';goal.className='dyn-goal';goal.style.width=(r.required/max*100)+'%';fact.className='budget-bar-fill';fact.style.width=(r.required?r.realized/r.required*100:0)+'%';goal.append(fact);track.append(goal);d.append(p,track);chart.append(d)}
   // Shared chart exporter includes sources and snapshot version. Period numbers are not calendar years.
   if(typeof chartTools==='function')chartTools(chart,'Условный прирост выпуска по периодам','млрд руб. в ценах 2021 года',rows.map(r=>r.year),series,{periodLabel:'Условный период',territory:'Россия · условные периоды от базы 2021',source:'Росстат, баланс 2021; пользовательские допущения; не прогноз',url:'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'});
   const variants=DynamicPlan.compare(m,p),tests=DynamicPlan.sensitivity(m,p);
   const summarize=v=>{const end=v.rows.at(-1),total=key=>v.rows.slice(0,-1).reduce((a,r)=>a+r[key],0);return [v.label,fmtNum(end.alpha*100),fmtNum(end.realized),fmtNum(total('investment')),fmtNum(v.rows.at(-1).investment)]};
   table(alternatives,['Стратегия','Доля в последнем периоде, %','Прирост выпуска, млрд ₽','Инвестиции до последнего периода, млрд ₽','Инвестиции после последнего выпуска, млрд ₽'],variants.map(summarize));
   table(sensitivityHost,['Параметр','База','Проверяемое значение','Доля в конце, %','Отклонение доли, п.п.','Прирост выпуска, млрд ₽'],tests.map(t=>[t.label,t.base,fmtNum(t.value)+(t.changed?'':' (без изменения)'),fmtNum(t.alpha*100),fmtNum(t.deltaPP),fmtNum(t.realized)]));
   for(const v of variants){const r=v.rows.at(-1),d=document.createElement('div'),caption=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';caption.textContent=v.label+': '+fmtNum(r.alpha*100)+'%';track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=(r.alpha*100)+'%';track.append(fill);d.append(caption,track);compareChart.append(d)}
   if(typeof chartTools==='function')chartTools(compareChart,'Сравнение инвестиционных стратегий','% целевого прироста',rows.map(r=>r.year),variants.map(v=>({name:v.label,code:v.id,values:v.rows.map(r=>r.alpha*100)})),{periodLabel:'Условный период',territory:'Россия · условные периоды от базы 2021',source:'Росстат, баланс 2021; пользовательские параметры; не прогноз',url:'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'});
   compareDownload.disabled=false;compareDownload.onclick=()=>csv('dynamic-strategies.csv',[['Версия',typeof version!=='undefined'?version:''],['Источник','Баланс 2021; пользовательские допущения'],...DynamicPlan.paramRows(p),['Группа','Годовой прирост спроса, %','Доп. человеко-лет на млрд ₽'],...m.names.map((n,i)=>[n,p.growth[i],p.labor?.intensity[i]??'']),['Стратегия','Период','Доля, %','Реализуемый выпуск, млрд ₽','Инвестиции, млрд ₽','Доля следующего периода, %','Локальный максимум следующего периода, %'],...variants.flatMap(v=>v.rows.map(r=>[v.label,r.year,r.alpha*100,r.realized,r.investment,r.nextAlpha*100,r.nextUpper*100])),['Параметр чувствительности','Исходное значение','Проверяемое значение','Изменён','Доля в конце, %','Отклонение, п.п.','Прирост выпуска, млрд ₽'],...tests.map(t=>[t.label,t.base,t.value,t.changed,t.alpha*100,t.deltaPP,t.realized])]);
   download.disabled=false;download.onclick=()=>csv('dynamic-capacity-scenario.csv',[['Модель','Баланс 2021; условные периоды; млрд руб.'],['Версия',typeof version!=='undefined'?version:''],...DynamicPlan.paramRows(p),['Группа','Годовой прирост спроса, %','Доп. человеко-лет на млрд ₽'],...m.names.map((n,i)=>[n,p.growth[i],p.labor?.intensity[i]??'']),['Период','Группа','Целевой спрос','Реализуемый спрос','Требуемый выпуск','Доступный выпуск','Реализуемый выпуск','Накопленная доп. мощность','Инвестиции','Доп. мощность следующего периода','Доля сценария','Промежуточный импорт всего','Доп. человеко-лет всего'],...rows.flatMap(r=>r.groups.map(g=>[r.year,g.name,g.demand,g.actualDemand,g.required,g.available,g.realized,g.extra,g.invest,g.nextExtra,r.alpha,r.actualImport,r.actualLabor]))]);
  }
  form.addEventListener('input',draw);controls.addEventListener('input',draw);form.addEventListener('submit',e=>e.preventDefault());select.addEventListener('change',showDetail);
  $('dyn-apply').onclick=()=>{const v=$('dyn-uniform');if(v.validity.valid&&Number.isFinite(v.valueAsNumber)){fields.forEach(e=>e.value=v.value);draw()}};
  $('dyn-reset').onclick=()=>{form.reset();calibration=null;calibrationStatus.textContent='';fields.forEach(e=>e.value=3);laborFields.forEach(e=>e.value='');draw()};draw();
 }catch(e){status.textContent='Не удалось загрузить исходный баланс.';console.error(e)}
});
