/* viz_action_chunk.js
   Concept taught: an action chunk is 50 timesteps × 18 dims of continuous joint targets.
   It is a smooth trajectory, not a single action — predicting the chunk forces the model
   to commit to coherent motion rather than re-decide on every tick.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-chunk');
  if (!canvas) return;
  const W = 900, H = 500;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const T = 50;
  const D_SHOW = 7;            // show 7 traces; the real D=18 is mentioned in caption
  // Synthetic but plausible joint trajectories: smooth low-frequency motion.
  // Each joint is a unique combination of sine/cosine/decay so they look like a real chunk.
  const traces = generateTraces();
  const colors = C.j;          // 7 joint colours

  let revealUpTo = T;          // slider value
  let playing = false;
  let lastT = 0;

  function generateTraces() {
    // Smooth, plausible single-second of motion: each joint follows a low-frequency
    // sinusoid + gentle drift, like a real coordinated reach.
    const out = [];
    for (let d = 0; d < D_SHOW; d++) {
      const phase = d * 0.5 + 0.2;
      const freq = 0.018 + d * 0.004;          // ≈ ~1 cycle per 50 steps, very slow
      const amp = 0.55 + 0.18 * Math.sin(d * 1.1);
      const drift = 0.22 * Math.cos(d * 0.4);
      const offset = (d - (D_SHOW - 1) / 2) * 0.16;
      const arr = [];
      for (let t = 0; t < T; t++) {
        const tt = t / (T - 1);
        const motion =
          amp * Math.sin(2 * Math.PI * freq * t + phase) +
          drift * tt +              // slow linear drift across the second
          offset +
          0.05 * Math.sin(0.22 * t + d);  // tiny ripple, not high-freq
        arr.push(motion);
      }
      out.push(arr);
    }
    return out;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ─── Layout: left big plot of traces, right inset arm sketch
    const plotX = 70, plotY = 60, plotW = 580, plotH = 360;

    // axes
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // gridlines + tick marks
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 5; i++) {
      const y = plotY + (i / 5) * plotH;
      ctx.beginPath();
      ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
    }
    // x ticks
    ctx.fillStyle = C.inkDim;
    ctx.font = '10px JetBrains Mono';
    for (let i = 0; i <= 5; i++) {
      const x = plotX + (i / 5) * plotW;
      const t = Math.round((i / 5) * T);
      ctx.fillText('t=' + t, x - 10, plotY + plotH + 14);
    }
    ctx.fillText('joint target', plotX - 56, plotY + 12);
    ctx.fillText('low', plotX - 28, plotY + plotH);
    ctx.fillText('high', plotX - 30, plotY + 8);

    // y-range scaling
    let yMin = Infinity, yMax = -Infinity;
    for (const tr of traces) for (const v of tr) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
    yMin -= 0.1; yMax += 0.1;
    const yScale = (v) => plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const xScale = (t) => plotX + (t / (T - 1)) * plotW;

    // amber wash up to revealUpTo
    if (revealUpTo > 0) {
      ctx.fillStyle = 'rgba(255,168,77,0.06)';
      ctx.fillRect(plotX, plotY, (revealUpTo / T) * plotW, plotH);
    }

    // traces
    for (let d = 0; d < D_SHOW; d++) {
      ctx.strokeStyle = colors[d];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (let t = 0; t < Math.min(revealUpTo + 1, T); t++) {
        const x = xScale(t);
        const y = yScale(traces[d][t]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // current dot
      if (revealUpTo > 0 && revealUpTo < T) {
        const x = xScale(revealUpTo - 1);
        const y = yScale(traces[d][revealUpTo - 1]);
        ctx.fillStyle = colors[d];
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // chunk window label
    ctx.fillStyle = C.action;
    ctx.font = '500 11px Inter';
    ctx.fillText('CHUNK = 50 TIMESTEPS × 18 DIMS  (1 second at 50 Hz)', plotX, plotY - 18);

    // current time label
    ctx.fillStyle = C.ink;
    ctx.font = '600 12px JetBrains Mono';
    ctx.fillText('t = ' + revealUpTo, plotX + plotW - 70, plotY - 18);

    // ─── arm inset
    const armX = 720, armY = 90, armR = 90;
    drawArmInset(armX, armY, armR);

    // ─── note about D=18
    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 12px Source Serif 4';
    ctx.fillText('Showing 7 of D=18 joint dimensions. The full chunk lives in ℝ⁵⁰ˣ¹⁸ = ℝ⁹⁰⁰.', plotX, plotY + plotH + 36);
  }

  function drawArmInset(cx, cy, r) {
    // simple 2-link arm whose joint angles come from the first two traces
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText('ROBOT AT t = ' + revealUpTo, cx - 30, cy - 60);

    // shoulder
    ctx.fillStyle = C.bgFig;
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.65, r * 0.95, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    const tIdx = Math.max(0, Math.min(T - 1, revealUpTo - 1));
    const a1 = -Math.PI / 2 + traces[0][tIdx] * 0.7;
    const a2 = traces[1][tIdx] * 1.0;

    const link1 = r * 0.7;
    const link2 = r * 0.55;
    const sx = cx, sy = cy + r * 0.65 - 8;
    const ex = sx + Math.cos(a1) * link1;
    const ey = sy + Math.sin(a1) * link1;
    const tx = ex + Math.cos(a1 + a2) * link2;
    const ty = ey + Math.sin(a1 + a2) * link2;

    ctx.strokeStyle = C.action;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.fillStyle = '#1a1c20';
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
    // gripper: small open mark
    const gripperO = traces[6][tIdx]; // last "joint" channel = gripper
    ctx.strokeStyle = C.j[6];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a1 + a2 - Math.PI / 2) * (4 + gripperO * 4),
               ty + Math.sin(a1 + a2 - Math.PI / 2) * (4 + gripperO * 4));
    ctx.lineTo(tx + Math.cos(a1 + a2 - Math.PI / 2) * (10 + gripperO * 6),
               ty + Math.sin(a1 + a2 - Math.PI / 2) * (10 + gripperO * 6));
    ctx.moveTo(tx + Math.cos(a1 + a2 + Math.PI / 2) * (4 + gripperO * 4),
               ty + Math.sin(a1 + a2 + Math.PI / 2) * (4 + gripperO * 4));
    ctx.lineTo(tx + Math.cos(a1 + a2 + Math.PI / 2) * (10 + gripperO * 6),
               ty + Math.sin(a1 + a2 + Math.PI / 2) * (10 + gripperO * 6));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ─── interactions
  const slider = document.getElementById('chunk-t');
  const sliderOut = document.getElementById('chunk-t-out');
  slider.addEventListener('input', () => {
    revealUpTo = parseInt(slider.value, 10);
    sliderOut.textContent = String(revealUpTo);
    draw();
  });
  document.getElementById('chunk-play').addEventListener('click', () => {
    playing = !playing;
    if (playing) {
      revealUpTo = 1;
      lastT = 0;
      requestAnimationFrame(tick);
    }
  });
  function tick(now) {
    if (!playing) return;
    if (!lastT) lastT = now;
    const dt = (now - lastT) / 1000;
    lastT = now;
    revealUpTo += dt * (T / 2.5); // sweep over ~2.5s
    if (revealUpTo > T) { revealUpTo = T; playing = false; }
    slider.value = String(Math.round(revealUpTo));
    sliderOut.textContent = String(Math.round(revealUpTo));
    draw();
    if (playing) requestAnimationFrame(tick);
  }

  draw();
})();
