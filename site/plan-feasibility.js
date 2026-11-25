/* Nonnegative additional final demand, fixed composition within each 2021 product group.
   A mandatory floor is feasible iff its own nonnegative resource requirements fit all limits. */
const PlanFeasibility=(()=>{
 const finite=Number.isFinite,sum=a=>a.reduce((s,x)=>s+x,0),dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
 const tol=b=>1e-8*Math.max(1,b);
 function calculate(m,p,solve){
  const n=m.names?.length;
  if(!Number.isInteger(n)||n<1||n>100||new Set(m.names).size!==n||![m.demand,m.output,m.imports].every(v=>Array.isArray(v)&&v.length===n&&v.every(x=>finite(x)&&x>=0))||m.demand.some(x=>x<=0)||m.output.some(x=>x<=0)||!Array.isArray(m.effects)||m.effects.length!==n||m.effects.some(r=>!Array.isArray(r)||r.length!==n||r.some(x=>!finite(x)||x<0)))throw Error('Некорректная база');
  if(![p.budget,p.importLimit].every(v=>finite(v)&&v>=0&&v<=100000)||![p.minimum,p.maximum,p.capacity,p.priority].every(v=>Array.isArray(v)&&v.length===n)||[p.minimum,p.maximum].some(v=>v.some(x=>!finite(x)||x<0||x>20))||p.capacity.some(x=>!finite(x)||x<0||x>100)||p.priority.some(x=>!finite(x)||x<0||x>10))throw Error('Некорректные ограничения');
  const coeff=m.effects.map(row=>row.map((v,j)=>v/m.demand[j])),imp=m.imports.map((v,j)=>v/m.demand[j]);
  const lower=p.minimum.map((v,i)=>m.demand[i]*v/100000),upper=p.maximum.map((v,i)=>m.demand[i]*v/100000);
  const A=[Array(n).fill(1),imp,...coeff,...Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0))];
  const b=[p.budget,p.importLimit,...m.output.map((v,i)=>v*p.capacity[i]/100000),...upper];
  const labels=['Лимит дополнительного конечного спроса','Лимит импортных промежуточных затрат',...m.names.map(v=>'Выпуск: '+v),...m.names.map(v=>'Верхний предел спроса: '+v)];
  const minimumUse=A.map(row=>dot(row,lower));
  const checks=b.map((limit,i)=>({label:labels[i],limit,required:minimumUse[i],gap:Math.max(0,minimumUse[i]-limit),feasible:minimumUse[i]<=limit+tol(limit)}));
  const alpha=Math.min(1,...checks.map(r=>r.required>0?r.limit/r.required:1));
  const feasible=checks.every(r=>r.feasible);
  const chosen=feasible?lower:lower.map(v=>v*alpha);
  let optimum=null;
  if(feasible){
   // Shift y=lower+z; origin in z is feasible up to numerical tolerance.
   const residual=b.map((v,i)=>Math.max(0,v-minimumUse[i]));
   const r=solve(A,residual,p.priority),x=lower.map((v,i)=>v+r.x[i]),usage=A.map(row=>dot(row,x));
   if(x.some((v,i)=>!finite(v)||v<lower[i]-tol(lower[i]))||usage.some((v,i)=>!finite(v)||v>b[i]+1e-6*Math.max(1,b[i])))throw Error('Проверка допустимости оптимума не пройдена');
   optimum={x,usage,objective:dot(p.priority,x),gap:r.gap,dualObjective:dot(p.priority,lower)+r.dualObjective};
  }
  return {feasible,alpha,checks,lower,upper,chosen,alternative:chosen,alternativeUse:A.map(row=>dot(row,chosen)),optimum,coeff,imp};
 }
 return {calculate};
})();
if(typeof module!=='undefined')module.exports=PlanFeasibility;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('pf-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const row of rows){const tr=b.insertRow();for(const v of row){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'sectors.json',root),m=entry.data;
  const field=(v,max,label)=>{const x=node('input','');x.type='number';x.min=0;x.max=max;x.step='0.1';x.value=v;x.setAttribute('aria-label',label);return x};
  const minimum=m.names.map(v=>field(1,20,'Минимум: '+v)),maximum=m.names.map(v=>field(10,20,'Максимум: '+v)),capacity=m.names.map(v=>field(10,100,'Мощность: '+v)),priority=m.names.map(v=>field(1,10,'Вес: '+v));
  table($('pf-input'),['Группа','Минимум спроса, %','Максимум спроса, %','Предел выпуска, %','Вес цели'],m.names.map((v,i)=>[v,minimum[i],maximum[i],capacity[i],priority[i]]));
  const exp=$('pf-export'),budget=$('pf-budget'),importLimit=$('pf-import'),all=[budget,importLimit,...minimum,...maximum,...capacity,...priority];
  function draw(){
   exp.disabled=true;$('pf-checks').replaceChildren();$('pf-result').replaceChildren();
   if(all.some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber))){status.textContent='Проверьте числовые параметры.';return}
   const vals=a=>a.map(x=>x.valueAsNumber),p={budget:budget.valueAsNumber,importLimit:importLimit.valueAsNumber,minimum:vals(minimum),maximum:vals(maximum),capacity:vals(capacity),priority:vals(priority)};
   try{
    const r=PlanFeasibility.calculate(m,p,ResourcePlan.solve),x=r.optimum?.x||r.alternative,used=r.optimum?.usage||r.alternativeUse;
    status.textContent=r.feasible?'Обязательный минимум допустим. Найден максимум взвешенного дополнительного спроса; невязка цели '+r.optimum.gap.toExponential(2)+'.':'Обязательный минимум недопустим. Нарушено ограничений: '+r.checks.filter(c=>!c.feasible).length+'. Максимальный единый масштаб минимальных целей: '+fmt(r.alpha*100)+'%. Альтернатива не удовлетворяет исходному минимуму.';
    table($('pf-checks'),['Ограничение','Лимит, млрд ₽','Требует минимум','Превышение','Потребность альтернативы / оптимума','Минимум допустим'],r.checks.map((c,i)=>[c.label,fmt(c.limit),fmt(c.required),fmt(c.gap),fmt(used[i]),c.feasible?'Да':'Нет']));
    table($('pf-result'),['Группа','Обязательный спрос, млрд ₽','Результат, млрд ₽','Результат, % базового спроса','Доп. выпуск, млрд ₽'],m.names.map((v,i)=>[v,fmt(r.lower[i]),fmt(x[i]),fmt(100000*x[i]/m.demand[i]),fmt(r.coeff[i].reduce((s,c,j)=>s+c*x[j],0))]));
    exp.disabled=false;exp.onclick=()=>csv('plan-feasibility-2021.csv',[['Год','Тип строки','Позиция','Минимум / требование','Максимум / лимит','Результат / использование','Превышение','Предел выпуска, %','Вес','Допустимость исходного минимума','Масштаб минимума','Цель оптимума','Двойственная цель','Невязка','SHA-256','Манифест'],...r.checks.map((c,i)=>[2021,'ограничение',c.label,c.required,c.limit,used[i],c.gap,'','',r.feasible?'да':'нет',r.alpha,r.optimum?.objective,r.optimum?.dualObjective,r.optimum?.gap,entry.sha256,manifest.data_fingerprint]),...m.names.map((name,i)=>[2021,'группа',name,r.lower[i],r.upper[i],x[i],'',p.capacity[i],p.priority[i],r.feasible?'да':'нет',r.alpha,r.optimum?.objective,r.optimum?.dualObjective,r.optimum?.gap,entry.sha256,manifest.data_fingerprint])]);
   }catch(e){console.error(e);status.textContent='Расчёт не подтверждён: '+String(e.message||e)}
  }
  all.forEach(x=>x.oninput=draw);$('pf-run').onclick=draw;draw();
 }catch(e){console.error(e);status.textContent='Проверенный баланс недоступен.'}
});
