(function (C) {
  'use strict';

  // The fingerings page (#/digitaciones): every note with its diagram, so they can be looked up at a glance.
  // With the songs folder connected each note has an Edit button that opens the fingering editor on it.
  var h = C.ui.h;
  var tr = C.i18n.t;

  var OCTAVES = [
    { key: 'high', mark: '^', label: 'Octava aguda' },
    { key: 'mid',  mark: '',  label: 'Octava media' },
    { key: 'low',  mark: '_', label: 'Octava grave' }
  ];
  var GROUPS = [
    { accidental: '',  label: 'Naturales' },
    { accidental: '#', label: 'Sostenidos ♯' },
    { accidental: 'b', label: 'Bemoles ♭' }
  ];
  var FILTERS = [
    ['all', 'Todas las notas'],
    ['done', 'Solo completadas'],
    ['pending', 'Pendientes (sin digitación o en progreso)']
  ];

  var filter = 'all';        // kept while moving around the page

  function statusOf(key) {
    var entry = C.fingering.entryOf(key);
    if (!entry) return 'none';
    return entry.done ? 'done' : 'draft';
  }

  var STATUS_TEXT = { done: 'Completada', draft: 'En progreso', none: 'Sin digitación' };

  function keysOf(octave, accidental) {
    return C.notes.NAMES.map(function (name) { return C.notes.build(name, accidental, octave.key); });
  }

  function shown(key) {
    var status = statusOf(key);
    if (filter === 'done') return status === 'done';
    if (filter === 'pending') return status !== 'done';
    return true;
  }

  function cell(key) {
    var note = C.notes.parse(key);
    var status = statusOf(key);
    var entry = C.fingering.entryOf(key);
    var name = C.i18n.noteName(note.name) + C.notes.glyph(note.accidental) + C.notes.displayMark(note.octave);
    return h('div', { class: 'card fcell fcell--' + status, 'data-fingering': key },
      C.fingering.diagram(entry ? entry.holes : [], 'fcell-diagram', entry ? entry.half : []),
      h('strong', { class: 'fcell-name' }, name),
      h('span', { class: 'fcell-status' }, STATUS_TEXT[status]),
      C.store.canEdit()
        ? h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          'data-key': 'fedit:' + key,
          'aria-label': tr('Editar la digitación de {name}, {octave}', { name: name, octave: tr({ high: 'aguda', mid: 'media', low: 'grave' }[note.octave]) }),
          onclick: function () { C.fingeringEditor.open(key); }
        }, C.icons.create('edit'), 'Editar')
        : null);
  }

  function view() {
    var all = [];
    OCTAVES.forEach(function (o) { GROUPS.forEach(function (g) { all = all.concat(keysOf(o, g.accidental)); }); });
    var done = all.filter(function (k) { return statusOf(k) === 'done'; }).length;

    var select = h('select', {
      class: 'input',
      'aria-label': 'Qué notas mostrar',
      'data-key': 'fingering-filter',
      onchange: function () { filter = select.value; C.store.notify(['fingering-filter']); }
    }, FILTERS.map(function (f) { return h('option', { value: f[0] }, f[1]); }));
    select.value = filter;

    var sections = [];
    OCTAVES.forEach(function (octave) {
      var groups = GROUPS.map(function (group) {
        var cells = keysOf(octave, group.accidental).filter(shown).map(cell);
        return cells.length
          ? h('section', { class: 'fgroup' }, h('h4', null, group.label), h('div', { class: 'fgrid' }, cells))
          : null;
      }).filter(Boolean);
      if (groups.length) sections.push(h('section', { class: 'foctave' }, h('h3', null, octave.label), groups));
    });

    return h('div', { class: 'song-page fpage' },
      h('a', { class: 'back', href: '#/', 'data-key': 'back' }, C.icons.create('arrow-back'), 'Canciones'),
      h('div', { class: 'filters' },
        h('div', { class: 'fpage-head' },
          h('div', null,
            h('h2', null, 'Digitaciones'),
            h('p', { class: 'results' }, tr('{done} de {total} notas completadas. Las que no lo están se ven por su nombre en las canciones.', { done: done, total: all.length }))),
          h('label', { class: 'field field--inline' }, 'Mostrar', select))),
      sections.length ? sections : h('p', { class: 'nomatch' }, 'Ninguna nota coincide con el filtro.'));
  }

  C.fingeringPage = { view: view };
})(window.Songbook = window.Songbook || {});
