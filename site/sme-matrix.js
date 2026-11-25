const SmeMatrix=(()=>{
 function rows(d,region,kind){
  if(!['declared','reported'].includes(kind))throw Error('Тип ОКВЭД');
  const r=d.regions.find(x=>x.region===region);
  if(!r||r.difference!==0)return [];
  return d[kind].filter(x=>x.region===region).sort((a,b)=>b.count-a.count||a.class.localeCompare(b.class)).map(x=>({...x,share:r.imported?100*x.count/r.imported:null}));
 }
 return {rows};
})();
if(typeof module!=='undefined')module.exports=SmeMatrix;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('sme-matrix-status');if(!status)return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),d=(await Provenance.get(m,'sme-matrix.json',root)).data,ref=(await Provenance.get(m,'sme-regions.json',root)).data;
  if(d.status!=='diagnostic'){status.textContent='Диагностическая матрица пока недоступна.';return}
  const region=$('sme-matrix-region'),kind=$('sme-matrix-kind'),out=$('sme-matrix-table'),exp=$('sme-matrix-export');
  const names=new Map(ref.rows.map(r=>[r.code,r.name]));
  const matched=d.regions.filter(r=>r.difference===0);
  region.replaceChildren(...matched.map(r=>new Option((names.get(r.region)||'Код '+r.region)+' ('+r.region+')',r.region)));
  region.disabled=kind.disabled=false;
  function draw(){
   const rows=SmeMatrix.rows(d,region.value,kind.value);
   status.textContent='Диагностический срез '+d.edition+' · '+matched.length+' территорий с совпавшим итогом. Расхождение РФ: '+d.national_difference+'; карантин: '+d.quarantined+'. Не официальная статистика по классам.';
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Класс ОКВЭД2','ЮЛ в архиве','Доля ЮЛ региона, %']){const th=node('th',v);th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const v of [r.class==='missing_or_other_version'?'Нет кода ОКВЭД2 / другая версия':r.class,r.count.toLocaleString('ru'),r.share===null?'—':r.share.toLocaleString('ru',{maximumFractionDigits:2})])tr.insertCell().textContent=v}
   out.replaceChildren(t);exp.disabled=!rows.length;exp.onclick=()=>csv('sme-matrix-'+region.value+'-'+kind.value+'.csv',[['Дата','Регион','Тип кода','Класс','ЮЛ','Доля, %','Статус','SHA-256 ZIP','SHA-256 отчёта','SHA-256 сверки'],...rows.map(r=>[d.edition,r.region,kind.value,r.class,r.count,r.share,'diagnostic',d.archive_sha256,d.report_sha256,d.reference_sha256])]);
  }
  region.onchange=kind.onchange=draw;draw();
 }catch(e){status.textContent='Матрица недоступна: '+String(e.message||e)}
});
