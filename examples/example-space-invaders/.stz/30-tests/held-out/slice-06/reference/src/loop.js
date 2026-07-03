// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Slice-06 adds:
// a rolling-median fps sample (from real rAF timing, informational only,
// never fed back into update()) written into gameState.fps, and now passes
// the live state object to SI.Renderer.draw(state) once per frame, after the
// update loop (render never advances game logic).
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling window of recent instantaneous fps samples (1000/frameDeltaMs),
  // one sample per rAF frame. A bounded window (not the whole session) keeps
  // the median representative of *recent* performance, per the contract
  // ("rolling MEDIAN of recent instantaneous fps").
  var fpsSamples = [];
  var FPS_WINDOW = 32;

  function recordFpsSample(deltaMs) {
    if (!(deltaMs > 0)) {
      return; // guard first frame (lastTime just initialized) / zero-delta
    }
    fpsSamples.push(1000 / deltaMs);
    if (fpsSamples.length > FPS_WINDOW) {
      fpsSamples.shift();
    }
  }

  function medianFps() {
    if (fpsSamples.length === 0) {
      return 0;
    }
    var sorted = fpsSamples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    recordFpsSample(delta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    // fps is informational only: written AFTER the update loop above, so
    // frame-rate variance can never change what update() just did (per
    // ADR-002/conventions.md's testability rule).
    if (window.SI.Game.state) {
      window.SI.Game.state.fps = medianFps();
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  window.SI.Loop = {
    start: start,
    stop: stop,
  };
})();
