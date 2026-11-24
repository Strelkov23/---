(()=>{"use strict";
const el=id=>document.getElementById(id),form=el("pg-filter");if(!form)return;
let rows=[],page=0;const size=30;
const results=el("pg-results"),status=el("pg-status"),prev=el("pg-prev"),next=el("pg-next");
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function render(){
const q=el("pg-query").value.trim().toLocaleLowerCase("ru"),kind=el("pg-kind").value,action=el("pg-action").value,from=el("pg-from").value,to=el("pg-to").value;
results.replaceChildren();
if(from&&to&&from>to){status.textContent="Начальная дата позже конечной.";prev.disabled=next.disabled=true;return;}
const selected=rows.filter(r=>(!q||(r.title+" "+r.topics).toLocaleLowerCase("ru").includes(q))&&(!kind||r.kinds.includes(kind))&&(!action||r.actions.includes(action))&&(!from||r.published.slice(0,10)>=from)&&(!to||r.published.slice(0,10)<=to)&&(!(from||to)||!!r.published));
page=Math.min(page,Math.max(0,Math.ceil(selected.length/size)-1));
status.textContent="Найдено материалов: "+selected.length+(selected.length?" · "+(page*size+1)+"–"+Math.min((page+1)*size,selected.length):" · Измените фильтры или проверьте состояние источников.");
for(const r of selected.slice(page*size,(page+1)*size)){
 const a=node("article",""),h=node("h3",""),link=node("a",r.title);try{const u=new URL(r.url);if(!["https:","http:"].includes(u.protocol))continue;link.href=u.href;}catch{continue;}
 h.append(link);a.append(node("small",(r.published||"Дата не указана")+" · "+r.source),h,node("p",r.kinds.join(" · ")),node("small",r.actions.length?"Признаки в заголовке: "+r.actions.join(" · "):"Признак действия не классифицирован"));results.append(a);
}
prev.disabled=page===0;next.disabled=(page+1)*size>=selected.length;
}
fetch("programmes.json").then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json();}).then(d=>{if(!Array.isArray(d.rows))throw Error("Invalid data");rows=d.rows;render();form.addEventListener("input",()=>{page=0;render();});form.addEventListener("submit",e=>e.preventDefault());form.addEventListener("reset",()=>{page=0;setTimeout(render,0);});prev.addEventListener("click",()=>{page--;render();});next.addEventListener("click",()=>{page++;render();});}).catch(()=>{status.textContent="Не удалось загрузить выборку. Используйте CSV или повторите загрузку страницы.";});
})();