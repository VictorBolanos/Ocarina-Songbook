// Songs folder: the ONLY place songs are stored. One JSON file per song, read and written straight
// from the user's disk through the File System Access API (Chrome / Edge). The user picks the folder
// once; the browser remembers it and only asks for permission again in a later session.
//
// This file depends on Chromium-only APIs anyway, so unlike the rest it uses modern syntax freely.
(function (C) {
  'use strict';

  const h = C.ui.h;
  const tr = C.i18n.t;
  const store = C.store;
  const state = store.state;

  const FOLDER_NAME = 'songs';
  const FINGERINGS = 'fingerings.json';   // the fingerings drawn with the fingering editor (not a song)
  const INDEX = 'index.json';       // list of the song files, so a web page (which cannot list a folder) can read them
  const DB = { name: 'cancionero', store: 'handles', key: 'songs-dir' };

  let dir = null;             // FileSystemDirectoryHandle of the songs folder while connected
  let pending = null;         // remembered handle that still needs a permission click
  let written = {};           // file name -> text last written or read (the files this app owns)
  let fileOf = {};            // song id -> file name
  let foreign = {};           // .json files that could not be read: never touched, never overwritten
  let indexText = '';         // what index.json holds now
  let rawOf = {};             // file name -> the exact text found on disk (or written), to notice outside changes
  let fingeringsRaw = '';     // text of fingerings.json when read
  let fingeringsBroken = false;   // that text was not valid JSON
  let queue = Promise.resolve();

  const supported = () => typeof window.showDirectoryPicker === 'function';
  const isConnected = () => dir !== null;

  // ---- Remembering the folder between visits ------------------------------------------------------
  // Only the folder handle is remembered here (so the user doesn't have to pick it every time),
  // never any song data.
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB.store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbRequest(mode, run) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB.store, mode);
      const request = run(tx.objectStore(DB.store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    })).catch(() => null);      // without it the user just picks the folder again
  }

  const remember = (handle) => dbRequest('readwrite', (s) => s.put(handle, DB.key));
  const recall = () => dbRequest('readonly', (s) => s.get(DB.key));
  const forget = () => dbRequest('readwrite', (s) => s.delete(DB.key));

  // ---- File format --------------------------------------------------------------------------------
  // Hand-formatted so each line of a song is one line of text and diffs stay readable.
  function serialize(song) {
    const q = (value) => JSON.stringify(value);
    const lines = song.lines.map((line) =>
      '    { "subtitle": ' + q(line.subtitle) + ', "notes": [' + line.notes.map(q).join(', ') + '] }');
    const categories = C.categories.list.map((c) => '  "' + c.key + '": ' + q(song[c.key]) + ',\n').join('');
    return '{\n' +
      '  "id": ' + q(song.id) + ',\n' +
      '  "title": ' + q(song.title) + ',\n' +
      '  "meter": ' + q(song.meter) + ',\n' +
      '  "bpm": ' + song.bpm + ',\n' +
      '  "signature": ' + q(song.signature) + ',\n' +
      categories +
      '  "tags": [' + song.tags.map(q).join(', ') + '],\n' +
      '  "lines": [' + (lines.length ? '\n' + lines.join(',\n') + '\n  ' : '') + ']\n' +
      '}\n';
  }

  function warnAboutBrokenFingerings() {
    if (fingeringsBroken) {
      C.ui.toast('fingerings.json está dañado y se ignora. Si guardas digitaciones, se guardará una copia del archivo como fingerings.json.bak.', null, 15000);
    }
  }

  // Notes a file has that are not valid (a typo made by hand) are left out of the page, and would be lost the
  // next time that song is saved: say so.
  function warnAboutIgnoredNotes() {
    const skipped = store.takeDropped();
    if (!skipped.length) return;
    const list = skipped.map((s) => '“' + s.title + '” (' + s.count + ')').join(', ');
    C.ui.toast(tr('Hay notas no válidas que se ignoran en: {list}. Si guardas esa canción, se perderán; corrígelas en el archivo.', { list }), null, 15000);
  }

  // ---- Reading ------------------------------------------------------------------------------------
  // readFolder() records which files exist (written, fileOf, foreign, indexText), and writeChanges() deletes
  // the files of songs that are gone from memory. So a read whose result is NOT adopted must not keep that
  // record: a file added by hand meanwhile would look like "a removed song" and be deleted on the next save.
  const remember_ = () => ({ written, fileOf, foreign, indexText, rawOf, fingeringsRaw, fingeringsBroken });
  const restore_ = (record) => { ({ written, fileOf, foreign, indexText, rawOf, fingeringsRaw, fingeringsBroken } = record); };

  async function readFolder() {
    written = {};
    fileOf = {};
    foreign = {};
    rawOf = {};
    fingeringsRaw = '';
    fingeringsBroken = false;
    indexText = '';
    store.takeDropped();                                // forget what an earlier read ignored
    let fingerings = {};
    const found = [];
    const unreadable = [];

    for await (const [name, entry] of dir.entries()) {
      if (entry.kind !== 'file' || !/\.json$/i.test(name)) continue;
      if (name.toLowerCase() === INDEX) {              // not a song: the list of them
        try { indexText = await (await entry.getFile()).text(); } catch (e) { indexText = ''; }
        continue;
      }
      if (name.toLowerCase() === FINGERINGS) {         // not a song either
        try {
          fingeringsRaw = await (await entry.getFile()).text();
          fingerings = C.fingering.fromText(fingeringsRaw);
          fingeringsBroken = !C.fingering.isValidText(fingeringsRaw);
        } catch (e) { fingerings = {}; }
        continue;
      }
      try {
        const raw = await (await entry.getFile()).text();
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a song');
        rawOf[name] = raw;
        // A hand-made file may lack a usable id: derive a stable one from its name, so that reading
        // the same folder twice always gives the same songs.
        if (!store.validId(data.id)) data.id = store.slug(name.replace(/\.json$/i, ''));
        found.push({
          song: store.sanitize([data])[0],
          name
        });
      } catch (e) {
        unreadable.push(name);
        foreign[name] = true;
      }
    }

    found.sort((a, b) => a.song.title.localeCompare(b.song.title, 'es') || (a.name < b.name ? -1 : 1));
    const used = {};
    found.forEach((f) => {
      const base = f.song.id;
      for (let n = 2; used[f.song.id]; n++) f.song.id = base + '-' + n;
      used[f.song.id] = true;
      fileOf[f.song.id] = f.name;
      // Remember the canonical text, so songs you didn't touch are not rewritten on the next save.
      written[f.name] = serialize(f.song);
    });
    return { songs: found.map((f) => f.song), unreadable, fingerings };
  }

  // ---- Other tabs ---------------------------------------------------------------------------------
  // Two tabs of the page may have the same folder open. When one saves, the others read the folder again
  // (refresh() leaves alone a song that is being edited, and warns if it is that very song).
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ocarina-songbook') : null;

  function tellOtherTabs() {
    if (channel) channel.postMessage('saved');
  }

  // ---- Writing ------------------------------------------------------------------------------------
  function freeName(id) {
    const taken = new Set([...Object.keys(written), ...Object.keys(foreign), INDEX, FINGERINGS].map((n) => n.toLowerCase()));
    let name = id + '.json';
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = id + '-' + n + '.json';
    return name;
  }

  // Makes the folder match the songs in memory: writes what changed, deletes files of removed songs.
  async function writeChanges() {
    if (!dir) return;
    const songs = state.songs;
    const wanted = {};
    let wrote = false;                                  // did anything change on disk?

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const name = fileOf[song.id] || (fileOf[song.id] = freeName(song.id));
      wanted[name] = true;
      const text = serialize(song);
      if (written[name] === text) continue;
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
      written[name] = text;
      rawOf[name] = text;
      wrote = true;
    }

    for (const name of Object.keys(written)) {
      if (wanted[name]) continue;
      try {
        await dir.removeEntry(name);
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e;     // already gone: fine
      }
      delete written[name];
      delete rawOf[name];
      wrote = true;
    }
    Object.keys(fileOf).forEach((id) => { if (!wanted[fileOf[id]]) delete fileOf[id]; });

    // The list of files (alphabetical), for the published (read-only) version of the page.
    const list = songs.map((song) => fileOf[song.id]).sort();
    const text = '{\n  "songs": [' + (list.length ? '\n' + list.map((n) => '    ' + JSON.stringify(n)).join(',\n') + '\n  ' : '') + ']\n}\n';
    if (text !== indexText) {
      const file = await dir.getFileHandle(INDEX, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
      indexText = text;
    }
    if (wrote) tellOtherTabs();
  }

  // Writes and refreshes go through one queue, so they never interleave.
  function enqueue(job) {
    const result = queue.then(job);
    queue = result.catch(() => {});
    return result;
  }

  const sync = () => enqueue(writeChanges);

  // Turns a failed write into a message for the user. Losing permission also drops the connection
  // (the handle is kept so «Reconectar carpeta» can ask again).
  function describeFailure(error) {
    if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      pending = dir;
      dir = null;
      setStatus('needs-permission');
      return 'Se perdió el permiso sobre la carpeta songs. Pulsa «Reconectar carpeta» para seguir guardando.';
    }
    if (error && error.name === 'NotFoundError') {
      return 'No se encuentra la carpeta songs. Puede que la hayas movido o borrado.';
    }
    return 'No se pudo escribir en la carpeta songs.';
  }

  // ---- Connection ---------------------------------------------------------------------------------
  function setStatus(status) {
    state.folder = { status, name: ((status === 'connected' ? dir : pending) || {}).name || '' };
    store.notify();
  }

  // Connects to `handle` and shows what is in it. The folder always wins: there is nothing else to
  // reconcile it with.
  async function attach(handle) {
    dir = handle;
    pending = null;
    const { songs, unreadable, fingerings } = await readFolder();
    setStatus('connected');
    remember(handle);
    C.fingering.setCustom(fingerings);
    store.replaceSongs(songs);
    enqueue(writeChanges).catch(() => {});             // brings index.json up to date if it is missing or old
    if (unreadable.length) C.ui.toast(tr('No se pudieron leer: {list}. No se han tocado.', { list: unreadable.join(', ') }));
    else C.ui.toast(songs.length === 1 ? tr('Carpeta conectada: 1 canción.') : (songs.length ? tr('Carpeta conectada: {n} canciones.', { n: songs.length }) : tr('Carpeta conectada. Todavía no hay canciones.')));
    warnAboutIgnoredNotes();
    warnAboutBrokenFingerings();
  }

  async function withGrantedPermission(handle) {
    const mode = { mode: 'readwrite' };
    return (await handle.queryPermission(mode)) === 'granted' ||
      (await handle.requestPermission(mode)) === 'granted';
  }

  async function connect() {
    if (!supported()) return;
    try {
      const picked = await window.showDirectoryPicker({ id: 'ocarina-songs', mode: 'readwrite' });
      if (!(await withGrantedPermission(picked))) return;
      // Pick either the songs folder itself or the project root that contains it.
      let handle = picked;
      if (picked.name !== FOLDER_NAME) {
        try {
          handle = await picked.getDirectoryHandle(FOLDER_NAME);
        } catch (e) {
          if (!e || e.name !== 'NotFoundError') throw e;
          const create = await C.ui.confirm({
            title: 'Crear la carpeta songs',
            text: tr('En «{name}» no hay ninguna carpeta llamada songs. ¿Quieres crearla ahí para guardar las canciones? Si no era la carpeta que buscabas, cancela y elige otra.', { name: picked.name }),
            ok: 'Crear carpeta'
          });
          if (!create) return;
          handle = await picked.getDirectoryHandle(FOLDER_NAME, { create: true });
        }
      }
      await attach(handle);
    } catch (e) {
      if (e && e.name === 'AbortError') return;       // the user closed the picker
      dir = null;
      setStatus('disconnected');
      C.ui.toast('No se pudo conectar la carpeta.');
    }
  }

  async function reconnect() {
    if (!pending) return connect();
    try {
      if (await withGrantedPermission(pending)) await attach(pending);
      else C.ui.toast('Sin permiso no se puede usar la carpeta.');
    } catch (e) {
      dir = null;
      await forget();
      pending = null;
      setStatus('disconnected');
      C.ui.toast('La carpeta guardada ya no está disponible. Elige la carpeta de nuevo.');
    }
  }

  // Picks up changes made outside the page (a file edited, added or deleted by hand). Never runs while
  // there is something of ours still to write or a song open in the editor.
  //
  // While a song is open in the editor nothing is replaced, but the file is checked: if it was changed
  // outside the page, saving with Listo would overwrite that change, so the user is told.
  let warnedAbout = null;

  async function checkEditedFile() {
    const id = state.editId;
    const mine = store.find(id);
    if (!mine) return;                                   // a new song has no file yet
    const record = remember_();
    let songs;
    try { ({ songs } = await readFolder()); } finally { restore_(record); }      // only looking
    if (state.editId !== id) return;
    const theirs = songs.find((s) => s.id === id);
    const now = theirs ? JSON.stringify(theirs) : 'deleted';
    if (now === JSON.stringify(mine)) { warnedAbout = null; return; }
    if (now === warnedAbout) return;                     // already told about this version
    warnedAbout = now;
    C.ui.toast(
      theirs
        ? tr('El archivo de «{name}» se ha modificado fuera de la página. Si pulsas Listo se sobrescribirá con lo que tienes aquí.', { name: mine.title })
        : tr('El archivo de «{name}» ya no está en la carpeta. Si pulsas Listo se volverá a crear.', { name: mine.title }),
      null, 12000);
  }

  function refresh() {
    if (!dir) return Promise.resolve();
    return enqueue(async () => {
      if (dir && state.editId) return checkEditedFile();
      if (!dir || store.hasPendingSave()) return;
      const before = JSON.stringify(state.songs);
      const record = remember_();
      const { songs, fingerings } = await readFolder();
      const drawn = C.fingering.setCustom(fingerings);         // changed by hand, or from another window
      if (state.editId || store.hasPendingSave() || JSON.stringify(songs) === before) {
        restore_(record);                                      // not adopted: keep the old record
        if (drawn) store.notify();
        return;
      }
      store.replaceSongs(songs);
      C.ui.toast('Canciones actualizadas desde la carpeta.');
      warnAboutIgnoredNotes();
    }).catch((e) => {
      if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) C.ui.toast(describeFailure(e));
    });
  }

  // Writes songs/fingerings.json (the fingerings the user drew). Resolves once it is on disk. If the file
  // that was there could not be read, it is kept as fingerings.json.bak before it is replaced.
  function saveFingerings(map) {
    return enqueue(async () => {
      if (!dir) throw new Error('not connected');
      if (fingeringsBroken && fingeringsRaw) {
        const backup = await dir.getFileHandle(FINGERINGS + '.bak', { create: true });
        const kept = await backup.createWritable();
        await kept.write(fingeringsRaw);
        await kept.close();
      }
      const text = C.fingering.toText(map);
      const file = await dir.getFileHandle(FINGERINGS, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
      fingeringsRaw = text;
      fingeringsBroken = false;
      tellOtherTabs();
    });
  }

  // Is the file of this song, on disk, different from what this page read or wrote last? True means someone
  // else changed it (another tab, a hand edit), and saving now would overwrite that.
  function hasConflict(id) {
    return enqueue(async () => {
      const name = fileOf[id];
      if (!dir || !name || rawOf[name] === undefined) return false;
      try {
        const text = await (await (await dir.getFileHandle(name)).getFile()).text();
        return text !== rawOf[name];
      } catch (e) {
        return false;                                   // gone: it will simply be written again
      }
    });
  }

  // ---- Published songs (read-only) ----------------------------------------------------------------
  // Without a connected folder (a phone, or the page hosted on the web) the songs that sit next to the page,
  // in songs/, are shown read-only. index.json lists their files because a web page cannot list a folder;
  // the page keeps it up to date every time it saves to the songs folder.
  async function loadPublished() {
    try {
      const response = await fetch(FOLDER_NAME + '/' + INDEX, { cache: 'no-cache' });
      if (!response.ok) return null;
      const index = await response.json();
      const names = (Array.isArray(index.songs) ? index.songs : [])
        .filter((n) => typeof n === 'string' && /^[\w.-]+\.json$/i.test(n) && n.toLowerCase() !== INDEX);
      const loaded = await Promise.all(names.map(async (name) => {
        try {
          const file = await fetch(FOLDER_NAME + '/' + encodeURIComponent(name), { cache: 'no-cache' });
          if (!file.ok) return null;
          const data = await file.json();
          if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
          if (!store.validId(data.id)) data.id = store.slug(name.replace(/\.json$/i, ''));
          return store.sanitize([data])[0];
        } catch (e) {
          return null;
        }
      }));
      const used = {};
      return loaded.filter(Boolean).map((song) => {
        const base = song.id;
        for (let n = 2; used[song.id]; n++) song.id = base + '-' + n;
        used[song.id] = true;
        return song;
      });
    } catch (e) {
      return null;                                     // opened from disk (file://), or offline: nothing to show
    }
  }

  // Shows the published songs read-only, or `fallback` as the status when there are none to show.
  async function showPublished(fallback) {
    const songs = await loadPublished();
    if (songs) {
      try {                                            // the fingerings drawn by the user, if published
        const response = await fetch(FOLDER_NAME + '/' + FINGERINGS, { cache: 'no-cache' });
        if (response.ok) C.fingering.setCustom(C.fingering.fromText(await response.text()));
      } catch (e) { /* none published: the built-in ones are used */ }
      store.replaceSongs(songs);
      setStatus('readonly');
    } else {
      setStatus(fallback);
    }
  }

  // ---- Toolbar status -----------------------------------------------------------------------------
  let lastStatus = null;

  function renderSlot() {
    const slot = document.getElementById('folder-slot');
    const status = state.folder.status;
    if (!slot || status === lastStatus) return;
    lastStatus = status;

    let content = null;
    if (status === 'disconnected') {
      content = h('button', { type: 'button', class: 'btn folder-btn', onclick: connect }, C.icons.create('open'), 'Conectar carpeta');
    } else if (status === 'needs-permission') {
      content = h('button', { type: 'button', class: 'btn folder-btn is-alert', onclick: reconnect }, C.icons.create('open'), 'Reconectar carpeta');
    } else if (status === 'readonly') {
      content = h('span', { class: 'folder-readonly' },
        h('span', { class: 'folder-pill is-readonly', title: 'Estás viendo las canciones publicadas: no se pueden editar desde aquí.' }, 'Solo lectura'),
        pending
          ? h('button', { type: 'button', class: 'btn folder-btn is-alert', onclick: reconnect }, C.icons.create('open'), 'Reconectar carpeta')
          : (supported() ? h('button', { type: 'button', class: 'btn folder-btn', onclick: connect }, C.icons.create('open'), 'Conectar carpeta') : null));
    } else if (status === 'connected') {
      content = h('button', {
        type: 'button',
        class: 'folder-pill',
        title: 'Las canciones se guardan como archivos .json en esta carpeta. Pulsa para elegir otra.',
        onclick: connect
      }, C.icons.create('open'), (state.folder.name || FOLDER_NAME) + '/');
    }
    slot.replaceChildren(...(content ? [content] : []));
  }

  // ---- Start-up -----------------------------------------------------------------------------------
  async function init() {
    store.subscribe(renderSlot);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('focus', refresh);
    if (channel) channel.onmessage = () => refresh();

    if (!supported()) return showPublished('unsupported');
    const handle = await recall();
    if (!handle) return showPublished('disconnected');

    pending = handle;
    try {
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') await attach(handle);
      else await showPublished('needs-permission');
    } catch (e) {
      dir = null;
      await forget();
      pending = null;
      await showPublished('disconnected');
    }
  }

  C.folder = {
    init, supported, isConnected, saveFingerings, hasConflict, forgetWarning: () => { warnedAbout = null; }, connect, reconnect, refresh, sync, describeFailure, serialize,
    hasFile: (id) => Object.keys(written).concat(Object.keys(foreign))
      .concat([INDEX, FINGERINGS])
      .some((name) => name.toLowerCase() === (id + '.json').toLowerCase())
  };
})(window.Songbook = window.Songbook || {});
