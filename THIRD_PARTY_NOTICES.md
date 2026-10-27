# 来源、引用与第三方许可

## 课程框架与参考样例

本站基于课程提供的“石油勘探开发的智能化可能性地图”原生 HTML/CSS/JS 框架改进，保留 13 环节、61 场景及案例导入契约。原始框架、目录、测井分层参考样例和 `firstbreak-pick-case` 参考包来自课程材料，权利归原作者。提供的基线未附独立开源许可证，本项目不将其重新授予 MIT、Apache 或 CC 许可。老师样例不计入本人完成的五个案例。

## FORCE 2020 公开测井数据

来源与引用：Bormann P., Aursand P., Dilib F., Dischington P., Manral S. (2020). FORCE Machine Learning Competition.

- 原始发布仓库：https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition
- 长期归档：https://doi.org/10.5281/zenodo.4351156
- 指定来源声明：Lithofacies data was provided by the FORCE Machine Learning competition with well logs and seismic 2020.
- 原始井曲线：NLOD 2.0，https://data.norge.no/nlod/en/2.0
- 人工解释岩性标签：CC BY 4.0，https://creativecommons.org/licenses/by/4.0/
- 本地许可证全文：[NLOD 2.0](site/licenses/NLOD-2.0.txt)、[CC BY 4.0](site/licenses/CC-BY-4.0.txt)。

实际数据：原仓库 `lithology_competition/data/train.zip`。SHA256 为 `e996c8466f2d0dc7116daa71485cc90c31fcfac6345a5bb33165026478b642e9`；包内 `train.csv` SHA256 为 `f72eaa9d4d30b0990b553333baaac7d129f2a2c5bce96fd580b31592658641da`。

本项目修改：先仅按观测覆盖与连续性选取每井 500 点窗口，再按固定哈希选择 6 井并作 4 训/1 验/1 测拆分；标签合并/排除规则只由训练井决定。曲线保存四位小数，深度三位小数；没有插补或重采样。发布的是筛选、精度保存和标签映射后的教学子集，不是未经修改的完整原始数据。元信息见 [provenance JSON](site/licenses/force-2020-provenance.json)。

前三个实验使用程序生成的合成数据；FORCE 子集仅用于岩性识别和测井数据修复。标签为人工解释参考，不等同逐点岩芯证据；许可方和数据贡献者未为本站或算法结果背书。

## 项目代码与图文

项目新增代码、图文与教学合成数据保留各自作者权利，当前没有统一授予开源许可证。公开展示与源码可见不改变上述权利范围；数据许可独立有效。详见 [项目权利说明](LICENSE)。

站点运行不依赖第三方脚本库、CDN、在线字体、后端或 API；图表由原生 SVG/Canvas 与 JavaScript 绘制。系统字体由访问者设备提供。
