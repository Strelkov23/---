/* Annual observations: exact calendar years, never bridge missing years. */
const IVPulse=(()=>{
 const specs={
 'NY.GDP.MKTP.KD.ZG':{title:'Реальный рост ВВП',meaning:'Темп изменения объёма выпуска конечных товаров и услуг с поправкой на цены.',positive:'Экономика выросла относительно предыдущего года.',negative:'Экономика сократилась относительно предыдущего года.'},
 'FP.CPI.TOTL.ZG':{title:'Потребительская инфляция',meaning:'Годовое изменение индекса потребительских цен WDI, не обязательно декабрь к декабрю.',positive:'В среднем потребительские цены выросли.',negative:'В среднем потребительские цены снизились.'},
 'NV.IND.MANF.KD.ZG':{title:'Рост обрабатывающей промышленности',meaning:'Реальная добавленная стоимость обработки, не индекс физического промышленного выпуска.',positive:'Реальная добавленная стоимость выросла.',negative:'Реальная добавленная стоимость сократилась.'},
 'SL.UEM.TOTL.ZS':{title:'Безработица (оценка МОТ)',meaning:'Доля безработных в рабочей силе; модельная оценка МОТ, а не количество вакансий.',level:true},
 'NE.GDI.FTOT.ZS':{title:'Накопление основного капитала',meaning:'Доля валового накопления основного капитала в ВВП, не темп прироста инвестиций.',level:true}
 };
 function observation(series,year){const v=series?.values?.[String(year)];return typeof v==='number'&&Number.isFinite(v)?v:null}
 function analyse(series,year,spec){const value=observation(series,year),prior=observation(series,year-1);return {value,prior,delta:value!==null&&prior!==null?value-prior:null,text:value===null?'Наблюдение за выбранный год отсутствует. Пропуск не равен нулю.':spec.level?'Это доля, а не темп роста. Изменение доли измеряется в процентных пунктах.':value>0?spec.positive:value<0?spec.negative:'Зафиксировано нулевое изменение.'}}
 function timeline(data){const years=Object.keys(specs).flatMap(k=>Object.keys(data[k]?.values||{})).filter(y=>/^\d{4}$/.test(y)&&Number(y)>=1991&&Number(y)<=2100).map(Number);return years.length?[Math.min(...years),Math.max(...years)]:null}
 function segments(series,start,end){let result=[],part=[];for(let y=start;y<=end;y++){const v=observation(series,y);if(v===null){if(part.length)result.push(part);part=[]}else part.push([y,v])}if(part.length)result.push(part);return result}
 return {specs,observation,analyse,timeline,segments};
})();
if(typeof module!=='undefined')module.exports=IVPulse;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),range=$('pulse-year');if(!range)return;
 const status=$('pulse-status'),select=$('pulse-indicator'),play=$('pulse-play'),cards=$('pulse-cards'),chart=$('pulse-chart'),table=$('pulse-table');let timer=null;
 const number=v=>v===null?'Нет данных':v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 const signed=v=>v===null?'Нет сопоставимого года':(v>0?'+':'')+number(v)+' п.п.';
 try{
  const data=await load('compare.json'),years=IVPulse.timeline(data);if(!years)throw Error('Нет ряда');
  const [min,max]=years;range.min=min;range.max=max;range.value=max;range.disabled=false;play.disabled=min===max;select.disabled=false;
  for(const [key,s] of Object.entries(IVPulse.specs))select.add(new Option(s.title,key));
  const svg=(name,attrs,text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e};
  function draw(){
   const year=Number(range.value);$('pulse-year-label').textContent=year;cards.replaceChildren();
   for(const [key,s] of Object.entries(IVPulse.specs)){const a=IVPulse.analyse(data[key],year,s),d=node('article',''),title=node('h3',s.title),value=node('strong',number(a.value)+(a.value===null?'':'%')),delta=node('p','К предыдущему году: '+signed(a.delta)),desc=node('p',a.text);d.className='pulse-card';d.append(title,value,delta,desc);const btn=node('button','Динамика и методика');btn.type='button';btn.setAttribute('aria-pressed',String(key===select.value));btn.onclick=()=>{select.value=key;draw()};d.append(btn);cards.append(d)}
   const key=select.value,s=IVPulse.specs[key],series=data[key],a=IVPulse.analyse(series,year,s),start=Math.max(min,year-19),end=year,parts=IVPulse.segments(series,start,end),points=parts.flat();
   $('pulse-meaning').textContent=s.meaning+' '+a.text+' Изменение показателя: '+signed(a.delta)+'. Причины по одному ряду не установлены.';
   $('pulse-source').href='https://data.worldbank.org/indicator/'+key+'?locations=RU';$('pulse-source').textContent='WDI: '+key;
   chart.replaceChildren();table.replaceChildren();
   if(!points.length){chart.textContent='В выбранном интервале нет данных';return}
   const lo=Math.min(0,...points.map(p=>p[1])),hi=Math.max(0,...points.map(p=>p[1])),span=hi-lo||1,x=y=>42+(y-start)*570/Math.max(1,end-start),y=v=>160-(v-lo)*125/span;
   const g=svg('svg',{viewBox:'0 0 650 190',role:'img','aria-label':s.title+', '+start+'–'+end});g.append(svg('title',{},s.title+' — годовые наблюдения'),svg('line',{x1:42,x2:612,y1:y(0),y2:y(0),stroke:'currentColor',opacity:.4}));
   for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;g.append(svg('line',{x1:42,x2:612,y1:y(v),y2:y(v),stroke:'currentColor',opacity:.12}),svg('text',{x:37,y:y(v)+4,'text-anchor':'end',fill:'currentColor','font-size':11},number(v)))}
   for(const p of parts){if(p.length>1)g.append(svg('polyline',{points:p.map(([yr,v])=>x(yr)+','+y(v)).join(' '),fill:'none',stroke:'#368f99','stroke-width':2.5}));for(const [yr,v] of p){const dot=svg('circle',{cx:x(yr),cy:y(v),r:yr===year?5:3,fill:'#368f99'});dot.append(svg('title',{},yr+': '+number(v)+'%'));g.append(dot)}}
   for(const yr of [...new Set([start,Math.floor((start+end)/2),end])])g.append(svg('text',{x:x(yr),y:180,'text-anchor':'middle',fill:'currentColor','font-size':11},yr));chart.append(g);
   for(let yr=end;yr>=start;yr--){const tr=table.insertRow();tr.insertCell().textContent=yr;const row=IVPulse.analyse(series,yr,s);tr.insertCell().textContent=number(row.value);tr.insertCell().textContent=signed(row.delta)}
  }
  function stop(){if(timer!==null)clearInterval(timer);timer=null;play.textContent='Воспроизвести годы';play.setAttribute('aria-pressed','false')}
  range.oninput=()=>{stop();draw()};select.onchange=draw;play.onclick=()=>{if(timer!==null){stop();return}if(Number(range.value)>=max)range.value=min;draw();play.textContent='Остановить';play.setAttribute('aria-pressed','true');timer=setInterval(()=>{if(Number(range.value)>=max){stop();return}range.value=Number(range.value)+1;draw()},1000)};
  $('pulse-export').disabled=false;$('pulse-export').onclick=()=>{const key=select.value,end=Number(range.value),start=Math.max(min,end-19),rows=[['Год','Значение, %','Изменение, п.п.','Код WDI']];for(let y=start;y<=end;y++){const a=IVPulse.analyse(data[key],y,IVPulse.specs[key]);rows.push([y,a.value,a.delta,key])}csv('annual-pulse.csv',rows)};
  status.textContent='Годовые наблюдения WDI: '+min+'–'+max+'. Для отдельных показателей последние годы могут отсутствовать. WDI не является гарантированно независимым первичным измерением.';draw();window.addEventListener('pagehide',stop);
 }catch(e){status.textContent='Годовые наблюдения недоступны для этой версии. '+e.message}
});
