// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002), plus a
// rolling-MEDIAN fps sampler written into gameState.fps (slice-06, P5).
// Depends on SI.Game.update(dt) / SI.Game.state and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
//
// fps strategy (deliberately median, not mean): each frame we derive one
// instantaneous fps sample (1000 / rawDelta, using the UNCAPPED wall-clock
// delta so a single stall shows up honestly), keep the most recent
// SAMPLE_WINDOW samples in a fixed-length ring buffer, and write their
// median into gameState.fps. A median is robust to the occasional long
// frame (GC pause, layout) that would drag a mean down — informational
// only, never read back by update() (ADR-002).
(function () {
  var SAMPLE_WINDOW = 31; // odd -> a single unambiguous middle sample

  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Ring buffer of recent instantaneous fps samples.
  var samples = [];
  var writeIndex = 0;

  function recordFps(instantaneous) {
    if (samples.length < SAMPLE_WINDOW) {
      samples.push(instantaneous);
    } else {
      samples[writeIndex] = instantaneous;
      writeIndex = (writeIndex + 1) % SAMPLE_WINDOW;
    }
  }

  // Median of the current sample set. General-case: works for both an even
  // and an odd number of samples (averages the two middle values when even),
  // so a half-full buffer isn't a special-cased bug. Empty -> null (caller
  // leaves the prior fps value untouched).
  function medianFps() {
    var n = samples.length;
    if (n === 0) {
      return null;
    }
    var sorted = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(n / 2);
    if (n % 2 === 1) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      // First callback: establish a baseline only. No delta exists yet, so
      // no fps sample and no update — recording 1000/0 here would poison the
      // median with Infinity.
      lastTime = now;
      window.requestAnimationFrame(frame);
      return;
    }

    var rawDelta = now - lastTime;
    lastTime = now;

    // fps sample from the true elapsed time (before the spiral-of-death cap
    // below). Guard non-positive deltas (two rAF callbacks sharing a
    // timestamp) so we never divide by zero / push Infinity.
    if (rawDelta > 0) {
      recordFps(1000 / rawDelta);
      var median = medianFps();
      if (median !== null) {
        window.SI.Game.state.fps = median;
      }
    }

    // Spiral-of-death guard for the SIMULATION only: never let one
    // slow/backgrounded frame force a huge catch-up burst of update() calls.
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

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    samples = [];
    writeIndex = 0;
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
