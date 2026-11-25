/* Keep wide data tables in their own keyboard-scrollable viewport.
   Do not clip the page or hide content to conceal layout defects. */
const MapViewport=(()=>{
 function dimensions(width,viewport,zoom){return Math.round(Math.max(1,Math.min(width,viewport))*Math.max(1,Math.min(4,zoom)))}
 function mount(wrap,svg){
  if(wrap.dataset.mapViewport)return;wrap.dataset.mapViewport='1';
  wrap.classList.add('map-viewport');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Карта: масштабирование кнопками, прокрутка стрелками или жестом');
  const width=svg.viewBox.baseVal.width,bar=document.createElement('div');bar.className='actions map-controls';
  const status=document.createElement('span');status.setAttribute('role','status');let zoom=1;
  function update(center=true){
   const prior=svg.getBoundingClientRect().width,oldX=wrap.scrollLeft,oldY=wrap.scrollTop,w=dimensions(width,wrap.clientWidth||width,zoom);
   svg.style.width=w+'px';svg.style.minWidth=w+'px';svg.style.maxWidth='none';svg.style.height='auto';
   if(center&&prior){const ratio=w/prior;wrap.scrollLeft=(oldX+wrap.clientWidth/2)*ratio-wrap.clientWidth/2;wrap.scrollTop=(oldY+wrap.clientHeight/2)*ratio-wrap.clientHeight/2}
   status.textContent='Масштаб: '+Math.round(zoom*100)+'%';minus.disabled=zoom<=1;plus.disabled=zoom>=4;
  }
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;bar.append(b);return b}
  const minus=button('− Уменьшить',()=>{zoom=Math.max(1,zoom-.5);update()}),plus=button('+ Увеличить',()=>{zoom=Math.min(4,zoom+.5);update()});
  button('Вся карта',()=>{zoom=1;update(false);wrap.scrollTo(0,0)});bar.append(status);wrap.before(bar);update(false);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(wrap.isConnected)update(false);else observer.disconnect()});observer.observe(wrap)}
 }
 return {dimensions,mount}
})();
if(typeof module!=='undefined')module.exports=MapViewport;
(function(){
 if(typeof document==='undefined')return;
 const known='.atlas-table,.table-scroll,#month-list,#stat-list,#pair-table';
 const watched=new WeakSet();
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{for(const e of entries){const wrap=e.target;if(!wrap.isConnected){resize.unobserve(wrap);continue}updateWide(wrap)}}):null;
 function updateWide(wrap){
  const hint=wrap.previousElementSibling;
  if(!hint||!hint.classList.contains('table-scroll-hint'))return;
  const wide=wrap.scrollWidth>wrap.clientWidth+3;wrap.dataset.wide=String(wide);hint.dataset.visible=String(wide);
 }
 function tableHint(wrap){
  if(!watched.has(wrap)){
   watched.add(wrap);
   const hint=document.createElement('p');hint.className='table-scroll-hint';hint.setAttribute('aria-hidden','true');hint.textContent='↔ Прокрутите таблицу горизонтально, чтобы увидеть все столбцы.';
   wrap.before(hint);if(resize)resize.observe(wrap);
  }
  updateWide(wrap);
 }

 function enhance(root){
  for(const table of root.querySelectorAll('table')){
   if(table.closest(known))continue;
   const parent=table.parentElement;if(!parent)continue;
   const wrap=document.createElement('div');wrap.className='table-scroll';
   parent.insertBefore(wrap,table);wrap.append(table);
  }
  for(const svg of root.querySelectorAll('.regional-figure-scroll svg')){
   if(svg.closest('.geo-figure')){MapViewport.mount(svg.parentElement,svg);continue}
   const width=svg.viewBox.baseVal.width;if(width>0&&svg.style.minWidth!==width+'px')svg.style.minWidth=width+'px';
  }
  for(const wrap of root.querySelectorAll(known)){
   if(!wrap.querySelector('table'))continue;
   if(!wrap.hasAttribute('tabindex'))wrap.tabIndex=0;
   if(!wrap.hasAttribute('role'))wrap.setAttribute('role','region');
   if(!wrap.hasAttribute('aria-label'))wrap.setAttribute('aria-label','Таблица данных; при необходимости прокручивайте по горизонтали');
   if(root.querySelector('.atlas-tools'))tableHint(wrap);
  }
 }
 function start(){
  const main=document.querySelector('main');if(!main)return;
  const tools=main.querySelector('.atlas-tools');
  if(tools){for(const section of main.querySelectorAll(':scope > section:not(.mast)')){if(!section.id)continue;const link=document.createElement('a');link.className='atlas-back';link.href='#atlas-tools';link.textContent='↑ К инструментам страницы';section.append(link)}}
  enhance(main);
  let scheduled=false;
  new MutationObserver(records=>{
   if(scheduled||!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('table,svg')||n.querySelector('table,svg')))))return;
   scheduled=true;queueMicrotask(()=>{scheduled=false;enhance(main)});
  }).observe(main,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
