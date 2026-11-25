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
  const units=b.map(()=> 'млрд руб. (2021)'),sources=b.map(()=> 'Межотраслевой баланс 2021; пользовательский лимит');
  const resources=[...(p.resources??[])];
  if(!Array.isArray(p.resources??[])||resources.length>6)throw Error('Не более шести ресурсных ограничений');
  const labor=p.labor??null;
  if(labor){
   if(!finite(labor.limit)||labor.limit<0||labor.limit>1e9||!finite(labor.productivity)||labor.productivity< -50||labor.productivity>100||!Array.isArray(labor.records)||labor.records.length!==n||labor.records.some((r,i)=>r.id!==i+1||r.name!==m.names[i]||r.year!==2021||r.output!==m.output[i]||!finite(r.fte)||r.fte<0||r.fte>1e9||typeof r.source!=='string'||!r.source.trim()||r.source.length>1000||/^[=+\-@]/.test(r.source.trim())||!finite(r.intensity)||r.intensity<0||Math.abs(r.intensity-r.fte/(r.output/1000))>1e-9*Math.max(1,r.intensity)))throw Error('Некорректная калибровка труда');
   resources.push({name:'Труд (калиброванные FTE)',unit:'человеко-лет FTE',source:'CSV пользователя; изменение производительности '+labor.productivity+'%',limit:labor.limit,intensity:labor.records.map(r=>r.intensity/(1+labor.productivity/100)),labor:true});
  }
  const seen=new Set(),resourceRows=[];
  for(const r of resources){
   if(typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.unit!=='string'||!r.unit.trim()||r.unit.length>40||typeof r.source!=='string'||!r.source.trim()||r.source.length>300||!finite(r.limit)||r.limit<0||r.limit>1e12||!Array.isArray(r.intensity)||r.intensity.length!==n||r.intensity.some(v=>!finite(v)||v<0||v>1e9)||!r.intensity.some(v=>v>0))throw Error('Заполните паспорт и все коэффициенты ресурса; хотя бы один должен быть положительным');
   const key=r.name.trim().toLocaleLowerCase('ru');if(seen.has(key))throw Error('Повторное имя ресурса');seen.add(key);
   const row=m.names.map((_,j)=>sum(coeff.map((a,i)=>a[j]*r.intensity[i])));
   if(row.some(v=>!finite(v)||v<0)||!row.some(v=>v>0))throw Error('Некорректный полный коэффициент ресурса');
   resourceRows.push({...r,name:r.name.trim(),unit:r.unit.trim(),source:r.source.trim(),row,index:A.length});
   A.push(row);b.push(r.limit);labels.push('Ресурс: '+r.name.trim());units.push(r.unit.trim());sources.push(r.source.trim());
  }
  const minimumUse=A.map(row=>dot(row,lower));
  const checks=b.map((limit,i)=>({label:labels[i],unit:units[i],source:sources[i],limit,required:minimumUse[i],gap:Math.max(0,minimumUse[i]-limit),feasible:minimumUse[i]<=limit+tol(limit)}));
  const alpha=Math.min(1,...checks.map(r=>r.required>0?r.limit/r.required:1));
  const feasible=checks.every(r=>r.feasible);
  const chosen=feasible?lower:lower.map(v=>v*alpha);
  let optimum=null;
  if(feasible){
   // Shift y=lower+z; origin in z is feasible up to numerical tolerance.
   const residual=b.map((v,i)=>Math.max(0,v-minimumUse[i]));
   // Normalize each resource row to prevent the choice of physical unit from dominating the simplex pivot scale.
   const scale=A.map((row,i)=>i<2+2*n?1:Math.max(...row));
   const normalized=A.map((row,i)=>row.map(v=>v/scale[i])),rhs=residual.map((v,i)=>v/scale[i]);
   if(rhs.some(v=>!finite(v)))throw Error('Неподдерживаемый масштаб единиц');
   const r=solve(normalized,rhs,p.priority),x=lower.map((v,i)=>v+r.x[i]),usage=A.map(row=>dot(row,x));
   if(x.some((v,i)=>!finite(v)||v<lower[i]-tol(lower[i]))||usage.some((v,i)=>!finite(v)||v>b[i]+1e-6*Math.max(1,b[i])))throw Error('Проверка допустимости оптимума не пройдена');
   optimum={x,usage,objective:dot(p.priority,x),gap:r.gap,dualObjective:dot(p.priority,lower)+r.dualObjective};
  }
  return {feasible,alpha,checks,lower,upper,chosen,alternative:chosen,alternativeUse:A.map(row=>dot(row,chosen)),optimum,coeff,imp,resourceRows};
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
  const resourceFields=[];
  let laborRecords=null,laborRead=0;
  const laborFile=$('pf-labor-file'),laborEnabled=$('pf-labor-enabled'),laborLimit=$('pf-labor-limit'),laborProd=$('pf-labor-productivity'),laborStatus=$('pf-labor-status');
  laborFile.onchange=async()=>{
   const token=++laborRead;laborRecords=null;laborStatus.textContent='Проверка файла…';draw();
   const file=laborFile.files?.[0];if(!file){laborStatus.textContent='Файл не выбран.';draw();return}
   try{if(file.size>200000)throw Error('Файл слишком большой');const rows=LaborCalibration.parse(await file.text(),m);if(!rows.some(r=>r.fte>0))throw Error('Все FTE равны нулю');if(token!==laborRead)return;laborRecords=rows;laborStatus.textContent='Принято '+rows.length+' групп; пользовательские данные, не независимая статистическая проверка.';}
   catch(e){if(token!==laborRead)return;laborStatus.textContent='Файл отклонён: '+String(e.message||e)}
   draw();
  };
  [laborEnabled,laborLimit,laborProd].forEach(x=>x.oninput=draw);
  function resourceCard(){
   if(resourceFields.length>=6)return;
   const card=node('article',''),controls=node('div','');controls.className='project-controls';card.className='pf-resource-card';
   const textField=(label,max)=>{const v=node('input','');v.type='text';v.maxLength=max;v.setAttribute('aria-label',label);return v};
   const name=textField('Название ресурса',100),unit=textField('Единица ресурса',40),source=textField('Источник или сценарное допущение',300),limit=field('',1e12,'Доступный дополнительный ресурс');limit.step='any';
   name.placeholder='Например: электроэнергия';unit.placeholder='Например: МВт·ч';source.placeholder='Источник или обоснование';
   for(const [label,input] of [['Ресурс',name],['Единица',unit],['Дополнительный лимит',limit],['Источник / допущение',source]]){const l=node('label',label);l.append(input);controls.append(l)}
   const host=node('div','');host.className='table-scroll';host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label','Коэффициенты ресурса');
   const intensity=m.names.map(v=>{const x=field('',1e9,'Ресурс на млрд руб. выпуска: '+v);x.step='any';return x});
   table(host,['Группа выпуска','Единиц ресурса на млрд руб. дополнительного выпуска'],m.names.map((v,i)=>[v,intensity[i]]));
   const remove=node('button','Удалить ресурс');remove.type='button';const item={card,name,unit,source,limit,intensity};resourceFields.push(item);
   remove.onclick=()=>{resourceFields.splice(resourceFields.indexOf(item),1);card.remove();$('pf-add-resource').disabled=false;draw()};
   [name,unit,source,limit,...intensity].forEach(x=>x.oninput=draw);card.append(controls,host,remove);$('pf-resources').append(card);$('pf-add-resource').disabled=resourceFields.length>=6;draw();
  }
  $('pf-add-resource').onclick=resourceCard;
  function draw(){
   exp.disabled=true;$('pf-checks').replaceChildren();$('pf-result').replaceChildren();$('pf-labor-summary').replaceChildren();
   if(all.some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber))){status.textContent='Проверьте числовые параметры.';return}
   const vals=a=>a.map(x=>x.valueAsNumber),p={budget:budget.valueAsNumber,importLimit:importLimit.valueAsNumber,minimum:vals(minimum),maximum:vals(maximum),capacity:vals(capacity),priority:vals(priority)};
   if(resourceFields.some(r=>[r.name,r.unit,r.source].some(x=>!x.value.trim())||[r.limit,...r.intensity].some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber)))){status.textContent='Заполните все поля ресурсов, включая явные нули. Незаполненный коэффициент не равен нулю.';return}
   p.resources=resourceFields.map(r=>({name:r.name.value,unit:r.unit.value,source:r.source.value,limit:r.limit.valueAsNumber,intensity:vals(r.intensity)}));
   $('pf-labor-summary').replaceChildren();
   if(laborEnabled.checked){
    if(!laborRecords||[laborLimit,laborProd].some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber))){status.textContent='Для трудового ограничения нужен проверенный CSV и допустимые лимит и производительность.';return}
    p.labor={records:laborRecords,limit:laborLimit.valueAsNumber,productivity:laborProd.valueAsNumber};
   }
   try{
    const r=PlanFeasibility.calculate(m,p,ResourcePlan.solve),x=r.optimum?.x||r.alternative,used=r.optimum?.usage||r.alternativeUse;
    status.textContent=r.feasible?'Обязательный минимум допустим. Найден максимум взвешенного дополнительного спроса; невязка цели '+r.optimum.gap.toExponential(2)+'.':'Обязательный минимум недопустим. Нарушено ограничений: '+r.checks.filter(c=>!c.feasible).length+'. Максимальный единый масштаб минимальных целей: '+fmt(r.alpha*100)+'%. Альтернатива не удовлетворяет исходному минимуму.';
    table($('pf-checks'),['Ограничение','Единица','Лимит','Требует минимум','Превышение','Потребность альтернативы / оптимума','Минимум допустим'],r.checks.map((c,i)=>[c.label,c.unit,fmt(c.limit),fmt(c.required),fmt(c.gap),fmt(used[i]),c.feasible?'Да':'Нет']));
    table($('pf-result'),['Группа','Обязательный спрос, млрд ₽','Результат, млрд ₽','Результат, % базового спроса','Доп. выпуск, млрд ₽'],m.names.map((v,i)=>[v,fmt(r.lower[i]),fmt(x[i]),fmt(100000*x[i]/m.demand[i]),fmt(r.coeff[i].reduce((s,c,j)=>s+c*x[j],0))]));
    if(p.labor){const a=r.resourceRows.find(a=>a.labor),output=r.coeff.map(row=>row.reduce((s,c,j)=>s+c*x[j],0)),laborUse=a.intensity.map((v,i)=>v*output[i]);table($('pf-labor-summary'),['Группа выпуска','Базовые FTE','Прямой коэффициент базы','После изменения производительности','Дополнительные FTE','Источник'],p.labor.records.map((v,i)=>[v.name,fmt(v.fte),fmt(v.intensity),fmt(a.intensity[i]),fmt(laborUse[i]),v.source]));}
    exp.disabled=false;exp.onclick=()=>csv('plan-feasibility-2021.csv',[['Год','Тип строки','Позиция','Минимум / требование','Максимум / лимит','Результат / использование','Превышение','Предел выпуска, %','Вес','Допустимость исходного минимума','Масштаб минимума','Цель оптимума','Двойственная цель','Невязка','SHA-256','Манифест','Единица','Источник / допущение','Прямой коэффициент на млрд руб. выпуска','Полный коэффициент на млрд руб. спроса','Базовые FTE','Базовый трудовой коэффициент','Изменение производительности, %'],...r.checks.map((c,i)=>[2021,'ограничение',c.label,c.required,c.limit,used[i],c.gap,'','',r.feasible?'да':'нет',r.alpha,r.optimum?.objective,r.optimum?.dualObjective,r.optimum?.gap,entry.sha256,manifest.data_fingerprint,c.unit,c.source,'','','','','']),...m.names.map((name,i)=>[2021,'группа',name,r.lower[i],r.upper[i],x[i],'',p.capacity[i],p.priority[i],r.feasible?'да':'нет',r.alpha,r.optimum?.objective,r.optimum?.dualObjective,r.optimum?.gap,entry.sha256,manifest.data_fingerprint,'млрд руб. (2021)','','','','','','']),...r.resourceRows.flatMap(a=>m.names.map((name,i)=>[2021,'коэффициент ресурса',a.name+' / '+name,'','','','','','','','','','','',entry.sha256,manifest.data_fingerprint,a.unit,a.labor?p.labor.records[i].source:a.source,a.intensity[i],a.row[i],a.labor?p.labor.records[i].fte:'',a.labor?p.labor.records[i].intensity:'',a.labor?p.labor.productivity:'']))]);
   }catch(e){console.error(e);status.textContent='Расчёт не подтверждён: '+String(e.message||e)}
  }
  all.forEach(x=>x.oninput=draw);$('pf-run').onclick=draw;draw();
 }catch(e){console.error(e);status.textContent='Проверенный баланс недоступен.'}
});
