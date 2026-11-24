const StatRevisions=(()=>{
 const labels={revised:'Числовой пересмотр',added:'Новое наблюдение',missing:'Нет в новом снимке',definition:'Изменилось определение'};
 function filter(rows,g,k,q){const t=String(q||'').toLowerCase().trim();return rows.filter(r=>(!g||r.group===g)&&(!k||r.kind===k)&&(!t||[r.title,r.region,r.code,r.period].join(' ').toLowerCase().includes(t)))}
 return {labels,filter}
})();
if(typeof module!=='undefined')module.exports=StatRevisions;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('rev-form');if(!form)return;
 const build=$('rev-build'),group=$('rev-group'),kind=$('rev-kind'),q=$('rev-query'),status=$('rev-status'),summary=$('rev-summary'),host=$('rev-table'),exp=$('rev-export'),more=$('rev-more');
 const val=v=>v==null?'—':typeof v==='object'?Object.entries(v).map(([k,x])=>k+': '+String(x??'—')).join('; '):Number(v).toLocaleString('ru-RU',{maximumSignificantDigits:15});
 let limit=30,rows=[];
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),data=(await Provenance.get(m,'stat-revisions.json',root)).data;
  for(const [i,b] of data.builds.entries())build.add(new Option(new Date(b.time).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК',String(i)));
  for(const g of [...new Set(data.builds.flatMap(b=>b.events.map(r=>r.group)))].sort())group.add(new Option(g,g));
  restore(['rev-build','rev-group','rev-kind','rev-query']);
  function draw(){
   const b=data.builds[Number(build.value)];if(!b)return;
   rows=StatRevisions.filter(b.events,group.value,kind.value,q.value);
   status.textContent='Снимок '+b.time+' · найдено '+rows.length+' из '+b.events.length+' сохранённых событий'+(b.omitted?' · ещё '+b.omitted+' событий не вошли в лимит публичного журнала':'');
   summary.replaceChildren(node('p',Object.entries(b.counts).map(([k,v])=>StatRevisions.labels[k]+': '+v).join(' · ')),node('p','Новых рядов: '+b.new_series+' · отсутствующих рядов: '+b.missing_series+' · предыдущий отпечаток: '+(b.base||'первый снимок')));
   const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();for(const t of ['Набор / показатель','Территория','Период','Тип','Было','Стало','Единица','Источник'])head.append(node('th',t));
   for(const r of rows.slice(0,limit)){const tr=body.insertRow();for(const v of [r.group+' · '+r.title,r.region||'—',r.period||'—',StatRevisions.labels[r.kind],val(r.before),val(r.after),r.unit])tr.insertCell().textContent=v;const cell=tr.insertCell();if(/^https?:\/\//i.test(r.source||'')){const a=node('a','Источник');a.href=r.source;a.target='_blank';a.rel='noopener noreferrer';cell.append(a)}else cell.textContent='—'}
   host.replaceChildren(table);more.hidden=rows.length<=limit;exp.disabled=!rows.length;save(['rev-build','rev-group','rev-kind','rev-query'])
  }
  function reset(){limit=30;draw()}build.onchange=group.onchange=kind.onchange=q.oninput=reset;form.onsubmit=e=>{e.preventDefault();reset()};more.onclick=()=>{limit+=30;draw()};exp.onclick=()=>csv('statistical-revisions.csv',[['Сборка UTC','Предыдущий отпечаток','Группа','Код','Показатель','Регион','Период','Тип','Было','Стало','Единица','Источник'],...rows.map(r=>[r.time,r.base,r.group,r.code,r.title,r.region,r.period,r.kind,typeof r.before==='object'&&r.before!==null?JSON.stringify(r.before):r.before,typeof r.after==='object'&&r.after!==null?JSON.stringify(r.after):r.after,r.unit,r.source])]);draw()
 }catch(e){status.textContent='Журнал недоступен для этой версии: '+e.message}
});
