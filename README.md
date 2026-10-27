# 测井可视化教学实验室

纯前端测井教学项目：在完整石油作业链目录中，用五个实验观察算法输出、基线和失效条件。原生 HTML/CSS/JavaScript，无后端、运行时包依赖或在线模型服务。

- 网站：https://display454.github.io/petro-vis/
- 独立案例包：https://display454.github.io/petro-vis/downloads/
- 来源与许可：https://display454.github.io/petro-vis/licenses/

## 五个实验

| 实验 | 数据 | 方法和图表 |
|---|---|---|
| 测井曲线智能分层 | 合成多曲线 | 惩罚分段、邻窗基线、多轨曲线与界面匹配 |
| 储层参数智能解释 | 合成多井及模拟标定 | kNN 与密度公式、预测散点和深度残差 |
| 成像测井裂缝识别 | 合成井壁图像 | 像素正弦搜索、候选叠加、层理误检 |
| 岩性识别 | FORCE 公开井教学子集 | kNN/多数类基线、交会图、岩性柱、混淆矩阵 |
| 测井数据修复 | 同一公开井子集 | 固定人工遮挡、线性插值与跨曲线回归、局部误差 |

保留原框架的 13 环节、61 场景与导入契约。两个课程参考样例另计。图文、流程与实验均在包内；公开数据标签、输入和预测分离。此项目使用基础教学算法，不宣称提出新算法或达到生产精度。

## 源码与发布

`main` 分支保留可维护源码、测试、数据子集、构建工具和五个独立包；`gh-pages` 分支仅保存生成的完整静态网站。现有 `vis-course` 项目与本项目分别使用各自的项目路径。

```text
site/                 正式网站源与生成插件
cases/                五个独立案例的清单、源码、图文和数据
contracts/            接口类型定义（无需编译）
tests/                确定性算法与渲染回归测试
tools/                案例构建、数据处理与校验
data/processed/       FORCE v2 教学子集
data/research/        数据目录与原始/映射标签记录
extracted/assets/     校验所需的三个原框架基线文件（只读测试夹具）
docs/                 接口与设计说明
deliverables/cases/   五个可独立导入的 ZIP 和 SHA256 清单
```

原始 355MB 数据、个人课程提交材料、内部交接与临时证据不在公开仓库。源码包已包含运行演示所需数据；从原始数据重建时，请按 `site/licenses/force-2020-provenance.json` 的来源与校验值下载 `train.zip`，将解压的 `train.csv` 放到 `data/raw/`，再运行 `python tools/data/extract_force.py`。

## 本地运行与验证

直接打开 `site/index.html`，或在仓库根目录运行静态预览工具：

```text
python -m http.server 54821 --bind 127.0.0.1 --directory site
```

打开 `http://127.0.0.1:54821/`。预览工具不是网站运行所需的后端。

构建与测试需要 Node.js 和 Python 3.9+，运行网站不需要安装它们：

```text
node --test tests/*.test.cjs
python tools/build_cases.py
node tools/validate-cases.cjs
python tools/build_release.py --github-pages
```

输出 `deliverables/github-pages/` 与 `deliverables/github-pages.zip`。保持根目录 `index.html`、`.nojekyll`、`assets/`、`downloads/`、`licenses/` 的结构，完整发布到 `gh-pages` 分支根目录。Pages 发布源为该分支 `/`，页面使用 hash 路由，可在仓库子路径运行。不要对已构建的插件手改；修改 `cases/` 源文件后重建。

## 来源与许可

项目代码和新增图文当前保留作者权利；课程框架和样例保留原作者权利，未擅自套用统一开源许可证。见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

FORCE 曲线沿用 **NLOD 2.0**，人工解释岩性标签沿用 **CC BY 4.0**；数据许可独立有效。许可证全文、正式引用、来源哈希、筛选和精度保存/标签映射修改说明位于 [site/licenses/](site/licenses/)。公开数据两例的独立 ZIP 也将完整许可证附在 README 内。

本子集仅 6 井、3,000 点。测试井与训练/验证井互斥；小类成绩差、域偏移和原生缺口的不可评价边界均保留，不通过更换测试数据美化结果。
