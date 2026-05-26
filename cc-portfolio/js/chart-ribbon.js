// js/chart-ribbon.js
// Agent 4 — Conviction Ribbon chart.
// One scatter point per (video × asset) holding, dated.
// X: calendar_date · Y: weight_pct (0–100) · color: asset · size: confidence.
// Holdings with null weight_pct render at y=0 as small hollow rings so they're
// visibly "size-hint only" instead of being silently dropped or imputed.

const MOUNT_ID = 'cc-chart-ribbon';
const FALLBACK_COLOR = '#888888';
const QUOTE_CLIP = 240;

let chart = null;
let lastData = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function darker(hex) {
  // Slightly darken a #rrggbb hex for marker borders.
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) {
    return '#555';
  }
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function radiusFromConfidence(conf) {
  // Linear map: confidence 0.2 -> r=3, 1.0 -> r=6. Clamp.
  const c = Math.max(0.2, Math.min(1.0, Number(conf) || 0.2));
  return 3 + ((c - 0.2) / 0.8) * 3;
}

function findEvidenceQuote(data, videoId, asset) {
  const v = data && data.byVideo && data.byVideo[videoId];
  if (!v || !Array.isArray(v.holdings)) return '';
  const match = v.holdings.find((h) => h && h.asset === asset);
  return (match && match.evidence_quote) || '';
}

function renderEmpty(el, data) {
  const ex = (data && data.kpis && data.kpis.n_videos_extracted) ?? 0;
  const tot = (data && data.meta && data.meta.n_videos_total) ?? 0;
  el.innerHTML =
    `<div class="cc-empty">awaiting extraction (${ex}/${tot} videos so far) · ` +
    `this chart renders one dot per video-asset holding, sized by speaker confidence</div>`;
}

function buildSeries(data) {
  const palette = (data.meta && data.meta.asset_palette) || {};
  const rows = (data.holdings || []).filter((r) => r && r.calendar_date);

  // Group by asset.
  const byAsset = new Map();
  for (const r of rows) {
    const asset = r.asset || 'OTHER';
    if (!byAsset.has(asset)) byAsset.set(asset, []);
    byAsset.get(asset).push(r);
  }

  const series = [];
  for (const [asset, arr] of byAsset.entries()) {
    const color = palette[asset] || FALLBACK_COLOR;
    const border = darker(color);

    // Split rows into numeric (has weight_pct) and null-weight (size-hint only).
    const numericData = [];
    const nullData = [];
    for (const r of arr) {
      const conf = r.confidence == null ? 0.5 : Number(r.confidence);
      const radius = radiusFromConfidence(conf);
      const base = {
        value: [r.calendar_date, null],
        symbolSize: radius * 2,
        meta: {
          asset,
          video_id: r.video_id,
          title: r.title,
          weight_pct: r.weight_pct,
          confidence: conf,
          instrument: r.instrument,
          size: r.size,
        },
      };
      if (r.weight_pct == null || r.weight_pct === '') {
        base.value = [r.calendar_date, 0];
        base.itemStyle = {
          color: 'transparent',
          borderColor: '#999',
          borderWidth: 1,
        };
        base.symbol = 'emptyCircle';
        nullData.push(base);
      } else {
        base.value = [r.calendar_date, Number(r.weight_pct)];
        base.itemStyle = {
          color,
          borderColor: border,
          borderWidth: 1,
        };
        numericData.push(base);
      }
    }

    if (numericData.length) {
      series.push({
        name: asset,
        type: 'scatter',
        data: numericData,
        emphasis: { focus: 'series', scale: 1.2 },
        z: 3,
      });
    }
    if (nullData.length) {
      series.push({
        name: asset, // same legend bucket
        type: 'scatter',
        data: nullData,
        symbol: 'emptyCircle',
        legendHoverLink: false,
        // Hide from legend so each asset is one toggle.
        // ECharts groups legend by series.name, so this still toggles together.
        emphasis: { focus: 'series' },
        z: 2,
      });
    }
  }

  return series;
}

function buildOption(data) {
  const palette = (data.meta && data.meta.asset_palette) || {};
  const series = buildSeries(data);
  const assetsPresent = Array.from(new Set(series.map((s) => s.name)));

  return {
    animation: false,
    color: assetsPresent.map((a) => palette[a] || FALLBACK_COLOR),
    legend: {
      top: 6,
      type: 'scroll',
      data: assetsPresent,
      textStyle: { fontSize: 11, color: '#555' },
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
    },
    grid: {
      left: 48,
      right: 24,
      top: 44,
      bottom: 64,
      containLabel: false,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: '#fff',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#222', fontSize: 12 },
      formatter: (p) => {
        const m = (p && p.data && p.data.meta) || {};
        const title = esc(m.title || '(untitled)');
        const wpStr = m.weight_pct == null
          ? '<span style="color:#888">size-hint only</span>'
          : `${esc(m.weight_pct)}%`;
        const confStr = m.confidence == null ? '—' : Number(m.confidence).toFixed(2);
        let quote = findEvidenceQuote(lastData, m.video_id, m.asset) || '';
        if (quote.length > QUOTE_CLIP) quote = quote.slice(0, QUOTE_CLIP - 1) + '…';
        const quoteHtml = quote
          ? `<div style="margin-top:6px;font-style:italic;color:#444;max-width:320px">“${esc(quote)}”</div>`
          : '';
        return (
          `<div style="font-weight:600;margin-bottom:2px;max-width:320px">${title}</div>` +
          `<div><b>${esc(m.asset)}</b> · ${wpStr} · conf ${esc(confStr)}</div>` +
          quoteHtml +
          `<div style="margin-top:6px;color:#888;font-size:11px">click for details</div>`
        );
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#666', fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      name: 'weight_pct',
      nameTextStyle: { color: '#888', fontSize: 11, padding: [0, 0, 0, -32] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#eee', type: 'solid' } },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 18,
        borderColor: 'transparent',
        backgroundColor: '#f5f3ee',
        fillerColor: 'rgba(180,170,150,0.25)',
        handleStyle: { color: '#bdb4a3' },
        textStyle: { color: '#888', fontSize: 10 },
      },
    ],
    series: [
      ...series,
      {
        // A faint dashed reference line at 50%.
        name: '__ref50',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#c8c0b0', type: 'dashed', width: 1 },
          label: {
            formatter: '50%',
            color: '#aaa',
            fontSize: 10,
            position: 'end',
          },
          data: [{ yAxis: 50 }],
        },
      },
    ],
  };
}

function attachInteractions(el) {
  if (!chart) return;

  chart.off('click');
  chart.on('click', (params) => {
    const m = params && params.data && params.data.meta;
    if (!m || !m.video_id) return;
    import('./data.js').then((mod) => {
      if (mod && typeof mod.setSelectedVideoId === 'function') {
        mod.setSelectedVideoId(m.video_id);
      }
    });
  });

  chart.off('legendselectchanged');
  chart.on('legendselectchanged', (params) => {
    // Find the asset that just got toggled-on, if any. If multiple selected, pass null.
    const sel = params && params.selected ? params.selected : {};
    const onAssets = Object.keys(sel).filter((k) => sel[k]);
    const asset = onAssets.length === 1 ? onAssets[0] : null;
    try {
      window.dispatchEvent(new CustomEvent('cc:asset', { detail: { asset } }));
    } catch (_) { /* noop */ }
  });
}

function dimNonSelectedAsset(asset) {
  if (!chart || !lastData) return;
  const opt = chart.getOption();
  if (!opt || !Array.isArray(opt.series)) return;
  const newSeries = opt.series.map((s) => {
    if (s.name === '__ref50') return s;
    const isMatch = !asset || s.name === asset;
    return {
      ...s,
      itemStyle: {
        ...(s.itemStyle || {}),
        opacity: isMatch ? 1 : 0.12,
      },
    };
  });
  chart.setOption({ series: newSeries }, { replaceMerge: ['series'] });
}

function markVideoDate(videoId) {
  if (!chart || !lastData || !videoId) return;
  const v = lastData.byVideo && lastData.byVideo[videoId];
  const dt = v && v.calendar_date;
  if (!dt) {
    // Clear marker.
    chart.setOption({
      series: [{ name: '__ref50', markLine: undefined }],
    });
    return;
  }
  const palette = (lastData.meta && lastData.meta.asset_palette) || {};
  chart.setOption({
    series: [{
      name: '__ref50',
      type: 'line',
      data: [],
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        lineStyle: { color: '#8a7a55', type: 'solid', width: 1 },
        label: {
          formatter: dt,
          color: '#8a7a55',
          fontSize: 10,
          position: 'insideEndTop',
        },
        data: [
          { xAxis: dt },
          // Also redraw the 50% line so we don't lose it.
          { yAxis: 50, lineStyle: { color: '#c8c0b0', type: 'dashed' } },
        ],
      },
    }],
  });
}

function attachWindowListeners() {
  if (attachWindowListeners._done) return;
  attachWindowListeners._done = true;

  window.addEventListener('cc:asset', (ev) => {
    const asset = ev && ev.detail && ev.detail.asset;
    dimNonSelectedAsset(asset || null);
  });

  window.addEventListener('cc:select', (ev) => {
    const vid = ev && ev.detail && ev.detail.videoId;
    if (vid) markVideoDate(vid);
  });

  window.addEventListener('resize', () => {
    if (chart) chart.resize();
  });
}

export function render(data) {
  const el = document.getElementById(MOUNT_ID);
  if (!el) return null;

  lastData = data || { holdings: [], byVideo: {}, meta: {}, kpis: {} };
  const rows = (lastData.holdings || []).filter((r) => r && r.calendar_date);

  if (!rows.length) {
    if (chart) { chart.dispose(); chart = null; }
    renderEmpty(el, lastData);
    return null;
  }

  // Clear any prior empty-state markup.
  if (el.querySelector('.cc-empty')) el.innerHTML = '';

  if (!window.echarts) {
    el.innerHTML = `<div class="cc-empty">chart library failed to load</div>`;
    return null;
  }

  if (!chart) {
    chart = window.echarts.init(el, null, { renderer: 'canvas' });
  }
  chart.setOption(buildOption(lastData), true);
  attachInteractions(el);
  attachWindowListeners();
  return chart;
}

export function update(data) {
  return render(data);
}
