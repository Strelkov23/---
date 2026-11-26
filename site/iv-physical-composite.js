/* Fixed composition, no renormalization over missing observations. */
const IVCompositePhysical=(()=>{
 const specs=[['nornickel','nickel','Норникель: никель'],['rosenergoatom','nuclear_generation','Росэнергоатом: выработка АЭС'],['rzd','loading','РЖД: погрузка'],['novatek','gas','НОВАТЭК: добыча газа'],['severstal','steel','Северсталь: выплавка стали']];
 function calculate(data,year,base,weights,allowDraft=false){
  if(!Number.isInteger(year)||!Number.isInteger(base)||!Array.isArray(weights)||weights.length!==specs.length||weights.some(w=>!Number.isFinite(w)||w<0||w>100))throw Error('Некорректные параметры');
  const total=weights.reduce((s,v)=>s+v,0);
  const items=specs.map(([id,key,title],i)=>{const c=data.companies.find(c=>c.id===id),v=c?.rows.find(r=>r.year===year)?.[key],b=c?.rows.find(r=>r.year===base)?.[key],index=Number.isFinite(v)&&v>=0&&Number.isFinite(b)&&b>0?100*v/b:null,weight=total>0?weights[i]/total:0;return {title,index,weight,verified:[year,base].every(y=>{const row=c?.rows.find(r=>r.year===y);return !!row&&(c.verification==='source_rechecked'||(c.verification==='partial'&&row.verification==='source_rechecked'))}),contribution:index===null?null:weight*(index-100)}});
  const active=items.filter(x=>x.weight>0),covered=active.filter(x=>x.index!==null),pending=active.filter(x=>!x.verified).length,blocked=pending>0&&!allowDraft,complete=!blocked&&total>0&&active.length===covered.length;
  return {items,complete,pending,blocked,index:complete?covered.reduce((s,x)=>s+x.weight*x.index,0):null,coverage:covered.reduce((s,x)=>s+x.weight,0),min:complete?Math.min(...covered.map(x=>x.index)):null,max:complete?Math.max(...covered.map(x=>x.index)):null}
 }return {specs,calculate}
})();
if(typeof module!=='undefined')module.exports=IVCompositePhysical;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('physical-index-weights');if(!host)return;const status=$('physical-index-status'),year=$('physical-index-year'),base=$('physical-index-base'),draft=$('physical-index-draft'),weights=[20,20,20,20,20],inputs=[],labels=[],fmt=x=>x===null?'Нет расчёта':x.toLocaleString('ru-RU',{maximumFractionDigits:2});
 try{const data=await load('independent-physical.json');if(data.schema!=='iv-physical-v1')throw Error('Нет набора');
 const years=[...new Set(data.companies.flatMap(c=>c.rows.map(r=>r.year)))].sort((a,b)=>a-b);
 for(const y of years){year.add(new Option(String(y),String(y)));base.add(new Option(String(y),String(y)))}year.value=String(years.at(-1));base.value=years.includes(2023)?'2023':String(years[0]);
 function draw(){const r=IVCompositePhysical.calculate(data,Number(year.value),Number(base.value),weights,draft.checked),body=$('physical-index-rows');body.replaceChildren();
 $('physical-index-result').textContent=fmt(r.index);$('physical-index-coverage').textContent=fmt(100*r.coverage)+'%';$('physical-index-range').textContent=r.complete?fmt(r.min)+' — '+fmt(r.max):'Нет расчёта';
 status.textContent=r.blocked?'Расчёт заблокирован: '+r.pending+' компонентов требуют повторной сверки. Включите экспериментальный режим только для изучения формулы.':r.complete?(r.pending?'ЭКСПЕРИМЕНТ: непроверенные исходные значения. ':'')+'Полная числовая выборка для заданных весов. Диапазон не доверительный интервал.':'Расчёт заблокирован: нет хотя бы одного наблюдения с положительным весом или все веса равны нулю.';
 r.items.forEach((x,i)=>{labels[i].textContent=String(weights[i]);const tr=body.insertRow();for(const v of [x.title,fmt(100*x.weight)+'%',r.blocked?'—':fmt(x.index),r.blocked?'—':fmt(x.contribution)])tr.insertCell().textContent=v});
 $('physical-index-export').disabled=!r.complete;$('physical-index-export').onclick=()=>csv('corporate-composite-index.csv',[['Год','База','Компонент','Вес','Индекс','Вклад п.п.','Статус'],...r.items.map(x=>[year.value,base.value,x.title,x.weight,x.index,x.contribution,x.verified?'Сверен':'Предварительный']),['Итог',base.value,'Индекс',r.coverage,r.index,'',r.pending?'Экспериментальный; не для фактических выводов':'Сверенные исходные значения']]);
 }
 IVCompositePhysical.specs.forEach((s,i)=>{const l=node('label','');l.className='iv-slider';const o=node('output','20'),input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.value=20;input.step=1;input.id='physical-index-weight-'+i;l.htmlFor=input.id;o.setAttribute('for',input.id);l.append(node('span',s[2]),o,input);host.append(l);inputs.push(input);labels.push(o);input.oninput=()=>{weights[i]=Number(input.value);draw()}});
 year.disabled=base.disabled=$('physical-index-export').disabled=false;draft.disabled=false;draft.onchange=year.onchange=base.onchange=draw;$('physical-index-reset').onclick=()=>{inputs.forEach((x,i)=>{x.value=20;weights[i]=20});draw()};draw()
 }catch(e){status.textContent='Набор недоступен: '+e.message}
});
