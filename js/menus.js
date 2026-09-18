(function (C) {
  'use strict';

  // Drop-down menus of the toolbar. Markup: <div class="picker" id="NAME-picker"> with one <button>
  // and one <div class="menu" hidden>. Only one menu is open at a time.
  var menus = [];

  function closeAll(except) {
    menus.forEach(function (m) { if (m !== except) m.close(); });
  }

  function register(name) {
    var box = document.getElementById(name + '-picker');
    var m = {
      button: box.querySelector('button'),
      menu: box.querySelector('.menu'),
      isOpen: function () { return !m.menu.hidden; },
      open: function () {
        closeAll(m);
        m.menu.hidden = false;
        m.button.setAttribute('aria-expanded', 'true');
        if (m.onOpen) m.onOpen();
      },
      close: function () {
        m.menu.hidden = true;
        m.button.setAttribute('aria-expanded', 'false');
      }
    };
    m.button.addEventListener('click', function () { if (m.isOpen()) m.close(); else m.open(); });
    menus.push(m);
    return m;
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.picker')) closeAll();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    menus.forEach(function (m) {
      if (!m.isOpen()) return;
      m.close();
      m.button.focus();
    });
  });

  C.menus = { register: register, closeAll: closeAll };
})(window.Songbook = window.Songbook || {});
