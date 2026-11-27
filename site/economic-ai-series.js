/* Deterministic published-series retrieval and year-over-year comparison. */
const EconomicAISeries=(function seriesCore(){
 const allowed=new Set(["wdi","national","cbr","industry","energy","fbs","finance_original"]);
 const month=s=>typeof s==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
 function dateKey(s){if(typeof s!=="string")return null;if(/^\d{4}$/.test(s))return s+"-12-31";if(month(s))return s+"-31";if(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s))return s;return null}
 function eligible(r){return !!r&&allowed.has(r.group)&&r.mode==="auto"&&r.count>0&&r.territory==="Россия"&&r.measurement_kind!=="Цель, не фактическое наблюдение"&&typeof r.id==="string"&&typeof r.file==="string"&&/^[a-zA-Z0-9_-]+\.json$/.test(r.file)}
 function search(rows,q){const words=String(q||"").toLowerCase().replace(/ё/g,"е").trim().split(/\s+/).filter(Boolean).slice(0,8);return rows.filter(eligible).map(r=>{const title=String(r.title).toLowerCase().replace(/ё/g,"е"),text=(title+" "+r.code+" "+r.group).toLowerCase();return {r,score:words.every(w=>text.includes(w))?words.reduce((a,w)=>a+(title.includes(w)?3:1),0):-1}}).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.r.id.localeCompare(b.r.id)).slice(0,25).map(x=>x.r)}
 function summarize(r,observations,cutoff){
  if(!eligible(r)||!month(cutoff))throw Error("Некорректный ряд или период");
  const rows=observations.filter(v=>v.territory===r.territory&&v.unit===r.unit&&Number.isFinite(v.value)&&dateKey(v.period)&&dateKey(v.period)<=cutoff+"-31").sort((a,b)=>dateKey(b.period).localeCompare(dateKey(a.period)));
  if(!rows.length)return null;
  const last=rows[0];if(rows.filter(x=>x.period===last.period).length!==1)throw Error("Неоднозначный период");
  const p=last.period;const prior=String(Number(p.slice(0,4))-1)+p.slice(4);
  const candidates=rows.filter(x=>x.period===prior&&x.period.length===p.length);
  const prev=candidates.length===1?candidates[0]:null;
  const round=x=>Number(x.toPrecision(10));
  const diff=prev?last.value-prev.value:null;
  // A relative rate of change is not meaningful for negative bases, rate series,
  // or units whose percentage interpretation is unknown.
  const rateUnit=/%|процент|п\.?\s*п\.?|индекс|балл/i.test(r.unit||"");
  const relative=prev&&prev.value>0&&last.value>=0&&!rateUnit?100*diff/prev.value:null;
  return {id:"series",registryId:r.id,title:r.title,source:last.source||r.source,url:last.source||r.source,period:p,value:last.value,unit:r.unit,verification:"published_manifest",checked:r.success||null,age:null,limit:"Опубликованный ряд; целостность не доказывает методологическую достоверность. "+String(last.method_caution||r.method_caution||"См. паспорт ряда").slice(0,400),comparison:prev?{period:prev.period,value:prev.value,source:prev.source||r.source,absolute:Number.isFinite(diff)?round(diff):null,relativePercent:Number.isFinite(relative)?round(relative):null}:null};
 }
 return {eligible,search,summarize,dateKey};
})();
if(typeof module!=="undefined")module.exports=EconomicAISeries;
