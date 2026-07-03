// SI.Audio — minimal synthesized SFX via WebAudio (slice-06). Lazy
// AudioContext (created on first use, not at module load, since some
// browsers require a user gesture before audio can start) and every public
// method is guarded so a headless/suspended/absent AudioContext never
// throws — per conventions.md's "fail loudly in dev, but SI.Audio
// console.error-and-continues if AudioContext init fails so the game still
// runs without sound". No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var triedInit = false;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (triedInit) {
      return null; // already failed once this session, don't retry every call
    }
    triedInit = true;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return null; // no WebAudio support at all (older/headless browser)
      }
      ctx = new Ctor();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — one envelope helper (oscillator -> gain, linear attack then
  // exponential-ish decay via linear ramp to near-zero) shared by every SFX
  // below; the only place that touches raw WebAudio nodes. Guarded: any
  // failure (suspended context, node creation error, etc.) is caught and
  // swallowed, never thrown.
  function playTone(freq, durationSec, type) {
    var audioCtx = getContext();
    if (!audioCtx) {
      return;
    }
    try {
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.08, 'square');
  }

  function playExplosion() {
    playTone(120, 0.2, 'sawtooth');
  }

  function playUfo() {
    playTone(440, 0.3, 'triangle');
  }

  function playHit() {
    playTone(220, 0.1, 'square');
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playUfo: playUfo,
    playHit: playHit,
  };
})();
