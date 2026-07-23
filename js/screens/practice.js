/* =========================================================================
 * screens/practice.js — the review session.
 *
 * Session model (kept deliberately simple):
 *   - queue = shuffled due cards + up to NEW_PER_SESSION new cards
 *   - rating a card writes its new FSRS state via Storage.recordReview
 *   - "Again" re-inserts the card a few positions later in the queue
 *   - session ends when the queue is empty
 *
 * Keyboard: Space/Enter flips the card, 1-4 rate it.
 * ========================================================================= */
window.App = window.App || {};
App.screens = App.screens || {};

App.screens.practice = (function () {
  'use strict';

  var R = App.FSRS.RATING;

  // Mutable per-session state, rebuilt on every render().
  var session = null;

  /* ----- Session construction --------------------------------------------- */

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildQueue(deselected) {
    var now = Date.now();
    var due = [];
    var fresh = [];

    App.Data.forSelection(deselected).forEach(function (card) {
      var state = App.Storage.getCard(card.note_id);
      if (state.state === 'new') fresh.push(card.note_id);
      else if (state.due <= now) due.push(card.note_id);
    });

    shuffle(due);
    shuffle(fresh);
    return due.concat(fresh.slice(0, App.screens.NEW_PER_SESSION || 20));
  }

  /* ----- Card side rendering ------------------------------------------------ */

  function chipsHtml(card) {
    var html = '<div class="chips">';
    html += '<span class="chip-static chip-type">' + App.Data.typeLabel(card.type) + '</span>';
    if (card.chapter) {
      html += '<span class="chip-static">Kapitel ' + card.chapter + '</span>';
    }
    if (card.gender) {
      html += '<span class="chip-static chip-gender-' + genderKey(card.gender) + '">' +
              card.gender + '</span>';
    }
    return html + '</div>';
  }

  function genderKey(gender) {
    return gender === 'der' ? 'der' : gender === 'die' ? 'die' : gender === 'das' ? 'das' : 'mix';
  }

  function frontHtml(card) {
    return chipsHtml(card) +
      '<div class="card-word">' + card.front + '</div>' +
      '<div class="card-hint">Tippen zum Aufdecken</div>';
  }

  function backHtml(card) {
    var html = chipsHtml(card) +
      '<div class="card-word">' + card.back + '</div>';

    if (card.type === 'verb' && (card.perfekt || card.prateritum)) {
      html += '<div class="verb-forms">';
      if (card.prateritum) html += '<span><b>Präteritum:</b> ' + card.prateritum + '</span>';
      if (card.perfekt) html += '<span><b>Perfekt:</b> ' + card.perfekt + '</span>';
      html += '</div>';
    }
    if (card.notes) {
      html += '<div class="card-notes">' + card.notes + '</div>';
    }
    html += '<div class="card-example">' +
              '<p class="example-de">' + card.example_de + '</p>' +
              '<p class="example-en">' + card.example_en + '</p>' +
            '</div>';
    return html;
  }

  /* ----- Screen rendering ----------------------------------------------------- */

  function render(root, arg) {
    var queue = buildQueue((arg && arg.deselected) || []);
    if (queue.length === 0) { // nothing to do (e.g. deep-link) -> back home
      App.show('overview');
      return;
    }

    session = {
      queue: queue,
      total: queue.length,
      ratings: 0,
      agains: 0,
      startedAt: Date.now(),
      flipped: false,
      busy: false // true during the short transition between cards
    };

    root.innerHTML =
      '<div class="screen screen-practice">' +
        '<header class="practice-top">' +
          '<button class="btn btn-ghost btn-small" id="quit-btn" aria-label="Zurück zur Übersicht">← Übersicht</button>' +
          '<div class="progress-wrap" aria-hidden="true"><div class="progress-fill" id="progress-fill"></div></div>' +
          '<span class="progress-text" id="progress-text"></span>' +
        '</header>' +

        '<div class="card-stage" id="card-stage">' +
          '<div class="card-inner" id="card-inner" role="button" tabindex="0" aria-label="Karteikarte. Zum Aufdecken aktivieren.">' +
            '<div class="card-face card-front panel" id="card-front"></div>' +
            '<div class="card-face card-back panel" id="card-back"></div>' +
          '</div>' +
        '</div>' +

        '<div class="rating-bar" id="rating-bar" aria-label="Wie gut konntest du dich erinnern?">' +
          ratingBtn(R.AGAIN, 'Nochmal', 'rose') +
          ratingBtn(R.HARD, 'Schwer', 'peach') +
          ratingBtn(R.GOOD, 'Gut', 'mint') +
          ratingBtn(R.EASY, 'Leicht', 'sky') +
        '</div>' +
      '</div>';

    document.getElementById('quit-btn').addEventListener('click', function () {
      App.show('overview');
    });
    document.getElementById('card-inner').addEventListener('click', flip);
    document.getElementById('card-inner').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); flip(); }
    });
    document.getElementById('rating-bar').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-rating]');
      if (btn) rate(Number(btn.dataset.rating));
    });

    document.addEventListener('keydown', onKey);
    App.onLeave(function () { document.removeEventListener('keydown', onKey); });

    showCurrentCard();
  }

  function ratingBtn(rating, label, color) {
    return '<button class="rating-btn rating-' + color + '" data-rating="' + rating + '">' +
             '<kbd class="rating-key">' + rating + '</kbd>' +
             '<span class="rating-label">' + label + '</span>' +
             '<span class="rating-interval" data-interval="' + rating + '"></span>' +
           '</button>';
  }

  // Keyboard map: 1-4 or A/H/G/E to rate, Space/Enter to flip, Esc to quit.
  var KEY_TO_RATING = {
    '1': R.AGAIN, 'a': R.AGAIN,
    '2': R.HARD, 'h': R.HARD,
    '3': R.GOOD, 'g': R.GOOD,
    '4': R.EASY, 'e': R.EASY
  };

  function onKey(ev) {
    if (!session) return;
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      flip();
    } else if (ev.key === 'Escape') {
      App.show('overview');
    } else if (session.flipped) {
      var rating = KEY_TO_RATING[ev.key.toLowerCase()];
      if (rating) rate(rating);
    }
  }

  /* ----- Session flow --------------------------------------------------------- */

  function currentId() { return session.queue[0]; }

  function showCurrentCard() {
    session.flipped = false;
    session.busy = false;

    var card = App.Data.byId[currentId()];
    var inner = document.getElementById('card-inner');

    // Snap back to the front WITHOUT the flip animation. Otherwise the
    // rotateY transition would briefly show the back face — already filled
    // with the NEXT card's answer — rotating back into view.
    inner.classList.add('no-flip');
    inner.classList.remove('flipped');
    void inner.offsetWidth; // force reflow so the snap applies immediately
    inner.classList.remove('no-flip');

    document.getElementById('card-front').innerHTML = frontHtml(card);
    document.getElementById('card-back').innerHTML = backHtml(card);

    // Interval hints for each rating, from the card's current FSRS state.
    var hints = App.FSRS.preview(App.Storage.getCard(card.note_id), Date.now());
    document.querySelectorAll('[data-interval]').forEach(function (span) {
      span.textContent = hints[Number(span.dataset.interval)].label;
    });

    updateProgress();
    setRatingEnabled(false);
  }

  function flip() {
    if (!session || session.flipped || session.busy) return;
    session.flipped = true;
    document.getElementById('card-inner').classList.add('flipped');
    setRatingEnabled(true);
  }

  function setRatingEnabled(enabled) {
    document.getElementById('rating-bar').classList.toggle('enabled', enabled);
  }

  function rate(rating) {
    if (!session || !session.flipped || session.busy) return;
    session.busy = true;

    var noteId = currentId();
    var before = App.Storage.getCard(noteId);
    var after = App.FSRS.applyReview(before, rating, Date.now());
    App.Storage.recordReview(noteId, after);

    session.ratings++;
    session.queue.shift();
    if (rating === R.AGAIN) {
      session.agains++;
      // See the card again soon: re-insert 2-4 positions back.
      var pos = Math.min(session.queue.length, 2 + Math.floor(Math.random() * 3));
      session.queue.splice(pos, 0, noteId);
    }

    if (session.queue.length === 0) {
      renderSummary();
    } else {
      showCurrentCard();
    }
  }

  function updateProgress() {
    var remaining = session.queue.length;
    var done = session.ratings - session.agains; // cards fully cleared
    var pct = Math.round((done / (done + remaining)) * 100) || 0;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent =
      (session.total - remaining) + '/' + session.total;
  }

  function renderSummary() {
    var minutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    var root = document.getElementById('app');
    App.onLeave(null); // session over, keyboard hooks already obsolete
    document.removeEventListener('keydown', onKey);

    root.innerHTML =
      '<div class="screen screen-center">' +
        '<div class="panel summary-panel">' +
          '<h1 class="title">Gut gemacht!</h1>' +
          '<p class="subtitle">Einheit geschafft</p>' +
          '<div class="tiles">' +
            '<div class="tile tile-mint"><div class="tile-value">' + session.total + '</div><div class="tile-label">Karten</div></div>' +
            '<div class="tile tile-rose"><div class="tile-value">' + session.agains + '</div><div class="tile-label">Fehler</div></div>' +
            '<div class="tile tile-sky"><div class="tile-value">' + minutes + ' Min.</div><div class="tile-label">Zeit</div></div>' +
          '</div>' +
          '<button class="btn btn-primary btn-block" id="home-btn">Zurück zur Übersicht</button>' +
        '</div>' +
      '</div>';

    document.getElementById('home-btn').addEventListener('click', function () {
      App.show('overview');
    });
    session = null;
  }

  return { render: render };
})();
