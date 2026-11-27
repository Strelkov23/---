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
  const previous=map.get(r.key);if(!previous||r.used>=previous.used)map.set(r.key,{key:r.key,used:r.used,vector:r.vector,...(typeof r.href==="string"&&r.href.length<=2048&&["paper","external","web"].includes(r.kind)?{href:r.href,kind:r.kind}:previous?.href?{href:previous.href,kind:previous.kind}:{})});
 }
 return [...map.values()].sort((a,b)=>b.used-a.used||a.key.localeCompare(b.key)).slice(0,limit);
}
 // Serialize cache touches against the latest transaction contents, even if the
 // system clock moves backwards or several records are written in one millisecond.
 function touchCache(old,updates,now=Date.now(),limit=256){
  if(!Number.isSafeInteger(now)||now<0||!Array.isArray(updates))throw Error("Invalid cache clock");
  let prior=mergeCache(old,[],limit);
  let clock=Math.max(now,prior[0]?.used||0);
  if(clock>Number.MAX_SAFE_INTEGER-updates.length){
   prior=prior.map((r,i)=>({...r,used:prior.length-i}));clock=prior.length;
  }
  return mergeCache(prior,updates.map(r=>({...r,used:++clock})),limit);
 }
 function localEligible(d,options={}){
 if(!d||!["paper","external","web"].includes(d.kind)||typeof d.href!=="string"||!d.href||typeof d.title!=="string"||!d.title.trim()||options.kind&&d.kind!==options.kind)return false;
 if(options.abstractOnly&&d.abstract_license!=="https://creativecommons.org/licenses/by/4.0/")return false;
 if(options.from||options.to){if(!/^\d{4}/.test(d.date||""))return false;const y=Number(d.date.slice(0,4));if(options.from&&y<options.from||options.to&&y>options.to)return false;}
 return !options.all&&!options.contentOnly&&!options.vector;
}
 function localRank(query,matched,limit=20){
 if(!validCachedVector(query)||!Number.isInteger(limit)||limit<1||limit>50||matched.length>256)throw Error("Invalid local vector search");
 const seen=new Set(),rows=[];
 for(const {doc,vector} of matched){
  if(!localEligible(doc)||!validCachedVector(vector)||seen.has(doc.href))continue;
  seen.add(doc.href);
  let dot=0;for(let i=0;i<384;i++)dot+=query[i]*vector[i];
  const similarity=Math.max(-1,Math.min(1,dot/(Math.hypot(...query)*Math.hypot(...vector))));
  rows.push({...doc,semanticSimilarity:similarity,localSemantic:true});
 }
 return rows.sort((a,b)=>b.semanticSimilarity-a.semanticSimilarity||a.href.localeCompare(b.href)).slice(0,limit);
}
 function archiveTargets(docs,limit=256,options={}){
 if(!Array.isArray(docs)||!Number.isInteger(limit)||limit<1||limit>256)throw Error("Invalid archive targets");
 const seen=new Set(),out=[];
 const eligible=docs.filter(d=>localEligible(d,options)&&d.href.length<=2048).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||a.href.localeCompare(b.href)||a.kind.localeCompare(b.kind));
 for(const d of eligible){const key=cacheIdentity(d.title);if(seen.has(key))continue;seen.add(key);out.push(d);if(out.length===limit)break;}
 return out;
 }
 function coverage(index,audit=null){
  const kinds=["tool","series","news","paper","discovered","external","web"];
  if(index?.schema!==1||!Array.isArray(index.docs))throw Error("Invalid search coverage");
  const counts=Object.fromEntries(kinds.map(k=>[k,0]));let abstracts=0,dated=0;
  for(const d of index.docs){
   if(!Object.hasOwn(counts,d.kind))throw Error("Unknown document kind");
   counts[d.kind]++;
   if(d.kind==="paper"&&d.abstract_license==="https://creativecommons.org/licenses/by/4.0/")abstracts++;
   if(["paper","external","web"].includes(d.kind)&&/^\d{4}/.test(d.date||""))dated++;
  }
  const research=counts.paper+counts.external+counts.web;
  const consistent=!!audit&&audit.schema===1&&kinds.every(k=>audit.counts?.[k]?.total===counts[k])&&audit.abstracts?.indexed===abstracts;
  const sources=consistent&&Array.isArray(audit.sources)?audit.sources.filter(r=>["wdi","arxiv","feds"].includes(r.id)&&["waiting","ok","error","blocked"].includes(r.status)).map(r=>({id:r.id,status:r.status,checked:typeof r.checked==="string"?r.checked:null,success:typeof r.success==="string"?r.success:null})):null;
  const changes=consistent&&audit.baseline_available===true&&kinds.every(k=>["added","removed"].every(m=>Number.isSafeInteger(audit.counts[k][m])&&audit.counts[k][m]>=0)&&audit.counts[k].added<=counts[k])?Object.fromEntries(kinds.map(k=>[k,{added:audit.counts[k].added,removed:audit.counts[k].removed}])):null;
  return {counts,total:index.docs.length,research,abstracts,dated,undated:research-dated,metadataOnly:research-abstracts,sources,changes,consistent};
 }
 function coverageQuestion(q){
  const s=String(q||"").toLowerCase().replaceAll("ё","е").trim();
  return /(?:охват|покрытие|размер|состояние|статистика|сколько|объем)/u.test(s)&&/(?:поисковик|поискового индекс|научного архив|научных публикаци|научных статей|аннотаци)/u.test(s);
 }
 function verifiedAbstract(doc,paper,stamp){
  const license="https://creativecommons.org/licenses/by/4.0/";
  const day=String(stamp||"").slice(0,10),a=paper?.licensed_abstract;
  const validDay=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!validDay(day)||doc?.kind!=="paper"||doc.abstract_license!==license||typeof doc.code!=="string"||doc.code!==paper?.doi||!/^10\.\d{4,9}\/\S+$/.test(doc.code)||typeof paper.title!=="string"||paper.title.slice(0,350)!==doc.title||typeof paper.authors!=="string"||!paper.authors.trim()||a?.license!==license||typeof a.text!=="string"||!a.text.trim()||a.text.length>4000)return null;
  const licenses=paper.access?.licenses;
  if(!Array.isArray(licenses))return null;
  const vor=licenses.filter(r=>r&&String(r.version).toLowerCase()==="vor");
  if(!vor.length||vor.some(r=>!validDay(r.start)))return null;
  const active=vor.filter(r=>r.start<=day),allowed=new Set([license,license.slice(0,-1),license.replace("https:","http:"),license.replace("https:","http:").slice(0,-1)]);
  if(!active.length||active.some(r=>!allowed.has(r.url)))return null;
  return {text:a.text,authors:paper.authors,license,checked:typeof a.checked==="string"?a.checked:"не указана"};
 }
 function abstractChunks(text){
  if(typeof text!=="string"||!text.trim()||text.length>4000)throw Error("Invalid abstract");
  const chunks=[];let rest=text.trim();
  while(rest.length){let end=Math.min(400,rest.length);if(end<rest.length){const space=rest.lastIndexOf(" ",end);if(space>=200)end=space;else if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;}
   chunks.push(rest.slice(0,end));rest=rest.slice(end).trimStart();}
  return chunks;
 }
 function abstractCandidates(rows,papers,stamp,limit=4){
  if(!Array.isArray(rows)||!Array.isArray(papers)||!Number.isInteger(limit)||limit<1||limit>4)throw Error("Invalid candidates");
  const byDoi=new Map(),duplicate=new Set(),seen=new Set(),out=[];
  for(const p of papers){if(typeof p?.doi!=="string")continue;if(byDoi.has(p.doi))duplicate.add(p.doi);byDoi.set(p.doi,p);}
  for(const doc of rows){if(seen.has(doc.code)||duplicate.has(doc.code))continue;
   const a=verifiedAbstract(doc,byDoi.get(doc.code),stamp);if(!a)continue;
   seen.add(doc.code);out.push({doc,authors:a.authors,license:a.license,chunks:abstractChunks(a.text)});if(out.length===limit)break;}
  return out;
 }
 function abstractRank(query,items){
  if(!validCachedVector(query)||!Array.isArray(items)||items.length>4)throw Error("Invalid abstract vectors");
  const norm=Math.hypot(...query);
  return items.map((item,i)=>{
   if(!Array.isArray(item.vectors)||!item.vectors.length||item.vectors.length>21||item.vectors.some(v=>!validCachedVector(v)))throw Error("Invalid abstract chunks");
   const scores=item.vectors.map(v=>Math.max(-1,Math.min(1,v.reduce((s,x,j)=>s+x*query[j],0)/(norm*Math.hypot(...v)))));
   return {...item.doc,authors:item.authors,license:item.license,abstractSimilarity:scores.reduce((s,v)=>s+v,0)/scores.length,bestChunk:Math.max(...scores),chunkCount:scores.length,originalRank:i+1};
  }).sort((a,b)=>b.abstractSimilarity-a.abstractSimilarity||a.originalRank-b.originalRank);
 }
 function researchEvidence(index,papers,query,cutoff,limit=3){
  if(!Array.isArray(papers)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(cutoff)||!Number.isInteger(limit)||limit<1||limit>5)return [];
  const stamp=String(index.built||"").slice(0,10),byDoi=new Map(),ambiguous=new Set();
  for(const p of papers){if(typeof p?.doi!=="string")continue;if(byDoi.has(p.doi))ambiguous.add(p.doi);byDoi.set(p.doi,p);}
  const options={kind:"paper",expand:true,abstractOnly:true},channels=[
   ["vector",contentVector(index,query,options)],
   ["content",search(index,query,{...options,contentOnly:true})],
   ["metadata",search(index,query,options)]
  ],pool=new Map();
  for(const [channel,rows] of channels)for(const [i,doc] of rows.slice(0,50).entries()){
   if(!pool.has(doc.href))pool.set(doc.href,{doc,channels:[],score:0});
   const r=pool.get(doc.href);r.channels.push(channel);r.score+=(channel==="metadata"?0.3:1)/(10+i+1);
  }
  const ranked=[...pool.values()].sort((a,b)=>Number(b.channels.some(c=>c!=="metadata"))-Number(a.channels.some(c=>c!=="metadata"))||b.score-a.score||a.doc.href.localeCompare(b.doc.href));
  const result=[],seen=new Set();
  for(const r of ranked){
   const d=r.doc,p=byDoi.get(d.code),period=String(d.date||"");
   if(!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-\d{2})?)?$/.test(period)||((period.length===4?period+"-12":period.slice(0,7))>cutoff)||String(p?.published||"").slice(0,10)!==period||ambiguous.has(d.code)||seen.has(d.code))continue;
   const a=verifiedAbstract(d,p,stamp);if(!a)continue;
   seen.add(d.code);result.push({...d,...a,channels:r.channels,retrievalScore:r.score});
   if(result.length>=limit)break;
  }
  return result;
 }
 return {words,search,plan,dictionary,related,contentVector,semanticCandidates,semanticRerank,cacheIdentity,validCachedVector,mergeCache,localEligible,localRank,archiveTargets,touchCache,coverage,coverageQuestion,verifiedAbstract,abstractChunks,abstractCandidates,abstractRank,researchEvidence};
})();
if(typeof module!=="undefined")module.exports=EconomicSearch;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{
 const $=id=>document.getElementById("es-"+id),form=$("form");if(!form)return;
 const q=$("query"),status=$("status"),host=$("results"),more=$("more"),kind=$("kind"),from=$("from"),to=$("to"),all=$("all"),expand=$("expand"),expansion=$("expansion"),abstractOnly=$("abstract-only"),contentOnly=$("content-only"),vector=$("vector"),semantic=$("semantic"),semanticStatus=$("semantic-status"),clearSemantic=$("semantic-clear"),localSemantic=$("local-semantic"),localResults=$("local-results"),buildSemantic=$("semantic-build"),stopSemantic=$("semantic-stop"),buildStatus=$("semantic-build-status"),buildLimit=$("semantic-build-limit"),buildFiltered=$("semantic-build-filtered"),coverageHost=$("coverage"),coverageRefresh=$("coverage-refresh");
 const labels={tool:"Инструмент",series:"Статистика",news:"Новости и документы",paper:"Научные статьи",discovered:"Новые показатели WDI",external:"Внешние препринты arXiv",web:"Внешние исследования FEDS"};
 const abstractSemantic=$("abstract-semantic");
 let index=null,rows=[],limit=20,fingerprint="",seq=0,manifest=null,papersPromise=null,lastQuery="",encoderPromise=null,semanticBusy=false,baselineRows=[],lastOptions=null,buildStop=false,buildActive=false,indexPromise=null;
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
 const writeCache=updates=>cacheOperation("readwrite",(store,set)=>{const req=store.get("entries");req.onsuccess=()=>{const entries=EconomicSearch.touchCache(req.result,updates);store.put(entries,"entries");set(entries.length)};});
 const clearCache=()=>cacheOperation("readwrite",(store,set)=>{store.delete("entries");set(true);});
 async function titleKey(title){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(EconomicSearch.cacheIdentity(title)));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");}
 clearSemantic.onclick=async()=>{if(semanticBusy)return;semanticBusy=true;controls();try{await clearCache();localResults.replaceChildren();buildStatus.textContent="";semanticStatus.textContent="Локальный кеш векторов очищен. Файлы модели в кеше браузера не удалены."}catch{semanticStatus.textContent="Не удалось очистить кеш; используйте настройки хранения данных браузера."}finally{semanticBusy=false;controls()}};
 function controls(){
  semantic.disabled=semanticBusy||!lastQuery||!EconomicSearch.semanticCandidates(baselineRows).length;
  if(abstractSemantic)abstractSemantic.disabled=semanticBusy||!lastQuery||!baselineRows.some(r=>r.kind==="paper"&&r.abstract_license==="https://creativecommons.org/licenses/by/4.0/");
  localSemantic.disabled=semanticBusy||!lastQuery||!lastOptions||lastOptions.all||lastOptions.contentOnly||lastOptions.vector||!!lastOptions.kind&&!["paper","external","web"].includes(lastOptions.kind);
  clearSemantic.disabled=semanticBusy;buildSemantic.disabled=semanticBusy;buildLimit.disabled=semanticBusy;buildFiltered.disabled=semanticBusy;stopSemantic.disabled=!buildActive||buildStop;
 }
 async function getEncoder(){
  if(!encoderPromise)encoderPromise=(async()=>{
   const lib=await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
   lib.env.allowLocalModels=false;lib.env.useBrowserCache=true;
   return lib.pipeline("feature-extraction","Xenova/paraphrase-multilingual-MiniLM-L12-v2",{revision:"7e3d5398ff67a776281d0a27b2d47a964d5bfffb",quantized:true});
  })().catch(e=>{encoderPromise=null;throw e});
  return encoderPromise;
 }
 async function encodeText(encoder,input){
  const tensor=await encoder(input.slice(0,600),{pooling:"mean",normalize:true});
  if(tensor.dims?.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==384)throw Error("Unexpected embedding shape");
  const v=Array.from(tensor.data);if(!EconomicSearch.validCachedVector(v))throw Error("Invalid normalized vector");return v;
 }
 localSemantic.onclick=async()=>{
  if(semanticBusy||!lastQuery||localSemantic.disabled)return;
  const token=seq,query=lastQuery,options=lastOptions;
  semanticBusy=true;controls();localResults.replaceChildren();semanticStatus.textContent="Проверка локального индекса…";
  try{
   const cached=await readCache(),docs=new Map(index.docs.filter(r=>EconomicSearch.localEligible(r,options)).map(r=>[JSON.stringify([r.kind,r.href]),r])),matched=[];
   for(const r of cached){
    if(token!==seq)return;
    const doc=docs.get(JSON.stringify([r.kind,r.href]));if(!doc||await titleKey(doc.title)!==r.key)continue;
    matched.push({doc,vector:r.vector});
   }
   if(token!==seq)return;
   if(!matched.length){semanticStatus.textContent="Нет актуальных сохранённых исследований для этих фильтров. Пополните локальный индекс из архива или выполните нейросетевое ранжирование обычной выдачи.";return}
   const encoder=await getEncoder(),v=await encodeText(encoder,query);
   if(token!==seq)return;
   const ranked=EconomicSearch.localRank(v,matched);
   add(localResults,"h3","Отдельная выдача по локальному нейросетевому индексу");
   add(localResults,"p","Проверено "+matched.length+" сохранённых исследований из текущего архива; показано "+ranked.length+". Поиск по названиям, без требования совпадения слов. Это не полный архив, не оценка достоверности и не доказательство релевантности.");
   for(const r of ranked){
    const line=add(localResults,"p",""),a=add(line,"a",r.title);
    try{const u=new URL(r.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();if(u.origin===location.origin&&typeof pinned!=="undefined"&&pinned&&typeof dynamicPages!=="undefined"&&dynamicPages.has(u.pathname.split("/").at(-1)))u.searchParams.set("snapshot",pinned);a.href=u.href;a.rel="noopener noreferrer"}catch{a.removeAttribute("href")}
    add(line,"small"," · "+labels[r.kind]+" · "+(r.date||"без даты")+" · косинус "+r.semanticSimilarity.toFixed(3));
   }
   semanticStatus.textContent="Локальный поиск завершён. Обычная выдача не изменена.";
  }catch{if(token===seq)semanticStatus.textContent="Локальный индекс или модель недоступны; обычная выдача сохранена.";}
  finally{semanticBusy=false;controls()}
 };
 async function showCoverage(){
  coverageRefresh.disabled=true;coverageHost.textContent="Проверка охвата индекса…";
  try{
   await ensureIndex();let audit=null;
   try{audit=(await Provenance.get(manifest,"economic-search-audit.json",root)).data}catch{}
   const c=EconomicSearch.coverage(index,audit);
   coverageHost.replaceChildren();
   add(coverageHost,"p","Всего записей: "+c.total+" · научных материалов: "+c.research+" · с лицензированными аннотациями: "+c.abstracts+" · только метаданные: "+c.metadataOnly+" · без даты: "+c.undated+".");
   const ul=add(coverageHost,"ul","");
   for(const [k,n] of Object.entries(c.counts)){const ch=c.changes?.[k];add(ul,"li",labels[k]+": "+n+(ch?" · добавлено "+ch.added+", удалено "+ch.removed:""));}
   if(c.sources)for(const r of c.sources)add(coverageHost,"p",r.id+" · "+({ok:"успешно",error:"ошибка",blocked:"заблокировано",waiting:"ожидает"}[r.status])+" · последняя проверка "+(r.checked||"нет данных")+" · успех "+(r.success||"нет данных"));
   else add(coverageHost,"p","Согласованный отчёт об обновлении источников недоступен.");
   add(coverageHost,"small","SHA-256 "+fingerprint.slice(0,12)+". Охват архива, а не всего интернета; число записей не доказывает полноту или истинность данных. Без проверенной базы сравнения прирост не показывается.");
  }catch{coverageHost.textContent="Охват не подтверждён: индекс недоступен или не прошёл контроль."}
  finally{coverageRefresh.disabled=false;}
 }
 coverageRefresh.onclick=showCoverage;
 async function ensureIndex(){
  if(index)return;
  if(!indexPromise)indexPromise=(async()=>{const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-search-index.json",root)).data;if(d.schema!==1||!Array.isArray(d.docs)||!d.postings)throw Error("Invalid index");index=d;manifest=m;fingerprint=m.data_fingerprint;})().finally(()=>{indexPromise=null});
  await indexPromise;
 }
 stopSemantic.onclick=()=>{buildStop=true;controls();buildStatus.textContent="Остановка после текущего вычисления и записи…";};
 buildSemantic.onclick=async()=>{
  if(semanticBusy)return;
  semanticBusy=true;buildActive=true;buildStop=false;controls();
  const options=buildFiltered.checked?{kind:kind.value,from:Number(from.value),to:Number(to.value),abstractOnly:abstractOnly.checked}:{};
  const batchLimit=Number(buildLimit.value);
  let completed=0,targets=[],updates=[];
  const flush=async()=>{if(updates.length){await writeCache(updates);updates=[];}};
  try{
   buildStatus.textContent="Проверка архива и сохранённых векторов…";
   await ensureIndex();
   if(options.from&&options.to&&options.from>options.to){buildStatus.textContent="Начальный год больше конечного.";return}
   targets=EconomicSearch.archiveTargets(index.docs,batchLimit,options);
   if(!targets.length){buildStatus.textContent="Нет подходящих научных названий. Измените тип, годы или наличие аннотации.";return}
   localResults.replaceChildren();
   const cached=await readCache(),known=new Map(cached.map(r=>[r.key,r]));
   let encoder=null;
   for(const doc of targets){
    if(buildStop)break;
    const key=await titleKey(doc.title),prior=known.get(key);
    if(buildStop)break;
    if(prior?.href===doc.href&&prior.kind===doc.kind){
     // Refresh chosen targets too: they must not be evicted while replacing older entries.
     updates.push({...prior,used:Date.now()});
    }else{
     if(!prior&&!encoder){buildStatus.textContent="Загрузка локальной модели при необходимости…";encoder=await getEncoder();}
     if(buildStop)break;
     const value=prior?.vector||await encodeText(encoder,doc.title);
     updates.push({key,used:Date.now(),vector:value,href:doc.href,kind:doc.kind});
    }
    completed++;
    if(updates.length>=12)await flush();
    buildStatus.textContent="Обработано "+completed+" из "+targets.length+" выбранных названий. Сохранение каждые 12 записей.";
   }
   await flush();
   const current=await readCache(),saved=new Map(current.map(r=>[r.key,r]));
   let verified=0;
   for(const doc of targets){const r=saved.get(await titleKey(doc.title));if(r?.href===doc.href&&r.kind===doc.kind)verified++;}
   buildStatus.textContent=(buildStop?"Остановлено. ":"Завершено. ")+verified+" из "+targets.length+" выбранных названий подтверждены в кеше. Всего в кеше "+current.length+" из 256 возможных векторов; общий научный архив не индексирован полностью.";
  }catch{try{await flush()}catch{}buildStatus.textContent="Индексация прервана: модель, архив или хранилище недоступны. Ранее сохранённые пакеты не удалены; повторите запуск для продолжения.";}
  finally{buildActive=false;semanticBusy=false;controls();}
 };
 function draw(){host.replaceChildren();for(const r of rows.slice(0,limit)){const article=add(host,"article",""),h=add(article,"h3","");try{const u=new URL(r.href,location.href);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error();if(u.origin===location.origin&&typeof pinned!=="undefined"&&pinned&&dynamicPages.has(u.pathname.split("/").at(-1)))u.searchParams.set("snapshot",pinned);const a=add(h,"a",r.title);a.href=u.href;a.rel="noopener noreferrer"}catch{h.textContent=r.title}add(article,"small",labels[r.kind]+" · "+(r.date||"без даты")+" · "+r.source);add(article,"p",r.description);if(r.exactCode)add(article,"small","Точное совпадение кода");else if(r.exactTitle)add(article,"small","Точное совпадение названия");if(r.expanded)add(article,"small","Найдено также по словарю экономических терминов");if(r.contentMatch)add(article,"small","Совпадение в тексте лицензированной аннотации");if(r.vectorMatch)add(article,"small"," · векторное сходство "+r.similarity.toFixed(3)+" · термины: "+r.shared.join(", "));if(Number.isFinite(r.semanticSimilarity))add(article,"small","Нейросетевое сходство названия "+r.semanticSimilarity.toFixed(3)+" · исходная позиция среди кандидатов "+r.lexicalRank);if(r.abstract_license==="https://creativecommons.org/licenses/by/4.0/"){
 const details=add(article,"details",""),summary=add(details,"summary","Читать аннотацию · CC BY 4.0"),content=add(details,"p","");
 details.addEventListener("toggle",async()=>{if(!details.open||content.dataset.loaded)return;content.dataset.loaded="1";content.textContent="Проверка источника…";
 try{if(!papersPromise)papersPromise=Provenance.get(manifest,"literature.json",root).then(x=>new Map(x.data.articles.map(p=>[p.doi,p]))).catch(e=>{papersPromise=null;throw e});
 const p=(await papersPromise).get(r.code),a=EconomicSearch.verifiedAbstract(r,p,index.built);if(!a)throw Error();
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
 async function run(){const id=++seq;lastQuery="";lastOptions=null;rows=[];baselineRows=[];controls();localResults.replaceChildren();semanticStatus.textContent="";host.replaceChildren();more.hidden=true;const query=q.value.trim();expansion.textContent="";if(!query){status.textContent="Введите поисковый запрос.";return}if(from.value&&to.value&&Number(from.value)>Number(to.value)){status.textContent="Начальный год больше конечного.";return}status.textContent="Проверка поискового индекса…";
 try{await ensureIndex();if(id!==seq)return;
 const options={kind:kind.value,from:Number(from.value),to:Number(to.value),all:all.checked,expand:expand.checked,abstractOnly:abstractOnly.checked,contentOnly:contentOnly.checked,vector:vector.checked};rows=vector.checked?EconomicSearch.contentVector(index,query,options):EconomicSearch.search(index,query,options);const equivalents=EconomicSearch.plan(query,expand.checked).flatMap(x=>x.labels);expansion.textContent=equivalents.length?"Расширение запроса: "+equivalents.slice(0,20).join(" · "):"";limit=20;lastQuery=query;lastOptions=options;baselineRows=rows.slice();draw();controls();status.textContent="Найдено: "+rows.length+" из "+index.docs.length+" · SHA-256 "+fingerprint.slice(0,12);if(vector.checked&&!Array.isArray(index.abstract_norms))status.textContent+=". Векторный индекс отсутствует в этой версии.";else if(contentOnly.checked&&!index.abstract_postings)status.textContent+=". Индекс текста отсутствует в закреплённой версии.";else if(!rows.length)status.textContent+=". Попробуйте снять фильтры или изменить запрос.";
 const u=new URL(location.href);u.searchParams.set("q",query);for(const [k,v] of [["kind",kind.value],["from",from.value],["to",to.value],["all",all.checked?"1":""],["expand",expand.checked?"":"0"],["abstract",abstractOnly.checked?"1":""],["content",contentOnly.checked?"1":""],["vector",vector.checked?"1":""]]){if(v)u.searchParams.set(k,v);else u.searchParams.delete(k)}history.replaceState(null,"",u);
 }catch{if(id===seq)status.textContent="Индекс отсутствует в этой версии или не прошёл контроль. Используйте обычный поиск."}}
 if(abstractSemantic)abstractSemantic.onclick=async()=>{
  if(semanticBusy||!lastQuery||abstractSemantic.disabled)return;
  const token=seq,query=lastQuery,baseline=baselineRows.slice();
  semanticBusy=true;controls();localResults.replaceChildren();semanticStatus.textContent="Проверка лицензий аннотаций…";
  try{
   const papers=(await Provenance.get(manifest,"literature.json",root)).data.articles;
   if(token!==seq)return;
   const candidates=EconomicSearch.abstractCandidates(baseline,papers,index.built);
   if(!candidates.length){semanticStatus.textContent="Нет подтверждённых лицензированных аннотаций в этой выдаче.";return}
   const encoder=await getEncoder(),qv=await encodeText(encoder,query),items=[];
   for(const [i,c] of candidates.entries()){
    if(token!==seq)return;
    const vectors=[];
    for(const chunk of c.chunks){if(token!==seq)return;semanticStatus.textContent="Аннотация "+(i+1)+" из "+candidates.length+" · фрагмент "+(vectors.length+1)+" из "+c.chunks.length;vectors.push(await encodeText(encoder,chunk));}
    items.push({...c,vectors});
   }
   if(token!==seq)return;
   const ranked=EconomicSearch.abstractRank(qv,items);
   add(localResults,"h3","Семантическое сравнение лицензированных аннотаций");
   add(localResults,"p","До четырёх исследований из обычной выдачи. Среднее косинусное сходство фрагментов; модель может ограничивать число токенов. Это не полнотекстовый поиск по всему архиву и не оценка истинности выводов.");
   for(const r of ranked){
    const line=add(localResults,"p",""),a=add(line,"a",r.title);
    try{const u=new URL(r.href,location.href);if(u.protocol!=="https:"||u.hostname!=="doi.org"||u.username||u.password)throw Error();a.href=u.href;a.rel="noopener noreferrer"}catch{a.removeAttribute("href")}
    add(line,"small"," · "+r.authors+" · среднее "+r.abstractSimilarity.toFixed(3)+" · максимум "+r.bestChunk.toFixed(3)+" · фрагментов "+r.chunkCount+" · CC BY 4.0");
   }
   semanticStatus.textContent="Сравнение завершено. Векторы аннотаций и запроса не записывались в IndexedDB. Обычная выдача сохранена.";
  }catch{if(token===seq)semanticStatus.textContent="Аннотации или модель недоступны; обычная выдача сохранена.";}
  finally{semanticBusy=false;controls();}
 };
 semantic.onclick=async()=>{
 if(semanticBusy||!lastQuery)return;
 const token=seq,query=lastQuery,candidates=EconomicSearch.semanticCandidates(baselineRows);
 if(!candidates.length)return;
 semanticBusy=true;controls();semanticStatus.textContent="Подготовка локальной модели; при первом запуске требуется загрузка файлов…";
 try{
  const encoder=await getEncoder();
  if(token!==seq)return;
  let cache=[],cacheAvailable=true,hits=0,saved=null;
  try{cache=await readCache()}catch{cacheAvailable=false}
  const known=new Map(cache.map(r=>[r.key,r])),updates=[],vectors=[];
  const encode=input=>encodeText(encoder,input);
  vectors.push(await encode(query)); // Query vector is never persisted.
  for(const [i,r] of candidates.entries()){
   if(token!==seq)return;
   semanticStatus.textContent="Локальное кодирование: "+(i+1)+" из "+candidates.length+" названий · из кеша "+hits;
   let key=null;try{if(cacheAvailable)key=await titleKey(r.title)}catch{cacheAvailable=false}
   let value=key?known.get(key)?.vector:null;
   if(value)hits++;else value=await encode(r.title);
   vectors.push(value);
   if(key){const record={key,used:Date.now(),vector:value,href:r.href,kind:r.kind};updates.push(record);known.set(key,record)}
  }
  if(token!==seq)return;
  if(cacheAvailable&&updates.length)try{saved=await writeCache(updates)}catch{cacheAvailable=false}
  if(token!==seq)return;
  const ranked=EconomicSearch.semanticRerank(candidates,vectors),selected=new Set(candidates);
  // Preserve all non-candidates and their slots; reorder only the selected research documents.
  let n=0;rows=baselineRows.map(r=>selected.has(r)&&n<ranked.length?ranked[n++]:r);
  draw();semanticStatus.textContent="Нейросеть переупорядочила "+ranked.length+" уже найденных исследований по названиям. Остальные результаты сохранены. Из кеша: "+hits+" из "+ranked.length+". "+(cacheAvailable?"В локальном кеше: "+(saved??cache.length)+" векторов. ":"Кеш недоступен; расчёт выполнен без сохранения. ")+"Не поиск по всему корпусу; сходство не подтверждает качество.";
 }catch{if(token===seq)semanticStatus.textContent="Модель или вычисление недоступны. Обычная выдача сохранена.";}
 finally{semanticBusy=false;controls();}
};
 // Editing a query/filter invalidates both neural actions and in-flight search results.
 // The independently running archive builder is unaffected.
 form.addEventListener("input",()=>{
  ++seq;lastQuery="";lastOptions=null;baselineRows=[];rows=[];host.replaceChildren();
  localResults.replaceChildren();more.hidden=true;expansion.textContent="";semanticStatus.textContent="";
  status.textContent="Параметры изменены. Нажмите «Найти» для обновления выдачи.";controls();
 });
 form.onsubmit=e=>{e.preventDefault();run()};more.onclick=()=>{limit+=20;draw()};
 $("ask").onclick=()=>{const field=document.getElementById("gea-question"),toggle=document.getElementById("gea-toggle");if(field&&toggle){field.value=q.value.slice(0,600);field.dispatchEvent(new Event("input"));if(document.getElementById("gea-panel").hidden)toggle.click()}};
 const saved=new URLSearchParams(location.search);q.value=(saved.get("q")||"").slice(0,600);
 if([...kind.options].some(o=>o.value===saved.get("kind")))kind.value=saved.get("kind");
 for(const [key,field] of [["from",from],["to",to]]){const value=saved.get(key);if(/^\d{4}$/.test(value||"")&&Number(value)>=1900&&Number(value)<=2100)field.value=value}
 vector.checked=saved.get("vector")==="1";contentOnly.checked=saved.get("content")==="1";abstractOnly.checked=saved.get("abstract")==="1";all.checked=saved.get("all")==="1";expand.checked=saved.get("expand")!=="0";if(q.value)run();
});
