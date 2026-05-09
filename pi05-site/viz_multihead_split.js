/* viz_multihead_split.js
   Concept taught: multi-head attention runs h independent QKV projections in parallel;
   each head can specialise (positional, syntactic, coreference, image-grounding); their
   outputs concatenate end-to-end and pass through a single output projection.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-multihead');
  if (!canvas) return;
  const W = 900, H = 520;
  const ctx = setupHiDPICanvas(canvas, W, H);

  const tokens = ['the', 'red', 'cube', 'is', 'to', 'the', 'left', 'of', 'the', 'blue', 'cube'];
  const N = tokens.length;
  const HEAD_NAMES = ['positional', 'syntactic', 'coreference', 'image-grounding'];

  // Hand-authored attention matrices per head (row = query, col = key, normalised per row).
  const heads = buildHeads();

  let mode = 'single';   // 'single' | 'all' | 'concat'
  let activeHead = 0;

  function buildHeads() {
    // 4 N×N matrices.
    const mats = [];
    // 0: positional — diagonal + sub-diagonal (each token attends to neighbours)
    {
      const M = zeros(N);
      for (let i = 0; i < N; i++) {
        const w = (j) => Math.exp(-((i - j) ** 2) / 1.4);
        let s = 0;
        for (let j = 0; j < N; j++) { M[i][j] = w(j); s += M[i][j]; }
        for (let j = 0; j < N; j++) M[i][j] /= s;
      }
      mats.push(M);
    }
    // 1: syntactic — verbs find subjects/objects
    {
      const M = zeros(N);
      const targets = {
        0: [2], 1: [2], 2: [3], 3: [2, 6], 4: [3, 6], 5: [6], 6: [3, 7],
        7: [6, 10], 8: [10], 9: [10], 10: [3, 6],
      };
      for (let i = 0; i < N; i++) {
        const ts = targets[i] || [i];
        for (const t of ts) M[i][t] = 1;
        let s = M[i].reduce((a, b) => a + b, 0);
        for (let j = 0; j < N; j++) M[i][j] = (M[i][j] / s) * 0.85 + 0.15 / N;
      }
      mats.push(M);
    }
    // 2: coreference — "red" binds to the first "cube"; "blue" to the second; the two "cube" tokens find each other.
    {
      const M = zeros(N);
      const pairs = [[1, 2], [9, 10], [2, 10], [10, 2], [1, 2], [9, 10], [0, 2], [5, 2], [8, 10]];
      for (let i = 0; i < N; i++) M[i][i] = 0.15;
      for (const [a, b] of pairs) M[a][b] = 0.7;
      for (let i = 0; i < N; i++) {
        let s = M[i].reduce((a, b) => a + b, 0) || 1;
        for (let j = 0; j < N; j++) M[i][j] = (M[i][j] / s) * 0.85 + 0.15 / N;
      }
      mats.push(M);
    }
    // 3: image-grounding — content words ("red", "cube", "blue", "left") attend back to a hypothetical
    // image-patch slot at index 0; here we'll fold that into "the" (index 0) standing in for image.
    {
      const M = zeros(N);
      for (let i = 0; i < N; i++) M[i][0] = 0.5;
      const groundedFromImage = [1, 2, 6, 9, 10];
      for (const i of groundedFromImage) M[i][0] = 0.85;
      for (let i = 0; i < N; i++) {
        let s = M[i].reduce((a, b) => a + b, 0) || 1;
        for (let j = 0; j < N; j++) M[i][j] = (M[i][j] / s) * 0.85 + 0.15 / N;
      }
      mats.push(M);
    }
    return mats;
  }
  function zeros(n) { return Array.from({ length: n }, () => Array(n).fill(0)); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    if (mode === 'single') drawSingle();
    else if (mode === 'all') drawAll();
    else drawConcat();
  }

  function drawSingle() {
    // big attention heatmap for one head
    const left = 80, top = 70, size = 320;
    label('SELECTED HEAD', 80, 36);
    drawHeatmap(left, top, size, heads[activeHead]);
    drawHeatmapAxes(left, top, size);

    // head label
    ctx.fillStyle = C.vlm;
    ctx.font = '600 18px Inter';
    ctx.fillText(`head ${activeHead}: ${HEAD_NAMES[activeHead]}`, left, top - 18);

    // legend / explainer panel right
    const explanations = [
      'Each token attends to its immediate neighbours. This head is doing word order.',
      'Each token attends to its syntactic partner. Verbs find subjects; modifiers find heads.',
      'The colour adjectives bind to their nouns; "red" → first "cube"; "blue" → second.',
      'Content words ("red", "cube", "left", "blue") look back at the image-patch slot to fetch visual evidence.',
    ];
    const px = left + size + 60, py = top;
    ctx.fillStyle = C.inkMuted; ctx.font = '500 11px Inter';
    ctx.fillText('WHAT THIS HEAD LEARNED', px, py - 18);
    ctx.fillStyle = C.ink; ctx.font = '15px Source Serif 4';
    wrap(explanations[activeHead], px, py + 8, 320, 22);

    // small QKV cartoon
    const qy = py + 130;
    ctx.fillStyle = C.inkMuted; ctx.font = '500 11px Inter';
    ctx.fillText('THIS HEAD HAS ITS OWN', px, qy);
    ctx.font = '600 13px JetBrains Mono';
    const labels = ['W_Q', 'W_K', 'W_V'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(180,140,255,${0.25 + i * 0.05})`;
      ctx.fillRect(px + i * 64, qy + 10, 56, 32);
      ctx.strokeStyle = C.vlm; ctx.lineWidth = 1;
      ctx.strokeRect(px + i * 64, qy + 10, 56, 32);
      ctx.fillStyle = C.ink;
      ctx.fillText(labels[i], px + i * 64 + 12, qy + 30);
    }
    ctx.font = 'italic 11px Source Serif 4';
    ctx.fillStyle = C.inkMuted;
    ctx.fillText('learnable matrices, ~256 dims wide', px, qy + 68);
  }

  function drawAll() {
    // 4 small heatmaps in a 2x2 grid + concat row
    label('FOUR HEADS RUN IN PARALLEL', 60, 36);
    const m = 4;
    const size = 170;
    const gap = 30;
    const xs = [60, 60 + size + gap, 60 + 2 * (size + gap), 60 + 3 * (size + gap)];
    const top = 70;
    for (let h = 0; h < m; h++) {
      const x = xs[h];
      drawHeatmap(x, top, size, heads[h]);
      drawHeatmapAxes(x, top, size);
      ctx.fillStyle = h === activeHead ? C.vlm : C.inkMuted;
      ctx.font = (h === activeHead ? '600 ' : '500 ') + '12px Inter';
      ctx.fillText(`head ${h}: ${HEAD_NAMES[h]}`, x, top - 10);
    }
    // dashed concat caption
    ctx.strokeStyle = C.ruleStrong;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(60, top + size + 26);
    ctx.lineTo(W - 60, top + size + 26);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 13px Source Serif 4';
    ctx.fillText('outputs concatenate end-to-end (next step) →', 60, top + size + 56);
  }

  function drawConcat() {
    // Show 4 thin column blocks → concat → linear → output.
    label('CONCATENATE & PROJECT', 80, 36);
    const top = 90;
    const colW = 60;
    const colH = 220;
    const gapX = 12;
    const x0 = 80;
    // 4 heads as coloured stripes; intensity from a token-summary
    for (let h = 0; h < 4; h++) {
      const x = x0 + h * (colW + gapX);
      // pattern preview: average attention each query received (just for visual)
      const M = heads[h];
      for (let i = 0; i < N; i++) {
        const v = M[i].reduce((a, b) => a + b, 0) / N + Math.random() * 0; // ~1/N
      }
      // draw vertical stripe with N rows of varying intensity per token (using row sums)
      for (let i = 0; i < N; i++) {
        const t = M[i][((i + h) | 0) % N];
        ctx.fillStyle = `rgba(180,140,255,${0.25 + t * 1.6})`;
        ctx.fillRect(x, top + i * (colH / N), colW, colH / N - 1);
      }
      ctx.strokeStyle = C.vlm; ctx.lineWidth = 1;
      ctx.strokeRect(x, top, colW, colH);
      ctx.fillStyle = C.inkMuted;
      ctx.font = '500 11px Inter';
      ctx.fillText(`head ${h}`, x, top - 8);
    }

    // bracket → "concat"
    const bX = x0 + 4 * (colW + gapX) + 6;
    const bH = colH;
    ctx.strokeStyle = C.inkMuted; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bX, top);
    ctx.lineTo(bX + 14, top);
    ctx.lineTo(bX + 14, top + bH);
    ctx.lineTo(bX, top + bH);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px Inter';
    ctx.fillText('concat', bX + 22, top + bH / 2 - 6);
    ctx.font = '11px JetBrains Mono';
    ctx.fillStyle = C.inkMuted;
    ctx.fillText('4 × head_dim → d_model', bX + 22, top + bH / 2 + 12);

    // arrow → W_O
    const ox = bX + 160;
    ctx.strokeStyle = C.ruleStrong;
    ctx.beginPath(); ctx.moveTo(bX + 130, top + bH / 2); ctx.lineTo(ox, top + bH / 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox - 6, top + bH / 2 - 4); ctx.lineTo(ox, top + bH / 2); ctx.lineTo(ox - 6, top + bH / 2 + 4); ctx.stroke();

    ctx.fillStyle = `rgba(180,140,255,0.3)`;
    ctx.fillRect(ox + 4, top + bH / 2 - 24, 80, 48);
    ctx.strokeStyle = C.vlm; ctx.lineWidth = 1; ctx.strokeRect(ox + 4, top + bH / 2 - 24, 80, 48);
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px JetBrains Mono';
    ctx.fillText('W_O', ox + 22, top + bH / 2 + 4);

    // arrow → output
    ctx.strokeStyle = C.ruleStrong;
    ctx.beginPath(); ctx.moveTo(ox + 90, top + bH / 2); ctx.lineTo(ox + 130, top + bH / 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 124, top + bH / 2 - 4); ctx.lineTo(ox + 130, top + bH / 2); ctx.lineTo(ox + 124, top + bH / 2 + 4); ctx.stroke();

    ctx.fillStyle = C.data;
    ctx.fillRect(ox + 134, top + bH / 2 - 30, 60, 60);
    ctx.fillStyle = '#1a1c20';
    ctx.font = '600 12px Inter';
    ctx.fillText('block', ox + 140, top + bH / 2 - 4);
    ctx.fillText('output', ox + 140, top + bH / 2 + 12);

    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 12px Source Serif 4';
    ctx.fillText('one shared linear projection re-mixes the channels back to width d_model.', x0, top + bH + 50);
  }

  function drawHeatmap(x, y, size, M) {
    const cell = size / N;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = M[i][j];
        ctx.fillStyle = mixVlm(v);
        ctx.fillRect(x + j * cell, y + i * cell, cell - 0.5, cell - 0.5);
      }
    }
    ctx.strokeStyle = C.ruleStrong;
    ctx.strokeRect(x, y, size, size);
  }

  function drawHeatmapAxes(x, y, size) {
    ctx.font = '9px JetBrains Mono';
    ctx.fillStyle = C.inkDim;
    const cell = size / N;
    for (let i = 0; i < N; i++) {
      ctx.fillText(tokens[i], x - 36, y + i * cell + cell / 2 + 3);
    }
    ctx.save();
    for (let j = 0; j < N; j++) {
      ctx.save();
      ctx.translate(x + j * cell + cell / 2, y + size + 4);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(tokens[j], 0, 8);
      ctx.restore();
    }
    ctx.restore();
    ctx.font = '500 10px Inter';
    ctx.fillStyle = C.inkMuted;
    ctx.fillText('query →', x - 50, y - 6);
    ctx.fillText('key →', x + size - 26, y - 6);
  }

  function mixVlm(t) {
    t = clamp(t, 0, 0.85);
    const a = 0.05 + 1.4 * t;
    return `rgba(180, 140, 255, ${a})`;
  }
  function label(t, x, y) {
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText(t, x, y);
  }
  function wrap(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w; yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // ─── interactions ────────────────────────────────────────────────────
  document.querySelectorAll('[data-mh-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.mhMode;
      document.querySelectorAll('[data-mh-mode]').forEach((x) => x.classList.toggle('active', x === b));
      draw();
    });
  });
  document.querySelectorAll('[data-mh-head]').forEach((b) => {
    b.addEventListener('click', () => {
      activeHead = parseInt(b.dataset.mhHead, 10);
      document.querySelectorAll('[data-mh-head]').forEach((x) => x.classList.toggle('active', x === b));
      if (mode !== 'single') {
        mode = 'single';
        document.querySelectorAll('[data-mh-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mhMode === 'single'));
      }
      draw();
    });
  });

  draw();
})();
