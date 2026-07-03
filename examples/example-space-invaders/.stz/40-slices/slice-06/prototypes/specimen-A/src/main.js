// main.js — bootstrap: canvas/audio-context setup (lazy, see audio.js),
// window.gameState wiring (ADR-003 live reference), keyboard input, and
// SI.Loop.start(). Last file in concatenation order (conventions.md).
//
// Browser guard: the bundle must also load cleanly in a bare Node vm (the
// mutation-testing smoke check runs it with `window` aliased to the
// global object but no `document`/`requestAnimationFrame`). In that
// environment every module above this one still defines its SI.* object
// (SI.Renderer, SI.Audio, etc. exist), but boot() below must NO-OP instead
// of throwing on a missing DOM/rAF.
(function () {
  function isBrowserEnvironment() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  function bindInput(input) {
    function setFlag(code, value) {
      if (code === 'ArrowLeft') {
        input.left = value;
      } else if (code === 'ArrowRight') {
        input.right = value;
      } else if (code === 'Space') {
        input.fire = value;
      }
    }

    window.addEventListener('keydown', function (e) {
      setFlag(e.code, true);
    });
    window.addEventListener('keyup', function (e) {
      setFlag(e.code, false);
    });
  }

  function boot() {
    if (!isBrowserEnvironment()) {
      return; // non-browser load (e.g. bare Node vm smoke check) — no-op
    }

    window.SI.Game.init();
    // Live reference (ADR-003): same object every frame, never reassigned.
    window.gameState = window.SI.Game.state;

    bindInput(window.SI.Game.input);

    window.SI.Loop.start();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
