// The same labelled vector figure is used for the clipboard, PNG and SVG.
function chartTools(host, title, unit, years, series, options={}) {
  const toolbar=document.createElement('div'), status=document.createElement('span');
  toolbar.className='actions'; status.setAttribute('role','status');
  function vector() {
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    function shape(tag,attrs,text){
      const n=document.createElementNS(ns,tag);
      for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
      if(text!==undefined)n.textContent=text;
      svg.append(n);
    }
    const width=1200,height=670;
    svg.setAttribute('width',width);svg.setAttribute('height',height);
    svg.setAttribute('viewBox','0 0 1200 670');
    svg.setAttribute('font-family','Arial, sans-serif');
    shape('rect',{width,height,fill:'white'});
    const label=(x,y,text,size=21)=>shape('text',{x,y,'font-size':size,fill:'#152b33'},text);
    label(35,42,title,26);label(35,79,'Россия · '+years[0]+'–'+years.at(-1)+' · '+unit);
    const vals=series.flatMap(s=>s.values.filter(Number.isFinite));
    let lo=Math.min(...vals),hi=Math.max(...vals);
    if(lo===hi){hi+=1;lo-=1}
    const x=i=>145+1000*i/Math.max(1,years.length-1), y=v=>465-310*(v-lo)/(hi-lo);
    for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;
      shape('line',{x1:145,x2:1145,y1:y(v),y2:y(v),stroke:'#d4dcdf'});
      label(10,y(v)+6,v.toLocaleString('ru',{maximumSignificantDigits:5}),18)}
    years.forEach((yr,i)=>{if(i===0||i===years.length-1||(i%Math.ceil(years.length/6)===0 && years.length-i>2))label(x(i)-20,496,yr,18)});
    series.forEach((s,j)=>{
      const color=j?'#a24724':'#006c69';let path='';
      s.values.forEach((v,i)=>{if(!Number.isFinite(v))return;
        path+=(i && Number.isFinite(s.values[i-1]) && (options.monthly||years[i]-years[i-1]===1)?'L':'M')+x(i)+' '+y(v)+' ';
        shape('circle',{cx:x(i),cy:y(v),r:3.4,fill:color})});
      shape('path',{d:path,fill:'none',stroke:color,'stroke-width':3,'stroke-dasharray':j?'9 5':'none'});
      shape('line',{x1:35,x2:75,y1:529+30*j,y2:529+30*j,stroke:color,'stroke-width':4,'stroke-dasharray':j?'9 5':'none'});
      label(86,536+30*j,s.name,20);
    });
    label(35,610,'Источник: '+(options.source||'Всемирный банк, World Development Indicators')+' · '+series.map(s=>s.code).join(' / '),18);
    label(35,640,'Версия: '+(typeof version!=='undefined'&&version?version:'не определена')+' · '+new Date().toISOString().slice(0,10),14);
    return new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  }
  async function png(){
    const img=new Image(),url=URL.createObjectURL(vector());
    try{img.src=url;await img.decode();const c=document.createElement('canvas');c.width=2400;c.height=1340;
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      return await new Promise((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error()),'image/png'));
    }finally{URL.revokeObjectURL(url)}
  }
  function download(blob,ext){const a=document.createElement('a'), url=URL.createObjectURL(blob);a.href=url;
    a.download=series.map(s=>s.code).join('_')+'_'+years[0]+'-'+years.at(-1)+'.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  function button(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;
    b.onclick=async()=>{try{await fn()}catch{status.textContent='Буфер или экспорт недоступен. Скачайте SVG или используйте CSV.'}};toolbar.append(b)}
  button('Копировать график',async()=>{await navigator.clipboard.write([new ClipboardItem({'image/png':png()})]);status.textContent='График скопирован. Вставьте его в документ.'});
  button('Скачать PNG',async()=>download(await png(),'png'));button('Скачать SVG',()=>download(vector(),'svg'));
  button('Копировать таблицу',async()=>{const rows=[['Год',...series.map(s=>s.name+' ('+unit+')')],...years.map((yr,i)=>[yr,...series.map(s=>s.values[i]==null?'':String(s.values[i]).replace('.',','))]),['Источник',options.source||'Всемирный банк, WDI',...series.map(s=>s.code)]];
    await navigator.clipboard.writeText(rows.map(r=>r.join('\t')).join('\n'));status.textContent='Таблица скопирована для вставки в Excel или Word.'});
  toolbar.append(status);host.append(toolbar);
}
document.addEventListener('DOMContentLoaded',async()=>{
 const payload=document.getElementById('figure-data');
 if(payload){if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}const d=JSON.parse(payload.textContent);chartTools(payload.parentElement,d.name,d.unit,d.years,[d])}
});
