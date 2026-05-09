/* Viz 4 — DCT energy compaction + K-slider reconstruction.
 * Load order: data.js -> shared.js -> viz_4.js
 * Exports: window.Viz4 = { init(rootEl) }
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  function mse(a, b) {
    var s = 0, c = 0;
    for (var t = 0; t < a.length; t++) {
      for (var d = 0; d < a[0].length; d++) {
        var e = a[t][d] - b[t][d];
        s += e * e; c++;
      }
    }
    return s / c;
  }

  function initViz4(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 4: data.js / shared.js missing.</p>';
      return;
    }

    var CHUNK = FD.CHUNK;
    var T = CHUNK.length;
    var D = CHUNK[0].length;
    var TOTAL = T * D;
    var DIMNAMES = ['d0','d1','d2','d3','d4','d5','d6'];
    var COLORS = S.JOINT_COLORS;
    var ACCENT = S.FREQ_ACCENT;

    var DCT = FD.dct2d_timeaxis(CHUNK);
    var varPerK = new Array(T);
    for (var k = 0; k < T; k++) varPerK[k] = S.variance(DCT[k]);

    // -------- Panel A: log-scale variance bars --------
    function drawPanelA() {
      var cv = rootEl.querySelector('.js-cv-a');
      var ctx = cv.getContext('2d');
      var W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);

      var padL = 56, padR = 24, padT = 18, padB = 34;
      var plotW = W - padL - padR;
      var plotH = H - padT - padB;

      var logs = varPerK.map(function (v) { return Math.log10(Math.max(v, 1e-12)); });
      var lmin = Math.floor(Math.min.apply(null, logs));
      var lmax = Math.ceil(Math.max.apply(null, logs));
      if (lmax - lmin < 2) lmax = lmin + 2;

      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = '#666';
      ctx.font = '11px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var tl = lmin; tl <= lmax; tl++) {
        var yy = padT + plotH - ((tl - lmin) / (lmax - lmin)) * plotH;
        ctx.strokeStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
        ctx.fillText('1e' + tl, padL - 6, yy);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var xi = 0; xi <= 49; xi += 5) {
        var xx = padL + (xi / 49) * plotW;
        ctx.strokeStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + plotH); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.fillText(String(xi), xx, padT + plotH + 4);
      }

      var barW = plotW / 50 * 0.72;
      for (var ki = 0; ki < 50; ki++) {
        var xc = padL + (ki / 49) * plotW;
        var lv = logs[ki];
        var h = ((lv - lmin) / (lmax - lmin)) * plotH;
        if (h < 0.5) h = 0.5;
        ctx.fillStyle = ACCENT;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(xc - barW / 2, padT + plotH - h, barW, h);
        ctx.globalAlpha = 1;
      }

      var cutoffX = padL + (15.5 / 49) * plotW;
      ctx.strokeStyle = '#b22222';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cutoffX, padT);
      ctx.lineTo(cutoffX, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;

      ctx.fillStyle = '#b22222';
      ctx.font = 'bold 11px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('top 16 = 95.1% of energy', cutoffX + 5, padT + 4);
    }

    // -------- Panel B: paired line plots --------
    var mm = S.minMax(CHUNK);
    var ypad = (mm[1] - mm[0]) * 0.08;
    var Ymin = mm[0] - ypad;
    var Ymax = mm[1] + ypad;

    function drawLines(canvas, data) {
      var ctx = canvas.getContext('2d');
      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      var padL = 56, padR = 24, padT = 12, padB = 28;
      var plotW = W - padL - padR;
      var plotH = H - padT - padB;

      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = '#666';
      ctx.font = '11px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var i = 0; i <= 4; i++) {
        var yv = Ymin + (Ymax - Ymin) * (i / 4);
        var yy = padT + plotH - (i / 4) * plotH;
        ctx.strokeStyle = '#f0f0f0';
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.fillText(yv.toFixed(2), padL - 6, yy);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var xi = 0; xi <= 49; xi += 10) {
        var xx = padL + (xi / 49) * plotW;
        ctx.strokeStyle = '#f0f0f0';
        ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + plotH); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.fillText(String(xi), xx, padT + plotH + 4);
      }

      function yMap(v) { return padT + plotH - ((v - Ymin) / (Ymax - Ymin)) * plotH; }
      function xMap(t) { return padL + (t / 49) * plotW; }

      ctx.lineWidth = 1.6;
      for (var d = 0; d < D; d++) {
        ctx.strokeStyle = COLORS[d];
        ctx.beginPath();
        for (var t = 0; t < T; t++) {
          var xx2 = xMap(t);
          var yy2 = yMap(data[t][d]);
          if (t === 0) ctx.moveTo(xx2, yy2); else ctx.lineTo(xx2, yy2);
        }
        ctx.stroke();
      }
    }

    function drawLegend() {
      var el = rootEl.querySelector('.js-legend');
      var html = '';
      for (var d = 0; d < D; d++) {
        html += '<span><span class="sw" style="background:' + COLORS[d] + '"></span>' + DIMNAMES[d] + '</span>';
      }
      el.innerHTML = html;
    }

    var cvB1 = rootEl.querySelector('.js-cv-b1');
    var cvB2 = rootEl.querySelector('.js-cv-b2');
    var kslider = rootEl.querySelector('.js-kslider');
    var kval = rootEl.querySelector('.js-kval');
    var mseval = rootEl.querySelector('.js-mseval');

    function updateRecon(K) {
      K = Math.max(1, Math.min(TOTAL, K | 0));
      kval.textContent = K;
      if (+kslider.value !== K) kslider.value = K;
      var recon = FD.reconstruct_from_top_k(CHUNK, K);
      var m = mse(CHUNK, recon);
      mseval.textContent = m.toFixed(6);
      drawLines(cvB1, CHUNK);
      drawLines(cvB2, recon);
      var presets = rootEl.querySelectorAll('.js-preset');
      presets.forEach(function (b) {
        b.classList.toggle('on', +b.dataset.k === K);
      });
    }

    kslider.addEventListener('input', function (e) { updateRecon(+e.target.value); });
    rootEl.querySelectorAll('.js-preset').forEach(function (b) {
      b.addEventListener('click', function () { updateRecon(+b.dataset.k); });
    });

    // --- keyboard-active gating (avoid collision with Viz 6 on Page 2) ---
    // rootEl is considered "keyboard-active" if the pointer is over it OR
    // focus lives within it. Keyboard handler short-circuits otherwise.
    var kbdActive = false;
    rootEl.addEventListener('mouseenter', function () { kbdActive = true; });
    rootEl.addEventListener('mouseleave', function () { kbdActive = false; });
    rootEl.addEventListener('focusin',    function () { kbdActive = true; });
    rootEl.addEventListener('focusout',   function () {
      // defer — focus may move to another element inside rootEl
      setTimeout(function () {
        if (!rootEl.contains(document.activeElement)) kbdActive = false;
      }, 0);
    });

    document.addEventListener('keydown', function (e) {
      if (!rootEl.isConnected) return;
      // Only respond if pointer is over Viz 4 or focus is inside it.
      // This prevents collision with Viz 6 (same page, also listens on document).
      if (!kbdActive && document.activeElement !== kslider) return;
      var K = +kslider.value;
      if (e.key === 'ArrowLeft')       { updateRecon(K - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { updateRecon(K + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp')    { updateRecon(K + 5); e.preventDefault(); }
      else if (e.key === 'ArrowDown')  { updateRecon(K - 5); e.preventDefault(); }
    });

    drawPanelA();
    drawLegend();
    updateRecon(16);
  }

  window.Viz4 = { init: initViz4 };
})();
