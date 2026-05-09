/* Viz A1 — Single-Head Attention as Q/K/V Matchmaking.
 * 8 toy tokens with draggable 2-D (Q, K) embeddings; canvas heatmap; output mix.
 * Math: s_ij = q_i · k_j / sqrt(d), d=2; softmax per row.
 *
 * Exports: window.Viz_attn_qkv_playground = { init(rootEl) }.
 * Auto-inits on DOMContentLoaded if a #viz-attn_qkv_playground mount exists.
 */
(function () {
  'use strict';

  var SLUG = 'attn_qkv_playground';
  var N = 8;
  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // V swatch colors — diverse hues so the output mix is legible.
  var V_COLORS = [
    [228,  26,  28], [ 55, 126, 184], [ 77, 175,  74],
    [152,  78, 163], [255, 127,   0], [255, 217,  47],
    [166,  86,  40], [247, 129, 191]
  ];

  function softmax(arr) {
    var m = -Infinity, i;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    var e = new Array(arr.length), s = 0;
    for (i = 0; i < arr.length; i++) { e[i] = Math.exp(arr[i] - m); s += e[i]; }
    for (i = 0; i < arr.length; i++) e[i] /= s;
    return e;
  }

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="font-family:inherit">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">A1 · Q/K/V Matchmaking</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1">' +
            'drag any K-arrow head — heatmap row redistributes via softmax(q·k / √d)' +
          '</div>' +
          '<div class="cite cite--mono" style="font-family:var(--mono,monospace);font-size:11px;color:#666">' +
            'Vaswani et al. 2017' +
          '</div>' +
        '</header>' +

        '<div class="viz-controls" style="display:flex;gap:10px;align-items:center;margin:6px 0 8px;flex-wrap:wrap;font-size:12px">' +
          '<label><input type="radio" name="' + SLUG + '-mode" value="softmax" checked> softmax (rows sum to 1)</label>' +
          '<label><input type="radio" name="' + SLUG + '-mode" value="raw"> pre-softmax (raw q·k/√d)</label>' +
          '<span style="border-left:1px solid #ccc;height:16px;margin:0 2px"></span>' +
          '<span style="color:#666">presets:</span>' +
          '<button class="js-preset" data-preset="self" type="button" style="padding:2px 8px">self-loop heavy</button>' +
          '<button class="js-preset" data-preset="next" type="button" style="padding:2px 8px">next-token</button>' +
          '<button class="js-preset" data-preset="mix"  type="button" style="padding:2px 8px">global mix</button>' +
          '<button class="js-reset" type="button" style="padding:2px 8px;margin-left:6px">reset</button>' +
          '<span class="js-readout" style="margin-left:auto;font-family:var(--mono,monospace);color:#444"></span>' +
        '</div>' +
        '<div class="js-formula" style="margin:0 0 10px;padding:6px 10px;background:#fbf7ec;border-left:3px solid #b07c2c;' +
          'font-family:var(--mono,monospace);font-size:12px;color:#3a2a10;min-height:18px">' +
          '<b>s<sub>i,j</sub></b> = q<sub>i</sub> &middot; k<sub>j</sub> / &radic;d &nbsp;&nbsp;' +
          '<span class="js-formula-eval" style="color:#6a3d9a">hover the heatmap to evaluate at a specific (i, j)</span>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 320px;gap:14px;align-items:start">' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">QK plane — drag arrowheads</div>' +
            '<svg class="js-svg" width="560" height="280" viewBox="0 0 560 280" ' +
              'style="background:#fff;border:1px solid #d0d0d0;border-radius:4px;display:block"></svg>' +
            '<div style="font-size:11px;color:#666;margin-top:6px">' +
              'each token i has Q (filled) and K (outline) arrows, both ∈ ℝ². ' +
              'similarity s<sub>ij</sub> = q<sub>i</sub>·k<sub>j</sub> / √2.' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">attention matrix (row = query, col = key)</div>' +
            '<canvas class="js-heat" width="288" height="288" ' +
              'style="display:block;background:#fafafa;border:1px solid #d0d0d0"></canvas>' +
            '<div class="js-cell-info" style="font-size:11px;color:#444;font-family:var(--mono,monospace);' +
              'min-height:14px;margin-top:4px"></div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-top:14px">' +
          '<div style="font-size:11px;color:#666;margin-bottom:4px">' +
            'output row · each cell = Σ<sub>j</sub> α<sub>ij</sub> · v<sub>j</sub> (mixed swatch)</div>' +
          '<div class="js-out" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;height:34px"></div>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:10px;font-size:12px;background:#f4f4f2;' +
          'padding:8px 10px;border-left:3px solid #888">' +
          'Output token i mixes the 8 V-swatches by row i of the heatmap. ' +
          'When q<sub>i</sub> aligns with k<sub>j</sub>, token j dominates the mix. ' +
          '<span style="color:#888">(schematic: V here is a fixed swatch, not a learned vector.)</span>' +
        '</div>' +
      '</div>';

    var svg     = rootEl.querySelector('.js-svg');
    var heat    = rootEl.querySelector('.js-heat');
    var outRow  = rootEl.querySelector('.js-out');
    var info    = rootEl.querySelector('.js-cell-info');
    var readout = rootEl.querySelector('.js-readout');
    var resetBt = rootEl.querySelector('.js-reset');
    var modeRad = rootEl.querySelectorAll('input[name="' + SLUG + '-mode"]');
    var presetBts = rootEl.querySelectorAll('.js-preset');
    var formulaEval = rootEl.querySelector('.js-formula-eval');

    // Layout coordinates inside the SVG.
    var W = 560, H = 280;
    var ROW_Y = 36;            // top row where token labels sit
    var ORIGIN_Y = 170;        // qk plane center
    var SCALE = 60;            // px per unit in qk space

    // Token initial Q/K — chosen so two clusters emerge.
    function defaultQK() {
      var arr = [];
      for (var i = 0; i < N; i++) {
        var ang = (i / N) * Math.PI * 2;
        // Q on inner ring, K on outer ring with slight offset → varied dot-products.
        arr.push({
          q: [ Math.cos(ang) * 0.7, Math.sin(ang) * 0.7 ],
          k: [ Math.cos(ang + 0.6) * 1.1, Math.sin(ang + 0.6) * 1.1 ]
        });
      }
      return arr;
    }

    // Three named presets. Q stays on the default ring; only K's are reshaped.
    // Each pattern is engineered to dominate the softmax of one well-known
    // attention shape (diagonal / sub-diagonal / flat).
    function presetQK(kind) {
      var arr = defaultQK();
      var i;
      if (kind === 'self') {
        // K_i := Q_i (scaled up) → diagonal lights up: each token attends to itself.
        for (i = 0; i < N; i++) {
          arr[i].k = [ arr[i].q[0] * 1.6, arr[i].q[1] * 1.6 ];
        }
      } else if (kind === 'next') {
        // K_i := Q_{i-1} → row i's max score is at column i-1 (sub-diagonal).
        // First token has no predecessor; let it self-attend so softmax is well-defined.
        for (i = 0; i < N; i++) {
          var src = (i === 0) ? 0 : (i - 1);
          arr[i].k = [ arr[src].q[0] * 1.6, arr[src].q[1] * 1.6 ];
        }
      } else if (kind === 'mix') {
        // All K's tiny + nearly-orthogonal → q·k ≈ 0 everywhere → softmax ≈ uniform.
        for (i = 0; i < N; i++) {
          var ang2 = (i * 1.7 + 0.3) % (Math.PI * 2);
          arr[i].k = [ Math.cos(ang2) * 0.15, Math.sin(ang2) * 0.15 ];
        }
      }
      return arr;
    }

    var state = { tokens: defaultQK(), mode: 'softmax', hover: null };

    // ---- coordinate helpers ---------------------------------------------------
    function tokenX(i) { return 40 + i * ((W - 80) / (N - 1)); }
    function vecToPx(v) {
      return [ W / 2 + v[0] * SCALE, ORIGIN_Y + v[1] * SCALE ];
    }
    function pxToVec(px, py) {
      return [ (px - W / 2) / SCALE, (py - ORIGIN_Y) / SCALE ];
    }

    // ---- math -----------------------------------------------------------------
    function computeAttn() {
      var raw = []; var i, j;
      var sqrtD = Math.sqrt(2);
      for (i = 0; i < N; i++) {
        var row = [];
        for (j = 0; j < N; j++) {
          var t = state.tokens;
          row.push((t[i].q[0] * t[j].k[0] + t[i].q[1] * t[j].k[1]) / sqrtD);
        }
        raw.push(row);
      }
      var sm = raw.map(softmax);
      return { raw: raw, sm: sm };
    }

    // ---- render heatmap -------------------------------------------------------
    function drawHeatmap(attn) {
      var ctx = heat.getContext('2d');
      var hw = heat.width, hh = heat.height;
      var cell = hw / N;
      ctx.clearRect(0, 0, hw, hh);

      var matrix = state.mode === 'raw' ? attn.raw : attn.sm;
      // For raw, normalize to [-vmax, vmax] for color; for softmax, [0,1] greyscale-amber.
      if (state.mode === 'raw') {
        var vmax = 0;
        for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
          var a = Math.abs(matrix[i][j]); if (a > vmax) vmax = a;
        }
        if (vmax < 1e-6) vmax = 1;
        for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
          var v = matrix[i][j] / vmax; // -1..1
          // diverging blue→white→amber
          var r, g, b;
          if (v >= 0) { r = 255 - (1 - v) * 64; g = 217 - (1 - v) * 16; b = 47 + (1 - v) * 200; }
          else        { r = 247 + v * 214; g = 247 + v * 145; b = 247 + v * 75;  }
          ctx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
          ctx.fillRect(j * cell, i * cell, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
        }
      } else {
        for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
          var p = matrix[i][j];
          // white → amber gradient
          var rr = 255, gg = 255 - p * 88, bb = 255 - p * 235;
          ctx.fillStyle = 'rgb(' + (rr | 0) + ',' + (gg | 0) + ',' + (bb | 0) + ')';
          ctx.fillRect(j * cell, i * cell, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
        }
      }

      // grid + hover highlight
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (var k = 1; k < N; k++) {
        ctx.beginPath(); ctx.moveTo(k * cell, 0); ctx.lineTo(k * cell, hh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, k * cell); ctx.lineTo(hw, k * cell); ctx.stroke();
      }
      if (state.hover) {
        ctx.strokeStyle = '#ff8c1a';
        ctx.lineWidth = 2;
        ctx.strokeRect(state.hover.j * cell + 1, state.hover.i * cell + 1,
                       cell - 2, cell - 2);
      }
    }

    // ---- render output row ----------------------------------------------------
    function drawOutput(attn) {
      var sm = attn.sm;
      var html = '';
      for (var i = 0; i < N; i++) {
        var r = 0, g = 0, b = 0;
        for (var j = 0; j < N; j++) {
          r += sm[i][j] * V_COLORS[j][0];
          g += sm[i][j] * V_COLORS[j][1];
          b += sm[i][j] * V_COLORS[j][2];
        }
        var col = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
        html +=
          '<div title="output token ' + i + '" ' +
            'style="background:' + col + ';border:1px solid #d0d0d0;border-radius:3px;' +
            'display:flex;align-items:center;justify-content:center;color:#fff;' +
            'font-family:var(--mono,monospace);font-size:11px;text-shadow:0 0 2px #0008">o' + i + '</div>';
      }
      outRow.innerHTML = html;
    }

    // ---- render SVG arrows ----------------------------------------------------
    function drawSVG() {
      var parts = [];
      // axes for the qk plane
      parts.push('<line x1="0" y1="' + ORIGIN_Y + '" x2="' + W + '" y2="' + ORIGIN_Y +
                 '" stroke="#eaeaea"/>');
      parts.push('<line x1="' + (W / 2) + '" y1="60" x2="' + (W / 2) + '" y2="' + (H - 8) +
                 '" stroke="#eaeaea"/>');
      parts.push('<text x="' + (W / 2 + 4) + '" y="68" font-size="10" fill="#888">QK plane (d=2)</text>');

      // token row labels
      for (var i = 0; i < N; i++) {
        var x = tokenX(i);
        var col = 'rgb(' + V_COLORS[i].join(',') + ')';
        parts.push('<rect x="' + (x - 11) + '" y="' + (ROW_Y - 11) +
                   '" width="22" height="22" rx="3" fill="' + col + '" stroke="#222" stroke-width="0.6"/>');
        parts.push('<text x="' + x + '" y="' + (ROW_Y + 4) +
                   '" font-size="11" font-family="monospace" text-anchor="middle" fill="#fff">t' + i + '</text>');
      }

      // arrow defs
      parts.push(
        '<defs>' +
          '<marker id="' + SLUG + '-ah-q" viewBox="0 0 10 10" refX="8" refY="5" ' +
            'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
            '<path d="M0,0 L10,5 L0,10 z" fill="#1a1a1a"/></marker>' +
          '<marker id="' + SLUG + '-ah-k" viewBox="0 0 10 10" refX="8" refY="5" ' +
            'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
            '<path d="M0,0 L10,5 L0,10 z" fill="#6a3d9a"/></marker>' +
        '</defs>'
      );

      var ox = W / 2, oy = ORIGIN_Y;
      for (i = 0; i < N; i++) {
        var t = state.tokens[i];
        var qpx = vecToPx(t.q), kpx = vecToPx(t.k);
        var col2 = 'rgb(' + V_COLORS[i].join(',') + ')';
        // Q (filled colored) — small handle, not draggable in this build
        parts.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + qpx[0] + '" y2="' + qpx[1] +
                   '" stroke="#1a1a1a" stroke-width="1.4" marker-end="url(#' + SLUG + '-ah-q)" opacity="0.7"/>');
        parts.push('<circle cx="' + qpx[0] + '" cy="' + qpx[1] + '" r="3" fill="' + col2 + '"/>');
        // K (outline + draggable head)
        parts.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + kpx[0] + '" y2="' + kpx[1] +
                   '" stroke="#6a3d9a" stroke-width="1.2" stroke-dasharray="3,2" marker-end="url(#' + SLUG + '-ah-k)"/>');
        parts.push(
          '<circle class="k-handle" data-i="' + i + '" cx="' + kpx[0] + '" cy="' + kpx[1] +
            '" r="7" fill="' + col2 + '" stroke="#6a3d9a" stroke-width="2" ' +
            'style="cursor:grab" tabindex="0"/>'
        );
        // small label near K head
        parts.push('<text x="' + (kpx[0] + 8) + '" y="' + (kpx[1] - 6) +
                   '" font-size="9" font-family="monospace" fill="#6a3d9a">k' + i + '</text>');
      }

      // legend
      parts.push('<text x="8" y="' + (H - 6) + '" font-size="10" fill="#666">' +
                 '— Q (filled, fixed)   - - K (purple, drag the head)</text>');

      svg.innerHTML = parts.join('');

      // wire drag for k-handles
      var handles = svg.querySelectorAll('.k-handle');
      for (var hi = 0; hi < handles.length; hi++) {
        attachDrag(handles[hi]);
      }
    }

    function attachDrag(el) {
      var i = parseInt(el.getAttribute('data-i'), 10);
      var dragging = false;

      function onMove(ev) {
        if (!dragging) return;
        var pt = clientToSvg(ev.clientX, ev.clientY);
        var v = pxToVec(pt.x, pt.y);
        // clamp magnitude for stability
        var m = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
        if (m > 2.0) { v[0] *= 2.0 / m; v[1] *= 2.0 / m; }
        state.tokens[i].k = v;
        rerender();
      }
      function onUp() { dragging = false; document.body.style.cursor = ''; }

      el.addEventListener('mousedown', function (ev) {
        dragging = true; ev.preventDefault();
        document.body.style.cursor = 'grabbing';
      });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      // touch
      el.addEventListener('touchstart', function (ev) { dragging = true; ev.preventDefault(); });
      window.addEventListener('touchmove', function (ev) {
        if (!dragging || !ev.touches[0]) return;
        onMove({ clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY });
      });
      window.addEventListener('touchend', onUp);
      // keyboard nudge
      el.addEventListener('keydown', function (ev) {
        var step = 0.1;
        if (ev.key === 'ArrowLeft')  state.tokens[i].k[0] -= step;
        else if (ev.key === 'ArrowRight') state.tokens[i].k[0] += step;
        else if (ev.key === 'ArrowUp')    state.tokens[i].k[1] -= step;
        else if (ev.key === 'ArrowDown')  state.tokens[i].k[1] += step;
        else return;
        ev.preventDefault();
        rerender();
      });
    }

    function clientToSvg(cx, cy) {
      var rect = svg.getBoundingClientRect();
      return {
        x: (cx - rect.left) * (W / rect.width),
        y: (cy - rect.top)  * (H / rect.height)
      };
    }

    // ---- heatmap hover --------------------------------------------------------
    heat.addEventListener('mousemove', function (ev) {
      var rect = heat.getBoundingClientRect();
      var x = (ev.clientX - rect.left) * (heat.width / rect.width);
      var y = (ev.clientY - rect.top)  * (heat.height / rect.height);
      var j = Math.floor(x / (heat.width / N));
      var i = Math.floor(y / (heat.height / N));
      if (i >= 0 && i < N && j >= 0 && j < N) {
        state.hover = { i: i, j: j };
        rerender();
      }
    });
    heat.addEventListener('mouseleave', function () {
      state.hover = null;
      info.textContent = '';
      rerender();
    });

    // ---- mode toggle ----------------------------------------------------------
    for (var mi = 0; mi < modeRad.length; mi++) {
      modeRad[mi].addEventListener('change', function (ev) {
        state.mode = ev.target.value;
        rerender();
      });
    }
    resetBt.addEventListener('click', function () {
      state.tokens = defaultQK();
      rerender();
    });
    for (var pi2 = 0; pi2 < presetBts.length; pi2++) {
      presetBts[pi2].addEventListener('click', function (ev) {
        var kind = ev.currentTarget.getAttribute('data-preset');
        state.tokens = presetQK(kind);
        rerender();
      });
    }

    // ---- main render ----------------------------------------------------------
    function rerender() {
      var attn = computeAttn();
      drawSVG();
      drawHeatmap(attn);
      drawOutput(attn);
      if (state.hover) {
        var i = state.hover.i, j = state.hover.j;
        var s = attn.raw[i][j], a = attn.sm[i][j];
        info.textContent = 'q' + i + ' · k' + j + ' / √2 = ' + s.toFixed(3) +
                           '   →   α[' + i + ',' + j + '] = ' + a.toFixed(3);
        if (formulaEval) {
          formulaEval.innerHTML =
            '&nbsp;&nbsp;at (i=' + i + ', j=' + j + '): ' +
            's<sub>' + i + ',' + j + '</sub> = ' + s.toFixed(3) +
            ' &nbsp;&rarr;&nbsp; &alpha;<sub>' + i + ',' + j + '</sub> = ' + a.toFixed(3);
        }
      } else if (formulaEval) {
        formulaEval.textContent = ' hover the heatmap to evaluate at a specific (i, j)';
      }
      // readout: max attention per row average
      var sum = 0;
      for (var ii = 0; ii < N; ii++) {
        var mx = 0;
        for (var jj = 0; jj < N; jj++) if (attn.sm[ii][jj] > mx) mx = attn.sm[ii][jj];
        sum += mx;
      }
      readout.textContent = 'avg max α per row = ' + (sum / N).toFixed(3) +
        (state.mode === 'raw' ? '   (showing pre-softmax)' : '');
    }

    rerender();
  }

  window.Viz_attn_qkv_playground = { init: init };

  // auto-init
  function autoInit() {
    var el = document.getElementById('viz-attn_qkv_playground') ||
             document.getElementById('viz-attn-qkv-playground');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
