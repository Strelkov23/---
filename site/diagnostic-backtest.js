/* Retrospective sensitivity; no forecast accuracy or causal attribution. */
const DiagnosticBacktest=(()=>{
 const D=typeof module!=='undefined'?require('./macro-diagnostics.js'):MacroDiagnostics;
 const configs=[5,10,15].flatMap(window=>[2.5,3.5,4.5].map(threshold=>({window,threshold,id:window+'/'+threshold})));
 function run(rule,data,start,end){
  if(!D.rules.some(r=>r.id===rule.id)||!Number.isInteger(start)||!Number.isInteger(end)||start<1991||end>2100||start>end)throw Error('Некорректный период или показатель');
  const observed=D.compute(rule,data,1991,end);
  const source=new Map(observed.map(x=>[x.year,x]));
  const results=configs.map(c=>D.changeSignals(observed,start,end,c.window,c.threshold,5));
  const rows=Array.from({length:end-start+1},(_,i)=>{
   const year=start+i,states=results.map(r=>r[i]),eligible=states.filter(s=>['ordinary','signal'].includes(s.status)).length,signals=states.filter(s=>s.status==='signal').length;
   return {year,input:source.get(year)||null,previous:source.get(year-1)||null,states,eligible,signals,classification:eligible!==configs.length?'incomplete':signals===configs.length?'stable_signal':signals===0?'no_signal':'sensitive'}
  });
  const common=rows.filter(r=>r.eligible===configs.length);
  const summary=configs.map((c,i)=>{
   const eligible=rows.filter(r=>['ordinary','signal'].includes(r.states[i].status)).length,signals=rows.filter(r=>r.states[i].status==='signal').length,commonSignals=common.filter(r=>r.states[i].status==='signal').length;
   return {...c,eligible,signals,share:eligible?100*signals/eligible:null,common:common.length,commonSignals,commonShare:common.length?100*commonSignals/common.length:null}
  });
  return {rows,summary,common:common.length,stable:common.filter(r=>r.classification==='stable_signal').length,sensitive:common.filter(r=>r.classification==='sensitive').length,none:common.filter(r=>r.classification==='no_signal').length};
 }
 return {configs,run};
})();
if(typeof module!=='undefined')module.exports=DiagnosticBacktest;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('db-rule'))return;
 const f=x=>Number.isFinite(x)?fmt(x):'—',label={stable_signal:'Сигнал при всех настройках',no_signal:'Нет сигналов при всех настройках',sensitive:'Зависит от настройки',incomplete:'Не все варианты оценимы'},states={signal:'Сигнал',ordinary:'Нет сигнала',missing:'Пропуск',short:'Мало истории',constant:'MAD = 0',unavailable:'Не вычислено'};
 const table=(host,heads,rows)=>{const t=node('table',''),tr=t.createTHead().insertRow();for(const s of heads){const th=node('th',s);th.scope='col';tr.append(th)}const body=t.createTBody();for(const r of rows){const tr=body.insertRow();for(const x of r)tr.insertCell().textContent=x??'—'}host.replaceChildren(t)};
 try{
  const [data,catalog]=await Promise.all([load('compare.json'),load('catalog.json')]);
  for(const rule of MacroDiagnostics.rules)$('db-rule').add(new Option(rule.title,rule.id));
  const fields=['db-rule','db-start','db-end'];restore(fields);
  function draw(){
   $('db-export').disabled=true;
   $('db-grid').replaceChildren();$('db-configs').replaceChildren();$('db-metrics').replaceChildren();
   try{
    const r=MacroDiagnostics.rules.find(r=>r.id===$('db-rule').value),start=$('db-start').valueAsNumber,end=$('db-end').valueAsNumber;
    const x=DiagnosticBacktest.run(r,data,start,end);
    $('db-status').textContent='Формула показателя: '+MacroDiagnostics.formula(r.op)+' · '+r.unit+' · '+r.note+' Источники: '+r.a+' и '+r.b+'. Версия '+(version||'не установлена');
    for(const [name,value] of [['Лет в периоде',x.rows.length],['Общих оценимых лет',x.common],['Устойчивых сигналов',x.stable],['Зависят от параметров',x.sensitive],['Без сигналов',x.none]]){const m=node('div','');m.className='metric';m.append(node('b',String(value)),node('span',name));$('db-metrics').append(m)}
    table($('db-grid'),['Год','Значение','Годовое изменение',...DiagnosticBacktest.configs.map(c=>c.id),'Итог'],x.rows.map(y=>[y.year,f(y.input?.value),f(y.states[0].delta),...y.states.map(s=>states[s.status]),label[y.classification]]));
    table($('db-configs'),['Окно / порог','Оценено лет','Сигналов','Доля, %','Общие годы','Сигналов на общих годах','Доля на общих годах, %'],x.summary.map(c=>[c.id,c.eligible,c.signals,f(c.share),c.common,c.commonSignals,f(c.commonShare)]));
    $('db-export').disabled=false;
    $('db-export').onclick=()=>csv('diagnostic-sensitivity.csv',[['Правило','Год','A','B','Предыдущий A','Предыдущий B','Результат','Изменение','Окно','Порог','Предыдущих изменений','Медиана','MAD','z','Статус','История год: изменение','Итог всех вариантов','Код A','Код B','Источник A','Источник B','Единица','Формула'],...x.rows.flatMap(y=>y.states.map((s,i)=>[r.id,y.year,y.input?.a,y.input?.b,y.previous?.a,y.previous?.b,y.input?.value,s.delta,DiagnosticBacktest.configs[i].window,DiagnosticBacktest.configs[i].threshold,s.history.length,s.median,s.mad,s.score,states[s.status],s.history.map(h=>h.year+': '+h.delta).join('; '),label[y.classification],r.a,r.b,catalog[r.a]?.source,catalog[r.b]?.source,r.unit,MacroDiagnostics.formula(r.op)]))]);
    save(fields)
   }catch(e){$('db-status').textContent='Расчёт недоступен: '+e.message}
  }
  for(const id of fields)$(id).addEventListener('input',draw);
  draw()
 }catch(e){$('db-status').textContent='Не удалось загрузить согласованные ряды.'}
});