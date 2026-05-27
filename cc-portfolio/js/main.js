// js/main.js — entry point. Wires data.js + chart modules + detail panel.
// Owns: #cc-kpis, #cc-hero quote, #cc-provenance. Everything else is owned by other agents.

import { loadAll } from './data.js';

function fmtPct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${x.toFixed(digits)}%`;
}

function fmtInt(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return String(x);
}

function setKpi(key, label, value, sub) {
  const tile = document.querySelector(`#cc-kpis .cc-kpi[data-kpi="${key}"]`);
  if (!tile) return;
  const labelEl = tile.querySelector('.cc-kpi-label');
  const valueEl = tile.querySelector('.cc-kpi-value');
  if (labelEl && label) labelEl.textContent = label;
  if (valueEl) {
    valueEl.textContent = value;
    if (sub) {
      const subEl = document.createElement('span');
      subEl.className = 'cc-kpi-sub';
      subEl.textContent = ` ${sub}`;
      valueEl.appendChild(subEl);
    }
  }
}

function fillKpis(kpis) {
  const k = kpis || {};
  setKpi(
    'n_videos_extracted',
    'videos extracted',
    fmtInt(k.n_videos_extracted),
    k.n_videos_total ? `/ ${k.n_videos_total}` : null,
  );
  setKpi(
    'n_videos_dated',
    'dated coverage',
    fmtInt(k.n_videos_dated),
    k.n_videos_extracted ? `/ ${k.n_videos_extracted}` : null,
  );
  setKpi('mean_cash_pct', 'mean cash %', fmtPct(k.mean_cash_pct, 0));
  setKpi('top3_concentration_pct', 'top-3 concentration', fmtPct(k.top3_concentration_pct, 0));
  setKpi('last_video_date', 'last video', k.last_video_date || '—');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fillProvenance(meta, kpis) {
  const el = document.getElementById('cc-provenance');
  if (!el) return;
  const m = meta || {};
  const k = kpis || {};
  const dsc = m.date_source_counts || {};
  const totalDated =
    (dsc.portfolio || 0) + (dsc.filename || 0) + (dsc.backfill || 0);
  const pctOf = (n) => (totalDated > 0 ? Math.round((100 * (n || 0)) / totalDated) : 0);
  const pPortfolio = pctOf(dsc.portfolio);
  const pFilename = pctOf(dsc.filename);
  const pBackfill = pctOf(dsc.backfill);
  const weightPct = k.pct_holdings_with_weight_pct;
  const weightTxt = weightPct === null || weightPct === undefined ? '—' : `${weightPct.toFixed(0)}%`;
  el.innerHTML = `
    <span class="cc-provenance-line">
      N=${fmtInt(k.n_videos_extracted)}/${fmtInt(k.n_videos_total)} extracted ·
      ${fmtInt(k.n_holdings)} holdings · ${fmtInt(k.n_actions)} actions ·
      date sources: portfolio ${pPortfolio}% / filename ${pFilename}% / backfill ${pBackfill}% ·
      weight_pct present: ${weightTxt} ·
      extractor: ${escapeHtml(m.extractor_model || 'qwen2.5:7b-instruct (local)')} · not human-audited
    </span>
  `;
}

function showAwaitingBadge(meta) {
  const host = document.getElementById('cc-chart-ribbon');
  if (!host) return;
  const badge = document.createElement('div');
  badge.className = 'cc-badge cc-badge-warn';
  const extracted = (meta && meta.n_videos_extracted) || 0;
  const total = (meta && meta.n_videos_total) || 0;
  badge.textContent = total
    ? `awaiting extraction (${extracted}/${total} videos so far)`
    : 'awaiting extraction';
  // Insert at the top of the ribbon card so it's prominent.
  host.insertBefore(badge, host.firstChild);
}

async function loadChart(modPath, data) {
  try {
    const mod = await import(modPath);
    if (mod && typeof mod.render === 'function') {
      mod.render(data);
    }
  } catch (err) {
    console.warn(`[cc-portfolio] failed to load ${modPath}:`, err);
  }
}

async function boot() {
  let data;
  try {
    data = await loadAll();
  } catch (err) {
    console.error('[cc-portfolio] loadAll failed; rendering empty state', err);
    data = {
      meta: { n_videos_total: 0, n_videos_extracted: 0 },
      holdings: [],
      actions: [],
      byVideo: {},
      kpis: {
        n_videos_total: 0, n_videos_extracted: 0, n_videos_dated: 0,
        n_holdings: 0, n_actions: 0,
        mean_cash_pct: null, top3_concentration_pct: null,
        pct_holdings_with_weight_pct: null,
        last_video_date: null, last_video_title: null,
      },
      datedVideoIds: [],
    };
  }

  fillKpis(data.kpis);
  fillProvenance(data.meta, data.kpis);

  if (!data.kpis || data.kpis.n_videos_extracted === 0) {
    showAwaitingBadge(data.meta);
  }

  // Cache-bust on every load so updates land without manual hard-refresh.
  // Date-stamp updates daily; bump manually for same-day fixes if needed.
  const v = '2026-05-26-8';
  await Promise.all([
    loadChart(`./chart-composition.js?v=${v}`, data),
    loadChart(`./chart-btc-overlay.js?v=${v}`, data),
    loadChart(`./chart-lines.js?v=${v}`, data),
    loadChart(`./chart-composition-llm.js?v=${v}`, data),
    loadChart(`./chart-ribbon.js?v=${v}`, data),
    loadChart(`./chart-actions.js?v=${v}`, data),
    loadChart(`./chart-small-multiples.js?v=${v}`, data),
  ]);

  window.dispatchEvent(new CustomEvent('cc:ready', { detail: { data } }));
}

boot();
