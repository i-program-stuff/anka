/* =========================================================================
 * main.js — app bootstrap + tiny screen router.
 *
 * Screens live under App.screens.<name> and implement render(root, arg).
 * App.show(name, arg) swaps the current screen; a screen may register a
 * cleanup hook via App.onLeave(fn) (e.g. to remove keyboard listeners).
 * ========================================================================= */
window.App = window.App || {};

(function () {
  'use strict';

  var leaveHook = null;

  // Register a callback that runs when the current screen is left.
  App.onLeave = function (fn) { leaveHook = fn; };

  App.show = function (screenName, arg) {
    if (leaveHook) {
      try { leaveHook(); } catch (e) { console.error(e); }
      leaveHook = null;
    }
    var screen = App.screens && App.screens[screenName];
    if (!screen) {
      console.error('[Router] Unknown screen:', screenName);
      return;
    }
    var root = document.getElementById('app');
    root.innerHTML = '';
    window.scrollTo(0, 0);
    screen.render(root, arg);
  };

  App.start = function () {
    var save = App.Storage.load();
    if (save && save.user) {
      App.show('overview');
    } else {
      App.show('name');
    }
  };

  document.addEventListener('DOMContentLoaded', App.start);
})();
