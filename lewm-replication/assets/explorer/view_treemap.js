/*
 * view_treemap.js — Agent T10-C
 *
 * Treemap view of the LeWorldModel embedding explorer.
 *
 * Builds a 3-level hierarchy from the cluster columns c2 (coarse) → c1 (mid) →
 * c0 (fine) on the fly from window.LewmExplorer.state.data.points. Cell area is
 * proportional to point count, and each cell is colored by its parent c2
 * branch (Tableau10).
 *
 * Hover sets selection (mode="hover"). Click drills in (zooms the subtree to
 * fill the canvas). Selection from other views causes cells containing any
 * selected indices to pulse-highlight.
 *
 * Contract surface used / assumed (shared with sibling T10 agents):
 *   window.LewmExplorer.state.data         -> the parsed explorer_data.json
 *   window.LewmExplorer.setSelection(idx, source)
 *   window.LewmExplorer.subscribe(fn)      -> fn({selection, source, ...})
 *
 * If subscribe / setSelection are missing we fall back to a no-op + a single
 * private observer registered on window.LewmExplorer._treemapSubs (so the
 * composer T10-E can wire things up later without breaking).
 */
(function () {
  "use strict";

  const NS = (window.LewmExplorer = window.LewmExplorer || {});

  // ---------------------------------------------------------------------------
  // Shared-state shims (forgiving — composer T10-E may override these)
  // ---------------------------------------------------------------------------
  function getData() {
    if (NS.state && NS.state.data) return NS.state.data;
    if (NS.data) return NS.data;
    return null;
  }

  function broadcastSelection(indices, source) {
    if (typeof NS.setSelection === "function") {
      NS.setSelection(indices, source);
    } else {
      NS.state = NS.state || {};
      NS.state.selection = indices;
      NS.state.selectionSource = source;
      const subs = NS._subs || [];
      subs.forEach((fn) => {
        try {
          fn({ selection: indices, source });
        } catch (e) {
          /* swallow */
        }
      });
    }
  }

  function subscribeSelection(fn) {
    if (typeof NS.subscribe === "function") return NS.subscribe(fn);
    NS._subs = NS._subs || [];
    NS._subs.push(fn);
    return () => {
      NS._subs = NS._subs.filter((g) => g !== fn);
    };
  }

  // ---------------------------------------------------------------------------
  // Hierarchy builder: c2 → c1 → c0  (noise c2 == -1 grouped under "noise")
  // ---------------------------------------------------------------------------
  // Design decision: noise points (c2 == -1) are NOT thrown away. They become a
  // single top-level "noise" branch with its own c1 / c0 buckets (which may
  // themselves be -1). That way the treemap still totals to len(points) and a
  // user can hover the noise pile to see what UMAP / HDBSCAN refused to label.
  function buildHierarchy(points) {
    const root = { key: "all", children: new Map(), indices: [] };

    const ensure = (parent, key) => {
      if (!parent.children.has(key)) {
        parent.children.set(key, {
          key,
          children: new Map(),
          indices: [],
        });
      }
      return parent.children.get(key);
    };

    for (let k = 0; k < points.length; k++) {
      const p = points[k];
      const c2 = p.c2;
      const c1 = p.c1;
      const c0 = p.c0;
      const topKey = c2 === -1 ? "noise" : `c2:${c2}`;
      const top = ensure(root, topKey);
      const mid = ensure(top, `c1:${c1}`);
      const leaf = ensure(mid, `c0:${c0}`);
      leaf.indices.push(p.i != null ? p.i : k);
      // We don't push indices into mid/top — d3.hierarchy().sum() will roll
      // them up via the leaf value. But we DO keep them on leaves so hover can
      // grab them O(1).
    }

    // Convert Map → array; attach a stable c2Key for coloring.
    function toArray(node, parentC2Key) {
      const obj = {
        key: node.key,
        c2Key: parentC2Key || node.key,
      };
      if (node.children.size > 0) {
        obj.children = [];
        node.children.forEach((child) => {
          obj.children.push(toArray(child, parentC2Key || node.key));
        });
      } else {
        obj.indices = node.indices;
        obj.value = node.indices.length;
      }
      return obj;
    }
    return toArray(root, null);
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  NS.renderTreemap = function renderTreemap(containerSelector, options) {
    options = options || {};
    const data = getData();
    if (!data || !data.points) {
      console.warn("[view_treemap] no data on window.LewmExplorer");
      return null;
    }
    if (typeof d3 === "undefined") {
      console.error("[view_treemap] d3 is required");
      return null;
    }

    const container = d3.select(containerSelector);
    if (container.empty()) {
      console.warn(`[view_treemap] container ${containerSelector} not found`);
      return null;
    }
    container.selectAll("*").remove();

    const width = options.width || container.node().clientWidth || 720;
    const height = options.height || 480;

    // Title + breadcrumb
    container
      .append("div")
      .attr("class", "lewm-treemap-title")
      .style("font", "13px system-ui, sans-serif")
      .style("font-weight", "600")
      .style("margin-bottom", "4px")
      .text("Treemap — hover to select, click to zoom");

    const crumb = container
      .append("div")
      .attr("class", "lewm-treemap-crumb")
      .style("font", "12px system-ui, sans-serif")
      .style("color", "var(--explore-fg-muted, #9097a3)")
      .style("margin-bottom", "6px")
      .style("user-select", "none");

    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("font", "10px system-ui, sans-serif")
      .style("background", "var(--explore-bg-sunk, #08090b)")
      .style("border", "1px solid var(--explore-rule, rgba(255,255,255,0.10))");

    // ---- Hierarchy --------------------------------------------------------
    const hierarchyData = buildHierarchy(data.points);
    const root = d3
      .hierarchy(hierarchyData)
      .sum((d) => d.value || 0)
      .sort((a, b) => b.value - a.value);

    // Color scale: by top-level c2 branch.
    const topKeys = (hierarchyData.children || []).map((c) => c.key);
    // Dark-palette cluster colors, matching styles.css --c-0..9 / --c-noise.
    const darkPalette = [
      "#6aa9ff", "#ffb155", "#ff7373", "#66d4cf", "#a78bfa",
      "#7bd88f", "#f48fb1", "#d9c45a", "#b89a86", "#c7c1bb",
    ];
    const color = d3.scaleOrdinal().domain(topKeys).range(darkPalette);
    // noise gets a neutral gray regardless of position in the ordinal domain
    const colorFor = (k) => (k === "noise" ? "#4a4f59" : color(k));

    // ---- Zoom / drill state ----------------------------------------------
    // path is an array of nodes from root → current focus
    let path = [root];

    function currentFocus() {
      return path[path.length - 1];
    }

    function layoutFor(focus) {
      // Re-run treemap layout on a copy rooted at `focus` so the focus fills
      // the entire canvas.
      const sub = d3
        .hierarchy(focus.data)
        .sum((d) => d.value || 0)
        .sort((a, b) => b.value - a.value);
      d3
        .treemap()
        .size([width, height])
        .paddingInner(1)
        .paddingTop((d) => (d.depth === 0 ? 0 : 0))
        .round(true)(sub);
      return sub;
    }

    function leafIndicesFor(node) {
      const out = [];
      node.each((n) => {
        if (!n.children && n.data && n.data.indices) {
          for (const idx of n.data.indices) out.push(idx);
        }
      });
      return out;
    }

    function topKeyOf(node) {
      // walk up to find the depth-1 ancestor key (or "noise"); fall back to
      // node.data.c2Key which we stamped during buildHierarchy.
      let n = node;
      while (n.parent && n.parent.depth > 0) n = n.parent;
      if (n.data && n.data.key && n.parent) return n.data.key;
      return node.data.c2Key || "noise";
    }

    function humanLabel(node) {
      if (!node || node.depth === 0) return "all";
      const k = node.data.key || "";
      if (k === "noise") return "noise";
      if (k.startsWith("c2:")) return `coarse #${k.slice(3)}`;
      if (k.startsWith("c1:")) return `mid #${k.slice(3)}`;
      if (k.startsWith("c0:")) return `fine #${k.slice(3)}`;
      return k;
    }

    // ---- Render loop ------------------------------------------------------
    function draw() {
      const focus = currentFocus();
      const laidOut = layoutFor(focus);

      // Cells: render all descendants that have a positive area; we draw two
      // depth bands (children + grandchildren of focus) so the user can still
      // see structure inside the current view.
      const cells = laidOut.descendants().filter((d) => d.depth > 0);

      svg.selectAll("g.cell").remove();
      const g = svg
        .selectAll("g.cell")
        .data(cells, (d) => d.ancestors().map((a) => a.data.key).join("/"))
        .enter()
        .append("g")
        .attr("class", "cell")
        .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

      g.append("rect")
        .attr("width", (d) => Math.max(0, d.x1 - d.x0))
        .attr("height", (d) => Math.max(0, d.y1 - d.y0))
        .attr("fill", (d) => {
          // color by top-level c2 branch (depth-1 ancestor of this node IN
          // the sub-tree of focus; but for consistent palette we use the
          // original top-level key recorded as data.c2Key)
          const k = d.data.c2Key || (d.ancestors().slice(-2, -1)[0] || {}).data?.key;
          return colorFor(k);
        })
        .attr("fill-opacity", (d) => (d.children ? 0.35 : 0.85))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          d3.select(this).attr("stroke", "#111").attr("stroke-width", 2);
          const idx = d.data.indices || leafIndicesFor(d);
          broadcastSelection(idx, "treemap");
        })
        .on("mouseleave", function () {
          d3.select(this)
            .attr("stroke", function () {
              // restore either default white or the "contains selection" red
              return d3.select(this.parentNode).classed("has-selection")
                ? "#d62728"
                : "#fff";
            })
            .attr("stroke-width", function () {
              return d3.select(this.parentNode).classed("has-selection")
                ? 2
                : 1;
            });
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          // Only drill if the cell has children we haven't yet exposed (i.e.
          // it's a non-leaf in the ORIGINAL hierarchy). Map this layout node
          // back to the original `root` so `path` stays in the original tree.
          const ancestorsKeys = d
            .ancestors()
            .reverse()
            .map((a) => a.data.key); // includes "all"
          let target = root;
          for (let i = 1; i < ancestorsKeys.length; i++) {
            const k = ancestorsKeys[i];
            if (!target.children) break;
            const next = target.children.find((c) => c.data.key === k);
            if (!next) break;
            target = next;
          }
          if (target && target.children && target !== currentFocus()) {
            path.push(target);
            draw();
          }
        });

      // Cell labels (only on cells big enough)
      g.append("text")
        .attr("x", 4)
        .attr("y", 12)
        .attr("fill", "#fff")
        .attr("pointer-events", "none")
        .style("font-size", "10px")
        .style("paint-order", "stroke")
        .style("stroke", "rgba(0,0,0,0.55)")
        .style("stroke-width", "2px")
        .text((d) => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 40 || h < 16) return "";
          return `${humanLabel(d)} (${d.value})`;
        });

      // Breadcrumb
      crumb.selectAll("*").remove();
      path.forEach((node, i) => {
        if (i > 0) {
          crumb
            .append("span")
            .style("margin", "0 4px")
            .style("color", "#999")
            .text("/");
        }
        crumb
          .append("a")
          .attr("href", "#")
          .style("color", "#1f77b4")
          .style("text-decoration", "none")
          .text(humanLabel(node))
          .on("click", function (event) {
            event.preventDefault();
            path = path.slice(0, i + 1);
            draw();
          });
      });

      // Re-apply external selection highlight (if any) after redraw
      applySelectionHighlight(NS.state && NS.state.selection);
    }

    // ---- External selection highlight ------------------------------------
    function applySelectionHighlight(selection) {
      if (!selection || !selection.length) {
        svg.selectAll("g.cell").classed("has-selection", false);
        svg
          .selectAll("g.cell rect")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .style("stroke-dasharray", null);
        return;
      }
      const sel = new Set(selection);
      svg.selectAll("g.cell").each(function (d) {
        const idx = d.data.indices || leafIndicesFor(d);
        let hit = false;
        for (const i of idx) {
          if (sel.has(i)) {
            hit = true;
            break;
          }
        }
        const node = d3.select(this);
        node.classed("has-selection", hit);
        node
          .select("rect")
          .attr("stroke", hit ? "#d62728" : "#fff")
          .attr("stroke-width", hit ? 2 : 1)
          .style("stroke-dasharray", hit ? "3,2" : null);
      });
    }

    // Esc → zoom out one level
    function onKey(e) {
      if (e.key === "Escape" && path.length > 1) {
        path.pop();
        draw();
      }
    }
    document.addEventListener("keydown", onKey);

    // Subscribe to external selection
    const unsub = subscribeSelection((evt) => {
      if (!evt || evt.source === "treemap") return; // ignore our own
      applySelectionHighlight(evt.selection);
    });

    draw();

    // Public handle (for composer)
    return {
      redraw: draw,
      destroy() {
        document.removeEventListener("keydown", onKey);
        if (typeof unsub === "function") unsub();
        container.selectAll("*").remove();
      },
      setFocusPath(keys) {
        // keys: array like ["c2:8","c1:21"] (relative to root)
        let target = root;
        const newPath = [root];
        for (const k of keys) {
          if (!target.children) break;
          const next = target.children.find((c) => c.data.key === k);
          if (!next) break;
          newPath.push(next);
          target = next;
        }
        path = newPath;
        draw();
      },
    };
  };
})();
