/* viz_ki_gradients.js
   Concept taught: Knowledge Insulation routes two different gradients along two
   different paths. The flow-matching loss has time-dependent variance and would
   corrupt PaliGemma's language priors if it reached the VLM, so it is detached
   at the boundary. A separate FAST cross-entropy auxiliary loss IS allowed to
   reach the VLM, because categorical cross-entropy is well-behaved. The reader
   should leave with one image: red gradient hits a wall; teal gradient passes.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-ki-gradients');
  if (!canvas) return;
  const W = 1100, H = 600;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const state = { mode: 'ki' }; // 'naive' | 'ki'
  let t = 0;            // animation phase 0..1
  let raf = null;

  /* ── Block layout ─────────────────────────────────────────── */
  // Coordinates picked so the diagram reads left-to-right:
  //   inputs  →  VLM  →  action expert  →  flow head  →  action chunk
  // and top-to-bottom for the FAST aux head.
  const B = {
    img:    { x: 40,   y: 110, w: 130, h: 50,  label: 'image',         sub: '224×224 RGB' },
    txt:    { x: 40,   y: 175, w: 130, h: 50,  label: 'text prompt',   sub: '"pick up sponge"' },
    web:    { x: 40,   y: 30,  w: 130, h: 50,  label: 'web text',      sub: 'language data' },
    vlm:    { x: 235,  y: 130, w: 230, h: 130, label: 'VLM (PaliGemma)', sub: '~3.0 B params' },
    fast:   { x: 580,  y: 30,  w: 200, h: 70,  label: 'FAST aux head', sub: 'cross-entropy on ~40 tokens' },
    expert: { x: 530,  y: 165, w: 200, h: 100, label: 'action expert', sub: '~0.3 B params' },
    flow:   { x: 800,  y: 175, w: 130, h: 80,  label: 'flow head',     sub: 'velocity field $v_\\theta$' },
    chunk:  { x: 960,  y: 175, w: 110, h: 80,  label: 'action chunk',  sub: '50 × 18' },
    // Loss labels (drawn as little chips)
    Lflow:  { x: 970,  y: 295, w: 100, h: 26,  label: '𝓛_flow' },
    Lfast:  { x: 615,  y: 116, w: 130, h: 22,  label: '𝓛_FAST (CE)' },
    Llm:    { x: 50,   y: 88,  w: 110, h: 22,  label: '𝓛_LM (web)' }
  };

  function drawBlock(b, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.fill || C.bgFig;
    ctx.strokeStyle = opts.stroke || C.ruleStrong;
    ctx.lineWidth = opts.lineWidth || 1.6;
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.titleColor || C.inkStrong;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 9 : 0));
    if (b.sub) {
      ctx.fillStyle = opts.subColor || C.inkMuted;
      ctx.font = '500 11px JetBrains Mono, monospace';
      ctx.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + 9);
    }
    ctx.restore();
  }

  function drawLossChip(b, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    roundRect(ctx, b.x, b.y, b.w, b.h, 11);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '600 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
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

  function anchor(b, side) {
    if (side === 'l') return { x: b.x, y: b.y + b.h / 2 };
    if (side === 'r') return { x: b.x + b.w, y: b.y + b.h / 2 };
    if (side === 't') return { x: b.x + b.w / 2, y: b.y };
    return { x: b.x + b.w / 2, y: b.y + b.h }; // b
  }

  /* Forward arrow — solid muted line, single arrowhead. */
  function drawForwardArrow(p0, p1, color) {
    color = color || C.inkDim;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    // gentle quadratic for visual hierarchy
    const mx = (p0.x + p1.x) / 2;
    ctx.quadraticCurveTo(mx, p0.y, p1.x, p1.y);
    ctx.stroke();
    arrowHead(p1, Math.atan2(p1.y - p0.y, p1.x - p0.x), 7, color);
    ctx.restore();
  }

  function arrowHead(p, ang, size, color) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.55);
    ctx.lineTo(-size, size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* Animated dashed gradient path. `flow` 0..1 = how far the moving dash has
     travelled along the path. `blocked` = true means we cut off at stopFrac
     and draw the stop-bar there. */
  function drawGradientPath(pts, color, blocked, stopFrac, animPhase, label, labelPos) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    // Build polyline length
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      const L = Math.hypot(dx, dy);
      lens.push(L); total += L;
    }
    const stopLen = blocked ? total * stopFrac : total;
    // Draw the static dashed line up to stopLen
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -animPhase * 22;  // gradient-flow direction (against forward)
    ctx.beginPath();
    let drawn = 0;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const segLen = lens[i - 1];
      if (drawn + segLen <= stopLen) {
        ctx.lineTo(pts[i].x, pts[i].y);
        drawn += segLen;
      } else {
        const frac = (stopLen - drawn) / segLen;
        const ex = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac;
        const ey = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac;
        ctx.lineTo(ex, ey);
        break;
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead at end (only if not blocked — blocked path has no head, it is annihilated)
    if (!blocked) {
      const last = pts[0];
      const second = pts[1];
      // we want arrow at the START of pts[] because gradients flow opposite to forward
      const ang = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
      arrowHead(pts[0], ang, 8, color);
    }

    if (label && labelPos) {
      ctx.fillStyle = color;
      ctx.font = '600 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelPos.x, labelPos.y);
    }
    ctx.restore();
  }

  /* The big red ‖ stop-gradient bar drawn at stopFrac of the path. */
  function drawStopBar(pts, stopFrac) {
    // walk pts to find position at stopFrac
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      lens.push(L); total += L;
    }
    let target = total * stopFrac, drawn = 0;
    let cx = pts[0].x, cy = pts[0].y, ang = 0;
    for (let i = 1; i < pts.length; i++) {
      const segLen = lens[i - 1];
      if (drawn + segLen >= target) {
        const frac = (target - drawn) / segLen;
        cx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac;
        cy = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac;
        ang = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        break;
      }
      drawn += segLen;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    // perpendicular ‖ — two stout bars
    const arm = 22;
    ctx.strokeStyle = C.gradStop;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -arm); ctx.lineTo(-4, arm);
    ctx.moveTo(4, -arm); ctx.lineTo(4, arm);
    ctx.stroke();
    // backdrop "BLOCKED" tag
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.gradStop;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('stop-gradient', 0, -arm - 12);
    ctx.restore();
  }

  /* Loss bursts at the chip — small radiating rings to indicate "loss happens here". */
  function drawLossBurst(b, color, phase) {
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    const r0 = 14;
    for (let k = 0; k < 2; k++) {
      const p = ((phase + k * 0.5) % 1);
      const r = r0 + p * 18;
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ── Main render ──────────────────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);

    // Background pane
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    // Section labels
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FORWARD PASS', 40, 510);
    ctx.fillText('BACKWARD PASS (gradients)', 40, 530);
    ctx.fillStyle = C.inkDim;
    ctx.font = 'italic 12px "Source Serif 4", serif';
    ctx.fillText('— solid arrows; activations move left → right.', 175, 510);
    ctx.fillText('— animated dashes; gradients move right → left.', 220, 530);

    // Mode label
    ctx.textAlign = 'right';
    ctx.fillStyle = C.inkMuted;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const modeText = state.mode === 'ki' ? 'MODE: KI training' : 'MODE: naive end-to-end';
    ctx.fillText(modeText, W - 40, 30);

    // Inputs
    drawBlock(B.img, { fill: '#1f1f24', stroke: C.frozen, titleColor: C.ink });
    drawBlock(B.txt, { fill: '#1f1f24', stroke: C.frozen, titleColor: C.ink });
    drawBlock(B.web, { fill: '#1f1f24', stroke: C.frozen, titleColor: C.ink });

    // VLM
    drawBlock(B.vlm, { fill: hexA(C.vlm, 0.10), stroke: C.vlm, titleColor: C.inkStrong });
    // Action expert
    drawBlock(B.expert, { fill: hexA(C.action, 0.10), stroke: C.action, titleColor: C.inkStrong });
    // Flow head
    drawBlock(B.flow, { fill: hexA(C.flow, 0.08), stroke: C.flow, titleColor: C.inkStrong });
    // Action chunk
    drawBlock(B.chunk, { fill: '#1f1f24', stroke: C.action, titleColor: C.action });
    // FAST aux head — only meaningful in KI mode
    const fastDim = state.mode === 'ki' ? 1 : 0.35;
    ctx.save();
    ctx.globalAlpha = fastDim;
    drawBlock(B.fast, { fill: hexA(C.fast, 0.10), stroke: C.fast, titleColor: C.inkStrong });
    ctx.restore();

    // ── Forward arrows ─────────────────────────────────────
    drawForwardArrow(anchor(B.img, 'r'), anchor(B.vlm, 'l'), C.inkDim);
    drawForwardArrow(anchor(B.txt, 'r'), { x: B.vlm.x, y: B.vlm.y + B.vlm.h - 25 }, C.inkDim);
    drawForwardArrow(anchor(B.web, 'r'), { x: B.vlm.x, y: B.vlm.y + 18 }, C.inkDim);
    // VLM → action expert (forward features)
    drawForwardArrow(anchor(B.vlm, 'r'), anchor(B.expert, 'l'), C.vlm);
    // expert → flow head
    drawForwardArrow(anchor(B.expert, 'r'), anchor(B.flow, 'l'), C.action);
    // flow → action chunk
    drawForwardArrow(anchor(B.flow, 'r'), anchor(B.chunk, 'l'), C.flow);
    // VLM → FAST aux (training-time only)
    if (state.mode === 'ki') {
      drawForwardArrow({ x: B.vlm.x + B.vlm.w * 0.55, y: B.vlm.y },
                       { x: B.fast.x + B.fast.w * 0.4, y: B.fast.y + B.fast.h }, C.vlm);
    }

    // ── Backward (gradient) paths ──────────────────────────
    // Animation phase
    const phase = (Date.now() / 1000) % 1;

    // Loss chip: 𝓛_flow
    drawLossChip(B.Lflow, C.flow);
    drawLossBurst(B.Lflow, C.flow, phase);
    // Loss chip: 𝓛_FAST (only visible in KI)
    if (state.mode === 'ki') {
      drawLossChip(B.Lfast, C.fast);
      drawLossBurst(B.Lfast, C.fast, (phase + 0.33) % 1);
    }
    // Loss chip: 𝓛_LM (web text → VLM)
    drawLossChip(B.Llm, C.vlm);
    drawLossBurst(B.Llm, C.vlm, (phase + 0.66) % 1);

    // 1) FLOW gradient path: from L_flow chip → flow head → action expert → (then either) VLM (naive) or BLOCKED at boundary (KI)
    const flowGradPath = [
      anchor(B.Lflow, 't'),                // start at the loss chip
      { x: anchor(B.Lflow, 't').x, y: B.flow.y + B.flow.h + 10 },
      { x: B.flow.x + B.flow.w / 2, y: B.flow.y + B.flow.h / 2 },
      { x: B.expert.x + B.expert.w / 2, y: B.expert.y + B.expert.h / 2 },
      { x: B.vlm.x + B.vlm.w + 8, y: B.vlm.y + B.vlm.h / 2 },
      { x: B.vlm.x + B.vlm.w / 2, y: B.vlm.y + B.vlm.h / 2 }
    ];

    if (state.mode === 'ki') {
      // gradient flows back through flow head + expert, but stops at VLM boundary
      drawGradientPath(flowGradPath, C.gradStop, true, 0.78, phase, '∂𝓛_flow', { x: 880, y: 320 });
      drawStopBar(flowGradPath, 0.78);
    } else {
      // naive: gradient enters VLM and corrupts it
      drawGradientPath(flowGradPath, C.gradStop, false, 1, phase, '∂𝓛_flow corrupts VLM →', { x: 540, y: 320 });
      // small "warning" annotation
      ctx.fillStyle = C.gradStop;
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('time-dependent variance', B.vlm.x + B.vlm.w / 2, B.vlm.y - 10);
      ctx.fillText('spikes near t≈0, t≈1 → corrupts language priors', B.vlm.x + B.vlm.w / 2, B.vlm.y - 26);
    }

    // 2) FAST CE gradient path: from L_FAST chip → into VLM (KI mode only)
    if (state.mode === 'ki') {
      const fastGradPath = [
        anchor(B.Lfast, 'l'),
        { x: B.fast.x - 20, y: B.fast.y + B.fast.h / 2 },
        { x: B.vlm.x + B.vlm.w * 0.55, y: B.vlm.y + B.vlm.h * 0.25 }
      ];
      drawGradientPath(fastGradPath, C.fast, false, 1, (phase + 0.4) % 1,
        '∂𝓛_FAST', { x: 510, y: 95 });
    }

    // 3) Web LM gradient path: into VLM (always)
    const lmGradPath = [
      anchor(B.Llm, 'r'),
      { x: B.vlm.x - 8, y: B.vlm.y + 20 },
      { x: B.vlm.x + B.vlm.w * 0.4, y: B.vlm.y + B.vlm.h * 0.3 }
    ];
    drawGradientPath(lmGradPath, C.vlm, false, 1, (phase + 0.7) % 1, '∂𝓛_LM', { x: 200, y: 60 });

    // VLM update tag: lime "training" if it gets useful gradient, red "corrupted" if naive
    ctx.save();
    const tag = state.mode === 'ki'
      ? { text: 'training (clean)', color: C.trained }
      : { text: 'corrupted', color: C.gradStop };
    ctx.fillStyle = tag.color;
    ctx.strokeStyle = tag.color;
    ctx.lineWidth = 1;
    const tg = { x: B.vlm.x + B.vlm.w - 90, y: B.vlm.y + 6, w: 84, h: 16 };
    ctx.globalAlpha = 0.15;
    roundRect(ctx, tg.x, tg.y, tg.w, tg.h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tag.text, tg.x + tg.w / 2, tg.y + tg.h / 2 + 1);
    ctx.restore();

    // Action expert tag (always training)
    ctx.save();
    ctx.fillStyle = C.trained;
    ctx.strokeStyle = C.trained;
    ctx.globalAlpha = 0.15;
    const eg = { x: B.expert.x + B.expert.w - 90, y: B.expert.y + 6, w: 84, h: 16 };
    roundRect(ctx, eg.x, eg.y, eg.w, eg.h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = C.trained;
    ctx.fillText('training', eg.x + eg.w / 2, eg.y + eg.h / 2 + 1);
    ctx.restore();

    // Caption row underneath blocks
    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 13px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    if (state.mode === 'ki') {
      ctx.fillText(
        'Two losses, two paths. Flow gradient never reaches the VLM. FAST CE gradient does.',
        W / 2, 460
      );
    } else {
      ctx.fillText(
        'One end-to-end gradient. Flow loss reaches the VLM with high time-dependent variance.',
        W / 2, 460
      );
    }
  }

  /* small util: hex colour with alpha */
  function hexA(hex, a) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ── Animation loop ───────────────────────────────────────── */
  function loop() {
    render();
    raf = requestAnimationFrame(loop);
  }
  loop();

  /* ── Wire mode toggles ────────────────────────────────────── */
  document.querySelectorAll('[data-ki-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-ki-mode');
      document.querySelectorAll('[data-ki-mode]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
})();
