// AV Interview Study — shared behavior: KaTeX render, nav highlight, glossary search.

document.addEventListener("DOMContentLoaded", () => {
  renderMath();
  highlightNav();
  setupGlossarySearch();
});

function renderMath() {
  if (typeof renderMathInElement !== "function") return; // CDN unavailable — raw LaTeX text is an acceptable fallback
  try {
    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  } catch (e) {
    // KaTeX failed to load fully — leave raw LaTeX visible
  }
}

function highlightNav() {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".topnav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === here) a.classList.add("active");
  });
}

function setupGlossarySearch() {
  const input = document.getElementById("glossary-search");
  if (!input) return;

  const entries = Array.from(document.querySelectorAll(".entry"));
  const countEl = document.getElementById("glossary-count");
  const total = entries.length;

  const update = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    entries.forEach((entry) => {
      const text = entry.textContent.toLowerCase();
      const tags = (entry.getAttribute("data-tags") || "").toLowerCase();
      const match = !q || text.includes(q) || tags.includes(q);
      entry.classList.toggle("hidden", !match);
      if (match) shown++;
    });
    document.querySelectorAll(".glossary-category").forEach((cat) => {
      const visible = cat.querySelectorAll(".entry:not(.hidden)").length;
      cat.classList.toggle("hidden", visible === 0);
    });
    if (countEl) countEl.textContent = `Showing ${shown} of ${total} terms`;
  };

  input.addEventListener("input", update);
  update();
}
