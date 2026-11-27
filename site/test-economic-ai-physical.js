const assert=require("node:assert/strict"),{build}=require("./economic-ai-physical.js");
(function checks(build,assert){
 const c={id:"test",title:"Test",origin:"corporate_disclosure",scope:"Group",unit:"t",source:"https://example.org/report",page:"1",verification:"partial",verification_date:"2026-01-01",metrics:[{id:"x",title:"X",unit:"t"}],rows:[{year:2023,x:100,verification:"source_rechecked"},{year:2024,x:120,verification:"source_rechecked"},{year:2025,x:200,verification:"secondary_rechecked"}]};
 const e={schema:"iv-ember-v1",unit:"TWh",source:"https://example.org/data",documentation:"https://example.org/doc",success:"2026-01-02T00:00:00Z",sha256:"a".repeat(64),rows:[{year:2024,values:{total:100}},{year:2025,values:{total:110}},{year:2026,values:{total:120}}]};
 const d=build({schema:"iv-physical-v1",companies:[c]},e,"2026-11-27T15:00:00Z"),r=d.rows[0],x=d.rows.find(x=>x.id==="ember-total");
 assert(r.year===2024);assert(r.value===120);assert(Math.abs(r.yoy-20)<1e-8);assert(r.newer_unverified===true);assert(r.latest_available_year===2025);assert(x.year===2025);assert(Math.abs(x.yoy-10)<1e-8);assert(x.verification==="machine_import");
 const no=build({schema:"iv-physical-v1",companies:[c]},{...e,sha256:null},"2026-11-27T15:00:00Z");assert(no.rows.find(x=>x.id==="ember-total").value===null);
 const gap=build({schema:"iv-physical-v1",companies:[{...c,rows:c.rows.filter(r=>r.year!==2023)}]},e,"2026-11-27T15:00:00Z");assert(gap.rows[0].yoy===null);
})(build,assert.ok);console.log("10 physical evidence checks passed");
