/* Demand-driven stress tests, fixed technology and prices. No supply-side forecast. */
const ChainStress=(()=>{
 const sum=a=>a.reduce((s,x)=>s+x,0);
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function validate(m){
  const n=m.names.length;
  if(n!==19||[m.output,m.demand,m.imports].some(v=>!Array.isArray(v)||v.length!==n||v.some(x=>!finite(x)))||[m.effects,m.flows].some(a=>!Array.isArray(a)||a.length!==n||a.some(r=>!Array.isArray(r)||r.length!==n||r.some(x=>!finite(x)))))throw Error('Invalid balance dimensions');
  if(m.output.some(x=>x<=0))throw Error('Non-positive base output');
  return n;
 }
 function calculate(m,shock,caps){
  const n=validate(m);
  if(shock.length!==n||caps.length!==n||shock.some(v=>!finite(v)||v< -20||v>20)||caps.some(v=>!finite(v)||v<0||v>100))throw Error('Invalid scenario');
  const direct=shock.map((v,i)=>m.demand[i]*v/100000);
  const contributions=m.effects.map(row=>row.map((v,i)=>v*shock[i]/100000));
  const dx=contributions.map(sum),pct=dx.map((v,i)=>v*100000/m.output[i]),importByShock=m.imports.map((v,i)=>v*shock[i]/100000);
  const bounds=pct.map((v,i)=>v>0?caps[i]/v:v<0?100/(-v):Infinity);
  const alpha=Math.min(1,...bounds);
  const binding=bounds.map((v,i)=>v<=1&&Math.abs(v-alpha)<=1e-10?i:-1).filter(i=>i>=0);
  const rows=m.names.map((name,i)=>({name,shock:shock[i],direct:direct[i],dx:dx[i],pct:pct[i],cap:caps[i],shortfall:Math.max(0,dx[i]-m.output[i]*caps[i]/100000),belowZero:pct[i]<-100,scaled:alpha*dx[i],positive:sum(contributions[i].filter(v=>v>0)),negative:sum(contributions[i].filter(v=>v<0)),binding:binding.includes(i)}));
  return {rows,direct:sum(direct),total:sum(dx),imports:sum(importByShock),grossImportIncrease:sum(importByShock.filter(v=>v>0)),grossImportDecrease:sum(importByShock.filter(v=>v<0)),alpha,binding,contributions};
 }
 function concentration(values){
  if(values.some(v=>!finite(v)||v<0))return null;
  const total=sum(values);if(total<=0)return null;
  const shares=values.map(v=>v/total).sort((a,b)=>b-a);
  return {total,hhi:sum(shares.map(v=>v*v)),top3:sum(shares.slice(0,3)),top1:shares[0]};
 }
 function breakdown(result,index){
  if(!Number.isInteger(index)||index<0||index>=result.rows.length)throw Error('Invalid group');
  const row=result.rows[index],parts=result.contributions[index].map((value,j)=>({j,name:result.rows[j].name,value,direct:j===index?row.direct:0,indirect:value-(j===index?row.direct:0)})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.j-b.j);
  return {direct:row.direct,indirect:row.dx-row.direct,total:row.dx,parts};
 }
 function constraints(result){
  return result.rows.map((r,i)=>({i,name:r.name,required:r.pct,limit:r.cap,scaled:r.pct*result.alpha,gap:Math.max(0,r.pct-r.cap),lowerGap:Math.max(0,-100-r.pct),binding:r.binding})).sort((a,b)=>Number(b.binding)-Number(a.binding)||Math.max(b.gap,b.lowerGap)-Math.max(a.gap,a.lowerGap)||Math.abs(b.required)-Math.abs(a.required)||a.i-b.i);
 }
 return {validate,calculate,concentration,breakdown,constraints};
})();
if(typeof module!=='undefined')module.exports=ChainStress;

if(typeof document!=='undefined'){

document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('stress-form');if(!form)return;
 const host=$('stress-controls'),status=$('stress-status'),metrics=$('stress-metrics'),out=$('stress-results'),matrix=$('stress-contributions'),btn=$('stress-csv'),matrixBtn=$('stress-matrix-csv');
 const f=v=>Number.isFinite(v)?fmt(v):'—',sum=a=>a.reduce((s,x)=>s+x,0);
 const field=(v,min,max,label)=>{const x=node('input','');x.type='number';x.min=min;x.max=max;x.step='0.1';x.value=v;x.setAttribute('aria-label',label);return x};
 const table=(parent,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=v??'—'}}parent.replaceChildren(t);return t};
 const graph=$('stress-limit-chart'),decomp=$('stress-decomp-chart'),pick=$('stress-decomp-group'),decompStatus=$('stress-decomp-status'),decompCsv=$('stress-decomp-csv');
 const addMetric=(label,v)=>{const b=node('div','');b.className='metric';b.append(node('b',v),node('span',label));metrics.append(b)};
 try{
  const m=await load('sectors.json');ChainStress.validate(m);
  if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}
  const qs=new URLSearchParams(location.search),read=(key,def,min,max)=>{const parts=qs.get(key)?.split(',').map(Number)||[];return parts.length===m.names.length&&parts.every(v=>Number.isFinite(v)&&v>=min&&v<=max)?parts:m.names.map(()=>def)};
  const initialShock=read('stress-shocks',0,-20,20),initialCaps=read('stress-caps',10,0,100);
  pick.replaceChildren(...m.names.map((n,i)=>new Option(n,String(i))));pick.value='8';
  const shocks=m.names.map((n,i)=>field(initialShock[i],-20,20,'Изменение спроса: '+n)),caps=m.names.map((n,i)=>field(initialCaps[i],0,100,'Предел прироста: '+n));
  table(host,['Группа','Выпуск базы, млрд ₽','Конечный спрос базы, млрд ₽','Шок спроса, %','Предел прироста, %'],m.names.map((n,i)=>[n,f(m.output[i]/1000),f(m.demand[i]/1000),shocks[i],caps[i]]));
  let latest=null;
  function renderBreakdown(){
   decomp.replaceChildren();decompCsv.disabled=true;
   if(!latest){decompStatus.textContent='Сначала задайте корректные параметры.';return}
   const i=Number(pick.value),r=ChainStress.breakdown(latest,i),row=latest.rows[i],signed=v=>(v>0?'+':'')+f(v);
   decompStatus.textContent=row.name+' · прямое изменение конечного спроса: '+signed(r.direct)+' · косвенный эффект: '+signed(r.indirect)+' · итог выпуска: '+signed(r.total)+' млрд ₽ (цены 2021 г.).';
   const summary=node('div','');summary.className='stress-decomp-summary';
   for(const [label,v] of [['Прямой спрос',r.direct],['Косвенный эффект',r.indirect],['Итог выпуска',r.total]]){const item=node('div','');item.append(node('span',label),node('strong',signed(v)+' млрд ₽'));summary.append(item)}
   decomp.append(summary);
   const max=Math.max(0,...r.parts.map(x=>Math.abs(x.value))),bars=node('div','');bars.className='stress-signed-bars';
   for(const x of r.parts){
    const line=node('div','');line.className='stress-signed-row';const track=node('div','');track.className='stress-signed-track';const bar=node('div','');bar.className='stress-signed-fill';bar.dataset.sign=x.value<0?'negative':'positive';bar.style.width=(max?50*Math.abs(x.value)/max:0)+'%';track.append(bar);
    line.append(node('span',x.name),track,node('strong',signed(x.value)));bars.append(line);
   }
   decomp.append(node('p','Вклад каждой группы конечного спроса в выпуск выбранной группы, млрд ₽. Положительные и отрицательные вклады могут компенсировать друг друга.'),bars);
   decompCsv.disabled=false;decompCsv.onclick=()=>csv('chain-group-contributions-'+(i+1)+'-2021.csv',[['Год','Группа выпуска','Группа спроса','Шок спроса, %','Полный вклад, млрд руб.','Прямой вклад, млрд руб.','Косвенный вклад, млрд руб.','Источник'],...r.parts.map(x=>[2021,row.name,x.name,latest.rows[x.j].shock,x.value,x.direct,x.indirect,'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'])]);
  }
  pick.onchange=renderBreakdown;
  function renderConstraints(r){
   graph.replaceChildren();const rows=ChainStress.constraints(r),max=Math.max(1,...rows.flatMap(x=>[Math.abs(x.required),x.limit,Math.abs(x.scaled)]));
   const caption=node('p','Требуемое изменение выпуска и изменение при едином допустимом масштабе. Вертикальная отметка — заданный верхний предел прироста; нижняя граница выпуска −100%. Шкала едина для всех групп.');
   graph.append(caption);
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),w=1000,h=100+rows.length*30;svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('role','img');svg.setAttribute('aria-label','Изменение выпуска, масштабированный сценарий и пределы по 19 группам');
   const add=(tag,attrs,t,parent=svg)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(t!==undefined)el.textContent=t;parent.append(el);return el};
   add('rect',{width:w,height:h,fill:'#fff'});
   const zero=620,scale=245/max,X=v=>zero+v*scale;
   add('text',{x:18,y:24,'font-size':16,fill:'#173e52','font-weight':'bold'},'Ограничения выпуска · % базового выпуска');
   for(const v of [-max,-max/2,0,max/2,max]){add('line',{x1:X(v),x2:X(v),y1:45,y2:h-25,stroke:v===0?'#52696e':'#dce5e5'});add('text',{x:X(v),y:40,'text-anchor':'middle',fill:'#405960','font-size':11},f(v)+'%')}
   for(const [j,x] of rows.entries()){
    const y=54+j*30,name=(x.i+1)+'. '+x.name;
    const label=add('text',{x:365,y:y+13,'text-anchor':'end','font-size':11,fill:'#173e52','font-weight':x.binding?'bold':'normal'},name);chartFitLabel(label,350);
    for(const [v,dy,color] of [[x.required,0,x.gap>0||x.lowerGap>0?'#b26c43':'#7d9eaa'],[x.scaled,10,'#006c69']])add('rect',{x:Math.min(zero,X(v)),y:y+dy,width:Math.abs(v)*scale,height:8,fill:color});
    add('line',{x1:X(x.limit),x2:X(x.limit),y1:y-3,y2:y+21,stroke:'#a24724','stroke-width':2});
    add('text',{x:880,y:y+13,'font-size':11,fill:'#173e52'},f(x.required)+'%'+(x.binding?' · предел':''));
   }
   graph.append(svg);
  }
  function draw(){
   latest=null;metrics.replaceChildren();out.replaceChildren();matrix.replaceChildren();graph.replaceChildren();decomp.replaceChildren();btn.disabled=matrixBtn.disabled=decompCsv.disabled=true;decompStatus.textContent='';
   if([...shocks,...caps].some(x=>!x.value||!x.validity.valid)){status.textContent='Проверьте значения: спрос −20…20%, пределы 0…100%.';return}
   const p=shocks.map(x=>x.valueAsNumber),c=caps.map(x=>x.valueAsNumber),r=ChainStress.calculate(m,p,c);
   latest=r;renderConstraints(r);renderBreakdown();
   const failed=r.rows.filter(x=>x.pct>x.cap+1e-9||x.belowZero).length;
   status.textContent='Превышения / отрицательный выпуск: '+failed+' из 19 групп · максимальная доля единого сценария: '+f(r.alpha*100)+'%. Это условная проверка, не прогноз мощности.';
   addMetric('Изменение валового выпуска',f(r.total)+' млрд ₽');addMetric('Прямое изменение спроса',f(r.direct)+' млрд ₽');addMetric('Косвенное изменение выпуска',f(r.total-r.direct)+' млрд ₽');addMetric('Чистое изменение импортных затрат',f(r.imports)+' млрд ₽');
   addMetric('Импортные затраты от положительных вкладов',f(r.grossImportIncrease)+' млрд ₽');addMetric('Импортные затраты от отрицательных вкладов',f(r.grossImportDecrease)+' млрд ₽');addMetric('Единый допустимый масштаб',f(r.alpha*100)+'%');addMetric('Выпуск при этом масштабе',f(r.total*r.alpha)+' млрд ₽');
   const binding=node('p',r.binding.length?'Ограничивающие группы: '+r.binding.map(i=>m.names[i]).join('; '):'Ни одна группа не ограничивает полный сценарий по заданным пределам.');metrics.append(binding);
   const ranked=[...r.rows].sort((a,b)=>b.shortfall-a.shortfall||Number(b.belowZero)-Number(a.belowZero)||Math.abs(b.dx)-Math.abs(a.dx));
   table(out,['Группа','Δ выпуск, млрд ₽','Δ выпуск, %','Предел, %','Сверх предела, млрд ₽','Δ выпуск при масштабе, млрд ₽','Условие'],ranked.map(x=>[x.name,f(x.dx),f(x.pct),f(x.cap),f(x.shortfall),f(x.scaled),x.belowZero?'Отрицательный выпуск':x.binding?'Ограничивает масштаб':x.shortfall>1e-9?'Превышение':'В пределах']));
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1080 520');svg.setAttribute('width','1080');svg.setAttribute('height','520');svg.setAttribute('role','img');svg.setAttribute('aria-label','Тепловая карта вкладов спроса в выпуск');
   const shape=(tag,attrs,t,parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;parent.append(e);return e};
   const max=Math.max(0,...r.contributions.flat().map(Math.abs)),cell=21,left=330,top=78;
   shape('rect',{width:1080,height:520,fill:'#fff'});shape('text',{x:12,y:23,'font-size':18,'font-weight':'bold'},'Вклады изменения спроса в выпуск · млрд ₽, цены 2021 г.');
   shape('text',{x:left,y:47},'Столбцы — группа спроса (номер в таблице ниже)');
   m.names.forEach((n,i)=>{shape('text',{x:left+i*cell+cell/2,y:67,'text-anchor':'middle','font-size':10},i+1);chartFitLabel(shape('text',{x:left-5,y:top+i*cell+14,'text-anchor':'end','font-size':10},(i+1)+'. '+n),left-15);r.contributions[i].forEach((v,j)=>{const opacity=max?Math.min(1,Math.abs(v)/max):0;const e=shape('rect',{x:left+j*cell,y:top+i*cell,width:cell-1,height:cell-1,fill:v<0?'#a24724':v>0?'#006c69':'#d6dedb','fill-opacity':v?Math.max(.08,opacity):.55});shape('title',{},m.names[j]+' → '+n+': '+f(v)+' млрд ₽',e)})});
   shape('text',{x:12,y:507},'Зелёный — положительный вклад; коричневый — отрицательный; серый — ноль. Общая шкала: ±'+f(max)+' млрд ₽.');
   const wrap=node('div','');wrap.className='regional-figure-scroll';wrap.append(svg);matrix.append(wrap);
   const keys=node('details','');keys.append(node('summary','Номера групп и таблица вкладов'));const body=node('div','');body.className='atlas-table';table(body,['Группа выпуска / спроса',...m.names.map((_,i)=>String(i+1))],m.names.map((n,i)=>[(i+1)+'. '+n,...r.contributions[i].map(f)]));keys.append(body);matrix.append(keys);
   const source='https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx';
   btn.disabled=matrixBtn.disabled=false;
   btn.onclick=()=>csv('chain-stress-2021.csv',[['Источник',source],['База','2021, млн руб. → млрд руб.'],['Единый масштаб',r.alpha],['Чистый импорт, млрд ₽',r.imports],['Положительные вклады импорта',r.grossImportIncrease],['Отрицательные вклады импорта',r.grossImportDecrease],['Группа','Шок спроса, %','Предел, %','Прямой спрос, млрд ₽','Δ выпуск, млрд ₽','Δ выпуск, %','Сверх предела, млрд ₽','Масштабированный выпуск, млрд ₽','Положительные вклады','Отрицательные вклады','Ограничивает масштаб'],...r.rows.map(x=>[x.name,x.shock,x.cap,x.direct,x.dx,x.pct,x.shortfall,x.scaled,x.positive,x.negative,x.binding?'да':'нет'])]);
   matrixBtn.onclick=()=>csv('chain-contributions-2021.csv',[['Группа выпуска','Группа конечного спроса','Δ выпуск, млрд ₽','Источник'],...r.contributions.flatMap((row,i)=>row.map((v,j)=>[m.names[i],m.names[j],v,source]))]);
   const url=new URL(location.href);url.searchParams.set('stress-shocks',p.join(','));url.searchParams.set('stress-caps',c.join(','));history.replaceState(null,'',url);
  }
  const uniform=$('stress-uniform');$('stress-apply').onclick=()=>{if(!uniform.value||!uniform.validity.valid){status.textContent='Укажите предел 0–100%.';return}caps.forEach(x=>x.value=uniform.value);draw()};
  $('stress-reset').onclick=()=>{shocks.forEach(x=>x.value='0');caps.forEach(x=>x.value='10');uniform.value='10';draw()};
  for(const x of [...shocks,...caps])x.oninput=draw;
  form.onsubmit=e=>e.preventDefault();draw()
 }catch(e){console.error(e);status.textContent='Не удалось загрузить согласованный баланс для выбранной версии.'}
});

}
