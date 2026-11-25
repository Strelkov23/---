/* Domestic intermediate flows, 2021. Row = supplier, column = purchaser. */
const BalanceMatrix=(()=>{
 function prepare(m,includeSelf=true){
  const n=m.names?.length;
  if(!n||new Set(m.names).size!==n||!Array.isArray(m.flows)||m.flows.length!==n||m.flows.some(r=>!Array.isArray(r)||r.length!==n||r.some(v=>!Number.isFinite(v))))throw Error('Некорректная матрица');
  const selected=m.flows.map((r,i)=>r.map((v,j)=>includeSelf||i!==j?v:null));
  const summarize=a=>({total:a.reduce((s,v)=>s+(v??0),0),valid:a.every(v=>v===null||v>=0)});
  const supply=selected.map(summarize),purchase=m.names.map((_,j)=>summarize(selected.map(r=>r[j])));
  const fraction=(v,t)=>v!==null&&t.valid&&t.total>0?100*v/t.total:null;
  return {names:m.names,supply,purchase,cells:selected.map((row,i)=>row.map((v,j)=>({i,j,value:v,inputs:fraction(v,purchase[j]),outputs:fraction(v,supply[i])})))};
 }
 function scale(cells,metric){
  const positive=cells.flat().map(c=>c[metric]).filter(v=>Number.isFinite(v)&&v>0);
  return positive.length?Math.max(...positive):0;
 }
 function band(value,max,log=false){
  if(!Number.isFinite(value))return 'missing';
  if(value<0)return 'negative';
  if(value===0)return 'zero';
  const q=max>0?(log?Math.log1p(value)/Math.log1p(max):value/max):0;
  return String(Math.max(0,Math.min(4,Math.ceil(5*q)-1)));
 }
 function network(d,metric='value',focus=null,limit=20){
  if(!['value','inputs','outputs'].includes(metric)||!Number.isInteger(limit)||limit<1)throw Error('Некорректный режим сети');
  const eligible=d.cells.flat().filter(c=>(focus===null||c.i===focus||c.j===focus)&&Number.isFinite(c.value)&&c.value>0);
  const comparable=eligible.filter(c=>Number.isFinite(c[metric])&&c[metric]>0);
  const edges=[...comparable].sort((a,b)=>b[metric]-a[metric]||b.value-a.value||a.i-b.i||a.j-b.j).slice(0,limit);
  const total=eligible.reduce((s,c)=>s+c.value,0),shown=edges.reduce((s,c)=>s+c.value,0);
  return {edges,total,shown,coverage:total>0?100*shown/total:null,eligible:eligible.length,comparable:comparable.length};
 }
 return {prepare,scale,band,network};
})();
if(typeof module!=='undefined')module.exports=BalanceMatrix;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('bm-table');if(!host)return;
 const status=$('bm-status'),metric=$('bm-metric'),self=$('bm-self'),focus=$('bm-focus'),log=$('bm-log'),detail=$('bm-detail'),exp=$('bm-export');
 const label={value:'Поток, млрд руб.',inputs:'Доля закупок покупателя, %',outputs:'Доля поставок поставщика, %'};
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const netHost=$('bm-network'),netStatus=$('bm-network-status'),netLimit=$('bm-network-limit'),netExport=$('bm-network-export');
 try{
  // The atlas is static for the current build. Verify its data against the published manifest.
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'sectors.json',root),m=entry.data;
  const names=m.names,source='https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx';
  focus.replaceChildren(new Option('Все группы',''),...names.map((n,i)=>new Option((i+1)+' · '+n,String(i))));
  const rowPick=$('bm-supplier'),colPick=$('bm-buyer');
  for(const e of [rowPick,colPick])e.replaceChildren(...names.map((n,i)=>new Option((i+1)+' · '+n,String(i))));
  colPick.value=String(Math.min(1,names.length-1));
  function draw(){
   const d=BalanceMatrix.prepare(m,self.checked),key=metric.value,max=BalanceMatrix.scale(d.cells,key),logScale=log.checked&&key==='value',selected=focus.value===''?null:Number(focus.value);
   log.disabled=key!=='value';host.replaceChildren();detail.replaceChildren();
   const t=node('table','');t.className='bm-matrix';const h=t.createTHead().insertRow(),body=t.createTBody();
   const corner=node('th','Поставщик ↓ / покупатель →');corner.scope='col';h.append(corner);
   const groupLink=i=>{const a=node('a',(i+1)+'. '+names[i]);a.href='sector-'+(i+1)+'.html';return a};
   for(let j=0;j<names.length;j++){const th=node('th',String(j+1));th.scope='col';th.title=names[j];if(j===selected)th.dataset.focus='true';h.append(th)}
   function selectCell(i,j){rowPick.value=String(i);colPick.value=String(j);showDetail()}
   for(let i=0;i<names.length;i++){
    const tr=body.insertRow(),th=node('th','');th.scope='row';th.append(groupLink(i));tr.append(th);
    for(let j=0;j<names.length;j++){const c=d.cells[i][j],td=tr.insertCell(),v=c[key],button=node('button',fmt(key==='value'&&Number.isFinite(v)?v/1000:v));button.type='button';button.dataset.band=BalanceMatrix.band(v,max,logScale);button.title=names[i]+' → '+names[j]+' · '+label[key]+': '+button.textContent;button.setAttribute('aria-label',button.title);button.onclick=()=>selectCell(i,j);if(selected!==null&&i!==selected&&j!==selected)button.dataset.dim='true';td.append(button)}
   }
   host.append(t);
   const legend=$('bm-legend');legend.replaceChildren();
   const thresholds=Array.from({length:5},(_,i)=>logScale?Math.expm1(Math.log1p(max)*(i+1)/5):max*(i+1)/5);
   let prev=0;for(let i=0;i<5;i++){const span=node('span',fmt(key==='value'?prev/1000:prev)+'–'+fmt(key==='value'?thresholds[i]/1000:thresholds[i]));span.dataset.band=String(i);legend.append(span);prev=thresholds[i]}
   for(const [b,txt] of [['zero','0'],['negative','Отрицательное'],['missing','Нет расчёта / исключено']]){const s=node('span',txt);s.dataset.band=b;legend.append(s)}
   status.textContent=names.length+' × '+names.length+' групп · '+label[key]+' · '+(self.checked?'с внутригрупповыми потоками':'без внутригрупповых потоков')+' · '+(logScale?'логарифмическая цветовая шкала':'линейная шкала')+'.';
   function renderNetwork(){
    if(!netHost)return;
    const result=BalanceMatrix.network(d,key,selected,Number(netLimit.value));
    netHost.replaceChildren();netExport.disabled=!result.edges.length;
    netStatus.textContent='Показано '+result.edges.length+' из '+result.eligible+' положительных потоков выбранного охвата · сопоставимых по критерию: '+result.comparable+' · доля показанных потоков в сумме положительных: '+fmt(result.coverage)+'%. Толщина линии отражает '+label[key]+', не силу причинной зависимости.';
    if(!result.edges.length){netHost.append(node('p','Нет положительных сопоставимых потоков.'));return}
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 1040 690');svg.setAttribute('width','1040');svg.setAttribute('role','group');svg.setAttribute('aria-label','Сеть отечественных промежуточных потоков, 2021');
    const add=(tag,attrs,txt,parent=svg)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(txt!==undefined)el.textContent=txt;parent.append(el);return el};
    add('rect',{width:1040,height:690,fill:'#fff'});
    add('text',{x:18,y:25,fill:'#173e52','font-size':16,'font-weight':'bold'},'Поставщики');add('text',{x:1022,y:25,fill:'#173e52','font-size':16,'font-weight':'bold','text-anchor':'end'},'Покупатели');
    add('text',{x:520,y:25,fill:'#405960','font-size':12,'text-anchor':'middle'},'2021 · '+label[key]);
    const y=i=>52+i*33;
    const max=Math.max(...result.edges.map(c=>c[key]));
    const left=new Set(result.edges.map(c=>c.i)),right=new Set(result.edges.map(c=>c.j));
    const short=s=>s.length>34?s.slice(0,31)+'…':s;
    for(const c of [...result.edges].reverse()){
     const line=add('path',{d:'M 264 '+y(c.i)+' C 440 '+y(c.i)+', 600 '+y(c.j)+', 776 '+y(c.j),fill:'none',stroke:c.i===c.j?'#b28a50':'#327b97','stroke-width':1.2+8*c[key]/max,'stroke-opacity':.55,tabindex:0,role:'button','data-bm-edge':c.i+':'+c.j,'aria-label':names[c.i]+' → '+names[c.j]+' · '+fmt(key==='value'?c.value/1000:c[key])+' '+label[key]});
     add('title',{},names[c.i]+' → '+names[c.j]+' · '+fmt(c.value/1000)+' млрд ₽',line);
     const choose=()=>{selectCell(c.i,c.j);detail.scrollIntoView({block:'nearest'})};line.addEventListener('click',choose);line.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}});
    }
    for(let i=0;i<names.length;i++)for(const [side,set,x,tx,anchor] of [['left',left,248,236,'end'],['right',right,776,804,'start']]){
     const active=set.has(i),r=add('rect',{x,y:y(i)-10,width:16,height:20,rx:3,fill:active?'#215c78':'#e5e7e9',stroke:'#b2c5cb'});add('title',{},names[i],r);
     const t=add('text',{x:tx,y:y(i)+4,'text-anchor':anchor,fill:active?'#173e52':'#68777a','font-size':11},(i+1)+'. '+short(names[i]));add('title',{},names[i],t);
    }
    add('text',{x:520,y:682,fill:'#405960','font-size':11,'text-anchor':'middle'},'Линии — положительные потоки; охват и исходные числа доступны в CSV.');
    netHost.append(svg);
    const list=node('div','');list.className='table-scroll';const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
    for(const name of ['Поставщик','Покупатель','Поток, млрд ₽','Доля закупок, %','Доля поставок, %']){const th=node('th',name);th.scope='col';h.append(th)}
    for(const c of result.edges){const tr=body.insertRow(),btn=node('button',names[c.i]);btn.type='button';btn.onclick=()=>selectCell(c.i,c.j);tr.insertCell().append(btn);for(const v of [names[c.j],fmt(c.value/1000),fmt(c.inputs),fmt(c.outputs)])tr.insertCell().textContent=v}
    list.append(t);netHost.append(list);
    netExport.onclick=()=>csv('domestic-intermediate-network-2021.csv',[['Год','Критерий отбора','Группа фокуса','Внутригрупповые связи','Поставщик','Покупатель','Поток, млн руб.','Доля закупок, %','Доля поставок, %','Положительных потоков в охвате','Сумма положительных потоков, млн руб.','Сумма показанных потоков, млн руб.','Охват суммы, %','Источник','SHA-256 JSON','Отпечаток манифеста'],...result.edges.map(c=>[2021,label[key],selected===null?'Все группы':names[selected],self.checked?'включены':'исключены',names[c.i],names[c.j],c.value,c.inputs,c.outputs,result.eligible,result.total,result.shown,result.coverage,source,entry.sha256,manifest.data_fingerprint])]);
   }
   if(netLimit)netLimit.onchange=renderNetwork;
   renderNetwork();
   function showDetail(){
    const i=Number(rowPick.value),j=Number(colPick.value),c=d.cells[i][j];detail.replaceChildren(node('h3',names[i]+' → '+names[j]));
    const grid=node('div','');grid.className='metrics';
    for(const [name,v] of [['Поток, млрд ₽',Number.isFinite(c.value)?c.value/1000:null],['Доля закупок покупателя, %',c.inputs],['Доля поставок поставщика, %',c.outputs]]){const item=node('div','');item.className='metric';item.append(node('b',fmt(v)),node('span',name));grid.append(item)}
    detail.append(grid,node('p','Знаменатель закупок покупателя: '+fmt(d.purchase[j].total/1000)+' млрд ₽. Знаменатель поставок поставщика: '+fmt(d.supply[i].total/1000)+' млрд ₽.'),groupLink(i),document.createTextNode(' · '),groupLink(j));
   }
   rowPick.onchange=colPick.onchange=showDetail;showDetail();
   exp.disabled=false;exp.onclick=()=>csv('domestic-intermediate-matrix-2021.csv',[['Год','Внутригрупповые потоки','Код поставщика','Поставщик','Код покупателя','Покупатель','Поток, млн руб.','Итог закупок покупателя, млн руб.','Итог поставок поставщика, млн руб.','Доля закупок, %','Доля поставок, %','Источник','SHA-256 JSON','Отпечаток манифеста'],...d.cells.flat().map(c=>[2021,self.checked?'включены':'исключены',c.i+1,names[c.i],c.j+1,names[c.j],c.value,d.purchase[c.j].total,d.supply[c.i].total,c.inputs,c.outputs,source,entry.sha256,manifest.data_fingerprint])]);
  }
  for(const e of [metric,self,focus,log])e.onchange=draw;draw();
 }catch(e){status.textContent='Матрица недоступна: '+String(e.message||e);exp.disabled=true}
});
