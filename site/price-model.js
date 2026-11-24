/* A fixed-coefficient cost propagation experiment, not a market price forecast. */
const PriceModel=(()=>{
 const sum=a=>a.reduce((s,v)=>s+v,0),finite=Number.isFinite;
 const calibration=typeof module!=='undefined'?require('./labor-calibration.js'):LaborCalibration;
 function linear(M,b){
  const n=b.length;
  if(!n||M.length!==n||M.some(r=>r.length!==n||r.some(v=>!finite(v)))||b.some(v=>!finite(v)))throw Error('Invalid linear system');
  const t=M.map((r,i)=>[...r,b[i]]);
  for(let j=0;j<n;j++){
   let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(t[i][j])>Math.abs(t[pivot][j]))pivot=i;
   if(Math.abs(t[pivot][j])<1e-12)throw Error('Singular price system');
   [t[j],t[pivot]]=[t[pivot],t[j]];
   const d=t[j][j];for(let k=j;k<=n;k++)t[j][k]/=d;
   for(let i=0;i<n;i++)if(i!==j){const c=t[i][j];for(let k=j;k<=n;k++)t[i][k]-=c*t[j][k]}
  }
  const x=t.map(r=>r[n]);
  const error=Math.max(...M.map((r,i)=>Math.abs(sum(r.map((v,j)=>v*x[j]))-b[i])));
  if(x.some(v=>!finite(v))||error>1e-8*Math.max(1,...b.map(Math.abs)))throw Error('Price equation residual too large');
  return x;
 }
 function matrix(m){
  const n=m.names.length;
  if(!n||m.A.length!==n||m.A.some(r=>r.length!==n||r.some(v=>!finite(v)||v<0))||[m.imported,m.residual,m.demand].some(r=>r.length!==n||r.some(v=>!finite(v))))throw Error('Invalid accounting data');
  const M=m.A.map((_,i)=>m.A.map((r,j)=>(i===j?1:0)-r[i]));
  const base=m.imported.map((v,i)=>v+m.residual[i]);
  const p0=linear(M,base);
  if(p0.some(v=>Math.abs(v-1)>1e-7))throw Error('Baseline identity failed');
  // Positive solution for a positive RHS certifies productive nonnegative A.
  const positive=linear(M,Array(n).fill(1));
  if(positive.some(v=>v<=0))throw Error('Unproductive coefficient matrix');
  return M;
 }
 function calculate(m,p){
  const n=m.names.length,M=matrix(m);
  if(!m.compatible||m.imported.some(v=>v<0)||m.residual.some(v=>v< -1e-9))throw Error('Negative accounting component; review baseline before price simulation');
  if(!finite(p.importShock)||p.importShock< -100||p.importShock>300||!Array.isArray(p.residualShock)||p.residualShock.length!==n||p.residualShock.some(v=>!finite(v)||v< -100||v>300))throw Error('Invalid cost shock');
  const directImport=m.imported.map(v=>v*p.importShock/100),directResidual=m.residual.map((v,i)=>v*p.residualShock[i]/100);
  const fullImport=linear(M,directImport),fullResidual=linear(M,directResidual);
  const index=fullImport.map((v,i)=>1+v+fullResidual[i]);
  if(index.some(v=>v< -1e-8||!finite(v)))throw Error('Invalid simulated price');
  const rows=m.names.map((name,i)=>({name,index:index[i]*100,change:(index[i]-1)*100,directImport:100*directImport[i],directResidual:100*directResidual[i],totalImport:100*fullImport[i],totalResidual:100*fullResidual[i],indirect:100*(fullImport[i]+fullResidual[i]-directImport[i]-directResidual[i])}));
  const denom=sum(m.demand);
  const basket=m.demand.every(v=>v>=0)&&denom>0?100*sum(index.map((v,i)=>v*m.demand[i]))/denom:null;
  return {rows,basket};
 }
 function labor(m,p){
  const M=matrix(m),n=m.names.length;
  if(!Array.isArray(p.hours)||p.hours.length!==n||p.hours.some(v=>!finite(v)||v<0||v>1e10)||!finite(p.rublesPerHour)||p.rublesPerHour<0||p.rublesPerHour>1e7)throw Error('Invalid labor inputs');
  const direct=[...p.hours],full=linear(M,direct);
  if(full.some(v=>v< -1e-9))throw Error('Invalid labor multiplier');
  return m.names.map((name,i)=>({name,directHours:direct[i],fullHours:full[i],indirectHours:full[i]-direct[i],conditionalRubles:full[i]*p.rublesPerHour}));
 }
 function parseHours(text,m){
  const rows=calibration.parseCSV(text),header=['group_id','group_name','year','output_million_rub','annual_hours','source'];
  if(!rows.length||rows.shift().join('\0')!==header.join('\0')||rows.length!==m.names.length)throw Error('Нужен заполненный шаблон по всем группам');
  const numeric=v=>/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim())?Number(v):NaN;
  const found=new Map();
  for(const row of rows){
   if(row.length!==6)throw Error('Неверное число столбцов');
   const [idText,name,year,xText,hText,source]=row,id=Number(idText),x=numeric(xText),hours=numeric(hText);
   if(!/^[1-9]\d*$/.test(idText)||id<1||id>m.names.length||found.has(id)||name!==m.names[id-1]||year!=='2021')throw Error('Неверная группа или базовый год');
   const base=m.output[id-1];
   if(!finite(base)||base<=0||!finite(x)||Math.abs(x-base)>1e-9*Math.max(1,base))throw Error('Выпуск не совпадает с балансом');
   if(!finite(hours)||hours<0||hours>1e13||!source.trim()||source.length>1000||/^[=+\-@]/.test(source.trim()))throw Error('Нужны часы и документированный источник');
   const intensity=hours/(base/1000);
   if(!finite(intensity)||intensity>1e10)throw Error('Недопустимый коэффициент часов');
   found.set(id,{id,name,year:2021,annualHours:hours,source:source.trim(),intensity});
  }
  return [...found.values()].sort((a,b)=>a.id-b.id);
 }
 return {linear,matrix,calculate,labor,parseHours};
})();
if(typeof module!=='undefined')module.exports=PriceModel;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('price-form'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=String(v)}}host.replaceChildren(t)};
 const field=(value,min,max,label)=>{const e=document.createElement('input');e.type='number';e.min=min;e.max=max;e.step='any';e.value=value;e.setAttribute('aria-label',label);return e};
 try{
  const m=await load('price-data.json'),cost=m.names.map(n=>field('0',-100,300,'Изменение остаточных затрат: '+n)),hours=m.names.map(n=>field('',0,1e10,'Часы на млрд рублей выпуска: '+n));
  table($('price-controls'),['Группа','Отечественные промежуточные затраты, %','Импортные промежуточные затраты, %','Остаточный компонент, %','Изменение остаточных затрат, %'],m.names.map((n,i)=>[n,fmt(100*m.domestic[i]),fmt(100*m.imported[i]),fmt(100*m.residual[i]),cost[i]]));
  table($('price-labor-controls'),['Группа','Прямые часы труда на млрд ₽ базового выпуска (ввод)'],m.names.map((n,i)=>[n,hours[i]]));
  const draw=()=>{
   $('price-results').replaceChildren();$('price-chart').replaceChildren();$('price-download').disabled=true;
   try{
    const p={importShock:$('price-import').valueAsNumber,residualShock:cost.map(e=>e.valueAsNumber)},r=PriceModel.calculate(m,p);
    $('price-status').textContent='Баланс 2021 проверен. Индекс условной корзины отечественного конечного спроса: '+fmt(r.basket)+' (база = 100). Не ИПЦ.';
    table($('price-results'),['Группа','Расчётный индекс','Изменение, %','Прямой импорт, п.п.','Полный импорт, п.п.','Полный остаточный компонент, п.п.','Косвенный эффект, п.п.'],r.rows.map(x=>[x.name,...[x.index,x.change,x.directImport,x.totalImport,x.totalResidual,x.indirect].map(fmt)]));
    const chart=$('price-chart'),max=Math.max(1,...r.rows.map(x=>Math.abs(x.change)));
    for(const x of [...r.rows].sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,8)){const d=document.createElement('div'),p=document.createElement('p'),track=document.createElement('div'),fill=document.createElement('div');d.className='dyn-bars';p.textContent=x.name+' · '+fmt(x.change)+'%';track.className='budget-bar-track';fill.className='budget-bar-fill';fill.style.width=Math.abs(x.change)/max*100+'%';if(x.change<0)fill.classList.add('price-negative');track.append(fill);d.append(p,track);chart.append(d)}
    $('price-download').disabled=false;$('price-download').onclick=()=>csv('cost-price-scenario.csv',[['Модель','Распространение затрат, баланс 2021; не прогноз'],['Источник',m.source],['Шок импортных затрат, %',p.importShock],['Группа','Шок остаточных затрат, %'],...m.names.map((n,i)=>[n,p.residualShock[i]]),['Индекс условной корзины',r.basket],['Группа','Индекс','Изменение, %','Прямой импорт, п.п.','Полный импорт, п.п.','Полный остаток, п.п.','Косвенный эффект, п.п.'],...r.rows.map(x=>[x.name,x.index,x.change,x.directImport,x.totalImport,x.totalResidual,x.indirect])]);
   }catch(e){$('price-status').textContent='Расчёт недоступен: '+e.message}
  };
  let hourRecords=null,fileToken=0;
  const hourStatus=$('price-hour-file-status');
  $('price-hour-file').addEventListener('change',async()=>{
   const input=$('price-hour-file'),file=input.files?.[0],token=++fileToken;input.value='';if(!file)return;
   try{if(file.size>200000)throw Error('Файл слишком большой');const r=PriceModel.parseHours(await file.text(),m);if(token!==fileToken)return;hourRecords=r;hours.forEach((e,i)=>e.value=String(r[i].intensity));hourStatus.textContent='Импортировано '+r.length+' групп. Источники заданы пользователем и требуют проверки.';laborDraw()}
   catch(e){if(token===fileToken)hourStatus.textContent='Файл не принят: '+e.message+'; прежние данные сохранены.'}
  });
  const laborDraw=()=>{
   $('price-labor-results').replaceChildren();$('price-labor-download').disabled=true;
   if(hourRecords&&hours.some((e,i)=>e.value===''||Number(e.value)!==hourRecords[i].intensity)){hourRecords=null;hourStatus.textContent='Часы изменены вручную; привязка к файлу снята.'}
   try{
    const p={hours:hours.map(e=>e.valueAsNumber),rublesPerHour:$('price-hour-value').valueAsNumber},r=PriceModel.labor(m,p);
    $('price-labor-status').textContent='Условный трудовой расчёт: только отечественные цепочки, пользовательские часы и оценка часа.';
    table($('price-labor-results'),['Группа','Прямые часы','Полные часы','Косвенные часы','Условная денежная оценка, ₽'],r.map(x=>[x.name,...[x.directHours,x.fullHours,x.indirectHours,x.conditionalRubles].map(fmt)]));
    $('price-labor-download').disabled=false;$('price-labor-download').onclick=()=>csv('labor-hour-valuation.csv',[['Модель','На млрд руб. базового отечественного конечного спроса; не рыночная цена'],['Источник баланса',m.source],['Условные рубли за час',p.rublesPerHour],['Происхождение часов',hourRecords?'Пользовательский CSV с источниками':'Ручные допущения'],['Группа','Прямые часы','Полные часы','Косвенные часы','Условная оценка, руб.','Источник годовых часов'],...r.map((x,i)=>[x.name,x.directHours,x.fullHours,x.indirectHours,x.conditionalRubles,hourRecords?.[i]?.source??''])]);
   }catch(e){$('price-labor-status').textContent='Введите часы по всем группам и условную оценку часа. Пустые данные не считаются нулём.'}
  };
  $('price-form').addEventListener('input',draw);$('price-form').addEventListener('submit',e=>e.preventDefault());$('price-controls').addEventListener('input',draw);$('price-apply').onclick=()=>{const e=$('price-residual');if(e.validity.valid&&Number.isFinite(e.valueAsNumber)){cost.forEach(x=>x.value=e.value);draw()}};$('price-reset').onclick=()=>{$('price-form').reset();cost.forEach(x=>x.value=0);draw()};
  $('price-labor-controls').addEventListener('input',()=>{fileToken++;laborDraw()});$('price-hour-value').addEventListener('input',laborDraw);draw();laborDraw();
 }catch(e){console.error(e);$('price-status').textContent='Не удалось загрузить базовые коэффициенты.'}
});
