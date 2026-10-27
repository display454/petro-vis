const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cases/welllog-multicurve-segmentation/demo/core.js');

test('finds an exact step and respects interval endpoints', () => {
  const values = Array.from({length: 40}, (_, i) => [i < 20 ? -1 : 1]);
  const r = C.segment(values, {penalty: 1, minSamples: 3});
  assert.deepEqual(r.boundaryIndices, [20]);
  assert.deepEqual(r.segments.map(s => [s.start, s.end]), [[0,20],[20,40]]);
  assert.equal(r.dataCost, 0);
  assert.equal(r.objective, 1);
});
test('constant data produces no spurious boundary, including zero penalty ties', () => {
  for (const penalty of [0, 1, 100]) {
    assert.deepEqual(C.segment(Array.from({length: 30}, () => [2, 5]), {penalty,minSamples: 2}).boundaryIndices, []);
  }
});
test('minimum thickness applies to every segment and increasing penalty cannot add segments', () => {
  const {dataset} = C.makeSyntheticWell({seed: 1801, noise: 0.8, preset: 'thin'});
  const {values} = C.prepareFeatures(dataset, ['gr_api','rhob_g_cm3','rdep_ohm_m']);
  let previous = Infinity;
  for (const penalty of [0, .5, 2, 4, 8, 16, 32, 100]) {
    const r = C.segment(values, {penalty, minSamples: 8});
    assert(r.segments.every(s => s.end - s.start >= 8));
    assert(r.segments.length <= previous);
    previous = r.segments.length;
  }
});
test('same seed is reproducible and changing noise never changes latent boundaries', () => {
  const a = C.makeSyntheticWell({seed: 1801, noise: .35, preset:'thin'});
  assert.deepEqual(a, C.makeSyntheticWell({seed: 1801, noise: .35, preset:'thin'}));
  const b = C.makeSyntheticWell({seed: 1801, noise: 1, preset:'thin'});
  assert.deepEqual(a.reference, b.reference);
  assert.notDeepEqual(a.dataset.curves, b.dataset.curves);
});
test('preprocessing is unit-invariant, logs resistivity and does not mutate observations', () => {
  const {dataset} = C.makeSyntheticWell();
  const snapshot = JSON.stringify(dataset);
  const a = C.prepareFeatures(dataset,['gr_api','rdep_ohm_m']);
  const scaled = structuredClone(dataset);
  scaled.curves.gr_api = scaled.curves.gr_api.map(x=>x*1000);
  const b = C.prepareFeatures(scaled,['gr_api','rdep_ohm_m']);
  a.values.forEach((row,i)=>row.forEach((x,j)=>assert(Math.abs(x-b.values[i][j]) < 1e-9)));
  assert.equal(a.transforms[1].log10, true);
  assert.equal(JSON.stringify(dataset), snapshot);
});
test('matching maximizes one-to-one hits before distance and includes tolerance endpoints', () => {
  const r = C.evaluate([.9,1.8],[0,1],1);
  assert.equal(r.tp,2);
  assert.equal(r.fp,0);
  assert.equal(r.fn,0);
  assert.equal(r.f1,1);
  assert.equal(C.evaluate([1],[0],1).tp,1);
  assert.equal(C.evaluate([0,.1],[0],.5).tp,1);
  assert.equal(C.evaluate([0,.1],[0],.5).fp,1);
});
test('metrics handle empty predictions, no references and no matches explicitly', () => {
  assert.equal(C.evaluate([],[],.5).f1,null);
  assert.equal(C.evaluate([],[1],.5).f1,0);
  assert.equal(C.evaluate([1],[],.5).recall,null);
  const r=C.evaluate([8],[1],.5);
  assert.equal(r.mae_m,null);
  assert.deepEqual(r.falsePositives_m,[8]);
  assert.deepEqual(r.falseNegatives_m,[1]);
});
test('baseline uses observations, returns sorted separated interior boundaries', () => {
  const values=Array.from({length:80},(_,i)=>[i<40?0:4]);
  const r=C.gradientBaseline(values,{threshold:.5,minSamples:6,windowSamples:4});
  assert.deepEqual(r.boundaryIndices,[40]);
});
test('invalid and missing inputs fail explicitly; constant channels stay finite', () => {
  const {dataset}=C.makeSyntheticWell();
  dataset.curves.gr_api[2]=null;
  assert.throws(()=>C.prepareFeatures(dataset,['gr_api']),/finite/);
  assert.throws(()=>C.segment([[0],[1]],{penalty:1,minSamples:3}),/sample count/);
  assert.throws(()=>C.prepareFeatures({depth_m:[1,1],curves:{}},['gr_api']),/increasing/);
  assert.throws(()=>C.makeSyntheticWell({noise:-1}),/noise/);
  const d={depth_m:[1,2,3],curves:{gr_api:[7,7,7]}};
  assert.deepEqual(C.prepareFeatures(d,['gr_api']).values,[[0],[0],[0]]);
});
