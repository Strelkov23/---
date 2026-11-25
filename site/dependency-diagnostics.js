/* Structural diagnostics, domestic IO balance of 2021, no current supplier or import claims. */
const DependencyDiagnostics=(()=>{
 const finite=Number.isFinite,sum=xs=>xs.reduce((a,b)=>a+b,0);
 function concentration(values,excluded=-1){
  const rows=values.map((v,i)=>({i,v})).filter(r=>r.i!==excluded);
  if(rows.some(r=>!finite(r.v)||r.v<0))return {valid:false,total:null,top:null,hhi:null,parts:rows.map(r=>({...r,share:null}))};
  const total=sum(rows.map(r=>r.v));
  if(total<=0)return {valid:false,total,top:null,hhi:null,parts:rows.map(r=>({...r,share:null}))};
  const parts=rows.map(r=>({...r,share:r.v/total})).sort((a,b)=>b.v-a.v||a.i-b.i);
  return {valid:true,total,top:parts[0],hhi:sum(parts.map(r=>r.share**2)),parts};
 }
 function diagnose(m,includeSelf,cutoff,importCutoff){
  const n=m.names?.length;
  if(!Number.isInteger(n)||n<1||n>100||new Set(m.names).size!==n||![m.flows,m.effects].every(a=>Array.isArray(a)&&a.length===n&&a.every(r=>Array.isArray(r)&&r.length===n&&r.every(finite)))||![m.output,m.demand,m.imports].every(a=>Array.isArray(a)&&a.length===n&&a.every(finite)))throw Error('Некорректная размерность баланса');
  if(!finite(cutoff)||cutoff<=0||cutoff>1||!finite(importCutoff)||importCutoff<0)throw Error('Некорректный порог');
  return m.names.map((name,i)=>{
   const input=concentration(m.flows.map(r=>r[i]),includeSelf?-1:i),output=concentration(m.flows[i],includeSelf?-1:i);
   const demand=m.demand[i],effects=m.effects.map(r=>r[i]),multiplier=demand>0&&effects.every(v=>v>=0)?sum(effects)/demand:null;
   const importIntensity=demand>0&&m.imports[i]>=0&&finite(multiplier)?m.imports[i]/demand:null;
   const inFlag=input.valid?input.top.share>=cutoff:null,outFlag=output.valid?output.top.share>=cutoff:null,importFlag=finite(importIntensity)?importIntensity>=importCutoff:null;
   return {i,name,input,output,demand,multiplier,importIntensity,inFlag,outFlag,importFlag};
  });
 }
 function pairs(m,result,i){
  const r=result[i];if(!r)throw Error('Нет группы');
  const input=new Map(r.input.parts.map(p=>[p.i,p])),output=new Map(r.output.parts.map(p=>[p.i,p]));
  return m.names.flatMap((name,j)=>input.has(j)||output.has(j)?[{j,name,from:input.get(j)?.v??null,fromShare:input.get(j)?.share??null,to:output.get(j)?.v??null,toShare:output.get(j)?.share??null,otherPurchase:result[j].input.parts.find(p=>p.i===i)?.share??null,otherSales:result[j].output.parts.find(p=>p.i===i)?.share??null}]:[]);
 }
 return {concentration,diagnose,pairs};
})();
if(typeof module!=='undefined')module.exports=DependencyDiagnostics;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('dep-diag-status');if(!status)return;
 const f=v=>Number.isFinite(v)?fmt(v):'—',pct=v=>Number.isFinite(v)?f(v*100):'—',yes=v=>v===null?'—':v?'Да':'Нет',source='https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'sectors.json',root),m=entry.data;
  const self=$('dep-diag-self'),cut=$('dep-diag-cut'),imp=$('dep-diag-import'),filter=$('dep-diag-filter'),pick=$('dep-diag-group'),exp=$('dep-diag-export'),pairExp=$('dep-diag-pair-export');
  pick.replaceChildren(...m.names.map((n,i)=>new Option((i+1)+' · '+n,String(i))));
  let current=[];
  function detail(){
   const i=Number(pick.value),r=current[i];if(!r)return;
   const rows=DependencyDiagnostics.pairs(m,current,i);
   $('dep-diag-detail-status').textContent=r.name+' · прямые потоки в млн руб. · доля от закупок покупателя и от поставок продавца рассчитаны отдельно.';
   table($('dep-diag-detail'),['Контрагент (группа)','Закупки у группы','Доля в наших закупках, %','Доля в поставках контрагента, %','Поставки группе','Доля в наших поставках, %','Доля в закупках контрагента, %'],rows.map(p=>[p.name,f(p.from),pct(p.fromShare),pct(p.otherSales),f(p.to),pct(p.toShare),pct(p.otherPurchase)]));
   pairExp.disabled=!rows.length;pairExp.onclick=()=>csv('dependency-pairs-'+(i+1)+'-2021.csv',[['Год','Группа','Контрагент','Внутригрупповые потоки','Закупки, млн руб.','Доля наших закупок','Доля поставок контрагента','Поставки, млн руб.','Доля наших поставок','Доля закупок контрагента','Источник','SHA-256','Отпечаток манифеста'],...rows.map(p=>[2021,r.name,p.name,self.checked?'да':'нет',p.from,p.fromShare,p.otherSales,p.to,p.toShare,p.otherPurchase,source,entry.sha256,manifest.data_fingerprint])]);
  }
  function draw(){
   const c=Number(cut.value),t=Number(imp.value);current=DependencyDiagnostics.diagnose(m,self.checked,c,t);
   const rows=current.filter(r=>filter.value==='all'||filter.value==='input'&&r.inFlag||filter.value==='output'&&r.outFlag||filter.value==='both'&&r.inFlag&&r.outFlag||filter.value==='import'&&r.importFlag||filter.value==='unknown'&&[r.inFlag,r.outFlag,r.importFlag].includes(null));
   const count=k=>current.filter(r=>r[k]===true).length,known=k=>current.filter(r=>r[k]!==null).length;
   status.textContent='Баланс 2021 · закупки: '+count('inFlag')+' из '+known('inFlag')+' · поставки: '+count('outFlag')+' из '+known('outFlag')+' · импортные затраты: '+count('importFlag')+' из '+known('importFlag')+' · показано '+rows.length+' из '+current.length+' групп.';
   const summary=$('dep-diag-summary');summary.replaceChildren();
   for(const [label,k] of [['Концентрация закупок','inFlag'],['Концентрация поставок','outFlag'],['Импортные затраты по порогу','importFlag']]){const d=node('div','');d.className='metric';d.append(node('b',count(k)+' / '+known(k)),node('span',label));summary.append(d)}
   table($('dep-diag-table'),['Группа','Крупнейший поставщик','Его доля, %','HHI закупок','Крупнейший покупатель','Его доля, %','HHI поставок','Полный выпуск, руб./руб.','Импортные затраты, руб./руб.','Оба порога концентрации'],rows.map(r=>{const b=node('button',r.name);b.type='button';b.onclick=()=>{pick.value=String(r.i);detail();$('dep-diag-detail').scrollIntoView({block:'nearest'})};return [b,r.input.top?m.names[r.input.top.i]:'—',pct(r.input.top?.share),f(r.input.hhi),r.output.top?m.names[r.output.top.i]:'—',pct(r.output.top?.share),f(r.output.hhi),f(r.multiplier),f(r.importIntensity),yes(r.inFlag===null||r.outFlag===null?null:r.inFlag&&r.outFlag)]}));
   exp.disabled=!rows.length;exp.onclick=()=>csv('dependency-diagnostics-2021.csv',[['Год','Группа','Внутригрупповые потоки','Порог концентрации','Порог импорта','Закупки, млн руб.','Крупнейший поставщик','Доля поставщика','HHI закупок','Поставки, млн руб.','Крупнейший покупатель','Доля покупателя','HHI поставок','Конечный спрос, млн руб.','Полный выпуск, руб./руб.','Импортные затраты, руб./руб.','Сигнал закупок','Сигнал поставок','Сигнал импорта','Источник','SHA-256','Отпечаток манифеста'],...rows.map(r=>[2021,r.name,self.checked?'да':'нет',c,t,r.input.total,r.input.top?m.names[r.input.top.i]:null,r.input.top?.share,r.input.hhi,r.output.total,r.output.top?m.names[r.output.top.i]:null,r.output.top?.share,r.output.hhi,r.demand,r.multiplier,r.importIntensity,yes(r.inFlag),yes(r.outFlag),yes(r.importFlag),source,entry.sha256,manifest.data_fingerprint])]);
   detail();
  }
  self.onchange=cut.onchange=imp.onchange=filter.onchange=draw;pick.onchange=detail;draw();
 }catch(e){console.error(e);status.textContent='Проверенный баланс недоступен.'}
});
