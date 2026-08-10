# BI corridor probe results — REQ-55

## Verdict: FAILURE BRANCH — §10 terminal exit at the pretest screen

Read from `experiments/bi-analytics-pilot/bi-corridor-verdict.json`
(`complete: true`, `verdict: "FAILURE BRANCH"`, `failureStage: "pretest"`,
`selectedPoint: null`, `unitsEvaluated: []`), cross-checked against
`experiments/bi-analytics-pilot/PRETEST-SCREEN.md`, the document this
verdict artifact cites as its evidence. The corridor probe (§6) never
launched: there is no `bi-corridor-state.json` and no `bi-corridor.log` for
this run, by design — the §5 pretest screen terminated the instrument line
before any stage-1 task was drawn.

**This document is the short form the plan's own Task 1 branch calls for.**
Per the plan: when `failureStage === "pretest"` the state cross-check, the
per-task accounting over corridor units, and the spot-recomputation of
stage-1 aggregates are all skipped — there is no corridor data to recompute.
Every one of those obligations was already discharged, in full, one plan
ago, over the pretest data that DOES exist: `PRETEST-SCREEN.md` §3 carries
the 50-task per-task status accounting (all 50 `ok`, 0 `timeout`, 0 `error`,
`state.retries` empty) BEFORE its own first aggregate table, exactly as this
plan's governing rules require.

## What terminated it, cited from PRETEST-SCREEN.md

**The screen (§5, REQ-54).** Baseline arm only, n=10 per level, single pinned
seed 999. The original four-level grid (L1-L4) showed one violating adjacent
pair:

| left | right | \|Δmean\| | clears 0.10 |
|---|---|---|---|
| L1 | L2 | 0.100 | yes |
| L2 | L3 | 0.300 | **NO** |
| L3 | L4 | 0.100 | yes |

**The one permitted subdivision (F-16/F-34).** L2↔L3's Δ=0.30 (three times
the 0.10 ceiling) triggered the §5 subdivision procedure: a new named
integer-knob level, `L2B` (L2's exact structural shape plus one added
`segment` filter clause), inserted and the scale renumbered contiguously
(L1=1, L2=2, L2B=3, L3=4, L4=5). The one permitted re-screen ran only the
new `L2B` unit; L1-L4's cached units replayed unchanged. Post-subdivision:

| left | right | \|Δmean\| | clears 0.10 |
|---|---|---|---|
| L1 | L2 | 0.100 | yes |
| L2 | L2B | 0.300 | **NO** |
| L2B | L3 | 0.000 | yes |
| L3 | L4 | 0.100 | yes |

L2↔L2B still moves 0.30 — the SAME magnitude as the original L2↔L3
violation. The intermediate level did not bridge the cliff at all.

**Adjudication (§6, PRETEST-SCREEN.md §6).** Per F-34, subdivision is capped
at exactly one pass per violating adjacent pair; a level still violating the
ceiling after that one permitted subdivision routes to §10 rather than being
iterated further — an unbounded subdivision search is exactly the post-data
grid-shopping the screen exists to prevent. L2↔L2B fails that test. This is
the §10 terminal exit: **the knob cannot be resolved to the design's
granularity at this instrument.**

## One-shot compliance note

Nothing about the instrument changed after the first pretest task returned
(pass 1, level L1, task 0) — both Phase-9-derived prompt pins
(`BI_PROBE_SYSTEM_PROMPT`, `BI_BASELINE_GUIDANCE`) froze at that moment and
are recorded verbatim in `PRETEST-SCREEN.md` §2. No failing level was
re-screened beyond the one permitted F-34 pass. `BI-BATTERY-DESIGN.md`
remains byte-unchanged from freeze commit `c950e4d03bafa6595070b7fdd72e4a1117c4f30d`
(`git diff c950e4d03bafa6595070b7fdd72e4a1117c4f30d HEAD --
experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` is empty, verified
before this commit).

## Downstream consequence

Because the pretest screen — not the corridor probe itself — is what
terminated this instrument line, REQ-55 is recorded closed on this basis:
the pre-registered corridor probe ran its own frozen pipeline (§5's screen
gate is part of that pipeline, upstream of §6's stage 1) to a completed,
pre-committed exit. REQ-56, REQ-57, REQ-58, and all of Phase 10 are VOID BY
RULE — see `experiments/bi-analytics-pilot/TERMINAL-REPORT.md` for the full
accounting of what that voids and why neither auto-gate fires.
