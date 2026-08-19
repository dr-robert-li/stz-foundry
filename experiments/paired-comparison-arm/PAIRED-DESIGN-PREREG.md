# Third-family paired-comparison design — pre-registration

**Revision:** rev 2 — **FROZEN — THIS COMMIT IS THE PRE-REGISTRATION.** Frozen 2026-08-19, after
plan 13-03's five-lane adversarial panel round and plan 13-04's adjudication of every finding it
raised (27 ADOPTED / 7 REJECTED-with-reason, `PAIRED-DESIGN-REVIEWS.md`). No further edit is made
to this document without a recorded amendment entry, per this section's freeze discipline below.

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

**Freeze discipline.** This document carried a five-lane adversarial panel (`gpt-sol-pro`,
`kimi-k3`, `qwen-max`, `gemma4`, `gpt-oss` — D-06), matching the full-discipline panel
`BI-BATTERY-DESIGN.md` and `ANALYSIS-REVIEWS.md` used, not the lighter 3-lane panel
`DUALFIX-STUDY-PREREG.md` ran. Every finding the panel raised was adjudicated exactly once,
`ADOPTED` or `REJECTED-with-reason` — no finding was silently dropped and none was auto-applied
without adjudication (D-07); see §11 for the full outcome. Rev 2 is now frozen, and the freeze
commit's SHA is recorded as a literal string in `docs/JOURNAL.md` so Phase 14 can prove ancestry
with `git merge-base --is-ancestor <freeze-sha> <phase-14-instrument-commit>` without re-deriving
anything. **No edit lands on this document after this freeze except a recorded amendment entry
(D-09) — rev 2 is a one-way door, not a draft that quietly keeps moving.**

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
  vertical — a ticket constructed in the shape of a replay-checkable historical ticket, whose
  resolution is a matchable, verifiable fact by construction, not replayed from an independently
  recorded historical outcome (F-20) — can be built with the **answer-first construction pattern**
  this project has already proven twice:
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
plan's own independent check, not merely carried forward unexamined. No finding in the five-lane
panel (`PAIRED-DESIGN-REVIEWS.md`, plans 13-03/13-04) argued for a different family: at this
document's rev 2 freeze, the selection stands final — `customer-support`'s replay-checkable subset —
never amended by any adopted finding.

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
| task semantics | Reconcile financial/warehouse facts or translate a business question into SQL, on `data-ops`/`bi-analytics` | Match a ticket constructed in the shape of a replay-checkable historical ticket (F-20) to its known, matchable resolution, on `customer-support` — a different vertical entirely, with a different task object (a ticket-resolution match, not a reconciled fact or an executable query) | substantively different |
| oracle implementation | `data-ops`: independent reference interpreter recomputing facts. `bi-analytics`: SQL engine execution diffed against fixture numbers. Both are oracle class `execution + construction` | `customer-support`'s oracle class is `replay + construction`: a resolution-first-constructed ticket, checked against the known resolution it was built from — no execution or interpreter re-derivation step at all | substantively different |
| parser/scoring machinery | `data-ops`: fenced free-text answer parser (strict/relaxed dialects). `bi-analytics`: structured-query executor plus result-set diff | Replay-match scoring: the candidate's proposed resolution is compared against the pre-constructed known resolution for that ticket — neither a fenced free-text parser nor a query-execution diff is involved | substantively different |
| promotion-gate role | Both instruments serve as the phase-5 promotion gate for their own vertical's admission — a corridor-gated accept/reject decision | This phase's instrument is explicitly **not** a promotion gate for `customer-support`'s admission: D-05 bars any corridor requirement anywhere in this design, and `customer-support`'s `VERTICAL_ADMISSION` verdict stays `pending` regardless of this study's outcome (admission is Phase 14's separate REQ-68 decision, made on different evidence). This design is a paired win/loss/tie property measurement (sign test over discordant pairs) between a tournament-selected agent (W) and a baseline unevolved agent (B) — mirroring how `DUALFIX-STUDY-PREREG.md` §2 already distinguished its own property study from a promotion-gate comparison, not reusing the corridor-gated promotion-gate shape at all. **No verdict this study produces — `W-SUPERIOR`, `B-SUPERIOR`, or `INDISTINGUISHABLE` — may be cited as evidence in Phase 14's REQ-68 `customer-support` admission decision (F-19)**; that decision is made on its own separate evidence, never on this study's outcome, mirroring `DUALFIX-STUDY-PREREG.md` §2's own "no verdict here feeds such a gate" clause. | substantively different |

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

**Pinning mechanism, added at freeze (F-15, F-16, F-08).** Both W and B are recorded as committed,
hashable artifacts, not merely as descriptions. W's specific selected configuration is committed
with its own commit SHA at the point the tournament concludes, before the paired battery's pairing
units are drawn or seen by either arm; the data used to select W among the tournament's candidate
configurations is disjoint from this battery's own seeds (1301–1306, §9) — this document states
plainly that W's definition is frozen and independent of the very tasks this study measures it
against, closing the causal gap §5's decision-rule interpretation otherwise leans on. B is likewise
committed as its own artifact — a named author and a commit timestamp that precedes the tournament
run producing W — carrying a stated competence requirement (ordinary competitive human
prompt-engineering effort, not a first-draft minimum) that distinguishes it in substance, not merely
in prose, from the already-rejected s0-minimal floor arm below.

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
two different claims this document keeps separate rather than conflating. F-15, F-16, and F-08
(above) add pinning mechanisms around these identities without changing what W and B *denote* — at
this document's rev 2 freeze, D-03's identities stand confirmed, never amended by any adopted
finding.

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

**Disclosed limitation (F-17).** "Presence or absence of search" itself bundles several sub-factors
that W's arm receives and B's does not — the number of candidate configurations evaluated, the
compute spent, and the opportunity for iterative refinement — any of which could independently
contribute to a measured difference. This design does not decompose those sub-factors, and no claim
made from a W-SUPERIOR or B-SUPERIOR verdict isolates search *per se* from them; resolving that would
require a third arm, out of scope for this two-arm paired design and stated here as a limitation
rather than left implicit.

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

**The pairing unit.** Each task instance is a single ticket, constructed in the shape of a
replay-checkable historical ticket, drawn from the `customer-support` vertical's replay-checkable
subset (§1) — its resolution is a matchable, verifiable fact by construction (the answer-first
composition below), never replayed from an independently recorded historical outcome (F-20). Both
arms (W and B) attempt the identical ticket: same seed, same
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

**The structured-match equivalence rule, pinned (F-33).** A proposed resolution's three fields —
action, category, and resolution-specific parameter — are each compared against the known
resolution's corresponding field using normalized string equality: both strings lower-cased,
leading/trailing whitespace trimmed, and internal whitespace collapsed to a single space, with no
other transformation (no stemming, no synonym table, no set-inclusion or substring match). A field
matches iff its normalized form is identical to the known resolution's normalized form; the
resolution-specific parameter is compared this way per the parameter type the generator pinned,
never partially credited. A proposal matches (category 4) iff all three fields match under this
rule; any field mismatch is a resolution-mismatch (category 3), never a partial score. This is a
normalized-equality contract, deliberately narrower than the barred hypothesis's own fenced
free-text parser or query-execution diff (§2 axis 3) — it performs no free-text parsing and no query
execution, only a field-level string comparison against a pre-composed known value.

**The extraction contract for scoreability, pinned (F-33).** A raw response is classified scoreable
(category 3 or 4) iff it names all three fields — action, category, and resolution-specific
parameter — in a labelled, machine-extractable form (e.g. `action: <value>`, `category: <value>`,
`parameter: <value>`, one per line, case-insensitive labels). Any field left unlabelled, absent, or
ambiguous (more than one candidate value under the same label) reduces the whole response to
non-scoreable (category 2) — never resolved by guessing among ambiguous candidates. This extraction
contract, together with the equivalence rule above, is what makes two implementers classify the same
raw response identically without an interpretive step between them, closing this gap left open at
rev 1.

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

**Asymmetric-exploitability risk, named explicitly (F-32).** If the shared rendering step above
leaves surface regularities in ticket phrasing that correlate with the resolution's structured
fields — templated phrasing per resolution category, the default failure mode of a seeded
deterministic generator — an arm could score a match by recognizing those regularities rather than
by solving the ticket on its merits. This risk is not symmetric: W, tournament-selected against
batteries drawn from the same generator family, may be systematically better positioned than a
hand-written B to learn and exploit such generator-tell regularities, were they to exist — which
would make a W-SUPERIOR verdict a measurement of differential tell-exploitation, not of the
tournament mechanism under test. Phase 14's fidelity-check obligation (above) must specifically test
for and report this asymmetry, not only generic rendering bugs — a distinct, more consequential
exposure than the rendering-fidelity gap alone, disclosed here rather than left for a reviewer to
discover.

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

**Rejected tie-handling alternative, named and dispositioned (F-12, F-13).** A tie-splitting
alternative credits each tied pair as half a win and half a loss, rather than discarding ties. This
is not a stricter version of the adopted discard-tie test (rev 1's framing, corrected at freeze) —
it changes the estimand and, correspondingly, the null distribution the statistic is drawn under; it
is a different procedure with its own decision rule, not the same test made more conservative. This
design REJECTS the tie-splitting alternative for the evidential reason stated plainly: a tie under
this family's binary scoring means both arms produced the identical outcome (both matched, or both
missed) — crediting directional information to an event that by definition carries none would assert
something this design has no evidential basis for. (Rev 1 also cited a second, integer-arithmetic
reason — that splitting a tie would reintroduce a non-integer value into `k_w` — which is false:
doubling every count in the decision path, crediting each tie as exactly 1 in a doubled win count
compared against a doubled critical-value table, keeps every quantity an exact integer. That false
reason is dropped at freeze; the evidential reason above is the sole, sufficient justification.)
Discarding ties (the adopted rule above) is standard sign-test practice for exactly that evidential
reason, and is the convention this design adopts.

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

**Scope of the verdict label, stated explicitly (F-09).** `W-SUPERIOR`, `B-SUPERIOR`, and
`INDISTINGUISHABLE` each state a claim about relative frequency of winning among discordant pairs
only — never a claim about either arm's absolute resolution-match rate. Because concordant both-0
ties (both arms fail) are discarded from `n_d` on the same terms as concordant both-1 ties (both
arms succeed), a battery in which both arms mostly fail can still report a clean W-SUPERIOR or
B-SUPERIOR verdict with no accompanying claim about either arm's absolute accuracy. §10 already
discloses that this design detects direction, not magnitude; this sentence closes the adjacent gap
that disclosure did not separately cover.

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
3. **Pooled test across the battery's seed-blocks, no block-level statistical adjustment** — the
   battery is constructed in six seed-blocks (ensuring balanced representation across seeds, per
   §6), but the discordant win/loss counts are pooled directly across all six blocks into one
   aggregate `n_d`/`k_w` pair, with no data-time adjustment for intra-seed correlation. (Renamed at
   freeze from rev 1's "seed as a blocking factor" — F-04: that phrase implied a block-level
   treatment this option, alone, does not perform. The genuine block-level treatment this design
   actually applies is the required concordance check added below, per F-05.)

**This design adopts option 3 above, together with a required block-level concordance check
(F-05).** Options 1 and 2 both require a data-time floating-point computation — an estimated
correlation coefficient or design-effect multiplier for option 1, a variance-weighted stratum
combination for option 2 — that would reintroduce exactly the live significance computation this
section's own decision rule forbids; a design-time-pinned integer critical-value table (§9) has no
closed form that absorbs a data-dependent adjustment computed after the battery runs. The pooled
comparison keeps the entire decision path integer end to end: pool the raw discordant counts,
compare against the pinned table. Unlike rev 1, the pooled comparison is not adopted alone: an
integer-compatible block-level check that a purely pooled comparison cannot supply is added
alongside it below, so this design is defended against intra-seed correlation without ever computing
a live float.

**Required block-level concordance check, added at freeze (F-05, folding F-06's severity language
and F-26's diagnostic fix).** Alongside the pooled decision above, each of the six seed-blocks (§9:
seeds 1301–1306) is independently classified from its own ten pairing units' discordant win/loss
count as **W-majority** (more discordant wins than losses within that block), **B-majority** (more
discordant losses than wins), or **block-tied** (an equal split, or a block with zero discordant
pairs). Count how many of the six blocks agree with the pooled decision's own declared direction
(W-superior or B-superior). **If at least four of the six blocks agree with the pooled decision's
direction, the pooled verdict stands as reported. If fewer than four agree, the reported decision
downgrades to INDISTINGUISHABLE regardless of what the pooled comparison alone reports** — this
supersedes rev 1's own "the decision rule itself stays the plain pooled integer comparison
regardless of what the diagnostic shows" statement (a §5 statistical-machinery choice this phase's
own plan 13-02 authored, superseded here under D-07's adjudication authority, not a 2026-08-19
STATE.md orchestrator default). The per-seed diagnostic (§8 item 4) is no longer report-only; it
folds into this check as its own decision-rule consequence. This check is a pure integer comparison
— a count of six classifications against a count-of-4 threshold — no float, no live computation,
entirely consistent with this section's integer-arithmetic discipline.

**What adoption costs, stated honestly, with a design-time-derived bound (F-06).** The pooled
decision rule assumes the discordant pairs are independent draws from a single `Binomial(n_d, 0.5)`
process. If that assumption fails — if intra-seed correlation is real (some seeds systematically
favour one arm across their own ten tasks) — the true number of independent observations is smaller
than the nominal `n_d` the table is indexed by. This makes the pooled test ANTI-CONSERVATIVE: it
will reject the null (declare W-superior or B-superior) MORE OFTEN than the table's nominal α=0.05
states. The worst case is bounded, computed once at design time from this design's own 6-seed/
10-task structure, never re-derived at data time: under PERFECT intra-seed correlation (every one of
a seed's ten pairing units resolves identically in direction), the sixty pairing units collapse to
six independent seed-level draws, each seed contributing all ten of its discordant units to one
direction. At the full battery (`n_d = 60`, `c(60) = 39`, lower bound `21`), a seed-level draw
`X ~ Binomial(6, 0.5)` (the count of seeds favouring W) rejects the null at `X >= 4` or `X <= 2`;
`P(X>=4) + P(X<=2) = 0.34375 + 0.34375 = 0.6875` — a worst-case two-sided rejection probability of
**68.75%** under the null, against a nominal 0.05, roughly a 13.75x inflation. This is the ceiling,
not the expected case; genuine partial correlation sits somewhere between the nominal 0.05 and this
0.6875 bound, and the block-level concordance check above is this design's actual defence against
the ceiling case — a battery hitting the extreme collapse this bound describes would fail the
concordance check's four-of-six threshold with high probability, downgrading to INDISTINGUISHABLE
before the pooled anti-conservative bias could produce a false W-SUPERIOR or B-SUPERIOR verdict.
This bias runs toward FALSE POSITIVES, not toward missed effects — the opposite of a conservative
failure mode.

**Compounding with tie-discarding, named (F-07).** Tie-discarding (above) independently reduces
`n_d` and can concentrate directional signal; this design does not claim the seed-pooling and
tie-discarding anti-conservative biases are additive or independent of each other, and neither
disclosure alone captures their combined effect. Both are named here as compounding risks, and the
block-level concordance check above is this design's actual mitigation against their combination —
not a precise combined-magnitude estimate, which this design does not claim to have.

## §6 Qualification — corridor-free, per D-05

Three clauses only, no fourth kind. Each clause below is a data-sufficiency COUNT gate whose
*breach terminates* the study (§7) — a mechanism different in kind from D-05's barred corridor,
which requires an arm's outcome to fall inside a pre-registered numeric window before its
*satisfaction certifies* a result (F-01). See the closing declaration below for this distinction
stated precisely.

**Clause 1 — instrument-health gate.** Before a paired comparison is judged meaningful at all, at
least 48 of the 60 pairing units (§9) must land with BOTH arms in a scoreable category (§4's
resolution-mismatch or resolution-match, combined — never no-artifact or non-scoreable) on that same
pairing unit. A design that cannot clear its own health bar cannot distinguish a real loss from an
unparseable answer: 48/60 is not an arbitrary separate number but the derived joint consequence of
both arms individually clearing Clause 3's own per-arm drop-budget ceiling in the worst case
(non-overlapping drops), per §9.

**Clause 2 — minimum-discordant-pairs floor.** If the observed discordant-pair count (§5, WIN +
LOSS) falls below 20, the study is declared UNDERPOWERED and reports that state as the result —
never a win/loss verdict it cannot statistically support. Twenty is the same floor value this
project's own `DUALFIX_CORPUS_MIN_N` house convention already uses for an underpowered-study check
(`DUALFIX-STUDY-PREREG.md` §4/§8); it is reused here for consistency with that convention, not
independently derived from a power calculation specific to this paired design — disclosed honestly
rather than dressed up as a bespoke figure. This clause can also terminate the study specifically
*because* both arms performed similarly well on this family — a battery where both arms are
genuinely strong produces many both-1 concordant ties, shrinking `n_d` below the floor without
either arm's own attempts being unscoreable (F-03). That is a distinct termination cause from "the
instrument could not produce usable data," and §7's null-result canonization below states the
distinction plainly rather than leaving a reader to conflate the two.

**Clause 2's own power profile, stated rather than left implicit (F-14).** Twenty is reused for
house-convention consistency (above), not independently power-derived for this design; its own
power against a stated plausible true discordant-win probability, computed once at design time from
§9's own pinned critical-value table (`c(20)=15`), is disclosed here rather than left for a reader
to derive: `P(Binomial(20,0.60)>=15)≈12.6%`, `P(Binomial(20,0.65)>=15)≈24.5%`,
`P(Binomial(20,0.70)>=15)≈41.6%`, `P(Binomial(20,0.75)>=15)≈61.7%` — the floor detects only large
true effects, and even a substantial 70%-true-win-probability effect has under 42% power to produce
anything other than a formally-permitted INDISTINGUISHABLE verdict at the floor. Power rises sharply
as the battery fills: at `n_d=40` (`c(40)=27`), the same four probabilities are approximately
21.1%, 44.1%, 70.3%, and 89.7%. An INDISTINGUISHABLE result landing near the floor therefore carries
markedly less evidential weight than one landing near the battery's full size (60); §7's
null-result canonization below states this caveat explicitly.

**Clause 3 — per-arm drop-budget ceiling.** For EACH arm separately, no more than 6 of the 60
pairing units (10%) may land in no-artifact or non-scoreable (combined) for that arm. This ceiling
is reused from the same 10% house convention `BI-BATTERY-DESIGN.md` §6 clause (v) and
`DUALFIX-STUDY-PREREG.md` §8's error budget both already use. A "loss" is never confounded with "the
arm simply produced nothing": an arm that breaches this ceiling has its own run integrity in
question before any win/loss verdict is read from it.

**Harness-fault carve-out (F-22), mirroring `DUALFIX-STUDY-PREREG.md` §6's `onceWithHarnessRetry`.**
A pairing-unit attempt that fails because of a harness or infrastructure fault — the single local
inference slot returning connection-refused, the process being killed, or the server restarting
mid-request — is retried exactly once before counting toward Clause 1 or Clause 3's own thresholds.
This category is distinguished from an arm's own no-artifact or non-scoreable outcome (§4): a
harness fault is a failure of the inference slot itself, never a fact about either arm's proposed
resolution, and this design does not let a single transient inference-slot fault alone trigger this
instrument line's permanent, one-shot termination (§7). A pairing unit that still fails after its
one harness-fault retry counts toward Clause 1/Clause 3 as normal — the carve-out is a single retry,
not an exemption.

**No numeric-window clause — the distinguishing principle, stated precisely (F-01, F-02's
disposition).** This document states plainly: this design contains no numeric-window clause
anywhere in §6 or §7 requiring any arm's mean, rate, or interval estimate to fall inside a
pre-registered numeric window, whatever that requirement might be called. Each of Clauses 1–3's
count values is, arithmetically, expressible as a percentage (80%, one-third, 10% respectively) —
that arithmetic fact alone does not establish the mechanism is not the barred corridor. What
actually distinguishes them is the direction of consequence: D-05's barred corridor is a gate whose
*satisfaction certifies* that a result counts (an arm's outcome must fall inside the window before
the result is admissible), while Clauses 1–3 are gates whose *breach terminates* the study before
any decision-rule outcome exists — none of the three ever certifies a result by an arm's outcome
landing anywhere; they certify only that the battery produced enough usable, scoreable data to run
§5's decision rule at all. This absence is deliberate: that exact mechanism — a corridor
requirement, by whatever name — terminated two prior instrument lines (the v3/v3.1 data-ops
fence-cliff and the bi-analytics structural-complexity cliff), and D-05 exists precisely to remove
it at the root for this third family, not to reintroduce it under different wording. Re-reading the
three clauses above against that bar: Clause 1 and Clause 3 are each a one-sided COUNT ceiling on
how many pairing units land in an unscoreable category — never a bound on a win rate, a mean score,
or any statistic computed from the scoreable-and-matched population. Clause 2 is a one-sided COUNT
floor on the discordant population's size — never a bound on the direction or magnitude of that
population's outcome. None of the three constrains where any arm's aggregate performance must land;
all three constrain only whether the instrument produced enough usable data to run the decision rule
(§5) at all.

## §7 Termination, and the distinct null

**One-shot termination.** If Clause 1, Clause 2, or Clause 3 (§6) is not met, this instrument line —
this specific hypothesis (tournament-selected W versus unevolved baseline B, on `customer-support`'s
replay-checkable subset, as REQ-69's paired round) — TERMINATES. This is a ONE-SHOT termination,
mirroring `BI-BATTERY-DESIGN.md` §10's and `DUALFIX-STUDY-PREREG.md` §8's own one-shot construction:
the prohibition is on SUBSTANCE, not name — no successor instrument testing this same hypothesis on
this same family may be built under any label by changing the qualification thresholds, the battery
construction, the oracle, or the decision rule after this termination. A terminated study reports
its terminal state as the result — never an incomplete study, never remedied by extending the seed
list, redrawing the battery, or re-running an arm mid-study. (A harness-fault attempt is retried
once, per §6's carve-out, before counting toward these clauses — that exemption is a single retry,
never a broadening of what counts as termination, per F-22.)

**A null result is a distinct, separately-defined, legitimate outcome — never confused with
termination.** If §6's three clauses ARE met, the study runs to completion and §5's decision rule is
evaluated exactly once. If that evaluation reads INDISTINGUISHABLE (`n_d - c(n_d) < k_w < c(n_d)`),
this is a NULL RESULT: the instrument was healthy, the discordant population was large enough, the
rule was applied, and the two arms could not be statistically distinguished at α=0.05. This is a
standalone, legitimate finding — the tournament machinery did not measurably outperform (or
underperform) the unevolved baseline on this family, under this decision rule, at this sample size —
never a failed phase and never reported as though the study "could not run." This canonization is
scoped, not unconditional (F-14): an INDISTINGUISHABLE result landing near Clause 2's floor (`n_d`
in the low 20s) carries markedly less evidential weight than one landing near the battery's full
size (60), per §6's own power-profile disclosure above — both are reported as the same NULL RESULT
category, but a reader is pointed to that disclosure rather than left to assume every
INDISTINGUISHABLE outcome carries equal evidential weight.

**The two outcomes, stated so a verifier could never record one as the other.** TERMINATION means
the qualification clauses were not met and the decision rule (§5) was NEVER EVALUATED — the study
could not run. A NULL RESULT means the qualification clauses WERE met, the decision rule WAS
evaluated, and its output was INDISTINGUISHABLE — the study ran and found no significant effect in
either direction. A completed run artifact records exactly one of three terminal states —
`TERMINATED-UNDERPOWERED` / `TERMINATED-HEALTH-GATE-FAILED` / `TERMINATED-DROP-BUDGET-BREACHED`
(all three are termination, corresponding to §6 Clause 2/1/3 respectively) — or `COMPLETE` with a
decision-rule outcome of `W-SUPERIOR` / `B-SUPERIOR` / `INDISTINGUISHABLE` (all three are the study
having run to completion) — so no state artifact conflates a termination reason with a
completed-but-null decision-rule outcome.

## §8 Quantified disclosures

Numbered, each carrying a literal number — no prose promise stands in for one.

1. **Tie-rate ceiling, corrected at freeze (F-23).** If the observed tie rate reaches or exceeds 41
   of the 60 pairing units (68.3%), this design is disclosed IN ADVANCE as likely UNDERPOWERED: a
   tie rate at or above that level leaves fewer than 20 discordant pairs available (`60-41=19 < 20`)
   — this disclosure states the arithmetic consequence of §6 Clause 2's floor before any data
   exists, rather than leaving a reader to derive it themselves. (Exactly 40 ties leaves exactly 20
   discordant pairs, which *meets*, not fails, Clause 2's floor; rev 1 stated 40 as the boundary,
   which was the floor's own value, not the first failing one — 41 is the first tie count that
   actually fails it.)
2. **Significance level and its pinned table.** The decision rule (§5) is evaluated at `α = 0.05`,
   two-sided. §9's critical-value table is this level's pinned consequence — every integer in that
   table is computed once, at design time, from the exact combinatorial condition §5 states, never
   recomputed or approximated at data-time.
3. **Per-arm dominant-failure-mode ceiling, with a required consequence (F-24, F-25).** §2 named
   the residual this family's replay-match oracle cannot close: a "plausible-looking but wrong
   resolution" scores identically to any other resolution-mismatch (§4 category 3), so a high
   resolution-mismatch rate on EITHER arm, even absent any qualification breach, may indicate the
   oracle cannot discriminate this family's true failure surface rather than that the arm is
   genuinely weak. If either arm's resolution-mismatch count, divided by that same arm's own count
   of scoreable attempts (category 3 + category 4, excluding no-artifact/non-scoreable), reaches or
   exceeds 90% of that arm's own scoreable attempts, this is disclosed as evidence the paired
   comparison may be uninformative regardless of what §5's decision rule reports. (Rev 1 expressed
   this as a fixed count, 54 of 60 attempts, which silently assumed zero no-artifact/non-scoreable
   exclusions — corrected here to a rate over the arm's own scoreable population, per F-24.) Unlike
   rev 1, this is no longer purely informational: a breach requires the completed run's reported
   result to carry an explicit oracle-discrimination caveat alongside whatever verdict §5's decision
   rule produces (F-25) — §6 still does not gate on this number (only Clauses 1–3 terminate the
   study), but the reported artifact may no longer state a bare
   W-SUPERIOR/B-SUPERIOR/INDISTINGUISHABLE verdict without this caveat once the threshold is
   crossed.
4. **Per-seed diagnostic, now a decision-rule input (F-26, folded into F-05).** Per §5's
   seed-clustering cost, the six per-seed discordant win/loss counts are recorded and reported
   alongside the pooled decision in every run. Unlike rev 1, this is no longer report-only: §5's
   required block-level concordance check classifies each seed's own win/loss count as W-majority,
   B-majority, or block-tied, and requires at least four of six blocks to agree with the pooled
   decision's direction or the reported result downgrades to INDISTINGUISHABLE — replacing rev 1's
   undefined "disproportionately... one or two seeds" language with a checkable, integer comparison.

## §9 Pinned constants

Every constant §3 through §8 rely on, its literal value, and its provenance — cited from a named
source, or derived here with the derivation shown. This is the table Phase 14's instrument code
transcribes, and the table a later drift guard compares against; a constant used above and missing
here is the defect this table exists to catch.

| Constant | Value | Provenance |
|---|---|---|
| Battery size (pairing units) | 60 | derived: 6 seeds × 10 tasks per seed, matching the house convention `BI-BATTERY-DESIGN.md` §8 and `DUALFIX-STUDY-PREREG.md` §4 both already use |
| Seeds (six, pinned) | 1301, 1302, 1303, 1304, 1305, 1306 | derived: fresh, disjoint from every seed set already used by any prior study in this project (DUALFIX 1201-1206; BI stage-1 101/202/303/404/505/606, stage-2 707/808/909, pretest 999) — chosen following DUALFIX's own incrementing-prefix naming convention, the next unused block |
| Tasks per seed | 10 | derived: matches the house per-seed task count both `BI-BATTERY-DESIGN.md` §1 and `DUALFIX-STUDY-PREREG.md` §4 already use |
| Instrument-health gate floor (§6 Clause 1) | 48 of 60 (80%) | derived: 60 × (1 − 2 × 0.10), the joint consequence of both arms individually clearing the 10% per-arm drop-budget ceiling (Clause 3) in the worst case of non-overlapping drops |
| Minimum discordant-pairs floor (§6 Clause 2) | 20 | cited: reused from `DUALFIX_CORPUS_MIN_N`, `DUALFIX-STUDY-PREREG.md` §4/§8/§9's own underpowered-study floor value, for house-convention consistency, not independently power-derived for this design. Power profile added at freeze (F-14): `P(Bin(20,p)>=15)` ≈ 12.6% / 24.5% / 41.6% / 61.7% at `p` = 0.60 / 0.65 / 0.70 / 0.75 respectively, computed once at design time from `c(20)=15` — see §6 Clause 2 for the full disclosure and the `n_d=40` comparison. |
| Per-arm drop-budget ceiling (§6 Clause 3) | 6 of 60 (10%) | cited: reused from the 10% drop-budget/error-budget convention both `BI-BATTERY-DESIGN.md` §6 clause (v) and `DUALFIX-STUDY-PREREG.md` §8's error budget already use |
| Tie-rate ceiling disclosure (§8 item 1) | 41 of 60 (68.3%) | derived: the smallest tie count whose complement (discordant pairs) falls strictly below the Clause 2 floor of 20 — `60-41=19<20`. Corrected at freeze from rev 1's stated 40 (F-23): exactly 40 ties leaves exactly 20 discordant pairs, which meets, not fails, the floor. |
| Significance level (§5, §8 item 2) | 0.05, two-sided (0.025 per tail) | chosen: a conventional two-sided significance level for this design, not derived from any upstream figure; the per-tail combinatorial condition is derived, shown in §5. Relabelled at freeze from rev 1's "cited: the standard..." framing, which implied an external source this value does not have (F-29). |
| Per-arm dominant-failure-mode ceiling (§8 item 3) | 90% of that arm's own scoreable attempts (category 3 + category 4 combined) | derived: no upstream figure fixes this family's own residual-blindness ceiling; chosen as a high bar (90%) so it flags only the case where an arm is scoring resolution-match on 10% or fewer of its own scoreable attempts, a rate at which the oracle's own discriminating power is itself in question. Corrected at freeze from rev 1's fixed 54-of-60 count framing (F-24), which silently assumed zero no-artifact/non-scoreable exclusions; a breach now requires an explicit oracle-discrimination caveat on the reported verdict (F-25, §8 item 3). |
| Per-tail-significance reciprocal (§5 combinatorial condition) | 40 | derived: `1/0.025`, the reciprocal of the per-tail significance level (half of α=0.05), used directly in §5's combinatorial condition `40 · Σ...` and in this table's own critical-value-table provenance row below (F-28). |
| Attempt discipline (§3 equal-treatment invariant) | exactly 1 resolution proposal per arm per pairing unit | cited: mirrors `DUALFIX-STUDY-PREREG.md` §5's own single-attempt equal-treatment convention, named in §3 above (F-27). |
| Model and model digest (§3 equal-treatment invariant) | pinned by Phase 14's instrument commit, identical across both arms, before any battery run | deferred: no model has been selected at this document's freeze; §3 states the requirement (identical across arms) and Phase 14's own drift-guard obligation (below) must record the literal digest once selected — a constant this document commits to pinning, not a value it can state before Phase 14 exists (F-27). |
| Timeout (§3 equal-treatment invariant) | pinned by Phase 14's instrument commit, identical across both arms, before any battery run | deferred: same discipline as the model-digest row above — Phase 14 pins the literal value, not this document (F-27). |
| Prompt-length bound (§3 equal-treatment invariant) | pinned by Phase 14's instrument commit, identical across both arms, before any battery run | deferred: same discipline as the model-digest row above, mirroring `MAX_DUALFIX_PROMPT_CHARS`'s own pinned-in-code precedent (`DUALFIX-STUDY-PREREG.md` §9) (F-27). |
| Critical-value table (§5 decision rule) | see table below | derived: `c(n_d)` = smallest integer such that `40 · Σ_{i=c(n_d)}^{n_d} C(n_d, i) ≤ 2^{n_d}`, computed once per `n_d` from 20 (the Clause 2 floor) through 60 (the full battery size). Drift-guard obligation added at freeze (F-11): Phase 14's instrument code must carry a drift-guard test (mirroring `test/dualfix-study-prereg-sync.test.ts`) that re-derives every `c(n_d)` value from this formula and checks it against the transcribed table, so a hand-transcription error in any of the 41 rows is mechanically caught rather than silently trusted. |

**Critical-value table, `n_d → c(n_d)`, pinned as literal integers, covering every discordant-pair
count this design can plausibly produce — the Clause 2 floor (20) through the full battery size
(60).** `W-superior` fires iff `k_w >= c(n_d)`; `B-superior` fires iff `k_w <= n_d - c(n_d)` (the
third column, shown for direct lookup); otherwise indistinguishable.

| n_d | c(n_d) (W-superior at or above) | n_d − c(n_d) (B-superior at or below) |
|---|---|---|
| 20 | 15 | 5 |
| 21 | 16 | 5 |
| 22 | 17 | 5 |
| 23 | 17 | 6 |
| 24 | 18 | 6 |
| 25 | 18 | 7 |
| 26 | 19 | 7 |
| 27 | 20 | 7 |
| 28 | 20 | 8 |
| 29 | 21 | 8 |
| 30 | 21 | 9 |
| 31 | 22 | 9 |
| 32 | 23 | 9 |
| 33 | 23 | 10 |
| 34 | 24 | 10 |
| 35 | 24 | 11 |
| 36 | 25 | 11 |
| 37 | 25 | 12 |
| 38 | 26 | 12 |
| 39 | 27 | 12 |
| 40 | 27 | 13 |
| 41 | 28 | 13 |
| 42 | 28 | 14 |
| 43 | 29 | 14 |
| 44 | 29 | 15 |
| 45 | 30 | 15 |
| 46 | 31 | 15 |
| 47 | 31 | 16 |
| 48 | 32 | 16 |
| 49 | 32 | 17 |
| 50 | 33 | 17 |
| 51 | 33 | 18 |
| 52 | 34 | 18 |
| 53 | 35 | 18 |
| 54 | 35 | 19 |
| 55 | 36 | 19 |
| 56 | 36 | 20 |
| 57 | 37 | 20 |
| 58 | 37 | 21 |
| 59 | 38 | 21 |
| 60 | 39 | 21 |

A constant used in the prose but missing from this table (or the constants table above) is the
defect this table exists to catch; none is left out.

## §10 Limitations and residual disclosures

- **No in-repo precedent for this statistical machinery.** The paired win/loss/tie sign test over
  discordant pairs, and its pinned critical-value table, has no predecessor anywhere in this
  project's history — every prior statistical design here (DUALFIX's Stage-B margin, the BI
  battery's corridor/gradient/headroom clauses) is a single-arm rate or a two-arm rate DIFFERENCE,
  never a per-task paired sign test. This document states that plainly rather than letting a
  reviewer discover it; §5's own template is training-knowledge scaffolding for the 5-lane panel
  (13-03) to pressure-test, not a transcription of an already-verified house mechanic.
- **What this design cannot detect.** A sign test over discordant pairs detects only the DIRECTION
  of a difference (does W or B win more discordant pairing units), never its MAGNITUDE — a design
  where W wins discordant pairs by a landslide and one where W wins them by the barest majority
  above the critical value are indistinguishable to this decision rule beyond both reading
  W-SUPERIOR. This design makes no magnitude claim and none should be read into a W-SUPERIOR or
  B-SUPERIOR verdict.
- **What this design assumes.** The pooled decision rule (§5) assumes the sixty pairing units are
  independent draws from a single `Binomial(n_d, 0.5)` process under the null; §5's own cost
  disclosure states plainly that intra-seed correlation, if real, makes the test anti-conservative.
  This is a design-time assumption, not a data-time-verified fact.
- **A replay-match oracle's blind spot, carried from §2.** §2 named this design's inherited
  exposure explicitly: a "plausible-looking but wrong" resolution scores identically to any other
  mismatch under this family's binary oracle. §8 item 3's disclosure names the ceiling above which
  this blind spot is flagged as a likely confound; it is not closed by this design.
- **Single instrument, single family.** This design measures W-vs-B on one family
  (`customer-support`'s replay-checkable subset) only. No claim is made about the tournament
  machinery's performance on any other family, vertical, or task shape.

## §11 Adversarial review and freeze

**The panel.** Five lanes ran per D-06 over the complete rev 1 design (§0–§10), all live, none
dropped: `gpt-sol-pro` (verdict UNSOUND, 38 raw findings), `kimi-k3` (verdict SOUND-WITH-CHANGES,
12 raw findings), `qwen-max` (verdict SOUND-WITH-CHANGES, 5 raw findings), `gemma4` (verdict
UNSOUND, 2 raw findings), `gpt-oss` (verdict UNSOUND, 7 raw findings) — raw total `38+12+5+2+7=64`.

**The merge and adjudication.** The 64 raw findings were merged into 34 globally numbered findings
(47 absorbed into 17 multi-source clusters, `47-17=30` saved; 17 raised by exactly one lane and
carried 1:1; `17+17=34`, reconciled against the raw base as `64-30=34`), each adjudicated exactly
once: **27 ADOPTED, 7 REJECTED-with-reason** — `27+7=34`. The 7 rejections (F-02, F-10, F-18, F-21,
F-30, F-31, F-34) each name a specific decision, standing precedent, or already-frozen text that
answers the finding's own claim; every one of the 27 adoptions is reflected as a change in this
rev-2 document, applied per plan 13-05.

**The substance gate: CLEAR, after adoption.** This phase's own excluded hypothesis, per §2 and the
standing §6/§10 bar: prompt-search vs. hand-written baseline, run as the phase-5 promotion gate, on
`data-ops` or `bi-analytics` specifically, under any label. §2's four-axis mapping clears on all
four axes — three axes (task semantics, oracle implementation, parser/scoring machinery) read
substantively different in kind, not merely in vertical content (F-18 REJECTED, tested against
`RECOMMENDATION.md` §2's own already-adjudicated in-kind standard and found genuine); the fourth
axis (promotion-gate role) carried the panel's one real gap — F-19 (ADOPTED) found the "not a
promotion gate" claim asserted but unenforced, closed above by the explicit no-verdict-feeds-a-gate
clause; F-20 (ADOPTED) additionally corrects the oracle-implementation axis's own framing honesty.
F-21 (REJECTED) — the one finding asserting the pairwise shape alone places this design under the
barred class regardless of vertical — does not survive contact with F-18's and F-19's disposition.

**Full record.** `experiments/paired-comparison-arm/PAIRED-DESIGN-REVIEWS.md` carries the complete
record: every lane's raw findings reproduced verbatim, the merge into 34 global findings, and the
adjudication ledger with a reasoned verdict for every finding. This section states the outcome; that
document is the record.

**The freeze.** Rev 2, carrying every one of the 27 adoptions above, is committed and FROZEN per
§0. The freeze commit's SHA is recorded as a literal string, exactly once, in `docs/JOURNAL.md`,
together with the exact `git merge-base --is-ancestor` command a verifier re-runs rather than
invents, so Phase 14's instrument code can prove ancestry against it without re-deriving anything.
