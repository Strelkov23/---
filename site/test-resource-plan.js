const assert=require('node:assert/strict'),R=require('./resource-plan.js'),m=require('./sectors.json');
const a=R.solve([[1,1],[1,0],[0,1]],[4,2,3],[3,2]);
assert.ok(Math.abs(a.objective-10)<1e-8);assert.deepEqual(a.x,[2,2]);
assert.deepEqual(R.solve([[1,1]],[0],[1,2]).x,[0,0]);
assert.deepEqual(R.solve([[1,1]],[5],[-1,-2]).x,[0,0]);
const n=m.names.length,p={budget:1000,importLimit:150,penalty:2,priority:Array(n).fill(1),cap:Array(n).fill(10),maxDemand:Array(n).fill(20)};
const r=R.model(m,p);
assert.equal(r.results.length,3);
for(const s of r.results){assert.ok(s.direct<=p.budget+1e-6);assert.ok(s.imports<=p.importLimit+1e-6);assert.ok(s.slack.every(v=>v>=-1e-5));assert.ok(s.x.every(v=>v>=0))}
assert.ok(Math.abs(r.results[0].direct-r.results[1].direct)<1e-6);
const z=R.model(m,{...p,cap:Array(n).fill(0)});assert.ok(z.results.every(s=>s.direct<1e-6));
console.log('Resource plan tests passed');