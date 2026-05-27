// chart-btc-overlay.js — BTC price (left axis) vs his BTC portfolio % (right axis).
// Lets you see whether he was rotating INTO Bitcoin as the price fell (and
// the reverse). Skool ground-truth snapshots only.

const MOUNT_ID = 'cc-chart-btc-overlay';
const DEFAULT_WINDOW_DAYS = 180;

let chart = null;

function parseDate(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return null;
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}

async function loadJson(url, fallback) {
  try {
    const r = await fetch(url);
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

function renderEmpty(el, msg) {
  el.innerHTML = `<div class="cc-empty">${msg || 'no data'}</div>`;
}

async function render(data) {
  const el = document.getElementById(MOUNT_ID);
  if (!el) return;
  if (!window.echarts) {
    el.innerHTML = '<div class="cc-empty">echarts failed to load</div>';
    return;
  }

  const [snaps, prices] = await Promise.all([
    loadJson('./data/skool_portfolio_snapshots.json', []),
    loadJson('./data/btc_price.json', []),
  ]);
  if (!snaps.length || !prices.length) {
    renderEmpty(el, 'awaiting price + snapshot data');
    return;
  }

  // BTC price series: [ts, close]
  const priceData = prices
    .map((p) => {
      const ts = parseDate(p.date);
      const c = Number(p.close);
      return ts != null && Number.isFinite(c) ? [ts, +c.toFixed(2)] : null;
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  // BTC % series: [ts, btc_pct] from each snapshot. Skip rows without BTC.
  const pctData = snaps
    .map((s) => {
      const ts = parseDate(s.date || s.created_at);
      const a = s.allocation || {};
      const btc = Number(a.BTC);
      if (ts == null || !Number.isFinite(btc) || btc <= 0) return null;
      return [ts, +btc.toFixed(1), String(s.source || '').startsWith('forward-fill')];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  if (!priceData.length || !pctData.length) { renderEmpty(el, 'no overlapping data'); return; }

  // Default zoom: last DEFAULT_WINDOW_DAYS of price data (snapshots overlap).
  const earliest = priceData[0][0];
  const latest = priceData[priceData.length - 1][0];
  const winStart = Math.max(earliest, latest - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
  const startPct = ((winStart - earliest) / Math.max(1, latest - earliest)) * 100;

  // BTC orange from palette
  const palette = (data.meta && data.meta.asset_palette) || {};
  const BTC = palette.BTC || '#F7931A';
  const PRICE_COLOR = '#1d1d1f'; // ink, neutral

  const existing = el.querySelector('.cc-chart-canvas');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.className = 'cc-chart-canvas';
  wrap.style.width = '100%';
  wrap.style.height = '440px';
  el.appendChild(wrap);
  if (chart) chart.dispose();
  chart = window.echarts.init(wrap, null, { renderer: 'canvas' });

  chart.setOption({
    grid: { left: 64, right: 56, top: 36, bottom: 72 },
    legend: {
      top: 0,
      right: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11, color: '#1d1d1f' },
      data: ['BTC price (USD)', 'BTC % of portfolio'],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(253,252,250,0.96)',
      borderColor: '#e8e3da',
      borderWidth: 1,
      textStyle: { color: '#1d1d1f', fontSize: 12 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const ts = params[0].value[0];
        const date = new Date(ts).toISOString().slice(0, 10);
        const lines = params.map((p) => {
          const v = p.value[1];
          let formatted;
          if (p.seriesName === 'BTC price (USD)') {
            formatted = `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          } else {
            formatted = `${Number(v).toFixed(1)}%`;
          }
          return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.7"><span style="width:10px;height:10px;border-radius:2px;background:${p.color}"></span><span style="flex:1">${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${formatted}</span></div>`;
        }).join('');
        return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines}`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#d6cfc1' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b6558', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'BTC price',
        nameTextStyle: { color: PRICE_COLOR, fontSize: 11, padding: [0, 0, 0, 30] },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#eee9df' } },
        axisLabel: {
          color: PRICE_COLOR,
          fontSize: 11,
          formatter: (v) => '$' + Math.round(v / 1000) + 'k',
        },
      },
      {
        type: 'value',
        name: 'BTC %',
        nameTextStyle: { color: BTC, fontSize: 11, padding: [0, 30, 0, 0] },
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: BTC, fontSize: 11, formatter: '{value}%' },
      },
    ],
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
    series: [
      {
        name: 'BTC price (USD)',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        smooth: 0,
        lineStyle: { width: 1.5, color: PRICE_COLOR },
        itemStyle: { color: PRICE_COLOR },
        data: priceData,
        z: 1,
      },
      {
        name: 'BTC % of portfolio',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.15,
        symbolSize: 6,
        lineStyle: { width: 2, color: BTC },
        itemStyle: { color: BTC },
        data: pctData.map((d) => ({
          value: [d[0], d[1]],
          // forward-filled = hollow ring; text-parsed = solid
          itemStyle: d[2]
            ? { color: '#fdfcfa', borderColor: BTC, borderWidth: 1.5 }
            : { color: BTC },
          symbolSize: d[2] ? 5 : 6,
        })),
        z: 2,
      },
    ],
    animation: false,
  });

  if (!render._resizeBound) {
    window.addEventListener('resize', () => chart && chart.resize());
    render._resizeBound = true;
  }
}

export { render };
