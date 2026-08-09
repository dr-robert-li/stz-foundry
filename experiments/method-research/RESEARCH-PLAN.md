# Method research plan — survey, theory-only selection, task-family recommendation

**rev 3 · 2026-08-09** (rev 1: 2026-08-09; rev 2 adjudicates the five-reviewer panel in
`PLAN-REVIEWS.md`; rev 3 adds the F-22 amendment — a verification pass caught kimi-k3's F5
unadjudicated; adopted findings are tagged inline at their point of change)

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

**[F-05, gpt-sol-pro]** Search-protocol specifics, frozen alongside the rule above so Phase 5
cannot narrow discretion into ambiguity: dedup is by canonical arXiv id (a revision of an
already-found paper is the same row, not a new one); the applicable date for the 2026-06-28
cutoff is the paper's **original submission date**, not a later revision date, so a pre-cutoff
paper revised after the cutoff still qualifies and a post-cutoff paper is not excluded by an
earlier preprint elsewhere; screening is two-pass — title/abstract pass against the
inclusion/exclusion rule above, then a full read of anything that survives the first pass before
it is entered as a survey row.

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

**[F-02, gpt-sol-pro/kimi-k3/gpt-oss]** Each criterion is pinned with a concrete failing example,
so "checkable against its stated mechanism" is not indeterminate enough to rationalize any
candidate: a method fails criterion 1 if its own mechanism claims signal gain only at
harness-genome altitude, or only on the training/optimization signal itself with no stated
preservation claim once that signal is removed; a method fails criterion 2 if its published
evaluation protocol requires the held-out suite (or an equivalent) to be visible during the
method's own optimization loop, even if a paper's authors call that loop "validation."

**[F-03, gpt-sol-pro]** Validation status from the §1 survey record is **informational, not an
eligibility gate**: an unvalidated method may still be shortlisted if it satisfies both criteria
above on stated theory, consistent with REQ-40's theory-only selection; a validated method that
fails either criterion may not be shortlisted regardless of its benchmark strength. Validation
status is carried into the written per-method rationale as context, never as a pass/fail input.

Shortlist size: **≤3** methods. Each shortlisted method carries a written theoretical rationale
tracing it against both criteria individually — not a single blended justification. Win-likelihood
is explicitly **not** a criterion anywhere in this process; a method is not shortlisted because it
would probably win a bake-off, it is shortlisted because its own stated theory satisfies both
criteria above.

**[F-01, gpt-sol-pro/qwen-max]** If more than three methods satisfy both criteria, the tie-breaker
is **not** measured or projected win-likelihood: methods are ranked by the number of the four
terminated-arm diagnostics below (§2) their own stated evaluation design already addresses without
modification, ties broken by earliest primary-source publication date. If the tie-breaker itself
cannot separate a shortlist of exactly three, Phase 5 reports the full list of qualifiers, the
ranking, and the unresolved tie as part of the shortlist deliverable rather than picking arbitrarily.

The four terminated-arm diagnostics apply as **evaluation-design constraints** on any shortlisted
method — **[F-07, kimi-k3]** constraints on how the method's own evaluation protocol must be
built, never inputs to ranking or excluding candidate methods themselves; a method is not
disqualified for failing a diagnostic; its shortlisted evaluation design is required to address
the diagnostic — cited to the `PILOT-RESULTS.md` terminal report ("V3.1 GRID PROBE — NO QUALIFIER;
INSTRUMENT LINE TERMINATED," 2026-08-09):

- **[F-08, gpt-sol-pro]** the **395/479 parseable-but-wrong residual difficulty** (of 479 clean
  stage-1 tasks under relaxed scoring, 57 correct-and-strict, 11 correct-but-aliased, 395
  parseable-but-wrong, 16 no-artifact) — per the terminal report, this is what remained as genuine
  task difficulty **after** relaxed scoring removed the format/parsing tax, not the tax itself; a
  shortlisted method's evaluation design must not be blind to this failure shape, and must not
  conflate "reducing 395" with "removing format tax" — those are two different interventions;
- the **dialect-drift confirmation** (relaxed scoring's fence-dialect mitigation was **[F-20,
  kimi-k3]** mostly, not universally, confirmed — per-arm drops fell to ≤0.10 at every point once
  dialect drift was accounted for, with G3's dropB sitting exactly at that 0.10 boundary, not
  comfortably under it);
- the **inversion-as-format finding** (G4's apparent arm inversion under strict scoring turned out
  to be a parsing artifact, not a methodology-prompt effect, once relaxed scoring was applied);
- **seed-level variance under the clustered estimator** (seed-clustered t on six per-seed means
  produced wide 90% CIs — G1 alone spanned [0.385, 0.721] — so any shortlisted method's own
  noise-budget claims must be checked against an estimator of comparable conservatism, not a
  naive per-task CI that understates variance).

**[F-12, gpt-sol-pro]** Any citation of the terminated arm's outcome must preserve the terminal
report's own characterization: this was **instrument-line exhaustion, not a third null** — stage
2 never ran because no stage-1 point qualified, so the pre-registered three-nulls contingency is
unreachable and closed with the arm, not satisfied by it. Phase 5/6 deliverables that summarize
the terminated arm must carry this distinction forward rather than flattening it into "three
rounds nulled."

## 3. Task-family recommendation approach

Per REQ-42/43, the recommendation work (Phase 6) must include:

- **Admission-path analysis** — oracle class per the `admitVertical` discipline: what independent
  oracle can check the recommended task family's ground truth without depending on the same
  generative process being evaluated, mirroring the independent-reference-interpreter discipline
  named in `HANDOFF-V3.md` §1 T-A step 2 (a separate implementation, no shared helpers with the
  generator, recomputing every fact from the emitted artifact).
- **[F-11, gpt-sol-pro/kimi-k3/gemma4/gpt-oss]** **An explicit V3.1-§6 compliance test** the
  recommended family must pass — not a prose statement of belief, but a **concrete component-level
  mapping** of the recommended family against the barred hypothesis's known identity: task
  semantics (data-ops fact recovery vs. a genuinely different domain), oracle implementation (is
  it the same reference-interpreter machinery under a new name), parser/scoring machinery (reused,
  modified, or independently built), and the promotion-gate role it plays. A recommendation that
  cannot name at least one of these axes as *substantively* different — not relabelled — fails the
  test; renaming a component without changing its function does not pass it. The mapping is
  written before the recommendation is finalized, not retrofitted to justify it afterward.
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
  bar exists before any candidate method is read, so it cannot be shaped around a favorite, and
  each criterion now carries a concrete failing example (§2, F-02) so "checkable" cannot be
  stretched to admit whatever is found;
- written per-method theoretical rationale required for every shortlisted method (§2), so
  shortlisting is auditable against the frozen criteria rather than asserted;
- no post-hoc criteria edits — §2's criteria are frozen at this commit;
- the four terminated-arm diagnostics constrain evaluation design only, never method ranking or
  exclusion (§2, F-07) — closing the route by which "defeat the null" could re-enter through the
  diagnostics rather than the criteria;
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
  designable as a single-variable change relative to a **fixed baseline**.
  **[F-06, gpt-sol-pro/kimi-k3/qwen-max/gemma4/gpt-oss]** That baseline is pinned now, not left to
  Phase 6 to choose: it is the terminated arm's own v3.1 battery design (`V3.1-BATTERY-DESIGN.md`)
  as it stood at termination. Phase 6's recommendation must carry an explicit **change ledger**
  against that fixed baseline — task distribution, generator, oracle, output contract,
  parser/scoring, qualification gate, difficulty-knob mechanism, and noise estimator, each marked
  either "changed" or "held constant" — and must name exactly **one** of the changed entries as
  the round's variable. A recommendation that marks more than one entry "changed" without
  designating which single one is the variable, or that constructs an intermediate baseline not
  disclosed here to make a bundled change appear singular, violates this section and is
  inadmissible under §7 below.

A violation looks like: shortlisting a method, then revising the shortlist criteria after reading
that method's benchmark numbers; or recommending a task family whose instrument sketch changes
more than one axis relative to the terminated arm's own battery design without declaring which
axis is the one variable and treating the rest as held constant.

## 6. Instrument-residual masking

Named risk: the terminated instrument (`V3.1-BATTERY-DESIGN.md`, three generations) leaves
residuals — a format/parsing tax removed by relaxed scoring, the **[F-08, gpt-sol-pro]** 395/479
parseable-but-wrong genuine-difficulty residual that remained once that tax was removed (§2), a
**[F-09, gpt-sol-pro]** ceiling-saturation pattern (v1's three-prompt-quality
indistinguishability, v2's 0.92+ ceiling), and a specific corridor-placement failure (§3's
difficulty-corridor problem) — that could be silently carried into a new design, masking the new
design's real behavior behind the old instrument's artifacts rather than the new hypothesis's own
properties.

What the Phase 6 recommendation must disclose, to show it is not carrying these residuals forward
unexamined — **[F-10, gpt-sol-pro/qwen-max/gemma4/gpt-oss]** each disclosure below is a
**quantified, pre-registered prediction**, not a prose promise; a disclosure without a stated
threshold or observable does not satisfy this section:

- whether the recommended task family reuses any parsing/scoring machinery from the v3 line, and
  if so, a stated numeric target for the parseable-but-wrong rate under the new design (e.g. "≤10%
  parseable-but-wrong at the recommended corridor point, matching the terminated arm's post-format
  floor") so reuse is checked against a number, not a "why" narrative;
- whether the recommended family's difficulty knob is a genuinely new mechanism or a relabelled
  version of the v3 knob family that produced the corridor-placement failure, disclosed with the
  knob's stated step granularity relative to the corridor width it targets;
- an explicit prediction of what "real behavior" looks like versus "old instrument
  residual" in the recommended family's own results — named observable, expected direction, and
  numeric threshold (e.g., a specific gradient floor under seed-clustered estimation) — stated
  before any data exists to check it against. **[F-22, kimi-k3]** Within this milestone these
  disclosures are *pre-registered, falsifiable downstream*, not falsifiable here: no data can
  exist inside phases 4–6 to test them. The named checkpoint where each disclosure meets data is
  the future arm's format-stability gate + stage-1 readout, run under the adopted prereg — the
  first battery data produced under the new instrument. A disclosure unmet at that checkpoint
  fails there, not silently;
- a stated headroom target below ceiling (mirroring v2's 0.92+ saturation failure) so a new design
  that quietly re-saturates is caught by a pre-declared number rather than discovered after the
  fact.

## 7. Pre-committed stop rules and falsifiers

Pre-committed now, before survey work begins:

- **"No method qualifies" is a legitimate Phase 5 outcome.** If zero surveyed methods satisfy both
  §2 criteria, Phase 5 reports that and stops — it does not lower the bar, widen the criteria, or
  extend the search window to manufacture a shortlist. A shortlist of fewer than the ≤3 ceiling,
  including zero, is a result, not a failure of the process.
- **[F-16, gpt-sol-pro]** **A disputed qualification, an unresolved over-subscription tie (§2,
  F-01), or a survey conducted outside the frozen §1 search protocol** each trigger the same "no
  method qualifies, report and stop" path rather than a forced shortlist — these are process
  failures, not close calls to be resolved in whichever direction produces three names.
- **[F-19, qwen-max/gpt-oss]** **Phase 6 does not require a non-empty Phase 5 shortlist to
  proceed.** The admission-path analysis and instrument sketch (§3) are properties of the
  recommended task family, not of a chosen method, and may be produced against a zero-method
  result. If the shortlist is empty, the draft pre-registration's (REQ-44) "chosen method" field
  is marked deferred, not filled with a method that did not clear §2.
- **A recommended task family is inadmissible** if any of the following hold: it fails the
  V3.1-§6 compliance test (§3); it violates one-variable-per-round as recommended (§5); it cannot
  state a quantified instrument-residual disclosure (§6); or its admission-path analysis (§3)
  cannot name an oracle independent of the generative process under test.
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
- **[F-17, qwen-max]** **REQ-46** — runs on **the Phase 5 selection write-up** (the shortlist plus
  its per-method written rationale, §2) as it stands after selection — before the prereg draft
  (REQ-44) is finalized. Ordered inside Phase 6, before REQ-44's finalization step.
- **[F-13, gpt-sol-pro]** If REQ-46's review finds the Phase 5 selection write-up shows
  method-shopping (criteria applied inconsistently, or a rationale that reads as post-hoc), the
  finding is adjudicated the same way this phase's findings are (ADOPTED/REJECTED-with-reason,
  §-below-precedent), and an ADOPTED finding of that kind requires the shortlist to be
  **discarded and reselected against the frozen §2 criteria** — not patched, not narrowed, not
  reasoned around. The prereg draft may not be finalized on a shortlist under an open
  method-shopping finding.

Record discipline: REQ-47's JOURNAL + CHANGELOG entries land at milestone completion, first person
as Robert Li — that is Phase 6's job, not this phase's. **[F-21, kimi-k3]** This phase's own
record discipline (the standing per-task JOURNAL/CHANGELOG obligation, `HANDOFF-V3.md` §2 T-C) is
satisfied by this phase's own tasks producing their own JOURNAL/CHANGELOG entries as they complete
— a mechanism this document names without depending on a specific task number, since a reader of
this document alone has no visibility into the phase's task breakdown.
