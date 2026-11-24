document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 const ids=['term','journal','theme','index','link-state','from','to','order'];
 const tags=['РИНЦ','ВАК','ВАК К1','ВАК К2','ВАК К3','RSCI','Scopus','Web of Science','DOAJ','EconLit','RePEc','Белый список 1','Белый список 2','Белый список 3','Белый список 4'];
 const labels={ok:'HTTP-проверка успешна',missing:'DOI не найден',restricted:'Доступ ограничен',error:'Ошибка HTTP / сети',unchecked:'Не проверено'};
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е');
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
  for(const [id,values] of [['journal',records.map(r=>r.journal)],['theme',records.flatMap(themes)]]){
   for(const v of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))$(id).add(new Option(v,v))
  }
  for(const tag of tags)$('index').add(new Option(tag+' ('+records.filter(r=>(meta(r).tags||[]).includes(tag)).length+')',tag));
  $('index').add(new Option('Статус не подтверждён','unknown'));restore(ids);
  let limit=30,selected=[];
  function draw(){
   const words=norm($('term').value).trim().split(/\s+/).filter(Boolean).map(stem);
   const from=Number($('from').value)||1991,to=Number($('to').value)||2100,idx=$('index').value,ls=$('link-state').value;
   selected=records.filter(r=>{
    const y=Number(String(r.published||'').slice(0,4)),marks=meta(r).tags||[];
    return y>=from&&y<=to&&(!$('journal').value||r.journal===$('journal').value)&&(!$('theme').value||themes(r).includes($('theme').value))&&(!idx||(idx==='unknown'?!marks.length:marks.includes(idx)))&&(!ls||state(r)===ls)&&words.every(w=>norm([r.title,r.authors,r.doi,r.journal,r.topics].join(' ')).includes(w))
   });
   selected.sort((a,b)=>$('order').value==='title'?a.title.localeCompare(b.title,'ru'):$('order').value==='old'?String(a.published).localeCompare(String(b.published)):String(b.published).localeCompare(String(a.published)));
   $('found').textContent=from>to?'Начальный год позже конечного':'Найдено статей: '+fmt(selected.length);
   $('papers').replaceChildren();
   if(!selected.length)$('papers').append(node('p','Нет совпадений. Измените фильтры. Отсутствие результатов не означает отсутствия статей в научной базе.'));
   for(const r of selected.slice(0,limit)){
    const card=node('article',''),heading=node('h3',''),m=meta(r),c=check(r),doi=doiURL(r.doi);
    heading.append(doi?link(r.title,doi):node('span',r.title));
    card.append(node('small',[r.published,r.journal,m.issn?'ISSN '+m.issn:''].filter(Boolean).join(' · ')),heading,node('p',r.authors||'Авторы не указаны'),node('p','Индексация журнала: '+(m.tags?.join(' · ')||'Не подтверждена')),node('small',themes(r).join(' · ')+(r.doi?' · DOI '+r.doi:'')));
    const access=node('p','');
    links(access,[['DOI',doi],['Страница издателя',c.status==='ok'&&c.final!==doi?c.final:''],['Метаданные Crossref',doi?'https://api.crossref.org/works/'+doi.slice('https://doi.org/'.length):''],['Сайт журнала',m.site],['Поиск по названию','https://search.crossref.org/?q='+encodeURIComponent(r.title)]]);
    card.append(access,node('small','Ссылка: '+(labels[state(r)]||'Не проверено')+(c.checked?' · '+c.checked.slice(0,10):'')+(c.detail?' · '+c.detail:'')));
    $('papers').append(card)
   }
   $('next').hidden=selected.length<=limit;$('references').disabled=!selected.length;save(ids)
  }
  $('paper-filters').oninput=()=>{limit=30;draw()};$('paper-filters').onsubmit=e=>e.preventDefault();$('paper-filters').onreset=()=>setTimeout(()=>{limit=30;draw()},0);
  $('next').onclick=()=>{limit+=40;draw()};
  $('references').onclick=()=>csv('economics-bibliography.csv',[['Авторы','Название','Дата публикации','Журнал','ISSN','Индексация журнала','Дата проверки журнала','Источники классификации','Темы','DOI','Ссылка','Статус ссылки','Дата проверки ссылки'],...selected.map(r=>[r.authors,r.title,r.published,r.journal,meta(r).issn,(meta(r).tags||[]).join(' · '),meta(r).verified,(meta(r).sources||[]).join(' | '),r.topics,r.doi,doiURL(r.doi),labels[state(r)],check(r).checked])]);
  const byJournal=new Map((data.checks||[]).map(r=>[r.journal,r]));
  for(const journal of [...new Set([...Object.keys(reg),...records.map(r=>r.journal),...byJournal.keys()])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ru'))){
   const m=reg[journal]||{},j=byJournal.get(journal)||{},card=node('article','');
   card.append(node('h3',journal),node('p',[m.issn?'ISSN '+m.issn:'',...(m.tags||['Статус не подтверждён'])].filter(Boolean).join(' · ')),node('small','Статей: '+records.filter(r=>r.journal===journal).length+' · Загрузка: '+(j.status||'Нет проверки')+' · '+(j.checked||'')+' · Классификация: '+(m.verified||'нет даты')));
   if(m.note)card.append(node('p',m.note));
   const sources=node('p','');links(sources,[['Сайт журнала',m.site],...(m.sources||[]).map((url,i)=>['Источник '+(i+1),url])]);card.append(sources);$('journals-status').append(card)
  }
  draw()
 }catch(e){console.error(e);$('found').textContent='Не удалось загрузить библиографию для выбранной версии. Проверьте сеть или откройте текущий архив.'}
})
