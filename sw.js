// The service worker: it lets the page open, and show the songs it has already seen, without a connection
// (at a music stand, with no coverage). It only works when the page is served over https or from localhost,
// not when it is opened straight from disk.
//
// What it does with each request:
//   - the page itself (index.html): the network first, so an update arrives as soon as there is one, and the
//     copy it kept last time when there is no connection;
//   - the scripts, styles and pictures: they carry a version (?v=...) in their address, so the copy kept at
//     install time is always the right one, and it is used without asking the network;
//   - the songs (songs/*.json, the list and the fingerings): the network first, then the last copy.
// The list of files kept at install time and the version are written by `node tools/stamp-version.js`
// between the markers below; do not edit them by hand.

/* BEGIN GENERATED */
const VERSION = '65fd17a2';
const PRECACHE = [
  "./",
  "css/styles.css?v=8f48bf3a",
  "index.html",
  "js/app.js?v=b48c4c60",
  "js/audio-import.js?v=50b1eca6",
  "js/audio.js?v=fca93399",
  "js/background.js?v=1efc275c",
  "js/backup.js?v=002a093d",
  "js/categories.js?v=e4b6179c",
  "js/editor.js?v=f2659d3b",
  "js/export.js?v=bba5ee3e",
  "js/fingering-editor.js?v=07fadadf",
  "js/fingering-page.js?v=284f0e43",
  "js/fingering.js?v=1544949d",
  "js/folder.js?v=bc073a36",
  "js/home.js?v=75d3bbf1",
  "js/i18n.js?v=a4f35975",
  "js/icons.js?v=138fa6bb",
  "js/key-dialog.js?v=051c6c0b",
  "js/keys.js?v=bfc69fc7",
  "js/menus.js?v=81224562",
  "js/metronome.js?v=b88cab87",
  "js/midi-import.js?v=f2ad533b",
  "js/notes.js?v=5ecc671f",
  "js/ocarina-image.js?v=23627725",
  "js/pitch.js?v=86aaca49",
  "js/player.js?v=c0f48d0c",
  "js/preferences.js?v=6ff1febe",
  "js/pwa.js?v=e09ce499",
  "js/render.js?v=1bc6040a",
  "js/router.js?v=cafb81aa",
  "js/score-image.js?v=4e587538",
  "js/store.js?v=a6adb113",
  "js/transpose.js?v=ca121f5f",
  "js/ui.js?v=81b71ef0",
  "manifest.webmanifest",
  "src/img/apple-touch-icon.png",
  "src/img/icon-192.png",
  "src/img/icon-512.png",
  "src/img/icon-maskable-512.png",
  "src/img/ocarina_base.png",
  "src/img/ocarina_title.png",
  "src/svg/spain.png",
  "src/svg/united-kingdom.png"
];
/* END GENERATED */

const SHELL = 'ocarina-shell-' + VERSION;      // replaced by every new version
const DATA = 'ocarina-data';                   // the songs: kept across versions
const WAIT_MS = 4000;                          // how long the network gets before the kept copy is used

// The songs listed in songs/index.json, and the fingerings, kept as well when it is installed: the first visit
// loads the songs before this worker is running, so they would otherwise be kept only from the second one.
// It is best effort: with no songs published (or no connection for them) the page is still installed.
async function keepSongs() {
  try {
    const cache = await caches.open(DATA);
    const listing = await fetch('songs/index.json', { cache: 'no-cache' });
    if (!listing.ok) return;
    await cache.put('songs/index.json', listing.clone());
    const names = ((await listing.json()).songs || []).filter((name) => typeof name === 'string');
    await Promise.all(names.concat(['fingerings.json']).map(async (name) => {
      try {
        const path = 'songs/' + encodeURIComponent(name);
        const response = await fetch(path, { cache: 'no-cache' });
        if (response.ok) await cache.put(path, response);
      } catch (error) { /* that one is kept when it is first opened */ }
    }));
  } catch (error) { /* no songs to keep */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(keepSongs)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ocarina-shell-') && key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function keep(cacheName, request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

// The network first; when it fails or is slow, the last copy (or `fallback`, a key of the kept files).
async function networkFirst(request, cacheName, fallback) {
  try {
    const response = await withTimeout(fetch(request), WAIT_MS);
    return await keep(cacheName, request, response);
  } catch (error) {
    const found = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (found) return found;
    if (fallback) {
      const page = await caches.match(fallback);
      if (page) return page;
    }
    throw error;
  }
}

// A file with a version in its address never changes: the kept copy is used as it is.
async function cacheFirst(request) {
  const found = await caches.match(request);
  if (found) return found;
  const response = await fetch(request);
  return keep(DATA, request, response);
}

// Anything else (the icons, the sample backgrounds): the kept copy now, and a fresh one for next time.
async function staleWhileRevalidate(request) {
  const found = await caches.match(request);
  const fresh = fetch(request).then((response) => keep(DATA, request, response)).catch(() => null);
  return found || (await fresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, 'index.html'));
  } else if (/\/songs\//.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA));
  } else if (url.searchParams.has('v')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
