const assert=require('node:assert/strict');const core=require('./economic-search.js');(function checks(c,assert){
 const d={docs:[{title:"Инвестиции",kind:"news",date:"2025"},{title:"Инвестиции",kind:"paper",date:"2024"},{title:"Банки",kind:"series",date:"2026"}],postings:{"инвестиц":[[0,5],[1,1]],"банк":[[2,5]]}};
 assert(c.words("инвестиции")[0]==="инвестиц");assert(c.words("инвестициях")[0]==="инвестиц");assert(c.search(d,"инвестиции").length===2);assert(c.search(d,"инвестиции")[0].kind==="news");assert(c.search(d,"инвестиции",{kind:"paper"}).length===1);assert(c.search(d,"инвестиции",{from:2025}).length===1);assert(c.search(d,"инвестиции банки",{all:true}).length===0);assert(c.search(d,"как что").length===0);assert(c.search(d,"constructor").length===0);
 const b={docs:[{title:"GDP",kind:"external",date:"2025"},{title:"Gross domestic product",kind:"web",date:"2024"},{title:"Gross income",kind:"web",date:"2025"},{title:"ВВП",kind:"series",date:"2025"},{title:"GDP inflation",kind:"external",date:"2026"}],postings:{gdp:[[0,5],[4,5]],gross:[[1,5],[2,5]],domestic:[[1,5]],product:[[1,5]],"ввп":[[3,5]],inflation:[[4,5]]}};
 assert(c.search(b,"ВВП").length===1);assert(c.search(b,"ВВП",{expand:true}).length===4);assert(!c.search(b,"ВВП",{expand:true}).some(r=>r.title==="Gross income"));assert(c.search(b,"GDP",{expand:true}).some(r=>r.title==="ВВП"&&r.expanded));assert(c.search(b,"ВВП инфляция",{expand:true,all:true}).map(r=>r.title).join()==="GDP inflation");assert(c.search(b,"ВВП",{expand:true,kind:"web",from:2025}).length===0);assert(c.plan("валовой внутренний продукт",true).length===1);assert(c.plan("внутренний",true)[0].alternatives.length===0);assert(c.dictionary.length>=30);
})(core,assert.ok);console.log('18 search checks passed');

(function(){
 const d={docs:[{title:"Инвестиции в промышленности",kind:"news",date:"2026",code:""},{title:"Инвестиции",kind:"series",date:"2020",code:"NY.GDP.TEST"},{title:"GDP test indicator",kind:"series",date:"2025",code:"NY.GDP.OTHER"}],postings:{"инвестиц":[[0,10],[1,1]],"промышленност":[[0,5]],ny:[[1,3],[2,5]],gdp:[[1,3],[2,5]],test:[[1,3],[2,5]],other:[[2,3]]}};
 assert.equal(core.search(d,"инвестиции")[0].title,"Инвестиции");
 assert.equal(core.search(d,"ny.gdp.test")[0].code,"NY.GDP.TEST");
 assert.equal(core.search(d,"ny.gdp.test")[0].exactCode,true);
 assert.equal(core.search(d,"инвестиции",{kind:"news"})[0].title,"Инвестиции в промышленности");
 assert.equal(core.search(d,"инвестиции",{from:2025})[0].title,"Инвестиции в промышленности");
 console.log("5 ranking checks passed");
})();

{const license="https://creativecommons.org/licenses/by/4.0/",d={docs:[{title:"Рост",kind:"paper",date:"2025",abstract_license:license},{title:"Рост",kind:"paper",date:"2026"},{title:"Рост",kind:"news",date:"2025",abstract_license:license}],postings:{"рост":[[0,5],[1,5],[2,5]]}};assert.equal(core.search(d,"рост",{abstractOnly:true}).length,1);assert.equal(core.search(d,"рост",{abstractOnly:true})[0].abstract_license,license);assert.equal(core.search(d,"рост",{abstractOnly:true,kind:"news"}).length,0);console.log("3 abstract filter checks passed");}

{const docs=[{kind:"paper",href:"a",title:"A"},{kind:"paper",href:"b",title:"B"},{kind:"external",href:"c",title:"C"},{kind:"news",href:"d",title:"D"},...Array.from({length:8},(_,i)=>({kind:"tool",href:"tool"+i,title:"T"}))],postings={growth:[[0,5],[1,5],[3,5]],investment:[[0,5],[1,3],[3,5]],inflation:[[0,2],[2,5]],policy:[[2,5]],инвестиц:[[2,5]]};const norms=docs.map((_,i)=>Math.sqrt(Object.values(postings).reduce((s,p)=>s+(p.find(x=>x[0]===i)?.[1]||0)**2*Math.log(1+(docs.length-p.length+0.5)/(p.length+0.5))**2,0)));const index={docs,postings,norms};const r=core.related(index,"a",{expand:false});assert.equal(r.length,1);assert.equal(r[0].href,"b");assert.equal(r[0].shared.length,2);assert.ok(r[0].similarity>0&&r[0].similarity<=1);assert.equal(core.related(index,"missing").length,0);assert.equal(core.related(index,"a",{abstractOnly:true}).length,0);assert.ok(core.related(index,"a",{expand:true}).some(x=>x.href==="c"));assert.deepEqual(core.related({...index,norms:[]},"a"),[]);console.log("8 related-document checks passed");}

{const license="https://creativecommons.org/licenses/by/4.0/",d={docs:[{title:"Инвестиции",kind:"paper",abstract_license:license},{title:"Региональное развитие",kind:"paper",abstract_license:license},{title:"Инвестиции",kind:"news"}],postings:{инвестиц:[[0,5],[1,1],[2,5]]},abstract_postings:{инвестиц:[[1,1]]}};
assert.equal(core.search(d,"инвестиции")[0].title,"Инвестиции");
const results=core.search(d,"инвестиции",{contentOnly:true});assert.equal(results.length,1);assert.equal(results[0].title,"Региональное развитие");assert.equal(results[0].contentMatch,true);assert.equal(results[0].exactTitle,false);
assert.equal(core.search(d,"инвестиции",{contentOnly:true,kind:"news"}).length,0);
assert.deepEqual(core.search({...d,abstract_postings:undefined},"инвестиции",{contentOnly:true}),[]);
assert.equal(core.search(d,"investment",{contentOnly:true,expand:true})[0].title,"Региональное развитие");
console.log("8 abstract content search checks passed");}

{const license="https://creativecommons.org/licenses/by/4.0/",docs=[{title:"Узкое исследование",kind:"paper",abstract_license:license,date:"2024"},{title:"Обширный текст",kind:"paper",abstract_license:license,date:"2025"},{title:"Только заголовок",kind:"paper",date:"2026"}],abstract_postings={инвестиц:[[0,1],[1,1]],рост:[[0,1],[1,1]],банк:[[1,1]],долг:[[1,1]],цена:[[1,1]]},n=2;const idf=p=>Math.log(1+(n-p.length+.5)/(p.length+.5));const index={docs,abstract_postings,abstract_count:n,abstract_norms:docs.map((_,i)=>Math.sqrt(Object.values(abstract_postings).reduce((s,p)=>s+(p.some(x=>x[0]===i)?idf(p)**2:0),0)))};
const v=core.contentVector(index,"инвестиции рост",{all:true});
assert.equal(v.length,2);assert.equal(v[0].title,"Узкое исследование");assert.ok(Math.abs(v[0].similarity-1)<1e-8);assert.ok(v[1].similarity<v[0].similarity);
assert.equal(core.contentVector(index,"investment",{expand:true}).length,2);
assert.equal(core.contentVector(index,"инвестиции рост",{from:2025}).length,1);
assert.deepEqual(core.contentVector(index,"инвестиции рост",{kind:"news"}),[]);
assert.deepEqual(core.contentVector({...index,abstract_norms:[]},"рост"),[]);
assert.deepEqual(core.contentVector(index,"рост безработица",{all:true}),[]);
console.log("9 sparse content vector checks passed");}

{const docs=[{kind:"paper",href:"a",title:"A"},{kind:"tool",href:"t",title:"T"},{kind:"external",href:"b",title:"B"},{kind:"paper",href:"a",title:"duplicate"},{kind:"web",href:"c",title:"C"}];
const c=core.semanticCandidates(docs,2);assert.deepEqual(c.map(x=>x.href),["a","b"]);
const r=core.semanticRerank(c,[[1,0],[0,1],[2,0]],2);assert.equal(r[0].href,"b");assert.equal(r[0].semanticSimilarity,1);assert.equal(r[0].lexicalRank,2);
assert.throws(()=>core.semanticRerank(c,[[1,0],[0,0],[2,0]],2));assert.throws(()=>core.semanticRerank(c,[[1,0],[NaN,1],[2,0]],2));assert.throws(()=>core.semanticRerank(c,[[1,0],[1,0]],2));assert.throws(()=>core.semanticCandidates(docs,13));
console.log("8 neural reranking helper checks passed");}

{const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64),v=Array.from({length:384},(_,i)=>i===0?1:0),rec=(key,used,vector=v)=>({key,used,vector});
assert.ok(core.validCachedVector(v));assert.equal(core.validCachedVector(v.slice(1)),false);assert.equal(core.validCachedVector(v.map(()=>0)),false);
assert.equal(core.validCachedVector([...v.slice(0,-1),NaN]),false);assert.notEqual(core.cacheIdentity("A"),core.cacheIdentity("B"));assert.ok(core.cacheIdentity("A").includes("7e3d5398"));
assert.throws(()=>core.cacheIdentity(""));assert.deepEqual(core.mergeCache([rec(a,1),rec(b,2)],[rec(a,3),rec(c,4)],2).map(x=>x.key),[c,a]);
assert.equal(core.mergeCache([rec(a,3)],[rec(a,1)])[0].used,3);assert.deepEqual(core.mergeCache([rec("bad",1),rec(b,-1),rec(c,1,[1])],[]),[]);
assert.equal(core.mergeCache(Array.from({length:300},(_,i)=>rec(i.toString(16).padStart(64,"0"),i)),[]).length,256);
assert.throws(()=>core.mergeCache([],[],257));console.log("12 persistent vector cache helper checks passed");}

{const v=Array.from({length:384},(_,i)=>i===0?1:0),w=Array.from({length:384},(_,i)=>i===1?1:0),a={kind:"paper",href:"a",title:"A",date:"2025",abstract_license:"https://creativecommons.org/licenses/by/4.0/"},b={kind:"external",href:"b",title:"B",date:"2024"};
assert.equal(core.localEligible(a,{from:2025,abstractOnly:true}),true);
assert.equal(core.localEligible(b,{from:2025}),false);assert.equal(core.localEligible(b,{abstractOnly:true}),false);
assert.equal(core.localEligible(a,{all:true}),false);assert.equal(core.localEligible(a,{contentOnly:true}),false);assert.equal(core.localEligible(a,{vector:true}),false);
assert.equal(core.localEligible(a,{kind:"external"}),false);
const rows=core.localRank(v,[{doc:b,vector:w},{doc:a,vector:v},{doc:a,vector:v}]);assert.deepEqual(rows.map(r=>r.href),["a","b"]);assert.equal(rows[0].semanticSimilarity,1);assert.equal(rows[0].localSemantic,true);
assert.throws(()=>core.localRank([1],[]));const key="a".repeat(64),cache=core.mergeCache([],[{key,used:1,vector:v,href:a.href,kind:a.kind}]);assert.equal(cache[0].href,"a");assert.equal(cache[0].kind,"paper");assert.equal(core.mergeCache(cache,[{key,used:2,vector:v}])[0].href,"a");
console.log("14 local neural index checks passed");}

{const a={kind:"paper",href:"a",title:"A",date:"2025"},b={kind:"external",href:"b",title:"B",date:"2026"},c={kind:"web",href:"c",title:"A",date:"2024"};
assert.deepEqual(core.archiveTargets([a,b,c]).map(d=>d.href),["b","a"]);assert.deepEqual(core.archiveTargets([a,b,c],1).map(d=>d.href),["b"]);assert.deepEqual(core.archiveTargets([{...a,kind:"tool"},{...b,title:""},{...c,href:"x".repeat(2049)}]),[]);assert.throws(()=>core.archiveTargets([],257));assert.equal(core.archiveTargets(Array.from({length:300},(_,i)=>({...a,href:String(i),title:String(i)}))).length,256);assert.deepEqual(core.archiveTargets([a,b,c]),core.archiveTargets([c,b,a]));console.log("6 archive target checks passed");}

{const v=Array.from({length:384},(_,i)=>i===0?1:0),rec=(i,used)=>({key:i.toString(16).padStart(64,"0"),used,vector:v}),a=rec(1,100),b=rec(2,100),c=rec(3,0);
assert.deepEqual(core.touchCache([a,b],[c,a],1,2).map(r=>r.key),[a.key,c.key]);
assert.equal(core.touchCache([a],[b],1)[0].used,101);
assert.equal(core.touchCache([a],[b,c],1)[0].used,102);
assert.equal(core.touchCache([rec(4,Number.MAX_SAFE_INTEGER)],[b],0)[0].key,b.key);
assert.equal(core.touchCache([a],[b],100,1).length,1);
assert.throws(()=>core.touchCache([],[],-1));console.log("6 atomic cache clock checks passed");}

{const a={kind:"paper",href:"a",title:"A",date:"2025",abstract_license:"https://creativecommons.org/licenses/by/4.0/"},b={kind:"external",href:"b",title:"B",date:"2026"},c={kind:"web",href:"c",title:"C",date:"2024"};
assert.deepEqual(core.archiveTargets([a,b,c],256,{from:2025}).map(d=>d.href),["b","a"]);assert.deepEqual(core.archiveTargets([a,b,c],256,{to:2024}).map(d=>d.href),["c"]);assert.deepEqual(core.archiveTargets([a,b,c],32,{abstractOnly:true}).map(d=>d.href),["a"]);assert.deepEqual(core.archiveTargets([a,b,c],32,{kind:"external"}).map(d=>d.href),["b"]);assert.deepEqual(core.archiveTargets([a,b,c],32,{kind:"series"}),[]);console.log("5 archive batch filter checks passed");}

{const index={schema:1,docs:[{kind:"paper",date:"2026",abstract_license:"https://creativecommons.org/licenses/by/4.0/"},{kind:"paper"},{kind:"external",date:"2025"},{kind:"web"},{kind:"series"}]};
const c=core.coverage(index);assert.equal(c.total,5);assert.equal(c.research,4);assert.equal(c.abstracts,1);assert.equal(c.metadataOnly,3);assert.equal(c.undated,2);assert.equal(c.consistent,false);
const audit={schema:1,baseline_available:true,counts:Object.fromEntries(Object.entries(c.counts).map(([k,n])=>[k,{total:n,added:0,removed:0}])),abstracts:{indexed:1},sources:[{id:"wdi",status:"ok"}]};
assert.equal(core.coverage(index,audit).consistent,true);assert.equal(core.coverage(index,audit).changes.paper.added,0);assert.equal(core.coverage(index,audit).sources[0].status,"ok");audit.counts.paper.total=9;assert.equal(core.coverage(index,audit).changes,null);assert.throws(()=>core.coverage({schema:1,docs:[{kind:"bad"}]}));assert.equal(core.coverageQuestion("Сколько научных статей в архиве?"),true);assert.equal(core.coverageQuestion("Инвестиции в промышленность"),false);console.log("13 search coverage checks passed");}

{const license="https://creativecommons.org/licenses/by/4.0/",doc={kind:"paper",title:"Инвестиции",code:"10.1234/a",date:"2025-01",href:"https://doi.org/10.1234/a",abstract_license:license},paper={doi:doc.code,title:doc.title,published:doc.date,authors:"A",licensed_abstract:{license,text:"Исследование",checked:"2025-02-01"},access:{licenses:[{version:"vor",url:license,start:"2025-01-01"}]}};
assert.equal(core.verifiedAbstract(doc,paper,"2026-01-01").text,"Исследование");
assert.equal(core.verifiedAbstract(doc,{...paper,title:"Другой"},"2026-01-01"),null);
assert.equal(core.verifiedAbstract(doc,paper,"2024-01-01"),null);
assert.equal(core.verifiedAbstract(doc,{...paper,access:{licenses:[...paper.access.licenses,{version:"vor",url:"https://example.org",start:"2025-02-01"}]}},"2026-01-01"),null);
assert.equal(core.verifiedAbstract(doc,{...paper,access:{licenses:[{version:"vor",url:license,start:"2025-02-30"}]}},"2026-01-01"),null);
assert.equal(core.verifiedAbstract(doc,{...paper,doi:"10.1234/b"},"2026-01-01"),null);
const idx={schema:1,built:"2026-01-01",docs:[doc],postings:{"инвестиц":[[0,5]]},abstract_postings:{},abstract_count:1,abstract_norms:[0]};
assert.deepEqual(core.researchEvidence(idx,[paper],"инвестиции","2026-01").map(r=>r.channels),[["metadata"]]);
assert.equal(core.researchEvidence(idx,[paper],"инвестиции","2024-12").length,0);
assert.equal(core.researchEvidence(idx,[paper,paper],"инвестиции","2026-01").length,0);
assert.equal(core.researchEvidence(idx,[{...paper,published:"2025-02"}],"инвестиции","2026-01").length,0);
const b={...doc,title:"Инвестиции в отрасли",code:"10.1234/b",href:"https://doi.org/10.1234/b"},pb={...paper,title:b.title,doi:b.code};
const two={...idx,docs:[doc,b],postings:{"инвестиц":[[0,5],[1,1]]},abstract_count:2,abstract_norms:[0,0]};
assert.deepEqual(core.researchEvidence(two,[{...paper,authors:""},pb],"инвестиции","2026-01",1).map(r=>r.code),[b.code]);
assert.equal(core.researchEvidence(idx,[paper],"инвестиции","2026-01",6).length,0);
console.log("12 verified research evidence checks passed");}

{const A=require("node:assert/strict"),S=require("./economic-search.js");
const lic="https://creativecommons.org/licenses/by/4.0/",stamp="2026-11-27";
const p={doi:"10.1234/abc",title:"Test",authors:"A",licensed_abstract:{text:"One two three",license:lic},access:{licenses:[{version:"vor",start:"2025-01-01",url:lic}]}};
const d={kind:"paper",code:p.doi,title:p.title,href:"https://doi.org/"+p.doi,abstract_license:lic};
A.deepEqual(S.abstractChunks("One two"),["One two"]);
const long=("economic model ".repeat(260)).trim(),chunks=S.abstractChunks(long);
A.ok(chunks.every(x=>x.length<=400));A.equal(chunks.join(" "),long);A.throws(()=>S.abstractChunks("x".repeat(4001)));
A.equal(S.abstractCandidates([d],[p],stamp).length,1);A.equal(S.abstractCandidates([d],[p,p],stamp).length,0);
A.equal(S.abstractCandidates([d],[{...p,access:{licenses:[]}}],stamp).length,0);
A.equal(S.abstractCandidates([d],[{...p,title:"Wrong"}],stamp).length,0);
A.equal(S.abstractCandidates([d,d],[p],stamp).length,1);
const v=i=>Array.from({length:384},(_,j)=>Number(j===i));
const ranked=S.abstractRank(v(0),[{doc:{title:"B"},vectors:[v(1)]},{doc:{title:"A"},vectors:[v(0),v(1)]}]);
A.equal(ranked[0].title,"A");A.equal(ranked[0].abstractSimilarity,.5);A.equal(ranked[0].bestChunk,1);A.equal(ranked[0].chunkCount,2);A.throws(()=>S.abstractRank(v(0),[{doc:d,vectors:[]}]));
console.log("14 abstract semantic comparison checks passed");}

{const A=require("node:assert/strict"),S=require("./economic-search.js"),lic="https://creativecommons.org/licenses/by/4.0/";
 const make=(i,date="2025-01")=>({kind:"paper",title:"Инвестиции "+i,code:"10.1234/"+i,href:"https://doi.org/10.1234/"+i,date,abstract_license:lic});
 const paper=d=>({doi:d.code,title:d.title,published:d.date,authors:"A",licensed_abstract:{license:lic,text:"Аннотация "+d.title},access:{licenses:[{version:"vor",url:lic,start:"2020-01-01"}]}});
 const docs=[...Array.from({length:60},(_,i)=>make(i,"2026-01")),make(60,"2024-01"),make(61,"2024-02")];
 const index=docs=>({schema:1,built:"2026-11-27",docs,postings:{"инвестиц":docs.map((d,i)=>[i,100-i])},abstract_postings:{},abstract_count:docs.length,abstract_norms:docs.map(()=>0)});
 const papers=docs.map(paper);
 A.deepEqual(S.researchEvidence(index(docs),papers,"инвестиции","2024-12").map(r=>r.code),[docs[60].code,docs[61].code],"future records");
 const invalid=docs.map((d,i)=>i<60?{...d,date:"2024-01"}:d);
 const missing=invalid.map(paper).map((p,i)=>i<60?{...p,authors:""}:p);
 A.equal(S.researchEvidence(index(invalid),missing,"инвестиции","2024-12").length,2,"invalid authors");
 A.equal(S.researchEvidence(index(invalid),[...missing,missing[60]],"инвестиции","2024-12").length,1,"ambiguous DOI");
 const badDate={...docs[60],date:"2024-02-30"},badHref={...docs[61],href:"https://example.org/not-doi"};
 A.equal(S.researchEvidence(index([badDate,badHref]),[paper(badDate),paper(badHref)],"2024-12").length,0,"invalid date or URL");
 const old=make(90,"2024");
 A.equal(S.researchEvidence(index([old]),[paper(old)],"инвестиции","2024-11").length,0,"year precision before December");
 A.equal(S.researchEvidence(index([old]),[paper(old)],"инвестиции","2024-12").length,1,"year precision in December");
 A.equal(S.researchEvidence(index([docs[60],docs[60],docs[61]]),papers,"инвестиции","2024-12").length,2,"duplicate indexed record");
 console.log("7 historical research retrieval checks passed");
}
