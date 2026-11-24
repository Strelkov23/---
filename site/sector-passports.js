const SectorPassports=(()=>{
 function financeDelta(r,rows){
  const candidates=rows.filter(x=>x.year===r.year-1&&x.local_code===r.local_code&&x.metric===r.metric);
  const prev=candidates.length===1?candidates[0]:null;
  return prev?.sign==='numeric'&&r.sign==='numeric'&&Number.isFinite(prev.value)&&Number.isFinite(r.value)?Number((r.value-prev.value).toFixed(8)):null
 }
 return {financeDelta}
})();
if(typeof module!=='undefined')module.exports=SectorPassports;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('sp-form'))return;
 const ids=['sp-sector','sp-q','sp-provider','sp-coverage','sp-chart-series','sp-chart-span'],picker=$('sp-sector'),provider=$('sp-provider'),status=$('sp-status');
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
  const requestedSector=new URLSearchParams(location.search).get('sp-sector');
  restore(ids.filter(id=>id!=='sp-chart-series'));
  if(requestedSector&&!profiles.some(p=>p.id===requestedSector)){
   const warning=node('p','Запрошенного паспорта нет в этой версии архива. Показан первый доступный паспорт.');
   $('sp-form').before(warning)
  }
  const initialChart=new URLSearchParams(location.search).get('sp-chart-series');let activeRows=[],firstChart=true;
  const datasets=await Promise.allSettled(['compare.json','industrial.json','national.json'].map(load));
  const [wdi,industry,national]=datasets.map(d=>d.status==='fulfilled'?d.value:null);
  const industrialById=new Map((industry?.series||[]).map(s=>[s.id,s]));
  let balance=null;try{balance=await load('sectors.json')}catch{}
  let regional=[];try{regional=(await load('historical.json')).series}catch{}
  const regionalTerms={agriculture:['продукция сельского хозяйства','валовой сбор зерна','производство молока'],light:['производство текстильных изделий','производство одежды','производство кожи'],chemical:['производство химических веществ','химическое производство'],pharma:['производство лекарственных средств'],metal:['металлургическое производство','производство металлургическое','производство готовых металлических изделий'],wood:['обработка древесины','производство бумаги'],materials:['производство резиновых и пластмассовых изделий','производство прочей неметаллической минеральной продукции'],food:['производство пищевых продуктов','производство напитков','производство табачных изделий'],machinery:['производство машин и оборудования','производство компьютеров','производство автотранспортных средств','производство прочих транспортных средств','производство электрического оборудования'],energy:['обеспечение электрической энергией','производство и распределение электроэнергии'],transport:['грузооборот автомобильного транспорта','перевозки грузов автомобильным транспортом','перевозки пассажиров автобусами'],technology:['объем инновационных товаров','внутренние затраты на исследования и разработки'],mining:['добыча полезных ископаемых'],manufacturing:['обрабатывающие производства'],construction:['инвестиции в основной капитал','валовое накопление основного капитала','индексы промышленного производства'],finance:['консолидированных бюджетов субъектов'],services:['фактическое конечное потребление домашних хозяйств'],social:['численность населения','коэффициенты рождаемости','коэффициенты смертности']};

  function observed(r){
   if(r.provider==='Всемирный банк, WDI')return Object.entries(wdi?.[r.id]?.values||{}).map(([period,value])=>({period,value}));
   if(r.provider==='Росстат')return industrialById.get(r.id)?.values||[];
   if(r.provider==='Банк России')return national?.[r.id]?.values||[];
   return [];
  }
  function chart(){
   const choice=$('sp-chart-series'),host=$('sp-chart'),info=$('sp-chart-status'),download=$('sp-chart-csv');
   host.replaceChildren();download.disabled=true;
   const r=activeRows.find(r=>r.id===choice.value);
   if(!r){info.textContent='Нет доступных рядов по фильтрам.';save(ids);return}
   const monthly=r.frequency==='месячная',pat=monthly?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}$/;
   const rows=observed(r).filter(x=>pat.test(x.period)&&Number.isFinite(x.value)).sort((a,b)=>a.period.localeCompare(b.period));
   if(!rows.length){info.textContent='Числовые данные недоступны в выбранной версии.';save(ids);return}
   const index=p=>monthly?Number(p.slice(0,4))*12+Number(p.slice(5))-1:Number(p);
   const label=i=>monthly?Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'):String(i);
   const last=index(rows.at(-1).period),span=$('sp-chart-span').value,first=Math.max(index(rows[0].period),span==='all'?index(rows[0].period):last-Number(span)*(monthly?12:1)+1);
   const periods=Array.from({length:last-first+1},(_,i)=>label(first+i)),by=new Map(rows.map(x=>[x.period,x]));
   const values=periods.map(p=>by.get(p)?.value??null),valid=values.filter(Number.isFinite);
   if(!valid.length){info.textContent='Нет наблюдений в выбранном периоде.';save(ids);return}
   info.textContent='Наблюдений: '+fmt(valid.length)+' · пропусков: '+fmt(periods.length-valid.length)+' · '+r.unit+' · '+r.frequency;
   const latest=valid.at(-1),initial=valid[0],delta=latest-initial;
   host.append(node('h3',r.title),node('p','Первое наблюдение: '+fmt(initial)+' · последнее: '+fmt(latest)+' · разность: '+fmt(delta)+' '+r.unit+'. Это разность уровней, а не темп роста.'),link('Первоисточник',r.source),document.createTextNode(' · '),link('Подробный ряд и методология',local(r.href)));
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 240');svg.setAttribute('role','img');svg.setAttribute('aria-label',r.title+' · '+r.unit);
   const shape=(tag,attrs,t)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.append(e);return e};
   let lo=Math.min(...valid),hi=Math.max(...valid);if(lo===hi){const margin=Math.max(Math.abs(lo)*.05,0.01);lo-=margin;hi+=margin}
   const x=i=>110+620*i/Math.max(1,periods.length-1),y=v=>190-160*(v-lo)/(hi-lo);
   for(let j=0;j<5;j++){const v=lo+(hi-lo)*j/4;shape('line',{x1:110,x2:730,y1:y(v),y2:y(v),stroke:'#cbd7d5'});shape('text',{x:104,y:y(v)+4,'text-anchor':'end'},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
   let path='';values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(values[i-1])?'L':'M')+x(i)+' '+y(v)+' ';const c=shape('circle',{cx:x(i),cy:y(v),r:2.8,fill:'#006c69'});const tip=document.createElementNS(ns,'title');tip.textContent=periods[i]+' · '+fmt(v)+' '+r.unit;c.append(tip)});
   shape('path',{d:path,stroke:'#006c69','stroke-width':2,fill:'none'});
   chartTickIndices(periods.length,5).forEach(i=>shape('text',{x:x(i),y:215,'font-size':11,'text-anchor':i===0?'start':i===periods.length-1?'end':'middle'},periods[i]));
   host.append(svg);chartTools(host,r.title,r.unit,periods,[{name:r.title,code:r.id,values}],{source:r.provider,monthly,url:r.source});
   download.disabled=false;download.onclick=()=>csv('sector-series-'+r.id+'.csv',[['Код','Показатель','Период','Значение','Единица','Источник','Дата получения','Примечание'],...periods.map(p=>{const v=by.get(p);return[r.id,r.title,p,v?.value??'',r.unit,v?.source||r.source,v?.seen||'',v?.note||(!v?'Нет наблюдения':'')]})]);save(ids)
  }
  function prepareCharts(rows){
   activeRows=rows.filter(r=>r.count>0);
   const choice=$('sp-chart-series'),old=firstChart?initialChart:choice.value;firstChart=false;
   choice.replaceChildren();for(const r of activeRows)choice.add(new Option(r.title+' · '+r.unit,r.id));if([...choice.options].some(o=>o.value===old))choice.value=old;
   const highlights=$('sp-highlights');highlights.replaceChildren();
   for(const r of activeRows.slice(0,3)){const c=node('article','');c.append(node('small',r.provider+' · '+r.last),node('strong',fmt(r.value)),node('p',r.title+' · '+r.unit));const b=node('button','Показать динамику');b.type='button';b.onclick=()=>{choice.value=r.id;chart()};c.append(b);highlights.append(c)}
   chart()
  }
  const financeYear=$('sp-finance-year'),financeStatus=$('sp-finance-status'),financeHost=$('sp-finance-table'),financeExport=$('sp-finance-export');
  let currentFinance=null;
  function financeDraw(p){
   if(!financeYear||!financeStatus||!financeHost||!financeExport)return;
   if(p)currentFinance=p;
   const rows=currentFinance?.finance||[],years=[...new Set(rows.map(r=>r.year))].sort((a,b)=>b-a);
   const old=financeYear.value||new URLSearchParams(location.search).get('sp-finance-year');
   financeYear.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
   if(years.includes(Number(old)))financeYear.value=old;
   financeYear.disabled=!years.length;
   const selected=rows.filter(r=>r.year===Number(financeYear.value));
   financeExport.disabled=!selected.length;financeHost.replaceChildren();
   if(!selected.length){financeStatus.textContent='Нет сопоставимых оригинальных таблиц ФНС для этого паспорта в выбранной версии.';return}
   financeStatus.textContent='Год: '+financeYear.value+' · опубликованных позиций: '+selected.length+' · отдельные коэффициенты, не сводная рентабельность отрасли.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Вид деятельности','Коэффициент','Значение, %','Изменение к предыдущему году, п. п.','Последний успех','Источник / ячейка'])h.append(node('th',label));
   const metric=r=>r.metric==='sales'?'Продажи к затратам':'Активы';
   const value=r=>r.sign==='negative_unspecified'?'Отр (величина не указана)':r.sign==='numeric'&&Number.isFinite(r.value)?fmt(r.value):'Нет данных';
   const delta=r=>SectorPassports.financeDelta(r,rows);
   for(const r of selected){
    const tr=body.insertRow(),diff=delta(r);
    for(const v of [r.title,metric(r),value(r),diff===null?'—':(diff>0?'+':'')+fmt(diff),r.success?.slice(0,10)||'—'])tr.insertCell().textContent=v;
    const cell=tr.insertCell();cell.append(link('Файл ФНС',r.source),node('small',' · '+r.sheet+' / '+r.row+':'+r.column+' · '+(r.status||'—')))
   }
   financeHost.append(t);
   financeExport.onclick=()=>csv('sector-finance-'+currentFinance.id+'-'+financeYear.value+'.csv',[['Паспорт','Год','Код (локальный)','Название ФНС','Показатель','Значение, %','Изменение к предыдущему году, п. п.','Знак','Исходная ячейка','Источник','Лист','Строка','Столбец','SHA-256','Успех','Статус'],...selected.map(r=>[currentFinance.title,r.year,r.local_code,r.title,metric(r),r.value,delta(r),r.sign,r.raw,r.source,r.sheet,r.row,r.column,r.sha256,r.success,r.status])]);
   save(['sp-finance-year']);
  }
  if(financeYear)financeYear.onchange=()=>financeDraw();
  function draw(){
   const p=profiles.find(p=>p.id===picker.value);if(!p)return;financeDraw(p);
   const q=norm($('sp-q').value.trim()),cov=$('sp-coverage').value,src=provider.value;
   const rows=p.rows.filter(r=>(!src||src===r.provider)&&(!cov||(cov==='yes'?r.count>0:r.count===0))&&norm([r.title,r.id,r.unit].join(' ')).includes(q));
   prepareCharts(rows);
   const host=$('sp-scope');host.replaceChildren(node('h2',p.title),node('p',p.note));
   const rmGroup=({manufacturing:'total',light:'light',chemical:'chemical',pharma:'chemical',food:'food',metal:'metal',wood:'wood',materials:'minerals',machinery:'machinery'})[p.id];
   if(rmGroup){host.append(node('p','Региональный источник имеет собственную агрегацию; химия и фармацевтика, например, объединены.'),link('Региональная специализация по отгрузке',local('regional-manufacturing.html?rm-group='+rmGroup)))}

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
   const reg=$('sp-regions');reg.replaceChildren();
   const relatedRegions=regional.filter(r=>(regionalTerms[p.id]||[]).some(t=>norm(r.title).includes(t)));
   for(const r of relatedRegions){const line=node('p','');line.append(link(r.title,local('historical.html?hist-series='+encodeURIComponent(r.code))),document.createTextNode(' · '+r.unit+' · '+fmt(r.count)+' наблюдений · '+r.kind));reg.append(line)}
   if(!relatedRegions.length)reg.append(node('p','Специализированные региональные ряды пока не подобраны.'));
   reg.append(link('Полный региональный каталог',local('historical.html')));
   $('sp-export').disabled=!rows.length;$('sp-export').onclick=()=>csv('sector-passport-'+p.id+'.csv',[['Паспорт','Код','Показатель','Значение','Последний период','Первый период','Наблюдений','Единица','Периодичность','Поставщик','Источник','Успешная проверка','Статус'],...rows.map(r=>[p.title,r.id,r.title,r.value,r.last,r.first,r.count,r.unit,r.frequency,r.provider,r.source,r.checked,r.status])]);save(ids)
  }
  $('sp-chart-series').onchange=$('sp-chart-span').onchange=chart;
  $('sp-form').oninput=draw;$('sp-form').onsubmit=e=>e.preventDefault();$('sp-form').onreset=()=>setTimeout(draw,0);draw()
 }catch(e){console.error(e);status.textContent='Каталог паспортов недоступен для этой версии.'}
});