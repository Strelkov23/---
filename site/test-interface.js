const assert=require('node:assert/strict'),I=require('./interface.js');
assert.equal(I.preference(null,null),'simple');
assert.equal(I.preference(null,'professional'),'professional');
assert.equal(I.preference('simple','professional'),'simple');
assert.equal(I.preference('bad','bad'),'simple');
assert.equal(I.matches('Валовой региональный продукт ВРП','Статистика','врп',''),true);
assert.equal(I.matches('Ёмкость','Модели','емкость','Модели'),true);
assert.equal(I.matches('Ёмкость','Модели','емкость','Карты'),false);
console.log('Interface mode and glossary tests passed');