/* Self-contained planning evidence protocol. JSON input can be replayed without a network. */
const PlanReport=(()=>{
 const R=typeof module!=='undefined'?require('./plan-register.js'):PlanRegister;
 const M=typeof module!=='undefined'?require('./deviation-monitor.js'):DeviationMonitor;
 const C=typeof module!=='undefined'?require('./plan-comparison.js'):PlanComparison;
 const D=typeof module!=='undefined'?require('./plan-diagnostics.js'):PlanDiagnostics;
 const Macro=typeof module!=='undefined'?require('./macro-diagnostics.js'):MacroDiagnostics;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 function build(input){
  if(input?.schema!=='economic-plan-report-v1'||!hash(input.factSha256)||!hash(input.manifest)||!Array.isArray(input.observations)||input.observations.length>10000||typeof input.note!=='string'||input.note.length>10000)throw Error('Некорректный пакет отчёта');
  const a=R.validate(input.plan),b=input.alternative===null?null:R.validate(input.alternative),p=input.rules;
  const groups=R.facts({schema:1,rows:input.observations}),fact=R.compare(a,groups);
  const monitor=M.classify(fact.rows.map(v=>({year:v.year,target:v.value,fact:v.fact,incompatible:!fact.compatible})),{...p,direction:a.direction});
  const diagnostic=D.analyse(a,groups,input.year,input.window,input.threshold);
  const comparison=b?C.compare(a,b,groups):null;
  return {fact,monitor,diagnostic,comparison};
 }
 function selectObservations(data,plan){
  R.validate(plan);
  const codes=new Set([plan.series.series]);for(const r of Macro.rules)if(r.a===plan.series.series||r.b===plan.series.series){codes.add(r.a);codes.add(r.b)}
  return data.rows.filter(r=>r.dataset==='wdi'&&r.kind==='fact'&&r.frequency==='annual'&&r.territory==='Россия'&&codes.has(r.series));
 }
 return {build,selectObservations};
})();
if(typeof module!=='undefined')module.exports=PlanReport;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('pre-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:9}):'—';
 const labels={normal:'В пределах порога',warning:'Предупреждение',critical:'Критическое отклонение',missing:'Нет факта',future:'За горизонтом контроля',undefined:'Нулевая цель',incompatible:'Несовместимый ряд',signal:'Исторический сигнал',ordinary:'Нет исторического сигнала',short:'Недостаточно истории',constant:'MAD = 0',unavailable:'Не вычислено'};
 const table=(host,heads,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of heads){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();td.textContent=v??'—'}}const w=node('div','');w.className='table-scroll';w.append(t);host.append(w)};
 const download=(name,content,type)=>{const url=URL.createObjectURL(new Blob([content],{type})),a=node('a','');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const buttons=['pre-json','pre-csv','pre-print'];let current=null;
 function clear(){current=null;buttons.forEach(id=>$(id).disabled=true);$('pre-preview').replaceChildren();status.textContent='Параметры изменены. Сформируйте отчёт.'}
 function render(input,r,origin){
  const host=$('pre-preview'),a=input.plan;host.replaceChildren(node('h2',a.name),node('p',a.series.title+' · '+a.series.unit+' · версия '+a.id),node('p','База: '+a.base.year+' / '+fmt(a.base.value)+' · источник '+a.series.source),node('p','SHA-256 базы: '+a.base.sha256+' · SHA-256 наблюдений: '+input.factSha256+' · манифест: '+input.manifest),node('p','Обоснование плана: '+a.note),node('p','Происхождение пакета: '+origin),node('h3','План-факт и контроль'));
  table(host,['Год','Цель','Факт','Отклонение','Неблагоприятное отклонение','Класс','Серия лет'],r.monitor.rows.map(x=>[x.year,fmt(x.target),fmt(x.fact),fmt(x.gap),fmt(x.adverse),labels[x.status],x.run]));
  host.append(node('p','Пересмотр исходной базы: '+fmt(r.fact.baselineRevision)+' · пороги '+input.rules.warning+' / '+input.rules.critical+' · режим '+input.rules.mode+' · граница '+input.rules.asOf+' · серия '+input.rules.streak));
  host.append(node('h3','Диагностика: '+input.year),node('p','Окно '+input.window+' лет; порог '+input.threshold+'. Исторические сигналы не доказывают причину отклонения.'));
  table(host,['Правило','Единица','A','B','Значение','Робастная оценка','Статус'],r.diagnostic.rows.map(x=>[x.rule.title,x.rule.unit,fmt(x.current?.a),fmt(x.current?.b),fmt(x.current?.value),fmt(x.signal.score),x.compatible?labels[x.signal.status]:'Несовместимые входы']));
  if(!r.diagnostic.rows.length)host.append(node('p','Прямых правил по коду показателя нет.'));
  if(r.comparison){host.append(node('h3','Альтернативная версия: '+input.alternative.name),node('p','Общие годы с фактом: '+r.comparison.summary.known+'; база '+(r.comparison.sameBase?'совпадает':'различается')+'. Сравнение целей не является причинным сравнением политики.'));table(host,['Год','А','Б','Факт','Неблагоприятное А','Неблагоприятное Б'],r.comparison.rows.map(x=>[x.year,fmt(x.a),fmt(x.b),fmt(x.fact),fmt(x.adverseA),fmt(x.adverseB)]))}
  host.append(node('h3','Авторская интерпретация'),node('p',input.note||'Не добавлена.'),node('h3','Ограничения'),node('p','Наблюдения — сохранённая редакция WDI, не прогноз и не государственный план. Пропуски не заполнены. Хеш исходного файла не удостоверяет самостоятельно отредактированную копию JSON; повторный расчёт проверяет арифметику, но не подлинность источника.'));
  current={input,result:r};buttons.forEach(id=>$(id).disabled=false);status.textContent='Отчёт сформирован. '+origin;
 }
 $('pre-json').onclick=()=>{if(current)download('economic-plan-report.json',JSON.stringify(current,null,2),'application/json')};
 $('pre-csv').onclick=()=>{if(!current)return;const {input,result}=current;csv('economic-plan-report.csv',[['Версия','Год','Код','Единица','Цель','Факт','Факт − цель','Неблагоприятное отклонение','Класс','Серия','SHA-256 наблюдений','Манифест'],...result.monitor.rows.map(x=>[input.plan.id,x.year,input.plan.series.series,input.plan.series.unit,x.target,x.fact,x.gap,x.adverse,labels[x.status],x.run,input.factSha256,input.manifest])])};
 $('pre-print').onclick=()=>{if(current)window.print()};
 $('pre-replay').onchange=async()=>{clear();try{const file=$('pre-replay').files?.[0];if(!file)return;if(file.size>6000000)throw Error('Файл слишком большой');const saved=JSON.parse(await file.text()),r=PlanReport.build(saved.input);const match=JSON.stringify(r)===JSON.stringify(saved.result);render(saved.input,r,match?'Локальная копия: повторный расчёт совпал. Подлинность файла не подтверждена.':'Локальная копия: сохранённый результат не совпал; показан повторный расчёт.');}catch(e){status.textContent='Импорт отклонён: '+String(e.message||e)}finally{$('pre-replay').value=''}};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'normalized-observations.json',root),plans=PlanRegister.validateRegister(JSON.parse(localStorage.getItem('economic-plan-register-v1')||'[]')),pick=$('pre-plan'),alt=$('pre-alt'),year=$('pre-year');
  pick.replaceChildren(...plans.map(p=>new Option(p.name+' · '+p.id.slice(0,8),p.id)));
  function choices(){clear();const a=plans.find(p=>p.id===pick.value);alt.replaceChildren(new Option('Без альтернативы',''),...plans.filter(p=>a&&p.id!==a.id&&PlanRegister.identity(p.series)===PlanRegister.identity(a.series)&&p.direction===a.direction).map(p=>new Option(p.name+' · '+p.id.slice(0,8),p.id)));year.replaceChildren(...(a?.targets||[]).map(t=>new Option(String(t.year),String(t.year))));}
  pick.onchange=choices;choices();
  ['pre-alt','pre-year','pre-window','pre-threshold','pre-mode','pre-warning','pre-critical','pre-streak','pre-asof','pre-note'].forEach(id=>$(id).oninput=clear);
  $('pre-asof').value=new Date().getFullYear()-1;
  $('pre-run').onclick=()=>{clear();try{
   const a=plans.find(p=>p.id===pick.value);if(!a)throw Error('Создайте цель в реестре');const value=id=>{const x=$(id);if(!x.value||!x.validity.valid)throw Error('Проверьте числовые параметры');return x.valueAsNumber};
   const input={schema:'economic-plan-report-v1',plan:a,alternative:plans.find(p=>p.id===alt.value)||null,year:Number(year.value),window:value('pre-window'),threshold:value('pre-threshold'),rules:{mode:$('pre-mode').value,warning:value('pre-warning'),critical:value('pre-critical'),streak:value('pre-streak'),asOf:value('pre-asof')},note:$('pre-note').value,factSha256:entry.sha256,manifest:manifest.data_fingerprint,observations:PlanReport.selectObservations(entry.data,a)};
   render(input,PlanReport.build(input),'Проверенный архив сайта');
  }catch(e){status.textContent='Отчёт отклонён: '+String(e.message||e)}};
  status.textContent=plans.length?'Выберите параметры отчёта.':'Создайте цель в реестре или загрузите сохранённый отчёт.';
 }catch(e){status.textContent='Текущий архив или реестр недоступен; доступен локальный повторный расчёт.'}
});