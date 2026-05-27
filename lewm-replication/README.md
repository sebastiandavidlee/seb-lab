# LeWorldModel demo site — README

A six-page static site that walks through our from-scratch replication of
**LeWorldModel** (Maes, LeCun, Balestriero, arXiv:2603.19312, Mar 2026) on
Push-T and TwoRoom. It leads with the **11.65 percentage-point gap** between
the paper's reported 96.0% and our pooled 84.35% (23 seeds × 50 episodes), and
walks the encoder, latent predictor, CEM-MPC planner, and the per-task /
pooled stats that produced that number. No build step — HTML/CSS/JS only.

---

## Serve locally

```bash
cd outputs/demo/site && python3 -m http.server 8000
# or
./serve.sh           # defaults to :8000
./serve.sh 8080      # custom port
```

Then open <http://localhost:8000/>.

The site is pure static assets — no Node, no Python venv, no build. The
`reduced_motion.js` is a single file loaded with `defer`; CSS lives in
`assets/styles.css`.

---

## Pages (linear reading order — see DESIGN_SPEC.md §1)

| # | File | Purpose |
|---|---|---|
| 1 | `index.html` | Landing — headline gap (96.0 vs 84.35 vs 3.33) in first 100 words |
| 2 | `pusht.html` | Push-T task: obs / action / reward, why it is hard |
| 3 | `world-model.html` | Encoder + latent predictor + NN-decoded retrieval (no pixel decoder) |
| 4 | `planner.html` | CEM-MPC: 300 samples × 5-step rollout × 30 iterations |
| 5 | `tworoom.html` | Second task evaluated independently (NOT transfer) |
| 6 | `results.html` | Pooled 84.35 ± 5.18, the gap, three hypotheses ranked equally |

---

## Where the data comes from

Every number on the site is sourced from a single aggregated file:

- `outputs/demo/data/site_data.json` — schema_version 1, generated 2026-05-26

Which is computed from the raw per-seed evaluations:

- `outputs/faithful/pusht/seed{0..22}/result.json` — 23 Push-T seeds × 50 ep
- `outputs/faithful/pusht_n100/...` — single-seed n=100 sanity (88.0%)
- `outputs/faithful/pusht_random/seed{0,1,2}/result.json` — random baseline
- `outputs/faithful/tworoom/seed{0,1,2}/result.json` — 3 TwoRoom seeds × 50 ep
- `outputs/faithful/metrics_faithful.json` — top-line aggregates

Plus the asset-specific intermediates under `outputs/demo/data/`:

- `latent_error_vs_horizon.json` — predictor MSE at k=1..30
- `cem_traces.json` — per-iter elite cost + action std for the planner animation
- `nn_decode_stats.json` — NN-retrieval distances for the world-model video
- `failure_taxonomy.csv` — hand-labelled failure categories
- `tworoom_stats.json` — pooled TwoRoom aggregates
- `hero_episode_choices.json` — rule-selected episodes for the hero clip
- `asset_inventory.json` — every figure/video the pages reference

---

## How to regenerate every artifact

All commands run from `leworldmodel/` repo root unless noted. The full
end-to-end pipeline (eval → aggregate → figures → videos → site) is:

```bash
# 0. Environment (see "Gotchas" below — these pins matter)
pip install -r requirements.lock                   # main env
# OR for the eval-only env:
pip install datasets==4.0.0 pyarrow==20.0.0        # NOT the .venv-main defaults

# 1. Re-run the full sweep (~25 min on a 4080)
bash run_faithful.sh                               # 23 Push-T + 3 TwoRoom + 3 random

# 2. Re-aggregate to the single source of truth
python tools/t2h_aggregate.py \
  --in  outputs/faithful \
  --out outputs/demo/data/site_data.json

# 3. Per-asset recomputes
python tools/latent_error.py     # → outputs/demo/data/latent_error_vs_horizon.json
                                 #   + assets/plots/latent_error_vs_horizon.png
python tools/nn_decode.py        # → outputs/demo/data/nn_decode_stats.json
                                 #   + assets/videos/nn_imagined_rollout.mp4 (watermarked)
python tools/cem_trace.py        # → outputs/demo/data/cem_traces.json
                                 #   + assets/videos/cem_sampling_anim.gif

# 4. Serve and review
cd outputs/demo/site && python3 -m http.server 8000
```

The site reads from the JSON files baked at build time (numbers are already
inlined into the HTML), so step 4 just renders. If you change the data, you
also need to re-author the page text — there is no live data binding.

---

## The four gotchas (anyone re-running will hit these)

These are documented at the repo level too (`memory/project_leworldmodel.md`,
`STATUS_datasets.md`, `STATUS_weights.md`); pinning them here so the
reproducer doesn't burn an afternoon.

1. **`datasets` / `pyarrow` pins.** `.venv-main` shipped with
   `datasets==2.14.4 + pyarrow==24.0.0` — incompatible. Bump to
   `datasets==4.0.0 + pyarrow==20.0.0` before any data loader runs.

2. **Dataset symlink path.** The Push-T expert dataset MUST live at
   `.stable-wm/datasets/pusht_expert_train.h5` (flat), not nested in a
   `pusht/` subdir. Symlink it from wherever you actually downloaded it.

3. **Checkpoint cache 401.** Vendor `swm.load_pretrained("pusht/lewm")`
   tries to fetch from a non-existent HF repo `huggingface.co/pusht/lewm`
   and 401s. Symlink your local weights into the path it expects:
   `.stable-wm/checkpoints/models--pusht--lewm/`.

4. **Result-parser regex.** `_lib.sh::write_result_json` was a single-line
   regex that missed numpy multi-line array reprs and silently captured
   stale smoke-run entries. Fixed with a balanced-brace scan + `re.DOTALL`.
   If you see suspiciously round per-seed numbers, suspect this first.

---

## How to interpret the numbers

| Quantity | Value | Source |
|---|---|---|
| Paper's reported Push-T success | **96.0%** ± 2.83 (1 dp) | arXiv:2603.19312, Table 1 |
| Our pooled Push-T success | **84.35% ± 5.18%** | 970/1150, n=23 seeds × 50 ep, this work |
| Wilson 95% CI on our pooled | [82.13, 86.33] | this work |
| Random-action baseline | **3.33%** | 5/150, n=3 seeds × 50 ep, this work |
| Gap (paper − ours) | **−11.65 pp** | direct subtraction |
| One-sided binomial p-value | ≈ 3 × 10⁻⁵⁴ | H₀: p = 0.96; observed 970/1150 |

Read the numbers like this:

- **The model is doing real work.** 84% vs 3% random means the released
  weights and the planner are functioning; "the model is broken" is not on
  the list of explanations.
- **The gap is not seed noise.** With 1,150 pooled episodes our point
  estimate is tight enough that a paper-vs-ours difference of 11.65 pp is
  about 18 binomial standard errors out — sampling cannot explain it.
- **We do not name a cause.** Per the spec, three hypotheses for the gap
  are listed with NO ranking: (a) undocumented eval-config differences,
  (b) released weights ≠ paper-final checkpoint, (c) vendor `swm` code drift
  since paper publication.

---

## Honesty rules in force

Every page in this site was authored against
[`assets/HONESTY_PHRASES.md`](assets/HONESTY_PHRASES.md), which bans
overclaim verbs (`thinks`, `imagines`, `decides`, `transfers`,
`general-purpose`, …) and requires NN-decoded visualisations to carry a
visible `[NN-decoded retrieval — not generation]` watermark.

The final pre-publish honesty grep result is in
[`HONESTY_GREP_RESULT.txt`](HONESTY_GREP_RESULT.txt). The one hit there is
a quoted negation and is explicitly allowed; everything else is clean.

---

## Citation

If you reference this replication:

> Maes, A., LeCun, Y., & Balestriero, R. (2026).
> *LeWorldModel: a latent world model with CEM-MPC for non-prehensile control.*
> arXiv:2603.19312 [cs.LG], March 2026.

This site is a replication of that paper, not an authored result.
Repository: <https://github.com/sebastiandavidlee/leworldmodel> (or local
checkout under `~/projects/robotics/leworldmodel/`).
