/* =========================================================
   w2 孔隙度解释 · 控制器
   ---------------------------------------------------------
   core.js → app.js。所有数值来自 window.WelllogPorosityCore，
   页面不读任何结果文件。参考数组只进评价，不进拟合/预测。
   缓存边界：情境/噪声/seed → 重新生成+拟合+预测；
   每井标定点/特征 → 拟合+预测；k → 只预测；图层与选中 → 只绘制。
   ========================================================= */
(function () {
  'use strict';

  var C = window.WelllogPorosityCore;
  var FEATURES = {
    four: ['gr_api', 'rhob_g_cm3', 'nphi_vv', 'rdep_ohm_m'],
    rhob: ['rhob_g_cm3']
  };
  var CURVES = [
    { key: 'gr_api', label: 'GR', unit: 'API', log: false },
    { key: 'rhob_g_cm3', label: 'RHOB', unit: 'g/cm³', log: false },
    { key: 'nphi_vv', label: 'NPHI', unit: 'v/v', log: false },
    { key: 'rdep_ohm_m', label: 'RDEP', unit: 'Ω·m', log: true }
  ];
  var DEFAULTS = {
    seed: 1802, noise: 1, scenario: 'standard',
    perWell: 24, k: 9, features: 'four', showRef: true
  };
  var DENSITY = { matrixDensity: 2.65, fluidDensity: 1 };

  var state = {
    seed: DEFAULTS.seed, noise: DEFAULTS.noise, scenario: DEFAULTS.scenario,
    perWell: DEFAULTS.perWell, k: DEFAULTS.k, features: DEFAULTS.features,
    showRef: DEFAULTS.showRef, selected: null, cursor: null
  };

  var el = {};
  var svg = { depth: null, scatter: null, resid: null };
  var ctx = { depth: null, scatter: null, resid: null };
  var experiment = null, model = null, pred = null, den = null;
  var met = null, metDen = null;
  var failed = null;

  /* ---------------- 小工具 ---------------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function f2(v) { return isNum(v) ? v.toFixed(2) : '—'; }
  function f3(v) { return isNum(v) ? v.toFixed(3) : '—'; }
  function f4(v) { return isNum(v) ? v.toFixed(4) : '—'; }
  function pp(v) { return isNum(v) ? v.toFixed(3) : '不适用'; }
  function pct(v) { return isNum(v) ? (v * 100).toFixed(1) + '%' : '不适用'; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function niceTicks(min, max, count) {
    if (!(max > min)) return [min];
    var raw = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var out = [], t = Math.ceil(min / step - 1e-9) * step;
    for (var i = 0; i < 40 && t <= max + step * 1e-6; i++) {
      out.push(Math.round(t / step) * step);
      t += step;
    }
    return out;
  }
  function lin(d0, d1, r0, r1) {
    var span = (d1 - d0) || 1;
    return function (v) { return r0 + (v - d0) / span * (r1 - r0); };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    cache();
    if (!C || typeof C.makeExperiment !== 'function') {
      showAlert('内核未加载：没有找到 WelllogPorosityCore。请确认核心脚本 core.js 在 app.js 之前加载。');
      return;
    }
    buildControls();
    syncControls();
    buildCharts();
    bind();
    recompute('all');
    paintAll();
  }

  function cache() {
    ['bt-mode', 'alert', 'reset', 'scenario-group', 'scenario-tip', 'noise', 'noise-out',
      'perwell-group', 'perwell-out', 'perwell-tip', 'k-group', 'k-out', 'k-tip',
      'feature-group', 'show-ref', 'facts', 'newseed',
      'depth-track', 'depth-status', 'scatter', 'scatter-status', 'scatter-legend',
      'resid', 'resid-status', 'm-body', 'm-note', 'm-outside', 'm-spread', 'm-calib',
      'sel-mode', 'detail', 'source'
    ].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function showAlert(html) {
    if (!el.alert) return;
    el.alert.innerHTML = html;
    el.alert.hidden = false;
  }
  function hideAlert() { if (el.alert) { el.alert.hidden = true; el.alert.textContent = ''; } }

  /* ---------------- 计算 ---------------- */
  function recompute(level) {
    try {
      if (level === 'all') {
        experiment = C.makeExperiment({
          seed: state.seed, noise: state.noise, scenario: state.scenario
        });
        model = C.fitPorosity(experiment.train, {
          perWell: state.perWell, featureKeys: FEATURES[state.features].slice()
        });
        predictAndScore();
      } else if (level === 'fit') {
        model = C.fitPorosity(experiment.train, {
          perWell: state.perWell, featureKeys: FEATURES[state.features].slice()
        });
        predictAndScore();
      } else {
        predictAndScore();
      }
      failed = null;
      hideAlert();
    } catch (e) {
      failed = e;
      experiment = null; model = null; pred = null; den = null; met = null; metDen = null;
      state.selected = null; state.cursor = null;
      showAlert('<b>无法计算</b> ' + esc(e && e.message ? e.message : String(e)) +
        '。指标、曲线与明细已清空，不显示上一次的数值。');
    }
  }

  function predictAndScore() {
    var ds = experiment.target.dataset;
    pred = C.predictPorosity(ds, model, { k: state.k });
    den = C.densityBaseline(ds, DENSITY);
    var ref = experiment.target.reference.porosity_vv;
    met = C.evaluateRegression(ref, pred.predicted_vv);
    metDen = C.evaluateRegression(ref, den.predicted_vv);
    var list = plottable();
    if (state.selected !== null && list.indexOf(state.selected) < 0) state.selected = null;
    if (state.cursor !== null && list.indexOf(state.cursor) < 0) state.cursor = null;
  }

  function ref() { return experiment ? experiment.target.reference.porosity_vv : null; }
  function depths() { return experiment ? experiment.target.dataset.depth_m : []; }
  function totalPoints() { return experiment ? experiment.target.dataset.depth_m.length : 0; }

  /* 可绘制：参考存在且至少一种方法给出预测 */
  var plotCache = { key: null, list: null };
  function plottable() {
    if (!met) return [];
    var stamp = [state.seed, state.noise, state.scenario, state.perWell, state.k, state.features].join('|');
    if (plotCache.key === stamp) return plotCache.list;
    var r = ref(), a = pred.predicted_vv, b = den.predicted_vv, out = [];
    for (var i = 0; i < r.length; i++) {
      if (isNum(r[i]) && (isNum(a[i]) || isNum(b[i]))) out.push(i);
    }
    plotCache.key = stamp; plotCache.list = out;
    return out;
  }

  /* ---------------- 控件 ---------------- */
  function buildControls() {
    el.noise.addEventListener('input', function () {
      var v = Number(el.noise.value);
      if (v === state.noise) return;
      state.noise = v;
      clearSelection();
      recompute('all');
      paintAll();
    });

    [['scenario-group', 'scenario'], ['perwell-group', 'perWell'], ['k-group', 'k'], ['feature-group', 'features']]
      .forEach(function (pair) {
        el[pair[0]].addEventListener('click', function (e) {
          var b = e.target.closest('button');
          if (!b) return;
          var key = pair[1];
          var raw = b.dataset[key === 'perWell' ? 'perwell' : key === 'features' ? 'features' : key];
          var val = key === 'scenario' || key === 'features' ? raw : Number(raw);
          if (val === state[key]) return;
          state[key] = val;
          clearSelection();
          recompute(key === 'perWell' || key === 'features' ? 'fit' : key === 'k' ? 'predict' : 'all');
          paintAll();
        });
      });

    el['show-ref'].addEventListener('change', function () {
      state.showRef = el['show-ref'].checked;
      paintAll();
    });

    el.newseed.addEventListener('click', function () {
      state.seed = state.seed >= 1999 ? 1802 : state.seed + 1;
      clearSelection();
      recompute('all');
      paintAll();
    });

    el.reset.addEventListener('click', function () {
      state.seed = DEFAULTS.seed; state.noise = DEFAULTS.noise; state.scenario = DEFAULTS.scenario;
      state.perWell = DEFAULTS.perWell; state.k = DEFAULTS.k;
      state.features = DEFAULTS.features; state.showRef = DEFAULTS.showRef;
      clearSelection();
      syncControls();
      recompute('all');
      paintAll();
    });
  }

  function clearSelection() { state.selected = null; state.cursor = null; }

  function syncControls() {
    el.noise.value = String(state.noise);
    el['noise-out'].textContent = state.noise.toFixed(1);
    el['perwell-out'].textContent = String(state.perWell);
    el['k-out'].textContent = String(state.k);
    el['show-ref'].checked = state.showRef;
    press(el['scenario-group'], 'scenario', state.scenario);
    press(el['perwell-group'], 'perwell', String(state.perWell));
    press(el['k-group'], 'k', String(state.k));
    press(el['feature-group'], 'features', state.features);
  }
  function press(group, attr, value) {
    [].forEach.call(group.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    });
  }

  /* ---------------- 图表骨架 ---------------- */
  function buildCharts() {
    ['depth', 'scatter', 'resid'].forEach(function (k) {
      var host = el[k === 'depth' ? 'depth-track' : k];
      host.innerHTML = '<svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid meet" ' +
        'role="img" tabindex="0" aria-label="' +
        (k === 'depth' ? '深度对齐的参考与两种预测曲线' : k === 'scatter' ? '预测与参考的散点图' : '残差随深度的分布') +
        '"></svg>';
      svg[k] = host.querySelector('svg');
      svg[k].addEventListener('pointerdown', function (e) { onPointer(k, e); });
      svg[k].addEventListener('keydown', function (e) { onKey(k, e); });
    });
    var legend = el['scatter-legend'];
    legend.innerHTML =
      '<li><i class="dot" style="background:#256754"></i>kNN 预测</li>' +
      '<li><i class="dia" style="border-color:#a45d36"></i>密度公式</li>' +
      '<li><i style="background:#b9b3a3;height:1px;border-top:1px dashed #b9b3a3"></i>y = x</li>' +
      '<li><i class="dia" style="border-color:#3f6b96;border-style:dashed"></i>特征范围外</li>';
  }

  function sizeOf(k) {
    var host = el[k === 'depth' ? 'depth-track' : k];
    var W = Math.max(k === 'depth' ? 560 : 300, Math.round(host.clientWidth || 620));
    var narrow = window.innerWidth < 900;
    var H = k === 'depth' ? (narrow ? 360 : 430) : narrow ? 280 : 320;
    return { W: W, H: H };
  }

  /* ---------------- 绘制入口 ---------------- */
  function paintAll() {
    syncControls();
    paintMode();
    paintFacts();
    paintDepth();
    paintScatter();
    paintResid();
    paintMetrics();
    paintDetail();
    paintSource();
  }

  function paintMode() {
    if (!el['bt-mode']) return;
    if (failed) { el['bt-mode'].textContent = '计算失败'; el['bt-mode'].className = 'bt-live'; return; }
    el['bt-mode'].textContent = state.scenario === 'shift' ? '流体偏移' : '标准情境';
    el['bt-mode'].className = 'bt-live' + (state.scenario === 'shift' ? '' : ' is-frozen');
    el['scenario-tip'].textContent = state.scenario === 'shift'
      ? '当前是流体偏移：目标井流体项变化、RDEP 抬升，训练井与潜在参考孔隙度不变。'
      : '标准情境：目标井与训练井用同一套流体假设。';
  }

  function paintFacts() {
    var per = state.perWell * 4;
    var rows = [
      ['seed', String(state.seed)],
      ['训练井', experiment ? experiment.train.length + ' 口 × 240 点' : '—'],
      ['标定点', model ? model.trainingSamples + ' 点（每井 ' + state.perWell + '）' : '—'],
      ['目标井', experiment ? totalPoints() + ' 点' : '—'],
      ['模型特征', FEATURES[state.features].length + ' 条' + (state.features === 'rhob' ? '（仅 RHOB）' : '')],
      ['有效 k', pred ? String(pred.k) : '—'],
      ['密度假设', 'ρma 2.65 / ρf 1.00']
    ];
    el.facts.innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
    el['perwell-tip'].textContent = experiment && model
      ? '4 口训练井共 ' + per + ' 个预算位，实际可拟合 ' + model.trainingSamples + ' 点。'
      : '预算 ' + per + ' 点，按固定哈希前缀取。';
    el['k-tip'].textContent = pred && pred.k !== state.k
      ? '训练点只有 ' + model.samples.length + ' 个，k 已截断为 ' + pred.k + '。'
      : '改 k 只重新预测，不重新拟合标定统计。';
  }

  /* ---------------- 深度对齐 ---------------- */
  function paintDepth() {
    var s = sizeOf('depth'), W = s.W, H = s.H;
    var m = { l: 42, r: 8, t: 30, b: 58 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var body = ['<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>'];

    if (!met) {
      body.push(emptyText(W, H, failed ? '计算失败：指标与曲线已清空' : '没有可绘制的数据'));
      draw(svg.depth, W, H, body.join(''), '深度对齐曲线：无数据');
      el['depth-status'].textContent = '—';
      ctx.depth = null;
      return;
    }

    var d = depths(), n = d.length, step = n > 1 ? (d[n - 1] - d[0]) / (n - 1) : 1;
    var yDepth = lin(d[0] - step / 2, d[n - 1] + step / 2, m.t, m.t + ih);
    var y = function (i) { return m.t + ((i + 0.5) / n) * ih; };
    var r = ref(), a = pred.predicted_vv, b = den.predicted_vv;

    var vals = [];
    r.forEach(function (v) { if (isNum(v)) vals.push(v); });
    a.forEach(function (v) { if (isNum(v)) vals.push(v); });
    b.forEach(function (v) { if (isNum(v)) vals.push(v); });
    if (!vals.length) {
      body.push(emptyText(W, H, '当前设置下没有有限的孔隙度值'));
      draw(svg.depth, W, H, body.join(''), '深度对齐曲线：无数据');
      el['depth-status'].textContent = '没有可绘制的点';
      ctx.depth = null;
      return;
    }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.06 || 0.02;
    var dom = [lo - pad, hi + pad];

    var gap = 12, laneW = (iw - gap * 2) / 3;
    var lanes = [
      { x0: m.l, title: '参考（模拟真值）', vals: r, cls: 't-ref', color: '#7d8a82' },
      { x0: m.l + laneW + gap, title: 'kNN 预测', vals: a, cls: 't-knn', color: '#256754' },
      { x0: m.l + (laneW + gap) * 2, title: '密度公式', vals: b, cls: 't-den', color: '#a45d36' }
    ];

    /* 深度轴 */
    niceTicks(d[0], d[n - 1], 6).forEach(function (v) {
      var py = yDepth(v);
      body.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + py.toFixed(1) + '"/>');
      body.push('<text class="t-tick" x="' + (m.l - 6) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(0) + '</text>');
    });
    body.push('<text class="t-axis" x="' + (m.l - 6) + '" y="' + (H - 30) + '" text-anchor="end">m</text>');

    var lanesX = [];
    lanes.forEach(function (L) {
      var sx = lin(dom[0], dom[1], L.x0, L.x0 + laneW);
      lanesX.push(sx);
      var visible = L.cls !== 't-ref' || state.showRef;
      body.push('<text class="t-lane" x="' + L.x0.toFixed(1) + '" y="' + (m.t - 9) + '">' +
        (visible ? L.title : '参考（已隐藏）') + '</text>');
      body.push('<rect class="t-frame" x="' + L.x0.toFixed(1) + '" y="' + m.t + '" width="' + laneW.toFixed(1) + '" height="' + ih + '"/>');
      if (visible) body.push(pathOf(L.vals, sx, y, L.cls));
      var ticks = niceTicks(dom[0], dom[1], 3);
      ticks.forEach(function (v) {
        var px = sx(v);
        body.push('<line class="t-grid" x1="' + px.toFixed(1) + '" y1="' + m.t + '" x2="' + px.toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
        body.push('<text class="t-tick" x="' + px.toFixed(1) + '" y="' + (m.t + ih + 16) + '" text-anchor="middle">' + v.toFixed(2) + '</text>');
      });
      body.push('<text class="t-axis" x="' + (L.x0 + laneW / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">孔隙度 v/v</text>');
    });

    /* 选中与游标 */
    var sel = state.selected !== null ? state.selected : null;
    var cur = state.cursor !== null ? state.cursor : null;
    if (cur !== null && cur !== sel) body.push(hline(cur, y, 't-cursor', m.l, W - m.r));
    if (sel !== null) {
      body.push(hline(sel, y, 't-sel', m.l, W - m.r));
      lanes.forEach(function (L, i) {
        if (L.cls === 't-ref' && !state.showRef) return;
        var v = L.vals[sel];
        if (!isNum(v)) return;
        body.push('<circle cx="' + lanesX[i](v).toFixed(1) + '" cy="' + y(sel).toFixed(1) + '" r="4" fill="none" stroke="#263a35" stroke-width="1.6"/>');
      });
    }

    body.push('<rect class="t-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');
    draw(svg.depth, W, H, body.join(''), '深度对齐曲线：参考、kNN、密度公式');

    ctx.depth = { m: m, ih: ih, n: n, y: y, W: W, H: H };

    var missing = 0;
    for (var i = 0; i < n; i++) if (!isNum(r[i])) missing++;
    el['depth-status'].textContent = '目标井 ' + n + ' 点 · 参考缺失 ' + missing + ' 点 · 选中 ' +
      (state.selected === null ? '无' : '第 ' + (state.selected + 1) + ' 点');
  }

  function hline(i, y, cls, x0, x1) {
    var py = y(i).toFixed(1);
    return '<line class="' + cls + '" x1="' + x0 + '" y1="' + py + '" x2="' + x1 + '" y2="' + py + '"/>';
  }

  /* ---------------- 散点 ---------------- */
  function paintScatter() {
    var s = sizeOf('scatter'), W = s.W, H = s.H;
    var m = { l: 52, r: 14, t: 12, b: 42 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var body = ['<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>'];

    if (!met) {
      body.push(emptyText(W, H, failed ? '计算失败：指标与曲线已清空' : '没有可绘制的点'));
      draw(svg.scatter, W, H, body.join(''), '预测与参考散点：无数据');
      el['scatter-status'].textContent = '—';
      ctx.scatter = null;
      return;
    }

    var r = ref(), a = pred.predicted_vv, b = den.predicted_vv;
    var vals = [];
    r.forEach(function (v) { if (isNum(v)) vals.push(v); });
    a.forEach(function (v) { if (isNum(v)) vals.push(v); });
    b.forEach(function (v) { if (isNum(v)) vals.push(v); });
    if (!vals.length) {
      body.push(emptyText(W, H, '当前设置下没有有限的孔隙度值'));
      draw(svg.scatter, W, H, body.join(''), '预测与参考散点：无数据');
      el['scatter-status'].textContent = '没有可绘制的点';
      ctx.scatter = null;
      return;
    }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.05 || 0.02;
    var dom = [lo - pad, hi + pad];

    var sx = lin(dom[0], dom[1], m.l, m.l + iw);
    var sy = lin(dom[0], dom[1], m.t + ih, m.t);

    var ticks = niceTicks(dom[0], dom[1], 4);
    ticks.forEach(function (v) {
      var px = sx(v), py = sy(v);
      body.push('<line class="t-grid" x1="' + px.toFixed(1) + '" y1="' + m.t + '" x2="' + px.toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
      body.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (m.l + iw) + '" y2="' + py.toFixed(1) + '"/>');
      body.push('<text class="t-tick" x="' + px.toFixed(1) + '" y="' + (m.t + ih + 16) + '" text-anchor="middle">' + v.toFixed(2) + '</text>');
      body.push('<text class="t-tick" x="' + (m.l - 6) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(2) + '</text>');
    });
    body.push('<line class="t-one" x1="' + sx(dom[0]).toFixed(1) + '" y1="' + sy(dom[0]).toFixed(1) +
      '" x2="' + sx(dom[1]).toFixed(1) + '" y2="' + sy(dom[1]).toFixed(1) + '"/>');
    body.push('<rect class="t-frame" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    var knn = [], denP = [], out = [], plotted = 0;
    for (var i = 0; i < r.length; i++) {
      if (!isNum(r[i])) continue;
      if (isNum(b[i])) {
        var bx = sx(r[i]).toFixed(1), by = sy(b[i]).toFixed(1);
        denP.push('<rect class="t-dot-den" x="' + (bx - 2.4) + '" y="' + (by - 2.4) + '" width="4.8" height="4.8" transform="rotate(45 ' + bx + ' ' + by + ')"/>');
      }
      if (isNum(a[i])) {
        plotted++;
        knn.push('<circle class="t-dot-knn" cx="' + sx(r[i]).toFixed(1) + '" cy="' + sy(a[i]).toFixed(1) + '" r="2.7"/>');
        if (pred.outsideTrainingRange[i] === true) {
          out.push('<circle class="t-dot-out" cx="' + sx(r[i]).toFixed(1) + '" cy="' + sy(a[i]).toFixed(1) + '" r="5"/>');
        }
      }
    }
    body.push('<g>' + denP.join('') + '</g>');
    body.push('<g>' + knn.join('') + '</g>');
    body.push('<g>' + out.join('') + '</g>');

    var sel = state.selected;
    if (sel !== null && isNum(r[sel])) {
      if (isNum(a[sel])) body.push('<circle cx="' + sx(r[sel]).toFixed(1) + '" cy="' + sy(a[sel]).toFixed(1) + '" r="7" fill="none" stroke="#263a35" stroke-width="1.6"/>');
      if (isNum(b[sel])) body.push('<circle cx="' + sx(r[sel]).toFixed(1) + '" cy="' + sy(b[sel]).toFixed(1) + '" r="6" fill="none" stroke="#a45d36" stroke-width="1.2" stroke-dasharray="3 2"/>');
    }

    body.push('<text class="t-axis" x="' + (m.l + iw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">参考孔隙度 v/v</text>');
    body.push('<text class="t-axis" x="13" y="' + (m.t + ih / 2).toFixed(1) + '" text-anchor="middle" transform="rotate(-90 13 ' + (m.t + ih / 2).toFixed(1) + ')">预测孔隙度 v/v</text>');
    body.push('<rect class="t-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    draw(svg.scatter, W, H, body.join(''), '预测与参考散点：kNN 与密度公式');
    ctx.scatter = { sx: sx, sy: sy, m: m, iw: iw, ih: ih, W: W, H: H, n: r.length };

    var outside = (pred.outsideTrainingRange || []).filter(function (v) { return v === true; }).length;
    el['scatter-status'].textContent = 'kNN 入图 ' + plotted + ' 点 · 密度 ' + denP.length +
      ' 点 · 范围外 ' + outside + ' 点' + (state.selected !== null ? ' · 选中第 ' + (state.selected + 1) + ' 点' : '');
  }

  /* ---------------- 残差 ---------------- */
  function paintResid() {
    var s = sizeOf('resid'), W = s.W, H = s.H;
    var m = { l: 42, r: 10, t: 26, b: 42 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var body = ['<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>'];

    if (!met) {
      body.push(emptyText(W, H, failed ? '计算失败：指标与曲线已清空' : '没有可绘制的残差'));
      draw(svg.resid, W, H, body.join(''), '残差随深度：无数据');
      el['resid-status'].textContent = '—';
      ctx.resid = null;
      return;
    }

    var d = depths(), n = d.length, step = n > 1 ? (d[n - 1] - d[0]) / (n - 1) : 1;
    var yDepth = lin(d[0] - step / 2, d[n - 1] + step / 2, m.t, m.t + ih);
    var y = function (i) { return m.t + ((i + 0.5) / n) * ih; };
    var r = ref(), a = pred.predicted_vv, b = den.predicted_vv;
    var ra = [], rb = [], mx = 1, anyRes = false;
    for (var i = 0; i < n; i++) {
      if (isNum(r[i]) && isNum(a[i])) { ra[i] = (a[i] - r[i]) * 100; mx = Math.max(mx, Math.abs(ra[i])); anyRes = true; }
      if (isNum(r[i]) && isNum(b[i])) { rb[i] = (b[i] - r[i]) * 100; mx = Math.max(mx, Math.abs(rb[i])); anyRes = true; }
    }
    if (!anyRes) {
      body.push(emptyText(W, H, '没有可计算的残差（参考或预测缺失）'));
      draw(svg.resid, W, H, body.join(''), '残差随深度：无数据');
      el['resid-status'].textContent = '没有可计算的残差';
      ctx.resid = null;
      return;
    }
    mx = Math.ceil(mx / 10) * 10;
    var dom = [-mx, mx];

    var gap = 14, laneW = (iw - gap) / 2;
    var lanes = [
      { x0: m.l, title: 'kNN 残差', vals: ra, dot: 't-res-knn', x: function (i) { return ra[i]; } },
      { x0: m.l + laneW + gap, title: '密度公式残差', vals: rb, dot: 't-res-den', x: function (i) { return rb[i]; } }
    ];

    niceTicks(d[0], d[n - 1], 5).forEach(function (v) {
      var py = yDepth(v);
      body.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + py.toFixed(1) + '"/>');
      body.push('<text class="t-tick" x="' + (m.l - 6) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(0) + '</text>');
    });
    body.push('<text class="t-axis" x="' + (m.l - 6) + '" y="' + (H - 28) + '" text-anchor="end">m</text>');

    var lanesX = [];
    lanes.forEach(function (L, li) {
      var sx = lin(dom[0], dom[1], L.x0, L.x0 + laneW);
      lanesX.push(sx);
      body.push('<text class="t-lane" x="' + L.x0.toFixed(1) + '" y="' + (m.t - 9) + '">' + L.title + '</text>');
      body.push('<rect class="t-frame" x="' + L.x0.toFixed(1) + '" y="' + m.t + '" width="' + laneW.toFixed(1) + '" height="' + ih + '"/>');
      body.push('<line class="t-grid-strong" x1="' + sx(0).toFixed(1) + '" y1="' + m.t + '" x2="' + sx(0).toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
      [dom[0], dom[0] / 2, 0, dom[1] / 2, dom[1]].forEach(function (v) {
        body.push('<text class="t-tick" x="' + sx(v).toFixed(1) + '" y="' + (m.t + ih + 15) + '" text-anchor="middle">' + v.toFixed(0) + '</text>');
      });
      body.push('<text class="t-axis" x="' + (L.x0 + laneW / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">残差 pp</text>');
      for (var k = 0; k < n; k++) {
        var v = L.x(k);
        if (!isNum(v)) continue;
        var px = sx(v);
        body.push('<circle class="' + L.dot + '" cx="' + px.toFixed(1) + '" cy="' + y(k).toFixed(1) + '" r="2.1"/>');
      }
    });

    var sel = state.selected;
    if (sel !== null) {
      body.push(hline(sel, y, 't-sel', m.l, W - m.r));
      lanes.forEach(function (L, li) {
        if (!isNum(L.x(sel))) return;
        body.push('<circle cx="' + lanesX[li](L.x(sel)).toFixed(1) + '" cy="' + y(sel).toFixed(1) + '" r="4" fill="none" stroke="#263a35" stroke-width="1.5"/>');
      });
    } else if (state.cursor !== null) {
      body.push(hline(state.cursor, y, 't-cursor', m.l, W - m.r));
    }

    body.push('<rect class="t-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');
    draw(svg.resid, W, H, body.join(''), '残差随深度：kNN 与密度公式');
    ctx.resid = { m: m, ih: ih, n: n, y: y, W: W, H: H };

    el['resid-status'].textContent = '残差 = 预测 − 参考 · ' + (isNum(met.bias_pp) ? 'kNN 偏差 ' + f3(met.bias_pp) + ' pp' : 'kNN 无预测');
  }

  function pathOf(vals, sx, y, cls) {
    var out = [], run = [];
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (!isNum(v)) {
        if (run.length > 1) out.push('<path class="' + cls + '" d="' + run.join('') + '"/>');
        run = [];
        continue;
      }
      run.push((run.length ? 'L' : 'M') + sx(v).toFixed(1) + ' ' + y(i).toFixed(1));
    }
    if (run.length > 1) out.push('<path class="' + cls + '" d="' + run.join('') + '"/>');
    return out.join('');
  }

  function emptyText(W, H, text) {
    return '<text class="t-empty" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">' + esc(text) + '</text>';
  }

  function draw(node, W, H, inner, label) {
    node.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    node.setAttribute('width', String(W));
    node.setAttribute('height', String(H));
    node.setAttribute('aria-label', label);
    node.innerHTML = inner;
  }

  /* ---------------- 指标 ---------------- */
  function paintMetrics() {
    if (!met || !metDen) {
      el['m-body'].innerHTML = '<tr><td colspan="3" class="na">计算失败或没有数据，指标已清空。</td></tr>';
      el['m-note'].textContent = '—';
      el['m-outside'].textContent = '—';
      el['m-spread'].textContent = '—';
      el['m-calib'].textContent = '—';
      return;
    }
    var rows = [
      ['MAE · pp', pp(met.mae_pp), pp(metDen.mae_pp)],
      ['RMSE · pp', pp(met.rmse_pp), pp(metDen.rmse_pp)],
      ['bias · pp', pp(met.bias_pp), pp(metDen.bias_pp)],
      ['R²', met.r2 === null ? '不适用' : f4(met.r2), metDen.r2 === null ? '不适用' : f4(metDen.r2)],
      ['n / total', met.n + ' / ' + met.total, metDen.n + ' / ' + metDen.total],
      ['覆盖', pct(met.coverage), pct(metDen.coverage)]
    ];
    el['m-body'].innerHTML = rows.map(function (r) {
      var na = r[1] === '不适用' || r[1] === '—';
      return '<tr><th scope="row">' + esc(r[0]) + '</th>' +
        '<td class="' + (na ? 'na' : '') + '">' + esc(String(r[1])) + '</td>' +
        '<td class="' + (r[2] === '不适用' ? 'na' : '') + '">' + esc(String(r[2])) + '</td></tr>';
    }).join('');

    el['m-note'].textContent = met.total === 0
      ? '没有已知参考点，无法评价。'
      : met.r2 === null
        ? '参考方差为 0，R² 不适用；其余误差照常给出。'
        : '误差单位为孔隙度百分点 pp；n 是有预测的参考点数，覆盖 = n / total。负 R² 表示比直接用均值更差，照原样显示。';

    var outside = (pred.outsideTrainingRange || []).filter(function (v) { return v === true; }).length;
    var nullPred = (pred.predicted_vv || []).filter(function (v) { return !isNum(v); }).length;
    el['m-outside'].textContent = outside + ' 点' + (nullPred ? ' / 无预测 ' + nullPred + ' 点' : '');

    var sp = (pred.localSpread_vv || []).filter(isNum).slice().sort(function (x, y) { return x - y; });
    el['m-spread'].textContent = sp.length
      ? f3(sp[Math.floor((sp.length - 1) / 2)] * 100) + ' / ' + f3(sp[sp.length - 1] * 100) + ' pp'
      : '不适用';
    el['m-calib'].textContent = model.trainingSamples + ' / ' + (state.perWell * 4) + ' 点';
  }

  /* ---------------- 明细 ---------------- */
  function paintDetail() {
    var idx = state.selected !== null ? state.selected : state.cursor;
    if (idx === null || !met) {
      el['detail'].innerHTML = met
        ? '在三张图上点一个深度，或用方向键移动游标、Enter 确认、Esc 清除。初始不预选。'
        : '计算失败，没有可查看的样本。';
      el['sel-mode'].textContent = '未选中';
      return;
    }
    var r = ref()[idx], a = pred.predicted_vv[idx], b = den.predicted_vv[idx];
    var ds = experiment.target.dataset;
    var isSel = state.selected !== null;
    var flags = [];
    if (!isNum(r)) flags.push('<span class="flag na">参考缺失</span>');
    if (!isNum(a)) flags.push('<span class="flag na">kNN 无预测</span>');
    if (!isNum(b)) flags.push('<span class="flag na">密度无预测</span>');
    if (pred.outsideTrainingRange[idx] === true) flags.push('<span class="flag out">特征在训练范围外（未校准提示）</span>');

    var rows = [
      ['深度', f2(ds.depth_m[idx]) + ' m'],
      ['参考孔隙度', isNum(r) ? f4(r) + '（' + f2(r * 100) + '%）' : '缺失'],
      ['kNN 预测', isNum(a) ? f4(a) : '无'],
      ['kNN 残差', isNum(a) && isNum(r) ? (a - r > 0 ? '+' : '') + f3((a - r) * 100) + ' pp' : '不适用'],
      ['密度预测', isNum(b) ? f4(b) : '无'],
      ['密度残差', isNum(b) && isNum(r) ? (b - r > 0 ? '+' : '') + f3((b - r) * 100) + ' pp' : '不适用'],
      ['邻居标定差异', isNum(pred.localSpread_vv[idx]) ? f3(pred.localSpread_vv[idx] * 100) + ' pp' : '不适用']
    ];
    CURVES.forEach(function (c) {
      var v = ds.curves[c.key][idx];
      rows.push([c.label + ' · ' + c.unit, isNum(v) ? (c.log ? f3(v) : f3(v)) : '缺失']);
    });

    el['sel-mode'].textContent = isSel ? '第 ' + (idx + 1) + ' 点' : '游标';
    el['detail'].innerHTML =
      '<div class="sd-head">' + (isSel ? '选中' : '游标（未确认）') + ' · 第 ' + (idx + 1) + ' / ' + totalPoints() + ' 点</div>' +
      '<dl>' + rows.map(function (x) {
        return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>';
      }).join('') + '</dl>' +
      (flags.length ? '<div class="sd-flags">' + flags.join('') + '</div>' : '<p class="hint">该点两种方法都有预测，且特征都在训练范围内。</p>');
  }

  function paintSource() {
    if (!model) { el.source.textContent = '—'; return; }
    el.source.innerHTML =
      '<p><b>生成器</b> seed ' + state.seed + ' · ' + (state.scenario === 'shift' ? '流体偏移' : '标准情境') +
      ' · 噪声 ' + state.noise.toFixed(1) + '。4 口训练井各 240 点，目标井 320 点；潜在孔隙度先生成，观测曲线后生成。</p>' +
      '<p><b>标定</b> 每井按 <code>hash("cal-v1|井名|样本号")</code> 排序取前缀，与目标成绩无关；预算加大严格嵌套。</p>' +
      '<p><b>限值</b> 训练统计只用拟合特征（' + model.featureKeys.join('、') + '），RDEP 取 log10；密度公式 ρma 2.65、ρf 1.00 固定，负值不裁剪。' +
      '本例没有 FORCE 独立岩心真值，NPHI 也不能当参考。</p>';
  }

  /* ---------------- 交互 ---------------- */
  function idxFromY(k, clientY) {
    var c = ctx[k];
    if (!c) return null;
    var box = svg[k].getBoundingClientRect();
    var scale = box.height / (svg[k].viewBox.baseVal.height || box.height || 1);
    var py = (clientY - box.top) / (scale || 1);
    var n = c.n || totalPoints();
    if (!n) return null;
    var frac = (py - c.m.t) / c.ih;
    if (frac < -0.02 || frac > 1.02) return null;
    var i = Math.floor(frac * n);
    return Math.max(0, Math.min(n - 1, i));
  }

  function onPointer(k, e) {
    if (!met) return;
    var i = idxFromY(k, e.clientY);
    if (i === null) return;
    if (plottable().indexOf(i) < 0) return;
    state.selected = i;
    state.cursor = null;
    paintAll();
    svg[k].focus({ preventScroll: true });
  }

  function onKey(k, e) {
    var list = plottable(), pos = list.indexOf(state.cursor !== null ? state.cursor : state.selected);
    if (e.key === 'Escape') {
      if (state.selected === null && state.cursor === null) return;
      e.preventDefault(); clearSelection(); paintAll(); return;
    }
    if (e.key === 'Enter') {
      if (state.cursor === null) return;
      e.preventDefault(); state.selected = state.cursor; state.cursor = null; paintAll(); return;
    }
    var step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    if (!list.length) return;
    var next;
    if (pos < 0) next = step > 0 ? 0 : list.length - 1;
    else next = Math.max(0, Math.min(list.length - 1, pos + step));
    state.cursor = list[next];
    if (state.selected !== null) state.selected = null;
    paintAll();
  }

  function bind() {
    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { paintAll(); }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* Guided comparisons reuse the existing reset and input handlers. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-experiment]');
    if (!button) return;
    var mode = button.dataset.experiment;
    document.getElementById('reset').click();
    if (mode === 'stress') document.querySelector('[data-scenario="shift"]').click();
  });
})();
