/* All ratios are computed from the same edition, same year and exact territorial keys. */
const ManufacturingAtlas=(()=>{
 const identity=r=>JSON.stringify([r.region,r.level,r.okato,r.oktmo,r.year,r.edition,r.version]);
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 function unique(rows){return rows.length===1?rows[0]:null}
 function quotient(a,b){return finite(a)&&finite(b)&&b>0?a/b:null}
 function share(a,b){const q=quotient(a,b);return q===null||q>1+1e-10?null:100*q}
 function calculate(data,group,year,sample){
  const rows=data.rows.filter(r=>r.year===year),nat=unique(rows.filter(r=>r.level==='Страна'&&r.region==='Российская Федерация'&&r.group===group)),natTotal=unique(rows.filter(r=>r.level==='Страна'&&r.region==='Российская Федерация'&&r.group==='total'));
  const common=nat&&natTotal&&identity(nat)===identity(natTotal),nationalShare=common?share(nat.value,natTotal.value):null;
  const regional=rows.filter(r=>r.level==='Регион'),totalBy=new Map();
  for(const r of regional.filter(r=>r.group==='total')){const id=identity(r),a=totalBy.get(id)||[];a.push(r);totalBy.set(id,a)}
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
 function localizationBin(v){return !finite(v)?-1:v<.5?0:v<1?1:v<1.5?2:v<2?3:4}
 return {calculate,identity,share,quotient,localizationBin}
})();
if(typeof module!=='undefined')module.exports=ManufacturingAtlas;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('rm-form'))return;
 const fields=['rm-group','rm-year','rm-metric','rm-region'],ns='http://www.w3.org/2000/svg';
 const number=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const metricLabels={localization:'Коэффициент локализации',share:'Доля в обрабатывающих производствах, %',value:'Отгрузка, млн руб.',countryShare:'Доля в российской отгрузке, %'};
 const fmtMetric=(v,metric)=>number(v)+(Number.isFinite(v)&&['share','countryShare'].includes(metric)?'%':'');
 const link=(t,u)=>{const a=node('a',t);a.href=u;return a};
 const current=(file,params={})=>{const u=new URL(file,location.href);for(const [k,v] of Object.entries(params))if(v!==null&&v!=='')u.searchParams.set(k,v);if(pinned)u.searchParams.set('snapshot',pinned);return u.href};
 const select=$('rm-region'),status=$('rm-status'),source=$('rm-source'),exporter=$('rm-export');
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
  const {data,sha256}=await Provenance.get(manifest,'regional-manufacturing.json',root);
  const groups=data.groups;source.replaceChildren(node('p',data.method),link('Архив «Если быть точным» · '+data.license,data.catalog),document.createTextNode(' · '),link('Исходный ZIP',data.source),document.createTextNode(' · '),link('Росстат: статистические издания',data.primary),node('p','Выпуск: '+data.release+' · последняя проверка: '+(data.checked||'—')+' · успешная загрузка: '+(data.success||'—')+' · '+data.status));
  if(!data.rows.length){status.textContent='Нет загруженных наблюдений. Отсутствие данных не означает отсутствие производства.';return}
  source.append(node('p','SHA-256 исходного ZIP: '+data.sha256));
  const geo=(await Provenance.get(manifest,'regional-boundaries.geojson',root)).data;
  const years=[...new Set(data.rows.map(r=>r.year))].sort((a,b)=>b-a);
  $('rm-group').replaceChildren(...groups.map(g=>new Option(g.title+' · '+g.okved,g.id)));
  $('rm-year').replaceChildren(...years.map(y=>new Option(String(y),String(y))));
  $('rm-group').value=groups.find(g=>g.id==='light')?'light':groups[0].id;
  const counts=new Map();for(const f of geo.features){const k=RegionalMap.key(f.properties?.iso_3166_2);if(k)counts.set(k,(counts.get(k)||0)+1)}
  const features=geo.features.map(f=>({f,key:RegionalMap.key(f.properties?.iso_3166_2),code:f.properties?.iso_3166_2||'',name:RegionalMap.displayName(f.properties?.iso_3166_2,f.properties?.name||'Неизвестный контур'),rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  const mapped=features.filter(f=>f.key&&counts.get(f.key)===1).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  select.replaceChildren(new Option('Выберите регион',''),...mapped.map(f=>new Option(f.name,f.code)));
  for(const id of ['rm-group','rm-year','rm-region'])$(id).disabled=false;
  restore(fields);
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
   const theme=RegionalMap.theme('MFG_'+group.id+'_atlas','',group.title);
   const palette=metric==='localization'?['#b74e42','#f0b5a0','#dce8e2','#6eae9b','#176c60']:RegionalMap.palette(theme);
   for(const f of features){
    const row=counts.get(f.key)===1?by.get(f.key):null,v=row?.[metric],bin=metric==='localization'?ManufacturingAtlas.localizationBin(v):RegionalMap.bin(v,thresholds);
    const d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');
    if(!d)continue;
    const p=shape(svg,'path',{d,fill:bin<0?'#deded9':palette[Math.min(bin,palette.length-1)],stroke:select.value===f.code?'#101e26':'#52696e','stroke-width':select.value===f.code?2.5:.7,'fill-rule':'evenodd','data-region':f.code||'',role:'button',tabindex:f.key&&counts.get(f.key)===1?0:-1,'aria-label':f.name+': '+fmtMetric(v,metric)});
    shape(p,'title',{},f.name+' · '+fmtMetric(v,metric));
    if(f.key&&counts.get(f.key)===1){const choose=()=>{select.value=f.code;draw()};p.addEventListener('click',choose);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})}
   }
   host.append(svg);
   const legend=node('div','');legend.className='legend';
   const bins=metric==='localization'?['Менее 0,5','0,5–<1','1–<1,5','1,5–<2','2 и более']:thresholds.length===1?[number(thresholds[0])]:thresholds.slice(1).map((t,i)=>(i?' > ':'')+number(thresholds[i])+' — '+number(t));
   for(const [i,label] of [...bins,'Нет данных'].entries()){const span=node('span','');const sw=node('b','');sw.style.cssText='display:inline-block;width:1rem;height:1rem;border:1px solid #52696e;background:'+(i===bins.length?'#deded9':palette[i]);span.append(sw,document.createTextNode(' '+label));legend.append(span)}
   host.append(legend);
  }
  function draw(){
   const group=groups.find(g=>g.id===$('rm-group').value),year=Number($('rm-year').value),metric=$('rm-metric').value;
   if(!group||!years.includes(year))return;
   const result=ManufacturingAtlas.calculate(data,group.id,year,RegionalStats.sample),items=mapped.map(f=>({key:f.key,code:f.code,name:f.name,...result.rows.get(f.key)}));
   const known=items.filter(r=>Number.isFinite(r[metric])).sort((a,b)=>b[metric]-a[metric]||a.name.localeCompare(b.name,'ru'));
   status.textContent='Отрасль: '+group.title+' · '+year+' · сопоставлено '+known.length+' из '+mapped.length+' однозначных контуров; геометрия справочная';
   $('rm-legend-text').textContent=metric==='localization'?'Фиксированная шкала: менее 1 — доля ниже российской; выше 1 — выше. Не оценка эффективности.':'Цветовая шкала по распределению фактически доступных значений; между годами интервалы могут меняться.';
   const metrics=$('rm-metrics');metrics.replaceChildren();
   for(const [label,v] of [['Отгрузка по России, млн руб.',number(result.national)],['Доля в обработке РФ',fmtMetric(result.nationalShare,'share')],['Контуры с данными',known.length+' / '+mapped.length],['Исключено строк / неоднозначных ключей',result.excluded+' / '+result.ambiguous]]){const card=node('div','');card.className='metric';card.append(node('b',String(v)),node('span',label));metrics.append(card)}
   renderMap(items,metric,group);
   const detail=$('rm-detail');detail.replaceChildren();
   const chosen=mapped.find(f=>f.code===select.value);
   if(chosen){
    detail.append(node('h3',chosen.name+' · '+year),node('p','Разные группы показаны отдельно; итоги не складываются с подразделами.'));
    const table=node('table',''),head=table.createTHead().insertRow();for(const h of ['Группа','Отгрузка, млн руб.','Доля, %','Локализация'])head.append(node('th',h));
    const body=table.createTBody();for(const g of groups){const r=ManufacturingAtlas.calculate(data,g.id,year,RegionalStats.sample).rows.get(chosen.key);const tr=body.insertRow();const button=node('button',g.title);button.type='button';button.onclick=()=>{$('rm-group').value=g.id;draw()};tr.insertCell().append(button);for(const v of [r?.value,r?.share,r?.localization])tr.insertCell().textContent=number(v)}
    const scroll=node('div','');scroll.className='table-scroll';scroll.append(table);detail.append(scroll,link('Открыть экономическую карту региона',current('economic-map.html',{'geo-region':chosen.code,'geo-year':year})));
   }else detail.append(node('p','Выберите регион на карте или в списке, чтобы открыть его отраслевое досье.'));
   const chart=$('rm-rank-chart');chart.replaceChildren();if(known.length){
    const top=known.slice(0,10),height=68+top.length*29,w=900,svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+height);svg.setAttribute('role','img');svg.setAttribute('aria-label','Десять наибольших значений: '+metricLabels[metric]);
    shape(svg,'rect',{width:w,height,fill:'white'});shape(svg,'text',{x:20,y:25,fill:'#203943','font-size':16},'Наибольшие значения · '+metricLabels[metric]);const max=Math.max(...top.map(r=>r[metric]),.0001);
    for(const [i,r] of top.entries()){const y=45+i*29;shape(svg,'text',{x:20,y:y+14,fill:'#203943','font-size':12},r.name);shape(svg,'rect',{x:330,y,width:440*r[metric]/max,height:18,fill:'#287f76'});shape(svg,'text',{x:780,y:y+14,fill:'#203943','font-size':12},fmtMetric(r[metric],metric))}
    chart.append(svg);if(typeof chartTools==='function')chartTools(chart,group.title+' · '+year,metricLabels[metric],top.map(r=>r.name),[{name:metricLabels[metric],code:metric,values:top.map(r=>r[metric])}],{source:'Росстат · Если быть точным',url:data.source});
   }else chart.append(node('p','Нет однозначно сопоставимых значений.'));
   const table=node('table',''),head=table.createTHead().insertRow();for(const h of ['Место','Регион','Отгрузка, млн руб.','Итог обработки региона, млн руб.','Доля, %','Локализация','Доля в отгрузке РФ, %'])head.append(node('th',h));const body=table.createTBody();
   const ordered=[...known,...items.filter(r=>!Number.isFinite(r[metric]))];
   for(const r of ordered){const tr=body.insertRow();tr.insertCell().textContent=Number.isFinite(r[metric])?1+known.filter(x=>x[metric]>r[metric]).length:'—';const b=node('button',r.name);b.type='button';b.onclick=()=>{select.value=r.code;draw();detail.scrollIntoView({block:'start'})};tr.insertCell().append(b);for(const v of [r.value,r.total,r.share,r.localization,r.countryShare])tr.insertCell().textContent=number(v)}
   $('rm-table').replaceChildren(table);exporter.disabled=false;
   exporter.onclick=()=>csv('regional-manufacturing-'+group.id+'-'+year+'.csv',[['Группа','ОКВЭД2','Год','Регион','ISO геометрии','Территория источника','ОКАТО','ОКТМО','Отгрузка, млн руб.','Итог региона, млн руб.','Доля, %','Локализация','Доля РФ, %','Отгрузка РФ, млн руб.','Итог РФ, млн руб.','Доля отрасли в обработке РФ, %','Подраздел','Издание','Лист','Строка отгрузки','Строка итога','Строка отгрузки РФ','Строка итога РФ','Примечание','Источник','SHA-256 исходника','SHA-256 JSON','Отпечаток манифеста'],...ordered.map(r=>[group.title,group.okved,year,r.name,r.code,r.region,r.okato,r.oktmo,r.value,r.total,r.share,r.localization,r.countryShare,result.national,result.nationalTotal,result.nationalShare,r.subsection,r.edition,r.sheet,r.row,r.totalRow,r.nationalRow,r.nationalTotalRow,r.note,data.source,data.sha256,sha256,manifest.data_fingerprint])]);
   save(fields);
  }
  $('rm-form').addEventListener('change',draw);$('rm-form').addEventListener('submit',e=>e.preventDefault());draw();
 }catch(e){console.error(e);status.textContent='Не удалось проверить архив: '+String(e.message||e);exporter.disabled=true}
});
