/* Pixel-driven sinusoidal geometry detector. No reference arguments in search. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WelllogFractureCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function check(ok,s){if(!ok)throw new Error(s);}
  function rng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function rowAt(c,x,width){return c.centerRow+c.amplitude_px*Math.sin(2*Math.PI*x/width+c.phase_deg*Math.PI/180);}
  function trajectory(c,width){return Array.from({length:width},function(_,x){return rowAt(c,x,width);});}
  function makeImage(options){
    options=options||{};var seed=options.seed===undefined?1803:options.seed,noise=options.noise===undefined?.06:options.noise,visibility=options.visibility===undefined?.8:options.visibility,preset=options.preset||'standard';
    check(Number.isInteger(seed),'seed 必须为整数');check(Number.isFinite(noise)&&noise>=0&&noise<=.3,'noise 必须在0—0.3');
    check(Number.isFinite(visibility)&&visibility>=0&&visibility<=1,'可见度必须在0—1');check(['standard','occluded','bedding'].indexOf(preset)>=0,'未知图像情境');
    var width=128,height=256,r=rng(seed),pixels=[],offset=(seed%5)*2;
    var fractures=[{id:'f1',centerRow:55+offset,amplitude_px:16,phase_deg:25},{id:'f2',centerRow:125+offset,amplitude_px:24,phase_deg:145},{id:'f3',centerRow:205-offset,amplitude_px:12,phase_deg:265}];
    var distractors=preset==='bedding'?[{id:'bedding',centerRow:169,amplitude_px:16,phase_deg:70}]:[];
    for(var y=0;y<height;y++)for(var x=0;x<width;x++){
      if(preset==='occluded'&&x>=24&&x<55){pixels.push(null);continue;}
      var v=.76+.035*Math.sin(y*.17)+.025*Math.cos(x*.1)+noise*(r()+r()+r()-1.5);
      fractures.forEach(function(c,i){var d=y-rowAt(c,x,width);v-=(i===2?.28:.55)*visibility*Math.exp(-d*d/(2*1.1*1.1));});
      distractors.forEach(function(c){var d=y-rowAt(c,x,width);v-=.34*Math.exp(-d*d/(2*1.2*1.2));});
      if(x>=91&&x<=94)v-=.24; // Vertical acquisition artefact, not a fracture answer.
      pixels.push(Math.max(0,Math.min(1,v)));
    }
    return {image:{width:width,height:height,pixels:pixels,depthTop_m:2500,depthStep_m:.02,azimuthOrigin_deg:0,
      source:{kind:'synthetic',seed:seed,label:'合成井壁展开灰度图，非实测电成像'}},
      reference:{kind:'synthetic',fractures:fractures,distractors:distractors}};
  }
  function prepareImage(image){
    check(Number.isInteger(image.width)&&Number.isInteger(image.height)&&image.width>0&&image.height>0&&image.pixels.length===image.width*image.height,'图像尺寸与像素不符');
    var w=image.width,h=image.height,strength=Array(w*h).fill(null),valid=0;
    for(var x=0;x<w;x++)for(var y=0;y<h;y++){
      var v=image.pixels[y*w+x];if(!Number.isFinite(v))continue;
      var sum=0,n=0;
      for(var dy=-6;dy<=6;dy++){var yy=y+dy;if(yy<0||yy>=h)continue;var p=image.pixels[yy*w+x];if(Number.isFinite(p)){sum+=p;n++;}}
      strength[y*w+x]=Math.max(0,Math.min(1,(sum/n-v)/.35));valid++;
    }
    return {width:w,height:h,strength:strength,validPixels:valid,totalPixels:w*h};
  }
  function score(prepared,c){
    var w=prepared.width,h=prepared.height,sum=0,n=0,support=0;
    for(var x=0;x<w;x++){
      var row=Math.round(rowAt(c,x,w));if(row<1||row>=h-1)continue;
      var best=null;
      for(var dy=-1;dy<=1;dy++){var v=prepared.strength[(row+dy)*w+x];if(Number.isFinite(v)&&(best===null||v>best))best=v;}
      if(best!==null){sum+=best;n++;if(best>=.2)support++;}
    }
    return {score:n?sum/n:0,support:n?support/n:0,validColumns:n};
  }
  function trajectoryDistance(a,b){
    var p=a.phase_deg*Math.PI/180,q=b.phase_deg*Math.PI/180;
    return Math.sqrt(Math.pow(a.centerRow-b.centerRow,2)+.5*(Math.pow(a.amplitude_px*Math.cos(p)-b.amplitude_px*Math.cos(q),2)+Math.pow(a.amplitude_px*Math.sin(p)-b.amplitude_px*Math.sin(q),2)));
  }
  function searchSinusoids(prepared){
    check(prepared.width>0&&prepared.height>0&&prepared.strength.length===prepared.width*prepared.height,'候选图像无效');
    var coarse=[];
    for(var amp=0;amp<=32;amp+=4)for(var phase=0;phase<(amp?360:1);phase+=15)for(var center=amp+3;center<prepared.height-amp-3;center+=2){
      var c={centerRow:center,amplitude_px:amp,phase_deg:phase},s=score(prepared,c);
      if(s.score>=.14&&s.support>=.25&&s.validColumns>=prepared.width*.5)coarse.push(Object.assign(c,s));
    }
    coarse.sort(function(a,b){return b.score-a.score||a.centerRow-b.centerRow||a.amplitude_px-b.amplitude_px||a.phase_deg-b.phase_deg;});
    var seeds=[];
    coarse.forEach(function(c){if(seeds.length<40&&!seeds.some(function(p){return trajectoryDistance(p,c)<6;}))seeds.push(c);});
    var refined=seeds.map(function(c){
      var best=c;
      for(var dc=-1;dc<=1;dc++)for(var da=-2;da<=2;da++)for(var dp=-7.5;dp<=7.5;dp+=2.5){
        if(c.amplitude_px+da<0)continue;
        var trial={centerRow:c.centerRow+dc,amplitude_px:c.amplitude_px+da,phase_deg:(c.phase_deg+dp+360)%360},s=score(prepared,trial);
        if(s.score>best.score)best=Object.assign(trial,s);
      }return best;
    }).sort(function(a,b){return b.score-a.score||a.centerRow-b.centerRow;});
    var candidates=[];
    refined.forEach(function(c){if(!candidates.some(function(p){return trajectoryDistance(p,c)<5;}))candidates.push(c);});
    candidates.forEach(function(c,i){c.id='candidate-'+i;});
    return {candidates:candidates,coarseCount:coarse.length,grid:{centerStep_px:2,amplitudeStep_px:4,phaseStep_deg:15},nmsDistance_px:5};
  }
  function selectCandidates(search,options){
    options=options||{};var threshold=options.threshold===undefined?.45:options.threshold,max=options.maxCandidates===undefined?12:options.maxCandidates;
    check(Number.isFinite(threshold)&&threshold>=0&&threshold<=1,'阈值必须在0—1');check(Number.isInteger(max)&&max>0,'候选数上限必须为正整数');
    return search.candidates.filter(function(c){return c.score>=threshold;}).slice(0,max);
  }
  function evaluateDetections(predicted,reference,options){
    options=options||{};var ct=options.centerTolerance_px===undefined?5:options.centerTolerance_px,tt=options.trajectoryTolerance_px===undefined?4:options.trajectoryTolerance_px;
    check(ct>=0&&tt>=0&&Number.isFinite(ct)&&Number.isFinite(tt),'匹配容差无效');check(reference.length<=12,'教学匹配最多支持12个参考对象');
    var memo={};
    function visit(i,mask){
      if(i===predicted.length)return {count:0,cost:0,matches:[]};
      var key=i+'|'+mask;if(memo[key])return memo[key];
      var best=visit(i+1,mask);
      reference.forEach(function(r,j){if(mask&(1<<j))return;var d=trajectoryDistance(predicted[i],r),ce=Math.abs(predicted[i].centerRow-r.centerRow);
        if(ce>ct||d>tt)return;var next=visit(i+1,mask|(1<<j)),option={count:next.count+1,cost:next.cost+d,matches:[{predictedIndex:i,referenceIndex:j,distance_px:d,centerError_px:ce}].concat(next.matches)};
        if(option.count>best.count||(option.count===best.count&&option.cost<best.cost))best=option;
      });return memo[key]=best;
    }
    var best=visit(0,0),tp=best.count,fp=predicted.length-tp,fn=reference.length-tp;
    return {tp:tp,fp:fp,fn:fn,precision:predicted.length?tp/predicted.length:(reference.length?0:null),recall:reference.length?tp/reference.length:null,
      f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null,meanDistance_px:tp?best.cost/tp:null,matches:best.matches,
      falsePositiveIndices:predicted.map(function(_,i){return i;}).filter(function(i){return !best.matches.some(function(m){return m.predictedIndex===i;});}),
      falseNegativeIndices:reference.map(function(_,i){return i;}).filter(function(i){return !best.matches.some(function(m){return m.referenceIndex===i;});}),centerTolerance_px:ct,trajectoryTolerance_px:tt};
  }
  return {version:'1.0.0',makeImage:makeImage,prepareImage:prepareImage,searchSinusoids:searchSinusoids,selectCandidates:selectCandidates,trajectory:trajectory,trajectoryDistance:trajectoryDistance,evaluateDetections:evaluateDetections};
});
