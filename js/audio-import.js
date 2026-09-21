(function (C) {
  'use strict';

  // Importing a song from an audio file (WAV, MP3, M4A, MP4, OGG...): the page listens to the recording and
  // writes down the notes it hears. It only works for ONE melody: a single instrument, voice or whistle with
  // nothing else sounding. With a band, chords or a drum beat behind the tune the pitch tracker follows now the
  // melody, now the bass, now the noise, and the result is rubbish; the window says so, always, and also
  // measures how clear the recording is and warns when it looks like a mix.
  //
  // How it works:
  //   1. the browser decodes the file (no library): to mono, at about 24 kHz;
  //   2. every 10 ms the last 50 ms go through the same YIN pitch tracker as the note detector (pitch.js);
  //   3. the frames are cut into notes wherever the pitch changes or the loudness dips and rises again;
  //   4. the tempo is estimated from where the notes start (and can be corrected in the window);
  //   5. the notes go through the same steps as a MIDI file (midi-import.js): snapped to sixteenths, rests,
  //      note values, octaves fitted to the ocarina, lines. The result opens in the editor as a draft.
  // Nothing leaves the computer: the file is only decoded and analysed here.
  var h = C.ui.h;
  var tr = C.i18n.t;

  var MAX_BYTES = 80 * 1024 * 1024;
  var MAX_SECONDS = 300;                                 // only the first five minutes are analysed
  var TARGET_RATE = 24000;                               // the audio is reduced to about this many samples a second
  var FRAME = 1200;                                      // 50 ms
  var HOP = 240;                                         // 10 ms
  var MIN_FREQ = 330;
  var MAX_FREQ = 1800;
  var CLARITY = 0.85;                                    // how clean a pitch must be to count as a note
  var SENSITIVITY = {                                    // the shortest note kept, in frames of 10 ms
    normal: 6,
    detailed: 3,
    simple: 11
  };

  function pause() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  // ---- 1. Decoding -------------------------------------------------------------------------------------------------
  // The first minutes of the file as one channel at about TARGET_RATE: { samples, rate, seconds, truncated }.
  function decode(file) {
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return Promise.reject(new Error('unsupported'));
    return file.arrayBuffer().then(function (buffer) {
      var context = new Context();
      return context.decodeAudioData(buffer).then(function (audio) {
        context.close();
        return audio;
      }, function () {
        context.close();
        throw new Error('undecodable');
      });
    }).then(function (audio) {
      var seconds = Math.min(audio.duration, MAX_SECONDS);
      var factor = Math.max(1, Math.round(audio.sampleRate / TARGET_RATE));
      var length = Math.floor(seconds * audio.sampleRate / factor);
      var out = new Float32Array(length);
      var channels = audio.numberOfChannels;
      for (var c = 0; c < channels; c++) {
        var data = audio.getChannelData(c);
        for (var i = 0; i < length; i++) {
          var sum = 0;
          for (var k = 0; k < factor; k++) sum += data[i * factor + k];
          out[i] += sum / factor / channels;
        }
      }
      return { samples: out, rate: audio.sampleRate / factor, seconds: seconds, truncated: audio.duration > MAX_SECONDS };
    });
  }

  // ---- 2. Following the pitch ----------------------------------------------------------------------------------------
  // One entry per 10 ms: { rms, pitch }, `pitch` being a MIDI number with decimals or null when there is no
  // clear note. Returns { frames, gate, sounding, clear } where `clear` is the share of the frames that had
  // sound which had a clear note: the lower it is, the more the recording looks like a mix.
  function follow(audio, onProgress) {
    var samples = audio.samples;
    var count = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
    var frames = new Array(count);
    var loudness = new Float32Array(count);
    for (var f = 0; f < count; f++) {
      var sum = 0;
      var at = f * HOP;
      for (var j = 0; j < FRAME; j++) sum += samples[at + j] * samples[at + j];
      loudness[f] = Math.sqrt(sum / FRAME);
    }
    var sorted = Array.prototype.slice.call(loudness).sort(function (a, b) { return a - b; });
    var loud = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    var gate = Math.max(0.002, loud * 0.12);

    var buffer = new Float32Array(FRAME);
    var sounding = 0;
    var clear = 0;
    var index = 0;
    function chunk() {
      var stop = Math.min(count, index + 300);
      for (; index < stop; index++) {
        var pitch = null;
        if (loudness[index] > gate) {
          sounding++;
          buffer.set(samples.subarray(index * HOP, index * HOP + FRAME));
          var found = C.pitch.yin(buffer, audio.rate);
          if (found && found.clarity >= CLARITY && found.freq >= MIN_FREQ && found.freq <= MAX_FREQ) {
            pitch = 69 + 12 * Math.log2(found.freq / 440);
            clear++;
          }
        }
        frames[index] = { rms: loudness[index], pitch: pitch };
      }
      if (onProgress) onProgress(index / Math.max(1, count));
      return index >= count ? Promise.resolve() : pause().then(chunk);
    }
    return chunk().then(function () {
      return { frames: frames, gate: gate, sounding: sounding, clear: sounding ? clear / sounding : 0 };
    });
  }

  // ---- 3. Cutting into notes -------------------------------------------------------------------------------------------
  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  }

  // The notes of the frames: [{ start, end, pitch }] in seconds. A note ends when the pitch moves to another
  // note or the sound dips and comes back (the same note played again); very short ones are dropped.
  function segment(frames, shortest, hopSeconds) {
    // A steadier pitch: the median of the frames around each one that has a note.
    var smooth = frames.map(function (frame, i) {
      if (frame.pitch === null) return null;
      var near = [];
      for (var k = Math.max(0, i - 2); k <= Math.min(frames.length - 1, i + 2); k++) if (frames[k].pitch !== null) near.push(frames[k].pitch);
      return median(near);
    });

    var notes = [];
    var current = null;
    function finish(at) {
      if (current) {
        current.end = at;
        notes.push(current);
        current = null;
      }
    }
    for (var i = 0; i < frames.length; i++) {
      var pitch = smooth[i];
      if (pitch === null) {
        finish(i);
        continue;
      }
      var name = Math.round(pitch);
      var dip = current && i >= 2 && frames[i].rms > 1.35 * Math.min(frames[i - 1].rms, frames[i - 2].rms) &&
        Math.min(frames[i - 1].rms, frames[i - 2].rms) < 0.75 * current.peak;
      if (current && (name !== current.pitch || dip)) finish(i);
      if (!current) current = { pitch: name, start: i, peak: frames[i].rms };
      else current.peak = Math.max(current.peak, frames[i].rms);
    }
    finish(frames.length);

    // The same note split by a gap of a frame or two (a breath, a consonant) is one note.
    var merged = [];
    notes.forEach(function (note) {
      var last = merged[merged.length - 1];
      if (last && last.pitch === note.pitch && note.start - last.end <= 2 && note.start - last.end > 0) last.end = note.end;
      else merged.push(note);
    });
    return merged.filter(function (note) { return note.end - note.start >= shortest; }).map(function (note) {
      return { start: note.start * hopSeconds, end: note.end * hopSeconds, pitch: note.pitch };
    });
  }

  // ---- 4. The tempo ---------------------------------------------------------------------------------------------------
  // The tempo (beats per minute, a beat being a quarter note) at which the notes' starts fall best on a grid of
  // sixteenth notes. Measured against the size of the grid, a faster tempo (a finer grid) is penalised by any
  // small timing error, so the true tempo wins over its double; the user can still halve or double it.
  function estimateTempo(notes) {
    if (notes.length < 4) return 100;
    var origin = notes[0].start;
    var starts = notes.map(function (n) { return n.start - origin; });
    var best = 100;
    var bestScore = Infinity;
    for (var bpm = 50; bpm <= 200; bpm++) {
      var grid = 60 / bpm / 4;
      var error = 0;
      starts.forEach(function (t) {
        var r = t % grid;
        error += Math.min(r, grid - r) / grid;
      });
      error /= starts.length;
      var score = error + (bpm > 150 ? (bpm - 150) / 50 * 0.05 : 0) + (bpm < 70 ? (70 - bpm) / 20 * 0.05 : 0);
      if (score < bestScore) { bestScore = score; best = bpm; }
    }
    return best;
  }

  // ---- 5. To a song ---------------------------------------------------------------------------------------------------
  // The notes as if they came from a MIDI file at the given tempo, so the MIDI importer does the rest.
  function toSong(notes, bpm, title, octaves) {
    var origin = notes.length ? notes[0].start : 0;
    var ticks = 480;
    var perSecond = bpm / 60 * ticks;
    var found = {
      division: ticks,
      tempo: { tick: 0, micros: Math.round(60000000 / bpm) },
      meter: null,
      key: null,
      tracks: []
    };
    var part = {
      track: 1, channel: 1, name: '',
      notes: notes.map(function (n) { return { start: (n.start - origin) * perSecond, end: (n.end - origin) * perSecond, pitch: n.pitch, channel: 0 }; })
    };
    return C.midiImport.convert(found, part, title, { octaves: octaves });
  }

  // ---- The window --------------------------------------------------------------------------------------------------------
  function failure(error) {
    var reason = error && error.message;
    if (reason === 'undecodable') return tr('No se pudo leer ese archivo como audio.');
    if (reason === 'empty') return tr('No se ha encontrado ninguna nota en ese audio. ¿Hay una melodía clara?');
    if (reason === 'big') return tr('El archivo es demasiado grande.');
    if (reason === 'unsupported') return tr('Este navegador no puede leer audio.');
    return tr('No se pudo analizar el audio.');
  }

  function open(file) {
    var dialog = document.getElementById('import-dialog');
    if (!dialog) return;
    var title = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || tr('Canción importada');

    var progress = h('progress', { max: 1, value: 0, class: 'import-progress' });
    var status = h('p', { class: 'import-status', role: 'status' }, 'Analizando el audio…');
    var quality = h('div', { class: 'import-quality', role: 'alert' });
    var summary = h('p', { class: 'import-summary', role: 'status' });
    var make = h('button', { type: 'button', class: 'btn btn--primary', 'data-role': 'import', disabled: true, onclick: run }, 'Abrir en el editor');
    var tempo = h('input', { type: 'number', class: 'input', min: 30, max: 240, step: 1, 'aria-label': 'Tempo (BPM)', 'data-role': 'tempo' });
    var sensitivity = h('select', { class: 'input', 'aria-label': 'Sensibilidad', 'data-role': 'sensitivity' },
      h('option', { value: 'normal' }, 'Normal'),
      h('option', { value: 'detailed' }, 'Detallada (notas más cortas)'),
      h('option', { value: 'simple' }, 'Simplificada (ignora las notas breves)'));
    var box = h('input', { type: 'checkbox', checked: true, 'data-role': 'octaves' });
    var controls = h('div', { class: 'import-controls', hidden: true },
      h('div', { class: 'import-tempo' },
        h('label', { class: 'field' }, 'Tempo (BPM)', tempo),
        h('button', { type: 'button', class: 'btn btn--sm', 'data-role': 'half', title: 'La mitad del tempo', onclick: function () { setTempo(Number(tempo.value) / 2); } }, '÷ 2'),
        h('button', { type: 'button', class: 'btn btn--sm', 'data-role': 'double', title: 'El doble del tempo', onclick: function () { setTempo(Number(tempo.value) * 2); } }, '× 2')),
      h('label', { class: 'field' }, 'Sensibilidad', sensitivity),
      h('label', { class: 'import-check' }, box, h('span', null, 'Mover las octavas para que quepan en la ocarina')));

    var analysis = null;                                 // { audio, followed }
    var notes = [];
    var made = null;

    function setTempo(value) {
      tempo.value = Math.max(30, Math.min(240, Math.round(value) || 100));
      paint();
    }

    function cut() {
      notes = segment(analysis.followed.frames, SENSITIVITY[sensitivity.value], HOP / analysis.audio.rate);
      if (!notes.length) {
        status.textContent = failure(new Error('empty'));
        return false;
      }
      return true;
    }

    function paint() {
      if (!analysis || !notes.length) return;
      made = toSong(notes, Number(tempo.value) || 100, title, box.checked);
      var lines = C.midiImport.summaryLines(made);
      lines.unshift(tr('{n} notas detectadas en {seconds} s.', { n: notes.length, seconds: Math.round(analysis.audio.seconds) }));
      summary.replaceChildren.apply(summary, lines.map(function (text) { return h('span', null, text); }));
      make.disabled = false;
    }

    // The warning that goes with every audio import, and a stronger one when the recording looks like a mix.
    function judge() {
      var followed = analysis.followed;
      var perSecond = notes.length / Math.max(1, analysis.audio.seconds);
      var share = Math.round(followed.clear * 100);
      var mix = followed.clear < 0.6 || perSecond > 9;
      var lines = [];
      if (mix) {
        lines.push(h('strong', null, tr('Este audio parece tener varios sonidos a la vez.')));
        lines.push(h('span', null, tr('Solo el {p} % del sonido tiene una nota clara. Es casi seguro que el resultado sea inservible.', { p: share })));
      } else {
        lines.push(h('span', null, tr('El {p} % del sonido tiene una nota clara: parece una sola melodía. Revisa el resultado en el editor.', { p: share })));
      }
      quality.className = 'import-quality' + (mix ? ' is-bad' : ' is-note');
      quality.replaceChildren.apply(quality, lines);
    }

    function run() {
      if (!made) return;
      dialog.close();
      C.editor.openDraft(made.song);
      C.ui.toast(tr('Audio importado: revisa la canción y pulsa Listo para guardarla.'), null, 8000);
    }

    box.addEventListener('change', paint);
    tempo.addEventListener('change', function () { setTempo(Number(tempo.value)); });
    sensitivity.addEventListener('change', function () { if (analysis && cut()) paint(); });

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('h2', null, 'Importar desde un audio'),
      h('div', { class: 'import-warning', role: 'alert' },
        h('strong', null, 'Solo sirve para una única melodía.'),
        h('span', null, 'El audio debe tener un solo instrumento, voz o silbido, sin nada más sonando. Si hay más de un instrumento o sonido a la vez (acompañamiento, bajo, batería, voces), el resultado será basura.')),
      h('p', { class: 'import-file', translate: 'no' }, file.name),
      progress,
      status,
      quality,
      controls,
      summary,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { dialog.close(); } }, 'Cancelar'),
        make)));
    dialog.showModal();

    decode(file).then(function (audio) {
      if (audio.samples.length < FRAME) throw new Error('empty');
      status.textContent = tr('Analizando el audio…');
      return follow(audio, function (done) { progress.value = done; }).then(function (followed) {
        analysis = { audio: audio, followed: followed };
      });
    }).then(function () {
      if (!dialog.open) return;
      progress.hidden = true;
      status.textContent = analysis.audio.truncated ? tr('Solo se han analizado los primeros {n} minutos.', { n: MAX_SECONDS / 60 }) : '';
      if (!cut()) return;
      tempo.value = estimateTempo(notes);
      controls.hidden = false;
      judge();
      paint();
    }).catch(function (error) {
      progress.hidden = true;
      status.textContent = failure(error);
    });
  }

  C.audioImport = { open: open, decode: decode, follow: follow, segment: segment, estimateTempo: estimateTempo, toSong: toSong, MAX_BYTES: MAX_BYTES, SENSITIVITY: SENSITIVITY };
})(window.Songbook = window.Songbook || {});
