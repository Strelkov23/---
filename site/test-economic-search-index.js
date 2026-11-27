/* Regression checks on the actual built search index. Not an independent relevance study. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const Search=require("./economic-search.js");
const path=process.argv[2]||"public/economic-search-index.json";
const index=JSON.parse(fs.readFileSync(path,"utf8"));
const fixtures=[
 ["Сравнение показателей","compare.html"],
 ["Экономическая карта России","economic-map.html"],
 ["Банковский атлас","banks.html"],
 ["Матрица межотраслевых потоков","atlas.html#balance-matrix"],
 ["Научные статьи","papers.html"],
 ["Прогнозы и точность","forecast.html"],
 ["Математическое ядро планирования","planning-centre.html"],
 ["Сравнение всех регионов","economic-map.html#geo-dashboard"],
 ["Проверка межотраслевого баланса","balance-audit.html"]
];
const rows=fixtures.map(([query,href])=>{
 const results=Search.search(index,query,{kind:"tool",expand:true});
 const rank=results.findIndex(r=>r.href===href)+1;
 assert(rank>0&&rank<=3,"Expected route in top 3: "+query+" -> "+href+" rank="+rank);
 return {query,href,rank};
});
const probe=["как сравнить регионы","инвестиции","ВВП","межотраслевой баланс","инфляция","прогнозирование"].map(query=>{
 const plain=Search.search(index,query),expanded=Search.search(index,query,{expand:true});
 return {query,plain:plain.length,expanded:expanded.length,top:expanded.slice(0,3).map(r=>({title:r.title,kind:r.kind,href:r.href}))};
});
const codes=index.docs.filter(r=>r.kind==="series"&&typeof r.code==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.-]{4,80}$/.test(r.code)&&Search.words(r.code).length>0);
let checked=0;for(const r of codes.slice(0,20)){const found=Search.search(index,r.code,{kind:"series"});assert(found[0]?.exactCode,"Exact code not first: "+r.code);checked++}
console.log(JSON.stringify({note:"Navigation regression, not general search precision or recall.",documents:index.docs.length,top3:rows.length,queries:rows,exactCodesChecked:checked,diagnostic:probe},null,2));

assert.ok(index.abstract_postings&&typeof index.abstract_postings==="object");
const abstractTerms=Object.keys(index.abstract_postings);
for(const term of abstractTerms.slice(0,20)){for(const [i,w] of index.abstract_postings[term]){assert.equal(w,1);assert.equal(index.docs[i].kind,"paper");assert.equal(index.docs[i].abstract_license,"https://creativecommons.org/licenses/by/4.0/")}}
console.log("Content index terms: "+abstractTerms.length+"; zero means no searchable permitted abstracts, not a relevance score.");
