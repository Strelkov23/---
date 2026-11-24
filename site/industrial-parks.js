const ParkCatalogue=(()=>{
 const norm=s=>String(s||'').toLowerCase().replaceAll('ё','е').trim();
 function filter(rows,type,badge,q,region=''){return rows.filter(r=>(!region||r.region===region)&&(!type||(type==='unknown'?r.type===null:r.type===type))&&(!badge||(badge==='yes')===r.card_certified)&&(!norm(q)||norm(r.name).includes(norm(q))))}
 function counts(rows,all){const m=new Map(all.map(r=>[r.region,0]));for(const r of rows)m.set(r.region,(m.get(r.region)||0)+1);return [...m].map(([region,value])=>({region,value}))}
 return {filter,counts}
})();
if(typeof module!=='undefined')module.exports=ParkCatalogue;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('park-form'))return;
 const ids=['park-region','park-type','park-badge','park-query'],region=$('park-region'),type=$('park-type'),badge=$('park-badge'),query=$('park-query'),host=$('park-map'),status=$('park-status'),ns='http://www.w3.org/2000/svg';
 const link=(t,u)=>{const a=node('a',t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a};
 const n=v=>v.toLocaleString('ru');
 const makeTable=labels=>{const table=node('table',''),head=table.createTHead().insertRow();for(const label of labels)head.append(node('th',label));return table};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const {data,sha256}=await Provenance.get(manifest,'industrial-parks.json',root);
  $('park-source').append(node('p',data.note),node('p','Состояние: '+data.status+' · проверка: '+(data.checked||'—')+' · успешное получение: '+(data.success||'—')+' · SHA-256 HTML: '+(data.sha256||'—')+(data.error?' · '+data.error:'')));
  if(!data.rows.length){status.textContent='Каталог ещё не загружен; отсутствие записей не означает отсутствие площадок.';return}
  const geo=(await Provenance.get(manifest,'regional-boundaries.geojson',root)).data;
  const all=data.rows,regions=[...new Set(all.map(r=>r.region))].sort((a,b)=>a.localeCompare(b,'ru')),allCounts=ParkCatalogue.counts(all,all),mapped=RegionalStats.sample(allCounts);
  region.replaceChildren(new Option('Все регионы каталога',''),...regions.map(r=>new Option(r,r)));
  restore(ids);
  const iso=new URLSearchParams(location.search).get('park-iso');if(iso&&!region.value){const selected=mapped.out.get(RegionalMap.key(iso));if(selected)region.value=selected.region}
  const geometries=geo.features.map(f=>({key:(f.properties?.name||'').trim()?RegionalMap.key(f.properties?.iso_3166_2):null,name:RegionalMap.displayName(f.properties?.iso_3166_2,f.properties?.name||''),rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(...p)).filter(Boolean)).filter(r=>r.length>=4)}));
  const multiplicity=new Map();for(const f of geometries)if(f.key)multiplicity.set(f.key,(multiplicity.get(f.key)||0)+1);
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(const f of geometries)for(const ring of f.rings)for(const [x,y] of ring){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
  if(![xmin,ymin,xmax,ymax].every(Number.isFinite)||xmax<=xmin||ymax<=ymin)throw Error('Границы недоступны');
  const w=1100,h=610,scale=Math.min(1020/(xmax-xmin),520/(ymax-ymin)),X=x=>40+(1020-scale*(xmax-xmin))/2+(x-xmin)*scale,Y=y=>40+(520-scale*(ymax-ymin))/2+(y-ymin)*scale;
  const shape=(parent,tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e};
  let limit=30,shown=[];
  function list(){
   const t=makeTable(['Регион','Название','Тип','Метка АИП','Источник']),b=t.createTBody();
   for(const r of shown.slice(0,limit)){const tr=b.insertRow();for(const v of [r.region,r.name+(r.ambiguous_name?' (неоднозначное название)':''),r.type||'Не указан',r.card_certified?'Указана':'Не указана'])tr.insertCell().textContent=v;tr.insertCell().append(link(r.url?'Карточка':'Каталог',r.url||data.source))}
   $('park-table').replaceChildren(t);$('park-selection').textContent='Показано '+Math.min(limit,shown.length)+' из '+shown.length+' карточек';$('park-more').hidden=shown.length<=limit;$('park-export').disabled=!shown.length;
  }
  function draw(){
   const filtered=ParkCatalogue.filter(all,type.value,badge.value,query.value),rank=ParkCatalogue.counts(filtered,all),sample=RegionalStats.sample(rank);
   shown=ParkCatalogue.filter(all,type.value,badge.value,query.value,region.value);limit=30;
   status.textContent='Каталог: '+all.length+' карточек · '+regions.length+' региональных групп · выборка: '+shown.length;
   const metrics=$('park-metrics');metrics.replaceChildren();
   const joinable=geometries.filter(f=>f.key&&multiplicity.get(f.key)===1&&sample.out.has(f.key));
   for(const [label,value] of [['Карточки выборки',shown.length],['Метки АИП',shown.filter(r=>r.card_certified).length],['Неоднозначные названия',shown.filter(r=>r.ambiguous_name).length],['Сопоставленные контуры',joinable.length]]){const item=node('div','');item.className='metric';item.append(node('b',n(value)),node('span',label));metrics.append(item)}
   host.replaceChildren();const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Число карточек каталога по регионам');
   shape(svg,'rect',{width:w,height:h,fill:'#fff'});const palette=RegionalMap.palette('enterprises'),thresholds=RegionalMap.classes(joinable.map(f=>sample.out.get(f.key).value));
   for(const f of geometries){const r=f.key&&multiplicity.get(f.key)===1?sample.out.get(f.key):null,bin=RegionalMap.bin(r?.value,thresholds),d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(2)+' '+Y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');if(!d)continue;
    const path=shape(svg,'path',{d,fill:bin<0?'#ddd':palette[bin],stroke:r&&r.region===region.value?'#102b35':'#516970','stroke-width':r&&r.region===region.value?2.6:.8,'fill-rule':'evenodd','aria-label':f.name+': '+(r?n(r.value):'нет сопоставления'),tabindex:r?0:-1,role:r?'button':'img'});
    shape(path,'title',{},f.name+' · '+(r?n(r.value)+' карточек':'нет сопоставления'));if(r){const choose=()=>{region.value=r.region;draw()};path.onclick=choose;path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}}}}
   const wrap=node('div','');wrap.className='regional-figure-scroll';wrap.append(svg);host.append(wrap);
   const legend=node('div','');legend.className='legend';const labels=thresholds.length===1?[n(thresholds[0])]:thresholds.slice(1).map((v,i)=>(i?' > ':'')+thresholds[i].toLocaleString('ru',{maximumFractionDigits:1})+' — '+v.toLocaleString('ru',{maximumFractionDigits:1}));
   for(const [i,label] of [...labels,'Нет сопоставления'].entries()){const span=node('span',''),sw=node('b','');sw.style.cssText='display:inline-block;width:1rem;height:1rem;border:1px solid #516970;background:'+(i===labels.length?'#ddd':palette[i]);span.append(sw,document.createTextNode(' '+label));legend.append(span)}host.append(legend);
   const t=makeTable(['Регион каталога','Карточки по фильтрам']),b=t.createTBody();
   for(const r of rank.sort((a,b)=>b.value-a.value||a.region.localeCompare(b.region,'ru'))){const tr=b.insertRow(),btn=node('button',r.region);btn.type='button';btn.onclick=()=>{region.value=r.region;draw()};tr.insertCell().append(btn);tr.insertCell().textContent=n(r.value)}
   $('park-regional-table').replaceChildren(t);list();save(ids);
   $('park-export').onclick=()=>csv('industrial-park-catalogue.csv',[['Номер карточки','Регион','Название','Тип территории','Метка сертификации АИП','Неоднозначное название','Карточка','Источник','Дата загрузки','SHA-256 HTML','SHA-256 JSON','Отпечаток манифеста','Ограничение'],...shown.map(r=>[r.record,r.region,r.name,r.type,r.card_certified,r.ambiguous_name,r.url,data.source,data.success,data.sha256,sha256,manifest.data_fingerprint,data.note])]);
  }
  $('park-form').onsubmit=e=>e.preventDefault();for(const id of ids)$(id).addEventListener(id==='park-query'?'input':'change',draw);$('park-more').onclick=()=>{limit+=30;list()};draw();
 }catch(e){status.textContent='Каталог недоступен: '+String(e.message||e)}
});
