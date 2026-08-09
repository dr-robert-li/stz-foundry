# Task-family recommendation for the future phase-5 instrument — rev 2

**Date: 2026-08-09 · Author: Robert Li · rev 2 (rev 1: 2026-08-09; rev 2 adjudicates the five-reviewer
REQ-46 panel in `ANALYSIS-REVIEWS.md`; adopted findings are tagged inline at their point of change)
· companion to `experiments/method-research/SHORTLIST.md` (the REQ-40/41 shortlist this
recommendation is built on, re-selects nothing from it) and `experiments/method-research/RESEARCH-PLAN.md`
§3 (the recommendation approach this document follows, unedited)**

## 0. What this is, and what it is not

This is the recommendation required by REQ-42 and REQ-43, built on the Phase 5 survey
(`SURVEY-2026-08.md`) and the Phase 5 shortlist (`SHORTLIST.md`). REQ-42 asks for a next task
family recommended for a future phase-5 instrument, carrying an admission-path analysis and an
explicit V3.1-§6 compliance mapping ruling out the v3 family under any label. REQ-43 asks that the
instrument sketch address the v3.1 difficulty-corridor knob-granularity failure under its own
heading and specify a noise-budget plan using seed-clustered estimation. Both requirements are
addressed below, each under its own numbered section rather than blended together.

What this document is **not**: it selects no new method beyond the frozen Phase 5 shortlist (§3 of
`SHORTLIST.md` stands unedited — this document restates from it, it does not re-derive it); it
builds no instrument (§4 and §5 below are sketches, not a battery); and it contains no
pre-registration content — REQ-44's draft prereg is a separate file, written only after this
document's rev 2 clears the REQ-46 panel in Task 2.

This recommendation is written against the standing bar named in `RESEARCH-PLAN.md` §0 and
`V3.1-BATTERY-DESIGN.md` §6: the terminated arm's own one-shot termination clause bars any
successor instrument for the hypothesis *prompt-search vs hand-written baseline on the data-ops
fact-recovery task family, as the phase-5 promotion gate*, under any label — v3.2, v4, "new arm,"
"new pilot" — by changing parser, prompts, grid, scoring, or qualification rules. Termination is on
SUBSTANCE, not name, and §2 below is the concrete test of that substance for the family recommended
here. Where this document characterises the terminated arm's outcome, it uses the terminal report's
own words: this was **instrument-line exhaustion, not a third null** (`PILOT-RESULTS.md`,
"V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED"). Stage 2 never ran because no stage-1
point qualified, so the pre-registered three-nulls contingency is unreachable and closes with the
arm — that distinction is preserved everywhere this document refers to the terminated arm, never
flattened into "three rounds nulled."

## 1. Candidate task families and admission-path analysis

Per `RESEARCH-PLAN.md` §3, the admission-path analysis names an oracle class per the
`admitVertical` discipline in `src/foundry/vertical-admission.ts`: an id absent from
`VERTICAL_ADMISSION` is refused, never defaulted to admitted, and refusal is stated, never
overridden. Every one of the five verticals in `VERTICAL_ADMISSION` is assessed below before a
winner is named — assessing only the favourite is the shape REQ-46's panel will attack, and it is
the same discipline `SHORTLIST.md` §2 applied by assessing all nine survey entries rather than only
the three shortlisted.

### data-ops

- **Oracle class:** execution + construction (mechanism: dbt tests, data-diff, SQL vs fixture
  warehouse).
- **Independent oracle:** yes — dbt tests and data-diff run against a deterministically generated
  fixture warehouse, checking the agent's emitted artifact against separately computed ground
  truth rather than depending on the generative process under test. This is the exact discipline
  the terminated v3 line itself used (`HANDOFF-V3.md` §1 T-A step 2's independent reference
  interpreter: a separate implementation, no shared helpers with the generator, recomputing every
  fact from the emitted artifact).
- **Admission verdict:** admissible with conditions. The table's own verdict is `admitted`, and the
  two agree that data-ops carries a real, working oracle mechanism. They diverge on what that
  buys a *recommendation*: V3.1-§6 bars a specific hypothesis inside data-ops regardless of the
  vertical's admission status, so a fact-recovery-shaped promotion-gate task family recommended
  here would need to clear the full four-axis compliance mapping in §2 directly against the barred
  hypothesis's own oracle mechanism, its own generator lineage, and its own task semantics — the
  highest evidentiary burden of any candidate assessed here, because it shares the same vertical
  and the same construction-class oracle machinery as the barred line. That burden is a reason for
  caution in §3, not a disqualification stated here.

### bi-analytics

- **Oracle class:** construction (mechanism: query results vs known fixture numbers on a frozen
  warehouse).
- **Independent oracle:** yes — a SQL engine executes the candidate's generated query against a
  frozen fixture warehouse and returns a real result set, diffed against pre-computed known fixture
  numbers. The execution engine and the diff check are both separately implemented from whatever
  process generates the natural-language-to-SQL translation under test; the oracle recomputes the
  actual answer (the query's real result) from the emitted artifact (the SQL text) rather than
  depending on the generative process that produced it.
- **Admission verdict:** admissible with conditions. The table's own verdict is `pending`, which is
  not automatically inadmissible — the construction-class oracle above is concretely nameable and
  independent today. The condition is construction work, not an admission-path failure: the frozen
  fixture warehouse and its known-answer query set must exist before an instrument can be built,
  which is exactly what `pending` records.

### performance-marketing

- **Oracle class:** replay (mechanism: replayed campaign logs vs held-out actuals).
- **Independent oracle:** yes — held-out historical campaign actuals (spend, conversions, and
  similar exogenous outcomes) recorded independently of, and before, any agent under test proposes
  an action against them. A replay harness comparing proposed actions to sealed real outcomes is
  independent by construction, since the actuals exist regardless of what the agent under test
  ever produces.
- **Admission verdict:** admissible with conditions. The table's own verdict is `pending`
  ("Later; horizon-capped"), which again is not automatically inadmissible on its own — a replay
  oracle is nameable today. The condition is the table's own horizon cap: actuals lag real time, so
  any instrument built here must confine its evaluation window to data old enough that held-out
  actuals are already resolved, which shrinks the usable task population rather than blocking
  admission outright.

### customer-support

- **Oracle class:** replay + construction (mechanism: historical tickets w/ known resolutions;
  resolution-first ticket synthesis).
- **Independent oracle:** partial — for the replay half (a historical ticket with a known,
  independently recorded resolution), a genuine independent oracle can be named: the recorded
  resolution exists before and apart from any agent under test. But the table's own note records
  `rubricCalibrated mandatory`, which signals that at least part of this vertical's mechanism
  depends on a calibrated LLM judge for cases without a clean binary "resolution matched" check. A
  judge or a rubric is explicitly **not** an independent oracle under the discipline this analysis
  applies — naming a judge, a rubric, or the generator's own checker is not an independent oracle
  and is recorded as such here rather than papered over.
- **Admission verdict:** admissible with conditions, and the narrowest of the three `pending`
  verticals. The table's own verdict is `pending`. The two verdicts diverge on scope rather than on
  admissibility itself: only the replay-checkable subset of resolutions (a ticket whose resolution
  is a matchable historical fact) is admissible under this analysis; any task shape that leans on
  rubric-calibrated judgment for the full task is not independently checkable and would need its
  own separate admission argument this document does not make.

### revops-gtm-exec-strategy

- **Oracle class:** none fast (mechanism: only resolvable forecasts — probabilistic predictions
  scored ex post, Brier — exogenous but weeks-lagged).
- **Independent oracle:** none — the only exogenous check available (ex post Brier scoring of
  resolvable forecasts) resolves weeks after the forecast is made, which is incompatible with the
  fast qualification/promotion cadence any recommended instrument in this milestone would need. No
  fast independent oracle can be named for this vertical today.
- **Admission verdict:** inadmissible, and here the two verdicts agree — the table's own verdict is
  `refused`. Unlike the two `pending` verticals above, where an independent oracle could be named
  despite the table's own caution, and unlike data-ops, where the table's `admitted` verdict does
  not automatically clear the barred hypothesis, revops-gtm-exec-strategy's table verdict and this
  document's admission-path verdict land in the same place for the same reason: no fast oracle
  exists.

## 2. V3.1-§6 compliance mapping

Per `RESEARCH-PLAN.md` §3 (F-11), this mapping is written before §3's recommendation is finalized,
not retrofitted to justify it afterward — if the mapping had failed for the leading candidate
below, the candidate would change, not the mapping. The barred hypothesis's known identity, per
`V3.1-BATTERY-DESIGN.md` and `PILOT-RESULTS.md`: prompt-search vs hand-written baseline on the
data-ops fact-recovery task family (reconciling financial/warehouse facts — refunds, adjustments,
aggregates — emitted as a CSV fixture warehouse), scored by an independent reference interpreter
recomputing every fact, with a fenced free-text answer parser under strict/relaxed dialects, as the
phase-5 promotion gate.

| Axis | Barred hypothesis (v3/v3.1 line) | Recommended family (bi-analytics query-answering) | Verdict |
|---|---|---|---|
| task semantics | Reconcile financial/warehouse facts (refunds, adjustments, aggregates) from a CSV-emitted fixture warehouse against a natural-language query, on the data-ops vertical | Translate a natural-language business question into an executable SQL query against a frozen fixture warehouse and report its numeric result, on the bi-analytics vertical | substantively different |
| oracle implementation | Independent reference interpreter: a separate implementation recomputes every reconciled fact from the emitted CSV text, never executing the agent's own artifact | SQL engine execution: a real database engine executes the agent-generated SQL text against the frozen warehouse and returns an actual result set, diffed against pre-computed known fixture numbers | substantively different |
| parser/scoring machinery | Fenced-answer free-text parser (strict/relaxed dialects) extracting reconciled numeric values from prose, graded against reconciled fixture facts | Structured-query executor plus result-set diff: scoring runs the emitted SQL and compares its row/column output to a known answer set — no fenced free-text parsing is involved | substantively different |
| promotion-gate role | Phase-5 promotion gate for the data-ops vertical's reflective prompt-mutation tournament | Phase-5 promotion gate for the bi-analytics vertical's own reflective prompt-mutation tournament — gating a materially different vertical's admission, not re-running data-ops's | same |

Three of the four axes read `substantively different` on function, not merely on name: the task
kind changes from reconciling-and-recomputing already-existing facts to generating a new artifact
(a query) that is executed to produce a result, and the oracle mechanism changes correspondingly
from reference-recomputation to engine-execution. Only the promotion-gate role reads `same`, because
both instruments play the structural role of a phase-5 promotion gate — that functional role is the
one axis this mapping does not require to differ, since the phase-5 promotion mechanism itself is
substrate-agnostic machinery reused across verticals by design (`docs/ROADMAP.md` item 8), not part
of the barred hypothesis's identity.

**[F-04, kimi-k3]** One shared exposure this mapping does not erase, and should not be read as
erasing: the new SQL-execution oracle is exactly as blind to the terminated line's dominant failure
shape as the reference-interpreter oracle was. A syntactically valid, successfully executing query
that returns the wrong result set is the direct analogue of the terminated arm's 395/479
parseable-but-wrong residual — "well-formed artifact, wrong answer." The `substantively different`
verdict on this row is about mechanism (execution vs. recomputation), not about immunity to that
failure shape; §7's Disclosure 1 numeric ceiling, not this mapping, is the actual defense against
it, and is written accordingly below.

**V3.1-§6 compliance:** PASS

## 3. The recommendation

**Recommended task family:** BI analytical-query answering (bi-analytics vertical) — translate a
natural-language business question into an executable SQL query against a frozen fixture warehouse.

This recommendation comes from §1's `bi-analytics` subsection: the vertical carries a nameable,
independent construction-class oracle today (a SQL engine executing the candidate's query against
a frozen warehouse, diffed against known fixture numbers), and §2's mapping shows it clears the
V3.1-§6 compliance test on three of four axes without relabelling anything. The independent oracle
carrying it is the SQL-execution-plus-result-diff mechanism named in §1 and §2 — a genuinely
different mechanism from the terminated line's reference-interpreter recomputation, not the same
oracle wearing a new name. The hypothesis it tests is prompt-search vs hand-written baseline on
BI analytical-query answering, as the phase-5 promotion gate for the bi-analytics vertical
specifically — a distinct vertical from data-ops, gating its own admission rather than re-running
data-ops's.

What makes this a **different hypothesis** from the barred one, rather than the same question asked
about different data: the barred hypothesis asks whether prompt-search improves an agent's ability
to *reconcile facts that already exist* inside a warehouse, checked by recomputing those facts
independently. The recommended family asks whether prompt-search improves an agent's ability to
*generate a new artifact* — a query — whose correctness is checked by executing it and inspecting
what it produces. The object under test (a reconciled value vs. an executable program), the check
performed (recomputation vs. execution), and the failure modes available (a wrong number vs. a
malformed or semantically wrong query) are all different in kind, not merely in the warehouse's
contents. Recommending "fact recovery on a different warehouse" would have failed exactly this
test — it is not what is recommended here.

**[F-06, gpt-sol-pro]** A compatibility preview, not a selection: choosing which of the Phase 5
shortlisted methods (S-01 Two-Stage Prompt Optimization, S-02 Contrastive Reflection, S-03 DUALFIX,
`SHORTLIST.md` §3) is stated-mechanism compatible with this recommended family is REQ-44's job,
decided in Task 3 after this document is finalized — not this document's. This document is not
silent on the question, though: at least one plausible compatibility path exists today. S-03
(DUALFIX) evolves reusable rules from coding-problem failures, and SQL is itself a code artifact —
a closer surface match to BI query-answering than DUALFIX has to the terminated line's CSV-fact
reconciliation task, which was never code generation at all. S-01 and S-02 are general-purpose
prompt optimizers (a gradient/loss signal over a support set; a validation-set accept/reject gate),
not tied to any particular output contract, and so are compatible with a query-generation target on
their stated mechanisms alone. None of this pre-empts Task 3's own compatibility argument; it is
recorded here so a reader is not left wondering whether the recommended family is compatible with
anything the shortlist actually contains.

## 4. Instrument sketch — difficulty corridor and knob granularity

The terminated arm's own difficulty knob (the v3/v3.1 grid, G1–G5) moved difficulty in steps too
coarse for the pre-registered corridor: the baseline seed-clustered 90% CI had to be contained in
[0.30, 0.60], a corridor 0.30 wide, against expected CI widths of roughly 0.20–0.23 at six seeds
(`V3.1-BATTERY-DESIGN.md` §4). Concretely, per `PILOT-RESULTS.md`'s terminal report: G2, G3 and G4
landed with their entire baseline interval below the 0.30 floor, while G1 landed with an interval
poking above the corridor ceiling and a gradient too flat to qualify (0.086 against the 0.10
clause). **[F-10, kimi-k3]** The four points span the window at only two rough resolution bands —
G1 near the ceiling, G2–G4 clustered near the floor — not a fine sweep across it, and **none of the
four qualified** with a working gradient inside the corridor (`PILOT-RESULTS.md`'s own verdict is
"no point qualifies," preserved here without softening). Grid points landed either below the
corridor floor with a real gradient, or inside the corridor's general vicinity with no gradient —
the same failure the plan requires this section to name precisely.

The recommended family's own difficulty knob is **query structural complexity**: the number of
tables the target query must JOIN plus the number of aggregation operations (GROUP BY / window
functions) it must compose, an integer count starting at 1 (a single-table SELECT) and incrementing
by exactly one structural operation per grid step. Step granularity, stated in the same [0,1]
mean-score units the corridor is measured in: a ceiling of **≤0.10 mean-score movement per single
knob increment** — one-third of the corridor's 0.30 width — so that no single step can jump clear
across the window the way the v3.1 grid's discrete points effectively did. Granularity ratio:
≤0.10 / 0.30 ≈ 0.33 per step, giving roughly three usable resolution steps across the corridor
itself rather than the terminated arm's effective two across the whole measurable range.

The knob is validated as fine-grained before the grid is committed by a small pretest sweep,
mirroring the terminated arm's own ceiling probe discipline: construct 3–4 knob levels, run a small-n
baseline sample at each, and confirm no adjacent pair moves the mean score by more than the 0.10
ceiling before committing to the full pre-registered grid. A level that violates the ceiling is
subdivided (for example, an intermediate join level via a partial join predicate or a single added
filter clause) rather than accepted as coarse and carried into the pre-registered grid unexamined.

**[F-09, gpt-sol-pro]** This pretest is a coarse SCREEN, not a confirmatory measurement: a small-n
sample at 3–4 levels catches only large granularity violations, not ones near the ≤0.10 boundary
itself. Final confirmation of granularity happens only once the full six-seed pre-registered grid
runs and its own seed-clustered estimate (§5) is available — mirroring how the terminated arm's own
design separated a coarse stage-1 screen from a stage-2 confirmatory measurement rather than trusting
a small pretest to settle a boundary case.

## 5. Instrument sketch — noise budget under seed-clustered estimation

Matching the terminated arm's own estimator exactly, not a weaker one: the unit of replication is
the seed. For each arm × grid point, compute the six per-seed mean graded scores and take the
t-distribution 90% CI on those six means (t₅,₀.₉₅ = 2.015): mean ± 2.015 · sd/√6. Seed count: 6,
the terminated arm's own count, carried forward rather than reduced. Assumed per-seed sd, taken
from the terminated arm's own measured range at comparable difficulty points (0.12–0.14,
`V3.1-BATTERY-DESIGN.md` §4): sd ≈ 0.13 for this family's baseline pretest estimate, giving an
expected CI width of ≈0.13 × 2.015 × 2/√6 ≈ 0.21 — inside the 0.20–0.23 range the terminated arm
itself measured, so this recommendation is held to the same noise bar, not a laxer one.

**[F-08, gpt-sol-pro/kimi-k3]** A real gradient claim compares TWO points (adjacent grid steps),
not one — the CI width above is a single-arm/single-point quantity, and the standard error of a
*difference* between two independent six-seed clusters propagates a √2 factor over a single
cluster's, not a simple halving. The honest resolvable-gradient floor is therefore ≈0.15 in mean
score (0.21 × √2 / 2 ≈ 0.15), not the ≈0.10–0.11 a naive half-CI-width reading would suggest. §4's
own knob-granularity ceiling — ≤0.10 mean-score movement per step — sits ABOVE this resolvable
floor, meaning a single step satisfying the §4 design ceiling may still not be statistically
distinguishable from noise in any one measurement. This is a real, named tension: the design
constraint (fine steps, so a grid point can land inside the corridor) and the analysis threshold
(a large-enough difference to call it a real gradient rather than noise) pull in opposite
directions, and rev 2 discloses this plainly rather than asserting the two numbers already agree.
Disclosure 3's gradient floor (§7) is set at 0.15 to match this corrected estimate. This satisfies
D-4 from `SHORTLIST.md` §4: a naive per-task CI is excluded by name, because it understates
seed-level draw dependence — measured at ±0.13 in the terminated arm's own Phase A data — which is
exactly the gap seed-clustered estimation exists to close, and this family's own noise-budget
claims are checked against an estimator of comparable conservatism, not a weaker one.

## 6. Change ledger against the fixed v3.1 baseline

Per `RESEARCH-PLAN.md` §5 (F-06), the fixed baseline is the terminated arm's own v3.1 battery
design as it stood at termination (`V3.1-BATTERY-DESIGN.md`). No intermediate baseline is
constructed to make a bundled change look singular.

| Component | Disposition | Note |
|---|---|---|
| task distribution | changed | The round's variable — data-ops fact-recovery replaced by BI analytical-query answering as the sampled task population. |
| generator | changed | Forced consequence of the task-distribution change: a BI query-answering task needs a fixture-warehouse-plus-question generator rather than the v3.1 CSV/warehouse-fact generator; the underlying generative discipline (deterministic, seeded, test-enforced) is held constant, only its output domain follows the task distribution. |
| oracle | changed | Forced consequence: the independent reference-interpreter recomputation is replaced by SQL-engine execution against the frozen warehouse, because the new task distribution's ground truth is a query result, not a reconciled CSV fact — the oracle CLASS (construction) is retained; only its concrete mechanism follows the task family. |
| output contract | changed | Forced consequence: the emitted artifact becomes an executable SQL statement rather than a fenced free-text answer, because the task distribution now asks for a query, not a reconciled value. |
| parser/scoring | changed | Forced consequence: fenced-text strict/relaxed parsing is replaced by query execution plus result-set diffing, because there is no free-text answer to parse once the output contract is a query. |
| qualification gate | held constant | **[F-05, gpt-sol-pro]** "Held constant" names the clause SHAPE — the five-clause acceptance-rule structure (baseline CI ⊆ corridor, s0 floor clause, graded-minus-exact clause, per-point no-artifact-rate clause, arm-order clause) — carried forward unchanged from `V3.1-BATTERY-DESIGN.md` §4. Each clause's concrete operationalization against SQL artifacts is, like the generator/oracle/output-contract/parser-scoring rows above, a downstream consequence of the already-designated task-distribution variable, not an independently constant quantity — the shape does not change; what each clause measures necessarily does. |
| difficulty-knob | changed | **[F-01, gpt-sol-pro/kimi-k3/qwen-max/gemma4]** Forced consequence in one part, deliberate design choice in another, and rev 2 no longer blurs the two: that SOME new knob is needed is forced (a BI query-answering task has no v3.1-style CSV-fact knob to reuse). That the new knob is specifically join/aggregation-depth counting, incrementing by one structural operation per step, with a ≤0.10 mean-score-per-step ceiling, is a deliberately engineered response to REQ-43's corridor-placement requirement — an instrument-quality choice made in service of the one designated variable's own instrument, not a second experimental treatment condition applied alongside it. See the paragraph below for why this does not violate one-variable-per-round in the sense that matters. |
| noise estimator | held constant | Seed-clustered t on six per-seed means (§5), the terminated arm's own estimator, unchanged. |

**Round variable (exactly one):** task distribution

The generator, oracle, output contract, parser/scoring machinery, and difficulty knob all read
`changed`, but each is a forced consequence of the single choice to move the sampled task
population from data-ops fact-recovery to BI analytical-query answering — none is an independently
chosen lever on top of that choice. The qualification-gate structure and the noise estimator are
held constant precisely so that everything else about how a point is accepted or rejected stays
pinned while only the task distribution moves.

**[F-01, gpt-sol-pro/kimi-k3/qwen-max/gemma4]** Four of five REQ-46 reviewers independently flagged
that the difficulty knob's specific granularity ceiling is asserted as a forced consequence while
also being called "a deliberate improvement" — a variable cannot honestly be both. Rev 2 resolves
this by distinguishing what one-variable-per-round actually protects against: a SECOND,
independently manipulated experimental condition that would confound attribution of any measured
effect. The knob's existence is forced by the task-distribution swap; its granularity ceiling is an
engineering choice made so the resulting instrument can satisfy REQ-43's own pre-registered
corridor-placement requirement — it is not a second condition under test, because no arm of the
future battery varies knob granularity against another arm holding it fixed. It is disclosed here,
by name, as a design choice rather than asserted as pure logical necessity, which is what the
reviewers' finding actually asked for.

## 7. Instrument-residual disclosures (quantified, pre-registered)

Per `RESEARCH-PLAN.md` §6 (F-10), each disclosure below is a quantified, pre-registered prediction,
never a prose promise.

- **Disclosure 1 — parsing/scoring reuse:** no parsing/scoring machinery is reused from the v3
  line — the recommended family's oracle executes SQL against the warehouse and diffs result sets,
  with no fenced-text parser inherited from the terminated arm. **[F-02, gpt-sol-pro/kimi-k3/qwen-max]**
  Numeric target, corrected in rev 2: rev 1 claimed ≤10% "matching the terminated arm's own
  post-relaxation no-artifact floor," but the terminated arm's actual no-artifact rate was
  16/479 ≈ 3.3%, not 10% — the 10% figure had been mis-derived from the dialect-drift per-arm
  drop-rate fence (a different quantity, §2 of `V3.1-BATTERY-DESIGN.md`), not from either of the
  terminated arm's own real figures for this kind of residual (no-artifact ≈3.3%; genuine-difficulty
  residual, parseable-but-wrong, 395/479 ≈ 82.5%). The corrected target: an executes-but-wrong rate
  (a query that runs successfully but returns an incorrect result set — the direct analogue of
  parseable-but-wrong, per F-04's disclosure above) of ≤20% at the recommended corridor point. This
  is stated as a fresh, disclosed ceiling for the new family, not claimed to numerically match any
  single terminated-arm figure — the new family starts without the terminated line's format tax, so
  a materially lower rate than its 82.5% genuine-difficulty residual is the falsifiable prediction,
  with ≤20% as the pre-registered ceiling that catches a design that reproduces or worsens that
  pathology.
- **Disclosure 2 — difficulty knob:** the join/aggregation-depth knob (§4) is a genuinely new
  mechanism, not a relabelling of the v3.1 knob family — it operates on structural query complexity
  (JOIN count, aggregation-operation count) rather than the v3.1 knob's warehouse-scale/prompt-length
  levers. Step granularity relative to the corridor width it targets (the §4 ratio): ≤0.10
  mean-score movement per step against a 0.30-wide corridor, ≈0.33 of the corridor per step.
  **[F-07, gpt-sol-pro]** Downstream consequence, stated explicitly: a step found at the future
  arm's format-stability/stage-1 checkpoint to exceed the ≤0.10 ceiling invalidates that grid point
  for corridor placement and triggers the §4 subdivision procedure before the point may enter the
  pre-registered grid — it is not silently included.
- **Disclosure 3 — real behaviour versus old-instrument residual:** named observable — the pooled
  mean graded score across the join/aggregation-depth grid. Expected direction: monotonically
  decreasing as join/aggregation count increases. **[F-08, gpt-sol-pro/kimi-k3]** Numeric gradient
  floor under seed-clustered estimation, corrected in rev 2 for two-point difference propagation
  (§5): an adjacent-grid-point mean-score difference of at least **0.15** (not rev 1's 0.10, which
  conflated a single-arm CI half-width with a two-point difference's standard error) is required for
  a step to be credited as a real behavioural gradient rather than noise; anything smaller is
  indistinguishable from old-instrument residual and is not claimed as a finding.
- **Disclosure 4 — headroom target:** pooled baseline mean ≤0.85 at the qualifying corridor point
  (leaving ≥0.15 headroom below the 1.0 ceiling, well clear of v2's 0.92+ saturation failure). **[F-08,
  gpt-sol-pro]** Rev 1 additionally claimed this target was already consistent with
  `V3.1-BATTERY-DESIGN.md` §4's headroom clause — (1 − baseline pooled mean) ≥ 3 × the measured
  replicate noise — using §5's sd ≈0.13 estimate; it is not (3 × 0.13 = 0.39 required headroom, not
  0.15), so rev 2 removes that false consistency claim. The ≤0.85 pooled-baseline-mean figure is the
  pre-registered ceiling disclosed here; the 3×-replicate-noise rule is a separate, downstream check
  performed at the future arm's own noise/selection stage against the ACTUAL replicate-pair noise
  measured then (per `V3.1-BATTERY-DESIGN.md` §4's own procedure) — not a quantity this document can
  verify now, and not claimed to already agree with the ≤0.85 figure.

**Downstream checkpoint (F-22):** the future arm's format-stability gate plus its stage-1 readout,
run under the adopted prereg — the first battery data produced under this new instrument — is where
all four disclosures above meet data. These disclosures are pre-registered and falsifiable
downstream, not falsifiable inside this milestone, since no data can exist here to test them; a
disclosure unmet at that checkpoint fails there, not silently.

## 8. Admissibility check against RESEARCH-PLAN.md §7

Walking the four `RESEARCH-PLAN.md` §7 inadmissibility conditions one at a time:

1. **Fails the V3.1-§6 compliance test (§2 above)?** No — §2 closes PASS, with three of four axes
   reading substantively different, not relabelled.
2. **Violates one-variable-per-round as recommended (§6 above)?** No — §6's ledger names exactly
   one round variable (task distribution), with every other `changed` row justified as a forced
   consequence of that single choice.
3. **Cannot state a quantified instrument-residual disclosure (§7 above)?** No — all four
   disclosures carry a stated numeric threshold or named observable, not a prose promise.
4. **Admission-path analysis cannot name an oracle independent of the generative process under
   test (§1 above)?** No — §1 names a SQL-execution-plus-result-diff oracle for bi-analytics,
   independently implemented from the generative process it checks.

**Admissibility verdict:** ADMISSIBLE

## 9. Selection analysis self-audit

Win-likelihood was not a criterion anywhere in this analysis: no benchmark number, accuracy figure,
or comparative "would probably win" claim appears anywhere in §1's admission-path assessments or
§3's recommendation — the reasoning runs on oracle independence, compliance-mapping substance, and
change-ledger discipline only. No §1 subsection was written after a winner was chosen: all five
verticals, including the four not recommended, carry the same three-bullet assessment shape, and
the reasons the non-winning verticals were not recommended (data-ops's shared-mechanism burden,
performance-marketing's horizon cap, customer-support's rubric-dependent scope narrowing,
revops-gtm-exec-strategy's lagged oracle) are stated in their own subsections rather than implied
by omission.

A reader checking both claims should look at three places: §1's five assessed subsections, which
treat every vertical to the same bullet discipline before §3 names one; §2's compliance mapping,
which is written and closed with a PASS verdict before §3's recommendation names the family it
supports; and the git history, where `SHORTLIST.md`'s commit predates this document's commit,
confirming this document builds on a frozen input rather than reopening it.
