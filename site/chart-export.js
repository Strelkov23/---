// Shared chart layout and reproducible standalone exports.
function chartTickIndices(length,maxTicks=6){
  const n=Math.max(0,Math.floor(length)),count=Math.min(n,Math.max(2,Math.floor(maxTicks)));
  if(!n)return [];if(n===1)return [0];
  return Array.from(new Set(Array.from({length:count},(_,i)=>Math.round(i*(n-1)/(count-1)))));
}
function chartWrap(text,width,measure){
  const words=String(text??'').trim().split(/\s+/u).filter(Boolean),lines=[];
  let line='';
  for(const word of words){
    if(measure(word)>width){
      if(line){lines.push(line);line=''}
      let fragment='';
      for(const ch of word){
        if(fragment&&measure(fragment+ch)>width){lines.push(fragment);fragment=''}
        fragment+=ch;
      }
      line=fragment;
    }else if(line&&measure(line+' '+word)>width){lines.push(line);line=word}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);return lines.length?lines:[''];
}
// For fixed-space plot labels only: retain the full label in an SVG tooltip.
function chartFitLabel(element,width){
  const value=element.textContent;
  const size=Number(element.getAttribute('font-size'))||13;
  const ctx=document.createElement('canvas').getContext('2d');
  const weight=element.getAttribute('font-weight')||'normal';
  if(ctx)ctx.font=weight+' '+size+'px Arial';
  const measure=s=>ctx?ctx.measureText(s).width:[...s].length*size*.65;
  if(measure(value)<=width)return element;
  const chars=[...value];while(chars.length&&measure(chars.join('')+'…')>width)chars.pop();
  element.textContent=chars.join('')+'…';
  const tip=document.createElementNS('http://www.w3.org/2000/svg','title');tip.textContent=value;element.append(tip);
  return element;
}
function chartAdjacent(a,b,monthly=false){
  if(monthly){
    const month=v=>{const m=String(v).match(/^(\d{4})-(0[1-9]|1[0-2])$/);return m?Number(m[1])*12+Number(m[2]):NaN};
    return month(b)-month(a)===1;
  }
  return Number(b)-Number(a)===1;
}
function chartTools(host,title,unit,years,series,options={}){
  const toolbar=document.createElement('div'),status=document.createElement('span');
  toolbar.className='actions';status.setAttribute('role','status');
  if(!years.length||!series.some(s=>s.values.some(Number.isFinite)))return;
  const source=options.source||'Всемирный банк, World Development Indicators';
  const url=typeof options.url==='string'?options.url:'';
  const snapshot=()=>typeof version!=='undefined'&&version?version:'не определена';
  const period=options.monthly?'Месяц':'Год';
  const palette=['#006c69','#a24724','#365e95','#775395','#806315','#246d39'];
  const dashes=['none','9 5','3 4','12 4 3 4','5 3','2 5'];
  function vector(){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    function shape(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e}
    const width=1200,margin=35,left=165,right=50,plotWidth=width-left-right;
    const ctx=document.createElement('canvas').getContext('2d');
    const measure=(str,size,weight='normal')=>{if(!ctx)return [...str].length*size*.65;ctx.font=weight+' '+size+'px Arial';return ctx.measureText(str).width};
    const wrap=(v,size,max=width-2*margin,weight='normal')=>chartWrap(v,max,t=>measure(t,size,weight));
    const header=wrap(title,26,width-2*margin,'bold'),sub=wrap((options.territory||'Россия')+' · '+years[0]+'–'+years.at(-1)+' · '+unit,19);
    const legends=series.map(s=>wrap(s.name,19,width-125));
    const footer=[...wrap('Источник: '+source+' · '+series.map(s=>s.code).filter(Boolean).join(' / '),17),...(url?wrap(url,15):[]),...wrap('Версия: '+snapshot()+' · экспорт UTC '+new Date().toISOString().slice(0,10),14)];
    const top=32+header.length*32+sub.length*25+26,bottom=top+330,legendTop=bottom+67;
    const footerTop=legendTop+legends.reduce((n,v)=>n+v.length*25+12,0)+15;
    const height=footerTop+footer.length*22+25;
    for(const[k,v]of Object.entries({xmlns:ns,width,height,viewBox:'0 0 '+width+' '+height,'font-family':'Arial, sans-serif',role:'img','aria-label':title}))svg.setAttribute(k,v);
    shape('rect',{width,height,fill:'#fff'});
    const label=(x,y,text,size=19,attrs={})=>shape('text',{x,y,'font-size':size,fill:'#152b33',...attrs},text);
    let cy=32;
    for(const v of header){label(margin,cy,v,26,{'font-weight':'bold'});cy+=32}
    for(const v of sub){label(margin,cy,v,19);cy+=25}
    const vals=series.flatMap(s=>s.values.filter(Number.isFinite));let lo=Math.min(...vals),hi=Math.max(...vals);
    if(lo===hi){const pad=Math.max(1,Math.abs(lo)*.05);lo-=pad;hi+=pad}
    const x=i=>years.length===1?left+plotWidth/2:left+plotWidth*i/(years.length-1),y=v=>bottom-(bottom-top)*(v-lo)/(hi-lo);
    for(let j=0;j<=4;j++){
      const v=lo+(hi-lo)*j/4;
      shape('line',{x1:left,x2:width-right,y1:y(v),y2:y(v),stroke:'#d4dcdf'});
      label(left-12,y(v)+6,v.toLocaleString('ru',{maximumSignificantDigits:5}),17,{'text-anchor':'end'});
    }
    chartTickIndices(years.length,7).forEach(i=>label(x(i),bottom+32,years[i],17,{'text-anchor':years.length===1?'middle':i===0?'start':i===years.length-1?'end':'middle'}));
    series.forEach((s,j)=>{
      const color=palette[j%palette.length],dash=dashes[j%dashes.length];let path='';
      s.values.forEach((v,i)=>{if(!Number.isFinite(v))return;path+=(i&&Number.isFinite(s.values[i-1])&&chartAdjacent(years[i-1],years[i],options.monthly)?'L':'M')+x(i)+' '+y(v)+' '});
      shape('path',{d:path,fill:'none',stroke:color,'stroke-width':3,'stroke-dasharray':dash});
      s.values.forEach((v,i)=>{if(Number.isFinite(v))shape('circle',{cx:x(i),cy:y(v),r:3.4,fill:color})});
    });
    cy=legendTop;
    legends.forEach((lines,j)=>{
      shape('line',{x1:margin,x2:margin+42,y1:cy-5,y2:cy-5,stroke:palette[j%palette.length],'stroke-width':4,'stroke-dasharray':dashes[j%dashes.length]});
      lines.forEach(v=>{label(margin+54,cy,v,19);cy+=25});cy+=12;
    });
    cy=footerTop;for(const v of footer){label(margin,cy,v,15);cy+=22}
    return {blob:new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}),width,height};
  }
  async function png(){
    const fig=vector(),img=new Image(),src=URL.createObjectURL(fig.blob);
    try{img.src=src;await img.decode();const c=document.createElement('canvas');c.width=fig.width*2;c.height=fig.height*2;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      return await new Promise((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error('PNG')),'image/png'));
    }finally{URL.revokeObjectURL(src)}
  }
  function download(blob,ext){
    const a=document.createElement('a'),src=URL.createObjectURL(blob);a.href=src;
    a.download=(series.map(s=>s.code).join('_')+'_'+years[0]+'-'+years.at(-1)).replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(0,180)+'.'+ext;
    a.click();setTimeout(()=>URL.revokeObjectURL(src),30000);
  }
  function button(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;
    b.onclick=async()=>{try{await fn()}catch{status.textContent='Буфер или экспорт недоступен. Скачайте SVG или используйте CSV.'}};toolbar.append(b)}
  button('Копировать график',async()=>{await navigator.clipboard.write([new ClipboardItem({'image/png':png()})]);status.textContent='График скопирован. Вставьте его в документ.'});
  button('Скачать PNG',async()=>download(await png(),'png'));button('Скачать SVG',()=>download(vector().blob,'svg'));
  button('Копировать таблицу',async()=>{
    const rows=[[period,...series.map(s=>s.name+' ('+unit+')')],...years.map((yr,i)=>[yr,...series.map(s=>Number.isFinite(s.values[i])?String(s.values[i]).replace('.',','):'')]),['Источник',source,...series.map(s=>s.code)],['URL',url],['Версия данных',snapshot()]];
    await navigator.clipboard.writeText(rows.map(r=>r.map(v=>String(v??'').replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n'));status.textContent='Таблица скопирована для вставки в Excel или Word.';
  });
  toolbar.append(status);host.append(toolbar);
}
if(typeof module!=='undefined')module.exports={chartTickIndices,chartWrap,chartAdjacent};
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const payload=document.getElementById('figure-data');
 if(payload){if(!version){try{const r=await fetch('version.txt');if(r.ok)version=(await r.text()).trim()}catch{}}const d=JSON.parse(payload.textContent);chartTools(payload.parentElement,d.name,d.unit,d.years,[d])}
});
