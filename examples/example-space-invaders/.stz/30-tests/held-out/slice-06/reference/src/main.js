// SI.main — bootstrap (slice-06): canvas + audio-context setup, keyboard
// input wired to SI.Game.input intent flags, window.gameState = SI.Game.state
// live-reference assignment (ADR-003), and SI.Loop.start(). Runs
// automatically on load of dist/index.html (no exported API — this is the
// boot entry point, always last in the concatenation order). window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var KEY_TO_INTENT = {
    ArrowLeft: 'left',
    Left: 'left',
    ArrowRight: 'right',
    Right: 'right',
    Space: 'fire',
    ' ': 'fire',
    KeyP: 'pause',
    P: 'pause',
    Enter: 'start',
    NumpadEnter: 'start',
  };

  function intentFor(e) {
    return KEY_TO_INTENT[e.code] || KEY_TO_INTENT[e.key];
  }

  function wireInput() {
    var input = window.SI.Game.input;
    // pause/start are additional intent flags beyond the base left/right/fire
    // set (which game.js already owns) — added here without touching
    // game.js, per the contract's "Left/Right/Space/P/Enter mapped to
    // SI.Game.input intent flags" (P3/P4's state-machine consequences of
    // pause/start are out of this slice's scope; wiring the flags is not).
    if (input.pause === undefined) input.pause = false;
    if (input.start === undefined) input.start = false;

    window.addEventListener('keydown', function (e) {
      var intent = intentFor(e);
      if (!intent) return;
      window.SI.Game.input[intent] = true;
    });
    window.addEventListener('keyup', function (e) {
      var intent = intentFor(e);
      if (!intent) return;
      window.SI.Game.input[intent] = false;
    });
  }

  function boot() {
    var canvas = document.getElementById('game');
    var width = canvas && canvas.width ? canvas.width : 800;
    var height = canvas && canvas.height ? canvas.height : 600;

    window.SI.Game.init({ width: width, height: height });

    // Live-reference wiring (ADR-003): same object every call, mutated in
    // place by update(), never reassigned after this point.
    window.gameState = window.SI.Game.state;

    wireInput();

    window.SI.Loop.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
