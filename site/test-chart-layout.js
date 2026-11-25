const assert=require('node:assert/strict');
const {chartTickIndices,chartWrap,chartAdjacent}=require('./chart-export.js');
assert.deepEqual(chartTickIndices(0),[]);
assert.deepEqual(chartTickIndices(1),[0]);
assert.deepEqual(chartTickIndices(3),[0,1,2]);
assert.deepEqual(chartTickIndices(20,5),[0,5,10,14,19]);
assert.deepEqual(chartWrap('Очень длинный заголовок',8,s=>s.length),['Очень','длинный','заголово','к']);
const lines=chartWrap('https://example.com/'+('x'.repeat(100)),15,s=>s.length);assert.ok(lines.every(s=>s.length<=15));
assert.equal(chartAdjacent('2024-12','2025-01',true),true);
assert.equal(chartAdjacent('2024-12','2025-02',true),false);
assert.equal(chartAdjacent(2020,2022),false);
console.log('Chart layout tests passed');

const M=require('./layout.js');
assert.equal(M.dimensions(1000,390,1),390);
assert.equal(M.dimensions(1000,390,2),780);
assert.equal(M.dimensions(1000,1440,4),4000);
assert.equal(M.nextZoom(1,-.5),1);
assert.equal(M.nextZoom(3.5,.5),4);
assert.equal(M.nextZoom(4,.5),4);
assert.equal(M.nextZoom(2,-.5),1.5);

const {chartCoverage}=require('./chart-export.js');
assert.deepEqual(chartCoverage([2021,2022,2023],[{name:'A',values:[0,null,3,8]},{name:'B',values:[undefined,NaN,-1]}]),[{name:'A',observed:2,expected:3},{name:'B',observed:1,expected:3}]);

const {chartAlignedSeries}=require('./chart-export.js');
assert.deepEqual(chartAlignedSeries([2020,2021],[{name:'A',values:[0,NaN,999]},{name:'B',values:[-2]}]),[{name:'A',values:[0,null]},{name:'B',values:[-2,null]}]);
assert.deepEqual(chartAlignedSeries([],[{name:'A',values:[1]}]),[{name:'A',values:[]}]);
