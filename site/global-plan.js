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
 function mount(m){
  const $=id=>document.getElementById(id),button=$('global-run'),status=$('global-status'),results=$('global-results'),details=$('global-detail'),comparison=$('global-comparison'),chart=$('global-chart'),metrics=$('global-metrics'),select=$('global-period'),download=$('global-csv'),objective=$('global-objective');
  const timeline=$('global-timeline'),investmentHost=$('global-investment-heat'),investmentStatus=$('global-investment-status'),investmentCsv=$('global-investment-csv'),investmentFocus=$('global-investment-focus');
  let params=null,worker=null,answer=null,serial=0;
  const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:4}):'—';
  const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const row of rows){const tr=b.insertRow();row.forEach(v=>tr.insertCell().textContent=String(v))}host.replaceChildren(t)};
  function clear(){serial++;if(worker){worker.terminate();worker=null}answer=null;for(const e of [results,details,comparison,chart,metrics,timeline,investmentHost])e.replaceChildren();investmentStatus.textContent='';investmentCsv.disabled=true;investmentFocus.disabled=true;investmentFocus.replaceChildren();select.replaceChildren();select.disabled=true;download.disabled=true;button.disabled=!params;status.textContent=params?'Параметры готовы. Нажмите «Рассчитать оптимум».':'Сначала задайте допустимые параметры многолетней модели.'}
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
 return {problem,solve,mount,investmentSchedule};
})();
if(typeof module!=='undefined')module.exports=GlobalPlan;
