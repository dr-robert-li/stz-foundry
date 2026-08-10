# BI ceiling-gate readout — §6 format-stability / ceiling gate

## 1. What this gate is, and why it runs first

Per `BI-BATTERY-DESIGN.md` §6: at each grid point, the candidate is shown
the task's own prompt PLUS the reference SQL query VERBATIM plus the same
§2 output-contract instruction the corridor probe uses. A candidate that
simply transcribes the given query into the required fence should score at
or near 1.0 if extraction and execution both work — this isolates
extraction/execution reliability from query-writing capability. If a point
cannot clear this bar, whatever a later difficulty probe measures at that
point is a format confound wearing a difficulty costume, not a real
capability reading (§9 gate condition 1). This gate runs BEFORE any
difficulty work for exactly that reason.

## 2. Run configuration actually captured (§4)

Captured at run time into `bi-ceiling-state.json`'s `runConfig` field, not
pinned as a design constant:

| Field | Value |
|---|---|
| Ollama version | `ollama version is 0.32.5` |
| Model digest | `qwen3.6:latest             07d35212591f    23 GB     3 months ago` (from `ollama list`) |
| Sampler parameters | none sent — no `temperature`, no `max_tokens` override in the request body (`provider.ts`'s openai-compatible adapter omits both fields entirely when unset); server/model default applies |
| `OLLAMA_NUM_PARALLEL` | unset — server default |
| Client concurrency | 1 |
| Task order | battery order, sequential (grid level L1..L4, seed 101 then 202, task 0..9) |
| Task timeout bound | 3,600,000 ms (3600s, §8) |
| System prompt (Phase-8-derived pin) | `"You are a SQL assistant."` — the design names no system prompt for this gate, only the user-prompt content; this is `BI_CEILING_SYSTEM_PROMPT` in `_bi-ceiling.ts` |
| State-file path the verdict was read from | `experiments/bi-analytics-pilot/bi-ceiling-state.json` |

Model: `qwen3.6:latest`. Seeds: `BI_CEILING_GATE_SEEDS` (101, 202) only.
n = `BI_CEILING_GATE_N_PER_POINT` (20) per point = 2 seeds x 10 tasks.
Grid: all four levels L1-L4. Total: 80 tasks.

## 3. Per-task status accounting (all 80, read BEFORE any aggregate)

| Status | Count |
|---|---|
| `ok` | 80 |
| `timeout` | 0 |
| `error` | 0 |

`state.retries` (the §4 no-redraw rule's harness-fault retry log): **empty**
— zero harness faults fired, so zero retries were needed. No task hit the
3600s timeout bound. All 80 results are the harness's first and only
attempt.

Per-task status was verified complete and accounted for above before any
of the aggregate figures in §4 below were read, per the milestone's
standing rule.

## 4. Per-point table — §9 gate condition 1, both conjuncts reported separately

| point | n | no-artifact | non-executable-artifact | no-artifact-OR-non-executable (conjunct 1) | mean graded score (conjunct 2) | exact rate | median wall ms | verdict |
|---|---|---|---|---|---|---|---|---|
| L1 | 20 | 0 | 0 | 0 | 1.000 | 1.000 | 10,781 | **GATE PASS** |
| L2 | 20 | 0 | 0 | 0 | 1.000 | 1.000 | 10,641 | **GATE PASS** |
| L3 | 20 | 0 | 0 | 0 | 1.000 | 1.000 | 7,837 | **GATE PASS** |
| L4 | 20 | 0 | 0 | 0 | 1.000 | 1.000 | 11,733 | **GATE PASS** |

Conjunct 1 (`no-artifact-OR-non-executable` = 0) and conjunct 2
(`mean graded score >= 0.95`) are reported separately AND as the
conjunction, per F-62: a single execution failure cannot hide inside the
0.05 tolerance the mean-score threshold alone would otherwise permit.
Points are never pooled across levels — each row is that point's own full
20-task sample.

## 5. §4 zero-decomposition counts per point, all four categories

| point | no-artifact | non-executable-artifact | executes-but-wrong | correct |
|---|---|---|---|---|
| L1 | 0 | 0 | 0 | 20 |
| L2 | 0 | 0 | 0 | 20 |
| L3 | 0 | 0 | 0 | 20 |
| L4 | 0 | 0 | 0 | 20 |

Every one of the 80 tasks landed `correct` (graded score 1.0), and every
`correct` task was also `exact` (graded score 1.0 AND `|expected| =
|actual|` with nothing extra and nothing missing).

## 6. Verdict — ALL FOUR POINTS PASS

All four grid points (L1, L2, L3, L4) pass the §6 format-stability /
ceiling gate on both conjuncts: zero no-artifact-or-non-executable
responses and a mean graded score of 1.000, well above the 0.95 threshold,
at every point.

Per §6: "surviving points exist for the Phase-9 difficulty probe" — none
of the four points is excluded. §9 gate condition 1 is point-scoped, and
this readout is what Phase 9 will re-cite against whichever specific point
ultimately qualifies through the full corridor probe (§6's stage-1/gradient/
headroom/stage-2 pipeline, none of which this gate runs or substitutes
for). This gate says only: extraction and execution are not the bottleneck
at any of the four points — the ceiling itself is clear, so a later
difficulty reading at any of L1-L4 will measure query-writing capability,
not a format confound. Whether any point ultimately qualifies as the
`QUALIFIED` corridor point is Phase 9's own, separate, much stricter
question.

## 7. One-shot compliance note

No prompt text, dialect set, grid point, or scoring rule was changed at any
moment after the first task returned (the driver committed at `3526be4`,
`2026-08-10T12:56:48+10:00`, strictly before the first data-bearing commit
touching `bi-ceiling-state.json`). No failing point was re-run — there was
no failing point to re-run; every point passed on its first and only
20-task sample. `BI-BATTERY-DESIGN.md` is byte-unchanged since the freeze
commit (`git diff c950e4d03bafa6595070b7fdd72e4a1117c4f30d HEAD --
experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` is empty).
