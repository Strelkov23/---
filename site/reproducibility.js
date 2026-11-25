document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);if(!$('repro-file'))return;
 try{
  const m=await Provenance.validateManifest(await load('data-manifest.json'));
  $('repro-status').textContent='Сборка: '+m.built+' · Файлов: '+Object.keys(m.files).length+' · отпечаток проверен.';
  const archive=version||'не определена';
  $('repro-version').textContent='Ревизия архива: '+archive;
  if(/^[a-f0-9]{40}$/i.test(archive)){const a=document.createElement('a');a.href='data-registry.html?snapshot='+archive;a.textContent=' · Открыть каталог этой версии';$('repro-version').append(a)}
  $('repro-source').textContent='Ревизия исходного кода: '+(m.source_revision||'не определена');
  $('repro-fingerprint').textContent='Отпечаток данных: '+m.data_fingerprint;
  const select=$('repro-file');for(const k of Object.keys(m.files).sort())select.add(new Option(k,k));
  select.value='data-registry.json';$('repro-verify').disabled=false;
  $('repro-verify').onclick=async()=>{const key=select.value;$('repro-verify').disabled=true;$('repro-result').textContent='Проверка…';try{const r=await Provenance.getBytes(m,key,root);$('repro-result').textContent='Совпадает: '+key+' · SHA-256 '+r.sha256}catch(e){$('repro-result').textContent='Не подтверждено: '+e.message}finally{$('repro-verify').disabled=false}};
 }catch(e){$('repro-status').textContent='Манифест не подтверждён: '+e.message}
});
