(function (C) {
  'use strict';

  // Note detection from the microphone: you play, the page tells you which note it hears and how close to
  // in tune it is. It lives in the metronome's window (see metronome.js), as a second tab.
  //
  // How it works: the microphone is read as a stream of sound samples, and about sixty times a second the
  // last 2048 of them go through the YIN algorithm, which finds the length of the repeating wave and so its
  // frequency. An ocarina sounds almost like a pure sine wave, so this is fast and steady for it. The
  // frequency then becomes the nearest note and the distance to it in cents (a hundredth of a semitone).
  // Nothing is recorded or sent anywhere: the samples are only looked at and thrown away.
  var h = C.ui.h;
  var tr = C.i18n.t;

  var MIN_FREQ = 330;                    // a little under the ocarina's lowest note (A4, 440 Hz)
  var MAX_FREQ = 1800;                   // a little over its highest (F6, 1397 Hz)
  var FFT = 2048;                        // samples looked at each time
  var WINDOW = 1024;                     // samples compared with themselves shifted (see yin)
  var GATE = 0.01;                       // below this loudness (rms, 0-1) nothing is being played
  var THRESHOLD = 0.15;                  // how clean the repetition must be (lower is stricter)
  var IN_TUNE = 8;                       // cents either way that still count as in tune
  var HOLD_MS = 220;                     // how long the last note stays on screen after it stops
  var TARGET_LOW = 69;                   // the notes that can be picked to practise: A4 ...
  var TARGET_HIGH = 89;                  // ... to F6, the ocarina's range
  var TARGET_KEY = 'ocarina-pitch-target';

  var NAMES_SHARP = [['Do', ''], ['Do', '#'], ['Re', ''], ['Re', '#'], ['Mi', ''], ['Fa', ''], ['Fa', '#'], ['Sol', ''], ['Sol', '#'], ['La', ''], ['La', '#'], ['Si', '']];
  var NAMES_FLAT = [['Do', ''], ['Re', 'b'], ['Re', ''], ['Mi', 'b'], ['Mi', ''], ['Fa', ''], ['Sol', 'b'], ['Sol', ''], ['La', 'b'], ['La', ''], ['Si', 'b'], ['Si', '']];
  var OCTAVES = ['low', 'mid', 'high', 'high2'];
  var MIDDLE_DO = 72;                    // C5, the ocarina's Do (see notes.js)

  // ---- Finding the frequency -------------------------------------------------------------------------------
  // YIN (de Cheveigné and Kawahara, 2002): for every shift `tau` it measures how different the wave is from
  // itself shifted by that many samples, normalises that, and takes the first shift where the difference
  // nearly vanishes: that is the period. Returns { freq, clarity } or null when there is no clear pitch.
  function yin(buffer, sampleRate) {
    var tauMax = Math.min(Math.floor(sampleRate / MIN_FREQ), buffer.length - WINDOW - 1);
    var tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    var diff = new Float32Array(tauMax + 1);
    for (var tau = 1; tau <= tauMax; tau++) {
      var sum = 0;
      for (var j = 0; j < WINDOW; j++) {
        var d = buffer[j] - buffer[j + tau];
        sum += d * d;
      }
      diff[tau] = sum;
    }
    var cmnd = new Float32Array(tauMax + 1);
    cmnd[0] = 1;
    var running = 0;
    for (var t = 1; t <= tauMax; t++) {
      running += diff[t];
      cmnd[t] = running > 0 ? diff[t] * t / running : 1;
    }
    var best = -1;
    for (var k = tauMin; k <= tauMax; k++) {
      if (cmnd[k] < THRESHOLD) {
        while (k + 1 <= tauMax && cmnd[k + 1] < cmnd[k]) k++;      // down to the bottom of the dip
        best = k;
        break;
      }
    }
    if (best < 0) return null;
    // A parabola through the dip and its neighbours gives the shift between whole samples.
    var before = best > 1 ? cmnd[best - 1] : cmnd[best];
    var after = best < tauMax ? cmnd[best + 1] : cmnd[best];
    var bend = before + after - 2 * cmnd[best];
    var exact = bend !== 0 ? best + (before - after) / (2 * bend) : best;
    return { freq: sampleRate / exact, clarity: 1 - cmnd[best] };
  }

  function loudness(buffer) {
    var sum = 0;
    for (var i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
  }

  // ---- From a frequency to a note -----------------------------------------------------------------------------------
  function spell(pair, octave) {
    return C.i18n.noteName(pair[0]) + C.notes.glyph(pair[1]) + C.notes.displayMark(octave);
  }

  // The name of a note by its MIDI number, in the ocarina's terms: Do is C5 (middle octave), Do' is C6, Do, is
  // C4. `inRange` is false outside the octaves the page has (C4 to B6). `alt` is the flat name of a sharp.
  function nameOf(midi) {
    var shift = midi - MIDDLE_DO;
    var octave = Math.floor(shift / 12);
    var pitchClass = ((shift % 12) + 12) % 12;
    var inRange = octave >= -1 && octave <= 2;
    var key = inRange ? OCTAVES[octave + 1] : 'mid';
    var sharp = NAMES_SHARP[pitchClass];
    var flat = NAMES_FLAT[pitchClass];
    return { inRange: inRange, text: spell(sharp, key), alt: sharp[1] ? spell(flat, key) : '' };
  }

  // The nearest note of a frequency. `exact` is its MIDI number with decimals; `cents` is how far above (+)
  // or below (-) the nearest note the sound is.
  function describe(freq) {
    var exact = 69 + 12 * Math.log2(freq / 440);
    var midi = Math.round(exact);
    var name = nameOf(midi);
    return { midi: midi, exact: exact, cents: (exact - midi) * 100, inRange: name.inRange, text: name.text, alt: name.alt };
  }

  // ---- Listening -------------------------------------------------------------------------------------------------------
  // Starts reading a media stream (the microphone) and calls onFrame({ level, freq, note }) about sixty times
  // a second: `level` is the loudness, `freq` and `note` (from describe) are null while nothing is played.
  // Returns { stop }.
  function listen(stream, onFrame) {
    var Context = window.AudioContext || window.webkitAudioContext;
    var context = new Context();
    var source = context.createMediaStreamSource(stream);
    var analyser = context.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);                             // not to the speakers: that would feed back
    if (context.state === 'suspended') context.resume();

    var buffer = new Float32Array(FFT);
    var recent = [];                                      // the last few frames' readings, for a steady answer
    var shown = null;
    var shownAt = 0;
    var frame = 0;
    var stopped = false;

    function tick(now) {
      if (stopped) return;
      analyser.getFloatTimeDomainData(buffer);
      var level = loudness(buffer);
      var reading = null;
      if (level > GATE) {
        var found = yin(buffer, context.sampleRate);
        if (found && found.clarity >= 0.8 && found.freq >= MIN_FREQ && found.freq <= MAX_FREQ) reading = found;
      }
      recent.push(reading);
      if (recent.length > 6) recent.shift();

      // The note is the one most of the recent readings agree on.
      var votes = {};
      recent.forEach(function (r) {
        if (!r) return;
        var midi = describe(r.freq).midi;
        (votes[midi] = votes[midi] || []).push(r.freq);
      });
      var winner = null;
      Object.keys(votes).forEach(function (midi) {
        if (votes[midi].length >= 3 && (winner === null || votes[midi].length > votes[winner].length)) winner = midi;
      });
      if (winner !== null) {
        var freqs = votes[winner].slice().sort(function (a, b) { return a - b; });
        var median = freqs[Math.floor(freqs.length / 2)];
        shown = { freq: median, note: describe(median) };
        shownAt = now;
      } else if (shown && now - shownAt > HOLD_MS && !recent.some(Boolean)) {
        shown = null;
      }
      onFrame({ level: level, freq: shown ? shown.freq : null, note: shown ? shown.note : null });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return {
      stop: function () {
        stopped = true;
        cancelAnimationFrame(frame);
        source.disconnect();
        context.close();
        stream.getTracks().forEach(function (track) { track.stop(); });
      }
    };
  }

  // The microphone, without the phone's own clean-up (echo cancelling, noise suppression and automatic
  // gain), which would bend a steady tone.
  function openMicrophone() {
    var devices = navigator.mediaDevices;
    if (!devices || !devices.getUserMedia) return Promise.reject(new Error('unsupported'));
    return devices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  }

  // The note being practised is remembered between visits.
  function loadTarget() {
    var value = null;
    try { value = Number(localStorage.getItem(TARGET_KEY)); } catch (e) { /* storage blocked */ }
    return Number.isInteger(value) && value >= TARGET_LOW && value <= TARGET_HIGH ? value : null;
  }

  function saveTarget(midi) {
    try {
      if (midi === null) localStorage.removeItem(TARGET_KEY);
      else localStorage.setItem(TARGET_KEY, String(midi));
    } catch (e) { /* not worth failing for */ }
  }

  // ---- The panel -----------------------------------------------------------------------------------------------------------
  // The contents of the metronome window's second tab. `stop()` releases the microphone.
  function panel(options) {
    options = options || {};
    var handle = null;                                     // the running listener
    var busy = false;
    var target = loadTarget();                             // the note being practised (MIDI number), or null for any

    var noteEl = h('div', { class: 'pitch-note', translate: 'no' }, '—');
    var altEl = h('div', { class: 'pitch-alt', translate: 'no' });
    var hzEl = h('div', { class: 'pitch-hz' });
    var needle = h('span', { class: 'pitch-needle' });
    var meter = h('div', { class: 'pitch-meter', role: 'img', 'aria-label': 'Afinación' },
      h('span', { class: 'pitch-mark pitch-mark--flat' }), h('span', { class: 'pitch-mark pitch-mark--centre' }), h('span', { class: 'pitch-mark pitch-mark--sharp' }), needle);
    var verdict = h('div', { class: 'pitch-verdict', role: 'status' });
    var levelBar = h('span', { class: 'pitch-level-bar' });
    var level = h('div', { class: 'pitch-level', 'aria-hidden': 'true' }, levelBar);
    var status = h('p', { class: 'pitch-status', role: 'status' });
    var button = h('button', { type: 'button', class: 'btn btn--primary pitch-toggle', onclick: toggle });

    // The note to practise: any note, or one of the ocarina's, grouped by octave.
    var picker = h('select', { class: 'input', 'aria-label': 'Nota a practicar' }, h('option', { value: '' }, 'Cualquier nota'));
    [['low', 69, 71], ['mid', 72, 83], ['high', 84, 89]].forEach(function (group) {
      var box = h('optgroup', { label: C.i18n.octave(group[0]) });
      for (var midi = group[1]; midi <= group[2]; midi++) {
        var name = nameOf(midi);
        box.appendChild(h('option', { value: midi, translate: 'no' }, name.text + (name.alt ? ' / ' + name.alt : '')));
      }
      picker.appendChild(box);
    });
    picker.value = target === null ? '' : String(target);
    picker.addEventListener('change', function () {
      target = picker.value === '' ? null : Number(picker.value);
      saveTarget(target);
      if (!handle) showIdle('');
    });

    function showIdle(message) {
      noteEl.textContent = '—';
      noteEl.classList.remove('is-out');
      altEl.textContent = '';
      hzEl.textContent = '';
      verdict.textContent = message || '';
      verdict.className = 'pitch-verdict';
      needle.style.left = '50%';
      needle.classList.remove('is-on', 'is-ok', 'is-far');
      levelBar.style.width = '0%';
    }

    function paintButton() {
      button.replaceChildren(C.icons.create(handle ? 'stop' : 'play'), handle ? tr('Apagar el micrófono') : tr('Activar el micrófono'));
      button.classList.toggle('is-running', !!handle);
      button.disabled = busy;
    }

    // What to tell the person about the note they are playing, given the note they picked (if any).
    function judge(note) {
      if (target === null) {
        var inTune = Math.abs(note.cents) <= IN_TUNE;
        if (!note.inRange) return { text: tr('Fuera de las octavas de la ocarina'), cents: note.cents };
        if (inTune) return { text: tr('En afinación'), cents: note.cents, ok: true };
        return { text: tr(note.cents > 0 ? 'Un poco alta (+{cents} cents)' : 'Un poco baja ({cents} cents)', { cents: Math.round(note.cents) }), cents: note.cents };
      }
      var away = (note.exact - target) * 100;               // cents from the note being practised
      if (Math.abs(away) <= IN_TUNE) return { text: tr('¡Bien! Es la nota'), cents: away, ok: true };
      if (Math.abs(away) < 50) {
        return { text: tr(away > 0 ? 'Es la nota, un poco alta (+{cents} cents)' : 'Es la nota, un poco baja ({cents} cents)', { cents: Math.round(away) }), cents: away };
      }
      var steps = Math.round(Math.abs(away) / 100);
      var distance = steps === 12 ? tr('una octava') : tr(steps === 1 ? '{n} semitono' : '{n} semitonos', { n: steps });
      var wanted = nameOf(target).text;
      return { text: tr(away > 0 ? 'Por encima de {note}: {distance}' : 'Por debajo de {note}: {distance}', { note: wanted, distance: distance }), cents: away, far: true };
    }

    function onFrame(frame) {
      levelBar.style.width = Math.min(100, Math.round(Math.sqrt(frame.level) * 160)) + '%';
      if (!frame.note) {
        showIdle('');
        levelBar.style.width = Math.min(100, Math.round(Math.sqrt(frame.level) * 160)) + '%';
        verdict.textContent = target === null ? tr('Toca una nota…') : tr('Toca {note}…', { note: nameOf(target).text });
        verdict.className = 'pitch-verdict is-wait';
        return;
      }
      var note = frame.note;
      var result = judge(note);
      noteEl.textContent = note.text;
      noteEl.classList.toggle('is-out', !note.inRange);
      altEl.textContent = note.alt;
      hzEl.textContent = frame.freq.toFixed(1).replace('.', C.i18n.lang() === 'en' ? '.' : ',') + ' Hz';
      needle.style.left = (50 + Math.max(-50, Math.min(50, result.cents))) + '%';
      needle.classList.add('is-on');
      needle.classList.toggle('is-ok', !!result.ok);
      needle.classList.toggle('is-far', !!result.far);
      verdict.textContent = result.text;
      verdict.className = 'pitch-verdict' + (result.ok ? ' is-ok' : (result.far ? ' is-far' : ''));
    }

    function stop() {
      if (handle) handle.stop();
      handle = null;
      busy = false;
      paintButton();
      showIdle('');
      if (options.onChange) options.onChange(false);
    }

    function toggle() {
      if (handle) {
        stop();
        status.textContent = '';
        return;
      }
      busy = true;
      paintButton();
      status.textContent = tr('Esperando el permiso del micrófono…');
      openMicrophone().then(function (stream) {
        busy = false;
        handle = listen(stream, onFrame);
        status.textContent = '';
        paintButton();
        verdict.textContent = target === null ? tr('Toca una nota…') : tr('Toca {note}…', { note: nameOf(target).text });
        verdict.className = 'pitch-verdict is-wait';
        if (options.onChange) options.onChange(true);
      }).catch(function (error) {
        busy = false;
        handle = null;
        paintButton();
        var name = error && error.name;
        status.textContent = name === 'NotAllowedError' || name === 'SecurityError'
          ? tr('No hay permiso para usar el micrófono. Permítelo en el navegador y vuelve a intentarlo.')
          : (name === 'NotFoundError' || name === 'OverconstrainedError'
            ? tr('No se ha encontrado ningún micrófono.')
            : tr('Este navegador no puede usar el micrófono aquí. Hace falta abrir la página desde una dirección segura (https).'));
      });
    }

    var element = h('div', { class: 'pitch' },
      h('p', { class: 'pitch-intro' }, 'Activa el micrófono y toca: la página te dice qué nota oye y si está afinada. Elige una nota para practicarla y te dirá si vas por encima o por debajo.'),
      h('label', { class: 'field pitch-target' }, 'Nota a practicar', picker),
      h('div', { class: 'pitch-display' }, noteEl, altEl, hzEl),
      meter,
      verdict,
      level,
      status,
      h('p', { class: 'pitch-hint' }, 'El sonido no se graba ni sale de tu equipo. Si suena el metrónomo o una canción por los altavoces, el micrófono la oirá: usa auriculares.'),
      h('div', { class: 'pitch-actions' }, button));
    paintButton();
    showIdle('');

    return { element: element, stop: stop, isListening: function () { return !!handle; }, attach: function (stream) { handle = listen(stream, onFrame); paintButton(); if (options.onChange) options.onChange(true); } };
  }

  C.pitch = { panel: panel, describe: describe, nameOf: nameOf, yin: yin, listen: listen };
})(window.Songbook = window.Songbook || {});
