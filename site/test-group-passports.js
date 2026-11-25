const assert=require('node:assert/strict'),G=require('./group-passports.js');
assert.equal(G.change(100,120,'млн руб.'),20);assert.equal(G.change(0,5,'млн руб.'),null);assert.equal(G.change(5,7,'%'),2);assert.equal(G.change(-1,2,'млн руб.'),null);
const g={scope:'consolidated',standard:'IFRS',source:'https://example.org',metrics:[{id:'revenue',comparable:'annual_consolidated_revenue_rub',unit:'млрд руб.',observations:[{year:2025,value:'2'}]}]};
const r=G.revenueComparison({groups:[{...g,id:'a',name:'А'},{...g,id:'b',name:'Б',metrics:[{...g.metrics[0],unit:'млн руб.',observations:[{year:2025,value:'2000'}]}]},{...g,id:'c',name:'В',metrics:[{...g.metrics[0],id:'revenue_combined'}]}]},2025);
assert.equal(r.eligible,2);assert.equal(r.rows[0].value,2000);assert.equal(r.rows[1].rank,1);assert.equal(r.rows[2].rank,null);
