// SI.Audio — WebAudio SFX synthesis (guarded singleton). No canvas/game-
// state deps: reads nothing, mutates nothing outside its own private
// AudioContext. window.SI is bootstrapped once in rng.js (ADR-001), which
// loads first.
//
// Guard contract (slice-06): AudioContext construction is lazy (first SFX
// call, not module load — some browsers require a user gesture before an
// AudioContext is allowed to run) and every public method is safe to call
// in a headless browser with no AudioContext constructor, a construction
// failure, or a context stuck in 'suspended' state — never throws, per
// conventions.md's "console.error from SI.Audio if AudioContext init fails
// so the game still runs without sound" (a single console.error the first
// time construction fails, then silent no-ops afterward — not a repeated
// error per SFX call).
(function () {
  var ctx = null;
  var triedInit = false;

  // getContext — lazily constructs the single shared AudioContext. Returns
  // null (never throws) if no AudioContext constructor exists, or if
  // construction itself throws (some headless/locked-down environments).
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (triedInit) {
      return null; // already failed once this session — stay silent
    }
    triedInit = true;

    var Ctor =
      (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
      null;
    if (!Ctor) {
      return null; // no WebAudio support — headless/absent, not an error
    }

    try {
      ctx = new Ctor();
    } catch (e) {
      ctx = null;
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed:', e);
      }
    }
    return ctx;
  }

  // playTone — synthesizes a single short oscillator tone with a linear
  // decay envelope (attack-free: instant on, ramps to ~0 over durationSec).
  // Wrapped in try/catch so a suspended context, an unsupported
  // oscillator type, or any other WebAudio quirk degrades to silence
  // instead of throwing into the caller (SI.Game/input handlers).
  function playTone(freq, durationSec, type) {
    try {
      var c = getContext();
      if (!c || c.state === 'suspended' || c.state === 'closed') {
        return; // no context, or not allowed to produce sound right now
      }

      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;

      var now = c.currentTime;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      // Never let a synth glitch throw into game logic.
    }
  }

  function playShoot() {
    playTone(880, 0.08, 'square');
  }

  function playAlienHit() {
    playTone(220, 0.12, 'sawtooth');
  }

  function playPlayerHit() {
    playTone(110, 0.25, 'triangle');
  }

  function playUfoHit() {
    playTone(660, 0.2, 'sine');
  }

  function playGameOver() {
    playTone(80, 0.6, 'triangle');
  }

  // resume — best-effort attempt to leave the 'suspended' state (browsers
  // that require a user gesture before audio plays). Safe no-op if there's
  // no context yet or resume() isn't available/throws.
  function resume() {
    try {
      var c = getContext();
      if (c && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
    } catch (e) {
      // ignore — audio is a nice-to-have, never a hard requirement
    }
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playAlienHit: playAlienHit,
    playPlayerHit: playPlayerHit,
    playUfoHit: playUfoHit,
    playGameOver: playGameOver,
    resume: resume,
  };
})();
