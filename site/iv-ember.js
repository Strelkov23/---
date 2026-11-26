/* External compilation: show source and missing coverage; do not sum aggregates. */
const IVEmber=(()=>{
 const labels={total:'Вся выработка',coal:'Уголь',gas:'Газ',other_fossil:'Прочие ископаемые',nuclear:'Атомная энергия',hydro:'Гидроэнергия',wind:'Ветер',solar:'Солнце',bioenergy:'Биоэнергия',other_renewables:'Другие ВИЭ'};
 function compare(rows,year,key){const a=rows.find(r=>r.year===year)?.values||{},b=rows.find(r=>r.year===year-1)?.values||{},valid=v=>Number.isFinite(v)&&v>=0;const value=valid(a[key])?a[key]:null;return {value,share:value!==null&&valid(a.total)&&a.total>0&&value<=a.total?100*value/a.total:null,change:value!==null&&valid(b[key])&&b[key]>0?100*(value/b[key]-1):null}}
 return {labels,compare};
})();
if(typeof module!=='undefined')module.exports=IVEmber;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('ember-status');if(!status)return;
 try{const d=await load('independent-ember.json');if(d.schema!=='iv-ember-v1'||!Array.isArray(d.rows))throw Error('Неверная схема');
 status.textContent=(d.rows.length?'Получен ряд: '+d.rows.length+' лет. Последняя успешная загрузка: '+d.success:'Нет подтверждённой загрузки; числовой ряд не публикуется.')+(d.error?' Последняя ошибка: '+d.error:'');
 if(!d.rows.length)return;
 const metric=$('ember-metric'),year=$('ember-year'),label=$('ember-year-label'),fmt=v=>v===null?'Нет данных':v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 const ys=d.rows.map(r=>r.year).sort((a,b)=>a-b);for(const [k,t] of Object.entries(IVEmber.labels))if(d.rows.some(r=>Number.isFinite(r.values[k])))metric.add(new Option(t,k));
 year.min=0;year.max=ys.length-1;year.value=ys.length-1;metric.disabled=year.disabled=false;
 function draw(){const y=ys[Number(year.value)],k=metric.value,r=IVEmber.compare(d.rows,y,k);label.textContent=y;$('ember-value').textContent=fmt(r.value)+(r.value===null?'':' ТВт·ч');$('ember-share').textContent=fmt(r.share)+(r.share===null?'':'%');$('ember-change').textContent=fmt(r.change)+(r.change===null?'':'%');const body=$('ember-rows');body.replaceChildren();for(const y of ys){const a=IVEmber.compare(d.rows,y,k),tr=body.insertRow();for(const v of [y,fmt(a.value),fmt(a.share),fmt(a.change)])tr.insertCell().textContent=v}}
 year.oninput=metric.onchange=draw;$('ember-export').disabled=false;$('ember-export').onclick=()=>csv('ember-russia-generation.csv',[['Год','Источник электроэнергии','ТВт·ч','Источник','SHA256'],...d.rows.flatMap(r=>Object.entries(r.values).map(([k,v])=>[r.year,IVEmber.labels[k]||k,v,d.source,d.sha256]))]);draw()
 }catch(e){status.textContent='Набор недоступен: '+e.message}
});
