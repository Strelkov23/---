/* All ratios are computed from the same edition, same year and exact territorial keys. */
const ManufacturingAtlas=(()=>{
 const identity=r=>JSON.stringify([r.region,r.level,r.okato,r.oktmo,r.year,r.edition,r.version]);
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 function unique(rows){return rows.length===1?rows[0]:null}
 function quotient(a,b){return finite(a)&&finite(b)&&b>0?a/b:null}
 function share(a,b){const q=quotient(a,b);return q===null||q>1+1e-10?null:100*q}
 const sections={B:{title:'Добыча полезных ископаемых',total:'mining_total'},C:{title:'Обрабатывающие производства',total:'total'},D:{title:'Электроэнергия, газ и пар',total:'energy_total'}};
 function sectionOf(data,group){return data.groups?.find(g=>g.id===group)?.section||'C'}
 function calculate(data,group,year,sample){
  const section=sections[sectionOf(data,group)];if(!section)throw Error('Неизвестный раздел ОКВЭД2');
  const totalGroup=section.total;
  const rows=data.rows.filter(r=>r.year===year),nat=unique(rows.filter(r=>r.level==='Страна'&&r.region==='Российская Федерация'&&r.group===group)),natTotal=unique(rows.filter(r=>r.level==='Страна'&&r.region==='Российская Федерация'&&r.group===totalGroup));
  const common=nat&&natTotal&&identity(nat)===identity(natTotal),nationalShare=common?share(nat.value,natTotal.value):null;
  const regional=rows.filter(r=>r.level==='Регион'),totalBy=new Map();
  for(const r of regional.filter(r=>r.group===totalGroup)){const id=identity(r),a=totalBy.get(id)||[];a.push(r);totalBy.set(id,a)}
  // Sample uses explicit canonical aliases, excludes overlapping/inclusive regions
  // and rejects duplicate territorial keys even if numeric observations match.
  const candidates=regional.filter(r=>r.group===group);
  const checked=sample(candidates.map(r=>({...r,value:0})));
  const rawBy=new Map(candidates.map(r=>[r.row,r]));
  const result=new Map();
  for(const [key,entry] of checked.out){
   const r=rawBy.get(entry.row),total=unique(totalBy.get(identity(r))||[]);
   const regionalShare=total?share(r.value,total.value):null;
   const editionOK=common&&r.edition===nat.edition&&r.version===nat.version;
   const localization=editionOK&&nationalShare!==null?quotient(regionalShare,nationalShare):null;
   const countryShare=editionOK?share(r.value,nat.value):null;
   result.set(key,{...r,total:total?.value??null,totalRow:total?.row??null,share:regionalShare,localization,countryShare,national:nat?.value??null,nationalTotal:natTotal?.value??null,nationalShare,nationalRow:nat?.row??null,nationalTotalRow:natTotal?.row??null})
  }
  return {rows:result,national:nat?.value??null,nationalTotal:natTotal?.value??null,nationalShare,excluded:checked.excluded,ambiguous:checked.ambiguous}
 }
 // Compare only identical source territories, group and archive version.
 // Different statistical editions are expected for different observed years.
 function changeBetween(a,b){
  if(!a||!b||a.year>=b.year||a.group!==b.group||a.region!==b.region||a.level!==b.level||a.okato!==b.okato||a.oktmo!==b.oktmo||a.version!==b.version)return null;
  return {from:a.year,to:b.year,valueDelta:finite(a.value)&&finite(b.value)?b.value-a.value:null,nominalChange:finite(a.value)&&a.value>0&&finite(b.value)?100*(b.value/a.value-1):null,shareDelta:finite(a.share)&&finite(b.share)?b.share-a.share:null,localizationDelta:finite(a.localization)&&finite(b.localization)?b.localization-a.localization:null}
 }
 function regionalChanges(data,group,start,end,territories,sample){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start>=end)return [];
  const a=calculate(data,group,start,sample),b=calculate(data,group,end,sample);
  return territories.map(t=>{
   const first=a.rows.get(t.key)||null,last=b.rows.get(t.key)||null,delta=changeBetween(first,last);
   return {...t,first,last,delta,status:!first||!last?'Нет пары наблюдений':!delta?'Несопоставимые территориальные коды или версии':'Пара проверена'};
  });
 }
 function orderChanges(rows,metric,direction='desc',query='',knownOnly=false){
  const q=String(query).trim().toLocaleLowerCase('ru'),sign=direction==='asc'?1:-1;
  return rows.filter(r=>(!knownOnly||Number.isFinite(r.delta?.[metric]))&&(!q||[r.name,r.code,r.key].some(v=>String(v||'').toLocaleLowerCase('ru').includes(q)))).sort((a,b)=>{
   const x=a.delta?.[metric],y=b.delta?.[metric],ax=Number.isFinite(x),by=Number.isFinite(y);
   if(ax!==by)return ax?-1:1;
   return ax&&x!==y?sign*(x-y):a.name.localeCompare(b.name,'ru');
  });
 }
 // HHI is meaningful only for complete, mutually exclusive groups in one section.
 // Allow up to 0.5% difference from the published total for rounding / small residuals.
 function concentration(total,parts,expected){
  const empty={hhi:null,effective:null,topShare:null,top:null,coverage:null,known:0,expected,parts:[],reason:'Нет положительного итога'};
  if(!total||!finite(total.value)||total.value<=0)return empty;
  const valid=parts.filter(p=>p.observation&&identity(p.observation)===identity(total)&&finite(p.observation.value));
  const sum=valid.reduce((s,p)=>s+p.observation.value,0),coverage=100*sum/total.value;
  const result={...empty,coverage,known:valid.length,reason:'Неполный состав групп'};
  if(!expected||parts.length!==expected||valid.length!==expected||new Set(valid.map(p=>p.group)).size!==expected)return result;
  if(sum<=0||Math.abs(coverage-100)>.5+1e-9)return {...result,reason:'Сумма групп не совпадает с опубликованным итогом (допуск 0,5%)'};
  const ordered=valid.map(p=>({...p,shareOfSum:100*p.observation.value/sum})).sort((a,b)=>b.shareOfSum-a.shareOfSum||a.title.localeCompare(b.title,'ru'));
  const hhi=ordered.reduce((s,p)=>s+(p.shareOfSum/100)**2,0);
  return {...result,hhi,effective:1/hhi,topShare:ordered[0].shareOfSum,top:ordered[0].title,parts:ordered,reason:'Полный сопоставимый состав'};
 }
 function concentrationRows(data,section,year,territories,sample){
  const sectionTotal=sections[section]?.total;
  if(!sectionTotal)return [];
  const groups=(data.groups||[]).filter(g=>g.section===section&&g.id!==sectionTotal),expected={B:5,C:13,D:3}[section];
  const total=calculate(data,sectionTotal,year,sample).rows;
  const by=groups.map(g=>({g,rows:calculate(data,g.id,year,sample).rows}));
  return territories.map(t=>{
   const base=total.get(t.key)||null,parts=by.map(({g,rows})=>({group:g.id,title:g.title||g.id,okved:g.okved,observation:rows.get(t.key)||null}));
   return {...t,total:base,sourceParts:parts,...concentration(base,parts,expected)};
  });
 }
 function structuralShift(a,b){
  const empty={distance:null,hhiDelta:null,parts:[],reason:'Нет двух полных структур'};
  if(!Number.isFinite(a?.hhi)||!Number.isFinite(b?.hhi)||!changeBetween(a.total,b.total)||a.expected!==b.expected||a.parts.length!==b.parts.length)return empty;
  const by=new Map(b.parts.map(p=>[p.group,p]));
  if(by.size!==a.parts.length||a.parts.some(p=>!by.has(p.group)||p.okved!==by.get(p.group).okved||!changeBetween(p.observation,by.get(p.group).observation)))return {...empty,reason:'Не совпадает состав или охват групп'};
  const parts=a.parts.map(p=>{const q=by.get(p.group);return {group:p.group,title:p.title,okved:p.okved,first:p,last:q,delta:q.shareOfSum-p.shareOfSum}}).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)||x.group.localeCompare(y.group));
  const distance=Math.min(100,parts.reduce((s,p)=>s+Math.abs(p.delta),0)/2);
  return {distance,hhiDelta:b.hhi-a.hhi,parts,reason:'Две полные сопоставимые структуры'};
 }
 function structuralRows(data,section,start,end,territories,sample){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start>=end)return [];
  const a=concentrationRows(data,section,start,territories,sample),b=concentrationRows(data,section,end,territories,sample);
  return territories.map((t,i)=>({...t,first:a[i],last:b[i],...structuralShift(a[i],b[i])}));
 }
 function localizationBin(v){return !finite(v)?-1:v<.5?0:v<1?1:v<1.5?2:v<2?3:4}
 function regionalProfile(data,key,year,sample){
  return (data.groups||[]).map(g=>{
   const result=calculate(data,g.id,year,sample),observation=result.rows.get(key);
   return {group:g.id,section:g.section,title:g.title,okved:g.okved,isTotal:g.id===sections[g.section]?.total,observation:observation||null};
  });
 }
 function profileFilter(rows,section='',mode='all'){
  return rows.filter(r=>(!section||r.section===section)&&(mode==='specialized'? !r.isTotal&&Number.isFinite(r.observation?.localization)&&r.observation.localization>1:mode==='missing'?!Number.isFinite(r.observation?.localization):true));
 }
 return {calculate,identity,share,quotient,localizationBin,sections,sectionOf,changeBetween,regionalProfile,profileFilter,regionalChanges,orderChanges,concentration,concentrationRows,structuralShift,structuralRows}
})();
if(typeof module!=='undefined')module.exports=ManufacturingAtlas;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('rm-form'))return;
 const fields=['rm-section','rm-group','rm-year','rm-metric','rm-region'],ns='http://www.w3.org/2000/svg';
 const number=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const metricLabels={localization:'Коэффициент локализации',share:'Доля в выбранном разделе, %',value:'Отгрузка, млн руб.',countryShare:'Доля в российской отгрузке, %'};
 const fmtMetric=(v,metric)=>number(v)+(Number.isFinite(v)&&['share','countryShare'].includes(metric)?'%':'');
 const link=(t,u)=>{const a=node('a',t);a.href=u;return a};
 const current=(file,params={})=>{const u=new URL(file,location.href);for(const [k,v] of Object.entries(params))if(v!==null&&v!=='')u.searchParams.set(k,v);if(pinned)u.searchParams.set('snapshot',pinned);return u.href};
 const select=$('rm-region'),status=$('rm-status'),source=$('rm-source'),exporter=$('rm-export');
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const manufacturing=await Provenance.get(manifest,'regional-manufacturing.json',root);
  // An older pinned snapshot may contain only manufacturing; a failed additional
  // dataset must be visible, not prevent reading the verified original.
  let extra=null,extraError='';
  try{extra=await Provenance.get(manifest,'regional-mining-energy.json',root)}catch(e){extraError=String(e.message||e)}
  const data=manufacturing.data;
  const groups=[...data.groups.map(g=>({...g,section:'C'})),...(extra?.data.groups||[])];
  const combined={groups,rows:[...data.rows,...(extra?.data.rows||[])]};
  const bySection={C:manufacturing,B:extra,D:extra};
  if(pinned)for(const a of document.querySelectorAll('a[href="regional-manufacturing.json"],a[href="regional-mining-energy.json"]')){const name=a.getAttribute('href');if(manifest.files[name])a.href=root+name;else a.removeAttribute('href')}
  if(pinned)for(const a of document.querySelectorAll('a[href="regional-manufacturing.csv"],a[href="regional-mining-energy.csv"]')){a.removeAttribute('href');a.textContent+=' (используйте расчётную выгрузку этой версии)'};
  source.replaceChildren(link('Архив «Если быть точным» · '+data.license,data.catalog),document.createTextNode(' · '),link('Исходный ZIP',data.source),document.createTextNode(' · '),link('Росстат: статистические издания',data.primary));
  if(extraError)source.append(node('p','Добыча и энергетика недоступны в этой версии: '+extraError));
  for(const [label,entry] of [['Обработка',manufacturing],['Добыча и энергетика',extra]]){
   if(!entry)continue;const d=entry.data;source.append(node('p',label+' · выпуск '+d.release+' · проверка: '+(d.checked||'—')+' · загрузка: '+(d.success||'—')+' · '+d.status));
   if(d.sha256)source.append(node('p',label+' · SHA-256 исходного ZIP: '+d.sha256));
  }
  if(!combined.rows.length){status.textContent='Нет загруженных наблюдений. Отсутствие данных не означает отсутствие производства.';return}
  const geo=(await Provenance.get(manifest,'regional-boundaries.geojson',root)).data;
  const years=[...new Set(combined.rows.map(r=>r.year))].sort((a,b)=>b-a);
  const sectionPick=$('rm-section'),groupPick=$('rm-group');
  const sections=ManufacturingAtlas.sections,availableSections=Object.keys(sections).filter(id=>groups.some(g=>g.section===id)&&combined.rows.some(r=>groups.find(g=>g.id===r.group)?.section===id));
  sectionPick.replaceChildren(...availableSections.map(id=>new Option(id+' · '+sections[id].title,id)));
  const query=new URLSearchParams(location.search),requested=groups.find(g=>g.id===query.get('rm-group'))?.section;
  sectionPick.value=availableSections.includes(requested)?requested:availableSections.includes(query.get('rm-section'))?query.get('rm-section'):availableSections.includes('C')?'C':availableSections[0];
  function setGroups(preferred){
   const gg=groups.filter(g=>g.section===sectionPick.value);groupPick.replaceChildren(...gg.map(g=>new Option(g.title+' · '+g.okved,g.id)));
   groupPick.value=gg.some(g=>g.id===preferred)?preferred:gg.some(g=>g.id==='light')?'light':gg[0]?.id||'';
  }
  setGroups(query.get('rm-group'));

  $('rm-year').replaceChildren(...years.map(y=>new Option(String(y),String(y))));

  const counts=new Map();for(const f of geo.features){const k=(f.properties?.name||'').trim()?RegionalMap.key(f.properties?.iso_3166_2):null;if(k)counts.set(k,(counts.get(k)||0)+1)}
  const features=geo.features.map(f=>({f,key:(f.properties?.name||'').trim()?RegionalMap.key(f.properties?.iso_3166_2):null,code:f.properties?.iso_3166_2||'',name:RegionalMap.displayName(f.properties?.iso_3166_2,f.properties?.name||'Неизвестный контур'),rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  const mapped=features.filter(f=>f.key&&counts.get(f.key)===1).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  select.replaceChildren(new Option('Выберите регион',''),...mapped.map(f=>new Option(f.name,f.code)));
  for(const id of ['rm-section','rm-group','rm-year','rm-region'])$(id).disabled=false;
  restore(['rm-year','rm-metric','rm-region']);
  const deltaTerritories=mapped.map(f=>({key:f.key,code:f.code,name:f.name}));
  for(const [key,name] of [['архангельская область без автономного округа','Архангельская область (без АО)'],['тюменская область без автономных округов','Тюменская область (без АО)']])if(!deltaTerritories.some(t=>t.key===key))deltaTerritories.push({key,name,code:null});
  const startPick=$('rm-delta-start'),endPick=$('rm-delta-end'),deltaMetric=$('rm-delta-metric'),deltaOrder=$('rm-delta-order'),deltaQuery=$('rm-delta-query'),deltaKnown=$('rm-delta-known'),deltaHost=$('rm-delta-table'),deltaChart=$('rm-delta-chart'),deltaStatus=$('rm-delta-status'),deltaExport=$('rm-delta-export');
  const changeLabels={shareDelta:'Изменение доли, п. п.',localizationDelta:'Изменение локализации',nominalChange:'Номинальное изменение отгрузки, %',valueDelta:'Изменение отгрузки, млн руб.'};
  function syncDeltaYears(group){
   const available=[...new Set(combined.rows.filter(r=>r.group===group.id).map(r=>r.year))].sort((a,b)=>a-b);
   const oldA=Number(startPick.value),oldB=Number(endPick.value);
   for(const el of [startPick,endPick])el.replaceChildren(...available.map(y=>new Option(String(y),String(y))));
   startPick.value=available.includes(oldA)?String(oldA):String(available[0]||'');
   endPick.value=available.includes(oldB)?String(oldB):String(available.at(-1)||'');
   startPick.disabled=endPick.disabled=available.length<2;
  }
  function drawDelta(){
   deltaHost.replaceChildren();deltaChart.replaceChildren();deltaExport.disabled=true;
   const group=groups.find(g=>g.id===groupPick.value),start=Number(startPick.value),end=Number(endPick.value),metric=deltaMetric.value;
   if(!group||startPick.disabled||!start||!end||start>=end){deltaStatus.textContent='Выберите два разных года: начальный должен быть раньше конечного.';return}
   const all=ManufacturingAtlas.regionalChanges(combined,group.id,start,end,deltaTerritories,RegionalStats.sample);
   const known=all.filter(r=>Number.isFinite(r.delta?.[metric])),rows=ManufacturingAtlas.orderChanges(all,metric,deltaOrder.value,deltaQuery.value,deltaKnown.checked);
   const pos=known.filter(r=>r.delta[metric]>0).length,neg=known.filter(r=>r.delta[metric]<0).length;
   deltaStatus.textContent=group.title+' · '+start+'–'+end+' · сопоставимый показатель: '+known.length+' из '+all.length+' территорий · рост: '+pos+' · снижение: '+neg+' · без изменения: '+(known.length-pos-neg)+' · в таблице: '+rows.length+'.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Территория','Отгрузка '+start+', млн руб.','Отгрузка '+end+', млн руб.','Доля '+start+', %','Доля '+end+', %','Изменение доли, п. п.','Локализация '+start,'Локализация '+end,'Изменение локализации','Номинальное изменение, %','Разность отгрузки, млн руб.','Статус']){const th=node('th',label);th.scope='col';h.append(th)}
   const signed=v=>Number.isFinite(v)&&v>0?'+'+number(v):number(v);
   for(const r of rows){const a=r.first,b=r.last,d=r.delta,tr=body.insertRow();tr.insertCell().textContent=r.name;
    for(const v of [number(a?.value),number(b?.value),number(a?.share),number(b?.share),signed(d?.shareDelta),number(a?.localization),number(b?.localization),signed(d?.localizationDelta),signed(d?.nominalChange),signed(d?.valueDelta),r.status])tr.insertCell().textContent=v;
   }
   deltaHost.append(t);
   const numeric=rows.filter(r=>Number.isFinite(r.delta?.[metric]));
   const descending=[...numeric].sort((a,b)=>b.delta[metric]-a.delta[metric]);
   const extremes=[...new Set([...descending.filter(r=>r.delta[metric]>0).slice(0,6),...descending.filter(r=>r.delta[metric]<0).slice(-6)])];
   if(extremes.length){
    const w=900,h=75+extremes.length*29,svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('role','img');svg.setAttribute('aria-label',changeLabels[metric]+' — наибольшие положительные и отрицательные изменения');
    shape(svg,'rect',{width:w,height:h,fill:'#fff'});shape(svg,'text',{x:16,y:24,fill:'#203943','font-size':16},changeLabels[metric]+' · крайние изменения в показанной выборке');
    const max=Math.max(...extremes.map(r=>Math.abs(r.delta[metric])),1e-10),zero=560;shape(svg,'line',{x1:zero,x2:zero,y1:37,y2:h-16,stroke:'#52696e'});
    for(const [i,r] of extremes.entries()){const y=44+i*29,v=r.delta[metric],width=Math.abs(v)/max*200;shape(svg,'text',{x:16,y:y+14,fill:'#203943','font-size':12},r.name);shape(svg,'rect',{x:v<0?zero-width:zero,y,width,height:18,fill:v<0?'#b26c43':'#327b97'});shape(svg,'text',{x:785,y:y+14,fill:'#203943','font-size':12},signed(v))}
    deltaChart.append(svg);
   }else deltaChart.append(node('p','Нет ненулевых сопоставимых изменений в показанной выборке.'));
   const src=bySection[group.section];
   deltaExport.disabled=!rows.length;deltaExport.onclick=()=>csv('regional-structure-all-'+group.id+'-'+start+'-'+end+'.csv',[
    ['Раздел','Группа','ОКВЭД2','Территория','ISO','Начало','Конец','Отгрузка начало','Отгрузка конец','Итог раздела начало','Итог раздела конец','Доля начало','Доля конец','Локализация начало','Локализация конец','Отгрузка РФ начало','Отгрузка РФ конец','Итог РФ начало','Итог РФ конец','Изменение отгрузки, млн руб.','Номинальное изменение, %','Изменение доли, п. п.','Изменение локализации','Статус','ОКАТО начало','ОКАТО конец','ОКТМО начало','ОКТМО конец','Издание начало','Издание конец','Лист начало','Лист конец','Строка начало','Строка конец','Строка итога начало','Строка итога конец','Строка РФ начало','Строка РФ конец','Строка итога РФ начало','Строка итога РФ конец','Источник','SHA-256 ZIP','SHA-256 JSON','Отпечаток манифеста'],...rows.map(r=>{const a=r.first,b=r.last,d=r.delta;return [group.section,group.title,group.okved,r.name,r.code,start,end,a?.value,b?.value,a?.total,b?.total,a?.share,b?.share,a?.localization,b?.localization,a?.national,b?.national,a?.nationalTotal,b?.nationalTotal,d?.valueDelta,d?.nominalChange,d?.shareDelta,d?.localizationDelta,r.status,a?.okato,b?.okato,a?.oktmo,b?.oktmo,a?.edition,b?.edition,a?.sheet,b?.sheet,a?.row,b?.row,a?.totalRow,b?.totalRow,a?.nationalRow,b?.nationalRow,a?.nationalTotalRow,b?.nationalTotalRow,src?.data.source,src?.data.sha256,src?.sha256,manifest.data_fingerprint]})]);
  }
  for(const el of [startPick,endPick,deltaMetric,deltaOrder,deltaKnown])el.onchange=drawDelta;deltaQuery.oninput=drawDelta;
  const concRegion=$('rm-conc-region'),concMetric=$('rm-conc-metric'),concStatus=$('rm-conc-status'),concTable=$('rm-conc-table'),concChart=$('rm-conc-chart'),concExport=$('rm-conc-export');
  const concOptions=deltaTerritories.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  const concId=t=>t.code||t.key;
  concRegion.replaceChildren(new Option('Выберите регион',''),...concOptions.map(t=>new Option(t.name,concId(t))));
  function drawConcentration(){
   const section=sectionPick.value,year=Number($('rm-year').value);
   const rows=ManufacturingAtlas.concentrationRows(combined,section,year,concOptions,RegionalStats.sample),metric=concMetric.value;
   const known=rows.filter(r=>Number.isFinite(r.hhi)),sorted=[...rows].sort((a,b)=>{
    const av=Number.isFinite(a[metric]),bv=Number.isFinite(b[metric]);return av!==bv?(av?-1:1):av?b[metric]-a[metric]||a.name.localeCompare(b.name,'ru'):a.name.localeCompare(b.name,'ru');
   });
   concStatus.textContent='Раздел '+section+' · '+year+' · полных сопоставимых структур: '+known.length+' из '+rows.length+' территорий. Пропуски и несходящиеся итоги исключены из расчёта.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Регион','HHI (0–1)','Эффективное число групп','Крупнейшая группа','Её доля, %','Охват групп / итог, %','Статус']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of sorted){const tr=body.insertRow(),button=node('button',r.name);button.type='button';button.className='rm-region-link';button.onclick=()=>{concRegion.value=concId(r);drawConcentration();concChart.scrollIntoView({block:'nearest'})};tr.insertCell().append(button);
    for(const v of [number(r.hhi),number(r.effective),r.top||'—',number(r.topShare),number(r.coverage)+' · '+r.known+'/'+r.expected,r.reason])tr.insertCell().textContent=v;
   }
   concTable.replaceChildren(t);concChart.replaceChildren();
   const chosen=rows.find(r=>concId(r)===concRegion.value);
   if(!chosen)concChart.append(node('p','Выберите регион для диаграммы структуры.'));
   else if(!Number.isFinite(chosen.hhi))concChart.append(node('h3',chosen.name+' · '+year),node('p',chosen.reason+'. Числовых групп: '+chosen.known+'/'+chosen.expected+'.'));
   else{
    concChart.append(node('h3',chosen.name+' · '+year),node('p','Распределение отгрузки по '+chosen.expected+' группам раздела '+section+'. HHI: '+number(chosen.hhi)+' · эффективное число групп: '+number(chosen.effective)+'.'));
    const chart=node('div','');chart.className='rm-composition';
    for(const x of chosen.parts){const line=node('div','');line.className='rm-composition-row';const bar=node('div','');bar.className='rm-composition-track';const fill=node('div','');fill.className='rm-composition-fill';fill.style.width=x.shareOfSum+'%';bar.append(fill);line.append(node('span',x.title+' · '+x.okved),bar,node('strong',number(x.shareOfSum)+'%'));chart.append(line)}
    concChart.append(chart);
   }
   const src=bySection[section];
   concExport.disabled=!rows.length;
   concExport.onclick=()=>csv('regional-concentration-'+section+'-'+year+'.csv',[['Год','Раздел','Территория','ISO','Итог раздела, млн руб.','HHI','Эффективное число групп','Крупнейшая группа','Доля крупнейшей, %','Сумма групп / итог, %','Числовых групп','Всего групп','Статус','Группа','ОКВЭД2','Отгрузка группы, млн руб.','Доля в сумме групп, %','ОКАТО','ОКТМО','Издание','Лист','Строка группы','Строка итога','Источник','SHA-256 ZIP','SHA-256 JSON','Отпечаток манифеста'],...sorted.flatMap(r=>r.sourceParts.map(p=>[year,section,r.name,r.code,r.total?.value,r.hhi,r.effective,r.top,r.topShare,r.coverage,r.known,r.expected,r.reason,p.title,p.okved,p.observation?.value,r.parts.find(x=>x.group===p.group)?.shareOfSum,p.observation?.okato,p.observation?.oktmo,p.observation?.edition,p.observation?.sheet,p.observation?.row,r.total?.row,src?.data.source,src?.data.sha256,src?.sha256,manifest.data_fingerprint]))]);
  }
  concRegion.onchange=concMetric.onchange=drawConcentration;
  const shiftStart=$('rm-shift-start'),shiftEnd=$('rm-shift-end'),shiftRegion=$('rm-shift-region'),shiftStatus=$('rm-shift-status'),shiftTable=$('rm-shift-table'),shiftChart=$('rm-shift-chart'),shiftExport=$('rm-shift-export');
  shiftRegion.replaceChildren(new Option('Выберите регион',''),...concOptions.map(t=>new Option(t.name,concId(t))));
  let shiftCache=null;
  function syncShift(){
   const section=sectionPick.value,available=[...new Set(combined.rows.filter(r=>r.group===sections[section].total).map(r=>r.year))].sort((a,b)=>a-b),a=Number(shiftStart.value),b=Number(shiftEnd.value);
   for(const el of [shiftStart,shiftEnd])el.replaceChildren(...available.map(y=>new Option(String(y),String(y))));
   shiftStart.value=String(available.includes(a)?a:available[0]||'');shiftEnd.value=String(available.includes(b)?b:available.at(-1)||'');
   shiftStart.disabled=shiftEnd.disabled=available.length<2;drawShift();
  }
  function drawShift(){
   shiftTable.replaceChildren();shiftChart.replaceChildren();shiftExport.disabled=true;
   const section=sectionPick.value,start=Number(shiftStart.value),end=Number(shiftEnd.value),key=[section,start,end].join(':');
   if(!start||!end||start>=end){shiftStatus.textContent='Выберите два разных доступных года.';return}
   if(shiftCache?.key!==key)shiftCache={key,rows:ManufacturingAtlas.structuralRows(combined,section,start,end,concOptions,RegionalStats.sample)};
   const rows=shiftCache.rows,known=rows.filter(r=>Number.isFinite(r.distance)),ordered=[...rows].sort((a,b)=>(b.distance??-1)-(a.distance??-1)||a.name.localeCompare(b.name,'ru')),signed=v=>Number.isFinite(v)&&v>0?'+'+number(v):number(v);
   shiftStatus.textContent='Раздел '+section+' · '+start+'–'+end+' · полные сопоставимые структуры '+known.length+' / '+rows.length+'. Индекс — половина суммы абсолютных изменений нормированных долей; 0–100 п. п.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Регион','Структурный сдвиг, п. п.','HHI начало','HHI конец','Δ HHI','Наибольшее изменение доли','Статус']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of ordered){const tr=body.insertRow(),btn=node('button',r.name);btn.type='button';btn.className='rm-region-link';btn.onclick=()=>{shiftRegion.value=concId(r);drawShift();shiftChart.scrollIntoView({block:'nearest'})};tr.insertCell().append(btn);for(const v of [number(r.distance),number(r.first?.hhi),number(r.last?.hhi),signed(r.hhiDelta),r.parts.length?r.parts[0].title+' '+signed(r.parts[0].delta)+' п. п.':'—',r.reason])tr.insertCell().textContent=v}
   shiftTable.append(t);
   const chosen=rows.find(r=>concId(r)===shiftRegion.value);
   if(chosen){
    shiftChart.append(node('h3',chosen.name+' · '+start+'–'+end),node('p',chosen.reason+'. Индекс сдвига: '+number(chosen.distance)+' п. п.'));
    if(chosen.parts.length){const bars=node('div','');bars.className='stress-signed-bars';const max=Math.max(1e-12,...chosen.parts.map(p=>Math.abs(p.delta)));
     for(const p of chosen.parts){const line=node('div','');line.className='stress-signed-row';const track=node('div','');track.className='stress-signed-track';const bar=node('div','');bar.className='stress-signed-fill';bar.dataset.sign=p.delta<0?'negative':'positive';bar.style.width=50*Math.abs(p.delta)/max+'%';track.append(bar);line.append(node('span',p.title),track,node('strong',signed(p.delta)+' п. п.'));bars.append(line)}
     shiftChart.append(node('p','Изменение долей нормированной структуры отгрузки. Цвет означает направление, не эффективность.'),bars);
    }
   }else shiftChart.append(node('p','Выберите регион для сравнения состава.'));
   const src=bySection[section];shiftExport.disabled=!rows.length;
   shiftExport.onclick=()=>csv('regional-structural-shift-'+section+'-'+start+'-'+end+'.csv',[['Раздел','Начало','Конец','Регион','ISO','Индекс сдвига, п. п.','HHI начало','HHI конец','Δ HHI','Охват начало, %','Охват конец, %','Статус','Группа','ОКВЭД2','Доля начало, %','Доля конец, %','Δ доли, п. п.','Отгрузка начало, млн руб.','Отгрузка конец, млн руб.','Строка начало','Строка конец','Итог начало','Итог конец','Источник','SHA-256 ZIP','SHA-256 JSON','Отпечаток манифеста'],...ordered.flatMap(r=>(r.parts.length?r.parts:[{}]).map(p=>[section,start,end,r.name,r.code,r.distance,r.first?.hhi,r.last?.hhi,r.hhiDelta,r.first?.coverage,r.last?.coverage,r.reason,p.title,p.okved,p.first?.shareOfSum,p.last?.shareOfSum,p.delta,p.first?.observation?.value,p.last?.observation?.value,p.first?.observation?.row,p.last?.observation?.row,r.first?.total?.row,r.last?.total?.row,src?.data.source,src?.data.sha256,src?.sha256,manifest.data_fingerprint]))]);
  }
  shiftStart.onchange=shiftEnd.onchange=shiftRegion.onchange=drawShift;
  const shape=(svg,tag,attrs,label)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(label!==undefined)e.textContent=label;svg.append(e);return e};
  function renderMap(items,metric,group){
   const host=$('rm-map');host.replaceChildren();
   const coords=features.flatMap(f=>f.rings.flat());if(!coords.length)return;
   let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;for(const [a,b] of coords){xmin=Math.min(xmin,a);xmax=Math.max(xmax,a);ymin=Math.min(ymin,b);ymax=Math.max(ymax,b)}
   if(xmax<=xmin||ymax<=ymin)return;
   const w=1120,h=620,scale=Math.min(1040/(xmax-xmin),530/(ymax-ymin));
   const x=v=>40+(1040-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>45+(530-scale*(ymax-ymin))/2+(v-ymin)*scale;
   const svg=document.createElementNS(ns,'svg');for(const [k,v] of Object.entries({viewBox:'0 0 '+w+' '+h,width:w,height:h,role:'img','aria-label':group.title+' — '+metricLabels[metric]}))svg.setAttribute(k,v);
   shape(svg,'rect',{width:w,height:h,fill:'#fff'});const by=new Map(items.map(r=>[r.key,r]));
   const thresholds=RegionalMap.classes(items.map(r=>r[metric]));
   const theme=group.section==='B'?'mining':group.section==='D'?'energy':RegionalMap.theme('MFG_'+group.id+'_atlas','',group.title);
   const palette=metric==='localization'?['#b74e42','#f0b5a0','#dce8e2','#6eae9b','#176c60']:RegionalMap.palette(theme);
   for(const f of features){
    const row=counts.get(f.key)===1?by.get(f.key):null,v=row?.[metric],bin=metric==='localization'?ManufacturingAtlas.localizationBin(v):RegionalMap.bin(v,thresholds);
    const d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');
    if(!d)continue;
    const p=shape(svg,'path',{d,fill:bin<0?'#deded9':palette[Math.min(bin,palette.length-1)],stroke:select.value===f.code?'#101e26':'#52696e','stroke-width':select.value===f.code?2.5:.7,'fill-rule':'evenodd','data-region':f.code||'',role:'button',tabindex:f.key&&counts.get(f.key)===1?0:-1,'aria-label':f.name+': '+fmtMetric(v,metric)});
    shape(p,'title',{},f.name+' · '+fmtMetric(v,metric));
    if(f.key&&counts.get(f.key)===1){const choose=()=>{select.value=f.code;draw()};p.addEventListener('click',choose);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})}
   }
   const scroll=node('div','');scroll.className='regional-figure-scroll';scroll.append(svg);host.append(scroll);
   const legend=node('div','');legend.className='legend';
   const bins=metric==='localization'?['Менее 0,5','0,5–<1','1–<1,5','1,5–<2','2 и более']:thresholds.length===1?[number(thresholds[0])]:thresholds.slice(1).map((t,i)=>(i?' > ':'')+number(thresholds[i])+' — '+number(t));
   for(const [i,label] of [...bins,'Нет данных'].entries()){const span=node('span','');const sw=node('b','');sw.style.cssText='display:inline-block;width:1rem;height:1rem;border:1px solid #52696e;background:'+(i===bins.length?'#deded9':palette[i]);span.append(sw,document.createTextNode(' '+label));legend.append(span)}
   host.append(legend);
  }
  function draw(){
   const group=groups.find(g=>g.id===$('rm-group').value),year=Number($('rm-year').value),metric=$('rm-metric').value;
   if(!group||!years.includes(year))return;
   const selected=bySection[group.section],section=sections[group.section],result=ManufacturingAtlas.calculate(combined,group.id,year,RegionalStats.sample),items=mapped.map(f=>({key:f.key,code:f.code,name:f.name,...result.rows.get(f.key)}));
   const known=items.filter(r=>Number.isFinite(r[metric])).sort((a,b)=>b[metric]-a[metric]||a.name.localeCompare(b.name,'ru'));
   status.textContent='Отрасль: '+group.title+' · раздел '+group.section+' · '+year+' · сопоставлено '+known.length+' из '+mapped.length+' однозначных контуров; геометрия справочная';
   $('rm-legend-text').textContent=metric==='localization'?'Фиксированная шкала: менее 1 — доля ниже российской; выше 1 — выше. Не оценка эффективности.':'Цветовая шкала по распределению фактически доступных значений; между годами интервалы могут меняться.';
   const metrics=$('rm-metrics');metrics.replaceChildren();
   for(const [label,v] of [['Отгрузка по России, млн руб.',number(result.national)],['Доля в разделе '+group.section+' РФ',fmtMetric(result.nationalShare,'share')],['Контуры с данными',known.length+' / '+mapped.length],['Исключено строк / неоднозначных ключей',result.excluded+' / '+result.ambiguous]]){const card=node('div','');card.className='metric';card.append(node('b',String(v)),node('span',label));metrics.append(card)}
   renderMap(items,metric,group);
   const detail=$('rm-detail');detail.replaceChildren();
   const chosen=mapped.find(f=>f.code===select.value);
   if(chosen){
    detail.append(node('h3',chosen.name+' · '+year),node('p','Разные группы показаны отдельно; доли рассчитаны от итога раздела '+group.section+' ('+section.title+'). Итоги не складываются с подразделами.'));
    const table=node('table',''),head=table.createTHead().insertRow();for(const h of ['Группа','Отгрузка, млн руб.','Доля, %','Локализация'])head.append(node('th',h));
    const body=table.createTBody();for(const g of groups.filter(g=>g.section===group.section)){const r=ManufacturingAtlas.calculate(combined,g.id,year,RegionalStats.sample).rows.get(chosen.key);const tr=body.insertRow();const button=node('button',g.title);button.type='button';button.onclick=()=>{$('rm-group').value=g.id;draw()};tr.insertCell().append(button);for(const v of [r?.value,r?.share,r?.localization])tr.insertCell().textContent=number(v)}
    const scroll=node('div','');scroll.className='table-scroll';scroll.append(table);detail.append(scroll,link('Открыть экономическую карту региона',current('economic-map.html',{'geo-region':chosen.code,'geo-year':year})));
    const sectionYears=years.filter(y=>combined.rows.some(r=>r.year===y&&groups.find(g=>g.id===r.group)?.section===group.section)).sort((a,b)=>a-b);
    if(sectionYears.length>=2){
     const start=sectionYears[0],end=sectionYears.at(-1),t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
     const comparisonRows=[];
     for(const label of ['Группа','Отгрузка '+start+', млн руб.','Отгрузка '+end+', млн руб.','Изменение в текущих ценах, %','Изменение доли, п. п.','Изменение локализации'])h.append(node('th',label));
     for(const g of groups.filter(g=>g.section===group.section)){
      const a=ManufacturingAtlas.calculate(combined,g.id,start,RegionalStats.sample).rows.get(chosen.key),b=ManufacturingAtlas.calculate(combined,g.id,end,RegionalStats.sample).rows.get(chosen.key),change=ManufacturingAtlas.changeBetween(a,b);
      const tr=body.insertRow();tr.insertCell().textContent=g.title;
      for(const v of [a?.value,b?.value,change?.nominalChange,change?.shareDelta,change?.localizationDelta])tr.insertCell().textContent=number(v);
      comparisonRows.push([chosen.name,chosen.code,g.section,g.id,g.title,g.okved,start,end,a?.region,b?.region,a?.okato,b?.okato,a?.oktmo,b?.oktmo,a?.value,b?.value,a?.total,b?.total,a?.share,b?.share,a?.localization,b?.localization,a?.national,b?.national,a?.nationalTotal,b?.nationalTotal,change?.valueDelta,change?.nominalChange,change?.shareDelta,change?.localizationDelta,a?.edition,b?.edition,a?.sheet,b?.sheet,a?.row,b?.row,a?.totalRow,b?.totalRow,a?.nationalRow,b?.nationalRow,a?.nationalTotalRow,b?.nationalTotalRow,a?.raw_value,b?.raw_value,selected.data.source,selected.data.sha256,selected.sha256,manifest.data_fingerprint]);
     }
     const wrap=node('div','');wrap.className='table-scroll';wrap.append(t);wrap.id='rm-change-table';
     detail.append(node('h3','Изменение структуры: '+start+'–'+end+' гг.'),node('p','Это два отдельных наблюдения. Изменение отгрузки в текущих ценах не является индексом физического объёма; промежуточные годы не восстановлены. При несовпадении территориального кода или отсутствии значения изменение не рассчитывается.'),wrap);
     const download=node('button','Скачать сравнение структуры CSV');download.id='rm-change-export';download.type='button';
     download.onclick=()=>csv('regional-industry-change-'+chosen.code+'-'+group.section+'-'+start+'-'+end+'.csv',[
      ['Регион','ISO геометрии','Раздел ОКВЭД2','Группа','Наименование','Классы ОКВЭД2','Начальный год','Конечный год','Территория источника (начало)','Территория источника (конец)','ОКАТО (начало)','ОКАТО (конец)','ОКТМО (начало)','ОКТМО (конец)','Отгрузка начало, млн руб.','Отгрузка конец, млн руб.','Итог раздела начало, млн руб.','Итог раздела конец, млн руб.','Доля начало, %','Доля конец, %','Локализация начало','Локализация конец','Отгрузка РФ начало, млн руб.','Отгрузка РФ конец, млн руб.','Итог раздела РФ начало, млн руб.','Итог раздела РФ конец, млн руб.','Изменение отгрузки, млн руб.','Номинальное изменение, %','Изменение доли, п. п.','Изменение локализации','Издание начало','Издание конец','Файл начало','Файл конец','Строка начало','Строка конец','Строка итога начало','Строка итога конец','Строка РФ начало','Строка РФ конец','Строка итога РФ начало','Строка итога РФ конец','Исходное значение начало','Исходное значение конец','Источник','SHA-256 ZIP','SHA-256 JSON','Отпечаток манифеста'],...comparisonRows]);
     detail.append(download);
    }
    const profile=ManufacturingAtlas.regionalProfile(combined,chosen.key,year,RegionalStats.sample);
    const panel=node('details','');panel.id='rm-all-profile';
    panel.append(node('summary','Полное промышленное досье: добыча, обработка и энергетика'));
    panel.append(node('p','Коэффициенты локализации рассчитаны отдельно внутри каждого раздела B, C или D. Значение выше 1 означает большую долю группы относительно структуры России. Это не оценка эффективности. Итоговые строки не считаются специализированными отраслями.'));
    const controls=node('div','');controls.className='project-controls';
    const sect=node('select',''),mode=node('select','');sect.id='rm-profile-section';mode.id='rm-profile-mode';
    sect.add(new Option('Все разделы',''));
    for(const id of Object.keys(sections))if(profile.some(r=>r.section===id))sect.add(new Option(id+' · '+sections[id].title,id));
    for(const [label,value] of [['Все группы','all'],['Специализация: локализация > 1','specialized'],['Нет коэффициента локализации','missing']])mode.add(new Option(label,value));
    for(const [label,control] of [['Раздел ОКВЭД2',sect],['Отбор групп',mode]]){const l=node('label',label);l.append(control);controls.append(l)}
    const coverage=node('p','');coverage.id='rm-profile-coverage';coverage.setAttribute('role','status');
    const overview=node('div','');overview.id='rm-profile-table';overview.className='table-scroll';overview.tabIndex=0;overview.setAttribute('role','region');overview.setAttribute('aria-label','Полное промышленное досье');
    const exp=node('button','Скачать промышленное досье CSV');exp.type='button';exp.id='rm-profile-export';
    panel.append(controls,coverage,overview,exp);
    function drawProfile(){
     const filtered=ManufacturingAtlas.profileFilter(profile,sect.value,mode.value);
     const available=profile.filter(r=>!sect.value||r.section===sect.value),numeric=available.filter(r=>Number.isFinite(r.observation?.value)).length,local=available.filter(r=>Number.isFinite(r.observation?.localization)).length;
     coverage.textContent='Групп в охвате: '+available.length+' · числовая отгрузка: '+numeric+' · рассчитана локализация: '+local+' · показано: '+filtered.length+'. Пропуски не равны нулю.';
     const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
     for(const label of ['Раздел','Группа ОКВЭД2','Отгрузка, млн руб.','Доля внутри раздела, %','Локализация','Доля в отгрузке РФ, %']){const th=node('th',label);th.scope='col';h.append(th)}
     for(const x of filtered){
      const r=x.observation,tr=body.insertRow();tr.insertCell().textContent=x.section;
      const a=link(x.title+' · '+x.okved,current('regional-manufacturing.html',{'rm-group':x.group,'rm-year':year,'rm-region':chosen.code,'rm-metric':metric}));tr.insertCell().append(a);
      for(const v of [r?.value,r?.share,r?.localization,r?.countryShare])tr.insertCell().textContent=number(v);
     }
     overview.replaceChildren(t);
     exp.disabled=!filtered.length;exp.onclick=()=>csv('regional-industry-profile-'+chosen.code+'-'+year+'.csv',[
      ['Регион','ISO геометрии','Год','Раздел','Группа','Наименование','ОКВЭД2','Итог раздела','Территория источника','ОКАТО','ОКТМО','Отгрузка, млн руб.','Итог раздела региона, млн руб.','Доля, %','Локализация','Доля в отгрузке РФ, %','Отгрузка РФ, млн руб.','Итог раздела РФ, млн руб.','Доля в разделе РФ, %','Издание','Лист','Строка','Строка итога','Строка РФ','Строка итога РФ','Исходное значение','Источник','SHA-256 ZIP','SHA-256 JSON','Отпечаток манифеста'],
      ...filtered.map(x=>{const r=x.observation,entry=bySection[x.section];return [chosen.name,chosen.code,year,x.section,x.group,x.title,x.okved,x.isTotal?'да':'нет',r?.region,r?.okato,r?.oktmo,r?.value,r?.total,r?.share,r?.localization,r?.countryShare,r?.national,r?.nationalTotal,r?.nationalShare,r?.edition,r?.sheet,r?.row,r?.totalRow,r?.nationalRow,r?.nationalTotalRow,r?.raw_value,entry?.data.source,entry?.data.sha256,entry?.sha256,manifest.data_fingerprint]})]);
    }
    sect.onchange=mode.onchange=drawProfile;drawProfile();detail.append(panel);
    const infrastructure=node('p','');infrastructure.append(link('Индустриальные парки и ОЭЗ региона',current('industrial-parks.html',{'park-iso':chosen.code})),document.createTextNode(' · '),link('Новости региона',current('news-map.html',{'news-geo-region':chosen.code})));
    const registry={'RU-BU':'investment-projects.html','RU-AMU':'amur-projects.html','RU-KDA':'krasnodar-projects.html'}[chosen.code];
    if(registry)infrastructure.append(document.createTextNode(' · '),link('Инвестиционный реестр (текущая редакция)',registry));
    detail.append(infrastructure,node('p','Парки и инвестиционные записи не являются доказательством фактической работы предприятия или его вклада в отгрузку. Даты и охват источников различаются.'));
   }else detail.append(node('p','Выберите регион на карте или в списке, чтобы открыть его отраслевое досье.'));
   const chart=$('rm-rank-chart');chart.replaceChildren();if(known.length){
    const top=known.slice(0,10),height=68+top.length*29,w=900,svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+height);svg.setAttribute('role','img');svg.setAttribute('aria-label','Десять наибольших значений: '+metricLabels[metric]);
    shape(svg,'rect',{width:w,height,fill:'white'});shape(svg,'text',{x:20,y:25,fill:'#203943','font-size':16},'Наибольшие значения · '+metricLabels[metric]);const max=Math.max(...top.map(r=>r[metric]),.0001);
    for(const [i,r] of top.entries()){const y=45+i*29;shape(svg,'text',{x:20,y:y+14,fill:'#203943','font-size':12},r.name);shape(svg,'rect',{x:330,y,width:440*r[metric]/max,height:18,fill:'#287f76'});shape(svg,'text',{x:780,y:y+14,fill:'#203943','font-size':12},fmtMetric(r[metric],metric))}
    chart.append(svg);if(typeof chartTools==='function')chartTools(chart,group.title+' · '+year,metricLabels[metric],top.map(r=>r.name),[{name:metricLabels[metric],code:metric,values:top.map(r=>r[metric])}],{source:'Росстат · Если быть точным',url:data.source});
   }else chart.append(node('p','Нет однозначно сопоставимых значений.'));
   const table=node('table',''),head=table.createTHead().insertRow();for(const h of ['Место','Регион','Отгрузка, млн руб.','Итог раздела '+group.section+' региона, млн руб.','Доля, %','Локализация','Доля в отгрузке РФ, %'])head.append(node('th',h));const body=table.createTBody();
   const ordered=[...known,...items.filter(r=>!Number.isFinite(r[metric]))];
   for(const r of ordered){const tr=body.insertRow();tr.insertCell().textContent=Number.isFinite(r[metric])?1+known.filter(x=>x[metric]>r[metric]).length:'—';const b=node('button',r.name);b.type='button';b.onclick=()=>{select.value=r.code;draw();detail.scrollIntoView({block:'start'})};tr.insertCell().append(b);for(const v of [r.value,r.total,r.share,r.localization,r.countryShare])tr.insertCell().textContent=number(v)}
   $('rm-table').replaceChildren(table);exporter.disabled=false;
   exporter.onclick=()=>csv('regional-manufacturing-'+group.id+'-'+year+'.csv',[['Группа','Раздел ОКВЭД2','ОКВЭД2','Год','Регион','ISO геометрии','Территория источника','ОКАТО','ОКТМО','Отгрузка, млн руб.','Итог региона, млн руб.','Доля, %','Локализация','Доля РФ, %','Отгрузка РФ, млн руб.','Итог РФ, млн руб.','Доля отрасли в разделе '+group.section+' РФ, %','Подраздел','Издание','Лист','Строка отгрузки','Строка итога','Строка отгрузки РФ','Строка итога РФ','Примечание','Источник','SHA-256 исходника','SHA-256 JSON','Отпечаток манифеста'],...ordered.map(r=>[group.title,group.section,group.okved,year,r.name,r.code,r.region,r.okato,r.oktmo,r.value,r.total,r.share,r.localization,r.countryShare,result.national,result.nationalTotal,result.nationalShare,r.subsection,r.edition,r.sheet,r.row,r.totalRow,r.nationalRow,r.nationalTotalRow,r.note,selected.data.source,selected.data.sha256,selected.sha256,manifest.data_fingerprint])]);
   syncDeltaYears(group);drawDelta();if(chosen&&concOptions.some(t=>t.code===chosen.code))concRegion.value=chosen.code;drawConcentration();if(chosen)shiftRegion.value=chosen.code;syncShift();save(fields);
  }
  $('rm-form').addEventListener('change',e=>{if(e.target===sectionPick)setGroups('');draw()});$('rm-form').addEventListener('submit',e=>e.preventDefault());draw();
 }catch(e){console.error(e);status.textContent='Не удалось проверить архив: '+String(e.message||e);exporter.disabled=true}
});
