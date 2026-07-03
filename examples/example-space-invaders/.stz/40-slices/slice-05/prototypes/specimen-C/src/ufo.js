// SI.Ufo — bonus UFO: RNG-timed spawn schedule, straight-line traversal
// across the top of the screen, and a functional player-bullet resolver
// (slice-05, P4). No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001). Depends on SI.Config, SI.RNG, SI.Collision only.
(function () {
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // randomSpawnDelay — consumes exactly one SI.RNG.next() call, returns an
  // integer step count in [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]
  // (inclusive) used by the caller as the next spawn's interval-timer
  // target. Seeding SI.RNG before driving update() makes the whole UFO
  // spawn schedule reproducible (ADR-003).
  function randomSpawnDelay() {
    var cfg = window.SI.Config;
    var min = cfg.UFO_SPAWN_MIN_STEPS;
    var span = cfg.UFO_SPAWN_MAX_STEPS - min;
    return min + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  // randomBonus — consumes exactly one SI.RNG.next() call, returns an
  // integer bonus in [UFO_BONUS_MIN, UFO_BONUS_MAX] (inclusive, both > 0).
  function randomBonus() {
    var cfg = window.SI.Config;
    var min = cfg.UFO_BONUS_MIN;
    var span = cfg.UFO_BONUS_MAX - min;
    return min + Math.floor(window.SI.RNG.next() * (span + 1));
  }

  // spawn — factory. Places a fresh, active UFO just off the left edge of
  // the screen, travelling right across the top. Draws its bonus via
  // randomBonus() (one SI.RNG.next() call).
  function spawn() {
    var cfg = window.SI.Config;
    return {
      active: true,
      x: -cfg.UFO_WIDTH,
      y: cfg.UFO_Y,
      width: cfg.UFO_WIDTH,
      height: cfg.UFO_HEIGHT,
      bonus: randomBonus(),
    };
  }

  // move — PURE. Returns a NEW ufo object advanced by one fixed step's
  // worth of constant per-step displacement (never scaled by dt's
  // magnitude, per ADR-002). Deactivates once it has fully travelled off
  // the right edge of the screen.
  function move(ufo, gameWidth) {
    var cfg = window.SI.Config;
    var nx = ufo.x + cfg.UFO_SPEED;
    var stillOnScreen = nx < gameWidth;
    return {
      active: ufo.active && stillOnScreen,
      x: nx,
      y: ufo.y,
      width: ufo.width,
      height: ufo.height,
      bonus: ufo.bonus,
    };
  }

  // resolvePlayerBulletHit — PURE functional pipeline. Given the current
  // `ufo` and `bullets` (playerBullets — array membership alone makes a
  // bullet live, per the TEST-FACING API, so a bare injected bullet over
  // an active ufo still hits), returns {ufo, bullets, scoreDelta}: if the
  // ufo is active and any bullet overlaps it, that bullet is removed, the
  // ufo is deactivated, and scoreDelta carries its bonus (> 0) for the
  // caller to add to state.score. No-op (scoreDelta 0) when the ufo is
  // already inactive or nothing overlaps.
  function resolvePlayerBulletHit(ufo, bullets) {
    if (!ufo.active) {
      return { ufo: ufo, bullets: bullets, scoreDelta: 0 };
    }

    var ufoAabb = toAabb(ufo);
    var hitIndex = -1;
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        hitIndex = i;
        break;
      }
    }

    if (hitIndex === -1) {
      return { ufo: ufo, bullets: bullets, scoreDelta: 0 };
    }

    var survivingBullets = bullets.filter(function (_bullet, i) {
      return i !== hitIndex;
    });
    var newUfo = {
      active: false,
      x: ufo.x,
      y: ufo.y,
      width: ufo.width,
      height: ufo.height,
      bonus: ufo.bonus,
    };

    return { ufo: newUfo, bullets: survivingBullets, scoreDelta: ufo.bonus };
  }

  window.SI.Ufo = {
    randomSpawnDelay: randomSpawnDelay,
    randomBonus: randomBonus,
    spawn: spawn,
    move: move,
    resolvePlayerBulletHit: resolvePlayerBulletHit,
  };
})();
