---
summary: "Pressure log slice-03: 3 culled."
---

# Pressure log — slice-03

## specimen-A
- **culled because:** gate testPassRate=1.00

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
// player -> bullet -> alien -> game.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — static 5x11 alien grid factory, plus the PURE march-cadence
// formula (SI.Alien.marchInterval) consumed by SI.Game.update() to drive
// rigid-block horizontal march (slice-03, P2). No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // March cadence (TEST-FACING, slice-03/P2): PURE, integer, positive,
  // monotonically NON-INCREASING as aliveCount drops from full strength to 1
  // (fewer survivors -> faster marching). Linear interpolation between a slow
  // interval at full strength and a fast (1-step) interval with a single
  // alien left. FULL_STRENGTH is read from SI.Config once at module-load
  // time (not per call) so the function itself stays a pure computation of
  // its one argument.
  var MARCH_INTERVAL_BASE = 30; // update()-call steps between marches at full strength
  var FULL_STRENGTH = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;

  function marchInterval(aliveCount) {
    var n = aliveCount > 0 ? aliveCount : 0;
    var interval = Math.round((MARCH_INTERVAL_BASE * n) / FULL_STRENGTH);
    return interval < 1 ? 1 : interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with count-driven cadence, edge-drop and
// reverse). Strategy: imperative index-loop update over struct-of-arrays-
// style entity arrays (plain objects, indexed for-loops, no functional
// chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (slice-03/P2). Internal SI.Game state, observable only via
  // alien positions across steps (per the slice-03 contract) — never part
  // of the gameState field shape.
  var MARCH_STEP_X = 10; // px every alive alien moves per march step (rigid block, same dx for all)
  var MARCH_ROW_STEP = 20; // px the whole grid drops on edge contact

  var marchDirection = 1; // 1 = rightward, -1 = leftward
  var marchStepCounter = 0; // counts SI.Game.update() calls since the last march step (never wall-clock)
  var marchPendingDrop = false; // latched when a march step touches a screen edge, consumed on the NEXT march step

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchStepCounter = 0;
    marchPendingDrop = false;

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

  // Advances the alien grid by exactly one march step (slice-03/P2):
  // - If the previous march step touched a screen edge, this step consumes
  //   the pending-drop flag instead of moving horizontally: the whole grid
  //   steps down by MARCH_ROW_STEP and the horizontal direction reverses.
  // - Otherwise, every alive alien moves by the SAME signed x-delta (rigid
  //   block), then edge contact (either boundary) latches the pending-drop
  //   flag for the next march step.
  // Never reads dt or wall-clock time — cadence is driven purely by the
  // update()-call counter in update() below.
  function marchGrid(state) {
    var aliens = state.aliens;

    if (marchPendingDrop) {
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += MARCH_ROW_STEP;
      }
      return;
    }

    var dx = marchDirection * MARCH_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var hitEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        hitEdge = true;
        break;
      }
    }
    if (hitEdge) {
      marchPendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn/march logic here is a
  // constant per-step delta driven by call count, never scaled by dt's
  // magnitude and never read from the wall clock.
  function update(dt) {
    var state = window.SI.Game.state;
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

    // March cadence: an internal counter incremented once per update() call
    // (never wall-clock, never scaled by dt), compared against
    // SI.Alien.marchInterval(aliveCount) — faster cadence as fewer aliens
    // remain.
    var aliveCount = state.aliens.length;
    marchStepCounter++;
    if (aliveCount > 0 && marchStepCounter >= window.SI.Alien.marchInterval(aliveCount)) {
      marchStepCounter = 0;
      marchGrid(state);
    }

    resolveBulletAlienCollisions(state);
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — static 5x11 alien grid factory, plus the PURE march-cadence
// formula (SI.Alien.marchInterval) consumed by SI.Game.update() to drive
// rigid-block horizontal march (slice-03, P2). No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // March cadence (TEST-FACING, slice-03/P2): PURE, integer, positive,
  // monotonically NON-INCREASING as aliveCount drops from full strength to 1
  // (fewer survivors -> faster marching). Linear interpolation between a slow
  // interval at full strength and a fast (1-step) interval with a single
  // alien left. FULL_STRENGTH is read from SI.Config once at module-load
  // time (not per call) so the function itself stays a pure computation of
  // its one argument.
  var MARCH_INTERVAL_BASE = 30; // update()-call steps between marches at full strength
  var FULL_STRENGTH = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;

  function marchInterval(aliveCount) {
    var n = aliveCount > 0 ? aliveCount : 0;
    var interval = Math.round((MARCH_INTERVAL_BASE * n) / FULL_STRENGTH);
    return interval < 1 ? 1 : interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with count-driven cadence, edge-drop and
// reverse). Strategy: imperative index-loop update over struct-of-arrays-
// style entity arrays (plain objects, indexed for-loops, no functional
// chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (slice-03/P2). Internal SI.Game state, observable only via
  // alien positions across steps (per the slice-03 contract) — never part
  // of the gameState field shape.
  var MARCH_STEP_X = 10; // px every alive alien moves per march step (rigid block, same dx for all)
  var MARCH_ROW_STEP = 20; // px the whole grid drops on edge contact

  var marchDirection = 1; // 1 = rightward, -1 = leftward
  var marchStepCounter = 0; // counts SI.Game.update() calls since the last march step (never wall-clock)
  var marchPendingDrop = false; // latched when a march step touches a screen edge, consumed on the NEXT march step

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchStepCounter = 0;
    marchPendingDrop = false;

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

  // Advances the alien grid by exactly one march step (slice-03/P2):
  // - If the previous march step touched a screen edge, this step consumes
  //   the pending-drop flag instead of moving horizontally: the whole grid
  //   steps down by MARCH_ROW_STEP and the horizontal direction reverses.
  // - Otherwise, every alive alien moves by the SAME signed x-delta (rigid
  //   block), then edge contact (either boundary) latches the pending-drop
  //   flag for the next march step.
  // Never reads dt or wall-clock time — cadence is driven purely by the
  // update()-call counter in update() below.
  function marchGrid(state) {
    var aliens = state.aliens;

    if (marchPendingDrop) {
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += MARCH_ROW_STEP;
      }
      return;
    }

    var dx = marchDirection * MARCH_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var hitEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        hitEdge = true;
        break;
      }
    }
    if (hitEdge) {
      marchPendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn/march logic here is a
  // constant per-step delta driven by call count, never scaled by dt's
  // magnitude and never read from the wall clock.
  function update(dt) {
    var state = window.SI.Game.state;
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

    // March cadence: an internal counter incremented once per update() call
    // (never wall-clock, never scaled by dt), compared against
    // SI.Alien.marchInterval(aliveCount) — faster cadence as fewer aliens
    // remain.
    var aliveCount = state.aliens.length;
    marchStepCounter++;
    if (aliveCount > 0 && marchStepCounter >= window.SI.Alien.marchInterval(aliveCount)) {
      marchStepCounter = 0;
      marchGrid(state);
    }

    resolveBulletAlienCollisions(state);
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
// SI.Alien — static 5x11 alien grid factory, plus the PURE march-cadence
// formula (SI.Alien.marchInterval) consumed by SI.Game.update() to drive
// rigid-block horizontal march (slice-03, P2). No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // March cadence (TEST-FACING, slice-03/P2): PURE, integer, positive,
  // monotonically NON-INCREASING as aliveCount drops from full strength to 1
  // (fewer survivors -> faster marching). Linear interpolation between a slow
  // interval at full strength and a fast (1-step) interval with a single
  // alien left. FULL_STRENGTH is read from SI.Config once at module-load
  // time (not per call) so the function itself stays a pure computation of
  // its one argument.
  var MARCH_INTERVAL_BASE = 30; // update()-call steps between marches at full strength
  var FULL_STRENGTH = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;

  function marchInterval(aliveCount) {
    var n = aliveCount > 0 ? aliveCount : 0;
    var interval = Math.round((MARCH_INTERVAL_BASE * n) / FULL_STRENGTH);
    return interval < 1 ? 1 : interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with count-driven cadence, edge-drop and
// reverse). Strategy: imperative index-loop update over struct-of-arrays-
// style entity arrays (plain objects, indexed for-loops, no functional
// chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (slice-03/P2). Internal SI.Game state, observable only via
  // alien positions across steps (per the slice-03 contract) — never part
  // of the gameState field shape.
  var MARCH_STEP_X = 10; // px every alive alien moves per march step (rigid block, same dx for all)
  var MARCH_ROW_STEP = 20; // px the whole grid drops on edge contact

  var marchDirection = 1; // 1 = rightward, -1 = leftward
  var marchStepCounter = 0; // counts SI.Game.update() calls since the last march step (never wall-clock)
  var marchPendingDrop = false; // latched when a march step touches a screen edge, consumed on the NEXT march step

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchStepCounter = 0;
    marchPendingDrop = false;

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

  // Advances the alien grid by exactly one march step (slice-03/P2):
  // - If the previous march step touched a screen edge, this step consumes
  //   the pending-drop flag instead of moving horizontally: the whole grid
  //   steps down by MARCH_ROW_STEP and the horizontal direction reverses.
  // - Otherwise, every alive alien moves by the SAME signed x-delta (rigid
  //   block), then edge contact (either boundary) latches the pending-drop
  //   flag for the next march step.
  // Never reads dt or wall-clock time — cadence is driven purely by the
  // update()-call counter in update() below.
  function marchGrid(state) {
    var aliens = state.aliens;

    if (marchPendingDrop) {
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += MARCH_ROW_STEP;
      }
      return;
    }

    var dx = marchDirection * MARCH_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var hitEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        hitEdge = true;
        break;
      }
    }
    if (hitEdge) {
      marchPendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn/march logic here is a
  // constant per-step delta driven by call count, never scaled by dt's
  // magnitude and never read from the wall clock.
  function update(dt) {
    var state = window.SI.Game.state;
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

    // March cadence: an internal counter incremented once per update() call
    // (never wall-clock, never scaled by dt), compared against
    // SI.Alien.marchInterval(aliveCount) — faster cadence as fewer aliens
    // remain.
    var aliveCount = state.aliens.length;
    marchStepCounter++;
    if (aliveCount > 0 && marchStepCounter >= window.SI.Alien.marchInterval(aliveCount)) {
      marchStepCounter = 0;
      marchGrid(state);
    }

    resolveBulletAlienCollisions(state);
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
```

## specimen-B
- **culled because:** gate testPassRate=1.00

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
// player -> bullet -> alien -> game.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + march-rule pure helpers (slice-03,
// P2). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points.
//
// Strategy: table/band interval lookup + edge-anticipation. marchInterval
// is a straight descending band table (fewer aliens -> smaller band ->
// smaller interval). Edge detection is *anticipatory*: before a horizontal
// step is applied, SI.Alien.anticipateEdge predicts whether the requested
// dx would carry the grid past the play-area bound and, if so, clamps the
// step so the grid comes to rest exactly on the boundary (never overshoots)
// and flags the contact so the caller can queue the drop-and-reverse for
// the next march step.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Per-step horizontal distance and the vertical drop distance applied on
  // edge contact. Named constants, not magic numbers scattered in game.js.
  var MARCH_DX = 10;
  var ROW_STEP = 20;

  // Band table for marchInterval: sorted descending by `min` (minimum
  // alive-alien count the band applies to). `interval` is the number of
  // SI.Game.update() steps between march moves. Strictly decreasing down
  // the table -> marchInterval() is monotonically non-increasing as
  // aliveCount drops from 55 toward 1, and strictly smaller at 1 than 55.
  var INTERVAL_BANDS = [
    { min: 50, interval: 60 },
    { min: 45, interval: 52 },
    { min: 40, interval: 45 },
    { min: 35, interval: 39 },
    { min: 30, interval: 33 },
    { min: 25, interval: 28 },
    { min: 20, interval: 23 },
    { min: 15, interval: 18 },
    { min: 10, interval: 13 },
    { min: 7, interval: 9 },
    { min: 5, interval: 6 },
    { min: 3, interval: 4 },
    { min: 2, interval: 3 },
    { min: 1, interval: 2 },
    { min: 0, interval: 1 },
  ];

  // Pure: integer, positive, band-table lookup. First band (scanning from
  // the highest `min`) that aliveCount qualifies for wins.
  function marchInterval(aliveCount) {
    var n = aliveCount;
    if (typeof n !== 'number' || !isFinite(n) || n < 0) {
      n = 0;
    }
    for (var i = 0; i < INTERVAL_BANDS.length; i++) {
      if (n >= INTERVAL_BANDS[i].min) {
        return INTERVAL_BANDS[i].interval;
      }
    }
    return INTERVAL_BANDS[INTERVAL_BANDS.length - 1].interval;
  }

  // Pure: leftmost/rightmost edge of the current alive-alien block.
  function gridBounds(aliens) {
    if (!aliens || aliens.length === 0) {
      return { minX: 0, maxX: 0 };
    }
    var minX = aliens[0].x;
    var maxX = aliens[0].x + aliens[0].width;
    for (var i = 1; i < aliens.length; i++) {
      var left = aliens[i].x;
      var right = aliens[i].x + aliens[i].width;
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
    }
    return { minX: minX, maxX: maxX };
  }

  // Pure: given the current bounds and a requested signed dx, predicts
  // whether applying dx would carry the grid past [0, playWidth]. If so,
  // clamps dx to land exactly on the boundary and reports hitEdge: true.
  // Never overshoots the play-area bound.
  function anticipateEdge(bounds, dx, playWidth) {
    if (dx > 0) {
      var roomRight = playWidth - bounds.maxX;
      if (roomRight <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (dx >= roomRight) {
        return { dx: roomRight, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    if (dx < 0) {
      var roomLeft = bounds.minX;
      if (roomLeft <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (-dx >= roomLeft) {
        return { dx: -roomLeft, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    return { dx: 0, hitEdge: false };
  }

  // Rigid-block move: every alien in `aliens` shifts by the SAME (dx, dy).
  // Mutates entries in place, mirrors SI.Bullet.updateBullets' style.
  function marchStep(aliens, dx, dy) {
    for (var i = 0; i < aliens.length; i++) {
      aliens[i].x += dx;
      aliens[i].y += dy;
    }
    return aliens;
  }

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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MARCH_DX: MARCH_DX,
    ROW_STEP: ROW_STEP,
    createGrid: createGrid,
    marchInterval: marchInterval,
    gridBounds: gridBounds,
    anticipateEdge: anticipateEdge,
    marchStep: marchStep,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with edge-triggered drop/reverse).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays (plain objects, indexed for-loops, no functional chains in the hot
// update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (P2), internal to SI.Game — observable only via alien
  // positions across update() calls, per the slice-03 contract.
  // marchStepCounter: fixed-step accumulator counted in update() calls,
  //   NEVER wall-clock; a march move fires once it reaches marchInterval().
  // marchDirection: +1 (right) or -1 (left), applied to MARCH_DX.
  // pendingDrop: true once an edge contact has been anticipated; the very
  //   next march step performs the row-step-down and flips marchDirection.
  var marchStepCounter = 0;
  var marchDirection = 1;
  var pendingDrop = false;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    pendingDrop = false;

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

  // Advances the alien grid march by at most one march move (P2). Driven
  // solely by marchStepCounter (incremented once per update() call) versus
  // SI.Alien.marchInterval(aliveCount) — never wall-clock/dt-magnitude, so
  // repeated update() calls reproduce the march exactly.
  function advanceMarch(state) {
    var aliveCount = state.aliens.length;
    if (aliveCount === 0) {
      return; // nothing left to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliveCount);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (pendingDrop) {
      // The step after an anticipated edge contact: drop the whole grid
      // down by rowStep, then reverse direction for subsequent steps.
      window.SI.Alien.marchStep(state.aliens, 0, window.SI.Alien.ROW_STEP);
      marchDirection = -marchDirection;
      pendingDrop = false;
      return;
    }

    // Edge-anticipation: predict whether this step's dx would carry the
    // grid past the play-area bound; if so, clamp so the grid lands
    // exactly on the boundary and queue the drop-and-reverse for next step.
    var bounds = window.SI.Alien.gridBounds(state.aliens);
    var requestedDx = marchDirection * window.SI.Alien.MARCH_DX;
    var planned = window.SI.Alien.anticipateEdge(bounds, requestedDx, gameWidth);

    window.SI.Alien.marchStep(state.aliens, planned.dx, 0);
    if (planned.hitEdge) {
      pendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + march-rule pure helpers (slice-03,
// P2). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points.
//
// Strategy: table/band interval lookup + edge-anticipation. marchInterval
// is a straight descending band table (fewer aliens -> smaller band ->
// smaller interval). Edge detection is *anticipatory*: before a horizontal
// step is applied, SI.Alien.anticipateEdge predicts whether the requested
// dx would carry the grid past the play-area bound and, if so, clamps the
// step so the grid comes to rest exactly on the boundary (never overshoots)
// and flags the contact so the caller can queue the drop-and-reverse for
// the next march step.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Per-step horizontal distance and the vertical drop distance applied on
  // edge contact. Named constants, not magic numbers scattered in game.js.
  var MARCH_DX = 10;
  var ROW_STEP = 20;

  // Band table for marchInterval: sorted descending by `min` (minimum
  // alive-alien count the band applies to). `interval` is the number of
  // SI.Game.update() steps between march moves. Strictly decreasing down
  // the table -> marchInterval() is monotonically non-increasing as
  // aliveCount drops from 55 toward 1, and strictly smaller at 1 than 55.
  var INTERVAL_BANDS = [
    { min: 50, interval: 60 },
    { min: 45, interval: 52 },
    { min: 40, interval: 45 },
    { min: 35, interval: 39 },
    { min: 30, interval: 33 },
    { min: 25, interval: 28 },
    { min: 20, interval: 23 },
    { min: 15, interval: 18 },
    { min: 10, interval: 13 },
    { min: 7, interval: 9 },
    { min: 5, interval: 6 },
    { min: 3, interval: 4 },
    { min: 2, interval: 3 },
    { min: 1, interval: 2 },
    { min: 0, interval: 1 },
  ];

  // Pure: integer, positive, band-table lookup. First band (scanning from
  // the highest `min`) that aliveCount qualifies for wins.
  function marchInterval(aliveCount) {
    var n = aliveCount;
    if (typeof n !== 'number' || !isFinite(n) || n < 0) {
      n = 0;
    }
    for (var i = 0; i < INTERVAL_BANDS.length; i++) {
      if (n >= INTERVAL_BANDS[i].min) {
        return INTERVAL_BANDS[i].interval;
      }
    }
    return INTERVAL_BANDS[INTERVAL_BANDS.length - 1].interval;
  }

  // Pure: leftmost/rightmost edge of the current alive-alien block.
  function gridBounds(aliens) {
    if (!aliens || aliens.length === 0) {
      return { minX: 0, maxX: 0 };
    }
    var minX = aliens[0].x;
    var maxX = aliens[0].x + aliens[0].width;
    for (var i = 1; i < aliens.length; i++) {
      var left = aliens[i].x;
      var right = aliens[i].x + aliens[i].width;
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
    }
    return { minX: minX, maxX: maxX };
  }

  // Pure: given the current bounds and a requested signed dx, predicts
  // whether applying dx would carry the grid past [0, playWidth]. If so,
  // clamps dx to land exactly on the boundary and reports hitEdge: true.
  // Never overshoots the play-area bound.
  function anticipateEdge(bounds, dx, playWidth) {
    if (dx > 0) {
      var roomRight = playWidth - bounds.maxX;
      if (roomRight <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (dx >= roomRight) {
        return { dx: roomRight, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    if (dx < 0) {
      var roomLeft = bounds.minX;
      if (roomLeft <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (-dx >= roomLeft) {
        return { dx: -roomLeft, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    return { dx: 0, hitEdge: false };
  }

  // Rigid-block move: every alien in `aliens` shifts by the SAME (dx, dy).
  // Mutates entries in place, mirrors SI.Bullet.updateBullets' style.
  function marchStep(aliens, dx, dy) {
    for (var i = 0; i < aliens.length; i++) {
      aliens[i].x += dx;
      aliens[i].y += dy;
    }
    return aliens;
  }

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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MARCH_DX: MARCH_DX,
    ROW_STEP: ROW_STEP,
    createGrid: createGrid,
    marchInterval: marchInterval,
    gridBounds: gridBounds,
    anticipateEdge: anticipateEdge,
    marchStep: marchStep,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with edge-triggered drop/reverse).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays (plain objects, indexed for-loops, no functional chains in the hot
// update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (P2), internal to SI.Game — observable only via alien
  // positions across update() calls, per the slice-03 contract.
  // marchStepCounter: fixed-step accumulator counted in update() calls,
  //   NEVER wall-clock; a march move fires once it reaches marchInterval().
  // marchDirection: +1 (right) or -1 (left), applied to MARCH_DX.
  // pendingDrop: true once an edge contact has been anticipated; the very
  //   next march step performs the row-step-down and flips marchDirection.
  var marchStepCounter = 0;
  var marchDirection = 1;
  var pendingDrop = false;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    pendingDrop = false;

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

  // Advances the alien grid march by at most one march move (P2). Driven
  // solely by marchStepCounter (incremented once per update() call) versus
  // SI.Alien.marchInterval(aliveCount) — never wall-clock/dt-magnitude, so
  // repeated update() calls reproduce the march exactly.
  function advanceMarch(state) {
    var aliveCount = state.aliens.length;
    if (aliveCount === 0) {
      return; // nothing left to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliveCount);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (pendingDrop) {
      // The step after an anticipated edge contact: drop the whole grid
      // down by rowStep, then reverse direction for subsequent steps.
      window.SI.Alien.marchStep(state.aliens, 0, window.SI.Alien.ROW_STEP);
      marchDirection = -marchDirection;
      pendingDrop = false;
      return;
    }

    // Edge-anticipation: predict whether this step's dx would carry the
    // grid past the play-area bound; if so, clamp so the grid lands
    // exactly on the boundary and queue the drop-and-reverse for next step.
    var bounds = window.SI.Alien.gridBounds(state.aliens);
    var requestedDx = marchDirection * window.SI.Alien.MARCH_DX;
    var planned = window.SI.Alien.anticipateEdge(bounds, requestedDx, gameWidth);

    window.SI.Alien.marchStep(state.aliens, planned.dx, 0);
    if (planned.hitEdge) {
      pendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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
// SI.Alien — 5x11 alien grid factory + march-rule pure helpers (slice-03,
// P2). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points.
//
// Strategy: table/band interval lookup + edge-anticipation. marchInterval
// is a straight descending band table (fewer aliens -> smaller band ->
// smaller interval). Edge detection is *anticipatory*: before a horizontal
// step is applied, SI.Alien.anticipateEdge predicts whether the requested
// dx would carry the grid past the play-area bound and, if so, clamps the
// step so the grid comes to rest exactly on the boundary (never overshoots)
// and flags the contact so the caller can queue the drop-and-reverse for
// the next march step.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Per-step horizontal distance and the vertical drop distance applied on
  // edge contact. Named constants, not magic numbers scattered in game.js.
  var MARCH_DX = 10;
  var ROW_STEP = 20;

  // Band table for marchInterval: sorted descending by `min` (minimum
  // alive-alien count the band applies to). `interval` is the number of
  // SI.Game.update() steps between march moves. Strictly decreasing down
  // the table -> marchInterval() is monotonically non-increasing as
  // aliveCount drops from 55 toward 1, and strictly smaller at 1 than 55.
  var INTERVAL_BANDS = [
    { min: 50, interval: 60 },
    { min: 45, interval: 52 },
    { min: 40, interval: 45 },
    { min: 35, interval: 39 },
    { min: 30, interval: 33 },
    { min: 25, interval: 28 },
    { min: 20, interval: 23 },
    { min: 15, interval: 18 },
    { min: 10, interval: 13 },
    { min: 7, interval: 9 },
    { min: 5, interval: 6 },
    { min: 3, interval: 4 },
    { min: 2, interval: 3 },
    { min: 1, interval: 2 },
    { min: 0, interval: 1 },
  ];

  // Pure: integer, positive, band-table lookup. First band (scanning from
  // the highest `min`) that aliveCount qualifies for wins.
  function marchInterval(aliveCount) {
    var n = aliveCount;
    if (typeof n !== 'number' || !isFinite(n) || n < 0) {
      n = 0;
    }
    for (var i = 0; i < INTERVAL_BANDS.length; i++) {
      if (n >= INTERVAL_BANDS[i].min) {
        return INTERVAL_BANDS[i].interval;
      }
    }
    return INTERVAL_BANDS[INTERVAL_BANDS.length - 1].interval;
  }

  // Pure: leftmost/rightmost edge of the current alive-alien block.
  function gridBounds(aliens) {
    if (!aliens || aliens.length === 0) {
      return { minX: 0, maxX: 0 };
    }
    var minX = aliens[0].x;
    var maxX = aliens[0].x + aliens[0].width;
    for (var i = 1; i < aliens.length; i++) {
      var left = aliens[i].x;
      var right = aliens[i].x + aliens[i].width;
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
    }
    return { minX: minX, maxX: maxX };
  }

  // Pure: given the current bounds and a requested signed dx, predicts
  // whether applying dx would carry the grid past [0, playWidth]. If so,
  // clamps dx to land exactly on the boundary and reports hitEdge: true.
  // Never overshoots the play-area bound.
  function anticipateEdge(bounds, dx, playWidth) {
    if (dx > 0) {
      var roomRight = playWidth - bounds.maxX;
      if (roomRight <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (dx >= roomRight) {
        return { dx: roomRight, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    if (dx < 0) {
      var roomLeft = bounds.minX;
      if (roomLeft <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (-dx >= roomLeft) {
        return { dx: -roomLeft, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    return { dx: 0, hitEdge: false };
  }

  // Rigid-block move: every alien in `aliens` shifts by the SAME (dx, dy).
  // Mutates entries in place, mirrors SI.Bullet.updateBullets' style.
  function marchStep(aliens, dx, dy) {
    for (var i = 0; i < aliens.length; i++) {
      aliens[i].x += dx;
      aliens[i].y += dy;
    }
    return aliens;
  }

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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MARCH_DX: MARCH_DX,
    ROW_STEP: ROW_STEP,
    createGrid: createGrid,
    marchInterval: marchInterval,
    gridBounds: gridBounds,
    anticipateEdge: anticipateEdge,
    marchStep: marchStep,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with edge-triggered drop/reverse).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays (plain objects, indexed for-loops, no functional chains in the hot
// update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state (P2), internal to SI.Game — observable only via alien
  // positions across update() calls, per the slice-03 contract.
  // marchStepCounter: fixed-step accumulator counted in update() calls,
  //   NEVER wall-clock; a march move fires once it reaches marchInterval().
  // marchDirection: +1 (right) or -1 (left), applied to MARCH_DX.
  // pendingDrop: true once an edge contact has been anticipated; the very
  //   next march step performs the row-step-down and flips marchDirection.
  var marchStepCounter = 0;
  var marchDirection = 1;
  var pendingDrop = false;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    pendingDrop = false;

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

  // Advances the alien grid march by at most one march move (P2). Driven
  // solely by marchStepCounter (incremented once per update() call) versus
  // SI.Alien.marchInterval(aliveCount) — never wall-clock/dt-magnitude, so
  // repeated update() calls reproduce the march exactly.
  function advanceMarch(state) {
    var aliveCount = state.aliens.length;
    if (aliveCount === 0) {
      return; // nothing left to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliveCount);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (pendingDrop) {
      // The step after an anticipated edge contact: drop the whole grid
      // down by rowStep, then reverse direction for subsequent steps.
      window.SI.Alien.marchStep(state.aliens, 0, window.SI.Alien.ROW_STEP);
      marchDirection = -marchDirection;
      pendingDrop = false;
      return;
    }

    // Edge-anticipation: predict whether this step's dx would carry the
    // grid past the play-area bound; if so, clamp so the grid lands
    // exactly on the boundary and queue the drop-and-reverse for next step.
    var bounds = window.SI.Alien.gridBounds(state.aliens);
    var requestedDx = marchDirection * window.SI.Alien.MARCH_DX;
    var planned = window.SI.Alien.anticipateEdge(bounds, requestedDx, gameWidth);

    window.SI.Alien.marchStep(state.aliens, planned.dx, 0);
    if (planned.hitEdge) {
      pendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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
```

## specimen-D
- **culled because:** gate testPassRate=1.00

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
// player -> bullet -> alien -> game.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
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

  // Slice-03 march tuning. Named constants, not scattered magic numbers.
  MARCH_STEP_X: 5, // px each alive alien moves horizontally per march step
  MARCH_ROW_STEP: 12, // px the whole grid drops on edge contact

  // Step table driving SI.Alien.marchInterval(aliveCount): how many
  // SI.Game.update() calls elapse between march steps, keyed by remaining
  // alive-alien count. Checked top-down (highest minAlive first) — first
  // tier where aliveCount >= minAlive wins. Must stay sorted descending by
  // minAlive with non-increasing interval values (55 aliens -> slowest,
  // 1 alien -> fastest) so SI.Alien.marchInterval stays monotonic
  // non-increasing across the whole 55->1 range.
  MARCH_STEP_TABLE: [
    { minAlive: 41, interval: 55 },
    { minAlive: 31, interval: 40 },
    { minAlive: 21, interval: 28 },
    { minAlive: 11, interval: 18 },
    { minAlive: 6, interval: 10 },
    { minAlive: 3, interval: 5 },
    { minAlive: 1, interval: 2 },
  ],
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + march-interval lookup (movement
// itself lives in SI.Game.update, which owns the rigid-block/drop-reverse
// state machine). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points
// and the march step table.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // PURE: integer number of SI.Game.update() steps between march moves,
  // driven by SI.Config.MARCH_STEP_TABLE. Table is checked top-down
  // (highest minAlive first); the first tier the count qualifies for wins.
  // Monotonically non-increasing as aliveCount drops across the whole
  // grid's 55->1 lifetime, by construction of the table (see config.js).
  function marchInterval(aliveCount) {
    var table = window.SI.Config.MARCH_STEP_TABLE;
    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    var maxAliens = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;
    if (count > maxAliens) {
      count = maxAliens;
    }
    for (var i = 0; i < table.length; i++) {
      if (count >= table[i].minAlive) {
        return table[i].interval;
      }
    }
    // Fallback: table's last tier should always have minAlive 1 and catch
    // every clamped count, but guard against a misconfigured table.
    return table[table.length - 1].interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02 (P1: move, shoot,
// kill on a static alien grid) and slice-03 (P2: rigid-block alien march,
// edge-triggered drop+reverse, count-driven cadence). Strategy: imperative
// index-loop update over struct-of-arrays-style entity arrays (plain
// objects, indexed for-loops, no functional chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state machine (slice-03). All internal to SI.Game, observable
  // only via alien positions across update() calls, per the manifest
  // contract — not part of the window.gameState field contract.
  //   marchDirection: 1 (moving toward +x) or -1 (moving toward -x).
  //   marchPhase: 'marching' (normal horizontal rigid-block step) or
  //     'dropping' (the next march step is a vertical drop instead, taken
  //     the step after an edge contact was detected).
  //   marchStepCounter: internal accumulated SI.Game.update() call count
  //     since the last march step — compared against
  //     SI.Alien.marchInterval(aliveCount) each update(). Never wall-clock,
  //     never scaled by dt's magnitude.
  var marchDirection = 1;
  var marchPhase = 'marching';
  var marchStepCounter = 0;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchPhase = 'marching';
    marchStepCounter = 0;

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

  // True if any alive alien's box has reached or crossed the left/right
  // play-field edge.
  function touchesEdge(aliens) {
    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      if (alien.x <= 0 || alien.x + alien.width >= gameWidth) {
        return true;
      }
    }
    return false;
  }

  // Drives the march state machine by internal step count (never
  // wall-clock, never dt-scaled): one accumulated tick per update() call,
  // compared against SI.Alien.marchInterval(aliveCount). RIGID block — the
  // same x-delta (or y-delta, on a drop) is applied to every alive alien in
  // a single march step.
  function advanceMarch(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // no grid left to march
    }

    marchStepCounter += 1;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (marchPhase === 'marching') {
      var dx = marchDirection * window.SI.Config.MARCH_STEP_X;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].x += dx;
      }
      if (touchesEdge(aliens)) {
        // Edge contact: the drop happens on the NEXT march step, and
        // direction reverses as part of that drop step (see below) — so
        // the step after the drop resumes marching in the new direction.
        marchPhase = 'dropping';
      }
    } else {
      var dy = window.SI.Config.MARCH_ROW_STEP;
      for (var j = 0; j < aliens.length; j++) {
        aliens[j].y += dy;
      }
      marchDirection = -marchDirection;
      marchPhase = 'marching';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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

  // Slice-03 march tuning. Named constants, not scattered magic numbers.
  MARCH_STEP_X: 5, // px each alive alien moves horizontally per march step
  MARCH_ROW_STEP: 12, // px the whole grid drops on edge contact

  // Step table driving SI.Alien.marchInterval(aliveCount): how many
  // SI.Game.update() calls elapse between march steps, keyed by remaining
  // alive-alien count. Checked top-down (highest minAlive first) — first
  // tier where aliveCount >= minAlive wins. Must stay sorted descending by
  // minAlive with non-increasing interval values (55 aliens -> slowest,
  // 1 alien -> fastest) so SI.Alien.marchInterval stays monotonic
  // non-increasing across the whole 55->1 range.
  MARCH_STEP_TABLE: [
    { minAlive: 41, interval: 55 },
    { minAlive: 31, interval: 40 },
    { minAlive: 21, interval: 28 },
    { minAlive: 11, interval: 18 },
    { minAlive: 6, interval: 10 },
    { minAlive: 3, interval: 5 },
    { minAlive: 1, interval: 2 },
  ],
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
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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
    updateBullets: updateBullets,
  };
})();

// ---- src/alien.js ----
// SI.Alien — 5x11 alien grid factory + march-interval lookup (movement
// itself lives in SI.Game.update, which owns the rigid-block/drop-reverse
// state machine). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points
// and the march step table.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // PURE: integer number of SI.Game.update() steps between march moves,
  // driven by SI.Config.MARCH_STEP_TABLE. Table is checked top-down
  // (highest minAlive first); the first tier the count qualifies for wins.
  // Monotonically non-increasing as aliveCount drops across the whole
  // grid's 55->1 lifetime, by construction of the table (see config.js).
  function marchInterval(aliveCount) {
    var table = window.SI.Config.MARCH_STEP_TABLE;
    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    var maxAliens = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;
    if (count > maxAliens) {
      count = maxAliens;
    }
    for (var i = 0; i < table.length; i++) {
      if (count >= table[i].minAlive) {
        return table[i].interval;
      }
    }
    // Fallback: table's last tier should always have minAlive 1 and catch
    // every clamped count, but guard against a misconfigured table.
    return table[table.length - 1].interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02 (P1: move, shoot,
// kill on a static alien grid) and slice-03 (P2: rigid-block alien march,
// edge-triggered drop+reverse, count-driven cadence). Strategy: imperative
// index-loop update over struct-of-arrays-style entity arrays (plain
// objects, indexed for-loops, no functional chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state machine (slice-03). All internal to SI.Game, observable
  // only via alien positions across update() calls, per the manifest
  // contract — not part of the window.gameState field contract.
  //   marchDirection: 1 (moving toward +x) or -1 (moving toward -x).
  //   marchPhase: 'marching' (normal horizontal rigid-block step) or
  //     'dropping' (the next march step is a vertical drop instead, taken
  //     the step after an edge contact was detected).
  //   marchStepCounter: internal accumulated SI.Game.update() call count
  //     since the last march step — compared against
  //     SI.Alien.marchInterval(aliveCount) each update(). Never wall-clock,
  //     never scaled by dt's magnitude.
  var marchDirection = 1;
  var marchPhase = 'marching';
  var marchStepCounter = 0;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchPhase = 'marching';
    marchStepCounter = 0;

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

  // True if any alive alien's box has reached or crossed the left/right
  // play-field edge.
  function touchesEdge(aliens) {
    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      if (alien.x <= 0 || alien.x + alien.width >= gameWidth) {
        return true;
      }
    }
    return false;
  }

  // Drives the march state machine by internal step count (never
  // wall-clock, never dt-scaled): one accumulated tick per update() call,
  // compared against SI.Alien.marchInterval(aliveCount). RIGID block — the
  // same x-delta (or y-delta, on a drop) is applied to every alive alien in
  // a single march step.
  function advanceMarch(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // no grid left to march
    }

    marchStepCounter += 1;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (marchPhase === 'marching') {
      var dx = marchDirection * window.SI.Config.MARCH_STEP_X;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].x += dx;
      }
      if (touchesEdge(aliens)) {
        // Edge contact: the drop happens on the NEXT march step, and
        // direction reverses as part of that drop step (see below) — so
        // the step after the drop resumes marching in the new direction.
        marchPhase = 'dropping';
      }
    } else {
      var dy = window.SI.Config.MARCH_ROW_STEP;
      for (var j = 0; j < aliens.length; j++) {
        aliens[j].y += dy;
      }
      marchDirection = -marchDirection;
      marchPhase = 'marching';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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
// SI.Alien — 5x11 alien grid factory + march-interval lookup (movement
// itself lives in SI.Game.update, which owns the rigid-block/drop-reverse
// state machine). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points
// and the march step table.
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
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // PURE: integer number of SI.Game.update() steps between march moves,
  // driven by SI.Config.MARCH_STEP_TABLE. Table is checked top-down
  // (highest minAlive first); the first tier the count qualifies for wins.
  // Monotonically non-increasing as aliveCount drops across the whole
  // grid's 55->1 lifetime, by construction of the table (see config.js).
  function marchInterval(aliveCount) {
    var table = window.SI.Config.MARCH_STEP_TABLE;
    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    var maxAliens = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;
    if (count > maxAliens) {
      count = maxAliens;
    }
    for (var i = 0; i < table.length; i++) {
      if (count >= table[i].minAlive) {
        return table[i].interval;
      }
    }
    // Fallback: table's last tier should always have minAlive 1 and catch
    // every clamped count, but guard against a misconfigured table.
    return table[table.length - 1].interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
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

  // Slice-03 march tuning. Named constants, not scattered magic numbers.
  MARCH_STEP_X: 5, // px each alive alien moves horizontally per march step
  MARCH_ROW_STEP: 12, // px the whole grid drops on edge contact

  // Step table driving SI.Alien.marchInterval(aliveCount): how many
  // SI.Game.update() calls elapse between march steps, keyed by remaining
  // alive-alien count. Checked top-down (highest minAlive first) — first
  // tier where aliveCount >= minAlive wins. Must stay sorted descending by
  // minAlive with non-increasing interval values (55 aliens -> slowest,
  // 1 alien -> fastest) so SI.Alien.marchInterval stays monotonic
  // non-increasing across the whole 55->1 range.
  MARCH_STEP_TABLE: [
    { minAlive: 41, interval: 55 },
    { minAlive: 31, interval: 40 },
    { minAlive: 21, interval: 28 },
    { minAlive: 11, interval: 18 },
    { minAlive: 6, interval: 10 },
    { minAlive: 3, interval: 5 },
    { minAlive: 1, interval: 2 },
  ],
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02 (P1: move, shoot,
// kill on a static alien grid) and slice-03 (P2: rigid-block alien march,
// edge-triggered drop+reverse, count-driven cadence). Strategy: imperative
// index-loop update over struct-of-arrays-style entity arrays (plain
// objects, indexed for-loops, no functional chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
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

  // March state machine (slice-03). All internal to SI.Game, observable
  // only via alien positions across update() calls, per the manifest
  // contract — not part of the window.gameState field contract.
  //   marchDirection: 1 (moving toward +x) or -1 (moving toward -x).
  //   marchPhase: 'marching' (normal horizontal rigid-block step) or
  //     'dropping' (the next march step is a vertical drop instead, taken
  //     the step after an edge contact was detected).
  //   marchStepCounter: internal accumulated SI.Game.update() call count
  //     since the last march step — compared against
  //     SI.Alien.marchInterval(aliveCount) each update(). Never wall-clock,
  //     never scaled by dt's magnitude.
  var marchDirection = 1;
  var marchPhase = 'marching';
  var marchStepCounter = 0;

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
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchDirection = 1;
    marchPhase = 'marching';
    marchStepCounter = 0;

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

  // True if any alive alien's box has reached or crossed the left/right
  // play-field edge.
  function touchesEdge(aliens) {
    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      if (alien.x <= 0 || alien.x + alien.width >= gameWidth) {
        return true;
      }
    }
    return false;
  }

  // Drives the march state machine by internal step count (never
  // wall-clock, never dt-scaled): one accumulated tick per update() call,
  // compared against SI.Alien.marchInterval(aliveCount). RIGID block — the
  // same x-delta (or y-delta, on a drop) is applied to every alive alien in
  // a single march step.
  function advanceMarch(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // no grid left to march
    }

    marchStepCounter += 1;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (marchPhase === 'marching') {
      var dx = marchDirection * window.SI.Config.MARCH_STEP_X;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].x += dx;
      }
      if (touchesEdge(aliens)) {
        // Edge contact: the drop happens on the NEXT march step, and
        // direction reverses as part of that drop step (see below) — so
        // the step after the drop resumes marching in the new direction.
        marchPhase = 'dropping';
      }
    } else {
      var dy = window.SI.Config.MARCH_ROW_STEP;
      for (var j = 0; j < aliens.length; j++) {
        aliens[j].y += dy;
      }
      marchDirection = -marchDirection;
      marchPhase = 'marching';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
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

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
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
```
