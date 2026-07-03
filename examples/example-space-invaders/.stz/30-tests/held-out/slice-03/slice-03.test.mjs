// SEALED suite for slice-03 (alien-grid-march, owns P2). Zero added
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
// call SI.Game.update(SI.Config.FIXED_TIMESTEP_MS) N times, observing
// window.gameState.aliens across steps, plus SI.Alien.marchInterval(n)
// called directly as a pure function.
//
// Anti-fragility: NOTHING here keys an alien's identity on (row,col)/index
// across a move-then-compare-position operation. Rigid-block checks compare
// each alien's OWN before/after delta at matching array indices within a
// single uninterrupted run where no alien dies in between (array order is
// therefore stable - nothing here ever fires a bullet or otherwise triggers
// SI.Game's own array-replacement/filter path mid-sweep), and every
// assertion is over movement-invariant aggregates (the SET of per-alien
// delta vectors, its size, and its sign) rather than raw (row,col)/index
// identity persisted across a legitimate relocation.
//
// Run locally: node slice-03.test.mjs [pathToBundle.js]

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

// Snapshot positions ONLY (x,y) at matching array indices - used purely to
// diff a single alien's own movement across an update() step, never to
// re-identify "which alien is which" across an array mutation. Built with a
// plain for-loop (not .map()) deliberately: `aliens` may be an array that
// lives inside a vm sandbox's own realm, and Array.prototype.map's
// ArraySpeciesCreate would inherit THAT realm's Array constructor for the
// result, which makes assert.deepStrictEqual spuriously report
// "same structure but not reference-equal" when comparing snapshots taken
// from two DIFFERENT vm sandboxes (two loadBundle() calls). A `[]` literal
// here always constructs in this module's own realm, so cross-bundle
// snapshot comparisons are genuinely structural.
function positions(aliens) {
  const out = [];
  for (let i = 0; i < aliens.length; i++) {
    out.push({ x: aliens[i].x, y: aliens[i].y });
  }
  return out;
}

const tests = [];
const add = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------
// SI.Alien.marchInterval(aliveCount) — TEST-FACING pure function
// ---------------------------------------------------------------------

add(
  'marchInterval: pure & deterministic across the full aliveCount domain 1..55 - every value is a ' +
    'positive integer, and calling it twice for the same n gives the same result',
  () => {
    const { SI } = loadBundle();
    for (let n = 1; n <= 55; n++) {
      const a = SI.Alien.marchInterval(n);
      const b = SI.Alien.marchInterval(n);
      assert.strictEqual(typeof a, 'number', `marchInterval(${n}) must return a number`);
      assert.ok(Number.isInteger(a), `marchInterval(${n})=${a} must be an integer`);
      assert.ok(a > 0, `marchInterval(${n})=${a} must be positive (a step count between moves)`);
      assert.strictEqual(a, b, `marchInterval(${n}) must be pure - calling it twice must return the same value`);
    }
  }
);

add(
  'marchInterval: monotonically non-increasing as aliveCount drops from 55 to 1 - swept over the ' +
    'full domain, called in a non-obvious (shuffled) order to rule out call-order-dependent caching',
  () => {
    const { SI } = loadBundle();
    // Call in reverse-then-forward order first, purely to rule out an
    // implementation that only behaves correctly if queried in one
    // particular call order (marchInterval is contracted as PURE).
    for (let n = 1; n <= 55; n++) SI.Alien.marchInterval(n);
    for (let n = 55; n >= 1; n--) SI.Alien.marchInterval(n);

    const values = [];
    for (let n = 55; n >= 1; n--) values.push(SI.Alien.marchInterval(n));
    for (let i = 1; i < values.length; i++) {
      assert.ok(
        values[i] <= values[i - 1],
        `marchInterval must be non-increasing as aliveCount drops: aliveCount=${55 - i} gave ` +
          `${values[i]} which is GREATER than aliveCount=${55 - i + 1}'s ${values[i - 1]}`
      );
    }
  }
);

add(
  'marchInterval: genuinely derived from aliveCount (not a constant that trivially satisfies ' +
    '"non-increasing") - interval at 1 alien remaining must be strictly LESS than interval at the ' +
    'full 55-alien grid',
  () => {
    const { SI } = loadBundle();
    const full = SI.Alien.marchInterval(55);
    const last = SI.Alien.marchInterval(1);
    assert.ok(
      last < full,
      `marchInterval(1)=${last} must be strictly less than marchInterval(55)=${full} - the contract ` +
        'requires the interval be "derived from remaining-alive-alien count" and "shrink as ... drops", ' +
        'which a count-ignoring constant function would fail while still technically being "non-increasing"'
    );
  }
);

// ---------------------------------------------------------------------
// Rigid-block translation
// ---------------------------------------------------------------------

add(
  'Rigid block: every alive alien moves by the IDENTICAL per-step delta - property-swept across ' +
    'several starting configurations (full grid and various post-kill survivor subsets), with a wide ' +
    'enough screen that no edge is touched during the sweep; alien identity fields (width/height/' +
    'points/row) are untouched by march, only x/y change',
  () => {
    const WIDE = 5_000_000; // no realistic per-step delta reaches an edge here
    const configs = [
      // [seed, survivorFraction-ish selector] - a mix of explicit and
      // LCG-driven random-subset configurations, per "verified across
      // multiple starting configs / after some aliens removed".
      { label: 'full-grid', keep: (aliens) => aliens },
      { label: 'every-other', keep: (aliens) => aliens.filter((_, i) => i % 2 === 0) },
      { label: 'single-alien', keep: (aliens) => aliens.slice(0, 1) },
      { label: 'lcg-seed-7', keep: (aliens) => lcgSubset(aliens, 7) },
      { label: 'lcg-seed-99991', keep: (aliens) => lcgSubset(aliens, 99991) },
    ];

    function lcgSubset(aliens, seed) {
      const next = makeLcg(seed);
      return aliens.filter(() => next() % 3 !== 0); // drop ~1/3 at random
    }

    for (const cfg of configs) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: WIDE, height: 600 });
      const gs = window.gameState;
      gs.aliens = cfg.keep(gs.aliens);
      assert.ok(gs.aliens.length > 0, `config ${cfg.label}: setup must leave at least one alien`);

      const shapeBefore = gs.aliens.map((a) => ({ w: a.width, h: a.height, points: a.points, row: a.row }));
      const before = positions(gs.aliens);

      const interval = SI.Alien.marchInterval(gs.aliens.length);
      step(SI, interval * 2 + 5); // comfortably covers >= 1 march event

      const after = positions(gs.aliens);
      assert.strictEqual(after.length, before.length, `config ${cfg.label}: march must not change alien count`);

      const deltaKeys = new Set(
        before.map((b, i) => `${after[i].x - b.x},${after[i].y - b.y}`)
      );
      assert.strictEqual(
        deltaKeys.size,
        1,
        `config ${cfg.label}: every alive alien must share the SAME (dx,dy) march delta (rigid block), ` +
          `saw ${deltaKeys.size} distinct deltas: ${[...deltaKeys].join(' | ')}`
      );
      const [onlyDelta] = deltaKeys;
      assert.notStrictEqual(
        onlyDelta,
        '0,0',
        `config ${cfg.label}: after ${interval * 2 + 5} steps (>= 1 full march interval) the grid must ` +
          'have moved (either horizontally or via an edge-triggered drop) - it did not move at all'
      );

      const shapeAfter = gs.aliens.map((a) => ({ w: a.width, h: a.height, points: a.points, row: a.row }));
      assert.deepStrictEqual(
        shapeAfter,
        shapeBefore,
        `config ${cfg.label}: march must only change x/y - width/height/points/row must be untouched`
      );
    }
  }
);

// ---------------------------------------------------------------------
// Determinism: call-count driven, never wall-clock/dt-magnitude driven
// ---------------------------------------------------------------------

add(
  'March is driven by update() call COUNT, never by the dt argument\'s magnitude - the same number of ' +
    'update() calls with an absurdly large dt produces the IDENTICAL final alien positions as with ' +
    'FIXED_TIMESTEP_MS',
  () => {
    const WIDE = 5_000_000;
    const N = 150;

    const a = loadBundle();
    a.SI.Game.init({ width: WIDE, height: 600 });
    for (let i = 0; i < N; i++) a.SI.Game.update(a.SI.Config.FIXED_TIMESTEP_MS);
    const posA = positions(a.window.gameState.aliens);

    const b = loadBundle();
    b.SI.Game.init({ width: WIDE, height: 600 });
    for (let i = 0; i < N; i++) b.SI.Game.update(999999); // absurdly large dt, same call count
    const posB = positions(b.window.gameState.aliens);

    assert.deepStrictEqual(
      posB,
      posA,
      'alien positions after N update() calls must be identical regardless of the dt argument passed - ' +
        'march must be driven by the internal accumulated-step counter (call count), never by dt magnitude'
    );
  }
);

add(
  'March is exactly reproducible: two independent fresh bundle loads driven through the identical ' +
    'input/update() sequence produce byte-identical alien positions at every checkpoint step',
  () => {
    const WIDE = 5_000_000;
    const CHECKPOINTS = [1, 5, 17, 50, 133];

    function run() {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: WIDE, height: 600, seed: 42 });
      const snaps = [];
      let doneSteps = 0;
      for (const target of CHECKPOINTS) {
        step(SI, target - doneSteps);
        doneSteps = target;
        snaps.push(positions(window.gameState.aliens));
      }
      return snaps;
    }

    const runA = run();
    const runB = run();
    assert.deepStrictEqual(
      runB,
      runA,
      'repeated update() call sequences must reproduce the march exactly - two independent runs given ' +
        'the identical sequence of update() calls must land on identical alien positions at every checkpoint'
    );
  }
);

// ---------------------------------------------------------------------
// Edge contact -> drop-by-rowStep + direction reversal on the very next
// march step (example-based, per strategy.md's E-vs-P split for this clause)
// ---------------------------------------------------------------------

add(
  'Edge contact: the whole grid drops (y-only, uniform, x unchanged) on the march event that would ' +
    'otherwise cross a screen edge, and the very next march event moves horizontally in the OPPOSITE ' +
    'direction from whatever direction was in effect before the drop',
  () => {
    const { SI, window } = loadBundle();

    // Learn the grid's own natural geometry with a huge width (no edge risk)
    // - START_X/GAP are internal to the specimen, never hardcoded here.
    SI.Game.init({ width: 5_000_000, height: 600 });
    let gs = window.gameState;
    const minX = Math.min(...gs.aliens.map((a) => a.x));
    const maxX = Math.max(...gs.aliens.map((a) => a.x + a.width));
    const gridSpan = maxX - minX;

    // Re-init with a width that leaves a large (~2000px) margin on BOTH
    // sides, then directly re-center the grid within it (TEST-FACING direct
    // gameState manipulation, same technique used for bullets in slice-02's
    // suite) - this makes the test's outcome independent of which direction
    // the specimen chooses to march first (not contracted), while still
    // guaranteeing the grid eventually reaches an edge either way.
    const MARGIN = 2000;
    const width = gridSpan + MARGIN * 2;
    SI.Game.init({ width, height: 600 });
    gs = window.gameState;
    const curMinX = Math.min(...gs.aliens.map((a) => a.x));
    const targetMinX = (width - gridSpan) / 2;
    const shift = targetMinX - curMinX;
    for (const a of gs.aliens) a.x += shift;

    const MAX_STEPS = 200000; // generous cap; each step is a cheap arithmetic pass
    let prev = positions(gs.aliens);
    let lastHorizDx = null;
    let dropSeen = false;
    let dropDy = null;
    let dropDxWasZero = null;
    let afterDropDx = null;

    for (let i = 0; i < MAX_STEPS; i++) {
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      const cur = positions(gs.aliens);
      const dxs = new Set(cur.map((c, idx) => c.x - prev[idx].x));
      const dys = new Set(cur.map((c, idx) => c.y - prev[idx].y));
      assert.strictEqual(dxs.size, 1, `step ${i}: rigid block violated mid-run, distinct x-deltas ${[...dxs]}`);
      assert.strictEqual(dys.size, 1, `step ${i}: rigid block violated mid-run, distinct y-deltas ${[...dys]}`);
      const dx = [...dxs][0];
      const dy = [...dys][0];
      prev = cur;

      if (dx === 0 && dy === 0) continue; // no march event this step

      if (!dropSeen) {
        if (dy !== 0) {
          dropSeen = true;
          dropDy = dy;
          dropDxWasZero = dx === 0;
        } else {
          lastHorizDx = Math.sign(dx);
        }
      } else {
        afterDropDx = dx;
        break;
      }
    }

    assert.ok(dropSeen, `no edge-triggered drop observed within ${MAX_STEPS} steps`);
    assert.ok(dropDy > 0, `edge-triggered drop must move the grid DOWN (dy>0), got dy=${dropDy}`);
    assert.ok(
      dropDxWasZero,
      'the drop event itself must be y-only - no horizontal shift on the same event that drops the grid'
    );
    assert.ok(
      lastHorizDx !== null,
      'setup invariant: expected at least one horizontal march event to be observed before the drop ' +
        '(the wide re-centered margin should guarantee this)'
    );
    assert.ok(afterDropDx !== null && afterDropDx !== 0, 'a horizontal march event must follow the drop');
    assert.strictEqual(
      Math.sign(afterDropDx),
      -lastHorizDx,
      `horizontal direction must reverse on the march event following the drop: pre-drop direction sign ` +
        `was ${lastHorizDx}, post-drop direction sign was ${Math.sign(afterDropDx)}`
    );
  }
);

// ---------------------------------------------------------------------
// Cadence actually coupled to SI.Alien.marchInterval (not decorative)
// ---------------------------------------------------------------------

add(
  'March cadence is actually driven by SI.Alien.marchInterval(aliveCount), not decoupled from it - a ' +
    'grid reduced to a single alien produces MORE march events than the full 55-alien grid over an ' +
    'identical, bounded update() step budget sized from the interval values the bundle itself reports',
  () => {
    const WIDE = 5_000_000;

    function countEvents(setupFn, budget) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: WIDE, height: 600 });
      const gs = window.gameState;
      setupFn(gs);
      let prev = positions(gs.aliens);
      let events = 0;
      for (let i = 0; i < budget; i++) {
        SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
        const cur = positions(gs.aliens);
        const moved = cur.some((c, idx) => c.x !== prev[idx].x || c.y !== prev[idx].y);
        if (moved) events += 1;
        prev = cur;
      }
      return events;
    }

    const { SI: probe } = loadBundle();
    const intervalFull = probe.Alien.marchInterval(55);
    const budget = intervalFull * 3;

    const countFull = countEvents((gs) => {}, budget);
    const countOne = countEvents((gs) => {
      gs.aliens = gs.aliens.slice(0, 1);
    }, budget);

    assert.ok(countFull >= 1, `sanity: expected at least one march event for the full grid over budget=${budget}`);
    assert.ok(
      countOne > countFull,
      `a single-alien grid must march measurably MORE often than the full 55-alien grid over the same ` +
        `${budget}-step budget (single-alien events=${countOne}, full-grid events=${countFull}) - if this ` +
        "fails, SI.Game's internal march cadence is not actually consulting SI.Alien.marchInterval(aliveCount)"
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
    'build.js: produces dist/index.html + a working dist/game.js bundle exposing SI.Game and ' +
      'SI.Alien.marchInterval with a full init -> march smoke path',
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
      assert.strictEqual(typeof SI.Alien.marchInterval, 'function', 'dist/game.js must expose SI.Alien.marchInterval');

      SI.Game.init({ width: 5_000_000, height: 600, seed: 1 });
      const before = positions(window.gameState.aliens);
      step(SI, SI.Alien.marchInterval(window.gameState.aliens.length) * 2 + 5);
      const after = positions(window.gameState.aliens);
      const moved = after.some((p, i) => p.x !== before[i].x || p.y !== before[i].y);
      assert.ok(moved, 'shipped bundle must actually march the grid over enough steps');
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
