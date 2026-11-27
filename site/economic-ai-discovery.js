/* Discovered WDI rows are separate from the curated Russian-language catalogue. */
const EconomicAIDiscovery=(()=>{
 function list(data,q){const words=String(q||"").toLowerCase().trim().split(/\s+/).filter(Boolean);return Object.entries(data.rows||{}).filter(([code,r])=>["ok","error"].includes(r.status)&&r.success&&Object.keys(r.values||{}).length&&words.every(w=>(code+" "+r.title).toLowerCase().includes(w))).sort(([a],[b])=>a.localeCompare(b))}
 function record(code,r,cutoff){
  if(!/^[A-Z0-9][A-Z0-9_.-]{1,79}$/.test(code)||!r||!["ok","error"].includes(r.status)||!r.success||r.url!=="https://api.worldbank.org/v2/country/RUS/indicator/"+code+"?format=json&per_page=200"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(cutoff))return null;
  const years=Object.keys(r.values||{}).filter(y=>/^\d{4}$/.test(y)&&y+"-12"<=cutoff&&Number.isFinite(r.values[y])).sort();
  if(!years.length)return null;const p=years.at(-1);
  return {id:"discovered",title:r.title,source:"World Bank WDI",period:p,value:r.values[p],unit:r.unit||"единица в названии/методике",url:r.url,age:null,verification:"published_manifest",checked:r.success,status:r.status,limit:(r.status==="error"?"Сохранённые данные после ошибки обновления. ":"")+"Оригинальная методика WDI: "+String(r.definition||"").slice(0,600)};
 }
 return {list,record}
})();
if(typeof module!=="undefined")module.exports=EconomicAIDiscovery;
