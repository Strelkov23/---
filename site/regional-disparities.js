/* Territorial dispersion: conservative, mutually exclusive name-based sample.
   This is not a population-weighted measure or an official territorial register. */
const RegionalStats=(()=>{
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е').replace(/^г\.\s*/,'').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim();
 const groups=[
  'белгородская|брянская|владимирская|воронежская|ивановская|калужская|костромская|курская|липецкая|московская|орловская|рязанская|смоленская|тамбовская|тверская|тульская|ярославская|вологодская|калининградская|ленинградская|мурманская|новгородская|псковская|астраханская|волгоградская|ростовская|кировская|нижегородская|оренбургская|пензенская|самарская|саратовская|ульяновская|курганская|свердловская|челябинская|иркутская|кемеровская|новосибирская|омская|томская|амурская|магаданская|сахалинская',
  'алтайский|забайкальский|камчатский|краснодарский|красноярский|пермский|приморский|ставропольский|хабаровский',
  'адыгея|алтай|башкортостан|бурятия|дагестан|ингушетия|калмыкия|карелия|коми|марий эл|мордовия|саха (якутия)|северная осетия - алания|татарстан|тыва|удмуртия|хакасия|чечня|чувашия'
 ];
 const names=new Map();const add=(n,id=n)=>names.set(norm(n),id);
 groups[0].split('|').forEach(n=>add(n+' область'));
 groups[1].split('|').forEach(n=>add(n+' край'));
 groups[2].split('|').forEach(n=>{add('республика '+n,n);add(n,n)});
 [['удмуртская республика','удмуртия'],['чеченская республика','чечня'],['чувашская республика','чувашия'],['чувашская республика - чувашия','чувашия'],['карачаево-черкесская республика','карачаево-черкесия'],['кабардино-балкарская республика','кабардино-балкария'],['республика адыгея (адыгея)','адыгея'],['республика татарстан (татарстан)','татарстан'],['республика северная осетия-алания','северная осетия - алания'],['кемеровская область - кузбасс','кемеровская область'],['ханты-мансийский автономный округ - югра','ханты-мансийский автономный округ'],['ханты-мансийский автономный округ-югра','ханты-мансийский автономный округ'],['ханты-мансийский автономный округ','ханты-мансийский автономный округ'],['ямало-ненецкий автономный округ','ямало-ненецкий автономный округ'],['ненецкий автономный округ','ненецкий автономный округ'],['чукотский автономный округ','чукотский автономный округ'],['еврейская автономная область','еврейская автономная область'],['архангельская область без автономного округа','архангельская область без автономного округа'],['архангельская область (без автономного округа)','архангельская область без автономного округа'],['тюменская область без автономных округов','тюменская область без автономных округов'],['тюменская область (без автономных округов)','тюменская область без автономных округов'],['москва','москва'],['санкт-петербург','санкт-петербург']].forEach(([n,id])=>add(n,id));
 // Historical/internationally disputed boundaries and inclusive oblast totals are not merged.
 function sample(rows){
  const out=new Map(),ambiguous=new Set();let excluded=0;
  for(const r of rows){const id=names.get(norm(r.region));if(!id||!Number.isFinite(r.value)){excluded++;continue}
   if(out.has(id)||ambiguous.has(id)){out.delete(id);ambiguous.add(id);excluded++;continue}out.set(id,r)}
  return {out,excluded,ambiguous:ambiguous.size};
 }
 function quantile(a,p){if(!a.length)return null;const i=(a.length-1)*p,j=Math.floor(i);return a[j]+(a[Math.min(j+1,a.length-1)]-a[j])*(i-j)}
 function stats(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y),n=a.length;if(!n)return null;
  const mean=a.reduce((s,v)=>s+v,0)/n,median=quantile(a,.5),p10=quantile(a,.1),p90=quantile(a,.9),q1=quantile(a,.25),q3=quantile(a,.75);
  const sd=Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n),nonnegative=a[0]>=0;
  const gini=nonnegative&&mean>0?a.reduce((s,v,i)=>s+(2*(i+1)-n-1)*v,0)/(n*n*mean):null;
  return {n,mean,median,p10,p90,q1,q3,min:a[0],max:a[n-1],sd,cv:nonnegative&&mean>0?100*sd/mean:null,ratio:nonnegative&&p10>0?p90/p10:null,gini};
 }
 function panel(rows,years,balanced){
  const sets=years.map(y=>sample(rows.filter(r=>r.year===y)));
  const ids=sets.length?[...sets[0].out.keys()].filter(id=>sets.every(s=>s.out.has(id))):[];
  return {common:ids.length,years:sets.map((s,i)=>{const entries=[...s.out.entries()].filter(([id])=>!balanced||ids.includes(id));return {year:years[i],entries,excluded:s.excluded,ambiguous:s.ambiguous,stats:stats(entries.map(([,r])=>r.value))}})};
 }
 function pearson(pairs){
  if(pairs.length<3)return null;
  const a=pairs.map(p=>p.x),b=pairs.map(p=>p.y),ma=a.reduce((s,v)=>s+v,0)/a.length,mb=b.reduce((s,v)=>s+v,0)/b.length;
  const d=Math.sqrt(a.reduce((s,v)=>s+(v-ma)**2,0)*b.reduce((s,v)=>s+(v-mb)**2,0));
  return d?Math.max(-1,Math.min(1,pairs.reduce((s,p)=>s+(p.x-ma)*(p.y-mb),0)/d)):null;
 }
 return {sample,stats,panel,pearson};
})();
if(typeof module!=='undefined')module.exports=RegionalStats;

if(typeof document!=='undefined'){

document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('rd-form');if(!form)return;
 const a=$('rd-a'),b=$('rd-b'),year=$('rd-year'),status=$('rd-status'),host=$('rd-results'),cross=$('rd-cross'),download=$('rd-csv'),crossCSV=$('rd-cross-csv');
 const ids=['rd-a','rd-b','rd-year','rd-span','rd-panel'],initial=new URLSearchParams(location.search);
 let catalog=[],pair=[],seq=0,first=true;
 const cache=new Map(),f=v=>Number.isFinite(v)?fmt(v):'—',ns='http://www.w3.org/2000/svg';
 const link=(t,u)=>{const a=node('a',t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a};
 function tbl(parent,headers,rows){const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();headers.forEach(x=>{const c=node('th',x);c.scope='col';h.append(c)});for(const row of rows){const tr=body.insertRow();for(const x of row)tr.insertCell().textContent=x??'—'}parent.append(t)}
 function metric(parent,label,value){const box=node('div','');box.className='metric';box.append(node('b',value),node('span',label));parent.append(box)}
 function figure(parent,title,subtitle,callback,filename){
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('xmlns',ns);svg.setAttribute('viewBox','0 0 950 470');svg.setAttribute('width','950');svg.setAttribute('height','470');svg.setAttribute('role','img');svg.setAttribute('aria-label',title);
  const shape=(tag,attrs,text,p=svg)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;p.append(e);return e};
  const txt=(x,y,text,attrs={})=>shape('text',{x,y,fill:'#162e39','font-family':'Arial,sans-serif','font-size':13,...attrs},text);
  shape('rect',{width:950,height:470,fill:'white'});txt(25,28,title,{'font-size':20,'font-weight':'bold'});txt(25,50,subtitle);callback(shape,txt);
  txt(25,449,'Версия данных: '+(version||'не определена'),{'font-size':11});txt(25,463,'Методика и исходные источники указаны в разделе; выгрузка CSV.',{'font-size':11});
  const wrap=node('div','');wrap.className='regional-figure-scroll';wrap.append(svg);parent.append(wrap);
  const tools=node('div','');tools.className='actions';const msg=node('span','');
  const blob=()=>new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  const save=(v,ext)=>{const u=URL.createObjectURL(v),l=node('a','');l.href=u;l.download=filename+'.'+ext;l.click();setTimeout(()=>URL.revokeObjectURL(u),30000)};
  const btn=(t,action)=>{const e=node('button',t);e.type='button';e.onclick=async()=>{try{await action();msg.textContent='Готово'}catch{msg.textContent='Экспорт недоступен; используйте SVG.'}};tools.append(e)};
  btn('Скачать SVG',()=>save(blob(),'svg'));
  btn('Скачать PNG',async()=>{const u=URL.createObjectURL(blob());try{const im=new Image();im.src=u;await im.decode();const c=document.createElement('canvas');c.width=1900;c.height=940;c.getContext('2d').drawImage(im,0,0,c.width,c.height);save(await new Promise((r,j)=>c.toBlob(v=>v?r(v):j(Error('PNG')),'image/png')),'png')}finally{URL.revokeObjectURL(u)}});
  tools.append(msg);parent.append(tools);
 }
 async function get(meta){if(!cache.has(meta.code)){const req=load(meta.file).catch(e=>{cache.delete(meta.code);throw e});cache.set(meta.code,req);if(cache.size>8)cache.delete(cache.keys().next().value)}return {...await cache.get(meta.code),code:meta.code}}
 async function select(){
  const token=++seq,old=first?initial.get('rd-year'):year.value;pair=[];host.replaceChildren();cross.replaceChildren();download.disabled=crossCSV.disabled=true;status.textContent='Загрузка показателей…';
  const ma=catalog.find(s=>s.code===a.value),mb=catalog.find(s=>s.code===b.value);
  if(!ma){status.textContent='Нет региональных рядов.';return}
  try{
   const p=await Promise.all([get(ma),mb&&mb.code!==ma.code?get(mb).catch(()=>null):Promise.resolve(null)]);if(token!==seq)return;pair=p;
   const ys=[...new Set(p[0].values.map(r=>r.year))].sort((a,b)=>b-a);year.replaceChildren();for(const y of ys)year.add(new Option(String(y),String(y)));if(ys.includes(Number(old)))year.value=old;first=false;draw()
  }catch(e){if(token===seq){console.error(e);status.textContent='Первый ряд недоступен для выбранной версии.'}}
 }
 function draw(){
  if(!pair.length)return;
  const [s,t]=pair,Y=Number(year.value),span=Number($('rd-span').value),balanced=$('rd-panel').value==='balanced';
  const years=Array.from({length:span},(_,i)=>Y-span+1+i);
  const result=RegionalStats.panel(s.values,years,balanced),last=result.years.at(-1),st=last.stats;
  host.replaceChildren();cross.replaceChildren();download.disabled=crossCSV.disabled=true;
  status.textContent='Территорий с данными за '+Y+': '+(st?.n||0)+' · общая панель за период: '+result.common+' · неоднозначные названия в последнем году: '+last.ambiguous;
  host.append(node('h3',s.title+' · '+s.unit),link('Первоисточник A',s.source),node('p','Выборка без федеральных округов, общероссийских итогов, совмещённых областей и неоднозначных территорий. Это ограниченная, невзвешенная выборка, не оценка неравенства населения России.'));
  if(st){
   const m=node('div','');m.className='metrics';for(const [label,v] of [['Медиана',st.median],['P90 / P10',st.ratio],['Коэффициент вариации, %',st.cv],['Джини территорий',st.gini]])metric(m,label,label==='Джини территорий'&&Number.isFinite(v)?v.toFixed(3):f(v));host.append(m);
   const actual=result.years.filter(d=>d.stats);
   const all=actual.flatMap(d=>[d.stats.min,d.stats.max]);let lo=Math.min(...all),hi=Math.max(...all);if(lo===hi){lo-=1;hi+=1}
   figure(host,'Межтерриториальный разброс','P10–P90, медиана · '+s.unit+' · '+(balanced?'постоянная панель':'доступные территории'),(shape,txt)=>{
    const x=i=>105+805*i/Math.max(1,years.length-1),y=v=>365-280*(v-lo)/(hi-lo);
    for(let j=0;j<5;j++){const v=lo+(hi-lo)*j/4;shape('line',{x1:105,x2:910,y1:y(v),y2:y(v),stroke:'#d4dcdf'});txt(98,y(v)+4,v.toLocaleString('ru',{maximumSignificantDigits:5}),{'text-anchor':'end'})}
    result.years.forEach((d,i)=>{const z=d.stats;if(z){shape('line',{x1:x(i),x2:x(i),y1:y(z.p10),y2:y(z.p90),stroke:'#78bcb5','stroke-width':9,'stroke-linecap':'round'});const dot=shape('circle',{cx:x(i),cy:y(z.median),r:5,fill:'#006c69'});shape('title',{},d.year+' · n='+z.n+' · медиана '+f(z.median)+' · P10 '+f(z.p10)+' · P90 '+f(z.p90),dot)}
     if(i===0||i===years.length-1||i%Math.ceil(years.length/7)===0)txt(x(i),388,d.year,{'text-anchor':'middle'})});
    txt(105,413,'Точка — медиана; отрезок — 10-й–90-й процентили. Пропуски не заполнены.');
   },'dispersion-'+s.code+'-'+Y);
  }
  const keys=['n','mean','median','p10','p90','ratio','cv','gini','min','max'];
  tbl(host,['Год','Территорий','Среднее','Медиана','P10','P90','P90/P10','CV, %','Джини','Мин.','Макс.'],result.years.map(d=>[d.year,...keys.map(k=>k==='gini'&&Number.isFinite(d.stats?.[k])?d.stats[k].toFixed(3):f(d.stats?.[k]))]));
  download.disabled=!result.years.some(d=>d.stats);download.onclick=()=>csv('regional-dispersion-'+s.code+'.csv',[['Год','Код','Показатель','Единица','Панель','Территорий','Среднее','Медиана','P10','P90','P90/P10','CV, %','Джини','Мин.','Макс.','Исключённых строк','Неоднозначных территорий','Источник'],...result.years.map(d=>[d.year,s.code,s.title,s.unit,balanced?'постоянная':'доступная',...keys.map(k=>d.stats?.[k]??''),d.excluded,d.ambiguous,s.source])]);
  if(!t){cross.append(node('p','Выберите второй отличный от первого доступный ряд.'));save(ids);return}
  const aa=RegionalStats.sample(s.values.filter(r=>r.year===Y)).out,bb=RegionalStats.sample(t.values.filter(r=>r.year===Y)).out;
  const points=[...aa].filter(([id])=>bb.has(id)).map(([id,r])=>({name:r.region,x:r.value,y:bb.get(id).value}));
  cross.append(node('h3','Сопоставление двух показателей · '+Y),node('p','A: '+s.title+' · '+s.unit),node('p','B: '+t.title+' · '+t.unit),link('Первоисточник B',t.source),node('p','Общие территории: '+points.length+' · коэффициент корреляции Пирсона: '+f(RegionalStats.pearson(points))+'. Корреляция не доказывает причинности; абсолютные уровни могут зависеть от размера региона.'));
  if(!points.length){save(ids);return}
  const sx=RegionalStats.stats(points.map(p=>p.x)),sy=RegionalStats.stats(points.map(p=>p.y));
  const quadrant=p=>(p.x>=sx.median?'A ≥ медианы':'A ниже медианы')+'; '+(p.y>=sy.median?'B ≥ медианы':'B ниже медианы');
  figure(cross,'Два показателя по территориям','A по горизонтали · B по вертикали · n = '+points.length,(shape,txt)=>{
   const minX=sx.min,maxX=sx.max,minY=sy.min,maxY=sy.max;
   const x=v=>115+790*(maxX===minX?.5:(v-minX)/(maxX-minX)),y=v=>365-285*(maxY===minY?.5:(v-minY)/(maxY-minY));
   for(let j=0;j<5;j++){const vx=minX+(maxX-minX)*j/4,vy=minY+(maxY-minY)*j/4;shape('line',{x1:x(vx),x2:x(vx),y1:80,y2:365,stroke:'#e0e6e6'});shape('line',{x1:115,x2:905,y1:y(vy),y2:y(vy),stroke:'#e0e6e6'});if(j===0||maxX!==minX)txt(x(vx),390,vx.toLocaleString('ru',{maximumSignificantDigits:5}),{'text-anchor':'middle'});if(j===0||maxY!==minY)txt(105,y(vy)+4,vy.toLocaleString('ru',{maximumSignificantDigits:5}),{'text-anchor':'end'})}
   shape('line',{x1:x(sx.median),x2:x(sx.median),y1:80,y2:365,stroke:'#a24724','stroke-dasharray':'6 4'});shape('line',{x1:115,x2:905,y1:y(sy.median),y2:y(sy.median),stroke:'#a24724','stroke-dasharray':'6 4'});
   for(const p of points){const c=shape('circle',{cx:x(p.x),cy:y(p.y),r:5,fill:'#087e75','fill-opacity':.72});shape('title',{},p.name+' · A '+f(p.x)+' · B '+f(p.y),c)}
   txt(115,414,'Пунктир — медианы общих территорий. Квадранты не являются оценкой эффективности.');
  },'regional-scatter-'+Y);
  const counts=new Map();for(const p of points)counts.set(quadrant(p),(counts.get(quadrant(p))||0)+1);
  tbl(cross,['Группа по медианам','Территорий'],[...counts]);
  const detail=node('details','');detail.append(node('summary','Территории и исходные значения'));tbl(detail,['Территория','A · '+s.unit,'B · '+t.unit,'Группа'],points.sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(p=>[p.name,f(p.x),f(p.y),quadrant(p)]));cross.append(detail);
  crossCSV.disabled=false;crossCSV.onclick=()=>csv('regional-cross-'+Y+'.csv',[['Территория','Год','Код A','Показатель A','Единица A','Значение A','Код B','Показатель B','Единица B','Значение B','Группа','Медиана A','Медиана B','Источник A','Источник B'],...points.map(p=>[p.name,Y,s.code,s.title,s.unit,p.x,t.code,t.title,t.unit,p.y,quadrant(p),sx.median,sy.median,s.source,t.source])]);save(ids)
 }
 try{
  catalog=(await load('historical.json')).series.filter(s=>s.regions>=3);
  for(const s of catalog)for(const picker of [a,b])picker.add(new Option(s.title+' · '+s.unit+' · '+s.kind,s.code));
  const preferred=catalog.find(s=>s.code.startsWith('GRP_PC_'));if(preferred)a.value=preferred.code;
  const second=catalog.find(s=>s.code.startsWith('HH_CONS_PC_'))||catalog.find(s=>s.code!==a.value);if(second)b.value=second.code;
  restore(ids.filter(id=>id!=='rd-year'));a.onchange=b.onchange=select;year.onchange=$('rd-span').onchange=$('rd-panel').onchange=draw;form.onsubmit=e=>e.preventDefault();select()
 }catch(e){console.error(e);status.textContent='Каталог диагностики недоступен.'}
});

}
