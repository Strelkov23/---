/* Physical evidence report built from existing, source-qualified data. */
const IVPhysical=require("./iv-physical.js"),IVEmber=require("./iv-ember.js");
const core=function physicalCore(physical,ember,stamp,IVPhysical,IVEmber){
 const closed=Number(stamp.slice(0,4))-1,asof=stamp.slice(0,10);
 if(!Number.isInteger(closed)||closed<1992||!Number.isFinite(Date.parse(stamp)))throw Error("Invalid build period");
 const finite=v=>Number.isFinite(v)&&v>=0;
 const safe=u=>typeof u==="string"&&/^https:\/\/[a-z0-9.-]+(?:\/[^\s\\]*)?$/i.test(u);
 const rows=[];
 IVPhysical.validate(physical);
 for(const c of physical.companies){
  const verified=r=>!!r&&(c.verification==="source_rechecked"||r.verification==="source_rechecked")&&/^\d{4}-\d{2}-\d{2}$/.test(c.verification_date||"")&&c.verification_date<=asof&&safe(r.source||c.source);
  for(const m of c.metrics){
   const all=c.rows.filter(r=>r.year<=closed&&finite(r[m.id])).sort((a,b)=>b.year-a.year);
   const v=all.find(verified),prev=v?all.find(r=>r.year===v.year-1&&verified(r)):null;
   const change=v&&prev?IVPhysical.compare(c,m.id,v.year,prev.year).yoy:null;
   rows.push({id:c.id+"-"+m.id,title:c.title+": "+m.title,origin:c.origin,scope:c.scope,unit:m.unit,year:v?.year??null,value:v?v[m.id]:null,yoy:Number.isFinite(change)?change:null,prior_year:prev?.year??null,source:v?(v.source||c.source):null,reference:v?(v.reference||c.page):null,checked:v?c.verification_date:null,verification:v?"document_rechecked":"pending",newer_unverified:!!(v&&all[0]?.year>v.year),latest_available_year:all[0]?.year??null,limit:"Корпоративное раскрытие, не национальный показатель и не независимый аудит. Метод сверки: "+(c.verification_method||"не указан")});
  }
 }
 if(ember.schema!=="iv-ember-v1"||ember.unit!=="TWh"||!Array.isArray(ember.rows)||new Set(ember.rows.map(r=>r.year)).size!==ember.rows.length)throw Error("Invalid Ember archive");
 const accepted=!!(safe(ember.source)&&safe(ember.documentation)&&typeof ember.success==="string"&&Number.isFinite(Date.parse(ember.success))&&Date.parse(ember.success)<=Date.parse(stamp)&&/^[a-f0-9]{64}$/.test(ember.sha256||""));
 for(const [key,label] of Object.entries(IVEmber.labels)){
  const all=ember.rows.filter(r=>Number.isInteger(r.year)&&r.year<=closed&&finite(r.values?.[key])).sort((a,b)=>b.year-a.year);
  const v=accepted?all[0]:null,r=v?IVEmber.compare(ember.rows,v.year,key):null;
  rows.push({id:"ember-"+key,title:"Ember: "+label,origin:"external_compilation",scope:"Россия, годовая выработка электроэнергии по классификации Ember",unit:"ТВт·ч",year:v?.year??null,value:r?.value??null,yoy:Number.isFinite(r?.change)?r.change:null,prior_year:v&&Number.isFinite(r?.change)?v.year-1:null,source:accepted?ember.source:null,reference:accepted?ember.documentation:null,checked:accepted?ember.success:null,verification:v?"machine_import":"pending",newer_unverified:false,latest_available_year:all[0]?.year??null,limit:"Внешняя компиляция; может использовать официальные российские данные. Не доказательство независимого измерения. "+(ember.error?"Последняя загрузка не удалась; сохранён архив.":"")});
 }
 const counts={document_rechecked:0,machine_import:0,pending:0};
 for(const r of rows){counts[r.verification]++;r.age=r.year===null?null:closed-r.year;if(r.value!==null&&!finite(r.value))throw Error("Invalid value");}
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error("Duplicate physical metric");
 return {schema:1,built:stamp,closed_year:closed,note:"Раздельные физические показатели, без сложения разных продуктов и без экстраполяции на экономику России. Годовой темп только по сопоставимому предыдущему году с проверенными наблюдениями. Статус сверки относится к архиву и источнику, не к независимому аудиту.",counts,rows};
};
const build=(physical,ember,stamp)=>core(physical,ember,stamp,IVPhysical,IVEmber);
module.exports={build};
if(require.main===module){const fs=require("node:fs"),path=require("node:path"),out=process.argv[2],stamp=process.argv[3];const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),"utf8"));fs.writeFileSync(path.join(out,"economic-ai-physical.json"),JSON.stringify(build(read("independent-physical.json"),read("independent-ember.json"),stamp)),"utf8");}
