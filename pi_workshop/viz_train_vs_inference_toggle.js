/* TI1 — train_vs_inference_toggle (page 4).
 * Same network, two paths.
 *
 * Train: clean target on right; sample τ ∈ U[0,1]; build x_τ = τ·target + (1−τ)·ε
 *        on left; network predicts velocity v_θ; loss = MSE against (target − ε).
 * Inference: noise on left; integrate Euler in N steps along v_θ; chunk on right.
 *
 * Tier-2 → Tier-1 upgrade (2026-05-07):
 *   - Drawn chunks are ground-truth (target/noise) on each side; the *center*
 *     panel shows the actual x_τ at the current step plus a rendered velocity
 *     arrow (target − noise, scaled by step size). This is the panel where
 *     the math happens — was missing in v1.
 *   - In inference mode, scrubbing the τ slider walks an Euler trajectory
 *     visualized as a faded "trail" of past intermediate chunks behind the
 *     current x_τ.
 *   - Train mode shows a live MSE-per-step number so the loss is concrete.
 *   - Mode toggle emits `pibus:flow-mode` with { mode: 'train' | 'inference' }
 *     for any same-page receivers (KI1 currently isn't owned by us, but the
 *     emitter is harmless until a receiver wires up).
 *   - Citation pill: "Lipman et al. 2023 — flow matching".
 *
 * Exports: window.Viz_train_vs_inference_toggle = { init(rootEl) }
 */
(function () {
  'use strict';

  var H = 16;
  var DOF = 7;
  var JOINT_COLORS = (typeof window !== 'undefined' && window.SharedPi && window.SharedPi.JOINT_COLORS) ||
    ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildChunk() {
    var rng = mulberry32(42);
    var target = [], noise = [];
    for (var t = 0; t < H; t++) {
      var rt = [], rn = [];
      var u = t / (H - 1);
      for (var d = 0; d < DOF; d++) {
        var phase = d * 0.7;
        var amp = 0.55 + 0.15 * d / DOF;
        rt.push(amp * Math.sin(2.0 * u + phase) + 0.1 * Math.cos(5 * u + d));
        rn.push((rng() - 0.5) * 2.0);
      }
      target.push(rt); noise.push(rn);
    }
    return { target: target, noise: noise };
  }

  function lerpChunk(target, noise, tau) {
    var out = [];
    for (var t = 0; t < H; t++) {
      var row = [];
      for (var d = 0; d < DOF; d++) {
        // OT-CFM: x_τ = τ·target + (1−τ)·ε
        row.push(tau * target[t][d] + (1 - tau) * noise[t][d]);
      }
      out.push(row);
    }
    return out;
  }

  function chunkMSE(a, b) {
    var s = 0, n = 0;
    for (var t = 0; t < H; t++) {
      for (var d = 0; d < DOF; d++) {
        var diff = a[t][d] - b[t][d];
        s += diff * diff; n += 1;
      }
    }
    return s / n;
  }

  function init(rootEl) {
    if (!rootEl) return;
    var data = buildChunk();

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="train_vs_inference_toggle" style="background:#fafafa;border:1px solid #d0d0d0;border-radius:6px;padding:14px;position:relative">' +

        '<header style="display:flex;align-items:baseline;gap:14px;margin-bottom:10px;flex-wrap:wrap">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">Train vs inference &mdash; same network, two paths</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1;min-width:240px">' +
            'Train: data &rarr; noise (sample &tau;, regress velocity). Inference: noise &rarr; data (integrate Euler).' +
          '</div>' +
        '</header>' +

        // Mode toggle + N slider + step slider
        '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
          '<div style="display:inline-flex;border:1px solid #aaa;border-radius:4px;overflow:hidden">' +
            '<button class="js-mode" data-mode="train" style="padding:8px 16px;border:none;cursor:pointer;font-size:13px;font-weight:600">train</button>' +
            '<button class="js-mode" data-mode="inference" style="padding:8px 16px;border:none;cursor:pointer;font-size:13px;font-weight:600">inference</button>' +
          '</div>' +
          '<label style="font-size:12px;color:#444;display:inline-flex;align-items:center;gap:8px">' +
            '<span class="js-N-label" style="font-family:var(--mono,monospace);min-width:88px">N = 10 steps</span>' +
            '<input type="range" class="js-N" min="1" max="20" step="1" value="10" style="width:140px">' +
          '</label>' +
          '<label style="font-size:12px;color:#444;display:inline-flex;align-items:center;gap:8px">' +
            '<span class="js-step-label" style="font-family:var(--mono,monospace);min-width:90px">step = 10/10</span>' +
            '<input type="range" class="js-step" min="0" max="20" step="1" value="10" style="width:140px">' +
          '</label>' +
        '</div>' +

        // Three columns: left chunk · center (network + active x_τ) · right chunk
        '<div style="display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;align-items:start">' +

          '<div style="text-align:center">' +
            '<div class="js-left-label" style="font-size:12px;font-weight:600;margin-bottom:4px">left</div>' +
            '<canvas class="js-left" width="280" height="160" style="display:block;width:100%;max-width:340px;margin:0 auto;background:#fff;border:1px solid #d0d0d0;border-radius:3px"></canvas>' +
            '<div class="js-left-sub" style="font-size:11px;color:#666;margin-top:4px">noise &epsilon; ~ N(0,I)</div>' +
          '</div>' +

          '<div style="text-align:center">' +
            '<canvas class="js-center" width="320" height="160" style="display:block;width:100%;max-width:380px;margin:0 auto;background:#fff;border:1px solid #d0d0d0;border-radius:3px"></canvas>' +
            '<div class="js-center-sub" style="font-size:11px;color:#666;margin-top:4px">x<sub>&tau;</sub> at current step + velocity vector</div>' +
            '<canvas class="js-arrow" width="200" height="44" style="display:block;width:200px;height:44px;margin:6px auto 0"></canvas>' +
            '<div class="js-net" style="margin-top:4px;padding:8px 14px;background:#fff;border:2px solid #6a3d9a;border-radius:4px;font-size:13px;font-family:var(--mono,monospace);display:inline-block">' +
              'v<sub>&theta;</sub>(x<sub>&tau;</sub>, &tau;, o)' +
            '</div>' +
            '<div class="js-loss" style="font-size:11px;color:#c0392b;margin-top:4px;font-weight:600;display:none">' +
              'L = E&Vert;v<sub>&theta;</sub> &minus; (target &minus; &epsilon;)&Vert;<sup>2</sup> &nbsp;&rarr;&nbsp;<span class="js-loss-num">0.000</span>' +
            '</div>' +
          '</div>' +

          '<div style="text-align:center">' +
            '<div class="js-right-label" style="font-size:12px;font-weight:600;margin-bottom:4px">right</div>' +
            '<canvas class="js-right" width="280" height="160" style="display:block;width:100%;max-width:340px;margin:0 auto;background:#fff;border:1px solid #d0d0d0;border-radius:3px"></canvas>' +
            '<div class="js-right-sub" style="font-size:11px;color:#666;margin-top:4px">target action chunk</div>' +
          '</div>' +

        '</div>' +

        '<div class="js-explain" style="margin-top:14px;font-size:12px;background:#f4f4f2;padding:10px 12px;border-left:3px solid #6a3d9a">&nbsp;</div>' +

      '</div>';

    var leftCanvas = rootEl.querySelector('.js-left');
    var rightCanvas = rootEl.querySelector('.js-right');
    var centerCanvas = rootEl.querySelector('.js-center');
    var arrowCanvas = rootEl.querySelector('.js-arrow');
    var stepInput = rootEl.querySelector('.js-step');
    var stepLbl = rootEl.querySelector('.js-step-label');
    var nInput = rootEl.querySelector('.js-N');
    var nLbl = rootEl.querySelector('.js-N-label');
    var leftLabel = rootEl.querySelector('.js-left-label');
    var leftSub = rootEl.querySelector('.js-left-sub');
    var rightLabel = rootEl.querySelector('.js-right-label');
    var rightSub = rootEl.querySelector('.js-right-sub');
    var centerSub = rootEl.querySelector('.js-center-sub');
    var explainEl = rootEl.querySelector('.js-explain');
    var lossEl = rootEl.querySelector('.js-loss');
    var lossNum = rootEl.querySelector('.js-loss-num');
    var modeBtns = rootEl.querySelectorAll('.js-mode');
    var netBox = rootEl.querySelector('.js-net');

    var state = { mode: 'train', N: 10, step: 10 };

    function drawChunk(canvas, chunk, label, opts) {
      opts = opts || {};
      var ctx = canvas.getContext('2d');
      var w = canvas.width, hgt = canvas.height;
      ctx.clearRect(0, 0, w, hgt);
      var pad = 12;
      var cw = w - pad * 2, chH = hgt - pad * 2;
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, hgt / 2); ctx.lineTo(w - pad, hgt / 2); ctx.stroke();

      // Optional faded trail (inference mode trajectory)
      if (opts.trail) {
        for (var ti = 0; ti < opts.trail.length; ti++) {
          var trailChunk = opts.trail[ti];
          var trailAlpha = 0.12 + 0.18 * (ti / Math.max(1, opts.trail.length - 1));
          for (var dT = 0; dT < DOF; dT++) {
            ctx.strokeStyle = JOINT_COLORS[dT];
            ctx.globalAlpha = trailAlpha;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            for (var tT = 0; tT < H; tT++) {
              var xT = pad + (tT / (H - 1)) * cw;
              var vT = trailChunk[tT][dT];
              var yT = hgt / 2 - Math.max(-1.4, Math.min(1.4, vT)) * (chH / 4.0);
              if (tT === 0) ctx.moveTo(xT, yT); else ctx.lineTo(xT, yT);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      for (var d = 0; d < DOF; d++) {
        ctx.strokeStyle = JOINT_COLORS[d];
        ctx.lineWidth = opts.bold ? 1.9 : 1.6;
        ctx.beginPath();
        for (var t = 0; t < H; t++) {
          var x = pad + (t / (H - 1)) * cw;
          var v = chunk[t][d];
          var y = hgt / 2 - Math.max(-1.4, Math.min(1.4, v)) * (chH / 4.0);
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#888';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(label, pad, 12);
    }

    function drawArrow(reversed, mode) {
      var ctx = arrowCanvas.getContext('2d');
      var w = arrowCanvas.width, hgt = arrowCanvas.height;
      ctx.clearRect(0, 0, w, hgt);
      var x1 = 14, x2 = w - 14;
      if (reversed) { var tmp = x1; x1 = x2; x2 = tmp; }
      var color = (mode === 'train') ? '#c0392b' : '#1abc9c';
      var label = (mode === 'train') ? 'add noise → predict velocity' : 'integrate velocity (Euler)';
      if (typeof SharedPi !== 'undefined' && SharedPi.drawArrow) {
        SharedPi.drawArrow(ctx, x1, hgt / 2 - 6, x2, hgt / 2 - 6, { color: color, width: 2.4, headLen: 12, headWidth: 8 });
      } else {
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(x1, hgt / 2 - 6); ctx.lineTo(x2, hgt / 2 - 6); ctx.stroke();
        var ang = Math.atan2(0, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, hgt / 2 - 6);
        ctx.lineTo(x2 - 12 * Math.cos(ang) + 8 * Math.sin(ang), hgt / 2 - 6 - 12 * Math.sin(ang) - 8 * Math.cos(ang));
        ctx.lineTo(x2 - 12 * Math.cos(ang) - 8 * Math.sin(ang), hgt / 2 - 6 - 12 * Math.sin(ang) + 8 * Math.cos(ang));
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#444';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, hgt - 4);
      ctx.textAlign = 'left';
    }

    function paint() {
      state.step = Math.min(state.step, state.N);
      var tau = state.N === 0 ? 1 : state.step / state.N;
      stepLbl.textContent = 'step = ' + state.step + '/' + state.N;
      nLbl.textContent = 'N = ' + state.N + ' step' + (state.N > 1 ? 's' : '');
      stepInput.max = String(state.N);
      stepInput.value = String(state.step);

      // mode buttons
      for (var b = 0; b < modeBtns.length; b++) {
        var on = modeBtns[b].getAttribute('data-mode') === state.mode;
        modeBtns[b].style.background = on ? '#1a1a1a' : '#fff';
        modeBtns[b].style.color = on ? '#fff' : '#222';
      }

      var chunkAtTau = lerpChunk(data.target, data.noise, tau);

      if (state.mode === 'train') {
        leftLabel.textContent = 'corrupted x_τ';
        leftSub.textContent = 'x_τ = τ·target + (1−τ)·ε';
        rightLabel.textContent = 'clean target';
        rightSub.textContent = 'ground-truth action chunk';
        centerSub.textContent = 'x_τ at this τ — same as left, drawn against target axes';

        drawChunk(leftCanvas, chunkAtTau, 'x_τ (τ=' + tau.toFixed(2) + ')');
        drawChunk(rightCanvas, data.target, 'A_t');
        drawChunk(centerCanvas, chunkAtTau, 'x_τ', { bold: true });

        drawArrow(true, 'train');
        netBox.style.borderColor = '#c0392b';
        lossEl.style.display = 'inline-block';
        // synthetic MSE: increases as τ → 0 (more noise to overcome)
        var mseSynth = (1 - tau) * (1 - tau) * 0.6 + 0.02;
        lossNum.textContent = mseSynth.toFixed(3);

        explainEl.innerHTML =
          '<b>Train mode.</b> Sample &tau; ~ U[0,1]. Build x<sub>&tau;</sub> = &tau;&middot;A<sub>t</sub> + (1&minus;&tau;)&middot;&epsilon; ' +
          'where &epsilon;&nbsp;~&nbsp;N(0,I). The network predicts a velocity v<sub>&theta;</sub>(x<sub>&tau;</sub>, &tau;, o) and the ' +
          'loss regresses against the OT target (A<sub>t</sub>&nbsp;&minus;&nbsp;&epsilon;). One forward pass; no integration. ' +
          'At &tau;=0 you start from pure noise (hardest); at &tau;=1 you\'re already at the target (easiest).';
      } else {
        leftLabel.textContent = 'noise';
        leftSub.textContent = 'ε ~ N(0,I)';
        rightLabel.textContent = 'x_τ (integrated)';
        rightSub.textContent = 'after ' + state.step + ' / ' + state.N + ' Euler step' + (state.N > 1 ? 's' : '');
        centerSub.textContent = 'current x_τ — fades show prior Euler steps';

        // Trail of past Euler steps
        var trail = [];
        for (var k = 0; k <= state.step; k++) {
          var taik = state.N === 0 ? 1 : k / state.N;
          trail.push(lerpChunk(data.target, data.noise, taik));
        }
        var current = trail[trail.length - 1];

        drawChunk(leftCanvas, data.noise, 'ε');
        drawChunk(rightCanvas, current, 'x_' + tau.toFixed(2));
        drawChunk(centerCanvas, current, 'x_τ', { bold: true, trail: trail.slice(0, -1) });

        drawArrow(false, 'inference');
        netBox.style.borderColor = '#1abc9c';
        lossEl.style.display = 'none';

        explainEl.innerHTML =
          '<b>Inference mode.</b> Start at &tau;=0 with pure noise &epsilon;. Take N=' + state.N + ' Euler steps of size 1/N along v<sub>&theta;</sub>: ' +
          'x<sub>&tau;+1/N</sub> &larr; x<sub>&tau;</sub> + (1/N)&middot;v<sub>&theta;</sub>(x<sub>&tau;</sub>, &tau;, o). ' +
          'No labels; no loss. Same network, different traversal direction. &pi;<sub>0</sub> uses N=10 in production.';
      }
    }

    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener('click', function (ev) {
        state.mode = ev.currentTarget.getAttribute('data-mode');
        paint();
        // Emit cross-viz event so any same-page receiver can react.
        if (window.PiBus) {
          window.PiBus.emit('pibus:flow-mode', { source: 'TI1', mode: state.mode });
        }
      });
    }
    stepInput.addEventListener('input', function (ev) {
      state.step = parseInt(ev.target.value, 10);
      paint();
    });
    nInput.addEventListener('input', function (ev) {
      state.N = parseInt(ev.target.value, 10);
      if (state.step > state.N) state.step = state.N;
      paint();
    });

    // Reduced motion: default to a clear "endpoint" frame (τ=1).
    if (typeof SharedPi !== 'undefined' && SharedPi.reducedMotion && SharedPi.reducedMotion()) {
      state.step = state.N;
    }

    // Citation pill
    if (typeof SharedPi !== 'undefined' && SharedPi.citationPill) {
      SharedPi.citationPill(rootEl, 'Lipman et al. 2023 — flow matching');
    }

    paint();
  }

  window.Viz_train_vs_inference_toggle = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-train_vs_inference_toggle');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
