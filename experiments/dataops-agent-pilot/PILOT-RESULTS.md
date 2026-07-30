# PILOT RESULTS — the phase-5 gate arm (INTERIM: separation gate incomplete)

**Status:** separation gate partially run. **The phase-5 gate is NOT YET DECIDED.**
Decision rule and null conditions were fixed in advance — see `PREREG.md`,
committed at `3361b42` before any blind tournament data existed.

## Verdict so far

**Phase 5 remains GATED.** Not because a gain was measured and found absent —
because the experiment that would measure it has not yet been run. What has been
established is the validity of the instrument and the viability of one model.

## What was run

### 1. Separation gate on the configured default — FLOOR SATURATION

`granite4.1:30b` (the repo's configured `DEFAULT_BATTERY_MODEL`), 3 prompt-quality
arms × 3 seeds × 6 tasks:

| arm | mean testPassRate |
|---|---|
| `s0-minimal` | 0.000 |
| `s1-plausible` | 0.000 |
| `s2-strong` | 0.000 |

**SPREAD = 0.000.** No gradient. A tournament at this model tier can select on nothing.

### 2. Instrument validity — CHECKED, NOT ASSUMED

A measurement pinned at 0 is as uninformative as one pinned at 1, so the first
suspicion was harness fault. It is not. The model returns well-formed JSON at
exactly the required path; artifact extraction, `json-invariant` resolution and
check evaluation all work. It simply computes wrong numbers.

Two runs of the identical prompt gave **different** wrong answers
(`16 / 1394844`, then `14 / 1445438`; expected `15 / 744035`) — so candidate
scoring is **non-deterministic run to run**.

### 3. Model escalation — one model SOLVES the task exactly

Declared as a fixed list in `PREREG.md` §2 before running. Single task, seed 7,
strong prompt:

| model | latency | result |
|---|---|---|
| `granite4.1:30b` | 10s | `14 / 1445438` — wrong |
| `nemotron3:33b` | **3220s** | **unparseable** — unusable |
| `qwen3.6:latest` | 541s | **`15 / 744035` — EXACT MATCH** |

## The correction this forces

The interim read recorded during the run was that floor saturation would prove
**structural** — that the battery might be ungradeable at any locally-available
tier. **That is disproven.** `qwen3.6:latest` recovered both ground-truth facts
exactly. The battery is solvable, the oracle is sound, and the constructed
answer-first design works end to end against a real model.

This is recorded because it was predicted wrong, not despite it.

## What still stands

Three structural properties of the phase-1 battery design, found by running it:

1. **The fitness landscape is sparse by construction.** Every check is
   exact-integer equality on a 6-digit `revenueCents`. A near-miss and a wild
   miss both score 0. Hill-climbing needs a gradient; exact-match on a 6-digit
   integer supplies almost none.
2. **The task prompt already carries the methodology.** `buildTasks` spells out
   dedup, all three amount formats, the backup column, all three date formats
   and the customer/month filter — most of what a "good" agent definition would
   say. The *system prompt*, which is what a tournament evolves, has little
   headroom left to add.
3. **Scoring is noisy run to run**, which compounds (1).

None of these are model-tier problems. They belong to the battery design.

## The open question that decides the gate

**Does `qwen3.6` land in the discriminating band `0 < rate < 1`?**

- If prompt quality moves its score → there is a gradient → run the tournament.
- If it scores ~1.000 regardless of prompt → **ceiling** saturation → the gate is
  NOT MET for the same reason as the floor: nothing to select on. This is the
  recall-saturation null five of this repo's six prior arms hit
  (`../EXPERIMENT-SUMMARY.md`).

n=1 so far (one task, one seed, one prompt). That is not evidence about the band.

## Cost of resolving it

**Wall-clock, not money.** All inference is local Ollama — genuinely $0, no API
spend, per the project's standing billing rule.

At 541s/task for `qwen3.6`:

| step | calls | est. wall-clock |
|---|---|---|
| Reduced separation gate (3 prompts × 1 seed × 6 tasks) | 18 | **~2.7 h** |
| Full separation gate (3 prompts × 3 seeds × 6 tasks) | 54 | ~8 h |
| Tournament (N specimens × generations × split battery, 3 seeds) | 500+ | **days** |

A full pre-registered tournament at this latency is not feasible in-session.

## Recommended next move

**Run the reduced separation gate on `qwen3.6` first** (~2.7 h, unattended). It
is the cheapest thing that can kill or confirm the gate:

- spread ≈ 0 at ceiling → gate **NOT MET**, and the actionable finding is a
  **phase-3 battery revision** (graded/partial-credit checks, less prescriptive
  task prompts, more headroom for the system prompt to matter) — not a phase-5
  build;
- spread > 0 → the band exists, and a tournament is justified and can be
  scheduled as a long-running job.

Either outcome is a real result. Do **not** run the tournament before the band is
established — selecting on a saturated battery would manufacture a gain, which is
precisely the α→0 failure this milestone exists to prevent.

## Reproduce

```
./node_modules/.bin/tsx experiments/dataops-agent-pilot/_separation.ts   # full gate
./node_modules/.bin/tsx experiments/dataops-agent-pilot/_modelsweep.ts   # model sweep
```

`_separation.ts` currently pins the default model; point it at `qwen3.6:latest`
via `runAgentBattery`'s `provider` option for the reduced gate.
