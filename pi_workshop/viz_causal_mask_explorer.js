/* Viz M1 — Causal Mask Explorer (causal / bidirectional / prefix-LM).
 * Bridges generic transformer attention to π₀'s block-causal pattern.
 *
 * N×N grid (Canvas), N slider 4..32. Mode radio + prefix-length slider for prefix-LM.
 * Hover row → softmax bar shows how mass redistributes among allowed keys.
 *
 * Exports: window.Viz_causal_mask_explorer = { init(rootEl) }.
 */
(function () {
  'use strict';

  var SLUG = 'causal_mask_explorer';

  function softmax(arr, mask) {
    var m = -Infinity, i;
    for (i = 0; i < arr.length; i++) if (mask[i] && arr[i] > m) m = arr[i];
    if (m === -Infinity) return arr.map(function () { return 0; });
    var e = new Array(arr.length), s = 0;
    for (i = 0; i < arr.length; i++) e[i] = mask[i] ? Math.exp(arr[i] - m) : 0;
    for (i = 0; i < arr.length; i++) s += e[i];
    for (i = 0; i < arr.length; i++) e[i] = s > 0 ? e[i] / s : 0;
    return e;
  }

  // Deterministic synthetic logits per (i, j). Pure function of (i, j, N).
  function logit(i, j, N) {
    var d = Math.abs(i - j);
    var bell = Math.exp(-(d * d) / (2 * 4 * 4));   // closer keys slightly preferred
    var ripple = 0.4 * Math.sin((i + 1) * (j + 2) * 0.7);
    return 1.6 * bell + ripple;
  }

  function buildMask(mode, N, prefix) {
    var M = new Array(N);
    for (var i = 0; i < N; i++) {
      M[i] = new Array(N);
      for (var j = 0; j < N; j++) {
        if (mode === 'bidirectional') {
          M[i][j] = 1;
        } else if (mode === 'causal') {
          M[i][j] = (j <= i) ? 1 : 0;
        } else { // prefix-lm
          if (j < prefix) M[i][j] = 1;          // prefix keys always visible
          else if (i < prefix) M[i][j] = (j < prefix) ? 1 : 0; // prefix queries can't see future suffix
          else M[i][j] = (j <= i) ? 1 : 0;       // suffix queries causal
        }
      }
    }
    return M;
  }

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="font-family:inherit">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">M1 · Causal Mask Explorer</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1">' +
            'three masks, one matrix — prefix-LM is the punchline (it\'s π₀\'s pattern)' +
          '</div>' +
          '<div class="cite cite--mono" style="font-family:var(--mono,monospace);font-size:11px;color:#666">' +
            'PaliGemma · π₀ block-causal' +
          '</div>' +
        '</header>' +

        '<div class="viz-controls" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:6px 0 10px;font-size:12px">' +
          '<label>N <input class="js-N" type="range" min="4" max="32" step="1" value="16" style="vertical-align:middle"> ' +
            '<span class="js-N-out" style="font-family:var(--mono,monospace)">16</span></label>' +
          '<span style="border-left:1px solid #ccc;height:16px"></span>' +
          '<label><input type="radio" name="' + SLUG + '-mode" value="causal" checked> causal</label>' +
          '<label><input type="radio" name="' + SLUG + '-mode" value="bidirectional"> bidirectional</label>' +
          '<label style="background:#fff7e6;padding:2px 6px;border:1px solid #ff8c1a;border-radius:3px">' +
            '<input type="radio" name="' + SLUG + '-mode" value="prefix-lm"> prefix-LM</label>' +
          '<label class="js-prefix-wrap" style="opacity:0.4">prefix len ' +
            '<input class="js-prefix" type="range" min="1" max="15" step="1" value="6" disabled> ' +
            '<span class="js-prefix-out" style="font-family:var(--mono,monospace)">6</span></label>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 320px;gap:14px;align-items:start">' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">' +
              'mask grid · row = query, col = key · white = attend, dark = masked' +
            '</div>' +
            '<canvas class="js-grid" width="528" height="528" ' +
              'style="display:block;background:#1a1a1a;border:1px solid #d0d0d0;cursor:crosshair"></canvas>' +
            '<div class="js-hover-info" style="font-size:11px;color:#444;font-family:var(--mono,monospace);min-height:14px;margin-top:4px"></div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">' +
              'softmax row for highlighted query · all masked keys → 0' +
            '</div>' +
            '<canvas class="js-bar" width="320" height="200" ' +
              'style="display:block;background:#fff;border:1px solid #d0d0d0"></canvas>' +
            '<div class="js-bar-info" style="font-size:11px;color:#666;margin-top:4px">hover the grid →</div>' +
            '<div class="js-mode-note" style="margin-top:14px;font-size:11px;color:#444;background:#f4f4f2;padding:8px;border-left:3px solid #6a3d9a"></div>' +
          '</div>' +
        '</div>' +

        '<div class="js-pi0-bridge" style="display:none;margin-top:10px;font-size:12.5px;background:#fff7e6;' +
          'padding:10px 12px;border-left:3px solid #ff8c1a;border-radius:0 4px 4px 0">' +
          '<b>This is exactly π₀\'s attention pattern.</b> The prefix block holds image patches, language tokens, and the ' +
          'robot-state token (all mutually visible). The suffix block holds the noisy action chunk being denoised over ' +
          '10 flow-matching steps (causal among themselves, can read the full prefix, never written-to by the prefix). ' +
          '<a href="page2.html#viz-prefix_lm_attention_pi0" style="color:#6a3a05;text-decoration:underline;font-weight:600">' +
          'Jump to Page 2 to see this mask wired through the &pi;&#x2080; block diagram &rarr;</a>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:10px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          'In π₀ this is implemented as block-causal attention with two experts ' +
          '(VLM backbone over the prefix, action expert over the suffix). The mask shape is what you see in prefix-LM mode.' +
        '</div>' +
      '</div>';

    var canvas    = rootEl.querySelector('.js-grid');
    var bar       = rootEl.querySelector('.js-bar');
    var hoverInfo = rootEl.querySelector('.js-hover-info');
    var barInfo   = rootEl.querySelector('.js-bar-info');
    var nSlider   = rootEl.querySelector('.js-N');
    var nOut      = rootEl.querySelector('.js-N-out');
    var pSlider   = rootEl.querySelector('.js-prefix');
    var pOut      = rootEl.querySelector('.js-prefix-out');
    var pWrap     = rootEl.querySelector('.js-prefix-wrap');
    var modeRads  = rootEl.querySelectorAll('input[name="' + SLUG + '-mode"]');
    var modeNote  = rootEl.querySelector('.js-mode-note');
    var bridge    = rootEl.querySelector('.js-pi0-bridge');

    var MODE_NOTES = {
      'causal': '<b>causal</b>: the standard decoder-LM mask. Token t can read 0..t but never the future. ' +
                'KV cache works because the past never changes shape: each new token adds one column.',
      'bidirectional': '<b>bidirectional</b>: every token sees every other (BERT, encoders, vision transformers). ' +
                       'No KV-cache trick &mdash; you re-encode the whole sequence each call.',
      'prefix-lm': '<b>prefix-LM</b>: a contiguous prefix of keys (image+text in PaliGemma; image+text+state in &pi;&#x2080;) ' +
                   'is fully bidirectional; the suffix (action tokens) is causal w.r.t. itself but can read the entire prefix.'
    };

    var state = {
      N: 16, mode: 'causal', prefix: 6, hoverRow: null
    };

    function syncPrefixUI() {
      var on = state.mode === 'prefix-lm';
      pSlider.disabled = !on;
      pWrap.style.opacity = on ? '1' : '0.4';
      pSlider.max = String(state.N - 1);
      if (state.prefix >= state.N) state.prefix = Math.max(1, state.N - 1);
      pSlider.value = String(state.prefix);
      pOut.textContent = String(state.prefix);
      if (modeNote) modeNote.innerHTML = MODE_NOTES[state.mode] || '';
      if (bridge)   bridge.style.display = on ? 'block' : 'none';
    }

    function drawGrid() {
      var ctx = canvas.getContext('2d');
      var W = canvas.width, H = canvas.height, N = state.N;
      var cell = Math.floor(Math.min(W, H) / N);
      var inset = (W - cell * N) / 2;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, W, H);
      var mask = buildMask(state.mode, N, state.prefix);

      // dim region tints (prefix-LM)
      if (state.mode === 'prefix-lm') {
        ctx.fillStyle = 'rgba(106,61,154,0.18)';
        ctx.fillRect(inset, inset, cell * state.prefix, cell * state.prefix);
        ctx.fillStyle = 'rgba(255,140,26,0.12)';
        ctx.fillRect(inset + cell * state.prefix, inset + cell * state.prefix,
                     cell * (N - state.prefix), cell * (N - state.prefix));
      }

      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          if (mask[i][j]) {
            ctx.fillStyle = '#fafafa';
            ctx.fillRect(inset + j * cell + 1, inset + i * cell + 1, cell - 2, cell - 2);
          } else {
            // dark grey
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(inset + j * cell + 1, inset + i * cell + 1, cell - 2, cell - 2);
          }
        }
      }

      // prefix boundary line + labeled block overlays in prefix-LM mode
      if (state.mode === 'prefix-lm') {
        ctx.strokeStyle = '#ff8c1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(inset + state.prefix * cell, inset);
        ctx.lineTo(inset + state.prefix * cell, inset + N * cell);
        ctx.moveTo(inset, inset + state.prefix * cell);
        ctx.lineTo(inset + N * cell, inset + state.prefix * cell);
        ctx.stroke();

        // Labeled overlays — only when each block has enough cells to be readable.
        var prefPx = cell * state.prefix;
        var sufPx  = cell * (N - state.prefix);
        ctx.font = 'bold 12px var(--mono, monospace)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (state.prefix >= 3) {
          // [prefix] label centered on the upper-left bidirectional block
          var px = inset + prefPx / 2;
          var py = inset + prefPx / 2;
          ctx.fillStyle = 'rgba(106,61,154,0.92)';
          ctx.fillText('[prefix]', px, py - 8);
          ctx.font = '10px var(--mono, monospace)';
          ctx.fillText('image + text + state', px, py + 6);
          ctx.fillText('bidirectional', px, py + 18);
          ctx.font = 'bold 12px var(--mono, monospace)';
        }
        if (N - state.prefix >= 3) {
          // [generation] label centered on the lower-right causal triangle
          var gx = inset + prefPx + sufPx / 2;
          var gy = inset + prefPx + sufPx / 2;
          ctx.fillStyle = 'rgba(255,140,26,0.95)';
          ctx.fillText('[generation]', gx, gy - 8);
          ctx.font = '10px var(--mono, monospace)';
          ctx.fillText('action chunk', gx, gy + 6);
          ctx.fillText('causal', gx, gy + 18);
        }
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      }

      // hover row outline
      if (state.hoverRow !== null && state.hoverRow < N) {
        ctx.strokeStyle = '#1abc9c';
        ctx.lineWidth = 2;
        ctx.strokeRect(inset, inset + state.hoverRow * cell, cell * N, cell);
      }

      // axis labels (i, j)
      ctx.fillStyle = '#888';
      ctx.font = '10px var(--mono, monospace)';
      ctx.textAlign = 'left';
      ctx.fillText('j (key) →', inset + 2, inset - 4);
      ctx.save();
      ctx.translate(inset - 4, inset + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('i (query) →', -cell * N + 2, 0);
      ctx.restore();
    }

    function drawBar() {
      var ctx = bar.getContext('2d');
      var W = bar.width, H = bar.height;
      ctx.clearRect(0, 0, W, H);
      var pad = { l: 8, r: 8, t: 12, b: 22 };

      ctx.fillStyle = '#888';
      ctx.font = '10px var(--mono, monospace)';
      if (state.hoverRow === null) {
        ctx.textAlign = 'center';
        ctx.fillText('hover a query row in the grid', W / 2, H / 2);
        return;
      }
      var N = state.N;
      var mask = buildMask(state.mode, N, state.prefix)[state.hoverRow];
      var raw = new Array(N);
      for (var j = 0; j < N; j++) raw[j] = logit(state.hoverRow, j, N);
      var sm = softmax(raw, mask);

      var bw = (W - pad.l - pad.r) / N;
      var bh = H - pad.t - pad.b;
      var maxP = 0;
      for (j = 0; j < N; j++) if (sm[j] > maxP) maxP = sm[j];
      if (maxP < 1e-6) maxP = 1;
      for (j = 0; j < N; j++) {
        var x = pad.l + j * bw;
        var p = sm[j];
        var h = (p / maxP) * bh;
        if (mask[j]) {
          ctx.fillStyle = (state.mode === 'prefix-lm' && j < state.prefix) ? '#6a3d9a' : '#1abc9c';
        } else {
          ctx.fillStyle = '#e0e0e0';
        }
        ctx.fillRect(x + 1, pad.t + bh - h, bw - 2, h);
        // tiny key index every 4
        if (j % 4 === 0) {
          ctx.fillStyle = '#888';
          ctx.textAlign = 'center';
          ctx.fillText('k' + j, x + bw / 2, pad.t + bh + 11);
        }
      }
      ctx.fillStyle = '#444';
      ctx.font = '11px var(--mono, monospace)';
      ctx.textAlign = 'left';
      var allowed = mask.reduce(function (a, b) { return a + b; }, 0);
      barInfo.textContent = 'query i=' + state.hoverRow + '  ·  ' + allowed + '/' + N +
        ' keys allowed  ·  max α=' + maxP.toFixed(3);
    }

    function rerender() {
      syncPrefixUI();
      drawGrid();
      drawBar();
    }

    nSlider.addEventListener('input', function () {
      state.N = parseInt(nSlider.value, 10);
      nOut.textContent = String(state.N);
      if (state.hoverRow !== null && state.hoverRow >= state.N) state.hoverRow = null;
      rerender();
    });
    pSlider.addEventListener('input', function () {
      state.prefix = parseInt(pSlider.value, 10);
      pOut.textContent = String(state.prefix);
      rerender();
    });
    for (var i = 0; i < modeRads.length; i++) {
      modeRads[i].addEventListener('change', function (ev) {
        state.mode = ev.target.value;
        rerender();
      });
    }

    canvas.addEventListener('mousemove', function (ev) {
      var rect = canvas.getBoundingClientRect();
      var x = (ev.clientX - rect.left) * (canvas.width / rect.width);
      var y = (ev.clientY - rect.top)  * (canvas.height / rect.height);
      var N = state.N;
      var cell = Math.floor(Math.min(canvas.width, canvas.height) / N);
      var inset = (canvas.width - cell * N) / 2;
      var i = Math.floor((y - inset) / cell);
      var j = Math.floor((x - inset) / cell);
      if (i >= 0 && i < N && j >= 0 && j < N) {
        state.hoverRow = i;
        var mask = buildMask(state.mode, N, state.prefix);
        var allowed = mask[i][j] ? 'attended' : 'masked';
        hoverInfo.textContent = 'i=' + i + ', j=' + j + ' → ' + allowed +
          (state.mode === 'prefix-lm'
            ? '   (prefix=0..' + (state.prefix - 1) + ')'
            : '');
        rerender();
      }
    });
    canvas.addEventListener('mouseleave', function () {
      state.hoverRow = null;
      hoverInfo.textContent = '';
      rerender();
    });

    rerender();
  }

  window.Viz_causal_mask_explorer = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-causal_mask_explorer') ||
             document.getElementById('viz-causal-mask-explorer');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
