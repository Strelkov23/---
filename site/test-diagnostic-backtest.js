const assert=require('node:assert/strict'),B=require('./diagnostic-backtest.js'),D=require('./macro-diagnostics.js');
const rule=D.rules[0],values={},zero={};let v=0;
for(let y=1991;y<=2025;y++){v+=((y-1991)%7)+1;values[y]=v;zero[y]=0}
values[2020]+=1000;
const data={[rule.a]:{values},[rule.b]:{values:zero}};
const r=B.run(rule,data,2005,2020);assert.equal(r.rows.length,16);assert.equal(r.summary.length,9);
assert.equal(r.rows.at(-1).classification,'stable_signal');assert.equal(r.rows.at(-1).signals,9);
assert.equal(r.stable+r.sensitive+r.none,r.common);
const before=B.run(rule,data,2010,2019);values[2025]=99999999;
assert.deepEqual(B.run(rule,data,2010,2019),before);
delete values[2019];assert.equal(B.run(rule,data,2020,2020).rows[0].classification,'incomplete');
const empty=B.run(rule,{},2000,2001);assert.equal(empty.common,0);assert.equal(empty.summary[0].share,null);
assert.throws(()=>B.run(rule,data,2021,2020));
console.log('Diagnostic retrospective sensitivity tests passed');
