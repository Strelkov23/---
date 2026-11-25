/* Ratios only from same historical archive, exact definitions and source scope. */
const EnterpriseDiagnostics=(()=>{
 const unit='На конец года, миллионов рублей',suffix='/data_11_socio_economic_102_v20260313.zip';
 const concepts={payable:'Кредиторская задолженность организаций',receivable:'Дебиторская задолженность организаций'};
 const fields=['Подраздел источника','Издание','Версия','Уровень территории','ОКТМО','ОКАТО'];
 function candidates(catalog,kind,part){
  if(!concepts[kind]||!['Всего','Просроченная'].includes(part))return [];
  return catalog.filter(r=>r.source?.endsWith(suffix)&&r.unit===unit&&r.title===concepts[kind]+': '+part);
 }
 function scope(r){
  const note=String(r.note||''),bits=fields.map(k=>{
   const marker=' · '+k+': ',i=note.lastIndexOf(marker);return i<0?null:note.slice(i+marker.length).split(' · ')[0].trim();
  });
  // Both codes are preserved; at least one must be nonempty.
  if(bits.some(x=>x===null)||!bits[0]||!bits[1]||!bits[2]||bits[3]!=='Регион'||(!bits[4]&&!bits[5]))return null;
  return JSON.stringify(bits);
 }
 function calculate(total,overdue,year,sample){
  if(!total.source||total.source!==overdue.source||total.unit!==unit||overdue.unit!==unit||!Object.values(concepts).some(c=>total.title===c+': Всего'&&overdue.title===c+': Просроченная')||!total.source.endsWith(suffix))throw Error('Несопоставимые определения');
  const a=sample(total.values.filter(r=>r.year===year)),b=sample(overdue.values.filter(r=>r.year===year));
  const keys=[...new Set([...a.out.keys(),...b.out.keys()])].sort();
  const rows=keys.map(key=>{
   const x=a.out.get(key),y=b.out.get(key),same=x&&y&&x.region===y.region&&scope(x)!==null&&scope(x)===scope(y);
   let reason='ok',value=null;
   if(!x||!y)reason='missing';
   else if(!same)reason='scope';
   else if(x.value<=0||y.value<0||y.value>x.value)reason='bounds';
   else value=100*y.value/x.value;
   return {key,region:x?.region||y?.region,total:x||null,overdue:y||null,value,reason};
  });
  return {rows,excluded:a.excluded+b.excluded,ambiguous:a.ambiguous+b.ambiguous};
 }
 function trend(total,overdue,key,sample){
  const years=[...new Set([...total.values,...overdue.values].map(r=>r.year).filter(Number.isInteger))].sort((a,b)=>a-b);
  if(!years.length)return [];
  const result=[];
  for(let year=years[0];year<=years.at(-1);year++){
   const row=calculate(total,overdue,year,sample).rows.find(r=>r.key===key);
   const item={year,region:row?.region||null,total:row?.total||null,overdue:row?.overdue||null,value:row?.value??null,reason:row?.reason||'missing',change:null};
   const previous=result.at(-1);
   if(previous&&Number.isFinite(previous.value)&&Number.isFinite(item.value)&&previous.region===item.region){
    // Statistical editions can change by observation year. Require stable territory
    // codes, level, original subsection and archive version, excluding edition only.
    const a=JSON.parse(scope(previous.total)),b=JSON.parse(scope(item.total));
    if(a.every((v,i)=>i===1||v===b[i]))item.change=item.value-previous.value;
   }
   result.push(item);
  }
  return result;
 }
 return {candidates,scope,calculate,trend};
})();
if(typeof module!=='undefined')module.exports=EnterpriseDiagnostics;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('ed-form');if(!form)return;
 const kind=$('ed-kind'),total=$('ed-total'),overdue=$('ed-overdue'),year=$('ed-year'),status=$('ed-status'),host=$('ed-table'),exp=$('ed-export');
 const labels={ok:'Сопоставимо',missing:'Нет парного наблюдения',scope:'Не совпадает охват / редакция',bounds:'Неположительный итог или несогласованные значения'};
 const region=$('ed-region'),trendHost=$('ed-trend'),trendTable=$('ed-trend-table'),trendExport=$('ed-trend-export');
 let seq=0,active=null;
 function clear(msg){host.replaceChildren();exp.disabled=true;status.textContent=msg;region.replaceChildren(new Option('Выберите регион',''));trendHost.replaceChildren();trendTable.replaceChildren();trendExport.disabled=true}
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),catalog=(await Provenance.get(manifest,'historical.json',root)).data.series;
  const fetchSeries=async meta=>({...((await Provenance.get(manifest,meta.file,root)).data),code:meta.code});
  function options(){
   ++seq;active=null;year.replaceChildren();
   for(const [el,part] of [[total,'Всего'],[overdue,'Просроченная']]){
    const found=EnterpriseDiagnostics.candidates(catalog,kind.value,part);
    el.replaceChildren(new Option('Выберите ряд',''),...found.map(m=>new Option(m.title+' · '+m.first+'–'+m.last+' · '+m.code,m.code)));
    if(found.length===1)el.value=found[0].code;
   }
   select();
  }
  async function select(){
   const token=++seq;active=null;year.replaceChildren();clear('Выберите два ряда одного вида задолженности. Если архив не импортирован, ряды недоступны.');
   if(!total.value||!overdue.value)return;
   try{
    const [a,b]=await Promise.all([total,overdue].map(e=>fetchSeries(catalog.find(m=>m.code===e.value))));
    if(token!==seq)return;
    const years=[...new Set(a.values.map(r=>r.year))].filter(y=>b.values.some(r=>r.year===y)).sort((a,b)=>b-a);
    if(!years.length){clear('Нет общего года');return}
    year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));active={a,b};
    const names=new Map();
    for(const y of years)for(const r of EnterpriseDiagnostics.calculate(a,b,y,RegionalStats.sample).rows)if(!names.has(r.key))names.set(r.key,r.region);
    region.replaceChildren(new Option('Выберите регион',''),...[...names].sort((a,b)=>a[1].localeCompare(b[1],'ru')).map(([key,name])=>new Option(name,key)));
    draw();drawTrend();
   }catch(e){if(token===seq)clear('Ряды не удалось проверить для выбранной версии.')}
  }
  function draw(){
   if(!active)return;
   const {a,b}=active,y=Number(year.value),r=EnterpriseDiagnostics.calculate(a,b,y,RegionalStats.sample);
   const rows=[...r.rows].sort((a,b)=>(b.value??-1)-(a.value??-1)||a.region.localeCompare(b.region,'ru'));
   status.textContent='Год: '+y+' · рассчитано: '+rows.filter(x=>x.value!==null).length+' из '+rows.length+' территорий в объединении выборок · исключённых строк: '+r.excluded+' · неоднозначных ключей по двум рядам: '+r.ambiguous+'.';
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Регион','Всего, млн ₽','Просрочено, млн ₽','Доля, %','Статус сопоставления']){const th=node('th',label);th.scope='col';h.append(th)}
   const f=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
   for(const x of rows){const tr=body.insertRow();for(const v of [x.region,f(x.total?.value),f(x.overdue?.value),f(x.value),labels[x.reason]])tr.insertCell().textContent=v}
   host.replaceChildren(t);
   exp.disabled=!rows.length;exp.onclick=()=>csv('enterprise-debt-'+kind.value+'-'+y+'.csv',[
    ['Регион','Год','Ряд итога','Ряд просрочки','Итог, млн руб.','Просрочка, млн руб.','Доля, %','Статус','Лист итога','Строка итога','Примечание итога','Лист просрочки','Строка просрочки','Примечание просрочки','Источник','Отпечаток манифеста'],
    ...rows.map(x=>[x.region,y,a.code,b.code,x.total?.value,x.overdue?.value,x.value,labels[x.reason],x.total?.sheet,x.total?.row,x.total?.note,x.overdue?.sheet,x.overdue?.row,x.overdue?.note,a.source,manifest.data_fingerprint])]);
  }
  function drawTrend(){
   trendHost.replaceChildren();trendTable.replaceChildren();trendExport.disabled=true;
   if(!active||!region.value){trendHost.append(node('p','Выберите регион для просмотра динамики.'));return}
   const {a,b}=active,rows=EnterpriseDiagnostics.trend(a,b,region.value,RegionalStats.sample),name=region.selectedOptions[0].textContent;
   const format=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
   const known=rows.filter(r=>Number.isFinite(r.value));
   trendHost.append(node('p',name+' · рассчитано '+known.length+' из '+rows.length+' календарных лет. Пропуски не интерполируются; изменение относится только к соседним годам с совпадающим территориальным охватом.'));
   if(known.length){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 780 250');svg.setAttribute('role','img');svg.setAttribute('aria-label',name+' — доля просроченной задолженности, %');
    const add=(tag,attrs,t)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.append(e);return e};
    const x=i=>65+675*i/Math.max(1,rows.length-1),y=v=>200-v*1.6;
    add('rect',{width:780,height:250,fill:'#fff'});
    for(const v of [0,25,50,75,100]){add('line',{x1:65,y1:y(v),x2:740,y2:y(v),stroke:'#c6d1d3'});add('text',{x:55,y:y(v)+4,'text-anchor':'end',fill:'#203943','font-size':12},v+'%')}
    for(let i=0;i<rows.length;i++){const r=rows[i];if(i===0||i===rows.length-1||i%5===0)add('text',{x:x(i),y:222,'text-anchor':'middle',fill:'#203943','font-size':11},r.year);if(!Number.isFinite(r.value))continue;
     if(i&&Number.isFinite(r.change))add('line',{x1:x(i-1),y1:y(rows[i-1].value),x2:x(i),y2:y(r.value),stroke:'#287f76','stroke-width':2.5});
     const dot=add('circle',{cx:x(i),cy:y(r.value),r:4,fill:'#287f76'}),tip=document.createElementNS(ns,'title');tip.textContent=r.year+' · '+format(r.value)+'%';dot.append(tip);
    }
    trendHost.append(svg);
    if(typeof chartTools==='function')chartTools(trendHost,name+' · доля просроченной задолженности','%',rows.map(r=>r.year),[{name,code:a.code+'_'+b.code,values:rows.map(r=>r.value)}],{source:'Росстат · архив «Если быть точным»',url:a.source});
   }
   const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
   for(const label of ['Год','Общая сумма, млн руб.','Просрочка, млн руб.','Доля, %','Изменение, п. п.','Сопоставление']){const th=node('th',label);th.scope='col';h.append(th)}
   for(const r of [...rows].reverse()){const tr=body.insertRow();for(const v of [r.year,format(r.total?.value),format(r.overdue?.value),format(r.value),format(r.change),labels[r.reason]])tr.insertCell().textContent=v}
   trendTable.append(t);
   trendExport.disabled=!rows.length;trendExport.onclick=()=>csv('enterprise-debt-trend-'+kind.value+'.csv',[['Территория','Год','Ряд итога','Ряд просрочки','Итог, млн руб.','Просрочка, млн руб.','Доля, %','Изменение, п. п.','Статус','Лист итога','Строка итога','Примечание итога','Лист просрочки','Строка просрочки','Примечание просрочки','Источник','Отпечаток манифеста'],...rows.map(r=>[r.region||name,r.year,a.code,b.code,r.total?.value,r.overdue?.value,r.value,r.change,labels[r.reason],r.total?.sheet,r.total?.row,r.total?.note,r.overdue?.sheet,r.overdue?.row,r.overdue?.note,a.source,manifest.data_fingerprint])]);
  }
  kind.onchange=options;total.onchange=overdue.onchange=select;year.onchange=draw;region.onchange=drawTrend;form.onsubmit=e=>e.preventDefault();options();
 }catch(e){clear('Архив предприятий недоступен для этой версии.')}
});
