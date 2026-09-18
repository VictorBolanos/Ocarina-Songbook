(function (C) {
  'use strict';

  var HISTORY_LIMIT = 100;
  var MAX = { title: 80, subtitle: 80, meter: 12, tag: 24, tags: 12 };

  // Song: {
  //   id, title,
  //   meter,                                   // time signature shown as a badge, e.g. "3/4"
  //   difficulty, origin, status,              // one option key each (see categories.js) or ''
  //   tags,                                    // free-form labels, e.g. ['zelda', 'infantil']
  //   lines: [{ subtitle, notes: ['Re', 'Fa#', 'Do^', ...] }]
  // }
  //
  // The songs live in exactly one place: the JSON files of the connected songs/ folder (folder.js).
  // This state is only the working copy of what those files say; nothing is cached anywhere else.
  // Undo history and the caret are per session and never saved.
  var state = {
    songs: [],
    draft: null,                   // a new song that is still being written: not in `songs`, not in the folder
    editId: null,                  // id of the song being edited (a saved song or the draft), if any
    caret: { line: 0, pos: 0 },    // insertion point inside the edited song
    undo: [],
    redo: [],
    saved: true,                   // false when the last write to the folder failed
    saveError: '',                 // why, in words for the user
    route: { name: 'home', id: null },   // home = the song list, song = one open song (router.js)
    selectKey: null,               // data-key of a field whose text should be selected once rendered
    folder: { status: 'checking', name: '' }   // checking | unsupported | disconnected | needs-permission | connected
  };

  var listeners = [];
  var pendingText = null;          // snapshot taken before the current burst of typing
  var saveTimer = null;

  function newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Readable, file-name-safe text: "Canción del Tiempo" -> "cancion-del-tiempo".
  function slug(value) {
    return String(value || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cancion';
  }

  // Id for a new song, with -2, -3... appended until it clashes with no song and no file in the folder.
  function uniqueId(title) {
    var base = slug(title);
    var id = base;
    for (var n = 2; find(id) || (C.folder && C.folder.hasFile(id)); n++) id = base + '-' + n;
    return id;
  }

  function validId(id) {
    return typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
  }

  function text(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  // Free-form labels: trimmed, one space between words, no duplicates (ignoring case), capped.
  function cleanTags(list) {
    var seen = {};
    var tags = [];
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      var tag = text(raw, 100).replace(/\s+/g, ' ').trim().slice(0, MAX.tag).trim();
      var key = tag.toLowerCase();
      if (!tag || seen[key] || tags.length >= MAX.tags) return;
      seen[key] = true;
      tags.push(tag);
    });
    return tags;
  }

  function blankSong(id) {
    var song = { id: id, title: 'Nueva canción', meter: '', tags: [], lines: [{ subtitle: '', notes: [] }] };
    C.categories.list.forEach(function (category) { song[category.key] = ''; });
    return song;
  }

  // Every distinct tag in use, with how many songs carry it, sorted A-Z.
  function allTags() {
    var counts = {};
    state.songs.forEach(function (song) {
      song.tags.forEach(function (tag) {
        var key = tag.toLowerCase();
        counts[key] = counts[key] || { tag: tag, count: 0 };
        counts[key].count++;
      });
    });
    return Object.keys(counts).map(function (key) { return counts[key]; })
      .sort(function (a, b) { return a.tag.localeCompare(b.tag, 'es'); });
  }

  // Cleans an array of songs read from disk. Anything malformed is dropped instead of trusted,
  // since the files may have been edited by hand.
  function sanitize(list) {
    if (!Array.isArray(list)) return null;
    var used = {};
    var songs = [];
    list.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var id = validId(item.id) && !used[item.id] ? item.id : newId();
      used[id] = true;
      var lines = (Array.isArray(item.lines) ? item.lines : [])
        .filter(function (l) { return l && typeof l === 'object'; })
        .map(function (l) {
          return {
            subtitle: text(l.subtitle, MAX.subtitle),
            notes: (Array.isArray(l.notes) ? l.notes : []).filter(function (code) {
              return typeof code === 'string' && C.notes.parse(code);
            })
          };
        });
      // `tag` is the old name of `meter`; files written by earlier versions still use it.
      var song = {
        id: id,
        title: text(item.title, MAX.title),
        meter: text(item.meter !== undefined ? item.meter : item.tag, MAX.meter),
        tags: cleanTags(item.tags),
        lines: lines
      };
      C.categories.list.forEach(function (category) {
        song[category.key] = C.categories.isValid(category.key, item[category.key]) ? item[category.key] : '';
      });
      songs.push(song);
    });
    return songs;
  }

  function find(id) {
    for (var i = 0; i < state.songs.length; i++) {
      if (state.songs[i].id === id) return state.songs[i];
    }
    return null;
  }

  // A song by id, looking in the draft too (the draft is only stored once it is published).
  function songById(id) {
    return state.draft && state.draft.id === id ? state.draft : find(id);
  }

  function editingSong() {
    return state.editId ? songById(state.editId) : null;
  }

  // Older versions kept a copy of the songs in the browser. That copy is now dead weight and a source
  // of confusion, so it is removed.
  function discardLegacyStorage() {
    try {
      localStorage.removeItem('ocarina-songs');
      localStorage.removeItem('ocarina-songs-corrupt');
    } catch (e) { /* storage blocked: nothing to remove */ }
  }

  // ---- Saving -----------------------------------------------------------------------------------
  function markSaved(ok, reason) {
    var changed = ok !== state.saved || (!ok && reason !== state.saveError);
    state.saved = ok;
    state.saveError = ok ? '' : reason;
    if (!ok && changed) C.ui.toast(reason);
    if (changed) notify();
  }

  // Writes what changed to the songs folder. Returns a promise so callers that must wait can.
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!C.folder.isConnected()) return Promise.resolve();
    return C.folder.sync().then(function () {
      markSaved(true);
    }).catch(function (err) {
      markSaved(false, C.folder.describeFailure(err));
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  function hasPendingSave() {
    return saveTimer !== null;
  }

  // ---- Change notification ----------------------------------------------------------------------
  function subscribe(fn) {
    listeners.push(fn);
  }

  // Keeps the caret inside the edited song, then tells the renderer to redraw.
  // `focusKeys` is an ordered list of data-key values to try to focus afterwards.
  function notify(focusKeys) {
    clampCaret();
    listeners.forEach(function (fn) { fn(focusKeys); });
  }

  function clampCaret() {
    var song = editingSong();
    if (!song) {
      state.caret = { line: 0, pos: 0 };
      return;
    }
    if (!song.lines.length) song.lines.push({ subtitle: '', notes: [] });
    var line = Math.min(Math.max(state.caret.line, 0), song.lines.length - 1);
    var pos = Math.min(Math.max(state.caret.pos, 0), song.lines[line].notes.length);
    state.caret = { line: line, pos: pos };
  }

  // ---- History ----------------------------------------------------------------------------------
  function snapshot() {
    return JSON.stringify({ songs: state.songs, draft: state.draft });
  }

  function pushUndo(json) {
    state.undo.push(json);
    if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
    state.redo.length = 0;
  }

  // Every edit goes through here: it snapshots for undo, saves, and redraws.
  function mutate(change, focusKeys) {
    flushText();
    var before = snapshot();
    change();
    if (snapshot() !== before) {
      pushUndo(before);
      scheduleSave();
    }
    notify(focusKeys);
  }

  // Typing in a text field changes the model on every keystroke but must be ONE undo step and must
  // not redraw (that would steal focus), so it has its own path.
  function typing(change) {
    if (pendingText === null) pendingText = snapshot();
    change();
    scheduleSave();
  }

  function flushText() {
    if (pendingText === null) return;
    if (pendingText !== snapshot()) pushUndo(pendingText);
    pendingText = null;
  }

  function restore(json, focusKeys) {
    var saved = JSON.parse(json);
    state.songs = saved.songs;
    state.draft = saved.draft;
    if (state.draft && state.editId !== state.draft.id) state.draft = null;   // never leave an unseen draft
    if (state.editId && !songById(state.editId)) state.editId = null;
    scheduleSave();
    notify(focusKeys);
  }

  function undo() {
    flushText();
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    restore(state.undo.pop(), ['undo', 'pal:Do']);
  }

  function redo() {
    flushText();
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    restore(state.redo.pop(), ['redo', 'pal:Do']);
  }

  // The songs were replaced by what the folder holds: that is a new starting point, not an edit,
  // so there is nothing to undo back to and nothing to write.
  function replaceSongs(songs) {
    flushText();
    state.songs = songs;
    state.draft = null;
    state.editId = null;
    state.undo = [];
    state.redo = [];
    notify();
  }

  C.store = {
    state: state,
    newId: newId,
    slug: slug,
    validId: validId,
    uniqueId: uniqueId,
    blankSong: blankSong,
    cleanTags: cleanTags,
    allTags: allTags,
    sanitize: sanitize,
    find: find,
    songById: songById,
    editingSong: editingSong,
    discardLegacyStorage: discardLegacyStorage,
    save: save,
    hasPendingSave: hasPendingSave,
    subscribe: subscribe,
    notify: notify,
    touch: scheduleSave,
    mutate: mutate,
    typing: typing,
    flushText: flushText,
    undo: undo,
    redo: redo,
    replaceSongs: replaceSongs
  };
})(window.Songbook = window.Songbook || {});
