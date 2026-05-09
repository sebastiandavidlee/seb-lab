/* viz_fast_pipeline.js
   Concept taught: FAST takes a 50×D continuous action chunk and squashes it into
   ~30–60 categorical tokens through four transforms — DCT along time, scalar
   quantization of the coefficients, BPE merging on the integer stream, and a
   token-id readout. Each stage is concrete: bars, a grid, merges, coloured
   chips. The reader leaves knowing why a categorical loss is even *available*.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-fast-pipeline');
  if (!canvas) return;
  const W = 1100, H = 460;
  const ctx = setupHiDPICanvas(canvas, W, H);

  /* ── Generate a synthetic 50×7 action chunk with smooth trajectories ── */
  const T = 50, D = 7;
  const chunk = [];
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
  const r = rng(11);
  for (let d = 0; d < D; d++) {
    const phase = d * 0.62 + r() * 0.5;
    const amp = 0.55 + 0.18 * Math.sin(d * 1.7);
    const trace = [];
    for (let t = 0; t < T; t++) {
      const u = t / (T - 1);
      const v = amp * Math.sin(2.4 * u * Math.PI + phase) + 0.18 * Math.sin(7.2 * u + d) + 0.04 * (r() - 0.5);
      trace.push(v);
    }
    chunk.push(trace);
  }

  /* DCT-II per joint, length T */
  function dct(v) {
    const N = v.length;
    const out = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let s = 0;
      for (let n = 0; n < N; n++) {
        s += v[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
      }
      out[k] = s * (k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N));
    }
    return out;
  }
  const coeffs = chunk.map(dct);

  /* Quantize: keep top-K coefficients per joint, snap to a small bin grid */
  const KEEP = 12;
  const BINS = 8;
  function quantize(coef) {
    const slice = coef.slice(0, KEEP);
    const max = Math.max(...slice.map(Math.abs)) || 1;
    return slice.map((c) => Math.round((c / max) * BINS) + BINS); // 0..2*BINS
  }
  const quant = coeffs.map(quantize);

  /* Flatten quant streams across joints, BPE-style: greedy pair merge until ~40 tokens */
  function bpe(seqs) {
    let stream = [].concat.apply([], seqs);
    const stages = [stream.slice()];
    while (stream.length > 40) {
      const counts = new Map();
      for (let i = 0; i < stream.length - 1; i++) {
        const k = stream[i] + ',' + stream[i + 1];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      let best = null, bestCount = -1;
      for (const [k, v] of counts) if (v > bestCount) { best = k; bestCount = v; }
      if (bestCount <= 1) break;
      const [a, b] = best.split(',').map(Number);
      const merged = 100 + stages.length;       // synthetic merged-token id
      const next = [];
      for (let i = 0; i < stream.length; i++) {
        if (i < stream.length - 1 && stream[i] === a && stream[i + 1] === b) {
          next.push(merged); i++;
        } else next.push(stream[i]);
      }
      stream = next;
      stages.push(stream.slice());
      if (stages.length > 6) break;
    }
    return { stream, stages };
  }
  const bpeResult = bpe(quant);
  const tokens = bpeResult.stream;

  /* ── State / interaction ──────────────────────────────────── */
  const state = { stage: 0, hover: -1 };

  /* ── Layout ───────────────────────────────────────────────── */
  // Five panels, each ~200 wide, separated by arrows.
  const PAD = 30, panelW = 190, panelH = 240, gap = 18;
  const panelY = 100;
  const panels = [];
  for (let i = 0; i < 5; i++) {
    panels.push({ x: PAD + i * (panelW + gap), y: panelY, w: panelW, h: panelH });
  }

  function panelHeader(p, idx, title, sub) {
    ctx.fillStyle = state.stage === idx ? C.inkStrong : C.inkMuted;
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('STAGE ' + (idx + 1), p.x, p.y - 28);
    ctx.fillStyle = state.stage === idx ? C.inkStrong : C.ink;
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText(title, p.x, p.y - 10);
    ctx.fillStyle = C.inkDim;
    ctx.font = '500 11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(sub, p.x + p.w, p.y - 10);
  }

  function panelBox(p, active) {
    ctx.save();
    ctx.fillStyle = active ? '#1f1f24' : '#1a1c20';
    ctx.strokeStyle = active ? C.fast : C.rule;
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, p.x, p.y, p.w, p.h, 6);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function arrow(x0, y0, x1, y1) {
    ctx.strokeStyle = C.inkDim;
    ctx.fillStyle = C.inkDim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    ctx.translate(x1, y1); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-6, -3.5); ctx.lineTo(-6, 3.5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ── Draw stages ──────────────────────────────────────────── */
  function drawStage1Chunk(p) {
    // 7 sparkline traces
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
    ctx.clip();
    const rowH = (p.h - 24) / D;
    for (let d = 0; d < D; d++) {
      const trace = chunk[d];
      const y0 = p.y + 12 + d * rowH;
      // baseline
      ctx.strokeStyle = C.rule;
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(p.x + 12, y0 + rowH / 2); ctx.lineTo(p.x + p.w - 12, y0 + rowH / 2); ctx.stroke();
      // trace
      ctx.strokeStyle = C.j[d];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let t = 0; t < T; t++) {
        const x = p.x + 12 + (t / (T - 1)) * (p.w - 24);
        const y = y0 + rowH / 2 - trace[t] * (rowH / 2.6);
        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStage2DCT(p) {
    // Bar chart of coefficients: low-frequency tall, high-frequency tiny.
    // Show 7 small subplots, one per joint, side-by-side OR stacked.
    // Easier: average abs values across joints; render single bar chart.
    const N = T;
    const avg = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let s = 0; for (let d = 0; d < D; d++) s += Math.abs(coeffs[d][k]);
      avg[k] = s / D;
    }
    const maxV = Math.max(...avg);
    const innerW = p.w - 24, innerH = p.h - 60;
    const barW = innerW / N;
    const yBase = p.y + p.h - 30;
    for (let k = 0; k < N; k++) {
      const h = (avg[k] / maxV) * innerH;
      const x = p.x + 12 + k * barW;
      const inKept = k < KEEP;
      ctx.fillStyle = inKept ? C.fast : C.frozen;
      ctx.globalAlpha = inKept ? 1 : 0.45;
      ctx.fillRect(x, yBase - h, Math.max(barW - 0.6, 1.2), h);
    }
    ctx.globalAlpha = 1;
    // Frequency axis label
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('low f', p.x + 12, yBase + 14);
    ctx.textAlign = 'right';
    ctx.fillText('high f', p.x + p.w - 12, yBase + 14);
    // KEEP marker
    const xmark = p.x + 12 + KEEP * barW;
    ctx.strokeStyle = C.fast;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xmark, p.y + 10); ctx.lineTo(xmark, yBase);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.fast;
    ctx.textAlign = 'left';
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.fillText('keep top ' + KEEP, xmark + 4, p.y + 22);
  }

  function drawStage3Quant(p) {
    // Grid of quantized integers — 7 rows × KEEP cols
    const cols = KEEP;
    const rows = D;
    const cellW = (p.w - 24) / cols;
    const cellH = (p.h - 60) / rows;
    const x0 = p.x + 12, y0 = p.y + 16;
    for (let d = 0; d < rows; d++) {
      for (let k = 0; k < cols; k++) {
        const v = quant[d][k];
        // colour intensity by deviation from middle
        const dev = Math.abs(v - BINS) / BINS;
        ctx.fillStyle = mix('#1a1c20', C.fast, dev);
        ctx.fillRect(x0 + k * cellW + 1, y0 + d * cellH + 1, cellW - 2, cellH - 2);
        ctx.fillStyle = dev > 0.4 ? '#fff' : C.inkMuted;
        ctx.font = '600 9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x0 + k * cellW + cellW / 2, y0 + d * cellH + cellH / 2);
      }
    }
    // Axis labels
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('coef k = 0 … ' + (KEEP - 1) + ' →', p.x + p.w / 2, p.y + p.h - 28);
    ctx.save();
    ctx.translate(p.x + 8, p.y + p.h / 2 - 10);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('joint d ↓', 0, 0);
    ctx.restore();
  }

  function drawStage4BPE(p) {
    // Show three rows: pre-merge stream, mid-merge, final
    const stages = bpeResult.stages;
    const showCounts = [stages[0].length, stages[Math.min(2, stages.length - 1)].length, tokens.length];
    const labels = ['flat (' + stages[0].length + ' ints)', 'merge pass ' + Math.min(2, stages.length - 1), 'final (' + tokens.length + ' tokens)'];
    const rows = 3;
    const rowH = (p.h - 30) / rows;
    for (let i = 0; i < rows; i++) {
      const seq = i === 0 ? stages[0] : (i === 1 ? stages[Math.min(2, stages.length - 1)] : tokens);
      const yc = p.y + 14 + i * rowH + rowH / 2;
      // strip
      const innerW = p.w - 24;
      const cellW = innerW / Math.max(seq.length, 30);
      for (let j = 0; j < seq.length; j++) {
        const v = seq[j];
        const isMerged = v >= 100;
        ctx.fillStyle = isMerged ? C.fast : mix(C.frozen, C.fast, ((v % BINS) / BINS) * 0.6);
        const w = Math.max(cellW * 0.92, 1.5);
        ctx.fillRect(p.x + 12 + j * cellW, yc - 6, w, 12);
      }
      ctx.fillStyle = C.inkMuted;
      ctx.font = '500 9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(labels[i], p.x + 12, yc + 16);
    }
    // Connecting reduction arrow on the right
    ctx.strokeStyle = C.fast;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x + p.w - 18, p.y + 20); ctx.lineTo(p.x + p.w - 18, p.y + p.h - 32);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.fast;
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('compress ↓', p.x + p.w - 22, p.y + p.h - 18);
  }

  function drawStage5Tokens(p) {
    // Render token chips, coloured by id-mod palette
    const inner = { x: p.x + 12, y: p.y + 14, w: p.w - 24, h: p.h - 50 };
    const cols = 8;
    const rows = Math.ceil(tokens.length / cols);
    const cellW = inner.w / cols, cellH = Math.min(22, inner.h / rows);
    for (let i = 0; i < tokens.length; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const v = tokens[i];
      const hue = (v * 47) % 360;
      ctx.fillStyle = `hsl(${hue}, 65%, 55%)`;
      const cx = inner.x + c * cellW + 2;
      const cy = inner.y + r * cellH + 2;
      ctx.fillRect(cx, cy, cellW - 4, cellH - 4);
      ctx.fillStyle = '#0a0a0a';
      ctx.font = '600 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), cx + (cellW - 4) / 2, cy + (cellH - 4) / 2 + 0.5);
    }
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tokens.length + ' tokens · vocab ≈ 1024–2048', p.x + p.w / 2, p.y + p.h - 18);
  }

  function mix(c1, c2, t) {
    function p(c) {
      c = c.replace('#', '');
      return [
        parseInt(c.slice(0, 2), 16),
        parseInt(c.slice(2, 4), 16),
        parseInt(c.slice(4, 6), 16)
      ];
    }
    const a = p(c1), b = p(c2);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  /* ── Render ───────────────────────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    const titles = [
      ['action chunk', '50 × 7 floats'],
      ['DCT along time', 'frequency coeffs'],
      ['quantize', 'integer bins'],
      ['BPE merge', 'pair-merge greedy'],
      ['tokens', tokens.length + ' ids']
    ];
    const drawers = [drawStage1Chunk, drawStage2DCT, drawStage3Quant, drawStage4BPE, drawStage5Tokens];

    for (let i = 0; i < 5; i++) {
      const p = panels[i];
      const active = state.stage === i;
      panelBox(p, active);
      panelHeader(p, i, titles[i][0], titles[i][1]);
      drawers[i](p);
      if (i < 4) {
        const ax = p.x + p.w + 2;
        arrow(ax, p.y + p.h / 2, ax + gap - 4, p.y + p.h / 2);
      }
    }

    // Bottom caption
    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 13px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'These tokens are a cross-entropy target the VLM is forced to predict during training only — never produced at runtime.',
      W / 2, H - 30
    );
  }

  render();

  /* Click handler — promote a stage to "active" so the reader can step through */
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (W / rect.width);
    const y = (ev.clientY - rect.top) * (H / rect.height);
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
        state.stage = i;
        render();
        return;
      }
    }
  });

  /* Stage stepper buttons (optional external control) */
  document.querySelectorAll('[data-fast-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.stage = parseInt(btn.getAttribute('data-fast-stage'), 10);
      document.querySelectorAll('[data-fast-stage]').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });
})();
