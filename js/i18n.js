(function (C) {
  'use strict';

  // Languages: Spanish (the language the page is written in) and English.
  //
  // How it works. Every text in the page is written in Spanish, in the code and in index.html. When the
  // language is English:
  //   - text that is fixed (labels, tooltips, messages) is translated on the way to the screen by a small
  //     observer that swaps each Spanish text for its English one (the dictionary below, keyed by the
  //     Spanish text);
  //   - text with a variable part goes through t('Spanish text with {name}', { name: value }), so the
  //     variable (a song title, a number) is never touched;
  //   - note names use noteName(): the songs stay in Do Re Mi..., the page shows C D E... in English;
  //   - anything inside an element marked translate="no" (song titles, subtitles, tags) is left alone.
  // Switching back to Spanish restores every original text. A text that is not in the dictionary simply
  // stays in Spanish.
  var STORAGE_KEY = 'ocarina-lang';

  var EN = {
    // ---- page shell
    'Notas y digitación para practicar': 'Notes and fingerings for practising',
    'Ocarina Songbook: ir a la lista de canciones': 'Ocarina Songbook: go to the song list',
    'Modo oscuro': 'Dark mode',
    'Cambiar entre tema claro y oscuro': 'Switch between light and dark theme',
    'Color del tema': 'Theme color',
    'Fuente': 'Font',
    'Fondo': 'Background',
    'Fondo de la página': 'Page background',
    'Ver las digitaciones de todas las notas': 'See the fingerings of all notes',
    'Digitaciones': 'Fingerings',
    'Abrir el metrónomo': 'Open the metronome',
    'Iniciar el metrónomo': 'Start the metronome',
    'Parar el metrónomo': 'Stop the metronome',
    'Metrónomo': 'Metronome',
    'Mostrar las notas como': 'Show the notes as',
    'Nombre': 'Name',
    'Digitación': 'Fingering',
    'Ambas': 'Both',
    'octava media': 'middle octave',
    'grave': 'low',
    'aguda': 'high',
    'media': 'middle',
    'sostenido': 'sharp',
    'bemol': 'flat',
    'Esta página necesita JavaScript para mostrar las canciones.': 'This page needs JavaScript to show the songs.',
    'Ocarina Songbook · cancionero personal para practicar con la ocarina': 'Ocarina Songbook · a personal songbook for practising the ocarina',
    'Exportar copia': 'Export backup',
    'Importar copia': 'Import backup',
    'Guardar todas las canciones y digitaciones en un archivo': 'Save all songs and fingerings in one file',
    'Añadir las canciones de una copia guardada': 'Add the songs of a saved backup',
    'Exportar la canción': 'Export the song',
    'Editar las digitaciones': 'Edit the fingerings',
    'Alteraciones de la canción': 'Accidentals of the song',
    'Digitaciones · Ocarina Songbook': 'Fingerings · Ocarina Songbook',

    // ---- common buttons
    'Aceptar': 'OK',
    'Cancelar': 'Cancel',
    'Cerrar': 'Close',
    'Listo': 'Done',
    'Editar': 'Edit',
    'Borrar': 'Delete',
    'Duplicar': 'Duplicate',
    'Cambiar': 'Change',
    'Añadir': 'Add',
    'Aplicar': 'Apply',
    'Importar': 'Import',
    'Exportar': 'Export',
    'Descartar': 'Discard',
    'Sobrescribir': 'Overwrite',
    'Deshacer': 'Undo',
    'Rehacer': 'Redo',
    'Todas': 'All',
    'Filtros': 'Filters',
    'Menos controles': 'Fewer controls',
    'Más controles': 'More controls',
    'Sin definir': 'Not set',
    'Sin título': 'Untitled',

    // ---- theme, font, mode
    'Neutro': 'Neutral', 'Rojo': 'Red', 'Amarillo': 'Yellow', 'Verde': 'Green', 'Canela': 'Cinnamon',
    'Morado': 'Purple', 'Rosa': 'Pink', 'Azul': 'Blue',
    'Clásica': 'Classic', 'Moderna': 'Modern', 'Legible': 'Readable', 'Manuscrita': 'Handwritten', 'Máquina': 'Typewriter',
    'Modo oscuro activo. Pulsa para pasar a claro': 'Dark mode on. Click to switch to light',
    'Modo claro activo. Pulsa para pasar a oscuro': 'Light mode on. Click to switch to dark',
    'Oscuro': 'Dark',
    'Claro': 'Light',

    // ---- background picker
    'Color plano': 'Flat color',
    'No se pudo leer esa imagen. Comprueba que sigue en la carpeta.': 'Could not read that image. Check that it is still in the folder.',
    'No se pudo enlazar la carpeta de fondos.': 'Could not link the backgrounds folder.',
    'La carpeta de fondos ya no está disponible. Elige otra.': 'The backgrounds folder is no longer available. Pick another one.',
    'Este navegador no puede enlazar carpetas. Abre la página con Chrome o Edge.': 'This browser cannot link folders. Open the page with Chrome or Edge.',
    'Enlaza una carpeta con tus imágenes para usarlas de fondo.': 'Link a folder with your pictures to use them as a background.',
    'Enlazar carpeta de fondos': 'Link a backgrounds folder',
    'El navegador necesita tu permiso para leer «{name}».': 'The browser needs your permission to read “{name}”.',
    'la carpeta': 'the folder',
    'No hay imágenes en «{name}» (png, jpg, webp, gif o avif).': 'There are no pictures in “{name}” (png, jpg, webp, gif or avif).',
    'Reconectar carpeta': 'Reconnect folder',
    'Cambiar carpeta': 'Change folder',
    'Elegir otra carpeta': 'Choose another folder',
    'Intensidad': 'Intensity',
    'Desenfoque': 'Blur',

    // ---- backup
    'Todavía no hay canciones que guardar.': 'There are no songs to save yet.',
    'Copia guardada: 1 canción.': 'Backup saved: 1 song.',
    'Copia guardada: {n} canciones.': 'Backup saved: {n} songs.',
    'Copia importada: {songs}{skipped}{notes}': 'Backup imported: {songs}{skipped}{notes}',
    '1 canción añadida': '1 song added',
    '{n} canciones añadidas': '{n} songs added',
    ' (1 ya estaba)': ' (1 was already there)',
    ' ({n} ya estaban)': ' ({n} were already there)',
    ' y 1 digitación.': ' and 1 fingering.',
    ' y {n} digitaciones.': ' and {n} fingerings.',
    ' y 1 digitación': ' and 1 fingering',
    ' y {n} digitaciones': ' and {n} fingerings',
    '1 canción': '1 song',
    '{n} canciones': '{n} songs',
    'Se añadieron las canciones, pero no se pudieron guardar las digitaciones.': 'The songs were added, but the fingerings could not be saved.',
    'Ese archivo no es una copia de Ocarina Songbook.': 'That file is not an Ocarina Songbook backup.',
    'Importar la copia': 'Import the backup',
    'La copia tiene {songs}{fingerings}. Las canciones se añaden a las que ya tienes (si una ya existe con otro contenido, se guarda con otro nombre) y las digitaciones sustituyen a las de las mismas notas.': 'The backup has {songs}{fingerings}. The songs are added to the ones you already have (if one already exists with different content, it is saved under another name) and the fingerings replace those of the same notes.',
    'No se pudo leer el archivo.': 'The file could not be read.',

    // ---- categories
    'Dificultad': 'Difficulty', 'Fácil': 'Easy', 'Media': 'Medium', 'Difícil': 'Hard',
    'Origen': 'Origin', 'Videojuegos': 'Video games', 'Cine y TV': 'Film & TV', 'Tradicional': 'Traditional', 'Otras': 'Other',
    'Estado': 'Status', 'Por aprender': 'To learn', 'Aprendiendo': 'Learning', 'Dominada': 'Mastered',

    // ---- editor
    'Descartar la canción nueva': 'Discard the new song',
    '«{name}» todavía no se ha guardado. Si sales, se perderán sus notas.': '“{name}” has not been saved yet. If you leave, its notes will be lost.',
    'Descartar los cambios': 'Discard the changes',
    'Los cambios de «{name}» no se han guardado. Si sales, se perderán.': 'The changes to “{name}” have not been saved. If you leave, they will be lost.',
    'Ponle un título a la canción.': 'Give the song a title.',
    'Añade al menos una nota para guardar la canción.': 'Add at least one note to save the song.',
    'El archivo ha cambiado': 'The file has changed',
    '«{name}» se ha modificado fuera de esta pantalla (otra pestaña o el archivo a mano) desde que la abriste. Si guardas, se sobrescribirá con tu versión.': '“{name}” was changed outside this screen (another tab, or the file by hand) since you opened it. If you save, it will be overwritten with your version.',
    'Alteraciones de la nueva canción': 'Accidentals of the new song',
    'Antes de escribir, elige si la canción usa bemoles, sostenidos o ninguno. La botonera solo te ofrecerá esos. La tonalidad se deduce de las notas que coloques.': 'Before you write, choose whether the song uses flats, sharps or neither. The palette will only offer those. The key is worked out from the notes you place.',
    'Crear canción': 'Create song',
    'Nueva canción': 'New song',
    ' (variante)': ' (variant)',
    'Cambiar las alteraciones': 'Change the accidentals',
    'Si pasas de bemoles a sostenidos (o al revés), las notas que ya has escrito se cambian por su equivalente, y suenan igual.': 'If you go from flats to sharps (or the other way), the notes you have already written are replaced by their equivalent, and sound the same.',
    'Se ha cambiado 1 nota por su equivalente.': '1 note was changed to its equivalent.',
    'Se han cambiado {n} notas por su equivalente.': '{n} notes were changed to their equivalent.',
    'Canción recuperada.': 'Song restored.',
    'Borrar canción': 'Delete song',
    'Se borrará «{name}» con todas sus notas.': '“{name}” will be deleted with all its notes.',
    'Canción borrada.': 'Song deleted.',
    'Una canción admite hasta 12 etiquetas.': 'A song can have up to 12 tags.',
    'Esa etiqueta ya está.': 'That tag is already there.',
    'Esta canción usa bemoles.': 'This song uses flats.',
    'Esta canción usa sostenidos.': 'This song uses sharps.',
    'Esta canción no usa alteraciones. Cámbialo con «Tonalidad».': 'This song uses no accidentals. Change that with “Key”.',
    'Ya está en la octava más aguda.': 'It is already in the highest octave.',
    'Ya está en la octava más grave.': 'It is already in the lowest octave.',

    // ---- key signature
    'Tonalidad': 'Key',
    'Sin alteraciones': 'No accidentals',
    'Bemoles ♭': 'Flats ♭',
    'Sostenidos ♯': 'Sharps ♯',
    '{note} mayor': '{note} major',
    '{note} menor': '{note} minor',
    ' (personalizado)': ' (custom)',
    'Sin alteraciones: la botonera no ofrece bemoles ni sostenidos. La tonalidad es Do mayor / La menor.': 'No accidentals: the palette offers neither flats nor sharps. The key is C major / A minor.',
    'Bemoles: la botonera ofrece Si♭, Mi♭, La♭, Re♭, Sol♭, Do♭ y Fa♭. La tonalidad sale de los que uses.': 'Flats: the palette offers B♭, E♭, A♭, D♭, G♭, C♭ and F♭. The key comes from the ones you use.',
    'Sostenidos: la botonera ofrece Fa♯, Do♯, Sol♯, Re♯, La♯, Mi♯ y Si♯. La tonalidad sale de los que uses.': 'Sharps: the palette offers F♯, C♯, G♯, D♯, A♯, E♯ and B♯. The key comes from the ones you use.',
    'Elige qué alteraciones va a usar la canción.': 'Choose which accidentals the song will use.',

    // ---- notes, durations, palette
    'Semicorchea': 'Sixteenth note',
    'Corchea': 'Eighth note',
    'Negra': 'Quarter note',
    'Blanca': 'Half note',
    'Redonda': 'Whole note',
    'Silencio': 'Rest',
    'Alteraciones': 'Accidentals',
    'súper aguda': 'very high',
    'Botonera de notas': 'Note palette',
    'Duración': 'Duration',
    'Puntillo': 'Dot',
    'Puntillo: alarga la nota la mitad de su valor': 'Dot: lengthens the note by half its value',
    '1 tiempo': '1 beat',
    '{n} tiempos': '{n} beats',
    '{label} ({beats})': '{label} ({beats})',
    'Añadir {note}': 'Add {note}',
    'Quitar {note}': 'Remove {note}',
    '{note}. Colocar el cursor detrás': '{note}. Place the caret after it',
    'La canción no usa alteraciones. Puedes cambiarlo con «Tonalidad».': 'The song uses no accidentals. You can change that with “Key”.',

    // ---- editor view
    'Título': 'Title',
    'Título de la canción': 'Song title',
    'Compás (opcional)': 'Time signature (optional)',
    'Compás de la canción (opcional)': 'Time signature of the song (optional)',
    'Tempo en pulsaciones por minuto': 'Tempo in beats per minute',
    'Etiquetas': 'Tags',
    'Escribe y pulsa Intro': 'Type and press Enter',
    'Añadir etiqueta': 'Add tag',
    'Quitar la etiqueta {tag}': 'Remove the tag {tag}',
    'Subtítulo de la línea (opcional)': 'Line subtitle (optional)',
    'Subtítulo de la línea {n}': 'Subtitle of line {n}',
    'Subir la línea (Alt + ↑)': 'Move the line up (Alt + ↑)',
    'Bajar la línea (Alt + ↓)': 'Move the line down (Alt + ↓)',
    'Duplicar la línea (Alt + Mayús + ↓)': 'Duplicate the line (Alt + Shift + ↓)',
    'Quitar línea': 'Remove line',
    'Arrastra para mover la línea': 'Drag to move the line',
    'Elige notas en la botonera': 'Pick notes from the palette',
    'Línea vacía': 'Empty line',
    'Nueva línea': 'New line',
    'Salto de línea, para leer mejor: no añade tiempo al reproducir. Si el cursor está en medio, las notas siguientes pasan a la línea nueva.': 'Line break, to make it easier to read: it adds no time when played. If the caret is in the middle, the following notes move to the new line.',
    'Borrar nota': 'Delete note',
    'Mostrar notas': 'Show notes',
    'Ocultar notas': 'Hide notes',
    'Guardar la canción en la carpeta': 'Save the song in the folder',
    'Canción nueva: se guardará en la carpeta {folder}/ cuando pulses Listo (necesita título y al menos una nota).': 'New song: it will be saved in the {folder}/ folder when you press Done (it needs a title and at least one note).',
    'Los cambios no se guardan en la carpeta {folder}/ hasta que pulses Listo. Cancelar (o Esc) los descarta.': 'Changes are not saved in the {folder}/ folder until you press Done. Cancel (or Esc) discards them.',
    'Los cambios se guardan solos en la carpeta {folder}/.': 'Changes are saved automatically in the {folder}/ folder.',
    'Cómo escribir con el teclado': 'How to write with the keyboard',
    'Escribir con el teclado': 'Writing with the keyboard',
    'Do Re Mi Fa Sol La Si, en la octava de la nota anterior': 'C D E F G A B, in the octave of the previous note',
    'Sostenido en la nota anterior (si la canción usa sostenidos)': 'Sharp on the previous note (if the song uses sharps)',
    'Bemol en la nota anterior (si la canción usa bemoles)': 'Flat on the previous note (if the song uses flats)',
    'Subir o bajar una octava la nota anterior': 'Raise or lower the previous note an octave',
    'Duración: semicorchea, corchea, negra, blanca, redonda': 'Duration: sixteenth, eighth, quarter, half, whole',
    'Mover el cursor (y elegir la nota para Reproducir)': 'Move the caret (and pick the note to Play from)',
    'Inicio  Fin': 'Home  End',
    '+  o  #': '+  or  #',
    '-  o  b': '-  or  b',
    'Ir al principio o al final de la línea': 'Go to the start or end of the line',
    'Retroceso  Supr': 'Backspace  Del',
    'Borrar una nota': 'Delete a note',
    'Mover la línea (Alt + Mayús + ↓ la duplica)': 'Move the line (Alt + Shift + ↓ duplicates it)',
    'Deshacer y rehacer': 'Undo and redo',
    'Listo (guardar)': 'Done (save)',
    'Cancelar y descartar los cambios': 'Cancel and discard the changes',
    'Duplicar para hacer una variante': 'Duplicate to make a variant',

    // ---- song page and list
    'Próximamente': 'Coming soon',
    'Reproducir desde aquí': 'Play from here',
    'Título A-Z': 'Title A-Z',
    'Dificultad (fácil primero)': 'Difficulty (easy first)',
    'Sin notas todavía': 'No notes yet',
    '1 línea': '1 line',
    '{n} líneas': '{n} lines',
    '1 nota': '1 note',
    '{n} notas': '{n} notes',
    'Editar «{name}»': 'Edit “{name}”',
    'Duplicar «{name}» para hacer una variante': 'Duplicate “{name}” to make a variant',
    'Borrar «{name}»': 'Delete “{name}”',
    'Quitar filtros': 'Clear filters',
    'Ninguna canción coincide con la búsqueda.': 'No song matches the search.',
    'Buscar por título, etiqueta, subtítulo…': 'Search by title, tag, subtitle…',
    'Buscar canciones': 'Search songs',
    'Sin etiquetas': 'No tags',
    'Etiqueta': 'Tag',
    'Ordenar por': 'Sort by',
    '{n} de {total} canciones': '{n} of {total} songs',
    ' · solo lectura': ' · read-only',
    'Canciones': 'Songs',

    // ---- player
    'Pulsa la primera nota del tramo.': 'Click the first note of the section.',
    'Ahora pulsa la última nota del tramo.': 'Now click the last note of the section.',
    'Se repetirá el tramo marcado. Pulsa otra nota para elegir otro.': 'The marked section will repeat. Click another note to pick a different one.',
    'Pausar': 'Pause',
    'Continuar': 'Resume',
    'Reproducir': 'Play',
    'Detener': 'Stop',
    'Velocidad de reproducción': 'Playback speed',
    'Repetir la canción al terminar': 'Repeat the song when it ends',
    'Repetir': 'Repeat',
    'Oír una cuenta de clics (un compás) antes de que empiece la canción': 'Hear a count of clicks (one bar) before the song starts',
    'Cuenta previa': 'Count-in',
    'Marcar un tramo de la canción y repetirlo': 'Mark a section of the song and repeat it',
    'Tramo': 'Section',
    'Guardar la canción como MIDI, WAV o MP4': 'Save the song as MIDI, WAV or MP4',
    'Reproductor': 'Player',
    'Tempo de la canción': 'Song tempo',
    'Velocidad': 'Speed',

    // ---- export
    'Las notas y el tempo, para abrirlos en editores de partituras o programas de música. Ocupa muy poco.': 'The notes and tempo, to open in score editors or music programs. Very small.',
    'Audio sin comprimir, la mejor calidad. Unos 2,6 MB por minuto.': 'Uncompressed audio, the best quality. About 2.6 MB a minute.',
    'Audio comprimido (AAC): suena en móviles y reproductores y ocupa poco. Unos 0,7 MB por minuto.': 'Compressed audio (AAC): plays on phones and players and is small. About 0.7 MB a minute.',
    'Generando {format}…': 'Generating {format}…',
    'Archivo {file} generado ({size}).': 'File {file} generated ({size}).',
    'Este navegador no puede crear {format}.': 'This browser cannot create {format}.',
    'No se pudo generar el archivo {format}.': 'The {format} file could not be generated.',
    'Exportar «{name}»': 'Export “{name}”',
    'Elige el formato del archivo.': 'Choose the file format.',

    // ---- metronome
    'Negras': 'Quarter notes',
    'Corcheas (×2)': 'Eighth notes (×2)',
    'Tresillos (×3)': 'Triplets (×3)',
    'Semicorcheas (×4)': 'Sixteenth notes (×4)',
    'Parar': 'Stop',
    'Empezar': 'Start',
    'Pulsaciones por minuto': 'Beats per minute',
    'Bajar el tempo': 'Lower the tempo',
    'Subir el tempo': 'Raise the tempo',
    'Volumen': 'Volume',
    'Toca al ritmo para fijar el tempo': 'Tap to the beat to set the tempo',
    'Marcar el tempo': 'Tap tempo',
    'Tempo de la canción ({bpm})': 'Song tempo ({bpm})',
    'Compás': 'Bar',
    'Sin acento': 'No accent',
    'Tiempos por compás': 'Beats per bar',
    'Subdivisión': 'Subdivision',
    'Este navegador no puede reproducir sonido.': 'This browser cannot play sound.',

    // ---- fingerings (editor and page)
    'Aguda': 'High', 'Grave': 'Low',
    'Natural': 'Natural',
    'Sostenido ♯': 'Sharp ♯',
    'Bemol ♭': 'Flat ♭',
    'Agujeros de la ocarina': 'Ocarina holes',
    'Agujero {n}': 'Hole {n}',
    'Sin digitación todavía: todos los agujeros destapados': 'No fingering yet: all holes open',
    'En progreso: las canciones muestran el nombre de esta nota': 'In progress: songs show this note by its name',
    'Digitación propia (cambia la de fábrica)': 'Your fingering (replaces the built-in one)',
    'Digitación propia': 'Your fingering',
    'Digitación de fábrica': 'Built-in fingering',
    'Volver a la de fábrica': 'Back to the built-in one',
    'Quitar digitación': 'Remove fingering',
    'Copiar de…': 'Copy from…',
    'Destapar todos los agujeros': 'Uncover all holes',
    'Destapar todos': 'Uncover all',
    'Copiar la digitación de otra nota': 'Copy the fingering of another note',
    'Elige una nota y pulsa los agujeros que se tapan. Los agujeros sin marcar están destapados.': 'Pick a note and click the holes that are covered. Holes you leave unmarked are open.',
    'Octava': 'Octave',
    'Nota': 'Note',
    'Alteración': 'Accidental',
    'Digitación completada': 'Fingering completed',
    'Si no está completada, las canciones muestran solo el nombre de esta nota.': 'If it is not completed, songs show only the name of this note.',
    'Has cambiado digitaciones y aún no se han guardado. Si sales, se perderán.': 'You have changed fingerings that are not saved yet. If you leave, they will be lost.',
    'Digitaciones guardadas.': 'Fingerings saved.',
    '1 agujero tapado': '1 hole covered',
    '{n} agujeros tapados': '{n} holes covered',
    'Octava aguda': 'High octave',
    'Octava media': 'Middle octave',
    'Octava grave': 'Low octave',
    'Naturales': 'Naturals',
    'Bemoles': 'Flats',
    'Sostenidos': 'Sharps',
    'Todas las notas': 'All notes',
    'Solo completadas': 'Only completed',
    'Pendientes (sin digitación o en progreso)': 'Pending (no fingering or in progress)',
    'Completada': 'Completed',
    'En progreso': 'In progress',
    'Sin digitación': 'No fingering',
    'Editar la digitación de {name}, {octave}': 'Edit the fingering of {name}, {octave}',
    'Qué notas mostrar': 'Which notes to show',
    '{done} de {total} notas completadas. Las que no lo están se ven por su nombre en las canciones.': '{done} of {total} notes completed. The ones that are not show by their name in the songs.',
    'Mostrar': 'Show',
    'Ninguna nota coincide con el filtro.': 'No note matches the filter.',

    // ---- folder and messages
    'fingerings.json está dañado y se ignora. Si guardas digitaciones, se guardará una copia del archivo como fingerings.json.bak.': 'fingerings.json is damaged and is ignored. If you save fingerings, a copy of the file will be kept as fingerings.json.bak.',
    'Hay notas no válidas que se ignoran en: {list}. Si guardas esa canción, se perderán; corrígelas en el archivo.': 'There are invalid notes that are ignored in: {list}. If you save that song they will be lost; fix them in the file.',
    'Se perdió el permiso sobre la carpeta songs. Pulsa «Reconectar carpeta» para seguir guardando.': 'Permission on the songs folder was lost. Press “Reconnect folder” to keep saving.',
    'No se encuentra la carpeta songs. Puede que la hayas movido o borrado.': 'The songs folder cannot be found. It may have been moved or deleted.',
    'No se pudo escribir en la carpeta songs.': 'Could not write to the songs folder.',
    'No se pudieron leer: {list}. No se han tocado.': 'Could not read: {list}. They have not been touched.',
    'Carpeta conectada: 1 canción.': 'Folder connected: 1 song.',
    'Carpeta conectada: {n} canciones.': 'Folder connected: {n} songs.',
    'Carpeta conectada. Todavía no hay canciones.': 'Folder connected. There are no songs yet.',
    'Crear la carpeta songs': 'Create the songs folder',
    'En «{name}» no hay ninguna carpeta llamada songs. ¿Quieres crearla ahí para guardar las canciones? Si no era la carpeta que buscabas, cancela y elige otra.': 'There is no folder called songs in “{name}”. Do you want to create it there to save the songs? If it was not the folder you were looking for, cancel and pick another.',
    'Crear carpeta': 'Create folder',
    'No se pudo conectar la carpeta.': 'Could not connect the folder.',
    'Sin permiso no se puede usar la carpeta.': 'Without permission the folder cannot be used.',
    'La carpeta guardada ya no está disponible. Elige la carpeta de nuevo.': 'The saved folder is no longer available. Pick the folder again.',
    'El archivo de «{name}» se ha modificado fuera de la página. Si pulsas Listo se sobrescribirá con lo que tienes aquí.': 'The file of “{name}” was changed outside the page. If you press Done it will be overwritten with what you have here.',
    'El archivo de «{name}» ya no está en la carpeta. Si pulsas Listo se volverá a crear.': 'The file of “{name}” is no longer in the folder. If you press Done it will be created again.',
    'Canciones actualizadas desde la carpeta.': 'Songs updated from the folder.',
    'Conectar carpeta': 'Connect folder',
    'Estás viendo las canciones publicadas: no se pueden editar desde aquí.': 'You are viewing the published songs: they cannot be edited from here.',
    'Solo lectura': 'Read-only',
    'Las canciones se guardan como archivos .json en esta carpeta. Pulsa para elegir otra.': 'Songs are saved as .json files in this folder. Click to pick another one.',
    'Las canciones son archivos .json de la carpeta songs. Conéctala para verlas y editarlas.': 'Songs are .json files in the songs folder. Connect it to see and edit them.',
    'La página está abierta desde el disco (file://): así solo puede leer las canciones si conectas la carpeta. Publicada en la web (por ejemplo en GitHub Pages) las muestra sola, en modo solo lectura.': 'The page is open from disk (file://): this way it can only read songs if you connect the folder. Published on the web (for example on GitHub Pages) it shows them by itself, read-only.',
    'No se han encontrado canciones publicadas junto a la página (falta songs/index.json).': 'No published songs were found next to the page (songs/index.json is missing).',
    'El navegador necesita tu permiso para leer la carpeta songs.': 'The browser needs your permission to read the songs folder.',
    'Este navegador no puede leer carpetas del disco. Abre la página con Chrome o Edge.': 'This browser cannot read folders from disk. Open the page with Chrome or Edge.',
    'No hay ninguna canción con ese enlace. Puede que se haya borrado o cambiado de nombre.': 'There is no song with that link. It may have been deleted or renamed.',
    'Ver todas las canciones': 'See all songs',
    'Todavía no hay canciones publicadas.': 'There are no published songs yet.',
    'La carpeta no tiene canciones todavía. Crea la primera.': 'The folder has no songs yet. Create the first one.'
  };

  var SOLFEGE_TO_LETTER = { Do: 'C', Re: 'D', Mi: 'E', Fa: 'F', Sol: 'G', La: 'A', Si: 'B' };
  var OCTAVE_LABEL = {
    es: { high: 'Aguda', mid: 'Media', low: 'Grave' },
    en: { high: 'High', mid: 'Middle', low: 'Low' }
  };
  var FLAG = { es: 'src/svg/spain.png', en: 'src/svg/united-kingdom.png' };
  var LANGUAGE_NAME = { es: 'Español', en: 'English' };
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  function has(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'es' || saved === 'en') return saved;
    } catch (e) { /* storage blocked: detect it */ }
    return String(navigator.language || 'es').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  }

  var lang = detect();
  var listeners = [];

  // ---- What the code uses ------------------------------------------------------------------------------
  function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, function (all, name) { return has(params, name) ? params[name] : all; });
  }

  // A text (Spanish) in the current language, with {name} placeholders filled in.
  function t(text, params) {
    var out = lang === 'en' && has(EN, text) ? EN[text] : text;
    return fill(out, params);
  }

  // "Sol" in Spanish, "G" in English.
  function noteName(name) {
    return lang === 'en' && has(SOLFEGE_TO_LETTER, name) ? SOLFEGE_TO_LETTER[name] : name;
  }

  // The name of an octave ('high' | 'mid' | 'low') for buttons and headings.
  function octave(key) {
    return OCTAVE_LABEL[lang][key] || key;
  }

  // ---- The page ----------------------------------------------------------------------------------------
  function skipped(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return true;
    return !!el.closest('script, style, [translate="no"]');
  }

  function translateText(node) {
    if (skipped(node)) return;
    var value = node.nodeValue;
    var core = value.trim();
    if (!core || node.__out === value) return;
    if (!has(EN, core) || EN[core] === core) return;
    node.__orig = value;
    node.__out = value.replace(core, EN[core]);
    node.nodeValue = node.__out;
  }

  function translateAttr(el, name) {
    if (skipped(el)) return;
    var value = el.getAttribute(name);
    if (!value) return;
    var saved = el.__attrs && el.__attrs[name];
    if (saved && saved.out === value) return;
    if (!has(EN, value) || EN[value] === value) return;
    el.__attrs = el.__attrs || {};
    el.__attrs[name] = { orig: value, out: EN[value] };
    el.setAttribute(name, EN[value]);
  }

  function eachText(root, run) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) run(node);
  }

  function translateTree(root) {
    if (root.nodeType === 3) { translateText(root); return; }
    if (root.nodeType !== 1) return;
    eachText(root, translateText);
    var withAttrs = [root].concat(Array.prototype.slice.call(root.querySelectorAll(ATTRS.map(function (a) { return '[' + a + ']'; }).join(','))));
    withAttrs.forEach(function (el) { ATTRS.forEach(function (name) { if (el.hasAttribute && el.hasAttribute(name)) translateAttr(el, name); }); });
  }

  // Puts the Spanish texts back (only where they are still the ones this file wrote).
  function restoreTree(root) {
    eachText(root, function (node) {
      if (node.__orig !== undefined && node.nodeValue === node.__out) node.nodeValue = node.__orig;
      node.__orig = undefined;
      node.__out = undefined;
    });
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) {
      if (!el.__attrs) return;
      Object.keys(el.__attrs).forEach(function (name) {
        if (el.getAttribute(name) === el.__attrs[name].out) el.setAttribute(name, el.__attrs[name].orig);
      });
      el.__attrs = null;
    });
  }

  var observer = new MutationObserver(function (records) {
    if (lang !== 'en') return;
    records.forEach(function (record) {
      if (record.type === 'childList') {
        Array.prototype.forEach.call(record.addedNodes, translateTree);
      } else if (record.type === 'characterData') {
        translateText(record.target);
      } else if (record.type === 'attributes') {
        translateAttr(record.target, record.attributeName);
      }
    });
  });

  // Note names written in the fixed HTML (the legend), which cannot go through noteName() themselves.
  function updateSolfege() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-solfege]'), function (el) {
      el.textContent = noteName(el.getAttribute('data-solfege'));
    });
  }

  function updateButton() {
    var button = document.getElementById('lang-toggle');
    if (!button) return;
    var flag = button.querySelector('img');
    var label = button.querySelector('span');
    if (flag) flag.src = FLAG[lang];
    if (label) label.textContent = LANGUAGE_NAME[lang];
    var other = lang === 'es' ? 'Switch to English' : 'Cambiar a español';
    button.setAttribute('aria-label', other);
    button.setAttribute('title', other);
  }

  function apply() {
    document.documentElement.setAttribute('lang', lang);
    if (lang === 'en') translateTree(document.documentElement);
    else restoreTree(document.documentElement);
    updateSolfege();
    updateButton();
  }

  function setLang(next) {
    if (next !== 'es' && next !== 'en') return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* the choice just won't be remembered */ }
    apply();
    listeners.forEach(function (fn) { fn(lang); });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function init() {
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS
    });
    var button = document.getElementById('lang-toggle');
    if (button) button.addEventListener('click', function () { setLang(lang === 'es' ? 'en' : 'es'); });
    apply();
  }

  C.i18n = {
    t: t,
    noteName: noteName,
    octave: octave,
    lang: function () { return lang; },
    setLang: setLang,
    onChange: onChange,
    init: init,
    dictionary: EN
  };
})(window.Songbook = window.Songbook || {});
