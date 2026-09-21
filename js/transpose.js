(function (C) {
  'use strict';

  // Transposing the song being edited: every note goes up or down by the same number of semitones, so the
  // song fits the range of the ocarina (A4 to F6) or a key that is easier to play. It is a window opened from
  // the editor. It shows, as the choice changes, how many notes would still be out of the ocarina's range and
  // what the key becomes, and nothing is written until "Transportar" (which the editor's undo can take back).
  var h = C.ui.h;
  var tr = C.i18n.t;
  var store = C.store;

  var LIMIT = 24;                        // at most two octaves either way

  // The song's notes shifted by `semitones`, spelled with sharps or flats. Returns the new lines (arrays of
  // note codes), how many pitched notes fall outside the ocarina's range, how many the page cannot write at
  // all (in which case the transposition is refused), and the signature the song would have.
  function transposed(song, semitones, accidental) {
    var lines = [];
    var out = 0;
    var unwritable = 0;
    var pitched = 0;
    var accidentals = false;
    song.lines.forEach(function (line) {
      lines.push(line.notes.map(function (code) {
        var note = C.notes.parse(code);
        if (!note || note.rest) return code;
        pitched++;
        var number = C.notes.midi(note) + semitones;
        if (number < C.notes.RANGE.low || number > C.notes.RANGE.high) out++;
        var next = C.notes.fromMidi(number, accidental);
        if (next === null) {
          unwritable++;
          return code;
        }
        var moved = C.notes.parse(next);
        if (moved.accidental) accidentals = true;
        return C.notes.withDuration(next, note.duration, note.dotted);
      }));
    });
    var signature = accidentals ? (accidental === 'b' ? 'flat' : 'sharp') : song.signature;
    return { lines: lines, out: out, unwritable: unwritable, pitched: pitched, signature: signature };
  }

  function signed(n) {
    return (n > 0 ? '+' : (n < 0 ? '−' : '')) + Math.abs(n);
  }

  function open() {
    var dialog = document.getElementById('transpose-dialog');
    var target = store.editingSong();
    if (!dialog || !target) return;
    var id = target.id;
    var semitones = 0;
    var accidental = target.signature === 'flat' ? 'b' : '#';

    var valueEl = h('div', { class: 'transpose-value' });
    var infoEl = h('p', { class: 'transpose-info', role: 'status' });
    var keyEl = h('p', { class: 'transpose-key' });
    var apply = h('button', { type: 'button', class: 'btn btn--primary', onclick: run }, 'Transportar');
    var kinds = {};

    function step(delta, label) {
      return h('button', {
        type: 'button', class: 'btn', 'data-step': delta,
        onclick: function () { semitones = Math.max(-LIMIT, Math.min(LIMIT, semitones + delta)); paint(); }
      }, label);
    }

    function kind(mark, label) {
      kinds[mark] = h('button', {
        type: 'button', class: 'btn btn--sm', 'data-accidental': mark,
        onclick: function () { accidental = mark; paint(); }
      }, label);
      return kinds[mark];
    }

    function paint() {
      var current = store.editingSong();
      if (!current || current.id !== id) return;
      var result = transposed(current, semitones, accidental);
      valueEl.textContent = semitones === 0 ? tr('Sin cambios') : (Math.abs(semitones) === 1 ? tr('{n} semitono', { n: signed(semitones) }) : tr('{n} semitonos', { n: signed(semitones) }));
      Object.keys(kinds).forEach(function (mark) { kinds[mark].setAttribute('aria-pressed', String(mark === accidental)); });

      var message;
      var kindOfMessage = 'is-ok';
      if (!result.pitched) {
        message = tr('La canción todavía no tiene notas.');
      } else if (result.unwritable) {
        message = result.unwritable === 1
          ? tr('1 nota se saldría de las octavas de la página. Elige un desplazamiento menor.')
          : tr('{n} notas se saldrían de las octavas de la página. Elige un desplazamiento menor.', { n: result.unwritable });
        kindOfMessage = 'is-bad';
      } else if (result.out) {
        message = result.out === 1
          ? tr('1 de {total} notas queda fuera del rango de la ocarina ({range}).', { total: result.pitched, range: C.notes.rangeText() })
          : tr('{n} de {total} notas quedan fuera del rango de la ocarina ({range}).', { n: result.out, total: result.pitched, range: C.notes.rangeText() });
        kindOfMessage = 'is-warn';
      } else {
        message = tr('Todas las notas caben en la ocarina ({range}).', { range: C.notes.rangeText() });
      }
      infoEl.textContent = message;
      infoEl.className = 'transpose-info ' + kindOfMessage;

      var key = C.keys.describe(result.signature, { lines: result.lines.map(function (notes) { return { notes: notes }; }) });
      keyEl.textContent = tr('Tonalidad: {key}', { key: key.text });
      apply.disabled = semitones === 0 || !result.pitched || result.unwritable > 0;
    }

    function run() {
      var current = store.editingSong();
      if (!current || current.id !== id || semitones === 0) return;
      var result = transposed(current, semitones, accidental);
      if (result.unwritable) return;
      store.mutate(function () {
        current.lines.forEach(function (line, i) { line.notes = result.lines[i]; });
        current.signature = result.signature;
      }, ['transpose']);
      dialog.close();
      C.ui.toast(result.out
        ? tr('Canción transportada. {n} notas siguen fuera del rango de la ocarina.', { n: result.out })
        : tr('Canción transportada.'));
    }

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('h2', null, 'Transportar la canción'),
      h('p', null, 'Sube o baja todas las notas el mismo número de semitonos. Se puede deshacer.'),
      h('div', { class: 'transpose-steps' },
        step(-12, '− ' + tr('octava')), step(-1, '− ½'), step(1, '+ ½'), step(12, '+ ' + tr('octava'))),
      valueEl,
      h('div', { class: 'transpose-kinds' }, h('span', null, 'Escribir con'), kind('#', 'Sostenidos ♯'), kind('b', 'Bemoles ♭')),
      infoEl,
      keyEl,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { dialog.close(); } }, 'Cancelar'),
        apply)));
    paint();
    dialog.showModal();
  }

  C.transpose = { open: open, transposed: transposed };
})(window.Songbook = window.Songbook || {});
