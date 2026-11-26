const IVPrices=(()=>{
 function rate(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>0?100*(a/b-1):null}
 function compare(row,basis,services){
 if(!['mom','yoy','ytd'].includes(basis)||!Number.isFinite(services)||services<0||services>100)throw Error('Invalid parameters');
 const r=row.official[basis];if(!Array.isArray(r)||r.length!==3||r.some(x=>!Number.isFinite(x)||x<=0))throw Error('Invalid source index');
 const [official,goods,service]=r.map(x=>x-100),s=services/100,derived=!Number.isFinite(row[basis])&&Number.isFinite(row[basis+'_pp']),romir=Number.isFinite(row[basis])?row[basis]:derived?rate(row.level,row.level-row[basis+'_pp']):null;
 return {official,romir,derived,custom:goods*(1-s)+service*s,contributions:[goods*(1-s),service*s],gap:romir===null?null:romir-official};
 }return {rate,compare};
})();
if(typeof module!=='undefined')module.exports=IVPrices;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),period=$('iv-price-period');if(!period)return;
 const basis=$('iv-price-basis'),share=$('iv-price-share'),status=$('iv-price-status'),f=v=>v===null?'Нет данных':v.toLocaleString('ru-RU',{maximumFractionDigits:2});
 try{
 const d=await load('independent-prices.json');if(d.schema!=='iv-prices-v1'||!Array.isArray(d.rows)||!d.rows.length)throw Error('Некорректный набор');
 d.rows.forEach(r=>period.add(new Option(r.period,r.period)));period.value=d.rows.at(-1).period;period.disabled=basis.disabled=share.disabled=false;
 function draw(){
 const row=d.rows.find(r=>r.period===period.value),s=Number(share.value),a=IVPrices.compare(row,basis.value,s);
 $('iv-price-share-label').textContent=s+'%';$('iv-price-official').textContent=f(a.official)+'%';$('iv-price-romir').textContent=a.romir===null?'Нет данных':f(a.romir)+'%';$('iv-price-custom').textContent=f(a.custom)+'%';
 $('iv-price-explain').textContent=(a.gap===null?'Нет сравнения.':'Разница темпов разных корзин: '+f(a.gap)+' п.п. Это не доказательство ошибки Росстата. ')+(a.derived?'РОМИР: темп вычислен из округлённого уровня индекса и изменения уровня в п.п. ':'РОМИР: опубликованный темп. ')+'Учебная корзина: вклад товаров '+f(a.contributions[0])+' п.п., услуг '+f(a.contributions[1])+' п.п. Используются официальные групповые индексы; это не независимое измерение цен.';
 const chart=$('iv-price-chart');chart.replaceChildren();const vals=[['Росстат',a.official],['РОМИР: FMCG',a.romir],['Ваши веса',a.custom]],max=Math.max(1,...vals.filter(x=>x[1]!==null).map(x=>Math.abs(x[1])));
 for(const [label,v] of vals){const box=node('div','');box.className='pulse-card';box.append(node('p',label),node('strong',f(v)+(v===null?'':'%')));if(v!==null){const bar=document.createElement('meter');bar.min=-max;bar.max=max;bar.value=v;bar.setAttribute('aria-label',label);box.append(bar)}chart.append(box)}
 $('iv-price-source').href=row.url;$('iv-price-source').textContent='РОМИР · '+row.published;
 }
 period.onchange=basis.onchange=share.oninput=draw;status.textContent='Три месяца 2024 года, ручная сверка. Сопоставлены периоды, но не корзины и не выборки.';
 $('iv-price-csv').disabled=false;$('iv-price-csv').onclick=()=>{const b=basis.value,s=Number(share.value);csv('price-method-comparison.csv',[['Период','База','Росстат, %','РОМИР, %','РОМИР рассчитан из п.п.','Доля услуг, %','Учебная корзина, %','РОМИР источник','Росстат републикация'],...d.rows.map(r=>{const a=IVPrices.compare(r,b,s);return[r.period,b,a.official,a.romir,a.derived?'да':'нет',s,a.custom,r.url,d.official_source]})])};draw()
 }catch(e){status.textContent='Наблюдения недоступны: '+e.message}
});
