(function (C) {
  'use strict';

  // Exporting a song: MIDI (the notes), WAV (uncompressed audio) or MP4 (compressed audio). The button in
  // the player opens a small window to choose. Everything is built in the browser and handed over as a
  // download; nothing is uploaded anywhere.
  var h = C.ui.h;
  var tr = C.i18n.t;

  // ---- Helpers ------------------------------------------------------------------------------------------
  function concat(parts) {
    var length = parts.reduce(function (sum, p) { return sum + p.length; }, 0);
    var out = new Uint8Array(length);
    var at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  function u8() { return new Uint8Array(Array.prototype.slice.call(arguments)); }
  function u16(n) { return u8((n >>> 8) & 255, n & 255); }
  function u32(n) { return u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); }
  function ascii(text) { return u8.apply(null, text.split('').map(function (c) { return c.charCodeAt(0); })); }
  function zeros(n) { return new Uint8Array(n); }

  function fileName(song, extension) {
    return (song.id || 'cancion') + '.' + extension;
  }

  function download(blob, name) {
    var link = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
  }

  // ---- MIDI ---------------------------------------------------------------------------------------------
  // A Standard MIDI File, format 0, one track on the "Ocarina" instrument (General MIDI program 80), with the
  // song's tempo, time signature and key. Pitches are the ones the page plays: Do = C5 (MIDI 72).
  var TICKS = 480;             // per quarter note

  function variableLength(value) {
    var bytes = [value & 127];
    value >>>= 7;
    while (value > 0) {
      bytes.unshift((value & 127) | 128);
      value >>>= 7;
    }
    return bytes;
  }

  function utf8(text) {
    return new TextEncoder().encode(text);
  }

  function midiFile(song) {
    var events = C.audio.sequence(song);
    var body = [];
    function add(bytes) { body.push(Uint8Array.from(bytes)); }
    function meta(type, data) { add([0, 0xFF, type].concat(variableLength(data.length), Array.prototype.slice.call(data))); }

    meta(0x03, utf8(song.title || song.id || 'Canción'));                                  // track name
    var tempo = Math.round(60000000 / (song.bpm || 100));
    meta(0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]);                    // tempo
    var meter = /^\s*(\d{1,2})\s*\/\s*(2|4|8|16)\s*$/.exec(song.meter || '');
    meta(0x58, [meter ? Number(meter[1]) : 4, meter ? Math.log2(Number(meter[2])) : 2, 24, 8]);   // time signature
    var key = C.keys.describe(song.signature, song);
    meta(0x59, [key.signature & 255, key.mode === 'minor' ? 1 : 0]);                       // key signature
    add([0, 0xC0, 79]);                                                                    // program: Ocarina

    var wait = 0;                                                                          // ticks since the last event
    events.forEach(function (e) {
      var ticks = Math.round(e.beats * TICKS);
      if (e.midi === null) {
        wait += ticks;
        return;
      }
      var note = Math.min(127, Math.max(0, e.midi));
      add(variableLength(wait).concat([0x90, note, 90]));
      add(variableLength(ticks).concat([0x80, note, 0]));
      wait = 0;
    });
    add(variableLength(wait).concat([0xFF, 0x2F, 0]));                                     // end of track

    var track = concat(body);
    return concat([ascii('MThd'), u32(6), u16(0), u16(1), u16(TICKS), ascii('MTrk'), u32(track.length), track]);
  }

  // ---- MP4 (AAC audio) -------------------------------------------------------------------------------------
  // The song is rendered to samples, compressed with the browser's AAC encoder (WebCodecs) and wrapped in an
  // MP4 container written here by hand: one audio track, no video.
  var MP4_RATE = 44100;
  var FRAME = 1024;            // samples per AAC frame

  function box(type) {
    var payload = concat(Array.prototype.slice.call(arguments, 1));
    return concat([u32(payload.length + 8), ascii(type), payload]);
  }

  function fullBox(type, version, flags) {
    return box.apply(null, [type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255)].concat(Array.prototype.slice.call(arguments, 3)));
  }

  var MATRIX = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  // AAC-LC, mono, at MP4_RATE, in case the encoder does not report its own configuration.
  var FALLBACK_CONFIG = u8(0x12, 0x08);

  function descriptor(tag, body) {
    return concat([u8(tag, body.length), body]);
  }

  function mp4Container(frames, config, rate) {
    var count = frames.length;
    var duration = count * FRAME;

    var esds = fullBox('esds', 0, 0,
      descriptor(0x03, concat([u16(0), u8(0),
        descriptor(0x04, concat([u8(0x40, 0x15), zeros(3), u32(0), u32(0), descriptor(0x05, config)])),
        descriptor(0x06, u8(2))])));
    var mp4a = box('mp4a', zeros(6), u16(1), zeros(8), u16(1), u16(16), zeros(4), u32(rate * 65536), esds);
    var sizes = concat(frames.map(function (f) { return u32(f.length); }));

    function moov(offset) {
      var stbl = box('stbl',
        fullBox('stsd', 0, 0, u32(1), mp4a),
        fullBox('stts', 0, 0, u32(1), u32(count), u32(FRAME)),
        fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1)),
        fullBox('stsz', 0, 0, u32(0), u32(count), sizes),
        fullBox('stco', 0, 0, u32(1), u32(offset)));
      var minf = box('minf',
        fullBox('smhd', 0, 0, zeros(4)),
        box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
        stbl);
      var mdia = box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(rate), u32(duration), u16(0x55C4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), ascii('soun'), zeros(12), ascii('SoundHandler'), zeros(1)),
        minf);
      var trak = box('trak',
        fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0x0100), u16(0), MATRIX, u32(0), u32(0)),
        mdia);
      return box('moov',
        fullBox('mvhd', 0, 0, u32(0), u32(0), u32(rate), u32(duration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
        trak);
    }

    var ftyp = box('ftyp', ascii('M4A '), u32(0), ascii('M4A '), ascii('mp42'), ascii('isom'));
    var headerSize = ftyp.length + moov(0).length + 8;          // where the audio data starts
    return concat([ftyp, moov(headerSize), box('mdat', concat(frames))]);
  }

  function mp4File(song) {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
      return Promise.reject(new Error('unsupported'));
    }
    // The lowest bit rate the browser's AAC encoder accepts for a mono track (they differ a little).
    var settings = null;
    var candidates = [64000, 96000, 128000].map(function (bitrate) {
      return { codec: 'mp4a.40.2', sampleRate: MP4_RATE, numberOfChannels: 1, bitrate: bitrate, aac: { format: 'aac' } };
    });
    return candidates.reduce(function (chain, candidate) {
      return chain.then(function () {
        if (settings) return;
        return AudioEncoder.isConfigSupported(candidate).then(function (result) { if (result.supported) settings = candidate; });
      });
    }, Promise.resolve()).then(function () {
      if (!settings) throw new Error('unsupported');
      return C.audio.renderSamples(song, MP4_RATE);
    }).then(function (samples) {
      var frames = [];
      var config = null;
      var failure = null;
      var encoder = new AudioEncoder({
        output: function (chunk, info) {
          var bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          frames.push(bytes);
          var description = info && info.decoderConfig && info.decoderConfig.description;
          if (description && !config) config = new Uint8Array(description.buffer ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength) : description);
        },
        error: function (e) { failure = e; }
      });
      encoder.configure(settings);
      var block = 4096;
      for (var at = 0; at < samples.length; at += block) {
        var part = samples.slice(at, Math.min(at + block, samples.length));
        var data = new AudioData({
          format: 'f32-planar', sampleRate: MP4_RATE, numberOfFrames: part.length, numberOfChannels: 1,
          timestamp: Math.round(at / MP4_RATE * 1e6), data: part
        });
        encoder.encode(data);
        data.close();
      }
      return encoder.flush().then(function () {
        encoder.close();
        if (failure || !frames.length) throw failure || new Error('no audio');
        return new Blob([mp4Container(frames, config || FALLBACK_CONFIG, MP4_RATE)], { type: 'audio/mp4' });
      });
    });
  }

  // ---- The window -------------------------------------------------------------------------------------------
  var FORMATS = [
    { key: 'mid', label: 'MIDI', ext: 'mid', text: 'Las notas y el tempo, para abrirlos en editores de partituras o programas de música. Ocupa muy poco.',
      make: function (song) { return Promise.resolve(new Blob([midiFile(song)], { type: 'audio/midi' })); } },
    { key: 'wav', label: 'WAV', ext: 'wav', text: 'Audio sin comprimir, la mejor calidad. Unos 2,6 MB por minuto.',
      make: function (song) { return C.audio.renderWav(song); } },
    { key: 'mp4', label: 'MP4', ext: 'mp4', text: 'Audio comprimido (AAC): suena en móviles y reproductores y ocupa poco. Unos 0,7 MB por minuto.',
      make: mp4File }
  ];

  function size(blob) {
    var point = C.i18n.lang() === 'en' ? '.' : ',';
    return blob.size < 1048576 ? Math.max(1, Math.round(blob.size / 1024)) + ' KB' : (blob.size / 1048576).toFixed(1).replace('.', point) + ' MB';
  }

  function open(song) {
    var dialog = document.getElementById('export-dialog');
    if (!dialog || !song) return;
    var status = h('p', { class: 'export-status', role: 'status' });
    var buttons = [];

    function run(format) {
      buttons.forEach(function (b) { b.disabled = true; });
      status.textContent = tr('Generando {format}…', { format: format.label });
      format.make(song).then(function (blob) {
        download(blob, fileName(song, format.ext));
        C.ui.toast(tr('Archivo {file} generado ({size}).', { file: fileName(song, format.ext), size: size(blob) }));
        dialog.close();
      }).catch(function (error) {
        status.textContent = error && error.message === 'unsupported'
          ? tr('Este navegador no puede crear {format}.', { format: format.label })
          : tr('No se pudo generar el archivo {format}.', { format: format.label });
        buttons.forEach(function (b) { b.disabled = false; });
      });
    }

    buttons = FORMATS.map(function (format) {
      return h('button', {
        type: 'button',
        class: 'export-option',
        'data-format': format.key,
        onclick: function () { run(format); }
      }, h('strong', null, format.label + ' (.' + format.ext + ')'), h('span', null, format.text));
    });

    dialog.replaceChildren(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } },
      h('h2', null, tr('Exportar «{name}»', { name: song.title || tr('Sin título') })),
      h('p', null, 'Elige el formato del archivo.'),
      h('div', { class: 'export-options' }, buttons),
      status,
      h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn', onclick: function () { dialog.close(); } }, 'Cerrar'))));
    dialog.showModal();
  }

  C.exporter = { open: open, midiFile: midiFile, mp4File: mp4File };
})(window.Songbook = window.Songbook || {});
