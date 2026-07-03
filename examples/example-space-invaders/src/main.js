// main.js — browser bootstrap (loads LAST in the concatenated bundle, per
// conventions.md's module order: ... -> loop.js -> game.js -> main.js).
// Wires canvas dims, audio-context setup, keyboard input -> SI.Game.input
// intent flags, window.gameState -> SI.Game.state (live reference, ADR-003),
// and starts SI.Loop. Must no-op gracefully outside a browser (Node smoke
// tests just eval the bundle) — SI.Renderer/SI.Audio are still fully
// defined either way since they're separate modules loaded earlier.
(function () {
  // No DOM -> nothing to boot (Node-level eval of the bundle). SI.Renderer
  // and SI.Audio objects, and SI.Game.init/update, remain usable/callable
  // directly by tests without a browser.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function boot() {
    var cfg = window.SI.Config;

    var canvas = document.getElementById('game');
    if (canvas) {
      canvas.width = cfg.RENDER_WIDTH;
      canvas.height = cfg.RENDER_HEIGHT;
    }

    window.SI.Game.init({ width: cfg.RENDER_WIDTH, height: cfg.RENDER_HEIGHT });

    // Live reference per ADR-003 — same object SI.Game.update() mutates in
    // place, never reassigned after this.
    window.gameState = window.SI.Game.state;

    var input = window.SI.Game.input;
    var audioResumed = false;

    function resumeAudioOnce() {
      if (!audioResumed) {
        audioResumed = true;
        window.SI.Audio.resume();
      }
    }

    function onKeyDown(e) {
      resumeAudioOnce();
      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        input.left = true;
      } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        input.right = true;
      } else if (e.code === 'Space' || e.key === ' ') {
        input.fire = true;
        e.preventDefault && e.preventDefault(); // stop page scroll on Space
      }
    }

    function onKeyUp(e) {
      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        input.left = false;
      } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        input.right = false;
      } else if (e.code === 'Space' || e.key === ' ') {
        input.fire = false;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    window.SI.Loop.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
