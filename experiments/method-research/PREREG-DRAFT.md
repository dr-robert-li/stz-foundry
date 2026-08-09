# PREREG-AMENDMENT-3-equivalent — DRAFT for the future arm's BI analytical-query-answering instrument

> **DRAFT — NOT ADOPTED.** This document is a proposal reserved for a future arm's own milestone.
> Adoption is commit-is-timestamp by the future arm, in its own commit — this file's commit here
> is NOT adoption. Nothing in this milestone treats it as binding, and nothing downstream may cite
> this commit as though the future arm had already begun.

## 0. Status — DRAFT, not adopted

This document satisfies REQ-44: a draft PREREG-AMENDMENT-3-equivalent (chosen method, decision
rule, termination clause) for the task family recommended in
`experiments/method-research/RECOMMENDATION.md` rev 2. It was written only after REQ-46's analysis
review cleared — `experiments/method-research/ANALYSIS-REVIEWS.md`'s `**F-13 method-shopping
gate:**` line reads CLEAR, and its commit is a strict git ancestor of this file's commit (§ below,
provable, not asserted).

A DRAFT here means: a proposal, reserved for a future arm's own milestone, carrying **no
obligation on the present one**. Nothing in this milestone's scope requires the instrument
described below to be built, run, or even started. Who may adopt it: the future arm, and only in
its own commit — that commit is the adoption timestamp, not this one. What would change on
adoption: §6 lists it in full (a real generator id, human acceptance in session, the decision rule
and termination clause becoming binding on that arm's own battery). This milestone ends at
recommendation plus draft; building the instrument is explicitly out of scope per
`.planning/REQUIREMENTS.md`'s "Future Requirements" section, which reserves "execution of the
drafted prereg" for a future milestone that fires only when the recommended instrument is actually
built and accepted.

## 1. Chosen method

**Chosen method:** S-03 — From Failing to Passing (DUALFIX)

Provenance: the choice was made among the three already-shortlisted methods
(`SHORTLIST.md` §3 — S-01 Two-Stage Prompt Optimization, S-02 Contrastive Reflection, S-03
DUALFIX) on stated-mechanism compatibility with the recommended task family
(`RECOMMENDATION.md` rev 2 §3, BI analytical-query answering) and with the D-1…D-4
evaluation-design constraints (`SHORTLIST.md` §4). No new selection criterion is introduced here —
the frozen `RESEARCH-PLAN.md` §2 criteria already selected these three; this step only picks among
them on fit, and says so.

What carried the choice: DUALFIX's stated mechanism evolves reusable, error-agnostic
transformation rules from a set of **coding problems**, specifically separating specification-level
from implementation-level failures. SQL is a code artifact — the recommended family's output
contract is an executable query, not free text — so DUALFIX's mechanism has a direct surface match
to what the future arm's agent actually produces, closer than DUALFIX's own match to the
terminated line's CSV-fact-reconciliation task (which was never code generation). DUALFIX's
mechanism also bears usefully on D-1 (the parseable-but-wrong / genuine-difficulty distinction,
`SHORTLIST.md` §4): its own specification-vs-implementation failure split gives the future arm's
evaluation design a starting vocabulary for separating "the query is malformed" from "the query
runs but encodes the wrong business logic" — the direct analogue of D-1's format-tax-vs-genuine-
difficulty distinction, now inside a method's own stated mechanism rather than only the
instrument's scoring layer.

What did not carry the choice: S-01 (GradPO) and S-02 (Contrastive Reflection) are both
general-purpose prompt optimizers — a gradient/loss signal over a support set, and a
validation-set accept/reject gate, respectively — compatible with a query-generation target on
their stated mechanisms alone, but with no particular structural affinity to SQL-as-code beyond
generic prompt-editing applicability. Their compatibility is real but generic; DUALFIX's is
specific to the artifact kind the recommended family actually produces. Win-likelihood was not a
criterion in this comparison — nothing here compares which method would score higher on the future
battery, because no such data exists; the comparison is entirely about which method's own stated
mechanism most directly addresses the kind of artifact (code) and the kind of residual (D-1's
well-formed-but-wrong distinction) the recommended family's own instrument sketch already names.

## 2. Task family and instrument

Restated from `RECOMMENDATION.md` rev 2 §3–§6, verbatim in substance, not re-derived:

- **Recommended task family:** BI analytical-query answering (bi-analytics vertical) — translate a
  natural-language business question into an executable SQL query against a frozen fixture
  warehouse.
- **Independent oracle:** a SQL engine executes the candidate's generated query against the frozen
  fixture warehouse and diffs the real result set against pre-computed known fixture numbers —
  independently implemented from the generative process it checks, per the admission-path analysis
  in `RECOMMENDATION.md` rev 2 §1.
- **Difficulty knob:** query structural complexity — the number of JOINs plus aggregation
  operations (GROUP BY / window functions) the target query must compose, incrementing by exactly
  one structural operation per grid step, with a ≤0.10 mean-score-per-step granularity ceiling
  (≈0.33 of the 0.30-wide corridor per step) validated by a coarse pretest sweep before the full
  grid is committed (`RECOMMENDATION.md` rev 2 §4, F-09).
- **Round variable (exactly one):** task distribution — data-ops fact-recovery is replaced by BI
  analytical-query answering as the sampled task population; the generator, oracle, output
  contract, parser/scoring machinery, and difficulty knob are all downstream consequences of that
  single choice, not independently chosen levers (`RECOMMENDATION.md` rev 2 §6, F-01).

A future reader of this file alone, without re-reading `RECOMMENDATION.md`, now knows what family
is proposed, what checks it, how difficulty is controlled, and what the one thing this round
changes actually is.

## 3. Decision rule

Pre-registered and quantified, in the shape of `V3.1-BATTERY-DESIGN.md` §4's acceptance clauses —
every clause below is a number or a sign test, not a judgement call.

**Unit of replication:** the seed. For each arm × grid point, compute the six per-seed mean graded
scores and take the t-distribution 90% CI on those means (t₅,₀.₉₅ = 2.015, six seeds, matching the
terminated arm's own estimator and `RECOMMENDATION.md` rev 2 §5).

**Stage-1 acceptance rule (ALL clauses, primary endpoint):**

1. Baseline seed-clustered 90% CI ⊆ [0.30, 0.60] (the same corridor the terminated arm used).
2. s0-minimal (weak-prompt) pooled mean ≥ 0.05.
3. Baseline pooled mean (graded, result-set-overlap scoring) − pooled exact-match rate ≥ 0.10,
   where exact-match = every column and row of the result set matches the known answer exactly.
4. Executes-but-wrong rate ≤ 0.20 on EACH arm separately, evaluated per grid point over that
   point's full seed × task sample (`RECOMMENDATION.md` rev 2 §7 Disclosure 1's corrected target;
   never pooled across points).
5. Arm order: baseline pooled mean > s0 pooled mean, AND sign(baseline seed-mean − s0 seed-mean)
   > 0 on ≥ 5 of 6 seeds. A zero difference counts as a violation.

**Gradient clause (carries `RECOMMENDATION.md` rev 2 §7 Disclosure 3 forward):** an adjacent
grid-point mean-score difference of at least 0.15 is required for a step to be credited as a real
behavioural gradient rather than noise, under the same seed-clustered estimator — the corrected
floor from rev 2's two-point noise-propagation fix, not rev 1's uncorrected 0.10.

**Headroom clause (carries Disclosure 4 forward):** pooled baseline mean ≤ 0.85 at the qualifying
corridor point is the pre-registered ceiling; the future arm's own noise/selection stage
additionally checks (1 − baseline pooled mean) ≥ 3 × the ACTUAL measured replicate-pair noise at
that point, per `V3.1-BATTERY-DESIGN.md` §4's own procedure — a downstream empirical check, not a
number this draft can verify now.

**Selection among stage-1 qualifiers**, if more than one point qualifies: the predeclared priority
order is fewest structural operations first (mirroring the terminated arm's G1 > G2 > G3 > G4
fewest-levers-first rule), independent of measured noise.

**Stage 2 — confirmation on fresh seeds**, mirroring `V3.1-BATTERY-DESIGN.md` §4's stage-2
discipline: both arms, a fresh seed set disjoint from stage 1. The selected point is confirmed iff
(i) baseline pooled mean ∈ [0.30, 0.60] (point estimate); (ii) sign(baseline − s0) is positive on
ALL fresh seeds; (iii) executes-but-wrong ≤ 0.20 on each arm. Failure routes to the next stage-1
qualifier in priority order, once each; exhaustion routes to §4's termination.

A point passing the format-stability gate + stage 1 + gradient/headroom + stage 2 is the candidate
for human acceptance (§6).

## 4. Termination clause

Mirroring `V3.1-BATTERY-DESIGN.md` §6's own construction exactly: if no point passes the gate,
stage 1, the gradient/headroom clauses, and stage 2, the BI analytical-query-answering instrument
line TERMINATES, and the prohibition is on SUBSTANCE, not name — no successor instrument that
tests this hypothesis (prompt-search vs hand-written baseline on BI analytical-query answering, as
the phase-5 promotion gate for the bi-analytics vertical) may be built under ANY label by changing
parser, prompts, grid, scoring, or qualification rules. Termination here is one-shot, matching the
terminated data-ops line's own rule; there is no second attempt at this same hypothesis under a
different name.

What would remain legitimate after such a termination: publishing a terminal report for this line
(matching the shape of `PILOT-RESULTS.md`'s "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE
TERMINATED" section); using this run's diagnostics to design instruments for DIFFERENT hypotheses
or task families — including, if genuinely warranted on its own merits, a future admission-path
analysis for one of the other `VERTICAL_ADMISSION` verticals this milestone assessed but did not
recommend (`RECOMMENDATION.md` rev 2 §1: performance-marketing, customer-support, both assessed
admissible with conditions); and Phase 5 staying gated on whatever evidence exists at that point,
with `docs/ROADMAP.md` item 8 saying exactly that, the same discipline the data-ops line's own
termination followed.

## 5. Pre-registered disclosures carried from the recommendation

Carried across from `RECOMMENDATION.md` rev 2 §7 verbatim, keeping the same bullet form and
numbering — thresholds are not softened in transit, since a threshold that softens in transit is
exactly the residual-masking failure these disclosures exist to catch.

- **Disclosure 1** — parsing/scoring reuse: no parsing/scoring machinery is reused from the v3
  line. Numeric target: an executes-but-wrong rate (a query that runs successfully but returns an
  incorrect result set) of ≤20% at the recommended corridor point — a fresh, disclosed ceiling, not
  claimed to numerically match any single terminated-arm figure.
- **Disclosure 2** — difficulty knob: the join/aggregation-depth knob is a genuinely new
  mechanism, not a relabelling of the v3.1 knob family. Step granularity relative to the corridor
  width it targets: ≤0.10 mean-score movement per step against a 0.30-wide corridor, ≈0.33 of the
  corridor per step. A step found downstream to exceed this ceiling invalidates that grid point for
  corridor placement and triggers subdivision, not silent inclusion.
- **Disclosure 3** — real behaviour versus old-instrument residual: named observable is the pooled
  mean graded score across the join/aggregation-depth grid, expected direction is monotonically
  decreasing as join/aggregation count increases, and the numeric gradient floor under
  seed-clustered estimation is 0.15 (the corrected, two-point-propagation-aware floor).
- **Disclosure 4** — headroom target: pooled baseline mean ≤0.85 at the qualifying corridor point,
  leaving ≥0.15 headroom below the 1.0 ceiling, well clear of v2's 0.92+ saturation failure.

**Downstream checkpoint (F-22):** the future arm's format-stability gate plus its stage-1 readout —
the first battery data produced under this new instrument — is where all four disclosures above
meet data. They are pre-registered and falsifiable downstream, not falsifiable inside this
milestone, since no data can exist here to test them; a disclosure unmet at that checkpoint fails
there, not silently.

## 6. What adoption would require

Adoption belongs to the future arm, entirely: its own milestone, its own commit, and that commit
is the adoption timestamp — not this one. Concretely, adoption would require:

- A real generator id for the BI fixture-warehouse-plus-question generator, following the house
  pattern (`V3.1-BATTERY-DESIGN.md` §7): a new id, ABSENT from `ACCEPTED_GENERATORS` until Dr.
  Robert Li accepts it in session — human acceptance, never self-issued, and never inferred from
  this DRAFT's mere existence.
- The decision rule (§3) and termination clause (§4) above becoming binding on that arm's own
  battery, exactly as written here unless the future arm's own review process amends them in its
  own commit, with its own rationale — this document does not pre-authorize silent revision.
- The independent oracle infrastructure named in §2 (the frozen fixture warehouse, its known-answer
  query set, and the SQL execution/diff harness) actually built, closing the "condition" `RECOMMENDATION.md`
  rev 2 §1 attached to bi-analytics's `admissible with conditions` verdict.

This document may be revised freely until adoption — revision before adoption is expected rather
than exceptional, since no data exists yet to test any of the numbers above. Nothing in this
milestone treats revision of this DRAFT as requiring a new review pass; that discipline belongs to
whichever future arm's own planning process picks this document up.
