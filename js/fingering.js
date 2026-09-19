(function (C) {
  'use strict';

  // Fingerings: which of the ocarina's 12 holes are covered for each note.
  //
  // A fingering is a list of hole numbers. Notes the page ships with (the middle octave, no accidentals)
  // are in DEFAULTS; the ones the user draws with the fingering editor are stored in songs/fingerings.json
  // (see folder.js) and override or add to them. A fingering can be marked as not finished: the songs then
  // keep showing that note by its name, in every view. This file turns the finished ones into the <symbol>s
  // that the note chips draw with <use>, so a change shows on every song at once.
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var BASE = { href: 'src/img/ocarina_base.png', width: 200, height: 194 };

  // The holes, numbered right to left (1 = top right, 12 = far left). Thumb holes sit outside the body, so
  // they follow the theme ink to stay visible; finger holes sit on the white body. 6 and 9 are the two
  // small holes, open in the whole middle scale.
  var HOLES = [
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

  // Note key -> covered holes. The key is the note code without a duration ("Do", "Fa#^", "Sib_").
  var DEFAULTS = {
    'Do':  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12],
    'Re':  [2, 3, 4, 5, 7, 8, 10, 11, 12],
    'Mi':  [2, 4, 5, 7, 8, 10, 11, 12],
    'Fa':  [2, 5, 7, 8, 10, 11, 12],
    'Sol': [7, 10, 11, 12],
    'La':  [7, 11, 12],
    'Si':  [7, 12]
  };

  // The user's fingerings, from songs/fingerings.json: key -> { holes: [...], done: true|false }.
  // A fingering that is not `done` is still being drawn: the songs keep showing that note by its name.
  var custom = {};

  function own(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  // "Fa#^:e" -> "Fa#^". Null for a rest or anything that is not a pitch.
  function keyOf(code) {
    var note = typeof code === 'string' ? C.notes.parse(code) : code;
    if (!note || note.rest) return null;
    return C.notes.build(note.name, note.accidental, note.octave);
  }

  // The fingering of a key as { holes, done }, or null when it has none. The built-in ones are done.
  // `map` is the user's fingerings to look in (the live ones unless the editor passes its copy).
  function entryOf(key, map) {
    map = map || custom;
    if (own(map, key)) return map[key];
    return own(DEFAULTS, key) ? { holes: DEFAULTS[key], done: true } : null;
  }

  // The covered holes of a note that has a finished fingering, or null (none yet, or not done).
  function get(codeOrNote) {
    var key = keyOf(codeOrNote);
    var entry = key === null ? null : entryOf(key);
    return entry && entry.done ? entry.holes : null;
  }

  // A copy of the user's fingerings, to edit without touching the live ones.
  function overrides() {
    var copy = {};
    Object.keys(custom).forEach(function (key) {
      copy[key] = { holes: custom[key].holes.slice(), done: custom[key].done };
    });
    return copy;
  }

  // Every key that has a fingering (finished or not).
  function allKeys(map) {
    var keys = {};
    Object.keys(DEFAULTS).forEach(function (k) { keys[k] = true; });
    Object.keys(map || custom).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys);
  }

  // ---- The sprite -------------------------------------------------------------------------------------
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

  // Redraws the <defs> the chips point at: the holes, and one <symbol> per finished fingering.
  function rebuild() {
    var defs = document.getElementById('fingering-defs');
    if (!defs) return;
    defs.replaceChildren();
    HOLES.forEach(function (hole) { defs.appendChild(holeCircle(hole, 'h' + hole.n)); });
    allKeys().forEach(function (key) {
      var note = C.notes.parse(key);
      var holes = get(key);                          // only finished fingerings are drawn in the songs
      if (!note || !holes) return;
      var symbol = svgEl('symbol', { id: C.notes.fingeringName(note), viewBox: '0 0 ' + BASE.width + ' ' + BASE.height });
      var image = svgEl('image', { href: BASE.href, width: BASE.width, height: BASE.height });
      image.setAttribute('style', 'filter: var(--oc-halo)');
      symbol.appendChild(image);
      holes.forEach(function (n) { symbol.appendChild(svgEl('use', { href: '#h' + n })); });
      defs.appendChild(symbol);
    });
  }

  // An <svg> of the ocarina with the given holes covered (a static drawing, unlike the symbols, so it can also
  // show a fingering that is not finished).
  function diagram(holes, className) {
    var picture = svgEl('svg', { class: className || '', viewBox: '0 0 ' + BASE.width + ' ' + BASE.height, 'aria-hidden': 'true' });
    var image = svgEl('image', { href: BASE.href, width: BASE.width, height: BASE.height });
    image.setAttribute('style', 'filter: var(--oc-halo)');
    picture.appendChild(image);
    HOLES.forEach(function (hole) {
      if (holes.indexOf(hole.n) >= 0) picture.appendChild(holeCircle(hole));
    });
    return picture;
  }

  // ---- The file -----------------------------------------------------------------------------------------
  // A clean map: only keys that are a pitch without a duration; each value { holes, done } with the hole
  // numbers 1-12 sorted and unique. A plain list of holes (an older file) counts as finished.
  function sanitize(raw) {
    var clean = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
    Object.keys(raw).forEach(function (key) {
      if (keyOf(key) !== key) return;
      var value = raw[key];
      var list = Array.isArray(value) ? value : (value && Array.isArray(value.holes) ? value.holes : null);
      if (!list) return;
      var holes = {};
      list.forEach(function (n) {
        if (Number.isInteger(n) && n >= 1 && n <= HOLES.length) holes[n] = true;
      });
      clean[key] = {
        holes: Object.keys(holes).map(Number).sort(function (a, b) { return a - b; }),
        done: Array.isArray(value) ? true : value.done !== false
      };
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

  // The text of songs/fingerings.json: one note per line, so diffs stay readable.
  function toText(map) {
    var clean = sanitize(map);
    var keys = sortedKeys(clean);
    var lines = keys.map(function (k) {
      return '    ' + JSON.stringify(k) + ': { "holes": [' + clean[k].holes.join(', ') + '], "done": ' + clean[k].done + ' }';
    });
    return '{\n  "fingerings": {' + (lines.length ? '\n' + lines.join(',\n') + '\n  ' : '') + '}\n}\n';
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

  function fromText(text) {
    try {
      var data = JSON.parse(text);
      return sanitize(data && data.fingerings);
    } catch (e) {
      return {};
    }
  }

  // Replaces the user's fingerings with `map` (from the file, or from the editor). Returns true if anything
  // changed, so the caller knows to redraw.
  function setCustom(map) {
    var clean = sanitize(map);
    if (JSON.stringify(clean) === JSON.stringify(custom)) return false;
    custom = clean;
    rebuild();
    return true;
  }

  rebuild();

  C.fingering = {
    HOLES: HOLES,
    BASE: BASE,
    DEFAULTS: DEFAULTS,
    keyOf: keyOf,
    entryOf: entryOf,
    get: get,
    overrides: overrides,
    allKeys: allKeys,
    sanitize: sanitize,
    toText: toText,
    fromText: fromText,
    isValidText: isValidText,
    setCustom: setCustom,
    diagram: diagram,
    rebuild: rebuild
  };
})(window.Songbook = window.Songbook || {});
