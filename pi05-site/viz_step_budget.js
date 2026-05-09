/* viz_step_budget.js
   Concept taught: more Euler steps cost more wall-clock but give diminishing
   quality returns. The viz packs three indicators on a single slider so the
   reader can see *why* π₀.5 picks 10.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-step-budget');
  if (!canvas) return;
  const W = 760, H = 360;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const state = { N: 10 };

  // hand-tuned curve: 1 → 30, 5 → 80, 10 → 95, 20 → 96
  function quality(N) {
    if (N <= 1) return 0.30;
    return clamp(0.95 * (1 - Math.exp(-(N - 1) * 0.32)) + 0.30 * Math.exp(-(N - 1) * 0.32) + 0.01 * Math.log(N), 0, 0.97);
  }
  function wallclockMs(N) { return N * 7; } // 7 ms per step on RTX 4090 (action-token forward)
  function successRate(N) {
    // S-curve: <3 = 10%, 5 = 70%, 10+ = ~94%
    return 0.05 + 0.92 / (1 + Math.exp(-(N - 5) * 0.85));
  }

  function draw() {
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    const PAD = 28;
    const left = PAD, right = W - PAD;
    const top = PAD + 14;
    const usable = right - left;

    // x-axis grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let n = 1; n <= 20; n++) {
      const x = left + (n - 1) / 19 * usable;
      ctx.beginPath();
      ctx.moveTo(x, top); ctx.lineTo(x, top + 200);
      ctx.stroke();
    }

    // 1) Quality curve
    ctx.strokeStyle = C.flow;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let n = 1; n <= 20; n++) {
      const x = left + (n - 1) / 19 * usable;
      const y = top + (1 - quality(n)) * 200;
      if (n === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2) Wall-clock line (shown along same x but mapped to a separate y range
    //   right-side axis). We bake this into the same 200px band but draw it
    //   as a dotted amber line so it reads as a SECOND indicator.
    const wcMax = 20 * 7; // 140 ms
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (let n = 1; n <= 20; n++) {
      const x = left + (n - 1) / 19 * usable;
      const y = top + (1 - wallclockMs(n) / wcMax) * 200;
      if (n === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3) Success-rate line (purple-ish, but we use --c-vlm? no — keep palette
    //    on this page restricted to flow/action/data. Use --c-data warm yellow).
    ctx.strokeStyle = C.data;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    for (let n = 1; n <= 20; n++) {
      const x = left + (n - 1) / 19 * usable;
      const y = top + (1 - successRate(n)) * 200;
      if (n === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // axis labels
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let n = 1; n <= 20; n += 5) {
      const x = left + (n - 1) / 19 * usable;
      ctx.fillText(String(n), x, top + 206);
    }
    ctx.fillText('number of Euler ODE steps (N)', W / 2, top + 222);

    // marker for current N
    const markX = left + (state.N - 1) / 19 * usable;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(markX, top); ctx.lineTo(markX, top + 200);
    ctx.stroke();
    ctx.setLineDash([]);

    // dots at marker
    const qy = top + (1 - quality(state.N)) * 200;
    const wy = top + (1 - wallclockMs(state.N) / wcMax) * 200;
    const sy = top + (1 - successRate(state.N)) * 200;
    [[qy, C.flow], [wy, C.action], [sy, C.data]].forEach(([y, col]) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(markX, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.bgFig;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // readouts
    const ry = top + 240;
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.flow;
    ctx.fillText('quality   ' + (quality(state.N) * 100).toFixed(0) + '%', left, ry);
    ctx.fillStyle = C.action;
    ctx.fillText('wall-clock  ' + wallclockMs(state.N) + ' ms', left + 220, ry);
    ctx.fillStyle = C.data;
    ctx.fillText('success   ' + (successRate(state.N) * 100).toFixed(0) + '%', left + 460, ry);

    // explanatory note
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('quality plateaus around N = 10. wall-clock grows linearly. success is binary above ~5.', left, ry + 22);

    // The π₀.5 pick highlight
    if (state.N === 10) {
      ctx.fillStyle = C.ink;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillText('π₀.5 picks 10 — at the knee.', left, ry + 38);
    }
  }

  const slider = document.getElementById('step-budget-n');
  const readout = document.getElementById('step-budget-n-readout');
  if (slider) {
    slider.addEventListener('input', (e) => {
      state.N = parseInt(e.target.value, 10);
      if (readout) readout.textContent = String(state.N);
      draw();
    });
  }
  draw();
})();
