document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('finance-year'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:2}):'—';
 const show=r=>r?.sign==='negative_unspecified'?'Отр (величина не указана)':fmt(r?.value);
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const row of rows){const tr=b.insertRow();for(const v of row)tr.insertCell().textContent=String(v)}host.replaceChildren(t)};
 try{
  const d=await load('finance-data.json'),rows=d.rows,lookup=new Map(rows.map(x=>[x.code+'|'+x.year+'|'+x.metric,x])),groups=rows.filter(x=>x.year===2025&&x.metric==='sales'),at=(code,y,metric)=>lookup.get(code+'|'+y+'|'+metric);
  const check=d.file_check||{},newYears=Object.keys(check.files||{}).filter(y=>Number(y)>2025);
  $('finance-source-check').textContent='Проверка списка файлов ФНС: '+(check.status||'не проводилась')+' · последняя попытка: '+(check.checked||'—')+' · успешная: '+(check.success||'—')+(newYears.length?' · обнаружены более новые годы: '+newYears.join(', ')+'. Числа не импортированы.':'');
  const links=$('finance-source-files');for(const [year,url] of Object.entries(check.files||{}).sort((a,b)=>Number(b[0])-Number(a[0])).slice(0,8)){const a=document.createElement('a');if(/^https:\/\/data\.nalog\.ru\//.test(url)){a.href=url;a.textContent='Файл ФНС '+year;links.append(a,' · ')}}
  for(const r of groups)$('finance-trend').add(new Option(r.title,r.code));
  const change=(a,b)=>Number.isFinite(a?.value)&&Number.isFinite(b?.value)?fmt(a.value-b.value):'—';
  function draw(){const y=Number($('finance-year').value),level=$('finance-level').value,q=$('finance-query').value.toLowerCase().trim(),shown=groups.filter(r=>(!level||r.level===level)&&(r.title.toLowerCase()+' '+r.code).includes(q));$('finance-status').textContent='Видов деятельности и итогов: '+shown.length+' · '+y+' · ручной снимок.';table($('finance-table'),['Вид деятельности','Уровень','Продажи к затратам, %','Активы, %','Изменение продаж к прошлому году, п.п.','Изменение активов, п.п.'],shown.map(r=>[r.title,{total:'Итого',section:'Раздел',detail:'Детализация'}[r.level],show(at(r.code,y,'sales')),show(at(r.code,y,'assets')),change(at(r.code,y,'sales'),at(r.code,y-1,'sales')),change(at(r.code,y,'assets'),at(r.code,y-1,'assets'))]))}
  function trend(){const code=$('finance-trend').value,r=groups.find(x=>x.code===code),years=[2023,2024,2025],host=$('finance-chart');table(host,['Год','Рентабельность продаж к затратам, %','Рентабельность активов, %'],years.map(y=>[y,show(at(code,y,'sales')),show(at(code,y,'assets'))]));const series=['sales','assets'].map(k=>({name:d.metrics[k].title,code:k,values:years.map(y=>at(code,y,k)?.value??null)}));const values=series.flatMap(s=>s.values.filter(Number.isFinite));
  if(values.length){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','Динамика рентабельности: '+r.title);
  const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;svg.append(e)};
  let lo=Math.min(0,...values),hi=Math.max(0,...values);if(hi===lo)hi=lo+1;
  const x=i=>100+i*230,y=v=>205-(v-lo)/(hi-lo)*175;
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;shape('line',{x1:100,x2:560,y1:y(v),y2:y(v),stroke:'#cbd5df'});shape('text',{x:90,y:y(v)+4,'font-size':12,'text-anchor':'end'},fmt(v)+'%')}
  years.forEach((v,i)=>shape('text',{x:x(i),y:230,'font-size':12,'text-anchor':'middle'},v));
  series.forEach((s,j)=>{const color=['#285b83','#006c69'][j];let line='';s.values.forEach((v,i)=>{if(Number.isFinite(v)){line+=(i&&Number.isFinite(s.values[i-1])?'L':'M')+x(i)+' '+y(v)+' ';shape('circle',{cx:x(i),cy:y(v),r:4,fill:color})}});shape('path',{d:line,stroke:color,'stroke-width':2.5,'stroke-dasharray':j?'5 3':'none',fill:'none'})});
  const legend=document.createElement('p');legend.textContent='Синяя сплошная — продажи к затратам, зелёная пунктирная — активы. «Отр» не строится как числовая точка.';host.append(svg,legend);
  chartTools(host,r.title+' — рентабельность','%',years,series,{source:'ФНС, приложение 4; текстовая транскрипция, отр — величина неизвестна',url:d.source})}const p=document.createElement('p');p.textContent='Документальные копии по годам: ';for(const y of years){const a=document.createElement('a');a.href=d.replicas[y];a.textContent=String(y);p.append(a,' · ')}host.append(p)}
  for(const id of ['finance-year','finance-level','finance-query'])$(id).addEventListener('input',draw);$('finance-trend').addEventListener('change',trend);draw();trend();
 }catch(e){console.error(e);$('finance-status').textContent='Набор недоступен.'}
});
