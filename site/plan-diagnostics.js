/* Link plan/fact to same-year WDI diagnostic rules, not causal attribution. */
const PlanDiagnostics=(()=>{
 const R=typeof module!=='undefined'?require('./plan-register.js'):PlanRegister;
 const D=typeof module!=='undefined'?require('./macro-diagnostics.js'):MacroDiagnostics;
 function analyse(plan,groups,year,window,threshold){
  R.validate(plan);
  if(!Number.isInteger(year)||!plan.targets.some(x=>x.year===year)||!Number.isInteger(window)||window<5||window>20||!Number.isFinite(threshold)||threshold<=0||threshold>10)throw Error('Недопустимый год или параметры диагностики');
  const comparison=R.compare(plan,groups),target=comparison.rows.find(r=>r.year===year),related=D.rules.filter(r=>r.a===plan.series.series||r.b===plan.series.series);
  const byCode=new Map();
  for(const v of groups.values()){if(!byCode.has(v.series))byCode.set(v.series,[]);byCode.get(v.series).push(v)}
  const data=Object.create(null),meta=Object.create(null);
  for(const [code,rows] of byCode){if(rows.length!==1)continue;const r=rows[0];if(code===plan.series.series&&R.identity(r)!==R.identity(plan.series))continue;data[code]={values:Object.fromEntries(r.values)};meta[code]=r}
  const rows=related.map(rule=>{
   const a=meta[rule.a],b=meta[rule.b],valid=!!a&&!!b&&a.unit===b.unit;
   const history=valid?D.compute(rule,data,1991,year):[],current=history.find(x=>x.year===year)||null;
   const signal=D.changeSignals(history,year,year,window,threshold,5)[0];
   return {rule,current,signal,sourceA:a?.source??null,sourceB:b?.source??null,unitA:a?.unit??null,unitB:b?.unit??null,compatible:valid};
  });
  return {target,compatible:comparison.compatible,rows,baselineRevision:comparison.baselineRevision};
 }
 return {analyse};
})();
if(typeof module!=='undefined')module.exports=PlanDiagnostics;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('pd-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:8}):'—';
 const labels={signal:'Сигнал',ordinary:'Нет сигнала',missing:'Нет пары наблюдений',short:'Недостаточно истории',constant:'MAD = 0',unavailable:'Не вычислено'};
 const table=(host,heads,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of heads){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'normalized-observations.json',root),groups=PlanRegister.facts(entry.data),pick=$('pd-plan'),year=$('pd-year'),win=$('pd-window'),threshold=$('pd-threshold'),exp=$('pd-export');
  const plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem('economic-plan-register-v1')||'[]'));
  pick.replaceChildren(...plans.map(p=>new Option(p.name+' · '+p.series.title+' · '+p.id.slice(0,8),p.id)));
  function selected(){return plans.find(p=>p.id===pick.value)}
  function years(){const p=selected();year.replaceChildren(...(p?.targets||[]).map(t=>new Option(String(t.year),String(t.year))));draw()}
  function draw(){
   exp.disabled=true;$('pd-result').replaceChildren();$('pd-rules').replaceChildren();$('pd-summary').textContent='';
   const p=selected();if(!p){status.textContent='Создайте цель в реестре.';return}
   if(!win.value||!threshold.value||!win.validity.valid||!threshold.validity.valid){status.textContent='Проверьте параметры.';return}
   try{
    const y=Number(year.value),w=win.valueAsNumber,t=threshold.valueAsNumber,r=PlanDiagnostics.analyse(p,groups,y,w,t);
    status.textContent='Показатель: '+p.series.title+' · '+p.series.unit+' · '+y+'. '+(r.compatible?'Ключ ряда совпадает.':'Ключ ряда несовместим; факт отсутствует.');
    table($('pd-result'),['План','Факт','Факт − план','Статус','Пересмотр исходной базы'],[[fmt(r.target.value),fmt(r.target.fact),fmt(r.target.deviation),r.target.status,fmt(r.baselineRevision)]]);
    $('pd-summary').textContent=r.rows.length?'Связанных правил: '+r.rows.length+'; сигналов: '+r.rows.filter(x=>x.compatible&&x.signal.status==='signal').length+'. Сигнал исторического изменения не объясняет отклонение от плана.':'В действующем наборе макроправил нет прямой связи по коду показателя. Не подставляются тематически похожие ряды.';
    table($('pd-rules'),['Связанное правило','Единица','A','B','Значение','Изменение за год','Робастная оценка','История, лет','Статус','Ограничение'],r.rows.map(x=>[x.rule.title,x.rule.unit,fmt(x.current?.a),fmt(x.current?.b),fmt(x.current?.value),fmt(x.signal.delta),fmt(x.signal.score),x.signal.history.length,x.compatible?labels[x.signal.status]:'Несовместимые или неоднозначные входы',x.rule.note]));
    exp.disabled=false;exp.onclick=()=>csv('plan-diagnostics.csv',[['Версия плана','Год','Код плана','Единица плана','Цель','Факт','Отклонение','Статус плана','Правило','Код A','Код B','Единица диагностики','A','B','Значение','Годовое изменение','Окно','Порог','Медиана','MAD','z','Статус диагностики','История','Источник A','Источник B','SHA-256 базы','SHA-256 факта','Манифест','Ограничение'],...(r.rows.length?r.rows:[null]).map(x=>[p.id,y,p.series.series,p.series.unit,r.target.value,r.target.fact,r.target.deviation,r.target.status,x?.rule.id,x?.rule.a,x?.rule.b,x?.rule.unit,x?.current?.a,x?.current?.b,x?.current?.value,x?.signal.delta,w,t,x?.signal.median,x?.signal.mad,x?.signal.score,x?(x.compatible?labels[x.signal.status]:'Несовместимые входы'):'Нет прямого правила',x?.signal.history.map(h=>h.year+': '+h.delta).join('; '),x?.sourceA,x?.sourceB,p.base.sha256,entry.sha256,manifest.data_fingerprint,x?.rule.note])]);
   }catch(e){status.textContent='Расчёт отклонён: '+String(e.message||e)}
  }
  pick.onchange=years;[year,win,threshold].forEach(x=>x.oninput=draw);years();
 }catch(e){console.error(e);status.textContent='Данные недоступны: '+String(e.message||e)}
});