(function (C) {
  'use strict';

  var store = C.store;
  var state = store.state;

  function song() {
    return store.editingSong();
  }

  function blank() {
    return { subtitle: '', notes: [] };
  }

  // Lines with neither notes nor a subtitle are only scaffolding for typing; drop them when done.
  function dropBlankLines(target) {
    target.lines = target.lines.filter(function (line) {
      return line.notes.length > 0 || line.subtitle.trim() !== '';
    });
  }

  // ---- Session ----------------------------------------------------------------------------------
  function start(id) {
    store.flushText();
    var target = store.find(id);
    if (!target) return;
    state.editId = id;
    if (!target.lines.length) target.lines.push(blank());
    var last = target.lines.length - 1;
    state.caret = { line: last, pos: target.lines[last].notes.length };
    store.touch();    // adding the first line is not an undo step
    store.notify(['pal:Do']);
  }

  // Ends the editing session without redrawing (the router redraws right after, when you navigate away).
  function leave() {
    store.flushText();
    var target = song();
    if (target && target === state.draft) state.draft = null;      // an unfinished new song is dropped
    else if (target) dropBlankLines(target);
    state.editId = null;
    store.touch();
  }

  function notesIn(target) {
    return target.lines.reduce(function (total, line) { return total + line.notes.length; }, 0);
  }

  // The draft, if leaving it now would lose notes somebody typed (the router asks before that happens).
  function draftAtRisk() {
    return state.draft && state.editId === state.draft.id && notesIn(state.draft) > 0 ? state.draft : null;
  }

  function discardDraft() {
    state.draft = null;
    state.editId = null;
  }

  // Opens a song straight into the editor from anywhere (the list's "Editar" buttons).
  function edit(id) {
    if (!store.find(id)) return;
    start(id);
    C.router.go('#/song/' + id, ['pal:Do']);
  }

  // A new song only exists once it is published: it needs a title and at least one note.
  function publishDraft() {
    var draft = state.draft;
    if (!draft.title.trim()) {
      C.ui.toast('Ponle un título a la canción.');
      return;
    }
    if (!notesIn(draft)) {
      C.ui.toast('Añade al menos una nota para crear la canción.');
      return;
    }
    var id = store.uniqueId(draft.title);        // the file is named after the final title
    store.mutate(function () {
      dropBlankLines(draft);
      draft.id = id;
      state.songs.push(draft);
      state.draft = null;
      state.editId = null;
      state.route = { name: 'song', id: id };
    });
    C.router.go('#/song/' + id, ['edit:' + id]);
  }

  // Escape: close the editor. For a new song that means giving it up (the router asks first if it has notes).
  function cancelEditing() {
    if (state.draft && state.editId === state.draft.id) C.router.go('#/');
    else stop();
  }

  function stop() {
    var id = state.editId;
    if (!id) return;
    if (state.draft && state.draft.id === id) return publishDraft();
    store.mutate(function () {
      dropBlankLines(song());
      state.editId = null;
    }, ['edit:' + id]);
  }

  // Adds a song and opens it for editing, with the title selected so typing replaces the placeholder.
  function createSong() {
    var id = store.uniqueId('Nueva canción');
    store.mutate(function () {
      state.draft = store.blankSong(id);
      state.editId = id;
      state.caret = { line: 0, pos: 0 };
    });
    state.selectKey = 'title';
    C.router.go('#/song/' + id, ['title']);
  }

  // Deletes a song after confirming. Without an id it is the song being edited.
  function removeSong(id) {
    var target = typeof id === 'string' ? store.find(id) : song();
    if (!target) return;
    if (target === state.draft) return C.router.go('#/');      // nothing saved yet: just give it up
    C.ui.confirm({
      title: 'Borrar canción',
      text: 'Se borrará «' + (target.title || 'Sin título') + '» con todas sus notas.',
      ok: 'Borrar',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      var onSongPage = state.route.name === 'song';
      store.mutate(function () {
        state.songs = state.songs.filter(function (s) { return s.id !== target.id; });
        if (state.editId === target.id) state.editId = null;
      }, onSongPage ? undefined : ['add-song']);
      if (onSongPage) C.router.go('#/', ['add-song']);      // the song we were looking at is gone
      C.ui.toast('Canción borrada.', { label: 'Deshacer', run: store.undo });
    });
  }

  // ---- Categories and tags ------------------------------------------------------------------------
  function setCategory(key, value) {
    var target = song();
    if (!target || !C.categories.isValid(key, value) && value !== '') return;
    store.mutate(function () { target[key] = value; }, ['cat:' + key]);
  }

  function addTag(raw) {
    var target = song();
    if (!target) return;
    var tags = store.cleanTags(target.tags.concat([raw]));
    if (tags.length === target.tags.length) {
      C.ui.toast(target.tags.length >= 12 ? 'Una canción admite hasta 12 etiquetas.' : 'Esa etiqueta ya está.');
      return;
    }
    store.mutate(function () { target.tags = tags; }, ['tagin']);
  }

  function removeTag(i) {
    var target = song();
    if (!target) return;
    store.mutate(function () { target.tags.splice(i, 1); }, ['tagin']);
  }

  // ---- Caret ------------------------------------------------------------------------------------
  function setCaret(line, pos) {
    state.caret = { line: line, pos: pos };
    C.render.placeCaret();
  }

  // Focusing a line's subtitle makes it the active line, with the caret at its end.
  function activateLine(i) {
    if (state.caret.line === i) return;
    var target = song();
    setCaret(i, target ? target.lines[i].notes.length : 0);
  }

  function moveCaret(delta) {
    var target = song();
    if (!target) return;
    var line = state.caret.line;
    var pos = state.caret.pos + delta;
    if (pos < 0) {
      if (line > 0) setCaret(line - 1, target.lines[line - 1].notes.length);
    } else if (pos > target.lines[line].notes.length) {
      if (line < target.lines.length - 1) setCaret(line + 1, 0);
    } else {
      setCaret(line, pos);
    }
  }

  // ---- Notes ------------------------------------------------------------------------------------
  function add(code) {
    if (!song()) return;
    store.mutate(function () {
      var caret = state.caret;
      song().lines[caret.line].notes.splice(caret.pos, 0, code);
      state.caret = { line: caret.line, pos: caret.pos + 1 };
    });
  }

  function removeNote(i, j) {
    store.mutate(function () {
      song().lines[i].notes.splice(j, 1);
      state.caret = { line: i, pos: j };
    }, ['chip:' + i + ':' + j, 'chip:' + i + ':' + (j - 1), 'pal:Do']);
  }

  // Like Backspace in a text editor: removes the note before the caret; at the start of a line it
  // joins the line with the previous one (unless the line has a subtitle of its own).
  function backspace() {
    var target = song();
    if (!target) return;
    var line = state.caret.line;
    var pos = state.caret.pos;
    var current = target.lines[line];
    if (pos > 0) {
      store.mutate(function () {
        current.notes.splice(pos - 1, 1);
        state.caret = { line: line, pos: pos - 1 };
      });
    } else if (line > 0 && !current.subtitle) {
      store.mutate(function () {
        var previous = target.lines[line - 1];
        var joinAt = previous.notes.length;
        previous.notes = previous.notes.concat(current.notes);
        target.lines.splice(line, 1);
        state.caret = { line: line - 1, pos: joinAt };
      });
    }
  }

  function forwardDelete() {
    var target = song();
    if (!target) return;
    var current = target.lines[state.caret.line];
    if (state.caret.pos >= current.notes.length) return;
    store.mutate(function () { current.notes.splice(state.caret.pos, 1); });
  }

  // ---- Lines ------------------------------------------------------------------------------------
  // Like Enter in a text editor: the notes after the caret move to a new line below.
  function newLine() {
    var target = song();
    if (!target) return;
    store.mutate(function () {
      var line = state.caret.line;
      var rest = target.lines[line].notes.splice(state.caret.pos);
      target.lines.splice(line + 1, 0, { subtitle: '', notes: rest });
      state.caret = { line: line + 1, pos: 0 };
    });
  }

  function removeLine(i) {
    var target = song();
    if (!target) return;
    store.mutate(function () {
      if (target.lines.length === 1) target.lines[0] = blank();
      else target.lines.splice(i, 1);
      var line = Math.min(i, target.lines.length - 1);
      state.caret = { line: line, pos: target.lines[line].notes.length };
    }, ['dl:' + i, 'dl:' + (i - 1), 'pal:Do']);
  }

  // ---- Keyboard ---------------------------------------------------------------------------------
  // Shortcuts only apply while editing and never inside a text field, a menu or a dialog.
  function onKeydown(e) {
    if (!state.editId || e.defaultPrevented) return;
    var t = e.target;

    // Escape closes the editor, even from a text field, unless it is busy closing a dialog or a menu.
    if (e.key === 'Escape') {
      if ((t.closest && t.closest('dialog')) || document.querySelector('.menu:not([hidden])')) return;
      e.preventDefault();
      cancelEditing();
      return;
    }

    if (t.closest && t.closest('input, textarea, select, dialog, .menu, [contenteditable]')) return;
    var mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) store.redo(); else store.undo();
    } else if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      store.redo();
    } else if (!mod && !e.altKey) {
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (e.key === 'Delete') { e.preventDefault(); forwardDelete(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCaret(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCaret(1); }
    }
  }

  function init() {
    document.addEventListener('keydown', onKeydown);
  }

  C.editor = {
    init: init,
    start: start,
    edit: edit,
    stop: stop,
    createSong: createSong,
    leave: leave,
    draftAtRisk: draftAtRisk,
    discardDraft: discardDraft,
    removeSong: removeSong,
    setCategory: setCategory,
    addTag: addTag,
    removeTag: removeTag,
    setCaret: setCaret,
    activateLine: activateLine,
    add: add,
    removeNote: removeNote,
    backspace: backspace,
    newLine: newLine,
    removeLine: removeLine
  };
})(window.Songbook = window.Songbook || {});
