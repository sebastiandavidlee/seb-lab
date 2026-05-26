// js/data.js — central data layer for cc-portfolio dashboard.
// Owns: fetching CSV/JSON, computing KPIs, selection state pub/sub.
// Never throws on missing data: every fetch falls back so the empty-state UI renders.

export const ASSET_ORDER = ["USD","BTC","ETH","SOL","MSTR","ADA","AVAX","LINK","DOGE","XRP","OTHER"];

// Default meta used when data/meta.json is missing or unparseable.
// Palette mirrors CONTRACT.md so chart modules always have colors to draw with.
const DEFAULT_META = {
  generated_at: null,
  n_videos_total: 232,
  n_videos_extracted: 0,
  n_videos_dated: 0,
  n_holdings: 0,
  n_actions: 0,
  date_source_counts: {portfolio: 0, filename: 0, backfill: 0},
  extractor_model: "qwen2.5:7b-instruct (local, Ollama)",
  extraction_in_progress: true,
  asset_palette: {
    BTC:"#F7931A", ETH:"#627EEA", SOL:"#14F195", ADA:"#0033AD",
    AVAX:"#E84142", LINK:"#2A5ADA", DOGE:"#C2A633", XRP:"#23292F",
    MSTR:"#1D1D1F", USD:"#7FAE6C", OTHER:"#888888"
  }
};

// --- selection state + event bus --------------------------------------------

export const state = {
  selectedVideoId: null,
  selectedAsset: null,
};

export function setSelectedVideoId(vid) {
  state.selectedVideoId = vid;
  window.dispatchEvent(new CustomEvent('cc:select', {detail: {videoId: vid}}));
}

export function setSelectedAsset(asset) {
  state.selectedAsset = asset;
  window.dispatchEvent(new CustomEvent('cc:asset', {detail: {asset}}));
}

// --- fetch helpers ----------------------------------------------------------

async function fetchJson(url, fallback) {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[data] ${url} -> ${r.status}, using fallback`);
      return fallback;
    }
    return await r.json();
  } catch (e) {
    console.warn(`[data] ${url} fetch/parse failed:`, e.message, '— using fallback');
    return fallback;
  }
}

async function fetchCsv(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[data] ${url} -> ${r.status}, using []`);
      return [];
    }
    const text = await r.text();
    if (!text.trim()) return [];
    if (!window.Papa) {
      console.warn('[data] window.Papa not loaded; cannot parse', url);
      return [];
    }
    const parsed = window.Papa.parse(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    return parsed.data || [];
  } catch (e) {
    console.warn(`[data] ${url} fetch/parse failed:`, e.message, '— using []');
    return [];
  }
}

// --- KPI helpers ------------------------------------------------------------

// Sort video_ids ASC by their calendar_date in holdings rows.
// Useful for ribbon chart x-axis ordering.
export function videoIdsByDate(holdings) {
  const firstDate = new Map();  // video_id -> earliest non-empty calendar_date string
  for (const row of holdings) {
    const vid = row.video_id;
    const date = row.calendar_date;
    if (!vid || !date) continue;
    const cur = firstDate.get(vid);
    if (cur === undefined || date < cur) firstDate.set(vid, date);
  }
  return [...firstDate.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([vid]) => vid);
}

function computeKpis({meta, holdings, byVideo, datedVideoIds}) {
  const n_holdings_rows = holdings.length;
  const holdingsWithWeight = holdings.filter(h => h.weight_pct != null);
  const pct_holdings_with_weight_pct = n_holdings_rows > 0
    ? holdingsWithWeight.length / n_holdings_rows
    : 0;

  // mean_cash_pct: average of USD weight_pct values across rows that report one.
  const usdWeights = holdings
    .filter(h => h.asset === 'USD' && h.weight_pct != null)
    .map(h => h.weight_pct);
  const mean_cash_pct = usdWeights.length > 0
    ? usdWeights.reduce((a, b) => a + b, 0) / usdWeights.length
    : null;

  // top3_concentration_pct: for each video with >=3 non-USD/non-OTHER weighted holdings,
  // sum the top-3 weights; then mean across qualifying videos.
  const perVideo = new Map();  // video_id -> array of weight_pct
  for (const h of holdings) {
    if (h.weight_pct == null) continue;
    if (h.asset === 'USD' || h.asset === 'OTHER') continue;
    if (!h.video_id) continue;
    if (!perVideo.has(h.video_id)) perVideo.set(h.video_id, []);
    perVideo.get(h.video_id).push(h.weight_pct);
  }
  const top3Sums = [];
  for (const weights of perVideo.values()) {
    if (weights.length < 3) continue;
    weights.sort((a, b) => b - a);
    top3Sums.push(weights[0] + weights[1] + weights[2]);
  }
  const top3_concentration_pct = top3Sums.length > 0
    ? top3Sums.reduce((a, b) => a + b, 0) / top3Sums.length
    : null;

  // last_video_* via the dated, ASC-sorted list.
  let last_video_date = null;
  let last_video_title = null;
  if (datedVideoIds.length > 0) {
    const lastVid = datedVideoIds[datedVideoIds.length - 1];
    const rec = byVideo[lastVid];
    if (rec) {
      last_video_date = rec.calendar_date || null;
      last_video_title = rec.title || null;
    }
    // Fallback to holdings rows if byVideo lacks the record.
    if (!last_video_date || !last_video_title) {
      const row = holdings.find(h => h.video_id === lastVid);
      if (row) {
        last_video_date = last_video_date || row.calendar_date || null;
        last_video_title = last_video_title || row.title || null;
      }
    }
  }

  const n_videos_total = meta.n_videos_total || 0;
  const n_videos_extracted = meta.n_videos_extracted || 0;
  const n_videos_dated = meta.n_videos_dated || 0;
  const coverage_pct_extracted = n_videos_total > 0 ? n_videos_extracted / n_videos_total : 0;
  const coverage_pct_dated = n_videos_total > 0 ? n_videos_dated / n_videos_total : 0;

  return {
    n_videos_total,
    n_videos_extracted,
    n_videos_dated,
    n_holdings: meta.n_holdings != null ? meta.n_holdings : n_holdings_rows,
    n_actions: meta.n_actions != null ? meta.n_actions : 0,
    coverage_pct_extracted,
    coverage_pct_dated,
    mean_cash_pct,
    top3_concentration_pct,
    pct_holdings_with_weight_pct,
    last_video_date,
    last_video_title,
  };
}

// --- public loader ----------------------------------------------------------

export async function loadAll() {
  // All four fetches in parallel; each has its own fallback so one failure
  // doesn't poison the others.
  const [metaRaw, holdings, actions, byVideoRaw] = await Promise.all([
    fetchJson('./data/meta.json', null),
    fetchCsv('./data/portfolio_holdings_long.csv'),
    fetchCsv('./data/portfolio_actions_long.csv'),
    fetchJson('./data/by_video.json', {}),
  ]);

  // Merge fetched meta over defaults so palette is always populated.
  const meta = metaRaw && typeof metaRaw === 'object'
    ? {...DEFAULT_META, ...metaRaw,
       asset_palette: {...DEFAULT_META.asset_palette, ...(metaRaw.asset_palette || {})}}
    : {...DEFAULT_META};

  const byVideo = byVideoRaw && typeof byVideoRaw === 'object' ? byVideoRaw : {};
  const datedVideoIds = videoIdsByDate(holdings);
  const kpis = computeKpis({meta, holdings, byVideo, datedVideoIds});

  return {meta, holdings, actions, byVideo, kpis, datedVideoIds};
}
