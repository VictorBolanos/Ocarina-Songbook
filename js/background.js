// Page background: a flat colour (the theme's), optionally with a picture from a folder of the user's
// choosing laid over it. The folder is linked once through the File System Access API (Chrome / Edge).
//
// The picture in use is copied into the browser's own storage, so it shows straight away on the next
// visit without asking for the folder again; the folder is only needed to pick a different one.
//
// Like folder.js, this depends on Chromium-only APIs, so it uses modern syntax freely.
(function (C) {
  'use strict';

  const h = C.ui.h;
  const root = document.documentElement;

  const PREFS_KEY = 'ocarina-bg';
  const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
  const DB = { name: 'cancionero-backgrounds', handle: 'handle', current: 'current' };

  // mode: 'flat' | 'image'. opacity 0-100: how strongly the picture shows over the flat colour.
  // blur in px.
  let prefs = { mode: 'flat', name: '', opacity: 40, blur: 0 };
  let dir = null;                 // linked folder handle (read access may need re-granting)
  let listing = [];               // [{ name, entry }] once the folder has been read
  let folderState = 'none';       // none | needs-permission | ready | unsupported
  let imageUrl = null;            // object URL of the picture on screen
  let panel = null;               // the open menu element
  const thumbs = new Map();       // file name -> thumbnail object URL
  let thumbQueue = Promise.resolve();

  const supported = () => typeof window.showDirectoryPicker === 'function';

  // ---- Storage -------------------------------------------------------------------------------------
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB.name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB.handle);
        request.result.createObjectStore(DB.current);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbRequest(store, mode, run) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    })).catch(() => null);      // storage is a convenience: without it the background just doesn't persist
  }

  const dbGet = (store) => dbRequest(store, 'readonly', (s) => s.get('value'));
  const dbPut = (store, value) => dbRequest(store, 'readwrite', (s) => s.put(value, 'value'));
  const dbDelete = (store) => dbRequest(store, 'readwrite', (s) => s.delete('value'));

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
      if (saved && typeof saved === 'object') {
        const opacity = Number(saved.opacity);
        prefs = {
          mode: saved.mode === 'image' ? 'image' : 'flat',
          name: typeof saved.name === 'string' ? saved.name : '',
          opacity: Number.isFinite(opacity) ? Math.min(100, Math.max(5, opacity)) : 40,
          blur: Math.min(24, Math.max(0, Number(saved.blur) || 0))
        };
      }
    } catch (e) { /* keep the defaults */ }
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* not persisted */ }
  }

  // ---- Applying it -----------------------------------------------------------------------------------
  function applyLevels() {
    root.style.setProperty('--bg-opacity', String(prefs.opacity / 100));
    root.style.setProperty('--bg-blur', prefs.blur + 'px');
  }

  function showImage(blob) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);
    root.style.setProperty('--bg-image', 'url("' + imageUrl + '")');
  }

  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    root.style.removeProperty('--bg-image');
  }

  async function chooseFlat() {
    clearImage();
    prefs.mode = 'flat';
    prefs.name = '';
    savePrefs();
    await dbDelete(DB.current);
    render();
  }

  async function chooseImage(item) {
    try {
      const file = await item.entry.getFile();
      await dbPut(DB.current, { name: item.name, blob: file });   // keep a copy: no folder needed next time
      showImage(file);
      prefs.mode = 'image';
      prefs.name = item.name;
      savePrefs();
      render();
    } catch (e) {
      C.ui.toast('No se pudo leer esa imagen. Comprueba que sigue en la carpeta.');
    }
  }

  // ---- The linked folder -------------------------------------------------------------------------------
  async function readFolder() {
    const found = [];
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'file' && IMAGE_RE.test(name)) found.push({ name, entry });
    }
    found.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    listing = found;
  }

  async function prepare() {
    if (!supported()) { folderState = 'unsupported'; return; }
    dir = dir || await dbGet(DB.handle);
    if (!dir) { folderState = 'none'; return; }
    try {
      if ((await dir.queryPermission({ mode: 'read' })) === 'granted') {
        await readFolder();
        folderState = 'ready';
      } else {
        folderState = 'needs-permission';
      }
    } catch (e) {
      dir = null;
      folderState = 'none';
    }
  }

  async function link() {
    try {
      const picked = await window.showDirectoryPicker({ id: 'ocarina-backgrounds', mode: 'read' });
      dir = picked;
      thumbs.clear();
      await dbPut(DB.handle, picked);
      await readFolder();
      folderState = 'ready';
      render();
    } catch (e) {
      if (e && e.name === 'AbortError') return;      // the user closed the picker
      C.ui.toast('No se pudo enlazar la carpeta de fondos.');
    }
  }

  async function reconnect() {
    try {
      if ((await dir.requestPermission({ mode: 'read' })) !== 'granted') return;
      await readFolder();
      folderState = 'ready';
      render();
    } catch (e) {
      dir = null;
      folderState = 'none';
      await dbDelete(DB.handle);
      C.ui.toast('La carpeta de fondos ya no está disponible. Elige otra.');
      render();
    }
  }

  // ---- Thumbnails ----------------------------------------------------------------------------------------
  // Small previews made on demand, one at a time so a big folder doesn't stall the page.
  async function makeThumb(item) {
    const file = await item.entry.getFile();
    const bitmap = await createImageBitmap(file, { resizeWidth: 240, resizeQuality: 'medium' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return URL.createObjectURL(blob);
  }

  function loadThumb(item, tile) {
    if (thumbs.has(item.name)) {
      tile.style.backgroundImage = 'url("' + thumbs.get(item.name) + '")';
      return;
    }
    thumbQueue = thumbQueue.then(async () => {
      if (!tile.isConnected) return;                  // the menu was redrawn or closed meanwhile
      try {
        const url = await makeThumb(item);
        thumbs.set(item.name, url);
        if (tile.isConnected) tile.style.backgroundImage = 'url("' + url + '")';
      } catch (e) {
        tile.classList.add('is-broken');              // not an image the browser can decode
      }
    });
  }

  // ---- The menu ------------------------------------------------------------------------------------------
  function tile(label, selected, onclick) {
    return h('button', {
      type: 'button',
      class: 'bg-tile' + (selected ? ' is-selected' : ''),
      'aria-pressed': String(selected),
      title: label,
      onclick
    });
  }

  function slider(label, key, min, max, unit) {
    const output = h('output', null, prefs[key] + unit);
    const input = h('input', { type: 'range', min, max, value: prefs[key], disabled: prefs.mode !== 'image', 'aria-label': label });
    input.addEventListener('input', () => {
      prefs[key] = Number(input.value);
      output.textContent = prefs[key] + unit;
      applyLevels();
    });
    input.addEventListener('change', savePrefs);
    return h('label', { class: 'bg-slider' }, h('span', null, label), input, output);
  }

  function render() {
    if (!panel) return;
    const scroll = panel.querySelector('.bg-grid');
    const scrollTop = scroll ? scroll.scrollTop : 0;

    const flat = tile('Color plano', prefs.mode === 'flat', chooseFlat);
    flat.classList.add('bg-tile--flat');
    flat.appendChild(h('span', { class: 'bg-tile-label' }, 'Color plano'));
    const tiles = [flat];

    listing.forEach((item) => {
      const selected = prefs.mode === 'image' && prefs.name === item.name;
      const el = tile(item.name, selected, () => chooseImage(item));
      el.appendChild(h('span', { class: 'bg-tile-label' }, item.name.replace(IMAGE_RE, '')));
      loadThumb(item, el);
      tiles.push(el);
    });

    let note = null;
    let action = null;
    if (folderState === 'unsupported') {
      note = 'Este navegador no puede enlazar carpetas. Abre la página con Chrome o Edge.';
    } else if (folderState === 'none') {
      note = 'Enlaza una carpeta con tus imágenes para usarlas de fondo.';
      action = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: link }, C.icons.create('open'), 'Enlazar carpeta de fondos');
    } else if (folderState === 'needs-permission') {
      note = 'El navegador necesita tu permiso para leer «' + (dir.name || 'la carpeta') + '».';
      action = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: reconnect }, C.icons.create('open'), 'Reconectar carpeta');
    } else if (!listing.length) {
      note = 'No hay imágenes en «' + dir.name + '» (png, jpg, webp, gif o avif).';
      action = h('button', { type: 'button', class: 'btn btn--sm', onclick: link }, C.icons.create('open'), 'Cambiar carpeta');
    } else {
      action = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: link, title: 'Elegir otra carpeta' },
        C.icons.create('open'), dir.name + '/');
    }

    panel.replaceChildren(
      h('div', { class: 'bg-panel' },
        h('p', { class: 'bg-title' }, 'Fondo de la página'),
        h('div', { class: 'bg-grid' }, tiles),
        note ? h('p', { class: 'bg-note' }, note) : null,
        h('div', { class: 'bg-controls' },
          slider('Intensidad', 'opacity', 5, 100, '%'),
          slider('Desenfoque', 'blur', 0, 24, 'px')),
        action ? h('div', { class: 'bg-actions' }, action) : null));

    const grid = panel.querySelector('.bg-grid');
    if (grid) grid.scrollTop = scrollTop;
  }

  // ---- Start-up ---------------------------------------------------------------------------------------
  async function init() {
    loadPrefs();
    applyLevels();

    const picker = C.menus.register('background');
    panel = picker.menu;
    picker.onOpen = async () => {
      render();                                     // show what we know at once...
      await prepare();                              // ...then check the folder
      render();
    };

    // Put back the picture from last time. It comes from the browser's own copy, not from the folder.
    if (prefs.mode === 'image') {
      const saved = await dbGet(DB.current);
      if (saved && saved.blob) showImage(saved.blob);
      else { prefs.mode = 'flat'; savePrefs(); }
    }
  }

  C.background = { init };
})(window.Cancionero = window.Cancionero || {});
