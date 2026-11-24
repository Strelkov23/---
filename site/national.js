document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 if(!$('national-form'))return;
 const f=v=>Number.isFinite(v)?fmt(v):'—';
 function a(t,u){const x=node('a',t);x.href=u;x.target='_blank';x.rel='noopener noreferrer';return x}
 function metric(t,n){const x=node('div','');x.className='metric';x.append(node('b',String(n)),node('span',t));$('national-metrics').append(x)}
 try{
  if(!version){const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}
  const data=await load('national.json');
  const entries=Object.entries(data);
  metric('официальных рядов в реестре',entries.length);
  metric('рядов с наблюдениями',entries.filter(([,s])=>s.values.length).length);
  metric('наблюдений',entries.reduce((n,[,s])=>n+s.values.length,0));
  for(const [code,s] of entries)$('national-code').add(new Option(s.title+' · '+s.unit,code));
  $('national-code').value='CPI_YOY';const fields=['national-code','national-from','national-to'];restore(fields);
  function draw(){
   const code=$('national-code').value,s=data[code];if(!s)return;
   const start=$('national-from').value,end=$('national-to').value;
   const rows=s.values.filter(r=>(!start||r.period>=start)&&(!end||r.period<=end));
   const box=$('national-passport');box.replaceChildren(node('h2',s.title),node('p',s.definition),node('p','Код: '+code+' · Единица: '+s.unit+' · Периодичность: месячная · Россия'),node('p','Последняя успешная загрузка: '+(s.success||'—')+' · '+s.status),a('Первоисточник',s.source));
   if(s.history_source)box.append(node('p','Историческая таблица: '+s.history_source.status+' · '+(s.history_source.checked||'не проверено')),a('Официальный XLSX',s.history_source.url));
   const host=$('national-chart');host.replaceChildren();
   const tbl=$('national-table');tbl.replaceChildren();
   $('national-csv').disabled=!rows.length;
   $('national-status').textContent=start&&end&&start>end?'Начальный месяц позже конечного':'Наблюдений: '+rows.length;
   if(!rows.length){host.append(node('p','Нет наблюдений за выбранный период. Нули не подставляются.'));save(fields);return}
   const last=rows.at(-1);box.append(node('p','Последнее наблюдение в выборке: '+f(last.value)+' '+s.unit+' · '+last.period));
   const periods=[],by=new Map(rows.map(r=>[r.period,r.value]));
   const monthIndex=p=>Number(p.slice(0,4))*12+Number(p.slice(5))-1;
   for(let i=monthIndex(rows[0].period);i<=monthIndex(last.period);i++)periods.push(Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'));
   const values=periods.map(p=>by.get(p)??null);
   const low=Math.min(...rows.map(r=>r.value)),high=Math.max(...rows.map(r=>r.value));
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 230');svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label',s.title+' — '+s.unit);
   const shape=(tag,attrs,label)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(label!==undefined)e.textContent=label;svg.append(e);return e};
   const x=i=>85+595*i/Math.max(1,periods.length-1),y=v=>high===low?104:180-155*(v-low)/(high-low);
   for(let i=0;i<=4;i++){const val=low+(high-low)*i/4;shape('line',{x1:85,x2:680,y1:y(val),y2:y(val),stroke:'#b9c8c8'});if(high!==low||i===0)shape('text',{x:78,y:y(val)+4,'text-anchor':'end','font-size':12,fill:'currentColor'},f(val))}
   let path='';values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(values[i-1])?'L':'M')+x(i)+' '+y(v)+' ';const c=shape('circle',{cx:x(i),cy:y(v),r:2.8,fill:'#006c69'});const t=document.createElementNS(svg.namespaceURI,'title');t.textContent=periods[i]+' · '+f(v)+' '+s.unit;c.append(t)});
   shape('path',{d:path,fill:'none',stroke:'#006c69','stroke-width':2});
   chartTickIndices(periods.length,5).forEach(i=>shape('text',{x:x(i),y:203,'font-size':11,'text-anchor':i===0?'start':i===periods.length-1?'end':'middle',fill:'currentColor'},periods[i]));
   host.append(svg,node('p','Пропуски внутри периода: '+(periods.length-rows.length)+'. Источник: Банк России (инфляция — Росстат / Банк России).'));
   chartTools(host,s.title,s.unit,periods,[{name:s.title,code,values}],{source:'Банк России',url:s.source,monthly:true});
   const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
   for(const label of ['Месяц','Значение, '+s.unit,'Дата получения','Источник'])h.append(node('th',label));
   const lookup=new Map(rows.map(r=>[r.period,r]));
   for(const p of [...periods].reverse()){const tr=body.insertRow(),r=lookup.get(p);tr.insertCell().textContent=p;tr.insertCell().textContent=r?f(r.value):'Нет наблюдения';tr.insertCell().textContent=r?.seen||'—';if(r)tr.insertCell().append(a('Публикация',r.source));else tr.insertCell().textContent='—'}
   tbl.append(table);
   $('national-csv').onclick=()=>csv('national-'+code+'.csv',[['Код','Месяц','Значение','Единица','Определение','Источник','Получено UTC'],...periods.map(p=>{const r=lookup.get(p);return[code,p,r?.value??'',s.unit,s.definition,r?.source||s.source,r?.seen||'']})]);
   save(fields);
  }
  $('national-form').oninput=draw;$('national-form').onsubmit=e=>e.preventDefault();$('national-form').onreset=()=>setTimeout(()=>{$('national-code').value='CPI_YOY';draw()},0);draw()
 }catch(e){console.error(e);$('national-status').textContent='Набор для этой версии недоступен. Откройте текущий архив.'}
});
