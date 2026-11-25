
const BankDirectory=(()=>{
 function rows(data,mode,license,query){
  const a=data.datasets.system,b=data.datasets.full,system=new Map(a.rows.map(r=>[r.registration_number,r])),full=new Map(b.rows.map(r=>[r.registration_number,r]));
  const base=mode==='system'?a.rows.map(r=>({...full.get(r.registration_number),...r,systemRow:r.source_row,fullRow:full.get(r.registration_number)?.source_row,system:true})):b.rows.map(r=>({...r,fullRow:r.source_row,systemRow:system.get(r.registration_number)?.source_row,system:a.rows.length?system.has(r.registration_number):null}));
  const q=String(query||'').trim().toLocaleLowerCase('ru');
  return base.filter(r=>(mode!=='active'||r.license_status==='Действующая')&&(!license||(license==='__unknown__'?!r.license_status:r.license_status===license))&&(!q||[r.name,r.registration_number,r.ogrn].some(v=>String(v||'').toLocaleLowerCase('ru').includes(q)))).sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.registration_number.localeCompare(b.registration_number));
 }
 function commonDates(data,form){
  const lists=data.rows.map(r=>r.forms[form]);
  if(!lists.length||lists.some(x=>x?.status!=='ok'))return null;
  const sets=lists.slice(1).map(x=>new Set(x.dates));
  return [...new Set(lists[0].dates)].filter(v=>sets.every(x=>x.has(v))).sort().reverse();
 }
 function profile(reg,feeds){
  const result=[];
  const add=(d,fields,period,form)=>{const r=d?.rows?.find(x=>x.registration_number===reg);if(!r)return;
   for(const [key,label] of fields){const v=form==='808'?r[key]:r.current?.[key];if(v!==null&&v!==undefined)result.push({label,value:v,period,form,source:r.source,sha256:r.sha256,verification:form==='808'?r.verification:'html'});}
  };
  add(feeds.capital,[['capital','Регуляторный капитал']],feeds.capital?.period,'808');
  add(feeds.balance,[['assets','Активы'],['liabilities','Обязательства'],['equity','Источники собственных средств'],['loans','Чистая ссудная задолженность'],['client_funds','Средства клиентов'],['retail_funds','Средства физлиц и ИП']],feeds.balance?.period,'806');
  add(feeds.profit,[['profit','Прибыль / убыток'],['net_interest','Чистые процентные доходы'],['operating_expense','Операционные расходы']],feeds.profit?.period,'807');
  return result;
 }
 function coverage(reg,feeds){
  return [['capital','808'],['balance','806'],['profit','807']].map(([key,form])=>{
   const d=feeds[key],r=d?.rows?.find(x=>x.registration_number===reg);
   const error=d?.attempts?.[reg]?.error||d?.errors?.find(x=>x.registration_number===reg)?.error||null;
   const target=d?.target_cohort??d?.cohort;
   const status=!d?'Набор недоступен':r?(r.verification==='documentary'?'Документальная сверка':'Запись получена'):error?'Не подтверждено':Array.isArray(target)&&target.length&&!target.includes(reg)?'Вне целевой выборки':'Нет записи';
   return {form,period:d?.period??null,status,error,checked:d?.attempts?.[reg]?.checked??null};
  });
 }
 function coverageSummary(feeds){
  const definitions=[['capital','808','Регуляторный капитал'],['balance','806','Бухгалтерский баланс'],['profit','807','Финансовые результаты']];
  const sets=[];
  const forms=definitions.map(([key,form,label])=>{
   const d=feeds[key],target=d?.target_cohort??d?.cohort;
   if(!Array.isArray(target)||!target.length)return {form,label,period:d?.period??null,target:null,verified:null,documentary:null,failed:null,pending:null,outside:null};
   const ids=new Set(target),verified=new Set(),documentary=new Set();
   for(const r of d.rows||[]){if(!ids.has(r.registration_number))continue;if(key==='capital'&&r.verification!=='html'){if(r.verification==='documentary')documentary.add(r.registration_number)}else verified.add(r.registration_number)}
   const failed=new Set(),errors=new Map((d.errors||[]).map(r=>[r.registration_number,r.error]));
   for(const id of ids){if(verified.has(id)){documentary.delete(id);continue}if(!documentary.has(id)&&(d.attempts?.[id]?.error||errors.get(id)))failed.add(id);}
   sets.push({ids,verified});
   return {form,label,period:d.period,target:ids.size,verified:verified.size,documentary:documentary.size,failed:failed.size,pending:ids.size-verified.size-documentary.size-failed.size,outside:new Set((d.rows||[]).filter(r=>!ids.has(r.registration_number)).map(r=>r.registration_number)).size};
  });
  const shared=sets.length===3?[...sets[0].ids].filter(id=>sets.every(s=>s.ids.has(id))):null;
  const distribution=shared===null?null:[0,0,0,0];
  if(distribution)for(const id of shared)distribution[sets.reduce((n,s)=>n+Number(s.verified.has(id)),0)]++;
  return {forms,commonTarget:shared?.length??null,allVerified:distribution===null?null:distribution[3],distribution};
 }
 return {rows,commonDates,profile,coverage,coverageSummary};
})();
if(typeof module!=='undefined')module.exports=BankDirectory;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('bank-table');if(!host)return;
 const mode=$('bank-mode'),license=$('bank-license'),query=$('bank-query'),status=$('bank-source-status'),count=$('bank-count'),metrics=$('bank-metrics'),prev=$('bank-prev'),next=$('bank-next'),exp=$('bank-export'),passport=$('bank-passport');
 let page=0;const size=50;let selected=null,feeds={};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'bank-directory.json',root),data=entry.data,a=data.datasets.system,b=data.datasets.full;
  status.textContent='Системно значимые: '+(a.edition||'нет проверенной редакции')+'; полный список: '+(b.edition||'нет проверенной редакции')+' · точных повторов: '+(b.duplicate_rows?.length??0)+'. '+[a,b].map(x=>x.error||'').filter(Boolean).join(' · ');
  for(const [label,value] of [['Системно значимые',a.rows.length||'—'],['Записей полного перечня',b.rows.length||'—'],['Действующая лицензия',b.rows.length?b.rows.filter(r=>r.license_status==='Действующая').length:'—']]){const c=node('div','');c.className='metric';c.append(node('b',String(value)),node('span',label));metrics.append(c)}
  license.replaceChildren(new Option('Все',''),...[...new Set(b.rows.map(r=>r.license_status).filter(Boolean))].sort().map(v=>new Option(v,v)),new Option('Не указан','__unknown__'));
  if(!a.rows.length&&b.rows.length)mode.value='full';
  function detail(r){
   selected=r;passport.replaceChildren(node('h3',r.name),node('p','Регистрационный номер: '+r.registration_number+' · ОГРН: '+(r.ogrn||'не указан')+' · статус лицензии: '+(r.license_status||'нет сопоставленной записи')+' ('+(b.edition||'—')+')'),node('p','Системная значимость: '+(r.system===true?'включён':r.system===false?'не входит в загруженный перечень':'не установлена')+' · '+(a.edition||'—')),node('p','Вид: '+(r.kind||'Без отдельной метки НКО в перечне')+' · дата регистрации: '+(r.registered||'—')+'. Не является оценкой надёжности.'));
   const values=BankDirectory.profile(r.registration_number,feeds);
   passport.append(node('h4','Опубликованные финансовые показатели'));
   if(!values.length)passport.append(node('p','Нет доступных записей в проверенных наборах. Это не означает нулевые показатели.'));
   else{
    const wrap=node('div','');wrap.className='table-scroll';const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();
    for(const label of ['Показатель','Тыс. руб.','Период','Источник']){const th=node('th',label);th.scope='col';head.append(th)}
    for(const v of values){const row=body.insertRow();for(const x of [v.label,BigInt(v.value).toLocaleString('ru'),v.period])row.insertCell().textContent=x;const a=node('a','Форма '+v.form+(v.verification==='documentary'?' · документальная сверка':''));a.href=v.source;row.insertCell().append(a)}
    wrap.append(table);passport.append(wrap);
    const exp=node('button','Скачать финансовый паспорт CSV');exp.type='button';exp.onclick=()=>csv('bank-passport-'+r.registration_number+'.csv',[['Регистрационный номер','Банк','Показатель','Тыс. руб.','Период','Форма','Источник','SHA-256','Проверка','Отпечаток манифеста'],...values.map(v=>[r.registration_number,r.name,v.label,v.value,v.period,v.form,v.source,v.sha256,v.verification,manifest.data_fingerprint])]);passport.append(exp);
   }
   passport.append(node('h4','Доступность форм отчётности'));
   const coverageWrap=node('div','');coverageWrap.className='table-scroll';
   const coverageTable=node('table',''),coverageHead=coverageTable.createTHead().insertRow(),coverageBody=coverageTable.createTBody();
   for(const label of ['Форма','Период','Статус','Последняя попытка','Причина']){const th=node('th',label);th.scope='col';coverageHead.append(th)}
   for(const c of BankDirectory.coverage(r.registration_number,feeds)){const row=coverageBody.insertRow();for(const value of [c.form,c.period,c.status,c.checked,c.error])row.insertCell().textContent=value??'—';}
   coverageWrap.append(coverageTable);passport.append(coverageWrap);
   passport.append(node('p','Периоды и определения показателей различаются; капитал формы 808 не равен бухгалтерским собственным средствам. Прибыль за квартал не годовая.'));
   const share=new URL(location.href);share.searchParams.set('bank',r.registration_number);const link=node('a','Ссылка на карточку');link.href=share.href;passport.append(link);
   for(const [label,url] of [['Полный перечень ЦБ',b.source],['Системно значимые организации',a.source],['Официальная отчётность','https://www.cbr.ru/banking_sector/otchetnost-kreditnykh-organizaciy/']]){const link=node('a',label);link.href=url;passport.append(node('p',''),link)}
  }
  function draw(){
   selected=null;passport.replaceChildren();const rows=BankDirectory.rows(data,mode.value,license.value,query.value);page=Math.max(0,Math.min(page,Math.ceil(rows.length/size)-1));
   count.textContent='Записей: '+rows.length+' · показано '+(rows.length?page*size+1:0)+'–'+Math.min(rows.length,(page+1)*size)+'.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();for(const label of ['Организация','Рег. номер','ОГРН','Лицензия','Системная значимость']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of rows.slice(page*size,(page+1)*size)){const tr=body.insertRow(),btn=node('button',r.name);btn.type='button';btn.className='rm-region-link';btn.onclick=()=>detail(r);tr.insertCell().append(btn);for(const v of [r.registration_number,r.ogrn,r.license_status,r.system===true?'Да':r.system===false?'Нет в перечне':'—'])tr.insertCell().textContent=v??'—'}
   host.replaceChildren(t);prev.disabled=page===0;next.disabled=(page+1)*size>=rows.length;exp.disabled=!rows.length;
   exp.onclick=()=>csv('bank-directory.csv',[['Название','Регистрационный номер','ОГРН','Вид','Оргформа','Дата регистрации','Статус лицензии','Дата полного списка','Системная значимость','Дата перечня','Строка полного списка','Строка перечня','Источник полного списка','SHA-256 полного списка','Источник перечня','SHA-256 перечня','SHA-256 JSON','Отпечаток манифеста'],...rows.map(r=>[r.name,r.registration_number,r.ogrn,r.kind,r.legal_form,r.registered,r.license_status,b.edition,r.system,a.edition,r.fullRow,r.systemRow,b.source,b.sha256,a.source,a.sha256,entry.sha256,manifest.data_fingerprint])]);
  }
  for(const el of [mode,license])el.onchange=()=>{page=0;draw()};query.oninput=()=>{page=0;draw()};prev.onclick=()=>{page--;draw()};next.onclick=()=>{page++;draw()};draw();
  const reg=new URLSearchParams(location.search).get('bank');
  if(reg&&/^\d{1,6}$/.test(reg)){const r=BankDirectory.rows(data,'full','','').find(v=>v.registration_number===reg);if(r){mode.value='full';query.value=reg;draw();detail(r)}}
  const settled=await Promise.allSettled([['capital','bank-capital.json'],['balance','bank-balance.json'],['profit','bank-profit.json']].map(async([key,file])=>[key,(await Provenance.get(manifest,file,root)).data]));
  feeds=Object.fromEntries(settled.filter(x=>x.status==='fulfilled').map(x=>x.value));if(selected)detail(selected);
  const coverageHost=$('bank-coverage-table'),coverageStatus=$('bank-coverage-status'),coverageExport=$('bank-coverage-export');
  if(coverageHost&&coverageStatus&&coverageExport){
   const c=BankDirectory.coverageSummary(feeds),fmt=n=>n===null?'—':n.toLocaleString('ru'),pct=(n,d)=>n===null||!d?'—':(100*n/d).toLocaleString('ru',{maximumFractionDigits:2})+' %';
   coverageStatus.textContent=c.commonTarget===null?'Общая выборка не подтверждена: не все целевые перечни доступны.':'Все три формы проверены для '+fmt(c.allVerified)+' из '+fmt(c.commonTarget)+' банков общей целевой выборки. Отчётные периоды различаются.';
   const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
   for(const label of ['Форма','Период','Целевая выборка','Проверено HTML','Документальная сверка','Не подтверждено','Ожидают проверки','Вне выборки','Охват HTML']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of c.forms){const tr=body.insertRow();for(const v of [r.form+' · '+r.label,r.period??'—',fmt(r.target),fmt(r.verified),fmt(r.documentary),fmt(r.failed),fmt(r.pending),fmt(r.outside),pct(r.verified,r.target)])tr.insertCell().textContent=v;}
   coverageHost.replaceChildren(table);
   const distributionHost=$('bank-common-distribution');
   if(distributionHost){
    distributionHost.replaceChildren();
    if(c.distribution===null)distributionHost.append(node('p','Распределение недоступно: общий состав не установлен.'));
    else{
     const title=node('h3','Число проверенных форм у банков общей выборки');
     const grid=node('div','');grid.className='metrics';
     for(let i=0;i<4;i++){const card=node('div','');card.className='metric';card.append(node('b',fmt(c.distribution[i])),node('span',i+' из 3 форм · '+pct(c.distribution[i],c.commonTarget)));grid.append(card)}
     distributionHost.append(title,grid,node('p','Учитываются только подтверждённые HTML-формы; документальная сверка отдельно. Не оценка финансовой устойчивости.'));
    }
   }
   coverageExport.disabled=!c.forms.some(r=>r.target!==null);
   coverageExport.onclick=()=>csv('bank-report-coverage.csv',[['Форма','Период','Целевая выборка','Проверено HTML','Документальная сверка','Не подтверждено','Ожидают проверки','Вне выборки','Общая целевая выборка','Все три формы проверены','Отпечаток манифеста'],...c.forms.map(r=>[r.form,r.period,r.target,r.verified,r.documentary,r.failed,r.pending,r.outside,c.commonTarget,c.allVerified,manifest.data_fingerprint])]);
  }
  const failed=settled.filter(x=>x.status==='rejected').length;if(failed)status.textContent+=' · Недоступно финансовых наборов: '+failed+' из 3.';
 }catch(e){status.textContent='Каталог недоступен: '+String(e.message||e)}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const status=document.getElementById('company-source-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'company-sources.json',root)).data;
  const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const label of ['Набор','Отчётный год','Выпуск','Последняя проверка','Структура XML','Источник']){const th=node('th',label);th.scope='col';h.append(th)}
  for(const r of d.rows){const tr=b.insertRow();for(const v of [r.kind==='income_expense'?'Доходы и расходы':'Среднесписочная численность',r.report_year,r.release,r.checked,r.schema_verified?'XSD проверен · полей '+r.attributes.length:'Не подтверждена'])tr.insertCell().textContent=v??'—';
   const td=tr.insertCell();for(const [label,url] of [['Паспорт',r.catalog],['ZIP',r.archive],['XSD',r.schema]])if(url){const a=node('a',label);a.href=url;td.append(a,document.createTextNode(' '))}
   if(r.error)td.append(node('p',r.error));
  }
  document.getElementById('company-source-table').replaceChildren(t);
  status.textContent='Паспортов: '+d.rows.filter(r=>r.archive).length+' / '+d.rows.length+' · схем: '+d.rows.filter(r=>r.schema_verified).length+' / '+d.rows.length+'. Числовые наблюдения не импортированы.';
 }catch(e){status.textContent='Протокол недоступен: '+String(e.message||e)}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('company-rank-status');if(!status)return;
 const pick=$('company-rank-kind'),query=$('company-rank-query'),prev=$('company-rank-prev'),next=$('company-rank-next'),exp=$('company-rank-export'),host=$('company-rank-table'),chart=$('company-rank-chart'),detail=$('company-rank-detail');
 const money=s=>{if(s==null)return '—';const n=BigInt(s),a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')};
 const rub=s=>s==null?null:(BigInt(s)<0n?'-':'')+((BigInt(s)<0n?-BigInt(s):BigInt(s))/100n).toString()+'.'+((BigInt(s)<0n?-BigInt(s):BigInt(s))%100n).toString().padStart(2,'0');
 const textNum=n=>Number.isFinite(n)?n.toLocaleString('ru'):'—';
 let page=0;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(m,'company-rankings.json',root),d=entry.data,r=d.report;
  if(!r){status.textContent='Полные архивы ещё не импортированы. '+(d.error||'');return}
  status.textContent='Отчётный год '+r.year+' · '+(d.status==='cached'?'сохранённая редакция':'импортировано')+' · дата импорта '+d.success+'. '+(d.error||'');
  const sources=Object.fromEntries(r.sources.map(s=>[s.kind,s]));
  const a=sources.income_expense,b=sources.employment,labels={income:'Доходы',expense:'Расходы',employment:'Среднесписочная численность'};
  for(const [label,v] of [['Финансовых записей',a.unique],['Записей занятости',b.unique],['Совпали по ИНН',r.paired]]){const c=node('div','');c.className='metric';c.append(node('b',textNum(v)),node('span',label));$('company-rank-metrics').append(c)}
  function show(v){detail.replaceChildren(node('h3',v.name),node('p','ИНН '+v.inn+' · год '+r.year),node('p','Доходы: '+money(v.income_cents)+' руб. · расходы: '+money(v.expense_cents)+' руб. · работники: '+textNum(v.workers)),node('p','Наименование в финансовом источнике: '+(v.income_name||'—')+'; в источнике занятости: '+(v.employment_name||'—')),node('p','Регистрация, ОКВЭД, продукция и текущий статус деятельности ещё не подтверждены.'));
   const add=node('button','Добавить к сравнению');add.type='button';add.onclick=()=>{const input=$('company-compare-ids');if(!input)return;const ids=input.value.trim().split(/[\s,;]+/).filter(Boolean);if(!ids.includes(v.inn))ids.push(v.inn);input.value=ids.join('\n');$('company-compare').scrollIntoView({block:'start'});input.focus()};detail.append(add);
   for(const [label,s,member,doc] of [['Финансы',a,v.income_member,v.income_doc],['Занятость',b,v.employment_member,v.employment_doc]])if(member){const link=node('a',label+' · ZIP ФНС');link.href=s.source;detail.append(node('p',member+' · документ '+doc),link)}
  }
  function draw(){
   const x=r.rankings[pick.value],q=query.value.trim().toLocaleLowerCase('ru'),rows=x.rows.filter(v=>!q||[v.name,v.inn,v.income_name,v.employment_name].some(z=>String(z||'').toLocaleLowerCase('ru').includes(q)));
   page=Math.max(0,Math.min(page,Math.ceil(rows.length/50)-1));detail.replaceChildren();
   $('company-rank-count').textContent=labels[pick.value]+' · числовых наблюдений в архиве '+textNum(x.eligible)+' · в рейтинге '+x.rows.length+' · найдено '+rows.length+' · места сохраняются при фильтрации.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();for(const label of ['Место','Организация','ИНН','Доходы, руб.','Расходы, руб.','Работники']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const v of rows.slice(page*50,(page+1)*50)){const tr=body.insertRow();tr.insertCell().textContent=v.rank;const btn=node('button',v.name);btn.type='button';btn.className='rm-region-link';btn.onclick=()=>show(v);tr.insertCell().append(btn);for(const z of [v.inn,money(v.income_cents),money(v.expense_cents),textNum(v.workers)])tr.insertCell().textContent=z}
   host.replaceChildren(t);prev.disabled=page===0;next.disabled=(page+1)*50>=rows.length;exp.disabled=!rows.length;
   chart.replaceChildren(node('p','Первые десять положительных значений текущей выборки. Шкала относительно максимума, не доля экономики.'));
   const val=v=>pick.value==='employment'?v.workers:Number(v[pick.value+'_cents']),top=rows.filter(v=>val(v)>0).slice(0,10),max=Math.max(1,...top.map(val)),bars=node('div','');bars.className='rm-composition';
   for(const v of top){const line=node('div','');line.className='rm-composition-row';const track=node('div','');track.className='rm-composition-track';const fill=node('div','');fill.className='rm-composition-fill';fill.style.width=100*val(v)/max+'%';track.append(fill);line.append(node('span',v.name),track,node('strong',pick.value==='employment'?textNum(v.workers):money(v[pick.value+'_cents'])));bars.append(line)}chart.append(bars);
   exp.onclick=()=>csv('company-ranking-'+pick.value+'-'+r.year+'.csv',[['Год','Критерий','Место','ИНН','Организация','Доходы, руб.','Расходы, руб.','Работники','Название в финансовом наборе','Название в наборе занятости','XML финансов','Документ финансов','XML занятости','Документ занятости','Источник финансов','SHA-256 ZIP финансов','Источник занятости','SHA-256 ZIP занятости','SHA-256 JSON','Отпечаток манифеста'],...rows.map(v=>[r.year,pick.value,v.rank,v.inn,v.name,rub(v.income_cents),rub(v.expense_cents),v.workers,v.income_name,v.employment_name,v.income_member,v.income_doc,v.employment_member,v.employment_doc,a.source,a.sha256,b.source,b.sha256,entry.sha256,m.data_fingerprint])]);
  }
  pick.onchange=query.oninput=()=>{page=0;draw()};prev.onclick=()=>{page--;draw()};next.onclick=()=>{page++;draw()};draw();
 }catch(e){status.textContent='Рейтинг недоступен: '+String(e.message||e)}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('bank-disclosure-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),e=await Provenance.get(m,'bank-disclosure.json',root),d=e.data;
  const forms=['101','102','123','135'],verified=d.rows.reduce((n,r)=>n+forms.filter(k=>r.forms[k]?.status==='ok').length,0);
  status.textContent='Проверено форм: '+verified+' из '+(d.rows.length*4)+' · дата данных '+(d.checked||'—')+' · редакция перечня '+(d.edition||'—')+' · '+({ok:'проверено',partial:'частично',cached:'сохранённая редакция',unavailable:'недоступно',not_loaded:'не загружено'}[d.status]||d.status)+(d.last_attempt?' · последняя неуспешная попытка '+d.last_attempt:'');
  const common=$('bank-disclosure-common');common.replaceChildren();
  for(const k of forms){const dates=BankDirectory.commonDates(d,k),card=node('div','');card.className='metric';card.append(node('b',dates===null?'—':dates[0]||'Нет общей даты'),node('span','Форма '+k+' · '+(dates===null?'не все ответы подтверждены':dates.length+' общих периодов пилота')));common.append(card)}
  const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
  for(const x of ['Банк / рег. номер',...forms.map(k=>'Форма '+k)]){const th=node('th',x);th.scope='col';h.append(th)}
  for(const r of d.rows){const tr=body.insertRow();tr.insertCell().textContent=r.name+' · '+r.registration_number;
   for(const k of forms){const x=r.forms[k],td=tr.insertCell();if(x?.status==='ok'){td.textContent=x.dates.length?'Последняя дата '+x.dates[0]+' · периодов '+x.dates.length:'Сервис вернул пустой список';if(x.dates.length){const details=node('details',''),summary=node('summary','Все даты');details.append(summary,node('p',x.dates.join(', ')));td.append(details)}}else td.textContent='Не проверено: '+(x?.error||r.error||'нет ответа')}
  }
  $('bank-disclosure-table').replaceChildren(table);const exp=$('bank-disclosure-export');exp.disabled=!d.rows.length;
  exp.onclick=()=>csv('bank-disclosure.csv',[['Рег. номер','Банк','Внутренний код ЦБ','SHA-256 сопоставления','Форма','Дата отчёта','Статус','Причина','Дата проверки','Редакция перечня','SHA-256 ответа','Источник','Отпечаток манифеста'],...d.rows.flatMap(r=>forms.flatMap(k=>{const x=r.forms[k];return (x?.dates?.length?x.dates:['']).map(v=>[r.registration_number,r.name,r.internal_code,r.mapping_sha256,k,v,x?.status||'unavailable',x?.error||r.error,d.checked,d.edition,x?.sha256,d.source,m.data_fingerprint])}))]);
 }catch(e){status.textContent='Данные раскрытия недоступны: '+String(e.message||e)}
});
