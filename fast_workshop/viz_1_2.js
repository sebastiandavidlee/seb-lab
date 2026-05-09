/* Viz 1 + 2 — chunk heatmap + naive tokenization failure.
 * Load order: data.js -> shared.js -> viz_1_2.js
 * Exports: window.Viz1 = { init(rootEl) }, window.Viz2 = { init(rootEl) }
 *
 * Each init attaches to its own rootEl via scoped querySelector, so
 * multiple vizes can coexist in one page.
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  // ---------- VIZ 1 ----------
  function initViz1(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 1: data.js / shared.js missing.</p>';
      return;
    }
    var CHUNK = FD.CHUNK;
    var T = CHUNK.length;
    var D = CHUNK[0].length;

    // shared value range (symmetric)
    var mm = S.minMax(CHUNK);
    var absMax = Math.max(Math.abs(mm[0]), Math.abs(mm[1]));
    var divMin = -absMax, divMax = absMax;

    // heatmap
    var heatmapCanvas = rootEl.querySelector('.js-heatmap');
    S.drawHeatmap(heatmapCanvas, CHUNK, {
      colormap: 'diverging',
      range: [divMin, divMax],
      grid: true
    });

    // colorbar
    var cb = rootEl.querySelector('.js-colorbar');
    var cbctx = cb.getContext('2d');
    for (var x = 0; x < cb.width; x++) {
      var val = divMin + (divMax - divMin) * (x / (cb.width - 1));
      var rgb = S.divergingColormap(val, absMax);
      cbctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      cbctx.fillRect(x, 0, 1, cb.height);
    }
    rootEl.querySelector('.js-cb-min').textContent = divMin.toFixed(2);
    rootEl.querySelector('.js-cb-max').textContent = '+' + divMax.toFixed(2);

    // line plot
    (function drawLines() {
      var c = rootEl.querySelector('.js-lines');
      var ctx = c.getContext('2d');
      var W = c.width, H = c.height;
      var pad = { l: 50, r: 16, t: 16, b: 30 };
      var plotW = W - pad.l - pad.r;
      var plotH = H - pad.t - pad.b;
      ctx.clearRect(0, 0, W, H);

      var yMin = divMin, yMax = divMax;
      var yRange = yMax - yMin;

      // y grid + ticks
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var ti = 0; ti <= 4; ti++) {
        var yv = yMin + (yRange * ti / 4);
        var yp = pad.t + plotH - (yv - yMin) / yRange * plotH;
        ctx.strokeStyle = '#eaeaea';
        ctx.beginPath(); ctx.moveTo(pad.l, yp); ctx.lineTo(pad.l + plotW, yp); ctx.stroke();
        ctx.fillText(yv.toFixed(2), pad.l - 4, yp);
      }
      // x grid + ticks
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var xt = 0; xt <= 50; xt += 10) {
        var xp = pad.l + (xt / (T - 1)) * plotW;
        ctx.strokeStyle = '#eaeaea';
        ctx.beginPath(); ctx.moveTo(xp, pad.t); ctx.lineTo(xp, pad.t + plotH); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.fillText(String(xt), xp, pad.t + plotH + 4);
      }
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.l, pad.t, plotW, plotH);

      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('timestep (0 → 49, 50 Hz)', pad.l + plotW / 2, H - 6);
      ctx.save();
      ctx.translate(14, pad.t + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('joint angle (rad)', 0, 0);
      ctx.restore();

      for (var d = 0; d < D; d++) {
        ctx.strokeStyle = S.JOINT_COLORS[d];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var t = 0; t < T; t++) {
          var x = pad.l + (t / (T - 1)) * plotW;
          var y = pad.t + plotH - (CHUNK[t][d] - yMin) / yRange * plotH;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    })();

    // legend
    var lg = rootEl.querySelector('.js-legend');
    var html = '';
    for (var d = 0; d < D; d++) {
      html += '<span><span class="dot" style="background:' + S.JOINT_COLORS[d] + '"></span>joint ' + d + '</span>';
    }
    lg.innerHTML = html;

    // toggle
    var bH = rootEl.querySelector('.js-btn-heatmap');
    var bL = rootEl.querySelector('.js-btn-lineplot');
    var vH = rootEl.querySelector('.js-view-heatmap');
    var vL = rootEl.querySelector('.js-view-lineplot');
    bH.addEventListener('click', function () {
      bH.classList.add('active'); bL.classList.remove('active');
      vH.style.display = ''; vL.style.display = 'none';
    });
    bL.addEventListener('click', function () {
      bL.classList.add('active'); bH.classList.remove('active');
      vL.style.display = ''; vH.style.display = 'none';
    });
  }

  // ---------- VIZ 2 ----------
  function initViz2(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 2: data.js / shared.js missing.</p>';
      return;
    }
    var CHUNK = FD.CHUNK;
    var T = CHUNK.length;
    var D = CHUNK[0].length;

    var mm = S.minMax(CHUNK);
    var absMax = Math.max(Math.abs(mm[0]), Math.abs(mm[1]));
    var divMin = -absMax, divMax = absMax;

    // token color helper (HSV rainbow, categorical-ish)
    function tokenColor(tokenId, numBins) {
      if (numBins <= 1) return [200, 200, 200];
      var t = tokenId / (numBins - 1);
      var h = t * 300 / 360;
      return S.hsvToRgb(h, 0.75, 0.95);
    }

    // original
    S.drawHeatmap(rootEl.querySelector('.js-heatmap-orig'), CHUNK, {
      colormap: 'diverging',
      range: [divMin, divMax],
      grid: true
    });

    var BIN_OPTIONS = [8, 32, 128, 256, 1024];

    function renderTokens(numBins) {
      var tokens = FD.naive_tokenize(CHUNK, numBins);
      var identFrac = FD.count_adjacent_identical(tokens);

      S.drawHeatmap(rootEl.querySelector('.js-heatmap-tok'), tokens, {
        colormap: function (v) { return tokenColor(v, numBins); },
        grid: true
      });

      // identical-pair bar overlay
      var ci = rootEl.querySelector('.js-heatmap-ident');
      var ctx = ci.getContext('2d');
      var W = ci.width, H = ci.height;
      var cellW = W / T;
      var cellH = H / D;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, W, H);
      var barH = Math.max(3, cellH * 0.5);
      ctx.fillStyle = '#f5d516';
      for (var d = 0; d < D; d++) {
        var yCenter = d * cellH + cellH / 2;
        var y = yCenter - barH / 2;
        for (var t = 0; t < T - 1; t++) {
          if (tokens[t][d] === tokens[t + 1][d]) {
            var x0 = (t + 0.5) * cellW;
            var x1 = (t + 1.5) * cellW;
            ctx.fillRect(x0, y, x1 - x0, barH);
          }
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      for (var dd = 1; dd < D; dd++) {
        ctx.beginPath();
        ctx.moveTo(0, dd * cellH); ctx.lineTo(W, dd * cellH); ctx.stroke();
      }

      var pct = (identFrac * 100).toFixed(1);
      rootEl.querySelector('.js-counter').textContent =
        pct + '% of adjacent (t, t+1) pairs share IDENTICAL token IDs  (' + numBins + ' bins)';
      rootEl.querySelector('.js-bins-readout').textContent = String(numBins);
      rootEl.querySelector('.js-bins-subtitle').textContent = '(' + numBins + ' bins)';
      return identFrac;
    }

    var slider = rootEl.querySelector('.js-bins');
    slider.addEventListener('input', function () {
      var idx = parseInt(slider.value, 10);
      renderTokens(BIN_OPTIONS[idx]);
    });
    renderTokens(BIN_OPTIONS[3]);

    // diagnostic
    if (typeof console !== 'undefined' && console.log) {
      BIN_OPTIONS.forEach(function (nb) {
        var toks = FD.naive_tokenize(CHUNK, nb);
        var frac = FD.count_adjacent_identical(toks);
        console.log('[Viz2] num_bins=' + nb + ' → identical adjacent = ' + (frac * 100).toFixed(2) + '%');
      });
    }
  }

  window.Viz1 = { init: initViz1 };
  window.Viz2 = { init: initViz2 };
})();
