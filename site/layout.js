/* Keep wide data tables in their own keyboard-scrollable viewport.
   Do not clip the page or hide content to conceal layout defects. */
const MapViewport=(()=>{
 function dimensions(width,viewport,zoom){return Math.round(Math.max(1,Math.min(width,viewport))*Math.max(1,Math.min(4,zoom)))}
 function nextZoom(zoom,step){return Math.max(1,Math.min(4,Math.round((zoom+step)*2)/2))}
 function mount(wrap,svg){
  if(wrap.dataset.mapViewport)return;wrap.dataset.mapViewport='1';
  wrap.classList.add('map-viewport');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Карта: масштабирование кнопками + и −, прокрутка стрелками или жестом');
  const width=svg.viewBox.baseVal.width,bar=document.createElement('div');bar.className='actions map-controls';bar.setAttribute('role','group');bar.setAttribute('aria-label','Управление масштабом карты');
  const status=document.createElement('span');status.setAttribute('role','status');let zoom=1;
  function update(center=true){
   const prior=svg.getBoundingClientRect().width,oldX=wrap.scrollLeft,oldY=wrap.scrollTop,w=dimensions(width,wrap.clientWidth||width,zoom);
   svg.style.width=w+'px';svg.style.minWidth=w+'px';svg.style.maxWidth='none';svg.style.height='auto';
   if(center&&prior){const ratio=w/prior;wrap.scrollLeft=(oldX+wrap.clientWidth/2)*ratio-wrap.clientWidth/2;wrap.scrollTop=(oldY+wrap.clientHeight/2)*ratio-wrap.clientHeight/2}
   status.textContent='Масштаб: '+Math.round(zoom*100)+'%';minus.disabled=zoom<=1;plus.disabled=zoom>=4;reset.disabled=zoom===1;
  }
  function change(step){zoom=nextZoom(zoom,step);update()}
  function button(text,label,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=fn;bar.append(b);return b}
  const minus=button('−','Уменьшить масштаб карты',()=>change(-.5)),plus=button('+','Увеличить масштаб карты',()=>change(.5));
  const reset=button('Вся карта','Сбросить масштаб карты',()=>{zoom=1;update(false);wrap.scrollTo(0,0)});
  bar.append(status);wrap.before(bar);
  const hint=document.createElement('p');hint.className='map-viewport-hint';hint.textContent='Увеличьте карту для просмотра небольших регионов. Перемещайтесь прокруткой или жестом; с клавиатуры — стрелками, + и −.';bar.after(hint);
  wrap.addEventListener('keydown',e=>{
   if(e.target!==wrap||e.ctrlKey||e.metaKey||e.altKey)return;
   if(e.key==='+'||e.key==='='){e.preventDefault();change(.5)}
   else if(e.key==='-'){e.preventDefault();change(-.5)}
   else if(e.key==='0'){e.preventDefault();zoom=1;update(false);wrap.scrollTo(0,0)}
  });
  update(false);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(wrap.isConnected)update(false);else observer.disconnect()});observer.observe(wrap)}
 }
 return {dimensions,nextZoom,mount}
})();
if(typeof module!=='undefined')module.exports=MapViewport;
(function(){
 if(typeof document==='undefined')return;
 const known='.atlas-table,.table-scroll,#month-list,#stat-list,#pair-table';
 const watched=new Set();
 const including=(root,selector)=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{for(const e of entries){const wrap=e.target;if(!wrap.isConnected){resize.unobserve(wrap);watched.delete(wrap);continue}updateWide(wrap)}}):null;
 function updateWide(wrap){
  const hint=wrap.previousElementSibling;
  if(!hint||!hint.classList.contains('table-scroll-hint'))return;
  const wide=wrap.scrollWidth>wrap.clientWidth+3;wrap.dataset.wide=String(wide);hint.dataset.visible=String(wide);
 }
 function tableHint(wrap){
  if(!watched.has(wrap)){
   watched.add(wrap);
   if(!wrap.previousElementSibling?.classList.contains('table-scroll-hint')){const hint=document.createElement('p');hint.className='table-scroll-hint';hint.setAttribute('aria-hidden','true');hint.textContent='↔ Прокрутите таблицу горизонтально, чтобы увидеть все столбцы.';wrap.before(hint)}
   if(resize)resize.observe(wrap);
  }
  updateWide(wrap);
 }

 function enhance(root){
  const touched=new Set();
  for(const table of including(root,'table')){
   const existing=table.closest(known);if(existing){touched.add(existing);continue}
   const parent=table.parentElement;if(!parent)continue;
   const wrap=document.createElement('div');wrap.className='table-scroll';
   parent.insertBefore(wrap,table);wrap.append(table);touched.add(wrap);
  }
  for(const svg of including(root,'.regional-figure-scroll svg')){
   if(svg.closest('.geo-figure')){MapViewport.mount(svg.parentElement,svg);continue}
   const width=svg.viewBox.baseVal.width;if(width>0&&svg.style.minWidth!==width+'px')svg.style.minWidth=width+'px';
  }
  for(const wrap of including(root,known))touched.add(wrap);
  const containing=root.closest?.(known);if(containing)touched.add(containing);
  for(const wrap of touched){
   if(!wrap.querySelector('table'))continue;
   if(!wrap.hasAttribute('tabindex'))wrap.tabIndex=0;
   if(!wrap.hasAttribute('role'))wrap.setAttribute('role','region');
   if(!wrap.hasAttribute('aria-label'))wrap.setAttribute('aria-label','Таблица данных; при необходимости прокручивайте по горизонтали');
   tableHint(wrap);
  }
 }
 function start(){
  const main=document.querySelector('main');if(!main)return;
  const tools=main.querySelector('.atlas-tools');
  if(tools){for(const section of main.querySelectorAll(':scope > section:not(.mast)')){if(!section.id)continue;const link=document.createElement('a');link.className='atlas-back';link.href='#atlas-tools';link.textContent='↑ К инструментам страницы';section.append(link)}}
  const index=main.querySelector('#v-section-index');
  if(index){
   for(const a of index.querySelectorAll('a[href^="#"]')){
    const target=document.getElementById(a.hash.slice(1));if(!target)continue;
    a.addEventListener('click',()=>{if(!target.matches('input,select,button,textarea,a,summary')&&!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true})});
   }
   for(const section of main.querySelectorAll(':scope > section[id]')){
    if(![...index.querySelectorAll('a')].some(a=>a.hash==='#'+section.id))continue;
    const back=document.createElement('a');back.href='#v-section-index';back.className='v-index-back';back.textContent='↑ К содержанию страницы';section.append(back);
   }
  }
  enhance(main);
  let scheduled=false;const pending=new Set();
  function enqueue(root){if(!root||!main.contains(root))return;for(const item of pending){if(item.contains(root))return;if(root.contains(item))pending.delete(item)}pending.add(root)}
  new MutationObserver(records=>{
   // Observe only changed table containers and newly added charts/tables.
   // A single updated graph no longer rescans every existing table on the page.
   for(const r of records){
    const target=r.target.nodeType===1?r.target:r.target.parentElement;
    const table=target?.closest('table');if(table)enqueue(table.closest(known)||table);
    for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches('table,svg')||n.querySelector('table,svg')))enqueue(n);
   }
   for(const wrap of watched)if(!main.contains(wrap)){resize?.unobserve(wrap);watched.delete(wrap)}
   if(scheduled||!pending.size)return;
   scheduled=true;queueMicrotask(()=>{scheduled=false;const roots=[...pending];pending.clear();for(const root of roots)if(main.contains(root))enhance(root)});
  }).observe(main,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
