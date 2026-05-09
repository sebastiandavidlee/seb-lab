/* viz_data_mixture.js
   Concept taught: π₀.5's training batch is a heterogeneous mixture of five
   data streams, but per the paper's own ablations only two of them are active
   levers — cross-embodiment robot data and subtask-language annotations.
   Mobile-manip data is supportive; web VQA/OCR is not statistically significant.
   The viz must communicate that distinction with chips, not just sizes.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-data-mixture');
  if (!canvas) return;
  const W = 1100, H = 360;
  const ctx = setupHiDPICanvas(canvas, W, H);

  /* Each slice has: name, percentage range (display + low/high), tag, color, detail. */
  const SLICES = [
    {
      name: 'lab teleop',
      pct: 24, range: '~20–30%',
      tag: 'SUPPORT',
      color: C.j[1],
      detail: 'Pi internal multi-robot teleoperation fleet — the legacy backbone of training data; foundational but not novel for π₀.5.'
    },
    {
      name: 'mobile-manip homes',
      pct: 18, range: '~15–25%',
      tag: 'SUPPORT',
      color: C.j[3],
      detail: '~400 hours collected across 104 homes for π₀.5. Sample-efficient backbone; the in-domain fuel, but ablations cast it as supportive, not the lever.'
    },
    {
      name: 'cross-embodiment',
      pct: 28, range: '~25–35%',
      tag: 'ACTIVE LEVER',
      color: C.action,
      detail: 'OXE-style demonstrations across multiple robot platforms. Removing it significantly degrades unseen-home performance per π₀.5 §5 ablations.'
    },
    {
      name: 'web VQA / OCR / detection',
      pct: 19, range: '~15–25%',
      tag: 'NOT SIGNIFICANT',
      color: C.vlm,
      detail: 'Image-language web data inherited from the PaliGemma recipe. Surprisingly: removing it is *not* statistically significant on main tasks (π₀.5 paper).'
    },
    {
      name: 'subtask language',
      pct: 11, range: '~11%',
      tag: 'ACTIVE LEVER',
      color: C.fast,
      detail: 'Short natural-language strings labelling each ~50-step action chunk ("pick up the sponge"). Removing this collapses generalization in ablations.'
    }
  ];

  const TAG_COLORS = {
    'ACTIVE LEVER':    C.trained,
    'SUPPORT':         C.frozen,
    'NOT SIGNIFICANT': C.gradStop
  };

  /* ── Layout ──────────────────────────────────────────────── */
  const barX = 60, barY = 110, barH = 64, barW = W - 120;
  let hover = -1;
  let rafPending = false;

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

  /* normalize percentages to 100 (in case they don't sum exactly) */
  const total = SLICES.reduce((a, s) => a + s.pct, 0);
  let xacc = barX;
  const sliceRects = SLICES.map((s, i) => {
    const w = (s.pct / total) * barW;
    const r = { x: xacc, y: barY, w, h: barH, idx: i };
    xacc += w;
    return r;
  });

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    // Title strip
    ctx.fillStyle = C.inkMuted;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TRAINING BATCH — schematic shares', barX, 60);
    ctx.fillStyle = C.inkDim;
    ctx.font = 'italic 12px "Source Serif 4", serif';
    ctx.fillText('(precise ratios are not published; ranges from π₀.5 paper §3)', barX + 250, 60);

    // Bar
    SLICES.forEach((s, i) => {
      const r = sliceRects[i];
      ctx.fillStyle = s.color;
      ctx.globalAlpha = (hover === -1 || hover === i) ? 1 : 0.45;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // pct number inside slice if room
      if (r.w > 50) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0c0d10';
        ctx.font = '700 13px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.range, r.x + r.w / 2, r.y + r.h / 2);
      }
    });
    ctx.globalAlpha = 1;
    // Outer outline
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Slice labels + ablation tags below
    SLICES.forEach((s, i) => {
      const r = sliceRects[i];
      const cx = r.x + r.w / 2;
      // tick
      ctx.strokeStyle = C.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, r.y + r.h);
      ctx.lineTo(cx, r.y + r.h + 14);
      ctx.stroke();
      // name
      ctx.fillStyle = C.ink;
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // wrap name into two lines if needed
      const words = s.name.split(' ');
      if (s.name.length > 14 && words.length > 1) {
        const half = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, half).join(' '), cx, r.y + r.h + 18);
        ctx.fillText(words.slice(half).join(' '), cx, r.y + r.h + 33);
      } else {
        ctx.fillText(s.name, cx, r.y + r.h + 22);
      }
      // chip
      const chipColor = TAG_COLORS[s.tag];
      const chipW = ctx.measureText(s.tag).width + 16;
      const chipH = 18;
      const chipX = cx - chipW / 2;
      const chipY = r.y + r.h + 56;
      ctx.fillStyle = hexA(chipColor, 0.16);
      ctx.strokeStyle = chipColor;
      ctx.lineWidth = 1.2;
      roundRect(ctx, chipX, chipY, chipW, chipH, 9);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = chipColor;
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.tag, cx, chipY + chipH / 2 + 0.5);
    });

    // Hover detail panel
    if (hover !== -1) {
      const s = SLICES[hover];
      const r = sliceRects[hover];
      const dpx = barX, dpy = 280, dpw = barW, dph = 60;
      ctx.fillStyle = '#1f1f24';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.4;
      roundRect(ctx, dpx, dpy, dpw, dph, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(s.name + ' — ' + s.range + ' · ' + s.tag, dpx + 14, dpy + 10);
      ctx.fillStyle = C.ink;
      ctx.font = '400 12.5px "Source Serif 4", serif';
      wrapText(s.detail, dpx + 14, dpy + 30, dpw - 28, 16);
    } else {
      ctx.fillStyle = C.inkDim;
      ctx.font = 'italic 12.5px "Source Serif 4", serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hover any slice for the source dataset and what the paper\'s ablation says about it.', W / 2, 295);
    }
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', lineY = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      const m = ctx.measureText(test).width;
      if (m > maxW && i > 0) {
        ctx.fillText(line, x, lineY);
        line = words[i] + ' ';
        lineY += lh;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, lineY);
  }

  function hexA(hex, a) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  render();

  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (W / rect.width);
    const y = (ev.clientY - rect.top) * (H / rect.height);
    let h = -1;
    for (let i = 0; i < sliceRects.length; i++) {
      const r = sliceRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { h = i; break; }
    }
    if (h !== hover) { hover = h; render(); }
  });
  canvas.addEventListener('mouseleave', () => { if (hover !== -1) { hover = -1; render(); } });
})();
