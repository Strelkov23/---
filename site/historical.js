document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 if(!$('hist-form'))return;
 const a=(t,u)=>{const e=node('a',t);e.href=u;e.target='_blank';e.rel='noopener noreferrer';return e};
 const metrics=$('hist-metrics'),status=$('hist-status'),picker=$('hist-series'),region=$('hist-region');
 const fields=['hist-search','hist-series','hist-region','hist-from','hist-to'];let selected=null,generation=0;
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
  const saved=new URLSearchParams(location.search);$('hist-search').value=saved.get('hist-search')||'';options();restore(fields.filter(f=>f!=='hist-region'));
  async function select(){
   const id=++generation,meta=catalog.find(x=>x.code===picker.value);selected=null;
   $('hist-passport').replaceChildren();$('hist-graph').replaceChildren();$('hist-table').replaceChildren();$('hist-export').disabled=true;region.replaceChildren();
   if(!meta){status.textContent='Нет загруженных рядов по выборке. Проверьте реестр официальных файлов ниже.';return}
   status.textContent='Загрузка ряда…';
   try{
    const s=await load(meta.file);if(id!==generation)return;selected={...s,code:meta.code};
    for(const r of [...new Set(s.values.map(r=>r.region))].sort((a,b)=>a.localeCompare(b,'ru')))region.add(new Option(r,r));
    const preferred=saved.get('hist-region');if([...region.options].some(o=>o.value===preferred))region.value=preferred;
    draw()
   }catch(e){if(id===generation)status.textContent='Не удалось загрузить файл ряда для данной версии. Откройте текущую сборку.'}
  }
  function draw(){
   if(!selected)return;
   const s=selected,start=Number($('hist-from').value),end=Number($('hist-to').value),rows=s.values.filter(r=>r.region===region.value&&r.year>=start&&r.year<=end).sort((a,b)=>a.year-b.year);
   $('hist-passport').replaceChildren(node('h2',s.title),node('p',region.value+' · '+s.unit+' · '+s.kind),a('Файл источника',s.source),node('p','Границы территорий и методология соответствуют источнику; пропуски не заполняются.'));
   if(s.kind.includes('Если быть точным'))$('hist-passport').append(a('Описание и лицензия CC BY 4.0',data.mirror));
   const graph=$('hist-graph'),host=$('hist-table');graph.replaceChildren();host.replaceChildren();$('hist-export').disabled=!rows.length;
   status.textContent='Наблюдений: '+rows.length;save(fields);if(!rows.length)return;
   const years=Array.from({length:rows.at(-1).year-rows[0].year+1},(_,i)=>rows[0].year+i),map=new Map(rows.map(r=>[r.year,r.value])),values=years.map(y=>map.get(y)??null);
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 220');svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label',s.title);
   const shape=(tag,attrs,t)=>{const x=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);if(t!==undefined)x.textContent=t;svg.append(x);return x};
   const min=Math.min(...rows.map(r=>r.value)),max=Math.max(...rows.map(r=>r.value)),x=i=>90+580*i/Math.max(1,years.length-1),y=v=>max===min?105:175-150*(v-min)/(max-min);
   for(let i=0;i<5;i++){const v=min+(max-min)*i/4;shape('line',{x1:90,x2:670,y1:y(v),y2:y(v),stroke:'#b9c8c8'});if(i===0||max!==min)shape('text',{x:85,y:y(v)+4,'text-anchor':'end','font-size':11,fill:'currentColor'},fmt(v))}
   let path='';values.forEach((v,i)=>{if(v===null)return;path+=(i&&values[i-1]!==null?'L':'M')+x(i)+' '+y(v)+' ';const c=shape('circle',{cx:x(i),cy:y(v),r:3,fill:'#006c69'});const t=document.createElementNS(ns,'title');t.textContent=years[i]+' · '+fmt(v);c.append(t)});shape('path',{d:path,fill:'none',stroke:'#006c69','stroke-width':2});years.forEach((v,i)=>{if(i===0||i===years.length-1||i%Math.ceil(years.length/5)===0)shape('text',{x:x(i),y:200,'text-anchor':'middle','font-size':11,fill:'currentColor'},v)});
   graph.append(svg);chartTools(graph,s.title+' — '+region.value,s.unit,years,[{name:region.value,code:s.code,values}],{source:s.kind,territory:region.value});
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const label of ['Год','Значение','Примечание','Лист / строка / столбец','Получено'])h.append(node('th',label));
   for(const r of [...rows].reverse()){const tr=b.insertRow();for(const v of [r.year,fmt(r.value),r.note||'—',[r.sheet,r.row,r.column].filter(x=>x!=null).join(' / '),r.seen])tr.insertCell().textContent=v}host.append(t);
   $('hist-export').onclick=()=>csv('regional-'+s.code+'.csv',[['Территория','Год','Показатель','Значение','Единица','Источник','Обработка','Лист','Строка','Столбец','Примечание','Получено'],...rows.map(r=>[r.region,r.year,s.title,r.value,s.unit,s.source,s.kind,r.sheet,r.row,r.column,r.note,r.seen])])
  }
  $('hist-search').oninput=()=>{options();select()};picker.onchange=select;region.onchange=draw;$('hist-from').oninput=draw;$('hist-to').oninput=draw;$('hist-form').onsubmit=e=>e.preventDefault();select()
 }catch(e){console.error(e);status.textContent='Исторический каталог не доступен в этой версии. Откройте текущую сборку.'}
});
