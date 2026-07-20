/* =========================================================================
 * data.js — thin accessor around the baked-in vocabulary (vocab-data.js).
 *
 * Every card carries two tags (e.g. ["chapter-1", "noun"]). The filter
 * model is exclusion-based: a card is visible iff NONE of its tags are in
 * the deselected set. Exposes window.App.Data.
 * ========================================================================= */
window.App = window.App || {};

App.Data = (function () {
  'use strict';

  var cards = (window.VOCAB_DATA || []).slice();
  var byId = {};
  var tagSet = {};

  cards.forEach(function (card) {
    byId[card.note_id] = card;
    card.tags.forEach(function (t) { tagSet[t] = true; });
  });

  var allTags = Object.keys(tagSet).sort();
  var chapterTags = allTags.filter(function (t) { return t.indexOf('chapter-') === 0; });
  var typeTags = allTags.filter(function (t) { return t.indexOf('chapter-') !== 0; });

  // Cards that survive the tag filter (deselected = array of tag strings).
  function forSelection(deselected) {
    if (!deselected || deselected.length === 0) return cards;
    return cards.filter(function (card) {
      return card.tags.every(function (t) { return deselected.indexOf(t) === -1; });
    });
  }

  // German display labels for the card types (raw data values are English).
  var TYPE_LABELS = {
    noun: 'Nomen',
    verb: 'Verb',
    adjective: 'Adjektiv',
    adverb: 'Adverb',
    phrase: 'Redewendung'
  };

  function typeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  return {
    cards: cards,
    byId: byId,
    allTags: allTags,
    chapterTags: chapterTags,
    typeTags: typeTags,
    forSelection: forSelection,
    typeLabel: typeLabel
  };
})();
