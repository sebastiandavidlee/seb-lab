/* D2 — transformer_block_dataflow (page 1).
 * Dark-theme block diagram of one decoder block, tensor by tensor.
 * Stages: input → RMSNorm → Q/K/V → attn → attn-out → +residual →
 *         RMSNorm → MLP up → GELU → MLP down → +residual.
 *
 * Tier-2 → Tier-1 upgrade (2026-05-07):
 *   - 11 stages with deterministic activation strips that change shape & energy
 *     across stages (Q/K/V is 3D-wide, MLP-up is 4D-wide, others D-wide).
 *   - Hover any tensor strip → tooltip with `[B=1, T=16, D=64]` and a
 *     stage-specific note. Click jumps the scrubber to that stage.
 *   - Play / pause auto-walks the stages at ~700 ms per step (paused for
 *     prefers-reduced-motion).
 *   - "show residual stream highlight" actually draws a red SVG trace from
 *     `input` → `+residual` (1) → `+residual` (2). The bus of activations
 *     literally flows along that trace.
 *   - Output detail pane shows shape, op, "what changes here?" — pulled from
 *     a per-stage table.
 *   - Citation pill: "Touvron et al. 2023 (LLaMA) — pre-norm decoder".
 *
 * Exports: window.Viz_transformer_block_dataflow = { init(rootEl) }
 */
(function () {
  'use strict';

  var T = 16, D = 64;

  // Each stage: shapeMul = how many D-units wide (1 for [T,D]; 3 for QKV; 4 for MLP-up)
  var STAGES = [
    { id: 'input',    name: 'input',         shapeMul: 1, shape: '[B, T, D]',  note: 'residual stream entering the block', detail: 'The activation tensor that arrived from the previous block (or from the embedder for block 0). Shape is preserved across all "stream" ops.' },
    { id: 'norm1',    name: 'RMSNorm',       shapeMul: 1, shape: '[B, T, D]',  note: 'normalize before attention (pre-norm)', detail: 'Per-token RMS normalization. No learnable bias — just a scale γ. Pre-norm placement (LLaMA, Gemma, π₀) is the modern convention.' },
    { id: 'qkv',      name: 'Q/K/V proj',    shapeMul: 3, shape: '[B, T, 3D]', note: 'three linear projections, stacked on a single matmul', detail: 'A single fused matmul produces queries, keys, and values, each of total dim D = h × head_dim. The 3× width here is bookkeeping; downstream they split per-head.' },
    { id: 'attn',     name: 'attention',     shapeMul: 1, shape: '[B, T, D]',  note: 'softmax(QKᵀ/√d_h) · V, per head, then concat', detail: 'Each head computes its own [T, T] attention matrix (causal-masked in a decoder), mixes V along the time axis, and re-concats to [T, D].' },
    { id: 'attn_out', name: 'attn-out proj', shapeMul: 1, shape: '[B, T, D]',  note: 'linear projection back to d_model', detail: 'W_O — the projection that lets multiple heads be more than independent paths. This is what the A2 viz illustrates with the "learned mixing" toggle.' },
    { id: 'add1',     name: '+ residual',    shapeMul: 1, shape: '[B, T, D]',  note: 'first residual add — bus picks up attn output', detail: 'x ← x + attn_out(x). Without this, deep stacks lose gradient. The red residual-stream highlight (above) is this bus.' },
    { id: 'norm2',    name: 'RMSNorm',       shapeMul: 1, shape: '[B, T, D]',  note: 'second pre-norm before MLP', detail: 'Same RMSNorm op as before — a fresh γ. The token-mixing (attn) and channel-mixing (MLP) sub-blocks each get their own pre-norm.' },
    { id: 'mlp_up',   name: 'MLP up',        shapeMul: 4, shape: '[B, T, 4D]', note: 'up-project to mlp_dim (4–8× width)', detail: 'On Gemma-2B (π₀ backbone) mlp_dim = 16384 = 8× d_model = 2048. This is where most of the flops live — the wide hidden state.' },
    { id: 'gelu',     name: 'GELU',          shapeMul: 4, shape: '[B, T, 4D]', note: 'activation; non-linearity lives here', detail: 'Pointwise GELU (or SwiGLU in Gemma). Only this op introduces non-linearity inside the channel-mixer; everything else is linear matmul + LayerNorm-family normalization.' },
    { id: 'mlp_down', name: 'MLP down',      shapeMul: 1, shape: '[B, T, D]',  note: 'down-project back to d_model', detail: 'Project the wide hidden back to d_model = D, ready to add to the residual stream.' },
    { id: 'add2',     name: '+ residual',    shapeMul: 1, shape: '[B, T, D]',  note: 'second residual add — bus picks up MLP output', detail: 'x ← x + mlp_down(gelu(mlp_up(norm2(x)))). The output of the entire block is back at [B, T, D] — ready to feed the next block.' }
  ];

  // ---------------- helpers ----------------
  var rng32 = (typeof SharedPi !== 'undefined' && SharedPi.mulberry32)
    ? SharedPi.mulberry32
    : function (a) { return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  var viridis = (typeof SharedPi !== 'undefined' && SharedPi.viridis) ? SharedPi.viridis : function (t) {
    t = Math.max(0, Math.min(1, t));
    var stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
    var k = t * (stops.length - 1), i = Math.floor(k), f = k - i;
    if (i >= stops.length - 1) return stops[stops.length - 1];
    var a = stops[i], b = stops[i + 1];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
  };

  function drawTensor(canvas, seed, intensity, widthMul) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    // Internal cell grid: T rows × (D * widthMul) columns. We draw the whole
    // virtual tensor scaled to the canvas, so wider stages look wider.
    var cols = D * widthMul;
    var cellW = w / cols, cellH = h / T;
    var rng = rng32(seed);
    for (var t = 0; t < T; t++) {
      for (var d = 0; d < cols; d++) {
        var v = rng();
        var smooth = 0.5 + 0.5 * Math.sin(t * 0.4 + d * 0.18 + seed * 0.01);
        var val = (0.4 * smooth + 0.6 * v) * intensity;
        var c = viridis(val);
        ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        ctx.fillRect(d * cellW, t * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="transformer_block_dataflow" style="background:#1a1d22;color:#e6e8ea;border-radius:6px;padding:14px;position:relative">' +

        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">One transformer block, tensor by tensor</div>' +
          '<div class="viz-purpose" style="color:#9ba2aa;font-size:12px;flex:1;min-width:280px">' +
            'Scrub through the 11 sub-ops; hover any tensor for its shape; click play to auto-walk.' +
          '</div>' +
          '<label style="font-size:12px;color:#bbb;cursor:pointer;display:inline-flex;align-items:center;gap:6px">' +
            '<input type="checkbox" class="js-residual">' +
            '<span>show residual stream highlight</span>' +
          '</label>' +
        '</header>' +

        // Stages strip
        '<div class="js-stagewrap" style="position:relative">' +
          '<div class="js-stages" style="display:grid;grid-template-columns:repeat(11,1fr);gap:6px;align-items:end;position:relative;z-index:2"></div>' +
          '<svg class="js-residual-svg" width="100%" height="60" preserveAspectRatio="none" ' +
            'style="position:absolute;left:0;right:0;top:-22px;height:60px;pointer-events:none;z-index:3;display:none"></svg>' +
        '</div>' +

        // Controls row
        '<div style="display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;margin-top:14px">' +
          '<button class="js-prev" style="background:#2a2f37;color:#e6e8ea;border:1px solid #3a3f47;border-radius:4px;padding:6px 10px;cursor:pointer">&larr; prev</button>' +
          '<button class="js-play" style="background:#ff8c1a;color:#1a1a1a;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-weight:600">&#9654; play</button>' +
          '<input type="range" class="js-scrub" min="0" max="' + (STAGES.length - 1) + '" value="0" step="1" style="width:100%">' +
          '<button class="js-next" style="background:#2a2f37;color:#e6e8ea;border:1px solid #3a3f47;border-radius:4px;padding:6px 10px;cursor:pointer">next &rarr;</button>' +
        '</div>' +

        // Detail card
        '<div class="js-detail" style="margin-top:10px;padding:10px 12px;background:#22272f;border-left:3px solid #ff8c1a;border-radius:3px;font-size:13px">&nbsp;</div>' +

        // Tooltip
        '<div class="js-tip" style="position:absolute;display:none;background:#000;color:#fff;font-size:11px;padding:5px 8px;' +
          'border-radius:3px;font-family:var(--mono,monospace);pointer-events:none;z-index:10;max-width:240px;line-height:1.45"></div>' +

        '<div style="margin-top:10px;font-size:11px;color:#9ba2aa;font-style:italic;line-height:1.5">' +
          'Activation strips are deterministic but synthetic &mdash; pixel intensities show <em>shape</em>, not real activations. ' +
          'Strip widths track op output dim: QKV is 3&times; wide, MLP-up is 4&times; wide. ' +
          '&pi;<sub>0</sub> backbone (Gemma-2B): width=2048, mlp_dim=16384, depth=18, heads=18, head_dim=256.' +
        '</div>' +

      '</div>';

    var stagesEl = rootEl.querySelector('.js-stages');
    var sHTML = '';
    for (var i = 0; i < STAGES.length; i++) {
      var st = STAGES[i];
      // Wider strips for higher shapeMul.
      var canvasWidth = 64 * st.shapeMul;
      sHTML +=
        '<div class="js-stage" data-stage="' + i + '" style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">' +
          '<canvas class="js-tensor" data-stage="' + i + '" width="' + canvasWidth + '" height="40" ' +
            'style="width:100%;height:34px;display:block;border-radius:2px;image-rendering:pixelated;border:1px solid #3a3f47"></canvas>' +
          '<div class="js-shape" style="font-size:9.5px;color:#7c8590;font-family:var(--mono,monospace)">' + st.shape.replace(/\s+/g, '') + '</div>' +
          '<div class="js-box" style="font-size:10.5px;text-align:center;padding:4px 4px;background:#2a2f37;border:1px solid #3a3f47;border-radius:3px;width:100%;font-family:var(--mono,monospace)">' +
            st.name +
          '</div>' +
        '</div>';
    }
    stagesEl.innerHTML = sHTML;

    // Draw tensor strips (deterministic)
    var canvases = rootEl.querySelectorAll('canvas.js-tensor');
    for (var c = 0; c < canvases.length; c++) {
      drawTensor(canvases[c], 1000 + c * 37, 0.85, STAGES[c].shapeMul);
    }

    var state = { step: 0, residual: false, playing: false, raf: 0, lastT: 0 };

    var detailEl = rootEl.querySelector('.js-detail');
    var scrub = rootEl.querySelector('.js-scrub');
    var tip = rootEl.querySelector('.js-tip');
    var playBtn = rootEl.querySelector('.js-play');
    var residualCheck = rootEl.querySelector('.js-residual');
    var residualSVG = rootEl.querySelector('.js-residual-svg');

    function paint() {
      var stages = rootEl.querySelectorAll('.js-stage');
      for (var i = 0; i < stages.length; i++) {
        var box = stages[i].querySelector('.js-box');
        var canv = stages[i].querySelector('canvas');
        var active = (i === state.step);
        box.style.background = active ? '#3d2a08' : '#2a2f37';
        box.style.borderColor = active ? '#ff8c1a' : '#3a3f47';
        box.style.color = active ? '#ffce8b' : '#e6e8ea';
        box.style.boxShadow = active ? '0 0 0 2px rgba(255,140,26,0.35)' : 'none';
        canv.style.opacity = active ? '1' : '0.55';
        canv.style.borderColor = active ? '#ff8c1a' : '#3a3f47';
      }

      var st = STAGES[state.step];
      detailEl.innerHTML =
        '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="color:#ff8c1a;font-weight:600;font-family:var(--mono,monospace)">[' + (state.step + 1) + '/' + STAGES.length + '] ' + st.name + '</span>' +
          '<span style="color:#9ba2aa;font-family:var(--mono,monospace)">' + st.shape.replace('D', 'd_model') + '</span>' +
          '<span style="color:#cdd2d8">' + st.note + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#bcc2c8;line-height:1.5">' + st.detail + '</div>';
      scrub.value = String(state.step);

      drawResidualOverlay();
    }

    function drawResidualOverlay() {
      if (!state.residual) {
        residualSVG.style.display = 'none';
        residualSVG.innerHTML = '';
        return;
      }
      // Compute the x positions of stage box centers in container coords.
      var wrap = rootEl.querySelector('.js-stagewrap');
      var stages = rootEl.querySelectorAll('.js-stage');
      var rects = [];
      var wrapRect = wrap.getBoundingClientRect();
      for (var i = 0; i < stages.length; i++) {
        var r = stages[i].getBoundingClientRect();
        rects.push({ cx: r.left + r.width / 2 - wrapRect.left, top: r.top - wrapRect.top });
      }
      // residual stream visits stages: input(0) → add1(5) → add2(10).
      var visitIdx = [0, 5, 10];
      var pts = visitIdx.map(function (i) { return rects[i]; });
      // Width tracking
      var W = wrap.clientWidth || 800;
      residualSVG.setAttribute('viewBox', '0 0 ' + W + ' 60');
      residualSVG.style.width = W + 'px';
      residualSVG.style.display = 'block';

      var pathD = 'M ' + pts[0].cx + ' 50';
      // Curve up over the top, dipping into each visit point.
      for (var k = 1; k < pts.length; k++) {
        var prev = pts[k - 1], cur = pts[k];
        var midX = (prev.cx + cur.cx) / 2;
        pathD += ' Q ' + midX + ' 0, ' + cur.cx + ' 50';
      }
      residualSVG.innerHTML =
        '<defs>' +
          '<marker id="resArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
            '<path d="M 0 0 L 10 5 L 0 10 Z" fill="#c0392b"/>' +
          '</marker>' +
        '</defs>' +
        '<path d="' + pathD + '" stroke="#c0392b" stroke-width="2.4" fill="none" stroke-dasharray="6,4" marker-end="url(#resArrow)" />' +
        '<text x="' + ((pts[0].cx + pts[2].cx) / 2) + '" y="14" fill="#c0392b" ' +
          'font-family="ui-monospace, monospace" font-size="11" text-anchor="middle">residual stream (skip path)</text>';
    }

    function step(delta) {
      state.step = (state.step + delta + STAGES.length) % STAGES.length;
      paint();
    }

    function playLoop(now) {
      if (!state.playing) return;
      if (!state.lastT) state.lastT = now;
      var dt = now - state.lastT;
      if (dt > 700) {
        state.lastT = now;
        var next = state.step + 1;
        if (next >= STAGES.length) {
          state.playing = false;
          playBtn.innerHTML = '&#9654; play';
          state.step = STAGES.length - 1;
          paint();
          return;
        }
        state.step = next;
        paint();
      }
      state.raf = requestAnimationFrame(playLoop);
    }

    scrub.addEventListener('input', function (ev) {
      state.step = parseInt(ev.target.value, 10);
      paint();
    });
    rootEl.querySelector('.js-prev').addEventListener('click', function () {
      stopPlay(); step(-1);
    });
    rootEl.querySelector('.js-next').addEventListener('click', function () {
      stopPlay(); step(1);
    });
    playBtn.addEventListener('click', function () {
      if (state.playing) { stopPlay(); return; }
      // restart from 0 if at end
      if (state.step >= STAGES.length - 1) state.step = 0;
      state.playing = true;
      state.lastT = 0;
      playBtn.innerHTML = '&#10073;&#10073; pause';
      state.raf = requestAnimationFrame(playLoop);
    });
    function stopPlay() {
      state.playing = false;
      playBtn.innerHTML = '&#9654; play';
      cancelAnimationFrame(state.raf);
    }

    residualCheck.addEventListener('change', function (ev) {
      state.residual = ev.target.checked;
      paint();
    });
    window.addEventListener('resize', function () { drawResidualOverlay(); });

    // Hover tooltips on tensor strips
    var stages = rootEl.querySelectorAll('.js-stage');
    for (var s2 = 0; s2 < stages.length; s2++) {
      stages[s2].addEventListener('mousemove', function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-stage'), 10);
        var st2 = STAGES[idx];
        tip.innerHTML =
          '<div style="font-weight:600">' + st2.name + '</div>' +
          '<div style="opacity:0.85;margin-top:2px">' + st2.shape.replace('D', 'd_model') + '</div>' +
          '<div style="opacity:0.7;margin-top:3px;font-family:inherit">' + st2.note + '</div>';
        tip.style.display = 'block';
        var rect = rootEl.getBoundingClientRect();
        var leftPx = ev.clientX - rect.left + 12;
        // keep tooltip in-bounds (roughly)
        if (leftPx > rect.width - 240) leftPx = rect.width - 250;
        tip.style.left = leftPx + 'px';
        tip.style.top = (ev.clientY - rect.top + 12) + 'px';
      });
      stages[s2].addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      stages[s2].addEventListener('click', function (ev) {
        stopPlay();
        state.step = parseInt(ev.currentTarget.getAttribute('data-stage'), 10);
        paint();
      });
    }

    // Reduced motion: don't auto-play. Default to input frame.
    if (typeof SharedPi !== 'undefined' && SharedPi.reducedMotion && SharedPi.reducedMotion()) {
      state.step = 0;
      playBtn.disabled = true;
      playBtn.style.opacity = '0.5';
      playBtn.title = 'animation disabled by prefers-reduced-motion';
    }

    // citation pill (note: dark theme)
    if (typeof SharedPi !== 'undefined' && SharedPi.citationPill) {
      SharedPi.citationPill(rootEl, 'Touvron et al. 2023 (LLaMA) — pre-norm decoder', { color: '#9ba2aa', bg: 'rgba(0,0,0,0.35)' });
    }

    paint();
  }

  window.Viz_transformer_block_dataflow = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-transformer_block_dataflow');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
