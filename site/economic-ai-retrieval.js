/* Local lexical retrieval from verified archive metadata. */
const EconomicAIRetrieval=(function retrieval(){
 const stop=new Set("что как какой какая какие когда почему где есть это для при или над под про чем можно нельзя нужно российской россии экономика экономике экономический экономического данные статистика показатель покажи расскажи объясни найди последние новые по на из от до за об о в и с к а у".split(" "));
 function words(s){return (String(s??"").toLowerCase().replaceAll("ё","е").match(/[\p{L}\p{N}]+/gu)||[]).filter(x=>x.length>=3&&!stop.has(x))}
 function stem(x){return x.length<5?x:x.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|иях|иям|ией|ия|ии|ий|ию|ие|ях|ах|ам|ом|ов|ем|ая|ые|ый|ой|ую|а|ы|у|и|е|я|ю)$/u,"")}
 function tokens(s){return new Set(words(s).map(stem))}
 function date(s){return typeof s==="string"&&/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?(?:T.*)?$/.test(s)?(s.length===4?s+"-12":s.slice(0,7)):null}
 function url(s){return typeof s==="string"&&/^https?:\/\/[a-z0-9.-]+(?::(?:80|443))?(?:\/[^\s\\]*|$)/i.test(s)}
 function collect(rows,kind,q,cutoff,limit=3){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(cutoff)||!["news","papers"].includes(kind))return [];
  const query=[...tokens(q)].slice(0,20);if(!query.length)return [];
  const found=[];const seen=new Set();
  for(const r of rows){
   const period=date(r.published);if(!period||period>cutoff||typeof r.title!=="string"||!r.title.trim())continue;
   const href=kind==="news"?r.url:typeof r.doi==="string"&&/^10\.\d{4,9}\/\S+$/i.test(r.doi)?"https://doi.org/"+r.doi:null;
   if(!url(href)||seen.has(href))continue;
   const title=tokens(r.title),other=tokens([r.topics,r.source,r.authors,r.journal].join(" "));
   const matches=query.filter(w=>title.has(w)||other.has(w));if(!matches.length||!matches.some(w=>title.has(w))&&matches.length<2)continue;
   const score=matches.reduce((n,w)=>n+(title.has(w)?4:1),0);
   seen.add(href);found.push({kind,title:r.title.slice(0,350),source:String((kind==="news"?r.source:r.journal)||"").slice(0,150),published:String(r.published).slice(0,10),url:href,score,matched:matches.length,limit:"Только библиографические сведения и заголовок; содержание и достоверность утверждений не проверены."});
  }
  return found.sort((a,b)=>b.score-a.score||b.matched-a.matched||b.published.localeCompare(a.published)||a.url.localeCompare(b.url)).slice(0,limit).map((r,i)=>({...r,id:(kind==="news"?"news":"paper")+(i+1)}));
 }
 function citations(answer,records,docs){
  const allowed=new Set([...records,...docs].map(r=>r.id));
  const cited=[...new Set(Array.from(String(answer||"").matchAll(/\[([a-z][a-z0-9_-]{0,40})\]/gi),m=>m[1]))];
  return {unknown:cited.filter(x=>!allowed.has(x)),known:cited.filter(x=>allowed.has(x))};
 }
 return {words,stem,date,url,collect,citations};
})();
if(typeof module!=="undefined")module.exports=EconomicAIRetrieval;
