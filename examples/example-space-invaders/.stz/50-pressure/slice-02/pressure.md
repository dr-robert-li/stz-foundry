---
summary: "Pressure log slice-02: 3 culled."
---

# Pressure log — slice-02

## specimen-B
- **culled because:** gate testPassRate=0.94

```diff
+++ build.js
// build.js — concatenates src/ (dependency order) into dist/game.js and
// wraps it into dist/index.html. Node builtins only (fs, path), per the
// zero-dependency rule. Idempotent: safe to run repeatedly, always
// overwrites dist/ with a fresh build from current src/.
'use strict';

var fs = require('fs');
var path = require('path');

var SRC_DIR = path.join(__dirname, 'src');
var DIST_DIR = path.join(__dirname, 'dist');

// Concatenation order = dependency order (matches conventions.md).
var MODULES = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'game.js',
];

function build() {
  var banner = '// GENERATED FILE — do not hand-edit. Produced by build.js from src/.\n';

  var bundle = banner + MODULES.map(function (name) {
    var filePath = path.join(SRC_DIR, name);
    var contents = fs.readFileSync(filePath, 'utf8');
    return '// ---- ' + name + ' ----\n' + contents;
  }).join('\n');

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);

  var html =
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>Space Invaders</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<script>\n' +
    bundle +
    '\n</script>\n' +
    '</body>\n' +
    '</html>\n';

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
}

build();

module.exports = build;

+++ dist/game.js
// GENERATED FILE — do not hand-edit. Produced by build.js from src/.
// ---- rng.js ----
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

// ---- collision.js ----
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

// ---- config.js ----
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

// ---- loop.js ----
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

// ---- player.js ----
// SI.Player — player-ship entity. Small class with a movement method;
// game.js reads/writes plain state via toState(), per ADR-003 (gameState
// entities must stay plain, serializable {x,y,width,height} objects).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Player(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // Moves by a constant per-step delta (never scaled by dt, per contract)
  // and clamps in place to [0, boundsWidth - width].
  Player.prototype.moveAndClamp = function (dx, boundsWidth) {
    this.x += dx;
    if (this.x < 0) {
      this.x = 0;
    }
    var maxX = boundsWidth - this.width;
    if (this.x > maxX) {
      this.x = maxX;
    }
  };

  Player.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  window.SI.Player = Player;
})();

// ---- bullet.js ----
// SI.Bullet — player-bullet factory + straight-line motion. game.js keeps
// the authoritative array as plain {x,y,width,height} objects (per
// ADR-003 and the CRITICAL array-membership rule: any bare object present
// in gameState.playerBullets is a live bullet, not just ones spawned via
// this factory), so this module only supplies construction + a pure
// step helper, never a "am I real" flag.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Bullet(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  Bullet.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  // Builds a player bullet centered above the player's current position.
  function spawnPlayerBullet(player, bulletWidth, bulletHeight) {
    var x = player.x + player.width / 2 - bulletWidth / 2;
    var y = player.y - bulletHeight;
    return new Bullet(x, y, bulletWidth, bulletHeight);
  }

  // Pure step: constant per-step delta (never *dt), moving up (-y).
  // Operates on any plain {x,y,width,height} object, not just Bullet
  // instances, so externally-injected bare bullets move identically.
  function stepPlayerBullet(bullet, speed) {
    return {
      x: bullet.x,
      y: bullet.y - speed,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = Bullet;
  window.SI.Bullet.spawnPlayerBullet = spawnPlayerBullet;
  window.SI.Bullet.stepPlayerBullet = stepPlayerBullet;
})();

// ---- alien.js ----
// SI.Alien — static (non-marching, that's a later slice) alien-grid
// entity. Small class wrapping the plain fields; game.js reads/writes
// gameState.aliens as plain {x,y,width,height,row,alive,points} objects
// via toState(), per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Alien(x, y, width, height, row, points) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.row = row;
    this.points = points;
    this.alive = true;
  }

  Alien.prototype.toState = function () {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      row: this.row,
      alive: this.alive,
      points: this.points,
    };
  };

  // Classic 5x11 point mapping: back row (row 0, top) worth the most.
  function pointsForRow(row, cfg) {
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row === 1 || row === 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  // Builds the full rows x cols grid, centered horizontally within
  // boundsWidth, starting at originY.
  function buildGrid(opts) {
    var rows = opts.rows;
    var cols = opts.cols;
    var alienWidth = opts.alienWidth;
    var alienHeight = opts.alienHeight;
    var spacingX = opts.spacingX;
    var spacingY = opts.spacingY;
    var originY = opts.originY;
    var cfg = opts.cfg;

    var gridWidth = cols * spacingX;
    var originX = (opts.boundsWidth - gridWidth) / 2 + (spacingX - alienWidth) / 2;

    var aliens = [];
    for (var row = 0; row < rows; row++) {
      var points = pointsForRow(row, cfg);
      for (var col = 0; col < cols; col++) {
        var x = originX + col * spacingX;
        var y = originY + row * spacingY;
        aliens.push(new Alien(x, y, alienWidth, alienHeight, row, points));
      }
    }
    return aliens;
  }

  window.SI.Alien = Alien;
  window.SI.Alien.buildGrid = buildGrid;
  window.SI.Alien.pointsForRow = pointsForRow;
})();

// ---- game.js ----
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). Owns window.gameState (ADR-003) and drives
// SI.Player / SI.Bullet / SI.Alien each fixed step (ADR-002).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var cfg = window.SI.Config;

  // Slice-02-only constants, grouped onto the shared SI.Config object
  // (per conventions.md) rather than left as bare module-level literals.
  // config.js itself (the foundation module) ships only the constants
  // slice-01 needed; extending the same object here keeps "one SI.Config"
  // true without hand-editing a copied foundation file.
  Object.assign(cfg, {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,

    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 20,
    PLAYER_SPEED: 5, // px per fixed step, constant — never scaled by dt
    PLAYER_MARGIN_BOTTOM: 30,

    BULLET_WIDTH: 4,
    BULLET_HEIGHT: 12,
    BULLET_SPEED: 8, // px per fixed step, constant — never scaled by dt

    ALIEN_WIDTH: 30,
    ALIEN_HEIGHT: 20,
    ALIEN_SPACING_X: 45,
    ALIEN_SPACING_Y: 35,
    ALIEN_ORIGIN_Y: 60,
  });

  var width, height;
  var player; // SI.Player instance (private, mirrored into state.player)
  var aliens; // array of SI.Alien instances (private, mirrored into state.aliens)
  var prevFire = false; // edge-detector for fire input, reset on init()

  // The single live gameState object. Fields are mutated in place;
  // arrays are replaced wholesale each update (ADR-003) — never
  // reassign this variable itself, or window.gameState / SI.Game.state
  // would go stale relative to each other.
  var state = {
    state: 'ready',
    score: 0,
    lives: cfg.STARTING_LIVES,
    wave: 1,
    fps: 60,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  // SI.Collision.aabbOverlap (foundation, copied verbatim) takes {x,y,w,h};
  // gameState entities are {x,y,width,height} per ADR-003. Adapt at the
  // call site rather than editing the copied collision.js.
  function toAabb(o) {
    return { x: o.x, y: o.y, w: o.width, h: o.height };
  }

  function init(opts) {
    opts = opts || {};
    width = opts.width || cfg.DEFAULT_WIDTH;
    height = opts.height || cfg.DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    player = new window.SI.Player(
      (width - cfg.PLAYER_WIDTH) / 2,
      height - cfg.PLAYER_HEIGHT - cfg.PLAYER_MARGIN_BOTTOM,
      cfg.PLAYER_WIDTH,
      cfg.PLAYER_HEIGHT
    );

    aliens = window.SI.Alien.buildGrid({
      rows: cfg.ALIEN_ROWS,
      cols: cfg.ALIEN_COLS,
      alienWidth: cfg.ALIEN_WIDTH,
      alienHeight: cfg.ALIEN_HEIGHT,
      spacingX: cfg.ALIEN_SPACING_X,
      spacingY: cfg.ALIEN_SPACING_Y,
      originY: cfg.ALIEN_ORIGIN_Y,
      boundsWidth: width,
      cfg: cfg,
    });

    prevFire = false;

    state.state = 'playing';
    state.score = 0;
    state.lives = cfg.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = player.toState();
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;
  }

  // Exactly one fixed step. dt is accepted (per SI.Loop's calling
  // convention / ADR-002) but every motion below is a constant per-step
  // delta — dt is never multiplied into a position update.
  function update(dt) { // eslint-disable-line no-unused-vars
    var input = window.SI.Game.input;

    // --- player: move + clamp to [0, width - player.width] ---
    var dx = 0;
    if (input.left) {
      dx -= cfg.PLAYER_SPEED;
    }
    if (input.right) {
      dx += cfg.PLAYER_SPEED;
    }
    player.moveAndClamp(dx, width);
    state.player = player.toState();

    // --- fire: edge-triggered, exactly one bullet per press-edge ---
    var fireNow = !!input.fire;
    var bullets = state.playerBullets.slice();
    if (fireNow && !prevFire) {
      bullets.push(
        window.SI.Bullet.spawnPlayerBullet(player, cfg.BULLET_WIDTH, cfg.BULLET_HEIGHT).toState()
      );
    }
    prevFire = fireNow;

    // --- bullet-vs-alien collision, checked at each bullet's current
    // position. Array membership alone makes an object a live bullet —
    // a bare {x,y,width,height} object pushed onto gameState.playerBullets
    // from outside is checked exactly like a spawned one. ---
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitAlien = null;
      for (var j = 0; j < aliens.length; j++) {
        var alien = aliens[j];
        if (!alien.alive) {
          continue;
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(alien))) {
          hitAlien = alien;
          break;
        }
      }
      if (hitAlien) {
        hitAlien.alive = false;
        state.score += hitAlien.points;
      } else {
        survivors.push(bullet);
      }
    }

    // --- straight-line motion for surviving bullets, constant per-step
    // delta; drop bullets once fully off the top of the field ---
    var moved = [];
    for (var k = 0; k < survivors.length; k++) {
      var next = window.SI.Bullet.stepPlayerBullet(survivors[k], cfg.BULLET_SPEED);
      if (next.y + next.height > 0) {
        moved.push(next);
      }
    }

    aliens = aliens.filter(function (a) {
      return a.alive;
    });

    state.playerBullets = moved;
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
  }

  window.SI.Game = {
    input: { left: false, right: false, fire: false },
    state: state,
    init: init,
    update: update,
  };

  window.gameState = state;
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Space Invaders</title>
</head>
<body>
<script>
// GENERATED FILE — do not hand-edit. Produced by build.js from src/.
// ---- rng.js ----
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

// ---- collision.js ----
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

// ---- config.js ----
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

// ---- loop.js ----
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

// ---- player.js ----
// SI.Player — player-ship entity. Small class with a movement method;
// game.js reads/writes plain state via toState(), per ADR-003 (gameState
// entities must stay plain, serializable {x,y,width,height} objects).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Player(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // Moves by a constant per-step delta (never scaled by dt, per contract)
  // and clamps in place to [0, boundsWidth - width].
  Player.prototype.moveAndClamp = function (dx, boundsWidth) {
    this.x += dx;
    if (this.x < 0) {
      this.x = 0;
    }
    var maxX = boundsWidth - this.width;
    if (this.x > maxX) {
      this.x = maxX;
    }
  };

  Player.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  window.SI.Player = Player;
})();

// ---- bullet.js ----
// SI.Bullet — player-bullet factory + straight-line motion. game.js keeps
// the authoritative array as plain {x,y,width,height} objects (per
// ADR-003 and the CRITICAL array-membership rule: any bare object present
// in gameState.playerBullets is a live bullet, not just ones spawned via
// this factory), so this module only supplies construction + a pure
// step helper, never a "am I real" flag.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Bullet(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  Bullet.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  // Builds a player bullet centered above the player's current position.
  function spawnPlayerBullet(player, bulletWidth, bulletHeight) {
    var x = player.x + player.width / 2 - bulletWidth / 2;
    var y = player.y - bulletHeight;
    return new Bullet(x, y, bulletWidth, bulletHeight);
  }

  // Pure step: constant per-step delta (never *dt), moving up (-y).
  // Operates on any plain {x,y,width,height} object, not just Bullet
  // instances, so externally-injected bare bullets move identically.
  function stepPlayerBullet(bullet, speed) {
    return {
      x: bullet.x,
      y: bullet.y - speed,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = Bullet;
  window.SI.Bullet.spawnPlayerBullet = spawnPlayerBullet;
  window.SI.Bullet.stepPlayerBullet = stepPlayerBullet;
})();

// ---- alien.js ----
// SI.Alien — static (non-marching, that's a later slice) alien-grid
// entity. Small class wrapping the plain fields; game.js reads/writes
// gameState.aliens as plain {x,y,width,height,row,alive,points} objects
// via toState(), per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Alien(x, y, width, height, row, points) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.row = row;
    this.points = points;
    this.alive = true;
  }

  Alien.prototype.toState = function () {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      row: this.row,
      alive: this.alive,
      points: this.points,
    };
  };

  // Classic 5x11 point mapping: back row (row 0, top) worth the most.
  function pointsForRow(row, cfg) {
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row === 1 || row === 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  // Builds the full rows x cols grid, centered horizontally within
  // boundsWidth, starting at originY.
  function buildGrid(opts) {
    var rows = opts.rows;
    var cols = opts.cols;
    var alienWidth = opts.alienWidth;
    var alienHeight = opts.alienHeight;
    var spacingX = opts.spacingX;
    var spacingY = opts.spacingY;
    var originY = opts.originY;
    var cfg = opts.cfg;

    var gridWidth = cols * spacingX;
    var originX = (opts.boundsWidth - gridWidth) / 2 + (spacingX - alienWidth) / 2;

    var aliens = [];
    for (var row = 0; row < rows; row++) {
      var points = pointsForRow(row, cfg);
      for (var col = 0; col < cols; col++) {
        var x = originX + col * spacingX;
        var y = originY + row * spacingY;
        aliens.push(new Alien(x, y, alienWidth, alienHeight, row, points));
      }
    }
    return aliens;
  }

  window.SI.Alien = Alien;
  window.SI.Alien.buildGrid = buildGrid;
  window.SI.Alien.pointsForRow = pointsForRow;
})();

// ---- game.js ----
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). Owns window.gameState (ADR-003) and drives
// SI.Player / SI.Bullet / SI.Alien each fixed step (ADR-002).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var cfg = window.SI.Config;

  // Slice-02-only constants, grouped onto the shared SI.Config object
  // (per conventions.md) rather than left as bare module-level literals.
  // config.js itself (the foundation module) ships only the constants
  // slice-01 needed; extending the same object here keeps "one SI.Config"
  // true without hand-editing a copied foundation file.
  Object.assign(cfg, {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,

    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 20,
    PLAYER_SPEED: 5, // px per fixed step, constant — never scaled by dt
    PLAYER_MARGIN_BOTTOM: 30,

    BULLET_WIDTH: 4,
    BULLET_HEIGHT: 12,
    BULLET_SPEED: 8, // px per fixed step, constant — never scaled by dt

    ALIEN_WIDTH: 30,
    ALIEN_HEIGHT: 20,
    ALIEN_SPACING_X: 45,
    ALIEN_SPACING_Y: 35,
    ALIEN_ORIGIN_Y: 60,
  });

  var width, height;
  var player; // SI.Player instance (private, mirrored into state.player)
  var aliens; // array of SI.Alien instances (private, mirrored into state.aliens)
  var prevFire = false; // edge-detector for fire input, reset on init()

  // The single live gameState object. Fields are mutated in place;
  // arrays are replaced wholesale each update (ADR-003) — never
  // reassign this variable itself, or window.gameState / SI.Game.state
  // would go stale relative to each other.
  var state = {
    state: 'ready',
    score: 0,
    lives: cfg.STARTING_LIVES,
    wave: 1,
    fps: 60,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  // SI.Collision.aabbOverlap (foundation, copied verbatim) takes {x,y,w,h};
  // gameState entities are {x,y,width,height} per ADR-003. Adapt at the
  // call site rather than editing the copied collision.js.
  function toAabb(o) {
    return { x: o.x, y: o.y, w: o.width, h: o.height };
  }

  function init(opts) {
    opts = opts || {};
    width = opts.width || cfg.DEFAULT_WIDTH;
    height = opts.height || cfg.DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    player = new window.SI.Player(
      (width - cfg.PLAYER_WIDTH) / 2,
      height - cfg.PLAYER_HEIGHT - cfg.PLAYER_MARGIN_BOTTOM,
      cfg.PLAYER_WIDTH,
      cfg.PLAYER_HEIGHT
    );

    aliens = window.SI.Alien.buildGrid({
      rows: cfg.ALIEN_ROWS,
      cols: cfg.ALIEN_COLS,
      alienWidth: cfg.ALIEN_WIDTH,
      alienHeight: cfg.ALIEN_HEIGHT,
      spacingX: cfg.ALIEN_SPACING_X,
      spacingY: cfg.ALIEN_SPACING_Y,
      originY: cfg.ALIEN_ORIGIN_Y,
      boundsWidth: width,
      cfg: cfg,
    });

    prevFire = false;

    state.state = 'playing';
    state.score = 0;
    state.lives = cfg.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = player.toState();
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;
  }

  // Exactly one fixed step. dt is accepted (per SI.Loop's calling
  // convention / ADR-002) but every motion below is a constant per-step
  // delta — dt is never multiplied into a position update.
  function update(dt) { // eslint-disable-line no-unused-vars
    var input = window.SI.Game.input;

    // --- player: move + clamp to [0, width - player.width] ---
    var dx = 0;
    if (input.left) {
      dx -= cfg.PLAYER_SPEED;
    }
    if (input.right) {
      dx += cfg.PLAYER_SPEED;
    }
    player.moveAndClamp(dx, width);
    state.player = player.toState();

    // --- fire: edge-triggered, exactly one bullet per press-edge ---
    var fireNow = !!input.fire;
    var bullets = state.playerBullets.slice();
    if (fireNow && !prevFire) {
      bullets.push(
        window.SI.Bullet.spawnPlayerBullet(player, cfg.BULLET_WIDTH, cfg.BULLET_HEIGHT).toState()
      );
    }
    prevFire = fireNow;

    // --- bullet-vs-alien collision, checked at each bullet's current
    // position. Array membership alone makes an object a live bullet —
    // a bare {x,y,width,height} object pushed onto gameState.playerBullets
    // from outside is checked exactly like a spawned one. ---
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitAlien = null;
      for (var j = 0; j < aliens.length; j++) {
        var alien = aliens[j];
        if (!alien.alive) {
          continue;
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(alien))) {
          hitAlien = alien;
          break;
        }
      }
      if (hitAlien) {
        hitAlien.alive = false;
        state.score += hitAlien.points;
      } else {
        survivors.push(bullet);
      }
    }

    // --- straight-line motion for surviving bullets, constant per-step
    // delta; drop bullets once fully off the top of the field ---
    var moved = [];
    for (var k = 0; k < survivors.length; k++) {
      var next = window.SI.Bullet.stepPlayerBullet(survivors[k], cfg.BULLET_SPEED);
      if (next.y + next.height > 0) {
        moved.push(next);
      }
    }

    aliens = aliens.filter(function (a) {
      return a.alive;
    });

    state.playerBullets = moved;
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
  }

  window.SI.Game = {
    input: { left: false, right: false, fire: false },
    state: state,
    init: init,
    update: update,
  };

  window.gameState = state;
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — static (non-marching, that's a later slice) alien-grid
// entity. Small class wrapping the plain fields; game.js reads/writes
// gameState.aliens as plain {x,y,width,height,row,alive,points} objects
// via toState(), per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Alien(x, y, width, height, row, points) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.row = row;
    this.points = points;
    this.alive = true;
  }

  Alien.prototype.toState = function () {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      row: this.row,
      alive: this.alive,
      points: this.points,
    };
  };

  // Classic 5x11 point mapping: back row (row 0, top) worth the most.
  function pointsForRow(row, cfg) {
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row === 1 || row === 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  // Builds the full rows x cols grid, centered horizontally within
  // boundsWidth, starting at originY.
  function buildGrid(opts) {
    var rows = opts.rows;
    var cols = opts.cols;
    var alienWidth = opts.alienWidth;
    var alienHeight = opts.alienHeight;
    var spacingX = opts.spacingX;
    var spacingY = opts.spacingY;
    var originY = opts.originY;
    var cfg = opts.cfg;

    var gridWidth = cols * spacingX;
    var originX = (opts.boundsWidth - gridWidth) / 2 + (spacingX - alienWidth) / 2;

    var aliens = [];
    for (var row = 0; row < rows; row++) {
      var points = pointsForRow(row, cfg);
      for (var col = 0; col < cols; col++) {
        var x = originX + col * spacingX;
        var y = originY + row * spacingY;
        aliens.push(new Alien(x, y, alienWidth, alienHeight, row, points));
      }
    }
    return aliens;
  }

  window.SI.Alien = Alien;
  window.SI.Alien.buildGrid = buildGrid;
  window.SI.Alien.pointsForRow = pointsForRow;
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line motion. game.js keeps
// the authoritative array as plain {x,y,width,height} objects (per
// ADR-003 and the CRITICAL array-membership rule: any bare object present
// in gameState.playerBullets is a live bullet, not just ones spawned via
// this factory), so this module only supplies construction + a pure
// step helper, never a "am I real" flag.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Bullet(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  Bullet.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  // Builds a player bullet centered above the player's current position.
  function spawnPlayerBullet(player, bulletWidth, bulletHeight) {
    var x = player.x + player.width / 2 - bulletWidth / 2;
    var y = player.y - bulletHeight;
    return new Bullet(x, y, bulletWidth, bulletHeight);
  }

  // Pure step: constant per-step delta (never *dt), moving up (-y).
  // Operates on any plain {x,y,width,height} object, not just Bullet
  // instances, so externally-injected bare bullets move identically.
  function stepPlayerBullet(bullet, speed) {
    return {
      x: bullet.x,
      y: bullet.y - speed,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = Bullet;
  window.SI.Bullet.spawnPlayerBullet = spawnPlayerBullet;
  window.SI.Bullet.stepPlayerBullet = stepPlayerBullet;
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
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). Owns window.gameState (ADR-003) and drives
// SI.Player / SI.Bullet / SI.Alien each fixed step (ADR-002).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var cfg = window.SI.Config;

  // Slice-02-only constants, grouped onto the shared SI.Config object
  // (per conventions.md) rather than left as bare module-level literals.
  // config.js itself (the foundation module) ships only the constants
  // slice-01 needed; extending the same object here keeps "one SI.Config"
  // true without hand-editing a copied foundation file.
  Object.assign(cfg, {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,

    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 20,
    PLAYER_SPEED: 5, // px per fixed step, constant — never scaled by dt
    PLAYER_MARGIN_BOTTOM: 30,

    BULLET_WIDTH: 4,
    BULLET_HEIGHT: 12,
    BULLET_SPEED: 8, // px per fixed step, constant — never scaled by dt

    ALIEN_WIDTH: 30,
    ALIEN_HEIGHT: 20,
    ALIEN_SPACING_X: 45,
    ALIEN_SPACING_Y: 35,
    ALIEN_ORIGIN_Y: 60,
  });

  var width, height;
  var player; // SI.Player instance (private, mirrored into state.player)
  var aliens; // array of SI.Alien instances (private, mirrored into state.aliens)
  var prevFire = false; // edge-detector for fire input, reset on init()

  // The single live gameState object. Fields are mutated in place;
  // arrays are replaced wholesale each update (ADR-003) — never
  // reassign this variable itself, or window.gameState / SI.Game.state
  // would go stale relative to each other.
  var state = {
    state: 'ready',
    score: 0,
    lives: cfg.STARTING_LIVES,
    wave: 1,
    fps: 60,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  // SI.Collision.aabbOverlap (foundation, copied verbatim) takes {x,y,w,h};
  // gameState entities are {x,y,width,height} per ADR-003. Adapt at the
  // call site rather than editing the copied collision.js.
  function toAabb(o) {
    return { x: o.x, y: o.y, w: o.width, h: o.height };
  }

  function init(opts) {
    opts = opts || {};
    width = opts.width || cfg.DEFAULT_WIDTH;
    height = opts.height || cfg.DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    player = new window.SI.Player(
      (width - cfg.PLAYER_WIDTH) / 2,
      height - cfg.PLAYER_HEIGHT - cfg.PLAYER_MARGIN_BOTTOM,
      cfg.PLAYER_WIDTH,
      cfg.PLAYER_HEIGHT
    );

    aliens = window.SI.Alien.buildGrid({
      rows: cfg.ALIEN_ROWS,
      cols: cfg.ALIEN_COLS,
      alienWidth: cfg.ALIEN_WIDTH,
      alienHeight: cfg.ALIEN_HEIGHT,
      spacingX: cfg.ALIEN_SPACING_X,
      spacingY: cfg.ALIEN_SPACING_Y,
      originY: cfg.ALIEN_ORIGIN_Y,
      boundsWidth: width,
      cfg: cfg,
    });

    prevFire = false;

    state.state = 'playing';
    state.score = 0;
    state.lives = cfg.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = player.toState();
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;
  }

  // Exactly one fixed step. dt is accepted (per SI.Loop's calling
  // convention / ADR-002) but every motion below is a constant per-step
  // delta — dt is never multiplied into a position update.
  function update(dt) { // eslint-disable-line no-unused-vars
    var input = window.SI.Game.input;

    // --- player: move + clamp to [0, width - player.width] ---
    var dx = 0;
    if (input.left) {
      dx -= cfg.PLAYER_SPEED;
    }
    if (input.right) {
      dx += cfg.PLAYER_SPEED;
    }
    player.moveAndClamp(dx, width);
    state.player = player.toState();

    // --- fire: edge-triggered, exactly one bullet per press-edge ---
    var fireNow = !!input.fire;
    var bullets = state.playerBullets.slice();
    if (fireNow && !prevFire) {
      bullets.push(
        window.SI.Bullet.spawnPlayerBullet(player, cfg.BULLET_WIDTH, cfg.BULLET_HEIGHT).toState()
      );
    }
    prevFire = fireNow;

    // --- bullet-vs-alien collision, checked at each bullet's current
    // position. Array membership alone makes an object a live bullet —
    // a bare {x,y,width,height} object pushed onto gameState.playerBullets
    // from outside is checked exactly like a spawned one. ---
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitAlien = null;
      for (var j = 0; j < aliens.length; j++) {
        var alien = aliens[j];
        if (!alien.alive) {
          continue;
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(alien))) {
          hitAlien = alien;
          break;
        }
      }
      if (hitAlien) {
        hitAlien.alive = false;
        state.score += hitAlien.points;
      } else {
        survivors.push(bullet);
      }
    }

    // --- straight-line motion for surviving bullets, constant per-step
    // delta; drop bullets once fully off the top of the field ---
    var moved = [];
    for (var k = 0; k < survivors.length; k++) {
      var next = window.SI.Bullet.stepPlayerBullet(survivors[k], cfg.BULLET_SPEED);
      if (next.y + next.height > 0) {
        moved.push(next);
      }
    }

    aliens = aliens.filter(function (a) {
      return a.alive;
    });

    state.playerBullets = moved;
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
  }

  window.SI.Game = {
    input: { left: false, right: false, fire: false },
    state: state,
    init: init,
    update: update,
  };

  window.gameState = state;
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
// SI.Player — player-ship entity. Small class with a movement method;
// game.js reads/writes plain state via toState(), per ADR-003 (gameState
// entities must stay plain, serializable {x,y,width,height} objects).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Player(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // Moves by a constant per-step delta (never scaled by dt, per contract)
  // and clamps in place to [0, boundsWidth - width].
  Player.prototype.moveAndClamp = function (dx, boundsWidth) {
    this.x += dx;
    if (this.x < 0) {
      this.x = 0;
    }
    var maxX = boundsWidth - this.width;
    if (this.x > maxX) {
      this.x = maxX;
    }
  };

  Player.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  window.SI.Player = Player;
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
- **culled because:** gate testPassRate=0.88

```diff
+++ build.js
// build.js — concatenates src/*.js (fixed dependency order) into
// dist/game.js and wraps that same bundle in dist/index.html.
// Node builtins only (fs, path), per ADR-004. Idempotent: re-running just
// re-reads src/ and re-writes dist/, same output for the same input.
'use strict';

const fs = require('fs');
const path = require('path');

const ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'game.js',
];

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

function buildBundle() {
  return ORDER.map((file) => {
    const filePath = path.join(SRC_DIR, file);
    return `// ---- ${file} ----\n${fs.readFileSync(filePath, 'utf8')}`;
  }).join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
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
// ---- rng.js ----
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

// ---- collision.js ----
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

// ---- config.js ----
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

// ---- loop.js ----
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

// ---- player.js ----
// SI.Player — player ship creation & movement. Pure functions: given a
// player/input/bounds, return a *new* player object; caller decides where to
// store it (SI.Game keeps the live window.gameState.player field updated).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Extend the shared SI.Config (defined in config.js, loaded earlier) with
  // player-specific constants rather than scattering magic numbers here.
  window.SI.Config.PLAYER_WIDTH = 40;
  window.SI.Config.PLAYER_HEIGHT = 20;
  window.SI.Config.PLAYER_MARGIN_BOTTOM = 30;
  // Constant per-fixed-step displacement — never multiplied by dt, per
  // ADR-002 (fixed timestep means "per step" already implies "per time").
  window.SI.Config.PLAYER_SPEED = 4;

  function create(width, height) {
    var cfg = window.SI.Config;
    return {
      x: (width - cfg.PLAYER_WIDTH) / 2,
      y: height - cfg.PLAYER_MARGIN_BOTTOM - cfg.PLAYER_HEIGHT,
      width: cfg.PLAYER_WIDTH,
      height: cfg.PLAYER_HEIGHT,
    };
  }

  function move(player, input, width) {
    var cfg = window.SI.Config;
    var dx = (input.right ? cfg.PLAYER_SPEED : 0) - (input.left ? cfg.PLAYER_SPEED : 0);
    var nextX = player.x + dx;
    var maxX = width - player.width;
    var clampedX = Math.min(Math.max(nextX, 0), maxX);
    return Object.assign({}, player, { x: clampedX });
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();

// ---- bullet.js ----
// SI.Bullet — player-bullet factory + straight-line motion. Pure functions
// returning plain {x,y,width,height} objects (the shape window.gameState's
// playerBullets/alienBullets arrays require, per conventions.md) so a bare
// object built anywhere (tests included) behaves identically to one this
// module produced — no hidden/private fields gate collidability.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.BULLET_WIDTH = 4;
  window.SI.Config.BULLET_HEIGHT = 12;
  // Constant per-fixed-step displacement — never multiplied by dt.
  window.SI.Config.BULLET_SPEED = 8;

  function spawnFromPlayer(player) {
    var cfg = window.SI.Config;
    return {
      x: player.x + player.width / 2 - cfg.BULLET_WIDTH / 2,
      y: player.y - cfg.BULLET_HEIGHT,
      width: cfg.BULLET_WIDTH,
      height: cfg.BULLET_HEIGHT,
    };
  }

  // Straight-line motion: bullets travel upward toward the aliens.
  function move(bullet) {
    var cfg = window.SI.Config;
    return Object.assign({}, bullet, { y: bullet.y - cfg.BULLET_SPEED });
  }

  function isOnScreen(bullet) {
    return bullet.y + bullet.height > 0;
  }

  window.SI.Bullet = {
    spawnFromPlayer: spawnFromPlayer,
    move: move,
    isOnScreen: isOnScreen,
  };
})();

// ---- alien.js ----
// SI.Alien — static 5x11 grid factory (no march movement in this slice).
// Each alien is a plain {x,y,width,height,points} object per the P1
// TEST-FACING API — no private/internal fields.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.ALIEN_WIDTH = 30;
  window.SI.Config.ALIEN_HEIGHT = 20;
  window.SI.Config.ALIEN_H_SPACING = 10;
  window.SI.Config.ALIEN_V_SPACING = 15;
  window.SI.Config.ALIEN_TOP_MARGIN = 60;
  window.SI.Config.ALIEN_LEFT_MARGIN = 40;

  // Classic layout: the back (top) row is worth the most, the front (bottom)
  // rows the least — matches SI.Config's LOW/MID/HIGH naming.
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) return cfg.ALIEN_POINTS_ROW_HIGH;
    if (row === 1 || row === 2) return cfg.ALIEN_POINTS_ROW_MID;
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function range(n) {
    return new Array(n).fill(0).map(function (_, i) { return i; });
  }

  function createGrid() {
    var cfg = window.SI.Config;
    return range(cfg.ALIEN_ROWS).reduce(function (acc, row) {
      var rowAliens = range(cfg.ALIEN_COLS).map(function (col) {
        return {
          x: cfg.ALIEN_LEFT_MARGIN + col * (cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING),
          y: cfg.ALIEN_TOP_MARGIN + row * (cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING),
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: pointsForRow(row),
        };
      });
      return acc.concat(rowAliens);
    }, []);
  }

  window.SI.Alien = {
    createGrid: createGrid,
    pointsForRow: pointsForRow,
  };
})();

// ---- game.js ----
// SI.Game — state machine + orchestration for the P1 slice (move / shoot /
// kill on a static alien grid). Functional array-method pipeline style:
// update() is a small sequence of map/filter/reduce passes over immutable
// snapshots, with window.gameState (== SI.Game.state) as the only place
// results are written back in place, per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Edge-trigger bookkeeping for fire. Not part of window.gameState (the
  // sealed contract only requires *observable effects* — one bullet per
  // press — to be visible there, not the trigger machinery itself). Reset
  // on every init() so a fresh game never inherits a stale "was firing".
  var prevFire = false;

  // SI.Collision.aabbOverlap expects {x,y,w,h} boxes; window.gameState
  // entities are {x,y,width,height} per conventions.md. This adapter reads
  // only those public fields, so a bare externally-injected object with no
  // private/internal fields collides exactly like one this module built.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Resolve bullet-vs-alien collisions for one step, functionally: reduce
  // over bullets (in array order), each bullet claiming at most one still-
  // surviving alien, so no alien is destroyed twice and no double-scoring
  // happens even if several bullets overlap the same alien.
  function resolveHits(bullets, aliens) {
    var initial = { survivingAliens: aliens, hitFlags: [], destroyedAliens: [] };
    return bullets.reduce(function (acc, bullet) {
      var bulletBox = toBox(bullet);
      var hitIndex = acc.survivingAliens.findIndex(function (alien) {
        return window.SI.Collision.aabbOverlap(bulletBox, toBox(alien));
      });
      if (hitIndex === -1) {
        return {
          survivingAliens: acc.survivingAliens,
          hitFlags: acc.hitFlags.concat([false]),
          destroyedAliens: acc.destroyedAliens,
        };
      }
      var hitAlien = acc.survivingAliens[hitIndex];
      var remaining = acc.survivingAliens.filter(function (_, i) { return i !== hitIndex; });
      return {
        survivingAliens: remaining,
        hitFlags: acc.hitFlags.concat([true]),
        destroyedAliens: acc.destroyedAliens.concat([hitAlien]),
      };
    }, initial);
  }

  function init(opts) {
    opts = opts || {};
    var width = opts.width || DEFAULT_WIDTH;
    var height = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;

    window.SI.Game.state = {
      state: 'playing',
      score: 0,
      width: width,
      height: height,
      player: window.SI.Player.create(width, height),
      aliens: window.SI.Alien.createGrid(),
      playerBullets: [],
      alienBullets: [],
    };

    // No main.js bootstrap in this slice — init() is the harness's only
    // entry point, so it owns setting window.gameState to the same live
    // object reference SI.Game.state holds (ADR-003: same ref, never
    // reassigned after this point; update() mutates fields on it in place).
    window.gameState = window.SI.Game.state;

    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;

    return window.SI.Game.state;
  }

  // Advances exactly one fixed step. dt is accepted (matching SI.Loop's
  // call signature) but never used for movement math — every displacement
  // in this slice is a constant per-step delta, per ADR-002.
  function update(dt) { // eslint-disable-line no-unused-vars
    var state = window.SI.Game.state;
    var input = window.SI.Game.input;

    // 1. Move + clamp the player.
    state.player = window.SI.Player.move(state.player, input, state.width);

    // 2. Fire is edge-triggered: spawn exactly one bullet on a press-edge
    //    (false -> true transition), never while held.
    var firePressedEdge = input.fire && !prevFire;
    prevFire = input.fire;
    var bulletsThisStep = firePressedEdge
      ? state.playerBullets.concat([window.SI.Bullet.spawnFromPlayer(state.player)])
      : state.playerBullets;

    // 3. Collide at CURRENT bullet positions, before any motion is applied.
    //    This is what makes a bare {x,y,width,height} bullet spliced
    //    directly into playerBullets by a caller (test harness included)
    //    collide correctly the very next update() — array membership alone
    //    makes it "live", nothing keys off a private field.
    var resolved = resolveHits(bulletsThisStep, state.aliens);
    var scoreGain = resolved.destroyedAliens.reduce(function (sum, alien) {
      return sum + alien.points;
    }, 0);

    state.aliens = resolved.survivingAliens;
    state.score += scoreGain;

    // 4. Drop hit bullets, move survivors in a straight line, cull anything
    //    that left the top of the screen. Arrays replaced wholesale (never
    //    mutated in place), per ADR-003.
    state.playerBullets = bulletsThisStep
      .filter(function (_, idx) { return !resolved.hitFlags[idx]; })
      .map(window.SI.Bullet.move)
      .filter(window.SI.Bullet.isOnScreen);

    return state;
  }

  window.SI.Game = {
    state: null,
    input: { left: false, right: false, fire: false },
    init: init,
    update: update,
  };
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
// ---- rng.js ----
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

// ---- collision.js ----
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

// ---- config.js ----
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

// ---- loop.js ----
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

// ---- player.js ----
// SI.Player — player ship creation & movement. Pure functions: given a
// player/input/bounds, return a *new* player object; caller decides where to
// store it (SI.Game keeps the live window.gameState.player field updated).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Extend the shared SI.Config (defined in config.js, loaded earlier) with
  // player-specific constants rather than scattering magic numbers here.
  window.SI.Config.PLAYER_WIDTH = 40;
  window.SI.Config.PLAYER_HEIGHT = 20;
  window.SI.Config.PLAYER_MARGIN_BOTTOM = 30;
  // Constant per-fixed-step displacement — never multiplied by dt, per
  // ADR-002 (fixed timestep means "per step" already implies "per time").
  window.SI.Config.PLAYER_SPEED = 4;

  function create(width, height) {
    var cfg = window.SI.Config;
    return {
      x: (width - cfg.PLAYER_WIDTH) / 2,
      y: height - cfg.PLAYER_MARGIN_BOTTOM - cfg.PLAYER_HEIGHT,
      width: cfg.PLAYER_WIDTH,
      height: cfg.PLAYER_HEIGHT,
    };
  }

  function move(player, input, width) {
    var cfg = window.SI.Config;
    var dx = (input.right ? cfg.PLAYER_SPEED : 0) - (input.left ? cfg.PLAYER_SPEED : 0);
    var nextX = player.x + dx;
    var maxX = width - player.width;
    var clampedX = Math.min(Math.max(nextX, 0), maxX);
    return Object.assign({}, player, { x: clampedX });
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();

// ---- bullet.js ----
// SI.Bullet — player-bullet factory + straight-line motion. Pure functions
// returning plain {x,y,width,height} objects (the shape window.gameState's
// playerBullets/alienBullets arrays require, per conventions.md) so a bare
// object built anywhere (tests included) behaves identically to one this
// module produced — no hidden/private fields gate collidability.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.BULLET_WIDTH = 4;
  window.SI.Config.BULLET_HEIGHT = 12;
  // Constant per-fixed-step displacement — never multiplied by dt.
  window.SI.Config.BULLET_SPEED = 8;

  function spawnFromPlayer(player) {
    var cfg = window.SI.Config;
    return {
      x: player.x + player.width / 2 - cfg.BULLET_WIDTH / 2,
      y: player.y - cfg.BULLET_HEIGHT,
      width: cfg.BULLET_WIDTH,
      height: cfg.BULLET_HEIGHT,
    };
  }

  // Straight-line motion: bullets travel upward toward the aliens.
  function move(bullet) {
    var cfg = window.SI.Config;
    return Object.assign({}, bullet, { y: bullet.y - cfg.BULLET_SPEED });
  }

  function isOnScreen(bullet) {
    return bullet.y + bullet.height > 0;
  }

  window.SI.Bullet = {
    spawnFromPlayer: spawnFromPlayer,
    move: move,
    isOnScreen: isOnScreen,
  };
})();

// ---- alien.js ----
// SI.Alien — static 5x11 grid factory (no march movement in this slice).
// Each alien is a plain {x,y,width,height,points} object per the P1
// TEST-FACING API — no private/internal fields.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.ALIEN_WIDTH = 30;
  window.SI.Config.ALIEN_HEIGHT = 20;
  window.SI.Config.ALIEN_H_SPACING = 10;
  window.SI.Config.ALIEN_V_SPACING = 15;
  window.SI.Config.ALIEN_TOP_MARGIN = 60;
  window.SI.Config.ALIEN_LEFT_MARGIN = 40;

  // Classic layout: the back (top) row is worth the most, the front (bottom)
  // rows the least — matches SI.Config's LOW/MID/HIGH naming.
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) return cfg.ALIEN_POINTS_ROW_HIGH;
    if (row === 1 || row === 2) return cfg.ALIEN_POINTS_ROW_MID;
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function range(n) {
    return new Array(n).fill(0).map(function (_, i) { return i; });
  }

  function createGrid() {
    var cfg = window.SI.Config;
    return range(cfg.ALIEN_ROWS).reduce(function (acc, row) {
      var rowAliens = range(cfg.ALIEN_COLS).map(function (col) {
        return {
          x: cfg.ALIEN_LEFT_MARGIN + col * (cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING),
          y: cfg.ALIEN_TOP_MARGIN + row * (cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING),
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: pointsForRow(row),
        };
      });
      return acc.concat(rowAliens);
    }, []);
  }

  window.SI.Alien = {
    createGrid: createGrid,
    pointsForRow: pointsForRow,
  };
})();

// ---- game.js ----
// SI.Game — state machine + orchestration for the P1 slice (move / shoot /
// kill on a static alien grid). Functional array-method pipeline style:
// update() is a small sequence of map/filter/reduce passes over immutable
// snapshots, with window.gameState (== SI.Game.state) as the only place
// results are written back in place, per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Edge-trigger bookkeeping for fire. Not part of window.gameState (the
  // sealed contract only requires *observable effects* — one bullet per
  // press — to be visible there, not the trigger machinery itself). Reset
  // on every init() so a fresh game never inherits a stale "was firing".
  var prevFire = false;

  // SI.Collision.aabbOverlap expects {x,y,w,h} boxes; window.gameState
  // entities are {x,y,width,height} per conventions.md. This adapter reads
  // only those public fields, so a bare externally-injected object with no
  // private/internal fields collides exactly like one this module built.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Resolve bullet-vs-alien collisions for one step, functionally: reduce
  // over bullets (in array order), each bullet claiming at most one still-
  // surviving alien, so no alien is destroyed twice and no double-scoring
  // happens even if several bullets overlap the same alien.
  function resolveHits(bullets, aliens) {
    var initial = { survivingAliens: aliens, hitFlags: [], destroyedAliens: [] };
    return bullets.reduce(function (acc, bullet) {
      var bulletBox = toBox(bullet);
      var hitIndex = acc.survivingAliens.findIndex(function (alien) {
        return window.SI.Collision.aabbOverlap(bulletBox, toBox(alien));
      });
      if (hitIndex === -1) {
        return {
          survivingAliens: acc.survivingAliens,
          hitFlags: acc.hitFlags.concat([false]),
          destroyedAliens: acc.destroyedAliens,
        };
      }
      var hitAlien = acc.survivingAliens[hitIndex];
      var remaining = acc.survivingAliens.filter(function (_, i) { return i !== hitIndex; });
      return {
        survivingAliens: remaining,
        hitFlags: acc.hitFlags.concat([true]),
        destroyedAliens: acc.destroyedAliens.concat([hitAlien]),
      };
    }, initial);
  }

  function init(opts) {
    opts = opts || {};
    var width = opts.width || DEFAULT_WIDTH;
    var height = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;

    window.SI.Game.state = {
      state: 'playing',
      score: 0,
      width: width,
      height: height,
      player: window.SI.Player.create(width, height),
      aliens: window.SI.Alien.createGrid(),
      playerBullets: [],
      alienBullets: [],
    };

    // No main.js bootstrap in this slice — init() is the harness's only
    // entry point, so it owns setting window.gameState to the same live
    // object reference SI.Game.state holds (ADR-003: same ref, never
    // reassigned after this point; update() mutates fields on it in place).
    window.gameState = window.SI.Game.state;

    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;

    return window.SI.Game.state;
  }

  // Advances exactly one fixed step. dt is accepted (matching SI.Loop's
  // call signature) but never used for movement math — every displacement
  // in this slice is a constant per-step delta, per ADR-002.
  function update(dt) { // eslint-disable-line no-unused-vars
    var state = window.SI.Game.state;
    var input = window.SI.Game.input;

    // 1. Move + clamp the player.
    state.player = window.SI.Player.move(state.player, input, state.width);

    // 2. Fire is edge-triggered: spawn exactly one bullet on a press-edge
    //    (false -> true transition), never while held.
    var firePressedEdge = input.fire && !prevFire;
    prevFire = input.fire;
    var bulletsThisStep = firePressedEdge
      ? state.playerBullets.concat([window.SI.Bullet.spawnFromPlayer(state.player)])
      : state.playerBullets;

    // 3. Collide at CURRENT bullet positions, before any motion is applied.
    //    This is what makes a bare {x,y,width,height} bullet spliced
    //    directly into playerBullets by a caller (test harness included)
    //    collide correctly the very next update() — array membership alone
    //    makes it "live", nothing keys off a private field.
    var resolved = resolveHits(bulletsThisStep, state.aliens);
    var scoreGain = resolved.destroyedAliens.reduce(function (sum, alien) {
      return sum + alien.points;
    }, 0);

    state.aliens = resolved.survivingAliens;
    state.score += scoreGain;

    // 4. Drop hit bullets, move survivors in a straight line, cull anything
    //    that left the top of the screen. Arrays replaced wholesale (never
    //    mutated in place), per ADR-003.
    state.playerBullets = bulletsThisStep
      .filter(function (_, idx) { return !resolved.hitFlags[idx]; })
      .map(window.SI.Bullet.move)
      .filter(window.SI.Bullet.isOnScreen);

    return state;
  }

  window.SI.Game = {
    state: null,
    input: { left: false, right: false, fire: false },
    init: init,
    update: update,
  };
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — static 5x11 grid factory (no march movement in this slice).
// Each alien is a plain {x,y,width,height,points} object per the P1
// TEST-FACING API — no private/internal fields.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.ALIEN_WIDTH = 30;
  window.SI.Config.ALIEN_HEIGHT = 20;
  window.SI.Config.ALIEN_H_SPACING = 10;
  window.SI.Config.ALIEN_V_SPACING = 15;
  window.SI.Config.ALIEN_TOP_MARGIN = 60;
  window.SI.Config.ALIEN_LEFT_MARGIN = 40;

  // Classic layout: the back (top) row is worth the most, the front (bottom)
  // rows the least — matches SI.Config's LOW/MID/HIGH naming.
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) return cfg.ALIEN_POINTS_ROW_HIGH;
    if (row === 1 || row === 2) return cfg.ALIEN_POINTS_ROW_MID;
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function range(n) {
    return new Array(n).fill(0).map(function (_, i) { return i; });
  }

  function createGrid() {
    var cfg = window.SI.Config;
    return range(cfg.ALIEN_ROWS).reduce(function (acc, row) {
      var rowAliens = range(cfg.ALIEN_COLS).map(function (col) {
        return {
          x: cfg.ALIEN_LEFT_MARGIN + col * (cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING),
          y: cfg.ALIEN_TOP_MARGIN + row * (cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING),
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: pointsForRow(row),
        };
      });
      return acc.concat(rowAliens);
    }, []);
  }

  window.SI.Alien = {
    createGrid: createGrid,
    pointsForRow: pointsForRow,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line motion. Pure functions
// returning plain {x,y,width,height} objects (the shape window.gameState's
// playerBullets/alienBullets arrays require, per conventions.md) so a bare
// object built anywhere (tests included) behaves identically to one this
// module produced — no hidden/private fields gate collidability.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.BULLET_WIDTH = 4;
  window.SI.Config.BULLET_HEIGHT = 12;
  // Constant per-fixed-step displacement — never multiplied by dt.
  window.SI.Config.BULLET_SPEED = 8;

  function spawnFromPlayer(player) {
    var cfg = window.SI.Config;
    return {
      x: player.x + player.width / 2 - cfg.BULLET_WIDTH / 2,
      y: player.y - cfg.BULLET_HEIGHT,
      width: cfg.BULLET_WIDTH,
      height: cfg.BULLET_HEIGHT,
    };
  }

  // Straight-line motion: bullets travel upward toward the aliens.
  function move(bullet) {
    var cfg = window.SI.Config;
    return Object.assign({}, bullet, { y: bullet.y - cfg.BULLET_SPEED });
  }

  function isOnScreen(bullet) {
    return bullet.y + bullet.height > 0;
  }

  window.SI.Bullet = {
    spawnFromPlayer: spawnFromPlayer,
    move: move,
    isOnScreen: isOnScreen,
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
// SI.Game — state machine + orchestration for the P1 slice (move / shoot /
// kill on a static alien grid). Functional array-method pipeline style:
// update() is a small sequence of map/filter/reduce passes over immutable
// snapshots, with window.gameState (== SI.Game.state) as the only place
// results are written back in place, per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Edge-trigger bookkeeping for fire. Not part of window.gameState (the
  // sealed contract only requires *observable effects* — one bullet per
  // press — to be visible there, not the trigger machinery itself). Reset
  // on every init() so a fresh game never inherits a stale "was firing".
  var prevFire = false;

  // SI.Collision.aabbOverlap expects {x,y,w,h} boxes; window.gameState
  // entities are {x,y,width,height} per conventions.md. This adapter reads
  // only those public fields, so a bare externally-injected object with no
  // private/internal fields collides exactly like one this module built.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Resolve bullet-vs-alien collisions for one step, functionally: reduce
  // over bullets (in array order), each bullet claiming at most one still-
  // surviving alien, so no alien is destroyed twice and no double-scoring
  // happens even if several bullets overlap the same alien.
  function resolveHits(bullets, aliens) {
    var initial = { survivingAliens: aliens, hitFlags: [], destroyedAliens: [] };
    return bullets.reduce(function (acc, bullet) {
      var bulletBox = toBox(bullet);
      var hitIndex = acc.survivingAliens.findIndex(function (alien) {
        return window.SI.Collision.aabbOverlap(bulletBox, toBox(alien));
      });
      if (hitIndex === -1) {
        return {
          survivingAliens: acc.survivingAliens,
          hitFlags: acc.hitFlags.concat([false]),
          destroyedAliens: acc.destroyedAliens,
        };
      }
      var hitAlien = acc.survivingAliens[hitIndex];
      var remaining = acc.survivingAliens.filter(function (_, i) { return i !== hitIndex; });
      return {
        survivingAliens: remaining,
        hitFlags: acc.hitFlags.concat([true]),
        destroyedAliens: acc.destroyedAliens.concat([hitAlien]),
      };
    }, initial);
  }

  function init(opts) {
    opts = opts || {};
    var width = opts.width || DEFAULT_WIDTH;
    var height = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;

    window.SI.Game.state = {
      state: 'playing',
      score: 0,
      width: width,
      height: height,
      player: window.SI.Player.create(width, height),
      aliens: window.SI.Alien.createGrid(),
      playerBullets: [],
      alienBullets: [],
    };

    // No main.js bootstrap in this slice — init() is the harness's only
    // entry point, so it owns setting window.gameState to the same live
    // object reference SI.Game.state holds (ADR-003: same ref, never
    // reassigned after this point; update() mutates fields on it in place).
    window.gameState = window.SI.Game.state;

    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;

    return window.SI.Game.state;
  }

  // Advances exactly one fixed step. dt is accepted (matching SI.Loop's
  // call signature) but never used for movement math — every displacement
  // in this slice is a constant per-step delta, per ADR-002.
  function update(dt) { // eslint-disable-line no-unused-vars
    var state = window.SI.Game.state;
    var input = window.SI.Game.input;

    // 1. Move + clamp the player.
    state.player = window.SI.Player.move(state.player, input, state.width);

    // 2. Fire is edge-triggered: spawn exactly one bullet on a press-edge
    //    (false -> true transition), never while held.
    var firePressedEdge = input.fire && !prevFire;
    prevFire = input.fire;
    var bulletsThisStep = firePressedEdge
      ? state.playerBullets.concat([window.SI.Bullet.spawnFromPlayer(state.player)])
      : state.playerBullets;

    // 3. Collide at CURRENT bullet positions, before any motion is applied.
    //    This is what makes a bare {x,y,width,height} bullet spliced
    //    directly into playerBullets by a caller (test harness included)
    //    collide correctly the very next update() — array membership alone
    //    makes it "live", nothing keys off a private field.
    var resolved = resolveHits(bulletsThisStep, state.aliens);
    var scoreGain = resolved.destroyedAliens.reduce(function (sum, alien) {
      return sum + alien.points;
    }, 0);

    state.aliens = resolved.survivingAliens;
    state.score += scoreGain;

    // 4. Drop hit bullets, move survivors in a straight line, cull anything
    //    that left the top of the screen. Arrays replaced wholesale (never
    //    mutated in place), per ADR-003.
    state.playerBullets = bulletsThisStep
      .filter(function (_, idx) { return !resolved.hitFlags[idx]; })
      .map(window.SI.Bullet.move)
      .filter(window.SI.Bullet.isOnScreen);

    return state;
  }

  window.SI.Game = {
    state: null,
    input: { left: false, right: false, fire: false },
    init: init,
    update: update,
  };
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
// SI.Player — player ship creation & movement. Pure functions: given a
// player/input/bounds, return a *new* player object; caller decides where to
// store it (SI.Game keeps the live window.gameState.player field updated).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Extend the shared SI.Config (defined in config.js, loaded earlier) with
  // player-specific constants rather than scattering magic numbers here.
  window.SI.Config.PLAYER_WIDTH = 40;
  window.SI.Config.PLAYER_HEIGHT = 20;
  window.SI.Config.PLAYER_MARGIN_BOTTOM = 30;
  // Constant per-fixed-step displacement — never multiplied by dt, per
  // ADR-002 (fixed timestep means "per step" already implies "per time").
  window.SI.Config.PLAYER_SPEED = 4;

  function create(width, height) {
    var cfg = window.SI.Config;
    return {
      x: (width - cfg.PLAYER_WIDTH) / 2,
      y: height - cfg.PLAYER_MARGIN_BOTTOM - cfg.PLAYER_HEIGHT,
      width: cfg.PLAYER_WIDTH,
      height: cfg.PLAYER_HEIGHT,
    };
  }

  function move(player, input, width) {
    var cfg = window.SI.Config;
    var dx = (input.right ? cfg.PLAYER_SPEED : 0) - (input.left ? cfg.PLAYER_SPEED : 0);
    var nextX = player.x + dx;
    var maxX = width - player.width;
    var clampedX = Math.min(Math.max(nextX, 0), maxX);
    return Object.assign({}, player, { x: clampedX });
  }

  window.SI.Player = {
    create: create,
    move: move,
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
- **culled because:** gate testPassRate=0.88

```diff
+++ build.js
// build.js — concatenates src/*.js (fixed dependency order) into
// dist/game.js and wraps it in a minimal dist/index.html. Node.js builtins
// only (fs, path), per ADR-004. Idempotent: safe to run any number of times,
// always produces the same output for the same src/.
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// rng -> collision -> config -> loop -> player -> bullet -> alien -> game
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
  return MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// --- ${name} ---\n` + fs.readFileSync(filePath, 'utf8');
  }).join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
</head>
<body>
<canvas id="game"></canvas>
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
// --- rng.js ---
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

// --- collision.js ---
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

// --- config.js ---
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

  // --- slice-02 additions (player-move-shoot-kill) ---------------------
  // Default canvas dimensions, used when SI.Game.init() is called without
  // an explicit {width,height}.
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,

  // Player ship: dimensions + constant per-fixed-step move distance.
  PLAYER_WIDTH: 40,
  PLAYER_HEIGHT: 20,
  PLAYER_STEP: 4, // px per fixed step (never scaled by dt, per ADR-002)
  PLAYER_Y_MARGIN: 30, // px from bottom edge to player's bottom edge

  // Player bullet: dimensions + constant per-fixed-step move distance.
  BULLET_WIDTH: 3,
  BULLET_HEIGHT: 12,
  BULLET_STEP: 8, // px per fixed step, moves up (decreasing y)

  // Alien grid layout: dimensions + spacing, data-driven (no per-row branching).
  ALIEN_WIDTH: 30,
  ALIEN_HEIGHT: 20,
  ALIEN_H_SPACING: 15,
  ALIEN_V_SPACING: 15,
  ALIEN_GRID_LEFT: 50,
  ALIEN_GRID_TOP: 50,
};

// Points-by-row table (row 0 = top). A plain array lookup, not a branch —
// row index directly selects the exact point value (10/20/30).
window.SI.Config.ALIEN_ROW_POINTS = [
  window.SI.Config.ALIEN_POINTS_ROW_HIGH,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
];

// --- loop.js ---
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

// --- player.js ---
// SI.Player — player entity: creation + movement. Movement uses a constant
// per-fixed-step delta from SI.Config (never scaled by dt, per ADR-002) and
// clamps x to [0, canvasWidth - player.width].
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function create(canvasWidth, canvasHeight) {
    var cfg = window.SI.Config;
    var width = cfg.PLAYER_WIDTH;
    var height = cfg.PLAYER_HEIGHT;
    return {
      x: (canvasWidth - width) / 2,
      y: canvasHeight - cfg.PLAYER_Y_MARGIN - height,
      width: width,
      height: height,
    };
  }

  // Returns a new player object (wholesale replace, per ADR-003) moved by a
  // constant per-step delta according to input.left/input.right, clamped to
  // the canvas bounds.
  function move(player, input, canvasWidth) {
    var step = window.SI.Config.PLAYER_STEP;
    var x = player.x;
    if (input.left) x -= step;
    if (input.right) x += step;

    var minX = 0;
    var maxX = canvasWidth - player.width;
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    return { x: x, y: player.y, width: player.width, height: player.height };
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();

// --- bullet.js ---
// SI.Bullet — player-bullet factory + straight-line update. This slice has
// no alien fire (static, non-marching grid), so no enemy-bullet factory
// here.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createPlayerBullet(player) {
    var cfg = window.SI.Config;
    var width = cfg.BULLET_WIDTH;
    var height = cfg.BULLET_HEIGHT;
    return {
      x: player.x + player.width / 2 - width / 2,
      y: player.y - height,
      width: width,
      height: height,
    };
  }

  // Straight-line motion: a constant per-fixed-step delta (never scaled by
  // dt). Only reads x/y/width/height — any plain {x,y,width,height} object,
  // however it entered the array, moves and collides the same way. No
  // private/internal field gates movement or collidability.
  function step(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - window.SI.Config.BULLET_STEP,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = {
    createPlayerBullet: createPlayerBullet,
    step: step,
  };
})();

// --- alien.js ---
// SI.Alien — static 5x11 grid (no march movement in this slice). Row point
// values come straight from the SI.Config.ALIEN_ROW_POINTS data table, a
// plain array lookup by row index rather than a branch per row.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createGrid() {
    var cfg = window.SI.Config;
    var rowHeight = cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING;
    var colWidth = cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING;
    var aliens = [];

    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = cfg.ALIEN_ROW_POINTS[row];
      var y = cfg.ALIEN_GRID_TOP + row * rowHeight;
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: cfg.ALIEN_GRID_LEFT + col * colWidth,
          y: y,
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: points,
        });
      }
    }

    return aliens;
  }

  window.SI.Alien = {
    createGrid: createGrid,
  };
})();

// --- game.js ---
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). No main.js in this slice, so game.js itself
// bootstraps window.gameState (ADR-003: same object reference throughout,
// mutated in place; arrays replaced wholesale).
// update(dt) always advances exactly one fixed step; every movement is a
// constant per-step delta pulled from SI.Config, never scaled by dt
// (ADR-002).
(function () {
  var cfg = window.SI.Config;

  var canvasWidth = cfg.CANVAS_WIDTH;
  var canvasHeight = cfg.CANVAS_HEIGHT;
  var prevFire = false; // closure-only edge-detect flag, not test-facing state

  var state = {
    state: 'ready',
    score: 0,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
  };

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = state;
  window.gameState = state;

  var input = { left: false, right: false, fire: false };
  window.SI.Game.input = input;

  function init(opts) {
    opts = opts || {};
    canvasWidth = opts.width || cfg.CANVAS_WIDTH;
    canvasHeight = opts.height || cfg.CANVAS_HEIGHT;
    if (opts.seed !== undefined) {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;
    input.left = false;
    input.right = false;
    input.fire = false;

    state.state = 'playing';
    state.score = 0;
    state.player = window.SI.Player.create(canvasWidth, canvasHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
  }

  // SI.Collision.aabbOverlap reads {x,y,w,h}; gameState entities carry
  // {x,y,width,height} per the ADR-003 field contract. Bridge the two
  // shapes here instead of changing either module's contract.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  function update(dt) {
    state.player = window.SI.Player.move(state.player, input, canvasWidth);

    var bullets = state.playerBullets;

    if (input.fire && !prevFire) {
      bullets = bullets.concat([
        window.SI.Bullet.createPlayerBullet(state.player),
      ]);
    }
    prevFire = input.fire;

    // Straight-line motion, then drop bullets that have left the top edge.
    bullets = bullets.map(window.SI.Bullet.step).filter(function (b) {
      return b.y + b.height > 0;
    });

    // Bullet-vs-alien collision: every bullet in the array is live and
    // collidable regardless of how it got there (factory or externally
    // injected bare {x,y,width,height} object) — no private field gates
    // this check.
    var aliens = state.aliens;
    var survivingBullets = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitIndex = -1;
      for (var j = 0; j < aliens.length; j++) {
        if (window.SI.Collision.aabbOverlap(toBox(bullet), toBox(aliens[j]))) {
          hitIndex = j;
          break;
        }
      }
      if (hitIndex === -1) {
        survivingBullets.push(bullet);
      } else {
        state.score += aliens[hitIndex].points;
        aliens = aliens.slice(0, hitIndex).concat(aliens.slice(hitIndex + 1));
      }
    }

    state.playerBullets = survivingBullets;
    state.aliens = aliens;
  }

  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
</head>
<body>
<canvas id="game"></canvas>
<script>
// --- rng.js ---
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

// --- collision.js ---
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

// --- config.js ---
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

  // --- slice-02 additions (player-move-shoot-kill) ---------------------
  // Default canvas dimensions, used when SI.Game.init() is called without
  // an explicit {width,height}.
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,

  // Player ship: dimensions + constant per-fixed-step move distance.
  PLAYER_WIDTH: 40,
  PLAYER_HEIGHT: 20,
  PLAYER_STEP: 4, // px per fixed step (never scaled by dt, per ADR-002)
  PLAYER_Y_MARGIN: 30, // px from bottom edge to player's bottom edge

  // Player bullet: dimensions + constant per-fixed-step move distance.
  BULLET_WIDTH: 3,
  BULLET_HEIGHT: 12,
  BULLET_STEP: 8, // px per fixed step, moves up (decreasing y)

  // Alien grid layout: dimensions + spacing, data-driven (no per-row branching).
  ALIEN_WIDTH: 30,
  ALIEN_HEIGHT: 20,
  ALIEN_H_SPACING: 15,
  ALIEN_V_SPACING: 15,
  ALIEN_GRID_LEFT: 50,
  ALIEN_GRID_TOP: 50,
};

// Points-by-row table (row 0 = top). A plain array lookup, not a branch —
// row index directly selects the exact point value (10/20/30).
window.SI.Config.ALIEN_ROW_POINTS = [
  window.SI.Config.ALIEN_POINTS_ROW_HIGH,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
];

// --- loop.js ---
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

// --- player.js ---
// SI.Player — player entity: creation + movement. Movement uses a constant
// per-fixed-step delta from SI.Config (never scaled by dt, per ADR-002) and
// clamps x to [0, canvasWidth - player.width].
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function create(canvasWidth, canvasHeight) {
    var cfg = window.SI.Config;
    var width = cfg.PLAYER_WIDTH;
    var height = cfg.PLAYER_HEIGHT;
    return {
      x: (canvasWidth - width) / 2,
      y: canvasHeight - cfg.PLAYER_Y_MARGIN - height,
      width: width,
      height: height,
    };
  }

  // Returns a new player object (wholesale replace, per ADR-003) moved by a
  // constant per-step delta according to input.left/input.right, clamped to
  // the canvas bounds.
  function move(player, input, canvasWidth) {
    var step = window.SI.Config.PLAYER_STEP;
    var x = player.x;
    if (input.left) x -= step;
    if (input.right) x += step;

    var minX = 0;
    var maxX = canvasWidth - player.width;
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    return { x: x, y: player.y, width: player.width, height: player.height };
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();

// --- bullet.js ---
// SI.Bullet — player-bullet factory + straight-line update. This slice has
// no alien fire (static, non-marching grid), so no enemy-bullet factory
// here.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createPlayerBullet(player) {
    var cfg = window.SI.Config;
    var width = cfg.BULLET_WIDTH;
    var height = cfg.BULLET_HEIGHT;
    return {
      x: player.x + player.width / 2 - width / 2,
      y: player.y - height,
      width: width,
      height: height,
    };
  }

  // Straight-line motion: a constant per-fixed-step delta (never scaled by
  // dt). Only reads x/y/width/height — any plain {x,y,width,height} object,
  // however it entered the array, moves and collides the same way. No
  // private/internal field gates movement or collidability.
  function step(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - window.SI.Config.BULLET_STEP,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = {
    createPlayerBullet: createPlayerBullet,
    step: step,
  };
})();

// --- alien.js ---
// SI.Alien — static 5x11 grid (no march movement in this slice). Row point
// values come straight from the SI.Config.ALIEN_ROW_POINTS data table, a
// plain array lookup by row index rather than a branch per row.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createGrid() {
    var cfg = window.SI.Config;
    var rowHeight = cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING;
    var colWidth = cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING;
    var aliens = [];

    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = cfg.ALIEN_ROW_POINTS[row];
      var y = cfg.ALIEN_GRID_TOP + row * rowHeight;
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: cfg.ALIEN_GRID_LEFT + col * colWidth,
          y: y,
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: points,
        });
      }
    }

    return aliens;
  }

  window.SI.Alien = {
    createGrid: createGrid,
  };
})();

// --- game.js ---
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). No main.js in this slice, so game.js itself
// bootstraps window.gameState (ADR-003: same object reference throughout,
// mutated in place; arrays replaced wholesale).
// update(dt) always advances exactly one fixed step; every movement is a
// constant per-step delta pulled from SI.Config, never scaled by dt
// (ADR-002).
(function () {
  var cfg = window.SI.Config;

  var canvasWidth = cfg.CANVAS_WIDTH;
  var canvasHeight = cfg.CANVAS_HEIGHT;
  var prevFire = false; // closure-only edge-detect flag, not test-facing state

  var state = {
    state: 'ready',
    score: 0,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
  };

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = state;
  window.gameState = state;

  var input = { left: false, right: false, fire: false };
  window.SI.Game.input = input;

  function init(opts) {
    opts = opts || {};
    canvasWidth = opts.width || cfg.CANVAS_WIDTH;
    canvasHeight = opts.height || cfg.CANVAS_HEIGHT;
    if (opts.seed !== undefined) {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;
    input.left = false;
    input.right = false;
    input.fire = false;

    state.state = 'playing';
    state.score = 0;
    state.player = window.SI.Player.create(canvasWidth, canvasHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
  }

  // SI.Collision.aabbOverlap reads {x,y,w,h}; gameState entities carry
  // {x,y,width,height} per the ADR-003 field contract. Bridge the two
  // shapes here instead of changing either module's contract.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  function update(dt) {
    state.player = window.SI.Player.move(state.player, input, canvasWidth);

    var bullets = state.playerBullets;

    if (input.fire && !prevFire) {
      bullets = bullets.concat([
        window.SI.Bullet.createPlayerBullet(state.player),
      ]);
    }
    prevFire = input.fire;

    // Straight-line motion, then drop bullets that have left the top edge.
    bullets = bullets.map(window.SI.Bullet.step).filter(function (b) {
      return b.y + b.height > 0;
    });

    // Bullet-vs-alien collision: every bullet in the array is live and
    // collidable regardless of how it got there (factory or externally
    // injected bare {x,y,width,height} object) — no private field gates
    // this check.
    var aliens = state.aliens;
    var survivingBullets = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitIndex = -1;
      for (var j = 0; j < aliens.length; j++) {
        if (window.SI.Collision.aabbOverlap(toBox(bullet), toBox(aliens[j]))) {
          hitIndex = j;
          break;
        }
      }
      if (hitIndex === -1) {
        survivingBullets.push(bullet);
      } else {
        state.score += aliens[hitIndex].points;
        aliens = aliens.slice(0, hitIndex).concat(aliens.slice(hitIndex + 1));
      }
    }

    state.playerBullets = survivingBullets;
    state.aliens = aliens;
  }

  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();

</script>
</body>
</html>

+++ src/alien.js
// SI.Alien — static 5x11 grid (no march movement in this slice). Row point
// values come straight from the SI.Config.ALIEN_ROW_POINTS data table, a
// plain array lookup by row index rather than a branch per row.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createGrid() {
    var cfg = window.SI.Config;
    var rowHeight = cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING;
    var colWidth = cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING;
    var aliens = [];

    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = cfg.ALIEN_ROW_POINTS[row];
      var y = cfg.ALIEN_GRID_TOP + row * rowHeight;
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: cfg.ALIEN_GRID_LEFT + col * colWidth,
          y: y,
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: points,
        });
      }
    }

    return aliens;
  }

  window.SI.Alien = {
    createGrid: createGrid,
  };
})();

+++ src/bullet.js
// SI.Bullet — player-bullet factory + straight-line update. This slice has
// no alien fire (static, non-marching grid), so no enemy-bullet factory
// here.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createPlayerBullet(player) {
    var cfg = window.SI.Config;
    var width = cfg.BULLET_WIDTH;
    var height = cfg.BULLET_HEIGHT;
    return {
      x: player.x + player.width / 2 - width / 2,
      y: player.y - height,
      width: width,
      height: height,
    };
  }

  // Straight-line motion: a constant per-fixed-step delta (never scaled by
  // dt). Only reads x/y/width/height — any plain {x,y,width,height} object,
  // however it entered the array, moves and collides the same way. No
  // private/internal field gates movement or collidability.
  function step(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - window.SI.Config.BULLET_STEP,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = {
    createPlayerBullet: createPlayerBullet,
    step: step,
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

  // --- slice-02 additions (player-move-shoot-kill) ---------------------
  // Default canvas dimensions, used when SI.Game.init() is called without
  // an explicit {width,height}.
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,

  // Player ship: dimensions + constant per-fixed-step move distance.
  PLAYER_WIDTH: 40,
  PLAYER_HEIGHT: 20,
  PLAYER_STEP: 4, // px per fixed step (never scaled by dt, per ADR-002)
  PLAYER_Y_MARGIN: 30, // px from bottom edge to player's bottom edge

  // Player bullet: dimensions + constant per-fixed-step move distance.
  BULLET_WIDTH: 3,
  BULLET_HEIGHT: 12,
  BULLET_STEP: 8, // px per fixed step, moves up (decreasing y)

  // Alien grid layout: dimensions + spacing, data-driven (no per-row branching).
  ALIEN_WIDTH: 30,
  ALIEN_HEIGHT: 20,
  ALIEN_H_SPACING: 15,
  ALIEN_V_SPACING: 15,
  ALIEN_GRID_LEFT: 50,
  ALIEN_GRID_TOP: 50,
};

// Points-by-row table (row 0 = top). A plain array lookup, not a branch —
// row index directly selects the exact point value (10/20/30).
window.SI.Config.ALIEN_ROW_POINTS = [
  window.SI.Config.ALIEN_POINTS_ROW_HIGH,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
];

+++ src/game.js
// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). No main.js in this slice, so game.js itself
// bootstraps window.gameState (ADR-003: same object reference throughout,
// mutated in place; arrays replaced wholesale).
// update(dt) always advances exactly one fixed step; every movement is a
// constant per-step delta pulled from SI.Config, never scaled by dt
// (ADR-002).
(function () {
  var cfg = window.SI.Config;

  var canvasWidth = cfg.CANVAS_WIDTH;
  var canvasHeight = cfg.CANVAS_HEIGHT;
  var prevFire = false; // closure-only edge-detect flag, not test-facing state

  var state = {
    state: 'ready',
    score: 0,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
  };

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = state;
  window.gameState = state;

  var input = { left: false, right: false, fire: false };
  window.SI.Game.input = input;

  function init(opts) {
    opts = opts || {};
    canvasWidth = opts.width || cfg.CANVAS_WIDTH;
    canvasHeight = opts.height || cfg.CANVAS_HEIGHT;
    if (opts.seed !== undefined) {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;
    input.left = false;
    input.right = false;
    input.fire = false;

    state.state = 'playing';
    state.score = 0;
    state.player = window.SI.Player.create(canvasWidth, canvasHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
  }

  // SI.Collision.aabbOverlap reads {x,y,w,h}; gameState entities carry
  // {x,y,width,height} per the ADR-003 field contract. Bridge the two
  // shapes here instead of changing either module's contract.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  function update(dt) {
    state.player = window.SI.Player.move(state.player, input, canvasWidth);

    var bullets = state.playerBullets;

    if (input.fire && !prevFire) {
      bullets = bullets.concat([
        window.SI.Bullet.createPlayerBullet(state.player),
      ]);
    }
    prevFire = input.fire;

    // Straight-line motion, then drop bullets that have left the top edge.
    bullets = bullets.map(window.SI.Bullet.step).filter(function (b) {
      return b.y + b.height > 0;
    });

    // Bullet-vs-alien collision: every bullet in the array is live and
    // collidable regardless of how it got there (factory or externally
    // injected bare {x,y,width,height} object) — no private field gates
    // this check.
    var aliens = state.aliens;
    var survivingBullets = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitIndex = -1;
      for (var j = 0; j < aliens.length; j++) {
        if (window.SI.Collision.aabbOverlap(toBox(bullet), toBox(aliens[j]))) {
          hitIndex = j;
          break;
        }
      }
      if (hitIndex === -1) {
        survivingBullets.push(bullet);
      } else {
        state.score += aliens[hitIndex].points;
        aliens = aliens.slice(0, hitIndex).concat(aliens.slice(hitIndex + 1));
      }
    }

    state.playerBullets = survivingBullets;
    state.aliens = aliens;
  }

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
// SI.Player — player entity: creation + movement. Movement uses a constant
// per-fixed-step delta from SI.Config (never scaled by dt, per ADR-002) and
// clamps x to [0, canvasWidth - player.width].
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function create(canvasWidth, canvasHeight) {
    var cfg = window.SI.Config;
    var width = cfg.PLAYER_WIDTH;
    var height = cfg.PLAYER_HEIGHT;
    return {
      x: (canvasWidth - width) / 2,
      y: canvasHeight - cfg.PLAYER_Y_MARGIN - height,
      width: width,
      height: height,
    };
  }

  // Returns a new player object (wholesale replace, per ADR-003) moved by a
  // constant per-step delta according to input.left/input.right, clamped to
  // the canvas bounds.
  function move(player, input, canvasWidth) {
    var step = window.SI.Config.PLAYER_STEP;
    var x = player.x;
    if (input.left) x -= step;
    if (input.right) x += step;

    var minX = 0;
    var maxX = canvasWidth - player.width;
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    return { x: x, y: player.y, width: player.width, height: player.height };
  }

  window.SI.Player = {
    create: create,
    move: move,
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
