(function (C) {
  'use strict';

  // The score as a PNG image. Every line of the song becomes a staff, like a printed score:
  //   - a treble clef, the key signature and (on the first staff) the time signature;
  //   - each note at its pitch, with the right head (whole, half, filled), stem, flags, beams and dots,
  //     and rests of every length, so the note values are always drawn;
  //   - bar lines where the time signature allows them;
  //   - under each note, what the person chose: its name, its fingering diagram, or both.
  // It is drawn on a canvas with white paper and dark ink whatever theme the page is using, and needs no
  // library. Layout is in "layout units" (pixels before scaling); SP is one staff space.
  var tr = C.i18n.t;

  var SP = 10;
  var INK = '#1d1a17';
  var SOFT = '#6f665d';
  var FAINT = '#c9c2b8';
  var PAPER = '#ffffff';
  var SANS = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif';
  var SERIF = 'Georgia, "Times New Roman", "Noto Serif", serif';
  var CLEF_FONTS = '"Segoe UI Symbol", "Noto Music", "Apple Symbols", "Bravura Text", "Noto Sans Symbols 2", "Symbola", sans-serif';
  var EPS = 1e-6;

  var MARGIN = 56;
  var MIN_STAFF = 480;
  var MAX_STAFF = 1120;
  var HEAD_HALF = 0.63 * SP;             // half the width of a note head
  var STEM_W = 0.115 * SP;
  var BEAM = 0.5 * SP;                   // thickness of a beam
  var BEAM_STEP = 0.75 * SP;             // distance between two beams
  var MID = 2 * SP;                      // the middle line of the staff, from the top line
  var STAFF_H = 4 * SP;

  // What goes under each note.
  var MODES = {
    names:     { slot: 44, diagram: false, name: true },
    fingering: { slot: 62, diagram: true,  name: false },
    both:      { slot: 62, diagram: true,  name: true }
  };
  var DIAGRAM_W = 50;
  var DIAGRAM_H = DIAGRAM_W * 194 / 200;
  var NAME_H = 20;

  var LETTER = { Do: 0, Re: 1, Mi: 2, Fa: 3, Sol: 4, La: 5, Si: 6 };
  var OCTAVE_NUMBER = { low: 4, mid: 5, high: 6, high2: 7 };
  var VALUE = { s: 0.25, e: 0.5, q: 1, h: 2, w: 4 };

  // Where the accidentals of a key signature sit on a treble staff (steps up from the bottom line).
  var SIG_STEPS = {
    flat:  { Si: 4, Mi: 7, La: 3, Re: 6, Sol: 2, Do: 5, Fa: 1 },
    sharp: { Fa: 8, Do: 5, Sol: 9, Re: 6, La: 3, Mi: 7, Si: 4 }
  };
  var SIG_ORDER = {
    flat:  ['Si', 'Mi', 'La', 'Re', 'Sol', 'Do', 'Fa'],
    sharp: ['Fa', 'Do', 'Sol', 'Re', 'La', 'Mi', 'Si']
  };

  // ---- The song as notes -----------------------------------------------------------------------------------
  // The steps of the staff: 0 is the bottom line (E4), 2 the next line, ... 8 the top line (F5). The ocarina's
  // middle octave starts at C5 (step 5).
  function stepOf(note) {
    return OCTAVE_NUMBER[note.octave] * 7 + LETTER[note.name] - 30;
  }

  function meterOf(song) {
    var m = /^\s*(\d{1,2})\s*\/\s*(2|4|8|16)\s*$/.exec(song.meter || '');
    if (!m || !Number(m[1])) return null;
    var num = Number(m[1]);
    var den = Number(m[2]);
    return { num: num, den: den, text: [String(num), String(den)], bar: num * 4 / den, beat: den === 8 && num % 3 === 0 ? 1.5 : 1 };
  }

  // The notes of every line that has any, each with where it starts (in quarter notes) and how long it lasts.
  function collect(song) {
    var lines = [];
    var pos = 0;
    song.lines.forEach(function (line) {
      var items = [];
      line.notes.forEach(function (code) {
        var note = C.notes.parse(code);
        if (!note) return;
        var dur = C.notes.beats(note);
        items.push({ code: code, note: note, pos: pos, dur: dur, value: VALUE[note.duration], dotted: note.dotted });
        pos += dur;
      });
      if (items.length) lines.push({ subtitle: line.subtitle || '', items: items });
    });
    return lines;
  }

  function onBoundary(pos, bar) {
    var r = pos / bar;
    return Math.abs(r - Math.round(r)) < EPS;
  }

  // Bar lines are only drawn when every note sits inside one bar of the time signature: a song that starts
  // with a pick-up, or has an odd bar, is left without them rather than with wrong ones.
  function barsAreKnown(meter, items) {
    if (!meter) return false;
    return items.every(function (it) {
      return Math.floor(it.pos / meter.bar + EPS) === Math.floor((it.pos + it.dur) / meter.bar - EPS);
    });
  }

  // The key signature drawn on the staff: an accidental goes in it when every use of that letter in the song
  // has that same accidental. Anything else is written next to the note.
  function keySignature(song, items) {
    var type = C.keys.clean(song.signature);
    if (type === null) type = C.keys.infer(song.lines);
    var none = { type: null, letters: {}, order: [] };
    if (type !== 'flat' && type !== 'sharp') return none;
    var mark = type === 'flat' ? 'b' : '#';
    var seen = {};
    items.forEach(function (it) {
      if (it.note.rest) return;
      seen[it.note.name] = seen[it.note.name] || {};
      seen[it.note.name][it.note.accidental] = true;
    });
    var sig = { type: type, letters: {}, order: [] };
    SIG_ORDER[type].forEach(function (name) {
      var kinds = seen[name] ? Object.keys(seen[name]) : [];
      if (kinds.length === 1 && kinds[0] === mark) {
        sig.letters[name] = mark;
        sig.order.push(name);
      }
    });
    return sig.order.length ? sig : none;
  }

  // Which accidental sign a note needs in front of it, given the key signature and what already happened in
  // the bar: null, 'sharp', 'flat' or 'natural'.
  function accidentalFor(note, sig, state, barsKnown) {
    var key = note.name + note.octave;
    var inKey = sig.letters[note.name] || '';
    var current = Object.prototype.hasOwnProperty.call(state, key) ? state[key] : inKey;
    var wanted = note.accidental;
    var sign = null;
    if (wanted !== current) sign = wanted === '#' ? 'sharp' : (wanted === 'b' ? 'flat' : 'natural');
    else if (!barsKnown && wanted && wanted !== inKey) sign = wanted === '#' ? 'sharp' : 'flat';
    state[key] = wanted;
    return sign;
  }

  // ---- Measuring text -------------------------------------------------------------------------------------
  var scratch = null;
  function measure(font, text) {
    scratch = scratch || document.createElement('canvas').getContext('2d');
    scratch.font = font;
    return scratch.measureText(text).width;
  }

  var NAME_FONT = '700 15px ' + SANS;

  function noteLabel(note) {
    return C.i18n.noteName(note.name) + C.notes.glyph(note.accidental) + C.notes.displayMark(note.octave);
  }

  // ---- The model: elements, units and systems ---------------------------------------------------------------
  function buildModel(song, mode) {
    var lines = collect(song);
    var all = [];
    lines.forEach(function (line) { line.items.forEach(function (it) { all.push(it); }); });
    var meter = meterOf(song);
    var sig = keySignature(song, all);
    var barsKnown = barsAreKnown(meter, all);
    var state = {};

    lines.forEach(function (line, li) {
      var elems = [];
      line.items.forEach(function (it, i) {
        if (barsKnown && it.pos > EPS && onBoundary(it.pos, meter.bar)) {
          state = {};
          if (i > 0) elems.push({ type: 'bar' });
        }
        if (it.note.rest) {
          elems.push({ type: 'rest', pos: it.pos, dur: it.dur, value: it.value, dotted: it.dotted });
          return;
        }
        var drawn = mode.diagram ? C.fingering.shape(it.code) : null;
        var text = noteLabel(it.note);
        elems.push({
          type: 'note', pos: it.pos, dur: it.dur, value: it.value, dotted: it.dotted,
          step: stepOf(it.note), sign: accidentalFor(it.note, sig, state, barsKnown),
          text: text, holes: drawn ? drawn.holes : null, half: drawn ? drawn.half : [],
          drawDiagram: mode.diagram && !!drawn,
          drawName: mode.name || (mode.diagram && !drawn),
          textW: measure(NAME_FONT, text)
        });
      });
      var last = line.items[line.items.length - 1];
      if (li === lines.length - 1) elems.push({ type: 'end' });
      else if (barsKnown && onBoundary(last.pos + last.dur, meter.bar)) elems.push({ type: 'bar' });
      line.elems = elems;
    });
    return { lines: lines, meter: meter, sig: sig, barsKnown: barsKnown };
  }

  // How much room an element takes along the staff. Longer notes get more, but not in proportion, so the
  // labels under the notes keep a steady rhythm.
  function slotOf(e, mode) {
    if (e.type === 'bar') return 1.1 * SP;
    if (e.type === 'end') return 1.7 * SP;
    var min = mode.slot;
    if (e.type === 'rest') min *= 0.7;
    else if (e.drawName) min = Math.max(min, e.textW + 12);
    var extra = 1.3 * SP * Math.log2(Math.max(e.dur, 0.25) * 4);
    var need = e.type === 'note' && e.sign ? 2 * (HEAD_HALF + 1.4 * SP) : 2 * (HEAD_HALF + 0.9 * SP);
    return Math.max(min + extra, need);
  }

  // Notes that share a beam: short notes inside the same beat of the time signature.
  function groupUnits(elems, meter, mode) {
    var beat = meter ? meter.beat : 1;
    var units = [];
    function beamable(e) { return e && e.type === 'note' && e.value <= 0.5; }
    function span(e) { return Math.floor(e.pos / beat + EPS); }
    var i = 0;
    while (i < elems.length) {
      var e = elems[i];
      if (beamable(e)) {
        var group = [e];
        var j = i + 1;
        while (beamable(elems[j]) && span(elems[j]) === span(e) && elems[j].pos + elems[j].dur <= (span(e) + 1) * beat + EPS) {
          group.push(elems[j]);
          j++;
        }
        units.push({ elems: group, beam: group.length > 1 });
        i = j;
      } else if (e.type === 'bar' || e.type === 'end') {
        if (units.length) units[units.length - 1].elems.push(e);
        else units.push({ elems: [e], beam: false });
        i++;
      } else {
        units.push({ elems: [e], beam: false });
        i++;
      }
    }
    units.forEach(function (u) {
      u.width = u.elems.reduce(function (sum, e) { return sum + slotOf(e, mode); }, 0);
      var last = u.elems[u.elems.length - 1];
      u.closes = last.type === 'bar' || last.type === 'end';
    });
    return units;
  }

  // The clef, the key signature and (on the first staff) the time signature, before the first note.
  var CLEF_W = 3.6 * SP;
  var SIGN_W = 1.15 * SP;
  var TIME_W = 2.6 * SP;

  function headerWidth(model, first) {
    var w = CLEF_W;
    if (model.sig.order.length) w += model.sig.order.length * SIGN_W + 0.5 * SP;
    if (first && model.meter) w += TIME_W;
    return w + 1.2 * SP;
  }

  // ---- Geometry of a staff --------------------------------------------------------------------------------------
  // Coordinates are relative to the top line of the staff (y = 0); the bottom line is at STAFF_H.
  function isNote(e) { return e.type === 'note'; }

  function geometry(system) {
    var minY = 0;
    var maxY = STAFF_H;
    function grow(y) { if (y < minY) minY = y; if (y > maxY) maxY = y; }

    system.units.forEach(function (unit) {
      var notes = unit.elems.filter(isNote);
      notes.forEach(function (e) {
        e.headY = (8 - e.step) * SP / 2;
        grow(e.headY - 0.55 * SP);
        grow(e.headY + 0.55 * SP);
        if (e.sign) { grow(e.headY - 1.5 * SP); grow(e.headY + 1.5 * SP); }
      });
      if (unit.beam) beamGroup(notes, grow);
      else notes.forEach(function (e) { singleStem(e, grow); });
    });
    system.minY = minY;
    system.maxY = maxY;
  }

  function stemOffset(dir) { return (dir === 'up' ? 1 : -1) * (HEAD_HALF - STEM_W / 2); }

  function singleStem(e, grow) {
    e.flags = e.value <= 0.25 ? 2 : (e.value <= 0.5 ? 1 : 0);
    if (e.value >= 4) return;
    e.dir = e.step >= 4 ? 'down' : 'up';
    var length = 3.5 * SP + (e.flags > 1 ? 0.7 * SP : 0);
    e.stemX = e.x + stemOffset(e.dir);
    e.stemY0 = e.headY + (e.dir === 'up' ? -0.1 : 0.1) * SP;
    e.stemY1 = e.dir === 'up' ? Math.min(e.headY - length, MID) : Math.max(e.headY + length, MID);
    grow(e.stemY1);
  }

  function beamGroup(notes, grow) {
    var far = notes.reduce(function (best, n) { return Math.abs(n.step - 4) > Math.abs(best.step - 4) ? n : best; }, notes[0]);
    var dir = far.step >= 4 ? 'down' : 'up';
    notes.forEach(function (e) {
      e.dir = dir;
      e.flags = 0;
      e.stemX = e.x + stemOffset(dir);
      e.stemY0 = e.headY + (dir === 'up' ? -0.1 : 0.1) * SP;
    });
    var first = notes[0];
    var last = notes[notes.length - 1];
    var dx = last.stemX - first.stemX;
    var rise = Math.max(-1.25 * SP, Math.min(1.25 * SP, (last.headY - first.headY) * 0.5));
    var slope = dx > 0 ? rise / dx : 0;
    var offset = dir === 'up' ? Infinity : -Infinity;
    notes.forEach(function (e) {
      var along = slope * (e.stemX - first.stemX);
      if (dir === 'up') offset = Math.min(offset, e.headY - 3.3 * SP - along, MID - along);
      else offset = Math.max(offset, e.headY + 3.3 * SP - along, MID - along);
    });
    var sign = dir === 'up' ? 1 : -1;           // beams grow from the outer edge back towards the heads
    function beamY(x) { return offset + slope * (x - first.stemX); }

    notes.forEach(function (e) {
      e.stemY1 = beamY(e.stemX);
      grow(e.stemY1);
    });

    var half = STEM_W / 2;
    var shapes = [];
    function band(xa, xb, level) {
      var shift = sign * level * BEAM_STEP;
      var ya = beamY(xa) + shift;
      var yb = beamY(xb) + shift;
      shapes.push([[xa, ya], [xb, yb], [xb, yb + sign * BEAM], [xa, ya + sign * BEAM]]);
    }
    band(first.stemX - half, last.stemX + half, 0);
    notes.forEach(function (e, i) {
      var many = e.value <= 0.25;
      var next = notes[i + 1];
      var prev = notes[i - 1];
      if (!many) return;
      if (next && next.value <= 0.25) band(e.stemX - half, next.stemX + half, 1);
      else if (!(prev && prev.value <= 0.25)) {
        if (i === 0 || !prev) band(e.stemX - half, e.stemX + 1.15 * SP, 1);
        else band(e.stemX - 1.15 * SP, e.stemX + half, 1);
      }
    });
    first.beamShapes = shapes;
  }

  // ---- Drawing: shapes ----------------------------------------------------------------------------------------
  function ellipse(ctx, x, y, rx, ry, angle) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  }

  function drawHead(ctx, x, y, value) {
    ctx.fillStyle = INK;
    if (value >= 4) {
      ellipse(ctx, x, y, 0.72 * SP, 0.5 * SP, 0);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ellipse(ctx, x, y, 0.3 * SP, 0.45 * SP, 0.55);
      ctx.fill();
    } else if (value >= 2) {
      ellipse(ctx, x, y, 0.66 * SP, 0.46 * SP, -0.38);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ellipse(ctx, x, y, 0.47 * SP, 0.21 * SP, -0.72);
      ctx.fill();
    } else {
      ellipse(ctx, x, y, 0.66 * SP, 0.46 * SP, -0.38);
      ctx.fill();
    }
  }

  function drawSharp(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 0.13 * SP;
    ctx.beginPath();
    ctx.moveTo(x - 0.26 * SP, y - 1.3 * SP); ctx.lineTo(x - 0.26 * SP, y + 1.5 * SP);
    ctx.moveTo(x + 0.26 * SP, y - 1.5 * SP); ctx.lineTo(x + 0.26 * SP, y + 1.3 * SP);
    ctx.stroke();
    ctx.lineWidth = 0.36 * SP;
    ctx.beginPath();
    ctx.moveTo(x - 0.5 * SP, y - 0.2 * SP); ctx.lineTo(x + 0.5 * SP, y - 0.68 * SP);
    ctx.moveTo(x - 0.5 * SP, y + 0.68 * SP); ctx.lineTo(x + 0.5 * SP, y + 0.2 * SP);
    ctx.stroke();
    ctx.restore();
  }

  function drawFlat(ctx, x, y) {
    ctx.save();
    var stem = x - 0.3 * SP;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.13 * SP;
    ctx.beginPath();
    ctx.moveTo(stem, y - 2.05 * SP);
    ctx.lineTo(stem, y + 0.62 * SP);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(stem, y + 0.62 * SP);
    ctx.bezierCurveTo(stem + 0.4 * SP, y + 0.5 * SP, stem + 1.05 * SP, y + 0.02 * SP, stem + 0.92 * SP, y - 0.5 * SP);
    ctx.bezierCurveTo(stem + 0.82 * SP, y - 0.95 * SP, stem + 0.2 * SP, y - 0.98 * SP, stem, y - 0.42 * SP);
    ctx.bezierCurveTo(stem + 0.3 * SP, y - 0.7 * SP, stem + 0.55 * SP, y - 0.5 * SP, stem + 0.5 * SP, y - 0.18 * SP);
    ctx.bezierCurveTo(stem + 0.44 * SP, y + 0.1 * SP, stem + 0.2 * SP, y + 0.28 * SP, stem, y + 0.32 * SP);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawNatural(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 0.13 * SP;
    ctx.beginPath();
    ctx.moveTo(x - 0.28 * SP, y - 1.5 * SP); ctx.lineTo(x - 0.28 * SP, y + 0.55 * SP);
    ctx.moveTo(x + 0.28 * SP, y - 0.55 * SP); ctx.lineTo(x + 0.28 * SP, y + 1.5 * SP);
    ctx.stroke();
    ctx.lineWidth = 0.34 * SP;
    ctx.beginPath();
    ctx.moveTo(x - 0.28 * SP, y - 0.22 * SP); ctx.lineTo(x + 0.28 * SP, y - 0.5 * SP);
    ctx.moveTo(x - 0.28 * SP, y + 0.5 * SP); ctx.lineTo(x + 0.28 * SP, y + 0.22 * SP);
    ctx.stroke();
    ctx.restore();
  }

  function drawSign(ctx, sign, x, y) {
    if (sign === 'sharp') drawSharp(ctx, x, y);
    else if (sign === 'flat') drawFlat(ctx, x, y);
    else if (sign === 'natural') drawNatural(ctx, x, y);
  }

  // The flag of an eighth or sixteenth note that is not beamed: from the end of the stem.
  function drawFlags(ctx, e) {
    var sign = e.dir === 'up' ? 1 : -1;
    ctx.fillStyle = INK;
    for (var k = 0; k < e.flags; k++) {
      var y = e.stemY1 + sign * k * 0.95 * SP;
      var x = e.stemX + (e.dir === 'up' ? STEM_W / 2 : -STEM_W / 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 0.2 * SP, y + sign * 1.0 * SP, x + 1.5 * SP, y + sign * 1.4 * SP, x + 1.1 * SP, y + sign * 3.0 * SP);
      ctx.bezierCurveTo(x + 1.25 * SP, y + sign * 1.85 * SP, x + 0.6 * SP, y + sign * 1.45 * SP, x, y + sign * 1.05 * SP);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRest(ctx, e, x) {
    var mid = MID;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (e.value >= 4) {                                   // whole rest: hangs from the fourth line
      ctx.fillRect(x - 0.62 * SP, SP, 1.24 * SP, 0.52 * SP);
    } else if (e.value >= 2) {                            // half rest: sits on the middle line
      ctx.fillRect(x - 0.62 * SP, mid - 0.52 * SP, 1.24 * SP, 0.52 * SP);
    } else if (e.value >= 1) {                            // quarter rest
      ctx.lineWidth = 0.3 * SP;
      ctx.beginPath();
      ctx.moveTo(x - 0.22 * SP, mid - 1.45 * SP);
      ctx.lineTo(x + 0.38 * SP, mid - 0.62 * SP);
      ctx.stroke();
      ctx.lineWidth = 0.46 * SP;
      ctx.beginPath();
      ctx.moveTo(x + 0.38 * SP, mid - 0.62 * SP);
      ctx.lineTo(x - 0.3 * SP, mid + 0.22 * SP);
      ctx.stroke();
      ctx.lineWidth = 0.3 * SP;
      ctx.beginPath();
      ctx.moveTo(x - 0.3 * SP, mid + 0.22 * SP);
      ctx.bezierCurveTo(x + 0.5 * SP, mid + 0.5 * SP, x + 0.45 * SP, mid + 1.0 * SP, x - 0.02 * SP, mid + 1.15 * SP);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 0.18 * SP, mid + 1.25 * SP, 0.26 * SP, 0, Math.PI * 2);
      ctx.fill();
    } else {                                              // eighth and sixteenth rests: dots and a slanted stem
      var count = e.value <= 0.25 ? 2 : 1;
      var top = mid - 0.95 * SP;
      var bottom = top + (count === 2 ? 3.0 : 2.05) * SP;
      ctx.lineWidth = 0.15 * SP;
      ctx.beginPath();
      ctx.moveTo(x + 0.4 * SP, top);
      ctx.lineTo(x - 0.15 * SP - (count - 1) * 0.3 * SP, bottom);
      ctx.stroke();
      for (var k = 0; k < count; k++) {
        var dy = top + k * 0.95 * SP;
        var shift = -k * 0.28 * SP;
        ctx.beginPath();
        ctx.arc(x - 0.42 * SP + shift, dy + 0.42 * SP, 0.27 * SP, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 0.2 * SP;
        ctx.beginPath();
        ctx.moveTo(x - 0.3 * SP + shift, dy + 0.55 * SP);
        ctx.bezierCurveTo(x + 0.1 * SP + shift, dy + 0.75 * SP, x + 0.3 * SP + shift, dy + 0.4 * SP, x + 0.4 * SP + shift * 0.5, dy);
        ctx.stroke();
      }
    }
    if (e.dotted) {
      ctx.beginPath();
      ctx.arc(x + 0.95 * SP, mid - 0.5 * SP, 0.2 * SP, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Drawing: the clef, the time signature, the tempo ------------------------------------------------------------
  var clefGlyph = null;

  // Whether a font on this device can draw the treble clef (U+1D11E): an unknown character comes out as an
  // empty box or nothing, so the shapes it draws are compared with those of a character that cannot exist.
  function clefFontWorks() {
    if (clefGlyph !== null) return clefGlyph;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    var g = canvas.getContext('2d');
    function ink(text) {
      g.clearRect(0, 0, 64, 64);
      g.font = '40px ' + CLEF_FONTS;
      g.fillStyle = '#000';
      g.fillText(text, 8, 48);
      var data = g.getImageData(0, 0, 64, 64).data;
      var out = [];
      var any = false;
      for (var i = 3; i < data.length; i += 4) { out.push(data[i] > 100 ? 1 : 0); if (data[i] > 100) any = true; }
      return { bits: out.join(''), any: any };
    }
    var real = ink('𝄞');
    var missing = ink('􏿿');
    clefGlyph = real.any && real.bits !== missing.bits;
    return clefGlyph;
  }

  // The G clef curls around the second line from the bottom (y = 3 SP). Drawn with a music font when the
  // device has one, and with a stroked shape when it does not.
  function drawClef(ctx, x) {
    var g = 3 * SP;
    ctx.save();
    if (clefFontWorks()) {
      var glyph = '𝄞';
      var size = 6 * SP;
      ctx.font = size + 'px ' + CLEF_FONTS;
      var m = ctx.measureText(glyph);
      var height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      var scale = height ? 7.0 * SP / height : 1;
      size *= scale;
      ctx.font = size + 'px ' + CLEF_FONTS;
      m = ctx.measureText(glyph);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(glyph, x + m.actualBoundingBoxLeft, g - 4.4 * SP + m.actualBoundingBoxAscent);
    } else {
      ctx.translate(x, g);
      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.3 * SP;
      var u = SP;
      ctx.beginPath();
      ctx.moveTo(1.05 * u, 2.3 * u);
      ctx.lineTo(1.1 * u, -3.5 * u);
      ctx.bezierCurveTo(1.15 * u, -4.5 * u, 0.15 * u, -4.4 * u, 0.2 * u, -3.3 * u);
      ctx.bezierCurveTo(0.3 * u, -2.5 * u, 1.3 * u, -2.0 * u, 1.75 * u, -1.2 * u);
      ctx.bezierCurveTo(2.3 * u, -0.2 * u, 1.9 * u, 0.9 * u, 1.0 * u, 0.9 * u);
      ctx.bezierCurveTo(0.1 * u, 0.9 * u, -0.1 * u, -0.3 * u, 0.6 * u, -0.7 * u);
      ctx.bezierCurveTo(1.15 * u, -0.95 * u, 1.6 * u, -0.4 * u, 1.3 * u, 0.05 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.05 * u, 2.3 * u);
      ctx.bezierCurveTo(1.05 * u, 3.0 * u, 0.25 * u, 3.1 * u, 0.3 * u, 2.5 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0.55 * u, 2.5 * u, 0.28 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTimeSignature(ctx, x, meter) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = '700 ' + (2.95 * SP) + 'px ' + SERIF;
    [meter.text[0], meter.text[1]].forEach(function (digits, i) {
      var m = ctx.measureText(digits);
      var centre = (i === 0 ? 1 : 3) * SP;
      ctx.fillText(digits, x, centre + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    });
    ctx.restore();
  }

  function drawKeySignature(ctx, x, sig) {
    sig.order.forEach(function (name, i) {
      var y = (8 - SIG_STEPS[sig.type][name]) * SP / 2;
      drawSign(ctx, sig.type === 'flat' ? 'flat' : 'sharp', x + i * SIGN_W, y);
    });
  }

  // "♩ = 100" as a note drawn with the same shapes as the score.
  function drawTempo(ctx, x, y, bpm) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.85, 0.85);
    drawHead(ctx, 0.6 * SP, 0, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(0.6 * SP + HEAD_HALF - STEM_W, -3.2 * SP, STEM_W, 3.2 * SP);
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.font = '700 15px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('= ' + bpm, x + 1.9 * SP, y + 5);
  }

  // ---- Drawing: a staff ----------------------------------------------------------------------------------------
  function drawSystem(ctx, system, x0, staffW, top, model, base) {
    ctx.save();
    ctx.translate(0, top);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.11 * SP + 0.2;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      ctx.moveTo(x0, i * SP);
      ctx.lineTo(x0 + staffW, i * SP);
    }
    ctx.stroke();

    drawClef(ctx, x0 + 0.3 * SP);
    var x = x0 + CLEF_W;
    if (model.sig.order.length) {
      drawKeySignature(ctx, x + SIGN_W / 2, model.sig);
      x += model.sig.order.length * SIGN_W + 0.5 * SP;
    }
    if (system.first && model.meter) drawTimeSignature(ctx, x + TIME_W / 2 - 0.2 * SP, model.meter);

    system.units.forEach(function (unit) {
      unit.elems.forEach(function (e) {
        if (e.type === 'bar') {
          ctx.lineWidth = 0.13 * SP + 0.3;
          ctx.beginPath();
          ctx.moveTo(e.x, 0); ctx.lineTo(e.x, STAFF_H);
          ctx.stroke();
        } else if (e.type === 'end') {
          ctx.lineWidth = 0.13 * SP + 0.3;
          ctx.beginPath();
          ctx.moveTo(e.x - 0.5 * SP, 0); ctx.lineTo(e.x - 0.5 * SP, STAFF_H);
          ctx.stroke();
          ctx.fillStyle = INK;
          ctx.fillRect(e.x - 0.12 * SP, -0.5, 0.5 * SP, STAFF_H + 1);
        } else if (e.type === 'rest') {
          drawRest(ctx, e, e.x);
        } else {
          drawNote(ctx, e);
        }
      });
      var first = unit.elems[0];
      if (first.beamShapes) {
        ctx.fillStyle = INK;
        first.beamShapes.forEach(function (shape) {
          ctx.beginPath();
          ctx.moveTo(shape[0][0], shape[0][1]);
          for (var p = 1; p < shape.length; p++) ctx.lineTo(shape[p][0], shape[p][1]);
          ctx.closePath();
          ctx.fill();
        });
      }
    });
    ctx.restore();

    drawLabels(ctx, system, base);
  }

  function drawNote(ctx, e) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.13 * SP + 0.2;
    ctx.beginPath();
    for (var s = 10; s <= e.step; s += 2) { ctx.moveTo(e.x - 1.0 * SP, (8 - s) * SP / 2); ctx.lineTo(e.x + 1.0 * SP, (8 - s) * SP / 2); }
    for (var t = -2; t >= e.step; t -= 2) { ctx.moveTo(e.x - 1.0 * SP, (8 - t) * SP / 2); ctx.lineTo(e.x + 1.0 * SP, (8 - t) * SP / 2); }
    ctx.stroke();

    if (e.sign) drawSign(ctx, e.sign, e.x - HEAD_HALF - 0.35 * SP - 0.5 * SP, e.headY);
    if (e.stemY1 !== undefined) {
      ctx.fillStyle = INK;
      var yA = Math.min(e.stemY0, e.stemY1);
      var yB = Math.max(e.stemY0, e.stemY1);
      ctx.fillRect(e.stemX - STEM_W / 2, yA, STEM_W, yB - yA);
    }
    drawHead(ctx, e.x, e.headY, e.value);
    if (e.flags) drawFlags(ctx, e);
    if (e.dotted) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(e.x + HEAD_HALF + 0.5 * SP, e.headY - (e.step % 2 === 0 ? 0.5 * SP : 0), 0.2 * SP, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Drawing: what is written under the notes -----------------------------------------------------------------
  function drawDiagram(ctx, base, e, cx, y) {
    var k = DIAGRAM_W / 200;
    var left = cx - DIAGRAM_W / 2;
    ctx.drawImage(base, left, y, DIAGRAM_W, DIAGRAM_H);
    ctx.fillStyle = '#161616';
    ctx.strokeStyle = '#161616';
    ctx.lineWidth = 1.6 * k;
    C.fingering.HOLES.forEach(function (hole) {
      var covered = e.holes.indexOf(hole.n) >= 0;
      if (!covered && e.half.indexOf(hole.n) < 0) return;
      ctx.beginPath();
      if (covered) ctx.arc(left + hole.cx * k, y + hole.cy * k, hole.r * k, 0, Math.PI * 2);
      else ctx.arc(left + hole.cx * k, y + hole.cy * k, hole.r * k, Math.PI / 2, Math.PI * 1.5);    // halfway: the left half
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawLabels(ctx, system, base) {
    var mode = system.mode;
    var y = system.labelTop;
    system.units.forEach(function (unit) {
      unit.elems.forEach(function (e) {
        if (e.type !== 'note') return;
        var at = y;
        if (e.drawDiagram) drawDiagram(ctx, base, e, e.x, at);
        if (!e.drawName) return;
        if (mode.name) at += mode.diagram ? DIAGRAM_H + 5 : 0;           // the name below the diagram (or alone)
        else at += (DIAGRAM_H - NAME_H) / 2;                             // no diagram yet: the name in its place
        ctx.fillStyle = INK;
        ctx.font = NAME_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(e.text, e.x, at + 14);
      });
    });
  }

  // ---- Putting it together ------------------------------------------------------------------------------------------
  function keyText(song) {
    return C.keys.describe(song.signature, song).text;
  }

  function layout(song, mode) {
    var model = buildModel(song, mode);
    if (!model.lines.length) return null;

    model.lines.forEach(function (line) { line.units = groupUnits(line.elems, model.meter, mode); });

    // The staves are all as long as the longest line needs, up to a limit; longer lines continue on another staff.
    var natural = 0;
    model.lines.forEach(function (line, i) {
      var w = headerWidth(model, i === 0) + line.units.reduce(function (sum, u) { return sum + u.width; }, 0) + SP;
      natural = Math.max(natural, w);
    });
    var staffW = Math.max(MIN_STAFF, Math.min(MAX_STAFF, Math.ceil(natural)));

    var systems = [];
    model.lines.forEach(function (line, li) {
      var head = headerWidth(model, li === 0);
      var room = staffW - head - SP;
      var chunks = [];
      var current = [];
      var width = 0;
      var lastClose = -1;
      line.units.forEach(function (u) {
        if (current.length && width + u.width > room) {
          var cut = lastClose > 0 && lastClose >= current.length * 0.5 ? lastClose : current.length;
          var rest = current.slice(cut);
          chunks.push(current.slice(0, cut));
          current = rest;
          width = rest.reduce(function (sum, x) { return sum + x.width; }, 0);
          lastClose = -1;
        }
        current.push(u);
        width += u.width;
        if (u.closes) lastClose = current.length;
      });
      chunks.push(current);
      chunks.forEach(function (units, ci) {
        systems.push({
          units: units, mode: mode, model: model,
          subtitle: ci === 0 ? line.subtitle : '',
          first: li === 0 && ci === 0,
          wrapped: ci < chunks.length - 1
        });
      });
    });

    // Positions along each staff.
    systems.forEach(function (system) {
      var head = headerWidth(model, system.first);
      var natural = system.units.reduce(function (sum, u) { return sum + u.width; }, 0);
      var lastUnit = system.units[system.units.length - 1];
      var closes = lastUnit.closes;
      var room = staffW - head - (closes ? -0.55 * SP : SP);
      var factor = room / natural;
      var stretch = system.wrapped || (factor > 1 && factor <= 1.2) ? factor : 1;
      var x = MARGIN + head;
      system.units.forEach(function (unit) {
        unit.elems.forEach(function (e) {
          var w = slotOf(e, mode) * stretch;
          e.x = x + w / 2;
          x += w;
        });
      });
      system.end = x;
      geometry(system);
    });
    return { model: model, systems: systems, staffW: staffW };
  }

  function paint(song, mode, base) {
    var plan = layout(song, mode);
    if (!plan) throw new Error('empty');
    var model = plan.model;
    var systems = plan.systems;
    var staffW = plan.staffW;
    var width = staffW + 2 * MARGIN;

    // Vertical layout.
    var y = 48;
    var titleY = y + 30;
    y = titleY + 26;
    var infoY = y;
    y += 30;
    var tempoY = y + 12;
    y += 30;
    var labelH = (mode.diagram ? DIAGRAM_H + (mode.name ? 5 + NAME_H - 6 : 0) : NAME_H);
    systems.forEach(function (system) {
      if (system.subtitle) { system.subtitleY = y + 14; y += 28; }
      var above = Math.max(2.2 * SP, -system.minY + 0.6 * SP);
      system.top = y + above;
      var below = Math.max(2.2 * SP, system.maxY - STAFF_H + 0.6 * SP);
      system.labelTop = STAFF_H + below + 10;          // relative to the top line
      y = system.top + STAFF_H + below + 10 + labelH + (system.subtitle || system.first ? 30 : 24);
    });
    var footerY = y + 6;
    var height = footerY + 44;

    var scale = 2;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var maxArea = coarse ? 16e6 : 90e6;
    scale = Math.min(scale, Math.sqrt(maxArea / (width * height)), 16000 / height, 16000 / width);
    if (scale < 0.6) throw new Error('too-large');

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);

    // Title block.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    ctx.font = '700 34px ' + SERIF;
    ctx.fillText(song.title || tr('Sin título'), width / 2, titleY, width - 2 * MARGIN);
    ctx.fillStyle = SOFT;
    ctx.font = 'italic 15px ' + SANS;
    ctx.fillText(keyText(song), width / 2, infoY + 6, width - 2 * MARGIN);
    drawTempo(ctx, MARGIN, tempoY, song.bpm || 100);

    systems.forEach(function (system) {
      if (system.subtitle) {
        ctx.fillStyle = INK;
        ctx.font = '700 15px ' + SANS;
        ctx.textAlign = 'left';
        ctx.fillText(system.subtitle, MARGIN, system.subtitleY, staffW);
      }
      system.labelTop += system.top;
      drawSystem(ctx, system, MARGIN, staffW, system.top, model, base);
    });

    // Footer: a rule, the legend of the diagrams, and the name of the page.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, footerY);
    ctx.lineTo(width - MARGIN, footerY);
    ctx.stroke();
    ctx.fillStyle = SOFT;
    ctx.font = '13px ' + SANS;
    ctx.textAlign = 'right';
    ctx.fillText('Ocarina Songbook', width - MARGIN, footerY + 26);
    if (mode.diagram) {
      ctx.textAlign = 'left';
      var lx = MARGIN;
      ctx.fillStyle = '#161616';
      ctx.beginPath(); ctx.arc(lx + 6, footerY + 21, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SOFT;
      var covered = tr('Agujero tapado');
      ctx.fillText(covered, lx + 18, footerY + 26);
      lx += 18 + ctx.measureText(covered).width + 22;
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(lx + 6, footerY + 21, 5, 0, Math.PI * 2); ctx.stroke();
      var open = tr('Agujero abierto');
      ctx.fillText(open, lx + 18, footerY + 26);
      var usesHalf = systems.some(function (system) {
        return system.units.some(function (unit) { return unit.elems.some(function (e) { return e.drawDiagram && e.half.length; }); });
      });
      if (usesHalf) {                                    // a hole covered halfway is drawn half filled
        lx += 18 + ctx.measureText(open).width + 22;
        ctx.fillStyle = '#161616';
        ctx.beginPath(); ctx.arc(lx + 6, footerY + 21, 5, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(lx + 6, footerY + 21, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = SOFT;
        ctx.fillText(tr('Agujero a medias'), lx + 18, footerY + 26);
      }
    }
    return canvas;
  }

  var baseImage = null;

  function loadBase() {
    if (baseImage) return Promise.resolve(baseImage);
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { baseImage = image; resolve(image); };
      image.onerror = function () { reject(new Error('picture')); };
      image.src = C.ocarinaImage;
    });
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('blob')); }, 'image/png');
    });
  }

  // The song as a PNG. `view` is what goes under the notes: 'names', 'fingering' or 'both'.
  function render(song, view) {
    var mode = MODES[view] || MODES.both;
    var wantsDiagrams = mode.diagram;
    return (wantsDiagrams ? loadBase() : Promise.resolve(null)).then(function (base) {
      return toBlob(paint(song, mode, base));
    });
  }

  C.scoreImage = { render: render, paint: paint, MODES: MODES };
})(window.Songbook = window.Songbook || {});
