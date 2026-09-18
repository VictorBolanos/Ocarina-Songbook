(function (C) {
  'use strict';

  // ---- DOM helper -------------------------------------------------------------------------------
  // h('div', { class: 'x', onclick: fn, 'data-key': 'k' }, 'text', childNode, [more children])
  // Text always goes in as text nodes, never as HTML, so song titles can't inject markup.
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'value') el.value = value;
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else el.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  // ---- Toast ------------------------------------------------------------------------------------
  var toastTimer = null;

  function hideToast() {
    document.getElementById('toast').hidden = true;
  }

  // toast('Saved') or toast('Deleted', { label: 'Deshacer', run: fn })
  function toast(message, action) {
    var box = document.getElementById('toast');
    box.textContent = '';
    box.appendChild(h('span', null, message));
    if (action) {
      box.appendChild(h('button', {
        type: 'button',
        onclick: function () { hideToast(); action.run(); }
      }, C.icons.create('undo'), action.label));
    }
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 8000 : 4000);
  }

  // ---- Confirmation dialog ----------------------------------------------------------------------
  // confirm({ title, text, ok, danger }) -> Promise<boolean>
  // The promise settles from the click itself instead of waiting for the dialog's "close" event,
  // which browsers may deliver late.
  function confirm(options) {
    var dialog = document.getElementById('confirm-dialog');
    if (typeof dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(options.title + '\n\n' + options.text));
    }
    var ok = dialog.querySelector('[value="ok"]');
    var cancel = dialog.querySelector('[value="cancel"]');
    dialog.querySelector('[data-role="title"]').textContent = options.title;
    dialog.querySelector('[data-role="text"]').textContent = options.text;
    ok.textContent = options.ok || 'Aceptar';
    ok.classList.toggle('btn--danger', !!options.danger);
    ok.classList.toggle('btn--primary', !options.danger);

    return new Promise(function (resolve) {
      function finish(result) {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onCancel);       // Escape
        dialog.removeEventListener('click', onBackdrop);
        if (dialog.open) dialog.close();
        resolve(result);
      }
      function onOk() { finish(true); }
      function onCancel() { finish(false); }
      function onBackdrop(e) { if (e.target === dialog) finish(false); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('click', onBackdrop);
      dialog.showModal();
    });
  }

  C.ui = { h: h, toast: toast, confirm: confirm };
})(window.Songbook = window.Songbook || {});
