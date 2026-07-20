/* =========================================================================
 * fsrs.js — FSRS-4.5 spaced-repetition scheduler (pure logic, no DOM).
 *
 * Exposes window.App.FSRS with two public functions:
 *   applyReview(cardState, rating, nowMs) -> new cardState
 *   preview(cardState, nowMs)             -> { 1: {card, label}, 2: ..., ... }
 *
 * A cardState looks like:
 *   { stability, difficulty, due, lastReview, reps, lapses, state }
 * (see storage.js -> defaultCard for the canonical shape)
 * ========================================================================= */
window.App = window.App || {};

App.FSRS = (function () {
  'use strict';

  /* ----- FSRS-4.5 default parameters (w0..w16) -------------------------- */
  var W = [
    0.4, 0.6, 2.4, 5.8, // w0-w3: initial stability for Again/Hard/Good/Easy
    4.93, 0.94,         // w4, w5: initial difficulty curve
    0.86, 0.01,         // w6: difficulty delta, w7: mean-reversion weight
    1.49, 0.14, 0.94,   // w8-w10: recall stability growth
    2.18, 0.05, 0.34, 1.26, // w11-w14: post-lapse (forget) stability
    0.29, 2.61          // w15: hard penalty, w16: easy bonus
  ];

  var DECAY = -0.5;              // forgetting-curve decay
  var FACTOR = 19 / 81;          // chosen so that R(t = stability) = 0.9
  var TARGET_RETENTION = 0.9;    // desired recall probability at due date
  var DAY_MS = 24 * 60 * 60 * 1000;
  var RELEARN_MS = 10 * 60 * 1000; // "Again": show again after 10 minutes

  var RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ----- Core formulas -------------------------------------------------- */

  // R(t, S): probability of recall t days after the last review.
  function retrievability(elapsedDays, stability) {
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  function initialStability(rating) {
    return Math.max(W[rating - 1], 0.1);
  }

  function initialDifficulty(rating) {
    return clamp(W[4] - Math.exp((rating - 1) * W[5]) + 1, 1, 10);
  }

  // D' = D - w6*(G-3), then mean-revert towards D0(Easy).
  function nextDifficulty(d, rating) {
    var damped = d - W[6] * (rating - 3);
    return clamp(W[7] * initialDifficulty(RATING.EASY) + (1 - W[7]) * damped, 1, 10);
  }

  // S' on successful recall (rating 2..4).
  function nextStabilityRecall(d, s, r, rating) {
    var hardPenalty = rating === RATING.HARD ? W[15] : 1;
    var easyBonus = rating === RATING.EASY ? W[16] : 1;
    return s * (1 +
      Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) *
      hardPenalty * easyBonus);
  }

  // S' on a lapse (rating 1 = Again).
  function nextStabilityForget(d, s, r) {
    return W[11] *
      Math.pow(d, -W[12]) *
      (Math.pow(s + 1, W[13]) - 1) *
      Math.exp((1 - r) * W[14]);
  }

  // Interval (in days) that lands on TARGET_RETENTION for a given stability.
  function nextIntervalDays(s) {
    var days = (s / FACTOR) * (Math.pow(TARGET_RETENTION, 1 / DECAY) - 1);
    return Math.max(1, Math.round(days));
  }

  /* ----- Public API ----------------------------------------------------- */

  // Returns the next state for a card after being rated (does not mutate).
  function applyReview(card, rating, now) {
    var isFirst = !card || card.state === 'new' || !card.reps;
    var s, d;

    if (isFirst) {
      s = initialStability(rating);
      d = initialDifficulty(rating);
    } else {
      var elapsedDays = Math.max(0, (now - card.lastReview) / DAY_MS);
      var r = retrievability(elapsedDays, card.stability);
      d = nextDifficulty(card.difficulty, rating);
      if (rating === RATING.AGAIN) {
        // Stability may not grow on a lapse.
        s = Math.min(nextStabilityForget(d, card.stability, r), card.stability);
      } else {
        s = nextStabilityRecall(d, card.stability, r, rating);
      }
    }

    s = Math.max(0.1, s);

    var due = rating === RATING.AGAIN
      ? now + RELEARN_MS
      : now + nextIntervalDays(s) * DAY_MS;

    return {
      stability: s,
      difficulty: d,
      due: due,
      lastReview: now,
      reps: (card && card.reps || 0) + 1,
      lapses: (card && card.lapses || 0) + (rating === RATING.AGAIN ? 1 : 0),
      state: 'review'
    };
  }

  // Human-readable label for a millisecond gap, e.g. "10min", "3h", "4T".
  function formatGap(ms) {
    var min = ms / 60000;
    if (min < 60) return Math.max(1, Math.round(min)) + 'min';
    var hours = min / 60;
    if (hours < 24) return Math.round(hours) + 'h';
    return Math.round(hours / 24) + 'T';
  }

  // What would happen for each rating? Used for the interval hints on the
  // rating buttons: { 1: { card, label }, ... }
  function preview(card, now) {
    var out = {};
    for (var rating = RATING.AGAIN; rating <= RATING.EASY; rating++) {
      var next = applyReview(card, rating, now);
      out[rating] = { card: next, label: formatGap(next.due - now) };
    }
    return out;
  }

  return {
    RATING: RATING,
    applyReview: applyReview,
    preview: preview,
    formatGap: formatGap
  };
})();
