/* Progressive enhancement: all five sections remain usable without this script. */
const IVLabNav=(()=>{
 const ids=['basic-lab','policy-lab','allocation-lab','trajectory-lab','iv-technology-lab'];
 function resolve(hash){const id=String(hash||'').replace(/^#/,'');return ids.includes(id)?id:'all'}
 return {ids,resolve}
})();
if(typeof module!=='undefined')module.exports=IVLabNav;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),nav=$('iv-lab-nav');if(!nav)return;
 const sections=IVLabNav.ids.map($);if(sections.some(x=>!x))return;
 const links=[...nav.querySelectorAll('[data-lab]')],status=$('iv-lab-nav-status');
 function show(id){for(const section of sections)section.hidden=id!=='all'&&section.id!==id;for(const a of links){if(a.dataset.lab===id)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')}status.textContent=id==='all'?'Все пять лабораторий доступны на одной странице.':'Выбрано: '+$(id).querySelector('h2').textContent+'. При переключении параметры сохраняются. В двух многолетних моделях доступно отдельное локальное сохранение.'}
 function route(){show(IVLabNav.resolve(location.hash))}
 for(const a of links)a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();const id=a.dataset.lab,u=new URL(location.href);u.hash=id==='all'?'iv-lab-nav':id;if(u.href!==location.href)history.pushState(null,'',u);show(id);if(id!=='all'){$(id).querySelector('h2').focus({preventScroll:true});$(id).scrollIntoView({block:'start'})}else nav.scrollIntoView({block:'start'})});
 // Jump within the visible laboratory without changing the route or resetting inputs.
 for(const section of sections)for(const button of section.querySelectorAll('[data-v-jump]')){
  const target=$(button.dataset.vJump);if(!target||!section.contains(target))continue;
  button.hidden=false;button.onclick=()=>{
   const control=target.matches('input,select,button,textarea')?target:target.querySelector('input:not(:disabled),select:not(:disabled),button:not(:disabled)');
   const focus=control&&!control.disabled?control:target;
   if(!focus.matches('input,select,button,textarea,a[href]'))focus.setAttribute('tabindex','-1');
   target.scrollIntoView({block:'center'});if(!focus.disabled)focus.focus({preventScroll:true});
  }
 }
 window.addEventListener('popstate',route);window.addEventListener('hashchange',route);route()
});
