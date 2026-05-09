/* viz_generalization_gap.js
   Concept taught: a model trained in lab kitchens degrades when it walks into a
   real, unseen home — and the size of that drop is *driven* by which data
   ingredients were in the recipe. Toggling cross-embodiment and subtask-language
   off collapses the unseen-home bar; toggling web VQA off does almost nothing.
   The viz makes the ablation table tactile: pull a lever, watch the bar move.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-generalization-gap');
  if (!canvas) return;
  const W = 1100, H = 480;
  const ctx = setupHiDPICanvas(canvas, W, H);

  /* Levers — each contributes a multiplicative effect to the unseen-home rate.
     Numbers are illustrative of π₀.5 §5 ablation directions, NOT exact paper values. */
  const LEVERS = [
    { id: 'xemb',     label: 'cross-embodiment data', dropTo: 0.18, active: true,
      detail: 'Per π₀.5 §5: removing cross-embodiment slice drops OOD success substantially.' },
    { id: 'subtask',  label: 'subtask language',      dropTo: 0.22, active: true,
      detail: 'Per π₀.5 §5: removing the ~11% subtask-language annotations is the largest single drop.' },
    { id: 'webvqa',   label: 'web VQA / OCR',         dropTo: 0.92, active: true,
      detail: 'Per π₀.5 §5: web data ablation is *not* statistically significant on main tasks.' }
  ];

  // Baseline rates (illustrative)
  const LAB_RATE_FULL = 0.85;
  const HOME_RATE_FULL = 0.50;

  function activeRates() {
    let mult = 1;
    LEVERS.forEach((l) => { if (!l.active) mult *= l.dropTo; });
    return {
      lab: LAB_RATE_FULL,                          // lab is unaffected by these levers
      home: HOME_RATE_FULL * mult                  // unseen home is multiplicatively scaled
    };
  }

  /* Animation state */
  let displayHome = HOME_RATE_FULL;
  let displayLab = LAB_RATE_FULL;
  let raf = null;

  /* ── Layout ──────────────────────────────────────────────── */
  const sceneTop = 60;
  const sceneH = 220;
  const leftScene = { x: 60,  y: sceneTop, w: (W - 180) / 2, h: sceneH };
  const rightScene = { x: leftScene.x + leftScene.w + 60, y: sceneTop, w: leftScene.w, h: sceneH };

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

  /* Tiny "kitchen" schematic — clean lab vs cluttered home. */
  function drawScene(scene, kind) {
    ctx.save();
    // frame
    ctx.fillStyle = '#1a1c20';
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 1.2;
    roundRect(ctx, scene.x, scene.y, scene.w, scene.h, 6);
    ctx.fill(); ctx.stroke();

    // floor / counter line
    const counterY = scene.y + scene.h * 0.62;
    ctx.strokeStyle = C.frozen;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(scene.x + 16, counterY); ctx.lineTo(scene.x + scene.w - 16, counterY); ctx.stroke();

    // Window / lighting hint (top of scene)
    if (kind === 'home') {
      // novel lighting: warm cone from the right
      const grad = ctx.createLinearGradient(scene.x, scene.y, scene.x + scene.w, scene.y + sceneH * 0.5);
      grad.addColorStop(0, 'rgba(255, 200, 120, 0.0)');
      grad.addColorStop(1, 'rgba(255, 200, 120, 0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(scene.x + 8, scene.y + 8, scene.w - 16, sceneH * 0.55);
    }

    // Objects on counter — 3 items per scene
    const items = kind === 'lab'
      ? [
          { x: 0.20, w: 22, h: 26, color: C.j[2], shape: 'rect',  label: 'mug' },
          { x: 0.45, w: 30, h: 14, color: C.j[5], shape: 'rect',  label: 'sponge' },
          { x: 0.72, w: 18, h: 28, color: C.j[6], shape: 'rect',  label: 'bottle' }
        ]
      : [
          { x: 0.18, w: 28, h: 14, color: C.j[3], shape: 'rect',  label: 'glass plate' },
          { x: 0.40, w: 22, h: 30, color: C.j[0], shape: 'rect',  label: 'tumbler' },
          { x: 0.58, w: 26, h: 26, color: C.j[4], shape: 'circle', label: 'novel object' },
          { x: 0.80, w: 14, h: 14, color: C.j[1], shape: 'rect',  label: 'utensil' }
        ];
    for (const it of items) {
      const ox = scene.x + 16 + it.x * (scene.w - 32);
      const oy = counterY - it.h;
      ctx.fillStyle = it.color;
      ctx.globalAlpha = kind === 'home' ? 0.85 : 1;
      if (it.shape === 'circle') {
        ctx.beginPath(); ctx.arc(ox, oy + it.h / 2, it.w / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(ox - it.w / 2, oy, it.w, it.h);
      }
      ctx.globalAlpha = 1;
    }

    // Robot icon (gripper hovering)
    const rx = scene.x + scene.w * 0.5, ry = scene.y + 30;
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + 22);
    ctx.stroke();
    // gripper jaws
    ctx.beginPath();
    ctx.moveTo(rx - 8, ry + 22); ctx.lineTo(rx - 8, ry + 30);
    ctx.moveTo(rx + 8, ry + 22); ctx.lineTo(rx + 8, ry + 30);
    ctx.stroke();

    // Scene label
    ctx.fillStyle = kind === 'lab' ? C.flow : C.fast;
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(kind === 'lab' ? 'TRAINING DISTRIBUTION' : 'UNSEEN HOME (test)', scene.x + 12, scene.y + 18);
    ctx.fillStyle = C.ink;
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText(kind === 'lab' ? 'lab kitchen' : '3 unseen homes', scene.x + 12, scene.y + 36);

    // success rate bar above the scene
    const rate = kind === 'lab' ? displayLab : displayHome;
    const barX = scene.x + 12, barY = scene.y + scene.h - 36, barW = scene.w - 24, barH = 18;
    ctx.fillStyle = '#0c0d10';
    roundRect(ctx, barX, barY, barW, barH, 4); ctx.fill();
    const fillW = barW * rate;
    const fillColor = kind === 'lab' ? C.trained : (rate > 0.45 ? C.flow : (rate > 0.2 ? C.action : C.gradStop));
    ctx.fillStyle = fillColor;
    roundRect(ctx, barX, barY, fillW, barH, 4); ctx.fill();
    ctx.strokeStyle = C.ruleStrong;
    ctx.lineWidth = 1;
    roundRect(ctx, barX, barY, barW, barH, 4); ctx.stroke();
    // rate readout
    ctx.fillStyle = C.inkStrong;
    ctx.font = '700 12px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('success: ' + Math.round(rate * 100) + '%', barX + barW, barY - 6);

    ctx.restore();
  }

  function drawArrow() {
    // big arrow between scenes
    const ax = leftScene.x + leftScene.w + 6;
    const ay = leftScene.y + sceneH / 2;
    ctx.fillStyle = C.inkDim;
    ctx.strokeStyle = C.inkDim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax + 36, ay); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax + 36, ay); ctx.lineTo(ax + 28, ay - 6); ctx.lineTo(ax + 28, ay + 6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.inkMuted;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('deploy', ax + 18, ay - 12);
  }

  function drawLevers() {
    ctx.save();
    const y0 = 320;
    ctx.fillStyle = C.inkMuted;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TOGGLE A DATA INGREDIENT TO ABLATE IT', 60, y0);
    ctx.restore();
  }

  function drawCaption() {
    // The "honest scope" caption
    ctx.fillStyle = C.gradStop;
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CAVEAT', 60, H - 70);
    ctx.fillStyle = C.ink;
    ctx.font = 'italic 13px "Source Serif 4", serif';
    const txt = '3 homes evaluated in the paper. Penn GRASP independent eval reports 0% on novel glass and unseen backgrounds; prompt rewording can swing the same task 0% → 100%.';
    wrapText(txt, 60, H - 50, W - 120, 18);
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', lineY = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && i > 0) {
        ctx.fillText(line, x, lineY);
        line = words[i] + ' ';
        lineY += lh;
      } else line = test;
    }
    ctx.fillText(line, x, lineY);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    drawScene(leftScene, 'lab');
    drawScene(rightScene, 'home');
    drawArrow();
    drawLevers();
    drawCaption();
  }

  function tick() {
    const target = activeRates();
    const dh = target.home - displayHome;
    const dl = target.lab - displayLab;
    if (Math.abs(dh) > 0.001 || Math.abs(dl) > 0.001) {
      displayHome += dh * 0.18;
      displayLab += dl * 0.18;
      render();
      raf = requestAnimationFrame(tick);
    } else {
      displayHome = target.home;
      displayLab = target.lab;
      render();
      raf = null;
    }
  }

  render();

  /* Wire toggles */
  document.querySelectorAll('[data-gen-lever]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-gen-lever');
      const lever = LEVERS.find((l) => l.id === id);
      if (!lever) return;
      lever.active = !lever.active;
      btn.classList.toggle('active', lever.active);
      // also reflect in label / state
      btn.setAttribute('aria-pressed', String(lever.active));
      const note = document.getElementById('gen-note');
      if (note) {
        note.textContent = lever.active
          ? 'including ' + lever.label + ' — ' + lever.detail
          : 'WITHOUT ' + lever.label + ' — ' + lever.detail;
      }
      if (!raf) tick();
    });
  });
})();
