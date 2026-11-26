/* Decode a lossless bibliography transport; legacy snapshots use original JSON. */
const LiteratureDelivery=(()=>{
 function decode(p){
  if(p?.schema!=='literature-delivery-v1')throw Error('Invalid catalogue transport');
  if(p.encoding==='plain'){if(!Array.isArray(p.data?.articles))throw Error('Invalid catalogue');return p.data}
  const {meta,shapes,strings,rows,dictionary_fields:fields}=p;
  if(p.encoding!=='rows'||!meta||typeof meta!=='object'||Array.isArray(meta)||Object.hasOwn(meta,'articles')||![shapes,strings,rows,fields].every(Array.isArray)||!strings.every(s=>typeof s==='string')||!fields.every(s=>typeof s==='string'))throw Error('Invalid catalogue rows');
  const dictionary=new Set(fields);
  for(const keys of shapes)if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)throw Error('Invalid row shape');
  const articles=rows.map(r=>{
   if(!Array.isArray(r)||!Number.isInteger(r[0])||r[0]<0||r[0]>=shapes.length||r.length!==shapes[r[0]].length+1)throw Error('Invalid row');
   return Object.fromEntries(shapes[r[0]].map((k,i)=>{
    const v=r[i+1];
    if(dictionary.has(k)&&v!==null){if(!Number.isInteger(v)||v<0||v>=strings.length)throw Error('Invalid dictionary reference');return [k,strings[v]]}
    return [k,v];
   }));
  });
  return {...meta,articles};
 }
 return {decode};
})();
if(typeof module!=='undefined')module.exports=LiteratureDelivery;
