/* Scenario identities, not a forecast. All inputs are user assumptions. */
const IVLab=(()=>{
 const specs={
  labour:{title:'Выпуск, занятость и реальные доходы',inputs:[['output','Изменение реального выпуска',-30,50,10],['productivity','Изменение выпуска на человеко-час',-20,50,5],['wage','Изменение номинальной оплаты труда',-30,50,10],['prices','Изменение потребительских цен',-10,50,7]],outputs:['Изменение необходимых человеко-часов','Изменение реальной оплаты труда'],method:'Часы = выпуск / производительность. Реальная оплата = номинальная оплата / индекс цен. Не учитываются изменение рабочего времени, структура занятых и обратные связи.'},
  basket:{title:'Личная потребительская корзина',inputs:[['foodshare','Доля продовольствия в базовых расходах',0,100,40],['serviceshare','Доля услуг в непродовольственном остатке',0,100,50],['food','Изменение цен продовольствия',-20,60,12],['goods','Изменение цен прочих товаров',-20,60,6],['services','Изменение цен услуг',-20,60,9]],outputs:['Изменение стоимости фиксированной корзины','Доля услуг в общих базовых расходах'],method:'Взвешенная сумма темпов цен: доли базовых расходов суммируются до 100%. Это учебная корзина из трёх групп, не воспроизведение ИПЦ Росстата.'},
  budget:{title:'Условный бюджет',inputs:[['income','Доходы, трлн руб.',0,100,35],['expenses','Расходы, трлн руб.',0,100,40],['gdp','Номинальный ВВП, трлн руб.',1,400,200]],outputs:['Сальдо, трлн руб.','Сальдо в % ВВП'],method:'Сальдо = доходы минус расходы. Отношение к ВВП = сальдо / ВВП × 100. Не прогноз, не действующий бюджет, нет обратных связей.'}
 };
 function calc(mode,v){
  const s=specs[mode];if(!s||!s.inputs.every(([k,l,min,max])=>typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=min&&v[k]<=max))throw Error('Недопустимые параметры');
  if(mode==='labour')return [100*((1+v.output/100)/(1+v.productivity/100)-1),100*((1+v.wage/100)/(1+v.prices/100)-1)];
  if(mode==='basket'){const f=v.foodshare/100,t=(1-f)*v.serviceshare/100;return [f*v.food+(1-f-t)*v.goods+t*v.services,t*100]}
  return [v.income-v.expenses,100*(v.income-v.expenses)/v.gdp];
 }
 function exportRows(mode,values){
  const s=specs[mode],results=calc(mode,values),unit=i=>mode==='budget'&&i===0?'трлн руб.':'%';
  return [['Тип','Показатель','Значение','Единица','Модель'],
   ...s.inputs.map(([key,label])=>['Условная предпосылка',label,values[key],mode==='budget'?'трлн руб.':'%',s.title]),
   ...results.map((value,i)=>['Условный результат',s.outputs[i],value,unit(i),s.title]),
   ['Методика',s.method,'','',s.title]];
 }
 function scale(value,baseline=null){
  if(!Number.isFinite(value)||baseline!==null&&!Number.isFinite(baseline))throw Error('Некорректное значение');
  const max=Math.max(1,Math.abs(value),Math.abs(baseline??0)),bound=Math.ceil(max/Math.pow(10,Math.floor(Math.log10(max))))*Math.pow(10,Math.floor(Math.log10(max)));
  const position=v=>50+50*v/bound;
  return {bound,position:position(value),left:Math.min(50,position(value)),width:Math.abs(position(value)-50),baseline:baseline===null?null:position(baseline)};
 }
 return {specs,calc,exportRows,scale};
})();
if(typeof module!=='undefined')module.exports=IVLab;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const get=id=>document.getElementById(id),sel=get('iv-mode');if(!sel)return;
 const f=get('iv-fields'),out=get('iv-results'),method=get('iv-method'),explain=get('iv-explain'),compare=get('iv-compare');let vals={},baseline=null;
 const num=x=>x.toLocaleString('ru-RU',{maximumFractionDigits:2,signDisplay:'exceptZero'});
 function draw(){const s=IVLab.specs[sel.value],result=IVLab.calc(sel.value,vals);out.replaceChildren();
 result.forEach((v,i)=>{const d=document.createElement('div');d.className='iv-result';const label=document.createElement('span');label.textContent=s.outputs[i];const b=document.createElement('strong');b.textContent=num(v)+(sel.value==='budget'&&i===0?' трлн руб.':'%');d.append(label,b);
 const unit=sel.value==='budget'&&i===0?'трлн руб.':'%',saved=baseline?.[i]??null,scale=IVLab.scale(v,saved);
 const axis=document.createElement('div');axis.className='v-result-axis';axis.setAttribute('aria-hidden','true');
 const bar=document.createElement('span');bar.className='v-result-bar';bar.dataset.direction=v<0?'negative':v>0?'positive':'zero';bar.style.left=scale.left+'%';bar.style.width=scale.width+'%';axis.append(bar);
 if(saved!==null){const mark=document.createElement('span');mark.className='v-result-marker';mark.style.left=scale.baseline+'%';axis.append(mark)}
 const labels=document.createElement('div');labels.className='v-axis-labels';labels.setAttribute('aria-hidden','true');
 for(const t of [num(-scale.bound),'0',num(scale.bound)+' '+unit]){const e=document.createElement('span');e.textContent=t;labels.append(e)}
 const note=document.createElement('p');note.className='v-result-note';note.textContent=saved===null?'Шкала относительно нуля, '+unit+'.':'Сохранённый вариант: '+num(saved)+' '+unit+'. Разница: '+num(v-saved)+' '+(unit==='%'?'п. п.':unit)+'.';
 d.append(axis,labels,note);out.append(d)});
 explain.textContent=sel.value==='labour'?'При заданном выпуске потребность в человеко-часах '+(result[0]>1e-9?'растёт':result[0]<-1e-9?'сокращается':'не меняется')+'. Изменение реальной оплаты учитывает заданные цены.':sel.value==='basket'?'Для вашей фиксированной корзины стоимость '+(result[0]>1e-9?'растёт':result[0]<-1e-9?'снижается':'не меняется')+'. Веса относятся к базовому периоду.':result[0]<0?'При этих предпосылках расходы превышают доходы: возникает дефицит.':result[0]>0?'При этих предпосылках доходы превышают расходы: возникает профицит.':'Доходы равны расходам.';
 compare.textContent=baseline?'Отличие от сохранённого варианта: '+result.map((v,i)=>s.outputs[i]+': '+num(v-baseline[i])+(sel.value==='budget'&&i===0?' трлн руб.':' п.п.')).join(' · '):'Сохраните вариант для сравнения.';
 }
 function reset(){baseline=null;f.replaceChildren();const s=IVLab.specs[sel.value];method.textContent=s.method;vals={};
 for(const [k,l,min,max,value] of s.inputs){vals[k]=value;const label=document.createElement('label');label.className='iv-slider';const name=document.createElement('span');name.textContent=l;const number=document.createElement('output');number.textContent=value+(sel.value==='budget'?'':'%');const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=1;input.value=value;input.id='iv-'+k;label.htmlFor=input.id;number.htmlFor=input.id;input.oninput=()=>{vals[k]=Number(input.value);number.textContent=input.value+(sel.value==='budget'?'':'%');draw()};label.append(name,number,input);f.append(label)}draw()}
 sel.onchange=reset;get('iv-export').onclick=()=>csv('iv-basic-'+sel.value+'.csv',IVLab.exportRows(sel.value,vals));get('iv-reset').onclick=reset;get('iv-save').onclick=()=>{baseline=IVLab.calc(sel.value,vals);draw()};reset();
});
