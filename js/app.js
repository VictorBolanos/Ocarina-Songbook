(function (C) {
  'use strict';

  C.i18n.init();                                           // language: translates the fixed page and starts watching
  C.icons.mount();                                         // icons of the static HTML
  C.store.discardLegacyStorage();
  C.render.init();
  C.editor.init();
  C.preferences.init();
  C.player.init();
  C.metronome.init();
  C.backup.init();
  C.fingeringEditor.init();
  C.background.init();                                     // async: puts back the chosen picture
  C.home.init();
  C.router.init();
  C.folder.init();                                         // async: reconnects the songs folder if it can

  C.i18n.onChange(function () { C.store.notify(); });      // the texts built by the code are drawn again
  C.store.notify();                                        // first paint
  document.querySelector('.toolbar').hidden = false;

  // Write any pending change as soon as the tab goes to the background, and warn if the page is being
  // closed before the last edit reached the folder.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') C.store.save();
  });
  window.addEventListener('beforeunload', function (e) {
    if (!C.store.hasPendingSave() && !C.editor.draftAtRisk()) return;
    C.store.save();
    e.preventDefault();
    e.returnValue = '';
  });
})(window.Songbook = window.Songbook || {});
