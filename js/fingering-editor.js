(function (C) {
  'use strict';

  // The fingering editor: pick a note, then click the holes of the ocarina that are covered for it.
  // Everything is edited on a copy; "Listo" writes songs/fingerings.json and redraws the page, "Cancelar"
  // (or Esc) throws the changes away. A note with no fingering starts with every hole open.
  var h = C.ui.h;
  var tr = C.i18n.t;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var OCTAVES = [
    { key: 'high', label: 'Aguda' },
    { key: 'mid',  label: 'Media' },
    { key: 'low',  label: 'Grave' }
  ];
  var ACCIDENTALS = [
    { key: '',  label: 'Natural' },
    { key: '#', label: 'Sostenido ♯' },
    { key: 'b', label: 'Bemol ♭' }
  ];

  var sel = { octave: 'mid', name: 'Do', accidental: '' };
  var work = null;              // the copy being edited: key -> holes
  var original = '';            // JSON of the fingerings when the window was opened
  var refs = null;

  function dialogEl() {
    return document.getElementById('fingering-dialog');
  }

  function currentKey() {
    return C.notes.build(sel.name, sel.accidental, sel.octave);
  }

  function has(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  // The fingering of `key` in the copy being edited ({ holes, done }): the user's, else the built-in one.
  function entryOf(key) {
    return C.fingering.entryOf(key, work);
  }

  function holesOf(key) {
    var entry = entryOf(key);
    return entry ? entry.holes : null;
  }

  function isDone(key) {
    var entry = entryOf(key);
    return !!entry && entry.done;
  }

  // The entry to change for `key`: made from the built-in fingering if that is what it has, or empty (and
  // not done) for a note with none.
  function editable(key) {
    if (!has(work, key)) {
      var base = entryOf(key);
      work[key] = { holes: base ? base.holes.slice() : [], done: base ? base.done : false };
    }
    return work[key];
  }

  function isDirty() {
    return JSON.stringify(C.fingering.sanitize(work)) !== original;
  }

  function label(key) {
    var note = C.notes.parse(key);
    return C.i18n.noteName(note.name) + C.notes.glyph(note.accidental) + C.notes.displayMark(note.octave) + ' · ' + C.i18n.octave(note.octave).toLowerCase();
  }

  // ---- The picture ---------------------------------------------------------------------------------------
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (name) { el.setAttribute(name, attrs[name]); });
    return el;
  }

  function toggleHole(n) {
    var entry = editable(currentKey());
    var at = entry.holes.indexOf(n);
    if (at >= 0) entry.holes.splice(at, 1); else entry.holes.push(n);
    entry.holes.sort(function (a, b) { return a - b; });
    sync();
  }

  function board() {
    var picture = svg('svg', { class: 'fp-ocarina', viewBox: '0 0 ' + C.fingering.BASE.width + ' ' + C.fingering.BASE.height, role: 'group', 'aria-label': 'Agujeros de la ocarina' });
    var image = svg('image', { href: C.fingering.BASE.href, width: C.fingering.BASE.width, height: C.fingering.BASE.height });
    image.setAttribute('style', 'filter: var(--oc-halo)');
    picture.appendChild(image);
    refs.holes = {};
    C.fingering.HOLES.forEach(function (hole) {
      var group = svg('g', { class: 'fp-hole', tabindex: '0', role: 'button', 'aria-label': tr('Agujero {n}', { n: hole.n }), 'data-hole': hole.n });
      var title = svg('title');
      title.textContent = tr('Agujero {n}', { n: hole.n });
      group.appendChild(title);
      group.appendChild(svg('circle', { class: 'fp-ring', cx: hole.cx, cy: hole.cy, r: hole.r + 2.4 }));
      group.appendChild(svg('circle', { class: 'fp-fill', cx: hole.cx, cy: hole.cy, r: hole.r, style: 'fill: var(--hole, #161616); stroke: #161616; stroke-width: 1.6' }));
      group.addEventListener('click', function () { toggleHole(hole.n); });
      group.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleHole(hole.n); }
      });
      picture.appendChild(group);
      refs.holes[hole.n] = group;
    });
    return picture;
  }

  // ---- The note picker --------------------------------------------------------------------------------------
  function choice(items, current, onPick, extra) {
    return h('div', { class: 'fp-choice', role: 'group' }, items.map(function (item) {
      var button = h('button', {
        type: 'button',
        class: 'dur-btn',
        'aria-pressed': String(current() === item.key),
        'data-value': item.key,
        onclick: function () { onPick(item.key); }
      }, h('span', { class: 'dur-val' }, item.label), extra ? extra(item) : null);
      return button;
    }));
  }

  function pressAll(container, value) {
    container.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === value));
    });
  }

  function statusText(key) {
    var entry = entryOf(key);
    if (!entry) return 'Sin digitación todavía: todos los agujeros destapados';
    if (!entry.done) return 'En progreso: las canciones muestran el nombre de esta nota';
    if (has(work, key)) return C.fingering.DEFAULTS[key] ? 'Digitación propia (cambia la de fábrica)' : 'Digitación propia';
    return 'Digitación de fábrica';
  }

  // Brings everything on screen up to date with the selection and the copy being edited.
  function sync() {
    var key = currentKey();
    var holes = holesOf(key) || [];
    pressAll(refs.octaves, sel.octave);
    pressAll(refs.names, sel.name);
    pressAll(refs.accidentals, sel.accidental);
    refs.names.querySelectorAll('button').forEach(function (b) {
      var name = b.getAttribute('data-value');
      var k = C.notes.build(name, sel.accidental, sel.octave);
      b.querySelector('.dur-val').textContent = C.i18n.noteName(name) + C.notes.displayMark(sel.octave);   // C' D' E' in the high octave
      b.classList.toggle('has-fingering', isDone(k));                  // finished
      b.classList.toggle('is-draft', !!entryOf(k) && !isDone(k));      // started, not finished
    });
    Object.keys(refs.holes).forEach(function (n) {
      var on = holes.indexOf(Number(n)) >= 0;
      refs.holes[n].classList.toggle('is-on', on);
      refs.holes[n].setAttribute('aria-pressed', String(on));
    });
    refs.title.textContent = label(key);
    refs.status.textContent = statusText(key);
    refs.count.textContent = holes.length === 1 ? tr('1 agujero tapado') : tr('{n} agujeros tapados', { n: holes.length });
    refs.finished.checked = isDone(key);
    refs.remove.disabled = !has(work, key);
    refs.remove.textContent = C.fingering.DEFAULTS[key] ? 'Volver a la de fábrica' : 'Quitar digitación';
    refs.clear.disabled = holes.length === 0;

    var options = C.fingering.allKeys(work).filter(function (k) { return k !== key && entryOf(k); });
    refs.copy.replaceChildren.apply(refs.copy, [h('option', { value: '' }, 'Copiar de…')].concat(options.map(function (k) {
      return h('option', { value: k }, label(k));
    })));
    refs.copy.value = '';
    refs.done.disabled = !isDirty();
  }

  function pick(field, value) {
    sel[field] = value;
    sync();
  }

  // ---- The window -------------------------------------------------------------------------------------------
  function build(dialog) {
    refs = {};
    refs.octaves = choice(OCTAVES.map(function (o) { return { key: o.key, label: C.i18n.octave(o.key) }; }), function () { return sel.octave; }, function (v) { pick('octave', v); });
    refs.names = choice(C.notes.NAMES.map(function (n) { return { key: n, label: C.i18n.noteName(n) }; }), function () { return sel.name; }, function (v) { pick('name', v); });
    refs.accidentals = choice(ACCIDENTALS, function () { return sel.accidental; }, function (v) { pick('accidental', v); });
    refs.finished = h('input', { type: 'checkbox', role: 'switch', class: 'fp-switch-input' });
    refs.finished.addEventListener('change', function () {
      editable(currentKey()).done = refs.finished.checked;
      sync();
    });
    refs.title = h('strong', { class: 'fp-title' });
    refs.status = h('span', { class: 'fp-status' });
    refs.count = h('span', { class: 'fp-count' });
    refs.clear = h('button', {
      type: 'button', class: 'btn btn--sm', title: 'Destapar todos los agujeros',
      onclick: function () { editable(currentKey()).holes = []; sync(); }
    }, 'Destapar todos');
    refs.remove = h('button', {
      type: 'button', class: 'btn btn--sm btn--danger',
      onclick: function () { delete work[currentKey()]; sync(); }
    });
    refs.copy = h('select', { class: 'input input--mini', 'aria-label': 'Copiar la digitación de otra nota' });
    refs.copy.addEventListener('change', function () {
      var from = holesOf(refs.copy.value);
      if (from) editable(currentKey()).holes = from.slice();
      sync();
    });
    refs.done = h('button', { type: 'button', class: 'btn btn--primary', onclick: save }, C.icons.create('check'), 'Listo');
    var cancel = h('button', { type: 'button', class: 'btn', onclick: requestClose }, 'Cancelar');

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('h2', null, 'Digitaciones'),
      h('p', { class: 'fp-help' }, 'Elige una nota y pulsa los agujeros que se tapan. Los agujeros sin marcar están destapados.'),
      h('div', { class: 'fp-body' },
        h('div', { class: 'fp-side' },
          h('div', { class: 'field' }, 'Octava', refs.octaves),
          h('div', { class: 'field' }, 'Nota', refs.names),
          h('div', { class: 'field' }, 'Alteración', refs.accidentals),
          h('div', { class: 'fp-finished' },
            h('label', { class: 'fp-switch' }, refs.finished, h('span', { class: 'fp-switch-track', 'aria-hidden': 'true' }), h('span', null, 'Digitación completada')),
            h('p', { class: 'fp-hint' }, 'Si no está completada, las canciones muestran solo el nombre de esta nota.')),
          h('div', { class: 'fp-tools' }, refs.clear, refs.copy, refs.remove)),
        h('div', { class: 'fp-stage' },
          h('div', { class: 'fp-caption' }, refs.title, refs.status, refs.count),
          board())),
      h('div', { class: 'dialog-actions' }, cancel, refs.done)));
    sync();
  }

  function close() {
    var dialog = dialogEl();
    if (dialog && dialog.open) dialog.close();
    refs = null;
    work = null;
  }

  function requestClose() {
    if (!isDirty()) { close(); return; }
    C.ui.confirm({
      title: 'Descartar los cambios',
      text: 'Has cambiado digitaciones y aún no se han guardado. Si sales, se perderán.',
      ok: 'Descartar',
      danger: true
    }).then(function (yes) { if (yes) close(); });
  }

  function save() {
    var map = C.fingering.sanitize(work);
    refs.done.disabled = true;
    C.folder.saveFingerings(map).then(function () {
      C.fingering.setCustom(map);
      C.store.notify();
      close();
      C.ui.toast('Digitaciones guardadas.');
    }).catch(function (err) {
      C.ui.toast(C.folder.describeFailure(err));
      if (refs) refs.done.disabled = false;
    });
  }

  // Opens the editor, on the note `key` (like "Sol#^") if given.
  function open(key) {
    var dialog = dialogEl();
    if (!dialog || !C.store.canEdit() || typeof dialog.showModal !== 'function') return;
    C.menus.closeAll();
    var note = typeof key === 'string' ? C.notes.parse(key) : null;
    if (note && !note.rest) sel = { octave: note.octave, name: note.name, accidental: note.accidental };
    work = C.fingering.overrides();
    original = JSON.stringify(C.fingering.sanitize(work));
    build(dialog);
    dialog.showModal();
  }

  function init() {
    var dialog = dialogEl();
    if (!dialog) return;
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); requestClose(); });   // Escape
    dialog.addEventListener('click', function (e) { if (e.target === dialog) requestClose(); });
  }

  C.fingeringEditor = { init: init, open: open };
})(window.Songbook = window.Songbook || {});
