/* Evidence dashboard: separate dates and definitions; no combined score. */
const IVEvidence=(()=>{
 const specs=[
 ['labour','independent-labour.json','iv-labour-v1','Рынок труда','hh.ru','Платформенные наблюдения','iv-hh','резюме на вакансию'],
 ['trade','independent-trade.json','iv-trade-v1','Внешняя торговля','U.S. Census Bureau','Таможенная статистика партнёра','iv-trade','млн USD'],
 ['prices','independent-prices.json','iv-prices-v1','Цены повседневных покупок','РОМИР','Панель покупок','iv-price-comparison','% к предыдущему месяцу']
 ];
 function monthIndex(s){return typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)?Number(s.slice(0,4))*12+Number(s.slice(5))-1:null}
 function select(rows,asof){const limit=monthIndex(asof);if(limit===null)return null;return rows.filter(r=>monthIndex(r.period)!==null&&monthIndex(r.period)<=limit).sort((a,b)=>b.period.localeCompare(a.period))[0]||null}
 function verification(spec,d){
  if(spec[0]==='trade')return ['downloaded','cached','cached_after_error'].includes(d.status)&&d.last_success&&/^[a-f0-9]{64}$/.test(d.source_sha256||'')?'machine':d.seed_verification==='documented_manual'&&d.seed_recheck_count===66&&d.rows.length===33&&d.seed_recheck_date?'documented_manual':'pending';
  if(spec[0]==='labour')return d.verification?.date&&d.verification.index_count===d.rows.length&&d.verification.snapshot_values===6?'documented_manual':'pending';
  if(spec[0]==='prices')return d.verification?.date&&d.verification.romir&&d.rows.length===3?'documented_manual':'pending';
  return 'pending'
 }
 function evaluate(spec,d,asof){
  if(!d||d.schema!==spec[2]||!Array.isArray(d.rows))throw Error('Неверная схема');
  const row=select(d.rows,asof),age=row?monthIndex(asof)-monthIndex(row.period):null,finite=v=>typeof v==='number'&&Number.isFinite(v);
  let value=null,derived=false,source=null;
  if(row&&spec[0]==='labour'){if(finite(row.value))value=row.value;source=d.sources?.[row.source]?.url}
  if(row&&spec[0]==='trade'){if(finite(row.us_imports)&&finite(row.us_exports))value=row.us_imports+row.us_exports;source=d.source}
  if(row&&spec[0]==='prices'){if(finite(row.mom))value=row.mom;else if(finite(row.mom_pp)&&finite(row.level)&&row.level-row.mom_pp>0){value=100*(row.level/(row.level-row.mom_pp)-1);derived=true}source=row.url}
  return {row,value,age,derived,source,status:d.status,verification:verification(spec,d),checked:d.verification?.date||d.last_success||d.seed_recheck_date||null,error:d.error||null};
 }return {specs,monthIndex,select,evaluate,verification};
})();
if(typeof module!=='undefined')module.exports=IVEvidence;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('iv-evidence-cards');if(!host)return;
 const month=$('iv-evidence-month'),exact=$('iv-evidence-exact'),draft=$('iv-evidence-draft'),status=$('iv-evidence-status'),f=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 const checked=await Promise.allSettled(IVEvidence.specs.map(s=>load(s[1])));
 const data=checked.map((r,i)=>({spec:IVEvidence.specs[i],data:r.status==='fulfilled'?r.value:null}));
 const latest=data.flatMap(x=>x.data?.rows||[]).map(r=>r.period).filter(s=>IVEvidence.monthIndex(s)!==null).sort().at(-1);
 if(!latest){status.textContent='Ни один набор не загрузился. Проверьте источники.';return}
 month.value=latest;month.max=latest;month.disabled=exact.disabled=draft.disabled=false;
 function render(){
  host.replaceChildren();let valid=0,current=0,machine=0,manual=0,pending=0;
  for(const {spec,data:d} of data){const [id,file,schema,title,publisher,origin,anchor,unit]=spec;const box=node('article','');box.className='pulse-card';box.append(node('h3',title),node('p',publisher+' · '+origin));const a=node('a','Открыть анализ и методику');a.href='independent-statistics.html#'+anchor;
   try{const r=IVEvidence.evaluate(spec,d,month.value);if(r.value!==null){if(r.verification==='pending')pending++;else if(r.verification==='machine')machine++;else manual++;if(r.verification!=='pending'||draft.checked){valid++;if(r.age===0)current++}}
    const show=r.value!==null&&(r.verification!=='pending'||draft.checked)&&(!exact.checked||r.age===0);
    box.append(node('strong',show?f(r.value)+' '+unit:r.value!==null&&r.verification==='pending'&&!draft.checked?'Предварительный ряд скрыт':'Нет наблюдения'),node('p',r.row?'Период: '+r.row.period+' · '+(r.age===0?'выбранный месяц':'ранее на '+r.age+' мес.'):'До выбранного месяца данных нет.'));
    box.append(node('small',id==='trade'?'Сумма экспорта и импорта США с Россией; не вся внешняя торговля.':id==='prices'?(r.derived?'Темп рассчитан из уровня индекса.':'Корзина FMCG, не общий ИПЦ.'):'Не уровень безработицы.'));
    const update=({manual_verified_labels:'Ручной перенос',manual_published_observations:'Ручной перенос',manual_seed:'Ручная выборка',downloaded:'Автоматическая загрузка',cached:'Сохранённая загрузка',cached_after_error:'Ошибка обновления: сохранён ряд',seed_after_error:'Ошибка обновления: ручная выборка'})[r.status]||'Статус не определён';
    box.append(node('p',({machine:'Машинный импорт',documented_manual:'Документированная ручная сверка',pending:'Повторная сверка не подтверждена'})[r.verification]+' · '+update+(r.checked?' · '+r.checked:'')));if(r.error)box.append(node('small',r.error));
    if(r.source&&r.source.startsWith('https://')){const link=node('a','Первоисточник');link.href=r.source;box.append(link,node('p',''))}
   }catch(e){box.append(node('p','Набор недоступен или некорректен.'))}box.append(a);host.append(box)
  }
  status.textContent='Есть наблюдение до выбранного месяца: '+valid+' из '+data.length+'. Точно за выбранный месяц: '+current+' из '+data.length+'. До выбранного месяца: машинный импорт '+machine+'; документированная ручная сверка '+manual+'; предварительные '+pending+'. Наблюдения не объединяются в общий индекс. Это фильтр периода измерения, а не исторической доступности публикаций.';
 }
 month.onchange=exact.onchange=draft.onchange=render;render();
});
