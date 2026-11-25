const BankProfit=(()=>{
 function compare(rows,key){return [...rows].sort((a,b)=>a.current[key]===null?b.current[key]===null?0:1:b.current[key]===null?-1:BigInt(a.current[key])>BigInt(b.current[key])?-1:BigInt(a.current[key])<BigInt(b.current[key])?1:Number(a.registration_number)-Number(b.registration_number))}
 function change(a,b){return a===null||b===null||BigInt(b)<=0n?null:Number((BigInt(a)-BigInt(b))*10000n/BigInt(b))/100}
 function fee(r){return r.fee_income===null||r.fee_expense===null?null:String(BigInt(r.fee_income)-BigInt(r.fee_expense))}
 return {compare,change,fee};
})();
if(typeof module!=='undefined')module.exports=BankProfit;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('bank-profit-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'bank-profit.json',root)).data,dir=(await Provenance.get(m,'bank-directory.json',root)).data;
  const names=new Map(dir.datasets.full.rows.map(r=>[r.registration_number,r.name])),scope=$('bank-profit-scope'),metric=$('bank-profit-metric'),out=$('bank-profit-table'),exp=$('bank-profit-export'),sys=new Set(dir.datasets.system.rows.map(r=>r.registration_number));
  const labels={profit:'Прибыль / убыток',pretax_profit:'Прибыль до налогообложения',interest_income:'Процентные доходы',interest_expense:'Процентные расходы',net_interest:'Чистые процентные доходы',net_interest_after_reserves:'Чистые процентные доходы после резервов',fee_income:'Комиссионные доходы',fee_expense:'Комиссионные расходы',net_fee:'Чистые комиссионные доходы (расчёт)',net_income:'Чистые доходы / расходы',operating_expense:'Операционные расходы'};
  const fmt=v=>v===null?'—':BigInt(v).toLocaleString('ru');
  function draw(){
   const rows=BankProfit.compare(d.rows.filter(r=>scope.value==='system'?sys.has(r.registration_number):scope.value==='active'?d.cohort.includes(r.registration_number):true).map(r=>({...r,current:{...r.current,net_fee:BankProfit.fee(r.current)},prior:{...r.prior,net_fee:BankProfit.fee(r.prior)}})),metric.value);
   status.textContent='I квартал 2026 / I квартал 2025 · '+rows.length+' проверенных отчётов · '+rows.filter(r=>r.current[metric.value]!==null).length+' значений показателя. Не рейтинг всего сектора.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Банк / рег. №',labels[metric.value]+', тыс. руб.','I квартал 2025, тыс. руб.','Изменение, %','Источник']){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow(),change=BankProfit.change(r.current[metric.value],r.prior[metric.value]);for(const v of [(names.get(r.registration_number)||'Рег. №')+' · '+r.registration_number,fmt(r.current[metric.value]),fmt(r.prior[metric.value]),change===null?'—':change.toLocaleString('ru')])tr.insertCell().textContent=v;const a=node('a','Форма 807');a.href=r.source;tr.insertCell().append(a)}
   out.replaceChildren(t);exp.disabled=!rows.length;exp.onclick=()=>csv('bank-profit-'+metric.value+'.csv',[['Период','Рег. номер','Банк','Показатель','Тыс. руб.','Сопоставимый квартал','Тыс. руб. ранее','Источник','SHA-256','Отпечаток манифеста'],...rows.map(r=>[d.period,r.registration_number,names.get(r.registration_number)||'',labels[metric.value],r.current[metric.value],d.prior_period,r.prior[metric.value],r.source,r.sha256,m.data_fingerprint])]);
  }
  scope.onchange=metric.onchange=draw;draw();
 }catch(e){status.textContent='Финансовые результаты недоступны: '+String(e.message||e)}
});
