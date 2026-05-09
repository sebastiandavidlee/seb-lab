/* KI1 — Knowledge Insulation: where gradients flow (page 4 climax).
 *
 * CRITICAL CONTENT NOTE
 * ---------------------
 * This viz corrects the common misreading that "KI freezes the VLM".
 * In π₀.5 + KI, the VLM does TRAIN — it sees language data and a FAST-CE
 * auxiliary cross-entropy head. What's stop-gradient'd is the FLOW-MATCHING
 * gradient coming out of the action expert: it's *detached* at the boundary
 * so the action loss can never corrupt the VLM's language priors.
 *
 * The viz makes this concrete by showing four modes — pretrain π₀, finetune
 * π₀, KI π₀.5 train, inference — each with the correct gradient arrows.
 * In KI mode you can see:
 *   • VLM trained-lime (it IS learning)
 *   • action expert + flow head trained-lime
 *   • action-expert→VLM gradient arrow ENDS at a red ‖ stop-gradient bar
 *   • a separate yellow dashed FAST-CE auxiliary loss arrow flows back into VLM
 *
 * Exports: window.Viz_knowledge_insulation_gradients = { init(rootEl) }
 */
(function () {
  'use strict';

  var COLORS = {
    vlm:      '#6a3d9a',
    expert:   '#ff8c1a',
    flow:     '#1abc9c',
    state:    '#2a5aa8',
    frozen:   '#6c7a89',
    trained:  '#7ee787',
    arrowFwd: '#444',
    arrowGrad:'#2a5aa8',  /* gradient arrows = blue dashed */
    arrowAux: '#f5b800',  /* FAST-CE auxiliary = yellow dashed */
    stop:     '#c0392b',
    ink:      '#1a1a1a',
    muted:    '#555',
    border:   '#d0d0d0'
  };

  /** Same block layout as D1 (so reader's spatial memory transfers). */
  var BLOCKS_BASE = [
    { id: 'image', x: 30,  y: 60,  w: 130, h: 56, title: 'Image',         sub: '224×224 RGB' },
    { id: 'text',  x: 30,  y: 134, w: 130, h: 56, title: 'Text prompt',    sub: '"pick up the red cube"' },
    { id: 'paligemma', x: 230, y: 80,  w: 200, h: 120, title: 'PaliGemma', sub: 'VLM, ~3B' },
    { id: 'state',     x: 30,  y: 240, w: 130, h: 56,  title: 'Robot state', sub: 'q_t ∈ ℝ^7' },
    { id: 'state_enc', x: 230, y: 240, w: 90,  h: 56,  title: 'state enc',   sub: 'MLP' },
    { id: 'expert',    x: 470, y: 130, w: 200, h: 120, title: 'Action expert', sub: '~300M' },
    { id: 'flow',      x: 720, y: 140, w: 160, h: 100, title: 'Flow head',     sub: 'OT-CFM' },
    { id: 'action',    x: 920, y: 140, w: 200, h: 100, title: 'a_{t:t+H}',     sub: 'action chunk' },
    { id: 'fast_head', x: 470, y: 30,  w: 200, h: 70,  title: 'FAST-CE head',  sub: 'aux discrete-token loss' }
  ];

  /**
   * Mode-specific block training state and arrows.
   * gradState: 'frozen' | 'trained' | 'inactive'
   *   inactive = greyed (e.g. fast_head only relevant in KI training)
   */
  var MODES = {
    pretrain: {
      label: 'pretrain π₀',
      desc: 'Stage where π₀ is trained from scratch on robotics data. Whole network learns end-to-end; flow-matching gradient flows through action expert into VLM. No FAST-CE aux head.',
      states: {
        image: 'input', text: 'input', state: 'input',
        paligemma: 'trained', state_enc: 'trained',
        expert: 'trained', flow: 'trained',
        action: 'output', fast_head: 'inactive'
      },
      forward: ['image→paligemma', 'text→paligemma', 'state→state_enc', 'state_enc→expert',
                'paligemma→expert', 'expert→flow', 'flow→action'],
      grad: ['expert→paligemma', 'flow→expert', 'expert→state_enc', 'paligemma→image_break'],
      stopGrad: [],
      auxLoss: null
    },
    finetune: {
      label: 'finetune π₀',
      desc: 'Domain finetune. Same end-to-end gradient path as pretrain — flow-matching loss propagates into the VLM. This is exactly the regime KI is designed to *avoid*: the action loss can corrupt language priors.',
      states: {
        image: 'input', text: 'input', state: 'input',
        paligemma: 'trained', state_enc: 'trained',
        expert: 'trained', flow: 'trained',
        action: 'output', fast_head: 'inactive'
      },
      forward: ['image→paligemma', 'text→paligemma', 'state→state_enc', 'state_enc→expert',
                'paligemma→expert', 'expert→flow', 'flow→action'],
      grad: ['expert→paligemma', 'flow→expert', 'expert→state_enc'],
      stopGrad: [],
      auxLoss: null
    },
    ki_train: {
      label: 'KI π₀.5 train',
      desc: 'Knowledge Insulation. The VLM still TRAINS — but only via (a) language / web-data losses and (b) a FAST-CE auxiliary discrete-token loss on action data. The flow-matching gradient from the action expert is *detached* at the VLM boundary (red ‖ stop-gradient). So action loss cannot corrupt language priors, while the VLM still adapts via the safe aux head.',
      states: {
        image: 'input', text: 'input', state: 'input',
        paligemma: 'trained', state_enc: 'trained',
        expert: 'trained', flow: 'trained',
        action: 'output', fast_head: 'trained'
      },
      forward: ['image→paligemma', 'text→paligemma', 'state→state_enc', 'state_enc→expert',
                'paligemma→expert', 'expert→flow', 'flow→action',
                'paligemma→fast_head'],
      grad: ['flow→expert', 'expert→state_enc'],
      stopGrad: ['expert→paligemma'],   /* renders with red ‖ */
      auxLoss: 'fast_head→paligemma'    /* yellow dashed feedback */
    },
    inference: {
      label: 'inference',
      desc: 'No gradients anywhere. All weights fixed. Forward pass only: image+text → VLM → action expert (with state) → flow head iteratively denoises noise into a_{t:t+H}.',
      states: {
        image: 'input', text: 'input', state: 'input',
        paligemma: 'frozen', state_enc: 'frozen',
        expert: 'frozen', flow: 'frozen',
        action: 'output', fast_head: 'inactive'
      },
      forward: ['image→paligemma', 'text→paligemma', 'state→state_enc', 'state_enc→expert',
                'paligemma→expert', 'expert→flow', 'flow→action'],
      grad: [],
      stopGrad: [],
      auxLoss: null
    }
  };

  function blockById(id) {
    for (var i = 0; i < BLOCKS_BASE.length; i++) if (BLOCKS_BASE[i].id === id) return BLOCKS_BASE[i];
    return null;
  }

  function svg(tag, attrs, children) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
    if (children) for (var i = 0; i < children.length; i++) if (children[i]) el.appendChild(children[i]);
    return el;
  }

  function rightAnchor(b) { return { x: b.x + b.w, y: b.y + b.h / 2 }; }
  function leftAnchor(b)  { return { x: b.x,        y: b.y + b.h / 2 }; }
  function bottomAnchor(b){ return { x: b.x + b.w/2, y: b.y + b.h }; }
  function topAnchor(b)   { return { x: b.x + b.w/2, y: b.y }; }

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

  /** Parse "from→to" edge. */
  function parseEdge(s) {
    var p = s.split('→');
    return { from: p[0], to: p[1] };
  }

  function blockFill(blk, gradState, modeKey) {
    if (gradState === 'frozen')   return { fill: '#e9eef2', stroke: COLORS.frozen };
    if (gradState === 'trained')  return { fill: '#e6f9d8', stroke: '#4caf50' };
    if (gradState === 'inactive') return { fill: '#f3f3f3', stroke: '#bbb' };
    if (gradState === 'input')    return { fill: '#fafafa', stroke: '#999' };
    if (gradState === 'output')   return { fill: '#ffffff', stroke: '#666' };
    return { fill: '#fff', stroke: '#888' };
  }

  function initKIGradients(rootEl) {
    rootEl.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'viz-header';
    header.innerHTML =
      '<h3 class="viz-title">Knowledge Insulation: where gradients actually flow</h3>' +
      '<p class="viz-purpose">' +
        'Toggle between pretrain π₀ / finetune π₀ / KI π₀.5 train / inference. ' +
        'Solid arrows = forward pass. <span style="color:' + COLORS.arrowGrad + '">Blue dashed</span> = ∂L<sub>flow</sub>/∂θ. ' +
        '<span style="color:' + COLORS.arrowAux + '">Yellow dashed</span> = ∂L<sub>FAST-CE aux</sub>/∂θ. ' +
        '<span style="color:' + COLORS.stop + '">Red ‖</span> = stop-gradient.' +
      '</p>' +
      '<p style="background:#fff8e1;border-left:3px solid #f5b800;padding:8px 10px;font-size:12.5px;color:#3a2d00;margin:6px 0 0;line-height:1.45">' +
        '<b>Important:</b> KI does <b>not</b> freeze the VLM. The VLM trains — via language data and the FAST-CE auxiliary head. ' +
        'What KI <em>blocks</em> is the flow-matching gradient from the action expert reaching the VLM. ' +
        'That detach is the entire mechanism: action loss can\'t corrupt language priors, while the VLM still adapts safely.' +
      '</p>';
    rootEl.appendChild(header);

    // Mode toggle
    var modeBar = document.createElement('div');
    modeBar.style.cssText =
      'display:flex;gap:6px;margin:10px 0 12px;flex-wrap:wrap';
    var modeKeys = ['pretrain', 'finetune', 'ki_train', 'inference'];
    modeKeys.forEach(function (k) {
      var btn = document.createElement('button');
      btn.dataset.mode = k;
      btn.textContent = MODES[k].label;
      btn.className = 'js-mode-btn';
      btn.style.cssText =
        'padding:7px 12px;border:1px solid ' + COLORS.border + ';background:#fff;color:#222;' +
        'cursor:pointer;border-radius:4px;font:600 12px -apple-system, sans-serif';
      modeBar.appendChild(btn);
    });
    rootEl.appendChild(modeBar);

    var body = document.createElement('div');
    body.className = 'viz-body';
    body.style.cssText =
      'position:relative;background:#fafafa;border:1px solid ' + COLORS.border + ';border-radius:6px;padding:12px;';
    rootEl.appendChild(body);

    var W = 1180, H = 360;
    var s = svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      height: H,
      style: 'display:block;font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif;'
    });
    body.appendChild(s);

    // Defs: arrow markers (forward, gradient, aux)
    var defs = svg('defs');
    function marker(id, color) {
      var m = svg('marker', {
        id: id, viewBox: '0 0 10 10', refX: 8, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'
      });
      m.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
      return m;
    }
    defs.appendChild(marker('ki-arrow-fwd',  COLORS.arrowFwd));
    defs.appendChild(marker('ki-arrow-grad', COLORS.arrowGrad));
    defs.appendChild(marker('ki-arrow-aux',  COLORS.arrowAux));
    s.appendChild(defs);

    // Mode description panel
    var descPanel = document.createElement('div');
    descPanel.style.cssText =
      'margin-top:10px;background:#fff;border:1px solid ' + COLORS.border + ';border-radius:4px;' +
      'padding:10px 12px;font-size:12.5px;color:#222;line-height:1.5;min-height:60px';
    body.appendChild(descPanel);

    // tooltip
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

    // Citation pill
    var cite = document.createElement('div');
    cite.style.cssText =
      'position:absolute;right:12px;bottom:8px;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px;color:#888;';
    cite.textContent = 'π₀.5 paper · Knowledge Insulation';
    body.appendChild(cite);

    var state = { mode: 'ki_train' };

    /** Build a path string with a perpendicular "stop-gradient bar" near the end. */
    function gradPath(p0, p1, withStopBar) {
      var midX = (p0.x + p1.x) / 2;
      var midY = (p0.y + p1.y) / 2;
      // gentle bezier
      var path = 'M ' + p0.x + ' ' + p0.y +
                 ' Q ' + midX + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
      return path;
    }

    function drawStopBar(parent, p0, p1) {
      // Draw a "‖" perpendicular to the line at ~75% toward p1 (visible just before
      // the gradient arrow would cross into the VLM).
      var t = 0.78;
      var cx = p0.x + (p1.x - p0.x) * t;
      var cy = p0.y + (p1.y - p0.y) * t;
      var dx = p1.x - p0.x, dy = p1.y - p0.y;
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-3) return;
      var nx = -dy / L, ny = dx / L;
      var arm = 9;
      // two short parallel strokes (the "‖")
      function bar(off) {
        return svg('line', {
          x1: cx + nx * arm + dx / L * off,
          y1: cy + ny * arm + dy / L * off,
          x2: cx - nx * arm + dx / L * off,
          y2: cy - ny * arm + dy / L * off,
          stroke: COLORS.stop,
          'stroke-width': '2.5',
          'stroke-linecap': 'round'
        });
      }
      parent.appendChild(bar(-3));
      parent.appendChild(bar(3));
      // tiny label
      var lab = svg('text', {
        x: cx + nx * (arm + 14),
        y: cy + ny * (arm + 14),
        'font-size': '10',
        'font-family': 'JetBrains Mono,SF Mono,monospace',
        fill: COLORS.stop,
        'font-weight': '600',
        'text-anchor': 'middle'
      });
      lab.textContent = 'stop-grad';
      parent.appendChild(lab);
    }

    function render() {
      // clear
      while (s.lastChild) s.removeChild(s.lastChild);
      s.appendChild(defs);

      var mode = MODES[state.mode];
      descPanel.innerHTML = '<b>' + mode.label + '</b> — ' + mode.desc;

      // Forward arrows first
      mode.forward.forEach(function (eStr) {
        var ed = parseEdge(eStr);
        var fb = blockById(ed.from), tb = blockById(ed.to);
        if (!fb || !tb) return;
        var pts = chooseAnchors(fb, tb);
        var p0 = pts[0], p1 = pts[1];
        var midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
        var path = 'M ' + p0.x + ' ' + p0.y +
                   ' Q ' + midX + ' ' + p0.y + ', ' + midX + ' ' + midY +
                   ' T ' + p1.x + ' ' + p1.y;
        var line = svg('path', {
          d: path,
          fill: 'none',
          stroke: COLORS.arrowFwd,
          'stroke-width': '1.6',
          'marker-end': 'url(#ki-arrow-fwd)'
        });
        s.appendChild(line);
      });

      // Stop-grad arrows (drawn but truncated by ‖ visually)
      (mode.stopGrad || []).forEach(function (eStr) {
        var ed = parseEdge(eStr);
        var fb = blockById(ed.from), tb = blockById(ed.to);
        if (!fb || !tb) return;
        var pts = chooseAnchors(fb, tb);
        // gradient flows REVERSE direction (to → from in graph terms)
        // but arrow direction visually goes from the action-expert side back toward VLM
        var p0 = pts[0], p1 = pts[1];
        // Make the gradient line a LITTLE shorter so it stops before crossing the bar
        var t = 0.74;
        var endX = p0.x + (p1.x - p0.x) * t;
        var endY = p0.y + (p1.y - p0.y) * t;
        var line = svg('path', {
          d: 'M ' + p0.x + ' ' + p0.y + ' L ' + endX + ' ' + endY,
          fill: 'none',
          stroke: COLORS.arrowGrad,
          'stroke-width': '1.8',
          'stroke-dasharray': '5,4',
          opacity: 0.85
        });
        s.appendChild(line);
        drawStopBar(s, p0, p1);
      });

      // Active gradient arrows
      (mode.grad || []).forEach(function (eStr) {
        var ed = parseEdge(eStr);
        var fb = blockById(ed.from), tb = blockById(ed.to);
        if (!fb || !tb) return;
        var pts = chooseAnchors(fb, tb);
        var p0 = pts[0], p1 = pts[1];
        // Offset gradient arrows perpendicular so they don't sit on top of forward arrows.
        var dx = p1.x - p0.x, dy = p1.y - p0.y;
        var L = Math.sqrt(dx*dx + dy*dy);
        var nx = -dy / L, ny = dx / L;
        var off = 14;
        var p0o = { x: p0.x + nx * off, y: p0.y + ny * off };
        var p1o = { x: p1.x + nx * off, y: p1.y + ny * off };
        var midX = (p0o.x + p1o.x) / 2, midY = (p0o.y + p1o.y) / 2;
        var path = 'M ' + p0o.x + ' ' + p0o.y +
                   ' Q ' + midX + ' ' + p0o.y + ', ' + midX + ' ' + midY +
                   ' T ' + p1o.x + ' ' + p1o.y;
        var line = svg('path', {
          d: path,
          fill: 'none',
          stroke: COLORS.arrowGrad,
          'stroke-width': '1.8',
          'stroke-dasharray': '5,4',
          'marker-end': 'url(#ki-arrow-grad)',
          opacity: 0.9
        });
        s.appendChild(line);
        // tiny label
        var lab = svg('text', {
          x: midX + nx * 4, y: midY + ny * 4 - 4,
          'text-anchor': 'middle',
          'font-size': '10',
          'font-family': 'JetBrains Mono,SF Mono,monospace',
          fill: COLORS.arrowGrad
        });
        lab.textContent = '∂L_flow';
        s.appendChild(lab);
      });

      // Aux loss arrow (FAST-CE → VLM)
      if (mode.auxLoss) {
        var ed = parseEdge(mode.auxLoss);
        var fb = blockById(ed.from), tb = blockById(ed.to);
        if (fb && tb) {
          var pts = chooseAnchors(fb, tb);
          var p0 = pts[0], p1 = pts[1];
          var midX = (p0.x + p1.x) / 2;
          var midY = (p0.y + p1.y) / 2;
          var path = 'M ' + p0.x + ' ' + p0.y +
                     ' Q ' + midX + ' ' + midY + ', ' + p1.x + ' ' + p1.y;
          var line = svg('path', {
            d: path,
            fill: 'none',
            stroke: COLORS.arrowAux,
            'stroke-width': '2',
            'stroke-dasharray': '5,4',
            'marker-end': 'url(#ki-arrow-aux)'
          });
          s.appendChild(line);
          var lab = svg('text', {
            x: midX + 8, y: midY - 4,
            'text-anchor': 'start',
            'font-size': '11',
            'font-family': 'JetBrains Mono,SF Mono,monospace',
            'font-weight': '600',
            fill: '#a07f00'
          });
          lab.textContent = '∂L_FAST-CE';
          s.appendChild(lab);
        }
      }

      // Blocks (drawn over arrows)
      BLOCKS_BASE.forEach(function (blk) {
        var st = mode.states[blk.id] || 'inactive';
        var fillSpec = blockFill(blk, st, state.mode);
        var dim = (st === 'inactive') ? 0.45 : 1;

        var g = svg('g', {
          'data-block-id': blk.id,
          opacity: dim,
          style: 'cursor:default'
        });

        var rect = svg('rect', {
          x: blk.x, y: blk.y, width: blk.w, height: blk.h,
          rx: 6, ry: 6,
          fill: fillSpec.fill,
          stroke: fillSpec.stroke,
          'stroke-width': '1.8'
        });
        g.appendChild(rect);

        // training-state badge
        if (st === 'trained' || st === 'frozen') {
          var badgeColor = st === 'trained' ? COLORS.trained : COLORS.frozen;
          var badgeFill  = st === 'trained' ? '#e6f9d8'      : '#e9eef2';
          var badgeText  = st === 'trained' ? 'training'     : 'frozen';
          var bw = 60, bh = 14;
          var bx = blk.x + blk.w - bw - 4, by = blk.y + 4;
          var brect = svg('rect', {
            x: bx, y: by, width: bw, height: bh,
            rx: 3, ry: 3,
            fill: badgeFill, stroke: badgeColor, 'stroke-width': '1'
          });
          g.appendChild(brect);
          var bt = svg('text', {
            x: bx + bw / 2, y: by + bh / 2 + 1,
            'text-anchor': 'middle',
            'font-size': '9.5',
            'font-family': 'JetBrains Mono,SF Mono,monospace',
            'font-weight': '600',
            'dominant-baseline': 'middle',
            fill: '#333'
          });
          bt.textContent = badgeText;
          g.appendChild(bt);
        }

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

        // Hover tooltip
        g.addEventListener('mouseenter', function () {
          rect.setAttribute('stroke-width', '2.6');
        });
        g.addEventListener('mouseleave', function () {
          rect.setAttribute('stroke-width', '1.8');
          tip.style.opacity = '0';
        });
        g.addEventListener('mousemove', function (ev) {
          var rect2 = body.getBoundingClientRect();
          var x = ev.clientX - rect2.left + 12;
          var y = ev.clientY - rect2.top + 12;
          if (x + 280 > rect2.width) x = rect2.width - 290;
          var msg = blk.title + ' — ';
          if (st === 'trained') msg += 'currently training (weights updating).';
          else if (st === 'frozen') msg += 'weights fixed; activations still flow forward.';
          else if (st === 'inactive') msg += 'not used in this mode.';
          else if (st === 'input') msg += 'observation input.';
          else if (st === 'output') msg += 'predicted output.';
          tip.innerHTML = '<div style="font-weight:600;color:' + fillSpec.stroke + '">' + blk.title + '</div>' +
                          '<div>' + msg + '</div>';
          tip.style.left = x + 'px';
          tip.style.top = y + 'px';
          tip.style.opacity = '1';
        });

        s.appendChild(g);
      });

      // Legend strip (bottom of SVG, inside it for layout consistency)
      var legY = H - 18;
      var legG = svg('g');
      function legendChip(x, y, color, label, dashed) {
        var glg = svg('g');
        if (dashed) {
          var ln = svg('line', {
            x1: x, y1: y + 4, x2: x + 18, y2: y + 4,
            stroke: color, 'stroke-width': '2', 'stroke-dasharray': '4,3'
          });
          glg.appendChild(ln);
        } else {
          var rc = svg('rect', { x: x, y: y, width: 14, height: 8, fill: color, rx: 2 });
          glg.appendChild(rc);
        }
        var tx = svg('text', {
          x: x + 22, y: y + 7,
          'font-size': '11',
          'fill': COLORS.muted
        });
        tx.textContent = label;
        glg.appendChild(tx);
        return glg;
      }
      legG.appendChild(legendChip(40,  legY, COLORS.trained,   'training', false));
      legG.appendChild(legendChip(140, legY, COLORS.frozen,    'frozen',   false));
      legG.appendChild(legendChip(220, legY, COLORS.arrowFwd,  'forward',  false));
      legG.appendChild(legendChip(300, legY, COLORS.arrowGrad, '∂L_flow grad', true));
      legG.appendChild(legendChip(420, legY, COLORS.arrowAux,  '∂L_FAST-CE aux', true));
      legG.appendChild(legendChip(560, legY, COLORS.stop,      'stop-grad ‖', false));
      s.appendChild(legG);

      // mode buttons highlight
      rootEl.querySelectorAll('.js-mode-btn').forEach(function (b) {
        var on = b.dataset.mode === state.mode;
        b.style.background = on ? '#1a1d27' : '#fff';
        b.style.color = on ? '#e6e6e6' : '#222';
        b.style.borderColor = on ? '#1a1d27' : COLORS.border;
      });
    }

    // wire mode buttons
    rootEl.querySelectorAll('.js-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.dataset.mode;
        render();
      });
    });

    render();
  }

  window.Viz_knowledge_insulation_gradients = { init: initKIGradients };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('viz-knowledge_insulation_gradients');
      if (el) window.Viz_knowledge_insulation_gradients.init(el);
    });
  }
})();
