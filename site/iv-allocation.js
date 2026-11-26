/* Compact UI for the existing 19-group ResourcePlan LP. No alternative solver. */
const IVAllocation=(()=>{
 const engine=typeof module!=='undefined'?require('./resource-plan.js'):ResourcePlan;
 function parameters(n,budget,importLimit,cap,maxDemand,priority,penalty){return {budget,importLimit,penalty,cap:Array(n).fill(cap),maxDemand:Array(n).fill(maxDemand),priority:[...priority]}}
 function summarize(m,p,objective){if(![0,1,2].includes(objective))throw Error('Неизвестная цель');const z=engine.model(m,p),r=z.results[objective];const rows=m.names.map((name,i)=>({name,weight:p.priority[i],demand:r.x[i],output:r.output[i],imports:r.x[i]*z.imp[i],limit:z.b[2+i],slack:r.capacitySlack[i]}));return {rows,direct:r.direct,gross:r.gross,imports:r.imports,unusedBudget:Math.max(0,p.budget-r.direct),unusedImport:Math.max(0,p.importLimit-r.imports),gap:r.gap,objective:r.objective,dualObjective:r.dualObjective,binding:rows.filter(x=>x.limit>1e-8&&Math.abs(x.slack)<=1e-6*Math.max(1,x.limit)).map(x=>x.name),alternatives:z.results.map(x=>({name:x.name,direct:x.direct,gross:x.gross,imports:x.imports,gap:x.gap}))}}
 return {parameters,summarize};
})();
if(typeof module!=='undefined')module.exports=IVAllocation;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('allocation-weights');if(!host)return;
 const status=$('allocation-status'),obj=$('allocation-objective'),fmt=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2}),fields=['budget','import','cap','max','penalty'],defaults=[1000,150,10,20,2];
 try{
 const m=await load('sectors.json');if(m.names.length!==19)throw Error('Неожиданный размер баланса');
 const weights=m.names.map(()=>1),inputs=[],labels=[];let baseline=null;
 function draw(){
  const v=fields.map(k=>Number($('allocation-'+k).value));fields.forEach((k,i)=>$('allocation-'+k+'-label').textContent=String(v[i]));const p=IVAllocation.parameters(m.names.length,...v.slice(0,4),weights,v[4]);let r;
  try{r=IVAllocation.summarize(m,p,Number(obj.value))}catch(e){status.textContent='Расчёт недоступен: '+e.message;$('allocation-result').replaceChildren();$('allocation-rows').replaceChildren();$('allocation-export').disabled=true;$('allocation-save').disabled=true;$('allocation-deep').removeAttribute('href');return}
  $('allocation-export').disabled=$('allocation-save').disabled=false;
  const cards=$('allocation-result');cards.replaceChildren();for(const [label,value] of [['Дополнительный конечный спрос',r.direct],['Дополнительный валовой выпуск',r.gross],['Промежуточный импорт',r.imports],['Остаток лимита спроса',r.unusedBudget]]){const a=node('article','');a.className='pulse-card';a.append(node('h3',label),node('strong',fmt(value)+' млрд ₽'));cards.append(a)}
  status.textContent='Решение проверено ядром: ограничения и прямая/двойственная цель. Невязка оптимальности: '+r.gap.toExponential(2)+'. '+(r.binding.length?'Исчерпаны положительные лимиты выпуска: '+r.binding.join('; ')+'.':'Положительные лимиты выпуска не исчерпаны.')+' Цены и технология 2021 года; валовой выпуск не ВВП.';
  $('allocation-compare').textContent=baseline?'Отличие от сохранённого варианта: спрос '+fmt(r.direct-baseline.direct)+'; выпуск '+fmt(r.gross-baseline.gross)+'; импорт '+fmt(r.imports-baseline.imports)+' млрд ₽.':'Сохраните вариант для сравнения.';
  const body=$('allocation-rows');body.replaceChildren();for(const x of r.rows){const tr=body.insertRow();for(const value of [x.name,x.weight,x.demand,x.output,x.imports,x.limit,x.slack])tr.insertCell().textContent=typeof value==='number'?fmt(value):value}
  const alt=$('allocation-alternatives');alt.replaceChildren();for(const x of r.alternatives){const tr=alt.insertRow();for(const value of [x.name,x.direct,x.gross,x.imports])tr.insertCell().textContent=typeof value==='number'?fmt(value):value}
  const u=new URL('scenario.html#resource-plan',location.href);for(const [k,value] of [['opt-budget',p.budget],['opt-import',p.importLimit],['opt-cap',v[2]],['opt-max',v[3]],['opt-penalty',p.penalty],['opt-priority',weights.join(',')],['opt-caps',p.cap.join(',')],['opt-maxima',p.maxDemand.join(',')]])u.searchParams.set(k,String(value));if(typeof pinned!=='undefined'&&pinned)u.searchParams.set('snapshot',pinned);$('allocation-deep').href=u.href;
  $('allocation-save').onclick=()=>{baseline=r;draw()};$('allocation-export').onclick=()=>csv('iv-allocation-2021.csv',[['База','2021'],['Версия',typeof version==='undefined'?'':version],['Цель',obj.options[obj.selectedIndex].text],['Лимит спроса',p.budget],['Лимит импорта',p.importLimit],['Условный предел выпуска, %',v[2]],['Предел спроса, %',v[3]],['Штраф импорта',p.penalty],['Прямая цель',r.objective],['Двойственная цель',r.dualObjective],['Группа','Вес','Спрос, млрд ₽','Выпуск, млрд ₽','Импорт, млрд ₽','Лимит выпуска','Остаток'],...r.rows.map(x=>[x.name,x.weight,x.demand,x.output,x.imports,x.limit,x.slack])]);
 }
 m.names.forEach((name,i)=>{const l=node('label','');l.className='iv-slider';const x=document.createElement('input'),o=node('output','1');x.type='range';x.min=0;x.max=10;x.value=1;x.id='allocation-weight-'+i;l.htmlFor=x.id;o.setAttribute('for',x.id);l.append(node('span',name),o,x);host.append(l);inputs.push(x);labels.push(o);x.oninput=()=>{weights[i]=Number(x.value);o.textContent=x.value;draw()}});
 fields.forEach(k=>{$('allocation-'+k).disabled=false;$('allocation-'+k).oninput=draw});obj.disabled=false;obj.onchange=draw;
 $('allocation-reset').disabled=false;$('allocation-reset').onclick=()=>{baseline=null;fields.forEach((k,i)=>$('allocation-'+k).value=defaults[i]);inputs.forEach((x,i)=>{x.value=1;weights[i]=1;labels[i].textContent='1'});obj.value='1';draw()};draw();
 }catch(e){status.textContent='Баланс недоступен: '+e.message}
});
