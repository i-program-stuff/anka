/* =========================================================================
 * screens/name.js — first-boot screen: ask for the user's name, create the
 * save, then continue to the overview.
 * ========================================================================= */
window.App = window.App || {};
App.screens = App.screens || {};

App.screens.name = (function () {
  'use strict';

  function render(root) {
    var el = document.createElement('div');
    el.className = 'screen screen-center';
    el.innerHTML =
      '<div class="panel welcome-panel">' +
        '<svg class="moon" viewBox="0 0 64 64" aria-hidden="true">' +
          '<path d="M42 6a26 26 0 1 0 16 46A30 30 0 0 1 42 6z" fill="currentColor"/>' +
          '<circle cx="46" cy="16" r="3" fill="currentColor" opacity=".55"/>' +
          '<circle cx="55" cy="27" r="2" fill="currentColor" opacity=".4"/>' +
        '</svg>' +
        '<h1 class="title">Anka</h1>' +
        '<form class="name-form" novalidate>' +
          '<label class="field-label" for="name-input">Bitte schreiben Sie ihren Namen</label>' +
          '<input id="name-input" class="text-input" type="text" maxlength="30" ' +
                 'autocomplete="off" placeholder="Ihr Namen" required>' +
          '<button class="btn btn-primary btn-block" type="submit">Start learning</button>' +
        '</form>' +
      '</div>';

    var form = el.querySelector('.name-form');
    var input = el.querySelector('#name-input');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = input.value.trim();
      if (!name) {
        input.classList.add('invalid');
        input.focus();
        return;
      }
      App.Storage.create(name);
      App.show('overview');
    });

    input.addEventListener('input', function () {
      input.classList.remove('invalid');
    });

    root.appendChild(el);
    input.focus();
  }

  return { render: render };
})();
