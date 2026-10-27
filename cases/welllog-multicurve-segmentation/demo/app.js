/* =========================================================
   w1 视图与控制层（app.js）
   ---------------------------------------------------------
   职责：单一状态 → 调用 window.WelllogSegCore → 三轨图 / 指标 / 检视。
   约束：
     · 不复制算法，不伪造指标，不从参考界面反推预测；
     · 只有 noise / preset / 换井 才重建观测数据，其余参数只重算必要部分；
     · 所有重算与重绘经 requestAnimationFrame 合并，避免拖动时排队；
     · 出错时用 role=alert 说明并清空指标，不保留上一次的数值；
     · 事件只绑在本页元素上，无全局定时器。
   ========================================================= */
(function () {
  'use strict';

  var Core = window.WelllogSegCore;
  var TOLERANCE_M = 0.5;      /* 固定容差，见 docs/case-01-design.md §4.5 */
  var SAMPLE_STEP_M = 0.125;  /* 合成井采样间隔 */
  var TOLERANCE_TEXT = '±0.5 m';

  var TRACKS = [
    { key: 'gr_api',     code: 'GR',   name: '自然伽马', unit: 'API',   log: false },
    { key: 'rhob_g_cm3', code: 'RHOB', name: '体积密度', unit: 'g/cm³', log: false },
    { key: 'rdep_ohm_m', code: 'RDEP', name: '深电阻率', unit: 'Ω·m',   log: true  }
  ];

  var FEATURE_SETS = {
    g:   { keys: ['gr_api'] },
    gr:  { keys: ['gr_api', 'rhob_g_cm3'] },
    grr: { keys: ['gr_api', 'rhob_g_cm3', 'rdep_ohm_m'] }
  };

  var DEFAULTS = {
    seed: 1801, preset: 'thin', noise: 0.35, featureSet: 'grr',
    penalty: 4, minThickness: 0.75, baselineThreshold: 0.65, showReference: true
  };

  var state = {
    seed: DEFAULTS.seed, preset: DEFAULTS.preset, noise: DEFAULTS.noise,
    featureSet: DEFAULTS.featureSet, penalty: DEFAULTS.penalty,
    minThickness: DEFAULTS.minThickness, baselineThreshold: DEFAULTS.baselineThreshold,
    showReference: DEFAULTS.showReference,
    selectedDepth: null, selectedBoundary: null
  };

  var DATA = null;   /* { dataset, reference } */
  var R = null;      /* { prep, seg, predDepths, metrics, base, baseDepths, baseMetrics, minSamples } */
  var GEO = null;    /* 当前 SVG 几何，供指针换算复用 */
  var el = {};
  var rafId = 0;
  var pending = { data: false, model: false, baseline: false };

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }

  function fmtDepth(v) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(2) + ' m'; }
  function fmtSigned(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + ' m';
  }
  function fmtRatio(v) { return (v == null || !isFinite(v)) ? '不适用' : (v * 100).toFixed(1) + '%'; }
  function fmtAxisTick(v) {
    var a = Math.abs(v);
    if (a >= 10) return String(Math.round(v));
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(a >= 0.1 ? 2 : 3);
  }
  function niceTicks(min, max, count) {
    var span = max - min;
    if (!(span > 0)) return [min];
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var stepN = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    var step = stepN * mag;
    var first = Math.ceil(min / step) * step;
    var out = [];
    for (var v = first; v <= max + step * 1e-6 && out.length < 24; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }
  function minSamplesFor(thickness) {
    return Math.max(1, Math.ceil((thickness - 1e-9) / SAMPLE_STEP_M));
  }
  function featureKeys() { return FEATURE_SETS[state.featureSet].keys; }
  function presetLabel(v) {
    return v === 'standard' ? '常规层段' : v === 'spike' ? '尖峰干扰段' : '薄互层段';
  }
  function nearestIndex(depth) {
    var ds = DATA.dataset.depth_m;
    var i = Math.round((depth - ds[0]) / SAMPLE_STEP_M);
    return Math.max(0, Math.min(ds.length - 1, i));
  }
  function valueAt(key, index) {
    var arr = DATA.dataset.curves[key];
    if (!arr) return null;
    var v = arr[index];
    return (v == null || !isFinite(v)) ? null : v;
  }

  /* ---------------- 计算编排 ---------------- */
  function request(kind) {
    if (kind === 'data') { pending.data = true; }
    else if (kind === 'baseline') { pending.baseline = true; }
    else { pending.model = true; pending.baseline = true; }
    scheduleFlush();
  }

  function scheduleFlush() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; flush(); });
  }

  /* 一帧内合并所有待处理的重算，然后统一重绘 */
  function flush() {
    var todo = pending;
    pending = { data: false, model: false, baseline: false };
    var willCompute = todo.data || todo.model || todo.baseline || !DATA;
    /* 只有真的重算时才清掉旧错误；单纯重绘（如窗口尺寸变化）不清，
       否则错误提示会被下一次空转抹掉，读者看不出为什么没有指标。 */
    if (willCompute) clearError();
    try {
      if (todo.data || !DATA) {
        DATA = Core.makeSyntheticWell({ seed: state.seed, noise: state.noise, preset: state.preset });
        state.selectedBoundary = null;
        state.selectedDepth = null;
        R = null;
        todo.model = true;
        todo.baseline = true;
      }
      if (todo.model || todo.baseline) {
        if (!R || todo.model) computeModel();
        if (todo.baseline) computeBaseline();
      }
    } catch (err) {
      R = null;
      showError(err);
    }
    paintAll();
  }

  function computeModel() {
    /* 参数或特征改变后，旧界面索引不再指向同一个候选。 */
    state.selectedBoundary = null;
    var minSamples = minSamplesFor(state.minThickness);
    var prep = Core.prepareFeatures(DATA.dataset, featureKeys());
    var seg = Core.segment(prep.values, { penalty: state.penalty, minSamples: minSamples });
    var pred = Core.boundaryDepths(DATA.dataset, seg.boundaryIndices);
    R = {
      prep: prep, seg: seg, minSamples: minSamples, predDepths: pred,
      metrics: Core.evaluate(pred, DATA.reference.boundaryDepths_m, TOLERANCE_M)
    };
  }

  function computeBaseline() {
    if (!R) return;   /* 模型未就绪时不单独算基线，避免用到不存在的特征 */
    var base = Core.gradientBaseline(R.prep.values, {
      threshold: state.baselineThreshold,
      minSamples: R.minSamples,
      windowSamples: 4
    });
    R.base = base;
    R.baseDepths = Core.boundaryDepths(DATA.dataset, base.boundaryIndices);
    R.baseMetrics = Core.evaluate(R.baseDepths, DATA.reference.boundaryDepths_m, TOLERANCE_M);
  }

  function showError(err) {
    var msg = (err && err.message) ? err.message : String(err);
    el.alert.innerHTML = '<b>计算没有完成：</b>' + attr(msg) +
      '。当前参数下不显示任何指标，请调整参数或复位后重试。';
    el.alert.hidden = false;
  }
  function clearError() { el.alert.hidden = true; el.alert.textContent = ''; }

  /* ---------------- 交互绑定 ---------------- */
  function bind() {
    el.preset.addEventListener('change', function () {
      state.preset = el.preset.value; request('data');
    });
    el.features.addEventListener('change', function () {
      state.featureSet = el.features.value; request('model');
    });
    el.penalty.addEventListener('input', function () {
      state.penalty = Number(el.penalty.value);
      el.penaltyOut.textContent = state.penalty.toFixed(1);
      request('model');
    });
    el.thickness.addEventListener('input', function () {
      state.minThickness = Number(el.thickness.value);
      el.thicknessOut.textContent = state.minThickness.toFixed(2) + ' m';
      request('model');
    });
    el.noise.addEventListener('input', function () {
      state.noise = Number(el.noise.value);
      el.noiseOut.textContent = state.noise.toFixed(2);
      request('data');
    });
    el.threshold.addEventListener('input', function () {
      state.baselineThreshold = Number(el.threshold.value);
      el.thresholdOut.textContent = state.baselineThreshold.toFixed(2);
      request('baseline');
    });
    el.truth.addEventListener('change', function () {
      state.showReference = el.truth.checked;
      paintAll();   /* 只改叠加显示，指标不动 */
    });
    el.newWell.addEventListener('click', function () {
      state.seed = (state.seed + 1) >>> 0;
      request('data');
    });
    el.reset.addEventListener('click', function () {
      state.seed = DEFAULTS.seed;
      state.preset = DEFAULTS.preset;
      state.noise = DEFAULTS.noise;
      state.featureSet = DEFAULTS.featureSet;
      state.penalty = DEFAULTS.penalty;
      state.minThickness = DEFAULTS.minThickness;
      state.baselineThreshold = DEFAULTS.baselineThreshold;
      state.showReference = DEFAULTS.showReference;
      syncControls();
      request('data');
    });

    el.depth.addEventListener('input', function () {
      if (!DATA) return;
      setCursor(DATA.dataset.depth_m[Number(el.depth.value)]);
    });

    el.chart.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;   /* 触控走点按，避免抢占纵向滚动 */
      setCursor(depthFromEvent(e));
    });
    el.chart.addEventListener('pointerdown', function (e) {
      var hit = e.target.closest && e.target.closest('[data-b]');
      if (hit) { selectBoundary(Number(hit.getAttribute('data-b'))); return; }
      setCursor(depthFromEvent(e));
    });
    el.chart.addEventListener('keydown', onChartKey);

    el.boundList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-b]');
      if (b) selectBoundary(Number(b.getAttribute('data-b')));
    });

    if (window.ResizeObserver) {
      new ResizeObserver(function () { scheduleFlush(); }).observe(el.chart.parentNode);
    } else {
      window.addEventListener('resize', scheduleFlush);
    }
  }

  function syncControls() {
    el.preset.value = state.preset;
    el.features.value = state.featureSet;
    el.penalty.value = String(state.penalty);
    el.thickness.value = String(state.minThickness);
    el.noise.value = String(state.noise);
    el.threshold.value = String(state.baselineThreshold);
    el.truth.checked = state.showReference;
    el.penaltyOut.textContent = state.penalty.toFixed(1);
    el.thicknessOut.textContent = state.minThickness.toFixed(2) + ' m';
    el.noiseOut.textContent = state.noise.toFixed(2);
    el.thresholdOut.textContent = state.baselineThreshold.toFixed(2);
  }

  /* ---------------- 光标与选中 ---------------- */
  function setCursor(depth) {
    if (depth == null || !DATA) return;
    var ds = DATA.dataset.depth_m;
    var clamped = Math.max(ds[0], Math.min(ds[ds.length - 1], depth));
    state.selectedDepth = clamped;
    el.depth.value = String(nearestIndex(clamped));
    syncReadout();
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      /* 游标帧等待期间也可能收到参数更新，不能将重算留在 pending 中。 */
      if (pending.data || pending.model || pending.baseline) flush();
      else paintChart();
    });
  }

  function selectBoundary(index) {
    if (!R || !R.predDepths || !isFinite(index)) return;
    if (index < 0 || index >= R.predDepths.length) return;
    state.selectedBoundary = index;
    state.selectedDepth = R.predDepths[index];
    el.depth.value = String(nearestIndex(state.selectedDepth));
    var listHadFocus = el.boundList.contains(document.activeElement);
    paintInspector();
    if (listHadFocus) {
      var selectedButton = el.boundList.querySelector('[data-b="' + index + '"]');
      if (selectedButton) selectedButton.focus({ preventScroll: true });
    }
    paintChart();
    syncReadout();
  }

  function depthFromEvent(e) {
    if (!DATA || !GEO) return null;
    var svg = el.chart.querySelector('svg');
    if (!svg) return null;
    var box = svg.getBoundingClientRect();
    if (!box.height) return null;
    var y = (e.clientY - box.top) * (GEO.H / box.height);
    var f = nearestFacetByY(GEO.facets, y);
    var t = (y - f.y0) / (f.y1 - f.y0);
    t = Math.max(0, Math.min(1, t));
    var ds = DATA.dataset.depth_m;
    return ds[0] + t * (ds[ds.length - 1] - ds[0]);
  }

  function nearestFacetByY(facets, y) {
    var best = facets[0], bestD = Infinity;
    facets.forEach(function (f) {
      var d = y < f.y0 ? f.y0 - y : (y > f.y1 ? y - f.y1 : 0);
      if (d < bestD) { bestD = d; best = f; }
    });
    return best;
  }

  function onChartKey(e) {
    if (!DATA) return;
    var ds = DATA.dataset.depth_m;
    var idx = state.selectedDepth == null ? Math.round(ds.length / 2) : nearestIndex(state.selectedDepth);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      idx += (e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 8 : 1);
      setCursor(ds[Math.max(0, Math.min(ds.length - 1, idx))]);
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      var pick = nearestBoundaryTo(state.selectedDepth == null ? ds[idx] : state.selectedDepth);
      if (pick != null) selectBoundary(pick);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      state.selectedBoundary = null;
      paintInspector();
      paintChart();
    }
  }

  function nearestBoundaryTo(depth) {
    if (!R || !R.predDepths.length) return null;
    var best = null, bestD = Infinity;
    R.predDepths.forEach(function (d, i) {
      var dist = Math.abs(d - depth);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    return best;
  }

  /* ---------------- 主图几何与绘制 ---------------- */
  function buildGeometry() {
    var host = el.chart;
    var W = Math.round(host.getBoundingClientRect().width || 0) || 640;
    var stacked = W < 660;
    var facets = [], H;

    if (!stacked) {
      var gut = 46, gap = 12, padT = 24, padB = 30;
      var h = Math.max(400, Math.min(620, Math.round(W * 0.72)));
      var pw = (W - gut - gap * 2) / 3;
      TRACKS.forEach(function (t, i) {
        var x0 = gut + i * (pw + gap);
        facets.push({ t: t, x0: x0, x1: x0 + pw, y0: padT, y1: h - padB, ownAxis: i === 0 });
      });
      H = h;
    } else {
      var gut2 = 42, facetH = 250, gapY = 46, padT2 = 22;
      var pw2 = W - gut2 - 8;
      TRACKS.forEach(function (t, i) {
        var y0 = padT2 + i * (facetH + gapY);
        facets.push({ t: t, x0: gut2, x1: gut2 + pw2, y0: y0, y1: y0 + facetH, ownAxis: true });
      });
      H = padT2 + 2 * (facetH + gapY) + facetH + 24;
    }

    var ds = DATA.dataset.depth_m;
    var geo = { W: W, H: H, facets: facets, d0: ds[0], d1: ds[ds.length - 1] };
    facets.forEach(function (f) { f.domain = domainOf(f.t.key); });
    GEO = geo;
    return geo;
  }

  function domainOf(key) {
    var arr = DATA.dataset.curves[key] || [];
    var min = Infinity, max = -Infinity, v, t;
    for (var i = 0; i < arr.length; i++) {
      v = arr[i];
      if (v == null || !isFinite(v)) continue;
      t = key === 'rdep_ohm_m' ? Math.log(v) / Math.LN10 : v;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    if (max - min < 1e-9) { min -= 1; max += 1; }
    var pad = (max - min) * 0.05;
    return [min - pad, max + pad];
  }

  function xOf(f, value) {
    var t = f.t.log ? Math.log(value) / Math.LN10 : value;
    var d = f.domain;
    return f.x0 + 2 + (t - d[0]) / (d[1] - d[0]) * (f.x1 - f.x0 - 4);
  }
  function yOf(f, depth) {
    return f.y0 + (depth - GEO.d0) / (GEO.d1 - GEO.d0) * (f.y1 - f.y0);
  }

  function paintChart() {
    if (!DATA) return;
    var chartHadFocus = el.chart.contains(document.activeElement);
    var geo = buildGeometry();
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + geo.W + ' ' + geo.H + '" width="' + geo.W + '" height="' + geo.H +
      '" role="img" tabindex="0" aria-label="' + attr(ariaLabel()) + '">');
    parts.push('<title>三轨测井曲线与界面</title>');
    parts.push('<desc>自然伽马、体积密度、深电阻率共用一条深度轴；灰色虚线为合成参考界面，深绿实线为预测界面。</desc>');

    var depthTicks = niceTicks(geo.d0, geo.d1, 6);
    geo.facets.forEach(function (f) { parts.push(facetSVG(f, geo, depthTicks)); });

    if (state.selectedDepth != null) {
      var cd = Math.max(geo.d0, Math.min(geo.d1, state.selectedDepth));
      var idx = nearestIndex(cd);
      geo.facets.forEach(function (f) {
        var y = yOf(f, cd);
        parts.push('<line class="t-cursor" x1="' + f.x0.toFixed(1) + '" x2="' + f.x1.toFixed(1) +
          '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
        var v = valueAt(f.t.key, idx);
        if (v != null) {
          parts.push('<circle cx="' + xOf(f, v).toFixed(1) + '" cy="' + y.toFixed(1) +
            '" r="3" fill="#256754" stroke="#fffefa" stroke-width="1.4"/>');
        }
      });
    }

    parts.push('</svg>');
    el.chart.innerHTML = parts.join('');
    if (chartHadFocus) el.chart.querySelector('svg').focus({ preventScroll: true });
    el.plotSize.textContent = geo.W + ' × ' + geo.H + ' px';
  }

  function facetSVG(f, geo, depthTicks) {
    var s = [];
    var w = f.x1 - f.x0, h = f.y1 - f.y0;

    s.push('<rect class="t-bg" x="' + f.x0.toFixed(1) + '" y="' + f.y0 + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"/>');

    depthTicks.forEach(function (d) {
      if (d < geo.d0 || d > geo.d1) return;
      var y = yOf(f, d);
      s.push('<line class="t-grid" x1="' + f.x0.toFixed(1) + '" x2="' + f.x1.toFixed(1) +
        '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
    });

    var xt = niceTicks(f.domain[0], f.domain[1], 3);
    var labels = [];
    xt.forEach(function (t) {
      var v = f.t.log ? Math.pow(10, t) : t;
      var x = xOf(f, v);
      s.push('<line class="t-grid-v" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) +
        '" y1="' + f.y0 + '" y2="' + f.y1 + '"/>');
      labels.push('<text class="t-tick" x="' + x.toFixed(1) + '" y="' + (f.y1 + 15) +
        '" text-anchor="middle">' + fmtAxisTick(v) + '</text>');
    });

    /* 观测曲线：缺失点断开，不插值 */
    var ds = DATA.dataset.depth_m;
    var arr = DATA.dataset.curves[f.t.key] || [];
    var d = '';
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v == null || !isFinite(v)) continue;
      d += (d ? 'L' : 'M') + xOf(f, v).toFixed(1) + ' ' + yOf(f, ds[i]).toFixed(1);
    }
    if (d) s.push('<path class="t-curve" d="' + d + '"/>');

    var fit = fitPath(f);
    if (fit) s.push('<path class="t-fit" d="' + fit + '"/>');

    if (state.showReference && DATA.reference) {
      DATA.reference.boundaryDepths_m.forEach(function (dep) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<line class="' + (isSelectedRef(dep) ? 't-ref sel' : 't-ref') + '" x1="' + f.x0.toFixed(1) +
          '" x2="' + f.x1.toFixed(1) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      });
    }

    if (R && R.baseDepths) {
      R.baseDepths.forEach(function (dep) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<line class="t-base" x1="' + (f.x0 + 1) + '" x2="' + (f.x0 + 9) +
          '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      });
    }

    if (R && R.predDepths) {
      R.predDepths.forEach(function (dep, j) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<line class="t-pred' + (state.selectedBoundary === j ? ' sel' : '') + '" x1="' + f.x0.toFixed(1) +
          '" x2="' + f.x1.toFixed(1) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
        s.push('<rect class="t-hit" x="' + f.x0.toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" width="' + w.toFixed(1) +
          '" height="10" data-b="' + j + '"><title>预测界面 ' + fmtDepth(dep) + '</title></rect>');
      });
    }

    if (R && R.metrics) {
      s.push('<rect class="t-flagstrip" x="' + (f.x1 - 9).toFixed(1) + '" y="' + f.y0 + '" width="8" height="' + h.toFixed(1) + '"/>');
      R.metrics.falseNegatives_m.forEach(function (dep) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<circle class="t-fn" cx="' + (f.x1 - 5).toFixed(1) + '" cy="' + y.toFixed(1) +
          '" r="3.2"><title>漏检 ' + fmtDepth(dep) + '</title></circle>');
      });
      R.metrics.falsePositives_m.forEach(function (dep) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<path class="t-fp" d="M' + (f.x1 - 8).toFixed(1) + ' ' + (y - 3).toFixed(1) +
          'L' + (f.x1 - 2).toFixed(1) + ' ' + (y + 3).toFixed(1) +
          'M' + (f.x1 - 8).toFixed(1) + ' ' + (y + 3).toFixed(1) +
          'L' + (f.x1 - 2).toFixed(1) + ' ' + (y - 3).toFixed(1) +
          '"><title>误检 ' + fmtDepth(dep) + '</title></path>');
      });
    }

    s.push('<rect class="t-frame" x="' + f.x0.toFixed(1) + '" y="' + f.y0 + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"/>');
    s.push('<text class="t-title" x="' + (f.x0 + 3) + '" y="' + (f.y0 - 8) + '">' + f.t.code + '</text>');
    s.push('<text class="t-unit" x="' + f.x1.toFixed(1) + '" y="' + (f.y0 - 8) + '" text-anchor="end">' +
      f.t.name + ' · ' + f.t.unit + (f.t.log ? ' · log' : '') + '</text>');
    s.push(labels.join(''));

    if (f.ownAxis) {
      depthTicks.forEach(function (dep) {
        if (dep < geo.d0 || dep > geo.d1) return;
        var y = yOf(f, dep);
        s.push('<text class="t-depth" x="' + (f.x0 - 6).toFixed(1) + '" y="' + (y + 4).toFixed(1) +
          '" text-anchor="end">' + Math.round(dep) + '</text>');
        s.push('<line class="t-grid" x1="' + (f.x0 - 4).toFixed(1) + '" x2="' + f.x0.toFixed(1) +
          '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      });
    }

    if (state.selectedBoundary != null && R && R.predDepths[state.selectedBoundary] != null) {
      var sd = R.predDepths[state.selectedBoundary];
      if (sd >= geo.d0 && sd <= geo.d1) {
        var sy = yOf(f, sd);
        var label = fmtDepth(sd);
        var tw = label.length * 6.6 + 10;
        var ty = Math.max(f.y0 + 4, Math.min(f.y1 - 20, sy - 18));
        s.push('<rect class="t-predlabel-bg" x="' + (f.x0 + 5).toFixed(1) + '" y="' + ty.toFixed(1) +
          '" width="' + tw.toFixed(1) + '" height="15" rx="2"/>');
        s.push('<text class="t-predlabel" x="' + (f.x0 + 10).toFixed(1) + '" y="' + (ty + 11).toFixed(1) + '">' + label + '</text>');
      }
    }
    return s.join('');
  }

  function fitPath(f) {
    if (!R || !R.seg || !R.prep) return '';
    var ti = R.prep.featureKeys.indexOf(f.t.key);
    if (ti < 0) return '';
    var tf = R.prep.transforms[ti];
    var ds = DATA.dataset.depth_m;
    var d = '';
    R.seg.segments.forEach(function (seg, i) {
      var raw = seg.means[ti] * tf.std + tf.mean;
      if (tf.log10) raw = Math.pow(10, raw);
      if (!isFinite(raw)) return;
      var x = xOf(f, raw).toFixed(1);
      var ya = yOf(f, ds[seg.start]).toFixed(1);
      var yb = yOf(f, ds[seg.end - 1]).toFixed(1);
      d += (i ? 'L' : 'M') + x + ' ' + ya + 'L' + x + ' ' + yb;
    });
    return d;
  }

  function isSelectedRef(dep) {
    if (state.selectedBoundary == null || !R || !R.metrics) return false;
    var target = R.predDepths[state.selectedBoundary];
    var m = null;
    for (var i = 0; i < R.metrics.matches.length; i++) {
      if (Math.abs(R.metrics.matches[i].predicted_m - target) < 1e-9) { m = R.metrics.matches[i]; break; }
    }
    return !!m && Math.abs(m.reference_m - dep) < 1e-9;
  }

  function attr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- 文字区 ---------------- */
  function paintMeta() {
    if (!DATA) return;
    var ds = DATA.dataset, ref = DATA.reference;
    el.wellMeta.innerHTML = '当前井 <b>' + attr(ds.wellId) + '</b> · ' + presetLabel(state.preset) +
      ' · 噪声 ' + state.noise.toFixed(2) + ' · ' + ds.depth_m.length + ' 个采样点 / ' +
      rangeText(ds) + ' · 参考界面 ' + ref.boundaryDepths_m.length + ' 条（仅用于评价）';
    el.seedLine.textContent = 'seed ' + state.seed + ' · 同一 seed 下潜在界面不变，噪声只改观测';
    el.factDepth.textContent = rangeText(ds);
    el.factStep.textContent = SAMPLE_STEP_M + ' m / 点';
    el.factN.textContent = ds.depth_m.length + ' 点';
    el.factMin.textContent = (R ? R.minSamples : minSamplesFor(state.minThickness)) + ' 点';
    el.depth.min = '0';
    el.depth.max = String(ds.depth_m.length - 1);
    if (state.selectedDepth == null) el.depth.value = String(Math.round(ds.depth_m.length / 2));
    el.legendRef.style.opacity = state.showReference ? '' : '.4';
  }

  function rangeText(ds) {
    return ds.depth_m[0].toFixed(2) + '—' + ds.depth_m[ds.depth_m.length - 1].toFixed(2) + ' m';
  }

  function paintMetrics() {
    function set(node, text) {
      node.textContent = text;
      node.classList.toggle('is-na', text === '不适用' || text === '—');
    }
    if (!R || !R.metrics || !R.baseMetrics) {
      set(el.f1, '不适用'); set(el.precision, '不适用');
      set(el.recall, '不适用'); set(el.mae, '不适用');
      set(el.tp, '—'); set(el.fp, '—'); set(el.fn, '—');
      el.matchCount.textContent = '当前没有可计算的结果';
      set(el.baseF1, '不适用'); set(el.baseP, '不适用'); set(el.baseR, '不适用');
      el.baseNote.textContent = '—';
      return;
    }
    var m = R.metrics, b = R.baseMetrics;
    set(el.f1, fmtRatio(m.f1));
    set(el.precision, fmtRatio(m.precision));
    set(el.recall, fmtRatio(m.recall));
    set(el.mae, m.mae_m == null ? '不适用' : m.mae_m.toFixed(2) + ' m');
    set(el.tp, String(m.tp));
    set(el.fp, String(m.fp));
    set(el.fn, String(m.fn));
    el.matchCount.textContent = 'TP ' + m.tp + ' · 预测 ' + R.predDepths.length +
      ' · 参考 ' + DATA.reference.boundaryDepths_m.length;

    set(el.baseF1, fmtRatio(b.f1));
    set(el.baseP, fmtRatio(b.precision));
    set(el.baseR, fmtRatio(b.recall));
    el.baseNote.textContent = '预测 ' + R.baseDepths.length + ' 条';
  }

  function syncReadout() {
    if (state.selectedDepth == null || !DATA) {
      el.curDepth.textContent = '—';
      el.curGr.textContent = '—';
      el.curRhod.textContent = '—';
      el.curRdep.textContent = '—';
      return;
    }
    var idx = nearestIndex(state.selectedDepth);
    el.curDepth.textContent = DATA.dataset.depth_m[idx].toFixed(2);
    var gr = valueAt('gr_api', idx), rhob = valueAt('rhob_g_cm3', idx), rdep = valueAt('rdep_ohm_m', idx);
    el.curGr.textContent = gr == null ? '缺失' : gr.toFixed(1);
    el.curRhod.textContent = rhob == null ? '缺失' : rhob.toFixed(3);
    el.curRdep.textContent = rdep == null ? '缺失' : (rdep >= 100 ? rdep.toFixed(0) : rdep.toFixed(2));
  }

  function paintInspector() {
    if (!R || !R.metrics) {
      el.selDetail.textContent = '界面匹配暂不可用。';
      el.boundList.innerHTML = '';
      el.listCount.textContent = '—';
      return;
    }
    var m = R.metrics;
    el.listCount.textContent = R.predDepths.length + ' 条';

    var hits = {};
    m.matches.forEach(function (x) { hits[x.predicted_m.toFixed(4)] = x; });

    if (R.predDepths.length === 0) {
      el.boundList.innerHTML = '';
      el.selDetail.textContent = '当前没有候选界面：存在参考界面时 P / R / F1 记为 0，匹配 MAE 不适用。';
      return;
    } else {
      el.boundList.innerHTML = R.predDepths.map(function (dep, i) {
        var hit = hits[dep.toFixed(4)];
        return '<button type="button" class="bound-item" data-b="' + i + '" aria-pressed="' +
          (state.selectedBoundary === i ? 'true' : 'false') + '">' +
          '<span class="d">' + dep.toFixed(2) + ' m</span>' +
          '<span class="m ' + (hit ? 'is-hit' : 'is-miss') + '">' +
          (hit ? '命中 ' + fmtSigned(hit.error_m) : '无匹配') + '</span></button>';
      }).join('');
    }

    if (state.selectedBoundary == null) {
      el.selDetail.textContent = '尚未选中界面。点按图上的预测界面，或从下方列表选择。';
      return;
    }
    var dep = R.predDepths[state.selectedBoundary];
    var hit = hits[dep.toFixed(4)];
    if (hit) {
      el.selDetail.innerHTML = '预测界面 <b>' + dep.toFixed(2) + ' m</b> · 匹配参考 <b>' +
        hit.reference_m.toFixed(2) + ' m</b> · 偏差 <b class="hit">' + fmtSigned(hit.error_m) +
        '</b>（容差 ' + TOLERANCE_TEXT + '，计为 TP）';
    } else {
      el.selDetail.innerHTML = '预测界面 <b>' + dep.toFixed(2) + ' m</b> · <b class="miss">无匹配参考界面</b>：' +
        '容差内没有对应界面，计为误检。先判断该深度是真实层界还是尖峰。';
    }
  }

  function paintStatus() {
    if (!DATA) return;
    var refN = DATA.reference.boundaryDepths_m.length;
    if (!R || !R.metrics || !R.baseMetrics) {
      el.plotStatus.innerHTML = '<b>没有可用结果。</b>上方提示说明了失败原因；输入曲线与参考界面仍按当前数据绘制。';
      return;
    }
    var m = R.metrics, b = R.baseMetrics;
    var head = '预测 <b>' + R.predDepths.length + '</b> 条 · 参考 <b>' + refN +
      '</b> 条 · 容差 ' + TOLERANCE_TEXT + ' · 采样 ' + SAMPLE_STEP_M + ' m · 基线预测 ' + R.baseDepths.length + ' 条。';
    var note;
    if (m.tp === 0 && m.fp === 0) {
      note = '没有产生任何候选界面：存在参考界面却没有预测，P / R / F1 记为 0，MAE 不适用。';
    } else if (m.fp === 0 && m.fn === 0) {
      note = '与合成参考完全一致，只说明在该教学输入与这组参数下成立，不代表真实井精度。';
    } else if (m.fp === 0) {
      note = '有 ' + m.fn + ' 条参考界面没有找到：薄层或弱对比层被惩罚与最小层厚合并了。';
    } else if (m.fn === 0) {
      note = '多出 ' + m.fp + ' 条预测：曲线上的孤立尖峰或噪声被当成了层界。';
    } else {
      note = '漏检 ' + m.fn + ' 条、误检 ' + m.fp + ' 条：参数与实际层厚不匹配，两个方向要同时看。';
    }
    var cmp = (b.f1 != null)
      ? '同输入下邻窗均值差基线 F1 ' + fmtRatio(b.f1) + '（P ' + fmtRatio(b.precision) + ' / R ' + fmtRatio(b.recall) + '）。'
      : '基线在当前参数下没有可用指标。';
    el.plotStatus.innerHTML = head + '<br>' + note + ' ' + cmp;
  }

  function ariaLabel() {
    if (!R || !R.metrics) return '三轨测井曲线与参考界面，当前没有可用指标';
    return '三轨测井曲线：预测界面 ' + R.predDepths.length + ' 条，参考界面 ' +
      DATA.reference.boundaryDepths_m.length + ' 条，命中 ' + R.metrics.tp + ' 条，漏检 ' +
      R.metrics.fn + ' 条，误检 ' + R.metrics.fp +
      ' 条。上下方向键移动深度，Enter 选中最近界面，Esc 取消。';
  }

  function paintAll() {
    if (!DATA) {
      el.plotStatus.innerHTML = '<b>数据尚未生成。</b>若该提示持续存在，请查看上方错误说明。';
      return;
    }
    paintMeta();
    paintMetrics();
    paintInspector();
    paintChart();
    syncReadout();
    paintStatus();
  }

  /* ---------------- 启动 ---------------- */
  function cache() {
    el.preset = $('preset'); el.features = $('features');
    el.penalty = $('penalty'); el.penaltyOut = $('penalty-out');
    el.thickness = $('thickness'); el.thicknessOut = $('thickness-out');
    el.noise = $('noise'); el.noiseOut = $('noise-out');
    el.threshold = $('threshold'); el.thresholdOut = $('threshold-out');
    el.truth = $('truth'); el.newWell = $('new-well'); el.reset = $('reset');
    el.depth = $('depth-slider');
    el.chart = $('chart'); el.plotSize = $('plot-size'); el.plotStatus = $('plot-status');
    el.legendRef = $('lg-ref');
    el.f1 = $('f1'); el.matchCount = $('match-count');
    el.precision = $('precision'); el.recall = $('recall'); el.mae = $('mae');
    el.tp = $('tp'); el.fp = $('fp'); el.fn = $('fn');
    el.baseF1 = $('base-f1'); el.baseP = $('base-p'); el.baseR = $('base-r'); el.baseNote = $('base-note');
    el.curDepth = $('cur-depth'); el.curGr = $('cur-gr'); el.curRhod = $('cur-rhob'); el.curRdep = $('cur-rdep');
    el.selDetail = $('sel-detail'); el.boundList = $('bound-list'); el.listCount = $('list-count');
    el.wellMeta = $('well-meta'); el.seedLine = $('seed-line');
    el.factDepth = $('fact-depth'); el.factStep = $('fact-step');
    el.factN = $('fact-n'); el.factMin = $('fact-min');
    el.alert = $('alert');
  }

  function fatal(message) {
    var box = document.getElementById('alert');
    if (!box) return;
    box.innerHTML = '<b>示范无法启动：</b>' + message;
    box.hidden = false;
  }

  function init() {
    cache();
    if (!Core || typeof Core.makeSyntheticWell !== 'function') {
      fatal('没有找到 window.WelllogSegCore。请确认 core.js 与 app.js 同目录，且 core.js 先加载。');
      return;
    }
    bind();
    syncControls();
    request('data');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Guided comparisons reuse the existing reset and input handlers. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-experiment]');
    if (!button) return;
    var mode = button.dataset.experiment;
    document.getElementById('reset').click();
    if (mode === 'stress') { var x=document.getElementById('penalty'); x.value='32'; x.dispatchEvent(new Event('input',{bubbles:true})); }
  });
})();
