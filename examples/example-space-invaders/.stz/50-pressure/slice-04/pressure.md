---
summary: "Pressure log slice-04: 3 culled."
---

# Pressure log — slice-04

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

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien-fire tuning (ADR-002: per-step constants, never scaled
  // by dt). A fixed-steps counter (mirrors the march cadence pattern) — on
  // the step this interval elapses, a "fire event" occurs: one column is
  // chosen via SI.RNG.next() and the front (bottom-most) alive alien in
  // that column fires, if any is alive in that column.
  ALIEN_FIRE_INTERVAL_STEPS: 90,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
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

  // slice-04: alien-bullet factory. Same plain {x,y,width,height} shape and
  // same array-membership-is-live rule as player bullets (per the
  // TEST-FACING API) — spawned centered under the firing alien, travels
  // downward via updateBullets(bullets, +SI.Config.ALIEN_BULLET_SPEED).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontInColumn — PURE. Returns the front (bottom-most, i.e. largest y)
  // alive alien whose `col` matches, or null if that column has no alive
  // alien left (slice-04: alien-fire column selection reads array
  // membership + the `alive` flag, same live-entity convention as
  // resolveBulletAlienCollisions — never mutates `aliens`).
  function frontInColumn(aliens, col) {
    var front = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col !== col || a.alive === false) {
        continue;
      }
      if (front === null || a.y > front.y) {
        front = a;
      }
    }
    return front;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontInColumn: frontInColumn,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only, same accumulated-step-
  // counter pattern as march (never wall-clock), so a given seed + a given
  // number of update() calls always fires from the same columns in the same
  // order.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

  // Terminality (slice-04) — explicit flag, checked first thing in update()
  // so that once gameover is reached, lives/score/state (and everything
  // else) are frozen: no further mutation happens on any subsequent
  // update() call. Cheaper and harder to accidentally bypass than scattering
  // `if (state.state !== 'gameover')` guards through every sub-step.
  var terminal = false;

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
    marchPendingDrop = false;

    fireStepCounter = 0;
    terminal = false;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien-fire event (slice-04): on the step this interval elapses, one
  // column is chosen from the FRONT (SI.RNG.next() picks a column index in
  // [0, ALIEN_COLS)) and the front (bottom-most) alive alien in that column
  // fires — one SI.RNG.next() call per fire event regardless of whether
  // that column currently has a surviving alien, so a given seed always
  // consumes the RNG sequence identically (deterministic under seed).
  function fireAlienColumn(state) {
    var cfg = window.SI.Config;
    fireStepCounter++;
    if (fireStepCounter < cfg.ALIEN_FIRE_INTERVAL_STEPS) {
      return;
    }
    fireStepCounter = 0;

    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard: next() is documented [0,1) but clamp defensively
    }

    var shooter = window.SI.Alien.frontInColumn(state.aliens, col);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // alienBullet-vs-player collision: resolved BEFORE bullet motion is
  // applied this step (contrast with playerBullets, which move-then-
  // resolve) so that a plain {x,y,width,height} object placed directly into
  // gameState.alienBullets by a test — live by array-membership alone, per
  // the TEST-FACING API, exactly like playerBullets — overlapping the
  // player is consumed on this very update() call even though it hasn't
  // travelled yet. Each overlapping bullet decrements lives by exactly 1
  // and is removed; lives is clamped at 0 (never negative) so `lives ===
  // 0` is the literal, checkable gameover trigger.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var surviving = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
        if (state.lives < 0) {
          state.lives = 0;
        }
      } else {
        surviving.push(bullets[i]);
      }
    }

    state.alienBullets = surviving;
  }

  // Gameover check (slice-04): state becomes 'gameover' when lives === 0 OR
  // any alive alien's row has reached the player's row (alien.y +
  // alien.height >= player.y). Sets the internal `terminal` flag so the
  // very next update() call (and every one after) is a no-op.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      terminal = true;
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive !== false && a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        terminal = true;
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    if (terminal) {
      // Gameover is terminal: lives/score/state (and everything else) are
      // frozen — no further mutation on any subsequent update() call.
      return;
    }

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

    marchGrid(state);

    fireAlienColumn(state);

    // Collision-before-move (see resolveAlienBulletPlayerCollisions), then
    // motion, then drop bullets that travelled off the bottom of the field.
    resolveAlienBulletPlayerCollisions(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    var alienOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienOnScreen.push(ab);
      }
    }
    state.alienBullets = alienOnScreen;

    checkGameOver(state);
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

  // slice-04: alien-fire tuning (ADR-002: per-step constants, never scaled
  // by dt). A fixed-steps counter (mirrors the march cadence pattern) — on
  // the step this interval elapses, a "fire event" occurs: one column is
  // chosen via SI.RNG.next() and the front (bottom-most) alive alien in
  // that column fires, if any is alive in that column.
  ALIEN_FIRE_INTERVAL_STEPS: 90,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
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

  // slice-04: alien-bullet factory. Same plain {x,y,width,height} shape and
  // same array-membership-is-live rule as player bullets (per the
  // TEST-FACING API) — spawned centered under the firing alien, travels
  // downward via updateBullets(bullets, +SI.Config.ALIEN_BULLET_SPEED).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontInColumn — PURE. Returns the front (bottom-most, i.e. largest y)
  // alive alien whose `col` matches, or null if that column has no alive
  // alien left (slice-04: alien-fire column selection reads array
  // membership + the `alive` flag, same live-entity convention as
  // resolveBulletAlienCollisions — never mutates `aliens`).
  function frontInColumn(aliens, col) {
    var front = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col !== col || a.alive === false) {
        continue;
      }
      if (front === null || a.y > front.y) {
        front = a;
      }
    }
    return front;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontInColumn: frontInColumn,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only, same accumulated-step-
  // counter pattern as march (never wall-clock), so a given seed + a given
  // number of update() calls always fires from the same columns in the same
  // order.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

  // Terminality (slice-04) — explicit flag, checked first thing in update()
  // so that once gameover is reached, lives/score/state (and everything
  // else) are frozen: no further mutation happens on any subsequent
  // update() call. Cheaper and harder to accidentally bypass than scattering
  // `if (state.state !== 'gameover')` guards through every sub-step.
  var terminal = false;

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
    marchPendingDrop = false;

    fireStepCounter = 0;
    terminal = false;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien-fire event (slice-04): on the step this interval elapses, one
  // column is chosen from the FRONT (SI.RNG.next() picks a column index in
  // [0, ALIEN_COLS)) and the front (bottom-most) alive alien in that column
  // fires — one SI.RNG.next() call per fire event regardless of whether
  // that column currently has a surviving alien, so a given seed always
  // consumes the RNG sequence identically (deterministic under seed).
  function fireAlienColumn(state) {
    var cfg = window.SI.Config;
    fireStepCounter++;
    if (fireStepCounter < cfg.ALIEN_FIRE_INTERVAL_STEPS) {
      return;
    }
    fireStepCounter = 0;

    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard: next() is documented [0,1) but clamp defensively
    }

    var shooter = window.SI.Alien.frontInColumn(state.aliens, col);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // alienBullet-vs-player collision: resolved BEFORE bullet motion is
  // applied this step (contrast with playerBullets, which move-then-
  // resolve) so that a plain {x,y,width,height} object placed directly into
  // gameState.alienBullets by a test — live by array-membership alone, per
  // the TEST-FACING API, exactly like playerBullets — overlapping the
  // player is consumed on this very update() call even though it hasn't
  // travelled yet. Each overlapping bullet decrements lives by exactly 1
  // and is removed; lives is clamped at 0 (never negative) so `lives ===
  // 0` is the literal, checkable gameover trigger.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var surviving = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
        if (state.lives < 0) {
          state.lives = 0;
        }
      } else {
        surviving.push(bullets[i]);
      }
    }

    state.alienBullets = surviving;
  }

  // Gameover check (slice-04): state becomes 'gameover' when lives === 0 OR
  // any alive alien's row has reached the player's row (alien.y +
  // alien.height >= player.y). Sets the internal `terminal` flag so the
  // very next update() call (and every one after) is a no-op.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      terminal = true;
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive !== false && a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        terminal = true;
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    if (terminal) {
      // Gameover is terminal: lives/score/state (and everything else) are
      // frozen — no further mutation on any subsequent update() call.
      return;
    }

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

    marchGrid(state);

    fireAlienColumn(state);

    // Collision-before-move (see resolveAlienBulletPlayerCollisions), then
    // motion, then drop bullets that travelled off the bottom of the field.
    resolveAlienBulletPlayerCollisions(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    var alienOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienOnScreen.push(ab);
      }
    }
    state.alienBullets = alienOnScreen;

    checkGameOver(state);
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // frontInColumn — PURE. Returns the front (bottom-most, i.e. largest y)
  // alive alien whose `col` matches, or null if that column has no alive
  // alien left (slice-04: alien-fire column selection reads array
  // membership + the `alive` flag, same live-entity convention as
  // resolveBulletAlienCollisions — never mutates `aliens`).
  function frontInColumn(aliens, col) {
    var front = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col !== col || a.alive === false) {
        continue;
      }
      if (front === null || a.y > front.y) {
        front = a;
      }
    }
    return front;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontInColumn: frontInColumn,
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

  // slice-04: alien-bullet factory. Same plain {x,y,width,height} shape and
  // same array-membership-is-live rule as player bullets (per the
  // TEST-FACING API) — spawned centered under the firing alien, travels
  // downward via updateBullets(bullets, +SI.Config.ALIEN_BULLET_SPEED).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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

  // slice-04: alien-fire tuning (ADR-002: per-step constants, never scaled
  // by dt). A fixed-steps counter (mirrors the march cadence pattern) — on
  // the step this interval elapses, a "fire event" occurs: one column is
  // chosen via SI.RNG.next() and the front (bottom-most) alive alien in
  // that column fires, if any is alive in that column.
  ALIEN_FIRE_INTERVAL_STEPS: 90,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only, same accumulated-step-
  // counter pattern as march (never wall-clock), so a given seed + a given
  // number of update() calls always fires from the same columns in the same
  // order.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

  // Terminality (slice-04) — explicit flag, checked first thing in update()
  // so that once gameover is reached, lives/score/state (and everything
  // else) are frozen: no further mutation happens on any subsequent
  // update() call. Cheaper and harder to accidentally bypass than scattering
  // `if (state.state !== 'gameover')` guards through every sub-step.
  var terminal = false;

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
    marchPendingDrop = false;

    fireStepCounter = 0;
    terminal = false;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien-fire event (slice-04): on the step this interval elapses, one
  // column is chosen from the FRONT (SI.RNG.next() picks a column index in
  // [0, ALIEN_COLS)) and the front (bottom-most) alive alien in that column
  // fires — one SI.RNG.next() call per fire event regardless of whether
  // that column currently has a surviving alien, so a given seed always
  // consumes the RNG sequence identically (deterministic under seed).
  function fireAlienColumn(state) {
    var cfg = window.SI.Config;
    fireStepCounter++;
    if (fireStepCounter < cfg.ALIEN_FIRE_INTERVAL_STEPS) {
      return;
    }
    fireStepCounter = 0;

    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard: next() is documented [0,1) but clamp defensively
    }

    var shooter = window.SI.Alien.frontInColumn(state.aliens, col);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // alienBullet-vs-player collision: resolved BEFORE bullet motion is
  // applied this step (contrast with playerBullets, which move-then-
  // resolve) so that a plain {x,y,width,height} object placed directly into
  // gameState.alienBullets by a test — live by array-membership alone, per
  // the TEST-FACING API, exactly like playerBullets — overlapping the
  // player is consumed on this very update() call even though it hasn't
  // travelled yet. Each overlapping bullet decrements lives by exactly 1
  // and is removed; lives is clamped at 0 (never negative) so `lives ===
  // 0` is the literal, checkable gameover trigger.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var surviving = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
        if (state.lives < 0) {
          state.lives = 0;
        }
      } else {
        surviving.push(bullets[i]);
      }
    }

    state.alienBullets = surviving;
  }

  // Gameover check (slice-04): state becomes 'gameover' when lives === 0 OR
  // any alive alien's row has reached the player's row (alien.y +
  // alien.height >= player.y). Sets the internal `terminal` flag so the
  // very next update() call (and every one after) is a no-op.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      terminal = true;
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive !== false && a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        terminal = true;
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    if (terminal) {
      // Gameover is terminal: lives/score/state (and everything else) are
      // frozen — no further mutation on any subsequent update() call.
      return;
    }

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

    marchGrid(state);

    fireAlienColumn(state);

    // Collision-before-move (see resolveAlienBulletPlayerCollisions), then
    // motion, then drop bullets that travelled off the bottom of the field.
    resolveAlienBulletPlayerCollisions(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    var alienOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienOnScreen.push(ab);
      }
    }
    state.alienBullets = alienOnScreen;

    checkGameOver(state);
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

## specimen-C
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

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire (P3). Fixed per-step constants, never scaled by
  // dt, mirroring ALIEN_STEP_X/ALIEN_ROW_STEP above.
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
  ALIEN_FIRE_INTERVAL_STEPS: 30, // fixed steps between alien-fire events
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

  // slice-04 (P3): alien-bullet factory, spawned from the firing alien's
  // position, travelling downward (+y). Width/height read from SI.Config
  // (fire constants), not hardcoded here, per the config-constants
  // convention for slice-04 additions.
  function spawnAlienBullet(alien) {
    var cfg = window.SI.Config;
    return {
      x: alien.x + alien.width / 2 - cfg.ALIEN_BULLET_WIDTH / 2,
      y: alien.y + alien.height,
      width: cfg.ALIEN_BULLET_WIDTH,
      height: cfg.ALIEN_BULLET_HEIGHT,
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
          col: col, // slice-04 (P3): needed to pick a firing column
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // pickFiringAlien — PURE. Given the (already-alive-only, per array-
  // membership) `aliens` array and a `randomValue` in [0, 1) (the caller's
  // SI.RNG.next() result — this function never touches RNG itself so it
  // stays pure/testable), picks one column uniformly at random among the
  // distinct columns currently occupied by an alien, then returns the
  // front-most (largest y, i.e. closest to the player) alien in that
  // column. Returns null when `aliens` is empty. Same inputs always yield
  // the same output.
  function pickFiringAlien(aliens, randomValue) {
    if (aliens.length === 0) {
      return null;
    }

    var cols = aliens.reduce(function (acc, alien) {
      if (acc.indexOf(alien.col) === -1) {
        acc.push(alien.col);
      }
      return acc;
    }, []);

    var idx = Math.floor(randomValue * cols.length);
    if (idx >= cols.length) {
      idx = cols.length - 1; // guard a randomValue of exactly 1
    }
    var chosenCol = cols[idx];

    return aliens
      .filter(function (alien) {
        return alien.col === chosenCol;
      })
      .reduce(function (frontMost, alien) {
        return alien.y > frontMost.y ? alien : frontMost;
      });
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    pickFiringAlien: pickFiringAlien,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: P1/P2 kept as the original imperative
// index-loop update over struct-of-arrays-style entity arrays; the P3
// additions below (alien fire, alien-bullet-vs-player collision, alien
// bullet motion, gameover check) are written as small pure/functional
// helpers (map/filter/reduce) over `state`, per this slice's assigned
// specimen strategy.
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04, P3) — internal only, same "accumulated
  // update()-call counter, never wall-clock" pattern as marchStepCounter,
  // so N identical update() calls always fire at the same steps for a
  // given seed.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien fire (slice-04, P3) — PURE-ish orchestration: every
  // ALIEN_FIRE_INTERVAL_STEPS fixed steps, one column is chosen via
  // exactly one SI.RNG.next() call (so seeding makes firing deterministic)
  // and the front-most alive alien in that column spawns an alien bullet.
  // Wholesale array replacement (concat, not push) per this specimen's
  // functional-style convention.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var randomValue = window.SI.RNG.next();
    var firingAlien = window.SI.Alien.pickFiringAlien(state.aliens, randomValue);
    if (firingAlien) {
      state.alienBullets = state.alienBullets.concat([
        window.SI.Bullet.spawnAlienBullet(firingAlien),
      ]);
    }
  }

  // alienBullet-vs-player collision (slice-04, P3) — checked on PRE-MOTION
  // positions (before moveAlienBullets runs this same step), so a bullet
  // injected directly into gameState.alienBullets already overlapping the
  // player collides on the very update() call that observes it, even
  // before any movement is applied. Every alien bullet overlapping the
  // player this step is consumed (filter) and lives decrements by exactly
  // 1 per bullet consumed (reduce), clamped so lives never goes negative
  // (gameover is keyed off lives === 0, not lives < 0).
  function resolveAlienBulletPlayerCollisions(state) {
    var player = state.player;
    var bullets = state.alienBullets;

    var hitCount = bullets.reduce(function (count, bullet) {
      return window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player))
        ? count + 1
        : count;
    }, 0);

    state.alienBullets = bullets.filter(function (bullet) {
      return !window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player));
    });

    if (hitCount > 0) {
      state.lives = Math.max(0, state.lives - hitCount);
    }
  }

  // Moves surviving alien bullets downward by a constant per-step delta
  // (never scaled by dt) and drops any that have travelled off the bottom
  // of the play field. Runs AFTER collision resolution so this step's
  // motion never masks a same-step player hit.
  function moveAlienBullets(state) {
    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);
    state.alienBullets = state.alienBullets.filter(function (bullet) {
      return bullet.y < gameHeight;
    });
  }

  // Gameover check (slice-04, P3) — dual trigger: lives exhausted, OR any
  // alive alien (state.aliens is LIVE-by-array-membership, same rule as
  // bullets — dead aliens are already removed) has reached the player's
  // row. `.some` short-circuits on the first match.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var player = state.player;
    var alienReachedRow = state.aliens.some(function (alien) {
      return alien.y + alien.height >= player.y;
    });
    if (alienReachedRow) {
      state.state = 'gameover';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality guard (slice-04, P3): once gameover, every further
    // update() call is a no-op — lives/score/state stay frozen. Must be
    // the very first thing update() does, before any mutation below.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);
    resolveAlienBulletPlayerCollisions(state);
    moveAlienBullets(state);
    checkGameOver(state);
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

  // slice-04: alien fire (P3). Fixed per-step constants, never scaled by
  // dt, mirroring ALIEN_STEP_X/ALIEN_ROW_STEP above.
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
  ALIEN_FIRE_INTERVAL_STEPS: 30, // fixed steps between alien-fire events
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

  // slice-04 (P3): alien-bullet factory, spawned from the firing alien's
  // position, travelling downward (+y). Width/height read from SI.Config
  // (fire constants), not hardcoded here, per the config-constants
  // convention for slice-04 additions.
  function spawnAlienBullet(alien) {
    var cfg = window.SI.Config;
    return {
      x: alien.x + alien.width / 2 - cfg.ALIEN_BULLET_WIDTH / 2,
      y: alien.y + alien.height,
      width: cfg.ALIEN_BULLET_WIDTH,
      height: cfg.ALIEN_BULLET_HEIGHT,
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
          col: col, // slice-04 (P3): needed to pick a firing column
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // pickFiringAlien — PURE. Given the (already-alive-only, per array-
  // membership) `aliens` array and a `randomValue` in [0, 1) (the caller's
  // SI.RNG.next() result — this function never touches RNG itself so it
  // stays pure/testable), picks one column uniformly at random among the
  // distinct columns currently occupied by an alien, then returns the
  // front-most (largest y, i.e. closest to the player) alien in that
  // column. Returns null when `aliens` is empty. Same inputs always yield
  // the same output.
  function pickFiringAlien(aliens, randomValue) {
    if (aliens.length === 0) {
      return null;
    }

    var cols = aliens.reduce(function (acc, alien) {
      if (acc.indexOf(alien.col) === -1) {
        acc.push(alien.col);
      }
      return acc;
    }, []);

    var idx = Math.floor(randomValue * cols.length);
    if (idx >= cols.length) {
      idx = cols.length - 1; // guard a randomValue of exactly 1
    }
    var chosenCol = cols[idx];

    return aliens
      .filter(function (alien) {
        return alien.col === chosenCol;
      })
      .reduce(function (frontMost, alien) {
        return alien.y > frontMost.y ? alien : frontMost;
      });
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    pickFiringAlien: pickFiringAlien,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: P1/P2 kept as the original imperative
// index-loop update over struct-of-arrays-style entity arrays; the P3
// additions below (alien fire, alien-bullet-vs-player collision, alien
// bullet motion, gameover check) are written as small pure/functional
// helpers (map/filter/reduce) over `state`, per this slice's assigned
// specimen strategy.
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04, P3) — internal only, same "accumulated
  // update()-call counter, never wall-clock" pattern as marchStepCounter,
  // so N identical update() calls always fire at the same steps for a
  // given seed.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien fire (slice-04, P3) — PURE-ish orchestration: every
  // ALIEN_FIRE_INTERVAL_STEPS fixed steps, one column is chosen via
  // exactly one SI.RNG.next() call (so seeding makes firing deterministic)
  // and the front-most alive alien in that column spawns an alien bullet.
  // Wholesale array replacement (concat, not push) per this specimen's
  // functional-style convention.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var randomValue = window.SI.RNG.next();
    var firingAlien = window.SI.Alien.pickFiringAlien(state.aliens, randomValue);
    if (firingAlien) {
      state.alienBullets = state.alienBullets.concat([
        window.SI.Bullet.spawnAlienBullet(firingAlien),
      ]);
    }
  }

  // alienBullet-vs-player collision (slice-04, P3) — checked on PRE-MOTION
  // positions (before moveAlienBullets runs this same step), so a bullet
  // injected directly into gameState.alienBullets already overlapping the
  // player collides on the very update() call that observes it, even
  // before any movement is applied. Every alien bullet overlapping the
  // player this step is consumed (filter) and lives decrements by exactly
  // 1 per bullet consumed (reduce), clamped so lives never goes negative
  // (gameover is keyed off lives === 0, not lives < 0).
  function resolveAlienBulletPlayerCollisions(state) {
    var player = state.player;
    var bullets = state.alienBullets;

    var hitCount = bullets.reduce(function (count, bullet) {
      return window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player))
        ? count + 1
        : count;
    }, 0);

    state.alienBullets = bullets.filter(function (bullet) {
      return !window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player));
    });

    if (hitCount > 0) {
      state.lives = Math.max(0, state.lives - hitCount);
    }
  }

  // Moves surviving alien bullets downward by a constant per-step delta
  // (never scaled by dt) and drops any that have travelled off the bottom
  // of the play field. Runs AFTER collision resolution so this step's
  // motion never masks a same-step player hit.
  function moveAlienBullets(state) {
    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);
    state.alienBullets = state.alienBullets.filter(function (bullet) {
      return bullet.y < gameHeight;
    });
  }

  // Gameover check (slice-04, P3) — dual trigger: lives exhausted, OR any
  // alive alien (state.aliens is LIVE-by-array-membership, same rule as
  // bullets — dead aliens are already removed) has reached the player's
  // row. `.some` short-circuits on the first match.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var player = state.player;
    var alienReachedRow = state.aliens.some(function (alien) {
      return alien.y + alien.height >= player.y;
    });
    if (alienReachedRow) {
      state.state = 'gameover';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality guard (slice-04, P3): once gameover, every further
    // update() call is a no-op — lives/score/state stay frozen. Must be
    // the very first thing update() does, before any mutation below.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);
    resolveAlienBulletPlayerCollisions(state);
    moveAlienBullets(state);
    checkGameOver(state);
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
          col: col, // slice-04 (P3): needed to pick a firing column
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // pickFiringAlien — PURE. Given the (already-alive-only, per array-
  // membership) `aliens` array and a `randomValue` in [0, 1) (the caller's
  // SI.RNG.next() result — this function never touches RNG itself so it
  // stays pure/testable), picks one column uniformly at random among the
  // distinct columns currently occupied by an alien, then returns the
  // front-most (largest y, i.e. closest to the player) alien in that
  // column. Returns null when `aliens` is empty. Same inputs always yield
  // the same output.
  function pickFiringAlien(aliens, randomValue) {
    if (aliens.length === 0) {
      return null;
    }

    var cols = aliens.reduce(function (acc, alien) {
      if (acc.indexOf(alien.col) === -1) {
        acc.push(alien.col);
      }
      return acc;
    }, []);

    var idx = Math.floor(randomValue * cols.length);
    if (idx >= cols.length) {
      idx = cols.length - 1; // guard a randomValue of exactly 1
    }
    var chosenCol = cols[idx];

    return aliens
      .filter(function (alien) {
        return alien.col === chosenCol;
      })
      .reduce(function (frontMost, alien) {
        return alien.y > frontMost.y ? alien : frontMost;
      });
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    pickFiringAlien: pickFiringAlien,
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

  // slice-04 (P3): alien-bullet factory, spawned from the firing alien's
  // position, travelling downward (+y). Width/height read from SI.Config
  // (fire constants), not hardcoded here, per the config-constants
  // convention for slice-04 additions.
  function spawnAlienBullet(alien) {
    var cfg = window.SI.Config;
    return {
      x: alien.x + alien.width / 2 - cfg.ALIEN_BULLET_WIDTH / 2,
      y: alien.y + alien.height,
      width: cfg.ALIEN_BULLET_WIDTH,
      height: cfg.ALIEN_BULLET_HEIGHT,
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

  // slice-04: alien fire (P3). Fixed per-step constants, never scaled by
  // dt, mirroring ALIEN_STEP_X/ALIEN_ROW_STEP above.
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
  ALIEN_FIRE_INTERVAL_STEPS: 30, // fixed steps between alien-fire events
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: P1/P2 kept as the original imperative
// index-loop update over struct-of-arrays-style entity arrays; the P3
// additions below (alien fire, alien-bullet-vs-player collision, alien
// bullet motion, gameover check) are written as small pure/functional
// helpers (map/filter/reduce) over `state`, per this slice's assigned
// specimen strategy.
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04, P3) — internal only, same "accumulated
  // update()-call counter, never wall-clock" pattern as marchStepCounter,
  // so N identical update() calls always fire at the same steps for a
  // given seed.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // Alien fire (slice-04, P3) — PURE-ish orchestration: every
  // ALIEN_FIRE_INTERVAL_STEPS fixed steps, one column is chosen via
  // exactly one SI.RNG.next() call (so seeding makes firing deterministic)
  // and the front-most alive alien in that column spawns an alien bullet.
  // Wholesale array replacement (concat, not push) per this specimen's
  // functional-style convention.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var randomValue = window.SI.RNG.next();
    var firingAlien = window.SI.Alien.pickFiringAlien(state.aliens, randomValue);
    if (firingAlien) {
      state.alienBullets = state.alienBullets.concat([
        window.SI.Bullet.spawnAlienBullet(firingAlien),
      ]);
    }
  }

  // alienBullet-vs-player collision (slice-04, P3) — checked on PRE-MOTION
  // positions (before moveAlienBullets runs this same step), so a bullet
  // injected directly into gameState.alienBullets already overlapping the
  // player collides on the very update() call that observes it, even
  // before any movement is applied. Every alien bullet overlapping the
  // player this step is consumed (filter) and lives decrements by exactly
  // 1 per bullet consumed (reduce), clamped so lives never goes negative
  // (gameover is keyed off lives === 0, not lives < 0).
  function resolveAlienBulletPlayerCollisions(state) {
    var player = state.player;
    var bullets = state.alienBullets;

    var hitCount = bullets.reduce(function (count, bullet) {
      return window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player))
        ? count + 1
        : count;
    }, 0);

    state.alienBullets = bullets.filter(function (bullet) {
      return !window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player));
    });

    if (hitCount > 0) {
      state.lives = Math.max(0, state.lives - hitCount);
    }
  }

  // Moves surviving alien bullets downward by a constant per-step delta
  // (never scaled by dt) and drops any that have travelled off the bottom
  // of the play field. Runs AFTER collision resolution so this step's
  // motion never masks a same-step player hit.
  function moveAlienBullets(state) {
    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);
    state.alienBullets = state.alienBullets.filter(function (bullet) {
      return bullet.y < gameHeight;
    });
  }

  // Gameover check (slice-04, P3) — dual trigger: lives exhausted, OR any
  // alive alien (state.aliens is LIVE-by-array-membership, same rule as
  // bullets — dead aliens are already removed) has reached the player's
  // row. `.some` short-circuits on the first match.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var player = state.player;
    var alienReachedRow = state.aliens.some(function (alien) {
      return alien.y + alien.height >= player.y;
    });
    if (alienReachedRow) {
      state.state = 'gameover';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality guard (slice-04, P3): once gameover, every further
    // update() call is a no-op — lives/score/state stay frozen. Must be
    // the very first thing update() does, before any mutation below.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);
    resolveAlienBulletPlayerCollisions(state);
    moveAlienBullets(state);
    checkGameOver(state);
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

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire cadence + bullet tuning (P3). Cadence is an
  // update()-call counter, never wall-clock (same pattern as march), so
  // repeated update() calls reproduce the same fire schedule exactly.
  ALIEN_FIRE_INTERVAL_STEPS: 60, // fixed-steps between alien fire events
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
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

  // slice-04 (P3): alien bullet — same {x,y,width,height} shape as a player
  // bullet (reuses the same dimensions, no separate size constant needed),
  // spawned from the firing alien's bottom-center. game.js drives it
  // downward via updateBullets() with SI.Config.ALIEN_BULLET_SPEED (a
  // positive dy, vs. the player bullet's negative dy).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // slice-04 (P3): pick which alien fires on a fire event. Picks a column
  // via SI.RNG.next() (so a given seed always fires from the same column
  // sequence), then the frontmost (largest y = closest to the player)
  // surviving alien in that column. `col` is a fixed identity assigned at
  // grid creation (see createGrid) rather than recomputed from `x`, since
  // the rigid-block march (SI.Game) shifts every alien's x by the same
  // delta and would otherwise desync a position-based column lookup from
  // the true column index. Returns null if no alien survives in the chosen
  // column this event (RNG is still consumed exactly once either way, so
  // the fire schedule stays deterministic under a seed).
  function selectFiringAlien(aliens) {
    var cfg = window.SI.Config;
    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard the (extremely unlikely) next()===1 edge
    }

    var chosen = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col === col && (chosen === null || a.y > chosen.y)) {
        chosen = a;
      }
    }
    return chosen;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    selectFiringAlien: selectFiringAlien,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Config-driven cadence: both
// the alien march and alien fire are internal fixed-step counters compared
// against named SI.Config intervals, never wall-clock. Game phase is an
// explicit state machine: state.state is 'playing' or 'gameover' (see
// checkGameOver / the terminal-freeze guard at the top of update()).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // slice-04 (P3) — alien fire cadence: same pattern as marchStepCounter,
  // an internal fixed-step counter (never wall-clock, never scaled by dt's
  // magnitude) compared against SI.Config.ALIEN_FIRE_INTERVAL_STEPS, so N
  // identical update() calls always reproduce the same fire schedule for a
  // given RNG seed.
  var fireStepCounter = 0;

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // slice-04 (P3) — alien fire: cadence-gated by an internal fixed-step
  // counter vs. SI.Config.ALIEN_FIRE_INTERVAL_STEPS (same style as
  // marchGrid's cadence). On a due fire event, SI.Alien.selectFiringAlien()
  // is called exactly once (consuming exactly one SI.RNG.next()) so the
  // fire schedule is deterministic under a seed regardless of whether the
  // chosen column happens to be empty that event.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var shooter = window.SI.Alien.selectFiringAlien(state.aliens);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // TEST-FACING (P3): alienBullets entries are plain {x,y,width,height}
  // objects, LIVE by array-membership alone (same rule as playerBullets —
  // no private velocity/alive field is read or required), so a bullet
  // injected directly into gameState.alienBullets by a test is collidable
  // on the very next update(). Each bullet overlapping the player (via
  // SI.Collision.aabbOverlap) decrements lives by exactly 1 and is removed.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var survivingBullets = [];
    var playerAabb = toAabb(state.player);

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivingBullets.push(bullets[i]);
      }
    }

    state.alienBullets = survivingBullets;
  }

  // Gameover trigger (P3), dual condition: lives exhausted, OR any
  // surviving (== alive, since dead aliens are already filtered out of
  // state.aliens by resolveBulletAlienCollisions) alien's row has reached
  // the player's row, geometrically: alien.y + alien.height >= player.y.
  function checkGameOver(state) {
    if (state.lives <= 0) {
      return true;
    }
    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.y + a.height >= state.player.y) {
        return true;
      }
    }
    return false;
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality (P3): once gameover, update() is a no-op — lives, score,
    // state, and every entity are frozen exactly as they were at the
    // transition. This guard is the single choke point every update() call
    // routes through, so there's no separate "don't decrement lives" /
    // "don't advance march" special-casing needed downstream.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement: drop alien bullets that have travelled
    // off the bottom of the play field.
    var alienBulletsOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienBulletsOnScreen.push(ab);
      }
    }
    state.alienBullets = alienBulletsOnScreen;

    resolveAlienBulletPlayerCollisions(state);

    if (checkGameOver(state)) {
      state.state = 'gameover';
    }
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

  // slice-04: alien fire cadence + bullet tuning (P3). Cadence is an
  // update()-call counter, never wall-clock (same pattern as march), so
  // repeated update() calls reproduce the same fire schedule exactly.
  ALIEN_FIRE_INTERVAL_STEPS: 60, // fixed-steps between alien fire events
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
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

  // slice-04 (P3): alien bullet — same {x,y,width,height} shape as a player
  // bullet (reuses the same dimensions, no separate size constant needed),
  // spawned from the firing alien's bottom-center. game.js drives it
  // downward via updateBullets() with SI.Config.ALIEN_BULLET_SPEED (a
  // positive dy, vs. the player bullet's negative dy).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // slice-04 (P3): pick which alien fires on a fire event. Picks a column
  // via SI.RNG.next() (so a given seed always fires from the same column
  // sequence), then the frontmost (largest y = closest to the player)
  // surviving alien in that column. `col` is a fixed identity assigned at
  // grid creation (see createGrid) rather than recomputed from `x`, since
  // the rigid-block march (SI.Game) shifts every alien's x by the same
  // delta and would otherwise desync a position-based column lookup from
  // the true column index. Returns null if no alien survives in the chosen
  // column this event (RNG is still consumed exactly once either way, so
  // the fire schedule stays deterministic under a seed).
  function selectFiringAlien(aliens) {
    var cfg = window.SI.Config;
    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard the (extremely unlikely) next()===1 edge
    }

    var chosen = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col === col && (chosen === null || a.y > chosen.y)) {
        chosen = a;
      }
    }
    return chosen;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    selectFiringAlien: selectFiringAlien,
  };
})();

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Config-driven cadence: both
// the alien march and alien fire are internal fixed-step counters compared
// against named SI.Config intervals, never wall-clock. Game phase is an
// explicit state machine: state.state is 'playing' or 'gameover' (see
// checkGameOver / the terminal-freeze guard at the top of update()).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // slice-04 (P3) — alien fire cadence: same pattern as marchStepCounter,
  // an internal fixed-step counter (never wall-clock, never scaled by dt's
  // magnitude) compared against SI.Config.ALIEN_FIRE_INTERVAL_STEPS, so N
  // identical update() calls always reproduce the same fire schedule for a
  // given RNG seed.
  var fireStepCounter = 0;

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // slice-04 (P3) — alien fire: cadence-gated by an internal fixed-step
  // counter vs. SI.Config.ALIEN_FIRE_INTERVAL_STEPS (same style as
  // marchGrid's cadence). On a due fire event, SI.Alien.selectFiringAlien()
  // is called exactly once (consuming exactly one SI.RNG.next()) so the
  // fire schedule is deterministic under a seed regardless of whether the
  // chosen column happens to be empty that event.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var shooter = window.SI.Alien.selectFiringAlien(state.aliens);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // TEST-FACING (P3): alienBullets entries are plain {x,y,width,height}
  // objects, LIVE by array-membership alone (same rule as playerBullets —
  // no private velocity/alive field is read or required), so a bullet
  // injected directly into gameState.alienBullets by a test is collidable
  // on the very next update(). Each bullet overlapping the player (via
  // SI.Collision.aabbOverlap) decrements lives by exactly 1 and is removed.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var survivingBullets = [];
    var playerAabb = toAabb(state.player);

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivingBullets.push(bullets[i]);
      }
    }

    state.alienBullets = survivingBullets;
  }

  // Gameover trigger (P3), dual condition: lives exhausted, OR any
  // surviving (== alive, since dead aliens are already filtered out of
  // state.aliens by resolveBulletAlienCollisions) alien's row has reached
  // the player's row, geometrically: alien.y + alien.height >= player.y.
  function checkGameOver(state) {
    if (state.lives <= 0) {
      return true;
    }
    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.y + a.height >= state.player.y) {
        return true;
      }
    }
    return false;
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality (P3): once gameover, update() is a no-op — lives, score,
    // state, and every entity are frozen exactly as they were at the
    // transition. This guard is the single choke point every update() call
    // routes through, so there's no separate "don't decrement lives" /
    // "don't advance march" special-casing needed downstream.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement: drop alien bullets that have travelled
    // off the bottom of the play field.
    var alienBulletsOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienBulletsOnScreen.push(ab);
      }
    }
    state.alienBullets = alienBulletsOnScreen;

    resolveAlienBulletPlayerCollisions(state);

    if (checkGameOver(state)) {
      state.state = 'gameover';
    }
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
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
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

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  // slice-04 (P3): pick which alien fires on a fire event. Picks a column
  // via SI.RNG.next() (so a given seed always fires from the same column
  // sequence), then the frontmost (largest y = closest to the player)
  // surviving alien in that column. `col` is a fixed identity assigned at
  // grid creation (see createGrid) rather than recomputed from `x`, since
  // the rigid-block march (SI.Game) shifts every alien's x by the same
  // delta and would otherwise desync a position-based column lookup from
  // the true column index. Returns null if no alien survives in the chosen
  // column this event (RNG is still consumed exactly once either way, so
  // the fire schedule stays deterministic under a seed).
  function selectFiringAlien(aliens) {
    var cfg = window.SI.Config;
    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard the (extremely unlikely) next()===1 edge
    }

    var chosen = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col === col && (chosen === null || a.y > chosen.y)) {
        chosen = a;
      }
    }
    return chosen;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    selectFiringAlien: selectFiringAlien,
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

  // slice-04 (P3): alien bullet — same {x,y,width,height} shape as a player
  // bullet (reuses the same dimensions, no separate size constant needed),
  // spawned from the firing alien's bottom-center. game.js drives it
  // downward via updateBullets() with SI.Config.ALIEN_BULLET_SPEED (a
  // positive dy, vs. the player bullet's negative dy).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
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

  // slice-04: alien fire cadence + bullet tuning (P3). Cadence is an
  // update()-call counter, never wall-clock (same pattern as march), so
  // repeated update() calls reproduce the same fire schedule exactly.
  ALIEN_FIRE_INTERVAL_STEPS: 60, // fixed-steps between alien fire events
  ALIEN_BULLET_SPEED: 4, // px per fixed step, downward (+y)
};

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Config-driven cadence: both
// the alien march and alien fire are internal fixed-step counters compared
// against named SI.Config intervals, never wall-clock. Game phase is an
// explicit state machine: state.state is 'playing' or 'gameover' (see
// checkGameOver / the terminal-freeze guard at the top of update()).
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // slice-04 (P3) — alien fire cadence: same pattern as marchStepCounter,
  // an internal fixed-step counter (never wall-clock, never scaled by dt's
  // magnitude) compared against SI.Config.ALIEN_FIRE_INTERVAL_STEPS, so N
  // identical update() calls always reproduce the same fire schedule for a
  // given RNG seed.
  var fireStepCounter = 0;

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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
    var interval = window.SI.Alien.marchInterval(aliens.length);
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

  // slice-04 (P3) — alien fire: cadence-gated by an internal fixed-step
  // counter vs. SI.Config.ALIEN_FIRE_INTERVAL_STEPS (same style as
  // marchGrid's cadence). On a due fire event, SI.Alien.selectFiringAlien()
  // is called exactly once (consuming exactly one SI.RNG.next()) so the
  // fire schedule is deterministic under a seed regardless of whether the
  // chosen column happens to be empty that event.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var shooter = window.SI.Alien.selectFiringAlien(state.aliens);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // TEST-FACING (P3): alienBullets entries are plain {x,y,width,height}
  // objects, LIVE by array-membership alone (same rule as playerBullets —
  // no private velocity/alive field is read or required), so a bullet
  // injected directly into gameState.alienBullets by a test is collidable
  // on the very next update(). Each bullet overlapping the player (via
  // SI.Collision.aabbOverlap) decrements lives by exactly 1 and is removed.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var survivingBullets = [];
    var playerAabb = toAabb(state.player);

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivingBullets.push(bullets[i]);
      }
    }

    state.alienBullets = survivingBullets;
  }

  // Gameover trigger (P3), dual condition: lives exhausted, OR any
  // surviving (== alive, since dead aliens are already filtered out of
  // state.aliens by resolveBulletAlienCollisions) alien's row has reached
  // the player's row, geometrically: alien.y + alien.height >= player.y.
  function checkGameOver(state) {
    if (state.lives <= 0) {
      return true;
    }
    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.y + a.height >= state.player.y) {
        return true;
      }
    }
    return false;
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality (P3): once gameover, update() is a no-op — lives, score,
    // state, and every entity are frozen exactly as they were at the
    // transition. This guard is the single choke point every update() call
    // routes through, so there's no separate "don't decrement lives" /
    // "don't advance march" special-casing needed downstream.
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

    resolveBulletAlienCollisions(state);

    marchGrid(state);

    resolveAlienFire(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement: drop alien bullets that have travelled
    // off the bottom of the play field.
    var alienBulletsOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienBulletsOnScreen.push(ab);
      }
    }
    state.alienBullets = alienBulletsOnScreen;

    resolveAlienBulletPlayerCollisions(state);

    if (checkGameOver(state)) {
      state.state = 'gameover';
    }
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
