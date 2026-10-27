const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../cases/welllog-lithology-classification/demo/core.js');
const batch = require('../data/processed/force-demo-v2.json');
const train = batch.wells.filter(w => batch.split.train.includes(w.wellId));
function fixture(id, values, codes) {
  return {wellId:id, depth_m:values.map((_, i)=>i), curves:{gr_api:values}, mappedLithologyCode:codes};
}
test('kNN uses training scaling and distance tie-breaks without mutating inputs', () => {
  const wells = [fixture('a',[0,2,10],[1,1,2])], before = JSON.stringify(wells);
  const model = Core.fitLithology(wells,{featureKeys:['gr_api']});
  assert.equal(model.transforms[0].mean,4);
  assert.equal(Core.predictLithology(fixture('b',[9]), model,{k:1}).predictedCode[0],2);
  // One vote for either class; closer class wins.
  assert.equal(Core.predictLithology(fixture('b',[9]), model,{k:2}).predictedCode[0],2);
  assert.equal(JSON.stringify(wells),before);
});
test('inference never reads labels and missing/invalid features reject explicitly', () => {
  const model = Core.fitLithology(train);
  const held = structuredClone(batch.wells.find(w=>batch.split.test.includes(w.wellId)));
  const before = Core.predictLithology(held,model);
  Object.defineProperty(held,'mappedLithologyCode',{get(){throw new Error('leak');}});
  Object.defineProperty(held,'originalLithologyCode',{get(){throw new Error('leak');}});
  assert.deepEqual(Core.predictLithology(held,model),before);
  held.curves.gr_api[0]=null; held.curves.rdep_ohm_m[1]=0;
  const result = Core.predictLithology(held,model);
  assert.equal(result.rejected,2); assert.equal(result.predictedCode[0],null);
  assert.equal(result.voteFractions[1],null);
  assert.equal(model.trainingSamples,1973);
});
test('unknown reference is separate; rejected known predictions remain errors', () => {
  const m=Core.evaluateClassification([1,1,2,null],[1,null,1,2],[1,2]);
  assert.deepEqual(m.matrix,[[1,0,1],[1,0,0],[0,1,0]]);
  assert.equal(m.evaluated,3); assert.equal(m.unknownReference,1); assert.equal(m.rejectedKnown,1);
  assert.equal(m.accuracy,1/3); assert.equal(m.referenceCoverage,3/4);
  assert.equal(m.perClass[0].f1,0.5); assert.equal(m.macroF1,0.25);
});
test('single-class and absent-reference cases have fixed axes and no invented perfect macro', () => {
  const m=Core.evaluateClassification([1,1],[1,1],[1,2,3,4]);
  assert.equal(m.accuracy,1); assert.equal(m.macroF1,0.25); assert.equal(m.matrix.length,5);
  assert.equal(Core.evaluateClassification([null],[1],[1,2]).macroF1,null);
  assert.equal(Core.evaluateClassification([],[],[1,2]).referenceCoverage,null);
});
test('real batch accounting and majority baseline match hand-counted supports', () => {
  const model=Core.fitLithology(train);
  assert.deepEqual(model.classCodes,[30000,65000,65030,70000]);
  assert.deepEqual(model.classCounts,[350,1389,192,42]);
  assert.equal(model.majorityCode,65000);
  const val=batch.wells.find(w=>batch.split.validation.includes(w.wellId));
  const m=Core.evaluateClassification(val.mappedLithologyCode,Core.predictMajority(val,model).predictedCode,model.classCodes);
  assert.equal(m.total,500); assert.equal(m.evaluated,303); assert.equal(m.unknownReference,197);
  assert.equal(m.matrix.flat().reduce((a,b)=>a+b,0),500);
  assert.throws(()=>Core.predictLithology(val,model,{k:0}),/正整数/);
});
