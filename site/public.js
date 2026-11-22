const el=id=>document.getElementById(id);
const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
const fmt=v=>v.toLocaleString('ru',{maximumFractionDigits:2});
async function load(file){const r=await fetch(file);if(!r.ok)throw Error();return r.json()}
function csv(name,rows){
 const quote=value=>{let s=String(value??'');if(typeof value==='string' && /^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 const contents=rows.map(row=>row.map(v=>quote(typeof v==='number'?v.toLocaleString('ru',{useGrouping:false,maximumFractionDigits:12}):v)).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff',contents],{type:'text/csv;charset=utf-8'}));const link=node('a','');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function archive(){
 const rows=await load('archive.json'),params=new URLSearchParams(location.search);
 for(const [id,values] of [['publisher',rows.map(r=>r.source)],['sector',rows.flatMap(r=>(r.topics||'').split(' · '))]]){
 el(id).add(new Option('Все',''));for(const v of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))el(id).add(new Option(v,v))}
 const ids=['q','publisher','sector','start','end'];for(const id of ids)el(id).value=params.get(id)||'';
 for(const [v,label] of [[fmt(rows.length),'материалов в архиве'],[fmt(new Set(rows.map(r=>r.source)).size),'источников в архиве'],[rows.map(r=>r.published?.slice(0,10)).filter(Boolean).sort().at(-1) || '—','последняя дата публикации']]){
 const box=node('div','');box.className='metric';box.append(node('b',v),node('span',label));el('overview').append(box)}
 let limit=20,matches=[];
 function draw(){
 const words=el('q').value.toLowerCase().trim().split(/\s+/),start=el('start').value,end=el('end').value;
 matches=rows.filter(r=>{const date=(r.published||'').slice(0,10);return (!start||date>=start)&&(!end||date&&date<=end)&&(!el('publisher').value||r.source===el('publisher').value)&&(!el('sector').value||(r.topics||'').split(' · ').includes(el('sector').value))&&words.every(w=>[r.title,r.source,r.topics].join(' ').toLowerCase().includes(w))});
 el('count').textContent=start&&end&&start>end?'Начальная дата позже конечной':('Найдено материалов: '+fmt(matches.length));el('list').replaceChildren();
 for(const r of matches.slice(0,limit)){const card=node('article',''),h=node('h3',''),a=node('a',r.title);a.href=r.url;h.append(a);card.append(node('small',[r.published?.slice(0,10),r.source,r.topics].filter(Boolean).join(' · ')),h);el('list').append(card)}
 el('more').hidden=matches.length<=limit;el('newscsv').disabled=!matches.length;
 const url=new URL(location.href);for(const id of ids){if(el(id).value)url.searchParams.set(id,el(id).value);else url.searchParams.delete(id)}history.replaceState(null,'',url)
 }
 el('newscsv').onclick=()=>csv('economic-archive.csv',[['Дата','Заголовок','Источник','Темы','Ссылка'],...matches.map(r=>[r.published,r.title,r.source,r.topics,r.url])]);
 el('filters').oninput=()=>{limit=20;draw()};el('filters').onreset=()=>setTimeout(()=>{limit=20;draw()},0);el('filters').onsubmit=e=>e.preventDefault();el('more').onclick=()=>{limit+=40;draw()};draw()
}
function lineChart(years,values){
 const ns='http://www.w3.org/2000/svg', host=document.createElementNS(ns,'svg');
 const width=el('chart').clientWidth>650?900:380,height=235,left=38,right=18;
 host.setAttribute('viewBox',`0 0 ${width} ${height}`);host.setAttribute('role','img');host.setAttribute('aria-label','Динамика двух отраслей, % ВВП. Числа доступны в таблице ниже.');
 function add(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!=null)e.textContent=text;host.append(e);return e}
 const max=Math.max(5,Math.ceil(Math.max(...values.flat().filter(Number.isFinite))/5)*5);
 const x=i=>left+i*(width-left-right)/Math.max(1,years.length-1),y=v=>195-v/max*170;
 for(let i=0;i<=4;i++){const v=i*max/4;add('line',{x1:left,x2:width-right,y1:y(v),y2:y(v),stroke:'#dce4df'});add('text',{x:left-6,y:y(v)+4,'text-anchor':'end'},fmt(v))}
 years.forEach((year,i)=>{if(i===0||i===years.length-1||i%Math.ceil(years.length/4)===0 && years.length-1-i>=2)add('text',{x:x(i),y:220,'text-anchor':'middle'},year)});
 values.forEach((row,j)=>{const color=['#006c69','#a24724'][j];let path='',continuous=false;row.forEach((v,i)=>{if(!Number.isFinite(v)){continuous=false;return}path+=(continuous?'L':'M')+x(i)+' '+y(v)+' ';continuous=true;const dot=add('circle',{cx:x(i),cy:y(v),r:2.8,fill:color});const title=document.createElementNS(ns,'title');title.textContent=years[i]+' · '+fmt(v)+'%';dot.append(title)});add('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':j?'6 3':'none'})});return host
}
async function stats(){
 const d=await load('stats.json');
 for(const id of ['first','second'])for(const [code,title] of Object.entries(d.series))el(id).add(new Option(title,code));
 el('second').selectedIndex=1;
 function draw(){
 const codes=['first','second'].map(id=>el(id).value),maps=codes.map(code=>new Map(d.values.filter(r=>r.code===code&&Number.isFinite(r.value)).map(r=>[Number(r.year),r.value])));
 const available=[...maps[0].keys(),...maps[1].keys()];el('chart').replaceChildren();el('numbers').replaceChildren();el('seriescsv').disabled=true;
 if(!available.length){el('chart').textContent='За выбранный период данных нет';return}
 const last=Math.max(...available),first=Math.max(Math.min(...available),last-Number(el('span').value)+1),years=Array.from({length:last-first+1},(_,i)=>first+i);
 const legend=node('div','');legend.className='legend';
 codes.forEach((code,i)=>{const a=node('a',d.series[code]);a.href='https://data.worldbank.org/indicator/'+code+'?locations=RU';legend.append(a)});
 el('chart').append(legend,lineChart(years,maps.map(m=>years.map(y=>m.get(y)))));
 const common=years.filter(y=>maps.every(m=>m.has(y)));
 if(common.length>=2){
 const from=common[0],to=common.at(-1),summary=node('p','Изменение за '+from+'–'+to+' гг. по общим наблюдениям: ');
 summary.append(document.createTextNode(maps.map((m,i)=>{const change=m.get(to)-m.get(from);return d.series[codes[i]]+' '+(change>0?'+':'')+fmt(change)+' п. п.'}).join(' · ')));el('chart').append(summary)
 }
 const table=node('table',''),header=table.createTHead().insertRow(),labels=['Год',...codes.map(c=>d.series[c]+', % ВВП')];labels.forEach(s=>header.append(node('th',s)));const body=table.createTBody();
 const rows=years.map(y=>[y,...maps.map(m=>m.get(y))]);for(const row of [...rows].reverse()){const tr=body.insertRow();row.forEach((v,i)=>tr.insertCell().textContent=i===0?v:v==null?'—':fmt(v))}
 el('numbers').append(table);el('seriescsv').disabled=false;el('seriescsv').onclick=()=>csv('world-bank-russia.csv',[labels,...rows]);
 }
 for(const id of ['first','second','span'])el(id).onchange=draw;draw()
}
async function model(){
 const m=await load('sectors.json');m.names.forEach((s,i)=>el('industry').add(new Option(s,i)));el('industry').value='8';
 function draw(){el('effects').replaceChildren();if(!el('shock').value||!el('shock').validity.valid){el('effect').textContent='Укажите изменение от −20 до 20%';return}
 const v=m.effects.map(r=>r[+el('industry').value]*Number(el('shock').value)/100000);
 el('effect').textContent='Изменение валового выпуска: '+fmt(v.reduce((a,b)=>a+b,0))+' млрд ₽';
 v.map((amount,i)=>({amount,name:m.names[i]})).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).forEach(({amount,name})=>el('effects').append(node('p',name+' · '+fmt(amount)+' млрд ₽')))}
 el('industry').onchange=el('shock').oninput=draw;draw();
}
if(el('filters'))for(const [fn,id] of [[archive,'count'],[model,'effect'],[stats,'chart']])fn().catch(()=>el(id).textContent='Не удалось загрузить данные. Обновите страницу.');
