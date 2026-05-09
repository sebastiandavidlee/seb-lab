/* π₀ Workshop — shared helpers
 *
 * Skeleton owned by Build Agent A (page shells).
 * Other build agents (B, C — viz) extend this. Keep additions append-only.
 *
 * Load order expected by every per-viz JS file:
 *   <script src="data.js"></script>    -- window.PiData (math + canned tensors)
 *   <script src="shared.js"></script>  -- window.SharedPi (this file)
 *   <script src="viz_<slug>.js"></script>  -- window.Viz_<slug>.init(rootEl)
 *
 * Exposes window.SharedPi with:
 *   Constants:
 *     JOINT_COLORS         7-color ColorBrewer Set1 palette
 *     VLM_PURPLE, EXPERT_AMBER, FLOW_TEAL, AR_CORAL, FROZEN_STEEL, TRAINED_LIME
 *     FLOW_ARROW, NOISE_GREY, CLEAN_INK, MASK_SHADOW
 *   Color helpers:
 *     vlmPurpleRGB(), expertAmberRGB(), flowTealRGB(), arCoralRGB(),
 *     frozenSteelRGB(), trainedLimeRGB()
 *     hexToRgb(hex), rgbStr([r,g,b], alpha)
 *   Drawing helpers (TODOs — agents B/C fill in):
 *     drawArrow(ctx, x1,y1,x2,y2, opts)
 *     drawAttentionRegion(ctx, region, color)
 *   Page chrome:
 *     navActiveHighlight()    sets `.active` on <nav> link matching window.location
 *     reducedMotion()         boolean — true if user requests reduced motion
 *     onReducedMotionChange(fn) listen for changes
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------
  // Palette constants (kept in sync with styles.css :root variables)
  // -------------------------------------------------------------------
  var JOINT_COLORS = [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3',
    '#ff7f00', '#a65628', '#f781bf'
  ];

  var VLM_PURPLE   = '#6a3d9a';
  var EXPERT_AMBER = '#ff8c1a';
  var FLOW_TEAL    = '#1abc9c';
  var AR_CORAL     = '#c0392b';
  var FROZEN_STEEL = '#6c7a89';
  var TRAINED_LIME = '#7ee787';
  var NOISE_GREY   = '#888888';
  var CLEAN_INK    = '#111111';
  var FLOW_ARROW   = '#b07c2c';
  var MASK_SHADOW  = 'rgba(0,0,0,0.55)';

  // -------------------------------------------------------------------
  // Color helpers
  // -------------------------------------------------------------------
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16)
    ];
  }

  function rgbStr(triple, alpha) {
    if (typeof alpha === 'number' && alpha < 1) {
      return 'rgba(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ',' + alpha + ')';
    }
    return 'rgb(' + triple[0] + ',' + triple[1] + ',' + triple[2] + ')';
  }

  // Convenience accessors (each viz JS asks for these by name)
  function vlmPurpleRGB()   { return hexToRgb(VLM_PURPLE); }
  function expertAmberRGB() { return hexToRgb(EXPERT_AMBER); }
  function flowTealRGB()    { return hexToRgb(FLOW_TEAL); }
  function arCoralRGB()     { return hexToRgb(AR_CORAL); }
  function frozenSteelRGB() { return hexToRgb(FROZEN_STEEL); }
  function trainedLimeRGB() { return hexToRgb(TRAINED_LIME); }

  // -------------------------------------------------------------------
  // Drawing helpers (skeleton — agents B/C extend)
  // -------------------------------------------------------------------

  /**
   * Draw an arrow from (x1,y1) to (x2,y2) on a canvas 2d context.
   * opts: { color, width, headLen, headWidth, dashed }
   * Minimal implementation; agents B/C may extend for curved/dashed-flow variants.
   */
  function drawArrow(ctx, x1, y1, x2, y2, opts) {
    opts = opts || {};
    var color = opts.color || '#222';
    var width = opts.width || 1.5;
    var headLen = opts.headLen || 9;
    var headWidth = opts.headWidth || 6;
    var dashed = !!opts.dashed;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([5, 4]);

    // shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // head
    var ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(ang) + headWidth * Math.sin(ang),
      y2 - headLen * Math.sin(ang) - headWidth * Math.cos(ang)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(ang) - headWidth * Math.sin(ang),
      y2 - headLen * Math.sin(ang) + headWidth * Math.cos(ang)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Tint a rectangular region of an attention grid with a translucent fill.
   * region = {x, y, w, h} in canvas pixel coords.
   * color = hex string. alpha defaults to 0.18.
   * Used by viz P2 (prefix-LM block-causal mask) and KI1 (gradient-flow regions).
   * TODO(agent B): extend with optional border-stroke + label arg.
   */
  function drawAttentionRegion(ctx, region, color, alpha) {
    var rgb = hexToRgb(color);
    ctx.save();
    ctx.fillStyle = rgbStr(rgb, typeof alpha === 'number' ? alpha : 0.18);
    ctx.fillRect(region.x, region.y, region.w, region.h);
    ctx.strokeStyle = rgbStr(rgb, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(region.x + 0.5, region.y + 0.5, region.w - 1, region.h - 1);
    ctx.restore();
  }

  // -------------------------------------------------------------------
  // Page chrome — nav highlighter + reduced-motion detector
  // -------------------------------------------------------------------

  /**
   * Highlight the currently-active nav link based on window.location.pathname.
   * Mirrors fast_workshop's static `.active` class but applied at runtime so
   * we don't need to hand-maintain `class="active"` per page.
   * Also paints the 5-dot `.arc-progress` strip.
   */
  function navActiveHighlight() {
    var path = (window.location.pathname || '').split('/').pop() || 'index.html';
    if (path === '' || path === '/') path = 'index.html';

    var links = document.querySelectorAll('.page-nav a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href === path) links[i].classList.add('active');
    }

    // arc-progress: 5 dots, page1..page5
    var pageOrder = ['page1.html', 'page2.html', 'page3.html', 'page4.html', 'page5.html'];
    var idx = pageOrder.indexOf(path);
    var dots = document.querySelectorAll('.arc-progress .dot');
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.remove('active', 'done');
      if (idx < 0) continue;       // index page — leave all blank
      if (j < idx) dots[j].classList.add('done');
      else if (j === idx) dots[j].classList.add('active');
    }
  }

  /**
   * Returns true if the user's OS / browser prefers reduced motion.
   * Per agent5_viz_palette §1: viz auto-play disabled, scrubbers start at the
   * most informative frame.
   */
  function reducedMotion() {
    if (typeof window.matchMedia !== 'function') return false;
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    return !!mq.matches;
  }

  /**
   * Subscribe to `prefers-reduced-motion` changes. Calls `fn(isReduced)` on change.
   * Returns an unsubscribe function.
   */
  function onReducedMotionChange(fn) {
    if (typeof window.matchMedia !== 'function') return function () {};
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var handler = function (e) { fn(!!e.matches); };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return function () { mq.removeEventListener('change', handler); };
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return function () { mq.removeListener(handler); };
  }

  // -------------------------------------------------------------------
  // Bootstrap — wire navActiveHighlight on DOMContentLoaded
  // -------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', navActiveHighlight);
  } else {
    navActiveHighlight();
  }

  // -------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------
  global.SharedPi = {
    // palette constants
    JOINT_COLORS: JOINT_COLORS,
    VLM_PURPLE: VLM_PURPLE,
    EXPERT_AMBER: EXPERT_AMBER,
    FLOW_TEAL: FLOW_TEAL,
    AR_CORAL: AR_CORAL,
    FROZEN_STEEL: FROZEN_STEEL,
    TRAINED_LIME: TRAINED_LIME,
    NOISE_GREY: NOISE_GREY,
    CLEAN_INK: CLEAN_INK,
    FLOW_ARROW: FLOW_ARROW,
    MASK_SHADOW: MASK_SHADOW,
    // color helpers
    vlmPurpleRGB: vlmPurpleRGB,
    expertAmberRGB: expertAmberRGB,
    flowTealRGB: flowTealRGB,
    arCoralRGB: arCoralRGB,
    frozenSteelRGB: frozenSteelRGB,
    trainedLimeRGB: trainedLimeRGB,
    hexToRgb: hexToRgb,
    rgbStr: rgbStr,
    // drawing helpers
    drawArrow: drawArrow,
    drawAttentionRegion: drawAttentionRegion,
    // page chrome
    navActiveHighlight: navActiveHighlight,
    reducedMotion: reducedMotion,
    onReducedMotionChange: onReducedMotionChange
  };

  // -------------------------------------------------------------------
  // Append-only additions (Agent 3, 2026-05-07)
  // PiBus  — tiny pub/sub for opportunistic cross-viz hooks
  // PiDraw — extra shared canvas helpers used by 3+ viz modules
  // -------------------------------------------------------------------

  /**
   * window.PiBus — minimal pub/sub event bus used by viz modules to opt in to
   * loose cross-talk on the same page. Intentionally tiny: no off(), no once(),
   * no wildcards. Receivers register at init(); senders fire-and-forget via emit().
   *
   * Convention: event names are prefixed `pibus:<topic>`. Payload is plain JSON.
   * Example use:
   *   window.PiBus.on('pibus:prefix-lm-active', function(p){ ... });
   *   window.PiBus.emit('pibus:prefix-lm-active', { source: 'M1', mode: 'prefix-lm' });
   */
  if (!global.PiBus) {
    global.PiBus = {
      listeners: {},
      on: function (evt, fn) {
        if (typeof fn !== 'function') return;
        (this.listeners[evt] = this.listeners[evt] || []).push(fn);
      },
      emit: function (evt, payload) {
        var L = this.listeners[evt];
        if (!L || !L.length) return;
        for (var i = 0; i < L.length; i++) {
          try { L[i](payload); } catch (e) { /* never let a viz crash siblings */ }
        }
      }
    };
  }

  // -------------------------------------------------------------------
  // PiDraw — shared canvas helpers used by 3+ owned viz files.
  // Lives under SharedPi.draw.* so we don't clash with anything else.
  // -------------------------------------------------------------------

  /**
   * Mulberry32 — tiny deterministic PRNG. Used by viz that need stable noise
   * across reloads (D2 tensor strips, TI1 noise sample, R1 cell flicker, etc.).
   */
  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Approximate viridis colormap (5-stop linear interp, returns [r,g,b]).
   * Used by D2 (tensor strips) and TI1 (chunk densitization).
   */
  function viridis(t) {
    t = Math.max(0, Math.min(1, t));
    var stops = [
      [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]
    ];
    var k = t * (stops.length - 1);
    var i = Math.floor(k), f = k - i;
    if (i >= stops.length - 1) return stops[stops.length - 1];
    var a = stops[i], b = stops[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f)
    ];
  }

  /**
   * Render a "citation pill" — bottom-right monospace 11px badge inside a viz
   * body. Positions absolute relative to the supplied container; container must
   * have `position: relative` (or get it added).
   */
  function citationPill(container, text, opts) {
    if (!container) return null;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    opts = opts || {};
    var div = document.createElement('div');
    div.className = 'pi-citation-pill';
    div.textContent = text;
    div.style.cssText =
      'position:absolute;right:10px;bottom:8px;' +
      'font-family:var(--mono,ui-monospace,monospace);font-size:11px;' +
      'color:' + (opts.color || '#888') + ';' +
      'background:' + (opts.bg || 'rgba(255,255,255,0.7)') + ';' +
      'padding:2px 6px;border-radius:3px;pointer-events:none;letter-spacing:0.01em';
    container.appendChild(div);
    return div;
  }

  /**
   * Draw a horizontal "row of cells" progress strip into a parent grid.
   * Used by R1; generic enough to share. cells: count, fillIdx: prefix to fill.
   */
  function drawCellStrip(parentEl, cellsCount, fillIdx, color, offColor) {
    var html = '';
    for (var i = 0; i < cellsCount; i++) {
      var bg = i < fillIdx ? color : offColor;
      html += '<div style="background:' + bg + ';height:100%;transition:background 80ms"></div>';
    }
    parentEl.innerHTML = html;
  }

  // expose under SharedPi.draw / SharedPi.rng / SharedPi.viridis / etc.
  global.SharedPi.mulberry32 = mulberry32;
  global.SharedPi.viridis = viridis;
  global.SharedPi.citationPill = citationPill;
  global.SharedPi.drawCellStrip = drawCellStrip;

})(typeof window !== 'undefined' ? window : this);
