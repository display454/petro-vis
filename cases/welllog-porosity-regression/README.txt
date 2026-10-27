储层参数智能解释：模拟标定与孔隙度预测
版本1.0.0 / ready / 2026-10-26

安装：解压本包后，将case.json、README.txt和demo中的四文件（共六文件）一起导入老师框架，或直接打开demo/index.html。无data.js、联网或后端需求。
普通脚本加载顺序core.js → app.js；示范的数据在本地按固定seed生成。
数据全部合成，不是实测岩心/井壁成像。所有指标来自当前计算，默认配置不宣称最优。
w2：默认seed1802、noise1、standard、每训练井24个模拟标定点、四特征、k9。情境/噪声/seed改观测；预算/特征重拟合；k只重预测。深度轨、散点与残差联动，方向键移动、Enter确认、Esc清除。参考开关只隐藏深度轨的参考线，散点/残差评价仍使用参考。
评价：误差以孔隙度百分点pp显示，预测值为v/v；邻居标定差异不是置信区间。密度基线假设骨架2.65/流体1 g/cm³，负值/越界不裁切。默认MAE约0.803/1.814pp；shift约1.786/2.835pp。
复位恢复默认配置与空选中。来源说明在案例背景/流程与演示中，项目采用纯前端HTML/CSS/JS。

R07 publication rights and attribution
========================================
Project rights and third-party licences
======================================

Copyright (c) 2026 the respective petro-vis contributors.
All rights reserved for original project contributions unless a separate
licence is explicitly identified for a particular file or component.
Publication of the website and source repository does not itself grant a
blanket open-source licence. Statutory rights remain unaffected.

The supplied course framework, scene catalogue, original sample cases and
their adaptations remain subject to their respective authors' rights.
The supplied baseline did not include a separate open-source licence.
No MIT/Apache/Creative Commons licence is asserted for those components.

The FORCE 2020 well-log data and interpreted lithofacies labels retain
their existing third-party licences, independently of project code:

* Well-log curves: Norwegian Licence for Open Government Data (NLOD) 2.0.
  https://data.norge.no/nlod/en/2.0
* Interpreted lithofacies labels: Creative Commons Attribution 4.0
  International (CC BY 4.0).
  https://creativecommons.org/licenses/by/4.0/

These data licences are not restricted by the reservation of rights above.
This README contains the applicable attribution and licence information.
For data-bearing cases, full data licence texts follow below.

