/* Task-first dashboard; local preference is optional, all links work without JS. */
const IVWorkspaces=(()=>{
 const ids=['overview','diagnostics','simulator','plans','science'];
 function normalize(x){return String(x??'').toLowerCase().replaceAll('ё','е').trim()}
 function matches(text,q){return normalize(q).split(/\s+/).filter(Boolean).every(word=>normalize(text).includes(word))}
 function order(pin){return ids.includes(pin)?[pin,...ids.filter(x=>x!==pin)]:[...ids]}
 return {ids,matches,order}
})();
if(typeof module!=='undefined')module.exports=IVWorkspaces;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),grid=$('iv-workspace-grid');if(!grid)return;
 const cards=new Map([...grid.querySelectorAll('[data-workspace]')].map(x=>[x.dataset.workspace,x])),query=$('iv-workspace-query'),status=$('iv-workspace-status'),key='iv-workspace-pin-v1';let pinned=null;
 try{const value=localStorage.getItem(key);if(IVWorkspaces.ids.includes(value))pinned=value}catch{}
 // Cache searchable contents before adding or changing preference labels.
 const texts=new Map([...cards].map(([id,c])=>[id,c.querySelector('h3').textContent+' '+[...c.querySelectorAll('p,a')].map(e=>e.textContent).join(' ')]));
 function render(){const q=query.value.trim();let count=0;for(const id of IVWorkspaces.order(pinned)){const c=cards.get(id),pin=c.querySelector('button'),visible=IVWorkspaces.matches(texts.get(id),q);grid.append(c);c.hidden=!visible;if(visible)count++;pin.setAttribute('aria-pressed',String(pinned===id));pin.textContent=pinned===id?'Закреплено первым':'Закрепить первым';c.classList.toggle('iv-workspace-pinned',pinned===id);if(q&&visible)c.querySelector('details').open=true;else if(!q)c.querySelector('details').open=['analytical','professional'].includes(document.documentElement.dataset.view)}status.textContent='Найдено пространств: '+count+' из '+cards.size+(pinned?' · закреплено: '+cards.get(pinned).querySelector('h3').textContent:'')+(count===0?'. Попробуйте поиск по всему сайту.':'')}
 function save(){try{if(pinned)localStorage.setItem(key,pinned);else localStorage.removeItem(key)}catch{}}
 for(const [id,c] of cards){const b=c.querySelector('button');b.hidden=false;b.onclick=()=>{pinned=pinned===id?null:id;save();render();b.focus()}}
 document.addEventListener('economic:view-change',render);query.oninput=render;$('iv-workspace-reset').onclick=()=>{query.value='';pinned=null;save();render();query.focus()};$('iv-workspace-tools').hidden=false;render()
});
