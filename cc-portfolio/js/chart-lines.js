// chart-lines.js — UNSTACKED line chart of Skool ground-truth allocations.
// Same data as chart-composition.js, but each asset gets its own line so
// you can read each trajectory independently. No stack, no area fill.

const MOUNT_ID = 'cc-chart-lines';
const ASSETS = ['BTC', 'ETH', 'SOL', 'USD'];
const DEFAULT_WINDOW_DAYS = 120;

let chart = null;

function parseDate(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return null;
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}

async function loadSnapshots() {
  try {
    const r = await fetch('./data/skool_portfolio_snapshots.json');
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

function renderEmpty(el, msg) {
  el.innerHTML = `<div class="cc-empty">${msg || 'no portfolio snapshots'}</div>`;
}

async function render(data) {
  const el = document.getElementById(MOUNT_ID);
  if (!el) return;
  if (!window.echarts) {
    el.innerHTML = '<div class="cc-empty">echarts failed to load</div>';
    return;
  }
  const snaps = await loadSnapshots();
  if (!snaps.length) { renderEmpty(el, 'awaiting portfolio snapshots'); return; }

  const rows = snaps
    .map((s) => {
      const ts = parseDate(s.date || s.created_at);
      if (ts == null) return null;
      const a = s.allocation || {};
      const shares = {};
      let total = 0;
      for (const k of ASSETS) {
        const v = Number(a[k]) || 0;
        shares[k] = v;
        total += v;
      }
      if (total <= 0) return null;
      // Re-normalize each row to 100 so lines reflect comparable proportions
      // even when some allocations were stripped (e.g. SOL=0 after a sale).
      for (const k of ASSETS) shares[k] = (shares[k] / total) * 100;
      return { ts, date: s.date, shares };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  if (!rows.length) { renderEmpty(el, 'snapshots failed to load'); return; }

  const palette = (data.meta && data.meta.asset_palette) || {};
  const series = ASSETS.map((asset) => ({
    name: asset,
    type: 'line',
    smooth: 0.15,
    showSymbol: true,
    symbolSize: 5,
    itemStyle: { color: palette[asset] || '#888' },
    lineStyle: { width: 2, color: palette[asset] || '#888' },
    emphasis: { focus: 'series', lineStyle: { width: 3 } },
    data: rows.map((r) => [r.ts, +r.shares[asset].toFixed(2)]),
  }));

  const earliest = rows[0].ts;
  const latest = rows[rows.length - 1].ts;
  const winStart = Math.max(earliest, latest - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
  const startPct = ((winStart - earliest) / Math.max(1, latest - earliest)) * 100;

  const rowByTs = new Map(rows.map((r) => [r.ts, r]));

  const existing = el.querySelector('.cc-chart-canvas');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.className = 'cc-chart-canvas';
  wrap.style.width = '100%';
  wrap.style.height = '440px';
  el.appendChild(wrap);
  if (chart) chart.dispose();
  chart = window.echarts.init(wrap, null, { renderer: 'canvas' });

  // y-max: pick a tight upper bound that still leaves headroom (~5pts)
  let maxVal = 0;
  for (const r of rows) {
    for (const k of ASSETS) maxVal = Math.max(maxVal, r.shares[k]);
  }
  const yMax = Math.min(100, Math.ceil((maxVal + 5) / 5) * 5);

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
        const lines = params
          .slice()
          .sort((a, b) => (b.value[1] || 0) - (a.value[1] || 0))
          .map((p) => {
            const v = (p.value[1] || 0).toFixed(1);
            return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.7"><span style="width:10px;height:10px;border-radius:2px;background:${p.color}"></span><span style="flex:1">${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${v}%</span></div>`;
          })
          .join('');
        return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines}`;
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
      max: yMax,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee9df' } },
      axisLabel: { color: '#6b6558', fontSize: 11, formatter: '{value}%' },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: startPct, end: 100 },
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
