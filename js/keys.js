(function (C) {
  'use strict';

  // Key signatures (armaduras). A song has a `signature` that says which kind of accidentals it uses:
  //   'none'   no accidentals (Do mayor / La menor)
  //   'flat'   flats  (the palette offers Si♭ Mi♭ La♭ Re♭ Sol♭ Do♭ Fa♭)
  //   'sharp'  sharps (the palette offers Fa♯ Do♯ Sol♯ Re♯ La♯ Mi♯ Si♯)
  //
  // The key itself is not stored: it is worked out from the accidentals the song really uses, so it
  // follows the music as it is written (see describe).
  //
  // Notes are always stored with their accidental written out (Sib, Fa#), so the signature never changes
  // how a note sounds. It decides which accidentals the editor offers and what the key is called.

  // The order in which accidentals are added to a signature.
  var ORDER = {
    flat:  ['Si', 'Mi', 'La', 'Re', 'Sol', 'Do', 'Fa'],
    sharp: ['Fa', 'Do', 'Sol', 'Re', 'La', 'Mi', 'Si']
  };
  var MARK = { flat: 'b', sharp: '#' };

  var TYPES = ['none', 'flat', 'sharp'];
  var TYPE_LABEL = { none: 'Sin alteraciones', flat: 'Bemoles ♭', sharp: 'Sostenidos ♯' };

  function spelled(name, accidental) {
    return { name: name, accidental: accidental || '' };
  }

  // [major tonic, relative minor tonic] for every count of flats (negative) or sharps (positive).
  var TONICS = {
    '-7': [spelled('Do', 'b'),  spelled('La', 'b')],
    '-6': [spelled('Sol', 'b'), spelled('Mi', 'b')],
    '-5': [spelled('Re', 'b'),  spelled('Si', 'b')],
    '-4': [spelled('La', 'b'),  spelled('Fa')],
    '-3': [spelled('Mi', 'b'),  spelled('Do')],
    '-2': [spelled('Si', 'b'),  spelled('Sol')],
    '-1': [spelled('Fa'),       spelled('Re')],
    '0':  [spelled('Do'),       spelled('La')],
    '1':  [spelled('Sol'),      spelled('Mi')],
    '2':  [spelled('Re'),       spelled('Si')],
    '3':  [spelled('La'),       spelled('Fa', '#')],
    '4':  [spelled('Mi'),       spelled('Do', '#')],
    '5':  [spelled('Si'),       spelled('Sol', '#')],
    '6':  [spelled('Fa', '#'),  spelled('Re', '#')],
    '7':  [spelled('Do', '#'),  spelled('La', '#')]
  };

  // Text of a spelled note: "La♭", "Fa♯", "Re".
  function label(note) {
    return C.i18n.noteName(note.name) + C.notes.glyph(note.accidental);
  }

  function pitchClass(note) {
    return C.notes.pitchClass(C.notes.parse(note.name + note.accidental));
  }

  // A stored signature as one of the three types, or null when it is missing or unknown. Files written
  // by an earlier version stored a number (negative flats, positive sharps, 0 none), which still reads.
  function clean(value) {
    if (TYPES.indexOf(value) >= 0) return value;
    var n = typeof value === 'number' ? value : NaN;
    if (!Number.isInteger(n) || Math.abs(n) > 7) return null;
    return n === 0 ? 'none' : (n < 0 ? 'flat' : 'sharp');
  }

  // For a song that has no signature: the kind of accidental its notes use most.
  function infer(lines) {
    var count = { flat: 0, sharp: 0 };
    lines.forEach(function (line) {
      line.notes.forEach(function (code) {
        var note = C.notes.parse(code);
        if (note && note.accidental === 'b') count.flat++;
        if (note && note.accidental === '#') count.sharp++;
      });
    });
    if (!count.flat && !count.sharp) return 'none';
    return count.sharp > count.flat ? 'sharp' : 'flat';
  }

  function typeLabel(type) {
    return TYPE_LABEL[type] || TYPE_LABEL.none;
  }

  // The accidentals a type offers, in the order they appear: [{ name: 'Si', accidental: 'b' }, ...].
  function accidentals(type) {
    var order = ORDER[type];
    if (!order) return [];
    return order.map(function (name) { return spelled(name, MARK[type]); });
  }

  // Note codes for the editor's "Alteraciones" row, in the given octave.
  function accidentalCodes(type, octave) {
    return accidentals(type).map(function (a) { return C.notes.build(a.name, a.accidental, octave); });
  }

  // The last pitched note of the song (rests don't count), as a pitch class, or null when there is none.
  function lastPitchClass(song) {
    for (var l = song.lines.length - 1; l >= 0; l--) {
      var notes = song.lines[l].notes;
      for (var n = notes.length - 1; n >= 0; n--) {
        var note = C.notes.parse(notes[n]);
        if (note && !note.rest) return C.notes.pitchClass(note);
      }
    }
    return null;
  }

  // The key of a song as text, worked out from the accidentals it uses (of the song's type; octave and
  // duration do not matter):
  //   - the furthest accidental in the signature order decides the pair of keys: with Si♭ and Mi♭ it is
  //     "Si♭ mayor / Sol menor" (two flats);
  //   - if some accidental before it is missing (Do♯ Sol♯ Mi♯ but no Fa♯ Re♯ La♯) the key is incomplete
  //     and gets "(personalizado)";
  //   - no accidentals used, whatever the type: Do mayor / La menor.
  // The last note then settles major or minor: ending on the major tonic gives the major key, on the
  // minor tonic the minor one, and otherwise both names are shown.
  function describe(type, song) {
    var order = ORDER[type];
    var present = {};
    if (order) {
      song.lines.forEach(function (line) {
        line.notes.forEach(function (code) {
          var note = C.notes.parse(code);
          if (note && !note.rest && note.accidental === MARK[type]) present[note.name] = true;
        });
      });
    }
    var furthest = 0;
    (order || []).forEach(function (name, i) { if (present[name]) furthest = i + 1; });
    var complete = (order || []).slice(0, furthest).every(function (name) { return present[name]; });
    var signature = type === 'flat' ? -furthest : furthest;

    var tonics = TONICS[String(signature)];
    var major = C.i18n.t('{note} mayor', { note: label(tonics[0]) });
    var minor = C.i18n.t('{note} menor', { note: label(tonics[1]) });
    var last = lastPitchClass(song);
    var mode = last === pitchClass(tonics[0]) ? 'major' : (last === pitchClass(tonics[1]) ? 'minor' : null);
    var text = mode === 'major' ? major : (mode === 'minor' ? minor : major + ' / ' + minor);
    var custom = !complete;
    return {
      signature: signature,
      major: major,
      minor: minor,
      mode: mode,
      custom: custom,
      text: custom ? text + C.i18n.t(' (personalizado)') : text
    };
  }

  C.keys = {
    TYPES: TYPES,
    clean: clean,
    infer: infer,
    typeLabel: typeLabel,
    accidentals: accidentals,
    accidentalCodes: accidentalCodes,
    describe: describe,
    label: label
  };
})(window.Songbook = window.Songbook || {});
