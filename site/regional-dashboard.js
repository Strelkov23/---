/* Multivariate regional comparison: separate units, no weighted score. */
const RegionalDashboard=(()=>{
 const specs=[
 ['Экономика','R_7e8fd799d1d06897_84c74d6e51','Валовой региональный продукт','Миллионов рублей'],
 ['Экономика','R_f54f02504bfb051e_84c74d6e51','Валовой региональный продукт на душу населения','Рублей'],
 ['Производство','MFG_total_099b62c9d9','Отгрузка: Обрабатывающие производства — всего (ОКВЭД2 C)','Миллионов рублей'],
 ['Инвестиции','R_88230ed30f2f2738_bf6a5a3983','Инвестиции в основной капитал','В фактически действовавших ценах, миллионов рублей'],
 ['Труд','R_65254a01945743d3_1db3db8e79','Среднегодовая численность занятых','Тысяч человек'],
 ['Труд','R_a4138d558584b81a_1db3db8e79','Уровень безработицы: Уровень безработицы','По данным выборочных обследований рабочей силы, в процентах'],
 ['Предприятия','R_65de97d08173dfaa_fd1adecbd1','Число организаций','На конец года'],
 ['Финансы','R_ffa971b13dbda179_fd1adecbd1','Удельный вес убыточных организаций','В процентах от общего числа организаций']
 ];
 function matches(meta,spec){return !!meta&&meta.code===spec[1]&&meta.title===spec[2]&&meta.unit===spec[3]}
 function percentile(values,v){
  const a=values.filter(Number.isFinite);
  if(!a.length||!Number.isFinite(v))return null;
  return 100*(a.filter(x=>x<v).length+.5*a.filter(x=>x===v).length)/a.length;
 }
 function summarize(data,year,keys,sample,stats,balanced=null){
  const checked=sample(data.values.filter(r=>r.year===year));
  const entries=[...checked.out].filter(([key])=>!balanced||balanced.has(key));
  const values=entries.map(([,r])=>r.value),summary=stats(values);
  return {n:values.length,median:summary?.median??null,excluded:checked.excluded,ambiguous:checked.ambiguous,regions:keys.map(key=>{
   const r=entries.find(([id])=>id===key)?.[1];
   return {key,row:r||null,rank:r?1+values.filter(v=>v>r.value).length:null,delta:r&&summary?r.value-summary.median:null,percentile:r?percentile(values,r.value):null};
  })};
 }
 function common(datasets,year,sample){
  if(!datasets.length)return new Set();
  const sets=datasets.map(d=>new Set(sample(d.values.filter(r=>r.year===year)).out.keys()));
  return new Set([...sets[0]].filter(k=>sets.every(s=>s.has(k))));
 }
 function matrixRows(options,calculated,query='',sort='name',direction='desc',view='value',balanced=null){
  const q=query.trim().toLocaleLowerCase('ru'),sign=direction==='asc'?1:-1;
  const rows=options.map((o,i)=>({...o,cells:calculated.map(x=>x.result?.regions[i]||null)})).filter(o=>(!balanced||balanced.has(o.key))&&(!q||[o.name,o.iso,o.key].some(v=>String(v||'').toLocaleLowerCase('ru').includes(q))));
  const value=(r,i)=>view==='rank'?r.cells[i]?.rank:view==='delta'?r.cells[i]?.delta:view==='percentile'?r.cells[i]?.percentile:r.cells[i]?.row?.value;
  return rows.sort((a,b)=>{
   if(sort!=='name'){
    const x=value(a,Number(sort)),y=value(b,Number(sort)),ax=Number.isFinite(x),by=Number.isFinite(y);
    if(ax!==by)return ax?-1:1;
    if(ax&&x!==y)return sign*(x-y);
   }
   return a.name.localeCompare(b.name,'ru');
  });
 }
 function pair(rows,i,j,pearson){
  if(i===j)return {rows:[],correlation:null};
  const data=rows.map(r=>({key:r.key,name:r.name,iso:r.iso,a:r.cells[i],b:r.cells[j]})).filter(r=>Number.isFinite(r.a?.row?.value)&&Number.isFinite(r.b?.row?.value)).map(r=>({...r,x:r.a.row.value,y:r.b.row.value}));
  return {rows:data,correlation:pearson(data)};
 }
 return {specs,matches,summarize,common,matrixRows,percentile,pair};
})();
if(typeof module!=='undefined')module.exports=RegionalDashboard;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),panel=$('geo-dashboard');if(!panel)return;
 const status=$('gd-status'),host=$('gd-table'),exp=$('gd-export'),year=$('gd-year'),scope=$('gd-scope'),picks=['gd-a','gd-b','gd-c'].map($);
 const mode=$('gd-mode'),query=$('gd-query'),sort=$('gd-sort'),direction=$('gd-direction'),view=$('gd-view'),wide=$('gd-wide-export'),matrixControls=$('gd-matrix-controls'),selectedControls=$('gd-selected-controls');
 const pairA=$('gd-pair-a'),pairB=$('gd-pair-b'),pairHost=$('gd-pair-chart'),pairStatus=$('gd-pair-status'),pairExport=$('gd-pair-export'),heat=$('gd-heat'),pairLegend=$('gd-heat-legend');
 let loaded=false,busy=false;
 function textNum(v){return Number.isFinite(v)?v.toLocaleString('ru',{maximumFractionDigits:3}):'—'}
 panel.addEventListener('toggle',async()=>{
  if(!panel.open||loaded||busy)return;busy=true;status.textContent='Загрузка проверенных рядов…';
  try{
   const manifest=await Provenance.validateManifest(await load('data-manifest.json'));
   const catalog=(await Provenance.get(manifest,'historical.json',root)).data.series;
   const all=await Promise.all(RegionalDashboard.specs.map(async spec=>{
    const meta=catalog.find(m=>RegionalDashboard.matches(m,spec));if(!meta)return {spec,error:'Ряд отсутствует'};
    try{const d=(await Provenance.get(manifest,meta.file,root)).data;if(d.title!==meta.title||d.unit!==meta.unit||d.source!==meta.source)throw Error('Несовпадение паспорта');return {spec,meta,data:d}}
    catch(e){return {spec,meta,error:'Не удалось проверить ряд'}}
   }));
   const active=all.filter(x=>x.data),years=[...new Set(active.flatMap(x=>x.data.values.map(r=>r.year)))].sort((a,b)=>b-a);
   year.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
   if(years.includes(2024))year.value='2024';
   const options=Object.entries(RegionalMap.regionNames()).map(([iso,key])=>({iso,key,name:RegionalMap.displayName(iso,key)})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
   // Include the two explicitly disjoint oblast observations without attributing them to full-oblast map polygons.
   options.push({iso:null,key:'архангельская область без автономного округа',name:'Архангельская область (без АО)'},{iso:null,key:'тюменская область без автономных округов',name:'Тюменская область (без АО)'});
   options.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
   const optionId=o=>o.iso||o.key;
   const short=['ВРП','ВРП на душу','Отгрузка обработки','Инвестиции','Занятые','Безработица','Организации','Убыточные организации'];
   sort.replaceChildren(new Option('Название региона','name'),...short.map((name,i)=>new Option(name,String(i))));
   for(const e of [pairA,pairB])e.replaceChildren(...short.map((name,i)=>new Option(name,String(i))));
   pairA.value='1';pairB.value='5';
   for(let i=0;i<picks.length;i++){picks[i].replaceChildren(new Option('Не выбран',''),...options.map(o=>new Option(o.name,optionId(o))));picks[i].value=['RU-MOW','RU-SVE',''][i]}
   function draw(){
    host.replaceChildren();exp.disabled=true;wide.disabled=true;
    const matrix=mode.value==='all',y=Number(year.value),selected=matrix?options:[...new Set(picks.map(p=>p.value).filter(Boolean))].map(id=>options.find(o=>optionId(o)===id)).filter(Boolean),keys=selected.map(o=>o.key);
    selectedControls.hidden=matrix;matrixControls.hidden=!matrix;wide.hidden=!matrix;pairLegend.hidden=!matrix||!heat.checked;
    const balanced=scope.checked?(active.length===all.length?RegionalDashboard.common(active.map(x=>x.data),y,RegionalStats.sample):new Set()):null;
    const calculated=all.map(x=>({...x,result:x.data?RegionalDashboard.summarize(x.data,y,keys,RegionalStats.sample,RegionalStats.stats,balanced):null}));
    const known=calculated.filter(x=>x.result?.n>0).length;
    status.textContent='Год: '+y+' · рядов с наблюдениями: '+known+' / '+all.length+' · '+(balanced?'общая выборка всех '+all.length+' рядов: '+balanced.size+' территорий':'доступная выборка отдельно по каждому ряду')+'. Место 1 означает наибольшее значение, не лучшую оценку.';
    const t=node('table',''),h=t.createTHead().insertRow(),body=t.createTBody();
    let displayed=selected.map((o,i)=>({...o,cells:calculated.map(x=>x.result?.regions[i]||null)}));
    const header=(name)=>{const th=node('th',name);th.scope='col';h.append(th);return th};
    if(matrix){
     displayed=RegionalDashboard.matrixRows(selected,calculated,query.value,sort.value,direction.value,view.value,balanced);
     status.textContent+=' Показано '+displayed.length+' из '+options.length+' территорий справочника; поиск не меняет медианы и места.';
     header('Регион');for(let i=0;i<calculated.length;i++){const x=calculated[i],th=header(short[i]);th.append(node('small',' · '+(view.value==='rank'?'место':view.value==='percentile'?'процентиль, %':x.spec[3])),node('small',' · n='+ (x.result?.n??0)));th.title=x.spec[2]}
     for(const o of displayed){const tr=body.insertRow();tr.insertCell().textContent=o.name;
      for(const q of o.cells){const td=tr.insertCell(),v=view.value==='rank'?q?.rank:view.value==='delta'?q?.delta:view.value==='percentile'?q?.percentile:q?.row?.value;td.textContent=textNum(v);
       if(heat.checked){td.dataset.gdBand=Number.isFinite(q?.percentile)?String(Math.min(4,Math.floor(q.percentile/20))):'missing'}
       if(q?.row)td.title='Исходное значение: '+textNum(q.row.value)+' · место: '+q.rank+' · разность с медианой: '+textNum(q.delta)+' · процентиль: '+textNum(q.percentile)
      }
     }
     wide.disabled=!displayed.length||!years.length;
     wide.onclick=()=>csv('regional-multivariate-matrix-'+y+'.csv',[['Год','Выборка','Регион','ISO (если сопоставлен)',...calculated.flatMap(x=>[x.spec[2]+' · '+x.spec[3],x.spec[2]+' · место',x.spec[2]+' · медиана',x.spec[2]+' · охват',x.spec[2]+' · процентиль']), 'Отпечаток манифеста'],...displayed.map(o=>[y,balanced?'общая':'доступная',o.name,o.iso,...o.cells.flatMap((q,i)=>[q?.row?.value,q?.rank,calculated[i].result?.median,calculated[i].result?.n,q?.percentile]),manifest.data_fingerprint])]);
    }else{
     for(const name of ['Направление / показатель','Единица источника','Медиана','Охват',...selected.map(o=>o.name)])header(name);
     for(const x of calculated){const r=x.result,tr=body.insertRow(),name=tr.insertCell();name.append(node('strong',x.spec[0]),node('p',x.spec[2]));if(x.meta){const a=node('a','Ряд и график');const u=new URL('historical.html',location.href);u.searchParams.set('hist-series',x.meta.code);if(pinned)u.searchParams.set('snapshot',pinned);a.href=u.href;name.append(a)}
      for(const v of [x.spec[3],textNum(r?.median),r?r.n+' территорий · исключено '+r.excluded:x.error,...keys.map((k,i)=>{const q=r?.regions[i];return q?.row?textNum(q.row.value)+' · место '+q.rank+' из '+r.n+' · отклонение от медианы '+textNum(q.delta):'—'})])tr.insertCell().textContent=v
     }
    }
    host.append(t);exp.disabled=!displayed.length||!years.length;
    exp.onclick=()=>csv('regional-multivariate-'+y+'.csv',[['Год','Режим выборки','ISO','Территория справочника','Регион источника','Направление','Код ряда','Показатель','Единица','Значение','Медиана','Разность с медианой','Место по убыванию','Процентиль','Охват','Исключено строк','Неоднозначных ключей','Статус','Источник','Лист','Строка','Столбец','Примечание','SHA-256 JSON','Отпечаток манифеста'],...displayed.flatMap(o=>calculated.map((x,i)=>{const r=x.result,q=o.cells[i],v=q?.row;return [y,balanced?'общая':'доступная',o.iso,o.name,v?.region,x.spec[0],x.spec[1],x.spec[2],x.spec[3],v?.value,r?.median,q?.delta,q?.rank,q?.percentile,r?.n,r?.excluded,r?.ambiguous,x.error||(!v?'Нет наблюдения в выборке':'Наблюдение'),x.meta?.source,v?.sheet,v?.row,v?.column,v?.note,manifest.files[x.meta?.file]?.sha256,manifest.data_fingerprint]}))]);
    // Paired analysis always uses the full reference sample, independent of text search.
    const pairCalculated=all.map(x=>({...x,result:x.data?RegionalDashboard.summarize(x.data,y,options.map(o=>o.key),RegionalStats.sample,RegionalStats.stats,balanced):null}));
    const pairRows=RegionalDashboard.matrixRows(options,pairCalculated,'','name','desc','value',balanced);
    const i=Number(pairA.value),j=Number(pairB.value),p=RegionalDashboard.pair(pairRows,i,j,RegionalStats.pearson);
    pairHost.replaceChildren();pairExport.disabled=!p.rows.length;
    pairStatus.textContent=i===j?'Выберите два разных показателя.':'Год: '+y+' · парных территорий: '+p.rows.length+' · коэффициент Пирсона: '+textNum(p.correlation)+'. Корреляция не означает причинную связь; денежные уровни зависят от масштаба региона.';
    if(p.rows.length){
     const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 820 360');svg.setAttribute('width','820');svg.setAttribute('role','img');svg.setAttribute('aria-label','Диаграмма рассеяния: '+short[i]+' и '+short[j]);
     const add=(tag,attrs,t)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;svg.append(e);return e};
     const bounds=k=>{let min=Math.min(...p.rows.map(r=>r[k])),max=Math.max(...p.rows.map(r=>r[k]));if(min===max){const pad=Math.max(1,Math.abs(min)*.05);min-=pad;max+=pad}return [min,max]};
     const [xmin,xmax]=bounds('x'),[ymin,ymax]=bounds('y'),X=v=>105+665*(v-xmin)/(xmax-xmin),Y=v=>275-215*(v-ymin)/(ymax-ymin);
     add('rect',{width:820,height:360,fill:'#fff'});
     add('text',{x:20,y:25,fill:'#173e52','font-size':17,'font-weight':'bold'},short[j]+' / '+short[i]+' · '+y);
     for(let n=0;n<=4;n++){const vx=xmin+(xmax-xmin)*n/4,vy=ymin+(ymax-ymin)*n/4;
      add('line',{x1:X(vx),x2:X(vx),y1:60,y2:275,stroke:'#dce4e5'});add('line',{x1:105,x2:770,y1:Y(vy),y2:Y(vy),stroke:'#dce4e5'});
      add('text',{x:X(vx),y:295,'text-anchor':'middle','font-size':11,fill:'#243f4a'},vx.toLocaleString('ru',{maximumSignificantDigits:4}));
      add('text',{x:97,y:Y(vy)+4,'text-anchor':'end','font-size':11,fill:'#243f4a'},vy.toLocaleString('ru',{maximumSignificantDigits:4}));
     }
     for(const r of p.rows){const dot=add('circle',{cx:X(r.x),cy:Y(r.y),r:4,fill:'#297d92','fill-opacity':.8,stroke:'#164d60','stroke-width':.5});const tip=document.createElementNS(ns,'title');tip.textContent=r.name+' · '+short[i]+': '+textNum(r.x)+' · '+short[j]+': '+textNum(r.y);dot.append(tip)}
     add('text',{x:105,y:322,'font-size':13,fill:'#243f4a'},short[i]+' (X)');add('text',{x:105,y:44,'font-size':13,fill:'#243f4a'},short[j]+' (Y)');
     add('text',{x:105,y:345,'font-size':11,fill:'#243f4a'},'Парных территорий: '+p.rows.length+' · источник: Росстат / архивы, паспорта в CSV.');
     pairHost.append(svg);
    }
    pairExport.onclick=()=>csv('regional-pairs-'+y+'.csv',[['Год','Выборка','Территория','ISO','Код X','Значение X','Единица X','Источник X','Строка X','Код Y','Значение Y','Единица Y','Источник Y','Строка Y','Число пар','Корреляция Пирсона','Отпечаток манифеста'],...p.rows.map(r=>[y,balanced?'общая':'попарная',r.name,r.iso,all[i].spec[1],r.x,all[i].spec[3],all[i].meta?.source,r.a.row.row,all[j].spec[1],r.y,all[j].spec[3],all[j].meta?.source,r.b.row.row,p.rows.length,p.correlation,manifest.data_fingerprint])]);
   }
   for(const e of [...picks,year,scope,mode,sort,direction,view,heat,pairA,pairB])e.onchange=draw;query.oninput=draw;draw();loaded=true;
  }catch(e){status.textContent='Не удалось проверить многомерную выборку: '+String(e.message||e)}
  finally{busy=false}
 });
});
