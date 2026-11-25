/* Monitoring rules for a single comparable annual trajectory. No statistical significance or causality. */
const DeviationMonitor=(()=>{
 const finite=Number.isFinite;
 function classify(rows,p){
  if(!Array.isArray(rows)||!['higher','lower','exact'].includes(p.direction)||!['absolute','relative'].includes(p.mode)||!finite(p.warning)||!finite(p.critical)||p.warning<=0||p.critical<=p.warning||!Number.isInteger(p.streak)||p.streak<2||p.streak>10||!Number.isInteger(p.asOf)||p.asOf<1991||p.asOf>2100)throw Error('Некорректные правила сигналов');
  const sorted=[...rows].sort((a,b)=>a.year-b.year);let run=0,previous=null;
  if(new Set(sorted.map(r=>r.year)).size!==sorted.length||sorted.some(r=>!Number.isInteger(r.year)||r.year<1991||r.year>2100||!finite(r.target)||r.fact!==null&&!finite(r.fact)))throw Error('Некорректный ряд');
  const result=sorted.map(r=>{
   const gap=finite(r.fact)?r.fact-r.target:null;
   const adverse=gap===null?null:p.direction==='higher'?Math.max(0,-gap):p.direction==='lower'?Math.max(0,gap):Math.abs(gap);
   const metric=adverse===null?null:p.mode==='absolute'?adverse:r.target===0?null:100*adverse/Math.abs(r.target);
   let status;
   if(r.year>p.asOf)status='future';
   else if(r.incompatible)status='incompatible';
   else if(r.fact===null)status='missing';
   else if(metric===null)status='undefined';
   else if(metric>=p.critical)status='critical';
   else if(metric>=p.warning)status='warning';
   else status='normal';
   const signal=status==='critical'||status==='warning';
   run=signal?(previous===r.year-1?run+1:1):0;previous=r.year;
   return {...r,gap,adverse,metric,status,run,persistent:run>=p.streak};
  });
  return {rows:result,counts:Object.fromEntries(['normal','warning','critical','missing','future','undefined','incompatible'].map(k=>[k,result.filter(r=>r.status===k).length])),persistent:result.filter(r=>r.persistent).length};
 }
 return {classify};
})();
if(typeof module!=='undefined')module.exports=DeviationMonitor;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('dm-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:8}):'—';
 const labels={normal:'В пределах порога',warning:'Предупреждение',critical:'Критическое отклонение',missing:'Нет опубликованного факта',future:'За горизонтом контроля',undefined:'Нулевая цель: относительный порог неприменим',incompatible:'Несовместимый ряд'};
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();tr.dataset.level=r.level;for(const v of r.cells){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const [facts,official]=await Promise.all(['normalized-observations.json','annual-goals.json'].map(n=>Provenance.get(manifest,n,root)));
  const groups=PlanRegister.facts(facts.data),publicGoals=PublicPlanFact.goals(official.data),items=[];
  let plans=[];try{plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem('economic-plan-register-v1')||'[]'))}catch(e){$('dm-local-note').textContent='Локальный реестр недоступен или повреждён.'}
  for(const p of plans){const r=PlanRegister.compare(p,groups);items.push({name:'Пользовательский · '+p.name+' · '+p.id.slice(0,8),unit:p.series.unit,direction:p.direction,source:p.series.source,version:p.id,planHash:p.base.sha256,factHash:facts.sha256,rows:r.rows.map(x=>({year:x.year,target:x.value,fact:x.fact,incompatible:!r.compatible,source:p.series.source}))});}
  const grouped=new Map();for(const r of publicGoals){const k=JSON.stringify([r.id,r.unit,r.direction,r.plan_vintage,r.plan_source]);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r);}
  for(const rows of grouped.values()){const a=rows[0];items.push({name:'Единый план · '+a.title,unit:a.unit,direction:a.direction==='le'?'lower':'higher',source:a.plan_source,version:a.plan_vintage,planHash:official.sha256,factHash:official.sha256,rows:rows.map(x=>({year:x.year,target:x.plan,fact:x.actual,source:x.actual_source||''}))});}
  const pick=$('dm-series'),mode=$('dm-mode'),warning=$('dm-warning'),critical=$('dm-critical'),streak=$('dm-streak'),asOf=$('dm-asof'),exp=$('dm-export'),filter=$('dm-filter');
  pick.replaceChildren(...items.map((v,i)=>new Option(v.name,String(i))));
  asOf.value=Math.max(1991,Math.min(2100,new Date().getFullYear()-1));
  function draw(){
   exp.disabled=true;$('dm-results').replaceChildren();$('dm-summary').textContent='';
   const item=items[Number(pick.value)];if(!item){status.textContent='Нет доступных целей.';return}
   $('dm-definition').textContent=item.name+' · '+item.unit+' · '+item.version+' · источник '+item.source;
   $('dm-unit').textContent=mode.value==='absolute'?'Пороги в единице ряда: '+item.unit:'Пороги в % от модуля планового значения; при нулевой цели неприменимы.';
   if([warning,critical,streak,asOf].some(x=>!x.value||!x.validity.valid)){status.textContent='Проверьте параметры мониторинга.';return}
   try{const p={direction:item.direction,mode:mode.value,warning:warning.valueAsNumber,critical:critical.valueAsNumber,streak:streak.valueAsNumber,asOf:asOf.valueAsNumber},r=DeviationMonitor.classify(item.rows,p);
    status.textContent='Расчёт выполнен по пользовательским порогам. Дата проверки государственного снимка: '+(official.data.reviewed||'—')+'.';
    $('dm-summary').textContent='В пределах порога: '+r.counts.normal+' · предупреждения: '+r.counts.warning+' · критические: '+r.counts.critical+' · устойчивые: '+r.persistent+' · нет факта: '+r.counts.missing+' · за горизонтом: '+r.counts.future+' · несопоставимые: '+r.counts.incompatible+' · нулевая база относительного порога: '+r.counts.undefined+'.';
    const visible=r.rows.filter(x=>filter.value==='all'||filter.value==='signals'&&['critical','warning'].includes(x.status)||filter.value==='missing'&&['missing','incompatible','undefined'].includes(x.status));
    table($('dm-results'),['Год','Цель','Факт','Факт − цель','Неблагоприятное отклонение','Величина для порога','Класс','Серия лет','Устойчивый сигнал'],visible.map(x=>({level:x.status,cells:[x.year,fmt(x.target),fmt(x.fact),fmt(x.gap),fmt(x.adverse),fmt(x.metric),labels[x.status],x.run,x.persistent?'Да':'Нет']})));
    exp.disabled=!visible.length;exp.onclick=()=>csv('deviation-monitor.csv',[['Ряд','Версия','Единица','Направление','Год','Цель','Факт','Факт − цель','Неблагоприятное отклонение','Режим порога','Величина для порога','Предупреждение','Критический порог','Граница контроля','Длина устойчивой серии','Класс','Текущая серия','Устойчивый сигнал','Источник плана','Источник факта','SHA-256 плана','SHA-256 факта','Манифест'],...visible.map(x=>[item.name,item.version,item.unit,p.direction,x.year,x.target,x.fact,x.gap,x.adverse,p.mode,x.metric,p.warning,p.critical,p.asOf,p.streak,labels[x.status],x.run,x.persistent?'да':'нет',item.source,x.source,item.planHash,item.factHash,manifest.data_fingerprint])]);
   }catch(e){status.textContent='Расчёт отклонён: '+String(e.message||e)}
  }
  [pick,mode,warning,critical,streak,asOf,filter].forEach(x=>x.oninput=draw);draw();
 }catch(e){console.error(e);status.textContent='Проверенные данные недоступны: '+String(e.message||e)}
});