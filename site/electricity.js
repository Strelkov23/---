const Electricity=(()=>{
 function scenario(row,g,c){
  if([g,c].some(v=>!Number.isFinite(v)||v< -100||v>300)||!Number.isInteger(row.year)||[row.values.generation,row.values.consumption].some(v=>!Number.isFinite(v)||v<=0))throw Error('Недопустимые параметры');
  const leap=row.year%4===0&&(row.year%100!==0||row.year%400===0),hours=24*(leap?366:365);
  const base=row.values.generation-row.values.consumption,gen=row.values.generation*(1+g/100),need=row.values.consumption*(1+c/100),available=gen-base;
  return {gen,need,base_difference:base,available,gap:available-need,additional_generation:Math.max(0,need-available),mean_required_gw:1000*need/hours,hours};
 }
 return {scenario};
})();
if(typeof module!=='undefined')module.exports=Electricity;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('electric-scope'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—';
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),verified=await Provenance.get(manifest,'electricity.json',root),d=verified.data;
  $('electric-status').textContent=d.notes+' · Записей: '+d.rows.length+' · прямой импорт: '+d.rows.filter(x=>x.mode==='direct').length;
  for(const c of d.checks){const p=document.createElement('p');p.textContent=c.year+': '+c.status+' · проверка '+(c.checked||'—')+' · успешная '+(c.success||'—');$('electric-checks').append(p)}
  const scope=$('electric-scope'),year=$('electric-year');for(const [k,t] of Object.entries(d.scopes))scope.add(new Option(t,k));
  const clear=()=>{$('electric-result').textContent='Параметры изменены. Выполните расчёт.';$('electric-export').disabled=true};
  function draw(){
   const rows=d.rows.filter(r=>r.scope===scope.value),t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const s of ['Год','Выработка, ТВт·ч','Потребление, ТВт·ч','Мощность на конец года, ГВт','Выработка минус потребление, ТВт·ч','Режим','Источник']){const th=document.createElement('th');th.textContent=s;th.scope='col';h.append(th)}
   for(const r of rows){const tr=b.insertRow();for(const s of [r.year,fmt(r.values.generation),fmt(r.values.consumption),fmt(r.values.capacity),fmt(r.values.generation-r.values.consumption),r.mode==='direct'?'Прямой импорт':'Документальный снимок'])tr.insertCell().textContent=s;const a=document.createElement('a');a.href=r.source;a.textContent='Сводка СО ЕЭС';tr.insertCell().append(a)}
   $('electric-table').replaceChildren(t);year.replaceChildren(...rows.map(r=>new Option(r.year,r.year)));year.value=rows.at(-1).year;
   const host=$('electric-chart');host.replaceChildren();const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','Выработка и потребление в ТВт·ч');
   const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;svg.append(e)};
   const max=Math.max(...rows.flatMap(r=>[r.values.generation,r.values.consumption]))*1.1,step=480/rows.length,w=Math.min(55,step*.32),y=v=>210-v/max*175;
   for(let i=0;i<=4;i++){const v=max*i/4;shape('line',{x1:95,x2:575,y1:y(v),y2:y(v),stroke:'#d4dcdf'});shape('text',{x:88,y:y(v)+4,'text-anchor':'end','font-size':11},fmt(v))}
   rows.forEach((r,i)=>{const x=95+step*(i+.5);for(const [k,j,col] of [['generation',0,'#35658b'],['consumption',1,'#006c69']])shape('rect',{x:x+(j-1)*w,y:y(r.values[k]),width:w-2,height:210-y(r.values[k]),fill:col});shape('text',{x,y:232,'text-anchor':'middle','font-size':12},r.year)});
   host.append(svg);const p=document.createElement('p');p.textContent='Синий — выработка; зелёный — потребление. Шкала от нуля.';host.append(p);chartTools(host,d.scopes[scope.value]+' — годовая энергия','ТВт·ч',rows.map(r=>r.year),['generation','consumption'].map(k=>({name:d.labels[k],code:k,values:rows.map(r=>r.values[k])})),{source:'СО ЕЭС, годовые сводки; SHA-256 '+verified.sha256,url:rows.at(-1).source});clear();
  }
  scope.addEventListener('change',draw);for(const id of ['electric-year','electric-g','electric-c'])$(id).addEventListener('input',clear);
  $('electric-run').onclick=()=>{clear();try{const row=d.rows.find(r=>r.scope===scope.value&&r.year===Number(year.value)),g=$('electric-g').valueAsNumber,c=$('electric-c').valueAsNumber,r=Electricity.scenario(row,g,c);$('electric-result').textContent='Выработка: '+fmt(r.gen)+' ТВт·ч; потребность: '+fmt(r.need)+'; условное доступное предложение: '+fmt(r.available)+'; сальдо: '+fmt(r.gap)+' ТВт·ч; дополнительная выработка: '+fmt(r.additional_generation)+' ТВт·ч. Средняя мощность потребления: '+fmt(r.mean_required_gw)+' ГВт (не пик).';$('electric-export').disabled=false;$('electric-export').onclick=()=>csv('electricity-scenario.csv',[['Год',row.year],['Охват',row.title],['Источник',row.source],['Метод','1.0: G(1+g/100)−(G−C)−C(1+c/100)'],['Шок выработки, %',g],['Шок потребления, %',c],['Отпечаток',manifest.data_fingerprint],['SHA-256',verified.sha256],Object.keys(r),Object.values(r)])}catch(e){$('electric-result').textContent=e.message}};
  draw();$('electric-run').disabled=false;
 }catch(e){$('electric-status').textContent='Набор не подтверждён: '+e.message}
});
