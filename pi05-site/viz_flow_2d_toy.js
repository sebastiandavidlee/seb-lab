/* viz_flow_2d_toy.js
   Concept taught: a velocity field is a function v(x, t) that, at each point in
   space and each time-stamp t in [0,1], says "move this way." Integrating from a
   noise sample to t=1 produces a sample from the target distribution. The reader
   sees the field, sees particles riding it, and sees what changes with t.

   This is the crown jewel of Page 3. It must teach FOUR things in order:
     1. there is a noise distribution (lower-left blob)
     2. there is a target distribution (upper-right ring)
     3. at each (x, t) there is an arrow; together arrows form a vector field
     4. running particles along the field for t ∈ [0,1] turns noise into target
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-flow-2d-toy');
  if (!canvas) return;
  const W = 760, H = 500;
  const ctx = setupHiDPICanvas(canvas, W, H);

  // Geometry: a noise blob at lower-left, a ring at upper-right (in viz units).
  const NOISE_C = { x: -1.6, y: -1.4 };
  const NOISE_S = 0.55;             // gaussian std
  const RING_C  = { x:  1.5, y:  1.3 };
  const RING_R  = 0.85;
  const RING_W  = 0.18;             // ring thickness (std)

  // Map viz units → pixels
  const VX_MIN = -3.0, VX_MAX = 3.0;
  const VY_MIN = -2.4, VY_MAX = 2.4;
  function mapX(x) { return (x - VX_MIN) / (VX_MAX - VX_MIN) * W; }
  function mapY(y) { return H - (y - VY_MIN) / (VY_MAX - VY_MIN) * H; }

  /* ---------- target sampling: a literal ring around RING_C ---------- */
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

  // Pre-compute paired (noise, target) endpoints so each particle has a fixed
  // straight path. This is the OT-CFM picture and is what the velocity field
  // induces. We define v(x, t) = target - noise wherever the particle is "near"
  // the straight line; for arbitrary x we use a smooth blended field below.
  const N_PARTS = 60;
  const PARTS = [];
  {
    const r = rng(7);
    for (let i = 0; i < N_PARTS; i++) {
      const nx = NOISE_C.x + NOISE_S * gauss(r);
      const ny = NOISE_C.y + NOISE_S * gauss(r);
      // sample a point on the ring
      const ang = r() * Math.PI * 2;
      const rad = RING_R + RING_W * gauss(r);
      const tx = RING_C.x + Math.cos(ang) * rad;
      const ty = RING_C.y + Math.sin(ang) * rad;
      PARTS.push({ nx, ny, tx, ty });
    }
  }

  // For drawing the field at arbitrary (x, t) we use a soft k-NN over the
  // straight segments at parameter t: each segment contributes velocity
  // (target - noise), weighted by a Gaussian on the distance from x to that
  // segment's point at parameter t. This gives a coherent vector field that
  // is consistent with the rectified-flow picture.
  function fieldAt(x, y, t) {
    let vx = 0, vy = 0, wsum = 0;
    const sigma2 = 0.45 * 0.45;
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      const px = (1 - t) * p.nx + t * p.tx;
      const py = (1 - t) * p.ny + t * p.ty;
      const dx = x - px, dy = y - py;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma2));
      vx += w * (p.tx - p.nx);
      vy += w * (p.ty - p.ny);
      wsum += w;
    }
    if (wsum < 1e-9) return [0, 0];
    return [vx / wsum, vy / wsum];
  }

  /* ---------- state ---------- */
  const state = {
    tau: 0.0,
    showField: true,
    showParticles: true,
    playing: false,
    lastTs: 0,
    // Particle positions in viz units; reset on tau→0
    parts: PARTS.map((p) => ({ x: p.nx, y: p.ny }))
  };

  /* ---------- drawing helpers ---------- */
  function drawBackground() {
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    // axis tick marks (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let g = -3; g <= 3; g++) {
      ctx.beginPath();
      ctx.moveTo(mapX(g), 0); ctx.lineTo(mapX(g), H); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mapY(g)); ctx.lineTo(W, mapY(g)); ctx.stroke();
    }
  }

  function drawDistributionContours() {
    // noise: filled disc for the 1σ region, fading
    const cx0 = mapX(NOISE_C.x), cy0 = mapY(NOISE_C.y);
    const rx = (NOISE_S / (VX_MAX - VX_MIN)) * W * 2;
    const ry = (NOISE_S / (VY_MAX - VY_MIN)) * H * 2;
    ctx.save();
    ctx.translate(cx0, cy0);
    ctx.beginPath();
    ctx.scale(rx, ry);
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
    ctx.fillStyle = hexa(C.noise, 0.55);
    ctx.fill();
    ctx.strokeStyle = hexa(C.noise, 1);
    ctx.lineWidth = 1;
    ctx.stroke();

    // target ring: annular
    const cxR = mapX(RING_C.x), cyR = mapY(RING_C.y);
    const ringPx = (RING_R / (VX_MAX - VX_MIN)) * W * 2;
    const ringPy = (RING_R / (VY_MAX - VY_MIN)) * H * 2;
    ctx.save();
    ctx.translate(cxR, cyR);
    ctx.scale(ringPx, ringPy);
    ctx.beginPath();
    ctx.arc(0, 0, 1.05, 0, Math.PI * 2);
    ctx.arc(0, 0, 0.78, 0, Math.PI * 2, true);
    ctx.restore();
    ctx.fillStyle = hexa(C.data, 0.32);
    ctx.fill();
    ctx.strokeStyle = hexa(C.data, 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cxR, cyR, ringPx * 1.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cxR, cyR, ringPx * 0.78, 0, Math.PI * 2);
    ctx.stroke();

    // labels
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = C.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText('noise distribution (t = 0)', cx0, cy0 + ry * 1.05 + 16);
    ctx.fillText('target distribution (t = 1)', cxR, cyR + ringPx * 1.05 + 16);
  }

  function drawField() {
    if (!state.showField) return;
    const NX = 18, NY = 12;
    ctx.lineWidth = 1.0;
    for (let ix = 0; ix < NX; ix++) {
      for (let iy = 0; iy < NY; iy++) {
        const xv = VX_MIN + (ix + 0.5) / NX * (VX_MAX - VX_MIN);
        const yv = VY_MIN + (iy + 0.5) / NY * (VY_MAX - VY_MIN);
        const [vx, vy] = fieldAt(xv, yv, state.tau);
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag < 1e-3) continue;
        const sc = 0.18; // viz-unit length per arrow
        const ex = xv + (vx / mag) * Math.min(sc, mag * 0.05);
        const ey = yv + (vy / mag) * Math.min(sc, mag * 0.05);
        const a = clamp(0.18 + mag * 0.04, 0.18, 0.85);
        ctx.strokeStyle = hexa(C.flow, a);
        ctx.fillStyle = hexa(C.flow, a);
        const sx = mapX(xv), sy = mapY(yv);
        const tx = mapX(ex), ty = mapY(ey);
        ctx.beginPath();
        ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        ctx.stroke();
        // arrowhead
        const ang = Math.atan2(ty - sy, tx - sx);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 4 * Math.cos(ang - 0.45), ty - 4 * Math.sin(ang - 0.45));
        ctx.lineTo(tx - 4 * Math.cos(ang + 0.45), ty - 4 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    if (!state.showParticles) return;
    for (let i = 0; i < state.parts.length; i++) {
      const p = state.parts[i];
      const px = mapX(p.x), py = mapY(p.y);
      // color interpolates noise → data as tau grows
      const t = state.tau;
      const col = mixHex(C.noise, C.data, t);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTauReadout() {
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'right';
    ctx.fillText('t = ' + state.tau.toFixed(2), W - 14, 22);
  }

  function draw() {
    drawBackground();
    drawDistributionContours();
    drawField();
    drawParticles();
    drawTauReadout();
  }

  /* ---------- color helpers ---------- */
  function hexa(hex, a) {
    // Accepts #rrggbb
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    const ah = a.replace('#', ''), bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
    const r = Math.round(lerp(ar, br, t));
    const g = Math.round(lerp(ag, bg, t));
    const b2 = Math.round(lerp(ab, bb, t));
    return 'rgb(' + r + ',' + g + ',' + b2 + ')';
  }

  /* ---------- particle integration along the field ---------- */
  function setParticlesAtTau(t) {
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      state.parts[i].x = (1 - t) * p.nx + t * p.tx;
      state.parts[i].y = (1 - t) * p.ny + t * p.ty;
    }
  }

  /* ---------- controls ---------- */
  const slider = document.getElementById('flow-2d-tau');
  const readout = document.getElementById('flow-2d-tau-readout');
  const playBtn = document.getElementById('flow-2d-play');
  const fieldBtn = document.getElementById('flow-2d-field-toggle');

  if (slider) {
    slider.addEventListener('input', (e) => {
      state.tau = parseFloat(e.target.value) / 100;
      readout.textContent = state.tau.toFixed(2);
      setParticlesAtTau(state.tau);
      draw();
      revealEquation();
    });
  }
  if (fieldBtn) {
    fieldBtn.addEventListener('click', () => {
      state.showField = !state.showField;
      fieldBtn.classList.toggle('active', state.showField);
      draw();
    });
  }
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.playing) {
        state.playing = false;
        playBtn.textContent = 'play denoise';
        return;
      }
      state.playing = true;
      playBtn.textContent = 'pause';
      state.tau = 0;
      setParticlesAtTau(0);
      state.lastTs = performance.now();
      requestAnimationFrame(tick);
      revealEquation();
    });
  }

  function tick(ts) {
    if (!state.playing) return;
    const dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    state.tau += dt / 4.0; // 4-second sweep
    if (state.tau >= 1) {
      state.tau = 1;
      state.playing = false;
      if (playBtn) playBtn.textContent = 'play denoise';
    }
    if (slider) slider.value = String(Math.round(state.tau * 100));
    if (readout) readout.textContent = state.tau.toFixed(2);
    setParticlesAtTau(state.tau);
    draw();
    if (state.playing) requestAnimationFrame(tick);
  }

  function revealEquation() {
    const eq = document.getElementById('flow-2d-eq');
    if (eq) eq.classList.add('is-revealed');
  }

  draw();
})();
