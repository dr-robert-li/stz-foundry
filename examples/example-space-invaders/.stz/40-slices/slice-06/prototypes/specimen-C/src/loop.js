// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns fps
// measurement (slice-06, P5): a rolling MEDIAN of recent instantaneous fps,
// written into gameState.fps for observability only — never fed back into
// update() (frame-rate variance must never change game logic/outcomes, per
// ADR-002/conventions.md).
// Depends on SI.Game.update(dt), SI.Game.state, and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06). Small fixed-size ring of recent
  // instantaneous fps samples (1000 / rawDeltaMs); each frame we
  // copy+sort that array and take the middle value rather than keeping a
  // running average, so one wild rAF timing spike can't skew the reported
  // number the way a mean would. Uncapped raw delta (measured BEFORE the
  // spiral-of-death cap below, which only applies to update()'s
  // accumulator, never to fps reporting); non-positive deltas (first frame,
  // or a clock that hasn't advanced) are skipped rather than pushed as
  // Infinity/garbage.
  var FPS_SAMPLE_WINDOW = 30;
  var fpsSamples = [];

  function medianOf(samples) {
    var sorted = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function recordFps(rawDelta) {
    if (!(rawDelta > 0)) {
      return; // skip non-positive/garbage deltas (e.g. the very first frame)
    }
    var instantaneous = 1000 / rawDelta;
    fpsSamples.push(instantaneous);
    if (fpsSamples.length > FPS_SAMPLE_WINDOW) {
      fpsSamples.shift();
    }
    if (fpsSamples.length > 0 && window.SI.Game && window.SI.Game.state) {
      window.SI.Game.state.fps = medianOf(fpsSamples);
    }
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
    // huge catch-up burst of update() calls. Applies only to the update
    // accumulator, not to the fps sample recorded above.
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
