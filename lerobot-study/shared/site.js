/* lerobot-study — site.js
 * Vanilla JS, no deps. Self-contained. Loaded as <script defer src="shared/site.js">.
 * Works from any of the 9 pages because all pages sit at the lerobot-study/ root.
 */
(function () {
  "use strict";

  const HEADER_OFFSET = 60;
  const NAV_URL = "shared/nav.html";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    injectNav().then(highlightCurrent).then(buildPalette);
    initBackToTop();
    initTabs();
    initSpoilers();
    initHashOffset();
  }

  /* ---------- nav injection ---------- */
  function injectNav() {
    const host = document.querySelector("#site-nav");
    if (!host) return Promise.resolve();
    return fetch(NAV_URL)
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(html => { host.innerHTML = html; })
      .catch(() => { host.innerHTML = "<p style='color:var(--text-dim);font-size:.85em'>nav unavailable</p>"; });
  }

  function currentPage() {
    const p = location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }

  function highlightCurrent() {
    const here = currentPage();
    document.querySelectorAll("#site-nav a[data-page]").forEach(a => {
      if (a.getAttribute("data-page") === here) a.classList.add("is-active");
    });
  }

  /* ---------- back to top ---------- */
  function initBackToTop() {
    const btn = document.querySelector("#to-top");
    if (!btn) return;
    const onScroll = () => btn.classList.toggle("is-visible", window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    onScroll();
  }

  /* ---------- tabs ---------- */
  function initTabs() {
    document.querySelectorAll(".tabs").forEach(tabs => {
      const triggers = tabs.querySelectorAll("[data-tab]");
      const panels = tabs.querySelectorAll("[data-tab-panel]");
      if (!triggers.length) return;
      const activate = (key) => {
        triggers.forEach(t => t.classList.toggle("is-active", t.dataset.tab === key));
        panels.forEach(p => p.classList.toggle("is-active", p.dataset.tabPanel === key));
      };
      triggers.forEach(t => t.addEventListener("click", () => activate(t.dataset.tab)));
      activate(triggers[0].dataset.tab);
    });
  }

  /* ---------- spoilers (just makes details look right; behavior is native) ---------- */
  function initSpoilers() {
    // Native <details data-spoiler> already collapses. Hook here if we ever want analytics or persistence.
  }

  /* ---------- anchor offset ---------- */
  function initHashOffset() {
    const jump = (hash) => {
      if (!hash || hash === "#") return;
      const el = document.querySelector(hash);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top: y, behavior: "smooth" });
    };
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const hash = a.getAttribute("href");
      if (hash.length < 2) return;
      e.preventDefault();
      history.pushState(null, "", hash);
      jump(hash);
    });
    if (location.hash) setTimeout(() => jump(location.hash), 50);
  }

  /* ---------- command palette ---------- */
  function buildPalette() {
    const links = Array.from(document.querySelectorAll("#site-nav a[data-page]"))
      .map(a => ({ page: a.dataset.page, label: a.textContent.trim(), desc: (a.nextElementSibling && a.nextElementSibling.textContent || "").trim() }));
    if (!links.length) return;

    const root = document.createElement("div");
    root.id = "cmd-k";
    root.innerHTML =
      '<div class="panel"><input type="text" placeholder="Jump to page..." aria-label="Jump to page"/>' +
      '<ul></ul><div class="hint">↑↓ navigate · Enter open · Esc close</div></div>';
    document.body.appendChild(root);

    const input = root.querySelector("input");
    const list  = root.querySelector("ul");
    let idx = 0, items = links.slice();

    const render = () => {
      list.innerHTML = "";
      items.forEach((it, i) => {
        const li = document.createElement("li");
        li.textContent = it.label + (it.desc ? " — " + it.desc : "");
        if (i === idx) li.classList.add("is-selected");
        li.addEventListener("click", () => go(it.page));
        list.appendChild(li);
      });
    };
    const filter = (q) => {
      q = q.trim().toLowerCase();
      items = !q ? links.slice() : links.filter(l => (l.label + " " + l.desc + " " + l.page).toLowerCase().includes(q));
      idx = 0; render();
    };
    const open = () => { root.classList.add("is-open"); input.value = ""; filter(""); setTimeout(() => input.focus(), 0); };
    const close = () => root.classList.remove("is-open");
    const go = (page) => { close(); location.href = page; };

    document.addEventListener("keydown", e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); return; }
      if (!root.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === "Enter" && items[idx]) { e.preventDefault(); go(items[idx].page); }
    });
    input.addEventListener("input", () => filter(input.value));
    root.addEventListener("click", e => { if (e.target === root) close(); });
  }
})();
