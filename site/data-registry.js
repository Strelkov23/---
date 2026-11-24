/* Local deterministic search; no network service other than the published JSON. */
const DataRegistry=(()=>{
 const normalize=v=>String(v??'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
 const text=r=>normalize([r.title,r.code,r.unit,r.territory,r.classification,r.source,r.note,r.group].join(' '));
 function filter(rows,p,selected){
  const words=normalize(p.q).split(/\s+/).filter(Boolean);
  return rows.filter(r=>(!p.group||r.group===p.group)&&(!p.mode||r.mode===p.mode)&&(!p.availability||(p.availability==='present'?r.count>0:r.count===0))&&(!p.onlySelected||selected.has(r.id))&&words.every(w=>text(r).includes(w)));
 }
 return {normalize,filter};
})();
if(typeof module!=='undefined')module.exports=DataRegistry;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('registry-form'))return;
 const labels={wdi:'Международная статистика России (WDI)',national:'Российские макроэкономические данные',cbr:'Банк России: дополнительные ряды',regional:'Региональные и исторические ряды',industry:'Промышленная статистика',capital:'Основные фонды',capacity:'Загрузка мощностей',forecast:'Прогнозные расчёты'};
 const modes={auto:'Автоматический сборщик',manual:'Ручной снимок',derived:'Расчётный ряд'};
 const key='economic-registry-selection-v1';let saved=new Set(),storage=true;
 try{const v=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(v))saved=new Set(v.filter(x=>typeof x==='string'))}catch(e){storage=false}
 function persist(){try{localStorage.setItem(key,JSON.stringify([...saved]))}catch(e){storage=false}}
 const fmt=v=>v===null||v===undefined||v===''?'—':String(v);
 const p=()=>({q:$('registry-q').value,group:$('registry-group').value,mode:$('registry-mode').value,availability:$('registry-availability').value,onlySelected:$('registry-selected').checked});
 try{
  const data=await load('data-registry.json'),rows=data.rows,ids=new Set(rows.map(r=>r.id));saved=new Set([...saved].filter(x=>ids.has(x)));
  const group=$('registry-group');group.add(new Option('Все наборы',''));for(const [k,n] of Object.entries(data.groups))group.add(new Option((labels[k]||k)+' ('+n+')',k));
  const list=$('registry-list'),size=20;let index=0,filtered=[];
  const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;return a};
  const line=(label,value)=>{const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';p.append(b,fmt(value));return p};
  function selectedStatus(){$('registry-save-status').textContent='Сохранено рядов: '+saved.size+(storage?' · локально в браузере':' · только в текущей вкладке');$('registry-export-selected').disabled=!saved.size;$('registry-clear').disabled=!saved.size}
  function download(name,items){const fields=['id','group','code','title','unit','frequency','territory','count','first','last','source','checked','success','status','mode','page','file','note','classification'];csv(name,[['Сборка каталога',data.built],fields,...items.map(r=>fields.map(k=>r[k]))])}
  function draw(){
   filtered=DataRegistry.filter(rows,p(),saved);const pages=Math.max(1,Math.ceil(filtered.length/size));index=Math.min(index,pages-1);
   list.replaceChildren();
   for(const r of filtered.slice(index*size,(index+1)*size)){
    const article=document.createElement('article'),title=document.createElement('h3');title.textContent=r.title;article.append(title);
    article.append(line('Набор',labels[r.group]||r.group),line('Код',r.code),line('Единицы и частота',r.unit+' · '+r.frequency),line('Охват',r.territory+' · '+r.count+' записей · '+fmt(r.first)+' — '+fmt(r.last)),line('Режим',modes[r.mode]),line('Последнее успешное получение / проверка источника',r.success),line('Последняя попытка',r.checked),line('Статус',r.status));
    if(r.note)article.append(line('Описание',r.note));
    const actions=document.createElement('div');actions.className='registry-actions';actions.append(link('Открыть раздел',r.page),link('Файл данных',r.file),link('Первоисточник',r.source));
    const button=document.createElement('button');button.type='button';button.textContent=saved.has(r.id)?'Убрать из сохранённых':'Сохранить ряд';button.setAttribute('aria-pressed',String(saved.has(r.id)));button.onclick=()=>{if(saved.has(r.id))saved.delete(r.id);else saved.add(r.id);persist();if(p().onlySelected)draw();else{button.textContent=saved.has(r.id)?'Убрать из сохранённых':'Сохранить ряд';button.setAttribute('aria-pressed',String(saved.has(r.id)));selectedStatus()}};
    actions.append(button);article.append(actions);list.append(article);
   }
   $('registry-status').textContent='Найдено: '+filtered.length+' из '+rows.length+' · сборка '+data.built;
   $('registry-page').textContent='Страница '+(index+1)+' из '+pages;$('registry-prev').disabled=index===0;$('registry-next').disabled=index>=pages-1;$('registry-export').disabled=!filtered.length;selectedStatus();
  }
  $('registry-form').addEventListener('input',()=>{index=0;draw()});$('registry-form').addEventListener('submit',e=>e.preventDefault());$('registry-reset').onclick=()=>{$('registry-form').reset();index=0;draw()};
  $('registry-prev').onclick=()=>{index--;draw()};$('registry-next').onclick=()=>{index++;draw()};$('registry-export').onclick=()=>download('data-registry-filtered.csv',filtered);$('registry-export-selected').onclick=()=>download('data-registry-selection.csv',rows.filter(r=>saved.has(r.id)));$('registry-clear').onclick=()=>{saved.clear();persist();draw()};
  draw();
 }catch(e){console.error(e);$('registry-status').textContent='Каталог недоступен. Откройте полный CSV или раздел источников.'}
});
