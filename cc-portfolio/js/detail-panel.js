// js/detail-panel.js — sticky right-rail detail card for one video's full extraction.
// Agent 7. Owns ONLY this file. Mounts into #cc-detail-panel.
//
// Renders: date + channel, title (linking to YouTube), holdings rows with evidence
// quotes, actions rows with evidence quotes + direction badge, and a source-transcript
// link. Subscribes to `cc:select`. Mirrors selection in URL hash `#v=<video_id>` and
// pre-selects from hash on load. On viewports < 720px, toggles `.open` so the panel
// becomes a full-screen overlay with a close button.

import { setSelectedVideoId } from './data.js';

const PANEL_ID = 'cc-detail-panel';
const TRANSCRIPTS_BASE = 'https://github.com/sebastiandavidlee/seb-lab/blob/main/cc-portfolio/transcripts/';

// Color palette for action direction badges per CONTRACT.md glyph mapping.
const DIRECTION_COLOR = {
  BUY:    '#2E7D5B',
  ADD:    '#2E7D5B',
  DCA:    '#2E7D5B',
  SELL:   '#B5443A',
  TRIM:   '#B5443A',
  ROTATE: '#C2873A',
};

// --- DOM helpers ------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) {
      for (const cc of c) if (cc != null && cc !== false) node.append(cc);
    } else if (c instanceof Node) {
      node.append(c);
    } else {
      node.append(document.createTextNode(String(c)));
    }
  }
  return node;
}

// --- formatting -------------------------------------------------------------

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// "2025-09-13" -> "Mon, Sep 13 2025". Returns "—" on null/invalid.
function formatDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  // Use UTC to avoid TZ shifting "2025-09-13" into the previous day.
  const dt = new Date(Date.UTC(y, mo, d));
  if (isNaN(dt.getTime())) return iso;
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[mo]} ${d} ${y}`;
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return null;
  // Heuristic: weight_pct is a fraction 0..1 in the cache; if >1 assume it's already %.
  const pct = Math.abs(v) <= 1.0 ? v * 100 : v;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

function fmtDelta(v) {
  if (v == null || isNaN(v)) return null;
  const pct = Math.abs(v) <= 1.0 ? v * 100 : v;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

function paletteColor(palette, asset) {
  if (!palette) return '#888';
  return palette[asset] || palette.OTHER || '#888';
}

function transcriptUrl(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;
  // Extract basename and link to the transcripts dir in seb-lab.
  // If path doesn't look like a transcript file, return null and let caller fall back.
  const base = transcriptPath.split('/').pop();
  if (!base) return null;
  return TRANSCRIPTS_BASE + encodeURIComponent(base);
}

// --- chip / bar primitives --------------------------------------------------

function assetChip(asset, palette) {
  const color = paletteColor(palette, asset);
  return el('span', {
    class: 'cc-asset-chip',
    style: {backgroundColor: color, color: pickFg(color)},
  }, asset || '?');
}

// Light/dark foreground depending on chip bg luminance.
function pickFg(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum > 0.62 ? '#1d1d1f' : '#ffffff';
}

function confidenceBar(c) {
  const v = Math.max(0, Math.min(1, c == null ? 0 : Number(c)));
  const pct = Math.round(v * 100);
  return el('span', {
    class: 'cc-conf-bar',
    title: `confidence ${pct}%`,
    'aria-label': `confidence ${pct}%`,
    style: {
      display: 'inline-block',
      width: '40px',
      height: '6px',
      background: '#e5e1d8',
      borderRadius: '3px',
      verticalAlign: 'middle',
      position: 'relative',
      overflow: 'hidden',
    },
  }, el('span', {
    style: {
      display: 'block',
      width: `${pct}%`,
      height: '100%',
      background: v >= 0.75 ? '#2E7D5B' : v >= 0.5 ? '#C2873A' : '#B5443A',
    },
  }));
}

function directionBadge(dir) {
  const d = (dir || '').toUpperCase();
  const color = DIRECTION_COLOR[d] || '#666';
  return el('span', {
    class: 'cc-dir-badge',
    style: {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '0.04em',
      background: color,
      color: '#ffffff',
      textTransform: 'uppercase',
    },
  }, d || '—');
}

// evidence_quote -- always rendered via textContent so injected HTML can't escape.
function evidenceQuote(text) {
  if (!text) return null;
  return el('blockquote', {class: 'cc-quote'}, String(text));
}

// --- row builders -----------------------------------------------------------

function holdingRow(h, palette) {
  // Prefer weight_pct; fall back to size hint string.
  const weight = fmtPct(h.weight_pct);
  const sizeHint = (!weight && h.size) ? String(h.size) : null;
  const sizeLabel = weight || sizeHint || '—';

  const meta = [];
  meta.push(el('span', {class: 'cc-row-size'}, sizeLabel));
  if (h.instrument) meta.push(el('span', {class: 'cc-row-instr'}, h.instrument));
  meta.push(confidenceBar(h.confidence));

  return el('li', {class: 'cc-row cc-row-holding'},
    el('div', {class: 'cc-row-head'},
      assetChip(h.asset, palette),
      el('div', {class: 'cc-row-meta'}, ...interleave(meta, ' · ')),
    ),
    evidenceQuote(h.evidence_quote),
  );
}

function actionRow(a, palette) {
  const delta = fmtDelta(a.weight_delta_pct);
  const sizeHint = (!delta && a.size_hint) ? String(a.size_hint) : null;
  const sizeLabel = delta || sizeHint || null;

  const meta = [];
  if (sizeLabel) meta.push(el('span', {class: 'cc-row-size'}, sizeLabel));
  if (a.when_relative) meta.push(el('span', {class: 'cc-row-when'}, a.when_relative));
  meta.push(confidenceBar(a.confidence));

  return el('li', {class: 'cc-row cc-row-action'},
    el('div', {class: 'cc-row-head'},
      directionBadge(a.direction),
      assetChip(a.asset, palette),
      el('div', {class: 'cc-row-meta'}, ...interleave(meta, ' · ')),
    ),
    evidenceQuote(a.evidence_quote),
  );
}

function interleave(items, sep) {
  const out = [];
  items.forEach((it, i) => {
    if (i > 0) out.push(document.createTextNode(sep));
    out.push(it);
  });
  return out;
}

// --- card builder -----------------------------------------------------------

function buildCard(rec, palette) {
  const frag = document.createDocumentFragment();

  // Close button (visible on mobile via CSS).
  const closeBtn = el('button', {
    class: 'cc-detail-close',
    type: 'button',
    'aria-label': 'Close detail panel',
    onclick: () => setSelectedVideoId(null),
  }, '✕');
  frag.append(closeBtn);

  // Header: date + channel, then title link.
  const dateLine = el('div', {class: 'cc-detail-date'},
    formatDate(rec.calendar_date),
    rec.channel ? ` · ${rec.channel}` : '',
  );
  frag.append(dateLine);

  const titleText = rec.title || '(untitled)';
  const titleNode = rec.video_url
    ? el('a', {
        class: 'cc-detail-title',
        href: rec.video_url,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, titleText)
    : el('div', {class: 'cc-detail-title'}, titleText);
  frag.append(titleNode);

  // Cash position (if present): single-line hint above holdings.
  if (rec.cash_position && (rec.cash_position.weight_pct != null || rec.cash_position.note)) {
    const cashBits = [];
    const w = fmtPct(rec.cash_position.weight_pct);
    if (w) cashBits.push(`cash ${w}`);
    if (rec.cash_position.note) cashBits.push(rec.cash_position.note);
    frag.append(el('div', {class: 'cc-detail-cash'}, cashBits.join(' — ')));
  }

  // Holdings section.
  const holdings = Array.isArray(rec.holdings) ? rec.holdings : [];
  frag.append(el('h3', {class: 'cc-detail-section'}, `Holdings (${holdings.length})`));
  if (holdings.length === 0) {
    frag.append(el('div', {class: 'cc-empty'},
      'speaker stated no current holdings in this video'));
  } else {
    const ul = el('ul', {class: 'cc-detail-list'});
    for (const h of holdings) ul.append(holdingRow(h, palette));
    frag.append(ul);
  }

  // Actions section -- only render header if any actions exist.
  const actions = Array.isArray(rec.actions) ? rec.actions : [];
  if (actions.length > 0) {
    frag.append(el('h3', {class: 'cc-detail-section'}, `Actions (${actions.length})`));
    const ul = el('ul', {class: 'cc-detail-list'});
    for (const a of actions) ul.append(actionRow(a, palette));
    frag.append(ul);
  }

  // Source transcript link / fallback.
  const tUrl = transcriptUrl(rec.transcript_path);
  const tWrap = el('div', {class: 'cc-detail-transcript'});
  if (tUrl) {
    tWrap.append(
      el('span', {class: 'cc-detail-transcript-label'}, 'Source transcript: '),
      el('a', {href: tUrl, target: '_blank', rel: 'noopener noreferrer'},
        rec.transcript_path.split('/').pop()),
    );
  } else if (rec.transcript_path) {
    tWrap.append(
      el('span', {class: 'cc-detail-transcript-label'}, 'Source transcript: '),
      el('code', {}, rec.transcript_path),
    );
  } else {
    tWrap.append(el('span', {class: 'cc-empty'}, 'no transcript path on record'));
  }

  // Extractor confidence as a faint footer.
  if (rec.extractor_confidence != null) {
    frag.append(el('div', {class: 'cc-provenance cc-detail-footer'},
      `extractor confidence: ${(Number(rec.extractor_confidence) * 100).toFixed(0)}%`));
  }

  frag.append(tWrap);
  return frag;
}

function buildEmpty() {
  const frag = document.createDocumentFragment();
  frag.append(el('div', {class: 'cc-empty cc-detail-empty'},
    'click a dot in the chart or a card below to see this video’s full extraction — holdings, actions, and the verbatim quotes that grounded them.'));
  return frag;
}

function buildMissing(videoId) {
  const frag = document.createDocumentFragment();

  const closeBtn = el('button', {
    class: 'cc-detail-close',
    type: 'button',
    'aria-label': 'Close detail panel',
    onclick: () => setSelectedVideoId(null),
  }, '✕');
  frag.append(closeBtn);

  frag.append(el('div', {class: 'cc-empty cc-detail-empty'},
    'no extraction available for this video yet'));
  if (videoId) {
    frag.append(el('div', {class: 'cc-provenance'},
      `video_id: ${videoId}`));
  }
  return frag;
}

// --- mount / render ---------------------------------------------------------

function getMount() {
  return document.getElementById(PANEL_ID);
}

function render(videoId, data) {
  const mount = getMount();
  if (!mount) return;

  // Clear previous render.
  while (mount.firstChild) mount.removeChild(mount.firstChild);

  if (!videoId) {
    mount.classList.remove('open');
    mount.append(buildEmpty());
    return;
  }

  mount.classList.add('open');

  const rec = data && data.byVideo ? data.byVideo[videoId] : null;
  if (!rec) {
    mount.append(buildMissing(videoId));
    return;
  }

  const palette = (data.meta && data.meta.asset_palette) || {};
  mount.append(buildCard(rec, palette));
}

// Mirror selection in URL hash without triggering popstate.
function syncHash(videoId) {
  try {
    const next = videoId ? `#v=${encodeURIComponent(videoId)}` : ' ';
    // history.replaceState(state, '', '') wipes the hash; pass single space then clear.
    if (videoId) {
      history.replaceState(null, '', next);
    } else {
      // Strip hash without leaving a stray '#'.
      const clean = window.location.pathname + window.location.search;
      history.replaceState(null, '', clean);
    }
  } catch (_) { /* no-op in restricted contexts */ }
}

function readHashVideoId() {
  const h = window.location.hash || '';
  const m = h.match(/[#&]v=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// --- public init ------------------------------------------------------------

export function init(data) {
  const mount = getMount();
  if (!mount) {
    console.warn('[detail-panel] mount #cc-detail-panel not found');
    return;
  }

  // Subscribe to cross-module selection events. Single listener for the lifetime
  // of the page; render is cheap (rebuilds the panel subtree only).
  window.addEventListener('cc:select', (e) => {
    const vid = e && e.detail ? e.detail.videoId : null;
    syncHash(vid);
    render(vid, data);
  });

  // Pre-select from URL hash if it points to a known video.
  const initialVid = readHashVideoId();
  if (initialVid && data && data.byVideo && data.byVideo[initialVid]) {
    // Defer to setSelectedVideoId so other modules see the selection too.
    setSelectedVideoId(initialVid);
  } else {
    render(null, data);
  }
}
