/* Conditional investment and labor requirements, not a forecast or a capital-stock estimate. */
const ReproductionPlan=(()=>{
 const codes={gdp:'NY.GDP.MKTP.KD',labor:'SL.TLF.TOTL.IN',unemployment:'SL.UEM.TOTL.ZS',investment:'NE.GDI.FTOT.ZS'};
 function baselines(data){
  const rows=[];
  for(const [y,gdp] of Object.entries(data[codes.gdp]?.values||{})){
   const labor=data[codes.labor]?.values?.[y],u=data[codes.unemployment]?.values?.[y];
   if(Number.isFinite(gdp)&&gdp>0&&Number.isFinite(labor)&&labor>0&&Number.isFinite(u)&&u>=0&&u<100)rows.push({year:Number(y),gdp,labor,u,employment:labor*(1-u/100),investment:data[codes.investment]?.values?.[y]??null});
  }
  return rows.sort((a,b)=>a.year-b.year);
 }
 function calculate(base,p){
  const checks={years:[1,15],growth:[-10,20],productivity:[-10,20],laborGrowth:[-10,10],capitalRatio:[.1,10],depreciation:[0,30],budget:[0,100]};
  if(!Number.isFinite(base.gdp)||base.gdp<=0||!Number.isFinite(base.employment)||base.employment<=0||Object.entries(checks).some(([k,[lo,hi]])=>!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)||!Number.isInteger(p.years))throw Error('Invalid planning parameters');
  let y=base.gdp,k=y*p.capitalRatio,prod=y/base.employment,available=base.employment;const rows=[];
  for(let i=1;i<=p.years;i++){
   const priorY=y,priorK=k;
   y*=1+p.growth/100;prod*=1+p.productivity/100;available*=1+p.laborGrowth/100;k=y*p.capitalRatio;
   const replacement=priorK*p.depreciation/100,net=k-priorK,gross=net+replacement,required=Math.max(0,gross),budget=priorY*p.budget/100,need=y/prod;
   rows.push({year:base.year+i,gdp:y,capital:k,replacement,net,gross,required,budget,gap:Math.max(0,required-budget),surplusRetained:Math.max(0,-gross),productivity:prod,employmentNeed:need,employmentAvailable:available,laborGap:Math.max(0,need-available)});
  }
  return rows;
 }
 return {codes,baselines,calculate};
})();
if(typeof module!=='undefined')module.exports=ReproductionPlan;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('repro-form');if(!form)return;
 const status=$('repro-status'),result=$('repro-table'),metrics=$('repro-metrics'),source=$('repro-source'),download=$('repro-download'),chart=$('repro-chart');
 const keys=['years','growth','productivity','laborGrowth','capitalRatio','depreciation','budget'],ids=['repro-base',...keys.map(k=>'repro-'+k)],f=v=>Number.isFinite(v)?fmt(v):'—',bn=v=>f(v/1e9),million=v=>f(v/1e6);
 try{
  const data=await load('compare.json'),bases=ReproductionPlan.baselines(data);
  if(!bases.length)throw Error('No compatible base year');
  const selector=$('repro-base');for(const b of [...bases].reverse())selector.add(new Option(String(b.year),String(b.year)));
  restore(ids);
  function draw(){
   result.replaceChildren();metrics.replaceChildren();source.replaceChildren();chart.replaceChildren();download.disabled=true;
   const base=bases.find(b=>b.year===Number(selector.value)),p=Object.fromEntries(keys.map(k=>[k,$('repro-'+k).valueAsNumber]));
   if(!base||keys.some(k=>!$('repro-'+k).validity.valid||!Number.isFinite(p[k]))){status.textContent='Проверьте параметры сценария.';return}
   const rows=ReproductionPlan.calculate(base,p),last=rows.at(-1),total=key=>rows.reduce((a,r)=>a+r[key],0);
   status.textContent='Условный сценарий: '+base.year+'–'+last.year+' · постоянные доллары 2015 года, не текущие рубли и не прогноз.';
   source.append(node('p','База '+base.year+': реальный ВВП '+bn(base.gdp)+' млрд долл.; рабочая сила '+million(base.labor)+' млн; безработица '+f(base.u)+'%; расчётная занятость '+million(base.employment)+' млн. Доля валового накопления основного капитала в номинальном ВВП: '+(Number.isFinite(base.investment)?f(base.investment)+'%':'нет данных')+' — справочно, не используется как реальная норма инвестирования.'));
   for(const [label,k] of [['Реальный ВВП',ReproductionPlan.codes.gdp],['Рабочая сила',ReproductionPlan.codes.labor],['Безработица',ReproductionPlan.codes.unemployment],['Норма накопления (справочно)',ReproductionPlan.codes.investment]]){const a=node('a',label);a.href='indicator-'+k+'.html';source.append(a,document.createTextNode(' · '))}
   for(const [label,val] of [['Целевой ВВП в последнем году',bn(last.gdp)+' млрд долл.'],['Суммарная требуемая инвестиция',bn(total('required'))+' млрд долл.'],['Сумма инвестиционных разрывов',bn(total('gap'))+' млрд долл.'],['Разрыв занятости последнего года',million(last.laborGap)+' млн чел.']]){const el=node('div','');el.className='metric';el.append(node('b',val),node('span',label));metrics.append(el)}
   const headers=['Год','Целевой ВВП, млрд','Условный капитал, млрд','Замещение износа, млрд','Чистое накопление, млрд','Валовая потребность, млрд','Бюджет инвестиций, млрд','Разрыв инвестиций, млрд','Избыточный капитал при нулевых инвестициях, млрд','Требуется занятых, млн','Доступно занятых, млн','Разрыв, млн'];
   const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=body.insertRow();for(const v of [r.year,bn(r.gdp),bn(r.capital),bn(r.replacement),bn(r.net),bn(r.required),bn(r.budget),bn(r.gap),bn(r.surplusRetained),million(r.employmentNeed),million(r.employmentAvailable),million(r.laborGap)])tr.insertCell().textContent=v}result.append(table);
   const years=rows.map(r=>r.year),series=[{name:'Необходимые валовые инвестиции',code:'required',values:rows.map(r=>r.required/1e9)},{name:'Условный бюджет инвестиций',code:'budget',values:rows.map(r=>r.budget/1e9)}],ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 245');svg.setAttribute('role','img');svg.setAttribute('aria-label','Инвестиционные потребности и бюджет');
   const shape=(tag,attrs,t)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.append(e);return e};
   const max=Math.max(1,...series.flatMap(s=>s.values)),x=i=>years.length===1?420:120+590*i/(years.length-1),y=v=>195-160*v/max;
   for(let i=0;i<=4;i++){const v=max*i/4;shape('line',{x1:120,x2:710,y1:y(v),y2:y(v),stroke:'#d4dcdf'});shape('text',{x:112,y:y(v)+4,'font-size':11,'text-anchor':'end'},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
   chartTickIndices(years.length,6).forEach(i=>shape('text',{x:x(i),y:221,'font-size':11,'text-anchor':years.length===1?'middle':i===0?'start':i===years.length-1?'end':'middle'},years[i]));
   const legend=node('div','');legend.className='legend';
   series.forEach((s,j)=>{const color=j?'#a24724':'#006c69',l=node('span',(j?'— — ':'━━ ')+s.name);l.style.color=color;legend.append(l);shape('path',{d:s.values.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v)).join(' '),fill:'none',stroke:color,'stroke-width':2.5,'stroke-dasharray':j?'7 4':'none'});s.values.forEach((v,i)=>shape('circle',{cx:x(i),cy:y(v),r:3,fill:color}))});
   chart.append(node('h3','Потребность и условный бюджет'),legend,svg);chartTools(chart,'Сценарий воспроизводства капитала','млрд долл. в ценах 2015 года',years,series,{source:'Расчёт по WDI и пользовательским допущениям',url:'https://data.worldbank.org/indicator/'+ReproductionPlan.codes.gdp+'?locations=RU'});
   download.disabled=false;download.onclick=()=>csv('capital-labor-scenario.csv',[['Базовый год',base.year],['ВВП базы, постоянные долл. 2015',base.gdp],['Занятость базы, расчётная',base.employment],['Источники WDI',Object.values(ReproductionPlan.codes).join(' / ')],['Версия',version||''],...Object.entries(p),['Год','Целевой ВВП','Условный капитал','Замещение','Чистое накопление','Валовая потребность до ограничения нулём','Требуемые валовые инвестиции','Бюджет','Разрыв инвестиций','Избыточный капитал','Производительность','Требуется занятых','Доступно занятых','Разрыв занятости'],...rows.map(r=>[r.year,r.gdp,r.capital,r.replacement,r.net,r.gross,r.required,r.budget,r.gap,r.surplusRetained,r.productivity,r.employmentNeed,r.employmentAvailable,r.laborGap])]);save(ids);
  }
  form.oninput=draw;form.onsubmit=e=>e.preventDefault();form.onreset=()=>setTimeout(draw,0);draw()
 }catch(e){console.error(e);status.textContent='Совместные исходные данные недоступны в этой версии.'}
});
