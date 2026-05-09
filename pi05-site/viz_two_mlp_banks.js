/* viz_two_mlp_banks.js
   Concept taught: π₀.5 is one transformer with TWO parallel MLP weight banks.
   Attention is shared. A token's type (text/image vs action) deterministically routes
   it through the VLM bank (purple) or the action-expert bank (amber).
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-banks');
  if (!canvas) return;
  const W = 1100, H = 560;
  const ctx = setupHiDPICanvas(canvas, W, H);

  let mode = 'joint';   // 'text' | 'action' | 'joint'
  let phase = 0;        // 0..1 animation phase for token flow
  let playing = true;
  let lastT = 0;

  const SAMPLES = {
    text: { tokens: [
      { kind: 'text', label: 'pick' },
      { kind: 'text', label: 'up' },
      { kind: 'text', label: 'the' },
      { kind: 'text', label: 'spo' },
      { kind: 'text', label: 'nge' },
    ] },
    action: { tokens: [
      { kind: 'action', label: 'a₀' },
      { kind: 'action', label: 'a₁' },
      { kind: 'action', label: 'a₂' },
      { kind: 'action', label: 'a₃' },
      { kind: 'action', label: 'a₄' },
    ] },
    joint: { tokens: [
      { kind: 'image', label: 'p₀' },
      { kind: 'image', label: 'p₁' },
      { kind: 'image', label: 'p₂' },
      { kind: 'text',  label: 'pick' },
      { kind: 'text',  label: 'up' },
      { kind: 'action', label: 'a₀' },
      { kind: 'action', label: 'a₁' },
      { kind: 'action', label: 'a₂' },
    ] },
  };

  // ─── layout: input row top, attention box middle, two MLP banks below, output row bottom
  const TOP_Y = 90;
  const ATTN_Y = 200;
  const ATTN_H = 80;
  const SPLIT_Y = 320;
  const BANK_Y = 360;
  const BANK_H = 100;
  const OUT_Y = 500;

  function tokenColour(kind) {
    if (kind === 'action') return C.action;
    return C.vlm;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // title
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText('ONE TRANSFORMER BLOCK', 30, 30);
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px Inter';
    const sub = mode === 'text'
      ? 'a text-only sequence routes entirely through the VLM bank'
      : mode === 'action'
        ? 'an action-only sequence routes entirely through the action-expert bank'
        : 'a mixed sequence routes by token type — attention is shared, MLPs are not';
    ctx.fillText(sub, 30, 50);

    const tokens = SAMPLES[mode].tokens;
    const N = tokens.length;
    const tokenW = Math.min(80, (W - 240) / N);
    const tokensX0 = (W - tokenW * N) / 2;

    // ─── input row
    drawTokenRow(tokens, tokensX0, TOP_Y, tokenW, 'INPUT TOKENS', false);

    // arrows down to shared attention
    for (let i = 0; i < N; i++) {
      const x = tokensX0 + i * tokenW + tokenW / 2;
      arrow(x, TOP_Y + 32, x, ATTN_Y - 4, '#5a5d65');
    }

    // ─── shared attention box
    const attnX0 = tokensX0 - 20;
    const attnW = tokenW * N + 40;
    ctx.fillStyle = 'rgba(155,150,138,0.10)';
    ctx.strokeStyle = C.inkMuted;
    ctx.lineWidth = 1.5;
    roundRect(ctx, attnX0, ATTN_Y, attnW, ATTN_H, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = '600 16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('SHARED ATTENTION', attnX0 + attnW / 2, ATTN_Y + 32);
    ctx.font = 'italic 13px Source Serif 4';
    ctx.fillStyle = C.inkMuted;
    ctx.fillText('queries see all keys allowed by the prefix-LM mask', attnX0 + attnW / 2, ATTN_Y + 54);
    ctx.textAlign = 'left';

    // ─── routing fork
    for (let i = 0; i < N; i++) {
      const x = tokensX0 + i * tokenW + tokenW / 2;
      const goesAction = tokens[i].kind === 'action';
      const colour = goesAction ? C.action : C.vlm;
      // line down from attention
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, ATTN_Y + ATTN_H);
      // diagonal toward correct bank
      const targetX = goesAction ? W * 0.72 : W * 0.28;
      ctx.lineTo(x, SPLIT_Y);
      ctx.lineTo(targetX + (i - (N - 1) / 2) * 12, SPLIT_Y + 18);
      ctx.lineTo(targetX + (i - (N - 1) / 2) * 12, BANK_Y - 4);
      ctx.stroke();
      arrowHead(targetX + (i - (N - 1) / 2) * 12, BANK_Y - 4, 0, 1, colour);
    }

    // ─── two MLP banks
    drawMLPBank(W * 0.28 - 130, BANK_Y, 260, BANK_H, 'VLM   MLP   bank', C.vlm,
      mode !== 'action');
    drawMLPBank(W * 0.72 - 130, BANK_Y, 260, BANK_H, 'ACTION   MLP   bank', C.action,
      mode !== 'text');

    // ─── flow back up to output row
    for (let i = 0; i < N; i++) {
      const x = tokensX0 + i * tokenW + tokenW / 2;
      const goesAction = tokens[i].kind === 'action';
      const colour = goesAction ? C.action : C.vlm;
      const sourceX = goesAction ? W * 0.72 : W * 0.28;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sourceX + (i - (N - 1) / 2) * 12, BANK_Y + BANK_H);
      ctx.lineTo(sourceX + (i - (N - 1) / 2) * 12, BANK_Y + BANK_H + 16);
      ctx.lineTo(x, OUT_Y - 4);
      ctx.stroke();
      arrowHead(x, OUT_Y - 4, 0, 1, colour);
    }

    drawTokenRow(tokens, tokensX0, OUT_Y, tokenW, 'OUTPUT TOKENS', true);

    // animated dots (one per token) tracing input → attention → bank → output
    if (playing) {
      for (let i = 0; i < N; i++) {
        const x = tokensX0 + i * tokenW + tokenW / 2;
        const goesAction = tokens[i].kind === 'action';
        const colour = goesAction ? C.action : C.vlm;
        const targetX = goesAction ? W * 0.72 : W * 0.28;
        const off = (i / N) * 0.4;
        const p = (phase + off) % 1;
        let px = x, py = TOP_Y + 32;
        if (p < 0.18) {
          const tt = p / 0.18;
          py = TOP_Y + 32 + tt * (ATTN_Y - TOP_Y - 32);
        } else if (p < 0.32) {
          const tt = (p - 0.18) / 0.14;
          py = ATTN_Y + tt * ATTN_H;
        } else if (p < 0.5) {
          const tt = (p - 0.32) / 0.18;
          px = lerp(x, targetX + (i - (N - 1) / 2) * 12, tt);
          py = ATTN_Y + ATTN_H + tt * (BANK_Y - ATTN_Y - ATTN_H);
        } else if (p < 0.68) {
          const tt = (p - 0.5) / 0.18;
          px = targetX + (i - (N - 1) / 2) * 12;
          py = BANK_Y + tt * BANK_H;
        } else {
          const tt = (p - 0.68) / 0.32;
          px = lerp(targetX + (i - (N - 1) / 2) * 12, x, tt);
          py = BANK_Y + BANK_H + tt * (OUT_Y - BANK_Y - BANK_H);
        }
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawTokenRow(tokens, x0, y, tokenW, title, output) {
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText(title, x0, y - 8);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const c = tokenColour(t.kind);
      ctx.fillStyle = output ? c : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x0 + i * tokenW + 6, y, tokenW - 12, 32, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = output ? '#1a1c20' : C.ink;
      ctx.font = '600 13px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(t.label, x0 + i * tokenW + tokenW / 2, y + 21);
      // tiny kind badge
      ctx.font = '9px JetBrains Mono';
      ctx.fillStyle = output ? 'rgba(0,0,0,0.5)' : C.inkDim;
      ctx.fillText(t.kind, x0 + i * tokenW + tokenW / 2, y + 32 + 10);
      ctx.textAlign = 'left';
    }
  }

  function drawMLPBank(x, y, w, h, title, colour, active) {
    const alpha = active ? 1 : 0.25;
    ctx.fillStyle = active ? `rgba(180,140,255,0.08)` : `rgba(120,120,120,0.04)`;
    if (colour === C.action) ctx.fillStyle = active ? `rgba(255,168,77,0.12)` : `rgba(120,120,120,0.04)`;
    ctx.strokeStyle = active ? colour : C.rule;
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill(); ctx.stroke();

    // weight tile pattern: a small grid of cells for "matrix"
    const cols = 16, rows = 5;
    const cellW = (w - 24) / cols, cellH = (h - 50) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = Math.abs(Math.sin(r * 1.3 + c * 0.55 + (colour === C.action ? 1 : 0)));
        ctx.fillStyle = active
          ? colourize(colour, 0.18 + 0.55 * v)
          : `rgba(120,120,120,0.10)`;
        ctx.fillRect(x + 12 + c * cellW, y + 14 + r * cellH, cellW - 1, cellH - 1);
      }
    }

    ctx.fillStyle = active ? colour : C.inkDim;
    ctx.font = '600 13px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), x + w / 2, y + h - 10);
    ctx.textAlign = 'left';
    // numbers strip placed below the bank box (above is busy with routing arrows)
    ctx.font = '10px JetBrains Mono';
    ctx.fillStyle = active ? C.inkMuted : C.inkDim;
    ctx.textAlign = 'center';
    if (colour === C.vlm) {
      ctx.fillText('width 2048 → 16384 → 2048', x + w / 2, y + h + 16);
    } else {
      ctx.fillText('width 1024 → 4096 → 1024', x + w / 2, y + h + 16);
    }
    ctx.textAlign = 'left';
  }

  function colourize(hex, a) {
    if (hex === C.vlm) return `rgba(180,140,255,${a})`;
    if (hex === C.action) return `rgba(255,168,77,${a})`;
    return `rgba(155,150,138,${a})`;
  }
  function arrow(x0, y0, x1, y1, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    arrowHead(x1, y1, (x1 - x0), (y1 - y0), col);
  }
  function arrowHead(x, y, dx, dy, col) {
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * 6 - uy * 4, y - uy * 6 + ux * 4);
    ctx.lineTo(x - ux * 6 + uy * 4, y - uy * 6 - ux * 4);
    ctx.closePath();
    ctx.fill();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  // ─── animation
  function tick(now) {
    if (!playing) return;
    if (!lastT) lastT = now;
    const dt = (now - lastT) / 1000;
    lastT = now;
    phase = (phase + dt * 0.18) % 1;
    draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ─── interactions
  document.querySelectorAll('[data-banks-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.banksMode;
      document.querySelectorAll('[data-banks-mode]').forEach((x) =>
        x.classList.toggle('active', x === b));
      draw();
    });
  });

  draw();
})();
