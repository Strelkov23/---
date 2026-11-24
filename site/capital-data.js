document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('capital-year'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:2}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r)tr.insertCell().textContent=String(v)}host.replaceChildren(t)};
 function bars(host,rows,key,title){host.replaceChildren();const heading=document.createElement('h3');heading.textContent=title;host.append(heading);for(const r of rows.slice(0,8)){const d=document.createElement('div'),p=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';p.textContent=r.title+' · '+fmt(r[key])+'%';track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=r[key]+'%';track.append(fill);d.append(p,track);host.append(d)}}
 try{
  const d=await load('capital-data.json'),a=d.assets,c=d.capacity;
  for(const [id,rows] of [['capital-year',a],['capacity-year',c]])for(const y of [...new Set(rows.map(x=>x.year))].sort((a,b)=>b-a))$(id).add(new Option(String(y),String(y)));
  $('capacity-group').add(new Option('Все группы',''));for(const name of [...new Set(c.map(x=>x.group))])$('capacity-group').add(new Option(name,name));
  for(const [id,rows] of [['capital-trend',a],['capacity-trend',c]])for(const r of rows.filter(x=>x.year===2024))$(id).add(new Option(r.title,r.code));
  $('capacity-trend').value='tractors';
  function trend(id,rows,metrics,title){
   const host=$(id+'-chart'),code=$(id).value,seriesRows=rows.filter(x=>x.code===code).sort((x,y)=>x.year-y.year);
   host.replaceChildren();if(!seriesRows.length)return;
   const t=seriesRows[0].title,years=seriesRows.map(x=>x.year);
   table(host,['Год',...metrics.map(x=>x[1])],seriesRows.map(r=>[r.year,...metrics.map(([key])=>fmt(r[key]))]));
   // Use the shared renderer for export, and display the same data in an accessible chart.
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
   svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('role','img');svg.setAttribute('aria-label',title+': '+t);
   function shape(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [key,v] of Object.entries(attrs))e.setAttribute(key,v);if(text!==undefined)e.textContent=text;svg.append(e)}
   const xx=i=>100+460*i/Math.max(1,years.length-1),yy=v=>205-175*v/100;
   for(let v=0;v<=100;v+=25){shape('line',{x1:100,x2:560,y1:yy(v),y2:yy(v),stroke:'#cfdcdb'});shape('text',{x:90,y:yy(v)+4,'font-size':12,'text-anchor':'end'},v+'%')}
   years.forEach((y,i)=>shape('text',{x:xx(i),y:231,'text-anchor':'middle','font-size':12},y));
   const colors=['#285b83','#006c69','#a24724'];
   const series=metrics.map(([key,label],i)=>({name:label,code:code+'_'+key,values:seriesRows.map(r=>r[key])}));
   series.forEach((s,i)=>{shape('path',{d:s.values.map((v,k)=>(k?'L':'M')+xx(k)+' '+yy(v)).join(' '),stroke:colors[i],'stroke-width':2.5,'stroke-dasharray':i?'5 3':'none',fill:'none'});s.values.forEach((v,k)=>shape('circle',{cx:xx(k),cy:yy(v),r:4,fill:colors[i]}))});
   const legend=document.createElement('p');legend.textContent=metrics.map((x,i)=>['Синий','Зелёный','Коричневый'][i]+' — '+x[1]).join('; ');host.append(legend,svg);
   if(typeof chartTools==='function')chartTools(host,title+': '+t,'%',years,series,{source:'Росстат, Российский статистический ежегодник 2025, '+(id==='capital-trend'?'таблицы 14.6, 14.7':'таблица 16.5')+'; ручная текстовая транскрипция',url:d.source});
  }
  const assetTrend=()=>trend('capital-trend',a,[['wear_pct','Износ'],['renewal_pct','Обновление'],['disposal_pct','Выбытие']],'Состояние основных фондов');
  const capacityTrend=()=>trend('capacity-trend',c,[['utilization_pct','Загрузка']],'Использование среднегодовой мощности');
  $('capital-trend').addEventListener('change',assetTrend);$('capacity-trend').addEventListener('change',capacityTrend);
  function assets(){
   const y=Number($('capital-year').value),key=$('capital-sort').value,total=a.find(x=>x.code==='TOTAL'&&x.year===y),rows=a.filter(x=>x.code!=='TOTAL'&&x.year===y).sort((a,b)=>b[key]-a[key]);
   $('capital-status').textContent='Разделов деятельности: '+rows.length+' · '+y+' · расхождение суммы разделов с итогом: '+fmt(d.reconciliation.find(x=>x.year===y).difference_mrub)+' млн ₽.';
   $('capital-metrics').replaceChildren();for(const [label,value] of [['Фонды РФ, трлн ₽',fmt(total.stock_mrub/1e6)],['Износ, %',fmt(total.wear_pct)],['Обновление, %',fmt(total.renewal_pct)],['Выбытие, %',fmt(total.disposal_pct)]]){const e=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');e.className='metric';b.textContent=value;s.textContent=label;e.append(b,s);$('capital-metrics').append(e)}
   table($('capital-table'),['ОКВЭД2','Вид деятельности','Фонды, млрд ₽','Индекс физ. объёма, %','Износ, %','Изменение износа, п.п.','Обновление, %','Выбытие, %'],[total,...rows].map(x=>[x.code,x.title,...[x.stock_mrub/1000,x.volume_index,x.wear_pct,x.wear_change_pp,x.renewal_pct,x.disposal_pct].map(fmt)]));
   bars($('capital-chart'),[...rows].sort((a,b)=>b.wear_pct-a.wear_pct),'wear_pct','Наибольшая степень износа');
  }
  function capacity(){
   const y=Number($('capacity-year').value),g=$('capacity-group').value,q=$('capacity-query').value.trim().toLocaleLowerCase('ru'),rows=c.filter(x=>x.year===y&&(!g||x.group===g)&&x.title.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>b.utilization_pct-a.utilization_pct);
   $('capacity-status').textContent='Показано продуктов: '+rows.length+' · '+y+' · охват: без малого предпринимательства.';
   table($('capacity-table'),['Продукт','Группа','Загрузка, %','Незагруженная доля, %','Условный прирост к выпуску, %','Изменение загрузки, п.п.'],rows.map(x=>[x.title,x.group,...[x.utilization_pct,x.unused_share_pct,x.theoretical_extra_vs_output_pct,x.change_pp].map(fmt)]));
   bars($('capacity-chart'),rows,'utilization_pct','Наиболее загруженные продукты в выбранном срезе');
  }
  $('capital-year').addEventListener('change',assets);$('capital-sort').addEventListener('change',assets);
  $('capacity-year').addEventListener('change',capacity);$('capacity-group').addEventListener('change',capacity);$('capacity-query').addEventListener('input',capacity);assets();capacity();assetTrend();capacityTrend();
 }catch(e){console.error(e);$('capital-status').textContent='Не удалось загрузить данные.'}
});
