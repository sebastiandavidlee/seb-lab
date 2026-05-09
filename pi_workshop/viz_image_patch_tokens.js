/* Viz P1 — Image Patch Tokens (PaliGemma-style).
 * Hand-drawn 224×224 SVG cartoon → patch grid → flat patch sequence → text chips.
 *
 * Patch sizes {16, 32, 56} → sequence counts {196, 49, 16}.
 * Hover patch in panel (a) → tile in panel (b) lights up with sequence index.
 *
 * Exports: window.Viz_image_patch_tokens = { init(rootEl) }.
 */
(function () {
  'use strict';

  var SLUG = 'image_patch_tokens';
  var IMG_SIZE = 224;
  var PATCH_OPTIONS = [16, 32, 56];

  // Cartoon scene: robot on table with red + blue cube. All 224×224 viewBox.
  function sceneSVG() {
    return '' +
      // background sky
      '<defs>' +
        '<linearGradient id="' + SLUG + '-sky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#dceaff"/>' +
          '<stop offset="1" stop-color="#fff7e6"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="224" height="224" fill="url(#' + SLUG + '-sky)"/>' +
      // table
      '<rect x="20" y="150" width="184" height="14" fill="#a07b3b" stroke="#5d4422" stroke-width="1"/>' +
      '<line x1="34" y1="164" x2="30" y2="210" stroke="#5d4422" stroke-width="3"/>' +
      '<line x1="190" y1="164" x2="194" y2="210" stroke="#5d4422" stroke-width="3"/>' +
      // table top sheen
      '<rect x="20" y="150" width="184" height="3" fill="#c69853"/>' +
      // red cube (left)
      '<polygon points="58,140 88,140 88,164 58,164" fill="#c0392b" stroke="#5b1a14" stroke-width="1"/>' +
      '<polygon points="58,140 70,130 100,130 88,140" fill="#e25649" stroke="#5b1a14" stroke-width="1"/>' +
      '<polygon points="88,140 100,130 100,154 88,164" fill="#8a2218" stroke="#5b1a14" stroke-width="1"/>' +
      // blue cube (right)
      '<polygon points="138,142 168,142 168,164 138,164" fill="#2a5aa8" stroke="#15305a" stroke-width="1"/>' +
      '<polygon points="138,142 150,132 180,132 168,142" fill="#5079c8" stroke="#15305a" stroke-width="1"/>' +
      '<polygon points="168,142 180,132 180,154 168,164" fill="#1c3f78" stroke="#15305a" stroke-width="1"/>' +
      // robot base
      '<rect x="100" y="74" width="40" height="56" rx="4" fill="#6c7a89" stroke="#2a3340" stroke-width="1"/>' +
      // robot arm segment 1
      '<rect x="116" y="44" width="8" height="34" fill="#888" stroke="#2a3340"/>' +
      // robot joint
      '<circle cx="120" cy="44" r="6" fill="#ff8c1a" stroke="#2a3340"/>' +
      // robot arm segment 2 (angled)
      '<rect x="86" y="40" width="38" height="8" fill="#888" stroke="#2a3340" transform="rotate(-22 120 44)"/>' +
      // gripper
      '<rect x="78" y="50" width="6" height="14" fill="#ddd" stroke="#2a3340"/>' +
      '<rect x="89" y="50" width="6" height="14" fill="#ddd" stroke="#2a3340"/>' +
      // eyes
      '<circle cx="112" cy="92" r="3" fill="#1a1a1a"/>' +
      '<circle cx="128" cy="92" r="3" fill="#1a1a1a"/>' +
      '<rect x="108" y="104" width="24" height="3" rx="1.5" fill="#1a1a1a"/>' +
      // ground shadow
      '<ellipse cx="120" cy="214" rx="80" ry="6" fill="rgba(0,0,0,0.18)"/>';
  }

  // Tokenize the prompt into colored chips. Schematic — not SentencePiece.
  var PROMPT = ['pick', 'up', 'the', 'red', 'cube'];
  var CHIP_COLORS = ['#1abc9c', '#7ee787', '#f5d516', '#c0392b', '#6a3d9a'];

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="font-family:inherit">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">P1 · Image → Patch Tokens</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1">' +
            'pixels become a flat sequence; text tokens get appended on the right' +
          '</div>' +
          '<div class="cite cite--mono" style="font-family:var(--mono,monospace);font-size:11px;color:#666">' +
            'Beyer et al. PaliGemma' +
          '</div>' +
        '</header>' +

        '<div class="viz-controls" style="display:flex;gap:14px;align-items:center;margin:6px 0 10px;font-size:12px">' +
          '<label>patch size ' +
            '<select class="js-patch" style="padding:2px 4px">' +
              '<option value="16">16 (→ 14×14 = 196 patches)</option>' +
              '<option value="32" selected>32 (→ 7×7 = 49 patches)</option>' +
              '<option value="56">56 (→ 4×4 = 16 patches)</option>' +
            '</select></label>' +
          '<span class="js-counts" style="font-family:var(--mono,monospace);color:#444"></span>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:240px 1fr;gap:14px;align-items:start">' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">(a) image with patch grid</div>' +
            '<svg class="js-scene" width="224" height="224" viewBox="0 0 224 224" ' +
              'style="display:block;border:1px solid #d0d0d0;background:#fafafa"></svg>' +
            '<div style="font-size:11px;color:#666;margin-top:4px">' +
              '<span style="color:#888">cartoon · hover a patch</span>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:#666;margin-bottom:2px">(b) flattened patch sequence (row-major)</div>' +
            '<canvas class="js-tiles" width="640" height="180" ' +
              'style="display:block;background:#fff;border:1px solid #d0d0d0"></canvas>' +
            '<div class="js-tile-info" style="font-size:11px;color:#444;font-family:var(--mono,monospace);min-height:14px;margin-top:2px"></div>' +

            '<div style="font-size:11px;color:#666;margin:10px 0 2px">(c) text tokens appended after image patches</div>' +
            '<div class="js-chips" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"></div>' +
            '<div class="js-seq-summary" style="margin-top:8px;font-size:11px;color:#444;font-family:var(--mono,monospace)"></div>' +
          '</div>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:10px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          'In PaliGemma, the image becomes a fixed-length patch sequence and the prompt is tokenized & appended. ' +
          'The transformer treats them as one flat sequence — exactly what M1\'s prefix-LM mask sees as the prefix. ' +
          '<span style="color:#888">(schematic: real PaliGemma uses 14×14=196 patches; chip palette is illustrative.)</span>' +
        '</div>' +
      '</div>';

    var sceneEl   = rootEl.querySelector('.js-scene');
    var tilesC    = rootEl.querySelector('.js-tiles');
    var tileInfo  = rootEl.querySelector('.js-tile-info');
    var chipsEl   = rootEl.querySelector('.js-chips');
    var counts    = rootEl.querySelector('.js-counts');
    var seqSum    = rootEl.querySelector('.js-seq-summary');
    var patchSel  = rootEl.querySelector('.js-patch');

    var state = { patch: 32, hover: -1 };

    function patchesPerSide() { return IMG_SIZE / state.patch; }
    function nPatches() { var s = patchesPerSide(); return s * s; }

    // Sample average color of a patch from the underlying SVG by drawing it offscreen.
    // Done once per patch-size change; cached.
    var avgCache = null;
    function ensurePatchAverages(cb) {
      avgCache = null;
      // Render scene to an offscreen canvas via SVG → image → drawImage.
      var off = document.createElement('canvas');
      off.width = IMG_SIZE; off.height = IMG_SIZE;
      var ctx = off.getContext('2d');
      var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224" viewBox="0 0 224 224">' + sceneSVG() + '</svg>';
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0);
        var p = state.patch;
        var per = IMG_SIZE / p;
        var arr = [];
        for (var py = 0; py < per; py++) {
          for (var px = 0; px < per; px++) {
            var d = ctx.getImageData(px * p, py * p, p, p).data;
            var r = 0, g = 0, b = 0, n = d.length / 4;
            for (var k = 0; k < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; }
            arr.push([r / n | 0, g / n | 0, b / n | 0]);
          }
        }
        avgCache = arr;
        cb();
      };
      img.onerror = function () {
        // Fallback: synthesize neutral grey averages so viz still renders.
        var p = state.patch;
        var per = IMG_SIZE / p;
        var arr = [];
        for (var py = 0; py < per; py++) {
          for (var px = 0; px < per; px++) {
            arr.push([200 - py * 4, 200 - px * 4, 220]);
          }
        }
        avgCache = arr;
        cb();
      };
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
    }

    // Panel (a): scene SVG with patch grid overlay.
    function drawScene() {
      var per = patchesPerSide();
      var grid = '';
      for (var i = 1; i < per; i++) {
        var v = i * state.patch;
        grid += '<line x1="' + v + '" y1="0" x2="' + v + '" y2="' + IMG_SIZE +
                '" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>';
        grid += '<line x1="0" y1="' + v + '" x2="' + IMG_SIZE + '" y2="' + v +
                '" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>';
      }
      // Hover overlay rect group. We attach handlers to invisible cells.
      var cells = '';
      for (var py = 0; py < per; py++) {
        for (var px = 0; px < per; px++) {
          var idx = py * per + px;
          cells += '<rect class="patch-cell" data-idx="' + idx + '" ' +
            'x="' + (px * state.patch) + '" y="' + (py * state.patch) + '" ' +
            'width="' + state.patch + '" height="' + state.patch + '" ' +
            'fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0)" style="cursor:pointer"/>';
        }
      }
      var hoverHL = '';
      if (state.hover >= 0) {
        var hp = state.hover;
        var hx = (hp % per) * state.patch;
        var hy = Math.floor(hp / per) * state.patch;
        hoverHL = '<rect x="' + hx + '" y="' + hy + '" width="' + state.patch + '" height="' + state.patch +
          '" fill="rgba(255,140,26,0.35)" stroke="#ff8c1a" stroke-width="2"/>';
      }
      sceneEl.innerHTML = sceneSVG() + grid + hoverHL + cells;

      var cellsList = sceneEl.querySelectorAll('.patch-cell');
      for (var c = 0; c < cellsList.length; c++) {
        cellsList[c].addEventListener('mouseenter', function (ev) {
          state.hover = parseInt(ev.target.getAttribute('data-idx'), 10);
          rerender();
        });
        cellsList[c].addEventListener('mouseleave', function () {
          state.hover = -1;
          rerender();
        });
      }
    }

    // Panel (b): flattened tile strip. Up to nPatches tiles, wrapped.
    function drawTiles() {
      var ctx = tilesC.getContext('2d');
      var W = tilesC.width, H = tilesC.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);

      if (!avgCache) {
        ctx.fillStyle = '#888';
        ctx.font = '11px var(--mono, monospace)';
        ctx.textAlign = 'center';
        ctx.fillText('rendering patches…', W / 2, H / 2);
        return;
      }

      var n = avgCache.length;
      // Adaptive tile size to fit n tiles in the strip
      var per = patchesPerSide();
      var maxCols = Math.min(28, Math.ceil(Math.sqrt(n * (W / H))));
      var cols = Math.min(per * 2, maxCols);
      // Try a few cols values to pick best fit
      cols = (n <= 16) ? Math.min(8, n) : (n <= 49) ? 14 : 28;
      var rows = Math.ceil(n / cols);
      var size = Math.min((W - 8) / cols, (H - 28) / rows);
      var ox = 4 + ((W - 8) - size * cols) / 2;
      var oy = 4;

      for (var i = 0; i < n; i++) {
        var r = Math.floor(i / cols), c = i % cols;
        var x = ox + c * size, y = oy + r * size;
        var col = avgCache[i];
        ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        if (i === state.hover) {
          ctx.strokeStyle = '#ff8c1a';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        } else {
          ctx.strokeStyle = '#d0d0d0';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, size, size);
        }
      }

      // Footer label with sequence count
      ctx.fillStyle = '#444';
      ctx.font = '11px var(--mono, monospace)';
      ctx.textAlign = 'left';
      ctx.fillText('image patches: ' + n + '  (' + per + '×' + per + ' grid)',
                   8, H - 10);
      if (state.hover >= 0) {
        var py = Math.floor(state.hover / per), px = state.hover % per;
        tileInfo.textContent = 'patch (row ' + py + ', col ' + px + ') → sequence index ' + state.hover;
      } else {
        tileInfo.textContent = '';
      }
    }

    // Panel (c): text chips appended.
    function drawChips() {
      var per = patchesPerSide();
      var nImg = per * per;
      var html = '';
      // Image-token placeholder block
      html += '<span style="font-family:var(--mono,monospace);font-size:10px;color:#888;' +
        'background:#f0f0f0;padding:2px 6px;border-radius:3px">[' + nImg + ' image patches]</span>' +
        '<span style="color:#888">→</span>';
      for (var i = 0; i < PROMPT.length; i++) {
        html += '<span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;' +
          'background:' + CHIP_COLORS[i] + ';color:#fff;font-family:var(--mono,monospace);font-size:11px;' +
          'box-shadow:0 1px 2px rgba(0,0,0,0.15)">' +
          '<span style="opacity:0.7;margin-right:5px;font-size:9px">t' + (nImg + i) + '</span>' +
          PROMPT[i] + '</span>';
      }
      chipsEl.innerHTML = html;
      seqSum.textContent =
        'flat sequence length = ' + nImg + ' image + ' + PROMPT.length + ' text = ' +
        (nImg + PROMPT.length) + ' tokens';
      counts.textContent = '→ ' + nImg + ' image tokens · ' + PROMPT.length + ' text tokens';
    }

    function rerender() {
      drawScene();
      drawTiles();
      drawChips();
    }

    function reloadPatches() {
      avgCache = null;
      rerender();   // shows "rendering…" placeholder
      ensurePatchAverages(rerender);
    }

    patchSel.addEventListener('change', function () {
      state.patch = parseInt(patchSel.value, 10);
      state.hover = -1;
      reloadPatches();
    });

    // initial
    reloadPatches();
  }

  window.Viz_image_patch_tokens = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-image_patch_tokens') ||
             document.getElementById('viz-image-patch-tokens');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
