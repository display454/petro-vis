/* Pure reconstruction kernel. Repair accepts only the redacted visible dataset. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WelllogRepairCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var FEATURES = ['rhob_g_cm3', 'nphi_vv', 'rdep_ohm_m'];
  function check(ok, message) { if (!ok) throw new Error(message); }
  function features(dataset) {
    FEATURES.forEach(function (key) { check(dataset.curves[key] && dataset.curves[key].length === dataset.depth_m.length, '缺少或错位的曲线：' + key); });
    return dataset.depth_m.map(function (_, i) {
      var row = FEATURES.map(function (key) {
        var v = dataset.curves[key][i];
        return !Number.isFinite(v) || (key === 'rdep_ohm_m' && v <= 0) ? null : (key === 'rdep_ohm_m' ? Math.log10(v) : v);
      });
      return row.some(function (v) { return v === null; }) ? null : row;
    });
  }
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function runs(kinds, onlyMasked) {
    var out = [], i = 0;
    while (i < kinds.length) {
      var start = i, kind = kinds[i];
      while (i < kinds.length && kinds[i] === kind) i++;
      if (kind !== 'observed' && (!onlyMasked || kind === 'masked')) out.push({id: kind + '-' + start, start: start, end: i, kind: kind});
    }
    return out;
  }
  function makeMask(dataset, options) {
    options = options || {};
    var curve = options.curve || 'gr_api', ratio = options.ratio === undefined ? 0.15 : options.ratio;
    var seed = String(options.seed === undefined ? 'r03-w5-01' : options.seed);
    var block = options.blockSamples === undefined ? 15 : options.blockSamples;
    check(curve === 'gr_api', '本轮只修复 GR');
    check(Number.isFinite(ratio) && ratio >= 0 && ratio <= 0.4, '遮挡比例必须在 0—0.4');
    check(Number.isInteger(block) && block > 0, '遮挡块长必须为正整数');
    var truth = dataset.curves[curve], n = dataset.depth_m.length;
    check(truth && truth.length === n && dataset.depth_m.every(function (d, i) { return Number.isFinite(d) && (!i || d > dataset.depth_m[i - 1]); }), '曲线长度或深度无效');
    var observed = truth.map(Number.isFinite), eligible = observed.filter(Boolean).length, blocks = [];
    // Leave both ends of each observed run visible, with one visible anchor between blocks.
    var i = 0;
    while (i < n) {
      if (!observed[i]) { i++; continue; }
      var start = i;
      while (i < n && observed[i]) i++;
      for (var s = start + 1; s < i - 1; s += block + 1) {
        blocks.push({start: s, end: Math.min(s + block, i - 1), order: hash(seed + '|' + dataset.wellId + '|' + s)});
      }
    }
    blocks.sort(function (a, b) { return a.order - b.order || a.start - b.start; });
    var wanted = Math.floor(eligible * ratio), flags = Array(n).fill(false), remaining = wanted;
    blocks.forEach(function (b) {
      for (var j = b.start; j < b.end && remaining > 0; j++) { flags[j] = true; remaining--; }
    });
    var gapKind = observed.map(function (ok, j) { return !ok ? 'genuine' : (flags[j] ? 'masked' : 'observed'); });
    var curves = {};
    Object.keys(dataset.curves).forEach(function (key) { curves[key] = dataset.curves[key].slice(); });
    curves[curve] = truth.map(function (v, j) { return flags[j] || !Number.isFinite(v) ? null : v; });
    // Do not copy any lithology/reference arrays into model input.
    var visible = {schemaVersion: dataset.schemaVersion, id: dataset.id, wellId: dataset.wellId,
      depth_m: dataset.depth_m.slice(), curves: curves, units: dataset.units, source: dataset.source};
    return {curve: curve, flags: flags, gapKind: gapKind, gaps: runs(gapKind, true), regions: runs(gapKind, false),
      visible: visible, seed: seed, blockSamples: block, requestedRatio: ratio, eligible: eligible,
      masked: wanted - remaining, actualRatio: eligible ? (wanted - remaining) / eligible : 0};
  }
  function solve(matrix, rhs) {
    var a = matrix.map(function (row, i) { return row.concat(rhs[i]); }), n = rhs.length;
    for (var i = 0; i < n; i++) {
      var pivot = i;
      for (var r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
      check(Math.abs(a[pivot][i]) > 1e-12, '岭回归方程奇异');
      var tmp = a[i]; a[i] = a[pivot]; a[pivot] = tmp;
      var div = a[i][i];
      for (var c = i; c <= n; c++) a[i][c] /= div;
      for (var rr = 0; rr < n; rr++) if (rr !== i) {
        var factor = a[rr][i];
        for (var cc = i; cc <= n; cc++) a[rr][cc] -= factor * a[i][cc];
      }
    }
    return a.map(function (row) { return row[n]; });
  }
  function fitRepair(trainWells, options) {
    options = options || {};
    var lambda = options.lambda === undefined ? 0.1 : options.lambda;
    check(Number.isFinite(lambda) && lambda > 0, 'lambda 必须大于 0');
    var x = [], y = [];
    trainWells.forEach(function (well) {
      var rows = features(well), target = well.curves.gr_api;
      check(target && target.length === rows.length, '训练 GR 缺失或错位');
      rows.forEach(function (row, i) { if (row && Number.isFinite(target[i])) { x.push(row); y.push(target[i]); } });
    });
    check(x.length > 0, '没有可用的修复训练样本');
    var transforms = FEATURES.map(function (key, j) {
      var mean = x.reduce(function (s, row) { return s + row[j]; }, 0) / x.length;
      var variance = x.reduce(function (s, row) { return s + Math.pow(row[j] - mean, 2); }, 0) / x.length;
      return {key: key, mean: mean, std: Math.sqrt(variance) || 1, log10: key === 'rdep_ohm_m'};
    });
    var targetMean = y.reduce(function (s, v) { return s + v; }, 0) / y.length;
    var gram = Array.from({length: 3}, function () { return [0, 0, 0]; }), rhs = [0, 0, 0];
    x.forEach(function (row, i) {
      var z = row.map(function (v, j) { return (v - transforms[j].mean) / transforms[j].std; });
      for (var j = 0; j < 3; j++) {
        rhs[j] += z[j] * (y[i] - targetMean) / x.length;
        for (var k = 0; k < 3; k++) gram[j][k] += z[j] * z[k] / x.length;
      }
    });
    for (var j = 0; j < 3; j++) gram[j][j] += lambda;
    return {version: '1.0.0', target: 'gr_api', featureKeys: FEATURES.slice(), transforms: transforms,
      targetMean: targetMean, coefficients: solve(gram, rhs), lambda: lambda,
      trainingSamples: x.length, trainingWellIds: trainWells.map(function (w) { return w.wellId; })};
  }
  function repairCurve(visible, mask, options) {
    options = options || {};
    var method = options.method || 'linear', target = visible.curves.gr_api, depth = visible.depth_m, n = depth.length;
    check(target && target.length === n && mask.flags.length === n && mask.gapKind.length === n, '修复输入数组错位');
    for (var i = 0; i < n; i++) check(!mask.flags[i] || target[i] === null, '修复输入仍含遮挡真值');
    var filled = target.slice(), params;
    if (method === 'linear') {
      var at = 0;
      while (at < n) {
        if (Number.isFinite(target[at])) { at++; continue; }
        var start = at;
        while (at < n && !Number.isFinite(target[at])) at++;
        if (start === 0 || at === n) continue; // No extrapolation at either edge.
        for (var j = start; j < at; j++) filled[j] = target[start - 1] +
          (target[at] - target[start - 1]) * (depth[j] - depth[start - 1]) / (depth[at] - depth[start - 1]);
      }
      params = {interpolation: 'depth-linear; visible endpoints only', extrapolation: false};
    } else if (method === 'ridge') {
      var model = options.model;
      check(model && model.target === 'gr_api', '需要训练好的 GR 岭回归模型');
      var rows = features(visible);
      rows.forEach(function (row, i) {
        if (!Number.isFinite(target[i])) filled[i] = row ? model.targetMean + row.reduce(function (s, v, j) {
          return s + model.coefficients[j] * (v - model.transforms[j].mean) / model.transforms[j].std;
        }, 0) : null;
      });
      params = {lambda: model.lambda, trainingWellIds: model.trainingWellIds.slice(), featureKeys: model.featureKeys.slice()};
    } else throw new Error('未知修复方法：' + method);
    return {filled: filled, method: method, params: params};
  }
  function evaluateRepair(truth, predicted, flags) {
    check(truth.length === predicted.length && truth.length === flags.length, '评价数组长度不同');
    var ids = [], masked = 0;
    flags.forEach(function (flag, i) {
      if (flag && Number.isFinite(truth[i])) { masked++; if (Number.isFinite(predicted[i])) ids.push(i); }
    });
    if (!ids.length) return {mae: null, rmse: null, r2: null, n: 0, masked: masked, coverage: masked ? 0 : null};
    var mean = ids.reduce(function (s, i) { return s + truth[i]; }, 0) / ids.length, sae = 0, sse = 0, sst = 0;
    ids.forEach(function (i) { var e = predicted[i] - truth[i]; sae += Math.abs(e); sse += e * e; sst += Math.pow(truth[i] - mean, 2); });
    return {mae: sae / ids.length, rmse: Math.sqrt(sse / ids.length), r2: sst > 1e-12 ? 1 - sse / sst : null,
      n: ids.length, masked: masked, coverage: ids.length / masked};
  }
  function compareRepairs(truth, a, b, flags) {
    check(truth.length === a.length && a.length === b.length && b.length === flags.length, '比较数组长度不同');
    var common = flags.map(function (f, i) { return !!f && Number.isFinite(truth[i]) && Number.isFinite(a[i]) && Number.isFinite(b[i]); });
    var aBetter = 0, bBetter = 0, tied = 0;
    common.forEach(function (f, i) { if (f) {
      var delta = Math.abs(a[i] - truth[i]) - Math.abs(b[i] - truth[i]);
      if (Math.abs(delta) < 1e-10) tied++; else if (delta < 0) aBetter++; else bBetter++;
    } });
    return {a: evaluateRepair(truth, a, common), b: evaluateRepair(truth, b, common),
      common: common.filter(Boolean).length, aBetter: aBetter, bBetter: bBetter, tied: tied};
  }
  return {version: '1.0.0', makeMask: makeMask, fitRepair: fitRepair, repairCurve: repairCurve,
    evaluateRepair: evaluateRepair, compareRepairs: compareRepairs};
});
