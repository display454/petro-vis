成像测井裂缝识别：从像素到正弦候选
版本1.0.0 / ready / 2026-10-26

安装：解压本包后，将case.json、README.txt和demo中的四文件（共六文件）一起导入老师框架，或直接打开demo/index.html。无data.js、联网或后端需求。
普通脚本加载顺序core.js → app.js；示范的数据在本地按固定seed生成。
数据全部合成，不是实测岩心/井壁成像。所有指标来自当前计算，默认配置不宣称最优。
w3：默认seed1803、noise0.06、visibility0.8、standard、阈值0.45。图像条件改像素与搜索；阈值只筛缓存；图层/选中只绘制。列表或叠加图点候选，方向键/Enter/Esc操作。暗线增强图越暗代表局部暗线响应越强。
评价：中心差≤5px且轨迹RMS≤4px，一对一对象匹配；默认TP3/FP0/FN0。层理/缺失方位可产生误检，弱可见度会漏检。候选分数不是概率，像素幅度不是开度，相位不是校正后的倾向，需人工确认。
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

