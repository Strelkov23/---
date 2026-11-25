const SmeFinance=(()=>{
 function compare(d,kind,cls,metric){
  if(!['declared','reported'].includes(kind)||!['income','expense','workers'].includes(metric))throw Error('Параметр');
  return d[kind].filter(r=>r.class===cls).map(r=>({...r,value:r[metric+'_sum'],observations:r[metric+'_observations'],coverage:r.sme_total?100*r[metric+'_observations']/r.sme_total:null})).sort((a,b)=>a.value===null?b.value===null?a.region.localeCompare(b.region):1:b.value===null?-1:BigInt(a.value)>BigInt(b.value)?-1:BigInt(a.value)<BigInt(b.value)?1:a.region.localeCompare(b.region));
 }
 function fmt(v,metric){if(v===null)return '—';const n=BigInt(v);if(metric==='workers')return n.toLocaleString('ru');const a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')}
 return {compare,fmt};
})();
if(typeof module!=='undefined')module.exports=SmeFinance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('sme-finance-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'sme-finance.json',root)).data,ref=(await Provenance.get(m,'sme-regions.json',root)).data;
  if(d.status!=='diagnostic'){status.textContent='Финансово-отраслевая диагностика пока не опубликована.';return}
  const names=new Map(ref.rows.map(r=>[r.code,r.name])),kind=$('sme-finance-kind'),cls=$('sme-finance-class'),metric=$('sme-finance-metric'),table=$('sme-finance-table'),exp=$('sme-finance-export');
  function options(){const old=cls.value;cls.replaceChildren(...[...new Set(d[kind.value].map(r=>r.class))].sort().map(c=>new Option(c==='missing_or_other_version'?'Нет ОКВЭД2 / другая версия':c,c)));if([...cls.options].some(o=>o.value===old))cls.value=old;draw()}
  function draw(){
   const rows=SmeFinance.compare(d,kind.value,cls.value,metric.value),unit=metric.value==='workers'?'чел.':'руб.';
   status.textContent='Финансовый год: '+d.financial_year+' · классификация: '+d.sme_edition+' · '+d.eligible_regions+' территорий в диагностике. Данные только по совпавшим ИНН; не итог отрасли.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Регион','ЮЛ МСП','Совпали по ИНН','Есть показатель','Охват, %','Сумма, '+unit]){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const v of [names.get(r.region)||r.region,r.sme_total.toLocaleString('ru'),r.matched.toLocaleString('ru'),r.observations.toLocaleString('ru'),r.coverage===null?'—':r.coverage.toLocaleString('ru',{maximumFractionDigits:2}),SmeFinance.fmt(r.value,metric.value)])tr.insertCell().textContent=v}
   table.replaceChildren(t);exp.disabled=!rows.length;exp.onclick=()=>csv('sme-finance-'+cls.value+'.csv',[['Год финансов','Дата МСП','Тип кода','Класс','Регион','ЮЛ','Совпали','Есть показатель','Охват, %','Показатель','Сумма в копейках или людях','Отпечаток финансового индекса','SHA-256 МСП','SHA-256 сверки'],...rows.map(r=>[d.financial_year,d.sme_edition,kind.value,cls.value,r.region,r.sme_total,r.matched,r.observations,r.coverage,metric.value,r.value,d.financial_fingerprint,d.sme_archive_sha256,d.reference_sha256])]);
  }
  kind.disabled=cls.disabled=metric.disabled=false;kind.onchange=options;cls.onchange=metric.onchange=draw;options();
 }catch(e){status.textContent='Диагностика недоступна: '+String(e.message||e)}
});
