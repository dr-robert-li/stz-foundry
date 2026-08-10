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
