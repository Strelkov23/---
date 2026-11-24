const assert=require('node:assert/strict'),C=require('./composite-index.js');
const make=(id,values,weight,direction='direct')=>({id,weight,direction,observations:values.map(([period,value])=>({period,value,territory:'Россия',kind:'Наблюдение'}))});
const a=make('a',[['2020',10],['2021',20],['2023',30]],3),b=make('b',[['2020',100],['2021',50],['2022',25],['2023',0]],1,'inverse'),p={base:'2020',territory:'Россия',method:'arithmetic'};
const r=C.calculate([a,b],p);assert.deepEqual(r.weights,[.75,.25]);assert.equal(r.rows[0].arithmetic,100);assert.ok(Math.abs(r.rows[0].geometric-100)<1e-9);assert.equal(r.rows[1].arithmetic,200);assert.equal(r.rows[2].selected,null);assert.equal(r.rows[3].selected,null);
const q=C.calculate([a,{...b,direction:'direct'}],p);assert.equal(q.rows[1].arithmetic,162.5);assert.equal(q.rows[1].equal_arithmetic,125);assert.equal(q.rows[3].geometric,null);assert.equal(q.rows[3].arithmetic,225);
assert.throws(()=>C.calculate([a,a],p));assert.throws(()=>C.calculate([a,b],{...p,base:'2022'}));assert.throws(()=>C.calculate([a,{...b,weight:0}],p));assert.throws(()=>C.calculate([a,make('m',[['2020-01',1]],1)],p));
console.log('Composite index: normalized weights, inverse orientation, complete-case rules and distinct methods passed');
