# 模块与接口规范 v1.3

日期：2026-10-26，R05执行状态更新，API仍为v1.3。本文件为A/B的唯一接口定义；contracts/interfaces.d.ts是类型辅助。原生JavaScript，不要求TypeScript构建。w1/w4/w5 API不变；w2/w3 API见第13—14节，第15节记录当前验收顺序。

## 1. 模块与文件所有权

| 模块 | 路径 | 负责人 | 输入 → 输出 |
|---|---|---|---|
| 原始参考框架 | extracted/ | 只读 | 兼容基线 |
| 页面外壳 | site/assets/core/shell.js | B | ATLAS、Cases、hash → 导航和场景页 |
| 全站设计令牌与布局 | site/assets/core/{tokens,layout,ui}.css | B | 固定视觉规范 → 页面样式 |
| 案例元内容 | cases/<id>/case.json | A | 背景、流程、演示声明 → 原框架可渲染内容 |
| 案例算法内核 | cases/<id>/demo/core.js | A | 纯数据与参数 → 结果；不操作 DOM |
| 案例视图和控制器 | cases/<id>/demo/{index.html,demo.css,app.js} | B | 控件 → 内核 → 图表/读数/状态 |
| 数据调研与裁剪 | data/、tools/data/ | B | 官方数据 → 有来源、划分和单位的小样本 |
| 插件生成与打包 | tools/build*、site/assets/cases/ | A | 同一案例源 → 内置插件与独立 ZIP |
| 集成入口 | site/index.html | A | 保持 script 顺序，挂载内置案例 |
| 验证 | tests/、tools/validate* | A | 算法样例、清单、包 → 检查结果 |

不向原框架增加案例包必填字段。v1 是项目内部契约，其他同学的原格式案例包无需知道这些内部类型。

## 2. 冻结的外部契约

### 2.1 路由

保留 #/、#/chain、#/stage/welllog、#/scene/w1、#/method/ts、#/cases、#/guide 以及原管理入口。保留场景查询 ?case=<id>&tab=bg|flow|demo；解析时同时接受原支持的数字 Tab。点击 Tab 或切换案例时不能悄悄丢弃显式 case 参数，刷新后应仍能定位同一案例。

详情页 data-tab、data-panel、case-demo-root 等原挂载关系，B 可在 shell.js 内重构，但必须保留 mount(root,ctx)、unmount() 的实际生命周期。清理全局事件、观察器和定时器，不因重渲染重复绑定。

### 2.2 案例包

~~~
<case-id>/
  case.json
  demo/index.html
  demo/demo.css
  demo/core.js
  demo/app.js
  README.txt
~~~

script 使用普通脚本，先 core.js、后 app.js。HTML 只引用包内文件。无模块导入、fetch 本地 JSON、包外共享运行库和必须联网的 CDN。内核导出 window.WelllogSegCore，同时支持 Node require 供测试。

case.json 的 tabs.demo 使用 {mode:"auto",html:"demo/index.html",label:"可运行示范",height:900}。背景插图写 sections[].html；流程可视图写 workflow.metrics.html，步骤仍写 steps。清单不含 script。

### 2.3 注册、宿主与发布

保持 Cases.register、CaseImport 与 CaseDemoHost 的原 API。上传仍由原 CaseImport 完成；B 不新造上传协议或把拖文件上传替换成粘贴网址。

A 的生成器使用同一源内容注册插件，示范经 CaseDemoHost.create 运行并在退出时 destroy。index 加载顺序仍为 data → registry → kit → cases → host → import → admin → shell。插件 mount 执行时宿主已存在，注册阶段不能提前调用它。

原始“welllog-layer”是老师参考；五个本人 ID 为主规划列出的 welllog-* ID。统计“本人已完成”需同时满足本人 ID 清单和 status=ready，不能直接使用 Cases.stats().ready。

## 3. 数据接口

WellDataset 含 schemaVersion、id、wellId、depth_m、curves、units、source，详见类型文件。

- depth_m 严格递增，数值为米；所有曲线与深度等长。其他单位：gr_api=API，rhob_g_cm3=g/cm³，rdep_ohm_m=Ω·m，nphi_vv=v/v。
- 源数据 NaN、±Infinity、缺测标志先转换为 null；不能用 0 代表缺失。曲线不存在时省略整个键。
- 当前 w1 合成演示保证所选曲线完整；内核遇 null/非有限数即报明确异常。B 的真实数据不能直接绕过校验送入 w1，真实接入另经 A 定义预处理。
- 正式公开批次 PublicWellBatch 包含来源与 train/validation/test 井名，三组互斥。原始标签编码保留，映射另表记录，不拿岩性标签当 w1 地层界面真值。
- source.kind 区分 synthetic/public。公开来源的 URL、许可、获取日期、原文件 SHA256、字段说明、抽样脚本写入 data/research/；下载原数据不放进可发布 site/。
- w1 的模拟界面与地层标签在 SegReference 中，与 dataset 分开；segment 和 gradientBaseline 的参数中没有 reference。

## 4. w1 内核 API

运行入口：cases/welllog-multicurve-segmentation/demo/core.js。

| 调用 | 语义 |
|---|---|
| makeSyntheticWell({seed,noise,preset}) | 返回 {dataset,reference}；固定 seed+设置可重现 |
| prepareFeatures(dataset,keys) | 对 RDEP 先 log10，其余保持原量纲；对当前井观测点做总体均值/标准差标准化，返回 [n][p] 数组和变换参数 |
| segment(values,{penalty,minSamples}) | 多曲线惩罚最优分段，返回边界、分段、拟合损失与目标函数 |
| gradientBaseline(values,{threshold,minSamples,windowSamples}) | 邻窗均值差基线，局部峰值与最小间距抑制，返回独立边界 |
| boundaryDepths(dataset,indices) | b 对应 samples[b-1] 与 samples[b] 的中点深度 |
| evaluate(predicted_m,reference_m,tolerance_m) | 一对一、先最大匹配数量再最小总距离；返回 TP/FP/FN、P/R/F1、MAE 与匹配明细 |

数据约定：当前井标准化是无监督的观测预处理，不用真值和未来测试井统计。不声称它是一个已训练的监督模型。若某通道标准差为 0，返回全 0 并记录 std=1 作为安全分母。

segment 的区间为 [start,end)，minSamples 为正整数。目标为各通道标准化 SSE 的平均值之和，加 penalty×边界数；同分选择边界更少的方案。输出边界不包括 0、n，不允许空段。

评价边界：有真值无预测时 P=R=F1=0，MAE=null；没有真值且有预测时 P=0、R=null、F1=0；两者皆空时 P/R/F1/MAE=null，UI 显示“无界面，不适用”。未匹配点不进入 MAE。

无预测时 P=0 是本项目约定，不表示“预测了很多但全错”，需配合“无候选界面”的文字。selectedDepth_m 为 null 时读数显示“—”，滑杆可停在中点但不能伪造已选读数。

所有函数不改变输入，不持有 DOM 或定时器。无效参数抛出可读 Error；视图层捕获并用 role=alert 显示，不能吞错后展示旧指标。

## 5. w1 控制器状态与重算规则

初始状态：seed=1801、preset=thin、noise=0.35、featureKeys=[gr_api,rhob_g_cm3,rdep_ohm_m]、penalty=4、minThickness_m=0.75、baselineThreshold=0.65、showReference=true。分层容差固定 0.5 m；模拟采样间隔 0.125 m，minSamples=ceil(minThickness_m/0.125)。

| 事件 | 更新 | 可否重新生成观测数据 |
|---|---|---|
| penalty/minThickness/features 改变 | 预处理或分段、基线、评价、主图和读数 | 否 |
| baselineThreshold 改变 | 仅基线及其评价 | 否 |
| showReference 改变 | 仅真值显示，指标仍可显示 | 否 |
| noise/preset 改变 | 相同 seed 的新难度条件，完整重算 | 是；潜在界面不随 noise 改变 |
| 换一口井 | seed 增加，所有结果重算 | 是；UI 明示新 seed |
| hover/select depth | 游标、读数、选中明细 | 否，不重跑算法 |
| reset | 恢复默认状态，清除选中 | 是，回到 seed=1801 |

同一状态对象驱动所有视图。禁止各图自行生成不同噪声。最多使用 requestAnimationFrame 合并拖动更新，先以 n=480 验证是否需要进一步优化。

无需把每次悬停写进 URL 或存储；正式演示若持久化配置，需带 schemaVersion，不存整份模拟结果。iframe 不直接操作父站路由或父站 DOM。

## 6. 样式边界

主站变量为现有 --paper/--ink/--jade/--clay 等，保持旧变量以兼容老师案例。B 可新增语义变量，但不删除已有变量。

整页 iframe 不会天然继承父页 CSS。demo.css 必须带独立默认令牌；不要假设父站的 --jade 已在 iframe 内可用。为避免额外跨窗协议，v1 不增加主题 postMessage：主站和示范使用相同的默认色值即可。

## 7. B 的数据交接接口

当前正式交付为 data/processed/force-demo-v2.json 与 data/research/README.md、catalog.json、lithology-map.json，另有 tools/data/ 中可重跑的裁剪脚本。v1 已作废为评测数据。公开样本为 6 井、4 训、1 验证、1 测试。

约 2,000—4,000 个展示点，连续井段优先。原始采样间隔要保留，不强行伪装为 0.125 m。类别按训练井分布确定，3—5 类目标不是必须达成的漂亮数量；测试井不用于筛样本或调映射。

数据缺失保留 null；不得从邻近测试标签插补特征或用测试井均值标准化。样本量、缺失率、剔除规则、完整字段单位全部可复核。

### R02 数据补充约定

- R01 的 force-demo-v1.json 只接受为展示/勘查产物，不能用于独立泛化评测：其选窗、选井及类别规则先读了全部 98 井标签，再作项目内拆分。
- B 在 R02 生成 force-demo-v2.json，先按井固定拆分，窗口选择仅使用预先定义的观测曲线质量规则；类别、合并/排除和预处理统计只从项目训练井确定。数据源文件叫 train.csv 不意味着其中所有井都是本项目的训练井。
- Source 可带 retrievedAt、files（SHA256）与 licenses（曲线/标签分别说明）。PublicWellBatch 可带 purpose 与 selectionPolicy；purpose=evaluation 的批次必须显式 usesHoldoutLabels=false，并提供验证依据。
- lithology 为模型展示类名；originalLithologyCode 始终保留原始编码，不能被合并后的编码替代；新增 mappedLithologyCode 表示合并/筛选结果。被排除类只将映射字段置 null，原始编码仍保留。
- 一窗一条目，id 带窗口序号，wellId 保留原井身份；同井多个窗口不得跨拆分。不新增 segments 嵌套结构。
- 暂不为基线增加候选数新 API；现有预测数、阈值与结果足以解释本轮演示。

## 8. 变更与集成

本轮 A 已提供内核 v1 和设计草图。B 直接实现已有 API；遇到缺项，在 R01-B-report.md 中列出“当前字段、所需字段、理由和最小补丁建议”。A 汇总后再改接口，不默改 core.js 或类型文件。

每轮汇总以实际文件和检查结果为准；A/B 同目录工作时遵守所有权，已有目录不整棵覆盖。没有 Git 初始化也不影响本轮，不擅自删除他人新文件。

## 9. R03 运行资产与初始化

w4/w5的`demo/`已有A的`data.js`、`core.js`与B的UI。普通脚本顺序 **data.js → core.js → app.js**。w1/w2/w3各六文件，不加data.js。w4/w5七文件ZIP与内置插件为ready 1.0.0，实际ZIP原站导入和新站集成已由R04-B补验，见R04-review.md。五例已公开部署；ready元数据不等于视频和最终课程提交完成。

data.js 来自 tools/build-public-demo-data.cjs，浏览器全局 `WelllogDemoData`，Node 可 require；包含 `{schemaVersion,datasetSha256,batch,classes,defaults}`。classes 来自 lithology-map.json，视图不得另写编码名称表。两个例子各带完整相同数据副本以独立运行（每份 187485 B）；无包外数据依赖。数据/脚本由 A 生成，B 不手改生成文件。不要从 docs/experiments 快照读取预测作为交互结果。

初始化示例：

~~~js
var D = window.WelllogDemoData;
var train = D.batch.wells.filter(w => D.batch.split.train.includes(w.wellId));
var target = D.batch.wells.find(w => D.batch.split.validation.includes(w.wellId));
// 默认显示验证井，训练井标“训练回代”；test 标“冻结设置的测试展示”。
~~~

原始来源 source 随数据保存（两项许可、获取日期、原文件 SHA256、引用与修改说明）。source 的 citation/modification 是可选元信息。实际曲线保存四位小数、深度三位小数，不称为逐位未修改；未插补、未重采样。

## 10. w4 岩性识别 API 与评价

全局 `WelllogLithologyCore`，版本 1.0.0；路径 cases/welllog-lithology-classification/demo/core.js。

| 调用 | 输出与限制 |
|---|---|
| fitLithology(trainWells,{featureKeys?}) | 只传 split.train；完整且映射有类的 1973 点拟合标准化/邻居，返回 model。RDEP 取 log10，均值/总体标准差仅取这些训练点，常量 std=1 |
| predictLithology(dataset,model,{k}) | 不读取任何标签；返回 predictedCode、classCodes、voteFractions[n][c]、topVoteShare、k、rejected。特征 null/非有限或非正 RDEP → predictedCode=null，投票项=null |
| predictMajority(dataset,model) | 始终输出训练多数类（65000）；独立、不读目标标签，返回 predictedCode 与 classCodes |
| evaluateClassification(ref,pred,classCodes) | 返回固定 (c+1)×(c+1) matrix、perClass、macroF1、accuracy、evaluated、total、unknownReference、rejectedKnown、referenceCoverage、predictionCoverage |

固定训练类顺序 `[30000,65000,65030,70000]`（实际以 model.classCodes / D.classes 核对）；显示名只用 D.classes。默认四曲线、k=15，由验证候选 `[1,5,9,15]` 中固定四类宏 F1 最大者选择，同分较小 k。API 省略 k 的通用默认是 9，**本项目控制器必须显式传 D.defaults.lithology.k=15**。不做类别均衡、平滑或投票阈值拒判；未知岩性不一定会被模型识别成未知。

同票时先取距离平方和较小类，再按 classCodes 顺序；邻居距离同分按训练点顺序。voteFractions 是等权邻居投票频率，topVoteShare 只能叫“邻居投票占比”，不是校准概率，不叫置信度。k 大于训练样本数时截到训练点数。

通道键完全缺失或数组错位属于输入结构错误，会抛异常；已存在通道里的逐点 null/非有限值才按该点拒判处理。w5 的辅助通道同理：结构错误抛异常、逐点缺失返回 null。

评价规则不设可切换 unknownPolicy：

- matrix 行=参考、列=预测，末行=参考未知/未映射，末列=预测拒判/类外。全矩阵之和=total，包括未知参考。未知参考行不参与 P/R/F1/accuracy 的分子分母。
- evaluated = **参考属于四类的点数**，包括预测拒判点；accuracy=其中预测正确/evaluated。拒判仍是该参考类 FN，不能从分母去掉。referenceCoverage=evaluated/total；predictionCoverage=(evaluated−rejectedKnown)/evaluated。
- perClass.precision 的 FP 仅来自其他已知参考类；recall 的 FN 包括拒判。无预测/无支持时该类 P/R/F1=0；macroF1 固定平均四类，不能在单类井退化成 1×1 或称“不适用”。无任何已知参考时 macroF1/accuracy=null。
- 单类训练井即使 accuracy=100%，固定四类 macroF1=25%；说明“本井缺少其他类参考；固定四类平均”，保留矩阵空行列。

W4-1/2/4 接受并落地；W4-3 改成未校准投票占比。B 原设计中“accuracy 只统计有预测点”和“单类宏平均不适用”被本规则替换。

UI 状态：wellId、k（验证/训练实验）、xKey、yKey、classFilter、errorsOnly、selection。轴切换只影响显示，不改变模型特征。进入 test 自动使用冻结 k=15 与四特征，锁定模型参数；训练/验证可尝试候选 k，明确训练回代不是泛化分数。显示过滤、选中、隐藏参考不改变全井指标。

errorsOnly 只含 **已知参考且 pred!=ref**（包括拒判），对应已知参考各行的非对角及拒判列之和；未知参考没有可判定对错，另设“未映射参考”计数/筛选。散点轴缺失点不绘制，报告未入图数；过滤隐藏数另列，不能和缺失混为一项。矩阵/柱/散点共用一套选择，按样本索引定位，避免浮点深度匹配歧义。

## 11. w5 测井数据修复 API 与评价

全局 `WelllogRepairCore`，版本 1.0.0；路径 cases/welllog-curve-reconstruction/demo/core.js。本轮目标只支持 GR；不放不可用的目标曲线选择器。

| 调用 | 输出与限制 |
|---|---|
| fitRepair(trainWells,{lambda}) | 训练完整 GR+RHOB+NPHI+RDEP 的 2000 点；无岩性标签输入。返回 targetMean、训练 transforms、coefficients、lambda、trainingWellIds 等 |
| makeMask(dataset,{curve:'gr_api',ratio,seed,blockSamples}) | 返回 flags、gapKind、gaps（仅 masked）、regions（masked+genuine）、**visible**、eligible、masked、actualRatio 等；区间 [start,end) |
| repairCurve(**mask.visible**,mask,{method:'linear'}) | 按实际深度，用可见 GR 两侧端点独立插值；边缘不外推；返回 filled、method、params |
| repairCurve(**mask.visible**,mask,{method:'ridge',model}) | 只用 RHOB/NPHI/log10 RDEP 重建空 GR；辅助特征缺失则该点 null。已有可见 GR 原样保留，不做插值后修正；返回同上 |
| evaluateRepair(originalGR,filled,mask.flags) | 只在人工遮挡且真值非空点评价，返回 mae/rmse/r2、n（成功预测点）、masked（可评价遮挡点）、coverage=n/masked |
| compareRepairs(originalGR,aFilled,bFilled,mask.flags) | 两法共同成功预测的遮挡点比较，返回 a/b 的共同点指标、common、aBetter/bBetter/tied |

严格隔离：repairCurve 的第一参数只能是 **makeMask 返回的 visible**，若 flags=true 的 GR 仍非 null 会报错。不要用原始 dataset 调修复，不要把原始 GR 作为辅助特征。reference 原始数组仅交评价/按需展示。训练模型拟合只在初始化或验证参数实验时发生；方法切换仅改显示。

岭回归目标：`mean((GR−targetMean−z·β)^2)+lambda*sum(β²)`，targetMean 不受惩罚；三特征只用训练统计。默认 λ=10，从 `[.001,.01,.1,1,10]` 按验证默认遮罩 MAE 选择，同分较小 λ。test 固定 λ=10，不能因显示的测试分数换参数。本轮 λ 以只读参数说明展示即可，优先完成遮罩实验。

默认 ratio=.15、seed='r03-w5-01'、blockSamples=15，传 D.defaults.repair。ratio 允许 0—.4（UI 0—30% 即可），块长正整数。每个原始有效连续段保留首尾，块间留一个可见锚点；块按 seed+wellId+start 的 FNV-1a 哈希排定固定顺序，再取前 floor(有效GR点数×ratio) 点。遮罩不依赖 GR 数值/标签；固定 seed/块长提升 ratio 得到嵌套遮罩。过短片段可遮点不足时 masked/actualRatio 如实下降；gaps 每段不超过 blockSamples。makeMask 不修改原数据。

gapKind='genuine' 来自原始目标非有限/null，'masked' 是新遮挡，其余 observed。当前 v2 全部 GR 有效，**原生缺口确实为 0**，不为好看制造“真实失测”。可画斜纹图例并说明本批没有；测试中的 null fixture 仅用于结构检查，不混入公开实验。原生缺口可返回估计，但读数只能写“无真值，不评价”。

R² 真值方差为 0 或无成功预测点时为 null；负值保留。无预测的遮挡点进入 masked、不进入 n，覆盖率下降，不记成 0 误差。两法数值差/胜出点数用 compareRepairs 的共同点结果，并显示 common；各自 n/masked 仍展示。W5-1/2/4 已落地；W5-3 的 n 不保证等于 masked，B 的原稿须按此修正。

UI 状态：wellId、maskRatio、maskSeed、method='both'|'linear'|'ridge'、showTruth、selection={sampleIndex|null,gapId|null}。默认验证井，首次不伪造选中读数。换井/ratio 改变才重新遮罩和修复；切方法/真值显示/选中不重新遮罩、训练或生成数据。reset 回到验证井和 D.defaults.repair。显示真值开关不改变任何指标。

## 12. R03 接线验收

运行`node tools/build-public-demo-data.cjs`生成数据/结果，`node tools/build-case-04-05-content.cjs`输出w4/w5正式图文与ready清单，`python tools/build_cases.py`同源生成插件/ZIP。当前w2/w3正式UI已通过R04实现审查，由A生成ready 1.0.0；不为打包添加占位data.js。

B的R03 UI已交回，A修复标题、散点触控/对数无效点/错误明细及w5点击深度映射，R04-B补验已通过。不得恢复历史UI文件。包内不使用框架/CDN/fetch/module import。当前交接为R05最终线上/累计导入/补丁验收。

## 13. w2 孔隙度解释 API

全局 `WelllogPorosityCore`，版本1.0.0，文件 cases/welllog-porosity-regression/demo/core.js。只需普通脚本 **core.js → app.js**，不另加 data.js，所有输入由纯函数生成。

| 调用 | 语义 |
|---|---|
| makeExperiment({seed=1802,noise=1,scenario='standard'}) | 返回 {seed,scenario,train,target}；4训练井各240点，目标320点；先生成潜在孔隙度，再生成曲线。target={dataset,reference:{kind:'synthetic',porosity_vv}}，两者分离 |
| selectCalibration(train,{perWell=24}) | 每训练井按固定哈希的样本索引顺序取前缀；返回训练井结构、标定子集。预算6/12/24/48每井，对应24/48/96/192总点，严格嵌套 |
| fitPorosity(train,{perWell=24,featureKeys}) | 只读所选训练标定与对应观测；对选中完整点拟合均值/总体标准差，RDEP先log10，std为0时取1。返回样本、标定labels、positions、transforms与训练井信息 |
| predictPorosity(target.dataset,model,{k=9}) | 等权kNN均值，返回predicted_vv、localSpread_vv、outsideTrainingRange、有效k；缺失/非正RDEP逐点null。整通道缺失/错位抛错 |
| densityBaseline(dataset,{matrixDensity=2.65,fluidDensity=1}) | φ=(ρma−ρb)/(ρma−ρf)，预测不裁到0—1；返回predicted_vv与假设参数，独立于kNN |
| evaluateRegression(reference,predicted) | mae_pp/rmse_pp/bias_pp（均是**百分点**）、r2、n/total/coverage；无预测不记0误差。R²允许负数，参考方差0时null |

默认四曲线；UI提供“四曲线 / 仅RHOB”两档即可。k候选1/5/9/15。k大于有效训练点时截断；同距按训练点顺序。localSpread_vv为k个邻居标定值的总体标准差，不能标置信度/95%区间；outsideTrainingRange为任一变换后特征超出所选训练点min/max，是未校准的提示，不代表一定错误或自动拒绝。

scenario='shift'只改变目标井的流体/观测响应，训练井和潜在目标孔隙度与standard相同。noise=0—3只改观测噪声，不改变潜在参考或模拟标定。所有数据必须标“合成数据与模拟岩心标定”，不得把NPHI当作参考。

事件与缓存：

- 初始化生成一次experiment并fit；perWell/features改动只重新fit+predict；k只predict；情境/噪声/seed变化才重新生成。目标换情境时训练生成结果数值相同，不需为了悬停再次fit。
- 选中深度/散点/残差、显示参考开关只渲染；同一sampleIndex驱动三图。参考开关仅控制深度轨模拟参考路径、选中参考标记及提示，散点/残差继续承担参考评价功能。初始selectedIndex=null，不伪造选中。
- 默认seed1802、standard、noise1、perWell24、四特征、k9、显示模拟参考。复位恢复这些值。
- 这是**留出教学井的交互实验**，允许看着其结果探索参数；不能声称它是隔离于调参的最终测试集，也不写“最优k来自测试”。当前默认是预设教学配置，没有按目标分数调默认。

行业解释依据：[SLB Measuring Porosity Downhole](https://www.slb.com/zh-cn/resource-library/oilfield-review/defining-series/defining-porosity)。代码生成器中的噪声、流体变化与泥质响应系数属于项目教学假设，不是照搬该文的测量数据或仪器仿真。

## 14. w3 成像裂缝几何候选 API

全局 `WelllogFractureCore`，版本1.0.0，文件 cases/welllog-fracture-detection/demo/core.js。普通脚本 **core.js → app.js**，无外部图像。B 用 Canvas 渲染像素（或本地SVG图层），候选由内核唯一提供。

| 调用 | 语义 |
|---|---|
| makeImage({seed=1803,noise=.06,visibility=.8,preset='standard'}) | 返回 {image,reference}。image含width128/height256、行优先pixels（灰度0—1、null未观测）、depthTop_m2500、depthStep_m.02、azimuthOrigin_deg0；reference={fractures,distractors}独立 |
| prepareImage(image) | 逐列±6行局部背景均值减像素，除.35后裁到0—1；返回strength及有效像素数；null保持null。恒定竖条偏移被抑制 |
| searchSinusoids(prepared) | 固定网格中心步长2px、幅度0—32步长4px、相位15°；对轨迹附近±1行最大响应取均值、支持率与有效列。粗候选固定筛选后局部细化，轨迹RMS距离5px去重；返回排序candidates/coarseCount/grid/nmsDistance_px |
| selectCandidates(search,{threshold=.45,maxCandidates=12}) | 对缓存候选按分数阈值过滤；同一search降低阈值不会丢掉高阈值候选。score是暗线响应均值，不是概率 |
| trajectory(candidate,width) | 返回每列几何行坐标：centerRow + amplitude_px*sin(2π*x/width + phase_deg*π/180) |
| trajectoryDistance(a,b) | 理想整周期正弦之间的RMS像素距离，含中心、正弦和余弦系数差；相位周期性自然处理 |
| evaluateDetections(predicted,reference.fractures,{centerTolerance_px=5,trajectoryTolerance_px=4}) | 仅参考fractures参加对象评价；满足两容差的边，一对一先最大匹配数再最小距离。返回TP/FP/FN、P/R/F1、meanDistance_px、matches、未匹配索引与容差 |

候选结构 `{id,centerRow,amplitude_px,phase_deg,score,support,validColumns}`；id来自缓存排序，不能在阈值变化后重新用数组位置充当跨图对象身份。matches里的predictedIndex是**本次筛选结果索引**，referenceIndex是fractures索引。

preset：standard=三条裂缝参考+竖条采集干扰；occluded=第24—54列null（97/128列可见）；bedding=另加层理正弦干扰，它不在fractures中，被几何检测接受时属于本实验FP。不同preset不改变三条裂缝参考。noise允许0—.3，visibility0—1；两者改变像素，不移动参考几何。

中心深度=depthTop_m+centerRow*depthStep_m；幅度_m=amplitude_px*depthStep_m。相位是公式中的ψ，不能直接标“倾向”；幅度不是开度。没有井径、井斜和工具定向校正，不输出真实产状/开度。候选在地质上仍需复核，不能把所有平面迹线称为已识别天然裂缝。

事件：图像条件改变才makeImage→prepareImage→searchSinusoids；threshold只selectCandidates→evaluate；候选/结果/真值图层开关与selectedCandidateId只绘制。阈值排除旧选中时清掉明细；不要重算搜索或让旧数组索引选中别的对象。用rAF合并拖动时区分“新图像待计算”和“只绘制”，最终条件不能被旧任务覆盖。

默认标准图TP3/FP0/FN0只对合成条件成立；默认遮挡图TP3/FP1/FN0、层理图3/1/0、可见度.3图0/0/3、噪声.18图3/2/0。允许这些失败，禁止修饰参考或偷偷只画匹配成功的候选。无参考且无预测P/R/F1=null；有参考无预测P=R=F1=0；有预测无参考P=0/R=null/F1=0。

几何解释依据：[US EPA Borehole Acoustic Televiewer](https://www.epa.gov/environmental-geophysics/borehole-acoustic-televiewer-atv)。本例为灰度/几何教学模型，不宣称复现电阻率或声波成像仪器响应。

## 15. 当前交付与验收顺序（R05）

R04-B已补验w4/w5新站点挂载、深链接、宽窄回缩及**实际ZIP解压后原站七文件导入**，并完成w2/w3正式UI。A审阅后修复w2参考开关/空散点/负值范围和w3灰度说明/错误/空态，完成五例集成、打包与公开部署，见R04-review.md和R05-summary.md。

两例背景/流程和静态图来自tools/build-case-02-03-content.cjs，当前均ready 1.0.0。docs/experiments/R04-core-results.json只用于核对，不允许UI读取它作为预测结果。B按prompts/agent-b-round-05.md检查线上匿名交互、新w2/w3实际ZIP原站导入、五包累计持久化和A补丁；改UI后由A重建插件/ZIP并重发同一站点。API签名不变，无需改contracts。未执行的浏览器/真机检查不得写通过。
