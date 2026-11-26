/* Explicit browser-local assumption snapshots. Never store computed results. */
const IVScenarioStore=(()=>{
 const schema='iv-assumptions-v1',key=id=>'iv-assumptions-v1:'+id;
 function pack(id,values,revision,stamp){if(!['policy','trajectory'].includes(id)||!values||typeof values!=='object'||Array.isArray(values))throw Error('Некорректный сценарий');return {schema,id,values:{...values},revision:typeof revision==='string'?revision:'',saved:stamp}}
 function unpack(raw,id,validate){const d=JSON.parse(raw);if(!d||d.schema!==schema||d.id!==id||!d.values||typeof d.values!=='object'||Array.isArray(d.values)||typeof d.saved!=='string'||typeof d.revision!=='string')throw Error('Несовместимый формат сценария');return {...d,values:validate(d.values)}}
 function numeric(v,spec){const out={};for(const [k,min,max,step] of spec){const x=v[k];if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max||step&&Math.abs((x-min)/step-Math.round((x-min)/step))>1e-6)throw Error('Недопустимое значение: '+k);out[k]=x}return out}
 function bind(id,adapter){const $=x=>document.getElementById(id+'-stored-'+x),status=$('status');if(!status)return;const revision=()=>typeof version==='string'?version:'';
 const read=()=>{const raw=localStorage.getItem(key(id));if(!raw)throw Error('Нет сохранённого сценария');return unpack(raw,id,adapter.validate)};
 function refresh(){try{const d=read();$('restore').disabled=$('delete').disabled=false;status.textContent='Сохранён '+d.saved.slice(0,10)+(d.revision?' · архив '+d.revision.slice(0,12):'')+'. Только параметры.'}catch(e){$('restore').disabled=true;$('delete').disabled=false;status.textContent='Нет доступного сохранения: '+e.message}}
 $('save').disabled=false;$('save').onclick=()=>{try{const values=adapter.validate(adapter.capture());localStorage.setItem(key(id),JSON.stringify(pack(id,values,revision(),new Date().toISOString())));refresh()}catch(e){status.textContent='Не сохранено: '+e.message}};
 $('restore').onclick=()=>{try{const d=read();adapter.apply(d.values);status.textContent='Предпосылки восстановлены. '+(id==='trajectory'?'Рассчитайте оба плана заново. ':'')+(id==='trajectory'&&(!d.revision||d.revision!==revision())?'Версия архива отличается или неизвестна: прежние результаты не воспроизводятся автоматически.':'')}catch(e){status.textContent='Не восстановлено: '+e.message}};
 $('delete').onclick=()=>{try{localStorage.removeItem(key(id));refresh()}catch(e){status.textContent='Не удалено: '+e.message}};refresh()
 }
 return {pack,unpack,numeric,bind,key}
})();
if(typeof module!=='undefined')module.exports=IVScenarioStore;
