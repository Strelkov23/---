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
