---
summary: "Proposed 6-slice DAG for the Space Invaders single-file game: one foundation slice (no predicate) followed by 5 predicate-owning slices in a linear chain, matching the SI-namespace/fixed-timestep/gameState architecture locked in the ADRs."
---

# Proposed slice DAG

Granularity: **balanced** (6 slices). Shape: one infra-only foundation slice,
then one slice per done-predicate, each extending the shared `SI.Game.update()`
state machine on top of the previous slice's entities/contract. The chain is
linear because `conventions.md`'s own dependency-direction table
(`rng/collision <- entities <- game <- loop <- main`) and the shared, single
`window.gameState` object mean every later predicate's behavior is layered on
top of the same growing state machine, not an independent subsystem — P3 needs
P2's march data to detect "alien reaches player row", P4's wave-respawn needs
P2's grid/march config, and P5 needs the complete entity set to render/drive/
measure. This is the most honest DAG shape for this project, not
under-decomposition.

## Slices, in topological order

### slice-01 — foundation-scaffold
**Contract**: `window.SI` namespace bootstrap (`window.SI = window.SI || {}`);
`SI.RNG.seed(n)` / `SI.RNG.next()` (seedable PRNG, `Math.random()`-compatible
interface); `SI.Collision.aabbOverlap(a, b)` (pure AABB overlap, edge-touch
excluded); `SI.Config` (grid size, lives, point values, UFO bonus range, fixed
timestep — all named constants, no magic numbers); `SI.Loop` fixed-timestep
accumulator skeleton (`SI.Loop.start()`, capped-delta accumulator, calls
`SI.Game.update(FIXED_TIMESTEP_MS)` in a while-loop then `SI.Renderer.draw()`
once, per ADR-002) with no game rules behind it yet; `build.js` (Node builtins
only) concatenating `src/*.js` in the ADR-004 dependency order into
`dist/index.html` (canvas shell + minimal CSS + a stub `window.gameState`
matching the ADR-003 field shape at `state: 'ready'`).
**dependsOn**: none.
**complexity**: 3.
**Owns**: no done-predicate (pure infrastructure — namespace, RNG, collision
math, loop skeleton, build pipeline). Every later slice depends on this
contract instead of duplicating it.
**Rationale**: every other slice needs `SI.RNG`, `SI.Collision`, the loop
shape, and a buildable `dist/index.html` to exist before any game rule can be
tested against the shipped artifact; building it once up front avoids 5x
duplicated scaffolding across predicate slices.

### slice-02 — player-move-shoot-kill
**Contract**: `SI.Player` (position/velocity, horizontal clamp to
`[0, width - shipWidth]`); `SI.Bullet` (player-bullet factory + straight-line
update); a static `SI.Alien` grid (5x11, per-row point values 10/20/30, no
march movement yet); `SI.Game.update(dt)` wired to: consume
`SI.Game.input.fire` to spawn exactly one `playerBullets` entry per press,
move/clamp the player, and run bullet-vs-alien collision via
`SI.Collision.aabbOverlap` that removes the hit alien and adds its exact point
value to `score`. Populates `window.gameState.player`, `.aliens`,
`.playerBullets`.
**dependsOn**: slice-01.
**complexity**: 3.
**Owns**: `P1-move-shoot-kill`.
**Rationale**: the smallest end-to-end vertical slice that proves input ->
state-mutation -> collision -> score, on a static (non-marching) grid — the
natural first playable contract, and the one every later predicate slice
extends.

### slice-03 — alien-grid-march
**Contract**: extends `SI.Alien`'s grid with march behavior inside
`SI.Game.update(dt)` — the whole grid translates as one rigid block each march
step (identical per-step x-delta for every alien); on any alien touching a
screen edge, the whole grid steps down by `rowStep` and horizontal direction
reverses on the very next step; march step interval is a function of
remaining-alive-alien count and is monotonically non-increasing as that count
drops from 55 to 1.
**dependsOn**: slice-02 (extends the alien grid/entity slice-02 created).
**complexity**: 3.
**Owns**: `P2-alien-march`.
**Rationale**: march is a pure extension of the alien entity/grid contract
already established by slice-02 — same entities, new per-tick movement rule;
keeping it a separate slice (rather than folding into slice-02) keeps each
tournament's tested surface small per `granularity: balanced`.

### slice-04 — lives-and-gameover
**Contract**: alien-bullet variant of `SI.Bullet` plus alien-fire-column
selection via `SI.RNG.next()`; collision of `alienBullets` vs `SI.Player` in
`SI.Game.update(dt)` decrements `lives` by exactly 1 and consumes the bullet;
`SI.Game.state` transitions to `'gameover'` when `lives === 0` OR any alive
alien's row (per slice-03's march data) reaches the player's row; gameover is
terminal — once `state === 'gameover'`, further `update(dt)` calls never
change `lives`/`score`/`state`.
**dependsOn**: slice-03 (needs live march/grid-position data to evaluate the
"alien reaches player row" clause).
**complexity**: 3.
**Owns**: `P3-lives-gameover`.
**Rationale**: the loss condition depends on both the player entity
(slice-02) and the marching grid's row position (slice-03), so it must sit
after both; it's the natural "close the core loop" slice before adding the
optional/peripheral systems in P4.

### slice-05 — waves-shields-ufo
**Contract**: `SI.Shield` (per-cell integrity array; any bullet — player or
alien — overlapping a cell reduces that cell's integrity and is consumed;
integrity floors at 0, never negative); `SI.Ufo` (RNG-timed spawn via
`SI.RNG.next()`, traverses the top of the screen, bonus value in `[50, 300]`
drawn via `SI.RNG.next()`); wave transition in `SI.Game.update(dt)` — killing
the last alive alien increments `wave` and respawns a full new grid whose
initial march interval is strictly less than the previous wave's initial
interval (reusing slice-03's march-interval function); a player bullet
overlapping the active UFO removes it, adds its bonus (`> 0`) to `score`, and
sets `ufo.active = false`.
**dependsOn**: slice-04 (extends the same `SI.Game.update` state machine;
wave-respawn reuses slice-03's grid/march config, shields interact with both
player and alien bullets from slices 02/04).
**complexity**: 4.
**Owns**: `P4-waves-shields-ufo`.
**Rationale**: three related-but-separable mechanics (shields, UFO, wave
escalation) bundled into one slice because they're all "peripheral systems
layered on the already-complete core loop" and none of the three is complex
enough alone to justify its own tournament at balanced granularity; splitting
further would push toward fine-grained over coarse-grained, which the
balanced setting explicitly avoids.

### slice-06 — renderer-audio-fps
**Contract**: `SI.Renderer.draw(state)` (canvas pixel-art drawing for
player/aliens/bullets/shields/ufo, read-only — never mutates state);
`SI.Audio` (WebAudio SFX synthesis; `console.error`-and-continue fallback if
`AudioContext` construction fails, per the error-handling convention);
`main.js` bootstrap (canvas + audio-context setup, keyboard wiring for
Left/Right/Space/P/Enter mapped to `SI.Game.input` intent flags,
`window.gameState = SI.Game.state` live-reference wiring per ADR-003, calls
`SI.Loop.start()`); `SI.Loop` computes a rolling-median `fps` into
`gameState.fps` from real rAF timing, informational only and never fed back
into `update()`.
**dependsOn**: slice-05 (needs the complete entity set — player, aliens,
bullets, shields, UFO — to render, drive with real input, and measure fps
against the fully playable game).
**complexity**: 4.
**Owns**: `P5-fps`.
**Rationale**: fps is a property of the *whole* running game under real
rAF/wall-clock timing with continuous simulated input (per
`10-research/external/05-fps-measurement.md`'s "active gameplay" caution), so
it can only be meaningfully measured once every other system (slices 02-05)
exists to actually drive load through the render/audio/input path; this is
also the slice that turns `dist/index.html` from "logic-complete" into
"actually playable/audible" per the intent's zero-dependency shipping
constraint.

## Dependency edges

```
slice-01 (foundation, no predicate)
  -> slice-02 (P1-move-shoot-kill)
       -> slice-03 (P2-alien-march)
            -> slice-04 (P3-lives-gameover)
                 -> slice-05 (P4-waves-shields-ufo)
                      -> slice-06 (P5-fps)
```

## Predicate ownership (every predicate owned exactly once)

| Predicate | Owning slice |
|---|---|
| P1-move-shoot-kill | slice-02 |
| P2-alien-march | slice-03 |
| P3-lives-gameover | slice-04 |
| P4-waves-shields-ufo | slice-05 |
| P5-fps | slice-06 |

No predicate is dropped, split, or double-owned. slice-01 intentionally owns
none (pure scaffolding/build-pipeline slice) — its tournament is judged on
contract conformance (namespace hygiene, RNG determinism, collision-math
correctness, build.js producing a valid `dist/index.html`) plus the mandatory
unit-layer smoke checks from `30-tests/strategy.md`, not on a sealed
done-predicate.

## Notes / risks

- The chain is linear, not branching. This is a deliberate reflection of the
  project's real dependency direction (one shared `SI.Game.update()` and one
  shared `window.gameState` object per ADR-001/ADR-003), not an artifact of
  under-thinking the DAG — there's no independent subsystem here that could
  run in parallel without touching the same state machine.
- slice-05 bundles three predicate clauses (wave, shields, UFO) that a finer
  granularity setting might split into 3 slices. At `balanced`, bundling them
  is the right call: none is individually complex enough for its own
  tournament, and all three only make sense on top of the same completed core
  loop.
- Every predicate maps to exactly one slice; no predicate required
  cross-slice splitting.
