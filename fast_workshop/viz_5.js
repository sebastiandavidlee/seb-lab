/* Viz 5 — quantization heatmap (before/after).
 * Load order: data.js -> shared.js -> viz_5.js
 * Exports: window.Viz5 = { init(rootEl) }
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  // Viz 5 uses a different diverging ramp (blue 30,60,160 -> white -> red 180,30,30);
  // preserve it to keep pixel-identical output.
  function divergingRGB_v5(value, vmax) {
    if (vmax <= 1e-12) return [255, 255, 255];
    var t = Math.max(-1, Math.min(1, value / vmax));
    var r, g, b;
    if (t >= 0) {
      r = 255 + (180 - 255) * t;
      g = 255 + ( 30 - 255) * t;
      b = 255 + ( 30 - 255) * t;
    } else {
      var u = -t;
      r = 255 + ( 30 - 255) * u;
      g = 255 + ( 60 - 255) * u;
      b = 255 + (160 - 255) * u;
    }
    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  function drawCoeffHeatmap(canvas, matrix, vmax, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var padL = 36, padR = 10, padT = 10, padB = 30;
    var Nk = matrix.length;
    var Nd = matrix[0].length;
    var gridW = W - padL - padR;
    var gridH = H - padT - padB;
    var cellW = gridW / Nk;
    var cellH = gridH / Nd;

    for (var k = 0; k < Nk; k++) {
      for (var d = 0; d < Nd; d++) {
        var v = matrix[k][d];
        var color;
        if (opts.zerosBlack && v === 0) {
          color = '#000';
        } else {
          var rgb = divergingRGB_v5(v, vmax);
          color = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        }
        ctx.fillStyle = color;
        ctx.fillRect(padL + k * cellW, padT + d * cellH,
                     Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      }
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (var kk = 0; kk <= Nk; kk += 5) {
      var gx = padL + kk * cellW;
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + gridH); ctx.stroke();
    }
    for (var dd = 0; dd <= Nd; dd++) {
      var gy = padT + dd * cellH;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + gridW, gy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(padL + 0.5, padT + 0.5, gridW, gridH);

    ctx.fillStyle = '#444';
    ctx.font = '10px -apple-system, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var xk = 0; xk <= Nk; xk += 5) {
      var xx = padL + xk * cellW;
      ctx.fillText(String(xk), xx, padT + gridH + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('k', padL + gridW / 2 - 4, padT + gridH + 16);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var yd = 0; yd < Nd; yd++) {
      var yy = padT + yd * cellH + cellH / 2;
      ctx.fillText('d' + yd, padL - 6, yy);
    }
  }

  function initViz5(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 5: data.js / shared.js missing.</p>';
      return;
    }
    var CHUNK = FD.CHUNK;
    var COEFFS = FD.dct2d_timeaxis(CHUNK);

    function quantizeWithMult(coeffs, mult) {
      var gmax = S.maxAbs(coeffs);
      var step = (gmax > 1e-9) ? (gmax / 20) * mult : 1.0;
      var scales = new Array(coeffs.length);
      for (var i = 0; i < coeffs.length; i++) scales[i] = step;
      var Q = FD.quantize(coeffs, scales);
      Q._step = step;
      return Q;
    }

    var floatVmax = S.maxAbs(COEFFS);
    drawCoeffHeatmap(rootEl.querySelector('.js-canvas-float'), COEFFS, floatVmax, { zerosBlack: false });
    var fmm = S.minMax(COEFFS);
    rootEl.querySelector('.js-float-range').textContent =
      'float range: [' + fmm[0].toFixed(3) + ', ' + fmm[1].toFixed(3) + ']';

    var canvasInt = rootEl.querySelector('.js-canvas-int');
    var sparsityEl = rootEl.querySelector('.js-sparsity');
    var intRangeEl = rootEl.querySelector('.js-int-range');
    var stepStatEl = rootEl.querySelector('.js-step-stat');
    var slider = rootEl.querySelector('.js-step-slider');
    var stepVal = rootEl.querySelector('.js-step-val');

    function render(mult) {
      var Q = quantizeWithMult(COEFFS, mult);
      var iVmax = S.maxAbs(Q);
      if (iVmax < 1) iVmax = 1;
      drawCoeffHeatmap(canvasInt, Q, iVmax, { zerosBlack: true });
      var sp = FD.count_zeros(Q);
      sparsityEl.textContent = (sp * 100).toFixed(2) + '% zero';
      var mm = S.minMax(Q);
      intRangeEl.textContent = 'int range: [' + mm[0] + ', ' + mm[1] + ']';
      stepStatEl.textContent = 'step = ' + Q._step.toFixed(4);
      return { sparsity: sp, min: mm[0], max: mm[1], step: Q._step };
    }

    slider.addEventListener('input', function () {
      var m = parseFloat(slider.value);
      stepVal.textContent = m.toFixed(1) + '×';
      render(m);
    });

    var init = render(1.0);

    try {
      console.log('[viz_5] float max_abs =', floatVmax.toFixed(4));
      console.log('[viz_5] default sparsity =', (init.sparsity * 100).toFixed(2) + '%  (expected ~84.57%)');
      console.log('[viz_5] int range = [' + init.min + ', ' + init.max + ']');
      console.log('[viz_5] step = ' + init.step.toFixed(6));
    } catch (e) {}
  }

  window.Viz5 = { init: initViz5 };
})();
