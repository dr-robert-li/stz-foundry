// SI.Ufo — the bonus UFO that traverses the top of the screen (slice-05,
// P4). The scheduling counter lives in SI.Game (like the march/fire
// counters); this module owns the UFO's own shape and the small pieces of
// math that touch SI.RNG or geometry, kept as separate functions so each is
// independently checkable.
//
// Spawn model (independent of the march/fire interval-timers): the game
// counts down to the next spawn. The FIRST countdown is a fixed constant
// (UFO_FIRST_SPAWN_STEPS) so no RNG is consumed at init — this keeps the
// P3 alien-fire RNG stream identical to slice-04 for short test windows.
// On each spawn the bonus is drawn from SI.RNG; each subsequent re-spawn
// interval is also drawn from SI.RNG (RNG-timed schedule). The UFO enters
// at the left edge and travels rightwards at a constant per-step speed.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on SI.Config
// and SI.RNG only.
(function () {
  // create — the initial inactive UFO record (ADR-003 shape). Off-field and
  // zero-bonus until a spawn fills it in.
  function create() {
    var cfg = window.SI.Config;
    return {
      active: false,
      x: 0,
      y: cfg.UFO_Y,
      width: cfg.UFO_WIDTH,
      height: cfg.UFO_HEIGHT,
      bonus: 0,
    };
  }

  // drawBonus — one SI.RNG.next() -> an integer in [UFO_BONUS_MIN,
  // UFO_BONUS_MAX] (i.e. [50,300]). next() is in [0,1); span+1 buckets map
  // it uniformly across the inclusive range. Always > 0.
  function drawBonus() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_BONUS_MAX - cfg.UFO_BONUS_MIN;
    var bonus = cfg.UFO_BONUS_MIN + Math.floor(window.SI.RNG.next() * (span + 1));
    if (bonus > cfg.UFO_BONUS_MAX) {
      bonus = cfg.UFO_BONUS_MAX; // guard the next()===~1 edge
    }
    return bonus;
  }

  // drawInterval — one SI.RNG.next() -> an integer number of fixed steps in
  // [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] until the next spawn.
  function drawInterval() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_SPAWN_MAX_STEPS - cfg.UFO_SPAWN_MIN_STEPS;
    var n = cfg.UFO_SPAWN_MIN_STEPS + Math.floor(window.SI.RNG.next() * (span + 1));
    if (n > cfg.UFO_SPAWN_MAX_STEPS) {
      n = cfg.UFO_SPAWN_MAX_STEPS;
    }
    return n;
  }

  // activate — turn an inactive UFO on: park it at the left edge, refresh
  // its size/row from config, and draw a fresh bonus. Mutates in place.
  function activate(ufo, gameWidth) {
    var cfg = window.SI.Config;
    ufo.active = true;
    ufo.width = cfg.UFO_WIDTH;
    ufo.height = cfg.UFO_HEIGHT;
    ufo.x = -cfg.UFO_WIDTH; // slide in from just off the left edge
    ufo.y = cfg.UFO_Y;
    ufo.bonus = drawBonus();
  }

  // step — advance an active UFO one fixed step to the right. Mutates x.
  function step(ufo) {
    ufo.x += window.SI.Config.UFO_SPEED;
  }

  // hasExited — true once the UFO has fully cleared the right edge.
  function hasExited(ufo, gameWidth) {
    return ufo.x >= gameWidth;
  }

  window.SI.Ufo = {
    create: create,
    drawBonus: drawBonus,
    drawInterval: drawInterval,
    activate: activate,
    step: step,
    hasExited: hasExited,
  };
})();
