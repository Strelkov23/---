
const CompanyLookup=(()=>{
 const columns=['inn','income_name','employment_name','income_cents','expense_cents','workers','income_member','income_doc','employment_member','employment_doc'];
 function validInn(s){return /^\d{10}$/.test(s)&&[2,4,10,3,5,9,4,6,8].reduce((a,w,i)=>a+w*Number(s[i]),0)%11%10===Number(s[9])}
 function path(s){if(!validInn(s))throw Error('Неверный контрольный разряд ИНН');return 'company-index/inn-'+String(Number(s)%512).padStart(3,'0')+'.json.gz'}
 function row(rows,inn){const found=rows.filter(r=>Array.isArray(r)&&r[0]===inn);if(found.length>1)throw Error('Повтор ИНН');if(!found.length)return null;if(found[0].length!==columns.length)throw Error('Некорректная строка');return Object.fromEntries(columns.map((k,i)=>[k,found[0][i]]))}
 async function lookup(index,inn,base='',fetcher=fetch){
  const name=path(inn),e=index.files[name];
  if(index.status!=='ready'||index.buckets!==512||JSON.stringify(index.columns)!==JSON.stringify(columns)||!e||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes>8*1024*1024)throw Error('Полный индекс недоступен');
  const res=await fetcher(base+name,{cache:'no-cache'});if(!res.ok)throw Error('Блок недоступен');
  const bytes=await res.arrayBuffer();
  if(bytes.byteLength!==e.bytes||await Provenance.digest(bytes)!==e.sha256)throw Error('Контрольная сумма блока не совпадает');
  if(typeof DecompressionStream==='undefined')throw Error('Браузер не поддерживает распаковку gzip');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),text=await new Response(stream).text(),rows=JSON.parse(text);
  if(!Array.isArray(rows)||rows.length!==e.count)throw Error('Число записей блока не совпадает');
  return row(rows,inn);
 }
 return {validInn,path,row,lookup};
})();
if(typeof module!=='undefined')module.exports=CompanyLookup;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('company-lookup-form');if(!form)return;
 const status=$('company-lookup-status'),result=$('company-lookup-result'),input=$('company-lookup-inn'),button=$('company-lookup-submit'),exp=$('company-lookup-export');
 let serial=0;
 const money=s=>{if(s==null)return '—';const n=BigInt(s),a=n<0n?-n:n;return (n<0n?'−':'')+(a/100n).toLocaleString('ru')+','+(a%100n).toString().padStart(2,'0')};
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),index=(await Provenance.get(m,'company-index.json',root)).data,rank=(await Provenance.get(m,'company-rankings.json',root)).data;
  const full=index.status==='ready';status.textContent=full?'Полный индекс доступных открытых архивов: '+index.count.toLocaleString('ru')+' ИНН, '+index.year+' год.':'Полный индекс ещё не развёрнут. Сейчас поиск только по опубликованным рейтингам (до 1500 позиций, с пересечениями).';
  button.disabled=false;
  form.onsubmit=async e=>{
   e.preventDefault();const token=++serial,inn=input.value.trim();result.replaceChildren();exp.disabled=true;
   if(!CompanyLookup.validInn(inn)){result.append(node('p','Введите корректный десятизначный ИНН юридического лица.'));return}
   button.disabled=true;result.append(node('p','Проверка…'));
   try{
    const r=full?await CompanyLookup.lookup(index,inn,root):Object.values(rank.report?.rankings||{}).flatMap(x=>x.rows).find(x=>x.inn===inn);
    if(token!==serial)return;
    result.replaceChildren();
    if(!r){result.append(node('p',full?'ИНН не найден в двух открытых наборах данного года. Это не означает, что организация не существует.':'ИНН не найден в опубликованных рейтингах. Полный поиск пока недоступен.'));return}
    const year=full?index.year:rank.report.year,name=r.income_name||r.employment_name||r.name;
    result.append(node('h3',name),node('p','ИНН '+inn+' · отчётный '+year+' год'),node('p','Доходы: '+money(r.income_cents)+' руб. · расходы: '+money(r.expense_cents)+' руб. · среднесписочная численность: '+(r.workers??'—')),node('p','Юридический статус, отрасль и фактическое производство не подтверждены этими наборами.'));
    if(r.income_name&&r.employment_name&&r.income_name!==r.employment_name)result.append(node('p','В источнике занятости: '+r.employment_name+'; различие названий сохранено.'));
    const sources=Object.fromEntries((full?index.sources:rank.report.sources).map(s=>[s.kind,s]));
    const member=(kind,v)=>full&&v!=null?index.members[kind][v]:v;
    const im=member('income',r.income_member),em=member('employment',r.employment_member);
    for(const [kind,file,doc] of [['income_expense',im,r.income_doc],['employment',em,r.employment_doc]])if(file){const a=node('a',kind==='income_expense'?'Архив доходов и расходов':'Архив занятости');a.href=sources[kind].source;result.append(node('p',file+' · документ '+doc),a)}
    exp.disabled=false;exp.onclick=()=>csv('company-'+inn+'-'+year+'.csv',[['ИНН','Отчётный год','Название доходов','Название занятости','Доходы, копейки','Расходы, копейки','Работники','XML финансов','Документ финансов','XML занятости','Документ занятости','Источник финансов','SHA-256 архива финансов','Источник занятости','SHA-256 архива занятости','Отпечаток манифеста','Область поиска'],[inn,year,r.income_name,r.employment_name,r.income_cents,r.expense_cents,r.workers,im,r.income_doc,em,r.employment_doc,sources.income_expense.source,sources.income_expense.sha256,sources.employment.source,sources.employment.sha256,m.data_fingerprint,full?'Полные архивы':'Рейтинги']]);
   }catch(err){if(token===serial)result.replaceChildren(node('p','Поиск недоступен: '+String(err.message||err)))}finally{if(token===serial)button.disabled=false}
  }
 }catch(e){status.textContent='Индекс недоступен: '+String(e.message||e)}
});
