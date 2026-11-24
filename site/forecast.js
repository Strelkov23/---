document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('forecast-series'))return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:8}):'—';
 const table=(host,headers,rows)=>{const t=document.createElement('table'),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=document.createElement('th');th.scope='col';th.textContent=v;h.append(th)}for(const row of rows){const tr=b.insertRow();row.forEach(v=>tr.insertCell().textContent=String(v))}host.replaceChildren(t)};
 try{
  const data=await load('forecast.json'),sel=$('forecast-series'),hor=$('forecast-horizon');
  data.series.forEach(s=>sel.add(new Option(s.title,s.code)));
  const current=()=>data.series.find(s=>s.code===sel.value);
  function refresh(){const s=current();hor.replaceChildren(...s.results.map(r=>new Option(String(r.horizon)+(s.monthly?' мес.':' г.'),String(r.horizon))));hor.disabled=!s.results.length;draw()}
  function draw(){
   const s=current(),r=s.results.find(x=>x.horizon===Number(hor.value));
   for(const id of ['forecast-metrics','forecast-chart','forecast-methods','forecast-holdout','forecast-source','forecast-range-status','forecast-range-check'])$(id).replaceChildren();
   $('forecast-export').disabled=true;
   const source=document.createElement('a');source.href=s.source;source.textContent='Исходный ряд';
   $('forecast-source').append(source,' · Последняя успешная проверка: '+(s.checked||'не указана')+' · Сборка: '+s.built);
   $('forecast-status').textContent=s.status+' · '+s.used_count+' непрерывных наблюдений из '+s.input_count+' · '+(s.first||'—')+' — '+(s.last||'—')+' · '+s.unit;
   if(!r)return;
   const score=r.holdout[r.selected];
   const elapsed=r.target<(s.monthly?s.built.slice(0,7):s.built.slice(0,4));
   if(elapsed)$('forecast-status').append(' · Целевой период уже завершён: это оценка отсутствующего наблюдения, не прогноз будущего.');
   for(const [label,v] of [['Целевой период',r.target],['Прогноз',fmt(r.point)],['Описательный диапазон',fmt(r.low)+' … '+fmt(r.high)],['Контрольная MAE',fmt(score.mae)],['Улучшение MAE к последнему значению',Number.isFinite(r.skill_vs_last_pct)?fmt(r.skill_vs_last_pct)+'%':'Не определено']]){const d=document.createElement('div'),b=document.createElement('b'),a=document.createElement('span');d.className='metric';b.textContent=v;a.textContent=label;d.append(b,a);$('forecast-metrics').append(d)}
   table($('forecast-methods'),['Метод','Ранняя MAE','Контрольная MAE','Контрольная RMSE','Смещение (прогноз − факт)','Число контрольных ошибок'],Object.keys(r.development).map(k=>[(k===r.selected?'Выбран: ':'')+data.methods[k],fmt(r.development[k].mae),fmt(r.holdout[k].mae),fmt(r.holdout[k].rmse),fmt(r.holdout[k].bias),r.holdout[k].n]));
   table($('forecast-holdout'),['Дата отсечения','Целевой период','Прогноз','Факт','Ошибка'],r.holdout_folds[r.selected].map(x=>[x.origin,x.target,fmt(x.prediction),fmt(x.actual),fmt(x.error)]));
   const check=r.range_check;
   $('forecast-range-status').textContent='Попаданий в заранее построенный диапазон: '+check.covered+' из '+check.n+' · Радиус: '+fmt(check.radius)+' · Ранних ошибок: '+check.development_n+'.';
   table($('forecast-range-check'),['Целевой период','Нижняя граница','Верхняя граница','Факт','Попадание'],check.folds.map(x=>[x.target,fmt(x.low),fmt(x.high),fmt(x.actual),x.covered?'Да':'Нет']));
   const history=s.history.slice(-Math.min(s.used_count,s.monthly?36:15)),future=s.results.filter(x=>x.horizon<=r.horizon),periods=[...history.map(x=>x.period),...future.map(x=>x.target)];
   const fill=(fn)=>[...history.map(()=>null),...future.map(fn)];
   const series=[{name:'Факт',code:'actual',values:[...history.map(x=>x.value),...future.map(()=>null)]},{name:'Прогноз',code:'forecast',values:fill(x=>x.point)},{name:'Нижняя описательная граница',code:'low',values:fill(x=>x.low)},{name:'Верхняя описательная граница',code:'high',values:fill(x=>x.high)}];
   const chart=$('forecast-chart'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 280');svg.setAttribute('role','img');svg.setAttribute('aria-label','История и статистическая экстраполяция');
   const shape=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e};
   const vals=series.flatMap(x=>x.values.filter(Number.isFinite)),min=Math.min(...vals),max=Math.max(...vals),pad=Math.max((max-min)*.08,Math.abs(max)*.0001,.0001),lo=min-pad,hi=max+pad,xx=i=>112+600*i/Math.max(1,periods.length-1),yy=v=>230-185*(v-lo)/(hi-lo);
   for(let i=0;i<5;i++){const v=lo+(hi-lo)*i/4;shape('line',{x1:112,x2:712,y1:yy(v),y2:yy(v),stroke:'#d4dcdf'});shape('text',{x:103,y:yy(v)+4,'font-size':10,'text-anchor':'end'},v.toLocaleString('ru',{maximumSignificantDigits:5}))}
   chartTickIndices(periods.length,6).forEach(i=>shape('text',{x:xx(i),y:253,'text-anchor':'middle','font-size':10},periods[i]));
   const sep=(xx(history.length-1)+xx(history.length))/2;shape('line',{x1:sep,x2:sep,y1:35,y2:230,stroke:'#89949b','stroke-dasharray':'4 3'});shape('text',{x:sep,y:23,'font-size':10,'text-anchor':'end'},'последний факт');
   series.forEach((srs,j)=>{const colors=['#527fa6','#006c69','#a24724','#a24724'];let d='';srs.values.forEach((v,i)=>{if(!Number.isFinite(v))return;d+=(i&&Number.isFinite(srs.values[i-1])&&chartAdjacent(periods[i-1],periods[i],s.monthly)?'L':'M')+xx(i)+' '+yy(v)+' ';shape('circle',{cx:xx(i),cy:yy(v),r:j<2?2.8:2,fill:colors[j]})});shape('path',{d,fill:'none',stroke:colors[j],'stroke-width':j<2?2:1.2,'stroke-dasharray':j?'5 4':'none'})});
   const legend=document.createElement('p');legend.textContent='Синий — факт; зелёный пунктир — прогноз; коричневые пунктиры — описательные границы. Горизонты могут использовать разные методы.';chart.append(legend,svg);
   chartTools(chart,s.title+' — статистическая экстраполяция',s.unit,periods,series,{monthly:s.monthly,source:'Исходный ряд и расчёт; последние редакции, описательные границы, не вероятностный прогноз',url:s.source});
   $('forecast-export').disabled=false;$('forecast-export').onclick=()=>csv('forecast-selected.csv',[['Показатель',s.title],['Единица',s.unit],['Источник',s.source],['Последний факт',s.last],['Отсечение выбора метода',r.selection_cutoff],['Горизонт',r.horizon],['Целевой период',r.target],['Метод',data.methods[r.selected]],['Прогноз',r.point],['Контрольное улучшение MAE к последнему значению, %',r.skill_vs_last_pct],['Описательная нижняя граница',r.low],['Описательная верхняя граница',r.high],['Тип','Последняя редакция, не реальный исторический прогноз'],['Радиус раннего диапазона',check.radius],['Контрольных попаданий',check.covered,check.n],['Цель','Нижняя граница раннего диапазона','Верхняя граница','Факт','Попадание'],...check.folds.map(x=>[x.target,x.low,x.high,x.actual,x.covered]),['Метод','Раздел','Отсечение','Цель','Прогноз','Факт','Ошибка'],...['development','holdout'].flatMap(split=>Object.entries(r[split+'_folds']).flatMap(([method,folds])=>folds.map(x=>[method,split,x.origin,x.target,x.prediction,x.actual,x.error])))]);
  }
  const frequency=$('forecast-board-period'),target=$('forecast-board-target'),boardExport=$('forecast-board-export');
  function eligible(){return data.series.filter(s=>s.monthly===(frequency.value==='monthly'))}
  function board(){
   const list=eligible(),key=target.value;
   const rows=list.map(s=>({s,r:s.results.find(x=>x.target===key)}));
   const headers=['Показатель','Единица','Последний факт','Горизонт','Метод','Оценка','Нижняя граница','Верхняя граница','Контрольная MAE','Улучшение MAE, %','Попадания в ранний диапазон'];
   const values=rows.map(({s,r})=>[s.title,s.unit,s.last||'—',r?.horizon??'—',r?data.methods[r.selected]:'Нет прогноза',r?.point??null,r?.low??null,r?.high??null,r?.holdout[r.selected].mae??null,r?.skill_vs_last_pct??null,r?r.range_check.covered+'/'+r.range_check.n:'—']);
   table($('forecast-board'),headers,values.map(row=>row.map((v,i)=>i>=5&&i<=9?fmt(v):v)));
   const available=rows.filter(x=>x.r).length,completed=key<(frequency.value==='monthly'?data.built.slice(0,7):data.built.slice(0,4));
   $('forecast-board-status').textContent='Целевой период: '+(key||'—')+' · доступно '+available+' из '+rows.length+(completed?' · Период завершён; оценки отсутствующих наблюдений, не прогноз будущего.':'')+'.';
   boardExport.disabled=!available;boardExport.onclick=()=>csv('forecast-overview.csv',[['Целевой период',key],['Частота',frequency.value],['Сборка',data.built],['Примечание','Последние редакции; описательные границы, не вероятности'],[...headers,'Источник','Последняя проверка'],...values.map((v,i)=>[...v,rows[i].s.source,rows[i].s.checked])]);
  }
  function boardPeriods(){const keys=[...new Set(eligible().flatMap(s=>s.results.map(r=>r.target)))].sort();target.replaceChildren(...keys.map(k=>new Option(k,k)));const cutoff=frequency.value==='monthly'?data.built.slice(0,7):data.built.slice(0,4);target.value=keys.find(k=>k>=cutoff)||keys.at(-1)||'';target.disabled=!keys.length;board()}
  frequency.addEventListener('change',boardPeriods);target.addEventListener('change',board);
  sel.addEventListener('change',refresh);hor.addEventListener('change',draw);refresh();boardPeriods();
 }catch(e){console.error(e);$('forecast-status').textContent='Не удалось загрузить прогнозный архив.'}
});
