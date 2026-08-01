# PILOT RESULTS — the phase-5 gate arm (separation gate COMPLETE)

**Status:** separation gate run to completion on the pre-registered model list and
the pre-registered seeds. **Phase 5 stays GATED. No tournament was run.**
Decision rule and null conditions were fixed in advance — see `PREREG.md`,
committed at `3361b42` before any blind tournament data existed. That file has
not been edited since; results live here.

## Verdict

**GATE NOT MET.** Not for the reason predicted, and not for the reason the
previous interim draft of this file predicted either.

`qwen3.6:latest` **does** land inside `PREREG.md` §2's discriminating band
(`0 < rate < 1`) — pooled arm rates 0.72–0.83, neither floor- nor
ceiling-saturated. That was the literal open question, and its answer is *yes*.

But landing in the band was never sufficient. `PREREG.md` §1 states the actual
requirement: *"A tournament can only select if the battery discriminates. If
every prompt scores the same, there is no gradient and the search is measuring
noise."* Three system prompts of deliberately different quality score
**statistically indistinguishably**, and their rank order **reverses between
seeds**. A tournament here would select on noise.

## The measurement

`qwen3.6:latest`, local Ollama, 3 arms × 3 pre-registered seeds (7, 42, 1234) ×
6 tasks = 54 scored tasks, plus 12 replicate tasks. All local, $0.

| arm | seed 7 | seed 42 | seed 1234 | pooled | mean |
|---|---|---|---|---|---|
| `s0-minimal` ("You are a helpful assistant.") | 1.000 | 0.667 | 0.667 | 14/18 | **0.778** |
| `s1-plausible` (generic careful-analyst) | 0.667 | 0.833 | 0.667 | 13/18 | **0.722** |
| `s2-strong` (explicit 5-step methodology) | 0.500 | 1.000 | 1.000 | 15/18 | **0.833** |

**SPREAD (max−min of arm means) = 0.111.**

### Why 0.111 is not a gradient

1. **It is inside the noise.** Difference `s2 − s1` = 0.111, with a binomial
   standard error of the difference ≈ **0.137** at n=18 per arm. The observed
   separation is smaller than one standard error of its own estimate.
2. **The rank order reverses between seeds.** Seed 7 ranks the arms
   `s0 > s1 > s2` — prompt quality *anti-correlated* with score. Seeds 42 and
   1234 rank them `s2 > s1 > s0`, the expected direction. A gradient whose sign
   depends on which battery you drew is not something a search can climb.
3. **The pooled order is not even monotonic in prompt quality:** `s2` (0.833) >
   `s0` (0.778) > `s1` (0.722). The *minimal* prompt beats the *plausible* one.
4. **Replication moves individual cells by a full task.** Re-running seed 7
   unchanged: `s1` 0.667 → 0.833, `s2` 0.500 → 0.667. Both up by exactly one
   task. Per-cell noise is **±0.167** — one task in six.

### The single-run spreads were artifacts

Read one seed at a time, this experiment looked decisive twice, in opposite
directions, and both readings were wrong:

| what was run | SPREAD | what it looked like | what it was |
|---|---|---|---|
| seed 7 only | 0.500 | strong separation, inverted gradient | one-seed noise |
| seeds 42+1234 | 0.417 | strong separation, correct gradient | one-seed noise |
| all 3 seeds pooled | **0.111** | — | inside noise |

Either single run, taken alone, would have justified a tournament. Both were
noise. This is the α→0 failure mode the milestone was built to prevent, caught
in the instrument rather than in a fabricated result.

## Two measurement defects found and fixed

Both were found by adding diagnostics the gate did not previously emit. Both
would have been reported as capability results.

### 1. Timeout contamination (introduced by this session, then removed)

The reduced gate was first run with `taskTimeoutMs: 1200000` (20 min). Under the
minimal prompt `qwen3.6` reasons ~10 min/task, and on seed 42 **3 of 6
`s0-minimal` tasks exceeded the cap and were `stuck-killed`**. Killed tasks score
`pass: false`, indistinguishable in `testPassRate` from a wrong answer, so the
cell read **0.500 — a clean-looking capability floor.**

Re-run uncapped (1 h): **0.667**, zero timeouts. The 0.500 was a harness kill,
not a model failure. All `s0` figures in the table above are the uncapped ones.

Seed 7's `s0 = 1.000` was luck in staying under the cap — the same prompt on a
different battery ran past it.

### 2. Formatting failures are real, and only under the minimal prompt

A task scores 0 both when the model emits the required `path=answer.json` fence
with wrong numbers (genuine arithmetic failure) and when it computes correctly
but emits no parseable fence (a formatting failure). `testPassRate` cannot
distinguish them. `_armprobe.ts` was written to classify every response through
the *same* `parseArtifacts` the scorer uses:

| arm | correct | wrong values | **no fence** |
|---|---|---|---|
| `s2-strong` (seed 7) | 4 | 2 | **0** |
| `s1-plausible` (seed 7) | 5 | 1 | **0** |
| `s0-minimal` (seeds 42, 1234) | — | — | **2, then 1** |

So s1/s2 failures are genuine arithmetic (e.g. `16 / 1010950` against
`17 / 1094168`). But `s0-minimal` **does** drop the fence — the strong prompt's
explicit "return only the requested JSON" instruction is what suppresses it.

This matters for interpretation: whatever advantage `s2-strong` shows is partly
**output-format compliance, not data-ops competence**. The one axis where prompt
text demonstrably controls behaviour is the trivial one.

## The gate script's threshold is unsound at this sample size

`_separation.ts` originally declared separation when `spread >= 0.05`. With 6
tasks per cell, `testPassRate` is **quantized to 0.167** — the threshold sat
below the smallest difference the instrument can express, so it fired on a single
task's worth of noise. It printed `SEPARATION EXISTS` for both misleading
single-seed runs above.

It now compares the spread against the binomial standard error of the difference
and reports `NO RELIABLE / WEAK / SEPARATION`. Checked against all three
recorded runs:

| run | spread | SE(diff) | new verdict |
|---|---|---|---|
| pooled, 3 seeds (n=18) | 0.111 | 0.137 | **NO RELIABLE SEPARATION** ✅ |
| seed 7 alone (n=6) | 0.500 | 0.204 | SEPARATION ❌ still fires |
| seeds 42+1234 (n=12) | 0.417 | 0.142 | SEPARATION ❌ still fires |

**The error bar alone does not catch the two misleading runs.** A one-seed spread
of 0.500 genuinely does exceed 2 SE — it is not a sampling-error artifact, it is
a *battery-draw* artifact, and no within-run statistic can see that. The only
thing that caught it was running the other seeds and finding the **rank order
reversed**.

So the operative rule is not a threshold at all: **a spread is only real if its
sign is consistent across seeds.** The verdict line now says so explicitly in
both positive branches, and it must not be read as a decision on its own.

Reproduce this check without inference:

```bash
node -e '
const verdict=(means,n)=>{const sp=Math.max(...means)-Math.min(...means);const se=p=>p*(1-p)/n;
const sd=Math.sqrt(se(Math.max(...means))+se(Math.min(...means)));
return `spread=${sp.toFixed(3)} SE=${sd.toFixed(3)} -> ${sp<=sd?"NO RELIABLE":sp<=2*sd?"WEAK":"SEPARATION"}`;};
console.log("pooled 3 seeds :", verdict([0.778,0.722,0.833],18));
console.log("seed 7 alone   :", verdict([1.000,0.667,0.500],6));
console.log("seeds 42+1234  :", verdict([0.583,0.750,1.000],12));'
```

## Why more seeds will not rescue this

To resolve a *true* 0.10 difference at 80% power needs roughly **350 tasks per
arm** — about 58 seeds. At ~4 min/task that is **>20 h of inference per arm**,
>60 h for three, to detect a difference that would still be smaller than the
per-cell quantum.

**The battery cannot resolve realistic prompt-quality differences at feasible
cost.** That is a property of its design, not of the model or the hardware.

## What still stands (now with direct evidence)

The three structural properties recorded in the interim draft were inferred from
the granite floor. Two are now directly confirmed by the qwen data:

1. **The fitness landscape is sparse by construction.** Every check is
   exact-integer equality on a 6-digit `revenueCents`; a near-miss and a wild
   miss both score 0. With 6 binary tasks per cell the whole scale has 7 points.
   *Confirmed:* the entire measured spread is smaller than one scale point.
2. **The task prompt already carries the methodology.** `buildTasks` spells out
   dedup, all three amount formats, the backup column, all three date formats and
   the customer/month filter. *Confirmed:* "You are a helpful assistant" scores
   **0.778** against an explicit 5-step methodology's **0.833**. The system
   prompt — the thing a tournament evolves — has almost no headroom, because the
   task prompt already said it.
3. **Scoring is noisy run to run.** *Confirmed and quantified:* ±0.167 per cell.

None of these are model-tier problems. They belong to the battery design, and
they are why the gate fails.

## What this does NOT show

- It does not show agent-definition search is worthless. It shows **this
  battery** cannot measure it.
- It does not show local models cannot grade the battery. `qwen3.6` solves tasks
  exactly and sits mid-band; the earlier "floor saturation is structural" reading
  was already corrected and stays corrected.
- It is not a tournament result. **No tournament was run**, so nothing here
  speaks to `PREREG.md` §3's `W_promotion > B_promotion`.

## Recommended next move — phase-3 battery revision, not a phase-5 build

Per `HANDOFF.md` §6's null branch, now with evidence for each item:

1. **Graded / partial-credit checks** instead of exact-integer equality. This is
   the highest-leverage fix: it attacks the quantization (1), the sparse
   landscape, and the power problem simultaneously — a near-miss on
   `revenueCents` would carry information instead of scoring 0.
2. **Less prescriptive task prompts.** Move the methodology out of `buildTasks`
   so the system prompt has headroom to matter. Right now the battery measures
   whether the model can follow instructions it was already handed.
3. **Damp the scoring noise** — more tasks per cell, or graded checks (which
   raise information per task without raising inference cost).
4. **Fix the gate's threshold** to compare against a standard error rather than a
   fixed 0.05, so it cannot declare separation below its own resolution.

Only after a revised battery shows a **stable, sign-consistent** gradient across
seeds should a tournament be scheduled.

### Status of the revision (built, and where it is blocked)

Items 1 and 2 are implemented; 4 is implemented; 3 follows from 1.

- `src/foundry/grade.ts` — `GradedSpec` / `gradeTask`, partial credit as a
  **selection** signal. Deliberately not in `predicate-eval.ts`: contract
  pass/fail is a trust boundary and stays exact, and `passedGate` still requires
  every check exact. A task with no `grading` scores `pass ? 1 : 0`, so every v1
  battery's `testPassRate` is byte-identical.
- `buildTasksV2` — states the goal and that the extract is messy, and stops
  there. The v1 methodology dump is gone. The `path=answer.json` fence stays: it
  is a parsing contract with `observeCheck`, not a task hint.
- `REVENUE_ZERO_AT = 0.10` — credit decays to 0 at 10% relative error. Chosen
  from the measured failure distribution in `armprobe-qwen.log` (wrong answers
  at ~3%, ~7.6%, ~15% out; the granite floor ~87% out), so the tolerance
  separates "did the transformation, slipped on some rows" from "did not do the
  transformation".

**Blocked on a human acceptance event.** `DATA_OPS_GENERATOR_V2_ID` is a new
generator id and is deliberately **absent** from `ACCEPTED_GENERATORS`, so
`generateFixtureBatteryV2` throws and no v2 battery can be constructed yet.
Revising the prompt and the scoring under the v1 id would silently redefine what
a human accepted — exactly the substitution `requireGeneratorRooted`'s
reference-identity step refuses one level down — and an agent adding its own
generator to the accepted table would make the acceptance self-issued and
worthless. A human adds one entry to `ACCEPTED_GENERATORS` to unblock it.

Re-running the separation gate on v2 is what tests whether the revision actually
buys a stable gradient. **That is an open empirical question, not a claim** —
partial credit removes the 0.167 quantum by construction, but whether prompt
quality then separates sign-consistently across seeds can only be measured.

---

# THE v2 SEPARATION GATE — the revision works

`DATA_OPS_GENERATOR_V2_ID` accepted by Dr. Robert Li 2026-07-31. Gate re-run in
full: 3 arms × 3 pre-registered seeds × 6 tasks = 54 tasks, `qwen3.6:latest`,
local Ollama, $0, ~8.8 h.

| arm | seed 7 | seed 42 | seed 1234 | mean | (v1 mean) |
|---|---|---|---|---|---|
| `s0-minimal` | 0.518 | 0.333 | 0.333 | **0.395** | 0.778 |
| `s1-plausible` | 0.534 | 0.193 | 0.250 | **0.326** | 0.722 |
| `s2-strong` | 0.833 | 0.540 | 0.869 | **0.747** | 0.833 |

**SPREAD = 0.422**, against SE(diff) 0.151 — more than 2 SE.

## The test that actually matters: sign consistency

v1 failed not on spread but on an ordering that reversed between seeds. v2 does
not reverse:

| comparison | seed 7 | seed 42 | seed 1234 | consistent? |
|---|---|---|---|---|
| `s2 − s0` | +0.315 | +0.207 | +0.536 | **3/3** |
| `s2 − s1` | +0.299 | +0.347 | +0.619 | **3/3** |
| `s0 − s1` | −0.016 | +0.140 | +0.083 | 2/3 |

The strong arm beats **both** weaker arms on **every seed**. `s0` vs `s1` is not
sign-consistent — but their means differ by 0.069, well inside one SE, so they
are statistically indistinguishable and their ordering is noise. That is the
expected shape: the two weak prompts are equivalent, and the strong one is not.

Paired across seeds (n=3): `s2 − s0` mean +0.353, `s2 − s1` mean +0.422, both
with all three differences positive. With only three seeds a paired t sits at
p ≈ 0.05–0.07 — **sign consistency, not formal significance, is what carries
this**, and that is what the decision rule asked for.

## Why the revision produced this

Both mechanisms did what they were built to do:

1. **Removing the methodology from the prompt created headroom.** Under v1 the
   minimal prompt scored 0.778 against the strong prompt's 0.833 — the task text
   had already said everything a system prompt could add. Under v2 the same
   minimal prompt scores 0.395 while the strong prompt holds 0.747. The task got
   harder for an unguided candidate and stayed tractable for a guided one, which
   is exactly the gap a search needs.
2. **Partial credit recovered information exact matching destroyed.**
   `s1-plausible` on seed 1234 scored **0/6 exact** — under v1 that is 0.000,
   indistinguishable from a candidate that understood nothing. Graded, it is
   0.250, because three of its answers were within 10%. Fractional scores
   (0.11, 0.16, 0.20, 0.21, 0.24, 0.50) appear throughout; every one of them was
   a flat 0 under v1.

## Caveats, recorded because they qualify the result

- **n=3 seeds.** The effect is large and sign-consistent, but three seeds is
  three seeds.
- **The SE is conservative, in our favour.** The gate computes a *binomial* SE,
  which assumes binary outcomes. Scores are now continuous in [0,1], where the
  Bernoulli variance is an upper bound — so the real standard error is smaller
  than 0.151 and the test is harder to pass than it needs to be.
- **Formatting failures persist and confound, also in our favour.** Four cells
  show a `NO artifact` task. In `s2-strong` seed 7 the arm's single 0.00 *is*
  that formatting failure (5/6 exact, one no-artifact, one zero) — so correcting
  for it would raise `s2` further and widen the gap. Removing prose from the
  prompt appears to have cost some format discipline even though the fence
  contract is still stated verbatim; under v1 `s1`/`s2` had zero no-fence.
- The gate's verdict line still only checks the error bar. Sign consistency was
  checked separately, by hand, from the per-seed table — which remains the
  operative rule.

## What this does and does not unblock

**A tournament is now justified.** The battery discriminates: rates sit inside
`0 < rate < 1`, the arms separate by more than 2 SE, and the ordering holds its
sign across every seed. `PREREG.md` §1's precondition — *"a tournament can only
select if the battery discriminates"* — is satisfied for the first time.

**Phase 5 is still GATED.** A separation gate justifies a tournament; it is not
a substitute for one. `PREREG.md` §3 unblocks phase 5 only on
`W_promotion > B_promotion` — a real tournament winner beating baseline on the
**held-out promotion** half, across ≥3 seeds, with the search→promotion gap
recorded and a win-on-search-that-vanishes-on-promotion counted as **NOT met**.
No tournament has been run. Nothing here speaks to that.

Cost estimate for the tournament, at the measured ~9.8 min/task: a 54-task gate
took ~8.8 h, so N specimens × generations × a split battery is **days** of
wall-clock, unattended and $0. It should be scheduled as a long-running detached
job, not run in-session.

---

# TWO SELECTION-GATE FINDINGS, found by running the tournament

Both are about the *gates*, not the battery, and both were surfaced by real
numbers from the §3 run rather than by reading the code.

## 1. The absolute eval gate is unreachable at this altitude

`select()`'s stage-1 filter keeps only specimens with `passedGate`, which needs
`testPassRate >= 1` — a **perfect** battery. Generation 0 of seed 7 scored
0.250 / 0.578 / 0.528 / 0.530, so `judgment.winner` came back **`null`**: every
candidate eliminated, nothing to rank.

That absolute bar is correct at STZ's code altitude — shipping code that fails
its own tests is not acceptable, so "must pass everything" is the right stage-1
filter. At the **agent-definition** altitude it is wrong: fitness is a graded
competence score that no local model reaches 1.0 on, so stage 1 deletes the
entire population before the relative stage can rank anything.

Consequence, stated plainly: **on this battery a component tournament can never
promote anything, however good the search is.** That is a property of the gate,
not of the candidates.

The experiment driver therefore selects best-by-reward rather than bailing on a
null winner — a deliberate divergence from `runComponentTournament`, recorded
here because it is what makes the §3 measurement obtainable at all.

## 2. `beatsIncumbent` is a bare `>`, and that ratchets on noise

`promoteComponentWinner` computes `beatsIncumbent = promotionFitness >
incumbentFitness`. Relative-to-incumbent is the right *shape* at this altitude
— the goal is consistently above the existing definition, not above a fixed bar
— but a bare `>` promotes on any epsilon.

Measured against this run's own noise, that is too much leeway. An accidental
control appeared in seed 7: `BASELINE` and `cand-s2-strong` are the **identical
prompt** on the **identical** search battery, and scored:

| | reward | testPassRate |
|---|---|---|
| `B_search` | 0.7272 | 0.3937 |
| `cand-s2-strong` | 0.7877 | 0.5282 |
| **delta** | **0.0606** | **0.1345** |

Same input, 0.13 apart on `testPassRate` — larger than most plausible search
gains. Under a bare `>`, a candidate genuinely equal to the incumbent wins
roughly half the time, and because each winner becomes the next incumbent, those
noise wins compound into a random walk with selected-max bias. That is the
winner's curse, and it is how a purely relative gate drifts.

**The guard against that drift is not an absolute bar — it is a noise-aware
margin on the relative one**, plus the held-out comparison `PREREG.md` §3
already mandates. The two constraints do different jobs: held-out kills
search-Goodharting, the margin kills promotion-on-noise. So the driver now:

- re-scores the identical baseline on the identical promotion half
  (`s<seed>-baseline-promotion-replicate`), making the noise floor **measured**
  rather than assumed;
- requires `W_promotion > B_promotion + margin`, where `margin` is the largest
  observed identical-prompt spread;
- reports the raw and margin-cleared verdicts separately, so a win that exists
  only under the bare `>` is visible as such rather than banked.

It also reports Goodharting as a **difference-in-differences** against the
baseline's own gap. The two halves are not equally hard — the same baseline
scored 0.394 on search and 0.833 on promotion for seed 7 — so reading the raw
`searchPromotionGap` against zero would mistake half-difficulty for
Goodharting. Only `W`'s excess gap over `B`'s is attributable to search.

Neither finding changes `src/` yet. They are recorded first because a gate
change made mid-experiment, on the strength of one run, would be exactly the
unprincipled drift this section is about.

---

# THE §3 TOURNAMENT — GATE NOT MET

Run to completion 2026-07-31: `qwen3.6:latest`, seeds 7/42/1234, 4 candidates ×
2 generations per seed, baseline = `s2-strong` (the strongest hand-written
prompt), winner scored once on the held-out promotion half. ~17h wall-clock,
local Ollama, $0. Fully checkpointed (`_tournament.ts`); the replicate units ran
on a later resume that skipped all 21 completed units — resumability was used
in anger, not just tested.

## The numbers

| seed | B_search | B_prom | B_prom (replicate) | W_search | W_prom | beats? |
|---|---|---|---|---|---|---|
| 7 | 0.7272 | 0.9250 | 0.8783 | 0.9408 | 0.9250 | no — exact tie |
| 42 | 0.7750 | 0.8100 | **0.9250** | 1.0000 | 0.9165 | raw yes, +0.1065 |
| 1234 | 1.0000 | 1.0000 | 1.0000 | 0.8875 | 0.8518 | no — baseline perfect |

**§3 arithmetic: 1/3 raw wins (needs 3/3), 1 Goodharting seed → NOT MET.**

## The noise floor killed the one win

Identical baseline prompt, identical promotion half, re-scored:
noise samples **[0.0467, 0.1150, 0.0000] → margin 0.1150**.

- Seed 42's win was **+0.1065 — inside the margin**. 0/3 wins clear it.
- Sharper than that: the seed-42 **replicate of the baseline (0.9250) beat the
  tournament winner (0.9165) outright**. The "win" was the baseline having a
  bad first run, not the winner being better.
- Seed 7's replicate moved 0.9250 → 0.8783 with nothing changed, confirming the
  exact `W = B` tie there was quantization coincidence, not stability.

## Overfitting is systematic, not a one-seed fluke

Diff-in-diff Goodhart excess (`(W_search − W_prom) − (B_search − B_prom)`,
positive = the winner overfits the search half more than baseline does):

**[+0.2136, +0.1186, +0.0357] — positive on every seed.**

Reflection mutates a prompt from the execution trace of ONE warehouse's
failures; the gains it buys are warehouse-specific and do not transfer to an
independently seeded warehouse. Seed 7 is the clean exhibit: +0.21 on search,
+0.00 held out.

## What this run also established

- **The stage-1 claim needs qualifying.** Seed 1234's baseline scored 1.000 on
  BOTH halves — `passedGate: true`. The `testPassRate >= 1` bar is not
  unconditionally unreachable at this altitude; it is **draw-dependent**: an
  easy warehouse admits it, a hard one forbids it. `winner: null` still
  occurred in every generation of every seed (the population never cleared it),
  so the practical consequence for tournaments stands, but the mechanism is
  saturation variance across draws, not a fixed impossibility.
- **Both halves at seed 1234 saturating for the baseline** also means that seed
  contributed no selection signal at all: search could only match or lose.

## Verdict

**Phase 5 stays GATED**, per the pre-registered rule, on three independent
grounds — any one suffices:

1. measured Goodharting on seed 7 (§3 names this NOT met explicitly);
2. 1/3 raw wins where 3/3 are required;
3. 0/3 wins clear the measured noise floor.

This is the strong form of the null the repo's prior arms kept finding: the
machinery is honest, the instrument now discriminates, the search genuinely
climbs — and the climb does not transfer. What phase 5 would automate is, on
this evidence, automated overfitting.

## What this does NOT show

- It does not show prompt search can never transfer — 2 generations, 4
  candidates, 1 search warehouse is a small search. It shows THIS search
  overfits, and that the gate correctly refused it.
- It does not show the battery is broken — the v2 battery did its job: it
  discriminated (separation gate) and it caught non-transfer (split halves).
  The instrument worked; the candidate improvement was not real.
- The shipped promotion gate's refusal (no calibrated judge profile,
  fail-closed `rubricCalibrated`) is independent of all of the above and was
  reported alongside, never conflated.

Follow-up work is tracked as tasks: the `beatsIncumbent` noise margin (task 2),
the stage-1 altitude question (task 3, now with the draw-dependence
correction), anti-overfitting search designs — multi-warehouse worst-case,
three-way split (task 4), and the round-2 pre-registration amendment gate
(task 5). Raw evidence: `tournament-progress.log` (committed);
`tournament-state.json` retained locally as resumable state (gitignored by
design — the log carries every decision number).

---

# DECISIONS on tasks 2–4 (2026-08-01, on the full three-seed evidence)

## Task 2 — `beatsIncumbent` noise margin: WARRANTED, replicate-evidence shape

The evidence is direct: noise samples [0.0467, 0.1150, 0.0000], and the bare
`>` would have banked seed 42's +0.1065 "win" — which a replicate of the
unchanged baseline then outscored. A gate that promotes that is ratcheting on
run-to-run variation.

Two design constraints resolve the shape:

1. **No caller-supplied margin number.** `promoteComponentWinner` accepts none
   of its seven gate inputs as parameters precisely so no caller can assert a
   gate true; a margin parameter is the same hole inverted — whoever supplies
   it can set it to 0. Instead the gate accepts **replicate promotion runs**
   (`BatteryRun[]`, real evidence) and computes the margin itself: the max
   pairwise `evalReward` spread across `{promotionRun} ∪ replicates`. Evidence
   in, boolean out — the `calibrationGate` shape every gate here copies.
2. **The noise is not a constant.** It ranged 0.000–0.115 across three seeds of
   the same battery, so any fixed number would be wrong somewhere. Measured
   per-promotion-context or not at all.

No replicates supplied ⇒ margin 0 ⇒ exactly today's behaviour — honest (no
noise evidence, no margin) and backward compatible. Callers that want the
guard pay for it in replicate runs, not in a trusted number.

## Task 3 — stage-1 gate: WARRANTED, battery-declared threshold

Corrected finding: `testPassRate >= 1` is not unconditionally unreachable — it
is **draw-dependent saturation**. And the sharpest form of the problem: the
gate admitted a candidate exactly once in this experiment, on seed 1234, **the
seed that carried zero selection signal** (baseline perfect on both halves).
At the agent-definition altitude, the perfection gate selects *for* saturated,
uninformative batteries and *against* discriminating ones. `winner: null` in
6/6 generations is the operational consequence.

Shape: an optional `gateThreshold` on `AgentBattery`, **declared at
construction** and validated by `makeBattery` (`0 < t <= 1`, default 1 —
existing behaviour byte-identical). Construction is the right place because a
battery is only constructable through the receipt/admission path under a
human-accepted generator — the threshold travels with the accepted instrument,
not with whoever happens to be running a selection. "Just lower the constant
in `passedGate`" stays rejected: it would silently weaken the code altitude
too.

One consequence to carry into implementation honestly: a threshold for the
data-ops battery is a **generator behaviour change**, so it cannot be slipped
under the accepted v2 id — it lands with a fresh acceptance event (v2 entry
amended by the human, or a v3 id), same discipline as the v1→v2 revision.

## Task 4 — anti-overfitting search: WARRANTED in two parts, deferred in one

- **Per-task promotion diagnostics — prerequisite, immediate.** The driver
  stored only aggregates, so seed 7's tie cannot be decomposed into
  same-task-failed vs different-tasks-failed, and the ceiling confound
  (baseline 5/6 leaves one task of headroom) cannot be ruled in or out.
  `BatteryTaskResult` already carries per-task data; the driver just has to
  persist it. Round 2 does not run without this.
- **Multi-warehouse worst-case search — the direct counter.** The measured
  mechanism is reflection tuning a prompt against ONE warehouse's quirks
  (diff-in-diff positive on every seed). Scoring each candidate on N≥2
  independently-seeded search warehouses and selecting on the **min** attacks
  exactly that. Costs N× search compute; round 2 budgets for N=2.
- **Three-way split — DEFERRED.** Its purpose is early stopping monitored
  without touching the promotion half; round 2 keeps a fixed 2-generation
  horizon, so a validation set has no consumer yet. Build it when a variable
  horizon exists, not before.
- **Judged not applicable, recorded to close relitigating:** reward-model
  ensembles (the oracle is constructed ground truth — no blind spots to
  cancel), KL-to-base penalties (no token distribution at this altitude;
  `interfaceParity` already bounds structural drift), action softening and
  impact regularization (no action confidence, no environment).

## Prior arms

This is consistent with `../EXPERIMENT-SUMMARY.md`: six arms, five substrates,
broad competency positive not obtainable — and the recurring reason is the
measurement, not the search. A null here keeps phase 5 correctly gated and points
effort at the battery, which is a real result.

## Cost

All inference local Ollama — genuinely **$0**, no API spend, per the project's
standing billing rule. Spend was wall-clock: ~6 h across the gate runs, the
uncapped re-measurement, and the arm probes.

## Reproduce

```bash
# Full pre-registered gate on the escalated model (3 arms × 3 seeds)
SEPGATE_MODEL=qwen3.6:latest SEPGATE_SEEDS=7,42,1234 \
  SEPGATE_TIMEOUT_MS=3600000 SEPGATE_CONCURRENCY=1 \
  ./node_modules/.bin/tsx experiments/dataops-agent-pilot/_separation.ts

# Re-measure one arm only (used to strip the timeout contamination)
SEPGATE_ARMS=s0-minimal SEPGATE_SEEDS=42,1234 SEPGATE_TIMEOUT_MS=3600000 \
  SEPGATE_MODEL=qwen3.6:latest SEPGATE_CONCURRENCY=1 \
  ./node_modules/.bin/tsx experiments/dataops-agent-pilot/_separation.ts

# Classify failures as arithmetic vs formatting
PROBE_ARM=s2-strong PROBE_MODEL=qwen3.6:latest PROBE_SEED=7 \
  ./node_modules/.bin/tsx experiments/dataops-agent-pilot/_armprobe.ts

# Original single-task model sweep (granite / nemotron / qwen)
./node_modules/.bin/tsx experiments/dataops-agent-pilot/_modelsweep.ts
```

Use a timeout ≥ 3600000 ms for `qwen3.6`. A 1200000 ms cap silently kills
`s0-minimal` tasks and reports the kills as a capability floor — see defect 1.

Logs: `sepgate-qwen.log` (seed 7), `sepgate-qwen-s42-1234.log` (seeds 42/1234,
contains the timeout contamination), `sepgate-qwen-s0-uncapped.log` (clean s0),
`armprobe-qwen.log` (failure classification), `sweep.log` (model sweep).

---

# JUDGE CALIBRATION — and a VOIDED first attempt

## The gate that had never been observed to pass

`calibrationGate` is fail-closed on `blindAccuracyBucket`, and that battery had
never been authored — so `rubricCalibrated` refused every promotion in both
tournament rounds. One of the seven gates had never once returned true, which
means it was untested in the affirmative: a gate that can only refuse is not
evidence of anything.

`src/judge-calibration.ts` supplies the missing input. Ground truth is the
**constructed exogenous oracle**, not model agreement: pairs are drawn from
recorded round-1 runs where each candidate's fitness was measured against
answer-first facts computed before any candidate existed. The judge sees two
agent definitions and never the scores. Battery frozen at 19 discriminable
pairs, hash `3a0b56d6…`, committed before any judge saw it.

## Guards the battery must carry, and why

Two failure modes make an aggregate accuracy number untrustworthy on its own.
Both are guarded in `src/judge-calibration.ts`, and both were confirmed against
a real model rather than assumed.

**1. Base-rate exploitation.** One candidate wins 11 of the 19 pairs and never
loses, so a judge that reads nothing and always prefers it scores well above
chance. `trivialPreferenceBaseline` computes exactly that trivial strategy's
accuracy, and a judge failing to beat it is forced to `low` — the standard
beat-the-majority-classifier bar. `granite4.1:30b` fails it on real data
(0.526 against a 0.579 baseline).

**2. Selective abstention.** An unparseable verdict is scored as **incorrect**,
never excluded. Excluding them biases accuracy upward whenever abstention
tracks difficulty — a verifier that declines exactly the questions it would
fail looks calibrated and is not. For a promotion gate this is also right on
the merits: a judge that cannot emit a verdict cannot steer.

## Cross-family judge sweep

Judges are swept SEQUENTIALLY over the identical frozen battery (hash verified
before every call), and all candidates are **cross-family from the tournament's
candidate model** (`qwen3.6`) so ranking and execution never sit in one family
— the self-preference shape the survey flags, and the repo's own v1.1
cross-family judge direction.

`JUDGE_CANDIDATES`: `granite4.1:30b`, `nemotron3:33b`, `gpt-oss:20b`,
`gemma4:31b`. A candidate not yet installed is skipped with a note, so the
sweep can poll while models are still being pulled.

**Sequential is a hardware safety requirement, not tidiness.** The box is a DGX
Spark with 121GB unified memory and no memory protection, and ollama holds a
model resident ~5 min after its last call — so a naive sweep stacks judges on
top of the tournament's own model. That was observed live (qwen3.6 29GB +
nemotron3 26GB both resident) and would have reached ~106GB of models alone
once the remaining candidates landed. An overcommit here does not produce a
clean OOM kill; it can wedge the machine and destroy a multi-day tournament.
`unloadJudges` evicts every non-protected model before the next judge loads,
and `_memory-watchdog.sh` enforces a 109GB ceiling independently, unloading
largest-first and halting-and-surfacing if only protected models remain over
the line.

### Results

| judge | accuracy | trivial baseline | beats? | abstained | consistency | bucket |
|---|---|---|---|---|---|---|
| `granite4.1:30b` | 0.526 | 0.579 | **no** | 0 | 0.632 | **low** — refused |
| `nemotron3:33b` | **0.737** | 0.579 | yes (+0.158) | 0 | 0.842 | **medium** — calibrated |

**`rubricCalibrated` can now be earned.** `nemotron3:33b` is the first judge to
clear every guard: it beats the trivial fixed-preference baseline by 0.158, it
is order-consistent at 0.842 (above the 0.7 trust threshold), and it abstained
on nothing. Fed into `calibrationGate` this returns `calibrated: true` — the
first time that gate has ever passed, after refusing in both tournament rounds
for want of a battery that had never been authored.

**Stated with its error bar, because n=19 is small.** 14/19 = 0.737 has a
binomial SE of 0.101, so the 95% CI is [0.539, 0.935] and the 0.7 trust
threshold sits *inside* it. This is evidence the judge discriminates, not proof
it is reliable. The honest reading: good enough to stop being fail-closed for
want of any evidence at all, not good enough to lean on hard. Growing the
battery is the obvious follow-up and is cheap — round 2 is generating more
recorded pairs as it runs.

### The finding underneath: judging and doing are different competencies

Both directions are now measured on the same battery, which is worth more than
either result alone:

| model | can it DO the data-ops task? | can it RANK definitions for it? |
|---|---|---|
| `granite4.1:30b` | **no** — floor-saturates, 0.000 on every arm | **no** — 0.526, below the trivial baseline |
| `nemotron3:33b` | **no** — 3220s then unparseable output as a candidate | **yes** — 0.737, beats baseline, order-consistent |

`nemotron3` was written off earlier in this arm as "unusable", and that verdict
was correct *for the candidate role* and wrong as a general statement about the
model. A model that cannot solve a task can still rank solutions to it — which
is the entire premise of a judge, and is why the cross-family judge is worth
having rather than reusing the candidate model.

Remaining candidates are swept as they land.
