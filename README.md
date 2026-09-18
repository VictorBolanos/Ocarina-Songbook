# Ocarina Songbook

A personal songbook for practising the ocarina. Every song is a list of notes, shown either as note
names or as the fingering diagram of a 12-hole ocarina. The interface is in Spanish.

It is a plain static page: no build step, no dependencies, no server.

## Running it

Open `cancionero-ocarina.html` in **Chrome or Edge**. The songs live as JSON files in the `songs/`
folder, and the page reads and writes them directly through the browser's File System Access API:

1. Click **Conectar carpeta** and pick the `songs/` folder (or the project root that contains it).
2. Create, edit and delete songs from the page; each change is saved to its own `.json` file.
3. The browser remembers the folder. In a later session it may ask for permission again once.

Firefox, Safari and mobile browsers cannot pick a folder this way, so they can open the page but not
load or save songs.

A local server is optional (`python -m http.server`), useful if opening the file directly misbehaves.

## Song files

One file per song in `songs/`:

```json
{
  "id": "zeldas-lullaby",
  "title": "Zelda's Lullaby",
  "meter": "3/4",
  "difficulty": "",
  "origin": "videojuegos",
  "status": "",
  "tags": ["zelda"],
  "order": 3,
  "lines": [
    { "subtitle": "Parte 1", "notes": ["Mi", "Sol", "Re"] },
    { "subtitle": "", "notes": ["Do", "Re", "Mi"] }
  ]
}
```

A note is `Do Re Mi Fa Sol La Si` plus optional suffixes: `#` sharp, and an octave mark, `_` low,
`^` high, `^^` very high (`Fa#^`). Notes without a mark are the middle octave, which is the one with
fingering diagrams so far. Files can be edited by hand; the page picks the changes up when you come
back to the tab.

Difficulty, origin and status take the option keys defined in `js/categories.js`, which is also where
to add new categories or options.

## Project layout

| Path | What it is |
|---|---|
| `cancionero-ocarina.html` | The page shell and the ocarina fingering sprite |
| `css/styles.css` | All the styling: themes, light/dark, glass cards |
| `js/` | Plain scripts sharing one `Cancionero` namespace (no modules, so it works from `file://`) |
| `songs/` | The songs, one JSON per song |
| `src/svg/` | Source icons (SVG) |
| `src/img/` | Ocarina pictures used for the logo and the fingering diagrams |
| `bg/` | Sample background pictures for the **Fondo** menu |
| `tools/build-icons.js` | Turns `src/svg/*.svg` into `js/icons.js` |

## Icons

Icons are inlined so they can take the colour of their button. After adding or changing a file in
`src/svg/`, regenerate them (needs Node):

```
node tools/build-icons.js
```

## Backgrounds

The **Fondo** menu links a folder of pictures (for example `bg/`) and lets you pick one as the page
background, with intensity and blur sliders. The chosen picture is kept in the browser, so it does not
need the folder on the next visit.
