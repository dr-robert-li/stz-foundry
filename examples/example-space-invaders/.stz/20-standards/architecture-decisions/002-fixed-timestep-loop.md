---
summary: "ADR: game logic runs on a fixed-timestep accumulator (SI.Loop calling SI.Game.update(dt) at a constant 16.667ms), decoupled from rendering, so Playwright's step-then-assert pattern is reproducible and P5 fps sampling can't perturb outcomes."
---

# ADR-002: Fixed-timestep accumulator loop, decoupled from render

## Status
Accepted.

## Context
Two of the intent's constraints pull in different directions if handled naively:
"Target 60fps... correctness prioritized over raw performance" (P5, metric) and
four sealed-tests (P1-P4) that assert on exact game state after specific inputs.
If update logic ran directly off `requestAnimationFrame`'s variable delta time,
the *outcome* of a test (how far aliens moved, whether a bullet landed) would
depend on the wall-clock timing of the machine running the test — refuted-in-part
by the validation report's own finding that raw frame-step *counts* over a fixed
wall-clock window varied between runs (116 vs 117 updates), even though
per-step transitions were confirmed byte-for-byte deterministic when compared
step-for-step.

The research (`.stz/10-research/external/01-canvas-game-loop.md`) confirms the
standard fixed-timestep-accumulator pattern is the accepted solution to this
class of problem, and the validation report's Claim 6 empirically confirmed
determinism of per-step transitions with this exact pattern in this environment.

## Decision
- `SI.Loop` owns the `requestAnimationFrame` callback and an `accumulator`.
- Every frame: compute `deltaTime` (capped at `3 * FIXED_TIMESTEP_MS` to avoid a
  spiral-of-death after tab backgrounding), add to `accumulator`, then call
  `SI.Game.update(FIXED_TIMESTEP_MS)` in a `while (accumulator >=
  FIXED_TIMESTEP_MS)` loop, decrementing each time.
- `SI.Game.update(dt)` is a plain function callable with an explicit `dt`
  independent of `SI.Loop` — tests and tools can call `SI.Game.update(16.667)`
  directly N times to advance the simulation deterministically without waiting on
  real frames.
- Rendering (`SI.Renderer.draw(state)`) runs once per rAF callback, after the
  update loop, and never mutates state.
- `fps` (for P5) is measured by `SI.Loop` from raw rAF callback timing (rolling
  median) and written into `gameState.fps` for observability, but never fed back
  into `update()` — frame-rate variance must not change game outcomes.

## Consequences
- P1-P4 sealed tests can drive the game via simulated input + a known number of
  `update()` calls (or elapsed time) and get the same state every run, on any
  machine, regardless of actual render performance.
- P5 (median_fps >= 50) is measured independently from a live rAF-driven session
  and doesn't interact with correctness of P1-P4.
- Slightly more moving parts than "update directly in rAF," but this is the
  standard, well-validated pattern for this exact problem — not novel
  engineering.
