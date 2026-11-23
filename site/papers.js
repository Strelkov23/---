document.addEventListener('DOMContentLoaded',async()=>{
 const byId=id=>document.getElementById(id);
 const ids=['term','journal','theme','from','to'];
 try{
  if(!version)version=(await (await fetch('version.txt')).text()).trim();
  const data=await load('literature.json');
  const records=data.articles;
  for(const [id,values] of [['journal',records.map(r=>r.journal)],['theme',records.flatMap(r=>r.topics.split(' · '))]]){
   for(const value of [...new Set(values)].sort())byId(id).add(new Option(value,value));
  }
  restore(ids);
  let limit=30,selected=[];
  function draw(){
   const words=byId('term').value.toLowerCase().trim().split(/\s+/).map(stem);
   const from=Number(byId('from').value)||1991,to=Number(byId('to').value)||2100;
   selected=records.filter(r=>Number(r.published.slice(0,4))>=from&&Number(r.published.slice(0,4))<=to&&(!byId('journal').value||r.journal===byId('journal').value)&&(!byId('theme').value||r.topics.split(' · ').includes(byId('theme').value))&&words.every(w=>[r.title,r.authors,r.doi].join(' ').toLowerCase().includes(w)));
   byId('found').textContent='Найдено статей: '+fmt(selected.length);
   byId('papers').replaceChildren();
   for(const r of selected.slice(0,limit)){
    const card=node('article',''),title=node('h3',''),a=node('a',r.title);
    a.href='https://doi.org/'+r.doi;title.append(a);card.append(node('small',r.published+' · '+r.journal),title,node('p',r.authors||'Авторы не указаны'),node('small',r.topics+' · DOI '+r.doi));byId('papers').append(card)
   }
   byId('next').hidden=selected.length<=limit;byId('references').disabled=!selected.length;save(ids)
  }
  byId('paper-filters').oninput=()=>{limit=30;draw()};byId('paper-filters').onsubmit=e=>e.preventDefault();byId('paper-filters').onreset=()=>setTimeout(()=>{limit=30;draw()},0);
  byId('next').onclick=()=>{limit+=40;draw()};byId('references').onclick=()=>csv('economics-bibliography.csv',[['Авторы','Название','Дата публикации','Журнал','Темы','DOI','Ссылка'],...selected.map(r=>[r.authors,r.title,r.published,r.journal,r.topics,r.doi,'https://doi.org/'+r.doi])]);
  for(const j of data.checks)byId('journals-status').append(node('p',j.journal+' · '+j.count+' записей · '+j.status+' · '+j.checked+' UTC'));
  draw()
 }catch{byId('found').textContent='Не удалось загрузить библиографию для выбранной версии.'}
})
