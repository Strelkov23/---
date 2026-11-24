/* Exact ISO 3166-2 to conservative statistical keys. No fuzzy territorial joins.
   The composite oblasts (ARK, TYU) are deliberately not joined because source
   polygons may include autonomous districts. Disputed / historical units remain uncoloured. */
const RegionalMap=(()=>{
 const pairs={
 BEL:'белгородская область',BRY:'брянская область',VLA:'владимирская область',VOR:'воронежская область',IVA:'ивановская область',KLU:'калужская область',KOS:'костромская область',KRS:'курская область',LIP:'липецкая область',MOS:'московская область',ORL:'орловская область',RYA:'рязанская область',SMO:'смоленская область',TAM:'тамбовская область',TVE:'тверская область',TUL:'тульская область',YAR:'ярославская область',VLG:'вологодская область',KGD:'калининградская область',LEN:'ленинградская область',MUR:'мурманская область',NGR:'новгородская область',PSK:'псковская область',AST:'астраханская область',VGG:'волгоградская область',ROS:'ростовская область',KIR:'кировская область',NIZ:'нижегородская область',ORE:'оренбургская область',PNZ:'пензенская область',SAM:'самарская область',SAR:'саратовская область',ULY:'ульяновская область',KGN:'курганская область',SVE:'свердловская область',CHE:'челябинская область',IRK:'иркутская область',KEM:'кемеровская область',NVS:'новосибирская область',OMS:'омская область',TOM:'томская область',AMU:'амурская область',MAG:'магаданская область',SAK:'сахалинская область',
 ALT:'алтайский край',ZAB:'забайкальский край',KAM:'камчатский край',KDA:'краснодарский край',KYA:'красноярский край',PER:'пермский край',PRI:'приморский край',STA:'ставропольский край',KHA:'хабаровский край',
 AD:'адыгея',AL:'алтай',BA:'башкортостан',BU:'бурятия',DA:'дагестан',IN:'ингушетия',KL:'калмыкия',KR:'карелия',KO:'коми',ME:'марий эл',MO:'мордовия',SA:'саха (якутия)',SE:'северная осетия - алания',TA:'татарстан',TY:'тыва',UD:'удмуртия',KK:'хакасия',CE:'чечня',CU:'чувашия',KC:'карачаево-черкесия',KB:'кабардино-балкария',
 KHM:'ханты-мансийский автономный округ',YAN:'ямало-ненецкий автономный округ',NEN:'ненецкий автономный округ',CHU:'чукотский автономный округ',YEV:'еврейская автономная область',MOW:'москва',SPE:'санкт-петербург'};
 function key(code){return typeof code==='string'&&code.startsWith('RU-')&&Object.prototype.hasOwnProperty.call(pairs,code.slice(3))?pairs[code.slice(3)]:null}
 // Lambert azimuthal equal-area, central longitude 100 E, latitude 65 N.
 function project(lon,lat){
  const rad=Math.PI/180,l=(lon-100)*rad,p=lat*rad,p0=65*rad;
  const d=1+Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l);
  if(d<=1e-9)return null;
  const k=Math.sqrt(2/d);return [k*Math.cos(p)*Math.sin(l),-k*(Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l))];
 }
 function rings(g){return g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[]}
 function classes(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return [];
  const q=p=>{const i=(sorted.length-1)*p,j=Math.floor(i);return sorted[j]+(sorted[Math.min(j+1,sorted.length-1)]-sorted[j])*(i-j)};
  return [...new Set([0,.2,.4,.6,.8,1].map(q))];
 }
 function bin(v,thresholds){if(!Number.isFinite(v)||!thresholds.length)return -1;if(thresholds.length===1)return 0;const i=thresholds.slice(1).findIndex(t=>v<=t);return i<0?thresholds.length-2:i}
 function theme(code){
 if(/^(GRP_|NW_GRP_|R_024d9416ea6f54dc_|R_7e8fd799d1d06897_|R_f54f02504bfb051e_)/.test(code))return 'economy';
 if(/^R_(347ab451705a6d33|425e9fbbe745e4e6|5f09b90031e93f90|c4e8751efbd23309)_/.test(code))return 'industry';
 if(/^R_(66b96177c45a01ad|6887143295c72599|88230ed30f2f2738|90575f546cc99ce3)_/.test(code))return 'investment';
 if(/^R_(65254a01945743d3|a4138d558584b81a|b8ff4db9a1b3092e|e8fd80380742955e)_/.test(code))return 'labor';
 if(/^R_(510509d40d0cb785|77976ed27f49b4fd|8728bc736516e87c|b7f9afa8b1ac06d9)_/.test(code))return 'budget';
 if(/^(HH_CONS_|R_(2308ddd83ecf600c|88f3fb354016c809|b772cc7700d0fcd7|f39e59bbabc208f3)_)/.test(code))return 'people';
 return 'all';
}
 function isGrowth(code){return /^(GRP_(PC_)?VOLUME_|R_(024d9416ea6f54dc|347ab451705a6d33|425e9fbbe745e4e6|5f09b90031e93f90|66b96177c45a01ad)_)/.test(code)}
 function growthBin(v){return !Number.isFinite(v)?-1:v<95?0:v<100?1:v===100?2:v<=105?3:4}
 return {key,project,rings,classes,bin,theme,isGrowth,growthBin};
})();
if(typeof module!=='undefined')module.exports=RegionalMap;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('geo-form');if(!form)return;
 const pick=$('geo-series'),year=$('geo-year'),status=$('geo-status'),host=$('geo-map'),details=$('geo-detail'),csvButton=$('geo-csv'),source=$('geo-source'),fields=['geo-series','geo-year'],saved=new URLSearchParams(location.search),ns='http://www.w3.org/2000/svg';
 const fmtValue=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:6}):'нет данных';
 const link=(t,u)=>{const a=node('a',t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a};
 let catalog=[],geo=null,meta=null,series=null,seq=0,first=true;
 const colors=['#e3f1ea','#b6dacb','#75b7a7','#388c83','#075953'];
 const themePick=$('geo-theme'),growthPick=$('geo-scale'),markerPick=$('geo-markers');
 const activeFields=[...fields,...['geo-theme','geo-scale','geo-markers'].filter(id=>$(id))];
 function draw(){
  if(!geo||!series)return;
  host.replaceChildren();details.replaceChildren();csvButton.disabled=true;
  const Y=Number(year.value),sample=RegionalStats.sample(series.values.filter(r=>r.year===Y)),counts=new Map();
  const regionName=p=>typeof p?.name==='string'&&p.name.trim()?p.name:'Контур без названия';
  const regionKey=p=>typeof p?.name==='string'&&p.name.trim()?RegionalMap.key(p.iso_3166_2):null;
  for(const f of geo.features){const k=regionKey(f.properties);if(k)counts.set(k,(counts.get(k)||0)+1)}
  const features=geo.features.map(feature=>{const f={...feature,properties:feature.properties||{}};const key=regionKey(f.properties),r=key&&counts.get(key)===1?sample.out.get(key):null;return {f,key,r}});
  const matched=features.filter(x=>x.r),unmapped=[...sample.out].filter(([key])=>counts.get(key)!==1);
  const thresholds=RegionalMap.classes(matched.map(x=>x.r.value));
  const growth=Boolean(growthPick&&growthPick.value==='growth'&&RegionalMap.isGrowth(series.code)),palette=growth?['#a53e35','#e8a39b','#f0f0ed','#a3d6bc','#207a57']:colors;
  if(growthPick){growthPick.querySelector('option[value="growth"]').disabled=!RegionalMap.isGrowth(series.code);if(!RegionalMap.isGrowth(series.code))growthPick.value='quantile'}
  status.textContent='Год: '+Y+' · сопоставлено '+matched.length+' из '+geo.features.length+' контуров · наблюдений без однозначной геометрии: '+unmapped.length;
  source.replaceChildren(node('p',series.title+' · '+series.unit+' · '+series.kind),link('Статистический первоисточник',series.source),document.createTextNode(' · '),link('Описание границ и лицензия',meta.documentation),node('p','Границы: '+meta.license+' · получены '+String(meta.downloaded||'—').slice(0,10)+' · '+(meta.status==='cached'?'сохранённая копия':'загруженный файл')));
  const polygons=features.map(x=>({...x,rings:RegionalMap.rings(x.f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const x of polygons)for(const ring of x.rings)for(const [u,v] of ring){xmin=Math.min(xmin,u);xmax=Math.max(xmax,u);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v)}
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax){status.textContent='Геометрия не пригодна для построения карты.';return}
  const w=1180,h=680,scale=Math.min(1080/(xmax-xmin),475/(ymax-ymin)),x=v=>50+(1080-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>100+(475-scale*(ymax-ymin))/2+(v-ymin)*scale;
  const svg=document.createElementNS(ns,'svg');for(const [k,v] of Object.entries({xmlns:ns,viewBox:'0 0 '+w+' '+h,width:w,height:h,role:'img','aria-label':'Карта региональных показателей за '+Y}))svg.setAttribute(k,v);
  function shape(tag,attrs,text,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e}
  const txt=(xx,yy,t,size=15)=>shape('text',{x:xx,y:yy,'font-size':size,'font-family':'Arial, sans-serif',fill:'#162e39'},t);
  shape('rect',{width:w,height:h,fill:'#fff'});txt(30,33,'Региональная статистика · '+Y,23);
  chartFitLabel(txt(30,58,series.title+' · '+series.unit,15),1120);
  txt(30,80,'Границы справочные; несопоставимые территории не окрашены.',13);
  const select=f=>{const p=f.f.properties,r=f.r;details.replaceChildren(node('h3',r?.region||regionName(p)),node('p',r?'Значение: '+fmtValue(r.value)+' '+series.unit+' · '+Y:'Нет однозначно сопоставимого наблюдения'),node('p','Код геометрии: '+(p.iso_3166_2||'—')));
    if(r){details.append(node('p',[r.sheet,r.row,r.column].filter(v=>v!==null&&v!==undefined).join(' / ')),node('p',r.note||''));const u=new URL('historical.html',location.href);u.searchParams.set('hist-series',series.code);u.searchParams.set('hist-region',r.region);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Открыть динамику территории');a.href=u.href;details.append(a)}};
  for(const f of polygons){
   const d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');
   if(!d)continue;
   const bin=growth?RegionalMap.growthBin(f.r?.value):RegionalMap.bin(f.r?.value,thresholds),fill=bin<0?'#deded9':palette[Math.min(bin,palette.length-1)];
   const p=shape('path',{d,fill,stroke:'#fff','stroke-width':.65,'fill-rule':'evenodd',tabindex:0,role:'button','aria-label':(f.r?.region||regionName(f.f.properties))+': '+fmtValue(f.r?.value)});
   shape('title',{},(f.r?.region||regionName(f.f.properties))+' · '+fmtValue(f.r?.value),p);p.addEventListener('click',()=>select(f));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f)}});
  }
  if(markerPick?.value==='top'){
   const top=polygons.filter(f=>f.r).sort((a,b)=>b.r.value-a.r.value).slice(0,8);
   for(const f of top){
    const ring=f.rings.slice().sort((a,b)=>b.length-a.length)[0];if(!ring?.length)continue;
    const mean=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
    const [u,v]=ring.reduce((a,p)=>Math.hypot(p[0]-mean[0],p[1]-mean[1])<Math.hypot(a[0]-mean[0],a[1]-mean[1])?p:a,ring[0]);
    const g=shape('g',{transform:'translate('+x(u)+' '+y(v)+')',role:'button',tabindex:0,'aria-label':'Региональный показатель: '+f.r.region+' '+fmtValue(f.r.value)});
    shape('circle',{r:10,fill:'#173e52',stroke:'#fff','stroke-width':1.5},undefined,g);
    shape('path',{d:'M-6 5 V-1 L-2 1 V-4 L2 -1 V-6 H5 V5 Z',fill:'#fff'},undefined,g);
    shape('title',{},'Региональная статистика, не предприятие: '+f.r.region+' · '+fmtValue(f.r.value),g);
    g.addEventListener('click',()=>select(f));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f)}});
   }
  }
  const bins=thresholds.length===1?[[thresholds[0],thresholds[0]]]:thresholds.slice(1).map((v,i)=>[thresholds[i],v]);
  const labels=growth?['< 95%','95–<100%','100%','>100–105%','>105%']:bins.map(([lo,hi])=>fmtValue(lo)+' – '+fmtValue(hi));
  labels.forEach((label,i)=>{const xx=30+i*220;shape('rect',{x:xx,y:590,width:24,height:16,fill:palette[i]});chartFitLabel(txt(xx+30,603,label,12),185)});
  shape('rect',{x:30,y:613,width:24,height:15,fill:'#deded9'});txt(60,625,growth?'Серый: нет данных; 100% = уровень предыдущего года.':'Нет данных / не сопоставлено; квантильные интервалы по окрашенным территориям.',12);
  txt(30,648,'Границы: Natural Earth (public domain), PiSpace Maps · источник статистики: '+series.code,12);
  txt(30,665,'Версия: '+(version||'не определена')+' · SHA-256 геометрии: '+String(meta.sha256||'—').slice(0,16)+'…',11);
  const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap);
  const toolbar=node('div','');toolbar.className='actions';const msg=node('span','');
  const blob=()=>new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  const saveFile=(b,ext)=>{const u=URL.createObjectURL(b),a=node('a','');a.href=u;a.download='regional-map-'+series.code+'-'+Y+'.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)};
  const png=async()=>{const u=URL.createObjectURL(blob());try{const img=new Image();img.src=u;await img.decode();const c=document.createElement('canvas');c.width=w*2;c.height=h*2;c.getContext('2d').drawImage(img,0,0,c.width,c.height);return await new Promise((r,j)=>c.toBlob(b=>b?r(b):j(Error('PNG')),'image/png'))}finally{URL.revokeObjectURL(u)}};
  for(const [label,fn] of [['Скачать SVG',()=>saveFile(blob(),'svg')],['Скачать PNG',async()=>saveFile(await png(),'png')],['Копировать карту',async()=>navigator.clipboard.write([new ClipboardItem({'image/png':png()})])]]){const b=node('button',label);b.type='button';b.onclick=async()=>{try{await fn();msg.textContent='Готово'}catch{msg.textContent='Экспорт недоступен; используйте SVG.'}};toolbar.append(b)}toolbar.append(msg);host.append(toolbar);
  details.append(node('p','Выберите контур, чтобы открыть значение и ссылку на статистический ряд.'));
  const audit=node('details','');audit.append(node('summary','Сопоставление территорий и границ'));
  const table=node('table',''),hrow=table.createTHead().insertRow(),body=table.createTBody();for(const v of ['Код','Название геометрии','Территория статистики','Значение'])hrow.append(node('th',v));
  for(const f of features){const tr=body.insertRow();for(const v of [f.f.properties.iso_3166_2,regionName(f.f.properties),f.r?.region,fmtValue(f.r?.value)])tr.insertCell().textContent=v||'—'}
  audit.append(table,node('p','Наблюдения без контура: '+(unmapped.map(([,r])=>r.region).join('; ')||'нет')));host.append(audit);
  csvButton.disabled=!matched.length;csvButton.onclick=()=>csv('regional-map-'+series.code+'-'+Y+'.csv',[['Год','Код геометрии','Геометрия','Территория статистики','Код показателя','Значение','Единица','Источник','Лист','Строка','Столбец','SHA-256 границ','Источник границ'],...features.map(f=>[Y,f.f.properties.iso_3166_2,regionName(f.f.properties),f.r?.region,series.code,f.r?.value??'',series.unit,series.source,f.r?.sheet,f.r?.row,f.r?.column,meta.sha256,meta.source])]);save(activeFields)
 }
 async function choose(){
  const token=++seq,old=first?saved.get('geo-year'):year.value;series=null;host.replaceChildren();details.replaceChildren();csvButton.disabled=true;
  const m=catalog.find(s=>s.code===pick.value);if(!m)return;
  status.textContent='Загрузка ряда…';
  try{const data=await load(m.file);if(token!==seq)return;series={...data,code:m.code};const ys=[...new Set(data.values.map(r=>r.year))].sort((a,b)=>b-a);year.replaceChildren();for(const y of ys)year.add(new Option(String(y),String(y)));if(ys.includes(Number(old)))year.value=old;first=false;draw()}catch(e){if(token===seq){console.error(e);status.textContent='Ряд недоступен для этой версии.'}}
 }
 try{
  meta=await load('regional-boundaries.json');
  if(!['ok','cached'].includes(meta.status)){status.textContent='Файл границ пока недоступен; используйте тепловые карты и территориальные таблицы.';source.append(link('Документация источника',meta.documentation),node('p',meta.error||''));return}
  [geo,catalog]=await Promise.all([load('regional-boundaries.geojson'),load('historical.json').then(x=>x.series.filter(s=>s.regions>=3))]);
  function populate(preferred){
   const subset=catalog.filter(s=>!themePick||themePick.value==='all'||RegionalMap.theme(s.code)===themePick.value);
   pick.replaceChildren(...subset.map(s=>new Option(s.title+' · '+s.unit+' · '+s.kind,s.code)));
   if(subset.some(s=>s.code===preferred))pick.value=preferred;
   else {const def=subset.find(s=>s.code.startsWith('GRP_PC_'));if(def)pick.value=def.code}
   if(!subset.length){status.textContent='В этом слое нет загруженных рядов.';host.replaceChildren();details.replaceChildren();csvButton.disabled=true;return false}
   return true
  }
  if(themePick){const requested=catalog.find(s=>s.code===saved.get('geo-series'));if(requested&&!saved.has('geo-theme'))themePick.value=RegionalMap.theme(requested.code);restore(['geo-theme','geo-scale','geo-markers']);themePick.onchange=()=>{if(populate(pick.value))choose()}}
  populate(saved.get('geo-series'));restore(['geo-series']);pick.onchange=choose;year.onchange=draw;if(growthPick)growthPick.onchange=draw;if(markerPick)markerPick.onchange=draw;form.onsubmit=e=>e.preventDefault();choose()
 }catch(e){console.error(e);status.textContent='Географические данные недоступны для этой версии. Откройте текущую сборку или используйте таблицы.'}
});
