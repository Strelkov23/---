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
 return {compare,fmt,select,summary};
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
   status.textContent='Финансовый год: '+d.financial_year+' · классификация: '+d.sme_edition+' · '+d.eligible_regions+' территорий в диагностике. Данные только по совпавшим ИНН; не итог отрасли.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Регион','ЮЛ МСП','Совпали по ИНН','Есть показатель','Охват, %','Сумма, '+unit]){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const v of [names.get(r.region)||r.region,r.sme_total.toLocaleString('ru'),r.matched.toLocaleString('ru'),r.observations.toLocaleString('ru'),r.coverage===null?'—':r.coverage.toLocaleString('ru',{maximumFractionDigits:2}),SmeFinance.fmt(r.value,metric.value)])tr.insertCell().textContent=v}
   table.replaceChildren(t);if(!rows.length)table.append(node('p','Нет территорий, соответствующих выбранному порогу охвата.'));exp.disabled=!rows.length;exp.onclick=()=>csv('sme-finance-'+cls.value+'.csv',[['Год финансов','Дата МСП','Тип кода','Класс','Регион','ЮЛ','Совпали','Есть показатель','Охват, %','Показатель','Сумма в копейках или людях','Отпечаток финансового индекса','SHA-256 МСП','SHA-256 сверки','Минимальный охват, %','Сортировка'],...rows.map(r=>[d.financial_year,d.sme_edition,kind.value,cls.value,r.region,r.sme_total,r.matched,r.observations,r.coverage,metric.value,r.value,d.financial_fingerprint,d.sme_archive_sha256,d.reference_sha256,min,sort])]);
  }
  kind.disabled=cls.disabled=metric.disabled=false;kind.onchange=options;cls.onchange=metric.onchange=draw;for(const el of [threshold,order])if(el){el.disabled=false;el.onchange=draw;}options();
 }catch(e){status.textContent='Диагностика недоступна: '+String(e.message||e)}
});
