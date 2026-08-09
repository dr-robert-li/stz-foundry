# Cross-AI review — RESEARCH-PLAN.md rev 1 (2026-08-09)

This panel runs through the review-lane seam directly (`gsd-tools review-lane invoke`)
rather than the `/gsd-review` slash command: `/gsd-review` writes REVIEWS.md into
`.planning/`, which this project gitignores (`planning.commit_docs: false`), and ROADMAP
success criterion 3 requires the adjudication record COMMITTED — same lanes, same seam,
committed destination.

**Panel:** gpt-sol-pro (UNSOUND), kimi-k3 (SOUND-WITH-CHANGES), qwen-max
(SOUND-WITH-CHANGES), gemma4 (SOUND-WITH-CHANGES), gpt-oss (UNSOUND). Five of five target
lanes produced output; no lane was dropped.

**Dead lanes:** None. Invocation-path note: the three openrouter lanes (gpt-sol-pro,
kimi-k3, qwen-max) ran through the house seam
(`gsd-tools review-lane invoke --slug opencode --model <id> --as <name>`) with
`~/.opencode/bin` prepended to PATH. The two local ollama lanes (gemma4, gpt-oss) hit
the seam's 120s `timeoutFloorMs` — too short for a cold load of a 19GB/13GB model against
the full prompt — and fell back to direct HTTP POST against
`localhost:11434/v1/chat/completions` per the plan's fallback allowance, with
`_memory-watchdog.sh` running throughout and each model stopped before the next was
loaded.

**Disposition:** 18 of 21 global findings adopted, 3 rejected with reason. Headline rev-2 changes:
the one-variable-per-round baseline (§5) is pinned to the terminated arm's v3.1 battery design with
a mandatory change ledger naming exactly one variable (F-06, the largest cross-reviewer cluster —
5 of 5 reviewers raised a version of it); the V3.1-§6 compliance test (§3) is upgraded from a prose
statement to a concrete component-level mapping against the barred hypothesis's identity (F-11, also
5 of 5); every instrument-residual disclosure and design constraint (§2, §6) now carries a
quantified, pre-registered threshold rather than a promise (F-10, 5 of 5); the plan's own
mischaracterization of the 395/479 figure as the format tax itself — when the terminal report says
it is what remained *after* the tax was removed — is corrected everywhere it appeared (F-08); a
tie-breaker rule closes the over-three-qualifiers gap (F-01); the terminated-arm diagnostics are
pinned as evaluation-design constraints only, never a method filter, closing kimi-k3's
defeat-the-null re-entry route (F-07); and REQ-46 now names its own target document and carries an
explicit discard-and-reselect rule if it finds the shortlist method-shopped (F-17, F-13). Rejected:
a request to read "before any survey reading" as blanket field-ignorance (F-04, misreads what the
freeze protects, precedent below); a request to add a third formal review gate on the Phase 5
shortlist specifically (F-14, gate placement is fixed by `.planning/REQUIREMENTS.md`, outside this
document's authority to amend); and a request to pin Phase 6's internal prereg-drafting sequence
here (F-15, that is Phase 6's own planning responsibility, not this scoping document's).

## Findings and dispositions

Global sequence F-01…F-21 across all five reviewers; duplicate findings raised by more than one
reviewer are merged into a single F-NN naming every reviewer who raised it.

- F-01 (gpt-sol-pro F1, qwen-max F1): ADOPTED — §2 gets an explicit tie-breaker for more than
  three qualifying methods (rank by diagnostics already addressed, then publication date; an
  unresolved tie reports the full qualifier list rather than picking arbitrarily), and §7 folds an
  unresolved tie into the "no method qualifies, report and stop" path.
- F-02 (gpt-sol-pro F2, kimi-k3 F1, gpt-oss F1, gpt-oss F6): ADOPTED — §2's two criteria each get a
  concrete failing example, so "checkable against its stated mechanism" cannot be stretched to
  admit nearly any candidate.
- F-03 (gpt-sol-pro F3): ADOPTED — §2 states the §1 validation verdict is informational only, never
  a shortlisting eligibility gate, consistent with REQ-40's theory-only selection.
- F-04 (gpt-sol-pro F4): REJECTED — reason: the finding reads "before any survey reading" as a
  claim of blanket field-ignorance (the plan already names GEPA and carries forward META-RSI, so
  literal ignorance is impossible and was never the claim). The freeze's actual protection is
  against shaping criteria around a *specific candidate's claimed results* found during the survey
  — general awareness that GEPA-style methods exist is disclosed context, not a breach of that
  protection. This misreads what the clause is for, the same shape as the gemma4 clause-3
  rejection in `V3.1-REVIEWS.md`: a proposed weakening that would readmit exactly the failure mode
  the clause exists to catch, here by treating routine field awareness as equivalent to reading
  specific survey results before freezing criteria. Rejected; §2's freeze wording stands.
- F-05 (gpt-sol-pro F5): ADOPTED — §1 pins dedup-by-canonical-id, the 2026-06-28 cutoff resolving
  against original submission date not revision date, and a two-pass title/abstract-then-full-read
  screening procedure.
- F-06 (gpt-sol-pro F6/F7/F8/F9, kimi-k3 F3, qwen-max F3, gemma4 F1, gpt-oss F3): ADOPTED — §5's
  one-variable-per-round baseline is pinned to the terminated arm's v3.1 battery design as it stood
  at termination; Phase 6 must produce a component-level change ledger against that fixed baseline
  and name exactly one changed component as the variable. The largest single finding cluster in the
  panel — every reviewer that addressed one-variable-per-round raised a version of this gap.
- F-07 (kimi-k3 F2): ADOPTED — §2 states explicitly that the four terminated-arm diagnostics
  constrain the shortlisted method's *evaluation design* only; they are never inputs to ranking or
  excluding candidate methods, closing the route by which defeat-the-null could re-enter through
  the diagnostics layer rather than the frozen criteria layer.
- F-08 (gpt-sol-pro F10): ADOPTED — §2 and §6's characterization of the 395/479 figure is corrected
  to match the terminal report: it is the genuine-difficulty residual that remained *after*
  relaxed scoring removed the format/parsing tax, not the tax itself. The plan's rev-1 text
  conflated the two everywhere it cited the figure; both occurrences are fixed.
- F-09 (gpt-sol-pro F11): ADOPTED — §6's disclosure list adds the ceiling-saturation residual
  (v1's prompt-quality indistinguishability, v2's 0.92+ ceiling) alongside the format-tax and
  corridor-placement residuals already named.
- F-10 (gpt-sol-pro F12/F13, qwen-max F2/F4, gemma4 F2, gpt-oss F4): ADOPTED — every disclosure and
  design constraint in §2 and §6 now carries a quantified, pre-registered threshold or named
  observable rather than a prose promise (a parseable-but-wrong rate target, a knob-granularity
  ratio, a stated gradient floor, a headroom target below ceiling). Tied with F-06 as the panel's
  largest cluster — four of five reviewers raised a version of "falsifiable in name only."
- F-11 (gpt-sol-pro F14/F15/F16, kimi-k3 F4, gemma4 F3, gpt-oss F2/F5): ADOPTED — §3's V3.1-§6
  compliance test is upgraded from a prose "written statement" to a required component-level
  mapping (task semantics, oracle implementation, parser/scoring machinery, promotion-gate role)
  naming at least one axis as substantively different, not relabelled. All five reviewers raised a
  version of "self-attestation is not a discriminator."
- F-12 (gpt-sol-pro F17): ADOPTED — §2 adds an explicit instruction to preserve the terminal
  report's own "instrument-line exhaustion, not a third null" characterization in any future
  citation of the terminated arm.
- F-13 (gpt-sol-pro F18): ADOPTED — §8 adds a discard-and-reselect rule: an ADOPTED REQ-46 finding
  of method-shopping in the Phase 5 selection write-up requires the shortlist to be discarded and
  reselected against the frozen §2 criteria, not patched or reasoned around, and blocks REQ-44
  finalization until resolved.
- F-14 (kimi-k3 F6): REJECTED — reason: the finding asks for a formal review gate on the Phase 5
  shortlist itself, before Phase 6 begins building on it. REQ-45 (before Phase 5) and REQ-46
  (after selection, before prereg finalization) are the two gates fixed by
  `.planning/REQUIREMENTS.md`, a milestone-level document this Phase-4 scoping plan has no
  authority to amend by adding a third gate. F-13's discard-and-reselect rule closes the practical
  risk the finding names — a contaminated shortlist cannot survive to a finalized prereg — without
  restructuring the review-gate sequence REQUIREMENTS.md already locked.
- F-15 (gpt-sol-pro F19): REJECTED — reason: the finding asks this document to pin Phase 6's
  internal sequencing of when the draft prereg's contents are chosen relative to the
  recommendation analysis. That is Phase 6's own operational planning responsibility; prescribing
  it here would have this Phase-4 scoping document perform work §0 explicitly reserves for later
  phases. Phase 6's own plan is the right place to pin that order.
- F-16 (gpt-sol-pro F20): ADOPTED — §7 extends the "no method qualifies" stop path to cover a
  disputed qualification, an unresolved over-subscription tie, and a survey conducted outside the
  frozen §1 protocol — each is a process failure routed to the same stop rule, not a close call
  resolved toward a forced shortlist.
- F-17 (qwen-max F5): ADOPTED — §8 names REQ-46's review target explicitly as the Phase 5 selection
  write-up (shortlist plus per-method rationale), replacing the undefined "the ANALYSIS."
- F-18 (qwen-max F6): ADOPTED — every reference to the terminated arm's termination clause is
  written as "V3.1-§6" throughout rev 2, distinguishing it from this document's own §6
  (instrument-residual masking) wherever both could otherwise be read as the same "§6."
- F-19 (qwen-max F7, gpt-oss F7): ADOPTED — §7 states explicitly that Phase 6's admission-path
  analysis and instrument sketch do not require a non-empty Phase 5 shortlist; an empty shortlist
  leaves the draft prereg's "chosen method" field deferred rather than blocking Phase 6 outright.
- F-20 (kimi-k3 F7): ADOPTED — §2's dialect-drift diagnostic wording is softened from "confirmed"
  to "mostly, not universally, confirmed," and notes G3's dropB sitting exactly at the 0.10
  boundary rather than comfortably under it, matching the terminal report's own qualified language.
- F-21 (kimi-k3 F8): ADOPTED — §8's record-discipline paragraph no longer cites "Task 3 of this
  plan" (a reference invisible to a reader of this document alone); it now describes the mechanism
  functionally as this phase's own tasks producing their own JOURNAL/CHANGELOG entries.

## Review prompt

You are reviewing a research plan that gates a research milestone. Attack the plan as an
adversary — do not summarize it. Assume the author wants a particular answer (a shortlisted
method, a recommended task family) and hunt for where the plan lets them get it despite its own
stated guardrails.

The plan descends from a terminated experiment arm (`dataops-agent-pilot`, three generations, all
null). The terminated arm's own governing document, `V3.1-BATTERY-DESIGN.md` §6, bars any
successor instrument for its hypothesis under any label, on substance not name. The plan you are
reviewing must not be a disguised route back to that barred family, and must not repeat the
terminated arm's own failure modes in its own process.

Attack specifically, under three named headings, plus a fourth for anything else:

1. **Method-shopping / "defeat the null" framing** — does the plan's selection process actually
   freeze its theoretical criteria before survey results are seen, or does it leave a door open to
   shape criteria around whichever method looks strongest once results are in? Is
   "win-likelihood" excluded in the letter of the plan but reachable in practice through some other
   route (e.g. criteria vague enough to rationalize post hoc)?
2. **One-variable-per-round** — does the plan's own process, and what it tells future phases to
   recommend, actually hold to changing one thing at a time? Look for places where a "recommended
   task family" could bundle multiple simultaneous changes (method + task family + scoring) without
   the plan forcing that to be visible.
3. **Instrument-residual masking** — could the recommended approach silently inherit the terminated
   v3/v3.1 instrument's residuals (its format/parsing tax, its ceiling-saturation pattern, its
   difficulty-corridor placement failure) while appearing to be a fresh design? Does the plan force
   a disclosure that would catch this, and is that disclosure actually falsifiable or just a
   promise?
4. **Other defects** — anything else that weakens the plan's guardrails, its scope discipline
   (should this document contain content that belongs to a later phase, or vice versa), its
   citation of the terminated arm's diagnostics, or its review-gate ordering.

You are sent the full plan text plus two source documents it cites: the `V3.1-BATTERY-DESIGN.md`
§6 termination clause and the `PILOT-RESULTS.md` terminal-report section. Check the plan's claims
against those source documents directly — do not take the plan's own characterization of them on
faith.

A reviewer finding nothing wrong under a heading is a valid but rare outcome; do not manufacture a
finding to fill a heading.

Format your response exactly as follows:

- Open with a single line of the exact form `**Verdict: X**` where X is one of SOUND,
  SOUND-WITH-CHANGES, or UNSOUND.
- Number every finding you raise `F1`, `F2`, `F3`, ... in the order you raise it, within your own
  response (do not renumber across headings).
- Organize findings under the four headings above, in that order. It is fine for a heading to have
  zero findings.

## Reviewer: gpt-sol-pro

**Verdict: UNSOUND**

## 1. Method-shopping / "defeat the null" framing

**F1. The shortlist has no precommitted rule for choosing among methods that satisfy the two permissive criteria.** The plan caps the shortlist at three, but does not say what happens if four or more methods qualify. Phase 5 can therefore select whichever three appear most promising after reading their results while truthfully claiming that every selected method passed the frozen criteria. This is a direct route to win-likelihood selection outside the letter of §2. The plan needs a deterministic tie-breaker or must shortlist every qualifier and report that the cap was exceeded.

**F2. The `α>0` criterion is too indeterminate to constrain post-hoc rationalization.** “Must claim,” “checkable against its stated mechanism,” “injects or preserves positive signal,” and “at the altitude this milestone operates at” have no operational definitions or pass/fail tests. A reviewer can accept nearly any optimization method by narrating how its mechanism might preserve signal, or reject it by demanding stronger altitude correspondence. Requiring separate written rationales makes that discretion auditable only as prose; it does not remove it.

**F3. The plan collects validation evidence but deliberately disconnects it from selection.** Section 1 requires each survey entry to receive a validated/unvalidated verdict, yet §2 does not state whether an unvalidated method may be shortlisted or how validation status affects eligibility. This permits benchmark strength to influence selection informally while the recorded rationale cites only theory. Conversely, Phase 5 could shortlist a method whose only support is the method authors’ own mechanistic assertion. The eligibility rule for each validation verdict must be frozen before the survey.

**F4. “Before any survey reading happens” is not a credible provenance claim.** The plan already names GEPA, prescribes a GEPA citation graph, carries forward `META-RSI-SURVEY.md`, and defines criteria using concepts evidently informed by prior research. That does not itself invalidate the criteria, but it means the relevant safeguard is not temporal ignorance. The plan needs to identify the actual information boundary: which candidate papers and results were already known when the criteria were written, and which evidence remains blinded until criteria approval. Without that record, the freeze can preserve criteria already tailored to known favorites.

**F5. The survey procedure is not reproducible enough to prevent selective candidate discovery.** “Citation-graph pulls from GEPA’s own citing-paper list,” named keywords, and category listings do not freeze databases, query syntax, search date, citation depth, deduplication, screening procedure, or treatment of papers crossing the cutoff through revisions. “One row per method found” leaves substantial discretion over what is found and what counts as one method. A favored method can enter through expansive interpretation while inconvenient comparators are missed without an auditable protocol.

## 2. One-variable-per-round

**F6. Sequential documents are incorrectly treated as one-variable experimental rounds.** Survey, selection, and task-family recommendation being sequential and non-overlapping does not establish that only one experimental variable changes. Those are workflow stages, not controlled comparisons. The relevant question is whether the eventual proposed experiment changes one causal axis relative to a frozen baseline; §5’s first defense does not address that question.

**F7. The baseline against which “one variable” is measured is not frozen.** The sketch need only be designable as a single-variable change relative to “whatever baseline it is compared against.” That lets Phase 6 construct a convenient new baseline containing the desired method, task format, oracle, parser, and scoring, then declare only the final task-family delta to be the variable. The later example refers instead to the terminated battery, creating an unresolved contradiction. Phase 6 needs a predeclared baseline and an exhaustive component-level diff against it.

**F8. The plan authorizes a bundled recommendation without requiring the bundle to be exposed.** The milestone selects methods in Phase 5 and recommends a task family, oracle, difficulty mechanism, scoring/parsing treatment, and noise plan in Phase 6. These choices can jointly define a new instrument, but there is no required change ledger showing method, task distribution, prompt budget, generator, oracle, output contract, parser, endpoint, qualification gate, and estimator as either changed or held constant. The generic inadmissibility sentence is not enforceable without that artifact.

**F9. A genuinely different task family may make “hold everything else constant relative to v3” incoherent.** Changing the task family can necessarily change artifacts, oracle semantics, scoring, difficulty controls, and perhaps output format. The plan neither distinguishes constitutive changes required by the one permitted variable from independent co-interventions nor explains how their effects will be isolated. Calling all such changes part of “task family” would turn one-variable-per-round into a labeling exercise.

## 3. Instrument-residual masking

**F10. The plan materially misstates the terminal report by treating `395/479 parseable-but-wrong` as a format/parsing tax.** The source says the alias seam recovered 95 artifacts that strict parsing would have dropped, relaxed drop rates fell to at most 0.10, and “relaxation removed the format tax.” The 395 parseable-but-wrong cases are what remained underneath as genuine difficulty, not parsing loss. Sections 2 and 6 repeatedly attach the 395 figure to the format tax and ask parser-reuse disclosures to explain how they avoid reproducing it. This conflation could encourage a successor to alter scoring until genuine wrong answers disappear, exactly the kind of parser/scoring route §6 prohibits for the barred hypothesis.

**F11. The required disclosures omit the ceiling-saturation residual that §6 itself names.** The plan acknowledges v1’s prompt-quality indistinguishability and v2’s `0.92+` ceiling, but Phase 6 is required to disclose only parser/scoring reuse, difficulty-knob ancestry, and a real-behavior distinction. There is no mandatory headroom criterion, prompt-quality ordering check, anti-saturation probe, or stop rule for a ceiling. A new family can therefore reproduce two generations’ principal failure mode while satisfying every listed disclosure.

**F12. The difficulty-corridor safeguard is a design narrative, not a falsifiable control.** Requiring a “stated granularity story” does not require prospective calibration data, maximum step size, corridor-hit probability, independent pilot, or a stop rule if the knob again jumps from easy/no-gradient to hard/gradient. The terminal report’s actual diagnosis was precisely that the knob did this. Phase 6 can promise that a new mechanism is finer without supplying evidence capable of falsifying the promise before adoption.

**F13. The nominally “falsifiable” residual disclosure lacks a required test or decision threshold.** A statement about how “real behavior” would differ from an “old instrument residual” can be linguistically falsifiable while remaining experimentally unusable. The plan does not require named observables, expected directions, thresholds, sample size, estimator, or a consequence if the residual signature appears. It also does not require the later preregistration to carry the disclosure forward unchanged. This is a promise, not a binding falsifier.

**F14. Parser/scoring reuse is merely disclosed, even though §6 imposes a categorical prohibition for the barred hypothesis.** The source states that “any change to the parsing seam after termination is a prohibited new generation of this line.” The plan instead asks whether machinery is reused and, if so, why reuse does not reintroduce format tax. For a recommendation that retains the barred substantive hypothesis, neither reuse nor replacement can cure the prohibition. The compliance gate must first classify the hypothesis and task family; only designs independently established as outside the barred conjunction may discuss parser design.

## 4. Other defects

**F15. The §6 compliance test is self-attestation without a substantive identity test.** A “written statement of why” a recommendation is different can be satisfied by renaming or lightly reframing data-ops fact recovery. The plan provides no frozen taxonomy for hypothesis identity, task-family identity, or the “phase-5 promotion gate” role. It also does not require an adversarial comparison against the exact prohibited tuple: prompt-search versus hand-written baseline, data-ops fact recovery, used as the promotion gate. This leaves the central termination clause enforceable by rhetoric.

**F16. The plan leaves an obvious route to revive the same hypothesis through a nominally different task family.** The source permits diagnostics to inform instruments for different hypotheses or task families, but the plan never defines how materially different a task family must be. A recommendation could preserve prompt-search versus hand-written baseline and the same fact-recovery structure while changing domain nouns, artifact schema, or oracle implementation. Admission-path analysis based on an independent reference interpreter does not establish substantive difference; it may actually reproduce the former family’s architecture.

**F17. The terminal history is incompletely represented in a way that can distort successor reasoning.** The source explicitly says this was “instrument-line exhaustion, not a third null”: v3’s stage 2 never ran because no point qualified. Any milestone record descending from this arm must preserve that distinction. The plan calls out diagnostics but does not require Phase 5 or Phase 6 to state that the final generation did not test the promoted comparison. That omission makes it easier to frame the research as finding a method that “defeats three nulls,” a premise the source expressly rejects.

**F18. REQ-46 occurs too late to prevent selection discretion and has no prescribed remedy.** The second adversarial review runs “after selection.” By then the survey has been screened, ambiguous criteria interpreted, and at most three methods chosen. If review finds method-shopping, the plan does not say whether Phase 5 must be invalidated and rerun from the frozen candidate set, whether criteria may change, or whether the milestone must stop. A post-selection review without a rollback rule is documentation of contamination, not prevention.

**F19. The gate ordering permits the draft preregistration to be shaped around an already chosen recommendation.** REQ-46 occurs after selection and before the preregistration is finalized, but the draft preregistration and task-family recommendation are both Phase 6 outputs. The plan does not freeze hypotheses, endpoints, controls, and exclusion rules before recommendation analysis exposes likely behavior. Marking the preregistration “DRAFT” does not prevent outcome-responsive design; adoption being deferred is irrelevant to when its contents were chosen.

**F20. The stop rules do not cover the most likely ambiguous outcomes.** There is a stop rule for zero qualifiers, but none for too many qualifiers, disputed qualification, incomplete search coverage, an unvalidated qualifier, inability to isolate one variable without constitutive changes, or a recommendation that avoids one residual while retaining another. Those are precisely the states in which discretionary judgment can recover the desired shortlist or task family.

## Reviewer: kimi-k3

**Verdict: SOUND-WITH-CHANGES**

## 1. Method-shopping / "defeat the null" framing

**F1.** The frozen criteria are frozen in time but not in resolution. Criterion 1 ("α>0 injection/preservation… the claim must be checkable against its stated mechanism") is an interpretive judgment, not a test: essentially every reflective-evolution / textual-gradient paper asserts a mechanism from which positive-signal injection can be "checked." A criterion that nearly all candidates pass does not constrain selection; the actual shortlisting then happens in the unwritten gap between "passes both criteria" and "≤3 slots," and that gap is exactly where win-likelihood re-enters, now invisible. The freeze prevents *editing the text* of the criteria; it does nothing about criteria vague enough to rationalize any shortlist. Fix: require the plan to state, per criterion, what a *failing* method concretely looks like (a rejection example), pinned at this commit.

**F2.** The four terminated-arm diagnostics are applied as "binding design constraints" on shortlisted methods (§2). But "must not be blind to the 395/479 failure shape" and "noise-budget claims must survive a clustered estimator" are, functionally, "would this method have avoided the terminated arm's null." That is the defeat-the-null search §4 names, re-entering through the constraint layer rather than the criteria layer. The plan never distinguishes "diagnostic as design constraint on the *evaluation*" (legitimate) from "diagnostic as filter on the *method*" (defeat-the-null). As written, §2 licenses the latter. The plan should state explicitly that diagnostics constrain the evaluation design only and may not be used to rank or exclude methods.

## 2. One-variable-per-round

**F3.** §5's rule for the Phase 6 recommendation is unfalsifiable as stated: the sketch must be "a single-variable change relative to *whatever baseline it is compared against*" — with the baseline left undefined at plan time. Any bundled change (new method + new task family + new scoring) can be made "one variable" by choosing the baseline post hoc. Since the milestone's entire purpose is to change the task family *and* shortlist a method, the bundle is the default outcome, and the plan's only defense is a baseline-selection convention it never specifies. Fix: pin now that the declared baseline is the terminated arm's v3.1 battery design, and require Phase 6 to enumerate every axis that differs, naming exactly one as the variable — as §5's own violation example demands but does not operationalize.

## 3. Instrument-residual masking

**F4.** The §6 compliance test (§3) is self-certification with no adjacency criterion. The barred object is hypothesis × task-family × promotion-gate; the plan keeps the hypothesis's method side (prompt-search at agent-definition altitude is precisely the surveyed families) and the promotion-gate framing (REQ-44's prereg feeds a future gated arm), changing only the task family. §6 of the source document explicitly permits "instruments for DIFFERENT hypotheses or task families" — but the plan's compliance test is "a written statement of why the recommended family is not the barred one," checked by the same people who wrote the recommendation, with no operational test of task-family similarity (a relabelled data-ops fact-recovery family — e.g. data-ops fact-recovery with a renamed artifact format — has no stated discriminator against it). The disclosure exists but its falsifiability is unspecified: nothing says what observation would prove the statement false.

**F5.** §6's "falsifiable disclosure, stated before any data exists" is promissory within this milestone's own horizon. Phase 6 produces a recommendation and a *draft* prereg whose adoption is deferred; no data against which the residual disclosure could be falsified can exist inside the milestone. So the inadmissibility rule in §7 ("cannot state a falsifiable disclosure") reduces to "cannot write the paragraph" — a low bar that any competent author clears. The plan should either name the future checkpoint where the disclosure gets tested against data, or downgrade its claim from "falsifiable" to "pre-registered, falsifiable downstream."

## 4. Other defects

**F6.** Review-gate ordering leaves the shortlist itself ungated. REQ-45 gates this plan; REQ-46 gates the Phase 6 analysis "before the prereg draft is finalized." But Phase 5's actual selection output — the shortlist, where method-shopping would physically occur — receives no adversarial gate before Phase 6 builds the task-family recommendation and a draft pre-registration on top of it. §4 advertises REQ-46 as attacking method-shopping "after the selection has actually happened," but by then the shopped selection has already propagated into downstream artifacts. A gate on the Phase 5 shortlist deliverable, before Phase 6 opens, is missing.

**F7.** Citation accuracy against the sources checks out on the figures I verified (395/479 decomposition, G1 CI [0.385, 0.721], ≤0.10 drops, dialect-drift and inversion-as-format dispositions, 479/480 cleanliness). However, the plan's §2 renders the dialect-drift finding as "confirmed… once dialect drift was accounted for," slightly stronger than the source's "drops were *mostly* fence-dialect drift, the mitigation premise confirmed" — and the source table shows G3's dropB sitting exactly at 0.10, at the boundary of the "≤0.10" claim. Minor, but an adversarial review of a plan whose entire authority rests on faithful carriage of terminal diagnostics should not round "mostly" into a clean universal.

**F8.** §8's record-discipline paragraph is internally confused about scope: it assigns REQ-47's JOURNAL/CHANGELOG to Phase 6, then justifies *this* phase's discipline via "Task 3 of this plan" — a task that appears nowhere in this document. If Phase 4 has a task list, it is referenced but not contained; if not, the citation is dangling. Either way the plan's own scope-discipline falsifier (§7) cannot be applied to content the plan gestures at but does not show.

## Reviewer: qwen-max

**Verdict: SOUND-WITH-CHANGES**

_[Reviewer opened with: "Let me verify a few more claims against the codebase before writing the review." before its verdict line — reordered here so the verdict is the first content line, per the house record format; nothing else in the output was altered.]_

## 1. Method-shopping / "defeat the null" framing

**F1.** §2's two theoretical criteria (α>0 injection, sealed held-out compatibility) are necessary conditions but not sufficient to determine the shortlist. The plan caps the shortlist at ≤3 but provides no rule for selecting among qualifying methods if more than three satisfy both criteria. An author who wants to shortlist a particular method can truthfully claim it satisfies both frozen criteria while silently selecting it because it would have beaten the terminated arm's null. The "win-likelihood is not a criterion" declaration is honored in the letter but reachable in practice through the unspecified selection-from-qualifiers gap.

**F2.** §2's four "binding design constraints" are stated as findings from the terminated arm's terminal report, not as actionable pass/fail criteria for shortlisted methods. Diagnostics 2 (dialect-drift confirmation) and 3 (inversion-as-format) describe confirmed findings but state no specific property a shortlisted method must exhibit or evaluation feature it must include. Diagnostic 1's "must not be blind to this failure shape" is not falsifiable — a one-sentence mention in the rationale would technically satisfy it. A reviewer cannot fail a method against these constraints because the constraints are not stated as testable requirements. The plan calls them "binding" but does not bind them to anything measurable.

## 2. One-variable-per-round

**F3.** §5 requires the instrument sketch to be "designable as a single-variable change relative to whatever baseline it is compared against" but does not require the recommendation to declare which single axis is the variable and which are held constant. "Designable as" is a possibility claim, not a declaration. A sketch could be designable as single-variable in multiple incompatible ways (method changed, task family held constant; or task family changed, method held constant), with the actual variable left ambiguous until after results are seen. The plan should require the recommendation to name the one variable explicitly and list the held-constant axes.

## 3. Instrument-residual masking

**F4.** §6's third disclosure requires "an explicit statement of what 'real behavior' would look different from 'old instrument residual' in the recommended family's own results, stated before any data exists to check it against — a falsifiable disclosure, not a retrospective one." The plan calls for falsifiability but does not require measurable thresholds. A recommendation could state "real behavior shows a gradient in the corridor; residual shows ceiling saturation" without specifying what gradient, what corridor, or what ceiling — making the disclosure technically present but practically unfalsifiable. The plan should require the disclosure to include specific, pre-registered numeric predictions (e.g., "baseline 90% CI ⊆ [0.30, 0.60] with gradient ≥ 0.10 under seed-clustered estimation on ≥6 seeds").

## 4. Other defects

**F5.** §8 says REQ-46 "runs on the ANALYSIS after selection, before the prereg draft (REQ-44) is finalized" but the plan never defines what document constitutes "the analysis." Phase 5 produces the shortlist; Phase 6 produces the recommendation. The review gate's target is unnamed and its required contents are unspecified, so a reviewer cannot verify the analysis is complete because completeness is undefined.

**F6.** The plan uses "§6" to refer to both V3.1-BATTERY-DESIGN.md §6 (in §0, §3, §7's "§6 compliance test") and its own §6 (in §7's "falsifiable instrument-residual disclosure (§6)"). Both senses appear in §7's stop rules within the same bullet list. A reviewer or future-phase executor could misattribute a requirement to the wrong document. The plan should use distinct labels (e.g., "V3.1-§6" vs. "this document's §6").

**F7.** §7 says "Phase 5 reports that and stops" if zero methods qualify, but does not specify whether Phase 6 (task-family recommendation) proceeds independently or is also stopped. If Phase 6 proceeds without a shortlisted method, the recommendation's instrument sketch (§3) lacks a method component that the sketch's difficulty-corridor and noise-budget discussions implicitly require. The plan should state explicitly whether Phase 6 is contingent on a non-empty shortlist.

## Reviewer: gemma4

**Verdict: SOUND-WITH-CHANGES**

### 1. Method-shopping / "defeat the null" framing
No findings. The criteria in §2 are pinned to theoretical mechanism ($\alpha > 0$ injection) and protocol compatibility (sealed held-out), rather than performance projections. The explicit exclusion of win-likelihood, combined with the requirement for an auditable trace against each criterion individually, effectively closes the "defeat the null" backdoor.

### 2. One-variable-per-round
**F1**: The plan allows a recommendation to be designable as a single-variable change "relative to whatever baseline it is compared against" (§5). This creates a baseline-selection loophole. An author could bundle multiple changes (e.g., new method and new task family) relative to the terminated arm, but then define a synthetic or intermediary baseline (e.g., the old method on the new task family) to claim they are only changing one variable in the final comparison. To honor the "one-variable-per-round" rule at the project level, the plan must specify that the delta from the terminated arm's configuration must be decomposed into sequential, gated steps, rather than allowing the author to choose a baseline that masks cumulative changes.

### 3. Instrument-residual masking
**F2**: The requirement for a "falsifiable disclosure" regarding real behavior vs. old instrument residuals (§6) is currently a request for a *statement*, not a structural constraint on the *content* of that statement. Without requiring the disclosure to include quantitative thresholds or predefined divergence patterns (e.g., specific slope changes in the difficulty gradient), this remains a promise of transparency rather than a falsifiable guardrail.

**F3**: The §6 compliance test (§3) is a qualitative "written statement" justifying why the recommendation is not a relabelled version of the barred hypothesis. Because `V3.1-BATTERY-DESIGN.md` §6 prohibits successors on *substance*, and because task families can be subtly modified to appear new while preserving the same underlying difficulty/parsing tax, a mere "statement" is insufficient. This requires a concrete mapping of the recommended family's properties against the terminated family's known residuals (e.g., proving the "difficulty knob" operates on a different mechanical axis).

### 4. Other defects
No findings. The plan correctly cites the four terminal diagnostics from `PILOT-RESULTS.md` and adheres to the termination scope defined in `V3.1-BATTERY-DESIGN.md` §6. Review-gate ordering (REQ-45 $\to$ Phase 5 $\to$ REQ-46) is logically sound.

## Reviewer: gpt-oss

**Verdict: UNSOUND**

### 1. Method-shopping / "defeat the null" framing

F1 | The plan’s “α>0 injection/preservation at prompt‑search altitude” criterion does not specify a concrete, empirical verification procedure or metric that must be satisfied *before* shortlisting; it only requires that *the method’s own theory claim* be checkable against its stated mechanism.  
- **Evidence:** Section 2 says: “the method’s own theory must claim (and the claim must be checkable against its stated mechanism, not just asserted)…”.  
- This leaves open the possibility that a reviewer can accept an ambiguous or speculative theoretical argument—such as citing “positive signal preservation” without any concrete evidence of it occurring at the specified altitude. An adversary could therefore nominate a method derived from the terminated line (which claims to preserve positive signal) and let the subjective assessment drive shortlisting, effectively sidestepping the intent of “defeat‑the‑null” framing.

F2 | The plan does not forbid using a method that is *functionally identical* to an instrument in the terminated arm but under a new name or with minor cosmetic changes.  
- **Evidence:** Section 0 states the termination clause bans any successor instrument that tests the same hypothesis on the same task family; however, the criteria in Section 2 only evaluate theoretical properties (α>0 and sealed‑held‑out compatibility), not the *substance* of the method’s operations. An adversary could rename a V3.1–style parsing routine “Parser‑X” and argue that it is a new component; the criteria would still be satisfied, but the underlying residuals (parse‑tax, format confounds) persist.

### 2. One-variable-per-round

F3 | The plan’s mandate that the Phase‑6 instrument sketch must represent a *single‑variable change* relative to “whatever baseline it is compared against” lacks an operational definition of that baseline.  
- **Evidence:** Section 5 states: “the Phase 6 instrument sketch must itself be designable as a single-variable change relative to whatever baseline it is compared against”. Without explicitly tying the baseline to the terminated v3 line, an adversary could bundle multiple simultaneous changes (e.g., new method *and* new scoring *and* refined parsing) and still claim that only one variable changed relative to its own custom baseline. This defeats the intended incremental‑change guardrail.

### 3. Instrument-residual masking

F4 | The disclosure requirement for avoiding inherited residuals is framed as a “why” explanation rather than an empirical test, making it effectively a promise rather than a falsifiable claim.  
- **Evidence:** Section 6 requires: “whether the recommended task family reuses any parsing/scoring machinery from the v3 line, and if so, why that reuse does not reintroduce the format tax”. The plan offers no mandated benchmark (e.g., a parse‑accuracy metric on the 479 clean tasks) to validate this claim. An adversary could simply assert “the parser is upgraded” without presenting evidence, leaving residuals hidden.

F5 | There is no prohibition against reusing or minimally modifying the parsing seam after termination beyond a vague “does not reintroduce format tax” statement.  
- **Evidence:** The plan references Section 0’s wording that “any change to the parsing seam after termination is a prohibited new generation”, yet in Section 3 the recommendation can state: “reuse of parsing machinery from v3 line… if it does not reintroduce the format tax”. Since this is unquantified, an instrument could rename the parser, alter tokenization rules, or embed the old logic under a different interface, thereby quietly preserving the 395/479 parse‑tax while claiming novelty.

### 4. Other defects

F6 | The plan’s reliance on reviewers to interpret ambiguous concepts (such as “baseline” in the one‑variable rule and the level of scrutiny required for α>0 claims) creates a soft gate that is difficult to audit reproducibly, undermining guardrail enforcement.  
- **Evidence:** Throughout Sections 1–3 the document leaves multiple terms—e.g., “sealed held‑out suite,” “positive signal at prompt‑search altitude” – without precise formal definitions or procedural checks. This opens room for post‑hoc re‑shaping of criteria after seeing survey results, contrary to the stated intent that criteria are frozen before survey reading.

F7 | The plan permits an *empty* shortlist (zero methods) as a legitimate result but does not articulate what follows if such an outcome occurs downstream. Without a defined fallback mechanism in Phase 6, failure to recommend any method could stall subsequent gate 46 and jeopardize the overall milestone schedule.  
- **Evidence:** Section 7 lists the pre‑committed stop rule: “No method qualifies is a legitimate Phase 5 outcome.” However, the later recommendation step (Section 3) lacks an explicit contingency plan for a void shortlist, leaving the design susceptible to procedural dead‑lock.

These vulnerabilities collectively indicate that the current guardrails do not robustly prevent an adversary from re‑introducing the terminated instrument’s residuals or from shifting criteria post‑hoc; thus the plan is UNSOUND.
