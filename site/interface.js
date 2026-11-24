/* Local preferences; no account, no network. Never hide methods or data. */
const InterfaceMode=(()=>{
 function normalize(value){return value==='professional'?'professional':'simple'}
 function preference(url,stored){return normalize(url==='professional'||url==='simple'?url:stored)}
 function matches(text,category,q,c){const norm=x=>String(x??'').toLowerCase().replaceAll('ё','е').trim();return (!c||category===c)&&norm(q).split(/\s+/).filter(Boolean).every(w=>norm(text).includes(w))}
 return {normalize,preference,matches}
})();
if(typeof module!=='undefined')module.exports=InterfaceMode;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const select=document.getElementById('view-mode'),key='economic-interface-mode';
 let stored;try{stored=localStorage.getItem(key)}catch{}
 const mode=InterfaceMode.preference(new URLSearchParams(location.search).get('view'),stored);
 function apply(value,remember=false){
  const m=InterfaceMode.normalize(value);document.documentElement.dataset.view=m;if(select)select.value=m;
  for(const details of document.querySelectorAll('.section-more'))details.open=m==='professional';
  if(remember){try{localStorage.setItem(key,m)}catch{}const u=new URL(location.href);u.searchParams.delete('view');history.replaceState(null,'',u)}
 }
 apply(mode);if(select)select.onchange=()=>apply(select.value,true);
 const form=document.getElementById('glossary-form');if(!form)return;
 const q=document.getElementById('glossary-query'),c=document.getElementById('glossary-category'),status=document.getElementById('glossary-status'),rows=[...document.querySelectorAll('#glossary-list article')];
 function filter(){let count=0;for(const r of rows){const show=InterfaceMode.matches(r.textContent,r.dataset.category,q.value,c.value);r.hidden=!show;if(show)count++}status.textContent='Найдено терминов: '+count+' из '+rows.length}
 q.oninput=c.onchange=filter;form.onsubmit=e=>{e.preventDefault();filter()};form.onreset=()=>setTimeout(filter,0);filter()
});
