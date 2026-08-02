# HANDOFF — v3 battery build (task 15) and onward

**Written:** 2026-08-02 · resume the phase-5 arm cold, full fidelity.
Supersedes `HANDOFF.md` (round-1 era). Read this, then `V3-BATTERY-DESIGN.md`
(rev 2, post-review), then act. `PILOT-RESULTS.md` is the cumulative record.

## 0. Where the arm stands

- **Round 1** (single search warehouse): GATE NOT MET — Goodharting on every
  seed (diff-in-diff +0.21/+0.12/+0.04).
- **Round 2** (2 warehouses, min-aggregated; prereg `PREREG-AMENDMENT.md`,
  commit `bf9cc04`): GATE NOT MET — 1/3 raw wins, 0/3 clear margin. **But the
  Goodharting is GONE** (diff-in-diff −0.15/+0.004/0.000): the method change
  worked; the instrument has no headroom (baselines 0.92–0.94, noise
  0.004–0.153 across halves). Full numbers: `PILOT-RESULTS.md` § "ROUND 2".
- **Shipped gates work in production**: `promoteComponentWinner` ran all 3
  seeds, refused all 3; the replicate noise margin rejected a +0.0067
  within-noise win. `generation-variance-collapsed` never fired.
- **Judge roster measured and shipped** (`src/judge-roster.ts`): gemma4:31b
  primary (0.895, order-perfect), gpt-oss alternate (0.842), nemotron3
  fallback (0.737), granite REFUSED (below the 0.579 trivial baseline).
  Naive 3-judge majority = 0.789 < gemma4 alone — correlated errors, never
  vote; roster is failover only. Battery hash `3a0b56d6…`, n=19 caveat lives
  in the roster doc comment.
- **v3 design reviewed** by a 5-model panel (2× sound-with-changes, 3×
  unsound), every critical adopted: `V3-BATTERY-DESIGN.md` rev 2 +
  `V3-REVIEWS.md`. The design is APPROVED-FOR-BUILD by that process; nothing
  is built yet. No v3 generator id exists; no acceptance has occurred.

## 1. Remaining tasks (recreate this list via TaskCreate on resume)

**T-A (= old #15, in progress): build the v3 battery per the reviewed design.**
Sequence, in order — each step gates the next:
1. `generateWarehouseV3` + `buildTasksV3` implementing the design's §3
   six-step pipeline EXACTLY (dedup → attribute by paymentDate → filter →
   validate refs → aggregate; total tie rule; whole-order refunds ≤1/order
   never exceeding amount; formal dangling definition = origOrderId absent
   from the post-filter surviving set; signed adjustments with own
   origOrderId; ISO-only dates both columns; row order shuffled independent
   of updatedAt; 5 customers × 2 months = 10 tasks/half).
2. **Independent reference interpreter** — separate implementation, NO shared
   helpers with the generator, reads emitted CSV + rule text, recomputes every
   fact. Test: `precomputed === recomputed` across a seed sweep. This is the
   panel's strongest finding; do not skip or merge it into the generator.
3. Leak checks extended: net revenue, per-group conflict outcomes, combined
   L1×L2×L3, decoy-column check.
4. Ceiling probe: baseline prompt + answer key + CSV → ≥0.95 reproduction,
   else fix format confound first.
5. Grid probe per design §3 (fixed grid G1–G5, 3 seeds × 10 tasks, baseline
   AND s0-minimal, interval acceptance: baseline 90% CI ⊆ [0.30,0.60], s0 ≥
   0.05, graded−exact ≥ 0.10; noise replicates INSIDE the probe; selection =
   smallest measured noise). ~2h/grid-point, local, detached, checkpointed.
6. Freeze knobs → `DATA_OPS_GENERATOR_V3_ID` (new id, ABSENT from
   ACCEPTED_GENERATORS until…) → **human acceptance by Dr. Robert Li in
   session — never self-issued**.
7. Full separation gate on v3: 3 arms × 3 FRESH seeds (not probe seeds),
   SE-aware verdict + sign-consistency rule (`_separation.ts` has
   SEPGATE_GENERATOR env — extend for v3).
8. `PREREG-AMENDMENT-2.md` committed BEFORE round-3 blind data: round-2
   verdict stands for its instrument; decision rule = W_prom > B_prom +
   measured margin on ALL seeds, diff-in-diff Goodhart vs baseline's own gap,
   per-task decomposition, ceiling-artifact check; record ollama + model
   digests; note prompt token delta vs v2 (>30% = flagged comparability risk).
9. Round 3: FROZEN method (reflective mutation, 2 gens, 2 search warehouses,
   min-aggregation, worst-warehouse traces), v3 battery, checkpointed detached
   driver (`_tournament.ts` — needs a v3 generator switch like the v2 one),
   shipped gates WITH the calibrated gemma4 profile via
   `profileFor(selectJudge(...))` from `src/judge-roster.ts`.

**T-B (= old #11, blocked by T-A): conditional method research — fires ONLY if
round 3 nulls on the v3 battery.** Full spec preserved in the old task text:
two /gsd-review passes (plan AND analysis), theory-selected methods never
win-likelihood, PREREG-AMENDMENT-3 before any inference, three-nulls-in-a-row
is a substantive standalone finding.

**T-C (standing, = old #16): JOURNAL + CHANGELOG at every task completion and
substantive mid-flight finding.** JOURNAL voice rule (LOCKED): first person as
Robert Li, never third party, no wp-judge references. CHANGELOG under
[Unreleased], Keep-a-Changelog, mechanism detail linked not inlined.

## 2. Operational rules (all locked, all learned the hard way)

- **Commits: author dr-robert-li, NO Claude trailers/co-author lines.** Push
  to origin main after each milestone.
- **Memory**: DGX Spark, 121GB unified, NO memory protection. Run
  `_memory-watchdog.sh` (109GB ceiling, protects the tournament's model)
  before any multi-model work; judge/model sweeps strictly sequential
  (`unloadJudges` pattern). Ollama holds models ~5min after last call — they
  STACK.
- **Long inference**: always nohup-detached, checkpointed (atomic tmp+rename
  state, `once()` pattern in `_tournament.ts`), watcher by PID never by
  pattern (pattern-match watchers self-match and kill their own shell).
  ALWAYS set TOURNEY_STATE explicitly — an omitted default once pointed a
  re-run at the wrong round's state.
- **Env**: qwen3.6 needs taskTimeoutMs ≥ 3600000 (1200s kills slow tasks and
  fakes a capability floor). opencode lives at ~/.opencode/bin (not on
  default PATH). gemini CLI dead (tier), codex CLI dead (account) — reviews
  go through opencode+openrouter per `.planning` review config.
- **wp-judge-v4 is EXCLUDED from every role** (WordPress finetune);
  enforcement in `_calibrate-judge.ts` EXCLUDED_JUDGE_MODELS.
- **Verify per-task `status` before reading any aggregate** — two harness
  faults (timeout kill, ollama-restart errors) have each masqueraded as
  capability results and were caught only by per-task diagnostics.
- **PREREG files are never edited after commit.** Results go to
  PILOT-RESULTS.md. Corrections to premises are recorded there, not by
  rewriting history.
- **One variable per round.** Round 3 changes the battery ONLY.
- **Nulls are results.** Two rounds of NOT MET kept phase 5 correctly gated;
  docs/ROADMAP.md item 8 must keep saying exactly that.

## 3. Key files

| file | what |
|---|---|
| `V3-BATTERY-DESIGN.md` | rev 2, post-panel — THE build spec |
| `V3-REVIEWS.md` | full 5-reviewer panel output |
| `PILOT-RESULTS.md` | cumulative record, rounds 1–2 + judge work |
| `PREREG.md`, `PREREG-AMENDMENT.md` | frozen pre-registrations (do not edit) |
| `_tournament.ts` | checkpointed driver (round-2 form: per-task diags, 2-warehouse min, shipped gate) |
| `_separation.ts` | separation gate (SEPGATE_* env knobs) |
| `_calibrate-judge.ts` | judge battery build/run, sequential sweep, exclusions |
| `src/judge-roster.ts` | measured roster + selectJudge + profileFor |
| `src/judge-calibration.ts` | blind-battery scorer (baseline + abstention guards) |
| `src/foundry/grade.ts`, `fixture-warehouse.ts` | graded scoring; v1/v2 generators (v3 goes here) |
| `_memory-watchdog.sh` | 109GB ceiling daemon |

## 4. State of the repo at handoff

main == origin/main, 814 tests green, typecheck clean, version 1.21.0 (three
manifests synced; [Unreleased] carries the round-2 + v3-review entries).
Round-2 state file (`tournament-r2-state.json`) is local-only by policy
(gitignored); `tournament-r2.log` + `repair-s7.log` are committed evidence.
