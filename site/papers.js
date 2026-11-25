document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 const ids=['term','journal','theme','index','link-state','from','to','order','paper-meta'];
 const tags=['РИНЦ','ВАК','ВАК К1','ВАК К2','ВАК К3','RSCI','Scopus','Web of Science','DOAJ','EconLit','RePEc','Белый список 1','Белый список 2','Белый список 3','Белый список 4'];
 const labels={ok:'HTTP-проверка успешна',missing:'DOI не найден',restricted:'Доступ ограничен',error:'Ошибка HTTP / сети',unchecked:'Не проверено'};
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е');
 const exactDoi=value=>{
  let s=String(value||'').trim().replace(/^doi:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  try{s=decodeURIComponent(s)}catch{}
  return /^10\.\d{4,9}\/\S+$/.test(s)?s.toLowerCase():'';
 };
 const doiURL=d=>/^10\.\d{4,9}\/\S+$/.test(d||'')?'https://doi.org/'+d.split('/').map(encodeURIComponent).join('/'):'';
 function valid(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
 function link(title,url){const a=node('a',title);a.href=valid(url);a.target='_blank';a.rel='noopener noreferrer';return a}
 function links(parent,items){items.filter(i=>valid(i[1])).forEach(([t,u],i)=>{if(i)parent.append(document.createTextNode(' · '));parent.append(link(t,u))})}
 try{
  if(!version){const res=await fetch('version.txt');if(res.ok)version=(await res.text()).trim()}
  const data=await load('literature.json');
  if(!Array.isArray(data.articles))throw Error('Invalid catalogue');
  const records=data.articles.filter(r=>r&&r.title),reg=data.registry||{},audit=data.links||{};
  const meta=r=>reg[r.journal]||{},check=r=>audit[r.doi]||{},state=r=>check(r).status||'unchecked';
  const themes=r=>String(r.topics||'').split(' · ').filter(Boolean);
  for(const [label,n] of [['Статей',records.length],['Журналов',new Set(records.map(r=>r.journal)).size],['Проверено ссылок',records.filter(r=>state(r)!=='unchecked').length],['Требуют внимания',records.filter(r=>['missing','restricted','error'].includes(state(r))).length]]){
   const box=node('div','');box.className='metric';box.append(node('b',fmt(n)),node('span',label));$('paper-metrics').append(box)
  }
  for(const [id,values] of [['journal',[...records.map(r=>r.journal),...Object.keys(reg)]],['theme',records.flatMap(themes)]]){
   for(const v of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))$(id).add(new Option(v,v))
  }
  for(const tag of tags)$('index').add(new Option(tag+' ('+records.filter(r=>(meta(r).tags||[]).includes(tag)).length+')',tag));
  $('index').add(new Option('Статус не подтверждён','unknown'));restore(ids);
  const overview=$('index-overview');
  const groups=[['Российские перечни и базы',['РИНЦ','RSCI','ВАК','ВАК К1','ВАК К2','ВАК К3','Белый список 1','Белый список 2','Белый список 3','Белый список 4']],['Международные базы',['Scopus','Web of Science','DOAJ','EconLit','RePEc']]];
  for(const [heading,items] of groups){
   const panel=node('article','');panel.append(node('h3',heading));
   for(const tag of items){
    const count=records.filter(r=>(meta(r).tags||[]).includes(tag)).length;
    const n=Object.values(reg).filter(m=>(m.tags||[]).includes(tag)).length;
    const row=node('div',''),btn=node('button',tag+' — '+fmt(count)+' статей'),bar=node('meter','');
    btn.type='button';btn.setAttribute('aria-pressed','false');btn.dataset.index=tag;
    btn.style.cssText='text-align:left;width:100%;margin-top:.4rem';
    btn.onclick=()=>{$('index').value=tag;limit=30;draw();$('paper-filters').scrollIntoView({block:'start'})};
    bar.min=0;bar.max=Math.max(1,records.length);bar.value=count;bar.setAttribute('aria-label',tag+': '+count+' из '+records.length+' статей');
    row.append(btn,bar,node('small',' '+fmt(n)+' журналов в реестре'));panel.append(row)
   }
   overview.append(panel)
  }
  let limit=30,selected=[];
  const storageKey='economics-research-collection-v1';
  let basket=new Map(),persistent=true;
  try{for(const item of JSON.parse(localStorage.getItem(storageKey)||'[]'))if(item&&valid(item.url))basket.set(item.url,item)}catch{persistent=false}
  const complete=r=>Boolean(r.volume&&r.issue&&(r.pages||r.article_number));
  function item(r){return {title:r.title,url:doiURL(r.doi),date:r.published||'',type:'Научная статья',source:r.journal,topics:r.topics||'',authors:r.authors||'',doi:r.doi||'',issn:meta(r).issn||'',volume:r.volume||'',issue:r.issue||'',pages:r.pages||'',article_number:r.article_number||'',metadata_checked:r.metadata_checked||'',archive_revision:version||''}}
  const projects=$('paper-project'),projectStatus=$('paper-project-status'),P=ResearchProjects;
  function projectList(){
   const old=projects.value;projects.replaceChildren(new Option('Выберите проект',''));
   try{
    const data=P.parse(localStorage.getItem(P.KEY)||'{"schema":1,"projects":[]}');
    for(const x of data.projects)projects.add(new Option(x.title,x.id));
    projects.value=data.projects.some(x=>x.id===old)?old:'';
    projectStatus.textContent=data.projects.length?'Выберите проект для прямого добавления статей.':'Создайте проект в разделе «Исследовательские проекты».';
   }catch(e){projectStatus.textContent='Не удалось прочитать проекты. Данные не изменены.'}
  }
  function addProject(rows){
   try{
    const id=projects.value;if(!id)throw Error('Выберите проект');
    const old=P.parse(localStorage.getItem(P.KEY)||'{"schema":1,"projects":[]}');
    const incoming=rows.filter(r=>doiURL(r.doi)).map(item);
    const next=P.addToProject(old,id,incoming);
    localStorage.setItem(P.KEY,P.encode(next));
    projectStatus.textContent='Сохранено в проекте: '+next.projects.find(x=>x.id===id).items.length+' источников. Общая подборка не изменена.';
   }catch(e){projectStatus.textContent='Не сохранено: '+e.message}
  }
  projectList();
  projects.onchange=()=>draw();
  $('paper-project-add-page').onclick=()=>addProject(selected.slice(0,limit));
  function store(){try{localStorage.setItem(storageKey,JSON.stringify([...basket.values()]))}catch{persistent=false}
   $('paper-selection').textContent='В общей подборке: '+fmt(basket.size)+(persistent?' · сохраняется в этом браузере':' · сохранение между страницами недоступно')}
  function toggle(r){const x=item(r);if(!x.url)return;if(basket.has(x.url))basket.delete(x.url);else basket.set(x.url,x);store();draw()}
  function citation(r){return [r.volume?'Т. '+r.volume:'',r.issue?'№ '+r.issue:'',r.pages?'С. '+r.pages:r.article_number?'Статья '+r.article_number:''].filter(Boolean).join(' · ')}

  function draw(){
   const exact=exactDoi($('term').value);const words=norm($('term').value).trim().split(/\s+/).filter(Boolean).map(w=>/[\d/@.]/.test(w)?w:stem(w));
   const from=Number($('from').value)||1991,to=Number($('to').value)||2100,idx=$('index').value,ls=$('link-state').value;
   selected=records.filter(r=>{
    const y=Number(String(r.published||'').slice(0,4)),marks=meta(r).tags||[],mc=$('paper-meta').value;
    return (!mc||(mc==='complete'?complete(r):!complete(r)))&&y>=from&&y<=to&&(!$('journal').value||r.journal===$('journal').value)&&(!$('theme').value||themes(r).includes($('theme').value))&&(!idx||(idx==='unknown'?!marks.length:marks.includes(idx)))&&(!ls||state(r)===ls)&&(exact?String(r.doi||'').toLowerCase()===exact:words.every(w=>norm([r.title,r.authors,r.doi,r.journal,r.topics].join(' ')).includes(w)))
   });
   selected.sort((a,b)=>$('order').value==='cited'?(Number.isFinite(b.cited_by)?b.cited_by:-1)-(Number.isFinite(a.cited_by)?a.cited_by:-1):$('order').value==='title'?a.title.localeCompare(b.title,'ru'):$('order').value==='old'?String(a.published).localeCompare(String(b.published)):String(b.published).localeCompare(String(a.published)));
   $('found').textContent=from>to?'Начальный год позже конечного':'Найдено статей: '+fmt(selected.length);
   for(const b of overview.querySelectorAll('button[data-index]'))b.setAttribute('aria-pressed',String(b.dataset.index===idx));
   $('index-explanation').textContent=idx?'Выбранная категория: '+(idx==='unknown'?'Статус не подтверждён':idx)+' · '+fmt(selected.length)+' статей с учётом всех фильтров.':'Выберите категорию или используйте фильтры ниже.';
   $('papers').replaceChildren();
   if(!selected.length)$('papers').append(node('p','Нет совпадений. Измените фильтры. Отсутствие результатов не означает отсутствия статей в научной базе.'));
   for(const r of selected.slice(0,limit)){
    const card=node('article',''),heading=node('h3',''),m=meta(r),c=check(r),doi=doiURL(r.doi);
    heading.append(doi?link(r.title,doi):node('span',r.title));
    card.append(node('small',[r.published,r.journal,m.issn?'ISSN '+m.issn:''].filter(Boolean).join(' · ')),heading,node('p',r.authors||'Авторы не указаны'),node('p','Индексация журнала: '+(m.tags?.join(' · ')||'Не подтверждена')),node('small',themes(r).join(' · ')+(r.doi?' · DOI '+r.doi:'')));
    const access=node('p','');
    links(access,[['DOI',doi],['Страница издателя',c.status==='ok'&&c.final!==doi?c.final:''],['Метаданные Crossref',doi?'https://api.crossref.org/works/'+doi.slice('https://doi.org/'.length):''],['Сайт журнала',m.site],['Поиск по названию','https://search.crossref.org/?q='+encodeURIComponent(r.title)],['Поиск в Google Scholar','https://scholar.google.com/scholar?q='+encodeURIComponent(r.title)],['Поиск в КиберЛенинке','https://cyberleninka.ru/search?q='+encodeURIComponent(r.title)]]);
    const add=node('button',basket.has(doi)?'Убрать из подборки':'В подборку');add.type='button';add.disabled=!doi;add.setAttribute('aria-pressed',String(basket.has(doi)));add.onclick=()=>toggle(r);
    card.append(node('p',(citation(r)||'Том, номер и страницы пока не загружены')+' · Ссылки Crossref: '+(Number.isFinite(r.cited_by)?fmt(r.cited_by):'нет данных')),add);
    const projectButton=node('button','В выбранный проект');projectButton.type='button';projectButton.className='paper-project-add';projectButton.disabled=!doi||!projects.value;projectButton.onclick=()=>addProject([r]);card.append(projectButton);
    card.append(access,node('small','Ссылка: '+(labels[state(r)]||'Не проверено')+(c.checked?' · '+c.checked.slice(0,10):'')+(c.detail?' · '+c.detail:'')));
    $('papers').append(card)
   }
   $('paper-selection').textContent='В общей подборке: '+fmt(basket.size)+(persistent?' · сохраняется в этом браузере':' · сохранение между страницами недоступно');
   $('paper-add-page').disabled=!selected.some(r=>doiURL(r.doi));
   $('paper-project-add-page').disabled=!projects.value||!selected.slice(0,limit).some(r=>doiURL(r.doi));
   $('next').hidden=selected.length<=limit;for(const id of ['references','bibtex','ris','gost'])$(id).disabled=!selected.length;save(ids)
  }
  $('paper-filters').oninput=()=>{limit=30;draw()};$('paper-filters').onsubmit=e=>e.preventDefault();$('paper-filters').onreset=()=>setTimeout(()=>{limit=30;draw()},0);
  $('next').onclick=()=>{limit+=40;draw()};
  $('paper-add-page').onclick=()=>{for(const r of selected.slice(0,limit)){const x=item(r);if(x.url)basket.set(x.url,x)}store();draw()};
  $('references').onclick=()=>csv('economics-bibliography.csv',[['Авторы','Название','Дата публикации','Журнал','ISSN','Индексация журнала','Дата проверки журнала','Источники классификации','Темы','DOI','Ссылка','Статус ссылки','Дата проверки ссылки','Том','Номер','Страницы','Номер статьи','Ссылки Crossref','Дата метаданных'],...selected.map(r=>[r.authors,r.title,r.published,r.journal,meta(r).issn,(meta(r).tags||[]).join(' · '),meta(r).verified,(meta(r).sources||[]).join(' | '),r.topics,r.doi,doiURL(r.doi),labels[state(r)],check(r).checked,r.volume,r.issue,r.pages,r.article_number,r.cited_by,r.metadata_checked])]);
  function exportText(filename,content){const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})),a=node('a','');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
  const bib=v=>clean(v).replace(/\\/g,'/').replace(/[{}]/g,'').replace(/[%&#_$]/g,m=>'\\'+m);
  $('bibtex').onclick=()=>exportText('references.bib',selected.map((r,i)=>{
    const fields={title:r.title,author:clean(r.authors).split(/,\s*/).join(' and '),journal:r.journal,year:clean(r.published).slice(0,4),volume:r.volume,number:r.issue,pages:r.pages,eid:r.article_number,doi:r.doi,url:doiURL(r.doi)};
    return '@article{econ'+i+',\n'+Object.entries(fields).filter(([,v])=>v).map(([k,v])=>'  '+k+' = {'+bib(v)+'}').join(',\n')+'\n}';
  }).join('\n\n'));
  $('ris').onclick=()=>exportText('references.ris',selected.map(r=>['TY  - JOUR','TI  - '+clean(r.title),...clean(r.authors).split(/,\s*/).filter(Boolean).map(v=>'AU  - '+v),'JO  - '+clean(r.journal),'PY  - '+clean(r.published).slice(0,4),...(r.volume?['VL  - '+clean(r.volume)]:[]),...(r.issue?['IS  - '+clean(r.issue)]:[]),...(r.pages?['SP  - '+clean(r.pages).split(/[-–]/)[0],...(clean(r.pages).split(/[-–]/).length===2?['EP  - '+clean(r.pages).split(/[-–]/)[1]]:[])]:[]),'DO  - '+clean(r.doi),'UR  - '+doiURL(r.doi),'ER  - '].join('\r\n')).join('\r\n\r\n'));
  $('gost').onclick=()=>exportText('references.txt','Рабочий список литературы (проверьте недостающие том, номер и страницы перед оформлением по ГОСТ).\n\n'+selected.map((r,i)=>(i+1)+'. '+[clean(r.authors),clean(r.title)].filter(Boolean).join('. ')+' // '+clean(r.journal)+'. — '+clean(r.published).slice(0,4)+'.'+(citation(r)?' — '+citation(r)+'.':'')+' — DOI: '+clean(r.doi)+'. — URL: '+doiURL(r.doi)).join('\n'));
  const service=data.service||{},serviceHost=$('crossref-service');if(serviceHost)serviceHost.textContent=service.cooldown?'Crossref ограничил запросы. На дату сборки повтор отложен до '+service.retry_at+' (UTC). Сохранённый архив доступен; отсутствие новых статей не означает их отсутствие в журналах.':service.limited_at?'Последнее ограничение Crossref: '+service.limited_at+' (UTC). Состояние отдельных журналов указано ниже.':'Ограничение Crossref в сохранённом состоянии не зафиксировано.';
  const byJournal=new Map((data.checks||[]).map(r=>[r.journal,r]));
  for(const journal of [...new Set([...Object.keys(reg),...records.map(r=>r.journal),...byJournal.keys()])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ru'))){
   const m=reg[journal]||{},j=byJournal.get(journal)||{},card=node('article','');
   card.append(node('h3',journal),node('p',[m.issn?'ISSN '+m.issn:'',...(m.tags||['Статус не подтверждён'])].filter(Boolean).join(' · ')),node('small','Статей: '+records.filter(r=>r.journal===journal).length+' · Загрузка: '+(j.status||'Нет проверки')+' · '+(j.checked||'')+' · Классификация: '+(m.verified||'нет даты')));
   if(m.note)card.append(node('p',m.note));
   if(m.white_history)card.append(node('p','Подтверждённые уровни Белого списка по редакциям: '+Object.entries(m.white_history).map(([y,v])=>y+' — уровень '+v).join('; ')+'. Не означает статус каждой статьи в год публикации.'));
   const sources=node('p','');links(sources,[['Сайт журнала',m.site],...(m.sources||[]).map((url,i)=>['Источник '+(i+1),url])]);card.append(sources);$('journals-status').append(card)
  }
  draw()
 }catch(e){console.error(e);$('found').textContent='Не удалось загрузить библиографию для выбранной версии. Проверьте сеть или откройте текущий архив.'}
})
