/* Exact Shapley decomposition of a conditional cost index in a 19-group aggregate price model. */
const CostDecomposition=(()=>{
 const P=typeof module!=='undefined'?require('./price-model.js'):PriceModel;
 const finite=Number.isFinite,sum=a=>a.reduce((s,v)=>s+v,0),dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
 const keys=['material','importIntensity','importPrice','wage','productivity'];
 const labels=['Отечественная материалоёмкость','Импортная интенсивность','Цены импортных ресурсов','Ставка оплаты труда','Производительность труда'];
 function calculate(m,p){
  P.matrix(m);
  const n=m.names.length,range=(v,a,b)=>finite(v)&&v>=a&&v<=b,vec=(v,a,b)=>Array.isArray(v)&&v.length===n&&v.every(x=>range(x,a,b));
  if(!m.compatible||m.imported.some(v=>v<0)||m.residual.some(v=>v<0)||m.demand.some(v=>v<0)||sum(m.demand)<=0||!vec(p.material,-20,80)||!vec(p.importIntensity,-20,80)||!range(p.importPrice,-100,300)||!vec(p.wage,-100,300)||!vec(p.productivity,-20,200)||!vec(p.wageShare,0,100))throw Error('Некорректные данные или допущения');
  const M=2**keys.length,all=M-1,values=[];
  for(let mask=0;mask<M;mask++){
   const on=k=>Boolean(mask&(1<<keys.indexOf(k)));
   const A=m.A.map(row=>row.map((v,j)=>v*(on('material')?1-p.material[j]/100:1)));
   const Q=A.map((_,i)=>A.map((row,j)=>(i===j?1:0)-row[i]));
   const witness=P.linear(Q,Array(n).fill(1));
   if(witness.some(v=>!finite(v)||v<=0))throw Error('Непродуктивная технология в контрфактическом сочетании '+mask);
   const rhs=m.residual.map((v,i)=>{
    const wage=v*p.wageShare[i]/100,other=v-wage,imp=m.imported[i]*(on('importIntensity')?1-p.importIntensity[i]/100:1)*(on('importPrice')?1+p.importPrice/100:1);
    return other+imp+wage*(on('wage')?1+p.wage[i]/100:1)/(on('productivity')?1+p.productivity[i]/100:1);
   });
   const prices=P.linear(Q,rhs);
   if(prices.some(v=>!finite(v)||v< -1e-9))throw Error('Некорректный индекс затрат');
   values.push(prices);
  }
  const count=mask=>mask.toString(2).split('1').length-1,fac=n=>n<2?1:n*fac(n-1);
  const parts=keys.map((_,k)=>Array.from({length:n},(_,i)=>{
   let v=0;for(let mask=0;mask<M;mask++)if(!(mask&(1<<k))){const s=count(mask),weight=fac(s)*fac(keys.length-s-1)/fac(keys.length);v+=weight*(values[mask|(1<<k)][i]-values[mask][i]);}return v*100;
  }));
  const rows=m.names.map((name,i)=>{const base=values[0][i]*100,changed=values[all][i]*100,contributions=parts.map(v=>v[i]),residual=changed-base-sum(contributions);return {name,base,changed,delta:changed-base,contributions,residual};});
  if(rows.some(r=>Math.abs(r.base-100)>1e-5||Math.abs(r.residual)>1e-7*Math.max(1,Math.abs(r.delta))))throw Error('Проверка разложения не пройдена');
  const w=m.demand.map(v=>v/sum(m.demand)),basket={base:dot(w,rows.map(r=>r.base)),changed:dot(w,rows.map(r=>r.changed)),contributions:parts.map(v=>dot(w,v))};
  basket.delta=basket.changed-basket.base;basket.residual=basket.delta-sum(basket.contributions);
  return {rows,basket,cases:M,keys,labels};
 }
 return {calculate,keys,labels};
})();
if(typeof module!=='undefined')module.exports=CostDecomposition;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('cd-status');if(!status)return;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:4}):'—';
 const table=(host,headers,rows)=>{const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();for(const v of headers){const th=node('th',v);th.scope='col';h.append(th)}for(const r of rows){const tr=b.insertRow();for(const v of r){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=v??'—'}}host.replaceChildren(t)};
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),entry=await Provenance.get(manifest,'price-data.json',root),m=entry.data;
  const specs=[['material',0,-20,80,'Экономия отечественных затрат'],['importIntensity',0,-20,80,'Экономия импортных затрат'],['wageShare','',0,100,'Доля оплаты труда в остатке'],['wage',0,-100,300,'Изменение ставки оплаты'],['productivity',0,-20,200,'Изменение производительности']];
  const fields=Object.fromEntries(specs.map(([k,v,min,max,label])=>[k,m.names.map(name=>{const x=node('input','');x.type='number';x.min=min;x.max=max;x.step='any';x.value=v;x.setAttribute('aria-label',label+': '+name);return x})]));
  const source=$('cd-source'),imp=$('cd-import-price'),exp=$('cd-export'),uniform=$('cd-share');
  table($('cd-input'),['Группа',...specs.map(a=>a[4]+', %')],m.names.map((name,i)=>[name,...specs.map(a=>fields[a[0]][i])]));
  const clear=()=>{exp.disabled=true;$('cd-results').replaceChildren();$('cd-basket').replaceChildren();status.textContent='Параметры изменены. Выполните расчёт.'};
  [source,imp,...Object.values(fields).flat()].forEach(x=>x.oninput=clear);
  $('cd-apply').onclick=()=>{if(uniform.value&&uniform.validity.valid){fields.wageShare.forEach(x=>x.value=uniform.value);clear()}};
  $('cd-run').onclick=()=>{
   clear();if(!source.value.trim()||[imp,...Object.values(fields).flat()].some(x=>!x.value||!x.validity.valid||!Number.isFinite(x.valueAsNumber))){status.textContent='Введите все коэффициенты и источник либо обоснование допущений. Ноль задаётся явно.';return}
   try{
    const p={...Object.fromEntries(specs.map(([k])=>[k,fields[k].map(x=>x.valueAsNumber)])),importPrice:imp.valueAsNumber},r=CostDecomposition.calculate(m,p);
    status.textContent='Проверены '+r.cases+' контрфактических сочетания. Максимальная невязка: '+Math.max(...r.rows.map(v=>Math.abs(v.residual))).toExponential(2)+' п. п. Индекс условных затрат, не прогноз цен.';
    table($('cd-basket'),['Индекс исходный','Индекс сценария','Изменение, п. п.',...r.labels,'Невязка'],[[fmt(r.basket.base),fmt(r.basket.changed),fmt(r.basket.delta),...r.basket.contributions.map(fmt),fmt(r.basket.residual)]]);
    table($('cd-results'),['Группа','Исходный индекс','Сценарный индекс','Изменение, п. п.',...r.labels,'Невязка'],r.rows.map(v=>[v.name,fmt(v.base),fmt(v.changed),fmt(v.delta),...v.contributions.map(fmt),fmt(v.residual)]));
    exp.disabled=false;exp.onclick=()=>csv('cost-decomposition-2021.csv',[['База','Группа','Экономия отечественных затрат, %','Экономия импортных затрат, %','Изменение импортных цен, %','Доля оплаты труда в остатке, %','Изменение ставки оплаты, %','Производительность, %','Исходный индекс','Сценарный индекс','Изменение, п.п.',...r.labels,'Невязка','Обоснование','SHA-256','Манифест'],...r.rows.map((v,i)=>[2021,v.name,p.material[i],p.importIntensity[i],p.importPrice,p.wageShare[i],p.wage[i],p.productivity[i],v.base,v.changed,v.delta,...v.contributions,v.residual,source.value.trim(),entry.sha256,manifest.data_fingerprint]),[2021,'Корзина базового конечного спроса','','',p.importPrice,'','','',r.basket.base,r.basket.changed,r.basket.delta,...r.basket.contributions,r.basket.residual,source.value.trim(),entry.sha256,manifest.data_fingerprint]]);
   }catch(e){status.textContent='Расчёт отклонён: '+String(e.message||e)}
  };clear();
 }catch(e){console.error(e);status.textContent='Проверенная база недоступна.'}
});