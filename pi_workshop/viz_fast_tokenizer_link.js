/* F2 — fast_tokenizer_link (page 3).
 * Reference panel: 1-paragraph framing of FAST + a small SVG pipeline thumbnail
 * (chunk → DCT → quantize → BPE → tokens) + link out to the companion FAST Workshop.
 *
 * Tier-2 → Tier-1 polish (2026-05-07):
 *   - Pipeline rendered as a real SVG with rounded boxes + arrowheads (was raw HTML divs).
 *   - Tiny "chunk preview" canvas on the left of the strip drawing 7 sinusoidal
 *     joint traces — gives the panel an instant "this is action data" anchor.
 *   - Hover any stage → its sub-label highlights and the tagline below updates
 *     to a short stage description.
 *   - Citation pill bottom-right: "Pertsch et al. 2025 — FAST".
 *
 * Lean on purpose — this is a link panel, not a full viz. ~150 LOC.
 *
 * Exports: window.Viz_fast_tokenizer_link = { init(rootEl) }
 */
(function () {
  'use strict';

  var COLORS = {
    chunk:  '#6a3d9a', dct: '#1abc9c', quant: '#ff8c1a',
    bpe:    '#c0392b', out: '#2a5aa8', muted: '#666', border: '#d0d0d0'
  };

  var STAGES = [
    { fill: COLORS.chunk, label: 'chunk',     sub: '[T=50, D=7]',    why: 'raw float action chunk — the thing we want to compress' },
    { fill: COLORS.dct,   label: 'DCT-time',  sub: '~16 coeffs',     why: 'discrete cosine transform along time — joint traces are smooth so most energy lives in low frequencies' },
    { fill: COLORS.quant, label: 'quantize',  sub: 'uniform scalar', why: 'uniform scalar quantization into a small per-coefficient bin set — yields short integer streams' },
    { fill: COLORS.bpe,   label: 'BPE merge', sub: '~1024 vocab',    why: 'byte-pair-encoding over the integer stream — exploits action-prefix redundancy across time' },
    { fill: COLORS.out,   label: 'tokens',    sub: '30–60 ints',     why: 'final categorical stream — what π₀-FAST autoregresses over (and what KI uses as an auxiliary target)' }
  ];

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="fast_tokenizer_link" style="position:relative">' +
        '<div style="display:grid;grid-template-columns:1fr;gap:14px;padding:14px;' +
          'background:#fafafa;border:1px solid ' + COLORS.border + ';border-radius:6px">' +

          '<div style="font-size:13px;line-height:1.55;color:#222;max-width:880px">' +
            '<strong>FAST</strong> turns a continuous action chunk (~350 floats per second of motion) into ' +
            '~30&ndash;60 categorical tokens via four steps: (1) <span style="color:' + COLORS.dct + ';font-weight:600">DCT along the time axis</span> ' +
            '(joint trajectories are smooth in time), (2) keep only the top ~16 coefficients, ' +
            '(3) <span style="color:' + COLORS.quant + ';font-weight:600">uniform scalar quantization</span> on those coefficients, ' +
            '(4) <span style="color:' + COLORS.bpe + ';font-weight:600">BPE merge</span> on the resulting integer stream. ' +
            'In &pi;<sub>0</sub>.5 / KI these tokens are an <em>auxiliary training target</em> only &mdash; the runtime still emits a continuous flow chunk.' +
          '</div>' +

          // Pipeline thumbnail: chunk preview + stage strip
          '<div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center">' +
            '<canvas class="js-preview" width="240" height="120" style="width:120px;height:60px;background:#fff;border:1px solid ' + COLORS.border + ';border-radius:3px;display:block"></canvas>' +
            '<svg class="js-strip" viewBox="0 0 920 90" width="100%" height="90" preserveAspectRatio="xMinYMid meet"></svg>' +
          '</div>' +

          '<div class="js-tagline" style="font-size:11.5px;color:' + COLORS.muted + ';font-style:italic;min-height:1.5em">' +
            'Hover a stage to see what it does. Open the full workshop for interactive DCT &amp; BPE.' +
          '</div>' +

          '<div style="display:flex;justify-content:flex-end">' +
            '<a class="js-link" href="../fast_workshop/index.html" ' +
              'style="display:inline-block;padding:8px 14px;background:' + COLORS.out + ';color:#fff;' +
              'text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">' +
              'Open FAST Tokenizer Workshop &rarr;</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ---- Draw chunk preview: 7 sinusoidal joint traces ----
    var pv = rootEl.querySelector('.js-preview');
    var ctx = pv.getContext('2d');
    var w = pv.width, h = pv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    var jointColors = (typeof SharedPi !== 'undefined' && SharedPi.JOINT_COLORS) ||
      ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf'];
    var T = 50;
    for (var d = 0; d < 7; d++) {
      ctx.strokeStyle = jointColors[d];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (var t = 0; t < T; t++) {
        var u = t / (T - 1);
        var phase = d * 0.7;
        var amp = 0.55 + 0.15 * d / 7;
        var y = h / 2 - amp * Math.sin(2.0 * u + phase) * (h / 4);
        var x = u * w;
        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- Draw SVG pipeline strip ----
    var svg = rootEl.querySelector('.js-strip');
    var W = 920, BOX_W = 150, BOX_H = 56, GAP = (W - STAGES.length * BOX_W) / (STAGES.length - 1);
    var defs = '<defs><marker id="fastArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#888"/></marker></defs>';
    var inner = defs;
    for (var i = 0; i < STAGES.length; i++) {
      var s = STAGES[i];
      var x = i * (BOX_W + GAP);
      var y = (90 - BOX_H) / 2;
      inner +=
        '<g class="js-stage" data-stage="' + i + '" style="cursor:pointer">' +
          '<rect x="' + x + '" y="' + y + '" width="' + BOX_W + '" height="' + BOX_H + '" rx="6" ry="6" fill="' + s.fill + '"/>' +
          '<text x="' + (x + BOX_W / 2) + '" y="' + (y + 24) + '" fill="#fff" font-family="ui-monospace, monospace" font-size="14" font-weight="600" text-anchor="middle">' + s.label + '</text>' +
          '<text x="' + (x + BOX_W / 2) + '" y="' + (y + 42) + '" fill="rgba(255,255,255,0.9)" font-family="ui-monospace, monospace" font-size="10.5" text-anchor="middle">' + s.sub + '</text>' +
        '</g>';
      if (i < STAGES.length - 1) {
        var ax1 = x + BOX_W + 4, ax2 = x + BOX_W + GAP - 4, ay = 45;
        inner += '<line x1="' + ax1 + '" y1="' + ay + '" x2="' + ax2 + '" y2="' + ay + '" stroke="#888" stroke-width="2" marker-end="url(#fastArrow)"/>';
      }
    }
    svg.innerHTML = inner;

    // Hover wiring
    var tagline = rootEl.querySelector('.js-tagline');
    var stageNodes = svg.querySelectorAll('.js-stage');
    var defaultMsg = 'Hover a stage to see what it does. Open the full workshop for interactive DCT &amp; BPE.';
    for (var k = 0; k < stageNodes.length; k++) {
      stageNodes[k].addEventListener('mouseenter', function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-stage'), 10);
        tagline.innerHTML = '<span style="color:' + STAGES[idx].fill + ';font-weight:600">' + STAGES[idx].label + ':</span> ' + STAGES[idx].why;
      });
      stageNodes[k].addEventListener('mouseleave', function () {
        tagline.innerHTML = defaultMsg;
      });
    }

    // Citation pill
    if (typeof SharedPi !== 'undefined' && SharedPi.citationPill) {
      SharedPi.citationPill(rootEl, 'Pertsch et al. 2025 — FAST');
    }
  }

  window.Viz_fast_tokenizer_link = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-fast_tokenizer_link');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
