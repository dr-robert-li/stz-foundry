# REVIEWS — v3 battery design (cross-AI panel, 2026-08-02)

Design under review: V3-BATTERY-DESIGN.md (draft). Panel: 6 reviewers, 5 model
families — claude-sonnet-5 (CLI), gpt-5.6-sol-pro / kimi-k3 / qwen3.7-max (via
opencode+openrouter), gemma4:31b + gpt-oss (local ollama). gemini CLI and codex
CLI were unavailable (account-tier issues), recorded for reproducibility.

Verdicts: SOUND-WITH-CHANGES ×2 (claude, qwen-max), UNSOUND ×3+ (gpt-sol-pro,
gemma4, gpt-oss, kimi-k3: n/a).

---

# Reviewer: claude

## Verdict (one line)
SOUND-WITH-CHANGES — corridor math right, calibration *order* wrong, two levers leak into forbidden parsing axis.

## Critical issues (invalidate measurements — must change)

1. **Freeze happens before noise is known.** Step 3 freezes knobs; step 6 measures noise on v3 — three steps later, AFTER human acceptance (step 4) and full separation gate (step 5). But whole corridor derivation (`1-baseline ≥ 3×noise`) used OLD noise (0.153 from v2). Harder reasoning tasks plausibly have MORE run-to-run variance (more places for stochastic slip), not less. If v3 noise floor turns out higher, corridor could already be unusable — discovered only after acceptance + prereg lock-in. Fix: run noise replicates on the candidate setting BEFORE step 4, or fold noise-check into the difficulty probe itself.

2. **Difficulty probe sample too small to trust.** 2 seeds × 6 tasks = 12 draws, against a 40× seed-dependent noise floor already measured. Picking "first setting in 0.35–0.55" off 12 samples risks locking a corridor that's a noise artifact, not a difficulty fact. Bump seeds or add a variance check before freeze, not just a point-estimate mean.

3. **L2 dangling-refund trap smuggles parsing difficulty.** Design explicitly bans parsing/ambiguity as a lever (learned from v2's format-compliance trap), yet "refund must reference existing `origOrderId` in filtered set, dangling ones ignored" is a lookup/filter check, not arithmetic reasoning. Same worry, lesser degree, for L1's tie-break rule — comparing `updatedAt` row-by-row is closer to string/date parsing diligence than "stateful reconciliation." Risk: arm separation ends up driven by who parses carefully, exactly what design says round 2 wrongly rewarded.

4. **Weak arms untested during calibration.** Probe only runs baseline (s2-strong). Floor collapse (v1's 0.000 death) is a stated fatal risk, but nothing checks whether s0/s1 stay above 0.05 until the *full* separation gate — after acceptance. Cheap to add s0/s1 into the same probe run; expensive to discover floor failure post-commitment.

## Improvements

- Isolate L1/L2/L3 individually in the ladder (currently only L1+L2 combos, then all three) — confounded, can't tell which lever missed if corridor is off.
- Knob ranges given as intervals (e.g. 0.5–1.0 conflict fraction) but probe needs point values — spec exact numbers per rung, not ranges, or probe isn't reproducible.
- Add explicit leak check for row-order shortcuts: if generator doesn't shuffle independent of `updatedAt`, model could pattern-match "last row wins" without real timestamp comparison — silent difficulty deflation.
- No interaction-leakage check across L1+L2+L3 combined (e.g. a refund coincidentally canceling a conflict, net answer matching a visible decoy column by chance). Each lever gets its own leak check; combined battery doesn't.
- Track prompt token-length delta vs v2 explicitly — combined L1+L2+L3 rule text grows the prompt; qwen3.6 30B long-context degradation could confound with "harder reasoning," undermining round-2→round-3 comparability (design's own open question 3, but no concrete measurement proposed).
- No numeric latency/timeout budget stated beyond "accepted, longer." Silent truncation under time pressure would masquerade as low competence, not measured difficulty.
- No rollback path specified if step 5 (separation gate) fails post-acceptance — what's the redo loop?

## Answers to the 5 open questions

1. **Yes, real leak risk**, concentrated in L1 (undefined double-tie: same `updatedAt` AND same amount — rule doesn't cover it) and L2 (dangling-refund lookup is filtering, not reasoning). Tighten L1's tie rule to remove the undefined case; keep L2's trap but flag in the writeup that it partially measures lookup diligence, not pure arithmetic reasoning.

2. **Corridor is thin** — 0.20 wide against noise up to 0.153 is only ~1.3× margin. Grow to 8–10 tasks/half NOW, independent of difficulty escalation — task count is in-bounds (part of "battery," the one allowed variable) and doesn't confound with reasoning difficulty the way L1–L4 do. Do both, don't choose.

3. **Yes, plausible confound.** Combined rule text for L1+L2+L3 lengthens the prompt; frozen method's context/timeout behavior wasn't validated at that length. Measure token delta vs v2, confirm it sits inside the method's already-demonstrated stable range before trusting round-2→round-3 comparison.

4. **Partially contaminated.** Baseline-only, no-arm-comparison protects the ARM selection decision, correctly. But knobs get tuned against ONE specific prompt family (s2-strong-class) by the same person building the generator — risk of unconsciously shaping wording toward what that prompt handles well, not toward generic difficulty. Worth flagging as accepted residual risk, or run the probe with a neutral prompt not from the strong-arm family.

5. **Missing:** (a) no redo/rollback plan if step 5 fails after acceptance — costly full recalibration cycle undefined; (b) model/environment drift — v2 already hit an ollama upgrade crash mid-run; nothing pins qwen3.6 build/version across calibration→round-3; (c) no timeout budget, so slow-but-correct reasoning could get truncated and misread as incompetence.

---

# Reviewer: gpt-sol-pro

## Verdict
UNSOUND

## Critical issues

1. **The emitted CSV is not independently proven to imply the stored oracle.**  
   “Answer-first” prevents accidental answer selection from messy data, but it creates a second failure mode: a bug in CSV derivation can make the precomputed fact disagree with what a correct solver would calculate from the emitted rows. Unit tests of generator internals do not eliminate this risk if expected values and output share implementation logic.

   The instrument needs an independent reference interpreter that reads only the final CSV plus the published rules and recomputes the answer. Every generated task must satisfy:

   ```text
   precomputed fact == independent recomputation from emitted CSV
   ```

   The interpreter must not reuse reconciliation, filtering, refund, adjustment, or bucketing helpers from the generator.

2. **The L1-L3 semantics are not complete enough to define a unique oracle.**  
   Several interactions permit multiple reasonable readings:

   - Whether duplicate resolution occurs before or after filtering.
   - Whether all row types participate in `orderId` duplicate groups.
   - Whether a refund’s original order must survive duplicate resolution.
   - What “exists in the filtered set” means: same customer/group, payment month, requested date range, or all task filters.
   - Whether a refund is attributed by its own payment date or the original order’s payment date.
   - Whether refunds can be partial, repeated, duplicated, or exceed the order amount.
   - Whether a dangling refund is determined before or after filtering.
   - Whether adjustments reference orders, have signed amounts, or use a separate direction field.
   - Whether adjustments affect eligibility, revenue only, or both.
   - How duplicate refunds and adjustments are reconciled.
   - Whether timestamps have time zones and whether timestamps denoting the same instant tie.
   - Whether “larger amount” means numerically larger or larger absolute value for signed adjustments.

   The rules need a formally ordered evaluation pipeline, not examples alone. For example: parse rows, resolve duplicates, classify qualifying orders, establish valid references, attribute events to months, apply signed effects, then aggregate.

3. **The calibration sample is too small to select a corridor reliably.**  
   Two seeds times six tasks gives only 12 observations per setting, and possibly fewer independent observations if tasks within a seed share warehouse characteristics. At a true pass probability of 0.45, the binomial standard error over 12 independent tasks is about 0.144. A setting observed at 0.50 therefore has a very wide uncertainty interval and could easily have a true rate outside the target corridor.

   Selecting the “first setting” whose observed rate lands in the corridor adds selection bias. The selected setting will tend to be one whose finite sample happened to look appropriately difficult.

   Calibration needs:

   - A predeclared acceptance rule based on an interval, not a point estimate.
   - Enough independent tasks and model replicates for the interval to be useful.
   - A confirmation sample with fresh seeds after setting selection.
   - Explicit handling of within-seed and within-warehouse correlation.
   - A fixed action when no setting or multiple settings qualify.

4. **Six tasks per promotion half cannot support the proposed measurement claims.**  
   For exact task pass rate, a six-task half has increments of 0.167. The target corridor effectively permits very few observable outcomes. At a true rate near 0.45, the standard error of a six-task rate is about 0.20 before model stochasticity or warehouse effects. The standard error of an independent two-arm difference is approximately 0.29.

   The headroom inequality is necessary but not sufficient. It says nothing about power to detect the expected method effect. A baseline of 0.50 leaves nominal headroom, but six tasks still cannot distinguish a useful improvement from task-sampling noise.

   Battery size must be chosen from a preregistered minimum detectable effect and variance model. Eight to ten tasks only reduces quantization to 0.10-0.125 and is unlikely to be enough. Unless effects are very large or pairing is exceptionally effective, the likely requirement is substantially more than ten independent tasks per half.

5. **The design tunes the instrument using the same arms whose separation will later support the method claim.**  
   The separation gate explicitly tests all three known prompts. If battery settings can be revised after that gate fails, the battery is being selected for favorable arm behavior. Fresh seeds do not remove this bias because the selection target is the prompts’ population-level separation, not a particular seed.

   The protocol must specify before seeing arm comparisons:

   - The exact gate acceptance criteria.
   - Whether failure kills v3 rather than triggering another arm-informed battery revision.
   - Which data are calibration-only and permanently excluded from promotion claims.
   - A final untouched task-family or parameter holdout not used for difficulty selection or separation validation.

6. **The preregistration occurs too late.**  
   The sequence runs the full three-arm separation gate and noise replicates before committing `PREREG-AMENDMENT-2.md`. That permits result-dependent choices about margins, seed aggregation, exclusions, timeout handling, and whether the instrument is accepted.

   The amendment must be committed before steps 5 and 6. It should contain the gate criteria, noise estimator, promotion statistic, exclusions, timeout treatment, minimum detectable effect, and consequences of gate failure. A later addendum may record measured calibration constants, but must not redefine the decision rules.

7. **The noise criterion is not statistically defined.**  
   “Worst-case noise 0.153” is an observed maximum from a small prior collection, not a defensible upper bound. A maximum varies with the number of replicates and may underestimate future noise. Multiplying it by three does not establish a false-positive rate or power.

   The design needs to define:

   - What noise means: model sampling, task draw, warehouse draw, or their combination.
   - Whether comparisons are paired on identical tasks and warehouses.
   - The variance estimator and confidence interval.
   - The confirmatory effect statistic.
   - The false-positive threshold and target power.
   - How seed-level dependence is modeled.
   - Whether the graded and exact metrics form one endpoint or multiple endpoints.

8. **Difficulty can be increased by arithmetic burden despite the stated construct.**  
   L1 and L2 increase both reasoning steps and the number of arithmetic operations. L3 can reduce to selecting a named column. Without error classification, a lower score cannot be attributed to reconciliation reasoning rather than transcription, long addition, context retention, or arithmetic slips.

   The probe must classify failures by intermediate oracle states: resolved row set, qualifying order IDs, valid refunds, month assignments, and final arithmetic. Otherwise the claim that v3 measures reasoning headroom is unsupported.

## Improvements

- Define a canonical evaluation algorithm with explicit operator ordering and total behavior for every row type and edge case.
- Generate machine-readable provenance for each expected answer: winning duplicate rows, qualifying order IDs, accepted and rejected refunds, adjustments, month attribution, and revenue contributions.
- Keep provenance unavailable to the candidate model but use it for diagnostics and generator validation.
- Add metamorphic tests: row permutation, harmless decoy insertion, duplicate-order permutation, timestamp-format normalization, and removal of ignored dangling refunds must preserve the appropriate answer.
- Add adversarial generator tests for tie timestamps, cross-month refunds, duplicate references, zero and negative adjustments, repeated refunds, boundary dates, and filtered-out original orders.
- Test leakage semantically, not only verbatim. Detect columns or simple row subsets that directly encode the final answer, winning conflict values, qualifying counts, or refund validity.
- Use balanced task strata so one random seed cannot produce materially different proportions of conflicts, refunds, cross-month rows, or boundary cases.
- Calibrate each lever separately before combining them. Otherwise a corridor hit gives no evidence about which lever caused difficulty or which construct failures represent.
- Use paired arm comparisons on exactly the same generated tasks and warehouses.
- Separate model stochasticity from task-draw variance by repeating identical prompt-task calls and independently drawing additional tasks.
- Report timeouts, malformed JSON, exact arithmetic errors, and semantic-selection errors separately, even if the frozen aggregate score still counts them as failures.
- Fix a sufficiently generous timeout before arm evaluation and measure latency without allowing timeout pressure to become the main difficulty lever.
- Validate the judge again on v3 outputs if any judge-mediated decision remains. A profile calibrated on v2 does not automatically transfer to new semantics.
- State that absolute round-2 and round-3 scores are not directly comparable because the instrument changed. The valid round-3 comparison is between frozen arms or methods on v3.
- Predeclare both lower and upper acceptance bounds for the strong arm, weak arms, graded-score survival, JSON compliance, timeout incidence, and arm-separation consistency.
- Replace “sign-consistent across three seeds” with an effect estimate and uncertainty interval. Three matching signs can still be weak evidence.

## Answers to the 5 open questions at the end of the design doc

### 1. Do L1-L3 genuinely raise reasoning difficulty?

L1 does, provided reconciliation order and duplicate scope are formally specified. In its current form, it is oracle-ambiguous.

L2 is the strongest reasoning lever but also the most underspecified. Reference validity, temporal attribution, duplicate handling, adjustment semantics, partial refunds, and filter ordering must be defined. Without that, two competent implementations can produce different answers.

L3 is mostly a column-selection trap. It measures instruction retention and distractor resistance more than multi-step reasoning. It becomes genuinely compositional only when its interaction with refund attribution and filtering is explicitly defined.

Use a canonical operation order. At minimum:

1. Parse and normalize rows.
2. Resolve duplicate records under a row-type-specific identity rule.
3. Identify orders satisfying non-temporal filters.
4. Apply payment-month eligibility to orders.
5. Resolve refund references under an explicit scope.
6. Attribute refunds and adjustments using explicitly named dates.
7. Count distinct qualifying orders.
8. Sum signed revenue contributions.

Every deviation from that sequence must be specified.

### 2. Is the 0.35-0.55 corridor right, and should the battery grow?

The corridor is reasonable as a headroom target but is not a complete design criterion. It does not establish detectable effect size or statistical power.

The battery should grow. Six tasks per half is inadequate, and eight to ten is probably still inadequate. Determine size from:

- The smallest method improvement worth detecting.
- Paired task-level variance.
- Model-repeat variance.
- Warehouse and seed correlation.
- Desired power and false-positive rate.

A baseline near 0.45 with a desired improvement of only 0.10-0.15 will generally require far more than ten independent tasks unless repeated paired measurements greatly reduce variance. If runtime prevents adequate sample size, the instrument cannot support a strong method-success claim.

### 3. Does this accidentally change the method’s conditions?

Yes.

The battery necessarily changes prompt length, rule complexity, context load, completion latency, and timeout exposure. Those are method conditions even if the mutation algorithm and scoring code remain frozen. The resulting experiment can still compare methods fairly within v3, but it cannot treat round-2 and round-3 absolute performance as directly comparable.

Control the changes by:

- Keeping the output schema identical.
- Fixing rule wording and ordering before evaluation.
- Measuring token counts by arm.
- Setting timeout from pre-arm calibration rather than observed arm behavior.
- Reporting timeout failures separately.
- Ensuring the search budget is unchanged in model calls and tokens, or explicitly defining which one is frozen.
- Preventing the search warehouses from containing task-specific wording that makes prompt search a lookup exercise.

### 4. Is the difficulty-probe protocol sound?

No, not as written.

Baseline-only calibration is permissible, but 12 observations per setting are insufficient, and selecting the first observed corridor hit creates winner’s-curse bias. Fresh seeds in the separation gate do not repair uncertainty about the selected setting’s true baseline difficulty.

Use a two-stage protocol:

1. Explore settings with baseline-only data under a predeclared selection rule.
2. Lock one setting and confirm its corridor on a substantially larger fresh baseline-only sample.
3. Commit the complete arm-comparison preregistration.
4. Run the arm separation gate on fresh tasks.
5. If the gate fails, reject the instrument rather than tuning it using those arm results.

Calibration tasks, confirmation tasks, separation tasks, and promotion tasks must be disjoint.

### 5. What failure mode is missing from §4?

The most important missing failure mode is **oracle/data divergence**: the stored answer is correct for the latent facts but not derivable from the emitted CSV under the published rules.

Other missing failure modes are:

- Battery selection overfitting to the known s0/s1/s2 prompts.
- Insufficient power despite adequate nominal headroom.
- Difficulty driven by arithmetic, timeout, or context length rather than the intended reasoning construct.
- Seed-level composition imbalance creating unstable difficulty.
- Semantic leakage through proxy columns or easily isolatable subtotals.
- Correlated tasks being treated as independent.
- Graded-score improvement without any improvement in exact task success, or vice versa.
- Judge-profile drift on v3.
- Prompt search exploiting fixed rule wording without generalizing to equivalent rule formulations.
- Multiple endpoints or repeated gate attempts inflating false-positive risk.
- Failure to distinguish invalid JSON, timeout, row-selection error, and arithmetic error.
- Refund and adjustment interactions producing impossible or pathological financial states that dominate the benchmark rather than test ordinary data-operations competence.

---

# Reviewer: qwen-max

## Verdict: SOUND-WITH-CHANGES

## Critical issues

**C1 — Quantization dominates the noise budget at 6 tasks/half.** With exact scoring on 6 tasks, observable rates are multiples of 0.167. That step size *exceeds* the worst-case noise floor (0.153). The design inequality `(1 − baseline) ≥ 3σ` is necessary but not sufficient: you also need `step ≤ σ` for the gate to have any power. Graded partial credit softens this, but §3 never specifies the effective resolution of the graded score. If L2 collapses graded scores toward exact (see C3), you're back to 7 observable levels. **Fix: grow to 8–10 tasks/half, or demonstrate graded-score effective resolution ≤ 0.05 in the probe.**

**C2 — L3 smuggles parsing difficulty.** "Decoy" `orderDate` in varied formats next to `paymentDate` is a date-format disambiguation task. DD/MM vs MM/DD misparse manifests as a "reasoning" error in your taxonomy but is mechanically a parsing error — exactly the axis §2 says it avoids. If the v2 gate already measured format compliance as the trivial axis, L3 re-opens it. **Fix: standardize both date columns to ISO 8601 in the CSV, so the only remaining task is column selection (genuine reasoning). Or drop L3 entirely — L1+L2 may suffice.**

**C3 — L2 cascading errors can collapse graded score to near-zero, blowing past the floor.** A model that misapplies the task filter gets the qualifying-order set wrong → every refund reference check is wrong → net revenue is wrong by a large factor (not a near-miss). With `REVENUE_ZERO_AT = 0.10`, a filter error on a 30%-refund group yields ~43% relative error → graded score 0. The most common failure mode (filter wrong) produces a cliff, not a gradient. **Fix: add a "gross revenue" sub-score that ignores refunds, so filter-only competence registers. Or reduce refund rate to 0.1 and verify in probe that graded ≫ exact.**

**C4 — Calibration selects difficulty conditional on baseline, which is arm-conditional selection in disguise.** The defense ("never compares arms") is technically true but substantively wrong. Choosing the knob setting where *this specific baseline prompt* scores 0.35–0.55 optimizes for "baseline is mediocre," not "arms are maximally separated." If the baseline prompt is unusually strong at L1 (conflict resolution — a common dedup intuition), calibration pushes L1 harder, which may disproportionately penalize weak arms that also understand dedup, compressing separation rather than expanding it. **Fix: pre-register the calibration ladder as a fixed grid and commit to the setting *before* seeing baseline scores. Alternatively, run a 2-arm pilot (strong + weak) during calibration and select for maximum separation, accepting the protocol amendment.**

## Improvements

**I1 — Prompt-length control.** L1–L3 add rules to every task prompt. If v3 prompts are 1.5–2× the token count of v2, you've changed the method's attention conditions, breaking round-2 → round-3 comparability (the §4 risk you list but don't mitigate). Measure and report prompt token counts; if inflation exceeds 30%, consider whether the added rules can be compressed or whether a length-matched control condition is needed.

**I2 — Model the L1×L2×L3 interaction.** The calibration ladder (mild / nominal / full) tests three points on a curve but doesn't estimate the interaction term. If L1+L2+L3 is super-additive (likely — holding three resolution rules in working memory simultaneously), the "full" setting may crater baseline below 0.35 with no intermediate setting in corridor. Add a 2×2 factorial (L1 on/off × L2 on/off) at minimum to estimate the interaction before committing to the ladder.

**I3 — Ceiling probe.** Before the difficulty probe, run a "perfect-information" condition: give the baseline prompt the answer key alongside the CSV and ask it to reproduce the JSON. If it can't format correctly under zero-reasoning conditions, the battery has a format-compliance confound that no difficulty lever can fix.

**I4 — Pre-register the probe acceptance criterion.** §3 says "pick the first setting landing baseline in 0.35–0.55" but doesn't specify what happens if no setting lands in corridor, or if two settings land in corridor. Pre-register: (a) fallback if all settings miss (presumably L4 reserve), (b) tie-breaking rule if multiple settings qualify (pick the one with lowest noise, or highest graded/exact ratio).

**I5 — Dangling refund specification.** "Dangling refunds are ignored" needs a formal definition: a refund is dangling iff its `origOrderId` does not appear among the orders that *pass the task's filter conditions*. State this explicitly in the task prompt, or models will debate whether "exists in the data" vs "exists in the filtered set" is the criterion.

## Answers to the 5 open questions

**Q1 — Do L1–L3 raise reasoning or smuggle parsing?**
L1 (conflict resolution) and L2 (refund netting) are genuine reasoning levers — they require multi-step stateful computation over correctly-parsed data. L3 (cross-month attribution) is contaminated by parsing: date-format disambiguation is not reasoning, it's format recognition. Fix C2 or drop L3. No rule statement is ambiguous *if* L3 is fixed; L1's tie-breaking rule and L2's dangling-refund rule are both deterministic given correct parsing, though L2's "filtered set" needs explicit definition (I5).

**Q2 — Is 0.35–0.55 right, and should the battery grow?**
The corridor is correct given the noise floor, but 6 tasks is insufficient regardless of corridor placement (C1). Grow to 8–10 tasks/half. This attacks quantization directly (step size drops to 0.10–0.125) and is orthogonal to difficulty — you can do both. The marginal cost is ~30% more calibration time, which is cheap relative to the risk of another inconclusive round.

**Q3 — Does anything change the method's conditions?**
Yes: prompt length (I1), CSV width (new columns: `type`, `origOrderId`, `paymentDate`, `updatedAt`), and task-prompt complexity (more rules to attend to). The CSV width change is unavoidable and acceptable. Prompt length should be measured and bounded. The artifact contract (one CSV in, one JSON out) is preserved. Timeout pressure may increase if longer CSVs + more reasoning push wall-clock time up — check that the existing timeout has headroom.

**Q4 — Is the difficulty-probe protocol sound?**
The defense against peeking contamination is technically correct but substantively weak (C4). Fresh seeds prevent direct data leakage, but the *selection* of difficulty conditional on baseline performance introduces an indirect bias: the battery is tuned to expose this baseline's weaknesses, not to maximize discrimination. This doesn't invalidate the separation gate, but it means the gate's power is not optimized. The mitigation is either (a) commit to the ladder blind (pre-register settings, accept whatever corridor you get) or (b) accept the protocol amendment and run a 2-arm pilot during calibration. Option (b) is more honest and costs one extra calibration day.

**Q5 — What failure mode is missing from §4?**
**Relative-error blowup on small denominators.** If L2 refund rates are high and an order group has near-complete refund coverage, net revenue approaches zero. Relative error `|predicted − actual| / actual` diverges as `actual → 0`, making the graded score hypersensitive to small absolute errors. A model that predicts $5 on a $3 correct answer gets 67% relative error → zero partial credit, even though it's directionally correct. This isn't a "near-miss gradient" — it's a landmine. Add a minimum-denominator guard (e.g., `REVENUE_ZERO_AT` should be `max(0.10, absolute_floor / actual)`) or ensure the generator never produces groups where net revenue < some absolute floor.

---

# Reviewer: gemma4

## Verdict: UNSOUND

## Critical issues

**1. Fatal Quantization Noise (The "6-Task Trap")**
The design targets a baseline corridor of 0.35–0.55 but maintains a battery size of only 6 tasks per half. In a 6-task set, each single task represents $\sim 0.167$ of the total score. If your noise floor is $0.153$, a **single random flip** on one task (due to sampling noise) completely mimics or wipes out the expected signal. You cannot meaningfully measure a difference between two arms when the "unit of movement" (0.167) is nearly identical to the "unit of noise" (0.153). To distinguish a baseline of 0.4 from an arm of 0.6 with statistical confidence, you need a much finer grain of measurement.

**2. Logic Interaction Ambiguity (L1 $\times$ L2 Collision)**
The design introduces Conflict Resolution (L1) and Refunds (L2) as independent levers, but they are logically coupled. 
*   *Scenario:* Order A has two conflicting rows. The resolution rule (L1) picks Row 1. However, there is a refund (L2) that references the `orderId` of Order A. 
*   *The Conflict:* Does the refund apply to the *resolved* state of Order A or the *raw* entries? If a refund exceeds the amount of the "winning" row but not the "losing" row, is it still a valid refund? The design does not specify an order-of-operations for these rules. Without a strict pipeline (e.g., `Dedup` $\rightarrow$ `Filter/Refund`), the oracle and the model can diverge on perfectly logical grounds.

**3. Oracle Non-Determinism in L1**
L1 states: "ties resolve to the larger amount." This is insufficient for a ground-truth oracle. If two rows have the same `updatedAt` AND the same `amount`, the tie remains unbroken. In a high-volume synthetic battery, this will happen. An oracle with any ambiguity is not an oracle; it is another candidate for noise.

## Improvements

**1. Expand Battery Cardinality (Sledgehammer the Quantization)**
Move to 20–30 tasks per half. This reduces the "weight" of a single random error and allows you to keep the target corridor (0.35–0.55) while ensuring that arm separation is driven by competence, not whether the model happened to flip one coin on a Friday afternoon.

**2. Explicitly Define the Execution Pipeline**
Replace "Difficulty Levers" with a mandatory **Sequential Transformation Pipeline**. 
*   Step 1: Resolve Conflicts (L1).
*   Step 2: Apply Date Filtering/Payment Attribution (L3).
*   Step 3: Process Refunds/Adjustments on the resulting set (L2).
This prevents "reasoning" from becoming "guessing the order of rules."

**3. Harden L1 Tie-Breaking**
Add a final, immutable tie-breaker to L1 (e.g., "if `updatedAt` and `amount` are identical, the row with the lower lexical `rowId` wins"). The oracle must be 100% deterministic.

**4. Dynamic Difficulty Scaling**
Instead of three static knob settings, implement a "difficulty ramp" across tasks within a single battery (e.g., Tasks 1–2: L1 only; Tasks 3–4: L1+L2; Tasks 5–6: L1+L2+L3). This allows you to observe *where* the baseline fails, providing better diagnostics than a flat aggregate score.

## Answers to the 5 open questions

**1. Do L1–L3 genuine raise reasoning difficulty or smuggle parsing?**
They smuggle **procedural complexity**. L2 and L3 are not "reasoning" in the sense of logical deduction; they are "algorithmic adherence." The risk is that you aren't measuring *intelligence*, but rather whether the model can maintain a multi-step mental state. If the rules are stated clearly, the only way to fail is through "forgetting" a rule mid-process or arithmetic slips.

**2. Is the 0.35–0.55 corridor right? Should battery grow?**
The *corridor* is mathematically sound relative to the noise floor, but the *sample size* (6 tasks) is catastrophic. You cannot resolve a $0.15$ difference reliably with only 6 data points per arm/seed. The battery **must grow** to at least 20 tasks to move the "per-task weight" significantly below the noise floor.

**3. Does this change METHOD conditions (comparability)?**
Yes. By increasing the number of rules and rows, you increase the tokens in the prompt and the reasoning traces generated by the reflective mutation method. If Qwen 3.6 has a "reasoning collapse" threshold at $X$ tokens or $Y$ complexity, you are no longer comparing *methods*, but rather testing the *breaking point* of the model's context window/attention.

**4. Is the difficulty-probe protocol sound?**
It is risky. By tuning knobs to hit a specific score for the baseline, you are essentially "calibrating the lock to the key." Even with fresh seeds, if you have found the exact combination of L1+L2 that makes the baseline fail $\sim 50\%$ of the time, you may have discovered a specific quirk of the qwen3.6 architecture rather than a general measure of data-ops competence.

**5. What failure mode is missing from §4?**
**"The Partial Credit Mirage."** The design relies on `revenueCents` partial credit to avoid saturation at 0. However, in L2 (Net Revenue), a single "dangling refund" error can lead to a massive absolute error in revenue, potentially pushing the graded score to 0 anyway. You need to ensure that your partial credit formula is resilient to "single-step logic errors" so that it doesn't just collapse into an exact-match binary.

---

# Reviewer: gpt-oss

## Verdict  
**UNSOUND**

The baseline window and the way the battery is calibrated leave the experiment
prone to systematic noise, leakage, and measurement bias that would invalidate any claim of superiority for a prompt‑search method over a hand‑written rule set.

---

## Critical Issues (must be fixed before measurements are meaningful)

| # | Issue | Why it invalidates measurement |
|---|-------|--------------------------------|
| **1** | **Baseline corridor too narrow relative to noise** – 0.35–0.55 guarantees that a standard deviation of only ~0.075 can push the baseline below 0.35 in one run, rendering the “success / failure” judgement fickle. | One‑off statistical fluctuations could flip the verdict without any real change in model ability. |
| **2** | **Leakage through new computed columns** – `assertAnswerNotLeaked` is only extended to net revenue and conflict outcomes; however the very presence of those columns (refund flag, timestamp, etc.) gives the LLM an extra “shortcut” channel that can be exploited with pattern‑matching rather than genuine reasoning. | The model may score high by memorising data patterns instead of applying the rules, which would invalidate any comparison to a hand‑written solution. |
| **3** | **Calibration bias (self‑reinforcing feedback loop)** – the difficulty probe uses *only* baseline scores to pick the knob setting that lands it in the corridor; the same baseline is then used in the separation gate. If the baseline behaves unusually on a particular seed or task, the chosen corridor may be either too tight or too loose for other arms. | A mis‑calibrated corridor will either unfairly advantage or penalise the search method, regardless of true competence. |
| **4** | **Ambiguous rule statements in L1–L3** – “later `updatedAt` wins” can be interpreted as “strictly later” or “latest per group”, and mixed precision timestamps can lead to alternate correct answers. | Two different but internally consistent interpretations create competing oracles, inflating the variance of the score and making it impossible to judge a method’s success on a single metric. |
| **5** | **Reliance on human acceptance events** – final calibration is approved only in one session with a single sign‑off. Any mis‑communication between the team or subtle differences in the generator code will silently change the dataset, breaking the reproducibility essential to measurement. | The experiment becomes a single point of failure: if the “acceptance” table entry is wrong, every subsequent run is off by construction. |
| **6** | **Limited task diversity (only 6 per half)** – 6 tasks do not provide enough degrees of freedom for statistical stabilization; the noise floor of 0.153 can drive the whole sample up or down in a single seed pair. | The measured gap between arms is heavily noise‑dominated, so that any claim of superiority rests on chance rather than skill. |
| **7** | **Partial credit scoring (`relative-error`) is marginally useful in the corridor but may saturate at 0 for many tasks** – this leads to a ceiling effect when baseline scores fall just above 0.55 or vice versa, obscuring whether the method truly achieves better fidelity. | The metric itself becomes uninformative and can mask systematic failures. |
| **8** | **Potential time‑out/latency drift** – as more columns are added and logic is pushed into the prompt, the token footprint grows; a fixed timeout per task could start penalising one arm relative to another without any change in reasoning capability. | Apparent degradation may be due merely to infrastructural limits rather than model ability. |

---

## Improvements (what would strengthen the design)

1. **Broaden and randomise the baseline corridor**  
   * Move from a hard 0.35–0.55 window to an adaptive band, e.g., ± 2 × standard‑deviation of a prior calibration run, or extend to 0.30–0.60 with explicit noise‐variance reporting.  

2. **Add a second “neutral” baseline in the difficulty probe** – run the same knob settings with *two* distinct hand‑written rules (e.g., one in QWEN, one in GPT-4) and take the median to guard against an anomalous arm affecting corridor selection.  

3. **Force rule clarity by formalising the specification**  
   * Replace natural‑language rule phrasing with a formal schema in the prompt: “For each group of duplicate `orderId`, select the row whose `updatedAt` field is strictly greatest; if two timestamps are equal, choose the row with greater `amount`.”  

4. **Introduce a synthetic “no‐leak” validation step**  
   * Generate extra tasks where the derived columns contain random values that carry no information about the answer. Run the baseline on these to verify `assertAnswerNotLeaked` catches any accidental hints.

5. **Increase task count per half to 8–10** and apply bootstrapping or Monte‑Carlo confidence intervals so the separation gate is statistically robust to noise.

6. **Encapsulate partial‑credit calculation into the judge rather than the arm** – this removes bias that could arise if one method systematically obtains a near‑perfect relative error but zero exact matches.

7. **Automate pipeline and record versions**  
   * Use CI/CD (e.g., GitHub Actions or Jenkins) to rebuild `generateWarehouseV3` on every change, run the difficulty probe, and log version hashes for reproducibility.  

8. **Provide a dedicated “format‑compliance” test** that checks that neither arm can derive any answer bits from metadata columns outside the defined rule set.

9. **Add an extra failure mode check** – include tasks that intentionally violate one of the rules (e.g., a duplicate with identical timestamps) and verify both arms produce the same, predictable behaviour.

10. **Document timeout sensitivity** – run all arms at varied timeouts to confirm no significant performance drift occurs as columns are added.

---

## Answers to the 5 open questions

| # | Question | Answer |
|---|----------|--------|
| **1. Ambiguity of L1–L3** | *Do L1-L3 genuinely raise reasoning difficulty or do they smuggle in parsing/ambiguity?* | L2 and L3 are essentially arithmetic/format issues that can be resolved by simply scanning the CSV; the only real reasoning is to apply “subtract refunds” or “bucket by payment month”. Without tight timestamp precision, L1 duplicates may be decided with a heuristic (“pick the row that appears last in the file”), which is pure pattern matching. Hence these levers do **not** guarantee deeper reasoning; they risk being solved by statistical shortcuts. |
| **2. Corridor size and task count** | *Is the 0.35–0.55 corridor right, given noise up to 0.153?* | With a worst‑case noise floor of 0.153, the 0.15 width corridor may be narrower than twice the standard deviation of a single run. It is safer either to widen the corridor or increase the number of tasks per half (8–10) so that empirical variance drops and the baseline is reliably separated. |
| **3. Effect on Method conditions** | *Could extending columns change prompt length, artifact contract, timeout pressure?* | Yes. Adding `refunded`, `adjustment` flags and the `updatedAt` field increases token count; the current 60‑second per task budget may get breached for larger groups, causing time‑outs that penalise one arm over another. The prompt also becomes more complex, potentially altering the effective “prompt‑search depth” independent of reasoning ability. |
| **4. Calibration probe contamination** | *Does reading baseline scores during calibration contaminate future separation?* | Baseline‑only calibration is safer than using both arms, but it still introduces selection bias: if the baseline misbehaves on a subset of seeds (e.g., a bug in generating `updatedAt`), the corridor will be tuned to that idiosyncrasy. This could render the separation gate meaningless for other seeds or arms since the noise profile is already skewed by earlier data. A two‑stage probe—first run one seed per knob setting, confirm stability, then run a full calibration—would mitigate this. |
| **5. Missing failure mode** | *What else could go wrong?* | The most dangerous unseen failure is a systemic “format compliance exploitation”: if the model learns that every duplicate group ends with the same `updatedAt` precision or that all refunds have odd‑numbered IDs, it can bypass the reasoning rules entirely and score high on formatting checks while producing incorrect answers. This would mask a real lack of logical inference. Another omission is potential overfitting to the calibration set when the model adapts its internal logic to the exact statistical patterns of `generateWarehouseV3`, making it non‑generalised performance and impossible to extrapolate beyond the specific battery.

---

**Bottom line:** The current design relies on fragile probability windows, weak leakage controls, and a calibration method that can bias itself. A measurement of whether prompt‑search beats hand‑written baselines demands a more statistically robust corridor, tighter rule formalisation, rigorous leak testing, and fully automated reproducibility. Until those modifications are made, any claim of superiority is likely to be an artefact of the laboratory rather than evidence of real reasoning progress.

