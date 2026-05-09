/* Viz 3 — temporal vs cross-dim correlation matrices.
 * Load order: data.js -> shared.js -> viz_3.js
 * Exports: window.Viz3 = { init(rootEl) }
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  function meanAbsOffDiag(M) {
    var N = M.length, sum = 0, cnt = 0;
    for (var i = 0; i < N; i++)
      for (var j = 0; j < N; j++)
        if (i !== j) { sum += Math.abs(M[i][j]); cnt++; }
    return cnt ? sum / cnt : 0;
  }
  function meanAbsAdjacent(M) {
    var N = M.length, sum = 0, cnt = 0;
    for (var i = 0; i < N - 1; i++) {
      sum += Math.abs(M[i][i + 1]); cnt++;
      sum += Math.abs(M[i + 1][i]); cnt++;
    }
    return cnt ? sum / cnt : 0;
  }

  // Correlation-matrix heatmap (with axis ticks, diag marker, threshold fade).
  // Doesn't use SharedFAST.drawHeatmap because it needs alpha-based threshold
  // and tick labels inside the canvas.
  function renderCorrHeatmap(canvas, M, opts) {
    var N = M.length;
    var W = canvas.width, H = canvas.height;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    var ml = 34, mt = 8, mr = 8, mb = 24;
    var pw = W - ml - mr, ph = H - mt - mb;
    var cellW = pw / N, cellH = ph / N;

    var thresh = opts && opts.threshold ? opts.threshold : 0;

    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var v = M[i][j];
        var isDiag = (i === j);
        var pass = Math.abs(v) > thresh || isDiag;
        var alpha = pass ? 1.0 : 0.12;
        ctx.fillStyle = S.divergingRGBString(v, 1, alpha);
        var x = ml + j * cellW;
        var y = mt + i * cellH;
        ctx.fillRect(x, y, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      }
    }

    if (opts && opts.markDiagonal) {
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ml, mt);
      ctx.lineTo(ml + pw, mt + ph);
      ctx.stroke();
    }

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(ml + 0.5, mt + 0.5, pw, ph);

    ctx.fillStyle = '#444';
    ctx.font = '10px "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    var tickStep = (N <= 10) ? 1 : (N <= 20 ? 5 : 10);
    for (var yi = 0; yi < N; yi += tickStep) {
      var yy = mt + (yi + 0.5) * cellH;
      ctx.fillText(String(yi), ml - 4, yy);
      ctx.strokeStyle = '#ccc';
      ctx.beginPath(); ctx.moveTo(ml - 2, yy); ctx.lineTo(ml, yy); ctx.stroke();
    }
    var lyy = mt + (N - 0.5) * cellH;
    if ((N - 1) % tickStep !== 0) ctx.fillText(String(N - 1), ml - 4, lyy);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var xi = 0; xi < N; xi += tickStep) {
      var xx = ml + (xi + 0.5) * cellW;
      ctx.fillText(String(xi), xx, mt + ph + 4);
    }
    var lxx = ml + (N - 0.5) * cellW;
    if ((N - 1) % tickStep !== 0) ctx.fillText(String(N - 1), lxx, mt + ph + 4);
  }

  function initViz3(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 3: data.js / shared.js missing.</p>';
      return;
    }

    var T_CORR = FD.temporal_correlation(FD.CHUNK);
    var X_CORR = FD.cross_dim_correlation(FD.CHUNK);

    var t_moad = meanAbsOffDiag(T_CORR);
    var x_moad = meanAbsOffDiag(X_CORR);
    var t_adj  = meanAbsAdjacent(T_CORR);
    var x_adj  = meanAbsAdjacent(X_CORR);

    rootEl.querySelector('.js-stat-t-moad').textContent = t_moad.toFixed(3);
    rootEl.querySelector('.js-stat-x-moad').textContent = x_moad.toFixed(3);
    rootEl.querySelector('.js-stat-t-adj').textContent  = t_adj.toFixed(3);
    rootEl.querySelector('.js-stat-x-adj').textContent  = x_adj.toFixed(3);

    var ratioAdj = (x_adj > 1e-6) ? (t_adj / x_adj) : Infinity;
    rootEl.querySelector('.js-ratio-adj').textContent = ratioAdj.toFixed(2) + 'x';
    rootEl.querySelector('.js-ratio-adj-inline').textContent = ratioAdj.toFixed(2);

    var canvasT = rootEl.querySelector('.js-cv-t');
    var canvasX = rootEl.querySelector('.js-cv-x');
    var state = { threshold: 0 };

    function renderAll() {
      renderCorrHeatmap(canvasT, T_CORR, { threshold: state.threshold, markDiagonal: true });
      renderCorrHeatmap(canvasX, X_CORR, { threshold: state.threshold, markDiagonal: true });
    }
    renderAll();

    var btn = rootEl.querySelector('.js-toggle-btn');
    var filtered = false;
    btn.addEventListener('click', function () {
      filtered = !filtered;
      state.threshold = filtered ? 0.5 : 0;
      btn.textContent = filtered ? 'Show all correlations' : 'Show only |corr| > 0.5';
      btn.classList.toggle('on', filtered);
      renderAll();
    });

    console.log('[viz_3] temporal mean |corr| off-diag =', t_moad.toFixed(4));
    console.log('[viz_3] cross-dim mean |corr| off-diag =', x_moad.toFixed(4));
    console.log('[viz_3] temporal adjacent (i,i+1) mean |corr| =', t_adj.toFixed(4));
    console.log('[viz_3] cross-dim adjacent (j,j+1) mean |corr| =', x_adj.toFixed(4));
    console.log('[viz_3] adjacent ratio temporal/cross-dim =', ratioAdj.toFixed(2));
  }

  window.Viz3 = { init: initViz3 };
})();
