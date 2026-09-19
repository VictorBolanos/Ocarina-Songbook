(function (C) {
  'use strict';

  var store = C.store;
  var state = store.state;

  function song() {
    return store.editingSong();
  }

  var DEFAULT_WAIT = 4;      // beats of a new wait line

  function blank() {
    return { subtitle: '', notes: [], wait: 0 };
  }

  // Lines with neither notes nor a subtitle are only scaffolding for typing; drop them when done.
  function dropBlankLines(target) {
    target.lines = target.lines.filter(function (line) {
      return line.notes.length > 0 || line.wait > 0 || line.subtitle.trim() !== '';
    });
  }

  // ---- Session ----------------------------------------------------------------------------------
  // Editing works on a copy of the song (the draft). The saved song, and the file, stay as they were until
  // Listo publishes the copy.
  function start(id) {
    store.flushText();
    var original = store.find(id);
    if (!original) return;
    var copy = JSON.parse(JSON.stringify(original));
    if (!copy.lines.length) copy.lines.push(blank());
    state.draft = copy;
    state.editId = id;
    state.undo = [];
    state.redo = [];
    var last = copy.lines.length - 1;
    state.caret = { line: last, pos: copy.lines[last].notes.length };
    store.notify(['pal:Do']);
  }

  // Ends the editing session without redrawing (the router redraws right after, when you navigate away).
  // Whatever was not published is dropped.
  function leave() {
    store.flushText();
    state.draft = null;
    state.editId = null;
    state.undo = [];
    state.redo = [];
  }

  // True while the song being edited has never been saved (there is no file for it yet).
  function isNewDraft() {
    return !!state.draft && !store.find(state.draft.id);
  }

  function notesIn(target) {
    return target.lines.reduce(function (total, line) { return total + line.notes.length; }, 0);
  }

  // The song's content without the empty lines that only exist as scaffolding for typing.
  function comparable(target) {
    var copy = JSON.parse(JSON.stringify(target));
    dropBlankLines(copy);
    return JSON.stringify(copy);
  }

  // The draft, if leaving it now would lose something: the notes of a new song, or changes to a saved one
  // (the router asks before that happens).
  function draftAtRisk() {
    var draft = state.draft;
    if (!draft || state.editId !== draft.id) return null;
    var original = store.find(draft.id);
    if (!original) return notesIn(draft) > 0 ? draft : null;
    return comparable(draft) !== comparable(original) ? draft : null;
  }

  // What to ask before throwing the draft away.
  function discardMessage(draft) {
    var name = '«' + (draft.title || 'Sin título') + '» ';
    return isNewDraft()
      ? { title: 'Descartar la canción nueva', text: name + 'todavía no se ha guardado. Si sales, se perderán sus notas.' }
      : { title: 'Descartar los cambios', text: 'Los cambios de ' + name + 'no se han guardado. Si sales, se perderán.' };
  }

  function discardDraft() {
    leave();
  }

  // Opens a song straight into the editor from anywhere (the list's "Editar" buttons).
  function edit(id) {
    if (!store.find(id)) return;
    start(id);
    C.router.go('#/song/' + id, ['pal:Do']);
  }

  // The draft only reaches the song list, and so the folder, when it is published: a title and at least
  // one note are needed. A saved song keeps its id (and its file) and is replaced in place.
  function publishDraft() {
    var draft = state.draft;
    if (!draft.title.trim()) {
      C.ui.toast('Ponle un título a la canción.');
      return;
    }
    if (!notesIn(draft)) {
      C.ui.toast('Añade al menos una nota para guardar la canción.');
      return;
    }
    var fresh = isNewDraft();
    var id = fresh ? store.uniqueId(draft.title) : draft.id;        // a new file is named after the final title
    store.mutate(function () {
      dropBlankLines(draft);
      draft.id = id;
      if (fresh) {
        state.songs.push(draft);
      } else {
        for (var i = 0; i < state.songs.length; i++) {
          if (state.songs[i].id === id) state.songs[i] = draft;
        }
      }
      state.draft = null;
      state.editId = null;
      state.route = { name: 'song', id: id };
    });
    C.router.go('#/song/' + id, ['edit:' + id]);
  }

  // Escape / Cancelar: close the editor without saving. A new song goes back to the list; a saved one
  // returns to its page as it was. Either way it asks first if there is something to lose.
  function cancelEditing() {
    var id = state.editId;
    if (!id) return;
    store.flushText();
    var risky = draftAtRisk();
    function close() {
      var fresh = isNewDraft();
      leave();
      if (fresh) C.router.go('#/');
      else store.notify(['edit:' + id]);
    }
    if (!risky) return close();
    var message = discardMessage(risky);
    C.ui.confirm({ title: message.title, text: message.text, ok: 'Descartar', danger: true }).then(function (yes) {
      if (yes) close();
    });
  }

  // Listo: save what was written.
  function stop() {
    if (!state.editId || !state.draft) return;
    store.flushText();
    publishDraft();
  }

  // Adds a song and opens it for editing, with the title selected so typing replaces the placeholder.
  // The kind of accidentals is asked first: it decides which ones the palette offers. Cancelling the
  // question cancels the new song.
  function createSong() {
    C.keyDialog.choose(null, {
      title: 'Alteraciones de la nueva canción',
      help: 'Antes de escribir, elige si la canción usa bemoles, sostenidos o ninguno. La botonera solo te ofrecerá esos. La tonalidad se deduce de las notas que coloques.',
      ok: 'Crear canción'
    }).then(function (signature) {
      if (signature === undefined) return;
      var id = store.uniqueId('Nueva canción');
      store.mutate(function () {
        state.draft = store.blankSong(id);
        state.draft.signature = signature;
        state.editId = id;
        state.caret = { line: 0, pos: 0 };
      });
      state.selectKey = 'title';
      C.router.go('#/song/' + id, ['title']);
    });
  }

  // Changes the kind of accidentals of the song being edited. Going to flats or sharps, the notes already
  // written with the other kind are respelled as the same sound (Do♯ -> Re♭, Mi♯ -> Fa, ...), so the song
  // sounds exactly the same. Going to none leaves the notes alone.
  function changeSignature() {
    var target = song();
    if (!target) return;
    var id = target.id;
    C.keyDialog.choose(target.signature, {
      title: 'Cambiar las alteraciones',
      help: 'Si pasas de bemoles a sostenidos (o al revés), las notas que ya has escrito se cambian por su equivalente, y suenan igual.',
      ok: 'Aplicar'
    }).then(function (signature) {
      var current = song();
      if (signature === undefined || !current || current.id !== id || signature === current.signature) return;
      var changed = 0;
      store.mutate(function () {
        current.signature = signature;
        if (signature === 'none') return;
        var mark = signature === 'flat' ? 'b' : '#';
        current.lines.forEach(function (line) {
          line.notes = line.notes.map(function (code) {
            var next = C.notes.respell(code, mark);
            if (next !== code) changed++;
            return next;
          });
        });
      }, ['signature']);
      if (changed) C.ui.toast(changed === 1 ? 'Se ha cambiado 1 nota por su equivalente.' : 'Se han cambiado ' + changed + ' notas por su equivalente.');
    });
  }

  // Deletes a song after confirming. Without an id it is the song being edited.
  function removeSong(id) {
    var editing = song();
    var target = typeof id === 'string' ? store.find(id) : (editing && store.find(editing.id)) || editing;
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
        if (state.draft && state.draft.id === target.id) state.draft = null;
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
  // `pick` says the user chose the note just before the caret (clicking it, or moving onto it with the
  // arrow keys), so Play starts from it. Clicking empty space in a line only moves the caret.
  function setCaret(line, pos, pick) {
    state.caret = { line: line, pos: pos };
    state.selection = pick && pos > 0 ? { line: line, index: pos - 1 } : null;
    C.render.placeCaret();
  }

  // Focusing a line's subtitle makes it the active line, with the caret at its end.
  function activateLine(i) {
    var target = song();
    if (!target || state.caret.line === i || target.lines[i].wait > 0) return;
    setCaret(i, target.lines[i].notes.length);
  }

  // The nearest line of notes (not a wait line) before / after `line`, or -1.
  function lineBefore(target, line) {
    for (var i = line - 1; i >= 0; i--) if (!(target.lines[i].wait > 0)) return i;
    return -1;
  }

  function lineAfter(target, line) {
    for (var i = line + 1; i < target.lines.length; i++) if (!(target.lines[i].wait > 0)) return i;
    return -1;
  }

  function moveCaret(delta) {
    var target = song();
    if (!target) return;
    var line = state.caret.line;
    var pos = state.caret.pos + delta;
    if (pos < 0) {
      var before = lineBefore(target, line);
      if (before >= 0) setCaret(before, target.lines[before].notes.length, true);
    } else if (pos > target.lines[line].notes.length) {
      var after = lineAfter(target, line);
      if (after >= 0) setCaret(after, 0, true);
    } else {
      setCaret(line, pos, true);
    }
  }

  // ---- Note values -----------------------------------------------------------------------------------
  // The note just before the caret is the "selected" one: the duration buttons show and change its value,
  // and new notes get the value the buttons show. With the caret at the start of a line it is the default.
  function selectedNote() {
    var target = song();
    if (!target) return null;
    var line = target.lines[state.caret.line];
    return line && state.caret.pos > 0 ? line.notes[state.caret.pos - 1] : null;
  }

  function currentDuration() {
    var code = selectedNote();
    var note = code ? C.notes.parse(code) : null;
    return note ? { key: note.duration, dotted: note.dotted } : state.duration;
  }

  function applyDuration(key, dotted) {
    state.duration = { key: key, dotted: dotted };
    var target = song();
    if (target && selectedNote()) {
      var caret = state.caret;
      var picked = state.selection;
      store.mutate(function () {
        var notes = target.lines[caret.line].notes;
        notes[caret.pos - 1] = C.notes.withDuration(notes[caret.pos - 1], key, dotted);
      }, ['dur:' + key]);
      state.selection = picked;
    } else {
      store.notify(['dur:' + key]);
    }
  }

  function setDuration(key) {
    applyDuration(key, currentDuration().dotted);
  }

  function toggleDot() {
    var current = currentDuration();
    applyDuration(current.key, !current.dotted);
  }

  // ---- Notes ------------------------------------------------------------------------------------
  function add(code) {
    if (!song()) return;
    var value = currentDuration();
    store.mutate(function () {
      var caret = state.caret;
      song().lines[caret.line].notes.splice(caret.pos, 0, C.notes.withDuration(code, value.key, value.dotted));
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
    } else if (line > 0 && target.lines[line - 1].wait > 0) {
      store.mutate(function () {                       // Backspace at the start of a line removes the wait line above it
        target.lines.splice(line - 1, 1);
        state.caret = { line: line - 1, pos: 0 };
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
      target.lines.splice(line + 1, 0, { subtitle: '', notes: rest, wait: 0 });
      state.caret = { line: line + 1, pos: 0 };
    });
  }

  // Inserts a wait line at the caret (the notes after the caret move below it) and moves the caret to
  // the line after it, ready to keep writing. The beats can then be changed in the wait line itself.
  function addWait() {
    var target = song();
    if (!target) return;
    var at = state.caret.line + 1;
    store.mutate(function () {
      var rest = target.lines[state.caret.line].notes.splice(state.caret.pos);
      target.lines.splice(at, 0, { subtitle: '', notes: [], wait: DEFAULT_WAIT }, { subtitle: '', notes: rest, wait: 0 });
      state.caret = { line: at + 1, pos: 0 };
    }, ['wait:' + at]);
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
    changeSignature: changeSignature,
    leave: leave,
    draftAtRisk: draftAtRisk,
    discardMessage: discardMessage,
    isNewDraft: isNewDraft,
    cancel: cancelEditing,
    discardDraft: discardDraft,
    removeSong: removeSong,
    setCategory: setCategory,
    addTag: addTag,
    removeTag: removeTag,
    setCaret: setCaret,
    activateLine: activateLine,
    add: add,
    setDuration: setDuration,
    toggleDot: toggleDot,
    currentDuration: currentDuration,
    removeNote: removeNote,
    backspace: backspace,
    newLine: newLine,
    addWait: addWait,
    removeLine: removeLine
  };
})(window.Songbook = window.Songbook || {});
