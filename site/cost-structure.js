const CostStructure=(()=>{
 const keys=['materials','labor','insurance','depreciation','other'];
 const detailed=['raw','fuel','energy','remaining_materials','labor','insurance','depreciation','other'];
 function calculate(row,shocks,mode='aggregate'){
  if(!['aggregate','detailed'].includes(mode))throw Error('Неизвестный режим');
  let fields=keys;
  if(mode==='detailed'){
   if(['materials','raw','fuel','energy'].some(k=>!Number.isFinite(row[k])||row[k]<0))throw Error('Нет корректной детализации материалов');
   const rem=row.materials-row.raw-row.fuel-row.energy;
   if(rem< -1e-9)throw Error('Вложенные доли превышают материалы');
   row={...row,remaining_materials:Math.max(0,rem)};fields=detailed;
  }
  if(fields.some(k=>!Number.isFinite(row[k])||row[k]<0||!Number.isFinite(shocks[k])||shocks[k]<-100||shocks[k]>300))throw Error('Задайте изменение от −100 до 300% для каждого элемента');
  const sum=fields.reduce((a,k)=>a+row[k],0);
  if(Math.abs(sum-100)>.3000001||sum<=0)throw Error('Нарушена структура исходных затрат');
  const parts=fields.map(k=>({key:k,original:row[k],weight:100*row[k]/sum,shock:shocks[k],contribution:row[k]/sum*shocks[k]}));
  return {mode,sum,parts,index:100+parts.reduce((s,p)=>s+p.contribution,0)};
 }

 const amountLabels={cost_amount_total:'Общие затраты',cost_amount_materials:'Материальные затраты',cost_amount_labor:'Оплата труда',cost_amount_insurance:'Страховые взносы',cost_amount_depreciation:'Амортизация',cost_amount_other:'Прочие затраты'};
 function monetarySeries(data,title,metric){
  if(!Object.hasOwn(amountLabels,metric))throw Error('Неизвестный денежный показатель');
  const files=(data?.files||[]).filter(f=>f.review?.kind==='reviewed_partial_cost');
  if(files.length!==1)throw Error('Нет однозначной принятой денежной редакции');
  const f=files[0],years=f.review.coverage.map(r=>r.year);
  if(!years.length||new Set(years).size!==years.length||years.some((y,i)=>!Number.isInteger(y)||(i>0&&y!==years[i-1]+1)))throw Error('Некорректная шкала периода');
  const index=new Map();
  for(const r of f.rows.filter(r=>r.title===title&&r.metric===metric)){
   if(index.has(r.year)||!years.includes(r.year)||r.unit!=='млн руб.'||!Number.isFinite(r.value)||r.value<0||r.source!==f.url)throw Error('Некорректное денежное наблюдение');
   index.set(r.year,r);
  }
  return {years,values:years.map(y=>index.get(y)?.value??null),rows:years.map(y=>index.get(y)||null),source:f.url,sha256:f.sha256,policy:f.review.policy,success:f.success};
 }
 return {keys,detailed,calculate,amountLabels,monetarySeries};
})();
if(typeof module!=='undefined')module.exports=CostStructure;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('cost-year'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();headers.forEach(v=>{const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)});for(const row of rows){const tr=b.insertRow();row.forEach(v=>tr.insertCell().textContent=v)}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'cost-structure.json',root),d=verified.data,rows=d.rows,keys=CostStructure.keys;
  const sector=$('cost-sector'),year=$('cost-year'),inputs={};for(const r of rows.filter(x=>x.year===2024))sector.add(new Option(r.title,r.code));sector.value='C';
  const mode=$('cost-mode');d.labels.remaining_materials='Остальные материальные затраты (расчётный остаток)';
  function fields(){return mode.value==='detailed'?CostStructure.detailed:keys}
  function controls(){ $('cost-shocks').replaceChildren();for(const k of Object.keys(inputs))delete inputs[k];for(const k of fields()){const l=document.createElement('label'),input=document.createElement('input');l.className='builder-control';l.append(d.labels[k]+' — изменение, %');input.type='number';input.min='-100';input.max='300';input.step='any';input.value='0';l.append(input);$('cost-shocks').append(l);inputs[k]=input;input.addEventListener('input',clear)}clear()}
  mode.addEventListener('change',controls);controls();
  function clear(){$('cost-result').textContent='Параметры изменены. Выполните расчёт.';$('cost-detail').replaceChildren();$('cost-export').disabled=true}
  function draw(){const chosen=rows.filter(r=>r.year===Number(year.value));table($('cost-table'),['Раздел',...Object.entries(d.labels).filter(([k])=>k!=='remaining_materials').map(([,v])=>v),'Сумма пяти элементов, %','Отклонение, п.п.'],chosen.map(r=>[r.title,...Object.keys(d.labels).filter(k=>k!=='remaining_materials').map(k=>fmt(r[k])),fmt(r.sum_primary),fmt(r.rounding_difference)]));$('cost-status').textContent='Разделов: '+chosen.length+' · '+year.value+' · '+d.coverage+' '+d.verification;clear()}
  function trend(){const chosen=rows.filter(r=>r.code===sector.value),host=$('cost-chart'),years=chosen.map(r=>r.year);table($('cost-trend'),['Год',...keys.map(k=>d.labels[k])],chosen.map(r=>[r.year,...keys.map(k=>fmt(r[k]))]));host.replaceChildren();const series=keys.map(k=>({code:k,name:d.labels[k],values:chosen.map(r=>r[k])})),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','Структура пяти элементов затрат, без принудительной нормировки');
   const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e)};
   const colors=['#35658b','#006c69','#a24724','#8665a3','#8b9298'];chosen.forEach((r,i)=>{let pos=0;keys.forEach((k,j)=>{const w=r[k]*4.8;shape('rect',{x:100+pos,y:30+i*62,width:w,height:34,fill:colors[j]});if(w>=30)shape('text',{x:100+pos+w/2,y:52+i*62,'text-anchor':'middle','font-size':11,fill:'white'},fmt(r[k]));pos+=w});shape('text',{x:88,y:52+i*62,'text-anchor':'end','font-size':13},r.year)});host.append(svg);const legend=document.createElement('p');legend.textContent=keys.map((k,i)=>['Синий','Зелёный','Коричневый','Фиолетовый','Серый'][i]+': '+d.labels[k]).join(' · ');host.append(legend);chartTools(host,chosen[0].title+' — структура затрат','%',years,series,{source:'Росстат, ежегодник 2025, таблица 15.8; SHA-256 '+verified.sha256,url:d.source});clear()}
  year.addEventListener('change',draw);sector.addEventListener('change',trend);
  $('cost-run').onclick=()=>{clear();try{const row=rows.find(r=>r.code===sector.value&&r.year===Number(year.value)),shocks=Object.fromEntries(fields().map(k=>[k,inputs[k].valueAsNumber])),r=CostStructure.calculate(row,shocks,mode.value);
   $('cost-result').textContent='Условный индекс затрат: '+fmt(r.index)+' (база 100); изменение '+fmt(r.index-100)+'%. Опубликованная сумма долей: '+fmt(r.sum)+'%.';
   table($('cost-detail'),['Элемент','Исходная доля, %','Нормированный вес, %','Изменение, %','Вклад, п.п.'],r.parts.map(p=>[d.labels[p.key],fmt(p.original),fmt(p.weight),fmt(p.shock),fmt(p.contribution)]));
   $('cost-export').disabled=false;$('cost-export').onclick=()=>csv('cost-scenario.csv',[['Раздел',row.title],['Год',row.year],['Методика','1.1: 100 + Σ (sᵢ/Σs)×gᵢ'],['Режим',r.mode],['Остаток материалов','материалы − сырьё − топливо − энергия; только в детальном режиме'],['Индекс',r.index],['Отпечаток',manifest.data_fingerprint],['SHA-256',verified.sha256],['Источник',d.source],['Элемент','Исходная доля','Нормированный вес','Изменение','Вклад'],...r.parts.map(p=>[d.labels[p.key],p.original,p.weight,p.shock,p.contribution])]);
  }catch(e){$('cost-result').textContent=e.message}};
  draw();trend();$('cost-run').disabled=false;
 }catch(e){$('cost-status').textContent='Набор не подтверждён: '+e.message}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('cost-amount-status');if(!status)return;
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'rosstat-workbooks.json',root),data=verified.data;
  const files=(data.files||[]).filter(f=>f.review?.kind==='reviewed_partial_cost');
  if(files.length!==1){status.textContent='Проверенная денежная редакция пока отсутствует в опубликованном архиве.';return}
  const f=files[0],sector=$('cost-amount-sector'),metric=$('cost-amount-metric');
  const titles=[...new Set(f.rows.filter(r=>r.metric==='cost_amount_total').map(r=>r.title))];
  if(!titles.length)throw Error('Нет проверенных отраслей');
  titles.forEach(t=>sector.add(new Option(t,t)));
  Object.entries(CostStructure.amountLabels).forEach(([k,v])=>metric.add(new Option(v,k)));
  sector.disabled=metric.disabled=false;
  function draw(){
   const host=$('cost-amount-chart'),tableHost=$('cost-amount-table');host.replaceChildren();tableHost.replaceChildren();
   try{
    const d=CostStructure.monetarySeries(data,sector.value,metric.value),name=CostStructure.amountLabels[metric.value];
    const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
    const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();
    ['Год','Млн руб.','Исходная ячейка','Статус'].forEach(v=>{const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)});
    d.years.forEach((y,i)=>{const row=d.rows[i],tr=b.insertRow();[y,fmt(d.values[i]),row?'Лист '+row.sheet+', строка '+row.row+', столбец '+row.column:'—',row?'Принято':'Нет принятого наблюдения'].forEach(v=>tr.insertCell().textContent=v)});
    tableHost.append(t);
    chartTools(host,sector.value+' — '+name,'млн руб.',d.years,[{code:metric.value,name,values:d.values}],{source:'Росстат · исходный SHA-256 '+d.sha256,url:d.source,territory:'Россия, охват по примечаниям',display:true});
    status.textContent='Принято '+d.values.filter(Number.isFinite).length+' из '+d.years.length+' годовых позиций. Последний успешный импорт: '+(d.success||'—')+'. '+d.policy;
    $('cost-amount-notes').textContent=[...new Set(d.rows.filter(Boolean).map(r=>r.definition))].join(' | ');
   }catch(e){status.textContent='Денежный ряд отклонён: '+e.message}
  }
  sector.addEventListener('change',draw);metric.addEventListener('change',draw);draw();
 }catch(e){status.textContent='Набор не подтверждён: '+e.message}
});
