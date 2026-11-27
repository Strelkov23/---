/* Reuse the independent statistics comparison rules in the AI report. */
const IV=require("./iv-comparison.js");
const build=function core(iv,stamp){
 const result=iv.pairs.map(p=>{
 const a=iv.audit(p);
 const allowed=a.verdict==="same_origin"?"transfer_check_only":a.verdict==="candidate"?"verify_observations_first":p.id==="eurostat-balance"?"identity_check_only":"no_direct_comparison";
 return {id:p.id,title:p.title,left:p.a,right:p.b,checks:a.checks,origin_channels:p.origin,distinct_channels:a.independent,verdict:a.verdict,allowed,notes:p.notes,href:p.link}
 });
 return {schema:1,built:stamp,note:"Методологическая проверка паспортов; различие каналов не доказывает независимость. Ни один паспорт сам по себе не разрешает числовую сверку. Для расчёта нужны проверенные сопоставимые наблюдения.",rows:result,counts:Object.fromEntries(["different","unknown","candidate","same_origin"].map(k=>[k,result.filter(r=>r.verdict===k).length]))}
};
module.exports={build};
if(require.main===module){
 const fs=require("node:fs"),path=require("node:path"),out=process.argv[2],stamp=process.argv[3];
 if(!out||!stamp||!Number.isFinite(Date.parse(stamp)))throw Error("Build arguments");
 fs.writeFileSync(path.join(out,"economic-ai-comparability.json"),JSON.stringify(build(IV,stamp)),"utf8");
}
