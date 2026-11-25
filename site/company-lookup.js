
const CompanyLookup=(()=>{
 const columns=['inn','income_name','employment_name','income_cents','expense_cents','workers','income_member','income_doc','employment_member','employment_doc'];
 function validInn(s){return /^\d{10}$/.test(s)&&[2,4,10,3,5,9,4,6,8].reduce((a,w,i)=>a+w*Number(s[i]),0)%11%10===Number(s[9])}
 function path(s){if(!validInn(s))throw Error('Неверный контрольный разряд ИНН');return 'company-index/inn-'+String(Number(s)%512).padStart(3,'0')+'.json.gz'}
 function row(rows,inn){const found=rows.filter(r=>Array.isArray(r)&&r[0]===inn);if(found.length>1)throw Error('Повтор ИНН');if(!found.length)return null;if(found[0].length!==columns.length)throw Error('Некорректная строка');return Object.fromEntries(columns.map((k,i)=>[k,found[0][i]]))}
 function rankMatches(report,inn){
  if(!validInn(inn))throw Error('Неверный ИНН');
  const matches={};let record=null;
  for(const kind of ['income','expense','employment']){
   const list=report?.rankings?.[kind];if(!list)continue;
   const rows=list.rows.filter(r=>r.inn===inn);
   if(rows.length>1)throw Error('Повтор ИНН в рейтинге');
   if(!rows.length)continue;
   const r=rows[0];
   if(!Number.isSafeInteger(r.rank)||r.rank<1||r.rank>list.rows.length||!Number.isSafeInteger(list.eligible)||list.eligible<list.rows.length)throw Error('Некорректная позиция рейтинга');
   if(record&&columns.some(k=>record[k]!==r[k]))throw Error('Несогласованные данные рейтингов');
   record=r;matches[kind]={rank:r.rank,eligible:list.eligible};
  }
  return {record,matches};
 }
 function validateBlock(rows,index,name){
  const e=index.files[name];
  if(!Array.isArray(rows)||rows.length!==e.count)throw Error('Число записей блока не совпадает');
  let previous='';
  for(const r of rows){
   if(!Array.isArray(r)||r.length!==columns.length||!validInn(r[0])||path(r[0])!==name||r[0]<=previous)throw Error('Некорректный порядок или ИНН блока');
   previous=r[0];
   for(const k of [3,4])if(r[k]!==null&&(typeof r[k]!=='string'||! /^-?\d+$/.test(r[k])))throw Error('Некорректная денежная величина');
   if(r[5]!==null&&(!Number.isSafeInteger(r[5])||r[5]<0))throw Error('Некорректная численность');
   for(const [np,mp,dp,kind] of [[1,6,7,'income'],[2,8,9,'employment']]){
    if(r[mp]===null){if(r[np]!==null||r[dp]!==null)throw Error('Неполная ссылка на источник');}
    else if(typeof r[np]!=='string'||!r[np]||!Array.isArray(index.members?.[kind])||!Number.isInteger(r[mp])||r[mp]<0||r[mp]>=index.members[kind].length||!Number.isSafeInteger(r[dp])||r[dp]<1)throw Error('Некорректная ссылка на источник');
   }
   if(r[6]===null&&(r[3]!==null||r[4]!==null)||r[8]===null&&r[5]!==null)throw Error('Значение без источника');
  }
  return rows;
 }
 async function lookup(index,inn,base='',fetcher=fetch){
  const name=path(inn),e=index.files[name];
  if(index.status!=='ready'||index.buckets!==512||JSON.stringify(index.columns)!==JSON.stringify(columns)||!e||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>8*1024*1024||!Number.isSafeInteger(e.count)||e.count<0)throw Error('Полный индекс недоступен');
  const res=await fetcher(base+name,{cache:'no-cache'});if(!res.ok)throw Error('Блок недоступен');
  const bytes=await res.arrayBuffer();
  if(bytes.byteLength!==e.bytes||await Provenance.digest(bytes)!==e.sha256)throw Error('Контрольная сумма блока не совпадает');
  if(typeof DecompressionStream==='undefined')throw Error('Браузер не поддерживает распаковку gzip');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),text=await new Response(stream).text(),rows=JSON.parse(text);
  return row(validateBlock(rows,index,name),inn);
 }
 function parseSelection(value){
  const ids=[...new Set(String(value).trim().split(/[\s,;]+/).filter(Boolean))];
  if(ids.length<2||ids.length>5||ids.some(id=>!validInn(id)))throw Error('Укажите от 2 до 5 разных корректных десятизначных ИНН.');
  return ids;
 }
 function divideRounded(n,d){if(d<=0n)throw Error('Неположительный знаменатель');const a=n<0n?-n:n;return (n<0n?-1n:1n)*((a+d/2n)/d);}
 function calculate(r){
  const inc=r.income_cents==null?null:BigInt(r.income_cents),exp=r.expense_cents==null?null:BigInt(r.expense_cents);
  const workers=Number.isSafeInteger(r.workers)&&r.workers>0?BigInt(r.workers):null;
  const diff=inc===null||exp===null?null:inc-exp;
  return {difference:diff?.toString()??null,incomePerWorker:inc===null||inc<0n||workers===null?null:divideRounded(inc,workers).toString(),expenseShare:inc===null||inc<=0n||exp===null||exp<0n?null:divideRounded(exp*10000n,inc).toString()};
 }
 function barWidths(records,key){
  const values=records.map(r=>r&&r[key]!=null?BigInt(r[key]):null);
  const max=values.reduce((a,v)=>v!==null&&v>a?v:a,0n);
  return values.map(v=>v===null||v<0n||max===0n?null:Number(v*10000n/max)/100);
 }
 function coverage(report){
  if(!report||report.mode!=='full')return null;
  const a=report.sources.find(s=>s.kind==='income_expense'),b=report.sources.find(s=>s.kind==='employment'),p=report.paired;
  if(!a||!b||!a.complete||!b.complete||a.year!==report.year||b.year!==report.year||[a.unique,b.unique,p].some(x=>!Number.isSafeInteger(x)||x<0)||p>Math.min(a.unique,b.unique))throw Error('Некорректный охват');
  const total=a.unique+b.unique-p;
  return {total,paired:p,incomeOnly:a.unique-p,employmentOnly:b.unique-p,income:a.unique,employment:b.unique};
 }
 return {validInn,path,row,rankMatches,validateBlock,lookup,parseSelection,calculate,barWidths,coverage};
})();
if(typeof module!=='undefined')module.exports=CompanyLookup;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('company-lookup-form');if(!form)return;
 const status=$('company-lookup-status'),result=$('company-lookup-result'),input=$('company-lookup-inn'),button=$('company-lookup-submit'),exp=$('company-lookup-export');
 let serial=0;
 const money=s=>{if(s==null)return '—';const n=BigInt(s),a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')};
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),index=(await Provenance.get(m,'company-index.json',root)).data,rank=(await Provenance.get(m,'company-rankings.json',root)).data;
  const full=index.status==='ready',rankReady=!!rank.report;const unique=new Set(Object.values(rank.report?.rankings||{}).flatMap(x=>x.rows.map(r=>r.inn))).size;
  status.textContent=full?'Полный индекс двух открытых архивов: '+index.count.toLocaleString('ru')+' ИНН, '+index.year+' год.':rankReady?'Поиск по опубликованным рейтингам: '+unique.toLocaleString('ru')+' уникальных ИНН, '+rank.report.year+' год. Полный индекс пока не развёрнут.':'Данные для поиска пока не опубликованы. Ни отсутствие результата, ни пустая база не означают отсутствие организации.';
  if(!full&&rank.index_error)status.textContent+=' Причина последней попытки: '+rank.index_error;
  button.disabled=!(full||rankReady);
  form.onsubmit=async e=>{
   e.preventDefault();const token=++serial,inn=input.value.trim();result.replaceChildren();exp.disabled=true;
   if(!CompanyLookup.validInn(inn)){result.append(node('p','Введите корректный десятизначный ИНН юридического лица.'));return}
   button.disabled=true;result.append(node('p','Проверка…'));
   try{
    const ranking=CompanyLookup.rankMatches(full&&rank.report?.year!==index.year?null:rank.report,inn);
    const r=full?await CompanyLookup.lookup(index,inn,root):ranking.record;
    if(token!==serial)return;
    result.replaceChildren();
    if(!r){result.append(node('p',full?'ИНН не найден в двух открытых наборах данного года. Это не означает, что организация не существует.':'ИНН не найден в опубликованных рейтингах. Полный поиск пока недоступен.'));return}
    const year=full?index.year:rank.report.year,name=r.income_name||r.employment_name||r.name;
    const official=node('a','Проверить юридический статус в ЕГРЮЛ');official.href='https://egrul.nalog.ru/';
    result.append(node('h3',name),node('p','ИНН '+inn+' · отчётный '+year+' год'),node('p','Доходы: '+money(r.income_cents)+' руб. · расходы: '+money(r.expense_cents)+' руб. · среднесписочная численность: '+(r.workers??'—')),node('p','Юридический статус, отрасль и фактическое производство не подтверждены этими наборами.'));
    result.append(official);
    const labels={income:'Доходы',expense:'Расходы',employment:'Численность'};
    const ranks=Object.entries(ranking.matches);
    if(ranks.length){const list=node('ul');for(const [k,v] of ranks)list.append(node('li',labels[k]+': место '+v.rank.toLocaleString('ru')+' из '+v.eligible.toLocaleString('ru')+' организаций с наблюдением'));result.append(node('h4','Позиции в опубликованных рейтингах'),list,node('p','Рейтинг относится к отчётному году и охвату открытого набора, а не ко всем зарегистрированным организациям.'));}
    else result.append(node('p','В опубликованных первых 500 по трём показателям организация не найдена; точное место не рассчитано.'));
    const link=new URL(location.href);link.searchParams.set('inn',inn);const share=node('a','Постоянная ссылка на поиск этого ИНН');share.href=link.href;result.append(share);const add=node('button','Добавить к сравнению');add.type='button';add.onclick=()=>{const target=$('company-compare-ids');const ids=target.value.trim().split(/[\s,;]+/).filter(Boolean);if(!ids.includes(inn))ids.push(inn);target.value=ids.join('\n');$('company-compare').scrollIntoView({block:'start'});target.focus();};result.append(node('p',''),add);
    if(r.income_name&&r.employment_name&&r.income_name!==r.employment_name)result.append(node('p','В источнике занятости: '+r.employment_name+'; различие названий сохранено.'));
    const sources=Object.fromEntries((full?index.sources:rank.report.sources).map(s=>[s.kind,s]));
    const member=(kind,v)=>full&&v!=null?index.members[kind][v]:v;
    const im=member('income',r.income_member),em=member('employment',r.employment_member);
    for(const [kind,file,doc] of [['income_expense',im,r.income_doc],['employment',em,r.employment_doc]])if(file){const a=node('a',kind==='income_expense'?'Архив доходов и расходов':'Архив занятости');a.href=sources[kind].source;result.append(node('p',file+' · документ '+doc),a)}
    exp.disabled=false;exp.onclick=()=>csv('company-'+inn+'-'+year+'.csv',[['ИНН','Отчётный год','Название доходов','Название занятости','Доходы, копейки','Расходы, копейки','Работники','XML финансов','Документ финансов','XML занятости','Документ занятости','Источник финансов','SHA-256 архива финансов','Источник занятости','SHA-256 архива занятости','Отпечаток манифеста','Область поиска','Место по доходам','Охват по доходам','Место по расходам','Охват по расходам','Место по численности','Охват по численности'],[inn,year,r.income_name,r.employment_name,r.income_cents,r.expense_cents,r.workers,im,r.income_doc,em,r.employment_doc,sources.income_expense.source,sources.income_expense.sha256,sources.employment.source,sources.employment.sha256,m.data_fingerprint,full?'Полные архивы':'Рейтинги',...['income','expense','employment'].flatMap(k=>[ranking.matches[k]?.rank??'',ranking.matches[k]?.eligible??''])]]);
   }catch(err){if(token===serial)result.replaceChildren(node('p','Поиск недоступен: '+String(err.message||err)))}finally{if(token===serial)button.disabled=false}
  };
  const requested=new URLSearchParams(location.search).get('inn');if(requested&&CompanyLookup.validInn(requested)){input.value=requested;if(full||rankReady)form.requestSubmit();}
 }catch(e){status.textContent='Индекс недоступен: '+String(e.message||e)}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('company-compare-form');if(!form)return;
 const status=$('company-compare-status'),input=$('company-compare-ids'),submit=$('company-compare-submit'),out=$('company-compare-table'),chart=$('company-compare-chart'),exportButton=$('company-compare-export'),metric=$('company-compare-metric'),share=$('company-compare-link');
 const fixed=(s,unit='')=>{if(s==null)return '—';const n=BigInt(s),a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')+unit};
 const descriptors={income_cents:'Доходы, руб.',expense_cents:'Расходы, руб.',workers:'Среднесписочная численность, чел.'};
 let serial=0,last=[];
 const label=r=>r.income_name||r.employment_name||r.name||r.inn;
 function drawChart(){
  chart.replaceChildren();if(!last.length)return;
  const key=metric.value,widths=CompanyLookup.barWidths(last.map(x=>x.record),key);
  chart.append(node('h3',descriptors[key]),node('p','Длина полосы относительно максимального положительного значения в выбранной группе. Отрицательные значения и пропуски не отображаются полосой.'));
  const bars=node('div','');bars.className='rm-composition';
  last.forEach((x,i)=>{if(!x.record)return;const v=x.record[key],line=node('div','');line.className='rm-composition-row';const track=node('div','');track.className='rm-composition-track';const fill=node('div','');fill.className='rm-composition-fill';fill.style.width=(widths[i]??0)+'%';track.append(fill);line.append(node('span',label(x.record)),track,node('strong',key==='workers'?(v??'—'):fixed(v)));bars.append(line)});chart.append(bars);
 }
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const [a,b]=await Promise.all(['company-index.json','company-rankings.json'].map(n=>Provenance.get(manifest,n,root)));
  const index=a.data,rank=b.data,full=index.status==='ready',report=rank.report;
  if(!full&&!report){status.textContent='Данные ФНС пока не опубликованы.';return}
  const year=full?index.year:report.year,scope=full?'Полные два архива ФНС':'Опубликованные рейтинги ФНС';
  const sources=Object.fromEntries((full?index.sources:report.sources).map(x=>[x.kind,x]));
  status.textContent='Отчётный '+year+' год · '+scope;submit.disabled=false;
  metric.onchange=drawChart;
  form.onsubmit=async e=>{
   e.preventDefault();const token=++serial;out.replaceChildren();chart.replaceChildren();last=[];exportButton.disabled=true;share.hidden=true;
   let ids;try{ids=CompanyLookup.parseSelection(input.value)}catch(e){status.textContent=e.message;return}
   submit.disabled=true;status.textContent='Проверка записей за '+year+' год…';
   try{
    const result=await Promise.all(ids.map(async inn=>{
     try{const record=full?await CompanyLookup.lookup(index,inn,root):CompanyLookup.rankMatches(report,inn).record;return {inn,record,error:record?'':'Не найдено в области поиска'}}
     catch(e){return {inn,record:null,error:'Ошибка проверки: '+String(e.message||e)}}
    }));
    if(token!==serial)return;
    last=result;
    const table=node('table',''),header=table.createTHead().insertRow(),body=table.createTBody();
    for(const v of ['Организация / ИНН','Доходы, руб.','Расходы, руб.','Численность, чел.','Доходы минус расходы, руб.','Доходы на работника, руб.','Расходы / доходы, %','Статус']){const th=node('th',v);th.scope='col';header.append(th)}
    for(const x of result){
     const tr=body.insertRow(),r=x.record,calc=r?CompanyLookup.calculate(r):{};
     const a=node('a',r?label(r)+' · '+x.inn:x.inn);const url=new URL(location.href);url.searchParams.set('inn',x.inn);url.hash='company-lookup';a.href=url.href;tr.insertCell().append(a);
     for(const v of [fixed(r?.income_cents),fixed(r?.expense_cents),r?.workers??'—',fixed(calc.difference),fixed(calc.incomePerWorker),fixed(calc.expenseShare),x.error||'Наблюдение найдено'])tr.insertCell().textContent=v;
    }
    out.replaceChildren(table);const found=result.filter(x=>x.record).length;
    status.textContent=year+' год · '+scope+' · найдено '+found+' из '+ids.length+'. Пропуск не равен нулю.';
    drawChart();
    const url=new URL(location.href);url.searchParams.set('compare-inn',ids.join(','));url.hash='company-compare';share.href=url.href;share.hidden=false;
    exportButton.disabled=!found;
    exportButton.onclick=()=>csv('company-comparison-'+year+'.csv',[['ИНН','Год','Область поиска','Название в финансовом наборе','Название в наборе занятости','Доходы, копейки','Расходы, копейки','Численность','Разность, копейки','Доходы на работника, копейки','Расходы / доходы, сотые доли процента','Статус','XML финансов','Документ финансов','XML занятости','Документ занятости','URL финансов','SHA-256 финансов','URL занятости','SHA-256 занятости','Отпечаток манифеста'],...result.map(x=>{const r=x.record||{},v=CompanyLookup.calculate(r),member=(kind,n)=>full&&n!=null?index.members[kind][n]:n;return [x.inn,year,scope,r.income_name,r.employment_name,r.income_cents,r.expense_cents,r.workers,v.difference,v.incomePerWorker,v.expenseShare,x.error,member('income',r.income_member),r.income_doc,member('employment',r.employment_member),r.employment_doc,sources.income_expense.source,sources.income_expense.sha256,sources.employment.source,sources.employment.sha256,manifest.data_fingerprint]})]);
   }catch(e){if(token===serial)status.textContent='Сравнение недоступно: '+String(e.message||e)}finally{if(token===serial)submit.disabled=false}
  };
  const selected=new URLSearchParams(location.search).get('compare-inn');if(selected){input.value=selected;form.requestSubmit()}
 }catch(e){status.textContent='Источники сравнения недоступны: '+String(e.message||e)}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('company-coverage-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(m,'company-rankings.json',root),data=entry.data,r=data.report,v=CompanyLookup.coverage(r);
  if(!v){status.textContent='Полная обработка двух архивов пока не подтверждена.';return}
  const num=x=>x.toLocaleString('ru'),pct=x=>v.total?(100*x/v.total).toLocaleString('ru',{maximumFractionDigits:2})+'%':'—';
  status.textContent='Отчётный '+r.year+' год · импорт '+data.success+' · '+(data.status==='cached'?'сохранённая редакция':'проверенная редакция')+'. Это объединение открытых наборов, не ЕГРЮЛ.';
  for(const [label,n] of [['Уникальных ИНН',v.total],['В обоих наборах',v.paired],['Только доходы / расходы',v.incomeOnly],['Только занятость',v.employmentOnly]]){const card=node('div','');card.className='metric';card.append(node('b',num(n)),node('span',label));$('company-coverage-metrics').append(card)}
  const items=[['Оба набора',v.paired,'#16736b'],['Только финансовый',v.incomeOnly,'#ad6b32'],['Только занятость',v.employmentOnly,'#426d9b']];
  const bar=node('div','');bar.className='company-coverage-bar';bar.setAttribute('aria-hidden','true');
  for(const [label,n,color] of items){const part=node('span','');part.style.width=(v.total?100*n/v.total:0)+'%';part.style.backgroundColor=color;bar.append(part)}
  $('company-coverage-chart').append(bar);
  for(const [label,n,color] of items){const line=node('p',''),swatch=node('span','');swatch.className='company-coverage-swatch';swatch.style.backgroundColor=color;line.append(swatch,document.createTextNode(label+': '+num(n)+' · '+pct(n)));$('company-coverage-chart').append(line)}
  const table=node('table',''),header=table.createTHead().insertRow(),body=table.createTBody();
  for(const title of ['Набор','Документов','Уникальных ИНН','Точных дублей','Конфликтующих ИНН','Обработано XML','Архив']){const th=node('th',title);th.scope='col';header.append(th)}
  for(const x of r.sources){const tr=body.insertRow();for(const value of [x.kind==='employment'?'Занятость':'Доходы и расходы',num(x.documents),num(x.unique),num(x.exact_duplicates),num(x.conflicts),num(x.processed_members)+' / '+num(x.xml_members)])tr.insertCell().textContent=value;const a=node('a','ZIP ФНС');a.href=x.source;tr.insertCell().append(a)}
  $('company-coverage-table').replaceChildren(table);
  const btn=$('company-coverage-export');btn.disabled=false;btn.onclick=()=>csv('company-coverage-'+r.year+'.csv',[['Год','Объединение ИНН','Оба набора','Только финансы','Только занятость','Набор','Уникальных ИНН','Документов','Точных дублей','Конфликтующих ИНН','Обработано XML','Всего XML','URL ZIP','SHA-256 ZIP','Отпечаток манифеста'],...r.sources.map(x=>[r.year,v.total,v.paired,v.incomeOnly,v.employmentOnly,x.kind,x.unique,x.documents,x.exact_duplicates,x.conflicts,x.processed_members,x.xml_members,x.source,x.sha256,m.data_fingerprint])]);
 }catch(e){status.textContent='Охват не подтверждён: '+String(e.message||e)}
});
