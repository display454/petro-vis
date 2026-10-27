/* A-owned content. R03 UI reviewed; packaging/host acceptance recorded separately. */
const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const D=require('../cases/welllog-lithology-classification/demo/data.js');
const L=require('../cases/welllog-lithology-classification/demo/core.js');
const R=require('../cases/welllog-curve-reconstruction/demo/core.js');
const E=require('../docs/experiments/R03-core-results.json');
const train=D.batch.wells.filter(w=>D.batch.split.train.includes(w.wellId));
const well=D.batch.wells.find(w=>D.batch.split.test.includes(w.wellId));
const lm=L.fitLithology(train), pred=L.predictLithology(well,lm,D.defaults.lithology);
const mask=R.makeMask(well,D.defaults.repair), rm=R.fitRepair(train,D.defaults.repair);
const linear=R.repairCurve(mask.visible,mask,{method:'linear'}).filled;
const ridge=R.repairCurve(mask.visible,mask,{method:'ridge',model:rm}).filled;
const testResult=E.reports.find(r=>r.split==='test');
const colors=['#ae7748','#5b7162','#7e829c','#b4a45c'], ink='#263a35', muted='#59675f';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const text=(x,y,s,size=13,color=ink)=>`<text x="${x}" y="${y}" font-size="${Math.max(14,size)}" fill="${color}">${esc(s)}</text>`;
const rect=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const line=(x,y,xx,yy,stroke='#c8cec4',dash='')=>`<line x1="${x}" y1="${y}" x2="${xx}" y2="${yy}" stroke="${stroke}" stroke-dasharray="${dash}"/>`;
function fig(no,caption,body,h=320) {
  return `<figure style="margin:20px 0"><div style="overflow-x:auto;border:1px solid var(--line,#d9dcd1)"><svg xmlns="http://www.w3.org/2000/svg" width="900" height="${h}" viewBox="0 0 900 ${h}" role="img" aria-label="${esc(caption)}" style="display:block;max-width:none;background:#fffefa;font-family:Microsoft YaHei,Segoe UI,sans-serif"><title>${esc(caption)}</title>${body}</svg></div><figcaption style="font-size:14px;color:var(--ink-2,#59675f);padding-top:8px">图 ${no} · ${caption}（固定配置实际计算，小屏可横向查看）</figcaption></figure>`;
}
function curve(values,x,y,w,h,color,dash='',domain=values) {
  const finite=domain.filter(Number.isFinite), min=Math.min(...finite), max=Math.max(...finite);
  let d='',pen=false;
  values.forEach((v,i)=>{if(!Number.isFinite(v)){pen=false;return;}d+=(pen?'L':'M')+(x+(v-min)/(max-min||1)*w).toFixed(1)+','+(y+i/(values.length-1)*h).toFixed(1);pen=true;});
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="${dash}"/>`;
}
function classBars() {
  let s=text(28,30,'训练井决定类别：共 2000 点，1973 点映射到四类');
  D.classes.forEach((c,i)=>{s+=text(28,77+i*48,c.name)+rect(140,57+i*48,lm.classCounts[i]/2000*610,26,colors[i])+text(770,77+i*48,lm.classCounts[i]+' 点');});
  return s+text(28,285,'其余 27 点保留原始编码，映射为空；不因验证/测试标签更改类别。',13,muted);
}
function lithTracks() {
  let s=text(25,26,'测试井 15/9-15 · 500 点 · 0.152 m / 点');
  s+=text(35,58,'GR / API')+curve(well.curves.gr_api,35,75,210,200,'#256754');
  [well.mappedLithologyCode,pred.predictedCode].forEach((values,j)=>{
    s+=text(300+j*170,58,j?'kNN 预测':'解释参考');
    values.forEach((c,i)=>s+=rect(300+j*170,75+i*.4,100,.55,colors[lm.classCodes.indexOf(c)]||'#c5c9c1'));
  });
  s+=text(625,100,'已知参考 465 / 500')+text(625,132,'未映射参考 35 / 500')+
    text(625,164,'准确率 79.1%')+text(625,196,'四类宏 F1 22.4%')+
    text(625,237,'高准确率掩盖小类失败',13,'#a45d36');
  return s+text(35,302,'深度自上而下：2738.352—2814.200 m；灰色为未映射参考，不能宣称已识别。',13,muted);
}
function confusion() {
  const m=testResult.lithology.knn.matrix, names=D.classes.map(c=>c.name).concat('未映射/拒判');
  let s=text(28,27,'测试井混淆矩阵：行=参考，列=预测；最后一行不进入分类分数');
  names.forEach((name,i)=>{s+=text(205+i*122,58,name,12)+text(28,94+i*41,name,12);});
  m.forEach((row,i)=>row.forEach((v,j)=>{s+=rect(190+j*122,73+i*41,116,35,v?'#e3e9df':'#f4f4ed')+text(236+j*122,96+i*41,v);}));
  return s+text(28,307,'宏 F1 固定平均四类；无支持类记 0。拒判属于已知参考类的漏判，不从分母移除。',12,muted);
}
function flow(labels,foot) {
  let s=''; labels.forEach((label,i)=>{
    const x=25+i*146;s+=rect(x,68,132,70,'#e5ece2')+text(x+12,99,(i+1)+'. '+label,13);
    if(i<labels.length-1)s+=text(x+134,109,'→',16);
  });return s+text(28,35,'数据和答案分开保存，评价在预测之后执行',16)+text(28,191,foot,13,muted);
}
function scaling() {
  let s=text(25,30,'标准化参数仅拟合于 4 口训练井的 1973 个完整、有映射样本');
  s+=text(25,69,'曲线')+text(270,69,'训练均值')+text(480,69,'训练标准差')+text(670,69,'处理');
  lm.transforms.forEach((t,i)=>{const y=110+i*43;s+=text(25,y,t.key)+text(270,y,t.mean.toFixed(4))+text(480,y,t.std.toFixed(4))+text(670,y,t.log10?'先取 log10':'保持原量纲');});
  return s+text(25,299,'目标井直接套用参数；缺任一模型特征时拒判。投票占比不能解释为校准概率。',13,muted);
}
function candidateChart(kind) {
  const isL=kind==='lithology', rows=isL?E.selection.lithologyCandidates:E.selection.repairCandidates;
  let s=text(25,30,isL?'只用验证井选择 k；测试井不参与':'只用验证井 75 个遮挡点选择 λ；测试井不参与');
  rows.forEach((r,i)=>{
    const value=isL?r.metrics.macroF1:r.metrics.mae, y=66+i*39;
    s+=text(25,y+18,(isL?'k = ':'λ = ')+(isL?r.k:r.lambda))+rect(145,y,value*(isL?2400:16),24,'#63816b')+
      text(660,y+18,isL?(value*100).toFixed(2)+'% 宏 F1':value.toFixed(2)+' API MAE');
  });
  return s+text(25,303,isL?'冻结 k=15；验证多数类基线宏 F1 22.05%，高于 kNN 的 20.40%。':'冻结 λ=10；验证插值 MAE 10.55 API，低于岭回归的 22.81 API。',13,'#a45d36');
}
function gapChart() {
  let s=text(25,28,'测试井原始 GR 与可见输入：75 点被遮挡，原生 GR 缺失为 0');
  [well.curves.gr_api,mask.visible.curves.gr_api].forEach((v,i)=>{
    s+=text(45+i*390,58,i?'提供给修复函数的输入':'保存于评价端的原始观测');
    mask.gaps.forEach(g=>s+=rect(45+i*390,75+g.start*.4,300,(g.end-g.start)*.4,'#f1e6d3'));
    s+=curve(v,45+i*390,75,300,200,'#256754','',well.curves.gr_api);
  });
  return s+text(25,305,'浅色带为人工遮挡，具有评价真值；本批没有原生缺口，不能伪造为真实失测。',13,muted);
}
function repairMetrics() {
  let s=text(25,30,'同一批 75 个遮挡点；MAE / RMSE 单位均为 API');
  s+=text(25,73,'井 / 方法')+text(290,73,'MAE')+text(440,73,'RMSE')+text(590,73,'R²')+text(735,73,'可评估');
  E.reports.forEach((r,i)=>['linear','ridge'].forEach((method,j)=>{
    const m=r.repair[method],y=115+(i*2+j)*39;
    s+=text(25,y,(r.split==='test'?'测试':'验证')+' / '+(method==='linear'?'深度线性插值':'跨曲线岭回归'))+
      text(290,y,m.mae.toFixed(2))+text(440,y,m.rmse.toFixed(2))+text(590,y,m.r2.toFixed(3))+text(735,y,m.n+' / '+m.masked);
  }));return s+text(25,301,'负 R² 如实保留；分数只适用于固定井段与固定遮罩，不代表全油田修复能力。',13,muted);
}
function residuals() {
  let s=text(25,28,'测试遮挡点残差：预测 − 观测 / API（只绘制遮挡点）');
  const ids=mask.flags.flatMap((f,i)=>f?[i]:[]), maxResidual=Math.max(...ids.map(i=>Math.max(Math.abs(linear[i]-well.curves.gr_api[i]),Math.abs(ridge[i]-well.curves.gr_api[i])))), scale=100/maxResidual;
  s+=text(25,50,'纵向满量程 ±'+maxResidual.toFixed(1)+' API；横向按遮挡点深度递增排列',12,muted);
  s+=line(30,155,860,155);
  ids.forEach((idx,j)=>{
    const x=35+j*10.8, a=(linear[idx]-well.curves.gr_api[idx])*scale,b=(ridge[idx]-well.curves.gr_api[idx])*scale;
    s+=line(x,155,x,155-a,'#a45d36')+line(x+4,155,x+4,155-b,'#256754','2 2');
  });
  return s+text(25,282,'铜色实线=插值；绿色点线=岭回归。插值在 50 点更接近，岭回归在 25 点更接近。',13)+
    text(25,307,'少量大误差会改变 MAE/RMSE 的结论；逐点胜出次数不能替代总体误差。',13,muted);
}
function maskRules() {
  let s=text(25,30,'遮罩只看可用性、深度和固定哈希顺序，不看被遮住的值');
  for(let i=0;i<40;i++)s+=rect(27+i*21,80,18,38,i===0||i===16||i===32||i===39?'#758a78':'#eadbc2');
  s+=text(25,151,'保留段首段尾和块间锚点；每块最多 15 点，比例升高沿同一顺序增加点。')+
    text(25,192,'原始目标 → flags / gapKind → visible.gr_api[masked] = null → 两种方法分别修复')+
    text(25,234,'evaluateRepair 单独拿原始观测；repairCurve 收到未遮掉的真值会直接报错。')+
    text(25,284,'原生 null 不进入遮罩、不进指标；若方法无预测则 n_eval 下降，覆盖率必须同时展示。',13,muted);
  return s;
}
const refs='<p>数据：<a href="https://zenodo.org/records/4351156" target="_blank" rel="noopener">FORCE 2020 数据记录</a>；<a href="https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition" target="_blank" rel="noopener">原始数据仓库</a>。曲线 NLOD 2.0，解释标签 CC BY 4.0；来源与 SHA256 随包保存。6 井哈希拆分，观测选窗，曲线保留 4 位小数，未插补或重采样。</p>';
const section=(no,en,title,html)=>({no,en,title,html});
const step=(name,role,action,effect,trap)=>({name,role,do:action,effect,trap});
function manifest(id,sceneId,title,background,workflow,intro) {
  return {id,sceneId,title,version:'1.0.0',updated:'2026-10-26',methods:['ts'],status:'ready',
    tabs:{background,workflow,demo:{mode:'auto',html:'demo/index.html',label:'可运行示范',height:1000,intro}}};
}
const lith=manifest('welllog-lithology-classification','w4','岩性识别：看懂准确率背后的类别偏差',{
  label:'专业背景',lede:'把测井响应映射为岩性解释，关键是跨井检验、未知类和小类是否被识别。人工解释标签是本例参考，不等同于每点岩芯证据。',
  judge:[{label:'任务',value:'逐点分类',desc:'输出固定四类之一；缺特征拒判'},{label:'输入',value:'四条曲线',desc:'GR / RHOB / NPHI / log10 RDEP'},{label:'参考',value:'公开解释',desc:'保留原始码和映射码'},{label:'难度',value:'跨井变化',desc:'多数类与域偏移同时存在'}],
  sections:[section(1,'CONTEXT','同样的响应，不一定代表同样的岩性','<p>岩性解释为储层划分与后续参数解释提供背景。多条曲线联合响应有辨识价值，但井况、流体和成岩作用造成多解性，需要人工复核。本例不把输出类别直接转换成工程决策。</p>'+fig(1,'GR、解释参考与 kNN 预测对齐',lithTracks())),
    section(2,'METHOD','训练井的邻居投票：与多数类基线一起看','<p>对训练样本计算均值/标准差，RDEP 先取 log10。目标点找标准化空间中距离最近的 k 个训练样本，以多数投票定类，同票比较距离和。另设始终预测训练多数类的独立基线。投票占比只反映邻居一致度，不能称为概率。</p>'+fig(2,'类别失衡来自训练井，不修饰数据',classBars())),
    section(3,'DATA','固定井级拆分，让标签只承担各自的角色','<p>4 口训练井、1 口验证井、1 口测试井互斥。实际抽样先做全井观测可用性与选窗，再按固定哈希选 6 井拆分；所有 98 井均可用，选窗不读标签。只有训练标签决定映射类；验证选 k，测试用于冻结设置后的展示。</p>'+refs),
    section(4,'LIMITS','79% 准确率不能掩盖小类失败','<p>测试井已知参考 465/500，未知参考 35 点单列。固定四类宏 F1 仅 22.36%，其中砂泥互层与石灰岩的召回为 0。验证井上 kNN 宏 F1 20.40%，还低于多数类基线 22.05%。不能因为结果不好而换井或改测试标签。</p>'+fig(3,'矩阵保留未知行和拒判列',confusion()))]
},{label:'案例流程',title:'训练与评价分开的六步分类流程',lead:['交会图、岩性柱和矩阵共享同一组逐点结果；轴切换、筛选与选中均不重训。'],
  stats:[['井级拆分','4 / 1 / 1'],['训练已映射','1973 点'],['类别','4'],['默认 k','15']],
  steps:[step('冻结数据与拆分','数据','只读 v2，核对来源、井名、曲线与标签长度。','固定比较范围。','不把原数据 train.csv 中所有井当作本项目训练。'),step('拟合预处理与模型','训练','只传四口训练井；对完整且已映射的样本拟合标准化。','保存统计和邻居。','不能用目标井均值重标定。'),step('验证选 k','验证','固定候选 1/5/9/15，按验证固定四类宏 F1 取最大。','冻结 k=15。','不在测试井调 k 或特征。'),step('逐点预测与基线','预测','只输入曲线；参考标签留在评价端。','缺特征点拒判，多数类基线独立。','不把投票占比包装成概率。'),step('计算矩阵与覆盖','评价','固定四类加未知行/拒判列；已知参考分母含拒判。','看到错误、小类和未覆盖点。','不能仅展示总体准确率。'),step('联动复核与解释','人工','点散点、岩性柱或矩阵格查看同一批深度。','观察响应重叠与错判。','训练井成绩是回代，不是泛化。')],
  metrics:{title:'可复核的中间数据与选择依据',html:fig(4,'六步数据流',flow(['观测选窗','训练拟合','验证选 k','冻结测试','矩阵统计','人工复核'],'模型预测不读取 mappedLithologyCode；评价单独读取参考。'),220)+fig(5,'训练统计，目标井只能套用',scaling())+fig(6,'参数选择记录',candidateChart('lithology'))+'<p>accuracy = 正确已知参考 / 全部已知参考；未知参考只进矩阵末行。每类 F1 无支持或无预测时取 0，宏 F1 固定四类平均；整井无已知参考时指标不适用。预测拒判仍为对应已知类的漏判。</p>'},
  fails:[{name:'多数类掩盖问题',why:'高准确率可能同时伴随小类召回为 0。'},{name:'目标井出现未建模岩性',why:'未映射参考不参加已知类分数，需要明确覆盖率。'},{name:'缺曲线无法判别',why:'不偷偷用 0 补值，拒判单列。'},{name:'邻居一致但错误',why:'投票一致度没有校准，跨井响应偏移时也可能高票错判。'}]
},'默认验证井；测试井固定 k=15 与四曲线。散点、参考/预测柱、固定矩阵联动，多数类基线与覆盖率同屏。');
const repair=manifest('welllog-curve-reconstruction','w5','测井数据修复：先藏住观测，再比较补全',{
  label:'专业背景',lede:'修复缺失曲线需要区分有真值的遮挡实验和没有真值的原生缺口。本例以公开 GR 观测做可复核实验，避免用不可核验的曲线补全图冒充精度。',
  judge:[{label:'任务',value:'GR 重建',desc:'只修复目标曲线，不改其他通道'},{label:'对照',value:'两种独立方法',desc:'深度插值 / 跨曲线岭回归'},{label:'评价',value:'仅遮挡点',desc:'MAE / RMSE / R² 与覆盖率'},{label:'边界',value:'原生缺口无真值',desc:'预测可显示，误差不可计算'}],
  sections:[section(1,'CONTEXT','掉线、异常与缺失，需要不同的证据','<p>测井解释通常需要连续曲线，缺失会影响下游解释。真实缺口没有可直接比较的答案，本例从已有有效 GR 中人工遮挡连续小段，在同一遮罩上比较两种方法。</p>'+fig(1,'评价端与修复端看到的输入不同',gapChart())),
    section(2,'METHOD','邻深度信息和跨曲线信息，各有失效条件','<p>线性插值只用同井可见 GR 的左右端点，按实际深度插值，段首段尾不外推。岭回归使用训练井 RHOB、NPHI 和 log10 RDEP 预测 GR，目标均值作截距、标准化系数做 L2 惩罚。两法不共享预测结果；λ 仅用验证遮挡点选择。</p>'+fig(2,'同区残差揭示总体分数背后的差异',residuals())),
    section(3,'DATA','本批原生 GR 缺口为零，如实保留','<p>数据与 w4 同源、同井级拆分，但不使用任何岩性标签。500 点窗默认遮挡 75 点（15%），固定 seed=r03-w5-01、块长最多 15 点。源数据的 null 始终为原生缺口，不会被选作遮挡；本批 GR 全有效，原生缺口数量就是 0。</p>'+refs),
    section(4,'LIMITS','复杂方法在验证井不如插值','<p>验证 MAE：插值 10.55 API、岭回归 22.81 API；冻结后测试 MAE：42.42 与 36.41 API。两种方法排序随井段改变。测试岭回归在 25/75 点更接近真值，但整体误差较低，说明少量大残差有影响。负 R² 保留，不裁到 0。</p>'+fig(3,'验证与测试使用相同固定实验协议',repairMetrics()))]
},{label:'案例流程',title:'遮挡、预测、评价互相隔离的六步修复流程',lead:['修复函数只收到 visible 数据；原始 GR 保留在评价端，遮挡真值不能泄露到任一方法。'],
  stats:[['井级拆分','4 / 1 / 1'],['默认遮挡','75 / 500'],['块长上限','15 点'],['默认 λ','10']],
  steps:[step('固定观测数据','数据','只读 v2，确认目标 GR 与三条辅助曲线等长。','标签与修复无关。','不能把 NPHI 当作 GR 真值。'),step('训练跨曲线模型','训练','四井 2000 个完整样本，拟合训练统计及岭回归系数。','保存训练井和 λ。','测试井不参与拟合。'),step('生成遮罩与可见输入','遮挡','只对有效 GR 遮挡；保留锚点；同 seed 和比例可复现。','输出 flags、gapKind、visible。','未遮掉真值不能传给 repairCurve。'),step('同区独立重建','算法','插值只读 visible GR，岭回归只读三条辅助曲线。','各自返回 filled 与参数。','不能拿一种方法的结果做另一种方法输入。'),step('评价与共同点比较','评价','只计 flags=true 且有真值的点，另报预测覆盖率。','共同可预测点上的差异可公平比较。','未预测点不能假记 0 误差。'),step('查看残差与缺口','人工','定位曲线、缺口带和局部残差，切显示不重生成遮罩。','理解局部尖峰和跨井失配。','原生缺口不显示误差或“修复成功率”。')],
  metrics:{title:'从遮罩到评价的可复核约定',html:fig(4,'六步数据流',flow(['固定拆井','训练统计','生成遮罩','独立修复','仅遮挡评','人工复核'],'原始 GR 仅保存在评价端；visible.gr_api 的遮挡点必须为 null。'),220)+fig(5,'遮罩规则与输入隔离',maskRules())+fig(6,'验证参数选择',candidateChart('repair'))+'<p>MAE 与 RMSE 仅在成功预测的遮挡点计算，并报告 n_eval / n_masked。R²=1−SSE/SST，真值方差为零时不适用。两法比较用 compareRepairs 的共同点，不把不同覆盖范围的指标直接作差。</p>'},
  fails:[{name:'段首段尾没有插值锚点',why:'插值返回 null，不能无声外推。'},{name:'辅助曲线也缺失',why:'岭回归该点返回 null，覆盖率随之下降。'},{name:'跨井关系偏移',why:'固定训练模型可能不如局部插值。'},{name:'原生缺口没有答案',why:'可展示估计值，但不能计算误差或宣称准确。'}]
},'默认验证井，目标固定 GR。固定遮罩，两法独立重建；曲线、缺口与残差联动，测试模型 λ=10 冻结。');
for(const item of [lith,repair]) {
  const dir=path.join(root,'cases',item.id);
  fs.writeFileSync(path.join(dir,'case.json'),JSON.stringify(item,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'README.txt'),item.title+'\n版本 1.0.0 / ready / 2026-10-26\n\n'+
    '安装：解压后，将case.json、README.txt及demo下五个文件（共七文件）一起导入老师网站；或直接打开demo/index.html。\n'+
    '站点已有文件内置插件，不必先手工上传。后台/接口/联网不是演示的运行条件。\n'+
    '脚本顺序：data.js → core.js → app.js；所有数据、样式和算法均在包内。\n'+
    '操作：默认验证井。选择井、观察训练回代/验证/冻结测试标记；复位恢复默认验证井和设置。\n'+
    (item.sceneId==='w4'?
      'w4：训练/验证可试k=1/5/9/15，测试固定k=15、四模型特征。换显示轴或筛选只改变图，不改变全井指标。点散点、岩性柱、矩阵格联动；散点方向键移动、Enter选中、Esc清除。\n'+
      '评价：四类宏F1固定平均，未知参考不计分；已知参考拒判仍是错误。矩阵四类加未知行/拒判列。默认验证宏F1=20.40%，测试22.36%，高准确率不能掩盖小类失败；邻居投票占比不是校准概率。\n':
      'w5：目标固定GR，λ=10只读；改遮挡比例重新修复。切两法/单法或真值显示只重绘，遮罩不变。点缺口看局部，方向键移动、Enter选段、Esc取消。\n'+
      '评价：仅人工遮挡点计算MAE/RMSE/R²，并报n/masked与覆盖；两法差值只用共同点。原生缺口无真值、不评价。本批原生GR缺口=0，不能将人工遮挡称为真实掉线。负R²保留。\n')+
    '数据为 FORCE 2020 教学子集：4训练/1验证/1测试，曲线 NLOD2.0，解释标签 CC BY4.0，样本来源及 SHA256 在 data.js。\n'+
    '数据网址：https://zenodo.org/records/4351156\n原始仓库：https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition\n'+
    '标签是人工解释参考；本例不代表生产级解释或修复能力。默认模型只由训练拟合和验证选择，不在测试井调参。\n'+
    '可复现性：默认参数只由验证井选择，测试井不参与拟合或回调；四口训练井结果属于回代。\n');
  console.log('Authored ready '+item.id+' ('+fs.statSync(path.join(dir,'case.json')).size+' B)');
}
const preview='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>w4 / w5 内容预览</title><style>body{margin:0;background:#f5f3ec;color:#263a35;font:15px/1.8 "Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;padding:24px}section{margin:42px 0;padding:24px;background:#fffefa;border:1px solid #d9dcd1;min-width:0}a{color:#256754}h1{font-size:28px;line-height:1.5}h2{font-size:23px}h3{font-size:18px}p{max-width:900px}nav{display:flex;gap:24px}.draft{padding:14px;border-left:4px solid #a45d36;background:#f3ebde}figure{max-width:100%}figure>div{max-width:100%}li{margin:12px 0}@media(max-width:600px){main{padding:12px}section{padding:12px}h1{font-size:24px}}</style><main>'+
  '<p class="draft">只读背景/流程预览 · 插图来自实际内核固定计算。正式交互已集成在 <a href="../../site/index.html#/scene/w4?tab=demo">w4</a> / <a href="../../site/index.html#/scene/w5?tab=demo">w5</a> 场景页。</p><nav><a href="#w4">w4 岩性识别</a><a href="#w5">w5 测井数据修复</a></nav>'+
  [lith,repair].map(item=>'<section id="'+item.sceneId+'"><h1>'+esc(item.title)+'</h1><p>'+esc(item.tabs.background.lede)+'</p>'+
    item.tabs.background.sections.map(s=>'<h2>'+s.no+' · '+esc(s.title)+'</h2>'+s.html).join('')+
    '<h2>流程 · '+esc(item.tabs.workflow.title)+'</h2><ol>'+item.tabs.workflow.steps.map(s=>'<li><strong>'+esc(s.name)+'</strong>：'+esc(s.do)+'<br><small>'+esc(s.trap)+'</small></li>').join('')+'</ol>'+item.tabs.workflow.metrics.html+'</section>').join('')+'</main></html>';
fs.writeFileSync(path.join(root,'docs/prototypes/case-04-05.html'),preview);
