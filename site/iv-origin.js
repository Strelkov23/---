/* Evidence register: source lineage and coverage, not an independence score. */
const IVOrigin=(()=>{
 const files=['independent-labour.json','independent-prices.json','independent-trade.json','independent-physical.json','independent-ember.json'];
 const categories={platform:'Платформенное измерение',panel:'Панель покупок',official:'Официальная статистика (републикация)',customs:'Таможенная статистика партнёра',corporate:'Корпоративное раскрытие',state:'Корпоративное раскрытие госкомпании',republished:'Републикация корпоративного раскрытия',compiled:'Внешняя компиляция'};
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 function coverage(periods){const p=[...new Set(periods.filter(x=>typeof x==='string'&&/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(x)))].sort();return {count:p.length,first:p[0]||null,last:p.at(-1)||null}}
 function collect(data){
  const rows=[],add=(id,title,category,periods,observations,source,verification,anchor,notes)=>rows.push({id,title,category,...coverage(periods),observations,source:typeof source==='string'&&source.startsWith('https://')?source:null,verification,anchor,notes});
  const lab=data[files[0]],prices=data[files[1]],trade=data[files[2]],physical=data[files[3]],ember=data[files[4]];
  const list=(d,s)=>d?.schema===s&&Array.isArray(d.rows)?d.rows:[];
  let a=list(lab,'iv-labour-v1').filter(x=>finite(x.value));
  add('hh','hh.ru: резюме на вакансию','platform',a.map(x=>x.period),a.length,'https://stats.hh.ru/about',lab?.verification?.index_count===a.length&&lab.verification.snapshot_values===6?'Ручная сверка оригинальных PDF: '+lab.verification.date+'; 15 значений индекса и 6 дополнительных показателей':'Ручной перенос; полный статус сверки не подтверждён','iv-hh','Охват платформы, не всё население; не уровень безработицы.');
  a=list(prices,'iv-prices-v1').filter(x=>finite(x.level));
  add('romir','РОМИР: индекс FMCG','panel',a.map(x=>x.period),a.length,a[0]?.url,prices?.verification?.romir||'Ручная выборка','iv-price-comparison','Периоды индекса FMCG; не общая потребительская корзина.');
  const o=a.filter(x=>x.official&&['mom','yoy','ytd'].every(k=>Array.isArray(x.official[k])&&x.official[k].length===3&&x.official[k].every(finite)));
  add('cpi','Росстат: ИПЦ (КонсультантПлюс)','official',o.map(x=>x.period),o.length*9,prices?.official_source,prices?.verification?.official||'Ручная выборка','iv-price-comparison','Официальное происхождение; републикация не создаёт второго измерения.');
  a=list(trade,'iv-trade-v1').filter(x=>finite(x.us_exports)&&finite(x.us_imports));
  add('trade','U.S. Census Bureau: торговля товарами','customs',a.map(x=>x.period),a.length*2,trade?.source,trade?.last_success?'Машинная загрузка: '+trade.last_success+(trade.error?' · последняя попытка неудачна':''):'Ручная выборка; полная машинная загрузка в архиве не подтверждена','iv-trade','Только торговля США с Россией; номинальные доллары.');
  for(const c of physical?.schema==='iv-physical-v1'&&Array.isArray(physical.companies)?physical.companies:[]){
   const category=c.origin==='corporate_disclosure_state_owned'?'state':c.origin==='corporate_disclosure_republished'?'republished':'corporate';
   const obs=(c.rows||[]).flatMap(r=>(c.metrics||[]).filter(m=>finite(r[m.id])).map(m=>({year:r.year,metric:m.id})));
   add(c.id,c.title,category,obs.map(r=>String(r.year)),obs.length,c.source,'Ручной перенос; '+(category==='republished'?'первичный документ не сверён':'полная повторная сверка не завершена'),'iv-physical',c.scope||'');
  }
  a=list(ember,'iv-ember-v1');
  const obs=a.flatMap(r=>Object.values(r.values||{}).filter(finite));
  add('ember','Ember: годовая генерация','compiled',a.filter(r=>Object.values(r.values||{}).some(finite)).map(r=>String(r.year)),obs.length,ember?.documentation||'https://ember-energy.org/data/yearly-electricity-data/',ember?.success?'Машинная загрузка: '+ember.success+(ember.error?' · последняя попытка неудачна':''):'Сетевой тест успешен; в этой версии архива загрузка отсутствует','iv-ember','Внешний агрегатор; возможны общие первоисточники с другими рядами.');
  return rows
 }
 return {files,categories,coverage,collect};
})();
if(typeof module!=='undefined')module.exports=IVOrigin;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),body=$('iv-origin-rows');if(!body)return;
 const status=$('iv-origin-status'),pick=$('iv-origin-category'),only=$('iv-origin-present'),exp=$('iv-origin-export');
 try{
 const got=await Promise.allSettled(IVOrigin.files.map(file=>load(file))),data=Object.fromEntries(got.map((r,i)=>[IVOrigin.files[i],r.status==='fulfilled'?r.value:null]));
 const rows=IVOrigin.collect(data);
 for(const [id,label] of Object.entries(IVOrigin.categories))pick.add(new Option(label,id));
 function draw(){
  body.replaceChildren();const selected=rows.filter(r=>(!pick.value||r.category===pick.value)&&(!only.checked||r.observations>0));
  for(const r of selected){const tr=body.insertRow();const name=node('a',r.title);name.href='#'+r.anchor;tr.insertCell().append(name);
   for(const v of [IVOrigin.categories[r.category],r.first?r.first+' — '+r.last:'Нет ряда',String(r.count),String(r.observations),r.verification,r.notes])tr.insertCell().textContent=v;
   const td=tr.insertCell();if(r.source){const a=node('a','Источник');a.href=r.source;td.append(a)}else td.textContent='Нет ссылки'
  }
  status.textContent='Показано '+selected.length+' из '+rows.length+' записей реестра. Наборы не складываются в единый показатель качества. Числа отражают наличие данных в этой версии, а не их независимую верификацию.';
  exp.disabled=!selected.length;exp.onclick=()=>csv('iv-source-lineage.csv',[['Источник','Происхождение','Первый период','Последний период','Число периодов','Число значений/наблюдений','Проверка','Ограничения','URL'],...selected.map(r=>[r.title,IVOrigin.categories[r.category],r.first,r.last,r.count,r.observations,r.verification,r.notes,r.source])])
 }
 pick.disabled=only.disabled=false;pick.onchange=only.onchange=draw;draw()
 }catch(e){status.textContent='Реестр недоступен: '+e.message}
});
