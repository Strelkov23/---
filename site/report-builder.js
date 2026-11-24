/* Deterministic descriptive report; never invent missing periods or causes. */
const ReportBuilder=(()=>{
 const B=typeof module!=='undefined'?require('./index-builder.js'):IndexBuilder;
 function period(t,f){return f==='annual'?String(t):String(Math.floor(t/12)).padStart(4,'0')+'-'+String(t%12+1).padStart(2,'0')}
 function describe(observations,p){
  const a=B.timeKey(p.start),b=B.timeKey(p.end);
  if(!a||!b||a.frequency!==b.frequency||a.key>b.key||b.key-a.key>2400)throw Error('Недопустимый календарный интервал');
  const s=B.prepare(observations,p.territory);
  if(s.frequency!==a.frequency)throw Error('Частота ряда отличается от выбранного периода');
  const rows=[];for(let t=a.key;t<=b.key;t++)rows.push({period:period(t,s.frequency),value:s.index.get(t)??null});
  // Changes are computed strictly inside the requested window.
  for(let i=0;i<rows.length;i++){
   const r=rows[i],previous=i?rows[i-1].value:null;
   r.change=previous!==null&&r.value!==null?r.value-previous:null;
   r.growth=previous>0&&r.value!==null&&r.value>=0?100*(r.value/previous-1):null;
   if(!Number.isFinite(r.change))r.change=null;
   if(!Number.isFinite(r.growth))r.growth=null;
  }
  const actual=rows.filter(x=>x.value!==null),first=rows[0].value,last=rows.at(-1).value;
  const delta=first!==null&&last!==null?last-first:null;
  const growth=first>0&&last!==null&&last>=0?100*(last/first-1):null;
  const safe=x=>Number.isFinite(x)?x:null;
  return {rows,observed:actual.length,expected:rows.length,coverage:100*actual.length/rows.length,first_observed:actual[0]?.period??null,last_observed:actual.at(-1)?.period??null,first,last,delta:safe(delta),growth:safe(growth),min:actual.length?Math.min(...actual.map(x=>x.value)):null,max:actual.length?Math.max(...actual.map(x=>x.value)):null};
 }
 function bibliography(items){
  if(!Array.isArray(items))return [];
  const seen=new Set(),out=[];
  for(const x of items.slice(0,500)){
   if(!x||typeof x.title!=='string'||typeof x.url!=='string'||!/^https?:\/\//i.test(x.url)||seen.has(x.url))continue;
   seen.add(x.url);const field=k=>typeof x[k]==='string'?x[k].slice(0,2000):'';
   out.push({title:field('title'),authors:field('authors'),source:field('source'),date:field('date'),type:field('type'),url:field('url')});
   if(out.length===50)break;
  }return out;
 }
 return {describe,bibliography};
})();
if(typeof module!=='undefined')module.exports=ReportBuilder;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('report-form'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:9}):'—';
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
 const link=(label,url)=>{const a=node('a',label);if(/^https?:\/\//i.test(url||'')){a.href=url;a.rel='noopener noreferrer'}return a};
 const path=r=>['capital','capacity'].includes(r.group)?'capital-data.json':r.file;
 const table=(headers,rows)=>{const wrapper=node('div'),t=node('table'),h=t.createTHead().insertRow(),b=t.createTBody();wrapper.className='table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Исходные наблюдения');for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>tr.insertCell().textContent=String(v))}wrapper.append(t);return wrapper};
 const getLocal=k=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return []}};
 let token=0,selected=new Set(),report=null;
 const clear=()=>{token++;report=null;$('report-preview').replaceChildren();for(const id of ['report-html','report-json','report-print','report-csv'])$(id).disabled=true;$('report-status').textContent='Параметры изменены. Сформируйте доклад.'};
 function download(name,content,type){const u=URL.createObjectURL(new Blob([content],{type})),a=node('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}
 function graph(s){
  const vals=s.summary.rows.map(x=>x.value),finite=vals.filter(Number.isFinite);
  if(!finite.length)return node('p','График недоступен: нет наблюдений.');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 260');svg.setAttribute('role','img');svg.setAttribute('aria-label',s.passport.title+' — '+s.territory);
  const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e)};
  let lo=Math.min(...finite),hi=Math.max(...finite);if(lo===hi){const pad=Math.max(1,Math.abs(lo)*.01);lo-=pad;hi+=pad}
  const xx=i=>vals.length===1?390:115+560*i/(vals.length-1),yy=v=>210-175*(v-lo)/(hi-lo);
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;shape('line',{x1:115,x2:675,y1:yy(v),y2:yy(v),stroke:'#cbd5df'});shape('text',{x:105,y:yy(v)+4,'text-anchor':'end','font-size':11},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
  chartTickIndices(vals.length,6).forEach(i=>shape('text',{x:xx(i),y:236,'text-anchor':'middle','font-size':10},s.summary.rows[i].period));
  let d='';vals.forEach((v,i)=>{if(Number.isFinite(v)){d+=(i&&Number.isFinite(vals[i-1])?'L':'M')+xx(i)+' '+yy(v)+' ';shape('circle',{cx:xx(i),cy:yy(v),r:2.5,fill:'#006c69'})}});shape('path',{d,stroke:'#006c69','stroke-width':2,fill:'none'});return svg;
 }
 function render(r){
  const h=$('report-preview');h.replaceChildren(node('h1',r.title),node('p','Период: '+r.start+' — '+r.end+' · Сформировано UTC: '+r.generated),node('p','Автоматический описательный доклад. Не причинная оценка, не прогноз, не научная рецензия.'),node('h2','1. Методика и происхождение'),node('p','Методика доклада 1.0: покрытие = 100 × число имеющихся наблюдений / число календарных периодов; изменение = значение конца − значение начала; прирост = 100 × (конец / начало − 1), если начало положительно и конец неотрицателен. Минимум и максимум — только среди имеющихся наблюдений. Если границы отсутствуют, изменение не вычисляется. Изменение к предыдущему периоду рассчитывается только по соседним календарным периодам внутри интервала; первая строка без сравнения. Пропуски не заполняются. Разность процентных величин — в процентных пунктах. Причины динамики автоматически не определяются.'),node('p','Отпечаток данных: '+r.data_fingerprint),node('p','Архивная ревизия (если доступна): '+(r.archive_revision||'не определена')+' · Ревизия сборки набора: '+(r.source_revision||'не определена')));
  h.append(node('h2','2. Сводка покрытия и статистические разделы'),node('p','Сводка показывает полноту, а не качество или экономическую значимость. Показатели не суммируются и не ранжируются по их величине.'));
  const coverage=table(['Показатель','Единица','Имеется / ожидается','Покрытие, %','Первый факт в интервале','Последний факт в интервале','Есть обе границы'],r.series.map(s=>[s.passport.title,s.passport.unit,s.summary.observed+' / '+s.summary.expected,fmt(s.summary.coverage),s.summary.first_observed??'—',s.summary.last_observed??'—',s.summary.first!==null&&s.summary.last!==null?'Да':'Нет']));
  coverage.id='report-coverage';h.append(coverage);
  for(const [i,s] of r.series.entries()){
   const d=s.summary,p=s.passport,section=node('section');section.className='report-series';
   section.append(node('h3',(i+1)+'. '+p.title),node('p','Территория: '+s.territory+' · Единица: '+p.unit+' · Тип: '+p.measurement_kind),node('p','Определение: '+p.method_definition),node('p','Способ получения: '+p.method_formula),node('p','Ограничения источника: '+p.method_caution),node('p','Статус источника: '+p.status+' · Успешное получение: '+(p.success||'не указано')),node('p','Наблюдений: '+d.observed+' из '+d.expected+' ('+fmt(d.coverage)+'%).'),node('p','Начало: '+fmt(d.first)+'; конец: '+fmt(d.last)+'; изменение: '+fmt(d.delta)+' '+(p.unit.startsWith('%')?'п.п.':p.unit)+'; относительный прирост: '+fmt(d.growth)+(d.growth===null?' (не определён)':'%')+'. Минимум: '+fmt(d.min)+'; максимум: '+fmt(d.max)+'.'));
   if(d.growth!==null)section.append(node('p','Прирост относится к опубликованному показателю, не обязательно к реальному выпуску; для ставок и индексов интерпретировать с осторожностью.'));
   section.append(graph(s),table(['Период','Значение ('+p.unit+')','Изменение к предыдущему периоду ('+(p.unit.startsWith('%')?'п.п.':p.unit)+')','Прирост к предыдущему периоду, %'],d.rows.map(x=>[x.period,fmt(x.value),fmt(x.change),fmt(x.growth)])));
   const source=node('p','Источник: ');source.append(link(p.source,p.source),document.createTextNode(' · '),link('Метаданные',p.method_url));section.append(source,node('p','Файл: '+s.file+' · SHA-256: '+s.sha256+' · Паспорт '+p.method_version));
   h.append(section);
  }
  h.append(node('h2','3. Интерпретация исследователя'),node('p',r.note||'Не заполнено. Автоматический доклад не устанавливает причины и не формулирует политические рекомендации.'),node('h2','4. Библиографическая подборка'));
  const list=node('ol');for(const x of r.bibliography){const li=node('li');li.append(node('span',[x.authors,x.title,x.source,x.date].filter(Boolean).join('. ')+'. '),link(x.url,x.url));list.append(li)}h.append(list);if(!r.bibliography.length)h.append(node('p','Материалы не добавлены.'));else h.append(node('p','Материалы из локальной подборки пользователя; их содержание и связь с выводами не проверены автоматически.'));
 }
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),registry=await Provenance.get(manifest,'data-registry.json',root);
  const eligible=registry.data.rows.filter(r=>r.count>0&&!['forecast','cbr'].includes(r.group)&&r.measurement_kind!=='Цель, не фактическое наблюдение'),byId=new Map(eligible.map(r=>[r.id,r]));
  const select=$('report-series'),items=$('report-selection');
  function search(){const words=DataRegistry.normalize($('report-query').value).split(/\s+/).filter(Boolean),found=eligible.filter(r=>words.every(w=>DataRegistry.normalize(r.title+' '+r.code).includes(w)));select.replaceChildren(...found.slice(0,200).map(r=>new Option(r.title+' · '+r.code,r.id)));$('report-count').textContent='Найдено '+found.length+'; показаны первые '+Math.min(found.length,200)+'.';$('report-add').disabled=!found.length||selected.size>=8}
  function show(){items.replaceChildren();for(const id of selected){const r=byId.get(id),row=node('div'),title=node('span',r.title+' · '+r.unit),btn=node('button','Убрать');btn.type='button';btn.onclick=()=>{selected.delete(id);show();clear()};row.append(title,btn);items.append(row)}$('report-add').disabled=!select.options.length||selected.size>=8;$('report-run').disabled=!selected.size}
  $('report-query').addEventListener('input',search);$('report-add').onclick=()=>{if(byId.has(select.value)&&selected.size<8){selected.add(select.value);show();clear()}};
  $('report-saved').onclick=()=>{const saved=getLocal('economic-registry-selection-v1');if(Array.isArray(saved))for(const id of saved)if(byId.has(id)&&selected.size<8)selected.add(id);show();clear();$('report-status').textContent='Выбрано '+selected.size+' из максимум 8. Неподдерживаемые ряды пропущены.'};
  for(const id of ['report-title','report-start','report-end','report-territory','report-note','report-bibliography','report-confirm'])$(id).addEventListener('input',clear);
  $('report-form').addEventListener('submit',async e=>{
   e.preventDefault();clear();const run=token;
   try{
    if(!$('report-confirm').checked)throw Error('Подтвердите проверку смысла и сопоставимости показателей');
    const start=$('report-start').value.trim(),end=$('report-end').value.trim(),territory=$('report-territory').value.trim(),title=$('report-title').value.trim();
    const a=IndexBuilder.timeKey(start),b=IndexBuilder.timeKey(end);if(!title||!territory||!a||!b||a.frequency!==b.frequency||a.key>b.key||b.key-a.key>2400)throw Error('Проверьте название, территорию и календарные границы');
    const ids=[...selected];if(!ids.length)throw Error('Добавьте показатели');
    const cache=new Map(),series=[];
    $('report-status').textContent='Проверка файлов и расчёт…';
    for(const id of ids){const p=byId.get(id),file=path(p);if(!cache.has(file))cache.set(file,await Provenance.get(manifest,file,root));if(run!==token)return;const v=cache.get(file);
     try{const observations=DataRegistry.observations(p,v.data);series.push({passport:p,file,sha256:v.sha256,territory,summary:ReportBuilder.describe(observations,{start,end,territory})})}catch(err){throw Error(p.title+': '+err.message)}
    }
    if(run!==token)return;
    report={schema:1,method_version:'1.0',title,start,end,territory,generated:new Date().toISOString(),data_fingerprint:manifest.data_fingerprint,archive_revision:version||null,source_revision:manifest.source_revision,registry_sha256:registry.sha256,series,note:$('report-note').value,bibliography:$('report-bibliography').checked?ReportBuilder.bibliography(getLocal('economics-research-collection-v1')):[]};
    render(report);$('report-status').textContent='Доклад сформирован: '+series.length+' разделов. Проверьте интерпретацию и источники.';
    for(const id of ['report-html','report-json','report-print','report-csv'])$(id).disabled=false;
   }catch(err){if(run===token)$('report-status').textContent='Доклад не сформирован: '+err.message}
  });
  $('report-json').onclick=()=>{if(report)download('economic-report.json',JSON.stringify(report,null,2),'application/json')};
  $('report-csv').onclick=()=>{if(report)csv('economic-report-observations.csv',[['ID','Показатель','Территория','Единица','Период','Значение','Изменение к предыдущему периоду','Единица изменения','Прирост к предыдущему периоду, %','Источник','Методика источника','SHA-256','Отпечаток'],...report.series.flatMap(s=>s.summary.rows.map(x=>[s.passport.id,s.passport.title,s.territory,s.passport.unit,x.period,x.value,x.change,s.passport.unit.startsWith('%')?'п.п.':s.passport.unit,x.growth,s.passport.source,s.passport.method_formula,s.sha256,report.data_fingerprint]))])};
  $('report-html').onclick=()=>{if(report){const doc=document.implementation.createHTMLDocument(report.title);const meta=doc.createElement('meta');meta.charset='utf-8';doc.head.prepend(meta);const style=doc.createElement('style');style.textContent='body{font-family:system-ui,sans-serif;max-width:950px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#152a36}p{overflow-wrap:anywhere;white-space:pre-wrap}svg{width:100%;height:auto;max-width:750px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5df;padding:.4rem;text-align:left}section{margin:2rem 0}a{overflow-wrap:anywhere}@media print{body{max-width:none;margin:0}tr{break-inside:avoid}h2,h3{break-after:avoid}}';doc.head.append(style);doc.body.append(doc.importNode($('report-preview'),true));download('economic-report.html','<!doctype html>\n'+doc.documentElement.outerHTML,'text/html;charset=utf-8')}};
  $('report-print').onclick=()=>{if(report)window.print()};
  search();show();clear();
 }catch(e){$('report-status').textContent='Каталог не подтверждён: '+e.message}
});
