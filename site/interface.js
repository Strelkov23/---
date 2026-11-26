/* Local preferences; no account, no network. Never hide methods or data. */
const InterfaceMode=(()=>{
 const modes=['simple','analytical','professional'];
 const descriptions={simple:'Основные задачи, открытые подсказки и компактное меню.',analytical:'Расширенные инструменты рабочих пространств; подсказки остаются доступными.',professional:'Полный каталог, плотные таблицы и сворачиваемые пояснения.'};
 function normalize(value){return modes.includes(value)?value:'simple'}
 function preference(url,stored){return normalize(modes.includes(url)?url:stored)}
 function disclosure(mode,workspace=false){return mode==='professional'||(mode==='analytical'&&workspace)}
 function description(mode){return descriptions[normalize(mode)]}
 function matches(text,category,q,c){const norm=x=>String(x??'').toLowerCase().replaceAll('ё','е').trim();return (!c||category===c)&&norm(q).split(/\s+/).filter(Boolean).every(w=>norm(text).includes(w))}
 function filterTools(items,q){return items.map(text=>matches(text,'',q,''))}
 function theme(value){return ['light','dark','system'].includes(value)?value:'light'}
 function effectiveTheme(value,systemDark){const m=theme(value);return m==='system'?(systemDark?'dark':'light'):m}
 return {normalize,preference,disclosure,description,matches,filterTools,theme,effectiveTheme}
})();
if(typeof module!=='undefined')module.exports=InterfaceMode;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const select=document.getElementById('view-mode'),key='economic-interface-mode';
 let stored;try{stored=localStorage.getItem(key)}catch{}
 const mode=InterfaceMode.preference(new URLSearchParams(location.search).get('view'),stored);
 function apply(value,remember=false){
  const m=InterfaceMode.normalize(value);document.documentElement.dataset.view=m;if(select)select.value=m;
  for(const details of document.querySelectorAll('.section-more'))details.open=InterfaceMode.disclosure(m,!!details.closest('.iv-workspace-card'));
  for(const details of document.querySelectorAll('.v-task-guide details'))details.open=m!=='professional';
  for(const label of document.querySelectorAll('[data-view-description]'))label.textContent=InterfaceMode.description(m);
  document.dispatchEvent(new CustomEvent('economic:view-change',{detail:{mode:m}}));
  if(remember){try{localStorage.setItem(key,m)}catch{}const u=new URL(location.href);u.searchParams.delete('view');history.replaceState(null,'',u)}
 }
 apply(mode);if(select)select.onchange=()=>apply(select.value,true);
 const themeSelect=document.getElementById('theme-mode'),themeKey='economic-visual-theme-v1',media=window.matchMedia('(prefers-color-scheme: dark)');let themeStored;try{themeStored=localStorage.getItem(themeKey)}catch{}
 let chosen=InterfaceMode.theme(themeStored);function drawTheme(){document.documentElement.dataset.theme=InterfaceMode.effectiveTheme(chosen,media.matches);if(themeSelect)themeSelect.value=chosen}
 drawTheme();if(themeSelect)themeSelect.onchange=()=>{chosen=InterfaceMode.theme(themeSelect.value);try{localStorage.setItem(themeKey,chosen)}catch{}drawTheme()};media.addEventListener?.('change',()=>{if(chosen==='system')drawTheme()});
 const nav=document.getElementById('primary-navigation'),navToggle=document.getElementById('mobile-nav-toggle');
 if(nav&&navToggle){
  const narrow=window.matchMedia('(max-width: 600px)');
  let open=false;
  function drawNav(){
   navToggle.hidden=!narrow.matches;
   nav.hidden=narrow.matches&&!open;
   navToggle.setAttribute('aria-expanded',String(narrow.matches&&open));
   navToggle.textContent=open?'Свернуть разделы':'Разделы сайта';
  }
  navToggle.addEventListener('click',()=>{open=!open;drawNav()});
  nav.addEventListener('keydown',e=>{if(e.key==='Escape'&&narrow.matches&&open){open=false;drawNav();navToggle.focus()}});
  narrow.addEventListener?.('change',()=>{if(narrow.matches&&nav.contains(document.activeElement))navToggle.focus();open=false;drawNav()});
  drawNav();
 }
 const hub=document.getElementById('hub-query');
 if(hub){
  const cards=[...document.querySelectorAll('#hub-tools article')],status=document.getElementById('hub-status');
  const update=()=>{const visible=InterfaceMode.filterTools(cards.map(c=>c.textContent),hub.value);cards.forEach((c,i)=>c.hidden=!visible[i]);status.textContent='Найдено инструментов: '+visible.filter(Boolean).length+' из '+cards.length};
  hub.oninput=update;update();
 }
 const form=document.getElementById('glossary-form');if(!form)return;
 const q=document.getElementById('glossary-query'),c=document.getElementById('glossary-category'),status=document.getElementById('glossary-status'),rows=[...document.querySelectorAll('#glossary-list article')];
 function filter(){let count=0;for(const r of rows){const show=InterfaceMode.matches(r.textContent,r.dataset.category,q.value,c.value);r.hidden=!show;if(show)count++}status.textContent='Найдено терминов: '+count+' из '+rows.length}
 q.oninput=c.onchange=filter;form.onsubmit=e=>{e.preventDefault();filter()};form.onreset=()=>setTimeout(filter,0);filter()
});
