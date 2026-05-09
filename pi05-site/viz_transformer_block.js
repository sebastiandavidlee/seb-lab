/* viz_transformer_block.js
   Concept taught: a transformer block = norm → multi-head attention → +residual →
   norm → feed-forward → +residual. A token "flows" through this block, lighting up
   each component. Stack 18 such blocks → PaliGemma backbone.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-block');
  if (!canvas) return;
  const W = 900, H = 500;
  const ctx = setupHiDPICanvas(canvas, W, H);

  // ─── Block layout: a horizontal pipeline with sublayer boxes branching off
  //     a "residual stream" running across the middle.
  const STEPS = [
    { id: 'in',   label: 'input',         kind: 'edge'   },
    { id: 'n1',   label: 'norm',          kind: 'sub'    },
    { id: 'attn', label: 'multi-head\nattention', kind: 'sub' },
    { id: 'r1',   label: '+ residual',    kind: 'add'    },
    { id: 'n2',   label: 'norm',          kind: 'sub'    },
    { id: 'ffn',  label: 'feed-forward\n(MLP)',  kind: 'sub' },
    { id: 'r2',   label: '+ residual',    kind: 'add'    },
    { id: 'out',  label: 'output',        kind: 'edge'   },
  ];

  // Step indices for animation
  let progress = 0;        // 0..STEPS.length-1 (fractional)
  let playing = false;
  let lastT = 0;

  function stepX(i) {
    const left = 90, right = W - 80;
    return left + (right - left) * (i / (STEPS.length - 1));
  }
  const RAIL_Y = H / 2 + 30;
  const SUB_Y  = H / 2 - 90;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ── title strip
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter';
    ctx.fillText('ONE TRANSFORMER BLOCK', 60, 36);

    // ── residual stream rail
    ctx.strokeStyle = C.inkMuted;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(stepX(0), RAIL_Y);
    ctx.lineTo(stepX(STEPS.length - 1), RAIL_Y);
    ctx.stroke();
    ctx.font = '11px Inter';
    ctx.fillStyle = C.inkDim;
    ctx.fillText('residual stream', stepX(0) - 16, RAIL_Y + 32);

    // ── draw sublayer branches for n1+attn and n2+ffn
    drawBranch(1, 2, 'attention sublayer'); // norm + attn
    drawBranch(4, 5, 'feed-forward sublayer'); // norm + ffn

    // ── add nodes
    drawAddNode(stepX(3), RAIL_Y);
    drawAddNode(stepX(6), RAIL_Y);

    // ── step labels under sublayer boxes
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (s.kind === 'edge') {
        const x = stepX(i);
        ctx.fillStyle = C.ink;
        ctx.font = '600 13px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(s.label, x, RAIL_Y - 12);
        ctx.textAlign = 'left';
      }
    }

    // ── glowing token marker at current progress
    const idxF = clamp(progress, 0, STEPS.length - 1);
    const idx = Math.floor(idxF);
    const frac = idxF - idx;
    const tx = lerp(stepX(idx), stepX(idx + 1) || stepX(idx), frac);

    // active sublayer halo
    if (idx === 1 || idx === 2) highlightSublayer(1, 2);
    if (idx === 4 || idx === 5) highlightSublayer(4, 5);

    // token marker
    ctx.fillStyle = C.vlm;
    ctx.beginPath();
    ctx.arc(tx, RAIL_Y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.data;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, RAIL_Y, 11, 0, Math.PI * 2);
    ctx.stroke();

    // current step caption above
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px Inter';
    ctx.textAlign = 'center';
    const captions = [
      'token enters the block',
      'normalise activations',
      'mix with all other tokens (attention)',
      'add the original input back (residual)',
      'normalise again',
      'per-token 2-layer MLP — most params live here',
      'add residual again',
      'token leaves; next block sees this',
    ];
    ctx.fillText(captions[idx] || '', W / 2, 80);
    ctx.textAlign = 'left';

    // ── stack hint
    ctx.fillStyle = C.inkDim;
    ctx.font = 'italic 12px Source Serif 4';
    ctx.fillText('… stack 18 of these blocks → PaliGemma backbone (Gemma-2B language model).', 60, H - 40);
  }

  function drawBranch(iStart, iEnd, kind) {
    const x0 = stepX(iStart);
    const x1 = stepX(iEnd);
    const xMid = (x0 + x1) / 2;
    const xRail0 = stepX(iStart - 0.4);
    const xRail1 = stepX(iEnd + 0.6);
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 1;

    // up from rail to branch
    ctx.beginPath();
    ctx.moveTo(xRail0, RAIL_Y);
    ctx.lineTo(xRail0, SUB_Y + 40);
    ctx.lineTo(x0 - 10, SUB_Y + 40);
    ctx.stroke();

    // down from branch to rail (joining the +)
    ctx.beginPath();
    ctx.moveTo(x1 + 10, SUB_Y + 40);
    ctx.lineTo(xRail1, SUB_Y + 40);
    ctx.lineTo(xRail1, RAIL_Y);
    ctx.stroke();

    // boxes for each sublayer
    drawSubBox(stepX(iStart), SUB_Y, STEPS[iStart].label, false);
    drawSubBox(stepX(iEnd),   SUB_Y, STEPS[iEnd].label, true);
  }

  let highlights = new Set();
  function highlightSublayer(iStart, iEnd) {
    drawSubBox(stepX(iStart), SUB_Y, STEPS[iStart].label, false, true);
    drawSubBox(stepX(iEnd),   SUB_Y, STEPS[iEnd].label, true,  true);
  }

  function drawSubBox(x, y, label, big, active) {
    const w = big ? 130 : 70;
    const h = big ? 70 : 60;
    ctx.fillStyle = active ? 'rgba(255,216,102,0.16)' : 'rgba(180,140,255,0.10)';
    ctx.strokeStyle = active ? C.data : C.vlm;
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, x - w / 2, y, w, h, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = active ? C.data : C.ink;
    ctx.font = (big ? '600 13px ' : '500 12px ') + 'Inter';
    ctx.textAlign = 'center';
    const lines = label.split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + 26 + i * 16 + (lines.length === 1 ? 8 : 0));
    }
    ctx.textAlign = 'left';
  }

  function drawAddNode(x, y) {
    ctx.fillStyle = C.bgFig;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('+', x, y + 5);
    ctx.textAlign = 'left';
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

  // ─── animation ───────────────────────────────────────────────────────
  function tick(t) {
    if (!playing) return;
    if (!lastT) lastT = t;
    const dt = (t - lastT) / 1000;
    lastT = t;
    progress += dt * 1.0; // full block in ~7s
    if (progress >= STEPS.length - 1) {
      progress = STEPS.length - 1;
      playing = false;
    }
    draw();
    if (playing) requestAnimationFrame(tick);
  }

  document.getElementById('block-step').addEventListener('click', () => {
    progress = Math.min(STEPS.length - 1, Math.floor(progress) + 1);
    draw();
  });
  document.getElementById('block-play').addEventListener('click', (e) => {
    if (progress >= STEPS.length - 1) progress = 0;
    playing = true;
    lastT = 0;
    requestAnimationFrame(tick);
  });
  document.getElementById('block-reset').addEventListener('click', () => {
    progress = 0; playing = false; draw();
  });

  draw();
})();
