/* Exact-byte verification of published data. Requires HTTPS or localhost. */
const Provenance=(()=>{
 const validPath=name=>name==='federal-budget.csv'||typeof name==='string'&&/^(?:regional-data\/)?[A-Za-z0-9_.-]+\.(?:json|geojson)$/.test(name)&&!name.split('/').some(x=>x==='..');
 function hex(bytes){return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('')}
 async function digest(bytes){if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен: требуется защищённое соединение');return hex(await crypto.subtle.digest('SHA-256',bytes))}
 async function validateManifest(m){
  if(m?.schema!=='1'||!m.files||typeof m.files!=='object'||!/^[a-f0-9]{64}$/.test(m.data_fingerprint||''))throw Error('Некорректный манифест');
  const entries=Object.entries(m.files).sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(!entries.length||entries.some(([k,v])=>!validPath(k)||!/^[a-f0-9]{64}$/.test(v?.sha256||'')||!Number.isSafeInteger(v.bytes)||v.bytes<0))throw Error('Некорректные записи манифеста');
  const canonical=entries.map(([k,v])=>k+'\t'+v.sha256+'\t'+v.bytes+'\n').join('');
  if(await digest(new TextEncoder().encode(canonical))!==m.data_fingerprint)throw Error('Отпечаток манифеста не совпадает');
  return m;
 }
 async function verify(m,name,bytes){
  if(!validPath(name)||!Object.prototype.hasOwnProperty.call(m.files,name))throw Error('Файл не входит в манифест: '+name);
  const v=m.files[name];
  if(bytes.byteLength!==v.bytes||await digest(bytes)!==v.sha256)throw Error('Контрольная сумма или размер не совпадают: '+name+'. Обновите страницу.');
  return v.sha256;
 }
 async function getBytes(m,name,base=''){
  if(!validPath(name)||!Object.prototype.hasOwnProperty.call(m.files,name))throw Error('Файл не входит в манифест: '+name);
  const response=await fetch(base+name,{cache:'no-cache'});if(!response.ok)throw Error('Файл недоступен: '+name);
  const bytes=await response.arrayBuffer(),sha256=await verify(m,name,bytes);
  return {bytes,sha256};
 }
 async function get(m,name,base=''){
  if(!/\.(?:json|geojson)$/.test(name))throw Error('Ожидается JSON-набор');
  const {bytes,sha256}=await getBytes(m,name,base);
  return {data:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256};
 }
 return {digest,validateManifest,verify,get,getBytes,validPath};
})();
if(typeof module!=='undefined')module.exports=Provenance;
