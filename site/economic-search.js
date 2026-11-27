/* Local bilingual economic search, with curated concept expansion. */
const EconomicSearch=(function core(){
 const stop=new Set("как что где найти мне можно нужно помоги покажи объясни это чем какой какие для при или по на в и с к у о об из за от до а".split(" "));
 function words(q){return [...new Set((String(q??"").toLowerCase().replaceAll("ё","е").match(/[a-zа-я0-9]+/g)||[]).filter(w=>w.length>=2&&!stop.has(w)).map(w=>w.length>=5?w.replace(/(иями|ями|ами|ого|его|ему|ому|ыми|ими|иях|иям|ией|ия|ии|ий|ию|ие|ях|ах|ам|ом|ов|ем|ая|ые|ый|ой|ую|а|ы|у|и|е|я|ю)$/u,""):w))].slice(0,20)}
 // Curated equivalents, not machine translation. Multiword alternatives require all their terms.
 const dictionary=[
 ["ввп","валовой внутренний продукт","gdp","gross domestic product"],
 ["врп","валовой региональный продукт","grp","gross regional product"],
 ["инфляция","inflation"],["безработица","unemployment"],["занятость","employment"],
 ["производительность труда","labor productivity","labour productivity"],
 ["инвестиции","investment","investments"],["основной капитал","fixed capital"],
 ["межотраслевой баланс","input output balance","input output table","input output tables"],
 ["промышленное производство","industrial production"],["обрабатывающая промышленность","manufacturing"],
 ["государственный долг","public debt","government debt"],["бюджетный дефицит","budget deficit","fiscal deficit"],
 ["денежная масса","money supply"],["ключевая ставка","policy rate","key rate"],
 ["потребительские цены","consumer prices"],["индекс потребительских цен","cpi","consumer price index"],
 ["экспорт","export","exports"],["импорт","import","imports"],["внешняя торговля","foreign trade","international trade"],
 ["экономический рост","economic growth"],["планирование","planning"],
 ["эконометрика","econometrics"],["прогнозирование","forecasting"],
 ["структурные изменения","structural change"],["производственные цепочки","supply chains","production chains"],
 ["региональное развитие","regional development"],["сельское хозяйство","agriculture"],
 ["реальная заработная плата","real wages"],["доходы населения","household income"],
 ["банковский сектор","banking sector"],["кредитование","lending"],["неравенство","inequality"],
 ["бедность","poverty"],["платежный баланс","balance of payments"]
 ];
 const entries=dictionary.map(group=>group.map(label=>({label,terms:words(label)})));
 function plan(q,expand=false){
  const remaining=words(q),groups=[];if(!expand)return remaining.map(t=>({original:[t],alternatives:[],labels:[]}));
  // Match longer phrases first; never equate a component of a phrase with the whole concept.
  const matches=entries.flatMap((entry,i)=>entry.map(v=>({entry,i,v}))).sort((a,b)=>b.v.terms.length-a.v.terms.length);
  for(const {entry,v} of matches){if(!v.terms.length||!v.terms.every(t=>remaining.includes(t)))continue;
   for(const t of v.terms)remaining.splice(remaining.indexOf(t),1);
   const other=entry.filter(x=>x!==v&&x.terms.join(" ")!==v.terms.join(" "));
   groups.push({original:v.terms,alternatives:other.map(x=>x.terms),labels:other.map(x=>x.label)});
  }
  for(const t of remaining)groups.push({original:[t],alternatives:[],labels:[]});return groups;
 }
 function search(index,q,options={}){
  const groups=plan(q,!!options.expand);if(!groups.length)return [];
  const scores=new Map(),hits=new Map(),expanded=new Set(),n=index.docs.length;
  function phrase(terms){let result=null;for(const t of terms){const p=Object.hasOwn(index.postings,t)?index.postings[t]:[];const idf=Math.log(1+(n-p.length+0.5)/(p.length+0.5));const next=new Map(p.map(([i,w])=>[i,w*idf]));if(result===null)result=next;else for(const [i,s] of result){if(next.has(i))result.set(i,s+next.get(i));else result.delete(i)}}return result||new Map()}
  for(const group of groups){
   const best=new Map([...phrase(group.original)].map(([i,s])=>[i,{score:s/group.original.length,alias:false}]));
   for(const alternative of group.alternatives){for(const [i,s] of phrase(alternative)){const score=0.55*s/alternative.length;if(!best.has(i))best.set(i,{score,alias:true});else if(best.get(i).alias&&score>best.get(i).score)best.set(i,{score,alias:true})}}
   for(const [i,v] of best){scores.set(i,(scores.get(i)||0)+v.score);hits.set(i,(hits.get(i)||0)+1);if(v.alias)expanded.add(i)}
  }
  const out=[];for(const [i,score] of scores){const r=index.docs[i];if(!r||options.kind&&r.kind!==options.kind)continue;if(options.from||options.to){if(!/^\d{4}/.test(r.date))continue;const y=Number(r.date.slice(0,4));if(options.from&&y<options.from||options.to&&y>options.to)continue}if(options.all&&hits.get(i)!==groups.length)continue;out.push({...r,score:score*(hits.get(i)/groups.length),matched:hits.get(i),expanded:expanded.has(i)})}
  return out.sort((a,b)=>b.score-a.score||b.matched-a.matched||String(b.date).localeCompare(String(a.date))||a.title.localeCompare(b.title,"ru"));
 }
 return {words,search,plan,dictionary};
})();
if(typeof module!=="undefined")module.exports=EconomicSearch;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{
 const $=id=>document.getElementById("es-"+id),form=$("form");if(!form)return;
 const q=$("query"),status=$("status"),host=$("results"),more=$("more"),kind=$("kind"),from=$("from"),to=$("to"),all=$("all"),expand=$("expand"),expansion=$("expansion");
 const labels={tool:"Инструмент",series:"Статистика",news:"Новости и документы",paper:"Научные статьи",discovered:"Новые показатели WDI",external:"Внешние препринты arXiv",web:"Внешние исследования FEDS"};
 let index=null,rows=[],limit=20,fingerprint="",seq=0;
 const add=(p,t,v)=>{const e=document.createElement(t);e.textContent=v;p.append(e);return e};
 function draw(){host.replaceChildren();for(const r of rows.slice(0,limit)){const article=add(host,"article",""),h=add(article,"h3","");try{const u=new URL(r.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();if(u.origin===location.origin&&typeof pinned!=="undefined"&&pinned&&dynamicPages.has(u.pathname.split("/").at(-1)))u.searchParams.set("snapshot",pinned);const a=add(h,"a",r.title);a.href=u.href;a.rel="noopener noreferrer"}catch{h.textContent=r.title}add(article,"small",labels[r.kind]+" · "+(r.date||"без даты")+" · "+r.source);add(article,"p",r.description);if(r.expanded)add(article,"small","Найдено также по словарю экономических терминов");if(r.code)add(article,"small",r.code)}more.hidden=rows.length<=limit;}
 async function run(){const id=++seq;host.replaceChildren();more.hidden=true;const query=q.value.trim();expansion.textContent="";if(!query){status.textContent="Введите поисковый запрос.";return}if(from.value&&to.value&&Number(from.value)>Number(to.value)){status.textContent="Начальный год больше конечного.";return}status.textContent="Проверка поискового индекса…";
 try{if(!index){const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-search-index.json",root)).data;if(d.schema!==1||!Array.isArray(d.docs)||!d.postings)throw Error();index=d;fingerprint=m.data_fingerprint}if(id!==seq)return;
 rows=EconomicSearch.search(index,query,{kind:kind.value,from:Number(from.value),to:Number(to.value),all:all.checked,expand:expand.checked});const equivalents=EconomicSearch.plan(query,expand.checked).flatMap(x=>x.labels);expansion.textContent=equivalents.length?"Расширение запроса: "+equivalents.slice(0,20).join(" · "):"";limit=20;draw();status.textContent="Найдено: "+rows.length+" из "+index.docs.length+" · SHA-256 "+fingerprint.slice(0,12);if(!rows.length)status.textContent+=". Попробуйте снять фильтры или изменить запрос.";
 const u=new URL(location.href);u.searchParams.set("q",query);history.replaceState(null,"",u);
 }catch{if(id===seq)status.textContent="Индекс отсутствует в этой версии или не прошёл контроль. Используйте обычный поиск."}}
 form.onsubmit=e=>{e.preventDefault();run()};more.onclick=()=>{limit+=20;draw()};
 $("ask").onclick=()=>{const field=document.getElementById("gea-question"),toggle=document.getElementById("gea-toggle");if(field&&toggle){field.value=q.value.slice(0,600);field.dispatchEvent(new Event("input"));if(document.getElementById("gea-panel").hidden)toggle.click()}};
 q.value=new URLSearchParams(location.search).get("q")||"";if(q.value)run();
});
