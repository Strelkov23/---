/* Corporate physical output: never add unlike products or infer national coverage. */
const IVPhysical=(()=>{
 function compare(company,metric,year,base){
  if(!company.metrics.some(m=>m.id===metric)||!Number.isInteger(year)||!Number.isInteger(base))throw Error('Некорректный выбор');
  const get=y=>{const v=company.rows.find(r=>r.year===y)?.[metric];return Number.isFinite(v)&&v>=0?v:null};
  const value=get(year),baseline=get(base),prior=get(year-1);
  return {value,baseline,prior,index:value!==null&&baseline>0?100*value/baseline:null,yoy:value!==null&&prior>0?100*(value/prior-1):null};
 }
 function validate(d){
  if(d.schema!=='iv-physical-v1'||!Array.isArray(d.companies)||!d.companies.length)throw Error('Некорректная схема');
  if(new Set(d.companies.map(c=>c.id)).size!==d.companies.length)throw Error('Дубликат компании');
  for(const c of d.companies){if(!c.source.startsWith('https://')||!c.metrics.length||!c.rows.length||new Set(c.rows.map(r=>r.year)).size!==c.rows.length||new Set(c.metrics.map(m=>m.id)).size!==c.metrics.length||c.rows.some(r=>!Number.isInteger(r.year)||(r.source!==undefined&&(typeof r.source!=='string'||!r.source.startsWith('https://')))||c.metrics.some(m=>r[m.id]!==null&&(!Number.isFinite(r[m.id])||r[m.id]<0))))throw Error('Некорректные наблюдения')}
  return d;
 }return {compare,validate};
})();
if(typeof module!=='undefined')module.exports=IVPhysical;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),company=$('physical-company');if(!company)return;
 const metric=$('physical-metric'),year=$('physical-year'),base=$('physical-base'),chart=$('physical-chart'),status=$('physical-status'),f=v=>v===null?'Нет данных':v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 try{const d=IVPhysical.validate(await load('independent-physical.json'));
 for(const c of d.companies)company.add(new Option(c.title,c.id));
 const selected=()=>d.companies.find(c=>c.id===company.value);
 function setup(){const c=selected(),ys=c.rows.map(r=>r.year).sort((a,b)=>a-b);metric.replaceChildren(...c.metrics.map(m=>new Option(m.title,m.id)));base.replaceChildren(...ys.map(y=>new Option(String(y),String(y))));year.min=0;year.max=ys.length-1;year.value=ys.length-1;year.disabled=ys.length<2;draw()}
 function draw(){const c=selected(),ys=c.rows.map(r=>r.year).sort((a,b)=>a-b),y=ys[Number(year.value)],m=c.metrics.find(m=>m.id===metric.value),a=IVPhysical.compare(c,m.id,y,Number(base.value));
 $('physical-year-label').textContent=y;$('physical-value').textContent=f(a.value)+(a.value===null?'':' '+m.unit);$('physical-index').textContent=f(a.index);$('physical-yoy').textContent=f(a.yoy)+(a.yoy===null?'':'%');
 $('physical-explain').textContent=c.scope+'. '+(a.yoy===null?'Нет сопоставимого предыдущего года.':'Выпуск '+(a.yoy>0?'увеличился':a.yoy<0?'сократился':'не изменился')+' относительно предыдущего года.')+' Не общероссийское производство; нет независимой проверки полноты корпоративной отчётности.';
 chart.replaceChildren();const vals=ys.map(yr=>[yr,IVPhysical.compare(c,m.id,yr,Number(base.value)).index]);const max=Math.max(100,...vals.filter(x=>x[1]!==null).map(x=>x[1]));
 for(const [yr,v] of vals){const line=node('div','');line.className='hh-bar-row';const meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=v??0;meter.hidden=v===null;meter.setAttribute('aria-label',yr+': '+f(v));line.append(node('span',String(yr)),meter,node('span',f(v)));chart.append(line)}
 const observation=c.rows.find(r=>r.year===y);$('physical-source').href=observation?.source||c.source;$('physical-source').textContent=observation?.reference||('Годовой отчёт, стр. '+c.page);
 $('physical-export').onclick=()=>csv('corporate-physical-output.csv',[['Компания','Год','Продукт','Значение','Единица','Базовый год','Индекс','Источник','Страница'],...ys.flatMap(yr=>c.metrics.map(m=>{const a=IVPhysical.compare(c,m.id,yr,Number(base.value));const observation=c.rows.find(r=>r.year===yr);return[c.title,yr,m.title,a.value,m.unit,base.value,a.index,observation?.source||c.source,observation?.reference||c.page]}))]);
 }
 company.disabled=metric.disabled=base.disabled=$('physical-export').disabled=false;company.onchange=setup;metric.onchange=base.onchange=year.oninput=draw;status.textContent='Корпоративная отчётность: '+d.companies.length+' групп, '+d.companies.reduce((s,c)=>s+c.rows.length*c.metrics.length,0)+' годовых наблюдений. Ручной перенос; автоматического обновления нет.';setup()
 }catch(e){status.textContent='Набор недоступен: '+e.message}
});
