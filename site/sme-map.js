/* FNS regional aggregates, never individual addresses or inferred production. */
const SMEMap=(()=>{
 // Codes from the FNS regional classification, matched explicitly to ISO 3166-2.
 const codes='01:AD 02:BA 03:BU 04:AL 05:DA 06:IN 07:KB 08:KL 09:KC 10:KR 11:KO 12:ME 13:MO 14:SA 15:SE 16:TA 17:TY 18:UD 19:KK 20:CE 21:CU 22:ALT 23:KDA 24:KYA 25:PRI 26:STA 27:KHA 28:AMU 29:ARK 30:AST 31:BEL 32:BRY 33:VLA 34:VGG 35:VLG 36:VOR 37:IVA 38:IRK 39:KGD 40:KLU 41:KAM 42:KEM 43:KIR 44:KOS 45:KGN 46:KRS 47:LEN 48:LIP 49:MAG 50:MOS 51:MUR 52:NIZ 53:NGR 54:NVS 55:OMS 56:ORE 57:ORL 58:PNZ 59:PER 60:PSK 61:ROS 62:RYA 63:SAM 64:SAR 65:SAK 66:SVE 67:SMO 68:TAM 69:TVE 70:TOM 71:TUL 72:TYU 73:ULY 74:CHE 75:ZAB 76:YAR 77:MOW 78:SPE 79:YEV 83:NEN 86:KHM 87:CHU 89:YAN';
 const cross=new Map(codes.split(' ').map(x=>{const [a,b]=x.split(':');return [a,'RU-'+b]}));
 // Composite oblast polygons are not coloured unless their territorial definition is established.
 function key(code){const k=cross.get(String(code));return ['RU-ARK','RU-TYU'].includes(k)?null:k||null}
 function join(rows,features){const counts=new Map();for(const f of features){const c=f.properties?.iso_3166_2;if(c)counts.set(c,(counts.get(c)||0)+1)}const matched=new Map();for(const r of rows){const k=key(r.code);if(k&&counts.get(k)===1)matched.set(k,r)}return matched}
 function ratio(a,b,scale=1){return Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>0?a/b*scale:null}
 function measures(r,national){
  return {...r,ipShare:ratio(r.individual,r.total,100),nationalShare:ratio(r.total,national.total,100),workersPerEntity:ratio(r.workers,r.total)};
 }
 function rank(rows,metric){
  return [...rows].sort((a,b)=>{const av=Number.isFinite(a[metric]),bv=Number.isFinite(b[metric]);return av!==bv?(av?-1:1):av?b[metric]-a[metric]||String(a.code).localeCompare(String(b.code)):String(a.code).localeCompare(String(b.code))});
 }
 function regionalComparison(data,ids,metric){
  const allowed=['total','legal','individual','workers','ipShare','nationalShare','workersPerEntity','legalShare','legalNationalShare'];
  if(!allowed.includes(metric)||!Array.isArray(ids)||ids.length<2||ids.length>8||new Set(ids).size!==ids.length)throw Error('Выберите от 2 до 8 разных регионов и показатель');
  const by=new Map(data.rows.map(r=>[r.code,r]));
  const all=data.rows.map(r=>({...measures(r,data.national),legalShare:ratio(r.legal,r.total,100),legalNationalShare:ratio(r.legal,data.national.legal,100)}));
  const ordered=rank(all,metric);
  const rows=ids.map(code=>{
   if(!by.has(code))throw Error('Регион отсутствует в срезе ФНС');
   const r=all.find(x=>x.code===code),v=r[metric];
   return {...r,value:v,place:Number.isFinite(v)?1+ordered.filter(x=>Number.isFinite(x[metric])&&x[metric]>v).length:null};
  });
  const max=Math.max(0,...rows.map(r=>Number.isFinite(r.value)?r.value:0));
  return {rows:rows.map(r=>({...r,width:Number.isFinite(r.value)&&max>0?100*r.value/max:null})),eligible:all.filter(r=>Number.isFinite(r[metric])).length};
 }
 return {key,join,ratio,measures,rank,regionalComparison}
})();
if(typeof module!=='undefined')module.exports=SMEMap;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('sme-form');if(!form)return;
 const status=$('sme-status'),host=$('sme-map'),metric=$('sme-metric'),detail=$('sme-detail'),exp=$('sme-export'),tableHost=$('sme-table');
 const label={total:'Субъекты МСП',legal:'Юридические лица',individual:'Индивидуальные предприниматели',workers:'Работники по данным реестра',ipShare:'Доля ИП, %',nationalShare:'Доля в количестве МСП РФ, %',workersPerEntity:'Учтённые работники на один субъект МСП'};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),get=async n=>(await Provenance.get(manifest,n,root)).data,data=await get('sme-regions.json');
  if(!data.rows.length){status.textContent='ФНС: срез пока недоступен. '+(data.error||'');return}
  const geo=await get('regional-boundaries.geojson'),rows=data.rows.map(r=>SMEMap.measures(r,data.national)),matched=SMEMap.join(rows,geo.features),fmt=n=>Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:2}):'—';
  status.textContent='Срез: '+data.period+' · регионов: '+data.rows.length+' · сопоставлено с контурами: '+matched.size+(data.error?' · сохранён прежний срез':'');
  const summary=$('sme-summary'),national=SMEMap.measures(data.national,data.national);
  for(const [title,value] of [['МСП России',national.total],['Доля ИП, %',national.ipShare],['Учтённые работники на субъект',national.workersPerEntity],['Региональных строк',rows.length]]){
   const card=node('div','');card.className='metric';card.append(node('b',fmt(value)),node('span',title));summary.append(card);
  }
  const query=$('sme-query'),scope=$('sme-scope'),selectionExport=$('sme-selection-export');
  function renderTable(){
   const field=metric.value,q=query.value.trim().toLocaleLowerCase('ru'),visible=SMEMap.rank(rows.filter(r=>(!q||r.name.toLocaleLowerCase('ru').includes(q)||r.code===q)&&(!scope.checked||matched.has(SMEMap.key(r.code)))),field);
   const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();
   for(const t of ['Регион','Всего МСП','ЮЛ','ИП','Работники','Доля ИП, %','Доля в МСП России, %','Работников на субъект']){const th=node('th',t);th.scope='col';head.append(th)}
   for(const r of visible){const tr=body.insertRow();for(const v of [r.name,...[r.total,r.legal,r.individual,r.workers,r.ipShare,r.nationalShare,r.workersPerEntity].map(fmt)])tr.insertCell().textContent=v}
   tableHost.replaceChildren(node('p','Показано '+visible.length+' из '+rows.length+' строк; сортировка: '+label[field]+'. Итог РФ: '+fmt(data.national.total)+' · сумма региональных строк: '+fmt(data.regional_sum.total)+'.'),table);
   selectionExport.disabled=!visible.length;selectionExport.onclick=()=>exportRows(visible,'sme-selection-'+data.period+'.csv');
  }
  function exportRows(items,name){csv(name,[['Дата','Код ФНС','Регион','Всего','ЮЛ','ИП','Работники','Доля ИП, %','Доля в МСП РФ, %','Работников на субъект','Итог МСП РФ (знаменатель)','Контур ISO (однозначное соответствие)','Источник','SHA-256'],...items.map(r=>[data.period,r.code,r.name,r.total,r.legal,r.individual,r.workers,r.ipShare,r.nationalShare,r.workersPerEntity,data.national.total,matched.has(SMEMap.key(r.code))?SMEMap.key(r.code):'',data.documentation,data.sha256])])}
  exp.disabled=false;exp.onclick=()=>exportRows(rows,'sme-regions-'+data.period+'.csv');
  query.oninput=scope.onchange=renderTable;
  function draw(){
   host.replaceChildren();detail.textContent='Выберите регион на карте.';
   const features=geo.features.map(f=>({code:f.properties?.iso_3166_2,name:f.properties?.name,rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
   let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const f of features)for(const ring of f.rings)for(const [x,y] of ring){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
   if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax)throw Error('Нет геометрии');
   const w=1180,h=650,scale=Math.min(1080/(xmax-xmin),470/(ymax-ymin)),x=v=>50+(1080-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>75+(470-scale*(ymax-ymin))/2+(v-ymin)*scale,ns='http://www.w3.org/2000/svg';
   const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Распределение зарегистрированных МСП');
   function shape(tag,attrs,t,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;parent.append(e);return e}
   const txt=(xx,yy,t,size=14)=>shape('text',{x:xx,y:yy,'font-size':size,fill:'#173e52'},t);
   const key=metric.value,thresholds=RegionalMap.classes([...matched.values()].map(r=>r[key])),colors=['#e3f1ea','#b6dacb','#75b7a7','#388c83','#075953'];
   shape('rect',{width:w,height:h,fill:'#fff'});txt(25,32,label[key]+' · '+data.period,22);txt(25,55,'ФНС: агрегаты реестра, не число производственных площадок.',14);
   for(const f of features){const r=matched.get(f.code),d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' '),p=shape('path',{d,fill:r&&Number.isFinite(r[key])?colors[Math.max(0,Math.min(colors.length-1,RegionalMap.bin(r[key],thresholds)))]: '#e1e4e1',stroke:'#52696e','stroke-width':.85,'fill-rule':'evenodd'});shape('title',{},r?r.name+' · '+fmt(r[key]):RegionalMap.displayName(f.code,f.name)+' · нет соответствия',p);if(r){p.setAttribute('role','button');p.setAttribute('tabindex','0');p.setAttribute('aria-label',r.name+' · '+fmt(r[key]));const show=()=>detail.textContent=r.name+' · '+label[key]+': '+fmt(r[key])+' · МСП: '+fmt(r.total)+' · доля ИП: '+fmt(r.ipShare)+'% · доля в МСП РФ: '+fmt(r.nationalShare)+'% · учтённых работников на субъект: '+fmt(r.workersPerEntity)+' · '+data.period;p.onclick=show;p.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show()}}}}
   if(thresholds.length===1){shape('rect',{x:25,y:565,width:20,height:15,fill:colors[0]});txt(52,578,fmt(thresholds[0]))}
   else thresholds.slice(1).forEach((v,i)=>{shape('rect',{x:25+i*220,y:565,width:20,height:15,fill:colors[i]});txt(52+i*220,578,fmt(thresholds[i])+'–'+fmt(v),12)});
   txt(25,610,'Серый — нет однозначного соответствия. Интервалы — квантили доступных регионов.',13);txt(25,630,'Источник: ФНС · границы Natural Earth / PiSpace Maps',13);
   const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap)
  }
  metric.onchange=()=>{draw();renderTable()};form.onsubmit=e=>e.preventDefault();draw();renderTable()
 }catch(e){status.textContent='Срез МСП недоступен: '+e.message}
});

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('sme-compare-form');if(!form)return;
 const status=$('sme-compare-status'),select=$('sme-compare-regions'),add=$('sme-compare-add'),metric=$('sme-compare-metric'),chosen=$('sme-compare-selected'),out=$('sme-compare-table'),chart=$('sme-compare-chart'),exp=$('sme-compare-export'),link=$('sme-compare-link');
 const labels={total:'Всего МСП',legal:'Юридические лица МСП',individual:'ИП',workers:'Учтённые работники',ipShare:'Доля ИП, %',nationalShare:'Доля в числе МСП РФ, %',workersPerEntity:'Учтённых работников на субъект МСП',legalShare:'Доля ЮЛ среди МСП, %',legalNationalShare:'Доля в числе ЮЛ МСП РФ, %'};
 const fmt=n=>Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:2}):'—';
 let ids=[];
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(m,'sme-regions.json',root),d=entry.data;
  if(!d.rows.length){status.textContent='Срез ФНС недоступен. '+(d.error||'');return}
  const by=new Map(d.rows.map(r=>[r.code,r]));
  select.replaceChildren(...[...d.rows].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(r=>new Option(r.name+' · '+r.code,r.code)));
  const params=new URLSearchParams(location.search),requested=(params.get('sme-regions')||'').split(',').filter(x=>by.has(x));
  ids=[...new Set(requested)].slice(0,8);
  if(labels[params.get('sme-metric')])metric.value=params.get('sme-metric');
  function draw(){
   chosen.replaceChildren();out.replaceChildren();chart.replaceChildren();exp.disabled=true;link.hidden=true;
   for(const code of ids){const b=node('button',by.get(code).name+' ×');b.type='button';b.className='sme-compare-chip';b.setAttribute('aria-label','Убрать '+by.get(code).name);b.onclick=()=>{ids=ids.filter(x=>x!==code);draw()};chosen.append(b)}
   add.disabled=ids.length>=8||ids.includes(select.value);
   const base='Срез '+d.period+' · '+d.rows.length+' территорий ФНС · '+(d.status==='cached'?'сохранённая редакция':'проверенный срез')+'. ';
   if(ids.length<2){status.textContent=base+'Добавьте от 2 до 8 регионов.';return}
   const k=metric.value,result=SMEMap.regionalComparison(d,ids,k);
   status.textContent=base+'Выбрано '+ids.length+'. Места среди '+result.eligible+' территорий с числовым значением.';
   const table=node('table',''),h=table.createTHead().insertRow(),body=table.createTBody();
   for(const name of ['Регион','Место: '+labels[k],'Всего МСП','ЮЛ','ИП','Учтённые работники','Доля ЮЛ, %','Доля в ЮЛ МСП РФ, %','Работников на субъект']){const th=node('th',name);th.scope='col';h.append(th)}
   for(const r of result.rows){const tr=body.insertRow();for(const v of [r.name,r.place??'—',...['total','legal','individual','workers','legalShare','legalNationalShare','workersPerEntity'].map(x=>fmt(r[x]))])tr.insertCell().textContent=v}
   out.append(table);
   chart.append(node('h3',labels[k]),node('p','Полоса относительно максимума выбранных регионов. Ноль отличается от пропуска.'));
   const bars=node('div','');bars.className='rm-composition';
   for(const r of result.rows){const line=node('div','');line.className='rm-composition-row';const track=node('div','');track.className='rm-composition-track';const fill=node('div','');fill.className='rm-composition-fill';fill.style.width=(r.width??0)+'%';track.append(fill);line.append(node('span',r.name),track,node('strong',fmt(r.value)));bars.append(line)}chart.append(bars);
   exp.disabled=false;exp.onclick=()=>csv('sme-regional-comparison-'+d.period+'.csv',[['Дата','Код ФНС','Регион','Всего МСП','ЮЛ','ИП','Работники','Доля ЮЛ, %','Доля в ЮЛ МСП РФ, %','Работников на субъект','Критерий','Значение критерия','Место','Охват ранга','Всего МСП РФ','ЮЛ МСП РФ','Источник','SHA-256 источника','SHA-256 JSON','Отпечаток манифеста'],...result.rows.map(r=>[d.period,r.code,r.name,r.total,r.legal,r.individual,r.workers,r.legalShare,r.legalNationalShare,r.workersPerEntity,k,r.value,r.place,result.eligible,d.national.total,d.national.legal,d.documentation,d.sha256,entry.sha256,m.data_fingerprint])]);
   const url=new URL(location.href);url.searchParams.set('sme-regions',ids.join(','));url.searchParams.set('sme-metric',k);url.hash='sme-compare';link.href=url.href;link.hidden=false;
  }
  form.onsubmit=e=>{e.preventDefault();if(ids.length<8&&!ids.includes(select.value))ids.push(select.value);draw()};
  select.onchange=()=>{add.disabled=ids.length>=8||ids.includes(select.value)};metric.onchange=draw;draw();
 }catch(e){status.textContent='Сравнение недоступно: '+String(e.message||e)}
});
