const assert=require("node:assert/strict"),core=require("./economic-ai-diagnostics.js"),macro=require("./macro-diagnostics.js");
(function checks(c,assert){
 const macro={rules:[{id:"gap",title:"Gap",group:"G",unit:"pp",note:"N",op:"diff",a:"a",b:"b"}],formula:()=>"A-B",compute:(_r,data,from,to)=>Object.keys(data.a.values).map(Number).filter(y=>y>=from&&y<=to&&Number.isFinite(data.a.values[y])&&Number.isFinite(data.b.values[y])).sort((a,b)=>a-b).map(y=>({year:y,a:data.a.values[y],b:data.b.values[y],value:data.a.values[y]-data.b.values[y]})),changeSignals:(rows)=>[{status:"short",delta:rows.length>1?rows.at(-1).value-rows.at(-2).value:null,score:null,history:[],median:null,mad:null}]};
 const input={a:{values:{2024:9,2025:10,2026:50}},b:{values:{2024:3,2025:4,2026:1}}};
 const d=c.build(macro,input,{a:{source:"A"},b:{source:"B"}},"2026-11-27T15:00:00Z");
 assert(d.rows[0].year===2025);assert(d.rows[0].value===6);assert(d.rows[0].change===0);assert(d.rows[0].age===0);assert(d.counts.short===1);assert(d.rows[0].sources[0]==="A");assert(c.build(macro,{a:{values:{}},b:{values:{}}},{},"2026-11-27T15:00:00Z").rows[0].status==="missing");
})(core,assert.ok);
const rule=macro.rules[0],a={},b={};for(let y=2010;y<=2025;y++){a[y]=y===2025?100:10+(y%4)**2;b[y]=5}
const r=core.build(macro,{[rule.a]:{values:a},[rule.b]:{values:b}},{}, "2026-11-27T15:00:00Z").rows[0];
assert.equal(r.status,"signal");assert.equal(r.year,2025);assert.equal(r.value,95);assert.ok(r.history_count>=5);
const constant={};for(let y=2010;y<=2025;y++)constant[y]=y===2025?100:10+(y%3);
assert.equal(core.build(macro,{[rule.a]:{values:constant},[rule.b]:{values:b}},{},"2026-11-27T15:00:00Z").rows[0].status,"constant");
console.log("12 diagnostic checks passed");
