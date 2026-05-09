/* R1 — runtime_race (page 3).
 * AR vs flow wall-clock race.
 * Top:    π₀-FAST AR over FAST tokens — ~60 sequential decodes (SEQUENTIAL).
 * Bottom: π₀ flow matching — 10 Euler steps (PARALLEL within each step).
 *
 * Wall-clock anchors are MEASURED in the source papers:
 *   - π₀ flow ~73 ms / chunk on RTX 4090 (π₀ §D Table I)
 *   - π₀-FAST AR ~750 ms / chunk (FAST §VI-D)
 * The cell-fill animation itself is schematic — it's a pedagogical race, not a
 * benchmark.
 *
 * Tier-2 → Tier-1 upgrade (2026-05-07):
 *   - Flow cells fire in 10 discrete steps; each "step" is a parallel batch
 *     visualized as a brief brighten-pulse on every cell at once. AR cells
 *     fire one-at-a-time. The contrast is visible.
 *   - "Time saved" badge that ticks up as the flow finishes early — shows
 *     the wall-clock gap (~750 - 73 ≈ 677 ms) directly.
 *   - Speed slider takes effect mid-run (no awkward restart).
 *   - Replay also pauses any running tick before resetting, so spam-clicking
 *     can't double-schedule rAF frames.
 *   - Citation pill bottom-right.
 *
 * Exports: window.Viz_runtime_race = { init(rootEl) }
 */
(function () {
  'use strict';

  var AR_CELLS = 60;
  var FLOW_STEPS = 10;
  var FLOW_CELL_GROUP = 6;            // visualize 6 "parallel" cells per Euler step
  var FLOW_CELLS = FLOW_STEPS * FLOW_CELL_GROUP;

  // Anchored to PiData; see π₀ §D Table I and FAST §VI-D.
  var AR_TOTAL_MS   = (window.PiData && window.PiData.LATENCY_PI0_FAST_MS) || 750;
  var FLOW_TOTAL_MS = (window.PiData && window.PiData.LATENCY_PI0_FLOW_MS) || 73;

  var COLORS = {
    ar:    '#c0392b',
    arDim: '#e8b8b1',
    flow:  '#1abc9c',
    flowDim: '#a4e1d4',
    cellOff: '#e8e8e8',
    cellGrid: '#cfcfcf',
    ink:   '#1a1a1a',
    muted: '#666',
    border: '#d0d0d0',
    saved: '#2a5aa8'
  };

  // Visual duration at 1× speed: stretch real wall-clock 6.6× so the AR run
  // takes ~5s of perceptual time.  Flow finishes in proportional time.
  var VISUAL_DUR_AR_MS = 5000;
  var VISUAL_DUR_FLOW_MS = VISUAL_DUR_AR_MS * (FLOW_TOTAL_MS / AR_TOTAL_MS);

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="runtime_race" style="background:#fafafa;border:1px solid ' + COLORS.border + ';border-radius:6px;padding:14px;position:relative">' +

        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">Runtime race &mdash; AR vs flow</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1;min-width:280px">' +
            '~60 sequential AR decodes vs 10 parallel flow steps, on the same wall clock.' +
          '</div>' +
        '</header>' +

        // ----- AR strip -----
        '<div style="margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;flex-wrap:wrap">' +
            '<div style="font-weight:600;color:' + COLORS.ar + ';font-size:13px">' +
              '&pi;<sub>0</sub>-FAST &middot; AR over FAST tokens &middot; ' + AR_CELLS + ' sequential decodes' +
            '</div>' +
            '<div class="js-ar-clock" style="font-family:var(--mono,monospace);font-size:13px;color:' + COLORS.ar + ';font-weight:600">0 ms</div>' +
          '</div>' +
          '<div class="js-ar-strip" style="display:grid;grid-template-columns:repeat(' + AR_CELLS + ',1fr);gap:1px;height:32px;background:' + COLORS.cellGrid + ';padding:1px;border-radius:3px"></div>' +
          '<div style="font-size:10.5px;color:' + COLORS.muted + ';margin-top:2px;font-style:italic">' +
            'sequential — each cell waits for the previous token\'s logits' +
          '</div>' +
        '</div>' +

        // ----- Flow strip -----
        '<div style="margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;flex-wrap:wrap">' +
            '<div style="font-weight:600;color:' + COLORS.flow + ';font-size:13px">' +
              '&pi;<sub>0</sub> &middot; flow matching &middot; ' + FLOW_STEPS + ' Euler steps (parallel within a step)' +
            '</div>' +
            '<div class="js-flow-clock" style="font-family:var(--mono,monospace);font-size:13px;color:' + COLORS.flow + ';font-weight:600">0 ms</div>' +
          '</div>' +
          '<div class="js-flow-strip" style="display:grid;grid-template-columns:repeat(' + FLOW_STEPS + ',1fr);gap:3px;height:32px;background:' + COLORS.cellGrid + ';padding:1px;border-radius:3px"></div>' +
          '<div style="font-size:10.5px;color:' + COLORS.muted + ';margin-top:2px;font-style:italic">' +
            'each block = one Euler step; the H action tokens inside it denoise in parallel' +
          '</div>' +
        '</div>' +

        // ----- Time-saved + controls row -----
        '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:8px;margin-bottom:8px">' +
          '<button class="js-play" style="background:#1a1a1a;color:#fff;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">&#9654; play</button>' +
          '<button class="js-replay" style="background:#fff;border:1px solid #aaa;padding:7px 12px;border-radius:4px;cursor:pointer;font-size:13px">&#8635; replay</button>' +
          '<label style="font-size:12px;color:#555;display:inline-flex;align-items:center;gap:6px">speed' +
            '<select class="js-speed" style="font-size:12px;padding:3px 6px">' +
              '<option value="0.25">0.25&times;</option>' +
              '<option value="1" selected>1&times;</option>' +
              '<option value="4">4&times;</option>' +
            '</select>' +
          '</label>' +
          '<div class="js-saved" style="margin-left:auto;font-family:var(--mono,monospace);font-size:13px;color:' + COLORS.saved + ';font-weight:600;display:none">' +
            'time saved: <span class="js-saved-ms">0</span> ms' +
          '</div>' +
        '</div>' +

        '<div class="viz-caption" style="margin-top:12px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          'AR is sequential by construction &mdash; token <em>k+1</em> needs token <em>k</em>\'s value, no time-axis parallelism. ' +
          'Flow is parallel within an Euler step &mdash; all H action tokens denoised in one forward pass. ' +
          'Per &pi;<sub>0</sub> &sect;D Table I (RTX 4090, 3 cameras): ' +
          '<b>flow ~' + FLOW_TOTAL_MS + ' ms / chunk</b>. Per FAST &sect;VI-D: <b>AR ~' + AR_TOTAL_MS + ' ms / chunk</b>. ' +
          'Cell-fill animation is schematic; numbers are measured.' +
        '</div>' +

      '</div>';

    // Build cells
    var arStrip = rootEl.querySelector('.js-ar-strip');
    var flowStrip = rootEl.querySelector('.js-flow-strip');
    var arHTML = '';
    for (var i = 0; i < AR_CELLS; i++) {
      arHTML += '<div class="js-ar-cell" style="background:' + COLORS.cellOff + ';height:100%;transition:background 80ms"></div>';
    }
    var flowHTML = '';
    for (var s = 0; s < FLOW_STEPS; s++) {
      // Each "step" is a vertical block holding FLOW_CELL_GROUP horizontal mini-cells
      flowHTML +=
        '<div class="js-flow-step" data-step="' + s + '" style="display:grid;grid-template-rows:repeat(' + FLOW_CELL_GROUP + ',1fr);gap:1px;background:' + COLORS.cellOff + ';border-radius:2px;overflow:hidden;height:100%">';
      for (var g = 0; g < FLOW_CELL_GROUP; g++) {
        flowHTML += '<div class="js-flow-mini" data-step="' + s + '" style="background:' + COLORS.cellOff + ';transition:background 60ms"></div>';
      }
      flowHTML += '</div>';
    }
    arStrip.innerHTML = arHTML;
    flowStrip.innerHTML = flowHTML;

    var arCells = rootEl.querySelectorAll('.js-ar-cell');
    var flowSteps = rootEl.querySelectorAll('.js-flow-step');
    var flowMinis = rootEl.querySelectorAll('.js-flow-mini');
    var arClock = rootEl.querySelector('.js-ar-clock');
    var flowClock = rootEl.querySelector('.js-flow-clock');
    var playBtn = rootEl.querySelector('.js-play');
    var replayBtn = rootEl.querySelector('.js-replay');
    var speedSel = rootEl.querySelector('.js-speed');
    var savedEl = rootEl.querySelector('.js-saved');
    var savedMsEl = rootEl.querySelector('.js-saved-ms');

    var state = {
      playing: false,
      speed: 1.0,
      startedAt: 0,
      arDone: 0,
      flowStepDone: 0,
      raf: 0,
      flowFinishedAt: 0
    };

    function clearMini(idx, dim) {
      flowMinis[idx].style.background = dim ? COLORS.flowDim : COLORS.cellOff;
    }

    function fillCellsAR(count) {
      for (var i = 0; i < count; i++) arCells[i].style.background = COLORS.ar;
    }
    function fillFlowStepsUpTo(stepCount) {
      // Each completed step → all 6 minis in flow color (saturated).
      // For the *current* in-progress step (stepCount may be fractional),
      // we paint a paler "in flight" color.
      for (var s = 0; s < FLOW_STEPS; s++) {
        var startIdx = s * FLOW_CELL_GROUP;
        var endIdx = startIdx + FLOW_CELL_GROUP;
        for (var k = startIdx; k < endIdx; k++) {
          if (s < stepCount) {
            flowMinis[k].style.background = COLORS.flow;
          } else {
            flowMinis[k].style.background = COLORS.cellOff;
          }
        }
      }
    }

    function pulseFlowStep(stepIdx) {
      // brief brighten-pulse on the in-flight step so user sees parallel firing.
      if (stepIdx < 0 || stepIdx >= FLOW_STEPS) return;
      var startIdx = stepIdx * FLOW_CELL_GROUP;
      for (var k = 0; k < FLOW_CELL_GROUP; k++) {
        flowMinis[startIdx + k].style.background = COLORS.flowDim;
      }
    }

    function reset() {
      state.playing = false;
      state.arDone = 0;
      state.flowStepDone = 0;
      state.flowFinishedAt = 0;
      arClock.textContent = '0 ms';
      flowClock.textContent = '0 ms';
      for (var i = 0; i < arCells.length; i++) arCells[i].style.background = COLORS.cellOff;
      for (var f = 0; f < flowMinis.length; f++) flowMinis[f].style.background = COLORS.cellOff;
      playBtn.innerHTML = '&#9654; play';
      savedEl.style.display = 'none';
      cancelAnimationFrame(state.raf);
    }

    function tick() {
      if (!state.playing) return;
      var now = performance.now();
      var elapsedScaled = (now - state.startedAt) * state.speed;

      var arRatio   = Math.min(1, elapsedScaled / VISUAL_DUR_AR_MS);
      var flowRatioRaw = Math.min(1, elapsedScaled / VISUAL_DUR_FLOW_MS);

      var arN = Math.floor(arRatio * AR_CELLS);
      if (arN !== state.arDone) {
        fillCellsAR(arN);
        state.arDone = arN;
      }

      // For flow: integer step done count + a current in-flight pulse.
      var flowStepsFloat = flowRatioRaw * FLOW_STEPS;
      var flowStepsDone = Math.floor(flowStepsFloat);
      if (flowStepsDone !== state.flowStepDone) {
        state.flowStepDone = flowStepsDone;
        fillFlowStepsUpTo(state.flowStepDone);
      } else {
        // pulse the in-flight step
        if (flowStepsDone < FLOW_STEPS) {
          pulseFlowStep(flowStepsDone);
        }
      }

      arClock.textContent = Math.round(arRatio * AR_TOTAL_MS) + ' ms';
      flowClock.textContent = Math.round(flowRatioRaw * FLOW_TOTAL_MS) + ' ms';

      // Time-saved badge: starts ticking once flow is done, until AR catches up.
      if (flowRatioRaw >= 1) {
        if (!state.flowFinishedAt) state.flowFinishedAt = now;
        savedEl.style.display = 'inline-block';
        var savedMs = Math.round((arRatio * AR_TOTAL_MS) - FLOW_TOTAL_MS);
        savedMsEl.textContent = Math.max(0, savedMs);
        // Make sure flow strip is fully filled
        fillFlowStepsUpTo(FLOW_STEPS);
      }

      if (arRatio >= 1 && flowRatioRaw >= 1) {
        state.playing = false;
        playBtn.innerHTML = '&#9654; play';
        savedMsEl.textContent = (AR_TOTAL_MS - FLOW_TOTAL_MS).toString();
        return;
      }
      state.raf = requestAnimationFrame(tick);
    }

    function play() {
      if (state.playing) {
        state.playing = false;
        playBtn.innerHTML = '&#9654; resume';
        cancelAnimationFrame(state.raf);
        return;
      }
      if (state.arDone >= AR_CELLS && state.flowStepDone >= FLOW_STEPS) reset();
      state.playing = true;
      // Recompute startedAt based on what's already done so resume picks up cleanly.
      var arElapsedScaled = (state.arDone / AR_CELLS) * VISUAL_DUR_AR_MS;
      state.startedAt = performance.now() - arElapsedScaled / state.speed;
      playBtn.innerHTML = '&#10073;&#10073; pause';
      tick();
    }

    playBtn.addEventListener('click', play);
    replayBtn.addEventListener('click', function () { reset(); });
    speedSel.addEventListener('change', function () {
      var newSpeed = parseFloat(speedSel.value);
      if (state.playing) {
        // Re-anchor startedAt so the visible position doesn't jump.
        var arElapsedScaled = (state.arDone / AR_CELLS) * VISUAL_DUR_AR_MS;
        state.speed = newSpeed;
        state.startedAt = performance.now() - arElapsedScaled / state.speed;
      } else {
        state.speed = newSpeed;
      }
    });

    // Reduced motion: pre-fill the final state, no animation.
    if (typeof SharedPi !== 'undefined' && SharedPi.reducedMotion && SharedPi.reducedMotion()) {
      fillCellsAR(AR_CELLS);
      fillFlowStepsUpTo(FLOW_STEPS);
      arClock.textContent = AR_TOTAL_MS + ' ms';
      flowClock.textContent = FLOW_TOTAL_MS + ' ms';
      savedEl.style.display = 'inline-block';
      savedMsEl.textContent = (AR_TOTAL_MS - FLOW_TOTAL_MS).toString();
      playBtn.disabled = true;
      playBtn.style.opacity = '0.5';
      playBtn.title = 'animation disabled by prefers-reduced-motion';
    }

    // Citation pill — measured numbers.
    if (typeof SharedPi !== 'undefined' && SharedPi.citationPill) {
      SharedPi.citationPill(rootEl, 'π₀ §D Table I · FAST §VI-D (measured)');
    }
  }

  window.Viz_runtime_race = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-runtime_race');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
