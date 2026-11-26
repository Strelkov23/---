/* Transparent one-sector real-resource experiment, not an economy-wide forecast. */
const IVPolicy=(()=>{
 const specs=[
 ['capacity','Исходная годовая мощность, усл. ед.',50,200,110],
 ['demand','Исходный конечный спрос, усл. ед.',20,200,100],
 ['labour','Доступные трудовые ресурсы, усл. ед.',20,200,100],
 ['productivity','Выпуск на единицу труда, % базового',50,200,100],
 ['growth','Годовой рост спроса, %',-10,25,5],
 ['investment','Годовые инвестиции, усл. ед. капитала',0,50,10],
 ['efficiency','Мощность на 100 ед. инвестиций',0,200,80],
 ['depreciation','Годовое выбытие мощностей, %',0,20,5],
 ['lag','Лаг ввода, лет',1,5,2],
 ['revenue','Доходы бюджета, усл. ед. капитала в год',0,100,35],
 ['spending','Прочие расходы бюджета, усл. ед. капитала в год',0,100,30],
 ['publicShare','Бюджетная доля инвестиций, %',0,100,50],
 ['horizon','Горизонт, лет',1,10,5]
 ];
 function solve(p){
  if(!p||!specs.every(([k,l,min,max])=>Number.isInteger(p[k])&&p[k]>=min&&p[k]<=max))throw Error('Некорректные параметры');
  let k=p.capacity,d=p.demand,rows=[],totalGap=0,totalBalance=0;
  for(let y=1;y<=p.horizon;y++){
   const commissioned=y>p.lag?p.investment*p.efficiency/100:0;
   k=k*(1-p.depreciation/100)+commissioned;d*=1+p.growth/100;
   const labourLimit=p.labour*p.productivity/100,output=Math.min(k,d,labourLimit),gap=Math.max(0,d-output),balance=p.revenue-p.spending-p.investment*p.publicShare/100;
   const binding=[['мощности',k],['труд',labourLimit],['спрос',d]].filter(([,v])=>Math.abs(v-output)<1e-8).map(([n])=>n);
   totalGap+=gap;totalBalance+=balance;
   rows.push({year:y,capacity:k,demand:d,labourLimit,output,gap,balance,commissioned,binding});
  }
  return {rows,totalGap,totalBalance};
 }
 function compare(a,b){
  const years=Math.min(a.rows.length,b.rows.length);if(!years)throw Error('Пустой горизонт');
  const aa=a.rows.slice(0,years),bb=b.rows.slice(0,years),sum=(rows,k)=>rows.reduce((s,r)=>s+r[k],0);
  return {years,output:aa.at(-1).output-bb.at(-1).output,gap:sum(aa,'gap')-sum(bb,'gap'),balance:sum(aa,'balance')-sum(bb,'balance')};
 }
 return {specs,solve,compare}
})();
if(typeof module!=='undefined')module.exports=IVPolicy;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),fields=$('policy-fields');if(!fields)return;
 const f=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2}),p={},inputs={},outputs={};let baseline=null;
 function draw(){const r=IVPolicy.solve(p),last=r.rows.at(-1),host=$('policy-result');host.replaceChildren();
 for(const [label,value] of [['Выпуск в последнем году',last.output],['Неудовлетворённый спрос за горизонт',r.totalGap],['Суммарное условное сальдо бюджета',r.totalBalance]]){const a=node('article','');a.className='pulse-card';a.append(node('h3',label),node('strong',f(value)));host.append(a)}
 $('policy-explain').textContent='В последнем году выпуск ограничивают: '+last.binding.join(', ')+'. '+(last.gap>1e-8?'Часть спроса не удовлетворена.':'Спрос покрыт.')+' '+(r.totalBalance<0?'Суммарное бюджетное сальдо отрицательно. Это предупреждение, а не запрет инвестиций в данной модели.':'Суммарное условное бюджетное сальдо неотрицательно.');
 const delta=baseline?IVPolicy.compare(r,baseline):null;
 $('policy-compare').textContent=delta?'Разница с сохранённым вариантом за общий горизонт ('+delta.years+' лет): выпуск в последнем общем году '+f(delta.output)+'; неудовлетворённый спрос '+f(delta.gap)+'; бюджетное сальдо '+f(delta.balance)+'.'+(r.rows.length!==baseline.rows.length?' Горизонты различаются; сравнение ограничено общими годами.':''):'Сохраните вариант для сравнения.';
 const tbody=$('policy-rows'),chart=$('policy-chart');tbody.replaceChildren();chart.replaceChildren();const max=Math.max(1,...r.rows.flatMap(x=>[x.capacity,x.demand,x.labourLimit]));
 for(const row of r.rows){const tr=tbody.insertRow();for(const value of [row.year,row.capacity,row.demand,row.labourLimit,row.output,row.gap,row.commissioned,row.balance,row.binding.join(', ')])tr.insertCell().textContent=typeof value==='number'?f(value):value;
 const item=node('div','');item.className='policy-chart-row';item.append(node('strong','Год '+row.year));for(const [label,v] of [['Спрос',row.demand],['Выпуск',row.output],['Мощности',row.capacity],['Трудовой предел',row.labourLimit]]){const line=node('div','');line.className='hh-bar-row';const meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=v;meter.setAttribute('aria-label',label+' '+f(v));line.append(node('span',label),meter,node('span',f(v)));item.append(line)}chart.append(item)}
 $('policy-export').onclick=()=>csv('policy-scenario.csv',[['Тип','Параметр / год','Значение / мощность','Спрос','Трудовой предел','Выпуск','Недопоставка','Ввод','Сальдо','Ограничение'],...Object.entries(p).map(([k,v])=>['Предпосылка',k,v]),...r.rows.map(x=>['Результат',x.year,x.capacity,x.demand,x.labourLimit,x.output,x.gap,x.commissioned,x.balance,x.binding.join(', ')])]);
 }
 for(const [k,label,min,max,value] of IVPolicy.specs){p[k]=value;const wrap=node('label','');wrap.className='iv-slider';const input=document.createElement('input');input.type='range';input.id='policy-'+k;input.min=min;input.max=max;input.step=1;input.value=value;const out=node('output',String(value));out.setAttribute("for",input.id);wrap.htmlFor=input.id;wrap.append(node('span',label),out,input);fields.append(wrap);inputs[k]=input;outputs[k]=out;input.oninput=()=>{p[k]=Number(input.value);out.textContent=input.value;draw()}}
 $('policy-save').onclick=()=>{baseline=IVPolicy.solve(p);draw()};$('policy-reset').onclick=()=>{baseline=null;for(const [k,l,min,max,v] of IVPolicy.specs){p[k]=v;inputs[k].value=v;outputs[k].textContent=v}draw()};draw();
 if(typeof IVScenarioStore!=='undefined')IVScenarioStore.bind('policy',{capture:()=>({...p}),validate:v=>IVScenarioStore.numeric(v,IVPolicy.specs.map(([k,l,min,max])=>[k,min,max,1])),apply:v=>{baseline=null;for(const [k,value] of Object.entries(v)){p[k]=value;inputs[k].value=value;outputs[k].textContent=value}draw()}});
});
