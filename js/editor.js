(function (C) {
  'use strict';

  var store = C.store;
  var state = store.state;
  var tr = C.i18n.t;

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
  // Editing works on a copy of the song (the draft). The saved song, and the file, stay as they were until
  // Listo publishes the copy.
  function start(id) {
    if (!store.canEdit()) return;
    store.flushText();
    var original = store.find(id);
    if (!original) return;
    var copy = JSON.parse(JSON.stringify(original));
    if (!copy.lines.length) copy.lines.push(blank());
    state.draft = copy;
    state.editId = id;
    C.folder.forgetWarning();
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
    var name = draft.title || tr('Sin título');
    return isNewDraft()
      ? { title: 'Descartar la canción nueva', text: tr('«{name}» todavía no se ha guardado. Si sales, se perderán sus notas.', { name: name }) }
      : { title: 'Descartar los cambios', text: tr('Los cambios de «{name}» no se han guardado. Si sales, se perderán.', { name: name }) };
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
    if (isNewDraft() || !C.folder.isConnected()) return commitDraft();
    // A saved song: if its file changed on disk since it was opened (another tab, a hand edit), ask first.
    C.folder.hasConflict(draft.id).then(function (changed) {
      if (state.draft !== draft) return;               // closed meanwhile
      if (!changed) return commitDraft();
      C.ui.confirm({
        title: 'El archivo ha cambiado',
        text: tr('«{name}» se ha modificado fuera de esta pantalla (otra pestaña o el archivo a mano) desde que la abriste. Si guardas, se sobrescribirá con tu versión.', { name: draft.title }),
        ok: 'Sobrescribir',
        danger: true
      }).then(function (yes) {
        if (yes && state.draft === draft) commitDraft();
      });
    });
  }

  function commitDraft() {
    var draft = state.draft;
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
    if (!store.canEdit()) return;
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

  // Opens a song that does not exist in the folder yet (a copy, an imported file) for editing, with the title
  // selected. Like any new song it is only a draft until Listo.
  function openDraft(draft) {
    if (!store.canEdit()) return;
    store.flushText();
    state.draft = draft;
    state.editId = draft.id;
    state.undo = [];
    state.redo = [];
    if (!draft.lines.length) draft.lines.push(blank());
    var last = draft.lines.length - 1;
    state.caret = { line: last, pos: draft.lines[last].notes.length };
    state.selectKey = 'title';
    C.router.go('#/song/' + draft.id, ['title']);
  }

  // A copy of a song to write a variant of it.
  function duplicateSong(id) {
    if (!store.canEdit()) return;
    var original = store.find(id);
    if (!original) return;
    var copy = JSON.parse(JSON.stringify(original));
    copy.title = (original.title + tr(' (variante)')).slice(0, 80);
    copy.id = store.uniqueId(copy.title);
    openDraft(copy);
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
      if (changed) C.ui.toast(changed === 1 ? tr('Se ha cambiado 1 nota por su equivalente.') : tr('Se han cambiado {n} notas por su equivalente.', { n: changed }));
    });
  }

  // Puts a deleted song back where it was. It works on that song only, so it stays right even if the
  // editor was opened on another song in the meantime.
  function restoreSong(target, index) {
    store.mutate(function () {
      if (store.find(target.id)) return;
      state.songs.splice(Math.min(index, state.songs.length), 0, target);
    });
    C.ui.toast('Canción recuperada.');
  }

  // Deletes a song after confirming. Without an id it is the song being edited.
  function removeSong(id) {
    if (!store.canEdit()) return;
    var editing = song();
    var target = typeof id === 'string' ? store.find(id) : (editing && store.find(editing.id)) || editing;
    if (!target) return;
    if (target === state.draft) return C.router.go('#/');      // nothing saved yet: just give it up
    C.ui.confirm({
      title: 'Borrar canción',
      text: tr('Se borrará «{name}» con todas sus notas.', { name: target.title || tr('Sin título') }),
      ok: 'Borrar',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      var onSongPage = state.route.name === 'song';
      var index = state.songs.indexOf(target);
      store.mutate(function () {
        state.songs = state.songs.filter(function (s) { return s.id !== target.id; });
        if (state.editId === target.id) state.editId = null;
        if (state.draft && state.draft.id === target.id) state.draft = null;
      }, onSongPage ? undefined : ['add-song']);
      if (onSongPage) C.router.go('#/', ['add-song']);      // the song we were looking at is gone
      C.ui.toast('Canción borrada.', { label: 'Deshacer', run: function () { restoreSong(target, index); } });
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
    if (!target || state.caret.line === i) return;
    setCaret(i, target.lines[i].notes.length);
  }

  // The line before / after `line`, or -1.
  function lineBefore(target, line) {
    return line > 0 ? line - 1 : -1;
  }

  function lineAfter(target, line) {
    return line + 1 < target.lines.length ? line + 1 : -1;
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
  // The note just before the caret is the "selected" one (the others keys change it: sharp, flat, octave).
  function selectedNote() {
    var target = song();
    if (!target) return null;
    var line = target.lines[state.caret.line];
    return line && state.caret.pos > 0 ? line.notes[state.caret.pos - 1] : null;
  }

  // The note the user picked (clicked, or moved onto with the arrow keys) is the one the duration buttons
  // show and change. Otherwise they are for the next note: it is a quarter note unless a value was chosen
  // for it, and it goes back to a quarter note once it is placed.
  function pickedNote() {
    var pick = state.selection;
    var caret = state.caret;
    return pick && pick.line === caret.line && pick.index === caret.pos - 1 ? selectedNote() : null;
  }

  function currentDuration() {
    var code = pickedNote();
    var note = code ? C.notes.parse(code) : null;
    return note ? { key: note.duration, dotted: note.dotted } : state.duration;
  }

  function applyDuration(key, dotted) {
    var target = song();
    if (target && pickedNote()) {
      var caret = state.caret;
      var picked = state.selection;
      store.mutate(function () {
        var notes = target.lines[caret.line].notes;
        notes[caret.pos - 1] = C.notes.withDuration(notes[caret.pos - 1], key, dotted);
      }, ['dur:' + key]);
      state.selection = picked;
    } else {
      state.duration = { key: key, dotted: dotted };
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
  // Changes the note before the caret with `fn(code) -> code`, keeping it picked for Play.
  function changeSelected(fn) {
    var target = song();
    var caret = state.caret;
    if (!target || caret.pos < 1) return;
    var picked = state.selection;
    store.mutate(function () {
      var notes = target.lines[caret.line].notes;
      notes[caret.pos - 1] = fn(notes[caret.pos - 1]);
    });
    state.selection = picked;
  }

  // The last pitched note before the caret (rests are skipped, and so are the lines' limits), or null.
  function previousPitch() {
    var target = song();
    if (!target) return null;
    for (var l = state.caret.line; l >= 0; l--) {
      var notes = target.lines[l].notes;
      for (var n = (l === state.caret.line ? state.caret.pos : notes.length) - 1; n >= 0; n--) {
        var note = C.notes.parse(notes[n]);
        if (note && !note.rest) return note;
      }
    }
    return null;
  }

  // Typing a note name (keys 1-7): it goes in the octave of the last note before it, so a melody stays in
  // the register it started in, even after a rest or a line break.
  function typeNote(name) {
    var previous = previousPitch();
    var octave = previous ? (previous.octave === 'high2' ? 'high' : previous.octave) : 'mid';
    add(C.notes.build(name, '', octave));
  }

  // + / # and - / b: sharp or flat on the note before the caret, only of the kind the song uses.
  function typeAccidental(mark) {
    var target = song();
    var code = selectedNote();
    var note = code && C.notes.parse(code);
    if (!target || !note || note.rest) return;
    var uses = target.signature === 'flat' ? 'b' : (target.signature === 'sharp' ? '#' : '');
    if (uses !== mark) {
      C.ui.toast(uses
        ? tr(uses === 'b' ? 'Esta canción usa bemoles.' : 'Esta canción usa sostenidos.')
        : 'Esta canción no usa alteraciones. Cámbialo con «Tonalidad».');
      return;
    }
    changeSelected(function (c) { return C.notes.withAccidental(c, note.accidental === mark ? '' : mark); });
  }

  function shiftSelectedOctave(delta) {
    var code = selectedNote();
    if (code && C.notes.shiftOctave(code, delta) === code && !C.notes.parse(code).rest) {
      C.ui.toast(delta > 0 ? 'Ya está en la octava más aguda.' : 'Ya está en la octava más grave.');
      return;
    }
    changeSelected(function (c) { return C.notes.shiftOctave(c, delta); });
  }

  function moveCaretTo(edge) {
    var target = song();
    if (!target) return;
    var line = state.caret.line;
    setCaret(line, edge === 'start' ? 0 : target.lines[line].notes.length, edge === 'end');
  }

  function add(code) {
    if (!song()) return;
    var value = state.duration;
    state.duration = { key: 'q', dotted: false };
    store.mutate(function () {
      var caret = state.caret;
      song().lines[caret.line].notes.splice(caret.pos, 0, C.notes.withDuration(code, value.key, value.dotted));
      state.caret = { line: caret.line, pos: caret.pos + 1 };
      // The note just placed is "picked" too, like clicking it: its duration can be changed right away,
      // with no need to move off it and back (it also matches the highlight placeCaret() already gives it).
      state.selection = { line: caret.line, index: caret.pos };
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

  // Moves line `from` so that it ends up at index `to` (both counted before the move). The caret stays on
  // the line it was on.
  function moveLine(from, to) {
    var target = song();
    if (!target || from === to || from < 0 || to < 0 || from >= target.lines.length || to >= target.lines.length) return;
    store.mutate(function () {
      var carried = target.lines[state.caret.line];
      var moved = target.lines.splice(from, 1)[0];
      target.lines.splice(to, 0, moved);
      state.caret = { line: Math.max(0, target.lines.indexOf(carried)), pos: state.caret.pos };
    }, ['up:' + to, 'down:' + to]);
  }

  // A copy of line `i` right below it, with the caret at its end.
  function duplicateLine(i) {
    var target = song();
    if (!target || !target.lines[i]) return;
    store.mutate(function () {
      var copy = JSON.parse(JSON.stringify(target.lines[i]));
      target.lines.splice(i + 1, 0, copy);
      state.caret = { line: i + 1, pos: copy.notes.length };
    }, ['dup:' + (i + 1)]);
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
  var KEY_DURATIONS = ['s', 'e', 'q', 'h', 'w'];      // the letters of the note values (see C.notes.DURATIONS)

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

    var mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key === 'Enter') {            // Ctrl+Enter: Listo, from anywhere
      e.preventDefault();
      stop();
      return;
    }

    if (t.closest && t.closest('input, textarea, select, dialog, .menu, [contenteditable]')) return;

    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) store.redo(); else store.undo();
    } else if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      store.redo();
    } else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var line = state.caret.line;
      if (e.shiftKey) duplicateLine(line);
      else moveLine(line, line + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (!mod && !e.altKey) {
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (e.key === 'Delete') { e.preventDefault(); forwardDelete(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCaret(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCaret(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); shiftSelectedOctave(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); shiftSelectedOctave(-1); }
      else if (e.key === 'Home') { e.preventDefault(); moveCaretTo('start'); }
      else if (e.key === 'End') { e.preventDefault(); moveCaretTo('end'); }
      else if (t.closest && t.closest('button, a')) return;      // Enter and letters keep their meaning on a focused button
      else if (e.key === 'Enter') { e.preventDefault(); newLine(); }
      else if (/^[1-7]$/.test(e.key)) { e.preventDefault(); typeNote(C.notes.NAMES[Number(e.key) - 1]); }
      else if (e.key === '0') { e.preventDefault(); add('R'); }
      else if (e.key === '+' || e.key === '#') { e.preventDefault(); typeAccidental('#'); }
      else if (e.key === '-' || e.key === 'b' || e.key === 'B') { e.preventDefault(); typeAccidental('b'); }
      else if (e.key === '.') { e.preventDefault(); toggleDot(); }
      else if (KEY_DURATIONS.indexOf(e.key.toLowerCase()) >= 0) { e.preventDefault(); setDuration(e.key.toLowerCase()); }
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
    duplicateSong: duplicateSong,
    openDraft: openDraft,
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
    removeLine: removeLine,
    moveLine: moveLine,
    duplicateLine: duplicateLine
  };
})(window.Songbook = window.Songbook || {});
