#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""force-demo-v2 的可重跑检查：结构、编码溯源、以及 holdout 标签置乱对照。

检查分四组：

  A 结构     井级互斥、拆分规模 4/1/1、数组等长、深度严格递增、窗口连续、
             窗口为 500 点、每井都有已知参考点、训练窗覆盖全部保留类
  B 溯源     original / mapped / lithology 三者一致；被排除类的原始编码不丢；
             类集合按 mapped 非 null 比较（不把合并前的 70032 判为类外）；保存精度措辞
  C 合并     70032 与 70000 映射到同一模型类，但原始编码保持不同（含内存 fixture）
  D 置乱     替换或打乱 holdout 标签后重跑：井清单、窗口、曲线、训练类别规则必须不变；
             只改训练标签时，拆分与窗口仍不变、类别规则可以变
  E 重现     用源 CSV 重跑一遍，与已写出的批次逐井逐点比 split / id / 深度 /
             四条曲线 / 原始编码 / 映射编码 / 展示名

用法（项目根目录，需要 data/raw/train.csv，不重新下载）：
    python tools/data/check_force_v2.py --csv data/raw/train.csv \
        --batch data/processed/force-demo-v2.json
退出码 0 表示全部通过；任何一项失败打印 FAIL 并返回 1。
"""

import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract_force as ex   # noqa: E402


class Report:
    def __init__(self):
        self.failed = 0
        self.passed = 0

    def check(self, ok, label, detail=''):
        if ok:
            self.passed += 1
            print('  PASS  %s%s' % (label, ('  — ' + detail) if detail else ''))
        else:
            self.failed += 1
            print('  FAIL  %s%s' % (label, ('  — ' + detail) if detail else ''))

    def head(self, text):
        print('\n' + text)


def load_batch(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def structure_checks(rep, batch, class_set):
    rep.head('[A] 结构')
    wells = batch['wells']
    split = batch['split']
    win = batch['selectionPolicy']['windowPoints']
    rep.check(len(wells) == 6, '样本井数 = 6', '实际 %d' % len(wells))

    all_names = split['train'] + split['validation'] + split['test']
    rep.check(len(all_names) == len(set(all_names)), '拆分三组井名互斥',
              'train=%s | val=%s | test=%s' % (split['train'], split['validation'], split['test']))
    rep.check(set(w['wellId'] for w in wells) == set(all_names), '样本井与拆分清单一致')
    sizes = [len(split['train']), len(split['validation']), len(split['test'])]
    rep.check(sizes == [4, 1, 1], '拆分规模 4 训 / 1 验 / 1 测',
              '实际 %d/%d/%d' % tuple(sizes))

    ids = [w['id'] for w in wells]
    rep.check(len(ids) == len(set(ids)), 'id 唯一', ids[0])
    rep.check(all('w01' in i for i in ids), 'id 含窗口序号')

    for w in wells:
        n = len(w['depth_m'])
        same = all(len(w['curves'][k]) == n for k in ('gr_api', 'rhob_g_cm3', 'nphi_vv', 'rdep_ohm_m'))
        rep.check(same, '%s 曲线与深度等长' % w['wellId'], 'n=%d' % n)
        for key in ('lithology', 'originalLithologyCode', 'mappedLithologyCode'):
            if len(w[key]) != n:
                rep.check(False, '%s %s 长度' % (w['wellId'], key), '%d != %d' % (len(w[key]), n))
        rep.check(all(w['depth_m'][i] > w['depth_m'][i - 1] for i in range(1, n)),
                  '%s 深度严格递增' % w['wellId'])
        diffs = {round(w['depth_m'][i] - w['depth_m'][i - 1], 3) for i in range(1, n)}
        rep.check(diffs == {round(w['originalDepthStep_m'], 3)},
                  '%s 窗口连续（单一原始间隔）' % w['wellId'],
                  'step=%s diffs=%s' % (w['originalDepthStep_m'], sorted(diffs)))
        for key, series in w['curves'].items():
            bad = [v for v in series if v is not None and not isinstance(v, (int, float))]
            rep.check(not bad, '%s %s 非数值只以 null 表示' % (w['wellId'], key))

    # 样本覆盖：窗长一致、每组点数对得上、每井有可用参考点、训练窗撑得起类别集合
    lengths = [len(w['depth_m']) for w in wells]
    rep.check(all(n == win for n in lengths), '每井窗口 %d 点' % win, str(lengths))
    per_split = {k: sum(len(w['depth_m']) for w in wells if w['wellId'] in set(names))
                 for k, names in split.items()}
    rep.check(per_split['train'] == 4 * win and per_split['validation'] == win
              and per_split['test'] == win,
              '各拆分组点数 = 4×%d / 1×%d / 1×%d' % (win, win, win), str(per_split))
    known = {w['wellId']: sum(1 for c in w['mappedLithologyCode'] if c is not None) for w in wells}
    rep.check(all(n > 0 for n in known.values()), '每口井窗口内都有已知参考点',
              ', '.join('%s=%d' % (k, v) for k, v in known.items()))
    train_codes = {c for w in wells if w['wellId'] in set(split['train'])
                   for c in w['mappedLithologyCode'] if c is not None}
    rep.check(train_codes == class_set, '训练窗覆盖全部保留类（类别集合不虚设）',
              '训练窗 %s vs 类别集合 %s' % (sorted(train_codes), sorted(class_set)))
    return wells


def trace_checks(rep, wells, class_set):
    rep.head('[B] 标签溯源')
    rep.check(all(isinstance(w.get('source', {}).get('licenses'), dict) for w in wells),
              'source.licenses 为对象')
    lic = wells[0]['source']['licenses']
    rep.check('NLOD' in lic.get('curves', ''), '曲线许可记录 NLOD 2.0', lic.get('curves'))
    rep.check('CC BY 4.0' in lic.get('labels', ''), '标签许可记录 CC BY 4.0', lic.get('labels'))
    rep.check(bool(wells[0]['source'].get('retrievedAt')), '记录获取日期',
              wells[0]['source'].get('retrievedAt'))
    rep.check(len(wells[0]['source'].get('files', [])) == 2, '记录原文件 SHA256')

    unknown_seen = 0
    for w in wells:
        pairs = list(zip(w['originalLithologyCode'], w['mappedLithologyCode'], w['lithology']))
        ok_map = True
        for raw, mapped, name in pairs:
            expect = ex.MERGE_INTO.get(raw, raw) if raw is not None else None
            if mapped is not None:
                if mapped != expect or mapped not in class_set:
                    ok_map = False
            elif raw is not None and expect in class_set:
                ok_map = False           # 本该保留却被置空
            if name != (ex.DISPLAY_NAME.get(mapped) if mapped is not None else None):
                ok_map = False
            if mapped is None and raw is not None:
                unknown_seen += 1
        rep.check(ok_map, '%s original→mapped→展示名 一致' % w['wellId'])

    rep.check(unknown_seen > 0, '存在被排除类：原始编码保留、映射为 null',
              '%d 个点（如泥灰岩/煤）' % unknown_seen)

    # 关键：这里比较 mapped 非 null 集合。原始 70032（白垩）本来就不在类集合里，
    # 它通过 MERGE_INTO 映射成 70000 后才进入模型；拿原始编码去比会把它误判为类外。
    kept_mapped = {mapped for w in wells for mapped in w['mappedLithologyCode'] if mapped is not None}
    rep.check(kept_mapped <= class_set, '映射后的编码都在训练类别集合内（比较 mapped 非 null）',
              'mapped=%s | 类集合=%s' % (sorted(kept_mapped), sorted(class_set)))
    merged_pts = [(raw, mapped) for w in wells
                  for raw, mapped in zip(w['originalLithologyCode'], w['mappedLithologyCode'])
                  if raw in ex.MERGE_INTO]
    rep.check(all(mapped == ex.MERGE_INTO[raw] and mapped in class_set for raw, mapped in merged_pts),
              '合并类原始编码按规则映射且不判为类外',
              '%d 点（70032 出现 %d 次）'
              % (len(merged_pts), sum(1 for r, _ in merged_pts if r == 70032)))

    mods = {w['source']['modification'] for w in wells}
    rep.check(len(mods) == 1, '六井 source.modification 文本一致')
    mod = mods.pop() if len(mods) == 1 else ''
    rep.check('四位小数' in mod and '三位小数' in mod,
              'source.modification 写明保存精度（四位/三位小数）', mod[:60] + '…')
    rep.check('未修改任何数值' not in mod and '未改任何数值' not in mod,
              'source.modification 不再声称“未改任何数值”')
    return kept_mapped


def merge_checks(rep, mapping):
    rep.head('[C] 合并规则（70032 → 70000）')
    by_code = {m['code']: m for m in mapping}
    rep.check(by_code[70032]['mapped_code'] == 70000, '70032 映射到 70000')
    rep.check(by_code[70000]['mapped_code'] == 70000, '70000 映射到自身')
    rep.check(by_code[70032]['mapped_code'] == by_code[70000]['mapped_code'],
              '两者映射后同类，但 code 字段仍分别是 70032 / 70000')
    rep.check(by_code[70032]['code'] != by_code[70000]['code'], '原始编码未被合并覆盖')

    # 内存 fixture：确认 build_entry 不动原始编码
    fixture = {
        'depth': [1000.0 + 0.152 * i for i in range(12)],
        'curves': {k: [10.0 + i for i in range(12)] for k, _, _ in ex.CURVE_COLUMNS},
        'lith': [70032, 70032, 70000, 88000, 88000, None,
                 65000, 65000, 70032, 65000, 65000, 65000],
    }
    entry = ex.build_entry({'FIX': fixture}, 'FIX',
                           {'start': 0, 'end': 12, 'step': 0.152}, {70000, 65000})
    rep.check(entry['originalLithologyCode'] == fixture['lith'],
              'fixture：originalLithologyCode 与源数据逐点相同', str(entry['originalLithologyCode']))
    rep.check(entry['mappedLithologyCode'] == [70000, 70000, 70000, None, None, None,
                                               65000, 65000, 70000, 65000, 65000, 65000],
              'fixture：只有映射字段被过滤', str(entry['mappedLithologyCode']))
    rep.check(entry['lithology'][3] is None and entry['lithology'][2] == '石灰岩',
              'fixture：展示名跟随映射字段')
    rep.check(70032 in entry['originalLithologyCode'] and 88000 in entry['originalLithologyCode'],
              'fixture：被合并与被排除的原始编码都还在')
    fixture_mapped = {c for c in entry['mappedLithologyCode'] if c is not None}
    rep.check(fixture_mapped <= {70000, 65000},
              'fixture：70032 的映射结果落在类集合内，不被当类外', str(sorted(fixture_mapped)))


def signature(result):
    """与标签无关的指纹：井顺序、窗口、深度、曲线。"""
    batch = result['batch']
    h = hashlib.sha256()
    h.update(json.dumps(batch['split'], sort_keys=True).encode())
    for w in batch['wells']:
        h.update(w['wellId'].encode())
        h.update(json.dumps(w['depth_m']).encode())
        h.update(json.dumps(w['curves'], sort_keys=True).encode())
    return h.hexdigest()


def scramble_checks(rep, wells_in, base):
    rep.head('[D] holdout 标签置乱对照')
    holdout = set(base['split']['validation']) | set(base['split']['test'])
    train = set(base['split']['train'])

    def const(replace_with):
        def fn(well, lith):
            return [replace_with] * len(lith) if well in holdout else list(lith)
        return fn

    def seed_shuffle(well, lith):
        if well not in holdout:
            return list(lith)
        codes = [c for c in lith if c is not None]
        order = sorted(range(len(codes)),
                       key=lambda i: hashlib.sha256(('shuffle|%s|%d' % (well, i)).encode()).hexdigest())
        shuffled = [codes[i] for i in order]
        it = iter(shuffled)
        return [next(it) if c is not None else None for c in lith]

    base_sig = signature(base)
    base_wells = sorted(w['wellId'] for w in base['batch']['wells'])
    base_class = set(base['rule']['classSet'])

    print('  基准：split=%s' % base['split'])
    print('        训练类别=%s' % sorted(base_class))

    # D1 holdout 标签全部改成被排除的 88000
    r1 = ex.pipeline(wells_in, label_override=const(88000))
    rep.check(signature(r1) == base_sig, 'D1 holdout 全部改 88000 → 井/窗口/深度/曲线不变')
    rep.check(sorted(w['wellId'] for w in r1['batch']['wells']) == base_wells, 'D1 井清单不变')
    rep.check(set(r1['rule']['classSet']) == base_class, 'D1 训练类别集合不变',
              str(sorted(r1['rule']['classSet'])))
    r1_holdout_mapped = {w['wellId']: set(w['mappedLithologyCode'])
                         for w in r1['batch']['wells'] if w['wellId'] in holdout}
    rep.check(all(s == {None} for s in r1_holdout_mapped.values()),
              'D1 holdout 映射全部为 null（说明置乱生效）')

    # D2 holdout 标签确定性打乱
    r2 = ex.pipeline(wells_in, label_override=seed_shuffle)
    rep.check(signature(r2) == base_sig, 'D2 holdout 打乱 → 井/窗口/深度/曲线不变')
    rep.check(set(r2['rule']['classSet']) == base_class, 'D2 训练类别集合不变')
    changed = 0
    for w2 in r2['batch']['wells']:
        if w2['wellId'] not in holdout:
            continue
        w0 = [w for w in base['batch']['wells'] if w['wellId'] == w2['wellId']][0]
        changed += sum(1 for a, b in zip(w0['mappedLithologyCode'], w2['mappedLithologyCode']) if a != b)
    rep.check(changed > 0, 'D2 holdout 标签确实被打乱', '%d 个点的映射发生变化' % changed)

    # D3 只改训练标签：拆分与窗口仍不变，类别规则允许改变
    def train_const(well, lith):
        return [65000] * len(lith) if well in train else list(lith)
    r3 = ex.pipeline(wells_in, label_override=train_const)
    rep.check(signature(r3) == base_sig, 'D3 只改训练标签 → 井/窗口/深度/曲线不变')
    rep.check(set(r3['rule']['classSet']) != base_class,
              'D3 训练标签被替换后类别规则随之改变（说明规则只依赖训练标签）',
              '%s → %s' % (sorted(base_class), sorted(r3['rule']['classSet'])))
    return base_sig


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default='data/raw/train.csv')
    ap.add_argument('--batch', default='data/processed/force-demo-v2.json')
    ap.add_argument('--map', default='data/research/lithology-map.json')
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        raise SystemExit('找不到原始数据：' + args.csv + '（本检查不重新下载）')

    batch = load_batch(args.batch)
    with open(args.map, encoding='utf-8') as fh:
        mapping = json.load(fh)['mapping']
    class_set = set(m['code'] for m in mapping if m['status'] == 'kept')

    rep = Report()
    wells_doc = structure_checks(rep, batch, class_set)
    trace_checks(rep, wells_doc, class_set)
    merge_checks(rep, mapping)

    print('\n  读取 %s 以复跑选择流程（约 30 秒）…' % args.csv, flush=True)
    wells_in, _ = ex.load(args.csv)
    base = ex.pipeline(wells_in)

    # 重现比较：split / id / 深度 / 四条曲线 / 原始编码 / 映射编码 / 展示名，逐井逐点相等
    pairs = list(zip(base['batch']['wells'], batch['wells']))
    same_n = len(base['batch']['wells']) == len(batch['wells'])
    same_split = base['split'] == batch['split']
    same_ids = [w['id'] for w in base['batch']['wells']] == [w['id'] for w in batch['wells']]
    curve_keys = [k for k, _, _ in ex.CURVE_COLUMNS]
    same_curves = same_n and all(a['curves'].get(k) == b['curves'].get(k)
                                 for a, b in pairs for k in curve_keys)
    same_depth = same_n and all(a['depth_m'] == b['depth_m'] for a, b in pairs)
    same_orig = same_n and all(a['originalLithologyCode'] == b['originalLithologyCode']
                               for a, b in pairs)
    same_mapped = same_n and all(a['mappedLithologyCode'] == b['mappedLithologyCode']
                                 for a, b in pairs)
    same_disp = same_n and all(a['lithology'] == b['lithology'] for a, b in pairs)
    print('  复跑结果与已写出的批次是否一致：split=%s ids=%s depth=%s curves=%s orig=%s mapped=%s lith=%s'
          % (same_split, same_ids, same_depth, same_curves, same_orig, same_mapped, same_disp))
    rep.check(same_split, '重跑可复现 split')
    rep.check(same_ids and same_depth, '重跑可复现 id 与深度（逐井逐点）')
    rep.check(same_curves, '重跑可复现四条曲线（%s）' % '/'.join(curve_keys))
    rep.check(same_mapped and same_disp, '重跑可复现映射编码与展示名')
    rep.check(same_orig, '重跑可复现原始编码（含被排除/被合并的类）')

    scramble_checks(rep, wells_in, base)

    print('\n===== 结果：%d 项通过，%d 项失败 =====' % (rep.passed, rep.failed))
    return 1 if rep.failed else 0


if __name__ == '__main__':
    sys.exit(main())
