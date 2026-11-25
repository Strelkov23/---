/* Analyst cockpit: separate evidence scopes and local terminal versions. */
const AnalystCockpit=(()=>{
 const R=typeof module!=='undefined'?require('./plan-register.js'):PlanRegister;
 const P=typeof module!=='undefined'?require('./public-plan-fact.js'):PublicPlanFact;
 function summarize(plans,groups,official,year){
  R.validateRegister(plans);
  if(!Number.isInteger(year)||year<1991||year>2100)throw Error('Некорректный год');
  const parents=new Set(plans.map(p=>p.parent).filter(Boolean)),active=plans.filter(p=>!parents.has(p.id));
  const rows=active.map(p=>{const c=R.compare(p,groups),r=c.rows.find(v=>v.year===year);
   return {id:p.id,name:p.name,title:p.series.title,unit:p.series.unit,year,target:r?.value??null,fact:r?.fact??null,deviation:r?.deviation??null,status:r?r.status:'Вне траектории',baselineRevision:c.baselineRevision,source:p.series.source};});
  const goals=P.goals(official).filter(r=>r.year===year);
  const counts=(a,met,miss,off)=>({total:a.length,met:a.filter(r=>r.status===met).length,deviation:a.filter(r=>r.status==='Отклонение'||r.status==='Отклонение от цели').length,missing:a.filter(r=>miss.includes(r.status)).length,outside:a.filter(r=>r.status===off).length});
  return {rows,goals,local:counts(rows,'Цель достигнута',['Нет факта','Несовместимый ряд'],'Вне траектории'),public:counts(goals,'Цель достигнута',['Нет факта'],'Вне траектории'),versions:plans.length};
 }
 return {summarize};
})();
if(typeof module!=='undefined')module.exports=AnalystCockpit;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('ac-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:8}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 function panel(host,c){
  const names=[['met','Достигнуто'],['deviation','Отклонение'],['missing','Нет факта / несовместимо'],['outside','Вне траектории']];
  const bar=node('div','');bar.className='ac-bar';bar.setAttribute('aria-hidden','true');
  for(const [key] of names){const s=node('span','');s.dataset.kind=key;s.style.flexGrow=String(c[key]);s.hidden=!c[key];bar.append(s)}
  const legend=node('div','');legend.className='ac-legend';for(const [key,label] of names){const item=node('span','');item.dataset.kind=key;item.append(node('b',String(c[key])),node('small',label));legend.append(item)}
  host.replaceChildren(node('strong',String(c.total)),node('p','Позиций в выбранном срезе'),bar,legend);
 }
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const [obs,official]=await Promise.all(['normalized-observations.json','annual-goals.json'].map(n=>Provenance.get(manifest,n,root)));
  const groups=PlanRegister.facts(obs.data);let plans=[],localOK=true;
  try{plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem('economic-plan-register-v1')||'[]'))}catch(e){localOK=false}
  const years=[...new Set([...official.data.rows.map(r=>r.year),...plans.flatMap(p=>p.targets.map(t=>t.year))])].sort((a,b)=>a-b),pick=$('ac-year');
  pick.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
  const last=years.filter(y=>y<new Date().getFullYear()).at(-1);if(last!==undefined)pick.value=String(last);
  $('ac-version').textContent=manifest.data_fingerprint.slice(0,12);$('ac-snapshot').textContent=official.data.reviewed||'не указана';
  function draw(){
   try{const r=AnalystCockpit.summarize(plans,groups,official.data,Number(pick.value));
    panel($('ac-local'),r.local);panel($('ac-public'),r.public);
    $('ac-versions').textContent=localOK?String(r.versions):'Недоступно';$('ac-local-note').textContent=localOK?'Последние версии каждой ветви. Независимые планы учитываются отдельно.':'Локальный реестр повреждён или недоступен; нулевые счётчики не отражают его состояние.';
    if(!localOK)$('ac-local').replaceChildren(node('p','Локальные цели недоступны.'));
    table($('ac-table'),['Цель','Показатель','Единица','План','Факт','Отклонение','Статус'],r.rows.map(v=>[v.name,v.title,v.unit,fmt(v.target),fmt(v.fact),fmt(v.deviation),v.status]));
    table($('ac-public-table'),['Показатель','Единица','План','Факт','Статус'],r.goals.map(v=>[v.title,v.unit,fmt(v.plan),fmt(v.actual),v.status]));
    status.textContent='Срез '+pick.value+' · проверен манифест данных. Счётчики отражают позиции, а не эффективность экономики.';
   }catch(e){status.textContent='Срез недоступен: '+String(e.message||e)}
  }
  pick.onchange=draw;draw();
 }catch(e){status.textContent='Проверенные данные недоступны: '+String(e.message||e)}
});