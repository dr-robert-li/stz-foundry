# Method research plan — survey, theory-only selection, task-family recommendation

**rev 1 · 2026-08-09**

## 0. Standing bar and scope

The standing bar (`.planning/REQUIREMENTS.md` header, `V3.1-BATTERY-DESIGN.md` §6): research
output must never justify a v3-family successor. §6 terminates the v3 instrument line on
SUBSTANCE, not name — no successor instrument for the hypothesis prompt-search vs hand-written
baseline on the data-ops fact-recovery task family, as the phase-5 promotion gate, may be built
under any label (v3.2, v4, "new arm", "new pilot") by changing parser, prompts, grid, scoring, or
qualification rules. Any recommendation this milestone produces that is the barred hypothesis
relabelled is out of scope regardless of framing, full stop.

This is a non-shipping research milestone. Its deliverables land in `experiments/`, committed;
there is no package version bump attached to this work.

Scope boundary: this document scopes the work; it does not perform it. It contains zero survey
entries and zero per-method evaluations — those are Phase 5's job (REQ-38…REQ-41). This document's
job ends at naming what Phase 5 must do and the guardrails it must do it inside.

## 1. Survey scope and method

Per REQ-38/39, the survey (Phase 5, not this document) must cover three families at
agent-definition altitude: GEPA-style reflective evolution, textual-gradient methods, and
prompt-space search — published since the `experiments/META-RSI-SURVEY.md` cutoff of
**2026-06-28**. Nothing older than that cutoff is in scope for the survey; META-RSI already
covers the corpus up to that date and its conclusions are carried forward unchanged (below).

Per-entry record shape the survey must produce, one row per method found:

- primary-source citation (arXiv id or equivalent, not a secondary summary);
- a validated/unvalidated verdict, stated against the SAME bar META-RSI used — external claims
  are not adopted at face value; a claimed gain scored on a signal that includes the optimized
  axis is a circular positive and is downgraded, not counted as validated.

Altitude rule: agent-definition prompt-search altitude is a distinct object from harness-genome
RSI. The survey stays inside agent-definition altitude; it does not re-open or re-litigate
`META-RSI-SURVEY.md`'s harness-genome conclusions, which are carried forward as-is.

Search sources and inclusion/exclusion rule (fixed now so Phase 5 has no discretion to widen the
net after seeing results): arXiv `cs.CL`/`cs.AI`/`cs.LG` listings and citation-graph pulls from
GEPA's own citing-paper list, searched by the three named-family keywords plus "prompt
optimization," "textual gradient," and "reflective evolution." Included: papers proposing or
empirically evaluating a method inside the three named families at agent-definition altitude.
Excluded: harness-genome / meta-loop papers (that ground is META-RSI's, not re-covered here),
papers proposing evaluation-only benchmarks with no method contribution, and anything predating
2026-06-28. This inclusion/exclusion rule is frozen at this commit; Phase 5 applies it, it does
not amend it after seeing what the net catches.

## 2. Selection method — theory only

Per REQ-40/41, the selection criteria are pinned here, before any survey reading happens, and are
frozen at this commit — they may not be edited after survey results are in view. The theoretical
criteria a method must satisfy to be shortlisted:

1. **α>0 injection/preservation at prompt-search altitude** — the method's own theory must claim
   (and the claim must be checkable against its stated mechanism, not just asserted) that it
   injects or preserves positive signal at the altitude this milestone operates at, not merely at
   a different altitude the paper measured.
2. **Sealed held-out compatibility** — the method's evaluation protocol must be compatible with a
   sealed held-out suite; a method whose own validation depends on seeing the evaluation signal
   during optimization fails this criterion by construction.

Shortlist size: **≤3** methods. Each shortlisted method carries a written theoretical rationale
tracing it against both criteria individually — not a single blended justification. Win-likelihood
is explicitly **not** a criterion anywhere in this process; a method is not shortlisted because it
would probably win a bake-off, it is shortlisted because its own stated theory satisfies both
criteria above.

The four terminated-arm diagnostics apply as binding design constraints on any shortlisted method,
cited to the `PILOT-RESULTS.md` terminal report ("V3.1 GRID PROBE — NO QUALIFIER; INSTRUMENT LINE
TERMINATED," 2026-08-09):

- the **395/479 parseable-but-wrong zero-decomposition** (of 479 clean stage-1 tasks, 57
  correct-and-strict, 11 correct-but-aliased, 395 parseable-but-wrong, 16 no-artifact) — a
  shortlisted method's evaluation design must not be blind to this failure shape;
- the **dialect-drift confirmation** (relaxed scoring's fence-dialect mitigation was confirmed,
  not falsified — drops fell to ≤0.10 at every point once dialect drift was accounted for);
- the **inversion-as-format finding** (G4's apparent arm inversion under strict scoring turned out
  to be a parsing artifact, not a methodology-prompt effect, once relaxed scoring was applied);
- **seed-level variance under the clustered estimator** (seed-clustered t on six per-seed means
  produced wide 90% CIs — G1 alone spanned [0.385, 0.721] — so any shortlisted method's own
  noise-budget claims must be checked against an estimator of comparable conservatism, not a
  naive per-task CI that understates variance).

## 3. Task-family recommendation approach

Per REQ-42/43, the recommendation work (Phase 6) must include:

- **Admission-path analysis** — oracle class per the `admitVertical` discipline: what independent
  oracle can check the recommended task family's ground truth without depending on the same
  generative process being evaluated, mirroring the independent-reference-interpreter discipline
  named in `HANDOFF-V3.md` §1 T-A step 2 (a separate implementation, no shared helpers with the
  generator, recomputing every fact from the emitted artifact).
- **An explicit §6 compliance test** the recommended family must pass — a written statement of why
  the recommended hypothesis and task family are not the barred v3 hypothesis under a different
  label, checked against §6's substance-not-name test specifically.
- Two things the instrument sketch must address by name:
  1. the **v3.1 difficulty-corridor failure** — the terminated arm's knob family moved difficulty
     in steps too coarse for the pre-registered corridor (points landed either below the corridor
     floor with a real gradient, or in-corridor with no gradient); the recommended family's own
     difficulty knob must have a stated granularity story that avoids the same coarseness;
  2. a **noise-budget plan using seed-clustered estimation** — matching the estimator the
     terminated arm used (seed-clustered t on per-seed means), not a weaker one, so the
     recommendation's own noise claims are held to the same bar the terminated arm was held to.

## 4. Method-shopping risk

Named explicitly: **method-shopping** is selecting on measured win-likelihood while dressing the
selection as theory. Its recognizable shape is "defeat the null" framing — searching for a method
that would have beaten the terminated arm's null result, then retroactively describing that search
as theory-driven selection. This milestone's concrete defenses:

- criteria frozen before survey reading (§2 above) — the α>0 and sealed-held-out-compatibility
  bar exists before any candidate method is read, so it cannot be shaped around a favorite;
- written per-method theoretical rationale required for every shortlisted method (§2), so
  shortlisting is auditable against the frozen criteria rather than asserted;
- no post-hoc criteria edits — §2's criteria are frozen at this commit;
- two review gates: REQ-45 (this phase, on the plan you are reading) and REQ-46 (Phase 6, on the
  analysis after selection) — both adversarial passes attacking this same failure mode a second
  time, after the selection has actually happened.

The specific shape to avoid, named once more directly: a search for a method that would have won
the terminated arm's battery, dressed as theory selection. Nothing in this plan, and nothing this
plan recommends, is permitted to take that shape.

## 5. One-variable-per-round

Per `HANDOFF-V3.md` §2, one-variable-per-round is a locked operational rule: a round changes
exactly one thing relative to the prior round. This milestone honors it in two ways:

- **Within this milestone's own work**: the survey (Phase 5), the selection (Phase 5), and the
  task-family recommendation (Phase 6) are sequential, non-overlapping steps — each is fixed
  before the next begins, and no step revises an earlier step's frozen output (§2's criteria
  freeze is the concrete instance of this for selection).
- **In what this milestone recommends**: the Phase 6 instrument sketch (§3) must itself be
  designable as a single-variable change relative to whatever baseline it is compared against; a
  recommendation that bundles multiple simultaneous changes (new method AND new task family AND
  new scoring, all at once) violates the rule the terminated arm's own design was built to honor,
  and is inadmissible under §7 below.

A violation looks like: shortlisting a method, then revising the shortlist criteria after reading
that method's benchmark numbers; or recommending a task family whose instrument sketch changes
more than one axis relative to the terminated arm's own battery design without declaring which
axis is the one variable and treating the rest as held constant.

## 6. Instrument-residual masking

Named risk: the terminated instrument (`V3.1-BATTERY-DESIGN.md`, three generations) leaves
residuals — a format/parsing tax (the 395/479 parseable-but-wrong shape, §2), a ceiling-saturation
pattern (v1's three-prompt-quality indistinguishability, v2's 0.92+ ceiling), and a specific
corridor-placement failure (§3's difficulty-corridor problem) — that could be silently carried into
a new design, masking the new design's real behavior behind the old instrument's artifacts rather
than the new hypothesis's own properties.

What the Phase 6 recommendation must disclose, to show it is not carrying these residuals forward
unexamined:

- whether the recommended task family reuses any parsing/scoring machinery from the v3 line, and
  if so, why that reuse does not reintroduce the format tax that produced the 395/479 figure;
- whether the recommended family's difficulty knob is a genuinely new mechanism or a relabelled
  version of the v3 knob family that produced the corridor-placement failure;
- an explicit statement of what "real behavior" would look different from "old instrument
  residual" in the recommended family's own results, stated before any data exists to check it
  against — a falsifiable disclosure, not a retrospective one.

## 7. Pre-committed stop rules and falsifiers

Pre-committed now, before survey work begins:

- **"No method qualifies" is a legitimate Phase 5 outcome.** If zero surveyed methods satisfy both
  §2 criteria, Phase 5 reports that and stops — it does not lower the bar, widen the criteria, or
  extend the search window to manufacture a shortlist. A shortlist of fewer than the ≤3 ceiling,
  including zero, is a result, not a failure of the process.
- **A recommended task family is inadmissible** if any of the following hold: it fails the §6
  compliance test (§3); it violates one-variable-per-round as recommended (§5); it cannot state a
  falsifiable instrument-residual disclosure (§6); or its admission-path analysis (§3) cannot name
  an oracle independent of the generative process under test.
- **Falsifier for this document's own scope discipline**: if any survey entry, method evaluation,
  or task-family instrument decision appears in a future revision of THIS document rather than in
  Phase 5/6's own deliverables, that is a scope violation of §0 and must be corrected before the
  affected phase proceeds.

## 8. Deliverables, review gates, and record discipline

Deliverable files by phase:

- **Phase 4** (this phase): `experiments/method-research/RESEARCH-PLAN.md` (this document),
  `experiments/method-research/PLAN-REVIEWS.md`.
- **Phase 5**: the survey (REQ-38/39), the theory-only selection and shortlist (REQ-40/41).
- **Phase 6**: the task-family recommendation (REQ-42/43), the draft pre-registration
  (REQ-44, marked DRAFT, adoption deferred to the future arm), the analysis review record
  (REQ-46), and the milestone-completion JOURNAL/CHANGELOG entries (REQ-47).

Review gates and their ordering constraints:

- **REQ-45** — this gate — runs on the research PLAN, before survey execution begins. It is a hard
  `Depends on` for Phase 5: Phase 5 does not start until this gate's findings are adjudicated and
  committed.
- **REQ-46** — runs on the ANALYSIS after selection, before the prereg draft (REQ-44) is
  finalized. Ordered inside Phase 6, before REQ-44's finalization step.

Record discipline: REQ-47's JOURNAL + CHANGELOG entries land at milestone completion, first person
as Robert Li — that is Phase 6's job, not this phase's. This phase's own record discipline (T-C,
standing) is satisfied by the per-task JOURNAL/CHANGELOG entries this phase's tasks themselves
produce (Task 3 of this plan).
