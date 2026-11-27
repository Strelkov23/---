/* Prospective scorecard, independently of local inference. */
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",async()=>{
 const $=id=>document.getElementById("eaif-"+id);if(!$("status"))return;
 const add=(parent,tag,text)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e};
 try{const m=await Provenance.validateManifest(await load("data-manifest.json"));const d=(await Provenance.get(m,"economic-ai-forecast-memory.json",root)).data;
 if(d.schema!==1||!Array.isArray(d.rows)||!Array.isArray(d.summary))throw Error("Schema");
 const scored=d.rows.filter(r=>r.first_actual!==null);
 $("status").textContent="Зафиксировано: "+d.rows.length+" · оценено: "+scored.length+" · ожидают наблюдений: "+(d.rows.length-scored.length)+" · исключено по лимиту: "+d.dropped;
 for(const r of d.summary.slice(0,30))add($("summary"),"li",r.code+" · горизонт "+r.horizon+" · n="+r.n+" · MAE "+r.mae.toPrecision(4)+" "+r.unit+" · простая модель "+r.naive_mae.toPrecision(4)+" · "+(r.status==="small_sample"?"малая выборка":"диагностика"));
 if(!d.summary.length)add($("summary"),"li","Пока нет завершённых прогнозов. Факты поступят из обновляемой статистики.");
 for(const r of d.rows.slice(0,30))add($("rows"),"li",r.title+" · "+r.target+" · прогноз "+r.point.toPrecision(5)+" "+r.unit+" · зафиксирован "+r.issued.slice(0,10)+" · "+(r.first_actual===null?"ожидается факт":"первый факт "+r.first_actual+"; последняя редакция "+(r.latest_actual??"отсутствует")));
 }catch(e){$("status").textContent="Журнал недоступен или не прошёл контроль целостности."}
});
