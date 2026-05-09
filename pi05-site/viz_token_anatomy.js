/* viz_token_anatomy.js
   Concept taught: a 224x224 image becomes a 14x14 grid of patch vectors,
   a sentence becomes ~5 sub-word vectors, and both feed into ONE shared sequence.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-token-anatomy');
  if (!canvas) return;
  const W = 900, H = 500;
  const ctx = setupHiDPICanvas(canvas, W, H);

  // Schematic kitchen: simple painted regions (not a real photo, but legible as a kitchen).
  // Patch grid: 14x14 over a 224x224 region. Patches are coloured by averaging the schematic.
  const GRID = 14;
  const PATCHES = GRID * GRID;
  const TEXT_TOKENS = ['pick', 'up', 'the', 'spo', 'nge'];

  // ─── Schematic kitchen drawn into an offscreen canvas, then sampled ──────
  const off = document.createElement('canvas');
  off.width = 224; off.height = 224;
  const octx = off.getContext('2d');
  drawKitchen(octx);

  // sample average colour per patch
  const patchColours = new Array(PATCHES);
  {
    const img = octx.getImageData(0, 0, 224, 224).data;
    const sz = 224 / GRID;
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < sz; y += 2) {
          for (let x = 0; x < sz; x += 2) {
            const sx = (px * sz + x) | 0;
            const sy = (py * sz + y) | 0;
            const i = (sy * 224 + sx) * 4;
            r += img[i]; g += img[i + 1]; b += img[i + 2]; n++;
          }
        }
        r = (r / n) | 0; g = (g / n) | 0; b = (b / n) | 0;
        patchColours[py * GRID + px] = `rgb(${r},${g},${b})`;
      }
    }
  }

  let mode = 'image'; // 'image' | 'text' | 'both'
  let hoverPatch = -1;
  let hoverTextTok = -1;

  function drawKitchen(g) {
    // counter
    g.fillStyle = '#3a3026'; g.fillRect(0, 0, 224, 224);
    // wall
    g.fillStyle = '#2d3340'; g.fillRect(0, 0, 224, 110);
    // cabinets
    g.fillStyle = '#41342a'; g.fillRect(10, 30, 70, 70);
    g.fillRect(140, 30, 70, 70);
    // window
    g.fillStyle = '#5a6b7a'; g.fillRect(95, 30, 35, 60);
    g.strokeStyle = '#1a1c20'; g.lineWidth = 1;
    g.strokeRect(95, 30, 35, 60); g.beginPath();
    g.moveTo(112.5, 30); g.lineTo(112.5, 90); g.moveTo(95, 60); g.lineTo(130, 60); g.stroke();
    // sponge (yellow)
    g.fillStyle = '#e0c060'; g.fillRect(60, 130, 38, 22);
    g.fillStyle = '#b8973f'; g.fillRect(60, 144, 38, 8);
    // mug
    g.fillStyle = '#b04a3c'; g.beginPath();
    g.arc(155, 145, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#882e26'; g.fillRect(168, 138, 8, 14);
    // floor edge
    g.fillStyle = '#1f1a14'; g.fillRect(0, 200, 224, 24);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.font = '11px Inter';

    // ─── LEFT: image and patch grid ────────────────────────────────────
    const imgX = 30, imgY = 60, imgSize = 200;
    if (mode === 'image' || mode === 'both') {
      label(40, 30, 'IMAGE → PATCHES', C.inkMuted);
      // base image
      ctx.drawImage(off, imgX, imgY, imgSize, imgSize);

      // patch grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < GRID; i++) {
        const x = imgX + (i / GRID) * imgSize;
        const y = imgY + (i / GRID) * imgSize;
        ctx.beginPath(); ctx.moveTo(x, imgY); ctx.lineTo(x, imgY + imgSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(imgX, y); ctx.lineTo(imgX + imgSize, y); ctx.stroke();
      }

      // hover highlight on image
      if (hoverPatch >= 0) {
        const px = hoverPatch % GRID, py = (hoverPatch / GRID) | 0;
        const sz = imgSize / GRID;
        ctx.strokeStyle = C.vlm; ctx.lineWidth = 2;
        ctx.strokeRect(imgX + px * sz, imgY + py * sz, sz, sz);
      }

      // tiny "1 of 196" caption
      ctx.fillStyle = C.inkDim;
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('14 × 14 = 196 patches', imgX, imgY + imgSize + 18);
    }

    // ─── MIDDLE: text tokenisation ─────────────────────────────────────
    if (mode === 'text' || mode === 'both') {
      const tx = 280, ty = 60;
      label(tx, 30, 'TEXT → TOKENS', C.inkMuted);
      ctx.fillStyle = C.ink;
      ctx.font = '600 18px Source Serif 4';
      ctx.fillText('"pick up the sponge"', tx, ty + 18);

      // arrow
      ctx.strokeStyle = C.ruleStrong; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx + 60, ty + 30); ctx.lineTo(tx + 60, ty + 50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx + 56, ty + 46); ctx.lineTo(tx + 60, ty + 50); ctx.lineTo(tx + 64, ty + 46); ctx.stroke();

      // chips
      ctx.font = '13px JetBrains Mono';
      let cx = tx;
      const chipY = ty + 60;
      for (let i = 0; i < TEXT_TOKENS.length; i++) {
        const t = TEXT_TOKENS[i];
        const w = ctx.measureText(t).width + 14;
        ctx.fillStyle = hoverTextTok === i ? C.vlm : 'rgba(180,140,255,0.22)';
        ctx.strokeStyle = C.vlm; ctx.lineWidth = 1;
        roundRect(ctx, cx, chipY, w, 24, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = hoverTextTok === i ? '#1a1c20' : C.ink;
        ctx.fillText(t, cx + 7, chipY + 16);
        cx += w + 6;
      }

      // each chip → a vector (small row of squares)
      ctx.font = '10px Inter';
      ctx.fillStyle = C.inkMuted;
      ctx.fillText('each chip → one learned vector (e.g. 2048 floats)', tx, chipY + 50);
    }

    // ─── BOTTOM: combined sequence ─────────────────────────────────────
    if (mode === 'both' || mode === 'image' || mode === 'text') {
      const seqY = 320;
      ctx.fillStyle = C.inkMuted;
      ctx.font = '500 11px Inter';
      ctx.fillText('COMBINED SEQUENCE  [ image patches ]  +  [ text tokens ]', 30, seqY - 12);

      // 196 patch squares, then 5 text chips, in a single row
      const rowW = W - 60;
      const totalCells = (mode === 'text' ? 0 : PATCHES) + (mode === 'image' ? 0 : TEXT_TOKENS.length);
      const cellW = Math.min(3.4, (rowW - 80) / totalCells);
      let x = 30;
      const y = seqY;

      // image patches (only show if image or both mode)
      if (mode === 'image' || mode === 'both') {
        for (let i = 0; i < PATCHES; i++) {
          ctx.fillStyle = patchColours[i];
          ctx.fillRect(x, y, cellW, 26);
          if (hoverPatch === i) {
            ctx.strokeStyle = C.vlm; ctx.lineWidth = 1.5;
            ctx.strokeRect(x - 0.5, y - 0.5, cellW + 1, 27);
          }
          x += cellW + 0.3;
        }
      }

      // small gap then text tokens
      if (mode === 'text' || mode === 'both') {
        if (mode === 'both') x += 18;
        ctx.font = '11px JetBrains Mono';
        for (let i = 0; i < TEXT_TOKENS.length; i++) {
          const t = TEXT_TOKENS[i];
          const w = ctx.measureText(t).width + 10;
          ctx.fillStyle = hoverTextTok === i ? C.vlm : 'rgba(180,140,255,0.45)';
          ctx.strokeStyle = C.vlm; ctx.lineWidth = 1;
          roundRect(ctx, x, y - 1, w, 28, 3);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = hoverTextTok === i ? '#1a1c20' : C.ink;
          ctx.fillText(t, x + 5, y + 18);
          x += w + 3;
        }
      }

      // sequence indices
      ctx.fillStyle = C.inkDim;
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('idx 0', 30, y + 46);
      if (mode !== 'text') ctx.fillText('idx ' + (PATCHES - 1), 30 + (PATCHES - 1) * (cellW + 0.3) - 25, y + 46);
      const totalLen = (mode === 'text' ? TEXT_TOKENS.length : (mode === 'image' ? PATCHES : PATCHES + TEXT_TOKENS.length));
      ctx.fillText(`length: ${totalLen}`, W - 100, y + 46);
    }

    // ─── caption strip ─────────────────────────────────────────────────
    ctx.fillStyle = C.inkMuted;
    ctx.font = 'italic 13px Source Serif 4';
    let caption = '';
    if (mode === 'image') caption = 'A photograph becomes 196 vectors. Hover a patch.';
    else if (mode === 'text') caption = 'A sentence becomes a few sub-word vectors.';
    else caption = 'Both rows live in one sequence the transformer reads end-to-end.';
    ctx.fillText(caption, 30, H - 28);
  }

  function label(x, y, t, col) {
    ctx.fillStyle = col;
    ctx.font = '500 11px Inter';
    ctx.fillText(t.toUpperCase(), x, y);
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
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
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const y = (e.clientY - r.top) * (H / r.height);

    // image hit-test
    const imgX = 30, imgY = 60, imgSize = 200;
    let newP = -1;
    if (mode !== 'text' && x >= imgX && x <= imgX + imgSize && y >= imgY && y <= imgY + imgSize) {
      const px = Math.floor((x - imgX) / (imgSize / GRID));
      const py = Math.floor((y - imgY) / (imgSize / GRID));
      newP = py * GRID + px;
    }
    // sequence row patch hit
    const seqY = 320;
    if (newP < 0 && y >= seqY && y <= seqY + 28 && (mode === 'image' || mode === 'both')) {
      const cellW = Math.min(3.4, (W - 60 - 80) / ((mode === 'text' ? 0 : PATCHES) + (mode === 'image' ? 0 : TEXT_TOKENS.length)));
      const idx = Math.floor((x - 30) / (cellW + 0.3));
      if (idx >= 0 && idx < PATCHES) newP = idx;
    }
    if (newP !== hoverPatch) { hoverPatch = newP; draw(); }
  });
  canvas.addEventListener('mouseleave', () => { hoverPatch = -1; hoverTextTok = -1; draw(); });

  document.getElementById('ta-mode-img').addEventListener('click', (e) => setMode('image', e.currentTarget));
  document.getElementById('ta-mode-text').addEventListener('click', (e) => setMode('text', e.currentTarget));
  document.getElementById('ta-mode-both').addEventListener('click', (e) => setMode('both', e.currentTarget));

  function setMode(m, btn) {
    mode = m;
    [...document.querySelectorAll('#ta-mode-img, #ta-mode-text, #ta-mode-both')]
      .forEach((b) => b.classList.toggle('active', b === btn));
    draw();
  }

  draw();
})();
