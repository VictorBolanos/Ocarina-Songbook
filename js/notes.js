(function (C) {
  'use strict';

  var NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

  // Octave key -> label, the suffix used in a stored note code ("Re^" is a Re in the high octave) and
  // how many semitones it sits above the middle octave when played. The 12-hole ocarina this page is
  // written for starts at Do = C5 (all ten finger holes closed, both small holes open), so "media" is
  // C5-B5, "grave" reaches down to La4 / Si4, and "aguda" goes up to Fa6.
  var OCTAVES = {
    low:   { label: 'grave',       mark: '_',  shift: -12 },
    mid:   { label: 'media',       mark: '',   shift: 0   },
    high:  { label: 'aguda',       mark: '^',  shift: 12  },
    high2: { label: 'súper aguda', mark: '^^', shift: 24  }
  };
  var OCTAVE_BY_MARK = { '': 'mid', '_': 'low', '^': 'high', '^^': 'high2' };

  var SEMITONE = { Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
  var ACCIDENTAL_SHIFT = { '': 0, '#': 1, 'b': -1 };
  var ACCIDENTAL_WORD = { '': '', '#': ' sostenido', 'b': ' bemol' };
  var ACCIDENTAL_GLYPH = { '': '', '#': '\u266F', 'b': '\u266D' };
  var MIDI_MIDDLE_DO = 72;                   // C5

  // Note values, shortest first. `beats` counts quarter notes ("negra" = 1 beat, the default).
  var DURATIONS = [
    { key: 's', label: 'Semicorchea', beats: 0.25 },
    { key: 'e', label: 'Corchea',     beats: 0.5  },
    { key: 'q', label: 'Negra',       beats: 1    },
    { key: 'h', label: 'Blanca',      beats: 2    },
    { key: 'w', label: 'Redonda',     beats: 4    }
  ];
  var DURATION_BY_KEY = {};
  DURATIONS.forEach(function (d) { DURATION_BY_KEY[d.key] = d; });

  // A stored note is a name plus optional marks, then an optional duration:
  //   Re  Fa#  Sib  Do^  Si_  Re^^   pitch (# sharp, b flat, ^ / ^^ / _ octave)
  //   R                          a rest (silencio)
  //   Re:h  Do:e.  R:q.          duration after ":" - w whole, h half, q quarter (default), e eighth,
  //                              s sixteenth - with "." for a dotted note (x1.5)
  var CODE_RE = /^(?:(Do|Re|Mi|Fa|Sol|La|Si)([#b])?(\^\^|\^|_)?|R)(?::([whqes])(\.)?)?$/;

  // "Fa#^:e." -> { name: 'Fa', rest: false, accidental: '#', octave: 'high', duration: 'e', dotted: true }.
  // `accidental` is '#' (sharp), 'b' (flat) or '' (natural).
  // Returns null for anything that is not a note.
  function parse(code) {
    var m = CODE_RE.exec(code);
    if (!m) return null;
    return {
      name: m[1] || 'R',
      rest: !m[1],
      accidental: m[2] || '',
      octave: OCTAVE_BY_MARK[m[3] || ''],
      duration: m[4] || 'q',
      dotted: !!m[5]
    };
  }

  // The inverse of parse(): the stored text of a note. A plain quarter note has no duration suffix.
  function format(note) {
    var pitch = note.rest ? 'R' : note.name + note.accidental + OCTAVES[note.octave].mark;
    var plain = note.duration === 'q' && !note.dotted;
    return pitch + (plain ? '' : ':' + note.duration + (note.dotted ? '.' : ''));
  }

  // The same note with another duration, e.g. withDuration('Re', 'h', false) -> 'Re:h'.
  function withDuration(code, duration, dotted) {
    var note = parse(code);
    if (!note) return code;
    note.duration = duration;
    note.dotted = !!dotted;
    return format(note);
  }

  function beats(note) {
    return DURATION_BY_KEY[note.duration].beats * (note.dotted ? 1.5 : 1);
  }

  // Short text for the badge on a chip: the length in beats, nothing for a plain quarter note.
  var FRACTIONS = { 0.25: '¼', 0.375: '⅜', 0.5: '½', 0.75: '¾', 1.5: '1½' };
  function badge(note) {
    var n = beats(note);
    if (n === 1) return '';
    return FRACTIONS[n] || String(n);
  }

  // MIDI number of a pitched note (60 = C4), or null for a rest.
  function midi(note) {
    if (note.rest) return null;
    return MIDI_MIDDLE_DO + SEMITONE[note.name] + ACCIDENTAL_SHIFT[note.accidental] + OCTAVES[note.octave].shift;
  }

  // Which of the twelve pitches of the octave a note is (0 = Do ... 11 = Si), so that enharmonic spellings
  // such as Sol# and Lab compare equal. Null for a rest.
  function pitchClass(note) {
    if (note.rest) return null;
    return (((SEMITONE[note.name] + ACCIDENTAL_SHIFT[note.accidental]) % 12) + 12) % 12;
  }

  // The stored text of a pitch built from its parts, e.g. build('Si', 'b', 'high') -> 'Sib^'.
  function build(name, accidental, octave) {
    return format({ name: name, rest: false, accidental: accidental, octave: octave, duration: 'q', dotted: false });
  }

  // Pitch class -> how it is spelled with sharps or with flats (the naturals are the same in both).
  var SPELLING = {
    '#': [['Do', ''], ['Do', '#'], ['Re', ''], ['Re', '#'], ['Mi', ''], ['Fa', ''], ['Fa', '#'], ['Sol', ''], ['Sol', '#'], ['La', ''], ['La', '#'], ['Si', '']],
    'b': [['Do', ''], ['Re', 'b'], ['Re', ''], ['Mi', 'b'], ['Mi', ''], ['Fa', ''], ['Sol', 'b'], ['Sol', ''], ['La', 'b'], ['La', ''], ['Si', 'b'], ['Si', '']]
  };

  // The same sound written with the other kind of accidental: respell('Reb:h', '#') -> 'Do#:h',
  // respell('Mi#', 'b') -> 'Fa', respell('Dob', '#') -> 'Si_' (Do flat sounds as the Si below).
  // Rests, naturals and notes that already use `accidental` come back as they were, and so does a note
  // whose octave would fall outside the four the page has.
  function respell(code, accidental) {
    var note = parse(code);
    if (!note || note.rest || !note.accidental || note.accidental === accidental) return code;
    var target = SPELLING[accidental][pitchClass(note)];
    var base = MIDI_MIDDLE_DO + SEMITONE[target[0]] + ACCIDENTAL_SHIFT[target[1]];
    var shift = midi(note) - base;
    var octave = Object.keys(OCTAVES).filter(function (key) { return OCTAVES[key].shift === shift; })[0];
    if (!octave) return code;
    note.name = target[0];
    note.accidental = target[1];
    note.octave = octave;
    return format(note);
  }

  function frequency(midiNumber) {
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
  }

  // Text for screen readers and tooltips, e.g. "Fa sostenido, octava aguda, corchea".
  function describe(note) {
    if (note.rest) return 'Silencio' + durationText(note);
    return note.name + ACCIDENTAL_WORD[note.accidental] + ', octava ' + OCTAVES[note.octave].label + durationText(note);
  }

  function durationText(note) {
    if (note.duration === 'q' && !note.dotted) return '';
    return ', ' + DURATION_BY_KEY[note.duration].label.toLowerCase() + (note.dotted ? ' con puntillo' : '');
  }

  // Id of the <symbol> that draws this note's fingering (see the sprite in the HTML), or null when
  // that note has no diagram yet. Ids: oc-do, oc-do-s (sharp), oc-re-f (flat), oc-high-do, ...
  function fingeringId(note) {
    if (note.rest) return null;
    var parts = ['oc'];
    if (note.octave !== 'mid') parts.push(note.octave);
    parts.push(note.name.toLowerCase());
    if (note.accidental) parts.push(note.accidental === '#' ? 's' : 'f');
    var id = parts.join('-');
    return document.getElementById(id) ? id : null;
  }

  function group(label, octave) {
    return {
      label: label,
      codes: NAMES.map(function (name) { return name + OCTAVES[octave].mark; })
    };
  }

  // What the editor's note palette offers, in display order: high notes on top and low ones below, as on a staff.
  var PALETTE = [
    group('Aguda', 'high'),
    group('Media', 'mid'),
    group('Grave', 'low'),
    { label: 'Alteraciones', accidentals: true },       // filled in from the song's key signature
    { label: 'Silencio', codes: ['R'] }
  ];

  C.notes = {
    parse: parse,
    format: format,
    build: build,
    respell: respell,
    pitchClass: pitchClass,
    glyph: function (accidental) { return ACCIDENTAL_GLYPH[accidental]; },
    NAMES: NAMES,
    withDuration: withDuration,
    beats: beats,
    badge: badge,
    midi: midi,
    frequency: frequency,
    describe: describe,
    fingeringId: fingeringId,
    DURATIONS: DURATIONS,
    PALETTE: PALETTE
  };
})(window.Songbook = window.Songbook || {});
