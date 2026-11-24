/* Strict CSV for externally documented product-group FTE, never an automatic OKVED mapping. */
const LaborCalibration=(()=>{
 function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false,closed=false;
  text=String(text).replace(/^\uFEFF/,'');
  if(text.length>200000)throw Error('Файл слишком большой');
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
   if(c==='"'){if(field||closed)throw Error('Некорректные кавычки CSV');quoted=true}
   else if(c===','){row.push(field);field='';closed=false}
   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';closed=false}
   else{if(closed)throw Error('Некорректный CSV');field+=c}
  }
  if(quoted)throw Error('Незакрытые кавычки CSV');
  row.push(field);if(row.some(v=>v!==''))rows.push(row);
  return rows;
 }
 function parse(text,m){
  const rows=parseCSV(text),header=['group_id','group_name','year','output_million_rub','annual_fte','source'];
  if(!rows.length||rows.shift().join('\u0000')!==header.join('\u0000'))throw Error('Используйте исходный CSV-шаблон с запятыми и указанными заголовками');
  if(rows.length!==m.names.length)throw Error('Нужны все группы без пропусков');
  const found=new Map();
  const numeric=v=>/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim())?Number(v):NaN;
  for(const row of rows){
   if(row.length!==6)throw Error('Неверное число столбцов');
   const [rawId,name,year,output,fte,source]=row,id=Number(rawId),x=numeric(output),f=numeric(fte),base=m.output[id-1];
   if(!Number.isInteger(id)||id<1||id>m.names.length||found.has(id)||name!==m.names[id-1]||year!=='2021')throw Error('Не совпадает группа, её название или год');
   if(!Number.isFinite(x)||x<=0||Math.abs(x-base)>1e-9*Math.max(1,base))throw Error('Выпуск не совпадает с исходным балансом: '+name);
   if(!Number.isFinite(f)||f<0||f>1e9||!source.trim()||source.length>1000||/^[=+\-@]/.test(source.trim()))throw Error('Укажите допустимые FTE и источник: '+name);
   const intensity=f/(base/1000);
   if(!Number.isFinite(intensity)||intensity>1e6)throw Error('Коэффициент вне допустимого диапазона: '+name);
   found.set(id,{id,name,year:2021,output:base,fte:f,source:source.trim(),intensity});
  }
  return [...found.values()].sort((a,b)=>a.id-b.id);
 }
 function multipliers(m,coeff){
  if(coeff.length!==m.names.length||coeff.some(v=>!Number.isFinite(v)||v<0))throw Error('Invalid labor coefficients');
  return m.names.map((name,j)=>{
   const demand=m.demand[j];
   if(!(demand>0))return {name,perBillion:null,contributions:null};
   // effects: million RUB of output caused by the whole baseline demand of group j.
   const contributions=m.effects.map((row,i)=>row[j]/demand*coeff[i]);
   return {name,perBillion:contributions.reduce((a,b)=>a+b,0),contributions};
  });
 }
 return {parseCSV,parse,multipliers};
})();
if(typeof module!=='undefined')module.exports=LaborCalibration;
