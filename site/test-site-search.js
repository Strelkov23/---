const assert=require('node:assert/strict'),S=require('./site-search.js');
const rows=[{title:'Инвестиции в основной капитал',description:'Россия'},{title:'Основные фонды',description:'Инвестиции Россия'},{title:'Рынок труда',description:'Россия'}];
assert.deepEqual(S.find(rows,'инвестиции россия').map(r=>r.title),rows.slice(0,2).map(r=>r.title));
assert.equal(S.find(rows,'инвестиции труд').length,0);
assert.equal(S.find(rows,'').length,0);
assert.equal(S.norm(' ЁЛКА  '),'елка');
assert.equal(S.href('data-registry.html','id','a:b'),'data-registry.html?id=a%3Ab');
console.log('Site search tests passed');