# BI §5 pretest screen readout — REQ-54

## 1. What this screen is, and its F-09 caveat

Per `BI-BATTERY-DESIGN.md` §5: before the pre-registered six-seed corridor
probe (§6) may run, the baseline arm is sampled at a small n (10) against
every grid level, on a single pinned seed (999, `BI_PRETEST_SEED`, distinct
from every stage-1/stage-2 seed), and every adjacent pair's mean-score
movement is checked against a 0.10 granularity ceiling. A violating pair is
subdivided into its own new named integer-knob level, capped at ONE pass per
pair (F-34) — never carried forward coarse, never iterated further.

**F-09, stated plainly:** this is a coarse SCREEN, not a confirmatory
measurement. A small-n sample at (now) five levels on one seed catches only
LARGE granularity violations, never a boundary case near the 0.10 ceiling
itself. Final confirmation of granularity only ever happens on the full
six-seed stage-1 grid's own seed-clustered estimate (§6) — which this
instrument line never reaches, because the screen below terminates it first.

## 2. Run configuration and the two Phase-9-derived prompt pins (§4)

Captured at run time into `bi-pretest-state.json`'s `runConfig` field:

| Field | Value |
|---|---|
| Ollama version | `ollama version is 0.32.5` |
| Model digest | `qwen3.6:latest             07d35212591f    23 GB     3 months ago` |
| Sampler parameters | none sent — no `temperature`, no `max_tokens` override; server/model default applies |
| `OLLAMA_NUM_PARALLEL` | unset — server default |
| Client concurrency | 1 |
| Task order | pretest: `BI_GRID` order (ascending knobValue), baseline arm only, seed 999, task 0..9 |
| Task timeout bound | 3,600,000 ms (3600s, §8) |
| State-file path | `experiments/bi-analytics-pilot/bi-pretest-state.json` |

Both prompt pins freeze from the moment the first pretest task returned
(pass 1, level L1, task 0) and are recorded verbatim below.

**`BI_PROBE_SYSTEM_PROMPT`** (carried byte-identical from Phase 8's
`BI_CEILING_SYSTEM_PROMPT`, `_bi-ceiling.ts`):

```
You are a SQL assistant.
```

**`BI_BASELINE_GUIDANCE`** (one static module-level string, a pure suffix,
identical for every task/level/seed):

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

The pretest screen runs the BASELINE arm only (§5), so this suffix is what
every pretest prompt actually carries beyond the arm-neutral prompt.

## 3. Per-task status accounting — all 50 pretest tasks, BEFORE any aggregate

| Level | n | `ok` | `timeout` | `error` |
|---|---|---|---|---|
| L1 | 10 | 10 | 0 | 0 |
| L2 | 10 | 10 | 0 | 0 |
| L2B | 10 | 10 | 0 | 0 |
| L3 | 10 | 10 | 0 | 0 |
| L4 | 10 | 10 | 0 | 0 |
| **Total** | **50** | **50** | **0** | **0** |

`state.retries` (the §4 no-redraw rule's harness-fault retry log): **empty**
across both passes — zero harness faults, zero retries needed, no task hit
the 3600s timeout bound. No excision amendment applies (the prior arm's
reboot-outage excision precedent is scoped to provider-fault units with the
instant-error signature; none occurred here).

## 4. Per-level table (final grid, both passes merged)

| level | knob | n | mean graded score | exact rate | no-artifact | non-executable | executes-but-wrong | correct |
|---|---|---|---|---|---|---|---|---|
| L1 | 1 | 10 | 0.700 | 0.700 | 1 | 0 | 2 | 7 |
| L2 | 2 | 10 | 0.800 | 0.800 | 0 | 0 | 2 | 8 |
| L2B | 3 | 10 | 0.500 | 0.500 | 0 | 0 | 5 | 5 |
| L3 | 4 | 10 | 0.500 | 0.500 | 0 | 0 | 5 | 5 |
| L4 | 5 | 10 | 0.400 | 0.400 | 0 | 1 | 5 | 4 |

L1, L2, L3, L4's n=10 samples are pass 1 (the ORIGINAL four-level grid,
`bi-pretest-verdict.pass1.json`, kept as provenance); L2B's n=10 sample is
pass 2, the ONE permitted §5/F-34 subdivision re-screen. `once()` replayed
the four cached original-level units unchanged and ran only the new L2B
unit — no original level's data was re-drawn.

## 5. Adjacent-pair tables — pass 1 (the original four-level grid)

| left | right | \|Δmean\| | clears 0.10 |
|---|---|---|---|
| L1 | L2 | 0.100 | yes |
| L2 | L3 | 0.300 | **NO** |
| L3 | L4 | 0.100 | yes |

One violating pair: L2↔L3 (Δ=0.30, three times the ceiling) — this is what
triggered the §5 subdivision below. L1↔L2 and L3↔L4 both clear at exactly
the 0.10 boundary (see §7's float-epsilon note on how that boundary reading
was adjudicated).

**Pass 2 (post-subdivision, the final committed-at-termination grid):**

| left | right | \|Δmean\| | clears 0.10 | post-subdivision pair |
|---|---|---|---|---|
| L1 | L2 | 0.100 | yes | no |
| L2 | L2B | 0.300 | **NO** | yes |
| L2B | L3 | 0.000 | yes | yes |
| L3 | L4 | 0.100 | yes | no |

## 6. Screen outcome: **TERMINATE** — the §10 terminal exit

**The subdivision record (F-16/F-34/F-35):**

- **Violating pair:** L2↔L3 (Δ=0.30), found on the original four-level grid.
- **New level:** `L2B`, its own new named level with its own INTEGER knob
  value (3) on the renumbered contiguous scale — never a fractional
  insertion. L3 and L4's knobValue shifted from 3/4 to 4/5 to keep the scale
  contiguous; their STRUCTURAL definitions (joins/aggregations, and
  therefore their reference SQL and prompts) are byte-unchanged.
- **Structural increment:** a single ADDED filter clause (§5's own named
  recipe, never a join or an aggregation) — `L2B` is L2's exact shape (1
  join to `dim_customers`, 0 aggregations) PLUS `AND dc.segment = <value>`,
  where `<value>` is sampled ONLY from segments that actually have an order
  in the task's already-guaranteed-present chosen month (the same
  forced-shape, guaranteed-non-empty discipline the month pool itself uses
  — never left to chance). `segment` is filtered but never projected (`L2B`
  projects `order_id, customer_name`, same as L2), so the filter's own value
  can never leak as a returned cell.
- **Test-scoping consequence:** the F-17 formula (`knobValue === 1 + joins +
  aggregations`) and the `BI_GRID` exact-shape assertion both broke under
  the live renumbered grid — not only for `L2B` but for `L3`/`L4` too, since
  renumbering shifted their knobValue without changing their structure. This
  is a pre-registered, disclosed consequence of the §5 subdivision rule
  itself, resolved by SCOPING rather than deleting: the F-17 assertion now
  binds to the four ORIGINAL levels' own structural identity (`joins +
  aggregations`), checked against their 1-based position among the
  originals rather than their live (renumbered) knobValue; `L2B`'s own
  accounting (knobValue 3, joins/aggregations identical to L2's 1/0, and
  that it deliberately does NOT satisfy the F-17 formula) is asserted
  explicitly, separately, in its own test. `recomputeExpected`
  (`test/fixtures/bi-reference-interpreter.ts`) and the question-fidelity
  independent renderer (`test/fixtures/bi-question-fidelity.ts`) both gained
  an independently-written `extraFilter` branch; the F-22 import-graph
  independence check still passes (verified — see §8).
- **The two new pairs' post-subdivision movements:** L2↔L2B still moves
  0.30 — the SAME magnitude as the original L2↔L3 violation, meaning the
  intermediate level did not bridge the cliff at all; L2B↔L3 moves 0.000
  (L2B and L3 landed on the identical 0.500 mean).

**Adjudication:** L2↔L2B (Δ=0.30) still violates the 0.10 ceiling after its
one permitted subdivision pass. Per F-34, this is NOT iterated further —
subdivision is capped at exactly one pass per violating pair, and an
unbounded subdivision search is exactly the post-data grid-shopping the
screen exists to prevent. This is the §10 terminal exit: **the knob cannot
be resolved to the design's granularity at this instrument.** The corridor
probe does not launch; `experiments/bi-analytics-pilot/bi-corridor-verdict.json`
records `complete: true`, `verdict: "FAILURE BRANCH"`, `failureStage:
"pretest"`, `selectedPoint: null`, `unitsEvaluated: []`, pointing to this
document as the evidence — REQ-55 records the pre-committed failure branch
on this basis, satisfying the phase.

The grid the driver operated against at termination is `L1, L2, L2B, L3,
L4` (knobValues 1, 2, 3, 4, 5) — the subdivided, renumbered grid; the
corridor probe never runs against it, per §10.

## 7. Deviations

### Auto-fixed issues

**1. [Rule 1 - Bug] Pretest ceiling comparison tolerated binary64
representation noise**

- **Found during:** adjudicating pass 1's own output, before any grid
  commit.
- **Issue:** `L1`'s mean (0.700) and `L2`'s mean (0.800) are both
  exact-rational (every non-`correct` task in both units scored exactly 0,
  so `7/10` and `8/10` respectively) — the TRUE mathematical gap is exactly
  0.10. `L3`'s (0.500) and `L4`'s (0.400) means are exact-rational the same
  way — also a TRUE 0.10 gap. Neither decimal literal has an exact binary64
  representation, so IEEE754 subtraction yielded `0.10000000000000009`
  (L1↔L2) and `0.09999999999999998` (L3↔L4) — a ~1e-16 representation
  artifact that landed the two mathematically-IDENTICAL 0.10 gaps on
  OPPOSITE sides of a strict `<=` comparison.
- **Fix:** added `PRETEST_GRANULARITY_TOLERANCE` (1e-9) to the ceiling
  comparison, by analogy to F-23's own `BI_NUMERIC_TOLERANCE` (1e-6)
  precedent — a different mechanism (result-cell equality) but the same
  principle, applied here since §5 pins no tolerance of its own. 1e-9 is
  generous against the ~1e-16 noise scale and negligible against any real
  ≥1e-3 measurement difference, so it can only reclassify a true
  float-epsilon artifact, never mask a genuine violation.
- **Files modified:** `experiments/bi-analytics-pilot/_bi-corridor.ts`.
- **Commit:** `0b8429a` — committed BEFORE any pretest data existed in the
  driver's own commit history, so `_bi-corridor.ts`'s commit stays a strict
  ancestor of the first pretest-data commit.
- Both `L1↔L2` and `L3↔L4` now correctly clear the ceiling exactly at the
  0.10 boundary. Recorded per the design's own text: the screen judges
  `|Δmean|` against the ceiling — direction is not itself a pass/fail
  criterion. For the record, `L1↔L2` moved UP (mean INCREASED from L1 to
  L2, i.e. easier at the higher knob value at the low end of the grid) —
  an observation, not a violation, since only the magnitude is checked here.

None of the pass-2 (subdivision) pairs were affected by this fix — L2↔L2B's
0.300...004 reading is a genuine ~3x-ceiling violation regardless of
tolerance, and L2B↔L3's 0.000 reading has no float-boundary ambiguity.

### Architectural note

No Rule 4 (architectural) deviation occurred. The §5 subdivision itself is
the plan's own pre-registered mechanism, not a deviation from it.

## 8. F-22 / F-25 / leak-check evidence for the new level

`L2B` was added to `test/foundry-bi-warehouse.test.ts`'s two hardcoded
`LEVELS` arrays, bringing the nine-seed equality sweep to 9 seeds × 5
levels × 10 tasks = 450 task comparisons (`git commit`, this readout's own
commit). The full suite green at that commit is itself the evidence that,
for `L2B`, across all nine sweep seeds:

- `recomputeExpected` (the independently-written interpreter) agrees with
  the executed reference SQL under `resultSetsEqual` (F-23) — the nine-seed
  equality sweep test.
- Every task's expected result set is non-empty (F-25) — proving the
  guaranteed-present segment-sampling discipline actually holds, not merely
  argued.
- No task's prompt leaks the reference SQL text or any expected cell value
  at a digit/token boundary (the leak-check sweep) — proving the
  filter-but-never-project discipline holds.
- `test/fixtures/bi-reference-interpreter.ts` and
  `test/fixtures/bi-question-fidelity.ts` both remain import-clean of every
  forbidden generator/engine module (F-22's mechanical independence check).
- The generator's rendering and the independent rendering agree
  field-for-field on `L2B`'s new `extraFilter` field too (F-20 question
  fidelity, extended).

## 9. One-shot / freeze compliance

- `BI-BATTERY-DESIGN.md` is byte-unchanged from freeze commit `c950e4d`:
  `git diff c950e4d03bafa6595070b7fdd72e4a1117c4f30d HEAD --
  experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` is empty.
- L1-L4's prompts are byte-identical before and after every `bi-warehouse.ts`
  edit in this plan — verified empirically (not by code review alone) by
  dumping `buildBiTasks(generateBiWarehouse(999), L).map(t => t.prompt)` for
  L1-L4 before and after the subdivision edit and diffing; the diff is
  empty. `spec.extraFilter` is `undefined` for every original level, so
  every conditional branch touching the prompt/SQL/footer text is a no-op
  for L1-L4 by construction.
- The corridor driver's own commit (`3fdcbeb`, plus the tolerance fix at
  `0b8429a`) is a strict git ancestor of the first pretest-data commit —
  neither commit contains a pretest data file.
- Subdivision fired exactly once, per F-34; the driver code was not edited
  between the two pretest passes (only `bi-warehouse.ts` and its tests
  changed, per §5's own permitted-change window).
