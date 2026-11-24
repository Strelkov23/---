const ParkCertificates=(()=>{
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е').trim();
 function calendar(r,date){return date<r.start?'future':date>r.end?'expired':'within'}
 function filter(rows,date,region,period,query){const q=norm(query);return rows.filter(r=>(!region||r.region===region)&&(!period||calendar(r,date)===period)&&(!q||norm(r.name).includes(q)||r.number.includes(q)))}
 return {calendar,filter}
})();
if(typeof module!=='undefined')module.exports=ParkCertificates;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('cert-form'))return;
 const fields=['cert-region','cert-period','cert-query'],status=$('cert-status'),region=$('cert-region'),period=$('cert-period'),query=$('cert-query'),exporter=$('cert-export');
 const labels={within:'Дата сборки внутри срока',expired:'Срок закончился',future:'Срок ещё не начался'};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const {data,sha256}=await Provenance.get(manifest,'park-certificates.json',root);
  const date=data.built.slice(0,10);
  $('cert-source').replaceChildren(node('p',data.note),node('p','Дата сравнения сроков: '+date+' · успешное получение: '+(data.success||'—')+' · последняя проверка: '+(data.checked||'—')+' · статус: '+data.status),node('p','SHA-256 исходной страницы: '+(data.sha256||'—')+(data.error?' · '+data.error:'')));
  if(!data.rows.length){status.textContent='Список документов не загружен. Отсутствие записи не доказывает отсутствие сертификата.';return}
  region.replaceChildren(new Option('Все регионы',''),...[...new Set(data.rows.map(r=>r.region))].sort((a,b)=>a.localeCompare(b,'ru')).map(r=>new Option(r,r)));
  restore(fields);
  function draw(){
   const rows=ParkCertificates.filter(data.rows,date,region.value,period.value,query.value);
   status.textContent='Документы: '+rows.length+' из '+data.rows.length+' · дата сравнения: '+date;
   const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
   for(const label of ['Номер АИП','Название','Регион','Начало','Окончание','Календарный срок','Протокол','Источник'])h.append(node('th',label));
   for(const r of rows){const tr=body.insertRow();for(const v of [r.number,r.name,r.region,r.start,r.end,labels[ParkCertificates.calendar(r,date)],r.protocol])tr.insertCell().textContent=v;const a=node('a','Запись в источнике');a.href=r.url||data.source;tr.insertCell().append(a)}
   $('cert-table').replaceChildren(table);exporter.disabled=!rows.length;
   exporter.onclick=()=>csv('industrial-park-certificates.csv',[['Номер','Название','Регион','Начало','Окончание','Календарный срок','Дата сравнения','Протокол','Источник записи','Реестр','Дата загрузки','SHA-256 HTML','SHA-256 JSON','Отпечаток манифеста','Ограничение'],...rows.map(r=>[r.number,r.name,r.region,r.start,r.end,labels[ParkCertificates.calendar(r,date)],date,r.protocol,r.url,data.source,data.success,data.sha256,sha256,manifest.data_fingerprint,data.note])]);save(fields);
  }
  $('cert-form').onsubmit=e=>e.preventDefault();for(const id of fields)$(id).addEventListener(id==='cert-query'?'input':'change',draw);draw();
 }catch(e){status.textContent='Реестр документов недоступен: '+String(e.message||e)}
});
