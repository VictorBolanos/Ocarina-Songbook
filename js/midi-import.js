(function (C) {
  'use strict';

  // Importing a MIDI file as a song. Writing notes by hand is the slow part of the page, and a melody is often
  // already out there as a .mid file. Reading one goes in four steps:
  //   1. parse the file (a Standard MIDI File, format 0 or 1) into notes, tempo, time signature and key;
  //   2. let the person pick which track holds the melody;
  //   3. turn that track into a single melody: chords keep their top note, notes are snapped to a grid of
  //      sixteenth notes, gaps become rests, and lengths are split into the note values the page has;
  //   4. move the octaves so the notes fit the ocarina, and cut the melody into lines.
  // The result opens in the editor as a new draft, so nothing is saved until Listo, and it can be corrected,
  // transposed or thrown away. Nothing leaves the computer: the file is only read here.
  var h = C.ui.h;
  var tr = C.i18n.t;
  var store = C.store;

  var GRID = 0.25;                                       // notes snap to sixteenth notes (a quarter note is 1)
  var PIECES = [6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];   // the lengths the page can write, in quarter notes
  var SUFFIX = { 0.25: ['s', false], 0.375: ['s', true], 0.5: ['e', false], 0.75: ['e', true], 1: ['q', false], 1.5: ['q', true], 2: ['h', false], 3: ['h', true], 4: ['w', false], 6: ['w', true] };
  var MAX_BYTES = 5 * 1024 * 1024;
  var LINE_NOTES = 14;                                   // most notes on a line

  // ---- 1. Reading the file ---------------------------------------------------------------------------------
  // Returns { format, division, tempo, meter, key, tracks: [{ name, notes: [{ start, end, pitch, channel }] }] }
  // with times in ticks. Throws Error('not-midi'), Error('smpte') or Error('empty').
  function parse(buffer) {
    var bytes = new Uint8Array(buffer);
    var view = new DataView(buffer);
    var at = -1;
    for (var i = 0; i + 4 <= Math.min(bytes.length, 64); i++) {
      if (bytes[i] === 0x4D && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x68 && bytes[i + 3] === 0x64) { at = i; break; }   // "MThd" (after a RIFF header, if any)
    }
    if (at < 0 || bytes.length < at + 14) throw new Error('not-midi');
    var headerLength = view.getUint32(at + 4);
    var format = view.getUint16(at + 8);
    var division = view.getUint16(at + 12);
    if (division & 0x8000) throw new Error('smpte');       // timed in frames, not in beats
    if (!division) throw new Error('not-midi');

    var found = { format: format, division: division, tempo: null, meter: null, key: null, tracks: [] };
    var pos = at + 8 + headerLength;
    while (pos + 8 <= bytes.length) {
      var id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      var length = view.getUint32(pos + 4);
      var end = Math.min(bytes.length, pos + 8 + length);
      if (id === 'MTrk') found.tracks.push(readTrack(bytes, pos + 8, end, found));
      pos = pos + 8 + length;
    }
    found.tracks = found.tracks.filter(function (t) { return t.notes.length; });
    if (!found.tracks.length) throw new Error('empty');
    return found;
  }

  function readTrack(bytes, pos, end, found) {
    var track = { name: '', notes: [] };
    var tick = 0;
    var status = 0;
    var open = {};                                       // "channel:pitch" -> start tick, of notes still sounding

    function variable() {
      var value = 0;
      for (var n = 0; n < 4 && pos < end; n++) {
        var b = bytes[pos++];
        value = (value << 7) | (b & 0x7F);
        if (!(b & 0x80)) break;
      }
      return value;
    }

    function close(channel, pitch) {
      var key = channel + ':' + pitch;
      if (open[key] === undefined) return;
      track.notes.push({ start: open[key], end: tick, pitch: pitch, channel: channel });
      delete open[key];
    }

    while (pos < end) {
      tick += variable();
      var first = bytes[pos];
      if (first === undefined) break;
      if (first === 0xFF) {                              // meta event
        var type = bytes[pos + 1];
        pos += 2;
        var size = variable();
        var data = bytes.subarray(pos, pos + size);
        pos += size;
        if (type === 0x03 && !track.name) track.name = text(data);
        else if (type === 0x51 && data.length === 3 && (!found.tempo || tick < found.tempo.tick)) found.tempo = { tick: tick, micros: (data[0] << 16) | (data[1] << 8) | data[2] };
        else if (type === 0x58 && data.length >= 2 && !found.meter) found.meter = { num: data[0], den: Math.pow(2, data[1]) };
        else if (type === 0x59 && data.length >= 2 && !found.key) found.key = { sharps: (data[0] << 24) >> 24 };
        else if (type === 0x2F) break;
        continue;
      }
      if (first === 0xF0 || first === 0xF7) {            // system exclusive: skipped
        pos += 1;
        var skip = variable();
        pos += skip;
        continue;
      }
      if (first & 0x80) { status = first; pos++; }       // otherwise the previous status carries on (running status)
      var kind = status & 0xF0;
      var channel = status & 0x0F;
      if (kind === 0xC0 || kind === 0xD0) { pos += 1; continue; }
      var a = bytes[pos];
      var b = bytes[pos + 1];
      pos += 2;
      if (channel === 9) continue;                       // percussion: not a melody
      if (kind === 0x90 && b > 0) {
        if (open[channel + ':' + a] !== undefined) close(channel, a);
        open[channel + ':' + a] = tick;
      } else if (kind === 0x80 || kind === 0x90) {
        close(channel, a);
      }
    }
    Object.keys(open).forEach(function (key) {
      var parts = key.split(':');
      close(Number(parts[0]), Number(parts[1]));
    });
    return track;
  }

  function text(data) {
    var out = '';
    for (var i = 0; i < data.length; i++) out += String.fromCharCode(data[i]);
    try { return decodeURIComponent(escape(out)).trim(); } catch (e) { return out.trim(); }
  }

  // The parts of the file that could be the melody: one per track and channel that has notes.
  function candidates(found) {
    var list = [];
    found.tracks.forEach(function (track, t) {
      var byChannel = {};
      track.notes.forEach(function (n) { (byChannel[n.channel] = byChannel[n.channel] || []).push(n); });
      Object.keys(byChannel).forEach(function (channel) {
        var notes = byChannel[channel];
        var pitches = notes.map(function (n) { return n.pitch; });
        list.push({
          track: t + 1,
          channel: Number(channel) + 1,
          name: track.name,
          notes: notes,
          low: Math.min.apply(null, pitches),
          high: Math.max.apply(null, pitches)
        });
      });
    });
    return list;
  }

  // ---- 3. One melody, in the page's note values --------------------------------------------------------------------
  function snap(x) { return Math.round(x / GRID) * GRID; }

  // The notes of a part as a single line of sound: [{ start, end, pitch }] in quarter notes, never overlapping.
  function melody(notes, division) {
    var list = notes.map(function (n) {
      var start = snap(n.start / division);
      var end = snap(n.end / division);
      return { start: start, end: end <= start ? start + GRID : end, pitch: n.pitch };
    });
    list.sort(function (a, b) { return a.start - b.start || b.pitch - a.pitch; });
    var out = [];
    list.forEach(function (n) {
      var last = out[out.length - 1];
      if (last && n.start === last.start) return;         // a chord: the top note was kept
      if (last && last.end > n.start) {
        // A note that starts while the last one still sounds: legato (the last is cut short), or something
        // played underneath a held note (a lower note, which is ignored).
        var overlap = last.end - n.start;
        if (n.pitch >= last.pitch || overlap <= (last.end - last.start) / 2) last.end = n.start;
        else return;
      }
      out.push({ start: n.start, end: n.end, pitch: n.pitch });
    });
    return out;
  }

  // A length in quarter notes as the note values the page has (5 = a whole note and a quarter).
  function split(total) {
    var out = [];
    var left = total;
    while (left > 1e-9) {
      var piece = null;
      for (var i = 0; i < PIECES.length; i++) if (PIECES[i] <= left + 1e-9) { piece = PIECES[i]; break; }
      if (piece === null) break;
      out.push(piece);
      left -= piece;
    }
    return out;
  }

  function withLength(code, beats) {
    var suffix = SUFFIX[beats];
    return C.notes.withDuration(code, suffix[0], suffix[1]);
  }

  // The octave shift (a multiple of 12, in semitones) that leaves the most notes inside the ocarina's range.
  function bestShift(pitches) {
    var best = 0;
    var bestCount = -1;
    [0, 12, -12, 24, -24, 36, -36].forEach(function (shift) {
      var count = pitches.filter(function (p) { return p + shift >= C.notes.RANGE.low && p + shift <= C.notes.RANGE.high; }).length;
      if (count > bestCount) { best = shift; bestCount = count; }
    });
    return best;
  }

  // The part as a song: { song, stats }. options.octaves: fit the notes to the ocarina by moving octaves.
  function convert(found, part, title, options) {
    var line = melody(part.notes, found.division);
    var meter = found.meter && [2, 4, 8, 16].indexOf(found.meter.den) >= 0 && found.meter.num >= 1 && found.meter.num <= 32 ? found.meter : null;
    var bar = meter ? meter.num * 4 / meter.den : 0;
    var unit = bar || 4;
    var mark = found.key && found.key.sharps < 0 ? 'b' : '#';
    var shift = options && options.octaves ? bestShift(line.map(function (n) { return n.pitch; })) : 0;

    var stats = { notes: 0, out: 0, folded: 0, split: 0, shift: shift };
    var items = [];                                      // { beats, code }
    function rests(total) {
      split(total).forEach(function (piece) { items.push({ beats: piece, code: withLength('R', piece) }); });
    }

    var cursor = 0;
    line.forEach(function (n, i) {
      var gap = n.start - cursor;
      if (i === 0) gap = n.start % unit;                  // silence before the tune: whole bars are dropped
      else if (gap > 2 * unit) gap = 2 * unit + (gap - Math.floor(gap / unit) * unit);   // a long silence is cut to two bars
      if (gap > 0) rests(gap);
      var pitch = n.pitch + shift;
      while (pitch < C.notes.WRITABLE.low) { pitch += 12; stats.folded++; }
      while (pitch > C.notes.WRITABLE.high) { pitch -= 12; stats.folded++; }
      var base = C.notes.fromMidi(pitch, mark);
      var pieces = split(n.end - n.start);
      if (pieces.length > 1) stats.split++;
      pieces.forEach(function (piece) {
        items.push({ beats: piece, code: withLength(base, piece), pitch: pitch });
        stats.notes++;
        if (pitch < C.notes.RANGE.low || pitch > C.notes.RANGE.high) stats.out++;
      });
      cursor = n.end;
    });

    // Cut into lines: two bars each (eight quarter notes without a time signature), or 14 notes.
    var lines = [];
    var current = { subtitle: '', notes: [] };
    var length = 0;
    var target = bar ? bar * 2 : 8;
    items.forEach(function (item) {
      current.notes.push(item.code);
      length += item.beats;
      if (length >= target - 1e-9 || current.notes.length >= LINE_NOTES) {
        lines.push(current);
        current = { subtitle: '', notes: [] };
        length = 0;
      }
    });
    if (current.notes.length) lines.push(current);

    var bpm = found.tempo ? Math.round(60000000 / found.tempo.micros) : 100;
    var used = items.some(function (item) { var n = C.notes.parse(item.code); return n && n.accidental; });
    var song = store.blankSong(store.uniqueId(title));
    song.title = title;
    song.bpm = store.cleanBpm(bpm);
    song.meter = meter ? meter.num + '/' + meter.den : '';
    song.signature = used ? (mark === 'b' ? 'flat' : 'sharp') : 'none';
    song.lines = lines.length ? lines : [{ subtitle: '', notes: [] }];
    return { song: song, stats: stats, bpmClamped: bpm !== song.bpm };
  }

  // ---- The window --------------------------------------------------------------------------------------------------
  // A pitch as a name with its octave number (Sol3, La♯5), so notes outside the page's octaves are clear too.
  var CLASSES = [['Do', ''], ['Do', '#'], ['Re', ''], ['Re', '#'], ['Mi', ''], ['Fa', ''], ['Fa', '#'], ['Sol', ''], ['Sol', '#'], ['La', ''], ['La', '#'], ['Si', '']];

  function pitchName(number) {
    var pair = CLASSES[number % 12];
    return C.i18n.noteName(pair[0]) + C.notes.glyph(pair[1]) + (Math.floor(number / 12) - 1);
  }

  function titleFrom(fileName, part) {
    var fromFile = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (fromFile || part.name || tr('Canción importada')).slice(0, 80);
  }

  function failure(error) {
    var reason = error && error.message;
    if (reason === 'not-midi') return tr('Ese archivo no parece un MIDI.');
    if (reason === 'smpte') return tr('Este MIDI usa un reloj por fotogramas, que no se puede importar.');
    if (reason === 'empty') return tr('Ese MIDI no tiene notas que importar.');
    if (reason === 'big') return tr('El archivo es demasiado grande para ser un MIDI de una melodía.');
    return tr('No se pudo leer el archivo MIDI.');
  }

  // What the import did, as lines of text for the window (also used by the audio import).
  function summaryLines(made) {
    var s = made.stats;
    var lines = [];
    lines.push(tr('{n} notas y silencios en {lines} líneas.', { n: made.song.lines.reduce(function (t, l) { return t + l.notes.length; }, 0), lines: made.song.lines.length }));
    lines.push(tr('Tempo {bpm} · compás {meter}.', { bpm: made.song.bpm, meter: made.song.meter || '—' }));
    if (s.shift) {
      var count = Math.abs(s.shift) / 12;
      var amount = count === 1 ? tr('una octava') : tr('{n} octavas', { n: count });
      lines.push(s.shift > 0 ? tr('Las notas se han subido {amount} para acercarlas a la ocarina.', { amount: amount }) : tr('Las notas se han bajado {amount} para acercarlas a la ocarina.', { amount: amount }));
    }
    if (!s.out) lines.push(tr('Todas las notas caben en la ocarina ({range}).', { range: C.notes.rangeText() }));
    else lines.push(s.out === 1 ? tr('1 nota queda fuera del rango de la ocarina ({range}); podrás transportarla en el editor.', { range: C.notes.rangeText() }) : tr('{n} notas quedan fuera del rango de la ocarina ({range}); podrás transportarlas en el editor.', { n: s.out, range: C.notes.rangeText() }));
    if (s.split) lines.push(s.split === 1 ? tr('1 nota muy larga se ha partido en varias.') : tr('{n} notas muy largas se han partido en varias.', { n: s.split }));
    return lines;
  }

  function showChoice(found, fileName) {
    var dialog = document.getElementById('import-dialog');
    var parts = candidates(found);
    // The likeliest melody: the part with the most notes.
    var chosen = parts.reduce(function (best, part, i) { return part.notes.length > parts[best].notes.length ? i : best; }, 0);
    var octaves = true;
    var summary = h('p', { class: 'import-summary', role: 'status' });
    var make = h('button', { type: 'button', class: 'btn btn--primary', 'data-role': 'import', onclick: run }, 'Abrir en el editor');
    var checks = [];

    var options = parts.map(function (part, i) {
      var name = tr('Pista {n}', { n: part.track }) + (part.name ? ': ' + part.name : '') + (parts.length > found.tracks.length ? ' · ' + tr('canal {n}', { n: part.channel }) : '');
      var button = h('button', {
        type: 'button', class: 'export-option', role: 'radio', 'data-part': i,
        onclick: function () { chosen = i; paint(); }
      }, h('strong', { translate: 'no' }, name),
        h('span', null, (part.notes.length === 1 ? tr('1 nota') : tr('{n} notas', { n: part.notes.length })) + ' · ' + pitchName(part.low) + ' – ' + pitchName(part.high)));
      checks.push(button);
      return button;
    });

    var box = h('input', { type: 'checkbox', checked: true, 'data-role': 'octaves' });
    box.addEventListener('change', function () { octaves = box.checked; paint(); });

    function build() {
      return convert(found, parts[chosen], titleFrom(fileName, parts[chosen]), { octaves: octaves });
    }

    function paint() {
      checks.forEach(function (button, i) { button.setAttribute('aria-checked', String(i === chosen)); });
      summary.replaceChildren.apply(summary, summaryLines(build()).map(function (text) { return h('span', null, text); }));
    }

    function run() {
      var made = build();
      dialog.close();
      C.editor.openDraft(made.song);
      C.ui.toast(tr('MIDI importado: revisa la canción y pulsa Listo para guardarla.'), null, 8000);
    }

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('h2', null, 'Importar un MIDI'),
      h('p', null, parts.length > 1 ? 'Elige la pista que lleva la melodía.' : 'Esta es la melodía que se ha encontrado.'),
      h('div', { class: 'export-options import-parts', role: 'radiogroup', 'aria-label': tr('Pista') }, options),
      h('label', { class: 'import-check' }, box, h('span', null, 'Mover las octavas para que quepan en la ocarina')),
      summary,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { dialog.close(); } }, 'Cancelar'),
        make)));
    paint();
    dialog.showModal();
  }

  // A MIDI file by its name or type; anything else is taken for audio.
  function isMidi(file) {
    return /\.midi?$/i.test(file.name) || /midi/i.test(file.type);
  }

  // Asks for a file (MIDI, or an audio or video file with sound) and opens the matching import window. Only when
  // the folder can be written: the result is a new song.
  function choose() {
    if (!store.canEdit()) return;
    var input = h('input', { type: 'file', accept: '.mid,.midi,audio/midi,audio/x-midi,audio/*,video/mp4,.mp4,.m4a,.wav,.mp3,.ogg,.flac,.aac,.webm', hidden: true });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      if (!isMidi(file)) {
        if (file.size > C.audioImport.MAX_BYTES) C.ui.toast(C.i18n.t('El archivo es demasiado grande.'));
        else C.audioImport.open(file);
        return;
      }
      if (file.size > MAX_BYTES) { C.ui.toast(failure(new Error('big'))); return; }
      file.arrayBuffer().then(function (buffer) {
        showChoice(parse(buffer), file.name);
      }).catch(function (error) {
        C.ui.toast(failure(error));
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  C.midiImport = { choose: choose, parse: parse, candidates: candidates, convert: convert, summaryLines: summaryLines, showChoice: showChoice };
})(window.Songbook = window.Songbook || {});
