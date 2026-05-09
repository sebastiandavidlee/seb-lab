# LeRobot Study — Page Rewrite Guide

You are rewriting one page of a 9-page static site about HuggingFace LeRobot.
The old site was correct but **too dense and too technical**. Your job is to
make it pedagogical: progressive disclosure, mental models, basics first.

---

## Who you are writing for

- A hobbyist working with **SO-101** at home.
- Has used `lerobot-record`, `lerobot-train`, `lerobot-eval` from the CLI.
- Has fine-tuned at least one policy from a Hub checkpoint (ACT, Diffusion, SmolVLA).
- Has **never opened a `.py` file in `src/lerobot/`**.
- Goal: actually understand the moving parts so they can debug, optimize, and decide
  on advanced features (RL, V-JEPA, async inference).

If a sentence assumes the reader has read the source, rewrite it.

---

## Voice

- Friendly, conversational, second-person (`you can…`, `you'll see…`).
- **Define jargon on first use** in plain language. ("A *policy* is the trained brain
  that maps what the robot sees to what it should do next.")
- **Lead with "why should I care"**, then "what it is".
- Use everyday analogies. Examples that worked elsewhere on this site:
  - *A dataset is a folder of recorded demos with an index card.*
  - *A policy is a brain that maps what-the-robot-sees to what-it-should-do.*
  - *Async inference is two programs talking — one on the robot, one on the GPU box.*

### Voice rules with concrete examples

**BAD** (current site): "The async stack is a two-process gRPC system: a `RobotClient`
on the robot host and a `PolicyServer` on a (typically GPU) inference host."

**GOOD**: "When your robot runs a trained policy in real time, two programs talk to
each other: one on the robot ('client'), one on a beefy GPU machine ('server').
They send camera frames one way and motor commands the other way over the network.
The technical name is gRPC, but you don't need to think about it."

**BAD**: "`SACPolicy.predict_action_chunk` raises `NotImplementedError` at
`policies/sac/modeling_sac.py:78-81`."

**GOOD**: "SAC, the RL algorithm LeRobot ships, predicts one motor command at a time —
not a chunk of future commands like ACT or Diffusion does. (Expand the deep dive
for the exact code line.)"

---

## Structure (every page **except** index)

Use `shared/page-template.html` and fill the labeled BLOCKs in this order:

1. **EYEBROW** — short uppercase tag (e.g. `TRAINING`, `INFERENCE`).
2. **H1** — page title in plain English (matches `nav.html` label).
3. **READ TIME + PERSONA TAG** — e.g. "6 min read · for SO-101 users".
4. **TLDR** — 1-2 plain sentences in `.tldr`. The verdict. No jargon.
5. **WHAT THIS MEANS FOR YOU** — italic lead in `.what-this-means`, max 50 words.
6. **MENTAL MODEL** — one analogy or ASCII diagram in `.mental-model`.
7. **THE BASICS** — `<h2>The basics</h2>` + 3-5 short subsections.
8. **HOW YOU ACTUALLY USE IT** — `<h2>` + CLI examples in `.workflow` blocks.
9. **THINGS TO KNOW** — `<h2>` + concise warnings/tips (use `.callout-warn` etc).
10. **UNDER THE HOOD (OPTIONAL)** — 2-3 `<details class="deep-dive">` blocks.
    **The collapsed content is where ALL file:line citations, exact code refs,
    and architecture detail live.** Preserve the existing technical content,
    but inside `<details>`.
11. **NEXT UP** — `.next-up` box pointing to the next most useful page.

### Length budget per page

- Surface prose (everything **above** the deep-dives): aim for 350-700 words. Tight.
- Deep-dive contents: **as long as needed** — this is where the existing technical
  content goes. Don't delete it; hide it.

---

## Drop-down rules

- Every `<details class="deep-dive">` needs a clear `<summary>`. Examples:
  - `<summary>Show the actual code references</summary>`
  - `<summary>How this works under the hood</summary>`
  - `<summary>Migration step-by-step</summary>`
- **Default closed** (no `open` attribute).
- Inside the details, the existing technical content lives — file:line citations and
  all. Hidden by default, available if curious.
- **At least 2 deep-dive sections per page, ideally 3.**

---

## CSS helpers you have

Use these classes (defined in `shared/styles.css`):

| Class | Purpose |
|---|---|
| `.eyebrow` | Small uppercase tag above h1 |
| `.read-time` | "6 min read" indicator |
| `.persona-tag` | Pill: "for SO-101 users", "for advanced users" |
| `.tldr` | Tinted "if you remember nothing else" box |
| `.what-this-means` | Italicized "what this means for you" lead |
| `.mental-model` | Boxed analogy or ASCII diagram |
| `.workflow` | CLI-example block (use `<span class="wf-prompt">` and `<span class="wf-comment">`) |
| `.cli-cmd` | Inline CLI command (different from plain `<code>`) |
| `details.deep-dive` | Collapsible technical-detail block |
| `.skip-hint` | Muted "(skip if you just use the CLI)" label |
| `.next-up` | End-of-page recommendation box |
| `.section-divider` | Labeled horizontal rule (basics → deep dive) |

**Existing classes to keep using** (do not modify): `.compare-cols`, `.col-v044`,
`.col-v050`, `.callout-info|warn|new|removed`, `.file-ref`, `.kbd`, `.tabs`, `.lede`,
`.row-highlight`. The `.file-ref` class is now mostly used **inside deep-dives**.

---

## The index page is special

Use `shared/page-template-index.html`, not the regular template.

- **No deep-dive sections needed** (or at most one).
- **Hero card grid** with 3-4 "pick your path" cards (`.hero-card-grid` + `.hero-card`).
- A small **at-a-glance facts** table.
- A **topic guide** grid (what's on each page, in plain language).
- A **glossary** (`.glossary` with `<dl><dt><dd>`).

---

## Hard rules

- **Do not invent facts.** If unsure, simplify or omit. All factual claims must come
  from the existing pages or research files.
- **Do not delete technical content** — move it inside `<details class="deep-dive">`.
- **Do not modify existing CSS classes.** Add structure with the new pedagogy classes.
- **Define every jargon term** on first use. If a term needs more than one sentence
  to define, link to the glossary on `index.html`.
- **No emoji** unless the existing site already uses one in that exact spot.
