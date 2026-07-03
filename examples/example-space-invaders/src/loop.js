// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
//
// slice-06 (P5): also tracks a rolling MEDIAN of instantaneous fps
// (1000/rawDeltaMs, the UNCAPPED wall-clock delta between rAF callbacks —
// deliberately not the spiral-of-death-capped `delta` used for the update
// accumulator, so fps reporting reflects real render cadence) into
// gameState.fps. This is informational only per ADR-002/conventions.md:
// it is never read by update() and never influences the fixed-step
// simulation. Non-positive raw deltas (first frame, or a backwards/zero
// timestamp some environments can report) are skipped rather than turned
// into an Infinity/NaN sample.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Fixed-size ring buffer of recent instantaneous-fps samples.
  var fpsSamples = [];

  function pushFpsSample(rawDeltaMs) {
    if (!(rawDeltaMs > 0)) {
      return; // skip non-positive/invalid deltas
    }
    var instantaneous = 1000 / rawDeltaMs;
    fpsSamples.push(instantaneous);
    var windowSize = window.SI.Config.FPS_WINDOW_SIZE;
    if (fpsSamples.length > windowSize) {
      fpsSamples.shift();
    }
  }

  function medianFps() {
    if (fpsSamples.length === 0) {
      return 60; // no samples yet — matches SI.Game.init()'s default fps
    }
    var sorted = fpsSamples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;
    pushFpsSample(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Applied only to the update
    // accumulator, not to the fps sample above.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    var state = window.SI.Game.state;
    if (state) {
      state.fps = medianFps();
    }

    window.SI.Renderer.draw(state);

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
