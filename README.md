# Ocarina Songbook

> A personal songbook for practising the 12-hole ocarina: your songs as plain JSON files, shown as
> note names or as fingering diagrams.

Ocarina Songbook is a small, self-contained web page. You keep your songs in a folder on your computer,
browse them from a searchable list, and open any song to read it as note names, as ocarina fingering
diagrams, or both. There is no server, no account and no build step, and nothing leaves your machine.

The interface is in Spanish.

## Features

- **Songs are JSON files**, one per song, in a folder you choose. Edit them in the page or in any
  text editor.
- **Fingering diagrams** for a 12-hole ocarina, with a switch to show note names, diagrams, or both.
- **Song list with search and filters**: search by title, tag, category or line subtitle (accent and
  case insensitive), filter by difficulty, origin, status and tag, and sort the list.
- **Built-in editor**: a note palette covering four octaves plus sharps, line breaks, optional line
  subtitles, undo and redo, and keyboard shortcuts.
- **Categories and tags** for every song: difficulty, origin, status and free-form tags.
- **Themes**: 8 colours, each in light and dark, plus 6 fonts and an optional background picture.
- **Private and offline**: no network requests, no tracking.

## Getting started

1. Open `index.html` in **Chrome or Edge** (double-click it, or serve the folder with any static
   server, for example `python -m http.server`).
2. Click **Conectar carpeta** and pick the `songs/` folder, or the project root that contains it.
3. That is it: the songs load, and every change you make is saved back to its own `.json` file.

The browser remembers the folder, so later visits reconnect automatically. Occasionally it asks for
permission again; click **Reconectar carpeta**.

If the folder is empty, use **Nueva canción** to write your first song.

## Writing songs

### In the page

Open a song and press **Editar** (or use **Editar** on its card in the list). Pick notes from the
palette to add them at the caret, click a note to move the caret after it, and use **Nueva línea** to
break the line; if the caret is in the middle of a line, the notes after it move to the new line.
Every line can have an optional subtitle.

A **new song is only a draft** until you press **Listo**, and it needs a title and at least one note.
Leaving without finishing discards it (after asking, if it already has notes).

| Key | Action |
|---|---|
| `/` | On the song list: jump to the search box |
| `Esc` | Close the editor |
| `Backspace` / `Delete` | Remove the note before / after the caret; at the start of a line, join it with the previous one |
| `←` / `→` | Move the caret |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z` | Redo |

### As files

One file per song in `songs/`; the file name is the song id.

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

| Field | Meaning |
|---|---|
| `id` | Unique, file-name safe; matches the file name |
| `title`, `meter` | Title and optional time signature badge |
| `difficulty`, `origin`, `status` | An option key from `js/categories.js`, or `""` |
| `tags` | Free-form labels (up to 12) |
| `order` | Position in the default ordering of the list |
| `lines` | Lines of notes, each with an optional `subtitle` |

**Notes.** A note is `Do Re Mi Fa Sol La Si`, with optional suffixes: `#` for sharp and an octave
mark: `_` low, `^` high, `^^` very high. So `Re` is a middle-octave Re, `Fa#^` a high Fa sharp. Notes
without a mark are the middle octave, the one that has fingering diagrams so far; the other notes are
shown as coloured name chips in every view.

Files can be edited by hand. Changes are picked up when you come back to the browser tab; unreadable
files are skipped and never overwritten.

## Customising

- **Categories**: add a category, or options to one, in `js/categories.js`. The editor, the list
  filters and the JSON files all follow it.
- **Icons**: put SVGs in `src/svg/` and run `node tools/build-icons.js`. This inlines them into
  `js/icons.js` with their colours replaced by `currentColor`, so they follow the theme.
- **Fingerings**: each note's diagram is an SVG `<symbol>` (`oc-do`, `oc-re`...) at the top of
  `index.html`, made of the base picture plus one circle per covered hole. Add `oc-do-s`, `oc-high-do`
  and so on to give sharps and other octaves their own diagram.
- **Background**: the **Fondo** menu links a folder of pictures (`bg/` has a few) and lets you use one
  as the page background, with intensity and blur sliders. The chosen picture is kept in the browser.

## Browser support

The page opens in any modern browser, but reading and saving songs needs the File System Access API,
so it works in **Chrome and Edge on desktop only**. Firefox, Safari and mobile browsers show the page
without any songs.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The page shell and the fingering sprite |
| `css/styles.css` | Styling: themes, light/dark, glass cards |
| `js/` | Plain scripts sharing one `Songbook` namespace (no modules, so it works from `file://`) |
| `songs/` | The songs, one JSON file each |
| `src/svg/` | Source icons |
| `src/img/` | The logo and the ocarina picture behind the fingering diagrams |
| `bg/` | Sample background pictures |
| `tools/build-icons.js` | Builds `js/icons.js` from `src/svg/` |

The scripts, in load order: `notes` (note model), `icons`, `categories`, `ui`, `menus`, `store` (state,
undo, saving), `router` (`#/` and `#/song/<id>`), `home` (list, search, filters), `render`, `editor`,
`folder` (the songs folder), `background`, `preferences` (theme, font, view), `app`.

## Data and privacy

Songs are only stored in your `songs/` folder. Theme, font, view and background settings live in the
browser's local storage, and the folder handles and the chosen background picture in its IndexedDB.
The page makes no network requests.
