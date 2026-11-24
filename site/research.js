// Research modules. All data remain source-labelled and missing values remain missing.
document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 const f=v=>Number.isFinite(v)?fmt(v):'—';
 const a=(label,url)=>{const x=node('a',label);x.href=url;return x};
 const metric=(host,label,value)=>{const x=node('div','');x.className='metric';x.append(node('b',value),node('span',label));host.append(x)};
 function table(host,headers,rows){
  const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
  headers.forEach(v=>{const th=node('th',v);th.scope='col';h.append(th)});
  rows.forEach(row=>{const tr=b.insertRow();row.forEach(v=>{const c=tr.insertCell();if(v instanceof Node)c.append(v);else c.textContent=v??'—'})});
  host.replaceChildren(t);
 }
 async function dataVersion(){
  if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}
 }
 const missing='Не удалось загрузить набор для выбранной версии. Откройте текущую версию или проверьте сеть.';
 await dataVersion();
 if($('stat-form')){
  try{
   const [series,catalog]=await Promise.all([load('compare.json'),load('catalog.json')]);
   const items=Object.entries(catalog).map(([code,m])=>{
    const ys=Object.keys(series[code]?.values||{}).map(Number).sort((a,b)=>a-b);
    return {...m,code,ys,gaps:ys.length?ys.at(-1)-ys[0]+1-ys.length:0};
   });
   metric($('stat-metrics'),'рядов в реестре',fmt(items.length));
   metric($('stat-metrics'),'рядов с данными',fmt(items.filter(m=>m.ys.length).length));
   metric($('stat-metrics'),'наблюдений',fmt(items.reduce((s,m)=>s+m.ys.length,0)));
   metric($('stat-metrics'),'рядов без данных',fmt(items.filter(m=>!m.ys.length).length));
   for(const v of [...new Set(items.map(m=>m.theme))].sort())$('stat-theme').add(new Option(v,v));
   const ids=['stat-q','stat-theme','stat-coverage'];restore(ids);
   function draw(){
    const q=$('stat-q').value.trim().toLowerCase(),th=$('stat-theme').value,c=$('stat-coverage').value;
    const result=items.filter(m=>(!th||m.theme===th)&&(!c||(c==='yes'?m.ys.length:c==='no'?!m.ys.length:m.gaps>0))&&[m.code,m.title,m.theme,m.unit].join(' ').toLowerCase().includes(q));
    $('stat-status').textContent='Показателей: '+fmt(result.length)+' · версия '+(version||'не определена');
    const headers=['Показатель','Единица','Данные','Пропуски внутри ряда','Последняя загрузка','Статус / источник'];
    table($('stat-list'),headers,result.map(m=>{
     const p=node('div',''),href='compare.html?left='+encodeURIComponent(m.code)+'&right='+encodeURIComponent(m.code)+(pinned?'&snapshot='+encodeURIComponent(pinned):'');
     p.append(a(m.title,pinned?href:'indicator-'+m.code+'.html'),node('small',' '+m.code));
     const st=node('div','');st.append(node('span',m.status+' · '),a('API',m.source));
     return [p,m.unit,m.ys.length?m.ys[0]+'–'+m.ys.at(-1)+' ('+m.ys.length+')':'Нет данных',m.gaps+(m.withdrawn?.length?' · отозвано '+m.withdrawn.length:''),m.success||'—',st]
    }));
    $('stat-csv').disabled=!result.length;
    $('stat-csv').onclick=()=>csv('indicator-passports.csv',[['Код','Название','Тема','Единица','Первый год','Последний год','Наблюдений','Пропуски','Отозванные годы','Успешная загрузка','Статус','API'],...result.map(m=>[m.code,m.title,m.theme,m.unit,m.ys[0],m.ys.at(-1),m.ys.length,m.gaps,(m.withdrawn||[]).join(', '),m.success,m.status,m.source])]);
    save(ids);
   }
   $('stat-form').oninput=draw;$('stat-form').onsubmit=e=>e.preventDefault();draw();
   const months=await load('industry.json');
   const by=new Map(months.map(r=>[r.period,r]));
   if(by.size){
    const keys=[...by.keys()].sort(),[y,m]=keys[0].split('-').map(Number),[endY,endM]=keys.at(-1).split('-').map(Number);
    const rows=[];for(let i=y*12+m-1;i<=endY*12+endM-1;i++){
     const k=Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'),r=by.get(k);
     rows.push([k,r?f(r.value):'Нет наблюдения',r?f(r.value-100):'—',r?a('Росстат',r.url):'—'])
    }
    table($('month-list'),['Месяц','Индекс, %','Прирост г/г, %','Источник'],rows)
   }else $('month-list').textContent='Нет доступных наблюдений';
   try{
    const data=await load('cbr.json');
    for(const [code,m] of Object.entries(data)){
     const host=node('article',''),latest=m.values.at(-1),monthly=new Map();
     for(const r of m.values)monthly.set(r.date.slice(0,7),r);
     host.append(node('h3',m.title),node('p',latest?f(latest.value)+' '+m.unit+' · '+latest.date:'Нет наблюдений'),node('p',m.status+' · проверено: '+(m.checked||'—')),a('Первоисточник',m.source),document.createTextNode(' · '),a('Запрос данных',m.query));
     const details=node('details',''),body=node('div',''),summary=node('summary','Последние 36 месяцев');details.append(summary,body);
     table(body,['Месяц','Дата последнего наблюдения',m.unit],[...monthly.entries()].slice(-36).reverse().map(([k,r])=>[k,r.date,f(r.value)]));host.append(details);
     const b=node('button','Скачать дневные наблюдения CSV');b.disabled=!m.values.length;b.onclick=()=>csv('cbr-'+code+'.csv',[['Дата','Значение','Единица','Источник','Проверено UTC'],...m.values.map(r=>[r.date,r.value,m.unit,m.source,m.success])]);host.append(b);$('cbr-list').append(host)
    }
   }catch{$('cbr-list').textContent='Данные Банка России недоступны в этой версии.'}
  }catch(e){console.error(e);$('stat-status').textContent=missing}
 }
 if($('diag-form')){
  try{
   const series=await load('compare.json');
   const rules=[
    ['Разрыв темпов: обработка и ВВП','NV.IND.MANF.KD.ZG','NY.GDP.MKTP.KD.ZG','Темп реального роста обработки минус темп реального роста ВВП. Различия состава и базисов не позволяют трактовать результат как вклад отрасли в ВВП.'],
    ['Сальдо торговли товарами и услугами / ВВП','NE.EXP.GNFS.ZS','NE.IMP.GNFS.ZS','Экспорт минус импорт, оба в % ВВП. Это не сальдо текущего счёта.'],
    ['Сбережения минус валовое накопление','NY.GNS.ICTR.ZS','NE.GDI.TOTL.ZS','Валовые сбережения минус валовое накопление, оба в % ВВП; не равно дефициту бюджета или износу фондов.'],
    ['Разрыв отраслевых темпов: промышленность и услуги','NV.IND.TOTL.KD.ZG','NV.SRV.TOTL.KD.ZG','Разность годовых темпов реальной добавленной стоимости; промышленность WDI включает строительство.']
   ];
   const ids=['diag-from','diag-to'];restore(ids);
   function draw(){
    const from=$('diag-from').valueAsNumber,to=$('diag-to').valueAsNumber;
    const host=$('diag-list');host.replaceChildren();const all=[];
    if(!Number.isInteger(from)||!Number.isInteger(to)||from>to||from<1991||to>2100){$('diag-status').textContent='Укажите допустимый период';$('diag-csv').disabled=true;return}
    for(const [title,c1,c2,note] of rules){
     const x=series[c1],y=series[c2],box=node('article',''),list=[];
     if(x&&y)for(let year=from;year<=to;year++){const a=x.values[year],b=y.values[year];if(Number.isFinite(a)&&Number.isFinite(b))list.push([year,a,b,a-b])}
     box.append(node('h2',title),node('p',note),node('p','Формула: A − B, процентные пункты. Совместных наблюдений: '+list.length));
     if(list.length){
      const last=list.at(-1);metric(box,'последний общий год '+last[0],f(last[3])+' п. п.');
      const detail=node('details',''),summary=node('summary','Таблица и исходные ряды'),holder=node('div','');detail.append(summary,holder);
      table(holder,['Год','A: '+x.title,'B: '+y.title,'A − B, п. п.'],list.map(r=>[r[0],f(r[1]),f(r[2]),f(r[3])]));
      box.append(detail,a('Открыть сравнение исходных рядов','compare.html?left='+c1+'&right='+c2+'&begin='+from+'&finish='+to+(pinned?'&snapshot='+encodeURIComponent(pinned):'')));
      for(const r of list)all.push([title,c1,c2,...r,note]);
     }else box.append(node('p','Нет сопоставимых наблюдений; расчёт не выполнен.'));
     host.append(box)
    }
    $('diag-status').textContent='Рассчитано наблюдений: '+fmt(all.length)+' · источник WDI';$('diag-csv').disabled=!all.length;
    $('diag-csv').onclick=()=>csv('diagnostics.csv',[['Диагностика','Код A','Код B','Год','A','B','Разность, п.п.','Ограничение'],...all]);save(ids);
   }
   $('diag-form').oninput=draw;$('diag-form').onsubmit=e=>e.preventDefault();draw()
  }catch(e){console.error(e);$('diag-status').textContent=missing}
 }
 if($('scenario-form')){
  try{
   const m=await load('sectors.json'),inputs=[];
   table($('scenario-input'),['Группа','Спрос 2021, млрд ₽','Изменение спроса, %'],m.names.map((n,i)=>{
    const input=node('input','');input.type='number';input.min='-20';input.max='20';input.step='0.1';input.value='0';input.setAttribute('aria-label','Изменение спроса: '+n);inputs.push(input);return [n,f(m.demand[i]/1000),input]
   }));
   const cap=$('scenario-cap');
   function draw(){
    const p=inputs.map(x=>x.valueAsNumber),limit=cap.valueAsNumber;
    if(inputs.some(x=>!x.value||!x.validity.valid)||!cap.value||!cap.validity.valid||p.some(v=>!Number.isFinite(v))||!Number.isFinite(limit)){
     $('scenario-status').textContent='Укажите допустимые изменения спроса от −20 до 20% и предел 0–100%';$('scenario-metrics').replaceChildren();$('scenario-output').replaceChildren();$('scenario-download').disabled=true;$('scenario-store').disabled=true;return
    }
    const sum=arr=>arr.reduce((a,b)=>a+b,0);
    const direct=sum(p.map((v,i)=>m.demand[i]*v/100000));
    const dx=m.effects.map(row=>sum(row.map((v,i)=>v*p[i]/100000)));
    const total=sum(dx),imports=sum(m.imports.map((v,i)=>v*p[i]/100000));
    const rows=m.names.map((name,i)=>[name,p[i],dx[i],m.output[i]>0?dx[i]*100000/m.output[i]:null]);
    const warnings=rows.filter(r=>r[3]!==null&&r[3]>limit).length;
    $('scenario-status').textContent='Групп выше условного предела: '+warnings+' из '+m.names.length+'. Это проверка допущения, не прогноз дефицита.';
    $('scenario-metrics').replaceChildren();
    for(const [l,v] of [['Прямой эффект',direct],['Валовой выпуск',total],['Косвенный эффект',total-direct],['Импортные затраты',imports]])metric($('scenario-metrics'),l,f(v)+' млрд ₽');
    table($('scenario-output'),['Группа','Спрос, %','Δ выпуск, млрд ₽','Δ выпуск, % базы','Условный предел'],rows.map(r=>[r[0],f(r[1]),f(r[2]),f(r[3]),r[3]===null?'Нет базы':r[3]>limit?'Превышен':'Не превышен']));
    $('scenario-download').disabled=false;$('scenario-store').disabled=false;
    $('scenario-download').onclick=()=>csv('multi-sector-scenario-2021.csv',[['Источник','https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'],['Условный предел, %',limit],['Прямой эффект, млрд ₽',direct],['Валовой выпуск, млрд ₽',total],['Косвенный эффект, млрд ₽',total-direct],['Импортные затраты, млрд ₽',imports],['Группа','Δ спроса, %','Δ выпуска, млрд ₽','Δ выпуска, %'],...rows]);
    $('scenario-store').onclick=()=>{try{
     const key='economics-brief-models',saved=JSON.parse(localStorage.getItem(key)||'{}'),url=new URL(location.href);
     if(version)url.searchParams.set('snapshot',version);
     url.searchParams.set('shocks',p.join(','));url.searchParams.set('cap',limit);
     saved[url.href]={name:'Многовариантный сценарий',percent:0,url:url.href,steps:['Изменение валового выпуска: '+f(total)+' млрд ₽','Прямой эффект: '+f(direct)+' млрд ₽','Импортные затраты: '+f(imports)+' млрд ₽','Условный предел: '+limit+'%; превышений: '+warnings,...rows.filter(r=>r[1]).map(r=>r[0]+' · '+r[1]+'% спроса')]};
     localStorage.setItem(key,JSON.stringify(saved));$('scenario-store').textContent='Сохранено в рабочем столе'
    }catch{$('scenario-store').textContent='Сохранение недоступно; скачайте CSV'}};
   }
   const qs=new URLSearchParams(location.search),shocks=qs.get('shocks')?.split(',')||[];
   if(shocks.length===inputs.length)inputs.forEach((x,i)=>x.value=shocks[i]);if(qs.has('cap'))cap.value=qs.get('cap');
   inputs.forEach(x=>x.oninput=draw);cap.oninput=draw;$('scenario-form').onsubmit=e=>e.preventDefault();$('scenario-form').onreset=()=>setTimeout(()=>{inputs.forEach(x=>x.value='0');draw()},0);draw()
  }catch(e){console.error(e);$('scenario-status').textContent=missing}
 }
 if($('quality-status')){
  try{
   const s=await load('status.json'),c=await load('catalog.json'),d=await load('compare.json');
   const entries=Object.entries(c),news=Object.entries(s.news).sort((a,b)=>b[1]-a[1]),n=news.reduce((a,b)=>a+b[1],0);
   const h=$('quality-status');h.replaceChildren(node('p','Сборка: '+s.built+' · версия '+(version||'не определена')),node('p','Ряды с наблюдениями: '+entries.filter(([k])=>Object.keys(d[k]?.values||{}).length).length+' из '+entries.length),node('p','Ошибки активных источников: '+s.failures.length),node('p','Доля крупнейшего СМИ / источника в архиве: '+(n?f(100*news[0][1]/n)+'% · '+news[0][0]:'нет данных')));
   const list=node('ul','');s.failures.forEach(x=>list.append(node('li',x)));h.append(list)
  }catch(e){console.error(e);$('quality-status').textContent=missing}
 }
});
