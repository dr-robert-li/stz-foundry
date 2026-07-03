// SI.Ufo — bonus UFO factory + pure RNG-draw helpers (slice-05, P4). The
// UFO lifecycle (inactive -> active -> inactive) is an explicit state
// machine driven by SI.Game.update(): this module only creates the
// default/inactive shape and draws the two randomized values the contract
// calls for (spawn delay, bonus), both via SI.RNG.next() so a seeded RNG
// makes the whole sequence reproducible. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config and SI.RNG only.
(function () {
  // create — the inactive default gameState.ufo shape.
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

  // pickSpawnDelay — integer count of SI.Game.update() steps to wait
  // before the next spawn, drawn from [UFO_SPAWN_MIN_STEPS,
  // UFO_SPAWN_MAX_STEPS] via a single SI.RNG.next() call (RNG-timed spawn,
  // per the contract).
  function pickSpawnDelay() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_SPAWN_MAX_STEPS - cfg.UFO_SPAWN_MIN_STEPS;
    return cfg.UFO_SPAWN_MIN_STEPS + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  // pickBonus — integer bonus value in [UFO_BONUS_MIN, UFO_BONUS_MAX] via
  // a single SI.RNG.next() call; deterministic under a seeded SI.RNG.
  function pickBonus() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_BONUS_MAX - cfg.UFO_BONUS_MIN;
    return cfg.UFO_BONUS_MIN + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  // spawn — mutates `ufo` in place into the active state: enters fully
  // off the left edge, y fixed at UFO_Y (traverses the top of the
  // screen), bonus freshly drawn via pickBonus().
  function spawn(ufo) {
    var cfg = window.SI.Config;
    ufo.active = true;
    ufo.x = -cfg.UFO_WIDTH;
    ufo.y = cfg.UFO_Y;
    ufo.width = cfg.UFO_WIDTH;
    ufo.height = cfg.UFO_HEIGHT;
    ufo.bonus = pickBonus();
  }

  window.SI.Ufo = {
    create: create,
    pickSpawnDelay: pickSpawnDelay,
    pickBonus: pickBonus,
    spawn: spawn,
  };
})();
