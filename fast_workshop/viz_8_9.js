/* Viz 8 + 9 — PI stack + AR-vs-flow runtime.
 *   Viz 8 is mostly static SVG — init just wires the fragment in.
 *   Viz 9 drives the AR grid + canvas flow-denoise animation.
 * Load order: data.js -> shared.js -> viz_8_9.js
 * Exports: window.Viz8 = { init(rootEl) }, window.Viz9 = { init(rootEl) }
 */
(function () {
  'use strict';

  // ----- Viz 8: no runtime logic beyond the SVG already in the fragment. -----
  function initViz8(rootEl) {
    // Currently static. Placeholder so the Shell agent can call it uniformly.
    if (!rootEl) return;
    // no-op
  }

  // ----- Viz 9: AR grid + flow-denoise canvas animation. -----
  function initViz9(rootEl) {
    var AR_N = 60;
    var AR_DT_MS = 12;
    var AR_TOTAL_MS = AR_N * AR_DT_MS;
    var FLOW_STEPS = 10;
    var FLOW_DT_MS = 10;
    var FLOW_TOTAL_MS = FLOW_STEPS * FLOW_DT_MS;

    var arGrid = rootEl.querySelector('.js-ar-grid');
    var arToks = [];
    for (var i = 0; i < AR_N; i++) {
      var d = document.createElement('div');
      d.className = 'ar-tok';
      arGrid.appendChild(d);
      arToks.push(d);
    }

    var arTimerEl = rootEl.querySelector('.js-ar-timer');
    var arCountEl = rootEl.querySelector('.js-ar-count');
    var flowTimerEl = rootEl.querySelector('.js-flow-timer');
    var flowStepEl = rootEl.querySelector('.js-flow-step');
    var flowCanvas = rootEl.querySelector('.js-flow-canvas');
    var fctx = flowCanvas.getContext('2d');
    var FW = flowCanvas.width, FH = flowCanvas.height;

    var CHUNK_T = 50;
    var CHUNK_D = 7;

    function cleanTarget() {
      var curves = [];
      for (var dd = 0; dd < CHUNK_D; dd++) {
        var amp = 0.35 + 0.1 * Math.sin(dd);
        var freq = 0.08 + 0.02 * dd;
        var phase = dd * 0.7;
        var off = (dd - (CHUNK_D - 1) / 2) * 0.22;
        var arr = [];
        for (var t = 0; t < CHUNK_T; t++) {
          arr.push(off + amp * Math.sin(freq * t * Math.PI + phase));
        }
        curves.push(arr);
      }
      return curves;
    }
    var CLEAN = cleanTarget();

    function rand(seed) {
      var s = seed;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return ((s >>> 0) / 0xffffffff) * 2 - 1;
      };
    }

    function drawFlow(tNorm) {
      fctx.clearRect(0, 0, FW, FH);
      fctx.strokeStyle = '#eee';
      fctx.lineWidth = 1;
      for (var i = 0; i <= 4; i++) {
        var y = (i / 4) * FH;
        fctx.beginPath(); fctx.moveTo(0, y); fctx.lineTo(FW, y); fctx.stroke();
      }
      var palette = ['#3a6ea5','#b3791d','#1e874b','#c0392b','#8e44ad','#16a085','#d35400'];
      var rng = rand(1337);
      for (var dd = 0; dd < CHUNK_D; dd++) {
        fctx.strokeStyle = palette[dd];
        fctx.lineWidth = 1.6;
        fctx.globalAlpha = 0.85;
        fctx.beginPath();
        for (var t = 0; t < CHUNK_T; t++) {
          var target = CLEAN[dd][t];
          var noise = rng();
          var v = (1 - tNorm) * noise * 0.9 + tNorm * target;
          var x = (t / (CHUNK_T - 1)) * (FW - 16) + 8;
          var yy = FH / 2 - v * (FH * 0.42);
          if (t === 0) fctx.moveTo(x, yy); else fctx.lineTo(x, yy);
        }
        fctx.stroke();
      }
      fctx.globalAlpha = 1;
      fctx.fillStyle = '#555';
      fctx.font = '11px SF Mono, Menlo, monospace';
      fctx.fillText('σ(noise) → clean chunk', 8, 14);
    }

    var animStart = 0;
    var raf = null;
    function resetViz9() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      for (var i = 0; i < arToks.length; i++) arToks[i].classList.remove('on');
      arTimerEl.textContent = '0';
      arCountEl.textContent = '0';
      flowTimerEl.textContent = '0';
      flowStepEl.textContent = '0';
      drawFlow(0);
    }

    function runViz9() {
      resetViz9();
      animStart = performance.now();
      var deadline = AR_TOTAL_MS + 50;
      function step(now) {
        var t = now - animStart;
        var arDone = Math.min(AR_N, Math.floor(t / AR_DT_MS));
        for (var i = 0; i < AR_N; i++) {
          if (i < arDone) arToks[i].classList.add('on');
        }
        arCountEl.textContent = arDone;
        arTimerEl.textContent = Math.min(Math.round(t), AR_TOTAL_MS).toString();
        if (t >= AR_TOTAL_MS) arTimerEl.textContent = AR_TOTAL_MS.toString();

        var flowDone = Math.min(FLOW_STEPS, Math.floor(t / FLOW_DT_MS));
        flowStepEl.textContent = flowDone;
        var flowElapsed = Math.min(Math.round(t), FLOW_TOTAL_MS);
        flowTimerEl.textContent = flowElapsed.toString();
        drawFlow(Math.min(1, t / FLOW_TOTAL_MS));

        if (t < deadline) {
          raf = requestAnimationFrame(step);
        } else {
          raf = null;
        }
      }
      raf = requestAnimationFrame(step);
    }

    drawFlow(0);
    rootEl.querySelector('.js-run-btn').addEventListener('click', runViz9);
    // auto-play once shortly after init
    setTimeout(runViz9, 400);
  }

  window.Viz8 = { init: initViz8 };
  window.Viz9 = { init: initViz9 };
})();
