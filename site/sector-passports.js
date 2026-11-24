document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('sp-form'))return;
 const ids=['sp-sector','sp-q','sp-provider','sp-coverage'],picker=$('sp-sector'),provider=$('sp-provider'),status=$('sp-status');
 const link=(label,url)=>{const a=node('a',label);a.href=url;return a};
 const local=(url)=>{const a=new URL(url,location.href);if(pinned)a.searchParams.set('snapshot',pinned);return a.href};
 const norm=v=>String(v??'').toLowerCase().replaceAll('ё','е');
 try{
  if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}
  const data=await load('sector-passports.json'),profiles=data.profiles;
  const all=profiles.flatMap(p=>p.rows),unique=new Map(all.map(r=>[r.id,r]));
  for(const [label,count] of [['Тематических паспортов',profiles.length],['Уникальных связанных рядов',unique.size],['Рядов с наблюдениями',[...unique.values()].filter(r=>r.count).length]]){
   const m=node('div','');m.className='metric';m.append(node('b',fmt(count)),node('span',label));$('sp-metrics').append(m)
  }
  for(const p of profiles)picker.add(new Option(p.title,p.id));
  for(const p of [...new Set(all.map(r=>r.provider))].sort())provider.add(new Option(p,p));
  restore(ids);
  let balance=null;try{balance=await load('sectors.json')}catch{}
  function draw(){
   const p=profiles.find(p=>p.id===picker.value);if(!p)return;
   const q=norm($('sp-q').value.trim()),cov=$('sp-coverage').value,src=provider.value;
   const rows=p.rows.filter(r=>(!src||src===r.provider)&&(!cov||(cov==='yes'?r.count>0:r.count===0))&&norm([r.title,r.id,r.unit].join(' ')).includes(q));
   const host=$('sp-scope');host.replaceChildren(node('h2',p.title),node('p',p.note));
   const sources=node('p','Профильные официальные каталоги: ');p.sources.forEach((url,i)=>{if(i)sources.append(document.createTextNode(' · '));sources.append(link(new URL(url).hostname,url))});host.append(sources);
   status.textContent='Показателей в выборке: '+rows.length+' · с наблюдениями: '+rows.filter(r=>r.count).length+' · версия: '+(version||'не определена');
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Показатель','Последнее значение','Период','Охват','Источник / единица','Состояние'])h.append(node('th',label));
   for(const r of rows){
    const tr=body.insertRow();tr.insertCell().append(link(r.title,local(r.href)));tr.insertCell().textContent=r.count?fmt(r.value):'Нет данных';tr.insertCell().textContent=r.last||'—';tr.insertCell().textContent=r.count?r.first+'–'+r.last+' · '+r.count:'—';
    const c=tr.insertCell();c.append(link(r.provider,r.source),node('small',r.unit+' · '+r.frequency));tr.insertCell().textContent=(r.checked?r.checked.slice(0,10)+' · ':'')+(r.status||'Нет сведений')
   }
   $('sp-table').replaceChildren(t);if(!rows.length)$('sp-table').append(node('p','Нет показателей по выбранному фильтру.'));
   const b=$('sp-balance');b.replaceChildren();
   if(balance&&!pinned){
    const related=balance.names.map((name,i)=>({name,i})).filter(x=>p.terms.some(term=>norm(x.name).includes(norm(term))));
    for(const x of related){const line=node('p','');line.append(link(x.name,'sector-'+(x.i+1)+'.html'),document.createTextNode(' · выпуск в балансе 2021: '+fmt(balance.output[x.i]/1000)+' млрд ₽'));b.append(line)}
    if(!related.length)b.append(node('p','Нет однозначно подобранной тематической группы баланса.'));
   }else b.append(node('p','Статические паспорта баланса относятся к текущей сборке, а не закреплённой версии.'));
   b.append(link('Все 19 групп межотраслевого баланса','atlas.html'));
   $('sp-export').disabled=!rows.length;$('sp-export').onclick=()=>csv('sector-passport-'+p.id+'.csv',[['Паспорт','Код','Показатель','Значение','Последний период','Первый период','Наблюдений','Единица','Периодичность','Поставщик','Источник','Успешная проверка','Статус'],...rows.map(r=>[p.title,r.id,r.title,r.value,r.last,r.first,r.count,r.unit,r.frequency,r.provider,r.source,r.checked,r.status])]);save(ids)
  }
  $('sp-form').oninput=draw;$('sp-form').onsubmit=e=>e.preventDefault();$('sp-form').onreset=()=>setTimeout(draw,0);draw()
 }catch(e){console.error(e);status.textContent='Каталог паспортов недоступен для этой версии.'}
});