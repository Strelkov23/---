const BankBalance=(()=>{
 function compare(rows,key){return [...rows].sort((a,b)=>a.current[key]===null?b.current[key]===null?0:1:b.current[key]===null?-1:BigInt(a.current[key])>BigInt(b.current[key])?-1:BigInt(a.current[key])<BigInt(b.current[key])?1:Number(a.registration_number)-Number(b.registration_number))}
 function share(n,d){return n===null||d===null||BigInt(d)<=0n?null:Number(BigInt(n)*10000n/BigInt(d))/100}
 const specs=[
  {id:'equity_assets',label:'Собственные средства / активы',n:'equity',d:'assets',signed:true},
  {id:'loans_assets',label:'Чистая ссудная задолженность / активы',n:'loans',d:'assets'},
  {id:'client_liabilities',label:'Средства клиентов / обязательства',n:'client_funds',d:'liabilities'},
  {id:'retail_client',label:'Средства физлиц и ИП / средства клиентов',n:'retail_funds',d:'client_funds'}
 ];
 function ratio(values,spec){
  const a=values?.[spec.n],b=values?.[spec.d];
  if(a==null||b==null)return null;
  const n=BigInt(a),d=BigInt(b);
  if(d<=0n||(!spec.signed&&n<0n))return null;
  const abs=n<0n?-n:n;
  return ((n<0n?-1n:1n)*((abs*20000n+d)/(2n*d))).toString();
 }
 function ratios(data,id,scope='all',system=[]){
  const spec=specs.find(x=>x.id===id);if(!spec||!['all','active','system'].includes(scope))throw Error('Параметр сравнения');
  const ids=new Set(scope==='active'?data.cohort:system);
  const rows=data.rows.filter(r=>scope==='all'||ids.has(r.registration_number)).map(r=>{
   const value=ratio(r.current,spec),previous=ratio(r.prior,spec);
   return {...r,value,previous,delta:value===null||previous===null?null:(BigInt(value)-BigInt(previous)).toString()};
  }).sort((a,b)=>a.value===null?b.value===null?Number(a.registration_number)-Number(b.registration_number):1:b.value===null?-1:BigInt(a.value)>BigInt(b.value)?-1:BigInt(a.value)<BigInt(b.value)?1:Number(a.registration_number)-Number(b.registration_number));
  return {spec,rows,eligible:rows.filter(r=>r.value!==null).length,paired:rows.filter(r=>r.delta!==null).length};
 }
 function percent(v){
  if(v===null)return '—';const n=BigInt(v),a=n<0n?-n:n;
  return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0');
 }
 return {compare,share,specs,ratio,ratios,percent};
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
  const rs=$('bank-ratio-scope'),rm=$('bank-ratio-metric'),rt=$('bank-ratio-table'),re=$('bank-ratio-export'),rstatus=$('bank-ratio-status');
  if(rs&&rm&&rt&&re&&rstatus){
   rm.replaceChildren(...BankBalance.specs.map(x=>new Option(x.label,x.id)));
   function ratioDraw(){
    const result=BankBalance.ratios(d,rm.value,rs.value,[...sys]),p=result.spec;
    rstatus.textContent='Сопоставимых значений: '+result.eligible+' из '+result.rows.length+' проверенных балансов; оба среза: '+result.paired+'. Не обязательные нормативы ЦБ.';
    const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
    for(const v of ['Банк / рег. №','Числитель, тыс. руб.','Знаменатель, тыс. руб.','На '+d.period+', %','Предыдущий год, %','Изменение, п.п.','Источник']){const th=node('th',v);th.scope='col';h.append(th)}
    for(const r of result.rows){const tr=body.insertRow();for(const v of [(names.get(r.registration_number)||'Рег. №')+' · '+r.registration_number,fmt(r.current[p.n]),fmt(r.current[p.d]),BankBalance.percent(r.value),BankBalance.percent(r.previous),BankBalance.percent(r.delta)])tr.insertCell().textContent=v;const a=node('a','Форма 806');a.href=r.source;tr.insertCell().append(a)}
    rt.replaceChildren(t);re.disabled=!result.rows.length;
    re.onclick=()=>csv('bank-balance-ratios-'+p.id+'.csv',[['Дата','Рег. номер','Банк','Показатель','Числитель','Знаменатель','Числитель ранее','Знаменатель ранее','Текущий, сотые процента','Ранее, сотые процента','Разница, сотые п.п.','Источник','SHA-256','Отпечаток манифеста'],...result.rows.map(r=>[d.period,r.registration_number,names.get(r.registration_number)||'',p.id,r.current[p.n],r.current[p.d],r.prior[p.n],r.prior[p.d],r.value,r.previous,r.delta,r.source,r.sha256,m.data_fingerprint])]);
   }
   rs.onchange=rm.onchange=ratioDraw;ratioDraw();
  }

 }catch(e){status.textContent='Балансы недоступны: '+String(e.message||e)}
});
