# Shared scaffold — page-builder guide

This folder is a self-contained scaffold for the 9-page LeRobot Study site. Page-builder agents read this once, then write pages without having to re-derive conventions.

## Where to write your page

**Final page lives at the lerobot-study root, NOT under `pages/`.**

```
/home/seb/projects/lab/builds/lerobot-study/<your-page>.html
```

so that nav links like `<a href="anatomy.html">` resolve correctly. The empty `pages/` directory was a placeholder and can be removed at the end of the scaffold. **Do not write into `pages/`.**

The 9 pages are:

| File | Topic |
|---|---|
| `index.html`     | Overview / how to read this study |
| `anatomy.html`   | `src/lerobot/*` module map, factories, configs |
| `teleop.html`    | Robots, teleoperators, leader arms |
| `training.html`  | Training pipeline, optim, processors |
| `data.html`      | LeRobotDataset v3.0, episodes, parquet/video |
| `inference.html` | `policy_server`, `robot_client`, action chunking |
| `rl-on-top.html` | HIL-SERL, the &pi;0.6 question, RL on top of IL |
| `ecosystem.html` | GR00T, V-JEPA, UMI, world models |
| `changelog.html` | 0.4.4 &rarr; 0.5.0 changelog & migration |

Each page is **one self-contained HTML file**. Inline all your content. Do not create sub-fragments, partials, or extra CSS/JS files. The only shared assets are `shared/styles.css`, `shared/site.js`, and `shared/nav.html`.

## How to use the page template

1. Copy `shared/page-template.html` to `<page>.html` at the lerobot-study root.
2. Replace placeholders:
   - `{{TITLE}}` &rarr; the page's H1 (e.g. `"Anatomy &amp; module map"`).
   - `{{PREV}}` and `{{NEXT}}` &rarr; the prev/next page filename in reading order. For `index.html`, set `{{PREV}}` to `#` and label it `"start"`. For `changelog.html`, set `{{NEXT}}` to `#` and label it `"end"`.
   - `{{CONTENT}}` &rarr; your inline HTML body.
   - `{{BUILD_DATE}}` &rarr; today's date in the footer.
3. Do not modify the `<header>`, `<aside id="site-nav">`, `<footer>`, or `#to-top` button — those are filled by `site.js` and shared CSS.

The reading order across the 9 pages is: index &rarr; anatomy &rarr; teleop &rarr; training &rarr; data &rarr; inference &rarr; rl-on-top &rarr; ecosystem &rarr; changelog.

## Available CSS classes

| Class | Use |
|---|---|
| `.compare-cols` | flex container for side-by-side v0.4.4 / v0.5.0 blocks |
| `.col-v044`     | left column, blue left-border, blue tint |
| `.col-v050`     | right column, green left-border, green tint |
| `.col-tag`      | small uppercase tag inside a column ("v0.4.4" / "v0.5.0") |
| `.callout-warn` | amber callout (gotchas, silent breakages) |
| `.callout-new`  | green callout (new in v0.5.0) |
| `.callout-removed` | red callout (removed / deprecated) |
| `.callout-info` | blue callout (clarifications, tips) |
| `.callout-title` | bold uppercase title row inside a callout |
| `.file-ref`     | inline `path/to/file.py:42` style marker |
| `.kbd`          | keyboard chip (e.g. <kbd>Ctrl</kbd>+<kbd>K</kbd>) |
| `.tabs` + `[data-tab]` triggers + `[data-tab-panel]` panels | tabbed code/config blocks |
| `details[data-spoiler]` | collapsible "Show file content" section |
| `.table-wrap`   | wrap any wide `<table>` to make it horizontally scrollable |
| `.page-content.wide` | use on `<article class="page-content">` for wide compare-heavy pages (changelog, anatomy); default is the 780px prose width |

## Snippets

### Side-by-side comparison block

```html
<div class="compare-cols">
  <div class="col-v044">
    <span class="col-tag">v0.4.4</span>
    <pre><code>requires-python = "&gt;=3.10"</code></pre>
    <p>Python 3.10 and 3.11 still supported.</p>
  </div>
  <div class="col-v050">
    <span class="col-tag">v0.5.0</span>
    <pre><code>requires-python = "&gt;=3.12"</code></pre>
    <p>3.10/3.11 envs will fail to install.</p>
  </div>
</div>
```

### Inline file reference

```html
<p>
  The cuDNN deterministic switch lives at
  <span class="file-ref">src/lerobot/scripts/lerobot_train.py:212-216</span>.
</p>
```

### Callout

```html
<div class="callout callout-warn">
  <div class="callout-title">Silent break</div>
  <p>pi0/pi05 image normalization changed from <code>[-1, 1]</code> to <code>[0, 1]</code>.
  Re-validate any locally fine-tuned weights.</p>
</div>
```

### Tabs

```html
<div class="tabs">
  <div class="tabs-bar">
    <button data-tab="cli">CLI</button>
    <button data-tab="py">Python</button>
  </div>
  <div class="tabs-panels">
    <div data-tab-panel="cli"><pre><code>lerobot-train ...</code></pre></div>
    <div data-tab-panel="py"><pre><code>from lerobot.scripts.lerobot_train import train</code></pre></div>
  </div>
</div>
```

### Spoiler / collapsible source dump

```html
<details data-spoiler>
  <summary>Show full <code>g1_kinematics.py</code> outline (287 lines)</summary>
  <pre><code>class WeightedMovingFilter:
    ...</code></pre>
</details>
```

### Keyboard chip

```html
Press <span class="kbd">Ctrl</span> + <span class="kbd">K</span> to jump.
```

## Data file

A small machine-readable companion lives at `data/comparison.json` — release dates, dependency bumps, file-add/remove lists, breaking changes. Use it as the single source of truth for anything you cite in the changelog or anatomy pages. If you want a programmatic table on a page, `fetch("data/comparison.json")` works because everything is co-located.

## Constraints

- **No external CDN, no build step, no framework.** Pure HTML/CSS/JS.
- All linked assets use **relative paths** (`shared/styles.css`, `shared/site.js`, `data/comparison.json`).
- **Inline everything page-specific** into your single HTML file. Do not split into partials.
- **Don't touch the research files** under `kb/research/lerobot_study_2026-05-06/` — read-only.
- **Don't add new shared CSS or JS.** If a class you need isn't here, write inline `<style>` only as a last resort and flag it.
