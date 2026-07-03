// SEALED suite for slice-01 (foundation-scaffold). Zero added dependencies.
//
// The STZ bridge's runSealed does spawnSync("node", [suite, impl]) and
// parses ONLY the LAST non-empty stdout line as JSON of shape
// { passed, total, passRate }. node:test's TAP ordering isn't guaranteed
// last, so this suite uses a tiny inline synchronous runner instead:
// per-test results go to STDERR; the final stdout statement is exactly
// the JSON summary and nothing follows it.
//
// The implementation is passed as process.argv[2]: a SINGLE readable JS
// file, the concatenated bundle emitted by the specimen's build.js (src
// modules in ADR-004 dependency order, attached to window.SI, no HTML).
// The bridge measures V8 coverage/mutation by reading that one file, so
// the suite loads exactly it (filename set to its absolute path so
// NODE_V8_COVERAGE attributes coverage to the bundle).
//
// Impl resolution order:
//   1. process.argv[2]                        -> path to a bundle .js file
//   2. STZ_SPECIMEN_DIR env (a specimen ROOT) -> <root>/dist/game.js
//   3. default: this suite's sealed reference (built on the fly)
//
// The specimen ROOT (needed to run build.js and inspect dist/index.html)
// is derived as dirname(dirname(bundlePath)). Mutation testing reruns this
// suite against a bare mutated bundle in a temp dir where NO build.js
// exists at that derived root; in that case the build tests are SKIPPED
// (not registered, not counted) so mutants are judged by the logic tests
// (rng/collision/config/loop) that DO run against the loaded bundle.
//
// The bundle is loaded into a Node vm.Context whose `window` IS the context
// global object (window === globalThis, exactly like a browser), so a
// specimen's `window.SI = window.SI || {}` then bare `SI.Foo = {...}`
// (ADR-001) resolves. Loading the whole bundle is equivalent to loading the
// 4 src files in order, since the bundle is their concatenation.
//
// Run locally: node slice-01.test.mjs [pathToBundle.js]

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
  // Default: build the sealed reference and point at its bundle.
  const refRoot = path.join(__dirname, 'reference');
  execFileSync(process.execPath, ['build.js'], { cwd: refRoot, stdio: 'pipe' });
  return path.join(refRoot, 'dist', 'game.js');
}

const IMPL = resolveImpl();                             // <root>/dist/game.js
const SPECIMEN_ROOT = path.dirname(path.dirname(IMPL)); // <root>
const HAS_BUILD = fs.existsSync(path.join(SPECIMEN_ROOT, 'build.js'));

// ---------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------

/**
 * Loads the concatenated bundle (IMPL by default) into a fresh vm context
 * whose global object doubles as `window`, plus a controllable fake
 * requestAnimationFrame / performance clock for the loop test. Fresh
 * context per call, so no cross-test contamination.
 */
function loadBundle(bundlePath = IMPL) {
  const clockState = { now: 0 };
  const rafState = { callback: null, callCount: 0 };

  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, like a real browser
  sandbox.requestAnimationFrame = (cb) => {
    rafState.callback = cb;
    rafState.callCount += 1;
    return rafState.callCount;
  };
  sandbox.performance = { now: () => clockState.now };
  sandbox.console = console;

  vm.createContext(sandbox);
  const code = fs.readFileSync(bundlePath, 'utf8');
  vm.runInContext(code, sandbox, { filename: path.resolve(bundlePath) });

  return { SI: sandbox.SI, window: sandbox.window, rafState, clockState };
}

function runBuild(root) {
  execFileSync(process.execPath, ['build.js'], { cwd: root, stdio: 'pipe' });
  const distDir = path.join(root, 'dist');
  return {
    indexPath: path.join(distDir, 'index.html'),
    bundlePath: path.join(distDir, 'game.js'),
  };
}

/** Recursively collects every numeric value reachable from `value`. */
function collectNumbers(value, seen = new Set(), depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') {
    return typeof value === 'number' ? [value] : [];
  }
  if (seen.has(value)) return [];
  seen.add(value);
  let out = [];
  for (const v of Object.values(value)) {
    out = out.concat(collectNumbers(v, seen, depth + 1));
  }
  return out;
}

// Small deterministic LCG for property-style sweeps, independent of the
// specimen's own SI.RNG (collision.js must not depend on rng.js).
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

// Test registry: each entry is { name, fn }. fn throws on failure.
const tests = [];
const add = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------
// SI.RNG
// ---------------------------------------------------------------------

add('RNG: next() always returns a finite number in [0, 1) across a sweep of seeds', () => {
  const { SI } = loadBundle();
  for (const seedVal of [0, 1, 2, 42, 12345, 999999, 2 ** 31 - 1]) {
    SI.RNG.seed(seedVal);
    for (let i = 0; i < 100; i++) {
      const v = SI.RNG.next();
      assert.strictEqual(typeof v, 'number');
      assert.ok(Number.isFinite(v), `seed ${seedVal}: next() returned non-finite ${v}`);
      assert.ok(v >= 0 && v < 1, `seed ${seedVal}: next() = ${v} outside [0,1)`);
    }
  }
});

add('RNG: re-seeding with the same value reproduces an identical sequence', () => {
  const { SI } = loadBundle();
  SI.RNG.seed(777);
  const seq1 = Array.from({ length: 30 }, () => SI.RNG.next());
  SI.RNG.seed(777);
  const seq2 = Array.from({ length: 30 }, () => SI.RNG.next());
  assert.deepStrictEqual(seq2, seq1, 'seeding with the same value must reproduce the same sequence');

  // Also true after intervening draws under a different seed in between -
  // seed() must fully reset generator state, not just perturb it.
  SI.RNG.seed(1);
  SI.RNG.next();
  SI.RNG.next();
  SI.RNG.seed(777);
  const seq3 = Array.from({ length: 30 }, () => SI.RNG.next());
  assert.deepStrictEqual(seq3, seq1, 're-seeding must reset generator state regardless of prior draws');
});

add('RNG: different seeds diverge (sequence is seed-dependent, not a fixed/ignored-seed stub)', () => {
  const { SI } = loadBundle();
  const seeds = [1, 2, 42, 1000, 999999, 7, 8675309];
  const sequences = seeds.map((s) => {
    SI.RNG.seed(s);
    return Array.from({ length: 10 }, () => SI.RNG.next());
  });
  for (let i = 0; i < sequences.length; i++) {
    for (let j = i + 1; j < sequences.length; j++) {
      assert.notDeepStrictEqual(
        sequences[i],
        sequences[j],
        `seed ${seeds[i]} and seed ${seeds[j]} produced an identical 10-draw sequence`
      );
    }
  }
});

// ---------------------------------------------------------------------
// SI.Collision.aabbOverlap
// ---------------------------------------------------------------------

add('Collision: overlapping rectangles report true, symmetrically', () => {
  const { SI } = loadBundle();
  const a = { x: 0, y: 0, w: 10, h: 4 };
  const b = { x: 5, y: 1, w: 10, h: 4 };
  assert.strictEqual(SI.Collision.aabbOverlap(a, b), true);
  assert.strictEqual(SI.Collision.aabbOverlap(b, a), true);
});

add('Collision: fully separate rectangles (x gap, y gap, both) report false', () => {
  const { SI } = loadBundle();
  const a = { x: 0, y: 0, w: 10, h: 4 };
  const xGap = { x: 21, y: 0, w: 10, h: 4 };
  const yGap = { x: 0, y: 20, w: 10, h: 4 };
  const bothGap = { x: 21, y: 20, w: 10, h: 4 };
  for (const b of [xGap, yGap, bothGap]) {
    assert.strictEqual(SI.Collision.aabbOverlap(a, b), false);
    assert.strictEqual(SI.Collision.aabbOverlap(b, a), false);
  }
});

add('Collision: edge-touching boxes (shared boundary only) do NOT overlap', () => {
  const { SI } = loadBundle();
  const a = { x: 0, y: 0, w: 10, h: 6 };
  const rightTouch = { x: 10, y: 0, w: 10, h: 6 }; // a.right === b.left
  const leftTouch = { x: -10, y: 0, w: 10, h: 6 }; // a.left === b.right
  const bottomTouch = { x: 0, y: 6, w: 10, h: 6 }; // a.bottom === b.top
  const topTouch = { x: 0, y: -6, w: 10, h: 6 }; // a.top === b.bottom
  const cornerTouch = { x: 10, y: 6, w: 10, h: 6 }; // touch at one point only
  for (const b of [rightTouch, leftTouch, bottomTouch, topTouch, cornerTouch]) {
    assert.strictEqual(
      SI.Collision.aabbOverlap(a, b),
      false,
      `edge-touch must be excluded for ${JSON.stringify(b)}`
    );
    assert.strictEqual(SI.Collision.aabbOverlap(b, a), false);
  }
});

add('Collision: containment (one box fully inside another) reports true', () => {
  const { SI } = loadBundle();
  const outer = { x: 0, y: 0, w: 20, h: 20 };
  const inner = { x: 5, y: 5, w: 4, h: 4 };
  assert.strictEqual(SI.Collision.aabbOverlap(outer, inner), true);
  assert.strictEqual(SI.Collision.aabbOverlap(inner, outer), true);
});

add('Collision: overlap on only one axis (not both) reports false', () => {
  const { SI } = loadBundle();
  const a = { x: 0, y: 0, w: 10, h: 4 };
  const xOnlyOverlap = { x: 5, y: 100, w: 10, h: 4 };
  const yOnlyOverlap = { x: 100, y: 1, w: 10, h: 4 };
  assert.strictEqual(SI.Collision.aabbOverlap(a, xOnlyOverlap), false);
  assert.strictEqual(SI.Collision.aabbOverlap(a, yOnlyOverlap), false);
});

add('Collision: property sweep - overlap is symmetric over many non-square box pairs', () => {
  const { SI } = loadBundle();
  const next = makeLcg(88172645463325252n);
  for (let i = 0; i < 300; i++) {
    const a = { x: next() - 500, y: next() - 500, w: 1 + (next() % 40), h: 1 + (next() % 15) };
    const b = { x: next() - 500, y: next() - 500, w: 1 + (next() % 40), h: 1 + (next() % 15) };
    assert.strictEqual(
      SI.Collision.aabbOverlap(a, b),
      SI.Collision.aabbOverlap(b, a),
      `asymmetric result for ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
    );
  }
});

add('Collision: property sweep - exact edge-touch is excluded across varied non-square sizes', () => {
  const { SI } = loadBundle();
  const next = makeLcg(2463534242n);
  for (let i = 0; i < 100; i++) {
    const w = 1 + (next() % 40);
    const h = 1 + (next() % 15);
    const ox = next() - 500;
    const oy = next() - 500;
    const a = { x: ox, y: oy, w, h };
    const rightTouch = { x: ox + w, y: oy, w: 1 + (next() % 40), h: 1 + (next() % 15) };
    const bottomTouch = { x: ox, y: oy + h, w: 1 + (next() % 40), h: 1 + (next() % 15) };
    assert.strictEqual(SI.Collision.aabbOverlap(a, rightTouch), false);
    assert.strictEqual(SI.Collision.aabbOverlap(a, bottomTouch), false);
  }
});

// ---------------------------------------------------------------------
// SI.Config
// ---------------------------------------------------------------------

add('Config: required constants exist with exact expected values', () => {
  const { SI } = loadBundle();
  const cfg = SI.Config;
  assert.ok(cfg && typeof cfg === 'object', 'SI.Config must exist and be an object');

  // These two names are given verbatim by the standards (ADR-002/
  // conventions.md cite "FIXED_TIMESTEP_MS" and "ALIEN_ROWS" literally as
  // the canonical constant names) so they're checked by exact key.
  assert.strictEqual(typeof cfg.FIXED_TIMESTEP_MS, 'number');
  assert.ok(cfg.FIXED_TIMESTEP_MS > 0, 'FIXED_TIMESTEP_MS must be a positive number');
  assert.ok(
    Math.abs(cfg.FIXED_TIMESTEP_MS - 1000 / 60) < 1,
    `FIXED_TIMESTEP_MS expected ~16.667ms, got ${cfg.FIXED_TIMESTEP_MS}`
  );
  assert.strictEqual(cfg.ALIEN_ROWS, 5, 'ALIEN_ROWS must be exactly 5 (5x11 grid)');

  // The remaining constants (grid columns, starting lives, point values,
  // UFO bonus range) are named only conceptually by the contract, not by
  // exact key - so they're checked by exact value, tolerant of key naming:
  // every one of these literal numbers must be reachable in SI.Config.
  const allNumbers = collectNumbers(cfg);
  for (const expected of [11, 3, 10, 20, 30, 50, 300]) {
    assert.ok(
      allNumbers.includes(expected),
      `expected the value ${expected} to appear somewhere in SI.Config (grid 5x11 / starting lives 3 / ` +
        `points 10-20-30 / UFO bonus 50-300), found values: ${JSON.stringify(allNumbers)}`
    );
  }
});

// ---------------------------------------------------------------------
// SI.Loop (fixed-timestep accumulator)
// ---------------------------------------------------------------------

add(
  'Loop: drives SI.Game.update in whole FIXED_TIMESTEP_MS increments, carries the remainder ' +
    'across frames, caps huge deltas, and draws exactly once per rAF frame',
  () => {
    const { SI, window, rafState, clockState } = loadBundle();
    assert.strictEqual(typeof SI.Loop.start, 'function');

    const STEP = SI.Config.FIXED_TIMESTEP_MS;
    assert.ok(STEP > 0);

    const updateCalls = [];
    let drawCalls = 0;
    window.SI.Game = { update: (dt) => updateCalls.push(dt) };
    window.SI.Renderer = { draw: () => { drawCalls += 1; } };

    clockState.now = 0;
    SI.Loop.start();
    assert.ok(
      typeof rafState.callback === 'function',
      'SI.Loop.start() must register a requestAnimationFrame callback'
    );
    const registrationsAfterStart = rafState.callCount;

    // Frame A: t=0. The fake clock and the passed rAF timestamp both read 0
    // here, so the elapsed delta is unambiguously 0 no matter whether an
    // implementation baselines "last time" at start()-call-time or at
    // first-callback-time.
    clockState.now = 0;
    rafState.callback(0);
    assert.strictEqual(updateCalls.length, 0, 'no time has elapsed yet; update() must not fire');
    assert.strictEqual(drawCalls, 1, 'draw() must fire once per rAF frame, including the first');
    assert.ok(
      rafState.callCount > registrationsAfterStart,
      'the loop must reschedule itself via requestAnimationFrame each frame'
    );

    // Frame B: +2.5 steps -> exactly 2 update() calls, 0.5-step remainder.
    let t = 2.5 * STEP;
    clockState.now = t;
    rafState.callback(t);
    assert.strictEqual(updateCalls.length, 2, 'floor(2.5) = 2 update() calls expected this frame');
    assert.strictEqual(drawCalls, 2);

    // Frame C: +0.6 step -> combined with the carried 0.5-step remainder is
    // 1.1 steps -> exactly 1 more update(). A non-accumulating impl (fresh
    // floor(delta/step) every frame, no carry) would compute floor(0.6) = 0
    // here and diverge.
    t += 0.6 * STEP;
    clockState.now = t;
    rafState.callback(t);
    assert.strictEqual(
      updateCalls.length,
      3,
      'the 0.5-step remainder must carry into this frame (accumulator pattern)'
    );
    assert.strictEqual(drawCalls, 3);

    // Frame D: +10000ms (huge gap, e.g. a backgrounded tab) -> must be
    // capped at 3*FIXED_TIMESTEP_MS before accumulating, not produce
    // hundreds of update() calls (spiral-of-death guard).
    t += 10000;
    clockState.now = t;
    rafState.callback(t);
    assert.strictEqual(
      updateCalls.length,
      6,
      'huge delta must be capped at 3*FIXED_TIMESTEP_MS, giving exactly 3 more update() calls here'
    );
    assert.strictEqual(drawCalls, 4, 'draw() must still fire exactly once for this frame');

    for (const dt of updateCalls) {
      assert.strictEqual(dt, STEP, 'SI.Game.update must always be called with exactly FIXED_TIMESTEP_MS');
    }
  }
);

// ---------------------------------------------------------------------
// build.js  -  registered ONLY when a sibling build.js exists at the
// derived specimen root. Under mutation testing the bundle lives in a bare
// temp dir with no build.js; skipping (not counting) these lets mutants be
// judged by the logic tests above, not by a spurious build failure.
// ---------------------------------------------------------------------

if (HAS_BUILD) {
  add('build.js: produces dist/index.html (canvas + minimal CSS + ADR-003 gameState stub) and a working dist/game.js bundle', () => {
    const { indexPath, bundlePath } = runBuild(SPECIMEN_ROOT);
    assert.ok(fs.existsSync(indexPath), `build.js must produce ${indexPath}`);
    assert.ok(fs.existsSync(bundlePath), `build.js must produce ${bundlePath} (the STZ eval bundle)`);

    const html = fs.readFileSync(indexPath, 'utf8');
    assert.match(html, /<canvas[^>]*>/i, 'dist/index.html must contain a canvas element');
    assert.match(html, /<style[^>]*>/i, 'dist/index.html must contain minimal CSS');

    // The shipped bundle must be a genuinely working artifact, not just
    // concatenated text: load dist/game.js in a fresh sandboxed window.
    const { SI } = loadBundle(bundlePath);
    assert.ok(SI, 'dist/game.js must define window.SI');
    assert.strictEqual(typeof SI.RNG.next, 'function');
    assert.strictEqual(typeof SI.Collision.aabbOverlap, 'function');
    assert.strictEqual(typeof SI.Config.FIXED_TIMESTEP_MS, 'number');
    assert.strictEqual(typeof SI.Loop.start, 'function');

    SI.RNG.seed(1);
    const v = SI.RNG.next();
    assert.ok(v >= 0 && v < 1);
    assert.strictEqual(
      SI.Collision.aabbOverlap({ x: 0, y: 0, w: 5, h: 5 }, { x: 5, y: 0, w: 5, h: 5 }),
      false,
      'the shipped bundle must still exclude edge-touch'
    );

    // The ADR-003 gameState stub lives in index.html; eval its inline
    // <script> to read it (window === globalThis in the sandbox).
    const scriptSrc = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1])
      .join('\n');
    assert.ok(scriptSrc.length > 0, 'dist/index.html must contain an inline <script> block');
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.console = console;
    vm.createContext(sandbox);
    vm.runInContext(scriptSrc, sandbox, { filename: 'dist/index.html#script' });

    const gs = sandbox.gameState;
    assert.ok(gs, 'dist/index.html must stub window.gameState');
    assert.strictEqual(gs.state, 'ready');
    for (const field of [
      'state', 'score', 'lives', 'wave', 'fps',
      'player', 'aliens', 'playerBullets', 'alienBullets', 'shields', 'ufo',
    ]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(gs, field),
        `gameState stub is missing the ADR-003 field "${field}"`
      );
    }
  });

  add('build.js: dist/game.js is the concatenation in ADR-004 dependency order (rng before collision before config before loop)', () => {
    const { bundlePath } = runBuild(SPECIMEN_ROOT);
    const bundle = fs.readFileSync(bundlePath, 'utf8');

    const idxRng = bundle.indexOf('SI.RNG');
    const idxCollision = bundle.indexOf('SI.Collision');
    const idxConfig = bundle.indexOf('SI.Config');
    const idxLoop = bundle.indexOf('SI.Loop');
    assert.ok(
      idxRng !== -1 && idxCollision !== -1 && idxConfig !== -1 && idxLoop !== -1,
      'expected SI.RNG, SI.Collision, SI.Config, and SI.Loop to all appear in dist/game.js'
    );
    assert.ok(idxRng < idxCollision, 'rng.js must be concatenated before collision.js per ADR-004');
    assert.ok(idxCollision < idxConfig, 'collision.js must be concatenated before config.js per ADR-004');
    assert.ok(idxConfig < idxLoop, 'config.js must be concatenated before loop.js per ADR-004');
  });

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

  add('build.js: is idempotent - rebuilding without source changes is deterministic', () => {
    const first = runBuild(SPECIMEN_ROOT);
    const html1 = fs.readFileSync(first.indexPath, 'utf8');
    const bundle1 = fs.readFileSync(first.bundlePath, 'utf8');
    const second = runBuild(SPECIMEN_ROOT);
    const html2 = fs.readFileSync(second.indexPath, 'utf8');
    const bundle2 = fs.readFileSync(second.bundlePath, 'utf8');
    assert.strictEqual(html1, html2, 'rebuilding with unchanged src/ must produce the same index.html');
    assert.strictEqual(bundle1, bundle2, 'rebuilding with unchanged src/ must produce the same game.js');
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

// VERY LAST stdout statement - the bridge parses only this line.
console.log(JSON.stringify({ passed, total, passRate: total ? passed / total : 0 }));
process.exit(passed < total ? 1 : 0);
