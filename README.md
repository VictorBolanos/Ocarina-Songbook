<div align="center">

<img src="src/img/ocarina_title.png" alt="Ocarina Songbook" width="180">

# Ocarina Songbook

**🎶 A personal songbook for practising the 12-hole ocarina**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Ocarina_Songbook-b45309?style=for-the-badge)](https://victorbolanos.github.io/Ocarina-Songbook)
[![GitHub Stars](https://img.shields.io/github/stars/VictorBolanos/Ocarina-Songbook?style=for-the-badge&color=eab308)](https://github.com/VictorBolanos/Ocarina-Songbook/stargazers)

**Your songs as plain JSON files, shown as note names or fingering diagrams, played back with a synthesized ocarina — no server, no account, no build step**

[Features](#-features) • [Demo](#-demo) • [Technologies](#-technologies) • [Installation](#-installation) • [User Guide](#-user-guide)

Live application: https://victorbolanos.github.io/Ocarina-Songbook

</div>

---

## 📖 Overview

Ocarina Songbook is a small, self-contained web page for learning and practising songs on the 12-hole ocarina. You keep your songs in a folder on your computer, browse them from a searchable list, and open any song to read it as note names, as fingering diagrams, or both — and to hear it. It also comes with a step-by-step song editor, a metronome, a fingering editor and export to MIDI, WAV and MP4.

The interface comes in **Spanish and English**: the flag button in the top bar (next to the folder name) switches it (in English the notes are shown as `C D E F G A B`).

### 🎯 Why Ocarina Songbook?

- ✅ **Your songs are yours** - One human-readable `.json` file per song, in a folder you choose
- ✅ **Zero setup** - Plain HTML, CSS and JavaScript: no server, no dependencies, no build step
- ✅ **Private** - Nothing is uploaded anywhere and there is no tracking
- ✅ **Made for the ocarina** - Fingering diagrams, an ocarina-like synthesized voice, key signatures
- ✅ **Works on your phone** - Publish it on GitHub Pages and read your songs anywhere
- ✅ **Two languages** - Spanish and English, with a one-click switch
- ✅ **Free & Open Source** - No paywalls, no ads

---

## ✨ Features

### 🎼 **Song Library**
> **Status:** ✅ **FULLY IMPLEMENTED**

A searchable list of your songs, with categories and tags.

**Key Features:**
- 🔎 **Search** - By title, tag, category, key or line subtitle (accent and case insensitive)
- 🏷️ **Categories & tags** - Difficulty, origin, status and free-form tags, with filters and sorting
- 🎹 **Key on every card** - The key of each song, worked out from its notes
- 📂 **Songs are files** - Edit them in the page or in any text editor; changes are picked up when you come back to the tab

---

### ✍️ **Song Editor**
> **Status:** ✅ **FULLY IMPLEMENTED**

Write songs with a note palette or straight from the keyboard.

**Key Features:**
- 🎹 **Note palette** - Three octaves, the accidentals of the song's key, and rests
- ⏱️ **Note values** - Sixteenth to whole notes, dotted or not, with a tempo (BPM) per song
- ⌨️ **Keyboard entry** - `1`–`7` for the notes, `0` for a rest, `+`/`-` for sharps and flats, arrows for octaves
- 🧩 **Lines** - Optional subtitles, duplicate, reorder with buttons, keyboard or drag and drop
- ♻️ **Duplicate a song** - Open a copy to write a variant of it
- ↩️ **Undo & redo** - And nothing touches your folder until you press **Done**

**How it works:**
1. Press **New song** and choose the accidentals: none, flats or sharps
2. Add notes from the palette or with the keyboard
3. The key of the song updates as you write
4. Press **Done** to save it as a `.json` file (or `Esc` to discard)

---

### 🔊 **Playback**
> **Status:** ✅ **FULLY IMPLEMENTED**

An ocarina-like voice synthesized in the browser — nothing to download.

**Key Features:**
- ▶️ **Play, pause, stop** - The note that is sounding lights up
- 🎯 **Play from any note** - Click a note (or select it in the editor and press play)
- 🔁 **Repeat & stretch** - Loop the whole song, or just a stretch you mark
- 🐢 **Speed** - Slow the song down for practice without changing its saved tempo
- 🥁 **Count-in** - A bar of clicks before the song starts
- 📤 **Export** - MIDI, WAV or MP4

---

### 🎚️ **Metronome**
> **Status:** ✅ **FULLY IMPLEMENTED**

A metronome in the top bar that keeps ticking while you read.

**Key Features:**
- 🎵 **Tempo** - Arrows, slider, typing, or tap it in; one click to use the song's tempo
- 🔢 **Beats per bar** - The first beat is accented
- ➗ **Subdivisions** - Quarters, eighths, triplets or sixteenths
- ⏯️ **Quick play/stop** - A small button next to it, without opening the window

---

### 🖐️ **Fingerings**
> **Status:** ✅ **FULLY IMPLEMENTED**

Fingering diagrams for the 12-hole ocarina, and a tool to draw the ones that are missing.

**Key Features:**
- 👁️ **Three views** - Note names, fingering diagrams, or both
- 📋 **Fingerings page** - Every note (three octaves, naturals, sharps and flats) with its diagram and whether it is finished
- 🖱️ **Fingering editor** - Pick a note and click the holes that are covered
- ✅ **Finished switch** - Until a fingering is marked as finished, songs keep showing that note by its name

---

### 🎵 **Key Signatures**
> **Status:** ✅ **FULLY IMPLEMENTED**

The key is worked out from the accidentals you actually use.

**Key Features:**
- ♭♯ **Flats, sharps or none** - The palette only offers the accidentals of the kind you chose
- 🎼 **Live key name** - `B♭ major / G minor`, or `F♯ major / D♯ minor (custom)` when the key is incomplete
- 🔄 **Switch kind** - Flats become sharps (C♯ → D♭, E♯ → F...) and the song sounds exactly the same

---

### 🌍 **Languages**
> **Status:** ✅ **FULLY IMPLEMENTED**

The whole page in Spanish or English.

**Key Features:**
- 🏳️ **One-click switch** - The flag button in the top bar, next to the folder name; your choice is remembered
- 🔤 **Note names** - Do Re Mi… in Spanish, C D E… in English (your song files never change)
- 🧭 **Automatic default** - The first visit follows the browser's language
- 🎵 **Song content stays as written** - Titles, subtitles and tags are never translated

---

### 💾 **Backup & Publishing**
> **Status:** ✅ **FULLY IMPLEMENTED**

**Key Features:**
- 📦 **Backup file** - Every song and fingering in one `.json`, and import it back
- 📱 **Read-only on the web** - Publish the folder with GitHub Pages and read your songs on your phone
- 🪟 **Several tabs** - Tabs stay in sync, and a song you are editing is never replaced under you

---

## 🌐 Demo

**Live Application:** [https://victorbolanos.github.io/Ocarina-Songbook](https://victorbolanos.github.io/Ocarina-Songbook)

Opened on the web, the page shows the published songs read-only. To create and edit songs, run it in Chrome or Edge on a computer and connect your `songs/` folder (see [Installation](#-installation)).

### 🎨 Customization Options

- 🌙 **Light/Dark mode** - Combines with every color
- 🌍 **Language** - Spanish or English
- 🎨 **Color themes** - 8 colors: Neutral, Red, Yellow, Green, Cinnamon, Purple, Pink and Blue
- 🔤 **Fonts** - 6 typefaces, from classic to monospaced
- 🖼️ **Background** - A flat color or a picture from a folder you link (`bg/` has samples), with intensity and blur

---

## 💡 Technologies

### **Frontend Stack**
- ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) **HTML5** - Semantic markup and native `<dialog>`
- ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) **CSS3** - Custom properties for the light/dark themes
- ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) **Vanilla JavaScript** - Classic scripts sharing one `Songbook` namespace, so it even opens from `file://`

### **Browser APIs**
- 🔊 **Web Audio API** - The ocarina voice, the scheduler, the metronome and the offline rendering
- 📁 **File System Access API** - Reads and writes your songs folder (Chrome and Edge)
- 🎞️ **WebCodecs** - AAC encoding for MP4 export
- 🗄️ **IndexedDB** - Remembers the folder handle and the background picture
- 📡 **BroadcastChannel** - Keeps several tabs in sync

### **Hosting**
- ![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=flat-square&logo=github&logoColor=white) **GitHub Pages** - Static hosting for the read-only version

### **Architecture**
- 📦 **No dependencies** - No framework, no bundler, no `node_modules`
- 📄 **Songs as files** - The songs folder is the only place songs are stored
- 🎨 **Single source of truth** - The page is redrawn from one state object
- ☁️ **Zero network use** - The page only reads `songs/` when it is hosted

---

## 🚀 Installation

### **Option 1: Use Online (read-only)**
Visit [https://victorbolanos.github.io/Ocarina-Songbook](https://victorbolanos.github.io/Ocarina-Songbook)

### **Option 2: Run Locally (read and edit)**

```bash
# Clone the repository
git clone https://github.com/VictorBolanos/Ocarina-Songbook.git

# Navigate to the project directory
cd Ocarina-Songbook

# Open index.html in Chrome or Edge (double-click it), or serve the folder:
python -m http.server 8000
# Visit: http://localhost:8000
```

Then click **Connect folder** and pick the `songs/` folder (or the project root that contains it). The browser remembers it; occasionally it asks for permission again — click **Reconnect folder**.

> Opened straight from disk (`file://`) the page can only read songs after you connect the folder. Served over `http(s)`, it also shows the published songs read-only when no folder is connected.

---

## 📚 User Guide

### **Writing songs**

```
1. Press "New song" and choose none, flats or sharps
2. Set the title, tempo (BPM) and optional time signature
3. Pick notes from the palette, or type them (see the shortcuts below)
4. Use "New line" to break the text; add optional line subtitles
5. Press "Done" to save; "Cancel" or Esc to discard
```

Every note has a **duration**: the *Duration* row shows the value of the selected note (the one before the caret) and changes it; new notes take the value shown. *Dot* lengthens a note by half, and *Rest* adds a rest.

**Duplicate** (on a song's page and on its card) opens a copy called “Title (variant)” in the editor. Like any new song, it is only saved when you press **Done**.

### **Keyboard shortcuts in the editor**

Hover the **i** next to the palette's title to see them in the page.

| Key | Action |
|---|---|
| `1` – `7` | The notes C D E F G A B (Do Re Mi Fa Sol La Si), in the octave of the previous note |
| `0` | Rest |
| `+` or `#` / `-` or `b` | Sharp / flat on the previous note (only the kind the song uses) |
| `↑` / `↓` | Raise / lower the previous note an octave |
| `s` `e` `q` `h` `w`, `.` | Duration (sixteenth, eighth, quarter, half, whole) and dot |
| `←` / `→`, `Home` / `End` | Move the caret (and choose the note that **Play** starts from) |
| `Backspace` / `Delete` | Remove the note before / after the caret; at the start of a line, join it with the previous one |
| `Enter` | New line |
| `Alt + ↑` / `Alt + ↓`, `Alt + Shift + ↓` | Move the line / duplicate it |
| `Ctrl/Cmd + Z`, `Ctrl/Cmd + Y` | Undo, redo |
| `Ctrl/Cmd + Enter` | Done (save) |
| `Esc` | Cancel and discard the changes |
| `/` | On the song list: jump to the search box |
| `Space` | On a song page (not editing): play / pause |

### **Key signature**

When you create a song you first choose which accidentals it uses: **none, flats or sharps**.

- The palette's **Accidentals** row offers the seven flats (B♭ E♭ A♭ D♭ G♭ C♭ F♭) or the seven sharps (F♯ C♯ G♯ D♯ A♯ E♯ B♯), in the middle octave.
- The **key is worked out from the accidentals you have used** (order, octave and duration don't matter):
  - The furthest accidental in the signature order decides the pair of keys: with B♭ and E♭ it is `B♭ major / G minor`.
  - If one before it is missing, the key is incomplete and is marked `(custom)`.
  - With no accidental used yet, it is `C major / A minor`.
  - The **last note** decides between the major and the minor key (rests don't count).
- **Key** in the editor changes the kind. Between flats and sharps the written notes are replaced by the same sound spelled the other way, so the song sounds exactly the same.

### **Playback & practice**

- **Play from a note** - Click any note on the page; in the editor, click a note (or move onto it with the arrows) and press Play. Editing while it plays stops the music.
- **Speed** - Slows the song down (or speeds it up) without changing its saved tempo.
- **Section** - Press it, then click the first and the last note; Play repeats just that section.
- **Count-in** - A bar of clicks (the top number of an x/4 time signature, otherwise 4) before the song starts.
- **Export** - Choose a format:
  - **MIDI** (`.mid`) - Notes, tempo, time signature and key on the Ocarina instrument, for score editors and music programs.
  - **WAV** (`.wav`) - Mono 16-bit 22.05 kHz audio, about 2.6 MB a minute.
  - **MP4** (`.mp4`) - The same audio compressed with AAC, about 0.7 MB a minute. Needs a browser with the WebCodecs AAC encoder (current Chrome and Edge).
- **Metronome** - Set the tempo with the arrows, the slider or by typing, or tap it. Choose the beats per bar and a subdivision. It keeps ticking after you close the window.

### **Fingerings**

The middle-octave notes come with their fingering diagram. Any other note (other octaves, sharps and flats) shows as a name chip until it has one.

The **Fingerings** button in the top bar opens the fingerings page: every note with its diagram and whether it is finished, with a filter for the finished or the pending ones. With the songs folder connected each note has an **Edit** button that opens the fingering editor on it:

1. Pick the **octave**, the **note** and the **accidental**.
2. The ocarina shows the fingering that note has now (all holes open if it has none).
3. Click a hole to cover or uncover it (holes are numbered right to left, 1 to 12).
4. **Uncover all** opens every hole, **Copy from…** starts from another note's fingering, and **Remove fingering** removes yours.
5. The **Fingering completed** switch says whether it is finished; until it is on, songs show that note by its name.
6. **Done** saves, **Cancel** or `Esc` discards.

### **Backup**

At the bottom of the page, **Export backup** saves every song and fingering in one `.json` file, and **Import backup** (with the folder connected) adds a backup's songs to yours. A song already there as it is gets skipped, one with the same id but different content is added under another name, and the backup's fingerings replace those of the same notes. Nothing you have is deleted.

### **Publishing the songs on the web**

Without a connected folder the page can still show the songs that sit next to it, read-only. That is what happens on a phone once the project is hosted, for example with GitHub Pages:

```
0. node tools/stamp-version.js        (before you commit; see below)
1. Edit and save songs on your computer as usual
   (every save also updates songs/index.json, the list a web page needs)
2. Commit and push songs/ (with index.json), and GitHub Pages serves them
3. Open the page on the phone: the toolbar says "Read-only"
```

With GitHub Pages: in the repository, *Settings → Pages → Deploy from a branch → `main` / root*. `tools/stamp-version.js` adds a fingerprint to the script and style addresses in `index.html`, so a phone loads new files at once instead of after GitHub Pages' ten minutes of cache.

---

## 🗂️ Song Files

One file per song in `songs/`; the file name is the song id.

```json
{
  "id": "zeldas-lullaby",
  "title": "Zelda's Lullaby",
  "meter": "3/4",
  "bpm": 96,
  "signature": "none",
  "difficulty": "",
  "origin": "",
  "status": "",
  "tags": ["zelda"],
  "lines": [
    { "subtitle": "Part 1", "notes": ["Mi:h", "Sol", "Re:h."] },
    { "subtitle": "", "notes": ["Do", "Re", "Mi:h", "R:h"] }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Unique, file-name safe; matches the file name |
| `title`, `meter` | Title and optional time signature badge |
| `bpm` | Tempo in quarter notes per minute, 30 to 240 (100 if missing) |
| `signature` | Accidentals the song uses: `"none"`, `"flat"` or `"sharp"` (the key is worked out from the notes) |
| `difficulty`, `origin`, `status` | An option key from `js/categories.js`, or `""` |
| `tags` | Free-form labels (up to 12) |
| `lines` | Lines, each with an optional `subtitle` and its `notes` |

**Notes.** Files store notes with the solfège names `Do Re Mi Fa Sol La Si` (C D E F G A B), whatever the language of the page, with optional suffixes: `#` for sharp or `b` for flat, and an octave mark: `_` low, `^` high (`^^`, very high, still plays and shows if an old song uses it). So `Re` is a middle-octave Re, `Fa#^` a high Fa sharp and `Sib` a Si flat.

**Durations.** After the pitch, `:` and a value: `w` whole, `h` half, `q` quarter (the default, so it is omitted), `e` eighth, `s` sixteenth; add `.` to dot it. `Re:h` is a half note, `Fa#^:e.` a dotted eighth. `R` is a rest and takes durations too: `R:h`.

Files can be edited by hand. Changes are picked up when you come back to the browser tab; unreadable files are skipped and never overwritten. Notes that are not valid (a typo like `Xx`) are left out of the page, and the page tells you which song has them, because they would be lost the next time that song is saved.

**Other files in `songs/`**: `index.json` (the list of song files, kept up to date by the page) and `fingerings.json` (the fingerings you draw, one note per line):

```json
{
  "fingerings": {
    "Sol#^": { "holes": [7, 10, 11], "done": true },
    "Do^": { "holes": [1, 2, 3, 4, 5, 7, 8, 10, 11], "done": false }
  }
}
```

The key is the note without a duration, `holes` are the covered holes and `done` says whether the fingering is finished.

### **Several windows, several tabs**

Two tabs of the page (or a hand edit) can touch the same folder. When one tab saves, the others read the folder again. A song you have open in the editor is never replaced under you: you get a warning if its file changes, and pressing **Done** asks before overwriting a file that changed since you opened the song.

---

## 🏗️ Project Structure

```
Ocarina-Songbook/
├── 📁 css/
│   └── styles.css            # Themes, light/dark, glass cards
├── 📁 js/                    # Plain scripts sharing one Songbook namespace
│   ├── i18n.js               # Spanish / English: dictionary, note names, language switch
│   ├── notes.js              # Note model, pitches, durations
│   ├── keys.js               # Key signatures
│   ├── fingering.js          # Fingering diagrams (built-in + yours)
│   ├── icons.js              # Generated from src/svg (see tools/)
│   ├── categories.js         # Difficulty, origin, status
│   ├── ui.js, menus.js       # DOM helper, toast, dialogs, menus
│   ├── store.js              # State, undo, saving
│   ├── router.js             # #/, #/song/<id>, #/digitaciones
│   ├── home.js               # Song list, search, filters
│   ├── key-dialog.js         # Flats / sharps / none picker
│   ├── metronome.js          # The metronome
│   ├── audio.js              # The ocarina voice and the scheduler
│   ├── export.js             # MIDI, WAV and MP4 export
│   ├── player.js             # The play bar
│   ├── render.js             # Song pages and the editor view
│   ├── editor.js             # Editing logic and keyboard
│   ├── folder.js             # The songs folder (read, write, sync)
│   ├── background.js         # Page background picker
│   ├── preferences.js        # Theme, font, view
│   ├── fingering-editor.js   # The fingering editor
│   ├── fingering-page.js     # The page of all fingerings
│   ├── backup.js             # Backup export / import
│   └── app.js                # Start-up
├── 📁 songs/                 # Your songs: one JSON file each
│   ├── index.json            # The list of songs (kept up to date)
│   └── fingerings.json      # The fingerings you draw
├── 📁 src/
│   ├── img/                  # Logo and the ocarina picture
│   └── svg/                  # Source icons
├── 📁 bg/                    # Sample background pictures
├── 📁 tools/
│   ├── build-icons.js        # src/svg → js/icons.js
│   └── stamp-version.js      # Cache-busting fingerprints in index.html
├── index.html                # The page shell
└── README.md                 # This file
```

### **Customising**

- **Languages** - Every text is written in Spanish in the code and in `index.html`. The English versions are in the `EN` dictionary at the top of `js/i18n.js`, keyed by the Spanish text; a text that is missing there just stays in Spanish. Text with a variable part (a title, a number) is written as `t('… {name} …', { name })` so the variable is never translated. Anything inside an element marked `translate="no"` is left alone.
- **Categories** - Add a category, or options to one, in `js/categories.js`. The editor, the list filters and the JSON files all follow it.
- **Icons** - Put SVGs in `src/svg/` and run `node tools/build-icons.js`, then `node tools/stamp-version.js`. Each icon is inlined with its colours replaced by `currentColor`, so it follows the theme.
- **Ocarina pitches** - The page assumes the usual 12-hole alto C ocarina: `Do` (all ten finger holes closed, both small holes open) is C5, the middle octave is C5 to B5, `_` notes go down to A4 and B4, and `^` notes up to F6. To change the mapping, edit `OCTAVES` in `js/notes.js`.
- **The voice** - An ocarina is a Helmholtz resonator: its tone is very close to a pure sine wave. The voice in `js/audio.js` is a near-sine wave table with a little breath noise, a soft attack, a slight pitch scoop, a gentle vibrato and a touch of room reverb. Every knob is in the `TIMBRE` object at the top of that file.

---

## 🔥 Key Highlights

### **🔒 Private by design**
- Songs only live in your `songs/` folder
- Theme, font and audio settings stay in the browser's local storage
- The only network requests are the ones that read `songs/` when the page is hosted

### **🛡️ Safe with your data**
- Nothing is written until you press **Done**
- A file added or changed by hand while you edit is never overwritten silently
- A damaged `fingerings.json` is kept as `fingerings.json.bak` before it is replaced

### **⚡ Light and fast**
- No dependencies, no build step
- Audio is scheduled ahead of time on the audio clock, so playback stays steady
- Exports are rendered in the browser, faster than real time

### **🌍 Browser support**
- Editing needs the File System Access API: **Chrome and Edge on desktop**
- Any modern browser, phones included, can read the published songs
- MP4 export needs the WebCodecs AAC encoder (current Chrome and Edge)

---

## 📊 Feature Status

| Feature | Status | Description |
|---------|--------|-------------|
| 🎼 Song library | ✅ **Complete** | Search, filters, categories and tags |
| ✍️ Song editor | ✅ **Complete** | Palette, keyboard entry, lines, undo, variants |
| 🔊 Playback | ✅ **Complete** | Ocarina voice, speed, stretch, count-in |
| 📤 Export | ✅ **Complete** | MIDI, WAV and MP4 |
| 🎚️ Metronome | ✅ **Complete** | Tempo, tap, beats, subdivisions |
| 🖐️ Fingerings | ✅ **Complete** | Diagrams page and editor |
| 🎵 Key signatures | ✅ **Complete** | Flats, sharps, live key name |
| 💾 Backup | ✅ **Complete** | Export and import everything |
| 🌍 Languages | ✅ **Complete** | Spanish and English |
| 📱 Read-only web version | ✅ **Complete** | GitHub Pages, phone friendly |
| 📲 Installable / offline (PWA) | 📋 **Planned** | Use the page without a connection |
| 🎤 Play-along with the microphone | 📋 **Planned** | Check the notes you play |

---

## 👤 Author

**Victor Bolaños**

- GitHub: [@VictorBolanos](https://github.com/VictorBolanos)
- Project: [Ocarina Songbook](https://github.com/VictorBolanos/Ocarina-Songbook)

---

## 🙏 Acknowledgments

- **[SVG Repo](https://www.svgrepo.com)** - For the icons used in the interface
- **The Web platform** - Web Audio, File System Access and WebCodecs make a page like this possible without a single dependency
- **Ocarina players everywhere** - For the inspiration

---

## 🔖 Version

**Current Version:** 1.0.0  
**Last Updated:** September 19, 2026

---

<div align="center">

**Made with ❤️ for ocarina players**

**Happy playing! 🎶**

</div>
