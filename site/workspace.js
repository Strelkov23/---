/* Browser-local page bookmarks and opt-in history; no queries or snapshot identifiers stored. */
const Workspace=(()=>{
 const KEY='economic-workspace-v1',LIMIT=100,HISTORY=30,MAX_BYTES=100000;
 const blank=()=>({schema:1,bookmarks:[],history:[],track:false});
 function route(value){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.html$/.test(value)?value:null}
 function entry(r){if(!r||!route(r.route)||typeof r.title!=='string'||!r.title.trim()||r.title.length>200||typeof r.date!=='string'||!Number.isFinite(Date.parse(r.date)))throw Error('Некорректная запись');return {route:r.route,title:r.title,date:r.date}}
 function list(rows,limit){if(!Array.isArray(rows)||rows.length>limit)throw Error('Некорректный список');const seen=new Set();return rows.map(entry).filter(r=>{if(seen.has(r.route))throw Error('Повтор страницы');seen.add(r.route);return true})}
 function parse(raw){if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Недопустимый размер');const d=JSON.parse(raw);if(!d||d.schema!==1||typeof d.track!=='boolean')throw Error('Несовместимый формат');return {schema:1,bookmarks:list(d.bookmarks,LIMIT),history:list(d.history,HISTORY),track:d.track}}
 function merge(old,added){const incoming=list(added,LIMIT),map=new Map(list(old,LIMIT).map(r=>[r.route,r]));for(const r of incoming)if(!map.has(r.route))map.set(r.route,r);if(map.size>LIMIT)throw Error('Не более '+LIMIT+' закладок');return [...map.values()]}
 function toggle(s,r){r=entry(r);return {...s,bookmarks:s.bookmarks.some(x=>x.route===r.route)?s.bookmarks.filter(x=>x.route!==r.route):merge(s.bookmarks,[r])}}
 function visit(s,r){if(!s.track)return s;r=entry(r);return {...s,history:[r,...s.history.filter(x=>x.route!==r.route)].slice(0,HISTORY)}}
 function importBookmarks(raw){if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Недопустимый размер');const d=JSON.parse(raw);if(!d||d.schema!==1||d.type!=='economic-bookmarks')throw Error('Несовместимый формат закладок');return list(d.bookmarks,LIMIT)}
 return {KEY,LIMIT,HISTORY,MAX_BYTES,blank,route,parse,merge,toggle,visit,importBookmarks}
})();
if(typeof module!=='undefined')module.exports=Workspace;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const W=Workspace,$=id=>document.getElementById(id),button=$('v-bookmark-toggle'),panel=$('v-workspace');if(!button)return;
 const route=W.route(location.pathname.split('/').at(-1)||'index.html');if(!route)return;
 let state=W.blank(),locked=false;const title=(document.querySelector('main h1')?.textContent||document.title).trim().slice(0,200)||route;
 const current=()=>({route,title,date:new Date().toISOString()});
 const status=(s)=>{const el=$('v-workspace-status')||$('v-bookmark-status');if(el)el.textContent=s};
 function read(){return W.parse(localStorage.getItem(W.KEY)||JSON.stringify(W.blank()))}
 function save(next){const validated=W.parse(JSON.stringify(next));localStorage.setItem(W.KEY,JSON.stringify(validated));state=validated}
 try{state=read();if(state.track)save(W.visit(state,current()))}catch(e){locked=true;status('Локальные данные недоступны или повреждены. Старые записи не изменены.')}
 function change(fn){if(locked)return false;try{state=read();save(fn(state));draw();return true}catch(e){draw();status('Изменение не сохранено: '+e.message);return false}}
 function draw(){
  const marked=state.bookmarks.some(r=>r.route===route);button.hidden=false;button.disabled=locked;button.textContent=marked?'Убрать закладку':'В закладки';button.setAttribute('aria-pressed',String(marked));
  if(!panel)return;
  $('v-track-history').checked=state.track;$('v-track-history').disabled=locked;
  for(const id of ['v-clear-history','v-clear-bookmarks','v-bookmark-export','v-bookmark-import'])$(id).disabled=locked;
  function renderList(id,rows,removable){const host=$(id);host.replaceChildren();if(!rows.length){const p=document.createElement('li');p.textContent='Пока нет записей.';host.append(p);return}for(const r of rows){const item=document.createElement('li'),a=document.createElement('a'),date=document.createElement('small');a.href=r.route;a.textContent=r.title;date.textContent=' · '+r.date.slice(0,10);item.append(a,date);if(removable){const b=document.createElement('button');b.type='button';b.textContent='Удалить';b.disabled=locked;b.setAttribute('aria-label','Удалить закладку: '+r.title);b.onclick=()=>change(s=>({...s,bookmarks:s.bookmarks.filter(x=>x.route!==r.route)}));item.append(b)}host.append(item)}}
  renderList('v-bookmarks',state.bookmarks,true);renderList('v-history',state.history,false);
 }
 button.onclick=()=>{if(change(s=>W.toggle(s,current())))status('Закладки: '+state.bookmarks.length)};
 if(panel){
  $('v-track-history').onchange=()=>{const track=$('v-track-history').checked;if(change(s=>({...s,track})))status(track?'История включена. Записываются только посещённые страницы без запросов.':'История выключена. Существующие записи можно очистить отдельно.')};
  $('v-clear-history').onclick=()=>change(s=>({...s,history:[]}));
  $('v-clear-bookmarks').onclick=()=>{if(window.confirm('Удалить все закладки этого браузера?'))change(s=>({...s,bookmarks:[]}))};
  $('v-bookmark-export').onclick=()=>{try{state=read();const blob=new Blob([JSON.stringify({schema:1,type:'economic-bookmarks',bookmarks:state.bookmarks},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='economic-bookmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Файл закладок подготовлен. История не включена.')}catch(e){status('Экспорт не выполнен: '+e.message)}};
  $('v-bookmark-import').onchange=async()=>{const input=$('v-bookmark-import'),file=input.files?.[0];try{if(!file)return;if(file.size>W.MAX_BYTES)throw Error('Файл слишком большой');const added=W.importBookmarks(await file.text());if(change(s=>({...s,bookmarks:W.merge(s.bookmarks,added)})))status('Закладки объединены без удаления существующих.');}catch(e){status('Импорт не выполнен: '+e.message)}finally{input.value=''}};
 }
 window.addEventListener('storage',e=>{if(e.key===W.KEY&&!locked){try{state=read();draw()}catch(err){locked=true;draw();status('Локальные записи недоступны.')}}});draw()
});
