const assert=require('node:assert/strict'),G=require('./group-passports.js');
assert.equal(G.change(100,120,'млн руб.'),20);assert.equal(G.change(0,5,'млн руб.'),null);assert.equal(G.change(5,7,'%'),2);assert.equal(G.change(-1,2,'млн руб.'),null);
const g={scope:'consolidated',standard:'IFRS',source:'https://example.org',metrics:[{id:'revenue',comparable:'annual_consolidated_revenue_rub',unit:'млрд руб.',observations:[{year:2025,value:'2'}]}]};
const r=G.revenueComparison({groups:[{...g,id:'a',name:'А'},{...g,id:'b',name:'Б',metrics:[{...g.metrics[0],unit:'млн руб.',observations:[{year:2025,value:'2000'}]}]},{...g,id:'c',name:'В',metrics:[{...g.metrics[0],id:'revenue_combined'}]}]},2025);
assert.equal(r.eligible,2);assert.equal(r.rows[0].value,2000);assert.equal(r.rows[1].rank,1);assert.equal(r.rows[2].rank,null);
const signed=G.signedBars([-20,10,0]);
assert.equal(signed.zero,50);assert.equal(signed.bars[0].left,0);assert.equal(signed.bars[1].width,25);assert.equal(signed.bars[2].width,0);assert.equal(G.signedBars([10,20]).bars[0].width,50);
const filtered={groups:[{...g,id:'a',name:'Альфа',sector:'Связь'},{...g,id:'b',name:'Бета',sector:'Транспорт'}]};
assert.equal(G.filterGroups(filtered,'Связь','альфа').length,1);assert.equal(G.filterGroups(filtered,'Связь','Бета').length,0);assert.equal(G.revenueComparison(filtered,2025,'Транспорт').eligible,1);assert.equal(G.revenueComparison(filtered,2025,'Транспорт').rows[0].rank,1);

const mm=(id,values,unit='млн руб.')=>({id,label:id,unit,...(id==='revenue'?{comparable:'annual_consolidated_revenue_rub'}:{}),observations:values.map(([year,value])=>({year,value:String(value)}))});
const rg={scope:'consolidated',standard:'IFRS',metrics:[mm('revenue',[[2025,2]],'млрд руб.'),mm('profit',[[2025,-100]]),mm('assets',[[2024,1000],[2025,2000]]),mm('equity',[[2024,400],[2025,800]]),mm('liabilities',[[2025,1200]])]};
const rr=Object.fromEntries(G.ratios(rg,2025).map(x=>[x.id,x]));
assert.equal(rr.net_margin.value,-5);assert.equal(rr.equity_share.value,40);assert.equal(rr.liability_share.value,60);assert.equal(rr.liabilities_equity.value,1.5);assert.equal(rr.asset_return.denominator,1500);assert.equal(rr.equity_return.denominator,600);assert.equal(rr.ppe_share.value,null);assert.equal(rr.operating_margin.value,null);
assert.equal(G.ratios(rg,2024).find(x=>x.id==='asset_return').value,null);
assert.equal(G.ratios({...rg,scope:'legal_entity'},2025).every(x=>x.value===null),true);
assert.equal(G.ratios({...rg,metrics:[mm('profit_parent',[[2025,100]]),mm('revenue',[[2025,200]])]},2025)[0].value,null);
assert.equal(G.ratios({...rg,metrics:[mm('profit',[[2025,100]]),mm('revenue',[[2025,0]])]},2025)[0].value,null);

const groups={groups:[{...rg,id:'a',name:'А',sector:'А'},{...rg,id:'rushydro',name:'Б',sector:'Б'},{...g,id:'c',name:'В',sector:'А'},{...rg,id:'d',name:'Г',scope:'legal_entity',sector:'А'}]};
const cr=G.ratioComparison(groups,2025,'net_margin');
assert.equal(cr.eligible,1);
assert.equal(cr.rows[0].value,-5);
assert.equal(cr.rows.find(x=>x.id==='rushydro').value,null);
assert.equal(cr.rows.find(x=>x.id==='c').reason,'Нет сопоставимого числителя');
assert.equal(cr.rows.find(x=>x.id==='d').reason,'Несопоставимый стандарт или периметр');
assert.equal(G.ratioComparison(groups,2025,'equity_share').eligible,2);
assert.equal(G.ratioComparison(groups,2025,'net_margin','Б').eligible,0);
assert.equal(G.ratioComparison(groups,2024,'asset_return').eligible,0);
assert.throws(()=>G.ratioComparison(groups,2025,'unknown'));
assert.throws(()=>G.ratioComparison(groups,2025.5,'net_margin'));

assert.equal(G.ratioComparison({groups:[{...rg,id:'alrosa',name:'АЛРОСА'}]},2025,'net_margin').eligible,0);
assert.equal(G.ratioComparison({groups:[{...rg,id:'alrosa',name:'АЛРОСА'}]},2025,'asset_return').eligible,1);

const disclosure={...rg,id:'nlmk',name:'НЛМК',standard:'IFRS_based_disclosure'};
assert.equal(G.ratios(disclosure,2025).every(x=>x.value===null),true);
assert.equal(G.revenueComparison({groups:[disclosure]},2025).eligible,0);
assert.equal(G.ratioComparison({groups:[disclosure]},2025,'equity_share').eligible,0);
assert.equal(G.revenueComparison({groups:[disclosure]},2025).rows[0].reason,'Несопоставимый стандарт отчётности');
