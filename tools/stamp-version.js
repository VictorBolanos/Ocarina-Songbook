// Adds a version to every script and stylesheet address in index.html, e.g. js/store.js?v=3fa9c1d2.
//
// Usage (from the project root):   node tools/stamp-version.js
//
// Why: a site hosted on GitHub Pages lets browsers keep js/ and css/ files for about ten minutes, so a phone
// can run old scripts after you publish. The version is a short fingerprint of each file's content, so it
// only changes when the file does, and the browser then fetches the new one at once. Run it before you
// commit (the page works without it, just with the delay).
//
// It also writes the list of files, and the version, that the service worker (sw.js) keeps at install time so
// the page opens without a connection. A new version makes the browser install the worker again and replace
// its copies.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const indexFile = path.join(root, 'index.html');

const fingerprint = (relative) =>
  crypto.createHash('md5').update(fs.readFileSync(path.join(root, relative))).digest('hex').slice(0, 8);

let changed = 0;
const html = fs.readFileSync(indexFile, 'utf8').replace(
  /((?:src|href)="((?:js|css)\/[^"?]+))(?:\?v=[0-9a-f]+)?"/g,
  (all, head, relative) => {
    const next = head + '?v=' + fingerprint(relative) + '"';
    if (next !== all) changed++;
    return next;
  }
);

fs.writeFileSync(indexFile, html);
console.log('index.html: ' + changed + ' address(es) updated');

// ---- The service worker ---------------------------------------------------------------------------------------
// Every local file the page needs: the ones named in index.html, the icons of the manifest and the pictures the
// scripts choose by name (the flag of the language button).
const files = new Set(['index.html', 'manifest.webmanifest']);
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(?:[a-z]+:|\/\/)/i.test(match[1])) files.add(match[1]);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
(manifest.icons || []).forEach((icon) => files.add(icon.src));
for (const name of fs.readdirSync(path.join(root, 'js'))) {
  const text = fs.readFileSync(path.join(root, 'js', name), 'utf8');
  for (const match of text.matchAll(/src\/(?:svg|img)\/[\w.-]+\.(?:png|jpe?g|webp)/g)) files.add(match[0]);
}

const precache = ['./'].concat([...files].sort());
const version = crypto.createHash('md5');
for (const address of precache) {
  const file = path.join(root, address.split('?')[0]);
  if (address !== './' && fs.existsSync(file)) version.update(address + fs.readFileSync(file));
}
const workerFile = path.join(root, 'sw.js');
const generated = [
  '/* BEGIN GENERATED */',
  "const VERSION = '" + version.digest('hex').slice(0, 8) + "';",
  'const PRECACHE = ' + JSON.stringify(precache, null, 2) + ';',
  '/* END GENERATED */'
].join('\n');
const worker = fs.readFileSync(workerFile, 'utf8').replace(
  /\/\* BEGIN GENERATED \*\/[\s\S]*?\/\* END GENERATED \*\//,
  () => generated
);
fs.writeFileSync(workerFile, worker);
console.log('sw.js: ' + precache.length + ' file(s) kept for offline use');
