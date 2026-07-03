---
summary: "Project-wide test strategy for the Space Invaders single-file game: 0.9 coverage target on pure logic modules, standard mutation policy (>=60% mutation score) via StrykerJS on the unit layer, a two-layer harness (Node vm unit/property tests for pure modules + Playwright/headless-Chromium e2e for the 5 sealed done-predicates), and a full predicate->check map. Pre-committed before any slice implementation."
---

# Test Strategy

This is the pre-committed, project-wide strategy that the per-slice sealed-suite
author (`stz-test-author`) follows inside each tournament. It does not write the
sealed tests itself; it fixes the bar and the mechanics so slice tournaments can't
be gamed against tests written after the fact.

## Coverage target: 0.9 (90%)

**Rationale for the number**: `run-config.json` locks `coverageTarget: 0.9` at
`strictness.standard`; not weakened here. 90% is achievable and meaningful for
this project specifically because `conventions.md`'s own dependency-direction
rule already separates the codebase into "pure logic" (tested directly) and
"impure edges" (rendering/audio, explicitly *not* what gets tested directly).
That separation is the natural coverage boundary — asking for 90% *statement*
coverage of `SI.Renderer`'s canvas-drawing internals would incentivize
meaningless assertions (canvas pixel-diffing) that add cost without adding
confidence; asking for 90% of the pure rule modules is exactly what protects
the 5 done-predicates.

**What counts (the denominator)**:
- Included, held to 90% statement+branch coverage: `rng.js`, `collision.js`,
  `entities/*.js` (player, alien, bullet, shield, ufo), `game.js` (state
  machine + orchestration), and the update/accumulator logic in `loop.js`
  (the pure while-loop math, not the `requestAnimationFrame` binding itself).
  These match `conventions.md`'s own "Dependency direction" table
  (`rng.js, collision.js <- no dependencies`, `entities/*.js <- depend on
  collision.js, rng.js only`, `game.js <- depends on entities/*, ...`) and
  contain 100% of the logic the 5 done-predicates assert on.
- Excluded from the 90% line-coverage denominator, but not untested:
  `renderer.js` (canvas drawing), `audio.js` (WebAudio synthesis), and the
  DOM/canvas/audio-context/input-listener wiring portion of `main.js`. Per
  `conventions.md`, these "read from game state but never mutate it" and are
  explicitly the impure edges. They get **smoke checks** instead of line
  coverage: renderer draw-call-does-not-throw across every game `state` value
  (`ready`/`playing`/`paused`/`gameover`/`won`) and confirmation the canvas
  isn't left blank; audio init-does-not-throw plus the documented
  `console.error`-and-continue fallback path when `AudioContext` construction
  fails (per conventions.md's error-handling rule) is exercised with a forced
  failure. These smoke checks are mandatory but don't count toward the 90%
  number — inflating coverage by unit-testing canvas draw calls would be
  measuring the wrong thing.

**How instrumentation works given build-by-concatenation (ADR-004)**:
`dist/index.html` has no source maps (ADR-004 explicitly rejects a bundler and
minification), so V8 coverage collected from the shipped artifact can't be
mapped back to `src/*.js` filenames without extra machinery. Rather than add
that machinery, coverage is measured at the layer where it's free and exact:
the **unit/property layer runs directly against `src/*.js`** (loaded
individually into a Node `vm` context — see Eval Harness below), so Node's
built-in `node --experimental-test-coverage` (V8 coverage, zero added
dependency) reports real per-file, per-line coverage with no mapping step.
The Playwright e2e layer (driving `dist/index.html`) is the source of truth
for the 5 done-predicates but is **not** the coverage-measurement layer —
running V8 coverage through an unmapped concatenated `<script>` block would
produce numbers that can't be attributed to a file, which is not
instrumentation, it's noise. If a future slice needs file-level coverage from
the browser layer too, `build.js` would need to start emitting a
`{file, startByte, endByte}` concatenation manifest — deliberately not doing
that now (YAGNI: the unit layer already covers the same pure code the e2e
layer exercises, since both load the identical `src/*.js` bytes).

## Mutation policy: standard

**Tool**: StrykerJS (`@stryker-mutator/core`), scoped to `src/rng.js`,
`src/collision.js`, `src/entities/*.js`, `src/game.js`, and the pure part of
`src/loop.js` — the same denominator as the coverage target. This is a
devDependency only (test tooling, never shipped), consistent with
`conventions.md`'s "package.json may only contain devDependencies... used for
testing and the build script" — a mutation tool is a concrete testing need,
not scope creep.

**Why the unit layer, not the e2e layer**: mutation testing runs the test
suite once per mutant (potentially hundreds of mutants across these modules).
Running headless Chromium + Playwright per mutant is too slow to be practical
at "standard" strictness; the Node `vm`-based unit/property suite (no browser
launch) runs in milliseconds per mutant. The Playwright sealed suite remains
authoritative for correctness of the 5 done-predicates against the *shipped*
artifact, but is intentionally excluded from the mutation loop for
pragmatic performance reasons — noted explicitly rather than silently
narrowing scope.

**Bar**: mutation score >= 60% (survival rate <= 40%) on the scoped modules,
computed per-module, not just in aggregate — a module can't hide a weak spot
behind another module's strong score. This is the standard-strictness
baseline (vs. a stricter 80%+ bar reserved for `strictness: strict` policy,
not in scope here). Every surviving mutant in a PR/tournament diff must be
triaged in review: either killed by a new/strengthened unit or property test,
or explicitly annotated as equivalent/behaviorally-irrelevant (e.g., a
mutant that swaps `<` for `<=` on a value that provably never lands on the
boundary) with a one-line justification. Unreviewed survivors block the
tournament at standard strictness.

## Property-based vs example-based mix

**Property-based** (hand-rolled sweeps over deterministic input ranges via
`SI.RNG.seed(n)` — no `fast-check` or other property-testing package added;
per the zero-added-dependency posture and the fact that these are simple
numeric/geometric invariants, a `for` loop over seeded/swept inputs asserting
an invariant on every iteration is sufficient at the standard bar and avoids
a new devDependency for what ~15 lines does):
- AABB overlap symmetry and edge-exclusion (`collision.js`) — sweep random
  rect pairs, assert `overlap(a,b) === overlap(b,a)` and edge-touching never
  counts as overlap (this specific formula was already validated in
  `10-research/validation.md` Claim 3b; the property test locks it in).
- Player horizontal clamp (`player.x` always in `[0, width - shipWidth]`) —
  hold left/right input across an arbitrary number of `update(dt)` steps,
  assert the clamp holds on *every* step, not just a final snapshot. This is
  the direct property form of a clause in P1's predicate text.
- Grid-as-rigid-block translation (P2) — after N steps with no edge contact,
  every alien's per-step x-delta is identical across the whole grid, for
  multiple starting configurations/directions.
- March-interval monotonicity (P2) — as remaining-alien-count decreases
  across the full range (55 -> 1), the step interval never increases.
- Shield-cell integrity never negative, and a cell blocks bullets once
  integrity <= 0 (P4) — sweep repeated hits on the same cell.
- Gameover terminality (P3) — once `state === 'gameover'`, further
  `update(dt)` calls never change `lives`/`score`/`state`.

**Example-based** (concrete fixtures, exact expected values — used wherever
the predicate names a specific number or a specific transition, which
property sweeps would only obscure):
- Exact point values on kill (10/20/30 by row) and exact UFO bonus from a
  seeded RNG value.
- Exact wave-transition behavior (wave N -> N+1, full new grid spawned).
- Exact lives decrement (by 1, not "by some positive amount") and the
  lives===0 gameover transition.
- Exact grid-edge reversal (direction sign flips, every alien y += rowStep
  exactly once) on the specific frame contact happens.

Rule of thumb used throughout: if the predicate text has a number in it
(`by 1`, `> 0`, `>= 50`), there is at least one example-based test asserting
that literal number; if the predicate text has an invariant/relationship
(`stays within`, `as one block`, `shrinks as ... drops`), there is at least
one property-based test sweeping it.

## Eval harness

**Layer 1 — unit/property (`tests/unit/*.test.js`, Node built-in `node:test`
+ `node:assert`, zero added dependency)**: each `src/*.js` pure module is
loaded once per test file into a Node `vm.Context` seeded with a bare
`{ window: {} }` global (matching what the module expects — it does
`window.SI = window.SI || {}` then attaches to it, per ADR-001), in the fixed
dependency order documented in `conventions.md`
(`rng -> collision -> entities/* -> game`, `renderer`/`audio`/`loop`'s rAF
binding/`main` intentionally not loaded here since they need DOM/Canvas/Audio
globals this layer doesn't provide). Tests then call `SI.Collision.*`,
`SI.RNG.*`, `SI.Game.update(dt)`, etc. directly as plain functions. This is
where the 90% coverage number and the mutation-testing loop are measured —
fast (no browser), so it can run per-mutant and on every commit.

**Layer 2 — sealed e2e (`tests/p1..p5-*.spec.js`, Playwright, headless
Chromium)**: authoritative check for the 5 done-predicates against the real
shipped artifact.
- **Build-then-test**: an `npm pretest` step (or Playwright `globalSetup`)
  runs `node build.js` once before the suite so tests always run against a
  freshly built `dist/index.html`, per ADR-004 ("never against `src/`
  directly").
- **Loading the specimen**: `page.goto('file://' + path.resolve('dist/index.html'))`
  (or served via a trivial static server if `file://` proves restrictive for
  a given Playwright config — decided at implementation time, not a strategy
  concern). Each Playwright test gets a fresh `page`, so game state always
  starts at `state: 'ready'` — no cross-test contamination.
- **Driving the simulation deterministically**: tests do **not** wait on
  wall-clock/`waitForTimeout` to produce game-logic changes (P1-P4). Per
  ADR-002, `SI.Game.update(dt)` is callable directly with an explicit `dt`.
  Tests batch this into a single `page.evaluate()` call for performance
  (per `10-research/external/04-window-state-testing.md`'s "batch multiple
  assertions" guidance, extended to batch multiple update steps):
  ```js
  await page.evaluate((steps) => {
    for (let i = 0; i < steps; i++) SI.Game.update(SI.Config.FIXED_TIMESTEP_MS);
  }, N);
  ```
  Input is driven via `SI.Game.input` intent flags (e.g.
  `page.evaluate(() => { SI.Game.input.fire = true; })`) rather than
  synthetic keyboard events, for the same determinism reason — real key
  events are reserved for one separate smoke test per control
  (Left/Right/Space/P/Enter) confirming the listeners are wired, not for the
  predicate assertions themselves.
- **Fixtures**: seeded RNG (`page.evaluate(() => SI.RNG.seed(42))`) before
  any test that touches UFO spawn/bonus or alien-fire selection (P4), called
  before the state transition under test, per ADR-003. P1-P3 don't depend on
  RNG per ADR-003's own consequence note, so they don't need seeding but seed
  anyway for full-suite reproducibility hygiene.
- **Reading state**: `const state = await page.evaluate(() => window.gameState)`,
  batched per assertion group. Non-retrying `expect()` matchers
  (`toBe`, `toBeGreaterThan`, `toMatchObject`) are correct here since
  `gameState` is a synchronous in-memory snapshot after a known number of
  `update()` calls (confirmed pattern, `10-research/validation.md` Claim 1).
- **Metrics (P5 only)**: this is the one place the harness uses real rAF/
  wall-clock time instead of manual stepping, because fps is a property of
  real frame delivery, not of `update()` step count. The game's own
  `SI.Loop` computes a rolling median into `gameState.fps` (per ADR-002); the
  test additionally simulates continuous input (movement + firing, per
  `10-research/external/05-fps-measurement.md`'s "active gameplay" caution
  that a static screen may be optimized differently) for a 5s window, then
  asserts `gameState.fps >= 50` (or its own independently-collected sample
  set, whichever `SI.Loop`'s documented contract exposes — both must agree
  within tolerance if both are read). Per `10-research/validation.md` Claim 2
  (critical finding), no `--use-gl=egl`/GPU launch flags were needed to hit
  60fps median on the dev sandbox, but the Playwright config exposes
  `launchOptions.args` as overridable via an env var so this can be
  re-tuned on whatever machine actually runs the sealed suite in CI — the
  strategy does not hard-code a flag requirement that validation couldn't
  reproduce, and flags P5 as the predicate most likely to need
  environment-specific recalibration.

## Predicate -> check map

Every row is a planned, concrete check. "Kind" = property (P) or example (E);
unit-layer checks run in Layer 1, sealed checks run in Layer 2.

| Predicate | Check name | What it asserts | Kind / Layer |
|---|---|---|---|
| P1 move-shoot-kill | `unit: collision.aabb-symmetry` | `overlap(a,b)===overlap(b,a)`, edge-touch excluded | P / unit |
| P1 move-shoot-kill | `unit: player.clamp-holds-every-step` | `player.x` in `[0, width-shipWidth]` after every one of N steps of sustained left/right input, not just final | P / unit |
| P1 move-shoot-kill | `p1: fire-spawns-one-bullet` | `SI.Game.input.fire=true` then one `update()` -> `playerBullets.length` increases by exactly 1 | E / sealed |
| P1 move-shoot-kill | `p1: bullet-kills-alien-and-scores-exact-points` | bullet overlapping a known row-N alien removes that alien AND `score` increases by exactly that row's point value (10/20/30) | E / sealed |
| P2 alien-march | `unit: grid-translates-as-rigid-block` | uniform per-step x-delta across all aliens, no edge contact, multiple start configs | P / unit |
| P2 alien-march | `unit: march-interval-monotonic-non-increasing` | step interval never increases as remaining-alien-count drops 55->1 | P / unit |
| P2 alien-march | `p2: edge-contact-triggers-drop-and-reverse` | on the exact step an alien reaches a screen edge, next step: direction sign flips AND every alien's y increases by rowStep exactly once | E / sealed |
| P3 lives-gameover | `unit: gameover-is-terminal` | once `state==='gameover'`, further `update(dt)` never changes `lives`/`score`/`state` | P / unit |
| P3 lives-gameover | `p3: alien-bullet-hit-decrements-lives-by-one` | seeded alien bullet overlapping player, one `update()` -> `lives` drops by exactly 1, bullet consumed | E / sealed |
| P3 lives-gameover | `p3: lives-zero-triggers-gameover` | drive 3 hits from `lives:3` start -> `state==='gameover'` after the 3rd, not before | E / sealed |
| P3 lives-gameover | `p3: alien-reaches-player-row-triggers-gameover` | march stepped until an alien's y reaches player's row -> `state==='gameover'` regardless of remaining `lives` | E / sealed |
| P4 waves-shields-ufo | `unit: shield-integrity-never-negative` | repeated hits on one cell: integrity floors at 0/blocked, never negative, bullet always consumed | P / unit |
| P4 waves-shields-ufo | `p4: last-alien-kill-increments-wave-and-respawns-faster-grid` | destroying the 55th alien -> `wave+=1`, `aliens.length` back to full grid, new grid's initial march interval strictly less than wave-1's initial interval | E / sealed |
| P4 waves-shields-ufo | `p4: shield-hit-reduces-cell-integrity-and-consumes-bullet` | bullet aimed at a shield cell -> that cell's integrity decreases by expected amount, bullet removed from `playerBullets` | E / sealed |
| P4 waves-shields-ufo | `p4: ufo-kill-adds-seeded-bonus-to-score` | `SI.RNG.seed(n)` -> forced UFO active -> bullet overlap -> `update()` -> `score` increases by exactly the deterministic bonus for seed `n` (in 50-300), `ufo.active===false` | E / sealed |
| P5 fps | `p5: median-fps-over-5s-active-gameplay` | headless Chromium, `dist/index.html`, continuous simulated input for 5s, `median_fps >= 50` | metric-threshold / sealed (rAF/wall-clock, not manual `update()` stepping) |

## Summary of bars (do not weaken)

- Coverage: **90%** statement+branch on `rng.js`, `collision.js`,
  `entities/*.js`, `game.js`, `loop.js`'s pure logic; `renderer.js`/`audio.js`/
  `main.js`'s DOM wiring get mandatory smoke checks instead, not counted in
  the 90%.
- Mutation: **standard** — StrykerJS on the same denominator, mutation score
  **>= 60%** per module, every surviving mutant triaged (killed or justified)
  in review, unreviewed survivors block the tournament.
- Every one of the 5 done-predicates (P1-P5) has at least one concrete named
  check above; P1/P2/P3/P4 each have both a property-based unit check on
  their core invariant and example-based sealed Playwright checks on their
  exact-value transitions; P5 is a single metric-threshold sealed check by
  necessity (fps is inherently a measured, not asserted-invariant, quantity).
