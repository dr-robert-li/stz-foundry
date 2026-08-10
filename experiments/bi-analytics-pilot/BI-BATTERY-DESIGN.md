# BI analytical-query-answering battery design — rev 1

**Status:** rev 1 / pre-panel. Not frozen. Rev 2 lands after the REQ-49 adversarial panel
adjudicates every finding (`DESIGN-REVIEWS.md`); this revision is the panel's target, not the
pre-registration of record.

**Authority:** Dr. Robert Li, 2026-08-10. Source documents: `experiments/method-research/RECOMMENDATION.md`
rev 2, `experiments/method-research/PREREG-DRAFT.md`.

## 0. What this is, and what it is not

This is the REQ-48 battery design for the BI analytical-query-answering instrument, instantiating
`RECOMMENDATION.md` rev 2 §4–§7 (the difficulty corridor, the seed-clustered noise budget, the
change ledger, and the four quantified disclosures) and `PREREG-DRAFT.md` §2's oracle
infrastructure (the SQL-execution-plus-result-diff mechanism named there). It is the operational
instrument REQ-49's adversarial panel then attacks. REQ-48 and REQ-49 are both closed by this
document once it is panelled and frozen.

What this document is **not**: it builds no generator (no file under `src/` is created or edited
in this phase); it runs no probe (no task executes against real data here); and it adopts no
pre-registration (`PREREG-DRAFT.md` is adopted, unedited, by REQ-58's own commit in Phase 9 — this
document does not touch that file and does not perform that adoption).

The standing bar this document is written against, in one paragraph: the v3/v3.1 data-ops line is
barred under any label — `V3.1-BATTERY-DESIGN.md` §6's one-shot termination clause forbids any
successor instrument for that hypothesis by changing parser, prompts, grid, scoring, or
qualification rules, and the bar is on SUBSTANCE, not name. `RECOMMENDATION.md` §2's four-axis
compliance mapping is the compliance test this design inherits from that recommendation, closed
PASS there; this document does not reopen that mapping, it builds the instrument the mapping
already cleared. Where this document characterises the terminated arm, it uses the terminal
report's own words: that arm ended in **instrument-line exhaustion, not a third null**
(`PILOT-RESULTS.md`, "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED") — rounds 1 and 2
were nulls on their own instruments, round 3 (v3/v3.1) never reached a qualifying point, so the
pre-registered three-nulls contingency was never reached and closed with the arm.

**Round variable (exactly one):** task distribution

This design changes nothing else about how a point is accepted or rejected: the qualification-gate
clause shape and the seed-clustered estimator are carried forward from `V3.1-BATTERY-DESIGN.md` §4
and `RECOMMENDATION.md` §5–§6 unchanged in structure, per §6 and §8 below.

## 1. Battery construction — fixture warehouse, known-answer query set, task prompts

**The BI fixture warehouse.** A small star schema, generated deterministically per seed following
the `fixture-warehouse-v3.ts` house pattern (a pure function of `(seed, knobs)`, no clock/provider
parameter, one seeded PRNG stream so one seed replays the whole warehouse): same seed + same knobs
regenerate a byte-identical warehouse, test-enforced in Phase 8.

- Fact table `fact_orders`: `order_id`, `customer_id`, `product_id`, `region_id`, `order_date`,
  `quantity`, `unit_price`, `discount_pct`.
- Dimension table `dim_customers`: `customer_id`, `customer_name`, `segment`, `region_id`.
- Dimension table `dim_products`: `product_id`, `product_name`, `category`, `unit_cost`.
- Dimension table `dim_regions`: `region_id`, `region_name`, `country`.

Row-count scale per seed: `fact_orders` ≈ 800 rows; `dim_customers` ≈ 40 rows; `dim_products` ≈ 25
rows; `dim_regions` ≈ 8 rows (each pinned in §8, marked `derived:` — no upstream document fixes
warehouse scale; the figure is chosen large enough that the §5 L4 grid point's two-JOIN-plus-
aggregation query returns a non-degenerate, non-empty result set at every seed). Storage/loading
form: the generated warehouse is materialized into an in-process SQL engine instance (an embedded
engine such as SQLite, loaded from the generator's in-memory tables) that §3's execution oracle
reads directly — no intermediate CSV export step, unlike the terminated line's CSV-emitted
warehouse.

**The known-answer query set, produced ANSWER-FIRST.** For each task, a reference SQL query is
composed by the generator from the grid point's structural template (§5) and executed against that
seed's warehouse to produce the pre-computed known-answer result set — both the reference query and
its answer exist BEFORE any candidate ever sees the question, so ground truth never depends on the
process under test. The natural-language business question is then derived from the reference
query's own semantics (which tables it touches, which columns it filters, groups, or aggregates, and
what business fact the aggregation represents), rendered as a plain-English question a business user
might ask. Ten tasks exist per seed per grid point (pinned in §8 as `derived:`, matching
`V3.1-BATTERY-DESIGN.md` §4's own per-seed task count), each a distinct instantiation of that
point's structural template against different filter values / grouping columns.

**The per-task prompt shape.** The candidate is shown: the warehouse schema (table and column names
and types, as DDL or an equivalent description), the natural-language business question, and the
output-contract instruction (§2 — emit exactly one fenced SQL block in the accepted dialect). The
candidate is NOT shown: the reference query, the known answer, or any row of the expected result
set — stated explicitly because a leaked answer is the exact failure Phase 8's leak checks exist to
catch.

## 2. Output contract and parsing semantics

The emitted artifact is an executable SQL statement. Extraction rules, in order, fail-closed,
mirroring `V3.1-BATTERY-DESIGN.md` §1's numbered discipline:

1. Collect fenced blocks whose info string, lowercased and trimmed, is EXACTLY `sql`. If ≥1 exists,
   the FIRST is the artifact.
2. Otherwise, collect fenced blocks with NO info string (a bare triple-backtick fence). If EXACTLY
   ONE exists, its body is the artifact. Zero, or more than one, → no artifact (ambiguity fails
   closed, as does zero matches under rule 1 and rule 2 together).
3. An extracted artifact that is not executable SQL against the frozen warehouse — a syntax error,
   or any engine-rejected statement — counts as NO ARTIFACT for the drop budget (§6, §8), never as a
   wrong answer. A non-executable artifact and an executes-but-wrong artifact are different failures
   and are never conflated (§4, §6).

Per the one-shot discipline (§10), this is the ONLY extraction contract: no prompt-text change, no
grammar beyond these two dialects, no second alias later.

The terminated arm lost a whole grid probe (G1→G5, `V3.1-BATTERY-DESIGN.md` §0) to an unanticipated
second fence dialect — 3%→60% of baseline-arm tasks emitting a plain ` ```json ` fence instead of the
required ` ```path=answer.json ` fence, content-driven rather than length-driven, making every hard
point's difficulty uninterpretable. This contract therefore declares its accepted dialects
(` ```sql `, and an unlabelled fence as the sole fallback alias) UP FRONT, before any data, rather
than relaxing them after a probe reveals a drift pattern. The accepted dialect set is frozen with
this document; widening it after data exists is a prohibited new generation of this line under §10.

## 3. Independent oracle infrastructure

Instantiating `PREREG-DRAFT.md` §2 and closing `RECOMMENDATION.md` §1's "admissible with
conditions" verdict on bi-analytics:

- **The SQL engine.** An embedded, in-process engine executes the candidate's extracted SQL artifact
  against that task's frozen warehouse instance and returns a real result set (or an engine error,
  which routes to §2 rule 3's no-artifact handling).
- **The result-set diff and the graded score.** Let `expected` be the pre-computed known-answer
  result set (a set of row-tuples over the reference query's declared column projection) and
  `actual` be the executed candidate result set. If `actual`'s column set (order-insensitive) does
  not match `expected`'s declared column projection, graded score = 0 — a differently-shaped
  projection is not a partial answer. Otherwise, comparing rows as unordered, type-normalized
  tuples:
  `graded score = |expected ∩ actual| / max(|expected|, |actual|)`.
  This is symmetric under both failure directions: dropping rows shrinks the intersection: numerator;
  a dump-everything or over-broad query inflates `|actual|`, the denominator, driving the score
  toward zero as spurious rows accumulate, so a `SELECT *`-style over-selection cannot manufacture a
  passing score. `exact` = graded score is 1.0 AND `|expected| = |actual|` (every row and column
  matches with nothing extra and nothing missing) — this is §6 clause (iii)'s `exact-match rate`.
- **The independent reference interpreter.** A second, separately implemented code path recomputes
  the expected result set directly from the warehouse's raw generation state (the in-memory
  fact/dimension arrays), replicating the intended join/aggregation logic without invoking the SQL
  engine and without calling any helper the generator's own precomputation step uses. Independence,
  stated precisely: the generator's precomputation step (which composes the reference query and
  executes it via the SQL engine to produce `precomputed`) and the reference interpreter (which walks
  the raw warehouse arrays and recomputes the same fact by a second, independently written
  implementation to produce `recomputed`) share zero helper functions — a shared import (for example,
  a common `computeAggregate()` used by both sides) would break independence by letting a bug in that
  shared helper canonicalize as truth on both paths. What is NOT independent: both sides still read
  the same seed's warehouse generation state; independence is in the COMPUTATION of the answer, not
  in the data source, mirroring `HANDOFF-V3.md` §1 T-A step 2's own reference-interpreter discipline.
- **The equality obligation.** Across a full seed sweep (all six stage-1 seeds plus all three
  stage-2 fresh seeds), `precomputed === recomputed` for every task. Phase 8 must make this pass
  before any task generated under this design is trusted; a mismatch anywhere in the sweep is a
  generator or interpreter bug, not a probe result.

Stated plainly, per `RECOMMENDATION.md` §2's F-04 note: this oracle is NOT immune to the terminated
line's dominant failure shape. A syntactically valid, successfully executing query that returns the
wrong result set is the direct analogue of the terminated arm's 395/479 parseable-but-wrong residual
— "well-formed artifact, wrong answer." The executes-but-wrong ceiling in §6, not the oracle's
mechanism, is the defense against it.

## 4. Instrumentation and run configuration

Every probe task stores in checkpoint state: the raw response text verbatim (no future phase of this
arm runs without raw-text retention), the extracted SQL artifact, the executed result set or the
engine error, the graded score, the exact flag, the task status, input/output tokens, and
wall-clock.

**The ZERO-DECOMPOSITION rule, prospective.** Every task response decomposes at scoring time into
exactly one of four named categories, fixed here before any data exists so no post-hoc category is
ever invented: **no-artifact** (§2 rule 2's zero-or-ambiguous case fires), **non-executable artifact**
(§2 rule 3's engine-rejection case fires), **executes-but-wrong** (the artifact executes but its
graded score is below 1.0 — includes both partial-overlap and zero-overlap results), or **correct**
(graded score = 1.0, further flagged `exact` per §3's exact definition).

**Run configuration, recorded as part of the instrument** (per `V3.1-BATTERY-DESIGN.md` §3): ollama
version, model digest, sampler parameters, `OLLAMA_NUM_PARALLEL`, client concurrency, and task order
(battery order, sequential) are all captured in checkpoint state at run time — they are properties
of the executed run, not design constants pinned here. The task timeout bound is pinned at 3600s,
matching `V3.1-BATTERY-DESIGN.md` §3's own bound (§8).

**The no-redraw rule.** A task dying to a harness fault (connection refused, server restart, kill) is
retried exactly once, and the retry is logged in state. A timeout at the stated 3600s bound is a
measurement and is never retried. Tasks are never re-drawn and seeds are never swapped, at any stage.

## 5. The difficulty knob and its pretest screen

**The knob, defined operationally.** Query structural complexity = (the number of tables the
reference query must JOIN) + (the number of aggregation operations — `GROUP BY` clauses or window
functions — it must compose), an integer count starting at 1 (a single-table `SELECT`) and
incrementing by exactly one structural operation per grid step.

**The concrete grid**, four levels, each incrementing by exactly one structural operation over the
last:

| Level | Knob value | Structural operation the increment adds |
|---|---|---|
| L1 | 1 | Single-table `SELECT` against `fact_orders` with a `WHERE` filter only. 0 JOINs, 0 aggregations. |
| L2 | 2 | +1 JOIN: `fact_orders` JOIN one dimension table (`dim_customers`). Still 0 aggregations. |
| L3 | 3 | +1 aggregation: the L2 query gains one `GROUP BY` aggregation (e.g. `SUM`/`COUNT` grouped by a joined dimension column). |
| L4 | 4 | +1 JOIN: a second dimension table (`dim_products`) is joined in, the L3 aggregation retained. |

**The granularity ceiling.** ≤0.10 mean-score movement per single knob increment against the
0.30-wide corridor — ≈0.33 of the corridor per step (§8). A step that violates this ceiling is
subdivided (an intermediate level via a partial join predicate or a single added filter clause) —
never carried forward coarse or silently included in the pre-registered grid.

**The pretest screen**, carrying REQ-54's rule verbatim: 3–4 knob levels (this design uses all four
L1–L4), a small-n baseline-arm sample at each (n=10 per level, pinned in §8 as `derived:`), run on a
single pinned pretest seed (999, §8, `derived:` — distinct from every stage-1 and stage-2 seed so the
screen draws on data the corridor probe itself never reuses), confirming no adjacent pair moves the
mean score by more than the 0.10 ceiling before the full pre-registered grid is committed. A
violating level is subdivided rather than accepted as coarse and carried forward unexamined.

This pretest is a coarse SCREEN, not a confirmatory measurement (F-09): a small-n sample at four
levels catches only large granularity violations, not ones near the ≤0.10 boundary itself. Final
confirmation of granularity happens only once the full six-seed pre-registered grid (§6) runs and its
own seed-clustered estimate exists — mirroring how the terminated arm's own design separated a
coarse stage-1 screen from a stage-2 confirmatory measurement rather than trusting a small pretest to
settle a boundary case.

## 6. The pre-registered corridor probe

**ARMS.** Two arms, prompt-role distinct, scoring-contract identical (the scoring contract is
arm-symmetric by construction — it is scoring, not prompting):

- **baseline** — the hand-written arm: schema, business question, the §2 output-contract
  instruction, PLUS hand-engineered guidance representing the best current prompt (column-name
  hints, a join-strategy suggestion, an explicit reminder to check aggregation grouping).
- **s0-minimal** — the floor arm: schema, business question, and the SAME §2 output-contract
  instruction as baseline (the floor arm is still told to emit exactly one fenced SQL block — a
  minimal prompt is minimal on ENGINEERING GUIDANCE, not on the output contract; omitting the
  contract instruction from this arm would manufacture a no-artifact explosion that fails §6 clause
  (v) by prompt design rather than by measured capability), with no additional guidance beyond that.

**SEEDS AND SAMPLE.** Six probe seeds, pinned: 101, 202, 303, 404, 505, 606 (§8, `derived:` —
arbitrary distinct integers, chosen only for reproducibility and non-overlap with the stage-2 fresh
seed set). Ten tasks per seed per grid point. n = 60 per arm per point (6 seeds × 10 tasks, §8).

**THE ESTIMATOR, PINNED.** The unit of replication is the SEED. For each arm × point, compute the
six per-seed mean graded scores and take the t-distribution 90% CI on those six means
(t₅,₀.₉₅ = 2.015): mean ± 2.015 · sd/√6. Per-task pooling is excluded by name — it understates
seed-level draw dependence. No coverage target beyond this estimator is pre-registered; the
estimator IS the rule.

**THE FORMAT-STABILITY / CEILING GATE, running FIRST.** Operationally: at each grid point, the
ceiling-probe prompt contains the reference SQL query VERBATIM plus the same §2 output-contract
instruction the corridor probe uses — a candidate that simply transcribes the given query into the
required fence should score at or near 1.0 if extraction and execution both work, isolating
extraction/execution reliability from query-writing capability. Seed subset: the first two of the
six stage-1 seeds (101, 202), n = 20 per point (2 seeds × 10 tasks, §8). Pass condition: no-artifact
count = 0 AND mean graded score ≥ 0.95 at that point (denominator: all 20 tasks). A point failing the
gate is EXCLUDED from the difficulty probe. If ALL points fail, the content-driven premise is
falsified and the instrument line terminates under §10.

**STAGE-1 ACCEPTANCE (ALL clauses, primary endpoint).** Six numbered clauses, operationalizing
`PREREG-DRAFT.md` §3's five clauses against SQL artifacts plus the drop budget as its own clause —
these are DISTINCT failures and all six are required:

1. Baseline seed-clustered 90% CI ⊆ [0.30, 0.60].
2. s0-minimal pooled mean ≥ 0.05.
3. Baseline pooled graded mean − pooled exact-match rate ≥ 0.10.
4. Executes-but-wrong rate ≤ 0.20 on EACH arm separately, evaluated per grid point over that point's
   full seed × task sample, never pooled across points.
5. A per-point no-artifact / non-executable-artifact drop-budget ceiling of ≤ 0.10 on EACH arm
   separately (§8, `derived:` — no upstream document fixes this figure for the BI family; it is set
   to match `V3.1-BATTERY-DESIGN.md` §4's own no-artifact ceiling clause, with the terminated arm's
   measured post-relaxation no-artifact rate, ≈3.3%, offered as context for that choice, not as its
   source). A no-artifact/non-executable response is a different failure from a query that runs and
   returns the wrong rows, and this clause is never satisfied by folding one into the other.
6. Arm order: baseline pooled mean > s0-minimal pooled mean, AND sign(baseline seed-mean − s0-minimal
   seed-mean) > 0 on ≥ 5 of 6 seeds. A zero difference counts as a violation.

**THE GRADIENT CLAUSE.** An adjacent grid-point mean-score difference of at least 0.15, under the
same seed-clustered estimator, is required for a step to be credited as a real behavioural gradient
rather than noise (§7's derivation).

**SELECTION AMONG QUALIFIERS.** The predeclared priority order is fewest structural operations
first (lowest knob value wins), independent of measured noise, mirroring the terminated arm's own
fewest-levers-first rule.

**STAGE 2 — CONFIRMATION ON FRESH SEEDS.** Fresh seed set, disjoint from stage 1, pinned: 707, 808,
909 (§8, `derived:`). Both arms, n = 30 per arm (§8, `derived:`, matching
`V3.1-BATTERY-DESIGN.md` §4's own stage-2 n). Confirmation rule, its own explicit rule rather than a
re-run of stage 1: (i) baseline pooled mean ∈ [0.30, 0.60] as a point estimate; (ii)
sign(baseline − s0-minimal) positive on ALL fresh seeds; (iii) executes-but-wrong ≤ 0.20 and the
drop budget respected on each arm. Failure routes to the next stage-1 qualifier in priority order,
once each.

**THE FAILURE BRANCH, PRE-COMMITTED.** If no point passes the gate, stage 1, the gradient and
headroom clauses (§7), and stage 2, the probe's verdict is the FAILURE BRANCH — a terminal report is
committed, neither auto-gate fires, and REQ-56, REQ-57, REQ-58 and all of Phase 10 are VOID BY RULE.
This is a legitimate pre-registered outcome recorded as such, never an incomplete milestone, and the
verdict is read from a completed state-file or log artifact, never inferred from wall-clock elapsed
or partial progress.

## 7. Noise budget, replicate pairs, and the resolvable-gradient floor

Two distinct mechanisms, named separately, because collapsing them is the arithmetic error a panel
lane will hunt for:

- **The RESOLVABLE-GRADIENT FLOOR, and its derivation trace.** Seed count 6, assumed per-seed sd ≈
  0.13 (the terminated arm's own measured 0.12–0.14 range at comparable points), giving expected
  single-arm CI width ≈ 0.13 × 2.015 × 2/√6 ≈ 0.21. A gradient claim compares TWO independent
  six-seed clusters, not one point — the standard error of the DIFFERENCE propagates a √2 factor
  over a single cluster's, so the honest resolvable floor is 0.21 × √2 / 2 ≈ 0.15, not the ≈0.10–0.11
  a naive half-CI-width reading would suggest. The named tension, stated plainly rather than smoothed
  over: §5's ≤0.10 per-step design ceiling sits BELOW this 0.15 analysis floor, so a step satisfying
  the granularity constraint may still not be statistically distinguishable from noise in any single
  measurement. This document discloses that rather than asserting the two numbers already agree.
- **The REPLICATE-PAIR NOISE PROCEDURE and the headroom clause** — a different mechanism entirely.
  At the selected point, run three baseline replicate pairs (six runs) on the first three of the six
  stage-1 seeds (101, 202, 303; §8, `derived:`). Noise = the MAXIMUM |pair difference| across the
  three pairs (conservative). Headroom requires (1 − baseline pooled mean) ≥ 3 × that maximum. The
  pre-registered headroom ceiling is stated separately: pooled baseline mean ≤ 0.85 at the qualifying
  corridor point. Stated honestly, per `RECOMMENDATION.md` §7 Disclosure 4: the ≤0.85 ceiling and the
  3×-replicate-noise rule are two independent checks NOT known to agree in advance (3 × 0.13 would
  demand 0.39 of headroom, not 0.15) — the 3× rule is checked against the ACTUAL measured
  replicate-pair noise at that point, not against the §5 sd assumption. Headroom failure routes to
  the next point in priority order, once; exhaustion routes to §10.

The four carried disclosures, thresholds carried verbatim, not softened in transit:

- **Disclosure 1** — parsing/scoring reuse: no parsing/scoring machinery is reused from the v3 line
  — the oracle executes SQL against the warehouse and diffs result sets, with no fenced-text parser
  inherited from the terminated arm. Numeric target: an executes-but-wrong rate (a query that runs
  successfully but returns an incorrect result set — the direct analogue of parseable-but-wrong) of
  ≤20% at the recommended corridor point.
- **Disclosure 2** — difficulty knob: the join/aggregation-depth knob is a genuinely new mechanism,
  not a relabelling of the v3.1 knob family. Step granularity relative to the corridor width it
  targets: ≤0.10 mean-score movement per step against a 0.30-wide corridor, ≈0.33 of the corridor per
  step. A step found at the format-stability/stage-1 checkpoint to exceed the ≤0.10 ceiling
  invalidates that grid point for corridor placement and triggers the §5 subdivision procedure — not
  silent inclusion in the pre-registered grid.
- **Disclosure 3** — real behaviour versus old-instrument residual: named observable is the pooled
  mean graded score across the join/aggregation-depth grid, expected direction is monotonically
  decreasing as join/aggregation count increases, and the numeric gradient floor under seed-clustered
  estimation is 0.15 (the two-point-propagation-corrected floor derived above).
- **Disclosure 4** — headroom target: pooled baseline mean ≤ 0.85 at the qualifying corridor point,
  leaving ≥0.15 headroom below the 1.0 ceiling, well clear of v2's 0.92+ saturation failure.

**Downstream checkpoint (F-22):** the format-stability gate plus the stage-1 readout above — the
first battery data produced under this instrument — is where all four disclosures meet data. This is
REQ-56's readout in Phase 9.

## 8. Constants and their provenance

Every numeric constant used anywhere in this document, with its source or derivation.

| Constant | Value | Source or derivation |
|---|---|---|
| Corridor floor | 0.30 | PREREG-DRAFT.md §3 |
| Corridor ceiling | 0.60 | PREREG-DRAFT.md §3 |
| Corridor width | 0.30 | derived: 0.60 minus 0.30 |
| Knob step ceiling (per-step granularity) | 0.10 | RECOMMENDATION.md §4 |
| Granularity ratio (step ceiling / corridor width) | 0.33 | derived: 0.10 divided by 0.30, approximately 0.33 |
| Seed count (stage 1) | 6 | RECOMMENDATION.md §5 |
| t multiplier (t₅,₀.₉₅) | 2.015 | RECOMMENDATION.md §5 |
| Assumed per-seed sd (baseline pretest estimate) | 0.13 | RECOMMENDATION.md §5 |
| Expected CI width (single arm/point) | 0.21 | RECOMMENDATION.md §5 |
| Resolvable-gradient floor (two-point difference) | 0.15 | RECOMMENDATION.md §5 |
| Executes-but-wrong ceiling | 0.20 | PREREG-DRAFT.md §3 |
| s0-minimal floor | 0.05 | PREREG-DRAFT.md §3 |
| Graded-minus-exact margin | 0.10 | PREREG-DRAFT.md §3 |
| Headroom ceiling (pooled baseline mean) | 0.85 | RECOMMENDATION.md §7 |
| Replicate-noise multiplier | 3 | V3.1-BATTERY-DESIGN.md §4 |
| Arm-order sign threshold | 5 of 6 | PREREG-DRAFT.md §3 |
| Ceiling-gate threshold | 0.95 | V3.1-BATTERY-DESIGN.md §4 |
| Pretest granularity-violation ceiling | 0.10 | RECOMMENDATION.md §4 |
| Drop budget (no-artifact / non-executable ceiling, per arm per point) | 0.10 | derived: matches V3.1-BATTERY-DESIGN.md §4 clause 4's own no-artifact ceiling; the terminated arm's measured post-relaxation no-artifact rate (approximately 3.3%) is context for this choice, not its source, since no RECOMMENDATION.md or PREREG-DRAFT.md figure fixes it for the BI family |
| Stage-1 probe seeds (six, pinned) | 101, 202, 303, 404, 505, 606 | derived: arbitrary distinct pinned integers, chosen only for reproducibility and non-overlap with the stage-2 fresh seed set |
| Tasks per seed per grid point | 10 | derived: matches V3.1-BATTERY-DESIGN.md §4's own per-seed task count |
| n per arm per point | 60 | derived: 6 seeds times 10 tasks |
| Stage-2 fresh seeds (three, disjoint from stage 1) | 707, 808, 909 | derived: arbitrary distinct pinned integers, disjoint from the stage-1 seed set |
| Stage-2 n per arm | 30 | derived: matches V3.1-BATTERY-DESIGN.md §4's own stage-2 n |
| Pretest small-n (per knob level) | 10 | derived: small enough to remain a coarse screen per §5's own caveat, large enough to catch a large granularity violation; no upstream figure fixes it |
| Pretest level count | 4 | derived: within REQ-54's pinned 3-4 range; four levels chosen so the pretest levels double as the full corridor probe's own grid points |
| Pretest seed (single, distinct from stage 1/2) | 999 | derived: chosen to keep the pretest screen's draw fully separate from every stage-1 and stage-2 seed |
| Concrete grid levels (knob value to structural operation) | L1=1, L2=2, L3=3, L4=4 | derived: see §5 for the operation each increment adds |
| Warehouse row scale (fact table rows per seed) | approximately 800 | derived: no upstream figure fixes warehouse scale; chosen large enough that the L4 grid point's two-JOIN-plus-aggregation query returns a non-degenerate result set at every seed |
| Ceiling-gate seed subset and n | 2 of 6 seeds times 10 tasks = 20 per point | derived: matches V3.1-BATTERY-DESIGN.md §4's own gate probe shape (2 seeds, n=20 per point) |
| Replicate-pair seed half (three of six stage-1 seeds) | 101, 202, 303 | derived: the first three of the pinned stage-1 seed set, chosen for reproducibility, no other significance |
| Task timeout bound | 3600s | V3.1-BATTERY-DESIGN.md §3 |

A constant used in the prose but missing from this table is the defect this table exists to catch;
none is left out above.

## 9. Conditional pre-authorization — the auto-gates

**Conditional pre-authorization (Dr. Robert Li, 2026-08-10):**

> **Autonomy directive (Dr. Robert Li, 2026-08-10):** human gates run as conditional pre-authorization — acceptance/adoption fire automatically iff the frozen pre-registered gates pass; gates failing yields auto-refusal and a terminal report, never auto-acceptance. No mid-run human stops.

This is transcribed verbatim from the standing bar in this milestone's requirements record. It is
attributed here — not by a `.planning/` path — because `.planning/` is gitignored in this project;
this committed document is therefore the durable record of the directive, exactly as
`V3.1-BATTERY-DESIGN.md`'s own Authority line attributes its own decision to Dr. Robert Li.

**Supersession of PREREG-DRAFT.md §6:** `PREREG-DRAFT.md` §6's requirement of human acceptance in session for the generator id is SUPERSEDED by the directive above; the supersession is recorded here rather than silently dropped. What the supersession PRESERVES: the generator id stays ABSENT from
`ACCEPTED_GENERATORS` and is never self-issued by the generator's own code; acceptance is refused
automatically if any gate condition fails; and the gate conditions below are frozen with this
document, before any data exists. What it CHANGES, and only this: who pulls the trigger when all
frozen gates pass — an automated commit citing the pre-authorization, rather than a human keystroke
in session. This is a real loosening of a human control, stated plainly rather than dressed up as a
formality, and the compensating control is the strictness and pre-registration of the gate set below,
not the operator's presence.

- **Gate condition 1 — ceiling.** The ceiling probe reads ≥ 0.95 and is recorded in a committed
  artifact.
- **Gate condition 2 — corridor verdict.** The corridor probe's recorded verdict is QUALIFIED per
  §6's written rule, read from a completed state-file or log artifact.
- **Gate condition 3 — disclosure readout.** The REQ-56 disclosure readout is committed with each of
  the four §7 disclosures marked met or unmet.

Firing order and AND semantics, written so a Phase-9 executor cannot misread them: acceptance
(REQ-57) fires iff ALL THREE conditions hold, in an acceptance commit citing both the
pre-authorization above and the specific gate evidence. Adoption (REQ-58) fires iff acceptance
actually fired, adopting `PREREG-DRAFT.md` by its own commit (commit-is-timestamp) before any round-1
data exists. A partial pass never accepts — concretely, ceiling met but probe unqualified is a
REFUSAL, not a partial acceptance. A disclosure recorded as UNMET does not by itself block
acceptance but must be recorded and carried into every downstream report, exactly as
`V3.1-BATTERY-DESIGN.md` §5's disclosure was informational-by-pre-registration and un-omittable.

## 10. One-shot termination

Mirroring `V3.1-BATTERY-DESIGN.md` §6's own construction and `PREREG-DRAFT.md` §4: if no point
passes the gate, stage 1, the gradient and headroom clauses, and stage 2, the BI
analytical-query-answering instrument line TERMINATES, and the prohibition is on SUBSTANCE, not
name — no successor instrument testing this hypothesis (prompt-search vs hand-written baseline on
BI analytical-query answering, as the phase-5 promotion gate for the bi-analytics vertical) may be
built under ANY label by changing parser, prompts, grid, scoring, or qualification rules. Widening
the §2 accepted-dialect set after data exists is itself a prohibited new generation of this line.

What remains legitimate after termination: a terminal report for this line; using its diagnostics to
design instruments for DIFFERENT hypotheses or task families, including the other verticals
`RECOMMENDATION.md` §1 assessed but did not recommend (performance-marketing, customer-support); and
phase 5 staying gated on whatever evidence exists at that point.

## 11. Pre-committed falsifiers

- **Falsifier 1 — the ceiling gate fails at every point:** the content-driven premise is false; a
  terminal finding, and the probe stops there.
- **Falsifier 2 — no grid point places its baseline CI inside the corridor:** the corridor-placement
  failure that ended the terminated line, recurring; the one-shot rule ends this arm too.
- **Falsifier 3 — every adjacent step falls below the 0.15 gradient floor while each individually
  satisfies the ≤0.10 design ceiling:** the §7 tension realised; the knob cannot resolve a gradient
  at this seed count and the instrument is not usable, stated as a finding rather than patched by
  adding seeds.
- **Falsifier 4 — arm inversion persists at a point:** clause (vi) fails, the point is unsound, and
  the phenomenon is reported rather than excused.
- **Falsifier 5 — the executes-but-wrong rate exceeds 0.20 at every point:** Disclosure 1's ceiling
  breached at every point — the new family reproduced the terminated line's well-formed-but-wrong
  pathology rather than escaping it.
