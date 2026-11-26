/* Structure of reported generation: retain missing categories and total residual. */
const IVEnergyStructure=(()=>{
 const types=['coal','gas','other_fossil','nuclear','hydro','wind','solar','bioenergy','other_renewables'];
 const fossil=['coal','gas','other_fossil'],renewable=['hydro','wind','solar','bioenergy','other_renewables'];
 const valid=v=>Number.isFinite(v)&&v>=0,sum=a=>a.reduce((s,v)=>s+v,0);
 function profile(values){
  const v=values||{},total=valid(v.total)&&v.total>0?v.total:null;
  const present=types.filter(k=>valid(v[k])),missing=types.filter(k=>!valid(v[k])),known=sum(present.map(k=>v[k]));
  const residual=total===null?null:total-known,tolerance=total===null?null:Math.max(.1,.001*total);
  const consistent=total!==null&&known<=total+tolerance&&present.every(k=>v[k]<=total+tolerance);
  const complete=consistent&&missing.length===0&&Math.abs(residual)<=tolerance&&known>0;
  const shares=Object.fromEntries(types.map(k=>[k,consistent&&valid(v[k])?100*v[k]/total:null]));
  const group=ks=>consistent&&ks.every(k=>valid(v[k]))?100*sum(ks.map(k=>v[k]))/total:null;
  return {total,known,missing,present,residual,tolerance,consistent,complete,shares,
   coverage:consistent?100*known/total:null,hhi:complete?sum(present.map(k=>Math.pow(100*v[k]/known,2))):null,
   fossil:group(fossil),renewables:group(renewable)};
 }
 function compare(rows,year,base,threshold=5){
  if(!Number.isInteger(year)||!Number.isInteger(base)||!Number.isFinite(threshold)||threshold<0)throw Error('Недопустимые параметры');
  const a=profile(rows.find(r=>r.year===year)?.values),b=profile(rows.find(r=>r.year===base)?.values);
  const items=types.map(k=>{const current=a.shares[k],previous=b.shares[k],delta=current===null||previous===null?null:current-previous;return {key:k,current,previous,delta,flag:delta!==null&&Math.abs(delta)>=threshold}});
  const common=items.filter(x=>x.delta!==null);
  return {a,b,items,common:common.length,flagged:common.filter(x=>x.flag).length,
   shift:a.complete&&b.complete?sum(common.map(x=>Math.abs(x.delta)))/2:null,
   totalChange:a.total!==null&&b.total!==null?100*(a.total/b.total-1):null};
 }
 return {types,profile,compare};
})();
if(typeof module!=='undefined')module.exports=IVEnergyStructure;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('energy-structure');if(!host)return;
 const status=$('energy-structure-status'),year=$('energy-structure-year'),base=$('energy-structure-base'),threshold=$('energy-structure-threshold'),exp=$('energy-structure-export'),fmt=(v,u='')=>v===null?'Нет расчёта':v.toLocaleString('ru-RU',{maximumFractionDigits:2})+u;
 try{
 const d=await load('independent-ember.json');if(d.schema!=='iv-ember-v1'||!Array.isArray(d.rows))throw Error('Неверная схема');
 if(!d.rows.length){status.textContent='Нет подтверждённого ряда в архиве. Структурные индикаторы не рассчитываются.';return}
 const ys=d.rows.map(r=>r.year).sort((a,b)=>a-b);for(const y of ys){year.add(new Option(String(y),String(y)));base.add(new Option(String(y),String(y)))}year.value=String(ys.at(-1));base.value=String(ys[Math.max(0,ys.length-6)]);
 function draw(){
  const y=Number(year.value),b=Number(base.value),t=Number(threshold.value),r=IVEnergyStructure.compare(d.rows,y,b,t),cards=$('energy-structure-cards'),body=$('energy-structure-rows'),chart=$('energy-structure-chart');
  $('energy-structure-threshold-label').textContent=t+' п.п.';cards.replaceChildren();body.replaceChildren();chart.replaceChildren();
  for(const [label,v,u] of [['Изменение общей выработки',r.totalChange,'%'],['Доля известных компонентов',r.a.coverage,'%'],['Остаток до общего объёма',r.a.residual,' ТВт·ч'],['Доля ископаемого топлива',r.a.fossil,'%'],['Доля возобновляемых источников',r.a.renewables,'%'],['HHI генерации',r.a.hhi,''],['Индекс структурного сдвига',r.shift,' п.п.']]){
   const a=node('article','');a.className='pulse-card';a.append(node('h3',label),node('strong',fmt(v,u)));cards.append(a)
  }
  const names=IVEmber.labels;
  status.textContent='Сопоставимых категорий: '+r.common+' из '+IVEnergyStructure.types.length+'; изменений от '+t+' п.п.: '+r.flagged+'. '+(r.a.consistent?'Сумма известных компонентов не превышает общую выработку сверх допуска.':'Баланс компонентов не подтверждён.')+' '+(r.a.missing.length?'Пропуски за '+y+': '+r.a.missing.map(k=>names[k]).join(', ')+'. ':'')+(r.a.complete&&r.b.complete?'Полная структура обоих периодов.':'HHI требует полной структуры выбранного года; общий структурный сдвиг — полной структуры обоих лет.')+' Источник: Ember, '+(d.success||'дата не указана')+'.';
  for(const x of [...r.items].sort((a,b)=>Math.abs(b.delta??-0)-Math.abs(a.delta??-0))){
   const tr=body.insertRow();for(const v of [names[x.key],fmt(x.previous,'%'),fmt(x.current,'%'),fmt(x.delta,' п.п.'),x.delta===null?'Нет пары':x.flag?'Достигнут порог':'Ниже порога'])tr.insertCell().textContent=v;
   if(x.current===null)continue;const row=node('div','');row.className='hh-bar-row';const meter=document.createElement('meter');meter.min=0;meter.max=100;meter.value=Math.min(100,x.current);meter.setAttribute('aria-label',names[x.key]+' '+fmt(x.current,'%'));row.append(node('span',names[x.key]),meter,node('span',fmt(x.current,'%')));chart.append(row)
  }
  exp.disabled=false;exp.onclick=()=>csv('ember-structure-'+b+'-'+y+'.csv',[['Базовый год',b],['Год',y],['Порог, п.п.',t],['Источник',d.source],['SHA256',d.sha256],['HHI',r.a.hhi],['Структурный сдвиг',r.shift],['Остаток, ТВт·ч',r.a.residual],['Категория','Доля базы, %','Доля текущая, %','Разница, п.п.','Сигнал'],...r.items.map(x=>[names[x.key],x.previous,x.current,x.delta,x.delta===null?'нет пары':x.flag?'да':'нет'])]);
 }
 year.disabled=base.disabled=threshold.disabled=false;year.onchange=base.onchange=threshold.oninput=draw;draw()
 }catch(e){status.textContent='Анализ недоступен: '+e.message}
});
