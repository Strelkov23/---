/* Same-month labour-market comparison; no interpolation or economy-wide inference. */
const IVLabour=(()=>{
 function classify(v){return !Number.isFinite(v)||v<0?'нет оценки':v<4?'дефицит соискателей':v<=7.9?'умеренная конкуренция':'высокая конкуренция'}
 function relative(rows,month,year,base){const valid=r=>r.period.endsWith('-'+month)&&typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0;const a=rows.find(r=>valid(r)&&r.period===year+'-'+month),b=rows.find(r=>valid(r)&&r.period===base+'-'+month);return {value:a?.value??null,base:b?.value??null,index:a&&b&&b.value>0?100*a.value/b.value:null,difference:a&&b?a.value-b.value:null}}
 function balance(v,r){return Number.isFinite(v)&&Number.isFinite(r)&&v>-100&&r>=-100?100*(1+r/100)/(1+v/100):null}
 return {classify,relative,balance}
})();
if(typeof module!=='undefined')module.exports=IVLabour;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),month=$('hh-month');if(!month)return;
 const year=$('hh-year'),base=$('hh-base'),status=$('hh-status');
 try{
 const d=await load('independent-labour.json');if(d.schema!=='iv-labour-v1'||!Array.isArray(d.rows)||!d.rows.length)throw Error('Нет наблюдений');
 const fmt2=v=>v===null?'Нет данных':v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 function options(){const years=d.rows.filter(r=>r.period.endsWith('-'+month.value)).map(r=>r.period.slice(0,4)).sort();for(const s of [year,base]){const old=s.value;s.replaceChildren();years.forEach(y=>s.add(new Option(y,y)));s.value=years.includes(old)?old:s===year?years.at(-1):years[0]}draw()}
 function draw(){const r=IVLabour.relative(d.rows,month.value,year.value,base.value);$('hh-value').textContent=fmt2(r.value);$('hh-index').textContent=fmt2(r.index);$('hh-delta').textContent=fmt2(r.difference);$('hh-explain').textContent=r.value===null?'Нет наблюдения.':'По шкале hh.ru: '+IVLabour.classify(r.value)+'. Индекс 100 соответствует выбранному базовому году. Это сравнение конкуренции на платформе, не оценка числа безработных.';
 const chart=$('hh-chart');chart.replaceChildren();const rows=d.rows.filter(r=>r.period.endsWith('-'+month.value)).sort((a,b)=>a.period.localeCompare(b.period));const max=Math.max(12,...rows.map(r=>r.value));
 for(const row of rows){const div=node('div','');div.className='hh-bar-row';const label=node('span',row.period.slice(0,4));const meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=row.value;meter.setAttribute('aria-label',row.period+': '+row.value);div.append(label,meter,node('span',fmt2(row.value)));chart.append(div)}
 const snap=d.snapshots.find(s=>s.period===year.value+'-'+month.value);$('hh-snapshot').textContent=snap?'Вакансии к тому же месяцу прошлого года: '+fmt2(snap.vacancies_yoy)+'%; резюме: '+fmt2(snap.resumes_yoy)+'%; медиана предложений: '+fmt2(snap.offered_salary)+' ₽. Расчётный индекс изменения отношения резюме к вакансиям (прошлый год = 100): '+fmt2(IVLabour.balance(snap.vacancies_yoy,snap.resumes_yoy))+'. Исходные темпы округлены.':'Для выбранного месяца дополнительных наблюдений нет.';
 }
 month.disabled=year.disabled=base.disabled=false;month.onchange=options;year.onchange=base.onchange=draw;options();year.value=year.options[year.options.length-1].value;draw();
 status.textContent='15 значений индекса и шесть дополнительных показателей сверены по страницам трёх оригинальных PDF 26.11.2026. Границы шкалы: ниже 4; 4–7,9; выше 7,9. Промежуточные месяцы не восстановлены.';
 $('hh-export').disabled=false;$('hh-export').onclick=()=>csv('hh-observations.csv',[['Период','hh.индекс','Источник','Страница','Дата ручной сверки'],...d.rows.map(r=>[r.period,r.value,d.sources[r.source].url,d.sources[r.source].page,d.verification?.date||''])]);
 }catch(e){status.textContent='Наблюдения недоступны: '+e.message}
});
