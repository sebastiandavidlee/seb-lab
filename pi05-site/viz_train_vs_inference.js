/* viz_train_vs_inference.js
   Concept taught: the SAME network v_θ is used in two different control flows.
   Training: pick a random t, mix noise+clean linearly to get x_t, regress
   v_θ(x_t, t) toward (clean − noise). Inference: start at noise, take 10
   small Euler steps, walking t from 0 to 1 in order.
   The asymmetry — random-t vs ordered-t — is the whole picture.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-train-vs-inference');
  if (!canvas) return;
  const W = 900, H = 480;
  const ctx = setupHiDPICanvas(canvas, W, H);

  /* ---------- shared synthetic 1D toy ---------- */
  // We render in a (chunk-step on x, joint value on y) coordinate. To stay
  // legible we show 2 traces: one for "noise sample" structure and one for
  // "clean target" structure. The training panel pulses random t. The
  // inference panel walks t in 10 ordered Euler steps.
  const T_STEPS = 24;
  const D = 3;

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildClean() {
    const out = [];
    for (let t = 0; t < T_STEPS; t++) {
      const u = t / (T_STEPS - 1);
      out.push([
        0.7 * Math.sin(Math.PI * u),
        -0.3 + 0.6 * (1 - Math.cos(Math.PI * u)),
        0.4 * Math.sin(2 * Math.PI * u + 0.4)
      ]);
    }
    return out;
  }
  function buildNoise(seed) {
    const r = rng(seed);
    const out = [];
    for (let t = 0; t < T_STEPS; t++) {
      const row = new Array(D);
      for (let d = 0; d < D; d++) row[d] = gauss(r);
      out.push(row);
    }
    return out;
  }

  const CLEAN = buildClean();
  let trainNoise = buildNoise(42);   // re-rolled each train sample

  /* ---------- state ---------- */
  const state = {
    mode: 'train',  // 'train' or 'infer'
    // training: random t per "iteration"
    trainT: 0.45,
    trainSeed: 42,
    trainCount: 0,
    // inference: which Euler step we are on (0..10)
    inferStep: 0,
    inferTrail: [], // chunks at each step
    inferNoise: buildNoise(7),
    playing: false,
    lastTs: 0
  };

  /* ---------- helpers ---------- */
  function chunkAt(noise, t) {
    const out = [];
    for (let i = 0; i < T_STEPS; i++) {
      const row = new Array(D);
      for (let d = 0; d < D; d++) row[d] = (1 - t) * noise[i][d] + t * CLEAN[i][d];
      out.push(row);
    }
    return out;
  }

  // Inference: Euler step from x with delta along v_θ.
  // We "cheat" and use the true v = clean - noise as the field, since the
  // pedagogical point is the integration rule, not the learned approximation.
  function eulerStep(x, baseNoise, t, delta) {
    const out = [];
    for (let i = 0; i < T_STEPS; i++) {
      const row = new Array(D);
      for (let d = 0; d < D; d++) {
        // velocity at (x_t, t) under our toy field: target - noise (constant
        // per particle along its straight path)
        const v = CLEAN[i][d] - baseNoise[i][d];
        row[d] = x[i][d] + delta * v;
      }
      out.push(row);
    }
    return out;
  }

  /* ---------- layout: two side-by-side panels ---------- */
  const PAD = 16;
  const PANEL_W = (W - PAD * 3) / 2;
  const PANEL_H = H - PAD * 2;
  const LEFT_X = PAD;
  const RIGHT_X = PAD * 2 + PANEL_W;
  const PANEL_Y = PAD;

  function drawPanel(x, y, w, h, title, on) {
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = on ? C.flow : C.rule;
    ctx.lineWidth = on ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = on ? C.ink : C.inkMuted;
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + 12, y + 10);
  }

  function plotChunk(x, y, w, h, chunk, color, dashed) {
    const padL = 8, padR = 8, padT = 12, padB = 12;
    const px = x + padL, py = y + padT;
    const pw = w - padL - padR, ph = h - padT - padB;
    const Ymin = -2.4, Ymax = 2.4;
    function xMap(t) { return px + (t / (T_STEPS - 1)) * pw; }
    function yMap(v) { return py + ph - (v - Ymin) / (Ymax - Ymin) * ph; }

    ctx.lineWidth = 1.4;
    if (dashed) ctx.setLineDash([3, 3]);
    for (let d = 0; d < D; d++) {
      ctx.strokeStyle = color || C.j[d];
      ctx.beginPath();
      for (let t = 0; t < T_STEPS; t++) {
        const xx = xMap(t), yy = yMap(chunk[t][d]);
        if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /* ---------- TRAIN panel ---------- */
  function drawTrainPanel() {
    const x = LEFT_X, y = PANEL_Y, w = PANEL_W, h = PANEL_H;
    drawPanel(x, y, w, h, 'training mode — random t per iteration', state.mode === 'train');

    // 1) Build x_t = (1-t)·ε + t·clean for current trainT
    const xt = chunkAt(trainNoise, state.trainT);

    // Three stacked sub-rows:
    //   ROW A: ε (noise) — small height
    //   ROW B: x_t = (1-t)ε + t·clean
    //   ROW C: clean
    const rowH = (h - 90) / 3;
    const labelW = 80;
    const plotX = x + labelW;
    const plotW = w - labelW - 14;

    // labels on left
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yA = y + 36 + rowH * 0;
    const yB = y + 36 + rowH * 1;
    const yC = y + 36 + rowH * 2;

    plotChunk(plotX, yA, plotW, rowH - 8, trainNoise, C.noise, false);
    ctx.fillText('ε  (noise)', plotX - 6, yA + (rowH - 8) / 2);

    plotChunk(plotX, yB, plotW, rowH - 8, xt, C.flow, false);
    ctx.fillText('x_t', plotX - 6, yB + (rowH - 8) / 2);

    plotChunk(plotX, yC, plotW, rowH - 8, CLEAN, C.data, false);
    ctx.fillText('clean', plotX - 6, yC + (rowH - 8) / 2);

    // a t-axis with the random tick highlighted
    const axisY = y + h - 38;
    const axX0 = plotX, axX1 = plotX + plotW;
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(axX0, axisY); ctx.lineTo(axX1, axisY);
    ctx.stroke();
    // ticks
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [0, 0.25, 0.5, 0.75, 1].forEach((tt) => {
      const xt2 = axX0 + tt * (axX1 - axX0);
      ctx.fillRect(xt2 - 0.5, axisY - 4, 1, 8);
      ctx.fillText(tt.toFixed(2), xt2, axisY + 8);
    });
    // current random t marker
    const xCur = axX0 + state.trainT * (axX1 - axX0);
    ctx.fillStyle = C.flow;
    ctx.beginPath();
    ctx.arc(xCur, axisY, 5, 0, Math.PI * 2);
    ctx.fill();

    // residual bar: ‖v_θ(x_t,t) − (clean − ε)‖²  — but v_θ converges to
    // (clean − ε), so shown bar shrinks with training. We show a
    // pseudo-loss that decays with state.trainCount (capped).
    const lossX = x + 14;
    const lossY = y + h - 18;
    const loss = Math.exp(-state.trainCount * 0.04) * 0.85 + 0.05 + 0.04 * Math.sin(state.trainCount * 0.7);
    const loss01 = clamp(loss, 0, 1);
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MSE on (clean − ε)', lossX, lossY - 12);
    ctx.fillStyle = C.ruleStrong;
    ctx.fillRect(lossX, lossY, 240, 6);
    ctx.fillStyle = C.flow;
    ctx.fillRect(lossX, lossY, 240 * loss01, 6);

    // t readout
    ctx.fillStyle = C.ink;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('t = ' + state.trainT.toFixed(2) + '  iter=' + state.trainCount, x + w - 12, y + 12);
  }

  /* ---------- INFER panel ---------- */
  function drawInferPanel() {
    const x = RIGHT_X, y = PANEL_Y, w = PANEL_W, h = PANEL_H;
    drawPanel(x, y, w, h, 'inference mode — 10 ordered Euler steps', state.mode === 'infer');

    const labelW = 80;
    const plotX = x + labelW;
    const plotW = w - labelW - 14;
    const plotY = y + 38;
    const plotH = h - 80;

    // Plot the trail: each step's chunk in successively bolder color
    const Ymin = -2.4, Ymax = 2.4;
    function xMap(t) { return plotX + (t / (T_STEPS - 1)) * plotW; }
    function yMap(v) { return plotY + plotH - (v - Ymin) / (Ymax - Ymin) * plotH; }

    // background panel
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(plotX, plotY, plotW, plotH);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let g = 0; g <= 4; g++) {
      const yy = plotY + (g / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke();
    }

    // trail of intermediate chunks
    const trail = state.inferTrail;
    for (let s = 0; s < trail.length; s++) {
      const a = (s + 1) / Math.max(trail.length, 1);
      ctx.globalAlpha = 0.18 + 0.7 * a;
      ctx.lineWidth = 1.4;
      for (let d = 0; d < D; d++) {
        ctx.strokeStyle = C.j[d];
        ctx.beginPath();
        for (let t = 0; t < T_STEPS; t++) {
          const xx = xMap(t), yy = yMap(trail[s][t][d]);
          if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // axis label
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('chunk x_t at each Euler step (start → end)', plotX, plotY - 4);

    // step strip below
    const stripY = plotY + plotH + 14;
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const N = 10;
    const stepW = plotW / N;
    for (let i = 0; i < N; i++) {
      const sx = plotX + i * stepW;
      const isPast = i < state.inferStep;
      const isCur  = i === state.inferStep - 1;
      ctx.fillStyle = isCur ? C.flow : (isPast ? C.flow : C.ruleStrong);
      ctx.fillRect(sx + 2, stripY, stepW - 4, 8);
      ctx.fillStyle = C.inkDim;
      ctx.fillText(String(i + 1), sx + stepW / 2, stripY + 12);
    }
    // delta annotation
    ctx.fillStyle = C.inkMuted;
    ctx.textAlign = 'left';
    ctx.fillText('δ = 0.10 · t walks 0 → 1', plotX, stripY + 26);

    // t readout
    const t = state.inferStep / N;
    ctx.fillStyle = C.ink;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('t = ' + t.toFixed(2) + '  step ' + state.inferStep + '/' + N, x + w - 12, y + 12);
  }

  function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    drawTrainPanel();
    drawInferPanel();
  }

  /* ---------- training step / inference step ---------- */
  function trainStep() {
    state.trainSeed = (state.trainSeed + 7) | 0;
    trainNoise = buildNoise(state.trainSeed);
    state.trainT = Math.random();
    state.trainCount += 1;
    draw();
  }
  function inferReset() {
    state.inferStep = 0;
    state.inferTrail = [chunkAt(state.inferNoise, 0)]; // x_0 = noise
    draw();
  }
  function inferOne() {
    if (state.inferStep >= 10) return;
    const x = state.inferTrail[state.inferTrail.length - 1];
    const t = state.inferStep / 10;
    const xn = eulerStep(x, state.inferNoise, t, 0.1);
    state.inferTrail.push(xn);
    state.inferStep += 1;
    draw();
  }

  /* ---------- controls ---------- */
  const trainBtn = document.getElementById('tvi-train');
  const inferBtn = document.getElementById('tvi-infer');
  const stepBtn = document.getElementById('tvi-step');
  const resetBtn = document.getElementById('tvi-reset');
  const playBtn = document.getElementById('tvi-play');

  function setMode(m) {
    state.mode = m;
    if (trainBtn) trainBtn.classList.toggle('active', m === 'train');
    if (inferBtn) inferBtn.classList.toggle('active', m === 'infer');
    if (stepBtn) stepBtn.textContent = (m === 'train') ? 'sample t (train step)' : 'one Euler step';
    draw();
  }
  if (trainBtn) trainBtn.addEventListener('click', () => setMode('train'));
  if (inferBtn) inferBtn.addEventListener('click', () => { setMode('infer'); inferReset(); });
  if (stepBtn) stepBtn.addEventListener('click', () => {
    if (state.mode === 'train') trainStep();
    else inferOne();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (state.mode === 'train') { state.trainCount = 0; draw(); }
    else { inferReset(); }
  });
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.playing) {
        state.playing = false;
        playBtn.textContent = 'auto';
        return;
      }
      state.playing = true;
      playBtn.textContent = 'stop';
      state.lastTs = performance.now();
      requestAnimationFrame(loop);
    });
  }
  function loop(ts) {
    if (!state.playing) return;
    const dt = (ts - state.lastTs);
    if (dt > 350) {
      state.lastTs = ts;
      if (state.mode === 'train') trainStep();
      else {
        if (state.inferStep >= 10) inferReset();
        else inferOne();
      }
    }
    if (state.playing) requestAnimationFrame(loop);
  }

  inferReset();
  setMode('train');
  draw();
})();
