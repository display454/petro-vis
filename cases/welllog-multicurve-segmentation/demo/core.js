/* w1 core v1: observed data -> segmentation. Reference labels are evaluation-only. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WelllogSegCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(name + ' must be a finite number');
    }
    return value;
  }
  function positiveInteger(value, name) {
    finite(value, name);
    if (value < 1 || !Number.isInteger(value)) throw new Error(name + ' must be a positive integer');
    return value;
  }
  function random(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function normal(rng) {
    return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
  }
  function validateDataset(dataset) {
    if (!dataset || !Array.isArray(dataset.depth_m) || dataset.depth_m.length < 2) {
      throw new Error('dataset.depth_m requires at least two samples');
    }
    dataset.depth_m.forEach(function (d, i, arr) {
      finite(d, 'depth_m');
      if (i && d <= arr[i - 1]) throw new Error('depth_m must be strictly increasing');
    });
  }
  function boundaryDepths(dataset, indices) {
    validateDataset(dataset);
    return indices.map(function (b) {
      if (!Number.isInteger(b) || b <= 0 || b >= dataset.depth_m.length) {
        throw new Error('boundary index must lie between samples');
      }
      return (dataset.depth_m[b - 1] + dataset.depth_m[b]) / 2;
    });
  }

  function makeSyntheticWell(options) {
    var o = options || {};
    var seed = o.seed === undefined ? 1801 : finite(o.seed, 'seed');
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('seed must be uint32');
    var noise = o.noise === undefined ? 0.35 : finite(o.noise, 'noise');
    if (noise < 0 || noise > 3) throw new Error('noise must be between 0 and 3');
    var preset = o.preset || 'thin';
    if (['standard', 'thin', 'spike'].indexOf(preset) < 0) throw new Error('unknown preset');
    var rng = random(seed), n = 480, step = 0.125;
    var shift = Math.floor(rng() * 7) - 3;
    var cuts = preset === 'thin'
      ? [56, 128, 152 + shift, 158 + shift, 246, 344, 416]
      : [56, 128, 246, 344, 416];
    var labels = preset === 'thin'
      ? ['砂岩', '泥岩', '致密碳酸盐岩', '薄泥岩层', '砂岩', '泥岩', '砂岩', '致密碳酸盐岩']
      : ['砂岩', '泥岩', '砂岩', '泥岩', '砂岩', '致密碳酸盐岩'];
    var response = {
      '砂岩': [42, 2.36, 1.55],
      '泥岩': [112, 2.57, 0.62],
      '致密碳酸盐岩': [26, 2.70, 2.06],
      '薄泥岩层': [88, 2.54, 0.95]
    };
    var limits = [0].concat(cuts, [n]), intervals = [];
    var gr = [], rhob = [], rdep = [], depth = [], layer = 0;
    for (var k = 0; k < labels.length; k++) {
      intervals.push({ start: limits[k], end: limits[k + 1], label: labels[k] });
    }
    for (var i = 0; i < n; i++) {
      if (layer < cuts.length && i >= cuts[layer]) layer++;
      var mu = response[labels[layer]];
      var drift = Math.sin(i / 29) * 0.035;
      depth.push(1550 + i * step);
      gr.push(Math.max(0, mu[0] + 14 * noise * normal(rng) + 8 * drift));
      rhob.push(mu[1] + 0.045 * noise * normal(rng) + 0.06 * drift);
      rdep.push(Math.pow(10, mu[2] + 0.25 * noise * normal(rng) + drift));
    }
    if (preset === 'spike') {
      [88, 206, 302].forEach(function (j) {
        gr[j] += 100; rhob[j] -= 0.25; rdep[j] *= 12;
      });
    }
    var dataset = {
      schemaVersion: '1.0',
      id: 'synthetic-' + seed + '-' + preset,
      wellId: '教学井 S-' + seed,
      depth_m: depth,
      curves: { gr_api: gr, rhob_g_cm3: rhob, rdep_ohm_m: rdep },
      units: { gr_api: 'API', rhob_g_cm3: 'g/cm³', rdep_ohm_m: 'Ω·m' },
      source: { kind: 'synthetic', label: '分层岩石响应教学合成数据', seed: seed }
    };
    return {
      dataset: dataset,
      reference: {
        kind: 'synthetic', boundaryIndices: cuts.slice(),
        boundaryDepths_m: boundaryDepths(dataset, cuts), intervals: intervals
      }
    };
  }

  function prepareFeatures(dataset, keys) {
    validateDataset(dataset);
    if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length) {
      throw new Error('select at least one distinct feature');
    }
    var n = dataset.depth_m.length;
    var values = Array.from({ length: n }, function () { return []; });
    var transforms = keys.map(function (key) {
      var curve = dataset.curves && dataset.curves[key];
      if (!Array.isArray(curve) || curve.length !== n) throw new Error('missing or misaligned curve: ' + key);
      var log = key === 'rdep_ohm_m';
      var x = curve.map(function (v) {
        finite(v, key);
        if (log && v <= 0) throw new Error('rdep_ohm_m must be positive for log10');
        return log ? Math.log10(v) : v;
      });
      var mean = x.reduce(function (s, v) { return s + v; }, 0) / n;
      var variance = x.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / n;
      var std = Math.sqrt(variance);
      if (std < 1e-12) std = 1;
      x.forEach(function (v, i) { values[i].push((v - mean) / std); });
      return { key: key, mean: mean, std: std, log10: log };
    });
    return { featureKeys: keys.slice(), values: values, transforms: transforms };
  }

  function validateMatrix(values) {
    if (!Array.isArray(values) || !values.length || !Array.isArray(values[0]) || !values[0].length) {
      throw new Error('values must be a nonempty sample-by-feature matrix');
    }
    var p = values[0].length;
    values.forEach(function (row) {
      if (!Array.isArray(row) || row.length !== p) throw new Error('matrix rows must have equal length');
      row.forEach(function (v) { finite(v, 'feature'); });
    });
    return p;
  }
  function prefixes(values, p) {
    var n = values.length;
    var sum = Array.from({ length: p }, function () { return new Float64Array(n + 1); });
    var sq = Array.from({ length: p }, function () { return new Float64Array(n + 1); });
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < p; j++) {
        sum[j][i + 1] = sum[j][i] + values[i][j];
        sq[j][i + 1] = sq[j][i] + values[i][j] * values[i][j];
      }
    }
    return { sum: sum, sq: sq };
  }

  function segment(values, options) {
    var p = validateMatrix(values), n = values.length;
    var penalty = finite(options.penalty, 'penalty');
    var min = positiveInteger(options.minSamples, 'minSamples');
    if (penalty < 0 || min > n) throw new Error('penalty must be >= 0 and minSamples <= sample count');
    var pref = prefixes(values, p);
    function cost(a, b) {
      var c = 0;
      for (var j = 0; j < p; j++) {
        var s = pref.sum[j][b] - pref.sum[j][a];
        c += Math.max(0, pref.sq[j][b] - pref.sq[j][a] - s * s / (b - a));
      }
      return c / p;
    }
    var dp = new Float64Array(n + 1); dp.fill(Infinity); dp[0] = 0;
    var prev = new Int32Array(n + 1); prev.fill(-1);
    var count = new Int32Array(n + 1);
    for (var b = min; b <= n; b++) {
      for (var a = 0; a <= b - min; a++) {
        if (!Number.isFinite(dp[a])) continue;
        var candidate = dp[a] + cost(a, b) + (a ? penalty : 0);
        var segments = count[a] + 1;
        if (candidate < dp[b] - 1e-10 ||
            (Math.abs(candidate - dp[b]) <= 1e-10 && segments < count[b])) {
          dp[b] = candidate; prev[b] = a; count[b] = segments;
        }
      }
    }
    var segmentsOut = [], end = n;
    while (end > 0) {
      var start = prev[end];
      var means = pref.sum.map(function (s) { return (s[end] - s[start]) / (end - start); });
      segmentsOut.push({ start: start, end: end, means: means }); end = start;
    }
    segmentsOut.reverse();
    var boundaries = segmentsOut.slice(1).map(function (s) { return s.start; });
    return {
      boundaryIndices: boundaries, segments: segmentsOut,
      dataCost: segmentsOut.reduce(function (s, r) { return s + cost(r.start, r.end); }, 0),
      objective: dp[n], penalty: penalty, minSamples: min
    };
  }

  function gradientBaseline(values, options) {
    var p = validateMatrix(values), n = values.length;
    var min = positiveInteger(options.minSamples, 'minSamples');
    var w = positiveInteger(options.windowSamples === undefined ? 4 : options.windowSamples, 'windowSamples');
    var threshold = finite(options.threshold, 'threshold');
    if (min > n || threshold < 0) throw new Error('invalid baseline constraints');
    var pref = prefixes(values, p), scores = Array(n).fill(0);
    for (var i = w; i <= n - w; i++) {
      var s = 0;
      for (var j = 0; j < p; j++) {
        var left = (pref.sum[j][i] - pref.sum[j][i - w]) / w;
        var right = (pref.sum[j][i + w] - pref.sum[j][i]) / w;
        s += (right - left) * (right - left);
      }
      scores[i] = Math.sqrt(s / p);
    }
    var candidates = [];
    for (var b = Math.max(w, min); b <= Math.min(n - w, n - min); b++) {
      if (scores[b] > threshold && scores[b] > scores[b - 1] && scores[b] >= (scores[b + 1] || 0)) {
        candidates.push(b);
      }
    }
    candidates.sort(function (a, b) { return scores[b] - scores[a] || a - b; });
    var kept = [];
    candidates.forEach(function (b) {
      if (kept.every(function (a) { return Math.abs(a - b) >= min; })) kept.push(b);
    });
    kept.sort(function (a, b) { return a - b; });
    return { boundaryIndices: kept, scores: scores };
  }

  function evaluate(predicted, reference, tolerance) {
    finite(tolerance, 'tolerance_m');
    if (tolerance < 0) throw new Error('tolerance_m must be nonnegative');
    function sorted(x) {
      if (!Array.isArray(x)) throw new Error('boundaries must be arrays');
      return x.map(function (v) { return finite(v, 'boundary depth'); }).sort(function (a, b) { return a - b; });
    }
    var pred = sorted(predicted), ref = sorted(reference), m = pred.length, n = ref.length;
    var dp = Array.from({ length: m + 1 }, function () { return Array(n + 1); });
    function better(a, b) { return !b || a.count > b.count || (a.count === b.count && a.distance < b.distance - 1e-12); }
    for (var i = 0; i <= m; i++) {
      for (var j = 0; j <= n; j++) {
        if (!i && !j) { dp[i][j] = { count: 0, distance: 0, from: '' }; continue; }
        var best = null;
        if (i) best = { count: dp[i - 1][j].count, distance: dp[i - 1][j].distance, from: 'p' };
        if (j) {
          var skip = { count: dp[i][j - 1].count, distance: dp[i][j - 1].distance, from: 'r' };
          if (better(skip, best)) best = skip;
        }
        if (i && j && Math.abs(pred[i - 1] - ref[j - 1]) <= tolerance + 1e-10) {
          var match = {
            count: dp[i - 1][j - 1].count + 1,
            distance: dp[i - 1][j - 1].distance + Math.abs(pred[i - 1] - ref[j - 1]), from: 'm'
          };
          if (better(match, best)) best = match;
        }
        dp[i][j] = best;
      }
    }
    var matches = [], matchedP = new Set(), matchedR = new Set();
    var pi = m, ri = n;
    while (pi || ri) {
      var from = dp[pi][ri].from;
      if (from === 'm') {
        matches.push({ predicted_m: pred[pi - 1], reference_m: ref[ri - 1], error_m: pred[pi - 1] - ref[ri - 1] });
        matchedP.add(pi - 1); matchedR.add(ri - 1); pi--; ri--;
      } else if (from === 'p') pi--;
      else ri--;
    }
    matches.reverse();
    var tp = matches.length;
    return {
      tp: tp, fp: m - tp, fn: n - tp,
      precision: m ? tp / m : (n ? 0 : null),
      recall: n ? tp / n : null,
      f1: m + n ? 2 * tp / (m + n) : null,
      mae_m: tp ? matches.reduce(function (s, r) { return s + Math.abs(r.error_m); }, 0) / tp : null,
      tolerance_m: tolerance, matches: matches,
      falsePositives_m: pred.filter(function (_, i) { return !matchedP.has(i); }),
      falseNegatives_m: ref.filter(function (_, i) { return !matchedR.has(i); })
    };
  }

  return Object.freeze({
    version: '1.0.0', makeSyntheticWell: makeSyntheticWell, prepareFeatures: prepareFeatures,
    segment: segment, gradientBaseline: gradientBaseline, boundaryDepths: boundaryDepths, evaluate: evaluate
  });
});
