// js/chart-small-multiples.js — Agent 6
// Asset small multiples: one mini ECharts panel per asset showing mean weight_pct
// over calendar_date, a min/max band when multiple videos share a date, and a
// rug strip of every video that mentioned the asset.
//
// Per-skeptic: do NOT draw connecting lines across days with no data — gaps
// stay gaps. Weight-pct is plotted only for rows where weight_pct is numeric;
// mention rugs use every row regardless of weight_pct.

import { ASSET_ORDER, setSelectedAsset, setSelectedVideoId, state } from './data.js';

const MOUNT_ID = 'cc-chart-smallmult';
const PRIORITY = ["USD", "BTC", "ETH", "SOL", "MSTR"];

// per-panel ECharts instances, keyed by asset symbol (or "OTHER")
const charts = new Map();
// per-panel DOM nodes, for dim/highlight on cc:asset
const panels = new Map();

let _listenersAttached = false;

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export function render(data) {
  const mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    console.warn(`[small-multiples] mount #${MOUNT_ID} missing`);
    return null;
  }
  _attachGlobalListeners();
  _draw(mount, data);
  return null; // multi-instance — no single ECharts handle to return
}

export function update(data) {
  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;
  _draw(mount, data);
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

function _draw(mount, data) {
  _disposeAll();
  mount.innerHTML = '';

  const holdings = (data && data.holdings) || [];
  const meta = (data && data.meta) || {};
  const palette = (meta.asset_palette) || {};

  if (!holdings.length) {
    const empty = document.createElement('div');
    empty.className = 'cc-empty';
    empty.textContent =
      'awaiting extraction · one panel per asset will appear here, ' +
      'showing weight % over time + how often the speaker mentioned it';
    mount.appendChild(empty);
    return;
  }

  // Bucket rows by asset. OTHER:* tokens fold into a single "OTHER" tail
  // bucket; bare "OTHER" also joins it. Sub-token preserved for tail panel.
  const byAsset = new Map();
  const otherRows = [];
  for (const row of holdings) {
    const a = row.asset;
    if (!a) continue;
    if (a === 'OTHER' || a.startsWith('OTHER:')) {
      otherRows.push(row);
      continue;
    }
    if (!byAsset.has(a)) byAsset.set(a, []);
    byAsset.get(a).push(row);
  }

  // Ordering: PRIORITY first (only those that actually have rows), then the
  // rest by mention count desc, then OTHER tail panel at the very end.
  const seen = new Set();
  const ordered = [];
  for (const a of PRIORITY) {
    if (byAsset.has(a)) { ordered.push(a); seen.add(a); }
  }
  // Fall back to ASSET_ORDER for any priority overlap we might have missed.
  for (const a of ASSET_ORDER) {
    if (a === 'OTHER') continue;
    if (byAsset.has(a) && !seen.has(a)) { ordered.push(a); seen.add(a); }
  }
  const remaining = [...byAsset.keys()]
    .filter(a => !seen.has(a))
    .sort((x, y) => byAsset.get(y).length - byAsset.get(x).length);
  ordered.push(...remaining);

  // Build grid container
  const grid = document.createElement('div');
  grid.className = 'cc-smallmult-grid';
  // Inline styles so we don't depend on agent 2's CSS landing first.
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  grid.style.gap = '12px';
  // 2-col on narrower viewports — done via a media-query stylesheet injection.
  _ensureResponsiveStyle();
  mount.appendChild(grid);

  for (const asset of ordered) {
    const rows = byAsset.get(asset);
    const color = palette[asset] || _fallbackColor(asset);
    const panel = _buildPanel(asset, rows, color, /*isOther=*/false);
    grid.appendChild(panel);
  }

  if (otherRows.length) {
    const color = palette['OTHER'] || '#888888';
    const panel = _buildPanel('OTHER', otherRows, color, /*isOther=*/true);
    grid.appendChild(panel);
  }

  // Re-apply current selection styling, if any.
  _applyAssetHighlight(state.selectedAsset);
}

function _buildPanel(asset, rows, color, isOther) {
  const panel = document.createElement('div');
  panel.className = 'cc-card cc-smallmult-panel';
  panel.dataset.asset = asset;
  panel.style.padding = '10px 12px';
  panel.style.cursor = 'pointer';
  panel.style.transition = 'opacity 120ms ease';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.minHeight = '180px';

  // Header row: chip + count
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.marginBottom = '4px';

  const chip = document.createElement('span');
  chip.className = 'cc-asset-chip';
  chip.textContent = isOther ? 'OTHER (top 5 tokens)' : asset;
  chip.style.background = color;
  chip.style.color = _readableTextColor(color);
  chip.style.padding = '2px 8px';
  chip.style.borderRadius = '999px';
  chip.style.fontSize = '12px';
  chip.style.fontWeight = '600';
  header.appendChild(chip);

  const nVideos = new Set(rows.map(r => r.video_id)).size;
  const count = document.createElement('span');
  count.textContent = `n = ${nVideos}`;
  count.style.fontSize = '11px';
  count.style.color = '#888';
  count.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  header.appendChild(count);

  panel.appendChild(header);

  // Chart container
  const chartEl = document.createElement('div');
  chartEl.style.width = '100%';
  chartEl.style.flex = '1 1 auto';
  chartEl.style.minHeight = '140px';
  panel.appendChild(chartEl);

  // Panel click: toggle asset selection
  panel.addEventListener('click', (e) => {
    // Allow rug-tick handler to suppress this via stopPropagation.
    if (e._ccHandled) return;
    const cur = state.selectedAsset;
    setSelectedAsset(cur === asset ? null : asset);
  });

  // Defer chart init so the element is in the DOM and sized.
  requestAnimationFrame(() => {
    if (!window.echarts) {
      console.warn('[small-multiples] window.echarts missing');
      return;
    }
    const inst = window.echarts.init(chartEl);
    inst.setOption(_buildOption(asset, rows, color, isOther));
    inst.on('click', (params) => {
      // Rug strip click: scatter series with custom data.
      if (params.componentType === 'series' && params.seriesType === 'scatter' && params.data) {
        const vid = params.data.video_id;
        if (vid) {
          setSelectedVideoId(vid);
          // Suppress panel-level click handler
          if (params.event && params.event.event) {
            params.event.event._ccHandled = true;
            params.event.event.stopPropagation();
          }
        }
      }
    });
    charts.set(asset, inst);
  });

  panels.set(asset, panel);
  return panel;
}

// ---------------------------------------------------------------------------
// ECharts option builder
// ---------------------------------------------------------------------------

function _buildOption(asset, rows, color, isOther) {
  // Group rows by calendar_date for the weighted-mean line + min/max band.
  // Only rows with numeric weight_pct contribute to the line. Mention rug
  // uses every row.
  const byDate = new Map();
  for (const r of rows) {
    const d = r.calendar_date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }

  const sortedDates = [...byDate.keys()].sort();

  // Build line series: ONLY include points where we actually have weight_pct
  // data on that date. Skipping a date leaves a real gap (no fake continuity).
  // ECharts will draw gaps when we use null values OR when we feed sparse
  // [date, val] pairs with `connectNulls: false`.
  const lineData = [];     // [date, mean]
  const bandLow = [];      // [date, min]
  const bandHigh = [];     // [date, max]
  for (const d of sortedDates) {
    const dayRows = byDate.get(d);
    const weights = dayRows
      .map(r => _toNum(r.weight_pct))
      .filter(v => v != null);
    if (!weights.length) continue;
    const mean = weights.reduce((s, v) => s + v, 0) / weights.length;
    const lo = Math.min(...weights);
    const hi = Math.max(...weights);
    lineData.push([d, +mean.toFixed(2)]);
    if (weights.length > 1) {
      bandLow.push([d, +lo.toFixed(2)]);
      bandHigh.push([d, +hi.toFixed(2)]);
    } else {
      bandLow.push([d, null]);
      bandHigh.push([d, null]);
    }
  }

  // Rug strip: one tick per (date, video_id) mention. Plotted as scatter at
  // y = 0 on a separate value axis below the line axis (using grid stacking).
  // Implementation: put rug ticks in the same grid at y = a constant negative
  // pad, but simpler — overlay using two grids. ECharts supports multiple
  // grids per chart.
  const rugPoints = [];
  for (const r of rows) {
    if (!r.calendar_date || !r.video_id) continue;
    rugPoints.push({
      value: [r.calendar_date, 1],
      video_id: r.video_id,
      title: r.title || ''
    });
  }

  const hasLine = lineData.length > 0;

  return {
    animation: false,
    grid: [
      // top grid = line chart
      { left: 36, right: 8, top: 4, height: '70%', containLabel: false },
      // bottom grid = rug strip
      { left: 36, right: 8, top: '80%', height: '12%', containLabel: false }
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (p) => {
        if (p.seriesName === 'rug') {
          return `${p.data.value[0]}<br/>${_esc(p.data.title)}<br/><span style="color:#888">click to open video</span>`;
        }
        if (p.seriesName === 'mean') {
          return `${p.data[0]}<br/><b>${p.data[1]}%</b> mean weight`;
        }
        return '';
      },
      textStyle: { fontSize: 11 }
    },
    xAxis: [
      {
        type: 'time',
        gridIndex: 0,
        axisLabel: { fontSize: 9, color: '#999', hideOverlap: true },
        axisLine: { lineStyle: { color: '#ddd' } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      {
        type: 'time',
        gridIndex: 1,
        show: false
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: hasLine ? '%' : '',
        nameTextStyle: { fontSize: 9, color: '#999' },
        nameGap: 4,
        axisLabel: { fontSize: 9, color: '#999', formatter: v => v },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        min: 0
      },
      {
        type: 'value',
        gridIndex: 1,
        show: false,
        min: 0,
        max: 2
      }
    ],
    series: [
      // Band: low (transparent) + high (filled to low) — stacked-area trick.
      {
        name: 'bandLow',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: bandLow,
        lineStyle: { opacity: 0 },
        stack: 'band-' + asset,
        symbol: 'none',
        silent: true,
        connectNulls: false,
        z: 1
      },
      {
        name: 'bandHigh',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        // store delta (high - low) so the stack fills the band region
        data: bandHigh.map((p, i) => {
          const lo = bandLow[i] && bandLow[i][1];
          if (p == null || p[1] == null || lo == null) return [p ? p[0] : null, null];
          return [p[0], +(p[1] - lo).toFixed(2)];
        }),
        lineStyle: { opacity: 0 },
        areaStyle: { color: color, opacity: 0.18 },
        stack: 'band-' + asset,
        symbol: 'none',
        silent: true,
        connectNulls: false,
        z: 1
      },
      // Mean line
      {
        name: 'mean',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: lineData,
        showSymbol: lineData.length < 30,
        symbolSize: 4,
        symbol: 'circle',
        connectNulls: false, // gaps stay gaps
        lineStyle: { color: color, width: 1.6 },
        itemStyle: { color: color },
        z: 3
      },
      // Rug ticks
      {
        name: 'rug',
        type: 'scatter',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rugPoints,
        symbol: 'rect',
        symbolSize: [2, 10],
        itemStyle: { color: color, opacity: 0.7 },
        z: 2
      }
    ],
    // Empty-state overlay if no numeric weight_pct rows.
    graphic: hasLine ? [] : [{
      type: 'text',
      left: 'center',
      top: '30%',
      style: {
        text: 'no weight_pct yet\n(mentions only)',
        fontSize: 10,
        fill: '#aaa',
        align: 'center'
      }
    }]
  };
}

// ---------------------------------------------------------------------------
// selection / highlight
// ---------------------------------------------------------------------------

function _attachGlobalListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  window.addEventListener('cc:asset', (ev) => {
    const a = ev && ev.detail && ev.detail.asset;
    _applyAssetHighlight(a);
  });

  window.addEventListener('resize', () => {
    for (const inst of charts.values()) {
      try { inst.resize(); } catch (_) { /* ignore */ }
    }
  });
}

function _applyAssetHighlight(selected) {
  if (!panels.size) return;
  for (const [asset, panel] of panels.entries()) {
    if (!selected) {
      panel.style.opacity = '1';
      panel.style.outline = 'none';
    } else if (asset === selected) {
      panel.style.opacity = '1';
      panel.style.outline = '2px solid #333';
      panel.style.outlineOffset = '-2px';
    } else {
      panel.style.opacity = '0.35';
      panel.style.outline = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// utilities
// ---------------------------------------------------------------------------

function _disposeAll() {
  for (const inst of charts.values()) {
    try { inst.dispose(); } catch (_) { /* ignore */ }
  }
  charts.clear();
  panels.clear();
}

function _toNum(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function _fallbackColor(asset) {
  // Deterministic muted hue from asset string.
  let h = 0;
  for (let i = 0; i < asset.length; i++) h = (h * 31 + asset.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

function _readableTextColor(bg) {
  // Quick luminance check for hex colors; fall back to white for hsl/etc.
  if (!bg || bg[0] !== '#' || bg.length < 7) return '#fff';
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#fff';
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _ensureResponsiveStyle() {
  if (document.getElementById('cc-smallmult-responsive')) return;
  const style = document.createElement('style');
  style.id = 'cc-smallmult-responsive';
  style.textContent = `
    @media (max-width: 900px) {
      .cc-smallmult-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    }
    @media (max-width: 520px) {
      .cc-smallmult-grid { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(style);
}
