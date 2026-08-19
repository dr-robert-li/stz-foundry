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
