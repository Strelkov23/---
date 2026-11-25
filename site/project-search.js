/* Cross-register navigation; source categories and reporting dates remain separate. */
const ProjectSearch=(()=>{
 const specs=[{iso:'RU-BU',slug:'investment-projects',kind:'Региональный реестр'},{iso:'RU-AMU',slug:'amur-projects',kind:'Региональный реестр'},{iso:'RU-KDA',slug:'krasnodar-projects',kind:'Перечень сопровождения'}];
 const norm=s=>String(s??'').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
 function records(spec,data,coverage){
  if(!coverage||coverage.iso!==spec.iso||!Array.isArray(data.rows)||coverage.records!==(data.rows.length||null)||coverage.edition!==data.edition||coverage.sha256!==data.sha256)throw Error('Редакция или охват не совпадают');
  return data.rows.map(r=>({iso:spec.iso,region:r.region,kind:spec.kind,page:spec.slug+'.html',record:r.record,name:r.name,investor:r.investor||null,investorAvailability:r.investor_availability||null,sector:r.sector||null,location:r.municipality||r.location||null,status:r.status||null,stage:r.stage||null,period:r.period||null,cost:r.cost_mln_rub??null,jobs:r.jobs??null,edition:r.edition,source:r.source,sha256:r.sha256,sheet:r.sheet,row:r.row}));
 }
 function select(rows,{iso='',sector='',status='',query='',numeric=''}={}){
  if(!['','cost','jobs','both'].includes(numeric))throw Error('Параметр числового отбора');
  const q=norm(query).split(/\s+/).filter(Boolean);
  return rows.filter(r=>(!iso||r.iso===iso)&&(!sector||(sector==='__missing__'?!r.sector:r.sector===sector))&&(!status||(status==='__missing__'?!r.status:r.status===status))&&(!numeric||(numeric==='both'?r.cost!==null&&r.jobs!==null:r[numeric]!==null))&&q.every(t=>norm([r.name,r.investor,r.investorAvailability,r.location,r.sector,r.status,r.stage,r.region].join(' ')).includes(t)));
 }
 function counts(rows){return specs.map(s=>({iso:s.iso,records:rows.filter(r=>r.iso===s.iso).length,cost:rows.filter(r=>r.iso===s.iso&&r.cost!==null).length,jobs:rows.filter(r=>r.iso===s.iso&&r.jobs!==null).length}));}
 return {specs,records,select,counts};
})();
if(typeof module!=='undefined')module.exports=ProjectSearch;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),host=$('project-search-table');if(!host)return;
 const iso=$('project-search-region'),query=$('project-search-query'),sector=$('project-search-sector'),state=$('project-search-state'),numeric=$('project-search-numeric'),status=$('project-search-status'),summary=$('project-search-summary'),prev=$('project-search-prev'),next=$('project-search-next'),exp=$('project-search-export');
 let page=0;const size=40;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json')),coverage=(await Provenance.get(m,'project-coverage.json',root)).data;
  const settled=await Promise.allSettled(ProjectSearch.specs.map(async s=>({spec:s,rows:ProjectSearch.records(s,(await Provenance.get(m,s.slug+'.json',root)).data,coverage.rows.find(r=>r.iso===s.iso))})));
  const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),all=ok.flatMap(x=>x.rows),failed=settled.length-ok.length;
  iso.replaceChildren(new Option('Все подключённые регионы',''),...coverage.rows.map(r=>new Option(r.region,r.iso)));
  const requested=new URLSearchParams(location.search).get('project-region');if([...iso.options].some(o=>o.value===requested))iso.value=requested;
  function options(){
   const rows=all.filter(r=>!iso.value||r.iso===iso.value);
   for(const [el,key] of [[sector,'sector'],[state,'status']]){
    const old=el.value,values=[...new Set(rows.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    el.replaceChildren(new Option('Все',''),...values.map(v=>new Option(v,v)),new Option('Не указано в источнике','__missing__'));
    if([...el.options].some(o=>o.value===old))el.value=old;
   }
   page=0;draw();
  }
  function draw(){
   const rows=ProjectSearch.select(all,{iso:iso.value,sector:sector.value,status:state.value,query:query.value,numeric:numeric.value});
   page=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1));
   status.textContent='Записи источников: '+rows.length+' · '+(rows.length?page*size+1:0)+'–'+Math.min(rows.length,(page+1)*size)+'. Не число уникальных проектов.'+(failed?' Недоступно наборов: '+failed+'.':'');
   summary.replaceChildren();
   for(const c of ProjectSearch.counts(rows)){
    if(iso.value&&iso.value!==c.iso)continue;
    const ref=coverage.rows.find(r=>r.iso===c.iso),loaded=ok.some(x=>x.spec.iso===c.iso)&&ref.records!==null;
    const article=node('div','');article.className='metric';article.append(node('b',loaded?String(c.records):'—'),node('span',ref.region+(loaded?' · стоимость: '+(ref.cost_numeric===null?'—':c.cost)+' · места: '+(ref.jobs_numeric===null?'—':c.jobs):' · нет подтверждённого набора')));summary.append(article);
   }
   const t=node('table',''),h=t.createTHead().insertRow(),b=t.createTBody();
   for(const label of ['Проект / запись','Регион и дата','Отрасль источника','Место','Статус / стадия','Инвестор / наличие','Заявленная стоимость, млн руб.','Заявленные места','Источник']){const th=node('th',label);th.scope='col';h.append(th);}
   for(const r of rows.slice(page*size,(page+1)*size)){
    const tr=b.insertRow();for(const v of [r.name+' · № '+r.record,r.region+' · '+r.edition,r.sector,r.location,[r.status,r.stage].filter(Boolean).join(' / '),r.investor||r.investorAvailability,r.cost,r.jobs])tr.insertCell().textContent=v??'—';
    const td=tr.insertCell(),a=node('a','Документ');a.href=r.source;const l=node('a','Реестр');l.href=r.page;td.append(a,document.createTextNode(' · '),l);
   }
   host.replaceChildren(t);prev.disabled=page===0;next.disabled=(page+1)*size>=rows.length;exp.disabled=!rows.length;
   exp.onclick=()=>csv('project-search.csv',[['Регион ISO','Регион','Тип источника','Номер записи','Проект','Инвестор','Наличие инвестора','Отрасль источника','Место','Статус','Стадия','Срок','Стоимость, млн руб.','Рабочие места','Редакция','Источник','Лист','Строка','SHA-256','Отпечаток манифеста'],...rows.map(r=>[r.iso,r.region,r.kind,r.record,r.name,r.investor,r.investorAvailability,r.sector,r.location,r.status,r.stage,r.period,r.cost,r.jobs,r.edition,r.source,r.sheet,r.row,r.sha256,m.data_fingerprint])]);
  }
  for(const el of [iso,query,sector,state,numeric])el.disabled=false;
  iso.onchange=options;query.oninput=sector.onchange=state.onchange=numeric.onchange=()=>{page=0;draw()};prev.onclick=()=>{page--;draw()};next.onclick=()=>{page++;draw()};options();
 }catch(e){status.textContent='Поиск недоступен: '+String(e.message||e);}
});
