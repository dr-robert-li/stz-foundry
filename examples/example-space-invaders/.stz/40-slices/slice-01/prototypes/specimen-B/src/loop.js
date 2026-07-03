// SI.Loop — fixed-timestep accumulator skeleton (ADR-002). No game rules
// live here: it just drives SI.Game.update(dt) a deterministic number of
// times per frame and calls SI.Renderer.draw() once per frame. Both
// SI.Game and SI.Renderer are optional at this slice (later slices define
// them) — calls are guarded so the loop is safe to start standalone.
(function (SI) {
  'use strict';

  var accumulator = 0;
  var lastTime = null;
  var running = false;
  var frameHandle = null;

  function stepMs() {
    return (SI.Config && SI.Config.FIXED_TIMESTEP_MS) || 1000 / 60;
  }

  function now() {
    // ponytail: performance.now() in the browser, Date.now() fallback so
    // this also runs in a Node vm sandbox where performance may be absent.
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function requestFrame(cb) {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    // ponytail: setTimeout fallback for non-browser hosts (Node vm); real
    // rAF is always used when available (browsers, Playwright).
    if (typeof setTimeout === 'function') {
      return setTimeout(function () {
        cb(now());
      }, stepMs());
    }
    // No scheduler available at all (bare vm sandbox) — nothing to hook
    // into; start() still succeeds, it just never ticks.
    return null;
  }

  function cancelFrame(handle) {
    if (handle === null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
    } else if (typeof clearTimeout === 'function') {
      clearTimeout(handle);
    }
  }

  function tick(timestamp) {
    if (!running) return;

    var step = stepMs();
    if (lastTime === null) {
      lastTime = timestamp;
    }

    var delta = timestamp - lastTime;
    lastTime = timestamp;

    // Spiral-of-death guard: never let one frame try to catch up more than
    // 3 steps' worth of simulation time (e.g. after tab backgrounding).
    var maxDelta = step * 3;
    if (delta > maxDelta) {
      delta = maxDelta;
    }
    if (delta < 0) {
      delta = 0;
    }

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game && SI.Game.state);
    }

    frameHandle = requestFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    frameHandle = requestFrame(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  }

  SI.Loop = {
    start: start,
    stop: stop,
    isRunning: function () {
      return running;
    }
  };
})(window.SI = window.SI || {});
