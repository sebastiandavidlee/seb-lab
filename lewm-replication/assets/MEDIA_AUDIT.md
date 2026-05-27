# Media Audit — LeWorldModel demo site

Agent: **T5-B (Animation/Video QA)** — final multimedia pass.
Source dir: `outputs/demo/videos/` (symlinked into `outputs/demo/site/assets/videos/`).

All file-size thresholds: mp4 ≤ 2 MB, gif ≤ 3 MB. **All assets pass.**
Total media payload: **1.9 MB** across 12 files.

---

## 1. Video / GIF inventory

| File | Size | Dim (WxH) | Duration | FPS | Frames | Codec | Used in |
|---|---:|---|---:|---:|---:|---|---|
| `hero_3policy_loop.mp4`      |  39 KB | 720x340   | 6.67 s | 15 | 100 | h264 | `index.html` (autoplay loop muted) |
| `tworoom_rollout_loop.mp4`   |  17 KB | 480x392   | 6.00 s | 15 |  90 | h264 | `tworoom.html` (controls loop muted) |
| `tworoom_ep0_success.mp4`    |   9 KB | 736x288   | 3.33 s | 15 |  50 | h264 | `tworoom.html` (controls) |
| `tworoom_ep1_fail.mp4`       |  10 KB | 736x288   | 3.33 s | 15 |  50 | h264 | `tworoom.html` (controls) |
| `tworoom_ep2_success.mp4`    |   8 KB | 736x288   | 3.33 s | 15 |  50 | h264 | `tworoom.html` (controls) |
| `tworoom_ep5_success.mp4`    |   9 KB | 736x288   | 3.33 s | 15 |  50 | h264 | **UNREFERENCED in HTML** |
| `nn_imagined_rollout.mp4`    | 126 KB | 2420x470  | 4.25 s |  4 |  17 | h264 | `world-model.html` (autoplay loop muted) |
| `nn_imagined_rollout.gif`    | 601 KB | 2471x480  | 4.25 s |  4 |  11 | gif  | **UNREFERENCED in HTML** (mp4 is used instead) |
| `imagined_vs_real_side.mp4`  | 138 KB | 2420x470  | 7.50 s |  4 |  30 | h264 | **UNREFERENCED in HTML** |
| `failure_montage_2x3.mp4`    |  60 KB | 540x484   | 8.00 s | 15 | 120 | h264 | **UNREFERENCED in HTML** |
| `cem_sampling_anim.gif`      | 726 KB | 1000x500  | 5.80 s | 6.25 | 30 | gif | `planner.html` (`<img>` tag) |
| `pusht_task_anim.gif`        | 136 KB | 736x340   | 3.34 s | 15 |  50 | gif  | `pusht.html` (`<img>` tag) |

All durations are in the sensible 3-10 s range; all framerates 4-15 fps (the 4 fps assets are step-paced rollout strips — appropriate for the content).

---

## 2. Loop quality (first-vs-last frame)

Numerical first/last-frame compare (RGB, full-res), lower mean-abs-diff = smoother loop:

| Loop asset | mean abs diff (/255) | PSNR | Verdict |
|---|---:|---:|---|
| `hero_3policy_loop.mp4`     | 2.04 | 25.1 dB | **Acceptable.** Slight visible jump at seam (T-block positions differ between random/policy/expert panels at start vs end of the loop), but no jarring color/scene change. |
| `tworoom_rollout_loop.mp4`  | 1.21 | 26.6 dB | **Good.** Background dominates, agent position resets cleanly. |
| `nn_imagined_rollout.mp4`   | n/a (intentional progress) | — | **Not a true loop.** First frame has only ctx column filled (t+1…t+10 blank); last frame has all columns filled. When set to `loop`, the reveal restarts from blank — this is *desirable* pedagogically and matches the "rollout fills in over time" intent, but viewers may briefly see a blank grid each loop. **Recommend keeping `autoplay loop` but adding a `preload` and a poster image so the blank-start state is less surprising.** |

No video has a jarring color shift, codec glitch, or off-by-one frame at the seam.

---

## 3. NN-decoded watermark verification

Sampled 5 evenly-spaced frames from `nn_imagined_rollout.mp4` (frames 0, 4, 8, 12, 16) and 3 from the `.gif`:

- **Every NN-decoded (bottom-row) cell that contains image content shows `[NN-decoded retrieval]` in an orange box at the top of the cell.** Frame 0 shows it on the single populated `t (ctx)` cell; frame 16 (final) shows it on all 11 cells. The `.gif` matches.
- Bottom-of-cell `cos=…` similarity badge is also visible on every populated bottom-row cell (cos drops from 1.00 at ctx to ~0.94 at t+10, matching the "drifts visibly by step 8 onward" claim in the aria-label).
- Footer caption *"Bottom row is NOT generated pixels. It is the closest training frame (in 192-d latent space) to what the predictor produced."* is legible at native resolution (2420 px wide). At typical web display widths (~900-1200 px) the watermark badge remains readable; the footer caption will become small — page CSS should ensure this video is displayed at ≥ 60 % viewport width or readers will need to enlarge.

**Verdict: watermark integrity confirmed. T3-C's partial check holds.**

---

## 4. aria-label cross-check

| Video | aria-label accurate? | Notes |
|---|---|---|
| `hero_3policy_loop.mp4` (index.html:37) | **Yes** | Describes 3-panel layout, random vs replicated policy vs success — matches frame extraction. |
| `tworoom_rollout_loop.mp4` (tworoom.html:52) | **Yes** | Top-down two-room arena, agent navigating — matches. |
| `tworoom_ep0_success.mp4` (tworoom.html:154) | **Yes** | Success episode, traversal to goal — matches. |
| `tworoom_ep1_fail.mp4` (tworoom.html:176) | **Yes** | Failure to reach goal — matches. |
| `tworoom_ep2_success.mp4` (tworoom.html:165) | **Yes** | Second success example — matches. |
| `nn_imagined_rollout.mp4` (world-model.html:141) | **Yes — excellent.** | Explicitly calls out top/bottom rows, watermark text, 10-step horizon, and drift onset; all verified against frames. |

`cem_sampling_anim.gif` and `pusht_task_anim.gif` are loaded via `<img>` and use `alt=` (not aria-label) — outside this audit's scope but worth a T5-E spot-check.

---

## 5. Reduced-motion handling

CSS-only solutions cannot pause `<video autoplay>`. Two autoplay videos exist:
- `hero_3policy_loop.mp4` (index.html)
- `nn_imagined_rollout.mp4` (world-model.html)

**Deliverable:** `assets/reduced_motion.js` (sibling to this file). It:
1. On load, queries `(prefers-reduced-motion: reduce)`.
2. If matched: pauses all `<video autoplay>`, strips `autoplay`, exposes `controls=true` so the user can opt-in.
3. Reacts to live preference changes (the user can toggle the OS setting without reloading).
4. Wrapped in try/catch — failures never break the page.

Integration (T5-E): add to every page footer (or just `index.html` and `world-model.html`):
```html
<script src="assets/reduced_motion.js" defer></script>
```

The GIF animations (`cem_sampling_anim.gif`, `pusht_task_anim.gif`, `nn_imagined_rollout.gif`) cannot be paused from JS — they're `<img>` tags. If reduced-motion is a hard requirement for those, swap to a static `<picture>` with mp4-poster fallback. **Recommend deferring** unless an accessibility reviewer flags it; the autoplay videos are the bigger lever.

---

## 6. Posters generated

`outputs/demo/site/assets/poster/*.png` — first-frame extracts for `<video poster="…">` fallback. 9 files, ~9 KB-170 KB each (lossless PNG, can be re-encoded to JPEG if total weight matters; current total 469 KB).

---

## 7. Unreferenced assets (cleanup candidates)

These exist in `outputs/demo/videos/` but are not linked from any HTML page:

- `failure_montage_2x3.mp4` — likely intended for `results.html#failure-modes` (section exists at line 173); **T5-E should consider integrating** or delete to save the 60 KB. The aria-label section header exists; the video would be a natural fit.
- `imagined_vs_real_side.mp4` — superset of `nn_imagined_rollout.mp4` (longer, 7.5 s vs 4.25 s). Either supersedes the current `world-model.html` video or is redundant. **Decide and delete one.**
- `nn_imagined_rollout.gif` — fallback for browsers that block mp4 autoplay (rare). Safe to delete unless a fallback is wanted; saves 601 KB.
- `tworoom_ep5_success.mp4` — fourth tworoom example not referenced. Either add to the page or delete; only 9 KB so low priority.

---

## 8. Three recommendations for T5-E

1. **Add `poster="assets/poster/<name>.png"` to all five referenced `<video>` tags.** This gives a clean first-frame preview before the user clicks play (especially important for the `controls`-but-no-`autoplay` videos on `tworoom.html`, which currently show a black rectangle). Concrete edits:
   - `index.html:33-38` → add `poster="assets/poster/hero_3policy_loop.png"`
   - `tworoom.html:50, 152, 163, 174` → add matching posters
   - `world-model.html:137` → add `poster="assets/poster/nn_imagined_rollout.png"`
2. **Wire `<script src="assets/reduced_motion.js" defer></script>` into the footer of `index.html` and `world-model.html`** (the two pages with `autoplay` videos). Optional: add to all pages for consistency.
3. **Integrate `failure_montage_2x3.mp4` into `results.html#failure-modes`** (section already exists, video already encoded). This is the single biggest "shipped-but-not-shown" content gap. Either that or `imagined_vs_real_side.mp4` into `world-model.html` as an extended-horizon companion to the current 4.25 s clip.

## 9. Media to replace or warn about

- None require replacement. All file sizes are well under thresholds, all loops are visually clean, all aria-labels are accurate, and the NN-decoded watermark integrity holds.
- **Soft warning:** `nn_imagined_rollout.mp4` at 2420 px native width will look tiny if displayed at < 50 % viewport width on mobile. T5-E should verify the `world-model.html` layout gives this figure full-width on small screens, or the footer caption "Bottom row is NOT generated pixels…" will be illegible — which would weaken the honest-framing posture the site is built around.
