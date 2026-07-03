// SI.Audio — synthesized WebAudio SFX. Lazily creates ONE AudioContext on
// first use (never at module-load time, so this file is safe to load in a
// headless/DOM-less Node vm). Every public method is guarded top-to-bottom
// so a headless browser, a suspended AudioContext, or a browser with no
// AudioContext at all never throws — construction failure logs via
// console.error and every call after that is a silent no-op (per
// conventions.md: fail loudly to the console, but the game keeps running
// without sound).
//
// Reuses a small fixed pool of continuously-running oscillator+gain
// "voices" instead of creating/discarding an OscillatorNode per sound (a
// real OscillatorNode can only be started once, ever) — each play() call
// grabs the next voice round-robin and re-envelopes its gain/frequency, so
// steady-state SFX spam allocates zero new audio nodes.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var VOICE_COUNT = 4;
  var ctx = null;
  var voices = null; // [{osc, gain}, ...]
  var nextVoiceIndex = 0;
  var constructionFailed = false;

  function logError(message, err) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(message, err);
    }
  }

  function getContext() {
    if (ctx || constructionFailed) {
      return ctx;
    }
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        constructionFailed = true;
        return null;
      }
      ctx = new Ctor();
      buildVoicePool();
      return ctx;
    } catch (e) {
      logError('SI.Audio: AudioContext construction failed, continuing without sound', e);
      constructionFailed = true;
      ctx = null;
      return null;
    }
  }

  function buildVoicePool() {
    voices = [];
    for (var i = 0; i < VOICE_COUNT; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0;
      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      voices.push({ osc: osc, gain: gain });
    }
  }

  function nextVoice() {
    var voice = voices[nextVoiceIndex];
    nextVoiceIndex = (nextVoiceIndex + 1) % voices.length;
    return voice;
  }

  // play — envelopes one pooled voice: near-instant attack, short
  // exponential-ish decay. Guarded end-to-end; any failure (suspended
  // context, unsupported ramp, whatever) is swallowed — audio is
  // best-effort and must never break gameplay.
  function play(freq, duration, type) {
    try {
      var c = getContext();
      if (!c || !voices || !voices.length) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
      var voice = nextVoice();
      var now = c.currentTime;
      voice.osc.type = type || 'square';
      voice.osc.frequency.setValueAtTime(freq, now);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0.0001, now);
      voice.gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(duration, 0.02));
    } catch (e) {
      // Best-effort SFX — never let audio break gameplay.
    }
  }

  function shoot() {
    play(880, 0.08, 'square');
  }

  function alienHit() {
    play(220, 0.12, 'square');
  }

  function explosion() {
    play(110, 0.3, 'sawtooth');
  }

  function ufoHit() {
    play(660, 0.25, 'triangle');
  }

  function gameOver() {
    play(90, 0.6, 'sawtooth');
  }

  window.SI.Audio = {
    shoot: shoot,
    alienHit: alienHit,
    explosion: explosion,
    ufoHit: ufoHit,
    gameOver: gameOver,
  };
})();
