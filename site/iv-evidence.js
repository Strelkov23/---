/* Evidence metadata: comparability is not independence or causal proof. */
const IVEvidence=(()=>{
 const dimensions={concept:'Экономический смысл',population:'Охват и выборка',territory:'Территория',unit:'Единица',frequency:'Периодичность',basis:'База сравнения',method:'Метод измерения'};
 const origins={platform:'Первичные данные платформы',panel:'Панельное наблюдение',partner:'Статистика торгового партнёра',official:'Государственная статистика',model:'Модель / вторичная оценка'};
 function compare(a,b){
  if(!a||!b)throw Error('Missing indicator');
  const rows=Object.entries(dimensions).map(([key,label])=>({key,label,match:typeof a[key]==='string'&&a[key].length>0&&a[key]===b[key]}));
  const same=a.id===b.id&&rows.every(r=>r.match);
  const status=same?'same':a.topic!==b.topic?'unrelated':rows.every(r=>r.match)?'candidate':'context';
  return {status,rows,canSubtract:same,explanation:same?'Один показатель: числовое сравнение возможно после проверки одинаковых периодов, редакций и единиц.':status==='unrelated'?'Разные экономические темы. Числовой разрыв не интерпретируется.':status==='candidate'?'Метаданные совпадают, но независимость источников и сопоставимость наблюдений ещё требуют сверки.':'Показатели дополняют друг друга, но числовая разность не измеряет ошибку источника.'}
 }
 function coverage(rows){const periods=[...new Set((rows||[]).map(r=>r.period).filter(p=>typeof p==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(p)))].sort();if(!periods.length)return null;const pos=p=>Number(p.slice(0,4))*12+Number(p.slice(5))-1;return {count:periods.length,first:periods[0],last:periods.at(-1),missing:pos(periods.at(-1))-pos(periods[0])+1-periods.length}}
 return {compare,coverage,origins};
})();
if(typeof module!=='undefined')module.exports=IVEvidence;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),a=$('evidence-a'),b=$('evidence-b');if(!a)return;
 const status=$('evidence-status');
 try{
 const d=await load('independent-evidence.json');if(d.schema!=='iv-evidence-v1'||!Array.isArray(d.metrics)||!d.metrics.length)throw Error('Неверный паспорт');
 const rows=d.metrics,byId=new Map(rows.map(r=>[r.id,r]));
 for(const sel of [a,b]){for(const r of rows)sel.add(new Option(r.title,r.id));sel.disabled=false}
 a.value='romir-mom';b.value='cpi-mom';
 function draw(){
 const x=byId.get(a.value),y=byId.get(b.value),c=IVEvidence.compare(x,y),body=$('evidence-dimensions');body.replaceChildren();
 $('evidence-verdict').textContent=({same:'Один показатель',candidate:'Требуется верификация',context:'Только содержательное сопоставление',unrelated:'Разные темы'})[c.status];$('evidence-explain').textContent=c.explanation;
 for(const r of c.rows){const tr=body.insertRow();tr.insertCell().textContent=r.label;tr.insertCell().textContent=r.match?'Совпадает':'Различается / не установлено'}
 for(const [m,id] of [[x,'evidence-left'],[y,'evidence-right']]){const box=$(id);box.replaceChildren();const link=node('a','Методика / источник');link.href=m.source;const go=node('a','Перейти к инструменту');go.href='#'+m.anchor;box.append(node('h3',m.title),node('p',IVEvidence.origins[m.origin]||'Происхождение не установлено'),node('p',m.coverage),node('p',m.limit),link,document.createTextNode(' · '),go)}
 }
 a.onchange=b.onchange=draw;draw();status.textContent='Паспортов: '+rows.length+'. Совпадение метаданных не подтверждает независимость или истинность данных.';
 const filter=$('evidence-origin'),query=$('evidence-query'),list=$('evidence-catalog');
 Object.entries(IVEvidence.origins).forEach(([k,v])=>filter.add(new Option(v,k)));filter.disabled=query.disabled=false;
 function catalog(){list.replaceChildren();const matches=rows.filter(r=>(!filter.value||r.origin===filter.value)&&[r.title,r.publisher,r.coverage,r.limit].join(' ').toLowerCase().includes(query.value.trim().toLowerCase()));for(const r of matches){const card=node('article','');card.className='pulse-card';const link=node('a',r.title);link.href='#'+r.anchor;card.append(link,node('p',IVEvidence.origins[r.origin]),node('p',r.limit));const btn=node('button','Выбрать для сравнения');btn.type='button';btn.onclick=()=>{a.value=r.id;draw();a.focus()};card.append(btn);list.append(card)}$('evidence-count').textContent='Показано '+matches.length+' из '+rows.length}
 filter.onchange=query.oninput=catalog;catalog();
 const datasets=[['Рынок труда','independent-labour.json'],['Цены','independent-prices.json'],['Торговля','independent-trade.json']];
 await Promise.all(datasets.map(async([name,file])=>{const card=node('article','');card.className='pulse-card';card.append(node('h3',name));$('evidence-coverage').append(card);try{const data=await load(file),c=IVEvidence.coverage(data.rows);if(!c)throw Error('Нет периодов');card.append(node('strong',String(c.count)+' месяцев'),node('p',c.first+' — '+c.last),node('p','Пропущено внутри интервала: '+c.missing),node('p',data.status==='downloaded'?'Автоматически загружено':data.status==='cached'?'Сохранённый машинный набор':data.status==='cached_after_error'?'Ошибка обновления; сохранённый набор':'Ручной набор / пилот'));}catch{card.append(node('p','Набор недоступен; охват не установлен'))}}));
 }catch(e){status.textContent='Паспорта недоступны: '+e.message}
});
