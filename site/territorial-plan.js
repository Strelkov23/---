/* Conditional distribution of additional nominal shipments, not a physical production plan. */
const TerritorialPlan=(()=>{
 const finite=Number.isFinite,sum=a=>a.reduce((s,v)=>s+v,0);
 function prepare(data,group,year,atlas,sample){
  const d=atlas.calculate(data,group,year,sample);
  const rows=[...d.rows.entries()].map(([key,r])=>({...r,key,eligible:r.editionOK&&finite(r.value)&&r.value>0&&finite(d.national)&&r.value<=d.national})).sort((a,b)=>a.region.localeCompare(b.region,'ru'));
  const total=sum(rows.filter(r=>r.eligible).map(r=>r.value));
  const coverage=finite(d.national)&&d.national>0?100*total/d.national:null;
  if(coverage!==null&&coverage>100.5)throw Error('Сумма регионов превышает итог РФ; проверьте территориальную сопоставимость');
  return {rows,total,national:d.national,coverage,excluded:d.excluded,ambiguous:d.ambiguous};
 }
 function allocate(rows,target){
  if(!Array.isArray(rows)||!rows.length||rows.length>100||new Set(rows.map(r=>r.key)).size!==rows.length||!finite(target)||target<0||rows.some(r=>!finite(r.base)||r.base<=0||!finite(r.cap)||r.cap<0||r.cap>100||!finite(r.weight)||r.weight<0||r.weight>10))throw Error('Некорректные цели или ограничения');
  const caps=rows.map(r=>r.base*r.cap/100),totalCap=sum(caps),achieved=Math.min(target,totalCap);
  if(!finite(totalCap)||!finite(achieved))throw Error('Некорректный масштаб');
  // Minimum possible maximum relative increase, with all included regions available.
  let lo=0,hi=Math.max(...rows.map(r=>r.cap))/100;
  for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(sum(rows.map((r,j)=>Math.min(caps[j],r.base*mid)))<achieved)lo=mid;else hi=mid}
  const balanced=achieved===0?rows.map(()=>0):rows.map((r,i)=>Math.min(caps[i],r.base*hi));
  // Maximum weighted shipment increment with fixed total; sorted greedy allocation is optimal.
  const priority=rows.map(()=>0);let left=achieved;
  for(const i of rows.map((_,i)=>i).sort((a,b)=>rows[b].weight-rows[a].weight||rows[a].key.localeCompare(rows[b].key))){priority[i]=Math.min(caps[i],left);left=Math.max(0,left-priority[i]);}
  const tol=1e-8*Math.max(1,achieved);
  for(const plan of [balanced,priority])if(Math.abs(sum(plan)-achieved)>tol||plan.some((v,i)=>!finite(v)||v<0||v>caps[i]+tol))throw Error('Невязка распределения');
  const summarize=plan=>({maxGrowth:Math.max(...plan.map((v,i)=>100*v/rows[i].base)),weighted:sum(plan.map((v,i)=>v*rows[i].weight)),active:plan.filter(v=>v>1e-9).length});
  const a=summarize(balanced),b=summarize(priority);
  if(a.maxGrowth>b.maxGrowth+1e-7||b.weighted<a.weighted-1e-7*Math.max(1,a.weighted))throw Error('Проверка альтернатив не пройдена');
  return {target,achieved,totalCap,shortfall:Math.max(0,target-achieved),feasible:target<=totalCap+tol,balanced:a,priority:b,rows:rows.map((r,i)=>({...r,limit:caps[i],balanced:balanced[i],priority:priority[i]}))};
 }
 return {prepare,allocate};
})();
if(typeof module!=='undefined')module.exports=TerritorialPlan;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('tp-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entries=[await Provenance.get(manifest,'regional-manufacturing.json',root)];
  try{entries.push(await Provenance.get(manifest,'regional-mining-energy.json',root))}catch(e){$('tp-source-note').textContent='Добыча и энергетика недоступны в этой версии; доступны обрабатывающие производства.'}
  const groups=entries.flatMap(entry=>entry.data.groups.map(g=>({...g,entry}))),pick=$('tp-group'),year=$('tp-year'),target=$('tp-target'),exp=$('tp-export'),cap=$('tp-uniform'),scope=$('tp-scope');
  pick.replaceChildren(...groups.map((g,i)=>new Option(g.title||g.id,String(i))));
  let sample=null,fields=[],selected=null;
  const input=(v,max,label)=>{const x=node('input','');x.type='number';x.min=0;x.max=max;x.step='any';x.value=v;x.setAttribute('aria-label',label);return x};
  function clear(){exp.disabled=true;$('tp-summary').replaceChildren();$('tp-results').replaceChildren();status.textContent='Параметры изменены. Выполните расчёт.';}
  function loadYear(){
   selected=groups[Number(pick.value)];const d=selected.entry.data;
   const years=[...new Set(d.rows.filter(r=>r.group===selected.id).map(r=>r.year))].sort((a,b)=>b-a);
   year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));loadSample();
  }
  function loadSample(){
   clear();fields=[];sample=null;$('tp-controls').replaceChildren();
   try{
    const d=selected.entry.data;sample=TerritorialPlan.prepare(d,selected.id,Number(year.value),ManufacturingAtlas,RegionalStats.sample);
    $('tp-coverage').textContent='Год '+year.value+' · числовая сопоставимая база '+fmt(sample.total)+' млн руб. · итог РФ '+fmt(sample.national)+' млн руб. · охват '+fmt(sample.coverage)+'% · исключено строк '+sample.excluded+' · неоднозначных ключей '+sample.ambiguous+'.';
    fields=sample.rows.filter(r=>r.eligible).map(r=>({r,cap:input(10,100,'Лимит: '+r.region),weight:input(1,10,'Вес: '+r.region)}));
    const by=new Map(fields.map(v=>[v.r.key,v]));
    table($('tp-controls'),['Регион','Отгрузка, млн руб.','Локализация','Условный предел прироста, %','Вес приоритета'],sample.rows.map(r=>[r.region,fmt(r.value),fmt(r.localization),by.get(r.key)?.cap||'Нет сопоставимой базы',by.get(r.key)?.weight||'—']));
    fields.flatMap(v=>[v.cap,v.weight]).forEach(x=>x.oninput=clear);
   }catch(e){$('tp-coverage').textContent=String(e.message||e);status.textContent='Сопоставимый срез недоступен.'}
  }
  $('tp-apply').onclick=()=>{if(cap.value&&cap.validity.valid){fields.forEach(v=>v.cap.value=cap.value);clear()}};
  pick.onchange=loadYear;year.onchange=loadSample;target.oninput=scope.onchange=clear;
  $('tp-run').onclick=()=>{
   clear();
   if(!sample||!fields.length||!target.value||!target.validity.valid||fields.some(v=>[v.cap,v.weight].some(x=>!x.value||!x.validity.valid))){status.textContent='Нет сопоставимой выборки или заполнены не все параметры.';return}
   try{
    const base=scope.value==='national'?sample.national:sample.total;if(!Number.isFinite(base)||base<=0)throw Error('Нет положительной базы цели');
    const targetValue=base*target.valueAsNumber/100,r=TerritorialPlan.allocate(fields.map(v=>({key:v.r.key,base:v.r.value,cap:v.cap.valueAsNumber,weight:v.weight.valueAsNumber})),targetValue);
    status.textContent=(r.feasible?'Цель допустима в пределах выбранных регионов.':'Цель недостижима при заданных лимитах. Недостаёт '+fmt(r.shortfall)+' млн руб.')+' Распределено '+fmt(r.achieved)+' из '+fmt(r.target)+' млн руб. Условный предел, не фактическая мощность.';
    table($('tp-summary'),['Критерий','Максимальный прирост региона, %','Взвешенный прирост, усл. ед.','Регионов с приростом'],[['Минимум максимального темпа',fmt(r.balanced.maxGrowth),fmt(r.balanced.weighted),r.balanced.active],['Максимум взвешенного прироста',fmt(r.priority.maxGrowth),fmt(r.priority.weighted),r.priority.active]]);
    const by=new Map(fields.map(v=>[v.r.key,v.r]));table($('tp-results'),['Регион','База','Лимит','Равномерный темп: прирост','Приоритетный: прирост'],r.rows.map(v=>[by.get(v.key).region,fmt(v.base),fmt(v.limit),fmt(v.balanced),fmt(v.priority)]));
    exp.disabled=false;exp.onclick=()=>csv('territorial-plan-'+selected.id+'-'+year.value+'.csv',[['Год','Группа','Регион','База, млн руб.','Лимит, %','Вес','Лимит, млн руб.','Равномерный прирост','Приоритетный прирост','База цели','Цель, %','Цель, млн руб.','Достигнуто','Недостаёт','Охват РФ, %','ОКАТО','ОКТМО','Издание','Лист','Строка','Источник','SHA-256','Манифест'],...sample.rows.map(a=>{const v=r.rows.find(x=>x.key===a.key);return [year.value,selected.id,a.region,a.value,v?.cap,v?.weight,v?.limit,v?.balanced,v?.priority,scope.value,target.value,r.target,r.achieved,r.shortfall,sample.coverage,a.okato,a.oktmo,a.edition,a.sheet,a.row,selected.entry.data.source,selected.entry.sha256,manifest.data_fingerprint]})]);
   }catch(e){status.textContent='Расчёт отклонён: '+String(e.message||e)}
  };loadYear();
 }catch(e){console.error(e);status.textContent='Проверенные региональные данные недоступны.'}
});