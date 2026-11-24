/* Deterministic headline mentions, not event geocoding. */
const NewsGeo=(()=>{
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim();
 const esc=s=>s.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
 const wrap=s=>new RegExp('(?:^|[^а-яa-z0-9])('+s+')(?=$|[^а-яa-z0-9])','u');
 function dictionary(names){
  const result=new Map(),special={
   'RU-MOW':'москва|москве|москву|москвы|москвой','RU-SPE':'санкт-петербург(?:а|е|у|ом)?',
   'RU-BA':'башкортостан(?:а|е|у|ом)?|башкирия|башкирии','RU-TA':'татарстан(?:а|е|у|ом)?',
   'RU-SA':'якутия|якутии|якутию|республика саха|республики саха',
   'RU-KEM':'кемеровск(?:ая|ой|ую) област(?:ь|и|ью)|кузбасс(?:а|е|у|ом)?',
   'RU-KHM':'ханты-мансийск(?:ий|ого|ом|ому|им) автономн(?:ый|ого|ом|ому|ым) округ(?:а|е|у|ом)?|хмао|югра|югре|югры',
   'RU-YAN':'ямало-ненецк(?:ий|ого|ом|ому|им) автономн(?:ый|ого|ом|ому|ым) округ(?:а|е|у|ом)?|янао',
   'RU-NEN':'ненецк(?:ий|ого|ом|ому|им) автономн(?:ый|ого|ом|ому|ым) округ(?:а|е|у|ом)?',
   'RU-CHU':'чукотск(?:ий|ого|ом|ому|им) автономн(?:ый|ого|ом|ому|ым) округ(?:а|е|у|ом)?|чукотка|чукотке|чукотки',
   'RU-YEV':'еврейск(?:ая|ой|ую) автономн(?:ая|ой|ую) област(?:ь|и|ью)',
   'RU-AL':'республик(?:а|и|е|у|ой) алтай','RU-KO':'республик(?:а|и|е|у|ой) коми',
   'RU-SE':'северн(?:ая|ой|ую) осети(?:я|и|ю|ей)','RU-ME':'мари(?:й|я) эл',
   'RU-UD':'удмурти(?:я|и|ю|ей)|удмуртск(?:ая|ой|ую) республик(?:а|и|е|у|ой)',
   'RU-TY':'тыва|тыве|тывы|тува|туве|тувы','RU-CE':'чечн(?:я|е|и|ю|ей)|чеченск(?:ая|ой|ую) республик(?:а|и|е|у|ой)'
  };
  for(const [code,raw] of Object.entries(names)){
   const name=norm(raw);let pattern=special[code];
   if(!pattern&&name.endsWith('ская область'))pattern=esc(name.slice(0,-'ая область'.length))+'(?:ая|ой|ую|ою) област(?:ь|и|ью)';
   if(!pattern&&name.endsWith('ский край'))pattern=esc(name.slice(0,-'ий край'.length))+'(?:ий|ого|ом|ому|им) кра(?:й|я|е|ю|ем)';
   if(!pattern&&name.endsWith('ия'))pattern=esc(name.slice(0,-2))+'и(?:я|и|ю|ей)';
   result.set(code,wrap(pattern||esc(name)));
  }
  return result
 }
 function mentions(title,dict){const t=norm(title);return [...dict].flatMap(([code,re])=>{const m=re.exec(t);return m?[{code,match:m[1]}]:[]})}
 function windowRows(rows,end,days,topic,q){
  const t=Date.parse(end+'T00:00:00Z');if(!Number.isFinite(t)||![7,30,90].includes(days))return [];
  const from=new Date(t-(days-1)*86400000).toISOString().slice(0,10),search=norm(q),seen=new Set();
  return rows.filter(r=>{const date=String(r.published||'').slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<from||date>end||!/^https?:\/\//i.test(r.url||'')||seen.has(r.url)||topic&&!String(r.topics||'').split(' · ').includes(topic)||search&&!norm(r.title).includes(search))return false;
   seen.add(r.url);return true
  }).sort((a,b)=>String(b.published).localeCompare(String(a.published)))
 }
 return {norm,dictionary,mentions,windowRows}
})();
if(typeof module!=='undefined')module.exports=NewsGeo;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('news-geo-form');if(!form)return;
 const status=$('news-geo-status'),host=$('news-geo-map'),list=$('news-geo-list'),region=$('news-geo-region'),days=$('news-geo-days'),topic=$('news-geo-topic'),query=$('news-geo-query'),more=$('news-geo-more'),exp=$('news-geo-export');
 const fields=['news-geo-days','news-geo-topic','news-geo-region','news-geo-query'];
 let limit=25,selected='',rows=[],groups=new Map(),manifest,names,dict,polygons,archive,end;
 const label=code=>{const s=names[code]||code||'—';return s[0].toUpperCase()+s.slice(1)};
 const ns='http://www.w3.org/2000/svg';
 function renderList(){
  const selection=selected?groups.get(selected)||[]:rows.filter(r=>r.matches.length);
  list.replaceChildren();$('news-geo-selection').textContent=(selected?label(selected):'Все регионы с упоминаниями')+' · публикаций: '+selection.length;
  for(const r of selection.slice(0,limit)){
   const art=node('article',''),h=node('h3',''),a=node('a',r.title);a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';h.append(a);
   art.append(node('small',[String(r.published).slice(0,10),r.source,r.topics].filter(Boolean).join(' · ')),h,node('p','Упоминание: '+r.matches.map(m=>label(m.code)+' («'+m.match+'»)').join('; ')));list.append(art)
  }
  if(!selection.length)list.append(node('p','Нет публикаций в выбранной выборке. Измените период или тему.'));
  more.hidden=selection.length<=limit;exp.disabled=!selection.length;
  exp.onclick=()=>csv('regional-news.csv',[['Дата','Заголовок','Источник','Темы','URL','Региональные упоминания','Правило','Отпечаток данных'],...selection.map(r=>[String(r.published).slice(0,10),r.title,r.source,r.topics,r.url,r.matches.map(m=>m.code+': '+m.match).join('; '),'Явное упоминание в заголовке',manifest.data_fingerprint])])
 }
 function select(code){selected=code;region.value=code;limit=25;renderList();save(fields)}
 function drawMap(){
  host.replaceChildren();let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const f of polygons)for(const ring of f.rings)for(const [u,v] of ring){xmin=Math.min(xmin,u);xmax=Math.max(xmax,u);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v)}
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax)throw Error('Нет геометрии');
  const w=1180,h=650,scale=Math.min(1080/(xmax-xmin),470/(ymax-ymin)),x=v=>50+(1080-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>75+(470-scale*(ymax-ymin))/2+(v-ymin)*scale;
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Карта региональных упоминаний в экономических новостях');
  function shape(tag,attrs,t,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;parent.append(e);return e}
  const txt=(xx,yy,t,size=15)=>shape('text',{x:xx,y:yy,'font-size':size,'font-family':'Arial, sans-serif',fill:'#173e52'},t);
  const count=code=>(groups.get(code)||[]).length,fill=n=>n===0?'#e1e4e1':n<=2?'#d6e9e2':n<=5?'#8cc5b2':n<=10?'#398d7e':'#075953';
  function activate(p,code,name,n){p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',name+' · '+n+' публикаций');p.addEventListener('click',()=>select(code));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(code)}})}
  shape('rect',{width:w,height:h,fill:'#fff'});txt(25,32,'Экономические новости · '+days.value+' дней · до '+end,22);txt(25,55,'Административные контуры; значки — региональные упоминания, не место события.',14);
  for(const f of polygons){
   const code=f.code,n=count(code),d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');
   const p=shape('path',{d,fill:fill(n),stroke:'#52696e','stroke-width':.85,'fill-rule':'evenodd'}),name=names[code]?label(code):String(f.name||'Контур без сопоставления');
   shape('title',{},name+' · '+n+' упоминаний',p);if(n)activate(p,code,name,n)
  }
  const placed=[];
  for(const f of polygons.filter(f=>count(f.code)>0).sort((a,b)=>count(b.code)-count(a.code))){
   const ring=f.rings.slice().sort((a,b)=>b.length-a.length)[0];if(!ring?.length)continue;
   const mean=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]),p=ring.reduce((a,p)=>Math.hypot(p[0]-mean[0],p[1]-mean[1])<Math.hypot(a[0]-mean[0],a[1]-mean[1])?p:a,ring[0]);
   const xx=x(p[0]),yy=y(p[1]);if(placed.some(([a,b])=>Math.hypot(a-xx,b-yy)<30))continue;placed.push([xx,yy]);
   const n=count(f.code),g=shape('g',{transform:'translate('+xx+' '+yy+')','class':'news-pin'});
   shape('circle',{r:13,fill:'#173e52',stroke:'#fff','stroke-width':1.6},undefined,g);
   shape('text',{x:0,y:4,'font-size':10,'font-family':'Arial, sans-serif','font-weight':'bold','text-anchor':'middle',fill:'#fff'},n>99?'99+':String(n),g);
   shape('title',{},label(f.code)+' · '+n+' публикаций',g);activate(g,f.code,label(f.code),n)
  }
  [[0,'Нет упоминаний'],[1,'1–2'],[3,'3–5'],[6,'6–10'],[11,'Более 10']].forEach(([n,t],i)=>{shape('rect',{x:25+i*220,y:565,width:20,height:16,fill:fill(n),stroke:'#52696e','stroke-width':.5});txt(52+i*220,578,t,13)});
  txt(25,600,'Близкие значки скрыты для читаемости; все регионы с новостями доступны в списке.',13);
  txt(25,620,'Источник: архив сайта · Natural Earth / PiSpace Maps',13);txt(25,638,'Отпечаток данных: '+manifest.data_fingerprint.slice(0,16)+'…',12);
  const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap)
 }
 function refresh(){
  rows=NewsGeo.windowRows(archive,end,Number(days.value),topic.value,query.value).map(r=>({...r,matches:NewsGeo.mentions(r.title,dict)}));
  groups=new Map();for(const r of rows)for(const m of r.matches){if(!groups.has(m.code))groups.set(m.code,[]);groups.get(m.code).push(r)}
  region.replaceChildren(new Option('Все регионы с упоминаниями',''),...[...groups.keys()].sort((a,b)=>label(a).localeCompare(label(b),'ru')).map(k=>new Option(label(k)+' ('+groups.get(k).length+')',k)));
  if(!groups.has(selected))selected='';region.value=selected;limit=25;
  const n=rows.filter(r=>r.matches.length).length;
  status.textContent='Период до '+end+' · публикаций: '+rows.length+' · с региональными упоминаниями: '+n+' · без привязки: '+(rows.length-n)+' · регионов: '+groups.size;
  drawMap();renderList();save(fields)
 }
 try{
  manifest=await Provenance.validateManifest(await load('data-manifest.json'));end=String(manifest.built).slice(0,10);
  const get=async n=>(await Provenance.get(manifest,n,root)).data;
  const geo=await get('regional-boundaries.geojson');archive=await get('archive.json');
  names={...RegionalMap.regionNames(),'RU-ARK':'архангельская область','RU-TYU':'тюменская область'};
  const counts=new Map();for(const f of geo.features){const c=f.properties?.iso_3166_2;if(c)counts.set(c,(counts.get(c)||0)+1)}
  names=Object.fromEntries(Object.entries(names).filter(([c])=>counts.get(c)===1));dict=NewsGeo.dictionary(names);
  polygons=geo.features.map(f=>({code:f.properties?.iso_3166_2,name:f.properties?.name,rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  const topics=[...new Set(archive.flatMap(r=>String(r.topics||'').split(' · ')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));for(const t of topics)topic.add(new Option(t,t));
  restore(['news-geo-days','news-geo-topic','news-geo-query']);selected=new URLSearchParams(location.search).get('news-geo-region')||'';
  days.onchange=topic.onchange=refresh;query.oninput=refresh;region.onchange=()=>select(region.value);more.onclick=()=>{limit+=25;renderList()};form.onsubmit=e=>e.preventDefault();refresh()
 }catch(e){status.textContent='Карта недоступна для этой версии: '+e.message;exp.disabled=true}
});
