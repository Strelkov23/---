const BankBalance=(()=>{
 function compare(rows,key){return [...rows].sort((a,b)=>a.current[key]===null?b.current[key]===null?0:1:b.current[key]===null?-1:BigInt(a.current[key])>BigInt(b.current[key])?-1:BigInt(a.current[key])<BigInt(b.current[key])?1:Number(a.registration_number)-Number(b.registration_number))}
 function share(n,d){return n===null||d===null||BigInt(d)<=0n?null:Number(BigInt(n)*10000n/BigInt(d))/100}
 return {compare,share};
})();
if(typeof module!=='undefined')module.exports=BankBalance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('bank-balance-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'bank-balance.json',root)).data,dir=(await Provenance.get(m,'bank-directory.json',root)).data;
  const names=new Map(dir.datasets.full.rows.map(r=>[r.registration_number,r.name])),scope=$('bank-balance-scope'),metric=$('bank-balance-metric'),out=$('bank-balance-table'),exp=$('bank-balance-export'),sys=new Set(dir.datasets.system.rows.map(r=>r.registration_number));
  const labels={assets:'Активы',liabilities:'Обязательства',equity:'Источники собственных средств',loans:'Чистая ссудная задолженность по амортизированной стоимости',client_funds:'Средства клиентов по амортизированной стоимости',nonbank_funds:'Средства небанковских клиентов',retail_funds:'Средства физлиц и ИП'};
  const fmt=v=>v===null?'—':BigInt(v).toLocaleString('ru');
  function draw(){
   const rows=BankBalance.compare(d.rows.filter(r=>scope.value==='system'?sys.has(r.registration_number):scope.value==='active'?d.cohort.includes(r.registration_number):true),metric.value);
   status.textContent='Срез '+d.period+' · '+rows.length+' проверенных балансов · '+rows.filter(r=>r.current[metric.value]!==null).length+' значений выбранного показателя. Целевой перечень: '+d.cohort.length+' действующих банков на '+(d.cohort_edition||'—')+'. Не весь сектор.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Банк / рег. №',labels[metric.value]+', тыс. руб.','Предыдущий отчётный год, тыс. руб.','Доля в активах, %','Источник']){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow(),share=BankBalance.share(r.current[metric.value],r.current.assets);for(const v of [(names.get(r.registration_number)||'Рег. №')+' · '+r.registration_number,fmt(r.current[metric.value]),fmt(r.prior[metric.value]),share===null?'—':share.toLocaleString('ru')])tr.insertCell().textContent=v;const a=node('a','Форма 806');a.href=r.source;tr.insertCell().append(a)}
   out.replaceChildren(t);exp.disabled=!rows.length;exp.onclick=()=>csv('bank-balance-'+metric.value+'.csv',[['Дата','Рег. номер','Название по текущему реестру','Показатель','Тыс. руб.','Предыдущий отчётный год, тыс. руб.','Источник','SHA-256','Отпечаток манифеста'],...rows.map(r=>[d.period,r.registration_number,names.get(r.registration_number)||'',labels[metric.value],r.current[metric.value],r.prior[metric.value],r.source,r.sha256,m.data_fingerprint])]);
  }
  scope.onchange=metric.onchange=draw;draw();
 }catch(e){status.textContent='Балансы недоступны: '+String(e.message||e)}
});
