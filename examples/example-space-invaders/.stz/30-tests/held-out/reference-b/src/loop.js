// loop.js — fixed-timestep accumulator driving rAF (ADR-002).
//
// The accumulator lives in this closure so its remainder carries across frames:
// each rAF frame we advance simulation time by (capped) real delta, run
// SI.Game.update(FIXED_TIMESTEP_MS) an integer number of whole steps, keep the
// leftover for next frame, then render once.
(function (SI) {
  'use strict';

  // Resolve requestAnimationFrame from whichever host provides it (global in a
  // Node harness, window in the browser). `typeof` on an undeclared name is safe.
  function scheduleFrame(cb) {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(cb);
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    return undefined;
  }

  var running = false;
  var lastTime = null;
  var accumulator = 0;

  function frame(timestamp) {
    if (!running) {
      return;
    }

    var step = SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      // First frame establishes the baseline; nothing has elapsed yet.
      lastTime = timestamp;
    } else {
      var delta = timestamp - lastTime;
      lastTime = timestamp;

      // Cap the delta to avoid a spiral of death after the tab was backgrounded.
      var maxDelta = 3 * step;
      if (delta > maxDelta) {
        delta = maxDelta;
      }
      if (delta < 0) {
        delta = 0; // guard against non-monotonic timestamps
      }

      accumulator += delta;
      while (accumulator >= step) {
        SI.Game.update(step);
        accumulator -= step;
      }
    }

    // Render exactly once per rAF frame, after any updates.
    SI.Renderer.draw();

    scheduleFrame(frame);
  }

  SI.Loop = {
    start: function () {
      running = true;
      lastTime = null;
      accumulator = 0;
      scheduleFrame(frame);
    },
    stop: function () {
      running = false;
    },
  };
})(window.SI = window.SI || {});
