/*
 * LewmColors — small color helper for the treemap explorer.
 * No module system; attaches a global `LewmColors` object to window.
 *
 * Provides:
 *   LewmColors.viridis(t)              — viridis colormap, t in [0,1] -> "#rrggbb"
 *   LewmColors.cividis(t)              — cividis colormap, t in [0,1] -> "#rrggbb"
 *   LewmColors.normalize(values)       — array of numbers -> array in [0,1]
 *   LewmColors.cellColor(v, all, cm)   — normalize v against `all`, apply colormap
 *   LewmColors.contrastingText(hex)    — "white" | "black" for readable overlay
 */
(function (global) {
  "use strict";

  // ---- 5-stop colormap definitions (RGB triples in [0,255]) ----
  var VIRIDIS_STOPS = [
    [0.0,  [0x44, 0x01, 0x54]], // #440154
    [0.25, [0x3b, 0x52, 0x8b]], // #3b528b
    [0.5,  [0x21, 0x91, 0x8c]], // #21918c
    [0.75, [0x5e, 0xc9, 0x62]], // #5ec962
    [1.0,  [0xfd, 0xe7, 0x25]]  // #fde725
  ];

  var CIVIDIS_STOPS = [
    [0.0,  [0x00, 0x22, 0x4e]], // #00224e
    [0.25, [0x3e, 0x3e, 0x6b]], // #3e3e6b
    [0.5,  [0x7a, 0x7a, 0x76]], // #7a7a76
    [0.75, [0xb8, 0xa8, 0x72]], // #b8a872
    [1.0,  [0xfe, 0xe8, 0x38]]  // #fee838
  ];

  // ---- Helpers ----
  function clamp01(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    if (isNaN(t)) return 0;
    return t;
  }

  function toHex(n) {
    var s = Math.round(n).toString(16);
    return s.length === 1 ? "0" + s : s;
  }

  function rgbToHex(r, g, b) {
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function hexToRgb(hex) {
    var h = hex.replace(/^#/, "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var num = parseInt(h, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  function interpolateStops(stops, t) {
    t = clamp01(t);
    // Find the segment.
    for (var i = 0; i < stops.length - 1; i++) {
      var t0 = stops[i][0];
      var t1 = stops[i + 1][0];
      if (t >= t0 && t <= t1) {
        var span = t1 - t0;
        var f = span === 0 ? 0 : (t - t0) / span;
        var c0 = stops[i][1];
        var c1 = stops[i + 1][1];
        var r = c0[0] + (c1[0] - c0[0]) * f;
        var g = c0[1] + (c1[1] - c0[1]) * f;
        var b = c0[2] + (c1[2] - c0[2]) * f;
        return rgbToHex(r, g, b);
      }
    }
    // Fallback (shouldn't reach here since clamp01 caps t at 1.0).
    var last = stops[stops.length - 1][1];
    return rgbToHex(last[0], last[1], last[2]);
  }

  // ---- Public API ----
  function viridis(t) {
    return interpolateStops(VIRIDIS_STOPS, t);
  }

  function cividis(t) {
    return interpolateStops(CIVIDIS_STOPS, t);
  }

  function normalize(values) {
    if (!values || values.length === 0) return [];
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (typeof v !== "number" || isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!isFinite(min) || !isFinite(max)) {
      // No valid numbers — return zeros.
      return values.map(function () { return 0; });
    }
    var span = max - min;
    if (span === 0) {
      // All equal — map to 0.5 (middle of colormap is a reasonable default).
      return values.map(function () { return 0.5; });
    }
    return values.map(function (v) {
      if (typeof v !== "number" || isNaN(v)) return 0;
      return (v - min) / span;
    });
  }

  function cellColor(value, all_values, colormap) {
    var cm = colormap || "viridis";
    var norm = normalize(all_values);
    // Find this value's normalized counterpart by looking up its index;
    // but values may repeat — recompute directly from the same min/max.
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < all_values.length; i++) {
      var v = all_values[i];
      if (typeof v !== "number" || isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    var t;
    if (!isFinite(min) || !isFinite(max) || max === min) {
      t = 0.5;
    } else {
      t = (value - min) / (max - min);
    }
    t = clamp01(t);
    if (cm === "cividis") return cividis(t);
    return viridis(t);
  }

  // W3C relative-luminance formula.
  // https://www.w3.org/TR/WCAG20/#relativeluminancedef
  function relativeLuminance(hex) {
    var rgb = hexToRgb(hex);
    var srgb = rgb.map(function (c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function contrastingText(hexcolor) {
    var L = relativeLuminance(hexcolor);
    // Threshold ~0.179 is a common WCAG-aware cutoff; 0.5 also works for
    // viridis/cividis ramps. Use 0.5 for clear separation on these palettes.
    return L > 0.5 ? "black" : "white";
  }

  var LewmColors = {
    viridis: viridis,
    cividis: cividis,
    normalize: normalize,
    cellColor: cellColor,
    contrastingText: contrastingText
  };

  global.LewmColors = LewmColors;

  // ---- Self-test (only runs if explicitly opted in) ----
  if (typeof window !== "undefined" && window.__LEWM_TEST_COLORS) {
    console.assert(LewmColors.viridis(0.5).startsWith("#"));
    console.assert(["white", "black"].includes(LewmColors.contrastingText("#3b528b")));
    console.log("LewmColors self-test passed");
  }
})(typeof window !== "undefined" ? window : this);
