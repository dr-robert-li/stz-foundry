#!/usr/bin/env node
// slice-06 (renderer-audio-fps) sealed suite.
//
// Run: node slice-06.test.mjs <implPath>
//   implPath = a concatenated bundle, dist/game.js. specimenRoot is
//   dirname(dirname(implPath)); the browser layer loads
//   dirname(implPath)/index.html.
//
// Inline sync/async runner, no node:test. Per-test detail -> stderr. The
// VERY LAST stdout line is `console.log(JSON.stringify({passed,total,passRate}))`.
// Exits nonzero if passed < total.
//
// Two layers:
//   - node-level (always registered): loads the bundle into a bare vm
//     (window === globalThis-ish sandbox, minimal document/rAF/AudioContext
//     stubs) and checks API surface + P1-P4 regression behavior. Keeps
//     mutation runs (a bare mutant bundle in a temp dir, no index.html)
//     scoreable without a browser.
//   - browser (registered only when <specimenRoot>/dist/index.html exists
//     AND playwright-core resolves): drives a real headless Chromium via
//     playwright-core to check the auto-boot, the never-throw/read-only
//     renderer contract, the guarded audio contract, and the P5 fps
//     threshold, independently measured from real rAF delivery (not trusted
//     from the specimen's own self-reported gameState.fps).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Impl resolution (argv[2] -> STZ_SPECIMEN_DIR -> built reference default)
// ---------------------------------------------------------------------------

function resolveImplPath() {
  if (process.argv[2]) {
    return path.resolve(process.argv[2]);
  }
  if (process.env.STZ_SPECIMEN_DIR) {
    return path.join(path.resolve(process.env.STZ_SPECIMEN_DIR), 'dist', 'game.js');
  }
  return path.join(__dirname, 'reference', 'dist', 'game.js');
}

const implPath = resolveImplPath();
const specimenRoot = path.dirname(path.dirname(implPath));
const indexHtmlPath = path.join(path.dirname(implPath), 'index.html');
const buildJsPath = path.join(specimenRoot, 'build.js');

function loadBundleSource() {
  return fs.readFileSync(implPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Node-level vm harness
// ---------------------------------------------------------------------------

function createSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  sandbox.document = {
    readyState: 'complete', // boot() must run synchronously on load, no DOMContentLoaded wait needed here
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // rAF stub: registers but never fires, so the loop doesn't run away inside
  // Node — only object/API-surface + directly-driven update() are checked at
  // this layer. Must not throw when called.
  sandbox.requestAnimationFrame = () => 0;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  // AudioContext deliberately left undefined: SI.Audio must guard its
  // absence (never throw at load or at call time).
  vm.createContext(sandbox);
  return sandbox;
}

function loadInVm() {
  const sandbox = createSandbox();
  const src = loadBundleSource();
  vm.runInContext(src, sandbox, { filename: implPath });
  return sandbox;
}

// ---------------------------------------------------------------------------
// Test registry
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let playwrightAvailable = false;
try {
  require.resolve('playwright-core');
  playwrightAvailable = true;
} catch (e) {
  playwrightAvailable = false;
}
const indexHtmlExists = fs.existsSync(indexHtmlPath);
const browserTestsEnabled = playwrightAvailable && indexHtmlExists;

// ---------------------------------------------------------------------------
// Node-level tests (always registered)
// ---------------------------------------------------------------------------

test('node: bundle loads in a bare vm; SI.Renderer/SI.Audio are objects; SI.Renderer.draw is a function', () => {
  const sandbox = loadInVm();
  const SI = sandbox.window.SI;
  assert.equal(typeof SI, 'object', 'window.SI must exist after loading the bundle');
  assert.equal(typeof SI.Renderer, 'object', 'SI.Renderer must be an object');
  assert.equal(typeof SI.Audio, 'object', 'SI.Audio must be an object');
  assert.equal(typeof SI.Renderer.draw, 'function', 'SI.Renderer.draw must be a function');
});

test('node: P1-P4 API surface + gameState field contract present after auto-boot', () => {
  const sandbox = loadInVm();
  const SI = sandbox.window.SI;
  assert.equal(typeof SI.Game.init, 'function');
  assert.equal(typeof SI.Game.update, 'function');
  assert.equal(typeof SI.Alien.marchInterval, 'function');
  assert.equal(typeof SI.Shield.cellRect, 'function');

  const gs = sandbox.window.gameState;
  assert.ok(gs, 'window.gameState must exist after the bundle auto-boots on load');
  assert.ok('ufo' in gs, 'gameState.ufo must be present (P4)');
  assert.ok('shields' in gs, 'gameState.shields must be present (P4)');
  assert.ok('wave' in gs, 'gameState.wave must be present (P4)');
  assert.ok(Array.isArray(gs.aliens) && gs.aliens.length > 0, 'auto-boot must spawn a non-empty alien grid');
});

test('node: killing an alien via an injected bullet scores exactly that alien\'s points and removes exactly one alien; SI.Game.init() resets score/lives/state', () => {
  const sandbox = loadInVm();
  const SI = sandbox.window.SI;

  SI.Game.init({ width: 800, height: 600, seed: 7 });
  let gs = sandbox.window.gameState;
  const aliveBefore = gs.aliens.length;
  const target = gs.aliens[0];
  const expectedPoints = target.points;
  const scoreBefore = gs.score;

  // Live-by-array-membership injection (TEST-FACING rule inherited from
  // slice-01..05): a bare {x,y,width,height} object placed directly over the
  // target alien counts as a hit.
  gs.playerBullets.push({ x: target.x, y: target.y, width: target.width, height: target.height });
  SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);

  assert.equal(gs.score, scoreBefore + expectedPoints, 'score must increase by exactly the killed alien\'s point value');
  assert.equal(gs.aliens.length, aliveBefore - 1, 'exactly one alien must be removed');

  SI.Game.init({ width: 800, height: 600, seed: 7 });
  gs = sandbox.window.gameState;
  assert.equal(gs.score, 0, 'init() must reset score to 0');
  assert.equal(gs.lives, SI.Config.STARTING_LIVES, 'init() must reset lives to STARTING_LIVES');
  assert.equal(gs.state, 'playing', 'init() must reset state to playing');
});

test('node: sustained left/right input keeps player.x clamped to [0, width-player.width] on every fixed step', () => {
  const sandbox = loadInVm();
  const SI = sandbox.window.SI;
  const width = 800;
  SI.Game.init({ width: width, height: 600 });

  SI.Game.input.left = true;
  SI.Game.input.right = false;
  for (let i = 0; i < 60; i++) {
    SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
    const p = sandbox.window.gameState.player;
    assert.ok(p.x >= 0 && p.x <= width - p.width, `player.x out of bounds under sustained left input at step ${i}: ${p.x}`);
  }

  SI.Game.input.left = false;
  SI.Game.input.right = true;
  for (let i = 0; i < 240; i++) {
    SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
    const p = sandbox.window.gameState.player;
    assert.ok(p.x >= 0 && p.x <= width - p.width, `player.x out of bounds under sustained right input at step ${i}: ${p.x}`);
  }
});

if (fs.existsSync(buildJsPath)) {
  test('node: sibling build.js runs successfully and (re)produces a non-empty dist/game.js', () => {
    const res = spawnSync(process.execPath, [buildJsPath], { cwd: specimenRoot, encoding: 'utf8' });
    assert.equal(res.status, 0, `build.js exited with status ${res.status}. stderr: ${res.stderr}`);
    assert.ok(fs.existsSync(implPath), 'dist/game.js must exist after running build.js');
    const stat = fs.statSync(implPath);
    assert.ok(stat.size > 0, 'dist/game.js must be non-empty after running build.js');
  });
}

// ---------------------------------------------------------------------------
// Browser-level tests (registered only when index.html + playwright-core are
// both available, so a bare mutated bundle in a temp dir is judged purely by
// the node-level smoke checks above)
// ---------------------------------------------------------------------------

let browser = null;

function findChromeExecutable() {
  const baseDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  let entries;
  try {
    entries = fs.readdirSync(baseDir);
  } catch (e) {
    throw new Error(`no ~/.cache/ms-playwright directory found: ${e.message}`);
  }
  const candidates = entries
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .map((name) => path.join(baseDir, name, 'chrome-linux', 'chrome'))
    .filter((p) => fs.existsSync(p));
  if (candidates.length === 0) {
    throw new Error('no chromium executable found under ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome');
  }
  return candidates[0];
}

async function getBootedPage() {
  const page = await browser.newPage();
  // Installed BEFORE navigation so it wraps the page's very first
  // requestAnimationFrame registration (the auto-boot happens synchronously
  // on load, per the contract) -- this is an independent, page-side frame
  // counter, not trust in the specimen's own gameState.fps.
  await page.addInitScript(() => {
    window.__stzFrames = 0;
    const rawRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      return rawRaf(function (ts) {
        window.__stzFrames++;
        return cb(ts);
      });
    };
  });
  const fileUrl = pathToFileURL(indexHtmlPath).href;
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.gameState && typeof window.gameState.fps === 'number', {
    timeout: 10000,
  });
  return page;
}

if (browserTestsEnabled) {
  test('browser: dist/index.html auto-boots a live window.gameState field-contract; SI.Loop is running', async () => {
    const page = await getBootedPage();
    try {
      const shape = await page.evaluate(() => {
        const gs = window.gameState;
        const requiredFields = [
          'state', 'score', 'lives', 'wave', 'fps',
          'player', 'aliens', 'playerBullets', 'alienBullets', 'shields', 'ufo',
        ];
        return {
          hasAllFields: !!gs && requiredFields.every((k) => k in gs),
          liveRef: window.gameState === window.SI.Game.state,
        };
      });
      assert.ok(shape.hasAllFields, 'window.gameState is missing one or more required P1-P4 fields');
      assert.ok(shape.liveRef, 'window.gameState must be the SAME live object as SI.Game.state (ADR-003), not a copy');

      const f0 = await page.evaluate(() => window.__stzFrames);
      await page.waitForTimeout(500);
      const f1 = await page.evaluate(() => window.__stzFrames);
      assert.ok(f1 > f0, `frame counter did not advance over 500ms (f0=${f0}, f1=${f1}); SI.Loop does not appear to be running`);
    } finally {
      await page.close();
    }
  });

  test('browser: SI.Renderer.draw never throws across repeated frames and never mutates the state it renders', async () => {
    const page = await getBootedPage();
    try {
      const result = await page.evaluate(() => {
        const gs = window.gameState;
        const before = JSON.stringify(gs);
        let threw = null;
        try {
          for (let i = 0; i < 15; i++) {
            window.SI.Renderer.draw(gs);
          }
        } catch (e) {
          threw = String((e && e.message) || e);
        }
        const after = JSON.stringify(gs);
        return { threw, unchanged: before === after };
      });
      assert.equal(result.threw, null, `SI.Renderer.draw threw: ${result.threw}`);
      assert.ok(result.unchanged, 'SI.Renderer.draw must be read-only and never mutate the state object it renders');
    } finally {
      await page.close();
    }
  });

  test('browser: SI.Renderer.draw never throws on edge-case state shapes (empty arrays, destroyed shield cells, minimal entities)', async () => {
    const page = await getBootedPage();
    try {
      const errors = await page.evaluate(() => {
        const cases = [
          {
            state: 'ready', score: 0, lives: 0, wave: 1, fps: 0,
            player: { x: 0, y: 0, width: 40, height: 20 },
            aliens: [], playerBullets: [], alienBullets: [], shields: [],
            ufo: { active: false, x: 0, y: 0, width: 30, height: 16, bonus: 0 },
          },
          {
            state: 'gameover', score: 999999, lives: 0, wave: 9,
            fps: 60,
            player: { x: 400, y: 550, width: 40, height: 20 },
            // aliens missing optional row/col/alive/points -- only the
            // {x,y,width,height} shape is guaranteed by the base contract.
            aliens: [
              { x: 0, y: 10, width: 30, height: 20 },
              { x: 40, y: 10, width: 30, height: 20 },
            ],
            playerBullets: Array.from({ length: 40 }, (_, i) => ({ x: i, y: i, width: 4, height: 10 })),
            alienBullets: [{ x: 1, y: 1, width: 4, height: 10 }],
            // a shield with every cell already destroyed (integrity 0)
            shields: [{ x: 0, y: 0, cells: new Array(18).fill(0) }],
            ufo: { active: true, x: -30, y: 20, width: 30, height: 16, bonus: 100 },
          },
        ];
        const errs = [];
        for (const c of cases) {
          try {
            window.SI.Renderer.draw(c);
          } catch (e) {
            errs.push(String((e && e.message) || e));
          }
        }
        return errs;
      });
      assert.deepEqual(errors, [], `SI.Renderer.draw threw on edge-case state(s): ${JSON.stringify(errors)}`);
    } finally {
      await page.close();
    }
  });

  test('browser: every exposed SI.Audio method is callable without throwing under a headless/suspended AudioContext', async () => {
    const page = await getBootedPage();
    try {
      const results = await page.evaluate(() => {
        const out = [];
        const audio = window.SI.Audio || {};
        for (const key of Object.keys(audio)) {
          if (typeof audio[key] === 'function') {
            try {
              audio[key]();
              out.push({ name: key, threw: false });
            } catch (e) {
              out.push({ name: key, threw: true, message: String((e && e.message) || e) });
            }
          }
        }
        return out;
      });
      assert.ok(results.length > 0, 'SI.Audio must expose at least one callable synthesized-SFX method');
      for (const r of results) {
        assert.equal(r.threw, false, `SI.Audio.${r.name}() threw: ${r.message}`);
      }
    } finally {
      await page.close();
    }
  });

  test('browser: P5 -- median fps over ~5s of active simulated gameplay >= 50; gameState.fps is a finite positive number', async () => {
    const page = await getBootedPage();
    try {
      const DURATION_MS = 5000;
      const f0 = await page.evaluate(() => window.__stzFrames);
      const t0 = Date.now();

      // Active gameplay (per the strategy's "active input, not a static
      // screen" caution): continuously toggles movement + fire for the
      // duration, driven inside the page so this is a single round trip.
      await page.evaluate((durationMs) => {
        return new Promise((resolve) => {
          let dir = 1;
          const timer = setInterval(() => {
            const input = window.SI && window.SI.Game && window.SI.Game.input;
            if (input) {
              input.left = dir < 0;
              input.right = dir > 0;
              input.fire = true;
              dir = -dir;
            }
          }, 200);
          setTimeout(() => {
            clearInterval(timer);
            resolve();
          }, durationMs);
        });
      }, DURATION_MS);

      const elapsedMs = Date.now() - t0;
      const f1 = await page.evaluate(() => window.__stzFrames);
      const framesDelivered = f1 - f0;
      // Independently measured from real rAF delivery counted in-page --
      // deliberately NOT trusting the specimen's own self-reported
      // gameState.fps for the pass/fail threshold, so a specimen can't game
      // P5 by hardcoding a high fps value without actually running that fast.
      const measuredFps = framesDelivered / (elapsedMs / 1000);

      const gsFps = await page.evaluate(() => window.gameState && window.gameState.fps);

      assert.ok(
        measuredFps >= 50,
        `independently-measured fps ${measuredFps.toFixed(1)} < 50 (${framesDelivered} frames over ${elapsedMs}ms)`
      );
      assert.ok(
        Number.isFinite(gsFps) && gsFps > 0,
        `gameState.fps must be a finite positive number (SI.Loop's own rolling median), got ${gsFps}`
      );
      // gameState.fps must approximately track reality, not just satisfy a
      // type check -- a specimen that hardcodes/freezes fps to an arbitrary
      // "looks good" constant instead of computing a real rolling median
      // would pass the finite-positive check above but fail this one, since
      // it can't also happen to match the independently-measured value
      // (per strategy.md: "both must agree within tolerance if both are
      // read"). Tolerance is generous (window/sampling-offset slack), not a
      // tight equality check.
      const tolerance = Math.max(15, measuredFps * 0.5);
      assert.ok(
        Math.abs(gsFps - measuredFps) <= tolerance,
        `gameState.fps (${gsFps}) must approximately track the independently-measured fps (${measuredFps.toFixed(1)}) within tolerance (${tolerance.toFixed(1)})`
      );
    } finally {
      await page.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  let browserLaunched = false;
  if (browserTestsEnabled) {
    const { chromium } = await import('playwright-core');
    const executablePath = findChromeExecutable();
    browser = await chromium.launch({ headless: true, executablePath });
    browserLaunched = true;
  }

  let passed = 0;
  const total = tests.length;

  try {
    for (const t of tests) {
      try {
        await t.fn();
        passed++;
        process.stderr.write(`ok - ${t.name}\n`);
      } catch (e) {
        process.stderr.write(`FAIL - ${t.name}\n    ${(e && e.stack) || e}\n`);
      }
    }
  } finally {
    if (browserLaunched && browser) {
      await browser.close();
    }
  }

  const summary = { passed, total, passRate: total ? passed / total : 0 };
  console.log(JSON.stringify(summary));
  process.exit(passed < total ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`FATAL - ${(e && e.stack) || e}\n`);
  console.log(JSON.stringify({ passed: 0, total: tests.length || 1, passRate: 0 }));
  process.exit(1);
});
