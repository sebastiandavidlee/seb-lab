/* A2 — multi_head_split (page 1).
 * Why multiple heads: 4 heads, each with hand-authored attention patterns over
 * a fixed 12-token prompt + a "concat + projection" combined heatmap.
 *
 * Tier-2 → Tier-1 upgrade (2026-05-07):
 *   - Hovering a token simultaneously highlights its row in all 4 heads + the
 *     combined heatmap (cross-head broadcast — the spec's punchline).
 *   - "Average heads (naive) vs learned mixing" toggle now shows a real,
 *     visually distinct difference: naive flattens the strong relations; the
 *     learned W_O over-weights the coref heads, so red↔cube₁ and blue↔cube₂
 *     stay sharp in the combined panel.
 *   - Per-row softmax bar under each head + combined panel: shows where mass
 *     redistributes when you click a head or a token.
 *   - Listens to `pibus:prefix-lm-active` → tints the syntactic head when M1
 *     toggles into prefix-LM mode (because π₀'s prefix-LM lets these
 *     mid-sequence tokens see each other bidirectionally).
 *   - Citation pill bottom-right: "Vaswani et al. 2017 §3.2" (multi-head
 *     attention origin) + "stylized example, not extracted weights".
 *
 * Exports: window.Viz_multi_head_split = { init(rootEl) }
 */
(function () {
  'use strict';

  var SLUG = 'multi_head_split';

  // Fixed 12-token prompt: "the red cube is to the left of the blue cube" + 1 pad.
  var TOKENS = ['the', 'red', 'cube', 'is', 'to', 'the', 'left', 'of', 'the', 'blue', 'cube', '.'];
  var N = TOKENS.length;

  var HEAD_COLORS = ['#6a3d9a', '#1abc9c', '#ff8c1a', '#c0392b']; // VLM-purple, flow-teal, expert-amber, AR-coral

  // ---------------- hand-authored patterns ----------------
  function makePositional() {
    // each token attends mostly to its left neighbors, exponentially decaying.
    var m = [];
    for (var i = 0; i < N; i++) {
      var row = new Array(N).fill(0);
      for (var j = 0; j < N; j++) {
        var d = i - j;
        if (d >= 0 && d <= 2) row[j] = Math.exp(-d * 1.2);
      }
      normalize(row); m.push(row);
    }
    return m;
  }

  function makeSyntactic() {
    // "is" (idx 3) attends to its subject "cube" (idx 2). Verbs find subjects.
    var m = [];
    for (var i = 0; i < N; i++) {
      var row = new Array(N).fill(0.02);
      row[3] = 0.4;
      if (i === 3) { row[2] = 0.7; row[3] = 0.1; row[10] = 0.1; }
      if (i === 6) { row[3] = 0.5; row[7] = 0.2; }
      if (i === 7) { row[6] = 0.6; }
      normalize(row); m.push(row);
    }
    return m;
  }

  function makeColorCoref() {
    // "red" (1) ↔ "cube" (2); "blue" (9) ↔ "cube" (10).
    var m = [];
    for (var i = 0; i < N; i++) {
      var row = new Array(N).fill(0.04);
      if      (i === 1)  row[2] = 0.85;
      else if (i === 2)  row[1] = 0.85;
      else if (i === 9)  row[10] = 0.85;
      else if (i === 10) row[9]  = 0.85;
      else               row[i]  = 0.5;
      normalize(row); m.push(row);
    }
    return m;
  }

  function makeObjectCoref() {
    // The two "cube" tokens (2 and 10) find each other.
    var m = [];
    for (var i = 0; i < N; i++) {
      var row = new Array(N).fill(0.03);
      row[i] = 0.4;
      if      (i === 2)  { row[10] = 0.7; row[2]  = 0.15; }
      else if (i === 10) { row[2]  = 0.7; row[10] = 0.15; }
      normalize(row); m.push(row);
    }
    return m;
  }

  function normalize(row) {
    var s = 0;
    for (var k = 0; k < row.length; k++) s += row[k];
    if (s <= 0) { row[0] = 1; return; }
    for (var kk = 0; kk < row.length; kk++) row[kk] /= s;
  }

  var HEADS = [
    { name: 'positional',         desc: 'each token attends to near-left neighbors',   matrix: makePositional()   },
    { name: 'syntactic',          desc: 'verb "is" finds its subject "cube"',          matrix: makeSyntactic()    },
    { name: 'color-coref',        desc: 'red↔cube₁ and blue↔cube₂ bind tightly',       matrix: makeColorCoref()   },
    { name: 'object-coref',       desc: 'the two cube tokens find each other',         matrix: makeObjectCoref()  }
  ];

  // Concat + W_O. Naive = uniform mean (flattens). Learned = over-weights coref heads.
  function combineMatrices(matrices, weights) {
    var out = [];
    for (var i = 0; i < N; i++) {
      var row = new Array(N).fill(0);
      for (var h = 0; h < matrices.length; h++) {
        var w = weights[h];
        for (var j = 0; j < N; j++) row[j] += w * matrices[h][i][j];
      }
      // For "learned mixing" we additionally sharpen so the strongest cells
      // stay visibly distinguished (W_O can act like a learned temperature).
      out.push(row);
    }
    return out;
  }

  function sharpenRows(mat, gamma) {
    // Apply x ← x^gamma then renormalize. gamma>1 sharpens; gamma=1 is identity.
    var out = [];
    for (var i = 0; i < mat.length; i++) {
      var r = mat[i].slice();
      for (var j = 0; j < r.length; j++) r[j] = Math.pow(r[j], gamma);
      normalize(r);
      out.push(r);
    }
    return out;
  }

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="position:relative">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">Multi-head split &mdash; 4 heads, 4 relations</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1;min-width:280px">' +
            'Hand-authored patterns over the fixed prompt below. Hover a token &rarr; all 4 heads light up where it attends.' +
          '</div>' +
          '<div style="font-family:var(--mono,monospace);font-size:11px;color:#666">stylized example</div>' +
        '</header>' +

        '<div style="margin:8px 0 12px 0;padding:8px 10px;background:#fafafa;border:1px solid #e0e0e0;' +
          'border-radius:4px;display:flex;gap:6px;flex-wrap:wrap;font-family:var(--mono,monospace);font-size:13px">' +
          '<span style="color:#888">prompt:</span>' +
          '<span class="js-prompt"></span>' +
        '</div>' +

        '<div class="js-heads" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px"></div>' +

        '<div style="margin:14px 0 6px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
          '<div style="font-size:13px;font-weight:600">Concat + output projection W<sub>O</sub></div>' +
          '<label style="font-size:12px;color:#555;cursor:pointer">' +
            '<input type="radio" name="mix-' + SLUG + '" value="naive" class="js-mix"> naive average (uniform)' +
          '</label>' +
          '<label style="font-size:12px;color:#555;cursor:pointer">' +
            '<input type="radio" name="mix-' + SLUG + '" value="learned" class="js-mix" checked> learned mixing (W<sub>O</sub>)' +
          '</label>' +
        '</div>' +

        '<div class="js-combined-wrap" style="display:grid;grid-template-columns:1fr 1.3fr;gap:14px;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;padding:10px">' +
          '<div>' +
            '<canvas class="js-canvas-combined" width="320" height="320" ' +
              'style="display:block;margin:0 auto;width:100%;max-width:320px;height:auto;image-rendering:pixelated"></canvas>' +
            '<div style="text-align:center;font-size:11px;color:#666;margin-top:6px">' +
              'combined attention after W<sub>O</sub></div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:#555;margin-bottom:6px">' +
              'softmax row for selected query <span class="js-row-label" style="font-family:var(--mono,monospace);color:#1a1a1a">(hover or click a token)</span>' +
            '</div>' +
            '<canvas class="js-row-bars" width="600" height="120" ' +
              'style="display:block;width:100%;height:120px;background:#fff;border:1px solid #d0d0d0;border-radius:3px"></canvas>' +
            '<div class="js-prefixlm-hint" style="margin-top:8px;font-size:11px;color:#6a3d9a;display:none">' +
              'M1 is now in prefix-LM mode &rarr; this is exactly what lets &pi;<sub>0</sub> mix VLM (image+text) with action tokens.' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:12px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          '<b>Stylized example, not extracted weights.</b> Real heads are messier; ' +
          'the pedagogical claim "different heads specialize" is real but per-head interpretability is hard. ' +
          'Total dim is fixed: with d_model=2048 and h=18 (the &pi;<sub>0</sub> Gemma-2B backbone), each head is head_dim=256. ' +
          'Toggle the mix radios to see how the output projection sharpens specialized relations.' +
        '</div>' +
      '</div>';

    // ---------------- token chips ----------------
    var promptEl = rootEl.querySelector('.js-prompt');
    var pHTML = '';
    for (var t = 0; t < N; t++) {
      pHTML += '<span class="js-tok" data-tok="' + t + '" style="display:inline-block;padding:2px 7px;border-radius:3px;' +
        'background:#fff;border:1px solid #ccc;cursor:pointer;font-size:12px;transition:all 100ms">' + TOKENS[t] + '</span>';
    }
    promptEl.innerHTML = pHTML;

    // ---------------- per-head heatmaps ----------------
    var headsEl = rootEl.querySelector('.js-heads');
    var hHTML = '';
    for (var h = 0; h < HEADS.length; h++) {
      hHTML +=
        '<div class="js-head" data-head="' + h + '" style="background:#fff;border:1px solid ' + HEAD_COLORS[h] + ';' +
          'border-radius:4px;padding:8px;cursor:pointer;transition:all 120ms">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
            '<span class="js-head-swatch" style="display:inline-block;width:10px;height:10px;background:' + HEAD_COLORS[h] + ';border-radius:2px"></span>' +
            '<span style="font-size:12px;font-weight:600">head ' + (h + 1) + ' &middot; ' + HEADS[h].name + '</span>' +
          '</div>' +
          '<canvas class="js-canvas" data-head="' + h + '" width="180" height="180" ' +
            'style="width:100%;height:auto;display:block;image-rendering:pixelated"></canvas>' +
          '<div style="font-size:10.5px;color:#666;margin-top:5px;font-style:italic">' + HEADS[h].desc + '</div>' +
        '</div>';
    }
    headsEl.innerHTML = hHTML;

    // ---------------- state ----------------
    var state = {
      selectedHead: -1,
      selectedToken: -1,
      hoverToken: -1,
      mix: 'learned'
    };

    // ---------------- drawing ----------------
    function drawHeatmap(canvas, mat, color, opts) {
      opts = opts || {};
      var ctx = canvas.getContext('2d');
      var w = canvas.width, hgt = canvas.height;
      ctx.clearRect(0, 0, w, hgt);
      var cell = w / N;
      var rgb = (typeof SharedPi !== 'undefined' && SharedPi.hexToRgb)
        ? SharedPi.hexToRgb(color) : [102, 102, 102];

      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          var v = mat[i][j];
          var alpha = Math.min(1, Math.pow(v * 1.6, 0.7));
          ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
          ctx.fillRect(j * cell, i * cell, cell, cell);
        }
      }
      // grid
      ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
      for (var k = 0; k <= N; k++) {
        ctx.beginPath(); ctx.moveTo(k * cell, 0); ctx.lineTo(k * cell, hgt); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, k * cell); ctx.lineTo(w, k * cell); ctx.stroke();
      }
      // active query row outline (selected or hovered)
      var activeRow = (opts.tokenIdx >= 0) ? opts.tokenIdx : -1;
      if (activeRow >= 0) {
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.strokeRect(0, activeRow * cell, w, cell);
      }
    }

    function drawRowBars(canvas, mat, queryIdx, color, label) {
      var ctx = canvas.getContext('2d');
      var w = canvas.width, hgt = canvas.height;
      ctx.clearRect(0, 0, w, hgt);
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, w, hgt);

      if (queryIdx < 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText('(hover or click a token to see its row)', 12, hgt / 2);
        return;
      }
      var row = mat[queryIdx];
      var pad = 28, axisH = 22;
      var cw = (w - pad * 2) / N;
      var maxV = 0;
      for (var j0 = 0; j0 < N; j0++) if (row[j0] > maxV) maxV = row[j0];
      var rgb = (typeof SharedPi !== 'undefined' && SharedPi.hexToRgb)
        ? SharedPi.hexToRgb(color) : [60, 60, 60];

      for (var j = 0; j < N; j++) {
        var bh = (row[j] / Math.max(1e-6, maxV)) * (hgt - axisH - 14);
        var x = pad + j * cw;
        var y = hgt - axisH - bh;
        ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.85)';
        ctx.fillRect(x + 1, y, cw - 2, bh);
        // token label
        ctx.fillStyle = (j === queryIdx) ? '#000' : '#666';
        ctx.font = (j === queryIdx ? 'bold ' : '') + '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(TOKENS[j], x + cw / 2, hgt - 8);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#444';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(label, 8, 16);
    }

    function buildCombined() {
      var weights, gamma;
      if (state.mix === 'naive') { weights = [0.25, 0.25, 0.25, 0.25]; gamma = 1.0; }
      else                       { weights = [0.18, 0.22, 0.30, 0.30]; gamma = 1.6; }
      var mats = [HEADS[0].matrix, HEADS[1].matrix, HEADS[2].matrix, HEADS[3].matrix];
      var combined = combineMatrices(mats, weights);
      // normalize each row
      for (var i = 0; i < combined.length; i++) normalize(combined[i]);
      return sharpenRows(combined, gamma);
    }

    function activeQuery() {
      if (state.hoverToken >= 0) return state.hoverToken;
      return state.selectedToken;
    }

    function redraw() {
      var q = activeQuery();
      // per-head heatmaps
      for (var h = 0; h < HEADS.length; h++) {
        var canvas = rootEl.querySelector('canvas.js-canvas[data-head="' + h + '"]');
        var faded = state.selectedHead >= 0 && state.selectedHead !== h;
        canvas.style.opacity = faded ? '0.30' : '1';
        drawHeatmap(canvas, HEADS[h].matrix, HEAD_COLORS[h], { tokenIdx: q });
        var parent = rootEl.querySelector('.js-head[data-head="' + h + '"]');
        parent.style.borderWidth = (state.selectedHead === h) ? '2px' : '1px';
        parent.style.boxShadow = (state.selectedHead === h) ? '0 0 0 3px ' + HEAD_COLORS[h] + '33' : 'none';
      }
      // combined
      var combined = buildCombined();
      var cc = rootEl.querySelector('.js-canvas-combined');
      drawHeatmap(cc, combined, '#444', { tokenIdx: q });

      // softmax row bars: show the active head if one is selected, else combined
      var rowMat = (state.selectedHead >= 0) ? HEADS[state.selectedHead].matrix : combined;
      var rowColor = (state.selectedHead >= 0) ? HEAD_COLORS[state.selectedHead] : '#444';
      var rowLabel = (state.selectedHead >= 0)
        ? ('head ' + (state.selectedHead + 1) + ' · ' + HEADS[state.selectedHead].name)
        : ('combined · ' + (state.mix === 'naive' ? 'naive avg' : 'learned W_O'));
      drawRowBars(rootEl.querySelector('.js-row-bars'), rowMat, q, rowColor, rowLabel);

      var rowLabelEl = rootEl.querySelector('.js-row-label');
      rowLabelEl.textContent = q >= 0 ? ('q = "' + TOKENS[q] + '" (idx ' + q + ')') : '(hover or click a token)';
    }

    // ---------------- wiring ----------------
    var headEls = rootEl.querySelectorAll('.js-head');
    for (var hi = 0; hi < headEls.length; hi++) {
      headEls[hi].addEventListener('click', function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-head'), 10);
        state.selectedHead = (state.selectedHead === idx) ? -1 : idx;
        redraw();
      });
    }
    var tokEls = rootEl.querySelectorAll('.js-tok');
    for (var ti = 0; ti < tokEls.length; ti++) {
      tokEls[ti].addEventListener('mouseenter', function (ev) {
        state.hoverToken = parseInt(ev.currentTarget.getAttribute('data-tok'), 10);
        redraw();
      });
      tokEls[ti].addEventListener('mouseleave', function () {
        state.hoverToken = -1;
        redraw();
      });
      tokEls[ti].addEventListener('click', function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-tok'), 10);
        state.selectedToken = (state.selectedToken === idx) ? -1 : idx;
        var chips = rootEl.querySelectorAll('.js-tok');
        for (var c = 0; c < chips.length; c++) {
          var on = parseInt(chips[c].getAttribute('data-tok'), 10) === state.selectedToken;
          chips[c].style.background = on ? '#1a1a1a' : '#fff';
          chips[c].style.color = on ? '#fff' : '#222';
        }
        redraw();
      });
    }
    var mixes = rootEl.querySelectorAll('.js-mix');
    for (var m = 0; m < mixes.length; m++) {
      mixes[m].addEventListener('change', function (ev) {
        state.mix = ev.target.value;
        redraw();
      });
    }

    // ---------------- PiBus listener: prefix-LM mode emitted by M1 ----------------
    if (window.PiBus) {
      window.PiBus.on('pibus:prefix-lm-active', function (payload) {
        var hint = rootEl.querySelector('.js-prefixlm-hint');
        if (!hint) return;
        var on = payload && payload.active;
        hint.style.display = on ? 'block' : 'none';
        // Tint the syntactic head's swatch — the head most about token-to-token relations.
        var swatch = rootEl.querySelectorAll('.js-head-swatch')[1];
        if (swatch) swatch.style.boxShadow = on ? '0 0 0 3px #6a3d9a55' : 'none';
      });
    }

    // citation pill
    if (typeof SharedPi !== 'undefined' && SharedPi.citationPill) {
      SharedPi.citationPill(rootEl, 'Vaswani et al. 2017 — multi-head attention');
    }

    redraw();
  }

  window.Viz_multi_head_split = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-multi_head_split');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
