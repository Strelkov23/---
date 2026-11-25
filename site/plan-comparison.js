/* Compare saved target trajectories, not causal counterfactual outcomes. */
const PlanComparison=(()=>{
 const R=typeof module!=='undefined'?require('./plan-register.js'):PlanRegister;
 const finite=Number.isFinite,sum=a=>a.reduce((s,v)=>s+v,0);
 function compare(a,b,groups){
  R.validate(a);R.validate(b);
  if(a.id===b.id||R.identity(a.series)!==R.identity(b.series)||a.direction!==b.direction)throw Error('Нужны разные версии одного сопоставимого ряда и направления цели');
  const av=R.compare(a,groups),bv=R.compare(b,groups),by=new Map(bv.rows.map(x=>[x.year,x])),rows=av.rows.filter(x=>by.has(x.year)).map(x=>{
   const y=by.get(x.year);if(x.fact!==y.fact)throw Error('Несовпадение фактов');const fact=x.fact;
   const adverse=t=>!finite(fact)?null:a.direction==='higher'?Math.max(0,t-fact):a.direction==='lower'?Math.max(0,fact-t):Math.abs(fact-t);
   const aa=adverse(x.value),bb=adverse(y.value),delta=y.value-x.value;
   return {year:x.year,a:x.value,b:y.value,fact,delta,adverseA:aa,adverseB:bb,metA:finite(fact)?x.status==='Цель достигнута':null,metB:finite(fact)?y.status==='Цель достигнута':null,stricter:a.direction==='exact'?'not-ordered':delta===0?'equal':(a.direction==='higher'?delta>0:delta<0)?'B':'A'};
  });
  if(!rows.length)throw Error('Нет общих лет траекторий');
  const known=rows.filter(x=>finite(x.fact)),mean=key=>known.length?sum(known.map(x=>x[key]))/known.length:null;
  const summary={years:rows.length,known:known.length,missing:rows.length-known.length,metA:known.filter(x=>x.metA).length,metB:known.filter(x=>x.metB).length,meanA:mean('adverseA'),meanB:mean('adverseB'),worstA:known.length?Math.max(...known.map(x=>x.adverseA)):null,worstB:known.length?Math.max(...known.map(x=>x.adverseB)):null,stricterA:rows.filter(x=>x.stricter==='A').length,stricterB:rows.filter(x=>x.stricter==='B').length};
  return {rows,summary,sameBase:a.base.year===b.base.year&&a.base.value===b.base.value&&a.base.sha256===b.base.sha256,compatible:av.compatible&&bv.compatible,baselineRevisionA:av.baselineRevision,baselineRevisionB:bv.baselineRevision};
 }
 return {compare};
})();
if(typeof module!=='undefined')module.exports=PlanComparison;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('pc-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:9}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 function chart(rows,a,b){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 260');svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label','Траектории А и Б и опубликованный факт; значения в таблице');
  const values=rows.flatMap(r=>[r.a,r.b,r.fact].filter(Number.isFinite));let min=Math.min(...values),max=Math.max(...values);if(min===max){const pad=Math.max(1,Math.abs(min)*.05);min-=pad;max+=pad}const range=max-min;
  const x=i=>rows.length===1?390:110+580*i/(rows.length-1),y=v=>200-160*(v-min)/range;
  const shape=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;svg.append(n);return n};
  for(let i=0;i<5;i++){const v=min+range*i/4;shape('line',{x1:110,x2:690,y1:y(v),y2:y(v),stroke:'#d5e0df'});shape('text',{x:102,y:y(v)+4,'text-anchor':'end','font-size':11,fill:'currentColor'},fmt(v))}
  for(const [key,color,dash,name] of [['a','#006c69','none','План А'],['b','#a24724','9 5','План Б'],['fact','#365e95','3 4','Факт']]){
   let d='';rows.forEach((r,i)=>{if(!Number.isFinite(r[key]))return;d+=(i&&Number.isFinite(rows[i-1][key])&&rows[i-1].year===r.year-1?'L':'M')+x(i)+' '+y(r[key])+' ';const dot=shape('circle',{cx:x(i),cy:y(r[key]),r:3,fill:color});const tip=document.createElementNS(ns,'title');tip.textContent=name+' · '+r.year+': '+fmt(r[key])+' '+a.series.unit;dot.append(tip)});
   shape('path',{d,fill:'none',stroke:color,'stroke-width':2.4,'stroke-dasharray':dash});
  }
  rows.forEach((r,i)=>{if(i===0||i===rows.length-1||i%Math.ceil(rows.length/5)===0)shape('text',{x:x(i),y:225,'text-anchor':'middle','font-size':12,fill:'currentColor'},r.year)});
  const host=$('pc-chart');host.replaceChildren(node('h3',a.series.title+' · '+a.series.unit),svg,node('p','Сплошная зелёная — А; штриховая коричневая — Б; пунктирная синяя — опубликованный факт. Разрывы не интерполируются.'));
  if(typeof chartTools==='function')chartTools(host,a.series.title+' — альтернативные цели',a.series.unit,rows.map(r=>r.year),[{name:'План А: '+a.name,code:'plan-A',values:rows.map(r=>r.a)},{name:'План Б: '+b.name,code:'plan-B',values:rows.map(r=>r.b)},{name:'Опубликованный факт',code:a.series.series,values:rows.map(r=>r.fact)}],{source:'Локальные версии '+a.id+' / '+b.id+'; факты WDI',url:a.series.source});
 }
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'normalized-observations.json',root),groups=PlanRegister.facts(entry.data),first=$('pc-a'),second=$('pc-b'),exp=$('pc-export');
  let plans=[];try{plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem('economic-plan-register-v1')||'[]'))}catch(e){throw Error('Локальный реестр повреждён')}
  const label=p=>p.name+' · '+p.series.title+' · '+p.id.slice(0,8);
  first.replaceChildren(...plans.map(p=>new Option(label(p),p.id)));
  function updateB(){
   const a=plans.find(p=>p.id===first.value);
   second.replaceChildren(...plans.filter(p=>a&&p.id!==a.id&&PlanRegister.identity(p.series)===PlanRegister.identity(a.series)&&p.direction===a.direction).map(p=>new Option(label(p),p.id)));draw();
  }
  function draw(){
   exp.disabled=true;['pc-summary','pc-results','pc-chart'].forEach(id=>$(id).replaceChildren());$('pc-note').textContent='';
   const a=plans.find(p=>p.id===first.value),b=plans.find(p=>p.id===second.value);
   if(!a||!b){status.textContent='Создайте две сопоставимые версии в реестре целей.';return}
   try{const r=PlanComparison.compare(a,b,groups),s=r.summary;
    status.textContent='Общие годы: '+s.years+' · общий факт: '+s.known+' · без факта: '+s.missing+' · единица: '+a.series.unit+'.';
    $('pc-note').textContent=(r.sameBase?'Одинаковая зафиксированная база.':'Различаются год, значение или отпечаток базы: сравнение уровней целей возможно, но различие нельзя приписывать только выбору политики.')+' '+(r.compatible?'Текущий ключ ряда совместим.':'Текущий ряд несовместим; факты не оцениваются.')+' А: '+a.base.year+' / '+fmt(a.base.value)+'; Б: '+b.base.year+' / '+fmt(b.base.value)+'. Пересмотр баз: '+fmt(r.baselineRevisionA)+' / '+fmt(r.baselineRevisionB)+'.';
    table($('pc-summary'),['Критерий','А','Б'],[['Достигнуто общих лет с фактом',s.known?s.metA:'—',s.known?s.metB:'—'],['Среднее неблагоприятное отклонение',fmt(s.meanA),fmt(s.meanB)],['Наибольшее неблагоприятное отклонение',fmt(s.worstA),fmt(s.worstB)],['Лет с более строгой целью',a.direction==='exact'?'—':s.stricterA,a.direction==='exact'?'—':s.stricterB]]);
    table($('pc-results'),['Год','План А','План Б','Б − А','Общий факт','Неблагоприятное А','Неблагоприятное Б','Достигнуто А','Достигнуто Б'],r.rows.map(x=>[x.year,fmt(x.a),fmt(x.b),fmt(x.delta),fmt(x.fact),fmt(x.adverseA),fmt(x.adverseB),x.metA===null?'—':x.metA?'Да':'Нет',x.metB===null?'—':x.metB?'Да':'Нет']));chart(r.rows,a,b);
    exp.disabled=false;exp.onclick=()=>csv('plan-comparison.csv',[['Версия А','Версия Б','Код','Единица','Направление','Год','Цель А','Цель Б','Б − А','Факт','Неблагоприятное А','Неблагоприятное Б','Достигнуто А','Достигнуто Б','База А год','База А значение','База Б год','База Б значение','SHA-256 базы А','SHA-256 базы Б','SHA-256 факта','Манифест факта','Источник'],...r.rows.map(x=>[a.id,b.id,a.series.series,a.series.unit,a.direction,x.year,x.a,x.b,x.delta,x.fact,x.adverseA,x.adverseB,x.metA,x.metB,a.base.year,a.base.value,b.base.year,b.base.value,a.base.sha256,b.base.sha256,entry.sha256,manifest.data_fingerprint,a.series.source])]);
   }catch(e){status.textContent='Сравнение отклонено: '+String(e.message||e)}
  }
  first.onchange=updateB;second.onchange=draw;updateB();
 }catch(e){console.error(e);status.textContent='Сравнение недоступно: '+String(e.message||e)}
});