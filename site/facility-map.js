/* Archived commercial energy statistics. No inference of current activity. */
const FacilityMap=(()=>{
 function group(rows){const groups=new Map();for(const r of rows){if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))continue;const key=Math.floor(r.latitude)+':'+Math.floor(r.longitude);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}return [...groups].map(([key,rows])=>({key,rows,latitude:rows.reduce((s,r)=>s+r.latitude,0)/rows.length,longitude:rows.reduce((s,r)=>s+r.longitude,0)/rows.length}))}
 function filter(rows,fuel,q,reported){const text=String(q||'').toLowerCase().trim();return rows.filter(r=>(!fuel||r.fuel===fuel)&&(!text||r.name.toLowerCase().includes(text))&&(!reported||Object.keys(r.generation||{}).length))}
 return {group,filter}
})();
if(typeof module!=='undefined')module.exports=FacilityMap;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('facility-form');if(!form)return;
 const fuel=$('facility-fuel'),query=$('facility-query'),reported=$('facility-generation'),status=$('facility-status'),host=$('facility-map'),list=$('facility-list'),more=$('facility-more'),exp=$('facility-csv'),all=$('facility-all');
 const types={Coal:'Уголь',Gas:'Газ',Oil:'Нефтепродукты',Hydro:'Гидроэнергетика',Nuclear:'Атомная энергетика',Wind:'Ветер',Solar:'Солнце',Biomass:'Биомасса',Waste:'Отходы',Other:'Прочее',Unknown:'Не указано'};
 const type=s=>types[s]||s,fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:2}):'нет данных';
 let data,geo,manifest,rows=[],selected=null,limit=25;
 function renderList(){
  const shown=selected||rows;list.replaceChildren();$('facility-selection').textContent=(selected?'Выбранная группа':'Вся выборка')+' · '+shown.length+' записей';
  for(const r of shown.slice(0,limit)){const a=node('article','');a.append(node('h3',r.name),node('p',type(r.fuel)+' · мощность: '+fmt(r.capacity_mw)+' МВт · год мощности: '+(r.capacity_year||'не указан')),node('p','Архивная выработка: '+(Object.entries(r.generation||{}).map(([y,v])=>y+': '+fmt(v)+' ГВт·ч').join('; ')||'нет данных')),node('p','Источник записи: '+(r.source||'не указан')+' · текущий статус не подтверждён'));try{const u=new URL(r.source_url);if(['http:','https:'].includes(u.protocol)){const link=node('a','Первоисточник записи');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';a.append(link)}}catch{}list.append(a)}
  if(!shown.length)list.append(node('p','Нет записей по выбранным условиям.'));
  more.hidden=shown.length<=limit;exp.disabled=!shown.length;all.disabled=!selected;
  exp.onclick=()=>csv('facility-energy-archive.csv',[['ID WRI','Название','Топливо','Мощность МВт (архив)','Год мощности','Архивная выработка ГВт·ч по годам','Источник','URL','Выпуск базы','SHA-256 архива','Статус'],...shown.map(r=>[r.id,r.name,r.fuel,r.capacity_mw,r.capacity_year,JSON.stringify(r.generation),r.source,r.source_url,data.release,data.sha256,'Текущий статус не подтверждён'])])
 }
 function draw(){
  host.replaceChildren();const polygons=geo.features.map(f=>RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4));
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const f of polygons)for(const r of f)for(const [u,v] of r){xmin=Math.min(xmin,u);xmax=Math.max(xmax,u);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v)}
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax)throw Error('Некорректная геометрия');
  const w=1180,h=650,scale=Math.min(1080/(xmax-xmin),475/(ymax-ymin)),x=v=>50+(1080-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>75+(475-scale*(ymax-ymin))/2+(v-ymin)*scale,ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Архивная карта площадок энергетики');
  function shape(tag,attrs,t,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;parent.append(e);return e}
  const txt=(xx,yy,t,size=15)=>shape('text',{x:xx,y:yy,'font-size':size,'font-family':'Arial,sans-serif',fill:'#173e52'},t);
  shape('rect',{width:w,height:h,fill:'#fff'});txt(25,32,'Энергетические площадки · архив 2021',22);txt(25,55,'Условные группы, не карта текущей работы предприятий.',14);
  for(const f of polygons){const d=f.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');shape('path',{d,fill:'#e1e4e1',stroke:'#52696e','stroke-width':.85,'fill-rule':'evenodd'})}
  // Merge nearby display symbols to preserve access and avoid label overlap.
  const placed=[];
  for(const g of FacilityMap.group(rows).sort((a,b)=>b.rows.length-a.rows.length)){const p=RegionalMap.project(g.longitude,g.latitude);if(!p)continue;const xx=x(p[0]),yy=y(p[1]);if(xx<0||xx>w||yy<75||yy>550)continue;const near=placed.find(c=>Math.hypot(c.x-xx,c.y-yy)<30);if(near)near.rows.push(...g.rows);else placed.push({x:xx,y:yy,rows:[...g.rows]})}
  for(const g of placed){const n=g.rows.length,mark=shape('g',{role:'button',tabindex:0,'aria-label':n+' архивных записей'});shape('circle',{cx:g.x,cy:g.y,r:12,fill:'#175e55',stroke:'#fff','stroke-width':1.5},undefined,mark);shape('text',{x:g.x,y:g.y+4,'font-size':10,'text-anchor':'middle',fill:'#fff'},n>99?'99+':String(n),mark);shape('title',{},n+' архивных записей',mark);const activate=()=>{selected=g.rows;limit=25;renderList()};mark.addEventListener('click',activate);mark.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}})}
  txt(25,580,'Значок — группа записей; отдельные близкие группы объединены для читаемости.',13);txt(25,605,'Источник: WRI Global Power Plant Database 1.3.0 · CC BY 4.0',13);txt(25,630,'Границы: Natural Earth / PiSpace Maps · SHA-256: '+String(data.sha256||'—').slice(0,16)+'…',12);
  const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap)
 }
 function refresh(){rows=FacilityMap.filter(data.rows,fuel.value,query.value,reported.value==='reported');selected=null;limit=25;status.textContent='Архивных записей: '+rows.length+' из '+data.rows.length+' · с опубликованной мощностью: '+rows.filter(r=>Number.isFinite(r.capacity_mw)).length+' · с исторической выработкой: '+rows.filter(r=>Object.keys(r.generation||{}).length).length;draw();renderList()}
 try{manifest=await Provenance.validateManifest(await load('data-manifest.json'));const get=async n=>(await Provenance.get(manifest,n,root)).data;data=await get('facility-energy.json');if(!data.rows?.length){status.textContent='Архив площадок пока не загружен. '+(data.error||'');return}geo=await get('regional-boundaries.geojson');for(const f of [...new Set(data.rows.map(r=>r.fuel))].sort())fuel.add(new Option(type(f),f));fuel.onchange=reported.onchange=refresh;query.oninput=refresh;more.onclick=()=>{limit+=25;renderList()};all.onclick=()=>{selected=null;limit=25;renderList()};form.onsubmit=e=>e.preventDefault();refresh()}catch(e){status.textContent='Карта недоступна: '+e.message}
});
