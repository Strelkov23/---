const SmeFinance=(()=>{
 function compare(d,kind,cls,metric){
  if(!['declared','reported'].includes(kind)||!['income','expense','workers'].includes(metric))throw Error('Параметр');
  return d[kind].filter(r=>r.class===cls).map(r=>({...r,value:r[metric+'_sum'],observations:r[metric+'_observations'],coverage:r.sme_total?100*r[metric+'_observations']/r.sme_total:null})).sort((a,b)=>a.value===null?b.value===null?a.region.localeCompare(b.region):1:b.value===null?-1:BigInt(a.value)>BigInt(b.value)?-1:BigInt(a.value)<BigInt(b.value)?1:a.region.localeCompare(b.region));
 }
 function fmt(v,metric){if(v===null)return '—';const n=BigInt(v);if(metric==='workers')return n.toLocaleString('ru');const a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')}
 function select(rows,minCoverage=0,order='sum'){
  if(!Number.isFinite(minCoverage)||minCoverage<0||minCoverage>100||!['sum','coverage','matched','region'].includes(order))throw Error('Параметр отбора');
  const result=rows.filter(r=>minCoverage===0||(r.coverage!==null&&r.coverage>=minCoverage));
  const byName=(a,b)=>a.region.localeCompare(b.region);
  if(order==='coverage')result.sort((a,b)=>(b.coverage??-1)-(a.coverage??-1)||byName(a,b));
  if(order==='matched')result.sort((a,b)=>b.matched-a.matched||byName(a,b));
  if(order==='region')result.sort(byName);
  return result;
 }
 function summary(rows){
  const total=rows.reduce((a,r)=>a+r.sme_total,0),matched=rows.reduce((a,r)=>a+r.matched,0),observations=rows.reduce((a,r)=>a+r.observations,0);
  const known=rows.filter(r=>r.value!==null);
  return {total,matched,observations,coverage:total?100*observations/total:null,known:known.length,sum:known.length?known.reduce((a,r)=>a+BigInt(r.value),0n).toString():null};
 }
 function graph(rows,limit=12){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Лимит графика');
  const shown=rows.slice(0,limit),abs=n=>n<0n?-n:n;
  const max=shown.reduce((a,r)=>r.value===null?a:abs(BigInt(r.value))>a?abs(BigInt(r.value)):a,0n);
  const signed=shown.some(r=>r.value!==null&&BigInt(r.value)<0n);
  return {signed,max:max.toString(),rows:shown.map(r=>{
   const n=r.value===null?null:BigInt(r.value),width=n===null||max===0n?0:Number(abs(n)*1000000n/max)/10000*(signed?.5:1);
   const zero=signed?50:0;
   return {...r,width,left:n!==null&&n<0n?zero-width:zero,negative:n!==null&&n<0n,
    observed:r.sme_total?100*r.observations/r.sme_total:null,
    matchedMissing:r.sme_total?100*(r.matched-r.observations)/r.sme_total:null,
    unmatched:r.sme_total?100*(r.sme_total-r.matched)/r.sme_total:null};
  })};
 }
 const pairSpecs=[
  {id:'balance',label:'Доходы минус расходы',unit:'руб.',count:'paired_money',a:'paired_income_sum',b:'paired_expense_sum'},
  {id:'cost_share',label:'Расходы / доходы',unit:'%',count:'paired_money',a:'paired_income_sum',b:'paired_expense_sum'},
  {id:'income_worker',label:'Доходы на работника',unit:'руб./чел.',count:'income_workers_pair',a:'worker_pair_income_sum',b:'worker_pair_workers_sum'}
 ];
 // Rounded to hundredths, with an exact integer numerator and denominator.
 function rounded(n,d){const sign=n<0n?-1n:1n;const a=n<0n?-n:n;return sign*((2n*a+d)/(2n*d))}
 function pairValue(id,a,b){
  if(a===null||b===null)return null;
  const x=BigInt(a),y=BigInt(b);
  if(id==='balance')return (x-y).toString();
  if(id==='cost_share')return x>0n&&y>=0n?rounded(y*10000n,x).toString():null;
  if(id==='income_worker')return y>0n&&x>=0n?rounded(x,y).toString():null;
  throw Error('Показатель');
 }
 function paired(d,kind,cls,id){
  const spec=pairSpecs.find(s=>s.id===id);
  if(!spec||!['declared','reported'].includes(kind))throw Error('Параметр');
  if(d.paired_sums_version!==1)return null;
  return d[kind].filter(r=>r.class===cls).map(r=>{const a=r[spec.a],b=r[spec.b],observations=r[spec.count];return {...r,a,b,observations,value:pairValue(id,a,b),coverage:r.sme_total?100*observations/r.sme_total:null}}).sort((a,b)=>a.value===null?b.value===null?a.region.localeCompare(b.region):1:b.value===null?-1:BigInt(a.value)>BigInt(b.value)?-1:BigInt(a.value)<BigInt(b.value)?1:a.region.localeCompare(b.region));
 }
 function pairSummary(rows,id){
  const total=rows.reduce((a,r)=>a+r.sme_total,0),observations=rows.reduce((a,r)=>a+r.observations,0);
  const valid=rows.filter(r=>r.observations>0),a=valid.length?valid.reduce((n,r)=>n+BigInt(r.a),0n).toString():null,b=valid.length?valid.reduce((n,r)=>n+BigInt(r.b),0n).toString():null;
  return {total,observations,coverage:total?100*observations/total:null,a,b,value:pairValue(id,a,b)};
 }
 return {compare,fmt,select,summary,graph,pairSpecs,pairValue,paired,pairSummary};
})();
if(typeof module!=='undefined')module.exports=SmeFinance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('sme-finance-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'sme-finance.json',root)).data,ref=(await Provenance.get(m,'sme-regions.json',root)).data;
  if(d.status!=='diagnostic'){status.textContent='Финансово-отраслевая диагностика пока не опубликована.';return}
  const names=new Map(ref.rows.map(r=>[r.code,r.name])),kind=$('sme-finance-kind'),cls=$('sme-finance-class'),metric=$('sme-finance-metric'),table=$('sme-finance-table'),exp=$('sme-finance-export'),threshold=$('sme-finance-threshold'),order=$('sme-finance-order'),overview=$('sme-finance-overview');
  function options(){const old=cls.value;cls.replaceChildren(...[...new Set(d[kind.value].map(r=>r.class))].sort().map(c=>new Option(c==='missing_or_other_version'?'Нет ОКВЭД2 / другая версия':c,c)));if([...cls.options].some(o=>o.value===old))cls.value=old;draw()}
  function draw(){
   const all=SmeFinance.compare(d,kind.value,cls.value,metric.value),min=Number(threshold?.value||0),sort=order?.value||'sum',rows=SmeFinance.select(all,min,sort),unit=metric.value==='workers'?'чел.':'руб.';
   if(overview){
    const a=SmeFinance.summary(rows),num=n=>n.toLocaleString('ru'),pct=n=>n===null?'—':n.toLocaleString('ru',{maximumFractionDigits:2})+' %';
    overview.replaceChildren();
    for(const [label,v] of [['Территорий в выборке',num(rows.length)+' / '+num(all.length)],['ЮЛ МСП в выборке',num(a.total)],['Совпали по ИНН',num(a.matched)],['Есть показатель',num(a.observations)],['Взвешенный охват',pct(a.coverage)],['Сумма наблюдений, '+unit,SmeFinance.fmt(a.sum,metric.value)]]){
     const card=node('div','');card.className='metric';card.append(node('b',v),node('span',label));overview.append(card);
    }
   }
   const chart=$('sme-finance-chart'),limit=$('sme-finance-chart-limit');
   if(chart){
    const g=SmeFinance.graph(rows,Number(limit?.value||12)),pct=v=>v===null?'—':v.toLocaleString('ru',{maximumFractionDigits:2})+' %';
    chart.replaceChildren(node('p','На графике: '+g.rows.length+' из '+rows.length+' территорий в порядке выбранной сортировки. '+(g.signed?'Нулевая ось в центре. ':'')+'Масштаб сумм общий для показанных территорий.'));
    if(!g.rows.length)chart.append(node('p','Нет данных для отображения.'));
    for(const r of g.rows){
     const item=node('div','');item.className='sme-finance-graph-row';
     item.append(node('h4',names.get(r.region)||r.region));
     const sum=node('div','');sum.className='sme-finance-graph-line';sum.append(node('span','Сумма'),node('strong',SmeFinance.fmt(r.value,metric.value)+' '+(r.value===null?'':unit)));
     if(r.value!==null){
      const track=node('div','');track.className='group-signed-track';track.setAttribute('aria-hidden','true');
      const fill=node('div','');fill.className='group-signed-fill'+(r.negative?' negative':'');fill.style.left=r.left+'%';fill.style.width=r.width+'%';track.append(fill);
      if(g.signed){const axis=node('div','');axis.className='group-signed-zero';axis.style.left='50%';track.append(axis)}
      item.append(sum,track);
     }else item.append(sum,node('p','Нет наблюдаемой суммы'));
     const cover=node('div','');cover.className='sme-finance-graph-line';cover.append(node('span','Охват показателя'),node('strong',pct(r.observed)));item.append(cover);
     if(r.observed!==null){
      const stack=node('div','');stack.className='sme-finance-stack';stack.setAttribute('aria-hidden','true');
      for(const [key,value] of [['observed',r.observed],['missing',r.matchedMissing],['unmatched',r.unmatched]]){const part=node('span','');part.className='sme-finance-'+key;part.style.flexBasis=value+'%';stack.append(part)}
      item.append(stack,node('p','Есть показатель: '+r.observations.toLocaleString('ru')+' · Совпали без показателя: '+(r.matched-r.observations).toLocaleString('ru')+' · Не совпали: '+(r.sme_total-r.matched).toLocaleString('ru')));
     }else item.append(node('p','Нет знаменателя для расчёта охвата.'));
     chart.append(item);
    }
   }
   status.textContent='Финансовый год: '+d.financial_year+' · классификация: '+d.sme_edition+' · '+d.eligible_regions+' территорий в диагностике. Данные только по совпавшим ИНН; не итог отрасли.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Регион','ЮЛ МСП','Совпали по ИНН','Есть показатель','Охват, %','Сумма, '+unit]){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const v of [names.get(r.region)||r.region,r.sme_total.toLocaleString('ru'),r.matched.toLocaleString('ru'),r.observations.toLocaleString('ru'),r.coverage===null?'—':r.coverage.toLocaleString('ru',{maximumFractionDigits:2}),SmeFinance.fmt(r.value,metric.value)])tr.insertCell().textContent=v}
   table.replaceChildren(t);if(!rows.length)table.append(node('p','Нет территорий, соответствующих выбранному порогу охвата.'));exp.disabled=!rows.length;exp.onclick=()=>csv('sme-finance-'+cls.value+'.csv',[['Год финансов','Дата МСП','Тип кода','Класс','Регион','ЮЛ','Совпали','Есть показатель','Охват, %','Показатель','Сумма в копейках или людях','Отпечаток финансового индекса','SHA-256 МСП','SHA-256 сверки','Минимальный охват, %','Сортировка'],...rows.map(r=>[d.financial_year,d.sme_edition,kind.value,cls.value,r.region,r.sme_total,r.matched,r.observations,r.coverage,metric.value,r.value,d.financial_fingerprint,d.sme_archive_sha256,d.reference_sha256,min,sort])]);
  }
  const pk=$('sme-pair-kind'),pc=$('sme-pair-class'),pm=$('sme-pair-metric'),pt=$('sme-pair-table'),ps=$('sme-pair-status'),pe=$('sme-pair-export'),po=$('sme-pair-overview');
  if(pk&&pc&&pm&&pt&&ps&&pe&&po){
   if(d.paired_sums_version!==1)ps.textContent='Парные суммы ещё не получены. Расчёты по несовпадающим наблюдениям не выполняются.';
   else{
    pm.replaceChildren(...SmeFinance.pairSpecs.map(x=>new Option(x.label,x.id)));
    function pairOptions(){const old=pc.value;pc.replaceChildren(...[...new Set(d[pk.value].map(r=>r.class))].sort().map(c=>new Option(c==='missing_or_other_version'?'Нет ОКВЭД2 / другая версия':c,c)));if([...pc.options].some(o=>o.value===old))pc.value=old;pairDraw()}
    function pairDraw(){
     const spec=SmeFinance.pairSpecs.find(x=>x.id===pm.value),rows=SmeFinance.paired(d,pk.value,pc.value,pm.value),a=SmeFinance.pairSummary(rows,pm.value),pct=n=>n===null?'—':n.toLocaleString('ru',{maximumFractionDigits:2})+' %',fmt=n=>SmeFinance.fmt(n,'income');
     ps.textContent='Парные наблюдения · финансовый год '+d.financial_year+' · МСП '+d.sme_edition+'. Не прибыль и не производительность труда.';
     po.replaceChildren();for(const [label,value] of [['ЮЛ МСП',a.total.toLocaleString('ru')],['Парных наблюдений',a.observations.toLocaleString('ru')],['Охват',pct(a.coverage)],[spec.label,fmt(a.value)+(a.value===null?'':' '+spec.unit)]]){const card=node('div','');card.className='metric';card.append(node('b',value),node('span',label));po.append(card)}
     const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
     const units=pm.value==='income_worker'?'Работники, чел.':'Расходы, руб.';
     for(const v of ['Регион','ЮЛ МСП','Парных наблюдений','Охват','Доходы, руб.',units,spec.label+', '+spec.unit]){const th=node('th',v);th.scope='col';h.append(th)}
     for(const r of rows){const tr=body.insertRow();for(const v of [names.get(r.region)||r.region,r.sme_total.toLocaleString('ru'),r.observations.toLocaleString('ru'),pct(r.coverage),fmt(r.a),SmeFinance.fmt(r.b,pm.value==='income_worker'?'workers':'income'),fmt(r.value)])tr.insertCell().textContent=v}
     pt.replaceChildren(t);pe.disabled=!rows.length;
     pe.onclick=()=>csv('sme-paired-'+spec.id+'-'+pc.value+'.csv',[['Год финансов','Дата МСП','Тип ОКВЭД','Класс','Регион','ЮЛ МСП','Парных наблюдений','Охват, %','Показатель','Доходы, копейки','Расходы, копейки или работники','Результат, копейки или сотые процента','Единица','Отпечаток финансового индекса','SHA-256 МСП','SHA-256 сверки','Отпечаток манифеста'],...rows.map(r=>[d.financial_year,d.sme_edition,pk.value,pc.value,r.region,r.sme_total,r.observations,r.coverage,spec.id,r.a,r.b,r.value,spec.unit,d.financial_fingerprint,d.sme_archive_sha256,d.reference_sha256,m.data_fingerprint])]);
    }
    pk.disabled=pc.disabled=pm.disabled=false;pk.onchange=pairOptions;pc.onchange=pm.onchange=pairDraw;pairOptions();
   }
  }
  kind.disabled=cls.disabled=metric.disabled=false;kind.onchange=options;cls.onchange=metric.onchange=draw;for(const el of [threshold,order,$('sme-finance-chart-limit')])if(el){el.disabled=false;el.onchange=draw;}options();
 }catch(e){status.textContent='Диагностика недоступна: '+String(e.message||e)}
});
