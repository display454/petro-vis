/* Synthetic calibration experiment. Reference arrays never enter prediction. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WelllogPorosityCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var KEYS=['gr_api','rhob_g_cm3','nphi_vv','rdep_ohm_m'];
  function check(ok,s){if(!ok)throw new Error(s);}
  function rng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function normal(r){return Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());}
  function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function makeWell(seed,n,shift,noise,training){
    var latent=rng(seed), obs=rng(seed^0xA51CE), lab=rng(seed^0x17AB), curves={gr_api:[],rhob_g_cm3:[],nphi_vv:[],rdep_ohm_m:[]};
    var truth=[],calibration=[],depth=[],phase=latent()*Math.PI*2;
    for(var i=0;i<n;i++){
      var facies=(Math.floor(i/48)+seed)%4, shale=facies===0?.78:(facies===2?.28:.08);
      var phi=Math.max(.035,Math.min(.32,.085+.17*(1-shale)+.027*Math.sin(i/23+phase)+.006*normal(latent)));
      var matrix=2.65+.08*shale+(facies===2?.05:0), fluid=shift?.68:1;
      truth.push(phi);depth.push(2100+i*.25);
      curves.gr_api.push(24+100*shale+7*noise*normal(obs));
      curves.rhob_g_cm3.push(matrix*(1-phi)+fluid*phi+.012*noise*normal(obs));
      curves.nphi_vv.push(phi+.11*shale+(shift?-.065:0)+.009*noise*normal(obs));
      curves.rdep_ohm_m.push(Math.exp(.6+1.8*(1-shale)+2.2*phi+(shift?.65:0)+.1*noise*normal(obs)));
      calibration.push({sampleIndex:i,porosity_vv:phi+.004*normal(lab)});
    }
    var dataset={schemaVersion:'1.0',id:'porosity-'+seed+(shift?'-shift':''),wellId:(training?'CAL-':'TARGET-')+seed,
      depth_m:depth,curves:curves,units:{gr_api:'API',rhob_g_cm3:'g/cm³',nphi_vv:'v/v',rdep_ohm_m:'Ω·m'},
      source:{kind:'synthetic',seed:seed,label:'合成岩石物理教学井；模拟岩心标定，非实测岩心'}};
    return training?{dataset:dataset,calibration:calibration}:{dataset:dataset,reference:{kind:'synthetic',porosity_vv:truth}};
  }
  function makeExperiment(options){
    options=options||{};var seed=options.seed===undefined?1802:options.seed,noise=options.noise===undefined?1:options.noise,scenario=options.scenario||'standard';
    check(Number.isInteger(seed),'seed 必须为整数');check(Number.isFinite(noise)&&noise>=0&&noise<=3,'noise 必须在0—3');
    check(scenario==='standard'||scenario==='shift','未知井段情境');
    return {seed:seed,scenario:scenario,train:[0,1,2,3].map(function(j){return makeWell(seed+101+j*17,240,false,noise,true);}),
      target:makeWell(seed+907,320,scenario==='shift',noise,false)};
  }
  function rows(d,keys){
    check(d&&d.curves&&Array.isArray(d.depth_m),'缺少曲线或深度');
    keys.forEach(function(k){check(d.curves[k]&&d.curves[k].length===d.depth_m.length,'曲线缺失或错位：'+k);});
    return d.depth_m.map(function(_,i){var row=keys.map(function(k){var v=d.curves[k][i];return !Number.isFinite(v)||(k==='rdep_ohm_m'&&v<=0)?null:(k==='rdep_ohm_m'?Math.log10(v):v);});return row.some(function(v){return v===null;})?null:row;});
  }
  function selectCalibration(train,options){
    options=options||{};var count=options.perWell===undefined?24:options.perWell;
    check(Number.isInteger(count)&&count>0,'每井标定数必须为正整数');
    return train.map(function(w){
      var ordered=w.calibration.slice().sort(function(a,b){return hash('cal-v1|'+w.dataset.wellId+'|'+a.sampleIndex)-hash('cal-v1|'+w.dataset.wellId+'|'+b.sampleIndex)||a.sampleIndex-b.sampleIndex;});
      return {dataset:w.dataset,calibration:ordered.slice(0,count)};
    });
  }
  function fitPorosity(train,options){
    options=options||{};var keys=(options.featureKeys||KEYS).slice();
    check(keys.length>0&&new Set(keys).size===keys.length,'模型特征为空或重复');
    var selected=selectCalibration(train,options),samples=[],labels=[],positions=[];
    selected.forEach(function(w){var x=rows(w.dataset,keys);w.calibration.forEach(function(c){
      check(Number.isInteger(c.sampleIndex)&&c.sampleIndex>=0&&c.sampleIndex<x.length,'标定索引无效');
      if(x[c.sampleIndex]&&Number.isFinite(c.porosity_vv)){samples.push(x[c.sampleIndex]);labels.push(c.porosity_vv);positions.push({wellId:w.dataset.wellId,sampleIndex:c.sampleIndex});}
    });});
    check(samples.length>=2,'至少需要两个完整模拟标定样本');
    var transforms=keys.map(function(k,j){var vals=samples.map(function(r){return r[j];}),mean=vals.reduce(function(s,v){return s+v;},0)/vals.length;
      return {key:k,mean:mean,std:Math.sqrt(vals.reduce(function(s,v){return s+(v-mean)*(v-mean);},0)/vals.length)||1,min:Math.min.apply(null,vals),max:Math.max.apply(null,vals),log10:k==='rdep_ohm_m'};});
    return {version:'1.0.0',featureKeys:keys,transforms:transforms,labels:labels,positions:positions,
      samples:samples.map(function(r){return r.map(function(v,j){return(v-transforms[j].mean)/transforms[j].std;});}),
      trainingWellIds:train.map(function(w){return w.dataset.wellId;}),trainingSamples:labels.length};
  }
  function predictPorosity(dataset,model,options){
    options=options||{};var k=options.k===undefined?9:options.k;
    check(Number.isInteger(k)&&k>0,'k 必须为正整数');k=Math.min(k,model.samples.length);
    var spread=[],outside=[],predicted=rows(dataset,model.featureKeys).map(function(row){
      if(!row){spread.push(null);outside.push(null);return null;}
      outside.push(row.some(function(v,j){return v<model.transforms[j].min||v>model.transforms[j].max;}));
      var z=row.map(function(v,j){return(v-model.transforms[j].mean)/model.transforms[j].std;});
      var near=model.samples.map(function(r,i){return {i:i,d:r.reduce(function(s,v,j){return s+(v-z[j])*(v-z[j]);},0)};}).sort(function(a,b){return a.d-b.d||a.i-b.i;}).slice(0,k);
      var mean=near.reduce(function(s,a){return s+model.labels[a.i];},0)/k;
      spread.push(Math.sqrt(near.reduce(function(s,a){return s+Math.pow(model.labels[a.i]-mean,2);},0)/k));return mean;
    });
    return {predicted_vv:predicted,localSpread_vv:spread,outsideTrainingRange:outside,k:k};
  }
  function densityBaseline(dataset,options){
    options=options||{};var ma=options.matrixDensity===undefined?2.65:options.matrixDensity,fl=options.fluidDensity===undefined?1:options.fluidDensity;
    check(Number.isFinite(ma)&&Number.isFinite(fl)&&ma>fl,'骨架密度必须大于流体密度');
    check(dataset.curves.rhob_g_cm3&&dataset.curves.rhob_g_cm3.length===dataset.depth_m.length,'密度曲线缺失或错位');
    return {predicted_vv:dataset.curves.rhob_g_cm3.map(function(v){return Number.isFinite(v)?(ma-v)/(ma-fl):null;}),matrixDensity:ma,fluidDensity:fl};
  }
  function evaluateRegression(reference,predicted){
    check(reference.length===predicted.length,'评价数组长度不同');var ids=[],total=0;
    reference.forEach(function(v,i){if(Number.isFinite(v)){total++;if(Number.isFinite(predicted[i]))ids.push(i);}});
    if(!ids.length)return {mae_pp:null,rmse_pp:null,bias_pp:null,r2:null,n:0,total:total,coverage:total?0:null};
    var mean=ids.reduce(function(s,i){return s+reference[i];},0)/ids.length,sae=0,sse=0,bias=0,sst=0;
    ids.forEach(function(i){var e=predicted[i]-reference[i];sae+=Math.abs(e);sse+=e*e;bias+=e;sst+=Math.pow(reference[i]-mean,2);});
    return {mae_pp:100*sae/ids.length,rmse_pp:100*Math.sqrt(sse/ids.length),bias_pp:100*bias/ids.length,r2:sst>1e-12?1-sse/sst:null,n:ids.length,total:total,coverage:ids.length/total};
  }
  return {version:'1.0.0',makeExperiment:makeExperiment,selectCalibration:selectCalibration,fitPorosity:fitPorosity,predictPorosity:predictPorosity,densityBaseline:densityBaseline,evaluateRegression:evaluateRegression};
});
