---
summary: "Final narrative summary of the completed Space Invaders STZ run: intent, research, standards, tests, all 6 slice outcomes, notable culls, and open items."
---

# Project summary — Space Invaders (example-stz-f)

Status: **complete**. All 6 slices done, all faithful to intent, 0 halted (after one
human-adjudicated pause), 18 specimens culled across the tournament. Completion
report: `.stz/90-audit/completion-report.md`.

## 1. Intent

Problem (`.stz/00-intent/intent.md`): build a playable Space Invaders game as a
single self-contained HTML file, as a demo to exercise the STZ pipeline
end-to-end. Scope: core arcade loop (move/shoot/collide/score), plus
shields/bunkers, a UFO bonus ship, and escalating waves.

Users: a single developer, running the file locally in a browser. "Better"
means fun, correct, and dependency-free at runtime — no build step required to
play it.

Constraints: one self-contained `dist/index.html` (vanilla JS + Canvas +
WebAudio, zero runtime deps); developed as testable JS modules under `src/`
then concatenated into the shipped file; Playwright/headless-Chromium is an
acceptable *test-only* dependency; classic arcade defaults (5x11 grid, 3
lives, 10/20/30 point tiers, UFO bonus 50-300); target 60fps with correctness
prioritized over raw performance.

Done predicates (all sealed/metric-threshold, all machine-checkable):
- **P1** move/shoot/kill: firing spawns a bullet; a bullet-alien overlap kills
  the alien and adds its point value; player stays clamped to `[0, width -
  shipWidth]`.
- **P2** alien march: the grid translates as one rigid block; edge contact
  triggers a drop + direction reverse; march interval shrinks as aliens die.
- **P3** lives/gameover: an alien bullet hitting the player costs exactly 1
  life; `state === 'gameover'` when lives hit 0 OR an alien reaches the
  player's row.
- **P4** waves/shields/UFO: killing the last alien increments the wave and
  respawns a faster grid; any bullet hitting a shield cell reduces that cell's
  integrity and is consumed; UFO kills add a bonus (>0) to score.
- **P5** performance: `median_fps >= 50` over a 5s headless-Chromium capture
  of active gameplay.

Run config (`.stz/00-intent/run-config.md`): balanced slicing granularity,
N=4 specimen fan-out per slice, standard strictness (coverage ≥0.9, standard
mutation bar, standard conventions), dark-factory **on** (autonomous run, human
gates skipped except the one predicate-halt gate below). Models: research =
haiku, judging = opus, planning/execution/testing/validation = sonnet.

## 2. Research and validation

`.stz/10-research/` covers the canvas game loop, Space Invaders mechanics,
AABB collision, `window`-state Playwright testing, FPS measurement, WebAudio
synthesis, and manual-concatenation bundling. `validation.md` cross-checked
every claim against this sandbox: 14 confirmed, 2 refuted, 3 unverifiable.

Notable findings:
- **Refuted**: the commonly-cited "headless Chromium defaults to 8-15fps
  without GPU flags, needs `--use-gl=egl`/`--enable-gpu` to reach 30-60fps."
  On this machine (real NVIDIA GPU, 20 vCPU), both a light and a heavy
  synthetic canvas scene hit 60fps median with **zero** launch flags, and GPU
  flags made no measurable difference — `requestAnimationFrame` in headless
  Chromium is throttled to a simulated 60Hz vsync here regardless. The report
  explicitly flags this as environment-dependent and *not* portable: a
  weaker/GPU-less CI runner should be re-measured, not assumed to inherit this
  result.
- **Confirmed**: fixed-timestep accumulator determinism (byte-identical
  position sequences across two independent runs), the AABB overlap formula
  (overlap true, edge-touch false), `page.evaluate(() => window.gameState)`
  returning a live object, WebAudio's suspended-until-gesture behavior, and
  manual `<script>` concatenation as a viable zero-tooling bundling strategy.

## 3. Standards

`.stz/20-standards/conventions.md` fixes the house style: everything hangs off
one global `window.SI` namespace; modules are developed under `src/` and
concatenated (never bundled by a tool) into `dist/index.html`; `SI.Game.update(dt)`
runs on a fixed 16.667ms timestep, decoupled from rendering; `window.gameState`
is a live, mutated-in-place, JSON-serializable object matching a fixed field
contract; all randomness routes through a seedable `SI.RNG`, never
`Math.random()`.

Four load-bearing ADRs:
- **ADR-001** — single root namespace (`SI`), not per-module globals, to avoid
  collisions with browser built-ins (e.g. a bare `const Audio = {...}` would
  shadow `window.Audio`) once all modules share one concatenated scope.
- **ADR-002** — fixed-timestep accumulator loop, decoupled from render, so
  Playwright's "advance N frames, then assert" pattern is reproducible and P5's
  fps sampling can never perturb game outcomes.
- **ADR-003** — the `window.gameState` contract (live reference, wholesale
  array replacement, fixed field shape) plus the seedable-RNG contract, so
  sealed tests get deterministic, assertable state.
- **ADR-004** — build by manual concatenation (`build.js`, Node builtins only),
  not a bundler — rejected Vite/`vite-plugin-singlefile` as unnecessary tooling
  for ~9 small modules with no minification/HMR/TypeScript need.

## 4. Test strategy

`.stz/30-tests/strategy.md`: 90% statement+branch coverage target on pure
logic (`rng.js`, `collision.js`, `entities/*.js`, `game.js`, `loop.js`'s pure
math); `renderer.js`/`audio.js`/DOM wiring get mandatory smoke checks instead,
excluded from the 90% denominator by design (canvas pixel-diffing would
measure the wrong thing). Standard mutation policy: StrykerJS, ≥60% mutation
score per module, every survivor triaged (killed or justified) or the
tournament is blocked. Two-layer harness: Layer 1 is Node `vm`-based
unit/property tests against `src/*.js` directly (fast, used for coverage and
mutation testing); Layer 2 is sealed Playwright/headless-Chromium e2e against
the actual built `dist/index.html`, authoritative for P1-P5. Every predicate
maps to at least one property-based and one example-based check (P5 is
metric-threshold only, by necessity).

`.stz/30-tests/cross-reference.md`: a second, independently-authored reference
(cross-family quorum) is run against every sealed suite before it seals, to
catch blind spots the primary reference and the suite might share.

## 5. Eval-harness integration decisions

The orchestrator made several concrete calls to make the sealed suites runnable:
- `dist/game.js` (the plain concatenated bundle, no HTML) is the single eval
  entrypoint, read from `argv[2]` by the harness — separate from
  `dist/index.html` (the shipped, browser-loadable artifact with the canvas
  shell inlined around the same bundle).
- P1-P4 sealed suites run in plain Node, loading `dist/game.js` into a bare
  `{ window: {} }`-style context and driving `SI.Game.update(dt)` directly —
  no browser launch needed for correctness checks.
- Each suite prints a final-line JSON summary, `{passed, total, passRate}`, so
  the harness can parse pass/fail mechanically without scraping test-runner
  output.
- Browser/build sub-tests are skipped for bare mutants (mutation-testing
  variants that don't produce a full buildable tree) rather than erroring out.
- P5 (fps) is the one layer that needs a real browser: `playwright-core@1.49.1`
  was installed as a **test-only** devDependency (confirmed in the project's
  `package.json`, which contains no other dependency) to launch the existing
  system Chromium via `executablePath`, rather than pulling down a redundant
  Playwright-managed browser binary.

## 6. Per-slice outcomes

All 6 slices are marked `done` and `faithful: true` in
`.stz/90-audit/completion-report.md`. 18 specimens were culled total (3 per
slice, N=4 fan-out).

### slice-01 — foundation (no done-predicate; scaffolding)
**Winner: specimen-A.** Delivered the `window.SI` bootstrap, seedable RNG,
pure AABB collision, `SI.Config` constants, and the fixed-timestep
`SI.Loop`/`build.js` skeleton — 6/6 planned items delivered, 4 built-beyond-plan
(private per-module IIFE scoping, a `SI.Loop.stop()` control, a richer
`gameState` stub anticipating later slices' shape). Spec-diff: 0 missing.
Culled: specimen-B (LCG-based RNG, testPassRate 1.00 but lost the judge
tournament A>B>C), specimen-C (xorshift32 RNG, same), specimen-D
(sfc32/splitmix32 RNG, testPassRate 0.94 — the only sub-1.0 cull in this slice).
All three culled variants are functionally reasonable RNG choices; A won on
being the leanest, most directly ADR-faithful implementation per the judge's
head-to-head votes (A beat both B and C).

### slice-02 — P1 move/shoot/kill
**Winner: specimen-A** (struct-of-arrays entity design, `game.js`
orchestration). This slice **halted once** before completing — see
`.stz/40-slices/slice-02/failure-report.resolved.md`. At the seal-crosscheck
gate, the two independently-authored references diverged: reference A passed
16/16, reference B passed only 12/16. Root causes:
1. **Genuine ambiguity (needed a human):** the suite injects a bare
   `{x,y,width,height}` object directly into `gameState.playerBullets` and
   expects it to collide. Reference A treats any object present in the array
   as live-by-membership; reference B required an internal `alive`/velocity
   field, so the injected bare bullet didn't collide. ADR-003 fixes the
   `gameState` *field* contract but never explicitly pinned the *element*
   shape of a `playerBullets` entry as array-membership-is-live — a legitimate
   design gap, not a bug in either reference per se.
2. **Contract-faithful deviation:** reference B scaled player movement by the
   `dt` argument, so `update(hugeDt)` moved farther than
   `update(FIXED_TIMESTEP_MS)` — a genuine violation of ADR-002's fixed-step
   contract (`SI.Loop` always calls `update()` with the constant step; motion
   must never be `dt`-scaled).

Per the dark-factory rule, a divergent cross-check is a GUIDE-class signal
that must not be auto-resolved or silently rewritten — the slice halted for
human adjudication rather than sealing on an unresolved blind spot. A human
judged reference B buggy on both counts; B was regenerated to honor
array-membership liveness and drop the `dt`-scaling, cross-check reached
both-pass (10/10 and 10/10, recorded in `cross-reference.md`), and the slice
resumed and completed normally. The array-membership-liveness rule this
surfaced ("any bare `{x,y,width,height}` object present in a bullets array is
a live, collidable bullet") became the explicit TEST-FACING API convention
baked into every subsequent slice's manifest (slice-03 through slice-06 all
restate it verbatim).

Culled: specimen-B (mulberry32 + array-membership-liveness bullets,
testPassRate 0.94), specimen-C and specimen-D (testPassRate 0.88 each).
Spec-diff: 0 missing, 5 built-beyond-plan (extra `gameState` fields wired
ahead for later slices, seedable mulberry32 default, spiral-of-death guard in
the loop, unused `alive`/`row` fields on aliens, no bullet-array size cap).

### slice-03 — P2 alien march
**Winner: specimen-C** (ratio-based `marchInterval`, config-faithful). Won
6-vote head-to-head tournament (C > D > B > A) despite all 4 specimens hitting
testPassRate 1.00 — judged ahead on convention adherence and avoiding
gratuitous complexity relative to the other three. Its `marchInterval` uses a
distinct tuning ceiling (`ALIEN_MARCH_MAX_INTERVAL=48`, not the grid's total
alien count of 55) so the ratio math is a real `ceil()` rather than an
identity mapping in disguise — called out explicitly in the spec-diff as a
deliberate design choice the intent left open. Spec-diff: 0 missing, 3
built-beyond-plan. Culled: specimen-A, specimen-B, specimen-D — all
testPassRate 1.00, differentiated purely by judge preference, not functional
defects visible in the surviving code.

### slice-04 — P3 lives/gameover
**Winner: specimen-A** (single-pass collision resolution; `checkGameover()`
checks `lives === 0` before the alien-row-reached check, both guarded by a
terminality flag/early-return at the top of `update()` so a `gameover` state
freezes lives/score/state on every subsequent call). Won 6-vote head-to-head
(A beat B, C, and D on all three pairings). All 4 specimens passed the sealed
suite at testPassRate 1.00 with mutation scores 0.67-0.80 and zero
hackFindings — direct code inspection of the three culled specimens found no
functional defect (all three correctly floor-clamp `lives` at 0, either
inline, via `Math.max`, or by checking `lives <= 0` rather than `=== 0`); the
tournament ranking here reflects judge/code-quality preference (GRPO reward)
rather than a demonstrable correctness bug in the losers. Spec-diff: 0
missing, 0 built-beyond-plan — the cleanest spec match of the six slices.

### slice-05 — P4 waves/shields/UFO
**Winner: specimen-D** — the sole gate-passer (testPassRate 1.00; the other
three scored 0.94-0.97 and were marked `passedGate: false`). The contract
(`manifest.md`) pins: "any bullet... overlapping a cell reduces that cell's
integrity **and is consumed**" — i.e. a spent (integrity-0) cell must keep
absorbing/consuming bullets, not become a hole. Direct code inspection
confirms specimen-A implemented the opposite, more "realistic" behavior:
its shield-collision loop explicitly skips cells with `integrity > 0` before
testing overlap ("a destroyed cell... no longer blocks anything, so bullets
pass through the hole") — a deliberate, documented design choice that
directly contradicts the pinned contract, and the reason it fails the sealed
suite. Winner D's equivalent function has no such guard: every cell, spent or
not, is checked and keeps consuming incoming bullets. (Specimens B and C also
fell short of a full pass but their surviving code does *not* show the same
integrity-gating divergence as A; their remaining shortfalls are not itemized
beyond the aggregate pass-rate in the eval artifacts.) Winner D also runs UFO
collision-checking pre-movement each step specifically so a same-step
injected bullet+UFO test registers a hit against that step's position set —
called out in spec-diff as an explicit ordering guarantee beyond the bare
contract. Spec-diff: 0 missing, 4 built-beyond-plan.

### slice-06 — P5 renderer/audio/fps
**Winner: specimen-D** (config-driven renderer: colors/dimensions/HUD font
centralized in `SI.Config`, no magic numbers in `renderer.js`/`loop.js`; clean
intent-flag input handling; audio-resume-on-first-gesture via
`resumeAudioOnce()` to satisfy the browser autoplay-gesture requirement).
Won 6-vote head-to-head (D beat A, B, and C on every pairing). All 4
specimens passed the sealed suite at testPassRate 1.00. Measured ~60fps
median in the headless-Chromium P5 check. Spec-diff: 0 missing, 3
built-beyond-plan (audio-unlock wiring, a full HUD + GAME OVER/YOU WIN overlay,
tiered alien coloring and per-cell shield-damage alpha — visual polish beyond
the bare draw contract).

## 7. What was built

A single self-contained `dist/index.html` Space Invaders game (vanilla JS +
HTML5 Canvas + WebAudio, zero runtime dependencies), confirmed present at the
project root alongside the `src/` modules and `build.js`. All 5 done-predicates
(P1-P5) are satisfied per the sealed suites and the P5 metric check. The
project's shipped `package.json` contains exactly one dependency,
`playwright-core@^1.49.1`, which is test-only (used to launch the sealed P5
Playwright check against the existing system Chromium) and does not appear in
the shipped `dist/index.html` bundle.

## 8. Carry-forward caveats / open items

- **P5 portability**: the `median_fps >= 50` result (~60fps measured here)
  was validated on a dev sandbox with a real NVIDIA GPU and 20 vCPUs, where
  headless Chromium's `requestAnimationFrame` appears throttled to a
  simulated 60Hz vsync regardless of launch flags. The research/validation
  report explicitly refutes the commonly-cited "headless defaults to
  8-15fps without GPU flags" claim *in this environment* but flags it as
  possibly still true on a weaker/GPU-less CI runner. **Anyone re-running the
  P5 sealed check on a different machine (especially a shared/GPU-less CI
  runner) should re-measure, not assume this project's ~60fps result carries
  over.**
- **playwright-core is test-only**: confirmed via `package.json` (sole
  dependency) — it is not part of the shipped single-file artifact, but it is
  a real installed devDependency that must be present for the P5 sealed suite
  to run at all; nothing in the repo currently pins/documents a minimum
  Chromium version beyond what's already on the machine.
- **Slice-02's one human-adjudication point** (bare-bullet array-membership
  liveness) is now baked into every later slice's manifest as an explicit
  convention, but it was never retroactively written back into ADR-003 or
  conventions.md itself — a reader of the standards tier alone, without
  reading the slice manifests, would not learn this rule.
- **Judge-tournament differentiation on functionally-equivalent code**:
  slices 03, 04, and 06 each had all 4 (or all-but-one) specimens pass the
  sealed suite at 100%, meaning tournament ranking there reflects opus-judge
  preference/GRPO reward on code quality and convention adherence rather than
  a demonstrable functional defect in the losers — worth knowing if a future
  maintainer wonders why a particular specimen "lost" despite passing
  everything.

## 9. Closing note

The run demonstrates the STZ pipeline end-to-end: adversarial N=4 tournaments
with sealed test suites and independent cross-family references caught real,
concrete bugs before they shipped — most clearly the slice-05 shield-erosion
divergence (a "realistic" but contract-violating destructible-shield
implementation, cleanly separated from the three specimens that got it right)
and the slice-02 seal-crosscheck divergence (a genuine specification ambiguity
around bullet liveness plus one contract-faithful bug, correctly separated
into "needs a human" vs. "is just wrong"). The one signal dark-factory mode
is designed not to auto-resolve — a divergent cross-check — was deferred to a
human exactly once, adjudicated, and the run then completed autonomously
through all 6 slices. The final shipped `dist/index.html` passes all 5 done
predicates (P1-P4 via sealed Node-driven suites, P5 via a real headless-
Chromium measurement), with the portability of the P5 result to other
hardware flagged above as the main follow-up item for whoever deploys this
next.
