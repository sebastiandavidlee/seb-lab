// reduced_motion.js — respect prefers-reduced-motion for <video autoplay>
// CSS alone cannot pause an autoplaying <video>; this tiny script does.
// Drop into site footer with: <script src="assets/reduced_motion.js" defer></script>
(function () {
  try {
    var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    function apply(reduce) {
      document.querySelectorAll('video[autoplay], video[data-autoplay]').forEach(function (v) {
        if (reduce) {
          // Remember original state once
          if (v.dataset.autoplay === undefined) {
            v.dataset.autoplay = v.autoplay ? '1' : '0';
            v.dataset.controls = v.controls ? '1' : '0';
          }
          v.pause();
          v.removeAttribute('autoplay');
          v.controls = true;
        } else if (v.dataset.autoplay === '1') {
          v.setAttribute('autoplay', '');
          v.controls = v.dataset.controls === '1';
          v.play().catch(function () { /* autoplay blocked: leave paused */ });
        }
      });
    }
    apply(mql.matches);
    // React to live preference changes (Safari < 14 uses addListener)
    if (mql.addEventListener) mql.addEventListener('change', function (e) { apply(e.matches); });
    else if (mql.addListener) mql.addListener(function (e) { apply(e.matches); });
  } catch (e) { /* no-op: never break the page over a11y enhancement */ }
})();
