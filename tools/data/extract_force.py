#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FORCE 2020 测井数据提取 v2：全井观测选窗 → 哈希取 6 井拆分 → 类别只由训练井决定。

与 R01 的 v1（已归档为 extract_force_v1.py，产物 force-demo-v1.json）的根本差别在顺序。
下面是**代码实际执行的顺序**（函数名即证据，不含“文档比代码更严”的修辞）：

    1. load()         读入原始 CSV。整行读入，内存里也带着岩性列；
    2. screen_wells() 对**全部 98 口井**做观测可用性判定与选窗（窗内无断点、GR 全有效、
                      RHOB/NPHI/RDEP 覆盖率达标；排序键＝覆盖率 → GR 标准差 → 深度）。
                      这一步只读 depth 与 curves，**不读 lith**。本批 98 口全部可用；
    3. split_wells()  再按「固定种子 + 井名」的 sha256 升序取前 6 口，**顺序即拆分顺序**
                      （4 训 / 1 验 / 1 测）。到此为止没有任何标签参与；
    4. class_rule()   只读**训练井**窗口内的标签，确定类别集合、合并与排除规则；
    5. build_entry()  最后才写出窗口样本，原始编码与映射编码分开保存。

也就是说：选窗在第 2 步、拆分在第 3 步，两者都不看标签；标签第一次被用于决策是第 4 步，
且只碰训练井。所以置乱 holdout 标签不会改变井清单、窗口位置、曲线值与训练类别规则。
可重跑的检查在 tools/data/check_force_v2.py。

数值保存精度：曲线 round(v, 4)、深度 round(v, 3)。文件里是源值在该精度下的四舍五入结果，
不声明“逐位未变”；未插补、未重采样、未改动原始采样间隔。

只使用标准库。用法（项目根目录）：
    python tools/data/extract_force.py --csv data/raw/train.csv --out data
"""

import argparse
import csv
import hashlib
import json
import os
from collections import Counter

POLICY_VERSION = 'force-v2.1'
SPLIT_SEED = 'force-v2-2026-10-25'      # 固定种子；不因结果更换
CSV_DELIM = ';'
DEFAULT_WELLS = 6
DEFAULT_WINDOW = 500
TRAIN_COUNT = 4                          # 6 井时：4 训 / 1 验 / 1 测

CURVE_COLUMNS = [
    ('gr_api', 'GR', 'API'),
    ('rhob_g_cm3', 'RHOB', 'g/cm³'),
    ('nphi_vv', 'NPHI', 'v/v'),
    ('rdep_ohm_m', 'RDEP', 'Ω·m'),
]
LITH_COLUMN = 'FORCE_2020_LITHOFACIES_LITHOLOGY'
DEPTH_COLUMN = 'DEPTH_MD'
WELL_COLUMN = 'WELL'

DISPLAY_NAME = {
    30000: '砂岩', 65030: '砂泥互层', 65000: '泥岩', 80000: '泥灰岩', 74000: '白云岩',
    70000: '石灰岩', 70032: '白垩', 88000: '岩盐', 86000: '硬石膏',
    99000: '凝灰岩', 90000: '煤', 93000: '基底',
}
MERGE_INTO = {70032: 70000}              # 白垩 → 石灰岩（原始编码仍各自保留）
EXCLUDE = {
    88000: '岩盐：蒸发岩，非本组目标岩性',
    86000: '硬石膏：蒸发岩，非本组目标岩性',
    99000: '凝灰岩：火山岩类，样本极少，响应不可比',
    90000: '煤：有机质层，样本极少',
    93000: '基底：非沉积岩',
}
MIN_TRAIN_SHARE = 0.02
MIN_CURVE_COVERAGE = 0.5
STEP_TOL = 1e-6

SOURCE = {
    'kind': 'public',
    'label': 'FORCE 2020 Wells and Lithofacies dataset（挪威北海公开井）',
    'url': 'https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition',
    'licenses': {
        'curves': 'NLOD 2.0 (Norwegian Licence for Open Government Data)',
        'labels': 'CC BY 4.0 (Zenodo record 4351156)',
    },
    'retrievedAt': '2026-10-25',
    'files': [
        {'name': 'train.zip (lithology_competition/data/train.zip)',
         'sha256': 'e996c8466f2d0dc7116daa71485cc90c31fcfac6345a5bb33165026478b642e9'},
        {'name': 'train.csv (train.zip 内解压)',
         'sha256': 'f72eaa9d4d30b0990b553333baaac7d129f2a2c5bce96fd580b31592658641da'},
    ],
    'citation': ('Bormann P., Aursand P., Dilib F., Dischington P., Manral S. 2020. '
                 'FORCE Machine Learning Competition. '
                 'https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition'),
    'modification': ('按观测覆盖与连续性截窗，再按固定哈希选井拆分；按训练标签规则合并/排除岩性编码。'
                     '曲线保存四位小数、深度三位小数；保留原始采样间隔，未插补、未重采样。'),
}


# --------------------------------------------------------------------------
# 读取
# --------------------------------------------------------------------------
def to_float(text):
    if text is None:
        return None
    text = text.strip()
    if not text or text.lower() in ('nan', 'na', 'null', '-999.25', '-999.0', '-999'):
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if value != value or value in (float('inf'), float('-inf')):
        return None
    return value


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def load(csv_path):
    """读一遍原始 CSV，返回 (wells, header)。井内保持原始行序。"""
    wells = {}
    with open(csv_path, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh, delimiter=CSV_DELIM)
        header = next(reader)
        index = {name: i for i, name in enumerate(header)}
        need = [DEPTH_COLUMN, WELL_COLUMN, LITH_COLUMN] + [c for _, c, _ in CURVE_COLUMNS]
        missing = [n for n in need if n not in index]
        if missing:
            raise SystemExit('缺少必需列：' + ', '.join(missing))
        i_well, i_depth, i_lith = index[WELL_COLUMN], index[DEPTH_COLUMN], index[LITH_COLUMN]
        i_curves = [(key, index[col]) for key, col, _ in CURVE_COLUMNS]

        for row in reader:
            if not row or len(row) <= i_depth:
                continue
            well = row[i_well].strip()
            if not well:
                continue
            depth = to_float(row[i_depth])
            if depth is None:
                continue
            bucket = wells.get(well)
            if bucket is None:
                bucket = wells[well] = {
                    'depth': [],
                    'curves': {k: [] for k, _, _ in CURVE_COLUMNS},
                    'lith': [],
                }
            bucket['depth'].append(depth)
            for key, col in i_curves:
                bucket['curves'][key].append(to_float(row[col]))
            lith = to_float(row[i_lith])
            bucket['lith'].append(int(lith) if lith is not None else None)
    return wells, header


def modal_step(depths):
    diffs = []
    for i in range(1, len(depths)):
        d = round(depths[i] - depths[i - 1], 3)
        if d > 0:
            diffs.append(d)
    if not diffs:
        return None
    return Counter(diffs).most_common(1)[0][0]


def _prefix(values):
    out = [0.0] * (len(values) + 1)
    acc = 0.0
    for i, v in enumerate(values):
        acc += v
        out[i + 1] = acc
    return out


def _prefix_int(flags):
    out = [0] * (len(flags) + 1)
    for i, v in enumerate(flags):
        out[i + 1] = out[i] + (1 if v else 0)
    return out


# --------------------------------------------------------------------------
# 第 2 步：全井观测可用性判定与选窗（只读 depth 与 curves，不读 lith）
# --------------------------------------------------------------------------
def screen_wells(wells, window=DEFAULT_WINDOW):
    """观测可用性判定 + 选窗。对全部井跑，只读 depth 与 curves，绝不读 lith。

    窗口规则（train 与 holdout 完全相同，事先固定）：
      1) 窗内不允许任何采样断点，且 GR 全部有效；
      2) RHOB / NPHI / RDEP 覆盖率各自 ≥ MIN_CURVE_COVERAGE；
      3) 排序键：最低覆盖率高 → 窗内 GR 标准差大 → 深度浅。
    """
    candidates, rejected = [], []
    for well in sorted(wells):
        data = wells[well]
        depth = data['depth']
        n = len(depth)
        if n < window:
            rejected.append({'well': well, 'reason': '样本数 %d < 窗长 %d' % (n, window)})
            continue
        step = modal_step(depth)
        if step is None:
            rejected.append({'well': well, 'reason': '无有效正间隔'})
            continue
        gr = data['curves']['gr_api']

        breaks = [True] * n
        for i in range(1, n):
            breaks[i] = gr[i] is None or abs((depth[i] - depth[i - 1]) - step) > STEP_TOL
        br = _prefix_int(breaks)

        grf = [0.0 if v is None else v for v in gr]
        p1, p2 = _prefix(grf), _prefix([v * v for v in grf])
        covs = {k: _prefix_int([data['curves'][k][i] is not None for i in range(n)])
                for k, _, _ in CURVE_COLUMNS if k != 'gr_api'}

        best, best_key = None, None
        for i in range(0, n - window + 1):
            if br[i + window] - br[i] != 0 or breaks[i]:
                continue
            cover = {k: (pref[i + window] - pref[i]) / window for k, pref in covs.items()}
            min_cov = min(cover.values())
            if min_cov < MIN_CURVE_COVERAGE:
                continue
            mean = (p1[i + window] - p1[i]) / window
            var = max(0.0, (p2[i + window] - p2[i]) / window - mean * mean)
            key = (round(min_cov, 6), round(var ** 0.5, 6), -depth[i])
            if best_key is None or key > best_key:
                best, best_key = (i, i + window), key
        if best is None:
            rejected.append({'well': well, 'reason': '窗内无“连续 + 曲线覆盖达标”的 500 点区段'})
            continue
        candidates.append({
            'well': well, 'step': step, 'start': best[0], 'end': best[1], 'n': n,
            'min_coverage': best_key[0], 'gr_std': best_key[1],
            'depth_from': round(depth[best[0]], 3), 'depth_to': round(depth[best[1] - 1], 3),
        })
    return candidates, rejected


# --------------------------------------------------------------------------
# 第 3 步：井级拆分（只用井名与固定种子，与标签、与结果无关）
# --------------------------------------------------------------------------
def well_hash(well, seed=SPLIT_SEED):
    return hashlib.sha256((seed + '|' + well).encode('utf-8')).hexdigest()


def split_wells(candidates, n_wells=DEFAULT_WELLS, train_count=TRAIN_COUNT):
    """按稳定哈希排序取前 n 口；这个顺序同时决定拆分。与标签、与结果无关。"""
    if n_wells != train_count + 2:
        raise SystemExit('本脚本假定 4 训 1 验 1 测；如需改动请同步修改拆分规则')
    ordered = sorted(candidates, key=lambda c: well_hash(c['well']))
    chosen = ordered[:n_wells]
    split = {'train': [], 'validation': [], 'test': []}
    for i, item in enumerate(chosen):
        item['split'] = 'train' if i < train_count else ('validation' if i == train_count else 'test')
        split[item['split']].append(item['well'])
    return chosen, split


# --------------------------------------------------------------------------
# 第 4 步：类别规则（只读训练井窗口内的标签）
# --------------------------------------------------------------------------
def class_rule(wells, chosen, split, threshold=MIN_TRAIN_SHARE):
    counts = Counter()
    for item in chosen:
        if item['well'] not in split['train']:
            continue
        data = wells[item['well']]
        for raw in data['lith'][item['start']:item['end']]:
            if raw is None:
                continue
            counts[MERGE_INTO.get(raw, raw)] += 1
    total = sum(counts.values()) or 1
    keep = {code for code, n in counts.items() if n / total >= threshold and code not in EXCLUDE}
    return {
        'classSet': sorted(keep),
        'keep': keep,
        'shares': {str(c): round(n / total, 5) for c, n in sorted(counts.items())},
        'labelledSamples': sum(counts.values()),
    }


# --------------------------------------------------------------------------
# 第 5 步：写样本
# --------------------------------------------------------------------------
def well_slug(well):
    return well.lower().replace(' ', '-').replace('/', '-')


def build_entry(wells, well, item, class_set, window_index=1):
    data = wells[well]
    idx = range(item['start'], item['end'])
    curves = {}
    for key, _, _ in CURVE_COLUMNS:
        curves[key] = [None if data['curves'][key][i] is None else round(data['curves'][key][i], 4)
                       for i in idx]
    original, mapped, names = [], [], []
    for i in idx:
        raw = data['lith'][i]
        original.append(raw)                                  # 原始编码：含被排除的类，永不改写
        merged = MERGE_INTO.get(raw, raw) if raw is not None else None
        code = merged if merged in class_set else None
        mapped.append(code)                                   # 映射编码：合并/过滤后的模型类
        names.append(DISPLAY_NAME.get(code) if code is not None else None)
    return {
        'schemaVersion': '1.0',
        'id': 'force-%s-w%02d' % (well_slug(well), window_index),
        'wellId': well,
        'depth_m': [round(data['depth'][i], 3) for i in idx],
        'curves': curves,
        'units': {k: unit for k, _, unit in CURVE_COLUMNS},
        'source': SOURCE,
        'lithology': names,
        'originalLithologyCode': original,
        'mappedLithologyCode': mapped,
        'originalDepthStep_m': item['step'],
    }


def build_batch(wells, chosen, split, rule, window=DEFAULT_WINDOW):
    return {
        'schemaVersion': '1.0',
        'purpose': 'evaluation',
        'selectionPolicy': {
            'version': POLICY_VERSION,
            'usesHoldoutLabels': False,
            'splitSeed': SPLIT_SEED,
            'windowPoints': window,
            'wellOrder': 'sha256(splitSeed + "|" + wellId) 升序；前 %d 口，其顺序即拆分顺序' % len(chosen),
            'windowRule': ('窗内无采样断点且 GR 全有效；RHOB/NPHI/RDEP 覆盖率各 ≥ %.2f；'
                           '排序键＝最低覆盖率高 → 窗内 GR 标准差大 → 深度浅；全程不读标签'
                           % MIN_CURVE_COVERAGE),
            'classRule': ('只统计训练井窗内标签：白垩 70032 并入石灰岩 70000；'
                          '岩盐/硬石膏/凝灰岩/煤/基底排除；占比 < %.0f%% 的类不建独立标签'
                          % (MIN_TRAIN_SHARE * 100)),
            'split': ('哈希序前 %d 口训练、第 %d 口验证、第 %d 口测试；同井不跨组'
                      % (TRAIN_COUNT, TRAIN_COUNT + 1, TRAIN_COUNT + 2)),
        },
        'source': SOURCE,
        'split': split,
        'wells': [build_entry(wells, item['well'], item, rule['keep']) for item in chosen],
    }


def pipeline(wells, window=DEFAULT_WINDOW, n_wells=DEFAULT_WELLS, label_override=None):
    """完整流程。label_override(well, lith) -> lith 只用于置乱检查。"""
    if label_override is not None:
        wells = {w: {'depth': d['depth'], 'curves': d['curves'],
                     'lith': label_override(w, d['lith'])} for w, d in wells.items()}
    candidates, rejected = screen_wells(wells, window)
    chosen, split = split_wells(candidates, n_wells)
    rule = class_rule(wells, chosen, split)
    batch = build_batch(wells, chosen, split, rule, window)
    return {'candidates': candidates, 'rejected': rejected, 'chosen': chosen,
            'split': split, 'rule': rule, 'batch': batch}


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='data/raw/train.csv')
    ap.add_argument('--out', default='data')
    ap.add_argument('--wells', type=int, default=DEFAULT_WELLS)
    ap.add_argument('--window', type=int, default=DEFAULT_WINDOW)
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        raise SystemExit('找不到原始数据：' + args.csv)

    print('[1/5] 读取原始 CSV …', flush=True)
    wells, header = load(args.csv)
    print('      %d 口井 / %d 行' % (len(wells), sum(len(v['depth']) for v in wells.values())))

    print('[2/5] 全井观测可用性判定与选窗（只读 depth 与 curves，不看标签）…', flush=True)
    candidates, rejected = screen_wells(wells, args.window)
    print('      可用井 %d 口，因观测条件剔除 %d 口' % (len(candidates), len(rejected)))

    print('[3/5] 井级哈希拆分（种子固定，与标签无关）…', flush=True)
    chosen, split = split_wells(candidates, args.wells)
    print('      入选 %d 口：4 训 / 1 验 / 1 测' % len(chosen))
    for item in chosen:
        print('      %-12s %-10s %.1f–%.1f m  cov=%.2f  GRstd=%.1f'
              % (item['well'], item['split'], item['depth_from'], item['depth_to'],
                 item['min_coverage'], item['gr_std']))

    print('[4/5] 只用训练井确定类别 …', flush=True)
    rule = class_rule(wells, chosen, split)
    print('      训练窗内标注样本 %d；保留 %d 类：%s' % (
        rule['labelledSamples'], len(rule['classSet']),
        '、'.join('%s(%d) %.1f%%' % (DISPLAY_NAME[c], c, rule['shares'].get(str(c), 0) * 100)
                 for c in rule['classSet']) or '（无）'))
    dropped = [c for c in rule['shares'] if int(c) not in rule['keep']]
    if dropped:
        print('      不建独立标签：' + '、'.join('%s(%s) %.1f%%' % (
            DISPLAY_NAME.get(int(c), c), c, rule['shares'][c] * 100) for c in dropped))

    print('[5/5] 写出样本（曲线四位小数、深度三位小数）…', flush=True)
    batch = build_batch(wells, chosen, split, rule, args.window)
    os.makedirs(os.path.join(args.out, 'processed'), exist_ok=True)
    os.makedirs(os.path.join(args.out, 'research'), exist_ok=True)
    with open(os.path.join(args.out, 'processed', 'force-demo-v2.json'), 'w', encoding='utf-8') as fh:
        json.dump(batch, fh, ensure_ascii=False, indent=1)

    chosen_map = {c['well']: c for c in chosen}
    rows = []
    for well in sorted(wells):
        data = wells[well]
        depth = data['depth']
        item = chosen_map.get(well)
        row = {
            'well': well,
            'split': item['split'] if item else None,
            'samples': len(depth),
            'depth_min_m': round(min(depth), 3),
            'depth_max_m': round(max(depth), 3),
            'native_step_m': modal_step(depth),
            'curves_present': {k: sum(1 for v in data['curves'][k] if v is not None)
                               for k, _, _ in CURVE_COLUMNS},
            'missing_rate': {k: round(1 - sum(1 for v in data['curves'][k] if v is not None) / len(depth), 4)
                             for k, _, _ in CURVE_COLUMNS},
            # 全井标签计数只是目录信息，不参与任何选择
            'lithology_counts_global': {str(k): v for k, v in sorted(
                Counter(v for v in data['lith'] if v is not None).items())},
            'window': None,
        }
        if item:
            counts = Counter(v for v in data['lith'][item['start']:item['end']] if v is not None)
            row['window'] = {
                'start_index': item['start'], 'end_index': item['end'],
                'points': item['end'] - item['start'],
                'depth_from_m': item['depth_from'], 'depth_to_m': item['depth_to'],
                'min_coverage': item['min_coverage'], 'gr_std': item['gr_std'],
                'original_lith_counts': {str(k): v for k, v in sorted(counts.items())},
            }
        rows.append(row)

    catalog = {
        'schemaVersion': '1.0',
        'generated_by': 'tools/data/extract_force.py',
        'policyVersion': POLICY_VERSION,
        'source': {
            'file': os.path.relpath(args.csv).replace('\\', '/'),
            'sha256': sha256_file(args.csv),
            'columns': header,
            'delimiter': CSV_DELIM,
            'wells': len(wells),
            'rows': sum(len(v['depth']) for v in wells.values()),
            'retrievedAt': SOURCE['retrievedAt'],
            'licenses': SOURCE['licenses'],
            'url': SOURCE['url'],
        },
        'selection': {
            'splitSeed': SPLIT_SEED,
            'windowPoints': args.window,
            'minCurveCoverage': MIN_CURVE_COVERAGE,
            'eligibleWells': len(candidates),
            'rejectedCount': len(rejected),
            'chosen': [{'well': c['well'], 'split': c['split'], 'start_index': c['start'],
                        'end_index': c['end'], 'depth_from_m': c['depth_from'],
                        'depth_to_m': c['depth_to'], 'native_step_m': c['step'],
                        'min_coverage': c['min_coverage'], 'gr_std': c['gr_std']}
                       for c in chosen],
            'classRule': {'kept': rule['classSet'], 'shares': rule['shares'],
                          'labelledSamples': rule['labelledSamples'],
                          'minShare': MIN_TRAIN_SHARE},
        },
        'wells': rows,
    }
    with open(os.path.join(args.out, 'research', 'catalog.json'), 'w', encoding='utf-8') as fh:
        json.dump(catalog, fh, ensure_ascii=False, indent=1)

    mapping = []
    for code in sorted(DISPLAY_NAME):
        merged = MERGE_INTO.get(code, code)
        if code in rule['keep']:
            status = 'kept'
        elif code in MERGE_INTO and merged in rule['keep']:
            status = 'merged'
        elif code in EXCLUDE:
            status = 'excluded'
        else:
            status = 'below_threshold'
        mapping.append({
            'code': code,
            'raw_name': DISPLAY_NAME[code],
            'mapped_code': merged if status in ('kept', 'merged') else None,
            'mapped_name': DISPLAY_NAME.get(merged) if status in ('kept', 'merged') else None,
            'status': status,
            'train_share': rule['shares'].get(str(code), 0.0),
        })
    lith_map = {
        'schemaVersion': '1.0',
        'source_column': LITH_COLUMN,
        'policyVersion': POLICY_VERSION,
        'classes': [{'code': c, 'name': DISPLAY_NAME[c]} for c in rule['classSet']],
        'mapping': mapping,
        'merge_rule': {str(k): v for k, v in MERGE_INTO.items()},
        'excluded': {str(k): v for k, v in EXCLUDE.items()},
        'min_train_share': MIN_TRAIN_SHARE,
        'computed_from': '训练井窗口内标签（split.train = %s）' % ', '.join(split['train']),
        'notes': [
            'originalLithologyCode 始终是数据源中的原始编码，被合并或被排除的类也照原样保留。',
            'mappedLithologyCode 是合并/过滤后的模型编码；null 表示该类不进入模型，不是原始缺失。',
            'lithology 是 mappedLithologyCode 的中文展示名；mapped 为 null 时 lithology 也为 null。',
            '白垩 (70032) 与石灰岩 (70000) 映射到同一模型类，但两者原始编码保持不同。',
            '岩性标签不是地层界面真值，不用于 w1 分层评价；NPHI 不是实测孔隙度真值。',
        ],
    }
    with open(os.path.join(args.out, 'research', 'lithology-map.json'), 'w', encoding='utf-8') as fh:
        json.dump(lith_map, fh, ensure_ascii=False, indent=1)

    points = sum(len(w['depth_m']) for w in batch['wells'])
    print('      完成：%d 井 / %d 点' % (len(batch['wells']), points))
    print('      train=%s' % split['train'])
    print('      validation=%s' % split['validation'])
    print('      test=%s' % split['test'])
    holes = sorted({(w['wellId'], k) for w in batch['wells'] for k, s in w['curves'].items()
                    if any(v is None for v in s)})
    print('      含缺失的曲线：%s' % (holes or '无'))
    unknown = sorted({(w['wellId'], c) for w in batch['wells']
                      for c in w['originalLithologyCode'] if c is not None
                      and c not in rule['keep']})
    print('      含未映射原始编码（写进 original，不进模型）的井：%s'
          % (sorted({w for w, _ in unknown}) or '无'))


if __name__ == '__main__':
    main()
