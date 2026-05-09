/* viz_attention_anatomy.js
   Concept taught: a single attention head computes a softmax-weighted average of values.
   For one chosen query token: (1) dot-product with every key, (2) softmax those scores,
   (3) take the weighted sum of values.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-attn-anatomy');
  if (!canvas) return;
  const W = 900, H = 520;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const tokens = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
  const N = tokens.length;

  // Hand-authored attention patterns per query token, so the lesson lands.
  // These are softmax-normalised target distributions for each query token.
  // (raw "scores" derived by inverting softmax under temperature 1)
  const patterns = [
    // query 0: "the" → mostly looks at "cat" (its noun)
    [0.10, 0.55, 0.15, 0.05, 0.05, 0.10],
    // query 1: "cat" → "the" (its determiner) and "sat" (its verb)
    [0.30, 0.20, 0.35, 0.05, 0.03, 0.07],
    // query 2: "sat" → "cat" (subject) and "on" (modifier)
    [0.10, 0.45, 0.10, 0.20, 0.05, 0.10],
    // query 3: "on" → "sat" + "mat"
    [0.05, 0.05, 0.30, 0.10, 0.10, 0.40],
    // query 4: "the" → "mat" (its noun)
    [0.10, 0.05, 0.05, 0.10, 0.10, 0.60],
    // query 5: "mat" → "on" + "cat"
    [0.05, 0.30, 0.05, 0.40, 0.10, 0.10],
  ];

  let activeQ = 1;        // currently selected query token (default "cat")
  let step = 3;           // 1 = QK, 2 = softmax, 3 = weight V
  let hoverK = -1;

  // Value vectors, just for color: assign each token a hue, the "value" is the colour.
  const valueColors = [
    C.j[0], C.j[1], C.j[2], C.j[3], C.j[4], C.j[5],
  ];

  // Pre-compute "raw scores" so we can show pre-softmax: softmax of these = pattern.
  // We invert: raw_i = log(p_i) + const.  We'll just use log(p)*scale + offset.
  function rawScores(p) {
    const r = p.map((x) => Math.log(x + 1e-6) * 1.4);
    const max = Math.max(...r);
    return r.map((x) => x - max + 2.5); // offset so display values are roughly 0..3
  }

  function softmax(scores) {
    const m = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - m));
    const Z = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / Z);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const tokY = 70;
    const cellW = 90;
    const totalW = cellW * N;
    const startX = (W - totalW) / 2;

    // ─── token row ────────────────────────────────────────────────
    ctx.font = '500 11px Inter';
    ctx.fillStyle = C.inkMuted;
    ctx.fillText('THE SENTENCE', startX, tokY - 22);

    for (let i = 0; i < N; i++) {
      const x = startX + i * cellW;
      const isQ = i === activeQ;
      ctx.fillStyle = isQ ? C.vlm : 'rgba(180,140,255,0.18)';
      ctx.strokeStyle = C.vlm;
      ctx.lineWidth = isQ ? 2 : 1;
      roundRect(ctx, x + 8, tokY, cellW - 16, 36, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isQ ? '#1a1c20' : C.ink;
      ctx.font = '600 16px Source Serif 4';
      ctx.textAlign = 'center';
      ctx.fillText(tokens[i], x + cellW / 2, tokY + 24);

      // small index
      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = C.inkDim;
      ctx.fillText(String(i), x + cellW / 2, tokY - 6);
    }
    ctx.textAlign = 'left';

    // arrow from query down
    const qX = startX + activeQ * cellW + cellW / 2;
    ctx.strokeStyle = C.vlm;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(qX, tokY + 36);
    ctx.lineTo(qX, tokY + 60);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.vlm;
    ctx.font = '500 11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`query: token ${activeQ} ("${tokens[activeQ]}")`, qX, tokY + 76);
    ctx.textAlign = 'left';

    // ─── step 1: raw Q·K scores ───────────────────────────────────
    const stepGap = 124;
    const s1Y = tokY + 100;
    const raw = rawScores(patterns[activeQ]);
    drawBars(s1Y, raw, '1.   Q · K   (dot products with each key)', step >= 1 ? 1 : 0.18, false);

    // step 2: softmax
    const s2Y = s1Y + stepGap;
    drawBars(s2Y, patterns[activeQ], '2.   softmax(Q · K / √d)   (probabilities, sum to 1)', step >= 2 ? 1 : 0.18, true);

    // step 3: weighted sum of V
    const s3Y = s2Y + stepGap;
    drawValueMix(s3Y, patterns[activeQ], step >= 3 ? 1 : 0.18);

    // hover key column
    if (hoverK >= 0 && step >= 1) {
      const x = startX + hoverK * cellW;
      ctx.strokeStyle = C.data;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 8, s1Y - 8, cellW - 16, s2Y + 80 - s1Y + 8);
      ctx.setLineDash([]);
    }
  }

  function drawBars(y, vals, title, alpha, normalised) {
    ctx.font = '500 11px Inter';
    ctx.fillStyle = `rgba(155, 150, 138, ${alpha})`;
    ctx.fillText(title.toUpperCase(), 60, y - 14);

    const cellW = 90;
    const totalW = cellW * N;
    const startX = (W - totalW) / 2;
    const max = normalised ? 1 : 4;

    for (let i = 0; i < N; i++) {
      const x = startX + i * cellW + 14;
      const w = cellW - 28;
      const v = Math.max(0, vals[i]);
      const barH = (v / max) * 60;

      // baseline
      ctx.strokeStyle = `rgba(74, 77, 86, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 60);
      ctx.lineTo(x + w, y + 60);
      ctx.stroke();

      // bar
      const intensity = clamp(v / max, 0, 1);
      ctx.fillStyle = mixColor(C.inkMuted, C.data, intensity, alpha);
      ctx.fillRect(x, y + 60 - barH, w, barH);

      // numeric
      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = `rgba(232,228,216, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(normalised ? v.toFixed(2) : v.toFixed(2), x + w / 2, y + 76);
      ctx.textAlign = 'left';
    }
  }

  function drawValueMix(y, weights, alpha) {
    ctx.font = '500 11px Inter';
    ctx.fillStyle = `rgba(155, 150, 138, ${alpha})`;
    ctx.fillText('3.   weighted sum of values   →   new representation of the query'.toUpperCase(), 60, y - 14);

    const cellW = 90;
    const totalW = cellW * N;
    const startX = (W - totalW) / 2;

    // each value swatch, sized by weight
    for (let i = 0; i < N; i++) {
      const x = startX + i * cellW + 14;
      const w = cellW - 28;
      // value swatch baseline
      ctx.fillStyle = withAlpha(valueColors[i], 0.4 * alpha);
      ctx.fillRect(x, y, w, 20);
      // weighted slice (height proportional to weight)
      const fillH = weights[i] * 50;
      ctx.fillStyle = withAlpha(valueColors[i], alpha);
      ctx.fillRect(x, y, w, fillH);

      // weight number
      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = `rgba(155,150,138, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(`× ${weights[i].toFixed(2)}`, x + w / 2, y + 64);
      ctx.textAlign = 'left';
    }

    // sum arrow + result swatch
    const resX = startX + totalW + 24;
    ctx.strokeStyle = `rgba(94,234,212, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + totalW + 4, y + 25);
    ctx.lineTo(resX - 6, y + 25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(resX - 12, y + 21);
    ctx.lineTo(resX - 6, y + 25);
    ctx.lineTo(resX - 12, y + 29);
    ctx.stroke();

    // composite color
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < N; i++) {
      const c = parseRGB(valueColors[i]);
      r += c[0] * weights[i];
      g += c[1] * weights[i];
      b += c[2] * weights[i];
    }
    const mixed = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
    ctx.fillStyle = mixed;
    ctx.fillRect(resX, y, 60, 50);
    ctx.strokeStyle = `rgba(232,228,216,${alpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(resX, y, 60, 50);
    ctx.font = '10px Inter';
    ctx.fillStyle = `rgba(155,150,138,${alpha})`;
    ctx.fillText('output', resX, y + 64);
  }

  function withAlpha(hex, a) {
    const c = parseRGB(hex);
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  }
  function parseRGB(s) {
    if (s.startsWith('#')) {
      const v = s.slice(1);
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    const m = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [200, 200, 200];
  }
  function mixColor(a, b, t, alpha) {
    const A = parseRGB(a), B = parseRGB(b);
    return `rgba(${lerp(A[0], B[0], t) | 0}, ${lerp(A[1], B[1], t) | 0}, ${lerp(A[2], B[2], t) | 0}, ${alpha})`;
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

  // ─── interactions ────────────────────────────────────────────────────
  document.querySelectorAll('[data-attn-token]').forEach((b) => {
    b.addEventListener('click', () => {
      activeQ = parseInt(b.dataset.attnToken, 10);
      document.querySelectorAll('[data-attn-token]').forEach((x) => x.classList.toggle('active', x === b));
      draw();
    });
  });
  document.getElementById('attn-step-1').addEventListener('click', () => { step = 1; setStepBtn(1); draw(); });
  document.getElementById('attn-step-2').addEventListener('click', () => { step = 2; setStepBtn(2); draw(); });
  document.getElementById('attn-step-3').addEventListener('click', () => { step = 3; setStepBtn(3); draw(); });
  function setStepBtn(s) {
    [1, 2, 3].forEach((i) => {
      document.getElementById('attn-step-' + i).classList.toggle('active', i === s);
    });
  }
  setStepBtn(3);

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const cellW = 90;
    const startX = (W - cellW * N) / 2;
    const idx = Math.floor((x - startX) / cellW);
    const newH = (idx >= 0 && idx < N) ? idx : -1;
    if (newH !== hoverK) { hoverK = newH; draw(); }
  });
  canvas.addEventListener('mouseleave', () => { hoverK = -1; draw(); });

  draw();
})();
