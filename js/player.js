(function (C) {
  'use strict';

  // The play / pause / stop bar shown on a song's page, wired to js/audio.js.
  var h = C.ui.h;
  var state = C.store.state;

  var SPEEDS = [[0.5, '50 %'], [0.75, '75 %'], [1, '100 %'], [1.25, '125 %']];

  var refs = null;         // the buttons of the bar currently on screen

  function currentSong() {
    return state.route.name === 'song' ? C.store.songById(state.route.id) : null;
  }

  function playable(song) {
    return song.lines.some(function (line) {
      return line.notes.some(function (code) { var n = C.notes.parse(code); return n && !n.rest; });
    });
  }

  // Play / pause / resume, depending on what the audio is doing.
  function toggle() {
    var song = currentSong();
    if (!song) return;
    var status = C.audio.status();
    if (status === 'playing') C.audio.pause();
    else if (status === 'paused') C.audio.resume();
    else C.audio.play(song, state.editId === song.id ? state.selection : null);   // from the picked note, if any
  }

  // Starts from a given note (clicking a note on the page).
  function playFrom(line, index) {
    var song = currentSong();
    if (song) C.audio.play(song, { line: line, index: index });
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
      class: 'btn btn--sm player-loop',
      'aria-pressed': String(C.audio.settings.loop),
      title: 'Repetir la canción al terminar',
      onclick: function () {
        C.audio.setLoop(!C.audio.settings.loop);
        loop.setAttribute('aria-pressed', String(C.audio.settings.loop));
      }
    }, 'Repetir');

    refs = { play: play, stop: stop };
    sync();

    return h('div', { class: 'player no-print', role: 'group', 'aria-label': 'Reproductor' },
      play,
      stop,
      h('span', { class: 'player-tempo', title: 'Tempo de la canción' }, (song.bpm || 100) + ' BPM'),
      h('label', { class: 'player-field' }, h('span', null, 'Velocidad'), speed),
      h('label', { class: 'player-field player-volume' }, h('span', null, 'Volumen'), volume),
      loop);
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

  C.player = { view: view, init: init, playFrom: playFrom };
})(window.Songbook = window.Songbook || {});
