/* Viz 7 — end-to-end pipeline.
 * Load order: data.js -> shared.js -> viz_7.js
 * Exports: window.Viz7 = { init(rootEl) }
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  function initViz7(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 7: data.js / shared.js missing.</p>';
      return;
    }

    var CHUNK = FD.CHUNK;
    var T = CHUNK.length;
    var D = CHUNK[0].length;
    var JOINT_COLORS = S.JOINT_COLORS;
    var JOINT_RGB = JOINT_COLORS.map(S.hexToRgb);

    // ---- run pipeline live ----
    var DCT  = FD.dct2d_timeaxis(CHUNK);
    var Q    = FD.quantize(DCT);
    var flat = FD.flatten_row_major(Q);
    var bpe  = FD.bpe_trace(flat, 200, 200);
    var FINAL_TOKENS = bpe.final;
    var NUM_MERGES   = bpe.steps.length;
    var SPARSITY     = FD.count_zeros(Q);

    // top-16 energy ratio
    var totalE = 0, mags = [];
    for (var tt = 0; tt < T; tt++) {
      for (var dd = 0; dd < D; dd++) {
        var v = DCT[tt][dd];
        totalE += v * v;
        mags.push(v * v);
      }
    }
    mags.sort(function (a, b) { return b - a; });
    var top16E = 0;
    for (var i = 0; i < 16; i++) top16E += mags[i];
    var COMPACTION = top16E / totalE;

    var INPUT_COUNT = T * D;
    var OUTPUT_COUNT = FINAL_TOKENS.length;
    var COMPRESS_RATE = INPUT_COUNT / OUTPUT_COUNT;

    var NONZERO = 0;
    for (var t2 = 0; t2 < T; t2++) for (var d2 = 0; d2 < D; d2++) if (Q[t2][d2] !== 0) NONZERO++;

    rootEl.querySelector('.js-hdr-in').textContent = INPUT_COUNT;
    rootEl.querySelector('.js-hdr-out').textContent = OUTPUT_COUNT;
    rootEl.querySelector('.js-hdr-rate').textContent = COMPRESS_RATE.toFixed(1);
    rootEl.querySelector('.js-lbl-stage1').textContent = INPUT_COUNT + ' floats';
    rootEl.querySelector('.js-lbl-stage2').textContent = INPUT_COUNT + ' floats';
    rootEl.querySelector('.js-lbl-stage3').textContent = INPUT_COUNT + ' ints';
    rootEl.querySelector('.js-lbl-stage4').textContent = OUTPUT_COUNT + ' tokens';
    rootEl.querySelector('.js-sparsity-pct').textContent = (SPARSITY * 100).toFixed(1) + '%';
    rootEl.querySelector('.js-chip-compaction').textContent = (COMPACTION * 100).toFixed(0) + '%';
    rootEl.querySelector('.js-chip-nonzero').textContent = NONZERO;
    rootEl.querySelector('.js-merges-count').textContent = NUM_MERGES;

    var chMin = Infinity, chMax = -Infinity;
    for (var a = 0; a < T; a++) for (var b = 0; b < D; b++) {
      var vv = CHUNK[a][b];
      if (vv < chMin) chMin = vv;
      if (vv > chMax) chMax = vv;
    }
    var dctMax = 0;
    for (var a2 = 0; a2 < T; a2++) for (var b2 = 0; b2 < D; b2++) {
      var ab = Math.abs(DCT[a2][b2]);
      if (ab > dctMax) dctMax = ab;
    }
    var qAbsMax = 0;
    for (var a3 = 0; a3 < T; a3++) for (var b3 = 0; b3 < D; b3++) {
      var ab2 = Math.abs(Q[a3][b3]);
      if (ab2 > qAbsMax) qAbsMax = ab2;
    }
    if (qAbsMax < 1) qAbsMax = 1;

    function chunkCellColor(val, dIdx) {
      var norm = (val - chMin) / (chMax - chMin);
      if (norm < 0) norm = 0; if (norm > 1) norm = 1;
      var jc = JOINT_RGB[dIdx];
      var r = Math.round(255 + (jc[0] - 255) * norm);
      var g = Math.round(255 + (jc[1] - 255) * norm);
      var b = Math.round(255 + (jc[2] - 255) * norm);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    // Viz 7 uses a simpler pure-RGB diverging (white<->red / white<->blue).
    // Keep it intact to preserve pixel output.
    function divergeColor(val, maxAbs) {
      var t = val / maxAbs;
      if (t > 1) t = 1; if (t < -1) t = -1;
      if (t >= 0) {
        var gg = Math.round(255 * (1 - t));
        return 'rgb(255,' + gg + ',' + gg + ')';
      }
      var u = -t;
      var rrr = Math.round(255 * (1 - u));
      return 'rgb(' + rrr + ',' + rrr + ',255)';
    }
    function qColor(val, maxAbs) {
      if (val === 0) return '#000';
      return divergeColor(val, maxAbs);
    }

    // token color: uses SharedFAST.hashToColor (id will be >=256 for BPE merges,
    // but for base IDs we want vivid hues — so use the alternative hashInt path).
    function tokenColor(tid) {
      // Replicate viz_7 original's hash -> hsl for any id (not the base/merge split).
      var h = (tid | 0) * 2654435761;
      h = (h ^ (h >>> 16)) >>> 0;
      var hue = h % 360;
      var sat = 55 + ((h >> 8) % 30);
      var lig = 48 + ((h >> 16) % 18);
      return 'hsl(' + hue + ',' + sat + '%,' + lig + '%)';
    }

    // ---- stage 1 ----
    (function () {
      var c = rootEl.querySelector('.js-c-stage1');
      var W = c.width, H = c.height;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      var cw = W / D, ch = H / T;
      for (var t = 0; t < T; t++) {
        for (var d = 0; d < D; d++) {
          ctx.fillStyle = chunkCellColor(CHUNK[t][d], d);
          ctx.fillRect(d * cw, t * ch, Math.ceil(cw), Math.ceil(ch));
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      for (var dd = 1; dd < D; dd++) {
        ctx.beginPath();
        ctx.moveTo(dd * cw, 0); ctx.lineTo(dd * cw, H);
        ctx.stroke();
      }
    })();

    // ---- stage 2 ----
    (function () {
      var c = rootEl.querySelector('.js-c-stage2');
      var W = c.width, H = c.height;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      var cw = W / D, ch = H / T;
      for (var t = 0; t < T; t++) {
        for (var d = 0; d < D; d++) {
          ctx.fillStyle = divergeColor(DCT[t][d], dctMax);
          ctx.fillRect(d * cw, t * ch, Math.ceil(cw), Math.ceil(ch));
        }
      }
      var cb = rootEl.querySelector('.js-cb-stage2');
      var cbctx = cb.getContext('2d');
      for (var x = 0; x < cb.width; x++) {
        var tval = (x / (cb.width - 1)) * 2 - 1;
        cbctx.fillStyle = divergeColor(tval * dctMax, dctMax);
        cbctx.fillRect(x, 0, 1, cb.height);
      }
      rootEl.querySelector('.js-cb2-min').textContent = (-dctMax).toFixed(2);
      rootEl.querySelector('.js-cb2-max').textContent = '+' + dctMax.toFixed(2);
    })();

    // ---- stage 3 ----
    (function () {
      var c = rootEl.querySelector('.js-c-stage3');
      var W = c.width, H = c.height;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      var cw = W / D, ch = H / T;
      for (var t = 0; t < T; t++) {
        for (var d = 0; d < D; d++) {
          ctx.fillStyle = qColor(Q[t][d], qAbsMax);
          ctx.fillRect(d * cw, t * ch, Math.ceil(cw), Math.ceil(ch));
        }
      }
      var cb = rootEl.querySelector('.js-cb-stage3');
      var cbctx = cb.getContext('2d');
      for (var x = 0; x < cb.width; x++) {
        var tval = (x / (cb.width - 1)) * 2 - 1;
        cbctx.fillStyle = divergeColor(tval * qAbsMax, qAbsMax);
        cbctx.fillRect(x, 0, 1, cb.height);
      }
    })();

    // ---- stage 4 ----
    (function () {
      var c = rootEl.querySelector('.js-c-stage4');
      var W = c.width, H = c.height;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      var N = FINAL_TOKENS.length;
      var cellW_single = W / N;
      var useTwoRow = cellW_single < 8;
      var cols = useTwoRow ? Math.ceil(N / 2) : N;
      var rows = useTwoRow ? 2 : 1;
      var cw = W / cols, ch = H / rows;

      for (var i = 0; i < N; i++) {
        var tid = FINAL_TOKENS[i];
        var col = i % cols;
        var row = Math.floor(i / cols);
        ctx.fillStyle = tokenColor(tid);
        ctx.fillRect(col * cw, row * ch, Math.ceil(cw), Math.ceil(ch));
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(col * cw + 0.5, row * ch + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1));
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('N=' + N, W - 4, H - 2);
    })();

    // ---- animation controls ----
    var stages = [
      { s: rootEl.querySelector('.js-stage-1'), a: null },
      { s: rootEl.querySelector('.js-stage-2'), a: rootEl.querySelector('.js-arrow-1') },
      { s: rootEl.querySelector('.js-stage-3'), a: rootEl.querySelector('.js-arrow-2') },
      { s: rootEl.querySelector('.js-stage-4'), a: rootEl.querySelector('.js-arrow-3') }
    ];
    var animTimers = [];
    var btnAnim = rootEl.querySelector('.js-btn-animate');
    var btnReset = rootEl.querySelector('.js-btn-reset');
    var status = rootEl.querySelector('.js-animate-status');

    function hideAll() {
      for (var i = 0; i < stages.length; i++) {
        stages[i].s.classList.add('hidden');
        if (stages[i].a) stages[i].a.classList.add('hidden');
      }
    }
    function showAll() {
      clearTimers();
      for (var i = 0; i < stages.length; i++) {
        stages[i].s.classList.remove('hidden');
        if (stages[i].a) stages[i].a.classList.remove('hidden');
      }
      status.textContent = '';
      btnAnim.disabled = false;
    }
    function clearTimers() {
      for (var i = 0; i < animTimers.length; i++) clearTimeout(animTimers[i]);
      animTimers = [];
    }

    btnAnim.addEventListener('click', function () {
      clearTimers();
      hideAll();
      btnAnim.disabled = true;
      status.textContent = 'animating…';
      var delay = 600;
      for (var i = 0; i < stages.length; i++) {
        (function (idx) {
          animTimers.push(setTimeout(function () {
            if (stages[idx].a) stages[idx].a.classList.remove('hidden');
            stages[idx].s.classList.remove('hidden');
            status.textContent = 'stage ' + (idx + 1) + ' / 4';
            if (idx === stages.length - 1) {
              animTimers.push(setTimeout(function () {
                status.textContent = 'done';
                btnAnim.disabled = false;
              }, 500));
            }
          }, delay * (idx + 1)));
        })(i);
      }
    });
    btnReset.addEventListener('click', showAll);
  }

  window.Viz7 = { init: initViz7 };
})();
