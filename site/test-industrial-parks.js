const assert=require('node:assert/strict'), P=require('./industrial-parks.js');
const rows=[{region:'A',name:'Ёлка',type:'Гринфилд',card_certified:true},{region:'A',name:'Два',type:null,card_certified:false},{region:'B',name:'Три',type:'Браунфилд',card_certified:false}];
assert.equal(P.filter(rows,'','yes','елка').length,1);
assert.equal(P.filter(rows,'unknown','','').length,1);
assert.equal(P.filter(rows,'','no','','B').length,1);
assert.deepEqual(P.counts(P.filter(rows,'Гринфилд','',''),rows),[{region:'A',value:1},{region:'B',value:0}]);
assert.deepEqual(P.counts([],rows),[{region:'A',value:0},{region:'B',value:0}]);
console.log('Park catalogue filters and zero-vs-missing counts OK');

const S=require('./regional-disparities.js');
const mapped=P.mapSample([{region:'Чукотский АО',value:1},{region:'Ямало-Ненецкий АО',value:1},{region:'ХМАО',value:5},{region:'Ханты-Мансийский автономный округ - Югра',value:3},{region:'Республика Удмуртская',value:1},{region:'Удмуртская Республика',value:6}],S.sample);
assert.equal(mapped.out.get('чукотский автономный округ').region,'Чукотский АО');
assert.equal(mapped.out.get('ямало-ненецкий автономный округ').region,'Ямало-Ненецкий АО');
assert.equal(mapped.out.has('ханты-мансийский автономный округ'),false);
assert.equal(mapped.out.has('удмуртия'),false);
assert.equal(mapped.ambiguous,2);
console.log('Exact source aliases; conflicting groups are not summed');
