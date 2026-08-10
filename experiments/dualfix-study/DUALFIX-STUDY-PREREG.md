# DUALFIX property study — pre-registration (light)

**Revision:** 1 (draft-under-review — rev 2 is the frozen revision, produced by plan 11-04's one
adversarial review pass; this document is not binding on any run until rev 2 exists).

## §0 Status and freeze discipline

This is REQ-61's light study prereg. It governs the whole DUALFIX property study: what "failing"
means, what the control arm is, how many candidates, which seeds, the exact inequality Phase 12's
autonomous gate evaluates, when the study stops, and how per-task status is accounted. Every
judgement call this milestone needs pinned lives here or nowhere.

**Freeze discipline.** Rev 1 (this document) is a draft, produced before any study data exists.
Plan 11-04 runs exactly one adversarial review pass over it; every finding is adjudicated ADOPTED
or REJECTED-with-reason (`PREREG-REVIEWS.md`), and the resulting document is committed as rev 2.
Rev 2 is FROZEN — no further edits after that commit. The freeze commit must be a strict git
ancestor of Phase 12's corpus-pin commit (REQ-63), proven by `git merge-base --is-ancestor
<rev2-commit> <corpus-pin-commit>` returning success, never asserted by convention or commit-order
narrative alone.

**Compliance table (added by plan 11-03 Task 2).** One row per REQ-61 enumerated content item and
per ROADMAP Phase 11 Success Criterion 1 item, naming the section that satisfies it.

| REQ-61 / SC1 item | Satisfied by |
|---|---|
| Repair-rate metric on failing L3 candidates | §6 |
| Naive-retry control arm on the same failing candidates | §5 |
| n / seeds / candidate-corpus construction rule | §4 |
| Stage-B trigger threshold, explicit inequality | §7 |
| Termination clause | §8 |
| Per-task status discipline | §6 |
| Provenance pin (SHORTLIST A-03/S-03, SURVEY E-03) | §1 |
| Standing-bars statement (§6/§10 untouched, substance not name) | §2 |
| Failure-class mapping (D-07) | §3 |
| Disclosures and limitations | §10 |

**Self-audit record (Task 2).** Every row above was checked by reading the named section's actual
text against REQ-61's enumerated list and ROADMAP.md Phase 11 Success Criterion 1, not assumed
from the table alone. Confirmed by re-reading: §7 states both the human-readable and the mechanical
integer forms of the trigger and the inclusive-boundary case explicitly; §8 names both termination
conditions with their pinned constants; §4's eligibility predicate (`gradedScore === 0` exactly) is
numeric, never category-name based; §2 names both `data-ops` and `bi-analytics` and uses the
`substance not name` phrase verbatim. No gap was found; rev 1 remains as authored, unamended beyond
this audit record.

## §1 What this study tests, and what it does not

**Provenance.** This study's method choice is pinned to `experiments/method-research/SHORTLIST.md`
entries A-03 and S-03 ("From Failing to Passing (DUALFIX)") and to
`experiments/method-research/SURVEY-2026-08.md` entry E-03 ("From Failing to Passing: Evolving
Natural Language Prompt Optimization Rules for LLM Code Generation"). No new mechanism is invented
here; the study measures the property those documents already attribute to the method.

**What is tested.** A single, fixed-attempt, execution-feedback repair informed by a
specification-versus-implementation failure split, applied once per failing candidate. This is a
direct implementation of the mechanism SHORTLIST.md A-03/S-03 credits with the α>0
injection/preservation claim — specification-vs-implementation-aware repair on a code artifact.

**What is NOT tested.** This study does NOT run the published method's offline rule-evolution
search. No corpus of natural-language transformation rules is evolved here; no rule set is
produced or persisted; and the published method's zero-shot cross-model transfer claim ("rules
evolved on one model transfer to other models without any re-optimization") is therefore not under
test in any form — there is no rule set to transfer. What this study measures is narrower and
more local: does execution-feedback repair with a spec/impl-aware label improve the repair rate on
a fixed local model, in a single attempt, relative to a naive-retry control on the same candidates.

**The E-03 labelling ambiguity, disclosed.** SURVEY-2026-08.md's E-03 entry describes the source
paper as combining "a reusable set of natural-language prompt-transformation rules ... with
execution-feedback repair (DUALFIX)." The parenthetical `(DUALFIX)` is grammatically ambiguous: it
could name the whole two-part method (rule-evolution plus execution-feedback repair together), or
it could name only the execution-feedback-repair component the parenthetical is directly attached
to. This document adopts the narrower reading — `DUALFIX`, as implemented and studied here, names
the execution-feedback-repair component alone — because that is the claim the code
(`dualfixMutate`) actually supports. Reading the parenthetical as naming the whole method would
overstate what this study measures; the narrower reading is disclosed explicitly here rather than
inherited silently, per D-05.

## §2 Standing bars

The hypothesis under test in this study is a method PROPERTY — the repair rate DUALFIX-style
execution-feedback repair achieves on genuinely failing L3 candidates, against a naive-retry
control on the identical candidates. This is explicitly NOT the promotion-gate comparison the
§6/§10 standing bars forbid for data-ops or bi-analytics under any label, by substance not name —
this study does not compare a prompt-search instrument against a hand-written baseline as a
phase-5 promotion gate for either vertical, and no verdict here feeds such a gate.

The study runs on the idle, mechanically-validated BI battery (the L3 instrument from the
terminated bi-analytics-pilot line) under the diagnostics/different-hypothesis carve-out: the
battery's generation and oracle machinery are reused as a source of already-graded, already-scored
candidates to repair, not as a re-run of the barred promotion-gate hypothesis. The BI generator
(`BI_ANALYTICS_GENERATOR_ID`) remains UNACCEPTED throughout this study — corpus construction uses
a direct/test-seam construction route that does not require `ACCEPTED_GENERATORS` membership and
does not add the generator id to that table. `generateBiBattery`'s accepted-generator gate is
never invoked or bypassed by this study; the corpus is built through a separate, unaccepted path.

## §3 The failure-class mapping

D-07 states the specification-level / implementation-level mapping onto the BI oracle's own
zero-decomposition categories (`BI_ZERO_DECOMPOSITION_CATEGORIES`, `src/foundry/bi-oracle.ts`)
explicitly, so no downstream code has to infer it:

- **implementation-level** = `no-artifact` UNION `non-executable-artifact` — the candidate either
  produced no extractable SQL artifact, or produced one that fails to execute (a syntax error or
  any engine-rejected statement). Both are failures of getting a well-formed, runnable artifact
  onto the page at all — an implementation problem, not a business-logic problem.
- **specification-level** = `executes-but-wrong` — the artifact executes successfully but its
  graded score is below 1.0 (partial or zero result-set overlap with the known answer). The query
  runs; it encodes the wrong business logic. This is a specification problem: the candidate
  understood how to write SQL, not what SQL to write.
- **`correct`** (graded score = 1.0) is not a failure and is never eligible for repair (§4).

This mapping is stated as an explicit sentence, not assumed, because inventing a fresh split or
silently renaming the oracle's existing four categories would both violate the no-invented-mechanism
requirement. The precedent for this exact framing is `experiments/method-research/PREREG-DRAFT.md`
§1's own language, quoted directly: DUALFIX's "own specification-vs-implementation failure split
gives the future arm's evaluation design a starting vocabulary for separating 'the query is
malformed' from 'the query runs but encodes the wrong business logic.'" This document's D-07
mapping is that same distinction, applied mechanically to the oracle's own category names rather
than re-derived as a new interpretation.

## §4 Corpus construction rule

**Level.** `L3` only — the BI battery's third structural-complexity level (one JOIN plus one
aggregation), the level the terminated bi-analytics-pilot pretest screen measured at mean graded
score 0.500, n=10, seed 999 (`experiments/bi-analytics-pilot/TERMINAL-REPORT.md`).

**Seeds.** Six fresh seeds, pinned: `DUALFIX_STUDY_SEEDS = [1201, 1202, 1203, 1204, 1205, 1206]`.
These are deliberately disjoint from every seed already used by the bi-analytics-pilot line —
`BI_PRETEST_SEED` (999), the six stage-1 seeds (101, 202, 303, 404, 505, 606), and the three
stage-2 fresh seeds (707, 808, 909) — so no candidate whose score is already published in
`PRETEST-SCREEN.md` or any bi-analytics-pilot artifact can enter this study's corpus. This is
RESEARCH.md Open Question 1's recommendation, adopted as a binding decision.

**Draw order.** Seed order (1201 first, then 1202, ... 1206), then task index within each seed
(ten L3 tasks per seed, following the BI battery's own per-seed task numbering). Candidates are
drawn in this fixed order until the target n is reached; the order is never re-derived or
shuffled after data exists.

**Eligibility predicate.** A "genuinely failing L3 candidate" is `gradedScore === 0` exactly — a
numeric predicate read directly from `categorize()`'s own return value (`BiCategorizeResult.
gradedScore`), never a category-name predicate. Explicit note: an `executes-but-wrong` result with
partial row/column overlap (`0 < gradedScore < 1`) is NOT eligible — only a zero-overlap result
qualifies. This keeps the corpus restricted to candidates that gained nothing from their baseline
attempt, the cleanest test bed for a repair-rate measurement.

**Target and minimum n.** Target corpus size `DUALFIX_CORPUS_TARGET_N = 30`; minimum
`DUALFIX_CORPUS_MIN_N = 20` (§8 termination clause). Six fresh seeds at ten L3 tasks each yield
sixty baseline candidates; at the pretest screen's observed mean 0.500 at L3, sixty candidates are
expected to yield well above 30 eligible (`gradedScore === 0`) candidates, while 20 is the floor
below which the study is declared underpowered rather than reporting an unsupportable rate.

**Construction route.** The corpus is built through a direct construction route — the baseline
arm's own attempts are materialized and scored against the BI oracle's existing scoring path
(`categorize`, `gradedScore`) without ever calling `generateBiBattery`'s accepted-generator gate
and without registering the BI generator id in `ACCEPTED_GENERATORS`. This is the
test-seam/direct-construction route REQUIREMENTS.md's standing bar names; the study prereg (this
document) is what defines it, per that requirement.

**Corpus is pinned once.** Once the corpus reaches its target (or is closed at the minimum per
§8), it is pinned — committed to a state artifact — before either repair arm runs. Both arms see
the identical, unmodified corpus; the corpus is never re-drawn or extended after either arm has
begun.

**Corpus record shape.** Each corpus entry records, per candidate: the seed, the task index within
that seed, the candidate's own status (`ok` / `timeout` / `error`), the verbatim raw response text,
the extracted SQL artifact (or null), the zero-decomposition category, the graded score, any
engine error text, input/output tokens, and wall-clock time — the same fields §6's per-task status
discipline requires, recorded once at corpus-construction time and carried forward unchanged into
both arms' own per-task records.

## §5 The two arms

**The DUALFIX arm.** The candidate is shown: the original task (schema, business question, output
contract), its own prior failed artifact (echoed verbatim; omitted if the prior attempt produced no
artifact — the no-artifact case is a `null` field, never a placeholder string), the D-07 failure-
class label computed from that prior attempt's zero-decomposition category, and execution feedback
(the engine error text if the prior artifact was non-executable, or a statement that the query ran
but returned the wrong result if it was executes-but-wrong). One repair attempt is generated.

**The naive-retry control arm (D-01).** The candidate is shown: the same original task question,
the same candidate's own failed artifact echoed verbatim under the identical omit-when-null rule as
the DUALFIX arm, plus one fixed generic try-again line (e.g. "Your previous answer was incorrect.
Please try again."). No failure-class label. No execution feedback. One repair attempt is
generated.

**Isolation rationale.** Echoing the artifact in BOTH arms is what makes the two arms' information
sets differ only by the mechanism under test (failure-class label plus execution feedback) rather
than also by whether the model has seen its own prior attempt at all — if only the DUALFIX arm saw
the prior artifact, any measured difference would be confounded by that visibility gap rather than
isolating the repair mechanism.

**Rejected control designs, named and dispositioned:**

- **Pure stochastic resample** (re-run the original prompt with a different sampler seed, no
  reference to the prior failure at all) — rejected because it tests nothing about repair; a
  stochastic resample measures baseline variance, not whether feedback of any kind improves the
  outcome, and would not isolate the DUALFIX mechanism from mere retry luck.
  - **Bare try-again with no artifact echoed** (the fixed generic line alone, without showing the
  candidate its own prior attempt) — rejected because it would confound "did the model see its own
  failure" with "did the model receive execution feedback," breaking the isolation rationale above;
  a control that withholds the artifact is testing a different, weaker baseline than the one that
  isolates the mechanism under test.

**Equal-treatment invariant.** Both arms use the same model, the same absent sampler overrides
(no arm-specific temperature or sampling parameter), the same timeout, the same prompt-length bound
(`MAX_DUALFIX_PROMPT_CHARS`), the same single-attempt discipline (D-03 — exactly one repair attempt
per arm per candidate), and the same scoring path (`categorize`/`gradedScore`, independently
applied to each arm's repaired artifact). Any asymmetry beyond prompt content between the two arms
is a confound and is not permitted by this design.

## §6 Metric and per-task status discipline

**Repair rate, defined.** An exact integer pair: repaired over attempted. "Repaired" means the
re-scored `gradedScore` of the arm's repaired artifact equals 1 exactly, against a freshly
materialized per-candidate database handle, graded by the same independent BI oracle that scored
the original (pre-repair) attempt — the oracle never grades its own output twice against a stale
handle, and the repair arm never self-grades.

**Denominator rule (D-12).** The primary repair rate counts every attempted candidate in the
corpus. A `timeout` or `error` unit is a non-repair and is NEVER excluded from the denominator —
excluding failed-to-run units would inflate the apparent rate by discarding exactly the outcomes
most likely to reflect a real limitation. An `ok`-only sensitivity figure (repaired over
`ok`-status attempts only) is reported alongside the primary rate for context, but the Stage-B
gate (§7) reads only the primary, full-denominator rate.

**Per-task status discipline.** For every candidate, in both arms, the following is recorded and
read BEFORE any aggregate figure is computed: status (`ok` / `timeout` / `error`), the verbatim raw
response text, the extracted artifact, the zero-decomposition category, the graded score, any
engine error text, input/output tokens, and wall-clock time. Aggregates (repair rate, Stage-B
arithmetic) are derived from this per-task record, never computed ad hoc from a partial or
in-memory-only tally.

**Harness-fault retry is not a study outcome.** A candidate that dies to a harness fault
(connection refused, server restart, kill) is retried exactly once per the study driver's own
no-redraw discipline, and the retry is logged in state; this harness-level retry is a different
thing entirely from the naive-retry CONTROL ARM (§5) and is never counted as, or confused with, a
study outcome — it is infrastructure recovery, not a repair attempt.

## §7 The Stage-B trigger inequality

**Human-readable form.** Stage B opens if and only if the DUALFIX arm's repair rate minus the
naive-retry control arm's repair rate is greater than or equal to 0.15.

**Integer evaluation rule.** Because both arms run on the identical corpus, they share one
denominator — `n`, the common attempted-candidate count. Let `kD` be the DUALFIX arm's repaired
count and `kC` be the naive-retry control arm's repaired count. Using the pinned constants
`DUALFIX_STAGE_B_MARGIN_NUM = 3` and `DUALFIX_STAGE_B_MARGIN_DEN = 20`, the general integer form
is:

```
DUALFIX_STAGE_B_MARGIN_DEN * (kD - kC) >= DUALFIX_STAGE_B_MARGIN_NUM * n
```

which, substituting the pinned literals, is:

```
20 * (kD - kC) >= 3 * n
```

This is evaluated in pure integer arithmetic — no float comparison, no rounding, no tie-breaking
policy is ever required at the decision point, because `20`, `3`, `kD`, `kC`, and `n` are all
integers by construction (`kD`, `kC` are repaired counts; `n` is the common attempted count).

**Boundary behaviour, stated plainly.** The comparison operator is `>=` (greater than or equal):
the boundary case is INCLUSIVE. An observed difference of exactly `0.15` — i.e. `20 * (kD - kC) ==
3 * n` exactly — FIRES the gate. Illustrating with the minimum corpus size `n = 20` (so `3 * n =
60`): a difference of `kD - kC = 3` gives `20 * 3 = 60 >= 60` — the gate FIRES at exactly the
threshold. One step short, `kD - kC = 2`, gives `20 * 2 = 40`, which is `< 60` — the gate does NOT
fire. One step over, `kD - kC = 4`, gives `20 * 4 = 80 >= 60` — the gate fires, more clearly. No
float comparison and no rounding or tie-breaking policy is ever needed at the decision point; the
integer form above resolves every case, including the exact-threshold case, without ambiguity.

**Where 0.15 comes from.** The margin is not invented for this study. It is the resolvable
two-arm difference floor this project already adopted for a difference-of-two-measurements claim —
the √2 error-propagation correction for comparing two independent six-seed clusters, recorded as
F-08 in `experiments/method-research/ANALYSIS-REVIEWS.md` (the panel finding that corrected the
noise-budget arithmetic for two-arm difference propagation, raising the disclosed resolvable
gradient floor to 0.15 from a naive, uncorrected ≈0.10–0.11 half-CI-width reading). This study
reuses that same floor for its own two-arm (DUALFIX vs naive-retry) difference claim rather than
deriving or asserting a fresh number.

**Firing discipline.** The gate auto-fires or auto-refuses; it never auto-accepts on a miss. A
miss — the inequality not holding — is a standalone finding, reported in `STUDY-RESULTS.md` exactly
as a hit would be, never remedied by adjusting the threshold, the arms, n, or the seed list after
observing data.

## §8 Termination clause

D-11's two conditions, either of which terminates the study before a verdict is reported:

1. **Underpowered corpus.** Fewer than `DUALFIX_CORPUS_MIN_N = 20` eligible (`gradedScore === 0`)
   candidates exist after the full pinned seed list (`DUALFIX_STUDY_SEEDS`, all six seeds, sixty
   baseline draws) is exhausted. The study is declared underpowered and reports that state as the
   result — it does not report a repair rate it cannot statistically support.
2. **Error-budget breach.** More than `DUALFIX_ERROR_BUDGET_NUM / DUALFIX_ERROR_BUDGET_DEN` (1/10)
   of an arm's attempted units land in `error` status (as distinct from `timeout`, which is a
   measurement, not an error). An arm whose error rate exceeds this budget has its own run
   integrity in question, and the study terminates rather than reporting a rate built on an
   unreliable run.

**Neither condition is ever remedied by extending the seed list, re-drawing the corpus, or
re-running an arm mid-study.** A terminated study reports its terminal state as the result, exactly
as a Stage-B miss does — a legitimate, pre-registered outcome, never an incomplete study.

## §9 Pinned constants

The single source of truth for every number in this document is the exported constants in
`experiments/dualfix-study/_dualfix-arms.ts` (and `src/foundry/dualfix.ts` for the prompt bound).
This table mirrors those exports so a drift test (plan 11-05,
`test/dualfix-study-prereg-sync.test.ts`) can compare the two and fail on any mismatch.

| Value | Exported symbol | File |
|---|---|---|
| `[1201, 1202, 1203, 1204, 1205, 1206]` | `DUALFIX_STUDY_SEEDS` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `"L3"` | `DUALFIX_LEVEL_ID` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `30` (target corpus n) | `DUALFIX_CORPUS_TARGET_N` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `20` (minimum corpus n) | `DUALFIX_CORPUS_MIN_N` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `3` (Stage-B margin numerator) | `DUALFIX_STAGE_B_MARGIN_NUM` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `20` (Stage-B margin denominator) | `DUALFIX_STAGE_B_MARGIN_DEN` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `1` (error-budget numerator) | `DUALFIX_ERROR_BUDGET_NUM` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `10` (error-budget denominator) | `DUALFIX_ERROR_BUDGET_DEN` | `experiments/dualfix-study/_dualfix-arms.ts` |
| `4000` (repair-prompt character bound) | `MAX_DUALFIX_PROMPT_CHARS` | `src/foundry/dualfix.ts` |

## §10 Disclosures and limitations

- **Narrowed mechanism (§1).** This study runs execution-feedback repair with a spec/impl-aware
  label, not the published method's offline rule-evolution search. No cross-model transfer claim
  is under test.
- **Single-model, single-slot setting.** The study runs against one local model on one Ollama
  inference slot. No cross-model comparison exists in this design; a repair rate measured here is
  specific to that model and cannot be read as evidence about any other model.
- **Small n and what it can/cannot resolve.** Target n=30 (minimum 20) is sized to resolve a
  0.15 two-arm difference (§7) at the corresponding statistical floor; it is not sized to resolve
  smaller differences, and a result near but below the threshold is reported as a miss, not as
  "nearly a hit."
- **Single instrument, single difficulty level.** The corpus is drawn from one instrument (the BI
  battery) at one difficulty level (L3). No claim is made about repair rates at other levels or on
  other task families.
- **The E-03 labelling ambiguity (§1).** Carried forward here as a limitation: the narrower
  reading of the source survey's `(DUALFIX)` parenthetical is this document's own interpretive
  choice, disclosed rather than hidden.
- **Failure classification and grading share an oracle family, disclosed as acceptable.** The
  DUALFIX arm's own failure-class label (§3, §5) is supplied by the same BI oracle family
  (`categorize`) that also grades the repaired outcome. This is acceptable because the
  classification is only an INPUT to the repair prompt — it never influences what "correct" means —
  while the grading of the repaired artifact is performed independently, on the repaired artifact
  alone, against the reference result, using the identical scoring path both arms and the original
  baseline attempt already use. No self-grading occurs at any point.

## §11 Adversarial review and freeze

`PREREG-REVIEWS.md` (plan 11-04) is the record of this document's one adversarial review pass.
Every finding raised there is adjudicated ADOPTED or REJECTED-with-reason; adopted-finding and
rejected-finding counts reconcile against the panel's own finding count, the same discipline this
project's other adversarial panels follow. The output of that review, incorporating every ADOPTED
change, is committed as rev 2 — the frozen revision this study actually runs under. Rev 2's freeze
commit is a strict git ancestor of Phase 12's corpus-pin commit, provable by `git merge-base
--is-ancestor`, per §0. This section is a placeholder in rev 1; plan 11-04 fills in the outcome and
the freeze commit hash here, so rev 2 is an edit of this section rather than a restructure of the
document.
