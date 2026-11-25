/* Multivariate regional comparison: separate units, no weighted score. */
const RegionalDashboard=(()=>{
 const specs=[
 ['Экономика','R_7e8fd799d1d06897_84c74d6e51','Валовой региональный продукт','Миллионов рублей'],
 ['Экономика','R_f54f02504bfb051e_84c74d6e51','Валовой региональный продукт на душу населения','Рублей'],
 ['Производство','MFG_total_099b62c9d9','Отгрузка: Обрабатывающие производства — всего (ОКВЭД2 C)','Миллионов рублей'],
 ['Инвестиции','R_88230ed30f2f2738_bf6a5a3983','Инвестиции в основной капитал','В фактически действовавших ценах, миллионов рублей'],
 ['Труд','R_65254a01945743d3_1db3db8e79','Среднегодовая численность занятых','Тысяч человек'],
 ['Труд','R_a4138d558584b81a_1db3db8e79','Уровень безработицы: Уровень безработицы','По данным выборочных обследований рабочей силы, в процентах'],
 ['Предприятия','R_65de97d08173dfaa_fd1adecbd1','Число организаций','На конец года'],
 ['Финансы','R_ffa971b13dbda179_fd1adecbd1','Удельный вес убыточных организаций','В процентах от общего числа организаций']
 ];
 function matches(meta,spec){return !!meta&&meta.code===spec[1]&&meta.title===spec[2]&&meta.unit===spec[3]}
 function summarize(data,year,keys,sample,stats,balanced=null){
  const checked=sample(data.values.filter(r=>r.year===year));
  const entries=[...checked.out].filter(([key])=>!balanced||balanced.has(key));
  const values=entries.map(([,r])=>r.value),summary=stats(values);
  return {n:values.length,median:summary?.median??null,excluded:checked.excluded,ambiguous:checked.ambiguous,regions:keys.map(key=>{
   const r=entries.find(([id])=>id===key)?.[1];
   return {key,row:r||null,rank:r?1+values.filter(v=>v>r.value).length:null,delta:r&&summary?r.value-summary.median:null};
  })};
 }
 function common(datasets,year,sample){
  if(!datasets.length)return new Set();
  const sets=datasets.map(d=>new Set(sample(d.values.filter(r=>r.year===year)).out.keys()));
  return new Set([...sets[0]].filter(k=>sets.every(s=>s.has(k))));
 }
 return {specs,matches,summarize,common};
})();
if(typeof module!=='undefined')module.exports=RegionalDashboard;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),panel=$('geo-dashboard');if(!panel)return;
 const status=$('gd-status'),host=$('gd-table'),exp=$('gd-export'),year=$('gd-year'),scope=$('gd-scope'),picks=['gd-a','gd-b','gd-c'].map($);
 let loaded=false,busy=false;
 function textNum(v){return Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—'}
 panel.addEventListener('toggle',async()=>{
  if(!panel.open||loaded||busy)return;busy=true;status.textContent='Загрузка проверенных рядов…';
  try{
   const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
   const catalog=(await Provenance.get(manifest,'historical.json',root)).data.series;
   const all=await Promise.all(RegionalDashboard.specs.map(async spec=>{
    const meta=catalog.find(m=>RegionalDashboard.matches(m,spec));if(!meta)return {spec,error:'Ряд отсутствует'};
    try{const d=(await Provenance.get(manifest,meta.file,root)).data;if(d.title!==meta.title||d.unit!==meta.unit||d.source!==meta.source)throw Error('Несовпадение паспорта');return {spec,meta,data:d}}
    catch(e){return {spec,meta,error:'Не удалось проверить ряд'}}
   }));
   const active=all.filter(x=>x.data),years=[...new Set(active.flatMap(x=>x.data.values.map(r=>r.year)))].sort((a,b)=>b-a);
   year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
   if(years.includes(2024))year.value='2024';
   const options=Object.entries(RegionalMap.regionNames()).map(([iso,key])=>({iso,key,name:RegionalMap.displayName(iso,key)})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
   for(let i=0;i<picks.length;i++){picks[i].replaceChildren(new Option('Не выбран',''),...options.map(o=>new Option(o.name,o.iso)));picks[i].value=['RU-MOW','RU-SVE',''][i]}
   function draw(){
    host.replaceChildren();exp.disabled=true;
    const y=Number(year.value),selected=[...new Set(picks.map(p=>p.value).filter(Boolean))],keys=selected.map(RegionalMap.key);
    const balanced=scope.checked?(active.length===all.length?RegionalDashboard.common(active.map(x=>x.data),y,RegionalStats.sample):new Set()):null;
    const calculated=all.map(x=>({...x,result:x.data?RegionalDashboard.summarize(x.data,y,keys,RegionalStats.sample,RegionalStats.stats,balanced):null}));
    const known=calculated.filter(x=>x.result?.n>0).length;
    status.textContent='Год: '+y+' · рядов с наблюдениями: '+known+' / '+all.length+' · '+(balanced?'общая выборка всех '+all.length+' рядов: '+balanced.size+' территорий':'доступная выборка отдельно по каждому ряду')+'. Место 1 означает наибольшее значение, не лучшую оценку.';
    const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
    for(const name of ['Направление / показатель','Единица источника','Медиана','Охват',...selected.map(iso=>options.find(o=>o.iso===iso).name)]){const th=node('th',name);th.scope='col';h.append(th)}
    for(const x of calculated){const r=x.result,tr=body.insertRow(),name=tr.insertCell();name.append(node('strong',x.spec[0]),node('p',x.spec[2]));if(x.meta){const a=node('a','Ряд и график');const u=new URL('historical.html',location.href);u.searchParams.set('hist-series',x.meta.code);if(pinned)u.searchParams.set('snapshot',pinned);a.href=u.href;name.append(a)}
     for(const v of [x.spec[3],textNum(r?.median),r?r.n+' территорий · исключено '+r.excluded:x.error,...keys.map((k,i)=>{const q=r?.regions[i];return q?.row?textNum(q.row.value)+' · место '+q.rank+' из '+r.n+' · отклонение от медианы '+textNum(q.delta):'—'})])tr.insertCell().textContent=v
    }
    host.append(t);exp.disabled=!selected.length||!years.length;
    exp.onclick=()=>csv('regional-multivariate-'+y+'.csv',[['Год','Режим выборки','ISO','Регион источника','Направление','Код ряда','Показатель','Единица','Значение','Медиана','Разность с медианой','Место по убыванию','Охват','Исключено строк','Неоднозначных ключей','Статус','Источник','Лист','Строка','Столбец','Примечание','SHA-256 JSON','Отпечаток манифеста'],...calculated.flatMap(x=>selected.map((iso,i)=>{const r=x.result,q=r?.regions[i],v=q?.row;return [y,balanced?'общая':'доступная',iso,v?.region,x.spec[0],x.spec[1],x.spec[2],x.spec[3],v?.value,r?.median,q?.delta,q?.rank,r?.n,r?.excluded,r?.ambiguous,x.error||(!v?'Нет наблюдения в выборке':'Наблюдение'),x.meta?.source,v?.sheet,v?.row,v?.column,v?.note,manifest.files[x.meta?.file]?.sha256,manifest.data_fingerprint]}))]);
   }
   for(const e of [...picks,year,scope])e.onchange=draw;draw();loaded=true;
  }catch(e){status.textContent='Не удалось проверить многомерную выборку: '+String(e.message||e)}
  finally{busy=false}
 });
});
