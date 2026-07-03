// SI.Audio — synthesized SFX via the WebAudio API (slice-06). Fully
// GUARDED: constructing the AudioContext and every play method is wrapped so
// an absent / suspended / headless AudioContext never throws — on failure we
// console.error once and continue silently (the game must run without
// sound). window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// nothing but the WebAudio API.
//
// Strategy: no eager AudioContext — it's created lazily on the first sound
// (and only if a user gesture has enabled audio), so merely loading the
// bundle in a headless/Node context constructs nothing. One private
// `blip(freq, durationMs, type, startGain)` renders an oscillator through a
// short gain envelope; each named SFX is a one-line call into it with its
// own timbre.
(function () {
  var ctx = null;
  var unavailable = false; // true once construction has failed (log once)

  function AudioContextClass() {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function context() {
    if (ctx || unavailable) {
      return ctx;
    }
    var Ctor = AudioContextClass();
    if (!Ctor) {
      unavailable = true;
      if (typeof console !== 'undefined') {
        console.error('SI.Audio: no AudioContext available; running muted.');
      }
      return null;
    }
    try {
      ctx = new Ctor();
    } catch (err) {
      unavailable = true;
      if (typeof console !== 'undefined') {
        console.error('SI.Audio: AudioContext construction failed; running muted.', err);
      }
      return null;
    }
    return ctx;
  }

  // blip — one oscillator through a linear gain fade-out. Every call is
  // self-guarded: any WebAudio throw (suspended context, bad param) is
  // swallowed so callers never have to.
  function blip(freq, durationMs, type, startGain) {
    var c = context();
    if (!c) {
      return;
    }
    try {
      // A suspended context (autoplay policy) — try to resume, ignore the
      // returned promise / any rejection.
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        var maybe = c.resume();
        if (maybe && typeof maybe.catch === 'function') {
          maybe.catch(function () {});
        }
      }
      var now = c.currentTime;
      var dur = durationMs / 1000;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(startGain || 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('SI.Audio: playback failed; continuing.', err);
      }
    }
  }

  window.SI.Audio = {
    // Explicit unlock hook for main.js to call from a user gesture.
    resume: function () {
      var c = context();
      if (c && c.state === 'suspended' && typeof c.resume === 'function') {
        try {
          var maybe = c.resume();
          if (maybe && typeof maybe.catch === 'function') {
            maybe.catch(function () {});
          }
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.error('SI.Audio: resume failed; continuing.', err);
          }
        }
      }
    },
    playShoot: function () {
      blip(880, 90, 'square', 0.12);
    },
    playExplosion: function () {
      blip(120, 260, 'sawtooth', 0.2);
    },
    playAlienStep: function () {
      blip(160, 60, 'triangle', 0.1);
    },
    playUfo: function () {
      blip(520, 200, 'sine', 0.14);
    },
    playPlayerHit: function () {
      blip(80, 320, 'sawtooth', 0.22);
    },
  };
})();
