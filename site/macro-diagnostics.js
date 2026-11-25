/* Reproducible paired-year economic diagnostics; no imputation or causal inference. */
const MacroDiagnostics=(()=>{
 const rules=[
 ['manufacturing','Производство','Разрыв темпов: обработка и ВВП','NV.IND.MANF.KD.ZG','NY.GDP.MKTP.KD.ZG','diff','п. п.','Разность темпов реального роста, не вклад отрасли в ВВП.'],
 ['trade','Внешняя экономика','Сальдо торговли товарами и услугами / ВВП','NE.EXP.GNFS.ZS','NE.IMP.GNFS.ZS','diff','п. п.','Не равно сальдо текущего счёта.'],
 ['saving','Инвестиции','Сбережения минус валовое накопление','NY.GNS.ICTR.ZS','NE.GDI.TOTL.ZS','diff','п. п.','Разность долей ВВП, не дефицит бюджета.'],
 ['industry-services','Производство','Разрыв темпов промышленности и услуг','NV.IND.TOTL.KD.ZG','NV.SRV.TOTL.KD.ZG','diff','п. п.','Промышленность WDI включает строительство.'],
 ['investment-growth','Инвестиции','Темпы накопления основного капитала и ВВП','NE.GDI.FTOT.KD.ZG','NY.GDP.MKTP.KD.ZG','diff','п. п.','Не означает изменение доли инвестиций в текущих ценах или чистое накопление.'],
 ['manufacturing-share','Производство','Доля обработки в добавленной стоимости промышленности','NV.IND.MANF.ZS','NV.IND.TOTL.ZS','ratio100','%','Промышленность включает строительство. Это доля текущих цен, не индекс физического выпуска.'],
 ['productivity-ind','Труд','Производительность промышленности относительно услуг','NV.IND.EMPL.KD','NV.SRV.EMPL.KD','ratio','раз','Добавленная стоимость на занятого в одинаковых постоянных ценах. Не учитывает часы труда и качество продукции.'],
 ['productivity-agr','Труд','Производительность сельского хозяйства относительно услуг','NV.AGR.EMPL.KD','NV.SRV.EMPL.KD','ratio','раз','Сопоставление на одного занятого, не почасовая производительность.'],
 ['employment-youth','Труд','Разрыв молодёжной и общей безработицы','SL.UEM.1524.ZS','SL.UEM.TOTL.ZS','diff','п. п.','Разные возрастные знаменатели; общая рабочая сила включает молодёжь.'],
 ['age-dependency','Труд','Демографическая нагрузка старшими возрастами','SP.POP.65UP.TO.ZS','SP.POP.1564.TO.ZS','ratio100','на 100 человек 15–64 лет','Возрастное соотношение, не число пенсионеров на одного фактически занятого.'],
 ['price-gap','Цены и деньги','Разрыв инфляции и дефлятора ВВП','FP.CPI.TOTL.ZG','NY.GDP.DEFL.KD.ZG','diff','п. п.','Разные корзины и охват; разность не характеризует ошибку измерения инфляции.'],
 ['export-cover','Внешняя экономика','Покрытие импорта экспортом','NE.EXP.GNFS.ZS','NE.IMP.GNFS.ZS','ratio100','%','Товары и услуги, одинаковый знаменатель ВВП. Не покрытие внешнего долга.'],
 ['fixed-savings','Инвестиции','Накопление основного капитала относительно сбережений','NE.GDI.FTOT.ZS','NY.GNS.ICTR.ZS','ratio100','%','Только отношение двух агрегатов. Не означает долю реально направленных сбережений; при неположительных сбережениях не вычисляется.']
 ].map(([id,group,title,a,b,op,unit,note])=>({id,group,title,a,b,op,unit,note}));
 function value(a,b,op){
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  if(op==='diff')return a-b;
  if(b<=0||a<0)return null;
  const result=a/b*(op==='ratio100'?100:1);
  return Number.isFinite(result)?result:null;
 }
 function compute(rule,data,from,to){
  const a=data[rule.a]?.values||{},b=data[rule.b]?.values||{},rows=[];
  for(let year=from;year<=to;year++){const x=a[year],y=b[year],v=value(x,y,rule.op);if(v!==null)rows.push({year,a:x,b:y,value:v})}
  return rows;
 }
 const formula=op=>op==='diff'?'A − B':op==='ratio100'?'A / B × 100':'A / B';
 function snapshot(data,year){
  return rules.map(r=>{const rows=compute(r,data,year,year),current=rows[0]||null,previous=compute(r,data,year-1,year-1)[0]||null;return {...r,current,previous,change:current&&previous?current.value-previous.value:null}});
 }
 function capacitySummary(rows,year){
  const selected=rows.filter(r=>r.year===year),valid=selected.filter(r=>Number.isFinite(r.utilization_pct)&&r.utilization_pct>=0&&r.utilization_pct<=100);
  return {total:selected.length,valid:valid.length,high:valid.filter(r=>r.utilization_pct>=90).length,low:valid.filter(r=>r.utilization_pct<50).length};
 }
 function regionalSummary(rows,year,sample,stats){
  const s=sample(rows.filter(r=>r.year===year));return {statistics:stats([...s.out.values()].map(r=>r.value)),excluded:s.excluded,ambiguous:s.ambiguous};
 }
 return {rules,compute,value,formula,snapshot,capacitySummary,regionalSummary};
})();
if(typeof module!=='undefined')module.exports=MacroDiagnostics;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('diag-form');if(!form)return;
 const host=$('diag-list'),status=$('diag-status'),download=$('diag-csv'),f=v=>Number.isFinite(v)?fmt(v):'—',fields=['diag-from','diag-to','diag-group','diag-search'];
 try{
  const [data,catalog]=await Promise.all([load('compare.json'),load('catalog.json')]);
  if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}
  for(const g of [...new Set(MacroDiagnostics.rules.map(r=>r.group))])$('diag-group').add(new Option(g,g));
  restore(fields);
  const link=(title,url)=>{const a=node('a',title);a.href=url;return a};
  function draw(){
   const from=$('diag-from').valueAsNumber,to=$('diag-to').valueAsNumber,group=$('diag-group').value,q=$('diag-search').value.toLowerCase().trim(),all=[];
   host.replaceChildren();download.disabled=true;
   if(!Number.isInteger(from)||!Number.isInteger(to)||from>to||from<1991||to>2100){status.textContent='Укажите допустимый период';return}
   const rules=MacroDiagnostics.rules.filter(r=>(!group||group===r.group)&&[r.title,r.note,r.a,r.b].join(' ').toLowerCase().includes(q));
   for(const r of rules){
    const rows=MacroDiagnostics.compute(r,data,from,to),box=node('article',''),formula=MacroDiagnostics.formula(r.op),A=data[r.a],B=data[r.b];
    box.append(node('small',r.group),node('h2',r.title),node('p',r.note),node('p','Формула: '+formula+' · единица результата: '+r.unit+' · совместных наблюдений: '+rows.length+' из '+(to-from+1)));
    if(!rows.length){box.append(node('p','Нет сопоставимых наблюдений. Неположительные знаменатели и пропуски не заменяются нулём.'));host.append(box);continue}
    const last=rows.at(-1),first=rows[0],metrics=node('div','');metrics.className='metrics';
    for(const [label,v] of [['Последний общий год: '+last.year,f(last.value)+' '+r.unit],['Первый общий год: '+first.year,f(first.value)+' '+r.unit],['Изменение уровня',f(last.value-first.value)+' '+(r.unit==='%'?'п. п.':r.unit)]]){const item=node('div','');item.className='metric';item.append(node('b',v),node('span',label));metrics.append(item)}box.append(metrics);
    const detail=node('details',''),summary=node('summary','График, исходные значения и источники'),holder=node('div','');detail.append(summary,holder);box.append(detail);
    detail.addEventListener('toggle',()=>{if(!detail.open||holder.childElementCount)return;
     const years=Array.from({length:last.year-first.year+1},(_,i)=>first.year+i),by=new Map(rows.map(v=>[v.year,v.value])),values=years.map(y=>by.get(y)??null),lo=Math.min(...rows.map(v=>v.value)),hi=Math.max(...rows.map(v=>v.value)),pad=lo===hi?Math.max(1,Math.abs(lo)*.05):0;
     const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 245');svg.setAttribute('role','img');svg.setAttribute('aria-label',r.title);
     const x=i=>years.length===1?420:120+590*i/(years.length-1),y=v=>195-160*(v-(lo-pad))/(hi-lo+2*pad);
     const shape=(tag,attrs,t)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.append(e);return e};
     for(let i=0;i<=4;i++){const v=lo-pad+(hi-lo+2*pad)*i/4;shape('line',{x1:120,x2:710,y1:y(v),y2:y(v),stroke:'#d4dcdf'});shape('text',{x:112,y:y(v)+4,'font-size':11,'text-anchor':'end'},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
     chartTickIndices(years.length,6).forEach(i=>shape('text',{x:x(i),y:221,'font-size':11,'text-anchor':i===0?'start':i===years.length-1?'end':'middle'},years[i]));
     let path='';values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(values[i-1])?'L':'M')+x(i)+' '+y(v)+' ';const dot=shape('circle',{cx:x(i),cy:y(v),r:3,fill:'#006c69'});const tip=document.createElementNS(ns,'title');tip.textContent=years[i]+': '+f(v)+' '+r.unit;dot.append(tip)});shape('path',{d:path,fill:'none',stroke:'#006c69','stroke-width':2.4});
     holder.append(svg);
     const src=[catalog[r.a]?.source,catalog[r.b]?.source].filter(Boolean);
     chartTools(holder,r.title,r.unit,years,[{name:r.title,code:r.id,values}],{source:'WDI · '+r.a+' / '+r.b,url:src.join(' | ')});
     const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
     for(const v of ['Год','A: '+A.title+' ('+A.unit+')','B: '+B.title+' ('+B.unit+')','Результат, '+r.unit]){const th=node('th',v);th.scope='col';h.append(th)}
     for(const row of rows){const tr=body.insertRow();for(const v of [row.year,f(row.a),f(row.b),f(row.value)])tr.insertCell().textContent=v}
     holder.append(table);
     const sources=node('p','');for(const [i,url] of src.entries()){if(i)sources.append(document.createTextNode(' · '));sources.append(link('Источник '+(i+1),url))}holder.append(sources);
    });
    const compare=new URL('compare.html',location.href);compare.searchParams.set('left',r.a);compare.searchParams.set('right',r.b);compare.searchParams.set('begin',from);compare.searchParams.set('finish',to);if(pinned)compare.searchParams.set('snapshot',pinned);
    box.append(link('Сопоставить исходные ряды',compare.href));host.append(box);
    for(const row of rows)all.push([r.id,r.group,r.title,r.a,r.b,formula,r.unit,row.year,row.a,row.b,row.value,catalog[r.a]?.source,catalog[r.b]?.source,r.note]);
   }
   status.textContent='Рассчитано наблюдений: '+fmt(all.length)+' · диагностик: '+rules.length+' из '+MacroDiagnostics.rules.length+' · источник WDI';
   download.disabled=!all.length;download.onclick=()=>csv('macro-diagnostics.csv',[['Код','Тема','Показатель','Код A','Код B','Формула','Единица','Год','A','B','Результат','Источник A','Источник B','Ограничение'],...all]);save(fields);
  }
  form.oninput=draw;form.onsubmit=e=>e.preventDefault();form.onreset=()=>setTimeout(draw,0);draw()
 }catch(e){console.error(e);status.textContent='Не удалось загрузить данные для выбранной версии.'}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('diag-overview-cards');if(!host)return;
 const year=$('diag-overview-year'),status=$('diag-overview-status'),exp=$('diag-overview-export'),details=$('diag-overview-table');
 const sourceBalance='https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx',f=v=>Number.isFinite(v)?fmt(v):'—',link=(label,url)=>{const a=node('a',label);const u=new URL(url,location.href);if(pinned&&u.origin===location.origin)u.searchParams.set('snapshot',pinned);a.href=u.href;return a};
 const manifests=await Promise.allSettled([load('data-manifest.json').then(Provenance.validateManifest)]);
 if(manifests[0].status!=='fulfilled'){status.textContent='Не удалось проверить манифест. Сводные числа не отображаются.';return}
 const m=manifests[0].value,get=name=>Provenance.get(m,name,root),entries=await Promise.allSettled(['compare.json','historical.json','capital-data.json','sectors.json','catalog.json'].map(get));
 const data=entries.map(e=>e.status==='fulfilled'?e.value:null),[macro,historical,capital,balance,catalog]=data;
 const codes=['R_f54f02504bfb051e_84c74d6e51','R_a4138d558584b81a_1db3db8e79'];
 const regionMeta=codes.map(code=>{const found=(historical?.data.series||[]).filter(r=>r.code===code);return found.length===1?found[0]:null});
 const regionEntries=await Promise.allSettled(regionMeta.map(r=>r?get(r.file):Promise.reject(Error('Ряд отсутствует'))));
 const regionData=regionEntries.map((r,i)=>{if(r.status!=='fulfilled')return null;const e=r.value,meta=regionMeta[i];return e.data.title===meta.title&&e.data.unit===meta.unit&&e.data.source===meta.source?e:null});
 const years=new Set();
 if(macro)for(const r of MacroDiagnostics.rules)for(const y of Object.keys(macro.data[r.a]?.values||{}))if(/^\d{4}$/.test(y))years.add(Number(y));
 for(const r of capital?.data.capacity||[])if(Number.isInteger(r.year))years.add(r.year);
 for(const e of regionData)for(const r of e?.data.values||[])if(Number.isInteger(r.year))years.add(r.year);
 const ys=[...years].filter(y=>y>=1991&&y<=2100).sort((a,b)=>b-a);
 year.replaceChildren(...ys.map(y=>new Option(String(y),String(y))));year.disabled=!ys.length;
 // Select the newest year with all three statistical domains present, otherwise latest available.
 const common=ys.find(y=>macro&&MacroDiagnostics.snapshot(macro.data,y).some(r=>r.current)&&capital?.data.capacity.some(r=>r.year===y)&&regionData.every(e=>e?.data.values.some(r=>r.year===y)));
 if(common)year.value=String(common);
 function draw(){
  host.replaceChildren();details.replaceChildren();const y=Number(year.value),rows=[];
  function card(title,period,value,description,url){
   const el=node('article','');el.className='diag-overview-card';el.append(node('small',period),node('h3',title),node('strong',value),node('p',description),link('Открыть подробный анализ',url));host.append(el)
  }
  if(!ys.length){status.textContent='Проверенных годовых данных для сводки нет.';return}
  const add=(group,title,period,value,unit,coverage,source,hash,note)=>rows.push([group,title,period,value,unit,coverage,source,hash,note,m.data_fingerprint]);
  const snapshot=macro?MacroDiagnostics.snapshot(macro.data,y):[];
  const count=snapshot.filter(r=>r.current).length;
  card('Макроэкономические разрывы',String(y),count+' / '+MacroDiagnostics.rules.length,'Сопоставимые пары годовых рядов WDI; не число кризисных сигналов.','diagnostics.html#diag-form');
  for(const r of snapshot){const sources=[catalog?.data[r.a]?.source,catalog?.data[r.b]?.source].filter(Boolean).join(' | ')||'WDI: '+r.a+' / '+r.b;add('Макроэкономика',r.title,y,r.current?.value,r.unit,r.current?'одна пара':'нет пары',sources,macro.sha256,r.note)}
  for(const [i,e] of regionData.entries()){
   const meta=regionMeta[i],title=i===0?'ВРП на душу населения: разброс регионов':'Безработица: разброс регионов',s=e?MacroDiagnostics.regionalSummary(e.data.values,y,RegionalStats.sample,RegionalStats.stats):null,v=s?.statistics;
   card(title,String(y),v?f(v.p90)+' / '+f(v.p10):'Нет данных',v?'P90 / P10 — два уровня в исходных единицах. '+v.n+' непересекающихся территорий.':'Нет проверенной выборки за выбранный год.','historical.html#regional-disparities');
   if(e)for(const [k,label] of [['median','Медиана'],['p10','P10'],['p90','P90'],['ratio','P90 / P10']])add('Регионы',meta.title+' · '+label,y,v?.[k],k==='ratio'?'раз':meta.unit,v?.n??0,meta.source,e.sha256,'Невзвешенная выборка; исключено '+s.excluded+', неоднозначных территорий '+s.ambiguous);
  }
  const c=capital?MacroDiagnostics.capacitySummary(capital.data.capacity,y):null;
  card('Высокая загрузка мощностей',String(y),c?.valid?c.high+' / '+c.valid:'Нет данных','Продукты с использованием среднегодовой мощности ≥90%; не доля всей промышленности.','capital.html');
  if(c)for(const [label,value] of [['Загрузка не менее 90%',c.valid?c.high:null],['Загрузка менее 50%',c.valid?c.low:null]])add('Мощности',label,y,value,'продуктов',c.valid,'Росстат · документальный снимок capital-data.json',capital.sha256,'Числовых позиций '+c.valid+' из '+c.total+'; пороги описательные');
  let concentrated=null,eligible=0;
  if(balance){const d=balance.data;if(Array.isArray(d.names)&&Array.isArray(d.flows)&&d.flows.length===d.names.length&&d.flows.every(r=>r.length===d.names.length&&r.every(Number.isFinite))){
   const top=d.names.map((_,i)=>{const vals=d.flows.map(r=>r[i]),total=vals.reduce((a,b)=>a+b,0);return total>0&&vals.every(v=>v>=0)?Math.max(...vals)/total:null}).filter(Number.isFinite);eligible=top.length;concentrated=eligible?top.filter(v=>v>=.5).length:null;
  }}
  card('Концентрация промежуточных закупок','Баланс 2021',Number.isFinite(concentrated)?concentrated+' / '+eligible:'Нет данных','Группы, где крупнейший поставщик занимает ≥50% отечественных промежуточных закупок.','atlas.html#supplier-dependencies');
  if(balance)add('Межотраслевой баланс','Крупнейший поставщик ≥50%',2021,concentrated,'групп',eligible,sourceBalance,balance.sha256,'Включены внутригрупповые потоки; описательный порог, не риск остановки');
  card('Сценарная диагностика','Условная модель 2021','Отдельный расчёт','Задайте ограничения и конечный спрос; сценарий не смешивается с наблюдаемой статистикой.','scenario.html#chain-stress');
  const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();for(const label of ['Направление','Показатель','Год','Значение','Единица','Охват']){const th=node('th',label);th.scope='col';h.append(th)}for(const r of rows){const tr=body.insertRow();for(const v of [r[0],r[1],r[2],f(r[3]),r[4],r[5]])tr.insertCell().textContent=v??'—'}details.append(t);
  const missing=[...entries,...regionEntries].filter(x=>x.status!=='fulfilled').length;
  status.textContent='Год статистики: '+y+' · межотраслевой баланс: 2021 · отпечаток: '+m.data_fingerprint.slice(0,12)+'… · недоступных файлов: '+missing+'. Пропуски не заменены нулями.';
  exp.disabled=!rows.length;exp.onclick=()=>csv('economic-diagnostic-overview-'+y+'.csv',[['Направление','Показатель','Год','Значение','Единица','Охват','Источник','SHA-256 JSON','Ограничение','Отпечаток манифеста'],...rows]);
 }
 year.onchange=draw;draw();
});
