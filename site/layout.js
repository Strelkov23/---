/* Keep wide data tables in their own keyboard-scrollable viewport.
   Do not clip the page or hide content to conceal layout defects. */
(function(){
 if(typeof document==='undefined')return;
 const known='.atlas-table,.table-scroll,#month-list,#stat-list,#pair-table';
 function enhance(root){
  for(const table of root.querySelectorAll('table')){
   if(table.closest(known))continue;
   const parent=table.parentElement;if(!parent)continue;
   const wrap=document.createElement('div');wrap.className='table-scroll';
   parent.insertBefore(wrap,table);wrap.append(table);
  }
  for(const wrap of root.querySelectorAll(known)){
   if(!wrap.querySelector('table'))continue;
   if(!wrap.hasAttribute('tabindex'))wrap.tabIndex=0;
   if(!wrap.hasAttribute('role'))wrap.setAttribute('role','region');
   if(!wrap.hasAttribute('aria-label'))wrap.setAttribute('aria-label','Таблица данных; при необходимости прокручивайте по горизонтали');
  }
 }
 function start(){
  const main=document.querySelector('main');if(!main)return;
  enhance(main);
  let scheduled=false;
  new MutationObserver(records=>{
   if(scheduled||!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('table')||n.querySelector('table')))))return;
   scheduled=true;queueMicrotask(()=>{scheduled=false;enhance(main)});
  }).observe(main,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
