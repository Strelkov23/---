
const assert=require('node:assert/strict'),C=require('./company-lookup.js');
assert.equal(C.validInn('7707083893'),true);
assert.equal(C.validInn('7707083894'),false);
assert.equal(C.path('7707083893'),'company-index/inn-'+String(7707083893%512).padStart(3,'0')+'.json.gz');
assert.throws(()=>C.path('../bad'));
const r=['7707083893','А','А','9007199254740993',null,0,0,1,2,3];
assert.equal(C.row([r],'7707083893').income_cents,'9007199254740993');
assert.equal(C.row([r],'7707083893').workers,0);
assert.equal(C.row([r],'7704211201'),null);
assert.throws(()=>C.row([r,r],'7707083893'));

const name=C.path(r[0]),idx={files:{[name]:{count:1}},members:{income:['x'],employment:['x','y','z']}};
assert.equal(C.validateBlock([r],idx,name)[0][0],r[0]);
assert.throws(()=>C.validateBlock([[...r.slice(0,3),1,...r.slice(4)]],idx,name));
assert.throws(()=>C.validateBlock([[...r.slice(0,5),-1,...r.slice(6)]],idx,name));
assert.throws(()=>C.validateBlock([r],{...idx,members:{income:[],employment:[]}},name));
const rec={...C.row([r],r[0]),rank:1};
const rep={rankings:{income:{eligible:10,rows:[rec]},employment:{eligible:20,rows:[{...rec,rank:1}]}}};
assert.deepEqual(C.rankMatches(rep,r[0]).matches,{income:{rank:1,eligible:10},employment:{rank:1,eligible:20}});
assert.equal(C.rankMatches(rep,'7704211201').record,null);
assert.throws(()=>C.rankMatches({rankings:{income:rep.rankings.income,employment:{eligible:20,rows:[{...rec,workers:2}]}}},r[0]));

assert.deepEqual(C.parseSelection('7707083893, 7704211201;7707083893'),['7707083893','7704211201']);
assert.throws(()=>C.parseSelection('7707083893'));
assert.throws(()=>C.parseSelection('7707083893 7707083894'));
assert.deepEqual(C.calculate({income_cents:'10001',expense_cents:'8000',workers:2}),{difference:'2001',incomePerWorker:'5001',expenseShare:'7999'});
assert.deepEqual(C.calculate({income_cents:'0',expense_cents:'20',workers:0}),{difference:'-20',incomePerWorker:null,expenseShare:null});
assert.deepEqual(C.calculate({income_cents:'9007199254740993',expense_cents:'0',workers:1}),{difference:'9007199254740993',incomePerWorker:'9007199254740993',expenseShare:'0'});
assert.deepEqual(C.calculate({income_cents:null,expense_cents:'20',workers:2}),{difference:null,incomePerWorker:null,expenseShare:null});
assert.deepEqual(C.barWidths([{income_cents:'10'},{income_cents:'5'},{income_cents:'-5'},null],'income_cents'),[100,50,null,null]);
assert.deepEqual(C.barWidths([{workers:0},{workers:null}],'workers'),[null,null]);

const cov={mode:'full',year:2025,paired:8,sources:[{kind:'income_expense',complete:true,year:2025,unique:10},{kind:'employment',complete:true,year:2025,unique:12}]};
assert.deepEqual(C.coverage(cov),{total:14,paired:8,incomeOnly:2,employmentOnly:4,income:10,employment:12});
assert.equal(C.coverage({...cov,mode:'pilot'}),null);
assert.throws(()=>C.coverage({...cov,paired:11}));
assert.throws(()=>C.coverage({...cov,year:2024}));

assert.equal(C.normalizeName('ПАО «СБЕРБАНК»'),'сбербанк');
assert.equal(C.normalizeName('ООО Ёлка-2026'),'ёлка 2026');
assert.equal(C.namePath('сбербанк'),C.namePath('сбе'));
assert.throws(()=>C.namePath('сб'));
assert.deepEqual(C.nameMatches([['7707083893','ПАО Сбербанк'],['7707083893','Сбербанк'],['7704211201','Другой']],'сбе'),[['7707083893','ПАО Сбербанк']]);

assert.equal(C.normalizeName('Общество с ограниченной ответственностью «Ромашка»'),'ромашка');
const np=C.namePath('сбер'),np2=np.slice(0,-8)+'-001.json.gz';
const nd={files:{[np]:{min:'сбера',max:'сбербанк',count:10,bytes:100},[np2]:{min:'сбербанк',max:'сберю',count:10,bytes:100}}};
assert.equal(C.nameParts(nd,'сбербанк').length,2);assert.equal(C.nameParts(nd,'сберю').length,1);assert.equal(C.nameParts(nd,'сберхх').length,1);assert.throws(()=>C.nameParts({files:{[np]:{min:'сбе',max:'сберю',count:190000,bytes:100}}},'сбер'));
