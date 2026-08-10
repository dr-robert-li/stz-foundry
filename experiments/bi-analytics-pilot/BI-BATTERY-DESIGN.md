# BI analytical-query-answering battery design — rev 2

**Status:** rev 2, post-adjudication (2026-08-10). 5-lane panel: gpt-sol-pro (UNSOUND), kimi-k3 (SOUND-WITH-CHANGES), qwen-max (SOUND-WITH-CHANGES), gemma4 (SOUND-WITH-CHANGES), gpt-oss (UNSOUND) — 65 global findings, 37 adopted, 28 rejected with reason (`DESIGN-REVIEWS.md`).

**FROZEN — THIS COMMIT IS THE PRE-REGISTRATION.** No probe inference precedes it; no generator code precedes it; the document is not edited after it.

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

Row-count scale per seed: **[F-40, gpt-sol-pro]** `fact_orders` ≈ 800 rows; `dim_customers` ≈ 40
rows; `dim_products` ≈ 25 rows; `dim_regions` ≈ 8 rows — these are the EXPECTED ORDER OF MAGNITUDE
for a human reader, not a free Phase-8 knob: the generator determines the EXACT count per seed
DETERMINISTICALLY as part of its own seeded stream (following the `fixture-warehouse-v3.ts` house
pattern, where row counts themselves come out of the seeded PRNG rather than being a fixed
constant), so "≈N" describes what a given seed is expected to produce, not a range Phase 8 is free
to vary per run (each pinned in §8, marked `derived:` — no upstream document fixes warehouse scale;
the figure is chosen large enough that the §5 L4 grid point's two-JOIN-plus-aggregation query
returns a non-degenerate, non-empty result set at every seed). Storage/loading form: **[F-41,
gpt-sol-pro]** the generated warehouse is materialized into an in-process SQLite engine instance
(embedded/in-process binding, ANSI-compatible subset only — no engine-specific extensions in either
the reference query templates or the accepted candidate syntax, §8) that §3's execution oracle reads
directly — no intermediate CSV export step, unlike the terminated line's CSV-emitted warehouse.

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
   or any engine-rejected statement — **[F-38, gpt-sol-pro]** counts against the DROP BUDGET exactly
   as a no-artifact response does (§6 clause v), never as a wrong answer, while remaining logged as
   the distinct NON-EXECUTABLE-ARTIFACT category for the §4 zero-decomposition rule — the drop-budget
   accounting and the zero-decomposition category are two different bookkeeping purposes for the same
   event, not a conflict between them. A non-executable artifact and an executes-but-wrong artifact
   are different failures and are never conflated (§4, §6).
4. **[F-26, gpt-sol-pro]** The extracted artifact must be a single READ-ONLY `SELECT` statement. Any
   DDL, DML, or multi-statement artifact is treated as non-executable for the drop budget (rule 3
   above) and is never executed against the frozen warehouse — the oracle's stability and the
   byte-identical-replay guarantee (§1) both depend on the warehouse never being mutated by a
   candidate's own artifact.

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
  result set and `actual` be the executed candidate result set, **[F-24, gpt-sol-pro]** both
  compared as MULTISETS of row-tuples over the reference query's declared column projection (SQL is
  bag-valued: duplicate rows are counted with multiplicity, never deduplicated before comparison,
  consistent with real SQL semantics). If `actual`'s column set (order-insensitive) does
  not match `expected`'s declared column projection, graded score = 0 — a differently-shaped
  projection is not a partial answer. **[F-25, gpt-sol-pro]** If `expected` is empty, `actual` scores
  1.0 iff `actual` is also empty (a query correctly returning no rows when none are expected is
  correct) — Phase 8 must verify, per seed, as part of the equality sweep below, that no L1–L4 task
  is expected to have a genuinely empty answer, so this rule is a defined edge case rather than a
  live outcome. Otherwise, comparing rows as unordered, type-normalized tuples with multiplicity:
  `graded score = |expected ∩ actual| / max(|expected|, |actual|)`.
  This is symmetric under both failure directions: dropping rows shrinks the intersection: numerator;
  a dump-everything or over-broad query inflates `|actual|`, the denominator, driving the score
  toward zero as spurious rows accumulate, so a `SELECT *`-style over-selection cannot manufacture a
  passing score. `exact` = graded score is 1.0 AND `|expected| = |actual|` (every row and column
  matches with nothing extra and nothing missing, multiplicity included) — this is §6 clause (iii)'s
  `exact-match rate`.
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
  **[F-21, gpt-sol-pro/gpt-oss]** This independence claim is scoped precisely to the COMPUTATION
  IMPLEMENTATION only — it does NOT cover a shared structural TEMPLATE: the same grid-point
  definition drives both the reference query's construction and the interpreter's replication of its
  intended logic, so a bug in that shared template-level specification (both implementations
  faithfully implementing the wrong intent) would canonicalize on both paths without any shared
  function import. This is a distinct, separately disclosed exposure from the candidate-execution/
  precomputation shared-SQL-engine exposure named below — neither is claimed to be closed by "share
  zero helper functions." **[F-22, kimi-k3]** Phase 8 must enforce the zero-shared-helpers claim
  MECHANICALLY (an import-graph or module-boundary check), mirroring the warehouse determinism
  obligation's own "test-enforced" discipline — an unenforced independence claim is not independence.
- **The equality obligation.** Across a full seed sweep (all six stage-1 seeds plus all three
  stage-2 fresh seeds), `precomputed === recomputed` for every task. **[F-23, gpt-sol-pro]** This
  equality is a defined STRUCTURAL/VALUE equality — the same row-multiset comparison, with the same
  type-normalization and a stated numeric tolerance for floating-point columns, that the graded-score
  definition above already uses — never a literal JavaScript reference/identity comparison, which
  would be permanently false for separately allocated result objects. Phase 8 must make this pass
  before any task generated under this design is trusted; a mismatch anywhere in the sweep is a
  generator or interpreter bug, not a probe result.

Stated plainly, per `RECOMMENDATION.md` §2's F-04 note: this oracle is NOT immune to the terminated
line's dominant failure shape. A syntactically valid, successfully executing query that returns the
wrong result set is the direct analogue of the terminated arm's 395/479 parseable-but-wrong residual
— "well-formed artifact, wrong answer." The executes-but-wrong ceiling in §6, not the oracle's
mechanism, is the defense against it.

**[F-20, gpt-sol-pro/kimi-k3]** A further named residual, the strongest the panel raised: the
equality obligation above validates that the reference SQL's OWN computation is correct
(`precomputed === recomputed`), but nothing in this oracle validates that the NATURAL-LANGUAGE
QUESTION shown to the candidate (§1) actually denotes that reference SQL. A misrendered question —
the wrong filter column named, the wrong grouping described — would leave the equality obligation
intact while the candidate is scored against a question that does not match the query defining
"correct." The answer-first construction keeps ground truth free of the candidate's own process, but
correctness is still defined by the generator's own, unverified question-rendering step. This gap is
NOT closed by this design: Phase 8 must add its own fidelity check (an independent second
question-rendering pass compared against the first, or a human spot-audit sample) before this
oracle's guarantee extends from "the reference query is correct" to "the question shown to the
candidate is correct," and until that check exists this is recorded here as a known, un-instrumented
residual rather than left silently unaddressed.

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

**The knob, defined operationally.** **[F-17, gpt-sol-pro]** Query structural complexity = 1 (the
base single-table `SELECT` operation) + (the number of tables the reference query must JOIN) +
(the number of aggregation operations — one per `GROUP BY` clause or window function it must
compose), an integer count starting at 1 (a single-table `SELECT`, 0 JOINs and 0 aggregations) and
incrementing by exactly one structural operation per grid step — the `1 +` base term is what makes
L1's own assigned value (1) consistent with its 0-JOIN, 0-aggregation construction; the count is
NOT bare `JOINs + aggregations` (that formula would assign L1 the value 0). **[F-18, gpt-sol-pro]**
One aggregation operation = one `GROUP BY` clause; any number of aggregate functions (`SUM`, `COUNT`,
etc.) inside that clause's `SELECT` list count as part of that SAME single operation, not counted
separately — the same one-clause-equals-one-operation convention a window function already gets.

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
subdivided — never carried forward coarse or silently included in the pre-registered grid.
**[F-16, gpt-sol-pro]** Subdivision registers the intermediate level (via a partial join predicate
or a single added filter clause) as its OWN NEW NAMED LEVEL with its OWN integer knob value on the
same scale (renumbering the grid before the pretest screen concludes), never as a fractional
insertion into the existing count — the knob stays integer-valued throughout and no unregistered
second difficulty dimension is introduced.

**The pretest screen**, carrying REQ-54's rule verbatim: 3–4 knob levels (this design uses all four
L1–L4), a small-n baseline-arm sample at each (n=10 per level, pinned in §8 as `derived:`), run on a
single pinned pretest seed (999, §8, `derived:` — distinct from every stage-1 and stage-2 seed so the
screen draws on data the corridor probe itself never reuses), confirming no adjacent pair moves the
mean score by more than the 0.10 ceiling before the full pre-registered grid is committed. A
violating level is subdivided rather than accepted as coarse and carried forward unexamined.
**[F-34, gpt-sol-pro]** Subdivision is capped at ONE pass per violating adjacent pair; a level still
violating the ceiling after that one subdivision routes to §10 rather than being iterated further —
an unbounded subdivision search is exactly the post-data grid-shopping this screen exists to
prevent. **[F-35, gpt-sol-pro]** Subdivision is a PRETEST-STAGE-ONLY mechanism, applied before the
grid is committed and before any stage-1 data exists. A granularity violation discovered only once
the full six-seed grid runs (downstream of commitment) is NOT subdivided post-hoc — that outcome is
instead Falsifier 3's (§11) pre-registered terminal finding, never a new grid point inserted after
data exists.

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
six stage-1 seeds (101, 202), n = 20 per point (2 seeds × 10 tasks, §8). Pass condition: **[F-62,
kimi-k3]** no-artifact-OR-non-executable count = 0 AND mean graded score ≥ 0.95 at that point
(denominator: all 20 tasks) — both zero-decomposition categories (§4) that represent extraction or
execution failure, not only "no artifact," must be absent, so a single execution failure cannot
hide inside the 0.05 of tolerance the mean-score threshold otherwise permits. A point failing the
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
   separately, **[F-46, gpt-oss]** evaluated over that point's full seed × task sample — the same
   scope clause (iv) above already states — never per-seed or on any subset (§8, `derived:` —
   **[F-06, gpt-sol-pro]** the THRESHOLD VALUE is carried from `V3.1-BATTERY-DESIGN.md` §4's own
   no-artifact ceiling clause, but the DENOMINATOR EVENT is broader for this family — this design's
   clause counts no-artifact AND non-executable-artifact together, where V3.1's clause 4 counted
   no-artifact alone — so "matches" describes the numeral carried forward, not an identical
   category; the terminated arm's measured post-relaxation no-artifact rate, ≈3.3%, is offered as
   context for this choice, not as its source). A no-artifact/non-executable response is a different
   failure from a query that runs and returns the wrong rows, and this clause is never satisfied by
   folding one into the other.
6. Arm order: baseline pooled mean > s0-minimal pooled mean, AND sign(baseline seed-mean − s0-minimal
   seed-mean) > 0 on ≥ 5 of 6 seeds. A zero difference counts as a violation.

**THE GRADIENT CLAUSE.** An adjacent grid-point mean-score difference of at least 0.15, under the
same seed-clustered estimator, is required for a step to be credited as a real behavioural gradient
rather than noise (§7's derivation). **[F-36, gpt-sol-pro]** The credited difference must be in the
EXPECTED DIRECTION — mean score decreasing as knob value increases, per Disclosure 3 (§7) — a ≥0.15
movement in the wrong direction is not credited as a real behavioural gradient and is instead
reported as a Disclosure-3 falsification. **[F-59, kimi-k3]** "Adjacent" means the nearest
SURVIVING neighbor — the nearest grid point (in either direction) that passed the format-stability
gate — since an excluded point supplies no comparison. A point with no surviving neighbor in either
direction cannot be evaluated on the gradient clause and does not qualify.

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

**THE `QUALIFIED` VERDICT LABEL, DEFINED.** **[F-08, gpt-sol-pro/kimi-k3/qwen-max/gpt-oss]** A grid
point is recorded `QUALIFIED` in the corridor probe's state-file/log artifact iff it passes, IN
ORDER: the format-stability gate, all six stage-1 clauses, the gradient clause (including its
direction and surviving-neighbor rules above), the §7 headroom clause, and the stage-2 confirmation
rule — every predicate in this section, not a subset. **[F-60, kimi-k3]** `QUALIFIED` additionally
requires the §3 equality obligation (`precomputed === recomputed`) to have passed across the full
stage-1 and stage-2 seed sweep for every task at that point; a point cannot be recorded `QUALIFIED`
if the oracle's own ground-truth validity was never confirmed for it, even if every other predicate
above passed — this closes the oracle-integrity gap without adding a fourth top-level §9 gate
condition, since `QUALIFIED` itself is what §9 gate condition 2 already cites as its evidence.

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
  **[F-14, gpt-sol-pro]** The √2 propagation itself assumes the two grid points' six-seed estimates
  are INDEPENDENT — but the SAME six seeds (§6) are reused at every grid point, so adjacent-point
  estimates may be positively correlated rather than independent. This is disclosed as a named
  assumption, not resolved: a positive same-seed correlation would make the TRUE resolvable floor
  SMALLER than 0.15 (easier to resolve), not larger, since the variance of a paired difference falls
  as the correlation between the pair rises — so the disclosed 0.15 is, if anything, a conservative
  (not an optimistic) floor under same-seed reuse. The actual correlation is measurable only once
  real data exists; this document does not claim to know its value in advance.
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

- **Disclosure 1** — parsing/scoring reuse: **[F-65, kimi-k3]** no VALUE-RECONCILIATION
  parsing/scoring machinery is reused from the v3 line — the strict/relaxed parser that extracted and
  graded a reconciled numeric fact from prose has no analogue here; the oracle instead executes SQL
  against the warehouse and diffs result sets. What IS retained, named honestly rather than
  overclaimed: the fenced-block ENVELOPE discipline (§2's ordered extraction rules, first-match-wins,
  fail-closed on ambiguity) mirrors `V3.1-BATTERY-DESIGN.md` §1's own numbered discipline in
  STRUCTURE — but the accepted DIALECT SET (`sql` / bare-fence) is materially different content from
  v3.1's (`path=answer.json` / `json`), frozen up front per §2 rather than relaxed reactively, which
  is the actual lesson carried forward. Numeric target, untouched: an executes-but-wrong rate (a
  query that runs successfully but returns an incorrect result set — the direct analogue of
  parseable-but-wrong) of ≤20% at the recommended corridor point.
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
| Dimension-table row scale, dim_customers (F-01) | approximately 40 | derived: no upstream figure fixes dimension-table scale; determined per seed by the generator's own deterministic stream, same discipline as the fact-table scale row above |
| Dimension-table row scale, dim_products (F-01) | approximately 25 | derived: same basis as dim_customers above |
| Dimension-table row scale, dim_regions (F-01) | approximately 8 | derived: same basis as dim_customers above |
| Replicate-pair count (F-02) | 3 | V3.1-BATTERY-DESIGN.md §4 |
| Harness-fault retry count (F-03) | 1 | derived: matches V3.1-BATTERY-DESIGN.md §3's own no-redraw rule (one retry, logged) |

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
document, before any data exists. **[F-29, gpt-sol-pro]** It also preserves the IDENTITY-BINDING
requirement `PREREG-DRAFT.md` §6 names: the generator id created in Phase 8 must be recorded in the
acceptance commit and must match the id whose runs produced the gate evidence being cited — the
rev-1 supersession stated this requirement's ABSENCE-from-`ACCEPTED_GENERATORS` half but omitted the
matching-identity half; rev 2 restores both. What it CHANGES: who pulls the trigger when all
frozen gates pass — an automated commit citing the pre-authorization, rather than a human keystroke
in session. **[F-28, qwen-max]** It also changes a second thing the rev-1 text did not name: per
`V3.1-BATTERY-DESIGN.md` §7's own precedent, prior practice showed the human the probe numbers, the
triggered disclosure, and the strict-endpoint gap BEFORE accepting — a pre-acceptance EVIDENCE-REVIEW
step, not only a trigger-pull. Automation removes that review step too, not only who commits. This is
a real loosening of a human control, stated plainly rather than dressed up as a formality, and the
compensating control is the strictness and pre-registration of the gate set below, not the operator's
presence.

- **Gate condition 1 — ceiling.** **[F-07/F-10, gpt-sol-pro/kimi-k3/qwen-max/gemma4]** The §6
  format-stability/ceiling gate's FULL two-conjunct rule (no-artifact-or-non-executable count = 0 AND
  mean graded score ≥ 0.95) passed AT THE SPECIFIC POINT that ultimately qualifies (§6's `QUALIFIED`
  definition) — not merely a ≥0.95 mean-score reading in isolation, and not a reading from any other
  probed point — and is recorded in a committed artifact.
- **Gate condition 2 — corridor verdict.** **[F-08, gpt-sol-pro/kimi-k3/qwen-max/gpt-oss]** The
  corridor probe's recorded verdict is `QUALIFIED`, per §6's own explicit definition of that label
  (including the §6 equality-sweep precondition, F-60), read from a completed state-file or log
  artifact.
- **Gate condition 3 — disclosure readout.** **[F-09, gpt-sol-pro/gemma4/qwen-max]** The REQ-56
  disclosure readout is committed with each of the four §7 disclosures marked met or unmet. This
  condition is a PRESENCE/RECORDING requirement, not a pass/fail quality gate — per the UNMET rule
  below, a disclosure recorded UNMET does not by itself fail this condition; the substantive quality
  bar for acceptance sits in gate conditions 1 and 2, and this condition's role is only to guarantee
  the disclosure record exists and is complete, never omitted.

Firing order and AND semantics, written so a Phase-9 executor cannot misread them: acceptance
(REQ-57) fires iff ALL THREE conditions hold, in an acceptance commit citing both the
pre-authorization above and the specific gate evidence. Adoption (REQ-58) fires iff acceptance
actually fired, adopting `PREREG-DRAFT.md` by its own commit (commit-is-timestamp) **[F-63,
qwen-max]** before any Phase 10 DUALFIX tournament round-1 data exists (distinct from this battery's
own stage 1/stage 2, which necessarily precede acceptance). A partial pass never accepts —
concretely, ceiling met but probe unqualified is a REFUSAL, not a partial acceptance. A disclosure
recorded as UNMET does not by itself block acceptance but must be recorded and carried into every
downstream report, exactly as `V3.1-BATTERY-DESIGN.md` §5's disclosure was
informational-by-pre-registration and un-omittable.

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
