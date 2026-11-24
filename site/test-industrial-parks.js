const assert=require('node:assert/strict'), P=require('./industrial-parks.js');
const rows=[{region:'A',name:'Ёлка',type:'Гринфилд',card_certified:true},{region:'A',name:'Два',type:null,card_certified:false},{region:'B',name:'Три',type:'Браунфилд',card_certified:false}];
assert.equal(P.filter(rows,'','yes','елка').length,1);
assert.equal(P.filter(rows,'unknown','','').length,1);
assert.equal(P.filter(rows,'','no','','B').length,1);
assert.deepEqual(P.counts(P.filter(rows,'Гринфилд','',''),rows),[{region:'A',value:1},{region:'B',value:0}]);
assert.deepEqual(P.counts([],rows),[{region:'A',value:0},{region:'B',value:0}]);
console.log('Park catalogue filters and zero-vs-missing counts OK');
