function trend(series, years) {
  const points = years.filter(year => series.values[year] != null);
  if (!points.length) return node('p','В этом периоде наблюдений нет.');
  const values = points.map(year => series.values[year]);
  const low = Math.min(...values), high = Math.max(...values);
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 420 120');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label',series.title+' за выбранные годы. Все значения есть в таблице.');
  function shape(tag, attributes) {
    const item = document.createElementNS(svg.namespaceURI,tag);
    for (const [key,value] of Object.entries(attributes)) item.setAttribute(key,value);
    svg.append(item);
    return item;
  }
  let previous;
  for (const year of points) {
    const x=10+400*(year-years[0])/Math.max(1,years.at(-1)-years[0]);
    const y=high===low?60:108-96*(series.values[year]-low)/(high-low);
    if(previous && year===previous.year+1)
      shape('line',{x1:previous.x,y1:previous.y,x2:x,y2:y,stroke:'#14746c','stroke-width':2});
    const dot=shape('circle',{cx:x,cy:y,r:3,fill:'#14746c'});
    const label=document.createElementNS(svg.namespaceURI,'title');
    label.textContent=year+' · '+fmt(series.values[year])+' '+series.unit;
    dot.append(label); previous={year,x,y};
  }
  const figure=node('figure','');
  figure.append(svg,node('figcaption',points[0]+'–'+points.at(-1)+' · Диапазон: '+fmt(low)+'…'+fmt(high)+' '+series.unit));
  return figure;
}
document.addEventListener('DOMContentLoaded',async()=>{
  if (!version) {
    try {
      const res = await fetch('version.txt');
      if (res.ok) version = (await res.text()).trim();
    } catch { /* The datasets can still be opened offline from the browser cache. */ }
  }
  const fields=['left','right','begin','finish'];
  try {
    const series=await load('compare.json');
    for(const id of fields.slice(0,2)) for(const [code,r] of Object.entries(series)) el(id).add(new Option(r.title,code));
    el('left').value='NE.EXP.GNFS.ZS'; el('right').value='NE.IMP.GNFS.ZS';
    const last=Math.max(...Object.values(series).flatMap(s=>Object.keys(s.values).map(Number)));
    el('begin').value=1991; el('finish').value=last; restore(fields);
    function draw(){
      save(fields);
      const first=series[el('left').value],second=series[el('right').value];
      const years=Array.from({length:last-1990},(_,i)=>1991+i).filter(y=>y>=Number(el('begin').value||1991)&&y<=Number(el('finish').value||last));
      const common=years.filter(y=>first.values[y]!=null && second.values[y]!=null);
      el('pair-summary').replaceChildren(); el('pair-table').replaceChildren();
      el('pair-status').textContent=common.length ? 'Совместных наблюдений: '+common.length+' · '+common[0]+'–'+common.at(-1) : 'За выбранный период общих наблюдений нет.';
      const headers=['Год',first.title+' ('+first.unit+')',second.title+' ('+second.unit+')'];
      const table=node('table',''),head=table.createTHead().insertRow();
      for(const h of headers) head.append(node('th',h));
      const body=table.createTBody();
      const rows=years.map(y=>[y,first.values[y]??'',second.values[y]??'']);
      for(const row of rows){const tr=body.insertRow();row.forEach((v,i)=>tr.insertCell().textContent=v===''?'—':i?fmt(v):v);}
      if(years.length) el('pair-table').append(table);
      for(const [i,s] of [first,second].entries()){
        const box=node('article',''),a=node('a','График и источник');
        a.href='indicator-'+el(fields[i]).value+'.html'; box.append(node('h2',s.title),node('p',s.unit));
        if(common.length>=2){
          const delta=s.values[common.at(-1)]-s.values[common[0]];
          box.append(node('p','Изменение за общий период: '+fmt(delta)+' '+(s.unit.startsWith('%')?'п. п.':s.unit)));
        }
        box.append(trend(s,years),a); if(years.some(y=>s.values[y]!=null))chartTools(box,s.title,s.unit,years,[{name:s.title,code:el(fields[i]).value,values:years.map(y=>s.values[y])}]);el('pair-summary').append(box);
      }
      el('pair-csv').disabled=!years.length;
      el('pair-csv').onclick=()=>csv('comparison.csv',[[...headers,'Источник 1','Источник 2'],...rows.map(r=>[...r,...fields.slice(0,2).map(id=>'https://data.worldbank.org/indicator/'+el(id).value+'?locations=RU')])]);
    }
    el('compare-form').oninput=draw;el('compare-form').onsubmit=e=>e.preventDefault();draw();
  }catch{el('pair-status').textContent='Не удалось загрузить ряды для выбранной версии.'}
});
