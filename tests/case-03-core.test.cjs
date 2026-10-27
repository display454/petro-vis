const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../cases/welllog-fracture-detection/demo/core.js');
const generated=C.makeImage(),prepared=C.prepareImage(generated.image),search=C.searchSinusoids(prepared);
test('image generation is reproducible and noise/visibility do not change reference geometry',()=>{
  assert.deepEqual(C.makeImage(),generated);
  assert.deepEqual(C.makeImage({noise:.2,visibility:.2}).reference,generated.reference);
  assert.notDeepEqual(C.makeImage({noise:.2}).image.pixels,generated.image.pixels);
  assert.equal(generated.image.pixels.length,128*256);
});
test('pixel-only search recovers default geometry; absent lines cannot be reconstructed from answers',()=>{
  const image=structuredClone(generated.image);
  Object.defineProperty(image,'reference',{get(){throw Error('leak');}});
  assert.deepEqual(C.prepareImage(image),prepared);
  const predictions=C.selectCandidates(search),m=C.evaluateDetections(predictions,generated.reference.fractures);
  assert.equal(m.tp,3);assert.equal(m.fp,0);assert.ok(m.meanDistance_px<1);
  const none=C.makeImage({visibility:0,noise:0});
  const p=C.selectCandidates(C.searchSinusoids(C.prepareImage(none.image)));
  assert.equal(p.length,0);assert.equal(C.evaluateDetections(p,none.reference.fractures).fn,3);
});
test('threshold operates on a cached ranked list and lowering it retains higher-threshold detections',()=>{
  const high=C.selectCandidates(search,{threshold:.8}),low=C.selectCandidates(search,{threshold:.2});
  assert.ok(low.length>=high.length);assert.ok(high.every(c=>low.some(d=>c.id===d.id)));
  assert.throws(()=>C.selectCandidates(search,{threshold:2}),/0—1/);
});
test('occluded columns remain missing and constant vertical artefacts are suppressed',()=>{
  const e=C.makeImage({preset:'occluded'}),p=C.prepareImage(e.image);
  assert.equal(p.validPixels,97*256);
  assert.ok(Array.from({length:256},(_,y)=>p.strength[y*128+30]).every(v=>v===null));
  const blank={width:32,height:64,pixels:Array.from({length:32*64},(_,i)=>i%32===8?.1:.8)};
  assert.ok(C.prepareImage(blank).strength.every(v=>v<1e-10));
});
test('object matching maximizes one-to-one matches; phase wrap and empty metrics are explicit',()=>{
  const c=x=>({centerRow:x,amplitude_px:0,phase_deg:0});
  const m=C.evaluateDetections([c(0),c(3)],[c(1),c(-2)],{centerTolerance_px:3,trajectoryTolerance_px:3});
  assert.equal(m.tp,2);assert.equal(new Set(m.matches.map(v=>v.referenceIndex)).size,2);
  assert.ok(C.trajectoryDistance({centerRow:50,amplitude_px:16,phase_deg:359},{centerRow:50,amplitude_px:16,phase_deg:1})<.4);
  assert.equal(C.evaluateDetections([],[]).f1,null);assert.equal(C.evaluateDetections([],[c(0)]).f1,0);
});
