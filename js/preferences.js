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
    });
  }

  function init() {
    migrate();
    initView();
    initPicker('theme', 'data-theme', 'ocarina-theme', COLORS, 'canela');
    initPicker('font', 'data-font', 'ocarina-font', FONTS, 'clasica');
    initMode();
  }

  C.preferences = { init: init };
})(window.Songbook = window.Songbook || {});
