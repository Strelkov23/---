const Freshness=(()=>{
 const labels={ok:'Успешная загрузка',cached:'Сохранённые данные / сбой',overdue:'Просрочена проверка',waiting:'Ожидается загрузка',unavailable:'Недоступно',archive:'Исторический архив'};
 function filter(rows,group,state,q){const term=String(q||'').toLowerCase().trim();return rows.filter(r=>(!group||r.group===group)&&(!state||r.state===state)&&(!term||[r.title,r.url,r.status].join(' ').toLowerCase().includes(term)))}
 return {labels,filter}
})();
if(typeof module!=='undefined')module.exports=Freshness;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('fresh-form');if(!form)return;
 const group=$('fresh-group'),state=$('fresh-state'),q=$('fresh-query'),status=$('fresh-status'),host=$('fresh-table'),summary=$('fresh-summary'),more=$('fresh-more'),exp=$('fresh-export');
 const date=v=>v?new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'—',priority={unavailable:0,cached:1,overdue:2,waiting:3,ok:4,archive:5};
 let limit=30,selected=[];
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),data=(await Provenance.get(m,'freshness.json',root)).data;
  for(const g of [...new Set(data.rows.map(r=>r.group))].sort())group.add(new Option(g,g));
  restore(['fresh-group','fresh-state','fresh-query']);
  const counts={};for(const r of data.rows)counts[r.state]=(counts[r.state]||0)+1;
  for(const [k,label] of Object.entries(Freshness.labels)){const item=node('div','');item.className='metric';item.append(node('b',String(counts[k]||0)),node('span',label));summary.append(item)}
  function draw(){
   selected=Freshness.filter(data.rows,group.value,state.value,q.value).sort((a,b)=>priority[a.state]-priority[b.state]||String(a.title).localeCompare(String(b.title),'ru'));
   status.textContent='Срез контроля: '+date(data.built)+' МСК · строк: '+selected.length+' из '+data.rows.length+' · это проверка загрузки, не оценка истинности данных.';
   const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();for(const x of ['Источник / набор','Состояние','Период наблюдения','Последняя проверка (МСК)','Последний успех (МСК)','Следующая проверка (МСК)','Правило / результат'])head.append(node('th',x));
   for(const r of selected.slice(0,limit)){const tr=body.insertRow(),cell=tr.insertCell(),a=node('a',r.title);a.href=r.href;if(pinned&&dynamicPages.has(new URL(a.href).pathname.split('/').at(-1))){const u=new URL(a.href);u.searchParams.set('snapshot',pinned);a.href=u.href}cell.append(a,node('small',' · '+r.group));if(r.url&&/^https?:\/\//.test(r.url)){const l=node('a',' Первоисточник');l.href=r.url;l.target='_blank';l.rel='noopener noreferrer';cell.append(l)}for(const x of [Freshness.labels[r.state],r.observation||'—',date(r.checked),date(r.success),date(r.next_check),r.policy+' · '+r.status])tr.insertCell().textContent=x}
   host.replaceChildren(table);more.hidden=selected.length<=limit;exp.disabled=!selected.length;save(['fresh-group','fresh-state','fresh-query'])
  }
  function reset(){limit=30;draw()}group.onchange=state.onchange=q.oninput=reset;form.onsubmit=e=>{e.preventDefault();reset()};more.onclick=()=>{limit+=30;draw()};exp.onclick=()=>csv('source-freshness.csv',[['Срез UTC',data.built],['Группа','Набор','Статус','Наблюдение','Проверка UTC','Успех UTC','Расчётный срок UTC','Правило','Результат','URL'],...selected.map(r=>[r.group,r.title,Freshness.labels[r.state],r.observation,r.checked,r.success,r.next_check,r.policy,r.status,r.url])]);draw()
 }catch(e){status.textContent='Реестр обновлений недоступен для этой версии: '+e.message}
});
