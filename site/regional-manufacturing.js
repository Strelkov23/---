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
 function localizationBin(v){return !finite(v)?-1:v<.5?0:v<1?1:v<1.5?2:v<2?3:4}
 return {calculate,identity,share,quotient,localizationBin,sections,sectionOf,changeBetween}
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
     for(const label of ['Группа','Отгрузка '+start+', млн руб.','Отгрузка '+end+', млн руб.','Изменение в текущих ценах, %','Изменение доли, п. п.','Изменение локализации'])h.append(node('th',label));
     for(const g of groups.filter(g=>g.section===group.section)){
      const a=ManufacturingAtlas.calculate(combined,g.id,start,RegionalStats.sample).rows.get(chosen.key),b=ManufacturingAtlas.calculate(combined,g.id,end,RegionalStats.sample).rows.get(chosen.key),change=ManufacturingAtlas.changeBetween(a,b);
      const tr=body.insertRow();tr.insertCell().textContent=g.title;
      for(const v of [a?.value,b?.value,change?.nominalChange,change?.shareDelta,change?.localizationDelta])tr.insertCell().textContent=number(v);
     }
     const wrap=node('div','');wrap.className='table-scroll';wrap.append(t);wrap.id='rm-change-table';
     detail.append(node('h3','Изменение структуры: '+start+'–'+end+' гг.'),node('p','Это два отдельных наблюдения. Изменение отгрузки в текущих ценах не является индексом физического объёма; промежуточные годы не восстановлены. При несовпадении территориального кода или отсутствии значения изменение не рассчитывается.'),wrap);
    }
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
   save(fields);
  }
  $('rm-form').addEventListener('change',e=>{if(e.target===sectionPick)setGroups('');draw()});$('rm-form').addEventListener('submit',e=>e.preventDefault());draw();
 }catch(e){console.error(e);status.textContent='Не удалось проверить архив: '+String(e.message||e);exporter.disabled=true}
});
