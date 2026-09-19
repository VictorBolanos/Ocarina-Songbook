(function (C) {
  'use strict';

  var h = C.ui.h;
  var state = C.store.state;
  var tr = C.i18n.t;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var caretEl = h('span', { class: 'caret', 'aria-hidden': 'true' });
  var dockFolded = null;       // null until the first time the palette is drawn: closed on a phone, open elsewhere

  // The layout of a phone (narrow screens, or short ones such as a phone held sideways). The same query is in the CSS.
  var PHONE = window.matchMedia('(max-width: 640px), (max-height: 560px)');
  function phone() { return PHONE.matches; }

  // ---- Note chips -------------------------------------------------------------------------------
  function diagram(id) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ocarina');
    svg.setAttribute('viewBox', '0 0 200 194');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  // "1/4" as a diagonal fraction (small numerator up, small denominator down); anything else as plain text.
  function fraction(text) {
    var parts = /^(\d+)\/(\d+)$/.exec(text);
    if (!parts) return text;
    return [h('span', { class: 'frac-n' }, parts[1]), h('span', { class: 'frac-s' }, '/'), h('span', { class: 'frac-d' }, parts[2])];
  }

  // options.button: render as a <button> (editor). options.text: never draw the fingering (palette).
  // options.ref: { line, index }, the note's place in the song, so playback can find and highlight it.
  // How the octave is written after a note's name: C' is high, C'' very high, C, low.
  var OCTAVE_MARK = { high: "'", high2: "''", low: ',' };

  function chip(code, options) {
    options = options || {};
    var note = C.notes.parse(code);
    var label = C.notes.describe(note);
    var el = h(options.button ? 'button' : 'span', {
      class: 'note' + (note.rest ? ' note--rest' : (note.octave !== 'mid' ? ' note--' + note.octave : '')) +
        (note.accidental ? (note.accidental === 'b' ? ' note--flat' : ' note--sharp') : ''),
      type: options.button ? 'button' : null,
      role: options.button ? null : 'img',
      'aria-label': label,
      'data-note': options.ref ? options.ref.line + ':' + options.ref.index : null
    });
    var fingering = options.text ? null : C.notes.fingeringId(note);
    if (note.rest) {
      el.appendChild(document.createTextNode('\u2014'));
    } else if (fingering) {
      // Both the diagram and the name are in the DOM; html[data-view] decides which one shows.
      el.classList.add('note--oc');
      el.appendChild(diagram(fingering));
      el.appendChild(h('span', { class: 'note-name', 'aria-hidden': 'true' }, C.i18n.noteName(note.name) + C.notes.glyph(note.accidental) + (OCTAVE_MARK[note.octave] || '')));
    } else {
      // The accidental sits to the right of the name, on the same line.
      el.appendChild(h('span', { class: 'note-label' },
        C.i18n.noteName(note.name),
        note.accidental ? h('span', { class: 'note-acc' }, C.notes.glyph(note.accidental)) : null,
        OCTAVE_MARK[note.octave] ? h('span', { class: 'note-oct' }, OCTAVE_MARK[note.octave]) : null));
    }
    var length = options.text ? '' : C.notes.badge(note);
    if (length) el.appendChild(h('span', { class: 'note-dur', 'aria-hidden': 'true' }, fraction(length)));
    return el;
  }

  function pending() {
    return h('span', { class: 'tbd' }, 'Próximamente');
  }

  // ---- Reading view -----------------------------------------------------------------------------
  function rows(song) {
    var box = h('div', { class: 'rows' });
    song.lines.forEach(function (line, li) {
      if (!line.notes.length && !line.subtitle) return;    // blank lines only exist while editing
      box.appendChild(h('div', { class: 'row' + (line.subtitle ? ' has-title' : '') },
        line.subtitle ? h('h3', { translate: 'no' }, line.subtitle) : null,
        line.notes.length
          ? h('div', { class: 'line' }, line.notes.map(function (code, ni) {
            var el = chip(code, { ref: { line: li, index: ni } });
            el.title = 'Reproducir desde aquí';
            el.addEventListener('click', function () { C.player.noteClicked(li, ni); });
            return el;
          }))
          : pending()));
    });
    if (!box.children.length) box.appendChild(pending());
    return box;
  }

  // The song's key, e.g. "La♭ mayor / Fa menor": both names until the last note says which one it is.
  function keyBadge(song) {
    var key = C.keys.describe(song.signature, song);
    return h('span', { class: 'badge badge--key', title: 'Tonalidad' }, key.text);
  }

  function readingSong(song) {
    return h('section', { class: 'song', id: song.id },
      h('div', { class: 'song-head' },
        h('h2', null, h('span', { translate: 'no' }, song.title || tr('Sin título')),
          song.meter ? h('span', { class: 'badge' }, song.meter) : null,
          h('span', { class: 'badge', title: 'Tempo' }, (song.bpm || 100) + ' BPM'),
          keyBadge(song)),
        !C.store.canEdit() ? null : h('div', { class: 'song-actions no-print' },
          h('button', {
            type: 'button',
            class: 'btn btn--ghost',
            'data-key': 'duplicate:' + song.id,
            title: 'Duplicar para hacer una variante',
            onclick: function () { C.editor.duplicateSong(song.id); }
          }, C.icons.create('copy'), 'Duplicar'),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost btn--danger',
            'data-key': 'delete:' + song.id,
            onclick: function () { C.editor.removeSong(song.id); }
          }, C.icons.create('trash'), 'Borrar'),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost',
            'data-key': 'edit:' + song.id,
            onclick: function () { C.editor.start(song.id); }
          }, C.icons.create('edit'), 'Editar'))),
      C.home.chips(song),
      rows(song));
  }

  // ---- Editing view -----------------------------------------------------------------------------
  // A text field that updates the model as you type without redrawing.
  function textField(props, apply) {
    var input = h('input', props);
    input.addEventListener('input', function () {
      C.store.typing(function () { apply(input.value); });
    });
    input.addEventListener('change', C.store.flushText);
    return input;
  }

  function subtitleField(line, i) {
    var subtitle = textField({
      type: 'text',
      class: 'input input--sub',
      maxlength: 80,
      value: line.subtitle,
      placeholder: 'Subtítulo de la línea (opcional)',
      'aria-label': tr('Subtítulo de la línea {n}', { n: i + 1 }),
      'data-key': 'sub:' + i
    }, function (value) { line.subtitle = value; });
    subtitle.addEventListener('focus', function () { C.editor.activateLine(i); });
    return subtitle;
  }

  function iconButton(icon, label, key, disabled, run) {
    return h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm btn--icon',
      'data-key': key,
      title: label,
      'aria-label': label,
      disabled: disabled,
      onclick: run
    }, C.icons.create(icon));
  }

  // Move up, move down, duplicate and remove, for line `i` of `total`.
  function lineControls(i, total) {
    return h('span', { class: 'eline-tools' },
      iconButton('arrow-up', 'Subir la línea (Alt + ↑)', 'up:' + i, i === 0, function () { C.editor.moveLine(i, i - 1); }),
      iconButton('arrow-down', 'Bajar la línea (Alt + ↓)', 'down:' + i, i === total - 1, function () { C.editor.moveLine(i, i + 1); }),
      iconButton('copy', 'Duplicar la línea (Alt + Mayús + ↓)', 'dup:' + i, false, function () { C.editor.duplicateLine(i); }),
      h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        'data-key': 'dl:' + i,
        'aria-label': 'Quitar línea',
        onclick: function () { C.editor.removeLine(i); }
      }, C.icons.create('remove'), label('Quitar línea')));
  }

  // ---- Dragging lines to reorder them ------------------------------------------------------------
  // The line number is the handle. While dragging, the line under the pointer shows a bar above or below
  // it, depending on which half the pointer is in; dropping there moves the line.
  var dragFrom = null;
  var dropTarget = null;      // { row, before }

  function clearDrop() {
    document.querySelectorAll('.eline.drop-before, .eline.drop-after').forEach(function (el) {
      el.classList.remove('drop-before', 'drop-after');
    });
    dropTarget = null;
  }

  function lineHandle(i, row) {
    var handle = h('span', {
      class: 'eline-num',
      draggable: 'true',
      title: 'Arrastra para mover la línea',
      'aria-hidden': 'true'
    }, String(i + 1));
    handle.addEventListener('dragstart', function (e) {
      dragFrom = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'line ' + (i + 1));
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 24, 24);
      setTimeout(function () { row.classList.add('is-dragging'); }, 0);
    });
    handle.addEventListener('dragend', function () {
      dragFrom = null;
      row.classList.remove('is-dragging');
      clearDrop();
    });
    return handle;
  }

  function makeDropZone(row, i) {
    row.addEventListener('dragover', function (e) {
      if (dragFrom === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var box = row.getBoundingClientRect();
      var before = e.clientY < box.top + box.height / 2;
      if (dropTarget && dropTarget.row === row && dropTarget.before === before) return;
      clearDrop();
      row.classList.add(before ? 'drop-before' : 'drop-after');
      dropTarget = { row: row, before: before };
    });
    row.addEventListener('dragleave', function (e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('drop-before', 'drop-after');
    });
    row.addEventListener('drop', function (e) {
      if (dragFrom === null) return;
      e.preventDefault();
      var from = dragFrom;
      var slot = i + (dropTarget && !dropTarget.before ? 1 : 0);     // the gap the line is dropped into
      dragFrom = null;
      clearDrop();
      C.editor.moveLine(from, slot > from ? slot - 1 : slot);
    });
  }

  function editLine(song, line, i) {
    var notes = h('div', { class: 'eline-notes' });
    line.notes.forEach(function (code, j) {
      var note = C.notes.parse(code);
      var body = chip(code, { button: true, ref: { line: i, index: j } });
      body.setAttribute('data-key', 'chip:' + i + ':' + j);
      body.setAttribute('aria-label', tr('{note}. Colocar el cursor detrás', { note: C.notes.describe(note) }));
      body.addEventListener('click', function () { C.editor.setCaret(i, j + 1, true); });
      notes.appendChild(h('span', { class: 'ec' },
        body,
        h('button', {
          type: 'button',
          class: 'ec-x',
          'data-key': 'x:' + i + ':' + j,
          'aria-label': tr('Quitar {note}', { note: C.notes.describe(note) }),
          onclick: function () { C.editor.removeNote(i, j); }
        }, C.icons.create('close'))));
    });
    if (!line.notes.length) {
      notes.appendChild(h('span', { class: 'hint hint--on' }, 'Elige notas en la botonera'));
      notes.appendChild(h('span', { class: 'hint hint--off' }, 'Línea vacía'));
    }

    var row = h('div', { class: 'eline', 'data-line': i });
    row.appendChild(h('div', { class: 'eline-top' }, lineHandle(i, row), subtitleField(line, i), lineControls(i, song.lines.length)));
    row.appendChild(notes);
    makeDropZone(row, i);

    // Clicking the empty part of a line puts the caret at its end.
    row.addEventListener('click', function (e) {
      if (e.target.closest('button, input')) return;
      C.editor.setCaret(i, line.notes.length);
    });
    return row;
  }

  function saveStatus() {
    if (state.draft && state.editId === state.draft.id) {
      var folder = state.folder.name || 'songs';
      return C.editor.isNewDraft()
        ? tr('Canción nueva: se guardará en la carpeta {folder}/ cuando pulses Listo (necesita título y al menos una nota).', { folder: folder })
        : tr('Los cambios no se guardan en la carpeta {folder}/ hasta que pulses Listo. Cancelar (o Esc) los descarta.', { folder: folder });
    }
    return state.saved
      ? tr('Los cambios se guardan solos en la carpeta {folder}/.', { folder: state.folder.name || 'songs' })
      : state.saveError;
  }

  function paletteButton(code) {
    var button = chip(code, { button: true, text: true });
    button.setAttribute('data-key', 'pal:' + code);
    button.setAttribute('aria-label', tr('Añadir {note}', { note: C.notes.describe(C.notes.parse(code)) }));
    button.addEventListener('click', function () { C.editor.add(code); });
    return button;
  }

  // The "Alteraciones" row offers the accidentals of the song's kind (flats or sharps), in the middle octave.
  function accidentalsRow(group, song, withRest) {
    var codes = C.keys.accidentalCodes(song.signature, 'mid');
    return h('div', { class: 'pal-row' },
      h('span', { class: 'pal-label' }, group.octave ? C.i18n.octave(group.octave) : group.label),
      h('div', { class: 'pal-notes' + (withRest ? ' pal-notes--rest' : '') },
        codes.length ? codes.map(paletteButton) : h('span', { class: 'pal-empty' }, 'La canción no usa alteraciones. Puedes cambiarlo con «Tonalidad».'),
        withRest ? paletteButton('R') : null));
  }

  // The "i" next to the palette's title: hovering (or focusing) it lists how to write with the keyboard.
  var KEYBOARD_HELP = [
    ['1 – 7', 'Do Re Mi Fa Sol La Si, en la octava de la nota anterior'],
    ['0', 'Silencio'],
    ['+  o  #', 'Sostenido en la nota anterior (si la canción usa sostenidos)'],
    ['-  o  b', 'Bemol en la nota anterior (si la canción usa bemoles)'],
    ['↑  ↓', 'Subir o bajar una octava la nota anterior'],
    ['s  e  q  h  w', 'Duración: semicorchea, corchea, negra, blanca, redonda'],
    ['.', 'Puntillo'],
    ['←  →', 'Mover el cursor (y elegir la nota para Reproducir)'],
    ['Inicio  Fin', 'Ir al principio o al final de la línea'],
    ['Retroceso  Supr', 'Borrar una nota'],
    ['Enter', 'Nueva línea'],
    ['Alt + ↑  ↓', 'Mover la línea (Alt + Mayús + ↓ la duplica)'],
    ['Ctrl + Z  /  Ctrl + Y', 'Deshacer y rehacer'],
    ['Ctrl + Enter', 'Listo (guardar)'],
    ['Esc', 'Cancelar y descartar los cambios']
  ];

  function keyboardHelp() {
    var tip = h('span', { class: 'info-tip', tabindex: '0', 'data-key': 'keyboard-help', 'aria-label': 'Cómo escribir con el teclado' });
    // Opens upwards (the palette sits at the bottom of the screen), or downwards when there is no room above.
    function place() {
      var pop = tip.querySelector('.info-pop');
      tip.classList.remove('is-below');
      if (tip.getBoundingClientRect().top < (pop.offsetHeight || 340) + 24) tip.classList.add('is-below');
    }
    tip.addEventListener('mouseenter', place);
    tip.addEventListener('focus', place);
    return append(tip,
      C.icons.create('info'),
      h('span', { class: 'info-pop', role: 'tooltip' },
        h('strong', null, 'Escribir con el teclado'),
        h('dl', null, KEYBOARD_HELP.map(function (row) {
          return [h('dt', null, row[0]), h('dd', null, row[1])];
        }))));
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i++) parent.appendChild(arguments[i]);
    return parent;
  }

  // On a phone the palette is fixed to the bottom of the screen. The glass cards of the page (backdrop filter)
  // would make a fixed element sit inside them, so there it is drawn in #dock-root, outside the page.
  var phoneDock = null;

  function inlineDock(song) {
    var element = dock(song);
    if (phone()) {
      phoneDock = element;
      return null;
    }
    phoneDock = null;
    return element;
  }

  // A text next to an icon; on a phone the text is hidden and the button keeps its name for screen readers.
  function label(text) {
    return h('span', { class: 'btn-label' }, text);
  }

  function phoneIcon(name) {
    var icon = C.icons.create(name);
    icon.setAttribute('class', 'icon phone-only');
    return icon;
  }

  function dock(song) {
    if (dockFolded === null) dockFolded = phone();
    var onPhone = phone();
    var paletteRows = [durationRow()];
    C.notes.PALETTE.forEach(function (group) {
      if (group.accidentals) {
        paletteRows.push(accidentalsRow(group, song, onPhone));
      } else if (onPhone && group.codes.length === 1 && group.codes[0] === 'R') {
        return;                                                  // the rest button is in the accidentals row
      } else {
        paletteRows.push(h('div', { class: 'pal-row' },
          h('span', { class: 'pal-label' }, group.octave ? C.i18n.octave(group.octave) : group.label),
          h('div', { class: 'pal-notes' }, group.codes.map(paletteButton))));
      }
    });

    var head = h('div', { class: 'dock-head' },
      h('div', { class: 'dock-info' },
        h('strong', { class: 'dock-title' }, 'Botonera de notas'),
        keyboardHelp(),
        h('span', { class: 'dock-key', title: 'Tonalidad' }, keyText(song))),
      h('div', { class: 'dock-tools' },
        h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'undo', 'aria-label': 'Deshacer', disabled: !state.undo.length, onclick: C.store.undo }, C.icons.create('undo'), label('Deshacer')),
        h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'redo', 'aria-label': 'Rehacer', disabled: !state.redo.length, onclick: C.store.redo }, C.icons.create('redo'), label('Rehacer')),
        h('button', {
          type: 'button', class: 'btn btn--sm', 'data-key': 'newline', 'aria-label': 'Nueva línea', onclick: C.editor.newLine,
          title: 'Salto de línea, para leer mejor: no añade tiempo al reproducir. Si el cursor está en medio, las notas siguientes pasan a la línea nueva.'
        }, C.icons.create('enter'), label('Nueva línea')),
        h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'backspace', 'aria-label': 'Borrar nota', onclick: C.editor.backspace }, C.icons.create('remove'), label('Borrar nota')),
        h('button', {
          type: 'button', class: 'btn btn--sm dock-fold', 'data-key': 'fold', 'aria-expanded': String(!dockFolded),
          'aria-label': dockFolded ? 'Mostrar notas' : 'Ocultar notas',
          onclick: function () { dockFolded = !dockFolded; C.store.notify(['fold']); }
        }, C.icons.create(dockFolded ? 'arrow-up' : 'arrow-down'), label(dockFolded ? 'Mostrar notas' : 'Ocultar notas'))),
      h('span', { class: 'dock-finish' },
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost', 'data-key': 'cancel-edit', 'aria-label': 'Cancelar', onclick: C.editor.cancel }, phoneIcon('close'), label('Cancelar')),
        h('button', {
          type: 'button', class: 'btn btn--done', 'data-key': 'done', 'aria-label': 'Listo', onclick: C.editor.stop,
          title: 'Guardar la canción en la carpeta'
        }, C.icons.create('check'), label('Listo'))));

    return h('div', { class: 'dock no-print' + (dockFolded ? ' is-folded' : ''), role: 'group', 'aria-label': 'Botonera de notas' },
      head,
      dockFolded ? null : h('div', { class: 'pal' }, paletteRows),
      h('p', { class: 'dock-status' + (state.saved ? '' : ' is-error'), role: 'status' }, saveStatus()));
  }

  function categoryField(song, category) {
    var select = h('select', {
      class: 'input',
      'aria-label': category.label,
      'data-key': 'cat:' + category.key,
      onchange: function () { C.editor.setCategory(category.key, select.value); }
    },
      h('option', { value: '' }, 'Sin definir'),
      category.options.map(function (option) { return h('option', { value: option[0] }, option[1]); }));
    select.value = song[category.key];
    return h('label', { class: 'field' }, category.label, select);
  }

  // Free-form labels: type one and press Enter (or comma) to add it; the x on a label removes it.
  function tagsField(song) {
    var input = h('input', {
      type: 'text',
      class: 'input tag-input',
      maxlength: 24,
      list: 'tag-suggestions',
      placeholder: 'Escribe y pulsa Intro',
      'aria-label': 'Añadir etiqueta',
      'data-key': 'tagin'
    });

    function commit() {
      var value = input.value;
      input.value = '';
      if (value.trim()) C.editor.addTag(value);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Backspace' && !input.value && song.tags.length) {
        C.editor.removeTag(song.tags.length - 1);
      }
    });

    var labels = song.tags.map(function (tag, i) {
      return h('span', { class: 'tag tag--free tag--edit', translate: 'no' },
        tag,
        h('button', {
          type: 'button',
          class: 'tag-x',
          'data-key': 'tagx:' + i,
          'aria-label': tr('Quitar la etiqueta {tag}', { tag: tag }),
          onclick: function () { C.editor.removeTag(i); }
        }, C.icons.create('close')));
    });

    return h('div', { class: 'field' },
      'Etiquetas',
      h('div', { class: 'tags-edit' },
        labels,
        input,
        h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'tagadd', onclick: commit }, C.icons.create('plus'), 'Añadir')),
      h('datalist', { id: 'tag-suggestions' }, C.store.allTags().map(function (entry) {
        return h('option', { value: entry.tag });
      })));
  }

  function keyText(song) {
    return C.keys.describe(song.signature, song).text;
  }

  // Shows the key and opens the picker to change it.
  function keyField(song) {
    var button = h('button', {
      type: 'button',
      class: 'input key-button',
      'data-key': 'signature',
      onclick: function () { C.editor.changeSignature(); }
    },
      h('span', { class: 'key-name' }, keyText(song)),
      h('span', { class: 'key-acc' }, C.keys.typeLabel(song.signature)),
      h('span', { class: 'key-change' }, C.icons.create('edit'), 'Cambiar'));
    return h('div', { class: 'field' }, 'Tonalidad', button);
  }

  function editableSong(song) {
    var title = textField({
      type: 'text',
      class: 'input input--title',
      maxlength: 80,
      value: song.title,
      placeholder: 'Título de la canción',
      'aria-label': 'Título de la canción',
      'data-key': 'title'
    }, function (value) { song.title = value; });

    var meter = textField({
      type: 'text',
      class: 'input',
      maxlength: 12,
      value: song.meter,
      placeholder: 'ej. 3/4',
      'aria-label': 'Compás de la canción (opcional)',
      'data-key': 'meter'
    }, function (value) { song.meter = value; });

    var bpm = textField({
      type: 'number',
      class: 'input',
      min: 30,
      max: 240,
      step: 1,
      value: song.bpm,
      'aria-label': 'Tempo en pulsaciones por minuto',
      'data-key': 'bpm'
    }, function (value) { song.bpm = C.store.cleanBpm(value); });

    return h('section', { class: 'song song--editing', id: song.id },
      h('div', { class: 'edit-head' },
        h('label', { class: 'field' }, 'Título', title),
        h('label', { class: 'field' }, 'Compás (opcional)', meter),
        h('label', { class: 'field' }, 'Tempo (BPM)', bpm)),
      keyField(song),
      h('div', { class: 'meta-grid' }, C.categories.list.map(function (category) { return categoryField(song, category); })),
      tagsField(song),
      h('div', { class: 'edit-actions' },
        h('button', { type: 'button', class: 'btn btn--danger btn--sm', 'data-key': 'delsong', onclick: function () { C.editor.removeSong(); } },
          C.icons.create('trash'), C.editor.isNewDraft() ? 'Descartar' : 'Borrar canción')),
      C.player.view(song),
      h('div', { class: 'elines' }, song.lines.map(function (line, i) { return editLine(song, line, i); })),
      inlineDock(song));
  }

  // ---- Caret ------------------------------------------------------------------------------------
  // The caret is one element that is moved around, so moving it never redraws anything.
  function placeCaret() {
    var lines = document.querySelectorAll('.eline');
    if (!lines.length) return;
    lines.forEach(function (el, i) { el.classList.toggle('is-active', i === state.caret.line); });
    var box = lines[state.caret.line] && lines[state.caret.line].querySelector('.eline-notes');
    if (!box) return;
    var chips = box.querySelectorAll('.ec');
    box.insertBefore(caretEl, chips[state.caret.pos] || (chips.length ? null : box.firstChild));

    // The note just before the caret is the selected one: ringed on screen, and its value is what the
    // duration buttons show.
    document.querySelectorAll('.ec.is-selected').forEach(function (el) { el.classList.remove('is-selected'); });
    if (state.caret.pos > 0 && chips[state.caret.pos - 1]) chips[state.caret.pos - 1].classList.add('is-selected');
    syncDuration();
    keepCaretInView();
  }

  // A phone held sideways puts the open palette in a panel on the right instead of across the bottom.
  function dockIsSide(dock) {
    return getComputedStyle(dock).position === 'fixed' && dock.offsetWidth < window.innerWidth - 2;
  }

  // The palette covers part of the screen: if the line being written is under it, scroll it clear.
  function keepCaretInView() {
    var dock = document.querySelector('.dock');
    var line = document.querySelector('.eline.is-active');
    if (!dock || !line) return;
    var limit = dockIsSide(dock) ? window.innerHeight : dock.getBoundingClientRect().top - 12;
    var covered = line.getBoundingClientRect().bottom - limit;
    if (covered > 0) window.scrollBy({ top: covered + 8, behavior: 'instant' });
  }

  // The size of the palette, for the page's padding and the position of the messages.
  var dockObserver = null;
  var observedDock = null;

  function syncDockHeight() {
    var dock = document.querySelector('.dock');
    var fixed = !!dock && getComputedStyle(dock).position === 'fixed';
    var side = fixed && dockIsSide(dock);
    document.documentElement.style.setProperty('--dock-h', fixed && !side ? dock.offsetHeight + 'px' : '0px');
    document.documentElement.style.setProperty('--dock-w', side ? dock.offsetWidth + 'px' : '0px');
    if (dock === observedDock || !window.ResizeObserver) return;
    if (dockObserver) dockObserver.disconnect();
    observedDock = dock;
    if (dock) {
      dockObserver = dockObserver || new ResizeObserver(syncDockHeight);
      dockObserver.observe(dock);
    }
  }

  // ---- Note values ------------------------------------------------------------------------------
  var BEAT_TEXT = { 0.25: '1/4', 0.5: '1/2', 1: '1', 2: '2', 4: '4' };

  function durationRow() {
    var current = C.editor.currentDuration();
    var buttons = C.notes.DURATIONS.map(function (d) {
      return h('button', {
        type: 'button',
        class: 'dur-btn',
        'data-key': 'dur:' + d.key,
        'data-dur': d.key,
        'aria-pressed': String(current.key === d.key),
        title: tr('{label} ({beats})', { label: tr(d.label), beats: d.beats === 1 ? tr('1 tiempo') : tr('{n} tiempos', { n: BEAT_TEXT[d.beats] }) }),
        onclick: function () { C.editor.setDuration(d.key); }
      }, h('span', { class: 'dur-val' }, fraction(BEAT_TEXT[d.beats])), h('span', { class: 'dur-name' }, d.label));
    });
    var dot = h('button', {
      type: 'button',
      class: 'dur-btn',
      'data-key': 'dur-dot',
      'data-dot': '',
      'aria-pressed': String(current.dotted),
      title: 'Puntillo: alarga la nota la mitad de su valor',
      onclick: C.editor.toggleDot
    }, h('span', { class: 'dur-val' }, '\u00B7'), h('span', { class: 'dur-name' }, 'Puntillo'));
    return h('div', { class: 'pal-row' },
      h('span', { class: 'pal-label' }, 'Duración'),
      h('div', { class: 'pal-notes dur-row' }, buttons, dot));
  }

  // Follows the caret: the buttons show the value of the selected note (or the default).
  function syncDuration() {
    var current = C.editor.currentDuration();
    document.querySelectorAll('.dur-btn[data-dur]').forEach(function (el) {
      el.setAttribute('aria-pressed', String(el.getAttribute('data-dur') === current.key));
    });
    var dot = document.querySelector('.dur-btn[data-dot]');
    if (dot) dot.setAttribute('aria-pressed', String(current.dotted));
  }

  // ---- Page -------------------------------------------------------------------------------------
  function songPage(song) {
    return h('div', { class: 'song-page' },
      h('a', { class: 'back', href: '#/', 'data-key': 'back' }, C.icons.create('arrow-back'), 'Canciones'),
      song.id === state.editId ? null : C.player.view(song),
      song.id === state.editId ? editableSong(song) : readingSong(song));
  }

  // What to show instead of a page when there is nothing to show: usually a way to connect the folder
  // the songs live in.
  function placeholder() {
    switch (state.folder.status) {
      case 'disconnected':
        return [
          h('p', null, 'Las canciones son archivos .json de la carpeta songs. Conéctala para verlas y editarlas.'),
          h('button', { type: 'button', class: 'btn btn--primary', onclick: C.folder.connect }, C.icons.create('open'), 'Conectar carpeta'),
          h('p', { class: 'empty-note' }, location.protocol === 'file:'
            ? 'La página está abierta desde el disco (file://): así solo puede leer las canciones si conectas la carpeta. Publicada en la web (por ejemplo en GitHub Pages) las muestra sola, en modo solo lectura.'
            : 'No se han encontrado canciones publicadas junto a la página (falta songs/index.json).')
        ];
      case 'needs-permission':
        return [
          h('p', null, 'El navegador necesita tu permiso para leer la carpeta songs.'),
          h('button', { type: 'button', class: 'btn btn--primary', onclick: C.folder.reconnect }, C.icons.create('open'), 'Reconectar carpeta')
        ];
      case 'unsupported':
        return [h('p', null, 'Este navegador no puede leer carpetas del disco. Abre la página con Chrome o Edge.')];
      case 'readonly':
      case 'connected':
        if (state.route.name === 'song') {
          return [
            h('p', null, 'No hay ninguna canción con ese enlace. Puede que se haya borrado o cambiado de nombre.'),
            h('a', { class: 'btn btn--primary', href: '#/' }, C.icons.create('arrow-back'), 'Ver todas las canciones')
          ];
        }
        if (state.folder.status === 'readonly') return [h('p', null, 'Todavía no hay canciones publicadas.')];
        return [h('p', null, 'La carpeta no tiene canciones todavía. Crea la primera.'), C.home.newSongButton()];
      default:
        return null;                        // still checking
    }
  }

  // Redraws the page. Cheap at this size, and it keeps the DOM a pure function of the state.
  // Focus is put back on the same control (matched by data-key) so keyboard use isn't interrupted.
  function all(focusKeys) {
    var active = document.activeElement;
    var keys = focusKeys || (active && active.dataset && active.dataset.key ? [active.dataset.key] : []);
    var selection = active && typeof active.selectionStart === 'number'
      ? [active.selectionStart, active.selectionEnd] : null;

    var route = state.route;
    var song = route.name === 'song' ? C.store.songById(route.id) : null;
    var page = route.name === 'song' ? (song ? songPage(song) : null)
      : route.name === 'fingerings' ? C.fingeringPage.view()
      : (state.songs.length ? C.home.view() : null);

    var content = document.getElementById('songs');
    content.replaceChildren.apply(content, page ? [page] : []);

    var box = document.getElementById('empty');
    var message = page ? null : placeholder();
    box.replaceChildren.apply(box, message || []);
    box.hidden = !message;

    document.title = song && song.title ? song.title + ' · Ocarina Songbook'
      : (route.name === 'fingerings' ? tr('Digitaciones · Ocarina Songbook') : 'Ocarina Songbook');
    var count = state.songs.length === 1 ? tr('1 canción') : tr('{n} canciones', { n: state.songs.length });
    document.getElementById('footer-count').textContent = state.folder.status === 'connected'
      ? count + ' · ' + (state.folder.name || 'songs') + '/'
      : (state.folder.status === 'readonly' ? count + tr(' · solo lectura') : '');
    var dockRoot = document.getElementById('dock-root');
    dockRoot.replaceChildren.apply(dockRoot, phoneDock && song && song.id === state.editId ? [phoneDock] : []);
    placeCaret();
    syncDockHeight();
    C.audio.refreshHighlight();
    C.player.markStretch();

    for (var i = 0; i < keys.length; i++) {
      var target = document.querySelector('[data-key="' + keys[i] + '"]');
      if (!target || target.disabled) continue;
      target.focus({ preventScroll: true });
      if (state.selectKey === keys[i] && typeof target.select === 'function') {
        target.select();
      } else if (selection && active && keys[i] === active.dataset.key && typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(selection[0], selection[1]);
      }
      break;
    }
    state.selectKey = null;
  }

  function init() {
    C.store.subscribe(all);
    // Crossing into or out of the phone layout (turning the phone, resizing the window) redraws the palette.
    if (PHONE.addEventListener) PHONE.addEventListener('change', function () { dockFolded = null; C.store.notify(); });
    window.addEventListener('resize', syncDockHeight);
  }

  C.render = { init: init, placeCaret: placeCaret };
})(window.Songbook = window.Songbook || {});
