/* Renderer unit checks, without a browser; do not claim pointer/layout coverage. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require.resolve('../cases/welllog-porosity-regression/demo/app.js'),'utf8');
function renderer(name,next,values){
  const calls=[],context={met:{},failed:null,state:{selected:null,cursor:null,showRef:true},
    svg:{depth:'depth',scatter:'scatter'},ctx:{},el:{'depth-status':{},'scatter-status':{}},
    sizeOf:()=>({W:640,H:430}),depths:()=>[1000,1001],ref:()=>values,
    pred:{predicted_vv:values},den:{predicted_vv:values},
    isNum:Number.isFinite,niceTicks:()=>[],lin:(a,b,p,q)=>v=>p+(v-a)/(b-a||1)*(q-p),
    pathOf:(v,x,y,cls)=>'<path class="'+cls+'"/>',emptyText:()=>'<text>empty</text>',
    draw:(target,w,h,html)=>calls.push({target,html})};
  vm.createContext(context);
  vm.runInContext(src.slice(src.indexOf('  function '+name+'('),src.indexOf('  function '+next+'(')),context);
  return {context,calls,paint:()=>context[name]()};
}
test('reference checkbox actually hides only the reference depth path',()=>{
  const r=renderer('paintDepth','hline',[.1,.2]);r.paint();
  assert.ok(r.calls.at(-1).html.includes('<path class="t-ref"'));
  r.context.state.showRef=false;r.paint();
  assert.ok(!r.calls.at(-1).html.includes('<path class="t-ref"'));
  assert.ok(r.calls.at(-1).html.includes('<path class="t-knn"'));
  assert.ok(r.calls.at(-1).html.includes('<path class="t-den"'));
});
test('empty scatter clears its own surface rather than the depth surface',()=>{
  const r=renderer('paintScatter','paintResid',[]);r.paint();
  assert.equal(r.calls.at(-1).target,'scatter');
  assert.equal(r.context.ctx.scatter,null);
  assert.equal(r.context.el['scatter-status'].textContent,'没有可绘制的点');
});

test('porosity repaint synchronizes displayed parameters and selected buttons',()=>{
  function group(attr,values){
    const buttons=values.map(value=>({dataset:{[attr]:value},setAttribute(k,v){this[k]=v;}}));
    return {buttons,querySelectorAll:()=>buttons};
  }
  const el={noise:{},'noise-out':{},'perwell-out':{},'k-out':{},'show-ref':{},
    'scenario-group':group('scenario',['standard','shift']),
    'perwell-group':group('perwell',['12','24']),
    'k-group':group('k',['5','9']),
    'feature-group':group('features',['all','basic'])};
  const context={el,state:{noise:1.1,perWell:12,k:5,showRef:false,scenario:'shift',features:'basic'}};
  for(const name of ['paintMode','paintFacts','paintDepth','paintScatter','paintResid','paintMetrics','paintDetail','paintSource']) context[name]=()=>{};
  vm.createContext(context);
  vm.runInContext(src.slice(src.indexOf('  function syncControls('),src.indexOf('  /* ---------------- 图表骨架')),context);
  vm.runInContext(src.slice(src.indexOf('  function paintAll('),src.indexOf('  function paintMode(')),context);
  context.paintAll();
  assert.equal(el.noise.value,'1.1');assert.equal(el['noise-out'].textContent,'1.1');
  assert.equal(el['perwell-out'].textContent,'12');assert.equal(el['k-out'].textContent,'5');
  assert.equal(el['show-ref'].checked,false);
  assert.deepEqual(el['k-group'].buttons.map(b=>b['aria-pressed']),['true','false']);
  assert.deepEqual(el['perwell-group'].buttons.map(b=>b['aria-pressed']),['true','false']);
  assert.deepEqual(el['scenario-group'].buttons.map(b=>b['aria-pressed']),['false','true']);
  assert.deepEqual(el['feature-group'].buttons.map(b=>b['aria-pressed']),['false','true']);
});
