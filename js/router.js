(function (C) {
  'use strict';

  // Two screens, kept in the URL hash so the browser's back button and links work:
  //   #/            the list of songs (home)
  //   #/song/<id>   one open song
  var store = C.store;
  var state = store.state;

  var homeScroll = 0;         // where the list was scrolled to, restored when coming back to it
  var nextFocus = null;       // data-keys to focus after the next navigation

  function parse() {
    var match = /^#\/song\/([\w-]+)$/.exec(location.hash);
    if (match) return { name: 'song', id: match[1] };
    if (location.hash === '#/digitaciones') return { name: 'fingerings', id: null };
    return { name: 'home', id: null };
  }

  function setRoute(route) {
    state.route = route;
    document.documentElement.setAttribute('data-route', route.name);
  }

  function apply() {
    var next = parse();
    var target = location.hash;
    var risky = C.editor.draftAtRisk();
    if (risky && !(next.name === 'song' && next.id === risky.id)) {
      // Going away would lose what was written: put the address back, ask, and only then go on.
      history.replaceState(null, '', '#/song/' + risky.id);      // does not fire hashchange
      var message = C.editor.discardMessage(risky);
      C.ui.confirm({
        title: message.title,
        text: message.text,
        ok: 'Descartar',
        danger: true
      }).then(function (yes) {
        if (!yes) return;
        C.editor.discardDraft();
        location.hash = target || '#/';
      });
      return;
    }
    var cameFromSong = state.route.name === 'song';
    if (state.route.name === 'home' && next.name === 'song') homeScroll = window.scrollY;
    // Leaving the song being edited ends the editing session.
    if (state.editId && !(next.name === 'song' && next.id === state.editId)) C.editor.leave();
    setRoute(next);
    var focus = nextFocus;
    nextFocus = null;
    store.notify(focus || []);
    if (next.name === 'song' || next.name === 'fingerings') window.scrollTo(0, 0);
    else if (cameFromSong) window.scrollTo(0, homeScroll);
  }

  // Navigates to a hash ('#/' or '#/song/<id>'), optionally focusing something once it is drawn.
  function go(hash, focusKeys) {
    nextFocus = focusKeys || null;
    if (location.hash === hash) apply();
    else location.hash = hash;
  }

  function init() {
    setRoute(parse());
    window.addEventListener('hashchange', apply);
    // The toolbar's Digitaciones button opens the fingerings page, and closes it (back to the songs) when
    // pressed again.
    var button = document.getElementById('fingering-button');
    if (button) {
      button.addEventListener('click', function (e) {
        if (state.route.name !== 'fingerings') return;
        e.preventDefault();
        go('#/');
      });
    }
    // Esc also closes the fingerings page, unless it is busy closing a window or a menu.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented || state.route.name !== 'fingerings') return;
      if (document.querySelector('dialog[open], .menu:not([hidden])')) return;
      e.preventDefault();
      go('#/');
    });
  }

  C.router = { init: init, go: go };
})(window.Songbook = window.Songbook || {});
