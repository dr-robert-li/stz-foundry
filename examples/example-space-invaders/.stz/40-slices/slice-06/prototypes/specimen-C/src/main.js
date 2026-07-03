// main.js — browser bootstrap (slice-06). Wires canvas + input, calls
// SI.Game.init(), assigns window.gameState = SI.Game.state as a LIVE
// reference (ADR-003 — never reassigned after this), attaches Left/Right/
// Space/P/Enter keyboard listeners that set SI.Game.input intent flags
// (never touch state directly, per conventions.md's "input handlers set
// intent flags that update() consumes"), then starts SI.Loop.
//
// Must no-op gracefully in Node/headless (no `document`/`window.document`):
// SI.Renderer and SI.Audio stay defined either way (loaded earlier in
// concatenation order), only the DOM-dependent boot steps below are
// skipped. This is the LAST concatenated module (build.js), so every other
// SI.* namespace it references is already attached.
(function () {
  function handleKey(pressed) {
    return function (event) {
      switch (event.code) {
        case 'ArrowLeft':
          window.SI.Game.input.left = pressed;
          break;
        case 'ArrowRight':
          window.SI.Game.input.right = pressed;
          break;
        case 'Space':
          window.SI.Game.input.fire = pressed;
          break;
        case 'KeyP':
          if (pressed) {
            togglePause();
          }
          break;
        case 'Enter':
          if (pressed) {
            restart();
          }
          break;
        default:
          return; // don't preventDefault on keys we don't handle
      }
      event.preventDefault();
    };
  }

  function togglePause() {
    var state = window.SI.Game.state;
    if (!state) {
      return;
    }
    if (state.state === 'playing') {
      state.state = 'paused';
    } else if (state.state === 'paused') {
      state.state = 'playing';
    }
  }

  function restart() {
    window.SI.Game.init({ width: 800, height: 600 });
  }

  function boot() {
    // Headless/Node guard: nothing DOM-dependent below can run without
    // `document`, but SI.Renderer/SI.Audio remain defined regardless (they
    // guard their own DOM/AudioContext access internally).
    if (typeof document === 'undefined') {
      return;
    }

    var canvas = document.getElementById('game');
    var width = canvas ? canvas.width : 800;
    var height = canvas ? canvas.height : 600;

    window.SI.Game.init({ width: width, height: height });
    // Live reference (ADR-003): SI.Game.init() already sets window.gameState
    // to the same object as SI.Game.state, but assign it again explicitly
    // here so the bootstrap contract (TEST-FACING API) is satisfied even if
    // SI.Game's internals ever change.
    window.gameState = window.SI.Game.state;

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));

    window.SI.Loop.start();
  }

  boot();
})();
