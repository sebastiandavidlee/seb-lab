// chart-composition.js — 100% stacked area of portfolio composition over time.
// Each month bin shows what share of the speaker's "portfolio voice" each
// asset claimed that month. Composition is computed from per-video holdings:
//   size weight: small=1, medium=2, large=3, unknown=1.5
//   cash_position counts as a USD holding
// Months with no dated videos get gap markers (no stack).

const MOUNT_ID = 'cc-chart-composition';

const ASSET_ORDER = ['BTC', 'ETH', 'SOL', 'MSTR', 'ADA', 'AVAX', 'LINK', 'DOGE', 'XRP', 'OTHER', 'USD'];
const SIZE_WEIGHT = { small: 1, medium: 2, large: 3 };
const DEFAULT_WEIGHT = 1.5;
const SMOOTH_WINDOW = 3; // months
const MIN_VIDEOS_PER_MONTH = 1;

let chart = null;
let lastData = null;

function monthKey(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 7) return null;
  return iso.slice(0, 7); // YYYY-MM
}

function* monthRange(startKey, endKey) {
  // Inclusive iterator over YYYY-MM strings from start to end.
  if (!startKey || !endKey) return;
  let [y, m] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    yield `${y}-${String(m).padStart(2, '0')}`;
    m++;
    if (m > 12) { m = 1; y++; }
  }
}

function buildMonthlyComposition(data) {
  // perVideo: video_id -> { date, holdings: [{asset, weight}] }
  // We use byVideo (richer schema with size + cash_position).
  const byVideo = data.byVideo || {};
  const perMonthAsset = new Map(); // 'YYYY-MM' -> Map(asset -> weight sum)
  const videoCounts = new Map();   // 'YYYY-MM' -> count of dated videos
  let minKey = null, maxKey = null;

  for (const vid of Object.keys(byVideo)) {
    const rec = byVideo[vid];
    if (!rec) continue;
    const date = rec.calendar_date || rec.date;
    const mk = monthKey(date);
    if (!mk) continue;
    if (!minKey || mk < minKey) minKey = mk;
    if (!maxKey || mk > maxKey) maxKey = mk;

    videoCounts.set(mk, (videoCounts.get(mk) || 0) + 1);

    const buckets = perMonthAsset.get(mk) || new Map();
    const addWeight = (asset, size) => {
      if (!asset) return;
      const key = ASSET_ORDER.includes(asset) ? asset : 'OTHER';
      const w = SIZE_WEIGHT[size] != null ? SIZE_WEIGHT[size] : DEFAULT_WEIGHT;
      buckets.set(key, (buckets.get(key) || 0) + w);
    };
    for (const h of rec.holdings || []) {
      addWeight(h.asset, h.size);
    }
    if (rec.cash_position && rec.cash_position.asset) {
      addWeight(rec.cash_position.asset, rec.cash_position.size);
    }
    perMonthAsset.set(mk, buckets);
  }

  if (!minKey || !maxKey) return null;

  // Fill every month between minKey and maxKey; smooth with a centered
  // window so single-video months don't dominate the visual.
  const months = [...monthRange(minKey, maxKey)];
  const rawShares = months.map((mk) => {
    const buckets = perMonthAsset.get(mk);
    if (!buckets) return null;
    const total = [...buckets.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const shares = {};
    for (const asset of ASSET_ORDER) {
      shares[asset] = (buckets.get(asset) || 0) / total;
    }
    return shares;
  });

  // Smooth: centered SMOOTH_WINDOW-month average, skipping null months.
  const smoothed = months.map((_, i) => {
    const half = Math.floor(SMOOTH_WINDOW / 2);
    const window = [];
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= months.length) continue;
      const s = rawShares[j];
      if (s) window.push(s);
    }
    if (window.length === 0) return null;
    const avg = {};
    for (const asset of ASSET_ORDER) {
      avg[asset] = window.reduce((a, s) => a + (s[asset] || 0), 0) / window.length;
    }
    return avg;
  });

  return { months, smoothed, videoCounts, minKey, maxKey };
}

function renderEmpty(el) {
  el.innerHTML = '<div class="cc-empty">no dated videos yet — chart will populate after extraction</div>';
}

function render(data) {
  lastData = data;
  const el = document.getElementById(MOUNT_ID);
  if (!el) return;
  if (!window.echarts) {
    el.innerHTML = '<div class="cc-empty">echarts failed to load</div>';
    return;
  }
  const comp = buildMonthlyComposition(data);
  if (!comp) { renderEmpty(el); return; }

  // Build series — one area per asset.
  const palette = (data.meta && data.meta.asset_palette) || {};
  const series = ASSET_ORDER.map((asset) => ({
    name: asset,
    type: 'line',
    stack: 'composition',
    areaStyle: { color: palette[asset] || '#888' },
    itemStyle: { color: palette[asset] || '#888' },
    lineStyle: { width: 0 },
    showSymbol: false,
    smooth: 0.2,
    emphasis: { focus: 'series' },
    data: comp.smoothed.map((s) => (s ? +(s[asset] * 100).toFixed(2) : null)),
  }));

  // Clean up previous instance if exists
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  wrap.style.height = '420px';
  el.appendChild(wrap);
  chart = window.echarts.init(wrap, null, { renderer: 'canvas' });

  chart.setOption({
    grid: { left: 48, right: 16, top: 28, bottom: 56 },
    color: ASSET_ORDER.map((a) => palette[a] || '#888'),
    legend: {
      top: 0,
      right: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11, color: '#1d1d1f' },
      data: ASSET_ORDER,
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
        const month = params[0].axisValueLabel;
        const n = comp.videoCounts.get(month) || 0;
        const rows = params
          .slice()
          .sort((a, b) => (b.value || 0) - (a.value || 0))
          .filter((p) => (p.value || 0) >= 0.5)
          .map((p) => {
            const v = (p.value || 0).toFixed(1);
            return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.7"><span style="width:10px;height:10px;border-radius:2px;background:${p.color}"></span><span style="flex:1">${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${v}%</span></div>`;
          })
          .join('');
        return `<div style="font-weight:600;margin-bottom:4px">${month} · ${n} video${n === 1 ? '' : 's'}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      data: comp.months,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d6cfc1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#6b6558',
        fontSize: 11,
        formatter: (v) => {
          // show Jan as 'YYYY', otherwise short month
          const [y, m] = v.split('-');
          if (m === '01') return y;
          const mons = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return mons[parseInt(m, 10)] || v;
        },
        interval: 1,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee9df' } },
      axisLabel: {
        color: '#6b6558',
        fontSize: 11,
        formatter: '{value}%',
      },
    },
    series,
    animation: false,
  });

  // Resize handler
  if (!render._resizeBound) {
    window.addEventListener('resize', () => chart && chart.resize());
    render._resizeBound = true;
  }
}

export { render };
