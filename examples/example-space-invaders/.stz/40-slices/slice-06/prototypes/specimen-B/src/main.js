// SI main.js — browser bootstrap. Wires the canvas + WebAudio context,
// keyboard input -> SI.Game.input intent flags, window.gameState (live
// reference, per ADR-003), and starts SI.Loop. Runs immediately on script
// execution (this script is placed after the <canvas> element in
// dist/index.html, so the canvas already exists in the DOM by the time
// this runs — "on load of dist/index.html the game auto-boots").
//
// No-ops gracefully in a bare Node vm (window === globalThis, no
// document/requestAnimationFrame) while SI.Renderer and SI.Audio stay fully
// defined regardless of environment — only the act of booting is skipped.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var KEY_TO_INPUT = {
    ArrowLeft: 'left',
    Left: 'left', // older browsers report the non-numpad legacy key name
    ArrowRight: 'right',
    Right: 'right',
    Space: 'fire',
    ' ': 'fire', // some browsers report the space character as `key`
  };

  function canRunInBrowser() {
    return (
      typeof document !== 'undefined' &&
      typeof document.getElementById === 'function' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  // wireInput — keydown/keyup set intent flags on SI.Game.input only;
  // SI.Game.update() is the only place those flags turn into state changes
  // (per conventions.md's state-machine rule). P (pause) and Enter
  // (start/restart) are recorded as flags too so a future SI.Game.update()
  // can read them; unread flags are harmless extra fields on a plain object.
  function wireInput() {
    var input = window.SI.Game.input;

    document.addEventListener('keydown', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = true;
        if (prop === 'fire') {
          window.SI.Audio.shoot();
        }
      }
      if (e.code === 'KeyP') {
        input.pause = true;
      }
      if (e.code === 'Enter') {
        input.start = true;
      }
    });

    document.addEventListener('keyup', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = false;
      }
      if (e.code === 'KeyP') {
        input.pause = false;
      }
      if (e.code === 'Enter') {
        input.start = false;
      }
    });
  }

  function boot() {
    var canvas = document.getElementById('game');
    var width = (canvas && canvas.width) || 800;
    var height = (canvas && canvas.height) || 600;

    // ADR-003: a fixed default seed keeps determinism unless overridden;
    // production browser play seeds from Date.now() (still fully
    // overridable by anything that calls SI.Game.init()/SI.RNG.seed()
    // again afterward, e.g. a test harness).
    window.SI.Game.init({ width: width, height: height, seed: Date.now() });

    // Live reference, not a copy — set once, mutated in place by update().
    window.gameState = window.SI.Game.state;

    if (canvas) {
      window.SI.Renderer.init(canvas);
    }

    wireInput();
    window.SI.Loop.start();
  }

  if (canRunInBrowser()) {
    boot();
  }
})();
