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
 return {candidates,scope,calculate};
})();
if(typeof module!=='undefined')module.exports=EnterpriseDiagnostics;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('ed-form');if(!form)return;
 const kind=$('ed-kind'),total=$('ed-total'),overdue=$('ed-overdue'),year=$('ed-year'),status=$('ed-status'),host=$('ed-table'),exp=$('ed-export');
 const labels={ok:'Сопоставимо',missing:'Нет парного наблюдения',scope:'Не совпадает охват / редакция',bounds:'Неположительный итог или несогласованные значения'};
 let seq=0,active=null;
 function clear(msg){host.replaceChildren();exp.disabled=true;status.textContent=msg}
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
    year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));active={a,b};draw();
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
  kind.onchange=options;total.onchange=overdue.onchange=select;year.onchange=draw;form.onsubmit=e=>e.preventDefault();options();
 }catch(e){clear('Архив предприятий недоступен для этой версии.')}
});
