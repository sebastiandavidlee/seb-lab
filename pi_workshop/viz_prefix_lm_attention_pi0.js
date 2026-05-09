/* P2 — prefix-LM block-causal attention mask in π₀ (page 2 anchor).
 *
 * Wide N×N mask (Canvas) with three colored regions:
 *   - bidirectional block (vlm-purple) for [img + text] (the "prefix")
 *   - causal block (expert-amber) for [state + action]
 *   - cross block (action attends back into prefix, fully visible)
 *
 * Two side bars on the right showing expert assignment + token segment.
 * Hover any row → highlight attended cells (drop opacity on masked) + side-bar
 * tokens for that row.
 *
 * Exports: window.Viz_prefix_lm_attention_pi0 = { init(rootEl) }
 */
(function () {
  'use strict';

  var COLORS = {
    vlm:        '#6a3d9a',
    vlmFill:    '#b6a0d8',
    vlmFillSoft:'#d7c8ec',
    expert:     '#ff8c1a',
    expertFill: '#ffc890',
    expertFillSoft: '#ffe2c2',
    crossFill:  '#ffd9b8',  /* action ↔ prefix region */
    masked:     '#1a1a1a',
    grid:       'rgba(0,0,0,0.06)',
    ink:        '#1a1a1a',
    muted:      '#666',
    hi:         '#f5d516',  /* highlight stroke */
    img:        '#7e57c2',
    text:       '#5e35b1',
    state:      '#ef6c00',
    action:     '#f9a825',
    border:     '#d0d0d0'
  };

  /** Token segments — length, color, label, kind. */
  function defaultSegments(H) {
    return [
      { kind: 'img',    label: 'img patches', n: 16, color: COLORS.img,   expert: 'vlm' },
      { kind: 'text',   label: 'text tokens',  n: 6,  color: COLORS.text,  expert: 'vlm' },
      { kind: 'state',  label: 'state',        n: 1,  color: COLORS.state, expert: 'expert' },
      { kind: 'action', label: 'action chunk', n: H,  color: COLORS.action, expert: 'expert' }
    ];
  }

  /**
   * For each token i, compute prefixEnd index (last token index in the bidirectional
   * prefix), and total N. Build the attention rule:
   *   - if i in prefix (i ≤ prefixEnd): can attend to all prefix tokens (bidirectional),
   *                                      cannot attend to suffix (state+action).
   *   - if i in suffix (i > prefixEnd): can attend to all prefix tokens AND
   *                                      causally to suffix tokens (j ≤ i).
   *
   * This is the block-causal mask described in π₀ §3 ("block-causal attention").
   */
  function buildSegmentMeta(segments) {
    var tokens = [];
    var segIdx = [];  // segment index per token
    var prefixEnd = -1;
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      for (var k = 0; k < seg.n; k++) {
        tokens.push({ seg: s, kind: seg.kind, color: seg.color, expert: seg.expert });
        segIdx.push(s);
        if (seg.expert === 'vlm') prefixEnd = tokens.length - 1;
      }
    }
    return { tokens: tokens, prefixEnd: prefixEnd, N: tokens.length };
  }

  function attendsTo(i, j, prefixEnd) {
    // i = query, j = key. true if visible.
    var iInPrefix = i <= prefixEnd;
    var jInPrefix = j <= prefixEnd;
    if (iInPrefix) {
      // prefix tokens see prefix only (bidirectional inside prefix)
      return jInPrefix;
    } else {
      // suffix sees full prefix + causal in suffix
      if (jInPrefix) return true;
      return j <= i;
    }
  }

  function regionFor(i, j, prefixEnd) {
    var iInPrefix = i <= prefixEnd;
    var jInPrefix = j <= prefixEnd;
    if (iInPrefix && jInPrefix) return 'vlm';
    if (!iInPrefix && jInPrefix) return 'cross';
    if (!iInPrefix && !jInPrefix) return 'expert';
    return 'mask'; // prefix querying suffix
  }

  function initPrefixLM(rootEl) {
    rootEl.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'viz-header';
    header.innerHTML =
      '<h3 class="viz-title">π₀ block-causal attention mask</h3>' +
      '<p class="viz-purpose">' +
        'Image + text tokens form a <b>bidirectional prefix</b> (purple). ' +
        'State + action tokens are <b>causal</b> within themselves (amber) and can attend back to the prefix (cross). ' +
        'PaliGemma weights run on prefix rows; the action expert runs on suffix rows — same attention layer, different weights (mixture of transformer experts).' +
      '</p>';
    rootEl.appendChild(header);

    // Controls
    var controls = document.createElement('div');
    controls.className = 'viz-controls';
    controls.style.cssText = 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:8px 0 12px;font-size:12px;color:#444';
    controls.innerHTML =
      '<label style="display:flex;align-items:center;gap:6px">' +
        '<span>Action chunk H</span>' +
        '<input type="range" class="js-h-slider" min="1" max="16" step="1" value="8" style="width:160px">' +
        '<span class="js-h-val" style="font-family:JetBrains Mono,SF Mono,monospace;width:20px;text-align:right">8</span>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:6px">' +
        '<input type="checkbox" class="js-show-experts" checked>' +
        '<span>show expert assignment</span>' +
      '</label>' +
      '<span class="js-hover-info" style="color:#888;font-style:italic;flex:1;text-align:right;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px">hover a row to inspect</span>';
    rootEl.appendChild(controls);

    // Body
    var body = document.createElement('div');
    body.className = 'viz-body';
    body.style.cssText =
      'position:relative;display:flex;gap:12px;background:#fafafa;border:1px solid ' +
      COLORS.border + ';border-radius:6px;padding:12px;align-items:flex-start;';
    rootEl.appendChild(body);

    // Layout sizing
    var GRID_SIZE = 480;        // square attention grid
    var SIDE_BAR_W = 18;        // width of each side bar
    var SIDE_BAR_GAP = 6;
    var ROW_LABEL_W = 50;       // x-axis labels area on left
    var COL_LABEL_H = 26;

    // Left labels container — we'll just include them inside the canvas drawing.

    // The grid canvas:
    var canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;';
    body.appendChild(canvasWrap);

    var canvas = document.createElement('canvas');
    canvas.width  = ROW_LABEL_W + GRID_SIZE + SIDE_BAR_GAP + SIDE_BAR_W * 2 + 60;
    canvas.height = COL_LABEL_H + GRID_SIZE + 16;
    canvas.style.display = 'block';
    canvasWrap.appendChild(canvas);

    // overlay div positioned absolutely for catching mouse events
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:absolute;left:' + ROW_LABEL_W + 'px;top:' + COL_LABEL_H + 'px;' +
      'width:' + GRID_SIZE + 'px;height:' + GRID_SIZE + 'px;cursor:crosshair;';
    canvasWrap.appendChild(overlay);

    // Right column: explanatory text + region legend.
    var rightCol = document.createElement('div');
    rightCol.style.cssText =
      'flex:1;min-width:200px;display:flex;flex-direction:column;gap:10px;font-size:12px;color:#444;line-height:1.5;';
    body.appendChild(rightCol);

    rightCol.innerHTML =
      '<div>' +
        '<div style="font-weight:600;font-size:12px;margin-bottom:4px;color:' + COLORS.ink + '">Regions</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
          '<span style="display:inline-block;width:14px;height:14px;background:' + COLORS.vlmFill + ';border:1px solid ' + COLORS.vlm + '"></span>' +
          '<span><b>bidirectional prefix</b> — img + text see each other both ways</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
          '<span style="display:inline-block;width:14px;height:14px;background:' + COLORS.expertFill + ';border:1px solid ' + COLORS.expert + '"></span>' +
          '<span><b>causal suffix</b> — state + action attend causally within themselves</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
          '<span style="display:inline-block;width:14px;height:14px;background:' + COLORS.crossFill + ';border:1px solid ' + COLORS.expert + '"></span>' +
          '<span><b>cross</b> — action queries fully attend to the prefix</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
          '<span style="display:inline-block;width:14px;height:14px;background:' + COLORS.masked + '"></span>' +
          '<span><b>masked</b> — prefix never queries the suffix (causality)</span>' +
        '</div>' +
      '</div>' +
      '<div class="js-row-readout" style="border-top:1px solid #ddd;padding-top:8px;font-family:JetBrains Mono,SF Mono,monospace;font-size:11px;color:#444;min-height:64px"></div>' +
      '<div style="margin-top:auto;font-size:11px;color:#888;font-style:italic">' +
        'Hover a row in the grid: that <b>query token</b>’s allowed keys glow, others fade. The two right-edge color bars show which expert and which token segment each row/column belongs to.' +
      '</div>';

    // ---- state ----
    var state = {
      H: 8,
      showExperts: true,
      hoverRow: -1
    };

    // ---- helpers ----
    function ctxClear(ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function render() {
      var segments = defaultSegments(state.H);
      var meta = buildSegmentMeta(segments);
      var N = meta.N;
      var cell = GRID_SIZE / N;
      var ctx = canvas.getContext('2d');
      ctxClear(ctx);

      var gx0 = ROW_LABEL_W;
      var gy0 = COL_LABEL_H;

      // ---- Section labels (top, above columns) ----
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var runStart = 0;
      for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        var x0 = gx0 + runStart * cell;
        var x1 = gx0 + (runStart + seg.n) * cell;
        ctx.save();
        ctx.fillStyle = seg.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x0, gy0 - 14, x1 - x0, 4);
        ctx.restore();
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(seg.label, (x0 + x1) / 2, gy0 - 20);
        runStart += seg.n;
      }

      // ---- Cells ----
      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          var visible = attendsTo(i, j, meta.prefixEnd);
          var region = regionFor(i, j, meta.prefixEnd);
          var fill;
          if (!visible) {
            fill = COLORS.masked;
          } else if (region === 'vlm')    fill = COLORS.vlmFill;
          else if (region === 'expert')   fill = COLORS.expertFill;
          else if (region === 'cross')    fill = COLORS.crossFill;
          else fill = '#fff';

          // Apply hover-row dimming
          if (state.hoverRow >= 0 && i !== state.hoverRow) {
            ctx.fillStyle = visible ? blend(fill, '#ffffff', 0.55) : '#0c0c0c';
          } else {
            ctx.fillStyle = fill;
          }
          ctx.fillRect(gx0 + j * cell, gy0 + i * cell, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
        }
      }

      // ---- Grid lines at segment boundaries ----
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      var bX = 0;
      for (var s2 = 0; s2 < segments.length - 1; s2++) {
        bX += segments[s2].n;
        var bxPx = gx0 + bX * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(bxPx, gy0);
        ctx.lineTo(bxPx, gy0 + GRID_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx0, gy0 + bX * cell + 0.5);
        ctx.lineTo(gx0 + GRID_SIZE, gy0 + bX * cell + 0.5);
        ctx.stroke();
      }

      // ---- Outer border ----
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeRect(gx0 + 0.5, gy0 + 0.5, GRID_SIZE, GRID_SIZE);

      // ---- Hover row highlight ----
      if (state.hoverRow >= 0) {
        ctx.strokeStyle = COLORS.hi;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(
          gx0 + 0.5,
          gy0 + state.hoverRow * cell + 0.5,
          GRID_SIZE,
          Math.ceil(cell)
        );
      }

      // ---- Row + col axis labels ----
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var labelEvery = Math.max(1, Math.round(N / 16));
      for (var li = 0; li < N; li += labelEvery) {
        ctx.fillText(String(li), gx0 - 4, gy0 + (li + 0.5) * cell);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var lj = 0; lj < N; lj += labelEvery) {
        ctx.fillText(String(lj), gx0 + (lj + 0.5) * cell, gy0 + GRID_SIZE + 4);
      }

      // ---- Side bars: expert assignment + token segment ----
      var bar1X = gx0 + GRID_SIZE + SIDE_BAR_GAP;
      var bar2X = bar1X + SIDE_BAR_W + 4;
      // Expert bar
      for (var ti = 0; ti < N; ti++) {
        var tk = meta.tokens[ti];
        var expColor = tk.expert === 'vlm' ? COLORS.vlm : COLORS.expert;
        ctx.fillStyle = state.showExperts
          ? (state.hoverRow >= 0 && state.hoverRow !== ti ? blend(expColor, '#ffffff', 0.55) : expColor)
          : '#cccccc';
        ctx.fillRect(bar1X, gy0 + ti * cell, SIDE_BAR_W, Math.ceil(cell) + 0.5);
      }
      // Segment-color bar (richer info)
      for (var ti2 = 0; ti2 < N; ti2++) {
        var tk2 = meta.tokens[ti2];
        ctx.fillStyle = state.hoverRow >= 0 && state.hoverRow !== ti2
          ? blend(tk2.color, '#ffffff', 0.6)
          : tk2.color;
        ctx.fillRect(bar2X, gy0 + ti2 * cell, SIDE_BAR_W, Math.ceil(cell) + 0.5);
      }
      // Bar labels
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('expert', bar1X + SIDE_BAR_W / 2, gy0 + GRID_SIZE + 4);
      ctx.fillText('segment', bar2X + SIDE_BAR_W / 2, gy0 + GRID_SIZE + 4);

      // ---- Axis hints ----
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('keys (j) →', gx0, gy0 + GRID_SIZE + 18);
      ctx.save();
      ctx.translate(gx0 - 38, gy0 + GRID_SIZE / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('queries (i) →', 0, 0);
      ctx.restore();

      // ---- Citation pill ----
      ctx.fillStyle = '#999';
      ctx.font = '11px JetBrains Mono, SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('π₀ paper §3 — block-causal attention', canvas.width - 6, canvas.height - 4);

      // Update size of overlay (cell granularity)
      overlay.style.width  = GRID_SIZE + 'px';
      overlay.style.height = GRID_SIZE + 'px';
      overlay._N = N;
      overlay._cell = cell;
      overlay._meta = meta;
      overlay._segments = segments;
    }

    function blend(hexOrCss, target, t) {
      // crude blend: rgb-mix
      var rgb = parseColor(hexOrCss);
      var trgt = parseColor(target);
      return 'rgb(' +
        Math.round(rgb[0] * (1 - t) + trgt[0] * t) + ',' +
        Math.round(rgb[1] * (1 - t) + trgt[1] * t) + ',' +
        Math.round(rgb[2] * (1 - t) + trgt[2] * t) + ')';
    }

    function parseColor(c) {
      if (c[0] === '#') {
        var h = c.replace('#', '');
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
      }
      var m = c.match(/rgba?\(([^)]+)\)/);
      if (m) {
        var p = m[1].split(',').map(function (v) { return parseFloat(v); });
        return [p[0]|0, p[1]|0, p[2]|0];
      }
      return [128,128,128];
    }

    // ---- interactions ----
    overlay.addEventListener('mousemove', function (ev) {
      var rect = overlay.getBoundingClientRect();
      var y = ev.clientY - rect.top;
      var i = Math.floor(y / overlay._cell);
      if (i < 0) i = 0;
      if (i >= overlay._N) i = overlay._N - 1;
      if (i !== state.hoverRow) {
        state.hoverRow = i;
        render();
        updateReadout();
      }
    });
    overlay.addEventListener('mouseleave', function () {
      state.hoverRow = -1;
      render();
      updateReadout();
    });

    function updateReadout() {
      var roEl = rightCol.querySelector('.js-row-readout');
      var hoverInfo = rootEl.querySelector('.js-hover-info');
      if (state.hoverRow < 0) {
        roEl.innerHTML = '<span style="color:#888">hover the grid to inspect a query row</span>';
        hoverInfo.textContent = 'hover a row to inspect';
        return;
      }
      var meta = overlay._meta;
      var seg = overlay._segments[meta.tokens[state.hoverRow].seg];
      var nVisible = 0;
      for (var j = 0; j < meta.N; j++) {
        if (attendsTo(state.hoverRow, j, meta.prefixEnd)) nVisible++;
      }
      var iInPrefix = state.hoverRow <= meta.prefixEnd;
      roEl.innerHTML =
        '<div>query <b>i = ' + state.hoverRow + '</b> · seg = <b style="color:' + seg.color + '">' + seg.label + '</b></div>' +
        '<div>expert: <b style="color:' + (meta.tokens[state.hoverRow].expert === 'vlm' ? COLORS.vlm : COLORS.expert) + '">' +
          meta.tokens[state.hoverRow].expert + '</b></div>' +
        '<div>attends to ' + nVisible + ' / ' + meta.N + ' keys</div>' +
        '<div style="color:#888">' +
          (iInPrefix
            ? 'in prefix → bidirectional within img+text only'
            : 'in suffix → full prefix + causal within suffix') +
        '</div>';
      hoverInfo.textContent = 'i=' + state.hoverRow + ' · attends ' + nVisible + '/' + meta.N;
    }

    rootEl.querySelector('.js-h-slider').addEventListener('input', function (ev) {
      state.H = parseInt(ev.target.value, 10);
      rootEl.querySelector('.js-h-val').textContent = state.H;
      render();
      updateReadout();
    });
    rootEl.querySelector('.js-show-experts').addEventListener('change', function (ev) {
      state.showExperts = !!ev.target.checked;
      render();
    });

    render();
    updateReadout();
  }

  window.Viz_prefix_lm_attention_pi0 = { init: initPrefixLM };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.getElementById('viz-prefix_lm_attention_pi0');
      if (el) window.Viz_prefix_lm_attention_pi0.init(el);
    });
  }
})();
