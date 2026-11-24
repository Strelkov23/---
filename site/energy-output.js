const EnergyOutput=(()=>{
 function group(code){
 const groups=[['05','coal'],['06.10','oil'],['06.20','gas'],['19.10','coke'],['19.20','refined'],['35.11.10','power'],['35.30.11','heat']];
 return groups.find(([p])=>code===p||code.startsWith(p+'.'))?.[1]||null;
}
 function previous(p){
 const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(p);
 if(!m)return /^\d{4}$/.test(p)?String(Number(p)-1):null;
 const y=Number(m[1]),n=Number(m[2]);return n===1?`${y-1}-12`:`${y}-${String(n-1).padStart(2,'0')}`;
}
 function selectRows(series,frequency,period,category){
 return series.filter(s=>s.kind==='Натуральный выпуск'&&s.classification==='ОКПД2 (код источника)'&&s.frequency===frequency&&group(s.code||'')&&(!category||group(s.code)===category)).map(s=>{
  const now=s.values.find(r=>r.period===period),before=s.values.find(r=>r.period===previous(period));
  const a=now?.value,b=before?.value,valid=Number.isFinite(a)&&a>=0,base=Number.isFinite(b)&&b>=0;
  return {series:s,category:group(s.code),now,before,value:valid?a:null,delta:valid&&base?a-b:null,growth:valid&&base&&b>0?(a/b-1)*100:null};
 });
}
 return {group,previous,selectRows};
})();
if(typeof module!=='undefined')module.exports=EnergyOutput;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('energy-period'))return;
 const labels={coal:'Уголь',oil:'Нефть',gas:'Природный газ',coke:'Кокс',refined:'Нефтепродукты',power:'Электроэнергия',heat:'Тепловая энергия'};
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const add=(p,t,s)=>{const e=document.createElement(t);e.textContent=s;p.append(e);return e};
 const status=$('energy-status'),period=$('energy-period'),frequency=$('energy-frequency'),category=$('energy-category'),host=$('energy-table'),exp=$('energy-export');
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'industrial.json',root),data=verified.data;
  const series=data.series.filter(s=>s.kind==='Натуральный выпуск'&&s.classification==='ОКПД2 (код источника)'&&EnergyOutput.group(s.code||''));
  function draw(){
   const p=period.value,rows=EnergyOutput.selectRows(series,frequency.value,p,category.value).sort((a,b)=>a.series.code.localeCompare(b.series.code)||a.series.unit.localeCompare(b.series.unit,'ru'));
   const table=document.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
   for(const label of ['Группа / продукт','ОКПД2','Единица','Выпуск','Изменение к предыдущему периоду','Темп прироста, %','Источник']){const th=add(head,'th',label);th.scope='col'}
   for(const r of rows){
    const s=r.series,tr=body.insertRow(),td=tr.insertCell(),a=add(td,'a',s.title);a.href='industrial.html?ind-series='+encodeURIComponent(s.id)+'#ind-form';add(td,'div',labels[r.category]);
    for(const v of [s.code,s.unit,fmt(r.value),fmt(r.delta),fmt(r.growth)])tr.insertCell().textContent=v;
    const source=tr.insertCell(),link=add(source,'a','Росстат');link.href=s.source;add(source,'div',r.now?[s.sheet,r.now.row,r.now.column].join(' / '):'Нет ячейки за период');
   }
   host.replaceChildren(table);
   const n=rows.filter(r=>r.value!==null).length,comp=rows.filter(r=>r.growth!==null).length;
   status.textContent=p?'Период '+p+' · рядов в выборке: '+rows.length+' · наблюдений: '+n+' · сопоставимых темпов прироста: '+comp+'.':'Нет загруженных наблюдений для выбранной периодичности.';
   exp.disabled=!p||!rows.length;
   exp.onclick=()=>csv('energy-output-'+p+'.csv',[
    ['Период','Группа','Продукт','Код ОКПД2','ID ряда','Единица','Выпуск','Предыдущий период','Базовый выпуск','Изменение','Темп прироста, %','Источник','Лист','Строка','Столбец','Базовая строка','Базовый столбец','Получено','База получена','SHA-256','Отпечаток набора'],
    ...rows.map(r=>[p,labels[r.category],r.series.title,r.series.code,r.series.id,r.series.unit,r.value,EnergyOutput.previous(p),r.before?.value??null,r.delta,r.growth,r.series.source,r.series.sheet,r.now?.row,r.now?.column,r.before?.row,r.before?.column,r.now?.seen,r.before?.seen,verified.sha256,manifest.data_fingerprint])
   ]);
  }
  function periods(){
   const old=period.value,ps=[...new Set(series.filter(s=>s.frequency===frequency.value&&(!category.value||EnergyOutput.group(s.code)===category.value)).flatMap(s=>s.values.map(r=>r.period)))].sort().reverse();
   period.replaceChildren(...ps.map(p=>new Option(p,p)));if(ps.includes(old))period.value=old;draw();
  }
  for(const [key,label] of Object.entries(labels))category.add(new Option(label,key));
  frequency.addEventListener('change',periods);category.addEventListener('change',periods);period.addEventListener('change',draw);periods();
 }catch(e){status.textContent='Набор не подтверждён: '+e.message;exp.disabled=true}
});
