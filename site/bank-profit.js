const BankProfit=(()=>{
 function compare(rows,key){return [...rows].sort((a,b)=>a.current[key]===null?b.current[key]===null?0:1:b.current[key]===null?-1:BigInt(a.current[key])>BigInt(b.current[key])?-1:BigInt(a.current[key])<BigInt(b.current[key])?1:Number(a.registration_number)-Number(b.registration_number))}
 function change(a,b){return a===null||b===null||BigInt(b)<=0n?null:Number((BigInt(a)-BigInt(b))*10000n/BigInt(b))/100}
 function fee(r){return r.fee_income===null||r.fee_expense===null?null:String(BigInt(r.fee_income)-BigInt(r.fee_expense))}
 const specs=[
  {id:'interest_cost',label:'Процентные расходы / процентные доходы',n:'interest_expense',d:'interest_income'},
  {id:'fee_cost',label:'Комиссионные расходы / комиссионные доходы',n:'fee_expense',d:'fee_income'},
  {id:'operating_cost',label:'Операционные расходы / чистые доходы',n:'operating_expense',d:'net_income'},
  {id:'net_interest_share',label:'Чистые процентные доходы / процентные доходы',n:'net_interest',d:'interest_income',signed:true}
 ];
 function ratio(v,s){
  if(v?.[s.n]==null||v?.[s.d]==null)return null;
  const n=BigInt(v[s.n]),d=BigInt(v[s.d]);if(d<=0n||(!s.signed&&n<0n))return null;
  return ((n<0n?-1n:1n)*((20000n*(n<0n?-n:n)+d)/(2n*d))).toString();
 }
 function scopeRows(data,scope,system=[]){
  if(!['all','system','active'].includes(scope))throw Error('Выборка');
  const ids=new Set(scope==='active'?data.cohort:system);
  return data.rows.filter(r=>scope==='all'||ids.has(r.registration_number));
 }
 function ratios(data,id,scope='all',system=[]){
  const spec=specs.find(s=>s.id===id);if(!spec)throw Error('Показатель');
  const rows=scopeRows(data,scope,system).map(r=>{
   const value=ratio(r.current,spec),previous=ratio(r.prior,spec);
   return {...r,value,previous,delta:value===null||previous===null?null:(BigInt(value)-BigInt(previous)).toString()};
  }).sort((a,b)=>a.value===null?b.value===null?Number(a.registration_number)-Number(b.registration_number):1:b.value===null?-1:BigInt(a.value)>BigInt(b.value)?-1:BigInt(a.value)<BigInt(b.value)?1:Number(a.registration_number)-Number(b.registration_number));
  return {spec,rows,eligible:rows.filter(r=>r.value!==null).length,paired:rows.filter(r=>r.delta!==null).length};
 }
 function transition(a,b){
  if(a==null||b==null)return 'missing';
  const sign=v=>BigInt(v)>0n?'profit':BigInt(v)<0n?'loss':'zero';
  return sign(b)+'_'+sign(a);
 }
 function pairedProfit(data,scope='all',system=[]){
  const rows=scopeRows(data,scope,system).map(r=>({...r,transition:transition(r.current.profit,r.prior.profit),delta:r.current.profit==null||r.prior.profit==null?null:(BigInt(r.current.profit)-BigInt(r.prior.profit)).toString()}));
  const pairs=rows.filter(r=>r.delta!==null);
  const current=pairs.length?pairs.reduce((n,r)=>n+BigInt(r.current.profit),0n):null;
  const prior=pairs.length?pairs.reduce((n,r)=>n+BigInt(r.prior.profit),0n):null;
  const counts={};for(const r of rows)counts[r.transition]=(counts[r.transition]||0)+1;
  return {rows,paired:pairs.length,current:current?.toString()??null,prior:prior?.toString()??null,delta:current===null?null:(current-prior).toString(),counts};
 }
 function percent(v){
  if(v===null)return '—';const n=BigInt(v),a=n<0n?-n:n;
  return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0');
 }
 return {compare,change,fee,specs,ratio,ratios,transition,pairedProfit,percent};
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
  const rs=$('bank-profit-ratio-scope'),rm=$('bank-profit-ratio-metric'),rt=$('bank-profit-ratio-table'),re=$('bank-profit-ratio-export'),rstatus=$('bank-profit-ratio-status'),overview=$('bank-profit-paired'),pe=$('bank-profit-paired-export');
  if(rs&&rm&&rt&&re&&rstatus&&overview&&pe){
   const transitions={profit:'прибыль',loss:'убыток',zero:'нулевой результат'},label=k=>k==='missing'?'Нет пары':k.split('_').map(v=>transitions[v]).join(' → ');
   rm.replaceChildren(...BankProfit.specs.map(x=>new Option(x.label,x.id)));
   function ratioDraw(){
    const result=BankProfit.ratios(d,rm.value,rs.value,[...sys]),p=result.spec,paired=BankProfit.pairedProfit(d,rs.value,[...sys]);
    rstatus.textContent='Сопоставимых отношений: '+result.eligible+' из '+result.rows.length+' отчётов; оба периода: '+result.paired+'. '+d.period+' / '+d.prior_period+'.';
    overview.replaceChildren();
    for(const [name,value] of [['Банков с двумя значениями прибыли',String(paired.paired)+' / '+paired.rows.length],['Прибыль / убыток, текущий квартал, тыс. руб.',fmt(paired.current)],['Прибыль / убыток, прошлый квартал, тыс. руб.',fmt(paired.prior)],['Изменение, тыс. руб.',fmt(paired.delta)]]){
     const card=node('div','');card.className='metric';card.append(node('b',value),node('span',name));overview.append(card)
    }
    for(const [k,n] of Object.entries(paired.counts).sort()){const card=node('div','');card.className='metric';card.append(node('b',String(n)),node('span',label(k)));overview.append(card)}
    pe.disabled=!paired.rows.length;
    pe.onclick=()=>csv('bank-profit-paired.csv',[['Период','Сопоставимый период','Рег. номер','Банк','Прибыль сейчас, тыс. руб.','Прибыль ранее, тыс. руб.','Изменение, тыс. руб.','Переход','Источник','SHA-256','Отпечаток манифеста'],...paired.rows.map(r=>[d.period,d.prior_period,r.registration_number,names.get(r.registration_number)||'',r.current.profit,r.prior.profit,r.delta,label(r.transition),r.source,r.sha256,m.data_fingerprint])]);
    const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
    for(const v of ['Банк / рег. №','Числитель, тыс. руб.','Знаменатель, тыс. руб.','Текущий квартал, %','Годом ранее, %','Изменение, п.п.','Источник']){const th=node('th',v);th.scope='col';h.append(th)}
    for(const r of result.rows){const tr=body.insertRow();for(const v of [(names.get(r.registration_number)||'Рег. №')+' · '+r.registration_number,fmt(r.current[p.n]),fmt(r.current[p.d]),BankProfit.percent(r.value),BankProfit.percent(r.previous),BankProfit.percent(r.delta)])tr.insertCell().textContent=v;const a=node('a','Форма 807');a.href=r.source;tr.insertCell().append(a)}
    rt.replaceChildren(t);re.disabled=!result.rows.length;
    re.onclick=()=>csv('bank-profit-ratios-'+p.id+'.csv',[['Период','Сопоставимый период','Рег. номер','Банк','Показатель','Числитель','Знаменатель','Числитель ранее','Знаменатель ранее','Текущий, сотые процента','Ранее, сотые процента','Разница, сотые п.п.','Источник','SHA-256','Отпечаток манифеста'],...result.rows.map(r=>[d.period,d.prior_period,r.registration_number,names.get(r.registration_number)||'',p.id,r.current[p.n],r.current[p.d],r.prior[p.n],r.prior[p.d],r.value,r.previous,r.delta,r.source,r.sha256,m.data_fingerprint])]);
   }
   rs.onchange=rm.onchange=ratioDraw;ratioDraw();
  }

 }catch(e){status.textContent='Финансовые результаты недоступны: '+String(e.message||e)}
});
