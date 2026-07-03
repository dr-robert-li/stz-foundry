// SEALED suite for slice-02 (player-move-shoot-kill, owns P1). Zero added
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
// call SI.Game.update(SI.Config.FIXED_TIMESTEP_MS) N times, assert on
// window.gameState (=== SI.Game.state).
//
// Run locally: node slice-02.test.mjs [pathToBundle.js]

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

// Extracts a value-based, position-keyed snapshot of the alien grid. Safe
// here specifically because P1's alien grid is contractually STATIC (no
// march movement in this slice) - (row, x, y) cannot legitimately change
// within a single run, so it is a stable identity, not a mutable-position
// trap.
function alienSnapshot(aliens) {
  return aliens
    .map((a) => ({ row: a.row, x: a.x, y: a.y, points: a.points }))
    .sort((a, b) => (a.row - b.row) || (a.x - b.x));
}

function pointsSum(aliens) {
  return aliens.reduce((sum, a) => sum + a.points, 0);
}

// Small deterministic LCG for property-style sweeps, independent of the
// specimen's own SI.RNG.
function makeLcg(seed) {
  let s = BigInt(seed) || 1n;
  return function lcgNext() {
    s ^= s << 13n;
    s &= 0xffffffffffffffffn;
    s ^= s >> 7n;
    s ^= s << 17n;
    s &= 0xffffffffffffffffn;
    return Number(s % 1000n);
  };
}

const tests = [];
const add = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------
// SI.Game.init(): required gameState shape (TEST-FACING API)
// ---------------------------------------------------------------------

add('init(): populates required gameState shape across a sweep of width/height/seed', () => {
  const { SI, window } = loadBundle();
  const configs = [
    { width: 800, height: 600, seed: 1 },
    { width: 400, height: 300, seed: 42 },
    { width: 1200, height: 900, seed: 999999 },
    {}, // no opts at all must still work
  ];
  for (const opts of configs) {
    SI.Game.init(opts);
    const gs = window.gameState;
    assert.ok(gs, 'window.gameState must exist after init()');
    assert.strictEqual(gs.state, 'playing', `init(${JSON.stringify(opts)}) must set state to "playing"`);
    assert.strictEqual(gs.score, 0, 'score must start at 0');
    assert.ok(gs.player && typeof gs.player === 'object', 'player must be an object');
    for (const f of ['x', 'y', 'width', 'height']) {
      assert.strictEqual(typeof gs.player[f], 'number', `player.${f} must be a number`);
      assert.ok(Number.isFinite(gs.player[f]), `player.${f} must be finite`);
    }
    assert.ok(Array.isArray(gs.aliens), 'aliens must be an array');
    assert.strictEqual(gs.aliens.length, 55, 'a 5x11 grid must have exactly 55 aliens');
    assert.ok(Array.isArray(gs.playerBullets), 'playerBullets must be an array');
    assert.strictEqual(gs.playerBullets.length, 0, 'playerBullets must start empty');
    assert.ok(Array.isArray(gs.alienBullets), 'alienBullets must be an array');
    assert.strictEqual(gs.alienBullets.length, 0, 'alienBullets must start empty');
  }
});

add(
  'init(): alien grid is 5 rows x 11 cols, each alien has a numeric points field restricted to ' +
    '{10,20,30}, consistent within a row, using all three tiers',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const aliens = window.gameState.aliens;
    assert.strictEqual(aliens.length, 55);

    const byRow = new Map();
    for (const a of aliens) {
      assert.strictEqual(typeof a.points, 'number', 'every alien must have a numeric points field');
      assert.ok([10, 20, 30].includes(a.points), `alien points must be one of 10/20/30, got ${a.points}`);
      assert.strictEqual(typeof a.row, 'number', 'every alien must have a numeric row field');
      if (!byRow.has(a.row)) byRow.set(a.row, []);
      byRow.get(a.row).push(a.points);
    }

    assert.strictEqual(byRow.size, 5, `expected exactly 5 distinct rows, got ${byRow.size}`);
    const distinctTiers = new Set();
    for (const [row, pointsList] of byRow) {
      assert.strictEqual(pointsList.length, 11, `row ${row} must have exactly 11 aliens`);
      const rowTiers = new Set(pointsList);
      assert.strictEqual(rowTiers.size, 1, `row ${row} must use a single consistent points value, saw ${[...rowTiers]}`);
      distinctTiers.add(pointsList[0]);
    }
    // A discriminating check: an implementation that awards a flat value to
    // every alien regardless of row (collapsing the "10/20/30 by row"
    // contract clause) would fail this - all three tiers must appear.
    assert.deepStrictEqual(
      [...distinctTiers].sort((a, b) => a - b),
      [10, 20, 30],
      `expected all three row point tiers {10,20,30} to appear across the 5 rows, saw ${[...distinctTiers]}`
    );
  }
);

add('init(): player starts horizontally centered for a sweep of widths', () => {
  const { SI, window } = loadBundle();
  for (const width of [200, 500, 800, 1600]) {
    SI.Game.init({ width, height: 600 });
    const p = window.gameState.player;
    const center = p.x + p.width / 2;
    assert.ok(
      Math.abs(center - width / 2) <= 1,
      `player not centered for width=${width}: player center ${center}, screen center ${width / 2}`
    );
  }
});

add('window.gameState is the exact same live object as SI.Game.state, before and after update()', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  assert.strictEqual(window.gameState, SI.Game.state, 'window.gameState must === SI.Game.state right after init()');
  step(SI, 3);
  assert.strictEqual(
    window.gameState,
    SI.Game.state,
    'window.gameState must remain the SAME object reference after update() (mutated in place, never reassigned)'
  );
});

add('init(): re-initializing resets score/aliens/bullets even after prior mutation', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  const target = window.gameState.aliens[10];
  window.gameState.playerBullets = [{ x: target.x, y: target.y, width: target.width, height: target.height }];
  step(SI, 1);
  assert.ok(window.gameState.score > 0, 'setup: expected score to have increased before re-init');
  assert.ok(window.gameState.aliens.length < 55, 'setup: expected an alien to have been removed before re-init');

  SI.Game.init({ width: 800, height: 600 });
  assert.strictEqual(window.gameState.score, 0, 're-init must reset score to 0');
  assert.strictEqual(window.gameState.aliens.length, 55, 're-init must restore a full 55-alien grid');
  assert.strictEqual(window.gameState.playerBullets.length, 0, 're-init must clear playerBullets');
});

// ---------------------------------------------------------------------
// Player movement clamp
// ---------------------------------------------------------------------

add(
  'Player clamp: holding left/right drives x to exactly the [0, width-player.width] boundary and ' +
    'never outside it on ANY intermediate step, swept across several widths/heights',
  () => {
    const { SI, window } = loadBundle();
    const N = 400;
    for (const [width, height] of [[300, 400], [800, 600], [1500, 900]]) {
      SI.Game.init({ width, height });
      const shipWidth = window.gameState.player.width;
      const maxX = width - shipWidth;

      SI.Game.input.left = false;
      SI.Game.input.right = true;
      for (let i = 0; i < N; i++) {
        step(SI, 1);
        const x = window.gameState.player.x;
        assert.ok(x >= 0 && x <= maxX, `width=${width}: player.x=${x} left [0,${maxX}] on step ${i}`);
      }
      assert.strictEqual(
        window.gameState.player.x,
        maxX,
        `width=${width}: holding right for ${N} steps must saturate x at exactly width-shipWidth`
      );

      SI.Game.input.right = false;
      SI.Game.input.left = true;
      for (let i = 0; i < N; i++) {
        step(SI, 1);
        const x = window.gameState.player.x;
        assert.ok(x >= 0 && x <= maxX, `width=${width}: player.x=${x} left [0,${maxX}] on step ${i}`);
      }
      assert.strictEqual(
        window.gameState.player.x,
        0,
        `width=${width}: holding left for ${N} steps must saturate x at exactly 0`
      );
    }
  }
);

add(
  'update(dt): advances exactly one fixed step regardless of the dt argument passed - the same ' +
    'single-step movement delta results whether dt is FIXED_TIMESTEP_MS or a huge value',
  () => {
    const a = loadBundle();
    a.SI.Game.init({ width: 800, height: 600 });
    const x0a = a.window.gameState.player.x;
    a.SI.Game.input.right = true;
    a.SI.Game.update(a.SI.Config.FIXED_TIMESTEP_MS);
    const delta1 = a.window.gameState.player.x - x0a;

    const b = loadBundle();
    b.SI.Game.init({ width: 800, height: 600 });
    const x0b = b.window.gameState.player.x;
    b.SI.Game.input.right = true;
    b.SI.Game.update(999999); // absurdly large dt
    const delta2 = b.window.gameState.player.x - x0b;

    assert.ok(delta1 > 0, 'holding right for one update() must move the player');
    assert.strictEqual(
      delta1,
      delta2,
      `a single update() call must move the player by the same fixed-step amount regardless of the ` +
        `dt argument (got ${delta1} for FIXED_TIMESTEP_MS vs ${delta2} for dt=999999) - update(dt) must ` +
        `advance exactly one fixed step, not scale movement by dt`
    );
  }
);

// ---------------------------------------------------------------------
// Fire: edge-triggered bullet spawn
// ---------------------------------------------------------------------

add(
  'Fire: first press-edge spawns exactly one player bullet; holding fire across further updates ' +
    'does not spawn more',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    assert.strictEqual(window.gameState.playerBullets.length, 0);

    SI.Game.input.fire = true;
    step(SI, 1);
    assert.strictEqual(
      window.gameState.playerBullets.length,
      1,
      'setting fire=true then one update() must add EXACTLY ONE playerBullets entry'
    );

    // Still holding fire=true (no release in between) across several more
    // steps must not spawn additional bullets.
    step(SI, 3);
    assert.strictEqual(
      window.gameState.playerBullets.length,
      1,
      'holding fire=true across further update() calls must not spawn every frame'
    );

    const b = window.gameState.playerBullets[0];
    for (const f of ['x', 'y', 'width', 'height']) {
      assert.strictEqual(typeof b[f], 'number', `spawned bullet.${f} must be a number`);
      assert.ok(Number.isFinite(b[f]), `spawned bullet.${f} must be finite`);
    }
  }
);

add('Fire: release then re-press spawns exactly one more bullet (two presses -> two bullets total)', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });

  SI.Game.input.fire = true;
  step(SI, 1);
  assert.strictEqual(window.gameState.playerBullets.length, 1);

  SI.Game.input.fire = false;
  step(SI, 1);
  assert.strictEqual(
    window.gameState.playerBullets.length,
    1,
    'releasing fire must not spawn a bullet on the release step'
  );

  SI.Game.input.fire = true;
  step(SI, 1);
  assert.strictEqual(
    window.gameState.playerBullets.length,
    2,
    'a second press-edge (release then press again) must spawn exactly one more bullet'
  );
});

add(
  'Fire: property sweep - total bullets spawned across a random press/release sequence equals ' +
    'exactly the number of press-edges (false->true transitions), never one per held frame',
  () => {
    // Huge height + few steps: keeps any spawned bullet nowhere near the top
    // of the screen or the (irrelevant here) alien grid, so despawn/hit
    // side-effects can't confound the spawn count for ANY plausible bullet
    // speed a correct implementation might choose (speed is not part of the
    // contract). ponytail: bounded-but-generous safety margin, not a proof.
    const HEIGHT = 20000;
    const STEPS = 6;
    for (const seed of [7, 12345, 2463534242, 88172645463325252n]) {
      const next = makeLcg(seed);
      const { SI, window } = loadBundle();
      SI.Game.init({ width: 800, height: HEIGHT });
      SI.Game.input.fire = false;

      let prevFire = false;
      let expectedEdges = 0;
      for (let i = 0; i < STEPS; i++) {
        const fireNow = next() % 2 === 0;
        SI.Game.input.fire = fireNow;
        if (fireNow && !prevFire) expectedEdges += 1;
        prevFire = fireNow;
        step(SI, 1);
      }

      assert.strictEqual(
        window.gameState.playerBullets.length,
        expectedEdges,
        `seed ${seed}: expected exactly ${expectedEdges} spawned bullets for the press/release sequence`
      );
    }
  }
);

// ---------------------------------------------------------------------
// Collision: bullet-vs-alien via SI.Collision.aabbOverlap
// ---------------------------------------------------------------------

add(
  'Collision hit: a player bullet exactly overlapping a known alien removes exactly that alien and ' +
    "increases score by exactly that alien's own points value, leaving every other alien untouched " +
    '(sum-of-points invariant) - swept across a representative alien from each of the 5 rows',
  () => {
    const { SI, window } = loadBundle();
    for (let row = 0; row < 5; row++) {
      SI.Game.init({ width: 800, height: 600 });
      const gs = window.gameState;
      const target = gs.aliens.find((a) => a.row === row);
      assert.ok(target, `expected an alien in row ${row}`);

      const originalSnapshot = alienSnapshot(gs.aliens);
      const originalSum = pointsSum(gs.aliens);
      const originalLen = gs.aliens.length;
      const scoreBefore = gs.score;

      // Fixture bullet placed exactly coincident with the target alien's
      // box (own field values, not hardcoded coordinates) - guarantees
      // overlap regardless of the specimen's straight-line bullet speed.
      gs.playerBullets = [{ x: target.x, y: target.y, width: target.width, height: target.height }];
      step(SI, 1);

      assert.strictEqual(
        gs.aliens.length,
        originalLen - 1,
        `row ${row}: exactly one alien must be removed`
      );
      assert.strictEqual(
        gs.score,
        scoreBefore + target.points,
        `row ${row}: score must increase by exactly the hit alien's own points value (${target.points})`
      );
      assert.strictEqual(
        pointsSum(gs.aliens),
        originalSum - target.points,
        `row ${row}: total remaining alien points must drop by exactly the hit alien's points`
      );

      const remainingSnapshot = alienSnapshot(gs.aliens);
      const expectedSnapshot = originalSnapshot.filter(
        (a) => !(a.row === target.row && a.x === target.x && a.y === target.y)
      );
      assert.deepStrictEqual(
        remainingSnapshot,
        expectedSnapshot,
        `row ${row}: the removed alien must be specifically the one the bullet overlapped, every other ` +
          'alien (static grid, no march movement in this slice) must remain exactly as it was'
      );
    }
  }
);

add('Collision miss: a player bullet nowhere near any alien leaves aliens and score untouched', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  const gs = window.gameState;
  const originalSnapshot = alienSnapshot(gs.aliens);
  const originalLen = gs.aliens.length;
  const scoreBefore = gs.score;

  gs.playerBullets = [{ x: -999999, y: -999999, width: 1, height: 1 }];
  step(SI, 1);

  assert.strictEqual(gs.aliens.length, originalLen, 'a non-overlapping bullet must not remove any alien');
  assert.strictEqual(gs.score, scoreBefore, 'a non-overlapping bullet must not change score');
  assert.deepStrictEqual(
    alienSnapshot(gs.aliens),
    originalSnapshot,
    'the alien grid must be exactly unchanged when nothing was hit'
  );
});

add(
  "SI.Collision.aabbOverlap (as shipped in this slice's bundle) still excludes exact edge-touch and " +
    'reports true on full containment/overlap, using this slice\'s own alien box dimensions',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const a = window.gameState.aliens[0];
    const box = { x: a.x, y: a.y, w: a.width, h: a.height };

    // Full coincidence -> true.
    assert.strictEqual(SI.Collision.aabbOverlap(box, { ...box }), true, 'a fully coincident box must overlap');

    // Exact right-edge touch (shared boundary, zero-area intersection) -> false.
    const rightTouch = { x: box.x + box.w, y: box.y, w: box.w, h: box.h };
    assert.strictEqual(
      SI.Collision.aabbOverlap(box, rightTouch),
      false,
      'edge-touching boxes must not be reported as overlapping'
    );
    assert.strictEqual(SI.Collision.aabbOverlap(rightTouch, box), false, 'aabbOverlap must be symmetric');

    // Exact bottom-edge touch -> false.
    const bottomTouch = { x: box.x, y: box.y + box.h, w: box.w, h: box.h };
    assert.strictEqual(SI.Collision.aabbOverlap(box, bottomTouch), false);
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
    'build.js: produces dist/index.html + a working dist/game.js bundle exposing SI.Game with a ' +
      'full init -> fire -> kill smoke path',
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
      assert.ok(SI.Game.input && typeof SI.Game.input === 'object');

      SI.Game.init({ width: 800, height: 600, seed: 1 });
      assert.strictEqual(window.gameState.aliens.length, 55);

      const target = window.gameState.aliens[5];
      const targetPoints = target.points;
      window.gameState.playerBullets = [
        { x: target.x, y: target.y, width: target.width, height: target.height },
      ];
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      assert.strictEqual(window.gameState.aliens.length, 54, 'shipped bundle must remove a hit alien');
      assert.strictEqual(window.gameState.score, targetPoints, 'shipped bundle must score the exact hit value');
    }
  );

  add(
    'build.js: dist/game.js concatenation order is rng < collision < config < loop < player < bullet ' +
      '< alien < game',
    () => {
      const { bundlePath } = runBuild(SPECIMEN_ROOT);
      const bundle = fs.readFileSync(bundlePath, 'utf8');
      // Match the actual module-defining ASSIGNMENT, not a bare substring -
      // e.g. loop.js's own header comment mentions "SI.Game.update(dt)"
      // long before game.js is concatenated, which would false-positive a
      // naive indexOf('SI.Game') into looking like game.js came first.
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
