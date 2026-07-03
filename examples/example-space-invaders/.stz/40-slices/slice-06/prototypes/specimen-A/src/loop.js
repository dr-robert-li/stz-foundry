// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns the
// rolling-median fps sample (slice-06, P5), computed from raw rAF timing
// and written into gameState.fps for observability only.
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06, P5) — informational only, per ADR-002:
  // computed here from the RAW, uncapped rAF frame delta (never the
  // spiral-of-death-capped delta used for the accumulator below), written
  // into gameState.fps for observability, and never read back into
  // update() timing. Fixed-size ring buffer of recent instantaneous fps
  // samples; median (not mean) so one stalled frame can't swing the
  // reported number the way an outlier would in a mean.
  var FPS_WINDOW = 30;
  var fpsSamples = [];
  var fpsIndex = 0;

  function recordFps(rawDelta) {
    if (rawDelta <= 0) {
      return; // skip non-positive deltas — avoids Infinity/NaN samples
    }
    var instantaneous = 1000 / rawDelta;
    if (fpsSamples.length < FPS_WINDOW) {
      fpsSamples.push(instantaneous);
    } else {
      fpsSamples[fpsIndex] = instantaneous;
      fpsIndex = (fpsIndex + 1) % FPS_WINDOW;
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
    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Capping happens on a COPY of
    // the delta so the fps sample above always reflects real frame timing.
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
    fpsIndex = 0;
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
