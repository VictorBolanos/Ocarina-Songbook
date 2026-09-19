// Sound: plays a song, or a single note, with a synthesized ocarina (Web Audio API, no samples).
//
// Why synthesized: an ocarina is a Helmholtz resonator, so its spectrum is almost a pure sine wave
// with only weak overtones, plus a little breath noise, a soft attack and a slight pitch scoop at the
// start of each note. That is easy to imitate with a few oscillators and needs no downloads. Every knob
// of that sound is in TIMBRE below.
//
// Timing follows the "lookahead scheduler" pattern (a timer that wakes up every few milliseconds and
// schedules whatever falls in the next ~120 ms on the audio hardware's own clock), so playback stays
// steady even if the page is busy. Pause and resume simply suspend and resume the AudioContext clock.
(function (C) {
  'use strict';

  var STORAGE_KEY = 'ocarina-audio';

  var TICK_MS = 25;            // how often the scheduler wakes up
  var LOOKAHEAD = 0.12;        // seconds of audio scheduled ahead of the clock
  var MASTER_GAIN = 1.6;       // the volume slider goes from silent to this (a pure tone is quiet)

  var TIMBRE = {
    harmonics: [1, 0.14, 0.06, 0.025, 0.01],  // relative strength of partials 1..5: nearly a sine
    level: 0.34,               // peak gain of one voice
    sustain: 0.88,             // sustain level after the attack, relative to the peak
    brightness: 7,             // low-pass cutoff as a multiple of the note's frequency
    scoopCents: -28,           // each note starts this flat and slides up into pitch...
    scoopSeconds: 0.06,        // ...over this long
    vibratoHz: 5.1,            // gentle vibrato that fades in on held notes
    vibratoCents: 4,
    breathBurst: 0.16,         // breath noise at the start of a note, relative to the note's level
    breathSustain: 0.03,       // and while it is held
    release: 0.1,
    reverbWet: 0.16
  };

  var settings = { volume: 0.8, speed: 1, loop: false };

  var ctx = null;              // the AudioContext (created on the first click: browsers require that)
  var master = null;           // volume
  var bus = null;              // where voices connect: dry + reverb
  var status = 'stopped';      // 'stopped' | 'playing' | 'paused'
  var run = null;              // the sequence being played
  var active = [];             // voices that are sounding or about to
  var shown = null;            // { line, index } of the note highlighted on the page
  var listeners = [];

  var supported = function () { return !!(window.AudioContext || window.webkitAudioContext); };

  // ---- Settings ---------------------------------------------------------------------------------
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        if (isFinite(saved.volume)) settings.volume = Math.min(1, Math.max(0, saved.volume));
        if (isFinite(saved.speed) && saved.speed > 0) settings.speed = saved.speed;
        settings.loop = !!saved.loop;
      }
    } catch (e) { /* keep the defaults */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* not persisted */ }
  }

  function setVolume(value) {
    settings.volume = Math.min(1, Math.max(0, value));
    if (master) master.gain.setTargetAtTime(settings.volume * MASTER_GAIN, ctx.currentTime, 0.02);
    save();
  }

  function setSpeed(value) {
    settings.speed = value;             // takes effect from the next note scheduled
    save();
  }

  function setLoop(value) {
    settings.loop = !!value;
    save();
  }

  // ---- Building the sound ------------------------------------------------------------------------
  var clamp = function (value, min, max) { return Math.min(max, Math.max(min, value)); };

  // Higher notes sound louder to the ear at the same amplitude, so they are turned down a little.
  var loudness = function (freq) { return clamp(Math.pow(523 / freq, 0.28), 0.45, 1.15); };

  var cache = new WeakMap();      // per AudioContext: the wave table and the noise buffer

  function resources(context) {
    var found = cache.get(context);
    if (found) return found;
    var imag = new Float32Array([0].concat(TIMBRE.harmonics));
    found = { wave: context.createPeriodicWave(new Float32Array(imag.length), imag), noise: null };
    var length = context.sampleRate * 2;
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    found.noise = buffer;
    cache.set(context, found);
    return found;
  }

  // A short synthetic room, so the tone doesn't sound like it is inside a box.
  function impulse(context, seconds, decay) {
    var length = Math.floor(context.sampleRate * seconds);
    var buffer = context.createBuffer(2, length, context.sampleRate);
    for (var channel = 0; channel < 2; channel++) {
      var data = buffer.getChannelData(channel);
      var smooth = 0;
      for (var i = 0; i < length; i++) {
        smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;      // softens the hiss of the tail
        data[i] = smooth * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  // One note. `context` and `destination` are parameters so the same sound can be rendered offline
  // (OfflineAudioContext) for testing. Returns a handle whose stop(time) cuts the note short.
  function voice(context, destination, freq, when, dur) {
    var T = TIMBRE;
    var res = resources(context);
    var level = T.level * loudness(freq);
    var attack = clamp(dur * 0.25, 0.03, 0.07);
    var gap = Math.min(0.05, dur * 0.12);                       // tiny silence so repeated notes are heard
    var holdEnd = when + Math.max(dur - gap, attack + 0.03);
    var stopAt = holdEnd + T.release + 0.06;

    var amp = context.createGain();
    amp.gain.value = 0;
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(level, when + attack);
    amp.gain.setTargetAtTime(level * T.sustain, when + attack, 0.08);
    amp.gain.setTargetAtTime(0, holdEnd, T.release / 3);
    amp.connect(destination);

    // The tone: a wave table that is almost a sine, sliding up from slightly flat, with a slow vibrato.
    var tone = context.createOscillator();
    tone.setPeriodicWave(res.wave);
    tone.frequency.value = freq;
    tone.detune.setValueAtTime(T.scoopCents, when);
    tone.detune.linearRampToValueAtTime(0, when + T.scoopSeconds);

    var lfo = context.createOscillator();
    lfo.frequency.value = T.vibratoHz;
    var depth = context.createGain();
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(T.vibratoCents, when + clamp(dur - 0.1, 0.1, 0.6));
    lfo.connect(depth);
    depth.connect(tone.detune);

    var soften = context.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = clamp(freq * T.brightness, 1600, 9000);
    soften.Q.value = 0.4;
    tone.connect(soften);
    soften.connect(amp);

    // The breath: band-passed noise, strongest as the note begins.
    var hiss = context.createBufferSource();
    hiss.buffer = res.noise;
    hiss.loop = true;
    var band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = clamp(freq * 2.2, 1200, 6000);
    band.Q.value = 0.9;
    var breath = context.createGain();
    breath.gain.value = 0;
    breath.gain.setValueAtTime(0, when);
    breath.gain.linearRampToValueAtTime(level * T.breathBurst, when + 0.02);
    breath.gain.setTargetAtTime(level * T.breathSustain, when + 0.02, 0.05);
    breath.gain.setTargetAtTime(0, holdEnd, T.release / 3);
    hiss.connect(band);
    band.connect(breath);
    breath.connect(amp);

    tone.start(when);
    lfo.start(when);
    hiss.start(when);
    tone.stop(stopAt);
    lfo.stop(stopAt);
    hiss.stop(stopAt);

    var handle = {
      stop: function (time) {
        amp.gain.cancelScheduledValues(time);
        amp.gain.setTargetAtTime(0, time, 0.03);
        var end = time + 0.2;
        try { tone.stop(end); lfo.stop(end); hiss.stop(end); } catch (e) { /* already stopped */ }
      }
    };
    tone.onended = function () {
      [tone, lfo, depth, soften, hiss, band, breath, amp].forEach(function (node) { node.disconnect(); });
      var at = active.indexOf(handle);
      if (at >= 0) active.splice(at, 1);
    };
    return handle;
  }

  function ensure() {
    if (ctx) return ctx;
    var Context = window.AudioContext || window.webkitAudioContext;
    ctx = new Context();

    var compressor = ctx.createDynamicsCompressor();       // keeps chords of overlapping tails from clipping
    compressor.threshold.value = -14;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = settings.volume * MASTER_GAIN;
    master.connect(compressor);

    bus = ctx.createGain();
    var dry = ctx.createGain();
    dry.gain.value = 0.9;
    bus.connect(dry);
    dry.connect(master);
    var room = ctx.createConvolver();
    room.buffer = impulse(ctx, 1.5, 3.2);
    var wet = ctx.createGain();
    wet.gain.value = TIMBRE.reverbWet;
    bus.connect(room);
    room.connect(wet);
    wet.connect(master);
    return ctx;
  }

  // ---- Playing a sequence ----------------------------------------------------------------------------
  // The song as a flat list of timed events, in reading order. A line break takes no time: the next line
  // starts right where the previous one ends. Silence is written into the song as a rest.
  function sequence(song) {
    var events = [];
    song.lines.forEach(function (line, li) {
      line.notes.forEach(function (code, ni) {
        var note = C.notes.parse(code);
        if (!note) return;
        events.push({ beats: C.notes.beats(note), midi: C.notes.midi(note), line: li, index: ni });
      });
    });
    return events;
  }

  function setStatus(next) {
    status = next;
    listeners.forEach(function (fn) { fn(status); });
  }

  function tick() {
    if (!run) return;
    var horizon = ctx.currentTime + LOOKAHEAD;
    while (run.next < run.events.length && run.cursor < horizon) {
      var event = run.events[run.next++];
      var dur = event.beats * 60 / (run.bpm * settings.speed);
      if (event.midi !== null) active.push(voice(ctx, bus, C.notes.frequency(event.midi), run.cursor, dur));
      run.scheduled.push({ start: run.cursor, end: run.cursor + dur, line: event.line, index: event.index });
      run.cursor += dur;
    }
    follow(ctx.currentTime);
    if (run.next >= run.events.length && ctx.currentTime >= run.cursor) {
      if (settings.loop) {
        run.next = run.first;
        run.cursor = ctx.currentTime + 0.05;
      } else {
        stop();
      }
    }
  }

  // Highlights the note that is sounding right now, following the audio clock (what the speakers do).
  function follow(now) {
    var current = null;
    for (var i = 0; i < run.scheduled.length; i++) {
      var s = run.scheduled[i];
      if (s.start <= now && now < s.end) current = s;
    }
    run.scheduled = run.scheduled.filter(function (s) { return s.end > now - 0.5; });
    highlight(current);
  }

  function elementFor(ref) {
    return ref ? document.querySelector('[data-note="' + ref.line + ':' + ref.index + '"]') : null;
  }

  function highlight(ref) {
    if ((ref && shown && ref.line === shown.line && ref.index === shown.index) || (!ref && !shown)) return;
    var previous = document.querySelector('.note.is-playing');
    if (previous) previous.classList.remove('is-playing');
    shown = ref ? { line: ref.line, index: ref.index } : null;
    var el = elementFor(shown);
    if (!el) return;
    el.classList.add('is-playing');
    var rect = el.getBoundingClientRect();
    if (rect.top < 150 || rect.bottom > window.innerHeight - 120) {      // keep clear of the sticky bars
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // Puts the highlight back after the page was redrawn while a song is playing.
  function refreshHighlight() {
    var el = elementFor(shown);
    if (el) el.classList.add('is-playing');
  }

  // Plays `song`, from its first note or from `from` ({ line, index }).
  function play(song, from) {
    if (!supported()) return Promise.resolve();
    stop();
    var events = sequence(song);
    var first = 0;
    if (from) {
      first = events.findIndex(function (e) { return e.line > from.line || (e.line === from.line && e.index >= from.index); });
      if (first < 0) first = 0;
    }
    if (!events.length) return Promise.resolve();
    var context = ensure();
    return context.resume().then(function () {
      run = { songId: song.id, bpm: song.bpm || 100, events: events, first: first, next: first,
              cursor: context.currentTime + 0.08, scheduled: [], timer: null };
      run.timer = setInterval(tick, TICK_MS);
      setStatus('playing');
      tick();
    });
  }

  function pause() {
    if (status !== 'playing') return;
    ctx.suspend();                    // freezes the audio clock, and with it every scheduled note
    setStatus('paused');
  }

  function resume() {
    if (status !== 'paused') return;
    ctx.resume();
    setStatus('playing');
  }

  function stop() {
    if (!run && status === 'stopped') return;
    if (run) {
      clearInterval(run.timer);
      run = null;
    }
    if (ctx) {
      var suspended = ctx.state === 'suspended';
      active.slice().forEach(function (v) { v.stop(ctx.currentTime); });
      active = [];
      if (suspended) ctx.resume();
    }
    highlight(null);
    setStatus('stopped');
  }

  load();

  C.audio = {
    supported: supported,
    status: function () { return status; },
    playingSongId: function () { return run ? run.songId : null; },
    subscribe: function (fn) { listeners.push(fn); },
    settings: settings,
    setVolume: setVolume,
    setSpeed: setSpeed,
    setLoop: setLoop,
    play: play,
    pause: pause,
    resume: resume,
    stop: stop,
    refreshHighlight: refreshHighlight,
    // exposed for offline rendering and tests
    voice: voice,
    sequence: sequence
  };
})(window.Songbook = window.Songbook || {});
