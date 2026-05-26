# cc-portfolio

A small static dashboard that visualizes one finance YouTuber's
(Crypto Currently) **stated** portfolio holdings and actions across
232 video transcripts — with the verbatim quote behind every claim.

- Live page: https://sebastiandavidlee.github.io/seb-lab/cc-portfolio/
- Parent site: https://sebastiandavidlee.github.io/seb-lab/

## What this is (and isn't)

This is a transparency exercise, not a backtest. Every holding and
action shown comes from the channel's own words; every row links back
to the timestamp of the quote that produced it. There is no synthetic
P&L curve, no "if you'd followed him" return, no interpolation
between dates we don't have.

Holdings are reported two ways:
- **with `weight_pct`** when the YouTuber names a number ("I'm 40%
  Bitcoin").
- **without `weight_pct`** when he only names the asset. Those rows
  are surfaced separately so we never silently impute zero.

`OTHER:*` is shown as itself — not folded into a residual.

## Source pipeline

The extraction pipeline lives **outside** this site repo, in a
separate working tree under
`~/projects/youtube/cc-portfolio/` (1-fetch → 2-validate →
3-reconcile → 4-report). It runs locally and writes the CSV +
`by_video.json` files this site reads.

The extractor is **`qwen2.5:7b-instruct` running locally via
Ollama** — not an Anthropic model. It is small, fast, and good
enough for structured-extraction prompts; trade-off is occasional
miss on subtle context. Output is **not** human-audited; the
provenance footer at the bottom of the page always reports current
coverage.

## Local development

No build step. No npm install. Open `index.html` over a static file
server (so ES module imports + `fetch('data/...')` work):

```bash
cd ~/projects/sites/cc-portfolio
python -m http.server 8000
# then visit http://localhost:8000/
```

## File layout

```
index.html                     # mount points + CDN script tags
.nojekyll                      # disables GitHub Pages Jekyll
css/style.css                  # owned by theme agent
js/main.js                     # entry; fills KPIs/hero/provenance, boots charts
js/data.js                     # loadAll(): CSVs + by_video.json → {meta, holdings, actions, byVideo, kpis}
js/chart-ribbon.js             # conviction ribbon (ECharts)
js/chart-actions.js            # action strip (ECharts)
js/chart-small-multiples.js    # per-asset small multiples (ECharts)
js/detail-panel.js             # right-rail video detail w/ evidence quotes
data/                          # CSVs + meta.json + by_video.json (built by scripts/publish.sh)
scripts/publish.sh             # runs the extraction pipeline + copies artifacts here
```

## Refreshing the page

```bash
cd ~/projects/sites/cc-portfolio
./scripts/publish.sh        # re-runs reconcile, copies CSVs, rebuilds meta + by_video
git add data/ && git commit -m "data: refresh" && git push
```

GitHub Pages re-deploys automatically. Extraction is incremental, so
the dashboard ships with whatever coverage exists at publish time and
the provenance footer reports it honestly.
