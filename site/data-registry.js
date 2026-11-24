/* Local deterministic search; no network service other than the published JSON. */
const DataRegistry=(()=>{
 const normalize=v=>String(v??'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
 const text=r=>normalize([r.title,r.code,r.unit,r.territory,r.classification,r.source,r.note,r.group,r.method_definition,r.measurement_kind].join(' '));
 function filter(rows,p,selected){
  const words=normalize(p.q).split(/\s+/).filter(Boolean);
  return rows.filter(r=>(!p.group||r.group===p.group)&&(!p.mode||r.mode===p.mode)&&(!p.methodLevel||r.method_level===p.methodLevel)&&(!p.exactId||r.id===p.exactId)&&(!p.availability||(p.availability==='present'?r.count>0:r.count===0))&&(!p.onlySelected||selected.has(r.id))&&words.every(w=>text(r).includes(w)));
 }
 function observations(r,d){
  const row=(period,value,source,territory=r.territory,seen=null,note='',low=null,high=null)=>({id:r.id,title:r.title,kind:r.group==='forecast'?'Расчётная экстраполяция':r.measurement_kind==='Цель, не фактическое наблюдение'?'Цель':'Наблюдение',method_version:r.method_version,method_level:r.method_level,measurement_kind:r.measurement_kind,method_formula:r.method_formula,method_caution:r.method_caution,method_url:r.method_url,method_anchor:r.method_anchor,provider_metadata_seen:r.provider_metadata_seen,provider_definition:r.provider_definition,provider_organization:r.provider_organization,period:String(period),territory,unit:r.unit,value,low,high,source:source||r.source,seen,note});
  let result;
  if(r.group==='wdi')result=Object.entries(d[r.code].values).map(([period,value])=>row(period,value,r.source));
  else if(['national','cbr'].includes(r.group))result=d[r.code].values.map(v=>row(v.period||v.date,v.value,v.source,r.territory,v.seen));
  else if(r.group==='regional')result=d.values.map(v=>row(v.year,v.value,r.source,v.region,v.seen,[v.note,v.sheet?'Лист '+v.sheet:'',v.row?'Строка '+v.row:'',v.column?'Столбец '+v.column:''].filter(Boolean).join('; ')));
  else if(r.group==='industry'){const s=d.series.find(x=>x.id===r.code);if(!s)throw Error('Промышленный ряд не найден');result=s.values.map(v=>row(v.period,v.value,s.source,r.territory,v.seen,[v.note,s.sheet?'Лист '+s.sheet:'',v.row?'Строка '+v.row:'',v.column?'Столбец '+v.column:''].filter(Boolean).join('; ')))}
  else if(['capital','capacity'].includes(r.group)){const field=r.code.slice(r.code.lastIndexOf('.')+1),code=r.code.slice(0,r.code.lastIndexOf('.'));result=d[r.group==='capital'?'assets':'capacity'].filter(v=>v.code===code).map(v=>row(v.year,v[field],v.source,r.territory,null,[v.tables||v.table,v.pages||v.page,v.coverage,v.note].filter(Boolean).join('; ')))}
  else if(r.group==='forecast'){const s=d.series.find(x=>x.code===r.code);if(!s)throw Error('Прогнозный ряд не найден');result=s.results.map(v=>row(v.target,v.point,s.source,r.territory,null,'Последний факт: '+s.last+'; горизонт: '+v.horizon+'; метод: '+v.selected+'; границы описательные',v.low,v.high))}
  else throw Error('Неизвестный тип ряда');
  result=result.filter(v=>typeof v.value==='number'&&Number.isFinite(v.value));
  if(result.length!==r.count)throw Error('Версия набора не совпадает с каталогом: '+r.title+'. Обновите страницу.');
  return result;
 }
 return {normalize,filter,observations};
})();
if(typeof module!=='undefined')module.exports=DataRegistry;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('registry-form'))return;
 const labels={wdi:'Международная статистика России (WDI)',national:'Российские макроэкономические данные',cbr:'Банк России: дополнительные ряды',regional:'Региональные и исторические ряды',industry:'Промышленная статистика',capital:'Основные фонды',capacity:'Загрузка мощностей',forecast:'Прогнозные расчёты'};
 const modes={auto:'Автоматический сборщик',manual:'Ручной снимок',derived:'Расчётный ряд'};
 const key='economic-registry-selection-v1';let saved=new Set(),storage=true;
 try{const v=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(v))saved=new Set(v.filter(x=>typeof x==='string'))}catch(e){storage=false}
 function persist(){try{localStorage.setItem(key,JSON.stringify([...saved]))}catch(e){storage=false}}
 const fmt=v=>v===null||v===undefined||v===''?'—':String(v);
 let exactId=new URLSearchParams(location.search).get('id')||'';
 const p=()=>({exactId,methodLevel:$('registry-method-level').value,q:$('registry-q').value,group:$('registry-group').value,mode:$('registry-mode').value,availability:$('registry-availability').value,onlySelected:$('registry-selected').checked});
 try{
  const data=await load('data-registry.json'),rows=data.rows,ids=new Set(rows.map(r=>r.id));saved=new Set([...saved].filter(x=>ids.has(x)));
  const group=$('registry-group');group.add(new Option('Все наборы',''));for(const [k,n] of Object.entries(data.groups))group.add(new Option((labels[k]||k)+' ('+n+')',k));
  const list=$('registry-list'),size=20;let index=0,filtered=[],exporting=false;
  const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;return a};
  const line=(label,value)=>{const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';p.append(b,fmt(value));return p};
  function selectedStatus(){$('registry-save-status').textContent='Сохранено рядов: '+saved.size+(storage?' · локально в браузере':' · только в текущей вкладке');$('registry-export-selected').disabled=!saved.size;$('registry-clear').disabled=!saved.size;$('registry-values').disabled=exporting||!saved.size||saved.size>20}
  function download(name,items){const fields=['id','group','code','title','unit','frequency','territory','count','first','last','source','checked','success','status','mode','page','file','note','classification','method_version','method_level','measurement_kind','method_definition','method_formula','method_caution','method_url','method_anchor','provider_definition','provider_organization','provider_metadata_seen'];csv(name,[['Сборка каталога',data.built],fields,...items.map(r=>fields.map(k=>r[k]))])}
  function draw(){
   filtered=DataRegistry.filter(rows,p(),saved);const pages=Math.max(1,Math.ceil(filtered.length/size));index=Math.min(index,pages-1);
   list.replaceChildren();
   for(const r of filtered.slice(index*size,(index+1)*size)){
    const article=document.createElement('article'),title=document.createElement('h3');title.textContent=r.title;article.append(title);
    article.append(line('Набор',labels[r.group]||r.group),line('Код',r.code),line('Единицы и частота',r.unit+' · '+r.frequency),line('Охват',r.territory+' · '+r.count+' записей · '+fmt(r.first)+' — '+fmt(r.last)),line('Режим',modes[r.mode]),line('Последнее успешное получение / проверка источника',r.success),line('Последняя попытка',r.checked),line('Статус',r.status));
    if(r.note)article.append(line('Описание',r.note));
    const method=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Методика и ограничения';method.append(summary,line('Тип показателя',r.measurement_kind),line('Уровень описания',({explained:'Локальное пояснение; не полная верификация методики',source:'Требуется изучить методику первоисточника',calculated:'Расчёт сайта'})[r.method_level]),line('Определение',r.method_definition),line('Формула или способ получения',r.method_formula),line('Сопоставимость',r.method_caution),line('Версия паспорта',r.method_version),link('Метаданные источника',r.method_url),' · ',link('Методология сайта',r.method_anchor));if(r.group==='wdi'){method.append(line('Статус метаданных WDI',r.provider_metadata_status),line('Дата получения определения',r.provider_metadata_seen));if(r.provider_definition)method.append(line('Оригинальное определение WDI (EN)',r.provider_definition));if(r.provider_organization)method.append(line('Поставщик данных (EN)',r.provider_organization))}article.append(method);
    const actions=document.createElement('div');actions.className='registry-actions';actions.append(link('Открыть раздел',r.page),link('Файл данных',r.file),link('Первоисточник',r.source));
    const button=document.createElement('button');button.type='button';button.textContent=saved.has(r.id)?'Убрать из сохранённых':'Сохранить ряд';button.setAttribute('aria-pressed',String(saved.has(r.id)));button.onclick=()=>{if(saved.has(r.id))saved.delete(r.id);else saved.add(r.id);persist();if(p().onlySelected)draw();else{button.textContent=saved.has(r.id)?'Убрать из сохранённых':'Сохранить ряд';button.setAttribute('aria-pressed',String(saved.has(r.id)));selectedStatus()}};
    actions.append(button);article.append(actions);list.append(article);
   }
   $('registry-status').textContent='Найдено: '+filtered.length+' из '+rows.length+' · сборка '+data.built;
   $('registry-page').textContent='Страница '+(index+1)+' из '+pages;$('registry-prev').disabled=index===0;$('registry-next').disabled=index>=pages-1;$('registry-export').disabled=!filtered.length;selectedStatus();
  }
  $('registry-values').onclick=async()=>{
   const selection=rows.filter(r=>saved.has(r.id)),status=$('registry-values-status');
   if(!selection.length||selection.length>20)return;
   if(selection.reduce((n,r)=>n+r.count,0)>50000){status.textContent='Более 50 000 строк. Уменьшите подборку.';return}
   exporting=true;selectedStatus();status.textContent='Загрузка выбранных наборов…';
   try{
    const cache=new Map(),values=[];
    for(const r of selection){
     const path=['capital','capacity'].includes(r.group)?'capital-data.json':r.file;
     if(!cache.has(path))cache.set(path,await load(path));
     values.push(...DataRegistry.observations(r,cache.get(path)));
    }
    if(!values.length){status.textContent='В выбранных рядах нет наблюдений.';return}
    const fields=['id','title','kind','period','territory','unit','value','low','high','source','seen','note','method_version','method_level','measurement_kind','method_formula','method_caution','method_url','method_anchor','provider_definition','provider_organization','provider_metadata_seen'];
    csv('data-registry-observations.csv',[fields,...values.map(v=>fields.map(k=>v[k]))]);
    status.textContent='Выгружено строк: '+values.length+'; рядов в подборке: '+selection.length+'.';
   }catch(e){status.textContent='Выгрузка остановлена: '+e.message;console.error(e)}
   finally{exporting=false;selectedStatus()}
  };
  $('registry-form').addEventListener('input',()=>{exactId='';index=0;draw()});$('registry-form').addEventListener('submit',e=>e.preventDefault());$('registry-reset').onclick=()=>{$('registry-form').reset();exactId='';index=0;draw()};
  $('registry-prev').onclick=()=>{index--;draw()};$('registry-next').onclick=()=>{index++;draw()};$('registry-export').onclick=()=>download('data-registry-filtered.csv',filtered);$('registry-export-selected').onclick=()=>download('data-registry-selection.csv',rows.filter(r=>saved.has(r.id)));$('registry-clear').onclick=()=>{saved.clear();persist();draw()};
  draw();
 }catch(e){console.error(e);$('registry-status').textContent='Каталог недоступен. Откройте полный CSV или раздел источников.'}
});
