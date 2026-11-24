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
  $('labor-year').addEventListener('change',draw);$('labor-region-year').addEventListener('change',drawRegional);$('labor-region-query').addEventListener('input',drawRegional);draw();drawRegional();
 }catch(e){console.error(e);$('labor-status').textContent='Не удалось загрузить статистику труда.';$('labor-region-status').textContent='Региональные данные недоступны.'}
});
