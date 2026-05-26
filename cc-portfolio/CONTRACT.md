# cc-portfolio dashboard — build contract

This file pins the shared interface so 8 agents can build the dashboard in
parallel without stepping on each other. Treat the file paths, DOM IDs,
event names, CSV columns, and module exports as **immutable** for this
build cycle. If something here is wrong, raise it back; do not silently
diverge.

## Target

- Pure static site at `sites/cc-portfolio/` deploying to
  https://sebastiandavidlee.github.io/seb-lab/cc-portfolio/.
- No build step. ES modules over CDN. Loads in any modern browser.
- Topic: visualize one finance YouTuber's (Crypto Currently) stated
  portfolio holdings + actions across 232 video transcripts, including the
  verbatim evidence quotes that ground every claim.

## Owned files (no agent edits outside their own)

| Agent | Owns | Reads |
|-------|------|-------|
| 1. Scaffold | `index.html`, `js/main.js`, `README.md`, `.nojekyll` | — |
| 2. Theme | `css/style.css` | — |
| 3. Data + KPIs | `js/data.js` | `data/*.csv`, `data/meta.json` |
| 4. Conviction Ribbon | `js/chart-ribbon.js` | `data.js` exports |
| 5. Action Strip | `js/chart-actions.js` | `data.js` exports |
| 6. Small Multiples | `js/chart-small-multiples.js` | `data.js` exports |
| 7. Detail Panel | `js/detail-panel.js` | `data.js` exports |
| 8. Publish | `scripts/publish.sh`, `scripts/build_meta.py`, `data/.gitignore` rules. Bootstraps `data/portfolio_holdings_long.csv`, `data/portfolio_actions_long.csv`, `data/portfolio_snapshot_wide.csv`, `data/meta.json`. | extraction cache in `~/projects/youtube/cc-portfolio/` |

## CDN libraries (don't vendor)

- `https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js`
- `https://cdn.jsdelivr.net/npm/papaparse@5/papaparse.min.js`

## CSV schemas (already produced by 3-reconcile/reconcile.py)

`portfolio_holdings_long.csv` columns:
```
calendar_date, date_source, video_id, video_url, title, transcript_path,
channel, slug, asset, weight_pct, size, instrument, confidence
```

`portfolio_actions_long.csv` columns:
```
calendar_date, date_source, video_id, video_url, title, transcript_path,
channel, slug, asset, direction, size_hint, weight_delta_pct, when_relative, confidence
```

(`evidence_quote` is NOT in the long CSV — it's in `data/by_video.json`,
written by agent 8. See "by_video.json" section below.)

`data/meta.json` (agent 8 writes; agent 3 reads):
```json
{
  "generated_at": "2026-05-25T22:30:00",
  "n_videos_total": 232,
  "n_videos_extracted": 47,
  "n_videos_dated": 72,
  "n_holdings": 134,
  "n_actions": 22,
  "date_source_counts": {"portfolio": 0, "filename": 50, "backfill": 22},
  "extractor_model": "qwen2.5:7b-instruct (local, Ollama)",
  "extraction_in_progress": true,
  "asset_palette": {"BTC":"#F7931A","ETH":"#627EEA","SOL":"#14F195","ADA":"#0033AD","AVAX":"#E84142","LINK":"#2A5ADA","DOGE":"#C2A633","XRP":"#23292F","MSTR":"#1D1D1F","USD":"#7FAE6C","OTHER":"#888888"}
}
```

`data/by_video.json` (agent 8 writes):
```json
{
  "Xw1jJaZYkOQ": {
    "video_id": "Xw1jJaZYkOQ",
    "title": "Don't Mess This Up",
    "calendar_date": "2025-09-13",
    "video_url": "https://...",
    "transcript_path": "youtube/transcripts-top/crypto-currently/2025-09-13-don-t-mess-this-up.md",
    "extractor_confidence": 0.9,
    "holdings": [
      {"asset": "BTC", "size": null, "weight_pct": null, "instrument": "spot",
       "confidence": 0.9, "evidence_quote": "I am very happy..."},
      ...
    ],
    "actions": [...],
    "cash_position": {...} | null
  },
  ...
}
```

## js/data.js — module contract (agent 3 owns; everyone else imports)

Export an ES module (`<script type="module">`):

```js
// js/data.js
export const ASSET_ORDER = ["USD","BTC","ETH","SOL","MSTR","ADA","AVAX","LINK","DOGE","XRP","OTHER"];

// One-shot loader. Resolves once everything is fetched + parsed.
export async function loadAll(); 
  // returns: {
  //   meta,                 // contents of data/meta.json
  //   holdings,             // array of row objects from portfolio_holdings_long.csv
  //   actions,              // array of row objects from portfolio_actions_long.csv
  //   byVideo,              // contents of data/by_video.json (video_id -> record)
  //   kpis,                 // computed below
  //   datedVideoIds,        // sorted ASC by calendar_date
  // }

// KPIs (computed inside loadAll; exposed on .kpis):
//   {
//     n_videos_total, n_videos_extracted, n_videos_dated, n_holdings, n_actions,
//     coverage_pct_extracted,        // n_videos_extracted / n_videos_total
//     coverage_pct_dated,            // n_videos_dated / n_videos_total
//     mean_cash_pct,                 // mean USD weight_pct across videos that report one
//     top3_concentration_pct,        // mean across dated snapshots of sum(top-3 weights)
//     pct_holdings_with_weight_pct,  // share of holdings rows with non-null weight_pct
//     last_video_date,               // "YYYY-MM-DD" or null
//     last_video_title,
//   }

// Selection state pub/sub. Other modules subscribe.
export const state = {
  selectedVideoId: null,
  selectedAsset: null,         // for asset filter chip (null = all)
};
export function setSelectedVideoId(vid);   // updates state, fires 'cc:select'
export function setSelectedAsset(asset);   // updates state, fires 'cc:asset'

// Event channel:
//   window.dispatchEvent(new CustomEvent('cc:select', {detail: {videoId}}))
//   window.dispatchEvent(new CustomEvent('cc:asset',  {detail: {asset}}))
//   window.dispatchEvent(new CustomEvent('cc:ready',  {detail: {data}}))   // fired by main.js after loadAll resolves
```

When `data/*.csv` or `data/by_video.json` are missing or empty, `loadAll`
MUST still resolve with empty arrays and a `meta` object reflecting
`n_videos_extracted: 0` so the rest of the page can render its
empty-state UI. Never throw on missing data.

## DOM contract (agent 1 owns; chart modules mount into these IDs)

`index.html` provides these mount points; nobody else creates or
renames them:

```html
<header id="cc-header">                  <!-- agent 1 -->
<section id="cc-hero">                   <!-- agent 1 -->
<section id="cc-kpis">                   <!-- agent 1 fills from kpis -->
<section id="cc-chart-ribbon">           <!-- agent 4 mounts ECharts here -->
<section id="cc-chart-actions">          <!-- agent 5 mounts ECharts here -->
<section id="cc-chart-smallmult">        <!-- agent 6 mounts ECharts here -->
<aside  id="cc-detail-panel">            <!-- agent 7 owns innerHTML -->
<footer id="cc-provenance">              <!-- agent 1 fills from meta -->
```

`main.js` flow:
1. `import { loadAll } from './data.js'`.
2. Await `loadAll()`.
3. Fill `#cc-kpis` and `#cc-provenance` from `meta` + `kpis`.
4. Dynamically `import()` each chart module and call its `render(data)`.
5. Set up the detail panel module: `init(data)`.
6. Dispatch `cc:ready` on `window`.

## Chart module contract (agents 4, 5, 6)

Each chart module exports:
```js
export function render(data);   // initial mount; returns ECharts instance (or null in empty-state)
export function update(data);   // re-render after data refresh (optional; only if you support it)
```

`data` is the object returned by `loadAll()`.

Chart modules MUST:
- Render an empty-state placeholder div with class `.cc-empty` when no
  rows are available, with text "awaiting extraction (47/232 videos so
  far)". Use the meta counts.
- Listen for `cc:asset` to dim non-selected assets.
- Listen for `cc:select` if cross-chart highlight makes sense (optional).
- On user click of a relevant element, call
  `import('./data.js').then(m => m.setSelectedVideoId(vid))`.

## Detail panel contract (agent 7)

`init(data)`:
- Subscribe to `cc:select`.
- On `videoId === null`, render the empty state ("click a day or a video").
- Otherwise look up `data.byVideo[videoId]` and render: date, title (link to YouTube via video_url), holdings table with evidence_quote, actions table with evidence_quote, transcript_path as a link to the GitHub raw file
  (`https://github.com/sebastiandavidlee/seb-lab/raw/main/cc-portfolio/<transcript_path>`).
- Mirror selection in URL hash `#v=<video_id>`. On load, if hash is set,
  pre-select that video.

## CSS contract (agent 2 owns)

- Color palette comes from `meta.asset_palette` for assets. The page chrome
  itself matches the pi05-site editorial idiom: Inter for UI, a serif for
  headlines + quotes, a calm off-white background, generous whitespace.
- Required classes (every other agent uses):
  - `.cc-card`           — section container with subtle border + radius
  - `.cc-kpi`            — single KPI tile (label + big number)
  - `.cc-badge`          — small inline pill (e.g. coverage badge)
  - `.cc-quote`          — italic serif blockquote with em-dash attribution
  - `.cc-empty`          — empty-state placeholder, dimmed
  - `.cc-asset-chip`     — small pill for an asset, color from palette
  - `.cc-provenance`     — small monospace footer text
- Charts get a fixed min-height (`#cc-chart-ribbon: 420px`,
  `#cc-chart-actions: 140px`, `#cc-chart-smallmult: 360px`) so layout
  doesn't shift while data loads.
- Mobile breakpoint: 720px. Below it, hide `#cc-detail-panel` (it becomes
  a full-screen overlay triggered by selection — agent 7 handles the
  overlay markup, agent 2 styles it).

## Provenance footer text (agent 1 fills, copy here)

```
N=<n_videos_extracted>/<n_videos_total> extracted ·
<n_holdings> holdings · <n_actions> actions ·
date sources: portfolio <X>% / filename <Y>% / backfill <Z>% ·
weight_pct present: <pct>% ·
extractor: qwen2.5:7b-instruct (local) · not human-audited
```

## Publish driver (agent 8)

`scripts/publish.sh` (run from `sites/cc-portfolio/`):
1. Run `python ~/projects/youtube/cc-portfolio/3-reconcile/reconcile.py`
   (best-effort — if extraction cache is sparse, reconcile still produces
   CSVs with whatever rows are available).
2. Copy `~/projects/youtube/cc-portfolio/4-report/out/portfolio_*.csv`
   into `sites/cc-portfolio/data/`.
3. Run `python scripts/build_meta.py` which:
   - Loads the validate cache, computes the counts in `meta.json` above.
   - Walks every `2-validate/cache/*.json`, emits `data/by_video.json`.
4. Exit non-zero only if the CSVs are missing entirely (so the page can
   still ship with empty data).

The publish script is idempotent and safe to re-run as extraction
completes more transcripts.

## What NOT to do

- No build step. No npm install. No bundler.
- No frameworks (React/Vue/Svelte). Vanilla ES modules.
- No fabricated portfolio P&L curves. No "if you followed him" returns.
  No interpolating across dates without data.
- No silent imputation of null `weight_pct`. Two-track display per skeptic.
- No hiding `OTHER:*` — surface it explicitly.
- No editing files outside your owned list.

## Empty-state UX (all agents)

Extraction is still running while the dashboard ships. So at first deploy
`n_videos_extracted` may be 1–10. The page must render gracefully with
that, showing the live progress count in the provenance footer and an
"awaiting extraction" badge near the main chart. As more transcripts
extract, re-running `scripts/publish.sh` + a git push refreshes the page.
