const BankHistory=(()=>{
 function series(d,reg){return [...new Set([...Object.keys(d.snapshots),...Object.keys(d.attempts||{})])].sort().map(period=>({period,record:(d.snapshots[period]||[]).find(r=>r.registration_number===reg)||null,error:d.attempts?.[period]?.errors?.[reg]||null}));}
 function delta(a,b){return a!==null&&b!==null&&BigInt(a)>0n?Number((BigInt(b)-BigInt(a))*10000n/BigInt(a))/100:null}
 return {series,delta};
})();
if(typeof module!=='undefined')module.exports=BankHistory;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('bank-history-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'bank-capital-history.json',root)).data,dir=(await Provenance.get(m,'bank-directory.json',root)).data;
  const names=new Map(dir.datasets.full.rows.map(x=>[x.registration_number,x.name])),pick=$('bank-history-pick'),out=$('bank-history-table'),exp=$('bank-history-export'),chart=$('bank-history-chart');
  pick.replaceChildren(...d.cohort.map(reg=>new Option(names.get(reg)||'Рег. № '+reg,reg)));
  const fmt=v=>v===null?'—':BigInt(v).toLocaleString('ru');
  function draw(){
   const rows=BankHistory.series(d,pick.value),available=rows.filter(x=>x.record);
   status.textContent='Отдельные отчётные даты · '+available.length+' значений · перечень системно значимых на '+(d.cohort_edition||'—')+'. Пропуски не интерполируются.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const label of ['Дата','Капитал, тыс. руб.','Изменение к предыдущему доступному срезу','Источник']){const th=node('th',label);th.scope='col';h.append(th)}
   chart.replaceChildren();const max=available.reduce((a,x)=>BigInt(x.record.capital)>a?BigInt(x.record.capital):a,0n);
   let prev=null;
   for(const x of rows){const tr=b.insertRow(),v=x.record?.capital??null,change=BankHistory.delta(prev,v);for(const val of [x.period,fmt(v),change===null?'—':change.toLocaleString('ru')+' %'])tr.insertCell().textContent=val;
    if(x.record){const a=node('a','Форма 808');a.href=x.record.source;tr.insertCell().append(a);prev=v;}else tr.insertCell().textContent=x.error?'Не подтверждено: '+x.error:'Нет данных';
    if(v!==null&&BigInt(v)>=0n&&max>0n){const row=node('div','');row.className='rm-composition-row';const track=node('div','');track.className='group-signed-track';const bar=node('div','');bar.className='group-signed-fill';bar.style.left='0';bar.style.width=Number(BigInt(v)*10000n/max)/100+'%';track.append(bar);row.append(node('span',x.period),track,node('strong',fmt(v)));chart.append(row)}
   }
   out.replaceChildren(t);exp.disabled=!available.length;exp.onclick=()=>csv('bank-capital-history-'+pick.value+'.csv',[['Дата','Рег. номер','Капитал, тыс. руб.','Строка','Источник','SHA-256 HTML','Перечень системно значимых на дату','Отпечаток манифеста'],...rows.map(x=>[x.period,pick.value,x.record?.capital,x.record?.line,x.record?.source,x.record?.sha256,d.cohort_edition,m.data_fingerprint])]);
  }
  pick.disabled=!d.cohort.length;pick.onchange=draw;draw();
 }catch(e){status.textContent='История недоступна: '+String(e.message||e)}
});
