---
summary: "Pressure log slice-06: 3 culled."
---

# Pressure log — slice-06

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

// Dependency order for this slice: rng -> collision -> config -> audio ->
// renderer -> loop -> player -> bullet -> alien -> shield -> ufo -> game ->
// main. audio.js/renderer.js only touch browser APIs lazily inside their
// exported functions (no load-time DOM/AudioContext access), so they're
// safe to load early; main.js must load LAST since it calls SI.Game.init()
// and SI.Loop.start() at boot, which need every other module already
// defined.
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'audio.js',
  'renderer.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'game.js',
  'main.js',
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/audio.js ----
// SI.Audio — WebAudio SFX synthesis (ADR-001: renderer/audio are the only
// modules allowed to touch browser APIs — here, AudioContext). Strategy:
// lazily construct ONE AudioContext on first sound (never at module-load
// time, so loading the bundle headless/in Node never touches AudioContext
// at all), then synthesize each effect as a short oscillator + gain-
// envelope burst. Every public method is wrapped so a missing, failed, or
// suspended AudioContext never throws into game logic — per conventions.md
// "console.error, don't crash" fallback.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var initTried = false;

  // Lazily creates (once) and returns the shared AudioContext, or null if
  // unavailable/failed. Only ever attempts construction once per page load
  // — a failed environment (headless browser with no AudioContext, or a
  // browser that throws on construction) doesn't retry and doesn't spam
  // console.error on every subsequent sound call.
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (initTried) {
      return null;
    }
    initTried = true;
    try {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) {
        return null;
      }
      ctx = new AC();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — the shared synthesis primitive: an oscillator through a
  // gain node that exponentially decays to (near-)silence, i.e. a simple
  // percussive envelope. Guarded so any failure (suspended context,
  // disallowed autoplay, an oscillator that refuses to start) is caught
  // and swallowed rather than propagated.
  function playTone(freq, duration, type, peakGain) {
    try {
      var c = getContext();
      if (!c) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        // Best-effort resume (user-gesture-gated in some browsers); never
        // block or throw on the returned promise rejecting.
        var resumed = c.resume();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(function () {});
        }
      }

      var osc = c.createOscillator();
      var gain = c.createGain();
      var now = c.currentTime;

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(peakGain || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Never let a sound-effect failure interrupt gameplay.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.09, 'square', 0.15);
  }

  function playExplosion() {
    playTone(110, 0.3, 'sawtooth', 0.25);
  }

  function playHit() {
    playTone(220, 0.15, 'triangle', 0.2);
  }

  function playUfo() {
    playTone(440, 0.2, 'sine', 0.15);
  }

  function playGameover() {
    playTone(80, 0.6, 'sawtooth', 0.25);
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playHit: playHit,
    playUfo: playUfo,
    playGameover: playGameover,
  };
})();

// ---- src/renderer.js ----
// SI.Renderer — canvas drawing only (ADR-001/conventions: reads state,
// never mutates it). Strategy: plain fillRect/fillText, no sprites/images,
// kept deliberately light so P5 (median_fps >= 50) has headroom. The whole
// body is wrapped in try/catch so a draw() call can never throw into the
// rAF loop, no matter what shape `state` is in.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var canvas = null;
  var ctx = null;

  // Looked up lazily (not at module-load time) so this file works whether
  // or not a <canvas id="game"> exists yet, and no-ops cleanly in
  // non-browser environments (no `document`).
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function drawRect(c, entity, color) {
    if (!entity) {
      return;
    }
    c.fillStyle = color;
    c.fillRect(entity.x, entity.y, entity.width, entity.height);
  }

  // draw — read-only w.r.t. `state`; never mutates any field. Clears the
  // canvas, then draws player, aliens, bullets, shields, ufo, and a small
  // score/lives/wave HUD text. Guarded end-to-end: a missing canvas,
  // missing state, or malformed entity just results in a partial/no-op
  // frame, never an exception.
  function draw(state) {
    try {
      var c = getContext();
      if (!c || !state) {
        return;
      }

      var w = c.canvas.width;
      var h = c.canvas.height;

      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);

      drawRect(c, state.player, '#4caf50');

      var aliens = state.aliens || [];
      c.fillStyle = '#ffffff';
      for (var i = 0; i < aliens.length; i++) {
        var alien = aliens[i];
        if (alien && alien.alive === false) {
          continue;
        }
        drawRect(c, alien, '#ffffff');
      }

      var playerBullets = state.playerBullets || [];
      for (var j = 0; j < playerBullets.length; j++) {
        drawRect(c, playerBullets[j], '#00e5ff');
      }

      var alienBullets = state.alienBullets || [];
      for (var k = 0; k < alienBullets.length; k++) {
        drawRect(c, alienBullets[k], '#ff5252');
      }

      var shields = state.shields || [];
      var Shield = window.SI && window.SI.Shield;
      for (var s = 0; s < shields.length; s++) {
        var shield = shields[s];
        var cells = (shield && shield.cells) || [];
        for (var ci = 0; ci < cells.length; ci++) {
          if (!(cells[ci] > 0)) {
            continue;
          }
          var rect = Shield && Shield.cellRect ? Shield.cellRect(shield, ci) : null;
          if (rect) {
            drawRect(c, rect, '#8bc34a');
          }
        }
      }

      if (state.ufo && state.ufo.active) {
        drawRect(c, state.ufo, '#e040fb');
      }

      c.fillStyle = '#ffffff';
      c.font = '16px monospace';
      c.textBaseline = 'top';
      c.fillText('Score: ' + state.score, 10, 8);
      c.fillText('Lives: ' + state.lives, 10, 28);
      c.fillText('Wave: ' + state.wave, 10, 48);
    } catch (e) {
      // ponytail: swallow — a render glitch must never crash the game
      // loop; console.error keeps it visible without throwing.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns the
// rolling-median fps sample (slice-06, P5), computed from raw rAF timing
// and written into gameState.fps for observability only.
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06, P5) — informational only, per ADR-002:
  // computed here from the RAW, uncapped rAF frame delta (never the
  // spiral-of-death-capped delta used for the accumulator below), written
  // into gameState.fps for observability, and never read back into
  // update() timing. Fixed-size ring buffer of recent instantaneous fps
  // samples; median (not mean) so one stalled frame can't swing the
  // reported number the way an outlier would in a mean.
  var FPS_WINDOW = 30;
  var fpsSamples = [];
  var fpsIndex = 0;

  function recordFps(rawDelta) {
    if (rawDelta <= 0) {
      return; // skip non-positive deltas — avoids Infinity/NaN samples
    }
    var instantaneous = 1000 / rawDelta;
    if (fpsSamples.length < FPS_WINDOW) {
      fpsSamples.push(instantaneous);
    } else {
      fpsSamples[fpsIndex] = instantaneous;
      fpsIndex = (fpsIndex + 1) % FPS_WINDOW;
    }
  }

  function medianFps() {
    if (fpsSamples.length === 0) {
      return 0;
    }
    var sorted = fpsSamples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;
    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Capping happens on a COPY of
    // the delta so the fps sample above always reflects real frame timing.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    var state = window.SI.Game.state;
    if (state) {
      state.fps = medianFps();
    }

    window.SI.Renderer.draw(state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsIndex = 0;
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/main.js ----
// main.js — bootstrap: canvas/audio-context setup (lazy, see audio.js),
// window.gameState wiring (ADR-003 live reference), keyboard input, and
// SI.Loop.start(). Last file in concatenation order (conventions.md).
//
// Browser guard: the bundle must also load cleanly in a bare Node vm (the
// mutation-testing smoke check runs it with `window` aliased to the
// global object but no `document`/`requestAnimationFrame`). In that
// environment every module above this one still defines its SI.* object
// (SI.Renderer, SI.Audio, etc. exist), but boot() below must NO-OP instead
// of throwing on a missing DOM/rAF.
(function () {
  function isBrowserEnvironment() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  function bindInput(input) {
    function setFlag(code, value) {
      if (code === 'ArrowLeft') {
        input.left = value;
      } else if (code === 'ArrowRight') {
        input.right = value;
      } else if (code === 'Space') {
        input.fire = value;
      }
    }

    window.addEventListener('keydown', function (e) {
      setFlag(e.code, true);
    });
    window.addEventListener('keyup', function (e) {
      setFlag(e.code, false);
    });
  }

  function boot() {
    if (!isBrowserEnvironment()) {
      return; // non-browser load (e.g. bare Node vm smoke check) — no-op
    }

    window.SI.Game.init();
    // Live reference (ADR-003): same object every frame, never reassigned.
    window.gameState = window.SI.Game.state;

    bindInput(window.SI.Game.input);

    window.SI.Loop.start();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/audio.js ----
// SI.Audio — WebAudio SFX synthesis (ADR-001: renderer/audio are the only
// modules allowed to touch browser APIs — here, AudioContext). Strategy:
// lazily construct ONE AudioContext on first sound (never at module-load
// time, so loading the bundle headless/in Node never touches AudioContext
// at all), then synthesize each effect as a short oscillator + gain-
// envelope burst. Every public method is wrapped so a missing, failed, or
// suspended AudioContext never throws into game logic — per conventions.md
// "console.error, don't crash" fallback.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var initTried = false;

  // Lazily creates (once) and returns the shared AudioContext, or null if
  // unavailable/failed. Only ever attempts construction once per page load
  // — a failed environment (headless browser with no AudioContext, or a
  // browser that throws on construction) doesn't retry and doesn't spam
  // console.error on every subsequent sound call.
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (initTried) {
      return null;
    }
    initTried = true;
    try {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) {
        return null;
      }
      ctx = new AC();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — the shared synthesis primitive: an oscillator through a
  // gain node that exponentially decays to (near-)silence, i.e. a simple
  // percussive envelope. Guarded so any failure (suspended context,
  // disallowed autoplay, an oscillator that refuses to start) is caught
  // and swallowed rather than propagated.
  function playTone(freq, duration, type, peakGain) {
    try {
      var c = getContext();
      if (!c) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        // Best-effort resume (user-gesture-gated in some browsers); never
        // block or throw on the returned promise rejecting.
        var resumed = c.resume();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(function () {});
        }
      }

      var osc = c.createOscillator();
      var gain = c.createGain();
      var now = c.currentTime;

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(peakGain || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Never let a sound-effect failure interrupt gameplay.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.09, 'square', 0.15);
  }

  function playExplosion() {
    playTone(110, 0.3, 'sawtooth', 0.25);
  }

  function playHit() {
    playTone(220, 0.15, 'triangle', 0.2);
  }

  function playUfo() {
    playTone(440, 0.2, 'sine', 0.15);
  }

  function playGameover() {
    playTone(80, 0.6, 'sawtooth', 0.25);
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playHit: playHit,
    playUfo: playUfo,
    playGameover: playGameover,
  };
})();

// ---- src/renderer.js ----
// SI.Renderer — canvas drawing only (ADR-001/conventions: reads state,
// never mutates it). Strategy: plain fillRect/fillText, no sprites/images,
// kept deliberately light so P5 (median_fps >= 50) has headroom. The whole
// body is wrapped in try/catch so a draw() call can never throw into the
// rAF loop, no matter what shape `state` is in.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var canvas = null;
  var ctx = null;

  // Looked up lazily (not at module-load time) so this file works whether
  // or not a <canvas id="game"> exists yet, and no-ops cleanly in
  // non-browser environments (no `document`).
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function drawRect(c, entity, color) {
    if (!entity) {
      return;
    }
    c.fillStyle = color;
    c.fillRect(entity.x, entity.y, entity.width, entity.height);
  }

  // draw — read-only w.r.t. `state`; never mutates any field. Clears the
  // canvas, then draws player, aliens, bullets, shields, ufo, and a small
  // score/lives/wave HUD text. Guarded end-to-end: a missing canvas,
  // missing state, or malformed entity just results in a partial/no-op
  // frame, never an exception.
  function draw(state) {
    try {
      var c = getContext();
      if (!c || !state) {
        return;
      }

      var w = c.canvas.width;
      var h = c.canvas.height;

      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);

      drawRect(c, state.player, '#4caf50');

      var aliens = state.aliens || [];
      c.fillStyle = '#ffffff';
      for (var i = 0; i < aliens.length; i++) {
        var alien = aliens[i];
        if (alien && alien.alive === false) {
          continue;
        }
        drawRect(c, alien, '#ffffff');
      }

      var playerBullets = state.playerBullets || [];
      for (var j = 0; j < playerBullets.length; j++) {
        drawRect(c, playerBullets[j], '#00e5ff');
      }

      var alienBullets = state.alienBullets || [];
      for (var k = 0; k < alienBullets.length; k++) {
        drawRect(c, alienBullets[k], '#ff5252');
      }

      var shields = state.shields || [];
      var Shield = window.SI && window.SI.Shield;
      for (var s = 0; s < shields.length; s++) {
        var shield = shields[s];
        var cells = (shield && shield.cells) || [];
        for (var ci = 0; ci < cells.length; ci++) {
          if (!(cells[ci] > 0)) {
            continue;
          }
          var rect = Shield && Shield.cellRect ? Shield.cellRect(shield, ci) : null;
          if (rect) {
            drawRect(c, rect, '#8bc34a');
          }
        }
      }

      if (state.ufo && state.ufo.active) {
        drawRect(c, state.ufo, '#e040fb');
      }

      c.fillStyle = '#ffffff';
      c.font = '16px monospace';
      c.textBaseline = 'top';
      c.fillText('Score: ' + state.score, 10, 8);
      c.fillText('Lives: ' + state.lives, 10, 28);
      c.fillText('Wave: ' + state.wave, 10, 48);
    } catch (e) {
      // ponytail: swallow — a render glitch must never crash the game
      // loop; console.error keeps it visible without throwing.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns the
// rolling-median fps sample (slice-06, P5), computed from raw rAF timing
// and written into gameState.fps for observability only.
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06, P5) — informational only, per ADR-002:
  // computed here from the RAW, uncapped rAF frame delta (never the
  // spiral-of-death-capped delta used for the accumulator below), written
  // into gameState.fps for observability, and never read back into
  // update() timing. Fixed-size ring buffer of recent instantaneous fps
  // samples; median (not mean) so one stalled frame can't swing the
  // reported number the way an outlier would in a mean.
  var FPS_WINDOW = 30;
  var fpsSamples = [];
  var fpsIndex = 0;

  function recordFps(rawDelta) {
    if (rawDelta <= 0) {
      return; // skip non-positive deltas — avoids Infinity/NaN samples
    }
    var instantaneous = 1000 / rawDelta;
    if (fpsSamples.length < FPS_WINDOW) {
      fpsSamples.push(instantaneous);
    } else {
      fpsSamples[fpsIndex] = instantaneous;
      fpsIndex = (fpsIndex + 1) % FPS_WINDOW;
    }
  }

  function medianFps() {
    if (fpsSamples.length === 0) {
      return 0;
    }
    var sorted = fpsSamples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;
    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Capping happens on a COPY of
    // the delta so the fps sample above always reflects real frame timing.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    var state = window.SI.Game.state;
    if (state) {
      state.fps = medianFps();
    }

    window.SI.Renderer.draw(state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsIndex = 0;
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/main.js ----
// main.js — bootstrap: canvas/audio-context setup (lazy, see audio.js),
// window.gameState wiring (ADR-003 live reference), keyboard input, and
// SI.Loop.start(). Last file in concatenation order (conventions.md).
//
// Browser guard: the bundle must also load cleanly in a bare Node vm (the
// mutation-testing smoke check runs it with `window` aliased to the
// global object but no `document`/`requestAnimationFrame`). In that
// environment every module above this one still defines its SI.* object
// (SI.Renderer, SI.Audio, etc. exist), but boot() below must NO-OP instead
// of throwing on a missing DOM/rAF.
(function () {
  function isBrowserEnvironment() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  function bindInput(input) {
    function setFlag(code, value) {
      if (code === 'ArrowLeft') {
        input.left = value;
      } else if (code === 'ArrowRight') {
        input.right = value;
      } else if (code === 'Space') {
        input.fire = value;
      }
    }

    window.addEventListener('keydown', function (e) {
      setFlag(e.code, true);
    });
    window.addEventListener('keyup', function (e) {
      setFlag(e.code, false);
    });
  }

  function boot() {
    if (!isBrowserEnvironment()) {
      return; // non-browser load (e.g. bare Node vm smoke check) — no-op
    }

    window.SI.Game.init();
    // Live reference (ADR-003): same object every frame, never reassigned.
    window.gameState = window.SI.Game.state;

    bindInput(window.SI.Game.input);

    window.SI.Loop.start();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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

+++ src/audio.js
// SI.Audio — WebAudio SFX synthesis (ADR-001: renderer/audio are the only
// modules allowed to touch browser APIs — here, AudioContext). Strategy:
// lazily construct ONE AudioContext on first sound (never at module-load
// time, so loading the bundle headless/in Node never touches AudioContext
// at all), then synthesize each effect as a short oscillator + gain-
// envelope burst. Every public method is wrapped so a missing, failed, or
// suspended AudioContext never throws into game logic — per conventions.md
// "console.error, don't crash" fallback.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var initTried = false;

  // Lazily creates (once) and returns the shared AudioContext, or null if
  // unavailable/failed. Only ever attempts construction once per page load
  // — a failed environment (headless browser with no AudioContext, or a
  // browser that throws on construction) doesn't retry and doesn't spam
  // console.error on every subsequent sound call.
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (initTried) {
      return null;
    }
    initTried = true;
    try {
      var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) {
        return null;
      }
      ctx = new AC();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — the shared synthesis primitive: an oscillator through a
  // gain node that exponentially decays to (near-)silence, i.e. a simple
  // percussive envelope. Guarded so any failure (suspended context,
  // disallowed autoplay, an oscillator that refuses to start) is caught
  // and swallowed rather than propagated.
  function playTone(freq, duration, type, peakGain) {
    try {
      var c = getContext();
      if (!c) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        // Best-effort resume (user-gesture-gated in some browsers); never
        // block or throw on the returned promise rejecting.
        var resumed = c.resume();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(function () {});
        }
      }

      var osc = c.createOscillator();
      var gain = c.createGain();
      var now = c.currentTime;

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(peakGain || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Never let a sound-effect failure interrupt gameplay.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.09, 'square', 0.15);
  }

  function playExplosion() {
    playTone(110, 0.3, 'sawtooth', 0.25);
  }

  function playHit() {
    playTone(220, 0.15, 'triangle', 0.2);
  }

  function playUfo() {
    playTone(440, 0.2, 'sine', 0.15);
  }

  function playGameover() {
    playTone(80, 0.6, 'sawtooth', 0.25);
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playHit: playHit,
    playUfo: playUfo,
    playGameover: playGameover,
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
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
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns the
// rolling-median fps sample (slice-06, P5), computed from raw rAF timing
// and written into gameState.fps for observability only.
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06, P5) — informational only, per ADR-002:
  // computed here from the RAW, uncapped rAF frame delta (never the
  // spiral-of-death-capped delta used for the accumulator below), written
  // into gameState.fps for observability, and never read back into
  // update() timing. Fixed-size ring buffer of recent instantaneous fps
  // samples; median (not mean) so one stalled frame can't swing the
  // reported number the way an outlier would in a mean.
  var FPS_WINDOW = 30;
  var fpsSamples = [];
  var fpsIndex = 0;

  function recordFps(rawDelta) {
    if (rawDelta <= 0) {
      return; // skip non-positive deltas — avoids Infinity/NaN samples
    }
    var instantaneous = 1000 / rawDelta;
    if (fpsSamples.length < FPS_WINDOW) {
      fpsSamples.push(instantaneous);
    } else {
      fpsSamples[fpsIndex] = instantaneous;
      fpsIndex = (fpsIndex + 1) % FPS_WINDOW;
    }
  }

  function medianFps() {
    if (fpsSamples.length === 0) {
      return 0;
    }
    var sorted = fpsSamples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;
    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Capping happens on a COPY of
    // the delta so the fps sample above always reflects real frame timing.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    var state = window.SI.Game.state;
    if (state) {
      state.fps = medianFps();
    }

    window.SI.Renderer.draw(state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsIndex = 0;
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

+++ src/main.js
// main.js — bootstrap: canvas/audio-context setup (lazy, see audio.js),
// window.gameState wiring (ADR-003 live reference), keyboard input, and
// SI.Loop.start(). Last file in concatenation order (conventions.md).
//
// Browser guard: the bundle must also load cleanly in a bare Node vm (the
// mutation-testing smoke check runs it with `window` aliased to the
// global object but no `document`/`requestAnimationFrame`). In that
// environment every module above this one still defines its SI.* object
// (SI.Renderer, SI.Audio, etc. exist), but boot() below must NO-OP instead
// of throwing on a missing DOM/rAF.
(function () {
  function isBrowserEnvironment() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  function bindInput(input) {
    function setFlag(code, value) {
      if (code === 'ArrowLeft') {
        input.left = value;
      } else if (code === 'ArrowRight') {
        input.right = value;
      } else if (code === 'Space') {
        input.fire = value;
      }
    }

    window.addEventListener('keydown', function (e) {
      setFlag(e.code, true);
    });
    window.addEventListener('keyup', function (e) {
      setFlag(e.code, false);
    });
  }

  function boot() {
    if (!isBrowserEnvironment()) {
      return; // non-browser load (e.g. bare Node vm smoke check) — no-op
    }

    window.SI.Game.init();
    // Live reference (ADR-003): same object every frame, never reassigned.
    window.gameState = window.SI.Game.state;

    bindInput(window.SI.Game.input);

    window.SI.Loop.start();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
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

+++ src/renderer.js
// SI.Renderer — canvas drawing only (ADR-001/conventions: reads state,
// never mutates it). Strategy: plain fillRect/fillText, no sprites/images,
// kept deliberately light so P5 (median_fps >= 50) has headroom. The whole
// body is wrapped in try/catch so a draw() call can never throw into the
// rAF loop, no matter what shape `state` is in.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var canvas = null;
  var ctx = null;

  // Looked up lazily (not at module-load time) so this file works whether
  // or not a <canvas id="game"> exists yet, and no-ops cleanly in
  // non-browser environments (no `document`).
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function drawRect(c, entity, color) {
    if (!entity) {
      return;
    }
    c.fillStyle = color;
    c.fillRect(entity.x, entity.y, entity.width, entity.height);
  }

  // draw — read-only w.r.t. `state`; never mutates any field. Clears the
  // canvas, then draws player, aliens, bullets, shields, ufo, and a small
  // score/lives/wave HUD text. Guarded end-to-end: a missing canvas,
  // missing state, or malformed entity just results in a partial/no-op
  // frame, never an exception.
  function draw(state) {
    try {
      var c = getContext();
      if (!c || !state) {
        return;
      }

      var w = c.canvas.width;
      var h = c.canvas.height;

      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);

      drawRect(c, state.player, '#4caf50');

      var aliens = state.aliens || [];
      c.fillStyle = '#ffffff';
      for (var i = 0; i < aliens.length; i++) {
        var alien = aliens[i];
        if (alien && alien.alive === false) {
          continue;
        }
        drawRect(c, alien, '#ffffff');
      }

      var playerBullets = state.playerBullets || [];
      for (var j = 0; j < playerBullets.length; j++) {
        drawRect(c, playerBullets[j], '#00e5ff');
      }

      var alienBullets = state.alienBullets || [];
      for (var k = 0; k < alienBullets.length; k++) {
        drawRect(c, alienBullets[k], '#ff5252');
      }

      var shields = state.shields || [];
      var Shield = window.SI && window.SI.Shield;
      for (var s = 0; s < shields.length; s++) {
        var shield = shields[s];
        var cells = (shield && shield.cells) || [];
        for (var ci = 0; ci < cells.length; ci++) {
          if (!(cells[ci] > 0)) {
            continue;
          }
          var rect = Shield && Shield.cellRect ? Shield.cellRect(shield, ci) : null;
          if (rect) {
            drawRect(c, rect, '#8bc34a');
          }
        }
      }

      if (state.ufo && state.ufo.active) {
        drawRect(c, state.ufo, '#e040fb');
      }

      c.fillStyle = '#ffffff';
      c.font = '16px monospace';
      c.textBaseline = 'top';
      c.fillText('Score: ' + state.score, 10, 8);
      c.fillText('Lives: ' + state.lives, 10, 28);
      c.fillText('Wave: ' + state.wave, 10, 48);
    } catch (e) {
      // ponytail: swallow — a render glitch must never crash the game
      // loop; console.error keeps it visible without throwing.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

+++ src/ufo.js
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
```

## specimen-B
- **culled because:** gate testPassRate=1.00

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html. Node builtins only (ADR-004).
// Idempotent: re-running with unchanged src/ produces byte-identical
// output (pure read -> string-join -> write, no timestamps/randomness).
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order: rng -> collision -> config -> loop -> player -> bullet
// -> alien -> shield -> ufo -> game (unchanged from slice-05), then the
// slice-06 additions: renderer.js and audio.js (only depend on
// DOM/Canvas/WebAudio + SI.Config/SI.Shield, safe to load any time after
// those), and main.js LAST (browser bootstrap — needs every other module,
// including SI.Loop/SI.Renderer/SI.Audio, already defined).
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
  'renderer.js',
  'audio.js',
  'main.js',
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns
// gameState.fps: a rolling MEDIAN of recent instantaneous fps, computed
// from real requestAnimationFrame timing and written into state for
// observability only (P5) — it is never read by update(), so render-rate
// jitter can never change game outcomes.
//
// Strategy: sorted sliding window. Instantaneous fps samples are kept in
// two parallel structures — `fpsSamples` (insertion order, for O(1)
// eviction of the oldest sample) and `fpsSorted` (binary-search-maintained
// ascending order, for O(log n) median lookup without re-sorting every
// frame). Window size is small (32 samples) so the O(n) splice on
// insert/evict is cheap relative to render/update work.
//
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  var FPS_WINDOW_SIZE = 32;
  var fpsSamples = []; // insertion order, oldest first
  var fpsSorted = []; // same values, kept ascending

  // sortedInsert/sortedRemove — binary-search the ascending `fpsSorted`
  // array for the insertion/removal point. splice() itself is O(n), but n
  // is capped at FPS_WINDOW_SIZE (32), so this stays cheap every frame.
  function sortedInsert(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    fpsSorted.splice(lo, 0, value);
  }

  function sortedRemove(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (fpsSorted[lo] === value) {
      fpsSorted.splice(lo, 1);
    }
  }

  // recordFps — pushes one instantaneous fps sample into the sliding
  // window, evicts the oldest sample once the window is full, and returns
  // the current median (null if the window is somehow empty).
  function recordFps(instantFps) {
    fpsSamples.push(instantFps);
    sortedInsert(instantFps);

    if (fpsSamples.length > FPS_WINDOW_SIZE) {
      var oldest = fpsSamples.shift();
      sortedRemove(oldest);
    }

    var n = fpsSorted.length;
    if (n === 0) {
      return null;
    }
    var mid = n >> 1;
    if (n % 2 === 1) {
      return fpsSorted[mid];
    }
    return (fpsSorted[mid - 1] + fpsSorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    // Uncapped raw delta drives the fps sample; skip non-positive deltas
    // (first frame, or a duplicate/out-of-order rAF timestamp) rather than
    // feeding a divide-by-zero or negative fps into the window.
    var rawDelta = now - lastTime;
    lastTime = now;

    if (rawDelta > 0) {
      var instantFps = 1000 / rawDelta;
      var median = recordFps(instantFps);
      if (median !== null && window.SI.Game.state) {
        window.SI.Game.state.fps = median;
      }
    }

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. This cap is separate from the
    // uncapped fps sample above (ADR-002: fps sampling must never perturb
    // update() timing, and vice versa).
    var delta = rawDelta < 0 ? 0 : rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsSorted = [];
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/renderer.js ----
// SI.Renderer — canvas drawing only. Read-only w.r.t. state (never mutates
// it) and never throws (the whole draw() body is guarded — a bad frame is
// skipped, not fatal). Strategy: batch same-color fills. Aliens are grouped
// by row-color, shield cells by integrity-color band, bullets by kind —
// each group gets ONE beginPath()/fill() instead of one fill per rect, to
// keep draw() light even with 55 aliens + shield cells on screen.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var width = 800;
  var height = 600;

  // init — caches the 2D context + canvas size. Called by main.js at boot;
  // draw() also lazily self-inits (ensureContext) so it still works if a
  // caller forgets to call init() explicitly, as long as a #game canvas
  // exists in the document.
  function init(canvas) {
    try {
      if (!canvas || typeof canvas.getContext !== 'function') {
        return;
      }
      ctx = canvas.getContext('2d');
      width = canvas.width || width;
      height = canvas.height || height;
    } catch (e) {
      ctx = null;
    }
  }

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    try {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        return null;
      }
      var canvas = document.getElementById('game');
      if (!canvas) {
        return null;
      }
      init(canvas);
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function identityRect(entity) {
    return entity;
  }

  // fillBatch — draws every rect (as returned by getRect(item)) in `items`
  // with a single beginPath()/fill() call for `color`, instead of one
  // fill per rect. Read-only: never mutates `items` or its entries.
  function fillBatch(c, color, items, getRect) {
    if (!items || items.length === 0) {
      return;
    }
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < items.length; i++) {
      var r = getRect(items[i]);
      c.rect(r.x, r.y, r.width, r.height);
    }
    c.fill();
  }

  function alienColor(row) {
    if (row === 0) return '#ff5050';
    if (row <= 2) return '#50ff9c';
    return '#50c8ff';
  }

  function shieldColor(integrity, maxIntegrity) {
    if (integrity <= 0) {
      return null; // destroyed cell — nothing to draw
    }
    var ratio = integrity / maxIntegrity;
    if (ratio > 0.66) return '#33cc66';
    if (ratio > 0.33) return '#cccc33';
    return '#cc6633';
  }

  // groupByColor — buckets `items` into { color: [item, ...] } using
  // colorFn(item), preserving first-seen color order (so fill order is
  // stable, not that it matters visually). Skips items where colorFn
  // returns null/undefined (nothing to draw for that item).
  function groupByColor(items, colorFn) {
    var groups = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var color = colorFn(items[i]);
      if (!color) {
        continue;
      }
      if (!groups[color]) {
        groups[color] = [];
        order.push(color);
      }
      groups[color].push(items[i]);
    }
    return { order: order, groups: groups };
  }

  function drawAliens(c, aliens) {
    var alive = [];
    for (var i = 0; i < aliens.length; i++) {
      if (aliens[i].alive !== false) {
        alive.push(aliens[i]);
      }
    }
    var batched = groupByColor(alive, function (a) {
      return alienColor(a.row);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawShields(c, shields) {
    var cfg = window.SI.Config;
    var maxIntegrity = (cfg && cfg.SHIELD_CELL_INTEGRITY) || 4;
    var rects = [];
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      for (var ci = 0; ci < shield.cells.length; ci++) {
        var integrity = shield.cells[ci];
        var rect = window.SI.Shield.cellRect(shield, ci);
        rect.integrity = integrity; // local copy only, not the real cell
        rects.push(rect);
      }
    }
    var batched = groupByColor(rects, function (r) {
      return shieldColor(r.integrity, maxIntegrity);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawHud(c, state) {
    c.fillStyle = '#ffffff';
    c.font = '14px monospace';
    c.textBaseline = 'top';
    c.fillText('SCORE ' + state.score, 8, 8);
    c.fillText('LIVES ' + state.lives, 150, 8);
    c.fillText('WAVE ' + state.wave, 250, 8);
    c.fillText('FPS ' + Math.round(state.fps || 0), 340, 8);
    if (state.state && state.state !== 'playing') {
      c.fillText(String(state.state).toUpperCase(), 430, 8);
    }
  }

  // draw — the contract entrypoint: SI.Renderer.draw(state). Never throws;
  // never mutates state. If there's no usable 2D context (headless Node,
  // missing canvas), it's a silent no-op.
  function draw(state) {
    try {
      var c = ensureContext();
      if (!c || !state) {
        return;
      }

      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);

      if (state.shields) {
        drawShields(c, state.shields);
      }
      if (state.aliens) {
        drawAliens(c, state.aliens);
      }

      if (state.player) {
        c.fillStyle = '#ffffff';
        c.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      }

      if (state.playerBullets && state.playerBullets.length) {
        fillBatch(c, '#ffffff', state.playerBullets, identityRect);
      }
      if (state.alienBullets && state.alienBullets.length) {
        fillBatch(c, '#ff3333', state.alienBullets, identityRect);
      }

      if (state.ufo && state.ufo.active) {
        c.fillStyle = '#ff00ff';
        c.fillRect(state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height);
      }

      drawHud(c, state);
    } catch (e) {
      // Renderer must never throw (contract) — swallow, skip this frame.
    }
  }

  window.SI.Renderer = {
    init: init,
    draw: draw,
  };
})();

// ---- src/audio.js ----
// SI.Audio — synthesized WebAudio SFX. Lazily creates ONE AudioContext on
// first use (never at module-load time, so this file is safe to load in a
// headless/DOM-less Node vm). Every public method is guarded top-to-bottom
// so a headless browser, a suspended AudioContext, or a browser with no
// AudioContext at all never throws — construction failure logs via
// console.error and every call after that is a silent no-op (per
// conventions.md: fail loudly to the console, but the game keeps running
// without sound).
//
// Reuses a small fixed pool of continuously-running oscillator+gain
// "voices" instead of creating/discarding an OscillatorNode per sound (a
// real OscillatorNode can only be started once, ever) — each play() call
// grabs the next voice round-robin and re-envelopes its gain/frequency, so
// steady-state SFX spam allocates zero new audio nodes.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var VOICE_COUNT = 4;
  var ctx = null;
  var voices = null; // [{osc, gain}, ...]
  var nextVoiceIndex = 0;
  var constructionFailed = false;

  function logError(message, err) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(message, err);
    }
  }

  function getContext() {
    if (ctx || constructionFailed) {
      return ctx;
    }
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        constructionFailed = true;
        return null;
      }
      ctx = new Ctor();
      buildVoicePool();
      return ctx;
    } catch (e) {
      logError('SI.Audio: AudioContext construction failed, continuing without sound', e);
      constructionFailed = true;
      ctx = null;
      return null;
    }
  }

  function buildVoicePool() {
    voices = [];
    for (var i = 0; i < VOICE_COUNT; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0;
      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      voices.push({ osc: osc, gain: gain });
    }
  }

  function nextVoice() {
    var voice = voices[nextVoiceIndex];
    nextVoiceIndex = (nextVoiceIndex + 1) % voices.length;
    return voice;
  }

  // play — envelopes one pooled voice: near-instant attack, short
  // exponential-ish decay. Guarded end-to-end; any failure (suspended
  // context, unsupported ramp, whatever) is swallowed — audio is
  // best-effort and must never break gameplay.
  function play(freq, duration, type) {
    try {
      var c = getContext();
      if (!c || !voices || !voices.length) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
      var voice = nextVoice();
      var now = c.currentTime;
      voice.osc.type = type || 'square';
      voice.osc.frequency.setValueAtTime(freq, now);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0.0001, now);
      voice.gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(duration, 0.02));
    } catch (e) {
      // Best-effort SFX — never let audio break gameplay.
    }
  }

  function shoot() {
    play(880, 0.08, 'square');
  }

  function alienHit() {
    play(220, 0.12, 'square');
  }

  function explosion() {
    play(110, 0.3, 'sawtooth');
  }

  function ufoHit() {
    play(660, 0.25, 'triangle');
  }

  function gameOver() {
    play(90, 0.6, 'sawtooth');
  }

  window.SI.Audio = {
    shoot: shoot,
    alienHit: alienHit,
    explosion: explosion,
    ufoHit: ufoHit,
    gameOver: gameOver,
  };
})();

// ---- src/main.js ----
// SI main.js — browser bootstrap. Wires the canvas + WebAudio context,
// keyboard input -> SI.Game.input intent flags, window.gameState (live
// reference, per ADR-003), and starts SI.Loop. Runs immediately on script
// execution (this script is placed after the <canvas> element in
// dist/index.html, so the canvas already exists in the DOM by the time
// this runs — "on load of dist/index.html the game auto-boots").
//
// No-ops gracefully in a bare Node vm (window === globalThis, no
// document/requestAnimationFrame) while SI.Renderer and SI.Audio stay fully
// defined regardless of environment — only the act of booting is skipped.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var KEY_TO_INPUT = {
    ArrowLeft: 'left',
    Left: 'left', // older browsers report the non-numpad legacy key name
    ArrowRight: 'right',
    Right: 'right',
    Space: 'fire',
    ' ': 'fire', // some browsers report the space character as `key`
  };

  function canRunInBrowser() {
    return (
      typeof document !== 'undefined' &&
      typeof document.getElementById === 'function' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  // wireInput — keydown/keyup set intent flags on SI.Game.input only;
  // SI.Game.update() is the only place those flags turn into state changes
  // (per conventions.md's state-machine rule). P (pause) and Enter
  // (start/restart) are recorded as flags too so a future SI.Game.update()
  // can read them; unread flags are harmless extra fields on a plain object.
  function wireInput() {
    var input = window.SI.Game.input;

    document.addEventListener('keydown', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = true;
        if (prop === 'fire') {
          window.SI.Audio.shoot();
        }
      }
      if (e.code === 'KeyP') {
        input.pause = true;
      }
      if (e.code === 'Enter') {
        input.start = true;
      }
    });

    document.addEventListener('keyup', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = false;
      }
      if (e.code === 'KeyP') {
        input.pause = false;
      }
      if (e.code === 'Enter') {
        input.start = false;
      }
    });
  }

  function boot() {
    var canvas = document.getElementById('game');
    var width = (canvas && canvas.width) || 800;
    var height = (canvas && canvas.height) || 600;

    // ADR-003: a fixed default seed keeps determinism unless overridden;
    // production browser play seeds from Date.now() (still fully
    // overridable by anything that calls SI.Game.init()/SI.RNG.seed()
    // again afterward, e.g. a test harness).
    window.SI.Game.init({ width: width, height: height, seed: Date.now() });

    // Live reference, not a copy — set once, mutated in place by update().
    window.gameState = window.SI.Game.state;

    if (canvas) {
      window.SI.Renderer.init(canvas);
    }

    wireInput();
    window.SI.Loop.start();
  }

  if (canRunInBrowser()) {
    boot();
  }
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns
// gameState.fps: a rolling MEDIAN of recent instantaneous fps, computed
// from real requestAnimationFrame timing and written into state for
// observability only (P5) — it is never read by update(), so render-rate
// jitter can never change game outcomes.
//
// Strategy: sorted sliding window. Instantaneous fps samples are kept in
// two parallel structures — `fpsSamples` (insertion order, for O(1)
// eviction of the oldest sample) and `fpsSorted` (binary-search-maintained
// ascending order, for O(log n) median lookup without re-sorting every
// frame). Window size is small (32 samples) so the O(n) splice on
// insert/evict is cheap relative to render/update work.
//
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  var FPS_WINDOW_SIZE = 32;
  var fpsSamples = []; // insertion order, oldest first
  var fpsSorted = []; // same values, kept ascending

  // sortedInsert/sortedRemove — binary-search the ascending `fpsSorted`
  // array for the insertion/removal point. splice() itself is O(n), but n
  // is capped at FPS_WINDOW_SIZE (32), so this stays cheap every frame.
  function sortedInsert(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    fpsSorted.splice(lo, 0, value);
  }

  function sortedRemove(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (fpsSorted[lo] === value) {
      fpsSorted.splice(lo, 1);
    }
  }

  // recordFps — pushes one instantaneous fps sample into the sliding
  // window, evicts the oldest sample once the window is full, and returns
  // the current median (null if the window is somehow empty).
  function recordFps(instantFps) {
    fpsSamples.push(instantFps);
    sortedInsert(instantFps);

    if (fpsSamples.length > FPS_WINDOW_SIZE) {
      var oldest = fpsSamples.shift();
      sortedRemove(oldest);
    }

    var n = fpsSorted.length;
    if (n === 0) {
      return null;
    }
    var mid = n >> 1;
    if (n % 2 === 1) {
      return fpsSorted[mid];
    }
    return (fpsSorted[mid - 1] + fpsSorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    // Uncapped raw delta drives the fps sample; skip non-positive deltas
    // (first frame, or a duplicate/out-of-order rAF timestamp) rather than
    // feeding a divide-by-zero or negative fps into the window.
    var rawDelta = now - lastTime;
    lastTime = now;

    if (rawDelta > 0) {
      var instantFps = 1000 / rawDelta;
      var median = recordFps(instantFps);
      if (median !== null && window.SI.Game.state) {
        window.SI.Game.state.fps = median;
      }
    }

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. This cap is separate from the
    // uncapped fps sample above (ADR-002: fps sampling must never perturb
    // update() timing, and vice versa).
    var delta = rawDelta < 0 ? 0 : rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsSorted = [];
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/renderer.js ----
// SI.Renderer — canvas drawing only. Read-only w.r.t. state (never mutates
// it) and never throws (the whole draw() body is guarded — a bad frame is
// skipped, not fatal). Strategy: batch same-color fills. Aliens are grouped
// by row-color, shield cells by integrity-color band, bullets by kind —
// each group gets ONE beginPath()/fill() instead of one fill per rect, to
// keep draw() light even with 55 aliens + shield cells on screen.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var width = 800;
  var height = 600;

  // init — caches the 2D context + canvas size. Called by main.js at boot;
  // draw() also lazily self-inits (ensureContext) so it still works if a
  // caller forgets to call init() explicitly, as long as a #game canvas
  // exists in the document.
  function init(canvas) {
    try {
      if (!canvas || typeof canvas.getContext !== 'function') {
        return;
      }
      ctx = canvas.getContext('2d');
      width = canvas.width || width;
      height = canvas.height || height;
    } catch (e) {
      ctx = null;
    }
  }

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    try {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        return null;
      }
      var canvas = document.getElementById('game');
      if (!canvas) {
        return null;
      }
      init(canvas);
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function identityRect(entity) {
    return entity;
  }

  // fillBatch — draws every rect (as returned by getRect(item)) in `items`
  // with a single beginPath()/fill() call for `color`, instead of one
  // fill per rect. Read-only: never mutates `items` or its entries.
  function fillBatch(c, color, items, getRect) {
    if (!items || items.length === 0) {
      return;
    }
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < items.length; i++) {
      var r = getRect(items[i]);
      c.rect(r.x, r.y, r.width, r.height);
    }
    c.fill();
  }

  function alienColor(row) {
    if (row === 0) return '#ff5050';
    if (row <= 2) return '#50ff9c';
    return '#50c8ff';
  }

  function shieldColor(integrity, maxIntegrity) {
    if (integrity <= 0) {
      return null; // destroyed cell — nothing to draw
    }
    var ratio = integrity / maxIntegrity;
    if (ratio > 0.66) return '#33cc66';
    if (ratio > 0.33) return '#cccc33';
    return '#cc6633';
  }

  // groupByColor — buckets `items` into { color: [item, ...] } using
  // colorFn(item), preserving first-seen color order (so fill order is
  // stable, not that it matters visually). Skips items where colorFn
  // returns null/undefined (nothing to draw for that item).
  function groupByColor(items, colorFn) {
    var groups = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var color = colorFn(items[i]);
      if (!color) {
        continue;
      }
      if (!groups[color]) {
        groups[color] = [];
        order.push(color);
      }
      groups[color].push(items[i]);
    }
    return { order: order, groups: groups };
  }

  function drawAliens(c, aliens) {
    var alive = [];
    for (var i = 0; i < aliens.length; i++) {
      if (aliens[i].alive !== false) {
        alive.push(aliens[i]);
      }
    }
    var batched = groupByColor(alive, function (a) {
      return alienColor(a.row);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawShields(c, shields) {
    var cfg = window.SI.Config;
    var maxIntegrity = (cfg && cfg.SHIELD_CELL_INTEGRITY) || 4;
    var rects = [];
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      for (var ci = 0; ci < shield.cells.length; ci++) {
        var integrity = shield.cells[ci];
        var rect = window.SI.Shield.cellRect(shield, ci);
        rect.integrity = integrity; // local copy only, not the real cell
        rects.push(rect);
      }
    }
    var batched = groupByColor(rects, function (r) {
      return shieldColor(r.integrity, maxIntegrity);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawHud(c, state) {
    c.fillStyle = '#ffffff';
    c.font = '14px monospace';
    c.textBaseline = 'top';
    c.fillText('SCORE ' + state.score, 8, 8);
    c.fillText('LIVES ' + state.lives, 150, 8);
    c.fillText('WAVE ' + state.wave, 250, 8);
    c.fillText('FPS ' + Math.round(state.fps || 0), 340, 8);
    if (state.state && state.state !== 'playing') {
      c.fillText(String(state.state).toUpperCase(), 430, 8);
    }
  }

  // draw — the contract entrypoint: SI.Renderer.draw(state). Never throws;
  // never mutates state. If there's no usable 2D context (headless Node,
  // missing canvas), it's a silent no-op.
  function draw(state) {
    try {
      var c = ensureContext();
      if (!c || !state) {
        return;
      }

      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);

      if (state.shields) {
        drawShields(c, state.shields);
      }
      if (state.aliens) {
        drawAliens(c, state.aliens);
      }

      if (state.player) {
        c.fillStyle = '#ffffff';
        c.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      }

      if (state.playerBullets && state.playerBullets.length) {
        fillBatch(c, '#ffffff', state.playerBullets, identityRect);
      }
      if (state.alienBullets && state.alienBullets.length) {
        fillBatch(c, '#ff3333', state.alienBullets, identityRect);
      }

      if (state.ufo && state.ufo.active) {
        c.fillStyle = '#ff00ff';
        c.fillRect(state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height);
      }

      drawHud(c, state);
    } catch (e) {
      // Renderer must never throw (contract) — swallow, skip this frame.
    }
  }

  window.SI.Renderer = {
    init: init,
    draw: draw,
  };
})();

// ---- src/audio.js ----
// SI.Audio — synthesized WebAudio SFX. Lazily creates ONE AudioContext on
// first use (never at module-load time, so this file is safe to load in a
// headless/DOM-less Node vm). Every public method is guarded top-to-bottom
// so a headless browser, a suspended AudioContext, or a browser with no
// AudioContext at all never throws — construction failure logs via
// console.error and every call after that is a silent no-op (per
// conventions.md: fail loudly to the console, but the game keeps running
// without sound).
//
// Reuses a small fixed pool of continuously-running oscillator+gain
// "voices" instead of creating/discarding an OscillatorNode per sound (a
// real OscillatorNode can only be started once, ever) — each play() call
// grabs the next voice round-robin and re-envelopes its gain/frequency, so
// steady-state SFX spam allocates zero new audio nodes.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var VOICE_COUNT = 4;
  var ctx = null;
  var voices = null; // [{osc, gain}, ...]
  var nextVoiceIndex = 0;
  var constructionFailed = false;

  function logError(message, err) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(message, err);
    }
  }

  function getContext() {
    if (ctx || constructionFailed) {
      return ctx;
    }
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        constructionFailed = true;
        return null;
      }
      ctx = new Ctor();
      buildVoicePool();
      return ctx;
    } catch (e) {
      logError('SI.Audio: AudioContext construction failed, continuing without sound', e);
      constructionFailed = true;
      ctx = null;
      return null;
    }
  }

  function buildVoicePool() {
    voices = [];
    for (var i = 0; i < VOICE_COUNT; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0;
      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      voices.push({ osc: osc, gain: gain });
    }
  }

  function nextVoice() {
    var voice = voices[nextVoiceIndex];
    nextVoiceIndex = (nextVoiceIndex + 1) % voices.length;
    return voice;
  }

  // play — envelopes one pooled voice: near-instant attack, short
  // exponential-ish decay. Guarded end-to-end; any failure (suspended
  // context, unsupported ramp, whatever) is swallowed — audio is
  // best-effort and must never break gameplay.
  function play(freq, duration, type) {
    try {
      var c = getContext();
      if (!c || !voices || !voices.length) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
      var voice = nextVoice();
      var now = c.currentTime;
      voice.osc.type = type || 'square';
      voice.osc.frequency.setValueAtTime(freq, now);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0.0001, now);
      voice.gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(duration, 0.02));
    } catch (e) {
      // Best-effort SFX — never let audio break gameplay.
    }
  }

  function shoot() {
    play(880, 0.08, 'square');
  }

  function alienHit() {
    play(220, 0.12, 'square');
  }

  function explosion() {
    play(110, 0.3, 'sawtooth');
  }

  function ufoHit() {
    play(660, 0.25, 'triangle');
  }

  function gameOver() {
    play(90, 0.6, 'sawtooth');
  }

  window.SI.Audio = {
    shoot: shoot,
    alienHit: alienHit,
    explosion: explosion,
    ufoHit: ufoHit,
    gameOver: gameOver,
  };
})();

// ---- src/main.js ----
// SI main.js — browser bootstrap. Wires the canvas + WebAudio context,
// keyboard input -> SI.Game.input intent flags, window.gameState (live
// reference, per ADR-003), and starts SI.Loop. Runs immediately on script
// execution (this script is placed after the <canvas> element in
// dist/index.html, so the canvas already exists in the DOM by the time
// this runs — "on load of dist/index.html the game auto-boots").
//
// No-ops gracefully in a bare Node vm (window === globalThis, no
// document/requestAnimationFrame) while SI.Renderer and SI.Audio stay fully
// defined regardless of environment — only the act of booting is skipped.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var KEY_TO_INPUT = {
    ArrowLeft: 'left',
    Left: 'left', // older browsers report the non-numpad legacy key name
    ArrowRight: 'right',
    Right: 'right',
    Space: 'fire',
    ' ': 'fire', // some browsers report the space character as `key`
  };

  function canRunInBrowser() {
    return (
      typeof document !== 'undefined' &&
      typeof document.getElementById === 'function' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  // wireInput — keydown/keyup set intent flags on SI.Game.input only;
  // SI.Game.update() is the only place those flags turn into state changes
  // (per conventions.md's state-machine rule). P (pause) and Enter
  // (start/restart) are recorded as flags too so a future SI.Game.update()
  // can read them; unread flags are harmless extra fields on a plain object.
  function wireInput() {
    var input = window.SI.Game.input;

    document.addEventListener('keydown', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = true;
        if (prop === 'fire') {
          window.SI.Audio.shoot();
        }
      }
      if (e.code === 'KeyP') {
        input.pause = true;
      }
      if (e.code === 'Enter') {
        input.start = true;
      }
    });

    document.addEventListener('keyup', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = false;
      }
      if (e.code === 'KeyP') {
        input.pause = false;
      }
      if (e.code === 'Enter') {
        input.start = false;
      }
    });
  }

  function boot() {
    var canvas = document.getElementById('game');
    var width = (canvas && canvas.width) || 800;
    var height = (canvas && canvas.height) || 600;

    // ADR-003: a fixed default seed keeps determinism unless overridden;
    // production browser play seeds from Date.now() (still fully
    // overridable by anything that calls SI.Game.init()/SI.RNG.seed()
    // again afterward, e.g. a test harness).
    window.SI.Game.init({ width: width, height: height, seed: Date.now() });

    // Live reference, not a copy — set once, mutated in place by update().
    window.gameState = window.SI.Game.state;

    if (canvas) {
      window.SI.Renderer.init(canvas);
    }

    wireInput();
    window.SI.Loop.start();
  }

  if (canRunInBrowser()) {
    boot();
  }
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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

+++ src/audio.js
// SI.Audio — synthesized WebAudio SFX. Lazily creates ONE AudioContext on
// first use (never at module-load time, so this file is safe to load in a
// headless/DOM-less Node vm). Every public method is guarded top-to-bottom
// so a headless browser, a suspended AudioContext, or a browser with no
// AudioContext at all never throws — construction failure logs via
// console.error and every call after that is a silent no-op (per
// conventions.md: fail loudly to the console, but the game keeps running
// without sound).
//
// Reuses a small fixed pool of continuously-running oscillator+gain
// "voices" instead of creating/discarding an OscillatorNode per sound (a
// real OscillatorNode can only be started once, ever) — each play() call
// grabs the next voice round-robin and re-envelopes its gain/frequency, so
// steady-state SFX spam allocates zero new audio nodes.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var VOICE_COUNT = 4;
  var ctx = null;
  var voices = null; // [{osc, gain}, ...]
  var nextVoiceIndex = 0;
  var constructionFailed = false;

  function logError(message, err) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(message, err);
    }
  }

  function getContext() {
    if (ctx || constructionFailed) {
      return ctx;
    }
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        constructionFailed = true;
        return null;
      }
      ctx = new Ctor();
      buildVoicePool();
      return ctx;
    } catch (e) {
      logError('SI.Audio: AudioContext construction failed, continuing without sound', e);
      constructionFailed = true;
      ctx = null;
      return null;
    }
  }

  function buildVoicePool() {
    voices = [];
    for (var i = 0; i < VOICE_COUNT; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0;
      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      voices.push({ osc: osc, gain: gain });
    }
  }

  function nextVoice() {
    var voice = voices[nextVoiceIndex];
    nextVoiceIndex = (nextVoiceIndex + 1) % voices.length;
    return voice;
  }

  // play — envelopes one pooled voice: near-instant attack, short
  // exponential-ish decay. Guarded end-to-end; any failure (suspended
  // context, unsupported ramp, whatever) is swallowed — audio is
  // best-effort and must never break gameplay.
  function play(freq, duration, type) {
    try {
      var c = getContext();
      if (!c || !voices || !voices.length) {
        return;
      }
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
      var voice = nextVoice();
      var now = c.currentTime;
      voice.osc.type = type || 'square';
      voice.osc.frequency.setValueAtTime(freq, now);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0.0001, now);
      voice.gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(duration, 0.02));
    } catch (e) {
      // Best-effort SFX — never let audio break gameplay.
    }
  }

  function shoot() {
    play(880, 0.08, 'square');
  }

  function alienHit() {
    play(220, 0.12, 'square');
  }

  function explosion() {
    play(110, 0.3, 'sawtooth');
  }

  function ufoHit() {
    play(660, 0.25, 'triangle');
  }

  function gameOver() {
    play(90, 0.6, 'sawtooth');
  }

  window.SI.Audio = {
    shoot: shoot,
    alienHit: alienHit,
    explosion: explosion,
    ufoHit: ufoHit,
    gameOver: gameOver,
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
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
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns
// gameState.fps: a rolling MEDIAN of recent instantaneous fps, computed
// from real requestAnimationFrame timing and written into state for
// observability only (P5) — it is never read by update(), so render-rate
// jitter can never change game outcomes.
//
// Strategy: sorted sliding window. Instantaneous fps samples are kept in
// two parallel structures — `fpsSamples` (insertion order, for O(1)
// eviction of the oldest sample) and `fpsSorted` (binary-search-maintained
// ascending order, for O(log n) median lookup without re-sorting every
// frame). Window size is small (32 samples) so the O(n) splice on
// insert/evict is cheap relative to render/update work.
//
// Depends on SI.Game.update(dt) and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  var FPS_WINDOW_SIZE = 32;
  var fpsSamples = []; // insertion order, oldest first
  var fpsSorted = []; // same values, kept ascending

  // sortedInsert/sortedRemove — binary-search the ascending `fpsSorted`
  // array for the insertion/removal point. splice() itself is O(n), but n
  // is capped at FPS_WINDOW_SIZE (32), so this stays cheap every frame.
  function sortedInsert(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    fpsSorted.splice(lo, 0, value);
  }

  function sortedRemove(value) {
    var lo = 0;
    var hi = fpsSorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (fpsSorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (fpsSorted[lo] === value) {
      fpsSorted.splice(lo, 1);
    }
  }

  // recordFps — pushes one instantaneous fps sample into the sliding
  // window, evicts the oldest sample once the window is full, and returns
  // the current median (null if the window is somehow empty).
  function recordFps(instantFps) {
    fpsSamples.push(instantFps);
    sortedInsert(instantFps);

    if (fpsSamples.length > FPS_WINDOW_SIZE) {
      var oldest = fpsSamples.shift();
      sortedRemove(oldest);
    }

    var n = fpsSorted.length;
    if (n === 0) {
      return null;
    }
    var mid = n >> 1;
    if (n % 2 === 1) {
      return fpsSorted[mid];
    }
    return (fpsSorted[mid - 1] + fpsSorted[mid]) / 2;
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    // Uncapped raw delta drives the fps sample; skip non-positive deltas
    // (first frame, or a duplicate/out-of-order rAF timestamp) rather than
    // feeding a divide-by-zero or negative fps into the window.
    var rawDelta = now - lastTime;
    lastTime = now;

    if (rawDelta > 0) {
      var instantFps = 1000 / rawDelta;
      var median = recordFps(instantFps);
      if (median !== null && window.SI.Game.state) {
        window.SI.Game.state.fps = median;
      }
    }

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. This cap is separate from the
    // uncapped fps sample above (ADR-002: fps sampling must never perturb
    // update() timing, and vice versa).
    var delta = rawDelta < 0 ? 0 : rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
    fpsSorted = [];
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

+++ src/main.js
// SI main.js — browser bootstrap. Wires the canvas + WebAudio context,
// keyboard input -> SI.Game.input intent flags, window.gameState (live
// reference, per ADR-003), and starts SI.Loop. Runs immediately on script
// execution (this script is placed after the <canvas> element in
// dist/index.html, so the canvas already exists in the DOM by the time
// this runs — "on load of dist/index.html the game auto-boots").
//
// No-ops gracefully in a bare Node vm (window === globalThis, no
// document/requestAnimationFrame) while SI.Renderer and SI.Audio stay fully
// defined regardless of environment — only the act of booting is skipped.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var KEY_TO_INPUT = {
    ArrowLeft: 'left',
    Left: 'left', // older browsers report the non-numpad legacy key name
    ArrowRight: 'right',
    Right: 'right',
    Space: 'fire',
    ' ': 'fire', // some browsers report the space character as `key`
  };

  function canRunInBrowser() {
    return (
      typeof document !== 'undefined' &&
      typeof document.getElementById === 'function' &&
      typeof window.requestAnimationFrame === 'function'
    );
  }

  // wireInput — keydown/keyup set intent flags on SI.Game.input only;
  // SI.Game.update() is the only place those flags turn into state changes
  // (per conventions.md's state-machine rule). P (pause) and Enter
  // (start/restart) are recorded as flags too so a future SI.Game.update()
  // can read them; unread flags are harmless extra fields on a plain object.
  function wireInput() {
    var input = window.SI.Game.input;

    document.addEventListener('keydown', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = true;
        if (prop === 'fire') {
          window.SI.Audio.shoot();
        }
      }
      if (e.code === 'KeyP') {
        input.pause = true;
      }
      if (e.code === 'Enter') {
        input.start = true;
      }
    });

    document.addEventListener('keyup', function (e) {
      var prop = KEY_TO_INPUT[e.code] || KEY_TO_INPUT[e.key];
      if (prop) {
        input[prop] = false;
      }
      if (e.code === 'KeyP') {
        input.pause = false;
      }
      if (e.code === 'Enter') {
        input.start = false;
      }
    });
  }

  function boot() {
    var canvas = document.getElementById('game');
    var width = (canvas && canvas.width) || 800;
    var height = (canvas && canvas.height) || 600;

    // ADR-003: a fixed default seed keeps determinism unless overridden;
    // production browser play seeds from Date.now() (still fully
    // overridable by anything that calls SI.Game.init()/SI.RNG.seed()
    // again afterward, e.g. a test harness).
    window.SI.Game.init({ width: width, height: height, seed: Date.now() });

    // Live reference, not a copy — set once, mutated in place by update().
    window.gameState = window.SI.Game.state;

    if (canvas) {
      window.SI.Renderer.init(canvas);
    }

    wireInput();
    window.SI.Loop.start();
  }

  if (canRunInBrowser()) {
    boot();
  }
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

+++ src/renderer.js
// SI.Renderer — canvas drawing only. Read-only w.r.t. state (never mutates
// it) and never throws (the whole draw() body is guarded — a bad frame is
// skipped, not fatal). Strategy: batch same-color fills. Aliens are grouped
// by row-color, shield cells by integrity-color band, bullets by kind —
// each group gets ONE beginPath()/fill() instead of one fill per rect, to
// keep draw() light even with 55 aliens + shield cells on screen.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var width = 800;
  var height = 600;

  // init — caches the 2D context + canvas size. Called by main.js at boot;
  // draw() also lazily self-inits (ensureContext) so it still works if a
  // caller forgets to call init() explicitly, as long as a #game canvas
  // exists in the document.
  function init(canvas) {
    try {
      if (!canvas || typeof canvas.getContext !== 'function') {
        return;
      }
      ctx = canvas.getContext('2d');
      width = canvas.width || width;
      height = canvas.height || height;
    } catch (e) {
      ctx = null;
    }
  }

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    try {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        return null;
      }
      var canvas = document.getElementById('game');
      if (!canvas) {
        return null;
      }
      init(canvas);
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function identityRect(entity) {
    return entity;
  }

  // fillBatch — draws every rect (as returned by getRect(item)) in `items`
  // with a single beginPath()/fill() call for `color`, instead of one
  // fill per rect. Read-only: never mutates `items` or its entries.
  function fillBatch(c, color, items, getRect) {
    if (!items || items.length === 0) {
      return;
    }
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < items.length; i++) {
      var r = getRect(items[i]);
      c.rect(r.x, r.y, r.width, r.height);
    }
    c.fill();
  }

  function alienColor(row) {
    if (row === 0) return '#ff5050';
    if (row <= 2) return '#50ff9c';
    return '#50c8ff';
  }

  function shieldColor(integrity, maxIntegrity) {
    if (integrity <= 0) {
      return null; // destroyed cell — nothing to draw
    }
    var ratio = integrity / maxIntegrity;
    if (ratio > 0.66) return '#33cc66';
    if (ratio > 0.33) return '#cccc33';
    return '#cc6633';
  }

  // groupByColor — buckets `items` into { color: [item, ...] } using
  // colorFn(item), preserving first-seen color order (so fill order is
  // stable, not that it matters visually). Skips items where colorFn
  // returns null/undefined (nothing to draw for that item).
  function groupByColor(items, colorFn) {
    var groups = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var color = colorFn(items[i]);
      if (!color) {
        continue;
      }
      if (!groups[color]) {
        groups[color] = [];
        order.push(color);
      }
      groups[color].push(items[i]);
    }
    return { order: order, groups: groups };
  }

  function drawAliens(c, aliens) {
    var alive = [];
    for (var i = 0; i < aliens.length; i++) {
      if (aliens[i].alive !== false) {
        alive.push(aliens[i]);
      }
    }
    var batched = groupByColor(alive, function (a) {
      return alienColor(a.row);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawShields(c, shields) {
    var cfg = window.SI.Config;
    var maxIntegrity = (cfg && cfg.SHIELD_CELL_INTEGRITY) || 4;
    var rects = [];
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      for (var ci = 0; ci < shield.cells.length; ci++) {
        var integrity = shield.cells[ci];
        var rect = window.SI.Shield.cellRect(shield, ci);
        rect.integrity = integrity; // local copy only, not the real cell
        rects.push(rect);
      }
    }
    var batched = groupByColor(rects, function (r) {
      return shieldColor(r.integrity, maxIntegrity);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawHud(c, state) {
    c.fillStyle = '#ffffff';
    c.font = '14px monospace';
    c.textBaseline = 'top';
    c.fillText('SCORE ' + state.score, 8, 8);
    c.fillText('LIVES ' + state.lives, 150, 8);
    c.fillText('WAVE ' + state.wave, 250, 8);
    c.fillText('FPS ' + Math.round(state.fps || 0), 340, 8);
    if (state.state && state.state !== 'playing') {
      c.fillText(String(state.state).toUpperCase(), 430, 8);
    }
  }

  // draw — the contract entrypoint: SI.Renderer.draw(state). Never throws;
  // never mutates state. If there's no usable 2D context (headless Node,
  // missing canvas), it's a silent no-op.
  function draw(state) {
    try {
      var c = ensureContext();
      if (!c || !state) {
        return;
      }

      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);

      if (state.shields) {
        drawShields(c, state.shields);
      }
      if (state.aliens) {
        drawAliens(c, state.aliens);
      }

      if (state.player) {
        c.fillStyle = '#ffffff';
        c.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      }

      if (state.playerBullets && state.playerBullets.length) {
        fillBatch(c, '#ffffff', state.playerBullets, identityRect);
      }
      if (state.alienBullets && state.alienBullets.length) {
        fillBatch(c, '#ff3333', state.alienBullets, identityRect);
      }

      if (state.ufo && state.ufo.active) {
        c.fillStyle = '#ff00ff';
        c.fillRect(state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height);
      }

      drawHud(c, state);
    } catch (e) {
      // Renderer must never throw (contract) — swallow, skip this frame.
    }
  }

  window.SI.Renderer = {
    init: init,
    draw: draw,
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

+++ src/ufo.js
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
```

## specimen-C
- **culled because:** gate testPassRate=1.00

```diff
+++ build.js
// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html with a real <canvas> and an
// auto-booting inline <script>. Node builtins only (ADR-004). Idempotent:
// always overwrites dist/ from the current src/, never reads dist/.
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order (conventions.md): rng -> collision -> config -> audio ->
// renderer -> entities (player/bullet/alien/shield/ufo) -> loop -> game ->
// main. main.js must load LAST (it boots on load and references every
// other SI.* namespace).
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'audio.js',
  'renderer.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'loop.js',
  'game.js',
  'main.js',
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/audio.js ----
// SI.Audio — minimal synthesized SFX via WebAudio (slice-06). Lazy
// AudioContext (created on first use, not at module load, since some
// browsers require a user gesture before audio can start) and every public
// method is guarded so a headless/suspended/absent AudioContext never
// throws — per conventions.md's "fail loudly in dev, but SI.Audio
// console.error-and-continues if AudioContext init fails so the game still
// runs without sound". No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var triedInit = false;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (triedInit) {
      return null; // already failed once this session, don't retry every call
    }
    triedInit = true;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return null; // no WebAudio support at all (older/headless browser)
      }
      ctx = new Ctor();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — one envelope helper (oscillator -> gain, linear attack then
  // exponential-ish decay via linear ramp to near-zero) shared by every SFX
  // below; the only place that touches raw WebAudio nodes. Guarded: any
  // failure (suspended context, node creation error, etc.) is caught and
  // swallowed, never thrown.
  function playTone(freq, durationSec, type) {
    var audioCtx = getContext();
    if (!audioCtx) {
      return;
    }
    try {
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.08, 'square');
  }

  function playExplosion() {
    playTone(120, 0.2, 'sawtooth');
  }

  function playUfo() {
    playTone(440, 0.3, 'triangle');
  }

  function playHit() {
    playTone(220, 0.1, 'square');
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playUfo: playUfo,
    playHit: playHit,
  };
})();

// ---- src/renderer.js ----
// SI.Renderer — canvas pixel-art drawing (slice-06). Read-only: never
// mutates `state`. Composed from small pure per-entity helpers, each
// `(ctx, state) -> void`, so any one entity type is easy to reason about /
// swap independently. No canvas deps outside this module (ADR-001 dependency
// direction: renderer reads game state, never the other way around).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var BG = '#000';
  var PLAYER_COLOR = '#0f0';
  var ALIEN_COLOR = '#0ff';
  var PLAYER_BULLET_COLOR = '#fff';
  var ALIEN_BULLET_COLOR = '#f0f';
  var SHIELD_COLOR = '#0a0';
  var UFO_COLOR = '#ff0';
  var HUD_COLOR = '#fff';

  function drawBackground(ctx, state, canvas) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlayer(ctx, state) {
    var p = state.player;
    if (!p) {
      return;
    }
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(p.x, p.y, p.width, p.height);
  }

  function drawAliens(ctx, state) {
    var aliens = state.aliens || [];
    ctx.fillStyle = ALIEN_COLOR;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      ctx.fillRect(a.x, a.y, a.width, a.height);
    }
  }

  function drawBullets(ctx, state) {
    var playerBullets = state.playerBullets || [];
    ctx.fillStyle = PLAYER_BULLET_COLOR;
    for (var i = 0; i < playerBullets.length; i++) {
      var pb = playerBullets[i];
      ctx.fillRect(pb.x, pb.y, pb.width, pb.height);
    }

    var alienBullets = state.alienBullets || [];
    ctx.fillStyle = ALIEN_BULLET_COLOR;
    for (var j = 0; j < alienBullets.length; j++) {
      var ab = alienBullets[j];
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }
  }

  function drawShields(ctx, state) {
    var shields = state.shields || [];
    ctx.fillStyle = SHIELD_COLOR;
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      var cells = shield.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        if (cells[ci] <= 0) {
          continue; // destroyed cell, nothing to draw
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  function drawUfo(ctx, state) {
    var ufo = state.ufo;
    if (!ufo || !ufo.active) {
      return;
    }
    ctx.fillStyle = UFO_COLOR;
    ctx.fillRect(ufo.x, ufo.y, ufo.width, ufo.height);
  }

  function drawHud(ctx, state, canvas) {
    ctx.fillStyle = HUD_COLOR;
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';
    var score = state.score !== undefined ? state.score : 0;
    var lives = state.lives !== undefined ? state.lives : 0;
    var wave = state.wave !== undefined ? state.wave : 1;
    ctx.fillText('Score: ' + score + '  Lives: ' + lives + '  Wave: ' + wave, 8, 8);

    if (state.state && state.state !== 'playing') {
      ctx.textAlign = 'center';
      ctx.font = '28px monospace';
      ctx.fillText(String(state.state).toUpperCase(), canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
    }
  }

  // draw — orchestrates the per-entity helpers above against SI.Renderer's
  // own canvas/context (acquired lazily on first draw, since main.js is the
  // only module that knows about DOM readiness). Never throws: any failure
  // (no canvas in the document, a malformed state field, etc.) is caught and
  // swallowed so a rendering bug can never take down the update loop or the
  // sealed-test harness. Read-only with respect to `state`.
  var canvas = null;
  var ctx = null;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null; // headless/Node — no DOM to draw to
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function draw(state) {
    try {
      var c2d = getContext();
      if (!c2d || !state) {
        return;
      }
      drawBackground(c2d, state, canvas);
      drawPlayer(c2d, state);
      drawAliens(c2d, state);
      drawBullets(c2d, state);
      drawShields(c2d, state);
      drawUfo(c2d, state);
      drawHud(c2d, state, canvas);
    } catch (e) {
      // ponytail: swallow-and-continue is the deliberate contract here
      // (renderer must never throw / never take down the loop); log so a
      // real bug is still visible in devtools.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns fps
// measurement (slice-06, P5): a rolling MEDIAN of recent instantaneous fps,
// written into gameState.fps for observability only — never fed back into
// update() (frame-rate variance must never change game logic/outcomes, per
// ADR-002/conventions.md).
// Depends on SI.Game.update(dt), SI.Game.state, and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06). Small fixed-size ring of recent
  // instantaneous fps samples (1000 / rawDeltaMs); each frame we
  // copy+sort that array and take the middle value rather than keeping a
  // running average, so one wild rAF timing spike can't skew the reported
  // number the way a mean would. Uncapped raw delta (measured BEFORE the
  // spiral-of-death cap below, which only applies to update()'s
  // accumulator, never to fps reporting); non-positive deltas (first frame,
  // or a clock that hasn't advanced) are skipped rather than pushed as
  // Infinity/garbage.
  var FPS_SAMPLE_WINDOW = 30;
  var fpsSamples = [];

  function medianOf(samples) {
    var sorted = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function recordFps(rawDelta) {
    if (!(rawDelta > 0)) {
      return; // skip non-positive/garbage deltas (e.g. the very first frame)
    }
    var instantaneous = 1000 / rawDelta;
    fpsSamples.push(instantaneous);
    if (fpsSamples.length > FPS_SAMPLE_WINDOW) {
      fpsSamples.shift();
    }
    if (fpsSamples.length > 0 && window.SI.Game && window.SI.Game.state) {
      window.SI.Game.state.fps = medianOf(fpsSamples);
    }
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;

    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Applies only to the update
    // accumulator, not to the fps sample recorded above.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/main.js ----
// main.js — browser bootstrap (slice-06). Wires canvas + input, calls
// SI.Game.init(), assigns window.gameState = SI.Game.state as a LIVE
// reference (ADR-003 — never reassigned after this), attaches Left/Right/
// Space/P/Enter keyboard listeners that set SI.Game.input intent flags
// (never touch state directly, per conventions.md's "input handlers set
// intent flags that update() consumes"), then starts SI.Loop.
//
// Must no-op gracefully in Node/headless (no `document`/`window.document`):
// SI.Renderer and SI.Audio stay defined either way (loaded earlier in
// concatenation order), only the DOM-dependent boot steps below are
// skipped. This is the LAST concatenated module (build.js), so every other
// SI.* namespace it references is already attached.
(function () {
  function handleKey(pressed) {
    return function (event) {
      switch (event.code) {
        case 'ArrowLeft':
          window.SI.Game.input.left = pressed;
          break;
        case 'ArrowRight':
          window.SI.Game.input.right = pressed;
          break;
        case 'Space':
          window.SI.Game.input.fire = pressed;
          break;
        case 'KeyP':
          if (pressed) {
            togglePause();
          }
          break;
        case 'Enter':
          if (pressed) {
            restart();
          }
          break;
        default:
          return; // don't preventDefault on keys we don't handle
      }
      event.preventDefault();
    };
  }

  function togglePause() {
    var state = window.SI.Game.state;
    if (!state) {
      return;
    }
    if (state.state === 'playing') {
      state.state = 'paused';
    } else if (state.state === 'paused') {
      state.state = 'playing';
    }
  }

  function restart() {
    window.SI.Game.init({ width: 800, height: 600 });
  }

  function boot() {
    // Headless/Node guard: nothing DOM-dependent below can run without
    // `document`, but SI.Renderer/SI.Audio remain defined regardless (they
    // guard their own DOM/AudioContext access internally).
    if (typeof document === 'undefined') {
      return;
    }

    var canvas = document.getElementById('game');
    var width = canvas ? canvas.width : 800;
    var height = canvas ? canvas.height : 600;

    window.SI.Game.init({ width: width, height: height });
    // Live reference (ADR-003): SI.Game.init() already sets window.gameState
    // to the same object as SI.Game.state, but assign it again explicitly
    // here so the bootstrap contract (TEST-FACING API) is satisfied even if
    // SI.Game's internals ever change.
    window.gameState = window.SI.Game.state;

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));

    window.SI.Loop.start();
  }

  boot();
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};

// ---- src/audio.js ----
// SI.Audio — minimal synthesized SFX via WebAudio (slice-06). Lazy
// AudioContext (created on first use, not at module load, since some
// browsers require a user gesture before audio can start) and every public
// method is guarded so a headless/suspended/absent AudioContext never
// throws — per conventions.md's "fail loudly in dev, but SI.Audio
// console.error-and-continues if AudioContext init fails so the game still
// runs without sound". No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var triedInit = false;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (triedInit) {
      return null; // already failed once this session, don't retry every call
    }
    triedInit = true;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return null; // no WebAudio support at all (older/headless browser)
      }
      ctx = new Ctor();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — one envelope helper (oscillator -> gain, linear attack then
  // exponential-ish decay via linear ramp to near-zero) shared by every SFX
  // below; the only place that touches raw WebAudio nodes. Guarded: any
  // failure (suspended context, node creation error, etc.) is caught and
  // swallowed, never thrown.
  function playTone(freq, durationSec, type) {
    var audioCtx = getContext();
    if (!audioCtx) {
      return;
    }
    try {
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.08, 'square');
  }

  function playExplosion() {
    playTone(120, 0.2, 'sawtooth');
  }

  function playUfo() {
    playTone(440, 0.3, 'triangle');
  }

  function playHit() {
    playTone(220, 0.1, 'square');
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playUfo: playUfo,
    playHit: playHit,
  };
})();

// ---- src/renderer.js ----
// SI.Renderer — canvas pixel-art drawing (slice-06). Read-only: never
// mutates `state`. Composed from small pure per-entity helpers, each
// `(ctx, state) -> void`, so any one entity type is easy to reason about /
// swap independently. No canvas deps outside this module (ADR-001 dependency
// direction: renderer reads game state, never the other way around).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var BG = '#000';
  var PLAYER_COLOR = '#0f0';
  var ALIEN_COLOR = '#0ff';
  var PLAYER_BULLET_COLOR = '#fff';
  var ALIEN_BULLET_COLOR = '#f0f';
  var SHIELD_COLOR = '#0a0';
  var UFO_COLOR = '#ff0';
  var HUD_COLOR = '#fff';

  function drawBackground(ctx, state, canvas) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlayer(ctx, state) {
    var p = state.player;
    if (!p) {
      return;
    }
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(p.x, p.y, p.width, p.height);
  }

  function drawAliens(ctx, state) {
    var aliens = state.aliens || [];
    ctx.fillStyle = ALIEN_COLOR;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      ctx.fillRect(a.x, a.y, a.width, a.height);
    }
  }

  function drawBullets(ctx, state) {
    var playerBullets = state.playerBullets || [];
    ctx.fillStyle = PLAYER_BULLET_COLOR;
    for (var i = 0; i < playerBullets.length; i++) {
      var pb = playerBullets[i];
      ctx.fillRect(pb.x, pb.y, pb.width, pb.height);
    }

    var alienBullets = state.alienBullets || [];
    ctx.fillStyle = ALIEN_BULLET_COLOR;
    for (var j = 0; j < alienBullets.length; j++) {
      var ab = alienBullets[j];
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }
  }

  function drawShields(ctx, state) {
    var shields = state.shields || [];
    ctx.fillStyle = SHIELD_COLOR;
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      var cells = shield.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        if (cells[ci] <= 0) {
          continue; // destroyed cell, nothing to draw
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  function drawUfo(ctx, state) {
    var ufo = state.ufo;
    if (!ufo || !ufo.active) {
      return;
    }
    ctx.fillStyle = UFO_COLOR;
    ctx.fillRect(ufo.x, ufo.y, ufo.width, ufo.height);
  }

  function drawHud(ctx, state, canvas) {
    ctx.fillStyle = HUD_COLOR;
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';
    var score = state.score !== undefined ? state.score : 0;
    var lives = state.lives !== undefined ? state.lives : 0;
    var wave = state.wave !== undefined ? state.wave : 1;
    ctx.fillText('Score: ' + score + '  Lives: ' + lives + '  Wave: ' + wave, 8, 8);

    if (state.state && state.state !== 'playing') {
      ctx.textAlign = 'center';
      ctx.font = '28px monospace';
      ctx.fillText(String(state.state).toUpperCase(), canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
    }
  }

  // draw — orchestrates the per-entity helpers above against SI.Renderer's
  // own canvas/context (acquired lazily on first draw, since main.js is the
  // only module that knows about DOM readiness). Never throws: any failure
  // (no canvas in the document, a malformed state field, etc.) is caught and
  // swallowed so a rendering bug can never take down the update loop or the
  // sealed-test harness. Read-only with respect to `state`.
  var canvas = null;
  var ctx = null;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null; // headless/Node — no DOM to draw to
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function draw(state) {
    try {
      var c2d = getContext();
      if (!c2d || !state) {
        return;
      }
      drawBackground(c2d, state, canvas);
      drawPlayer(c2d, state);
      drawAliens(c2d, state);
      drawBullets(c2d, state);
      drawShields(c2d, state);
      drawUfo(c2d, state);
      drawHud(c2d, state, canvas);
    } catch (e) {
      // ponytail: swallow-and-continue is the deliberate contract here
      // (renderer must never throw / never take down the loop); log so a
      // real bug is still visible in devtools.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

// ---- src/ufo.js ----
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

// ---- src/loop.js ----
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns fps
// measurement (slice-06, P5): a rolling MEDIAN of recent instantaneous fps,
// written into gameState.fps for observability only — never fed back into
// update() (frame-rate variance must never change game logic/outcomes, per
// ADR-002/conventions.md).
// Depends on SI.Game.update(dt), SI.Game.state, and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06). Small fixed-size ring of recent
  // instantaneous fps samples (1000 / rawDeltaMs); each frame we
  // copy+sort that array and take the middle value rather than keeping a
  // running average, so one wild rAF timing spike can't skew the reported
  // number the way a mean would. Uncapped raw delta (measured BEFORE the
  // spiral-of-death cap below, which only applies to update()'s
  // accumulator, never to fps reporting); non-positive deltas (first frame,
  // or a clock that hasn't advanced) are skipped rather than pushed as
  // Infinity/garbage.
  var FPS_SAMPLE_WINDOW = 30;
  var fpsSamples = [];

  function medianOf(samples) {
    var sorted = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function recordFps(rawDelta) {
    if (!(rawDelta > 0)) {
      return; // skip non-positive/garbage deltas (e.g. the very first frame)
    }
    var instantaneous = 1000 / rawDelta;
    fpsSamples.push(instantaneous);
    if (fpsSamples.length > FPS_SAMPLE_WINDOW) {
      fpsSamples.shift();
    }
    if (fpsSamples.length > 0 && window.SI.Game && window.SI.Game.state) {
      window.SI.Game.state.fps = medianOf(fpsSamples);
    }
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;

    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Applies only to the update
    // accumulator, not to the fps sample recorded above.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
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

// ---- src/game.js ----
// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

// ---- src/main.js ----
// main.js — browser bootstrap (slice-06). Wires canvas + input, calls
// SI.Game.init(), assigns window.gameState = SI.Game.state as a LIVE
// reference (ADR-003 — never reassigned after this), attaches Left/Right/
// Space/P/Enter keyboard listeners that set SI.Game.input intent flags
// (never touch state directly, per conventions.md's "input handlers set
// intent flags that update() consumes"), then starts SI.Loop.
//
// Must no-op gracefully in Node/headless (no `document`/`window.document`):
// SI.Renderer and SI.Audio stay defined either way (loaded earlier in
// concatenation order), only the DOM-dependent boot steps below are
// skipped. This is the LAST concatenated module (build.js), so every other
// SI.* namespace it references is already attached.
(function () {
  function handleKey(pressed) {
    return function (event) {
      switch (event.code) {
        case 'ArrowLeft':
          window.SI.Game.input.left = pressed;
          break;
        case 'ArrowRight':
          window.SI.Game.input.right = pressed;
          break;
        case 'Space':
          window.SI.Game.input.fire = pressed;
          break;
        case 'KeyP':
          if (pressed) {
            togglePause();
          }
          break;
        case 'Enter':
          if (pressed) {
            restart();
          }
          break;
        default:
          return; // don't preventDefault on keys we don't handle
      }
      event.preventDefault();
    };
  }

  function togglePause() {
    var state = window.SI.Game.state;
    if (!state) {
      return;
    }
    if (state.state === 'playing') {
      state.state = 'paused';
    } else if (state.state === 'paused') {
      state.state = 'playing';
    }
  }

  function restart() {
    window.SI.Game.init({ width: 800, height: 600 });
  }

  function boot() {
    // Headless/Node guard: nothing DOM-dependent below can run without
    // `document`, but SI.Renderer/SI.Audio remain defined regardless (they
    // guard their own DOM/AudioContext access internally).
    if (typeof document === 'undefined') {
      return;
    }

    var canvas = document.getElementById('game');
    var width = canvas ? canvas.width : 800;
    var height = canvas ? canvas.height : 600;

    window.SI.Game.init({ width: width, height: height });
    // Live reference (ADR-003): SI.Game.init() already sets window.gameState
    // to the same object as SI.Game.state, but assign it again explicitly
    // here so the bootstrap contract (TEST-FACING API) is satisfied even if
    // SI.Game's internals ever change.
    window.gameState = window.SI.Game.state;

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));

    window.SI.Loop.start();
  }

  boot();
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
  // alive and the current wave (slice-05; defaults to 1 so slice-03
  // callers are unaffected). Base interval is the slice-03 ratio-based
  // speed ramp (scales linearly with aliveCount/totalCount, ceil'd to stay
  // integer): monotonically non-increasing as aliveCount drops (fewer
  // aliens -> smaller interval -> faster march), strictly smaller at
  // aliveCount=1 than at aliveCount=totalCount (the classic 55-alien full
  // grid) for a fixed wave. slice-05 layers a per-wave speedup on top: each
  // wave above 1 subtracts a fixed ALIEN_MARCH_WAVE_SPEEDUP from the base
  // (a subtractive ramp, not a ceil(base/wave) divisor — the divisor form
  // plateaus once base/wave stops crossing an integer boundary at higher
  // waves, which would break strict-decrease; subtracting a constant per
  // wave doesn't). Floor-clamped to 1 throughout so the march never
  // stalls, and never goes negative. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    if (wave === undefined) {
      wave = 1;
    }
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var base = Math.ceil((maxInterval * count) / totalCount);
    if (base < 1) {
      base = 1;
    }

    var interval = base - (wave - 1) * cfg.ALIEN_MARCH_WAVE_SPEEDUP;
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

+++ src/audio.js
// SI.Audio — minimal synthesized SFX via WebAudio (slice-06). Lazy
// AudioContext (created on first use, not at module load, since some
// browsers require a user gesture before audio can start) and every public
// method is guarded so a headless/suspended/absent AudioContext never
// throws — per conventions.md's "fail loudly in dev, but SI.Audio
// console.error-and-continues if AudioContext init fails so the game still
// runs without sound". No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var triedInit = false;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (triedInit) {
      return null; // already failed once this session, don't retry every call
    }
    triedInit = true;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        return null; // no WebAudio support at all (older/headless browser)
      }
      ctx = new Ctor();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: AudioContext construction failed', e);
      }
      ctx = null;
    }
    return ctx;
  }

  // playTone — one envelope helper (oscillator -> gain, linear attack then
  // exponential-ish decay via linear ramp to near-zero) shared by every SFX
  // below; the only place that touches raw WebAudio nodes. Guarded: any
  // failure (suspended context, node creation error, etc.) is caught and
  // swallowed, never thrown.
  function playTone(freq, durationSec, type) {
    var audioCtx = getContext();
    if (!audioCtx) {
      return;
    }
    try {
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume().catch(function () {});
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Audio: playback failed', e);
      }
    }
  }

  function playShoot() {
    playTone(880, 0.08, 'square');
  }

  function playExplosion() {
    playTone(120, 0.2, 'sawtooth');
  }

  function playUfo() {
    playTone(440, 0.3, 'triangle');
  }

  function playHit() {
    playTone(220, 0.1, 'square');
  }

  window.SI.Audio = {
    playShoot: playShoot,
    playExplosion: playExplosion,
    playUfo: playUfo,
    playHit: playHit,
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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
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
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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
// SI.Loop — fixed-timestep accumulator, rAF driver (ADR-002). Also owns fps
// measurement (slice-06, P5): a rolling MEDIAN of recent instantaneous fps,
// written into gameState.fps for observability only — never fed back into
// update() (frame-rate variance must never change game logic/outcomes, per
// ADR-002/conventions.md).
// Depends on SI.Game.update(dt), SI.Game.state, and SI.Renderer.draw(state).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var accumulator = 0;
  var lastTime = null;
  var running = false;

  // Rolling-median fps (slice-06). Small fixed-size ring of recent
  // instantaneous fps samples (1000 / rawDeltaMs); each frame we
  // copy+sort that array and take the middle value rather than keeping a
  // running average, so one wild rAF timing spike can't skew the reported
  // number the way a mean would. Uncapped raw delta (measured BEFORE the
  // spiral-of-death cap below, which only applies to update()'s
  // accumulator, never to fps reporting); non-positive deltas (first frame,
  // or a clock that hasn't advanced) are skipped rather than pushed as
  // Infinity/garbage.
  var FPS_SAMPLE_WINDOW = 30;
  var fpsSamples = [];

  function medianOf(samples) {
    var sorted = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function recordFps(rawDelta) {
    if (!(rawDelta > 0)) {
      return; // skip non-positive/garbage deltas (e.g. the very first frame)
    }
    var instantaneous = 1000 / rawDelta;
    fpsSamples.push(instantaneous);
    if (fpsSamples.length > FPS_SAMPLE_WINDOW) {
      fpsSamples.shift();
    }
    if (fpsSamples.length > 0 && window.SI.Game && window.SI.Game.state) {
      window.SI.Game.state.fps = medianOf(fpsSamples);
    }
  }

  function frame(now) {
    if (!running) return;

    var step = window.SI.Config.FIXED_TIMESTEP_MS;

    if (lastTime === null) {
      lastTime = now;
    }

    var rawDelta = now - lastTime;
    lastTime = now;

    recordFps(rawDelta);

    // Spiral-of-death guard: never let one slow/backgrounded frame force a
    // huge catch-up burst of update() calls. Applies only to the update
    // accumulator, not to the fps sample recorded above.
    var delta = rawDelta;
    var cap = step * 3;
    if (delta > cap) {
      delta = cap;
    }

    accumulator += delta;

    while (accumulator >= step) {
      window.SI.Game.update(step);
      accumulator -= step;
    }

    window.SI.Renderer.draw(window.SI.Game.state);

    window.requestAnimationFrame(frame);
  }

  function start() {
    running = true;
    accumulator = 0;
    lastTime = null;
    fpsSamples = [];
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

+++ src/main.js
// main.js — browser bootstrap (slice-06). Wires canvas + input, calls
// SI.Game.init(), assigns window.gameState = SI.Game.state as a LIVE
// reference (ADR-003 — never reassigned after this), attaches Left/Right/
// Space/P/Enter keyboard listeners that set SI.Game.input intent flags
// (never touch state directly, per conventions.md's "input handlers set
// intent flags that update() consumes"), then starts SI.Loop.
//
// Must no-op gracefully in Node/headless (no `document`/`window.document`):
// SI.Renderer and SI.Audio stay defined either way (loaded earlier in
// concatenation order), only the DOM-dependent boot steps below are
// skipped. This is the LAST concatenated module (build.js), so every other
// SI.* namespace it references is already attached.
(function () {
  function handleKey(pressed) {
    return function (event) {
      switch (event.code) {
        case 'ArrowLeft':
          window.SI.Game.input.left = pressed;
          break;
        case 'ArrowRight':
          window.SI.Game.input.right = pressed;
          break;
        case 'Space':
          window.SI.Game.input.fire = pressed;
          break;
        case 'KeyP':
          if (pressed) {
            togglePause();
          }
          break;
        case 'Enter':
          if (pressed) {
            restart();
          }
          break;
        default:
          return; // don't preventDefault on keys we don't handle
      }
      event.preventDefault();
    };
  }

  function togglePause() {
    var state = window.SI.Game.state;
    if (!state) {
      return;
    }
    if (state.state === 'playing') {
      state.state = 'paused';
    } else if (state.state === 'paused') {
      state.state = 'playing';
    }
  }

  function restart() {
    window.SI.Game.init({ width: 800, height: 600 });
  }

  function boot() {
    // Headless/Node guard: nothing DOM-dependent below can run without
    // `document`, but SI.Renderer/SI.Audio remain defined regardless (they
    // guard their own DOM/AudioContext access internally).
    if (typeof document === 'undefined') {
      return;
    }

    var canvas = document.getElementById('game');
    var width = canvas ? canvas.width : 800;
    var height = canvas ? canvas.height : 600;

    window.SI.Game.init({ width: width, height: height });
    // Live reference (ADR-003): SI.Game.init() already sets window.gameState
    // to the same object as SI.Game.state, but assign it again explicitly
    // here so the bootstrap contract (TEST-FACING API) is satisfied even if
    // SI.Game's internals ever change.
    window.gameState = window.SI.Game.state;

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));

    window.SI.Loop.start();
  }

  boot();
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

+++ src/renderer.js
// SI.Renderer — canvas pixel-art drawing (slice-06). Read-only: never
// mutates `state`. Composed from small pure per-entity helpers, each
// `(ctx, state) -> void`, so any one entity type is easy to reason about /
// swap independently. No canvas deps outside this module (ADR-001 dependency
// direction: renderer reads game state, never the other way around).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var BG = '#000';
  var PLAYER_COLOR = '#0f0';
  var ALIEN_COLOR = '#0ff';
  var PLAYER_BULLET_COLOR = '#fff';
  var ALIEN_BULLET_COLOR = '#f0f';
  var SHIELD_COLOR = '#0a0';
  var UFO_COLOR = '#ff0';
  var HUD_COLOR = '#fff';

  function drawBackground(ctx, state, canvas) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlayer(ctx, state) {
    var p = state.player;
    if (!p) {
      return;
    }
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(p.x, p.y, p.width, p.height);
  }

  function drawAliens(ctx, state) {
    var aliens = state.aliens || [];
    ctx.fillStyle = ALIEN_COLOR;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      ctx.fillRect(a.x, a.y, a.width, a.height);
    }
  }

  function drawBullets(ctx, state) {
    var playerBullets = state.playerBullets || [];
    ctx.fillStyle = PLAYER_BULLET_COLOR;
    for (var i = 0; i < playerBullets.length; i++) {
      var pb = playerBullets[i];
      ctx.fillRect(pb.x, pb.y, pb.width, pb.height);
    }

    var alienBullets = state.alienBullets || [];
    ctx.fillStyle = ALIEN_BULLET_COLOR;
    for (var j = 0; j < alienBullets.length; j++) {
      var ab = alienBullets[j];
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }
  }

  function drawShields(ctx, state) {
    var shields = state.shields || [];
    ctx.fillStyle = SHIELD_COLOR;
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      var cells = shield.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        if (cells[ci] <= 0) {
          continue; // destroyed cell, nothing to draw
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  function drawUfo(ctx, state) {
    var ufo = state.ufo;
    if (!ufo || !ufo.active) {
      return;
    }
    ctx.fillStyle = UFO_COLOR;
    ctx.fillRect(ufo.x, ufo.y, ufo.width, ufo.height);
  }

  function drawHud(ctx, state, canvas) {
    ctx.fillStyle = HUD_COLOR;
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';
    var score = state.score !== undefined ? state.score : 0;
    var lives = state.lives !== undefined ? state.lives : 0;
    var wave = state.wave !== undefined ? state.wave : 1;
    ctx.fillText('Score: ' + score + '  Lives: ' + lives + '  Wave: ' + wave, 8, 8);

    if (state.state && state.state !== 'playing') {
      ctx.textAlign = 'center';
      ctx.font = '28px monospace';
      ctx.fillText(String(state.state).toUpperCase(), canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
    }
  }

  // draw — orchestrates the per-entity helpers above against SI.Renderer's
  // own canvas/context (acquired lazily on first draw, since main.js is the
  // only module that knows about DOM readiness). Never throws: any failure
  // (no canvas in the document, a malformed state field, etc.) is caught and
  // swallowed so a rendering bug can never take down the update loop or the
  // sealed-test harness. Read-only with respect to `state`.
  var canvas = null;
  var ctx = null;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null; // headless/Node — no DOM to draw to
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function draw(state) {
    try {
      var c2d = getContext();
      if (!c2d || !state) {
        return;
      }
      drawBackground(c2d, state, canvas);
      drawPlayer(c2d, state);
      drawAliens(c2d, state);
      drawBullets(c2d, state);
      drawShields(c2d, state);
      drawUfo(c2d, state);
      drawHud(c2d, state, canvas);
    } catch (e) {
      // ponytail: swallow-and-continue is the deliberate contract here
      // (renderer must never throw / never take down the loop); log so a
      // real bug is still visible in devtools.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
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
// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();

+++ src/ufo.js
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
```
