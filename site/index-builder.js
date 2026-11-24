/* Deterministic single-series transformations. No interpolation or silent annualization. */
const IndexBuilder=(()=>{
 const methods={
  delta:{label:'Абсолютное изменение к предыдущему периоду',formula:'x(t) − x(t−1)',note:'В исходных единицах; для величин, выраженных в процентах, численная разность в процентных пунктах.'},
  growth:{label:'Темп прироста к предыдущему периоду',formula:'100 × (x(t) / x(t−1) − 1)',note:'Только при положительной базе и неотрицательном текущем уровне. Не годовой темп для месячного ряда.'},
  yoy:{label:'Темп прироста к тому же месяцу прошлого года',formula:'100 × (x(t) / x(t−12) − 1)',note:'Только месячные уровни; положительная база, неотрицательное текущее значение. Не сезонная корректировка.'},
  base:{label:'Индекс к выбранному базовому периоду',formula:'100 × x(t) / x(base)',note:'База должна быть положительной; отрицательные уровни не индексируются. База = 100.'},
  mean:{label:'Скользящее среднее',formula:'Σ x(t−k) / N, k=0…N−1',note:'Равные веса, окно заканчивается текущим периодом. Все N последовательных наблюдений обязательны.'},
  level:{label:'Исходный уровень',formula:'x(t)',note:'Без преобразования.'}
 };
 function timeKey(p){
  const s=String(p);
  if(/^\d{4}$/.test(s))return {frequency:'annual',key:Number(s)};
  const m=s.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if(m)return {frequency:'monthly',key:Number(m[1])*12+Number(m[2])-1};
  return null;
 }
 const period=(key,f)=>f==='annual'?String(key):String(Math.floor(key/12)).padStart(4,'0')+'-'+String(key%12+1).padStart(2,'0');
 function prepare(observations,territory){
  const selected=observations.filter(r=>r.territory===territory);
  if(!selected.length)throw Error('Нет наблюдений по выбранной территории');
  const index=new Map();let frequency;
  for(const r of selected){
   const t=timeKey(r.period);
   if(!t||!Number.isFinite(r.value)||frequency&&frequency!==t.frequency)throw Error('Поддерживаются только однородные годовые или месячные периоды');
   frequency=t.frequency;
   if(index.has(t.key))throw Error('Повторяющийся период: '+r.period);
   if(r.kind!=='Наблюдение')throw Error('Цели и прогнозы нельзя использовать как фактические уровни');
   index.set(t.key,r.value);
  }
  const keys=[...index.keys()].sort((a,b)=>a-b);
  if(keys.at(-1)-keys[0]>2400)throw Error('Слишком длинный календарный интервал');
  return {frequency,index,keys};
 }
 function compute(observations,p){
  const method=methods[p.method];if(!method)throw Error('Неизвестная методика');
  const {frequency,index,keys}=prepare(observations,p.territory);
  if(p.method==='yoy'&&frequency!=='monthly')throw Error('Год к году в этом режиме доступен только для месячного ряда');
  const base=timeKey(p.base),n=Number(p.window);
  if(p.method==='base'&&(!base||base.frequency!==frequency||!(index.get(base.key)>0)))throw Error('Выберите существующий положительный базовый уровень');
  if(p.method==='mean'&&(!Number.isInteger(n)||n<2||n>24))throw Error('Окно: от 2 до 24 периодов');
  const rows=[];
  for(let t=keys[0];t<=keys.at(-1);t++){
   const x=index.get(t),prior=index.get(t-(p.method==='yoy'?12:1));
   let value=null,reference=null,status='Нет текущего наблюдения';
   if(Number.isFinite(x)){
    status='Рассчитано';
    if(p.method==='level')value=x;
    else if(p.method==='delta'||p.method==='growth'||p.method==='yoy'){
     reference=prior??null;
     if(!Number.isFinite(prior))status='Нет наблюдения за требуемый предыдущий период';
     else if(p.method==='delta')value=x-prior;
     else if(prior<=0||x<0)status='Недопустимая база или отрицательный уровень';
     else value=100*(x/prior-1);
    }else if(p.method==='base'){
     reference=index.get(base.key);
     if(x<0)status='Отрицательный уровень';else value=100*x/reference;
    }else{
     const window=Array.from({length:n},(_,i)=>index.get(t-i));
     if(window.some(v=>!Number.isFinite(v)))status='Неполное календарное окно';
     else value=window.reduce((a,v)=>a+v,0)/n;
    }
   }
   if(value!==null&&!Number.isFinite(value)){value=null;status='Численный выход за допустимый диапазон'}
   rows.push({period:period(t,frequency),input:x??null,reference,value,status});
  }
  return {frequency,rows,method:p.method,formula:method.formula,note:method.note};
 }
 return {methods,timeKey,prepare,compute};
})();
if(typeof module!=='undefined')module.exports=IndexBuilder;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('builder-form'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:9}):'—';
 const path=r=>['capital','capacity'].includes(r.group)?'capital-data.json':r.file;
 let selection=null,token=0;
 const clear=()=>{$('builder-table').replaceChildren();$('builder-chart').replaceChildren();$('builder-download').disabled=true;$('builder-json').disabled=true;$('builder-status').textContent='Параметры изменены. Выполните расчёт.'};
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();r.forEach(v=>tr.insertCell().textContent=String(v))}host.replaceChildren(t)};
 function downloadJSON(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='indicator-calculation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),registry=await Provenance.get(manifest,'data-registry.json',root);
  const eligible=registry.data.rows.filter(r=>r.count>0&&r.group!=='forecast'&&r.measurement_kind!=='Цель, не фактическое наблюдение'&&r.group!=='cbr');
  const byId=new Map(eligible.map(r=>[r.id,r])),select=$('builder-series'),method=$('builder-method');
  for(const [k,m] of Object.entries(IndexBuilder.methods))method.add(new Option(m.label,k));method.value='delta';
  function find(){
   const wanted=select.value||new URLSearchParams(location.search).get('id')||'wdi:NY.GDP.MKTP.KD';
   const words=DataRegistry.normalize($('builder-query').value).split(/\s+/).filter(Boolean),matches=eligible.filter(r=>words.every(w=>DataRegistry.normalize(r.title+' '+r.code+' '+r.unit).includes(w)));
   select.replaceChildren(...matches.map(r=>new Option(r.title+' · '+r.unit+' · '+r.code,r.id)));
   if(matches.some(r=>r.id===wanted))select.value=wanted;
   $('builder-count').textContent='Доступно рядов: '+matches.length+' из '+eligible.length;select.disabled=!matches.length;
   return matches;
  }
  function setMethod(){const m=IndexBuilder.methods[method.value];$('builder-formula').textContent=m.formula+' — '+m.note;$('builder-base').disabled=method.value!=='base';$('builder-window').disabled=method.value!=='mean'}
  function territories(){
   const list=[...new Set(selection.rows.map(r=>r.territory))].sort((a,b)=>a.localeCompare(b,'ru'));
   $('builder-territory').replaceChildren(...list.map(t=>new Option(t,t)));$('builder-territory').disabled=false;setPeriods();
  }
  function setPeriods(){
   const rows=selection.rows.filter(r=>r.territory===$('builder-territory').value),periods=rows.filter(r=>r.value>0&&IndexBuilder.timeKey(r.period)).map(r=>r.period).sort();
   $('builder-base').replaceChildren(...periods.map(t=>new Option(t,t)));setMethod();clear();
  }
  async function choose(){
   const current=++token,r=byId.get(select.value);selection=null;clear();$('builder-run').disabled=true;$('builder-territory').disabled=true;$('builder-passport').replaceChildren();$('builder-confirm').checked=false;
   if(!r)return;
   $('builder-status').textContent='Проверка исходного файла…';
   try{
    const verified=await Provenance.get(manifest,path(r),root);if(current!==token)return;
    const rows=DataRegistry.observations(r,verified.data);selection={r,rows,hash:verified.sha256};
    const host=$('builder-passport'),a=document.createElement('a');a.href='data-registry.html?id='+encodeURIComponent(r.id)+(pinned?'&snapshot='+pinned:'');a.textContent='Полный паспорт ряда';
    for(const [label,value] of [['Определение',r.method_definition],['Единица',r.unit],['Метод источника',r.method_formula],['Ограничение',r.method_caution]]){const p=document.createElement('p');p.textContent=label+': '+value;host.append(p)}host.append(a);territories();$('builder-run').disabled=false;
   }catch(e){if(current===token)$('builder-status').textContent='Ряд недоступен: '+e.message}
  }
  $('builder-query').addEventListener('input',()=>{find();choose()});select.addEventListener('change',choose);$('builder-territory').addEventListener('change',setPeriods);method.addEventListener('change',()=>{setMethod();clear()});
  for(const id of ['builder-base','builder-window','builder-confirm'])$(id).addEventListener('input',clear);
  $('builder-form').addEventListener('submit',e=>{
   e.preventDefault();clear();
   try{
    if(!selection)throw Error('Выберите исходный ряд');
    if(!$('builder-confirm').checked)throw Error('Подтвердите, что прочитали методику исходного ряда и проверили смысл преобразования');
    const p={method:method.value,territory:$('builder-territory').value,base:$('builder-base').value,window:$('builder-window').valueAsNumber},r=selection.r,result=IndexBuilder.compute(selection.rows,p);
    const unit=['growth','yoy'].includes(p.method)?'% прироста':p.method==='base'?'индекс (база = 100)':p.method==='delta'&&r.unit.startsWith('%')?'п.п. (разность процентных значений)':r.unit;
    const good=result.rows.filter(x=>x.value!==null).length;
    $('builder-status').textContent='Рассчитано '+good+' из '+result.rows.length+' календарных периодов · '+unit+'. Пропуски сохранены.';
    table($('builder-table'),['Период','Исходное значение ('+r.unit+')','Значение сравнения','Результат ('+unit+')','Статус'],result.rows.map(x=>[x.period,fmt(x.input),fmt(x.reference),fmt(x.value),x.status]));
    const chart=$('builder-chart'),series=[{name:IndexBuilder.methods[p.method].label,code:r.code+'_'+p.method,values:result.rows.map(x=>x.value)}],years=result.rows.map(x=>x.period);
    const values=series[0].values.filter(Number.isFinite);
    if(values.length){
     const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 260');svg.setAttribute('role','img');svg.setAttribute('aria-label',r.title+' — '+IndexBuilder.methods[p.method].label);
     const shape=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text!==undefined)node.textContent=text;svg.append(node);return node};
     let lo=Math.min(...values),hi=Math.max(...values);if(lo===hi){lo-=Math.max(1,Math.abs(lo)*.05);hi+=Math.max(1,Math.abs(hi)*.05)}
     const xx=i=>110+565*i/Math.max(1,years.length-1),yy=v=>210-170*(v-lo)/(hi-lo);
     for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;shape('line',{x1:110,x2:675,y1:yy(v),y2:yy(v),stroke:'#d4dcdf'});shape('text',{x:103,y:yy(v)+4,'text-anchor':'end','font-size':11},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
     chartTickIndices(years.length,6).forEach(i=>shape('text',{x:xx(i),y:238,'text-anchor':'middle','font-size':10},years[i]));
     let d='';series[0].values.forEach((v,i)=>{if(Number.isFinite(v)){d+=(i&&Number.isFinite(series[0].values[i-1])?'L':'M')+xx(i)+' '+yy(v)+' ';shape('circle',{cx:xx(i),cy:yy(v),r:2.5,fill:'#006c69'})}});shape('path',{d,stroke:'#006c69','stroke-width':2,fill:'none'});chart.append(svg);
     chartTools(chart,r.title+' — '+series[0].name,unit,years,series,{monthly:result.frequency==='monthly',territory:p.territory,source:r.source+' · '+result.formula+' · SHA-256 '+selection.hash,url:r.method_url});
    }
    const report={schema:'1',method_version:'1.0',source_revision:manifest.source_revision,data_fingerprint:manifest.data_fingerprint,archive_revision:version||null,source_file:path(r),source_sha256:selection.hash,registry_sha256:registry.sha256,passport:r,parameters:p,result_unit:unit,...result};
    $('builder-json').disabled=false;$('builder-json').onclick=()=>downloadJSON(report);
    $('builder-download').disabled=false;$('builder-download').onclick=()=>csv('indicator-calculation.csv',[['Показатель',r.title],['Территория',p.territory],['Формула',result.formula],['Ограничения',result.note],['Метод исходного ряда',r.method_formula],['Ограничения источника',r.method_caution],['Источник',r.source],['Метаданные',r.method_url],['Методика конструктора','1.0'],['База',p.base],['Окно',p.window],['Отпечаток',manifest.data_fingerprint],['SHA-256 исходного файла',selection.hash],['Ревизия кода',manifest.source_revision],['Период','Исходное значение ('+r.unit+')','Значение сравнения','Результат ('+unit+')','Статус'],...result.rows.map(x=>[x.period,x.input,x.reference,x.value,x.status])]);
   }catch(err){$('builder-status').textContent='Расчёт остановлен: '+err.message}
  });
  find();setMethod();choose();
 }catch(e){$('builder-status').textContent='Каталог не подтверждён: '+e.message}
});
