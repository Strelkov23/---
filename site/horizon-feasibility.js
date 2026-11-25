/* Maximum common fraction of mandatory multi-period demand targets.
   Investment is commissioned after an explicit lag; only additional capacity is depreciated. */
const HorizonFeasibility=(()=>{
 const finite=Number.isFinite,sum=a=>a.reduce((s,v)=>s+v,0),dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
 function calculate(m,p,solve){
  const n=m.names?.length,T=p.years,L=p.lag,k=p.capitalRatio,d=1-p.depreciation/100;
  const range=(v,lo,hi)=>finite(v)&&v>=lo&&v<=hi,vec=(a,N,lo,hi)=>Array.isArray(a)&&a.length===N&&a.every(v=>range(v,lo,hi));
  if(!Number.isInteger(n)||n<1||n>100||new Set(m.names).size!==n||!vec(m.output,n,Number.MIN_VALUE,1e12)||!vec(m.demand,n,Number.MIN_VALUE,1e12)||!vec(m.imports,n,0,1e12)||!Array.isArray(m.effects)||m.effects.length!==n||m.effects.some(r=>!vec(r,n,0,1e12)))throw Error('Некорректная база');
  if(!Number.isInteger(T)||T<1||T>15||!Number.isInteger(L)||L<1||L>3||!range(k,.1,20)||!range(p.depreciation,0,100)||!range(p.spare,0,100)||!vec(p.growth,n,0,20)||!vec(p.floors,T,0,100)||!vec(p.budgets,T,0,100000)||!vec(p.importLimits,T,0,100000))throw Error('Некорректные параметры горизонта');
  // Resource assumptions are fixed direct intensities per billion RUB of additional output.
  // A labor row can additionally use an explicitly stated annual productivity change.
  const resources=p.resources??[];
  if(!Array.isArray(resources)||resources.length>7||new Set(resources.map(r=>r.name)).size!==resources.length||resources.some(r=>typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.unit!=='string'||!r.unit.trim()||r.unit.length>40||typeof r.source!=='string'||!r.source.trim()||r.source.length>300||!vec(r.intensity,n,0,1e9)||!r.intensity.some(v=>v>0)||!vec(r.limits,T,0,1e12)||!range(r.annualProductivity??0,-10,20)))throw Error('Некорректные ресурсные ограничения');
  const spare=m.output.map(v=>v/1000*p.spare/100),S=Math.max(0,T-L),size=1+S*n,idx=(s,i)=>1+s*n+i;
  const periods=Array.from({length:T},(_,t)=>{
   const shock=p.growth.map(g=>((1+g/100)**(t+1)-1)*p.floors[t]/100);
   const required=m.effects.map(row=>dot(row,shock)/1000);
   return {demand:sum(m.demand.map((v,i)=>v*shock[i]/1000)),required,imports:dot(m.imports,shock)/1000,resources:resources.map(r=>dot(r.intensity,required)/(1+(r.annualProductivity??0)/100)**(t+1))};
  });
  const A=[],b=[],labels=[],add=(row,rhs,label)=>{const scale=Math.max(1,Math.abs(rhs),...row.map(Math.abs));A.push(row.map(v=>v/scale));b.push(rhs/scale);labels.push(label)},row=()=>Array(size).fill(0);
  const bound=row();bound[0]=1;add(bound,1,'Доля цели');
  for(let t=0;t<T;t++){
   const q=periods[t],r=row();r[0]=q.imports;add(r,p.importLimits[t],'Импорт: '+(t+1));
   resources.forEach((r,i)=>{const a=row();a[0]=q.resources[i];add(a,r.limits[t],'Ресурс: '+(t+1)+' / '+r.name)});
   for(let i=0;i<n;i++){
    const a=row();a[0]=q.required[i];
    for(let s=0;s<S&&s+L<=t;s++)a[idx(s,i)]=-p.budgets[s]/k*d**(t-s-L);
    add(a,spare[i],'Мощность: '+(t+1)+' / '+m.names[i]);
   }
   if(t<S){const a=row();for(let i=0;i<n;i++)a[idx(t,i)]=1;add(a,p.budgets[t]>0?1:0,'Инвестиции: '+(t+1));}
  }
  const c=row();c[0]=1;const lp=solve(A,b,c,{signed:true,fast:true});
  const beta=Math.max(0,Math.min(1,lp.x[0])),schedule=Array.from({length:T},(_,s)=>m.names.map((_,i)=>s<S?lp.x[idx(s,i)]*p.budgets[s]:0));
  // Reconstruct without using the simplex tableau; check in original units.
  const near=(v,limit)=>v<=limit+1e-6*Math.max(1,limit);
  const rows=periods.map((q,t)=>{
   const groups=m.names.map((name,i)=>{
    const commissioned=t>=L?schedule[t-L][i]/k:0;
    const extra=sum(schedule.slice(0,Math.max(0,t-L+1)).map((r,s)=>r[i]/k*d**(t-s-L)));
    return {name,required:q.required[i],realized:beta*q.required[i],available:spare[i]+extra,commissioned,investment:schedule[t][i]};
   });
   const investment=sum(schedule[t]),imports=beta*q.imports;
   const resourceUse=resources.map((r,i)=>({name:r.name,unit:r.unit,source:r.source,required:q.resources[i],used:beta*q.resources[i],limit:r.limits[t]}));
   if(resourceUse.some(r=>!near(r.used,r.limit)))throw Error('Нарушено натуральное или трудовое ограничение');
   if(!near(investment,p.budgets[t])||!near(imports,p.importLimits[t])||groups.some(g=>!near(g.realized,g.available)))throw Error('Восстановленный календарь нарушает ограничения');
   return {period:t+1,target:q.demand,actual:beta*q.demand,imports,importLimit:p.importLimits[t],investment,budget:p.budgets[t],commissioned:sum(groups.map(g=>g.commissioned)),groups,resources:resourceUse};
  });
  if(!finite(beta)||Math.abs(beta-lp.objective)>1e-6||lp.dualObjective<beta-1e-6||lp.gap>1e-6)throw Error('Оптимальность не подтверждена');
  const full=beta>=1-1e-7;
  return {beta,full,rows,upper:lp.dualObjective,gap:lp.gap,variables:size,constraints:b.length,iterations:lp.iterations,labels};
 }
 return {calculate};
})();
if(typeof module!=='undefined')module.exports=HorizonFeasibility;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('hf-status');if(!status)return;
 const f=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'sectors.json',root),m=entry.data;
  const input=(v,min,max,label)=>{const x=node('input','');x.type='number';x.min=min;x.max=max;x.step='any';x.value=v;x.setAttribute('aria-label',label);return x};
  const growth=m.names.map(n=>input(3,0,20,'Рост спроса: '+n));
  table($('hf-growth'),['Группа','Рост конечного спроса, % за период'],m.names.map((n,i)=>[n,growth[i]]));
  const keys=['years','lag','spare','capital','depreciation'],fields=keys.map(k=>$('hf-'+k)),exp=$('hf-export'),periodPick=$('hf-period'),run=$('hf-run');let periodFields=[],answer=null,params=null,imported=[],readSerial=0;
  const valid=x=>x.value&&x.validity.valid&&Number.isFinite(x.valueAsNumber);
  function clear(){answer=null;params=null;exp.disabled=true;periodPick.disabled=true;$('hf-results').replaceChildren();$('hf-detail').replaceChildren();$('hf-resource-results').replaceChildren();$('hf-resource-export').disabled=true;status.textContent='Параметры изменены. Выполните расчёт.';}
  function periods(){
   clear();if(!valid(fields[0]))return;
   const n=fields[0].valueAsNumber,prior=periodFields;periodFields=Array.from({length:n},(_,i)=>({floor:input(prior[i]?.floor.value??100,0,100,'Обязательная доля '+(i+1)),budget:input(prior[i]?.budget.value??1000,0,100000,'Инвестиции '+(i+1)),imports:input(prior[i]?.imports.value??500,0,100000,'Импорт '+(i+1))}));
   table($('hf-calendar'),['Период','Обязательная доля траектории, %','Лимит инвестиций, млрд ₽','Лимит импорта, млрд ₽'],periodFields.map((r,i)=>[i+1,r.floor,r.budget,r.imports]));periodFields.flatMap(r=>Object.values(r)).forEach(x=>x.oninput=clear);resourceInputs();
  }
  let resourceFields=[];
  function resourceInputs(){
   resourceFields=imported.map(r=>({r,limits:periodFields.map((_,i)=>input(r.limit,0,1e12,'Лимит '+r.name+' / '+(i+1))),prod:input(0,-10,20,'Годовое изменение производительности: '+r.name)}));
   const host=$('hf-resource-input');host.replaceChildren();
   for(const v of resourceFields){const article=node('article','');article.append(node('h3',v.r.name+' · '+v.r.unit),node('p',v.r.source));const box=node('div','');box.className='table-scroll';table(box,['Период','Дополнительный лимит'],v.limits.map((x,i)=>[i+1,x]));article.append(box);if(v.r.labor){const label=node('label','Годовое изменение производительности после импортированного исходного коэффициента, %');label.append(v.prod);article.append(label);}host.append(article);[...v.limits,v.prod].forEach(x=>x.oninput=clear);}
  }
  const file=$('hf-resource-file'),fileStatus=$('hf-resource-status');
  file.onchange=async()=>{const serial=++readSerial;imported=[];resourceInputs();clear();const selected=file.files?.[0];if(!selected){fileStatus.textContent='Ресурсы не подключены.';return}
   try{if(selected.size>200000)throw Error('Файл слишком большой');const d=JSON.parse(await selected.text());if(serial!==readSerial)return;
    if(d.schema!=='economic-resource-assumptions-v1'||d.year!==2021||d.balanceSha256!==entry.sha256||JSON.stringify(d.groups)!==JSON.stringify(m.names)||!Array.isArray(d.resources)||!d.resources.length||d.resources.length>7||new Set(d.resources.map(r=>r.name)).size!==d.resources.length||d.resources.some(r=>typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.unit!=='string'||!r.unit.trim()||r.unit.length>40||typeof r.source!=='string'||!r.source.trim()||r.source.length>300||!Number.isFinite(r.limit)||r.limit<0||r.limit>1e12||!Array.isArray(r.intensity)||r.intensity.length!==m.names.length||r.intensity.some(x=>!Number.isFinite(x)||x<0||x>1e9)||!r.intensity.some(x=>x>0)))throw Error('Несовместимый паспорт ресурсов или версия баланса');
    imported=d.resources;fileStatus.textContent='Подключено ограничений: '+imported.length+'. Коэффициенты — пользовательские допущения.';resourceInputs();clear();
   }catch(e){if(serial===readSerial){fileStatus.textContent='Файл отклонён: '+String(e.message||e);clear()}}
  };
  $('hf-resource-remove').onclick=()=>{++readSerial;file.value='';imported=[];fileStatus.textContent='Ресурсы не подключены.';resourceInputs();clear()};
  function detail(){if(!answer)return;const r=answer.rows[Number(periodPick.value)];if(!r)return;table($('hf-detail'),['Группа','Целевой выпуск','Реализуемый выпуск','Доступный дополнительный выпуск','Введённая мощность','Инвестиции'],r.groups.map(g=>[g.name,f(g.required),f(g.realized),f(g.available),f(g.commissioned),f(g.investment)]));}
  run.onclick=()=>{
   clear();if(![...fields,...growth,...periodFields.flatMap(r=>Object.values(r))].every(valid)){status.textContent='Проверьте параметры.';return}
   const [years,lag,spare,capitalRatio,depreciation]=fields.map(x=>x.valueAsNumber),p={years,lag,spare,capitalRatio,depreciation,growth:growth.map(x=>x.valueAsNumber),floors:periodFields.map(r=>r.floor.valueAsNumber),budgets:periodFields.map(r=>r.budget.valueAsNumber),importLimits:periodFields.map(r=>r.imports.valueAsNumber)};
   if(file.files?.length&&!imported.length){status.textContent='Паспорт ресурсов не принят; удалите его или загрузите корректный.';return}
   if(resourceFields.some(v=>[...v.limits,v.prod].some(x=>!valid(x)))){status.textContent='Заполните все годовые лимиты ресурсов.';return}
   p.resources=resourceFields.map(v=>({...v.r,limits:v.limits.map(x=>x.valueAsNumber),annualProductivity:v.r.labor?v.prod.valueAsNumber:0}));
   try{const r=HorizonFeasibility.calculate(m,p,ResourcePlan.solve);answer=r;params=p;
    status.textContent=(r.full?'Все обязательные цели допустимы в модели.':'Исходные обязательные цели недопустимы. Максимальная общая доля: '+f(r.beta*100)+'%.')+' Двойственная граница: '+f(r.upper*100)+'%; невязка '+r.gap.toExponential(2)+'.';
    table($('hf-results'),['Период','Целевой спрос','Реализуемый спрос','Импорт','Лимит импорта','Инвестиции','Лимит инвестиций','Введённая мощность'],r.rows.map(v=>[v.period,f(v.target),f(v.actual),f(v.imports),f(v.importLimit),f(v.investment),f(v.budget),f(v.commissioned)]));
    periodPick.replaceChildren(...r.rows.map((v,i)=>new Option(String(v.period),String(i))));periodPick.disabled=false;detail();exp.disabled=false;
    if(p.resources.length){table($('hf-resource-results'),['Период','Ресурс','Единица','Потребность цели','Использовано','Лимит'],r.rows.flatMap(v=>v.resources.map(a=>[v.period,a.name,a.unit,f(a.required),f(a.used),f(a.limit)])));const e=$('hf-resource-export');e.disabled=false;e.onclick=()=>csv('horizon-resources-2021.csv',[['Период','Ресурс','Единица','Источник','Целевая потребность','Использовано','Лимит','Годовая производительность, %','Группа','Прямой коэффициент','SHA-256','Манифест'],...r.rows.flatMap((v,t)=>v.resources.map((a,i)=>[v.period,a.name,a.unit,a.source,a.required,a.used,a.limit,p.resources[i].annualProductivity,'','',entry.sha256,manifest.data_fingerprint])),...p.resources.flatMap(a=>m.names.map((name,i)=>['',a.name,a.unit,a.source,'','','',a.annualProductivity,name,a.intensity[i],entry.sha256,manifest.data_fingerprint]))]);}
    exp.onclick=()=>csv('horizon-feasibility-2021.csv',[['База','Период','Группа','Рост спроса, %','Обязательная доля, %','Лимит инвестиций','Лимит импорта','Лаг','Капиталоёмкость','Выбытие, %','Резерв, %','Доля выполнения','Двойственная граница','Целевой выпуск','Реализуемый выпуск','Доступный выпуск','Ввод мощности','Инвестиции','SHA-256','Манифест'],...r.rows.flatMap((v,t)=>v.groups.map((g,i)=>[2021,v.period,g.name,p.growth[i],p.floors[t],v.budget,v.importLimit,p.lag,p.capitalRatio,p.depreciation,p.spare,r.beta,r.upper,g.required,g.realized,g.available,g.commissioned,g.investment,entry.sha256,manifest.data_fingerprint]))]);
   }catch(e){console.error(e);status.textContent='Расчёт не подтверждён: '+String(e.message||e)}
  };
  fields[0].oninput=periods;[...fields.slice(1),...growth].forEach(x=>x.oninput=clear);periodPick.onchange=detail;periods();run.click();
 }catch(e){console.error(e);status.textContent='Проверенный баланс недоступен.'}
});