/* Compare two globally optimized investment paths using the existing worker. */
const IVTrajectory=(()=>{
 function parameters(n,v,investment){
  if(!Number.isInteger(n)||n<1||!Number.isInteger(v.years)||v.years<1||v.years>5||![v.growth,v.spare,v.capitalRatio,v.depreciation,v.importLimit,investment].every(Number.isFinite))throw Error('Недопустимые параметры');
  let labor=null;
  if(v.laborEnabled){
   if(!Number.isFinite(v.laborCap)||v.laborCap<0||v.laborCap>1e9||!Number.isFinite(v.laborProductivity)||v.laborProductivity< -10||v.laborProductivity>20||!Number.isFinite(v.laborIntensity)||v.laborIntensity<=0||v.laborIntensity>1e6)throw Error('Проверьте условные трудовые коэффициенты');
   labor={cap:v.laborCap,productivity:v.laborProductivity,intensity:Array(n).fill(v.laborIntensity)};
  }
  return {years:v.years,growth:Array(n).fill(v.growth),spare:v.spare,capitalRatio:v.capitalRatio,depreciation:v.depreciation,importLimit:v.importLimit,investment,allocation:'maximin',labor}
 }
 function compare(a,b){
  if(!a?.rows?.length||a.rows.length!==b?.rows?.length||a.objective!==b.objective)throw Error('Несопоставимые результаты');
  const rows=a.rows.map((x,i)=>{const y=b.rows[i];if(x.year!==y.year||![x.alpha,y.alpha,x.actualDemand,y.actualDemand,x.investment,y.investment].every(Number.isFinite))throw Error('Некорректный период');return {year:x.year,a:x.alpha,b:y.alpha,deltaPP:100*(y.alpha-x.alpha),demandA:x.actualDemand,demandB:y.actualDemand,investmentA:x.investment,investmentB:y.investment,laborA:Number.isFinite(x.labor)?x.labor:null,laborB:Number.isFinite(y.labor)?y.labor:null,bindingA:x.binding,bindingB:y.binding}});
  return {rows,deltaScore:b.score-a.score,terminalDelta:rows.at(-1).deltaPP,investmentA:rows.reduce((s,r)=>s+r.investmentA,0),investmentB:rows.reduce((s,r)=>s+r.investmentB,0)}
 }
 return {parameters,compare};
})();
if(typeof module!=='undefined')module.exports=IVTrajectory;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),button=$('trajectory-run');if(!button)return;
 const status=$('trajectory-status'),ids=['years','growth','spare','capitalRatio','depreciation','importLimit','investmentA','investmentB'],objective=$('trajectory-objective'),fmt=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 const laborOn=$('trajectory-laborEnabled'),laborIds=['laborCap','laborIntensity','laborProductivity'];let worker=null,serial=0,model=null;
 function invalidate(){serial++;if(worker){worker.terminate();worker=null}button.disabled=!model;$('trajectory-export').disabled=true;$('trajectory-results').replaceChildren();$('trajectory-rows').replaceChildren();$('trajectory-chart').replaceChildren();status.textContent=model?'Параметры изменены. Рассчитайте оба варианта.':'Загрузка баланса…'}
 for(const id of ids){const x=$('trajectory-'+id);x.oninput=()=>{$('trajectory-'+id+'-label').textContent=x.value;invalidate()}}
 function syncLabor(){for(const k of laborIds)$('trajectory-'+k).disabled=!model||!laborOn.checked;$('trajectory-labor-note').textContent=laborOn.checked?'Единая условная трудоёмкость всех 19 групп, не измеренный отраслевой коэффициент. Лимит одинаков в A и B.':'Трудовое ограничение выключено; модель не подтверждает доступность трудовых ресурсов.'}
 laborOn.onchange=()=>{syncLabor();invalidate()};
 for(const k of laborIds){const e=$('trajectory-'+k);e.oninput=()=>{const label=$('trajectory-'+k+'-label');if(label)label.textContent=e.value;invalidate()}}
 objective.onchange=invalidate;
 function run(p,goal,token,onDone){try{worker=new Worker('global-plan-worker.js');worker.onmessage=e=>{if(token!==serial)return;worker.terminate();worker=null;if(e.data.error){status.textContent='Оптимум не подтверждён: '+e.data.error;button.disabled=false;return}onDone(e.data.result)};worker.onerror=()=>{if(token!==serial)return;worker.terminate();worker=null;status.textContent='Не удалось выполнить вычисление.';button.disabled=false};worker.postMessage({m:model,p,objective:goal})}catch(e){status.textContent='Рабочий поток недоступен: '+e.message;button.disabled=false}}
 function display(a,b,v,goal){let r;try{r=IVTrajectory.compare(a,b)}catch(e){status.textContent=e.message;button.disabled=false;return}const cards=$('trajectory-results');for(const [label,value,unit] of [['Целевой результат A',a.score,' млрд ₽'],['Целевой результат B',b.score,' млрд ₽'],['Разница B − A',r.deltaScore,' млрд ₽'],['Разница покрытия цели в конце',r.terminalDelta,' п.п.']]){const card=node('article','');card.className='pulse-card';card.append(node('h3',label),node('strong',fmt(value)+unit));cards.append(card)}
 const tbody=$('trajectory-rows'),chart=$('trajectory-chart');for(const x of r.rows){const tr=tbody.insertRow();for(const value of [x.year,100*x.a,100*x.b,x.deltaPP,x.demandA,x.demandB,x.investmentA,x.investmentB,x.laborA??'—',x.laborB??'—',x.bindingA.join('; ')||'—',x.bindingB.join('; ')||'—'])tr.insertCell().textContent=typeof value==='number'?fmt(value):value;
 const block=node('div','');block.className='policy-chart-row';block.append(node('strong','Период '+x.year));for(const [label,value] of [['Вариант A',x.a],['Вариант B',x.b]]){const line=node('div','');line.className='hh-bar-row';const meter=document.createElement('meter');meter.min=0;meter.max=1;meter.value=value;meter.setAttribute('aria-label',label+': '+fmt(100*value)+'%');line.append(node('span',label),meter,node('span',fmt(100*value)+'%'));block.append(line)}chart.append(block)}
 status.textContent='Оба решения подтверждены ядром. Невязки оптимальности A: '+a.dualityGap.toExponential(2)+', B: '+b.dualityGap.toExponential(2)+'. Инвестиции за горизонт: '+fmt(r.investmentA)+' / '+fmt(r.investmentB)+' млрд ₽. '+(v.laborEnabled?'Единый условный лимит дополнительных человеко-лет: '+fmt(v.laborCap)+' за период.':'Трудовой лимит не задан.')+' Дополнительный спрос, не ВВП.';button.disabled=false;$('trajectory-export').disabled=false;
 $('trajectory-export').onclick=()=>csv('iv-global-trajectory.csv',[['База','2021'],['Версия',typeof version==='undefined'?'':version],['Цель',goal],...Object.entries(v),['Период','Доля A %','Доля B %','Разница п.п.','Спрос A','Спрос B','Инвестиции A','Инвестиции B','Человеко-лет A','Человеко-лет B','Ограничения A','Ограничения B'],...r.rows.map(x=>[x.year,100*x.a,100*x.b,x.deltaPP,x.demandA,x.demandB,x.investmentA,x.investmentB,x.laborA,x.laborB,x.bindingA.join('; '),x.bindingB.join('; ')])])
 }
 button.onclick=()=>{invalidate();const token=serial,v=Object.fromEntries(ids.map(k=>[k,Number($('trajectory-'+k).value)])),goal=objective.value;v.laborEnabled=laborOn.checked;if(v.laborEnabled){for(const k of laborIds)v[k]=$('trajectory-'+k).valueAsNumber;}let a,b;try{a=IVTrajectory.parameters(model.names.length,v,v.investmentA);b=IVTrajectory.parameters(model.names.length,v,v.investmentB)}catch(e){status.textContent=e.message;return}button.disabled=true;status.textContent='Оптимизация варианта A…';run(a,goal,token,x=>{status.textContent='Оптимизация варианта B…';run(b,goal,token,y=>display(x,y,v,goal))})};
 window.addEventListener('pagehide',()=>{serial++;if(worker)worker.terminate()});
 try{model=await load('sectors.json');if(model.names.length!==19)throw Error('Неожиданный размер баланса');ids.forEach(k=>$('trajectory-'+k).disabled=false);objective.disabled=laborOn.disabled=false;syncLabor();invalidate()}catch(e){model=null;status.textContent='Баланс недоступен: '+e.message}
});
