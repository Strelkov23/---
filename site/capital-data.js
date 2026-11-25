const CapacityAnalysis=(()=>{
 const ranges=[["Менее 25%",0,25],["25–менее 50%",25,50],["50–менее 75%",50,75],["75–менее 90%",75,90],["90–100%",90,101]];
 function distribution(rows){
  const valid=rows.filter(r=>Number.isFinite(r.utilization_pct)&&r.utilization_pct>=0&&r.utilization_pct<=100);
  return {total:rows.length,valid:valid.length,missing:rows.length-valid.length,bins:ranges.map(([label,lo,hi])=>({label,count:valid.filter(r=>r.utilization_pct>=lo&&r.utilization_pct<hi).length})),min:valid.length?Math.min(...valid.map(r=>r.utilization_pct)):null,max:valid.length?Math.max(...valid.map(r=>r.utilization_pct)):null};
 }
 function sorted(rows,mode){
  const byName=(a,b)=>a.title.localeCompare(b.title,'ru')||a.code.localeCompare(b.code);
  if(mode==='name')return [...rows].sort(byName);
  const key=mode==='change'||mode==='fall'?'change_pp':'utilization_pct',sign=mode==='low'||mode==='fall'?1:-1;
  return [...rows].sort((a,b)=>{const av=Number.isFinite(a[key]),bv=Number.isFinite(b[key]);return av!==bv?(av?-1:1):av?sign*(a[key]-b[key])||byName(a,b):byName(a,b)});
 }
 // Consecutive calendar years only; a changed definition breaks the chain.
 const valid=v=>Number.isFinite(v)&&v>=0&&v<=100;
 function capacitySignals(records,end,span,low,high,target){
  if(!Number.isInteger(end)||!Number.isInteger(span)||span<2||span>10||!valid(low)||!valid(high)||low>=high||!valid(target)||target<=0)throw Error('Invalid capacity diagnostic parameters');
  const years=Array.from({length:span},(_,i)=>end-span+1+i),groups=new Map();
  for(const r of records){if(!r.code||!years.includes(r.year))continue;const a=groups.get(r.code)||[];a.push(r);groups.set(r.code,a)}
  const out=[];
  for(const [code,all] of groups){
   const slots=years.map(y=>{const a=all.filter(r=>r.year===y);return a.length===1?a[0]:null}),current=slots.at(-1),reference=current||all[0];
   const vals=slots.map(r=>r&&valid(r.utilization_pct)?r.utilization_pct:null),u=vals.at(-1);
   const comparable=slots.every((r,i)=>r&&vals[i]!==null&&r.coverage===reference.coverage&&r.source===reference.source&&r.group===reference.group&&(i===0||r.comparison_status==='same_published_label'));
   const state=u===null?'missing':!comparable?'incomplete':vals.every(v=>v>=high)?'persistent-high':vals.every(v=>v<low)?'persistent-low':u>=high?'current-high':u<low?'current-low':'middle';
   // Arithmetic relative to current output, without claiming available capacity.
   const headroom=u!==null&&u>0?100*(target/u-1):null;
   out.push({code,title:reference.title,group:reference.group,years,slots,vals,u,comparable,state,headroom,aboveTarget:u!==null&&u>target});
  }
  return out.sort((a,b)=>a.title.localeCompare(b.title,'ru')||a.code.localeCompare(b.code));
 }
 return {distribution,sorted,capacitySignals};
})();
if(typeof module!=='undefined')module.exports=CapacityAnalysis;
if(typeof document!=='undefined')
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
   if(id==='capacity-trend'&&seriesRows.some(r=>r.comparison_status==='definition_changed')){
    const note=document.createElement('p');note.textContent='В 2023 году изменилась формулировка продукта. Значения разных определений показаны в таблице; линия динамики не строится, изменение 2023/2022 не рассчитывается.';host.append(note);return;
   }
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
   const y=Number($('capacity-year').value),g=$('capacity-group').value,q=$('capacity-query').value.trim().toLocaleLowerCase('ru'),rows=CapacityAnalysis.sorted(c.filter(x=>x.year===y&&(!g||x.group===g)&&x.title.toLocaleLowerCase('ru').includes(q)),$('capacity-sort').value);
   $('capacity-status').textContent='Показано продуктов: '+rows.length+' · '+y+' · охват: без малого предпринимательства.';
   const dist=CapacityAnalysis.distribution(rows),host=$('capacity-distribution'),h=document.createElement('h3'),note=document.createElement('p');
   h.textContent='Распределение продуктов по загрузке';note.textContent=dist.valid?'Диапазон: '+fmt(dist.min)+'–'+fmt(dist.max)+'%. Числовых значений: '+dist.valid+' из '+dist.total+'. Каждый продукт считается один раз; доли не взвешены по выпуску или мощности.':'Нет числовых значений по выбранным условиям.';
   host.replaceChildren(h,note);
   if(dist.valid)for(const b of dist.bins){const row=document.createElement('div'),label=document.createElement('p'),bar=document.createElement('progress');label.textContent=b.label+' · '+b.count+' из '+dist.valid+' ('+fmt(100*b.count/dist.valid)+'%)';bar.max=dist.valid;bar.value=b.count;bar.setAttribute('aria-label',label.textContent);row.append(label,bar);host.append(row)}
   table($('capacity-table'),['Продукт','Группа','Загрузка, %','Незагруженная доля, %','Условный прирост к выпуску, %','Изменение загрузки, п.п.','Сопоставимость'],rows.map(x=>[x.title,x.group,...[x.utilization_pct,x.unused_share_pct,x.theoretical_extra_vs_output_pct,x.change_pp].map(fmt),x.comparison_status==='definition_changed'?'Изменилось определение':x.comparison_status==='first_year'?'Нет предыдущего года':'Одинаковая формулировка источника']));
   const exportButton=$('capacity-export');exportButton.disabled=!rows.length;exportButton.onclick=()=>csv('capacity-selection.csv',[['Код','Продукт','Группа','Год','Загрузка, %','Незагруженная доля, %','Условный прирост, %','Изменение, п.п.','Сопоставимость','Охват','Таблица','Страница','Источник','Примечание'],...rows.map(x=>[x.code,x.title,x.group,x.year,x.utilization_pct,x.unused_share_pct,x.theoretical_extra_vs_output_pct,x.change_pp,x.comparison_status,x.coverage,x.table,x.page,x.source,x.note])]);
   bars($('capacity-chart'),CapacityAnalysis.sorted(rows,'high'),'utilization_pct','Наиболее загруженные продукты в выбранном срезе');
  }
  const labels={'persistent-high':'Устойчиво высокая загрузка','persistent-low':'Устойчиво низкая загрузка','current-high':'Высокая в последнем году','current-low':'Низкая в последнем году',middle:'Между порогами в последнем году',incomplete:'Нет полной сопоставимой истории',missing:'Нет значения последнего года'};
  const signalYear=$('cap-signal-year'),signalGroup=$('cap-signal-group');
  for(const y of [...new Set(c.map(r=>r.year))].sort((a,b)=>b-a))signalYear.add(new Option(String(y),String(y)));
  signalGroup.add(new Option('Все группы',''));for(const g of [...new Set(c.map(r=>r.group))])signalGroup.add(new Option(g,g));
  function signals(){
   const year=Number(signalYear.value),span=Number($('cap-signal-span').value),low=Number($('cap-signal-low').value),high=Number($('cap-signal-high').value),target=Number($('cap-signal-target').value),state=$('cap-signal-filter').value;
   const host=$('cap-signal-table'),summary=$('cap-signal-summary'),button=$('cap-signal-export');
   host.replaceChildren();summary.replaceChildren();button.disabled=true;
   if(low>=high){$('cap-signal-status').textContent='Нижний порог должен быть меньше верхнего.';return}
   const all=CapacityAnalysis.capacitySignals(c,year,span,low,high,target).filter(r=>!signalGroup.value||r.group===signalGroup.value),rows=all.filter(r=>!state||r.state===state);
   $('cap-signal-status').textContent='Срез '+year+' · полная сопоставимая история: '+all.filter(r=>r.comparable).length+' из '+all.length+' продуктов · показано: '+rows.length+'. Документальный снимок, без малого предпринимательства.';
   for(const [key,label] of Object.entries(labels)){const d=node('div','');d.className='metric';d.append(node('b',String(all.filter(r=>r.state===key).length)),node('span',label));summary.append(d)}
   const years=Array.from({length:span},(_,i)=>year-span+1+i);
   table(host,['Продукт','Группа',...years.map(y=>y+' (%)'),'Сигнал','До целевой загрузки: изменение выпуска, %','Выше цели'],rows.map(r=>[r.title,r.group,...r.vals.map(fmt),labels[r.state],fmt(r.headroom),r.u===null?'—':r.aboveTarget?'Да':'Нет']));
   button.disabled=!rows.length;
   button.onclick=()=>csv('capacity-diagnostic-'+year+'.csv',[
    ['Код','Продукт','Группа','Год окончания','Окно, лет','Нижний порог, %','Верхний порог, %','Целевая загрузка, %','Состояние','Сопоставимая история','Изменение выпуска до цели, %','Выше цели','Год наблюдения','Загрузка, %','Сопоставимость','Охват','Таблица','Страница','Источник','Примечание','Редакция ежегодника','Дата транскрипции','Статус проверки'],...rows.flatMap(r=>r.years.map((y,i)=>{const o=r.slots[i];return [r.code,r.title,r.group,year,span,low,high,target,labels[r.state],r.comparable?'да':'нет',r.headroom,r.u===null?'':r.aboveTarget?'да':'нет',y,r.vals[i],o?.comparison_status,o?.coverage,o?.table,o?.page,o?.source,o?.note,d.edition,d.transcribed,d.verification]}))]);
  }
  for(const id of ['cap-signal-year','cap-signal-group','cap-signal-span','cap-signal-low','cap-signal-high','cap-signal-target','cap-signal-filter'])$(id).addEventListener('change',signals);signals();
  $('capital-year').addEventListener('change',assets);$('capital-sort').addEventListener('change',assets);
  $('capacity-year').addEventListener('change',capacity);$('capacity-group').addEventListener('change',capacity);$('capacity-query').addEventListener('input',capacity);$('capacity-sort').addEventListener('change',capacity);assets();capacity();assetTrend();capacityTrend();
 }catch(e){console.error(e);$('capital-status').textContent='Не удалось загрузить данные.'}
});
