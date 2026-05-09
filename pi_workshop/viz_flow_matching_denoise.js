/* F1 — Flow-Matching Denoise (page 2 centerpiece, dark theme).
 *
 * Three stacked panels on a dark-theme Canvas surface:
 *   TOP   — 7 stacked time-series traces (one per joint), x_τ at current step.
 *   MID   — 2-D vector-field projection with a moving sample dot.
 *   BOTTOM— τ ∈ [0,1] step bar with scrubber.
 *
 * Synthetic dynamics (LABELED schematic — illustrative of OT-CFM):
 *   x_τ = (1-τ)·noise + τ·target + small_curl(τ)
 *   f(x) = (target - x) + swirl(x)
 *
 * Sliders: N steps ∈ [1, 20], σ noise. Play / pause / scrub.
 *
 * Respects prefers-reduced-motion: starts paused at the most informative frame (τ=0.5).
 *
 * Exports: window.Viz_flow_matching_denoise = { init(rootEl) }
 */
(function () {
  'use strict';

  var COLORS = {
    bg:          '#0f1117',
    panelBg:     '#161922',
    grid:        'rgba(255,255,255,0.05)',
    gridStrong:  'rgba(255,255,255,0.10)',
    fg:          '#e6e6e6',
    muted:       '#8a93a6',
    flow:        '#1abc9c',
    arrow:       '#b07c2c',
    arrowHi:     '#f5d516',
    noise:       '#888',
    clean:       '#7ee787',
    accent:      '#ff8c1a'
  };

  // Refactor 2026-05-07: use shared palette; fall back to literal if shared.js missing.
  var JOINT_COLORS = (typeof window !== 'undefined' && window.SharedPi && window.SharedPi.JOINT_COLORS) || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3',
    '#ff7f00', '#a65628', '#f781bf'
  ];

  var H_CHUNK = 16;        // 16 timesteps per chunk
  var D = 7;               // 7 DoF
  var SEED = 42;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Build one fixed clean target chunk (smooth multi-sinusoid) and one noise sample. */
  function buildEndpoints() {
    var rng = mulberry32(SEED);
    var target = [];
    var noise  = [];
    for (var t = 0; t < H_CHUNK; t++) {
      var trow = new Array(D);
      var nrow = new Array(D);
      for (var d = 0; d < D; d++) {
        var phase = d * 0.7 + 0.4;
        var freq  = 0.6 + d * 0.18;
        var amp   = 0.55 + 0.12 * Math.sin(d);
        var bias  = 0.12 * Math.sin(d * 1.3);
        trow[d] = bias + amp * Math.sin(freq * (t / H_CHUNK) * 2 * Math.PI + phase);
        nrow[d] = gauss(rng);
      }
      target.push(trow);
      noise.push(nrow);
    }
    return { target: target, noise: noise };
  }

  /** Curl term — a small swirl that depends on tau. */
  function curl(tau, t, d) {
    var s = Math.sin(2 * Math.PI * (t / H_CHUNK + 0.13 * d));
    var c = Math.cos(2 * Math.PI * (t / H_CHUNK + 0.21 * d));
    var k = 0.18 * tau * (1 - tau);
    return k * (s * 0.6 + c * 0.4);
  }

  /** x_tau according to the schematic OT-CFM-style interpolation + curl. */
  function xAtTau(noise, target, sigma, tau) {
    var out = [];
    for (var t = 0; t < H_CHUNK; t++) {
      var row = new Array(D);
      for (var d = 0; d < D; d++) {
        row[d] = (1 - tau) * sigma * noise[t][d] + tau * target[t][d] + curl(tau, t, d);
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Project the H×D chunk to a single 2D point for the vector field panel.
   * Use mean over time for two orthogonal "PCA-ish" directions:
   *   u = (1, 0, -1, 0, 1, 0, -1) / sqrt(4)  (alternating)
   *   v = (1, 1, 1, -1, -1, -1, 0) / sqrt(6) (low-vs-high split)
   * Both fixed, deterministic, schematic.
   */
  var BASIS_U = [ 1, 0, -1, 0, 1, 0, -1];
  var BASIS_V = [ 1, 1,  1, -1, -1, -1, 0];

  function projectChunk(chunk) {
    var u = 0, v = 0;
    for (var t = 0; t < H_CHUNK; t++) {
      for (var d = 0; d < D; d++) {
        u += chunk[t][d] * BASIS_U[d];
        v += chunk[t][d] * BASIS_V[d];
      }
    }
    u /= H_CHUNK * 2;
    v /= H_CHUNK * 2;
    return [u, v];
  }

  function initFlow(rootEl) {
    rootEl.innerHTML = '';
    var prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Header
    var header = document.createElement('div');
    header.className = 'viz-header';
    header.innerHTML =
      '<h3 class="viz-title">Flow matching: from noise to action chunk</h3>' +
      '<p class="viz-purpose">' +
        'A Gaussian sample is integrated along a learned vector field <code>f<sub>θ</sub>(x<sub>τ</sub>, τ)</code> over N small ODE steps, producing a clean action chunk at τ=1.<br>' +
        '<span style="color:#a76;font-style:italic">Dynamics here are <b>schematic — illustrative of OT-CFM</b>, not extracted from π₀ weights. The <em>shape</em> is correct: linear interpolation is exactly the rectified-flow / OT-CFM training target.</span>' +
      '</p>';
    rootEl.appendChild(header);

    // ---- Controls
    var controls = document.createElement('div');
    controls.style.cssText =
      'display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:8px 0 12px;font-size:12px;color:#444';
    controls.innerHTML =
      '<button class="js-play" style="padding:6px 12px;border:1px solid #555;background:#1a1d27;color:#e6e6e6;border-radius:4px;cursor:pointer;font:600 12px -apple-system, sans-serif">▶ play</button>' +
      '<label style="display:flex;align-items:center;gap:6px">' +
        '<span>N steps</span>' +
        '<input type="range" class="js-n" min="1" max="20" step="1" value="10" style="width:140px">' +
        '<span class="js-n-val" style="font-family:JetBrains Mono,SF Mono,monospace;width:24px;text-align:right">10</span>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:6px">' +
        '<span>σ noise</span>' +
        '<input type="range" class="js-sigma" min="0.2" max="2.0" step="0.05" value="1.0" style="width:140px">' +
        '<span class="js-sigma-val" style="font-family:JetBrains Mono,SF Mono,monospace;width:32px;text-align:right">1.00</span>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:6px">' +
        '<input type="checkbox" class="js-loop" checked>' +
        '<span>loop</span>' +
      '</label>' +
      '<span style="color:#888;font-style:italic;margin-left:auto">' +
        (prefersReduced ? 'reduced motion: paused at τ=0.5' : '') +
      '</span>';
    rootEl.appendChild(controls);

    // ---- Body (dark canvas)
    var body = document.createElement('div');
    body.className = 'viz-body';
    body.style.cssText =
      'position:relative;background:' + COLORS.bg + ';border:1px solid #20242e;border-radius:6px;padding:0;overflow:hidden;';
    rootEl.appendChild(body);

    var canvas = document.createElement('canvas');
    canvas.width = 1140;
    canvas.height = 640;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '640px';
    body.appendChild(canvas);

    // ---- Citation pill
    var cite = document.createElement('div');
    cite.style.cssText =
      'position:absolute;right:10px;bottom:6px;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px;color:#6f7689';
    cite.textContent = 'π₀ paper · OT-CFM (Lipman et al. 2023)';
    body.appendChild(cite);

    // ---- Endpoints
    var endpoints = buildEndpoints();
    var TARGET = endpoints.target;
    var NOISE  = endpoints.noise;

    // Precompute target projection for the vector field
    var targetProj = projectChunk(TARGET);

    // ---- State
    var state = {
      tau: prefersReduced ? 0.5 : 0.0,
      N: 10,
      sigma: 1.0,
      playing: false,
      loop: true,
      lastFrame: 0,
      // Build trail of past 2D dots
      trail: []
    };

    // ---- Compute discretized step from N
    function tauForStep(s) { return state.N <= 1 ? 1 : s / state.N; }

    // ---- Draw
    function draw() {
      var ctx = canvas.getContext('2d');
      var W = canvas.width, H = canvas.height;
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, W, H);

      var pad = 14;
      // Layout:
      // top traces panel: (0,0) → (W, 240)
      // mid vec field panel: (0, 240) → (W*0.55, 540)
      // mid right "explanation/legend" panel: (W*0.55, 240) → (W, 540)
      // bottom step bar: (0, 560) → (W, 620)

      drawTracesPanel(ctx, pad, pad, W - 2 * pad, 220);
      drawVectorFieldPanel(ctx, pad, 250, W * 0.58 - 2 * pad, 290);
      drawSidePanel(ctx, W * 0.58, 250, W * 0.42 - pad, 290);
      drawStepBar(ctx, pad, 562, W - 2 * pad, 60);
    }

    function drawPanelBg(ctx, x, y, w, h, title) {
      ctx.fillStyle = COLORS.panelBg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#262a36';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (title) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = '11px JetBrains Mono, SF Mono, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, x + 10, y + 8);
      }
    }

    function drawTracesPanel(ctx, x, y, w, h) {
      drawPanelBg(ctx, x, y, w, h, 'x_τ — action chunk over H = 16 timesteps  ·  one trace per joint');

      var padL = 60, padR = 100, padT = 26, padB = 18;
      var plotX = x + padL, plotY = y + padT;
      var plotW = w - padL - padR;
      var plotH = h - padT - padB;

      // y range
      var Ymin = -2.2, Ymax = 2.2;

      // grid
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gi = 0; gi <= 4; gi++) {
        var yy = plotY + (gi / 4) * plotH;
        ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy);
      }
      ctx.stroke();

      // axes
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      // y-tick labels
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var li = 0; li <= 4; li++) {
        var v = Ymin + (Ymax - Ymin) * (1 - li / 4);
        var yL = plotY + (li / 4) * plotH;
        ctx.fillText(v.toFixed(1), plotX - 6, yL);
      }
      // x-tick labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var ti = 0; ti < H_CHUNK; ti += 4) {
        var xT = plotX + (ti / (H_CHUNK - 1)) * plotW;
        ctx.fillText(String(ti), xT, plotY + plotH + 4);
      }

      // Compute x_τ
      var x_tau = xAtTau(NOISE, TARGET, state.sigma, state.tau);

      function xMap(t)  { return plotX + (t / (H_CHUNK - 1)) * plotW; }
      function yMap(v)  { return plotY + plotH - ((v - Ymin) / (Ymax - Ymin)) * plotH; }

      // Draw target as faint dashed lines (the "destination")
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (var d = 0; d < D; d++) {
        ctx.strokeStyle = JOINT_COLORS[d];
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        for (var t = 0; t < H_CHUNK; t++) {
          var px = xMap(t), py = yMap(TARGET[t][d]);
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Draw current x_τ
      ctx.lineWidth = 1.6;
      for (var d2 = 0; d2 < D; d2++) {
        ctx.strokeStyle = JOINT_COLORS[d2];
        ctx.beginPath();
        for (var t2 = 0; t2 < H_CHUNK; t2++) {
          var pxx = xMap(t2), pyy = yMap(x_tau[t2][d2]);
          if (t2 === 0) ctx.moveTo(pxx, pyy); else ctx.lineTo(pxx, pyy);
        }
        ctx.stroke();
      }

      // Right-side legend
      var legX = plotX + plotW + 16;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (var d3 = 0; d3 < D; d3++) {
        var ly = plotY + 14 + d3 * 16;
        ctx.fillStyle = JOINT_COLORS[d3];
        ctx.fillRect(legX, ly - 4, 14, 8);
        ctx.fillStyle = COLORS.fg;
        ctx.fillText('joint ' + d3, legX + 20, ly);
      }
      // dashed line legend entry
      var dy = plotY + 14 + D * 16 + 8;
      ctx.strokeStyle = '#666';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(legX, dy); ctx.lineTo(legX + 14, dy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText('target (τ=1)', legX + 20, dy);

      // tau readout
      ctx.fillStyle = COLORS.fg;
      ctx.font = 'bold 13px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('τ = ' + state.tau.toFixed(3), x + w - 14, y + 8);
    }

    function drawVectorFieldPanel(ctx, x, y, w, h) {
      drawPanelBg(ctx, x, y, w, h, '2-D projection · vector field f(x) = (target − x) + swirl');

      var padL = 50, padR = 24, padT = 30, padB = 24;
      var pX = x + padL, pY = y + padT;
      var pW = w - padL - padR;
      var pH = h - padT - padB;

      // logical axes range — symmetric around target proj
      var R = 2.5;
      var cx = targetProj[0], cy = targetProj[1];
      var xMin = cx - R, xMax = cx + R;
      var yMin = cy - R, yMax = cy + R;

      // grid
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (var gi = 0; gi <= 8; gi++) {
        var px = pX + (gi / 8) * pW;
        var py = pY + (gi / 8) * pH;
        ctx.beginPath(); ctx.moveTo(px, pY); ctx.lineTo(px, pY + pH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pX, py); ctx.lineTo(pX + pW, py); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.strokeRect(pX + 0.5, pY + 0.5, pW - 1, pH - 1);

      function xMap(u) { return pX + (u - xMin) / (xMax - xMin) * pW; }
      function yMap(v) { return pY + pH - (v - yMin) / (yMax - yMin) * pH; }

      // Draw vector field: f(x,y) = ((target - x) + swirl, ...)
      // swirl = scale * rotate90(x - center)
      var Nx = 14, Ny = 9;
      var swirl = 0.35;
      ctx.lineWidth = 1;
      for (var ix = 0; ix < Nx; ix++) {
        for (var iy = 0; iy < Ny; iy++) {
          var u = xMin + (ix + 0.5) / Nx * (xMax - xMin);
          var v = yMin + (iy + 0.5) / Ny * (yMax - yMin);
          // pull
          var fx = (cx - u);
          var fy = (cy - v);
          // swirl (around target)
          var rx = u - cx;
          var ry = v - cy;
          fx += -swirl * ry;
          fy +=  swirl * rx;
          // normalize length for arrow
          var mag = Math.sqrt(fx * fx + fy * fy);
          if (mag < 1e-6) continue;
          var s = Math.min(0.45, mag * 0.18);
          var fxN = fx / mag * s;
          var fyN = fy / mag * s;
          var sx = xMap(u), sy = yMap(v);
          var ex = xMap(u + fxN), ey = yMap(v + fyN);
          // color by magnitude
          var alpha = Math.min(0.85, 0.28 + mag * 0.12);
          ctx.strokeStyle = 'rgba(176,124,44,' + alpha.toFixed(2) + ')';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          // arrowhead
          var ang = Math.atan2(ey - sy, ex - sx);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - 4 * Math.cos(ang - 0.4), ey - 4 * Math.sin(ang - 0.4));
          ctx.lineTo(ex - 4 * Math.cos(ang + 0.4), ey - 4 * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fillStyle = 'rgba(176,124,44,' + alpha.toFixed(2) + ')';
          ctx.fill();
        }
      }

      // Trail of past sample positions
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(122,231,135,0.55)';
      ctx.beginPath();
      for (var ti = 0; ti < state.trail.length; ti++) {
        var pp = state.trail[ti];
        var sx2 = xMap(pp[0]), sy2 = yMap(pp[1]);
        if (ti === 0) ctx.moveTo(sx2, sy2); else ctx.lineTo(sx2, sy2);
      }
      ctx.stroke();

      // Target marker
      ctx.fillStyle = COLORS.clean;
      ctx.beginPath();
      ctx.arc(xMap(cx), yMap(cy), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COLORS.fg;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('target (τ=1)', xMap(cx) + 10, yMap(cy) - 8);

      // Current sample dot
      var x_tau = xAtTau(NOISE, TARGET, state.sigma, state.tau);
      var pp2 = projectChunk(x_tau);
      ctx.fillStyle = COLORS.flow;
      ctx.beginPath();
      ctx.arc(xMap(pp2[0]), yMap(pp2[1]), 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COLORS.fg;
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillText('x_τ', xMap(pp2[0]) + 11, yMap(pp2[1]) - 8);

      // axis labels
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('PC1 (schematic)', pX + pW / 2, pY + pH + 4);
      ctx.save();
      ctx.translate(pX - 32, pY + pH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('PC2 (schematic)', 0, 0);
      ctx.restore();
    }

    function drawSidePanel(ctx, x, y, w, h) {
      drawPanelBg(ctx, x, y, w, h, 'what you’re looking at');
      ctx.fillStyle = COLORS.fg;
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      var lines = [
        '• At τ = 0, x_τ ≈ σ · noise (Gaussian).',
        '• At τ = 1, x_τ → target chunk.',
        '• Linear path is exactly the OT-CFM',
        '  training target (Lipman et al. 2023).',
        '• Arrows show the schematic vector',
        '  field f(x) ≈ target − x (+ swirl).',
        '• In real π₀, the field is parametrized',
        '  by the action expert + flow head and',
        '  integrated in N ≈ 10 ODE steps.',
        '',
        'sliders:',
        '  • N — discretization (1 = single step,',
        '         20 = high-res Euler)',
        '  • σ — Gaussian noise scale at τ=0',
        '',
        'numbers below are the τ scrubber:',
        '  drag it / tap the bar to scrub.'
      ];
      var ly = y + 32;
      for (var i = 0; i < lines.length; i++) {
        ctx.fillStyle = lines[i].indexOf('•') === 0 ? COLORS.fg : COLORS.muted;
        ctx.fillText(lines[i], x + 14, ly);
        ly += 16;
      }
    }

    function drawStepBar(ctx, x, y, w, h) {
      drawPanelBg(ctx, x, y, w, h, '');
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('τ', x + 10, y + 8);

      var trackY = y + h / 2;
      var trackX0 = x + 30;
      var trackX1 = x + w - 30;

      // base track
      ctx.strokeStyle = '#2c3142';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trackX0, trackY); ctx.lineTo(trackX1, trackY);
      ctx.stroke();
      // filled portion
      var fillX = trackX0 + (trackX1 - trackX0) * state.tau;
      ctx.strokeStyle = COLORS.flow;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trackX0, trackY); ctx.lineTo(fillX, trackY);
      ctx.stroke();

      // step ticks at integer N positions
      ctx.fillStyle = COLORS.muted;
      for (var s = 0; s <= state.N; s++) {
        var sx = trackX0 + (trackX1 - trackX0) * (s / state.N);
        ctx.fillRect(sx - 0.5, trackY - 5, 1, 10);
      }
      // labels for endpoints
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText('0  (noise)', trackX0, trackY + 10);
      ctx.fillText('1  (clean)', trackX1, trackY + 10);

      // scrubber handle
      ctx.fillStyle = COLORS.flow;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fillX, trackY, 8, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // big tau readout
      ctx.fillStyle = COLORS.fg;
      ctx.font = 'bold 12px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('τ = ' + state.tau.toFixed(3), x + w - 12, y + 8);

      // store track geometry for hit-testing
      drawStepBar._track = { x0: trackX0, x1: trackX1, y: trackY, h: 14 };
    }

    // ---- Animation loop
    function tick(ts) {
      if (!state.playing) return;
      if (!state.lastFrame) state.lastFrame = ts;
      var dt = (ts - state.lastFrame) / 1000;
      state.lastFrame = ts;
      // Advance tau over ~ N * 0.18s per full sweep (slow enough to read)
      var fullDuration = Math.max(1.5, state.N * 0.25);
      state.tau += dt / fullDuration;
      if (state.tau >= 1) {
        if (state.loop) {
          state.tau = 0;
          state.trail = [];
        } else {
          state.tau = 1;
          state.playing = false;
          updatePlayBtn();
        }
      }
      // sample trail every step
      var x_tau = xAtTau(NOISE, TARGET, state.sigma, state.tau);
      var pr = projectChunk(x_tau);
      state.trail.push(pr);
      if (state.trail.length > 80) state.trail.shift();
      draw();
      if (state.playing) requestAnimationFrame(tick);
    }

    function updatePlayBtn() {
      var btn = rootEl.querySelector('.js-play');
      btn.textContent = state.playing ? '❚❚ pause' : '▶ play';
    }

    // ---- Wire up
    var playBtn = rootEl.querySelector('.js-play');
    playBtn.addEventListener('click', function () {
      if (state.tau >= 1) { state.tau = 0; state.trail = []; }
      state.playing = !state.playing;
      state.lastFrame = 0;
      updatePlayBtn();
      if (state.playing) requestAnimationFrame(tick);
    });

    rootEl.querySelector('.js-n').addEventListener('input', function (ev) {
      state.N = parseInt(ev.target.value, 10);
      rootEl.querySelector('.js-n-val').textContent = state.N;
      // snap tau to nearest step
      var step = Math.round(state.tau * state.N);
      state.tau = step / state.N;
      draw();
    });

    rootEl.querySelector('.js-sigma').addEventListener('input', function (ev) {
      state.sigma = parseFloat(ev.target.value);
      rootEl.querySelector('.js-sigma-val').textContent = state.sigma.toFixed(2);
      state.trail = [];
      draw();
    });

    rootEl.querySelector('.js-loop').addEventListener('change', function (ev) {
      state.loop = !!ev.target.checked;
    });

    // Scrubber drag
    var scrubbing = false;
    function scrubFromEvent(ev) {
      var trk = drawStepBar._track;
      if (!trk) return;
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var px = (ev.clientX - rect.left) * scaleX;
      var t = (px - trk.x0) / (trk.x1 - trk.x0);
      t = Math.max(0, Math.min(1, t));
      // snap to step
      var step = Math.round(t * state.N);
      state.tau = step / state.N;
      state.trail = [];
      draw();
    }
    canvas.addEventListener('mousedown', function (ev) {
      var rect = canvas.getBoundingClientRect();
      var scaleY = canvas.height / rect.height;
      var py = (ev.clientY - rect.top) * scaleY;
      // only catch clicks in the step bar region
      if (py >= 562 && py <= 622) {
        scrubbing = true;
        scrubFromEvent(ev);
        ev.preventDefault();
      }
    });
    window.addEventListener('mousemove', function (ev) {
      if (scrubbing) scrubFromEvent(ev);
    });
    window.addEventListener('mouseup', function () { scrubbing = false; });

    // ---- initial draw
    draw();
    if (!prefersReduced) {
      // do not auto-play; present static informative frame at τ=0
    }
  }

  window.Viz_flow_matching_denoise = { init: initFlow };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('viz-flow_matching_denoise');
      if (el) window.Viz_flow_matching_denoise.init(el);
    });
  }
})();
