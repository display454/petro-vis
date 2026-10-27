/* =========================================================
   w3 成像裂缝候选 · 控制器
   ---------------------------------------------------------
   core.js → app.js。像素来自 makeImage，候选只来自 searchSinusoids，
   参考裂缝只用于评价与真值图层，绝不参与搜索。
   条件变化（情境/噪声/可见度/seed）→ 重生成+增强+搜索+评价；
   阈值 → 只筛选缓存候选并重新评价；图层与选中 → 只绘制。
   ========================================================= */
(function () {
  'use strict';

  var C = window.WelllogFractureCore;
  var DEFAULTS = {
    seed: 1803, noise: 0.06, visibility: 0.8, preset: 'standard',
    threshold: 0.45, lyEnh: false, lyAll: false, lyRes: true, lyTruth: true
  };
  var MAX_CAND = 12;
  var TOL = { centerTolerance_px: 5, trajectoryTolerance_px: 4 };

  var state = {
    seed: DEFAULTS.seed, noise: DEFAULTS.noise, visibility: DEFAULTS.visibility,
    preset: DEFAULTS.preset, threshold: DEFAULTS.threshold,
    lyEnh: DEFAULTS.lyEnh, lyAll: DEFAULTS.lyAll, lyRes: DEFAULTS.lyRes, lyTruth: DEFAULTS.lyTruth,
    selected: null, cursor: null
  };

  var el = {};
  var gen = null, prep = null, search = null, kept = null, met = null;
  var failed = null, searchMs = 0;
  var focusId = null;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function f2(v) { return isNum(v) ? v.toFixed(2) : '—'; }
  function f3(v) { return isNum(v) ? v.toFixed(3) : '—'; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function boot() {
    cache();
    if (!C || typeof C.makeImage !== 'function') {
      showAlert('内核未加载：没有找到 WelllogFractureCore。请确认 core.js 在 app.js 之前加载。');
      return;
    }
    buildControls();
    syncControls();
    bindList();
    recompute('all');
    paintAll();
  }

  function cache() {
    ['bt-mode', 'alert', 'reset', 'preset-group', 'preset-tip', 'noise', 'noise-out',
      'vis', 'vis-out', 'th', 'th-out', 'ly-enh', 'ly-all', 'ly-res', 'ly-truth',
      'facts', 'perf', 'left-title', 'left-status', 'left-hint', 'right-status',
      'cv-left', 'cv-right', 'ov-left', 'ov-right', 'legend', 'list-status',
      'cand-body', 'm-f1', 'm-f1s', 'm-tp', 'm-fp', 'm-fn', 'm-p', 'm-r', 'm-dist',
      'm-note', 'm-coarse', 'm-kept', 'm-valid', 'm-refs', 'm-tol', 'sel-mode',
      'detail', 'source'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
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
        gen = C.makeImage({
          seed: state.seed, noise: state.noise, visibility: state.visibility, preset: state.preset
        });
        prep = C.prepareImage(gen.image);
        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        search = C.searchSinusoids(prep);
        var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
        searchMs = t1 - t0;
      }
      selectAndScore();
      failed = null;
      hideAlert();
    } catch (e) {
      failed = e;
      gen = null; prep = null; search = null; kept = null; met = null;
      state.selected = null; state.cursor = null;
      showAlert('<b>无法计算</b> ' + esc(e && e.message ? e.message : String(e)) +
        '。候选、指标与明细已清空，不显示上一次的结果。');
    }
  }

  function selectAndScore() {
    kept = C.selectCandidates(search, { threshold: state.threshold, maxCandidates: MAX_CAND });
    met = C.evaluateDetections(kept, gen.reference.fractures, TOL);
    if (state.selected !== null && !byId(state.selected)) {
      state.selected = null;
    }
    if (state.cursor !== null && !byId(state.cursor)) state.cursor = null;
  }

  function byId(id) {
    if (!kept || id === null) return null;
    return kept.filter(function (c) { return c.id === id; })[0] || null;
  }
  function keptIds() { return (kept || []).map(function (c) { return c.id; }); }

  /* ---------------- 控件 ---------------- */
  function buildControls() {
    el['preset-group'].addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var v = b.dataset.preset;
      if (v === state.preset) return;
      state.preset = v;
      state.selected = null; state.cursor = null;
      syncControls();
      recompute('all');
      paintAll();
    });

    var raf = 0;
    function schedule(apply) {
      apply();
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        /* 拖动过程中只按最新参数算一次，旧参数不会覆盖新结果 */
        recompute('all');
        paintAll();
      });
    }
    el.noise.addEventListener('input', function () {
      var v = Number(el.noise.value);
      if (v === state.noise) return;
      schedule(function () { state.noise = v; el['noise-out'].textContent = v.toFixed(2); });
    });
    el.vis.addEventListener('input', function () {
      var v = Number(el.vis.value);
      if (v === state.visibility) return;
      schedule(function () { state.visibility = v; el['vis-out'].textContent = v.toFixed(2); });
    });
    el.th.addEventListener('input', function () {
      var v = Number(el.th.value);
      if (v === state.threshold) return;
      state.threshold = v;
      el['th-out'].textContent = v.toFixed(2);
      /* 阈值只筛缓存并重评价，不重跑搜索 */
      try { selectAndScore(); failed = null; hideAlert(); } catch (err) {
        failed = err; met = null; kept = [];
        state.selected = null; state.cursor = null;
        showAlert('<b>筛选失败</b> ' + esc(err && err.message ? err.message : String(err)) +
          '。指标和选中明细已清空。');
      }
      paintAll();
    });

    [['ly-enh', 'lyEnh'], ['ly-all', 'lyAll'], ['ly-res', 'lyRes'], ['ly-truth', 'lyTruth']]
      .forEach(function (pair) {
        el[pair[0]].addEventListener('change', function () {
          state[pair[1]] = el[pair[0]].checked;
          paintAll();
        });
      });

    el.reset.addEventListener('click', function () {
      Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; });
      state.selected = null; state.cursor = null;
      syncControls();
      recompute('all');
      paintAll();
    });
  }

  function syncControls() {
    el.noise.value = String(state.noise);
    el.vis.value = String(state.visibility);
    el.th.value = String(state.threshold);
    el['noise-out'].textContent = state.noise.toFixed(2);
    el['vis-out'].textContent = state.visibility.toFixed(2);
    el['th-out'].textContent = state.threshold.toFixed(2);
    el['ly-enh'].checked = state.lyEnh;
    el['ly-all'].checked = state.lyAll;
    el['ly-res'].checked = state.lyRes;
    el['ly-truth'].checked = state.lyTruth;
    [].forEach.call(el['preset-group'].querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset));
    });
  }

  /* ---------------- 位图 ---------------- */
  function paintBitmap(canvas, values, mode) {
    var c = canvas.getContext('2d');
    if (!values) { c.clearRect(0, 0, 128, 256); return; }
    var img = c.createImageData(128, 256);
    var d = img.data;
    for (var i = 0; i < 128 * 256; i++) {
      var v = values[i], g;
      if (v === null || v === undefined || !isFinite(v)) {
        g = 236;                     /* 未观测：底色，叠加层会盖斜纹 */
      } else if (mode === 'strength') {
        g = Math.round(255 * (1 - Math.max(0, Math.min(1, v))));
      } else {
        g = Math.round(255 * Math.max(0, Math.min(1, v)));
      }
      d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g; d[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }

  function nullColumns(pixels) {
    var out = [], w = 128, h = 256, start = -1;
    for (var x = 0; x <= w; x++) {
      var allNull = true;
      if (x < w) {
        for (var y = 0; y < h; y++) {
          var v = pixels[y * w + x];
          if (v !== null && v !== undefined && isFinite(v)) { allNull = false; break; }
        }
      } else allNull = false;
      if (allNull && start < 0) start = x;
      if (!allNull && start >= 0) { out.push([start, x]); start = -1; }
    }
    return out;
  }

  function defs() {
    return '<defs><pattern id="hatchNull" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="4" height="4" fill="#e9e4d6"/>' +
      '<line x1="0" y1="0" x2="0" y2="4" stroke="#b4ab97" stroke-width="1.1"/></pattern></defs>';
  }

  function gridMarks(nulls) {
    var out = [];
    for (var x = 0; x < 128; x += 16) {
      out.push('<line class="o-az" x1="' + x + '" y1="0" x2="' + x + '" y2="256"/>');
    }
    (nulls || []).forEach(function (r) {
      out.push('<rect class="o-null" x="' + r[0] + '" y="0" width="' + (r[1] - r[0]) + '" height="256"/>');
    });
    return out.join('');
  }

  function trajectoryPath(c) {
    var rows = C.trajectory(c, 128), d = [];
    for (var x = 0; x < 128; x++) d.push((x ? 'L' : 'M') + x + ' ' + rows[x].toFixed(2));
    return d.join('');
  }

  /* ---------------- 绘制 ---------------- */
  function paintAll() {
    paintMode();
    paintImage();
    paintList();
    paintMetrics();
    paintDetail();
    paintFacts();
    paintSource();
  }

  function paintMode() {
    if (!el['bt-mode']) return;
    if (failed) { el['bt-mode'].textContent = '计算失败'; el['bt-mode'].className = 'bt-live'; return; }
    var map = { standard: '标准图', occluded: '方位缺失', bedding: '层理干扰' };
    el['bt-mode'].textContent = map[state.preset] + ' · 阈值 ' + state.threshold.toFixed(2);
    el['bt-mode'].className = 'bt-live' + (state.preset === 'standard' ? ' is-frozen' : '');
    el['preset-tip'].textContent = state.preset === 'occluded'
      ? '第 24—54 列未观测：用斜纹标出，搜索只看到 97 个有效列，参考几何不变。'
      : state.preset === 'bedding'
        ? '另加一条层理正弦干扰（不在参考裂缝里）。几何检测接受它时按误检计，需要人工确认。'
        : '三条参考裂缝 + 竖条采集干扰；竖条会被垂向增强抑制。';
  }

  function paintImage() {
    var nulls = null;
    if (gen) nulls = nullColumns(gen.image.pixels);

    paintBitmap(el['cv-left'], gen ? (state.lyEnh ? prep.strength : gen.image.pixels) : null, state.lyEnh ? 'strength' : 'raw');
    paintBitmap(el['cv-right'], gen ? gen.image.pixels : null, 'raw');

    el['left-title'].textContent = state.lyEnh ? '暗线增强' : '原图';
    el['left-status'].textContent = gen ? '128 × 256 px' : '—';
    el['ov-left'].innerHTML = defs() + gridMarks(nulls);

    var right = [defs(), gridMarks(nulls)];
    if (gen) {
      /* 底图压暗，让叠加层可读 */
      right.push('<rect x="0" y="0" width="128" height="256" fill="#fffefa" opacity="0.42"/>');
      if (state.lyAll) {
        search.candidates.forEach(function (c) {
          if (keptIds().indexOf(c.id) >= 0) return;
          right.push('<path class="o-cand" d="' + trajectoryPath(c) + '"/>');
        });
      }
      if (state.lyRes) {
        kept.forEach(function (c) {
          right.push('<path class="o-res' + (state.selected === c.id ? ' sel' : '') + '" d="' + trajectoryPath(c) + '"/>');
        });
      }
      if (state.lyTruth) {
        gen.reference.fractures.forEach(function (f) {
          right.push('<path class="o-truth" d="' + trajectoryPath(f) + '"/>');
        });
      }
      right.push('<rect class="o-hit" x="0" y="0" width="128" height="256"/>');
    }
    el['ov-right'].innerHTML = right.join('');

    el['right-status'].textContent = gen
      ? '阈值内 ' + kept.length + ' 条 · 缓存 ' + search.candidates.length + ' 条'
      : '—';

    var items = [];
    items.push('<li><i style="border-top:2px solid #1f9e79"></i>阈值内结果</li>');
    if (state.lyAll) items.push('<li><i style="border-top:2px solid #ffffff"></i>全部缓存候选</li>');
    if (state.lyTruth) items.push('<li><i style="border-top:2px dashed #e07a45"></i>参考裂缝（真值）</li>');
    if (state.selected) items.push('<li><i style="border-top:3px solid #c99a1e"></i>选中</li>');
    if (nulls && nulls.length) {
      items.push('<li><i style="width:11px;height:11px;border:1px solid #b4ab97;background:repeating-linear-gradient(45deg,#e9e4d6 0 2px,#b4ab97 2px 3.5px)"></i>方位缺失</li>');
    }
    el.legend.innerHTML = items.join('');
  }

  function paintList() {
    if (!met) {
      el['cand-body'].innerHTML = '<tr class="empty"><td colspan="7">计算失败或没有候选，列表已清空。</td></tr>';
      el['list-status'].textContent = '—';
      return;
    }
    if (!kept.length) {
      var top = search.candidates.length ? search.candidates[0].score.toFixed(3) : '—';
      el['cand-body'].innerHTML = '<tr class="empty"><td colspan="7">当前阈值 ' + state.threshold.toFixed(2) +
        ' 下没有候选。缓存里共 ' + search.candidates.length + ' 条，最高分 ' + top +
        '；把阈值调低才会出现弱候选与误检。</td></tr>';
      el['list-status'].textContent = '0 条';
      return;
    }

    var tpSet = {};
    met.matches.forEach(function (m) { tpSet[m.predictedIndex] = m; });

    el['cand-body'].innerHTML = kept.map(function (c, i) {
      var m = tpSet[i];
      var depth = gen.image.depthTop_m + c.centerRow * gen.image.depthStep_m;
      var cls = m ? 'is-tp' : 'is-fp';
      if (state.selected === c.id) cls += ' is-sel';
      return '<tr class="' + cls + '" tabindex="0" data-id="' + esc(c.id) + '" data-rank="' + (i + 1) + '">' +
        '<td>' + (i + 1) + ' · ' + esc(c.id) + '</td>' +
        '<td>' + c.score.toFixed(3) + '</td>' +
        '<td>' + (c.support * 100).toFixed(0) + '%</td>' +
        '<td>' + depth.toFixed(2) + '</td>' +
        '<td>' + c.amplitude_px.toFixed(0) + '</td>' +
        '<td>' + c.phase_deg.toFixed(0) + '</td>' +
        '<td>' + (m ? 'TP · ' + m.distance_px.toFixed(2) + ' px' : '误检') + '</td>' +
        '</tr>';
    }).join('');
    el['list-status'].textContent = kept.length + ' 条（上限 ' + MAX_CAND + '）';

    if (focusId) {
      var row = el['cand-body'].querySelector('tr[data-id="' + focusId + '"]');
      if (row) row.focus({ preventScroll: true });
      focusId = null;
    }
  }

  function paintMetrics() {
    if (!met) {
      ['m-f1', 'm-f1s', 'm-tp', 'm-fp', 'm-fn', 'm-p', 'm-r', 'm-dist',
        'm-coarse', 'm-kept', 'm-valid', 'm-refs'].forEach(function (k) { el[k].textContent = '—'; });
      el['m-note'].textContent = '—';
      el['m-tol'].textContent = '—';
      return;
    }
    var f1 = met.f1, p = met.precision, r = met.recall;
    el['m-f1'].textContent = f1 === null ? '不适用' : (f1 * 100).toFixed(1) + '%';
    el['m-f1s'].textContent = met.tp + ' TP · ' + met.fp + ' FP · ' + met.fn + ' FN';
    el['m-tp'].textContent = String(met.tp);
    el['m-fp'].textContent = String(met.fp);
    el['m-fn'].textContent = String(met.fn);
    el['m-p'].textContent = p === null ? '不适用' : p.toFixed(3);
    el['m-r'].textContent = r === null ? '不适用' : r.toFixed(3);
    el['m-dist'].textContent = met.meanDistance_px === null ? '不适用' : met.meanDistance_px.toFixed(2) + ' px';

    el['m-note'].textContent = prep.validPixels === 0
      ? '图像没有有效像素（所有列都未观测），无法检测；漏检数只对合成参考记账。'
      : met.f1 === null
          ? '既没有参考裂缝也没有候选，P / R / F1 都不适用。'
        : gen.reference.fractures.length === 0
          ? '没有参考裂缝：recall 不适用，候选全部按 FP 记账，precision 仍按候选数计算。'
          : '按对象匹配：中心差 ≤ ' + TOL.centerTolerance_px + ' px 且轨迹 RMS ≤ ' +
            TOL.trajectoryTolerance_px + ' px，一对一先最多命中再最小距离。不用背景像素准确率。';

    el['m-coarse'].textContent = search.candidates.length + ' 条';
    el['m-kept'].textContent = kept.length + ' 条';
    el['m-valid'].textContent = (prep.validPixels / prep.totalPixels * 100).toFixed(1) + '%（' + prep.validPixels + ' px）';
    el['m-refs'].textContent = gen.reference.fractures.length + ' 条';
    el['m-tol'].textContent = '容差：中心 ' + TOL.centerTolerance_px + ' px / 轨迹 RMS ' +
      TOL.trajectoryTolerance_px + ' px；单次搜索耗时 ' + searchMs.toFixed(0) + ' ms。' +
      (gen.reference.distractors.length ? '本情境另有 ' + gen.reference.distractors.length + ' 条干扰（不计入参考）。' : '');
  }

  function paintDetail() {
    var c = byId(state.selected !== null ? state.selected : state.cursor);
    el['sel-mode'].textContent = state.selected !== null ? state.selected : (state.cursor !== null ? '游标' : '未选中');
    if (!c || !met) {
      el['detail'].innerHTML = met
        ? '在叠加图或列表里点一条候选，用方向键移动、Enter 选中、Esc 清除。初始不预选。'
        : '计算失败，没有可查看的候选。';
      return;
    }
    var idx = kept.indexOf(c);
    var m = idx >= 0 ? met.matches.filter(function (x) { return x.predictedIndex === idx; })[0] : null;
    var depth = gen.image.depthTop_m + c.centerRow * gen.image.depthStep_m;
    var ampM = c.amplitude_px * gen.image.depthStep_m;
    var rows = [
      ['分数（响应均值）', c.score.toFixed(3)],
      ['列支持率', (c.support * 100).toFixed(0) + '%（' + c.validColumns + ' 列）'],
      ['中心深度', depth.toFixed(3) + ' m'],
      ['几何幅度', c.amplitude_px.toFixed(0) + ' px / ' + ampM.toFixed(2) + ' m'],
      ['相位 ψ', c.phase_deg.toFixed(0) + '°'],
      ['扫描序号', String(idx >= 0 ? idx + 1 : '—') + '（缓存 id ' + c.id + '）']
    ];
    var flags = [];
    if (idx < 0) flags.push('<span class="flag">阈值外：当前不参与评价</span>');
    else if (m) flags.push('<span class="flag tp">TP · 距参考 ' + m.distance_px.toFixed(2) + ' px</span>');
    else flags.push('<span class="flag fp">FP · 未匹配任何参考裂缝</span>');
    flags.push('<span class="flag">几何候选，需要人工确认</span>');

    el['detail'].innerHTML =
      '<div class="sd-head">' + esc(c.id) + ' · 分数 ' + c.score.toFixed(3) + '</div>' +
      '<dl>' + rows.map(function (x) {
        return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>';
      }).join('') + '</dl>' +
      '<div class="sd-flags">' + flags.join('') + '</div>' +
      '<p class="hint">相位是公式里的 ψ，不是倾向；像素幅度不是开度。没有井径/井斜校正，不输出真实产状。</p>';
  }

  function paintFacts() {
    var rows = [
      ['seed', String(state.seed)],
      ['图像', '128 × 256 px'],
      ['深度', '2500.00 → 2505.10 m'],
      ['方位', '0° → 360°'],
      ['最大结果', String(MAX_CAND) + ' 条'],
      ['阈值', state.threshold.toFixed(2)]
    ];
    el.facts.innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
    el.perf.textContent = search
      ? '搜索网格：中心 2 px、幅度 4 px、相位 15°；粗筛 ' + search.coarseCount +
        ' 个，去重阈值 ' + search.nmsDistance_px + ' px。'
      : '—';
    el['left-hint'].textContent = state.lyEnh
      ? '逐列 ±6 行局部背景均值减像素再除以 0.35，抑制恒定竖条；暗处=暗线更强。'
      : '方位 0—360°，深度向下增加；缺失方位用斜纹标出，不画成 0 灰度黑线。';
  }

  function paintSource() {
    el.source.innerHTML =
      '<p><b>生成器</b> seed ' + state.seed + ' · 噪声 ' + state.noise.toFixed(2) + ' · 可见度 ' +
      state.visibility.toFixed(2) + ' · 情境 ' + state.preset + '。三条参考裂缝的几何位置不随噪声/可见度改变。</p>' +
      '<p><b>方法</b> 暗线增强 → 固定网格搜索（支持率与有效列下限）→ 轨迹 RMS 5 px 去重 → 阈值筛选 → 几何对象匹配。</p>' +
      '<p><b>限值</b> 候选分数是像素响应，不是概率；层理等平面干扰也会进入几何结果。' +
      '本例借用展开几何，不模拟电/声成像仪器的真实响应，也不输出倾角或开度。</p>';
  }

  /* ---------------- 交互 ---------------- */
  function onImagePointer(e) {
    if (!gen || !kept.length) return;
    var box = el['ov-right'].getBoundingClientRect();
    var x = Math.max(0, Math.min(127, Math.round((e.clientX - box.left) / box.width * 128)));
    var y = (e.clientY - box.top) / box.height * 256;
    var best = null, bestD = 4.2;
    kept.forEach(function (c) {
      var rows = C.trajectory(c, 128);
      var d = Math.abs(rows[x] - y);
      if (d < bestD) { bestD = d; best = c; }
    });
    if (!best) return;
    state.selected = best.id;
    state.cursor = null;
    paintAll();
  }

  function bindList() {
    el['ov-right'].addEventListener('pointerdown', onImagePointer);

    el['cand-body'].addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      state.selected = tr.dataset.id;
      state.cursor = null;
      focusId = tr.dataset.id;
      paintAll();
    });

    el['cand-body'].addEventListener('keydown', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var rows = [].slice.call(el['cand-body'].querySelectorAll('tr[data-id]'));
      var pos = rows.indexOf(tr);
      if (e.key === 'Escape') {
        e.preventDefault();
        state.selected = null; state.cursor = null;
        focusId = tr.dataset.id;
        paintAll();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        state.selected = tr.dataset.id;
        state.cursor = null;
        focusId = tr.dataset.id;
        paintAll();
        return;
      }
      var step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var next = rows[Math.max(0, Math.min(rows.length - 1, pos + step))];
      state.selected = next.dataset.id;
      state.cursor = null;
      focusId = next.dataset.id;
      paintAll();
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
    if (mode === 'stress') document.querySelector('[data-preset="bedding"]').click();
  });
})();
