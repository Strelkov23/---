/* Compact view of the existing aggregated Technology engine. */
const IVTech=(()=>{
 const T=typeof module!=='undefined'?require('./technology.js'):Technology;
 function params(n,group,material,imported,demand){
  if(!Number.isInteger(n)||n<1||!Number.isInteger(group)||group< -1||group>=n||![material,imported,demand].every(Number.isFinite))throw Error('Недопустимые параметры');
  const vector=v=>Array.from({length:n},(_,i)=>group===-1||group===i?v:0);
  return {material:vector(material),imported:vector(imported),productivity:Array(n).fill(0),demand:Array(n).fill(demand),hours:null};
 }
 function compare(m,p){const r=T.calculate(m,p),a=r.base,b=r.changed;return {base:a,changed:b,rows:m.names.map((name,i)=>({name,base:a.output[i],changed:b.output[i],delta:b.output[i]-a.output[i],importBase:a.imports[i],importChanged:b.imports[i],costIndex:100*r.structure.costs[i]})),delta:{output:b.totalOutput-a.totalOutput,domestic:b.totalDomestic-a.totalDomestic,imports:b.totalImports-a.totalImports,basket:a.basket===null||b.basket===null?null:b.basket-a.basket}}}
 return {params,compare};
})();
if(typeof module!=='undefined')module.exports=IVTech;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),pick=$('iv-tech-group');if(!pick)return;
 const status=$('iv-tech-status'),ids=['material','imported','demand'],fmt=x=>x===null?'—':x.toLocaleString('ru-RU',{maximumFractionDigits:2});
 try{const m=await load('price-data.json');pick.add(new Option('Все группы','-1'));m.names.forEach((name,i)=>pick.add(new Option(name,String(i))));
 function draw(){
 const v=ids.map(k=>Number($('iv-tech-'+k).value));ids.forEach((k,i)=>$('iv-tech-'+k+'-label').textContent=v[i]+'%');
 const cards=$('iv-tech-results'),body=$('iv-tech-rows'),chart=$('iv-tech-chart');cards.replaceChildren();body.replaceChildren();chart.replaceChildren();$('iv-tech-csv').disabled=true;
 let p,r;try{p=IVTech.params(m.names.length,Number(pick.value),...v);r=IVTech.compare(m,p)}catch(e){status.textContent='Сценарий не подтверждён: '+e.message;return}
 for(const [label,key] of [['Требуемый валовой выпуск','output'],['Отечественные промежуточные затраты','domestic'],['Промежуточный импорт','imports'],['Индекс условных затрат корзины','basket']]){const a=node('article','');a.className='pulse-card';a.append(node('h3',label),node('strong',fmt(r.delta[key])+(key==='basket'?' п.п.':' млрд ₽')));cards.append(a)}
 status.textContent='Баланс пересчитан: конечный спрос одинаков в двух вариантах. Максимальная невязка '+r.changed.residual.toExponential(2)+' млрд ₽. Снижение требуемого выпуска при неизменном спросе может отражать экономию промежуточных ресурсов; это не падение ВВП.';
 for(const x of r.rows){const tr=body.insertRow();for(const value of [x.name,x.base,x.changed,x.delta,x.importBase,x.importChanged,x.costIndex])tr.insertCell().textContent=typeof value==='number'?fmt(value):value}
 const largest=[...r.rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,6),max=Math.max(1,...largest.map(x=>Math.abs(x.delta)));
 for(const x of largest){const d=node('div','');d.className='policy-chart-row';d.append(node('p',x.name+' · '+fmt(x.delta)+' млрд ₽'));const meter=document.createElement('meter');meter.min=-max;meter.max=max;meter.value=x.delta;meter.style.width='100%';meter.setAttribute('aria-label',x.name+' изменение выпуска');d.append(meter);chart.append(d)}
 $('iv-tech-csv').disabled=false;$('iv-tech-csv').onclick=()=>csv('iv-technology-2021.csv',[['База','2021'],['Версия',typeof version==='undefined'?'':version],['Группа',pick.options[pick.selectedIndex].text],...ids.map((k,i)=>[k,v[i]]),['Группа','Базовый выпуск','Изменённый выпуск','Разница','Импорт базы','Импорт сценария','Индекс затрат'],...r.rows.map(x=>[x.name,x.base,x.changed,x.delta,x.importBase,x.importChanged,x.costIndex])]);
 }
 pick.disabled=false;pick.onchange=draw;ids.forEach(k=>{$('iv-tech-'+k).disabled=false;$('iv-tech-'+k).oninput=draw});$('iv-tech-reset').onclick=()=>{pick.value='-1';ids.forEach((k,i)=>$('iv-tech-'+k).value=i===2?10:0);draw()};draw();
 }catch(e){status.textContent='Данные технологии недоступны: '+e.message}
});
