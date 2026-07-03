// SI.Loop - fixed-timestep accumulator skeleton (ADR-002). No game rules
// live here; it only drives SI.Game.update(FIXED_TIMESTEP_MS) zero or more
// times per rAF frame, then calls SI.Renderer.draw() once per frame.
(function () {
  const state = { lastTime: null, accumulator: 0 };

  function frame(timestamp) {
    const step = SI.Config.FIXED_TIMESTEP_MS;
    const cap = 3 * step;

    let delta = state.lastTime === null ? 0 : timestamp - state.lastTime;
    state.lastTime = timestamp;
    if (delta > cap) delta = cap; // spiral-of-death guard

    state.accumulator += delta;

    while (state.accumulator >= step) {
      SI.Game.update(step);
      state.accumulator -= step;
    }

    SI.Renderer.draw();
    window.requestAnimationFrame(frame);
  }

  function start() {
    state.lastTime = null;
    state.accumulator = 0;
    window.requestAnimationFrame(frame);
  }

  SI.Loop = { start };
})();
