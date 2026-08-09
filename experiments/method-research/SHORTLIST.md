# Method shortlist: theory-only selection against the frozen §2 criteria

**Date: 2026-08-09 · Author: Robert Li · companion to `experiments/method-research/SURVEY-2026-08.md` (the REQ-38/39 survey this document assesses) and `experiments/method-research/RESEARCH-PLAN.md` §2 (the frozen selection criteria this document applies, unedited)**

## 0. What this is, and what it is not

This is the REQ-40/41 theory-only selection over the nine entries in
`experiments/method-research/SURVEY-2026-08.md`. It applies the two frozen §2 criteria — α>0
injection/preservation at prompt-search altitude, and sealed held-out compatibility — to every
survey entry, on stated mechanism alone, and shortlists at most three methods with individually
traced rationales. It is **not** a task-family recommendation, sketches **no** instrument, and
drafts **no** pre-registration content — those are Phase 6's job (REQ-42/43/44), reserved by
`RESEARCH-PLAN.md` §0's scope falsifier.

## 1. The frozen criteria, restated

1. **α>0 injection/preservation at prompt-search altitude** — the method's own theory must claim
   (and the claim must be checkable against its stated mechanism, not just asserted) that it
   injects or preserves positive signal at the altitude this milestone operates at, not merely at
   a different altitude the paper measured. A method fails this criterion if its own mechanism
   claims signal gain only at harness-genome altitude, or only on the training/optimization signal
   itself with no stated preservation claim once that signal is removed.
2. **Sealed held-out compatibility** — the method's evaluation protocol must be compatible with a
   sealed held-out suite; a method whose own validation depends on seeing the evaluation signal
   during optimization fails this criterion by construction. A method fails this criterion if its
   published evaluation protocol requires the held-out suite (or an equivalent) to be visible
   during the method's own optimization loop, even if a paper's authors call that loop
   "validation."

**Frozen at:** experiments/method-research/RESEARCH-PLAN.md §2 — frozen before survey reading, not edited since.

Per F-03, the survey's validated/unvalidated verdict (`SURVEY-2026-08.md` §3) is **informational
context only**, never an eligibility gate in either direction here: an unvalidated method may
still be shortlisted if its stated theory satisfies both criteria, and a validated method that
fails either criterion may not be shortlisted regardless of its benchmark strength. Section 2
below carries each entry's validation status forward as context and nowhere treats it as a
pass/fail input.

## 2. Per-method assessment against the criteria

### A-01 — Two-Stage Prompt Optimization for Few-Shot Relation Extraction

- **Criterion 1 (α>0 injection/preservation):** met
- **Criterion 2 (sealed held-out compatibility):** met
- **Validation status (context only):** validated

**Criterion 1.** GradPO's stated mechanism computes a loss/gradient signal over a support set to
identify high-impact prompt spans and apply local edits to the prompt text itself — the object
modified is the agent-facing prompt, at agent-definition altitude, never a harness or weight
parameter. The two-stage design's own framing (a first-stage broad reasoning-based improvement,
followed by a second-stage targeted local refinement) states that the refinement is intended to
improve on what the first stage already found, not merely to be an artifact of the specific loss
computation that produced the local edit — a stated preservation claim for the refined prompt's
benefit beyond the immediate optimization step.

**Criterion 2.** The stated mechanism requires only a support/training set to compute its
gradient/loss signal; nothing in the described design requires the query set the edited prompt is
later run against to be visible to that computation. A sealed held-out suite could occupy the
query role without ever entering the gradient computation, by the mechanism's own construction.

### A-02 — Contrastive Reflection for Iterative Prompt Optimization

- **Criterion 1 (α>0 injection/preservation):** met
- **Criterion 2 (sealed held-out compatibility):** met
- **Validation status (context only):** validated

**Criterion 1.** The stated design explicitly separates the validation set that gates edit
acceptance from a further quantity the paper reports, and states that weaker mechanisms
(failure-only or random-evidence variants) perform worse — a claim that the specific
contrastive-reflection mechanism, not the accept/reject gate alone, is what carries the benefit
onto quality beyond the acceptance signal itself.

**Criterion 2.** The stated accept/reject gate needs only a validation set the practitioner
supplies; nothing in the described mechanism requires a further held-out quantity to be visible
to that gate. A sealed held-out suite can sit apart from the validation set and never enter the
loop, consistent with the paper's own three-way separation (source material for behavioral
slices, a validation set for gating, and a further reported quantity).

### A-03 — From Failing to Passing (DUALFIX)

- **Criterion 1 (α>0 injection/preservation):** met
- **Criterion 2 (sealed held-out compatibility):** met
- **Validation status (context only):** validated

**Criterion 1.** The mechanism's strongest stated claim is that rules evolved on one model
transfer zero-shot to other models "without any re-optimization" — a preservation claim by
construction: the benefit is asserted to survive removal of the exact optimization run, and even
the exact model, that produced it, not merely to be a property of the specific execution-feedback
signal it was tuned against.

**Criterion 2.** The rule-evolution mechanism operates over a set of coding problems to derive
general, reusable, error-agnostic transformation rules. The zero-shot cross-model transfer claim
is the mechanism's own demonstration that its evolution loop does not require the set it is later
checked against to be visible to it — the rules are stated to generalize without being re-run
against whatever they are subsequently evaluated on.

### A-04 — Efficient Test-Time Optimization for Multi-Agent Proof Autoformalization (ToMap)

- **Criterion 1 (α>0 injection/preservation):** not met
- **Criterion 2 (sealed held-out compatibility):** not met
- **Validation status (context only):** unvalidated

**Criterion 1.** The GEPA-inspired refinement loop's stated mechanism selects prompt updates
entirely by "formal verification progress together with semantic proof rubrics" defining a Pareto
frontier. The stated mechanism carries no claim that the resulting gain persists once that same
verification/rubric signal is set aside — no preservation claim appears in the paper's own
description of the loop.

**Criterion 2.** The published evaluation protocol scores the method on the same two axes —
syntactic correctness and semantic faithfulness — that the optimization loop's own Pareto frontier
selects against. The stated mechanism does not establish separation between what the loop consumes
and what a sealed held-out suite would need to check independently.

### A-05 — BayesPO

- **Criterion 1 (α>0 injection/preservation):** not met
- **Criterion 2 (sealed held-out compatibility):** not met
- **Validation status (context only):** unvalidated

**Criterion 1.** The posterior/energy function is defined by a task-likelihood term that "rewards
prompts that explain input-output examples," and the paper's own stated limitation is that
"energy minimization may overfit small optimization sets." The mechanism's own account carries no
stated claim that the resulting prompt's benefit persists once that same likelihood signal, over
the same examples, is removed.

**Criterion 2.** The stated mechanism needs the input-output examples that define its
task-likelihood term visible throughout optimization, and the disclosed overfitting risk is the
paper's own admission that its published protocol does not establish separation between that
signal and what is later checked. The mechanism does not demonstrate the loop can run without the
evaluation-relevant examples inside it.

### A-06 — From Agent Failures to Text Policies

- **Criterion 1 (α>0 injection/preservation):** not met
- **Criterion 2 (sealed held-out compatibility):** not met
- **Validation status (context only):** unvalidated

**Criterion 1.** The paper's own analysis locates the unresolved piece for agent-level TextGrad as
reliably *generating and selecting* policy updates from experience — it states this capability is
unsolved, not that a mechanism achieving it exists and merely awaits checking. There is no stated
mechanism in this paper carrying a checkable claim that it injects or preserves positive signal at
prompt-search altitude; the paper's contribution is the diagnosis of a gap, not a method that
makes the claim criterion 1 requires.

**Criterion 2.** Because no mechanism is stated to carry the criterion-1 claim, there is no
described evaluation protocol whose sealed-held-out compatibility can be affirmatively
established. Theory-only selection requires a checkable affirmative claim, not the benefit of the
doubt for an absent one; absence of a stated mechanism defaults to not met here as it did for
criterion 1.

### A-07 — GRADRAG

- **Criterion 1 (α>0 injection/preservation):** not met
- **Criterion 2 (sealed held-out compatibility):** not met
- **Validation status (context only):** unvalidated

**Criterion 1.** The stated design routes an Evaluator's critique of downstream answers directly
into the Prompt Optimizer's update signal, and the paper states no claim that the reported
preference-margin gain persists once that same evaluator-critique family is set aside — no
preservation claim appears in the stated design.

**Criterion 2.** The stated evaluation methodology (LLM-judged pairwise comparison) and the
in-loop Evaluator that produces the optimization feedback are both instances of the same judgment
mechanism family. The published protocol does not establish that the final judged comparison is a
signal held apart from what the optimization loop's own Evaluator sees — exactly the shape
criterion 2's failing example describes.

### A-08 — Self-Supervised Skill Optimization (SSO)

- **Criterion 1 (α>0 injection/preservation):** met
- **Criterion 2 (sealed held-out compatibility):** met
- **Validation status (context only):** validated

**Criterion 1.** The stated mechanism is explicitly self-supervised — an LLM judge over unlabeled
batches drives the loop — while the paper's own comparison point is a ground-truth-based optimizer
scored on labeled closed-ended benchmarks. The stated design's premise is that the unlabeled
optimization signal produces a skill whose benefit is checkable on a structurally distinct,
labeled signal the loop never consumes: a preservation claim built into the mechanism itself,
not asserted after the fact.

**Criterion 2.** The stated accept/reject gate requires only an unlabeled validation set; by the
mechanism's own construction it needs no ground-truth-labeled data at all during optimization, so
a sealed held-out suite carrying ground truth could sit completely apart from the loop and only be
consulted for final scoring.

### A-09 — FLARE

- **Criterion 1 (α>0 injection/preservation):** met
- **Criterion 2 (sealed held-out compatibility):** met
- **Validation status (context only):** validated

**Criterion 1.** The stated mechanism uses a disclosed, bounded validation subset (as few as 100
examples in one reported setting) to reach peak performance, distinct from the larger population
the paper reports results against. The design's claim is that the reflective-plus-few-shot
mechanism's benefit holds on that separate population, not only on the validation subset that
shaped it.

**Criterion 2.** The stated validation subset is disclosed as small and separate from the reported
test population; nothing in the stated design requires the evaluation population to be visible to
the optimization process, consistent with a sealed held-out suite occupying the test role
untouched.

## 3. The shortlist

**Qualifiers:** 5
**Shortlist size:** 3
**Stop rule:** none

Five methods meet both criteria in §2: A-01 (Two-Stage Prompt Optimization), A-02 (Contrastive
Reflection), A-03 (DUALFIX), A-08 (SSO), A-09 (FLARE). Per F-01, more than three qualifiers
requires the tie-breaker: rank by how many of the four §4 diagnostics each method's own stated
evaluation design already addresses **without modification**, ties broken by earliest
primary-source publication date.

Applying the diagnostics-addressed count strictly — "without modification" means the diagnostic
must already be handled as published, not merely resemble it in spirit. All four diagnostics are
artifacts specific to the `dataops-agent-pilot` instrument (a 395-of-479 parseable-but-wrong
decomposition under a strict/relaxed scoring dichotomy, a fence-dialect per-arm-drop threshold, an
inversion-under-strict-parsing finding, and a seed-clustered t on six per-seed means); no surveyed
method's published design implements any of these as stated. Two candidates carry a superficial
resemblance that does not survive the "without modification" bar: DUALFIX's separation of
specification-level from implementation-level code failures is not D-1's specific
parseable-but-wrong-versus-format-tax decomposition, and FLARE's prose claim of being "markedly
more stable across random seeds" states no estimator and so cannot be confirmed to match D-4's
seed-clustered-t bar. Crediting either would be exactly the kind of spirit-matching the frozen
criteria's "checkable against stated mechanism" language exists to close off. All five qualifiers
score **0 of 4** on the diagnostics-addressed count:

| Rank input | A-01 | A-02 | A-03 | A-08 | A-09 |
|---|---|---|---|---|---|
| Diagnostics addressed (strict) | 0 | 0 | 0 | 0 | 0 |
| Primary-source v1 date | 2026-06-28 | 2026-06-29 | 2026-07-06 | 2026-07-30 | 2026-08-03 |

The diagnostics-addressed count is a full tie across all five qualifiers. The secondary
tie-breaker — earliest primary-source publication date — is not itself tied: all five v1 dates
are distinct, so it resolves to a unique top three without any arbitrary pick. This is the
pre-committed procedure (count, then date) producing a determinate answer, not a case of the two
methods left out being disqualified by the diagnostics — they tied on that axis along with the
other three, and the date order is the frozen rule's own resolution mechanism, not a judgment call
made after the fact.

### S-01 — Two-Stage Prompt Optimization for Few-Shot Relation Extraction

- **Rationale — criterion 1:** GradPO's mechanism edits the agent-facing prompt using a
  loss/gradient signal computed over a support set, and the two-stage design's own framing states
  that its second-stage local refinement is meant to improve on the first stage's broader search
  rather than merely reflect the specific loss computation that produced any one edit — a stated
  preservation claim for the refined prompt's benefit at agent-definition altitude.
- **Rationale — criterion 2:** The stated mechanism needs only a support/training set for its
  gradient computation; the query set the edited prompt is subsequently run against never needs to
  be visible to that computation by the mechanism's own construction, so a sealed held-out suite
  could occupy the query role untouched.

### S-02 — Contrastive Reflection for Iterative Prompt Optimization

- **Rationale — criterion 1:** The stated design separates the validation set that gates edit
  acceptance from a further reported quantity, and states that weaker mechanisms (failure-only,
  random-evidence) perform worse — a claim that the contrastive-reflection mechanism itself, not
  the acceptance gate alone, is what carries benefit beyond the immediate optimization signal.
- **Rationale — criterion 2:** The stated accept/reject gate requires only a validation set the
  practitioner supplies; nothing in the mechanism requires a further held-out quantity to be
  visible to that gate, so a sealed held-out suite can sit apart from the validation set and never
  enter the loop.

### S-03 — From Failing to Passing (DUALFIX)

- **Rationale — criterion 1:** The mechanism's strongest stated claim — rules evolved on one model
  transfer zero-shot to other models "without any re-optimization" — is a preservation claim by
  construction: the benefit is asserted to survive removal of the exact optimization run and even
  the exact model that produced it.
- **Rationale — criterion 2:** The zero-shot cross-model transfer claim is the mechanism's own
  demonstration that its rule-evolution loop does not require the set it is later checked against
  to be visible to it, so a sealed held-out suite is compatible with the stated design by
  construction rather than by inference about an unstated split.

## 4. Terminated-arm diagnostics as evaluation-design constraints

These four constraints apply to whichever method is eventually adopted for the future arm's
evaluation design — regardless of shortlist size, per F-19. They constrain evaluation design only,
never method ranking or exclusion, and were not used to rank or eliminate any candidate in §2 or
§3 above.

### D-1 — 395/479 parseable-but-wrong residual difficulty

**Cited to:** experiments/dataops-agent-pilot/PILOT-RESULTS.md — "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED (2026-08-09)," "What the probe measured besides the verdict"

Of 479 clean stage-1 tasks under relaxed scoring, 57 were correct-and-strict, 11 correct-but-aliased,
395 parseable-but-wrong, and 16 no-artifact. Per the terminal report, the 395 figure is what
remained as **genuine task difficulty after** relaxed scoring had already removed the
format/parsing tax — it is not the tax itself. **Constraint:** a shortlisted method's evaluation
design must not be blind to this failure shape (a well-formed answer that is simply wrong), and
must not treat shrinking the 395 as equivalent to removing a format tax — those are two different
interventions that must be tracked separately in whatever new evaluation design is built.

### D-2 — dialect-drift mitigation confirmed mostly, not universally

**Cited to:** experiments/dataops-agent-pilot/PILOT-RESULTS.md — "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED (2026-08-09)," §8 falsifier disposition

Relaxed scoring's fence-dialect mitigation was confirmed mostly, not universally: per-arm drop
rates fell to ≤0.10 at every point once dialect drift was accounted for, with G3's dropB sitting
exactly at that 0.10 boundary rather than comfortably under it. **Constraint:** a shortlisted
method's evaluation design must not assume format-dialect mitigation generalizes cleanly at every
measured point; a design that reports a mitigation rate must show the distribution across points,
not just the mean, given a real terminated-arm point sat at the boundary rather than inside it.

### D-3 — inversion-as-format finding

**Cited to:** experiments/dataops-agent-pilot/PILOT-RESULTS.md — "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED (2026-08-09)," §8 falsifier disposition

G4's apparent arm inversion under strict scoring turned out to be a parsing artifact, not a
methodology-prompt effect, once relaxed scoring was applied. **Constraint:** a shortlisted
method's evaluation design must include a check that distinguishes a genuine methodology-driven
result from a strict-parsing artifact before reporting an inversion or a surprising ranking as a
substantive finding — the terminated arm's own inversion finding evaporated under exactly that
check.

### D-4 — seed-level variance under the clustered estimator

**Cited to:** experiments/dataops-agent-pilot/PILOT-RESULTS.md — "V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE TERMINATED (2026-08-09)," "Stage 1: the numbers"

Seed-clustered t on six per-seed means produced wide 90% CIs — G1 alone spanned [0.385, 0.721].
**Constraint:** a shortlisted method's own noise-budget claims must be checked against an
estimator of comparable conservatism (seed-clustered, not a naive per-task CI that understates
variance), so a new evaluation design does not report false precision the terminated arm's own
data would not have supported.

**Constraint scope:** evaluation design only — never method ranking or exclusion.
**Terminated-arm characterization:** instrument-line exhaustion, not a third null — stage 2 never ran, so the pre-registered three-nulls contingency is unreachable and closed with the arm.

## 5. Method-shopping self-audit

**Win-likelihood:** not a selection criterion at any point in this process.
**Criteria edits after survey reading:** none.

A reader checking both claims should look at three places: §1 above, which restates the criteria
verbatim from `RESEARCH-PLAN.md` §2 with no addition or softening; §2, which reasons from each
method's stated mechanism only — no benchmark number, accuracy figure, or comparative
"outperforms" claim appears anywhere in the criterion assessments above; and the git history of
`RESEARCH-PLAN.md`, where the criteria's freeze commit predates `SURVEY-2026-08.md`'s commit,
which predates this document's commit.
