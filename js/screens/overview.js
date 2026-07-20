/* =========================================================================
 * screens/overview.js — home screen after login.
 *
 * Shows greeting, progress stats, a collapsible tag filter, the big
 * practice button and export / import of the save file (JSON).
 * ========================================================================= */
window.App = window.App || {};
App.screens = App.screens || {};

App.screens.overview = (function () {
  'use strict';

  var NEW_PER_SESSION = App.screens.NEW_PER_SESSION = 20;

  /* ----- Stats ------------------------------------------------------------ */

  // Aggregates card states for the given (already tag-filtered) cards.
  function computeStats(cards) {
    var now = Date.now();
    var stats = { due: 0, fresh: 0, learned: 0, lapses: 0, total: 0, nextDue: null };

    cards.forEach(function (card) {
      stats.total++;
      var state = App.Storage.getCard(card.note_id);
      stats.lapses += state.lapses;
      if (state.state === 'new') {
        stats.fresh++;
      } else {
        stats.learned++;
        if (state.due <= now) {
          stats.due++;
        } else if (stats.nextDue === null || state.due < stats.nextDue) {
          stats.nextDue = state.due;
        }
      }
    });
    return stats;
  }

  /* ----- Small view helpers ----------------------------------------------- */

  function tile(value, label, colorClass) {
    return '<div class="tile tile-' + colorClass + '">' +
             '<div class="tile-value">' + value + '</div>' +
             '<div class="tile-label">' + label + '</div>' +
           '</div>';
  }

  function formatNextDue(ts) {
    var diff = ts - Date.now();
    var dayMs = 24 * 60 * 60 * 1000;
    var time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < dayMs) return 'today at ' + time;
    if (diff < 2 * dayMs) return 'tomorrow at ' + time;
    return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  function tagChip(tag, active) {
    var label = tag.indexOf('chapter-') === 0 ? tag.replace('chapter-', 'Chapter ') : tag;
    return '<button class="chip' + (active ? ' chip-active' : '') + '" ' +
           'data-tag="' + tag + '" aria-pressed="' + active + '">' + label + '</button>';
  }

  /* ----- Decorative floating stars ---------------------------------------- */

  var STAR_COLORS = ['--butter', '--lilac', '--sky', '--rose', '--mint'];
  var STAR_COUNT = 18;

  // Purely decorative; animation is CSS-only (see .stars in style.css).
  function starsHtml() {
    var html = '<div class="stars" aria-hidden="true">';
    for (var i = 0; i < STAR_COUNT; i++) {
      var size = (5 + Math.random() * 8).toFixed(0);
      html += '<span class="star" style="' +
        'left:' + (Math.random() * 96).toFixed(1) + '%;' +
        'top:' + (Math.random() * 94).toFixed(1) + '%;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        '--star-color:var(' + STAR_COLORS[i % STAR_COLORS.length] + ');' +
        '--drift:' + (8 + Math.random() * 8).toFixed(1) + 's;' +
        '--twinkle:' + (3 + Math.random() * 4).toFixed(1) + 's;' +
        '--delay:-' + (Math.random() * 12).toFixed(1) + 's;' +
        '"></span>';
    }
    return html + '</div>';
  }

  /* ----- Import ------------------------------------------------------------ */

  function handleImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        if (!window.confirm('Replace your current progress with the imported save?')) return;
        App.Storage.importSave(String(reader.result));
        App.show('overview'); // re-render with the imported data
      } catch (e) {
        window.alert('Import failed: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ----- Render ------------------------------------------------------------- */

  function render(root) {
    var save = App.Storage.load();
    var deselected = App.Storage.getDeselectedTags();
    var visibleCards = App.Data.forSelection(deselected);
    var stats = computeStats(visibleCards);
    var sessionSize = stats.due + Math.min(stats.fresh, NEW_PER_SESSION);

    var activeCount = App.Data.allTags.length - deselected.length;

    var el = document.createElement('div');
    el.className = 'screen screen-overview';

    el.innerHTML =
      /* Decorative background stars */
      starsHtml() +

      /* Header */
      '<header class="topbar">' +
        '<div>' +
          '<h1 class="greeting">Hallo, <span class="accent">' + escapeHtml(save.user) + '</span></h1>' +
          '<p class="subtitle">Bist du bereit zu üben?</p>' +
        '</div>' +
        '<svg class="moon moon-small" viewBox="0 0 64 64" aria-hidden="true">' +
          '<path d="M42 6a26 26 0 1 0 16 46A30 30 0 0 1 42 6z" fill="currentColor"/>' +
        '</svg>' +
      '</header>' +

      /* Stat tiles */
      '<section class="tiles">' +
        tile(stats.due, 'due now', 'rose') +
        tile(stats.fresh, 'new cards', 'sky') +
        tile(stats.learned, 'in review', 'mint') +
        tile(stats.lapses, 'mistakes', 'peach') +
      '</section>' +

      /* Collapsible tag filter */
      '<details class="tags-field" id="tags-field">' +
        '<summary class="tags-toggle">' +
          '<span class="tags-title">Tags</span>' +
          '<span class="tags-summary">' +
            (deselected.length === 0 ? 'all shown' : activeCount + ' of ' + App.Data.allTags.length + ' on') +
          '</span>' +
          '<svg class="tags-chevron" viewBox="0 0 16 16" aria-hidden="true">' +
            '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</summary>' +
        '<div class="tags-body">' +
          '<div class="tag-group">' +
            '<span class="tag-group-label">Chapters</span>' +
            '<div class="tag-chips">' +
              App.Data.chapterTags.map(function (t) {
                return tagChip(t, deselected.indexOf(t) === -1);
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="tag-group">' +
            '<span class="tag-group-label">Types</span>' +
            '<div class="tag-chips">' +
              App.Data.typeTags.map(function (t) {
                return tagChip(t, deselected.indexOf(t) === -1);
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</details>' +

      /* Practice */
      '<section class="practice-cta">' +
        '<button class="btn btn-primary btn-block btn-big" id="start-btn"' +
          (sessionSize === 0 ? ' disabled' : '') + '>' +
          (sessionSize > 0 ? 'Practice · ' + sessionSize + ' cards' : 'All caught up') +
        '</button>' +
        (stats.total === 0
          ? '<p class="hint">No cards match the selected tags.</p>'
          : sessionSize === 0 && stats.nextDue
            ? '<p class="hint">Next card is due ' + formatNextDue(stats.nextDue) + '.</p>'
            : '') +
      '</section>' +

      /* Save management */
      '<section class="save-row">' +
        '<button class="btn btn-ghost" id="export-btn">Export save</button>' +
        '<button class="btn btn-ghost" id="import-btn">Import save</button>' +
        '<input type="file" id="import-input" accept=".json,application/json" hidden>' +
      '</section>';

    root.appendChild(el);

    /* --- Wire up events --------------------------------------------------- */

    // Remember whether the user opened the tag field (cosmetic only).
    var tagsField = el.querySelector('#tags-field');
    if (deselected.length > 0) tagsField.open = true;

    // Tag chips: toggle a tag in the deselected set, persist, re-render.
    el.querySelectorAll('[data-tag]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var tag = chip.dataset.tag;
        var idx = deselected.indexOf(tag);
        if (idx === -1) deselected.push(tag);
        else deselected.splice(idx, 1);
        App.Storage.setDeselectedTags(deselected);
        App.show('overview');
      });
    });

    var startBtn = el.querySelector('#start-btn');
    if (sessionSize > 0) {
      startBtn.addEventListener('click', function () {
        App.show('practice', { deselected: deselected });
      });
    }

    el.querySelector('#export-btn').addEventListener('click', function () {
      App.Storage.exportSave();
    });

    var importInput = el.querySelector('#import-input');
    el.querySelector('#import-btn').addEventListener('click', function () {
      importInput.click();
    });
    importInput.addEventListener('change', function () {
      if (importInput.files && importInput.files[0]) {
        handleImportFile(importInput.files[0]);
      }
    });
  }

  // Minimal HTML escaping for user-controlled strings (the user name).
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  return { render: render, computeStats: computeStats };
})();
