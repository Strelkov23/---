const BankCapital=(()=>{
 function ranked(rows){return [...rows].sort((a,b)=>BigInt(a.capital)>BigInt(b.capital)?-1:BigInt(a.capital)<BigInt(b.capital)?1:Number(a.registration_number)-Number(b.registration_number)).map((r,i,all)=>({...r,rank:1+all.filter(x=>BigInt(x.capital)>BigInt(r.capital)).length}))}
 return {ranked};
})();
if(typeof module!=='undefined')module.exports=BankCapital;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('bank-capital-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'bank-capital.json',root)).data,dir=(await Provenance.get(m,'bank-directory.json',root)).data;
  const names=new Map(dir.datasets.full.rows.map(r=>[r.registration_number,r.name])),system=new Set(dir.datasets.system.rows.map(r=>r.registration_number));
  const scope=$('bank-capital-scope'),out=$('bank-capital-table'),exp=$('bank-capital-export'),fmt=v=>v===null?'—':BigInt(v).toLocaleString('ru');
  function draw(){
   const rows=BankCapital.ranked(d.rows.filter(r=>scope.value==='system'?system.has(r.registration_number):scope.value==='active'?(d.target_cohort||[]).includes(r.registration_number):true));
   const verified=new Set(d.rows.filter(r=>r.verification==='html').map(r=>r.registration_number)),target=scope.value==='system'?[...system]:scope.value==='active'?(d.target_cohort||[]):(d.target_cohort||[]),covered=target.filter(x=>verified.has(x)).length;
   status.textContent='Дата: '+d.period+' · '+rows.length+' записей в выборке · проверены HTML: '+rows.filter(r=>r.verification==='html').length+(target.length?' · охват целевого перечня: '+covered+' из '+target.length:'')+'. Перечень от '+(d.cohort_edition||'—')+'. Не рейтинг всего сектора. Не раскрыто ≠ 0.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const label of ['Место в выборке','Банк / рег. №','Капитал, тыс. руб.','На начало отчётного года, тыс. руб.','Строка','Проверка','Источник']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const v of [r.rank,(names.get(r.registration_number)||'Рег. № '+r.registration_number)+' · '+r.registration_number,fmt(r.capital),fmt(r.opening),r.line,r.verification==='html'?'HTML / SHA-256':'Документальная сверка'])tr.insertCell().textContent=v;const a=node('a','Форма 808');a.href=r.source;tr.insertCell().append(a)}
   out.replaceChildren(t);exp.disabled=!rows.length;exp.onclick=()=>csv('bank-capital-'+d.period+'.csv',[['Дата','Место в выборке','Рег. номер','Название по текущему реестру','Капитал, тыс. руб.','На начало отчётного года, тыс. руб.','Строка','Верификация','Источник','SHA-256 HTML','Отпечаток манифеста'],...rows.map(r=>[d.period,r.rank,r.registration_number,names.get(r.registration_number)||'',r.capital,r.opening,r.line,r.verification,r.source,r.sha256,m.data_fingerprint])]);
  }
  scope.onchange=draw;draw();
 }catch(e){status.textContent='Данные капитала недоступны: '+String(e.message||e)}
});
