// SI.Ufo — bonus-UFO factory + pure RNG-draw helpers (slice-05, P4). The
// actual spawn-countdown/traverse/despawn orchestration lives in
// SI.Game.update() (mirrors how SI.Alien only creates the grid and
// SI.Game marches it); this module just creates the resting {active:false,
// ...} shape and draws the two RNG-backed values (spawn countdown steps,
// bonus). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001). Depends on SI.Config and SI.RNG.
(function () {
  function createUfo() {
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

  // randomBonus — draws exactly one SI.RNG.next() call, mapped into the
  // inclusive integer range [UFO_BONUS_MIN, UFO_BONUS_MAX]. Deterministic
  // under a given SI.RNG seed/sequence.
  function randomBonus() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_BONUS_MAX - cfg.UFO_BONUS_MIN;
    return cfg.UFO_BONUS_MIN + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  // randomSpawnCountdown — draws exactly one SI.RNG.next() call, mapped
  // into the inclusive integer range [UFO_SPAWN_MIN_STEPS,
  // UFO_SPAWN_MAX_STEPS] of SI.Game.update() steps to wait before the next
  // spawn (never wall-clock).
  function randomSpawnCountdown() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_SPAWN_MAX_STEPS - cfg.UFO_SPAWN_MIN_STEPS;
    return cfg.UFO_SPAWN_MIN_STEPS + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  window.SI.Ufo = {
    create: createUfo,
    randomBonus: randomBonus,
    randomSpawnCountdown: randomSpawnCountdown,
  };
})();
