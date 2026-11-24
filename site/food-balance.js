const FoodBalance=(()=>{
 const keys=['production','imports','exports','stock_change','supply'];
 function balance(v){return keys.every(k=>Number.isFinite(v[k]))?v.production+v.imports-v.exports-v.stock_change-v.supply:null}
 function scenario(v,p){
  const gap=balance(v);
  if(gap===null||Math.abs(gap)>3||['production','imports','exports','supply'].some(k=>v[k]<0))throw Error('Исходный баланс неполон или не проходит проверку');
  for(const k of ['production','imports','exports','supply'])if(!Number.isFinite(p[k])||p[k]<-100||p[k]>300)throw Error('Изменения от −100 до 300%');
  const production=v.production*(1+p.production/100),imports=v.imports*(1+p.imports/100),exports=v.exports*(1+p.exports/100),need=v.supply*(1+p.supply/100);
  // Preserve baseline statistical discrepancy rather than generating a fictitious shock.
  const available=production+imports-exports-v.stock_change-gap;
  return {production,imports,exports,need,available,stock_change:v.stock_change,baseline_gap:gap,surplus:available-need,coverage:need>0?100*available/need:null,additional_import:Math.max(0,need-available)};
 }
 return {balance,scenario};
})();
if(typeof module!=='undefined')module.exports=FoodBalance;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('fbs-item'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'food-balance.json',root),d=verified.data;
  $('fbs-status').textContent=(d.mode==='official_archive'?'Прямой импорт архива FAOSTAT':'Начальный снимок оценок FAOSTAT из документальной реплики, не прямой импорт')+' · '+d.status+' · проверено '+(d.checked||'—')+' · успешная загрузка '+(d.success||'—')+'.';
  if(d.mode!=='official_archive'){const a=document.createElement('a');a.href=d.replica;a.textContent=' Документальная реплика';$('fbs-status').append(a)}
  const items=new Map(d.rows.map(r=>[r.code,r.title])),inputs={};for(const [k,t] of items)$('fbs-item').add(new Option(t,k));
  for(const k of ['production','imports','exports','supply']){const l=document.createElement('label'),i=document.createElement('input');l.className='builder-control';l.append(d.labels[k]+' — изменение, %');i.type='number';i.min='-100';i.max='300';i.step='any';i.value='0';l.append(i);$('fbs-inputs').append(l);inputs[k]=i;i.addEventListener('input',clear)}
  let selected;function clear(){$('fbs-result').textContent='Параметры изменены. Выполните расчёт.';$('fbs-export').disabled=true}
  function draw(){selected=d.rows.find(r=>r.code===$('fbs-item').value&&r.year===Number($('fbs-year').value));if(!selected)return;const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const s of ['Элемент','Тыс. т','Флаг','Примечание']){const th=document.createElement('th');th.textContent=s;th.scope='col';h.append(th)}for(const [k,title] of Object.entries(d.labels)){const tr=b.insertRow();for(const s of [title,fmt(selected.values[k]),selected.flags[k]||'—',selected.notes[k]||''])tr.insertCell().textContent=s}$('fbs-table').replaceChildren(t);const g=FoodBalance.balance(selected.values);$('fbs-check').textContent='Расхождение ресурсного равенства, тыс. т: '+fmt(g)+' · '+(g!==null&&Math.abs(g)<=3?'проверка пройдена':'сценарий недоступен');$('fbs-run').disabled=g===null||Math.abs(g)>3;clear()}
  function years(){const list=d.rows.filter(r=>r.code===$('fbs-item').value).map(r=>r.year).sort((a,b)=>b-a);$('fbs-year').replaceChildren(...list.map(y=>new Option(y,y)));draw()}
  $('fbs-item').addEventListener('change',years);$('fbs-year').addEventListener('change',draw);
  $('fbs-run').onclick=()=>{clear();try{const p=Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.valueAsNumber])),r=FoodBalance.scenario(selected.values,p);$('fbs-result').textContent='Предложение: '+fmt(r.available)+' тыс. т; потребность: '+fmt(r.need)+' тыс. т; сальдо: '+fmt(r.surplus)+' тыс. т; покрытие: '+fmt(r.coverage)+'%; дополнительный импорт при прочих неизменных: '+fmt(r.additional_import)+' тыс. т.';$('fbs-export').disabled=false;$('fbs-export').onclick=()=>csv('food-scenario.csv',[['Продукт',selected.title],['Год',selected.year],['Источник',selected.source],['Режим',d.mode],['Отпечаток',manifest.data_fingerprint],['SHA-256',verified.sha256],['Единица','тыс. т'],['Метод','P+M−X−ΔS−исходное расхождение; потребность D×(1+g/100)'],['Изменения, %',...Object.keys(p)],['Параметры',...Object.values(p)],['Результат',...Object.keys(r)],['Значения',...Object.values(r)]])}catch(e){$('fbs-result').textContent=e.message}};
  years();
 }catch(e){$('fbs-status').textContent='Набор не подтверждён: '+e.message}
});
