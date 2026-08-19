# Third-family paired-comparison design — pre-registration

**Revision:** 1-draft — NOT frozen. This document is being written §0–§2 first (plan 13-01);
§3–§11 follow in plan 13-02; the 5-lane adversarial panel runs in 13-03, adjudication in 13-04,
and rev 2 freezes at plan 13-05. Nothing below is a promise about downstream content beyond what
these three sections state.

## §0 Status and freeze discipline

**Override framing.** This work executes under the **2026-08-11 human override** by Dr. Robert Li
as v1.25.0 follow-on work. It is explicitly **not** a Stage-B trigger outcome, **not** a
retroactive pass of the Stage-B gate that recorded NOT-MET (`20*(19-17)=40 < 3*24=72`,
`experiments/dualfix-study/STUDY-RESULTS.md`), and **not** a continuation of milestone v1.24.0.
Milestone v1.24.0 closed at Phase 12 on the pre-registered MILESTONE CLOSING branch; its terminal
record — `experiments/dualfix-study/TERMINAL-REPORT.md` and `STUDY-RESULTS.md` — stands untouched
and read-only throughout this phase and this document. Phases 13/14 exist only because Dr. Li
explicitly directed reopening them on 2026-08-11, overriding the VOID-BY-RULE closure the Stage-B
miss would otherwise have produced for REQ-67–69; that override is the entire reason this document
exists, and every artifact this phase writes states so in its own text rather than as a footnote.

**Freeze discipline.** This document will carry a five-lane adversarial panel (`gpt-sol-pro`,
`kimi-k3`, `qwen-max`, `gemma4`, `gpt-oss` — D-06), matching the full-discipline panel
`BI-BATTERY-DESIGN.md` and `ANALYSIS-REVIEWS.md` used, not the lighter 3-lane panel
`DUALFIX-STUDY-PREREG.md` ran. Every finding the panel raises is adjudicated exactly once,
`ADOPTED` or `REJECTED-with-reason` — no finding is silently dropped and none is auto-applied
without adjudication (D-07). Rev 2 freezes at plan 13-05, at which point the freeze commit's SHA
is recorded as a literal string in `docs/JOURNAL.md` so Phase 14 can prove ancestry with
`git merge-base --is-ancestor <freeze-sha> <phase-14-instrument-commit>` without re-deriving
anything. No edit lands on this document after that freeze except a recorded amendment entry
(D-09) — rev 2 is a one-way door, not a draft that quietly keeps moving.

## §1 Admission-path analysis and the third-family selection

**The live admission table**, read directly off `src/foundry/vertical-admission.ts` at HEAD
(lines 94–148) rather than quoted from a remembered or research-summarised version:

| Vertical | Verdict | Oracle class |
|---|---|---|
| `data-ops` | admitted | execution + construction |
| `bi-analytics` | admitted | execution + construction |
| `performance-marketing` | pending | replay |
| `customer-support` | pending | replay + construction |
| `revops-gtm-exec-strategy` | refused | none fast |

`Vertical` is a five-member closed union and `VERTICAL_ADMISSION` is a runtime-sealed `Map`
(`sealTable`) — an id absent from the table is refused, never defaulted to admitted or pending, and
the table's mutators throw rather than silently succeeding. These five rows are the complete and
current admission state; nothing has drifted since `bi-analytics` was admitted in v1.23.0.

**Table admission and the §6/§10 standing bar are different axes.** A `verdict: "admitted"` row
states that a real, independent oracle mechanism exists for that vertical *in general* — it says
nothing about which hypothesis may be tested on it. The §6/§10 bar is narrower and unrelated to
that axis: it forbids one *specific* hypothesis — prompt-search vs hand-written baseline, run as
the phase-5 promotion gate — on *two specific verticals*, `data-ops` and `bi-analytics`, under any
label. A vertical can therefore be table-`admitted` and still be barred from carrying that one
hypothesis (`data-ops`, `bi-analytics` both are), and a vertical can be table-`pending` and be
entirely unaffected by the bar (`performance-marketing`, `customer-support` both are, since the bar
never named them). This phase's third-family selection is drawn from the `pending` rows precisely
because the bar has nothing to say about them; §2 below performs the substance mapping the bar
actually requires, against whichever family is selected.

**`revops-gtm-exec-strategy` is out of scope on its own table verdict alone**: `refused`, no fast
oracle — its only available mechanism is "resolvable forecasts (probabilistic predictions scored ex
post, Brier) — exogenous but weeks-lagged," which this project's own admission discipline treats as
no independent oracle at all today. No further comparison against it is needed; a refused vertical
stays refused (`requireAdmitted`'s own discipline), and nothing in this phase edits that table.

**The two viable candidates, compared on buildability, not on expected outcome.** Both remaining
rows read `pending`: `performance-marketing` (oracle class `replay`) and `customer-support` (oracle
class `replay + construction`).

- `customer-support`'s oracle class includes *construction*: the replay-checkable subset of this
  vertical — a historical ticket whose resolution is a matchable, verifiable historical fact — can
  be built with the **answer-first construction pattern** this project has already proven twice:
  compose the ground-truth resolution first, then generate the ticket/question from it, exactly as
  `BI-BATTERY-DESIGN.md` §1 did for the star-schema warehouse ("produced ANSWER-FIRST... both the
  reference query and its answer exist BEFORE any candidate ever sees the question") and as the
  data-ops fixture warehouse did before it. A deterministic, seeded generator whose ground truth
  never depends on the process under test is buildable today with house patterns already in this
  codebase — no external dataset is required.
- `performance-marketing`'s oracle class is pure *replay*: it requires real, previously-existing,
  exogenous campaign-outcome data (spend, conversions, and similar actuals recorded independently
  of and before any candidate proposes an action against them). This document re-ran the absence
  check itself this session: `grep -rli` for "campaign" and "actuals" across `src/`, `experiments/`,
  and `docs/development/` returns only three files — `experiments/method-research/RECOMMENDATION.md`
  (prose describing the idea of a replay oracle), `src/foundry/vertical-admission.ts` (the admission
  table's own one-line note), and `docs/development/harness-factory.md` (the same admission table in
  prose) — and two files matching "actuals" outside those three, `src/budget.ts` and
  `src/contract/predicate-eval.ts`, both of which use the word for observed cost/predicate data, not
  campaign outcomes. No harvested campaign-log corpus exists anywhere in this repository. Building
  one now would mean either sourcing real external campaign data (outside this phase's scope) or
  manufacturing synthetic "actuals" — which is precisely the negative this project's own standing
  constraint bars: **"Exogeneity is harvested, not manufactured"** (`.planning/PROJECT.md`,
  Constraints / Non-negotiables). A fabricated ground truth is not an exogenous oracle no matter how
  it is labelled, so this path is closed, not merely disfavoured.

**Selection.** `customer-support`, scoped narrowly to its **replay-checkable subset only** — never
the full ticket-resolution task, which would lean on `rubricCalibrated` judgment and is explicitly
out of scope under this project's independent-oracle discipline (a judge or rubric never substitutes
for one). This confirms, rather than amends, the working default D-02 recorded in `.planning/STATE.md`
on 2026-08-19: reading the live table and the repository myself this session reproduces the identical
buildability asymmetry the recorded default was based on, so the default stands confirmed by this
plan's own independent check, not merely carried forward unexamined.

**Selection self-audit (mirroring `RECOMMENDATION.md` §9's own discipline).** Win-likelihood was not
a criterion anywhere in the argument above: no benchmark number, accuracy figure, or "would probably
win" claim appears in either candidate's assessment or in the selection line — the argument runs
entirely on which oracle mechanism is constructible today without violating the exogeneity
constraint. Both candidates were assessed on the same three-point shape (oracle class, buildability
evidence, concrete blocker or lack of one) before either was named as selected, and the reason the
non-selected candidate (`performance-marketing`) was not chosen is stated in its own paragraph above
rather than implied by omission — the same audit RECOMMENDATION.md §9 performed against its own
five-way assessment.

Note on scope: admitting `customer-support` into `VERTICAL_ADMISSION` (moving its verdict from
`pending` to `admitted`) is explicitly **not** this phase's job — that is Phase 14's REQ-68
obligation. This document selects the family and records the evidence; it edits no source file.

## §2 The §6/§10 substance mapping

The barred hypothesis, per `V3.1-BATTERY-DESIGN.md`/`DUALFIX-STUDY-PREREG.md` §2's own naming and
`RECOMMENDATION.md` §2's precedent mapping: **prompt-search vs hand-written baseline, run as the
phase-5 promotion gate, on `data-ops` or `bi-analytics` specifically, under any label** — barred on
substance, not on the two ids alone. This section maps the selected family's actual design against
that hypothesis on four axes, following the shape `RECOMMENDATION.md` §2 already used to clear
`bi-analytics` against the terminated `data-ops` (v3.1) line.

| Axis | Barred hypothesis (`data-ops`/`bi-analytics`, phase-5 promotion gate) | This phase's design (`customer-support`, replay-checkable subset, paired W-vs-B) | Verdict |
|---|---|---|---|
| task semantics | Reconcile financial/warehouse facts or translate a business question into SQL, on `data-ops`/`bi-analytics` | Match a historical support ticket to its known, matchable resolution, on `customer-support` — a different vertical entirely, with a different task object (a ticket-resolution match, not a reconciled fact or an executable query) | substantively different |
| oracle implementation | `data-ops`: independent reference interpreter recomputing facts. `bi-analytics`: SQL engine execution diffed against fixture numbers. Both are oracle class `execution + construction` | `customer-support`'s oracle class is `replay + construction`: a resolution-first-constructed ticket, checked against the known resolution it was built from — no execution or interpreter re-derivation step at all | substantively different |
| parser/scoring machinery | `data-ops`: fenced free-text answer parser (strict/relaxed dialects). `bi-analytics`: structured-query executor plus result-set diff | Replay-match scoring: the candidate's proposed resolution is compared against the pre-constructed known resolution for that ticket — neither a fenced free-text parser nor a query-execution diff is involved | substantively different |
| promotion-gate role | Both instruments serve as the phase-5 promotion gate for their own vertical's admission — a corridor-gated accept/reject decision | This phase's instrument is explicitly **not** a promotion gate for `customer-support`'s admission: D-05 bars any corridor requirement anywhere in this design, and `customer-support`'s `VERTICAL_ADMISSION` verdict stays `pending` regardless of this study's outcome (admission is Phase 14's separate REQ-68 decision, made on different evidence). This design is a paired win/loss/tie property measurement (sign test over discordant pairs) between a tournament-selected agent (W) and a baseline unevolved agent (B) — mirroring how `DUALFIX-STUDY-PREREG.md` §2 already distinguished its own property study from a promotion-gate comparison, not reusing the corridor-gated promotion-gate shape at all | substantively different |

**Verdict: the exclusion holds on substance, on all four axes, not by naming `data-ops` and
`bi-analytics` and moving on.** Three of the four axes differ because the vertical and its concrete
task/oracle/scoring shape are simply different objects (mirroring `RECOMMENDATION.md` §2's own
"substantively different" findings on the same three axes). The fourth axis — promotion-gate role —
is the one axis `RECOMMENDATION.md` §2 itself left `same` between `data-ops` and `bi-analytics`,
because both of those instruments genuinely are the phase-5 promotion gate for their vertical. This
phase's design is not: it is a paired property measurement under D-05's explicit no-corridor rule,
producing a sign-test finding rather than an admission decision, so this axis reads different in
kind here as well — a stronger clearance than the precedent's own 3-of-4 mapping needed, not a
weaker one reached by relaxing the standard.

One shared exposure this mapping does not erase, named rather than hidden (mirroring
`RECOMMENDATION.md` §2's own [F-04] disclosure): a replay-match oracle is exactly as blind to a
"plausible-looking but wrong resolution" failure shape as the barred hypothesis's own oracles were
to their analogous failure shapes. The `substantively different` verdicts above are about mechanism
and role, not about immunity to that failure class — any quantified-disclosure ceiling this design
needs against it is §2's own future obligation (plan 13-02), not resolved by this mapping.

## §3 The two arms — W and B, pinned

**W and B, pinned as concrete agent definitions (D-03).** Per the 2026-08-19 STATE.md orchestrator
default: **W** is the tournament-selected winner agent definition — the agent configuration
produced by this project's component-tournament machinery running GEPA-style bounded reflective
mutation, from which the tournament's own selection rule already picks a single winning
configuration. **B** is the baseline unevolved agent definition — the same underlying model, run
against the same battery, with no search, no mutation, and no tournament selection applied: the
configuration a human would hand-write without running the tournament machinery at all. Neither
identity was defined anywhere in the prior record before this default was recorded
(13-RESEARCH.md Open Question 2) — this section states plainly that it inherits, rather than
invents, that gap.

**Confirmed, not amended.** This document confirms the 2026-08-19 default rather than amending it.
The reason: the tournament machinery (component-tournament, GEPA-style bounded reflective mutation)
is the only search mechanism this project has actually built and run end-to-end at the
harness-genome altitude; naming any other candidate as W would require inventing a second search
mechanism this phase has no mandate, no code, and no evidence for. The DUALFIX repair arm was
considered and rejected as a candidate for W: DUALFIX is a repair mechanism (post-hoc correction of
an already-failing artifact), not a search mechanism (proposing and selecting among candidate agent
definitions before any artifact exists) — and DUALFIX's own property study closed at Phase 12 with
a NOT-MET Stage-B verdict, so re-proposing it under REQ-69's own W-vs-B naming would confuse "the
line that already ran and missed its own margin" with "the mechanism this new paired round tests,"
two different claims this document keeps separate rather than conflating.

**Equal-treatment invariant.** Both arms are held identical on every axis except the one under
test:

- **Identical:** the underlying model and model digest, the timeout, the prompt-length bound, the
  attempt discipline (exactly one resolution proposal per arm per pairing unit, mirroring the
  single-attempt convention `DUALFIX-STUDY-PREREG.md` §5's equal-treatment invariant already
  establishes for this project), and the scoring path (§4's independent replay-match oracle,
  applied identically and independently to each arm's own proposed resolution).
- **Deliberately different:** the presence or absence of the component-tournament search that
  produced the agent definition under test. W's definition is the tournament's own selected output;
  B's definition is written without running that search at all. This one axis is the entire
  mechanism under measurement; every other axis above is held constant precisely so a measured
  difference cannot be attributed to anything else.

**Rejected alternative arm framings, named and dispositioned:**

- **W = the DUALFIX repair arm.** Rejected, per the reasoning above: repair and search are
  different mechanisms, and DUALFIX's own property study already closed NOT-MET under a different
  hypothesis (a repair-rate improvement over naive retry, not a paired win-rate against an unevolved
  baseline). Reusing its name for a different comparison here would misstate what was actually
  measured in Phase 12.
- **B = an s0-minimal floor arm** (mirroring `BI-BATTERY-DESIGN.md` §6's s0-minimal arm — a
  deliberately impoverished prompt with engineering guidance stripped out). Rejected: an s0-minimal
  arm tests prompt-engineering floor behaviour, not the "unevolved baseline" identity REQ-69 actually
  names. B must be the best a human would write without the tournament, not the worst; conflating
  the two would test a different, weaker hypothesis than the one this phase exists to measure.

## §4 The pairing unit, battery construction, and per-task status discipline

**The pairing unit.** Each task instance is a single historical support ticket, drawn from the
`customer-support` vertical's replay-checkable subset (§1) — a ticket whose historical resolution
is a matchable, verifiable fact. Both arms (W and B) attempt the identical ticket: same seed, same
generated ticket content (the schema/context shown, the question posed), same warehouse/corpus
state, so the paired comparison isolates the presence or absence of the tournament search (§3's one
deliberately-differing axis) rather than any difference in what either arm was actually asked. A
pairing unit is never re-drawn, re-worded, or regenerated once either arm has seen it.

**Battery construction, answer-first, scoped to §1's narrow selection.** Following the
answer-first fixture-warehouse pattern this project has proven twice (`fixture-warehouse-v3.ts` for
data-ops, the BI star-schema generator for bi-analytics), each ticket is constructed by a
deterministic, seeded generator: the known-correct resolution is composed FIRST, from the
generator's own seeded stream, before any question is derived from it; the ticket's customer-facing
question/complaint text is then generated FROM that resolution's own semantics (what the resolution
actually fixed, referenced, or determined), rendered as a plausible support ticket a customer might
file. The ground truth therefore never depends on, or is influenced by, either arm's own attempt —
it exists before either arm ever sees the ticket, exactly as `BI-BATTERY-DESIGN.md` §1's fixture
warehouse and known-answer query set were built ("produced ANSWER-FIRST... both the reference query
and its answer exist BEFORE any candidate ever sees the question"). This construction is scoped
exactly to §1's selection: the replay-checkable subset only — a ticket whose resolution is a
matchable historical fact — never the full ticket-resolution task, which would lean on
`rubricCalibrated` judgment and is explicitly out of scope (§1). No task shape wider than this
subset is constructed by this design.

**The independent oracle: replay-match scoring.** Each arm's proposed resolution is scored by
comparing it, as a structured match (not a rubric, not a judge — see below), against the ticket's
pre-composed known-correct resolution. The oracle computes a binary match: the proposed resolution
either matches the known resolution's defining structured fact (the action taken, the resolution
category, and any resolution-specific parameter the generator pinned when it composed the
resolution) or it does not — there is no partial-credit or graded scale at this family's own
scoring layer (the per-task status discipline below defines the categories this binary reduces
from). The oracle shares zero helper functions with either arm's own resolution-construction path:
the generator's answer-first composition step and the oracle's own match-evaluation step are two
separately implemented code paths, mirroring `BI-BATTERY-DESIGN.md` §3's own zero-shared-helpers
independence discipline.

**What this independence does not cover, disclosed rather than implied** (mirroring
`BI-BATTERY-DESIGN.md` §3's own F-20/F-21 disclosures): the independence claim above is scoped to
the COMPUTATION of the match only. It does NOT cover the ticket's own text-rendering step — the same
generator that composes the known-correct resolution also renders the customer-facing
question/complaint text from that resolution's semantics, so a bug in that shared rendering logic
(the ticket text failing to actually denote the resolution it was derived from) would leave the
match computation intact while scoring candidates against a ticket that does not faithfully pose the
question the resolution answers. This gap is named here, not closed by this design; Phase 14's own
generator obligation must add whatever fidelity check closes it, exactly as `BI-BATTERY-DESIGN.md`
§3 left its own analogous gap open for Phase 8. Independence is also not claimed over the DATA
SOURCE: both the resolution-composition step and the match-evaluation step read the same seed's
generated ticket state — independence is claimed in computation, never in data provenance.

**No judge, no rubric, anywhere in the scoring path — a hard rule, not a preference.** The oracle
above performs a structured match against a pre-composed known answer; it never invokes an LLM (or
any other model) to judge, score, or rate either arm's proposed resolution, and it never applies a
rubric of any kind. This is a hard rule, not a preference, because a judge or rubric is explicitly
not an independent oracle under this project's own standing discipline (`PROJECT.md`'s
"LLM-judge-only fitness for soft verticals" trap) — a paired win or loss decided by a model's
opinion of which resolution looks better is not a measurement of anything except the judge's own
biases, and would make this entire paired study's decision rule (§5) circular: the very thing under
test (does the tournament-selected agent produce better resolutions) would be answered by another
model's guess rather than by an independently verifiable fact. This is exactly why §1 scoped
selection to the REPLAY-CHECKABLE subset of `customer-support` and explicitly excluded the full
ticket-resolution task, which would have required exactly this disallowed judge/rubric step.

**Per-task status discipline — the exhaustive, mutually-exclusive outcome categories.** Every
attempt, in both arms, decomposes at scoring time into exactly one of four named categories, fixed
here before any data exists (mirroring `BI-BATTERY-DESIGN.md` §4's zero-decomposition rule and
`DUALFIX-STUDY-PREREG.md` §3's own explicit-sentence discipline):

1. **no-artifact** — the candidate produced no extractable proposed-resolution artifact at all (an
   empty response, or a response containing no identifiable resolution proposal in the required
   output contract).
2. **non-scoreable artifact** — the candidate produced a resolution proposal, but it is not in a
   form the replay-match oracle can evaluate (e.g., it does not name a resolution category or
   action the oracle's match step can compare against the known resolution's own structured fact).
3. **resolution-mismatch** — the proposal is scoreable, and the oracle's match evaluates it against
   the known resolution: it does not match (binary score 0).
4. **resolution-match** — the proposal is scoreable and matches the known resolution's defining
   structured fact exactly (binary score 1).

Two readers presented with the same raw response and the same known resolution would classify it
identically under these four categories: categories 1–2 turn only on whether a scoreable artifact
exists at all (never on whether it is correct), and categories 3–4 turn only on the oracle's own
binary match result once a scoreable artifact exists — no category depends on a judgement call
between them.

## §5 The paired methodology and its integer decision rule

**Per-pair outcome: win, loss, or tie — computed from binary oracle scores.** For each pairing unit
(§4), both arms' proposed resolutions are scored independently by the same replay-match oracle,
each producing a score of exactly 0 (resolution-mismatch — or worse, no-artifact/non-scoreable,
which §6 Clause 3 tracks separately) or 1 (resolution-match). A pair resolves to exactly one of:

- **WIN** — W scores 1 and B scores 0 on that pairing unit.
- **LOSS** — W scores 0 and B scores 1.
- **TIE** — both arms score identically (both 1, or both 0).

Because the score type is binary (an integer 0 or 1, never a graded or continuous value), equality
is plain integer equality — `scoreW === scoreB` — and no tolerance clause is applicable or needed:
there is no floating-point comparison anywhere in this determination, and no ambiguous "close
enough" case can arise. Two implementers given the same pair of scores would classify the pair
identically, with no interpretive step between them.

**The test population: discordant pairs only, ties recorded not dropped.** The test statistic
(below) is computed over the DISCORDANT population — WIN ∪ LOSS pairs — only. TIE pairs carry no
directional information under the null hypothesis that W and B are equally likely to win a
discordant pairing unit, and are excluded from the statistic for exactly that reason: standard
sign-test practice discards zero-differences because a tie is not evidence for either direction.
The tie count is recorded and reported in every run, regardless of outcome — an all-tie or
near-all-tie population is itself a finding (§8's tie-rate ceiling disclosure names the threshold
above which this is disclosed in advance as likely), and is never silently absorbed into either the
numerator or the denominator of the discordant-pair statistic.

**Rejected tie-handling alternative, named and dispositioned.** A stricter sign-test variant splits
ties evenly between the two directions (crediting each tied pair as half a win and half a loss)
rather than discarding them. This design REJECTS that alternative for two reasons, stated plainly:
(1) a tie under this family's binary scoring means both arms produced the identical outcome (both
matched, or both missed) — crediting directional information to an event that by definition carries
none would assert something this design has no evidential basis for; (2) splitting a tie requires
crediting a fractional (0.5) win, which would reintroduce a non-integer value into the win count
`k_w` that this section's own decision rule requires to stay a pure integer end to end — the
split-tie alternative is therefore incompatible with the no-float-anywhere-in-the-decision-path
discipline this design adopts, not merely a stylistic choice against it. Discarding ties (the
adopted rule above) is the only convention compatible with both the evidential and the
integer-arithmetic constraints this design is bound by.

**The decision rule: a pinned integer comparison, two-sided.** Let `n_d` be the discordant-pair
count (WIN + LOSS) and `k_w` the WIN count among them. Under the null hypothesis (W and B equally
likely to win any given discordant pairing unit), `k_w` follows `Binomial(n_d, 0.5)`. Rather than
computing a binomial tail probability at run time — a live floating-point operation this design
forbids end-to-end, mirroring `DUALFIX-STUDY-PREREG.md` §7's own integer-comparison discipline —
the decision rule uses a critical value `c(n_d)`, pinned as a literal integer in §9's table,
computed once at design time as the smallest integer `c` such that
`40 · Σ_{i=c}^{n_d} C(n_d, i) ≤ 2^{n_d}` (the exact combinatorial condition for a per-tail
probability not exceeding 0.025 under `Binomial(n_d, 0.5)`, evaluated in exact integer arithmetic
over binomial coefficients — no approximation, no floating-point tail-probability computation,
ever). The decision rule, evaluated as a pure integer comparison against that pinned table:

- **W-superior:** `k_w >= c(n_d)`. Boundary INCLUSIVE — `k_w` exactly equal to `c(n_d)` counts as
  W-superior, not as indistinguishable.
- **B-superior:** `k_w <= n_d - c(n_d)`. Boundary INCLUSIVE, by the same symmetric construction (the
  lower critical value is `n_d - c(n_d)` by the symmetry of `Binomial(n_d, 0.5)`).
- **Indistinguishable (fail to reject the null):** `n_d - c(n_d) < k_w < c(n_d)`.

**Significance level, and its pinned consequence.** The significance level is `α = 0.05`, two-sided
(a literal number, not "standard α" left implicit) — split as 0.025 per tail in the combinatorial
condition above. §9's critical-value table is this level's pinned consequence: every `c(n_d)` value
in that table is the literal integer computed once, at design time, from the formula above; the
decision rule at data-time never recomputes it and never falls back to a live approximation.

**Evaluated once, from a completed artifact.** The rule above is evaluated exactly once, after the
full battery (§6) has run to completion and every pairing unit has a final, permanent per-arm status
(§4's per-task status discipline) — never from wall-clock elapsed, never from partial progress, and
never re-evaluated after an initial read, mirroring `DUALFIX-STUDY-PREREG.md` §7's own firing
discipline and this project's standing long-inference-operational-risk practice
(`.planning/STATE.md` Blockers/Concerns).

**Seed clustering, addressed head-on.** This project's every prior noise-budget design (DUALFIX §9,
`BI-BATTERY-DESIGN.md` §7) treats six seeds as the replication unit for a t-distribution interval
estimate — but a sign test over discordant PAIRS is naturally task-level, and the battery (§6) draws
ten tasks from each of six seeds, so a real intra-seed correlation threat exists: if a given seed's
ten tickets happen to systematically favour one arm (a property of that seed's own generated
content, not of the mechanism under test), the sixty pairing units are not sixty independent
observations. Three candidate approaches exist, named rather than resolved by omission:

1. **Task-level test with a cluster-robust adjustment** for intra-seed correlation (estimating a
   design effect or intra-cluster correlation coefficient from the observed per-seed counts and
   inflating the variance accordingly).
2. **A stratified test** that computes each seed's own discordant win/loss counts separately and
   combines the six 2x2 strata via a weighted combination (e.g. Cochran-Mantel-Haenszel).
3. **Seed as a blocking factor, with results pooled across blocks** — the battery is constructed in
   six seed-blocks (ensuring balanced representation across seeds, per §6), but the discordant
   win/loss counts are pooled directly across all six blocks into one aggregate `n_d`/`k_w` pair,
   with no data-time adjustment for intra-seed correlation.

**This design adopts option 3.** Options 1 and 2 both require a data-time floating-point
computation — an estimated correlation coefficient or design-effect multiplier for option 1, a
variance-weighted stratum combination for option 2 — that would reintroduce exactly the live
significance computation this section's own decision rule forbids; a design-time-pinned integer
critical-value table (§9) has no closed form that absorbs a data-dependent adjustment computed after
the battery runs. Option 3 keeps the entire decision path integer end to end: pool the raw
discordant counts, compare against the pinned table, done.

**What adoption costs, stated honestly.** The pooled decision rule assumes the discordant pairs are
independent draws from a single `Binomial(n_d, 0.5)` process. If that assumption fails — if
intra-seed correlation is real (some seeds systematically favour one arm across their own ten
tasks) — the true number of independent observations is smaller than the nominal `n_d` the table is
indexed by. This makes the pooled test ANTI-CONSERVATIVE: it will reject the null (declare
W-superior or B-superior) MORE OFTEN than the table's nominal α=0.05 states, because the table
assumes more independent information than the data may actually contain. This bias runs toward
FALSE POSITIVES, not toward missed effects — the opposite of a conservative failure mode, stated
here rather than left for a reviewer to discover. The mitigating disclosure this design adopts:
per-seed discordant win/loss counts are recorded and reported alongside the pooled decision (§8 item
4), so a reviewer can inspect whether the six per-seed breakdowns look homogeneous or whether one or
two seeds are visibly driving the pooled result — a diagnostic, not a correction; the decision rule
itself stays the plain pooled integer comparison regardless of what the diagnostic shows.
