// js/chart-actions.js — Agent 5: Action Strip
//
// A thin horizontal strip of glyphs (one per Action event) mounted beneath
// the Conviction Ribbon. Reads `data.actions` (rows from
// portfolio_actions_long.csv) and matches each row back to its evidence
// quote in `data.byVideo[video_id].actions[]`.
//
// Visual encoding:
//   BUY / ADD / DCA       → upward triangle, green   (#15803d)
//   SELL / TRIM           → downward triangle, red   (#b91c1c)
//   ROTATE_TO             → diamond (filled), amber  (#d97706)
//   ROTATE_FROM           → diamond (outline), amber (#d97706)
// Size encodes |weight_delta_pct| (area-scaled). Null weight_delta_pct
// renders as the minimum size with an outline-only treatment, so it is
// clearly distinguishable from sized glyphs and not fabricated.

const MOUNT_ID = 'cc-chart-actions';

const COLOR_BUY = '#15803d';
const COLOR_SELL = '#b91c1c';
const COLOR_ROTATE = '#d97706';

const UP_DIRECTIONS = new Set(['BUY', 'ADD', 'DCA']);
const DOWN_DIRECTIONS = new Set(['SELL', 'TRIM']);

const MIN_AREA = 36;   // px^2, also the "unknown weight" size
const MAX_AREA = 220;  // px^2 cap, so a single big delta doesn't blot the strip

let _chart = null;
let _lastData = null;

// --- helpers ----------------------------------------------------------------

function normDir(d) {
  return (d || '').toString().trim().toUpperCase().replace(/\s+/g, '_');
}

function parseDate(s) {
  if (!s) return null;
  // CSV dates are ISO 'YYYY-MM-DD'. Treat as UTC midnight to keep axis stable.
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function clip(text, n) {
  if (!text) return '';
  const s = String(text);
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Map weight_delta_pct (already a percent number, e.g. 5 for "+5%") to a
// symbolSize in pixels (ECharts wants linear pixel size, not area). We map
// |delta| ∈ [0, ~25] to area ∈ [MIN_AREA, MAX_AREA] then sqrt to side.
function sizeForDelta(deltaPct) {
  if (deltaPct == null || !Number.isFinite(deltaPct)) {
    return Math.sqrt(MIN_AREA);
  }
  const mag = Math.min(Math.abs(deltaPct), 25);
  const area = MIN_AREA + (MAX_AREA - MIN_AREA) * (mag / 25);
  return Math.sqrt(area);
}

function styleFor(direction, hasWeight) {
  const d = normDir(direction);
  if (UP_DIRECTIONS.has(d)) {
    return {
      symbol: 'triangle',
      color: COLOR_BUY,
      borderColor: COLOR_BUY,
      filled: hasWeight,
    };
  }
  if (DOWN_DIRECTIONS.has(d)) {
    // Downward triangle = triangle rotated 180°. ECharts: use a path or
    // built-in 'triangle' with symbolRotate via series. We can't rotate per
    // point on a scatter series with mixed up/down easily; use a custom
    // symbol path for down.
    return {
      symbol: 'path://M0,0 L20,0 L10,18 Z', // pointing down
      color: COLOR_SELL,
      borderColor: COLOR_SELL,
      filled: hasWeight,
    };
  }
  if (d === 'ROTATE_TO') {
    return {
      symbol: 'diamond',
      color: COLOR_ROTATE,
      borderColor: COLOR_ROTATE,
      filled: hasWeight,
    };
  }
  if (d === 'ROTATE_FROM') {
    return {
      symbol: 'diamond',
      color: COLOR_ROTATE,
      borderColor: COLOR_ROTATE,
      filled: false, // outline-only by spec
    };
  }
  // Unknown direction → small grey dot, outline-only
  return {
    symbol: 'circle',
    color: '#888',
    borderColor: '#888',
    filled: false,
  };
}

// Match a CSV action row back to its evidence quote in by_video.json.
// Strategy: collect all rows in `data.actions` sharing this video_id, group
// by (asset, direction). For the i-th occurrence of this (asset, direction)
// pair in CSV order, return the i-th matching by_video action.
function buildQuoteIndex(data) {
  const idx = new Map(); // key: video_id|asset|direction|occurrence -> quote
  if (!data || !data.actions || !data.byVideo) return idx;

  // Walk CSV in stable order, counting per (vid, asset, dir).
  const csvCounters = new Map();
  for (const row of data.actions) {
    const vid = row.video_id;
    const asset = (row.asset || '').toString().toUpperCase();
    const dir = normDir(row.direction);
    const k = `${vid}|${asset}|${dir}`;
    const n = (csvCounters.get(k) || 0);
    csvCounters.set(k, n + 1);
    row.__occ = n; // stash for lookup
  }

  // Walk by_video in stable order, mirror counters.
  for (const vid of Object.keys(data.byVideo)) {
    const rec = data.byVideo[vid];
    if (!rec || !Array.isArray(rec.actions)) continue;
    const bvCounters = new Map();
    for (const a of rec.actions) {
      const asset = (a.asset || '').toString().toUpperCase();
      const dir = normDir(a.direction);
      const k = `${vid}|${asset}|${dir}`;
      const n = (bvCounters.get(k) || 0);
      bvCounters.set(k, n + 1);
      idx.set(`${k}|${n}`, a.evidence_quote || '');
    }
  }
  return idx;
}

function rowsToSeries(data) {
  const quoteIdx = buildQuoteIndex(data);
  const rows = (data.actions || []).filter(r => r && r.calendar_date);

  // Group by direction so we can attach a single symbol per series.
  // For up/down/rotate-filled/rotate-outline we need 4 buckets; null-weight
  // glyphs become outline variants of their bucket.
  const buckets = {
    UP_FILLED: [],
    UP_OUTLINE: [],
    DOWN_FILLED: [],
    DOWN_OUTLINE: [],
    ROT_TO_FILLED: [],
    ROT_TO_OUTLINE: [],
    ROT_FROM: [],       // always outline by spec
    UNKNOWN: [],
  };

  for (const row of rows) {
    const t = parseDate(row.calendar_date);
    if (t == null) continue;
    const dir = normDir(row.direction);
    const deltaRaw = row.weight_delta_pct;
    const delta = (deltaRaw === '' || deltaRaw == null) ? null : Number(deltaRaw);
    const hasWeight = delta != null && Number.isFinite(delta);
    const size = sizeForDelta(hasWeight ? delta : null);
    const asset = (row.asset || '').toString().toUpperCase();
    const occ = row.__occ ?? 0;
    const quote = quoteIdx.get(`${row.video_id}|${asset}|${dir}|${occ}`) || '';

    const point = {
      // [x, y] — y is a constant lane; we use 0 with a hidden y axis.
      value: [t, 0],
      _row: row,
      _meta: {
        date: row.calendar_date,
        direction: dir || '?',
        asset: asset || '?',
        delta,
        hasWeight,
        quote,
        videoId: row.video_id,
        title: row.title || '',
      },
      symbolSize: size,
    };

    let bucket;
    if (UP_DIRECTIONS.has(dir))      bucket = hasWeight ? 'UP_FILLED' : 'UP_OUTLINE';
    else if (DOWN_DIRECTIONS.has(dir)) bucket = hasWeight ? 'DOWN_FILLED' : 'DOWN_OUTLINE';
    else if (dir === 'ROTATE_TO')    bucket = hasWeight ? 'ROT_TO_FILLED' : 'ROT_TO_OUTLINE';
    else if (dir === 'ROTATE_FROM')  bucket = 'ROT_FROM';
    else                             bucket = 'UNKNOWN';

    buckets[bucket].push(point);
  }

  // Build series.
  const mk = (name, points, opts) => ({
    name,
    type: 'scatter',
    data: points,
    symbol: opts.symbol,
    symbolSize: (val, params) => params.data.symbolSize,
    itemStyle: {
      color: opts.filled ? opts.color : 'transparent',
      borderColor: opts.color,
      borderWidth: opts.filled ? 0 : 1.5,
      opacity: 0.9,
    },
    emphasis: {
      itemStyle: { opacity: 1, shadowBlur: 6, shadowColor: opts.color },
      scale: 1.15,
    },
    z: 3,
  });

  const series = [];
  if (buckets.UP_FILLED.length)        series.push(mk('BUY/ADD/DCA',   buckets.UP_FILLED,    { symbol: 'triangle',                                color: COLOR_BUY,    filled: true }));
  if (buckets.UP_OUTLINE.length)       series.push(mk('BUY/ADD/DCA ·', buckets.UP_OUTLINE,   { symbol: 'triangle',                                color: COLOR_BUY,    filled: false }));
  if (buckets.DOWN_FILLED.length)      series.push(mk('SELL/TRIM',     buckets.DOWN_FILLED,  { symbol: 'path://M0,0 L20,0 L10,18 Z',              color: COLOR_SELL,   filled: true }));
  if (buckets.DOWN_OUTLINE.length)     series.push(mk('SELL/TRIM ·',   buckets.DOWN_OUTLINE, { symbol: 'path://M0,0 L20,0 L10,18 Z',              color: COLOR_SELL,   filled: false }));
  if (buckets.ROT_TO_FILLED.length)    series.push(mk('ROTATE_TO',     buckets.ROT_TO_FILLED,{ symbol: 'diamond',                                 color: COLOR_ROTATE, filled: true }));
  if (buckets.ROT_TO_OUTLINE.length)   series.push(mk('ROTATE_TO ·',   buckets.ROT_TO_OUTLINE,{symbol: 'diamond',                                 color: COLOR_ROTATE, filled: false }));
  if (buckets.ROT_FROM.length)         series.push(mk('ROTATE_FROM',   buckets.ROT_FROM,     { symbol: 'diamond',                                 color: COLOR_ROTATE, filled: false }));
  if (buckets.UNKNOWN.length)          series.push(mk('?',             buckets.UNKNOWN,      { symbol: 'circle',                                  color: '#888',       filled: false }));

  return series;
}

// X-axis extent: align with the ribbon. We don't have a JS handle to the
// ribbon's chart from here, so we mirror its likely strategy: derive
// min/max from the union of holdings + actions dates. Both charts running
// the same logic land on the same window.
function computeDateExtent(data) {
  const ts = [];
  for (const r of (data.holdings || [])) {
    const t = parseDate(r.calendar_date);
    if (t != null) ts.push(t);
  }
  for (const r of (data.actions || [])) {
    const t = parseDate(r.calendar_date);
    if (t != null) ts.push(t);
  }
  if (!ts.length) return [null, null];
  let min = Infinity, max = -Infinity;
  for (const t of ts) { if (t < min) min = t; if (t > max) max = t; }
  // Pad 2 days on each side so glyphs at the extremes aren't clipped.
  const pad = 2 * 86400000;
  return [min - pad, max + pad];
}

function tooltipFormatter(params) {
  const m = params.data && params.data._meta;
  if (!m) return '';
  const dir = m.direction || '?';
  const asset = m.asset || '?';
  const date = m.date || '';
  const deltaStr = m.hasWeight
    ? ` <span style="color:#666">(${m.delta > 0 ? '+' : ''}${m.delta}%)</span>`
    : ` <span style="color:#999">(no weight stated)</span>`;
  const head = `<div style="font-size:12px;line-height:1.4">
    <strong>${escapeHtml(date)}</strong> · <span>${escapeHtml(dir)}</span> <strong>${escapeHtml(asset)}</strong>${deltaStr}
  </div>`;
  const q = clip(m.quote, 200);
  const body = q
    ? `<div style="margin-top:4px;max-width:320px;font-style:italic;color:#444;font-size:11px;line-height:1.4">“${escapeHtml(q)}”</div>`
    : '';
  return head + body;
}

function renderLegendChips(host) {
  // A tiny static legend outside the canvas — shape+color IS the legend.
  let legend = host.querySelector('.cc-actions-legend');
  if (legend) return;
  legend = document.createElement('div');
  legend.className = 'cc-actions-legend';
  legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#555;padding:4px 8px 0;align-items:center;';
  legend.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${COLOR_BUY}"></span>BUY / ADD / DCA</span>
    <span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${COLOR_SELL}"></span>SELL / TRIM</span>
    <span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:9px;height:9px;background:${COLOR_ROTATE};transform:rotate(45deg)"></span>ROTATE_TO</span>
    <span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:9px;height:9px;border:1.5px solid ${COLOR_ROTATE};transform:rotate(45deg);box-sizing:border-box"></span>ROTATE_FROM</span>
    <span style="color:#888">· size ∝ |weight Δ|, outline = weight not stated</span>
  `;
  host.prepend(legend);
}

function buildOption(data) {
  const [minT, maxT] = computeDateExtent(data);
  const series = rowsToSeries(data);

  return {
    animation: false,
    grid: { left: 48, right: 24, top: 18, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#ddd',
      borderWidth: 1,
      padding: 8,
      textStyle: { color: '#222' },
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: 'time',
      min: minT ?? undefined,
      max: maxT ?? undefined,
      axisLine: { lineStyle: { color: '#bbb' } },
      axisTick: { show: true },
      axisLabel: { color: '#666', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      show: false,
      min: -1,
      max: 1,
    },
    series,
  };
}

// --- selection / asset highlight handling ----------------------------------

function applyAssetDim(asset) {
  if (!_chart) return;
  const opt = _chart.getOption();
  const newSeries = (opt.series || []).map(s => {
    const data = (s.data || []).map(pt => {
      const meta = pt && pt._meta;
      if (!meta) return pt;
      const dim = asset && meta.asset !== asset;
      return {
        ...pt,
        itemStyle: {
          ...(pt.itemStyle || {}),
          opacity: dim ? 0.15 : 0.9,
        },
      };
    });
    return { ...s, data };
  });
  _chart.setOption({ series: newSeries }, false, true);
}

function applySelectMarkLine(videoId) {
  if (!_chart || !_lastData) return;
  let t = null;
  if (videoId && _lastData.byVideo && _lastData.byVideo[videoId]) {
    t = parseDate(_lastData.byVideo[videoId].calendar_date);
  }
  // Attach markLine to the first series only (visual is shared).
  const opt = _chart.getOption();
  const series = (opt.series || []).map((s, i) => {
    if (i !== 0) return s;
    if (t == null) {
      return { ...s, markLine: { data: [] } };
    }
    return {
      ...s,
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        lineStyle: { color: '#222', type: 'dashed', width: 1, opacity: 0.6 },
        label: { show: false },
        data: [{ xAxis: t }],
      },
    };
  });
  _chart.setOption({ series }, false, true);
}

// --- public API -------------------------------------------------------------

export function render(data) {
  const host = document.getElementById(MOUNT_ID);
  if (!host) return null;

  _lastData = data;

  // Empty state
  const actions = (data && data.actions) || [];
  const validActions = actions.filter(r => r && r.calendar_date);
  if (validActions.length === 0) {
    host.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'cc-empty';
    empty.textContent =
      'no actions extracted yet · this strip shows every BUY/SELL/ROTATE the speaker stated, sized by stated weight delta';
    host.appendChild(empty);
    _chart = null;
    return null;
  }

  if (!window.echarts) {
    // Defensive: scaffold is supposed to load echarts before chart modules.
    host.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'cc-empty';
    err.textContent = 'chart library not loaded';
    host.appendChild(err);
    return null;
  }

  // Reset and mount.
  host.innerHTML = '';
  renderLegendChips(host);
  const canvas = document.createElement('div');
  // Leave room above for the small legend strip; section min-height is 140px.
  canvas.style.cssText = 'width:100%;height:110px;';
  host.appendChild(canvas);

  _chart = window.echarts.init(canvas, null, { renderer: 'canvas' });
  _chart.setOption(buildOption(data));

  // Click → set selected video.
  _chart.off('click');
  _chart.on('click', (params) => {
    const row = params && params.data && params.data._row;
    if (!row || !row.video_id) return;
    import('./data.js').then(m => m.setSelectedVideoId(row.video_id));
  });

  // Resize handling.
  if (!render._resizeBound) {
    window.addEventListener('resize', () => { if (_chart) _chart.resize(); });
    render._resizeBound = true;
  }

  // Cross-chart event wiring (idempotent — bind once).
  if (!render._eventsBound) {
    window.addEventListener('cc:asset', (e) => {
      const asset = (e.detail && e.detail.asset) || null;
      applyAssetDim(asset);
    });
    window.addEventListener('cc:select', (e) => {
      const vid = (e.detail && e.detail.videoId) || null;
      applySelectMarkLine(vid);
    });
    render._eventsBound = true;
  }

  return _chart;
}

export function update(data) {
  _lastData = data;
  if (!_chart) {
    return render(data);
  }
  const actions = ((data && data.actions) || []).filter(r => r && r.calendar_date);
  if (actions.length === 0) {
    // Tear down and re-render empty state.
    _chart.dispose();
    _chart = null;
    return render(data);
  }
  _chart.setOption(buildOption(data), true);
  return _chart;
}
