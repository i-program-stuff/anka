/* =========================================================================
 * storage.js — persistence layer.
 *
 * The whole save lives under one localStorage key and looks like:
 *   {
 *     version: 1,
 *     user: "Anna",
 *     createdAt: 1720000000000,
 *     tags: ["chapter-3"],            // DESELECTED filter tags (empty = all on)
 *     cards: {
 *       "1784577083110": {
 *         stability: 2.4, difficulty: 6.1,
 *         due: 1720000000000, lastReview: 1719900000000,
 *         reps: 3, lapses: 1, state: "review"
 *       },
 *       ...
 *     }
 *   }
 *
 * Exposes window.App.Storage. All writes are persisted immediately, so the
 * browser keeps progress even if the tab is closed mid-session.
 * ========================================================================= */
window.App = window.App || {};

App.Storage = (function () {
  'use strict';

  var KEY = 'anka-save-v1';
  var VERSION = 1;
  var save = null; // in-memory cache; single source of truth while running

  /* ----- Shape helpers -------------------------------------------------- */

  function blank() {
    return {
      version: VERSION,
      user: null,
      createdAt: Date.now(),
      tags: [], // deselected filter tags; empty = everything visible
      cards: {}
    };
  }

  function defaultCard() {
    return {
      stability: 0,
      difficulty: 0,
      due: null,
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new'
    };
  }

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  // Defensive cleanup so a hand-edited or old save can never crash the app.
  function sanitizeCard(raw) {
    var c = defaultCard();
    if (!raw || typeof raw !== 'object') return c;
    c.stability = Math.max(0, num(raw.stability, 0));
    c.difficulty = Math.max(0, num(raw.difficulty, 0));
    c.due = raw.due === null ? null : num(raw.due, null);
    c.lastReview = raw.lastReview === null ? null : num(raw.lastReview, null);
    c.reps = Math.max(0, Math.round(num(raw.reps, 0)));
    c.lapses = Math.max(0, Math.round(num(raw.lapses, 0)));
    c.state = raw.state === 'review' ? 'review' : 'new';
    return c;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.user !== 'string' || !raw.user) {
      throw new Error('Not a valid Anka save file (missing "user").');
    }
    var clean = blank();
    clean.user = raw.user;
    clean.createdAt = num(raw.createdAt, Date.now());
    // Filter preference: list of deselected tags (older saves used a chapter
    // list — that preference is simply reset to "everything visible").
    clean.tags = Array.isArray(raw.tags)
      ? raw.tags.filter(function (t) { return typeof t === 'string'; })
      : [];
    if (raw.cards && typeof raw.cards === 'object') {
      for (var id in raw.cards) {
        clean.cards[id] = sanitizeCard(raw.cards[id]);
      }
    }
    return clean;
  }

  /* ----- Core load / persist -------------------------------------------- */

  function load() {
    if (save) return save;
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) save = sanitize(JSON.parse(raw));
    } catch (e) {
      // corrupted save or unavailable localStorage (private mode etc.)
      console.error('[Storage] Could not load save, starting fresh.', e);
      save = null;
    }
    return save;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch (e) {
      console.error('[Storage] Could not persist save.', e);
    }
  }

  function create(userName) {
    save = blank();
    save.user = userName;
    persist();
    return save;
  }

  function exists() {
    return load() !== null;
  }

  /* ----- Per-card state --------------------------------------------------- */

  // Always returns a usable card state (default for never-seen cards).
  function getCard(noteId) {
    var s = load();
    return (s && s.cards[noteId]) || defaultCard();
  }

  function recordReview(noteId, cardState) {
    var s = load();
    if (!s) return;
    s.cards[noteId] = cardState;
    persist();
  }

  /* ----- Tag filter preference -------------------------------------------- */

  // Returns the array of DESELECTED tags ([] = everything visible).
  function getDeselectedTags() {
    var s = load();
    return (s && s.tags) ? s.tags.slice() : [];
  }

  function setDeselectedTags(tags) {
    var s = load();
    if (!s) return;
    s.tags = tags.slice();
    persist();
  }

  /* ----- Export / Import ---------------------------------------------------- */

  function exportFileName() {
    var s = load();
    var date = new Date().toISOString().slice(0, 10);
    var user = (s && s.user ? s.user : 'save').replace(/[^\w-]+/g, '_');
    return 'anka-' + user + '-' + date + '.json';
  }

  // Triggers a browser download of the current save as pretty-printed JSON.
  function exportSave() {
    var s = load();
    if (!s) return;
    var blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Parses + validates imported JSON text, replaces the current save.
  // Throws with a friendly message on invalid input.
  function importSave(jsonText) {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    save = sanitize(parsed); // throws if the shape is wrong
    persist();
    return save;
  }

  return {
    load: load,
    exists: exists,
    create: create,
    getCard: getCard,
    recordReview: recordReview,
    getDeselectedTags: getDeselectedTags,
    setDeselectedTags: setDeselectedTags,
    exportSave: exportSave,
    importSave: importSave,
    defaultCard: defaultCard
  };
})();
