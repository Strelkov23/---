const assert=require('node:assert/strict');const core=require('./economic-ai-scenario.js');(function checks(c,assert){
 const a=c.parse("сценарий: рост=4,5; горизонт=5; база=2024");
 assert(a.params.growth===4.5);assert(a.params.productivity===2);assert(a.year===2024);assert(a.params.years===5);assert(c.path(2024,a.params).includes("repro-growth=4.5"));
 const bad=["рост=21","рост=3; рост=4","рост=2.55","горизонт=2.5","x=5","рост=Infinity",""];for(const q of bad){let rejected=false;try{c.parse(q)}catch{rejected=true}assert(rejected)}
 assert(c.selectBase([{year:2026},{year:2024}],null,2025).year===2024);
 assert(c.summary([{year:2025,gdp:100,required:10,gap:2,laborGap:3},{year:2026,gdp:110,required:20,gap:4,laborGap:1}]).gap===6);
})(core,assert.ok);console.log('14 scenario command checks passed');

const model=require("./reproduction-plan.js"),a=core.parse("рост=3; горизонт=5"),b=core.parse("рост=4; горизонт=5"),base={year:2024,gdp:1000,employment:100};
const result=core.compare(base,a,b,model.calculate,core.summary);
assert.ok(result.delta.gdp>0);assert.equal(result.left.year,result.right.year);assert.equal(result.delta.gdp,result.right.gdp-result.left.gdp);assert.throws(()=>core.compare(base,a,core.parse("горизонт=3"),model.calculate,core.summary));assert.throws(()=>core.compare(base,a,core.parse("база=2023"),model.calculate,core.summary));assert.equal(core.compare(base,a,a,model.calculate,core.summary).delta.gap,0);console.log("6 scenario comparison checks passed");
