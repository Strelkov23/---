document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('state-status'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:2}):'—';
 function table(host,headers,rows){const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const x of headers){const th=document.createElement('th');th.textContent=x;th.scope='col';h.append(th)}for(const row of rows){const tr=b.insertRow();for(const x of row)tr.insertCell().textContent=x}host.replaceChildren(t)}
 try{const d=await load('financial-state.json'),dates=d.debt.map(x=>x.period);
 table($('debt-table'),['Показатель, млрд ₽',...dates,'Изменение к предыдущей дате, млрд ₽'],Object.entries(d.labels).map(([k,title])=>[title,...d.debt.map(x=>fmt(x[k])),fmt(d.debt[1][k]-d.debt[0][k])]));
 table($('debt-ratios'),['Доля, %',...dates,'Изменение, п.п.'],['total','payable','loans','receivable'].map(k=>['Просроченная: '+d.labels[k],...d.debt.map(x=>fmt(x['overdue_'+k+'_pct'])),fmt(d.debt[1]['overdue_'+k+'_pct']-d.debt[0]['overdue_'+k+'_pct'])]));
 const a=d.annual,b=d.results[0];table($('results-totals'),['Период','Сальдо, млрд ₽','Прибыль, млрд ₽','Убыток, млрд ₽'],[a,b].map(x=>[x.period,fmt(x.balance),fmt(x.profit),fmt(x.loss)]));
 const p=document.createElement('p');p.textContent='Доля убыточных организаций в январе–августе 2026: '+fmt(d.current.loss_pct)+'%; в том же периоде 2025: '+fmt(d.current.prior_loss_pct)+'%. Охват: '+d.coverage;$('results-totals').append(p);
 function draw(){const q=$('results-query').value.trim().toLowerCase();const rows=d.results.filter(x=>(x.title+' '+x.code).toLowerCase().includes(q));table($('results-table'),['Вид деятельности','Сальдо, млрд ₽','Прибыль, млрд ₽','Убыток, млрд ₽','Индекс к тому же периоду 2025, %','Расхождение округления, млрд ₽'],rows.map(x=>[x.title,...[x.balance,x.profit,x.loss,x.published_yoy_index,x.rounding_difference].map(fmt)]));$('state-status').textContent='Выборочных строк: '+rows.length+' из '+d.results.length+'; '+d.verification}
 $('results-query').addEventListener('input',draw);draw();
 }catch(e){$('state-status').textContent='Набор недоступен.'}
});