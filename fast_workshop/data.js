/* FAST tokenizer visualization — shared math library
 *
 * Exposes window.FASTData with:
 *   CHUNK                      50x7 synthetic action chunk (radians)
 *   dct1d / dct2d_timeaxis     DCT-II (scipy 'ortho' norm)
 *   idct1d / idct2d_timeaxis   inverse DCT-II (formally DCT-III, ortho)
 *   reconstruct_from_top_k     top-K-by-magnitude reconstruction
 *   quantize                   per-coefficient uniform scalar quant (int8 range)
 *   count_zeros                sparsity %
 *   flatten_row_major          [T][D] -> [T*D] row-major (t-major)
 *   bpe_trace                  BPE with per-step trace
 *   naive_tokenize             uniform per-cell binning
 *   count_adjacent_identical   % of t,t+1 identical per dim
 *   temporal_correlation       50x50 Pearson over 7 dims
 *   cross_dim_correlation      7x7 Pearson over 50 timesteps
 *
 * All code plain ES6, no deps.
 */
(function (global) {
  'use strict';

  var T = 50;   // timesteps
  var D = 7;    // DOF

  // ---------- small deterministic PRNG so noise is stable across runs ----------
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 1. Synthetic chunk ----------
  function buildChunk() {
    var rand = mulberry32(42);
    var chunk = new Array(T);
    var dt = 1.0 / T; // 50Hz over 1s

    for (var t = 0; t < T; t++) {
      var tau = t * dt; // 0..~1s
      var row = new Array(D);

      // d0: simple ramp from -0.8 to +0.8 rad (base rotation)
      row[0] = -0.8 + 1.6 * tau;

      // d1: gentle sinusoid, 1 cycle (shoulder lift)
      row[1] = 0.9 * Math.sin(2 * Math.PI * 1.0 * tau) - 0.3;

      // d2: two-phase plateau-then-move (elbow: hold, then extend)
      //   flat near -0.5 until t=0.4s, then smooth S-curve to +0.6
      var e;
      if (tau < 0.4) {
        e = -0.5;
      } else {
        var u = (tau - 0.4) / 0.6; // 0..1
        // smoothstep
        var s = u * u * (3 - 2 * u);
        e = -0.5 + 1.1 * s;
      }
      row[2] = e;

      // d3: higher-frequency sinusoid (wrist roll)
      row[3] = 0.6 * Math.sin(2 * Math.PI * 2.5 * tau + 0.5);

      // d4: slow cosine (wrist pitch), amplitude 0.4
      row[4] = 0.4 * Math.cos(2 * Math.PI * 0.7 * tau);

      // d5: pick-and-place style — ramp up, hold, ramp down (gripper approach)
      var g;
      if (tau < 0.3)      g = 1.5 * (tau / 0.3) * 0.7;            // rise
      else if (tau < 0.7) g = 0.7 + 0.1 * Math.sin(2 * Math.PI * 3 * tau); // hold w/ micro-jitter
      else                g = 0.7 * (1 - (tau - 0.7) / 0.3);      // fall
      row[5] = g;

      // d6: gripper close — sharp step around t=0.5s, small oscillation after
      var gr;
      if (tau < 0.48)      gr = 0.0;
      else if (tau < 0.55) gr = (tau - 0.48) / 0.07 * 1.2; // fast close
      else                 gr = 1.2 + 0.05 * Math.sin(2 * Math.PI * 4 * (tau - 0.55));
      row[6] = gr;

      // add ~1% noise of per-dim amplitude
      var amps = [1.6, 1.2, 1.1, 1.2, 0.8, 0.7, 1.2];
      for (var d = 0; d < D; d++) {
        row[d] += (rand() - 0.5) * 0.02 * amps[d]; // ~1% p-p
      }

      chunk[t] = row;
    }
    return chunk;
  }

  var CHUNK = buildChunk();

  // ---------- 2. DCT-II (scipy 'ortho' norm) ----------
  // X[k] = sum_n x[n] * cos(pi*(n+0.5)*k / N) * scale(k)
  // with ortho: scale(0) = sqrt(1/N), scale(k>0) = sqrt(2/N)
  function dct1d(x) {
    var N = x.length;
    var out = new Array(N);
    for (var k = 0; k < N; k++) {
      var sum = 0;
      for (var n = 0; n < N; n++) {
        sum += x[n] * Math.cos(Math.PI * (n + 0.5) * k / N);
      }
      var scale = (k === 0) ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      out[k] = sum * scale;
    }
    return out;
  }

  function dct2d_timeaxis(chunk) {
    var Nt = chunk.length;
    var Nd = chunk[0].length;
    // collect each dim's time series, DCT it, scatter back
    var result = new Array(Nt);
    for (var i = 0; i < Nt; i++) result[i] = new Array(Nd);
    for (var d = 0; d < Nd; d++) {
      var col = new Array(Nt);
      for (var t = 0; t < Nt; t++) col[t] = chunk[t][d];
      var C = dct1d(col);
      for (var k = 0; k < Nt; k++) result[k][d] = C[k];
    }
    return result;
  }

  // ---------- 3. Inverse DCT (DCT-III ortho, inverse of our DCT-II ortho) ----------
  // x[n] = sum_k X[k] * scale(k) * cos(pi*(n+0.5)*k / N)
  function idct1d(X) {
    var N = X.length;
    var out = new Array(N);
    for (var n = 0; n < N; n++) {
      var sum = 0;
      for (var k = 0; k < N; k++) {
        var scale = (k === 0) ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
        sum += X[k] * scale * Math.cos(Math.PI * (n + 0.5) * k / N);
      }
      out[n] = sum;
    }
    return out;
  }

  function idct2d_timeaxis(coeffs) {
    var Nt = coeffs.length;
    var Nd = coeffs[0].length;
    var result = new Array(Nt);
    for (var i = 0; i < Nt; i++) result[i] = new Array(Nd);
    for (var d = 0; d < Nd; d++) {
      var col = new Array(Nt);
      for (var k = 0; k < Nt; k++) col[k] = coeffs[k][d];
      var x = idct1d(col);
      for (var t = 0; t < Nt; t++) result[t][d] = x[t];
    }
    return result;
  }

  function reconstruct_from_top_k(chunk, k) {
    var coeffs = dct2d_timeaxis(chunk);
    var Nt = coeffs.length;
    var Nd = coeffs[0].length;
    // collect all (|value|, t, d)
    var flat = [];
    for (var t = 0; t < Nt; t++) {
      for (var d = 0; d < Nd; d++) {
        flat.push({ mag: Math.abs(coeffs[t][d]), t: t, d: d });
      }
    }
    flat.sort(function (a, b) { return b.mag - a.mag; });
    var keep = {};
    var K = Math.min(k, flat.length);
    for (var i = 0; i < K; i++) {
      keep[flat[i].t + '_' + flat[i].d] = true;
    }
    var masked = new Array(Nt);
    for (var tt = 0; tt < Nt; tt++) {
      masked[tt] = new Array(Nd);
      for (var dd = 0; dd < Nd; dd++) {
        masked[tt][dd] = keep[tt + '_' + dd] ? coeffs[tt][dd] : 0;
      }
    }
    return idct2d_timeaxis(masked);
  }

  // ---------- 4. Quantization ----------
  // Uniform scalar quantization. To produce the real sparsity that gives FAST
  // its compression, we use a GLOBAL step size (not per-row max/127) so that
  // high-frequency coefficients — which have small magnitude — round to zero.
  // Default step = max_abs_anywhere / 20, giving int8 range ~[-20, +20] but
  // 50%+ zeros since the DCT spectrum is highly compacted.
  //
  // Caller can override with a per-coef array `scale_per_coef[k]` (length Nt)
  // to experiment with finer scales on low-freq rows.
  function quantize(coeffs, scale_per_coef) {
    var Nt = coeffs.length;
    var Nd = coeffs[0].length;

    var scales;
    if (scale_per_coef && scale_per_coef.length === Nt) {
      scales = scale_per_coef;
    } else {
      // find global max magnitude
      var globalMax = 0;
      for (var k0 = 0; k0 < Nt; k0++) {
        for (var d0 = 0; d0 < Nd; d0++) {
          var a0 = Math.abs(coeffs[k0][d0]);
          if (a0 > globalMax) globalMax = a0;
        }
      }
      // global step -> step = globalMax / 20 gives ~int8 range [-20,+20]
      // and rounds all |v| < step/2 to zero, producing real sparsity.
      var step = globalMax > 1e-9 ? (globalMax / 20) : 1.0;
      scales = new Array(Nt);
      for (var k = 0; k < Nt; k++) scales[k] = step;
    }

    var out = new Array(Nt);
    for (var kk = 0; kk < Nt; kk++) {
      out[kk] = new Array(Nd);
      var s = scales[kk];
      for (var dd = 0; dd < Nd; dd++) {
        var q = Math.round(coeffs[kk][dd] / s);
        if (q > 127) q = 127;
        if (q < -128) q = -128;
        out[kk][dd] = q;
      }
    }
    out._scales = scales;
    return out;
  }

  function count_zeros(int_matrix) {
    var Nt = int_matrix.length;
    var Nd = int_matrix[0].length;
    var total = Nt * Nd;
    var zeros = 0;
    for (var t = 0; t < Nt; t++) {
      for (var d = 0; d < Nd; d++) {
        if (int_matrix[t][d] === 0) zeros++;
      }
    }
    return zeros / total;
  }

  // ---------- 5. Flatten + BPE ----------
  function flatten_row_major(int_matrix) {
    var Nt = int_matrix.length;
    var Nd = int_matrix[0].length;
    var out = new Array(Nt * Nd);
    var i = 0;
    for (var t = 0; t < Nt; t++) {
      for (var d = 0; d < Nd; d++) {
        out[i++] = int_matrix[t][d];
      }
    }
    return out;
  }

  function bpe_trace(int_sequence, num_merges, max_merges_to_record) {
    var seq = int_sequence.slice();
    var initial = seq.slice();
    var steps = [];
    var vocab = {};
    var nextId = 256; // reserve 0..255-ish for base int8 tokens (shifted)

    // shift to non-negative base ids (int8 range -128..127 -> 0..255)
    function toBase(v) { return v + 128; }
    var shifted = seq.map(toBase);
    var base_initial = shifted.slice();

    var record_cap = (typeof max_merges_to_record === 'number') ? max_merges_to_record : num_merges;

    for (var m = 0; m < num_merges; m++) {
      if (shifted.length < 2) break;
      // count all adjacent pairs
      var counts = {};
      var bestKey = null;
      var bestCount = 0;
      var bestPair = null;
      for (var i = 0; i < shifted.length - 1; i++) {
        var a = shifted[i], b = shifted[i + 1];
        var key = a + '_' + b;
        var c = (counts[key] || 0) + 1;
        counts[key] = c;
        if (c > bestCount) {
          bestCount = c;
          bestKey = key;
          bestPair = [a, b];
        }
      }
      if (!bestPair || bestCount < 2) break; // no pair repeats -> stop

      var newId = nextId++;
      vocab[newId] = [bestPair[0], bestPair[1]];

      // replace all non-overlapping occurrences left-to-right
      var merged = [];
      var j = 0;
      while (j < shifted.length) {
        if (j < shifted.length - 1 && shifted[j] === bestPair[0] && shifted[j + 1] === bestPair[1]) {
          merged.push(newId);
          j += 2;
        } else {
          merged.push(shifted[j]);
          j += 1;
        }
      }
      shifted = merged;

      if (m < record_cap) {
        steps.push({
          step_idx: m,
          pair_merged: [bestPair[0], bestPair[1]],
          new_vocab_id: newId,
          frequency: bestCount,
          sequence_after: shifted.slice(),
          token_count_after: shifted.length
        });
      }
    }

    return {
      initial: base_initial,
      steps: steps,
      final: shifted,
      vocab: vocab
    };
  }

  // ---------- 6. Naive per-cell tokenization ----------
  function naive_tokenize(chunk, num_bins) {
    var Nt = chunk.length;
    var Nd = chunk[0].length;
    var gmin = Infinity, gmax = -Infinity;
    for (var t = 0; t < Nt; t++) {
      for (var d = 0; d < Nd; d++) {
        var v = chunk[t][d];
        if (v < gmin) gmin = v;
        if (v > gmax) gmax = v;
      }
    }
    var range = gmax - gmin || 1;
    var out = new Array(Nt);
    for (var tt = 0; tt < Nt; tt++) {
      out[tt] = new Array(Nd);
      for (var dd = 0; dd < Nd; dd++) {
        var normv = (chunk[tt][dd] - gmin) / range; // 0..1
        var b = Math.floor(normv * num_bins);
        if (b >= num_bins) b = num_bins - 1;
        if (b < 0) b = 0;
        out[tt][dd] = b;
      }
    }
    return out;
  }

  function count_adjacent_identical(int_matrix) {
    var Nt = int_matrix.length;
    var Nd = int_matrix[0].length;
    var total = (Nt - 1) * Nd;
    var identical = 0;
    for (var d = 0; d < Nd; d++) {
      for (var t = 0; t < Nt - 1; t++) {
        if (int_matrix[t][d] === int_matrix[t + 1][d]) identical++;
      }
    }
    return identical / total;
  }

  // ---------- 7. Correlations ----------
  function pearson(a, b) {
    var n = a.length;
    var ma = 0, mb = 0;
    for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    for (var j = 0; j < n; j++) {
      var x = a[j] - ma;
      var y = b[j] - mb;
      num += x * y;
      da += x * x;
      db += y * y;
    }
    var denom = Math.sqrt(da * db);
    if (denom < 1e-12) return 0;
    return num / denom;
  }

  function temporal_correlation(chunk) {
    var Nt = chunk.length;
    var M = new Array(Nt);
    for (var i = 0; i < Nt; i++) {
      M[i] = new Array(Nt);
      for (var j = 0; j < Nt; j++) {
        M[i][j] = pearson(chunk[i], chunk[j]);
      }
    }
    return M;
  }

  function cross_dim_correlation(chunk) {
    var Nt = chunk.length;
    var Nd = chunk[0].length;
    // extract per-dim columns
    var cols = new Array(Nd);
    for (var d = 0; d < Nd; d++) {
      cols[d] = new Array(Nt);
      for (var t = 0; t < Nt; t++) cols[d][t] = chunk[t][d];
    }
    var M = new Array(Nd);
    for (var i = 0; i < Nd; i++) {
      M[i] = new Array(Nd);
      for (var j = 0; j < Nd; j++) {
        M[i][j] = pearson(cols[i], cols[j]);
      }
    }
    return M;
  }

  // ---------- Export ----------
  global.FASTData = {
    CHUNK: CHUNK,
    dct1d: dct1d,
    dct2d_timeaxis: dct2d_timeaxis,
    idct1d: idct1d,
    idct2d_timeaxis: idct2d_timeaxis,
    reconstruct_from_top_k: reconstruct_from_top_k,
    quantize: quantize,
    count_zeros: count_zeros,
    flatten_row_major: flatten_row_major,
    bpe_trace: bpe_trace,
    naive_tokenize: naive_tokenize,
    count_adjacent_identical: count_adjacent_identical,
    temporal_correlation: temporal_correlation,
    cross_dim_correlation: cross_dim_correlation
  };

  // ---------- Self-test ----------
  (function selfTest() {
    try {
      var log = (typeof console !== 'undefined' && console.log) ? console.log.bind(console) : function () {};

      // shape
      log('[FASTData] CHUNK shape =', CHUNK.length + 'x' + CHUNK[0].length);

      // DCT energy compaction
      var C = dct2d_timeaxis(CHUNK);
      var totalE = 0;
      var mags = [];
      for (var t = 0; t < T; t++) {
        for (var d = 0; d < D; d++) {
          var v = C[t][d];
          totalE += v * v;
          mags.push(v * v);
        }
      }
      mags.sort(function (a, b) { return b - a; });
      var top16 = 0;
      for (var i = 0; i < 16; i++) top16 += mags[i];
      var ratio = top16 / totalE;
      log('[FASTData] DCT compaction: top-16 coeffs capture', (ratio * 100).toFixed(2) + '% of energy');

      // inverse DCT roundtrip
      var recon = idct2d_timeaxis(C);
      var maxErr = 0;
      for (var t2 = 0; t2 < T; t2++) {
        for (var d2 = 0; d2 < D; d2++) {
          var e = Math.abs(recon[t2][d2] - CHUNK[t2][d2]);
          if (e > maxErr) maxErr = e;
        }
      }
      log('[FASTData] DCT<->IDCT max error =', maxErr.toExponential(2));

      // quantization sparsity
      var Q = quantize(C);
      var sparsity = count_zeros(Q);
      log('[FASTData] quantization sparsity =', (sparsity * 100).toFixed(2) + '%');

      // BPE
      var flat = flatten_row_major(Q);
      var bpe = bpe_trace(flat, 80, 80);
      log('[FASTData] BPE: initial=' + bpe.initial.length + ' final=' + bpe.final.length +
          ' merges_recorded=' + bpe.steps.length);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[FASTData] self-test failed', e);
    }
  })();

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
