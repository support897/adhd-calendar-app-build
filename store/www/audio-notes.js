/* Small MediaRecorder adapter for task audio notes. Recordings are kept in
   the task state so the existing per-user Firestore sync carries them too. */
(function (root) {
  "use strict";
  var MAX_RECORDING_MS = 45000;
  var MAX_AUDIO_NOTE_CHARS = 190000;
  var MAX_STATE_BYTES = 750000;
  var MIME_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

  function chooseMime(Recorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
    for (var i = 0; i < MIME_TYPES.length; i++) {
      try { if (Recorder.isTypeSupported(MIME_TYPES[i])) return MIME_TYPES[i]; } catch (e) {}
    }
    return "";
  }
  function stopTracks(stream) {
    if (!stream || typeof stream.getTracks !== "function") return;
    stream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) {} });
  }
  function start(options) {
    options = options || {};
    var nav = options.navigator || root.navigator;
    var Recorder = options.MediaRecorder || root.MediaRecorder;
    if (!nav || !nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== "function") throw new Error("microphone-unavailable");
    if (typeof Recorder !== "function") throw new Error("recording-unavailable");

    var recorder = null, stream = null, chunks = [], startedAt = 0, cancelled = false, settled = false;
    var resolveDone, rejectDone;
    var done = new Promise(function (resolve, reject) { resolveDone = resolve; rejectDone = reject; });
    function rejectOnce(error) {
      if (settled) return;
      settled = true; stopTracks(stream); rejectDone(error || new Error("recording-failed"));
    }
    function resolveOnce(result) {
      if (settled) return;
      settled = true; stopTracks(stream); resolveDone(result);
    }
    var mime = chooseMime(Recorder);
    var ready = Promise.resolve().then(function () {
      return nav.mediaDevices.getUserMedia({ audio: true });
    }).then(function (gotStream) {
      stream = gotStream;
      if (cancelled) { stopTracks(stream); throw new Error("recording-cancelled"); }
      var config = { audioBitsPerSecond: 24000 };
      if (mime) config.mimeType = mime;
      try { recorder = new Recorder(stream, config); }
      catch (e) { recorder = new Recorder(stream); }
      recorder.ondataavailable = function (event) { if (event && event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = function (event) { rejectOnce(event && event.error || new Error("recording-failed")); };
      recorder.onstop = function () {
        var actualMime = (recorder && recorder.mimeType) || (chunks[0] && chunks[0].type) || mime || "audio/webm";
        var blob = new Blob(chunks, { type: actualMime });
        resolveOnce({ blob: blob, mimeType: actualMime, durationMs: Math.max(0, Date.now() - startedAt) });
      };
      startedAt = Date.now();
      recorder.start(1000);
      return true;
    }).catch(function (error) {
      if (!settled) rejectOnce(error);
      throw error;
    });
    // The UI observes both promises; this attached handler avoids an
    // unhandled-rejection warning when permission fails before it does.
    ready.catch(function () {});
    return {
      ready: ready,
      done: done,
      stop: function () {
        if (cancelled || settled) return;
        if (recorder && recorder.state !== "inactive") {
          try { recorder.stop(); } catch (e) { rejectOnce(e); }
        } else if (!recorder) cancelled = true;
      },
      cancel: function () {
        cancelled = true;
        if (recorder && recorder.state !== "inactive") {
          try { recorder.stop(); } catch (e) { rejectOnce(e); }
        } else if (!recorder) rejectOnce(new Error("recording-cancelled"));
        else rejectOnce(new Error("recording-cancelled"));
      }
    };
  }
  function toDataUrl(blob, Reader) {
    Reader = Reader || root.FileReader;
    if (!blob || typeof Reader !== "function") return Promise.reject(new Error("file-reader-unavailable"));
    return new Promise(function (resolve, reject) {
      var reader = new Reader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("file-read-failed")); };
      reader.readAsDataURL(blob);
    });
  }
  function utf8Length(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
    return unescape(encodeURIComponent(text)).length;
  }
  function fitsInState(state, taskId, note, maxBytes) {
    if (!state || !Array.isArray(state.tasks)) return false;
    var found = false;
    var copy = Object.assign({}, state, { tasks: state.tasks.map(function (task) {
      if (!task || task.id !== taskId) return task;
      found = true;
      var next = Object.assign({}, task);
      if (note == null) delete next.audioNote;
      else next.audioNote = note;
      return next;
    }) });
    if (!found) return false;
    try { return utf8Length(JSON.stringify(copy)) <= (maxBytes || MAX_STATE_BYTES); }
    catch (e) { return false; }
  }
  var api = {
    start: start,
    toDataUrl: toDataUrl,
    fitsInState: fitsInState,
    chooseMime: chooseMime,
    MAX_RECORDING_MS: MAX_RECORDING_MS,
    MAX_AUDIO_NOTE_CHARS: MAX_AUDIO_NOTE_CHARS,
    MAX_STATE_BYTES: MAX_STATE_BYTES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PaceAudioNotes = api;
})(typeof window !== "undefined" ? window : globalThis);
