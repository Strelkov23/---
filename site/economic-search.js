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
  const content=!!options.contentOnly;
  if(content&&(!index.abstract_postings||typeof index.abstract_postings!=="object"))return [];
  const postings=content?index.abstract_postings:index.postings;
  const scores=new Map(),hits=new Map(),expanded=new Set(),n=index.docs.length;
  function phrase(terms){let result=null;for(const t of terms){const p=Object.hasOwn(postings,t)?postings[t]:[];const idf=Math.log(1+(n-p.length+0.5)/(p.length+0.5));const next=new Map(p.map(([i,w])=>[i,w*idf]));if(result===null)result=next;else for(const [i,s] of result){if(next.has(i))result.set(i,s+next.get(i));else result.delete(i)}}return result||new Map()}
  for(const group of groups){
   const best=new Map([...phrase(group.original)].map(([i,s])=>[i,{score:s/group.original.length,alias:false}]));
   for(const alternative of group.alternatives){for(const [i,s] of phrase(alternative)){const score=0.55*s/alternative.length;if(!best.has(i))best.set(i,{score,alias:true});else if(best.get(i).alias&&score>best.get(i).score)best.set(i,{score,alias:true})}}
   for(const [i,v] of best){scores.set(i,(scores.get(i)||0)+v.score);hits.set(i,(hits.get(i)||0)+1);if(v.alias)expanded.add(i)}
  }
  const queryKey=words(q).join(" "),rawKey=String(q??"").trim().toLowerCase();
  const out=[];for(const [i,score] of scores){const r=index.docs[i];if(!r||options.kind&&r.kind!==options.kind||(options.abstractOnly||content)&&(r.kind!=="paper"||r.abstract_license!=="https://creativecommons.org/licenses/by/4.0/"))continue;if(options.from||options.to){if(!/^\d{4}/.test(r.date))continue;const y=Number(r.date.slice(0,4));if(options.from&&y<options.from||options.to&&y>options.to)continue}if(options.all&&hits.get(i)!==groups.length)continue;const titleKey=words(r.title).join(" ");
   const exactCode=!content&&!!r.code&&String(r.code).trim().toLowerCase()===rawKey;
   const exactTitle=!content&&titleKey===queryKey;
   const titlePhrase=!content&&!exactTitle&&queryKey.includes(" ")&&(" "+titleKey+" ").includes(" "+queryKey+" ");
   out.push({...r,score:score*(hits.get(i)/groups.length)*(titlePhrase?1.35:1),matched:hits.get(i),expanded:expanded.has(i),exactCode,exactTitle,contentMatch:content})}
  return out.sort((a,b)=>Number(b.exactCode)-Number(a.exactCode)||Number(b.exactTitle)-Number(a.exactTitle)||b.score-a.score||b.matched-a.matched||String(b.date).localeCompare(String(a.date))||a.title.localeCompare(b.title,"ru"));
 }
 function contentVector(index,q,options={}){
 const groups=plan(q,!!options.expand),n=index.abstract_count;
 if(!groups.length||!Number.isInteger(n)||n<=0||!index.abstract_postings||!Array.isArray(index.abstract_norms)||index.abstract_norms.length!==index.docs.length)return [];
 const postings=index.abstract_postings,idf=p=>Math.log(1+(n-p.length+0.5)/(p.length+0.5)),query=new Map(),evidence=new Map();
 for(const group of groups){
  for(const [terms,weight] of [[group.original,1],...group.alternatives.map(t=>[t,.55])]){
   if(!terms.length)continue;
   const lists=terms.map(t=>Object.hasOwn(postings,t)?postings[t]:[]);
   if(lists.some(p=>!p.length))continue;
   const maps=lists.map(p=>new Set(p.map(x=>x[0]))),matched=[...maps[0]].filter(i=>maps.every(m=>m.has(i)));
   if(!matched.length)continue;
   for(const i of matched){
    if(!evidence.has(i))evidence.set(i,new Map());
    const perDoc=evidence.get(i);
    if(!perDoc.has(group))perDoc.set(group,new Map());
    const perGroup=perDoc.get(group);
    for(const [k,t] of terms.entries()){
     const v=weight*idf(lists[k])/Math.sqrt(terms.length);
     perGroup.set(t,Math.max(perGroup.get(t)||0,v));
    }
   }
   for(const [k,t] of terms.entries())query.set(t,Math.max(query.get(t)||0,weight*idf(lists[k])/Math.sqrt(terms.length)));
  }
 }
 const qnorm=Math.hypot(...query.values());if(!(qnorm>0))return [];
 const out=[];
 for(const [i,matched] of evidence){
  const d=index.docs[i],dn=index.abstract_norms[i];
  if(!d||d.kind!=="paper"||d.abstract_license!=="https://creativecommons.org/licenses/by/4.0/"||!(dn>0)||options.kind&&options.kind!=="paper"||options.all&&matched.size!==groups.length)continue;
  if(options.from||options.to){const y=Number(String(d.date||"").slice(0,4));if(!y||options.from&&y<options.from||options.to&&y>options.to)continue;}
  const terms=new Map();for(const values of matched.values())for(const [term,w] of values)terms.set(term,Math.max(terms.get(term)||0,w));
  let dot=0;for(const [term,w] of terms)dot+=w*idf(postings[term]);
  const similarity=Math.min(1,dot/(qnorm*dn));
  if(!Number.isFinite(similarity)||similarity<=0)continue;
  out.push({...d,similarity,score:similarity*matched.size/groups.length,matched:matched.size,contentMatch:true,vectorMatch:true,shared:[...terms.keys()].slice(0,12)});
 }
 return out.sort((a,b)=>b.score-a.score||b.matched-a.matched||String(b.date||"").localeCompare(String(a.date||""))||a.title.localeCompare(b.title,"ru"));
}
 function related(index,sourceHref,options={}){
 const kinds=new Set(["paper","external","web"]);
 if(!Array.isArray(index.norms)||index.norms.length!==index.docs.length)return [];
 const source=index.docs.findIndex(r=>r.href===sourceHref&&kinds.has(r.kind));
 if(source<0)return [];
 const n=index.docs.length, terms=[];
 const idf=p=>Math.log(1+(n-p.length+0.5)/(p.length+0.5));
 // Exclude numeric identifiers and extremely frequent terms; bound query to 24 features.
 for(const [term,p] of Object.entries(index.postings)){
  if(term.length<3||/\d/.test(term)||p.length>n*0.35)continue;
  let lo=0,hi=p.length-1,weight=0;
  while(lo<=hi){const mid=(lo+hi)>>1;if(p[mid][0]===source){weight=p[mid][1];break}if(p[mid][0]<source)lo=mid+1;else hi=mid-1}
  if(weight)terms.push({term,weight:weight*idf(p),posting:p});
 }
 terms.sort((a,b)=>b.weight-a.weight||a.term.localeCompare(b.term));const top=terms.slice(0,24);
 const vector=new Map();
 for(const x of top){
  const synonyms=options.expand===false?[]:entries.filter(e=>e.some(v=>v.terms.length===1&&v.terms[0]===x.term)).flatMap(e=>e.filter(v=>v.terms.length===1).map(v=>v.terms[0]));
  for(const term of new Set([x.term,...synonyms])){
   const p=Object.hasOwn(index.postings,term)?index.postings[term]:null;if(!p||p.length>n*0.35)continue;
   const weight=x.weight*(term===x.term?1:0.45);
   if(!vector.has(term)||vector.get(term).weight<weight)vector.set(term,{weight,posting:p});
  }
 }
 const qnorm=Math.hypot(...Array.from(vector.values(),v=>v.weight));
 if(!(qnorm>0))return [];
 const scores=new Map();
 for(const [term,{weight,posting}] of vector){
  const factor=idf(posting)*weight;
  for(const [i,w] of posting){
   if(i===source||index.docs[i].href===sourceHref||!kinds.has(index.docs[i].kind)||options.abstractOnly&&index.docs[i].abstract_license!=="https://creativecommons.org/licenses/by/4.0/")continue;
   if(!scores.has(i))scores.set(i,{dot:0,terms:[]});
   const s=scores.get(i);s.dot+=factor*w;s.terms.push(term);
  }
 }
 return [...scores].filter(([i,s])=>index.norms[i]>0&&s.terms.length>=2).map(([i,s])=>({...index.docs[i],similarity:Math.min(1,s.dot/(qnorm*index.norms[i])),shared:s.terms.slice(0,8)})).sort((a,b)=>b.similarity-a.similarity||a.href.localeCompare(b.href)).slice(0,Math.min(10,Math.max(1,options.limit||5)));
}
 function semanticCandidates(rows,limit=12){
 if(!Number.isInteger(limit)||limit<1||limit>12)throw Error("Invalid candidate limit");
 const seen=new Set(),out=[];
 for(const r of rows){if(!["paper","external","web"].includes(r.kind)||typeof r.href!=="string"||!r.href||typeof r.title!=="string"||!r.title.trim()||seen.has(r.href))continue;seen.add(r.href);out.push(r);if(out.length===limit)break;}
 return out;
}
 function semanticRerank(rows,vectors,dimension=384){
 if(!Number.isInteger(dimension)||dimension<1||rows.length>12||vectors.length!==rows.length+1)throw Error("Invalid embeddings");
 const normalized=vectors.map(v=>{if(v.length!==dimension||Array.from(v).some(x=>!Number.isFinite(x)))throw Error("Invalid vector");const n=Math.hypot(...v);if(!(n>1e-12))throw Error("Zero vector");return Array.from(v,x=>x/n)});
 return rows.map((r,i)=>({...r,semanticSimilarity:Math.max(-1,Math.min(1,normalized[i+1].reduce((s,v,j)=>s+v*normalized[0][j],0))),lexicalRank:i+1})).sort((a,b)=>b.semanticSimilarity-a.semanticSimilarity||a.lexicalRank-b.lexicalRank);
}
 function cacheIdentity(title){
 if(typeof title!=="string"||!title.trim())throw Error("Invalid title");
 return JSON.stringify(["Xenova/paraphrase-multilingual-MiniLM-L12-v2","7e3d5398ff67a776281d0a27b2d47a964d5bfffb","transformers-2.17.2","quantized","mean","normalize",384,"title-v1",title.slice(0,600)]);
}
 function validCachedVector(v){
 return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite)&&Math.abs(Math.hypot(...v)-1)<.001;
}
 function mergeCache(old,updates,limit=256){
 if(!Number.isInteger(limit)||limit<1||limit>256)throw Error("Invalid cache limit");
 const map=new Map();
 for(const r of [...(Array.isArray(old)?old:[]),...updates]){
  if(!r||typeof r.key!=="string"||!/^[a-f0-9]{64}$/.test(r.key)||!Number.isSafeInteger(r.used)||r.used<0||!validCachedVector(r.vector))continue;
  const previous=map.get(r.key);if(!previous||r.used>=previous.used)map.set(r.key,{key:r.key,used:r.used,vector:r.vector});
 }
 return [...map.values()].sort((a,b)=>b.used-a.used||a.key.localeCompare(b.key)).slice(0,limit);
}
 return {words,search,plan,dictionary,related,contentVector,semanticCandidates,semanticRerank,cacheIdentity,validCachedVector,mergeCache};
})();
if(typeof module!=="undefined")module.exports=EconomicSearch;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{
 const $=id=>document.getElementById("es-"+id),form=$("form");if(!form)return;
 const q=$("query"),status=$("status"),host=$("results"),more=$("more"),kind=$("kind"),from=$("from"),to=$("to"),all=$("all"),expand=$("expand"),expansion=$("expansion"),abstractOnly=$("abstract-only"),contentOnly=$("content-only"),vector=$("vector"),semantic=$("semantic"),semanticStatus=$("semantic-status"),clearSemantic=$("semantic-clear");
 const labels={tool:"Инструмент",series:"Статистика",news:"Новости и документы",paper:"Научные статьи",discovered:"Новые показатели WDI",external:"Внешние препринты arXiv",web:"Внешние исследования FEDS"};
 let index=null,rows=[],limit=20,fingerprint="",seq=0,manifest=null,papersPromise=null,lastQuery="",encoderPromise=null,semanticBusy=false,baselineRows=[];
 const add=(p,t,v)=>{const e=document.createElement(t);e.textContent=v;p.append(e);return e};
 // Only public document title embeddings are stored, never query vectors or text.
 const cacheName="economic-search-title-vectors-v1";
 function openVectorCache(){
  return new Promise((resolve,reject)=>{
   let request,ended=false;
   const finish=(error,db)=>{if(ended){if(db)db.close();return}ended=true;clearTimeout(timer);error?reject(error):resolve(db)};
   const timer=setTimeout(()=>finish(Error("Cache timeout")),3000);
   try{request=indexedDB.open(cacheName,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("vectors"))request.result.createObjectStore("vectors")};request.onsuccess=()=>finish(null,request.result);request.onerror=()=>finish(Error("Cache unavailable"));request.onblocked=()=>finish(Error("Cache blocked"));}
   catch(e){finish(e)}
  });
 }
 async function cacheOperation(mode,operation){
  const db=await openVectorCache();
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction("vectors",mode),store=tx.objectStore("vectors");let result;
   const timer=setTimeout(()=>{try{tx.abort()}catch{}reject(Error("Cache transaction timeout"))},3000);
   const finish=(error)=>{clearTimeout(timer);error?reject(error):resolve(result)};
   tx.oncomplete=()=>finish();tx.onabort=()=>finish(Error("Cache transaction aborted"));tx.onerror=()=>finish(Error("Cache transaction failed"));
   try{operation(store,v=>{result=v})}catch(e){try{tx.abort()}catch{}finish(e)}
  })}finally{db.close()}
 }
 const readCache=()=>cacheOperation("readonly",(store,set)=>{const req=store.get("entries");req.onsuccess=()=>set(EconomicSearch.mergeCache(req.result,[]));});
 const writeCache=updates=>cacheOperation("readwrite",(store,set)=>{const req=store.get("entries");req.onsuccess=()=>{const entries=EconomicSearch.mergeCache(req.result,updates);store.put(entries,"entries");set(entries.length)};});
 const clearCache=()=>cacheOperation("readwrite",(store,set)=>{store.delete("entries");set(true);});
 async function titleKey(title){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(EconomicSearch.cacheIdentity(title)));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");}
 clearSemantic.onclick=async()=>{if(semanticBusy)return;clearSemantic.disabled=true;try{await clearCache();semanticStatus.textContent="Локальный кеш векторов очищен. Файлы модели в кеше браузера не удалены."}catch{semanticStatus.textContent="Не удалось очистить кеш; используйте настройки хранения данных браузера."}finally{clearSemantic.disabled=semanticBusy}};
 function draw(){host.replaceChildren();for(const r of rows.slice(0,limit)){const article=add(host,"article",""),h=add(article,"h3","");try{const u=new URL(r.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();if(u.origin===location.origin&&typeof pinned!=="undefined"&&pinned&&dynamicPages.has(u.pathname.split("/").at(-1)))u.searchParams.set("snapshot",pinned);const a=add(h,"a",r.title);a.href=u.href;a.rel="noopener noreferrer"}catch{h.textContent=r.title}add(article,"small",labels[r.kind]+" · "+(r.date||"без даты")+" · "+r.source);add(article,"p",r.description);if(r.exactCode)add(article,"small","Точное совпадение кода");else if(r.exactTitle)add(article,"small","Точное совпадение названия");if(r.expanded)add(article,"small","Найдено также по словарю экономических терминов");if(r.contentMatch)add(article,"small","Совпадение в тексте лицензированной аннотации");if(r.vectorMatch)add(article,"small"," · векторное сходство "+r.similarity.toFixed(3)+" · термины: "+r.shared.join(", "));if(Number.isFinite(r.semanticSimilarity))add(article,"small","Нейросетевое сходство названия "+r.semanticSimilarity.toFixed(3)+" · исходная позиция среди кандидатов "+r.lexicalRank);if(r.abstract_license==="https://creativecommons.org/licenses/by/4.0/"){
 const details=add(article,"details",""),summary=add(details,"summary","Читать аннотацию · CC BY 4.0"),content=add(details,"p","");
 details.addEventListener("toggle",async()=>{if(!details.open||content.dataset.loaded)return;content.dataset.loaded="1";content.textContent="Проверка источника…";
 try{if(!papersPromise)papersPromise=Provenance.get(manifest,"literature.json",root).then(x=>new Map(x.data.articles.map(p=>[p.doi,p]))).catch(e=>{papersPromise=null;throw e});
 const p=(await papersPromise).get(r.code),a=p?.licensed_abstract;if(!a||a.license!==r.abstract_license||typeof a.text!=="string"||!p.authors)throw Error();
 content.textContent=a.text;add(details,"p","Авторы: "+p.authors+" · DOI "+r.code+" · Crossref · форматирование нормализовано");const license=add(details,"a","Лицензия CC BY 4.0");license.href=a.license;license.rel="noopener noreferrer";add(details,"small","Лицензия заявлена издателем; аннотация отражает утверждения авторов, не проверенный результат.");
 }catch{content.textContent="Аннотация недоступна или не прошла проверку.";delete content.dataset.loaded}});
 }if(r.code)add(article,"small",r.code);if(["paper","external","web"].includes(r.kind)){
 const d=add(article,"details",""),s=add(d,"summary","Похожие исследования"),holder=add(d,"div","");
 d.addEventListener("toggle",()=>{if(!d.open||holder.dataset.loaded)return;holder.dataset.loaded="1";const matches=EconomicSearch.related(index,r.href,{expand:expand.checked,abstractOnly:abstractOnly.checked});
 if(!matches.length){add(holder,"p","Нет достаточных совпадений по терминам в текущем индексе.");return}
 for(const m of matches){const line=add(holder,"p","");const a=add(line,"a",m.title);try{const u=new URL(m.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();a.href=u.href;a.rel="noopener noreferrer"}catch{a.removeAttribute("href")}
 add(line,"small"," · сходство "+m.similarity.toFixed(3)+" · общие термины: "+m.shared.join(", "));}
 add(holder,"small","Лексическое сходство TF-IDF и словарные соответствия; не оценка достоверности или согласия выводов.");
 });
 }}more.hidden=rows.length<=limit;}
 async function run(){const id=++seq;lastQuery="";rows=[];baselineRows=[];semantic.disabled=true;semanticStatus.textContent="";host.replaceChildren();more.hidden=true;const query=q.value.trim();expansion.textContent="";if(!query){status.textContent="Введите поисковый запрос.";return}if(from.value&&to.value&&Number(from.value)>Number(to.value)){status.textContent="Начальный год больше конечного.";return}status.textContent="Проверка поискового индекса…";
 try{if(!index){const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-search-index.json",root)).data;if(d.schema!==1||!Array.isArray(d.docs)||!d.postings)throw Error();index=d;manifest=m;fingerprint=m.data_fingerprint}if(id!==seq)return;
 const options={kind:kind.value,from:Number(from.value),to:Number(to.value),all:all.checked,expand:expand.checked,abstractOnly:abstractOnly.checked,contentOnly:contentOnly.checked};rows=vector.checked?EconomicSearch.contentVector(index,query,options):EconomicSearch.search(index,query,options);const equivalents=EconomicSearch.plan(query,expand.checked).flatMap(x=>x.labels);expansion.textContent=equivalents.length?"Расширение запроса: "+equivalents.slice(0,20).join(" · "):"";limit=20;lastQuery=query;baselineRows=rows.slice();draw();semantic.disabled=semanticBusy||!EconomicSearch.semanticCandidates(rows).length;status.textContent="Найдено: "+rows.length+" из "+index.docs.length+" · SHA-256 "+fingerprint.slice(0,12);if(vector.checked&&!Array.isArray(index.abstract_norms))status.textContent+=". Векторный индекс отсутствует в этой версии.";else if(contentOnly.checked&&!index.abstract_postings)status.textContent+=". Индекс текста отсутствует в закреплённой версии.";else if(!rows.length)status.textContent+=". Попробуйте снять фильтры или изменить запрос.";
 const u=new URL(location.href);u.searchParams.set("q",query);for(const [k,v] of [["kind",kind.value],["from",from.value],["to",to.value],["all",all.checked?"1":""],["expand",expand.checked?"":"0"],["abstract",abstractOnly.checked?"1":""],["content",contentOnly.checked?"1":""],["vector",vector.checked?"1":""]]){if(v)u.searchParams.set(k,v);else u.searchParams.delete(k)}history.replaceState(null,"",u);
 }catch{if(id===seq)status.textContent="Индекс отсутствует в этой версии или не прошёл контроль. Используйте обычный поиск."}}
 semantic.onclick=async()=>{
 if(semanticBusy||!lastQuery)return;
 const token=seq,query=lastQuery,candidates=EconomicSearch.semanticCandidates(baselineRows);
 if(!candidates.length)return;
 semanticBusy=true;semantic.disabled=true;clearSemantic.disabled=true;semanticStatus.textContent="Подготовка локальной модели; при первом запуске требуется загрузка файлов…";
 try{
  if(!encoderPromise)encoderPromise=(async()=>{
   const lib=await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
   lib.env.allowLocalModels=false;lib.env.useBrowserCache=true;
   return lib.pipeline("feature-extraction","Xenova/paraphrase-multilingual-MiniLM-L12-v2",{revision:"7e3d5398ff67a776281d0a27b2d47a964d5bfffb",quantized:true});
  })().catch(e=>{encoderPromise=null;throw e});
  const encoder=await encoderPromise;
  if(token!==seq)return;
  let cache=[],cacheAvailable=true,hits=0,saved=null;
  try{cache=await readCache()}catch{cacheAvailable=false}
  const known=new Map(cache.map(r=>[r.key,r])),updates=[],vectors=[];
  const encode=async input=>{
   const tensor=await encoder(input.slice(0,600),{pooling:"mean",normalize:true});
   if(tensor.dims?.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==384)throw Error("Unexpected embedding shape");
   const v=Array.from(tensor.data);if(!EconomicSearch.validCachedVector(v))throw Error("Invalid normalized vector");return v;
  };
  vectors.push(await encode(query)); // Query vector is never persisted.
  for(const [i,r] of candidates.entries()){
   if(token!==seq)return;
   semanticStatus.textContent="Локальное кодирование: "+(i+1)+" из "+candidates.length+" названий · из кеша "+hits;
   let key=null;try{if(cacheAvailable)key=await titleKey(r.title)}catch{cacheAvailable=false}
   let value=key?known.get(key)?.vector:null;
   if(value)hits++;else value=await encode(r.title);
   vectors.push(value);
   if(key){const record={key,used:Date.now(),vector:value};updates.push(record);known.set(key,record)}
  }
  if(token!==seq)return;
  if(cacheAvailable&&updates.length)try{saved=await writeCache(updates)}catch{cacheAvailable=false}
  if(token!==seq)return;
  const ranked=EconomicSearch.semanticRerank(candidates,vectors),selected=new Set(candidates);
  // Preserve all non-candidates and their slots; reorder only the selected research documents.
  let n=0;rows=baselineRows.map(r=>selected.has(r)&&n<ranked.length?ranked[n++]:r);
  draw();semanticStatus.textContent="Нейросеть переупорядочила "+ranked.length+" уже найденных исследований по названиям. Остальные результаты сохранены. Из кеша: "+hits+" из "+ranked.length+". "+(cacheAvailable?"В локальном кеше: "+(saved??cache.length)+" векторов. ":"Кеш недоступен; расчёт выполнен без сохранения. ")+"Не поиск по всему корпусу; сходство не подтверждает качество.";
 }catch{if(token===seq)semanticStatus.textContent="Модель или вычисление недоступны. Обычная выдача сохранена.";}
 finally{semanticBusy=false;clearSemantic.disabled=false;semantic.disabled=!lastQuery||!EconomicSearch.semanticCandidates(baselineRows).length;}
};
 form.onsubmit=e=>{e.preventDefault();run()};more.onclick=()=>{limit+=20;draw()};
 $("ask").onclick=()=>{const field=document.getElementById("gea-question"),toggle=document.getElementById("gea-toggle");if(field&&toggle){field.value=q.value.slice(0,600);field.dispatchEvent(new Event("input"));if(document.getElementById("gea-panel").hidden)toggle.click()}};
 const saved=new URLSearchParams(location.search);q.value=(saved.get("q")||"").slice(0,600);
 if([...kind.options].some(o=>o.value===saved.get("kind")))kind.value=saved.get("kind");
 for(const [key,field] of [["from",from],["to",to]]){const value=saved.get(key);if(/^\d{4}$/.test(value||"")&&Number(value)>=1900&&Number(value)<=2100)field.value=value}
 vector.checked=saved.get("vector")==="1";contentOnly.checked=saved.get("content")==="1";abstractOnly.checked=saved.get("abstract")==="1";all.checked=saved.get("all")==="1";expand.checked=saved.get("expand")!=="0";if(q.value)run();
});
