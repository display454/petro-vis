/* =========================================================
   w5 测井数据修复 · 视图与控制器
   ---------------------------------------------------------
   数据 data.js（WelllogDemoData）→ 内核 core.js（WelllogRepairCore）。
   接线顺序固定：makeMask → repairCurve(mask.visible, {linear}) 与
   repairCurve(mask.visible, {ridge, model})；原始 GR 只用于评价与真值显示。
   换井 / 改比例才重新遮罩与修复；切方法、切真值、选中都只重画。
   ========================================================= */
(function () {
  'use strict';

  var D = window.WelllogDemoData;
  var C = window.WelllogRepairCore;
  var el = {};

  var AUX = [
    { key: 'rhob_g_cm3', label: 'RHOB', unit: 'g/cm³', log: false },
    { key: 'nphi_vv', label: 'NPHI', unit: 'v/v', log: false },
    { key: 'rdep_ohm_m', label: 'log RDEP', unit: 'Ω·m', log: true }
  ];
  var UNKNOWN = '#a7afa6';

  var model = null;
  var wells = [];
  var state = null;
  var data = null;
  var pending = false;
  var errorText = '';

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return x.toFixed(d === undefined ? 2 : d);
  }
  function pct(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return (x * 100).toFixed(d === undefined ? 1 : d) + '%';
  }
  function int(n) { return Number(n).toLocaleString('en-US'); }
  function inView(v) { return typeof v === 'number' && isFinite(v); }

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
  function ext(arr) {
    var lo = Infinity, hi = -Infinity;
    arr.forEach(function (v) { if (inView(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } });
    return [lo, hi];
  }
  function lin(a, b, p, q) {
    var d = (b - a) || 1;
    return function (v) { return p + (v - a) / d * (q - p); };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    cache();
    if (!D || !C) { fatal('缺少数据或内核脚本：请确认 data.js 与 core.js 与本页同目录。'); return; }
    wells = D.batch.wells.slice();
    try {
      model = C.fitRepair(trainWells(), { lambda: D.defaults.repair.lambda });
    } catch (err) { fatal('拟合失败：' + err.message); return; }

    var val = wells.filter(function (w) { return D.batch.split.validation.indexOf(w.wellId) >= 0; })[0];
    state = {
      wellId: (val || wells[0]).wellId,
      ratio: D.defaults.repair.ratio,
      method: 'both',
      showTruth: true,
      selection: null
    };

    buildStaticUI();
    el.mainSvg = createSvg(el.track_main, 640, 420);
    el.auxSvg = createSvg(el.track_aux, 306, 420);
    el.localSvg = createSvg(el.local, 640, 214);
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
    ['well', 'well-tip', 'ratio', 'ratio-out', 'method-group', 'method-out', 'show-truth',
      'facts', 'reset', 'bt-mode', 'track-legend', 'track-main', 'track-aux', 'track-status',
      'gap-list', 'gap-cap', 'local', 'local-hint', 'm-body', 'cmp-common', 'cmp-list',
      'cmp-a', 'cmp-b', 'cmp-t', 'cmp-d', 'cmp-note', 'sel-mode', 'detail', 'source', 'alert'
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

  function buildStaticUI() {
    el.well.innerHTML = wells.map(function (w) {
      var s = splitOf(w.wellId);
      return '<option value="' + esc(w.wellId) + '">' + esc(w.wellId) + ' · ' + esc(splitLabel(s)) + '</option>';
    }).join('');

    el.track_legend.innerHTML =
      '<li><i class="lg-obs"></i>可见 GR（原始）</li>' +
      '<li><i class="lg-band"></i>遮挡区（有真值，仅这里评价）</li>' +
      '<li><i class="lg-dot"></i>遮挡点真值</li>' +
      '<li><i class="lg-truth"></i>真值细线</li>' +
      '<li><i class="lg-lin"></i>线性插值（点线）</li>' +
      '<li><i class="lg-ridge"></i>岭回归（长虚线）</li>' +
      '<li><i class="lg-genuine"></i>真缺口（无真值，不评价）</li>';

    el.facts.innerHTML =
      '<div><dt>目标曲线</dt><dd>GR · API</dd></div>' +
      '<div><dt>λ</dt><dd>' + num(model.lambda, 0) + '（只读）</dd></div>' +
      '<div><dt>辅助特征</dt><dd>' + AUX.map(function (a) { return a.label; }).join(' / ') + '</dd></div>' +
      '<div><dt>训练点</dt><dd>' + int(model.trainingSamples) + ' 点</dd></div>' +
      '<div><dt>seed</dt><dd>' + esc(D.defaults.repair.seed) + '</dd></div>' +
      '<div><dt>块长</dt><dd>' + D.defaults.repair.blockSamples + ' 点</dd></div>';

    var src = D.batch.source || {};
    var lic = src.licenses || {};
    var files = (src.files || []).map(function (f) {
      return '<div><dt>' + esc(f.name) + '</dt><dd>' + esc(String(f.sha256).slice(0, 20)) + '…</dd></div>';
    }).join('');
    el.source.innerHTML =
      '<p>' + esc(src.label || '') + '</p>' +
      '<dl>' +
      '<div><dt>曲线许可</dt><dd>' + esc(lic.curves || '—') + '</dd></div>' +
      '<div><dt>标签许可</dt><dd>' + esc(lic.labels || '—') + '</dd></div>' +
      '<div><dt>获取日期</dt><dd>' + esc(src.retrievedAt || '—') + '</dd></div>' +
      '<div><dt>批次指纹</dt><dd>' + esc(String(D.datasetSha256 || '').slice(0, 20)) + '…</dd></div>' +
      files +
      '</dl>' +
      '<p style="margin-top:7px">岭回归只用训练井（' + esc(D.batch.split.train.join('、')) + '）的完整段拟合，' +
      '目标与特征都来自观测，不读岩性标签。</p>' +
      '<p style="margin-top:5px">限制：本批 6 井 GR 全部有效，所以原生缺口为 0；' +
      '真缺口的斜纹与空态用独立结构 fixture 做过检查，但不改公开数据。</p>';
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
      state.selection = null;
      recompute();
      paintAll();
    });

    el.ratio.addEventListener('input', function () {
      var r = Number(el.ratio.value) / 100;
      if (r === state.ratio) return;
      state.ratio = r;
      state.selection = null;
      recompute();
      schedule();
    });

    el.method_group.addEventListener('click', function (e) {
      var b = e.target.closest('.m-chip');
      if (!b) return;
      state.method = b.dataset.method;
      paintAll();
    });

    el.show_truth.addEventListener('change', function () {
      state.showTruth = el.show_truth.checked;
      paintAll();
    });

    el.reset.addEventListener('click', function () {
      var val = wells.filter(function (w) { return D.batch.split.validation.indexOf(w.wellId) >= 0; })[0];
      state.wellId = (val || wells[0]).wellId;
      state.ratio = D.defaults.repair.ratio;
      state.method = 'both';
      state.showTruth = true;
      state.selection = null;
      el.ratio.value = String(Math.round(state.ratio * 100));
      recompute();
      paintAll();
    });

    el.gap_list.addEventListener('click', function (e) {
      var b = e.target.closest('.gap-chip');
      if (!b) return;
      selectGap(b.dataset.gap);
    });

    if (el.mainSvg) {
      el.mainSvg.addEventListener('pointerdown', onTrackDown);
      el.mainSvg.addEventListener('keydown', onTrackKey);
    }
    if (el.localSvg) {
      el.localSvg.addEventListener('pointerdown', onLocalDown);
      el.localSvg.addEventListener('keydown', onTrackKey);
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

  /* ---------------- 重算（换井 / 改比例） ---------------- */
  function recompute() {
    errorText = '';
    el.alert.hidden = true;
    try {
      var well = wells.filter(function (w) { return w.wellId === state.wellId; })[0];
      var mask = C.makeMask(well, {
        curve: 'gr_api', ratio: state.ratio,
        seed: D.defaults.repair.seed, blockSamples: D.defaults.repair.blockSamples
      });
      /* 两法各自独立，都只接收 mask.visible；原始 GR 只留给评价与真值显示 */
      var a = C.repairCurve(mask.visible, mask, { method: 'linear' });
      var b = C.repairCurve(mask.visible, mask, { method: 'ridge', model: model });
      var truth = well.curves.gr_api;
      data = {
        well: well,
        split: splitOf(well.wellId),
        mask: mask,
        lin: a,
        rid: b,
        ea: C.evaluateRepair(truth, a.filled, mask.flags),
        eb: C.evaluateRepair(truth, b.filled, mask.flags),
        cmp: C.compareRepairs(truth, a.filled, b.filled, mask.flags),
        n: well.depth_m.length
      };
      var genuine = mask.gapKind.filter(function (k) { return k === 'genuine'; }).length;
      data.genuine = genuine;
      /* 默认不预选；若原选中缺口在新比例下不存在则清掉 */
      if (state.selection && !gapById(state.selection.gapId)) state.selection = null;
    } catch (err) {
      data = null;
      errorText = err && err.message ? err.message : String(err);
      el.alert.hidden = false;
      el.alert.innerHTML = '<b>计算失败</b> ' + esc(errorText) + '。指标已清空，不显示上一次的数值。';
    }
  }

  function gapById(id) {
    if (!data || !id) return null;
    var arr = data.mask.gaps;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function gapAt(i) {
    if (!data) return null;
    var arr = data.mask.regions;
    for (var k = 0; k < arr.length; k++) if (i >= arr[k].start && i < arr[k].end) return arr[k];
    return null;
  }

  /* ---------------- 绘制 ---------------- */
  function paintAll() {
    if (!state) return;
    syncControls();
    if (!data || errorText) { clearViews(); return; }
    el.alert.hidden = true;
    paintMeta();
    paintMain();
    paintAux();
    paintGapList();
    paintLocal();
    paintMetrics();
    paintDetail();
  }

  function clearViews() {
    renderSvg(el.mainSvg, 640, 420, '<text class="t-empty" x="320" y="210" text-anchor="middle">指标已清空</text>', '主曲线轨：已清空');
    renderSvg(el.auxSvg, 306, 420, '', '辅助曲线：已清空');
    renderSvg(el.localSvg, 640, 214, '', '局部对比：已清空');
    el.gap_list.innerHTML = '';
    el.m_body.innerHTML = '';
    if (el.cmp_common) el.cmp_common.textContent = '—';
    ['cmp-a', 'cmp-b', 'cmp-t', 'cmp-d', 'sel-mode', 'track-status', 'gap-cap'].forEach(function (id) {
      var node = el[id.replace(/-/g, '_')];
      if (node) node.textContent = '—';
    });
    if (el.detail) el.detail.textContent = '指标已清空。';
    if (el.cmp_note) el.cmp_note.textContent = '—';
  }

  function syncControls() {
    el.well.value = state.wellId;
    el.ratio.value = String(Math.round(state.ratio * 100));
    el.ratio_out.textContent = Math.round(state.ratio * 100) + '%';
    el.show_truth.checked = state.showTruth;
    el.method_out.textContent = state.method === 'both' ? '两种' : (state.method === 'linear' ? '线性' : '岭回归');
    [].forEach.call(el.method_group.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.method === state.method));
    });
    var s = data ? data.split : splitOf(state.wellId);
    el.well_tip.textContent = s === 'train'
      ? '训练井：模型在它上面拟合过，这里的修复分数是回代。'
      : (s === 'validation' ? '验证井：λ 与遮罩参数在这类井上核对。' : '测试井：λ 固定，不按这里的分数换参数。');
  }

  function paintMeta() {
    var s = data.split;
    el.bt_mode.textContent = s === 'train' ? '训练回代 · 非泛化'
      : (s === 'validation' ? '验证井' : '冻结设置 · 测试展示');
    el.bt_mode.className = 'bt-live' + (s === 'test' ? ' is-frozen' : '');
  }

  /* ----- 全井段主轨 ----- */
  function paintMain() {
    var host = el.track_main;
    if (!host || !el.mainSvg) return;
    var W = Math.max(280, Math.round(host.clientWidth || 620));
    var H = window.innerWidth < 900 ? 320 : 420;
    var m = { l: 46, r: 14, t: 22, b: 48 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var n = data.n, dArr = data.well.depth_m;
    var step = n > 1 ? (dArr[n - 1] - dArr[0]) / (n - 1) : 1;
    var y = lin(dArr[0] - step / 2, dArr[n - 1] + step / 2, m.t, m.t + ih);

    var truth = data.well.curves.gr_api;
    var vis = data.mask.visible.curves.gr_api;
    var vals = [];
    [vis, data.lin.filled, data.rid.filled].forEach(function (arr) {
      arr.forEach(function (v) { if (inView(v)) vals.push(v); });
    });
    if (state.showTruth) truth.forEach(function (v) { if (inView(v)) vals.push(v); });
    var r = ext(vals);
    var pad = (r[1] - r[0]) * 0.06 || 5;
    var x = lin(r[0] - pad, r[1] + pad, m.l, m.l + iw);

    var p = [];
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>');
    p.push('<defs><pattern id="hatchG-main" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="#f4f2ea"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b9b2a2" stroke-width="1.4"/></pattern>' +
      '<clipPath id="clipMain"><rect x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/></clipPath></defs>');

    /* 深度网格 + 刻度 */
    niceTicks(dArr[0], dArr[n - 1], 6).forEach(function (v) {
      var py = y(v);
      p.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (m.l + iw) + '" y2="' + py.toFixed(1) + '"/>');
      p.push('<text class="t-depth" x="' + (m.l - 7) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(0) + '</text>');
    });
    var xt = niceTicks(r[0], r[1], 5);
    xt.forEach(function (v) {
      var px = x(v);
      if (px < m.l - 1 || px > m.l + iw + 1) return;
      p.push('<line class="t-grid-v" x1="' + px.toFixed(1) + '" y1="' + m.t + '" x2="' + px.toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
      p.push('<text class="t-tick" x="' + px.toFixed(1) + '" y="' + (m.t + ih + 18) + '" text-anchor="middle">' +
        tickLabel(v, Math.abs(xt[1] - xt[0])) + '</text>');
    });
    p.push('<text class="t-title" x="' + (m.l + iw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">GR · API</text>');

    /* 区域底色：遮挡 / 真缺口 */
    var regions = data.mask.regions;
    regions.forEach(function (g) {
      var ya = y(dArr[g.start] - step / 2), yb = y(dArr[g.end - 1] + step / 2);
      p.push('<rect class="' + (g.kind === 'masked' ? 't-band' : 't-genuine') + '" x="' + m.l + '" y="' +
        Math.min(ya, yb).toFixed(1) + '" width="' + iw + '" height="' +
        Math.max(1.2, Math.abs(yb - ya)).toFixed(1) + '"/>');
    });
    p.push('<rect class="t-frame" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    /* 曲线组统一裁剪到绘图区：超出 x 域的修复值不能画到框外 */
    var curves = [];
    curves.push(pathSegments(vis, x, y, 't-obs'));
    /* 修复曲线只画被遮挡点，避免盖住可见段 */
    if (state.method !== 'ridge') curves.push(pathSegments(data.lin.filled, x, y, 't-lin', data.mask.flags));
    if (state.method !== 'linear') curves.push(pathSegments(data.rid.filled, x, y, 't-ridge', data.mask.flags));
    /* 遮挡点真值：空心点 + 可选细线 */
    if (state.showTruth) {
      curves.push(pathSegments(truth, x, y, 't-truth', data.mask.flags));
      data.mask.flags.forEach(function (f, i) {
        if (!f || !inView(truth[i])) return;
        curves.push('<circle class="t-tpt" cx="' + x(truth[i]).toFixed(1) + '" cy="' + y(dArr[i]).toFixed(1) + '" r="2.1"/>');
      });
    }
    p.push('<g clip-path="url(#clipMain)">' + curves.join('') + '</g>');
    /* 选中：缺口高亮 + 游标 */
    var sel = state.selection;
    if (sel) {
      var g = gapById(sel.gapId);
      if (g) {
        var ya2 = y(dArr[g.start] - step / 2), yb2 = y(dArr[g.end - 1] + step / 2);
        p.push('<rect class="t-gapband" x="' + m.l + '" y="' + Math.min(ya2, yb2).toFixed(1) + '" width="' +
          iw + '" height="' + Math.max(2, Math.abs(yb2 - ya2)).toFixed(1) + '"/>');
      }
      if (sel.index !== null && sel.index >= 0) {
        var py2 = y(dArr[sel.index]);
        p.push('<line class="t-cursor" x1="' + m.l + '" y1="' + py2.toFixed(1) + '" x2="' + (m.l + iw) + '" y2="' + py2.toFixed(1) + '"/>');
      }
    }
    p.push('<rect class="t-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    renderSvg(el.mainSvg, W, H, p.join(''), 'GR 全井段：遮挡区 ' + data.mask.masked +
      ' 点，线性与岭回归两条修复线；点按或方向键选择遮挡点');

    var status = '本井 ' + int(n) + ' 点，可遮 ' + int(data.mask.eligible) + ' 点；当前遮挡 <b>' +
      data.mask.masked + ' 点</b>（请求 ' + Math.round(data.mask.requestedRatio * 100) + '%，实际 ' +
      pct(data.mask.actualRatio, 2) + '），共 ' + data.mask.gaps.length + ' 段。原生缺口 ' + data.genuine + ' 点。';
    el.track_status.innerHTML = status;
    el.track_status.className = 'plot-status' + (data.mask.masked ? '' : ' is-warn');
  }

  function pathSegments(arr, x, y, cls, onlyFlags) {
    var d = [], open = false, out = '';
    var n = data.n, dArr = data.well.depth_m;
    for (var i = 0; i < n; i++) {
      var ok = inView(arr[i]) && (!onlyFlags || onlyFlags[i]);
      if (ok) {
        d.push((open ? 'L' : 'M') + x(arr[i]).toFixed(1) + ' ' + y(dArr[i]).toFixed(1));
        open = true;
      } else if (open) {
        out += '<path class="' + cls + '" d="' + d.join(' ') + '"/>';
        d = []; open = false;
      }
    }
    if (open) out += '<path class="' + cls + '" d="' + d.join(' ') + '"/>';
    return out;
  }

  /* ----- 辅助轨 ----- */
  function paintAux() {
    var host = el.track_aux;
    if (!host || !el.auxSvg) return;
    var W = Math.max(180, Math.round(host.clientWidth || 306));
    var H = window.innerWidth < 900 ? 320 : 420;
    var m = { l: 34, r: 8, t: 22, b: 48 };
    var ih = H - m.t - m.b;
    var n = data.n, dArr = data.well.depth_m;
    var step = n > 1 ? (dArr[n - 1] - dArr[0]) / (n - 1) : 1;
    var y = lin(dArr[0] - step / 2, dArr[n - 1] + step / 2, m.t, m.t + ih);
    var trackW = Math.floor((W - m.l - m.r - 12) / 3);

    /* 宽屏时辅助轨与主轨并排共享同一深度尺度，不再重复画刻度；窄屏堆叠时才需要 */
    var showDepth = window.innerWidth < 900;
    var p = [];
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>');
    niceTicks(dArr[0], dArr[n - 1], 6).forEach(function (v) {
      var py = y(v);
      p.push('<line class="t-grid" x1="' + (m.l - 2) + '" y1="' + py.toFixed(1) + '" x2="' + (W - 2) + '" y2="' + py.toFixed(1) + '"/>');
      if (showDepth) {
        p.push('<text class="t-depth" x="' + (m.l - 6) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(0) + '</text>');
      }
    });

    AUX.forEach(function (a, k) {
      var x0 = m.l + 4 + k * (trackW + 4);
      var arr = data.well.curves[a.key];
      var vals = [];
      if (arr) arr.forEach(function (v) {
        if (!inView(v)) return;
        vals.push(a.log ? (v > 0 ? Math.log10(v) : NaN) : v);
      });
      vals = vals.filter(inView);
      p.push('<text class="t-title" x="' + (x0 + trackW / 2) + '" y="' + (m.t - 8) + '" text-anchor="middle">' + a.label + '</text>');
      if (!vals.length) {
        p.push('<text class="t-empty" x="' + (x0 + trackW / 2) + '" y="' + (m.t + ih / 2) + '" text-anchor="middle">无</text>');
        return;
      }
      var r = ext(vals), pad = (r[1] - r[0]) * 0.08 || 1;
      var x = lin(r[0] - pad, r[1] + pad, x0, x0 + trackW);
      var mapped = arr ? arr.map(function (v) {
        return inView(v) ? (a.log ? (v > 0 ? Math.log10(v) : null) : v) : null;
      }) : [];
      p.push('<clipPath id="clipAux' + k + '"><rect x="' + x0 + '" y="' + m.t +
        '" width="' + trackW + '" height="' + ih + '"/></clipPath>');
      p.push('<g clip-path="url(#clipAux' + k + ')">' + pathSegments(mapped, x, y, 't-aux') + '</g>');
      p.push('<rect class="t-frame" x="' + x0 + '" y="' + m.t + '" width="' + trackW + '" height="' + ih + '"/>');
      var t1 = a.log ? Math.pow(10, r[0]) : r[0], t2 = a.log ? Math.pow(10, r[1]) : r[1];
      p.push('<text class="t-tick" x="' + (x0 + 2) + '" y="' + (m.t + ih + 15) + '">' +
        (a.log ? fmtOhm(t1) : tickLabel(t1, (t2 - t1) / 2)) + '</text>');
      p.push('<text class="t-tick" x="' + (x0 + trackW - 2) + '" y="' + (m.t + ih + 15) + '" text-anchor="end">' +
        (a.log ? fmtOhm(t2) : tickLabel(t2, (t2 - t1) / 2)) + '</text>');
    });

    renderSvg(el.auxSvg, W, H, p.join(''), '辅助曲线：RHOB、NPHI、log RDEP，与左侧共享深度');
  }

  function fmtOhm(v) {
    return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : (v >= 10 ? v.toFixed(0) : v.toFixed(1));
  }

  /* ----- 缺口列表 ----- */
  function paintGapList() {
    var gaps = data.mask.gaps;
    var sel = state.selection;
    el.gap_list.innerHTML = gaps.map(function (g, i) {
      var top = data.well.depth_m[g.start];
      var bot = data.well.depth_m[g.end - 1];
      return '<button type="button" class="gap-chip" data-gap="' + esc(g.id) + '" aria-pressed="' +
        (sel && sel.gapId === g.id ? 'true' : 'false') + '">' + (i + 1) + ' · ' +
        top.toFixed(0) + '–' + bot.toFixed(0) + ' m · ' + (g.end - g.start) + ' 点</button>';
    }).join('');
    el.gap_cap.textContent = gaps.length
      ? gaps.length + ' 段遮挡 · 共 ' + data.mask.masked + ' 点'
      : '未选择缺口';
  }

  /* ----- 局部对比 ----- */
  function paintLocal() {
    var host = el.local;
    if (!host || !el.localSvg) return;
    var W = Math.max(260, Math.round(host.clientWidth || 620));
    var H = 214;
    var gap = state.selection ? gapById(state.selection.gapId) : null;

    if (!gap) {
      renderSvg(el.localSvg, W, H,
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>' +
        '<text class="t-empty" x="' + (W / 2) + '" y="' + (H / 2 - 4) + '" text-anchor="middle">' +
        (data.mask.gaps.length ? '选择上方任一缺口查看段内对比' : '当前没有遮挡缺口：把遮挡比例调到 1% 以上') + '</text>',
        '局部对比：尚未选择缺口');
      el.local_hint.textContent = '局部对比只在选中缺口后出现；全局指标不受选中影响。';
      return;
    }

    var s0 = gap.start, s1 = gap.end, cnt = s1 - s0;
    var m = { l: 52, r: 14, t: 16, b: 26 };
    var resH = 56, gapH = 16;
    var ih = H - m.t - m.b - resH - gapH;
    var ihRes = resH;
    var yRes0 = m.t + ih + gapH + 10;
    var iw = W - m.l - m.r;
    var truth = data.well.curves.gr_api;
    var dArr = data.well.depth_m;

    var vals = [];
    for (var i = s0; i < s1; i++) {
      [truth[i], data.lin.filled[i], data.rid.filled[i]].forEach(function (v) { if (inView(v)) vals.push(v); });
    }
    if (!vals.length) {
      renderSvg(el.localSvg, W, H,
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>' +
        '<text class="t-empty" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">该段没有可显示的值</text>',
        '局部对比：无可用值');
      return;
    }
    var r = ext(vals), pad = (r[1] - r[0]) * 0.12 || 4;
    var x = lin(s0 - 0.5, s1 - 0.5, m.l, m.l + iw);
    var y = lin(r[0] - pad, r[1] + pad, m.t + ih, m.t);

    var p = [];
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fffefa"/>');
    /* 背景带 */
    p.push('<rect x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="#f4f7f4"/>');
    niceTicks(r[0] - pad, r[1] + pad, 3).forEach(function (v) {
      var py = y(v);
      if (py < m.t - 1 || py > m.t + ih + 1) return;
      p.push('<line class="t-grid" x1="' + m.l + '" y1="' + py.toFixed(1) + '" x2="' + (m.l + iw) + '" y2="' + py.toFixed(1) + '"/>');
      p.push('<text class="t-tick" x="' + (m.l - 7) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(1) + '</text>');
    });
    p.push('<rect class="t-frame" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    /* 真值 + 两法 */
    if (state.showTruth) {
      p.push(pathRange(truth, s0, s1, x, y, 't-truth'));
      for (i = s0; i < s1; i++) {
        if (!inView(truth[i])) continue;
        p.push('<circle class="t-tpt" cx="' + x(i).toFixed(1) + '" cy="' + y(truth[i]).toFixed(1) + '" r="2.3"/>');
      }
    }
    if (state.method !== 'ridge') p.push(pathRange(data.lin.filled, s0, s1, x, y, 't-lin'));
    if (state.method !== 'linear') p.push(pathRange(data.rid.filled, s0, s1, x, y, 't-ridge'));

    /* 选中点竖线 */
    if (state.selection.index !== null && state.selection.index >= s0 && state.selection.index < s1) {
      p.push('<line class="t-cursor" x1="' + x(state.selection.index).toFixed(1) + '" y1="' + m.t +
        '" x2="' + x(state.selection.index).toFixed(1) + '" y2="' + (m.t + ih) + '"/>');
    }

    /* 残差带 */
    var maxRes = 0.0001;
    for (i = s0; i < s1; i++) {
      if (!inView(truth[i])) continue;
      if (inView(data.lin.filled[i])) maxRes = Math.max(maxRes, Math.abs(data.lin.filled[i] - truth[i]));
      if (inView(data.rid.filled[i])) maxRes = Math.max(maxRes, Math.abs(data.rid.filled[i] - truth[i]));
    }
    var yRes = lin(0, maxRes, yRes0, yRes0 + ihRes - 14);
    p.push('<text class="t-res-lbl" x="' + (m.l - 7) + '" y="' + (yRes0 + 4) + '" text-anchor="end">0</text>');
    p.push('<text class="t-res-lbl" x="' + (m.l - 7) + '" y="' + (yRes0 + ihRes - 14 + 4) + '" text-anchor="end">' +
      maxRes.toFixed(1) + '</text>');
    p.push('<line class="t-res-zero" x1="' + m.l + '" y1="' + yRes0 + '" x2="' + (m.l + iw) + '" y2="' + yRes0 + '"/>');
    var bw = Math.max(2, Math.min(7, iw / cnt / 2.6));
    for (i = s0; i < s1; i++) {
      if (!inView(truth[i])) continue;
      var cx = x(i);
      if (state.method !== 'ridge' && inView(data.lin.filled[i])) {
        var ra = Math.abs(data.lin.filled[i] - truth[i]);
        p.push('<rect class="t-res" x="' + (cx - bw - 0.5).toFixed(1) + '" y="' + yRes0 + '" width="' + bw +
          '" height="' + Math.max(0.8, yRes(ra) - yRes0).toFixed(1) + '"/>');
      }
      if (state.method !== 'linear' && inView(data.rid.filled[i])) {
        var rb = Math.abs(data.rid.filled[i] - truth[i]);
        p.push('<rect class="t-res-ridge" x="' + (cx + 0.5).toFixed(1) + '" y="' + yRes0 + '" width="' + bw +
          '" height="' + Math.max(0.8, yRes(rb) - yRes0).toFixed(1) + '"/>');
      }
    }
    p.push('<text class="t-res-lbl" x="' + m.l + '" y="' + (H - 5) + '">残差 |预测−真值|；左=线性，右=岭回归</text>');

    /* 深度刻度（首末） */
    p.push('<text class="t-tick" x="' + m.l + '" y="' + (m.t + ih + 15) + '">' + dArr[s0].toFixed(1) + '</text>');
    p.push('<text class="t-tick" x="' + (m.l + iw) + '" y="' + (m.t + ih + 15) + '" text-anchor="end">' +
      dArr[s1 - 1].toFixed(1) + '</text>');
    p.push('<rect class="t-hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>');

    renderSvg(el.localSvg, W, H, p.join(''), '缺口局部对比：' + cnt + ' 点，含真值与两法残差');

    var own = gapLocal(s0, s1);
    el.local_hint.innerHTML = '本段 ' + cnt + ' 点：线性段内 MAE ' + num(own.a, 2) + '，岭回归段内 MAE ' +
      num(own.b, 2) + '（同口径，只用本段遮挡点）。残差只画在有预测的点上。';
  }

  function pathRange(arr, s0, s1, x, y, cls) {
    var d = [], open = false, out = '';
    for (var i = s0; i < s1; i++) {
      if (inView(arr[i])) {
        d.push((open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arr[i]).toFixed(1));
        open = true;
      } else if (open) { out += '<path class="' + cls + '" d="' + d.join(' ') + '"/>'; d = []; open = false; }
    }
    if (open) out += '<path class="' + cls + '" d="' + d.join(' ') + '"/>';
    return out;
  }

  function gapLocal(s0, s1) {
    var truth = data.well.curves.gr_api;
    function mae(arr) {
      var s = 0, c = 0;
      for (var i = s0; i < s1; i++) {
        if (inView(truth[i]) && inView(arr[i])) { s += Math.abs(arr[i] - truth[i]); c++; }
      }
      return c ? s / c : null;
    }
    return { a: mae(data.lin.filled), b: mae(data.rid.filled) };
  }

  /* ----- 指标 ----- */
  function paintMetrics() {
    var a = data.ea, b = data.eb, cmp = data.cmp;
    function row(label, va, vb, fmt) {
      return '<tr><td>' + label + '</td><td class="v-lin">' + fmt(va) + '</td><td class="v-ridge">' + fmt(vb) + '</td></tr>';
    }
    var f2 = function (v) { return (v === null || v === undefined) ? '不适用' : num(v, 2); };
    var f4 = function (v) { return v === null || v === undefined ? '不适用' : num(v, 4); };
    el.m_body.innerHTML =
      row('MAE · API', a.mae, b.mae, f2) +
      row('RMSE · API', a.rmse, b.rmse, f2) +
      row('R²', a.r2, b.r2, f4) +
      '<tr><td>n / masked</td><td class="v-lin">' + a.n + ' / ' + a.masked + '</td><td class="v-ridge">' +
      b.n + ' / ' + b.masked + '</td></tr>' +
      '<tr><td>预测覆盖</td><td class="v-lin">' + (a.coverage === null ? '不适用' : pct(a.coverage, 1)) +
      '</td><td class="v-ridge">' + (b.coverage === null ? '不适用' : pct(b.coverage, 1)) + '</td></tr>';

    el.cmp_common.textContent = '共同 ' + cmp.common + ' 点';
    el.cmp_a.textContent = cmp.aBetter + ' 点';
    el.cmp_b.textContent = cmp.bBetter + ' 点';
    el.cmp_t.textContent = cmp.tied + ' 点';
    var diff = (cmp.a.mae !== null && cmp.b.mae !== null) ? (cmp.b.mae - cmp.a.mae) : null;
    el.cmp_d.textContent = diff === null ? '不适用' : (diff >= 0 ? '+' : '') + num(diff, 2);

    var parts = [];
    if (cmp.common === 0) {
      parts.push('两法没有共同可预测点，无法比较。');
    } else {
      parts.push('共同 ' + cmp.common + ' 点上，线性更近 ' + cmp.aBetter + ' 点、岭回归更近 ' + cmp.bBetter +
        ' 点。共同点 MAE：线性 ' + num(cmp.a.mae, 2) + '、岭回归 ' + num(cmp.b.mae, 2) + '。');
      if (cmp.aBetter > cmp.bBetter) {
        parts.push('点数上线性占多数，但总体 MAE 要看各自可评价范围与个别大残差，不能只看胜出点数。');
      }
    }
    if (a.n !== b.n) parts.push('两法 n 不同（' + a.n + ' 与 ' + b.n + '），差值只取共同点，不直接相减。');
    el.cmp_note.textContent = parts.join(' ');
  }

  /* ----- 选中 ----- */
  function selectGap(id) {
    var g = gapById(id);
    if (!g) return;
    state.selection = { gapId: g.id, index: g.start, whole: false };
    paintAll();
    if (el.localSvg) el.localSvg.focus({ preventScroll: true });
  }

  function onTrackDown(e) {
    if (!data) return;
    var box = el.mainSvg.getBoundingClientRect();
    var scale = box.height / (el.mainSvg.viewBox.baseVal.height || box.height || 1);
    if (!scale) return;
    var py = (e.clientY - box.top) / scale;
    var m = { t: 22, b: 48 }; // Same depth domain and margins as paintMain.
    var ih = (el.mainSvg.viewBox.baseVal.height) - m.t - m.b;
    var n = data.n;
    var frac = (py - m.t) / ih;
    var idx = Math.floor(frac * n);
    idx = Math.max(0, Math.min(n - 1, idx));
    var g = gapAt(idx);
    if (!g) return;
    if (g.kind === 'genuine') {
      state.selection = { gapId: null, index: idx, whole: false, genuine: true };
      paintAll();
      return;
    }
    state.selection = { gapId: g.id, index: Math.max(g.start, Math.min(g.end - 1, idx)), whole: false };
    paintAll();
  }

  function onLocalDown(e) {
    var gap = state.selection ? gapById(state.selection.gapId) : null;
    if (!gap || !el.localSvg) return;
    var box = el.localSvg.getBoundingClientRect();
    var scale = box.width / (el.localSvg.viewBox.baseVal.width || box.width || 1);
    if (!scale) return;
    var px = (e.clientX - box.left) / scale;
    var m = { l: 52, r: 14 };
    var iw = (el.localSvg.viewBox.baseVal.width) - m.l - m.r;
    var cnt = gap.end - gap.start;
    var frac = (px - m.l) / iw;
    var idx = gap.start + Math.max(0, Math.min(cnt - 1, Math.round(frac * (cnt - 1))));
    state.selection = { gapId: gap.id, index: idx, whole: false };
    paintAll();
  }

  function onTrackKey(e) {
    if (!data) return;
    var key = e.key;
    if (key === 'Escape') {
      state.selection = null;
      paintAll();
      e.preventDefault();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      if (state.selection) {
        var g = gapById(state.selection.gapId);
        if (g) state.selection = { gapId: g.id, index: g.start, whole: true };
        paintAll();
      }
      e.preventDefault();
      return;
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
    e.preventDefault();
    var dir = key === 'ArrowDown' ? 1 : -1;
    if (!state.selection) {
      var first = firstMasked();
      if (first >= 0) { selectIndex(first); }
      return;
    }
    var idx = Math.max(0, Math.min(data.n - 1, (state.selection.index === null ? 0 : state.selection.index) + dir));
    for (var guard = 0; guard < data.n; guard++) {
      if (data.mask.flags[idx]) { selectIndex(idx); return; }
      idx += dir;
      if (idx < 0 || idx >= data.n) return;
    }
  }

  function firstMasked() {
    for (var i = 0; i < data.n; i++) if (data.mask.flags[i]) return i;
    return -1;
  }
  function selectIndex(idx) {
    var g = gapAt(idx);
    state.selection = { gapId: g ? g.id : null, index: idx, whole: false };
    paintAll();
    var host = state.selection.gapId ? el.localSvg : el.mainSvg;
    if (host) host.focus({ preventScroll: true });
  }

  function paintDetail() {
    var sel = state.selection;
    if (!sel) {
      el.sel_mode.textContent = '未选中';
      el.detail.innerHTML = '默认不预选任何点。点缺口或曲线上的位置后再看这里的真值、两法预测与残差。';
      return;
    }
    if (sel.genuine) return detailGenuine(sel.index);
    var gap = gapById(sel.gapId);
    if (sel.whole && gap) return detailGap(gap);
    return detailPoint(sel.index, gap);
  }

  function detailPoint(i, gap) {
    var truth = data.well.curves.gr_api[i];
    var va = data.lin.filled[i], vb = data.rid.filled[i];
    var flagged = data.mask.flags[i];
    el.sel_mode.textContent = '第 ' + (i + 1) + ' 点';
    var ra = inView(va) && inView(truth) ? va - truth : null;
    var rb = inView(vb) && inView(truth) ? vb - truth : null;
    var verdict = (ra !== null && rb !== null)
      ? (Math.abs(ra) < Math.abs(rb) ? '线性更近' : (Math.abs(rb) < Math.abs(ra) ? '岭回归更近' : '相同'))
      : '—';

    el.detail.innerHTML =
      '<b>' + num(data.well.depth_m[i], 2) + ' m</b> · 第 ' + (i + 1) + ' / ' + data.n + ' 点' +
      (gap ? ' · 缺口 ' + gap.id.replace('masked-', '') : '') +
      '<dl>' +
      '<div><dt>区域</dt><dd>' + (flagged ? '遮挡（有真值）' : (inView(truth) ? '可见' : '真缺口')) + '</dd></div>' +
      '<div><dt>真值</dt><dd>' + (inView(truth) ? num(truth, 2) + ' API' : '无真值') + '</dd></div>' +
      '<div><dt>线性</dt><dd class="' + (inView(va) ? 'is-lin' : 'is-na') + '">' +
      (inView(va) ? num(va, 2) : '未预测') + '</dd></div>' +
      '<div><dt>岭回归</dt><dd class="' + (inView(vb) ? 'is-ridge' : 'is-na') + '">' +
      (inView(vb) ? num(vb, 2) : '未预测') + '</dd></div>' +
      '<div><dt>残差 线性</dt><dd>' + (ra === null ? '不适用' : (ra >= 0 ? '+' : '') + num(ra, 2)) + '</dd></div>' +
      '<div><dt>残差 岭回归</dt><dd>' + (rb === null ? '不适用' : (rb >= 0 ? '+' : '') + num(rb, 2)) + '</dd></div>' +
      '<div><dt>更近</dt><dd>' + verdict + '</dd></div>' +
      '</dl>' +
      '<span class="k">' + (flagged
        ? '残差 = 预测 − 真值，只在这种情况下参与指标。'
        : (inView(truth) ? '这对可见点不计误差：它没有被修复。' : '真缺口没有真值，任何误差数字都不该出现在这里。')) + '</span>';
  }

  function detailGap(gap) {
    var s0 = gap.start, s1 = gap.end;
    var own = gapLocal(s0, s1);
    el.sel_mode.textContent = '整段';
    el.detail.innerHTML =
      '<b>缺口 ' + esc(gap.id.replace('masked-', '')) + '</b> · ' + (s1 - s0) + ' 点' +
      '<dl>' +
      '<div><dt>深度</dt><dd>' + num(data.well.depth_m[s0], 2) + ' – ' + num(data.well.depth_m[s1 - 1], 2) + '</dd></div>' +
      '<div><dt>段内 MAE 线性</dt><dd class="is-lin">' + num(own.a, 2) + '</dd></div>' +
      '<div><dt>段内 MAE 岭回归</dt><dd class="is-ridge">' + num(own.b, 2) + '</dd></div>' +
      '</dl>' +
      '<span class="k">段内 MAE 与全局同口径，只用本段的遮挡点；不是另一种模型。</span>';
  }

  function detailGenuine(i) {
    el.sel_mode.textContent = '第 ' + (i + 1) + ' 点';
    var va = data.lin.filled[i], vb = data.rid.filled[i];
    el.detail.innerHTML =
      '<b>' + num(data.well.depth_m[i], 2) + ' m</b> · 真缺口' +
      '<dl>' +
      '<div><dt>真值</dt><dd>无</dd></div>' +
      '<div><dt>线性</dt><dd class="is-na">' + (inView(va) ? num(va, 2) : '未预测') + '</dd></div>' +
      '<div><dt>岭回归</dt><dd class="is-na">' + (inView(vb) ? num(vb, 2) : '未预测') + '</dd></div>' +
      '</dl>' +
      '<span class="k">真缺口没有真值，不评价、不算残差；显示的是估计值。</span>';
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
    if (mode === 'stress') { var x=document.getElementById('well'); x.value=window.WelllogDemoData.batch.split.test[0]; x.dispatchEvent(new Event('change',{bubbles:true})); } if (mode === 'empty') { var x=document.getElementById('ratio'); x.value='0'; x.dispatchEvent(new Event('input',{bubbles:true})); }
  });
})();
