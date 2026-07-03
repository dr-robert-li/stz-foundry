// SI.Loop — fixed-timestep accumulator, decoupled from rendering (ADR-002).
// No game rules live here; it only drives SI.Game.update(dt) and
// SI.Renderer.draw(state) once those modules exist (later slices).
window.SI = window.SI || {};

(function () {
  const STEP = function () {
    return SI.Config && SI.Config.FIXED_TIMESTEP_MS
      ? SI.Config.FIXED_TIMESTEP_MS
      : 1000 / 60;
  };

  // rAF isn't available in a headless Node vm sanity-check; fall back to a
  // timer so this module loads and runs the same shape of loop either way.
  const raf =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : typeof setTimeout === 'function'
        ? function (cb) {
            return setTimeout(function () {
              cb(now());
            }, 16);
          }
        : function (cb) {
            cb(now());
            return null;
          };

  const cancelRaf =
    typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : function () {};

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  let running = false;
  let accumulator = 0;
  let lastTime = null;
  let frameHandle = null;

  function tick(timestamp) {
    if (!running) return;

    const step = STEP();
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    // Cap huge deltas (e.g. after tab backgrounding) to avoid a
    // spiral-of-death of catch-up updates.
    const maxDelta = 3 * step;
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0; // guard: clock could go backwards on some hosts

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw();
    }

    frameHandle = raf(tick);
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = now();
    frameHandle = raf(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) cancelRaf(frameHandle);
    frameHandle = null;
  }

  SI.Loop = { start: start, stop: stop };
})();
