(function (C) {
  'use strict';

  // The page as an app: it registers the service worker (sw.js), which keeps the page and the songs for use
  // without a connection, offers the browser's "install" as a link in the footer, and says when the connection
  // goes and comes back. The service worker needs https (GitHub Pages) or localhost: opened from disk the page
  // just works as before.
  var tr = C.i18n.t;

  var installPrompt = null;                                // the browser's install offer, kept until the link is pressed

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  // On localhost (while working on the page) the worker stays off unless the address has ?pwa: it would keep
  // serving the scripts it saved and hide the changes being made. A worker left from an earlier ?pwa is removed.
  function registerWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    var local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(location.hostname);
    if (local && !/[?&]pwa/.test(location.search)) {
      navigator.serviceWorker.getRegistrations().then(function (list) {
        list.forEach(function (registration) { registration.unregister(); });
      });
      return;
    }
    function register() {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () { /* the page works without it */ });
    }
    if (document.readyState === 'complete') register();      // after the page's own loading, so it never slows it down
    else window.addEventListener('load', register);
  }

  function installLink() {
    var link = document.getElementById('install-button');
    if (!link) return;
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      installPrompt = event;
      if (!standalone()) link.hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      installPrompt = null;
      link.hidden = true;
      C.ui.toast(tr('Ocarina Songbook se ha instalado.'));
    });
    link.addEventListener('click', function () {
      if (!installPrompt) return;
      var offer = installPrompt;
      installPrompt = null;
      link.hidden = true;
      offer.prompt();
    });
  }

  function connection() {
    window.addEventListener('offline', function () {
      C.ui.toast(tr('Sin conexión: la página sigue funcionando con las canciones que ya tiene guardadas.'), null, 6000);
    });
    window.addEventListener('online', function () {
      C.ui.toast(tr('De nuevo con conexión.'));
    });
  }

  function init() {
    registerWorker();
    installLink();
    connection();
  }

  C.pwa = { init: init };
})(window.Songbook = window.Songbook || {});
