/* AV Interview Study v2 — shared page behavior */
(function () {
  'use strict';

  // 1) Guarded KaTeX auto-render
  function renderMath() {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  }

  // 2) Nav current-page highlight
  function highlightNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.topnav a').forEach(function (a) {
      if (a.getAttribute('href') === here) a.classList.add('current');
    });
  }

  // 3) Glossary live search (text + data-tags), count readout, hide empty sections
  function initGlossarySearch() {
    var input = document.getElementById('glossary-search');
    if (!input) return;
    var entries = Array.prototype.slice.call(document.querySelectorAll('.entry'));
    var count = document.getElementById('glossary-count');
    var sections = Array.prototype.slice.call(document.querySelectorAll('.g-section'));
    function apply() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      entries.forEach(function (e) {
        var hay = e.textContent.toLowerCase() + ' ' + (e.getAttribute('data-tags') || '').toLowerCase();
        var hit = !q || hay.indexOf(q) !== -1;
        e.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      sections.forEach(function (s) {
        var any = Array.prototype.some.call(s.querySelectorAll('.entry'), function (e) {
          return e.style.display !== 'none';
        });
        s.style.display = any ? '' : 'none';
      });
      if (count) count.textContent = shown + ' / ' + entries.length + ' terms';
    }
    input.addEventListener('input', apply);
    apply();
  }

  // 4) Shared hover-tooltip helper for content-page widgets.
  // showFn(mouseEvent) returns an HTML string to show, or null/undefined to hide.
  window.vizTooltip = function (svgEl, showFn) {
    var tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);
    function hide() { tip.style.display = 'none'; }
    svgEl.addEventListener('mousemove', function (ev) {
      var html = showFn(ev);
      if (html == null) { hide(); return; }
      tip.innerHTML = html;
      tip.style.display = 'block';
      var x = ev.pageX + 12, y = ev.pageY + 12;
      var r = tip.getBoundingClientRect();
      if (x + r.width > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - r.width - 12;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    svgEl.addEventListener('mouseleave', hide);
    return tip;
  };

  document.addEventListener('DOMContentLoaded', function () {
    highlightNav();
    initGlossarySearch();
    renderMath();
  });
})();
