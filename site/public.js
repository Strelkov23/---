const el=id=>document.getElementById(id);
const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
const fmt=v=>v.toLocaleString('ru',{maximumFractionDigits:2});
const params=new URLSearchParams(location.search);
const requestedSnapshot=params.get('snapshot')||'';
const dynamicPages=new Set(['','index.html','compare.html','papers.html','desk.html','statistics.html','diagnostics.html','scenario.html','methodology.html','national.html','historical.html','industrial.html','sector-passports.html','monitoring.html','data-centre.html','sectors.html','analysis-centre.html','research-centre.html','quality-centre.html','data-registry.html','reproducibility.html','index-builder.html','report-builder.html','finance.html','financial-state.html','cost-structure.html']);
const currentPage=location.pathname.split('/').at(-1)||'';
const pinned=dynamicPages.has(currentPage)&&/^[0-9a-f]{40}$/i.test(requestedSnapshot)?requestedSnapshot:'';
const root=/^[0-9a-f]{40}$/i.test(pinned)?'https://raw.githubusercontent.com/Strelkov23/---/'+pinned+'/history/published/':'';
let versionRequest;
async function ensureVersion(){if(version)return version;if(!versionRequest)versionRequest=fetch('version.txt',{cache:'no-cache'}).then(async r=>{if(r.ok){const v=(await r.text()).trim();if(/^[a-f0-9]{40}$/i.test(v))version=v}return version}).catch(()=>version);return versionRequest}
async function load(file){const r=await fetch(root+file);if(!r.ok)throw Error();const data=await r.json();await ensureVersion();return data}
function restore(ids){
 for(const id of ids){const value=params.get(id);if(value!==null){const field=el(id);if(!field)continue;if(field.tagName!=='SELECT'||Array.from(field.options).some(o=>o.value===value))field.value=value}}
}
function save(ids){
 const url=new URL(location.href);for(const id of ids){if(el(id).value)url.searchParams.set(id,el(id).value);else url.searchParams.delete(id)}history.replaceState(null,'',url)
}
function stem(word){
 return word.length<5?word:word.replace(/(иями|ями|ами|ого|его|ому|ему|ыми|ими|иях|иям|ией|ия|ии|ий|ию|ие|ях|ах|ам|ом|ов|ем|ая|ые|ый|ой|ую|а|ы|у|и|е|я|ю)$/u,'')
}
function sourceKind(r){
 if(r.source==='Официальное опубликование правовых актов')return 'Правовой акт';
 return ['Ведомости','ПРАЙМ','ТАСС','Интерфакс','Коммерсантъ','Парламентская газета'].includes(r.source)?'СМИ':'Ведомство'
}
function russianContext(r){
 return r.url.includes('publication.pravo.gov.ru/')||['Правительство России','ФНС России','Банк России','Росстат','Минпромторг России'].includes(r.source)||/росси|россий|москв|рубл|кремл|госдум|минфин|минпромторг|(^|[^а-я])(рф|цб)([^а-я]|$)/iu.test(r.title)
}
let version=pinned;
function csv(name,rows){
 const time=new Date().toISOString();rows=rows.map((r,i)=>i===0?[...r,'Версия данных','Выгружено UTC']:[...r,version,time]);
 const quote=value=>{let s=String(value??'');if(typeof value==='string' && /^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 const contents=rows.map(row=>row.map(v=>quote(typeof v==='number'?v.toLocaleString('ru',{useGrouping:false,maximumFractionDigits:12}):v)).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff',contents],{type:'text/csv;charset=utf-8'}));const link=node('a','');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function archive(){
 const rows=await load('archive.json'),params=new URLSearchParams(location.search);
 for(const [id,values] of [['publisher',rows.map(r=>r.source)],['sector',rows.flatMap(r=>(r.topics||'').split(' · '))]]){
 el(id).add(new Option('Все',''));for(const v of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))el(id).add(new Option(v,v))}
 const ids=['q','publisher','sector','start','end','mode','geo','kind'];restore(ids); if(params.get('publisher')==='Правительство РФ')el('publisher').value='Правительство России';
 for(const [v,label] of [[fmt(rows.length),'материалов в архиве'],[fmt(new Set(rows.map(r=>r.source)).size),'источников в архиве'],[rows.map(r=>r.published?.slice(0,10)).filter(Boolean).sort().at(-1) || '—','последняя дата публикации']]){
 const box=node('div','');box.className='metric';box.append(node('b',v),node('span',label));el('overview').append(box)}
 let limit=20,matches=[];
 function draw(){
 const words=el('q').value.toLowerCase().trim().split(/\s+/),start=el('start').value,end=el('end').value;
 const query=words.map(w=>el('mode').value==='literal'?w:stem(w.replaceAll('ё','е')));
 matches=rows.filter(r=>{const date=(r.published||'').slice(0,10);return (!el('kind').value||sourceKind(r)===el('kind').value)&&(!start||date>=start)&&(!end||date&&date<=end)&&(!el('publisher').value||r.source===el('publisher').value)&&(!el('sector').value||(r.topics||'').split(' · ').includes(el('sector').value))&&(!el('geo').value||russianContext(r)===(el('geo').value==='ru'))&&query.every(w=>[r.title,r.source,r.topics].join(' ').toLowerCase().replaceAll('ё',el('mode').value==='literal'?'ё':'е').includes(w))});
 el('count').textContent=start&&end&&start>end?'Начальная дата позже конечной':('Найдено материалов: '+fmt(matches.length));el('list').replaceChildren();
 for(const r of matches.slice(0,limit)){const card=node('article',''),h=node('h3',''),a=node('a',r.title);if(/^https?:\/\//i.test(r.url||'')){a.href=r.url;a.target='_blank';a.rel='noopener noreferrer'}h.append(a);card.append(node('small',[r.published?.slice(0,10),r.source,r.topics].filter(Boolean).join(' · ')),h);el('list').append(card)}
 el('more').hidden=matches.length<=limit;el('newscsv').disabled=!matches.length;
 const url=new URL(location.href);for(const id of ids){if(el(id).value)url.searchParams.set(id,el(id).value);else url.searchParams.delete(id)}history.replaceState(null,'',url)
 }
 el('newscsv').onclick=()=>csv('economic-archive.csv',[['Дата','Заголовок','Источник','Темы','Ссылка','Первое наблюдение UTC'],...matches.map(r=>[r.published,r.title,r.source,r.topics,r.url,r.seen])]);
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
 chartTickIndices(years.length,5).forEach(i=>add('text',{x:x(i),y:220,'font-size':11,'text-anchor':i===0?'start':i===years.length-1?'end':'middle'},years[i]));
 values.forEach((row,j)=>{const color=['#006c69','#a24724'][j];let path='',continuous=false;row.forEach((v,i)=>{if(!Number.isFinite(v)){continuous=false;return}path+=(continuous?'L':'M')+x(i)+' '+y(v)+' ';continuous=true;const dot=add('circle',{cx:x(i),cy:y(v),r:2.8,fill:color});const title=document.createElementNS(ns,'title');title.textContent=years[i]+' · '+fmt(v)+'%';dot.append(title)});add('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':j?'6 3':'none'})});return host
}
async function stats(){
 const d=await load('stats.json');
 for(const id of ['first','second'])for(const [code,title] of Object.entries(d.series))el(id).add(new Option(title,code));
 el('second').selectedIndex=1;restore(['first','second','span']);
 function draw(){
 const codes=['first','second'].map(id=>el(id).value),maps=codes.map(code=>new Map(d.values.filter(r=>r.code===code&&Number.isFinite(r.value)).map(r=>[Number(r.year),r.value])));
 const available=[...maps[0].keys(),...maps[1].keys()];el('chart').replaceChildren();el('numbers').replaceChildren();el('seriescsv').disabled=true;
 if(!available.length){el('chart').textContent='За выбранный период данных нет';return}
 const last=Math.max(...available),first=Math.max(Math.min(...available),last-Number(el('span').value)+1),years=Array.from({length:last-first+1},(_,i)=>first+i);
 const legend=node('div','');legend.className='legend';
 codes.forEach((code,i)=>{const a=node('a',d.series[code]);a.href='https://data.worldbank.org/indicator/'+code+'?locations=RU';legend.append(a)});
 el('chart').append(legend,lineChart(years,maps.map(m=>years.map(y=>m.get(y)))));
 if(maps.some(m=>years.some(y=>m.has(y))))chartTools(el("chart"),"Добавленная стоимость отраслей","% ВВП",years,codes.map((code,i)=>({code,name:d.series[code],values:years.map(y=>maps[i].get(y))})));
 const common=years.filter(y=>maps.every(m=>m.has(y)));
 if(common.length>=2){
 const from=common[0],to=common.at(-1),summary=node('p','Изменение за '+from+'–'+to+' гг. по общим наблюдениям: ');
 summary.append(document.createTextNode(maps.map((m,i)=>{const change=m.get(to)-m.get(from);return d.series[codes[i]]+' '+(change>0?'+':'')+fmt(change)+' п. п.'}).join(' · ')));el('chart').append(summary)
 }
 const table=node('table',''),header=table.createTHead().insertRow(),labels=['Год',...codes.map(c=>d.series[c]+', % ВВП')];labels.forEach(s=>header.append(node('th',s)));const body=table.createTBody();
 const rows=years.map(y=>[y,...maps.map(m=>m.get(y))]);for(const row of [...rows].reverse()){const tr=body.insertRow();row.forEach((v,i)=>tr.insertCell().textContent=i===0?v:v==null?'—':fmt(v))}
 el('numbers').append(table);el('seriescsv').disabled=false;el('seriescsv').onclick=()=>csv('world-bank-russia.csv',[[...labels,'Страна','Коды WDI','Источник'],...rows.map(r=>[...r,'RUS',codes.join(' / '),'World Bank WDI'])]);
 }
 for(const id of ['first','second','span'])el(id).onchange=()=>{save(['first','second','span']);draw()};draw()
}
async function model(){
 const m=await load('sectors.json');
 m.names.forEach((s,i)=>el('industry').add(new Option(s,i)));
 el('industry').value='8';
 restore(['industry','shock']);
 function draw(){
   const field=el('shock'), g=Number(el('industry').value), percent=field.valueAsNumber;
   const details=el('protocol'), download=el('scenario-csv');
   const add=el("add-scenario"); add.disabled=true; add.textContent="Добавить расчёт в справку";
   details.replaceChildren(); el('effects').replaceChildren(); download.disabled=true;
   if(!field.value || !field.validity.valid || !Number.isFinite(percent)){
     el('effect').textContent='Укажите изменение от −20 до 20%'; return;
   }
   const base=m.demand[g]/1000, direct=base*percent/100;
   const changes=m.effects.map(row=>row[g]*percent/100000);
   const total=changes.reduce((sum,value)=>sum+value,0), indirect=total-direct;
   const imports=m.imports[g]*percent/100000;
   el('effect').textContent='Изменение валового выпуска: '+fmt(total)+' млрд ₽';
   const steps=[
     'Конечный спрос на отечественные продукты группы в 2021 году: '+fmt(base)+' млрд ₽. Изменение спроса: '+fmt(base)+' × ('+fmt(percent)+' / 100) = '+fmt(direct)+' млрд ₽.',
     'Для каждого из 113 продуктов изменение выпуска равно сумме изменений спроса, умноженных на коэффициенты его строки матрицы L = (I − A)⁻¹. В каждом столбце A поставки продукта разделены на выпуск потребляющей отрасли.',
     'Сумма изменений выпуска всех продуктов: '+fmt(total)+' млрд ₽. Из неё исходное изменение спроса составляет '+fmt(direct)+' млрд ₽, а дополнительные поставки по производственным цепочкам — '+fmt(indirect)+' млрд ₽.',
     'Импортные промежуточные затраты: '+fmt(imports)+' млрд ₽. Расчёт суммирует изменения выпуска по продуктам с весами, равными их прямым импортным затратам на рубль выпуска. Эта величина показана отдельно.'
   ];
   const list=node('ol','');
   steps.forEach(s=>list.append(node('li',s)));
   details.append(list,node('p','Сценарий сохраняет цены и структуру затрат 2021 года. Свободные мощности и сроки поставок в расчёт не входят. Валовой выпуск включает повторный счёт промежуточных поставок; для оценки ВВП нужны коэффициенты добавленной стоимости.'));
   const profile=node('a','Состав отрасли и крупнейшие поставщики'); profile.href='sector-'+(g+1)+'.html'; details.append(profile);
   changes.map((amount,i)=>({amount,name:m.names[i]})).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).forEach(({amount,name})=>el('effects').append(node('p',name+' · '+fmt(amount)+' млрд ₽')));
   add.disabled=false;
   add.onclick=()=>{
     const url=new URL(location.href); url.hash='model';
     if(version) url.searchParams.set('snapshot',version);
     try{
       const key='economics-brief-models', saved=JSON.parse(localStorage.getItem(key)||'{}');
       saved[url.href]={name:m.names[g],percent,steps,url:url.href};
       localStorage.setItem(key,JSON.stringify(saved));
       add.textContent='Расчёт добавлен в справку';
     }catch{add.textContent='Сохранение недоступно — скачайте CSV'}
   };
   download.disabled=false;
   download.onclick=()=>csv('scenario-2021.csv',[
     ['Группа',m.names[g]],['Год',2021],['Единица денежных показателей','млрд рублей базового года'],['Метод','Δx = L × Δy'],['Источник','https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'],
     ['Базовый спрос',base],['Изменение, %',percent],['Прямой эффект',direct],['Косвенный эффект',indirect],['Валовой выпуск, изменение',total],['Импортные затраты, изменение',imports],
     ['Отрасль','Изменение выпуска, млрд ₽'],...m.names.map((name,i)=>[name,changes[i]])]);
 }
 el('industry').onchange=el('shock').oninput=()=>{save(['industry','shock']);draw()};draw();
}
async function start(){
 if(!el('filters'))return;
 if(!version){const response=await fetch('version.txt');if(!response.ok)throw Error();version=(await response.text()).trim()}
 const status=await load('status.json'), sources=Object.entries(status.news).sort((a,b)=>b[1]-a[1]);
 const total=sources.reduce((sum,r)=>sum+r[1],0);
 el('health').textContent='Сборка '+new Date(status.built).toLocaleString('ru',{timeZone:'Europe/Moscow'})+' МСК · ежедневно в 06:17 МСК. '+(status.failures.length?'Частичное обновление: '+status.failures.length+' источников; подробности в методологии.':'Зарегистрированных ошибок нет.')+(total?' Доля «'+sources[0][0]+'» в новостях: '+fmt(100*sources[0][1]/total)+'%.':'');
 const cite=node('button','Закрепить версию данных в ссылке');cite.onclick=()=>{const url=new URL(location.href);url.searchParams.set('snapshot',version);history.replaceState(null,'',url);cite.textContent='Скопируйте адрес страницы — версия закреплена'};el('health').after(cite);
 if(el('monthly')){
   load('industry.json').then(rows=>{
     const data=rows.filter(r=>r&&typeof r.period==='string'&&Number.isFinite(r.value)).sort((a,b)=>b.period.localeCompare(a.period)),body=el('monthly'),more=el('monthly-more'),summary=el('monthly-summary');
     let full=false;
     function render(){
       body.replaceChildren();
       for(const row of (full?data:data.slice(0,12))){
         const tr=body.insertRow();tr.insertCell().textContent=row.period;tr.insertCell().textContent=fmt(row.value);
         const link=node('a','Выпуск Росстата');link.href=row.url;const cell=tr.insertCell();cell.append(link,node('small',row.verified?' · Проверено '+row.verified.slice(0,10):' · Архивное, повторно не подтверждено'));
         if(row.alternative_url){const alt=node('a',' · Альтернативный бюллетень');alt.href=row.alternative_url;cell.append(alt)}
         const directory=node('a',' · Раздел промышленности Росстата');directory.href='https://www.rosstat.gov.ru/enterprise_industrial';cell.append(directory)
       }
       if(!data.length)body.insertRow().insertCell().textContent='Нет доступных наблюдений';
       if(summary)summary.textContent='Показано '+(full?data.length:Math.min(data.length,12))+' из '+data.length+' месячных наблюдений, сначала последние.';
       if(more){more.hidden=data.length<=12;more.textContent=full?'Свернуть до 12 последних месяцев':'Показать весь ряд';more.setAttribute('aria-expanded',String(full));more.onclick=()=>{full=!full;render()}}
     }
     render()
   }).catch(()=>{el('monthly').insertRow().insertCell().textContent='Для этой версии ряд недоступен'})
 }
 for(const [fn,id] of [[archive,'count'],[model,'effect'],[stats,'chart']])fn().catch(()=>el(id).textContent='Не удалось загрузить данные. Обновите страницу.')
}
start().catch(()=>{if(el('health'))el('health').textContent='Снимок недоступен. Проверьте адрес или откройте главную страницу.'})

document.addEventListener('DOMContentLoaded',()=>{
 const n=el('snapshot-notice');if(!n)return;
 if(requestedSnapshot&&!pinned){n.hidden=false;n.textContent='Эта статическая страница отображает текущую сборку, а не закреплённую версию. Для исторических данных используйте статистический центр или сравнение.';const a=node('a',' Открыть закреплённый статистический центр');a.href='statistics.html?snapshot='+encodeURIComponent(requestedSnapshot);n.append(a)}
 else if(pinned){n.hidden=false;n.textContent='Закреплённая версия динамических данных: '+pinned+'. Статические страницы и методические тексты относятся к текущей сборке.';for(const a of document.querySelectorAll('header nav a,.section-nav a,.portal-grid a')){const u=new URL(a.href);if(u.origin===location.origin&&dynamicPages.has(u.pathname.split('/').at(-1))){u.searchParams.set('snapshot',pinned);a.href=u.href}}}
});
