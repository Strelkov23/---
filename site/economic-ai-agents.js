/* Autonomous report: no model inference, all text rendered safely. */
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",async()=>{
 const $=id=>document.getElementById("eaia-"+id);if(!$("status"))return;
 const add=(p,t,v)=>{const e=document.createElement(t);e.textContent=v;p.append(e);return e};
 const labels={coverage:"Статистическое покрытие",discovery:"Поиск новых показателей",quality:"Контроль источников",research:"Научные публикации и новости",forecast:"Оценка прогнозов",search:"Охват поисковой системы"};
 const states={ok:"Отчёт сформирован",attention:"Требует внимания",waiting:"Ожидает данных"};
 try{const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-ai-agents.json",root)).data;
 if(d.schema!==1||!Array.isArray(d.agents))throw Error("Schema");
 $("status").textContent="Автоматический обзор · "+d.built+" · "+(d.mode==="scheduled_refresh"?"сборка с обновлением":"офлайн-сборка");
 for(const a of d.agents){const panel=add($("cards"),"article","");panel.className="ac-panel";add(panel,"h3",labels[a.id]||a.id);add(panel,"p",states[a.state]||a.state);const x=a.metrics;
 if(a.id==="coverage"){add(panel,"p","Рядов с данными: "+x.series_with_values+" · групп: "+Object.keys(x.groups).length);add(panel,"p","Новые ряды: "+x.catalogue_changes.added+" · отсутствуют в новом снимке: "+x.catalogue_changes.missing)}
 if(a.id==="discovery")add(panel,"p","Кандидатов: "+x.candidates+" · доступных: "+x.available+" · наблюдений: "+x.observations+" · сохранено после ошибок: "+x.cached_after_error);
 if(a.id==="quality"){add(panel,"p","В очереди контроля: "+x.backlog+" · отклонённых событий в журнале: "+x.recent_rejected);for(const r of a.items)add(panel,"p",(r.title||r.id)+" · "+r.state+" · "+(r.next_check||"срок не указан"))}
 if(a.id==="research"){add(panel,"p",(x.baseline_available?"Новых в архиве: ":"Первичный архив: ")+"новости "+(x.baseline_available?x.news.added:x.news.total)+", статьи "+(x.baseline_available?x.papers.added:x.papers.total));for(const r of a.items){const p=add(panel,"p",""),u=new URL(r.url);if(["https:","http:"].includes(u.protocol)&&!u.username&&!u.password){const l=add(p,"a",r.title);l.href=u.href;l.rel="noopener noreferrer"}add(p,"small"," · "+r.date+" · "+r.source)}}
 if(a.id==="forecast"){add(panel,"p","Зафиксировано: "+x.frozen+" · оценено: "+x.scored+" · групп с выборкой от 10: "+x.adequate_sample_groups);for(const r of a.items)add(panel,"p",r.code+" · горизонт "+r.horizon+" · MAE "+r.mae.toPrecision(4)+" / базовая "+r.naive_mae.toPrecision(4)+" "+r.unit+" · "+(r.action==="review_model"?"проверить алгоритм":"продолжать наблюдение"))}
 if(a.id==="search"){const names={tool:"Инструменты",series:"Статистические ряды",news:"Новости",paper:"Статьи",discovered:"Новые WDI-ряды",external:"arXiv",web:"FEDS"};add(panel,"p","Терминов в индексе: "+x.terms+" · размер: "+(x.index_bytes/1048576).toFixed(2)+" МиБ");for(const [k,v] of Object.entries(x.counts))add(panel,"p",(names[k]||k)+": "+v.total+(x.baseline_available?" · добавлено "+v.added+" · исключено "+v.removed:" · первичный снимок"));for(const s of a.items)add(panel,"p",s.title+" · "+s.status+" · записей "+s.records+" · последняя успешная проверка "+(s.success||"не подтверждена"))}
 for(const path of a.links){if(!/^[a-z0-9-]+\.(?:html|json)$/.test(path))continue;const l=add(panel,"a",path);l.href=path;add(panel,"p","")}
 }
 }catch(e){$("status").textContent="Автоматический обзор недоступен или не прошёл контроль целостности."}
});
