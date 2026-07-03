// SEALED suite for slice-04 (lives-and-gameover, owns P3). Zero added
// dependencies.
//
// The STZ bridge's runSealed does spawnSync("node", [suite, impl]) and
// parses ONLY the LAST non-empty stdout line as JSON of shape
// { passed, total, passRate }. This suite uses a tiny inline synchronous
// runner (not node:test, whose TAP ordering isn't guaranteed last):
// per-test results go to STDERR; the final stdout statement is exactly the
// JSON summary and nothing follows it.
//
// The implementation is passed as process.argv[2]: a SINGLE readable JS
// file, the concatenated bundle emitted by the specimen's build.js (src
// modules in dependency order, attached to window.SI, no HTML). The bridge
// measures V8 coverage/mutation by reading that one file, so the suite
// loads exactly it (filename set to its absolute path).
//
// Impl resolution order:
//   1. process.argv[2]                        -> path to a bundle .js file
//   2. STZ_SPECIMEN_DIR env (a specimen ROOT) -> <root>/dist/game.js
//   3. default: this suite's sealed reference (built on the fly)
//
// The specimen ROOT is derived as dirname(dirname(bundlePath)). Mutation
// testing reruns this suite against a bare mutated bundle in a temp dir
// where NO build.js exists at that derived root; in that case the build
// tests are SKIPPED (not registered, not counted) so mutants are judged by
// the logic tests that DO run against the loaded bundle.
//
// The bundle is loaded into a Node vm.Context whose `window` IS the context
// global object (window === globalThis, exactly like a browser), so a
// specimen's `window.SI = window.SI || {}` then bare `SI.Foo = {...}`
// (ADR-001) resolves.
//
// Driving is pure deterministic Node stepping (no Playwright/browser): call
// SI.Game.init({width,height,seed}), set SI.Game.input.{left,right,fire},
// mutate window.gameState directly for fixtures (same technique slice-02/03
// use for bullets/aliens), call SI.Game.update(SI.Config.FIXED_TIMESTEP_MS)
// N times, observe window.gameState.
//
// Contract scope discipline (do not relax): the slice-04 contract's
// terminality clause names exactly three fields - lives, score, state.
// Terminality assertions below check ONLY those three; they deliberately do
// NOT assert that aliens/bullets/player freeze too, since a correct
// implementation is free to let cosmetic state keep moving after gameover
// as long as lives/score/state don't change. Asserting more than the
// contract names would fail a correct-but-differently-shaped implementation
// (the "stay within the contract" rule).
//
// Anti-fragility: nothing here keys an alien's or bullet's identity on
// (row,col)/array index across a step where it may legitimately move
// (march, bullet travel). Alien-bullet-hit assertions use lives deltas and
// array LENGTH deltas (membership-based, per the TEST-FACING API), never
// position/index identity across an update() call.
//
// Run locally: node slice-04.test.mjs [pathToBundle.js]

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveImpl() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  if (process.env.STZ_SPECIMEN_DIR) {
    return path.join(path.resolve(process.env.STZ_SPECIMEN_DIR), 'dist', 'game.js');
  }
  const refRoot = path.join(__dirname, 'reference');
  execFileSync(process.execPath, ['build.js'], { cwd: refRoot, stdio: 'pipe' });
  return path.join(refRoot, 'dist', 'game.js');
}

const IMPL = resolveImpl();
const SPECIMEN_ROOT = path.dirname(path.dirname(IMPL));
const HAS_BUILD = fs.existsSync(path.join(SPECIMEN_ROOT, 'build.js'));

// ---------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------

function loadBundle(bundlePath = IMPL) {
  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, like a real browser
  sandbox.requestAnimationFrame = () => 0;
  sandbox.performance = { now: () => 0 };
  sandbox.console = console;

  vm.createContext(sandbox);
  const code = fs.readFileSync(bundlePath, 'utf8');
  vm.runInContext(code, sandbox, { filename: path.resolve(bundlePath) });

  return { SI: sandbox.SI, window: sandbox.window };
}

function runBuild(root) {
  execFileSync(process.execPath, ['build.js'], { cwd: root, stdio: 'pipe' });
  const distDir = path.join(root, 'dist');
  return {
    indexPath: path.join(distDir, 'index.html'),
    bundlePath: path.join(distDir, 'game.js'),
  };
}

function step(SI, n = 1) {
  for (let i = 0; i < n; i++) SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
}

function alienSnapshot(aliens) {
  return aliens
    .map((a) => ({ row: a.row, x: a.x, y: a.y, points: a.points }))
    .sort((a, b) => a.row - b.row || a.x - b.x);
}

function pointsSum(aliens) {
  return aliens.reduce((sum, a) => sum + a.points, 0);
}

// A bare {x,y,width,height} bullet exactly coincident with `box` (own field
// values, never hardcoded coordinates) - guarantees aabbOverlap true
// regardless of the specimen's own bullet dimensions.
function coincidentBox(box) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

const tests = [];
const add = (name, fn) => tests.push({ name, fn });

// =======================================================================
// Alien-bullet vs player collision (TEST-FACING API: plain
// {x,y,width,height}, LIVE by array-membership alone)
// =======================================================================

add(
  'Alien-bullet hit: a bare bullet injected directly into gameState.alienBullets, exactly ' +
    "overlapping the player, decrements lives by EXACTLY 1 and is consumed (removed) - swept across " +
    'several starting lives values',
  () => {
    for (const startLives of [3, 2, 1]) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: 800, height: 600 });
      const gs = window.gameState;
      gs.lives = startLives;
      gs.alienBullets = [coincidentBox(gs.player)];

      step(SI, 1);

      assert.strictEqual(
        gs.lives,
        startLives - 1,
        `startLives=${startLives}: lives must decrease by EXACTLY 1 on one overlapping alien-bullet hit`
      );
      assert.strictEqual(
        gs.alienBullets.length,
        0,
        `startLives=${startLives}: the hitting alien bullet must be consumed (removed) from alienBullets`
      );
      const expectGameover = startLives - 1 === 0;
      assert.strictEqual(
        gs.state,
        expectGameover ? 'gameover' : 'playing',
        `startLives=${startLives}: state must be ${expectGameover ? "'gameover'" : "'playing'"} after lives=${startLives - 1}`
      );
    }
  }
);

add(
  'Alien-bullet miss: a bullet placed well away from the player leaves lives, score, and the bullet ' +
    'itself untouched',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const livesBefore = gs.lives;
    const scoreBefore = gs.score;
    // Far from the player horizontally and vertically clear of the bottom
    // edge, so one step of any plausible downward bullet speed still keeps
    // it clear of the player and on-screen.
    gs.alienBullets = [{ x: -99999, y: 5, width: 4, height: 10 }];

    step(SI, 1);

    assert.strictEqual(gs.lives, livesBefore, 'a non-overlapping alien bullet must not change lives');
    assert.strictEqual(gs.score, scoreBefore, 'a non-overlapping alien bullet must not change score');
    assert.strictEqual(
      gs.alienBullets.length,
      1,
      'a non-overlapping alien bullet must NOT be consumed - it must still be present after the step'
    );
  }
);

add(
  'Alien-bullet edge-touch: a bullet placed exactly adjacent to the player (sharing a boundary line, ' +
    'zero-area intersection, per SI.Collision.aabbOverlap edge-exclusion) does NOT count as a hit - ' +
    'discriminates against a naive "close enough" hit check',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const p = gs.player;
    const livesBefore = gs.lives;
    // Shares the player's right edge exactly - real overlap -> false per
    // the project's own aabbOverlap contract (slice-01/02's collision.js).
    gs.alienBullets = [{ x: p.x + p.width, y: p.y, width: 4, height: 10 }];

    step(SI, 1);

    assert.strictEqual(gs.lives, livesBefore, 'an edge-touching (non-overlapping) alien bullet must not cost a life');
  }
);

add(
  'Alien-bullet hit is isolated: hitting the player must not change score or the alien grid - only a ' +
    'player-fired bullet scores a kill',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const scoreBefore = gs.score;
    const alienSnapBefore = alienSnapshot(gs.aliens);
    gs.alienBullets = [coincidentBox(gs.player)];

    step(SI, 1);

    assert.strictEqual(gs.score, scoreBefore, 'an alien-bullet hit on the player must not change score');
    assert.deepStrictEqual(
      alienSnapshot(gs.aliens),
      alienSnapBefore,
      'an alien-bullet hit on the player must not touch the alien grid'
    );
  }
);

add(
  'Alien-bullet multi-bullet step: exactly one of two injected bullets overlaps the player - lives ' +
    'drops by exactly 1 (not 2, not 0) and alienBullets shrinks by exactly 1 (the miss survives)',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const livesBefore = gs.lives;
    gs.alienBullets = [coincidentBox(gs.player), { x: -99999, y: 5, width: 4, height: 10 }];

    step(SI, 1);

    assert.strictEqual(gs.lives, livesBefore - 1, 'exactly one overlapping bullet must cost exactly one life');
    assert.strictEqual(
      gs.alienBullets.length,
      1,
      'exactly the overlapping bullet must be consumed; the non-overlapping one must survive'
    );
  }
);

// =======================================================================
// Gameover: lives === 0
// =======================================================================

add(
  'Gameover-by-lives: driving exactly STARTING_LIVES separate overlapping-bullet hits transitions to ' +
    "'gameover' only on the LAST hit, never earlier, with lives counting down by exactly 1 each time",
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const startLives = gs.lives;
    assert.ok(startLives > 0, 'setup invariant: init() must leave lives > 0');

    for (let hit = 1; hit <= startLives; hit++) {
      gs.alienBullets = [coincidentBox(gs.player)];
      step(SI, 1);
      assert.strictEqual(gs.lives, startLives - hit, `after hit ${hit}: lives must be exactly ${startLives - hit}`);
      const expectGameover = hit === startLives;
      assert.strictEqual(
        gs.state,
        expectGameover ? 'gameover' : 'playing',
        `after hit ${hit}/${startLives}: state must be ${expectGameover ? "'gameover'" : "still 'playing'"}`
      );
    }
  }
);

// =======================================================================
// Gameover: alien reaches player row (alien.y + alien.height >= player.y)
// =======================================================================

add(
  "Gameover-by-row: an alive alien whose y is moved (legit direct gameState mutation) so that " +
    "alien.y + alien.height >= player.y triggers 'gameover' on the next update() regardless of " +
    'remaining lives, and does NOT itself change lives',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const livesBefore = gs.lives;
    const target = gs.aliens[0];
    target.y = gs.player.y - target.height; // exactly reaches: y + height === player.y

    step(SI, 1);

    assert.strictEqual(gs.state, 'gameover', 'an alien reaching the player row must trigger gameover');
    assert.strictEqual(gs.lives, livesBefore, 'a row-reach gameover must not itself change lives');
  }
);

add(
  'Gameover-by-row boundary: exactly at alien.y + alien.height === player.y triggers gameover, but ' +
    'one pixel short (alien.y + alien.height === player.y - 1) does NOT - discriminates an off-by-one ' +
    '(> instead of >=) row-reach check',
  () => {
    const atBoundary = loadBundle();
    atBoundary.SI.Game.init({ width: 800, height: 600 });
    const gsAt = atBoundary.window.gameState;
    const aAt = gsAt.aliens[0];
    aAt.y = gsAt.player.y - aAt.height; // y + height === player.y exactly
    step(atBoundary.SI, 1);
    assert.strictEqual(gsAt.state, 'gameover', 'exact boundary contact (>=) must trigger gameover');

    const shortOfBoundary = loadBundle();
    shortOfBoundary.SI.Game.init({ width: 800, height: 600 });
    const gsShort = shortOfBoundary.window.gameState;
    const aShort = gsShort.aliens[0];
    aShort.y = gsShort.player.y - aShort.height - 1; // one px short of the boundary
    step(shortOfBoundary.SI, 1);
    assert.strictEqual(gsShort.state, 'playing', 'one pixel short of the row boundary must NOT trigger gameover');
  }
);

add(
  'Gameover-by-row: only the alien that reaches the row matters - other aliens far from the row do ' +
    'not prevent or interfere with the trigger',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    assert.ok(gs.aliens.length > 1, 'setup invariant: expects more than one alien');
    // Only aliens[0] reaches the row; every other alien is left exactly as
    // createGrid() placed it (nowhere near the player row by construction).
    gs.aliens[0].y = gs.player.y - gs.aliens[0].height;

    step(SI, 1);

    assert.strictEqual(gs.state, 'gameover', 'a single alien reaching the row must be sufficient to trigger gameover');
  }
);

// =======================================================================
// Gameover terminality - the contract names exactly lives/score/state
// =======================================================================

function assertFrozen(gs, snapshot, label) {
  assert.strictEqual(gs.lives, snapshot.lives, `${label}: lives must stay frozen at ${snapshot.lives}`);
  assert.strictEqual(gs.score, snapshot.score, `${label}: score must stay frozen at ${snapshot.score}`);
  assert.strictEqual(gs.state, snapshot.state, `${label}: state must stay frozen at '${snapshot.state}'`);
}

add(
  "Terminality (lives-zero path): once state==='gameover' via lives hitting 0, further update(dt) " +
    'calls - with varied dt, varied movement/fire input, and a freshly injected overlapping alien ' +
    'bullet each time - never change lives, score, or state',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const startLives = gs.lives;
    for (let i = 0; i < startLives; i++) {
      gs.alienBullets = [coincidentBox(gs.player)];
      step(SI, 1);
    }
    assert.strictEqual(gs.state, 'gameover', 'setup invariant: must have reached gameover via lives===0');
    const snapshot = { lives: gs.lives, score: gs.score, state: gs.state };
    assert.strictEqual(snapshot.lives, 0);

    const dtVariants = [SI.Config.FIXED_TIMESTEP_MS, 0, 1, 999999];
    for (let i = 0; i < dtVariants.length; i++) {
      SI.Game.input.left = i % 2 === 0;
      SI.Game.input.right = i % 2 !== 0;
      SI.Game.input.fire = true;
      gs.alienBullets = [coincidentBox(gs.player)]; // would-be additional hit
      SI.Game.update(dtVariants[i]);
      assertFrozen(gs, snapshot, `lives-zero terminality, call ${i + 1}`);
    }
  }
);

add(
  "Terminality (row-reach path): once state==='gameover' via an alien reaching the player row (lives " +
    'still positive), further update(dt) calls - including one that fires the player at a still-alive ' +
    'alien - never change lives, score, or state',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const target = gs.aliens[0];
    target.y = gs.player.y - target.height;
    step(SI, 1);
    assert.strictEqual(gs.state, 'gameover', 'setup invariant: must have reached gameover via row-reach');
    assert.ok(gs.lives > 0, 'setup invariant: lives must still be positive for this path');
    const snapshot = { lives: gs.lives, score: gs.score, state: gs.state };

    for (let i = 0; i < 4; i++) {
      SI.Game.input.fire = true;
      // Attempt to score a kill on any still-alive alien - must not count.
      if (gs.aliens.length > 0) {
        gs.playerBullets = [coincidentBox(gs.aliens[0])];
      }
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      assertFrozen(gs, snapshot, `row-reach terminality, call ${i + 1}`);
    }
  }
);

// =======================================================================
// Alien fire: column chosen via SI.RNG.next(), deterministic per seed
// =======================================================================

const FIRE_BUDGET = 5000; // generous; each step is cheap arithmetic

add(
  'Alien fire determinism: two independent bundle loads, init({seed}) with the SAME seed, driven ' +
    'through an identical update() sequence, produce byte-identical alienBullets contents at every ' +
    'checkpoint step',
  () => {
    const CHECKPOINTS = [10, 100, 500, 1500, FIRE_BUDGET];

    function run(seed) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: 800, height: 600, seed });
      const snaps = [];
      let done = 0;
      for (const target of CHECKPOINTS) {
        step(SI, target - done);
        done = target;
        snaps.push(JSON.stringify(window.gameState.alienBullets));
      }
      return snaps;
    }

    const a = run(42);
    const b = run(42);
    assert.deepStrictEqual(
      b,
      a,
      'two runs seeded identically must produce identical alienBullets contents at every checkpoint'
    );
  }
);

add(
  `Alien fire occurs: over a ${FIRE_BUDGET}-step budget with a full alive alien grid, at least one ` +
    'alien bullet must appear in gameState.alienBullets at some point',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600, seed: 7 });
    let sawBullet = false;
    for (let i = 0; i < FIRE_BUDGET; i++) {
      step(SI, 1);
      if (window.gameState.alienBullets.length > 0) {
        sawBullet = true;
        break;
      }
    }
    assert.ok(sawBullet, `expected at least one alien bullet to appear within ${FIRE_BUDGET} steps`);
  }
);

add(
  "Alien fire actually consults SI.RNG.next() for column selection (not decorative): two DIFFERENT " +
    'seeds, driven through the identical update() sequence over a generous budget, must diverge in ' +
    'their alienBullets contents at least once - an implementation that always fires from a fixed ' +
    "column/alien regardless of the RNG stream (still trivially 'deterministic per seed') fails this",
  () => {
    function run(seed) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: 800, height: 600, seed });
      const snaps = [];
      for (let i = 0; i < FIRE_BUDGET; i++) {
        step(SI, 1);
        snaps.push(JSON.stringify(window.gameState.alienBullets));
      }
      return snaps;
    }

    const seedA = run(1);
    const seedB = run(2);
    const diverged = seedA.some((s, i) => s !== seedB[i]);
    assert.ok(
      diverged,
      'expected alienBullets contents to differ between two different seeds at least once over ' +
        `${FIRE_BUDGET} steps - fire-column selection must actually depend on SI.RNG.next()'s output`
    );
  }
);

// =======================================================================
// Regression: P1 (move / shoot / kill / score) must still hold
// =======================================================================

add('Regression P1: player clamp holds on every step across a sustained left/right hold', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  const shipWidth = window.gameState.player.width;
  const maxX = 800 - shipWidth;

  SI.Game.input.right = true;
  for (let i = 0; i < 300; i++) {
    step(SI, 1);
    const x = window.gameState.player.x;
    assert.ok(x >= 0 && x <= maxX, `player.x=${x} left [0,${maxX}] on step ${i}`);
  }
  assert.strictEqual(window.gameState.player.x, maxX, 'holding right must saturate x at width - shipWidth');
});

add('Regression P1: fire edge-trigger spawns exactly one player bullet per press-edge', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  SI.Game.input.fire = true;
  step(SI, 1);
  assert.strictEqual(window.gameState.playerBullets.length, 1, 'first press-edge must spawn exactly one bullet');
  step(SI, 3);
  assert.strictEqual(window.gameState.playerBullets.length, 1, 'holding fire must not spawn every frame');
});

add(
  'Regression P1: a player bullet exactly overlapping a known alien removes exactly that alien and ' +
    'scores exactly its own points value',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const target = gs.aliens[20];
    const originalLen = gs.aliens.length;
    const originalSum = pointsSum(gs.aliens);
    const scoreBefore = gs.score;

    gs.playerBullets = [coincidentBox(target)];
    step(SI, 1);

    assert.strictEqual(gs.aliens.length, originalLen - 1, 'exactly one alien must be removed');
    assert.strictEqual(gs.score, scoreBefore + target.points, "score must increase by exactly the target's points");
    assert.strictEqual(pointsSum(gs.aliens), originalSum - target.points, 'remaining alien points must drop exactly');
  }
);

// =======================================================================
// Regression: P2 (rigid march, edge-drop-and-reverse) must still hold
// =======================================================================

add('Regression P2: marchInterval is still pure, positive-integer, and strictly smaller at 1 than at 55', () => {
  const { SI } = loadBundle();
  const full = SI.Alien.marchInterval(55);
  const one = SI.Alien.marchInterval(1);
  assert.ok(Number.isInteger(full) && full > 0, `marchInterval(55)=${full} must be a positive integer`);
  assert.ok(Number.isInteger(one) && one > 0, `marchInterval(1)=${one} must be a positive integer`);
  assert.ok(one < full, `marchInterval(1)=${one} must be strictly less than marchInterval(55)=${full}`);
  for (const n of [55, 40, 25, 10, 1]) {
    assert.strictEqual(SI.Alien.marchInterval(n), SI.Alien.marchInterval(n), `marchInterval(${n}) must be pure`);
  }
});

add(
  'Regression P2: the alien grid still translates as a rigid block (identical per-step delta for ' +
    'every alien) on a wide screen with no edge contact',
  () => {
    const WIDE = 5_000_000;
    const { SI, window } = loadBundle();
    SI.Game.init({ width: WIDE, height: 600 });
    const gs = window.gameState;
    const before = gs.aliens.map((a) => ({ x: a.x, y: a.y }));

    const interval = SI.Alien.marchInterval(gs.aliens.length);
    step(SI, interval * 2 + 5);

    const after = gs.aliens.map((a) => ({ x: a.x, y: a.y }));
    const deltas = new Set(before.map((b, i) => `${after[i].x - b.x},${after[i].y - b.y}`));
    assert.strictEqual(deltas.size, 1, `every alive alien must share the same march delta, saw ${deltas.size} distinct`);
    assert.notStrictEqual([...deltas][0], '0,0', 'the grid must have actually moved over 2+ march intervals');
  }
);

add(
  'Regression P2: on edge contact the grid drops (y-only, uniform) and reverses horizontal direction ' +
    'on the very next march step',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 5_000_000, height: 600 });
    let gs = window.gameState;
    const minX = Math.min(...gs.aliens.map((a) => a.x));
    const maxX = Math.max(...gs.aliens.map((a) => a.x + a.width));
    const gridSpan = maxX - minX;

    const MARGIN = 2000;
    const width = gridSpan + MARGIN * 2;
    SI.Game.init({ width, height: 600 });
    gs = window.gameState;
    const curMinX = Math.min(...gs.aliens.map((a) => a.x));
    const targetMinX = (width - gridSpan) / 2;
    const shift = targetMinX - curMinX;
    for (const a of gs.aliens) a.x += shift;
    // This scan runs many thousands of steps to reach an edge; slice-04's
    // alien fire would otherwise plausibly drain lives to 0 (a REAL,
    // contract-mandated interaction, not a bug) well before the march gets
    // there. Isolate the march/edge-drop behavior under test from that
    // separate P3 mechanic the same way other fixtures isolate one concern
    // at a time - lives is not part of what this regression check asserts.
    gs.lives = Number.MAX_SAFE_INTEGER;

    const MAX_STEPS = 200000;
    let prev = gs.aliens.map((a) => ({ x: a.x, y: a.y }));
    let lastHorizDx = null;
    let dropSeen = false;
    let afterDropDx = null;

    for (let i = 0; i < MAX_STEPS; i++) {
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      const cur = gs.aliens.map((a) => ({ x: a.x, y: a.y }));
      const dxs = new Set(cur.map((c, idx) => c.x - prev[idx].x));
      const dys = new Set(cur.map((c, idx) => c.y - prev[idx].y));
      const dx = [...dxs][0];
      const dy = [...dys][0];
      prev = cur;
      if (dx === 0 && dy === 0) continue;

      if (!dropSeen) {
        if (dy !== 0) {
          dropSeen = true;
          assert.ok(dy > 0, 'edge-triggered drop must move the grid DOWN');
          assert.strictEqual(dx, 0, 'the drop event itself must be y-only');
        } else {
          lastHorizDx = Math.sign(dx);
        }
      } else {
        afterDropDx = dx;
        break;
      }
    }

    assert.ok(dropSeen, `no edge-triggered drop observed within ${MAX_STEPS} steps`);
    assert.ok(afterDropDx !== null && afterDropDx !== 0, 'a horizontal march event must follow the drop');
    assert.strictEqual(
      Math.sign(afterDropDx),
      -lastHorizDx,
      'horizontal direction must reverse on the march event following the drop'
    );
  }
);

// ---------------------------------------------------------------------
// build.js  -  registered ONLY when a sibling build.js exists at the
// derived specimen root. Under mutation testing the bundle lives in a bare
// temp dir with no build.js; skipping (not counting) these lets mutants be
// judged by the logic tests above, not by a spurious build failure.
// ---------------------------------------------------------------------

if (HAS_BUILD) {
  add(
    'build.js: produces dist/index.html + a working dist/game.js bundle exposing a full init -> ' +
      'alien-bullet-hit -> gameover smoke path',
    () => {
      const { indexPath, bundlePath } = runBuild(SPECIMEN_ROOT);
      assert.ok(fs.existsSync(indexPath), `build.js must produce ${indexPath}`);
      assert.ok(fs.existsSync(bundlePath), `build.js must produce ${bundlePath} (the STZ eval bundle)`);

      const html = fs.readFileSync(indexPath, 'utf8');
      assert.match(html, /<canvas[^>]*>/i, 'dist/index.html must contain a canvas element');

      const { SI, window } = loadBundle(bundlePath);
      assert.ok(SI, 'dist/game.js must define window.SI');
      assert.strictEqual(typeof SI.Game.init, 'function');
      assert.strictEqual(typeof SI.Game.update, 'function');

      SI.Game.init({ width: 800, height: 600, seed: 1 });
      const gs = window.gameState;
      const startLives = gs.lives;
      for (let i = 0; i < startLives; i++) {
        gs.alienBullets = [coincidentBox(gs.player)];
        SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      }
      assert.strictEqual(gs.lives, 0, 'shipped bundle must decrement lives to 0 across the driven hits');
      assert.strictEqual(gs.state, 'gameover', 'shipped bundle must reach gameover once lives hit 0');
    }
  );

  add(
    'build.js: dist/game.js concatenation order is rng < collision < config < loop < player < bullet ' +
      '< alien < game',
    () => {
      const { bundlePath } = runBuild(SPECIMEN_ROOT);
      const bundle = fs.readFileSync(bundlePath, 'utf8');
      const idx = {
        rng: bundle.indexOf('window.SI.RNG ='),
        collision: bundle.indexOf('window.SI.Collision ='),
        config: bundle.indexOf('window.SI.Config ='),
        loop: bundle.indexOf('window.SI.Loop ='),
        player: bundle.indexOf('window.SI.Player ='),
        bullet: bundle.indexOf('window.SI.Bullet ='),
        alien: bundle.indexOf('window.SI.Alien ='),
        game: bundle.indexOf('window.SI.Game ='),
      };
      for (const [name, i] of Object.entries(idx)) {
        assert.notStrictEqual(i, -1, `expected window.SI.${name[0].toUpperCase()}${name.slice(1)} = ... to appear in dist/game.js`);
      }
      assert.ok(idx.rng < idx.collision, 'rng before collision');
      assert.ok(idx.collision < idx.config, 'collision before config');
      assert.ok(idx.config < idx.loop, 'config before loop');
      assert.ok(idx.loop < idx.player, 'loop before player');
      assert.ok(idx.player < idx.bullet, 'player before bullet');
      assert.ok(idx.bullet < idx.alien, 'bullet before alien');
      assert.ok(idx.alien < idx.game, 'alien before game');
    }
  );

  add('build.js: requires only Node builtins (fs/path), per the zero-dependency contract', () => {
    const buildSrc = fs.readFileSync(path.join(SPECIMEN_ROOT, 'build.js'), 'utf8');
    const requireCalls = [...buildSrc.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    const allowed = new Set(['fs', 'path', 'node:fs', 'node:path']);
    for (const mod of requireCalls) {
      assert.ok(
        allowed.has(mod) || mod.startsWith('.'),
        `build.js requires disallowed module "${mod}" - only Node builtins fs/path are permitted`
      );
    }
  });
}

// ---------------------------------------------------------------------
// Runner: sync, results to STDERR, final stdout line is the JSON summary.
// ---------------------------------------------------------------------

let passed = 0;
const total = tests.length;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    process.stderr.write(`ok   - ${name}\n`);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    process.stderr.write(`FAIL - ${name}\n       ${msg.split('\n')[0]}\n`);
  }
}
if (!HAS_BUILD) {
  process.stderr.write('note - build.js tests skipped (no sibling build.js at specimen root)\n');
}

console.log(JSON.stringify({ passed, total, passRate: total ? passed / total : 0 }));
process.exit(passed < total ? 1 : 0);
