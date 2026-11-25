const GroupPassports=(()=>{
 function change(a,b,unit){if(!Number.isFinite(a)||!Number.isFinite(b))return null;return unit==='%'?b-a:a>0?(b-a)/a*100:null}
 function filterGroups(d,sector="",query=""){
  const q=String(query).trim().toLocaleLowerCase("ru");
  return d.groups.filter(g=>(!sector||g.sector===sector)&&(!q||[g.name,g.sector,g.role].some(v=>String(v||"").toLocaleLowerCase("ru").includes(q))));
 }
 function revenueComparison(d,year,sector=""){
  const rows=filterGroups(d,sector).map(g=>{
   const m=g.metrics.find(x=>x.id==='revenue'&&x.comparable==='annual_consolidated_revenue_rub'&&['млн руб.','млрд руб.'].includes(x.unit)),r=m?.observations.find(x=>x.year===year);
   if(!r||g.scope!=='consolidated'||g.standard!=='IFRS')return {id:g.id,name:g.name,sector:g.sector,source:g.source,value:null,original:null,unit:null};
   const value=Number(r.value)*(m.unit==='млрд руб.'?1000:1);
   if(!Number.isFinite(value)||value<0)throw Error('Некорректная выручка');
   return {id:g.id,name:g.name,sector:g.sector,source:g.source,value,original:r.value,unit:m.unit};
  }).sort((a,b)=>a.value===null?b.value===null?a.id.localeCompare(b.id):1:b.value===null?-1:b.value-a.value||a.id.localeCompare(b.id));
  const eligible=rows.filter(r=>r.value!==null).length;
  return {eligible,rows:rows.map(r=>({...r,rank:r.value===null?null:1+rows.filter(x=>x.value!==null&&x.value>r.value).length}))};
 }
 function signedBars(values){
  if(values.some(v=>!Number.isFinite(v)))throw Error('Некорректный ряд');
  const signed=values.some(v=>v<0),max=Math.max(0,...values.map(Math.abs)),scale=signed?50:100;
  return {signed,zero:signed?50:0,bars:values.map(v=>{const width=max?Math.abs(v)/max*scale:0;return {left:v<0?50-width:signed?50:0,width,negative:v<0}})};
 }
 return {change,revenueComparison,signedBars,filterGroups};
})();
if(typeof module!=='undefined')module.exports=GroupPassports;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('group-passports');if(!host)return;
 const status=$('group-status'),pick=$('group-pick'),metric=$('group-metric'),table=$('group-table'),chart=$('group-chart'),detail=$('group-detail'),exp=$('group-export');
 const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('ru',{maximumFractionDigits:2}):'—';
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(m,'group-passports.json',root),d=entry.data;
  status.textContent='Документальный снимок · проверка '+d.checked+' · '+d.groups.length+' групп. Не автоматическое обновление и не общероссийский рейтинг.';
  const sector=$('group-sector'),query=$('group-query'),sectorCompare=$('group-compare-sector');
  const sectors=[...new Set(d.groups.map(g=>g.sector))].sort((a,b)=>a.localeCompare(b,'ru'));
  for(const el of [sector,sectorCompare])el.replaceChildren(new Option('Все отрасли',''),...sectors.map(s=>new Option(s,s)));
  pick.replaceChildren(...d.groups.map(g=>new Option(g.name,g.id)));
  const params=new URLSearchParams(location.search);if(d.groups.some(g=>g.id===params.get('group')))pick.value=params.get('group');
  function drawChart(g){
   chart.replaceChildren();const p=g.metrics.find(x=>x.id===metric.value);if(!p)return;
   chart.append(node('h3',p.label+' · '+p.unit));
   const model=GroupPassports.signedBars(p.observations.map(r=>Number(r.value))),bars=node('div','');bars.className='rm-composition';
   if(model.signed)chart.append(node('p','Нулевая отметка в центре: убытки и отрицательные величины слева, положительные справа.'));
   for(const [i,r] of p.observations.entries()){const b=model.bars[i],line=node('div','');line.className='rm-composition-row';const track=node('div','');track.className='group-signed-track';const fill=node('div','');fill.className='group-signed-fill'+(b.negative?' negative':'');fill.style.left=b.left+'%';fill.style.width=b.width+'%';const zero=node('span','');zero.className='group-signed-zero';zero.style.left=model.zero+'%';track.append(fill,zero);line.append(node('span',String(r.year)),track,node('strong',fmt(r.value)));bars.append(line)}chart.append(bars);
  }
  function draw(){
   const g=d.groups.find(x=>x.id===pick.value);if(!g)return;
   detail.replaceChildren(node('h3',g.name+' · '+g.sector),node('p',g.role),node('p','Периметр: консолидированная группа. Стандарт: МСФО. Определения показателей — по эмитенту.'));
   const source=node('a',(g.source_kind==='republished_issuer_release'?'Перепубликация пресс-релиза · ':'Документ эмитента · ')+g.section);source.href=g.source;detail.append(source);if(g.note)detail.append(node('p',g.note));
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Показатель','Единица','Год','Значение','Изменение к предыдущему году']){const th=node('th',v);th.scope='col';h.append(th)}
   for(const p of g.metrics)p.observations.forEach((r,i)=>{const prev=p.observations[i-1],delta=prev&&prev.year===r.year-1?GroupPassports.change(Number(prev.value),Number(r.value),p.unit):null;const tr=b.insertRow();for(const v of [p.label,p.unit,r.year,fmt(r.value),delta==null?'—':fmt(delta)+(p.unit==='%'?' п.п.':'%')])tr.insertCell().textContent=v});
   table.replaceChildren(t);metric.replaceChildren(...g.metrics.map(x=>new Option(x.label,x.id)));metric.onchange=()=>drawChart(g);drawChart(g);
   exp.disabled=false;exp.onclick=()=>csv('group-'+g.id+'.csv',[['Группа','Отрасль','Периметр','Стандарт','Код','Показатель','Единица','Год','Значение','Источник','Раздел','Проверено','Тип источника','Примечание','SHA-256 JSON','Отпечаток манифеста'],...g.metrics.flatMap(p=>p.observations.map(r=>[g.name,g.sector,g.scope,g.standard,p.id,p.label,p.unit,r.year,r.value,g.source,g.section,d.checked,g.source_kind||'documentary',g.note||'',entry.sha256,m.data_fingerprint]))]);
  }
  function filter(){
   const old=pick.value,visible=GroupPassports.filterGroups(d,sector.value,query.value);
   pick.replaceChildren(...visible.map(g=>new Option(g.name,g.id)));if(visible.some(g=>g.id===old))pick.value=old;
   status.textContent='Найдено '+visible.length+' из '+d.groups.length+' групп · документальный снимок '+d.checked+'.';
   pick.disabled=!visible.length;metric.disabled=!visible.length;
   if(!visible.length){detail.replaceChildren(node('p','Нет групп по выбранным условиям.'));table.replaceChildren();chart.replaceChildren();exp.disabled=true;return}
   draw();
  }
  sector.onchange=query.oninput=filter;pick.onchange=draw;draw();
  const year=$('group-compare-year'),comparison=$('group-compare-table'),cs=$('group-compare-status'),ce=$('group-compare-export');
  if(year&&comparison){
   const years=[...new Set(d.groups.flatMap(g=>g.metrics.filter(x=>x.comparable==='annual_consolidated_revenue_rub').flatMap(x=>x.observations.map(r=>r.year))))].sort((a,b)=>b-a);
   year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
   function compare(){
    const y=Number(year.value),r=GroupPassports.revenueComparison(d,y,sectorCompare.value);
    cs.textContent='Сопоставимая выручка: '+r.eligible+' из '+r.rows.length+' групп выбранной отраслевой выборки. Не рейтинг всех компаний России; география выручки и состав групп различаются.';
    const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
    for(const label of ['Место в выборке','Группа','Отрасль','Выручка, млн руб.','Исходное значение','Источник']){const th=node('th',label);th.scope='col';h.append(th)}
    for(const x of r.rows){const tr=b.insertRow();for(const v of [x.rank??'—',x.name,x.sector,x.value===null?'Нет сопоставимого значения':fmt(x.value),x.original===null?'—':x.original+' '+x.unit])tr.insertCell().textContent=v;const a=node('a','Отчёт');a.href=x.source;tr.insertCell().append(a)}
    comparison.replaceChildren(t);ce.disabled=!r.eligible;ce.onclick=()=>csv('group-revenue-'+y+'.csv',[['Год','Группа','Отрасль','Место в выборке','Охват','Выручка, млн руб.','Исходное значение','Единица','Источник','Отпечаток манифеста'],...r.rows.map(x=>[y,x.name,x.sector,x.rank,r.eligible,x.value,x.original,x.unit,x.source,m.data_fingerprint])]);
   }
   year.onchange=sectorCompare.onchange=compare;compare();
  }
 }catch(e){status.textContent='Паспорта недоступны: '+String(e.message||e)}
});
