/* Read-only autonomous knowledge inventory; all source data stay in the published archive. */
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",async()=>{
 const $=id=>document.getElementById("eaim-"+id),host=$("summary");if(!host)return;
 const add=(parent,tag,text)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e};
 const link=(parent,label,href)=>{const a=add(parent,"a",label);a.href=href;return a};
 try{
  const manifest=await Provenance.validateManifest(await load("data-manifest.json"));
  const d=(await Provenance.get(manifest,"economic-ai-memory.json",root)).data;
  if(d.schema!==1||!d.latest||!Array.isArray(d.history)||!Array.isArray(d.backlog))throw Error("Schema");
  const x=d.latest;host.replaceChildren();
  add(host,"p","Сборка: "+d.built+" · файлов в памяти: "+Object.keys(d.files).length+" · сохранённых циклов: "+d.history.length);
  for(const [k,label] of [["series","Статистические ряды"],["news","Публикации и новости"],["papers","Научные работы"]]){
   const v=x.changes[k];add(host,"p",label+": "+v.total+" · "+(x.initial?"первичный снимок":("добавлено "+v.added+" · отсутствуют в новом снимке "+v.missing)));
  }
  add(host,"p","Изменены байты "+x.changed_files.length+" файлов; новых файлов "+x.new_files.length+". Это не число новых наблюдений.");
  add(host,"p","Изменения статистических наблюдений в журнале: "+Object.entries(x.observation_changes).map(([k,v])=>k+" "+v).join(" · "));
  const states={ok:"Успешная загрузка",cached:"Сохранённые данные",partial:"Частичный импорт",overdue:"Просрочено",waiting:"Ожидание",unavailable:"Недоступно",archive:"Архив"};
  add(host,"p",Object.entries(x.freshness).map(([k,v])=>(states[k]||k)+": "+v).join(" · "));
  add(host,"p","Очередь внимания: "+d.backlog.length+"; последние события импорта (ограниченный журнал): "+x.recent_import_events+", отклонено "+x.recent_rejected+".");
  const list=$("backlog");list.replaceChildren();for(const r of d.backlog.slice(0,20))add(list,"li",(r.title||r.id)+" — "+(states[r.state]||r.state)+" · "+(r.next_check||"срок не указан"));
  if(!d.backlog.length)add(list,"li","Нет записей в очереди.");
  const history=$("history");history.replaceChildren();for(const b of d.history.slice(0,14))add(history,"li",b.time+" · "+(b.initial?"первичный снимок":("новые записи: ряды "+b.changes.series.added+", новости "+b.changes.news.added+", статьи "+b.changes.papers.added)));
  $("status").textContent="Память сверена с SHA-256 манифеста. Источники обновляются существующими загрузчиками по расписанию.";
 }catch(e){$("status").textContent="Память недоступна или не прошла проверку целостности."}
});
