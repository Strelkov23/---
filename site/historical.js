document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 if(!$('hist-form'))return;
 const a=(t,u)=>{const e=node('a',t);e.href=u;e.target='_blank';e.rel='noopener noreferrer';return e};
 const metrics=$('hist-metrics'),status=$('hist-status'),picker=$('hist-series'),region=$('hist-region');
 const peer=$('hist-peer'),mode=$('hist-mode'),rankYear=$('hist-rank-year');
 const fields=['hist-search','hist-series','hist-region','hist-peer','hist-mode','hist-from','hist-to','hist-rank-year','hist-rank-search','hist-rank-sort'];let selected=null,generation=0;
 function metric(t,n){const x=node('div','');x.className='metric';x.append(node('b',fmt(n)),node('span',t));metrics.append(x)}
 try{
  if(!version){const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}
  const data=await load('historical.json'),catalog=data.series;
  metric('исторических рядов',catalog.length);metric('наблюдений',catalog.reduce((n,s)=>n+s.count,0));metric('обнаруженных официальных файлов',data.sources.reduce((n,s)=>n+s.files.length,0));
  for(const s of data.sources){
   const e=node('article','');e.append(node('h3',s.title),a('Открыть первоисточник',s.url),node('p',s.status+' · '+(s.checked||'не проверено')));
   if(s.files.length){const details=node('details','');details.append(node('summary','Файлы ('+s.files.length+')'));const list=node('ul','');for(const f of s.files){const li=node('li','');li.append(a(f.title+' ['+f.format.toUpperCase()+']',f.url));list.append(li)}details.append(list);e.append(details)}
   $('hist-sources').append(e)
  }
  function options(){
   const q=$('hist-search').value.toLowerCase().trim(),old=picker.value;picker.replaceChildren();
   for(const s of catalog.filter(s=>[s.title,s.unit,s.kind].join(' ').toLowerCase().includes(q)))picker.add(new Option(s.title+' · '+s.unit+' · '+s.kind,s.code));
   if([...picker.options].some(o=>o.value===old))picker.value=old
  }
  const saved=new URLSearchParams(location.search);$('hist-search').value=saved.get('hist-search')||'';options();restore(fields.filter(f=>!['hist-region','hist-peer','hist-rank-year'].includes(f)));
  async function select(){
   const prior=[region.value,peer.value,rankYear.value];const id=++generation,meta=catalog.find(x=>x.code===picker.value);selected=null;
   $('hist-passport').replaceChildren();$('hist-graph').replaceChildren();$('hist-table').replaceChildren();$('hist-export').disabled=true;region.replaceChildren();peer.replaceChildren(new Option('Без сравнения',''));rankYear.replaceChildren();$('hist-rank').replaceChildren();$('hist-rank-export').disabled=true;
   if(!meta){status.textContent='Нет загруженных рядов по выборке. Проверьте реестр официальных файлов ниже.';return}
   status.textContent='Загрузка ряда…';
   try{
    const s=await load(meta.file);if(id!==generation)return;selected={...s,code:meta.code};
    for(const r of [...new Set(s.values.map(r=>r.region))].sort((a,b)=>a.localeCompare(b,'ru'))){region.add(new Option(r,r));peer.add(new Option(r,r))}
    for(const y of [...new Set(s.values.map(r=>r.year))].sort((a,b)=>b-a))rankYear.add(new Option(String(y),String(y)));
    for(const [j,e] of [region,peer,rankYear].entries()){const preferred=prior[j]||saved.get(e.id);if([...e.options].some(o=>o.value===preferred))e.value=preferred}
    draw();ranking()
   }catch(e){if(id===generation)status.textContent='Не удалось загрузить файл ряда для данной версии. Откройте текущую сборку.'}
  }
  function draw(){
   if(!selected)return;
   const s=selected,start=Number($('hist-from').value),end=Number($('hist-to').value);
   const names=[region.value,...(peer.value&&peer.value!==region.value?[peer.value]:[])];
   const graph=$('hist-graph'),host=$('hist-table');graph.replaceChildren();host.replaceChildren();$('hist-export').disabled=true;
   $('hist-passport').replaceChildren(node('h2',s.title),node('p',names.join(' / ')+' · '+s.unit+' · '+s.kind),a('Файл источника',s.source),node('p','Границы территорий и методология соответствуют источнику; пропуски не заполняются.'));
   if(s.kind.includes('Если быть точным'))$('hist-passport').append(a('Описание и лицензия CC BY 4.0',data.mirror));
   const emiss=s.code.match(/^E_(\d+)_/);if(emiss)$('hist-passport').append(document.createTextNode(' · '),a('Первичный паспорт ЕМИСС','https://fedstat.ru/indicator/'+emiss[1]),document.createTextNode(' · '),a('Карточка и лицензия НЦСЭД','https://repository.nsedc.ru/dataset/emiss_'+emiss[1]));
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<1990||end>2029||start>end){status.textContent='Укажите корректный период 1990–2029';return}
   const rows=s.values.filter(r=>names.includes(r.region)&&r.year>=start&&r.year<=end);
   if(!rows.length){status.textContent='Нет наблюдений за выбранный период';return}
   const maps=names.map(n=>new Map(rows.filter(r=>r.region===n).map(r=>[r.year,r])));
   const first=Math.min(...rows.map(r=>r.year)),last=Math.max(...rows.map(r=>r.year));
   const years=Array.from({length:last-first+1},(_,i)=>first+i);
   const common=years.filter(y=>maps.every(m=>m.has(y))),base=common.find(y=>maps.every(m=>m.get(y).value>0));
   const indexed=mode.value==='base';
   if(indexed&&base===undefined){status.textContent='Нет общего года с положительной базой. Выберите исходные значения.';return}
   const unit=indexed?'индекс, '+base+' = 100':s.unit;
   if(indexed)$('hist-passport').append(node('p','Формула: X(t) / X('+base+') × 100. Общий положительный базовый год. Индексация номинальных величин не устраняет инфляцию.'));
   const series=maps.map((m,j)=>({name:names[j],code:s.code,values:years.map(y=>m.has(y)?indexed?m.get(y).value/m.get(base).value*100:m.get(y).value:null)}));
   status.textContent='Наблюдений: '+rows.length+' · совместных лет: '+common.length;save(fields);
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 240');svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label',s.title+' — '+unit);
   const shape=(tag,attrs,t)=>{const x=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);if(t!==undefined)x.textContent=t;svg.append(x);return x};
   const vals=series.flatMap(t=>t.values.filter(Number.isFinite)),min=Math.min(...vals),max=Math.max(...vals),x=i=>90+580*i/Math.max(1,years.length-1),y=v=>max===min?105:175-150*(v-min)/(max-min);
   for(let i=0;i<5;i++){const v=min+(max-min)*i/4;shape('line',{x1:90,x2:670,y1:y(v),y2:y(v),stroke:'#b9c8c8'});if(i===0||max!==min)shape('text',{x:85,y:y(v)+4,'text-anchor':'end','font-size':11,fill:'currentColor'},fmt(v))}
   series.forEach((t,j)=>{const color=j?'#a24724':'#006c69';let path='';t.values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(t.values[i-1])?'L':'M')+x(i)+' '+y(v)+' ';const c=shape('circle',{cx:x(i),cy:y(v),r:3,fill:color});const tip=document.createElementNS(ns,'title');tip.textContent=t.name+' · '+years[i]+' · '+fmt(v);c.append(tip)});shape('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':j?'7 4':'none'});shape('text',{x:90,y:217+j*15,fill:color,'font-size':12},t.name)});
   years.forEach((v,i)=>{if(i===0||i===years.length-1||i%Math.ceil(years.length/5)===0)shape('text',{x:x(i),y:195,'text-anchor':'middle','font-size':11,fill:'currentColor'},v)});
   graph.append(svg);chartTools(graph,s.title,unit,years,series,{source:s.kind,territory:'Сравнение территорий',url:s.source});
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const label of ['Год',...names.map(n=>n+' · '+unit),...(names.length===2?['Разность A − B (исходная единица)']:[])])h.append(node('th',label));
   for(let i=years.length-1;i>=0;i--){const tr=b.insertRow(),a=maps[0].get(years[i]),brow=maps[1]?.get(years[i]);for(const v of [years[i],...series.map(t=>Number.isFinite(t.values[i])?fmt(t.values[i]):'—'),...(names.length===2?[a&&brow?fmt(a.value-brow.value):'—']:[])])tr.insertCell().textContent=v}
   host.append(t);
   const detail=node('details',''),raw=node('table',''),head=raw.createTHead().insertRow(),body=raw.createTBody();detail.append(node('summary','Исходные наблюдения и координаты источника'),raw);
   for(const label of ['Территория','Год','Значение','Примечание','Лист / строка / столбец','Получено'])head.append(node('th',label));
   for(const r of rows){const tr=body.insertRow();for(const v of [r.region,r.year,fmt(r.value),r.note||'—',[r.sheet,r.row,r.column].filter(x=>x!=null).join(' / '),r.seen])tr.insertCell().textContent=v}host.append(detail);
   $('hist-export').disabled=false;$('hist-export').onclick=()=>csv('regional-'+s.code+'.csv',[['Территория','Год','Показатель','Значение','Единица','Источник','Обработка','Лист','Строка','Столбец','Примечание','Получено','Индекс (если выбран режим)','Базовый год'],...rows.map(r=>[r.region,r.year,s.title,r.value,s.unit,s.source,s.kind,r.sheet,r.row,r.column,r.note,r.seen,indexed?r.value/maps[names.indexOf(r.region)].get(base).value*100:'',indexed?base:''])])
  }
  function ranking(){
   if(!selected)return;
   const s=selected,year=Number(rankYear.value),q=$('hist-rank-search').value.trim().toLowerCase(),sort=$('hist-rank-sort').value;
   const rows=s.values.filter(r=>r.year===year&&r.region.toLowerCase().includes(q));
   rows.sort((a,b)=>sort==='name'?a.region.localeCompare(b.region,'ru'):sort==='asc'?a.value-b.value:b.value-a.value);
   const t=node('table',''),head=t.createTHead().insertRow(),body=t.createTBody();
   for(const l of ['Территория',s.unit,'Примечание'])head.append(node('th',l));
   for(const r of rows){const tr=body.insertRow();tr.insertCell().textContent=r.region;tr.insertCell().textContent=fmt(r.value);const cell=tr.insertCell(),d=node('details','');d.append(node('summary','Источник / сноски'),node('p',r.note||'—'));cell.append(d)}
   $('hist-rank').replaceChildren(node('p','Территорий в срезе: '+rows.length+' · '+year),t);
   $('hist-rank-export').disabled=!rows.length;$('hist-rank-export').onclick=()=>csv('regional-cross-section-'+s.code+'-'+year+'.csv',[['Территория','Год','Показатель','Значение','Единица','Источник','Лист','Строка','Столбец','Примечание'],...rows.map(r=>[r.region,r.year,s.title,r.value,s.unit,s.source,r.sheet,r.row,r.column,r.note])]);save(fields)
  }
  $('hist-search').oninput=()=>{options();select()};picker.onchange=select;region.onchange=draw;peer.onchange=draw;mode.onchange=draw;rankYear.onchange=ranking;$('hist-rank-search').oninput=ranking;$('hist-rank-sort').onchange=ranking;$('hist-from').oninput=draw;$('hist-to').oninput=draw;$('hist-form').onsubmit=e=>e.preventDefault();select()
 }catch(e){console.error(e);status.textContent='Исторический каталог не доступен в этой версии. Откройте текущую сборку.'}
});
