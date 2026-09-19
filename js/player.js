(function (C) {
  'use strict';

  // The play / pause / stop bar shown on a song's page, wired to js/audio.js.
  var h = C.ui.h;
  var state = C.store.state;

  var SPEEDS = [[0.5, '50 %'], [0.75, '75 %'], [1, '100 %'], [1.25, '125 %']];

  var refs = null;         // the buttons of the bar currently on screen

  // The stretch of the song to repeat (reading view only): pick its first and last note.
  var stretchOn = false;   // "Tramo" is pressed: clicking notes picks the stretch instead of playing
  var stretch = null;      // { a: {line, index}, b: {line, index} | null }
  var stretchSong = null;  // id of the song the stretch belongs to
  var moreOpen = false;    // phone layout: the secondary controls (volume, repeat, section...) are shown

  function currentSong() {
    return state.route.name === 'song' ? C.store.songById(state.route.id) : null;
  }

  function playable(song) {
    return song.lines.some(function (line) {
      return line.notes.some(function (code) { var n = C.notes.parse(code); return n && !n.rest; });
    });
  }

  function stretchReady() {
    return !!(stretchOn && stretch && stretch.b);
  }

  // Play / pause / resume, depending on what the audio is doing.
  function toggle() {
    var song = currentSong();
    if (!song) return;
    var status = C.audio.status();
    if (status === 'playing') C.audio.pause();
    else if (status === 'paused') C.audio.resume();
    else if (stretchReady()) C.audio.play(song, stretch.a, stretch.b);
    else C.audio.play(song, state.editId === song.id ? state.selection : null);   // from the picked note, if any
  }

  // A note was clicked on the page: it starts playing from there, or with "Tramo" on it picks the stretch.
  function noteClicked(line, index) {
    var song = currentSong();
    if (!song) return;
    if (!stretchOn) {
      C.audio.play(song, { line: line, index: index });
      return;
    }
    var point = { line: line, index: index };
    if (!stretch || stretch.b) {
      stretch = { a: point, b: null };
    } else if (line < stretch.a.line || (line === stretch.a.line && index < stretch.a.index)) {
      stretch = { a: point, b: stretch.a };
    } else {
      stretch.b = point;
    }
    stretchSong = song.id;
    C.audio.stop();
    markStretch();
    syncStretch();
  }

  function before(x, y) {
    return x.line < y.line || (x.line === y.line && x.index < y.index);
  }

  // Marks the picked notes on the page (called after every redraw too).
  function markStretch() {
    document.querySelectorAll('.in-stretch, .stretch-start, .stretch-end').forEach(function (el) {
      el.classList.remove('in-stretch', 'stretch-start', 'stretch-end');
    });
    if (!stretchOn || !stretch) return;
    document.querySelectorAll('.rows [data-note]').forEach(function (el) {
      var at = el.getAttribute('data-note').split(':');
      var point = { line: Number(at[0]), index: Number(at[1]) };
      var isA = point.line === stretch.a.line && point.index === stretch.a.index;
      var isB = stretch.b && point.line === stretch.b.line && point.index === stretch.b.index;
      if (isA) el.classList.add('stretch-start');
      if (isB) el.classList.add('stretch-end');
      if (isA || isB || (stretch.b && before(stretch.a, point) && before(point, stretch.b))) el.classList.add('in-stretch');
    });
  }

  function stretchHint() {
    if (!stretchOn) return '';
    if (!stretch) return 'Pulsa la primera nota del tramo.';
    if (!stretch.b) return 'Ahora pulsa la última nota del tramo.';
    return 'Se repetirá el tramo marcado. Pulsa otra nota para elegir otro.';
  }

  function syncStretch() {
    if (!refs) return;
    refs.stretch.setAttribute('aria-pressed', String(stretchOn));
    refs.hint.textContent = stretchHint();
    refs.hint.hidden = !stretchOn;
  }

  function setStretchMode(on) {
    stretchOn = on;
    if (!on) stretch = null;
    if (on) stretchSong = currentSong() && currentSong().id;
    C.audio.stop();
    markStretch();
    syncStretch();
  }

  // Keeps the bar's buttons in step with the audio state.
  function sync() {
    if (!refs) return;
    var status = C.audio.status();
    refs.play.replaceChildren(C.icons.create(status === 'playing' ? 'pause' : 'play'));
    refs.play.setAttribute('aria-label', status === 'playing' ? 'Pausar' : (status === 'paused' ? 'Continuar' : 'Reproducir'));
    refs.play.classList.toggle('is-active', status !== 'stopped');
    refs.stop.disabled = status === 'stopped';
  }

  function view(song) {
    refs = null;
    if (stretchSong !== song.id || state.editId === song.id) {       // a stretch belongs to one song, in reading view
      stretchOn = false;
      stretch = null;
      stretchSong = song.id;
    }
    if (!C.audio.supported() || !playable(song)) return null;

    var play = h('button', { type: 'button', class: 'player-play', 'data-key': 'play', onclick: toggle });
    var stop = h('button', {
      type: 'button',
      class: 'player-stop',
      'data-key': 'stop-audio',
      'aria-label': 'Detener',
      onclick: function () { C.audio.stop(); }
    }, C.icons.create('stop'));

    var speed = h('select', {
      class: 'input input--mini',
      'aria-label': 'Velocidad de reproducción',
      onchange: function () { C.audio.setSpeed(Number(speed.value)); }
    }, SPEEDS.map(function (s) { return h('option', { value: s[0] }, s[1]); }));
    speed.value = String(C.audio.settings.speed);

    var volume = h('input', {
      type: 'range', min: 0, max: 100, value: Math.round(C.audio.settings.volume * 100), 'aria-label': 'Volumen'
    });
    volume.addEventListener('input', function () { C.audio.setVolume(Number(volume.value) / 100); });

    var loop = h('button', {
      type: 'button',
      class: 'btn btn--sm player-loop player-extra',
      'aria-pressed': String(C.audio.settings.loop),
      title: 'Repetir la canción al terminar',
      onclick: function () {
        C.audio.setLoop(!C.audio.settings.loop);
        loop.setAttribute('aria-pressed', String(C.audio.settings.loop));
      }
    }, 'Repetir');

    var countIn = h('button', {
      type: 'button',
      class: 'btn btn--sm player-countin player-extra',
      'aria-pressed': String(C.audio.settings.countIn),
      title: 'Oír una cuenta de clics (un compás) antes de que empiece la canción',
      onclick: function () {
        C.audio.setCountIn(!C.audio.settings.countIn);
        countIn.setAttribute('aria-pressed', String(C.audio.settings.countIn));
      }
    }, 'Cuenta previa');

    var stretchButton = h('button', {
      type: 'button',
      class: 'btn btn--sm player-stretch player-extra',
      'aria-pressed': String(stretchOn),
      title: 'Marcar un tramo de la canción y repetirlo',
      onclick: function () { setStretchMode(!stretchOn); }
    }, 'Tramo');
    var hint = h('span', { class: 'player-hint player-extra', hidden: true });

    var exportButton = h('button', {
      type: 'button',
      class: 'btn btn--sm player-export player-extra',
      'data-key': 'export',
      title: 'Guardar la canción como MIDI, WAV o MP4',
      onclick: function () { C.exporter.open(currentSong()); }
    }, 'Exportar');

    refs = { play: play, stop: stop, stretch: stretchButton, hint: hint };
    sync();
    syncStretch();

    var panel = null;
    var more = h('button', {
      type: 'button',
      class: 'btn btn--sm player-more',
      'aria-expanded': String(moreOpen),
      'aria-label': moreOpen ? 'Menos controles' : 'Más controles',
      onclick: function () {
        moreOpen = !moreOpen;
        panel.classList.toggle('is-more', moreOpen);
        more.setAttribute('aria-expanded', String(moreOpen));
        more.setAttribute('aria-label', moreOpen ? 'Menos controles' : 'Más controles');
        more.replaceChildren(C.icons.create(moreOpen ? 'arrow-up' : 'arrow-down'));
      }
    }, C.icons.create(moreOpen ? 'arrow-up' : 'arrow-down'));

    panel = h('div', { class: 'player no-print' + (moreOpen ? ' is-more' : '') + (state.editId === song.id ? ' player--edit' : ''), role: 'group', 'aria-label': 'Reproductor' },
      play,
      stop,
      h('span', { class: 'player-tempo', title: 'Tempo de la canción' }, (song.bpm || 100) + ' BPM'),
      h('label', { class: 'player-field' }, h('span', null, 'Velocidad'), speed),
      more,
      h('label', { class: 'player-field player-volume player-extra' }, h('span', null, 'Volumen'), volume),
      loop,
      state.editId === song.id ? null : stretchButton,
      countIn,
      exportButton,
      hint);
    return panel;
  }

  function init() {
    C.audio.subscribe(sync);

    // Leaving the song stops the music.
    C.store.subscribe(function () {
      var playing = C.audio.playingSongId();
      if (playing !== null && (state.route.name !== 'song' || state.route.id !== playing)) C.audio.stop();
    });

    // Space plays and pauses, unless it is being used to press a button or type.
    document.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.defaultPrevented || state.route.name !== 'song' || state.editId) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, a, dialog, [contenteditable]')) return;
      if (!currentSong()) return;
      e.preventDefault();
      toggle();
    });
  }

  C.player = { view: view, init: init, noteClicked: noteClicked, markStretch: markStretch };
})(window.Songbook = window.Songbook || {});
