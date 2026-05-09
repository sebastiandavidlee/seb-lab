/* π₀.5 site — shared utilities */

(function () {
  /* IntersectionObserver-driven reveal */
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-revealed');
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
  );

  function init() {
    document
      .querySelectorAll('.reveal, .reveal-eq')
      .forEach((el) => observer.observe(el));
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();

/* KaTeX auto-render after the library loads */
function renderMath() {
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      strict: 'ignore',
    });
  }
}
document.addEventListener('DOMContentLoaded', () => {
  if (window.renderMathInElement) renderMath();
  else {
    /* if KaTeX is loaded async, retry once */
    window.addEventListener('load', () => setTimeout(renderMath, 50));
  }
});

/* Color tokens accessible from JS — same names as CSS */
window.PiColors = (function () {
  const get = (n) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {
    bg: get('--bg'),
    bgFig: get('--bg-fig'),
    rule: get('--rule'),
    ruleStrong: get('--rule-strong'),
    ink: get('--ink'),
    inkStrong: get('--ink-strong'),
    inkMuted: get('--ink-muted'),
    inkDim: get('--ink-dim'),
    link: get('--link'),
    vlm: get('--c-vlm'),
    action: get('--c-action'),
    flow: get('--c-flow'),
    fast: get('--c-fast'),
    gradStop: get('--c-grad-stop'),
    gradFlow: get('--c-grad-flow'),
    frozen: get('--c-frozen'),
    trained: get('--c-trained'),
    noise: get('--c-noise'),
    data: get('--c-data'),
    j: [0, 1, 2, 3, 4, 5, 6].map((i) => get('--j' + i)),
  };
})();

/* Tiny pub-sub for opportunistic cross-viz hooks */
window.PiBus = (function () {
  const subs = new Map();
  return {
    on(ev, cb) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(cb);
    },
    emit(ev, payload) {
      (subs.get(ev) || []).forEach((cb) => {
        try { cb(payload); } catch (e) { console.error(e); }
      });
    },
  };
})();

/* High-DPI canvas helper. Returns a 2d ctx pre-scaled to dpr.   */
window.setupHiDPICanvas = function (canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
};

/* Linear interpolation + easing helpers used by several vizs */
window.lerp = (a, b, t) => a + (b - a) * t;
window.clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
window.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
window.easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
