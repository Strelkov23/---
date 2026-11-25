
const BankDirectory=(()=>{
 function rows(data,mode,license,query){
  const a=data.datasets.system,b=data.datasets.full,system=new Map(a.rows.map(r=>[r.registration_number,r])),full=new Map(b.rows.map(r=>[r.registration_number,r]));
  const base=mode==='system'?a.rows.map(r=>({...full.get(r.registration_number),...r,systemRow:r.source_row,fullRow:full.get(r.registration_number)?.source_row,system:true})):b.rows.map(r=>({...r,fullRow:r.source_row,systemRow:system.get(r.registration_number)?.source_row,system:a.rows.length?system.has(r.registration_number):null}));
  const q=String(query||'').trim().toLocaleLowerCase('ru');
  return base.filter(r=>(mode!=='active'||r.license_status==='Действующая')&&(!license||(license==='__unknown__'?!r.license_status:r.license_status===license))&&(!q||[r.name,r.registration_number,r.ogrn].some(v=>String(v||'').toLocaleLowerCase('ru').includes(q)))).sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.registration_number.localeCompare(b.registration_number));
 }
 return {rows};
})();
if(typeof module!=='undefined')module.exports=BankDirectory;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('bank-table');if(!host)return;
 const mode=$('bank-mode'),license=$('bank-license'),query=$('bank-query'),status=$('bank-source-status'),count=$('bank-count'),metrics=$('bank-metrics'),prev=$('bank-prev'),next=$('bank-next'),exp=$('bank-export'),passport=$('bank-passport');
 let page=0;const size=50;
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'bank-directory.json',root),data=entry.data,a=data.datasets.system,b=data.datasets.full;
  status.textContent='Системно значимые: '+(a.edition||'нет проверенной редакции')+'; полный список: '+(b.edition||'нет проверенной редакции')+' · точных повторов: '+(b.duplicate_rows?.length??0)+'. '+[a,b].map(x=>x.error||'').filter(Boolean).join(' · ');
  for(const [label,value] of [['Системно значимые',a.rows.length||'—'],['Записей полного перечня',b.rows.length||'—'],['Действующая лицензия',b.rows.length?b.rows.filter(r=>r.license_status==='Действующая').length:'—']]){const c=node('div','');c.className='metric';c.append(node('b',String(value)),node('span',label));metrics.append(c)}
  license.replaceChildren(new Option('Все',''),...[...new Set(b.rows.map(r=>r.license_status).filter(Boolean))].sort().map(v=>new Option(v,v)),new Option('Не указан','__unknown__'));
  if(!a.rows.length&&b.rows.length)mode.value='full';
  function detail(r){
   passport.replaceChildren(node('h3',r.name),node('p','Регистрационный номер: '+r.registration_number+' · ОГРН: '+(r.ogrn||'не указан')+' · статус лицензии: '+(r.license_status||'нет сопоставленной записи')+' ('+(b.edition||'—')+')'),node('p','Системная значимость: '+(r.system===true?'включён':r.system===false?'не входит в загруженный перечень':'не установлена')+' · '+(a.edition||'—')),node('p','Финансовые показатели не импортированы. Не является рейтингом.'));
   for(const [label,url] of [['Полный перечень ЦБ',b.source],['Системно значимые организации',a.source],['Официальная отчётность','https://www.cbr.ru/banking_sector/otchetnost-kreditnykh-organizaciy/']]){const link=node('a',label);link.href=url;passport.append(node('p',''),link)}
  }
  function draw(){
   passport.replaceChildren();const rows=BankDirectory.rows(data,mode.value,license.value,query.value);page=Math.max(0,Math.min(page,Math.ceil(rows.length/size)-1));
   count.textContent='Записей: '+rows.length+' · показано '+(rows.length?page*size+1:0)+'–'+Math.min(rows.length,(page+1)*size)+'.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();for(const label of ['Организация','Рег. номер','ОГРН','Лицензия','Системная значимость']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of rows.slice(page*size,(page+1)*size)){const tr=body.insertRow(),btn=node('button',r.name);btn.type='button';btn.className='rm-region-link';btn.onclick=()=>detail(r);tr.insertCell().append(btn);for(const v of [r.registration_number,r.ogrn,r.license_status,r.system===true?'Да':r.system===false?'Нет в перечне':'—'])tr.insertCell().textContent=v??'—'}
   host.replaceChildren(t);prev.disabled=page===0;next.disabled=(page+1)*size>=rows.length;exp.disabled=!rows.length;
   exp.onclick=()=>csv('bank-directory.csv',[['Название','Регистрационный номер','ОГРН','Вид','Оргформа','Дата регистрации','Статус лицензии','Дата полного списка','Системная значимость','Дата перечня','Строка полного списка','Строка перечня','Источник полного списка','SHA-256 полного списка','Источник перечня','SHA-256 перечня','SHA-256 JSON','Отпечаток манифеста'],...rows.map(r=>[r.name,r.registration_number,r.ogrn,r.kind,r.legal_form,r.registered,r.license_status,b.edition,r.system,a.edition,r.fullRow,r.systemRow,b.source,b.sha256,a.source,a.sha256,entry.sha256,manifest.data_fingerprint])]);
  }
  for(const el of [mode,license])el.onchange=()=>{page=0;draw()};query.oninput=()=>{page=0;draw()};prev.onclick=()=>{page--;draw()};next.onclick=()=>{page++;draw()};draw();
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
