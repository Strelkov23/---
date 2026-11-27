/* Inverted-index search shared by the standalone page and assistant. */
const EconomicSearch=(function searchCore(){
 const stop=new Set("как что где найти мне можно нужно помоги покажи объясни это чем какой какие для при или по на в и с к у о об из за от до а".split(" "));
 function words(q){return [...new Set((String(q??"").toLowerCase().replaceAll("ё","е").match(/[a-zа-я0-9]+/g)||[]).filter(w=>w.length>=2&&!stop.has(w)).map(w=>w.length>=5?w.replace(/(иями|ями|ами|ого|его|ему|ому|ыми|ими|иях|иям|ией|ия|ии|ий|ию|ие|ях|ах|ам|ом|ов|ем|ая|ые|ый|ой|ую|а|ы|у|и|е|я|ю)$/u,""):w))].slice(0,20)}
 function search(index,q,options={}){
  const terms=words(q);if(!terms.length)return [];
  const scores=new Map(),hits=new Map(),n=index.docs.length;
  for(const t of terms){const p=Object.hasOwn(index.postings,t)?index.postings[t]:[];const idf=Math.log(1+(n-p.length+0.5)/(p.length+0.5));for(const [i,w] of p){scores.set(i,(scores.get(i)||0)+w*idf);hits.set(i,(hits.get(i)||0)+1)}}
  const out=[];for(const [i,score] of scores){const r=index.docs[i];if(!r||options.kind&&r.kind!==options.kind)continue;if(options.from||options.to){if(!/^\d{4}/.test(r.date))continue;const y=Number(r.date.slice(0,4));if(options.from&&y<options.from||options.to&&y>options.to)continue}if(options.all&&hits.get(i)!==terms.length)continue;out.push({...r,score:score*(hits.get(i)/terms.length),matched:hits.get(i)})}
  return out.sort((a,b)=>b.score-a.score||b.matched-a.matched||String(b.date).localeCompare(String(a.date))||a.title.localeCompare(b.title,"ru"));
 }
 return {words,search}
})();
if(typeof module!=="undefined")module.exports=EconomicSearch;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{
 const $=id=>document.getElementById("es-"+id),form=$("form");if(!form)return;
 const q=$("query"),status=$("status"),host=$("results"),more=$("more"),kind=$("kind"),from=$("from"),to=$("to"),all=$("all");
 const labels={tool:"Инструмент",series:"Статистика",news:"Новости и документы",paper:"Научные статьи",discovered:"Новые показатели WDI",external:"Внешние препринты arXiv"};
 let index=null,rows=[],limit=20,fingerprint="",seq=0;
 const add=(p,t,v)=>{const e=document.createElement(t);e.textContent=v;p.append(e);return e};
 function draw(){host.replaceChildren();for(const r of rows.slice(0,limit)){const article=add(host,"article",""),h=add(article,"h3","");try{const u=new URL(r.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();if(u.origin===location.origin&&typeof pinned!=="undefined"&&pinned&&dynamicPages.has(u.pathname.split("/").at(-1)))u.searchParams.set("snapshot",pinned);const a=add(h,"a",r.title);a.href=u.href;a.rel="noopener noreferrer"}catch{h.textContent=r.title}add(article,"small",labels[r.kind]+" · "+(r.date||"без даты")+" · "+r.source);add(article,"p",r.description);if(r.code)add(article,"small",r.code)}more.hidden=rows.length<=limit;}
 async function run(){const id=++seq;host.replaceChildren();more.hidden=true;const query=q.value.trim();if(!query){status.textContent="Введите поисковый запрос.";return}if(from.value&&to.value&&Number(from.value)>Number(to.value)){status.textContent="Начальный год больше конечного.";return}status.textContent="Проверка поискового индекса…";
 try{if(!index){const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-search-index.json",root)).data;if(d.schema!==1||!Array.isArray(d.docs)||!d.postings)throw Error();index=d;fingerprint=m.data_fingerprint}if(id!==seq)return;
 rows=EconomicSearch.search(index,query,{kind:kind.value,from:Number(from.value),to:Number(to.value),all:all.checked});limit=20;draw();status.textContent="Найдено: "+rows.length+" из "+index.docs.length+" · SHA-256 "+fingerprint.slice(0,12);if(!rows.length)status.textContent+=". Попробуйте снять фильтры или изменить запрос.";
 const u=new URL(location.href);u.searchParams.set("q",query);history.replaceState(null,"",u);
 }catch{if(id===seq)status.textContent="Индекс отсутствует в этой версии или не прошёл контроль. Используйте обычный поиск."}}
 form.onsubmit=e=>{e.preventDefault();run()};more.onclick=()=>{limit+=20;draw()};
 $("ask").onclick=()=>{const field=document.getElementById("gea-question"),toggle=document.getElementById("gea-toggle");if(field&&toggle){field.value=q.value.slice(0,600);field.dispatchEvent(new Event("input"));if(document.getElementById("gea-panel").hidden)toggle.click()}};
 q.value=new URLSearchParams(location.search).get("q")||"";if(q.value)run();
});
