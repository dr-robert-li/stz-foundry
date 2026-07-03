// SI.Audio — WebAudio SFX synthesis (ADR-001: renderer/audio are the only
// modules allowed to touch browser APIs — here, AudioContext). Strategy:
// lazily construct ONE AudioContext on first sound (never at module-load
// time, so loading the bundle headless/in Node never touches AudioContext
// at all), then synthesize each effect as a short oscillator + gain-
// envelope burst. Every public method is wrapped so a missing, failed, or
// suspended AudioContext never throws into game logic — per conventions.md
// "console.error, don't crash" fallback.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var initTried = false;

  // Lazily creates (once) and returns the shared AudioContext, or null if
  // unavailable/failed. Only ever attempts construction once per page load
  // — a failed environment (headless browser with no AudioContext, or a
  // browser that throws on construction) doesn't retry and doesn't spam
  // console.error on every subsequent sound call.
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (initTried) {
      return null;
    }
    initTried = true;
    try {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) {
        return null;
      }
      ctx = new AC();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — the shared synthesis primitive: an oscillator through a
  // gain node that exponentially decays to (near-)silence, i.e. a simple
  // percussive envelope. Guarded so any failure (suspended context,
  // disallowed autoplay, an oscillator that refuses to start) is caught
  // and swallowed rather than propagated.
  function playTone(freq, duration, type, peakGain) {
    try {
      var c = getContext();
      if (!c) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        // Best-effort resume (user-gesture-gated in some browsers); never
        // block or throw on the returned promise rejecting.
        var resumed = c.resume();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(function () {});
        }
      }

      var osc = c.createOscillator();
      var gain = c.createGain();
      var now = c.currentTime;

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(peakGain || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Never let a sound-effect failure interrupt gameplay.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.09, 'square', 0.15);
  }

  function playExplosion() {
    playTone(110, 0.3, 'sawtooth', 0.25);
  }

  function playHit() {
    playTone(220, 0.15, 'triangle', 0.2);
  }

  function playUfo() {
    playTone(440, 0.2, 'sine', 0.15);
  }

  function playGameover() {
    playTone(80, 0.6, 'sawtooth', 0.25);
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playHit: playHit,
    playUfo: playUfo,
    playGameover: playGameover,
  };
})();
