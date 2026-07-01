# Stage 3 — Spawn/concurrency + per-specimen isolation (v1.3.0)

**Verdict: ✅ EARNED** (deterministic, 2026-07-02)

## What was built

`src/foundry/spawn.ts` — the spawn-and-collect loop's concurrency half,
un-stubbing the orchestrator's sequential specimen loop (a documented stub
since the mock era):

- **Bounded pool**: N specimens run concurrently under a `concurrency` cap
  (default: all N — N is already small by design).
- **Stuck-kill (R10)**: a per-specimen `timeoutMs` wall-clock deadline; a
  specimen that never returns is killed at the deadline and reported, never
  hanging the round.
- **Crash containment**: a throwing specimen becomes a `killed: error` entry;
  the round proceeds with survivors (N4's "long-tail tolerated, minimal
  blocking" posture).
- **Scheduling-independent output order (N6)**: outputs come back in input
  strategy order regardless of completion order, so specimen ids and every
  downstream artifact are deterministic under any interleaving.

`runSlice` now routes specimen generation through the pool
(`specimenConcurrency` / `specimenTimeoutMs` options); kills are journaled as
`specimen-killed` events in `state.json` (replayable, N1). If *every* specimen
is killed the round collapses into the existing no-passers escalation FSM —
no new failure machinery was invented.

Isolation posture, stated honestly: each specimen materializes into its own
`prototypes/specimen-X/` directory and each foundry evaluation executes in a
private temp dir. Git-worktree isolation is for specimens that *edit a shared
repo*; foundry v1 specimens synthesize files from a contract, so directory
isolation is the correct minimum (marked in-code with the upgrade path).

## Eval design

Deterministic, timing-based where the claim is about time
(`test/foundry-spawn.test.ts`):

1. **Real concurrency** — 4×100ms specimens complete in <250ms wall-clock
   (sequential would be 400ms). The claim "parallel" is *measured*, not
   asserted structurally.
2. **Pool bound respected** — `concurrency: 1` forces ≥ sum-of-delays.
3. **Stuck-kill** — a never-resolving specimen with `timeoutMs: 150` is
   reported `killed: timeout`; both healthy specimens complete.
4. **Crash containment** — a throwing specimen is `killed: error` with the
   original message preserved.
5. **Order preservation** — slowest-first delays; output order still equals
   input order.
6. **Pipeline composition** — the real `runSlice` with a hanging mock
   specimen (`specimenTimeoutMs: 200`): the kill lands as a `specimen-killed`
   journal event and the tournament completes with a winner from survivors.

## Results

- 6/6 stage-3 tests green; full suite **264/264**; typecheck clean.
- The orchestrator's "spawn N specimens in parallel" (F6) is now literally
  true in the foundry path, with the R10 stuck-detection the roadmap listed
  as unbuilt.

## Honesty caveats

- Timing thresholds (250ms/170ms) have headroom over the asserted deltas but
  are still wall-clock assertions; a pathologically loaded CI box could flake
  them. Chosen over structural mocks deliberately — a concurrency claim that
  never measures time proves nothing.
- No per-specimen OS resource caps (R9's CPU/memory limits) — that needs
  process-level workers, not promises; deferred until specimens become
  subprocesses (they are in-process provider calls today).
