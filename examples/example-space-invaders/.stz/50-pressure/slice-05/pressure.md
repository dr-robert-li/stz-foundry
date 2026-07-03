---
summary: "Pressure log slice-05: 3 culled."
---

# Pressure log — slice-05

## specimen-A
- **culled because:** gate testPassRate=0.97

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html. Node builtins only (ADR-004).
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order for this slice: rng -> collision -> config -> loop ->
// player -> bullet -> alien -> shield -> ufo -> game. shield.js and ufo.js
// depend only on SI.Config/SI.RNG (like alien.js/bullet.js/player.js), so
// they load before game.js, which orchestrates them.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'game.js',
];

function buildBundle() {
  const parts = MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// ---- src/${name} ----\n` + fs.readFileSync(filePath, 'utf8');
  });
  return parts.join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
${bundle}
</script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle));
}

main();

+++ dist/game.js
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): shields. Row-major cells, per shield: SHIELD_ROWS *
  // SHIELD_COLS cells, each SHIELD_CELL_WIDTH x SHIELD_CELL_HEIGHT.
  // SHIELD_COUNT shields are spread evenly across gameWidth, deliberately
  // leaving a clear gap centered on the player's default spawn x (classic
  // arrangement, also keeps P1/P2/P3's default straight-up shot lane clear).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 10,
  SHIELD_STARTING_INTEGRITY: 4,
  SHIELD_Y_FROM_BOTTOM: 150, // shield row sits this far above the play field's bottom edge

  // slice-05 (P4): UFO. Spawns on an SI.RNG.next()-timed schedule (interval
  // drawn in [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] fixed-steps),
  // traverses left-to-right across the top of the screen.
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 30,
  UFO_SPEED: 4, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,

  // slice-05 (P4): linear wave speedup. Each wave's full-grid initial march
  // interval is WAVE_MARCH_SPEEDUP_STEP fixed-steps less than the previous
  // wave's (floored at 1), reusing marchInterval's existing ratio math.
  WAVE_MARCH_SPEEDUP_STEP: 6,
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid) for a fixed wave.
  //
  // Linear wave speedup: each wave's ceiling (maxInterval) is
  // WAVE_MARCH_SPEEDUP_STEP fixed-steps lower than the previous wave's,
  // floor-clamped to 1 — so for a fixed aliveCount, a higher wave never
  // yields a slower (larger) interval, and strictly decreases wave-over-wave
  // while the ceiling hasn't already bottomed out. No state read/written —
  // same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;

    if (wave === undefined) {
      wave = 1;
    }
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL - (wave - 1) * cfg.WAVE_MARCH_SPEEDUP_STEP;
    if (maxInterval < 1) {
      maxInterval = 1;
    }

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible shield factory + pure cell-geometry math
// (slice-05, P4). A shield is {x,y,cells:[integer integrity...]} where
// `cells` is a row-major flat array (SI.Config.SHIELD_ROWS *
// SHIELD_COLS entries). The actual hit resolution (bullet-vs-cell overlap,
// integrity decrement) is orchestrated by SI.Game.update(); this module only
// creates shields and exposes cellRect() as pure geometry math, per the
// TEST-FACING API (tests target a cell via cellRect() without knowing
// internals). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config only.
(function () {
  // cellRect — PURE. Row-major layout: cellIndex = row * cols + col. Returns
  // the {x,y,width,height} rect for that cell in world space, regardless of
  // the cell's current integrity (geometry doesn't depend on state).
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellW = cfg.SHIELD_CELL_WIDTH;
    var cellH = cfg.SHIELD_CELL_HEIGHT;

    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;

    return {
      x: shield.x + col * cellW,
      y: shield.y + row * cellH,
      width: cellW,
      height: cellH,
    };
  }

  // createShields — builds SI.Config.SHIELD_COUNT shields, evenly spaced
  // across gameWidth with equal gaps (including the outer margins), each
  // starting at full SHIELD_STARTING_INTEGRITY per cell. Deliberately leaves
  // a clear central gap (see config.js comment) rather than a shield
  // straddling gameWidth/2.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var cols = cfg.SHIELD_COLS;
    var rows = cfg.SHIELD_ROWS;
    var totalCells = cols * rows;
    var shieldWidth = cols * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap + i * (shieldWidth + gap);
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_STARTING_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: destructible shields, RNG-timed bonus UFO,
// wave escalation). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Alien fire and UFO spawn
// both use a fixed interval-timer step counter (like the march cadence);
// the UFO's threshold is itself RNG-drawn per spawn cycle. Alien fire uses
// an index-scan over aliens (SI.Alien.frontlineByColumn) to pick the firing
// column.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn schedule (slice-05, P4) — internal only, per the same
  // interval-timer pattern as alienFireCounter above, except the threshold
  // itself is redrawn from SI.RNG.next() (via SI.Ufo.nextSpawnInterval())
  // every time the UFO despawns (whether by leaving the field or by being
  // shot), so the schedule is genuinely "RNG-timed" rather than a fixed
  // cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnThreshold = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height} object
  // present in state[bulletsField] (playerBullets OR alienBullets — both
  // call this) is treated as a live collidable bullet purely by array
  // membership, same TEST-FACING rule as elsewhere, so a bare injected
  // bullet over a cell rect still hits. Checked at the bullet's CURRENT
  // (already-moved) position. Only cells with integrity > 0 participate —
  // a destroyed cell (integrity already 0) no longer blocks anything, so
  // bullets pass through the hole. On a hit: that cell's integrity drops by
  // 1 (floor-clamped at 0, never negative) and the bullet is consumed
  // (removed), checking at most one cell per bullet per step.
  function resolveBulletShieldCollisions(state, bulletsField) {
    var bullets = state[bulletsField];
    if (bullets.length === 0) {
      return;
    }
    var shields = state.shields;
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var bulletAabb = toAabb(bullet);
      var consumed = false;

      for (var s = 0; s < shields.length && !consumed; s++) {
        var shield = shields[s];
        var cells = shield.cells;
        for (var c = 0; c < cells.length; c++) {
          if (cells[c] <= 0) {
            continue; // already-destroyed cell: no collision, bullet passes through
          }
          var rect = window.SI.Shield.cellRect(shield, c);
          if (window.SI.Collision.aabbOverlap(bulletAabb, toAabb(rect))) {
            cells[c] -= 1;
            if (cells[c] < 0) {
              cells[c] = 0;
            }
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }

    state[bulletsField] = survivors;
  }

  // Bullet-vs-UFO collision (slice-04/05, P4): a player bullet overlapping
  // an ACTIVE ufo (current position, after this step's movement) deactivates
  // it, adds its bonus (> 0) to score, and is consumed. No-op if the ufo
  // isn't active. On a hit, immediately reschedules the next RNG-timed
  // spawn (same as a natural off-screen despawn) so the schedule stays
  // continuous.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var ufoAabb = toAabb(ufo);
    var survivors = [];
    var hit = false;

    for (var i = 0; i < bullets.length; i++) {
      if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        hit = true;
        continue; // consumed
      }
      survivors.push(bullets[i]);
    }

    if (hit) {
      ufo.active = false;
      state.score += ufo.bonus;
      ufoSpawnCounter = 0;
      ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
    }
    state.playerBullets = survivors;
  }

  // UFO spawn-timer + traversal (slice-05, P4): interval-timer cadence,
  // same shape as maybeFireAlienBullet, except the threshold is itself
  // drawn from SI.RNG.next() (SI.Ufo.nextSpawnInterval()) rather than a
  // fixed SI.Config constant — "spawns on an SI.RNG.next()-timed schedule".
  // While active, moves the ufo each step; once it fully exits the field,
  // deactivates it and redraws the next spawn threshold.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var justDespawned = window.SI.Ufo.traverse(ufo, gameWidth);
      if (justDespawned) {
        ufoSpawnCounter = 0;
        ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
      }
      return;
    }

    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnThreshold) {
      return;
    }
    ufoSpawnCounter = 0;
    window.SI.Ufo.spawn(ufo);
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount, wave) (slice-05: wave-aware, linear speedup per wave) —
  // never wall-clock, never scaled by dt's magnitude, so N identical
  // update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    // Shields intercept player bullets before they can reach aliens/ufo
    // (resolved at the bullet's current, already-moved position).
    resolveBulletShieldCollisions(state, 'playerBullets');

    var aliensBefore = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien this
    // step increments the wave and respawns a full 55-alien grid. March
    // state resets so the new grid starts a fresh cadence, reusing
    // marchInterval(aliveCount, wave) below for the new wave's (faster)
    // initial interval.
    if (aliensBefore > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    // Shields intercept alien bullets before they can reach the player.
    resolveBulletShieldCollisions(state, 'alienBullets');

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): shields. Row-major cells, per shield: SHIELD_ROWS *
  // SHIELD_COLS cells, each SHIELD_CELL_WIDTH x SHIELD_CELL_HEIGHT.
  // SHIELD_COUNT shields are spread evenly across gameWidth, deliberately
  // leaving a clear gap centered on the player's default spawn x (classic
  // arrangement, also keeps P1/P2/P3's default straight-up shot lane clear).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 10,
  SHIELD_STARTING_INTEGRITY: 4,
  SHIELD_Y_FROM_BOTTOM: 150, // shield row sits this far above the play field's bottom edge

  // slice-05 (P4): UFO. Spawns on an SI.RNG.next()-timed schedule (interval
  // drawn in [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] fixed-steps),
  // traverses left-to-right across the top of the screen.
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 30,
  UFO_SPEED: 4, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,

  // slice-05 (P4): linear wave speedup. Each wave's full-grid initial march
  // interval is WAVE_MARCH_SPEEDUP_STEP fixed-steps less than the previous
  // wave's (floored at 1), reusing marchInterval's existing ratio math.
  WAVE_MARCH_SPEEDUP_STEP: 6,
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid) for a fixed wave.
  //
  // Linear wave speedup: each wave's ceiling (maxInterval) is
  // WAVE_MARCH_SPEEDUP_STEP fixed-steps lower than the previous wave's,
  // floor-clamped to 1 — so for a fixed aliveCount, a higher wave never
  // yields a slower (larger) interval, and strictly decreases wave-over-wave
  // while the ceiling hasn't already bottomed out. No state read/written —
  // same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;

    if (wave === undefined) {
      wave = 1;
    }
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL - (wave - 1) * cfg.WAVE_MARCH_SPEEDUP_STEP;
    if (maxInterval < 1) {
      maxInterval = 1;
    }

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible shield factory + pure cell-geometry math
// (slice-05, P4). A shield is {x,y,cells:[integer integrity...]} where
// `cells` is a row-major flat array (SI.Config.SHIELD_ROWS *
// SHIELD_COLS entries). The actual hit resolution (bullet-vs-cell overlap,
// integrity decrement) is orchestrated by SI.Game.update(); this module only
// creates shields and exposes cellRect() as pure geometry math, per the
// TEST-FACING API (tests target a cell via cellRect() without knowing
// internals). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config only.
(function () {
  // cellRect — PURE. Row-major layout: cellIndex = row * cols + col. Returns
  // the {x,y,width,height} rect for that cell in world space, regardless of
  // the cell's current integrity (geometry doesn't depend on state).
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellW = cfg.SHIELD_CELL_WIDTH;
    var cellH = cfg.SHIELD_CELL_HEIGHT;

    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;

    return {
      x: shield.x + col * cellW,
      y: shield.y + row * cellH,
      width: cellW,
      height: cellH,
    };
  }

  // createShields — builds SI.Config.SHIELD_COUNT shields, evenly spaced
  // across gameWidth with equal gaps (including the outer margins), each
  // starting at full SHIELD_STARTING_INTEGRITY per cell. Deliberately leaves
  // a clear central gap (see config.js comment) rather than a shield
  // straddling gameWidth/2.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var cols = cfg.SHIELD_COLS;
    var rows = cfg.SHIELD_ROWS;
    var totalCells = cols * rows;
    var shieldWidth = cols * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap + i * (shieldWidth + gap);
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_STARTING_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: destructible shields, RNG-timed bonus UFO,
// wave escalation). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Alien fire and UFO spawn
// both use a fixed interval-timer step counter (like the march cadence);
// the UFO's threshold is itself RNG-drawn per spawn cycle. Alien fire uses
// an index-scan over aliens (SI.Alien.frontlineByColumn) to pick the firing
// column.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn schedule (slice-05, P4) — internal only, per the same
  // interval-timer pattern as alienFireCounter above, except the threshold
  // itself is redrawn from SI.RNG.next() (via SI.Ufo.nextSpawnInterval())
  // every time the UFO despawns (whether by leaving the field or by being
  // shot), so the schedule is genuinely "RNG-timed" rather than a fixed
  // cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnThreshold = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height} object
  // present in state[bulletsField] (playerBullets OR alienBullets — both
  // call this) is treated as a live collidable bullet purely by array
  // membership, same TEST-FACING rule as elsewhere, so a bare injected
  // bullet over a cell rect still hits. Checked at the bullet's CURRENT
  // (already-moved) position. Only cells with integrity > 0 participate —
  // a destroyed cell (integrity already 0) no longer blocks anything, so
  // bullets pass through the hole. On a hit: that cell's integrity drops by
  // 1 (floor-clamped at 0, never negative) and the bullet is consumed
  // (removed), checking at most one cell per bullet per step.
  function resolveBulletShieldCollisions(state, bulletsField) {
    var bullets = state[bulletsField];
    if (bullets.length === 0) {
      return;
    }
    var shields = state.shields;
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var bulletAabb = toAabb(bullet);
      var consumed = false;

      for (var s = 0; s < shields.length && !consumed; s++) {
        var shield = shields[s];
        var cells = shield.cells;
        for (var c = 0; c < cells.length; c++) {
          if (cells[c] <= 0) {
            continue; // already-destroyed cell: no collision, bullet passes through
          }
          var rect = window.SI.Shield.cellRect(shield, c);
          if (window.SI.Collision.aabbOverlap(bulletAabb, toAabb(rect))) {
            cells[c] -= 1;
            if (cells[c] < 0) {
              cells[c] = 0;
            }
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }

    state[bulletsField] = survivors;
  }

  // Bullet-vs-UFO collision (slice-04/05, P4): a player bullet overlapping
  // an ACTIVE ufo (current position, after this step's movement) deactivates
  // it, adds its bonus (> 0) to score, and is consumed. No-op if the ufo
  // isn't active. On a hit, immediately reschedules the next RNG-timed
  // spawn (same as a natural off-screen despawn) so the schedule stays
  // continuous.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var ufoAabb = toAabb(ufo);
    var survivors = [];
    var hit = false;

    for (var i = 0; i < bullets.length; i++) {
      if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        hit = true;
        continue; // consumed
      }
      survivors.push(bullets[i]);
    }

    if (hit) {
      ufo.active = false;
      state.score += ufo.bonus;
      ufoSpawnCounter = 0;
      ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
    }
    state.playerBullets = survivors;
  }

  // UFO spawn-timer + traversal (slice-05, P4): interval-timer cadence,
  // same shape as maybeFireAlienBullet, except the threshold is itself
  // drawn from SI.RNG.next() (SI.Ufo.nextSpawnInterval()) rather than a
  // fixed SI.Config constant — "spawns on an SI.RNG.next()-timed schedule".
  // While active, moves the ufo each step; once it fully exits the field,
  // deactivates it and redraws the next spawn threshold.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var justDespawned = window.SI.Ufo.traverse(ufo, gameWidth);
      if (justDespawned) {
        ufoSpawnCounter = 0;
        ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
      }
      return;
    }

    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnThreshold) {
      return;
    }
    ufoSpawnCounter = 0;
    window.SI.Ufo.spawn(ufo);
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount, wave) (slice-05: wave-aware, linear speedup per wave) —
  // never wall-clock, never scaled by dt's magnitude, so N identical
  // update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    // Shields intercept player bullets before they can reach aliens/ufo
    // (resolved at the bullet's current, already-moved position).
    resolveBulletShieldCollisions(state, 'playerBullets');

    var aliensBefore = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien this
    // step increments the wave and respawns a full 55-alien grid. March
    // state resets so the new grid starts a fresh cadence, reusing
    // marchInterval(aliveCount, wave) below for the new wave's (faster)
    // initial interval.
    if (aliensBefore > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    // Shields intercept alien bullets before they can reach the player.
    resolveBulletShieldCollisions(state, 'alienBullets');

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid) for a fixed wave.
  //
  // Linear wave speedup: each wave's ceiling (maxInterval) is
  // WAVE_MARCH_SPEEDUP_STEP fixed-steps lower than the previous wave's,
  // floor-clamped to 1 — so for a fixed aliveCount, a higher wave never
  // yields a slower (larger) interval, and strictly decreases wave-over-wave
  // while the ceiling hasn't already bottomed out. No state read/written —
  // same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;

    if (wave === undefined) {
      wave = 1;
    }
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL - (wave - 1) * cfg.WAVE_MARCH_SPEEDUP_STEP;
    if (maxInterval < 1) {
      maxInterval = 1;
    }

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

+++ src/collision.js
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

+++ src/config.js
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): shields. Row-major cells, per shield: SHIELD_ROWS *
  // SHIELD_COLS cells, each SHIELD_CELL_WIDTH x SHIELD_CELL_HEIGHT.
  // SHIELD_COUNT shields are spread evenly across gameWidth, deliberately
  // leaving a clear gap centered on the player's default spawn x (classic
  // arrangement, also keeps P1/P2/P3's default straight-up shot lane clear).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 10,
  SHIELD_STARTING_INTEGRITY: 4,
  SHIELD_Y_FROM_BOTTOM: 150, // shield row sits this far above the play field's bottom edge

  // slice-05 (P4): UFO. Spawns on an SI.RNG.next()-timed schedule (interval
  // drawn in [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] fixed-steps),
  // traverses left-to-right across the top of the screen.
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 30,
  UFO_SPEED: 4, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,

  // slice-05 (P4): linear wave speedup. Each wave's full-grid initial march
  // interval is WAVE_MARCH_SPEEDUP_STEP fixed-steps less than the previous
  // wave's (floored at 1), reusing marchInterval's existing ratio math.
  WAVE_MARCH_SPEEDUP_STEP: 6,
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: destructible shields, RNG-timed bonus UFO,
// wave escalation). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Alien fire and UFO spawn
// both use a fixed interval-timer step counter (like the march cadence);
// the UFO's threshold is itself RNG-drawn per spawn cycle. Alien fire uses
// an index-scan over aliens (SI.Alien.frontlineByColumn) to pick the firing
// column.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn schedule (slice-05, P4) — internal only, per the same
  // interval-timer pattern as alienFireCounter above, except the threshold
  // itself is redrawn from SI.RNG.next() (via SI.Ufo.nextSpawnInterval())
  // every time the UFO despawns (whether by leaving the field or by being
  // shot), so the schedule is genuinely "RNG-timed" rather than a fixed
  // cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnThreshold = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height} object
  // present in state[bulletsField] (playerBullets OR alienBullets — both
  // call this) is treated as a live collidable bullet purely by array
  // membership, same TEST-FACING rule as elsewhere, so a bare injected
  // bullet over a cell rect still hits. Checked at the bullet's CURRENT
  // (already-moved) position. Only cells with integrity > 0 participate —
  // a destroyed cell (integrity already 0) no longer blocks anything, so
  // bullets pass through the hole. On a hit: that cell's integrity drops by
  // 1 (floor-clamped at 0, never negative) and the bullet is consumed
  // (removed), checking at most one cell per bullet per step.
  function resolveBulletShieldCollisions(state, bulletsField) {
    var bullets = state[bulletsField];
    if (bullets.length === 0) {
      return;
    }
    var shields = state.shields;
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var bulletAabb = toAabb(bullet);
      var consumed = false;

      for (var s = 0; s < shields.length && !consumed; s++) {
        var shield = shields[s];
        var cells = shield.cells;
        for (var c = 0; c < cells.length; c++) {
          if (cells[c] <= 0) {
            continue; // already-destroyed cell: no collision, bullet passes through
          }
          var rect = window.SI.Shield.cellRect(shield, c);
          if (window.SI.Collision.aabbOverlap(bulletAabb, toAabb(rect))) {
            cells[c] -= 1;
            if (cells[c] < 0) {
              cells[c] = 0;
            }
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }

    state[bulletsField] = survivors;
  }

  // Bullet-vs-UFO collision (slice-04/05, P4): a player bullet overlapping
  // an ACTIVE ufo (current position, after this step's movement) deactivates
  // it, adds its bonus (> 0) to score, and is consumed. No-op if the ufo
  // isn't active. On a hit, immediately reschedules the next RNG-timed
  // spawn (same as a natural off-screen despawn) so the schedule stays
  // continuous.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var ufoAabb = toAabb(ufo);
    var survivors = [];
    var hit = false;

    for (var i = 0; i < bullets.length; i++) {
      if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        hit = true;
        continue; // consumed
      }
      survivors.push(bullets[i]);
    }

    if (hit) {
      ufo.active = false;
      state.score += ufo.bonus;
      ufoSpawnCounter = 0;
      ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
    }
    state.playerBullets = survivors;
  }

  // UFO spawn-timer + traversal (slice-05, P4): interval-timer cadence,
  // same shape as maybeFireAlienBullet, except the threshold is itself
  // drawn from SI.RNG.next() (SI.Ufo.nextSpawnInterval()) rather than a
  // fixed SI.Config constant — "spawns on an SI.RNG.next()-timed schedule".
  // While active, moves the ufo each step; once it fully exits the field,
  // deactivates it and redraws the next spawn threshold.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var justDespawned = window.SI.Ufo.traverse(ufo, gameWidth);
      if (justDespawned) {
        ufoSpawnCounter = 0;
        ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
      }
      return;
    }

    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnThreshold) {
      return;
    }
    ufoSpawnCounter = 0;
    window.SI.Ufo.spawn(ufo);
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount, wave) (slice-05: wave-aware, linear speedup per wave) —
  // never wall-clock, never scaled by dt's magnitude, so N identical
  // update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    // Shields intercept player bullets before they can reach aliens/ufo
    // (resolved at the bullet's current, already-moved position).
    resolveBulletShieldCollisions(state, 'playerBullets');

    var aliensBefore = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien this
    // step increments the wave and respawns a full 55-alien grid. March
    // state resets so the new grid starts a fresh cadence, reusing
    // marchInterval(aliveCount, wave) below for the new wave's (faster)
    // initial interval.
    if (aliensBefore > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    // Shields intercept alien bullets before they can reach the player.
    resolveBulletShieldCollisions(state, 'alienBullets');

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

+++ src/player.js
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

+++ src/rng.js
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

+++ src/shield.js
// SI.Shield — destructible shield factory + pure cell-geometry math
// (slice-05, P4). A shield is {x,y,cells:[integer integrity...]} where
// `cells` is a row-major flat array (SI.Config.SHIELD_ROWS *
// SHIELD_COLS entries). The actual hit resolution (bullet-vs-cell overlap,
// integrity decrement) is orchestrated by SI.Game.update(); this module only
// creates shields and exposes cellRect() as pure geometry math, per the
// TEST-FACING API (tests target a cell via cellRect() without knowing
// internals). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config only.
(function () {
  // cellRect — PURE. Row-major layout: cellIndex = row * cols + col. Returns
  // the {x,y,width,height} rect for that cell in world space, regardless of
  // the cell's current integrity (geometry doesn't depend on state).
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellW = cfg.SHIELD_CELL_WIDTH;
    var cellH = cfg.SHIELD_CELL_HEIGHT;

    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;

    return {
      x: shield.x + col * cellW,
      y: shield.y + row * cellH,
      width: cellW,
      height: cellH,
    };
  }

  // createShields — builds SI.Config.SHIELD_COUNT shields, evenly spaced
  // across gameWidth with equal gaps (including the outer margins), each
  // starting at full SHIELD_STARTING_INTEGRITY per cell. Deliberately leaves
  // a clear central gap (see config.js comment) rather than a shield
  // straddling gameWidth/2.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var cols = cfg.SHIELD_COLS;
    var rows = cfg.SHIELD_ROWS;
    var totalCells = cols * rows;
    var shieldWidth = cols * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap + i * (shieldWidth + gap);
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_STARTING_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

+++ src/ufo.js
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
```

## specimen-B
- **culled because:** gate testPassRate=0.94

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html. Node builtins only (ADR-004).
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order for this slice: rng -> collision -> config -> loop ->
// player -> bullet -> alien -> shield -> ufo -> game. shield.js/ufo.js
// only depend on config.js/rng.js (entity-layer, per conventions.md), so
// they load alongside player/bullet/alien, before game.js.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'game.js',
];

function buildBundle() {
  const parts = MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// ---- src/${name} ----\n` + fs.readFileSync(filePath, 'utf8');
  });
  return parts.join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
${bundle}
</script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle));
}

main();

+++ dist/game.js
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: wave escalation (P4). Each new wave's march ramp is
  // multiplicatively faster than the last: marchInterval's ratio-scaled
  // base is multiplied by MULTIPLIER^(wave-1), ceil'd, floor-clamped to 1.
  ALIEN_MARCH_WAVE_MULTIPLIER: 0.8,

  // slice-05: destructible shields (P4). 2D rows x cols cell grid per
  // shield; SI.Shield.cellRect maps a flat cell index to geometry via
  // row = floor(index/cols), col = index % cols.
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 8,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 6,
  SHIELD_CELL_INTEGRITY: 4, // starting integrity per cell
  SHIELD_Y_FROM_BOTTOM: 150, // shields sit between the alien grid and the player

  // slice-05: UFO tuning (P4). Spawn cadence is an RNG-drawn countdown of
  // fixed update() steps (never wall-clock); bonus is RNG-drawn in
  // [UFO_BONUS_MIN, UFO_BONUS_MAX].
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 20, // px from top, traverses above the alien grid
  UFO_SPEED: 3, // px per fixed step, travels rightward (+x)
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid).
  //
  // Wave escalation (slice-05): the ratio-scaled base interval is then
  // multiplied by ALIEN_MARCH_WAVE_MULTIPLIER^(wave-1) before the final
  // ceil/floor-clamp — a multiplicative speedup, so each new wave's initial
  // (full-grid) interval is strictly less than the previous wave's. No
  // state read/written — same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    if (wave === undefined) {
      wave = 1;
    }

    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var baseInterval = Math.ceil((maxInterval * count) / totalCount);

    var w = wave;
    if (w < 1) {
      w = 1;
    }
    var waveFactor = Math.pow(cfg.ALIEN_MARCH_WAVE_MULTIPLIER, w - 1);

    var interval = Math.ceil(baseInterval * waveFactor);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible-shield factory + pure cell geometry (slice-05,
// P4). Each shield is a flat integrity array over a 2D (rows x cols) cell
// grid; SI.Shield.cellRect maps a flat cell index to on-screen geometry so
// collision/testing code never needs to know the row/col layout directly.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
// Depends on SI.Config only.
(function () {
  // cellRect — PURE. Given a shield ({x,y,cells}) and a flat cell index,
  // returns {x,y,width,height} for that cell using row-major mapping
  // (row = floor(index/cols), col = index % cols) over SI.Config's fixed
  // cell dimensions. No state read/written beyond the passed-in shield.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellWidth = cfg.SHIELD_CELL_WIDTH;
    var cellHeight = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * cellWidth,
      y: shield.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  }

  // createShields — factory for gameState.shields (slice-05, TEST-FACING
  // shape: array of {x,y,cells:[integer integrity...]}). Shields are
  // evenly spaced across gameWidth, positioned SHIELD_Y_FROM_BOTTOM px
  // above the bottom of the field (between the alien grid and the
  // player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap * (i + 1) + shieldWidth * i;
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. UFO spawn uses
// the same fixed interval-timer pattern, but the interval itself is
// RNG-drawn per spawn cycle rather than a config constant.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05) — internal only. Countdown of update()
  // steps until the next spawn, drawn once from SI.RNG.next() (via
  // SI.Ufo.randomSpawnCountdown) at init() and again every time the UFO
  // despawns off the right edge, so the whole spawn cadence is
  // reproducible under a seed.
  var ufoSpawnCountdown = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;
    ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  //
  // Wave transition (slice-05, P4): if this step's kills empty out a
  // non-empty grid, that's "killing the last alive alien" — advance
  // state.wave and respawn a full 55-alien grid, resetting march state
  // (mirrors init()'s reset) so the new wave starts from a clean march
  // cadence/direction.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }
    state.playerBullets = survivingBullets;

    if (aliens.length > 0 && survivingAliens.length === 0) {
      state.wave++;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    } else {
      state.aliens = survivingAliens;
    }
  }

  // Bullet-vs-shield collision (slice-05, P4): index-scans every shield's
  // cells against `bullets` (either state.playerBullets or
  // state.alienBullets — either bullet source can damage a shield, per the
  // contract). Any {x,y,width,height} bullet overlapping a cell's rect
  // (SI.Shield.cellRect) is consumed and that cell's integrity drops by 1,
  // floored at 0 (never negative) — a cell rect keeps colliding even once
  // its integrity has already hit 0, which is exactly the case the
  // contract's explicit floor language is for (repeated hits never go
  // negative). Pure array-membership liveness, same as every other bullet
  // collision in this module — a bare injected bullet still hits. Returns
  // the surviving bullets array (caller replaces wholesale, per ADR-003);
  // shield cell integers are mutated in place (not entity arrays, so
  // in-place mutation is fine here).
  function resolveBulletShieldCollisions(shields, bullets) {
    var consumed = {};

    for (var s = 0; s < shields.length; s++) {
      var shield = shields[s];
      for (var c = 0; c < shield.cells.length; c++) {
        var rect = window.SI.Shield.cellRect(shield, c);
        var rectAabb = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

        for (var b = 0; b < bullets.length; b++) {
          if (consumed[b]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[b]), rectAabb)) {
            shield.cells[c] = Math.max(0, shield.cells[c] - 1);
            consumed[b] = true;
            break;
          }
        }
      }
    }

    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      if (!consumed[i]) {
        survivors.push(bullets[i]);
      }
    }
    return survivors;
  }

  // Bullet-vs-UFO collision (slice-05, P4): a player bullet overlapping the
  // ACTIVE ufo removes it (active=false) and adds its bonus (>0) to score.
  // Array-membership liveness, same as every other bullet collision here —
  // the sealed-test pattern of forcing gameState.ufo={active:true,...} then
  // injecting a bullet works because this reads state.ufo directly, no
  // private fields required.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var hitIdx = -1;
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), toAabb(ufo))) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx === -1) {
      return;
    }

    ufo.active = false;
    state.score += ufo.bonus;

    var survivors = [];
    for (var j = 0; j < bullets.length; j++) {
      if (j !== hitIdx) {
        survivors.push(bullets[j]);
      }
    }
    state.playerBullets = survivors;
  }

  // UFO spawn/traverse/despawn (slice-05, P4): while inactive, counts down
  // an RNG-drawn number of update() steps (never wall-clock) before
  // spawning at the left edge and drawing a fresh RNG-backed bonus. While
  // active, moves at a constant per-step speed (never scaled by dt) until
  // it clears the right edge, then despawns and draws a fresh countdown for
  // the next spawn. Runs AFTER this step's collision checks (mirrors
  // marchGrid running after resolveBulletAlienCollisions) so a
  // test-forced ufo position is exactly what this step's bullet collision
  // saw, undisturbed by movement until the next step.
  function updateUfo(state) {
    var ufo = state.ufo;
    var cfg = window.SI.Config;

    if (!ufo.active) {
      ufoSpawnCountdown--;
      if (ufoSpawnCountdown <= 0) {
        ufo.active = true;
        ufo.width = cfg.UFO_WIDTH;
        ufo.height = cfg.UFO_HEIGHT;
        ufo.x = -cfg.UFO_WIDTH;
        ufo.y = cfg.UFO_Y;
        ufo.bonus = window.SI.Ufo.randomBonus();
      }
      return;
    }

    ufo.x += cfg.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false;
      ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();
    }
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    state.playerBullets = resolveBulletShieldCollisions(state.shields, state.playerBullets);

    resolveBulletAlienCollisions(state);

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    state.alienBullets = resolveBulletShieldCollisions(state.shields, state.alienBullets);

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: wave escalation (P4). Each new wave's march ramp is
  // multiplicatively faster than the last: marchInterval's ratio-scaled
  // base is multiplied by MULTIPLIER^(wave-1), ceil'd, floor-clamped to 1.
  ALIEN_MARCH_WAVE_MULTIPLIER: 0.8,

  // slice-05: destructible shields (P4). 2D rows x cols cell grid per
  // shield; SI.Shield.cellRect maps a flat cell index to geometry via
  // row = floor(index/cols), col = index % cols.
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 8,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 6,
  SHIELD_CELL_INTEGRITY: 4, // starting integrity per cell
  SHIELD_Y_FROM_BOTTOM: 150, // shields sit between the alien grid and the player

  // slice-05: UFO tuning (P4). Spawn cadence is an RNG-drawn countdown of
  // fixed update() steps (never wall-clock); bonus is RNG-drawn in
  // [UFO_BONUS_MIN, UFO_BONUS_MAX].
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 20, // px from top, traverses above the alien grid
  UFO_SPEED: 3, // px per fixed step, travels rightward (+x)
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid).
  //
  // Wave escalation (slice-05): the ratio-scaled base interval is then
  // multiplied by ALIEN_MARCH_WAVE_MULTIPLIER^(wave-1) before the final
  // ceil/floor-clamp — a multiplicative speedup, so each new wave's initial
  // (full-grid) interval is strictly less than the previous wave's. No
  // state read/written — same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    if (wave === undefined) {
      wave = 1;
    }

    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var baseInterval = Math.ceil((maxInterval * count) / totalCount);

    var w = wave;
    if (w < 1) {
      w = 1;
    }
    var waveFactor = Math.pow(cfg.ALIEN_MARCH_WAVE_MULTIPLIER, w - 1);

    var interval = Math.ceil(baseInterval * waveFactor);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible-shield factory + pure cell geometry (slice-05,
// P4). Each shield is a flat integrity array over a 2D (rows x cols) cell
// grid; SI.Shield.cellRect maps a flat cell index to on-screen geometry so
// collision/testing code never needs to know the row/col layout directly.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
// Depends on SI.Config only.
(function () {
  // cellRect — PURE. Given a shield ({x,y,cells}) and a flat cell index,
  // returns {x,y,width,height} for that cell using row-major mapping
  // (row = floor(index/cols), col = index % cols) over SI.Config's fixed
  // cell dimensions. No state read/written beyond the passed-in shield.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellWidth = cfg.SHIELD_CELL_WIDTH;
    var cellHeight = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * cellWidth,
      y: shield.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  }

  // createShields — factory for gameState.shields (slice-05, TEST-FACING
  // shape: array of {x,y,cells:[integer integrity...]}). Shields are
  // evenly spaced across gameWidth, positioned SHIELD_Y_FROM_BOTTOM px
  // above the bottom of the field (between the alien grid and the
  // player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap * (i + 1) + shieldWidth * i;
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. UFO spawn uses
// the same fixed interval-timer pattern, but the interval itself is
// RNG-drawn per spawn cycle rather than a config constant.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05) — internal only. Countdown of update()
  // steps until the next spawn, drawn once from SI.RNG.next() (via
  // SI.Ufo.randomSpawnCountdown) at init() and again every time the UFO
  // despawns off the right edge, so the whole spawn cadence is
  // reproducible under a seed.
  var ufoSpawnCountdown = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;
    ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  //
  // Wave transition (slice-05, P4): if this step's kills empty out a
  // non-empty grid, that's "killing the last alive alien" — advance
  // state.wave and respawn a full 55-alien grid, resetting march state
  // (mirrors init()'s reset) so the new wave starts from a clean march
  // cadence/direction.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }
    state.playerBullets = survivingBullets;

    if (aliens.length > 0 && survivingAliens.length === 0) {
      state.wave++;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    } else {
      state.aliens = survivingAliens;
    }
  }

  // Bullet-vs-shield collision (slice-05, P4): index-scans every shield's
  // cells against `bullets` (either state.playerBullets or
  // state.alienBullets — either bullet source can damage a shield, per the
  // contract). Any {x,y,width,height} bullet overlapping a cell's rect
  // (SI.Shield.cellRect) is consumed and that cell's integrity drops by 1,
  // floored at 0 (never negative) — a cell rect keeps colliding even once
  // its integrity has already hit 0, which is exactly the case the
  // contract's explicit floor language is for (repeated hits never go
  // negative). Pure array-membership liveness, same as every other bullet
  // collision in this module — a bare injected bullet still hits. Returns
  // the surviving bullets array (caller replaces wholesale, per ADR-003);
  // shield cell integers are mutated in place (not entity arrays, so
  // in-place mutation is fine here).
  function resolveBulletShieldCollisions(shields, bullets) {
    var consumed = {};

    for (var s = 0; s < shields.length; s++) {
      var shield = shields[s];
      for (var c = 0; c < shield.cells.length; c++) {
        var rect = window.SI.Shield.cellRect(shield, c);
        var rectAabb = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

        for (var b = 0; b < bullets.length; b++) {
          if (consumed[b]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[b]), rectAabb)) {
            shield.cells[c] = Math.max(0, shield.cells[c] - 1);
            consumed[b] = true;
            break;
          }
        }
      }
    }

    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      if (!consumed[i]) {
        survivors.push(bullets[i]);
      }
    }
    return survivors;
  }

  // Bullet-vs-UFO collision (slice-05, P4): a player bullet overlapping the
  // ACTIVE ufo removes it (active=false) and adds its bonus (>0) to score.
  // Array-membership liveness, same as every other bullet collision here —
  // the sealed-test pattern of forcing gameState.ufo={active:true,...} then
  // injecting a bullet works because this reads state.ufo directly, no
  // private fields required.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var hitIdx = -1;
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), toAabb(ufo))) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx === -1) {
      return;
    }

    ufo.active = false;
    state.score += ufo.bonus;

    var survivors = [];
    for (var j = 0; j < bullets.length; j++) {
      if (j !== hitIdx) {
        survivors.push(bullets[j]);
      }
    }
    state.playerBullets = survivors;
  }

  // UFO spawn/traverse/despawn (slice-05, P4): while inactive, counts down
  // an RNG-drawn number of update() steps (never wall-clock) before
  // spawning at the left edge and drawing a fresh RNG-backed bonus. While
  // active, moves at a constant per-step speed (never scaled by dt) until
  // it clears the right edge, then despawns and draws a fresh countdown for
  // the next spawn. Runs AFTER this step's collision checks (mirrors
  // marchGrid running after resolveBulletAlienCollisions) so a
  // test-forced ufo position is exactly what this step's bullet collision
  // saw, undisturbed by movement until the next step.
  function updateUfo(state) {
    var ufo = state.ufo;
    var cfg = window.SI.Config;

    if (!ufo.active) {
      ufoSpawnCountdown--;
      if (ufoSpawnCountdown <= 0) {
        ufo.active = true;
        ufo.width = cfg.UFO_WIDTH;
        ufo.height = cfg.UFO_HEIGHT;
        ufo.x = -cfg.UFO_WIDTH;
        ufo.y = cfg.UFO_Y;
        ufo.bonus = window.SI.Ufo.randomBonus();
      }
      return;
    }

    ufo.x += cfg.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false;
      ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();
    }
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    state.playerBullets = resolveBulletShieldCollisions(state.shields, state.playerBullets);

    resolveBulletAlienCollisions(state);

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    state.alienBullets = resolveBulletShieldCollisions(state.shields, state.alienBullets);

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (slice-05, P4; defaults to 1 so slice-03
  // callers are unaffected). Ratio-based speed ramp: interval scales
  // linearly with aliveCount/totalCount, ceil'd to stay integer and
  // floor-clamped to 1 so the march never stalls. Monotonically
  // non-increasing as aliveCount drops (fewer aliens -> smaller interval ->
  // faster march), strictly smaller at aliveCount=1 than at
  // aliveCount=totalCount (the classic 55-alien full grid).
  //
  // Wave escalation (slice-05): the ratio-scaled base interval is then
  // multiplied by ALIEN_MARCH_WAVE_MULTIPLIER^(wave-1) before the final
  // ceil/floor-clamp — a multiplicative speedup, so each new wave's initial
  // (full-grid) interval is strictly less than the previous wave's. No
  // state read/written — same input always yields the same output.
  function marchInterval(aliveCount, wave) {
    if (wave === undefined) {
      wave = 1;
    }

    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var baseInterval = Math.ceil((maxInterval * count) / totalCount);

    var w = wave;
    if (w < 1) {
      w = 1;
    }
    var waveFactor = Math.pow(cfg.ALIEN_MARCH_WAVE_MULTIPLIER, w - 1);

    var interval = Math.ceil(baseInterval * waveFactor);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

+++ src/collision.js
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

+++ src/config.js
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: wave escalation (P4). Each new wave's march ramp is
  // multiplicatively faster than the last: marchInterval's ratio-scaled
  // base is multiplied by MULTIPLIER^(wave-1), ceil'd, floor-clamped to 1.
  ALIEN_MARCH_WAVE_MULTIPLIER: 0.8,

  // slice-05: destructible shields (P4). 2D rows x cols cell grid per
  // shield; SI.Shield.cellRect maps a flat cell index to geometry via
  // row = floor(index/cols), col = index % cols.
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 8,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 6,
  SHIELD_CELL_INTEGRITY: 4, // starting integrity per cell
  SHIELD_Y_FROM_BOTTOM: 150, // shields sit between the alien grid and the player

  // slice-05: UFO tuning (P4). Spawn cadence is an RNG-drawn countdown of
  // fixed update() steps (never wall-clock); bonus is RNG-drawn in
  // [UFO_BONUS_MIN, UFO_BONUS_MAX].
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 20, // px from top, traverses above the alien grid
  UFO_SPEED: 3, // px per fixed step, travels rightward (+x)
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. UFO spawn uses
// the same fixed interval-timer pattern, but the interval itself is
// RNG-drawn per spawn cycle rather than a config constant.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05) — internal only. Countdown of update()
  // steps until the next spawn, drawn once from SI.RNG.next() (via
  // SI.Ufo.randomSpawnCountdown) at init() and again every time the UFO
  // despawns off the right edge, so the whole spawn cadence is
  // reproducible under a seed.
  var ufoSpawnCountdown = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;
    ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  //
  // Wave transition (slice-05, P4): if this step's kills empty out a
  // non-empty grid, that's "killing the last alive alien" — advance
  // state.wave and respawn a full 55-alien grid, resetting march state
  // (mirrors init()'s reset) so the new wave starts from a clean march
  // cadence/direction.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }
    state.playerBullets = survivingBullets;

    if (aliens.length > 0 && survivingAliens.length === 0) {
      state.wave++;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    } else {
      state.aliens = survivingAliens;
    }
  }

  // Bullet-vs-shield collision (slice-05, P4): index-scans every shield's
  // cells against `bullets` (either state.playerBullets or
  // state.alienBullets — either bullet source can damage a shield, per the
  // contract). Any {x,y,width,height} bullet overlapping a cell's rect
  // (SI.Shield.cellRect) is consumed and that cell's integrity drops by 1,
  // floored at 0 (never negative) — a cell rect keeps colliding even once
  // its integrity has already hit 0, which is exactly the case the
  // contract's explicit floor language is for (repeated hits never go
  // negative). Pure array-membership liveness, same as every other bullet
  // collision in this module — a bare injected bullet still hits. Returns
  // the surviving bullets array (caller replaces wholesale, per ADR-003);
  // shield cell integers are mutated in place (not entity arrays, so
  // in-place mutation is fine here).
  function resolveBulletShieldCollisions(shields, bullets) {
    var consumed = {};

    for (var s = 0; s < shields.length; s++) {
      var shield = shields[s];
      for (var c = 0; c < shield.cells.length; c++) {
        var rect = window.SI.Shield.cellRect(shield, c);
        var rectAabb = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

        for (var b = 0; b < bullets.length; b++) {
          if (consumed[b]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[b]), rectAabb)) {
            shield.cells[c] = Math.max(0, shield.cells[c] - 1);
            consumed[b] = true;
            break;
          }
        }
      }
    }

    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      if (!consumed[i]) {
        survivors.push(bullets[i]);
      }
    }
    return survivors;
  }

  // Bullet-vs-UFO collision (slice-05, P4): a player bullet overlapping the
  // ACTIVE ufo removes it (active=false) and adds its bonus (>0) to score.
  // Array-membership liveness, same as every other bullet collision here —
  // the sealed-test pattern of forcing gameState.ufo={active:true,...} then
  // injecting a bullet works because this reads state.ufo directly, no
  // private fields required.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var hitIdx = -1;
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), toAabb(ufo))) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx === -1) {
      return;
    }

    ufo.active = false;
    state.score += ufo.bonus;

    var survivors = [];
    for (var j = 0; j < bullets.length; j++) {
      if (j !== hitIdx) {
        survivors.push(bullets[j]);
      }
    }
    state.playerBullets = survivors;
  }

  // UFO spawn/traverse/despawn (slice-05, P4): while inactive, counts down
  // an RNG-drawn number of update() steps (never wall-clock) before
  // spawning at the left edge and drawing a fresh RNG-backed bonus. While
  // active, moves at a constant per-step speed (never scaled by dt) until
  // it clears the right edge, then despawns and draws a fresh countdown for
  // the next spawn. Runs AFTER this step's collision checks (mirrors
  // marchGrid running after resolveBulletAlienCollisions) so a
  // test-forced ufo position is exactly what this step's bullet collision
  // saw, undisturbed by movement until the next step.
  function updateUfo(state) {
    var ufo = state.ufo;
    var cfg = window.SI.Config;

    if (!ufo.active) {
      ufoSpawnCountdown--;
      if (ufoSpawnCountdown <= 0) {
        ufo.active = true;
        ufo.width = cfg.UFO_WIDTH;
        ufo.height = cfg.UFO_HEIGHT;
        ufo.x = -cfg.UFO_WIDTH;
        ufo.y = cfg.UFO_Y;
        ufo.bonus = window.SI.Ufo.randomBonus();
      }
      return;
    }

    ufo.x += cfg.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false;
      ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();
    }
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    state.playerBullets = resolveBulletShieldCollisions(state.shields, state.playerBullets);

    resolveBulletAlienCollisions(state);

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    state.alienBullets = resolveBulletShieldCollisions(state.shields, state.alienBullets);

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

+++ src/player.js
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

+++ src/rng.js
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

+++ src/shield.js
// SI.Shield — destructible-shield factory + pure cell geometry (slice-05,
// P4). Each shield is a flat integrity array over a 2D (rows x cols) cell
// grid; SI.Shield.cellRect maps a flat cell index to on-screen geometry so
// collision/testing code never needs to know the row/col layout directly.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
// Depends on SI.Config only.
(function () {
  // cellRect — PURE. Given a shield ({x,y,cells}) and a flat cell index,
  // returns {x,y,width,height} for that cell using row-major mapping
  // (row = floor(index/cols), col = index % cols) over SI.Config's fixed
  // cell dimensions. No state read/written beyond the passed-in shield.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellWidth = cfg.SHIELD_CELL_WIDTH;
    var cellHeight = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * cellWidth,
      y: shield.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  }

  // createShields — factory for gameState.shields (slice-05, TEST-FACING
  // shape: array of {x,y,cells:[integer integrity...]}). Shields are
  // evenly spaced across gameWidth, positioned SHIELD_Y_FROM_BOTTOM px
  // above the bottom of the field (between the alien grid and the
  // player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap * (i + 1) + shieldWidth * i;
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();

+++ src/ufo.js
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
```

## specimen-C
- **culled because:** gate testPassRate=0.97

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html. Node builtins only (ADR-004).
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order for this slice: rng -> collision -> config -> loop ->
// player -> bullet -> alien -> shield -> ufo -> game (shield.js and ufo.js
// load before game.js, which orchestrates both).
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'game.js',
];

function buildBundle() {
  const parts = MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// ---- src/${name} ----\n` + fs.readFileSync(filePath, 'utf8');
  });
  return parts.join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
${bundle}
</script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle));
}

main();

+++ dist/game.js
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): destructible shields — a fixed grid of cells per shield,
  // each cell tracked as an integer integrity value. Geometry (SI.Shield.cellRect)
  // is pure and derived from these constants + a shield's {x,y} origin only.
  SHIELD_COUNT: 4,
  SHIELD_COLS: 6,
  SHIELD_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_START_INTEGRITY: 4,
  SHIELD_MARGIN_ABOVE_PLAYER: 60, // px gap between shield bottom row and the player's y

  // slice-05 (P4): UFO — RNG-timed spawn schedule (SI.RNG.next() picks both
  // the next spawn delay and, on spawn, the bonus). Travels left-to-right
  // across the top of the screen at a constant per-step speed.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 30,
  UFO_SPEED: 3, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step, inclusive
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step, inclusive

  // slice-05 (P4): table-based per-wave march speedup. Wave 1 reuses
  // ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility); each
  // subsequent wave's full-grid initial interval is strictly smaller,
  // via a precomputed decay table (see SI.Alien.marchInterval).
  WAVE_MARCH_DECAY: 0.85, // per-wave multiplier applied to the max interval
  WAVE_MARCH_MIN_INTERVAL: 3, // table floor — keeps decay from collapsing to 1 too fast
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // waveMarchTable — a precomputed (table-based) lookup of the "full grid"
  // ceiling interval per wave, built lazily on first use. Index 0 = wave 1,
  // reusing ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility). Each
  // later entry is strictly smaller (WAVE_MARCH_DECAY < 1), floored at
  // WAVE_MARCH_MIN_INTERVAL so the decay can't collapse to 1 within just a
  // few waves.
  var WAVE_MARCH_TABLE_SIZE = 64;
  var waveMarchTable = null;

  function buildWaveMarchTable() {
    var cfg = window.SI.Config;
    var base = cfg.ALIEN_MARCH_MAX_INTERVAL;
    var decay = cfg.WAVE_MARCH_DECAY;
    var minInterval = cfg.WAVE_MARCH_MIN_INTERVAL;

    return Array.from({ length: WAVE_MARCH_TABLE_SIZE }, function (_unused, i) {
      var value = Math.ceil(base * Math.pow(decay, i));
      return value < minInterval ? minInterval : value;
    });
  }

  function maxIntervalForWave(wave) {
    if (waveMarchTable === null) {
      waveMarchTable = buildWaveMarchTable();
    }
    var w = wave;
    if (typeof w !== 'number' || w < 1) {
      w = 1;
    }
    var idx = w - 1;
    if (idx >= waveMarchTable.length) {
      idx = waveMarchTable.length - 1;
    }
    return waveMarchTable[idx];
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (defaults to 1, so slice-03 callers that
  // only pass aliveCount are unaffected). Ratio-based speed ramp: interval
  // scales linearly with aliveCount/totalCount against a per-wave ceiling
  // (see waveMarchTable), ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march) for a fixed
  // wave, and strictly decreasing in wave for a fixed aliveCount — in
  // particular the full 55-alien grid's initial interval for wave N+1 is
  // always smaller than wave N's. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = maxIntervalForWave(wave === undefined ? 1 : wave);

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible shield factory + pure cell geometry + a
// functional bullet-vs-shield resolver (slice-05, P4). No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config (cell/grid sizing) and SI.Collision (aabb overlap) only.
(function () {
  // Bridges an {x,y,width,height}-shaped entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the source object.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // cellRect — PURE. Given a shield ({x,y,cells}) and a cell index, returns
  // that cell's {x,y,width,height} geometry. Cells are laid out row-major
  // (SHIELD_COLS wide) starting at the shield's own {x,y} origin. Does not
  // read/require cells[cellIndex] itself — geometry is independent of
  // integrity, so tests can target a cell rect without knowing internals.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var col = cellIndex % cols;
    var row = Math.floor(cellIndex / cols);
    return {
      x: shield.x + col * cfg.SHIELD_CELL_WIDTH,
      y: shield.y + row * cfg.SHIELD_CELL_HEIGHT,
      width: cfg.SHIELD_CELL_WIDTH,
      height: cfg.SHIELD_CELL_HEIGHT,
    };
  }

  // createShields — factory. Spaces SI.Config.SHIELD_COUNT shields evenly
  // across [0, gameWidth], row-of-cells sitting just above the player, each
  // cell starting at SHIELD_START_INTEGRITY.
  function createShields(gameWidth, playerY) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_COLS * cfg.SHIELD_ROWS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var shieldHeight = cfg.SHIELD_ROWS * cfg.SHIELD_CELL_HEIGHT;
    var y = playerY - cfg.SHIELD_MARGIN_ABOVE_PLAYER - shieldHeight;
    var spacing = gameWidth / (count + 1);

    return Array.from({ length: count }, function (_unused, i) {
      return {
        x: spacing * (i + 1) - shieldWidth / 2,
        y: y,
        cells: Array.from({ length: totalCells }, function () {
          return cfg.SHIELD_START_INTEGRITY;
        }),
      };
    });
  }

  // resolveBulletHits — PURE functional pipeline. Given the current
  // `shields` array and a `bullets` array (player OR alien bullets — either
  // is treated as a live collidable bullet purely by array membership, per
  // the TEST-FACING API, so a bare injected bullet still hits), returns a
  // NEW {shields, bullets} pair: any bullet overlapping a cell rect
  // decrements that cell's integrity by one (floored at 0, never negative)
  // and is removed from the surviving bullets. Cell geometry persists even
  // once a cell's integrity has reached 0 (it still blocks/consumes
  // bullets — only the integrity number is clamped, not the cell itself).
  // At most one bullet is consumed per cell per call, scanning cells in
  // index order.
  function resolveBulletHits(shields, bullets) {
    var consumed = bullets.map(function () {
      return false;
    });

    var newShields = shields.map(function (shield) {
      var newCells = shield.cells.slice();

      for (var cellIndex = 0; cellIndex < newCells.length; cellIndex++) {
        var rect = cellRect(shield, cellIndex);
        var rectAabb = toAabb(rect);

        for (var bi = 0; bi < bullets.length; bi++) {
          if (consumed[bi]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[bi]), rectAabb)) {
            newCells[cellIndex] = Math.max(0, newCells[cellIndex] - 1);
            consumed[bi] = true;
            break; // this cell took its one hit this call; move to the next cell
          }
        }
      }

      return { x: shield.x, y: shield.y, cells: newCells };
    });

    var survivingBullets = bullets.filter(function (_bullet, bi) {
      return !consumed[bi];
    });

    return { shields: newShields, bullets: survivingBullets };
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
    resolveBulletHits: resolveBulletHits,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: waves, destructible shields, bonus UFO).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays for the pre-existing P1/P3 logic (unchanged), thin orchestration
// wrappers around the FUNCTIONAL SI.Shield/SI.Ufo pure pipelines for the
// new P4 logic — those modules do the map/filter/reduce work, game.js just
// wires their {before} -> {after} results back onto gameState fields.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05, P4) — internal only, same interval-timer
  // shape as alienFireCounter, except the interval itself is re-rolled via
  // SI.RNG.next() (SI.Ufo.randomSpawnDelay()) every time a new target is
  // picked, rather than a fixed constant — an "RNG-timed schedule" rather
  // than a fixed cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnTarget = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, state.player.y);
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Wave transition (slice-05, P4): killing the last alive alien empties
  // state.aliens this step; when that happens, bump the wave counter and
  // respawn a full 55-alien grid. March state resets to a fresh grid's
  // starting condition so the new wave's march begins cleanly (not
  // mid-drop or offset by the counter left over from the previous wave).
  function checkWaveTransition(state) {
    if (state.aliens.length > 0) {
      return; // grid not empty (or already respawned this step) -> no-op
    }
    state.wave += 1;
    state.aliens = window.SI.Alien.createGrid();
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
  }

  // Shield resolution (slice-05, P4): thin orchestration wrapper around the
  // pure functional SI.Shield.resolveBulletHits pipeline — takes the
  // current shields + one bullet array (player or alien, called once per
  // array so a single bullet can't be double-consumed across both), writes
  // back the (possibly damaged) shields and the surviving bullets via
  // wholesale array replacement (per ADR-003).
  function resolveShieldHits(state, bulletsField) {
    var result = window.SI.Shield.resolveBulletHits(state.shields, state[bulletsField]);
    state.shields = result.shields;
    state[bulletsField] = result.bullets;
  }

  // UFO spawn (slice-05, P4): RNG-timed interval-timer — counts fixed
  // steps while no UFO is active and compares against a target re-rolled
  // via SI.Ufo.randomSpawnDelay() (one SI.RNG.next() call) each time a new
  // target is needed. While a UFO is active the counter is left alone (no
  // second UFO stacks on top of one already flying).
  function maybeSpawnUfo(state) {
    if (state.ufo.active) {
      return;
    }
    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnTarget) {
      return;
    }
    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();
    state.ufo = window.SI.Ufo.spawn();
  }

  // UFO traversal (slice-05, P4): constant per-step displacement (never
  // scaled by dt's magnitude), delegated to the pure SI.Ufo.move().
  function moveUfo(state) {
    if (!state.ufo.active) {
      return;
    }
    state.ufo = window.SI.Ufo.move(state.ufo, gameWidth);
  }

  // Player-bullet-vs-UFO resolution (slice-05, P4): delegates to the pure
  // SI.Ufo.resolvePlayerBulletHit pipeline, then writes back the
  // (possibly deactivated) ufo, the surviving playerBullets, and adds the
  // bonus (> 0) to score on a hit.
  function resolveUfoHit(state) {
    var result = window.SI.Ufo.resolvePlayerBulletHit(state.ufo, state.playerBullets);
    state.ufo = result.ufo;
    state.playerBullets = result.bullets;
    state.score += result.scoreDelta;
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    // slice-05 (P4): UFO + shield hit-checks run on playerBullets' CURRENT
    // position, before this step's movement — so a bullet injected (or
    // freshly spawned) exactly over a target rect is guaranteed to overlap
    // it that same update() call regardless of the bullet's own size versus
    // the per-step travel distance (unlike the post-move alien-collision
    // check below, which relies on aliens being taller than one bullet
    // step). Equivalent, across ticks, to checking every position a bullet
    // ever occupies exactly once.
    resolveUfoHit(state);
    resolveShieldHits(state, 'playerBullets');

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    resolveBulletAlienCollisions(state);

    checkWaveTransition(state);

    marchGrid(state);

    maybeSpawnUfo(state);
    moveUfo(state);

    maybeFireAlienBullet(state);

    // slice-05 (P4): shield hit-check for alienBullets, same pre-move
    // rationale as the playerBullets check above.
    resolveShieldHits(state, 'alienBullets');

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    resolveAlienBulletPlayerCollisions(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
// ---- src/rng.js ----
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): destructible shields — a fixed grid of cells per shield,
  // each cell tracked as an integer integrity value. Geometry (SI.Shield.cellRect)
  // is pure and derived from these constants + a shield's {x,y} origin only.
  SHIELD_COUNT: 4,
  SHIELD_COLS: 6,
  SHIELD_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_START_INTEGRITY: 4,
  SHIELD_MARGIN_ABOVE_PLAYER: 60, // px gap between shield bottom row and the player's y

  // slice-05 (P4): UFO — RNG-timed spawn schedule (SI.RNG.next() picks both
  // the next spawn delay and, on spawn, the bonus). Travels left-to-right
  // across the top of the screen at a constant per-step speed.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 30,
  UFO_SPEED: 3, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step, inclusive
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step, inclusive

  // slice-05 (P4): table-based per-wave march speedup. Wave 1 reuses
  // ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility); each
  // subsequent wave's full-grid initial interval is strictly smaller,
  // via a precomputed decay table (see SI.Alien.marchInterval).
  WAVE_MARCH_DECAY: 0.85, // per-wave multiplier applied to the max interval
  WAVE_MARCH_MIN_INTERVAL: 3, // table floor — keeps decay from collapsing to 1 too fast
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

// ---- src/player.js ----
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

// ---- src/bullet.js ----
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // waveMarchTable — a precomputed (table-based) lookup of the "full grid"
  // ceiling interval per wave, built lazily on first use. Index 0 = wave 1,
  // reusing ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility). Each
  // later entry is strictly smaller (WAVE_MARCH_DECAY < 1), floored at
  // WAVE_MARCH_MIN_INTERVAL so the decay can't collapse to 1 within just a
  // few waves.
  var WAVE_MARCH_TABLE_SIZE = 64;
  var waveMarchTable = null;

  function buildWaveMarchTable() {
    var cfg = window.SI.Config;
    var base = cfg.ALIEN_MARCH_MAX_INTERVAL;
    var decay = cfg.WAVE_MARCH_DECAY;
    var minInterval = cfg.WAVE_MARCH_MIN_INTERVAL;

    return Array.from({ length: WAVE_MARCH_TABLE_SIZE }, function (_unused, i) {
      var value = Math.ceil(base * Math.pow(decay, i));
      return value < minInterval ? minInterval : value;
    });
  }

  function maxIntervalForWave(wave) {
    if (waveMarchTable === null) {
      waveMarchTable = buildWaveMarchTable();
    }
    var w = wave;
    if (typeof w !== 'number' || w < 1) {
      w = 1;
    }
    var idx = w - 1;
    if (idx >= waveMarchTable.length) {
      idx = waveMarchTable.length - 1;
    }
    return waveMarchTable[idx];
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (defaults to 1, so slice-03 callers that
  // only pass aliveCount are unaffected). Ratio-based speed ramp: interval
  // scales linearly with aliveCount/totalCount against a per-wave ceiling
  // (see waveMarchTable), ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march) for a fixed
  // wave, and strictly decreasing in wave for a fixed aliveCount — in
  // particular the full 55-alien grid's initial interval for wave N+1 is
  // always smaller than wave N's. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = maxIntervalForWave(wave === undefined ? 1 : wave);

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

// ---- src/shield.js ----
// SI.Shield — destructible shield factory + pure cell geometry + a
// functional bullet-vs-shield resolver (slice-05, P4). No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config (cell/grid sizing) and SI.Collision (aabb overlap) only.
(function () {
  // Bridges an {x,y,width,height}-shaped entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the source object.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // cellRect — PURE. Given a shield ({x,y,cells}) and a cell index, returns
  // that cell's {x,y,width,height} geometry. Cells are laid out row-major
  // (SHIELD_COLS wide) starting at the shield's own {x,y} origin. Does not
  // read/require cells[cellIndex] itself — geometry is independent of
  // integrity, so tests can target a cell rect without knowing internals.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var col = cellIndex % cols;
    var row = Math.floor(cellIndex / cols);
    return {
      x: shield.x + col * cfg.SHIELD_CELL_WIDTH,
      y: shield.y + row * cfg.SHIELD_CELL_HEIGHT,
      width: cfg.SHIELD_CELL_WIDTH,
      height: cfg.SHIELD_CELL_HEIGHT,
    };
  }

  // createShields — factory. Spaces SI.Config.SHIELD_COUNT shields evenly
  // across [0, gameWidth], row-of-cells sitting just above the player, each
  // cell starting at SHIELD_START_INTEGRITY.
  function createShields(gameWidth, playerY) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_COLS * cfg.SHIELD_ROWS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var shieldHeight = cfg.SHIELD_ROWS * cfg.SHIELD_CELL_HEIGHT;
    var y = playerY - cfg.SHIELD_MARGIN_ABOVE_PLAYER - shieldHeight;
    var spacing = gameWidth / (count + 1);

    return Array.from({ length: count }, function (_unused, i) {
      return {
        x: spacing * (i + 1) - shieldWidth / 2,
        y: y,
        cells: Array.from({ length: totalCells }, function () {
          return cfg.SHIELD_START_INTEGRITY;
        }),
      };
    });
  }

  // resolveBulletHits — PURE functional pipeline. Given the current
  // `shields` array and a `bullets` array (player OR alien bullets — either
  // is treated as a live collidable bullet purely by array membership, per
  // the TEST-FACING API, so a bare injected bullet still hits), returns a
  // NEW {shields, bullets} pair: any bullet overlapping a cell rect
  // decrements that cell's integrity by one (floored at 0, never negative)
  // and is removed from the surviving bullets. Cell geometry persists even
  // once a cell's integrity has reached 0 (it still blocks/consumes
  // bullets — only the integrity number is clamped, not the cell itself).
  // At most one bullet is consumed per cell per call, scanning cells in
  // index order.
  function resolveBulletHits(shields, bullets) {
    var consumed = bullets.map(function () {
      return false;
    });

    var newShields = shields.map(function (shield) {
      var newCells = shield.cells.slice();

      for (var cellIndex = 0; cellIndex < newCells.length; cellIndex++) {
        var rect = cellRect(shield, cellIndex);
        var rectAabb = toAabb(rect);

        for (var bi = 0; bi < bullets.length; bi++) {
          if (consumed[bi]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[bi]), rectAabb)) {
            newCells[cellIndex] = Math.max(0, newCells[cellIndex] - 1);
            consumed[bi] = true;
            break; // this cell took its one hit this call; move to the next cell
          }
        }
      }

      return { x: shield.x, y: shield.y, cells: newCells };
    });

    var survivingBullets = bullets.filter(function (_bullet, bi) {
      return !consumed[bi];
    });

    return { shields: newShields, bullets: survivingBullets };
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
    resolveBulletHits: resolveBulletHits,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: waves, destructible shields, bonus UFO).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays for the pre-existing P1/P3 logic (unchanged), thin orchestration
// wrappers around the FUNCTIONAL SI.Shield/SI.Ufo pure pipelines for the
// new P4 logic — those modules do the map/filter/reduce work, game.js just
// wires their {before} -> {after} results back onto gameState fields.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05, P4) — internal only, same interval-timer
  // shape as alienFireCounter, except the interval itself is re-rolled via
  // SI.RNG.next() (SI.Ufo.randomSpawnDelay()) every time a new target is
  // picked, rather than a fixed constant — an "RNG-timed schedule" rather
  // than a fixed cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnTarget = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, state.player.y);
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Wave transition (slice-05, P4): killing the last alive alien empties
  // state.aliens this step; when that happens, bump the wave counter and
  // respawn a full 55-alien grid. March state resets to a fresh grid's
  // starting condition so the new wave's march begins cleanly (not
  // mid-drop or offset by the counter left over from the previous wave).
  function checkWaveTransition(state) {
    if (state.aliens.length > 0) {
      return; // grid not empty (or already respawned this step) -> no-op
    }
    state.wave += 1;
    state.aliens = window.SI.Alien.createGrid();
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
  }

  // Shield resolution (slice-05, P4): thin orchestration wrapper around the
  // pure functional SI.Shield.resolveBulletHits pipeline — takes the
  // current shields + one bullet array (player or alien, called once per
  // array so a single bullet can't be double-consumed across both), writes
  // back the (possibly damaged) shields and the surviving bullets via
  // wholesale array replacement (per ADR-003).
  function resolveShieldHits(state, bulletsField) {
    var result = window.SI.Shield.resolveBulletHits(state.shields, state[bulletsField]);
    state.shields = result.shields;
    state[bulletsField] = result.bullets;
  }

  // UFO spawn (slice-05, P4): RNG-timed interval-timer — counts fixed
  // steps while no UFO is active and compares against a target re-rolled
  // via SI.Ufo.randomSpawnDelay() (one SI.RNG.next() call) each time a new
  // target is needed. While a UFO is active the counter is left alone (no
  // second UFO stacks on top of one already flying).
  function maybeSpawnUfo(state) {
    if (state.ufo.active) {
      return;
    }
    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnTarget) {
      return;
    }
    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();
    state.ufo = window.SI.Ufo.spawn();
  }

  // UFO traversal (slice-05, P4): constant per-step displacement (never
  // scaled by dt's magnitude), delegated to the pure SI.Ufo.move().
  function moveUfo(state) {
    if (!state.ufo.active) {
      return;
    }
    state.ufo = window.SI.Ufo.move(state.ufo, gameWidth);
  }

  // Player-bullet-vs-UFO resolution (slice-05, P4): delegates to the pure
  // SI.Ufo.resolvePlayerBulletHit pipeline, then writes back the
  // (possibly deactivated) ufo, the surviving playerBullets, and adds the
  // bonus (> 0) to score on a hit.
  function resolveUfoHit(state) {
    var result = window.SI.Ufo.resolvePlayerBulletHit(state.ufo, state.playerBullets);
    state.ufo = result.ufo;
    state.playerBullets = result.bullets;
    state.score += result.scoreDelta;
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    // slice-05 (P4): UFO + shield hit-checks run on playerBullets' CURRENT
    // position, before this step's movement — so a bullet injected (or
    // freshly spawned) exactly over a target rect is guaranteed to overlap
    // it that same update() call regardless of the bullet's own size versus
    // the per-step travel distance (unlike the post-move alien-collision
    // check below, which relies on aliens being taller than one bullet
    // step). Equivalent, across ticks, to checking every position a bullet
    // ever occupies exactly once.
    resolveUfoHit(state);
    resolveShieldHits(state, 'playerBullets');

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    resolveBulletAlienCollisions(state);

    checkWaveTransition(state);

    marchGrid(state);

    maybeSpawnUfo(state);
    moveUfo(state);

    maybeFireAlienBullet(state);

    // slice-05 (P4): shield hit-check for alienBullets, same pre-move
    // rationale as the playerBullets check above.
    resolveShieldHits(state, 'alienBullets');

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    resolveAlienBulletPlayerCollisions(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // waveMarchTable — a precomputed (table-based) lookup of the "full grid"
  // ceiling interval per wave, built lazily on first use. Index 0 = wave 1,
  // reusing ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility). Each
  // later entry is strictly smaller (WAVE_MARCH_DECAY < 1), floored at
  // WAVE_MARCH_MIN_INTERVAL so the decay can't collapse to 1 within just a
  // few waves.
  var WAVE_MARCH_TABLE_SIZE = 64;
  var waveMarchTable = null;

  function buildWaveMarchTable() {
    var cfg = window.SI.Config;
    var base = cfg.ALIEN_MARCH_MAX_INTERVAL;
    var decay = cfg.WAVE_MARCH_DECAY;
    var minInterval = cfg.WAVE_MARCH_MIN_INTERVAL;

    return Array.from({ length: WAVE_MARCH_TABLE_SIZE }, function (_unused, i) {
      var value = Math.ceil(base * Math.pow(decay, i));
      return value < minInterval ? minInterval : value;
    });
  }

  function maxIntervalForWave(wave) {
    if (waveMarchTable === null) {
      waveMarchTable = buildWaveMarchTable();
    }
    var w = wave;
    if (typeof w !== 'number' || w < 1) {
      w = 1;
    }
    var idx = w - 1;
    if (idx >= waveMarchTable.length) {
      idx = waveMarchTable.length - 1;
    }
    return waveMarchTable[idx];
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (defaults to 1, so slice-03 callers that
  // only pass aliveCount are unaffected). Ratio-based speed ramp: interval
  // scales linearly with aliveCount/totalCount against a per-wave ceiling
  // (see waveMarchTable), ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march) for a fixed
  // wave, and strictly decreasing in wave for a fixed aliveCount — in
  // particular the full 55-alien grid's initial interval for wave N+1 is
  // always smaller than wave N's. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = maxIntervalForWave(wave === undefined ? 1 : wave);

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();

+++ src/collision.js
// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();

+++ src/config.js
// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05 (P4): destructible shields — a fixed grid of cells per shield,
  // each cell tracked as an integer integrity value. Geometry (SI.Shield.cellRect)
  // is pure and derived from these constants + a shield's {x,y} origin only.
  SHIELD_COUNT: 4,
  SHIELD_COLS: 6,
  SHIELD_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_START_INTEGRITY: 4,
  SHIELD_MARGIN_ABOVE_PLAYER: 60, // px gap between shield bottom row and the player's y

  // slice-05 (P4): UFO — RNG-timed spawn schedule (SI.RNG.next() picks both
  // the next spawn delay and, on spawn, the bonus). Travels left-to-right
  // across the top of the screen at a constant per-step speed.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 30,
  UFO_SPEED: 3, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step, inclusive
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step, inclusive

  // slice-05 (P4): table-based per-wave march speedup. Wave 1 reuses
  // ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility); each
  // subsequent wave's full-grid initial interval is strictly smaller,
  // via a precomputed decay table (see SI.Alien.marchInterval).
  WAVE_MARCH_DECAY: 0.85, // per-wave multiplier applied to the max interval
  WAVE_MARCH_MIN_INTERVAL: 3, // table floor — keeps decay from collapsing to 1 too fast
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: waves, destructible shields, bonus UFO).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays for the pre-existing P1/P3 logic (unchanged), thin orchestration
// wrappers around the FUNCTIONAL SI.Shield/SI.Ufo pure pipelines for the
// new P4 logic — those modules do the map/filter/reduce work, game.js just
// wires their {before} -> {after} results back onto gameState fields.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05, P4) — internal only, same interval-timer
  // shape as alienFireCounter, except the interval itself is re-rolled via
  // SI.RNG.next() (SI.Ufo.randomSpawnDelay()) every time a new target is
  // picked, rather than a fixed constant — an "RNG-timed schedule" rather
  // than a fixed cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnTarget = 0;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = window.SI.Shield.createShields(gameWidth, state.player.y);
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Wave transition (slice-05, P4): killing the last alive alien empties
  // state.aliens this step; when that happens, bump the wave counter and
  // respawn a full 55-alien grid. March state resets to a fresh grid's
  // starting condition so the new wave's march begins cleanly (not
  // mid-drop or offset by the counter left over from the previous wave).
  function checkWaveTransition(state) {
    if (state.aliens.length > 0) {
      return; // grid not empty (or already respawned this step) -> no-op
    }
    state.wave += 1;
    state.aliens = window.SI.Alien.createGrid();
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
  }

  // Shield resolution (slice-05, P4): thin orchestration wrapper around the
  // pure functional SI.Shield.resolveBulletHits pipeline — takes the
  // current shields + one bullet array (player or alien, called once per
  // array so a single bullet can't be double-consumed across both), writes
  // back the (possibly damaged) shields and the surviving bullets via
  // wholesale array replacement (per ADR-003).
  function resolveShieldHits(state, bulletsField) {
    var result = window.SI.Shield.resolveBulletHits(state.shields, state[bulletsField]);
    state.shields = result.shields;
    state[bulletsField] = result.bullets;
  }

  // UFO spawn (slice-05, P4): RNG-timed interval-timer — counts fixed
  // steps while no UFO is active and compares against a target re-rolled
  // via SI.Ufo.randomSpawnDelay() (one SI.RNG.next() call) each time a new
  // target is needed. While a UFO is active the counter is left alone (no
  // second UFO stacks on top of one already flying).
  function maybeSpawnUfo(state) {
    if (state.ufo.active) {
      return;
    }
    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnTarget) {
      return;
    }
    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();
    state.ufo = window.SI.Ufo.spawn();
  }

  // UFO traversal (slice-05, P4): constant per-step displacement (never
  // scaled by dt's magnitude), delegated to the pure SI.Ufo.move().
  function moveUfo(state) {
    if (!state.ufo.active) {
      return;
    }
    state.ufo = window.SI.Ufo.move(state.ufo, gameWidth);
  }

  // Player-bullet-vs-UFO resolution (slice-05, P4): delegates to the pure
  // SI.Ufo.resolvePlayerBulletHit pipeline, then writes back the
  // (possibly deactivated) ufo, the surviving playerBullets, and adds the
  // bonus (> 0) to score on a hit.
  function resolveUfoHit(state) {
    var result = window.SI.Ufo.resolvePlayerBulletHit(state.ufo, state.playerBullets);
    state.ufo = result.ufo;
    state.playerBullets = result.bullets;
    state.score += result.scoreDelta;
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    // slice-05 (P4): UFO + shield hit-checks run on playerBullets' CURRENT
    // position, before this step's movement — so a bullet injected (or
    // freshly spawned) exactly over a target rect is guaranteed to overlap
    // it that same update() call regardless of the bullet's own size versus
    // the per-step travel distance (unlike the post-move alien-collision
    // check below, which relies on aliens being taller than one bullet
    // step). Equivalent, across ticks, to checking every position a bullet
    // ever occupies exactly once.
    resolveUfoHit(state);
    resolveShieldHits(state, 'playerBullets');

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    resolveBulletAlienCollisions(state);

    checkWaveTransition(state);

    marchGrid(state);

    maybeSpawnUfo(state);
    moveUfo(state);

    maybeFireAlienBullet(state);

    // slice-05 (P4): shield hit-check for alienBullets, same pre-move
    // rationale as the playerBullets check above.
    resolveShieldHits(state, 'alienBullets');

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    resolveAlienBulletPlayerCollisions(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002).
// Depends on SI.Game.update(dt) and SI.Renderer.draw() (may be stubs at this
// layer; real implementations land in a later slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var delta = now - lastTime;
    lastTime = now;

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls.
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw();

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
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

+++ src/player.js
// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();

+++ src/rng.js
// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();

+++ src/shield.js
// SI.Shield — destructible shield factory + pure cell geometry + a
// functional bullet-vs-shield resolver (slice-05, P4). No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config (cell/grid sizing) and SI.Collision (aabb overlap) only.
(function () {
  // Bridges an {x,y,width,height}-shaped entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the source object.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // cellRect — PURE. Given a shield ({x,y,cells}) and a cell index, returns
  // that cell's {x,y,width,height} geometry. Cells are laid out row-major
  // (SHIELD_COLS wide) starting at the shield's own {x,y} origin. Does not
  // read/require cells[cellIndex] itself — geometry is independent of
  // integrity, so tests can target a cell rect without knowing internals.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var col = cellIndex % cols;
    var row = Math.floor(cellIndex / cols);
    return {
      x: shield.x + col * cfg.SHIELD_CELL_WIDTH,
      y: shield.y + row * cfg.SHIELD_CELL_HEIGHT,
      width: cfg.SHIELD_CELL_WIDTH,
      height: cfg.SHIELD_CELL_HEIGHT,
    };
  }

  // createShields — factory. Spaces SI.Config.SHIELD_COUNT shields evenly
  // across [0, gameWidth], row-of-cells sitting just above the player, each
  // cell starting at SHIELD_START_INTEGRITY.
  function createShields(gameWidth, playerY) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_COLS * cfg.SHIELD_ROWS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var shieldHeight = cfg.SHIELD_ROWS * cfg.SHIELD_CELL_HEIGHT;
    var y = playerY - cfg.SHIELD_MARGIN_ABOVE_PLAYER - shieldHeight;
    var spacing = gameWidth / (count + 1);

    return Array.from({ length: count }, function (_unused, i) {
      return {
        x: spacing * (i + 1) - shieldWidth / 2,
        y: y,
        cells: Array.from({ length: totalCells }, function () {
          return cfg.SHIELD_START_INTEGRITY;
        }),
      };
    });
  }

  // resolveBulletHits — PURE functional pipeline. Given the current
  // `shields` array and a `bullets` array (player OR alien bullets — either
  // is treated as a live collidable bullet purely by array membership, per
  // the TEST-FACING API, so a bare injected bullet still hits), returns a
  // NEW {shields, bullets} pair: any bullet overlapping a cell rect
  // decrements that cell's integrity by one (floored at 0, never negative)
  // and is removed from the surviving bullets. Cell geometry persists even
  // once a cell's integrity has reached 0 (it still blocks/consumes
  // bullets — only the integrity number is clamped, not the cell itself).
  // At most one bullet is consumed per cell per call, scanning cells in
  // index order.
  function resolveBulletHits(shields, bullets) {
    var consumed = bullets.map(function () {
      return false;
    });

    var newShields = shields.map(function (shield) {
      var newCells = shield.cells.slice();

      for (var cellIndex = 0; cellIndex < newCells.length; cellIndex++) {
        var rect = cellRect(shield, cellIndex);
        var rectAabb = toAabb(rect);

        for (var bi = 0; bi < bullets.length; bi++) {
          if (consumed[bi]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[bi]), rectAabb)) {
            newCells[cellIndex] = Math.max(0, newCells[cellIndex] - 1);
            consumed[bi] = true;
            break; // this cell took its one hit this call; move to the next cell
          }
        }
      }

      return { x: shield.x, y: shield.y, cells: newCells };
    });

    var survivingBullets = bullets.filter(function (_bullet, bi) {
      return !consumed[bi];
    });

    return { shields: newShields, bullets: survivingBullets };
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
    resolveBulletHits: resolveBulletHits,
  };
})();

+++ src/ufo.js
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
```
