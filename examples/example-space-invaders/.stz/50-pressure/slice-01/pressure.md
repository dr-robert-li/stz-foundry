---
summary: "Pressure log slice-01: 3 culled."
---

# Pressure log — slice-01

## specimen-B
- **culled because:** gate testPassRate=1.00

```diff
+++ build.js
// build.js — Node builtins only (fs, path). Concatenates src/*.js in
// dependency order into dist/game.js (plain JS bundle, no HTML) and inlines
// that same bundle into dist/index.html (canvas shell + minimal CSS + an
// ADR-003 window.gameState stub at state: 'ready'). Idempotent: re-running
// with unchanged src/ produces byte-identical output.
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SRC_DIR = path.join(ROOT, 'src');
var DIST_DIR = path.join(ROOT, 'dist');

// Dependency order for this slice: rng -> collision -> config -> loop.
var MODULE_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function readModules() {
  return MODULE_ORDER.map(function (name) {
    var filePath = path.join(SRC_DIR, name);
    var contents = fs.readFileSync(filePath, 'utf8');
    return '// ---- src/' + name + ' ----\n' + contents.replace(/\s+$/, '') + '\n';
  }).join('\n');
}

function buildBundle(bundleSrc) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundleSrc, 'utf8');
}

function buildHtml(bundleSrc) {
  // ADR-003 window.gameState stub: minimal shape at the initial 'ready'
  // state. Later slices' modules (SI.Game, entities, etc.) own the real
  // gameplay logic; this slice only guarantees the shape exists.
  var gameStateStub = [
    'window.gameState = {',
    '  state: \'ready\',',
    '  score: 0,',
    '  lives: (window.SI && window.SI.Config) ? window.SI.Config.STARTING_LIVES : 3,',
    '  wave: 1,',
    '  fps: 60,',
    '  player: { x: 0, y: 0, width: 0, height: 0 },',
    '  aliens: [],',
    '  playerBullets: [],',
    '  alienBullets: [],',
    '  shields: [],',
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 }',
    '};'
  ].join('\n');

  var html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Space Invaders</title>',
    '<style>',
    '  html, body { margin: 0; padding: 0; background: #000; height: 100%; }',
    '  body { display: flex; align-items: center; justify-content: center; }',
    '  canvas { background: #000; image-rendering: pixelated; }',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="game" width="800" height="600"></canvas>',
    '<script>',
    bundleSrc,
    '',
    gameStateStub,
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
}

function build() {
  var bundleSrc = readModules();
  buildBundle(bundleSrc);
  buildHtml(bundleSrc);
}

build();

+++ dist/game.js
// ---- src/rng.js ----
// SI.RNG — seedable Linear Congruential Generator (Numerical Recipes constants).
// Math.random()-compatible interface: seed(n) / next() -> [0, 1).
(function (SI) {
  'use strict';

  // ponytail: classic LCG (a=1664525, c=1013904223, m=2^32); good enough
  // determinism/spread for game randomness, not cryptographic use.
  var MODULUS = 4294967296; // 2^32
  var MULTIPLIER = 1664525;
  var INCREMENT = 1013904223;

  var state = 1;

  function seed(n) {
    // Coerce to an unsigned 32-bit integer so any numeric seed (including
    // negatives or floats) lands in a well-defined starting state.
    state = Number(n) >>> 0;
  }

  function next() {
    // Math.imul keeps the multiply within 32-bit semantics (matches the
    // classic LCG recurrence exactly, no floating-point drift).
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  }

  // Default seed so SI.RNG.next() is usable before any explicit seed() call;
  // tests/production code should call seed() for reproducibility.
  seed(Date.now());

  SI.RNG = {
    seed: seed,
    next: next
  };
})(window.SI = window.SI || {});

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio/game-state deps.
(function (SI) {
  'use strict';

  // Axis-aligned bounding box overlap test on {x, y, w, h} rectangles.
  // Strict inequalities: edges merely touching (separation == 0) do NOT
  // count as overlap; full containment and partial overlap both do.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  SI.Collision = {
    aabbOverlap: aabbOverlap
  };
})(window.SI = window.SI || {});

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
(function (SI) {
  'use strict';

  SI.Config = {
    // Fixed-timestep accumulator step (ADR-002). 1000/60 == 16.666...ms.
    FIXED_TIMESTEP_MS: 1000 / 60,

    // Alien grid.
    ALIEN_ROWS: 5,
    ALIEN_COLS: 11,

    // Player.
    STARTING_LIVES: 3,

    // Alien point values by row band (top rows worth the most).
    POINTS_TOP_ROW: 30,
    POINTS_MIDDLE_ROWS: 20,
    POINTS_BOTTOM_ROWS: 10,

    // UFO bonus is a random value in this inclusive range (SI.RNG-driven).
    UFO_BONUS_MIN: 50,
    UFO_BONUS_MAX: 300
  };
})(window.SI = window.SI || {});

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator skeleton (ADR-002). No game rules
// live here: it just drives SI.Game.update(dt) a deterministic number of
// times per frame and calls SI.Renderer.draw() once per frame. Both
// SI.Game and SI.Renderer are optional at this slice (later slices define
// them) — calls are guarded so the loop is safe to start standalone.
(function (SI) {
  'use strict';

  var accumulator = 0;
  var lastTime = null;
  var running = false;
  var frameHandle = null;

  function stepMs() {
    return (SI.Config && SI.Config.FIXED_TIMESTEP_MS) || 1000 / 60;
  }

  function now() {
    // ponytail: performance.now() in the browser, Date.now() fallback so
    // this also runs in a Node vm sandbox where performance may be absent.
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function requestFrame(cb) {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    // ponytail: setTimeout fallback for non-browser hosts (Node vm); real
    // rAF is always used when available (browsers, Playwright).
    if (typeof setTimeout === 'function') {
      return setTimeout(function () {
        cb(now());
      }, stepMs());
    }
    // No scheduler available at all (bare vm sandbox) — nothing to hook
    // into; start() still succeeds, it just never ticks.
    return null;
  }

  function cancelFrame(handle) {
    if (handle === null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
    } else if (typeof clearTimeout === 'function') {
      clearTimeout(handle);
    }
  }

  function tick(timestamp) {
    if (!running) return;

    var step = stepMs();
    if (lastTime === null) {
      lastTime = timestamp;
    }

    var delta = timestamp - lastTime;
    lastTime = timestamp;

    // Spiral-of-death guard: never let one frame try to catch up more than
    // 3 steps' worth of simulation time (e.g. after tab backgrounding).
    var maxDelta = step * 3;
    if (delta > maxDelta) {
      delta = maxDelta;
    }
    if (delta < 0) {
      delta = 0;
    }

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game && SI.Game.state);
    }

    frameHandle = requestFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    frameHandle = requestFrame(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  }

  SI.Loop = {
    start: start,
    stop: stop,
    isRunning: function () {
      return running;
    }
  };
})(window.SI = window.SI || {});

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { background: #000; image-rendering: pixelated; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
// ---- src/rng.js ----
// SI.RNG — seedable Linear Congruential Generator (Numerical Recipes constants).
// Math.random()-compatible interface: seed(n) / next() -> [0, 1).
(function (SI) {
  'use strict';

  // ponytail: classic LCG (a=1664525, c=1013904223, m=2^32); good enough
  // determinism/spread for game randomness, not cryptographic use.
  var MODULUS = 4294967296; // 2^32
  var MULTIPLIER = 1664525;
  var INCREMENT = 1013904223;

  var state = 1;

  function seed(n) {
    // Coerce to an unsigned 32-bit integer so any numeric seed (including
    // negatives or floats) lands in a well-defined starting state.
    state = Number(n) >>> 0;
  }

  function next() {
    // Math.imul keeps the multiply within 32-bit semantics (matches the
    // classic LCG recurrence exactly, no floating-point drift).
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  }

  // Default seed so SI.RNG.next() is usable before any explicit seed() call;
  // tests/production code should call seed() for reproducibility.
  seed(Date.now());

  SI.RNG = {
    seed: seed,
    next: next
  };
})(window.SI = window.SI || {});

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math. No canvas/audio/game-state deps.
(function (SI) {
  'use strict';

  // Axis-aligned bounding box overlap test on {x, y, w, h} rectangles.
  // Strict inequalities: edges merely touching (separation == 0) do NOT
  // count as overlap; full containment and partial overlap both do.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  SI.Collision = {
    aabbOverlap: aabbOverlap
  };
})(window.SI = window.SI || {});

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
(function (SI) {
  'use strict';

  SI.Config = {
    // Fixed-timestep accumulator step (ADR-002). 1000/60 == 16.666...ms.
    FIXED_TIMESTEP_MS: 1000 / 60,

    // Alien grid.
    ALIEN_ROWS: 5,
    ALIEN_COLS: 11,

    // Player.
    STARTING_LIVES: 3,

    // Alien point values by row band (top rows worth the most).
    POINTS_TOP_ROW: 30,
    POINTS_MIDDLE_ROWS: 20,
    POINTS_BOTTOM_ROWS: 10,

    // UFO bonus is a random value in this inclusive range (SI.RNG-driven).
    UFO_BONUS_MIN: 50,
    UFO_BONUS_MAX: 300
  };
})(window.SI = window.SI || {});

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator skeleton (ADR-002). No game rules
// live here: it just drives SI.Game.update(dt) a deterministic number of
// times per frame and calls SI.Renderer.draw() once per frame. Both
// SI.Game and SI.Renderer are optional at this slice (later slices define
// them) — calls are guarded so the loop is safe to start standalone.
(function (SI) {
  'use strict';

  var accumulator = 0;
  var lastTime = null;
  var running = false;
  var frameHandle = null;

  function stepMs() {
    return (SI.Config && SI.Config.FIXED_TIMESTEP_MS) || 1000 / 60;
  }

  function now() {
    // ponytail: performance.now() in the browser, Date.now() fallback so
    // this also runs in a Node vm sandbox where performance may be absent.
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function requestFrame(cb) {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    // ponytail: setTimeout fallback for non-browser hosts (Node vm); real
    // rAF is always used when available (browsers, Playwright).
    if (typeof setTimeout === 'function') {
      return setTimeout(function () {
        cb(now());
      }, stepMs());
    }
    // No scheduler available at all (bare vm sandbox) — nothing to hook
    // into; start() still succeeds, it just never ticks.
    return null;
  }

  function cancelFrame(handle) {
    if (handle === null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
    } else if (typeof clearTimeout === 'function') {
      clearTimeout(handle);
    }
  }

  function tick(timestamp) {
    if (!running) return;

    var step = stepMs();
    if (lastTime === null) {
      lastTime = timestamp;
    }

    var delta = timestamp - lastTime;
    lastTime = timestamp;

    // Spiral-of-death guard: never let one frame try to catch up more than
    // 3 steps' worth of simulation time (e.g. after tab backgrounding).
    var maxDelta = step * 3;
    if (delta > maxDelta) {
      delta = maxDelta;
    }
    if (delta < 0) {
      delta = 0;
    }

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game && SI.Game.state);
    }

    frameHandle = requestFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    frameHandle = requestFrame(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  }

  SI.Loop = {
    start: start,
    stop: stop,
    isRunning: function () {
      return running;
    }
  };
})(window.SI = window.SI || {});


window.gameState = {
  state: 'ready',
  score: 0,
  lives: (window.SI && window.SI.Config) ? window.SI.Config.STARTING_LIVES : 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 }
};
</script>
</body>
</html>

+++ src/collision.js
// SI.Collision — pure AABB overlap math. No canvas/audio/game-state deps.
(function (SI) {
  'use strict';

  // Axis-aligned bounding box overlap test on {x, y, w, h} rectangles.
  // Strict inequalities: edges merely touching (separation == 0) do NOT
  // count as overlap; full containment and partial overlap both do.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  SI.Collision = {
    aabbOverlap: aabbOverlap
  };
})(window.SI = window.SI || {});

+++ src/config.js
// SI.Config — named game constants. No magic numbers scattered elsewhere.
(function (SI) {
  'use strict';

  SI.Config = {
    // Fixed-timestep accumulator step (ADR-002). 1000/60 == 16.666...ms.
    FIXED_TIMESTEP_MS: 1000 / 60,

    // Alien grid.
    ALIEN_ROWS: 5,
    ALIEN_COLS: 11,

    // Player.
    STARTING_LIVES: 3,

    // Alien point values by row band (top rows worth the most).
    POINTS_TOP_ROW: 30,
    POINTS_MIDDLE_ROWS: 20,
    POINTS_BOTTOM_ROWS: 10,

    // UFO bonus is a random value in this inclusive range (SI.RNG-driven).
    UFO_BONUS_MIN: 50,
    UFO_BONUS_MAX: 300
  };
})(window.SI = window.SI || {});

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator skeleton (ADR-002). No game rules
// live here: it just drives SI.Game.update(dt) a deterministic number of
// times per frame and calls SI.Renderer.draw() once per frame. Both
// SI.Game and SI.Renderer are optional at this slice (later slices define
// them) — calls are guarded so the loop is safe to start standalone.
(function (SI) {
  'use strict';

  var accumulator = 0;
  var lastTime = null;
  var running = false;
  var frameHandle = null;

  function stepMs() {
    return (SI.Config && SI.Config.FIXED_TIMESTEP_MS) || 1000 / 60;
  }

  function now() {
    // ponytail: performance.now() in the browser, Date.now() fallback so
    // this also runs in a Node vm sandbox where performance may be absent.
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function requestFrame(cb) {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    // ponytail: setTimeout fallback for non-browser hosts (Node vm); real
    // rAF is always used when available (browsers, Playwright).
    if (typeof setTimeout === 'function') {
      return setTimeout(function () {
        cb(now());
      }, stepMs());
    }
    // No scheduler available at all (bare vm sandbox) — nothing to hook
    // into; start() still succeeds, it just never ticks.
    return null;
  }

  function cancelFrame(handle) {
    if (handle === null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
    } else if (typeof clearTimeout === 'function') {
      clearTimeout(handle);
    }
  }

  function tick(timestamp) {
    if (!running) return;

    var step = stepMs();
    if (lastTime === null) {
      lastTime = timestamp;
    }

    var delta = timestamp - lastTime;
    lastTime = timestamp;

    // Spiral-of-death guard: never let one frame try to catch up more than
    // 3 steps' worth of simulation time (e.g. after tab backgrounding).
    var maxDelta = step * 3;
    if (delta > maxDelta) {
      delta = maxDelta;
    }
    if (delta < 0) {
      delta = 0;
    }

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game && SI.Game.state);
    }

    frameHandle = requestFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    frameHandle = requestFrame(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  }

  SI.Loop = {
    start: start,
    stop: stop,
    isRunning: function () {
      return running;
    }
  };
})(window.SI = window.SI || {});

+++ src/rng.js
// SI.RNG — seedable Linear Congruential Generator (Numerical Recipes constants).
// Math.random()-compatible interface: seed(n) / next() -> [0, 1).
(function (SI) {
  'use strict';

  // ponytail: classic LCG (a=1664525, c=1013904223, m=2^32); good enough
  // determinism/spread for game randomness, not cryptographic use.
  var MODULUS = 4294967296; // 2^32
  var MULTIPLIER = 1664525;
  var INCREMENT = 1013904223;

  var state = 1;

  function seed(n) {
    // Coerce to an unsigned 32-bit integer so any numeric seed (including
    // negatives or floats) lands in a well-defined starting state.
    state = Number(n) >>> 0;
  }

  function next() {
    // Math.imul keeps the multiply within 32-bit semantics (matches the
    // classic LCG recurrence exactly, no floating-point drift).
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  }

  // Default seed so SI.RNG.next() is usable before any explicit seed() call;
  // tests/production code should call seed() for reproducibility.
  seed(Date.now());

  SI.RNG = {
    seed: seed,
    next: next
  };
})(window.SI = window.SI || {});
```

## specimen-C
- **culled because:** gate testPassRate=1.00

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// inlines that bundle into dist/index.html. Node builtins only (fs, path),
// per ADR-004. Idempotent: re-running produces the same output.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Fixed dependency order for this slice: rng -> collision -> config -> loop.
const MODULE_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function buildBundle() {
  const parts = MODULE_ORDER.map(function (file) {
    const filePath = path.join(SRC, file);
    const src = fs.readFileSync(filePath, 'utf8');
    return '// ---- src/' + file + ' ----\n' + src.trimEnd();
  });
  return parts.join('\n\n') + '\n';
}

function buildHtml(bundle) {
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Space Invaders</title>\n' +
    '<style>\n' +
    '  html, body { margin: 0; padding: 0; background: #000; }\n' +
    '  canvas { display: block; margin: 0 auto; background: #000; }\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<canvas id="game" width="800" height="600"></canvas>\n' +
    '<script>\n' +
    // ADR-003 gameState stub: field shape matches conventions.md; real
    // game logic (SI.Game) fills this in in a later slice.
    'window.gameState = {\n' +
    "  state: 'ready',\n" +
    '  score: 0,\n' +
    '  lives: 3,\n' +
    '  wave: 1,\n' +
    '  fps: 60,\n' +
    '  player: { x: 0, y: 0, width: 0, height: 0 },\n' +
    '  aliens: [],\n' +
    '  playerBullets: [],\n' +
    '  alienBullets: [],\n' +
    '  shields: [],\n' +
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },\n' +
    '};\n\n' +
    bundle +
    '</script>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST, 'game.js'), bundle);

  const html = buildHtml(bundle);
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

build();

+++ dist/game.js
// ---- src/rng.js ----
// SI.RNG — seedable 32-bit xorshift PRNG, Math.random()-compatible interface.
window.SI = window.SI || {};

(function () {
  // ponytail: single module-level state var scoped inside this IIFE, not a
  // bare top-level binding — safe under concatenation (ADR-001).
  let state = 1;

  function seed(n) {
    // xorshift32 requires a non-zero 32-bit state, so fold the seed through
    // a cheap mix and guard the stuck-at-zero case explicitly.
    let s = (n | 0) ^ 0x9e3779b9;
    if (s === 0) s = 0x9e3779b9;
    state = s >>> 0;
  }

  function next() {
    // xorshift32 core (Marsaglia).
    let x = state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    if (x === 0) x = 0x9e3779b9; // guard: never let state collapse to 0
    state = x;
    return state / 4294967296; // -> [0, 1)
  }

  seed(Date.now());

  SI.RNG = { seed: seed, next: next };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math, no canvas/audio deps.
window.SI = window.SI || {};

(function () {
  // Reusable 1-D interval-overlap helper: true when [aStart, aStart+aLen)
  // and [bStart, bStart+bLen) overlap with a positive-length intersection.
  // Edge-touch (intervals meeting exactly at a boundary) is excluded via
  // strict '<' on both sides.
  function intervalsOverlap(aStart, aLen, bStart, bLen) {
    return aStart < bStart + bLen && bStart < aStart + aLen;
  }

  // AABB overlap composed from the 1-D helper on the x axis and y axis.
  // Rects use { x, y, w, h }. Containment counts as overlap; separation and
  // exact edge-touch do not.
  function aabbOverlap(a, b) {
    return (
      intervalsOverlap(a.x, a.w, b.x, b.w) &&
      intervalsOverlap(a.y, a.h, b.y, b.h)
    );
  }

  SI.Collision = { intervalsOverlap: intervalsOverlap, aabbOverlap: aabbOverlap };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
window.SI = window.SI || {};

SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  // Point values by alien row-tier (10 = back row, 30 = front row).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // Grid march direction: aliens start moving this way (matches the classic
  // "upper-left to right" snake march used by the loop/game logic later).
  UPPER_SNAKE: { startDirection: 1, dropOnEdge: true },
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, decoupled from rendering (ADR-002).
// No game rules live here; it only drives SI.Game.update(dt) and
// SI.Renderer.draw(state) once those modules exist (later slices).
window.SI = window.SI || {};

(function () {
  const STEP = function () {
    return SI.Config && SI.Config.FIXED_TIMESTEP_MS
      ? SI.Config.FIXED_TIMESTEP_MS
      : 1000 / 60;
  };

  // rAF isn't available in a headless Node vm sanity-check; fall back to a
  // timer so this module loads and runs the same shape of loop either way.
  const raf =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : typeof setTimeout === 'function'
        ? function (cb) {
            return setTimeout(function () {
              cb(now());
            }, 16);
          }
        : function (cb) {
            cb(now());
            return null;
          };

  const cancelRaf =
    typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : function () {};

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  let running = false;
  let accumulator = 0;
  let lastTime = null;
  let frameHandle = null;

  function tick(timestamp) {
    if (!running) return;

    const step = STEP();
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    // Cap huge deltas (e.g. after tab backgrounding) to avoid a
    // spiral-of-death of catch-up updates.
    const maxDelta = 3 * step;
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0; // guard: clock could go backwards on some hosts

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw();
    }

    frameHandle = raf(tick);
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = now();
    frameHandle = raf(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) cancelRaf(frameHandle);
    frameHandle = null;
  }

  SI.Loop = { start: start, stop: stop };
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; }
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

// ---- src/rng.js ----
// SI.RNG — seedable 32-bit xorshift PRNG, Math.random()-compatible interface.
window.SI = window.SI || {};

(function () {
  // ponytail: single module-level state var scoped inside this IIFE, not a
  // bare top-level binding — safe under concatenation (ADR-001).
  let state = 1;

  function seed(n) {
    // xorshift32 requires a non-zero 32-bit state, so fold the seed through
    // a cheap mix and guard the stuck-at-zero case explicitly.
    let s = (n | 0) ^ 0x9e3779b9;
    if (s === 0) s = 0x9e3779b9;
    state = s >>> 0;
  }

  function next() {
    // xorshift32 core (Marsaglia).
    let x = state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    if (x === 0) x = 0x9e3779b9; // guard: never let state collapse to 0
    state = x;
    return state / 4294967296; // -> [0, 1)
  }

  seed(Date.now());

  SI.RNG = { seed: seed, next: next };
})();

// ---- src/collision.js ----
// SI.Collision — pure AABB overlap math, no canvas/audio deps.
window.SI = window.SI || {};

(function () {
  // Reusable 1-D interval-overlap helper: true when [aStart, aStart+aLen)
  // and [bStart, bStart+bLen) overlap with a positive-length intersection.
  // Edge-touch (intervals meeting exactly at a boundary) is excluded via
  // strict '<' on both sides.
  function intervalsOverlap(aStart, aLen, bStart, bLen) {
    return aStart < bStart + bLen && bStart < aStart + aLen;
  }

  // AABB overlap composed from the 1-D helper on the x axis and y axis.
  // Rects use { x, y, w, h }. Containment counts as overlap; separation and
  // exact edge-touch do not.
  function aabbOverlap(a, b) {
    return (
      intervalsOverlap(a.x, a.w, b.x, b.w) &&
      intervalsOverlap(a.y, a.h, b.y, b.h)
    );
  }

  SI.Collision = { intervalsOverlap: intervalsOverlap, aabbOverlap: aabbOverlap };
})();

// ---- src/config.js ----
// SI.Config — named game constants. No magic numbers scattered elsewhere.
window.SI = window.SI || {};

SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  // Point values by alien row-tier (10 = back row, 30 = front row).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // Grid march direction: aliens start moving this way (matches the classic
  // "upper-left to right" snake march used by the loop/game logic later).
  UPPER_SNAKE: { startDirection: 1, dropOnEdge: true },
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, decoupled from rendering (ADR-002).
// No game rules live here; it only drives SI.Game.update(dt) and
// SI.Renderer.draw(state) once those modules exist (later slices).
window.SI = window.SI || {};

(function () {
  const STEP = function () {
    return SI.Config && SI.Config.FIXED_TIMESTEP_MS
      ? SI.Config.FIXED_TIMESTEP_MS
      : 1000 / 60;
  };

  // rAF isn't available in a headless Node vm sanity-check; fall back to a
  // timer so this module loads and runs the same shape of loop either way.
  const raf =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : typeof setTimeout === 'function'
        ? function (cb) {
            return setTimeout(function () {
              cb(now());
            }, 16);
          }
        : function (cb) {
            cb(now());
            return null;
          };

  const cancelRaf =
    typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : function () {};

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  let running = false;
  let accumulator = 0;
  let lastTime = null;
  let frameHandle = null;

  function tick(timestamp) {
    if (!running) return;

    const step = STEP();
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    // Cap huge deltas (e.g. after tab backgrounding) to avoid a
    // spiral-of-death of catch-up updates.
    const maxDelta = 3 * step;
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0; // guard: clock could go backwards on some hosts

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw();
    }

    frameHandle = raf(tick);
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = now();
    frameHandle = raf(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) cancelRaf(frameHandle);
    frameHandle = null;
  }

  SI.Loop = { start: start, stop: stop };
})();
</script>
</body>
</html>

+++ src/collision.js
// SI.Collision — pure AABB overlap math, no canvas/audio deps.
window.SI = window.SI || {};

(function () {
  // Reusable 1-D interval-overlap helper: true when [aStart, aStart+aLen)
  // and [bStart, bStart+bLen) overlap with a positive-length intersection.
  // Edge-touch (intervals meeting exactly at a boundary) is excluded via
  // strict '<' on both sides.
  function intervalsOverlap(aStart, aLen, bStart, bLen) {
    return aStart < bStart + bLen && bStart < aStart + aLen;
  }

  // AABB overlap composed from the 1-D helper on the x axis and y axis.
  // Rects use { x, y, w, h }. Containment counts as overlap; separation and
  // exact edge-touch do not.
  function aabbOverlap(a, b) {
    return (
      intervalsOverlap(a.x, a.w, b.x, b.w) &&
      intervalsOverlap(a.y, a.h, b.y, b.h)
    );
  }

  SI.Collision = { intervalsOverlap: intervalsOverlap, aabbOverlap: aabbOverlap };
})();

+++ src/config.js
// SI.Config — named game constants. No magic numbers scattered elsewhere.
window.SI = window.SI || {};

SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  // Point values by alien row-tier (10 = back row, 30 = front row).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // Grid march direction: aliens start moving this way (matches the classic
  // "upper-left to right" snake march used by the loop/game logic later).
  UPPER_SNAKE: { startDirection: 1, dropOnEdge: true },
};

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator, decoupled from rendering (ADR-002).
// No game rules live here; it only drives SI.Game.update(dt) and
// SI.Renderer.draw(state) once those modules exist (later slices).
window.SI = window.SI || {};

(function () {
  const STEP = function () {
    return SI.Config && SI.Config.FIXED_TIMESTEP_MS
      ? SI.Config.FIXED_TIMESTEP_MS
      : 1000 / 60;
  };

  // rAF isn't available in a headless Node vm sanity-check; fall back to a
  // timer so this module loads and runs the same shape of loop either way.
  const raf =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : typeof setTimeout === 'function'
        ? function (cb) {
            return setTimeout(function () {
              cb(now());
            }, 16);
          }
        : function (cb) {
            cb(now());
            return null;
          };

  const cancelRaf =
    typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : function () {};

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  let running = false;
  let accumulator = 0;
  let lastTime = null;
  let frameHandle = null;

  function tick(timestamp) {
    if (!running) return;

    const step = STEP();
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    // Cap huge deltas (e.g. after tab backgrounding) to avoid a
    // spiral-of-death of catch-up updates.
    const maxDelta = 3 * step;
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0; // guard: clock could go backwards on some hosts

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw();
    }

    frameHandle = raf(tick);
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = now();
    frameHandle = raf(tick);
  }

  function stop() {
    running = false;
    if (frameHandle !== null) cancelRaf(frameHandle);
    frameHandle = null;
  }

  SI.Loop = { start: start, stop: stop };
})();

+++ src/rng.js
// SI.RNG — seedable 32-bit xorshift PRNG, Math.random()-compatible interface.
window.SI = window.SI || {};

(function () {
  // ponytail: single module-level state var scoped inside this IIFE, not a
  // bare top-level binding — safe under concatenation (ADR-001).
  let state = 1;

  function seed(n) {
    // xorshift32 requires a non-zero 32-bit state, so fold the seed through
    // a cheap mix and guard the stuck-at-zero case explicitly.
    let s = (n | 0) ^ 0x9e3779b9;
    if (s === 0) s = 0x9e3779b9;
    state = s >>> 0;
  }

  function next() {
    // xorshift32 core (Marsaglia).
    let x = state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    if (x === 0) x = 0x9e3779b9; // guard: never let state collapse to 0
    state = x;
    return state / 4294967296; // -> [0, 1)
  }

  seed(Date.now());

  SI.RNG = { seed: seed, next: next };
})();
```

## specimen-D
- **culled because:** gate testPassRate=0.94

```diff
+++ build.js
'use strict';

// build.js — Node builtins only (fs, path). Recursively walks src/, but
// always emits modules in the fixed dependency order from ADR-004
// (rng -> collision -> config -> loop [-> future modules]); writes
// dist/game.js (the plain concatenated bundle, no HTML — the harness's
// eval entrypoint) and dist/index.html (canvas shell + minimal CSS +
// ADR-003 gameState stub, inlining that same bundle). Idempotent: running
// it twice in a row produces byte-identical output.

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Authoritative dependency order for the modules this slice owns. Any
// module not listed here (a future entities/*.js, game.js, main.js...)
// still gets discovered by the recursive walk and appended afterwards, in
// deterministic (sorted) order, so the build never silently drops a file.
const FIXED_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function orderedSourceFiles() {
  const discovered = walk(SRC_DIR);
  const byRelPath = new Map();
  for (const file of discovered) {
    const rel = path.relative(SRC_DIR, file).split(path.sep).join('/');
    byRelPath.set(rel, file);
  }

  const ordered = [];
  for (const name of FIXED_ORDER) {
    if (byRelPath.has(name)) {
      ordered.push([name, byRelPath.get(name)]);
      byRelPath.delete(name);
    }
  }

  const remainingKeys = Array.from(byRelPath.keys()).sort();
  for (const key of remainingKeys) {
    ordered.push([key, byRelPath.get(key)]);
  }

  return ordered;
}

function buildBundle() {
  const files = orderedSourceFiles();
  const sections = files.map(([rel, full]) => {
    const code = fs.readFileSync(full, 'utf8').replace(/\s+$/, '');
    return '// --- src/' + rel + ' ---\n' + code + '\n';
  });
  return sections.join('\n');
}

function buildHtml(bundle) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<title>Space Invaders</title>',
    '<style>',
    '  html, body {',
    '    margin: 0;',
    '    padding: 0;',
    '    height: 100%;',
    '    background: #000;',
    '    display: flex;',
    '    align-items: center;',
    '    justify-content: center;',
    '  }',
    '  canvas {',
    '    background: #000;',
    '    display: block;',
    '    image-rendering: pixelated;',
    '  }',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="game" width="800" height="600"></canvas>',
    '<script>',
    bundle,
    '// ADR-003 gameState stub: only set here if a later-loaded module',
    "// (main.js, in a future slice) hasn't already wired the live object.",
    'window.gameState = window.gameState || {',
    "  state: 'ready',",
    '  score: 0,',
    '  lives: SI.Config.STARTING_LIVES,',
    '  wave: 1,',
    '  fps: 60,',
    '  player: { x: 0, y: 0, width: 0, height: 0 },',
    '  aliens: [],',
    '  playerBullets: [],',
    '  alienBullets: [],',
    '  shields: [],',
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },',
    '};',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function main() {
  const bundle = buildBundle();
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle), 'utf8');
}

main();

+++ dist/game.js
// --- src/rng.js ---
// SI.RNG — seedable PRNG (sfc32), Math.random()-compatible interface.
// No Math.random() anywhere in this project — see ADR-003.
window.SI = window.SI || {};

SI.RNG = (function () {
  // sfc32 internal state (four 32-bit words).
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  // sfc32 core generator — returns a float in [0, 1).
  function sfc32() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  // splitmix32 — expands a single integer seed into four well-mixed state
  // words for sfc32 (a single seed word alone gives sfc32 a weak start).
  function splitmix32(seedRef) {
    return function next() {
      seedRef.value = (seedRef.value + 0x9e3779b9) | 0;
      let t = seedRef.value;
      t ^= t >>> 15;
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      return t >>> 0;
    };
  }

  function seed(n) {
    const seedRef = { value: n >>> 0 };
    const gen = splitmix32(seedRef);
    a = gen();
    b = gen();
    c = gen();
    d = gen();
    // Discard a handful of outputs so early calls don't reflect the seed
    // expansion too directly.
    for (let i = 0; i < 15; i++) sfc32();
  }

  // Deterministic default so the game is never accidentally reliant on
  // Math.random()/Date.now() before something explicitly seeds it.
  seed(0);

  return {
    seed: seed,
    next: sfc32,
  };
})();

// --- src/collision.js ---
// SI.Collision — pure AABB overlap math. No canvas/audio deps, no mutation.
window.SI = window.SI || {};

SI.Collision = {
  // aabbOverlap(a, b) — true when axis-aligned boxes {x, y, w, h} overlap or
  // one contains the other. Edges merely touching (zero-width intersection)
  // are NOT an overlap — every comparison is strict `<`.
  aabbOverlap: function (a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  },
};

// --- src/config.js ---
// SI.Config — every named game constant, frozen so it can't drift at
// runtime. No magic numbers scattered through game logic — see conventions.md.
window.SI = window.SI || {};

SI.Config = Object.freeze({
  // Fixed-timestep accumulator step (~16.667ms => 60 logic updates/sec).
  FIXED_TIMESTEP_MS: 1000 / 60,

  // Alien grid.
  GRID_ROWS: 5,
  GRID_COLS: 11,

  STARTING_LIVES: 3,

  // Alien point values by row tier (low row = highest value nearest player
  // is a game-design detail owned by later slices; this just names the
  // three tiers required by the intent).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  // UFO bonus score range (inclusive), actual value drawn via SI.RNG.
  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,
});

// --- src/loop.js ---
// SI.Loop — fixed-timestep accumulator, rAF driver. See ADR-002.
// No game rules live here: it just calls SI.Game.update(FIXED_TIMESTEP_MS)
// an integer number of times per frame (carrying the remainder in an
// accumulator) and then SI.Renderer.draw() once. Both SI.Game and
// SI.Renderer are optional at this slice — later slices provide them.
window.SI = window.SI || {};

SI.Loop = (function () {
  let accumulator = 0;
  let lastTime = null;
  let rafHandle = null;
  let running = false;

  function tick(timestamp) {
    if (!running) return;

    if (lastTime === null) {
      lastTime = timestamp;
    }
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    const step = SI.Config.FIXED_TIMESTEP_MS;
    const maxDelta = 3 * step; // cap huge deltas (tab backgrounding etc.)
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0;

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game ? SI.Game.state : undefined);
    }

    rafHandle = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    rafHandle = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  return {
    start: start,
    stop: stop,
  };
})();

+++ dist/index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas {
    background: #000;
    display: block;
    image-rendering: pixelated;
  }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
// --- src/rng.js ---
// SI.RNG — seedable PRNG (sfc32), Math.random()-compatible interface.
// No Math.random() anywhere in this project — see ADR-003.
window.SI = window.SI || {};

SI.RNG = (function () {
  // sfc32 internal state (four 32-bit words).
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  // sfc32 core generator — returns a float in [0, 1).
  function sfc32() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  // splitmix32 — expands a single integer seed into four well-mixed state
  // words for sfc32 (a single seed word alone gives sfc32 a weak start).
  function splitmix32(seedRef) {
    return function next() {
      seedRef.value = (seedRef.value + 0x9e3779b9) | 0;
      let t = seedRef.value;
      t ^= t >>> 15;
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      return t >>> 0;
    };
  }

  function seed(n) {
    const seedRef = { value: n >>> 0 };
    const gen = splitmix32(seedRef);
    a = gen();
    b = gen();
    c = gen();
    d = gen();
    // Discard a handful of outputs so early calls don't reflect the seed
    // expansion too directly.
    for (let i = 0; i < 15; i++) sfc32();
  }

  // Deterministic default so the game is never accidentally reliant on
  // Math.random()/Date.now() before something explicitly seeds it.
  seed(0);

  return {
    seed: seed,
    next: sfc32,
  };
})();

// --- src/collision.js ---
// SI.Collision — pure AABB overlap math. No canvas/audio deps, no mutation.
window.SI = window.SI || {};

SI.Collision = {
  // aabbOverlap(a, b) — true when axis-aligned boxes {x, y, w, h} overlap or
  // one contains the other. Edges merely touching (zero-width intersection)
  // are NOT an overlap — every comparison is strict `<`.
  aabbOverlap: function (a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  },
};

// --- src/config.js ---
// SI.Config — every named game constant, frozen so it can't drift at
// runtime. No magic numbers scattered through game logic — see conventions.md.
window.SI = window.SI || {};

SI.Config = Object.freeze({
  // Fixed-timestep accumulator step (~16.667ms => 60 logic updates/sec).
  FIXED_TIMESTEP_MS: 1000 / 60,

  // Alien grid.
  GRID_ROWS: 5,
  GRID_COLS: 11,

  STARTING_LIVES: 3,

  // Alien point values by row tier (low row = highest value nearest player
  // is a game-design detail owned by later slices; this just names the
  // three tiers required by the intent).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  // UFO bonus score range (inclusive), actual value drawn via SI.RNG.
  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,
});

// --- src/loop.js ---
// SI.Loop — fixed-timestep accumulator, rAF driver. See ADR-002.
// No game rules live here: it just calls SI.Game.update(FIXED_TIMESTEP_MS)
// an integer number of times per frame (carrying the remainder in an
// accumulator) and then SI.Renderer.draw() once. Both SI.Game and
// SI.Renderer are optional at this slice — later slices provide them.
window.SI = window.SI || {};

SI.Loop = (function () {
  let accumulator = 0;
  let lastTime = null;
  let rafHandle = null;
  let running = false;

  function tick(timestamp) {
    if (!running) return;

    if (lastTime === null) {
      lastTime = timestamp;
    }
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    const step = SI.Config.FIXED_TIMESTEP_MS;
    const maxDelta = 3 * step; // cap huge deltas (tab backgrounding etc.)
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0;

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game ? SI.Game.state : undefined);
    }

    rafHandle = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    rafHandle = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  return {
    start: start,
    stop: stop,
  };
})();

// ADR-003 gameState stub: only set here if a later-loaded module
// (main.js, in a future slice) hasn't already wired the live object.
window.gameState = window.gameState || {
  state: 'ready',
  score: 0,
  lives: SI.Config.STARTING_LIVES,
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
</body>
</html>

+++ src/collision.js
// SI.Collision — pure AABB overlap math. No canvas/audio deps, no mutation.
window.SI = window.SI || {};

SI.Collision = {
  // aabbOverlap(a, b) — true when axis-aligned boxes {x, y, w, h} overlap or
  // one contains the other. Edges merely touching (zero-width intersection)
  // are NOT an overlap — every comparison is strict `<`.
  aabbOverlap: function (a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  },
};

+++ src/config.js
// SI.Config — every named game constant, frozen so it can't drift at
// runtime. No magic numbers scattered through game logic — see conventions.md.
window.SI = window.SI || {};

SI.Config = Object.freeze({
  // Fixed-timestep accumulator step (~16.667ms => 60 logic updates/sec).
  FIXED_TIMESTEP_MS: 1000 / 60,

  // Alien grid.
  GRID_ROWS: 5,
  GRID_COLS: 11,

  STARTING_LIVES: 3,

  // Alien point values by row tier (low row = highest value nearest player
  // is a game-design detail owned by later slices; this just names the
  // three tiers required by the intent).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  // UFO bonus score range (inclusive), actual value drawn via SI.RNG.
  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,
});

+++ src/loop.js
// SI.Loop — fixed-timestep accumulator, rAF driver. See ADR-002.
// No game rules live here: it just calls SI.Game.update(FIXED_TIMESTEP_MS)
// an integer number of times per frame (carrying the remainder in an
// accumulator) and then SI.Renderer.draw() once. Both SI.Game and
// SI.Renderer are optional at this slice — later slices provide them.
window.SI = window.SI || {};

SI.Loop = (function () {
  let accumulator = 0;
  let lastTime = null;
  let rafHandle = null;
  let running = false;

  function tick(timestamp) {
    if (!running) return;

    if (lastTime === null) {
      lastTime = timestamp;
    }
    let delta = timestamp - lastTime;
    lastTime = timestamp;

    const step = SI.Config.FIXED_TIMESTEP_MS;
    const maxDelta = 3 * step; // cap huge deltas (tab backgrounding etc.)
    if (delta > maxDelta) delta = maxDelta;
    if (delta < 0) delta = 0;

    accumulator += delta;

    while (accumulator >= step) {
      if (SI.Game && typeof SI.Game.update === 'function') {
        SI.Game.update(step);
      }
      accumulator -= step;
    }

    if (SI.Renderer && typeof SI.Renderer.draw === 'function') {
      SI.Renderer.draw(SI.Game ? SI.Game.state : undefined);
    }

    rafHandle = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    accumulator = 0;
    rafHandle = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  return {
    start: start,
    stop: stop,
  };
})();

+++ src/rng.js
// SI.RNG — seedable PRNG (sfc32), Math.random()-compatible interface.
// No Math.random() anywhere in this project — see ADR-003.
window.SI = window.SI || {};

SI.RNG = (function () {
  // sfc32 internal state (four 32-bit words).
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  // sfc32 core generator — returns a float in [0, 1).
  function sfc32() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  // splitmix32 — expands a single integer seed into four well-mixed state
  // words for sfc32 (a single seed word alone gives sfc32 a weak start).
  function splitmix32(seedRef) {
    return function next() {
      seedRef.value = (seedRef.value + 0x9e3779b9) | 0;
      let t = seedRef.value;
      t ^= t >>> 15;
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      return t >>> 0;
    };
  }

  function seed(n) {
    const seedRef = { value: n >>> 0 };
    const gen = splitmix32(seedRef);
    a = gen();
    b = gen();
    c = gen();
    d = gen();
    // Discard a handful of outputs so early calls don't reflect the seed
    // expansion too directly.
    for (let i = 0; i < 15; i++) sfc32();
  }

  // Deterministic default so the game is never accidentally reliant on
  // Math.random()/Date.now() before something explicitly seeds it.
  seed(0);

  return {
    seed: seed,
    next: sfc32,
  };
})();
```
