const assert=require('node:assert/strict'),G=require('./group-passports.js');
assert.equal(G.change(100,120,'млн руб.'),20);assert.equal(G.change(0,5,'млн руб.'),null);assert.equal(G.change(5,7,'%'),2);assert.equal(G.change(-1,2,'млн руб.'),null);
const g={scope:'consolidated',standard:'IFRS',source:'https://example.org',metrics:[{id:'revenue',comparable:'annual_consolidated_revenue_rub',unit:'млрд руб.',observations:[{year:2025,value:'2'}]}]};
const r=G.revenueComparison({groups:[{...g,id:'a',name:'А'},{...g,id:'b',name:'Б',metrics:[{...g.metrics[0],unit:'млн руб.',observations:[{year:2025,value:'2000'}]}]},{...g,id:'c',name:'В',metrics:[{...g.metrics[0],id:'revenue_combined'}]}]},2025);
assert.equal(r.eligible,2);assert.equal(r.rows[0].value,2000);assert.equal(r.rows[1].rank,1);assert.equal(r.rows[2].rank,null);
const signed=G.signedBars([-20,10,0]);
assert.equal(signed.zero,50);assert.equal(signed.bars[0].left,0);assert.equal(signed.bars[1].width,25);assert.equal(signed.bars[2].width,0);assert.equal(G.signedBars([10,20]).bars[0].width,50);
const filtered={groups:[{...g,id:'a',name:'Альфа',sector:'Связь'},{...g,id:'b',name:'Бета',sector:'Транспорт'}]};
assert.equal(G.filterGroups(filtered,'Связь','альфа').length,1);assert.equal(G.filterGroups(filtered,'Связь','Бета').length,0);assert.equal(G.revenueComparison(filtered,2025,'Транспорт').eligible,1);assert.equal(G.revenueComparison(filtered,2025,'Транспорт').rows[0].rank,1);
