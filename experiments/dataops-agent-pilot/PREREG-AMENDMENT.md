# PRE-REGISTRATION AMENDMENT — round 2 of the phase-5 gate arm

**Status:** committed BEFORE any round-2 inference runs. The git commit is the
timestamp, exactly as `PREREG.md`'s was (`3361b42`). `PREREG.md` itself is
**not edited** — it stands as written. This file states only what round 2
changes and why that change is legitimate.

## 0. Round 1's verdict STANDS

Round 1 (commit `38e9870`) returned **GATE NOT MET** on three independent
grounds: measured Goodharting on seed 7, 1/3 raw wins where 3/3 are required,
and 0/3 wins clearing the measured noise floor. **That verdict is final for the
round-1 instrument.** Nothing in round 2 revises it, and if round 2 also
returns a null, the record will show two nulls, not one retried result.

`PREREG.md` §3 forbids "re-running until a seed cooperates." Round 2 is
legitimate **only because the instrument changed** — four specific, independent
mechanisms landed between the runs, each traceable to a defect round 1
*measured* rather than to a wish for a different answer. Re-running the round-1
instrument on new seeds would be forbidden and is not what this is.

## 1. What changed, and which round-1 finding forced each

| change | commit | the round-1 finding that forced it |
|---|---|---|
| Replicate-evidence noise margin on `beatsIncumbent` | `f53d657` | identical-prompt replicates spread 0.000–0.115; a bare `>` banked a +0.1065 "win" a baseline replicate then outscored |
| Battery-declared `gateThreshold` (stage-1 bar) | `bbb4673` | the perfection bar admitted a candidate exactly once — on the seed with **zero** selection signal; `winner: null` in 6/6 generations |
| Per-task promotion diagnostics | `3df79d1` | seed 7's exact tie could not be decomposed into ceiling-artifact vs failed-transfer; the aggregate cannot separate them |
| Multi-warehouse worst-case search (N=2, min-aggregated) | `3df79d1` | diff-in-diff Goodhart excess positive on **every** seed — reflection tunes to the one warehouse it can see |

Two things deliberately did **not** change, so round 2 is comparable to round 1
where it matters: the battery generator (`DATA_OPS_GENERATOR_V2_ID`, same
human-accepted instrument), and the seeds (7, 42, 1234).

## 2. The round-2 decision rule

Let `B` = the baseline agent definition (`s2-strong`, the strongest
hand-written prompt — deliberately not a strawman), `W` = the tournament
winner. Both scored on the **held-out promotion half**, which no search
touches.

**GATE MET** iff **all** of:

1. `W_promotion > B_promotion + margin` on **every** seed, where `margin` is
   the **measured** identical-prompt replicate spread on that seed's promotion
   half — never a constant, never caller-supplied;
2. ≥3 seeds;
3. **no** seed shows Goodharting, measured as **difference-in-differences**:
   `(W_search − W_promotion) − (B_search − B_promotion)`. The raw gap is not
   the test — the halves differ in difficulty (round 1, seed 7: baseline 0.394
   search vs 0.833 promotion), so reading the raw gap against zero would
   mistake half-difficulty for Goodharting. A positive excess over baseline's
   own gap on any seed counts as **NOT met**;
4. the per-task decomposition does not show the "win" resting on a ceiling
   artifact (baseline already near-perfect, leaving no headroom to demonstrate
   gain).

**GATE NOT MET** if any of the above fails. A null keeps phase 5 correctly
gated and is a real result — the repo's `EXPERIMENT-SUMMARY.md` is built on
exactly such findings.

## 3. Stated in advance, so it cannot be claimed as a win afterwards

- **The shipped `promoteComponentWinner` will still refuse.** `rubricCalibrated`
  is fail-closed and no calibrated judge profile exists for this slice type.
  Its verdict is recorded **alongside** the §3 arithmetic, never merged into
  it. A refusal there is expected and is not evidence about §3; a `promote:
  true` there would require a calibrated judge that does not exist.
- **`gateThreshold` is NOT set on the data-ops generator for round 2.** Doing
  so is a generator behaviour change requiring a fresh human acceptance event,
  and none has been performed. The mechanism ships and is tested; the data-ops
  battery keeps the default bar of 1. Consequence, stated up front: stage-1
  will likely again eliminate every candidate, so the driver again selects
  best-by-reward for the §3 measurement, and `winner: null` in the shipped
  path is again expected.
- **Worst-case aggregation makes search fitness LOWER by construction** (a min
  over two warehouses ≤ either). `W_search` values are therefore not comparable
  to round 1's, and no comparison between them will be claimed. The
  within-round `W` vs `B` comparison is unaffected — `B` is scored the same way.
- **N=2 is a small ensemble.** It can reduce single-warehouse overfitting; it
  cannot prove generalization. A pass here means "survived two warehouses",
  not "generalizes".

## 4. Discipline (unchanged from `PREREG.md` §4)

Held-out promotion half never hill-climbed against — enforced structurally by
`SplitBattery`, and additionally by a fail-closed check that no search
warehouse shares a task id with it. Bounded search horizon and reflection
budget (`onGeneration`/`onReflection`). Seeded, deterministic battery
generation; every extra search warehouse derives from the one top-level seed
(`deriveSearchSeed`), so N6 replay holds. Local inference only — $0, no API
spend. Results go in `PILOT-RESULTS.md`; this file is not edited after commit.
