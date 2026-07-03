// SI.Ufo — bonus UFO factory + pure(ish) spawn/traverse helpers (slice-05,
// P4). gameState.ufo = {active,x,y,width,height,bonus}. Spawn timing and the
// bonus value both draw from SI.RNG.next() (ADR-003: single shared,
// seedable RNG — never Math.random()), so a seeded run reproduces the exact
// spawn cadence and bonus sequence. The actual per-step orchestration
// (counting elapsed steps, deciding when to spawn, resolving a player-bullet
// hit) lives in SI.Game.update(); this module only creates/moves/spawns a
// UFO given already-decided trigger points, so the RNG-consuming functions
// stay small and easy to reason about in isolation. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
// Depends on SI.Config, SI.RNG.
(function () {
  function create() {
    var cfg = window.SI.Config;
    return {
      active: false,
      x: 0,
      y: 0,
      width: cfg.UFO_WIDTH,
      height: cfg.UFO_HEIGHT,
      bonus: 0,
    };
  }

  // nextSpawnInterval — draws ONE SI.RNG.next() call and scales it into an
  // integer count of fixed-steps in [UFO_SPAWN_MIN_STEPS,
  // UFO_SPAWN_MAX_STEPS] (inclusive), the "RNG-timed schedule" for the next
  // spawn. Guards the (extremely unlikely) next() === 1 edge, same pattern
  // as SI.Game's alien-fire column pick.
  function nextSpawnInterval() {
    var cfg = window.SI.Config;
    var span = cfg.UFO_SPAWN_MAX_STEPS - cfg.UFO_SPAWN_MIN_STEPS;
    var offset = Math.floor(window.SI.RNG.next() * (span + 1));
    if (offset > span) {
      offset = span;
    }
    return cfg.UFO_SPAWN_MIN_STEPS + offset;
  }

  // spawn — mutates `ufo` in place into an active UFO entering from the left
  // edge, at the configured top-of-screen y, with a bonus drawn via ONE
  // SI.RNG.next() call, uniformly in [UFO_BONUS_MIN, UFO_BONUS_MAX]
  // (inclusive of both ends).
  function spawn(ufo) {
    var cfg = window.SI.Config;
    ufo.active = true;
    ufo.x = -cfg.UFO_WIDTH;
    ufo.y = cfg.UFO_Y;
    ufo.width = cfg.UFO_WIDTH;
    ufo.height = cfg.UFO_HEIGHT;

    var span = cfg.UFO_BONUS_MAX - cfg.UFO_BONUS_MIN;
    var offset = Math.floor(window.SI.RNG.next() * (span + 1));
    if (offset > span) {
      offset = span;
    }
    ufo.bonus = cfg.UFO_BONUS_MIN + offset;
  }

  // traverse — moves an active `ufo` by UFO_SPEED px/step (left-to-right
  // across the top). Deactivates it once it has fully passed the right edge
  // of a `gameWidth`-wide field. No-op if `ufo` isn't active. Mutates in
  // place; returns true if the UFO just left the field this call (so the
  // caller knows to schedule the next spawn), false otherwise.
  function traverse(ufo, gameWidth) {
    if (!ufo.active) {
      return false;
    }
    ufo.x += window.SI.Config.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false;
      return true;
    }
    return false;
  }

  window.SI.Ufo = {
    create: create,
    nextSpawnInterval: nextSpawnInterval,
    spawn: spawn,
    traverse: traverse,
  };
})();
