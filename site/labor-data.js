/* Decomposition of a constructed WDI three-sector employment-weighted index. */
const LaborDiagnostics=(()=>{
 const sectors=['agriculture','industry','services'],finite=Number.isFinite;
 function snapshot(rows,year){
  const items=sectors.map(sector=>{const matches=rows.filter(r=>r.sector===sector&&r.year===year);return matches.length===1?matches[0]:null});
  const sum=items.every(r=>r&&finite(r.employment_share_pct)&&r.employment_share_pct>=0&&r.employment_share_pct<=100)?items.reduce((a,r)=>a+r.employment_share_pct,0):null;
  if(sum===null||Math.abs(sum-100)>.5||!items.every(r=>r&&finite(r.productivity_usd2015_per_worker)&&r.productivity_usd2015_per_worker>0))return {year,items,sum,valid:false,index:null};
  const parts=items.map(r=>({...r,weight:r.employment_share_pct/sum,productivity:r.productivity_usd2015_per_worker}));
  return {year,items,sum,valid:true,parts,index:parts.reduce((a,r)=>a+r.weight*r.productivity,0)};
 }
 function decompose(rows,start,end){
  const a=snapshot(rows,start),b=snapshot(rows,end);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start>=end||!a.valid||!b.valid)return {a,b,valid:false};
  if(a.parts.some((r,i)=>r.productivity_source!==b.parts[i].productivity_source||r.employment_source!==b.parts[i].employment_source))return {a,b,valid:false};
  const parts=a.parts.map((r,i)=>{const q=b.parts[i];return {sector:r.sector,title:r.title,first:r,last:q,within:(r.weight+q.weight)/2*(q.productivity-r.productivity),between:(r.productivity+q.productivity)/2*(q.weight-r.weight)}});
  const within=parts.reduce((s,r)=>s+r.within,0),between=parts.reduce((s,r)=>s+r.between,0),actual=b.index-a.index,residual=actual-within-between;
  return {a,b,parts,within,between,actual,residual,valid:[within,between,actual,residual].every(finite)&&Math.abs(residual)<=1e-9*Math.max(1,Math.abs(a.index),Math.abs(b.index))};
 }
 function regional(rows,year,sample){
  const candidates=rows.filter(r=>r.year===year).map(r=>({...r,region:r.territory,value:r.nominal_grp_rub_per_employed}));
  const checked=sample(candidates);
  const entries=[...checked.out.values()].filter(r=>finite(r.value)&&r.value>=0).sort((a,b)=>a.value-b.value);
  const values=entries.map(r=>r.value),n=values.length,median=n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:null;
  return {median,n,excluded:checked.excluded+checked.out.size-n,ambiguous:checked.ambiguous,rows:entries.map(r=>({...r,ratio:median>0?r.value/median:null}))};
 }
 return {snapshot,decompose,regional};
})();
if(typeof module!=='undefined')module.exports=LaborDiagnostics;
if(typeof document!=='undefined')
document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:2}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>{const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=String(v)})}host.replaceChildren(t)};
 const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;return a};
 const refs=(items)=>{const d=document.createElement('div');for(const [label,url] of items){if(d.childNodes.length)d.append(' · ');d.append(link(label,url))}return d};
 try{
  const data=await load('labor-data.json'),b=data.broad,r=data.regional;
  const years=(records)=>[...new Set(records.map(x=>x.year))].sort((a,b)=>b-a);
  for(const [id,records] of [['labor-year',b],['labor-region-year',r]]){const select=$(id);for(const y of years(records))select.add(new Option(String(y),String(y)));select.disabled=!records.length}
  const complete=years(b).find(y=>b.filter(x=>x.year===y&&Number.isFinite(x.productivity_usd2015_per_worker)).length===3);if(complete)$('labor-year').value=String(complete);
  const draw=()=>{
   const year=Number($('labor-year').value),rows=b.filter(x=>x.year===year);
   $('labor-status').textContent='Наблюдений производительности: '+rows.filter(x=>Number.isFinite(x.productivity_usd2015_per_worker)).length+' из 3 · '+(year||'нет данных');
   table($('labor-broad'),['Сектор','ВДС на занятого, долл. 2015','Изменение за год, %','Занятых на млн долл. ВДС','Доля занятости, %','Источники WDI'],rows.map(x=>[x.title,fmt(x.productivity_usd2015_per_worker),fmt(x.productivity_change_pct),fmt(x.workers_per_million_usd2015_va),fmt(x.employment_share_pct),refs([['Производительность',x.productivity_source],['Занятость',x.employment_source]])]));
   const chart=$('labor-chart');chart.replaceChildren();
   const max=Math.max(1,...rows.map(x=>x.productivity_usd2015_per_worker||0));for(const x of rows){if(!Number.isFinite(x.productivity_usd2015_per_worker))continue;const d=document.createElement('div'),p=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';p.textContent=x.title+' · '+fmt(x.productivity_usd2015_per_worker);track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=(x.productivity_usd2015_per_worker/max*100)+'%';track.append(fill);d.append(p,track);chart.append(d)}
   const ys=years(b).reverse(),sectors=[...new Set(b.map(x=>x.sector))];const series=sectors.map(s=>{const a=b.filter(x=>x.sector===s),by=new Map(a.map(x=>[x.year,x.productivity_usd2015_per_worker]));return {name:a[0].title,code:s,values:ys.map(y=>by.get(y)??null)}});
   if(typeof chartTools==='function')chartTools(chart,'ВДС на занятого по укрупнённым секторам','долл. США в ценах 2015 года',ys,series,{source:'Всемирный банк, WDI: NV.AGR.EMPL.KD / NV.IND.EMPL.KD / NV.SRV.EMPL.KD',url:'https://data.worldbank.org/indicator/NV.AGR.EMPL.KD?locations=RU'});
  };
  const drawRegional=()=>{
   const year=Number($('labor-region-year').value),q=$('labor-region-query').value.trim().toLocaleLowerCase('ru'),all=r.filter(x=>x.year===year),rows=all.filter(x=>x.territory.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>b.nominal_grp_rub_per_employed-a.nominal_grp_rub_per_employed||a.territory.localeCompare(b.territory,'ru'));
   $('labor-region-status').textContent='Точных совпадений за выбранный год: '+all.length+'; показано '+rows.length+'. Всего допустимых пар: '+r.length+'. '+data.coverage.status;
   table($('labor-regional'),['Территория','ВРП, млн ₽','Занятые, тыс. чел.','Номинальный ВРП на занятого, ₽','Источники'],rows.map(x=>[x.territory,fmt(x.grp_mrub),fmt(x.employment_thousands),fmt(x.nominal_grp_rub_per_employed),refs([['ВРП',x.grp_source],['Занятые',x.employment_source]])]));
  };
  const start=$('labor-decomp-start'),end=$('labor-decomp-end'),exp=$('labor-decomp-export'),ys=years(b),valid=ys.filter(y=>LaborDiagnostics.snapshot(b,y).valid);
  for(const y of ys){start.add(new Option(String(y),String(y)));end.add(new Option(String(y),String(y)))}
  if(valid.length){end.value=String(valid[0]);start.value=String(valid.find(y=>y<=valid[0]-5)??valid.at(-1))}
  function decomposition(){
   const a=Number(start.value),z=Number(end.value),d=LaborDiagnostics.decompose(b,a,z),host=$('labor-decomp-table'),status=$('labor-decomp-status');
   host.replaceChildren();exp.disabled=true;
   if(!d.valid){status.textContent='Нет двух сопоставимых полных срезов. Суммы долей занятости: '+fmt(d.a.sum)+'% / '+fmt(d.b.sum)+'%. Требуются три сектора, сумма 100 ± 0,5 п. п. и положительная производительность.';return}
   status.textContent='Условный индекс: '+fmt(d.a.index)+' → '+fmt(d.b.index)+' долл. 2015 на занятого. Изменение '+fmt(d.actual)+'; внутри секторов '+fmt(d.within)+'; структура занятости '+fmt(d.between)+'. Невязка '+fmt(d.residual)+'.';
   table(host,['Сектор','Доля занятости начало, %','Доля конец, %','ВДС/занятого начало','ВДС/занятого конец','Внутрисекторный компонент','Структурный компонент'],d.parts.map(r=>[r.title,fmt(r.first.employment_share_pct),fmt(r.last.employment_share_pct),fmt(r.first.productivity),fmt(r.last.productivity),fmt(r.within),fmt(r.between)]));
   exp.disabled=false;exp.onclick=()=>csv('labor-decomposition-'+a+'-'+z+'.csv',[
    ['Сектор','Начало','Конец','Исходная доля начало, %','Исходная доля конец, %','Нормированная доля начало','Нормированная доля конец','ВДС/занятого начало','ВДС/занятого конец','Внутри сектора','Структурный компонент','Индекс начало','Индекс конец','Невязка','Источник производительности','Источник занятости','Дата проверки производительности начало','Дата проверки производительности конец','Дата проверки занятости начало','Дата проверки занятости конец'],...d.parts.map(r=>[r.title,a,z,r.first.employment_share_pct,r.last.employment_share_pct,r.first.weight,r.last.weight,r.first.productivity,r.last.productivity,r.within,r.between,d.a.index,d.b.index,d.residual,r.first.productivity_source,r.first.employment_source,r.first.productivity_checked,r.last.productivity_checked,r.first.employment_checked,r.last.employment_checked])]);
  }
  start.onchange=end.onchange=decomposition;decomposition();
  const ry=$('labor-gap-year'),re=$('labor-gap-export');
  for(const y of years(r))ry.add(new Option(String(y),String(y)));
  function gaps(){
   const y=Number(ry.value),d=LaborDiagnostics.regional(r,y,RegionalStats.sample),q=$('labor-gap-query').value.trim().toLocaleLowerCase('ru'),rows=d.rows.filter(x=>x.territory.toLocaleLowerCase('ru').includes(q)).reverse();
   $('labor-gap-status').textContent='Выборка: '+d.n+' непересекающихся территорий · медиана '+fmt(d.median)+' ₽ · исключено '+d.excluded+' · показано '+rows.length+'. Невзвешенное сравнение в текущих ценах.';
   table($('labor-gap-table'),['Территория','ВРП, млн ₽','Занятые, тыс.','ВРП/занятого, ₽','Отношение к медиане выборки'],rows.map(x=>[x.territory,fmt(x.grp_mrub),fmt(x.employment_thousands),fmt(x.value),fmt(x.ratio)]));
   re.disabled=!rows.length;re.onclick=()=>csv('labor-regional-gap-'+y+'.csv',[['Год','Территория','ВРП, млн руб.','Занятые, тыс.','ВРП на занятого, руб.','Медиана всей выборки','Отношение к медиане','Размер выборки','Исключено строк','Источник ВРП','Источник занятости','Ячейка ВРП','Ячейка занятости'],...rows.map(x=>[y,x.territory,x.grp_mrub,x.employment_thousands,x.value,d.median,x.ratio,d.n,d.excluded,x.grp_source,x.employment_source,JSON.stringify(x.grp_cell),JSON.stringify(x.employment_cell)])]);
  }
  ry.onchange=$('labor-gap-query').oninput=gaps;gaps();
  $('labor-year').addEventListener('change',draw);$('labor-region-year').addEventListener('change',drawRegional);$('labor-region-query').addEventListener('input',drawRegional);draw();drawRegional();
 }catch(e){console.error(e);$('labor-status').textContent='Не удалось загрузить статистику труда.';$('labor-region-status').textContent='Региональные данные недоступны.'}
});
