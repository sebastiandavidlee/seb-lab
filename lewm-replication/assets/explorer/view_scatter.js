/*
 * view_scatter.js  —  Agent T10-A
 *
 * UMAP 2D scatter view for the LeWorldModel embedding explorer.
 * Renders points from window.LewmExplorer.data, supports rectangular
 * brush selection (d3.brush), participates in the shared selection
 * channel owned by T10-D (window.LewmExplorer.{selection,setSelection,subscribe}).
 *
 * Public entry point:
 *   window.LewmExplorer.renderScatter(containerSelector, options)
 */
(function () {
  "use strict";

  if (typeof d3 === "undefined") {
    console.error("[view_scatter] d3 is not loaded");
    return;
  }
  if (!window.LewmExplorer) {
    console.error("[view_scatter] LewmExplorer shared state is missing (T10-D not loaded?)");
    return;
  }

  // ---- Color helpers -------------------------------------------------------

  // Categorical channels are integers, with -1 == "noise / no cluster".
  var CATEGORICAL = { c0: true, c1: true, c2: true };
  // Continuous channels (numeric, viridis ramp).
  var CONTINUOUS = { block_x: true, block_y: true, theta: true };

  // Dark-palette cluster colors, matching styles.css --c-0..9 / --c-noise.
  var DARK_PALETTE = [
    "#6aa9ff", "#ffb155", "#ff7373", "#66d4cf", "#a78bfa",
    "#7bd88f", "#f48fb1", "#d9c45a", "#b89a86", "#c7c1bb",
  ];
  var NOISE_COLOR = "#4a4f59"; // muted grey for c* == -1 (matches --c-noise)

  function makeColorFn(channel, points) {
    if (CATEGORICAL[channel]) {
      var palette = DARK_PALETTE.slice();
      // Build a stable mapping from cluster id -> color (excluding -1).
      var ids = Array.from(new Set(points.map(function (p) { return p[channel]; })))
        .filter(function (v) { return v >= 0; })
        .sort(function (a, b) { return a - b; });
      var scale = d3.scaleOrdinal().domain(ids).range(palette);
      return function (p) {
        var v = p[channel];
        return (v == null || v < 0) ? NOISE_COLOR : scale(v);
      };
    }
    // Continuous: build extent and use viridis.
    var ext = d3.extent(points, function (p) { return p[channel]; });
    if (ext[0] == null) return function () { return NOISE_COLOR; };
    if (ext[0] === ext[1]) ext[1] = ext[0] + 1; // avoid degenerate scale
    var s = d3.scaleSequential(d3.interpolateViridis).domain(ext);
    return function (p) {
      var v = p[channel];
      return (v == null || isNaN(v)) ? NOISE_COLOR : s(v);
    };
  }

  // ---- Main entry ----------------------------------------------------------

  window.LewmExplorer.renderScatter = function renderScatter(containerSelector, options) {
    options = options || {};
    var data = window.LewmExplorer.data;
    if (!data || !data.points) {
      console.error("[view_scatter] LewmExplorer.data.points missing");
      return;
    }
    var points = data.points;

    var root = d3.select(containerSelector);
    if (root.empty()) {
      console.error("[view_scatter] container not found:", containerSelector);
      return;
    }
    root.html(""); // wipe previous render

    // ---- Layout / dimensions ----------------------------------------------
    var node = root.node();
    var rect = node.getBoundingClientRect();
    var width = options.width || Math.max(300, Math.floor(rect.width) || 640);
    var height = options.height || Math.max(300, Math.floor(rect.height) || 520);
    var margin = { top: 44, right: 16, bottom: 28, left: 36 };
    var innerW = width - margin.left - margin.right;
    var innerH = height - margin.top - margin.bottom;

    // ---- Header (title + color-by dropdown) -------------------------------
    var header = root.append("div")
      .attr("class", "lewm-scatter-header")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between")
      .style("gap", "12px")
      .style("margin-bottom", "6px")
      .style("font-family", "system-ui, sans-serif")
      .style("font-size", "13px");

    header.append("div")
      .attr("class", "lewm-scatter-title")
      .style("font-weight", "600")
      .text("UMAP projection of 192-d latents (drag to select)");

    var controls = header.append("div")
      .attr("class", "lewm-scatter-controls")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "6px");

    controls.append("label")
      .attr("for", "lewm-scatter-colorby")
      .style("color", "#555")
      .text("Color by:");

    var select = controls.append("select")
      .attr("id", "lewm-scatter-colorby")
      .style("font", "inherit")
      .style("padding", "2px 4px");

    var colorOptions = ["c2", "c0", "c1", "block_x", "block_y", "theta"];
    select.selectAll("option")
      .data(colorOptions)
      .enter().append("option")
      .attr("value", function (d) { return d; })
      .text(function (d) { return d; });
    var currentChannel = options.colorBy || "c2";
    select.property("value", currentChannel);

    // ---- SVG ---------------------------------------------------------------
    var svg = root.append("svg")
      .attr("class", "lewm-scatter-svg")
      .attr("width", width)
      .attr("height", height)
      .style("display", "block")
      .style("background", "var(--explore-bg-sunk, #08090b)")
      .style("border", "1px solid var(--explore-rule, rgba(255,255,255,0.10))")
      .style("border-radius", "4px");

    var g = svg.append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Scales over UMAP coords.
    var xExt = d3.extent(points, function (p) { return p.umap_x; });
    var yExt = d3.extent(points, function (p) { return p.umap_y; });
    // Small padding so points on the edge are not clipped.
    var xPad = (xExt[1] - xExt[0]) * 0.03 || 1;
    var yPad = (yExt[1] - yExt[0]) * 0.03 || 1;
    var x = d3.scaleLinear()
      .domain([xExt[0] - xPad, xExt[1] + xPad])
      .range([0, innerW]);
    var y = d3.scaleLinear()
      .domain([yExt[0] - yPad, yExt[1] + yPad])
      .range([innerH, 0]); // invert so larger umap_y is up

    // Light axes (just for orientation; minimal styling).
    var xAxis = d3.axisBottom(x).ticks(5).tickSize(-innerH);
    var yAxis = d3.axisLeft(y).ticks(5).tickSize(-innerW);
    var xAxisG = g.append("g")
      .attr("class", "lewm-axis lewm-axis-x")
      .attr("transform", "translate(0," + innerH + ")")
      .call(xAxis);
    var yAxisG = g.append("g")
      .attr("class", "lewm-axis lewm-axis-y")
      .call(yAxis);
    g.selectAll(".lewm-axis line")
      .style("stroke", "rgba(255,255,255,0.06)")
      .style("shape-rendering", "crispEdges");
    g.selectAll(".lewm-axis path")
      .style("stroke", "rgba(255,255,255,0.12)");
    g.selectAll(".lewm-axis text")
      .style("fill", "var(--explore-fg-muted, #9097a3)")
      .style("font-size", "10px");

    // ---- Tooltip -----------------------------------------------------------
    var tooltip = root.append("div")
      .attr("class", "lewm-scatter-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "rgba(20,20,20,0.88)")
      .style("color", "#fff")
      .style("padding", "4px 7px")
      .style("border-radius", "3px")
      .style("font", "11px/1.3 system-ui, sans-serif")
      .style("white-space", "nowrap")
      .style("opacity", 0)
      .style("transition", "opacity 80ms")
      .style("z-index", 10);
    // Ensure container is a positioning context.
    if (getComputedStyle(node).position === "static") {
      root.style("position", "relative");
    }

    // ---- Points ------------------------------------------------------------
    // We draw circles; for 1500 points this is fine. If n grows large we'd
    // switch to canvas — see notes for T10-E.
    var DEFAULT_R = 3;
    var SELECTED_R = 5;
    var DEFAULT_OPACITY = 0.75;
    var DIM_OPACITY = 0.12;

    var colorFn = makeColorFn(currentChannel, points);

    // Brush layer goes UNDER the points so circles remain hoverable.
    var brushG = g.append("g").attr("class", "lewm-scatter-brush");

    var pointsG = g.append("g").attr("class", "lewm-scatter-points");
    var circles = pointsG.selectAll("circle")
      .data(points, function (p) { return p.i; })
      .enter().append("circle")
      .attr("cx", function (p) { return x(p.umap_x); })
      .attr("cy", function (p) { return y(p.umap_y); })
      .attr("r", DEFAULT_R)
      .attr("fill", colorFn)
      .attr("stroke", "rgba(0,0,0,0.45)")
      .attr("stroke-width", 0.4)
      .attr("opacity", DEFAULT_OPACITY)
      .style("cursor", "pointer");

    circles
      .on("mouseover", function (event, p) {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1);
        tooltip
          .html(
            "i: <b>" + p.i + "</b> &middot; ep " + p.ep + " step " + p.step +
            "<br>c0/c1/c2: " + p.c0 + " / " + p.c1 + " / " + p.c2
          )
          .style("opacity", 1);
      })
      .on("mousemove", function (event) {
        // Position tooltip relative to the container.
        var crect = node.getBoundingClientRect();
        var px = event.clientX - crect.left + 10;
        var py = event.clientY - crect.top + 10;
        tooltip.style("left", px + "px").style("top", py + "px");
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "rgba(0,0,0,0.45)").attr("stroke-width", 0.4);
        tooltip.style("opacity", 0);
      });

    // ---- Selection rendering ----------------------------------------------
    function applySelection(selection) {
      if (!selection || selection.size === 0) {
        circles
          .attr("r", DEFAULT_R)
          .attr("opacity", DEFAULT_OPACITY);
        return;
      }
      circles
        .attr("r", function (p) { return selection.has(p.i) ? SELECTED_R : DEFAULT_R; })
        .attr("opacity", function (p) { return selection.has(p.i) ? 1 : DIM_OPACITY; });
    }

    // ---- Brush -------------------------------------------------------------
    // Use d3.brush (rectangular). On end, compute hit set in *data* space
    // and broadcast through the shared state.
    var brush = d3.brush()
      .extent([[0, 0], [innerW, innerH]])
      .on("end", function (event) {
        var sel = event.selection;
        if (!sel) {
          // Empty brush => clear shared selection (only if non-empty).
          if (window.LewmExplorer.selection && window.LewmExplorer.selection.size > 0) {
            window.LewmExplorer.setSelection(new Set(), "scatter");
          } else {
            applySelection(new Set());
          }
          return;
        }
        var x0 = sel[0][0], y0 = sel[0][1], x1 = sel[1][0], y1 = sel[1][1];
        // Invert pixel bounds to data space (note y is inverted).
        var dx0 = x.invert(x0), dx1 = x.invert(x1);
        var dy1 = y.invert(y0), dy0 = y.invert(y1);
        var hit = new Set();
        for (var k = 0; k < points.length; k++) {
          var p = points[k];
          if (p.umap_x >= dx0 && p.umap_x <= dx1 &&
              p.umap_y >= dy0 && p.umap_y <= dy1) {
            hit.add(p.i);
          }
        }
        window.LewmExplorer.setSelection(hit, "scatter");
      });

    brushG.call(brush);
    // Style the brush rectangle.
    brushG.selectAll(".selection")
      .attr("fill", "var(--explore-accent, #56c2e6)")
      .attr("fill-opacity", 0.12)
      .attr("stroke", "var(--explore-accent, #56c2e6)")
      .attr("stroke-width", 1)
      .attr("shape-rendering", "crispEdges");
    brushG.selectAll(".handle")
      .attr("fill", "var(--explore-accent, #56c2e6)")
      .attr("fill-opacity", 0.35);

    // ---- Color-by dropdown wiring -----------------------------------------
    select.on("change", function () {
      currentChannel = this.value;
      colorFn = makeColorFn(currentChannel, points);
      circles.attr("fill", colorFn);
    });

    // ---- Subscribe to shared selection ------------------------------------
    // Re-apply highlight when OTHER views change selection. The shared
    // setter is expected to skip the sourceView, but we also guard here.
    function onSelectionChange(selection, sourceView) {
      if (sourceView === "scatter") return; // ours; brush already updated visuals via applySelection below
      applySelection(selection);
    }
    window.LewmExplorer.subscribe(onSelectionChange);

    // Also reflect selection changes that originated here, after setSelection
    // has resolved (so applySelection runs once and we stay in sync if the
    // shared state mutated the set, e.g. clamping).
    var originalSet = window.LewmExplorer.setSelection;
    // Don't monkey-patch; instead, re-apply on next tick using the now-current
    // shared selection. We do this by hooking into subscribe with a wrapper
    // that ALSO catches our own emissions for local visual sync.
    window.LewmExplorer.subscribe(function (selection, sourceView) {
      if (sourceView === "scatter") applySelection(selection);
    });

    // Initial paint reflecting any pre-existing selection.
    applySelection(window.LewmExplorer.selection || new Set());

    // ---- Return a tiny handle in case the composer wants it ---------------
    return {
      redraw: function () { applySelection(window.LewmExplorer.selection || new Set()); },
      setColorBy: function (ch) {
        if (colorOptions.indexOf(ch) === -1) return;
        currentChannel = ch;
        select.property("value", ch);
        colorFn = makeColorFn(currentChannel, points);
        circles.attr("fill", colorFn);
      }
    };
  };
})();
