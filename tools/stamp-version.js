// Adds a version to every script and stylesheet address in index.html, e.g. js/store.js?v=3fa9c1d2.
//
// Usage (from the project root):   node tools/stamp-version.js
//
// Why: a site hosted on GitHub Pages lets browsers keep js/ and css/ files for about ten minutes, so a phone
// can run old scripts after you publish. The version is a short fingerprint of each file's content, so it
// only changes when the file does, and the browser then fetches the new one at once. Run it before you
// commit (the page works without it, just with the delay).

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
