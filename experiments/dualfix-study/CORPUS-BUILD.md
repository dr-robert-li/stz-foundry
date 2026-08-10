# DUALFIX §4 corpus build readout — REQ-63

## 1. What this run is

Per `DUALFIX-STUDY-PREREG.md` §4: the full pinned sixty-unit draw order (six
fresh seeds, ten `L3` tasks per seed) run against the guided baseline
(D-A1/Route B) prompt through the detached, checkpointed corpus builder
(`_dualfix-corpus-build.ts`, plan 12-01), launched via `_launch-probe.sh`
against the single local Ollama inference slot. Every draw's baseline
attempt is scored independently by the BI oracle's existing `categorize`
path; a candidate is eligible for the corpus iff its `gradedScore` is
exactly `0` (§4's eligibility predicate — zero-overlap only, never the
wider `gradedScore < 1` population).

## 2. Run configuration

Captured at run time into `dualfix-corpus-build-state.json`'s `runConfig`
field, transcribed verbatim from `dualfix-corpus-build-verdict.json`:

| Field | Value |
|---|---|
| Ollama version | `ollama version is 0.32.5` |
| Model digest | `qwen3.6:latest             07d35212591f    23 GB     3 months ago` |
| Sampler parameters | none sent — no `temperature`, no `max_tokens` override; provider/server default applies |
| `OLLAMA_NUM_PARALLEL` | unset — server default |
| Per-draw timeout | 3,600,000 ms (3600s) |
| Level id | `L3` |
| Seed list | `[1201, 1202, 1203, 1204, 1205, 1206]` |
| Draw order | `DUALFIX_STUDY_SEEDS` array order, then `taskIndex` 0..9 within each seed — deterministic, total, and stable |

**`BI_PROBE_SYSTEM_PROMPT`:**

```
You are a SQL assistant.
```

**`BI_BASELINE_GUIDANCE`** (the D-A1 guided-baseline pure suffix):

```
A few pointers before you write the query:
- Column names in this schema are self-describing (for example
  customer_name, segment, category, order_date) — match the question's
  business terms to the exact column name rather than guessing an
  abbreviation.
- When a dimension table is needed, join it on its declared
  primary/foreign key pair (fact_orders.customer_id to
  dim_customers.customer_id, or fact_orders.product_id to
  dim_products.product_id) rather than a derived or inferred join key.
- If the question asks for a total or a count broken down by one or more
  columns, double-check that every one of those columns appears in your
  GROUP BY clause, and only those columns — a missing or extra grouping
  column is one of the most common ways a correct-looking query returns
  the wrong rows.
```

## 3. Per-draw status accounting — all 60 draws, BEFORE any aggregate

Draw order matches §4's pinned order (seed order, then task index within
seed). `eligible` is `gradedScore === 0` exactly (§4's predicate).

| # | seed | taskIndex | status | category | gradedScore | inputTokens | outputTokens | wallMs | eligible |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1201 | 0 | ok | no-artifact | 0 | 531 | 4206 | 68359 | yes |
| 2 | 1201 | 1 | ok | correct | 1 | 531 | 5422 | 80000 | no |
| 3 | 1201 | 2 | ok | executes-but-wrong | 0 | 531 | 4205 | 61340 | yes |
| 4 | 1201 | 3 | ok | executes-but-wrong | 0 | 531 | 5279 | 76920 | yes |
| 5 | 1201 | 4 | ok | executes-but-wrong | 0 | 531 | 2147 | 31552 | yes |
| 6 | 1201 | 5 | ok | correct | 1 | 531 | 13045 | 195259 | no |
| 7 | 1201 | 6 | ok | correct | 1 | 531 | 5472 | 80747 | no |
| 8 | 1201 | 7 | ok | executes-but-wrong | 0 | 531 | 2144 | 31600 | yes |
| 9 | 1201 | 8 | ok | executes-but-wrong | 0 | 531 | 3447 | 50533 | yes |
| 10 | 1201 | 9 | ok | correct | 1 | 531 | 10111 | 149595 | no |
| 11 | 1202 | 0 | ok | correct | 1 | 531 | 4542 | 66278 | no |
| 12 | 1202 | 1 | ok | correct | 1 | 531 | 4982 | 73547 | no |
| 13 | 1202 | 2 | ok | correct | 1 | 531 | 10855 | 160799 | no |
| 14 | 1202 | 3 | ok | correct | 1 | 531 | 3757 | 54832 | no |
| 15 | 1202 | 4 | ok | correct | 1 | 531 | 5600 | 82718 | no |
| 16 | 1202 | 5 | ok | executes-but-wrong | 0 | 531 | 3701 | 54365 | yes |
| 17 | 1202 | 6 | ok | executes-but-wrong | 0 | 531 | 10998 | 163121 | yes |
| 18 | 1202 | 7 | ok | executes-but-wrong | 0 | 531 | 2964 | 43529 | yes |
| 19 | 1202 | 8 | ok | executes-but-wrong | 0 | 531 | 1952 | 28952 | yes |
| 20 | 1202 | 9 | ok | correct | 1 | 531 | 5608 | 82171 | no |
| 21 | 1203 | 0 | ok | correct | 1 | 531 | 6067 | 88599 | no |
| 22 | 1203 | 1 | ok | correct | 1 | 531 | 3345 | 48880 | no |
| 23 | 1203 | 2 | ok | executes-but-wrong | 0 | 531 | 2932 | 43219 | yes |
| 24 | 1203 | 3 | ok | executes-but-wrong | 0 | 531 | 4242 | 62506 | yes |
| 25 | 1203 | 4 | ok | correct | 1 | 531 | 8927 | 131644 | no |
| 26 | 1203 | 5 | ok | executes-but-wrong | 0 | 531 | 3646 | 53423 | yes |
| 27 | 1203 | 6 | ok | correct | 1 | 531 | 5122 | 75074 | no |
| 28 | 1203 | 7 | ok | no-artifact | 0 | 531 | 3817 | 56190 | yes |
| 29 | 1203 | 8 | ok | executes-but-wrong | 0 | 531 | 1384 | 20542 | yes |
| 30 | 1203 | 9 | ok | executes-but-wrong | 0 | 531 | 4509 | 66501 | yes |
| 31 | 1204 | 0 | ok | executes-but-wrong | 0 | 531 | 4145 | 61129 | yes |
| 32 | 1204 | 1 | ok | correct | 1 | 531 | 4596 | 67127 | no |
| 33 | 1204 | 2 | ok | correct | 1 | 531 | 5792 | 85235 | no |
| 34 | 1204 | 3 | ok | correct | 1 | 531 | 7306 | 107138 | no |
| 35 | 1204 | 4 | ok | correct | 1 | 531 | 5807 | 85639 | no |
| 36 | 1204 | 5 | ok | correct | 1 | 531 | 4926 | 71764 | no |
| 37 | 1204 | 6 | ok | executes-but-wrong | 0 | 531 | 3691 | 54402 | yes |
| 38 | 1204 | 7 | ok | correct | 1 | 531 | 4966 | 74451 | no |
| 39 | 1204 | 8 | ok | executes-but-wrong | 0 | 531 | 6135 | 89811 | yes |
| 40 | 1204 | 9 | ok | executes-but-wrong | 0 | 531 | 5744 | 83983 | yes |
| 41 | 1205 | 0 | ok | correct | 1 | 531 | 5334 | 77792 | no |
| 42 | 1205 | 1 | ok | correct | 1 | 531 | 7717 | 113229 | no |
| 43 | 1205 | 2 | ok | correct | 1 | 531 | 4854 | 70835 | no |
| 44 | 1205 | 3 | ok | correct | 1 | 531 | 5235 | 76540 | no |
| 45 | 1205 | 4 | ok | correct | 1 | 531 | 2588 | 37995 | no |
| 46 | 1205 | 5 | ok | correct | 1 | 531 | 4214 | 61446 | no |
| 47 | 1205 | 6 | ok | correct | 1 | 531 | 5517 | 80874 | no |
| 48 | 1205 | 7 | ok | executes-but-wrong | 0 | 531 | 2599 | 38459 | yes |
| 49 | 1205 | 8 | ok | correct | 1 | 531 | 5945 | 86971 | no |
| 50 | 1205 | 9 | ok | correct | 1 | 531 | 6427 | 95079 | no |
| 51 | 1206 | 0 | ok | correct | 1 | 531 | 5270 | 76955 | no |
| 52 | 1206 | 1 | ok | correct | 1 | 531 | 6175 | 90256 | no |
| 53 | 1206 | 2 | ok | correct | 1 | 531 | 5273 | 78057 | no |
| 54 | 1206 | 3 | ok | correct | 1 | 531 | 3522 | 51891 | no |
| 55 | 1206 | 4 | ok | non-executable-artifact | 0 | 531 | 8257 | 121455 | yes |
| 56 | 1206 | 5 | ok | executes-but-wrong | 0 | 531 | 5081 | 75082 | yes |
| 57 | 1206 | 6 | ok | correct | 1 | 531 | 6871 | 100654 | no |
| 58 | 1206 | 7 | ok | correct | 1 | 531 | 5790 | 85224 | no |
| 59 | 1206 | 8 | ok | correct | 1 | 531 | 4936 | 72690 | no |
| 60 | 1206 | 9 | ok | executes-but-wrong | 0 | 531 | 4245 | 62575 | yes |

`state.retries` (the harness-fault retry log): no harness-fault retry
mechanism is invoked by this builder — every one of the 60 draws landed
`status: ok` on its first and only attempt; zero `timeout`, zero `error`.

## 4. Aggregates — only after the table above

- **Total draws taken:** 60 (the full pinned draw order, all six seeds
  exhausted).
- **Status breakdown:** `ok` 60 / `timeout` 0 / `error` 0.
- **Category breakdown:** `correct` 36 / `executes-but-wrong` 21 /
  `no-artifact` 2 / `non-executable-artifact` 1.
- **Eligible count (`gradedScore === 0` exactly):** **24**.
- **Terminal outcome, quoted from `dualfix-corpus-build-verdict.json`:**
  `"outcome": "CLOSED-AT-MINIMUM"`, `"drawsTaken": 60`,
  `"eligibleCount": 24`, `"targetN": 30`, `"minN": 20`.

**Prereg clause this outcome corresponds to:** §4 "Target and minimum n" /
"Corpus is pinned once" — 24 is at or above `DUALFIX_CORPUS_MIN_N = 20` and
below `DUALFIX_CORPUS_TARGET_N = 30`, so per §4's pinning clause ("once the
corpus reaches its target (or is closed at the minimum per §8)") the corpus
closes at the minimum and is pinned with its actually-observed 24 eligible
entries — this is a sufficient outcome, distinct from §8 clause 1's
`UNDERPOWERED` terminal state (which requires fewer than 20 eligible
candidates after the full draw order, and did not occur here).

## 5. Locked construction decisions (from 12-01)

- **Route B guided baseline prompt (D-A1).** The baseline attempt is shown
  the arm-neutral task prompt plus one fixed, pure-suffix guidance block
  (`BI_BASELINE_GUIDANCE`), never the bare arm-neutral prompt alone.
  Rationale: this is the exact construction the pretest screen's cited L3
  mean (0.500, n=10, seed 999) was measured under, so the §4 sizing
  projection stays comparable to the number it was derived from.
- **Detached, checkpointed build (D-A2).** The corpus is drawn by a
  standalone, resumable driver with its own record/state shapes — never a
  cast into `_dualfix-study.ts`'s `DualfixState`/`DualfixArmResult` — so a
  multi-hour run against the single local Ollama slot survives a session
  or process interruption without repeating any already-completed draw.

## 6. Route B prompt disclosure

§4 does not itself pin a baseline prompt string — it defines the
eligibility predicate, the seed list, the draw order, and the target/
minimum n, but is textually silent on which exact prompt the baseline
attempt is composed from. This build adopted the Route B guided-baseline
construction (§5 above) — the same construction the bi-analytics-pilot
pretest screen's cited L3 mean (0.500) was measured under. This is the
reading the §4 sizing projection ("sixty candidates are projected to
plausibly clear 30 eligible") depends on: the projection is only as good
as the assumption that this build's baseline failure rate resembles the
pretest screen's, which itself rests on running the identical baseline
construction. The frozen prereg leaves this choice textually open; 12-01's
D-A1 is the locked resolution, and this build followed it byte-identical
(both prompt constants copied verbatim from `_bi-corridor.ts`, confirmed by
`assertBaselineIsPureSuffix` on every one of the 60 draws).
