// chart-composition.js — 100% stacked area, per-video granularity.
// One data point per dated video, normalized to {BTC, USD, ETH, SOL} only
// (everything else dropped, then the 4 are renormalized to sum to 100%).
// Default zoom: last 4 months. Drag the dataZoom slider to pan/zoom.

const MOUNT_ID = 'cc-chart-composition';
const ASSETS = ['BTC', 'ETH', 'SOL', 'USD'];
const SIZE_WEIGHT = { small: 1, medium: 2, large: 3 };
const DEFAULT_WEIGHT = 1.5;
const DEFAULT_WINDOW_DAYS = 120; // ~4 months

let chart = null;

function parseDate(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return null;
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}

function buildPerVideoSeries(data) {
  const byVideo = data.byVideo || {};
  const rows = [];
  for (const vid of Object.keys(byVideo)) {
    const rec = byVideo[vid];
    if (!rec) continue;
    const ts = parseDate(rec.calendar_date || rec.date);
    if (ts == null) continue;

    // Sum size-weighted "voice" per asset (restricted to the 4 displayed).
    const sums = { BTC: 0, ETH: 0, SOL: 0, USD: 0 };
    const addVoice = (asset, size) => {
      if (!ASSETS.includes(asset)) return;
      const w = SIZE_WEIGHT[size] != null ? SIZE_WEIGHT[size] : DEFAULT_WEIGHT;
      sums[asset] += w;
    };
    for (const h of rec.holdings || []) addVoice(h.asset, h.size);
    if (rec.cash_position && rec.cash_position.asset) {
      addVoice(rec.cash_position.asset, rec.cash_position.size);
    }
    const total = sums.BTC + sums.ETH + sums.SOL + sums.USD;
    if (total <= 0) continue; // skip videos with no mention of the 4 displayed assets

    rows.push({
      ts,
      date: rec.calendar_date || rec.date,
      title: rec.title || vid,
      vid,
      shares: {
        BTC: (sums.BTC / total) * 100,
        ETH: (sums.ETH / total) * 100,
        SOL: (sums.SOL / total) * 100,
        USD: (sums.USD / total) * 100,
      },
    });
  }
  rows.sort((a, b) => a.ts - b.ts);
  return rows;
}

function renderEmpty(el, msg) {
  el.innerHTML = `<div class="cc-empty">${msg || 'no dated videos yet'}</div>`;
}

function render(data) {
  const el = document.getElementById(MOUNT_ID);
  if (!el) return;
  if (!window.echarts) {
    el.innerHTML = '<div class="cc-empty">echarts failed to load</div>';
    return;
  }
  const rows = buildPerVideoSeries(data);
  if (!rows.length) { renderEmpty(el, 'no dated videos mentioning BTC/ETH/SOL/USD'); return; }

  const palette = (data.meta && data.meta.asset_palette) || {};
  const series = ASSETS.map((asset) => ({
    name: asset,
    type: 'line',
    stack: 'composition',
    smooth: 0.18,
    showSymbol: true,
    symbolSize: 4,
    areaStyle: { color: palette[asset] || '#888', opacity: 0.85 },
    itemStyle: { color: palette[asset] || '#888' },
    lineStyle: { width: 0.5, color: palette[asset] || '#888' },
    emphasis: { focus: 'series' },
    data: rows.map((r) => [r.ts, +r.shares[asset].toFixed(2)]),
  }));

  // Default zoom: last DEFAULT_WINDOW_DAYS, or full range if shorter.
  const latest = rows[rows.length - 1].ts;
  const earliest = rows[0].ts;
  const winStart = Math.max(earliest, latest - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
  const startPct = ((winStart - earliest) / Math.max(1, latest - earliest)) * 100;

  // Keep mount empty-card chrome, mount echarts in a child div so the
  // existing header (h3 + sub) renders above the chart.
  const existing = el.querySelector('.cc-chart-canvas');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.className = 'cc-chart-canvas';
  wrap.style.width = '100%';
  wrap.style.height = '440px';
  el.appendChild(wrap);
  if (chart) chart.dispose();
  chart = window.echarts.init(wrap, null, { renderer: 'canvas' });

  // Index rows by ms-timestamp for tooltip lookup.
  const rowByTs = new Map(rows.map((r) => [r.ts, r]));

  chart.setOption({
    grid: { left: 52, right: 16, top: 36, bottom: 72 },
    color: ASSETS.map((a) => palette[a] || '#888'),
    legend: {
      top: 0,
      right: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11, color: '#1d1d1f' },
      data: ASSETS,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: 'rgba(253,252,250,0.96)',
      borderColor: '#e8e3da',
      borderWidth: 1,
      textStyle: { color: '#1d1d1f', fontSize: 12 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const ts = params[0].value[0];
        const r = rowByTs.get(ts);
        const date = r ? r.date : new Date(ts).toISOString().slice(0, 10);
        const title = r ? r.title : '';
        const rows = params
          .slice()
          .sort((a, b) => (b.value[1] || 0) - (a.value[1] || 0))
          .map((p) => {
            const v = (p.value[1] || 0).toFixed(1);
            return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.7"><span style="width:10px;height:10px;border-radius:2px;background:${p.color}"></span><span style="flex:1">${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${v}%</span></div>`;
          })
          .join('');
        const head = `<div style="font-weight:600;margin-bottom:2px">${date}</div><div style="font-size:11px;color:#6b6558;margin-bottom:6px;max-width:280px;white-space:normal">${title}</div>`;
        return head + rows;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#d6cfc1' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b6558', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee9df' } },
      axisLabel: { color: '#6b6558', fontSize: 11, formatter: '{value}%' },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: startPct,
        end: 100,
        zoomLock: false,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: startPct,
        end: 100,
        height: 22,
        bottom: 14,
        borderColor: '#d6cfc1',
        fillerColor: 'rgba(29,78,216,0.08)',
        handleStyle: { color: '#1d4ed8', borderColor: '#1d4ed8' },
        textStyle: { color: '#6b6558', fontSize: 10 },
      },
    ],
    series,
    animation: false,
  });

  if (!render._resizeBound) {
    window.addEventListener('resize', () => chart && chart.resize());
    render._resizeBound = true;
  }
}

export { render };
