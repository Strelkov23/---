const assert=require('node:assert/strict'),I=require('./interface.js');
assert.equal(I.preference(null,null),'simple');
assert.equal(I.preference(null,'professional'),'professional');
assert.equal(I.preference('simple','professional'),'simple');
assert.equal(I.preference('bad','bad'),'simple');
assert.equal(I.matches('Валовой региональный продукт ВРП','Статистика','врп',''),true);
assert.equal(I.matches('Ёмкость','Модели','емкость','Модели'),true);
assert.equal(I.matches('Ёмкость','Модели','емкость','Карты'),false);
console.log('Interface mode and glossary tests passed');
assert.deepEqual(I.filterTools(['Валовой региональный продукт','Региональные инвестиции','Труд'],'регион инвест'),[false,true,false]);
assert.deepEqual(I.filterTools(['А','Б'],''),[true,true]);

assert.equal(I.theme('bogus'),'light');assert.equal(I.effectiveTheme('system',true),'dark');assert.equal(I.effectiveTheme('system',false),'light');assert.equal(I.effectiveTheme('light',true),'light');assert.equal(I.effectiveTheme('dark',false),'dark');
