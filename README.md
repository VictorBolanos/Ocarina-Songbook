# Ocarina Songbook

> A personal songbook for practising the 12-hole ocarina: your songs as plain JSON files, shown as
> note names or as fingering diagrams, and played back with a synthesized ocarina.

Ocarina Songbook is a small, self-contained web page. You keep your songs in a folder on your computer,
browse them from a searchable list, and open any song to read it as note names, as ocarina fingering
diagrams, or both, and to hear it. There is no server, no account and no build step, and nothing leaves your machine.

The interface is in Spanish.

## Features

- **Songs are JSON files**, one per song, in a folder you choose. Edit them in the page or in any
  text editor.
- **Fingering diagrams** for a 12-hole ocarina, with a switch to show note names, diagrams, or both.
- **Song list with search and filters**: search by title, tag, category or line subtitle (accent and
  case insensitive), filter by difficulty, origin, status and tag, and sort the list.
- **Playback** with an ocarina-like tone: play, pause and stop, tempo per song, a speed control for
  slow practice, volume, repeat, and the note that is sounding lights up.
- **Note values and rests**: every note can be a sixteenth, eighth, quarter, half or whole note, dotted
  or not, and there are rests.
- **Built-in editor**: a note palette covering four octaves plus the accidentals of the song's key, and rests, line breaks, optional
  line subtitles, undo and redo, and keyboard shortcuts.
- **Categories and tags** for every song: difficulty, origin, status and free-form tags.
- **Themes**: 8 colours, each in light and dark, plus 6 fonts and an optional background picture.
- **Private and offline**: no network requests, no tracking.

## Getting started

1. Open `index.html` in **Chrome or Edge** (double-click it, or serve the folder with any static
   server, for example `python -m http.server`).
2. Click **Conectar carpeta** and pick the `songs/` folder, or the project root that contains it.
3. That is it: the songs load, and each song you finish editing (**Listo**) is saved back to its own `.json` file.

The browser remembers the folder, so later visits reconnect automatically. Occasionally it asks for
permission again; click **Reconectar carpeta**.

If the folder is empty, use **Nueva canción** to write your first song.

## Writing songs

### In the page

Open a song and press **Editar** (or use **Editar** on its card in the list). Pick notes from the
palette to add them at the caret, click a note to move the caret after it, and use **Nueva línea** to
break the line; if the caret is in the middle of a line, the notes after it move to the new line.
Every line can have an optional subtitle.

There are two kinds of line. **Nueva línea** breaks the text for easier reading and adds no time. **Espera**
adds a wait line: a bar that stands for a number of beats of silence, which you set in the line itself.

Each note has a **duration**. The Duración row in the palette shows the value of the selected note (the
one just before the caret) and changes it; new notes take the value shown. Use **Puntillo** to lengthen
a note by half, and the **Silencio** button for a rest. The song's **Tempo (BPM)** is set next to its
title.

### Key signature

When you create a song you first choose which accidentals it uses: **none, flats or sharps**. The editor
opens right away.

- The palette's **Alteraciones** row offers the seven flats (Si♭ Mi♭ La♭ Re♭ Sol♭ Do♭ Fa♭) or the seven
  sharps (Fa♯ Do♯ Sol♯ Re♯ La♯ Mi♯ Si♯), in the middle octave. With none, the row is empty.
- The **key is worked out from the accidentals you have used** (the order they were placed in, the octave
  and the duration don't matter) and updates as you write, next to the title, in the editor and on the
  song's card:
  - The furthest accidental in the signature order decides the pair of keys: with Si♭ and Mi♭ it is
    `Si♭ mayor / Sol menor`.
  - If one before it is missing, the key is incomplete and is marked `(personalizado)`: Do♯, Sol♯ and Mi♯
    give `Fa♯ mayor / Re♯ menor (personalizado)`, because Fa♯, Re♯ and La♯ are not there.
  - With no accidental used yet, it is `Do mayor / La menor`, whichever kind you chose.
  - The **last note** decides between the major and the minor key (rests don't count): ending on the major
    tonic gives the major key, on the minor tonic the minor one, otherwise both names are shown.
- **Tonalidad** in the editor changes the kind again. Going between flats and sharps, the notes already
  written are replaced by the same sound spelled the other way (Do♯ → Re♭, Mi♯ → Fa, Si♯ → Do, Do♭ → Si...),
  so the song sounds exactly the same. Going to none leaves the notes as they are.
- Notes are always stored with their accidental written out (`Sib`, `Fa#`), so the choice never changes how
  a note sounds.

**Nothing is written to the folder until you press Listo.** While editing you work on a copy of the song
(a new song, or a saved one); **Listo** saves it, and it needs a title and at least one note. **Cancelar**
or `Esc` close the editor without saving, and so does leaving the page, always asking first if there are
changes to lose.

| Key | Action |
|---|---|
| `/` | On the song list: jump to the search box |
| `Esc` | Close the editor |
| `Space` | On a song page (not editing): play / pause |
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
  "bpm": 96,
  "signature": "none",
  "difficulty": "",
  "origin": "videojuegos",
  "status": "",
  "tags": ["zelda"],
  "order": 3,
  "lines": [
    { "subtitle": "Parte 1", "notes": ["Mi:h", "Sol", "Re:h."] },
    { "subtitle": "", "notes": ["Do", "Re", "Mi:h"] },
    { "subtitle": "", "notes": [], "wait": 4 }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Unique, file-name safe; matches the file name |
| `title`, `meter` | Title and optional time signature badge |
| `bpm` | Tempo in quarter notes per minute, 30 to 240 (100 if missing) |
| `signature` | Accidentals the song uses: `"none"`, `"flat"` or `"sharp"` (the key is worked out from the notes). Older files with a number still load |
| `difficulty`, `origin`, `status` | An option key from `js/categories.js`, or `""` |
| `tags` | Free-form labels (up to 12) |
| `order` | Position in the default ordering of the list |
| `lines` | Lines, each with an optional `subtitle`: a line of `notes`, or a wait line with `"wait": <beats>` and no notes |

**Notes.** A note is `Do Re Mi Fa Sol La Si`, with optional suffixes: `#` for sharp or `b` for flat, and an
octave mark: `_` low, `^` high, `^^` very high. So `Re` is a middle-octave Re, `Fa#^` a high Fa sharp and
`Sib` a Si flat. Notes
without a mark are the middle octave, the one that has fingering diagrams so far; the other notes are
shown as coloured name chips in every view.

**Durations.** After the pitch, `:` and a value: `w` whole, `h` half, `q` quarter (the default, so it is
omitted), `e` eighth, `s` sixteenth; add `.` to dot it. `Re:h` is a half note, `Fa#^:e.` a dotted eighth.
`R` is a rest and takes durations too: `R:h`. In beats (quarter = 1) these are 4, 2, 1, 1/2 and 1/4, and
1.5 times that when dotted.

Files can be edited by hand. Changes are picked up when you come back to the browser tab; unreadable
files are skipped and never overwritten.

## How it sounds

Playback is synthesized in the browser with the Web Audio API, so there is nothing to download. An
ocarina is a Helmholtz resonator: its tone is very close to a pure sine wave with only weak overtones. The
voice in `js/audio.js` is a near-sine wave table with a little breath noise, a soft attack, a slight pitch
scoop into each note, a gentle vibrato on held notes, and a touch of room reverb. Every knob is in the
`TIMBRE` object at the top of that file.

Pitches assume the usual 12-hole alto C ocarina: `Do` (all ten finger holes closed, both small holes open)
is C5, so the middle octave is C5 to B5, `_` notes go down to La4 and Si4, and `^` notes up to Fa6. `^^` is
two octaves up. To change the mapping, edit `OCTAVES` in `js/notes.js`.

Lines of notes are only there to make the song easy to read: playback flows straight from the last note
of one line into the first of the next. To insert silence, put a **Silencio** (rest) in the song. **Velocidad** slows the
song down (or speeds it up) without changing its saved tempo, and clicking any note on the page plays from
it.

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

The scripts, in load order: `notes` (note model, pitches, durations), `keys` (key signatures), `icons`, `categories`, `ui`, `menus`,
`store` (state, undo, saving), `router` (`#/` and `#/song/<id>`), `home` (list, search, filters),
`key-dialog` (the key picker), `audio` (the ocarina voice and the scheduler), `player` (the play bar), `render`, `editor`, `folder` (the songs folder),
`background`, `preferences` (theme, font, view), `app`.

## Data and privacy

Songs are only stored in your `songs/` folder. Theme, font, view and background settings live in the
browser's local storage, and the folder handles and the chosen background picture in its IndexedDB.
The page makes no network requests. Volume, speed and repeat are remembered in local storage too.
