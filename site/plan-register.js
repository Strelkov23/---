/* Local versioned research targets, bound to exact normalized WDI series identities. */
const PlanRegister=(()=>{
 const finite=Number.isFinite,year=v=>Number.isInteger(v)&&v>=1991&&v<=2100,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),txt=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const fields=['dataset','series','territory','frequency','unit','source','title'];
 const identity=r=>JSON.stringify(fields.map(k=>r[k]));
 function facts(data){
  if(data?.schema!==1||!Array.isArray(data.rows))throw Error('Некорректный контракт наблюдений');
  const groups=new Map();
  for(const r of data.rows){
   if(r.dataset!=='wdi'||r.kind!=='fact'||r.frequency!=='annual'||r.territory!=='Россия')continue;
   if(!fields.every(k=>txt(r[k],1000))||typeof r.period!=='string'||!/^\d{4}$/.test(r.period)||!year(Number(r.period)))throw Error('Некорректная идентичность ряда');
   const key=identity(r);if(!groups.has(key))groups.set(key,{...Object.fromEntries(fields.map(k=>[k,r[k]])),values:new Map()});
   const values=groups.get(key).values;if(values.has(Number(r.period)))throw Error('Дубликат наблюдения');
   const v=r.value===null?null:typeof r.value==='string'&&r.value.trim()!==''?Number(r.value):NaN;
   if(v!==null&&!finite(v))throw Error('Некорректный факт');
   values.set(Number(r.period),v);
  }
  return groups;
 }
 function trajectory(base,endYear,endValue){
  if(!year(base.year)||!year(endYear)||endYear<=base.year||endYear-base.year>30||!finite(base.value)||!finite(endValue)||Math.abs(endValue)>1e16)throw Error('Некорректная траектория');
  return Array.from({length:endYear-base.year},(_,i)=>({year:base.year+i+1,value:i+1===endYear-base.year?endValue:base.value+(endValue-base.value)*(i+1)/(endYear-base.year)}));
 }
 function validate(p){
  if(!p||p.schema!==1||!txt(p.id,100)||!(p.parent===null||txt(p.parent,100))||p.parent===p.id||!txt(p.name,200)||!txt(p.created,40)||!Number.isFinite(Date.parse(p.created))||!p.series||!fields.every(k=>txt(p.series[k],1000))||p.series.dataset!=='wdi'||p.series.territory!=='Россия'||p.series.frequency!=='annual'||!/^https?:\/\//.test(p.series.source)||!hash(p.base?.sha256)||!hash(p.base?.manifest)||!year(p.base?.year)||!finite(p.base?.value)||!['higher','lower','exact'].includes(p.direction)||!txt(p.note,2000))throw Error('Некорректный паспорт плана');
  const expected=trajectory(p.base,p.endYear,p.endValue);
  if(!Array.isArray(p.targets)||p.targets.length!==expected.length||p.targets.some((r,i)=>r.year!==expected[i].year||r.value!==expected[i].value))throw Error('Траектория не соответствует параметрам');
  return p;
 }
 function validateRegister(plans){
  if(!Array.isArray(plans)||plans.length>200)throw Error('Некорректный реестр');
  const ids=new Set();
  for(const p of plans){validate(p);if(ids.has(p.id)||p.parent!==null&&!ids.has(p.parent))throw Error('Нарушена история версий');ids.add(p.id)}
  return plans;
 }
 function create(series,params,meta){
  const base={year:params.baseYear,value:series.values.get(params.baseYear),sha256:meta.sha256,manifest:meta.manifest};
  return validate({schema:1,id:meta.id,parent:params.parent??null,name:params.name.trim(),created:meta.created,series:Object.fromEntries(fields.map(k=>[k,series[k]])),base,endYear:params.endYear,endValue:params.endValue,direction:params.direction,note:params.note.trim(),targets:trajectory(base,params.endYear,params.endValue)});
 }
 function compare(p,groups){
  validate(p);const series=groups.get(identity(p.series));
  const baseline=series?.values.get(p.base.year);const baselineRevision=finite(baseline)?baseline-p.base.value:null;
  return {compatible:!!series,baseline:finite(baseline)?baseline:null,baselineRevision,rows:p.targets.map(t=>{
   const v=series?.values.get(t.year);if(!finite(v))return {...t,fact:null,deviation:null,relative:null,status:series?'Нет факта':'Несовместимый ряд'};
   const deviation=v-t.value,tol=1e-9*Math.max(1,Math.abs(v),Math.abs(t.value)),met=p.direction==='higher'?deviation>=-tol:p.direction==='lower'?deviation<=tol:Math.abs(deviation)<=tol;
   return {...t,fact:v,deviation,relative:t.value!==0?100*deviation/Math.abs(t.value):null,status:met?'Цель достигнута':'Отклонение от цели'};
  })};
 }
 return {facts,identity,trajectory,validate,validateRegister,create,compare};
})();
if(typeof module!=='undefined')module.exports=PlanRegister;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('pr-status');if(!status)return;
 const key='economic-plan-register-v1',fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:9}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 let plans=[],parent=null;const storeStatus=$('pr-storage');
 try{plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem(key)||'[]'))}catch(e){storeStatus.textContent='Локальный реестр недоступен или повреждён. Используйте резервную копию.'}
 function persist(next){PlanRegister.validateRegister(next);plans=next;try{localStorage.setItem(key,JSON.stringify(plans));storeStatus.textContent='Сохранено локально: '+plans.length+' версий.'}catch(e){storeStatus.textContent='Хранилище недоступно: сохраните резервную копию JSON.'}}
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'normalized-observations.json',root),groups=PlanRegister.facts(entry.data),series=$('pr-series'),base=$('pr-base'),pick=$('pr-pick');
  const choices=[...groups.entries()].filter(([,v])=>[...v.values.values()].some(Number.isFinite));
  series.replaceChildren(...choices.map(([k,v],i)=>new Option(v.title+' · '+v.unit,String(i))));
  function selectedSeries(){return choices[Number(series.value)]?.[1]}
  function bases(){const s=selectedSeries();base.replaceChildren(...[...(s?.values||[])].filter(([y,v])=>Number.isFinite(v)).sort((a,b)=>b[0]-a[0]).map(([y,v])=>new Option(y+' · '+fmt(v),String(y))));}
  series.onchange=bases;bases();
  function render(id){pick.replaceChildren(...plans.map(p=>new Option(p.name+' · '+p.created+' · '+p.id.slice(0,8),p.id)));if(id&&plans.some(p=>p.id===id))pick.value=id;show();}
  function show(){
   const p=plans.find(v=>v.id===pick.value);$('pr-result').replaceChildren();$('pr-revise').disabled=!p;$('pr-csv').disabled=!p;
   if(!p){$('pr-detail').textContent='Нет сохранённых версий.';return}
   const r=PlanRegister.compare(p,groups);
   $('pr-detail').textContent=p.name+' · '+p.series.title+' · '+p.series.unit+' · база '+p.base.year+': '+fmt(p.base.value)+' · изменение опубликованной базы: '+fmt(r.baselineRevision)+' · '+(r.compatible?'Совместимый ключ ряда':'Ключ ряда изменился')+' · источник '+p.series.source+' · обоснование: '+p.note;
   table($('pr-result'),['Год','Цель','Последний опубликованный факт','Факт − цель','Относительное отклонение, %','Статус'],r.rows.map(a=>[a.year,fmt(a.value),fmt(a.fact),fmt(a.deviation),fmt(a.relative),a.status]));
   $('pr-csv').onclick=()=>csv('plan-fact-'+p.id+'.csv',[['Версия','Родитель','Название','Код','Территория','Единица','Направление','Год','Цель','Факт','Факт − цель','Относительное отклонение, %','Статус','База: год','База: значение','Пересмотр базы','Источник','SHA-256 базы','Манифест базы','SHA-256 факта','Манифест факта','Обоснование'],...r.rows.map(a=>[p.id,p.parent,p.name,p.series.series,p.series.territory,p.series.unit,p.direction,a.year,a.value,a.fact,a.deviation,a.relative,a.status,p.base.year,p.base.value,r.baselineRevision,p.series.source,p.base.sha256,p.base.manifest,entry.sha256,manifest.data_fingerprint,p.note])]);
  }
  pick.onchange=show;
  $('pr-revise').onclick=()=>{const p=plans.find(v=>v.id===pick.value),i=choices.findIndex(([k])=>k===PlanRegister.identity(p.series));if(i<0){status.textContent='Исходный ключ ряда отсутствует.';return}parent=p.id;series.value=String(i);bases();if(!Array.from(base.options).some(o=>o.value===String(p.base.year))){parent=null;status.textContent='Год исходной базы недоступен.';return}base.value=String(p.base.year);$('pr-name').value=p.name;$('pr-end-year').value=p.endYear;$('pr-end-value').value=p.endValue;$('pr-direction').value=p.direction;$('pr-note').value=p.note;status.textContent='Редактируется копия версии '+p.id.slice(0,8)+'. Исходная версия сохраняется; база берётся из текущего архива.';};
  $('pr-new').onclick=()=>{parent=null;status.textContent='Новая независимая цель.';};
  $('pr-save').onclick=()=>{try{
   const s=selectedSeries(),y=$('pr-end-year'),v=$('pr-end-value');if(!s||!base.value||!y.value||!v.value||!y.validity.valid||!v.validity.valid)throw Error('Заполните параметры');
   const p=PlanRegister.create(s,{parent,name:$('pr-name').value,note:$('pr-note').value,baseYear:Number(base.value),endYear:y.valueAsNumber,endValue:v.valueAsNumber,direction:$('pr-direction').value},{id:crypto.randomUUID(),created:new Date().toISOString(),sha256:entry.sha256,manifest:manifest.data_fingerprint});
   persist([...plans,p]);parent=null;render(p.id);status.textContent='Новая версия сохранена; старые версии не изменены.';
  }catch(e){status.textContent='Не сохранено: '+String(e.message||e)}};
  $('pr-backup').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,plans},null,2)],{type:'application/json'})),a=node('a','');a.href=url;a.download='economic-plan-register.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('pr-restore').onchange=async()=>{try{const file=$('pr-restore').files?.[0];if(!file)return;if(file.size>2000000)throw Error('Файл слишком большой');const d=JSON.parse(await file.text());if(d.schema!==1)throw Error('Несовместимая схема');PlanRegister.validateRegister(d.plans);
   const next=[...plans];for(const p of d.plans){const prior=next.find(v=>v.id===p.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(p))throw Error('Конфликт идентификатора версии');if(!prior)next.push(p)}persist(next);render();status.textContent='Резервная копия объединена без перезаписи версий.';
  }catch(e){status.textContent='Импорт отклонён: '+String(e.message||e)}finally{$('pr-restore').value=''}};
  render();status.textContent='Доступно сопоставимых годовых рядов WDI: '+choices.length+'.';
 }catch(e){console.error(e);status.textContent='Проверенные наблюдения недоступны.'}
});