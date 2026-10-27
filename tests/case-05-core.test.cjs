const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../cases/welllog-curve-reconstruction/demo/core.js');
const batch = require('../data/processed/force-demo-v2.json');
const train=batch.wells.filter(w=>batch.split.train.includes(w.wellId));
function well(values) {return {wellId:'fixture',depth_m:values.map((_,i)=>i),curves:{gr_api:values},units:{gr_api:'API'}};}
test('mask is deterministic, nested in ratio, block-shaped, source preserving, and independent of values',()=>{
  const w=structuredClone(batch.wells[0]), before=JSON.stringify(w);
  const a=Core.makeMask(w,{ratio:.1}), b=Core.makeMask(w,{ratio:.3});
  assert.deepEqual(Core.makeMask(w,{ratio:.1}),a);
  assert.equal(a.masked,50); assert.equal(b.masked,150);
  assert.ok(a.flags.every((v,i)=>!v||b.flags[i]));
  assert.ok(a.gaps.every(g=>g.kind==='masked'&&g.end-g.start<=15));
  assert.ok(a.flags.every((v,i)=>!v||a.visible.curves.gr_api[i]===null));
  assert.equal(JSON.stringify(w),before);
  w.curves.gr_api=w.curves.gr_api.map((_,i)=>100000-i);
  assert.deepEqual(Core.makeMask(w,{ratio:.1}).flags,a.flags);
});
test('genuine null gaps never become scored masks; edge gaps have no linear extrapolation',()=>{
  const w=well([null,1,2,3,4,null,6,7,8,null]), m=Core.makeMask(w,{ratio:0});
  const p=Core.repairCurve(m.visible,m,{method:'linear'});
  assert.deepEqual(m.gapKind,['genuine','observed','observed','observed','observed','genuine','observed','observed','observed','genuine']);
  assert.equal(p.filled[0],null); assert.equal(p.filled[5],5); assert.equal(p.filled[9],null);
  assert.equal(Core.evaluateRepair(w.curves.gr_api,p.filled,m.flags).n,0);
});
test('interpolation uses physical depths and cannot consume hidden truth',()=>{
  const w=well([0,100,3]); w.depth_m=[0,1,3];
  const mask={flags:[false,true,false],gapKind:['observed','masked','observed']};
  assert.throws(()=>Core.repairCurve(w,mask,{method:'linear'}),/遮挡真值/);
  const visible=well([0,null,3]); visible.depth_m=w.depth_m;
  assert.equal(Core.repairCurve(visible,mask,{method:'linear'}).filled[1],1);
});
test('ridge solves a known linear target, uses train-only statistics and no target as feature',()=>{
  const w=well(Array.from({length:30},(_,i)=>5+2*i));
  w.curves.rhob_g_cm3=Array.from({length:30},(_,i)=>i);
  w.curves.nphi_vv=Array(30).fill(.2); w.curves.rdep_ohm_m=Array(30).fill(10);
  const model=Core.fitRepair([w],{lambda:1e-8});
  assert.equal(model.transforms[0].mean,14.5);
  assert.deepEqual(model.featureKeys,['rhob_g_cm3','nphi_vv','rdep_ohm_m']);
  const mask=Core.makeMask(w,{ratio:.3}), p=Core.repairCurve(mask.visible,mask,{method:'ridge',model});
  assert.ok(Core.evaluateRepair(w.curves.gr_api,p.filled,mask.flags).mae<1e-5);
  assert.equal(p.filled[0],w.curves.gr_api[0]);
});
test('metrics exclude visible/genuine values, retain failed predictions in coverage, and allow negative R2',()=>{
  const m=Core.evaluateRepair([1000,1,3,null,8],[0,2,1,10,null],[false,true,true,true,true]);
  assert.equal(m.n,2); assert.equal(m.masked,3); assert.equal(m.coverage,2/3);
  assert.equal(m.mae,1.5); assert.equal(m.rmse,Math.sqrt(2.5)); assert.equal(m.r2,-1.5);
  assert.equal(Core.evaluateRepair([1,1],[2,2],[true,true]).r2,null);
  assert.equal(Core.evaluateRepair([1],[null],[true]).mae,null);
  assert.equal(Core.evaluateRepair([1],[2],[false]).coverage,null);
  const c=Core.compareRepairs([1,2,3],[1,null,9],[2,2,3],[true,true,true]);
  assert.equal(c.common,2); assert.equal(c.a.n,c.b.n); assert.equal(c.aBetter,1); assert.equal(c.bBetter,1);
});
test('real masked test uses training-only model and remains identical when hidden answers change elsewhere',()=>{
  const model=Core.fitRepair(train), held=batch.wells.find(w=>batch.split.test.includes(w.wellId));
  const m=Core.makeMask(held), result=Core.repairCurve(m.visible,m,{method:'ridge',model});
  assert.equal(model.trainingSamples,2000); assert.equal(model.trainingWellIds.length,4);
  assert.equal(Core.evaluateRepair(held.curves.gr_api,result.filled,m.flags).n,75);
  const altered=structuredClone(held);
  altered.curves.gr_api=altered.curves.gr_api.map((v,i)=>m.flags[i]?v+10000:v);
  altered.mappedLithologyCode=Array(500).fill(88000);
  const m2=Core.makeMask(altered);
  assert.deepEqual(Core.repairCurve(m2.visible,m2,{method:'ridge',model}),result);
  assert.deepEqual(Core.repairCurve(m2.visible,m2,{method:'linear'}),Core.repairCurve(m.visible,m,{method:'linear'}));
});
