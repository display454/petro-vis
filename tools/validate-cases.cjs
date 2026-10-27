/* Contract, original-host inlining and plugin lifecycle checks. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const global={console};
global.window=global;
const ctx=vm.createContext(global);
['extracted/assets/data.js','extracted/assets/core/registry.js','extracted/assets/core/case-demo-host.js']
  .forEach(p=>vm.runInContext(read(p),ctx,{filename:p}));
const readyIds=fs.readdirSync(path.join(root,'cases')).filter(id=>fs.existsSync(path.join(root,'cases',id,'case.json'))&&JSON.parse(read('cases/'+id+'/case.json')).status==='ready');
const originalHost=global.CaseDemoHost;
for(const id of readyIds){
const source=JSON.parse(read('cases/'+id+'/case.json'));
assert.equal(source.status,'ready');
assert.equal(source.tabs.background.sections.length,4);
assert.equal(source.tabs.background.judge.length,4);
assert(source.tabs.workflow.steps.length>=4);
assert.equal(source.tabs.demo.html,'demo/index.html');
assert(!JSON.stringify(source).includes('<script'));
assert((JSON.stringify(source).match(/<svg/g)||[]).length>=5);
const plugin=read('site/assets/cases/'+id+'.case.js');
vm.runInContext(plugin,ctx,{filename:id+'.case.js'});
const definition=global.Cases.get(id);
const errors=global.Cases.validate(definition).filter(x=>x.level==='error');
assert.equal(errors.length,0,JSON.stringify(errors));
assert.equal(JSON.stringify(definition.tabs.background),JSON.stringify(source.tabs.background));
assert.equal(JSON.stringify(definition.tabs.workflow),JSON.stringify(source.tabs.workflow));
let creates=0,destroys=0,packageConfig;
const host=originalHost;
global.CaseDemoHost={create(root,pkg){creates++;packageConfig=pkg;return{destroy(){destroys++;}};}};
definition.tabs.demo.mount({}, {});
definition.tabs.demo.mount({}, {});
definition.tabs.demo.unmount();
definition.tabs.demo.unmount();
assert.equal(creates,2);
assert.equal(destroys,2);
const usesPublicData=['welllog-lithology-classification','welllog-curve-reconstruction'].includes(id);
assert.equal(packageConfig.files.length,usesPublicData?6:5);
assert.equal(packageConfig.meta.id,id);
assert.equal(host.resolveMode(packageConfig),'page');
const page=host.buildPageDoc(packageConfig,'contract-test');
assert(!/<script\b[^>]*\ssrc\s*=/i.test(page));
assert(!/<link\b[^>]*\brel=["']stylesheet/i.test(page));
if(id==='welllog-multicurve-segmentation'){
  assert(page.includes('window.WelllogSegCore'));
  assert(page.includes('id="chart"'));
}else if(usesPublicData){
  assert(page.includes('WelllogDemoData'));
  const api=id==='welllog-curve-reconstruction'?'WelllogRepairCore':'WelllogLithologyCore';
  assert(page.indexOf('root.WelllogDemoData=')<page.indexOf('else root.'+api));
}
const inlineScripts=[...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
assert(inlineScripts.length>=3);
inlineScripts.forEach((m,i)=>new vm.Script(m[1],{filename:'inlined-'+i+'.js'}));
vm.runInContext(read('site/assets/core/case-demo-host.js'),ctx);
const sitePage=global.CaseDemoHost.buildPageDoc(packageConfig,'site-contract-test');
[...sitePage.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
  .forEach((m,i)=>new vm.Script(m[1],{filename:'site-inlined-'+i+'.js'}));
for(const name of ['core.js','app.js'])new vm.Script(read('cases/'+id+'/demo/'+name),{filename:name});
const index=read('site/index.html');
assert(index.indexOf(id+'.case.js')>0);
assert(index.indexOf(id+'.case.js')<index.indexOf('assets/cases/welllog-layer.case.js'));
assert(index.indexOf(id+'.case.js')<index.indexOf('assets/core/shell.js'));
console.log('PASS ready: '+id+' — schema, SVG, parity, original registry, original/site host, syntax, lifecycle, load order');
}

// Public data and browser globals remain identical to the accepted canonical batch.
const crypto=require('node:crypto');
const publicBytes=fs.readFileSync(path.join(root,'data/processed/force-demo-v2.json'));
const publicHash=crypto.createHash('sha256').update(publicBytes).digest('hex');
for(const [draftId,api] of [['welllog-lithology-classification','WelllogLithologyCore'],['welllog-curve-reconstruction','WelllogRepairCore']]) {
  const draft=JSON.parse(read('cases/'+draftId+'/case.json'));
  assert.equal(draft.status,'ready');
  assert.equal(draft.tabs.background.sections.length,4);
  assert.equal(draft.tabs.workflow.steps.length,6);
  assert((JSON.stringify(draft).match(/<svg/g)||[]).length>=6);
  assert(!JSON.stringify(draft).includes('<script'));
  // Registry requires the runtime mount function; generated plugins add it at build time.
  const runtime=JSON.parse(JSON.stringify(draft));runtime.tabs.demo.mount=function(){};
  assert.equal(global.Cases.validate(runtime).filter(x=>x.level==='error').length,0);
  const browser={};browser.globalThis=browser;
  const draftContext=vm.createContext(browser);
  for(const name of ['data.js','core.js'])vm.runInContext(read('cases/'+draftId+'/demo/'+name),draftContext,{filename:draftId+'/'+name});
  assert.equal(browser[api].version,'1.0.0');
  assert.equal(browser.WelllogDemoData.datasetSha256,publicHash);
  assert.equal(JSON.stringify(browser.WelllogDemoData.batch),JSON.stringify(JSON.parse(publicBytes)));
}
console.log('PASS: w4/w5 content contracts, 12 SVG figures, browser globals and exact canonical data parity');
for(const [id,api] of [['welllog-porosity-regression','WelllogPorosityCore'],['welllog-fracture-detection','WelllogFractureCore']]){
  const draft=JSON.parse(read('cases/'+id+'/case.json'));
  assert.equal(draft.status,'ready');
  assert.equal(draft.tabs.background.sections.length,4);
  assert.equal(draft.tabs.workflow.steps.length,6);
  assert((JSON.stringify(draft).match(/<svg/g)||[]).length>=6);
  const runtime=JSON.parse(JSON.stringify(draft));runtime.tabs.demo.mount=function(){};
  assert.equal(global.Cases.validate(runtime).filter(x=>x.level==='error').length,0);
  const browser={};browser.globalThis=browser;
  vm.runInNewContext(read('cases/'+id+'/demo/core.js'),browser);
  assert.equal(browser[api].version,'1.0.0');
}
console.log('PASS: w2/w3 content and UMD browser API contracts');
