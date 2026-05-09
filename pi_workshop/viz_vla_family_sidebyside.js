/* Viz CMP — VLA Family Side-by-Side: AR-discretized vs Continuous Flow.
 * Two-column static SVG with click-to-expand mini-vizes. "Compare" slides them apart.
 *
 * LEFT  (AR-discretized): action ℝ^7 → FAST tokenizer → ~60 token IDs → AR decode loop.
 * RIGHT (Continuous flow): action chunk x ∈ ℝ^{H×7} → noisy x_τ → flow head → x_0.
 *
 * Wall-clock badges: 73 ms (π₀ §D Table I), 750 ms (FAST §VI-D) — measured.
 * Exports: window.Viz_vla_family_sidebyside = { init(rootEl) }.
 */
(function () {
  'use strict';

  var SLUG = 'vla_family_sidebyside';
  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="font-family:inherit">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">CMP · Two Ways to Predict Actions</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1">' +
            'discretize-and-AR (FAST, OpenVLA) vs continuous flow (π₀) · click a column to expand' +
          '</div>' +
          '<div class="cite cite--mono" style="font-family:var(--mono,monospace);font-size:11px;color:#666">' +
            'FAST · π₀' +
          '</div>' +
        '</header>' +

        '<div class="viz-controls" style="display:flex;gap:14px;align-items:center;margin:6px 0 10px;font-size:12px">' +
          '<button class="js-compare" type="button" style="padding:3px 10px">compare ↔</button>' +
          '<button class="js-collapse" type="button" style="padding:3px 10px">collapse</button>' +
          '<span style="color:#888">click either column to expand its mini-viz</span>' +
        '</div>' +

        '<div class="js-cols" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;transition:gap 320ms ease">' +
          // ----------------- LEFT COLUMN -----------------
          '<div class="js-left" data-side="left" style="border:2px solid #c0392b;border-radius:6px;background:#fff;padding:10px;cursor:pointer;transition:transform 320ms ease,box-shadow 200ms">' +
            '<div style="display:flex;align-items:baseline;gap:8px">' +
              '<div style="font-weight:600;color:#c0392b">AR-discretized</div>' +
              '<div style="font-size:11px;color:#888">OpenVLA · FAST · 60-Hz π₀-FAST</div>' +
            '</div>' +
            '<svg viewBox="0 0 460 200" width="100%" height="200" style="display:block;margin-top:6px">' +
              // action vector chunk
              '<rect x="10" y="10" width="80" height="180" fill="#fdf3f1" stroke="#c0392b" stroke-width="1"/>' +
              '<text x="50" y="22" font-size="10" text-anchor="middle" fill="#c0392b">a ∈ ℝ^{H×7}</text>' +
              ARjointBars(20, 30, 60, 150) +
              // arrow
              '<path d="M95,100 L130,100" stroke="#c0392b" stroke-width="2" marker-end="url(#' + SLUG + '-ar-arrow)"/>' +
              '<text x="112" y="92" font-size="9" text-anchor="middle" fill="#888">DCT+BPE</text>' +
              // tokenizer box
              '<rect x="135" y="60" width="80" height="80" fill="#fff" stroke="#c0392b" stroke-width="1.5"/>' +
              '<text x="175" y="84" font-size="10" text-anchor="middle" fill="#c0392b" font-weight="600">FAST</text>' +
              '<text x="175" y="100" font-size="9" text-anchor="middle" fill="#888">tokenizer</text>' +
              '<text x="175" y="118" font-size="9" text-anchor="middle" fill="#888">(see fast_workshop)</text>' +
              // arrow
              '<path d="M220,100 L255,100" stroke="#c0392b" stroke-width="2" marker-end="url(#' + SLUG + '-ar-arrow)"/>' +
              // discrete tokens row
              '<rect x="260" y="40" width="120" height="120" fill="#fdf3f1" stroke="#c0392b" stroke-width="1"/>' +
              '<text x="320" y="34" font-size="10" text-anchor="middle" fill="#c0392b">~60 token IDs</text>' +
              ARtokenGrid(265, 45, 110, 110) +
              // arrow + AR loop curve
              '<path d="M385,100 L420,100" stroke="#c0392b" stroke-width="2" marker-end="url(#' + SLUG + '-ar-arrow)"/>' +
              '<rect x="420" y="60" width="34" height="80" fill="#fff" stroke="#c0392b" stroke-width="1.5"/>' +
              '<text x="437" y="92" font-size="10" text-anchor="middle" fill="#c0392b">AR</text>' +
              '<text x="437" y="106" font-size="10" text-anchor="middle" fill="#c0392b">decode</text>' +
              '<path d="M437,60 C460,40 460,160 437,140" fill="none" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="3,3"/>' +
              ARarrowDefs() +
            '</svg>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px">' +
              '<div style="color:#666">~50–100 sequential decode steps</div>' +
              '<div title="FAST §VI-D, RTX 4090" ' +
                'style="font-family:var(--mono,monospace);background:#fdf3f1;color:#c0392b;border:1px solid #c0392b;padding:2px 6px;border-radius:3px">' +
                '~750 ms <span style="color:#888">[FAST §VI-D]</span></div>' +
            '</div>' +
            '<div class="js-mini-ar" style="display:none;margin-top:8px;border-top:1px dashed #c0392b;padding-top:8px">' +
              '<div style="font-size:11px;color:#666;margin-bottom:4px">FAST tokens streaming out (mini-viz)</div>' +
              '<canvas class="js-mini-ar-canvas" width="430" height="60" style="display:block;background:#fafafa;border:1px solid #d0d0d0"></canvas>' +
              '<div class="js-mini-ar-label" style="font-size:10px;color:#888;margin-top:2px;font-family:var(--mono,monospace)"></div>' +
            '</div>' +
          '</div>' +

          // ----------------- RIGHT COLUMN -----------------
          '<div class="js-right" data-side="right" style="border:2px solid #1abc9c;border-radius:6px;background:#fff;padding:10px;cursor:pointer;transition:transform 320ms ease,box-shadow 200ms">' +
            '<div style="display:flex;align-items:baseline;gap:8px">' +
              '<div style="font-weight:600;color:#1abc9c">Continuous flow</div>' +
              '<div style="font-size:11px;color:#888">π₀ · π₀.5</div>' +
            '</div>' +
            '<svg viewBox="0 0 460 200" width="100%" height="200" style="display:block;margin-top:6px">' +
              // chunk x
              '<rect x="10" y="10" width="80" height="180" fill="#eef9f6" stroke="#1abc9c" stroke-width="1"/>' +
              '<text x="50" y="22" font-size="10" text-anchor="middle" fill="#1abc9c">x ∈ ℝ^{H×7}</text>' +
              flowJointBars(20, 30, 60, 150, 0.0) +
              // noise
              '<path d="M95,100 L130,100" stroke="#1abc9c" stroke-width="2" marker-end="url(#' + SLUG + '-fl-arrow)"/>' +
              '<text x="112" y="92" font-size="9" text-anchor="middle" fill="#888">+ noise τ</text>' +
              '<rect x="135" y="20" width="80" height="160" fill="#eef9f6" stroke="#1abc9c" stroke-width="1"/>' +
              '<text x="175" y="14" font-size="10" text-anchor="middle" fill="#1abc9c">x_τ (noisy)</text>' +
              flowJointBars(140, 25, 70, 150, 0.7) +
              // flow head
              '<path d="M220,100 L255,100" stroke="#1abc9c" stroke-width="2" marker-end="url(#' + SLUG + '-fl-arrow)"/>' +
              '<rect x="260" y="55" width="100" height="90" fill="#fff" stroke="#1abc9c" stroke-width="1.5"/>' +
              '<text x="310" y="80" font-size="10" text-anchor="middle" fill="#1abc9c" font-weight="600">flow head</text>' +
              '<text x="310" y="98" font-size="9" text-anchor="middle" fill="#888">predicts v(x,τ)</text>' +
              '<text x="310" y="118" font-size="9" text-anchor="middle" fill="#888">N≈10 ODE steps</text>' +
              // x_0
              '<path d="M365,100 L395,100" stroke="#1abc9c" stroke-width="2" marker-end="url(#' + SLUG + '-fl-arrow)"/>' +
              '<rect x="400" y="10" width="55" height="180" fill="#eef9f6" stroke="#1abc9c" stroke-width="1"/>' +
              '<text x="427" y="22" font-size="10" text-anchor="middle" fill="#1abc9c">x_0 (clean)</text>' +
              flowJointBars(405, 30, 45, 150, 0.0) +
              flowArrowDefs() +
            '</svg>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px">' +
              '<div style="color:#666">~10 parallel flow steps for the whole chunk</div>' +
              '<div title="π₀ §D Table I, RTX 4090, 3 cameras" ' +
                'style="font-family:var(--mono,monospace);background:#eef9f6;color:#0d8a73;border:1px solid #1abc9c;padding:2px 6px;border-radius:3px">' +
                '~73 ms <span style="color:#888">[π₀ §D Table I]</span></div>' +
            '</div>' +
            '<div class="js-mini-fl" style="display:none;margin-top:8px;border-top:1px dashed #1abc9c;padding-top:8px">' +
              '<div style="font-size:11px;color:#666;margin-bottom:4px">denoising preview (mini-viz)</div>' +
              '<canvas class="js-mini-fl-canvas" width="430" height="80" style="display:block;background:#fafafa;border:1px solid #d0d0d0"></canvas>' +
              '<div class="js-mini-fl-label" style="font-size:10px;color:#888;margin-top:2px;font-family:var(--mono,monospace)"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:10px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          'Two heads on the same VLM backbone, with very different action spaces. ' +
          'Wall-clock numbers are <b>measured</b>: 73 ms from π₀ §D Table I (RTX 4090, 3 cameras); 750 ms from FAST §VI-D.' +
        '</div>' +
      '</div>';

    // ---- arrow def helpers (return strings used inline) -------------------
    function ARjointBars(x, y, w, h) {
      var s = '';
      for (var k = 0; k < 7; k++) {
        var by = y + k * (h / 7);
        var bw = (w - 4) * (0.4 + 0.6 * Math.abs(Math.sin((k + 1) * 1.3)));
        s += '<rect x="' + (x + 2) + '" y="' + (by + 2) + '" width="' + bw +
             '" height="' + (h / 7 - 4) + '" fill="' + jc(k) + '"/>';
      }
      return s;
    }
    function flowJointBars(x, y, w, h, noise) {
      var s = '';
      for (var k = 0; k < 7; k++) {
        var by = y + k * (h / 7);
        var ph = 0.4 + 0.6 * Math.abs(Math.sin((k + 1) * 1.3));
        var bw = (w - 4) * (noise > 0 ? clamp(ph + (rand(k) - 0.5) * 1.4 * noise, 0.05, 1) : ph);
        s += '<rect x="' + (x + 2) + '" y="' + (by + 2) + '" width="' + bw +
             '" height="' + (h / 7 - 4) + '" fill="' + jc(k) + (noise > 0 ? '" opacity="0.55"/>' : '"/>');
      }
      return s;
    }
    function ARtokenGrid(x, y, w, h) {
      var cols = 6, rows = 10;
      var cw = w / cols, ch = h / rows;
      var s = '';
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var hue = (r * 11 + c * 17) % 360;
          s += '<rect x="' + (x + c * cw + 1) + '" y="' + (y + r * ch + 1) + '" ' +
            'width="' + (cw - 2) + '" height="' + (ch - 2) + '" ' +
            'fill="hsl(' + hue + ',60%,75%)" stroke="#c0392b" stroke-width="0.4"/>';
        }
      }
      return s;
    }
    function ARarrowDefs() {
      return '<defs><marker id="' + SLUG + '-ar-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker></defs>';
    }
    function flowArrowDefs() {
      return '<defs><marker id="' + SLUG + '-fl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="#1abc9c"/></marker></defs>';
    }

    function jc(k) {
      var pal = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf'];
      return pal[k % pal.length];
    }
    function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
    function rand(seed) {
      var x = Math.sin(seed * 9301 + 49297) * 43758.5453;
      return x - Math.floor(x);
    }

    // -------- expand / collapse interactions ------------------------------
    var leftPane  = rootEl.querySelector('.js-left');
    var rightPane = rootEl.querySelector('.js-right');
    var miniAR    = rootEl.querySelector('.js-mini-ar');
    var miniFL    = rootEl.querySelector('.js-mini-fl');
    var miniARc   = rootEl.querySelector('.js-mini-ar-canvas');
    var miniFLc   = rootEl.querySelector('.js-mini-fl-canvas');
    var miniARlbl = rootEl.querySelector('.js-mini-ar-label');
    var miniFLlbl = rootEl.querySelector('.js-mini-fl-label');
    var cols      = rootEl.querySelector('.js-cols');
    var btnCmp    = rootEl.querySelector('.js-compare');
    var btnClp    = rootEl.querySelector('.js-collapse');

    var arTimer = null, flTimer = null;
    function stopAR() { if (arTimer) { clearInterval(arTimer); arTimer = null; } }
    function stopFL() { if (flTimer) { clearInterval(flTimer); flTimer = null; } }

    function startAR() {
      stopAR();
      var ctx = miniARc.getContext('2d');
      var W = miniARc.width, H = miniARc.height;
      var nTokens = 60;
      var emitted = 0;
      function frame() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, W, H);
        var cw = W / nTokens;
        for (var i = 0; i < emitted; i++) {
          var hue = (i * 11) % 360;
          ctx.fillStyle = 'hsl(' + hue + ',60%,75%)';
          ctx.fillRect(i * cw + 0.5, 8, cw - 1, H - 16);
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(i * cw + 0.5, 8, cw - 1, H - 16);
        }
        ctx.fillStyle = '#444';
        ctx.font = '11px var(--mono, monospace)';
        ctx.textAlign = 'left';
        ctx.fillText('emitted ' + emitted + ' / ' + nTokens + '  (sequential)', 4, H - 2);
        miniARlbl.textContent = 'one token per step → can\'t be parallelized across token positions';
      }
      frame();
      if (REDUCED) { emitted = nTokens; frame(); return; }
      arTimer = setInterval(function () {
        emitted++;
        if (emitted > nTokens) emitted = 0;
        frame();
      }, 60);
    }

    function startFL() {
      stopFL();
      var ctx = miniFLc.getContext('2d');
      var W = miniFLc.width, H = miniFLc.height;
      var step = 0;
      var nSteps = 10;
      function frame() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, W, H);
        // 7 stacked traces; noise → clean as step increases
        var tau = step / nSteps;
        var rowH = (H - 22) / 7;
        for (var d = 0; d < 7; d++) {
          ctx.strokeStyle = jc(d);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (var t = 0; t < 50; t++) {
            var clean = Math.sin(t * 0.18 + d) * 0.5 + 0.5 * Math.sin(t * 0.05 + d * 1.3);
            var noise = (rand(t * 7 + d * 31) - 0.5) * 1.2;
            var v = (1 - tau) * noise + tau * clean;
            var x = (t / 49) * (W - 8) + 4;
            var y = 4 + d * rowH + rowH / 2 - v * (rowH * 0.45);
            if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#444';
        ctx.font = '11px var(--mono, monospace)';
        ctx.textAlign = 'left';
        ctx.fillText('τ = ' + tau.toFixed(2) + '   step ' + step + ' / ' + nSteps, 4, H - 4);
        miniFLlbl.textContent = 'all 7 joints × all H timesteps update in parallel each ODE step';
      }
      frame();
      if (REDUCED) { step = nSteps; frame(); return; }
      flTimer = setInterval(function () {
        step++;
        if (step > nSteps) step = 0;
        frame();
      }, 220);
    }

    function expand(side) {
      if (side === 'left') {
        miniAR.style.display = '';
        startAR();
      } else {
        miniFL.style.display = '';
        startFL();
      }
    }
    function collapseAll() {
      miniAR.style.display = 'none';
      miniFL.style.display = 'none';
      stopAR(); stopFL();
      cols.style.gap = '14px';
      leftPane.style.transform = '';
      rightPane.style.transform = '';
    }

    leftPane.addEventListener('click', function () { expand('left'); });
    rightPane.addEventListener('click', function () { expand('right'); });

    btnCmp.addEventListener('click', function (ev) {
      ev.stopPropagation();
      cols.style.gap = '36px';
      leftPane.style.transform = 'translateX(-6px)';
      rightPane.style.transform = 'translateX(6px)';
      expand('left');
      expand('right');
    });
    btnClp.addEventListener('click', function (ev) {
      ev.stopPropagation();
      collapseAll();
    });
  }

  window.Viz_vla_family_sidebyside = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-vla_family_sidebyside') ||
             document.getElementById('viz-vla-family-sidebyside');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
