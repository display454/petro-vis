/* =========================================================
   w4 岩性识别 · 视图与控制器
   ---------------------------------------------------------
   数据 data.js（WelllogDemoData）→ 内核 core.js（WelllogLithologyCore）。
   本文件只做“显示 / 选中 / 读数”，不重写模型：
   - fitLithology 只在初始化调用一次；改 k 只重算预测与评价。
   - 筛选、换显示轴、选中、隐藏参考都不改全井指标。
   - SVG 元素只建一次，重绘只换内部内容，键盘焦点因此不会丢。
   ========================================================= */
(function () {
  'use strict';

  var D = window.WelllogDemoData;
  var C = window.WelllogLithologyCore;
  var el = {};

  var CURVES = [
    { key: 'gr_api', label: 'GR', unit: 'API', log: false },
    { key: 'rhob_g_cm3', label: 'RHOB', unit: 'g/cm³', log: false },
    { key: 'nphi_vv', label: 'NPHI', unit: 'v/v', log: false },
    { key: 'rdep_ohm_m', label: 'RDEP', unit: 'Ω·m', log: true }
  ];
  var K_CANDIDATES = [1, 5, 9, 15];
  var PALETTE = ['#a45d36', '#2f6f5b', '#77681c', '#3f6b96', '#6b5b8f', '#8a5a5a'];
  var UNKNOWN_COLOR = '#a7afa6';
  var UNKNOWN_STROKE = '#7f8b82';

  var classes = [];
  var classIndex = {};
  var model = null;
  var wells = [];
  var state = null;
  var data = null;
  var pending = false;
  var errorText = '';
  var sctx = null;   /* 散点当前坐标上下文，供指针/键盘复用 */
  var cctx = null;   /* 岩性柱当前坐标上下文 */

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return (x * 100).toFixed(d === undefined ? 2 : d) + '%';
  }
  function num(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return x.toFixed(d === undefined ? 2 : d);
  }
  function int(n) { return Number(n).toLocaleString('en-US'); }
  function inView(v) { return typeof v === 'number' && isFinite(v); }
  function className(code) {
    var i = classIndex[code];
    return i === undefined ? '编码 ' + code : classes[i].name;
  }
  function classColor(code) {
    var i = classIndex[code];
    return i === undefined ? '#6f7a72' : classes[i].color;
  }
  function curveMeta(key) {
    for (var i = 0; i < CURVES.length; i++) if (CURVES[i].key === key) return CURVES[i];
    return { key: key, label: key, unit: '', log: false };
  }

  /* ---------------- 坐标 ---------------- */
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { hi = lo + 1; lo = lo - 1; }
    var span = hi - lo, raw = span / count;
    var step = Math.pow(10, Math.floor(Math.log10(raw)));
    var err = raw / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [], v = Math.ceil(lo / step - 1e-9) * step;
    for (; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function tickLabel(v, step) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k';
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (step < 0.05) return v.toFixed(2);
    if (step < 0.5) return v.toFixed(1);
    return v.toFixed(0);
  }
  function logTicks(lo, hi) {
    var out = [], a = Math.ceil(lo), b = Math.floor(hi);
    for (var k = a; k <= b; k++) {
      out.push(k);
      var third = k + Math.log10(3);
      if (third < hi && third > lo) out.push(third);
    }
    return out;
  }
  function logTickLabel(v) {
    var near = Math.round(v);
    if (Math.abs(v - near) < 1e-9) {
      var p = Math.pow(10, near);
      return p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + 'k' : String(p);
    }
    var p3 = 3 * Math.pow(10, Math.floor(v));
    return p3 >= 1000 ? (p3 / 1000).toFixed(p3 % 1000 === 0 ? 0 : 1) + 'k' : String(p3);
  }
  function ext(a) {
    var lo = Infinity, hi = -Infinity;
    a.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
    return [lo, hi];
  }
  function padRange(r, f) {
    var d = (r[1] - r[0]) || Math.abs(r[0]) * 0.1 || 1;
    return [r[0] - d * f, r[1] + d * f];
  }
  function lin(a, b, p, q) {
    var d = (b - a) || 1;
    return function (v) { return p + (v - a) / d * (q - p); };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    cache();
    if (!D || !C) { fatal('缺少数据或内核脚本：请确认 data.js 与 core.js 与本页同目录。'); return; }
    classes = D.classes.map(function (c, i) {
      return { code: c.code, name: c.name, color: PALETTE[i % PALETTE.length] };
    });
    classes.forEach(function (c, i) { classIndex[c.code] = i; });
    wells = D.batch.wells.slice();

    try {
      model = C.fitLithology(trainWells(), { featureKeys: D.defaults.lithology.featureKeys.slice() });
    } catch (err) { fatal('拟合失败：' + err.message); return; }

    var val = wells.filter(function (w) { return D.batch.split.validation.indexOf(w.wellId) >= 0; })[0];
    state = {
      wellId: (val || wells[0]).wellId,
      k: D.defaults.lithology.k,
      xKey: 'gr_api',
      yKey: 'rhob_g_cm3',
      hidden: {},
      errorsOnly: false,
      selection: null
    };

    buildStaticUI();
    el.scatterSvg = createSvg(el.scatter, 640, 396);
    el.columnsSvg = createSvg(el.columns, 210, 396);
    bind();
    recompute();
    paintAll();
  }

  function trainWells() {
    return wells.filter(function (w) { return D.batch.split.train.indexOf(w.wellId) >= 0; });
  }
  function splitOf(wellId) {
    if (D.batch.split.train.indexOf(wellId) >= 0) return 'train';
    if (D.batch.split.validation.indexOf(wellId) >= 0) return 'validation';
    return 'test';
  }
  function splitLabel(s) {
    return s === 'train' ? '训练井 · 回代' : (s === 'validation' ? '验证井' : '测试井 · 冻结设置');
  }

  function cache() {
    ['well', 'well-tip', 'k-out', 'k-group', 'k-tip', 'xkey', 'ykey', 'class-filter',
      'errors-only', 'filter-tip', 'facts', 'reset', 'bt-mode', 'axis-title',
      'scatter-count', 'scatter-legend', 'scatter', 'scatter-status', 'columns',
      'matrix', 'matrix-cap', 'm-f1', 'm-f1s', 'm-acc', 'm-known', 'm-unknown',
      'm-refcov', 'm-reject', 'm-predcov', 'm-maj-f1', 'm-maj-acc', 'm-maj-class',
      'm-maj-note', 'per-class', 'sel-mode', 'detail', 'source', 'alert'
    ].forEach(function (id) {
      el[id.replace(/-/g, '_')] = document.getElementById(id);
    });
  }

  function fatal(msg) {
    errorText = msg;
    if (el.alert) {
      el.alert.hidden = false;
      el.alert.innerHTML = '<b>无法运行</b> ' + esc(msg);
    }
  }

  /* ---------------- 静态控件 ---------------- */
  function buildStaticUI() {
    el.well.innerHTML = wells.map(function (w) {
      var s = splitOf(w.wellId);
      return '<option value="' + esc(w.wellId) + '">' + esc(w.wellId) + ' · ' + esc(splitLabel(s)) + '</option>';
    }).join('');

    el.k_group.innerHTML = K_CANDIDATES.map(function (k) {
      return '<button type="button" class="k-chip" data-k="' + k + '" aria-pressed="false">' + k + '</button>';
    }).join('');

    var opts = CURVES.map(function (c) {
      return '<option value="' + c.key + '">' + c.label + ' · ' + c.unit + '</option>';
    }).join('');
    el.xkey.innerHTML = opts;
    el.ykey.innerHTML = opts;

    el.class_filter.innerHTML = classes.map(function (c) {
      return '<button type="button" class="cls-chip" data-code="' + c.code + '" aria-pressed="true">' +
        '<i style="background:' + c.color + '"></i>' + esc(c.name) + '</button>';
    }).join('') +
      '<button type="button" class="cls-chip" data-code="unknown" aria-pressed="true">' +
      '<i class="sq"></i>未映射参考</button>';

    el.scatter_legend.innerHTML =
      classes.map(function (c) {
        return '<li><i style="background:' + c.color + '"></i>' + esc(c.name) + '</li>';
      }).join('') +
      '<li><i class="sq"></i>参考未映射（灰方）</li>' +
      '<li><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">' +
      '<path d="M5.5 1.4 L9.8 9.4 L1.2 9.4 Z" fill="#fffefa" stroke="#5c6b63" stroke-width="1.3"/></svg>' +
      '模型拒判（空心三角）</li>' +
      '<li><i style="background:transparent;border:1.5px solid var(--ink);width:9px;height:9px"></i>选中</li>';

    el.facts.innerHTML =
      '<div><dt>训练样本</dt><dd>' + int(model.trainingSamples) + ' 点</dd></div>' +
      '<div><dt>训练井</dt><dd>' + model.trainingWellIds.length + ' 口</dd></div>' +
      '<div><dt>类别</dt><dd>' + classes.length + ' 类 · 固定平均</dd></div>' +
      '<div><dt>特征</dt><dd>' + model.featureKeys.map(function (k) { return curveMeta(k).label; }).join(' / ') + '</dd></div>';

    renderSource();
  }

  function renderSource() {
    var src = D.batch.source || {};
    var lic = src.licenses || {};
    var files = (src.files || []).map(function (f) {
      return '<div><dt>' + esc(f.name) + '</dt><dd>' + esc(String(f.sha256).slice(0, 20)) + '…</dd></div>';
    }).join('');
    el.source.innerHTML =
      '<p>' + esc(src.label || '') + '</p>' +
      '<dl>' +
      '<div><dt>曲线许可</dt><dd>' + esc(lic.curves || src.license || '—') + '</dd></div>' +
      '<div><dt>标签许可</dt><dd>' + esc(lic.labels || '—') + '</dd></div>' +
      '<div><dt>获取日期</dt><dd>' + esc(src.retrievedAt || '—') + '</dd></div>' +
      '<div><dt>批次指纹</dt><dd>' + esc(String(D.datasetSha256 || '').slice(0, 20)) + '…</dd></div>' +
      files +
      '</dl>' +
      '<p style="margin-top:7px">拆分：训练 ' + esc(D.batch.split.train.join('、')) +
      '；验证 ' + esc(D.batch.split.validation.join('、')) +
      '；测试 ' + esc(D.batch.split.test.join('、')) + '。同井不跨组。</p>' +
      '<p style="margin-top:5px">限制：曲线为公开观测，岩性为人工解释；测试井只作“冻结设置”展示，' +
      '不用它的分数回头调 k 或特征。未映射点保留在数据里，既不算错判也不删除。</p>';
  }

  function createSvg(host, W, H) {
    if (!host) return null;
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" role="img" tabindex="0" preserveAspectRatio="xMidYMid meet"></svg>';
    return host.querySelector('svg');
  }
  function renderSvg(svg, W, H, inner, label) {
    if (!svg) return;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('aria-label', label);
    svg.innerHTML = inner;
  }

  function bind() {
    el.well.addEventListener('change', function () {
      state.wellId = el.well.value;
      if (splitOf(state.wellId) === 'test') state.k = D.defaults.lithology.k;
      state.selection = null;
      recompute();
      paintAll();
    });

    el.k_group.addEventListener('click', function (e) {
      var b = e.target.closest('.k-chip');
      if (!b || b.disabled) return;
      state.k = Number(b.dataset.k);
      recompute();
      paintAll();
    });

    el.xkey.addEventListener('change', function () { state.xKey = el.xkey.value; paintAll(); });
    el.ykey.addEventListener('change', function () { state.yKey = el.ykey.value; paintAll(); });

    el.class_filter.addEventListener('click', function (e) {
      var b = e.target.closest('.cls-chip');
      if (!b) return;
      var key = b.dataset.code === 'unknown' ? 'unknown' : Number(b.dataset.code);
      if (state.hidden[key]) delete state.hidden[key]; else state.hidden[key] = true;
      paintAll();
    });

    el.errors_only.addEventListener('change', function () {
      state.errorsOnly = el.errors_only.checked;
      paintAll();
    });

    el.reset.addEventListener('click', function () {
      var val = wells.filter(function (w) { return D.batch.split.validation.indexOf(w.wellId) >= 0; })[0];
      state.wellId = (val || wells[0]).wellId;
      state.k = D.defaults.lithology.k;
      state.xKey = 'gr_api';
      state.yKey = 'rhob_g_cm3';
      state.hidden = {};
      state.errorsOnly = false;
      state.selection = null;
      recompute();
      paintAll();
    });

    if (el.scatterSvg) {
      el.scatterSvg.addEventListener('pointermove', onScatterMove);
      el.scatterSvg.addEventListener('pointerleave', onScatterLeave);
      el.scatterSvg.addEventListener('pointerdown', onScatterDown);
      el.scatterSvg.addEventListener('keydown', onScatterKey);
    }
    if (el.columnsSvg) {
      el.columnsSvg.addEventListener('pointerdown', onColumnsDown);
      el.columnsSvg.addEventListener('pointermove', onColumnsMove);
      el.columnsSvg.addEventListener('pointerleave', onColumnsLeave);
    }

    window.addEventListener('resize', schedule);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(schedule);
      ro.observe(document.body);
      window.addEventListener('pagehide', function () { ro.disconnect(); });
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; paintAll(); });
  }

  /* ---------------- 重算（只在换井 / 改 k 时） ---------------- */
  function recompute() {
    errorText = '';
    el.alert.hidden = true;
    try {
      var well = wells.filter(function (w) { return w.wellId === state.wellId; })[0];
      var pred = C.predictLithology(well, model, { k: state.k });
      var maj = C.predictMajority(well, model);
      data = {
        well: well,
        split: splitOf(well.wellId),
        pred: pred,
        majCode: model.majorityCode,
        metrics: C.evaluateClassification(well.mappedLithologyCode, pred.predictedCode, model.classCodes),
        majMetrics: C.evaluateClassification(well.mappedLithologyCode, maj.predictedCode, model.classCodes),
        n: well.depth_m.length,
        vis: null
      };
    } catch (err) {
      data = null;
      errorText = err && err.message ? err.message : String(err);
      el.alert.hidden = false;
      el.alert.innerHTML = '<b>计算失败</b> ' + esc(errorText) + '。指标已清空，不显示上一次的数值。';
    }
  }

  /* ---------------- 样本层判定 ---------------- */
  function refCode(i) {
    var v = data.well.mappedLithologyCode;
    return v && inView(v[i]) ? v[i] : null;
  }
  function predCode(i) {
    var v = data.pred.predictedCode;
    return v && inView(v[i]) ? v[i] : null;
  }
  function refKey(i) { var c = refCode(i); return c === null ? 'unknown' : c; }
  function predKey(i) { var c = predCode(i); return c === null ? 'reject' : c; }
  function isError(i) { var r = refCode(i); return r !== null && predCode(i) !== r; }
  function curveAt(i, key) {
    var arr = data.well.curves[key];
    return arr ? arr[i] : null;
  }
  function axisValid(i, key) {
    var value = curveAt(i, key);
    return inView(value) && (!curveMeta(key).log || value > 0);
  }

  function computeVisible() {
    var n = data.n, mask = new Uint8Array(n), plotted = 0, missing = 0, hidden = 0;
    for (var i = 0; i < n; i++) {
      if (!axisValid(i, state.xKey) || !axisValid(i, state.yKey)) { missing++; continue; }
      plotted++;
      if (state.hidden[refKey(i)]) { hidden++; continue; }
      if (state.errorsOnly && !isError(i)) { hidden++; continue; }
      mask[i] = 1;
    }
    return { mask: mask, plotted: plotted, missing: missing, hidden: hidden, shown: plotted - hidden };
  }
  function vis() { return data.vis || (data.vis = computeVisible()); }

  /* ---------------- 绘制 ---------------- */
  function paintAll() {
    if (!state) return;
    syncControls();
    if (!data || errorText) { clearViews(); return; }
    el.alert.hidden = true;
    data.vis = computeVisible();
    paintMeta();
    paintScatter();
    paintColumns();
    paintMatrix();
    paintMetrics();
    paintDetail();
  }

  function clearViews() {
    renderSvg(el.scatterSvg, 640, 396, '<text class="t-emptymsg" x="320" y="198" text-anchor="middle">指标已清空</text>', '散点图：已清空');
    renderSvg(el.columnsSvg, 210, 396, '', '岩性柱：已清空');
    if (el.matrix) el.matrix.innerHTML = '';
    if (el.matrix_cap) el.matrix_cap.textContent = '—';
    ['m-f1', 'm-f1s', 'm-acc', 'm-known', 'm-unknown', 'm-refcov', 'm-reject',
      'm-predcov', 'm-maj-f1', 'm-maj-acc', 'm-maj-class', 'm-maj-note', 'scatter-count',
      'sel-mode'].forEach(function (id) {
        var node = el[id.replace(/-/g, '_')];
        if (node) node.textContent = '—';
      });
    if (el.per_class) el.per_class.innerHTML = '';
    if (el.scatter_status) el.scatter_status.textContent = '—';
    if (el.detail) el.detail.textContent = '计算失败，选中明细已清空。';
    sctx = null;
    cctx = null;
  }

  function syncControls() {
    el.well.value = state.wellId;
    var s = data ? data.split : splitOf(state.wellId);
    var frozen = s === 'test';

    el.k_out.textContent = String(state.k);
    [].forEach.call(el.k_group.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.k) === state.k));
      b.disabled = frozen && Number(b.dataset.k) !== D.defaults.lithology.k;
    });

    el.xkey.value = state.xKey;
    el.ykey.value = state.yKey;
    el.errors_only.checked = state.errorsOnly;

    [].forEach.call(el.class_filter.children, function (b) {
      var key = b.dataset.code === 'unknown' ? 'unknown' : Number(b.dataset.code);
      b.setAttribute('aria-pressed', String(!state.hidden[key]));
    });

    el.well_tip.textContent = s === 'train'
      ? '训练井：预测是回代成绩，不能当泛化分数看。'
      : (s === 'validation' ? '验证井：k 的候选只用这里比较。' : '测试井：k 与特征已冻结。');
    el.k_tip.textContent = frozen
      ? '测试井锁定 k=' + D.defaults.lithology.k + ' 与四条特征；从别的井切进来会恢复冻结设置。'
      : '换 k 只重算预测与评价，不重新拟合；同票先取距离和较小的类。';
  }

  function paintMeta() {
    var s = data.split;
    el.bt_mode.textContent = s === 'train' ? '训练回代 · 非泛化分数'
      : (s === 'validation' ? '验证井 · k 可调' : '冻结设置 · 测试展示');
    el.bt_mode.className = 'bt-live' + (s === 'test' ? ' is-frozen' : '');
    el.axis_title.textContent = curveMeta(state.xKey).label + ' × ' + curveMeta(state.yKey).label;
  }

  /* ----- 散点 ----- */
  function paintScatter() {
    var host = el.scatter;
    if (!host || !el.scatterSvg) return;
    var W = Math.max(280, Math.round(host.clientWidth || 640));
    var H = window.innerWidth < 700 ? 330 : 396;
    var m = { l: 56, r: 16, t: 12, b: 38 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var xc = curveMeta(state.xKey), yc = curveMeta(state.yKey);
    var v = vis();
    var n = data.n;

    var xs = [], ys = [];
    for (var i = 0; i < n; i++) {
      var xv = curveAt(i, state.xKey), yv = curveAt(i, state.yKey);
      if (!inView(xv) || !inView(yv)) continue;
      var ax = xc.log ? (xv > 0 ? Math.log10(xv) : NaN) : xv;
      var ay = yc.log ? (yv > 0 ? Math.log10(yv) : NaN) : yv;
      if (!inView(ax) || !inView(ay)) continue;
      xs.push(ax); ys.push(ay);
    }

    if (!xs.length) {
      renderSvg(el.scatterSvg, W, H,
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>' +
        '<text class="t-emptymsg" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">' +
        '所选显示轴上没有同时有效的样本；坐标轴保留，请换轴。</text>',
        '散点图：所选轴上没有可用样本');
      sctx = null;
      el.scatter_count.textContent = '入图 0 · 轴缺失 ' + v.missing + ' · 过滤隐藏 ' + v.hidden;
      el.scatter_status.textContent = '所选两条曲线在本井没有同时有效的样本。';
      el.scatter_status.className = 'plot-status is-warn';
      return;
    }

    var xr = padRange(ext(xs), xc.log ? 0.06 : 0.05);
    var yr = padRange(ext(ys), 0.06);
    var sx = lin(xr[0], xr[1], m.l, m.l + iw);
    var sy = lin(yr[0], yr[1], m.t + ih, m.t);
    sctx = { sx: sx, sy: sy, xc: xc, yc: yc };

    var p = [];
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>');
    var xt = xc.log ? logTicks(xr[0], xr[1]) : niceTicks(xr[0], xr[1], 6);
    var yt = yc.log ? logTicks(yr[0], yr[1]) : niceTicks(yr[0], yr[1], 5);
    xt.forEach(function (val) {
      var px = sx(val);
      if (px < m.l - 0.5 || px > m.l + iw + 0.5) return;
      p.push('<line class="t-grid-v" x1="' + px.toFixed(1) + '" y1="' + m.t + '" x2="' + px.toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
      p.push('<text class="t-tick" x="' + px.toFixed(1) + '" y="' + (m.t + ih + 17) + '" text-anchor="middle">' +
        (xc.log ? logTickLabel(val) : tickLabel(val, Math.abs(xt[1] - xt[0]))) + '</text>');
    });
    yt.forEach(function (val) {
      var py = sy(val);
      if (py < m.t - 0.5 || py > m.t + ih + 0.5) return;
      p.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (m.l + iw) + '" y2="' + py.toFixed(1) + '"/>');
      p.push('<text class="t-tick" x="' + (m.l - 8) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' +
        (yc.log ? logTickLabel(val) : tickLabel(val, Math.abs(yt[1] - yt[0]))) + '</text>');
    });
    p.push('<rect class="t-frame" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');
    p.push('<text class="t-axis" x="' + (m.l + iw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' +
      xc.label + ' · ' + xc.unit + (xc.log ? '（显示取对数）' : '') + '</text>');
    p.push('<text class="t-axis" x="' + (m.l - 42) + '" y="' + (m.t + ih / 2) + '" text-anchor="middle" ' +
      'transform="rotate(-90 ' + (m.l - 42) + ' ' + (m.t + ih / 2) + ')">' +
      yc.label + ' · ' + yc.unit + (yc.log ? '（显示取对数）' : '') + '</text>');

    var hl = highlightSet();
    var selIdx = state.selection && state.selection.mode === 'sample' ? state.selection.index : -1;
    var marks = [];
    for (i = 0; i < n; i++) {
      if (!v.mask[i]) continue;
      marks.push(pointMark(i, sx(xc.log ? Math.log10(curveAt(i, state.xKey)) : curveAt(i, state.xKey)),
        sy(yc.log ? Math.log10(curveAt(i, state.yKey)) : curveAt(i, state.yKey)), hl, selIdx));
    }
    p.push('<g>' + marks.join('') + '</g>');

    if (!v.shown) {
      p.push('<text class="t-emptymsg" x="' + (m.l + iw / 2) + '" y="' + (m.t + ih / 2) + '" text-anchor="middle">' +
        '当前筛选下没有样本（坐标轴与图例保留）</text>');
    }
    p.push('<g class="t-hover" pointer-events="none"></g>');

    renderSvg(el.scatterSvg, W, H, p.join(''), '散点图：' + xc.label + ' 对 ' + yc.label +
      '，入图 ' + v.shown + ' 点；方向键移动，Enter 选中，Esc 清除');

    el.scatter_count.textContent = '入图 ' + v.shown + ' · 轴缺失 ' + v.missing + ' · 过滤隐藏 ' + v.hidden;
    var s = data.split;
    el.scatter_status.innerHTML = '本井 ' + int(data.n) + ' 点；' +
      (v.missing ? '<b>' + v.missing + ' 点因轴曲线缺失未入图</b>，' : '轴曲线无缺失，') +
      (v.hidden ? '筛选另隐藏 ' + v.hidden + ' 点，两者分开计数。' : '筛选未隐藏样本。') +
      (s === 'train' ? '训练井成绩是回代。' : (s === 'test' ? '测试井按冻结设置展示。' : '验证井用于对比 k。'));
    el.scatter_status.className = 'plot-status' + (v.missing ? ' is-warn' : '');
  }

  function pointMark(i, cx, cy, hl, selIdx) {
    var r = refCode(i), pr = predCode(i);
    var color = r === null ? UNKNOWN_COLOR : classColor(r);
    var cls = 't-pt' + (hl && !hl[i] ? ' dim' : '');
    var out;
    if (r === null) {
      out = '<rect class="' + cls + '" x="' + (cx - 2.6).toFixed(1) + '" y="' + (cy - 2.6).toFixed(1) +
        '" width="5.2" height="5.2" fill="' + color + '" stroke="' + UNKNOWN_STROKE +
        '" stroke-width=".8" data-i="' + i + '"/>';
    } else if (pr === null) {
      out = '<path class="' + cls + '" d="M' + cx.toFixed(1) + ' ' + (cy - 3.4).toFixed(1) +
        'L' + (cx + 3.3).toFixed(1) + ' ' + (cy + 2.4).toFixed(1) +
        'L' + (cx - 3.3).toFixed(1) + ' ' + (cy + 2.4).toFixed(1) +
        'Z" fill="#fffefa" stroke="' + color + '" stroke-width="1.3" data-i="' + i + '"/>';
    } else {
      out = '<circle class="' + cls + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="3.1" fill="' + color + '" data-i="' + i + '"/>';
    }
    if (i === selIdx) {
      out += '<circle class="t-ring" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="6.4" pointer-events="none"/>';
    }
    return out;
  }

  function scatterIndexOf(clientX, clientY) {
    if (!sctx || !el.scatterSvg) return -1;
    var box = el.scatterSvg.getBoundingClientRect();
    var scale = box.width / (el.scatterSvg.viewBox.baseVal.width || box.width || 1);
    if (!scale) return -1;
    var px = (clientX - box.left) / scale, py = (clientY - box.top) / scale;
    var best = -1, bestD = 15 * 15, v = vis();
    for (var i = 0; i < data.n; i++) {
      if (!v.mask[i]) continue;
      var ax = sctx.sx(sctx.xc.log ? Math.log10(curveAt(i, state.xKey)) : curveAt(i, state.xKey));
      var ay = sctx.sy(sctx.yc.log ? Math.log10(curveAt(i, state.yKey)) : curveAt(i, state.yKey));
      var d = (ax - px) * (ax - px) + (ay - py) * (ay - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function onScatterMove(e) {
    if (e.pointerType === 'touch') return;
    var g = el.scatterSvg.querySelector('.t-hover');
    if (!g) return;
    var i = scatterIndexOf(e.clientX, e.clientY);
    if (i < 0) { g.innerHTML = ''; return; }
    var ax = sctx.sx(sctx.xc.log ? Math.log10(curveAt(i, state.xKey)) : curveAt(i, state.xKey));
    var ay = sctx.sy(sctx.yc.log ? Math.log10(curveAt(i, state.yKey)) : curveAt(i, state.yKey));
    g.innerHTML = '<circle cx="' + ax.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="7" fill="none" ' +
      'stroke="#263a35" stroke-width="1.2" opacity=".55"/>' +
      '<text class="t-tick" x="' + (ax + 10).toFixed(1) + '" y="' + (ay - 8).toFixed(1) + '">#' +
      (i + 1) + ' · ' + num(data.well.depth_m[i], 2) + ' m</text>';
  }
  function onScatterLeave() {
    var g = el.scatterSvg && el.scatterSvg.querySelector('.t-hover');
    if (g) g.innerHTML = '';
  }
  function onScatterDown(e) {
    var i = scatterIndexOf(e.clientX, e.clientY);
    if (i < 0) { clearSelection(); return; }
    selectSample(i);
  }

  function onScatterKey(e) {
    if (!data || errorText) return;
    var key = e.key;
    if (key === 'Escape') { clearSelection(); e.preventDefault(); return; }
    if (key === 'Enter' || key === ' ') {
      var idx = state.selection && state.selection.mode === 'sample' ? state.selection.index : firstPlotted();
      if (idx >= 0) selectSample(idx);
      e.preventDefault();
      return;
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    e.preventDefault();
    var dir = (key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1;
    var v = vis();
    var cur = state.selection && state.selection.mode === 'sample' ? state.selection.index : -1;
    var start = cur >= 0 ? cur + dir : (dir > 0 ? 0 : data.n - 1);
    for (var i = start; i >= 0 && i < data.n; i += dir) {
      if (v.mask[i]) { selectSample(i); return; }
    }
  }

  function firstPlotted() {
    var v = vis();
    for (var i = 0; i < data.n; i++) if (v.mask[i]) return i;
    return -1;
  }

  /* ----- 岩性柱 ----- */
  function paintColumns() {
    var host = el.columns;
    if (!host || !el.columnsSvg) return;
    var W = Math.max(180, Math.round(host.clientWidth || 210));
    var H = window.innerWidth < 700 ? 330 : 396;
    var top = 26, bot = 20, ih = H - top - bot;
    var axW = 34, gap = 8, lane = 12;
    var colW = Math.max(28, Math.floor((W - axW - gap * 3 - lane - 4) / 2));
    var xRef = axW + gap, xPred = xRef + colW + gap, xLane = xPred + colW + gap - 2;

    var n = data.n, dArr = data.well.depth_m;
    var step = n > 1 ? (dArr[n - 1] - dArr[0]) / (n - 1) : 1;
    var dTop = dArr[0] - step / 2, dBot = dArr[n - 1] + step / 2;
    var y = lin(dTop, dBot, top, top + ih);
    cctx = { y: y, top: top, ih: ih, n: n };

    var p = [];
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>');
    niceTicks(dArr[0], dArr[n - 1], 6).forEach(function (v) {
      var py = y(v);
      p.push('<line class="t-grid" x1="' + axW + '" y1="' + py.toFixed(1) + '" x2="' + (W - 2) + '" y2="' + py.toFixed(1) + '"/>');
      p.push('<text class="t-depth" x="' + (axW - 6) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(0) + '</text>');
    });
    p.push('<text class="t-col-lbl" x="' + (xRef + colW / 2) + '" y="' + (top - 10) + '" text-anchor="middle">参考</text>');
    p.push('<text class="t-col-lbl" x="' + (xPred + colW / 2) + '" y="' + (top - 10) + '" text-anchor="middle">预测</text>');
    p.push('<defs>' +
      '<pattern id="hatchU" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="#dfe3dc"/><line x1="0" y1="0" x2="0" y2="5" stroke="#8f9a91" stroke-width="1.3"/></pattern>' +
      '<pattern id="hatchR" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">' +
      '<rect width="5" height="5" fill="#eef4f0"/><line x1="0" y1="0" x2="0" y2="5" stroke="#256754" stroke-width="1.3"/></pattern>' +
      '</defs>');

    p.push(columnRuns('ref', xRef, colW, y, dArr, step, n));
    p.push(columnRuns('pred', xPred, colW, y, dArr, step, n));

    /* 不一致：只算“已知参考且预测不同” */
    var s = -1;
    for (var i = 0; i <= n; i++) {
      var bad = i < n && isError(i);
      if (bad && s < 0) s = i;
      if (!bad && s >= 0) {
        var ya = y(dArr[s] - step / 2), yb = y(dArr[i - 1] + step / 2);
        p.push('<rect class="t-mismatch" x="' + (xLane + 2) + '" y="' + Math.min(ya, yb).toFixed(1) +
          '" width="3" height="' + Math.max(1, Math.abs(yb - ya)).toFixed(1) + '"/>');
        s = -1;
      }
    }
    p.push('<text class="t-tick" x="' + (xLane + 4) + '" y="' + (top - 10) + '" text-anchor="middle">≠</text>');

    var hl = highlightSet();
    if (hl) {
      contiguous(hl).forEach(function (r) {
        var ya = y(dArr[r[0]] - step / 2), yb = y(dArr[r[1] - 1] + step / 2);
        p.push('<rect x="' + (xRef - 2) + '" y="' + Math.min(ya, yb).toFixed(1) + '" width="' + (colW + 4) +
          '" height="' + Math.max(1.6, Math.abs(yb - ya)).toFixed(1) + '" fill="none" stroke="#263a35" stroke-width="1.4"/>');
      });
    }

    p.push('<rect class="t-hit" x="' + xRef + '" y="' + top + '" width="' + colW + '" height="' + ih + '"/>');
    p.push('<rect class="t-hit" x="' + xPred + '" y="' + top + '" width="' + colW + '" height="' + ih + '"/>');
    p.push('<line class="t-cursor" x1="' + axW + '" y1="0" x2="' + (W - 2) + '" y2="0" opacity="0" data-cursor="1"/>');
    renderSvg(el.columnsSvg, W, H, p.join(''), '岩性柱：左参考右预测，共 ' + n + ' 点，选中段加描边');
  }

  function columnRuns(which, x, w, y, dArr, step, n) {
    var out = [], i = 0;
    while (i < n) {
      var key = which === 'ref' ? refKey(i) : predKey(i);
      var j = i + 1;
      while (j < n && (which === 'ref' ? refKey(j) : predKey(j)) === key) j++;
      var ya = y(dArr[i] - step / 2), yb = y(dArr[j - 1] + step / 2);
      var fill = key === 'unknown' ? 'url(#hatchU)' : (key === 'reject' ? 'url(#hatchR)' : classColor(key));
      out.push('<rect x="' + x + '" y="' + Math.min(ya, yb).toFixed(1) + '" width="' + w +
        '" height="' + Math.max(1.1, Math.abs(yb - ya)).toFixed(1) + '" fill="' + fill + '"/>');
      i = j;
    }
    out.push('<rect class="t-frame" x="' + x + '" y="' + y(dArr[0] - step / 2).toFixed(1) + '" width="' + w +
      '" height="' + (y(dArr[n - 1] + step / 2) - y(dArr[0] - step / 2)).toFixed(1) + '"/>');
    return out.join('');
  }

  function columnsIndexAt(clientY) {
    if (!cctx || !el.columnsSvg) return -1;
    var box = el.columnsSvg.getBoundingClientRect();
    var scale = box.height / (el.columnsSvg.viewBox.baseVal.height || box.height || 1);
    if (!scale) return -1;
    var py = (clientY - box.top) / scale;
    var frac = (py - cctx.top) / cctx.ih;
    return Math.max(0, Math.min(cctx.n - 1, Math.round(frac * (cctx.n - 1))));
  }
  function onColumnsDown(e) {
    if (!e.target.closest || !e.target.closest('.t-hit')) return;
    var i = columnsIndexAt(e.clientY);
    if (i >= 0) selectRunAt(i);
  }
  function onColumnsMove(e) {
    if (e.pointerType === 'touch') return;
    var line = el.columnsSvg.querySelector('[data-cursor]');
    if (!line) return;
    var box = el.columnsSvg.getBoundingClientRect();
    var scale = box.height / (el.columnsSvg.viewBox.baseVal.height || box.height || 1);
    var py = (e.clientY - box.top) / (scale || 1);
    line.setAttribute('y1', py.toFixed(1));
    line.setAttribute('y2', py.toFixed(1));
    line.setAttribute('opacity', '0.5');
  }
  function onColumnsLeave() {
    var line = el.columnsSvg && el.columnsSvg.querySelector('[data-cursor]');
    if (line) line.setAttribute('opacity', '0');
  }

  /* ----- 矩阵 ----- */
  function paintMatrix() {
    var host = el.matrix;
    if (!host) return;
    var m = data.metrics, c = classes.length;
    var max = 1;
    m.matrix.forEach(function (row) { row.forEach(function (val) { if (val > max) max = val; }); });

    var focus = document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.cell : null;
    var sel = state.selection && state.selection.mode === 'cell' ? state.selection : null;

    var html = '<table class="matrix" aria-label="' + esc(matrixCaption()) + '"><thead><tr>' +
      '<th class="corner" scope="col">参考 \\ 预测</th>' +
      classes.map(function (k) { return '<th scope="col">' + esc(k.name) + '</th>'; }).join('') +
      '<th scope="col">拒判</th></tr></thead><tbody>';

    for (var r = 0; r <= c; r++) {
      html += '<tr><th scope="row">' + (r === c ? '未映射' : esc(classes[r].name)) + '</th>';
      for (var p = 0; p <= c; p++) {
        var val = m.matrix[r][p];
        var lv = val === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(val / max * 4)));
        var cls = 'cell' + (val === 0 ? ' is-zero' : '') + (r === p && r < c ? ' is-diag' : '');
        var rk = r === c ? 'unknown' : classes[r].code;
        var pk = p === c ? 'reject' : classes[p].code;
        if (sel && sel.refKey === rk && sel.predKey === pk) cls += ' is-sel';
        html += '<td><button type="button" class="' + cls + '" data-lv="' + lv + '" data-cell="' + r + '-' + p +
          '" aria-label="参考 ' + esc(r === c ? '未映射' : classes[r].name) + '，预测 ' +
          esc(p === c ? '拒判' : classes[p].name) + '，' + val + ' 点">' + val + '</button></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    host.innerHTML = html;

    host.querySelector('table').addEventListener('click', function (e) {
      var b = e.target.closest('.cell');
      if (!b) return;
      var parts = b.dataset.cell.split('-');
      var r = Number(parts[0]), p = Number(parts[1]);
      var rk = r === c ? 'unknown' : classes[r].code;
      var pk = p === c ? 'reject' : classes[p].code;
      if (!m.matrix[r][p]) {
        state.selection = null;
        paintAll();
        el.sel_mode.textContent = '该格为 0';
        el.detail.innerHTML = '这一格没有样本，不构成一组可查看的深度位置。';
        return;
      }
      state.selection = { mode: 'cell', refKey: rk, predKey: pk };
      paintAll();
      var again = host.querySelector('[data-cell="' + b.dataset.cell + '"]');
      if (again) again.focus({ preventScroll: true });
    });

    if (focus) {
      var back = host.querySelector('[data-cell="' + focus + '"]');
      if (back) back.focus({ preventScroll: true });
    }
    el.matrix_cap.textContent = '共 ' + int(m.total) + ' 点';
  }

  function matrixCaption() {
    var m = data.metrics;
    return '合计 ' + int(m.total) + ' 点 = 已知参考 ' + int(m.evaluated) + ' + 未映射 ' + int(m.unknownReference) +
      '；拒判 ' + int(m.rejectedKnown) + ' 点（仍在已知参考分母内）。已知参考错判 ' +
      int(knownErrorCount()) + ' 点 = 非对角 ' + int(nonDiagonalKnown()) + ' + 拒判 ' + int(m.rejectedKnown) + '。';
  }

  /* ----- 指标 ----- */
  function paintMetrics() {
    var m = data.metrics, maj = data.majMetrics;
    var na = m.macroF1 === null;

    el.m_f1.textContent = na ? '不适用' : pct(m.macroF1, 2);
    el.m_f1.className = na ? 'is-na' : '';
    var distinct = {};
    for (var i = 0; i < data.n; i++) { var rc = refCode(i); if (rc !== null) distinct[rc] = 1; }
    var single = Object.keys(distinct).length === 1;
    el.m_f1s.textContent = na
      ? '本井没有已知参考点，分数不适用。'
      : '精确 ' + pct(m.macroF1, 4) + ' · 四类等权平均' +
        (single ? '；本井参考只有 ' + className(Number(Object.keys(distinct)[0])) + ' 一类，满分也只能到 25%' : '');

    el.m_acc.textContent = pct(m.accuracy, 2);
    el.m_known.textContent = int(m.evaluated) + '/' + int(m.total);
    el.m_unknown.textContent = int(m.unknownReference) + ' 点';
    el.m_refcov.textContent = pct(m.referenceCoverage, 1);
    el.m_reject.textContent = int(m.rejectedKnown) + ' 点';
    el.m_predcov.textContent = pct(m.predictionCoverage, 1);

    el.m_maj_f1.textContent = pct(maj.macroF1, 2);
    el.m_maj_acc.textContent = pct(maj.accuracy, 2);
    el.m_maj_class.textContent = className(data.majCode);
    var better = (m.macroF1 !== null && maj.macroF1 !== null && m.macroF1 > maj.macroF1);
    el.m_maj_note.textContent = better ? '宏 F1 高于基线' : '宏 F1 未超过基线';
    el.m_maj_note.style.color = better ? '' : 'var(--clay-d)';

    el.per_class.innerHTML = m.perClass.map(function (p, i) {
      var cc = classes[i];
      return '<tr><td><span class="swatch" style="background:' + cc.color + '"></span>' + esc(className(p.code)) +
        '</td><td class="' + (p.precision === 0 ? 'is-zero' : '') + '">' + pct(p.precision, 1) +
        '</td><td class="' + (p.recall === 0 ? 'is-zero' : '') + '">' + pct(p.recall, 1) +
        '</td><td class="' + (p.f1 === 0 ? 'is-zero' : '') + '">' + pct(p.f1, 1) +
        '</td><td>' + int(p.support) + '</td></tr>';
    }).join('');

    el.filter_tip.innerHTML = filterTip();
  }

  function filterTip() {
    var v = vis();
    var out = ['入图 ' + v.shown + ' / ' + data.n];
    if (v.missing) out.push('轴缺失 ' + v.missing);
    if (v.hidden) out.push('过滤隐藏 ' + v.hidden);
    if (state.errorsOnly) out.push('已知错判 ' + knownErrorCount() + ' 点（含拒判）');
    return out.join(' · ');
  }

  function knownErrorCount() {
    var n = 0;
    for (var i = 0; i < data.n; i++) if (isError(i)) n++;
    return n;
  }
  function nonDiagonalKnown() {
    var m = data.metrics, c = classes.length, s = 0;
    for (var r = 0; r < c; r++) for (var p = 0; p < c; p++) if (r !== p) s += m.matrix[r][p];
    return s;
  }

  /* ----- 选中 ----- */
  function highlightSet() {
    var sel = state.selection, set = {}, i;
    if (!sel) return null;
    if (sel.mode === 'sample') { set[sel.index] = 1; return set; }
    if (sel.mode === 'range') {
      for (i = sel.start; i < sel.end; i++) set[i] = 1;
      return set;
    }
    for (i = 0; i < data.n; i++) if (refKey(i) === sel.refKey && predKey(i) === sel.predKey) set[i] = 1;
    return set;
  }

  function contiguous(set) {
    var keys = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [], open = null;
    keys.forEach(function (i) {
      if (open && i === open[1]) { open[1] = i + 1; return; }
      if (open) out.push(open);
      open = [i, i + 1];
    });
    if (open) out.push(open);
    return out;
  }

  function selectSample(i) {
    state.selection = { mode: 'sample', index: i };
    paintAll();
    if (el.scatterSvg) el.scatterSvg.focus({ preventScroll: true });
  }
  function selectRunAt(i) {
    var key = refKey(i), a = i, b = i;
    while (a > 0 && refKey(a - 1) === key) a--;
    while (b < data.n - 1 && refKey(b + 1) === key) b++;
    state.selection = { mode: 'range', start: a, end: b + 1 };
    paintAll();
  }
  function clearSelection() {
    state.selection = null;
    paintAll();
    if (el.scatterSvg) el.scatterSvg.focus({ preventScroll: true });
  }

  function paintDetail() {
    var sel = state.selection;
    if (!sel) {
      el.sel_mode.textContent = '未选中';
      el.detail.innerHTML = '在两个柱、散点或矩阵格上点选一个样本组合；散点方向键移动，Enter 选中，Esc 清除。';
      return;
    }
    if (sel.mode === 'sample') return detailSample(sel.index);
    if (sel.mode === 'range') return detailRange(sel.start, sel.end);
    return detailCell(sel.refKey, sel.predKey);
  }

  function detailSample(i) {
    var w = data.well, r = refCode(i), pr = predCode(i);
    var orig = w.originalLithologyCode ? w.originalLithologyCode[i] : null;
    var ok = r !== null && pr === r;
    var vote = data.pred.voteFractions[i];
    var share = data.pred.topVoteShare[i];

    el.sel_mode.textContent = '第 ' + (i + 1) + ' 点';
    var html = '<b>' + num(w.depth_m[i], 2) + ' m</b> · 第 ' + (i + 1) + ' / ' + data.n + ' 点' +
      '<dl>' +
      '<div><dt>参考</dt><dd>' + (r === null ? '未映射' : esc(className(r))) + '</dd></div>' +
      '<div><dt>原始码</dt><dd>' + esc(orig === null || orig === undefined ? '—' : orig) + '</dd></div>' +
      '<div><dt>预测</dt><dd>' + (pr === null ? '拒判' : esc(className(pr))) + '</dd></div>' +
      '<div><dt>判定</dt><dd class="' + (r === null ? '' : (ok ? 'hit' : 'miss')) + '">' +
      (r === null ? '无参考，不判对错' : (ok ? '正确' : '错判')) + '</dd></div>' +
      '<div><dt>邻居投票占比</dt><dd>' +
      (share === null ? '—' : pct(share, 0) + '（' + Math.round(share * data.pred.k) + '/' + data.pred.k + '）') +
      '</dd></div>' +
      '</dl>' + curveReadout(i);

    if (vote) {
      html += '<ul class="vote-list">' + classes.map(function (k, ci) {
        return '<li><span>' + esc(k.name) + '</span><span class="bar"><span style="width:' +
          (vote[ci] * 100).toFixed(1) + '%;background:' + k.color + '"></span></span><span class="n">' +
          (vote[ci] * 100).toFixed(0) + '%</span></li>';
      }).join('') + '</ul>';
    }
    html += '<span class="k">投票占比是等权邻居频率，不是概率；低票不会自动拒判。</span>';
    el.detail.innerHTML = html;
  }

  function curveReadout(i) {
    var out = '<dl style="margin-top:6px">';
    CURVES.forEach(function (c) {
      var v = data.well.curves[c.key] ? data.well.curves[c.key][i] : null;
      out += '<div><dt>' + c.label + ' · ' + c.unit + '</dt><dd>' +
        (inView(v) ? (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3)) : '缺失') + '</dd></div>';
    });
    return out + '</dl>';
  }

  function detailRange(a, b) {
    var w = data.well, dArr = w.depth_m;
    var n = data.n;
    var step = n > 1 ? (dArr[n - 1] - dArr[0]) / (n - 1) : 1;
    var top = dArr[a] - step / 2, bottom = dArr[b - 1] + step / 2;
    var refName = refKey(a) === 'unknown' ? '未映射参考' : className(refKey(a));
    var counts = {}, bad = 0;
    for (var i = a; i < b; i++) {
      var k = predKey(i);
      counts[k] = (counts[k] || 0) + 1;
      if (isError(i)) bad++;
    }
    var dist = Object.keys(counts).map(function (k) {
      return (k === 'reject' ? '拒判' : className(Number(k))) + ' ' + counts[k];
    }).join(' · ');

    el.sel_mode.textContent = '段 ' + (a + 1) + '–' + b;
    el.detail.innerHTML =
      '<b>' + num(top, 2) + ' – ' + num(bottom, 2) + ' m</b>（' + (b - a) + ' 点）' +
      '<dl>' +
      '<div><dt>参考</dt><dd>' + esc(refName) + '</dd></div>' +
      '<div><dt>预测构成</dt><dd style="text-align:left">' + esc(dist) + '</dd></div>' +
      '<div><dt>错判</dt><dd class="' + (bad ? 'miss' : 'hit') + '">' + bad + ' / ' + (b - a) + '</dd></div>' +
      '</dl>' +
      '<span class="k">连续同名段按参考类切分；换选中来源会先清掉旧的。' +
      (refKey(a) === 'unknown' ? '未映射段没有可判定的参考，因此错判计 0。' : '') + '</span>';
  }

  function detailCell(rk, pk) {
    var idx = [], refTotal = 0;
    for (var i = 0; i < data.n; i++) {
      if (refKey(i) === rk) refTotal++;
      if (refKey(i) === rk && predKey(i) === pk) idx.push(i);
    }
    var refName = rk === 'unknown' ? '未映射参考' : className(rk);
    var predName = pk === 'reject' ? '拒判' : className(pk);
    el.sel_mode.textContent = idx.length + ' 点';
    if (!idx.length) {
      el.detail.innerHTML = '该组合为 0 点。';
      return;
    }
    var dArr = data.well.depth_m;
    el.detail.innerHTML =
      '<b>' + esc(refName) + ' → ' + esc(predName) + '</b>' +
      '<dl>' +
      '<div><dt>点数</dt><dd>' + idx.length + ' 点</dd></div>' +
      '<div><dt>占参考类</dt><dd>' + (rk === 'unknown' ? '不计入（无参考）' : pct(idx.length / refTotal, 1)) + '</dd></div>' +
      '<div><dt>深度范围</dt><dd>' + num(dArr[idx[0]], 2) + ' – ' + num(dArr[idx[idx.length - 1]], 2) + ' m</dd></div>' +
      '</dl>' +
      '<span class="k">' + (rk === 'unknown'
        ? '未映射参考没有可判定的真值，不计入错判，也不进 P/R/F1；它仍会得到模型预测。'
        : '两柱上已用描边标出这些深度，散点其余点转为背景色。') + '</span>';
  }

  /* ---------------- 启动 ---------------- */
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
    if (mode === 'stress') { var x=document.getElementById('well'); x.value=window.WelllogDemoData.batch.split.test[0]; x.dispatchEvent(new Event('change',{bubbles:true})); }
  });
})();
