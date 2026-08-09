# Adversarial panel — SHORTLIST.md and RECOMMENDATION.md rev 1 (2026-08-09)

This panel runs through the review-lane seam directly (`gsd-tools review-lane invoke`) rather than
the `/gsd-review` slash command: `/gsd-review` writes REVIEWS.md into `.planning/`, which this
project gitignores (`planning.commit_docs: false`), and ROADMAP success criterion 3 requires the
adjudication record COMMITTED — same lanes, same seam, committed destination. This is the REQ-46
review, ordered before REQ-44's prereg-draft finalization per `RESEARCH-PLAN.md` §8 (F-17): it
reviews **both** `experiments/method-research/SHORTLIST.md` (the Phase 5 selection write-up F-17
names as REQ-46's target) and `experiments/method-research/RECOMMENDATION.md` rev 1 (the Phase 6
selection analysis ROADMAP criterion 3 names) — the same lanes, prompt, and adversarial framing as
`PLAN-REVIEWS.md`'s Phase 4 panel.

**Panel:** gpt-sol-pro (UNSOUND), kimi-k3 (SOUND-WITH-CHANGES), qwen-max (SOUND-WITH-CHANGES),
gemma4 (SOUND-WITH-CHANGES), gpt-oss (SOUND). Five of five target lanes produced output; no lane
was dropped.

**Dead lanes:** None. Invocation-path note: the three openrouter lanes (gpt-sol-pro, kimi-k3,
qwen-max) ran through the house seam
(`gsd-tools review-lane invoke --slug opencode --model <id> --as <name>`) with `~/.opencode/bin`
prepended to PATH — all three succeeded on the first attempt. The two local ollama lanes (gemma4,
gpt-oss) were first attempted through the seam's own `ollama` lane (`--slug ollama`), which hit its
120s `timeoutFloorMs` on a cold load of the 19GB/13GB model against the full ~61KB prompt and timed
out with no output; both then fell back to a direct HTTP POST against
`localhost:11434/v1/chat/completions` per the plan's pre-authorised fallback allowance, and both
produced full reviews on that path. `_memory-watchdog.sh` ran detached throughout the local-model
work; the two models ran strictly sequentially, each stopped (`ollama stop`) and confirmed unloaded
before the next was loaded. `wp-judge-v4` was not invoked in any role, per the standing exclusion
(`HANDOFF-V3.md` §2).

## Review prompt

You are an adversarial reviewer of a research selection analysis. Attack this analysis as an
adversary would — do not summarize it, do not praise it, hunt for the places where it lets its own
author reach a preferred answer. Assume the author, Robert Li, wants a particular answer and is
looking for where the analysis lets him get it.

You are reviewing TWO documents together:

1. **SHORTLIST.md** — `experiments/method-research/SHORTLIST.md`, the Phase 5 theory-only method
   selection write-up (the shortlist of ≤3 methods plus per-method rationale against the frozen §2
   criteria).
2. **RECOMMENDATION.md** — `experiments/method-research/RECOMMENDATION.md`, rev 1, the Phase 6
   task-family recommendation built on that shortlist (admission-path analysis, V3.1-§6 compliance
   mapping, instrument sketch, change ledger, disclosures, admissibility verdict).

Both documents are embedded below in full, along with two source sections you need to judge
whether the recommendation is a disguised route back to a barred family: `V3.1-BATTERY-DESIGN.md`
§6 (the one-shot termination clause) and the terminal section of `PILOT-RESULTS.md` (the
instrument-line-exhaustion report).

This analysis gates a draft pre-registration (REQ-44) that has not yet been written. "No admissible
family" is an available and legitimate outcome — the authors were told to use it if the conditions
land there, so do not treat a negative admissibility verdict as a defect in itself; judge whether
the verdict, whichever way it lands, is honestly reached. A reviewer finding nothing wrong is a
valid but rare outcome — do not manufacture findings to have something to report.

Return your findings under exactly these four headings, in this order:

**1. Method-shopping / "defeat the null" framing**

Attack whether the shortlist's criteria (`RESEARCH-PLAN.md` §2, frozen before any survey reading)
were applied consistently across all nine survey entries in `SHORTLIST.md` §2, or bent for a
favorite. Attack whether any rationale in `SHORTLIST.md` or `RECOMMENDATION.md` reads as post-hoc —
written to justify an answer already chosen rather than derived from stated theory or stated
mechanism. Attack whether `RECOMMENDATION.md`'s recommended task family was chosen because it looks
winnable (would probably produce a positive result) rather than because its admission path
genuinely holds. A finding that the Phase 5 selection write-up (`SHORTLIST.md`) was
method-shopped carries a real consequence: per `RESEARCH-PLAN.md` §8 (F-13), an ADOPTED finding of
that kind requires the shortlist to be discarded and reselected against the frozen §2 criteria.
Because of that consequence, make any such finding on evidence and state it precisely — name which
criterion was applied inconsistently, and where in the document, rather than asserting the shape of
the failure in general terms.

**2. One-variable-per-round**

Attack `RECOMMENDATION.md` §6's change ledger. Is the `Round variable (exactly one)` designation
honest? Have several genuinely independent variables been bundled behind one label under the guise
of "forced consequence"? Has an undisclosed intermediate baseline been constructed anywhere so that
a bundled change looks singular against it, rather than against the real fixed baseline (the
terminated arm's own v3.1 battery design, per `RESEARCH-PLAN.md` §5 / F-06)?

**3. Instrument-residual masking**

Attack whether `RECOMMENDATION.md`'s recommended family is the barred v3 family relabelled. Test
the §2 compliance mapping's four axes against the barred hypothesis's REAL identity (its actual
mechanism, as described in `V3.1-BATTERY-DESIGN.md` and `PILOT-RESULTS.md`), not against its name —
a renamed component performing the same function should read `same`, not `substantively different`,
and you should check whether that happened anywhere. Attack whether each of the four §7 disclosures
in `RECOMMENDATION.md` carries a real numeric threshold and a real downstream checkpoint, or is a
prose promise dressed as a number.

**4. Other defects**

Anything else genuinely wrong — factual errors, internal contradictions, a claim not supported by
the cited source, a table that does not match its own stated rule, or any other defect that does
not fit the three headings above.

FORMAT REQUIREMENTS, followed exactly:

- Open your entire response with one line of the exact form `**Verdict: X**` where X is exactly one
  of `SOUND`, `SOUND-WITH-CHANGES`, or `UNSOUND` — nothing else on that line.
- Number every finding you raise `F1`, `F2`, `F3`, … in the order you raise them, restarting at F1
  (this is YOUR own local numbering within your response; it will be merged into a global sequence
  later — do not try to guess or reuse numbers from any other reviewer).
- Put every finding under the one heading (1–4 above) it belongs to. A finding that spans two
  headings should be raised once, under whichever heading is the better fit, with a note if it also
  touches the other.
- If you have no finding under a heading, write "No findings." under that heading rather than
  omitting it.

Do not edit any files. Output only your review as markdown text.

(Embedded documents referenced above, not duplicated in this record: `SHORTLIST.md` @
`0c87b13103d8546e8483829f732d398ad84f2e95`; `RECOMMENDATION.md` rev 1 @
`26873d64ff8ac9e30f55ad4850163a6e6c35e5e2`; `V3.1-BATTERY-DESIGN.md` §6 @
`59dfb46bd72659fd89e983653c3805305799ca39`; `PILOT-RESULTS.md` terminal section @
`a3edc6dbc0087919c021b697034f6dc123e53bd0`.)


## Reviewer: gpt-sol-pro

**Verdict: UNSOUND**

**1. Method-shopping / "defeat the null" framing**

**F1. Criterion 2 is applied asymmetrically: compatibility is enough for favored methods, while rejected methods are required to have already demonstrated separation.** The frozen criterion asks whether the protocol *requires* the held-out suite or an equivalent to be visible during optimization. For A-01, A-02, A-08, and A-09, the analysis grants compatibility because a separate sealed suite *could* be supplied. But A-04, A-05, and A-07 are rejected because their published protocols do not affirmatively establish separation:

- A-05 uses input-output examples during optimization, but so does A-01's support-set loss. The cited overfitting risk does not show that a separate sealed test set must enter BayesPO's loop.
- A-04 optimizing and evaluating “the same two axes” does not establish that it consumes the same examples or held-out observations. Ordinary train/test protocols optimize and evaluate the same metric family without exposing test data.
- A-07 using the same “judgment mechanism family” in-loop and at evaluation is not equivalent to seeing the evaluation signal. Separate evaluator instances and sealed examples could still satisfy the stated criterion.

The negative assessments silently replace “requires held-out visibility” with “does not establish separation,” while the positive assessments accept “nothing requires visibility.” That is a precise inconsistency in Criterion 2 and is material to the shortlist composition. Under the stated F-13 consequence, the shortlist should be discarded and reselected unless source evidence establishes actual held-out leakage for these methods.

**F2. Criterion 1 is likewise relaxed for A-01 but tightened for rejected optimization methods.** A-01's rationale treats the statement that stage-two refinement is “intended to improve” on stage one as a preservation claim beyond the optimization signal. That is merely the purpose of an optimizer; it does not show persistence after the support-set loss is removed. By contrast, A-04, A-05, and A-07 fail because they lack an explicit claim that gains persist once their optimization signal is removed. If intended downstream improvement qualifies for A-01, the same inference is available to likelihood-, verification-, and evaluator-driven prompt optimizers. If explicit out-of-signal preservation is required, the quoted A-01 rationale does not provide it. This inconsistency favors the earliest-dated qualifier and therefore affects the date-based top three.

**F3. A-03's cross-model transfer evidence does not establish sealed-held-out compatibility.** Zero-shot transfer to another model shows model transfer, not dataset separation. Rules could have been evolved using the same task instances or equivalent evaluation content later used with the second model. The claim that cross-model transfer “demonstrates” that the later-checked set need not be visible conflates two independent dimensions. This is especially problematic because A-03 receives an affirmative inference from absent dataset-split evidence while rejected methods receive negative verdicts for not affirmatively establishing separation.

**F4. The recommendation is not actually derived from the shortlist.** The shortlist contains three methods, but the recommendation never selects one, maps one to BI query answering, or shows that its mechanism can operate under the proposed instrument. Instead, §§2–3 assume a “reflective prompt-mutation tournament,” which is not the common identity of GradPO, Contrastive Reflection, and DUALFIX. The task family is therefore chosen independently of the Phase 5 method selection while the document claims to be “built on” it. That gap allows the author to choose an apparently instrumentable task family first and defer the harder question of whether any shortlisted method genuinely fits it.

**2. One-variable-per-round**

**F5. The difficulty knob is an independently chosen intervention, not a forced consequence of changing task distribution.** The ledger itself calls it “a deliberate improvement” intended to correct the v3.1 corridor-placement failure. Moving to BI query answering does require some applicable difficulty definition, but it does not force this particular join-plus-aggregation count, the one-operation step rule, the ≤0.10 ceiling, or the subdivision procedure. Those are independent design choices that could be varied while holding the BI task distribution fixed. The round therefore changes at least task distribution and difficulty-control mechanism.

**F6. The generator and oracle changes contain discretionary choices hidden inside the “forced consequence” label.** A BI task family does not uniquely force a deterministic fixture-warehouse-plus-question generator, precomputed known-answer sets, or the chosen result-set-diff semantics. Those are defensible instrument choices, but they are not logical consequences in the same sense that emitting SQL rather than fenced prose follows from the output contract. Treating every downstream implementation choice as part of one broad “task distribution” variable makes the one-variable rule non-falsifiable: any wholesale instrument replacement could be called a forced consequence of choosing a new family.

**F7. The claimed constant qualification gate is only structurally constant, not operationally constant.** The ledger says the clauses are retained while “only the artifacts they measure differ.” But changing from fenced-answer artifacts to executable SQL changes what no-artifact, exactness, graded-minus-exact, and format stability mean and how they are measured. Holding clause names constant does not hold the gate constant. Against the real v3.1 baseline, the instrument changes both the task family and the operative acceptance measurements.

**3. Instrument-residual masking**

**F8. The task-semantics mapping understates the functional overlap with the barred hypothesis.** Both families ask an agent to answer a natural-language question about facts in a fixture warehouse, compare prompt-search with a hand-written baseline, and use independently computed warehouse ground truth for phase-5 promotion. The recommended family inserts SQL as an intermediate artifact, but it still requires the numeric result to be reported. Calling one “reconciling facts” and the other “generating a new artifact” emphasizes the representation difference while suppressing the shared end-to-end function: recovering the correct warehouse answer from a natural-language request. The mapping needed to confront this overlap directly; the asserted `substantively different` verdict is not established merely by changing the agent-visible intermediate representation.

**F9. The oracle-axis distinction is overstated.** The v3 oracle independently interprets the fixture and recomputes the correct fact; the proposed oracle executes the candidate SQL and compares its result with precomputed correct fixture numbers. Both are construction-class oracles whose operative function is to compare a candidate warehouse answer with independently established fixture ground truth. SQL execution adds validation of the intermediate program, but “reference recomputation” versus “engine execution” does not by itself make the ground-truth function substantively different. At minimum this axis is mixed, not cleanly `substantively different`.

**F10. Disclosure 1 sets a new outcome-performance target while presenting it as an instrument-residual disclosure.** The ≤10% executes-but-wrong rate is a correctness target, not a parsing/scoring-reuse diagnostic. It is also unsupported by the terminated evidence: the actual parseable-but-wrong count was 395/479, approximately 82.5%, while 10% was a per-arm artifact-drop boundary. The disclosure says it is “matching the terminated arm's own post-relaxation no-artifact floor,” conflating parseable-but-wrong residual difficulty with artifact-drop/no-artifact behavior despite `SHORTLIST.md` D-1 explicitly requiring those to remain separate. This is both residual masking and a factual misuse of the cited number.

**F11. Disclosure 2 has no specified downstream acceptance consequence.** It quantifies step movement at ≤0.10, but the only concrete check described is a pre-registration pretest that subdivides violating levels. At the stated downstream checkpoint, the document does not say whether an observed step above 0.10 invalidates the instrument, rejects a point, or triggers redesign. The blanket statement that an unmet disclosure “fails there” does not identify what fails or prevent post-hoc handling.

**F12. Disclosures 2 and 3 create a knife-edge requirement rather than a viable falsifiable range.** A step must move by no more than 0.10 to satisfy the granularity disclosure, while an adjacent step must move by at least 0.10 to count as a real behavioral gradient. Thus only an observed difference exactly equal to 0.10 satisfies both. Sampling uncertainty makes exact equality effectively unattainable. This permits post-hoc choices about whether a near-0.10 estimate is treated as sufficiently fine or sufficiently real.

**4. Other defects**

**F13. The headroom disclosure contradicts the stated noise estimate.** Disclosure 4 requires both baseline mean ≤0.85, giving headroom ≥0.15, and headroom at least three times measured replicate noise. Section 5 assumes per-seed SD ≈0.13. If that is the “measured replicate noise,” the required headroom is at least 0.39, implying a baseline mean no greater than 0.61, not 0.85. If “replicate noise” means a different statistic, it is undefined. The numeric target therefore does not implement its own rule.

**F14. The granularity pretest cannot “confirm” the claimed ≤0.10 ceiling as specified.** It proposes only a “small-n baseline sample” at 3–4 levels and compares observed means, with no seed-clustered uncertainty rule. Yet §5 says differences around 0.10 are only at the resolution limit even with six seeds. A smaller pretest cannot reliably distinguish a true step below 0.10 from one above it. The proposed validation procedure is weaker than the uncertainty discipline the document says must govern the instrument.

**F15. The admission analysis overrides deterministic admission statuses without an identified authorization rule.** The document invokes `admitVertical` discipline, under which absent or refused entries are not defaulted to admitted, but then converts three table statuses of `pending` into “admissible with conditions” based on the author's own oracle sketches. No cited rule says that a prose analysis may promote `pending` to admissible. This is especially consequential for the selected bi-analytics family: its supposedly independent oracle depends on a fixture warehouse and known-answer set that the document admits do not yet exist. A nameable future construction is not the same as an admission path available “today.”

## Reviewer: kimi-k3

**Verdict: SOUND-WITH-CHANGES**

**1. Method-shopping / "defeat the null" framing**

F1. SHORTLIST.md §3's tie-breaker is structurally weak in a way the author should tighten, though it does not rise to an F-13 finding. The primary tie-breaker — count of the four §4 diagnostics addressed "without modification" — resolves to 0/0/0/0/0 by the document's own admission that "no surveyed method's published design implements any of these as stated." A primary criterion that the author could have known in advance would tie at zero for every qualifier is a dead criterion; all five qualifiers were therefore selected by publication date alone. The frozen rule is followed, but the selection of A-01, A-02, A-03 over A-08, A-09 rests entirely on v1 date, and the write-up's insistence that "the date order is the frozen rule's own resolution mechanism, not a judgment call" is correct but thin — a frozen rule that always resolves by date is a date-ordering rule wearing a diagnostics costume. This is a transparency defect, not evidence of shopping: the rule was frozen pre-survey, applied uniformly, and the two exclusions (A-08, A-09) are methods whose mechanism claims are arguably the strongest preservation claims in the set (SSO's self-supervised/labeled-check separation, FLARE's small-disclosed-subset claim), so a shopped ranking would more plausibly have favored them, not excluded them on a technicality. No criterion was applied inconsistently across the nine entries that I can locate; the §2 assessments reason from stated mechanism throughout.

F2. The §2 assessments do show an asymmetry in what counts as a "preservation claim" that the author should be pressed on, though it cuts against the obvious preferred answer rather than for it. A-03 (DUALFIX) is credited with a preservation claim "by construction" from its zero-shot cross-model transfer claim, while A-05 (BayesPO) is failed on criterion 1 partly on the strength of the paper's own disclosed limitation ("energy minimization may overfit small optimization sets") — i.e., BayesPO is penalized for its authors' candor, while DUALFIX is credited for its authors' ambition. Meanwhile A-02's "further quantity the paper reports" is conspicuously unnamed — if that quantity is a test set, the assessment is fine; the vagueness is a writing defect that lets the reader not check. These are the places a motivated author has room; the direction of the bends does not consistently favor the eventual winner's downstream convenience (bi-analytics is method-agnostic), so I record this as a rigor finding, not method-shopping.

**2. One-variable-per-round**

F3. The §6 ledger's "task distribution (exactly one)" designation is defensible but the "forced consequence" claim is overstated in one specific row: the difficulty knob. Replacing the G1–G5 grid with the join/aggregation-depth knob is asserted to be "still downstream of the task-distribution choice — a BI query-answering task has no v3.1-style CSV-fact knob to reuse." That justifies *some* new knob; it does not justify *this* knob with *this* granularity ceiling (≤0.10/step). The granularity ceiling is an independently chosen design lever — a direct response to the corridor-placement failure — and the ledger itself admits this ("and a deliberate improvement") in the same breath that it classifies the row as a forced consequence. A variable cannot be both forced and deliberately chosen. The honest ledger entry is: round variable = task distribution (with generator/oracle/contract/parser forced), plus one disclosed, separately-motivated design change (difficulty-knob family and its granularity ceiling). As written, the "exactly one" designation survives only by relabelling a deliberate improvement as a consequence. This is the softest spot in the document and should be corrected in rev 2 — either by narrowing the claim or by disclosing the knob as a second, justified, non-task variable. (Touches heading 3 only in that the knob is also Disclosure 2's subject.)

**4. Instrument-residual masking**

F4. The §2 compliance mapping's "oracle implementation — substantively different" verdict is correct on mechanism but the mapping elides a shared failure shape that the barred identity actually includes. The barred line's real identity, per PILOT-RESULTS.md, is not just "reference interpreter recomputes facts" — it is an instrument whose terminal failure was "well-formed artifact, wrong answer" at 395/479 (82.5%). The recommended family's scoring (execute SQL, diff result sets) is genuinely a different mechanism, but it is *exactly as blind* to that failure shape: a syntactically valid, successfully executing SQL query that returns the wrong rows is the precise analogue of parseable-but-wrong, and the document itself concedes this by defining Disclosure 1's "parseable-but-wrong-equivalent." So the function that mattered most in the termination — distinguishing genuine task difficulty from instrument tax — is inherited, not avoided. This does not make the family barred (V3.1-§6 bars the data-ops fact-recovery hypothesis, not the failure shape), but the mapping's three "substantively different" rows give an impression of distance from the terminated line's actual pathology that Disclosure 1 then quietly has to re-introduce. The mapping should state plainly: the new instrument is exposed to the same dominant failure mode by construction, and Disclosure 1's ≤10% target is the entire defense.

F5. Disclosure 1's numeric threshold is a dressed-down number, not a derived one. "≤10% parseable-but-wrong-equivalent rate... matching the terminated arm's own post-relaxation no-artifact floor as the disclosed comparison bar." The terminated arm's no-artifact figure was 16/479 ≈ 3.3%, not 10%. The ≤10% appears to borrow the 0.10 drop-rate fence from the dialect-drift clause — a different quantity (per-arm artifact-drop rate, not wrong-but-executable rate). As written, the disclosure's threshold has no stated derivation from the quantity it claims as its comparison bar, and the terminated arm's own equivalent rate was 82.5% — so the disclosure is a real number, but its justification is mis-cited. Either derive ≤10% from something or restate the comparison bar honestly. This is precisely a "prose promise dressed as a number" at the justification seam, though the number itself is checkable downstream.

**3. (see note)** — *Headings 3 and 2 ordering per the prompt: findings above are placed per the prompt's heading list; F3 sits under heading 2, F4–F5 under heading 3.*

**4. Other defects**

F6. RECOMMENDATION.md §4's "two usable resolution points" characterization of the v3.1 grid is a loose reading of the terminal report. PILOT-RESULTS.md shows four points run (G1–G4), with G1 inside/near the corridor but gradient-free and G2–G4 below floor with real gradients — that is zero points inside the corridor with a working gradient, not "two usable resolution points across the whole window." §4's sentence ("Grid points landed either below the corridor floor with a real gradient, or inside the corridor's general vicinity with no gradient") is accurate; the "two usable resolution points" summary phrase is not supported by the cited source and should be struck or corrected.

F7. §5's noise arithmetic: "0.13 × 2.015 × 2/√6 ≈ 0.21" — the full CI width is 2 × 2.015 × 0.13/√6 ≈ 0.214, which checks out, but the document then calls this a "CI width" while V3.1-§4's "0.20–0.23" range and the corridor containment test concern the full interval; the half-width/full-width usage is consistent here, but §5's "resolving gradients no finer than roughly 0.10–0.11 (about half the CI width)" conflates CI half-width with a two-sample difference-of-means standard error, which for two independent six-seed clusters would be √2 larger (≈0.15), not 0.105. Disclosure 3's 0.10 gradient floor therefore sits *below* the statistically defensible resolvable difference for the stated estimator, weakening the document's own claim that the floor "matches §5's resolvable-gradient estimate." The disclosure is honest about sitting "at the edge of" the floor, but the edge is further away than §5 computes.

No other findings.

## Reviewer: qwen-max

**Verdict: SOUND-WITH-CHANGES**

## 1. Method-shopping / "defeat the null" framing

**F1.** The §2 compliance mapping demonstrates different *surface forms* but does not demonstrate a different *hypothesis mechanism*. The barred hypothesis's mechanism is: "prompt-search optimization improves agent performance on data tasks involving a warehouse, verified by an independent oracle." The recommended family's mechanism is: "prompt-search optimization improves agent performance on data tasks involving a warehouse, verified by an independent oracle." The mapping's three "substantively different" axes (task semantics, oracle implementation, parser/scoring) show the task is *instantiated* differently — generating SQL queries vs. reconciling CSV facts — but the underlying capability being tested (reasoning about warehouse data to produce structured output verified against that data) is the same. The document claims "the object under test (a reconciled value vs. an executable program), the check performed (recomputation vs. execution), and the failure modes available (a wrong number vs. a malformed or semantically wrong query) are all different in kind" — but these are different *implementations* of the same test, not different *hypotheses*. A relabelled component performing the same function should read "same," and at the mechanism level, the agent's work (reason about warehouse data, produce correct structured output) is functionally identical. The §6 termination clause bars the *hypothesis*, not the *task surface form*.

## 2. One-variable-per-round

**F2.** The §6 ledger bundles five component changes (generator, oracle, output contract, parser/scoring, difficulty knob) under one label ("task distribution") as "forced consequences," but this defeats the causal attribution the one-variable-per-round principle exists to enable. If the future arm shows a performance difference from baseline, the design cannot distinguish whether the effect is due to the task family *per se*, the new oracle mechanism, the new parser/scoring machinery, the new difficulty knob, or any interaction among them. The document acknowledges the difficulty knob is "a deliberate improvement" addressing the corridor-placement failure — which makes it an independent design choice, not merely a forced consequence, and should be disclosed as a second variable. The qualification-gate structure and noise estimator are held constant, but the five "forced" changes are not mechanically forced; they are design decisions downstream of the task choice, each with its own degrees of freedom.

## 3. Instrument-residual masking

**F3.** Disclosure 1's "≤10% parseable-but-wrong-equivalent rate" claims to match "the terminated arm's own post-relaxation no-artifact floor as the disclosed comparison bar," but the terminated arm's no-artifact rate was 16/479 ≈ 3.3%, not 10%. The 10% threshold does not match either the parseable-but-wrong rate (395/479 ≈ 82.5%) or the no-artifact rate (~3.3%) from the terminated arm. The disclosure's stated comparison bar is factually incorrect — the threshold appears arbitrarily set while claiming alignment with the terminated arm's data. A prose promise dressed as a number is exactly what F-10 prohibits; a number with a mislabeled comparison bar is the same defect in a different shape.

## 4. Other defects

No findings.

## Reviewer: gemma4

**Verdict: SOUND-WITH-CHANGES**

**1. Method-shopping / "defeat the null" framing**

No findings. The selection in `SHORTLIST.md` followed a mechanical tie-breaker (primary-source v1 date) after a strict application of frozen criteria that yielded a multi-way tie. No evidence of spirit-matching or post-hoc bending was found.

**2. One-variable-per-round**

F1: `RECOMMENDATION.md` §6 claims there is exactly one round variable ("task distribution") and labels the change to the difficulty knob as a "forced consequence." This is an honest failure of designation. While switching tasks necessitates a *new* knob, the specific architecture of the new knob—designed explicitly to solve the "coarse steps" failure of v3.1 by imposing a $\le 0.10$ mean-score movement ceiling (§4)—is a deliberate architectural improvement, not a forced consequence of the task change. A BI analytics family could have been implemented with a coarse grid similar to the one that failed in v3.1; opting for high granularity is an independent design variable introduced to ensure the same corridor failure does not recur. The author has bundled a "task change" and a "grid-resolution strategy change" into a single variable to maintain the appearance of compliance with `RESEARCH-PLAN.md` §5.

**3. Instrument-residual masking**

No findings. The recommended BI analytics family is substantively different from the barred data-ops fact-recovery line. The shift from *recomputation* (reference interpreter) to *execution* (SQL engine) changes the fundamental mechanism of the oracle and the cognitive nature of the task (from verification/extraction to program synthesis). Furthermore, all four disclosures in `RECOMMENDATION.md` §7 provide specific numeric thresholds or formulas rather than prose promises.

**4. Other defects**

No findings.

## Reviewer: gpt-oss

**Verdict: SOUND**

---

### 1. Method-shopping / “defeat the null” framing  

No findings. The shortlist applies the two frozen criteria consistently across all nine survey entries, and the tie‑breaking rule (diagnostics count then earliest primary‑source date) is explicitly documented in the short‑list. No post‑hoc rationales are used to justify a chosen method beyond what can be deduced from its stated mechanism.

---

### 2. One-variable-per-round  

No findings. The change ledger clearly identifies *task distribution* as the single variable that changes in the next round. All other modifications (generator, oracle, output contract, parser/scoring machinery, difficulty‑knob) are justified as forced consequences of this choice and do not introduce additional independent variables. Hence the one‑variable‑per‑round constraint is respected.

---

### 3. Instrument-residual masking  

No findings.  
* The V3.1‑§6 compliance mapping correctly labels axes where the recommended family differs substantively from the barred hypothesis (`task semantics`, `oracle implementation`, `parser/scoring machinery`) and notes that the promotion‑gate role can legitimately be the same.  
* All four §7 disclosures in the recommendation carry explicit numeric targets or observable criteria, not vague prose promises.  

Thus the instrument‑residual masking checks out.

---

### 4. Other defects  

No findings. There are no factual errors, internal contradictions, unsupported claims, mismatched tables, or other deviations from the stated requirements. All statements are consistent with the supplied source documents and respect the pre‑established constraints.
