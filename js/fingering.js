(function (C) {
  'use strict';

  // Fingerings: which holes of an ocarina are covered for each note. The page supports more than one
  // instrument (see INSTRUMENTS below); every instrument has its own holes, its own built-in DEFAULTS
  // (only the 12-hole ocarina has any so far) and its own custom fingerings.
  //
  // A fingering is a list of hole numbers (`holes`), plus optionally the holes that are covered only halfway
  // (`half`: the way the accidentals are played on many ocarinas, by partly venting a hole). The built-in
  // notes of the 12-hole ocarina (the middle octave, no accidentals) are in its DEFAULTS; the ones the user
  // draws with the fingering editor are stored in songs/fingerings.json (see folder.js), one section per
  // instrument, and override or add to them. A fingering can be marked as not finished: the songs then keep
  // showing that note by its name, in every view. Songs are always written for the 12-hole ocarina, but the
  // notes/fingering switch can draw any instrument's diagrams under them (js/preferences.js); this file
  // turns every instrument's finished fingerings into the <symbol>s the note chips draw with <use>, and
  // gives the fingerings page and the fingering editor the same tools for any instrument.
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- Instruments -----------------------------------------------------------------------------------
  var BASE12 = { href: 'src/img/digitation base/ocarina_12_base.png', width: 200, height: 194 };

  // The holes of the 12-hole ocarina, numbered right to left (1 = top right, 12 = far left). Thumb holes
  // sit outside the body, so they follow the theme ink to stay visible; finger holes sit on the white
  // body. 6 and 9 are the two small holes, open in the whole middle scale.
  var HOLES12 = [
    { n: 1,  cx: 165,  cy: 34.5, r: 9.2,  fill: '#161616' },
    { n: 2,  cx: 146.5, cy: 141.5, r: 10.6, fill: 'currentColor' },
    { n: 3,  cx: 143,  cy: 52,   r: 9.9,  fill: '#161616' },
    { n: 4,  cx: 125.5, cy: 74.5, r: 8.3,  fill: '#161616' },
    { n: 5,  cx: 114.5, cy: 96,   r: 8.8,  fill: '#161616' },
    { n: 6,  cx: 109.5, cy: 59,   r: 6.3,  fill: '#161616' },
    { n: 7,  cx: 80,   cy: 71.5, r: 9.2,  fill: '#161616' },
    { n: 8,  cx: 76.5, cy: 175,  r: 10.3, fill: 'currentColor' },
    { n: 9,  cx: 68,   cy: 127,  r: 6.1,  fill: '#161616' },
    { n: 10, cx: 65.5, cy: 94.5, r: 8.5,  fill: '#161616' },
    { n: 11, cx: 50,   cy: 115,  r: 9,    fill: '#161616' },
    { n: 12, cx: 30.5, cy: 132,  r: 9.8,  fill: '#161616' }
  ];

  // Note key -> covered holes, for the 12-hole ocarina. The key is the note code without a duration
  // ("Do", "Fa#^", "Sib_").
  var DEFAULTS12 = {
    'Do':  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12],
    'Re':  [2, 3, 4, 5, 7, 8, 10, 11, 12],
    'Mi':  [2, 4, 5, 7, 8, 10, 11, 12],
    'Fa':  [2, 5, 7, 8, 10, 11, 12],
    'Sol': [2, 7, 8, 10, 11, 12],
    'La':  [2, 7, 8, 11, 12],
    'Si':  [2, 7, 8, 12]
  };

  var BASE6 = { href: 'src/img/digitation base/ocarina_6_base.png', width: 200, height: 180 };

  // The holes of the 6-hole ocarina: 4 finger holes on top, in a 2x2 square (index and middle finger of
  // each hand), plus the 2 thumb holes underneath, outside the body outline (1-3 the right hand, 4-6 the
  // left, mirrored). Nothing is known yet about which notes they play (no physical instrument to check
  // against): DEFAULTS12 is left empty on purpose, see js/fingering-editor.js and the fingerings page.
  var HOLES6 = [
    { n: 1, cx: 123,   cy: 59,    r: 14.6, fill: '#161616' },
    { n: 2, cx: 122.5, cy: 101.5, r: 14.1, fill: '#161616' },
    { n: 3, cx: 146,   cy: 144,   r: 16.6, fill: 'currentColor' },
    { n: 4, cx: 52.5,  cy: 144,   r: 16.9, fill: 'currentColor' },
    { n: 5, cx: 75.5,  cy: 101.5, r: 14.1, fill: '#161616' },
    { n: 6, cx: 75.5,  cy: 59,    r: 14.4, fill: '#161616' }
  ];
  var DEFAULTS6 = {};

  // Every instrument the page knows the holes of. `id` is also the key it is stored under in
  // songs/fingerings.json (see toText/fromText below) and the value of the instrument picker.
  var INSTRUMENTS = {
    oc12: { id: 'oc12', name: 'Ocarina de 12 agujeros', holes: 12, BASE: BASE12, HOLES: HOLES12, DEFAULTS: DEFAULTS12 },
    oc6:  { id: 'oc6',  name: 'Ocarina de 6 agujeros',  holes: 6,  BASE: BASE6,  HOLES: HOLES6,  DEFAULTS: DEFAULTS6 }
  };
  var INSTRUMENT_ORDER = ['oc12', 'oc6'];

  function own(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  // An instrument by id, or the 12-hole ocarina (what the songs are written for) for anything else.
  function instrument(id) {
    return own(INSTRUMENTS, id) ? INSTRUMENTS[id] : INSTRUMENTS.oc12;
  }

  // Legacy aliases: songs, the score image and anything that does not care about other instruments keep
  // working exactly as before, always against the 12-hole ocarina.
  var BASE = BASE12;
  var HOLES = HOLES12;
  var DEFAULTS = DEFAULTS12;

  // The user's fingerings, from songs/fingerings.json: instrument id -> key -> { holes, half, done }.
  // A fingering that is not `done` is still being drawn: the songs keep showing that note by its name.
  var customByInstrument = { oc12: {}, oc6: {} };
  var custom = customByInstrument.oc12;      // legacy alias, kept in sync by setCustom()

  // Which instrument the fingerings page and the fingering editor show, kept between visits.
  var SELECTED_KEY = 'ocarina-instrument';
  var selected = 'oc12';
  try {
    var savedInstrument = localStorage.getItem(SELECTED_KEY);
    if (own(INSTRUMENTS, savedInstrument)) selected = savedInstrument;
  } catch (e) { /* keep the default */ }

  function select(id) {
    selected = own(INSTRUMENTS, id) ? id : 'oc12';
    try { localStorage.setItem(SELECTED_KEY, selected); } catch (e) { /* not persisted */ }
  }

  // "Fa#^:e" -> "Fa#^". Null for a rest or anything that is not a pitch.
  function keyOf(code) {
    var note = typeof code === 'string' ? C.notes.parse(code) : code;
    if (!note || note.rest) return null;
    return C.notes.build(note.name, note.accidental, note.octave);
  }

  // The fingering of a key as { holes, done }, or null when it has none. The built-in ones are done.
  // `map` is the fingerings to look in (the live ones of that instrument unless the editor passes its copy).
  function entryOf(key, instrumentId, map) {
    var inst = instrument(instrumentId);
    map = map || customByInstrument[inst.id];
    if (own(map, key)) return map[key];
    return own(inst.DEFAULTS, key) ? { holes: inst.DEFAULTS[key], half: [], done: true } : null;
  }

  // The covered holes of a note that has a finished fingering, or null (none yet, or not done).
  function get(codeOrNote, instrumentId) {
    var key = keyOf(codeOrNote);
    var entry = key === null ? null : entryOf(key, instrumentId);
    return entry && entry.done ? entry.holes : null;
  }

  // The finished fingering of a note as { holes, half } (holes covered, holes covered halfway), or null.
  function shape(codeOrNote, instrumentId) {
    var key = keyOf(codeOrNote);
    var entry = key === null ? null : entryOf(key, instrumentId);
    return entry && entry.done ? { holes: entry.holes, half: entry.half || [] } : null;
  }

  // A copy of one instrument's user fingerings, to edit without touching the live ones.
  function overrides(instrumentId) {
    var map = customByInstrument[instrument(instrumentId).id];
    var copy = {};
    Object.keys(map).forEach(function (key) {
      copy[key] = { holes: map[key].holes.slice(), half: (map[key].half || []).slice(), done: map[key].done };
    });
    return copy;
  }

  // Every key that has a fingering (finished or not) on one instrument.
  function allKeys(instrumentId, map) {
    var inst = instrument(instrumentId);
    var keys = {};
    Object.keys(inst.DEFAULTS).forEach(function (k) { keys[k] = true; });
    Object.keys(map || customByInstrument[inst.id]).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys);
  }

  // ---- The sprite -------------------------------------------------------------------------------------
  // Only the 12-hole ocarina's finished fingerings are turned into symbols: songs are always written for
  // it, so this is the only instrument the note chips (and the score image) ever need to draw.
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (name) { el.setAttribute(name, attrs[name]); });
    return el;
  }

  function holeCircle(hole, id) {
    // A covered hole is painted with the theme's own colour and a dark outline, so it stands out from an
    // open one on the white body and, for the thumb holes, on the page around it (light or dark).
    var attrs = { cx: hole.cx, cy: hole.cy, r: hole.r, class: 'oc-hole', style: 'fill: var(--hole, #161616); stroke: #161616; stroke-width: 1.6' };
    if (id) attrs.id = id;
    return svgEl('circle', attrs);
  }

  // A hole covered halfway: the left half of the hole is filled.
  function holeHalf(hole, id) {
    var d = 'M' + hole.cx + ' ' + (hole.cy - hole.r) + 'A' + hole.r + ' ' + hole.r + ' 0 0 0 ' + hole.cx + ' ' + (hole.cy + hole.r) + 'Z';
    var attrs = { d: d, class: 'oc-hole oc-half', style: 'fill: var(--hole, #161616); stroke: #161616; stroke-width: 1.6' };
    if (id) attrs.id = id;
    return svgEl('path', attrs);
  }

  // Redraws the <defs> the chips point at: the holes and one <symbol> per finished fingering, of every
  // instrument (songs are always written for the 12-hole one, but the notes/fingering switch can show any
  // instrument's diagrams, see js/preferences.js). Everything is scoped by instrument id (oc12-h1,
  // oc6-h1...) since two instruments can have their own, unrelated hole 1.
  function rebuild() {
    var defs = document.getElementById('fingering-defs');
    if (!defs) return;
    defs.replaceChildren();
    INSTRUMENT_ORDER.forEach(function (instrumentId) {
      var inst = INSTRUMENTS[instrumentId];
      inst.HOLES.forEach(function (hole) {
        defs.appendChild(holeCircle(hole, instrumentId + '-h' + hole.n));
        defs.appendChild(holeHalf(hole, instrumentId + '-h' + hole.n + 'h'));
      });
      allKeys(instrumentId).forEach(function (key) {
        var note = C.notes.parse(key);
        var drawn = shape(key, instrumentId);          // only finished fingerings are drawn in the songs
        if (!note || !drawn) return;
        var symbol = svgEl('symbol', { id: C.notes.fingeringName(note, instrumentId), viewBox: '0 0 ' + inst.BASE.width + ' ' + inst.BASE.height });
        var image = svgEl('image', { href: inst.BASE.href, width: inst.BASE.width, height: inst.BASE.height });
        image.setAttribute('style', 'filter: var(--oc-halo)');
        symbol.appendChild(image);
        drawn.holes.forEach(function (n) { symbol.appendChild(svgEl('use', { href: '#' + instrumentId + '-h' + n })); });
        drawn.half.forEach(function (n) { symbol.appendChild(svgEl('use', { href: '#' + instrumentId + '-h' + n + 'h' })); });
        defs.appendChild(symbol);
      });
    });
  }

  // An <svg> of an ocarina with the given holes covered (a static drawing, unlike the symbols, so it can
  // also show a fingering that is not finished, and any instrument, not only the 12-hole one).
  function diagram(holes, className, half, instrumentId) {
    var inst = instrument(instrumentId);
    var picture = svgEl('svg', { class: className || '', viewBox: '0 0 ' + inst.BASE.width + ' ' + inst.BASE.height, 'aria-hidden': 'true' });
    var image = svgEl('image', { href: inst.BASE.href, width: inst.BASE.width, height: inst.BASE.height });
    image.setAttribute('style', 'filter: var(--oc-halo)');
    picture.appendChild(image);
    inst.HOLES.forEach(function (hole) {
      if (holes.indexOf(hole.n) >= 0) picture.appendChild(holeCircle(hole));
      else if (half && half.indexOf(hole.n) >= 0) picture.appendChild(holeHalf(hole));
    });
    return picture;
  }

  // ---- The file -----------------------------------------------------------------------------------------
  // A clean map for one instrument: only keys that are a pitch without a duration; each value
  // { holes, done } with the hole numbers sorted, unique and within that instrument's holes. A plain list
  // of holes (an older file, or a backup made before an instrument had a name of its own) counts as finished.
  function sanitize(raw, instrumentId) {
    var inst = instrument(instrumentId);
    var clean = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
    Object.keys(raw).forEach(function (key) {
      if (keyOf(key) !== key) return;
      var value = raw[key];
      var list = Array.isArray(value) ? value : (value && Array.isArray(value.holes) ? value.holes : null);
      if (!list) return;
      var holes = {};
      list.forEach(function (n) {
        if (Number.isInteger(n) && n >= 1 && n <= inst.HOLES.length) holes[n] = true;
      });
      var halves = {};
      (!Array.isArray(value) && Array.isArray(value.half) ? value.half : []).forEach(function (n) {
        if (Number.isInteger(n) && n >= 1 && n <= inst.HOLES.length && !holes[n]) halves[n] = true;     // a hole is covered or halfway, not both
      });
      var half = Object.keys(halves).map(Number).sort(function (a, b) { return a - b; });
      var entry = { holes: Object.keys(holes).map(Number).sort(function (a, b) { return a - b; }) };
      if (half.length) entry.half = half;
      entry.done = Array.isArray(value) ? true : value.done !== false;
      clean[key] = entry;
    });
    return clean;
  }

  // Notes in the order of the palette: high octave first, then middle, then low.
  var RANK = { high: 0, mid: 1, low: 2 };
  function sortedKeys(map) {
    return Object.keys(map).sort(function (a, b) {
      var x = C.notes.parse(a);
      var y = C.notes.parse(b);
      return (RANK[x.octave] || 0) - (RANK[y.octave] || 0) ||
        C.notes.NAMES.indexOf(x.name) - C.notes.NAMES.indexOf(y.name) ||
        x.accidental.localeCompare(y.accidental);
    });
  }

  // A raw fingerings object (from a file, or a backup) is either the current shape, one section per
  // instrument ({ "oc12": {...}, "oc6": {...} }), or an older file: a single, flat note map, from before
  // there was more than one instrument. That older shape is read as the 12-hole ocarina's own section.
  function isNested(raw) {
    return !!raw && typeof raw === 'object' && !Array.isArray(raw) && (own(raw, 'oc12') || own(raw, 'oc6'));
  }

  // A clean { "oc12": {...}, "oc6": {...} } out of anything read from disk or a backup file.
  function sanitizeAll(raw) {
    var nested = isNested(raw);
    var clean = {};
    INSTRUMENT_ORDER.forEach(function (id) {
      clean[id] = sanitize(nested ? raw[id] : (id === 'oc12' ? raw : null), id);
    });
    return clean;
  }

  // The text of songs/fingerings.json: one section per instrument, one note per line within it, so diffs
  // stay readable. `map` is either the current shape or an older, flat one (see isNested above).
  function toText(map) {
    var clean = sanitizeAll(map);
    var sections = INSTRUMENT_ORDER.map(function (id) {
      var keys = sortedKeys(clean[id]);
      if (!keys.length) return '    ' + JSON.stringify(id) + ': {}';
      var lines = keys.map(function (k) {
        return '      ' + JSON.stringify(k) + ': { "holes": [' + clean[id][k].holes.join(', ') + ']' +
          (clean[id][k].half ? ', "half": [' + clean[id][k].half.join(', ') + ']' : '') + ', "done": ' + clean[id][k].done + ' }';
      });
      return '    ' + JSON.stringify(id) + ': {\n' + lines.join(',\n') + '\n    }';
    });
    return '{\n  "fingerings": {\n' + sections.join(',\n') + '\n  }\n}\n';
  }

  // False when the text is not JSON (a damaged file), so it is never mistaken for "no fingerings yet".
  function isValidText(text) {
    try {
      var data = JSON.parse(text);
      return !!data && typeof data === 'object' && !Array.isArray(data);
    } catch (e) {
      return false;
    }
  }

  // { "oc12": {...}, "oc6": {...} }, clean, from the text of songs/fingerings.json.
  function fromText(text) {
    try {
      return sanitizeAll(JSON.parse(text).fingerings);
    } catch (e) {
      return sanitizeAll(null);
    }
  }

  // Replaces the user's fingerings of every instrument with `map` ({ "oc12": {...}, "oc6": {...} }, or an
  // older flat map for the 12-hole ocarina alone). Returns true if anything changed, so the caller knows
  // to redraw.
  function setCustom(map) {
    var clean = sanitizeAll(map);
    if (JSON.stringify(clean) === JSON.stringify(customByInstrument)) return false;
    customByInstrument = clean;
    custom = customByInstrument.oc12;
    rebuild();                     // only ever draws the 12-hole ocarina, see rebuild() above
    return true;
  }

  rebuild();

  C.fingering = {
    HOLES: HOLES,
    BASE: BASE,
    DEFAULTS: DEFAULTS,
    INSTRUMENTS: INSTRUMENTS,
    INSTRUMENT_ORDER: INSTRUMENT_ORDER,
    instrument: instrument,
    selected: function () { return selected; },
    select: select,
    keyOf: keyOf,
    entryOf: entryOf,
    get: get,
    shape: shape,
    overrides: overrides,
    allKeys: allKeys,
    sanitize: sanitize,
    sanitizeAll: sanitizeAll,
    toText: toText,
    fromText: fromText,
    isValidText: isValidText,
    setCustom: setCustom,
    diagram: diagram,
    rebuild: rebuild
  };
})(window.Songbook = window.Songbook || {});
