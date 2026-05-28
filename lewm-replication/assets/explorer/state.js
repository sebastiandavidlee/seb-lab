// state.js — shared state + pub/sub for the LeWorldModel embedding explorer.
//
// This file MUST be loaded before any view module (view_scatter, view_parcoords,
// view_treemap, view_thumbstrip, composer). It defines the global namespace
// `window.LewmExplorer` that all other modules attach to and subscribe through.
//
// Owner: T10-D
(function () {
  "use strict";

  const subscribers = [];
  const state = {
    data: null,            // parsed explorer_data.json
    selection: new Set(),  // Set<int> of point indices (i, 0..n_samples-1)
  };

  // Equality check that avoids triggering identical re-renders.
  function setsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  window.LewmExplorer = {
    // ---- data ---------------------------------------------------------------
    get data() { return state.data; },
    set data(v) { state.data = v; },

    // ---- selection ----------------------------------------------------------
    get selection() { return state.selection; },

    /**
     * Replace the current selection and notify all subscribers.
     * @param {Set<number>|Iterable<number>} newSet - new set of point indices
     * @param {string} sourceView - identifier of the view that triggered the
     *   change (e.g. "scatter", "parcoords", "treemap", "thumbstrip", "init").
     *   Subscribers can use this to skip re-rendering themselves (avoiding
     *   feedback loops) — but every subscriber is still called.
     */
    setSelection(newSet, sourceView) {
      const s = newSet instanceof Set ? newSet : new Set(newSet || []);
      if (setsEqual(s, state.selection)) return;
      state.selection = s;
      for (const fn of subscribers) {
        try { fn(s, sourceView || null); }
        catch (e) { console.error("[LewmExplorer subscriber threw]", e); }
      }
    },

    /**
     * Subscribe to selection changes. Returns an unsubscribe function.
     * Subscriber signature: (selection: Set<number>, sourceView: string|null) => void
     */
    subscribe(fn) {
      subscribers.push(fn);
      return () => {
        const i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
      };
    },

    // ---- sprite helper ------------------------------------------------------
    /**
     * Build a CSS style string that slices thumbnail `i` out of the sprite
     * sheet and scales it to `displaySize` x `displaySize` pixels.
     * The sprite is laid out row-major: row = floor(i/cols), col = i%cols.
     */
    spriteStyle(i, displaySize) {
      const m = state.data;
      if (!m) return "";
      const cols = m.sprite_cols, rows = m.sprite_rows;
      const r = Math.floor(i / cols), c = i % cols;
      return (
        "background-image: url('" + m.sprite_url + "'); " +
        "background-position: -" + (c * displaySize) + "px -" + (r * displaySize) + "px; " +
        "background-size: " + (cols * displaySize) + "px " + (rows * displaySize) + "px; " +
        "background-repeat: no-repeat; " +
        "image-rendering: auto; " +
        "width: " + displaySize + "px; height: " + displaySize + "px;"
      );
    },

    // ---- render-fn slots ----------------------------------------------------
    // Populated by individual view modules when they load. The composer
    // (T10-E) calls these once data is ready.
    renderScatter: null,
    renderParcoords: null,
    renderTreemap: null,
    renderThumbstrip: null,
  };
})();
