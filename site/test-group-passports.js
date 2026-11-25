const assert=require('node:assert/strict'),G=require('./group-passports.js');
assert.equal(G.change(100,120,'млн руб.'),20);assert.equal(G.change(0,5,'млн руб.'),null);assert.equal(G.change(5,7,'%'),2);assert.equal(G.change(-1,2,'млн руб.'),null);
