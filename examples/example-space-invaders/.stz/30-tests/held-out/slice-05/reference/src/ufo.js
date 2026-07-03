// SI.Ufo — bonus-UFO spawn/bonus RNG helpers (slice-05, P4). No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on SI.Config
// and SI.RNG only — collision/consumption against the active UFO is
// orchestrated by SI.Game.update(), not here, so this stays pure/testable
// apart from its two deliberate SI.RNG.next() calls.
(function () {
  // rollBonus — draws the UFO point bonus uniformly from the inclusive
  // integer range [UFO_BONUS_MIN, UFO_BONUS_MAX] via exactly one
  // SI.RNG.next() call. Deterministic for a given RNG stream/seed.
  function rollBonus() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_BONUS_MAX - cfg.UFO_BONUS_MIN + 1;
    var v = Math.floor(window.SI.RNG.next() * span) + cfg.UFO_BONUS_MIN;
    if (v > cfg.UFO_BONUS_MAX) {
      v = cfg.UFO_BONUS_MAX; // guard the (extremely unlikely) next()===1 edge
    }
    return v;
  }

  // rollSpawnDelay — draws the number of fixed-steps to wait before the next
  // UFO spawn, uniformly from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] via
  // exactly one SI.RNG.next() call.
  function rollSpawnDelay() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_SPAWN_MAX_STEPS - cfg.UFO_SPAWN_MIN_STEPS + 1;
    var v = Math.floor(window.SI.RNG.next() * span) + cfg.UFO_SPAWN_MIN_STEPS;
    if (v > cfg.UFO_SPAWN_MAX_STEPS) {
      v = cfg.UFO_SPAWN_MAX_STEPS;
    }
    return v;
  }

  // spawn — builds a fresh active-UFO state object, entering from the left
  // edge and traversing rightward across the top of the screen. Calls
  // rollBonus() exactly once (so spawning always assigns a bonus).
  function spawn() {
    var cfg = window.SI.Config;
    return {
      active: true,
      x: -cfg.UFO_WIDTH,
      y: cfg.UFO_Y,
      width: cfg.UFO_WIDTH,
      height: cfg.UFO_HEIGHT,
      bonus: rollBonus(),
    };
  }

  window.SI.Ufo = {
    rollBonus: rollBonus,
    rollSpawnDelay: rollSpawnDelay,
    spawn: spawn,
  };
})();
