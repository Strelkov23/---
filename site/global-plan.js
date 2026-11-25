/* Horizon-wide linear optimization of additional domestic final demand.
   Fixed 2021 IO technology; conditional capacity, import and investment bounds.
   Only the stated LP is optimized, not welfare, GDP or a forecast. */
const GlobalPlan=(()=>{
 const sum=a=>a.reduce((s,v)=>s+v,0),finite=Number.isFinite;
 const resource=typeof module!=='undefined'?require('./resource-plan.js'):ResourcePlan;
 const dynamic=typeof module!=='undefined'?require('./dynamic-plan.js'):DynamicPlan;
 function problem(m,p,objective){
  // The existing model validates all input ranges and matrix dimensions.
  dynamic.calculate(m,p);
  if(!['cumulative','terminal'].includes(objective))throw Error('Unknown objective');
  const n=m.names.length,T=p.years,B=p.investment,k=p.capitalRatio,retention=1-p.depreciation/100;
  const spare=m.output.map(v=>v/1000*p.spare/100);
  const periods=Array.from({length:T},(_,t)=>{
   const shock=p.growth.map(g=>(1+g/100)**(t+1)-1);
   const demand=m.demand.map((v,i)=>v*shock[i]/1000),required=m.effects.map(row=>sum(row.map((v,i)=>v*shock[i]/1000))),imports=sum(m.imports.map((v,i)=>v*shock[i]/1000));
   return {demand,required,imports,laborNeed:dynamic.laborNeed(required,p.labor,t+1),laborUpper:dynamic.laborUpper(required,p.labor,t+1),totalDemand:sum(demand)};
  });
  // Variables a_t and u_{s,i}=I_{s,i}/B; final-period investment cannot affect the objective.
  const size=T+(T-1)*n,index=(s,i)=>T+s*n+i;
  const A=[],b=[],labels=[];
  const add=(row,rhs,label)=>{A.push(row);b.push(rhs);labels.push(label)};
  const row=()=>Array(size).fill(0);
  for(let t=0;t<T;t++){
   const r=row();r[t]=1;const imp=periods[t].imports;
   add(r,Math.min(periods[t].laborUpper,imp>0?Math.min(1,p.importLimit/imp):1),'fraction/import/labor:'+t);
   for(let i=0;i<n;i++){
    const R=periods[t].required[i];if(R===0)continue;
    const scale=Math.max(1,R,spare[i],B/k),c=row();c[t]=R/scale;
    for(let s=0;s<t;s++)c[index(s,i)]=-(B/k)/scale*retention**(t-s-1);
    add(c,spare[i]/scale,'capacity:'+t+':'+i);
   }
   if(t<T-1){const c=row();for(let i=0;i<n;i++)c[index(t,i)]=1;add(c,B>0?1:0,'investment:'+t)}
  }
  const weights=periods.map((r,t)=>objective==='terminal'&&t!==T-1?0:r.totalDemand);
  const objectiveScale=Math.max(1,sum(weights));
  const c=[...weights.map(v=>v/objectiveScale),...Array((T-1)*n).fill(0)];
  return {A,b,c,labels,periods,spare,weights,objectiveScale,n,T,B,k,retention,index};
 }
 function solve(m,p,objective='cumulative'){
  const z=problem(m,p,objective),{n,T,B,k,retention,periods,spare,index}=z;
  const lp=resource.solve(z.A,z.b,z.c,{signed:true,fast:true});
  const plan=Array.from({length:T},(_,t)=>t<T-1?m.names.map((_,i)=>Math.max(0,lp.x[index(t,i)]*B)):m.names.map(()=>0));
  let extra=m.names.map(()=>0);
  const rows=[];
  let maxViolation=0;
  for(let t=0;t<T;t++){
   const q=periods[t],available=extra.map((v,i)=>v+spare[i]);
   const cap=q.required.map((v,i)=>v>0?available[i]/v:Infinity);
   const importRatio=q.imports>0?p.importLimit/q.imports:Infinity;
   // For terminal-only objective, earlier feasible output can exceed the LP's arbitrary earlier alpha.
   const alpha=Math.max(0,Math.min(1,importRatio,q.laborUpper,...cap));
   const invested=sum(plan[t]),realized=q.required.map(v=>v*alpha),actualDemand=q.totalDemand*alpha;
   const next=extra.map((v,i)=>retention*v+plan[t][i]/k);
   const groups=m.names.map((name,i)=>({name,required:q.required[i],available:available[i],realized:realized[i],investment:plan[t][i],extra:extra[i],nextExtra:next[i]}));
   const violation=Math.max(0,invested-B,q.imports*alpha-p.importLimit,...groups.map(g=>g.realized-g.available));
   maxViolation=Math.max(maxViolation,violation);
   if(invested>B+1e-7*Math.max(1,B)||q.imports*alpha>p.importLimit+1e-7*Math.max(1,p.importLimit)||groups.some(g=>g.realized>g.available+1e-7*Math.max(1,g.available))||p.labor&&q.laborNeed*alpha>p.labor.cap+1e-7*Math.max(1,p.labor.cap)||!finite(actualDemand))throw Error('Reconstructed plan is infeasible');
   if(q.totalDemand>0&&lp.x[t]>alpha+1e-6)throw Error('LP fraction exceeds reconstructed feasible output');
   rows.push({year:t+1,alpha,demand:q.totalDemand,actualDemand,required:sum(q.required),realized:sum(realized),imports:q.imports*alpha,labor:q.laborNeed===null?null:q.laborNeed*alpha,investment:invested,unusedInvestment:Math.max(0,B-invested),binding:[...(q.imports>0&&alpha<1-1e-8&&Math.abs(importRatio-alpha)<1e-7?['Импорт']:[]),...(q.laborNeed>0&&alpha<1-1e-8&&Math.abs(q.laborUpper-alpha)<1e-7?['Трудовые ресурсы']:[]),...m.names.filter((_,i)=>q.required[i]>0&&alpha<1-1e-8&&Math.abs(cap[i]-alpha)<1e-7)],groups});
   extra=next;
  }
  const score=objective==='terminal'?rows.at(-1).actualDemand:sum(rows.map(r=>r.actualDemand));
  const upper=lp.dualObjective*z.objectiveScale,primal=lp.objective*z.objectiveScale;
  const tolerance=2e-6*Math.max(1,z.objectiveScale);
  if(Math.abs(score-primal)>tolerance||score>upper+tolerance||!finite(score))throw Error('Objective reconstruction check failed');
  const variants=dynamic.compare(m,p).map(v=>{
   const end=v.rows.at(-1),score=objective==='terminal'?end.actualDemand:sum(v.rows.map(r=>r.actualDemand));
   return {id:v.id,label:v.label,score,terminal:end.actualDemand,investment:sum(v.rows.slice(0,-1).map(r=>r.investment)),fractions:v.rows.map(r=>r.alpha)};
  });
  if(variants.some(v=>v.score>score+tolerance))throw Error('Global optimum below feasible reference strategy');
  variants.push({id:'global',label:'Оптимизация всего горизонта',score,terminal:rows.at(-1).actualDemand,investment:sum(rows.map(r=>r.investment)),fractions:rows.map(r=>r.alpha)});
  return {objective,rows,score,upper,primal,dualityGap:lp.gap*z.objectiveScale,normalizedGap:lp.gap,iterations:lp.iterations,variables:z.c.length,constraints:z.b.length,maxViolation,tolerance,variants};
 }
 // Summarize the already verified solution, without changing the LP.
 function investmentSchedule(result){
  const rows=result.rows;
  const names=rows[0]?.groups.map(g=>g.name)||[];
  if(rows.some(r=>r.groups.length!==names.length||r.groups.some((g,i)=>g.name!==names[i]||!finite(g.investment)||g.investment<0)))throw Error('Invalid investment schedule');
  const groups=names.map((name,i)=>({i,name,values:rows.map(r=>r.groups[i].investment),total:sum(rows.map(r=>r.groups[i].investment))})).sort((a,b)=>b.total-a.total||a.i-b.i);
  const total=sum(groups.map(g=>g.total));
  const periods=rows.map((r,j)=>({year:r.year,invested:sum(groups.map(g=>g.values[j])),unused:r.unusedInvestment,alpha:r.alpha,binding:r.binding}));
  return {groups,periods,total,unused:sum(periods.slice(0,-1).map(r=>r.unused)),finalUnused:periods.at(-1)?.unused??0,max:Math.max(0,...groups.flatMap(g=>g.values))};
 }
 const sensitivitySpecs={investment:{label:'Инвестиционный лимит',min:0,max:100000,unit:'млрд руб.'},importLimit:{label:'Импортный лимит',min:0,max:100000,unit:'млрд руб.'},spare:{label:'Исходный резерв мощности',min:0,max:100,unit:'%'},capitalRatio:{label:'Капиталоёмкость',min:.1,max:20,unit:'руб./руб.'},depreciation:{label:'Выбытие мощности',min:0,max:100,unit:'%'},laborCap:{label:'Лимит труда',min:0,max:1e9,unit:'человеко-лет'}};
 function sensitivityCases(p,key,step,mode='relative'){
  const spec=sensitivitySpecs[key],base=key==='laborCap'?p.labor?.cap:p[key];
  if(!spec||!finite(base)||!finite(step)||step<=0||!['relative','absolute'].includes(mode)||mode==='relative'&&step>100)throw Error('Недопустимые параметры чувствительности');
  const change=mode==='relative'?base*step/100:step;
  return [-1,0,1].map(dir=>{
   const requested=base+dir*change,value=Math.max(spec.min,Math.min(spec.max,requested));
   return {dir,value,requested,changed:value!==base,clamped:value!==requested,params:key==='laborCap'?{...p,labor:{...p.labor,cap:value}}:{...p,[key]:value}};
  });
 }
 function sensitivity(m,p,objective,key,step,mode,progress=()=>{}){
  const cases=sensitivityCases(p,key,step,mode),cache=new Map(),rows=[];
  for(const c of cases){
   if(!cache.has(c.value))try{
    const r=solve(m,c.params,objective),last=r.rows.at(-1);
    cache.set(c.value,{score:r.score,terminal:last.actualDemand,alpha:last.alpha,investment:sum(r.rows.map(x=>x.investment)),binding:last.binding,upper:r.upper,gap:r.dualityGap,tolerance:r.tolerance});
   }catch(e){cache.set(c.value,{error:String(e.message||e)})}
   const {params,...meta}=c;rows.push({...meta,...cache.get(c.value)});progress(rows.length,cases.length);
  }
  const base=rows[1];
  return {key,step,mode,objective,rows:rows.map(r=>({...r,delta:finite(r.score)&&finite(base.score)?r.score-base.score:null,deltaPP:finite(r.alpha)&&finite(base.alpha)?100*(r.alpha-base.alpha):null}))};
 }
 function mount(m){
  const $=id=>document.getElementById(id),button=$('global-run'),status=$('global-status'),results=$('global-results'),details=$('global-detail'),comparison=$('global-comparison'),chart=$('global-chart'),metrics=$('global-metrics'),select=$('global-period'),download=$('global-csv'),objective=$('global-objective');
  const timeline=$('global-timeline'),investmentHost=$('global-investment-heat'),investmentStatus=$('global-investment-status'),investmentCsv=$('global-investment-csv'),investmentFocus=$('global-investment-focus');
  const sensKey=$('global-sens-key'),sensMode=$('global-sens-mode'),sensStep=$('global-sens-step'),sensRun=$('global-sens-run'),sensStatus=$('global-sens-status'),sensTable=$('global-sens-table'),sensChart=$('global-sens-chart'),sensCsv=$('global-sens-csv');
  let params=null,worker=null,answer=null,serial=0,sensWorker=null,sensSerial=0;
  function clearSensitivity(){
   sensSerial++;if(sensWorker){sensWorker.terminate();sensWorker=null}sensTable.replaceChildren();sensChart.replaceChildren();sensCsv.disabled=true;sensRun.disabled=!answer;
   sensStatus.textContent=answer?'Выберите параметр и величину изменения.':'Сначала рассчитайте основной оптимальный план.';
  }
  function showSensitivity(r,p){
   const spec=sensitivitySpecs[r.key],base=r.rows[1],signed=v=>finite(v)?(v>0?'+':'')+fmt(v):'—';
   sensStatus.textContent='Проверено вариантов: '+r.rows.filter(x=>!x.error).length+' из '+r.rows.length+' · '+spec.label+' ('+spec.unit+'). '+(base.value===0&&r.mode==='relative'?'Нулевая база: относительное изменение не меняет параметр. Используйте абсолютный шаг.':'Изменяется только выбранный параметр.');
   table(sensTable,['Вариант','Значение параметра','Цель, млрд ₽','Δ цели, млрд ₽','Доля спроса последнего периода, %','Δ доли, п. п.','Инвестиции, млрд ₽','Ограничения последнего периода','Проверка'],r.rows.map(x=>[['Снижение','База','Повышение'][x.dir+1],fmt(x.value),fmt(x.score),signed(x.delta),fmt(finite(x.alpha)?100*x.alpha:null),signed(x.deltaPP),fmt(x.investment),x.binding?.join('; ')||'—',x.error||(!x.changed&&x.dir!==0?'Без изменения':x.clamped?'Ограничено диапазоном; оптимум проверен':'Оптимум проверен')]));
   const max=Math.max(0,...r.rows.filter(x=>finite(x.delta)).map(x=>Math.abs(x.delta)));
   const bars=document.createElement('div');bars.className='stress-signed-bars';
   for(const x of r.rows){const line=document.createElement('div');line.className='stress-signed-row';const name=document.createElement('span'),track=document.createElement('div'),amount=document.createElement('strong'),bar=document.createElement('div');name.textContent=['Снижение','База','Повышение'][x.dir+1]+' · '+fmt(x.value);track.className='stress-signed-track';bar.className='stress-signed-fill';bar.dataset.sign=x.delta<0?'negative':'positive';bar.style.width=(max&&finite(x.delta)?50*Math.abs(x.delta)/max:0)+'%';track.append(bar);amount.textContent=signed(x.delta);line.append(name,track,amount);bars.append(line)}
   sensChart.append(bars);sensCsv.disabled=false;
   sensCsv.onclick=()=>csv('global-plan-sensitivity.csv',[['Цель',r.objective],['Параметр',r.key],['Режим шага',r.mode],['Шаг',r.step],['База','2021, млрд руб.'],...dynamic.paramRows(p),['Группа','Рост спроса, %','Доп. человеко-лет на млрд ₽'],...m.names.map((n,i)=>[n,p.growth[i],p.labor?.intensity[i]??'']),['Вариант','Запрошенное значение','Фактическое значение','Единица','Изменено','Ограничено диапазоном','Цель, млрд руб.','Δ цели, млрд руб.','Доля спроса последнего периода','Δ доли, п.п.','Инвестиции, млрд руб.','Двойственная граница','Разрыв двойственности','Допуск','Ограничения последнего периода','Ошибка','Источник'],...r.rows.map(x=>[x.dir,x.requested,x.value,spec.unit,x.changed,x.clamped,x.score,x.delta,x.alpha,x.deltaPP,x.investment,x.upper,x.gap,x.tolerance,x.binding?.join('; '),x.error,'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'])]);
  }
  sensRun.onclick=()=>{
   if(!answer||!params)return;
   clearSensitivity();let cases;const key=sensKey.value,step=sensStep.valueAsNumber,mode=sensMode.value,goal=objective.value;
   const p={...params,growth:[...params.growth],labor:params.labor?{...params.labor,intensity:[...params.labor.intensity]}:null};
   try{cases=sensitivityCases(p,key,step,mode)}catch(e){sensStatus.textContent=String(e.message||e);return}
   const token=sensSerial;sensRun.disabled=true;sensStatus.textContent='Пересчёт оптимума по альтернативам…';
   try{sensWorker=new Worker('global-plan-worker.js');sensWorker.onmessage=e=>{if(token!==sensSerial)return;if(e.data.progress){sensStatus.textContent='Проверено вариантов: '+e.data.progress.done+' из '+e.data.progress.total;return}sensWorker.terminate();sensWorker=null;sensRun.disabled=false;if(e.data.error){sensStatus.textContent='Расчёт не подтверждён: '+e.data.error;return}showSensitivity(e.data.result,p)};sensWorker.onerror=()=>{if(token!==sensSerial)return;sensWorker.terminate();sensWorker=null;sensRun.disabled=false;sensStatus.textContent='Не удалось выполнить альтернативный расчёт.'};sensWorker.postMessage({m,p,objective:goal,sensitivity:{key,step,mode}})}
   catch(e){sensStatus.textContent='Вычислитель недоступен.';sensRun.disabled=false}
  };
  for(const e of [sensKey,sensMode,sensStep])e.onchange=clearSensitivity;
  const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:4}):'—';
  const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const row of rows){const tr=b.insertRow();row.forEach(v=>tr.insertCell().textContent=String(v))}host.replaceChildren(t)};
  function clear(){serial++;if(worker){worker.terminate();worker=null}answer=null;clearSensitivity();for(const e of [results,details,comparison,chart,metrics,timeline,investmentHost])e.replaceChildren();investmentStatus.textContent='';investmentCsv.disabled=true;investmentFocus.disabled=true;investmentFocus.replaceChildren();select.replaceChildren();select.disabled=true;download.disabled=true;button.disabled=!params;status.textContent=params?'Параметры готовы. Нажмите «Рассчитать оптимум».':'Сначала задайте допустимые параметры многолетней модели.'}
  function setParams(p){params=p?{...p,growth:[...p.growth]}:null;clear()}
  function detail(){if(!answer)return;const r=answer.rows.find(r=>r.year===Number(select.value));if(!r)return;table(details,['Группа продукции','Требуемый прирост','Доступный прирост','Реализуемый прирост','Инвестиции','Мощность следующего периода'],r.groups.map(g=>[g.name,...[g.required,g.available,g.realized,g.investment,g.nextExtra].map(fmt)]))}
  function renderSchedule(){
   investmentHost.replaceChildren();investmentCsv.disabled=true;
   if(!answer)return;
   const d=investmentSchedule(answer),chosen=investmentFocus.value,groups=chosen===''?d.groups:d.groups.filter(g=>String(g.i)===chosen);
   investmentStatus.textContent='Инвестиции до последнего выпуска: '+fmt(d.total)+' млрд ₽ · неиспользованный лимит до последнего выпуска: '+fmt(d.unused)+' млрд ₽. Последний период: инвестиции равны нулю по постановке задачи; его лимит не включён в показатель неиспользованных средств.';
   const t=document.createElement('table'),h=t.createTHead().insertRow(),body=t.createTBody();
   const th=label=>{const e=document.createElement('th');e.scope='col';e.textContent=label;h.append(e)};
   th('Группа');for(const r of d.periods)th('Период '+r.year);th('Всего, млрд ₽');
   for(const g of groups){const tr=body.insertRow(),name=document.createElement('th');name.scope='row';name.textContent=g.name;tr.append(name);
    for(const v of g.values){const cell=tr.insertCell();cell.textContent=fmt(v);cell.dataset.planBand=v===0?'0':String(1+Math.min(4,Math.floor(5*v/d.max)));cell.title='Инвестиции, млрд ₽: '+fmt(v)}
    tr.insertCell().textContent=fmt(g.total);
   }
   for(const [label,values,total] of [['Всего инвестировано',d.periods.map(r=>r.invested),d.total],['Неиспользованный лимит',d.periods.map((r,i)=>i===d.periods.length-1?null:r.unused),d.unused]]){
    const tr=body.insertRow(),name=document.createElement('th');name.scope='row';name.textContent=label;tr.append(name);for(const v of [...values,total])tr.insertCell().textContent=fmt(v);
   }
   investmentHost.append(t);
   investmentCsv.disabled=false;investmentCsv.onclick=()=>csv('global-investment-calendar.csv',[['Период','Группа','Инвестиции, млрд руб.','Всего по группе, млрд руб.','Инвестиции периода, млрд руб.','Неиспользованный лимит до последнего выпуска, млрд руб.','Доля реализуемого спроса','Связывающие ограничения','Цель','База','Источник'],...groups.flatMap(g=>d.periods.map((r,i)=>[r.year,g.name,g.values[i],g.total,r.invested,i===d.periods.length-1?null:r.unused,r.alpha,r.binding.join('; '),answer.objective,'2021','https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx']))]);
  }
  function renderTimeline(r){
   timeline.replaceChildren();
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),w=900,h=320;svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('role','img');svg.setAttribute('aria-label','Доля реализуемого спроса по периодам и стратегиям');
   const add=(tag,attrs,text,parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e};
   const colors=['#327b97','#ad7845','#8568a5','#006c69'],X=i=>70+775*i/Math.max(1,r.rows.length-1),Y=v=>245-200*v;
   add('rect',{width:w,height:h,fill:'#fff'});add('text',{x:15,y:24,'font-size':16,'font-weight':'bold',fill:'#173e52'},'Реализуемая доля дополнительного спроса, %');
   for(const v of [0,.25,.5,.75,1]){add('line',{x1:70,x2:845,y1:Y(v),y2:Y(v),stroke:'#d5e0e2'});add('text',{x:60,y:Y(v)+4,'text-anchor':'end','font-size':12,fill:'#405960'},100*v+'%')}
   for(const [i,row] of r.rows.entries())add('text',{x:X(i),y:267,'text-anchor':'middle','font-size':11,fill:'#405960'},row.year);
   for(const [j,v] of r.variants.entries()){
    const color=colors[j%colors.length];add('polyline',{points:v.fractions.map((a,i)=>X(i)+','+Y(a)).join(' '),fill:'none',stroke:color,'stroke-width':v.id==='global'?3:2,'stroke-dasharray':v.id==='global'?'none':'6 3'});
    for(const [i,a] of v.fractions.entries()){const point=add('circle',{cx:X(i),cy:Y(a),r:3,fill:color});add('title',{},v.label+' · период '+r.rows[i].year+' · '+fmt(a*100)+'%',point)}
   }
   add('text',{x:70,y:290,'font-size':12,fill:'#405960'},'Условные периоды, не календарные годы.');
   timeline.append(svg);const legend=document.createElement('div');legend.className='global-timeline-legend';
   for(const [j,v] of r.variants.entries()){const item=document.createElement('span'),key=document.createElement('b');key.style.background=colors[j%colors.length];item.append(key,document.createTextNode(v.label));legend.append(item)}
   timeline.append(legend);
  }
  function show(r,p){
   answer=r;button.disabled=false;select.disabled=false;download.disabled=false;
   sensKey.replaceChildren(...Object.entries(sensitivitySpecs).filter(([key])=>key!=='laborCap'||p.labor).map(([key,spec])=>new Option(spec.label+' · '+spec.unit,key)));clearSensitivity();
   status.textContent='Оптимум проверен: '+r.variables+' переменных, '+r.constraints+' ограничений; '+r.iterations+' итераций. Условные расчёты, не прогноз.';
   for(const [label,value] of [['Значение цели, млрд ₽',fmt(r.score)],['Двойственная верхняя граница, млрд ₽',fmt(r.upper)],['Абсолютный разрыв двойственности, млрд ₽',fmt(r.dualityGap)],['Допуск проверки цели, млрд ₽',fmt(r.tolerance)]]){const d=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');d.className='metric';b.textContent=value;s.textContent=label;d.append(b,s);metrics.append(d)}
   table(results,['Период','Доля спроса, %','Реализуемый конечный спрос, млрд ₽','Прирост валового выпуска, млрд ₽','Импорт, млрд ₽','Доп. человеко-лет','Инвестиции, млрд ₽','Неисп. лимит, млрд ₽','Связывающие ограничения'],r.rows.map(x=>[x.year,...[100*x.alpha,x.actualDemand,x.realized,x.imports,x.labor,x.investment,x.unusedInvestment].map(fmt),x.binding.join('; ')||'—']));
   table(comparison,['Стратегия','Значение выбранной цели, млрд ₽','Спрос в последнем периоде, млрд ₽','Инвестиции до последнего выпуска, млрд ₽'],r.variants.map(v=>[v.label,...[v.score,v.terminal,v.investment].map(fmt)]));
   select.replaceChildren(...r.rows.map(x=>new Option('Период '+x.year,String(x.year))));select.value=String(r.rows.at(-1).year);detail();
   investmentFocus.replaceChildren(new Option('Все группы',''),...m.names.map((n,i)=>new Option(n,String(i))));investmentFocus.disabled=false;renderSchedule();renderTimeline(r);
   for(const v of r.variants){const d=document.createElement('div'),text=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';text.textContent=v.label+': '+fmt(v.score)+' млрд ₽';track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=(r.score>0?Math.min(100,v.score/r.score*100):0)+'%';track.append(fill);d.append(text,track);chart.append(d)}
   if(typeof chartTools==='function')chartTools(chart,'Доля реализуемого спроса по стратегиям','%',r.rows.map(x=>x.year),r.variants.map(v=>({name:v.label,code:v.id,values:v.fractions.map(a=>a*100)})),{periodLabel:'Условный период',territory:'Россия · условные периоды от базы 2021',source:'Росстат, баланс 2021; условные параметры, не прогноз',url:'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'});
   download.onclick=()=>csv('global-investment-plan.csv',[['Модель','Условный баланс 2021, млрд руб.'],['Цель',r.objective],['Версия',typeof version!=='undefined'?version:''],...dynamic.paramRows(p),['Группа','Рост спроса, %','Доп. человеко-лет на млрд ₽'],...m.names.map((n,i)=>[n,p.growth[i],p.labor?.intensity[i]??'']),['Значение цели',r.score],['Двойственная граница',r.upper],['Разрыв двойственности',r.dualityGap],['Допуск цели',r.tolerance],['Макс. нарушение денежных ограничений, млрд руб.',r.maxViolation],['Период','Доля спроса','Импорт, млрд руб.','Доп. человеко-лет','Инвестиции, млрд руб.'],...r.rows.map(x=>[x.year,x.alpha,x.imports,x.labor,x.investment]),['Период','Группа','Требуемый прирост','Доступный прирост','Реализуемый прирост','Инвестиции','Доп. мощность','Мощность следующего периода'],...r.rows.flatMap(x=>x.groups.map(g=>[x.year,g.name,g.required,g.available,g.realized,g.investment,g.extra,g.nextExtra])),['Стратегия','Цель','Спрос в последнем периоде','Инвестиции до последнего выпуска'],...r.variants.map(v=>[v.label,v.score,v.terminal,v.investment])]);
  }
  button.addEventListener('click',()=>{
   if(!params)return;clear();const token=serial,p={...params,growth:[...params.growth]},goal=objective.value;button.disabled=true;status.textContent='Решение линейной задачи…';
   try{worker=new Worker('global-plan-worker.js');worker.onmessage=e=>{if(token!==serial)return;worker.terminate();worker=null;if(e.data.error){status.textContent='Оптимум не подтверждён: '+e.data.error;button.disabled=false;return}show(e.data.result,p)};worker.onerror=()=>{if(token!==serial)return;worker.terminate();worker=null;status.textContent='Не удалось выполнить расчёт. Проверьте доступность скрипта и параметры.';button.disabled=false};worker.postMessage({m,p,objective:goal})}
   catch(e){status.textContent='В этом браузере не удалось запустить фоновый вычислитель.';button.disabled=false}
  });
  objective.addEventListener('change',clear);select.addEventListener('change',detail);investmentFocus.addEventListener('change',renderSchedule);clear();return {setParams};
 }
 return {problem,solve,mount,investmentSchedule,sensitivityCases,sensitivity};
})();
if(typeof module!=='undefined')module.exports=GlobalPlan;
