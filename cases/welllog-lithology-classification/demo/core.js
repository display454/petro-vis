/* Pure classification kernel. No DOM, labels are read only by fit/evaluation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WelllogLithologyCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT_FEATURES = ['gr_api', 'rhob_g_cm3', 'nphi_vv', 'rdep_ohm_m'];
  function check(ok, message) { if (!ok) throw new Error(message); }
  function rows(dataset, keys) {
    check(dataset && Array.isArray(dataset.depth_m), '缺少深度数组');
    var n = dataset.depth_m.length;
    keys.forEach(function (key) {
      check(dataset.curves[key] && dataset.curves[key].length === n, '缺少或错位的曲线：' + key);
    });
    return dataset.depth_m.map(function (_, i) {
      var row = keys.map(function (key) {
        var v = dataset.curves[key][i];
        return !Number.isFinite(v) || (key === 'rdep_ohm_m' && v <= 0) ? null :
          (key === 'rdep_ohm_m' ? Math.log10(v) : v);
      });
      return row.some(function (v) { return v === null; }) ? null : row;
    });
  }
  function fitLithology(trainWells, options) {
    options = options || {};
    var keys = (options.featureKeys || DEFAULT_FEATURES).slice();
    check(keys.length > 0 && new Set(keys).size === keys.length, '特征不能为空或重复');
    check(Array.isArray(trainWells) && trainWells.length > 0, '需要训练井');
    var samples = [], codes = [];
    trainWells.forEach(function (well) {
      var x = rows(well, keys), y = well.mappedLithologyCode;
      check(y && y.length === x.length, '训练岩性标签缺失或错位');
      x.forEach(function (row, i) {
        if (row && Number.isFinite(y[i])) { samples.push(row); codes.push(y[i]); }
      });
    });
    check(samples.length > 0, '没有可用的训练样本');
    var classCodes = Array.from(new Set(codes)).sort(function (a, b) { return a - b; });
    var transforms = keys.map(function (key, j) {
      var mean = samples.reduce(function (s, row) { return s + row[j]; }, 0) / samples.length;
      var variance = samples.reduce(function (s, row) { return s + Math.pow(row[j] - mean, 2); }, 0) / samples.length;
      return {key: key, mean: mean, std: Math.sqrt(variance) || 1, log10: key === 'rdep_ohm_m'};
    });
    var counts = classCodes.map(function (code) { return codes.filter(function (v) { return v === code; }).length; });
    var majorityIndex = counts.indexOf(Math.max.apply(null, counts));
    return {version: '1.0.0', featureKeys: keys, transforms: transforms, classCodes: classCodes,
      samples: samples.map(function (row) { return row.map(function (v, j) { return (v - transforms[j].mean) / transforms[j].std; }); }),
      codes: codes, classCounts: counts, majorityCode: classCodes[majorityIndex],
      trainingWellIds: trainWells.map(function (w) { return w.wellId; }), trainingSamples: samples.length};
  }
  function predictLithology(dataset, model, options) {
    options = options || {};
    var k = options.k === undefined ? 9 : options.k;
    check(Number.isInteger(k) && k > 0, 'k 必须为正整数');
    k = Math.min(k, model.samples.length);
    var votes = [], shares = [], predicted = rows(dataset, model.featureKeys).map(function (row) {
      if (!row) { votes.push(null); shares.push(null); return null; }
      var z = row.map(function (v, j) { return (v - model.transforms[j].mean) / model.transforms[j].std; });
      var distances = model.samples.map(function (sample, i) {
        return {index: i, distance: sample.reduce(function (s, v, j) { return s + Math.pow(v - z[j], 2); }, 0)};
      }).sort(function (a, b) { return a.distance - b.distance || a.index - b.index; }).slice(0, k);
      var count = model.classCodes.map(function () { return 0; });
      var totalDistance = count.slice();
      distances.forEach(function (d) {
        var ci = model.classCodes.indexOf(model.codes[d.index]);
        count[ci]++; totalDistance[ci] += d.distance;
      });
      var winner = 0;
      count.forEach(function (c, i) {
        if (c > count[winner] || (c === count[winner] && totalDistance[i] < totalDistance[winner])) winner = i;
      });
      votes.push(count.map(function (c) { return c / k; })); shares.push(count[winner] / k);
      return model.classCodes[winner];
    });
    return {predictedCode: predicted, classCodes: model.classCodes.slice(), voteFractions: votes,
      topVoteShare: shares, k: k, rejected: predicted.filter(function (v) { return v === null; }).length};
  }
  function predictMajority(dataset, model) {
    return {classCodes: model.classCodes.slice(), predictedCode: dataset.depth_m.map(function () { return model.majorityCode; })};
  }
  function evaluateClassification(reference, predicted, classCodes) {
    check(reference.length === predicted.length, '参考与预测长度不同');
    check(classCodes.length > 0 && new Set(classCodes).size === classCodes.length, '类别列表无效');
    var c = classCodes.length, matrix = Array.from({length: c + 1}, function () { return Array(c + 1).fill(0); });
    var evaluated = 0, correct = 0, rejectedKnown = 0, unknownReference = 0;
    reference.forEach(function (ref, i) {
      var r = classCodes.indexOf(ref), p = classCodes.indexOf(predicted[i]);
      matrix[r < 0 ? c : r][p < 0 ? c : p]++;
      if (r < 0) { unknownReference++; return; }
      evaluated++;
      if (p < 0) rejectedKnown++;
      if (r === p) correct++;
    });
    var perClass = classCodes.map(function (code, ci) {
      var tp = matrix[ci][ci], support = matrix[ci].reduce(function (s, n) { return s + n; }, 0);
      // Unknown reference rows have no ground truth in the model class set; exclude from FP.
      var predictedCount = matrix.slice(0, c).reduce(function (s, row) { return s + row[ci]; }, 0);
      var precision = predictedCount ? tp / predictedCount : 0, recall = support ? tp / support : 0;
      return {code: code, precision: precision, recall: recall,
        f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: support, predicted: predictedCount};
    });
    return {classCodes: classCodes.slice(), matrix: matrix, perClass: perClass,
      macroF1: evaluated ? perClass.reduce(function (s, p) { return s + p.f1; }, 0) / c : null,
      accuracy: evaluated ? correct / evaluated : null, evaluated: evaluated, total: reference.length,
      unknownReference: unknownReference, rejectedKnown: rejectedKnown,
      referenceCoverage: reference.length ? evaluated / reference.length : null,
      predictionCoverage: evaluated ? (evaluated - rejectedKnown) / evaluated : null,
      unknownPolicy: 'separate-row-column; known-reference denominator includes rejections; fixed-class macro'};
  }
  return {version: '1.0.0', fitLithology: fitLithology, predictLithology: predictLithology,
    predictMajority: predictMajority, evaluateClassification: evaluateClassification};
});
