const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../cases/welllog-porosity-regression/demo/core.js');
test('synthetic references precede observations; noise/shift do not change latent target or training labels',()=>{
  const a=C.makeExperiment(),b=C.makeExperiment({noise:2}),s=C.makeExperiment({scenario:'shift'});
  assert.deepEqual(C.makeExperiment(),a);
  assert.deepEqual(a.target.reference,b.target.reference);assert.deepEqual(a.target.reference,s.target.reference);
  assert.deepEqual(a.train,s.train);assert.deepEqual(a.train[0].calibration,b.train[0].calibration);
  assert.notDeepEqual(a.target.dataset.curves,s.target.dataset.curves);
  assert.ok(!('porosity_vv' in a.target.dataset));
  assert.ok(a.train.every(w=>w.dataset.wellId!==a.target.dataset.wellId));
});
test('calibration budgets are nested and feature statistics use only selected training points',()=>{
  const e=C.makeExperiment(),a=C.fitPorosity(e.train,{perWell:6}),b=C.fitPorosity(e.train,{perWell:24});
  assert.equal(a.trainingSamples,24);assert.equal(b.trainingSamples,96);
  assert.ok(a.positions.every(p=>b.positions.some(q=>q.wellId===p.wellId&&q.sampleIndex===p.sampleIndex)));
  const mean=a.positions.reduce((s,p)=>s+e.train.find(w=>w.dataset.wellId===p.wellId).dataset.curves.gr_api[p.sampleIndex],0)/24;
  assert.equal(a.transforms[0].mean,mean);
});
test('prediction ignores added reference fields, rejects invalid point features and preserves observations',()=>{
  const e=C.makeExperiment(),model=C.fitPorosity(e.train),d=e.target.dataset,before=JSON.stringify(d),p=C.predictPorosity(d,model);
  Object.defineProperty(d,'reference',{get(){throw Error('leak');}});
  assert.deepEqual(C.predictPorosity(d,model),p);assert.equal(JSON.stringify(d),before);
  d.curves.nphi_vv[0]=null;d.curves.rdep_ohm_m[1]=0;
  assert.deepEqual(C.predictPorosity(d,model).predicted_vv.slice(0,2),[null,null]);
  assert.throws(()=>C.predictPorosity(d,model,{k:0}),/正整数/);
});
test('density formula and percentage-point errors have physically defined units and no silent clipping',()=>{
  const d={depth_m:[1,2,3],curves:{rhob_g_cm3:[2.65,2.32,2.98]}};
  const p=C.densityBaseline(d).predicted_vv;
  assert.ok(Math.abs(p[1]-.2)<1e-12);assert.ok(p[2]<0);
  const m=C.evaluateRegression([.1,.2,null],[.12,null,100]);
  assert.ok(Math.abs(m.mae_pp-2)<1e-10);assert.equal(m.n,1);assert.equal(m.coverage,.5);assert.equal(m.r2,null);
  assert.equal(C.evaluateRegression([.1,.1],[.2,.2]).r2,null);
});
test('default and shifted wells produce actual finite predictions with independent baselines',()=>{
  for(const scenario of ['standard','shift']){
    const e=C.makeExperiment({scenario}),model=C.fitPorosity(e.train),p=C.predictPorosity(e.target.dataset,model);
    const m=C.evaluateRegression(e.target.reference.porosity_vv,p.predicted_vv);
    assert.equal(m.n,320);assert.ok(m.mae_pp>0&&m.mae_pp<10);
    assert.ok(p.localSpread_vv.every(v=>v>=0));assert.equal(p.outsideTrainingRange.length,320);
    assert.notDeepEqual(p.predicted_vv,C.densityBaseline(e.target.dataset).predicted_vv);
  }
});
