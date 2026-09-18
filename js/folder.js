// Songs folder: the ONLY place songs are stored. One JSON file per song, read and written straight
// from the user's disk through the File System Access API (Chrome / Edge). The user picks the folder
// once; the browser remembers it and only asks for permission again in a later session.
//
// This file depends on Chromium-only APIs anyway, so unlike the rest it uses modern syntax freely.
(function (C) {
  'use strict';

  const h = C.ui.h;
  const store = C.store;
  const state = store.state;

  const FOLDER_NAME = 'songs';
  const DB = { name: 'cancionero', store: 'handles', key: 'songs-dir' };

  let dir = null;             // FileSystemDirectoryHandle of the songs folder while connected
  let pending = null;         // remembered handle that still needs a permission click
  let written = {};           // file name -> text last written or read (the files this app owns)
  let fileOf = {};            // song id -> file name
  let foreign = {};           // .json files that could not be read: never touched, never overwritten
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
  function serialize(song, order) {
    const q = (value) => JSON.stringify(value);
    const lines = song.lines.map((line) =>
      '    { "subtitle": ' + q(line.subtitle) + ', "notes": [' + line.notes.map(q).join(', ') + '] }');
    const categories = C.categories.list.map((c) => '  "' + c.key + '": ' + q(song[c.key]) + ',\n').join('');
    return '{\n' +
      '  "id": ' + q(song.id) + ',\n' +
      '  "title": ' + q(song.title) + ',\n' +
      '  "meter": ' + q(song.meter) + ',\n' +
      categories +
      '  "tags": [' + song.tags.map(q).join(', ') + '],\n' +
      '  "order": ' + order + ',\n' +
      '  "lines": [' + (lines.length ? '\n' + lines.join(',\n') + '\n  ' : '') + ']\n' +
      '}\n';
  }

  // ---- Reading ------------------------------------------------------------------------------------
  async function readFolder() {
    written = {};
    fileOf = {};
    foreign = {};
    const found = [];
    const unreadable = [];

    for await (const [name, entry] of dir.entries()) {
      if (entry.kind !== 'file' || !/\.json$/i.test(name)) continue;
      try {
        const data = JSON.parse(await (await entry.getFile()).text());
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a song');
        // A hand-made file may lack a usable id: derive a stable one from its name, so that reading
        // the same folder twice always gives the same songs.
        if (!store.validId(data.id)) data.id = store.slug(name.replace(/\.json$/i, ''));
        found.push({
          song: store.sanitize([data])[0],
          order: Number.isFinite(data.order) ? data.order : Infinity,
          name
        });
      } catch (e) {
        unreadable.push(name);
        foreign[name] = true;
      }
    }

    found.sort((a, b) => a.order - b.order || a.song.title.localeCompare(b.song.title, 'es') || (a.name < b.name ? -1 : 1));
    const used = {};
    found.forEach((f, i) => {
      const base = f.song.id;
      for (let n = 2; used[f.song.id]; n++) f.song.id = base + '-' + n;
      used[f.song.id] = true;
      fileOf[f.song.id] = f.name;
      // Remember the canonical text, so songs you didn't touch are not rewritten on the next save.
      written[f.name] = serialize(f.song, i + 1);
    });
    return { songs: found.map((f) => f.song), unreadable };
  }

  // ---- Writing ------------------------------------------------------------------------------------
  function freeName(id) {
    const taken = new Set([...Object.keys(written), ...Object.keys(foreign)].map((n) => n.toLowerCase()));
    let name = id + '.json';
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = id + '-' + n + '.json';
    return name;
  }

  // Makes the folder match the songs in memory: writes what changed, deletes files of removed songs.
  async function writeChanges() {
    if (!dir) return;
    const songs = state.songs;
    const wanted = {};

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const name = fileOf[song.id] || (fileOf[song.id] = freeName(song.id));
      wanted[name] = true;
      const text = serialize(song, i + 1);
      if (written[name] === text) continue;
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
      written[name] = text;
    }

    for (const name of Object.keys(written)) {
      if (wanted[name]) continue;
      try {
        await dir.removeEntry(name);
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e;     // already gone: fine
      }
      delete written[name];
    }
    Object.keys(fileOf).forEach((id) => { if (!wanted[fileOf[id]]) delete fileOf[id]; });
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
    const { songs, unreadable } = await readFolder();
    setStatus('connected');
    remember(handle);
    store.replaceSongs(songs);
    if (unreadable.length) C.ui.toast('No se pudieron leer: ' + unreadable.join(', ') + '. No se han tocado.');
    else C.ui.toast(songs.length ? 'Carpeta conectada: ' + songs.length + ' canciones.' : 'Carpeta conectada. Todavía no hay canciones.');
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
      const handle = picked.name === FOLDER_NAME
        ? picked
        : await picked.getDirectoryHandle(FOLDER_NAME, { create: true });
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
  function refresh() {
    if (!dir) return Promise.resolve();
    return enqueue(async () => {
      if (!dir || state.editId || store.hasPendingSave()) return;
      const before = JSON.stringify(state.songs);
      const { songs } = await readFolder();
      if (state.editId || store.hasPendingSave() || JSON.stringify(songs) === before) return;
      store.replaceSongs(songs);
      C.ui.toast('Canciones actualizadas desde la carpeta.');
    }).catch((e) => {
      if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) C.ui.toast(describeFailure(e));
    });
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

    if (!supported()) return setStatus('unsupported');
    const handle = await recall();
    if (!handle) return setStatus('disconnected');

    pending = handle;
    try {
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') await attach(handle);
      else setStatus('needs-permission');
    } catch (e) {
      dir = null;
      await forget();
      pending = null;
      setStatus('disconnected');
    }
  }

  C.folder = {
    init, supported, isConnected, connect, reconnect, refresh, sync, describeFailure, serialize,
    hasFile: (id) => Object.keys(written).concat(Object.keys(foreign))
      .some((name) => name.toLowerCase() === (id + '.json').toLowerCase())
  };
})(window.Songbook = window.Songbook || {});
