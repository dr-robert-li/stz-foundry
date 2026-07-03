---
summary: "slice-02 HALTED at the seal-crosscheck gate — the two independent references DIVERGED (A 16/16, B 12/16). A blind-spot signal that needs human adjudication; the autonomous dark-factory run does not seal or judge on an unresolved divergence."
slice: slice-02
predicate: P1-move-shoot-kill
status: halted
gate: seal-crosscheck
---

# slice-02 (player-move-shoot-kill) — HALTED on seal-crosscheck divergence

## What happened

Before sealing slice-02's held-out suite, the two independently-authored
references were run against it (R2 cross-family quorum):

- **Reference A** (primary, test-author): **16/16 pass** (passRate 1.0)
- **Reference B** (cross-family, independent author): **12/16 pass** (passRate 0.75)

Status: **DIVERGENT** — exactly one reference satisfies the suite. Per the
dark-factory rule, a divergence is a GUIDE-class signal that must NOT trigger an
automatic rewrite of the sealed suite and must NOT be hand-resolved mid-run. With
no human in the loop, the slice is halted rather than sealed on an unresolved
blind-spot signal. The sealed suite was therefore **not sealed** and no
tournament ran for slice-02.

## The four failing tests (Reference B) and their root causes

Reference B's 4 failures reduce to two root causes:

### Root cause (a) — injected bare bullet not collided (AMBIGUOUS — the real signal)
Failing tests: "Collision hit …", "init(): re-initializing resets … after prior
mutation" (fails at its *setup* step), and the build-smoke path.

The suite exercises collision by injecting a bullet of the **documented ADR-003
entity shape** directly into state:
`gameState.playerBullets = [{ x, y, width, height }]` (suite line ~224), then
calls `update()` once and expects the overlapping alien to be removed and its
points added.

- **Reference A** treats any `{x,y,width,height}` object present in
  `playerBullets` as a live, collidable bullet → collides → passes.
- **Reference B** uses a flag-then-filter design: a bullet is only "live" if it
  carries B's internal fields (e.g. an `alive`/velocity field). An externally
  injected bare bullet lacks them, so B's `update()` does not treat it as a live
  bullet → no collision → fails.

**Why this is ambiguous (needs a human):** the contract/ADR-003 fixes the
`gameState` *field* contract but does not explicitly pin the *element* shape of a
`playerBullets` entry, nor state that array-membership alone denotes a live
bullet. So this is exactly the class seal-crosscheck exists to surface: the suite
(sharing A's representation) assumes a bare documented-shape object in the array
is collidable; a legitimate independent design (B) does not share that
assumption. Either the suite over-fits A's internal bullet representation, OR B is
too fragile to the documented shape. An automated run cannot safely decide which.

### Root cause (b) — movement scaled by dt (contract-faithful suite; B deviates)
Failing test: "update(dt) advances exactly one fixed step regardless of the dt
argument".

Reference B integrates player movement by the `dt` argument, so `update(hugeDt)`
moves farther than `update(FIXED_TIMESTEP_MS)`. The suite asserts a call advances
exactly one fixed step irrespective of `dt` magnitude — faithful to **ADR-002**
(fixed-timestep loop; `SI.Loop` always calls `update(FIXED_TIMESTEP_MS)`), so this
one is a genuine B deviation from the chosen architecture, not a suite over-fit.

## Adjudication options for a human (any one unblocks slice-02 → slice-06)

The downstream slices 03–06 depend transitively on slice-02, so this halt blocks
the rest of the (linear) DAG. To resume:

1. **Refine the contract + fix B** — if array-membership should denote a live
   bullet (i.e. bare `{x,y,width,height}` entries are collidable), state that in
   the slice-02 contract/ADR-003, regenerate reference B to honor it (and drop
   the `dt`-scaling), then re-run seal-crosscheck. The suite stays as-is.
2. **Amend the suite (seal-amend)** — if a `playerBullets` entry legitimately
   needs a velocity/liveness field, the collision tests should construct bullets
   through the game's own spawn path (fire input) rather than injecting a bare
   object; amend via `seal-amend --reason "…"` and re-run crosscheck.
3. **Discard B as buggy** — if you judge B simply wrong on both counts, regenerate
   B correctly and re-run crosscheck; the suite (validated by A) seals unchanged.

Re-engage after resolving with `/stz-f:run slice-02` (dark-factory can stay on).

## Artifacts
- Sealed-suite candidate (unsealed): `.stz/30-tests/held-out/slice-02/slice-02.test.mjs`
- Reference A: `.stz/30-tests/held-out/slice-02/reference/`
- Reference B: `.stz/30-tests/held-out/slice-02/reference-b/`
- Cross-check record: `.stz/30-tests/cross-reference.md`
