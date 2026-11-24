const FoodBalance=(()=>{
 const keys=['production','imports','exports','stock_change','supply'];
 function balance(v){return keys.every(k=>Number.isFinite(v[k]))?v.production+v.imports-v.exports-v.stock_change-v.supply:null}
 function scenario(v,p){
  const gap=balance(v);
  if(gap===null||Math.abs(gap)>3||['production','imports','exports','supply'].some(k=>v[k]<0))throw Error('Исходный баланс неполон или не проходит проверку');
  for(const k of ['production','imports','exports','supply'])if(!Number.isFinite(p[k])||p[k]<-100||p[k]>300)throw Error('Изменения от −100 до 300%');
  const production=v.production*(1+p.production/100),imports=v.imports*(1+p.imports/100),exports=v.exports*(1+p.exports/100),need=v.supply*(1+p.supply/100);
  // Preserve baseline statistical discrepancy rather than generating a fictitious shock.
  const available=production+imports-exports-v.stock_change-gap;
  return {production,imports,exports,need,available,stock_change:v.stock_change,baseline_gap:gap,surplus:available-need,coverage:need>0?100*available/need:null,additional_import:Math.max(0,need-available)};
 }
 function ratios(v){
 const ratio=(a,b)=>Number.isFinite(v[a])&&v[a]>=0&&Number.isFinite(v[b])&&v[b]>0?100*(v[a]/v[b]):null;
 return {production_supply:ratio('production','supply'),import_supply:ratio('imports','supply'),export_production:ratio('exports','production')};
}
 function timeline(rows,code){
 const selected=rows.filter(r=>r.code===code);
 if(!selected.length)return [];
 const byYear=new Map(selected.map(r=>[r.year,r]));
 return Array.from({length:Math.max(...byYear.keys())-Math.min(...byYear.keys())+1},(_,i)=>{
  const year=Math.min(...byYear.keys())+i,row=byYear.get(year),values=row?.values||{};
  return {year,row,values,ratios:ratios(values)};
 });
}
 return {balance,scenario,ratios,timeline};
})();
function renderTrend(d,manifest,verified,code,$,fmt){
 const rows=FoodBalance.timeline(d.rows,code),host=$('fbs-trend'),table=document.createElement('table'),h=table.createTHead().insertRow(),b=table.createTBody();
 const metricLabels={production_supply:'Производство / предложение',import_supply:'Импорт / предложение',export_production:'Экспорт / производство'};
 const rawKeys=['production','imports','exports','stock_change','supply'];
 for(const s of ['Год',...rawKeys.map(k=>d.labels[k]+' (тыс. т)'),...Object.values(metricLabels).map(s=>s+' (%)'),'Флаги исходных значений']){
  const th=document.createElement('th');th.scope='col';th.textContent=s;h.append(th);
 }
 for(const r of rows){
  const tr=b.insertRow();
  for(const v of [r.year,...rawKeys.map(k=>fmt(r.values[k])),...Object.keys(metricLabels).map(k=>fmt(r.ratios[k])),r.row?rawKeys.map(k=>r.row.flags[k]||'—').join(' / '):'Нет наблюдений'])tr.insertCell().textContent=v;
 }
 host.replaceChildren(table);
 $('fbs-trend-status').textContent=rows.filter(r=>r.row).length+' из '+rows.length+' календарных лет имеют хотя бы одно наблюдение. Пропуски не интерполируются. Флаги в порядке ресурсных столбцов.';
 const chartHost=$('fbs-trend-chart');chartHost.replaceChildren();
 const title=d.rows.find(r=>r.code===code)?.title||code,years=rows.map(r=>r.year);
 const source=d.mode==='official_archive'?'FAOSTAT, Food Balances':'CropArc, документальная реплика оценок FAOSTAT';
 for(const [keys,unit,heading,get] of [
  [['production','imports','exports','supply'],'тыс. т','Ресурсы',r=>r.values],
  [Object.keys(metricLabels),'%','Отношения объёмов',r=>r.ratios]
 ]){
  const section=document.createElement('div'),label=document.createElement('h3');label.textContent=heading;section.append(label);chartHost.append(section);
  const series=keys.map(k=>({name:metricLabels[k]||d.labels[k],code:code+'-'+k,values:rows.map(r=>get(r)[k]??null)})),vals=series.flatMap(s=>s.values.filter(Number.isFinite));
  if(!vals.length){section.append('Нет достаточных наблюдений.');continue}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 280');svg.setAttribute('role','img');svg.setAttribute('aria-label',title+' — '+heading);svg.style.width='100%';svg.style.maxWidth='850px';
  const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e};
  const colors=['#006c69','#a24724','#365e95','#775395'],dashes=['none','8 4','3 4','12 4 3 4'];
  const max=Math.max(1,...vals),x=i=>years.length===1?350:100+i*510/(years.length-1),y=v=>225-v*195/max;
  for(let j=0;j<=4;j++){const v=max*j/4;shape('line',{x1:100,x2:610,y1:y(v),y2:y(v),stroke:'#cbd5df'});shape('text',{x:92,y:y(v)+4,'font-size':12,'text-anchor':'end',fill:'currentColor'},fmt(v))}
  chartTickIndices(years.length,6).forEach(i=>shape('text',{x:x(i),y:250,'font-size':12,'text-anchor':'middle',fill:'currentColor'},years[i]));
  series.forEach((s,j)=>{
   let path='';s.values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(s.values[i-1])?'L':'M')+x(i)+' '+y(v)+' '});
   shape('path',{d:path,stroke:colors[j],fill:'none','stroke-width':2.5,'stroke-dasharray':dashes[j]});
   s.values.forEach((v,i)=>{if(Number.isFinite(v)){const c=shape('circle',{cx:x(i),cy:y(v),r:4,fill:colors[j]});const tip=document.createElementNS(ns,'title');tip.textContent=s.name+' · '+years[i]+': '+fmt(v)+' '+unit;c.append(tip)}});
  });
  section.append(svg);
  const legend=document.createElement('ul');series.forEach((s,i)=>{const li=document.createElement('li'),line=document.createElementNS(ns,'svg');line.setAttribute('width','36');line.setAttribute('height','12');line.setAttribute('aria-hidden','true');const stroke=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:1,x2:35,y1:6,y2:6,stroke:colors[i],'stroke-width':3,'stroke-dasharray':dashes[i]}))stroke.setAttribute(k,v);line.append(stroke);li.append(line,' '+s.name);legend.append(li)});section.append(legend);
  chartTools(section,title+' — '+heading,unit,years,series,{source,url:d.mode==='official_archive'?d.metadata:d.replica});
 }
 $('fbs-trend-export').disabled=!rows.length;
 $('fbs-trend-export').onclick=()=>csv('food-trend-'+code+'.csv',[
  ['Группа','Код','Год','Показатель','Значение','Единица','Исходные флаги','Источник','Режим','Отпечаток набора','SHA-256'],
  ...rows.flatMap(r=>{
   const record=(name,val,unit,flags)=>[title,code,r.year,name,Number.isFinite(val)?val:'',unit,flags,r.row?.source||(d.mode==='official_archive'?d.source:d.replica),d.mode,manifest.data_fingerprint,verified.sha256];
   return [...rawKeys.map(k=>record(k,r.values[k],'1000 t',r.row?.flags[k]||'')),...Object.entries({production_supply:['production','supply'],import_supply:['imports','supply'],export_production:['exports','production']}).map(([k,pair])=>record(k,r.ratios[k],'%',pair.map(q=>q+':'+(r.row?.flags[q]||'—')).join('; ')))];
  })
 ]);
}
if(typeof module!=='undefined')module.exports=FoodBalance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('fbs-item'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'food-balance.json',root),d=verified.data;
  $('fbs-status').textContent=(d.mode==='official_archive'?'Прямой импорт архива FAOSTAT':'Начальный снимок оценок FAOSTAT из документальной реплики, не прямой импорт')+' · '+d.status+' · проверено '+(d.checked||'—')+' · успешная загрузка '+(d.success||'—')+'.';
  if(d.mode!=='official_archive'){const a=document.createElement('a');a.href=d.replica;a.textContent=' Документальная реплика';$('fbs-status').append(a)}
  const items=new Map(d.rows.map(r=>[r.code,r.title])),inputs={};for(const [k,t] of items)$('fbs-item').add(new Option(t,k));
  for(const k of ['production','imports','exports','supply']){const l=document.createElement('label'),i=document.createElement('input');l.className='builder-control';l.append(d.labels[k]+' — изменение, %');i.type='number';i.min='-100';i.max='300';i.step='any';i.value='0';l.append(i);$('fbs-inputs').append(l);inputs[k]=i;i.addEventListener('input',clear)}
  let selected;function clear(){$('fbs-result').textContent='Параметры изменены. Выполните расчёт.';$('fbs-export').disabled=true}
  function draw(){selected=d.rows.find(r=>r.code===$('fbs-item').value&&r.year===Number($('fbs-year').value));if(!selected)return;const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const s of ['Элемент','Тыс. т','Флаг','Примечание']){const th=document.createElement('th');th.textContent=s;th.scope='col';h.append(th)}for(const [k,title] of Object.entries(d.labels)){const tr=b.insertRow();for(const s of [title,fmt(selected.values[k]),selected.flags[k]||'—',selected.notes[k]||''])tr.insertCell().textContent=s}$('fbs-table').replaceChildren(t);const g=FoodBalance.balance(selected.values);$('fbs-check').textContent='Расхождение ресурсного равенства, тыс. т: '+fmt(g)+' · '+(g!==null&&Math.abs(g)<=3?'проверка пройдена':'сценарий недоступен');$('fbs-run').disabled=g===null||Math.abs(g)>3;clear()}
  function years(){const list=d.rows.filter(r=>r.code===$('fbs-item').value).map(r=>r.year).sort((a,b)=>b-a);$('fbs-year').replaceChildren(...list.map(y=>new Option(y,y)));draw();renderTrend(d,manifest,verified,$('fbs-item').value,$,fmt)}
  $('fbs-item').addEventListener('change',years);$('fbs-year').addEventListener('change',draw);
  $('fbs-run').onclick=()=>{clear();try{const p=Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.valueAsNumber])),r=FoodBalance.scenario(selected.values,p);$('fbs-result').textContent='Предложение: '+fmt(r.available)+' тыс. т; потребность: '+fmt(r.need)+' тыс. т; сальдо: '+fmt(r.surplus)+' тыс. т; покрытие: '+fmt(r.coverage)+'%; дополнительный импорт при прочих неизменных: '+fmt(r.additional_import)+' тыс. т.';$('fbs-export').disabled=false;$('fbs-export').onclick=()=>csv('food-scenario.csv',[['Продукт',selected.title],['Год',selected.year],['Источник',selected.source],['Режим',d.mode],['Отпечаток',manifest.data_fingerprint],['SHA-256',verified.sha256],['Единица','тыс. т'],['Метод','P+M−X−ΔS−исходное расхождение; потребность D×(1+g/100)'],['Изменения, %',...Object.keys(p)],['Параметры',...Object.values(p)],['Результат',...Object.keys(r)],['Значения',...Object.values(r)]])}catch(e){$('fbs-result').textContent=e.message}};
  years();
 }catch(e){$('fbs-status').textContent='Набор не подтверждён: '+e.message}
});
