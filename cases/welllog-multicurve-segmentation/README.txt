测井曲线智能分层：多曲线惩罚最优分段
====================================
ID: welllog-multicurve-segmentation
sceneId: w1
版本: 1.0.0

使用
----
解压为完整案例目录，在老师原网站中点击“＋ 添加案例”，选择整个目录，
或选择目录中的 case.json 和全部 demo 文件（包含子目录文件）。
校验后添加。演示也可直接打开 demo/index.html，无服务器和联网要求。

专业背景、六步流程与可交互示范分别在三个 Tab。
对照默认井，先把惩罚从 4 调至 32，再复位后将最小层厚调到 3 m，
观察短层如何合并；各项读数由当前内核计算。

实现与数据身份
--------------
输入：固定种子教学合成观测，480 点，间隔 0.125 m，
GR（API）、RHOB（g/cm³）、RDEP（Ω·m）。
参考：生成器单独保存的合成界面，仅供评价；不进入预测函数。
主方法：RDEP log10 + 各通道 z 分数 + 段长约束下的惩罚最优分段。
基线：四样本邻窗均值差、阈值和最小间距抑制。
它是无监督教学算法，不是已训练深度网络；不包含 FORCE 真实数据，
不将岩性标签或中子测井值冒充真实层界或岩心孔隙度。

评价
----
边界是两个采样点间的中点深度；容差固定 ±0.5 m。
一对一匹配先最大化命中数，再最小化匹配距离。
P/R/F1 由 TP/FP/FN 计算，MAE 仅统计成功匹配点。
有参考而无预测时 P/R/F1 为 0，MAE 不适用；两者皆空则不适用。
默认合成井满分不能证明真实井性能；高惩罚下主算法可能劣于基线。

文件
----
case.json：专业背景、流程、示范声明（包含项目原创 SVG）
demo/index.html：演示入口
demo/demo.css：独立浅色样式
demo/core.js：纯函数算法内核
demo/app.js：交互编排与可视化
README.txt：本说明

复现与参考
----------
默认 seed=1801、thin、noise=0.35、penalty=4、最小层厚 0.75 m，
三曲线、基线阈值 0.65。复位恢复同一结果。
专业概念参考 EPA Borehole Geophysical Methods / Natural Gamma /
Gamma-Gamma Density Logging，具体链接见专业背景 Tab。
数据、图形和代码在项目中生成，无第三方图表运行库或远程素材依赖。

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

