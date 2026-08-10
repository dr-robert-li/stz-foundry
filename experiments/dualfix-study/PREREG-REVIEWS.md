# DUALFIX study pre-registration — adversarial review (plan 11-04)

**Subject document:** `experiments/dualfix-study/DUALFIX-STUDY-PREREG.md`, revision 1
(blob `d77d949a56dbd263ca18f5093c582118255d7d44`).

This is REQ-61's ONE adversarial review pass (D-15) — every reviewer configured in
`.planning/config.json` `review.default_reviewers` runs once, in a single round, against rev 1. No
second round, no re-review of rev 2.

**Invocation-path note.** All three lanes ran through the house review-lane seam
(`gsd-tools.cjs review-lane invoke --slug opencode --model <id> --as <name>`), with
`~/.opencode/bin` prepended to PATH, exactly as `experiments/method-research/ANALYSIS-REVIEWS.md`
records for its own three openrouter lanes. All three succeeded on the first attempt — no lane
needed the direct-CLI fallback described in the plan. The composed review prompt (embedding
`DUALFIX-STUDY-PREREG.md` rev 1 in full, plus seven named attack surfaces drawn from this plan's
`<action>` block) was written to a run directory under the system temp dir as
`gsd-review-prompt.md` and passed to each invocation via `--prompt-file`; it was never committed.

**Panel:** gpt-sol-pro (UNSOUND), kimi-k3 (SOUND-WITH-CHANGES), qwen-max (UNSOUND). Three of three
configured lanes produced output; no lane was dropped.

**Dead lanes:** None. Every lane named in `review.default_reviewers` (gpt-sol-pro, kimi-k3,
qwen-max) is live and accounted for above with a verdict and findings below. This run was not
concurrent (lanes ran sequentially, per the seam's own rate-limit-avoidance comment), so no
mid-pass failure occurred to record.

**Finding counts.** gpt-sol-pro: 10 findings (F1-F10). kimi-k3: 9 findings (F1-F9; two additional
"no finding" statements under attack surfaces 3 and 7 are recorded as explicit non-findings, not
counted). qwen-max: 6 findings (F1-F6; three additional "no finding" statements under attack
surfaces 2, 6, and 7 are recorded as explicit non-findings, not counted). **Total: 25 findings**
across the three lanes, before merging in Task 2.

## Review prompt

The full composed prompt is reproduced here in summary; the complete text (including the embedded
rev-1 document) lived at the run directory's `gsd-review-prompt.md` and was not committed. The
prompt's seven named attack surfaces, verbatim from the instructions given to each lane:

1. The Stage-B trigger threshold cannot auto-refuse (§7's integer inequality, evaluability and
   boundary honesty for every `(kD, kC, n)` the corpus rule can produce).
2. The naive-retry control arm does not isolate the mechanism under test (§5's arm designs, any
   asymmetry beyond the claimed mechanism).
3. The eligibility predicate admits the wrong population (§4's `gradedScore === 0` predicate,
   corpus contamination defenses).
4. The termination clause permits unlimited extension (§8's two conditions, gameability).
5. The provenance claim is stronger than the code supports (§1's narrower E-03 reading versus
   what other sections claim).
6. The denominator rule can silently inflate the repair rate (§6's D-12 rule, enforced everywhere
   the rate is used, including §7).
7. Drift toward the barred promotion-gate comparison (§2's standing-bars statement, substance not
   name).

Each lane was asked to open with exactly one `**Verdict: X**` line (`SOUND` /
`SOUND-WITH-CHANGES` / `UNSOUND`), number its own findings locally (`F1`, `F2`, ...), state
explicitly when it found nothing under one of the seven attack surfaces rather than omitting it,
and close with one **Assessment** paragraph. Findings are reproduced faithfully below, under each
lane's own heading, in the lane's own numbering.

## Reviewer: gpt-sol-pro

**Verdict: UNSOUND**

**F1. §5 does not guarantee that both arms receive the same original task information.** The
DUALFIX arm receives "the original task (schema, business question, output contract)," while the
control receives only "the same original task question." Read literally, the control may omit the
schema and output contract. That would allow DUALFIX to win because it receives a more complete
task specification, not because of the failure-class label or execution feedback. The control must
receive the identical serialized original-task block.

**F2. §5 leaves both interventions mutable after outcomes are knowable.** The supposedly fixed
control line is specified only by an example, "e.g.," while the DUALFIX feedback for
`executes-but-wrong` is merely "a statement" with no exact text or serialization. The ordering,
delimiters, label wording, and treatment of engine-error text are also unpinned. Those choices can
materially alter model behavior and give the author room to tune one arm while still claiming
compliance. Exact prompt constructors or byte-level templates must be frozen before corpus outcomes
exist.

**F3. §5's equal prompt-length bound does not establish equal treatment.** The DUALFIX prompt is
necessarily longer, but the document never defines whether over-bound prompts are rejected,
truncated, or compacted, nor which content is removed. Different truncation or rejection behavior
could alter the task, artifact, or feedback presented to either arm. "Same bound" is not enough;
overflow behavior and arm-validity consequences must be deterministic and identical.

**F4. §4 overstates `gradedScore === 0` as the population of "genuinely failing" candidates.** The
oracle itself treats every score below 1 as incorrect, and §3 explicitly classifies partially
correct executions as `executes-but-wrong`, yet §4 excludes all `0 < gradedScore < 1` candidates.
The resulting estimand is repair among zero-credit failures, not repair among failing L3 candidates
generally. Selecting only catastrophic failures may particularly favor an intervention carrying
diagnostic feedback. The title, hypothesis, metric, and conclusions must use the narrower
population, or all incorrect candidates must be eligible.

**F5. §4's seed-disjointness claim is stronger than the stated defense.** Different seeds prove
only that the seed identifiers differ. They do not establish that generated task instances,
schemas, business questions, or other candidate content cannot duplicate or closely reproduce
material from the published pretest. No task-identity or content-fingerprint check is required.
Consequently, "so no candidate whose score is already published ... can enter" does not follow from
seed disjointness alone.

**F6. §7 and §8 contain conflicting gate semantics for an error-budget breach.** Section 7 says
Stage B opens "if and only if" the inequality holds and describes the gate as mechanically
auto-firing, but the inequality has no validity guard for §8. An arm can exceed the error budget
while still producing counts satisfying `20 * (kD - kC) >= 3 * n`. Section 8 says such a study
terminates before a verdict, but it does not replace §7's "if and only if" rule with a composite
condition or specify mechanical precedence. The autonomous trigger must first require a valid,
non-terminated study state.

**F7. §8 does not define when the error-budget condition is evaluated.** "More than 1/10 of an
arm's attempted units" can mean after every attempt, after an arm completes, or after both arms
complete. Under continuous evaluation, the first error produces a 100% breach and terminates
immediately; under final evaluation, later successful attempts can dilute an earlier breach. The
latter interpretation lets the run continue past a state that the former says terminated. The exact
checkpoint and integer comparison must be pinned.

**F8. §6 and §8 leave outcome classification subject to discretionary relabeling.** A model-facing
failure may be recorded as `error`, `timeout`, or a "harness fault"; only `error` counts toward
termination, timeout remains a denominator failure, and a harness fault is retried and excluded as
an outcome. No exhaustive, mechanically testable classification predicate distinguishes these
states. Reclassifying failures as harness faults can both evade the error budget and remove an
unfavorable invocation from the primary denominator. Error codes, retry eligibility, and treatment
of a failed first invocation must be frozen mechanically.

**F9. §7's justification for the 0.15 threshold does not match this design.** It imports a "√2
error-propagation correction" for two independent six-seed measurements, but this study is paired
on identical candidates, stops after a target number of eligible outcomes, and may draw highly
unequal numbers of candidates from the six seeds. The gate operates on candidate counts while the
cited rationale concerns seed-cluster measurements. Section 10 then incorrectly says `n=20-30` is
"sized to resolve" 0.15 without a power calculation, variance model, or clustered/paired analysis.
The integer inequality is evaluable, and its inclusive `n=20` example is arithmetically honest, but
the claimed statistical provenance for that threshold is not.

**F10. §1 reaches beyond what `dualfixMutate` can establish.** After conceding that the published
rule-evolution method is absent, the document calls the local intervention a "direct
implementation" of the mechanism credited with the α>0 injection/preservation claim and says no new
mechanism is invented. A one-shot labeled repair prompt may be inspired by one component, but code
implementing one repair attempt cannot establish that it implements the paper's broader mechanism
or inherits its theoretical claim. The study must describe the intervention as a local analogue
without claiming direct implementation or inherited α>0 provenance.

No additional finding under attack surface 1 (Stage-B threshold evaluability): for every corpus
size permitted by §4, the inequality itself is defined in integer arithmetic, and the inclusive
boundary example is correct. The defect is the missing termination guard (F6), not arithmetic
auto-refusal.

No additional finding under attack surface 6 (denominator rule) beyond F8: if every corpus
candidate receives exactly one recorded arm outcome and only objectively defined infrastructure
retries are excluded, §§6-7 consistently use the common full denominator `n`.

No finding under attack surface 7 (barred promotion-gate drift): as written, the study compares two
repair prompts rather than a prompt-search instrument against a hand-written baseline, keeps the
generator unaccepted, and states that the result does not feed the barred promotion gate. On the
document's stated use, the distinction is substantive rather than merely nominal.

**Assessment:** The draft leaves decisive researcher freedom in the exact arm prompts, failure-
status classification, retry exclusion, and timing of termination, while §7's unconditional "if and
only if" trigger can mechanically open Stage B after §8 should have voided the study. It also
overgeneralizes a zero-credit-only corpus and borrows statistical and DUALFIX provenance that do
not fit the actual paired, one-shot design. These are pre-data fixable, but freezing the document
as written would not bind the author tightly enough to prevent a preferred Stage-B outcome.

## Reviewer: kimi-k3

**Verdict: SOUND-WITH-CHANGES**

**F1 — §8 termination checks have no pinned ordering against the §7 gate, so the trigger can read a
result §8 voids.** §8 says an arm whose error rate exceeds 1/10 causes the study to "terminate
rather than reporting a rate built on an unreliable run," and §7 says the gate fires or refuses
mechanically. Nowhere is it stated that the per-arm error-budget check is evaluated before, or even
atomically with, the §7 inequality. Run as written, a driver that computes the gate first and the
budget check second auto-opens Stage B on an arm whose own run integrity the same document
condemns. §7's firing discipline pins "never auto-accepts on a miss" but is silent on "never fires
on a terminated arm." The one-way door this review gates reads §7 mechanically — if the ordering
isn't in the text, it isn't in the gate.

**F2 — §5's control-arm fixed line is factually false for implementation-level failures, so the
arms differ by more than the mechanism.** The generic try-again line is "Your previous answer was
incorrect. Please try again." For `non-executable-artifact` and `no-artifact` candidates (the
entire implementation-level half of the D-07 mapping, §3), the prior answer was never graded
incorrect — it never ran, or never existed. The control arm therefore receives a misleading
statement about its failure for roughly the implementation-level population, while the DUALFIX arm
receives an accurate one. The measured margin would then confound "execution feedback helps" with
"being told a true thing about your failure helps versus being told a false thing." The isolation
rationale (§5) only neutralizes artifact visibility, not the truthfulness of the failure
description.

**F3 — §4's contamination defense is seed disjointness, but the claim it defends is task
disjointness.** §4 asserts that because `DUALFIX_STUDY_SEEDS` is disjoint from pretest/stage-1/
stage-2 seeds, "no candidate whose score is already published... can enter this study's corpus."
That inference holds only if distinct seeds never generate identical or near-identical L3 tasks.
The document never states, and pins no check for, task-content disjointness across seeds — it
defends the proxy (seed numbers) and declares victory over the target (published candidates). If
the BI battery's per-seed task space overlaps, a task whose baseline score is already public can
enter the corpus under a fresh seed, and nothing in this document would catch it.

**F4 — The harness-fault / `error`-status boundary is undefined, which makes the §8 error budget
gameable in exactly the way §8 claims to forbid.** §6 lets a unit that "dies to a harness fault
(connection refused, server restart, kill)" be retried once and never counted as a study outcome;
§8 terminates the study if more than 1/10 of an arm's units land in `error`. No operational
criterion separates the two categories. A driver (or a future amendment-free interpretation) that
classifies model-side failures as infrastructure faults converts denominator-counted `error` units
into invisible retries, keeping the error rate under budget and the study alive past a state that
should have terminated it. "Neither condition is ever remedied by extending the seed list" is, as
the attack brief suspects, asserted in prose and enforced by nothing — but the larger hole is that
the budget itself can be evaded without touching the seed list, via the undefined fault taxonomy.

**F5 — §7's shared-`n` assumption is not guaranteed by anything else in the document.** The
integer rule `20 * (kD - kC) >= 3 * n` is sound only if both arms attempt exactly the same `n`
candidates. But §6's harness-fault retry is per-arm, §8's error budget is per-arm, and nothing
defines what the gate reads if an arm has a unit that never produced an attempt at all (e.g.,
harness fault, retry also failed, not retried again per no-redraw discipline). If the arms'
attempted counts diverge by even one, "the common attempted-candidate count" does not exist, and
the document gives no rule for which denominator the gate uses — leaving Phase 12's mechanical
reader to silently pick one, and the friendlier pick (the smaller `n`) lowers the bar for firing.

**F6 — §1's narrow reading is undercut by §1 itself and by §2.** §1 disclaims the whole-method
reading of `(DUALFIX)`, yet two sentences earlier claims the study is "a direct implementation of
the mechanism SHORTLIST.md A-03/S-03 credits with the α>0 injection/preservation claim" and that
"the study measures the property those documents already attribute to the method." Per §1's own
disclosure, A-03/S-03/E-03 attribute their claims to the combined method (rule-evolution plus
execution-feedback repair); crediting the isolated component with the combined method's α>0 claim
is precisely the broader reading §1 says it rejects. §2 then compounds it by calling the hypothesis
"a method PROPERTY — the repair rate DUALFIX-style execution-feedback repair achieves," and
§5/§7/§8 name the arm "the DUALFIX arm" throughout — inheriting, in every operative section, the
label §1 confines to a disclosed interpretive choice.

**F7 — §8's error-budget boundary is left ambiguous in exactly the way §7 was careful not to be.**
§7 devotes a paragraph to stating that `>=` is inclusive and walks the exact-threshold case. §8
condition 2 says the study terminates when "more than" 1/10 of units land in `error` — at `n = 20`
(the minimum corpus), exactly 2 errors is exactly 1/10. Is 2/20 a breach? "More than" says no;
"exceeds this budget" (same paragraph) says arguably yes; no worked example or integer form pins
it. The document demonstrates in §7 that it knows how to pin an inclusive/exclusive boundary and
chose not to here, leaving a one-unit-wide discretionary band at the minimum corpus size — the
precise spot where an author who wants the study to survive would spend it.

**F8 — §4's power projection rests on an n=10 pretest mean the document treats as a population
parameter.** "At the pretest screen's observed mean 0.500 at L3, sixty candidates are expected to
yield well above 30 eligible" — the 0.500 comes from n=10, seed 999, and §4 itself notes
`gradedScore === 0` eligibility is not the complement of mean 0.500 (partial-credit candidates with
`0 < score < 1` count toward the mean but not toward eligibility). The expected yield could be far
below the projection with no contradiction, making the underpowered-termination path likelier than
the document implies. This is not fatal — §8 handles underpowering honestly — but the "well above
30" confidence is unsupported by the arithmetic the document itself supplies.

**F9 — The equal-treatment invariant (§5) is undermined by the shared prompt-length bound applying
asymmetrically.** Both arms share `MAX_DUALFIX_PROMPT_CHARS = 4000`, but the DUALFIX prompt
carries strictly more content (task + artifact + failure-class label + execution feedback) than the
control (task + artifact + one line). For long artifacts or engine error text, the DUALFIX arm hits
truncation while the control does not — an asymmetry in effective treatment produced by a nominally
equal rule. Nothing states the truncation policy, which arm's content is dropped first, or that
truncation events are recorded in the per-task status fields §6 enumerates (they are not among the
listed fields).

No finding under attack surface 7 (drift toward the barred promotion-gate comparison): by
substance, the study compares two repair arms on already-graded candidates, not a prompt-search
instrument against a hand-written baseline as a promotion gate, and §2's statement that no verdict
feeds such a gate is consistent with §7/§10. The one residual discomfort — the carve-out
("diagnostics/different-hypothesis") is self-adjudicated inside the very document it exempts — is a
governance observation, not a design flaw this document could fix by editing itself.

No finding under attack surface 3 (eligibility predicate itself) beyond F3/F8: `gradedScore === 0`
exactly is numeric, disclosed, and the exclusion of `0 < score < 1` is stated plainly with its
rationale; the definition of "repaired" (`=== 1`) is symmetric in strictness.

**Assessment:** This is a better-than-average light prereg — the integer trigger is honestly
bounded, the denominator rule is stated where it matters, and the rejected-control-design section
shows the author anticipated the obvious attacks — but it is not yet safe to freeze behind a
mechanical one-way door. The structural defects cluster where the brief predicted: F1 and F5 mean
the gate can fire on state the termination clause should have voided or on a denominator the
document never defines; F2 means the headline margin, if it fires, is partially attributable to the
control arm being told something false rather than to the DUALFIX mechanism; F4 and F7 leave the
termination clause with two unenforced discretionary bands (fault taxonomy, boundary inclusivity);
F3 defends a proxy for the contamination claim it actually makes; and F6 lets the document eat its
narrow-reading cake and keep the DUALFIX brand too. F8 and F9 are secondary but real. All are
fixable in one revision — pin the §8-before-§7 ordering, make the control line truthful across
failure classes ("Your previous answer did not produce a correct result"), state a task-
disjointness check, operationally define harness fault vs `error`, pin the error-budget boundary
with an integer form like §7's, define the gate's `n` when arms diverge, and strip the α>0
attribution sentence from §1 — but until rev 2 incorporates them, freezing this document hands
Phase 12 an autonomous gate with exploitable slack in every clause that was asserted rather than
enforced.

## Reviewer: qwen-max

**Verdict: UNSOUND**

**F1** (§7 / §8). The Stage-B gate evaluates `20 * (kD - kC) >= 3 * n` mechanically with no human
in the loop, but nothing in this document specifies that the gate checks §8's termination
conditions before evaluating the inequality. An underpowered corpus (n < 20) can still satisfy the
inequality — e.g., n = 15, kD = 10, kC = 2 yields 160 ≥ 45, gate fires. More dangerously, a
control-arm error-budget breach (> 1/10 errors) artificially depresses kC, inflating `kD - kC` and
making the gate more likely to fire on the very study that should have been voided. The document
says "the study terminates before a verdict is reported" but this is a procedural assertion, not a
mechanical precondition of the gate evaluation. The autonomous gate, as described, reads only the
inequality.

**F2** (§8, condition 2 / §6). The three statuses `ok` / `timeout` / `error` are named (§6) but
never defined — no code path, failure mode, or decision rule is given that distinguishes an `error`
from a `timeout`. The error-budget breach condition depends entirely on this classification, yet
the preregistration leaves it to the study driver's implementation. A borderline failure (e.g., a
slow response that could be classified as either a timeout or a parse error) can be classified as
`timeout` to keep the error count below the breach threshold, and nothing in this document would be
violated by that choice.

**F3** (§8, condition 2 vs. §7). The error-budget threshold is stated as a prose fraction ("more
than 1/10") without the integer evaluation rule that §7 meticulously provides for the Stage-B
trigger. The boundary behavior — strictly greater than, not greater-than-or-equal — is stated in
English but never reduced to an integer inequality (`10 * error_count > n`). For a document whose
central virtue is mechanical evaluability without human judgment, this asymmetry leaves the
error-budget check's boundary case to prose interpretation while the Stage-B gate's boundary case
is illustrated with three worked examples.

**F4** (§8, final paragraph). "Neither condition is ever remedied by extending the seed list,
re-drawing the corpus, or re-running an arm mid-study" is a procedural assertion enforced only by
the document's freeze discipline. The drift test (§9) checks that constant values in the document
match exported symbols in code — it does not check that the study driver refuses to accept
additional seeds at runtime, or that the corpus-pin commit rejects a corpus drawn from more than
six seeds. A post-freeze code change that adds seeds and re-draws the corpus would violate the
frozen document's authority but would not be caught by any mechanical check this document
specifies.

**F5** (§1). The narrower reading disclaims the rule-evolution component and limits "DUALFIX" to
execution-feedback repair alone. But the same paragraph attributes the "α>0 injection/preservation
claim" to "the mechanism SHORTLIST.md A-03/S-03 credits" — if SHORTLIST attributes that claim to
the full two-part method (rule-evolution plus repair), then this document is claiming provenance
for a result the full method produced while running only the repair component. The disclosure names
the narrower reading but does not verify that the α>0 claim survives the narrowing. §2 and §10
repeat "DUALFIX-style execution-feedback repair" consistently, so the overreach is localized to
§1's provenance sentence — but that sentence is the one the study cites as its justification.

**F6** (§4). "Genuinely failing" is defined as `gradedScore === 0` exactly, explicitly excluding
candidates with `0 < gradedScore < 1`. The exclusion is noted, but the label "genuinely failing"
implies that a candidate with gradedScore = 0.2 is not genuinely failing — a qualitative
distinction the numeric predicate does not support. This narrows the corpus to the hardest cases
(biasing against a high repair rate, so not gaming in the author's favor), but it means the study's
reported "repair rate on genuinely failing candidates" overstates the generality of its population.
A reader encountering "genuinely failing" in the results will not naturally infer "only the
zero-overlap subset."

No finding on attack surface 2 (control arm isolation). The two arms differ by the mechanism under
test (failure-class label plus execution feedback) and the equal-treatment invariant is stated and
holds. The control arm's generic "your answer was incorrect" line is a weaker signal than the
DUALFIX arm's specific feedback, which is the intended information gap, not a confound.

No finding on attack surface 6 (denominator rule). The full-denominator rule (D-12) is stated in
§6, applied consistently in §7's inequality (n includes timeouts and errors), and the ok-only
sensitivity figure is explicitly labeled as secondary and excluded from the gate. No passage
computes against a friendlier denominator.

No finding on attack surface 7 (barred promotion-gate drift). The study's design (two repair arms
on the same failing candidates, neither arm a hand-written baseline, no phase-5 promotion gate) is
substantively distinct from the barred comparison. §2's standing-bars statement holds by substance,
not merely by name.

**Assessment:** The document's core weakness is that its most dangerous failure mode — the gate
firing on a study that should have been terminated — is guarded only by prose. The Stage-B
inequality is mechanically evaluable (the document's strongest feature), but the termination
conditions that should prevent that evaluation from running are procedural assertions without
mechanical enforcement. An underpowered corpus or an error-budget-breach control arm can produce a
firing inequality, and the autonomous gate, as described, has no precondition check to catch this.
The secondary findings (undefined error/timeout classification, missing integer form for the error
budget, unverified provenance narrowing) are each individually minor but collectively indicate a
document that is meticulous about the parts that favor a clean result (§7's worked examples, §5's
isolation rationale) and less meticulous about the parts that guard against a false positive. Rev 2
must add a mechanical precondition to the gate (check termination before evaluating the
inequality), define the error/timeout boundary, and either verify the α>0 claim survives the
narrower reading or drop the attribution.

## Disposition

**11 of 14 global findings adopted, 3 rejected with reason.** The 25 raw findings from Task 1 (10
gpt-sol-pro + 9 kimi-k3 + 6 qwen-max) merge into 14 global findings: seven clusters where two or
more lanes independently raised the same point (F-03, F-04, F-05, F-06, F-07, F-08, F-10 — 18 raw
findings absorbed into 7 global ones) plus seven findings raised by exactly one lane (F-01, F-02,
F-09, F-11, F-12, F-13, F-14 — 7 raw findings, 7 global ones). `18 - 7 = 11` fewer global findings
than raw findings from merging; `25 - 11 = 14` global findings, reconciling exactly against Task
1's per-lane counts. Of the 14, 11 are ADOPTED and 3 are REJECTED; `11 + 3 = 14`.

Every adjudication below was checked against the already-shipped Phase 11 code
(`experiments/dualfix-study/_dualfix-arms.ts`, `experiments/dualfix-study/_dualfix-study.ts`,
`src/foundry/dualfix.ts` — all committed in plans 11-01/11-02, before this review ran) rather than
assumed from the prose alone, per D-16: several findings turn out to already be correctly handled
by that code, and the adopted edit brings rev 2's prose into precise alignment with what the
driver actually does; others turn out to describe a real gap in the code's own behavior, or a gap
the code cannot close because it lives one phase downstream (Phase 12's own gate-evaluation code,
not yet written). None of the eleven ADOPTED findings changes any pinned numeric constant in §9 —
every edit either adds an explicit ordering/boundary rule using constants and functions the
document and code already name, or brings a description into alignment with already-shipped code.

## Adjudication ledger

**F-01 (gpt-sol-pro F1): ADOPTED** — §5's naive-retry control-arm sentence reads "the same original
task question," which read literally could mean a narrower text than the DUALFIX arm's "the
original task (schema, business question, output contract)." Checked against code
(`_dualfix-arms.ts`'s `buildNaiveRetryPrompt` and `dualfix.ts`'s `buildDualfixRepairPrompt` both
consume the identical `input.question` field from the same `DualfixCorpusEntry.question`, documented
there as "schema DDL + business question + output contract — the same text the candidate originally
saw"): the code already sends the identical full task text to both arms. Rev 2 rewords §5's control-
arm line to name the same three-part task block explicitly, closing the reading gap the prose left
open rather than changing what either arm actually receives.

**F-02 (gpt-sol-pro F2): REJECTED** — reason: the finding asks for exact, byte-level prompt
templates to be frozen in the pre-registration before corpus outcomes exist, on the premise that the
control line ("e.g., ...") and the DUALFIX feedback text ("a statement") are still open, mutable
design choices. Checked against code: `_dualfix-arms.ts` exports `NAIVE_RETRY_INSTRUCTION = "Your
previous answer was incorrect — try again."` as a fixed, named constant, and `dualfix.ts`'s
`buildDualfixRepairPrompt` builds a fully fixed system string and a fixed line template for both the
implementation-level and specification-level feedback cases — none of this is an "e.g." placeholder
in the actually-governing artifact. This code was committed in plan 11-01, before this review pass
ran, so the exact prompt text is not an open judgment call this document's freeze needs to pin a
second time; `RESEARCH.md`'s own Claude's-Discretion list assigns "the exact repair-prompt text" to
the implementation tier, not the prereg tier, and the implementation already discharged that
discretion in committed code. §9's drift test (plan 11-05) is the mechanism that keeps the two in
sync going forward, not a duplicate literal-text freeze in this document.

**F-03 (gpt-sol-pro F3, kimi-k3 F9): ADOPTED** — §5's equal-treatment invariant states both arms
share `MAX_DUALFIX_PROMPT_CHARS` but does not state the truncation policy, leaving open whether an
over-bound prompt is rejected, truncated, or compacted, and whether the DUALFIX arm's necessarily
longer prompt (task + artifact + failure label + execution feedback, versus the control's task +
artifact + one line) is more likely to be truncated. Checked against code: both `buildNaiveRetryPrompt`
and `buildDualfixRepairPrompt` apply `truncateDualfixSegment` identically twice — once to each
embedded segment (the echoed artifact; the engine-error text where present) and once to the fully
assembled user message — the same exported function, not a re-derived equivalent (D-09). Rev 2 adds
one sentence to §5 naming this two-layer, identical-function truncation policy and disclosing that
the DUALFIX arm's larger informational payload makes it the more likely of the two to reach the
per-segment or whole-prompt bound, so a reader interprets a truncated DUALFIX prompt as an expected
consequence of the mechanism under test, not an undisclosed asymmetry.

**F-04 (gpt-sol-pro F4, qwen-max F6): ADOPTED** — the term "genuinely failing" in §4's heading could
read to an unhedged reader as covering any incorrect answer, when the operative predicate
(`gradedScore === 0` exactly) is narrower — it excludes the `0 < gradedScore < 1` partial-credit
band that §3 itself names as part of `executes-but-wrong`. §4 already states this exclusion
explicitly as a locked decision (RESEARCH.md Assumption A2, adopted, not reopened by this finding —
neither reviewer argues the predicate itself is wrong, and qwen-max's own text notes the narrowing
"bias[es] against a high repair rate, so not gaming in the author's favor"), so this is a labelling
clarification, not a population change. Rev 2 adds one sentence immediately after the predicate
stating that "genuinely failing," used throughout this document, refers exclusively to the
zero-overlap predicate and never to the wider `gradedScore < 1` population.

**F-05 (gpt-sol-pro F5, kimi-k3 F3): ADOPTED** — §4's contamination defense argues from seed
disjointness ("`DUALFIX_STUDY_SEEDS` disjoint from every seed already used") to task-content
disjointness ("no candidate whose score is already published... can enter"), without stating the
mechanism that makes distinct seeds produce distinct task content. Checked against code:
`bi-warehouse.ts`'s task generation seeds a `mulberry32` PRNG stream from a SHA-256 hash of
`${seed}|bi-tasks|${levelId}` (`deriveTaskSeed`) — a deterministic, seed-keyed pseudorandom stream,
the same mechanism this project already relies on to treat the pretest/stage-1/stage-2/corridor
seed sets as independent. Rev 2 adds one sentence to §4 naming this mechanism explicitly as the
basis for the disjointness claim, rather than leaving the inference from seed numbers to task
content implicit.

**F-06 (gpt-sol-pro F6, kimi-k3 F1, qwen-max F1): ADOPTED** — the highest-consensus finding (raised
independently by all three lanes): §7's "if and only if" firing discipline does not state that the
inequality is evaluated only when the study has NOT already terminated under §8. Checked against
code: the already-shipped `_dualfix-study.ts` driver checks `isUnderpowered` before either arm runs
and computes `isErrorBudgetExceeded` per arm after both arms complete, recording the result as an
`outcome` field (`"UNDERPOWERED"` / `"ERROR-BUDGET-EXCEEDED"` / `"COMPLETE"`) in
`dualfix-study-verdict.json` — but this driver explicitly does NOT evaluate the Stage-B inequality
itself ("the Stage-B inequality (REQ-66) is Phase 12's own gate... never evaluated here"), so the
ordering constraint the reviewers are asking for is a real, currently-unwritten obligation on
Phase 12's own gate code, not yet satisfied anywhere. This is exactly what the pre-registration
exists to pin before that code is written. Rev 2 adds an explicit sentence to §7's firing discipline:
the inequality is evaluated only when `dualfix-study-verdict.json`'s `outcome` field reads
`"COMPLETE"`; an `"UNDERPOWERED"` or `"ERROR-BUDGET-EXCEEDED"` outcome means the study already
terminated under §8, and Phase 12 reports that terminal state instead of ever evaluating §7's
inequality — mirroring §8's own "a terminated study reports its terminal state... never an
incomplete study" language.

**F-07 (gpt-sol-pro F7, kimi-k3 F7, qwen-max F3): ADOPTED** — §8's error-budget condition is stated
as a prose fraction ("more than 1/10") with no integer evaluation rule and no stated evaluation
checkpoint, unlike §7's meticulous integer form and worked boundary examples. Checked against code:
the already-shipped `isErrorBudgetExceeded(errorCount, attemptedCount)` in `_dualfix-study.ts`
implements exactly `errorCount * DUALFIX_ERROR_BUDGET_DEN > attemptedCount * DUALFIX_ERROR_BUDGET_NUM`
— i.e. `10 * errorCount > attemptedCount` — evaluated once, after `runStudyUnits` completes for both
arms (a final evaluation, not a per-unit continuous one), with a strict `>` (exclusive boundary,
confirming "more than" means exactly what it says: at `n=20`, exactly 2 errors is `10*2=20 > 20`
false — not a breach). Rev 2 adds this exact integer form and its evaluation checkpoint to §8,
matching the already-shipped code precisely rather than leaving it to prose.

**F-08 (gpt-sol-pro F8, kimi-k3 F4, qwen-max F2): ADOPTED** — the second-highest-consensus finding
(three lanes): §6's harness-fault-retry description ("connection refused, server restart, kill")
could read as covering only infrastructure-level failures, distinct from a genuine model/provider
`error`, raising the concern that a driver could discretionarily reclassify an unfavorable outcome
as a harness fault to evade the error budget or shrink the denominator. Checked against code: the
already-shipped `onceWithHarnessRetry` in `_dualfix-study.ts` retries ANY `status === "error"`
result exactly once, mechanically, regardless of cause — there is no discretionary classification
step, no code path that distinguishes "connection refused" from "the provider returned an error" —
and the retry's own result, even if it is `error` again, becomes the single, permanent
`state.units[key]` entry, counted in both the denominator and the error budget. There is no
reclassification path in the shipped code for a failure to "disappear." Rev 2 rewrites §6's
harness-fault-retry paragraph to state the actual mechanical rule: any `error`-status outcome is
retried once, uniformly, regardless of cause, and the second attempt's result — even if also
`error` — is the final, denominator-counted, error-budget-counted status; nothing is discarded or
reclassified after that point.

**F-09 (gpt-sol-pro F9): ADOPTED** — §10's disclosure that `n=20-30` is "sized to resolve a 0.15
two-arm difference... at the corresponding statistical floor" implies a formal power derivation for
this specific paired, candidate-count-based design, while §7's own "Where 0.15 comes from" paragraph
already discloses honestly that the study "reuses that same floor... rather than deriving or
asserting a fresh number" — the two sections are in slight tension. This is not a case for adopting
a different threshold (0.15 remains the pinned margin, reused deliberately per D-15/§7, and
reworking a full paired-design power calculation is out of scope for a light prereg); it is a case
for §10 matching §7's own honesty. Rev 2 rewords §10's disclosure to say the target/minimum n is
sized around the REUSED 0.15 floor as a deliberate heuristic carried over from a prior six-seed
cluster measurement (ANALYSIS-REVIEWS.md F-08), not an independently-derived power calculation for
this paired design — bringing §10 into alignment with what §7 already discloses.

**F-10 (gpt-sol-pro F10, kimi-k3 F6, qwen-max F5): ADOPTED** — the third three-lane finding: §1's
narrower reading disclaims the whole-method interpretation of E-03's `(DUALFIX)` parenthetical, but
the same section then calls the study "a direct implementation of the mechanism... credited with the
α>0 injection/preservation claim," and §2/§5/§7/§8 name the arm "the DUALFIX arm" throughout without
re-stating the narrower scope — inheriting, in every operative section, exactly the broader framing
§1 says it rejects. The α>0 preservation claim (SHORTLIST.md A-03/S-03) is specifically about the
EVOLVED RULE SET's zero-shot cross-model transfer, which this narrower reading explicitly does not
implement (no rule set exists here to transfer) — crediting the isolated repair component with that
claim is the overreach both §1 and this finding correctly name. Rev 2 removes the "direct
implementation... credited with the α>0... claim" sentence from §1, replacing it with language
describing `dualfixMutate` as a local, single-attempt operationalization of the specification-vs-
implementation distinction A-03/S-03/E-03 attribute to the mechanism, explicitly NOT claiming
inheritance of the α>0 cross-model transfer claim (already disclosed two paragraphs later as out of
scope). "The DUALFIX arm" naming is left as a label of convenience (already qualified once, in §1),
consistent with how §10's existing disclosure already frames the narrowing.

**F-11 (kimi-k3 F2): REJECTED** — reason: the finding argues the control arm's fixed line ("Your
previous answer was incorrect — try again.") is factually false for `no-artifact`/
`non-executable-artifact` candidates, since those candidates' prior attempts "never ran, or never
existed," and that this asymmetry (an accurate statement to the DUALFIX arm, an inaccurate one to
the control) confounds the measured margin. On inspection this does not hold: §4's eligibility
predicate restricts the corpus to `gradedScore === 0` exactly, and by that predicate's own
construction every corpus candidate — whether `no-artifact`, `non-executable-artifact`, or
zero-overlap `executes-but-wrong` — DID give an incorrect answer to the business question (a missing
or non-executing artifact answers nothing correctly, which is what "incorrect" describes in ordinary
usage). The statement is true for the entire eligible population, not false for a subset of it. What
the finding actually identifies — that the control's information content is a strict subset of the
DUALFIX arm's (both are true statements about failure, one more specific than the other) — is not a
confound; it is precisely the mechanism §5's isolation rationale states the design measures: "the
two arms' information sets differ only by the mechanism under test." An asymmetry in informativeness
between two true statements is the independent variable, not a leaked confound.

**F-12 (kimi-k3 F5): ADOPTED** — the finding's underlying worry (do the two arms always attempt the
identical corpus, giving §7's inequality a well-defined shared `n`?) is answered by already-shipped
code rather than left open: `_dualfix-study.ts`'s `runStudyUnits` iterates every corpus entry against
both arms unconditionally, and `onceWithHarnessRetry`/`once()` always writes exactly one
`DualfixArmResult` into `state.units` per `(arm, taskId)` key — a harness-fault retry is absorbed
transparently (at most one extra attempt, logged to `state.retries`, never a second unit-map entry),
and there is no code path that skips a unit or leaves a key unset. `computeArmAccounting`'s
`attempted` count is therefore always exactly `corpus.length` for both arms by construction, never a
value the two arms could diverge on. This is a positive fact worth stating in the document itself,
since §7's inequality reads it mechanically: rev 2 adds one sentence to §7 stating that the shared-`n`
assumption holds by construction of the study driver (every corpus entry yields exactly one final
recorded outcome per arm; no retry-exhaustion path produces a missing or duplicate outcome), so `n`
is always the pinned corpus size for both arms.

**F-13 (kimi-k3 F8): ADOPTED** — §4's "sixty candidates are expected to yield well above 30 eligible"
projection treats the L3 pretest's single observed mean (0.500, n=10, seed 999) with more confidence
than a ten-task sample supports, and does not connect the projection back to §8's own honest
handling of an underpowered outcome. The finding itself calls this "not fatal" since §8 already
reports underpowering as a legitimate terminal state rather than a failure to remedy. Rev 2 softens
§4's language from an expectation to a projection explicitly hedged on the pretest's small sample
size, and adds a cross-reference to §8's termination clause as the governing outcome if the eligible
count falls short — connecting the two sections rather than leaving the confident projection to
stand alone.

**F-14 (qwen-max F4): REJECTED** — reason: the finding argues §8's "neither condition is ever
remedied by extending the seed list... or re-running an arm mid-study" is enforced only by prose,
with no mechanical check against a future driver-code change that adds seeds and re-draws the
corpus after the freeze. This document's own §9 already names the mechanism this concern calls for:
the pinned constants table (including `DUALFIX_STUDY_SEEDS`) is the single source of truth a drift
test (`test/dualfix-study-prereg-sync.test.ts`, plan 11-05, already named in this plan's own
`artifacts_this_phase_produces` and in `11-RESEARCH.md`'s Wave 0 Gaps) compares against the exported
code constants and fails on any mismatch. A driver change that added a seventh seed or re-drew the
corpus post-freeze would change `DUALFIX_STUDY_SEEDS`'s exported value away from what this frozen
document pins, which is exactly the drift the named test exists to catch. The mechanism the finding
says is missing already exists, by design, one plan ahead of this one.
