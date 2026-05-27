# HONESTY_PHRASES.md — page-author cheatsheet

Owner: T4-G. Consulted by all page agents (T4-A..F) and the T5 polish pass.
Derived from `DESIGN_SPEC.md` §5 and T3-E audit.

A pre-publish grep enforces a subset of these rules; see end of file.

---

## 1. BANNED verbs / phrases (hard fail — must not appear in any page text)

These words imply cognition, generality, or paper-equivalence we did not demonstrate.

| Banned | Why | Use instead |
|---|---|---|
| thinks | implies cognition | outputs |
| wants | implies goals/desire | the cost function rewards |
| tries | implies intent | samples action sequences scored by |
| understands | implies comprehension | produces latents that |
| learns to | implies goal-directed learning | is trained to predict |
| dreams | implies imagination | nearest-neighbor decodes to |
| imagines | implies imagination | predicts latents that |
| decides | implies agency | the argmin of the cost is |
| matches the paper | false; p < 1e-20 | 11.65pp below the paper's reported 96.0 |
| general-purpose | we tested 2 toy tasks | evaluated on Push-T (and TwoRoom) |
| robotics | overclaims scope | the Push-T / TwoRoom task |
| transfers | we did no transfer experiment | second task evaluated independently |
| transfers to | same | second task evaluated independently |

### Soft-banned (require a number on the same page)

`closely approaches`, `comparable to`, `in the ballpark`, `near-paper`, `state-of-the-art`. If used, the surrounding paragraph MUST include the actual delta in percentage points.

---

## 2. ALLOWED replacements (use these by default)

- "outputs actions that …"
- "produces latents whose nearest neighbors are …"
- "predicts latents that, when nearest-neighbor decoded, resemble …"
- "the CEM cost function rewards …"
- "samples 300 action sequences, scores each by cost-to-goal in latent space, takes the elite mean"
- "second task evaluated independently" (not "transfers to")
- "evaluated on Push-T at 50 episodes × 23 seeds" (always name the task)

---

## 3. Required disclosures (must appear next to specific artifacts)

### NN-decoded videos / frames
Every video or still that uses nearest-neighbor decoding (i.e., `nn_imagined_rollout.mp4`, `imagined_vs_real_side.mp4`, latent-PCA frame retrievals) MUST carry, in the `<figcaption>`:

```
[NN-decoded retrieval — not generation]
```

Recommended full caption template:

```html
<figcaption>
  Predicted latents decoded by nearest-neighbor lookup against the training-set
  latent index. <strong>[NN-decoded retrieval — not generation]</strong> — the
  pixels shown are real training frames, not model output.
</figcaption>
```

### Headline numbers
Any time the success rate is quoted, the same paragraph (or the same card row) must include:
- our number: `84.35 ± 5.18` (or whichever stat is current)
- the paper number: `96.0`
- the random baseline: `3.33`
- the n: `23 seeds × 50 episodes`
- the seed range, e.g. `seeds 0–22`

If any of these is missing, link to the row where they appear.

### Capability claims
Every capability statement names its task: not "LeWM works", but "LeWM reaches 84.35% on Push-T (50 ep × 23 seeds)".

### Gap framing
Every comparison to the paper number must list THREE hypotheses for the 11.65pp gap, ranked NONE above the others:

1. Undocumented eval config differences
2. Released weights ≠ paper-final checkpoint
3. Vendor `swm` code drift since paper publication

(Spec wording — page authors may rephrase but must keep the equal-weight framing.)

---

## 4. Required cross-references in every results comparison

Whenever ours appears next to paper:
- random baseline must also appear in the same visual (bar / line / table row)
- y-axis must start at 0 (chart) or the table must show absolute % (not delta)
- aggregate must show `std`, `n`, and seed range without scrolling

---

## 5. Style — small things that bite later

- Number formatting: `84.35` (2 dp), `± 5.18` (2 dp), `3.33` (random), `96.0` (paper, 1 dp matches paper). Use a non-breaking space before units: `50&nbsp;ep`, `23&nbsp;seeds`.
- "Push-T" is hyphenated. "TwoRoom" is one word, camel-cased.
- "LeWM" (no spaces); spell out "LeWorldModel" once per page on first mention.
- "JEPA" — define on first use per page: "Joint Embedding Predictive Architecture (JEPA)".
- "CEM-MPC" — define on first use per page: "Cross-Entropy Method, Model-Predictive Control (CEM-MPC)".
- Latent dim is `192`; observation is `RGB 224×224`; action is `2-d push velocity`. Keep these consistent.

---

## 6. Pre-publish grep (CI / manual)

Authors and reviewers run this from `outputs/demo/site/`:

```bash
grep -rEi "thinks|wants|tries|understands|learns to|dreams|imagines|decides|matches the paper|general-purpose|robotics|transfers" .
# must return zero hits inside page text (matches in code/comments OK only if
# they cannot render to a reader — keep banned words out of HTML body content)
```

Plus for NN-decoded asset hygiene:

```bash
# Every NN-decoded video filename must be co-located with the watermark phrase
# in the same HTML file.
for f in $(grep -lE "nn_imagined_rollout|imagined_vs_real|latent_pca_trajectory" *.html); do
  grep -q "NN-decoded retrieval" "$f" || echo "MISSING WATERMARK: $f"
done
```

Both must return clean before T5 polish.
