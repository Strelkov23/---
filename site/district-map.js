/* Independent historic ADM2 geometry, with search by source name. */
const DistrictMap=(()=>{
 const norm=s=>String(s??'').toLowerCase().replaceAll('ё','е').trim();
 function matches(features,q){const v=norm(q);return v?features.filter(f=>norm(f.properties?.shapeName).includes(v)):[]}
 return {matches}
})();
if(typeof module!=='undefined')module.exports=DistrictMap;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('district-form');if(!form)return;
 const host=$('district-map'),status=$('district-status'),query=$('district-query'),detail=$('district-detail'),list=$('district-list'),more=$('district-more');
 try{
  const manifest=await Provenance.validateManifest(await load('data-manifest.json')),get=async n=>(await Provenance.get(manifest,n,root)).data,meta=await get('district-meta.json');
  if(!['ok','cached'].includes(meta.status)){status.textContent='Историческая геометрия недоступна: '+(meta.error||'нет загруженного файла');return}
  const geo=await get('district-boundaries.json'),features=geo.features;
  status.textContent='2017 год · единиц ADM2: '+features.length+' · источник: geoBoundaries · '+(meta.status==='cached'?'проверенный архив':'загруженный архив');
  const polys=features.map(f=>({f,rings:RegionalMap.rings(f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const f of polys)for(const r of f.rings)for(const [a,b] of r){xmin=Math.min(xmin,a);xmax=Math.max(xmax,a);ymin=Math.min(ymin,b);ymax=Math.max(ymax,b)}
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax)throw Error('Некорректная геометрия');
  const w=1180,h=650,scale=Math.min(1100/(xmax-xmin),500/(ymax-ymin)),x=v=>40+(1100-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>65+(500-scale*(ymax-ymin))/2+(v-ymin)*scale,ns='http://www.w3.org/2000/svg',paths=new Map();
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('role','img');svg.setAttribute('aria-label','Исторические административные районы 2017 года');
  function shape(tag,attrs,t,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(t!==undefined)e.textContent=t;parent.append(e);return e}
  function txt(xx,yy,t,size=14){return shape('text',{x:xx,y:yy,'font-size':size,fill:'#173e52'},t)}
  let chosen=null;
  function select(f){if(chosen)paths.get(chosen)?.removeAttribute('data-selected');chosen=f.properties.shapeID;paths.get(chosen)?.setAttribute('data-selected','');detail.textContent=f.properties.shapeName+' · ID источника: '+chosen+' · 2017 год';}
  shape('rect',{width:w,height:h,fill:'#fff'});txt(25,32,'Административные районы · 2017',22);txt(25,55,'Исторический справочный слой, не современный юридический реестр.');
  for(const {f,rings} of polys){const d=rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' '),p=shape('path',{d,fill:'#e7efeb',stroke:'#617676','stroke-width':.45,'fill-rule':'evenodd','data-id':f.properties.shapeID});shape('title',{},f.properties.shapeName,p);paths.set(f.properties.shapeID,p);p.onclick=()=>select(f)}
  txt(25,600,'Выберите район нажатием или через поиск по названию.');txt(25,625,'geoBoundaries / OpenStreetMap, Wambacher · ODbL 1.0',13);
  const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap);
  let hits=[],limit=30;
  function draw(){list.replaceChildren(node('p',query.value.trim()?'Найдено: '+hits.length:'Введите название района (в написании источника).'));for(const f of hits.slice(0,limit)){const b=node('button',f.properties.shapeName);b.type='button';b.onclick=()=>select(f);list.append(b)}more.hidden=hits.length<=limit}
  function filter(){hits=DistrictMap.matches(features,query.value);limit=30;draw()}
  form.onsubmit=e=>{e.preventDefault();filter()};query.oninput=filter;more.onclick=()=>{limit+=30;draw()};draw()
 }catch(e){status.textContent='Не удалось загрузить исторический слой: '+e.message}
});
