/* viz_action_denoise.js
   Concept taught: the same "flow toward target" picture works in 50×18
   dimensions. Each "point in the cloud" is a full 50-step action chunk;
   denoising it produces a coherent joint trajectory. The reader sees seven
   joint traces start as random spaghetti at t=0 and resolve into a smooth
   reach motion at t=1, with a small arm sketch acting as a visual sanity check.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-action-denoise');
  if (!canvas) return;
  const W = 900, H = 460;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const T_STEPS = 50;
  const D = 7; // we visualize 7 joints (the model uses 18 zero-padded; 7 is "real")

  /* ---------- build a target chunk: a smooth reach motion ---------- */
  function targetChunk() {
    const out = [];
    for (let t = 0; t < T_STEPS; t++) {
      const u = t / (T_STEPS - 1);
      const row = new Array(D);
      // joint 0: shoulder pan, sigmoidal sweep
      row[0] = 0.9 * (1 / (1 + Math.exp(-8 * (u - 0.4))) - 0.5);
      // joint 1: shoulder lift, gentle arc
      row[1] = -0.5 + 0.7 * Math.sin(Math.PI * u);
      // joint 2: elbow, two-phase
      row[2] = 0.6 * Math.sin(Math.PI * u) - 0.3 * Math.sin(2 * Math.PI * u);
      // joint 3: wrist 1, slow tilt
      row[3] = 0.35 * (1 - Math.cos(Math.PI * u));
      // joint 4: wrist 2, low-amp wobble settling
      row[4] = 0.25 * Math.sin(2 * Math.PI * u) * (1 - u * 0.6);
      // joint 5: wrist roll, near-constant
      row[5] = 0.18 + 0.08 * u;
      // joint 6: gripper, opens then closes
      row[6] = u < 0.5 ? -0.7 + 1.6 * u : 0.9 - 1.8 * (u - 0.5);
      out.push(row);
    }
    return out;
  }

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
  function noiseChunk() {
    const r = rng(13);
    const out = [];
    for (let t = 0; t < T_STEPS; t++) {
      const row = new Array(D);
      for (let d = 0; d < D; d++) row[d] = gauss(r);
      out.push(row);
    }
    return out;
  }

  const TARGET = targetChunk();
  const NOISE = noiseChunk();

  function chunkAtTau(t) {
    const out = [];
    for (let i = 0; i < T_STEPS; i++) {
      const row = new Array(D);
      for (let d = 0; d < D; d++) {
        row[d] = (1 - t) * NOISE[i][d] + t * TARGET[i][d];
      }
      out.push(row);
    }
    return out;
  }

  /* ---------- state ---------- */
  const state = { tau: 0.0 };

  /* ---------- panel layout ---------- */
  const PAD = 18;
  const TRACE_W = 580, TRACE_H = H - 2 * PAD;
  const TRACE_X = PAD, TRACE_Y = PAD;
  const ARM_X = TRACE_X + TRACE_W + 22;
  const ARM_Y = PAD;
  const ARM_W = W - ARM_X - PAD;
  const ARM_H = H - 2 * PAD;

  function drawTraces() {
    // panel
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(TRACE_X, TRACE_Y, TRACE_W, TRACE_H);
    ctx.strokeStyle = C.rule;
    ctx.strokeRect(TRACE_X + 0.5, TRACE_Y + 0.5, TRACE_W - 1, TRACE_H - 1);

    const padL = 50, padR = 12, padT = 22, padB = 28;
    const px = TRACE_X + padL, py = TRACE_Y + padT;
    const pw = TRACE_W - padL - padR;
    const ph = TRACE_H - padT - padB;

    const Ymin = -2.4, Ymax = 2.4;

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const yy = py + (g / 4) * ph;
      ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke();
    }

    // axes labels
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = Ymin + (Ymax - Ymin) * (1 - g / 4);
      const yy = py + (g / 4) * ph;
      ctx.fillText(v.toFixed(1), px - 6, yy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let tt = 0; tt < T_STEPS; tt += 10) {
      const xx = px + (tt / (T_STEPS - 1)) * pw;
      ctx.fillText(String(tt), xx, py + ph + 4);
    }
    // axis names
    ctx.fillText('chunk timestep (0 → 50)', px + pw / 2, py + ph + 16);
    ctx.save();
    ctx.translate(TRACE_X + 12, TRACE_Y + TRACE_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('joint value', 0, 0);
    ctx.restore();

    function xMap(t) { return px + (t / (T_STEPS - 1)) * pw; }
    function yMap(v) { return py + ph - (v - Ymin) / (Ymax - Ymin) * ph; }

    // dashed target trace
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 3]);
    for (let d = 0; d < D; d++) {
      ctx.strokeStyle = C.j[d];
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      for (let t = 0; t < T_STEPS; t++) {
        const xx = xMap(t), yy = yMap(TARGET[t][d]);
        if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // current x_t
    const X = chunkAtTau(state.tau);
    ctx.lineWidth = 1.6;
    for (let d = 0; d < D; d++) {
      ctx.strokeStyle = C.j[d];
      ctx.beginPath();
      for (let t = 0; t < T_STEPS; t++) {
        const xx = xMap(t), yy = yMap(X[t][d]);
        if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // tau readout
    ctx.fillStyle = C.ink;
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('t = ' + state.tau.toFixed(2), TRACE_X + TRACE_W - 12, TRACE_Y + 6);

    // title
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('7 joint traces over a 50-step chunk · solid = current x_t · dashed = clean target', TRACE_X + 8, TRACE_Y + 6);
  }

  function drawArm() {
    // panel
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(ARM_X, ARM_Y, ARM_W, ARM_H);
    ctx.strokeStyle = C.rule;
    ctx.strokeRect(ARM_X + 0.5, ARM_Y + 0.5, ARM_W - 1, ARM_H - 1);

    // pick a single timestep to render — the *middle* of the chunk (t=25).
    // The arm shape is a 2D schematic: shoulder → elbow → wrist → gripper.
    const X = chunkAtTau(state.tau);
    const tt = 25;
    const cx = ARM_X + ARM_W / 2;
    const cy = ARM_Y + ARM_H * 0.62;

    // joint angles drawn from the chunk row (radians)
    const a0 = X[tt][0] * 0.9;        // shoulder
    const a1 = X[tt][1] * 0.6 - 0.3;  // upper arm
    const a2 = X[tt][2] * 0.7;        // forearm relative to upper
    const a3 = X[tt][3] * 0.5;        // wrist relative to forearm
    const grip = clamp(X[tt][6] * 0.5 + 0.5, 0, 1);

    const L1 = 70, L2 = 60, L3 = 28;
    const x1 = cx + Math.cos(Math.PI / 2 + a0 + a1) * L1;
    const y1 = cy - Math.sin(Math.PI / 2 + a0 + a1) * L1;
    const x2 = x1 + Math.cos(Math.PI / 2 + a0 + a1 + a2) * L2;
    const y2 = y1 - Math.sin(Math.PI / 2 + a0 + a1 + a2) * L2;
    const x3 = x2 + Math.cos(Math.PI / 2 + a0 + a1 + a2 + a3) * L3;
    const y3 = y2 - Math.sin(Math.PI / 2 + a0 + a1 + a2 + a3) * L3;

    // base
    ctx.fillStyle = C.ruleStrong;
    ctx.fillRect(cx - 18, cy + 8, 36, 8);

    // links
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = C.action;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
    ctx.stroke();

    // joints
    ctx.fillStyle = C.inkStrong;
    [[cx, cy], [x1, y1], [x2, y2], [x3, y3]].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // gripper at end
    const gAng = Math.PI / 2 + a0 + a1 + a2 + a3;
    const gw = 8 + grip * 8;
    const gx1 = x3 + Math.cos(gAng + Math.PI / 2) * gw;
    const gy1 = y3 - Math.sin(gAng + Math.PI / 2) * gw;
    const gx2 = x3 - Math.cos(gAng + Math.PI / 2) * gw;
    const gy2 = y3 + Math.sin(gAng + Math.PI / 2) * gw;
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.action;
    ctx.beginPath();
    ctx.moveTo(gx1, gy1); ctx.lineTo(gx1 + Math.cos(gAng) * 14, gy1 - Math.sin(gAng) * 14);
    ctx.moveTo(gx2, gy2); ctx.lineTo(gx2 + Math.cos(gAng) * 14, gy2 - Math.sin(gAng) * 14);
    ctx.stroke();

    // jitter halo when noisy: draw 4 ghost arms at neighboring timesteps
    if (state.tau < 0.7) {
      const ghostAlpha = (0.7 - state.tau) * 0.6;
      for (let k = -2; k <= 2; k++) {
        if (k === 0) continue;
        const ti = clamp(tt + k * 3, 0, T_STEPS - 1);
        const b0 = X[ti][0] * 0.9;
        const b1 = X[ti][1] * 0.6 - 0.3;
        const b2 = X[ti][2] * 0.7;
        const xb1 = cx + Math.cos(Math.PI / 2 + b0 + b1) * L1;
        const yb1 = cy - Math.sin(Math.PI / 2 + b0 + b1) * L1;
        const xb2 = xb1 + Math.cos(Math.PI / 2 + b0 + b1 + b2) * L2;
        const yb2 = yb1 - Math.sin(Math.PI / 2 + b0 + b1 + b2) * L2;
        ctx.strokeStyle = 'rgba(255,168,77,' + ghostAlpha.toFixed(2) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy); ctx.lineTo(xb1, yb1); ctx.lineTo(xb2, yb2);
        ctx.stroke();
      }
    }

    // caption
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('arm at chunk step 25', ARM_X + ARM_W / 2, ARM_Y + 14);
    ctx.fillText(state.tau < 0.4 ? 'noisy — chunk is incoherent'
              :  state.tau < 0.85 ? 'partially denoised'
              :  'clean chunk → reach motion',
              ARM_X + ARM_W / 2, ARM_Y + ARM_H - 12);
  }

  function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    drawTraces();
    drawArm();
  }

  /* ---------- controls ---------- */
  const slider = document.getElementById('action-denoise-tau');
  const readout = document.getElementById('action-denoise-tau-readout');
  if (slider) {
    slider.addEventListener('input', (e) => {
      state.tau = parseFloat(e.target.value) / 100;
      if (readout) readout.textContent = state.tau.toFixed(2);
      draw();
    });
  }

  draw();
})();
