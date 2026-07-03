// SI.Audio — synthesized SFX via WebAudio (slice-06). Every method is
// GUARDED so a headless/suspended/absent AudioContext never throws: ctor
// construction failure falls back to console.error-and-continue (per
// conventions.md's error-handling rule for this one legitimate case), and
// every playback call is wrapped so a suspended-context edge case can never
// propagate an exception into the caller (SI.Loop, or a test). No dependency
// on SI.Config. window.SI is bootstrapped once in rng.js (ADR-001).
(function () {
  var ctx = null;
  var ctxInitAttempted = false;

  function ensureContext() {
    if (ctx || ctxInitAttempted) {
      return ctx;
    }
    ctxInitAttempted = true;
    try {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return null; // no WebAudio support in this environment; silently no-op
      }
      ctx = new AudioCtor();
    } catch (e) {
      // Guarded fallback per conventions.md: log and continue without sound.
      console.error('SI.Audio: AudioContext construction failed, continuing without sound', e);
      ctx = null;
    }
    return ctx;
  }

  // beep — shared synth helper: a short oscillator tone through a gain
  // envelope. Wrapped end-to-end so any failure (including a suspended
  // context that rejects scheduling) is swallowed, never thrown.
  function beep(freq, durationMs, type) {
    try {
      var audioCtx = ensureContext();
      if (!audioCtx || audioCtx.state === 'closed') {
        return;
      }
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      var now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    } catch (e) {
      console.error('SI.Audio: playback failed, continuing without sound', e);
    }
  }

  function playShoot() {
    beep(880, 80, 'square');
  }

  function playExplosion() {
    beep(120, 220, 'sawtooth');
  }

  function playHit() {
    beep(220, 150, 'triangle');
  }

  function playUfo() {
    beep(440, 300, 'sine');
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playHit: playHit,
    playUfo: playUfo,
  };
})();
