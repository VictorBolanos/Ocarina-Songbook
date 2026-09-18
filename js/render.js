(function (C) {
  'use strict';

  var h = C.ui.h;
  var state = C.store.state;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var caretEl = h('span', { class: 'caret', 'aria-hidden': 'true' });
  var dockFolded = false;

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

  // options.button: render as a <button> (editor). options.text: never draw the fingering (palette).
  function chip(code, options) {
    options = options || {};
    var note = C.notes.parse(code);
    var label = C.notes.describe(note);
    var el = h(options.button ? 'button' : 'span', {
      class: 'note' + (note.octave !== 'mid' ? ' note--' + note.octave : ''),
      type: options.button ? 'button' : null,
      role: options.button ? null : 'img',
      'aria-label': label
    });
    var fingering = options.text ? null : C.notes.fingeringId(note);
    if (fingering) {
      // Both the diagram and the name are in the DOM; html[data-view] decides which one shows.
      el.classList.add('note--oc');
      el.appendChild(diagram(fingering));
      el.appendChild(h('span', { class: 'note-name', 'aria-hidden': 'true' }, note.name));
    } else {
      el.appendChild(document.createTextNode(note.name));
      if (note.sharp) el.appendChild(h('sup', null, '♯'));
    }
    return el;
  }

  function pending() {
    return h('span', { class: 'tbd' }, 'Próximamente');
  }

  // ---- Reading view -----------------------------------------------------------------------------
  function rows(song) {
    var box = h('div', { class: 'rows' });
    song.lines.forEach(function (line) {
      if (!line.notes.length && !line.subtitle) return;    // blank lines only exist while editing
      box.appendChild(h('div', { class: 'row' + (line.subtitle ? ' has-title' : '') },
        line.subtitle ? h('h3', null, line.subtitle) : null,
        line.notes.length
          ? h('div', { class: 'line' }, line.notes.map(function (code) { return chip(code); }))
          : pending()));
    });
    if (!box.children.length) box.appendChild(pending());
    return box;
  }

  function readingSong(song) {
    return h('section', { class: 'song', id: song.id },
      h('div', { class: 'song-head' },
        h('h2', null, song.title || 'Sin título', song.meter ? h('span', { class: 'badge' }, song.meter) : null),
        h('div', { class: 'song-actions no-print' },
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

  function editLine(song, line, i) {
    var notes = h('div', { class: 'eline-notes' });
    line.notes.forEach(function (code, j) {
      var note = C.notes.parse(code);
      var body = chip(code, { button: true });
      body.setAttribute('data-key', 'chip:' + i + ':' + j);
      body.setAttribute('aria-label', C.notes.describe(note) + '. Colocar el cursor detrás');
      body.addEventListener('click', function () { C.editor.setCaret(i, j + 1); });
      notes.appendChild(h('span', { class: 'ec' },
        body,
        h('button', {
          type: 'button',
          class: 'ec-x',
          'data-key': 'x:' + i + ':' + j,
          'aria-label': 'Quitar ' + C.notes.describe(note),
          onclick: function () { C.editor.removeNote(i, j); }
        }, C.icons.create('close'))));
    });
    if (!line.notes.length) {
      notes.appendChild(h('span', { class: 'hint hint--on' }, 'Elige notas en la botonera'));
      notes.appendChild(h('span', { class: 'hint hint--off' }, 'Línea vacía'));
    }

    var subtitle = textField({
      type: 'text',
      class: 'input input--sub',
      maxlength: 80,
      value: line.subtitle,
      placeholder: 'Subtítulo de la línea (opcional)',
      'aria-label': 'Subtítulo de la línea ' + (i + 1),
      'data-key': 'sub:' + i
    }, function (value) { line.subtitle = value; });
    subtitle.addEventListener('focus', function () { C.editor.activateLine(i); });

    var row = h('div', { class: 'eline', 'data-line': i },
      h('div', { class: 'eline-top' },
        subtitle,
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          'data-key': 'dl:' + i,
          onclick: function () { C.editor.removeLine(i); }
        }, C.icons.create('remove'), 'Quitar línea')),
      notes);

    // Clicking the empty part of a line puts the caret at its end.
    row.addEventListener('click', function (e) {
      if (e.target.closest('button, input')) return;
      C.editor.setCaret(i, line.notes.length);
    });
    return row;
  }

  function saveStatus() {
    if (state.draft && state.editId === state.draft.id) {
      return 'Canción nueva: se guardará en la carpeta ' + (state.folder.name || 'songs') + '/ cuando pulses Listo (necesita título y al menos una nota).';
    }
    return state.saved
      ? 'Los cambios se guardan solos en la carpeta ' + (state.folder.name || 'songs') + '/.'
      : state.saveError;
  }

  function dock() {
    var paletteRows = C.notes.PALETTE.map(function (group) {
      return h('div', { class: 'pal-row' },
        h('span', { class: 'pal-label' }, group.label),
        h('div', { class: 'pal-notes' }, group.codes.map(function (code) {
          var button = chip(code, { button: true, text: true });
          button.setAttribute('data-key', 'pal:' + code);
          button.setAttribute('aria-label', 'Añadir ' + C.notes.describe(C.notes.parse(code)));
          button.addEventListener('click', function () { C.editor.add(code); });
          return button;
        })));
    });

    var head = h('div', { class: 'dock-head' },
      h('strong', { class: 'dock-title' }, 'Botonera de notas'),
      h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'undo', disabled: !state.undo.length, onclick: C.store.undo }, C.icons.create('undo'), 'Deshacer'),
      h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'redo', disabled: !state.redo.length, onclick: C.store.redo }, C.icons.create('redo'), 'Rehacer'),
      h('button', {
        type: 'button', class: 'btn btn--sm', 'data-key': 'newline', onclick: C.editor.newLine,
        title: 'Salta de línea. Si el cursor está en medio, las notas siguientes pasan a la línea nueva.'
      }, C.icons.create('enter'), 'Nueva línea'),
      h('button', { type: 'button', class: 'btn btn--sm', 'data-key': 'backspace', onclick: C.editor.backspace }, C.icons.create('remove'), 'Borrar nota'),
      h('button', {
        type: 'button', class: 'btn btn--sm', 'data-key': 'fold', 'aria-expanded': String(!dockFolded),
        onclick: function () { dockFolded = !dockFolded; C.store.notify(['fold']); }
      }, C.icons.create(dockFolded ? 'arrow-up' : 'arrow-down'), dockFolded ? 'Mostrar notas' : 'Ocultar notas'),
      h('button', { type: 'button', class: 'btn btn--sm btn--primary', 'data-key': 'done', onclick: C.editor.stop }, C.icons.create('check'), 'Listo'));

    return h('div', { class: 'dock no-print', role: 'group', 'aria-label': 'Botonera de notas' },
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
      return h('span', { class: 'tag tag--free tag--edit' },
        tag,
        h('button', {
          type: 'button',
          class: 'tag-x',
          'data-key': 'tagx:' + i,
          'aria-label': 'Quitar la etiqueta ' + tag,
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

    return h('section', { class: 'song song--editing', id: song.id },
      h('div', { class: 'edit-head' },
        h('label', { class: 'field' }, 'Título', title),
        h('label', { class: 'field' }, 'Compás (opcional)', meter)),
      h('div', { class: 'meta-grid' }, C.categories.list.map(function (category) { return categoryField(song, category); })),
      tagsField(song),
      h('div', { class: 'edit-actions' },
        h('button', { type: 'button', class: 'btn btn--danger btn--sm', 'data-key': 'delsong', onclick: function () { C.editor.removeSong(); } },
          C.icons.create('trash'), song === state.draft ? 'Descartar' : 'Borrar canción')),
      h('div', { class: 'elines' }, song.lines.map(function (line, i) { return editLine(song, line, i); })),
      dock());
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
  }

  // ---- Page -------------------------------------------------------------------------------------
  function songPage(song) {
    return h('div', { class: 'song-page' },
      h('a', { class: 'back', href: '#/', 'data-key': 'back' }, C.icons.create('arrow-back'), 'Canciones'),
      song.id === state.editId ? editableSong(song) : readingSong(song));
  }

  // What to show instead of a page when there is nothing to show: usually a way to connect the folder
  // the songs live in.
  function placeholder() {
    switch (state.folder.status) {
      case 'disconnected':
        return [
          h('p', null, 'Las canciones son archivos .json de la carpeta songs. Conéctala para verlas y editarlas.'),
          h('button', { type: 'button', class: 'btn btn--primary', onclick: C.folder.connect }, C.icons.create('open'), 'Conectar carpeta')
        ];
      case 'needs-permission':
        return [
          h('p', null, 'El navegador necesita tu permiso para leer la carpeta songs.'),
          h('button', { type: 'button', class: 'btn btn--primary', onclick: C.folder.reconnect }, C.icons.create('open'), 'Reconectar carpeta')
        ];
      case 'unsupported':
        return [h('p', null, 'Este navegador no puede leer carpetas del disco. Abre la página con Chrome o Edge.')];
      case 'connected':
        if (state.route.name === 'song') {
          return [
            h('p', null, 'No hay ninguna canción con ese enlace. Puede que se haya borrado o cambiado de nombre.'),
            h('a', { class: 'btn btn--primary', href: '#/' }, C.icons.create('arrow-back'), 'Ver todas las canciones')
          ];
        }
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
    var page = route.name === 'song' ? (song ? songPage(song) : null) : (state.songs.length ? C.home.view() : null);

    var content = document.getElementById('songs');
    content.replaceChildren.apply(content, page ? [page] : []);

    var box = document.getElementById('empty');
    var message = page ? null : placeholder();
    box.replaceChildren.apply(box, message || []);
    box.hidden = !message;

    document.title = song && song.title ? song.title + ' · Cancionero de Ocarina' : 'Cancionero de Ocarina';
    document.getElementById('footer-count').textContent = state.folder.status === 'connected'
      ? state.songs.length + (state.songs.length === 1 ? ' canción' : ' canciones') + ' · ' + (state.folder.name || 'songs') + '/'
      : '';
    placeCaret();

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
  }

  C.render = { init: init, placeCaret: placeCaret };
})(window.Cancionero = window.Cancionero || {});
