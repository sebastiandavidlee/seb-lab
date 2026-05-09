/* viz_language_vs_latent.js
   Concept taught: π₀.5 puts a *natural-language string* on the wire between
   System-2 and System-1, instead of a learned vector. The viz contrasts
   both options on the same prompt; the contrast is meant to land that
   language inherits compositional structure for free, while a learned
   latent does not.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-language-vs-latent');
  if (!canvas) return;
  const W = 900, H = 460;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const state = { mode: 'language' }; // 'language' or 'latent'

  // Fixed shared prompt
  const PROMPT = 'clean the kitchen';
  const SUBTASK = 'pick up the sponge';

  function draw() {
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    // Top: shared prompt banner
    const bannerH = 56;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(20, 16, W - 40, bannerH);
    ctx.strokeStyle = C.rule;
    ctx.strokeRect(20.5, 16.5, W - 41, bannerH - 1);
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('shared task prompt', 32, 24);
    ctx.fillStyle = C.inkStrong;
    ctx.font = '600 18px "Source Serif 4", serif';
    ctx.fillText('"' + PROMPT + '"', 32, 40);

    // Two stacked sections
    const SY = 92;
    const SH = H - SY - 24;

    if (state.mode === 'language') drawLanguagePanel(20, SY, W - 40, SH);
    else drawLatentPanel(20, SY, W - 40, SH);
  }

  function drawNode(x, y, w, h, color, label, sublabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = color;
    ctx.font = '600 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 - 8);
    if (sublabel) {
      ctx.fillStyle = C.inkMuted;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(sublabel, x + w / 2, y + h / 2 + 10);
    }
  }

  function drawArrow(x1, y1, x2, y2, color, dashed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowhead
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(ang - 0.45), y2 - 8 * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - 8 * Math.cos(ang + 0.45), y2 - 8 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function drawLanguagePanel(x, y, w, h) {
    // Title + frame
    ctx.fillStyle = C.flow;
    ctx.font = '600 13px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('language hierarchy — π₀.5', x + 4, y);

    // System-2 (VLM) at top
    const s2W = 220, s2H = 60;
    const s2X = x + (w - s2W) / 2;
    const s2Y = y + 30;
    drawNode(s2X, s2Y, s2W, s2H, C.vlm, 'System-2 · VLM', 'autoregressive language head');

    // bottleneck = literal string
    const bbY = s2Y + s2H + 32;
    ctx.fillStyle = 'rgba(94,234,212,0.10)';
    const bbX = x + (w - 320) / 2;
    ctx.fillRect(bbX, bbY, 320, 44);
    ctx.strokeStyle = C.flow;
    ctx.lineWidth = 1;
    ctx.strokeRect(bbX + 0.5, bbY + 0.5, 319, 43);
    ctx.fillStyle = C.inkStrong;
    ctx.font = '600 14px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('"' + SUBTASK + '"', bbX + 160, bbY + 22);
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('text tokens · no gradient through here', bbX + 160, bbY + 56);

    // System-1 (action expert) below
    const s1Y = bbY + 80;
    drawNode(s2X, s1Y, s2W, s2H, C.action, 'System-1 · action expert', 'flow-matches the chunk');

    // Arrows: VLM → string → action
    drawArrow(s2X + s2W / 2, s2Y + s2H + 2, bbX + 160, bbY - 2, C.vlm, false);
    drawArrow(bbX + 160, bbY + 44 + 2, s2X + s2W / 2, s1Y - 2, C.action, false);

    // Annotation pulled to right
    const annX = x + w - 200;
    const annY = y + 30;
    ctx.fillStyle = C.ink;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = [
      'compositional structure',
      'inherited from VLM\'s',
      'language head: "the red',
      'mug" + "from the counter"',
      'compose for free.',
      '',
      'interpretable: you can',
      'read what the model',
      'thinks it\'s doing.',
      '',
      'gradient does not flow',
      'through the string.'
    ];
    ctx.fillStyle = C.inkMuted;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], annX, annY + i * 16);
    }
  }

  function drawLatentPanel(x, y, w, h) {
    ctx.fillStyle = C.fast;
    ctx.font = '600 13px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('learned-vector hierarchy — alternative', x + 4, y);

    const s2W = 220, s2H = 60;
    const s2X = x + (w - s2W) / 2;
    const s2Y = y + 30;
    drawNode(s2X, s2Y, s2W, s2H, C.vlm, 'System-2', 'projection head');

    // bottleneck = vector of numbers (rendered as a row of cells)
    const bbY = s2Y + s2H + 32;
    const N = 12;
    const cellW = 22, cellH = 28;
    const totalW = N * cellW;
    const bbX = x + (w - totalW) / 2;
    for (let i = 0; i < N; i++) {
      const v = Math.sin(i * 0.7) * 0.5 + 0.5;
      const c = mixHex('#3a3c43', C.fast.replace('#', ''), v);
      ctx.fillStyle = c;
      ctx.fillRect(bbX + i * cellW + 1, bbY, cellW - 2, cellH);
    }
    ctx.strokeStyle = C.fast;
    ctx.lineWidth = 1;
    ctx.strokeRect(bbX + 0.5, bbY + 0.5, totalW - 1, cellH - 1);
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('latent z ∈ R^d · gradient flows through', bbX + totalW / 2, bbY + cellH + 8);

    // System-1
    const s1Y = bbY + cellH + 38;
    drawNode(s2X, s1Y, s2W, s2H, C.action, 'System-1 · action expert', 'flow-matches the chunk');

    // Arrows
    drawArrow(s2X + s2W / 2, s2Y + s2H + 2, bbX + totalW / 2, bbY - 2, C.vlm, false);
    drawArrow(bbX + totalW / 2, bbY + cellH + 2, s2X + s2W / 2, s1Y - 2, C.action, false);

    // Annotation
    const annX = x + w - 200;
    const annY = y + 30;
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = [
      'requires explicit training',
      'on the latent dim — no',
      'free compositionality.',
      '',
      'opaque: hard to read what',
      'the latent actually means.',
      '',
      'gradient flows through',
      '(end-to-end learnable).'
    ];
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], annX, annY + i * 16);
    }
  }

  function mixHex(a, b, t) {
    const ah = a.replace('#', ''), bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b2 = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + b2 + ')';
  }

  /* ---------- controls ---------- */
  const langBtn = document.getElementById('lvl-language');
  const latBtn = document.getElementById('lvl-latent');
  function setMode(m) {
    state.mode = m;
    if (langBtn) langBtn.classList.toggle('active', m === 'language');
    if (latBtn) latBtn.classList.toggle('active', m === 'latent');
    draw();
  }
  if (langBtn) langBtn.addEventListener('click', () => setMode('language'));
  if (latBtn) latBtn.addEventListener('click', () => setMode('latent'));

  setMode('language');
  draw();
})();
