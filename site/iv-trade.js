/* Partner trade: annual aggregation only for matching observed month sets. */
const IVTrade=(()=>{
 function compare(rows,year,month){const a=rows.filter(r=>r.period.startsWith(year+'-')&&Number(r.period.slice(-2))<=month),b=new Map(rows.filter(r=>r.period.startsWith((year-1)+'-')).map(r=>[r.period.slice(-2),r]));const pairs=a.filter(r=>b.has(r.period.slice(-2)));const sum=(rs,k)=>rs.reduce((s,r)=>s+r[k],0);return {months:pairs.map(r=>r.period.slice(-2)),values:['us_exports','us_imports'].map(k=>{const now=sum(pairs,k),before=sum(pairs.map(r=>b.get(r.period.slice(-2))),k);return {now,before,change:pairs.length&&before>0?100*(now/before-1):null}})}}
 return {compare};
})();
if(typeof module!=='undefined')module.exports=IVTrade;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),sel=$('trade-year');if(!sel)return;
 try{const d=await load('independent-trade.json');if(d.schema!=='iv-trade-v1'||!Array.isArray(d.rows))throw Error('Некорректный набор');
 const years=[...new Set(d.rows.map(r=>r.period.slice(0,4)))].sort();years.forEach(y=>sel.add(new Option(y,y)));sel.value=years.at(-1);sel.disabled=false;const month=$('trade-month');month.disabled=false;
 $('trade-status').textContent='Источник: '+d.publisher+'. '+({manual_seed:'Ручная сверенная выборка.',seed_after_error:'Обновление не удалось, сохранена ручная выборка.',cached:'Сохранённый машинный ряд.',cached_after_error:'Ошибка обновления; сохранён предыдущий ряд.',downloaded:'Автоматически загруженный ряд.'}[d.status]||'Статус неизвестен.')+' Наблюдений: '+d.rows.length+'. '+(d.last_success?'Последняя успешная загрузка: '+d.last_success:'');
 function draw(){const yr=Number(sel.value),m=Number(month.value),r=IVTrade.compare(d.rows,yr,m);$('trade-month-label').textContent=m;const target=$('trade-result');target.replaceChildren();r.values.forEach((v,i)=>{const a=node('article','');a.className='pulse-card';a.append(node('h3',i?'Импорт США из России':'Экспорт США в Россию'),node('strong',r.months.length?fmt(v.now)+' млн $':'Нет сопоставимых месяцев'),node('p',v.change===null?'Темп не рассчитан':'К тому же набору месяцев прошлого года: '+fmt(v.change)+'%'));target.append(a)});$('trade-period').textContent='Сопоставлены месяцы: '+(r.months.join(', ')||'нет')+'. Это номинальная стоимость товаров, а не физический объём.';
 const body=$('trade-rows');body.replaceChildren();for(const row of d.rows.filter(r=>r.period.startsWith(sel.value+'-')&&Number(r.period.slice(-2))<=m)){const tr=body.insertRow();tr.insertCell().textContent=row.period;tr.insertCell().textContent=fmt(row.us_exports);tr.insertCell().textContent=fmt(row.us_imports)}}
 sel.onchange=month.oninput=draw;$('trade-export').disabled=false;$('trade-export').onclick=()=>csv('partner-trade.csv',[['Период','Экспорт США, млн USD','Импорт США, млн USD','Источник'],...d.rows.map(r=>[r.period,r.us_exports,r.us_imports,d.source])]);draw()
 }catch(e){$('trade-status').textContent='Набор недоступен: '+e.message}
});
