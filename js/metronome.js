(function (C) {
  'use strict';

  // The metronome: a dialog opened from the toolbar. It keeps ticking after the dialog is closed (so it can
  // be used while reading a song); the toolbar button shows that it is running, and opening the dialog again
  // is how it is stopped. The same dialog has a second tab, the note detector (see pitch.js), which listens
  // to the microphone while you play; it stops listening when you leave that tab or close the window.
  //
  // The clicks are synthesised with Web Audio and scheduled a little ahead of time on the audio clock
  // (like the song player does), so the beat does not wobble when the page is busy.
  var h = C.ui.h;
  var tr = C.i18n.t;
  var state = C.store.state;

  var BPM_MIN = 30;
  var BPM_MAX = 240;
  var TICK_MS = 25;
  var LOOKAHEAD = 0.12;                  // seconds scheduled ahead of the audio clock
  var STORAGE_KEY = 'ocarina-metronome';

  var BEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
  var SUBDIVISIONS = [
    { value: 1, label: 'Negras' },
    { value: 2, label: 'Corcheas (×2)' },
    { value: 3, label: 'Tresillos (×3)' },
    { value: 4, label: 'Semicorcheas (×4)' }
  ];
  var TEMPO_NAMES = [
    [40, 'Largo'], [60, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'],
    [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo']
  ];

  var settings = load();
  var ctx = null;
  var master = null;
  var run = null;                        // { timer, next, count, queue } while ticking
  var listeners = [];
  var refs = null;                       // the dialog's live elements while it is open
  var tab = 'metronome';                 // the tab the dialog opens on: 'metronome' or 'notes'
  var detector = null;                   // the note detector's panel while the dialog is open
  var taps = [];

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { /* first visit, or storage blocked */ }
    return {
      bpm: clamp(Math.round(Number(saved.bpm)) || 100, BPM_MIN, BPM_MAX),
      beats: BEATS.indexOf(saved.beats) >= 0 ? saved.beats : 4,
      subdivision: SUBDIVISIONS.some(function (s) { return s.value === saved.subdivision; }) ? saved.subdivision : 1,
      volume: typeof saved.volume === 'number' ? clamp(saved.volume, 0, 1) : 0.7
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* not worth failing for */ }
  }

  function supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  function ensure() {
    if (ctx) return ctx;
    var Context = window.AudioContext || window.webkitAudioContext;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
    return ctx;
  }

  // ---- The click ------------------------------------------------------------------------------------
  // A short, dry "wood block": a triangle wave with a very fast decay. The first beat of the bar is higher
  // and louder, the subdivisions lower and softer. Also used by the song player for its count-in.
  var PITCH = { accent: 1500, beat: 1000, sub: 720 };
  var LEVEL = { accent: 1, beat: 0.75, sub: 0.4 };

  function clickAt(context, destination, when, kind) {
    var osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = PITCH[kind] || PITCH.beat;
    var amp = context.createGain();
    var level = LEVEL[kind] || LEVEL.beat;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(level, when + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    osc.connect(amp);
    amp.connect(destination);
    osc.start(when);
    osc.stop(when + 0.09);
    osc.onended = function () { osc.disconnect(); amp.disconnect(); };
    return {
      stop: function (time) {
        try { osc.stop(Math.max(time, when)); } catch (e) { /* already ended */ }
      }
    };
  }

  // ---- Running ----------------------------------------------------------------------------------------
  function isRunning() {
    return run !== null;
  }

  function notify() {
    listeners.forEach(function (fn) { fn(isRunning()); });
    if (refs) syncRunning();
  }

  function tick() {
    if (!run) return;
    var horizon = ctx.currentTime + LOOKAHEAD;
    while (run.next < horizon) {
      var sub = run.count % settings.subdivision;
      var beat = Math.floor(run.count / settings.subdivision) % settings.beats;
      var kind = sub > 0 ? 'sub' : (beat === 0 && settings.beats > 1 ? 'accent' : 'beat');
      clickAt(ctx, master, run.next, kind);
      run.queue.push({ time: run.next, beat: beat, sub: sub });
      run.next += 60 / settings.bpm / settings.subdivision;         // the tempo may change while it runs
      run.count++;
    }
    follow(ctx.currentTime);
  }

  // Shows the beat that is sounding now (what the speakers do, not what was scheduled).
  var shownBeat = -1;
  function follow(now) {
    var current = null;
    for (var i = 0; i < run.queue.length; i++) {
      if (run.queue[i].time <= now) current = run.queue[i];
    }
    run.queue = run.queue.filter(function (q) { return q.time > now - 0.3; });
    if (!current || current.sub !== 0 || current.time === shownBeat) return;
    shownBeat = current.time;
    pulse(current.beat);
  }

  function pulse(beat) {
    var button = document.getElementById('metronome-button');
    if (button) {
      button.classList.remove('is-tick');
      void button.offsetWidth;                 // restart the flash
      button.classList.add('is-tick');
    }
    if (refs) {
      refs.dots.forEach(function (dot, i) { dot.classList.toggle('is-on', i === beat); });
    }
  }

  function start() {
    if (run || !supported()) return;
    var context = ensure();
    context.resume().then(function () {
      if (run) return;
      run = { timer: setInterval(tick, TICK_MS), next: context.currentTime + 0.06, count: 0, queue: [] };
      shownBeat = -1;
      tick();
      notify();
    });
  }

  function stop() {
    if (!run) return;
    clearInterval(run.timer);
    run = null;
    if (refs) refs.dots.forEach(function (dot) { dot.classList.remove('is-on'); });
    notify();
  }

  function toggle() {
    if (run) stop(); else start();
  }

  // ---- Settings ---------------------------------------------------------------------------------------
  function setBpm(value) {
    var bpm = clamp(Math.round(Number(value)) || settings.bpm, BPM_MIN, BPM_MAX);
    settings.bpm = bpm;
    save();
    if (refs) syncBpm();
  }

  function setBeats(value) {
    settings.beats = BEATS.indexOf(Number(value)) >= 0 ? Number(value) : settings.beats;
    save();
    if (refs) { drawDots(); }
  }

  function setSubdivision(value) {
    if (SUBDIVISIONS.some(function (s) { return s.value === Number(value); })) settings.subdivision = Number(value);
    save();
  }

  function setVolume(value) {
    settings.volume = clamp(value, 0, 1);
    if (master) master.gain.value = settings.volume;
    save();
  }

  // Tap the button to the beat: the tempo is the average gap of the last taps.
  function tap() {
    var now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-6);
    if (taps.length < 2) return;
    var gap = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setBpm(60000 / gap);
  }

  function tempoName(bpm) {
    for (var i = 0; i < TEMPO_NAMES.length; i++) if (bpm < TEMPO_NAMES[i][0]) return TEMPO_NAMES[i][1];
    return '';
  }

  function currentSong() {
    return state.route.name === 'song' ? C.store.songById(state.route.id) : null;
  }

  // ---- The dialog ---------------------------------------------------------------------------------------
  function syncBpm() {
    refs.bpm.value = settings.bpm;
    refs.range.value = settings.bpm;
    refs.name.textContent = tempoName(settings.bpm);
  }

  function syncRunning() {
    var on = isRunning();
    refs.toggle.replaceChildren(C.icons.create(on ? 'stop' : 'play'), on ? 'Parar' : 'Empezar');
    refs.toggle.classList.toggle('is-running', on);
  }

  function drawDots() {
    refs.dotBox.replaceChildren.apply(refs.dotBox, Array.from({ length: settings.beats }, function (_, i) {
      return h('span', { class: 'metro-dot' + (i === 0 ? ' is-first' : '') });
    }));
    refs.dots = Array.from(refs.dotBox.children);
  }

  function select(items, current, label, onChange) {
    var el = h('select', { class: 'input', 'aria-label': label },
      items.map(function (item) { return h('option', { value: item.value }, item.label); }));
    el.value = String(current);
    el.addEventListener('change', function () { onChange(el.value); });
    return el;
  }

  function build(dialog) {
    var song = currentSong();
    refs = { dots: [] };

    refs.bpm = h('input', { type: 'number', class: 'metro-bpm', min: BPM_MIN, max: BPM_MAX, step: 1, 'aria-label': 'Pulsaciones por minuto' });
    refs.bpm.addEventListener('change', function () { setBpm(refs.bpm.value); });
    refs.name = h('span', { class: 'metro-name' });
    refs.range = h('input', { type: 'range', min: BPM_MIN, max: BPM_MAX, step: 1, 'aria-label': 'Tempo' });
    refs.range.addEventListener('input', function () { setBpm(refs.range.value); });
    refs.dotBox = h('div', { class: 'metro-dots', 'aria-hidden': 'true' });
    refs.toggle = h('button', { type: 'button', class: 'btn btn--primary metro-toggle', onclick: toggle });

    var minus = h('button', { type: 'button', class: 'btn metro-step', 'aria-label': 'Bajar el tempo', onclick: function (e) { setBpm(settings.bpm - (e.shiftKey ? 5 : 1)); } }, C.icons.create('remove'));
    var plus = h('button', { type: 'button', class: 'btn metro-step', 'aria-label': 'Subir el tempo', onclick: function (e) { setBpm(settings.bpm + (e.shiftKey ? 5 : 1)); } }, C.icons.create('plus'));

    var volume = h('input', { type: 'range', min: 0, max: 100, value: Math.round(settings.volume * 100), 'aria-label': 'Volumen' });
    volume.addEventListener('input', function () { setVolume(Number(volume.value) / 100); });

    var extras = [h('button', { type: 'button', class: 'btn', onclick: tap, title: 'Toca al ritmo para fijar el tempo' }, 'Marcar el tempo')];
    if (song) {
      extras.push(h('button', {
        type: 'button', class: 'btn',
        onclick: function () { setBpm(song.bpm || 100); }
      }, tr('Tempo de la canción ({bpm})', { bpm: song.bpm || 100 })));
    }

    detector = C.pitch.panel();
    refs.tabs = {};
    function tabButton(key, label) {
      refs.tabs[key] = h('button', { type: 'button', class: 'metro-tab', role: 'tab', 'data-tab': key, onclick: function () { showTab(key); } }, label);
      return refs.tabs[key];
    }
    refs.metroPanel = h('div', { class: 'metro-panel', role: 'tabpanel' },
      h('div', { class: 'metro-display' }, minus, h('div', { class: 'metro-center' }, refs.bpm, h('span', { class: 'metro-unit' }, 'BPM'), refs.name), plus),
      refs.range,
      refs.dotBox,
      h('div', { class: 'metro-fields' },
        h('label', { class: 'field' }, 'Compás',
          select(BEATS.map(function (n) { return { value: n, label: n === 1 ? tr('Sin acento') : tr('{n} tiempos', { n: n }) }; }), settings.beats, 'Tiempos por compás', setBeats)),
        h('label', { class: 'field' }, 'Subdivisión', select(SUBDIVISIONS, settings.subdivision, 'Subdivisión', setSubdivision)),
        h('label', { class: 'field' }, 'Volumen', volume)),
      h('div', { class: 'metro-extras' }, extras));
    refs.notesPanel = h('div', { class: 'metro-panel', role: 'tabpanel' }, detector.element);

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('div', { class: 'metro-tabs', role: 'tablist' }, tabButton('metronome', 'Metrónomo'), tabButton('notes', 'Detector de notas')),
      refs.metroPanel,
      refs.notesPanel,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cerrar'),
        refs.toggle)));
    drawDots();
    syncBpm();
    syncRunning();
    showTab(tab);
  }

  // Shows one tab. The microphone is only on while its tab is showing.
  function showTab(key) {
    tab = key;
    Object.keys(refs.tabs).forEach(function (name) {
      refs.tabs[name].setAttribute('aria-selected', String(name === key));
    });
    refs.metroPanel.hidden = key !== 'metronome';
    refs.notesPanel.hidden = key !== 'notes';
    refs.toggle.hidden = key !== 'metronome';
    if (key !== 'notes' && detector) detector.stop();
  }

  function dialogEl() {
    return document.getElementById('metronome-dialog');
  }

  function open() {
    var dialog = dialogEl();
    if (!dialog || !supported()) {
      C.ui.toast('Este navegador no puede reproducir sonido.');
      return;
    }
    C.menus.closeAll();
    build(dialog);
    dialog.showModal();
    (tab === 'metronome' ? refs.toggle : refs.tabs[tab]).focus();
  }

  function close() {
    var dialog = dialogEl();
    if (dialog && dialog.open) dialog.close();
    release();
  }

  // The dialog is going away: let go of its elements and of the microphone.
  function release() {
    if (detector) detector.stop();
    detector = null;
    refs = null;
  }

  function init() {
    var button = document.getElementById('metronome-button');
    if (button) button.addEventListener('click', open);
    var runButton = document.getElementById('metronome-run');
    if (runButton) {
      runButton.addEventListener('click', function () {
        if (!supported()) C.ui.toast('Este navegador no puede reproducir sonido.');
        else toggle();
      });
    }
    subscribe(function (on) {
      if (button) {
        button.classList.toggle('is-running', on);
        if (!on) button.classList.remove('is-tick');
      }
      if (runButton) {                                   // play / stop, without opening the window
        runButton.classList.toggle('is-running', on);
        runButton.setAttribute('aria-pressed', String(on));
        runButton.setAttribute('aria-label', on ? 'Parar el metrónomo' : 'Iniciar el metrónomo');
        runButton.title = on ? 'Parar el metrónomo' : 'Iniciar el metrónomo';
        runButton.querySelector('[data-icon]').replaceChildren(C.icons.create(on ? 'stop' : 'play'));
      }
    });

    var dialog = dialogEl();
    if (!dialog) return;
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });   // the backdrop
    dialog.addEventListener('cancel', release);                                            // Escape
    dialog.addEventListener('close', release);
    dialog.addEventListener('keydown', function (e) {
      if (tab !== 'metronome' || e.key !== ' ' || e.target.closest('input, select, button')) return;
      e.preventDefault();
      toggle();
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  C.metronome = { init: init, open: open, clickAt: clickAt, isRunning: isRunning, subscribe: subscribe };
})(window.Songbook = window.Songbook || {});
