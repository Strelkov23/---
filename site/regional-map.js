/* Exact ISO 3166-2 to conservative statistical keys. No fuzzy territorial joins.
   The composite oblasts (ARK, TYU) are deliberately not joined because source
   polygons may include autonomous districts. Disputed / historical units remain uncoloured. */
const RegionalMap=(()=>{
 const pairs={
 BEL:'белгородская область',BRY:'брянская область',VLA:'владимирская область',VOR:'воронежская область',IVA:'ивановская область',KLU:'калужская область',KOS:'костромская область',KRS:'курская область',LIP:'липецкая область',MOS:'московская область',ORL:'орловская область',RYA:'рязанская область',SMO:'смоленская область',TAM:'тамбовская область',TVE:'тверская область',TUL:'тульская область',YAR:'ярославская область',VLG:'вологодская область',KGD:'калининградская область',LEN:'ленинградская область',MUR:'мурманская область',NGR:'новгородская область',PSK:'псковская область',AST:'астраханская область',VGG:'волгоградская область',ROS:'ростовская область',KIR:'кировская область',NIZ:'нижегородская область',ORE:'оренбургская область',PNZ:'пензенская область',SAM:'самарская область',SAR:'саратовская область',ULY:'ульяновская область',KGN:'курганская область',SVE:'свердловская область',CHE:'челябинская область',IRK:'иркутская область',KEM:'кемеровская область',NVS:'новосибирская область',OMS:'омская область',TOM:'томская область',AMU:'амурская область',MAG:'магаданская область',SAK:'сахалинская область',
 ALT:'алтайский край',ZAB:'забайкальский край',KAM:'камчатский край',KDA:'краснодарский край',KYA:'красноярский край',PER:'пермский край',PRI:'приморский край',STA:'ставропольский край',KHA:'хабаровский край',
 AD:'адыгея',AL:'алтай',BA:'башкортостан',BU:'бурятия',DA:'дагестан',IN:'ингушетия',KL:'калмыкия',KR:'карелия',KO:'коми',ME:'марий эл',MO:'мордовия',SA:'саха (якутия)',SE:'северная осетия - алания',TA:'татарстан',TY:'тыва',UD:'удмуртия',KK:'хакасия',CE:'чечня',CU:'чувашия',KC:'карачаево-черкесия',KB:'кабардино-балкария',
 KHM:'ханты-мансийский автономный округ',YAN:'ямало-ненецкий автономный округ',NEN:'ненецкий автономный округ',CHU:'чукотский автономный округ',YEV:'еврейская автономная область',MOW:'москва',SPE:'санкт-петербург'};
 function key(code){return typeof code==='string'&&code.startsWith('RU-')&&Object.prototype.hasOwnProperty.call(pairs,code.slice(3))?pairs[code.slice(3)]:null}
 // Lambert azimuthal equal-area, central longitude 100 E, latitude 65 N.
 function project(lon,lat){
  const rad=Math.PI/180,l=(lon-100)*rad,p=lat*rad,p0=65*rad;
  const d=1+Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l);
  if(d<=1e-9)return null;
  const k=Math.sqrt(2/d);return [k*Math.cos(p)*Math.sin(l),-k*(Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l))];
 }
 function rings(g){return g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[]}
 function classes(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return [];
  const q=p=>{const i=(sorted.length-1)*p,j=Math.floor(i);return sorted[j]+(sorted[Math.min(j+1,sorted.length-1)]-sorted[j])*(i-j)};
  return [...new Set([0,.2,.4,.6,.8,1].map(q))];
 }
 function bin(v,thresholds){if(!Number.isFinite(v)||!thresholds.length)return -1;if(thresholds.length===1)return 0;const i=thresholds.slice(1).findIndex(t=>v<=t);return i<0?thresholds.length-2:i}
 const industryThemes=[
 ['light','Лёгкая промышленность','ЛП',/производств[ао]\s+(?:текстильн[а-я]*|одежд[а-я]*|кожи|кожаных изделий)|текстильное и швейное производство/iu],
 ['chemical','Химическая промышленность','ХИМ',/производств[ао]\s+химическ|химическое производство/iu],
 ['food','Пищевая промышленность','ПИЩ',/производств[ао]\s+пищевых продуктов|производств[ао]\s+напитков/iu],
 ['metal','Металлургия','МЕТ',/металлургическ[а-я]+\s+производств[ао]/iu],
 ['machinery','Машиностроение','МАШ',/производств[ао]\s+(?:машин и оборудования|автотранспортных средств|прочих транспортных средств|электрического оборудования|компьютеров,? электронных)/iu],
 ['energy','Энергетика','ЭН',/обеспечени[ея]\s+электрической энергией|производств[ао]\s+и распределени[ея]\s+электроэнергии/iu]];
 function industryTheme(title,source){
  if(!/\/data_(?:12_socio_economic|industry)_102_v20260313\.zip$/.test(String(source)))return null;
  const t=String(title||'').toLowerCase().replaceAll('ё','е');
  const matches=industryThemes.filter(x=>x[3].test(t));return matches.length===1?matches[0][0]:null
 }
 const palettes={
  economy:['#e8f3fb','#b6d9ee','#75b5db','#367fb8','#124577'],
  industry:['#f4e7df','#e7bd9c','#cf8e59','#a65c31','#703311'],
  light:['#f9e8f1','#ebbad5','#d985b6','#a84c89','#762559'],
  chemical:['#f0eafa','#d5c4ec','#b49cdb','#8061ba','#4b2e83'],
  food:['#fff4cf','#f5d88a','#dcb14d','#ad7b12','#704b07'],
  metal:['#e8edf2','#bfcbd7','#8da3b7','#536f8b','#263f57'],
  machinery:['#e4f4f8','#aadce7','#68b8ca','#277e96','#104c66'],
  mining:['#efe9df','#d8c5a7','#b89b70','#886a43','#503b23'],
  energy:['#fff2d9','#ffd19c','#f4a458','#c96519','#87340c'],
  agriculture:['#edf4d7','#c9dea2','#91bd67','#548b36','#2d551c'],
  investment:['#f4edfa','#d9c6e9','#b09ad2','#8263b2','#503980'],
  labor:['#e2f4f0','#b1ddd1','#6fbbaa','#368b79','#155b4e'],
  budget:['#eee9fa','#d6caed','#b6a0db','#8065b4','#503584'],
  people:['#fff0ec','#f8c8be','#e99b90','#bf605c','#823639'],
  construction:['#fcf0db','#f1d09b','#d8a657','#ac7933','#724915'],
  trade:['#e2f3ee','#b0dcd0','#70b9a5','#358b75','#155844'],
  transport:['#edf0fa','#c7d2ed','#92a9d7','#577ab7','#294a82'],
  innovation:['#f6e9f6','#e1c5e2','#c39ac6','#9a619f','#64386c'],
  enterprises:['#e7f0f3','#b5d3dc','#81b2c0','#4c8495','#255563'],
  living:['#fdf1e7','#f3d0b3','#dca67e','#aa704a','#714024'],
  capital:['#e6edf5','#becfe2','#86a6c5','#4c789e','#21466b'],
  ict:['#e5f6fa','#b2e3ed','#72c7d9','#3295b2','#145974'],
  prices:['#fce9ed','#efbfc9','#d98598','#ac4d68','#772941'],
  foreign_trade:['#e8f4dc','#c4e0ac','#95c37e','#61954d','#315b2d'],
  contrast:['#fff4cb','#f5c36b','#cf873e','#895b8b','#34235d'],
  all:['#e3f1ea','#b6dacb','#75b7a7','#388c83','#075953']};
 function palette(theme,choice='auto',growth=false){
  if(growth)return ['#a53e35','#e8a39b','#f0f0ed','#a3d6bc','#207a57'];
  return [...(palettes[choice==='auto'?theme:choice]||palettes.all)]
 }
 const manufacturingThemes={total:'industry',light:'light',chemical:'chemical',food:'food',metal:'metal',wood:'industry',print:'industry',oil_rubber:'industry',minerals:'industry',electronics:'machinery',machinery:'machinery',vehicles:'machinery',furniture:'industry',repair:'industry'};
 function theme(code,source='',title=''){
 if(/^SHIP_(?:mining_total|coal|oil_gas|metal_ores|other_mining|mining_services)_/.test(code))return 'mining';
 if(/^SHIP_(?:energy_total|electricity|gas_distribution|heat)_/.test(code))return 'energy';
 const mfg=Object.keys(manufacturingThemes).find(k=>String(code).startsWith('MFG_'+k+'_'));if(mfg)return manufacturingThemes[mfg];
 const sub=industryTheme(title,source);if(sub)return sub;
 if(/\/data_farming_102_v20260313\.zip$/.test(String(source)))return 'agriculture';
 const section=String(source).match(/\/data_(03|09|11|13|14|15|16|17|18|20|21)_socio_economic_102_v20260313\.zip$/)?.[1];
 if(section)return {'03':'living','09':'capital','11':'enterprises','13':'agriculture','14':'construction','15':'trade','16':'transport','17':'ict','18':'innovation','20':'prices','21':'foreign_trade'}[section];
 if(/^(GRP_|NW_GRP_|R_024d9416ea6f54dc_|R_7e8fd799d1d06897_|R_f54f02504bfb051e_)/.test(code))return 'economy';
 if(/^R_(347ab451705a6d33|425e9fbbe745e4e6|5f09b90031e93f90|c4e8751efbd23309)_/.test(code)||/\/data_(?:12_socio_economic|industry)_102_v20260313\.zip$/.test(source))return 'industry';
 if(/^R_(66b96177c45a01ad|6887143295c72599|88230ed30f2f2738|90575f546cc99ce3)_/.test(code))return 'investment';
 if(/^R_(65254a01945743d3|a4138d558584b81a|b8ff4db9a1b3092e|e8fd80380742955e)_/.test(code))return 'labor';
 if(/^R_(510509d40d0cb785|77976ed27f49b4fd|8728bc736516e87c|b7f9afa8b1ac06d9)_/.test(code))return 'budget';
 if(/^(HH_CONS_|R_(2308ddd83ecf600c|88f3fb354016c809|b772cc7700d0fcd7|f39e59bbabc208f3)_)/.test(code))return 'people';
 return 'all';
}
 function inTheme(s,id){
  const t=theme(s.code,s.source,s.title);return id==='all'||id===t||(id==='industry'&&(t==='mining'||industryThemes.some(x=>x[0]===t)))
 }
 function coverage(catalog,id){
  const items=catalog.filter(s=>inTheme(s,id)),years=items.map(s=>s.last).filter(Number.isInteger),regions=items.map(s=>s.regions).filter(Number.isInteger);
  return {count:items.length,latest:years.length?Math.max(...years):null,maxRegions:regions.length?Math.max(...regions):null}
 }
 function isGrowth(code,title='',unit=''){return /^(GRP_(PC_)?VOLUME_|R_(024d9416ea6f54dc|347ab451705a6d33|425e9fbbe745e4e6|5f09b90031e93f90|66b96177c45a01ad)_)/.test(code)||(/^индекс/i.test(title)&&/к предыдущему году/i.test(unit)&&/(?:%|процент)/i.test(unit))}
 function growthBin(v){return !Number.isFinite(v)?-1:v<95?0:v<100?1:v===100?2:v<=105?3:4}
 const displayNames={...pairs,ARK:'архангельская область',TYU:'тюменская область'};
 function displayName(code,original){
  const name=typeof code==='string'&&code.startsWith('RU-')&&Object.prototype.hasOwnProperty.call(displayNames,code.slice(3))?displayNames[code.slice(3)]:null;
  if(name)return name[0].toUpperCase()+name.slice(1);
  return typeof original==='string'&&original.trim()?original:'Контур без названия';
 }
 // Compare only observations from the same exact series and consecutive calendar years.
 function trend(current,previous,unit,index=false){
  if(!current||!Number.isFinite(current.value))return null;
  if(index)return {type:'index',delta:current.value-100,base:100,year:current.year};
  if(!previous||previous.year!==current.year-1||!Number.isFinite(previous.value))return null;
  const delta=current.value-previous.value;
  const percentage=/процент|%/i.test(String(unit));
  if(percentage)return {type:'points',delta,base:previous.value,year:previous.year};
  if(previous.value<=0||current.value<0)return {type:'absolute',delta,base:previous.value,year:previous.year};
  return {type:'relative',delta:100*delta/previous.value,base:previous.value,year:previous.year}
 }
 function compareRows(items,codes){
  const ranked=items.filter(x=>Number.isFinite(x.value)).sort((a,b)=>b.value-a.value),base=items.find(x=>x.code===codes[0])?.value;
  return [...new Set(codes.filter(Boolean))].map(code=>{
   const item=items.find(x=>x.code===code);if(!item)return null;
   const value=Number.isFinite(item.value)?item.value:null;
   return {...item,value,rank:value===null?null:1+ranked.filter(x=>x.value>value).length,
    difference:value!==null&&Number.isFinite(base)?value-base:null,
    ratio:value!==null&&Number.isFinite(base)&&base>0&&value>=0?100*value/base:null};
  }).filter(Boolean)
 }
 function passportTheme(id){return ({industry:'manufacturing',mining:'mining',light:'light',chemical:'chemical',food:'food',metal:'metal',machinery:'machinery',energy:'energy',agriculture:'agriculture',transport:'transport',ict:'digital',innovation:'technology'})[id]||null}
 function rankProfileCandidates(catalog,id,limit=4){
  return catalog.filter(s=>theme(s.code,s.source,s.title)===id).sort((a,b)=>b.last-a.last||Number(isGrowth(b.code,b.title,b.unit))-Number(isGrowth(a.code,a.title,a.unit))||b.count-a.count||String(a.code).localeCompare(String(b.code))).slice(0,limit)
 }
 function chooseProfileObservation(items){
  return items.filter(x=>x.r&&Number.isFinite(x.r.value)).sort((a,b)=>b.r.year-a.r.year||Number(isGrowth(b.m.code,b.m.title,b.m.unit))-Number(isGrowth(a.m.code,a.m.title,a.m.unit))||b.m.count-a.m.count||String(a.m.code).localeCompare(String(b.m.code)))[0]||null
 }
 function profileObservation(values,key,year,sample){
  if(!key||!Number.isInteger(year))return null;
  const years=[...new Set(values.map(r=>r.year).filter(y=>Number.isInteger(y)&&y<=year))].sort((a,b)=>b-a);
  for(const y of years){const r=sample(values.filter(v=>v.year===y)).out.get(key);if(r)return r}
  return null
 }
 return {key,project,rings,classes,bin,theme,industryTheme,industryThemes,palette,inTheme,coverage,isGrowth,growthBin,displayName,profileObservation,rankProfileCandidates,chooseProfileObservation,passportTheme,trend,compareRows,regionNames:()=>Object.fromEntries(Object.entries(pairs).map(([k,v])=>['RU-'+k,v]))};
})();
if(typeof module!=='undefined')module.exports=RegionalMap;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),form=$('geo-form');if(!form)return;
 const pick=$('geo-series'),year=$('geo-year'),status=$('geo-status'),host=$('geo-map'),details=$('geo-detail'),csvButton=$('geo-csv'),source=$('geo-source'),fields=['geo-series','geo-year'],saved=new URLSearchParams(location.search),ns='http://www.w3.org/2000/svg';
 const fmtValue=v=>Number.isFinite(v)?v.toLocaleString('ru',{maximumSignificantDigits:6}):'нет данных';
 const link=(t,u)=>{const a=node('a',t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a};
 let catalog=[],geo=null,meta=null,series=null,seq=0,first=true;
 const palettePick=$('geo-palette');
 const themePick=$('geo-theme'),growthPick=$('geo-scale'),markerPick=$('geo-markers'),regionPick=$('geo-region');
 let chosenRegion=saved.get('geo-region')||'';
 const compareIds=['geo-compare-a','geo-compare-b','geo-compare-c'].filter(id=>$(id));
 const profileEnabled=Boolean($('geo-region')),profileCache=new Map();
 let profileManifest;
 async function mapLoad(file){
  if(!profileEnabled)return load(file);
  if(!profileManifest)profileManifest=load('data-manifest.json').then(Provenance.validateManifest);
  return (await Provenance.get(await profileManifest,file,root)).data
 }
 function profileFile(file){
  if(!profileCache.has(file))profileCache.set(file,mapLoad(file).catch(e=>{profileCache.delete(file);throw e}));
  return profileCache.get(file)
 }
 const profileCodes=[
 [
  "Экономика",
  "GRP_95b8dd2585"
 ],
 [
  "Экономика",
  "GRP_PC_95b8dd2585"
 ],
 [
  "Экономика",
  "GRP_VOLUME_95b8dd2585"
 ],
 [
  "Экономика",
  "GRP_PC_VOLUME_95b8dd2585"
 ],
 [
  "Экономика",
  "GRP_SHARE_95b8dd2585"
 ],
 [
  "Экономика",
  "R_505af17284b98773_fd1adecbd1"
 ],
 [
  "Промышленность",
  "R_347ab451705a6d33_031d7fe105"
 ],
 [
  "Промышленность",
  "R_425e9fbbe745e4e6_031d7fe105"
 ],
 [
  "Промышленность",
  "R_5f09b90031e93f90_031d7fe105"
 ],
 [
  "Промышленность",
  "R_975b9c501d870374_099b62c9d9"
 ],
 [
  "Промышленность",
  "MFG_total_099b62c9d9"
 ],
 [
  "Промышленность",
  "SHIP_mining_total_099b62c9d9"
 ],
 [
  "Промышленность",
  "SHIP_energy_total_099b62c9d9"
 ],
 [
  "Инвестиции и фонды",
  "R_88230ed30f2f2738_bf6a5a3983"
 ],
 [
  "Инвестиции и фонды",
  "R_66b96177c45a01ad_bf6a5a3983"
 ],
 [
  "Инвестиции и фонды",
  "R_90575f546cc99ce3_bf6a5a3983"
 ],
 [
  "Инвестиции и фонды",
  "R_564aea52db01a94a_366f6a2581"
 ],
 [
  "Труд",
  "R_65254a01945743d3_1db3db8e79"
 ],
 [
  "Труд",
  "R_a4138d558584b81a_1db3db8e79"
 ],
 [
  "Труд",
  "R_b8ff4db9a1b3092e_1db3db8e79"
 ],
 [
  "Труд",
  "R_e8fd80380742955e_1db3db8e79"
 ],
 [
  "Бюджет",
  "R_77976ed27f49b4fd_28f4b5b380"
 ],
 [
  "Бюджет",
  "R_8728bc736516e87c_28f4b5b380"
 ],
 [
  "Население и уровень жизни",
  "R_f39e59bbabc208f3_4c391d1044"
 ],
 [
  "Население и уровень жизни",
  "HH_CONS_PC_95b8dd2585"
 ],
 [
  "Население и уровень жизни",
  "R_78abb4e04b10f5df_bd2b25cb51"
 ],
 [
  "Население и уровень жизни",
  "R_11c9b1e4fe44cfc1_bd2b25cb51"
 ],
 [
  "Население и уровень жизни",
  "R_88f3fb354016c809_4c391d1044"
 ],
 [
  "Население и уровень жизни",
  "R_2308ddd83ecf600c_4c391d1044"
 ],
 [
  "Сельское хозяйство",
  "R_9b96293c7c45f30c_f2cb408b61"
 ],
 [
  "Сельское хозяйство",
  "R_d7e928d7b9e2a713_f2cb408b61"
 ],
 [
  "Строительство",
  "R_71188b5f455e6cd2_1cd8b8a232"
 ],
 [
  "Строительство",
  "R_fca0666f3b1929ac_1cd8b8a232"
 ],
 [
  "Торговля и услуги",
  "R_1f8efa58e94578b7_fca0b9a0b9"
 ],
 [
  "Торговля и услуги",
  "R_d20ed9bce6fc8595_fca0b9a0b9"
 ],
 [
  "Торговля и услуги",
  "R_4ea7f66d299541fc_fca0b9a0b9"
 ],
 [
  "Транспорт",
  "R_305945e51ba007cf_3ff9a059d6"
 ],
 [
  "Транспорт",
  "R_84a6f15f95d32308_3ff9a059d6"
 ],
 [
  "Транспорт",
  "R_a9a6e02e2fd5305c_3ff9a059d6"
 ],
 [
  "Транспорт",
  "R_fcf23e371a2160e4_3ff9a059d6"
 ],
 [
  "Инновации",
  "R_74c11af622ab2ebd_d4010eb82b"
 ],
 [
  "Цены",
  "R_9a4b6e147c8d1ce5_d3c672e059"
 ],
 [
  "Цены",
  "R_f92915777d319fd8_d3c672e059"
 ]
];
 function addProfile(f,Y){
  if(!profileEnabled)return;
  const section=node('details','');section.className='geo-profile';section.append(node('summary','Экономическое досье региона · '+profileCodes.length+' показателя'));
  const info=node('p','Показаны наблюдения за выбранный год или последнее доступное значение не позднее этого года. Разные годы не сопоставляются автоматически.');
  const body=node('div',''),status=node('p','Раскройте досье для загрузки.');status.setAttribute('role','status');section.append(info,status,body);details.append(section);
  let loaded=false,busy=false;
  section.ontoggle=async()=>{
   if(!section.open||loaded||busy)return;
   if(!f.key){status.textContent='Нет однозначного статистического соответствия для этого контура.';return}
   busy=true;status.textContent='Загрузка проверенных рядов…';
   try{
    const work=async([group,code])=>{
     const m=catalog.find(s=>s.code===code);if(!m)return {group,code,error:'Ряд отсутствует'};
     try{const data=await profileFile(m.file),r=RegionalMap.profileObservation(data.values,f.key,Y,RegionalStats.sample);
      return {group,code,title:m.title,unit:m.unit,source:data.source,kind:m.kind,file:m.file,r}
     }catch(e){return {group,code,title:m.title,unit:m.unit,error:'Не удалось проверить ряд'}}
    };
    // Limit simultaneous downloads of long regional series. Reuse verified cache.
    const results=[];
    for(let i=0;i<profileCodes.length;i+=6){results.push(...await Promise.all(profileCodes.slice(i,i+6).map(work)));if(!section.isConnected)return}
    if(!section.isConnected)return;
    const manifest=await profileManifest;
    const filter=node('select','');filter.setAttribute('aria-label','Раздел досье');
    filter.append(new Option('Все разделы',''),...[...new Set(results.map(r=>r.group))].map(g=>new Option(g,g)));
    const label=node('label','Раздел досье');label.append(filter);
    const available=node('input','');available.type='checkbox';const availableLabel=node('label',' Только с наблюдениями');availableLabel.prepend(available);
    const table=node('table',''),thead=table.createTHead().insertRow(),tbody=table.createTBody();
    for(const v of ['Раздел','Показатель','Значение','Год','Источник'])thead.append(node('th',v));
    const filtered=()=>results.filter(v=>(!filter.value||filter.value===v.group)&&(!available.checked||v.r));
    function render(){tbody.replaceChildren();for(const v of filtered()){const tr=tbody.insertRow();tr.insertCell().textContent=v.group;tr.insertCell().textContent=v.title||v.code;tr.insertCell().textContent=v.error||(!v.r?'Нет наблюдения':fmtValue(v.r.value)+' '+v.unit);tr.insertCell().textContent=v.r?String(v.r.year)+(v.r.year!==Y?' (ранее)':''):'—';const cell=tr.insertCell();if(v.source&&/^https?:\/\//i.test(v.source))cell.append(link('Источник',v.source));else cell.textContent='—'};status.textContent='Доступно: '+results.filter(v=>v.r).length+' из '+results.length+' · в таблице: '+filtered().length+' · за выбранный год: '+results.filter(v=>v.r?.year===Y).length+(results.some(v=>v.error)?' · недоступных рядов: '+results.filter(v=>v.error).length:'');}
    filter.onchange=render;available.onchange=render;
    const exportButton=node('button','Скачать досье CSV');exportButton.type='button';
    exportButton.onclick=()=>csv('regional-profile-'+f.f.properties.iso_3166_2+'-'+Y+'.csv',[['Регион карты','Регион источника','Выбранный год','Раздел','Код','Показатель','Год наблюдения','Значение','Единица','Источник','Метод получения','Статус','Лист','Строка','Столбец','Примечание','Файл архива','SHA-256 JSON','Отпечаток манифеста'],...filtered().map(v=>[RegionalMap.displayName(f.f.properties.iso_3166_2,f.f.properties.name),v.r?.region,Y,v.group,v.code,v.title,v.r?.year,v.r?.value??'',v.unit,v.source,v.kind,v.error||(!v.r?'Нет наблюдения':v.r.year===Y?'Выбранный год':'Более ранний год'),v.r?.sheet,v.r?.row,v.r?.column,v.r?.note,v.file,manifest.files[v.file]?.sha256,manifest.data_fingerprint])]);
    const wrap=node('div','');wrap.className='table-scroll';wrap.append(table);
    body.replaceChildren(label,availableLabel,wrap,exportButton);render();loaded=!results.some(v=>v.error&&v.error!=='Ряд отсутствует');
   }catch(e){if(section.isConnected)status.textContent='Не удалось проверить досье: '+String(e.message||e)}finally{busy=false}
  }
 }
 function addBrief(f){
  if(!profileEnabled)return;
  const box=node('section','');box.className='geo-brief';box.append(node('h4','Последние доступные сведения о регионе'));
  const state=node('p','Загрузка справки…');state.setAttribute('role','status');box.append(state);
  const cards=node('div','');cards.className='geo-brief-grid';box.append(cards);details.append(box);
  const y=Math.max(0,...catalog.map(s=>s.last).filter(Number.isInteger));
  const primary=[['Численность населения','R_f39e59bbabc208f3_4c391d1044'],['ВРП на человека','GRP_PC_95b8dd2585'],['Промышленный индекс','R_347ab451705a6d33_031d7fe105'],['Безработица','R_a4138d558584b81a_1db3db8e79']];
  const subsectors=RegionalMap.industryThemes.map(([id,label,symbol])=>[label,RegionalMap.rankProfileCandidates(catalog,id).map(s=>s.code),id,symbol]);
  async function item([label,code,id,symbol]){
   const card=node('article','');card.className='geo-brief-item';if(id){const icon=node('span',symbol);icon.className='sector-symbol';icon.style.background=RegionalMap.palette(id)[4];card.append(icon)}card.append(node('strong',label));cards.append(card);
   const passport=RegionalMap.passportTheme(id);
   if(passport){const u=new URL('sector-passports.html',location.href);u.searchParams.set('sp-sector',passport);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Паспорт отрасли');a.href=u.href;card.append(a)}
   const candidates=(Array.isArray(code)?code:[code]).map(c=>catalog.find(s=>s.code===c)).filter(Boolean);
   if(!candidates.length||!f.key){card.append(node('p','Нет сопоставимого ряда'));return false}
   try{
    const checked=await Promise.allSettled(candidates.map(async m=>{const data=await profileFile(m.file);return {m,data,r:RegionalMap.profileObservation(data.values,f.key,y,RegionalStats.sample)}}));
    const failed=checked.filter(x=>x.status==='rejected').length;
    const selected=RegionalMap.chooseProfileObservation(checked.filter(x=>x.status==='fulfilled').map(x=>x.value));
    if(!selected){card.append(node('p',failed?'Нет доступного проверенного наблюдения; ошибок загрузки: '+failed:'Нет наблюдения для региона'));return false}
    const {m,data,r}=selected;
    if(failed)card.append(node('small','Не все альтернативные ряды удалось проверить.'));
    card.append(node('p',fmtValue(r.value)+' '+m.unit),node('small',String(r.year)+' · '+m.title));
    const previous=RegionalStats.sample(data.values.filter(v=>v.year===r.year-1)).out.get(f.key);
    const index=RegionalMap.isGrowth(m.code,m.title,m.unit);
    const change=RegionalMap.trend(r,previous,m.unit,index);
    if(change){
     const unit=change.type==='index'||change.type==='points'?'п. п.':change.type==='relative'?'%':m.unit;
     const indicator=node('p',(change.delta>0?'↑ +':change.delta<0?'↓ ':'= ')+fmtValue(change.delta)+' '+unit+' · '+(change.type==='index'?'к уровню предыдущего года (100%)':'к '+change.year+' г.'));
     indicator.className='geo-trend';indicator.dataset.direction=change.delta>0?'up':change.delta<0?'down':'flat';card.append(indicator)
    }else card.append(node('small','Нет сопоставимой базы предыдущего года'));
    const u=new URL('historical.html',location.href);u.searchParams.set('hist-series',m.code);u.searchParams.set('hist-region',r.region);if(pinned)u.searchParams.set('snapshot',pinned);const history=node('a','Динамика');history.href=u.href;card.append(history);
    if(/^https?:\/\//i.test(data.source)){card.append(document.createTextNode(' · '),link('Источник',data.source))}
    return true
   }catch{card.append(node('p','Ряд не удалось проверить'));return false}
  }
  const business=node('article','');business.className='geo-business';business.append(node('h4','Малый и средний бизнес · ФНС'));const businessStatus=node('p','Проверка реестра…');business.append(businessStatus);box.append(business);
  profileFile('sme-regions.json').then(data=>{
   if(!business.isConnected)return;
   const code=f.f.properties.iso_3166_2;
   const row=data.rows.find(r=>SMEMap.key(r.code)===code);
   if(!row){businessStatus.textContent='Нет однозначно сопоставимых данных реестра';return}
   businessStatus.textContent='Срез '+data.period+(data.status==='cached'?' · сохранённая версия':'')+' · зарегистрированные субъекты, не производственные площадки.';
   const dl=node('dl','');for(const [label,k] of [['Субъекты МСП','total'],['Юридические лица','legal'],['ИП','individual'],['Работники по реестру','workers']]){dl.append(node('dt',label),node('dd',Number.isInteger(row[k])?row[k].toLocaleString('ru-RU'):'нет данных'))}business.append(dl);
   const u=new URL('facility-map.html#sme-map-section',location.href);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Карта и таблица МСП');a.href=u.href;business.append(a,document.createTextNode(' · '),link('Источник ФНС',data.documentation))
  }).catch(()=>{businessStatus.textContent='Срез реестра недоступен в данной версии'});
  Promise.all([...primary,...subsectors].map(item)).then(results=>{
   if(!box.isConnected)return;
   state.textContent='Доступно '+results.filter(Boolean).length+' из '+results.length+' показателей. Последние опубликованные наблюдения могут относиться к разным годам. Для отраслей проверяется до четырёх рядов, выбирается наиболее свежий доступный в данном регионе; показатели не объединяются. Стрелки означают изменение показателя, а не оценку качества экономики. Наличие ряда не подтверждает текущую работу конкретных предприятий.';
  })
 }
 const activeFields=[...fields,...['geo-theme','geo-scale','geo-markers','geo-region','geo-palette'].filter(id=>$(id)),...compareIds];
 function clearCompare(message){const panel=$('geo-compare-result');if(panel)panel.replaceChildren(node('p',message));const b=$('geo-compare-export');if(b)b.disabled=true;for(const id of compareIds)$(id).disabled=true}
 function draw(){
  if(!geo||!series)return;
  host.replaceChildren();details.replaceChildren();csvButton.disabled=true;
  const Y=Number(year.value),sample=RegionalStats.sample(series.values.filter(r=>r.year===Y)),counts=new Map();
  const regionName=p=>RegionalMap.displayName(p?.iso_3166_2,p?.name);
  const regionKey=p=>typeof p?.name==='string'&&p.name.trim()?RegionalMap.key(p.iso_3166_2):null;
  for(const f of geo.features){const k=regionKey(f.properties);if(k)counts.set(k,(counts.get(k)||0)+1)}
  const features=geo.features.map(feature=>{const f={...feature,properties:feature.properties||{}};const key=regionKey(f.properties),r=key&&counts.get(key)===1?sample.out.get(key):null;return {f,key,r}});
  const matched=features.filter(x=>x.r),unmapped=[...sample.out].filter(([key])=>counts.get(key)!==1);
  if(compareIds.length){
   const result=$('geo-compare-result'),exp=$('geo-compare-export');
   const items=features.filter(f=>f.key&&counts.get(f.key)===1).map(f=>({code:f.f.properties.iso_3166_2,name:regionName(f.f.properties),value:f.r?.value??null,region:f.r?.region||'',sheet:f.r?.sheet,row:f.r?.row,column:f.r?.column})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
   const available=items.filter(x=>Number.isFinite(x.value)).length;
   for(const id of compareIds){
    const field=$(id),old=field.value||saved.get(id)||'';field.replaceChildren(new Option('Не выбран',''),...items.map(x=>new Option(x.name+(x.value===null?' · нет данных':''),x.code)));field.disabled=false;
    if(items.some(x=>x.code===old))field.value=old;
   }
   function renderCompare(){
    const codes=compareIds.map(id=>$(id).value),rows=RegionalMap.compareRows(items,codes);
    result.replaceChildren(node('p',series.title+' · '+Y+' г. · '+series.unit+' · '+available+' территорий с наблюдениями'));
    exp.disabled=rows.length<2;
    if(rows.length<2){result.append(node('p','Выберите минимум два разных региона.'));save(compareIds);return}
    if(codes.filter(Boolean).length!==rows.length)result.append(node('p','Повторяющийся регион показан один раз.'));
    const table=node('table',''),head=table.createTHead().insertRow(),body=table.createTBody();
    for(const label of ['Регион','Значение','Место по величине','Разница с базой','% от базы'])head.append(node('th',label));
    for(const r of rows){const tr=body.insertRow();for(const value of [r.name,r.value===null?'Нет наблюдения':fmtValue(r.value),r.rank===null?'—':r.rank+' из '+available,r.difference===null?'—':fmtValue(r.difference),r.ratio===null?'—':fmtValue(r.ratio)+'%'])tr.insertCell().textContent=value}
    result.append(table,node('p',codes[0]?'База: '+(items.find(x=>x.code===codes[0])?.name||'—')+'. Разница выражена в единицах показателя; для процентных величин — в процентных пунктах. Место не означает оценку эффективности.':'Выберите базовый регион для расчёта разницы.'));
    exp.onclick=()=>csv('regional-comparison-'+series.code+'-'+Y+'.csv',[['Год','Ряд','Показатель','Код','Регион','Территория источника','Значение','Единица','Место по величине','Число сопоставленных','Базовый регион','Разница','% от базы','Источник','Лист','Строка','Столбец'],...rows.map(r=>[Y,series.code,series.title,r.code,r.name,r.region,r.value,series.unit,r.rank,available,codes[0],r.difference,r.ratio,series.source,r.sheet,r.row,r.column])]);save(compareIds)
   }
   for(const id of compareIds)$(id).onchange=renderCompare;renderCompare()
  }
  const thresholds=RegionalMap.classes(matched.map(x=>x.r.value));
  const growth=Boolean(growthPick&&growthPick.value==='growth'&&RegionalMap.isGrowth(series.code,series.title,series.unit)),theme=RegionalMap.theme(series.code,series.source,series.title),palette=RegionalMap.palette(theme,palettePick?.value||'auto',growth);if(palettePick)palettePick.disabled=growth;
  if(growthPick){growthPick.querySelector('option[value="growth"]').disabled=!RegionalMap.isGrowth(series.code,series.title,series.unit);if(!RegionalMap.isGrowth(series.code,series.title,series.unit))growthPick.value='quantile'}
  status.textContent='Год: '+Y+' · сопоставлено '+matched.length+' из '+geo.features.length+' контуров · наблюдений без однозначной геометрии: '+unmapped.length;
  const coverageHost=$('geo-coverage-current');
  if(coverageHost){
   const eligible=[...counts.values()].filter(v=>v===1).length;
   const missing=eligible-matched.length,excluded=geo.features.length-eligible;
   coverageHost.replaceChildren(node('strong','Охват выбранного показателя за '+Y+' год'),node('p','С данными: '+matched.length+' · без наблюдений: '+missing+' · несопоставимые контуры: '+excluded));
   if(eligible){const progress=node('progress','');progress.max=eligible;progress.value=matched.length;progress.setAttribute('aria-label','Сопоставлено '+matched.length+' из '+eligible+' однозначных контуров');coverageHost.append(progress,node('p',Math.round(100*matched.length/eligible)+'% однозначно сопоставимых контуров. Это охват карты, не доля экономики.'))}
  }
  source.replaceChildren(node('p',series.title+' · '+series.unit+' · '+series.kind),link('Статистический первоисточник',series.source),document.createTextNode(' · '),link('Описание границ и лицензия',meta.documentation),node('p','Границы: '+meta.license+' · получены '+String(meta.downloaded||'—').slice(0,10)+' · '+(meta.status==='cached'?'сохранённая копия':'загруженный файл')));
  const passport=RegionalMap.passportTheme(theme);
  if(passport){const u=new URL('sector-passports.html',location.href);u.searchParams.set('sp-sector',passport);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Открыть отраслевой паспорт');a.href=u.href;source.append(node('p',''),a)}
  if(meta.inventory){const i=meta.inventory;source.append(node('p','Контуры ADM1: '+i.contours+' · однозначные коды RU: '+i.unique_codes.length+' · дубли кодов: '+i.duplicate_codes.length+' · контуры без кода или названия: '+i.unmatched_contours+' · вершин: '+i.vertices.toLocaleString('ru')))}
  const polygons=features.map(x=>({...x,rings:RegionalMap.rings(x.f.geometry).map(r=>r.map(p=>RegionalMap.project(p[0],p[1])).filter(Boolean)).filter(r=>r.length>=4)}));
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const x of polygons)for(const ring of x.rings)for(const [u,v] of ring){xmin=Math.min(xmin,u);xmax=Math.max(xmax,u);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v)}
  if(![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin===xmax||ymin===ymax){status.textContent='Геометрия не пригодна для построения карты.';return}
  const w=1180,h=680,scale=Math.min(1080/(xmax-xmin),475/(ymax-ymin)),x=v=>50+(1080-scale*(xmax-xmin))/2+(v-xmin)*scale,y=v=>100+(475-scale*(ymax-ymin))/2+(v-ymin)*scale;
  const svg=document.createElementNS(ns,'svg');for(const [k,v] of Object.entries({xmlns:ns,viewBox:'0 0 '+w+' '+h,width:w,height:h,role:'img','aria-label':'Карта региональных показателей за '+Y}))svg.setAttribute(k,v);
  function shape(tag,attrs,text,parent=svg){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e}
  const txt=(xx,yy,t,size=15)=>shape('text',{x:xx,y:yy,'font-size':size,'font-family':'Arial, sans-serif',fill:'#162e39'},t);
  shape('rect',{width:w,height:h,fill:'#fff'});txt(30,33,'Региональная статистика · '+Y,23);
  chartFitLabel(txt(30,58,series.title+' · '+series.unit,15),1120);
  txt(30,80,'Границы справочные; несопоставимые территории не окрашены.',13);
  const select=f=>{const p=f.f.properties,r=f.r;chosenRegion=p.iso_3166_2||'';if(regionPick)regionPick.value=chosenRegion;for(const e of svg.querySelectorAll('[data-region]')){if(e.dataset.region===chosenRegion)e.setAttribute('data-selected','');else e.removeAttribute('data-selected')}details.replaceChildren(node('h3',r?.region||regionName(p)),node('p',r?'Значение: '+fmtValue(r.value)+' '+series.unit+' · '+Y:'Нет однозначно сопоставимого наблюдения'),node('p','Код геометрии: '+(p.iso_3166_2||'—')));
    if(r){details.append(node('p',[r.sheet,r.row,r.column].filter(v=>v!==null&&v!==undefined).join(' / ')),node('p',r.note||''));const u=new URL('historical.html',location.href);u.searchParams.set('hist-series',series.code);u.searchParams.set('hist-region',r.region);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Открыть динамику территории');a.href=u.href;details.append(a)}
    if(chosenRegion){const u=new URL('regional-manufacturing.html',location.href);u.searchParams.set('rm-region',chosenRegion);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Отраслевая структура отгрузки региона');a.href=u.href;details.append(node('p',''),a)};if(chosenRegion){const u=new URL('industrial-parks.html',location.href);u.searchParams.set('park-iso',chosenRegion);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Индустриальные парки и ОЭЗ региона');a.href=u.href;details.append(node('p',''),a)}if(chosenRegion){const u=new URL('news-map.html',location.href);u.searchParams.set('news-geo-region',chosenRegion);if(pinned)u.searchParams.set('snapshot',pinned);const a=node('a','Новости этого региона');a.href=u.href;details.append(node('p',''),a)}if(f.key&&counts.get(f.key)===1){addBrief(f);addProfile(f,Y)}else if(profileEnabled){details.append(node('p','Для этого контура нет однозначного соответствия статистике.'));}save(activeFields)};
  for(const f of polygons){
   const d=f.rings.map(r=>r.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[1]).toFixed(2)).join(' ')+' Z').join(' ');
   if(!d)continue;
   const bin=growth?RegionalMap.growthBin(f.r?.value):RegionalMap.bin(f.r?.value,thresholds),fill=bin<0?'#deded9':palette[Math.min(bin,palette.length-1)];
   const p=shape('path',{d,fill,stroke:'#52696e','stroke-width':.85,'fill-rule':'evenodd','data-region':f.f.properties.iso_3166_2||'',tabindex:0,role:'button','aria-label':(f.r?.region||regionName(f.f.properties))+': '+fmtValue(f.r?.value)});
   shape('title',{},(f.r?.region||regionName(f.f.properties))+' · '+fmtValue(f.r?.value),p);p.addEventListener('click',()=>select(f));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f)}});
  }
  if(markerPick?.value==='top'){
   const top=polygons.filter(f=>f.r).sort((a,b)=>b.r.value-a.r.value).slice(0,8);
   for(const f of top){
    const ring=f.rings.slice().sort((a,b)=>b.length-a.length)[0];if(!ring?.length)continue;
    const mean=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
    const [u,v]=ring.reduce((a,p)=>Math.hypot(p[0]-mean[0],p[1]-mean[1])<Math.hypot(a[0]-mean[0],a[1]-mean[1])?p:a,ring[0]);
    const g=shape('g',{transform:'translate('+x(u)+' '+y(v)+')',role:'button',tabindex:0,'aria-label':'Региональный показатель: '+f.r.region+' '+fmtValue(f.r.value)});
    const symbol=RegionalMap.industryThemes.find(t=>t[0]===theme)?.[2]||'ТОП';
    shape('circle',{r:13,fill:RegionalMap.palette(theme)[4],stroke:'#fff','stroke-width':1.5},undefined,g);
    shape('text',{x:0,y:3,'font-size':8,'font-weight':'bold','text-anchor':'middle',fill:'#fff'},symbol,g);
    shape('title',{},'Региональная статистика, не предприятие: '+f.r.region+' · '+fmtValue(f.r.value),g);
    g.addEventListener('click',()=>select(f));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f)}});
   }
  }
  const bins=thresholds.length===1?[[thresholds[0],thresholds[0]]]:thresholds.slice(1).map((v,i)=>[thresholds[i],v]);
  const labels=growth?['< 95%','95–<100%','100%','>100–105%','>105%']:bins.map(([lo,hi])=>fmtValue(lo)+' – '+fmtValue(hi));
  labels.forEach((label,i)=>{const xx=30+i*220;shape('rect',{x:xx,y:590,width:24,height:16,fill:palette[i]});chartFitLabel(txt(xx+30,603,label,12),185)});
  shape('rect',{x:30,y:613,width:24,height:15,fill:'#deded9'});txt(60,625,growth?'Серый: нет данных; 100% = уровень предыдущего года.':'Нет данных / не сопоставлено; квантильные интервалы по окрашенным территориям.',12);
  txt(30,648,'Границы: Natural Earth (public domain), PiSpace Maps · источник статистики: '+series.code,12);
  txt(30,665,'Версия: '+(version||'не определена')+' · SHA-256 геометрии: '+String(meta.sha256||'—').slice(0,16)+'…',11);
  const wrap=node('div','');wrap.className='regional-figure-scroll geo-figure';wrap.append(svg);host.append(wrap);
  const toolbar=node('div','');toolbar.className='actions';const msg=node('span','');
  const blob=()=>new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  const saveFile=(b,ext)=>{const u=URL.createObjectURL(b),a=node('a','');a.href=u;a.download='regional-map-'+series.code+'-'+Y+'.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)};
  const png=async()=>{const u=URL.createObjectURL(blob());try{const img=new Image();img.src=u;await img.decode();const c=document.createElement('canvas');c.width=w*2;c.height=h*2;c.getContext('2d').drawImage(img,0,0,c.width,c.height);return await new Promise((r,j)=>c.toBlob(b=>b?r(b):j(Error('PNG')),'image/png'))}finally{URL.revokeObjectURL(u)}};
  for(const [label,fn] of [['Скачать SVG',()=>saveFile(blob(),'svg')],['Скачать PNG',async()=>saveFile(await png(),'png')],['Копировать карту',async()=>navigator.clipboard.write([new ClipboardItem({'image/png':png()})])]]){const b=node('button',label);b.type='button';b.onclick=async()=>{try{await fn();msg.textContent='Готово'}catch{msg.textContent='Экспорт недоступен; используйте SVG.'}};toolbar.append(b)}toolbar.append(msg);host.append(toolbar);
  if(regionPick){
   const options=polygons.filter(f=>f.f.properties.iso_3166_2).sort((a,b)=>(a.r?.region||regionName(a.f.properties)).localeCompare(b.r?.region||regionName(b.f.properties),'ru'));
   const counts=new Map();for(const f of options){const code=f.f.properties.iso_3166_2;counts.set(code,(counts.get(code)||0)+1)}
   const unique=options.filter(f=>counts.get(f.f.properties.iso_3166_2)===1);
   regionPick.replaceChildren(new Option('Выберите регион',''),...unique.map(f=>new Option((f.r?.region||regionName(f.f.properties))+(f.r?'':' · нет данных'),f.f.properties.iso_3166_2)));
   regionPick.onchange=()=>{chosenRegion=regionPick.value;const f=unique.find(x=>x.f.properties.iso_3166_2===chosenRegion);if(f)select(f);else{details.replaceChildren(node('p','Выберите регион или контур на карте.'));for(const e of svg.querySelectorAll('[data-selected]'))e.removeAttribute('data-selected');save(activeFields)}};
   const current=unique.find(f=>f.f.properties.iso_3166_2===chosenRegion);if(current)select(current);else{chosenRegion='';details.append(node('p','Выберите регион из списка или нажмите на контур.'))}
  }else details.append(node('p','Выберите контур, чтобы открыть значение и ссылку на статистический ряд.'));
  const audit=node('details','');audit.append(node('summary','Сопоставление территорий и границ'));
  const table=node('table',''),hrow=table.createTHead().insertRow(),body=table.createTBody();for(const v of ['Код','Название региона','Название в географическом файле','Территория статистики','Значение'])hrow.append(node('th',v));
  for(const f of features){const tr=body.insertRow();for(const v of [f.f.properties.iso_3166_2,regionName(f.f.properties),f.f.properties.name,f.r?.region,fmtValue(f.r?.value)])tr.insertCell().textContent=v||'—'}
  audit.append(table,node('p','Наблюдения без контура: '+(unmapped.map(([,r])=>r.region).join('; ')||'нет')));host.append(audit);
  csvButton.disabled=!matched.length;csvButton.onclick=()=>csv('regional-map-'+series.code+'-'+Y+'.csv',[['Год','Код геометрии','Название региона','Название в географическом файле','Территория статистики','Код показателя','Значение','Единица','Источник','Лист','Строка','Столбец','SHA-256 границ','Источник границ'],...features.map(f=>[Y,f.f.properties.iso_3166_2,regionName(f.f.properties),f.f.properties.name,f.r?.region,series.code,f.r?.value??'',series.unit,series.source,f.r?.sheet,f.r?.row,f.r?.column,meta.sha256,meta.source])]);save(activeFields)
 }
 async function choose(){
  const token=++seq,old=first?saved.get('geo-year'):year.value;series=null;host.replaceChildren();details.replaceChildren();csvButton.disabled=true;clearCompare('Загрузка выбранного ряда…');
  const m=catalog.find(s=>s.code===pick.value);if(!m)return;
  status.textContent='Загрузка ряда…';
  try{const data=await mapLoad(m.file);if(token!==seq)return;series={...data,code:m.code};const ys=[...new Set(data.values.map(r=>r.year))].sort((a,b)=>b-a);year.replaceChildren();for(const y of ys)year.add(new Option(String(y),String(y)));if(ys.includes(Number(old)))year.value=old;first=false;draw()}catch(e){if(token===seq){console.error(e);status.textContent='Ряд недоступен для этой версии.';clearCompare('Ряд недоступен для сравнения.')}}
 }
 try{
  meta=await mapLoad('regional-boundaries.json');
  if(!['ok','cached'].includes(meta.status)){status.textContent='Файл границ пока недоступен; используйте тепловые карты и территориальные таблицы.';source.append(link('Документация источника',meta.documentation),node('p',meta.error||''));return}
  [geo,catalog]=await Promise.all([mapLoad('regional-boundaries.geojson'),mapLoad('historical.json').then(x=>x.series.filter(s=>s.regions>=3))]);
  function updateCoverage(){
   if(!themePick)return;
   const host=$('geo-coverage-list');if(!host)return;
   const items=[...themePick.options].filter(o=>o.value!=='all');
   const grid=node('div','');grid.className='geo-coverage-grid';
   for(const o of items){
    const data=RegionalMap.coverage(catalog,o.value),b=node('button','');b.type='button';b.className='geo-coverage-item';b.setAttribute('aria-pressed',String(themePick.value===o.value));b.style.borderLeftColor=RegionalMap.palette(o.value)[4];
    b.append(node('strong',o.dataset.original||o.textContent),node('span',data.count?data.count+' рядов · до '+data.latest+' г.':'Нет загруженных рядов'),node('small',data.count?'Макс. территорий в ряду: '+data.maxRegions+' (включая агрегаты)':'Данные ещё не получены'));
    b.onclick=()=>{themePick.value=o.value;themePick.dispatchEvent(new Event('change'))};grid.append(b)
   }
   host.replaceChildren(grid)
  }
  if(themePick)for(const o of themePick.options){o.dataset.original=o.textContent;o.textContent+=' · '+RegionalMap.coverage(catalog,o.value).count+' рядов'}
  function populate(preferred){
   updateCoverage();
   const subset=catalog.filter(s=>!themePick||RegionalMap.inTheme(s,themePick.value));
   pick.replaceChildren(...subset.map(s=>new Option(s.title+' · '+s.unit+' · '+s.first+'–'+s.last,s.code)));
   if(subset.some(s=>s.code===preferred))pick.value=preferred;
   else {const def=subset.find(s=>s.code.startsWith('GRP_PC_'));if(def)pick.value=def.code}
   if(!subset.length){++seq;series=null;clearCompare('В этом слое нет данных для сравнения.');status.textContent='В этом слое нет загруженных рядов. Выберите другой слой или откройте региональную справку.';host.replaceChildren();source.replaceChildren();details.replaceChildren();year.replaceChildren();csvButton.disabled=true;$('geo-coverage-current')?.replaceChildren();if(regionPick){const code=chosenRegion;const eligible=geo.features.filter(f=>RegionalMap.key(f.properties?.iso_3166_2));const unique=eligible.filter(f=>eligible.filter(z=>z.properties.iso_3166_2===f.properties.iso_3166_2).length===1);regionPick.replaceChildren(new Option('Выберите регион',''),...unique.sort((a,b)=>RegionalMap.displayName(a.properties.iso_3166_2,a.properties.name).localeCompare(RegionalMap.displayName(b.properties.iso_3166_2,b.properties.name),'ru')).map(f=>new Option(RegionalMap.displayName(f.properties.iso_3166_2,f.properties.name),f.properties.iso_3166_2)));regionPick.onchange=()=>{chosenRegion=regionPick.value;details.replaceChildren();const f=unique.find(x=>x.properties.iso_3166_2===chosenRegion);if(f){details.append(node('h3',RegionalMap.displayName(chosenRegion,f.properties.name)));addBrief({f,key:RegionalMap.key(chosenRegion)});}save(activeFields)};regionPick.value=code;regionPick.onchange()}save(activeFields);return false}
   return true
  }
  if(themePick){const requested=catalog.find(s=>s.code===saved.get('geo-series'));if(requested&&!saved.has('geo-theme'))themePick.value=RegionalMap.theme(requested.code,requested.source,requested.title);restore(['geo-theme','geo-scale','geo-markers','geo-palette']);themePick.onchange=()=>{if(populate(pick.value))choose()}}
  const ready=populate(saved.get('geo-series'));if(ready&&saved.has('geo-series')&&[...pick.options].some(o=>o.value===saved.get('geo-series')))pick.value=saved.get('geo-series');pick.onchange=choose;year.onchange=draw;if(growthPick)growthPick.onchange=draw;if(markerPick)markerPick.onchange=draw;if(palettePick)palettePick.onchange=draw;form.onsubmit=e=>e.preventDefault();if(ready)choose()
 }catch(e){console.error(e);status.textContent='Географические данные недоступны для этой версии. Откройте текущую сборку или используйте таблицы.'}
});
