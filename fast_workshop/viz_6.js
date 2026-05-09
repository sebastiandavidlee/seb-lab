/* Viz 6 — BPE merge animation.
 * Load order: data.js -> shared.js -> viz_6.js
 * Exports: window.Viz6 = { init(rootEl) }
 */
(function () {
  'use strict';

  var FD = window.FASTData;
  var S  = window.SharedFAST;

  function countUnique(seq) {
    var set = {};
    for (var i = 0; i < seq.length; i++) set[seq[i]] = 1;
    return Object.keys(set).length;
  }
  function countBase(seq) {
    var set = {};
    for (var i = 0; i < seq.length; i++) {
      if (seq[i] < 256) set[seq[i]] = 1;
    }
    return Object.keys(set).length;
  }

  function initViz6(rootEl) {
    if (!FD || !S) {
      rootEl.innerHTML = '<p style="color:red">Viz 6: data.js / shared.js missing.</p>';
      return;
    }

    // pipeline
    var dct = FD.dct2d_timeaxis(FD.CHUNK);
    var quantized = FD.quantize(dct);
    var flat = FD.flatten_row_major(quantized);
    var trace = FD.bpe_trace(flat, 80);

    var INITIAL = trace.initial;
    var STEPS = trace.steps;
    var STEP_MAX = STEPS.length;

    console.log('[viz_6] initial=' + INITIAL.length + ' final=' + trace.final.length +
                ' merges_recorded=' + STEPS.length);

    // SharedFAST.hashToColor matches the original viz_6 behavior.
    var hashColor = S.hashToColor;

    var state = { step: 0, playing: false, speed: 1, timer: null };

    function getSequence(step) {
      if (step === 0) return INITIAL;
      return STEPS[step - 1].sequence_after;
    }
    function getPairToHighlight(step) {
      if (step === 0) return null;
      return { merged_id: STEPS[step - 1].new_vocab_id, pair: STEPS[step - 1].pair_merged };
    }

    var stripCanvas = rootEl.querySelector('.js-strip');
    var stripCtx = stripCanvas.getContext('2d');

    function drawStrip(step) {
      var seq = getSequence(step);
      var highlight = getPairToHighlight(step);
      var N = seq.length;
      var CELL_W = 5, CELL_H = 44;
      var canvasW = Math.max(350 * CELL_W + 4, N * CELL_W + 4);
      var canvasH = CELL_H + 10;
      stripCanvas.width = canvasW;
      stripCanvas.height = canvasH;
      stripCanvas.style.width = canvasW + 'px';
      stripCanvas.style.height = canvasH + 'px';

      stripCtx.fillStyle = '#0a0c11';
      stripCtx.fillRect(0, 0, canvasW, canvasH);

      for (var i = 0; i < N; i++) {
        var id = seq[i];
        var x = 2 + i * CELL_W;
        var y = 4;
        stripCtx.fillStyle = hashColor(id);
        stripCtx.fillRect(x, y, CELL_W - 1, CELL_H);
        if (highlight && id === highlight.merged_id) {
          stripCtx.strokeStyle = '#ffffff';
          stripCtx.lineWidth = 1.5;
          stripCtx.strokeRect(x - 0.5, y - 0.5, CELL_W, CELL_H + 1);
        }
      }
      stripCtx.strokeStyle = '#2a2f3a';
      stripCtx.lineWidth = 1;
      stripCtx.beginPath();
      stripCtx.moveTo(0, canvasH - 1);
      stripCtx.lineTo(canvasW, canvasH - 1);
      stripCtx.stroke();
    }

    var chartCanvas = rootEl.querySelector('.js-chart');
    var chartCtx = chartCanvas.getContext('2d');
    var SERIES = new Array(STEP_MAX + 1);
    SERIES[0] = INITIAL.length;
    for (var s = 0; s < STEP_MAX; s++) SERIES[s + 1] = STEPS[s].token_count_after;
    var MAX_Y = SERIES[0];

    function drawChart(step) {
      var W = chartCanvas.width, H = chartCanvas.height;
      chartCtx.fillStyle = '#0a0c11';
      chartCtx.fillRect(0, 0, W, H);
      var padL = 40, padR = 14, padT = 10, padB = 22;
      var plotW = W - padL - padR;
      var plotH = H - padT - padB;

      chartCtx.strokeStyle = '#2a2f3a';
      chartCtx.lineWidth = 1;
      chartCtx.beginPath();
      chartCtx.moveTo(padL, padT);
      chartCtx.lineTo(padL, padT + plotH);
      chartCtx.lineTo(padL + plotW, padT + plotH);
      chartCtx.stroke();

      chartCtx.fillStyle = '#9aa3b2';
      chartCtx.font = '11px monospace';
      var yTicks = 4;
      for (var t = 0; t <= yTicks; t++) {
        var frac = t / yTicks;
        var yValRaw = Math.round(MAX_Y * (1 - frac));
        var yPix = padT + frac * plotH;
        chartCtx.fillText(String(yValRaw), 6, yPix + 3);
        if (t > 0 && t < yTicks) {
          chartCtx.strokeStyle = '#1a1e26';
          chartCtx.beginPath();
          chartCtx.moveTo(padL, yPix);
          chartCtx.lineTo(padL + plotW, yPix);
          chartCtx.stroke();
        }
      }

      var N = SERIES.length;
      var xTicks = Math.min(N - 1, 5);
      for (var xi = 0; xi <= xTicks; xi++) {
        var xFrac = xi / xTicks;
        var xStep = Math.round(xFrac * (N - 1));
        var xPix = padL + xFrac * plotW;
        chartCtx.fillStyle = '#9aa3b2';
        chartCtx.fillText(String(xStep), xPix - 5, padT + plotH + 14);
      }

      chartCtx.fillStyle = '#9aa3b2';
      chartCtx.fillText('step', padL + plotW / 2 - 10, H - 4);
      chartCtx.save();
      chartCtx.translate(10, padT + plotH / 2 + 15);
      chartCtx.rotate(-Math.PI / 2);
      chartCtx.fillText('tokens', 0, 0);
      chartCtx.restore();

      function toX(i) { return padL + (i / (N - 1)) * plotW; }
      function toY(v) { return padT + (1 - v / MAX_Y) * plotH; }

      chartCtx.strokeStyle = '#ffb454';
      chartCtx.lineWidth = 2;
      chartCtx.beginPath();
      chartCtx.moveTo(toX(0), toY(SERIES[0]));
      for (var i = 1; i < N; i++) chartCtx.lineTo(toX(i), toY(SERIES[i]));
      chartCtx.stroke();

      chartCtx.fillStyle = '#ffb454';
      for (var j = 0; j < N; j++) {
        var xp = toX(j), yp = toY(SERIES[j]);
        chartCtx.beginPath();
        chartCtx.arc(xp, yp, 2.2, 0, Math.PI * 2);
        chartCtx.fill();
      }

      var cx = toX(step), cy = toY(SERIES[step]);
      chartCtx.strokeStyle = '#6cb6ff';
      chartCtx.lineWidth = 1;
      chartCtx.beginPath();
      chartCtx.moveTo(cx, padT);
      chartCtx.lineTo(cx, padT + plotH);
      chartCtx.stroke();
      chartCtx.fillStyle = '#6cb6ff';
      chartCtx.beginPath();
      chartCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      chartCtx.fill();

      chartCtx.fillStyle = '#e8ecf1';
      chartCtx.font = 'bold 11px monospace';
      var tag = SERIES[step] + ' tok';
      var tw = chartCtx.measureText(tag).width;
      var tagX = cx + 6;
      if (tagX + tw > padL + plotW) tagX = cx - tw - 6;
      chartCtx.fillText(tag, tagX, cy - 6);

      chartCtx.fillStyle = '#9aa3b2';
      chartCtx.font = '10px monospace';
      chartCtx.fillText('350 init', toX(0) + 4, toY(SERIES[0]) - 8);
      chartCtx.fillText(SERIES[N - 1] + ' final', toX(N - 1) - 52, toY(SERIES[N - 1]) - 8);
    }

    var elCallout = rootEl.querySelector('.js-callout');
    var elStepN = rootEl.querySelector('.js-step-n');
    var elStepMax = rootEl.querySelector('.js-step-max');
    var elTokN = rootEl.querySelector('.js-tok-n');
    var elUniqN = rootEl.querySelector('.js-uniq-n');
    var elMergeN = rootEl.querySelector('.js-merge-n');
    var elBaseCount = rootEl.querySelector('.js-base-count');
    var elMergeCount = rootEl.querySelector('.js-merge-count');
    var elVocabBody = rootEl.querySelector('.js-vocab-body');
    var elSlider = rootEl.querySelector('.js-slider');
    var elSliderLbl = rootEl.querySelector('.js-slider-lbl');

    elStepMax.textContent = STEP_MAX;
    elSlider.max = STEP_MAX;

    function renderCallout(step) {
      if (step === 0) {
        elCallout.innerHTML = 'Step 0 — initial sequence (' + INITIAL.length +
          ' tokens, flat row-major from the 50×7 quantized DCT matrix). ' +
          'Hit <b>Play</b> or press <b>→</b> to begin merging.';
        return;
      }
      var s = STEPS[step - 1];
      var a = s.pair_merged[0], b = s.pair_merged[1];
      elCallout.innerHTML =
        'Step ' + step + ' — merged pair <span class="pair">(' + a + ', ' + b + ')</span> ' +
        '· occurred <span class="freq">' + s.frequency + '×</span> ' +
        '· assigned vocab ID <span class="vid">' + s.new_vocab_id + '</span> ' +
        '· sequence now <b>' + s.token_count_after + '</b> tokens';
    }

    function renderVocab(step) {
      var rows = [];
      for (var i = step - 1; i >= 0 && rows.length < 10; i--) {
        var s = STEPS[i];
        rows.push({ id: s.new_vocab_id, a: s.pair_merged[0], b: s.pair_merged[1], freq: s.frequency });
      }
      if (rows.length === 0) {
        elVocabBody.innerHTML = '<tr><td colspan="3" style="color:var(--muted6)">(no merges yet)</td></tr>';
      } else {
        var html = '';
        for (var k = 0; k < rows.length; k++) {
          var r = rows[k];
          var color = hashColor(r.id);
          html += '<tr>' +
            '<td class="id"><span style="display:inline-block;width:8px;height:8px;background:' + color + ';border-radius:2px;margin-right:6px;vertical-align:middle"></span>' + r.id + '</td>' +
            '<td class="expand">(' + r.a + ', ' + r.b + ')</td>' +
            '<td class="freq">' + r.freq + '×</td>' +
            '</tr>';
        }
        elVocabBody.innerHTML = html;
      }
      elMergeCount.textContent = step + ' merge' + (step === 1 ? '' : 's');
    }

    function render() {
      var seq = getSequence(state.step);
      drawStrip(state.step);
      drawChart(state.step);
      renderCallout(state.step);
      elStepN.textContent = state.step;
      elTokN.textContent = seq.length;
      elUniqN.textContent = countUnique(seq);
      elMergeN.textContent = state.step;
      elBaseCount.textContent = countBase(seq) + ' unique base IDs present';
      renderVocab(state.step);
      elSlider.value = state.step;
      elSliderLbl.textContent = 'step ' + state.step;
    }

    var btnPrev = rootEl.querySelector('.js-btn-prev');
    var btnPlay = rootEl.querySelector('.js-btn-play');
    var btnNext = rootEl.querySelector('.js-btn-next');
    var speedBox = rootEl.querySelector('.js-speed');

    function setStep(n) {
      if (n < 0) n = 0;
      if (n > STEP_MAX) n = STEP_MAX;
      state.step = n;
      render();
    }
    function play() {
      if (state.playing) return;
      if (state.step >= STEP_MAX) setStep(0);
      state.playing = true;
      btnPlay.textContent = '❚❚ Pause';
      btnPlay.classList.add('active');
      var baseInterval = 700;
      var interval = baseInterval / state.speed;
      state.timer = setInterval(function () {
        if (state.step >= STEP_MAX) { pause(); return; }
        setStep(state.step + 1);
      }, interval);
    }
    function pause() {
      state.playing = false;
      btnPlay.textContent = '▶ Play';
      btnPlay.classList.remove('active');
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
    }

    btnPrev.addEventListener('click', function () { pause(); setStep(state.step - 1); });
    btnNext.addEventListener('click', function () { pause(); setStep(state.step + 1); });
    btnPlay.addEventListener('click', function () {
      if (state.playing) pause(); else play();
    });
    elSlider.addEventListener('input', function (e) {
      pause();
      setStep(parseInt(e.target.value, 10));
    });
    speedBox.addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      var sp = parseFloat(e.target.getAttribute('data-s'));
      state.speed = sp;
      var btns = speedBox.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
      e.target.classList.add('active');
      if (state.playing) { pause(); play(); }
    });

    // --- keyboard-active gating (avoid collision with Viz 4 on Page 2) ---
    // rootEl is considered "keyboard-active" if the pointer is over it OR
    // focus lives within it. Space also works when the play button has focus.
    var kbdActive = false;
    rootEl.addEventListener('mouseenter', function () { kbdActive = true; });
    rootEl.addEventListener('mouseleave', function () { kbdActive = false; });
    rootEl.addEventListener('focusin',    function () { kbdActive = true; });
    rootEl.addEventListener('focusout',   function () {
      setTimeout(function () {
        if (!rootEl.contains(document.activeElement)) kbdActive = false;
      }, 0);
    });

    document.addEventListener('keydown', function (e) {
      if (!rootEl.isConnected) return;
      if (!kbdActive && !rootEl.contains(document.activeElement)) return;
      if (e.key === 'ArrowLeft')       { e.preventDefault(); pause(); setStep(state.step - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); setStep(state.step + 1); }
      else if (e.key === ' ')          { e.preventDefault(); if (state.playing) pause(); else play(); }
    });

    render();
  }

  window.Viz6 = { init: initViz6 };
})();
