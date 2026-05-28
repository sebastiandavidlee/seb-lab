// view_parcoords.js — T10-B
// Parallel coordinates view for the LeWorldModel embedding explorer.
//
// Axes (left -> right): pc1, pc2, pc3, pc4, c2 (coarse), c1 (mid), c0 (fine).
// Cluster axes are jittered (id + (rand-0.5)) so the discrete IDs spread into
// a band, per the Marimo evoc-fashion trick. Lines are drawn on <canvas> for
// performance; brushes are SVG overlays on top.
//
// Contract with window.LewmExplorer:
//   LewmExplorer.data            -> the loaded explorer_data.json
//   LewmExplorer.setSelection(s,src)
//   LewmExplorer.subscribe(cb)   -> cb(selectionSet, source)
//   LewmExplorer.selection       -> current Set<int> of point indices (or null = all)

(function () {
  "use strict";

  const TABLEAU10 = [
    "#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f",
    "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
  ];

  // Seeded PRNG so jitter is stable across renders / brush updates.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ensureNS() {
    if (!window.LewmExplorer) window.LewmExplorer = {};
    return window.LewmExplorer;
  }

  function getData(ns) {
    return ns.data || ns.explorerData || null;
  }

  function renderParcoords(containerSelector, options) {
    const ns = ensureNS();
    const opts = options || {};
    const width = opts.width || 700;
    const height = opts.height || 400;

    const data = getData(ns);
    const container = (typeof d3 !== "undefined")
      ? d3.select(containerSelector)
      : null;
    if (!container || container.empty()) {
      console.error("[parcoords] container not found:", containerSelector);
      return;
    }
    if (!data || !Array.isArray(data.points)) {
      container.html('<div style="color:#a33;padding:1em;">parcoords: no data loaded</div>');
      return;
    }

    const points = data.points;
    const n = points.length;

    // ---- Axis spec ----
    const AXES = [
      { key: "pc1", label: "PC1",          kind: "num" },
      { key: "pc2", label: "PC2",          kind: "num" },
      { key: "pc3", label: "PC3",          kind: "num" },
      { key: "pc4", label: "PC4",          kind: "num" },
      { key: "c2",  label: "coarse cluster", kind: "cat" },
      { key: "c1",  label: "mid cluster",    kind: "cat" },
      { key: "c0",  label: "fine cluster",   kind: "cat" },
    ];

    // ---- Pre-compute values per axis (with jitter on cluster axes) ----
    const rng = mulberry32((data.seed || 0) ^ 0xa11ce);
    // values[axisIdx] is a Float32Array of length n
    const values = AXES.map(ax => {
      const arr = new Float32Array(n);
      if (ax.kind === "num") {
        for (let i = 0; i < n; i++) arr[i] = +points[i][ax.key];
      } else {
        for (let i = 0; i < n; i++) {
          const cid = +points[i][ax.key];
          arr[i] = cid + (rng() - 0.5);
        }
      }
      return arr;
    });

    // Per-axis [min, max] domain (uses jittered values for cluster axes so
    // brushes line up with what's drawn).
    const domains = AXES.map((ax, i) => {
      const v = values[i];
      let mn = +Infinity, mx = -Infinity;
      for (let j = 0; j < n; j++) {
        const x = v[j];
        if (x < mn) mn = x;
        if (x > mx) mx = x;
      }
      if (mn === mx) { mn -= 0.5; mx += 0.5; }
      return [mn, mx];
    });

    // ---- Color scale: by c2 ----
    const c2Vals = points.map(p => +p.c2);
    const c2Uniq = Array.from(new Set(c2Vals)).sort((a, b) => a - b);
    const colorScale = (function () {
      const map = new Map();
      c2Uniq.forEach((v, idx) => {
        if (v < 0) map.set(v, "#bbbbbb"); // noise / unassigned
        else map.set(v, TABLEAU10[idx % TABLEAU10.length]);
      });
      return c => map.get(c) || "#888";
    })();
    const colorRGB = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const col = d3.color(colorScale(+points[i].c2));
      colorRGB[i * 3]     = col.r;
      colorRGB[i * 3 + 1] = col.g;
      colorRGB[i * 3 + 2] = col.b;
    }

    // ---- Layout ----
    const margin = { top: 56, right: 24, bottom: 28, left: 24 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const xScale = d3.scalePoint()
      .domain(AXES.map((_, i) => i))
      .range([0, innerW])
      .padding(0.5);

    const yScales = AXES.map((ax, i) =>
      d3.scaleLinear().domain(domains[i]).range([innerH, 0])
    );

    // ---- Build DOM ----
    container.selectAll("*").remove();
    const root = container.append("div")
      .attr("class", "lewm-parcoords")
      .style("position", "relative")
      .style("width", width + "px")
      .style("font", "12px system-ui, sans-serif");

    // Header
    const header = root.append("div")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("align-items", "center")
      .style("margin-bottom", "4px");

    header.append("div")
      .style("font-weight", "600")
      .text("Parallel coordinates — drag brushes on any axis to filter");

    const clearBtn = header.append("button")
      .attr("type", "button")
      .style("font", "11px system-ui, sans-serif")
      .style("padding", "2px 8px")
      .style("cursor", "pointer")
      .text("Clear all brushes");

    // Stage
    const stage = root.append("div")
      .style("position", "relative")
      .style("width", width + "px")
      .style("height", height + "px");

    // Pixel ratio aware canvas
    const dpr = window.devicePixelRatio || 1;
    const canvas = stage.append("canvas")
      .attr("width", innerW * dpr)
      .attr("height", innerH * dpr)
      .style("position", "absolute")
      .style("left", margin.left + "px")
      .style("top", margin.top + "px")
      .style("width", innerW + "px")
      .style("height", innerH + "px")
      .node();
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // SVG overlay (axes + brushes)
    const svg = stage.append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("position", "absolute")
      .style("left", "0")
      .style("top", "0")
      .style("pointer-events", "none"); // brushes re-enable

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // ---- Brush state ----
    // brushExtents[axisIdx] = [yLo, yHi] in DATA units, or null
    const brushExtents = AXES.map(() => null);

    function passesBrushes(i) {
      for (let a = 0; a < AXES.length; a++) {
        const ext = brushExtents[a];
        if (!ext) continue;
        const v = values[a][i];
        if (v < ext[0] || v > ext[1]) return false;
      }
      return true;
    }

    // External selection (from other views) overrides line highlighting,
    // but does NOT round-trip into our brushes.
    let externalSelection = ns.selection instanceof Set ? ns.selection : null;

    function activeIndexSet() {
      // Returns Set<int> of indices passing brushes (independent of external).
      const s = new Set();
      const anyBrush = brushExtents.some(b => b !== null);
      if (!anyBrush) {
        for (let i = 0; i < n; i++) s.add(i);
        return s;
      }
      for (let i = 0; i < n; i++) if (passesBrushes(i)) s.add(i);
      return s;
    }

    function highlightedIndexSet() {
      // What to draw at full opacity. Intersection of (our brushes) and
      // (external selection if any).
      const ours = activeIndexSet();
      if (!externalSelection) return ours;
      const out = new Set();
      ours.forEach(i => { if (externalSelection.has(i)) out.add(i); });
      return out;
    }

    // ---- Canvas line drawing ----
    // Pre-compute pixel x for each axis (in inner-canvas coords).
    function axisX(i) { return xScale(i); }

    function draw() {
      const highlighted = highlightedIndexSet();
      const anyFilter = (highlighted.size !== n);

      ctx.clearRect(0, 0, innerW, innerH);
      ctx.lineWidth = 1;

      // Pass 1: dim/background lines (everything not highlighted).
      if (anyFilter) {
        ctx.globalAlpha = 0.04;
        for (let i = 0; i < n; i++) {
          if (highlighted.has(i)) continue;
          drawOne(i);
        }
      }

      // Pass 2: highlighted lines on top.
      ctx.globalAlpha = anyFilter ? 1.0 : 0.08;
      for (let i = 0; i < n; i++) {
        if (anyFilter && !highlighted.has(i)) continue;
        drawOne(i);
      }
      ctx.globalAlpha = 1;
    }

    function drawOne(i) {
      const r = colorRGB[i * 3];
      const gC = colorRGB[i * 3 + 1];
      const b = colorRGB[i * 3 + 2];
      ctx.strokeStyle = `rgb(${r},${gC},${b})`;
      ctx.beginPath();
      for (let a = 0; a < AXES.length; a++) {
        const x = axisX(a);
        const y = yScales[a](values[a][i]);
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- Axis rendering ----
    const axisGroups = g.selectAll("g.axis")
      .data(AXES)
      .enter().append("g")
      .attr("class", "axis")
      .attr("transform", (_, i) => `translate(${axisX(i)},0)`)
      .style("pointer-events", "all");

    axisGroups.each(function (ax, i) {
      const grp = d3.select(this);
      const yAxis = d3.axisLeft(yScales[i]).ticks(5);
      if (ax.kind === "cat") {
        // For cluster axes, tick at integer cluster IDs only.
        const lo = Math.ceil(domains[i][0]);
        const hi = Math.floor(domains[i][1]);
        const tickVals = [];
        for (let v = lo; v <= hi; v++) tickVals.push(v);
        // Cap to ~8 to avoid clutter.
        if (tickVals.length > 8) {
          const step = Math.ceil(tickVals.length / 8);
          yAxis.tickValues(tickVals.filter((_, k) => k % step === 0));
        } else {
          yAxis.tickValues(tickVals);
        }
        yAxis.tickFormat(d3.format("d"));
      }
      grp.append("g").attr("class", "axis-ticks").call(yAxis);

      // Axis label (click to clear this axis brush)
      grp.append("text")
        .attr("class", "axis-label")
        .attr("y", -28)
        .attr("text-anchor", "middle")
        .attr("fill", "#222")
        .style("font", "11px system-ui, sans-serif")
        .style("cursor", "pointer")
        .text(ax.label)
        .on("click", () => clearAxisBrush(i));

      grp.append("text")
        .attr("class", "axis-sublabel")
        .attr("y", -14)
        .attr("text-anchor", "middle")
        .attr("fill", "#888")
        .style("font", "10px system-ui, sans-serif")
        .text(ax.key);
    });

    // ---- Brushes ----
    // We attach one vertical d3.brushY per axis.
    const brushes = AXES.map((ax, i) => {
      const brush = d3.brushY()
        .extent([[-10, 0], [10, innerH]])
        .on("brush end", function (event) {
          const sel = event.selection;
          if (!sel) {
            brushExtents[i] = null;
          } else {
            const [y0, y1] = sel;
            // y0 is top (smaller pixel) -> larger data value
            const v0 = yScales[i].invert(y1);
            const v1 = yScales[i].invert(y0);
            brushExtents[i] = [v0, v1];
          }
          onBrushChanged();
        });
      const brushG = g.append("g")
        .attr("class", "brush")
        .attr("transform", `translate(${axisX(i)},0)`)
        .style("pointer-events", "all");
      brushG.call(brush);
      return { brush, brushG };
    });

    function clearAxisBrush(i) {
      brushExtents[i] = null;
      brushes[i].brushG.call(brushes[i].brush.move, null);
      // brush 'end' event will fire onBrushChanged via the listener
    }

    function clearAllBrushes() {
      for (let i = 0; i < AXES.length; i++) {
        brushExtents[i] = null;
        brushes[i].brushG.call(brushes[i].brush.move, null);
      }
    }

    clearBtn.on("click", clearAllBrushes);

    function onBrushChanged() {
      // Publish selection to shared state. If no brushes are active, publish
      // null (= "no filter from parcoords") so other views aren't constrained.
      const anyBrush = brushExtents.some(b => b !== null);
      const sel = anyBrush ? activeIndexSet() : null;
      if (ns.setSelection) {
        try { ns.setSelection(sel, "parcoords"); }
        catch (e) { console.warn("[parcoords] setSelection failed:", e); }
      }
      draw();
    }

    // ---- Subscribe to external selection changes ----
    if (typeof ns.subscribe === "function") {
      ns.subscribe(function (selection, source) {
        if (source === "parcoords") return; // ignore our own echo
        externalSelection = (selection instanceof Set) ? selection : null;
        draw(); // re-highlight only; do NOT touch brushes
      });
    }

    // Initial paint
    draw();

    return {
      redraw: draw,
      clearAllBrushes,
    };
  }

  const ns = ensureNS();
  ns.renderParcoords = renderParcoords;
})();
