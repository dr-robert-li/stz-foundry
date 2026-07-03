// SEALED suite for slice-05 (waves-shields-ufo, owns P4). Zero added
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
// mutate window.gameState directly for fixtures (same technique slice-02/03/
// 04 use for bullets/aliens/shields/ufo), call
// SI.Game.update(SI.Config.FIXED_TIMESTEP_MS) N times, observe
// window.gameState.
//
// Contract scope discipline (do not relax): the slice-05 contract has three
// named clauses — shields, ufo, waves. Assertions below stick to exactly
// what each clause names (integrity deltas, active/bonus/score deltas, wave
// number + full-grid respawn + marchInterval ordering) and do NOT invent
// requirements the contract is silent on (e.g. no assertion about exactly
// when/whether an unhit UFO exits the screen, no assertion about shield or
// alien-grid pixel layout beyond what SI.Shield.cellRect/SI.Alien.createGrid
// already expose as TEST-FACING).
//
// Anti-fragility: nothing here keys a shield cell's, alien's, or bullet's
// identity on (row,col)/array index across a step where it may legitimately
// move/respawn. Shield-cell assertions target a cell via
// SI.Shield.cellRect(shield, cellIndex) (a stable, pure geometry lookup) and
// compare that SAME index's integrity value before/after, never position.
// Wave-respawn assertions use aliens.length and marchInterval's own pure
// return values, never a specific alien's (row,col)/index identity across
// the respawn. UFO assertions use the active flag + score delta, never
// position identity.
//
// Run locally: node slice-05.test.mjs [pathToBundle.js]

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

function pointsSum(aliens) {
  return aliens.reduce((sum, a) => sum + a.points, 0);
}

// A bare {x,y,width,height} bullet exactly coincident with `box` (own field
// values, never hardcoded coordinates) - guarantees aabbOverlap true
// regardless of the specimen's own bullet dimensions.
function coincidentBox(box) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

// A bullet placed to share exactly one boundary line with `box` - real
// overlap must resolve to false (edge-exclusion), per the project's own
// aabbOverlap contract (used identically by P1-P4).
function edgeTouchingBox(box) {
  return { x: box.x + box.width, y: box.y, width: 4, height: 10 };
}

function sumIntegrity(shield) {
  return shield.cells.reduce((a, b) => a + b, 0);
}

const tests = [];
const add = (name, fn) => tests.push({ name, fn });

// =======================================================================
// Shields (P4, clause 1) — gameState.shields shape + SI.Shield.cellRect +
// bullet-vs-cell resolution
//
// Fixture design note: SI.Game.update() may resolve bullet movement before
// or after shield-collision checks within a single step (the contract does
// not fix that internal ordering), and shield cells are packed edge-to-edge
// with no gap between neighbors, so a single-step "place it exactly on the
// rect" fixture is fragile to that ordering choice, and a padded fixture
// risks bleeding into a packed neighbor cell. Both traps are avoided by
// instead firing a bullet from OUTSIDE the shield, in its cell's own
// column, and letting the specimen's own bullet-movement logic carry it in
// over a generous step budget — exactly like a real shot — then checking
// the eventual outcome. The target cell is always the geometrically FIRST
// one reachable from that firing direction (bottom-most for an upward
// player bullet, top-most for a downward alien bullet), so there is no
// "which row gets hit first" ambiguity either. Aliens are moved out of the
// way and the player is moved off-band so only the shield can consume the
// probe bullet, isolating this one mechanic; any natural UFO spawn during
// the travel budget is neutralized the same way.
// =======================================================================

function shieldRects(SI, shield) {
  return shield.cells.map((_, i) => SI.Shield.cellRect(shield, i));
}

function shieldBounds(SI, shield) {
  const rects = shieldRects(SI, shield);
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    maxX: Math.max(...rects.map((r) => r.x + r.width)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxY: Math.max(...rects.map((r) => r.y + r.height)),
  };
}

// The cellIndex a bullet travelling straight through this shield's column
// from OUTSIDE it reaches FIRST. direction 'up' (player bullet, travels
// toward -y): the greatest (y+height) - the shield's own bottom-most edge.
// direction 'down' (alien bullet, travels toward +y): the smallest y - the
// shield's own top-most edge.
function firstReachableCellIndex(SI, shield, direction) {
  let best = 0;
  let bestVal = null;
  for (let i = 0; i < shield.cells.length; i++) {
    const r = SI.Shield.cellRect(shield, i);
    const val = direction === 'up' ? r.y + r.height : r.y;
    if (bestVal === null || (direction === 'up' ? val > bestVal : val < bestVal)) {
      bestVal = val;
      best = i;
    }
  }
  return best;
}

// Isolates shield-collision from every other mechanic that could otherwise
// consume/deflect the probe bullet first (alien-vs-bullet collision,
// player-vs-alien-bullet collision, an active UFO), regardless of the
// specimen's own internal step ordering - WITHOUT emptying gameState.aliens
// (which would itself trigger the P4 last-alien-kill wave-respawn) and
// WITHOUT moving the player somewhere that would itself trip the P3
// alien-reaches-player-row gameover trigger (a naive "move it far away" in
// the wrong direction does exactly that - moving player.y very NEGATIVE
// makes alien.y+height >= player.y true for every alien).
function isolateForShieldTest(gs) {
  for (const a of gs.aliens) a.y = -999999; // clear of the shield probe's travel path; also well below player.y, so row-reach never trips
  gs.player.y = 999999; // comfortably beyond any alien's y+height and any alien-bullet's path
  gs.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };
}

const TRAVEL_BUDGET = 400; // generous relative to any plausible per-step bullet speed and start offset

// Fires one bullet from outside the shield (direction 'up' = player bullet
// starting below it, 'down' = alien bullet starting above it) at the
// first-reachable cell of shields[shieldIndex], stepping until it is
// consumed or the budget runs out. Returns {cellIndex, hit, bulletsField}.
function fireAtShield(SI, gs, shieldIndex, direction) {
  const shield = gs.shields[shieldIndex];
  const cellIndex = firstReachableCellIndex(SI, shield, direction);
  const rect = SI.Shield.cellRect(shield, cellIndex);
  const OFFSET = 80;
  const bulletsField = direction === 'up' ? 'playerBullets' : 'alienBullets';
  const startY = direction === 'up' ? rect.y + rect.height + OFFSET : rect.y - OFFSET - rect.height;
  gs[bulletsField] = [{ x: rect.x, y: startY, width: rect.width, height: rect.height }];

  let hit = false;
  for (let i = 0; i < TRAVEL_BUDGET && !hit; i++) {
    gs.ufo.active = false; // neutralize any natural spawn attempt before it can steal our bullet
    step(SI, 1);
    if (gs[bulletsField].length === 0) hit = true;
  }
  return { cellIndex, hit, bulletsField };
}

add(
  'Shield init shape: gameState.shields is a non-empty array of ' +
    '{x,y,cells:[integer integrity...]} per conventions, and SI.Shield.cellRect ' +
    'is a callable pure function',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;

    assert.ok(Array.isArray(gs.shields), 'gameState.shields must be an array');
    assert.ok(gs.shields.length > 0, 'gameState.shields must be non-empty');
    for (const shield of gs.shields) {
      assert.strictEqual(typeof shield.x, 'number', 'each shield must have a numeric x');
      assert.strictEqual(typeof shield.y, 'number', 'each shield must have a numeric y');
      assert.ok(Array.isArray(shield.cells), 'each shield must have a cells array');
      assert.ok(shield.cells.length > 0, 'each shield must have at least one cell');
      for (const cell of shield.cells) {
        assert.ok(Number.isInteger(cell), `cell integrity ${cell} must be an integer`);
        assert.ok(cell >= 0, `cell integrity ${cell} must be >= 0`);
      }
    }

    assert.strictEqual(typeof SI.Shield.cellRect, 'function', 'SI.Shield.cellRect must be a function');
    const shield0 = gs.shields[0];
    const rect = SI.Shield.cellRect(shield0, 0);
    assert.strictEqual(typeof rect.x, 'number');
    assert.strictEqual(typeof rect.y, 'number');
    assert.strictEqual(typeof rect.width, 'number');
    assert.strictEqual(typeof rect.height, 'number');
    assert.ok(rect.width > 0 && rect.height > 0, 'cellRect must report a positive-area rect');
  }
);

add(
  'SI.Shield.cellRect is PURE (same shield+index -> same rect across repeated calls, does not mutate ' +
    'shield.cells) and genuinely depends on cellIndex (two different indices in the same shield with ' +
    '2+ cells give DIFFERENT rects) - discriminates a stub that ignores cellIndex',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const shield = window.gameState.shields[0];
    assert.ok(shield.cells.length >= 2, 'setup invariant: expected a shield with at least 2 cells');

    const before = shield.cells.slice();
    const a1 = SI.Shield.cellRect(shield, 0);
    const a2 = SI.Shield.cellRect(shield, 0);
    assert.deepStrictEqual(a1, a2, 'cellRect(shield,0) must return the same rect on repeated calls');
    assert.deepStrictEqual(shield.cells, before, 'cellRect must not mutate shield.cells');

    const b = SI.Shield.cellRect(shield, 1);
    assert.notDeepStrictEqual(a1, b, 'cellRect(shield,0) and cellRect(shield,1) must differ');
  }
);

add(
  'Shield hit (player bullet): a player bullet fired from below the shield, given a generous step ' +
    'budget to travel up into it exactly like a real shot, reduces the first-reachable cell\'s ' +
    'integrity by EXACTLY 1 and is consumed - every other cell in every shield is left untouched',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    const beforeAll = gs.shields.map((s) => s.cells.slice());
    const before = gs.shields[0].cells[firstReachableCellIndex(SI, gs.shields[0], 'up')];

    const { cellIndex, hit } = fireAtShield(SI, gs, 0, 'up');

    assert.ok(hit, `expected the player bullet to be consumed by the shield within ${TRAVEL_BUDGET} steps`);
    assert.strictEqual(
      gs.shields[0].cells[cellIndex],
      Math.max(0, before - 1),
      "the first-reachable cell's integrity must drop by exactly 1"
    );
    gs.shields.forEach((s, si) => {
      s.cells.forEach((c, ci) => {
        if (si === 0 && ci === cellIndex) return;
        assert.strictEqual(c, beforeAll[si][ci], `shield ${si} cell ${ci} must be untouched by a hit on a different cell`);
      });
    });
  }
);

add(
  'Shield hit (alien bullet): an alien bullet fired from above the shield, given the same generous ' +
    "travel budget, ALSO reduces the first-reachable (topmost) cell's integrity by exactly 1 and is " +
    'consumed - the contract explicitly covers bullets from either side',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    const before = gs.shields[0].cells[firstReachableCellIndex(SI, gs.shields[0], 'down')];

    const { cellIndex, hit } = fireAtShield(SI, gs, 0, 'down');

    assert.ok(hit, `expected the alien bullet to be consumed by the shield within ${TRAVEL_BUDGET} steps`);
    assert.strictEqual(gs.shields[0].cells[cellIndex], Math.max(0, before - 1), "an alien bullet must also reduce a cell's integrity by 1");
  }
);

add(
  'Shield integrity floors at 0 and NEVER goes negative under repeated hits on the SAME cell (fired ' +
    'fresh from outside every time, exactly like real successive shots), and the cell keeps consuming ' +
    'bullets even once spent (no "destroyed cell lets bullets through" leniency, and no "skip to a ' +
    'different cell instead" leniency either - the contract names THAT cell, not a substitute)',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    const shield = gs.shields[0];
    const cellIndex = firstReachableCellIndex(SI, shield, 'up');
    const startIntegrity = shield.cells[cellIndex];
    assert.ok(startIntegrity > 0, 'setup invariant: cell must start with positive integrity');

    const totalHits = startIntegrity + 3; // deliberately overshoot the floor
    for (let hitNum = 1; hitNum <= totalHits; hitNum++) {
      const beforeAll = gs.shields.map((s) => s.cells.slice());
      const { hit } = fireAtShield(SI, gs, 0, 'up');
      const expected = Math.max(0, startIntegrity - hitNum);
      assert.ok(hit, `shot ${hitNum}: expected the bullet to be consumed by the SAME first-reachable cell, even once spent`);
      assert.strictEqual(shield.cells[cellIndex], expected, `after shot ${hitNum}: integrity must be exactly ${expected}`);
      assert.ok(shield.cells[cellIndex] >= 0, `after shot ${hitNum}: integrity must never go negative`);
      // Discriminates a "skip an already-spent cell and let the bullet fly
      // through to a FARTHER cell in the same column" leniency: once the
      // target is spent, every OTHER cell in every shield (including the
      // rest of THIS shield) must stay byte-for-byte unchanged - the
      // contract names THAT cell as the one whose integrity drops, not a
      // substitute the bullet happens to reach afterward.
      gs.shields.forEach((s, si) => {
        s.cells.forEach((c, ci) => {
          if (si === 0 && ci === cellIndex) return;
          assert.strictEqual(
            c,
            beforeAll[si][ci],
            `after shot ${hitNum}: shield ${si} cell ${ci} must stay untouched - only the targeted cell may change`
          );
        });
      });
    }
  }
);

add(
  'Shield miss: a bullet fired well outside any shield\'s column (and far from every shield on-screen) ' +
    'leaves all cells and the bullet itself untouched',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    const before = gs.shields.map((s) => s.cells.slice());
    // Far to the right of any typical play field, at a mid-screen Y so it
    // can never be culled as "off the top of the screen" this step.
    gs.playerBullets = [{ x: 50000, y: 100, width: 4, height: 10 }];

    step(SI, 1);

    gs.shields.forEach((s, i) => assert.deepStrictEqual(s.cells, before[i], `shield ${i} cells must be untouched by a non-overlapping bullet`));
    assert.strictEqual(gs.playerBullets.length, 1, 'a non-overlapping bullet must survive (not be consumed)');
  }
);

add(
  "Shield edge-touch: a bullet sharing exactly the WHOLE shield's own outer boundary line (zero-area " +
    "intersection with EVERY cell of that shield, computed from SI.Shield.cellRect over all of its " +
    'cells) does NOT count as a hit on any cell - discriminates a naive "close enough" overlap check ' +
    "without the trap of a tightly-packed neighboring cell absorbing a single-cell-edge probe instead",
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    const shield = gs.shields[0];
    const before = shield.cells.slice();
    const bounds = shieldBounds(SI, shield);
    gs.playerBullets = [{ x: bounds.maxX, y: bounds.minY, width: 4, height: 10 }];

    step(SI, 1);

    assert.deepStrictEqual(shield.cells, before, 'a bullet touching only the outer boundary must not reduce any cell integrity');
  }
);

add(
  "Shield isolation: hitting one shield's cell must not affect ANY other shield's cells (targets by " +
    "SI.Shield.cellRect's own reported geometry via the same fire-and-travel fixture, never by array " +
    'index into a different shield)',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    isolateForShieldTest(gs);
    assert.ok(gs.shields.length >= 2, 'setup invariant: expects at least 2 shields');
    const untouchedBefore = gs.shields[0].cells.slice();

    const { hit } = fireAtShield(SI, gs, 1, 'up');

    assert.ok(hit, `expected the player bullet to be consumed by shields[1] within ${TRAVEL_BUDGET} steps`);
    assert.deepStrictEqual(gs.shields[0].cells, untouchedBefore, "a hit on shields[1] must not touch shields[0]'s cells");
  }
);

// UFO (P4, clause 2) — gameState.ufo shape + RNG-timed spawn/bonus +
// player-bullet-vs-active-ufo resolution
// =======================================================================

add(
  'UFO kill (forced-active fixture): setting gameState.ufo={active:true,...,bonus:137} then injecting ' +
    'a coincident player bullet sets ufo.active=false and adds EXACTLY 137 to score on the next update(), ' +
    'and the bullet is consumed - 137 is a non-round value chosen to discriminate a hardcoded bonus',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    gs.ufo = { active: true, x: 300, y: 10, width: 30, height: 16, bonus: 137 };
    const scoreBefore = gs.score;
    gs.playerBullets = [coincidentBox(gs.ufo)];

    step(SI, 1);

    assert.strictEqual(gs.ufo.active, false, 'a hit on an active UFO must deactivate it');
    assert.strictEqual(gs.score, scoreBefore + 137, 'score must increase by EXACTLY the UFO bonus');
    assert.strictEqual(gs.playerBullets.length, 0, 'the hitting bullet must be consumed');
  }
);

add(
  'UFO bonus is added verbatim at both ends of the contracted [50,300] range, not clamped/rounded away',
  () => {
    for (const bonus of [50, 300]) {
      const { SI, window } = loadBundle();
      SI.Game.init({ width: 800, height: 600 });
      const gs = window.gameState;
      gs.ufo = { active: true, x: 300, y: 10, width: 30, height: 16, bonus };
      const scoreBefore = gs.score;
      gs.playerBullets = [coincidentBox(gs.ufo)];

      step(SI, 1);

      assert.strictEqual(gs.score, scoreBefore + bonus, `bonus=${bonus}: score must increase by exactly ${bonus}`);
    }
  }
);

add(
  'UFO inactive: a bullet exactly overlapping an INACTIVE ufo rect must NOT add score or reactivate it ' +
    '- the active flag gates the hit, not geometry alone (discriminates a check that ignores `active`)',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    gs.ufo = { active: false, x: 300, y: 10, width: 30, height: 16, bonus: 137 };
    const scoreBefore = gs.score;
    gs.playerBullets = [coincidentBox(gs.ufo)];

    step(SI, 1);

    assert.strictEqual(gs.score, scoreBefore, 'an inactive UFO must never add its bonus to score');
    assert.strictEqual(gs.ufo.active, false, 'an inactive UFO must not be reactivated by a bullet');
  }
);

add(
  'UFO edge-touch: a bullet sharing exactly one boundary with an ACTIVE ufo does NOT count as a hit - ' +
    'score/active/bullet all remain unchanged',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    gs.ufo = { active: true, x: 300, y: 10, width: 30, height: 16, bonus: 137 };
    const scoreBefore = gs.score;
    gs.playerBullets = [edgeTouchingBox(gs.ufo)];

    step(SI, 1);

    assert.strictEqual(gs.score, scoreBefore, 'an edge-touching bullet must not score against the UFO');
    assert.strictEqual(gs.ufo.active, true, 'an edge-touching bullet must not deactivate the UFO');
    assert.strictEqual(gs.playerBullets.length, 1, 'an edge-touching bullet must not be consumed');
  }
);

const UFO_BUDGET = 12000; // generous relative to any plausible RNG-timed spawn cadence
const UFO_CHECKPOINTS = [200, 2000, 6000, UFO_BUDGET];

function runUfoSchedule(seed) {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600, seed });
  const snaps = [];
  let done = 0;
  let sawActive = false;
  let sawBonusInRange = true;
  for (const target of UFO_CHECKPOINTS) {
    for (let i = done; i < target; i++) {
      step(SI, 1);
      const ufo = window.gameState.ufo;
      if (ufo.active) {
        sawActive = true;
        if (!(ufo.bonus >= 50 && ufo.bonus <= 300)) sawBonusInRange = false;
      }
    }
    done = target;
    snaps.push(JSON.stringify(window.gameState.ufo));
  }
  return { snaps, sawActive, sawBonusInRange };
}

add(
  `UFO natural spawn: over a ${UFO_BUDGET}-step budget with a fixed seed, the UFO becomes active at ` +
    'least once, and its bonus is always within the contracted [50,300] range whenever active - and two ' +
    'runs seeded identically produce byte-identical gameState.ufo snapshots at every checkpoint (RNG-timed, deterministic per seed)',
  () => {
    const a = runUfoSchedule(99);
    assert.ok(a.sawActive, `expected the UFO to become active at least once within ${UFO_BUDGET} steps`);
    assert.ok(a.sawBonusInRange, 'every observed active UFO bonus must be within [50,300]');

    const b = runUfoSchedule(99);
    assert.deepStrictEqual(b.snaps, a.snaps, 'two runs seeded identically must produce identical gameState.ufo snapshots at every checkpoint');
  }
);

add(
  "UFO schedule actually consults SI.RNG.next() (not decorative): two DIFFERENT seeds diverge in their " +
    'gameState.ufo snapshot sequence at least once over the same budget - an implementation with a fixed, ' +
    "seed-independent schedule/bonus fails this despite still being 'deterministic per run'",
  () => {
    const a = runUfoSchedule(11);
    const b = runUfoSchedule(23);
    const diverged = a.snaps.some((s, i) => s !== b.snaps[i]);
    assert.ok(diverged, `expected gameState.ufo snapshots to differ between two different seeds at least once over ${UFO_BUDGET} steps`);
  }
);

// =======================================================================
// Waves (P4, clause 3) — gameState.wave + last-alien-kill respawn +
// SI.Alien.marchInterval(aliveCount, wave)
// =======================================================================

add('Wave starts at 1 immediately after init', () => {
  const { SI, window } = loadBundle();
  SI.Game.init({ width: 800, height: 600 });
  assert.strictEqual(window.gameState.wave, 1, 'gameState.wave must start at 1');
});

add(
  'Last-alien kill: reducing gameState.aliens to exactly one alive alien, then killing it with a ' +
    'coincident player bullet, increments wave by EXACTLY 1 and respawns a FULL 55-alien grid on the ' +
    'very same update() call - score increases by exactly that one alien\'s own points, nothing more',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const last = gs.aliens[0];
    gs.aliens = [last];
    const scoreBefore = gs.score;
    gs.playerBullets = [coincidentBox(last)];

    step(SI, 1);

    assert.strictEqual(gs.wave, 2, 'killing the last alive alien must increment wave to exactly 2');
    assert.strictEqual(gs.aliens.length, 55, 'a full 55-alien grid must be respawned');
    assert.strictEqual(gs.score, scoreBefore + last.points, "score must increase by exactly the killed alien's points - no separate wave bonus");
    for (const a of gs.aliens) {
      assert.ok(a.width > 0 && a.height > 0, 'every respawned alien must have positive size');
      assert.strictEqual(typeof a.points, 'number', 'every respawned alien must carry a points value');
    }
  }
);

add(
  'Non-last kill does NOT increment wave: killing one alien out of many leaves wave unchanged - ' +
    'discriminates an implementation that (incorrectly) advances the wave on ANY kill',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    assert.ok(gs.aliens.length > 1, 'setup invariant: expects more than one alien');
    const waveBefore = gs.wave;
    const target = gs.aliens[10];
    gs.playerBullets = [coincidentBox(target)];

    step(SI, 1);

    assert.strictEqual(gs.wave, waveBefore, 'killing one of several aliens must not change wave');
    assert.strictEqual(gs.aliens.length, 54, 'exactly one alien must have been removed, no respawn');
  }
);

add('marchInterval(55, 2) is STRICTLY LESS than marchInterval(55, 1) - the exact clause example', () => {
  const { SI } = loadBundle();
  const w1 = SI.Alien.marchInterval(55, 1);
  const w2 = SI.Alien.marchInterval(55, 2);
  assert.ok(Number.isInteger(w1) && w1 > 0, `marchInterval(55,1)=${w1} must be a positive integer`);
  assert.ok(Number.isInteger(w2) && w2 > 0, `marchInterval(55,2)=${w2} must be a positive integer`);
  assert.ok(w2 < w1, `marchInterval(55,2)=${w2} must be strictly less than marchInterval(55,1)=${w1}`);
});

add(
  'marchInterval strictly decreases across a swept range of consecutive waves at a fixed (full-grid) ' +
    'aliveCount - discriminates an implementation that only special-cases wave 2',
  () => {
    const { SI } = loadBundle();
    let prev = SI.Alien.marchInterval(55, 1);
    for (let wave = 2; wave <= 5; wave++) {
      const cur = SI.Alien.marchInterval(55, wave);
      assert.ok(Number.isInteger(cur) && cur > 0, `marchInterval(55,${wave})=${cur} must be a positive integer`);
      assert.ok(cur < prev, `marchInterval(55,${wave})=${cur} must be strictly less than marchInterval(55,${wave - 1})=${prev}`);
      prev = cur;
    }
  }
);

add('marchInterval(aliveCount) with ONE arg behaves exactly as wave=1 (slice-03/04 callers unaffected)', () => {
  const { SI } = loadBundle();
  for (const n of [1, 10, 30, 55]) {
    assert.strictEqual(SI.Alien.marchInterval(n), SI.Alien.marchInterval(n, 1), `marchInterval(${n}) must equal marchInterval(${n},1)`);
  }
});

add('marchInterval stays monotonically non-increasing in aliveCount (1..55) for a fixed wave', () => {
  const { SI } = loadBundle();
  for (const wave of [1, 3]) {
    const values = [];
    for (let n = 55; n >= 1; n--) values.push(SI.Alien.marchInterval(n, wave));
    for (let i = 1; i < values.length; i++) {
      assert.ok(
        values[i] <= values[i - 1],
        `wave=${wave}: marchInterval must be non-increasing as aliveCount drops (violated at aliveCount=${55 - i})`
      );
    }
  }
});

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
// Regression: P2 (rigid march, edge-drop-and-reverse) must still hold,
// now driven through SI.Alien.marchInterval(aliveCount, wave)
// =======================================================================

add(
  'Regression P2: the alien grid still translates as a rigid block (identical per-step delta for ' +
    'every alien) on a wide screen with no edge contact',
  () => {
    const WIDE = 5_000_000;
    const { SI, window } = loadBundle();
    SI.Game.init({ width: WIDE, height: 600 });
    const gs = window.gameState;
    const before = gs.aliens.map((a) => ({ x: a.x, y: a.y }));

    const interval = SI.Alien.marchInterval(gs.aliens.length, gs.wave);
    step(SI, interval * 2 + 5);

    const after = gs.aliens.map((a) => ({ x: a.x, y: a.y }));
    const deltas = new Set(before.map((b, i) => `${after[i].x - b.x},${after[i].y - b.y}`));
    assert.strictEqual(deltas.size, 1, `every alive alien must share the same march delta, saw ${deltas.size} distinct`);
    assert.notStrictEqual([...deltas][0], '0,0', 'the grid must have actually moved over 2+ march intervals');
  }
);

add(
  'Regression P2: on edge contact the grid drops (y-only, uniform) and reverses horizontal direction ' +
    'on the very next march step - grid pre-shifted so contact is imminent, keeping the scan bounded',
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
    // Isolate this P2 mechanic from P3's alien-fire lives-drain and from a
    // possible P4 last-alien-kill respawn (neither is under test here).
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

// =======================================================================
// Regression: P3 (alien fire, lives, gameover) must still hold
// =======================================================================

add(
  'Regression P3: an alien bullet exactly overlapping the player decrements lives by EXACTLY 1 and is ' +
    'consumed',
  () => {
    const { SI, window } = loadBundle();
    SI.Game.init({ width: 800, height: 600 });
    const gs = window.gameState;
    const livesBefore = gs.lives;
    gs.alienBullets = [coincidentBox(gs.player)];

    step(SI, 1);

    assert.strictEqual(gs.lives, livesBefore - 1, 'an overlapping alien bullet must cost exactly 1 life');
    assert.strictEqual(gs.alienBullets.length, 0, 'the hitting alien bullet must be consumed');
  }
);

add(
  "Regression P3: once state==='gameover' (lives driven to 0), further update(dt) calls never change " +
    'lives, score, or state - even with fresh overlapping alien bullets injected every call',
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

    for (let i = 0; i < 3; i++) {
      gs.alienBullets = [coincidentBox(gs.player)];
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      assert.strictEqual(gs.lives, snapshot.lives, `terminality call ${i + 1}: lives must stay frozen`);
      assert.strictEqual(gs.score, snapshot.score, `terminality call ${i + 1}: score must stay frozen`);
      assert.strictEqual(gs.state, snapshot.state, `terminality call ${i + 1}: state must stay frozen`);
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
  add(
    'build.js: produces dist/index.html + a working dist/game.js bundle exposing shields, ufo, and wave ' +
      'plus a full init -> last-alien-kill -> wave-2 smoke path',
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
      assert.strictEqual(typeof SI.Shield.cellRect, 'function', 'dist/game.js must expose SI.Shield.cellRect');

      SI.Game.init({ width: 800, height: 600, seed: 1 });
      const gs = window.gameState;
      assert.strictEqual(gs.wave, 1, 'shipped bundle must start at wave 1');
      assert.ok(Array.isArray(gs.shields) && gs.shields.length > 0, 'shipped bundle must populate gameState.shields');
      assert.ok(gs.ufo && typeof gs.ufo.active === 'boolean', 'shipped bundle must populate gameState.ufo');

      const last = gs.aliens[0];
      gs.aliens = [last];
      gs.playerBullets = [coincidentBox(last)];
      SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
      assert.strictEqual(gs.wave, 2, 'shipped bundle must advance to wave 2 on the last-alien kill');
      assert.strictEqual(gs.aliens.length, 55, 'shipped bundle must respawn a full 55-alien grid');
    }
  );

  add(
    'build.js: dist/game.js concatenation order is rng < collision < config < loop < player < bullet ' +
      '< alien < shield < ufo < game',
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
        shield: bundle.indexOf('window.SI.Shield ='),
        ufo: bundle.indexOf('window.SI.Ufo ='),
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
      assert.ok(idx.alien < idx.shield, 'alien before shield');
      assert.ok(idx.shield < idx.ufo, 'shield before ufo');
      assert.ok(idx.ufo < idx.game, 'ufo before game');
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
