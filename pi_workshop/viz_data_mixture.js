/* Viz — π₀.5 Data Mixture (page 5).
 * Stacked horizontal bar: π₀ (100% lab teleop) vs π₀.5 (lab + cross-embodiment + web).
 * Schematic ratios — labeled. Tooltip on each slice names the source.
 *
 * Exports: window.Viz_data_mixture = { init(rootEl) }.
 */
(function () {
  'use strict';

  var SLUG = 'data_mixture';

  var ROWS = [
    {
      label: 'π₀',
      slices: [
        { pct: 100, color: '#6a3d9a', name: 'lab teleoperation', detail: 'in-house multi-robot teleop, single embodiment' }
      ],
      note: 'single source — Pi internal teleop'
    },
    {
      label: 'π₀.5',
      slices: [
        { pct: 40, color: '#6a3d9a', name: 'lab teleop',         detail: 'Pi internal teleop fleet' },
        { pct: 35, color: '#ff8c1a', name: 'cross-embodiment',   detail: 'OpenX-style mix across robots/datasets' },
        { pct: 25, color: '#1abc9c', name: 'web / multimodal',   detail: 'image-text web data carrying over from PaliGemma pretrain' }
      ],
      note: 'co-trained mixture (schematic ratios)'
    }
  ];

  function init(rootEl) {
    if (!rootEl) return;

    rootEl.innerHTML =
      '<div class="viz-pi" data-slug="' + SLUG + '" style="font-family:inherit">' +
        '<header style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">' +
          '<div class="viz-title" style="font-size:16px;font-weight:600">Data mixture · π₀ → π₀.5</div>' +
          '<div class="viz-purpose" style="color:#555;font-size:12px;flex:1">' +
            'π₀.5 broadens the pretraining mix beyond the lab' +
          '</div>' +
          '<div class="cite cite--mono" style="font-family:var(--mono,monospace);font-size:11px;color:#666">' +
            'π₀.5 paper · schematic — see paper for detail' +
          '</div>' +
        '</header>' +

        '<div class="js-bars" style="display:flex;flex-direction:column;gap:10px;margin-top:8px"></div>' +

        '<div class="js-tip" style="position:absolute;display:none;background:#1a1a1a;color:#fff;font-size:11px;' +
          'padding:5px 8px;border-radius:3px;font-family:var(--mono,monospace);pointer-events:none;z-index:10"></div>' +

        '<div class="viz-caption" style="margin-top:10px;font-size:12px;background:#f4f4f2;padding:8px 10px;border-left:3px solid #888">' +
          '<b>Knowledge Insulation</b> in π₀.5 protects the VLM\'s web-derived knowledge while the action expert trains on the broader robot mixture. ' +
          '<span style="color:#888">Percentages here are schematic — the exact π₀.5 mixture is in the paper.</span>' +
        '</div>' +
      '</div>';

    rootEl.style.position = 'relative';
    var bars = rootEl.querySelector('.js-bars');
    var tip  = rootEl.querySelector('.js-tip');

    var html = '';
    for (var r = 0; r < ROWS.length; r++) {
      var row = ROWS[r];
      html +=
        '<div style="display:grid;grid-template-columns:60px 1fr 220px;gap:10px;align-items:center">' +
          '<div style="font-family:var(--mono,monospace);font-size:14px;font-weight:600">' + row.label + '</div>' +
          '<div class="js-row" data-row="' + r + '" style="display:flex;height:34px;border:1px solid #d0d0d0;border-radius:3px;overflow:hidden;background:#fafafa">';
      for (var s = 0; s < row.slices.length; s++) {
        var sl = row.slices[s];
        html +=
          '<div class="js-slice" data-row="' + r + '" data-idx="' + s + '" ' +
            'style="background:' + sl.color + ';width:' + sl.pct + '%;display:flex;align-items:center;justify-content:center;' +
              'color:#fff;font-family:var(--mono,monospace);font-size:11px;cursor:default;transition:filter 120ms">' +
            (sl.pct >= 12 ? sl.pct + '% · ' + sl.name : sl.pct + '%') +
          '</div>';
      }
      html += '</div>' +
        '<div style="font-size:11px;color:#666;font-style:italic">' + row.note + '</div>' +
      '</div>';
    }
    bars.innerHTML = html;

    // tooltip wiring
    var slices = rootEl.querySelectorAll('.js-slice');
    for (var i = 0; i < slices.length; i++) {
      slices[i].addEventListener('mousemove', function (ev) {
        var r = parseInt(ev.currentTarget.getAttribute('data-row'), 10);
        var idx = parseInt(ev.currentTarget.getAttribute('data-idx'), 10);
        var sl = ROWS[r].slices[idx];
        tip.innerHTML =
          '<div style="font-weight:600">' + sl.name + ' · ' + sl.pct + '%</div>' +
          '<div style="opacity:0.85;margin-top:2px;max-width:240px">' + sl.detail + '</div>' +
          '<div style="opacity:0.55;margin-top:3px;font-size:10px">schematic — see π₀.5 paper</div>';
        tip.style.display = 'block';
        var rect = rootEl.getBoundingClientRect();
        tip.style.left = (ev.clientX - rect.left + 12) + 'px';
        tip.style.top  = (ev.clientY - rect.top + 12) + 'px';
        ev.currentTarget.style.filter = 'brightness(1.1)';
      });
      slices[i].addEventListener('mouseleave', function (ev) {
        tip.style.display = 'none';
        ev.currentTarget.style.filter = '';
      });
    }
  }

  window.Viz_data_mixture = { init: init };

  function autoInit() {
    var el = document.getElementById('viz-data-mixture') ||
             document.getElementById('viz-data_mixture');
    if (el) init(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
