/* Browser-only search; no inference, no third-party query transmission. */
const SiteSearch=(()=>{
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е').replace(/\s+/g,' ').trim();
 function words(q){return norm(q).split(' ').filter(Boolean).slice(0,12)}
 function rank(r,q){
  const tokens=words(q),title=norm(r.title),full=norm([r.title,r.description,r.section,r.code,r.source,r.authors,r.topics].join(' '));
  if(!tokens.length||!tokens.every(t=>full.includes(t)))return -1;
  return tokens.reduce((s,t)=>s+(title.includes(t)?3:1),0)+(title.includes(norm(q))?4:0)
 }
 function find(rows,q){return rows.map(r=>({r,score:rank(r,q)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||String(b.r.date||'').localeCompare(String(a.r.date||''))||String(a.r.title).localeCompare(String(b.r.title),'ru')).map(x=>x.r)}
 function questionNorm(q){return norm(q).replace(/[?!.,:;«»"()]/g,' ').replace(/\s+/g,' ').trim()}
 function questionScore(r,q){
  const phrase=questionNorm(q),tokens=words(phrase);
  if(!tokens.length)return -1;
  let score=-1;
  for(const alias of (Array.isArray(r.questions)?r.questions:[])){
   const a=questionNorm(alias);
   if(phrase===a)score=Math.max(score,100);
   else if(tokens.length>=2&&tokens.every(t=>a.includes(t)))score=Math.max(score,30+tokens.length);
  }
  return score
 }
 function findTools(rows,q){return rows.map(r=>({r,score:Math.max(rank(r,questionNorm(q)),questionScore(r,q))})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||String(a.r.title).localeCompare(String(b.r.title),'ru')).map(x=>x.r)}
 function href(base,key,value){return base+'?'+encodeURIComponent(key)+'='+encodeURIComponent(value)}
 return {norm,words,rank,find,findTools,questionScore,href}
})();
if(typeof module!=='undefined')module.exports=SiteSearch;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),form=$('site-search-form');if(!form)return;
 const q=$('site-search-q'),scope=$('site-search-scope'),status=$('site-search-status'),host=$('site-search-results'),cache=new Map();
 const groups={tools:['Инструменты','site-search.json',d=>d],data:['Статистические ряды','data-registry.json',d=>d.rows.map(r=>({title:r.title,description:[r.unit,r.territory,r.count+' наблюдений',r.first,r.last].filter(Boolean).join(' · '),code:r.code,source:r.source,section:r.group,href:SiteSearch.href('data-registry.html','id',r.id)}))],news:['Новости','archive.json',d=>d.map(r=>({title:r.title,description:[r.source,String(r.published||'').slice(0,10),r.topics].filter(Boolean).join(' · '),source:r.source,topics:r.topics,date:r.published,href:r.url,external:true}))],papers:['Научные статьи','literature.json',d=>d.articles.map(r=>({title:r.title,description:[r.authors,r.journal,String(r.published||'').slice(0,10)].filter(Boolean).join(' · '),authors:r.authors,source:r.journal,topics:r.topics,code:r.doi,date:r.published,href:SiteSearch.href('papers.html','term',r.doi||r.title)}))]};
 let sequence=0,manifestPromise;
 function manifest(){if(!manifestPromise)manifestPromise=load('data-manifest.json').then(Provenance.validateManifest).catch(e=>{manifestPromise=null;throw e});return manifestPromise}
 function get(key){if(!cache.has(key)){const p=manifest().then(m=>Provenance.get(m,groups[key][1],root)).then(r=>groups[key][2](r.data)).catch(e=>{cache.delete(key);throw e});cache.set(key,p)}return cache.get(key)}
 function url(r){
  if(r.external){try{const u=new URL(r.href);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
  const u=new URL(r.href,location.href);if(u.origin!==location.origin||!u.pathname.startsWith(location.pathname.slice(0,location.pathname.lastIndexOf('/')+1)))return null;
  if(pinned&&dynamicPages.has(u.pathname.split('/').at(-1)))u.searchParams.set('snapshot',pinned);
  return u.href
 }
 async function search(){
  const id=++sequence,query=q.value.trim(),keys=scope.value==='all'?Object.keys(groups):[scope.value];host.replaceChildren();
  const u=new URL(location.href);u.searchParams.set('q',query);u.searchParams.set('site-search-scope',scope.value);history.replaceState(null,'',u);
  if(!query){status.textContent='Введите запрос.';return}
  status.textContent='Поиск в выбранных разделах…';
  const results=await Promise.allSettled(keys.map(async key=>({key,rows:(key==='tools'?SiteSearch.findTools:SiteSearch.find)(await get(key),query)})));if(id!==sequence)return;
  let total=0,failed=0;
  results.forEach((result,i)=>{
   const key=keys[i],section=node('section','');section.append(node('h2',groups[key][0]));
   if(result.status==='rejected'){failed++;section.append(node('p','Набор недоступен для этой версии. Повторите запрос.'));host.append(section);return}
   const rows=result.value.rows;total+=rows.length;section.append(node('p','Найдено: '+rows.length));let limit=10;
   const items=node('div',''),more=node('button','Показать ещё');more.type='button';
   function draw(){items.replaceChildren();for(const r of rows.slice(0,limit)){const article=node('article',''),h=node('h3',''),link=url(r);if(link){const a=node('a',r.title||'Без названия');a.href=link;if(r.external){a.target='_blank';a.rel='noopener noreferrer'}h.append(a)}else h.textContent=r.title||'Без названия';article.append(h,node('p',r.description||''));items.append(article)}more.hidden=rows.length<=limit}
   more.onclick=()=>{limit+=20;draw()};section.append(items,more);draw();host.append(section)
  });
  status.textContent='Найдено записей: '+total+(failed?' · недоступных наборов: '+failed:'')+'. Записи в разных разделах могут пересекаться.'
 }
 q.value=new URLSearchParams(location.search).get('q')||'';restore(['site-search-scope']);form.onsubmit=e=>{e.preventDefault();search()};scope.onchange=search;if(q.value)search()
});
