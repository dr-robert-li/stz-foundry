// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns
// gameState.fps: a rolling MEDIAN of recent instantaneous fps, computed
// from real requestAnimationFrame timing and written into state for
// observability only (P5) — it is never read by update(), so render-rate
// jitter can never change game outcomes.
//
// Strategy: sorted sliding window. Instantaneous fps samples are kept in
// two parallel structures — `fpsSamples` (insertion order, for O(1)
// eviction of the oldest sample) and `fpsSorted` (binary-search-maintained
// ascending order, for O(log n) median lookup without re-sorting every
// frame). Window size is small (32 samples) so the O(n) splice on
// insert/evict is cheap relative to render/update work.
//
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  var FPS_WINDOW_SIZE = 32;
  var fpsSamples = []; // insertion order, oldest first
  var fpsSorted = []; // same values, kept ascending

  // sortedInsert/sortedRemove — binary-search the ascending `fpsSorted`
  // array for the insertion/removal point. splice() itself is O(n), but n
  // is capped at FPS_WINDOW_SIZE (32), so this stays cheap every frame.
  function sortedInsert(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    fpsSorted.splice(lo, 0, value);
  }

  function sortedRemove(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (fpsSorted[lo] === value) {
      fpsSorted.splice(lo, 1);
    }
  }

  // recordFps — pushes one instantaneous fps sample into the sliding
  // window, evicts the oldest sample once the window is full, and returns
  // the current median (null if the window is somehow empty).
  function recordFps(instantFps) {
    fpsSamples.push(instantFps);
    sortedInsert(instantFps);

    if (fpsSamples.length > FPS_WINDOW_SIZE) {
      var oldest = fpsSamples.shift();
      sortedRemove(oldest);
    }

    var n = fpsSorted.length;
    if (n === 0) {
      return null;
    }
    var mid = n >> 1;
    if (n % 2 === 1) {
      return fpsSorted[mid];
    }
    return (fpsSorted[mid - 1] + fpsSorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    // Uncapped raw delta drives the fps sample; skip non-positive deltas
    // (first frame, or a duplicate/out-of-order rAF timestamp) rather than
    // feeding a divide-by-zero or negative fps into the window.
    var rawDelta = now - lastTime;
    lastTime = now;

    if (rawDelta > 0) {
      var instantFps = 1000 / rawDelta;
      var median = recordFps(instantFps);
      if (median !== null && window.SI.Game.state) {
        window.SI.Game.state.fps = median;
      }
    }

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. This cap is separate from the
    // uncapped fps sample above (ADR-002: fps sampling must never perturb
    // update() timing, and vice versa).
    var delta = rawDelta < 0 ? 0 : rawDelta;
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
    fpsSorted = [];
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
