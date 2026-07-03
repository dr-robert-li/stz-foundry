// SI.Loop — fixed-timestep accumulator, rAF driver. See ADR-002.
// No game rules live here: it just calls SI.Game.update(FIXED_TIMESTEP_MS)
// an integer number of times per frame (carrying the remainder in an
// accumulator) and then SI.Renderer.draw() once. Both SI.Game and
// SI.Renderer are optional at this slice — later slices provide them.
window.SI = window.SI || {};

SI.Loop = (function () {
  let accumulator = 0;
  let lastTime = null;
  let rafHandle = null;
  let running = false;

  function tick(timestamp) {
    if (!running) return;

    if (lastTime === null) {
      lastTime = timestamp;
    }
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    const step = SI.Config.FIXED_TIMESTEP_MS;
    const maxDelta = 3 * step; // cap huge deltas (tab backgrounding etc.)
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0;

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game ? SI.Game.state : undefined);
    }

    rafHandle = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    rafHandle = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  return {
    start: start,
    stop: stop,
  };
})();
