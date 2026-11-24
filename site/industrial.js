document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('ind-form'))return;
 const fields=['ind-kind','ind-q','ind-series','ind-from','ind-to'],picker=$('ind-series'),status=$('ind-status');
 const a=(label,url)=>{const x=node('a',label);x.href=url;x.target='_blank';x.rel='noopener noreferrer';return x};
 try{
 if(!version){const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}
 const data=await load('industrial.json'),catalog=data.series;
 const crossPeriod=$('ind-cross-period'),crossQ=$('ind-cross-q'),crossSort=$('ind-cross-sort');
 restore(['ind-cross-q','ind-cross-sort']);
 for(const [label,n] of [['Рядов',catalog.length],['Наблюдений',catalog.reduce((n,s)=>n+s.values.length,0)],['Источников',data.sources.length]]){
  const x=node('div','');x.className='metric';x.append(node('b',fmt(n)),node('span',label));$('ind-metrics').append(x)
 }
 for(const k of [...new Set(catalog.map(s=>s.kind))].sort())$('ind-kind').add(new Option(k,k));
 for(const s of data.sources){const x=node('article','');x.append(node('h3',s.title),a('Исходная таблица',s.url),node('p',s.status+' · '+(s.checked||'не проверено')));$('ind-sources').append(x)}
 function options(){
  const q=$('ind-q').value.trim().toLowerCase().replaceAll('ё','е'),k=$('ind-kind').value,old=picker.value;picker.replaceChildren();
  for(const s of catalog.filter(s=>(!k||s.kind===k)&&[s.code,s.title,s.unit,s.classification].join(' ').toLowerCase().replaceAll('ё','е').includes(q)))picker.add(new Option(s.title+' · '+s.unit+' · '+s.frequency,s.id));
  if([...picker.options].some(o=>o.value===old))picker.value=old;
 }
 restore(fields.filter(id=>id!=='ind-series'));options();restore(['ind-series']);
 function draw(){
  prepareCross();
  const s=catalog.find(s=>s.id===picker.value),g=$('ind-chart'),t=$('ind-table'),p=$('ind-passport');g.replaceChildren();t.replaceChildren();p.replaceChildren();$('ind-export').disabled=true;
  if(!s){status.textContent='Нет рядов по выборке. Проверьте состояние источников.';return}
  const start=$('ind-from').value.trim(),end=$('ind-to').value.trim(),monthly=s.frequency==='месячная',pat=monthly?/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/:/^\d{4}$/;
  if((start&&!pat.test(start))||(end&&!pat.test(end))||(start&&end&&start>end&&!(monthly&&end.length===4&&start.startsWith(end)))){status.textContent='Укажите корректный период для выбранной периодичности';return}
  const rows=s.values.filter(r=>(!start||r.period>=start)&&(!end||r.period<=(monthly&&end.length===4?end+'-12':end))).sort((a,b)=>a.period.localeCompare(b.period));
  p.append(node('h2',s.title),node('p',[s.classification,s.code,s.kind,s.unit,s.frequency].filter(Boolean).join(' · ')),node('p',s.definition),a('Исходная таблица Росстата',s.source),node('p','Лист: '+s.sheet+' · версия данных: '+(version||'не определена')));
  status.textContent='Наблюдений: '+rows.length;save(fields);if(!rows.length)return;
  const first=rows[0].period,last=rows.at(-1).period,periods=[];
  if(monthly){const n=p=>Number(p.slice(0,4))*12+Number(p.slice(5))-1;for(let i=n(first);i<=n(last);i++)periods.push(Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'))}
  else for(let y=Number(first);y<=Number(last);y++)periods.push(String(y));
  const map=new Map(rows.map(r=>[r.period,r])),values=periods.map(p=>map.get(p)?.value??null);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 220');svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label',s.title);
  const shape=(tag,attrs,text)=>{const x=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);if(text!==undefined)x.textContent=text;svg.append(x);return x};
  let lo=Math.min(...rows.map(r=>r.value)),hi=Math.max(...rows.map(r=>r.value));if(lo===hi){lo-=1;hi+=1}
  const x=i=>90+580*i/Math.max(1,periods.length-1),y=v=>175-150*(v-lo)/(hi-lo);
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;shape('line',{x1:90,x2:670,y1:y(v),y2:y(v),stroke:'#b9c8c8'});shape('text',{x:85,y:y(v)+4,'text-anchor':'end','font-size':11,fill:'currentColor'},fmt(v))}
  let path='';values.forEach((v,i)=>{if(v===null)return;path+=(i&&values[i-1]!==null?'L':'M')+x(i)+' '+y(v)+' ';const c=shape('circle',{cx:x(i),cy:y(v),r:2.8,fill:'#006c69'});const tip=document.createElementNS(ns,'title');tip.textContent=periods[i]+' · '+fmt(v);c.append(tip)});shape('path',{d:path,fill:'none',stroke:'#006c69','stroke-width':2});
  chartTickIndices(periods.length,5).forEach(i=>shape('text',{x:x(i),y:200,'text-anchor':i===0?'start':i===periods.length-1?'end':'middle','font-size':11,fill:'currentColor'},periods[i]));
  g.append(svg,node('p','Пропусков внутри периода: '+(periods.length-rows.length)));
  chartTools(g,s.title,s.unit,periods,[{name:s.title,code:s.code||s.id,values}],{source:'Росстат',monthly,url:s.source});
  const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();
  for(const label of ['Период','Значение','Координаты ячейки','Примечание','Получено'])head.append(node('th',label));
  for(const period of [...periods].reverse()){const r=map.get(period),tr=body.insertRow();for(const v of [period,r?fmt(r.value):'Нет наблюдения',r?[s.sheet,r.row,r.column].join(' / '):'—',r?.note||'—',r?.seen||'—'])tr.insertCell().textContent=v}
  t.append(table);$('ind-export').disabled=false;$('ind-export').onclick=()=>csv('industrial-'+s.id+'.csv',[['Период','Показатель','Классификация','Код','Тип','Единица','Значение','Источник','Лист','Строка','Столбец','Примечание','Получено'],...rows.map(r=>[r.period,s.title,s.classification,s.code,s.kind,s.unit,r.value,s.source,s.sheet,r.row,r.column,r.note,r.seen])])
 }
 function comparable(s){
  // A common code prefix or identical unit is not enough to mix editions.
  return catalog.filter(t=>t.source===s.source&&t.sheet===s.sheet&&t.kind===s.kind&&t.unit===s.unit&&t.frequency===s.frequency&&t.classification===s.classification&&(t.territory||'Россия')===(s.territory||'Россия'));
 }
 function prepareCross(){
  const s=catalog.find(t=>t.id===picker.value),old=crossPeriod.value||new URLSearchParams(location.search).get('ind-cross-period');
  crossPeriod.replaceChildren();
  if(s){
   const periods=[...new Set(comparable(s).flatMap(t=>t.values.map(r=>r.period)))].sort().reverse();
   for(const p of periods)crossPeriod.add(new Option(p,p));
   if(periods.includes(old))crossPeriod.value=old;
  }
  drawCross();
 }
 function drawCross(){
  const s=catalog.find(t=>t.id===picker.value),host=$('ind-cross');host.replaceChildren();$('ind-cross-export').disabled=true;
  if(!s||!crossPeriod.value){host.append(node('p','Нет сопоставимых наблюдений'));return}
  const period=crossPeriod.value,q=crossQ.value.trim().toLowerCase().replaceAll('ё','е');
  const rows=comparable(s).map(t=>({t,r:t.values.find(r=>r.period===period)})).filter(({t,r})=>r&&[t.title,t.code].join(' ').toLowerCase().replaceAll('ё','е').includes(q));
  rows.sort((a,b)=>crossSort.value==='code'?a.t.code.localeCompare(b.t.code,'ru')||a.t.title.localeCompare(b.t.title,'ru'):crossSort.value==='asc'?a.r.value-b.r.value:b.r.value-a.r.value);
  host.append(node('p','Позиций в срезе: '+rows.length+' · '+period+' · '+s.kind+' · '+s.unit),a('Общий источник',s.source));
  const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();
  for(const l of ['Код','Название','Значение','Ячейка источника'])head.append(node('th',l));
  for(const {t,r} of rows){const tr=body.insertRow();tr.insertCell().textContent=t.code||'—';const name=node('button',t.title);name.type='button';name.onclick=()=>{if([...picker.options].some(o=>o.value===t.id)){picker.value=t.id;draw()}};tr.insertCell().append(name);tr.insertCell().textContent=fmt(r.value);tr.insertCell().textContent=[t.sheet,r.row,r.column].join(' / ')}
  host.append(table);$('ind-cross-export').disabled=!rows.length;
  $('ind-cross-export').onclick=()=>csv('industrial-cross-'+s.id+'-'+period+'.csv',[['Период','Код','Название','Показатель','Классификатор','Единица','Значение','Источник','Лист','Строка','Столбец','Получено'],...rows.map(({t,r})=>[period,t.code,t.title,t.kind,t.classification,t.unit,r.value,t.source,t.sheet,r.row,r.column,r.seen])]);
  save(['ind-cross-period','ind-cross-q','ind-cross-sort']);
 }
 crossPeriod.onchange=crossQ.oninput=crossSort.onchange=drawCross;
 $('ind-kind').onchange=$('ind-q').oninput=()=>{options();draw()};picker.onchange=$('ind-from').oninput=$('ind-to').oninput=draw;$('ind-form').onsubmit=e=>e.preventDefault();$('ind-form').onreset=()=>setTimeout(()=>{options();draw()},0);draw()
 }catch(e){console.error(e);status.textContent='Набор недоступен в выбранной версии. Откройте текущую сборку.'}
});