const assert=require('node:assert/strict'),W=require('./workspace.js');
const a={route:'iv-lab.html',title:'Лаборатория',date:'2026-11-26T00:00:00Z'},b={...a,route:'economic-map.html'};
let s=W.blank();assert.deepEqual(W.visit(s,a),s);s=W.toggle(s,a);assert.equal(s.bookmarks.length,1);assert.equal(W.toggle(s,a).bookmarks.length,0);
s=W.visit({...s,track:true},a);s=W.visit(s,b);s=W.visit(s,a);assert.deepEqual(s.history.map(r=>r.route),[a.route,b.route]);
assert.equal(W.merge([a],[a,b]).length,2);assert.deepEqual(W.parse(JSON.stringify(s)),s);
assert.deepEqual(W.importBookmarks(JSON.stringify({schema:1,type:'economic-bookmarks',bookmarks:[b]})),[b]);
for(const route of ['https://example.com/a.html','../a.html','a.html?q=x','a.html#x','javascript:alert(1)','//example.com/x.html']){assert.equal(W.route(route),null);assert.throws(()=>W.toggle(s,{...a,route}))}
assert.throws(()=>W.parse('broken'));assert.throws(()=>W.merge([a,a],[]));assert.throws(()=>W.importBookmarks(JSON.stringify(s)));
let full={...W.blank(),track:true};for(let i=0;i<35;i++)full=W.visit(full,{...a,route:'page-'+i+'.html'});assert.equal(full.history.length,30);
console.log('Workspace bookmarks, opt-in history and import tests passed');
