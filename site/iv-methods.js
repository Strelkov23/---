/* Illustrative methodology experiments, not official estimates. */
const IVMethods=(()=>{
 const modes={
  gdp:{title:'ВВП: номинальный и реальный рост',fields:[['nominal','Номинальный рост, %',-20,50,12],['price','Дефлятор ВВП: прирост, %',-20,50,8]],unit:'%',result:'Расчётный реальный рост'},
  industry:{title:'Промышленность: влияние весов',fields:[['first','Изменение выпуска группы A, %',-30,50,10],['second','Изменение выпуска группы B, %',-30,50,-5],['weight','Вес группы A, %',0,100,40]],unit:'%',result:'Условный агрегированный прирост'},
  reweight:{title:'Промышленность: сравнение двух структур весов',fields:[['first','Прирост выпуска группы A, %',-30,50,10],['second','Прирост выпуска группы B, %',-30,50,-5],['weightOld','Вес группы A в структуре 1, %',0,100,40],['weightNew','Вес группы A в структуре 2, %',0,100,60]],unit:'п.п.',result:'Разница агрегированных темпов'},
  investment:{title:'Инвестиции: отделение цен от объёма',fields:[['nominal','Номинальный прирост инвестиций, %',-20,50,15],['price','Прирост условного инвестиционного дефлятора, %',-20,50,10]],unit:'%',result:'Расчётный прирост физического объёма'},
  poverty:{title:'Бедность: чувствительность к границе',fields:[['threshold','Условная граница дохода, тыс. ₽',5,50,18]],unit:'%',result:'Доля условной выборки ниже границы'}
 };
 const incomes=[8,12,15,18,20,25,30,40,55,80];
 function calculate(mode,p){const s=modes[mode];if(!s||s.fields.some(([k,,lo,hi])=>!Number.isFinite(p[k])||p[k]<lo||p[k]>hi))throw Error('Недопустимые параметры');
 if(mode==='gdp'||mode==='investment')return 100*((1+p.nominal/100)/(1+p.price/100)-1);
 if(mode==='industry')return p.first*p.weight/100+p.second*(1-p.weight/100);
 if(mode==='reweight')return (p.first-p.second)*(p.weightNew-p.weightOld)/100;
 return 100*incomes.filter(x=>x<p.threshold).length/incomes.length;
 }
 function reweight(p){const delta=calculate('reweight',p),old=p.first*p.weightOld/100+p.second*(1-p.weightOld/100),next=p.first*p.weightNew/100+p.second*(1-p.weightNew/100);return {old,next,delta}}
 return {modes,calculate,incomes,reweight};
})();
if(typeof module!=='undefined')module.exports=IVMethods;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),pick=$('iv-method-mode');if(!pick)return;
 const host=$('iv-method-fields'),fmt=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 for(const [id,s] of Object.entries(IVMethods.modes))pick.add(new Option(s.title,id));
 function setup(){host.replaceChildren();const s=IVMethods.modes[pick.value],p={};
 function draw(){try{$('iv-method-result').textContent=fmt(IVMethods.calculate(pick.value,p))+(s.unit==='%'?'%':' '+s.unit);$('iv-method-result-label').textContent=s.result;const x=pick.value==='reweight'?IVMethods.reweight(p):null;$('iv-method-detail').textContent=x?'Структура 1: '+fmt(x.old)+'%; структура 2: '+fmt(x.next)+'%. Физические темпы в обеих структурах одинаковы.':''}catch(e){$('iv-method-result').textContent='Нет расчёта'}}
 for(const [k,title,min,max,value] of s.fields){p[k]=value;const l=node('label','');l.className='iv-slider';const input=document.createElement('input'),o=node('output',String(value));input.type='range';input.min=min;input.max=max;input.value=value;input.id='iv-method-'+k;l.htmlFor=input.id;o.setAttribute('for',input.id);l.append(node('span',title),o,input);host.append(l);input.oninput=()=>{p[k]=Number(input.value);o.textContent=input.value;draw()}}
 $('iv-method-example').textContent=pick.value==='poverty'?'Учебная выборка из 10 человек, доходы в тыс. ₽: '+IVMethods.incomes.join(', ')+'. Равные веса; строго ниже границы. Не оценка бедности России.':pick.value==='reweight'?'Условная двухгрупповая модель: разница равна (темп A − темп B) × (новый вес A − старый вес A) / 100. Это не оценка фактического эффекта пересчёта Росстата.':pick.value==='industry'?'Двухгрупповой взвешенный пример; не алгоритм Росстата с полной товарной корзиной и многоуровневой агрегацией.':'При совместимой базе индексов: (индекс стоимости / индекс цен − 1) × 100. Не самостоятельное воспроизведение официального дефлятора.';
 draw()}
 pick.onchange=setup;setup()
});
