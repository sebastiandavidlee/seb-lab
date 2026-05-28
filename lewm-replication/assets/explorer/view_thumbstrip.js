// view_thumbstrip.js — horizontal strip of thumbnails showing the current
// selection. Subscribes to LewmExplorer selection changes. Reads sprite via
// LewmExplorer.spriteStyle().
//
// Requires state.js to be loaded first.
// Owner: T10-D
(function () {
  "use strict";

  if (!window.LewmExplorer) {
    console.error("[view_thumbstrip] LewmExplorer not loaded — state.js must come first");
    return;
  }

  const MAX_TILES = 24;     // tiles shown per page
  const TILE_PX = 64;       // display size (native sprite cell is 48px)

  // Inject minimal CSS once. Composer's stylesheet may override.
  function injectStyles() {
    if (document.getElementById("lewm-thumbstrip-css")) return;
    const css = `
      .lewm-thumbstrip { font: 13px/1.4 system-ui, sans-serif; color: var(--explore-fg, #e8e8ec); }
      .lewm-thumbstrip-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 8px; gap: 12px;
      }
      .lewm-thumbstrip-count { font-weight: 600; font-size: 14px; color: var(--explore-accent, #56c2e6); }
      .lewm-thumbstrip-count .muted { font-weight: 400; color: var(--explore-fg-muted, #9097a3); margin-left: 6px; }
      .lewm-thumbstrip-resample {
        font: inherit; padding: 4px 10px; border: 1px solid var(--explore-rule-2, rgba(255,255,255,0.10));
        background: var(--explore-bg-elev2, #1a1d23); color: var(--explore-fg, #e8e8ec);
        border-radius: 4px; cursor: pointer;
      }
      .lewm-thumbstrip-resample:hover { border-color: var(--explore-accent, #56c2e6); }
      .lewm-thumbstrip-resample[disabled] { opacity: 0.4; cursor: default; }
      .lewm-thumbstrip-track {
        display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden;
        padding: 4px 2px 10px; scrollbar-width: thin;
        min-height: ${TILE_PX + 14}px;
      }
      .lewm-thumb {
        flex: 0 0 auto; border: 1px solid var(--explore-rule-2, rgba(255,255,255,0.10)); border-radius: 3px;
        background-color: var(--explore-bg-sunk, #08090b); cursor: default; position: relative;
        image-rendering: pixelated;
      }
      .lewm-thumb:hover {
        border-color: var(--explore-accent, #56c2e6);
        box-shadow: 0 0 0 1px var(--explore-accent, #56c2e6), 0 0 14px var(--explore-accent-glow, rgba(86,194,230,0.32));
      }
      .lewm-thumbstrip-empty {
        color: var(--explore-fg-muted, #9097a3); font-style: italic; padding: 24px 8px;
        text-align: center; border: 1px dashed var(--explore-rule-2, rgba(255,255,255,0.10)); border-radius: 4px;
      }
    `;
    const style = document.createElement("style");
    style.id = "lewm-thumbstrip-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /**
   * Render a thumbnail strip into the given container.
   * @param {string|Element} containerSelector - CSS selector or element
   * @param {object} [options]
   * @param {number} [options.maxTiles=24] - thumbs per page
   * @param {number} [options.tileSize=64] - display size in px
   */
  window.LewmExplorer.renderThumbstrip = function (containerSelector, options) {
    injectStyles();
    options = options || {};
    const maxTiles = options.maxTiles || MAX_TILES;
    const tileSize = options.tileSize || TILE_PX;

    const root = typeof containerSelector === "string"
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!root) {
      console.error("[view_thumbstrip] container not found:", containerSelector);
      return;
    }

    // Build skeleton.
    root.innerHTML = "";
    root.classList.add("lewm-thumbstrip");
    const header = document.createElement("div");
    header.className = "lewm-thumbstrip-header";
    const count = document.createElement("div");
    count.className = "lewm-thumbstrip-count";
    const resampleBtn = document.createElement("button");
    resampleBtn.type = "button";
    resampleBtn.className = "lewm-thumbstrip-resample";
    resampleBtn.textContent = "Show another sample";
    header.appendChild(count);
    header.appendChild(resampleBtn);
    const track = document.createElement("div");
    track.className = "lewm-thumbstrip-track";
    root.appendChild(header);
    root.appendChild(track);

    // Pagination cursor over the (sorted) selection list. Sampling policy:
    // DETERMINISTIC, first-N by ascending point index. "Show another sample"
    // advances the start offset by `maxTiles` and wraps. This is reproducible
    // across reloads (no RNG) and easy for readers to reason about.
    let pageOffset = 0;
    let cachedSorted = []; // sorted Array<int> of current selection

    function fmtPoint(i) {
      const data = window.LewmExplorer.data;
      if (!data || !data.points || !data.points[i]) return "i=" + i;
      const p = data.points[i];
      const ep = (p.ep !== undefined) ? p.ep : "?";
      const step = (p.step !== undefined) ? p.step : "?";
      const c0 = (p.c0 !== undefined) ? p.c0 : "?";
      const c1 = (p.c1 !== undefined) ? p.c1 : "?";
      const c2 = (p.c2 !== undefined) ? p.c2 : "?";
      return "ep=" + ep + " step=" + step + "\nc0/c1/c2 = " + c0 + " / " + c1 + " / " + c2;
    }

    function render() {
      const selection = window.LewmExplorer.selection;
      const n = selection ? selection.size : 0;
      track.innerHTML = "";

      if (n === 0) {
        count.innerHTML = "<span>0 selected</span>";
        resampleBtn.disabled = true;
        const empty = document.createElement("div");
        empty.className = "lewm-thumbstrip-empty";
        empty.textContent = "Brush any chart above to see samples here";
        track.appendChild(empty);
        return;
      }

      // Refresh sorted list if selection size changed since last render.
      // (Cheap heuristic — full re-sort is fine at our scales: n_samples=1500.)
      cachedSorted = Array.from(selection).sort(function (a, b) { return a - b; });
      if (pageOffset >= cachedSorted.length) pageOffset = 0;

      const shown = Math.min(maxTiles, cachedSorted.length);
      const hasMore = cachedSorted.length > maxTiles;
      resampleBtn.disabled = !hasMore;

      const end = Math.min(pageOffset + maxTiles, cachedSorted.length);
      const slice = cachedSorted.slice(pageOffset, end);
      // If we ran off the end and slice is short, pad-wrap from start.
      if (slice.length < shown) {
        slice.push.apply(slice, cachedSorted.slice(0, shown - slice.length));
      }

      const countLabel = n + " selected";
      const rangeLabel = hasMore
        ? " <span class='muted'>showing " + (pageOffset + 1) + "&ndash;" +
          (pageOffset + slice.length) + "</span>"
        : "";
      count.innerHTML = "<span>" + countLabel + "</span>" + rangeLabel;

      const frag = document.createDocumentFragment();
      for (const idx of slice) {
        const tile = document.createElement("div");
        tile.className = "lewm-thumb";
        tile.setAttribute("style", window.LewmExplorer.spriteStyle(idx, tileSize));
        tile.title = fmtPoint(idx);
        tile.dataset.i = String(idx);
        frag.appendChild(tile);
      }
      track.appendChild(frag);
    }

    resampleBtn.addEventListener("click", function () {
      if (cachedSorted.length <= maxTiles) return;
      pageOffset = (pageOffset + maxTiles) % cachedSorted.length;
      render();
    });

    // Reset paging when the selection identity changes (any source).
    window.LewmExplorer.subscribe(function (_sel, _source) {
      pageOffset = 0;
      render();
    });

    // Initial paint (handles the case where data/selection are already set).
    render();
  };
})();
