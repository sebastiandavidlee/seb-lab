/* viz_pi05_block_diagram.js
   Concept taught: the full π₀.5 architecture in one diagram.
   Image+text → VLM block (shared attention + two MLP banks) → action expert outputs
   → flow head → 50×18 action chunk → robot. A dashed-line preview of the high-level
   subtask path teases page 4.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-pi05');
  if (!canvas) return;
  const W = 1100, H = 600;
  const ctx = setupHiDPICanvas(canvas, W, H);

  // Define block layout. Each block has: id, x, y, w, h, fill, stroke, label, sublabel, tooltip.
  const blocks = [
    // INPUTS column (far left)
    { id: 'cam',  x: 30,  y: 70,  w: 140, h: 64,  c: C.vlm, label: 'camera frames', sub: '224×224 × 3 cams',
      tooltip: 'three RGB camera streams; SigLIP encodes each into ~196 patch tokens' },
    { id: 'lang', x: 30,  y: 156, w: 140, h: 64,  c: C.vlm, label: 'language prompt', sub: '"clean the kitchen"',
      tooltip: 'task-level instruction tokenised into ~5–20 sub-word tokens' },
    { id: 'state', x: 30, y: 380, w: 140, h: 64, c: C.action, label: 'robot state', sub: '18 floats: joint q',
      tooltip: 'current robot pose, padded to 18 dims so the same model drives any embodiment' },
    { id: 'noise', x: 30, y: 466, w: 140, h: 64, c: C.noise, label: 'noisy chunk', sub: 'Aᵗ_τ ∼ noise',
      tooltip: 'flow matching starts here; pure Gaussian at τ=0, becomes the action chunk by τ=1' },

    // VLM container (centre top)
    { id: 'vlm', x: 220, y: 70, w: 380, h: 240, c: C.vlm, label: 'VLM block ×18',
      sub: 'PaliGemma — SigLIP + Gemma-2B   ~3.0B params',
      tooltip: 'eighteen identical transformer blocks; image patches and text tokens flow through here, attention is shared with the action expert' },

    { id: 'attn', x: 250, y: 122, w: 320, h: 60, c: '#5a5d65', label: 'shared attention',
      sub: 'one Q·K·V product, 18 layers',
      tooltip: 'queries from any token type can read keys from any other (subject to the prefix-LM mask of page 1)',
      inset: true },

    { id: 'vlmlp', x: 250, y: 200, w: 145, h: 90, c: C.vlm, label: 'VLM   MLP',
      sub: 'width 2048',
      tooltip: 'feed-forward bank used by image + text tokens',
      inset: true },

    { id: 'aelp',  x: 425, y: 200, w: 145, h: 90, c: C.action, label: 'action MLP',
      sub: 'width 1024',
      tooltip: 'feed-forward bank used by action tokens (lives inside the VLM block diagram, just routed-to from action tokens)',
      inset: true },

    // Action expert container (centre bottom)
    { id: 'ae',  x: 220, y: 360, w: 380, h: 170, c: C.action, label: 'action expert ×18',
      sub: 'shared attention + action MLP   ~0.3B params (~10% of VLM)',
      tooltip: 'logically the same 18 transformer blocks viewed through the action MLP bank; reads VLM features through shared attention' },

    // Flow + chunk + robot (right column)
    { id: 'flow', x: 660, y: 360, w: 160, h: 100, c: C.flow, label: 'flow head',
      sub: '10 Euler steps',
      tooltip: 'integrates a learned velocity field over ten small steps to denoise the chunk; ≈73 ms on RTX 4090 (page 3)' },

    { id: 'chunk', x: 870, y: 360, w: 200, h: 100, c: C.action, label: '50 × 18 chunk',
      sub: '1 second of motion',
      tooltip: 'fifty future joint targets at 50 Hz — what the robot actually executes' },

    { id: 'subtask', x: 660, y: 70, w: 410, h: 70, c: '#3a3c43', dashed: true, label: 'subtask emit (page 4)',
      sub: '"pick up the sponge"',
      tooltip: 'every chunk boundary the VLM also emits a natural-language subtask; full reveal on page 4' },

    { id: 'robot', x: 870, y: 170, w: 200, h: 140, c: C.frozen, label: 'robot',
      sub: 'UR-style mobile manipulator',
      tooltip: 'the embodiment; 50 Hz controller consumes the chunk' },
  ];

  // Edges
  const edges = [
    ['cam',   'vlm'],
    ['lang',  'vlm'],
    ['state', 'ae'],
    ['noise', 'ae'],
    ['vlm',   'ae', { mid: 'shared attention' }],
    ['ae',    'flow'],
    ['flow',  'chunk'],
    ['chunk', 'robot'],
    ['vlm',   'subtask', { dashed: true }],
    ['subtask','robot',  { dashed: true }],
  ];

  let hoverId = null;

  function findBlock(id) { return blocks.find((b) => b.id === id); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ── title strip
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText('π₀.5 ARCHITECTURE', 30, 30);

    // edges first (so blocks paint over them)
    for (const e of edges) {
      const [a, b, opts] = e;
      drawEdge(findBlock(a), findBlock(b), opts || {});
    }

    // VLM container drawn first; then its insets
    for (const blk of blocks) {
      drawBlock(blk, hoverId === blk.id);
    }

    // ── tooltip panel at bottom for hovered block
    if (hoverId) {
      const blk = findBlock(hoverId);
      if (blk.tooltip) {
        ctx.fillStyle = C.bgFig;
        ctx.strokeStyle = C.ruleStrong;
        ctx.lineWidth = 1;
        roundRect(ctx, 30, H - 70, W - 60, 50, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = blk.c;
        ctx.font = '600 13px Inter';
        ctx.fillText(blk.label.toUpperCase(), 46, H - 50);
        ctx.fillStyle = C.ink;
        ctx.font = '14px Source Serif 4';
        ctx.fillText(blk.tooltip, 46, H - 30);
      }
    } else {
      ctx.fillStyle = C.inkDim;
      ctx.font = 'italic 12px Source Serif 4';
      ctx.fillText('hover any block for its role and parameter count', 30, H - 30);
    }
  }

  function drawBlock(b, hover) {
    const colour = b.c;
    let fill;
    if (b.dashed) fill = 'transparent';
    else if (b.id === 'vlm') fill = 'rgba(180,140,255,0.06)';
    else if (b.id === 'ae') fill = 'rgba(255,168,77,0.06)';
    else if (b.inset) fill = b.c === C.vlm ? 'rgba(180,140,255,0.18)' :
                              b.c === C.action ? 'rgba(255,168,77,0.18)' :
                              'rgba(155,150,138,0.18)';
    else if (b.id === 'noise') fill = 'rgba(74,77,86,0.45)';
    else if (b.id === 'robot') fill = 'rgba(107,114,128,0.18)';
    else if (b.id === 'flow') fill = 'rgba(94,234,212,0.16)';
    else if (b.id === 'chunk') fill = 'rgba(255,168,77,0.18)';
    else if (b.c === C.vlm) fill = 'rgba(180,140,255,0.16)';
    else if (b.c === C.action) fill = 'rgba(255,168,77,0.16)';
    else fill = 'rgba(155,150,138,0.10)';

    if (b.dashed) {
      ctx.setLineDash([5, 4]);
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = colour;
    ctx.lineWidth = hover ? 2.5 : (b.id === 'vlm' || b.id === 'ae' ? 1.5 : 1);
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    if (!b.dashed) ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // labels
    ctx.fillStyle = b.dashed ? C.inkMuted : (b.id === 'noise' ? C.ink : colour);
    if (b.id === 'state' || b.id === 'cam' || b.id === 'lang' || b.id === 'noise' || b.id === 'robot' ||
        b.id === 'chunk' || b.id === 'flow' || b.id === 'vlm' || b.id === 'ae' || b.inset || b.id === 'subtask') {
      ctx.font = '600 14px Inter';
      ctx.fillText(b.label, b.x + 12, b.y + 22);
      ctx.font = '11px JetBrains Mono';
      ctx.fillStyle = C.inkMuted;
      ctx.fillText(b.sub, b.x + 12, b.y + 40);
    }
  }

  function drawEdge(a, b, opts) {
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;

    // pick exit/enter points on edges of rectangles
    const [x0, y0, x1, y1] = edgePoints(a, b);

    if (opts.dashed) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = C.inkDim;
    } else {
      ctx.strokeStyle = '#5a5d65';
    }
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    // simple manhattan-ish: midpoint break
    if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) {
      const midX = (x0 + x1) / 2;
      ctx.lineTo(midX, y0);
      ctx.lineTo(midX, y1);
    } else {
      const midY = (y0 + y1) / 2;
      ctx.lineTo(x0, midY);
      ctx.lineTo(x1, midY);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // arrow head
    const ahCol = opts.dashed ? C.inkDim : '#5a5d65';
    const dx = (x1 - (Math.abs(x1 - x0) > Math.abs(y1 - y0) ? (x0 + x1) / 2 : x1));
    const dy = (y1 - (Math.abs(x1 - x0) > Math.abs(y1 - y0) ? y1 : (y0 + y1) / 2));
    arrowHead(x1, y1, dx === 0 ? (x1 - x0) : dx, dy === 0 ? (y1 - y0) : dy, ahCol);
  }

  function edgePoints(a, b) {
    // simple: connect right→left, left→right, bottom→top, top→bottom
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    let x0, y0, x1, y1;
    if (b.x > a.x + a.w) {
      x0 = a.x + a.w; y0 = acy;
      x1 = b.x; y1 = bcy;
    } else if (a.x > b.x + b.w) {
      x0 = a.x; y0 = acy;
      x1 = b.x + b.w; y1 = bcy;
    } else if (b.y > a.y + a.h) {
      x0 = acx; y0 = a.y + a.h;
      x1 = bcx; y1 = b.y;
    } else {
      x0 = acx; y0 = a.y;
      x1 = bcx; y1 = b.y + b.h;
    }
    return [x0, y0, x1, y1];
  }

  function arrowHead(x, y, dx, dy, col) {
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * 8 - uy * 4, y - uy * 8 + ux * 4);
    ctx.lineTo(x - ux * 8 + uy * 4, y - uy * 8 - ux * 4);
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

  // ─── interactions
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const y = (e.clientY - r.top) * (H / r.height);
    let newHover = null;
    // iterate in reverse so insets win over containers
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        newHover = b.id;
        break;
      }
    }
    if (newHover !== hoverId) { hoverId = newHover; draw(); }
  });
  canvas.addEventListener('mouseleave', () => { hoverId = null; draw(); });

  draw();
})();
