const ElectricityBalance=(()=>{
function metrics(v){
 const g=v.electricity_generation_twh,n=v.electricity_net_imports_twh,d=v.electricity_demand_twh;
 return {gap:[g,n,d].every(Number.isFinite)?g+n-d:null,
  netShare:Number.isFinite(n)&&Number.isFinite(d)&&d>0?100*n/d:null};
}
function scenario(v,p){
 const g=v.electricity_generation_twh,n=v.electricity_net_imports_twh,d=v.electricity_demand_twh,m=metrics(v);
 if(m.gap===null||Math.abs(m.gap)>Math.max(0.1,0.001*d)||g<0||d<0)throw Error('Нет полного согласованного исходного баланса');
 if(!Number.isFinite(p.g)||p.g< -100||p.g>300||!Number.isFinite(p.d)||p.d< -100||p.d>300||!Number.isFinite(p.n))throw Error('Введите допустимые изменения');
 const generation=g*(1+p.g/100),demand=d*(1+p.d/100),net=n+p.n;
 const available=generation+net-m.gap;
 return {generation,demand,net,available,gap:available-demand,requiredNetImport:demand-generation+m.gap,baselineGap:m.gap};
}
function fuelSummary(v,b,keys){const totalOf=x=>keys.every(k=>Number.isFinite(x[k])&&x[k]>=0)?keys.reduce((s,k)=>s+x[k],0):null;const total=totalOf(v),base=totalOf(b);return {total,change:total!==null&&base!==null?total-base:null,growth:total!==null&&base!==null&&base>0?100*(total/base-1):null,shares:Object.fromEntries(keys.map(k=>[k,total>0?100*v[k]/total:null]))}}
return {metrics,scenario,fuelSummary};
})();
if(typeof module!=='undefined')module.exports=ElectricityBalance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('electricity-year'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const run=$('electricity-run'),exportButton=$('electricity-export'),year=$('electricity-year');
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'electricity-balance.json',root),d=verified.data;
  $('electricity-status').textContent=d.status+' · последняя попытка: '+(d.checked||'—')+' · успешная: '+(d.success||'—')+' · лет с наблюдениями: '+d.rows.length;
  renderFuels(d,manifest,verified,$,fmt);
  if(!d.rows.length)return;
  const byYear=new Map(d.rows.map(r=>[r.year,r.values])),min=Math.min(...byYear.keys()),max=Math.max(...byYear.keys()),years=Array.from({length:max-min+1},(_,i)=>min+i),keys=Object.keys(d.metrics);
  for(const r of d.rows.filter(r=>keys.some(k=>Number.isFinite(r.values[k]))).slice().reverse())year.add(new Option(r.year,r.year));
  const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();
  for(const label of ['Год',...Object.values(d.metrics),'Выработка + чистый импорт − спрос, ТВт·ч','Чистый импорт / спрос, %']){
   const th=document.createElement('th');th.scope='col';th.textContent=label;h.append(th)
  }
  for(const y of years.slice().reverse()){
   const v=byYear.get(y)||{},m=ElectricityBalance.metrics(v),tr=b.insertRow();
   for(const val of [y,...keys.map(k=>fmt(v[k])),fmt(m.gap),fmt(m.netShare)])tr.insertCell().textContent=val
  }
  $('electricity-table').replaceChildren(t);
  chartTools($('electricity-charts'),'Электроэнергетика России — выработка и спрос','ТВт·ч',years,keys.filter(k=>k!=='electricity_net_imports_twh').map(k=>({name:d.metrics[k],code:k,values:years.map(y=>byYear.get(y)?.[k]??null)})),{source:'OWID Energy, Ember и другие источники',url:d.metadata,display:true});
  chartTools($('electricity-charts'),'Электроэнергетика России — чистый импорт','ТВт·ч',years,[{name:d.metrics.electricity_net_imports_twh,code:'electricity_net_imports_twh',values:years.map(y=>byYear.get(y)?.electricity_net_imports_twh??null)}],{source:'OWID Energy, Ember',url:d.metadata,display:true});
  function clear(){
   exportButton.disabled=true;
   const v=byYear.get(Number(year.value))||{};
   try{ElectricityBalance.scenario(v,{g:0,d:0,n:0});run.disabled=false;$('electricity-result').textContent='Введите параметры сценария.'}
   catch(e){run.disabled=true;$('electricity-result').textContent=e.message}
  }
  for(const id of ['electricity-year','electricity-g','electricity-n','electricity-d'])$(id).addEventListener('input',clear);
  run.onclick=()=>{clear();try{
   const v=byYear.get(Number(year.value)),p={g:$('electricity-g').valueAsNumber,n:$('electricity-n').valueAsNumber,d:$('electricity-d').valueAsNumber},r=ElectricityBalance.scenario(v,p);
   $('electricity-result').textContent='Предложение: '+fmt(r.available)+' ТВт·ч; спрос: '+fmt(r.demand)+'; сальдо: '+fmt(r.gap)+'; необходимый чистый импорт при заданной выработке: '+fmt(r.requiredNetImport)+' ТВт·ч.';
   exportButton.disabled=false;exportButton.onclick=()=>csv('electricity-scenario.csv',[['Год',year.value],['Источник',d.source],['SHA-256 исходного CSV',d.source_sha256],['SHA-256 JSON',verified.sha256],['Отпечаток',manifest.data_fingerprint],['Метод','Выработка + чистый импорт − исходное расхождение'],['Исходные значения',...Object.keys(v)],['ТВт·ч',...Object.values(v)],['Шок выработки, %',p.g],['Изменение чистого импорта, ТВт·ч',p.n],['Шок спроса, %',p.d],['Результаты, ТВт·ч',...Object.keys(r)],['Значения',...Object.values(r)]])
  }catch(e){$('electricity-result').textContent=e.message}};
  clear();
 }catch(e){$('electricity-status').textContent='Набор не подтверждён: '+e.message}
});

function renderFuels(d,manifest,verified,$,fmt){
 const host=$('fuel-table'),status=$('fuel-status'),exp=$('fuel-export');if(!host)return;
 const labels=d.fuels||{},keys=Object.keys(labels),src=d.rows.filter(r=>keys.some(k=>Number.isFinite(r.values[k])));
 if(keys.length!==3||!src.length){status.textContent='Нет загруженных наблюдений по добыче; '+d.status;return}
 const byYear=new Map(src.map(r=>[r.year,r.values])),start=Math.min(...byYear.keys()),end=Math.max(...byYear.keys()),years=Array.from({length:end-start+1},(_,i)=>start+i);
 const rows=years.map(y=>{const v=byYear.get(y)||{};return {y,v,...ElectricityBalance.fuelSummary(v,byYear.get(y-1)||{},keys)}});
 const table=document.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
 for(const label of ['Год',...Object.values(labels),'Сумма трёх топлив, ТВт·ч','Изменение суммы, ТВт·ч','Прирост суммы, %',...Object.values(labels).map(x=>x+' — доля, %')]){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th)}
 for(const r of rows.slice().reverse()){const tr=body.insertRow();for(const v of [r.y,...keys.map(k=>fmt(r.v[k])),fmt(r.total),fmt(r.change),fmt(r.growth),...keys.map(k=>fmt(r.shares[k]))])tr.insertCell().textContent=v}
 host.replaceChildren(table);status.textContent='Полных лет: '+rows.filter(r=>r.total!==null).length+' из '+rows.length+' · '+d.status;
 chartTools($('fuel-charts'),'Добыча ископаемого топлива России — энергосодержание','ТВт·ч',years,keys.map(k=>({name:labels[k],code:k,values:rows.map(r=>r.v[k]??null)})),{source:'OWID Energy, Energy Institute и другие источники',url:d.metadata,display:true});
 exp.disabled=false;exp.onclick=()=>csv('fossil-production.csv',[
 ['Год',...keys.map(k=>k+' (ТВт·ч)'),'Сумма трёх топлив (ТВт·ч)','Изменение суммы (ТВт·ч)','Прирост суммы (%)',...keys.map(k=>k+' доля (%)'),'Источник','SHA-256 CSV','SHA-256 JSON','Отпечаток набора'],
 ...rows.map(r=>[r.y,...keys.map(k=>r.v[k]??null),r.total,r.change,r.growth,...keys.map(k=>r.shares[k]),d.source,d.source_sha256,verified.sha256,manifest.data_fingerprint])]);
}
