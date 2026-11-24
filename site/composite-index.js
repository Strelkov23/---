/* Explicit user-defined composite, not an official economic indicator. */
const CompositeIndex=(()=>{
 const B=typeof module!=='undefined'?require('./index-builder.js'):IndexBuilder;
 function calculate(components,p){
  if(!Array.isArray(components)||components.length<2||components.length>4||new Set(components.map(c=>c.id)).size!==components.length)throw Error('Нужны 2–4 разных ряда');
  if(!['arithmetic','geometric'].includes(p.method))throw Error('Неизвестная агрегация');
  if(components.some(c=>!Number.isFinite(c.weight)||c.weight<=0||c.weight>1000||!['direct','inverse'].includes(c.direction)))throw Error('Вес каждой компоненты должен быть положительным (до 1000); задайте направление');
  const parsed=components.map(c=>({...c,...B.prepare(c.observations,p.territory)})),f=parsed[0].frequency;
  if(parsed.some(c=>c.frequency!==f))throw Error('Нельзя объединять годовые и месячные ряды');
  const b=B.timeKey(p.base);if(!b||b.frequency!==f||parsed.some(c=>!(c.index.get(b.key)>0)))throw Error('Нужен общий базовый период с положительными значениями всех компонент');
  const sum=components.reduce((n,c)=>n+c.weight,0),weights=components.map(c=>c.weight/sum);
  const start=Math.max(...parsed.map(c=>c.keys[0])),end=Math.min(...parsed.map(c=>c.keys.at(-1)));
  if(end<start||end-start>2400)throw Error('Нет допустимого общего интервала');
  const rows=[];
  for(let t=start;t<=end;t++){
   const raw=parsed.map(c=>c.index.get(t)??null);
   const indices=raw.map((x,i)=>{
    if(x===null||x<0||parsed[i].direction==='inverse'&&x===0)return null;
    const ref=parsed[i].index.get(b.key),v=100*(parsed[i].direction==='direct'?x/ref:ref/x);
    return Number.isFinite(v)?v:null;
   });
   const complete=indices.every(Number.isFinite),arith=complete?indices.reduce((s,v,i)=>s+weights[i]*v,0):null;
   const geometric=complete&&indices.every(v=>v>0)?Math.exp(indices.reduce((s,v,i)=>s+weights[i]*Math.log(v),0)):null;
   const equal=complete?indices.reduce((s,v)=>s+v,0)/indices.length:null;
   const chosen=p.method==='arithmetic'?arith:geometric;
   const period=f==='annual'?String(t):String(Math.floor(t/12)).padStart(4,'0')+'-'+String(t%12+1).padStart(2,'0');
   rows.push({period,raw,indices,arithmetic:arith,geometric,equal_arithmetic:equal,selected:chosen,status:!complete?'Пропуск или недопустимая компонента':chosen===null?'Геометрический индекс требует положительных компонент':'Рассчитано'});
  }
  return {method:p.method,frequency:f,weights,rows,formula:'Iᵢ=100×xᵢ(t)/xᵢ(base) или 100×xᵢ(base)/xᵢ(t); wᵢ=weightᵢ/Σweight; A=ΣwᵢIᵢ; G=exp(Σwᵢ ln Iᵢ)',note:'Авторский относительный индекс, не официальный показатель, не оценка благосостояния. Направления, веса и выбор базы субъективны. Равновзвешенное арифметическое среднее — отдельный сравнительный сценарий.'};
 }
 return {calculate};
})();
if(typeof module!=='undefined')module.exports=CompositeIndex;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('composite-form'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:8}):'—';
 const path=r=>['capital','capacity'].includes(r.group)?'capital-data.json':r.file;
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>tr.insertCell().textContent=String(v))}host.replaceChildren(t)};
 let token=0;
 const clear=()=>{token++;$('composite-result').replaceChildren();$('composite-chart').replaceChildren();$('composite-csv').disabled=true;$('composite-json').disabled=true;$('composite-status').textContent='Параметры изменены. Выполните расчёт.'};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),registry=await Provenance.get(manifest,'data-registry.json',root);
  const rows=registry.data.rows.filter(r=>r.count>0&&!['forecast','cbr','regional'].includes(r.group)&&r.measurement_kind!=='Цель, не фактическое наблюдение');
  const byId=new Map(rows.map(r=>[r.id,r])),components=$('composite-components'),controls=[];
  for(let i=0;i<4;i++){
   const section=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Компонента '+(i+1);section.append(legend);
   const q=document.createElement('input'),s=document.createElement('select'),w=document.createElement('input'),d=document.createElement('select'),note=document.createElement('p');
   q.type='search';q.placeholder='Название или код';w.type='number';w.min='0.000001';w.max='1000';w.step='any';w.value='1';d.add(new Option('Прямое: рост увеличивает индекс','direct'));d.add(new Option('Обратное: рост уменьшает индекс','inverse'));
   for(const [label,input] of [['Поиск ряда',q],['Ряд',s],['Вес',w],['Направление',d]]){const l=document.createElement('label');l.className='builder-control';l.append(label,input);section.append(l)}section.append(note);components.append(section);
   const options=()=>{const old=s.value,words=DataRegistry.normalize(q.value).split(/\s+/).filter(Boolean),found=rows.filter(r=>words.every(word=>DataRegistry.normalize(r.title+' '+r.code+' '+r.unit).includes(word)));s.replaceChildren(new Option('Не выбрано',''),...found.map(r=>new Option(r.title+' · '+r.unit+' · '+r.code,r.id)));if(found.some(r=>r.id===old))s.value=old;show()};
   const show=()=>{const r=byId.get(s.value);note.replaceChildren();if(r){note.append(r.method_definition+' · '+r.method_caution+' ');const a=document.createElement('a');a.href='data-registry.html?id='+encodeURIComponent(r.id)+(pinned?'&snapshot='+pinned:'');a.textContent='Паспорт';note.append(a)}};
   q.addEventListener('input',options);s.addEventListener('change',show);controls.push({s,w,d});options();
  }
  $('composite-form').addEventListener('input',clear);
  $('composite-form').addEventListener('submit',async e=>{
   e.preventDefault();clear();const run=token;
   try{
    if(!$('composite-confirm').checked)throw Error('Подтвердите выбор смыслов и весов');
    const selected=controls.filter(c=>c.s.value).map(c=>({r:byId.get(c.s.value),weight:c.w.valueAsNumber,direction:c.d.value})),p={base:$('composite-base').value.trim(),territory:'Россия',method:$('composite-method').value};
    if(selected.length<2||new Set(selected.map(x=>x.r.id)).size!==selected.length)throw Error('Выберите от двух до четырёх разных рядов');
    $('composite-status').textContent='Проверка файлов…';
    const cache=new Map(),data=[];
    for(const c of selected){const file=path(c.r);if(!cache.has(file))cache.set(file,await Provenance.get(manifest,file,root));if(run!==token)return;const v=cache.get(file);data.push({id:c.r.id,weight:c.weight,direction:c.direction,observations:DataRegistry.observations(c.r,v.data),source_file:file,sha256:v.sha256,passport:c.r})}
    const r=CompositeIndex.calculate(data,p);if(run!==token)return;
    const good=r.rows.filter(x=>x.selected!==null).length;
    $('composite-status').textContent='Рассчитано '+good+' из '+r.rows.length+' периодов. Веса после нормирования: '+r.weights.map(x=>fmt(100*x)+'%').join(' · ')+'.';
    const headers=['Период',...selected.map(c=>c.r.title+' (нормированный индекс)'),'Взвешенный арифметический','Взвешенный геометрический','Равновзвешенный арифметический','Статус'];
    table($('composite-result'),headers,r.rows.map(x=>[x.period,...x.indices.map(fmt),fmt(x.arithmetic),fmt(x.geometric),fmt(x.equal_arithmetic),x.status]));
    const chart=$('composite-chart'),series=[['arithmetic','Взвешенный арифметический'],['geometric','Взвешенный геометрический'],['equal_arithmetic','Равновзвешенный арифметический']].map(([code,name])=>({code,name,values:r.rows.map(x=>x[code])}));
    chartTools(chart,'Пользовательский составной индекс, база '+p.base,'индекс (база = 100)',r.rows.map(x=>x.period),series,{monthly:r.frequency==='monthly',source:'Пользовательские веса; '+r.formula+'; отпечаток '+manifest.data_fingerprint,url:'methodology.html#composite-index-method'});
    const report={schema:'1',method_version:'1.0',archive_revision:version||null,source_revision:manifest.source_revision,data_fingerprint:manifest.data_fingerprint,registry_sha256:registry.sha256,parameters:p,components:data.map(({observations,...c})=>c),...r};
    $('composite-json').disabled=false;$('composite-json').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='composite-index.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
    $('composite-csv').disabled=false;$('composite-csv').onclick=()=>csv('composite-index.csv',[['Методика',r.formula],['Ограничение',r.note],['База',p.base],['Метод',p.method],['Отпечаток',manifest.data_fingerprint],['Ряд','Вес','Нормированный вес','Направление','Единица','Источник','Хеш файла','Методика источника'],...data.map((c,i)=>[c.id,c.weight,r.weights[i],c.direction,c.passport.unit,c.passport.source,c.sha256,c.passport.method_formula]),[...headers,...data.map(c=>c.id+' исходное значение')],...r.rows.map(x=>[x.period,...x.indices,x.arithmetic,x.geometric,x.equal_arithmetic,x.status,...x.raw])]);
   }catch(err){if(run===token)$('composite-status').textContent='Расчёт остановлен: '+err.message}
  });
  clear();
 }catch(e){$('composite-status').textContent='Каталог не подтверждён: '+e.message}
});
