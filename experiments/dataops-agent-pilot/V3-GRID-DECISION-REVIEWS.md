# Cross-AI review — v3 grid-probe redesign decision (2026-08-05)

**Subject:** the redesign decision following the grid probe's NO QUALIFYING
POINT verdict (see `V3-GRID-DECISION-REVIEWS.md` companion commit c637b11 for
the verdict itself). Reviewers ranked options (a) new grid / (b) fence
mitigation first / (c) accept confounded instrument / (d) stop the arm, and
answered whether G2's numbers are salvageable.

**Panel:** 5 of 8 lanes returned — gpt-5.6-sol-pro, kimi-k3, qwen3.7-max (all
via opencode/openrouter), gemma4:31b and gpt-oss (local ollama, sequential).
Failed lanes: claude CLI (safeguard false-positive on the prompt, twice),
gemini CLI (extension breakage, known), codex CLI (account tier, known).
kimi-k3 independently verified `v3-grid-state.json` before reviewing.

## Synthesis

**Unanimous: (b) first, (c) last.** Rankings: b>d>a>c (gpt-sol-pro,
qwen-max) and b>a>d>c (kimi, gemma4, gpt-oss). Kimi's sharpening adopted by
the synthesis: (b)-then-(a) is ONE sequential plan — the real decision was
mitigate-first vs grid-first, and the panel is unanimous for mitigate-first.

**G2 salvageability: 4/5 say the historical numbers are dead.** No raw text
was stored, so the wrong-fence-only vs wrong-fence-wrong-answer mixture is
unknowable; post-hoc decomposition of Phase A would be fabrication (kimi's
phrasing). G2's SETTINGS survive as a candidate point for fresh measurement.
gpt-oss dissented (claims post-hoc salvage possible) but its argument assumes
raw text exists; overruled by the record.

**Split on the (b) variant** — the panel does NOT endorse the operator's
preferred tail-restatement uncritically:
- Parser relaxation (accept a plain ```json fence, schema-valid, strict
  compliance kept as a separately-reported secondary endpoint): gpt-sol-pro,
  qwen-max ("the operator's choice is backwards — restatement introduces
  recency confounds; relaxation is the cleaner contract change").
- Tail restatement (parser frozen, tournament contract untouched): kimi,
  gpt-oss. Kimi: mitigation targets the confirmed recency mechanism and opens
  no new Goodhart channel.
- gemma4: whichever variant, a FORMAT-STABILITY BASELINE must come first
  (trivial content at G1–G5 prompt lengths; fence-drop ≈ 0 across the range
  before any lever is trusted).

**Guards the next prereg must carry** (union of panel demands):
1. Raw-output retention for every task (unanimous; the gap that killed
   Phase A's interpretability).
2. Dual scoring: strict-contract endpoint AND semantic endpoint; lenient
   rescores diagnostic only, never acceptance inputs (gpt-sol-pro, kimi).
3. Drop-rate budget: strict-parser no-artifact rate ≤ 10% at any accepted
   point, as an acceptance criterion alongside the corridor (kimi).
4. Power rule: n sized so the baseline CI width ≤ 0.20 — current 10-task
   cells give CI widths 0.24–0.29 that nearly fill the 0.30 corridor, making
   qualification a lottery / winner's curse (kimi).
5. Two-stage gate: a selected point must re-qualify on fresh seeds before
   adoption (kimi).
6. Arm-symmetric mitigation + stratified arm-inversion check as pass/fail:
   inversion persisting post-mitigation at a point declares it unsound
   regardless of corridor position (qwen-max).
7. One-shot redesign: exactly one mitigation + one grammar, committed before
   any model call; confirmation/separation failure TERMINATES v3 rather than
   triggering another redesign (gpt-sol-pro).
8. Options to consider-and-reject explicitly in the design doc: harness
   grammar enforcement (breaks contract parity; deletes a layer prompts
   legitimately control — kimi), mechanism-isolation bridge on identical
   tasks with prereg'd decision rule, data excluded from efficacy claims
   (gpt-sol-pro).

**Framing corrections accepted into the record:**
- "Fence-dialect failure, not reasoning exhaustion" OVERCLAIMS: equal output
  lengths do not exclude load-induced joint failure, and the one sampled drop
  was also substantively wrong. Correct claim: format failure is a confirmed
  large component of unmeasured share (gpt-sol-pro, kimi).
- Input length rises ~4.5× G1→G5 and co-varies with the levers — the monotone
  drop pattern does not isolate refund CONTENT from context LOAD
  (gpt-sol-pro, gpt-oss).
- The 0.022 noise datapoint is one pair; "noise is good" is premature
  (gpt-sol-pro).
- The ceiling probe proves format under answer-given conditions only; "format
  per se is trivially achievable" was too broad (gpt-sol-pro).
- G2 "nearby" understates the power problem: difficulty moved 0.256 on one
  0.10 knob step against ±0.13 seed noise (kimi).
- Arm inversion may be a real finding about methodology prompts under load,
  not only a confound to eliminate (qwen-max, gpt-oss); post-mitigation arm
  ordering must be re-verified, never assumed (kimi).

---

## Reviewer: oc-gpt-sol-pro

I’ll verify the compressed claims against the experimental record, then assess the redesign options against preregistration, construct validity, and selection-bias risks.
**VERDICT: b > d > a > c.** Missing option **(e): a preregistered mechanism-isolation bridge** crossing contract placement and parser policy on identical tasks before committing to the redesigned instrument. My ranking was based on the evidence above; the operator’s recommendation does not change it.

### Top Choice: (b)

**Strongest argument for:** The current score has poor construct validity. At G2, at least 27% of strong-arm observations are zeros caused partly by artifact-dialect rejection, while the intended construct is data-ops fact recovery. The monotone no-artifact increase and G4 arm inversion show that strict fence retention can dominate the ranking. Removing that nuisance before recalibrating is more principled than searching for a setting where the nuisance happens to be less visible.

I prefer a narrowly broadened parser over task-tail restatement: accept only `path=answer.json` or `json`, still requiring one fenced, schema-valid answer with no ambiguity. That changes measurement rather than giving every agent an additional prompt intervention. Preserve strict-contract compliance as a separately reported secondary endpoint.

**Strongest argument against:** This is a result-informed instrument repair after three failed generations. Each repair creates another opportunity to tailor the benchmark to qwen3.6’s observed weaknesses and eventually obtain a favorable prompt-search result. Parser relaxation also changes the operational claim: exact downstream-contract adherence would no longer be part of the primary outcome.

### Biggest Risk And Guard

The largest risk is **adaptive instrument overfitting**, not the parser implementation itself.

Pre-register a one-shot redesign before further model calls:

- exactly one mitigation and parser grammar;
- raw-output retention for every task;
- separate semantic-correctness and strict-contract endpoints;
- fresh, disjoint calibration, confirmation, separation, and promotion seeds;
- a fixed re-grid and selection rule;
- minimum artifact-compliance bounds for every arm;
- failure of confirmation or separation terminates v3 rather than triggering another redesign.

A small paired bridge may compare old and new scoring on identical fresh tasks, but its decision rule must be preregistered and its data permanently excluded from efficacy claims.

### Can G2 Be Salvaged?

**No, G2’s reported corridor measurement is invalid as a measurement of reasoning difficulty.** The aggregate `0.300 [0.180, 0.420]` conflates semantic failure with contract-dialect failure, and the missing raw outputs prevent retrospective identification of the historical mixture. The `0.167` gradient is likewise only suggestive because differential fence failure can create or inflate arm separation.

A fresh redesigned probe can decompose outcomes into:

1. semantically correct and strict-fence compliant;
2. semantically correct but plain-JSON fenced;
3. semantically wrong but parseable;
4. no recoverable artifact.

That decomposition must be prospective and raw-output based. Conditional accuracy among successfully fenced outputs should remain diagnostic only: conditioning on fencing can select an easier or behaviorally distinct subset. Fresh unconditional semantic scoring under the new parser must determine corridor qualification.

### Evidence Against The Framing

- Similar **output** lengths do not establish “not reasoning exhaustion.” Cognitive load can jointly cause reasoning errors and instruction drift without increasing completion length.
- The sampled dropped answer was substantively wrong, directly refuting any interpretation that drops are merely one-token formatting errors.
- The 1.000 ceiling establishes formatting under answer-given conditions, not under reasoning load; “format per se is trivially achievable” is too broad.
- The `0.022` noise estimate is one incidental strong-arm pair, while the floor pair differed by `0.131`. Calling noise “good” is premature.
- Input length rises roughly 4.5-fold from G1 to G5 and is already far outside v2 comparability. The monotone drop pattern therefore does not isolate refund content from context load.
- Option (a) alone is weaker than stopping: it could locate an apparently qualifying point while retaining the same unidentified mixture of reasoning and formatting failure.

---

## Reviewer: oc-kimi-k3

I'll quickly verify the key claims against the repo record before writing the review (especially the probe numbers and the "no raw text stored" claim, since my answer to Q4 hinges on it).
Verified the record first: `v3-grid-state.json` confirms 30 cells of **10 tasks each** (not the larger n the CI widths might suggest), drop counts match the brief (G2-strong 8/30, G5-strong 18/60%), seed-level means at G2-strong are 0.397/0.362/**0.141**, and the state file stores only score/exact/hasArtifact/tokens — **no raw text**. The sampled drop is wrong three ways: plain ` ```json ` fence, `totals` wrapper key, negative revenue. My ranking below was formed before weighing the operator's lean.

---

## 1. VERDICT

**b > a > d > c.** Read (b) as a package: tail restatement + mandatory instrumentation + powered re-grid; (a) is its final phase, not a competitor. (a) alone spends probe inference re-measuring a confounded scale that any later mitigation invalidates. (d) is premature: levers demonstrably move difficulty (0.556→0.300 on one knob step) and strong-arm noise is healthy (0.022); what failed is format delivery — a design bug, not a substantive finding. (c) is strictly unsound: it converts a bounded, identified confound into an unbounded interpretive one.

Missing options that deserved explicit consideration:
- **(e) Harness-enforced format** (ollama structured output / grammar constraint): pure-reasoning instrument by construction. Should be considered and *rejected with reasons* — it breaks contract parity with the tournament and deletes a layer prompts legitimately control — not left unexamined.
- **(f) Dual-scoring instrumentation regardless of path**: store raw text; score strict (contract) AND lenient (diagnostic only). Its absence is what made Phase A uninterpretable; every future probe inherits the bug without it.

## 2. Top choice (b): strongest for / strongest against

**For:** it is the only option aimed at the confirmed mechanism. Drops scale with task weight (3→27→30→37→60%) while dropped outputs are not longer, and the ceiling probe proves format is trivially achievable when salient — recency-driven drift, for which tail restatement is the targeted fix. The parser stays frozen, so the tournament's shared contract is untouched and no new Goodhart channel opens. Grid-first is wasted inference: mitigation shifts all points upward, so every pre-mitigation measurement must be re-taken.

**Against:** the mechanism is inferred from correlation plus one sampled drop — which was wrong three ways at once (fence, schema wrapper, negative revenue), not "one token of drift." If degradation under load is capability, not salience, restatement barely moves drops and you spend a redesign + probe cycle learning that.

## 3. Biggest risk + pre-registered guard

**Risk: winner's curse at the acceptance gate.** Cells are 10 tasks × 3 seeds; observed CI widths (0.24–0.29) nearly fill the 0.30-wide corridor, and seed means swing ±0.13 (G2-strong: 0.397/0.362/0.141). At this n, "CI inside corridor" is a lottery — some point qualifies by luck, then drifts held-out: round 1's Goodhart recurring at instrument level.

**Guard (pre-register all four):** (i) power rule — n and seed count set so CI width ≤ 0.20; (ii) two-stage gate — the selected point must re-qualify on fresh seeds before adoption; (iii) drop-rate budget — strict-parser no-artifact rate ≤ 10% at the accepted point, as an acceptance criterion alongside the corridor; (iv) raw text + dual scoring mandatory. (iii) is the core guard: it caps the confound instead of hoping the mitigation worked.

## 4. Does fence-dialect invalidate G2?

G2's **numbers** are unsalvageable — not merely unsound to decompose post-hoc but impossible: no raw text was stored, so the wrong-fence-only vs wrong-fence-wrong-answer mixture is unknowable; any post-hoc decomposition of Phase A would be fabrication. G2 remains valid as a measurement of the strict-contract metric but not of reasoning difficulty, which is what the corridor exists to bound — so it cannot anchor acceptance. G2's **settings** are salvageable as a candidate point re-measured under dual scoring. Two caveats: acceptance is defined on the strict metric, so lenient rescores are diagnostic only, never acceptance inputs; and the re-measurement is fresh data — report it as such, not as a rescue.

## 5. Contradictions of the operator's framing

- "**FENCE-DIALECT FAILURE, not reasoning exhaustion**" overclaims: the mixture is unknown by the operator's own admission, and the sampled drop was substantively wrong. Correct claim: "format failure is a confirmed large component of unmeasured share." G3–G5 may *also* be genuinely hard.
- "**G2's gradient says a real instrument is nearby**" states weak evidence strongly. Gradient survives the confound (fence zeros are zero under graded and exact alike), but "nearby" ignores slope × noise: difficulty moved 0.256 on a 0.10 knob step while seed noise is ±0.1. Hitting a 0.30 corridor under that is a power problem, not proximity.
- **Arm inversion** supports (b) more than drawn out: if format compliance is prompt-sensitive, the unmitigated instrument hands the tournament a fence-fixing Goodhart channel — round 1's failure through a new door. Corollary: post-mitigation arm ordering must be re-verified, not assumed.
- **(b) then (a) is one sequential plan**, not two ranked options — (b) already contains the re-grid. The real decision is mitigate-first vs grid-first; the evidence supports mitigate-first.

---

## Reviewer: oc-qwen-max

## VERDICT: **b > d > a > c**

Missing option: **(e) Hybrid stop-and-publish with fence-dialect as a separate finding** — document the formatting-drift phenomenon as its own contribution (prompt fragility under cognitive load), then proceed with (b) for the reasoning instrument.

## Top choice (b): strongest argument FOR and AGAINST

**FOR:** The evidence is unambiguous — fence-dialect failure is the dominant signal, not reasoning difficulty. The 3%→60% drop rate across G1→G5, the lack of length correlation, and the qualitative sampling all point to a single-token formatting drift. G2's gradient (0.167) is the healthiest number on the table, but it's confounded: if the strong methodology prompt causes more fence drops than the minimal prompt, the "gradient" measures formatting compliance, not reasoning leverage. Fixing the fence contract is a prerequisite for any valid difficulty measurement.

**AGAINST:** Task-tail restatement risks introducing a new confound — recency effects that favor the methodology arm (which already has more guidance). If the restatement helps the strong prompt more than the floor, you've baked in an advantage that isn't reasoning quality. Parser relaxation (accepting plain ```json) is cleaner but breaks comparability with v1/v2 and the tournament contract.

## Biggest methodological risk and guard

**Risk:** The fence fix reveals that arm inversion at G4 isn't a formatting artifact — it's real. If the minimal prompt genuinely outperforms the methodology prompt on hard tasks even with perfect fence compliance, the entire premise (methodology guidance helps reasoning) is falsified at high difficulty.

**Guard:** Pre-register a **stratified analysis** — fence-compliant subset only, with arm inversion as a pass/fail gate. If inversion persists after fence mitigation at any point, that point is declared unsound regardless of corridor position. Also pre-register that task-tail restatement must be **arm-symmetric** (identical recency cue on both arms, differing only in the methodology content itself).

## Does fence-dialect invalidate G2's corridor numbers?

**Yes, invalidates.** At 27% drop rate, you cannot decompose zeros post-hoc — the probe stored no raw text, so the historical mix of "wrong fence only" vs "wrong fence + wrong answer" is unknowable. G2's [0.180, 0.420] CI is measuring a composite of reasoning failure and formatting non-compliance in unknown proportions. Salvage requires a redesigned probe with either fence mitigation or raw-text storage to enable post-hoc decomposition. Without that, G2's numbers are uninterpretable.

## Contradictions with operator's framing

1. **Operator treats this as a "redesign" problem; evidence says it's an "instrument repair" problem.** The pre-registered outcome for "no qualifying point" was REDESIGN, but the fence-dialect finding is a specific, mechanistic, fixable artifact — not a difficulty-calibration failure. Calling it "redesign" obscures that the reasoning levers were never properly tested.

2. **Operator's preference for task-tail restatement over parser relaxation is backwards.** Restatement introduces recency confounds; parser relaxation is a cleaner contract change. The operator's choice prioritizes "keeping the parser frozen" over methodological cleanliness.

3. **Arm inversion at G4 is underweighted.** The operator mentions it but doesn't grapple with the implication: if methodology guidance *actively hurts* on hard tasks, that's a deeper problem than formatting drift. It suggests the strong prompt may be counterproductive at high cognitive load — a finding worth investigating, not just a confound to eliminate.

---

## Reviewer: ollama-gemma4

**VERDICT:** b > a > d > c. No missing options; the set covers the spectrum from "technical fix" to "scientific surrender."

### Top Choice: (b) Fence-Drop Mitigation First, then Re-grid

**Strongest Argument FOR:**
The evidence identifies a **confounding variable coupled with task complexity**. The increase in no-artifact rates (3% $\rightarrow$ 60%) strongly suggests that the model is not necessarily reaching a reasoning ceiling, but rather a "compliance ceiling." Because zeros are aggregated (mixing wrong-fence and wrong-answer), the current difficulty measurements for G2–G5 are noise. Fixing the fence ensures that when you re-grid, you are measuring *reasoning* ($\Delta$ accuracy) rather than *formatting stability under load*.

**Strongest Argument AGAINST:**
Modifying the prompt (tail restatements) or the parser introduces a new variable into the instrument. If the "fence-drift" is an emergent property of cognitive load in Qwen3.6, simply moving the instruction to the tail might not solve it, or might move the "break point" slightly without fixing the underlying instability, potentially wasting another iteration.

### Methodological Risk & Guard
**Risk: Recency Bias/Instruction Overload.** By adding a formatting reminder to the tail of an already bloated prompt (up to 44k tokens), you risk displacing the actual data-ops instructions from the model's active attention window, potentially trading "fence drops" for "reasoning errors."

**Pre-registered Guard:** A **Format Stability Baseline**. Before running the new grid, execute a probe where tasks are trivial (results provided in prompt) but prompts are at G1–G5 lengths/complexities. This isolates the format adherence rate from the reasoning success rate, ensuring that "Fence-Drop" is $\approx 0$ across the entire range before testing L1–L4 levers.

### Analysis of Fence-Dialect & G2
The fence-dialect phenomenon **invalidates the difficulty measurements at G2**. With a 27% drop rate due to format drift, nearly one-third of the data is missing or erroneously marked as failure. The "healthy" gradient (0.167) is suspect because it may be capturing the slope of *formatting failure* rather than the slope of *reasoning failure*.

G2's corridor numbers **cannot be salvaged post-hoc** because the probe did not store raw text. Without the underlying "wrong-fence but right-answer" strings, any attempt to decompose those zeros would be speculative and methodologically unsound. A new probe is mandatory.

### Evidence Contradictions
The operator frames G2's gradient (0.167) as a sign that a "real instrument is nearby." However, the evidence regarding **Arm Inversion at G4** (where the minimal prompt outperforms the strong prompt) suggests that as task complexity increases, the "strong" methodology prompts may actually be inducing cognitive overload or distracting the model, contributing to the fence-drift. The operator's optimism about G2 might overlook the fact that the very system intended to guide the model is currently part of the failure mechanism.

---

## Reviewer: ollama-gpt-oss

**VERDICT**  
`b > a > d > c` – No other redesign avenue is needed at this point.

---

### 1️⃣ Why **b** (Fence‑drop mitigation + re‑grid) wins  

| Argument | Explanation |
|----------|-------------|
| **Directly tackles the root failure** | The probe’s 27 % drop rate on G2 is caused almost entirely by *fence‑dialect* loss – the model emits a plain ````json`` fence instead of the required ````path=answer.json``` fence. Fixing this contract removes a large fraction of zeros unrelated to reasoning ability. |
| **Preserves the original experimental logic** | Restating the output contract at the prompt’s tail is a low‑risk, high‑payoff tweak that does not alter problem content or lever definitions; it simply enforces compliance with an existing rule. |
| **Enables clean post‑hoc de‑differentiation** | Once fences are correct we can separate “format errors” from genuinely wrong answers, thereby recovering a more honest estimate of noise and gradient for G2 and any subsequent points. |
| **Keeps comparability flag** | The recommendation to add a new generator ID and acceptance notice is already in place – it gives us a formal audit trail that all changes are logged. |

#### Strongest *against* the choice  
The fence‑mitigation increases prompt length (≈ +1–2 k tokens) and may shift the model’s attention toward the tail instruction, subtly altering difficulty. If the added recency cue interacts with the methodology prompt, it could create new biases that our current noise / gradient checks would not detect.

---

### 2️⃣ Biggest methodological risk in **b** and pre‑registered guard  

| Risk | Guard |
|------|-------|
| **Token count inflation → altered difficulty** | Pre‑register a *token budget* comparison against the original design (± 10%). After each re‑grid, run a mini‑probe with only the fence‑mitigation addition while holding all other levers fixed; confirm that CI remains within the corridor and noise is unchanged. |
| **New formatting instruction could mask semantic errors** | Add an explicit “format-verify” sub‑task in the probe where the model must explain how it satisfies the contract. Failure rate on this sub‑task will flag hidden semantic drift. |

---

### 3️⃣ Fence‑dialect impact on G2 difficulty measurements  

* **Does it invalidate them?** Yes – the 27 % drop is a mechanical dropout, not a genuine loss of reasoning capacity. Because zeros were counted as failures irrespective of answer correctness, the 90 % CI spills below the floor and the gradient looks artificially low.
* **Can G2’s corridor numbers be salvaged?** Absolutely. After fence‑mitigation we can re‑run the probe and separately classify zeros into “format” vs. “answer.” Removing format zeros lowers variance, raises the lower bound of the CI above 0.30, and restores a valid gradient ≥ 0.10. This post‑hoc decomposition allows us to recover a credible G2 result without redesigning leverage points.

---

### 4️⃣ Contradictions to the operator’s framing  

The operator emphasizes that *b* alone suffices because the fence failure is “mechanistic.” However:

1. **Arm inversion at hard points** – In G4 the bare prompt outperforms the full methodology prompt (0.220 vs. 0.088). This suggests that *methodology guidance* may be actively sabotaging reasoning for complex tasks, not just formatting. A fix to fences will leave this problem untouched.
2. **Excessive token growth** – Prompt lengths explode from ~9 k tokens in G1 to ~44 k in G5. Even before fence failures, long prompts are likely to alter the model’s internal state and noise profile, potentially confounding any subsequent comparisons.

Thus, while fence mitigation is essential, a comprehensive redesign should also consider trimming prompt length or re‑structuring methodology guidance for the harder levers *if* additional data collection becomes necessary.

---

---
