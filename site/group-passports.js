const GroupPassports=(()=>{
 function change(a,b,unit){if(!Number.isFinite(a)||!Number.isFinite(b))return null;return unit==='%'?b-a:a>0?(b-a)/a*100:null}
 return {change};
})();
if(typeof module!=='undefined')module.exports=GroupPassports;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('group-passports');if(!host)return;
 const status=$('group-status'),pick=$('group-pick'),metric=$('group-metric'),table=$('group-table'),chart=$('group-chart'),detail=$('group-detail'),exp=$('group-export');
 const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('ru',{maximumFractionDigits:2}):'—';
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(m,'group-passports.json',root),d=entry.data;
  status.textContent='Документальный снимок · проверка '+d.checked+' · '+d.groups.length+' групп. Не автоматическое обновление и не общероссийский рейтинг.';
  pick.replaceChildren(...d.groups.map(g=>new Option(g.name,g.id)));
  const params=new URLSearchParams(location.search);if(d.groups.some(g=>g.id===params.get('group')))pick.value=params.get('group');
  function drawChart(g){
   chart.replaceChildren();const p=g.metrics.find(x=>x.id===metric.value);if(!p)return;
   chart.append(node('h3',p.label+' · '+p.unit));
   const max=Math.max(0,...p.observations.map(r=>Number(r.value))),bars=node('div','');bars.className='rm-composition';
   for(const r of p.observations){const line=node('div','');line.className='rm-composition-row';const track=node('div','');track.className='rm-composition-track';const fill=node('div','');fill.className='rm-composition-fill';fill.style.width=(max>0?Math.max(0,100*Number(r.value)/max):0)+'%';track.append(fill);line.append(node('span',String(r.year)),track,node('strong',fmt(r.value)));bars.append(line)}chart.append(bars);
  }
  function draw(){
   const g=d.groups.find(x=>x.id===pick.value);if(!g)return;
   detail.replaceChildren(node('h3',g.name+' · '+g.sector),node('p',g.role),node('p','Периметр: консолидированная группа. Стандарт: МСФО. Определения показателей — по эмитенту.'));
   const source=node('a','Официальный источник · '+g.section);source.href=g.source;detail.append(source);
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const v of ['Показатель','Единица','Год','Значение','Изменение к предыдущему году']){const th=node('th',v);th.scope='col';h.append(th)}
   for(const p of g.metrics)p.observations.forEach((r,i)=>{const prev=p.observations[i-1],delta=prev&&prev.year===r.year-1?GroupPassports.change(Number(prev.value),Number(r.value),p.unit):null;const tr=b.insertRow();for(const v of [p.label,p.unit,r.year,fmt(r.value),delta==null?'—':fmt(delta)+(p.unit==='%'?' п.п.':'%')])tr.insertCell().textContent=v});
   table.replaceChildren(t);metric.replaceChildren(...g.metrics.map(x=>new Option(x.label,x.id)));metric.onchange=()=>drawChart(g);drawChart(g);
   exp.disabled=false;exp.onclick=()=>csv('group-'+g.id+'.csv',[['Группа','Отрасль','Периметр','Стандарт','Код','Показатель','Единица','Год','Значение','Источник','Раздел','Проверено','SHA-256 JSON','Отпечаток манифеста'],...g.metrics.flatMap(p=>p.observations.map(r=>[g.name,g.sector,g.scope,g.standard,p.id,p.label,p.unit,r.year,r.value,g.source,g.section,d.checked,entry.sha256,m.data_fingerprint]))]);
  }
  pick.onchange=draw;draw();
 }catch(e){status.textContent='Паспорта недоступны: '+String(e.message||e)}
});
