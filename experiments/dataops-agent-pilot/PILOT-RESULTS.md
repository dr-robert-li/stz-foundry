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
