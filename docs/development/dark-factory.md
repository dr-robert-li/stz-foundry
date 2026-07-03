# Dark-factory mode: the autonomous-run contract

A *dark factory* runs lights-out: no human on the floor, product and a report at
the end. STZ's dark-factory mode (0.4.0) is the same idea for the slice pipeline —
elicitation hands off and the orchestrator drives research → ground-truth →
standards → testing-conventions → (`/stz-f:explore` when brownfield) →
slice-disaggregation → every per-slice tournament → the `/stz-f:integration`
composition gate → summary → (`/stz-f:evolve` when opted in) with **no human in
the loop**, surfacing only the final completion report.

This is the literal intent in the project's executive summary ("software
engineering dark factories with auditable outputs"): autonomous, but every
decision still lands in the replayable `.stz/` audit tree, so a human can review
the whole run after the fact.

## The one gate that never closes

Dark-factory skips every *downstream* human gate, but **not** the F2 done-predicate
gate in `/stz-f:new`. Elicitation may not exit with zero machine-checkable
predicates, and acceptance criteria are never auto-invented — the predicates are
the contract the autonomous run executes against. So the question is offered only
*after* the predicate gate is satisfied; by the time dark-factory drives anything,
the contract is already locked.

Gates that ARE skipped when `darkFactory` is on:

- `/stz-f:slice` "Approve as-is" — the proposed slice DAG is auto-approved.
- `/stz-f:run` step 8b winner-approval — the selected winner is auto-accepted. The
  full ranking, GRPO advantages, and any disqualified specimens with their hack
  findings still land in the audit tree; nothing is hidden, only un-prompted.

A halted slice does not stall the factory: it is reported and the rest of the DAG
continues. Every halt surfaces in the final `/stz-f:summary` completion report.

This is also how the autonomous run handles the decisions it must not make alone.
Two human-only gates can arise mid-run:

- A `seal-crosscheck` divergence (0.5.0) — a blind-spot signal that requires human
  adjudication and must never auto-rewrite.
- A blocked `merge-validate` (0.5.2) — an `unsanctioned`/`invalid` merge failure,
  or a compat entry still `pendingApproval` (the merge agent proposed it but no
  human has approved). Auto-approving would defeat the gate.

In both cases, rather than act on an unresolved signal — or block forever waiting
for a human who isn't there — the slice is **halted** and the DAG continues; the
signal (already recorded in `30-tests/cross-reference.md` or
`90-audit/merge-validation.md`) is surfaced in the final summary for after-the-fact
review. The factory defers that decision; it does not guess.

## Explore, integration, and debug inside the loop

Three commands that began as standalone entries are part of the autonomous loop
(they were previously run by hand around it):

- **`/stz-f:explore` (brownfield entry).** Before slice-disaggregation, if the
  repo contains existing source and no `10-research/codebase-map.json`, the
  orchestrator runs the explore scan. It is deterministic (bridge-owned, no
  model, no gate), so autonomy skips nothing by running it — and every slice
  anchor gets validated against real code before a specimen writes a line.
- **`/stz-f:integration` (the composition gate).** Once every slice is `done` or
  `halted`, the sealed end-to-end gate runs *before* the summary. Its
  seal-crosscheck is subject to the same human-only halt rule as a per-slice
  crosscheck.
- **`/stz-f:debug` (bounded red-gate repair).** A red integration gate is
  reduced to a concrete `fn(input) === expected` case and taken through
  `/stz-f:debug` on the offending slice. This is autonomy-safe because the
  bridge's twice-verified oracle refuses a case the shipped winner already
  passes or the reference fails — the factory cannot poison its own suite. The
  loop is bounded: ONE debug → re-run → re-gate cycle per offending slice; an
  irreducible failure, a reference-fails rejection (a spec disagreement), or a
  second red gate halts that thread for human review, surfaced in the summary.

## The evolve meta-loop (opt-in, default off)

`/stz-f:evolve` — the harness-evolution meta-loop — can be attached to the end
of an autonomous run. It is **off by default**: elicitation asks once (the
`Evolve` question, after the dark-factory question), and it can be flipped any
time with `stz bridge project-harness-evolve --root . --on|--off` — the same
load-modify-save pattern as the dark-factory toggle, persisting
`harness.enabled` without disturbing sibling fields. `project-status` hoists it
as `harnessEvolve`.

When enabled, the pipeline runs `/stz-f:evolve` once, **after** `/stz-f:summary`.
It evolves the harness genome against held-out pilot fitness — never the
project's code — and is bounded by its own meta-FSM (max generations,
barren-generation convergence, variance collapse) with kill-switches that halt
and surface rather than auto-rewrite.

## Where the flag lives, and why a dedicated toggle

`darkFactory` is a boolean on the persisted run config (`00-intent/run-config.json`).
It is set two ways:

1. **At the end of elicitation** — `/stz-f:new` asks once, after the predicate gate.
2. **At any point** — `stz bridge project-dark-factory --root . --on` (or `--off`).

The toggle is a deliberate **load-modify-save**: it reads the existing config,
flips the one field, and writes it back. It is NOT routed through
`project-set-config`, because that command runs `normalizeRunConfig(partial)`,
which merges the partial over the *defaults* — a mid-run `set-config
{darkFactory:true}` would silently reset fan-out, models, and strictness. The
dedicated command is the single source of truth; never hand-edit run-config.json.

`project-status` hoists the resolved value to a top-level `darkFactory` field (as
well as inside `runConfig`), so each command reads it once at the start of every
phase. Engaging it between phases therefore takes effect at the next phase with no
restart.

## What is and isn't tested

The deterministic plumbing — the config field, normalization/coercion, the
load-modify-save toggle (with a regression test proving it never resets sibling
fields), persistence, and the hoisted status surface — is covered end-to-end in
`test/project.test.ts`. The autonomous *orchestration loop itself* lives in command
markdown (`/stz-f:pipeline`, `/stz-f:run`, `/stz-f:slice`) and is driven by the agent,
so it is not unit-tested; the tests cover the flag plumbing those commands read,
not the agent loop.


## Run-config knobs that shape an autonomous run

All set during `/stz-f:new` (area E), all with safe defaults:

- **`retryPolicy`** `{retries, replans}` — what happens when a tournament finds
  no passer: `0` halts immediately, `n` bounds the attempts (default 2 retries,
  1 replan), `-1` retries without bound — dangerous, stopped only by the
  token/USD hard caps.
- **`sequencing`** — `fanout` (independent slices in parallel, the default) or
  `linear` (one at a time, predictable cost).
- **`maxParallelSlices`** — the fan-out throttle (default 3): bounds how many
  frontier tournaments run at once, so a wide DAG can't launch
  frontier-width × N specimens unbounded.
- **`runWallClockMs`** — optional run-level wall-clock ceiling across all
  slices (`0` = off).

## Halts the factory cannot absorb

Two halt classes behave differently under autonomy:

- **No-passers tournament halts** are governed by the run-config
  `retryPolicy` (`{retries, replans}`, set during `/stz-f:new`): `0` halts
  immediately, `n` bounds the automated attempts, `-1` retries without bound —
  dangerous, and stopped only by the token/USD hard caps. Dark-factory obeys
  the same policy.
- **Seal-crosscheck ambiguity halts** (two independent references diverge on
  the sealed suite) are ALWAYS human-in-the-loop, regardless of retryPolicy or
  dark-factory. Auto-"fixing" a test-design ambiguity can bake a suite
  blind-spot into every downstream slice — the exact failure class the
  crosscheck exists to catch. The slice halts durably (`stz bridge
  slice-halt`), the DAG continues around it, and the divergence surfaces in
  the completion summary for adjudication.
