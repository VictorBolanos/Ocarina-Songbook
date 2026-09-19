(function (C) {
  'use strict';

  // Backup: every song and the fingerings in one file, and back. Meant for keeping a copy somewhere else, or
  // for moving the songs to another computer.
  var h = C.ui.h;
  var store = C.store;
  var tr = C.i18n.t;

  var FORMAT = 'ocarina-songbook-backup';

  function exportAll() {
    if (!store.state.songs.length) {
      C.ui.toast('Todavía no hay canciones que guardar.');
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    var data = {
      format: FORMAT,
      version: 1,
      exported: new Date().toISOString(),
      songs: store.state.songs,
      fingerings: C.fingering.overrides()
    };
    var link = h('a', {
      href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
      download: 'ocarina-songbook-copia-' + today + '.json'
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
    C.ui.toast(store.state.songs.length === 1 ? tr('Copia guardada: 1 canción.') : tr('Copia guardada: {n} canciones.', { n: store.state.songs.length }));
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Adds the songs of a backup (a song that already exists as it is, is skipped; one with the same id but
  // different content is added under another id) and lays the backup's fingerings over the current ones.
  function apply(songs, fingerings) {
    var added = 0;
    var skipped = 0;
    store.mutate(function () {
      songs.forEach(function (song) {
        var existing = store.find(song.id);
        if (existing && same(existing, song)) { skipped++; return; }
        song.id = store.uniqueId(song.id);
        store.state.songs.push(song);
        added++;
      });
    });
    var notes = Object.keys(fingerings).length;
    var finished = notes ? (function () {
      var map = C.fingering.overrides();
      Object.keys(fingerings).forEach(function (key) { map[key] = fingerings[key]; });
      return C.folder.saveFingerings(map).then(function () {
        C.fingering.setCustom(map);
        store.notify();
      });
    })() : Promise.resolve();
    finished.then(function () {
      C.ui.toast(tr('Copia importada: {songs}{skipped}{notes}', {
        songs: added === 1 ? tr('1 canción añadida') : tr('{n} canciones añadidas', { n: added }),
        skipped: skipped ? (skipped === 1 ? tr(' (1 ya estaba)') : tr(' ({n} ya estaban)', { n: skipped })) : '',
        notes: notes ? (notes === 1 ? tr(' y 1 digitación.') : tr(' y {n} digitaciones.', { n: notes })) : '.'
      }), null, 8000);
    }).catch(function () {
      C.ui.toast('Se añadieron las canciones, pero no se pudieron guardar las digitaciones.');
    });
  }

  function importFile(file) {
    file.text().then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      if (!data || data.format !== FORMAT || !Array.isArray(data.songs)) {
        C.ui.toast('Ese archivo no es una copia de Ocarina Songbook.');
        return;
      }
      var songs = store.sanitize(data.songs) || [];
      var fingerings = C.fingering.sanitize(data.fingerings);
      var count = Object.keys(fingerings).length;
      C.ui.confirm({
        title: 'Importar la copia',
        text: tr('La copia tiene {songs}{fingerings}. Las canciones se añaden a las que ya tienes (si una ya existe con otro contenido, se guarda con otro nombre) y las digitaciones sustituyen a las de las mismas notas.', {
          songs: songs.length === 1 ? tr('1 canción') : tr('{n} canciones', { n: songs.length }),
          fingerings: count ? (count === 1 ? tr(' y 1 digitación') : tr(' y {n} digitaciones', { n: count })) : ''
        }),
        ok: 'Importar'
      }).then(function (yes) {
        if (yes) apply(songs, fingerings);
      });
    }).catch(function () {
      C.ui.toast('No se pudo leer el archivo.');
    });
  }

  function init() {
    var exportButton = document.getElementById('backup-export');
    var importButton = document.getElementById('backup-import');
    var input = document.getElementById('backup-file');
    if (exportButton) exportButton.addEventListener('click', exportAll);
    if (importButton && input) {
      importButton.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        if (input.files && input.files[0]) importFile(input.files[0]);
        input.value = '';
      });
    }
    // Importing writes to the folder, so only with it connected.
    store.subscribe(function () {
      if (importButton) importButton.hidden = !store.canEdit();
      if (exportButton) exportButton.hidden = !store.state.songs.length;
    });
  }

  C.backup = { init: init, exportAll: exportAll };
})(window.Songbook = window.Songbook || {});
