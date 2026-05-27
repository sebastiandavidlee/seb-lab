# CHANGELOG

History of the LeWorldModel demo site, one line per phase.
Earliest phase first.

## T1 — brainstorming (2026-05-26)
Six-agent design brainstorming session. Locked the narrative arc, the six-page structure, the honesty rules, and the asset inventory.
Artifact: `outputs/demo/DESIGN_SPEC.md`.

## T2 — data + figures + animations
Computed every number on the site, produced the static figures and the animation/video assets. Built the canonical aggregate.
Artifacts: `outputs/demo/data/site_data.json` (schema_version 1), `assets/plots/*.png`, `assets/videos/*.mp4`, `assets/videos/*.gif`, `assets/figures/*.svg`.
Tools: `tools/latent_error.py`, `tools/nn_decode.py`, `tools/cem_trace.py`, `tools/t2h_aggregate.py`.

## T3 — validation + audit
Numeric audit against the data file, honesty audit against `HONESTY_PHRASES.md`, accessibility blockers (reduced motion, contrast).
Artifact: audit notes folded into the design spec; surfaced the `--muted` contrast fix and the `prefers-reduced-motion` blocker.

## T4 — page authoring + shared design system
Six pages authored against the spec. Shared `assets/styles.css` (T4-G) defines the design tokens, layout, callouts, and responsive rules. Pages cross-link in linear reading order.
Artifacts: `index.html`, `pusht.html`, `world-model.html`, `planner.html`, `tworoom.html`, `results.html`, `assets/styles.css`, `assets/HONESTY_PHRASES.md`, `assets/nav.html`.

## T5 — polish, integration, reproducibility (2026-05-27)
Final consistency pass. Wired `reduced_motion.js`, added video posters, added Open Graph meta tags, standardised page titles, added a shared site footer, produced the reproducibility README and launch script, ran the final honesty grep.
Artifacts: `assets/reduced_motion.js`, `README.md`, `serve.sh`, `CHANGELOG.md`, `HONESTY_GREP_RESULT.txt`, updates to all six HTML pages and `assets/styles.css`.
