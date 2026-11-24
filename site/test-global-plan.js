const assert=require('node:assert/strict'),G=require('./global-plan.js'),R=require('./resource-plan.js'),fs=require('node:fs'),path=require('node:path');
const m={names:['A','B'],output:[100000,100000],demand:[100000,100000],imports:[10000,10000],effects:[[100000,0],[0,100000]]};
const p={years:3,spare:0,investment:10,capitalRatio:1,depreciation:0,importLimit:100,allocation:'gap',growth:[5,5]};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),a+' != '+b);
const lp=R.solve([[1,-1],[0,1]],[0,2],[1,0],{signed:true,fast:true});near(lp.objective,2);near(lp.dualObjective,2);
assert.throws(()=>R.solve([[1,-1],[0,1]],[0,2],[1,0]));
let r=G.solve(m,p,'cumulative');near(r.score,30);near(r.rows[0].alpha,0);near(r.rows[1].actualDemand,10);near(r.rows[2].actualDemand,20);near(r.rows[2].investment,0);
r=G.solve(m,p,'terminal');near(r.score,20);near(r.upper,r.score);
r=G.solve(m,{...p,years:1},'cumulative');near(r.score,0);assert.equal(r.rows[0].investment,0);
r=G.solve(m,{...p,spare:100,importLimit:0},'cumulative');near(r.score,0);
r=G.solve(m,{...p,spare:100,growth:[0,0]},'terminal');near(r.score,0);assert.ok(r.rows.every(x=>x.alpha===1));
r=G.solve(m,{...p,investment:0},'terminal');near(r.score,0);
r=G.solve(m,{...p,depreciation:100},'terminal');near(r.score,10);
const asym={...m,output:[100000,300000],demand:[100000,200000],effects:[[100000,100000],[0,100000]]};
const cases=[[m,p,'cumulative'],[m,p,'terminal'],[asym,{...p,years:5,spare:2,investment:8,depreciation:30,growth:[2,12]},'cumulative'],[asym,{...p,years:5,spare:2,investment:8,depreciation:30,growth:[2,12]},'terminal']];
const real=JSON.parse(fs.readFileSync(path.join(__dirname,'sectors.json'),'utf8'));
assert.equal(real.names.length,19);
const realP={...p,years:5,spare:5,investment:1000,capitalRatio:3,depreciation:5,importLimit:500,growth:real.names.map(()=>3)};
cases.push([real,realP,'cumulative'],[real,realP,'terminal'],[real,{...realP,years:15,growth:real.names.map((_,i)=>1+i%5)},'cumulative'],[real,{...realP,years:15,growth:real.names.map((_,i)=>1+i%5)},'terminal']);
const fixtures=cases.map(([m,p,o])=>{
 const r=G.solve(m,p,o),z=G.problem(m,p,o);
 assert.ok(r.variants.every(v=>v.score<=r.score+r.tolerance));
 near(r.score,r.upper,2e-6);
 for(const row of r.rows){assert.ok(row.investment<=p.investment+1e-4);assert.ok(row.imports<=p.importLimit+1e-4);assert.ok(row.groups.every(g=>g.realized<=g.available+1e-4))}
 return {A:z.A,b:z.b,c:z.c,objective:r.primal/z.objectiveScale,scale:z.objectiveScale,mode:o,periods:p.years,groups:m.names.length,score:r.score,iterations:r.iterations};
});
if(process.argv.includes('--reference'))process.stdout.write(JSON.stringify(fixtures));else console.log('Global plan: '+fixtures.length+' checked LPs, including 19 groups / 15 periods; '+fixtures.map(x=>x.iterations).join(', ')+' iterations');
