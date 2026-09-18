(function (C) {
  'use strict';

  var NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

  // Octave key -> label and the suffix used in a stored note code ("Re^" is a Re in the high octave).
  var OCTAVES = {
    low:   { label: 'grave',       mark: '_'  },
    mid:   { label: 'media',       mark: ''   },
    high:  { label: 'aguda',       mark: '^'  },
    high2: { label: 'súper aguda', mark: '^^' }
  };
  var OCTAVE_BY_MARK = { '': 'mid', '_': 'low', '^': 'high', '^^': 'high2' };
  var CODE_RE = /^(Do|Re|Mi|Fa|Sol|La|Si)(#)?(\^\^|\^|_)?$/;

  // "Fa#^" -> { name: 'Fa', sharp: true, octave: 'high' }. Returns null for anything that is not a note.
  function parse(code) {
    var m = CODE_RE.exec(code);
    if (!m) return null;
    return { name: m[1], sharp: !!m[2], octave: OCTAVE_BY_MARK[m[3] || ''] };
  }

  // Text for screen readers and tooltips, e.g. "Fa sostenido, octava aguda".
  function describe(note) {
    return note.name + (note.sharp ? ' sostenido' : '') + ', octava ' + OCTAVES[note.octave].label;
  }

  // Id of the <symbol> that draws this note's fingering (see the sprite in the HTML), or null when
  // that note has no diagram yet. Ids: oc-do, oc-do-s (sharp), oc-high-do, oc-high-do-s, ...
  function fingeringId(note) {
    var parts = ['oc'];
    if (note.octave !== 'mid') parts.push(note.octave);
    parts.push(note.name.toLowerCase());
    if (note.sharp) parts.push('s');
    var id = parts.join('-');
    return document.getElementById(id) ? id : null;
  }

  function group(label, octave) {
    return {
      label: label,
      codes: NAMES.map(function (name) { return name + OCTAVES[octave].mark; })
    };
  }

  // What the editor's note palette offers, in display order.
  var PALETTE = [
    group('Media', 'mid'),
    group('Grave', 'low'),
    group('Aguda', 'high'),
    group('Súper aguda', 'high2'),
    { label: 'Sostenido', codes: ['Do#', 'Re#', 'Fa#', 'Sol#', 'La#'] }
  ];

  C.notes = { parse: parse, describe: describe, fingeringId: fingeringId, PALETTE: PALETTE };
})(window.Cancionero = window.Cancionero || {});
