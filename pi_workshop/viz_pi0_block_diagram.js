/* D1 — π₀ block diagram (page 2 anchor).
 * Hand-laid SVG showing PaliGemma → action expert → flow head → action chunk.
 *
 * Exports: window.Viz_pi0_block_diagram = { init(rootEl) }
 *
 * No deps. If window.Shared (agent A) exposes drawArrow / colors, we use them;
 * otherwise everything is inline.
 */
(function () {
  'use strict';

  var COLORS = {
    vlm:    '#6a3d9a',  /* --vlm-purple */
    expert: '#ff8c1a',  /* --expert-amber */
    state:  '#2a5aa8',  /* --accent-blue */
    flow:   '#1abc9c',  /* --flow-teal */
    ar:     '#c0392b',  /* --ar-coral */
    arrow:  '#444',
    arrowDashed: '#888',
    ink:    '#1a1a1a',
    panel:  '#ffffff',
    border: '#d0d0d0',
    muted:  '#666'
  };

  // 7-joint palette (ColorBrewer Set1) for action chunk bar.
  // Refactor 2026-05-07: use shared palette; fall back to literal if shared.js missing.
  var JOINT_COLORS = (typeof window !== 'undefined' && window.SharedPi && window.SharedPi.JOINT_COLORS) || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3',
    '#ff7f00', '#a65628', '#f781bf'
  ];

  /** Block specs: [id, x, y, w, h, color, label, sublabel, role] */
  var BLOCKS = [
    {
      id: 'image',  x: 30,  y: 60,  w: 130, h: 56,
      fill: '#f4eaff', stroke: COLORS.vlm,
      title: 'Image', sub: '224×224 RGB',
      role: 'Camera observation. Fed into PaliGemma vision encoder as patch tokens.'
    },
    {
      id: 'text',   x: 30,  y: 134, w: 130, h: 56,
      fill: '#f4eaff', stroke: COLORS.vlm,
      title: 'Text prompt', sub: '"pick up the red cube"',
      role: 'Language instruction. Tokenized and concatenated with image tokens.'
    },
    {
      id: 'paligemma', x: 230, y: 80,  w: 200, h: 120,
      fill: '#ede0f7', stroke: COLORS.vlm,
      title: 'PaliGemma', sub: '~3B params, VLM',
      role: 'Pretrained vision-language backbone. Bidirectional attention over image+text prefix.'
    },
    {
      id: 'state',  x: 30,  y: 240, w: 130, h: 56,
      fill: '#e6effa', stroke: COLORS.state,
      title: 'Robot state', sub: 'q_t ∈ ℝ^7',
      role: 'Current proprioception (joint angles + gripper). Encoded as a single token.'
    },
    {
      id: 'state_enc', x: 230, y: 240, w: 90, h: 56,
      fill: '#dde6f3', stroke: COLORS.state,
      title: 'state enc', sub: 'MLP',
      role: 'Linear/MLP projection of q_t into the action-expert embedding dim.'
    },
    {
      id: 'expert', x: 470, y: 130, w: 200, h: 120,
      fill: '#ffe9d0', stroke: COLORS.expert,
      title: 'Action expert', sub: '~300M params',
      role: 'Small transformer. Shares the prefix-LM attention with PaliGemma but has its own weights (mixture-of-experts attention).'
    },
    {
      id: 'flow',   x: 720, y: 140, w: 160, h: 100,
      fill: '#daf3ee', stroke: COLORS.flow,
      title: 'Flow head', sub: 'OT-CFM, N≈10 ODE steps',
      role: 'Flow-matching head. Iteratively integrates a vector field f_θ(x_τ, τ) from noise → clean action chunk.'
    },
    {
      id: 'action', x: 920, y: 140, w: 200, h: 100,
      fill: '#ffffff', stroke: '#666',
      title: 'a_{t:t+H}', sub: 'action chunk, H × 7',
      role: 'Continuous action chunk: H future timesteps × 7 DoF (6 arm joints + gripper).'
    }
  ];

  /** Arrows: [from, to, kind: solid|dashed, label] */
  var ARROWS = [
    { from: 'image',     to: 'paligemma',  kind: 'solid', label: 'patch tokens' },
    { from: 'text',      to: 'paligemma',  kind: 'solid', label: 'text tokens' },
    { from: 'state',     to: 'state_enc',  kind: 'solid', label: '' },
    { from: 'state_enc', to: 'expert',     kind: 'solid', label: 'state token' },
    { from: 'paligemma', to: 'expert',     kind: 'dashed', label: 'shared attn / KV' },
    { from: 'expert',    to: 'flow',       kind: 'solid', label: 'h_action' },
    { from: 'flow',      to: 'action',     kind: 'solid', label: 'denoise' }
  ];

  function blockById(id) {
    for (var i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].id === id) return BLOCKS[i];
    return null;
  }

  function rightAnchor(b) { return { x: b.x + b.w, y: b.y + b.h / 2 }; }
  function leftAnchor(b)  { return { x: b.x,        y: b.y + b.h / 2 }; }
  function bottomAnchor(b){ return { x: b.x + b.w/2, y: b.y + b.h }; }
  function topAnchor(b)   { return { x: b.x + b.w/2, y: b.y }; }

  /** Best anchor pair: pick the side with the cleanest horizontal/vertical run. */
  function chooseAnchors(a, b) {
    var ac = { x: a.x + a.w/2, y: a.y + a.h/2 };
    var bc = { x: b.x + b.w/2, y: b.y + b.h/2 };
    var dx = bc.x - ac.x, dy = bc.y - ac.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? [rightAnchor(a), leftAnchor(b)] : [leftAnchor(a), rightAnchor(b)];
    } else {
      return dy > 0 ? [bottomAnchor(a), topAnchor(b)] : [topAnchor(a), bottomAnchor(b)];
    }
  }

  function svg(tag, attrs, children) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] != null) el.appendChild(children[i]);
      }
    }
    return el;
  }

  function initBlockDiagram(rootEl) {
    rootEl.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.className = 'viz-header';
    header.innerHTML =
      '<h3 class="viz-title">π₀ Architecture — One Page</h3>' +
      '<p class="viz-purpose">Image + text → PaliGemma VLM → action expert → flow-matching head → continuous action chunk a<sub>t:t+H</sub>. Hover any block for its role.</p>';
    rootEl.appendChild(header);

    var body = document.createElement('div');
    body.className = 'viz-body';
    body.style.position = 'relative';
    body.style.background = '#fafafa';
    body.style.border = '1px solid ' + COLORS.border;
    body.style.borderRadius = '6px';
    body.style.padding = '12px';
    rootEl.appendChild(body);

    var W = 1140, H = 360;
    var s = svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      height: H,
      style: 'display:block;font-family:-apple-system,BlinkMacSystemFont,Roboto,sans-serif;'
    });
    body.appendChild(s);

    // <defs> with arrow markers
    var defs = svg('defs');
    function marker(id, color) {
      var m = svg('marker', {
        id: id, viewBox: '0 0 10 10', refX: 8, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'
      });
      m.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
      return m;
    }
    defs.appendChild(marker('d1-arrow-solid', COLORS.arrow));
    defs.appendChild(marker('d1-arrow-dashed', COLORS.arrowDashed));
    s.appendChild(defs);

    // Tooltip element
    var tip = document.createElement('div');
    tip.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'background:#1a1a1a',
      'color:#fff',
      'padding:8px 10px',
      'border-radius:4px',
      'font-size:12px',
      'max-width:280px',
      'line-height:1.4',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'opacity:0',
      'transition:opacity 120ms ease',
      'z-index:10'
    ].join(';');
    body.appendChild(tip);

    function showTip(blk, ev) {
      tip.innerHTML =
        '<div style="font-weight:600;color:' + blk.stroke + '">' + blk.title + '</div>' +
        '<div style="color:#ccc;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px;margin-bottom:4px">' +
          blk.sub + '</div>' +
        '<div>' + blk.role + '</div>';
      var rect = body.getBoundingClientRect();
      var x = ev.clientX - rect.left + 12;
      var y = ev.clientY - rect.top + 12;
      // Don't run off the right edge
      if (x + 280 > rect.width) x = rect.width - 290;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() { tip.style.opacity = '0'; }

    // ---- draw arrows first (under blocks) ----
    ARROWS.forEach(function (a) {
      var fb = blockById(a.from), tb = blockById(a.to);
      if (!fb || !tb) return;
      var pts = chooseAnchors(fb, tb);
      var p0 = pts[0], p1 = pts[1];

      // gentle curve
      var midX = (p0.x + p1.x) / 2;
      var midY = (p0.y + p1.y) / 2;
      var path = 'M ' + p0.x + ' ' + p0.y +
                 ' Q ' + midX + ' ' + p0.y + ', ' + midX + ' ' + midY +
                 ' T ' + p1.x + ' ' + p1.y;

      var line = svg('path', {
        d: path,
        fill: 'none',
        stroke: a.kind === 'dashed' ? COLORS.arrowDashed : COLORS.arrow,
        'stroke-width': '1.6',
        'marker-end': 'url(#d1-arrow-' + (a.kind === 'dashed' ? 'dashed' : 'solid') + ')'
      });
      if (a.kind === 'dashed') line.setAttribute('stroke-dasharray', '5,4');
      s.appendChild(line);

      if (a.label) {
        var lab = svg('text', {
          x: midX, y: midY - 6,
          'text-anchor': 'middle',
          'font-size': '10.5',
          'font-family': 'JetBrains Mono,SF Mono,monospace',
          fill: COLORS.muted
        });
        lab.textContent = a.label;
        s.appendChild(lab);
      }
    });

    // ---- draw blocks ----
    BLOCKS.forEach(function (blk) {
      var g = svg('g', { 'data-block-id': blk.id, style: 'cursor:default' });

      var rect = svg('rect', {
        x: blk.x, y: blk.y, width: blk.w, height: blk.h,
        rx: 6, ry: 6,
        fill: blk.fill,
        stroke: blk.stroke,
        'stroke-width': '1.6'
      });
      g.appendChild(rect);

      var t1 = svg('text', {
        x: blk.x + blk.w / 2, y: blk.y + blk.h / 2 - 4,
        'text-anchor': 'middle',
        'font-size': '13',
        'font-weight': '600',
        fill: COLORS.ink
      });
      t1.textContent = blk.title;
      g.appendChild(t1);

      var t2 = svg('text', {
        x: blk.x + blk.w / 2, y: blk.y + blk.h / 2 + 12,
        'text-anchor': 'middle',
        'font-size': '11',
        'font-family': 'JetBrains Mono,SF Mono,monospace',
        fill: COLORS.muted
      });
      t2.textContent = blk.sub;
      g.appendChild(t2);

      // hover behaviour
      g.addEventListener('mouseenter', function () {
        rect.setAttribute('stroke-width', '2.6');
      });
      g.addEventListener('mouseleave', function () {
        rect.setAttribute('stroke-width', '1.6');
        hideTip();
      });
      g.addEventListener('mousemove', function (ev) { showTip(blk, ev); });

      s.appendChild(g);
    });

    // ---- joint-color action chunk bar inside the action block ----
    var actBlk = blockById('action');
    var barX = actBlk.x + 12;
    var barY = actBlk.y + 60;
    var barW = actBlk.w - 24;
    var barH = 22;
    var H_chunk = 16;       // schematic chunk length
    var cellW = barW / H_chunk;
    for (var t = 0; t < H_chunk; t++) {
      for (var d = 0; d < JOINT_COLORS.length; d++) {
        // colored stripes per joint, repeated horizontally
        var cx = barX + t * cellW;
        var cy = barY + (d / JOINT_COLORS.length) * barH;
        var ch = barH / JOINT_COLORS.length;
        var rect2 = svg('rect', {
          x: cx, y: cy, width: cellW, height: ch,
          fill: JOINT_COLORS[d],
          opacity: 0.35 + 0.5 * Math.abs(Math.sin(t * 0.6 + d))
        });
        s.appendChild(rect2);
      }
    }
    var barLab = svg('text', {
      x: actBlk.x + actBlk.w / 2, y: barY + barH + 14,
      'text-anchor': 'middle',
      'font-size': '10',
      'font-family': 'JetBrains Mono,SF Mono,monospace',
      fill: COLORS.muted
    });
    barLab.textContent = 'H × 7 (schematic)';
    s.appendChild(barLab);

    // ---- legend strip ----
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#555;margin-top:8px;padding:0 4px;align-items:center;';
    legend.innerHTML =
      '<span><span style="display:inline-block;width:10px;height:10px;background:' + COLORS.vlm + ';border-radius:2px;margin-right:4px"></span>VLM (PaliGemma)</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:' + COLORS.expert + ';border-radius:2px;margin-right:4px"></span>action expert</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:' + COLORS.flow + ';border-radius:2px;margin-right:4px"></span>flow head</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:' + COLORS.state + ';border-radius:2px;margin-right:4px"></span>state encoder</span>' +
      '<span style="margin-left:auto;font-style:italic">solid = forward · dashed = shared attention</span>';
    body.appendChild(legend);

    // citation pill
    var cite = document.createElement('div');
    cite.style.cssText = 'position:absolute;right:12px;bottom:8px;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px;color:#888;';
    cite.textContent = 'π₀ paper (Black et al. 2024)';
    body.appendChild(cite);
  }

  window.Viz_pi0_block_diagram = { init: initBlockDiagram };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('viz-pi0_block_diagram');
      if (el) window.Viz_pi0_block_diagram.init(el);
    });
  }
})();
