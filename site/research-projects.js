/* Local, bounded and independently portable research projects.
   No server requests or changes to the existing collection without a user action. */
const ResearchProjects=(()=>{
 const KEY='economics-research-projects-v1',BASKET='economics-research-collection-v1',LIMIT=50,ITEM_LIMIT=3000,MAX_BYTES=8_000_000;
 const text=(v,n=2000)=>typeof v==='string'?v.slice(0,n):'';
 const fields=['title','date','type','source','topics','authors','doi','issn','volume','issue','pages','article_number','metadata_checked','archive_revision'];
 function item(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректный источник');
  let u;try{u=new URL(raw.url)}catch{throw Error('Некорректная ссылка')}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>4096)throw Error('Недопустимая ссылка');
  if(['doi.org','dx.doi.org'].includes(u.hostname.toLowerCase())){
   let d;try{d=decodeURIComponent(u.pathname.slice(1)).toLowerCase()}catch{throw Error('Некорректный DOI')}
   if(!/^10\.\d{4,9}\/\S+$/.test(d))throw Error('Некорректный DOI');
   u=new URL('https://doi.org/'+d.split('/').map(encodeURIComponent).join('/'));
  }
  const x={url:u.href};for(const k of fields)x[k]=text(raw[k],k==='title'?4000:2000);
  if(!x.title.trim())throw Error('Отсутствует название');
  return x
 }
 function merge(existing,incoming){
  const map=new Map();
  for(const raw of [...existing,...incoming]){
   const x=item(raw),old=map.get(x.url);
   if(old){for(const k of fields)if(x[k])old[k]=x[k]}
   else map.set(x.url,x);
   if(map.size>ITEM_LIMIT)throw Error('Лимит источников проекта: '+ITEM_LIMIT)
  }
  return [...map.values()]
 }
 function validProject(raw){
  if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(raw.id)||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>160||typeof raw.note!=='string'||raw.note.length>20000||!Array.isArray(raw.items)||raw.items.length>ITEM_LIMIT)throw Error('Некорректный проект');
  return {id:raw.id,title:raw.title.trim(),note:raw.note,items:merge([],raw.items)}
 }
 function validate(raw){
  if(!raw||raw.schema!==1||!Array.isArray(raw.projects)||raw.projects.length>LIMIT)throw Error('Некорректная схема проектов');
  const projects=raw.projects.map(validProject);
  if(new Set(projects.map(p=>p.id)).size!==projects.length)throw Error('Повтор идентификатора проекта');
  return {schema:1,projects}
 }
 function parse(s){if(typeof s!=='string'||new TextEncoder().encode(s).length>MAX_BYTES)throw Error('Файл слишком большой');return validate(JSON.parse(s))}
 function encode(raw){const s=JSON.stringify(validate(raw));if(new TextEncoder().encode(s).length>MAX_BYTES)throw Error('Превышен объём хранилища');return s}
 function importCopy(current,incoming,idFactory){
  const projects=[...validate(current).projects],used=new Set(projects.map(p=>p.id));
  for(const p of validate(incoming).projects){
   const id=idFactory();if(used.has(id))throw Error('Повтор идентификатора');used.add(id);projects.push({...p,id})
  }
  return validate({schema:1,projects})
 }
 function reference(x,i){return (i+1)+'. '+[x.authors,x.title].filter(Boolean).join('. ')+' // '+[x.source,x.date,x.volume&&'Т. '+x.volume,x.issue&&'№ '+x.issue,x.pages&&'С. '+x.pages,x.article_number&&'Статья '+x.article_number].filter(Boolean).join('. — ')+'. — URL: '+x.url}
 return {KEY,BASKET,LIMIT,ITEM_LIMIT,MAX_BYTES,item,merge,validate,parse,encode,importCopy,reference}
})();
if(typeof module!=='undefined')module.exports=ResearchProjects;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const P=ResearchProjects,$=id=>document.getElementById(id);if(!$('rp-select'))return;
 let state={schema:1,projects:[]},selected='',locked=false;
 const status=s=>$('rp-status').textContent=s;
 const get=()=>state.projects.find(p=>p.id===selected);
 const uid=()=>globalThis.crypto.randomUUID();
 function download(name,s,type){const u=URL.createObjectURL(new Blob([s],{type})),a=node('a','');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}
 function persist(next){const encoded=P.encode(next);localStorage.setItem(P.KEY,encoded);state=P.parse(encoded)}
 function change(action){try{if(locked)throw Error('Хранилище недоступно или повреждено; старые данные не перезаписаны');action()}catch(e){status('Не сохранено: '+e.message)}}
 try{state=P.parse(localStorage.getItem(P.KEY)||'{"schema":1,"projects":[]}')}catch(e){locked=true;status('Не удалось прочитать проекты. Старые данные не перезаписаны.')}
 function draw(){
  const p=get(),list=$('rp-select');list.replaceChildren(new Option('Новый проект',''));for(const x of state.projects)list.add(new Option(x.title,x.id));list.value=selected;
  $('rp-title').value=p?.title||'';$('rp-note').value=p?.note||'';
  for(const id of ['rp-save','rp-add','rp-delete'])$(id).disabled=locked||!p;
  for(const id of ['rp-csv','rp-txt','rp-to-basket'])$(id).disabled=!p?.items.length;
  $('rp-create').disabled=locked;$('rp-import').disabled=locked;$('rp-export').disabled=locked;
  $('rp-count').textContent=p?'Источников: '+p.items.length:'Выберите или создайте проект.';
  const host=$('rp-items');host.replaceChildren();if(!p?.items.length)return;
  const table=node('table',''),tr=table.createTHead().insertRow();for(const k of ['Источник','Авторы / дата','Библиографические сведения','Действие'])tr.append(node('th',k));
  const body=table.createTBody();p.items.forEach(x=>{
   const row=body.insertRow(),link=node('a',x.title);link.href=x.url;link.target='_blank';link.rel='noopener noreferrer';row.insertCell().append(link);
   row.insertCell().textContent=[x.authors,x.date].filter(Boolean).join(' · ');row.insertCell().textContent=[x.source,x.issn,x.volume,x.issue,x.pages||x.article_number].filter(Boolean).join(' · ');
   const btn=node('button','Удалить');btn.type='button';btn.disabled=locked;btn.setAttribute('aria-label','Удалить источник: '+x.title);btn.onclick=()=>change(()=>{update({...draft(),items:p.items.filter(z=>z.url!==x.url)});draw();status('Источник удалён')});row.insertCell().append(btn)
  });host.append(table)
 }
 function draft(){const p=get();return {...p,title:$('rp-title').value,note:$('rp-note').value}}
 function update(p){persist({schema:1,projects:state.projects.map(x=>x.id===p.id?p:x)})}
 function readBasket(){const raw=JSON.parse(localStorage.getItem(P.BASKET)||'[]');if(!Array.isArray(raw)||raw.length>P.ITEM_LIMIT)throw Error('Общая подборка превышает лимит или повреждена');return P.merge([],raw)}
 function dirty(){const p=get();return $('rp-title').value!==(p?.title||'')||$('rp-note').value!==(p?.note||'')}
 $('rp-select').onchange=()=>{if(dirty()&&!confirm('Переключить проект без сохранения изменений?')){$('rp-select').value=selected;return}selected=$('rp-select').value;draw();status('')};
 $('rp-create').onclick=()=>change(()=>{const title=$('rp-title').value.trim();if(!title)throw Error('Введите название');const id=uid();persist({schema:1,projects:[...state.projects,{id,title,note:$('rp-note').value,items:[]}]});selected=id;draw();status('Проект создан')});
 $('rp-save').onclick=()=>change(()=>{update(draft());draw();status('Изменения сохранены')});
 $('rp-add').onclick=()=>change(()=>{const items=P.merge(get().items,readBasket());update({...draft(),items});draw();status('Общая подборка добавлена, повторные ссылки объединены')});
 $('rp-delete').onclick=()=>change(()=>{if(!confirm('Удалить выбранный проект? Общая подборка останется без изменений.'))return;persist({schema:1,projects:state.projects.filter(x=>x.id!==selected)});selected='';draw();status('Проект удалён')});
 $('rp-to-basket').onclick=()=>change(()=>{const items=P.merge(readBasket(),get().items);localStorage.setItem(P.BASKET,JSON.stringify(items));status('Источники добавлены в общую подборку без удаления прежних')});
 $('rp-csv').onclick=()=>csv('research-project-bibliography.csv',[['Название проекта','Авторы','Название','Дата','Источник','ISSN','Том','Номер','Страницы','Номер статьи','DOI','URL','Редакция каталога'],...get().items.map(x=>[get().title,x.authors,x.title,x.date,x.source,x.issn,x.volume,x.issue,x.pages,x.article_number,x.doi,x.url,x.archive_revision])]);
 $('rp-txt').onclick=()=>download('research-project-references.txt','Рабочая библиография: '+get().title+'\n\n'+get().items.map(P.reference).join('\n'),'text/plain;charset=utf-8');
 $('rp-export').onclick=()=>change(()=>{if(dirty())throw Error('Сначала сохраните изменения');download('research-projects.json',P.encode(state),'application/json')});
 $('rp-import').onchange=async()=>{const input=$('rp-import'),file=input.files[0];if(!file)return;try{if(locked||file.size>P.MAX_BYTES)throw Error('Файл слишком большой или хранилище недоступно');if(dirty())throw Error('Сначала сохраните изменения');const incoming=P.parse(await file.text());persist(P.importCopy(state,incoming,uid));draw();status('Импортированы отдельные проекты: '+incoming.projects.length)}catch(e){status('Импорт отклонён: '+e.message)}finally{input.value=''}};
 draw()
});
