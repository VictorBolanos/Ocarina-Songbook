(function (C) {
  'use strict';

  var h = C.ui.h;
  var state = C.store.state;

  var NONE = '__none';       // filter value meaning "songs where this is not set"

  // The current search and filters. They live here, not in the DOM, so they survive redraws and
  // opening a song and coming back.
  var filters = { query: '', tag: '', sort: 'manual' };
  C.categories.list.forEach(function (category) { filters[category.key] = ''; });

  var SORTS = [
    ['manual', 'Orden del cancionero'],
    ['title', 'Título A-Z'],
    ['difficulty', 'Dificultad (fácil primero)']
  ];

  // Lower case and without accents, so "cancion" finds "Canción".
  function normalize(value) {
    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function searchText(song) {
    var parts = [song.title, song.meter].concat(song.tags);
    C.categories.list.forEach(function (category) {
      parts.push(C.categories.labelOf(category.key, song[category.key]));
    });
    song.lines.forEach(function (line) { parts.push(line.subtitle); });
    return normalize(parts.join(' '));
  }

  function matches(song) {
    var haystack = null;
    var terms = normalize(filters.query).split(/\s+/).filter(Boolean);
    if (terms.length) {
      haystack = searchText(song);
      if (!terms.every(function (term) { return haystack.indexOf(term) >= 0; })) return false;
    }
    for (var i = 0; i < C.categories.list.length; i++) {
      var key = C.categories.list[i].key;
      var wanted = filters[key];
      if (wanted === NONE ? song[key] !== '' : (wanted && song[key] !== wanted)) return false;
    }
    if (filters.tag === NONE) return song.tags.length === 0;
    if (filters.tag) {
      var tag = filters.tag.toLowerCase();
      return song.tags.some(function (t) { return t.toLowerCase() === tag; });
    }
    return true;
  }

  function byTitle(a, b) {
    return (a.title || '').localeCompare(b.title || '', 'es');
  }

  function sorted(list) {
    var copy = list.slice();
    if (filters.sort === 'title') copy.sort(byTitle);
    else if (filters.sort === 'difficulty') {
      copy.sort(function (a, b) {
        return C.categories.rank('difficulty', a.difficulty) - C.categories.rank('difficulty', b.difficulty) || byTitle(a, b);
      });
    }
    return copy;
  }

  function isFiltering() {
    if (filters.query.trim() || filters.tag) return true;
    return C.categories.list.some(function (category) { return !!filters[category.key]; });
  }

  function resetFilters() {
    filters.query = '';
    filters.tag = '';
    C.categories.list.forEach(function (category) { filters[category.key] = ''; });
  }

  // ---- Song cards -------------------------------------------------------------------------------
  // The category and tag chips of a song, shared by the list and the song page.
  function chips(song) {
    var box = h('div', { class: 'tags' });
    C.categories.list.forEach(function (category) {
      var value = song[category.key];
      if (!value) return;
      box.appendChild(h('span', { class: 'tag tag--' + category.key + ' tag--' + value }, C.categories.labelOf(category.key, value)));
    });
    song.tags.forEach(function (tag) { box.appendChild(h('span', { class: 'tag tag--free' }, tag)); });
    return box.children.length ? box : null;
  }

  function counts(song) {
    var lines = 0;
    var notes = 0;
    song.lines.forEach(function (line) {
      if (line.notes.length) lines++;
      notes += line.notes.length;
    });
    return notes ? lines + (lines === 1 ? ' línea · ' : ' líneas · ') + notes + (notes === 1 ? ' nota' : ' notas') : 'Sin notas todavía';
  }

  // The title is the link; CSS stretches it over the whole card so the card opens the song, while the
  // edit and delete buttons (separate controls, not nested in the link) stay on top of it.
  function card(song) {
    var title = song.title || 'Sin título';
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', null, h('a', { class: 'card-link', href: '#/song/' + song.id, 'data-key': 'song:' + song.id }, title)),
        song.meter ? h('span', { class: 'badge' }, song.meter) : null),
      chips(song),
      h('div', { class: 'card-foot' },
        h('p', { class: 'card-meta' }, counts(song)),
        h('div', { class: 'card-actions' },
          h('button', {
            type: 'button',
            class: 'btn btn--ghost btn--sm card-edit',
            'data-key': 'cardedit:' + song.id,
            'aria-label': 'Editar «' + title + '»',
            onclick: function () { C.editor.edit(song.id); }
          }, C.icons.create('edit'), 'Editar'),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost btn--danger btn--sm card-delete',
            'data-key': 'delete:' + song.id,
            'aria-label': 'Borrar «' + title + '»',
            onclick: function () { C.editor.removeSong(song.id); }
          }, C.icons.create('trash'), 'Borrar'))));
  }

  // The big "new song" button. It lives on the list screen, between the filters and the songs (and
  // in the message shown when the folder has no songs yet).
  function newSongButton() {
    return h('button', {
      type: 'button',
      class: 'add-song no-print',
      'data-key': 'add-song',
      onclick: function () { C.editor.createSong(); }
    }, C.icons.create('plus'), 'Nueva canción');
  }

  // ---- Home view --------------------------------------------------------------------------------
  function select(label, key, value, options, onchange) {
    var control = h('select', {
      class: 'input',
      'data-key': 'filter:' + key,
      'aria-label': label,
      onchange: function () { onchange(control.value); }
    }, options.map(function (option) { return h('option', { value: option[0] }, option[1]); }));
    control.value = value;
    return h('label', { class: 'field' }, label, control);
  }

  function view() {
    var results = h('p', { class: 'results', role: 'status' });
    var list = h('div', { class: 'song-list' });
    var clear = h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      'data-key': 'filters-clear',
      onclick: function () { resetFilters(); C.store.notify(['search']); }
    }, C.icons.create('close'), 'Quitar filtros');

    // Only the results change while typing or picking a filter; the controls stay untouched, so
    // typing never loses focus.
    function update() {
      var found = sorted(state.songs.filter(matches));
      results.textContent = isFiltering()
        ? found.length + ' de ' + state.songs.length + ' canciones'
        : state.songs.length + (state.songs.length === 1 ? ' canción' : ' canciones');
      clear.hidden = !isFiltering();
      if (found.length) {
        list.replaceChildren.apply(list, found.map(card));
      } else {
        list.replaceChildren(h('p', { class: 'nomatch' }, 'Ninguna canción coincide con la búsqueda.'));
      }
    }

    var search = h('input', {
      type: 'search',
      class: 'input',
      placeholder: 'Buscar por título, etiqueta, subtítulo…',
      'aria-label': 'Buscar canciones',
      'data-key': 'search',
      value: filters.query,
      oninput: function () { filters.query = search.value; update(); }
    });

    var dropdowns = C.categories.list.map(function (category) {
      var options = [['', 'Todas']].concat(category.options, [[NONE, 'Sin definir']]);
      return select(category.label, category.key, filters[category.key], options, function (value) {
        filters[category.key] = value;
        update();
      });
    });

    var tagOptions = [['', 'Todas']].concat(C.store.allTags().map(function (entry) {
      return [entry.tag, entry.tag + ' (' + entry.count + ')'];
    }), [[NONE, 'Sin etiquetas']]);
    // A tag that no song has any more (deleted while filtering) must not stay selected invisibly.
    if (filters.tag && filters.tag !== NONE && !tagOptions.some(function (o) { return o[0].toLowerCase() === filters.tag.toLowerCase(); })) {
      filters.tag = '';
    }
    dropdowns.push(select('Etiqueta', 'tag', filters.tag, tagOptions, function (value) { filters.tag = value; update(); }));
    var sort = select('Ordenar por', 'sort', filters.sort, SORTS, function (value) { filters.sort = value; update(); });
    sort.classList.add('field--inline');

    update();
    return h('div', { class: 'home' },
      h('div', { class: 'filters' },
        h('div', { class: 'search' }, C.icons.create('magnifier'), search),
        h('div', { class: 'filter-row' }, dropdowns),
        h('div', { class: 'filters-foot' }, results, h('div', { class: 'filters-actions' }, clear, sort))),
      newSongButton(),
      list);
  }

  // Pressing "/" jumps to the search box, like on most sites.
  function init() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || state.route.name !== 'home' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
      var box = document.querySelector('[data-key="search"]');
      if (!box) return;
      e.preventDefault();
      box.focus();
    });
  }

  C.home = { view: view, chips: chips, newSongButton: newSongButton, init: init };
})(window.Songbook = window.Songbook || {});
