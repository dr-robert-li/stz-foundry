// SI.Main — bootstrap (slice-06, LAST in load order). Wires input, sets the
// live window.gameState reference (ADR-003), and starts the rAF loop.
// GUARDED for non-browser environments: merely loading the bundle in Node /
// a bare vm (no document / no requestAnimationFrame) must be a graceful
// no-op — SI.Renderer and SI.Audio are already defined by their own modules,
// so a Node smoke check still sees them. window.SI is bootstrapped in
// rng.js (ADR-001).
//
// Strategy: a single boot() run once the DOM is ready. Keyboard handling is
// a small key -> intent-flag table (Left/Right/Space/P/Enter), so adding a
// key is a table entry, not another if-branch. keydown sets the flag,
// keyup clears it; update() consumes them on the next fixed step (never
// mutating state straight from a handler, per conventions).
(function () {
  // key value -> gameState/input intent flag it sets.
  var KEY_MAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ' ': 'fire',
    Spacebar: 'fire', // legacy key name for space
    p: 'pause',
    P: 'pause',
    Enter: 'start',
  };

  function isBrowserBootable() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  function setFlag(event, value) {
    var flag = KEY_MAP[event.key];
    if (!flag) {
      return;
    }
    window.SI.Game.input[flag] = value;
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    // First real gesture: unlock audio (guarded no-op if unavailable).
    if (value && window.SI.Audio && typeof window.SI.Audio.resume === 'function') {
      window.SI.Audio.resume();
    }
  }

  function attachInput() {
    // Extend the input intent object with the pause/start flags this slice
    // introduces (left/right/fire already exist from game.js). Adding, not
    // renaming — P1-P4 never read these.
    window.SI.Game.input.pause = false;
    window.SI.Game.input.start = false;

    document.addEventListener('keydown', function (e) {
      setFlag(e, true);
    });
    document.addEventListener('keyup', function (e) {
      setFlag(e, false);
    });
  }

  function boot() {
    if (!isBrowserBootable()) {
      return; // non-browser: nothing to wire, no rAF to drive.
    }

    window.SI.Game.init();

    // Live-reference assignment (ADR-003): same object, mutated in place by
    // update(), never reassigned per frame.
    window.gameState = window.SI.Game.state;

    attachInput();
    window.SI.Loop.start();
  }

  if (!isBrowserBootable()) {
    // Node / bare vm: define nothing to run, exit quietly. SI.Renderer and
    // SI.Audio remain defined by their own modules for smoke checks.
    window.SI && (window.SI.Main = { boot: boot });
    return;
  }

  window.SI.Main = { boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
