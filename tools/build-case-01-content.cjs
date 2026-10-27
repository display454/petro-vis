/* Authoring helper for w1. Build reads the resulting case.json as its source. */
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../cases/welllog-multicurve-segmentation/demo/core.js');
const root = path.resolve(__dirname, '..');
const {dataset, reference} = Core.makeSyntheticWell({seed:1801,noise:.35,preset:'thin'});
const prepared = Core.prepareFeatures(dataset,['gr_api','rhob_g_cm3','rdep_ohm_m']);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ink='#263a35', muted='#59675f', jade='#256754', clay='#a45d36', line='#d9dcd1';
const txt=(x,y,s,size=13,color=ink,anchor='start')=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" font-size="'+Math.max(14,size)+'" text-anchor="'+anchor+'">'+esc(s)+'</text>';
const ln=(x,y,a,b,color=line,dash='')=>'<line x1="'+x+'" y1="'+y+'" x2="'+a+'" y2="'+b+'" stroke="'+color+'" '+(dash?'stroke-dasharray="'+dash+'"':'')+'/>';
const rect=(x,y,w,h,fill,stroke='none')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'" stroke="'+stroke+'"/>';
function figure(body,w,h,no,caption,label) {
  return '<figure style="margin:20px 0"><div style="overflow-x:auto;border:1px solid var(--line,#d9dcd1);background:var(--card,#fffefa)">'+
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+
    '" style="display:block;max-width:none;font-family:Microsoft YaHei,Segoe UI,sans-serif" role="img" aria-label="'+esc(label||caption)+'">'+
    '<title>'+esc(label||caption)+'</title>'+body+'</svg></div><figcaption style="font-size:14px;color:var(--ink-2,#59675f);padding-top:9px">图 '+no+' · '+caption+'（小屏可横向查看）</figcaption></figure>';
}
function model(penalty,minSamples=6,keys=['gr_api','rhob_g_cm3','rdep_ohm_m']) {
  const p=Core.prepareFeatures(dataset,keys);
  const result=Core.segment(p.values,{penalty,minSamples});
  return {p,result,metrics:Core.evaluate(Core.boundaryDepths(dataset,result.boundaryIndices),reference.boundaryDepths_m,.5)};
}
function curve(xs,x0,y0,w,h) {
  const min=Math.min(...xs),max=Math.max(...xs),span=max-min||1;
  return '<path d="'+xs.map((v,i)=>(i?'L':'M')+(x0+(v-min)/span*w).toFixed(1)+','+(y0+i/(xs.length-1)*h).toFixed(1)).join('')+
    '" fill="none" stroke="'+jade+'" stroke-width="1.1"/>';
}
function overview() {
  const y=d=>60+(d-1550)/60*280, colors={'砂岩':'#f2e7ce','泥岩':'#e3e7df','薄泥岩层':'#cbd9ca','致密碳酸盐岩':'#e3e8eb'};
  let s=txt(16,24,'同一深度，岩层与多条观测曲线对照',17)+txt(16,44,'地层颜色是合成情景说明；算法只看右侧观测，不读取左侧答案。',12,muted);
  s+=txt(75,58,'深度 / m',12,muted)+txt(145,58,'情景岩性',12,muted);
  for(let d=1550;d<=1600;d+=10) s+=txt(72,y(d)+5,d,12,muted,'end')+ln(83,y(d),844,y(d));
  reference.intervals.forEach(r=>{
    const ya=y(dataset.depth_m[r.start]-.0625),yb=y(dataset.depth_m[r.end-1]+.0625);
    s+=rect(88,ya,106,yb-ya,colors[r.label]);
    if(yb-ya>20)s+=txt(141,(ya+yb)/2+4,r.label,12,muted,'middle');
  });
  ['gr_api','rhob_g_cm3','rdep_ohm_m'].forEach((key,i)=>{
    const x=235+i*205, xs=dataset.curves[key].map(v=>i===2?Math.log10(v):v);
    s+=txt(x+78,58,['GR / API','RHOB / g·cm⁻³','log10(RDEP / Ω·m)'][i],12,muted,'middle');
    s+=curve(xs,x,60,156,280);
  });
  reference.boundaryDepths_m.forEach(d=>s+=ln(88,y(d),836,y(d),'#7d8980','4 4'));
  s+=txt(16,367,'先辨认深度与单位，再把曲线变化视为需要复核的候选界面。',13,jade);
  return figure(s,880,390,1,'480 点教学井的岩性情景与三条测井曲线；虚线为合成参考界面。','地层与GR、密度、电阻率随深度变化的对照图');
}
function penaltyComparison() {
  let s=txt(20,28,'同一口井：惩罚改变，候选界面如何取舍？',17);
  [model(4),model(32)].forEach((r,i)=>{
    const x=30+i*440,Y=d=>78+(d-1550)/60*220;
    s+=txt(x,55,'惩罚 '+r.result.penalty+' · '+r.result.boundaryIndices.length+' 个候选 · F1 '+(100*r.metrics.f1).toFixed(1)+'%',14,i?clay:jade);
    s+=rect(x,78,370,220,'#f6f6f0');
    s+=curve(dataset.curves.gr_api,x+35,78,290,220);
    reference.boundaryDepths_m.forEach(d=>s+=ln(x,Y(d),x+370,Y(d),'#7d8980','4 4'));
    Core.boundaryDepths(dataset,r.result.boundaryIndices).forEach(d=>s+=ln(x,Y(d),x+370,Y(d),jade));
    r.metrics.falseNegatives_m.forEach(d=>s+='<circle cx="'+(x+360)+'" cy="'+Y(d)+'" r="5" fill="#fffefa" stroke="'+clay+'"/>');
    s+=txt(x,322,'命中 '+r.metrics.tp+' / 误检 '+r.metrics.fp+' / 漏检 '+r.metrics.fn,13,muted);
  });
  s+=txt(20,353,'观测曲线完全相同；高惩罚减少界面，但可能合并薄层。绿实线：预测；灰虚线：参考。',12,muted);
  return figure(s,900,378,2,'固定 seed=1801、noise=0.35、最小层厚=0.75 m，多曲线实际计算结果。');
}
function standardization() {
  let s=txt(18,27,'数值大小不同，不能直接相加',17);
  const rows=[
    ['GR','API',dataset.curves.gr_api[160].toFixed(1),prepared.values[160][0].toFixed(2)],
    ['RHOB','g/cm³',dataset.curves.rhob_g_cm3[160].toFixed(3),prepared.values[160][1].toFixed(2)],
    ['RDEP','Ω·m',dataset.curves.rdep_ohm_m[160].toFixed(2),prepared.values[160][2].toFixed(2)]
  ];
  s+=txt(20,55,'1570.00 m 的观测',12,muted)+txt(220,55,'变换',12,muted)+txt(385,55,'z 分数',12,muted);
  rows.forEach((r,i)=>{
    let y=88+i*57;s+=txt(20,y,r[0]+' = '+r[2]+' '+r[1],13)+txt(220,y,i===2?'log10 → 标准化':'标准化',13,muted)+txt(390,y,r[3],15,jade);
    s+=ln(20,y+20,450,y+20);
  });
  s+=txt(493,55,'变换后，按共同深度显示',12,muted);
  for(let i=0;i<3;i++){
    const xs=prepared.values.map(row=>row[i]),y0=80+i*58;
    s+=ln(525,y0+12,815,y0+12,'#cbd1c8','3 3');
    s+='<path d="'+xs.filter((_,j)=>j%3===0).map((v,j)=>(j?'L':'M')+(525+j/(160-1)*290).toFixed(1)+','+(y0+12-v*10).toFixed(1)).join('')+'" fill="none" stroke="'+[jade,clay,'#766182'][i]+'" stroke-width="1"/>';
    s+=txt(475,y0+15,rows[i][0],12,muted);
  }
  s+=txt(490,276,'右图横向为同一深度序列；纵向为各曲线 z 分数。',12,muted);
  s+=txt(20,309,'z = (变换后的观测 − 当前井均值) / 当前井标准差；没有使用参考界面。',13,jade);
  return figure(s,900,332,3,'左侧为实际深度点的变换读数，右侧为同一教学井的标准化响应。');
}
function flow() {
  const names=['观测曲线','质控与对齐','log10 + z','最优分段','界面匹配','人工复核'];
  let s=txt(18,26,'输入、预测与评价参考分开流动',17);
  names.forEach((name,i)=>{
    let x=15+i*146;s+=rect(x,57,126,56,i===4?'#f5e8db':'#e2eee6')+txt(x+63,79,String(i+1).padStart(2,'0'),12,muted,'middle')+txt(x+63,100,name,13,ink,'middle');
    if(i<5)s+=ln(x+127,85,x+144,85,jade)+txt(x+137,89,'›',15,jade,'middle');
  });
  s+=rect(19,150,180,45,'#f5e8db')+txt(109,178,'合成参考：仅供评价',13,clay,'middle');
  s+='<path d="M199 172H662V114" fill="none" stroke="'+clay+'" stroke-dasharray="5 4"/>'+txt(370,164,'不进入标准化或分段',12,clay);
  s+=txt(18,225,'480 × 3 观测 → 候选界面 → 与独立参考匹配；人仍要判断其地质意义。',12,muted);
  return figure(s,900,248,4,'虚线支路只抵达评价节点，避免把答案当成输入。');
}
function matching() {
  const refs=[1000,1010,1020],preds=[1000.25,1019.75,1025],m=Core.evaluate(preds,refs,.5),X=d=>75+(d-999)/27*740;
  let s=txt(18,27,'怎么算命中？容差 ±0.5 m，且只能一对一',17);
  s+=txt(14,89,'参考',12,muted)+txt(14,165,'预测',12,muted)+ln(70,85,830,85)+ln(70,160,830,160);
  refs.forEach(d=>{s+=rect(X(d-.5),68,X(d+.5)-X(d-.5),110,'#e2eee6')+'<circle cx="'+X(d)+'" cy="85" r="4" fill="'+ink+'"/>'+txt(X(d),56,d+' m',12,muted,'middle');});
  m.matches.forEach(r=>s+=ln(X(r.reference_m),90,X(r.predicted_m),155,jade));
  preds.forEach(d=>{const hit=m.matches.some(r=>r.predicted_m===d);s+='<circle cx="'+X(d)+'" cy="160" r="5" fill="'+(hit?jade:clay)+'"/>'+txt(X(d),195,d+' m',12,muted,'middle');});
  s+=txt(X(1010),215,'漏检：无预测',12,clay,'middle')+txt(X(1025),215,'误检：无参考',12,clay,'middle');
  s+=txt(18,257,'此示意：TP='+m.tp+'，FP='+m.fp+'，FN='+m.fn+'；P=R=F1='+Math.round(m.f1*1000)/10+'%；匹配 MAE='+m.mae_m.toFixed(2)+' m。',13,jade);
  return figure(s,900,282,5,'这是指标定义示意，并非教学井的默认结果。空预测和空参考另按“不适用”规则呈现。');
}
function experimentTable() {
  const conditions=[['默认：惩罚 4 / 层厚 0.75 m',model(4)],['惩罚 32 / 层厚 0.75 m',model(32)],['惩罚 4 / 层厚 3 m',model(4,24)],['仅 GR / 惩罚 4 / 层厚 0.75 m',model(4,6,['gr_api'])]];
  return '<table class="dtable"><thead><tr><th>同一教学井的设置</th><th>预测</th><th>误检 / 漏检</th><th>F1</th></tr></thead><tbody>'+
    conditions.map(([name,r])=>'<tr><td>'+name+'</td><td>'+r.result.boundaryIndices.length+'</td><td>'+r.metrics.fp+' / '+r.metrics.fn+'</td><td>'+(r.metrics.f1*100).toFixed(1)+'%</td></tr>').join('')+'</tbody></table>'+
    '<p>以上数值由构建时的实际内核计算，固定 seed=1801、噪声=0.35。演示页改变输入后将现场重算；本表不代表真实井的精度。</p>';
}
const refs='<p>专业入门参考：<a href="https://www.epa.gov/environmental-geophysics/borehole-geophysical-methods" target="_blank" rel="noopener">EPA · 井中地球物理方法</a>；<a href="https://www.epa.gov/environmental-geophysics/natural-gamma-and-spectral-gamma-borehole-logging" target="_blank" rel="noopener">自然伽马</a>；<a href="https://www.epa.gov/environmental-geophysics/gamma-gamma-density-logging" target="_blank" rel="noopener">密度测井</a>。图形与数据由本项目独立生成。</p>';
const manifest={
  id:'welllog-multicurve-segmentation',sceneId:'w1',title:'多曲线测井分层：从连续响应到候选界面',
  version:'1.0.0',updated:'2026-10-25',methods:['ts'],status:'ready',
  tabs:{
    background:{
      label:'专业背景',
      lede:'测井工具沿井深记录岩石与流体的物理响应。分层要从这些连续、带噪的曲线中找出有解释价值的候选界面，再结合地质资料复核。本案例用一口可复现的合成井，让读者观察多曲线证据、薄层和算法参数之间的取舍。',
      judge:[
        {label:'任务',value:'序列分割',desc:'找变化位置，不是逐点判岩性'},
        {label:'教学输入',value:'480 点 × 3 曲线',desc:'0.125 m / 点，固定种子合成'},
        {label:'产出',value:'候选界面＋误差',desc:'保留人工复核，不编造工时收益'},
        {label:'难点',value:'薄层与多解性',desc:'多曲线也可能共同受井况干扰'}
      ],
      sections:[
        {no:1,en:'PROBLEM',title:'先看懂曲线：变化来自哪里？',html:
          '<p>GR 记录自然伽马响应，RHOB 表示体积密度，RDEP 描述较深探测尺度的电阻率响应。它们受岩石、孔隙流体和井况共同影响，单位与数量级不同。高 GR 不总等于泥岩，高电阻率也不能单独证明含油。</p>'+
          '<p>解释者综合多条曲线卡出候选界面，再与岩心、邻井和地质分层方案对照。噪声尖峰可能像层界，薄互层也可能被埋在连续响应中。</p>'+overview()},
        {no:2,en:'INTERVENTION',title:'把“划几条线”变成可比较的取舍',html:
          '<p>本例采用无监督的<strong>惩罚最优分段</strong>：让每段内标准化响应尽量一致，同时对增加的界面施加惩罚，并限制最小段长。算法提出候选，人判断其地质意义；它不是训练好的神经网络。</p>'+
          '<p>惩罚低时更容易把噪声分成短层，惩罚高时又可能合并薄层。旁边的邻窗均值差基线独立计算，使用相同输入和指标。</p>'+penaltyComparison()},
        {no:3,en:'DATA',title:'数据对齐、量纲与真值身份先说清楚',html:
          '<table class="dtable"><thead><tr><th>数据</th><th>本例</th><th>真实应用需补充</th></tr></thead><tbody>'+
          '<tr><td>深度与曲线</td><td>1550—1609.875 m；GR / RHOB / RDEP</td><td>深度配准、单位核对、坏井段和缺测处理</td></tr>'+
          '<tr><td>参考界面</td><td>生成器单独保存的合成界面，只用于评价</td><td>专家定义的分层尺度、参考层位及解释不确定性</td></tr>'+
          '<tr><td>采样与厚度</td><td>0.125 m / 点；默认最小层厚 0.75 m = 6 点</td><td>核查真实采样与仪器纵向分辨率，二者不等同</td></tr></tbody></table>'+
          '<p>RDEP 先取 log10，再分别按当前井的观测均值和标准差转为 z 分数。该预处理不使用参考界面；未来真实井缺失处理需另行验证。公开岩性标签变化不能直接当作本任务的地层界面真值。</p>'+standardization()},
        {no:4,en:'DIFFICULTY',title:'最容易漏掉的是短层，最需要检查的是失败条件',html:
          '<p>当前合成情景可以隔离惩罚、最小层厚、噪声和曲线组合的影响。正式解释仍受井径变化、垂向分辨率、多解性和跨井差异限制。变点不等于正式层位，且模拟段长也不等于仪器可分辨的最薄地层。</p>'+experimentTable()+
          '<p>可借鉴方向：多变量变点检测、地质约束、序列分割、跨井对比。本例已实现前两类中的简化段长约束，不宣称完成深度学习或真实油田验证。</p>'+refs}
      ]
    },
    workflow:{
      label:'案例流程',title:'从观测曲线到可复核候选界面的六步流程',
      lead:['先确保输入与参考分开，再让每一个处理步骤都能说清用途。当前实验是可控的合成教学井，不使用 FORCE 岩性标签作为层界答案。'],
      stats:[['观测点','480'],['曲线','3'],['采样','0.125 m'],['匹配容差','±0.5 m']],
      steps:[
        {name:'选择教学井与情境',role:'数据',do:'固定 seed=1801 选择薄互层；同时保存观测 dataset 与独立 reference。',effect:'同一输入可公平比较参数。',trap:'调模型参数时不能顺便换噪声或界面。'},
        {name:'检查深度与可用曲线',role:'质控',do:'确认深度严格递增、曲线等长且所选通道为有限数；当前合成情景无缺测。',effect:'避免把错位或缺测误当成层界。',trap:'0 不是缺测标记，采样间隔不是仪器分辨率。'},
        {name:'变换与标准化',role:'预处理',do:'RDEP 取 log10；各通道分别做当前井的 z 分数标准化。',effect:'让不同单位的响应共同参与拟合。',trap:'不使用参考界面，不把原始不同量纲直接求和。'},
        {name:'求解分段并计算基线',role:'算法',do:'动态规划最小化平均通道 SSE＋惩罚×边界数，每段不少于最小样本数；邻窗均值差独立提边界。',effect:'获得两套可对比的候选与分段拟合。',trap:'主模型不保证优于基线；同分方案优先较少分段。'},
        {name:'一对一匹配与局部复核',role:'评价',do:'将预测界面转换到相邻采样点的中点深度；在 ±0.5 m 内最大化匹配数，再最小化匹配距离。',effect:'可定位 TP、FP、FN，计算 P / R / F1 和匹配 MAE。',trap:'逐点准确率不能替代边界评价，未匹配点不能塞进 MAE。'},
        {name:'比较失败条件并解释',role:'人工',do:'固定井，依次增大惩罚和最小层厚；查看薄层漏检，再切换噪声、尖峰和曲线组合。',effect:'形成方法适用条件与需复核位置的解释。',trap:'不把合成样例的满分当作真实井泛化精度。'}
      ],
      metrics:{title:'数据如何流动，以及怎么算“做对了”',html:
        flow()+standardization()+matching()+
        '<p><strong>P=TP/(TP+FP)，R=TP/(TP+FN)，F1=2TP/(2TP+FP+FN)。</strong>匹配 MAE 只对成功配对界面计算绝对深度偏差。有参考但无预测时 P/R/F1 记为 0，MAE 不适用；参考和预测均为空时各项不适用。</p>'+
        '<p>演示步骤：① 固定默认井记录结果；② 将惩罚从 4 调至 32；③ 复位后把最小层厚从 0.75 m 调至 3 m；④ 查看漏检及基线变化。下面是同一内核的固定配置快照。</p>'+experimentTable()},
      fails:[
        {name:'短层被合并',why:'惩罚或最小段长过大，较短的真实变化没有留下独立分段。'},
        {name:'噪声被切成层',why:'惩罚过低或邻窗阈值过低，局部扰动产生额外候选。'},
        {name:'多曲线也有歧义',why:'观测受井况和岩石物理多解性影响，融合不能代替地质复核。'},
        {name:'评价看到了答案',why:'若把参考标签用于选参数、筛测试样本或生成预测，显示的性能就失去意义。'}
      ]
    },
    demo:{mode:'auto',html:'demo/index.html',label:'可运行示范',height:900,
      intro:'固定一口教学井，改变分段惩罚、最小层厚、观测组合和噪声，观察候选、独立基线、漏检和误检如何变化。'}
  }
};
const target=path.join(root,'cases',manifest.id,'case.json');
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('Authored '+path.relative(root,target)+' ('+fs.statSync(target).size+' bytes)');
