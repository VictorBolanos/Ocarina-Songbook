(function (C) {
  'use strict';

  // The dialog where the kind of accidentals of a song is chosen: none, flats or sharps.
  //
  // choose(current, options) -> Promise of 'none' | 'flat' | 'sharp', or undefined if cancelled.
  var h = C.ui.h;

  var HINTS = {
    none: 'Sin alteraciones: la botonera no ofrece bemoles ni sostenidos. La tonalidad es Do mayor / La menor.',
    flat: 'Bemoles: la botonera ofrece Si♭, Mi♭, La♭, Re♭, Sol♭, Do♭ y Fa♭. La tonalidad sale de los que uses.',
    sharp: 'Sostenidos: la botonera ofrece Fa♯, Do♯, Sol♯, Re♯, La♯, Mi♯ y Si♯. La tonalidad sale de los que uses.'
  };

  function choose(current, options) {
    options = options || {};
    var dialog = document.getElementById('key-dialog');
    var title = dialog.querySelector('[data-role="title"]');
    var help = dialog.querySelector('[data-role="help"]');
    var types = dialog.querySelector('[data-role="types"]');
    var preview = dialog.querySelector('[data-role="preview"]');
    var ok = dialog.querySelector('[data-role="ok"]');
    var cancel = dialog.querySelector('[data-role="cancel"]');

    title.textContent = options.title || 'Alteraciones de la canción';
    help.textContent = options.help || '';
    ok.textContent = options.ok || 'Aceptar';

    var chosen = C.keys.clean(current);                        // null until something is chosen
    var refocus = null;                                        // selector of the button to focus after a redraw

    function typeButton(type) {
      return h('button', {
        type: 'button',
        class: 'dur-btn key-opt',
        'aria-pressed': String(chosen === type),
        'data-type': type,
        onclick: function () {
          chosen = type;
          refocus = '[data-type="' + type + '"]';
          render();
        }
      }, h('span', { class: 'dur-val' }, C.keys.typeLabel(type)));
    }

    function render() {
      types.replaceChildren.apply(types, C.keys.TYPES.map(typeButton));
      preview.textContent = chosen ? HINTS[chosen] : 'Elige qué alteraciones va a usar la canción.';
      ok.disabled = chosen === null;
      var target = refocus && dialog.querySelector(refocus);
      if (target) target.focus();
      refocus = null;
    }

    return new Promise(function (resolve) {
      function finish(result) {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onCancel);          // Escape
        dialog.removeEventListener('click', onBackdrop);
        if (dialog.open) dialog.close();
        resolve(result);
      }
      function onOk() { if (chosen !== null) finish(chosen); }
      function onCancel(e) { if (e && e.preventDefault) e.preventDefault(); finish(undefined); }
      function onBackdrop(e) { if (e.target === dialog) finish(undefined); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('click', onBackdrop);
      render();
      dialog.showModal();
    });
  }

  C.keyDialog = { choose: choose };
})(window.Songbook = window.Songbook || {});
