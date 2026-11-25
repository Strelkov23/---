
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
 return {validInn,path,row,rankMatches,validateBlock,lookup};
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
    const link=new URL(location.href);link.searchParams.set('inn',inn);const share=node('a','Постоянная ссылка на поиск этого ИНН');share.href=link.href;result.append(share);
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
