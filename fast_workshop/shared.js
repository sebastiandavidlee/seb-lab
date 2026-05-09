/* FAST viz — shared helpers
 *
 * Load order expected by every viz_N.js file:
 *   <script src="data.js"></script>   -- window.FASTData (math lib)
 *   <script src="shared.js"></script> -- window.SharedFAST (this file)
 *   <script src="viz_N.js"></script>  -- window.VizN.init(rootEl)
 *
 * Exposes window.SharedFAST with:
 *   Constants:
 *     JOINT_COLORS       7-color ColorBrewer Set1 palette (used by viz 1,2,4,7)
 *     FREQ_ACCENT        '#1abc9c' — frequency-domain accent (viz 3,4)
 *   Colormaps:
 *     divergingColormap(v, vmax)   blue-white-red, returns [r,g,b]
 *     divergingRGBString(v, vmax, alpha?)
 *     hsvToRgb(h,s,v)              helper
 *     hashToColor(id, baseHueOffset?)   deterministic token-ID → hsl() string
 *                                       (used by viz 6,7)
 *   Rendering:
 *     drawHeatmap(canvas, matrix, opts)
 *         opts = {
 *           colormap: 'diverging'|'token-id'|fn(val,i,j) -> [r,g,b],
 *           zeroBlack: bool,
 *           range:    [min,max] | 'symmetric' | 'auto',
 *           padding:  {l,r,t,b} (optional),
 *           grid:     bool (thin cell grid),
 *           transpose: bool  // draw matrix[i][j] with j on y axis instead of x
 *         }
 *   Utilities:
 *     maxAbs(matrix), minMax(matrix), mean(arr), variance(arr)
 *     formatPercent(num, decimals)
 *     formatScientific(num, sigfigs)
 *     hexToRgb(hex)
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------

  // ColorBrewer Set1 (7 colors) — canonical joint palette for viz 1,2,4,7.
  var JOINT_COLORS = [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3',
    '#ff7f00', '#a65628', '#f781bf'
  ];

  var FREQ_ACCENT = '#1abc9c';

  // ------------------------------------------------------------------
  // Color helpers
  // ------------------------------------------------------------------

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16)
    ];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * Blue (-vmax) -> white (0) -> red (+vmax).
   * Uses (33,102,172) blue, (247,247,247) white, (178,24,43) red — matches
   * viz_1_2 / viz_3 / viz_5 conventions (close enough visually).
   * @returns {[number,number,number]} rgb 0..255
   */
  function divergingColormap(v, vmax) {
    if (vmax <= 1e-12) return [255, 255, 255];
    if (v !== v) v = 0;
    var t = v / vmax;
    if (t > 1) t = 1; else if (t < -1) t = -1;
    var r, g, b;
    if (t >= 0) {
      r = lerp(247, 178, t);
      g = lerp(247,  24, t);
      b = lerp(247,  43, t);
    } else {
      var u = -t;
      r = lerp(247,  33, u);
      g = lerp(247, 102, u);
      b = lerp(247, 172, u);
    }
    return [r | 0, g | 0, b | 0];
  }

  function divergingRGBString(v, vmax, alpha) {
    var c = divergingColormap(v, vmax);
    if (typeof alpha === 'number' && alpha < 1) {
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    }
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function hsvToRgb(h, s, v) {
    // h in [0,1]
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var tt = v * (1 - (1 - f) * s);
    var r, g, b;
    switch (i % 6) {
      case 0: r = v;  g = tt; b = p;  break;
      case 1: r = q;  g = v;  b = p;  break;
      case 2: r = p;  g = v;  b = tt; break;
      case 3: r = p;  g = q;  b = v;  break;
      case 4: r = tt; g = p;  b = v;  break;
      case 5: r = v;  g = p;  b = q;  break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /**
   * Deterministic token-ID -> hsl color string.
   * Matches viz_6 behavior (base IDs <256 are desaturated blue-gray;
   * merge IDs >=256 are vivid golden-angle hues).
   * For pure hash-color (viz_7 final tokens), pass id directly — merge branch kicks in.
   * @param id integer token ID
   * @param baseHueOffset optional number added to hue (default 0)
   */
  function hashToColor(id, baseHueOffset) {
    var offset = baseHueOffset || 0;
    if (id < 256) {
      var hh = 200 + ((id * 17) % 40) - 20 + offset; // 180..220 + offset
      var s = 14 + ((id * 11) % 18);
      var l = 38 + ((id * 7)  % 22);
      return 'hsl(' + hh + ',' + s + '%,' + l + '%)';
    }
    var idx = id - 256;
    var hue = ((idx * 137.508) + offset) % 360;
    var sat = 70 + ((idx * 13) % 20);
    var lig = 52 + ((idx * 7) % 14);
    return 'hsl(' + hue + ',' + sat + '%,' + lig + '%)';
  }

  // ------------------------------------------------------------------
  // Matrix utilities
  // ------------------------------------------------------------------

  function maxAbs(matrix) {
    var m = 0;
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        var a = Math.abs(matrix[i][j]);
        if (a > m) m = a;
      }
    }
    return m;
  }

  function minMax(matrix) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        var v = matrix[i][j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return [lo, hi];
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function variance(arr) {
    if (!arr.length) return 0;
    var m = mean(arr);
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
      var dd = arr[i] - m;
      s += dd * dd;
    }
    return s / arr.length;
  }

  // ------------------------------------------------------------------
  // Generic heatmap renderer
  // ------------------------------------------------------------------
  //
  // matrix is 2D: matrix[i][j]  (rows = i, cols = j).
  // By default, i runs along Y (rows, top->bottom), j runs along X (cols, left->right).
  // If opts.transpose === true, we draw matrix[i][j] with i on X axis and j on Y.
  //
  // opts.colormap:
  //   'diverging'  — blue-white-red, vmax = opts.range or auto symmetric
  //   'token-id'   — integer token IDs via hashToColor()
  //   fn(val,i,j)  — custom, returns [r,g,b]
  //
  // opts.zeroBlack (bool): paint exact-zero cells pure black (#000)
  //                        — used by viz 5 and viz 7 stage 3.
  //
  // opts.range:
  //   [min,max]    — fixed
  //   'symmetric'  — [-maxAbs, +maxAbs] (default for 'diverging')
  //   'auto'       — [min, max]
  //
  // opts.padding:  {l,r,t,b} px margins inside canvas (default all 0)
  // opts.grid:     bool — thin inner grid lines (default false)
  function drawHeatmap(canvas, matrix, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var pad = opts.padding || { l: 0, r: 0, t: 0, b: 0 };
    var plotW = W - (pad.l || 0) - (pad.r || 0);
    var plotH = H - (pad.t || 0) - (pad.b || 0);
    var padL = pad.l || 0;
    var padT = pad.t || 0;

    var rows = matrix.length;
    var cols = matrix[0].length;

    var transpose = !!opts.transpose;
    // In transpose mode we treat i as x-axis, j as y-axis.
    var xN = transpose ? rows : cols;
    var yN = transpose ? cols : rows;
    var cellW = plotW / xN;
    var cellH = plotH / yN;

    // determine colormap function
    var cm = opts.colormap || 'diverging';
    var range = opts.range;
    var vmin = 0, vmax = 1, absMax = 1;

    if (typeof cm !== 'function') {
      if (range === 'auto') {
        var mm = minMax(matrix); vmin = mm[0]; vmax = mm[1];
        absMax = Math.max(Math.abs(vmin), Math.abs(vmax));
      } else if (Array.isArray(range)) {
        vmin = range[0]; vmax = range[1];
        absMax = Math.max(Math.abs(vmin), Math.abs(vmax));
      } else {
        // default 'symmetric'
        absMax = maxAbs(matrix);
        if (absMax < 1e-12) absMax = 1;
        vmin = -absMax; vmax = absMax;
      }
    }

    function colorAt(val, i, j) {
      if (opts.zeroBlack && val === 0) return [0, 0, 0];
      if (typeof cm === 'function') return cm(val, i, j);
      if (cm === 'diverging') return divergingColormap(val, absMax);
      if (cm === 'token-id') {
        // hashToColor returns hsl string; we need rgb.
        // Quick path: use hashInt-based hsl directly via canvas, but we need [r,g,b].
        // Cheap: parse into a throwaway canvas... too slow. Use a direct HSL->RGB.
        return _tokenIdRgb(val);
      }
      return [128, 128, 128];
    }

    for (var i = 0; i < rows; i++) {
      for (var j = 0; j < cols; j++) {
        var val = matrix[i][j];
        var rgb = colorAt(val, i, j);
        ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        var xIdx = transpose ? i : j;
        var yIdx = transpose ? j : i;
        var x = padL + xIdx * cellW;
        var y = padT + yIdx * cellH;
        ctx.fillRect(x, y, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      }
    }

    if (opts.grid) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (var xi = 1; xi < xN; xi++) {
        var gx = padL + xi * cellW;
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
      }
      for (var yi = 1; yi < yN; yi++) {
        var gy = padT + yi * cellH;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------------
  // Helper — token-ID to [r,g,b] (same hue mapping as hashToColor,
  // but returns triple for drawHeatmap inner path).
  // ------------------------------------------------------------------
  function _hslToRgb(h, s, l) {
    // h in [0,360], s,l in [0,100]
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      return l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function _tokenIdRgb(id) {
    if (id < 256) {
      var hh = 200 + ((id * 17) % 40) - 20;
      var s = 14 + ((id * 11) % 18);
      var l = 38 + ((id * 7)  % 22);
      return _hslToRgb(hh, s, l);
    }
    var idx = id - 256;
    var hue = (idx * 137.508) % 360;
    var sat = 70 + ((idx * 13) % 20);
    var lig = 52 + ((idx * 7) % 14);
    return _hslToRgb(hue, sat, lig);
  }

  // ------------------------------------------------------------------
  // Formatters
  // ------------------------------------------------------------------

  function formatPercent(num, decimals) {
    decimals = (typeof decimals === 'number') ? decimals : 1;
    return (num * 100).toFixed(decimals) + '%';
  }

  function formatScientific(num, sigfigs) {
    sigfigs = sigfigs || 3;
    if (num === 0) return '0';
    return num.toExponential(sigfigs - 1);
  }

  // ------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------
  global.SharedFAST = {
    // constants
    JOINT_COLORS: JOINT_COLORS,
    FREQ_ACCENT: FREQ_ACCENT,
    // color helpers
    divergingColormap: divergingColormap,
    divergingRGBString: divergingRGBString,
    hsvToRgb: hsvToRgb,
    hashToColor: hashToColor,
    hexToRgb: hexToRgb,
    // matrix utils
    maxAbs: maxAbs,
    minMax: minMax,
    mean: mean,
    variance: variance,
    // rendering
    drawHeatmap: drawHeatmap,
    // formatters
    formatPercent: formatPercent,
    formatScientific: formatScientific
  };

})(typeof window !== 'undefined' ? window : this);
