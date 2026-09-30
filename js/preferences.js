(function (C) {
  'use strict';

  var root = document.documentElement;

  // Appearance settings, kept per browser. Each one is an attribute on <html> that the CSS reads
  // (data-theme = color, data-font = typeface, data-mode = claro / oscuro).
  var COLORS = [
    ['neutro', 'Neutro'], ['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'],
    ['canela', 'Canela'], ['morado', 'Morado'], ['rosa', 'Rosa'], ['azul', 'Azul']
  ];
  var FONTS = [
    ['clasica', 'Clásica'], ['moderna', 'Moderna'], ['legible', 'Legible'],
    ['manuscrita', 'Manuscrita'], ['consolas', 'Consolas'], ['maquina', 'Máquina']
  ];

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* the setting just won't persist */ }
  }

  // "blanco" and "negro" used to be colors; now they are neutro in claro / oscuro.
  function migrate() {
    var old = read('ocarina-theme');
    if (old !== 'blanco' && old !== 'negro') return;
    if (!read('ocarina-mode')) write('ocarina-mode', old === 'negro' ? 'oscuro' : 'claro');
    write('ocarina-theme', 'neutro');
  }

  // A drop-down that picks one value. `attr` is the <html> attribute it controls; the swatch/preview
  // elements carry the same attribute so the CSS can paint them with the option's own values.
  function initPicker(name, attr, storageKey, items, fallback) {
    var picker = C.menus.register(name);
    var options = [];

    function apply(value) {
      root.setAttribute(attr, value);
      options.forEach(function (option) {
        option.setAttribute('aria-pressed', String(option.dataset.value === value));
      });
    }

    items.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.dataset.value = item[0];
      if (attr === 'data-theme') {
        var swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.setAttribute('data-theme', item[0]);
        button.appendChild(swatch);
      } else {
        button.setAttribute(attr, item[0]);
      }
      button.appendChild(document.createTextNode(item[1]));
      button.addEventListener('click', function () {
        apply(item[0]);
        write(storageKey, item[0]);
        picker.close();
        picker.button.focus();
      });
      picker.menu.appendChild(button);
      options.push(button);
    });

    var saved = read(storageKey);
    apply(items.some(function (item) { return item[0] === saved; }) ? saved : fallback);
  }

  function initMode() {
    var button = document.getElementById('mode-toggle');
    var label = document.getElementById('mode-label');
    var icon = document.getElementById('mode-icon');
    var prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;

    function setMode(mode) {
      root.setAttribute('data-mode', mode);
      button.setAttribute('aria-pressed', String(mode === 'oscuro'));
      button.setAttribute('aria-label', mode === 'oscuro' ? 'Modo oscuro activo. Pulsa para pasar a claro' : 'Modo claro activo. Pulsa para pasar a oscuro');
      label.textContent = mode === 'oscuro' ? 'Oscuro' : 'Claro';
      icon.replaceChildren(C.icons.create(mode === 'oscuro' ? 'dark_mode' : 'light_mode'));
      // Color swatches preview each color in the current mode.
      var swatches = document.querySelectorAll('.swatch[data-theme]');
      for (var i = 0; i < swatches.length; i++) swatches[i].setAttribute('data-mode', mode);
    }

    var saved = read('ocarina-mode');
    setMode(saved === 'claro' || saved === 'oscuro' ? saved : (prefersDark ? 'oscuro' : 'claro'));

    button.addEventListener('click', function () {
      var next = root.getAttribute('data-mode') === 'oscuro' ? 'claro' : 'oscuro';
      setMode(next);
      write('ocarina-mode', next);
    });
  }

  // How notes are drawn: "names" (the Do / Re / Mi chips), "fingering" (the ocarina diagrams) or
  // "both". It is only an attribute on <html>; the CSS decides what each chip shows, so switching
  // is instant and nothing is redrawn.
  function initView() {
    var group = document.getElementById('view-switch');
    var radios = group.querySelectorAll('input[name="view"]');
    var values = [].map.call(radios, function (radio) { return radio.value; });

    function setView(view) {
      root.setAttribute('data-view', view);
      [].forEach.call(radios, function (radio) { radio.checked = radio.value === view; });
    }

    var saved = read('ocarina-view');
    setView(values.indexOf(saved) >= 0 ? saved : 'fingering');

    group.addEventListener('change', function (e) {
      setView(e.target.value);
      write('ocarina-view', e.target.value);
      // Normally nothing needs to be redrawn (see above), but the live score (further down this file) is a
      // picture baked for one specific view, so with it showing this change has to reach it.
      if (scoreOn) C.store.notify();
    });
  }

  // Which instrument's fingerings the notes/fingering switch draws under the notes (the same choice as on
  // the fingerings page, js/fingering-page.js: there is only one, kept between the two). Unlike the switch
  // itself this needs a redraw, since it changes which <symbol> each chip's <use> points at.
  function initInstrument() {
    var select = document.getElementById('instrument-input');
    if (!select) return;
    select.replaceChildren.apply(select, C.fingering.INSTRUMENT_ORDER.map(function (id) {
      var option = document.createElement('option');
      option.value = id;
      option.textContent = C.fingering.instrument(id).name;
      return option;
    }));
    select.value = C.fingering.selected();

    select.addEventListener('change', function () {
      C.fingering.select(select.value);
      C.store.notify();
    });
    // Stays in sync with the same picker on the fingerings page (js/fingering-page.js): this element is
    // part of the page shell, so a redraw of the songs/fingerings area does not touch it by itself.
    C.store.subscribe(function () { select.value = C.fingering.selected(); });
  }

  // The "Partitura" switch: not a fourth view, but a check that combines with any of the three. On, the
  // engraved score (js/score-image.js, the same drawing the PNG export uses) is shown above the notes,
  // still drawn with names, fingering diagrams or both underneath, following the very same choice.
  var scoreOn = false;

  function initScore() {
    var checkbox = document.getElementById('score-input');
    if (!checkbox) return;
    scoreOn = read('ocarina-score') === '1';
    checkbox.checked = scoreOn;
    checkbox.addEventListener('change', function () {
      scoreOn = checkbox.checked;
      write('ocarina-score', scoreOn ? '1' : '0');
      C.store.notify();
    });
  }

  // How big the fingering diagrams are in the songs, as a percentage of their normal size. The CSS reads it
  // from --oc-scale; the slider only shows while the diagrams do.
  var SIZE = { min: 60, max: 200, fallback: 100 };

  function initSize() {
    var input = document.getElementById('size-input');
    var output = document.getElementById('size-output');

    function setSize(percent) {
      root.style.setProperty('--oc-scale', String(percent / 100));
      input.value = String(percent);
      output.textContent = percent + '%';
    }

    var saved = Number(read('ocarina-size'));
    setSize(Number.isFinite(saved) && saved >= SIZE.min && saved <= SIZE.max ? saved : SIZE.fallback);

    input.addEventListener('input', function () { setSize(Number(input.value)); });
    input.addEventListener('change', function () { write('ocarina-size', input.value); });
  }

  // How big all the page's text is, as a percentage of its normal size (--text-scale, read by html{}
  // in the CSS). Lives in the "Fuente" menu, next to the typeface itself.
  var FONT_SIZE = { min: 80, max: 150, fallback: 100 };

  // Text size only takes effect once the check button is pressed, not while dragging: the slider itself
  // moves as every element on the page resizes under it, which fights the drag instead of following it.
  function initFontSize() {
    var input = document.getElementById('font-size-input');
    var output = document.getElementById('font-size-output');
    var confirm = document.getElementById('font-size-confirm');

    function preview(percent) {
      input.value = String(percent);
      output.textContent = percent + '%';
    }

    function apply(percent) {
      root.style.setProperty('--text-scale', String(percent / 100));
      write('ocarina-font-size', String(percent));
    }

    var saved = Number(read('ocarina-font-size'));
    var initial = Number.isFinite(saved) && saved >= FONT_SIZE.min && saved <= FONT_SIZE.max ? saved : FONT_SIZE.fallback;
    preview(initial);
    apply(initial);

    input.addEventListener('input', function () { preview(Number(input.value)); });
    confirm.addEventListener('click', function () { apply(Number(input.value)); });
  }

  function init() {
    migrate();
    initView();
    initInstrument();
    initScore();
    initSize();
    initPicker('theme', 'data-theme', 'ocarina-theme', COLORS, 'canela');
    initPicker('font', 'data-font', 'ocarina-font', FONTS, 'clasica');
    initFontSize();
    initMode();
  }

  C.preferences = { init: init, scoreOn: function () { return scoreOn; } };
})(window.Songbook = window.Songbook || {});
