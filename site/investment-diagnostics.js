/* Investment intensity and capital condition: different statistical concepts remain separate. */
const InvestmentDiagnostics=(()=>{
 const specs=[['R_88230ed30f2f2738_bf6a5a3983','Инвестиции в основной капитал','В фактически действовавших ценах, миллионов рублей'],['R_7e8fd799d1d06897_84c74d6e51','Валовой региональный продукт','Миллионов рублей'],['R_66b96177c45a01ad_bf6a5a3983','Индекс физического объема инвестиций в основной капитал','В сопоставимых ценах, в процентах к предыдущему году']];
 const finite=Number.isFinite,valid=v=>finite(v)&&v>=0;
 function sampleOf(rows,year,sample){return sample(rows.filter(r=>r.year===year).map(r=>({...r,original:r.value,value:0})))}
 function identity(r){
  const keys=['Версия','Уровень территории','ОКТМО','ОКАТО'];
  const parts=String(r?.note||'').split(' · '),values=keys.map(k=>{const matches=parts.filter(p=>p.startsWith(k+': '));return matches.length===1?matches[0].slice(k.length+2).trim():''});
  return values[0]&&values[1]&&values.slice(2).some(v=>v&&!['nan','None','0','-'].includes(v))?JSON.stringify(values):null;
 }
 function same(a,b){return !!a&&!!b&&a.region===b.region&&a.year===b.year&&identity(a)!==null&&identity(a)===identity(b)}
 function regional(investment,grp,volume,year,sample){
  const a=sampleOf(investment,year,sample),b=sampleOf(grp,year,sample),c=sampleOf(volume,year,sample);
  const rows=[...new Set([...a.out.keys(),...b.out.keys(),...c.out.keys()])].map(key=>{
   const i=a.out.get(key),g=b.out.get(key),v=c.out.get(key),anchor=i||g||v;
   const ratio=same(i,g)&&valid(i.original)&&valid(g.original)&&g.original>0?100*i.original/g.original:null;
   const growth=same(anchor,v)&&valid(v.original)?v.original-100:null;
   return {key,name:anchor.region,i,g,v,ratio:finite(ratio)?ratio:null,growth:finite(growth)?growth:null};
  });
  const sorted=rows.map(r=>r.ratio).filter(finite).sort((x,y)=>x-y),n=sorted.length,median=n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null;
  return {rows:rows.map(r=>({...r,relative:median>0&&finite(r.ratio)?r.ratio/median:null})),median,n,excluded:a.excluded+b.excluded+c.excluded,ambiguous:a.ambiguous+b.ambiguous+c.ambiguous};
 }
 function assets(records,year,wearThreshold,renewalThreshold){
  if(!valid(wearThreshold)||wearThreshold>100||!valid(renewalThreshold)||renewalThreshold>100)throw Error('Некорректные пороги');
  const codes=[...new Set(records.filter(r=>r.year===year&&r.code!=='TOTAL').map(r=>r.code))];
  return codes.map(code=>{const a=records.filter(r=>r.year===year&&r.code===code),r=a.length===1?a[0]:null,validPct=v=>valid(v)&&v<=100,w=r?.wear_pct,n=r?.renewal_pct;
   const state=!validPct(w)||!validPct(n)?'missing':w>=wearThreshold&&n<renewalThreshold?'both':w>=wearThreshold?'wear':n<renewalThreshold?'renewal':'neither';
   return {code,title:a[0].title,r,state};
  });
 }
 return {specs,identity,regional,assets};
})();
if(typeof module!=='undefined')module.exports=InvestmentDiagnostics;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('inv-diag-status');if(!status)return;
 const f=v=>Number.isFinite(v)?fmt(v):'—',table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r)tr.insertCell().textContent=v??'—'}host.replaceChildren(t)};
 let m;
 try{m=await Provenance.validateManifest(await load('data-manifest.json'))}catch(e){status.textContent='Манифест недоступен.';$('asset-diag-status').textContent='Манифест недоступен.';return}
 const get=name=>Provenance.get(m,name,root);
 const regional=async()=>{
  try{
   const h=await get('historical.json'),entries=await Promise.all(InvestmentDiagnostics.specs.map(async([code,title,unit])=>{
    const matches=h.data.series.filter(r=>r.code===code&&r.title===title&&r.unit===unit);
    if(matches.length!==1)throw Error('Нет однозначного ряда: '+title);
    const meta=matches[0],e=await get(meta.file);
    if(e.data.title!==title||e.data.unit!==unit||e.data.source!==meta.source||!Array.isArray(e.data.values))throw Error('Несовпадение паспорта: '+title);
    return {...e,meta};
   }));
   const [i,g,v]=entries,year=$('inv-diag-year'),sort=$('inv-diag-sort'),query=$('inv-diag-query'),exp=$('inv-diag-export');
   const years=[...new Set(i.data.values.map(r=>r.year))].filter(y=>g.data.values.some(r=>r.year===y)).sort((a,b)=>b-a);
   year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));year.disabled=!years.length;
   const draw=()=>{
    const y=Number(year.value),d=InvestmentDiagnostics.regional(i.data.values,g.data.values,v.data.values,y,RegionalStats.sample),q=query.value.trim().toLocaleLowerCase('ru'),metric=sort.value;
    const rows=d.rows.filter(r=>r.name.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>{const av=Number.isFinite(a[metric]),bv=Number.isFinite(b[metric]);return av!==bv?(av?-1:1):av?b[metric]-a[metric]||a.name.localeCompare(b.name,'ru'):a.name.localeCompare(b.name,'ru')});
    status.textContent='Год '+y+' · сопоставимых отношений: '+d.n+' из '+d.rows.length+' территорий · медиана '+f(d.median)+'% · исключено строк '+d.excluded+' · показано '+rows.length+'.';
    table($('inv-diag-table'),['Территория','Инвестиции, млн руб.','ВРП, млн руб.','Инвестиции / ВРП, %','Отношение к медиане','Реальное изменение инвестиций к пред. году, %'],rows.map(r=>[r.name,f(r.i?.original),f(r.g?.original),f(r.ratio),f(r.relative),f(r.growth)]));
    exp.disabled=!rows.length;exp.onclick=()=>csv('investment-diagnostics-'+y+'.csv',[
     ['Год','Территория','Инвестиции, млн руб.','ВРП, млн руб.','Индекс объёма, %','Инвестиции / ВРП, %','Медиана выборки, %','Отношение к медиане','Реальное изменение, %','Размер выборки','Источник инвестиций','Источник ВРП','Источник индекса','Координаты инвестиций','Координаты ВРП','Координаты индекса','Примечание инвестиций','Примечание ВРП','Примечание индекса','SHA-256 инвестиций','SHA-256 ВРП','SHA-256 индекса','Отпечаток манифеста'],...rows.map(r=>[y,r.name,r.i?.original,r.g?.original,r.v?.original,r.ratio,d.median,r.relative,r.growth,d.n,i.meta.source,g.meta.source,v.meta.source,[r.i?.sheet,r.i?.row,r.i?.column].join(' / '),[r.g?.sheet,r.g?.row,r.g?.column].join(' / '),[r.v?.sheet,r.v?.row,r.v?.column].join(' / '),r.i?.note,r.g?.note,r.v?.note,i.sha256,g.sha256,v.sha256,m.data_fingerprint])]);
   };
   year.onchange=sort.onchange=query.oninput=draw;draw();
  }catch(e){console.error(e);status.textContent='Сопоставимые проверенные ряды недоступны: '+String(e.message||e)}
 };
 const capital=async()=>{
  const status=$('asset-diag-status');
  try{
   const e=await get('capital-data.json'),data=e.data,year=$('asset-diag-year'),wear=$('asset-diag-wear'),renew=$('asset-diag-renew'),filter=$('asset-diag-filter'),exp=$('asset-diag-export');
   const labels={both:'Оба порога',wear:'Высокий износ',renewal:'Низкое обновление',neither:'Ни один порог',missing:'Нет сопоставимых данных'};
   for(const y of [...new Set(data.assets.map(r=>r.year))].sort((a,b)=>b-a))year.add(new Option(String(y),String(y)));
   function draw(){
    const y=Number(year.value),w=Number(wear.value),n=Number(renew.value),all=InvestmentDiagnostics.assets(data.assets,y,w,n),rows=all.filter(r=>!filter.value||r.state===filter.value);
    status.textContent='Срез '+y+' · оба порога: '+all.filter(r=>r.state==='both').length+' из '+all.length+' разделов · показано '+rows.length+'. Ручной снимок ежегодника '+data.edition+'.';
    table($('asset-diag-table'),['ОКВЭД2','Раздел','Износ, %','Обновление, %','Выбытие, %','Индекс физического объёма, %','Сигнал'],rows.map(x=>[x.code,x.title,f(x.r?.wear_pct),f(x.r?.renewal_pct),f(x.r?.disposal_pct),f(x.r?.volume_index),labels[x.state]]));
    exp.disabled=!rows.length;exp.onclick=()=>csv('capital-renewal-diagnostics-'+y+'.csv',[
     ['Год','Раздел','Название','Износ, %','Обновление, %','Выбытие, %','Индекс физического объёма, %','Порог износа, %','Порог обновления, %','Сигнал','Источник','Таблицы','Страницы','Статус проверки','SHA-256 JSON','Отпечаток манифеста'],...rows.map(x=>[y,x.code,x.title,x.r?.wear_pct,x.r?.renewal_pct,x.r?.disposal_pct,x.r?.volume_index,w,n,labels[x.state],x.r?.source,x.r?.tables,x.r?.pages,data.verification,e.sha256,m.data_fingerprint])]);
   }
   year.onchange=wear.onchange=renew.onchange=filter.onchange=draw;draw();
  }catch(e){console.error(e);status.textContent='Проверенный снимок основных фондов недоступен.'}
 };
 await Promise.all([regional(),capital()]);
});
