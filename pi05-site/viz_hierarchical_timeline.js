/* viz_hierarchical_timeline.js
   Concept taught: π₀.5 has TWO clocks. The high-level VLM emits a natural-
   language subtask string at chunk boundaries (~1 Hz). The low-level action
   expert flow-matches a continuous chunk at chunk-rate. The 50 Hz control
   loop consumes the chunk action-by-action. Three stacked tracks make the
   asymmetric rates visible.
*/
(function () {
  const C = window.PiColors;
  const canvas = document.getElementById('viz-hierarchical-timeline');
  if (!canvas) return;
  const W = 1000, H = 360;
  const ctx = setupHiDPICanvas(canvas, W, H);

  // Mock 10-second mock task: pick → place → wipe (3 subtasks across ~10 s)
  const SUBTASKS = [
    { start: 0.0, end: 3.0, text: 'pick up the sponge' },
    { start: 3.0, end: 6.5, text: 'place on counter' },
    { start: 6.5, end: 10.0, text: 'wipe surface' }
  ];
  const T_MIN = 0;
  const T_MAX = 10;
  const CHUNK_S = 1.0; // 1 second per chunk
  const CTRL_HZ = 50;

  // For each chunk, derive a stylized 50-action mini-pattern (smoothed sine
  // family) so that the LL-track bars look distinct.
  function chunkPattern(chunkIdx) {
    const out = [];
    for (let i = 0; i < 50; i++) {
      const u = i / 49;
      const v = Math.sin(2 * Math.PI * (u + chunkIdx * 0.17)) * 0.5
              + Math.sin(4 * Math.PI * (u + chunkIdx * 0.07)) * 0.2;
      out.push(v);
    }
    return out;
  }

  const state = {
    playhead: 0.0, // seconds
    playing: false,
    lastTs: 0
  };

  /* ---------- layout ---------- */
  const PAD_L = 90;
  const PAD_R = 20;
  const TRACK_H = 70;
  const TRACK_GAP = 18;
  const TRACK0_Y = 50;                   // HL
  const TRACK1_Y = TRACK0_Y + TRACK_H + TRACK_GAP; // LL
  const TRACK2_Y = TRACK1_Y + TRACK_H + TRACK_GAP; // ctrl

  function tToX(t) {
    return PAD_L + (t - T_MIN) / (T_MAX - T_MIN) * (W - PAD_L - PAD_R);
  }

  function draw() {
    ctx.fillStyle = C.bgFig;
    ctx.fillRect(0, 0, W, H);

    // labels left
    ctx.fillStyle = C.inkMuted;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('HL  · ~1 Hz', PAD_L - 10, TRACK0_Y + TRACK_H / 2);
    ctx.fillText('LL  · 1 Hz chunks', PAD_L - 10, TRACK1_Y + TRACK_H / 2);
    ctx.fillText('control · 50 Hz', PAD_L - 10, TRACK2_Y + TRACK_H / 2);

    drawHL();
    drawLL();
    drawCtrl();

    // playhead
    const phX = tToX(state.playhead);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(phX, TRACK0_Y - 4);
    ctx.lineTo(phX, TRACK2_Y + TRACK_H + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // bottom: time axis
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= 10; s++) {
      const x = tToX(s);
      ctx.fillRect(x - 0.5, TRACK2_Y + TRACK_H + 6, 1, 5);
      ctx.fillText(s + 's', x, TRACK2_Y + TRACK_H + 14);
    }

    // current-subtask readout
    const cur = SUBTASKS.find((s) => state.playhead >= s.start && state.playhead < s.end);
    ctx.fillStyle = C.ink;
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('subtask now: "' + (cur ? cur.text : '—') + '"', PAD_L, 18);
    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('t = ' + state.playhead.toFixed(2) + 's', W - PAD_R, 22);
  }

  function drawHL() {
    // background of the track
    ctx.fillStyle = 'rgba(180,140,255,0.05)';
    ctx.fillRect(PAD_L, TRACK0_Y, W - PAD_L - PAD_R, TRACK_H);

    // each subtask as a rectangle + bubble
    for (let i = 0; i < SUBTASKS.length; i++) {
      const st = SUBTASKS[i];
      const x0 = tToX(st.start);
      const x1 = tToX(st.end);
      const isCur = state.playhead >= st.start && state.playhead < st.end;
      // emission pulse at boundary
      ctx.fillStyle = isCur ? C.vlm : 'rgba(180,140,255,0.4)';
      ctx.fillRect(x0, TRACK0_Y + 12, 3, TRACK_H - 24);
      // bubble
      ctx.fillStyle = isCur ? 'rgba(180,140,255,0.18)' : 'rgba(180,140,255,0.08)';
      ctx.fillRect(x0 + 5, TRACK0_Y + 22, x1 - x0 - 8, 30);
      ctx.strokeStyle = isCur ? C.vlm : C.ruleStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 5.5, TRACK0_Y + 22.5, x1 - x0 - 9, 29);

      ctx.fillStyle = isCur ? C.inkStrong : C.ink;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('"' + st.text + '"', x0 + 12, TRACK0_Y + 37);
    }

    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('VLM autoregressively decodes a string at each subtask boundary', PAD_L, TRACK0_Y - 12);
  }

  function drawLL() {
    ctx.fillStyle = 'rgba(255,168,77,0.05)';
    ctx.fillRect(PAD_L, TRACK1_Y, W - PAD_L - PAD_R, TRACK_H);

    const N_CHUNKS = 10;
    for (let i = 0; i < N_CHUNKS; i++) {
      const t0 = i * CHUNK_S;
      const t1 = (i + 1) * CHUNK_S;
      const x0 = tToX(t0);
      const x1 = tToX(t1);
      const isCur = state.playhead >= t0 && state.playhead < t1;
      // chunk box
      ctx.fillStyle = isCur ? 'rgba(255,168,77,0.32)' : 'rgba(255,168,77,0.12)';
      ctx.fillRect(x0 + 2, TRACK1_Y + 10, x1 - x0 - 4, TRACK_H - 20);
      ctx.strokeStyle = isCur ? C.action : 'rgba(255,168,77,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 2.5, TRACK1_Y + 10.5, x1 - x0 - 5, TRACK_H - 21);

      // 50-action mini-pattern inside
      const pat = chunkPattern(i);
      const innerX = x0 + 4, innerW = x1 - x0 - 8;
      const innerY = TRACK1_Y + 12, innerH = TRACK_H - 24;
      ctx.strokeStyle = isCur ? C.action : 'rgba(255,168,77,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < pat.length; k++) {
        const xx = innerX + (k / (pat.length - 1)) * innerW;
        const yy = innerY + innerH / 2 - pat[k] * (innerH * 0.4);
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('action expert flow-matches a 1-second chunk at every chunk boundary', PAD_L, TRACK1_Y - 12);
  }

  function drawCtrl() {
    ctx.fillStyle = 'rgba(94,234,212,0.04)';
    ctx.fillRect(PAD_L, TRACK2_Y, W - PAD_L - PAD_R, TRACK_H);

    // 50 Hz ticks across 10 s = 500 ticks; we draw every 5th to keep legible.
    const x0 = PAD_L, x1 = W - PAD_R;
    const tickColor = C.flow;
    ctx.fillStyle = tickColor;
    const N = 200; // 50 Hz × 10s / 2.5
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 10;
      if (t > state.playhead) break;
      const x = tToX(t);
      ctx.fillRect(x, TRACK2_Y + 22, 1, TRACK_H - 44);
    }
    // future ticks: dimmed
    ctx.fillStyle = 'rgba(94,234,212,0.18)';
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 10;
      if (t <= state.playhead) continue;
      const x = tToX(t);
      ctx.fillRect(x, TRACK2_Y + 22, 1, TRACK_H - 44);
    }

    ctx.fillStyle = C.inkMuted;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('robot consumes one action every 20 ms (50 Hz)', PAD_L, TRACK2_Y - 12);
  }

  /* ---------- controls ---------- */
  const playBtn = document.getElementById('hier-play');
  const slider = document.getElementById('hier-scrub');
  const readout = document.getElementById('hier-scrub-readout');

  if (slider) {
    slider.addEventListener('input', (e) => {
      state.playhead = parseFloat(e.target.value) / 100 * 10;
      if (readout) readout.textContent = state.playhead.toFixed(2) + 's';
      state.playing = false;
      if (playBtn) playBtn.textContent = 'play';
      draw();
    });
  }
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.playing) {
        state.playing = false;
        playBtn.textContent = 'play';
        return;
      }
      if (state.playhead >= 10) state.playhead = 0;
      state.playing = true;
      playBtn.textContent = 'pause';
      state.lastTs = performance.now();
      requestAnimationFrame(loop);
    });
  }
  function loop(ts) {
    if (!state.playing) return;
    const dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    state.playhead += dt * 1.0;
    if (state.playhead >= 10) {
      state.playhead = 10;
      state.playing = false;
      if (playBtn) playBtn.textContent = 'play';
    }
    if (slider) slider.value = String(Math.round(state.playhead / 10 * 100));
    if (readout) readout.textContent = state.playhead.toFixed(2) + 's';
    draw();
    if (state.playing) requestAnimationFrame(loop);
  }

  draw();
})();
