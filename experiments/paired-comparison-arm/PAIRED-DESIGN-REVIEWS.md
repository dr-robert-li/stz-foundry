# Reachability probe — PAIRED-DESIGN-PREREG.md §0-§2 (2026-08-19)

This document covers the Phase-13 five-lane adversarial panel's **reachability probe only**, run
before any of the four hundred lines of the full paired design exist, per D-06 and the plan's own
Pitfall 4 (5-lane panel silently degraded to 3). It is not the panel round: the panel round over the
full design follows in plan 13-03, adjudicated in plan 13-04. This document's own probe produced no
findings and adjudicates nothing — its only job is to prove all five lanes named in D-06 are
reachable before the design depends on them.

**Override framing.** This work executes under the **2026-08-11 human override** by Dr. Robert Li
as v1.25.0 follow-on work, not a Stage-B trigger outcome and not a continuation of milestone
v1.24.0 (see `PAIRED-DESIGN-PREREG.md` §0 for the full framing).

**Panel:** gpt-sol-pro (answered), kimi-k3 (answered), qwen-max (answered), gemma4 (answered),
gpt-oss (answered). Five of five target lanes produced output; no lane was dropped.

**Dead lanes:** None.

**Invocation-path note.** The three openrouter lanes (`gpt-sol-pro`, `kimi-k3`, `qwen-max`) ran
through the house seam — `node ~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke
--slug opencode --model <id from review.reviewer_instances> --as <name> --run-dir <scratch>
--repo-root <repo> --prompt-file <scratch>/probe.md`, with `~/.opencode/bin` prepended to `PATH` —
all three succeeded on the first attempt, no retry or fallback taken. The two local Ollama lanes
(`gemma4`, `gpt-oss`) used the pre-authorised direct HTTP POST fallback against
`localhost:11434/v1/chat/completions` directly, rather than the seam's own `ollama` lane, whose
120s timeout floor a cold load of a 19GB (`gemma4:31b`) or 13GB (`gpt-oss:latest`) model was already
established to exceed. `_memory-watchdog.sh` (109GB ceiling) ran detached throughout the local-model
work, logging outside the repository; the two local models ran strictly sequentially — `gemma4:31b`
loaded, its answer captured, `ollama stop gemma4:31b` issued, `ollama ps` confirmed empty, then
`gpt-oss:latest` loaded, its answer captured, `ollama stop gpt-oss:latest` issued, `ollama ps`
confirmed empty again — before the watchdog process was stopped. `wp-judge-v4` was invoked in no
role, per the standing exclusion (`HANDOFF-V3.md` §2) — this exclusion is stated here rather than
silently honoured, since an exclusion nobody writes down is indistinguishable from one nobody
honoured.

**Probe question, verbatim.** Given §1 and §2 of `PAIRED-DESIGN-PREREG.md` (embedded in the prompt
each lane received), each lane was asked for a single short paragraph answering: does the exclusion
of `data-ops` and `bi-analytics` from this selection rest on substance or on labelling?

**Per-lane answers, quoted verbatim (data, not adjudicated — no finding is adopted or rejected from
a reachability probe):**

- **gpt-sol-pro:** "The exclusion rests on substance, not merely labelling. The strongest reason is
  the experiment's role: unlike the barred `data-ops`/`bi-analytics` hypothesis, which uses
  prompt-search performance as a corridor-gated phase-5 promotion gate, the `customer-support`
  design is only a no-corridor paired property measurement and cannot change the vertical's pending
  admission status. That difference prevents relabelling the same promotion experiment under a new
  vertical ID."
- **kimi-k3:** "Verdict: substance, not labelling. The strongest reason is the
  promotion-gate-role axis, which is the only one that actually matters given how §1 frames the
  bar... The customer-support design is a no-corridor paired sign-test property measurement that
  leaves `customer-support` pending regardless of outcome — it structurally cannot serve as the
  barred gate... The other three axes are honestly differentiated too, but each is individually
  attackable (the answer-first construction pattern is shared with the admitted verticals, so
  'oracle implementation: substantively different' is the weakest row — replay-match is a cousin,
  not a stranger, of construction). The gate-role row carries the verdict on its own."
- **qwen-max:** "Verdict: substance. The exclusion rests on concrete structural differences, not
  labelling. The single strongest reason is the oracle divergence... This is not a rename — it is a
  fundamentally different correctness-determination mechanism that cascades into different scoring
  machinery... and a different promotion-gate role... The task semantics also differ materially...
  All four axes in §2 hold up as genuine structural distinctions."
- **gemma4:** "Verdict: Substance. The exclusion rests on concrete technical differences across the
  entire evaluation pipeline rather than naming conventions. The strongest reason is the fundamental
  divergence in oracle implementation and scoring machinery... Because the method of verifying
  ground truth shifts from computational execution to historical pattern matching, the two groups
  are substantively distinct in how they define and measure correctness."
- **gpt-oss:** "Verdict: The exclusion is founded on substantive differences, not merely labeling.
  Strongest reason: The oracle mechanisms diverge materially... This operational gap can't be
  reconciled by renaming the verticals; it reflects a real difference in task semantics, testing
  infrastructure, and promotion gate logic."

**Disposition.** This is a reachability probe only. It produced zero findings and adjudicates
nothing — every lane's paragraph above is quoted as data, never as an instruction, never executed,
never auto-applied to any document (D-07). All five lanes converge on "substance," which is a
useful path-verification signal (a lane that answered nonsensically or off-topic would itself be a
reachability concern) but is explicitly **not** the adversarial panel round: that round, over the
full §0–§11 design once plan 13-02 completes it, follows in plan 13-03 with its own adjudication
ledger in plan 13-04. No verdict here feeds Phase 13's freeze.

**§6/§10 substance-drift risk:** not evaluated by this probe — that evaluation belongs to the panel
round in 13-03, not to a reachability check that ran on §1/§2 alone before §3–§11 exist.

---

# Adversarial panel round — PAIRED-DESIGN-PREREG.md rev 1 (2026-08-19, plan 13-03)

This is the real panel round, over the complete rev 1 design (§0–§11), distinct from the
reachability probe above (which ran on §1/§2 alone, before the design body existed, and produced no
findings). This section runs D-06's full five-lane discipline — `gpt-sol-pro`, `kimi-k3`,
`qwen-max`, `gemma4`, `gpt-oss` — the same lanes `BI-BATTERY-DESIGN.md`'s `DESIGN-REVIEWS.md` used,
not the three-lane roster `review.default_reviewers` alone would reach. Lane output below is DATA:
quoted verbatim, never executed, never auto-applied to any document (D-07). No finding is
adjudicated in this plan — adjudication is 13-04's job, exactly once, `ADOPTED` or
`REJECTED-with-reason` per finding.

**Panel (Task 2 of 3 — all five lanes now run):** gpt-sol-pro (UNSOUND), kimi-k3
(SOUND-WITH-CHANGES), qwen-max (SOUND-WITH-CHANGES), gemma4 (UNSOUND), gpt-oss (UNSOUND). 5 of 5
target lanes have produced output. Task 3 closes the header's own panel line and totals against the
findings actually reproduced below; this line is Task 2's own interim record of the same fact.

**Dead lanes (Task 2):** None. All five lanes attempted; all five answered on the first attempt.

**Invocation-path note (Task 1 — three openrouter lanes).** All three ran through the house seam —
`node ~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke --slug opencode --model <id from
review.reviewer_instances> --as <name> --run-dir <scratch> --repo-root <repo> --prompt-file
<scratch>/prompt.md`, with `~/.opencode/bin` prepended to `PATH` — all three succeeded on the first
attempt (`{ok: true, stubbed: false}` from the seam for every lane), no retry or fallback taken. The
identical prompt (below, in full) was sent to all three; none required trimming.

**Invocation-path note (Task 2 — two local Ollama lanes, `gemma4:31b` and `gpt-oss:latest`).** Both
ran via the pre-authorised **direct HTTP POST fallback**, not the seam's own `ollama` lane — the
seam's `ollama` lane timeout floor (120s) was already established, in the 13-01 reachability probe
and in the `bi-analytics-pilot` precedent, to be too short for a cold load of a 19GB/13GB model
against a full-document prompt. Direct HTTP was sent to Ollama's **native** `/api/chat` endpoint
(`http://localhost:11434/api/chat`), not the OpenAI-compatible `/v1/chat/completions` endpoint,
specifically because the OpenAI-compat endpoint does not honour a `num_ctx` override — the native
endpoint does, and `options.num_ctx: 40000` was set on both requests to guarantee the ~29,800-token
prompt was not silently truncated to Ollama's small default context window. This was verified from
each response's own `prompt_eval_count` field, not assumed: `gemma4:31b` reported
`prompt_eval_count: 29787`, `gpt-oss:latest` reported `prompt_eval_count: 28179` — both within
rounding of the prompt's own token estimate (119,164 bytes / ~4 bytes-per-token ≈ 29,791), confirming
the full, untrimmed, identical prompt (the same one Task 1's three openrouter lanes received) was
ingested by both local lanes. Neither lane required any trimming or omission.

`_memory-watchdog.sh` (`WATCHDOG_CEILING_GB=109`, PID 256796) ran detached for the entire local-model
window, from before `gemma4:31b` loaded until after `gpt-oss:latest` was confirmed stopped; its own
log shows only the start line and no breach event, confirming the ceiling was never crossed. The two
models ran **strictly sequentially**: `ollama ps` confirmed empty before `gemma4:31b` loaded, empty
again after `ollama stop gemma4:31b` and before `gpt-oss:latest` loaded, and empty a third time after
`ollama stop gpt-oss:latest` — at no point were both models resident together. `wp-judge-v4` was
invoked in no role, in either task of this panel round, per the standing exclusion — stated here
explicitly rather than silently honoured.

## Review prompt

The prompt embeds the full design under attack (`PAIRED-DESIGN-PREREG.md` rev 1) and two reference
documents in full, exactly as sent to every lane in this panel round (openrouter and, in Task 2,
local). The embedded document bodies are not re-duplicated below (they are reproduced verbatim in
`PAIRED-DESIGN-PREREG.md` itself and in the two frozen reference documents) — only the framing and
attack-lane text that wraps them is reproduced here, mirroring `DESIGN-REVIEWS.md`'s own practice of
naming embedded documents by path and blob SHA rather than inlining them a second time.

> You are an adversarial reviewer of a pre-registered instrument design. Attack this design as an
> adversary would — do not summarize it, do not praise it. Assume the author, Robert Li, wants this
> design to survive review unchanged, and hunt for where the design lets him get that.
>
> You are reviewing ONE document under attack:
>
> - **PAIRED-DESIGN-PREREG.md** — `experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md` rev 1,
>   the pre-registered paired win/loss/tie comparison design for the third-family
>   (`customer-support` replay-checkable subset) instrument, testing a tournament-selected agent (W)
>   against an unevolved baseline agent (B) via a sign test over discordant pairs.
>
> Two further documents are embedded below as REFERENCE MATERIAL, because the substance-drift and
> constant-traceability lanes cannot be judged without them:
>
> - **RECOMMENDATION.md** — `experiments/method-research/RECOMMENDATION.md`, source of the four-axis
>   compliance mapping (task semantics / oracle implementation / parser-scoring machinery /
>   promotion-gate role) that this design's own §2 reuses to clear `customer-support` against the
>   barred `data-ops`/`bi-analytics` promotion-gate hypothesis.
> - **DUALFIX-STUDY-PREREG.md** — `experiments/dualfix-study/DUALFIX-STUDY-PREREG.md`, the house
>   precedent whose integer-decision-rule discipline (a pinned integer margin, evaluated once from a
>   completed artifact, never a live float computation) this design's §5 claims to mirror for its own
>   sign-test critical-value table.
>
> Attack every one of the following, naming the specific section and claim you are attacking rather
> than commenting generally:
>
> 1. Whether any qualification clause (§6) bounds an aggregate statistic — a mean, a rate, a win
>    proportion, or any interval estimate — and so reintroduces the barred corridor mechanism under
>    different wording, whatever that clause is actually called.
> 2. Whether a sign test over discordant pairs (§5) is the right statistical object for this
>    comparison at all, and whether its stated null (W and B equally likely to win a discordant
>    pair) is the right null for what this design actually measures.
> 3. Whether the pinned critical-value table (§9) is arithmetically correct, and whether its stated
>    inclusive/exclusive boundary (`k_w >= c(n_d)` for W-superior, `k_w <= n_d - c(n_d)` for
>    B-superior) is correctly and consistently stated everywhere it is used.
> 4. Whether the adopted seed-clustering approach (§5, option 3 — seed as a blocking factor, pooled
>    across blocks) survives real intra-seed correlation, and whether the design's own disclosed
>    anti-conservative-bias cost is adequate or understates the risk.
> 5. Whether tie handling (§5) can silently destroy the design's statistical information — whether
>    discarding ties rather than splitting them is actually the right call, and whether the design's
>    own stated reasons for rejecting the split-tie alternative hold up.
> 6. Whether the minimum-discordant-pairs floor (§6 Clause 2, 20 pairs) is high enough to be a real
>    power check rather than a decorative one.
> 7. Whether the W and B arm identities (§3) make the comparison meaningful, and whether B (the
>    unevolved baseline) is a fair baseline rather than a straw one deliberately weakened to make W
>    look better.
> 8. Whether this hypothesis — W (tournament-selected winner) vs B (unevolved baseline) on
>    `customer-support`'s replay-checkable subset — is the barred promotion-gate comparison
>    relabelled, judged on substance against §2's own four-axis mapping, not on the names used.
> 9. Whether the termination clause (§7) permits unlimited extension of the study, or lets a
>    termination be silently recorded as though it were a null result rather than a distinct
>    outcome.
> 10. Whether the quantified disclosures (§8) carry real, checkable numbers or decorative ones that
>     do not actually bind anything.
> 11. Whether every constant in §9's pinned-constants table traces to the source it claims — a
>     cited source or an honestly-labelled derivation — and whether any constant used in the prose
>     is missing from that table.
> 12. Whether the oracle's answer-first construction (§4) actually keeps the ground truth
>     independent of the process under test, or whether some step lets the generator's own logic
>     define correctness in a way that could be exploited.
>
> Where an attack lane above genuinely produces nothing — you looked and found no defect — say so
> explicitly under that lane's heading ("No findings.") rather than omitting it or manufacturing a
> finding to have something to report. A silent lane is indistinguishable from a lane that was never
> attacked; an explicit non-finding is not.
>
> FORMAT REQUIREMENTS, followed exactly:
>
> - Open your entire response with one line of the exact form `**Verdict: X**` where X is exactly
>   one of `sound`, `sound-with-changes`, or `unsound` — nothing else on that line.
> - Number every finding you raise `F1`, `F2`, `F3`, … in the order you raise them, restarting at
>   F1 (this is YOUR OWN local numbering within your response; it will be merged into a global
>   sequence later by a separate plan — do not try to guess or reuse numbers from any other
>   reviewer).
> - Every finding must carry a specific claim and a specific location in the document (a section
>   number, e.g. "§5", or a clause/table reference).
> - Organize your findings under the twelve numbered attack lanes above, in order. If you have no
>   finding under a lane, write "No findings." under that lane's heading rather than omitting it.
>
> This design gates a real multi-day paired-comparison run against a single local inference slot. A
> finding worth making is worth stating precisely, with the section and the specific defect. Do not
> edit any files. Output only your review as markdown text.

(Embedded documents referenced above, not duplicated in this record: `PAIRED-DESIGN-PREREG.md` rev 1
@ `f52fd10f0374963a81ded0094d9c08516a8282ad`; `RECOMMENDATION.md` @
`7f5b6eff01217fd636339a5686897676665e776a`; `DUALFIX-STUDY-PREREG.md` @
`6d1734a544d1a40120dc0b60aa854654b24da87b`.)

## Lane: gpt-sol-pro

**Verdict: unsound**

### 1. Qualification clauses and the barred corridor mechanism

**F1 — §6 Clause 1 is an aggregate rate gate despite the document's denial.** Requiring at least 48 of 60 pairs to be jointly scoreable is exactly a lower bound on the joint scoreability rate: `48/60 = 80%`. Calling it an "instrument-health gate" and expressing it as a count does not stop it from bounding an aggregate rate. The closing declaration's claim that Clause 1 is "never a bound on a ... rate" is mathematically false.

**F2 — §6 Clause 3 is expressly an aggregate rate gate.** "No more than 6 of 60 (10%)" unscoreable outcomes per arm is a ceiling on each arm's unscoreable rate, and equivalently a floor of 90% on each arm's scoreability rate. It is a qualification condition whose breach terminates the study. That is the barred threshold mechanism under a different label, notwithstanding the assertion that it is merely a "COUNT ceiling."

**F3 — §6 Clause 2 is also an aggregate proportion gate.** A floor of 20 discordant pairs out of a fixed battery of 60 is a floor of one-third on the discordance rate. It does not constrain the direction of the effect, but the attack criterion asks whether any qualification clause bounds a mean, rate, win proportion, or interval estimate. Clause 2 bounds a rate. The categorical statement that none of the three clauses does so is untenable.

**F4 — §6's defense improperly narrows "corridor" to a two-sided window.** The document treats one-sided aggregate thresholds as categorically different from the prior corridor mechanism. They retain the operative feature that mattered: an aggregate statistic must cross a pre-registered numeric boundary before the result is admissible, and failure terminates the instrument line. The distinction between a one-sided threshold and a two-sided window does not establish that the mechanism has been removed "at the root."

### 2. Statistical object and null hypothesis

**F5 — §5's sign test is valid only as an exact McNemar test under assumptions the adopted design knowingly violates.** For paired binary outcomes, conditioning on discordant pairs and testing `Pr(W=1,B=0) = Pr(W=0,B=1)` is the exact McNemar construction. It requires independent pairing units, however. §5 then knowingly pools ten correlated tasks from each seed and applies the independent-binomial critical values anyway. Once that is adopted, the claimed `Binomial(n_d, 0.5)` null distribution is not the distribution of the statistic, so the test no longer has its stated level.

**F6 — §5 states a conditional null but interprets it as evidence about the tournament mechanism.** The null tests equality of the two discordant cell probabilities in this generated task population. It does not establish that tournament search caused any difference, that W generalizes beyond the tournament's selection process, or that W is preferable in absolute performance. The design nevertheless interprets a rejection as the tournament machinery outperforming the unevolved baseline. That interpretation requires, but does not pin, strict separation between tournament selection data and this battery, a fixed pre-data W, and a well-defined B.

**F7 — §5 does not address post-selection inference for W.** W is "the tournament-selected winner," but the preregistration does not say whether this paired battery, its seeds, its generator distribution, or related customer-support tasks participate in selecting W. If W is selected using the same tasks or a materially overlapping sample, the null distribution must account for winner selection. Treating the selected maximum as though it were a fixed arm makes the test anti-conservative even if the pairs themselves were independent.

**F8 — §5's null is too weak for the claimed practical comparison.** Equality conditional on discordance can coexist with both arms being nearly always wrong, nearly always right, or producing very different failure modes. A rejection answers only which discordant cell is more frequent. It does not answer whether W has a useful accuracy advantage, whether its absolute performance is acceptable, or whether the tournament's cost is justified. Those broader readings are invited by "W-superior" and "B-superior" rather than the narrower "discordant-cell asymmetry detected."

### 3. Critical-value table and boundaries

No findings. The §9 values agree with the stated exact condition for every `n_d` from 20 through 60. The upper boundary `k_w >= c(n_d)`, lower boundary `k_w <= n_d - c(n_d)`, and strict middle interval are arithmetically symmetric and are stated consistently in §§5, 7, and 9.

### 4. Seed clustering

**F9 — §5 option 3 does not make seed a blocking factor in the inferential sense.** Merely arranging tasks into seed blocks and then pooling all counts without a block term, permutation restriction, cluster-level statistic, or variance adjustment gives the same test as ignoring the blocks. "Seed as a blocking factor" is therefore a misleading name for the adopted analysis.

**F10 — §5 knowingly adopts an invalid reference distribution to preserve integer arithmetic.** Avoiding live floating-point computation is an implementation preference, not a statistical justification for counting correlated observations as independent. Exact integer alternatives exist, including a pre-specified randomization test over seed-level arm-label swaps, an exact test on six seed-level directional summaries, or a fully enumerated blocked permutation distribution. The claim that option 3 is required by the integer discipline is false.

**F11 — §5 understates the clustering risk by treating per-seed reporting as meaningful mitigation.** Six post hoc win/loss breakdowns do not repair inflated type-I error, and "visibly driving" has no pre-registered definition. Correlation can be moderate and distributed across all six seeds without one seed looking anomalous. The design will still issue the unqualified label `W-SUPERIOR` or `B-SUPERIOR` using a known anti-conservative test.

**F12 — §5 provides no bound on how bad the inflation can be.** With ten highly correlated tasks per seed, the effective sample size can approach six rather than sixty. In the extreme, six seed-level directional draws are replicated ten times and fed to a critical table indexed by approximately sixty observations. The nominal 5% claim can then be grossly wrong, not merely mildly optimistic. Describing the cost only as "more often" rejecting understates the potentially order-of-magnitude loss of calibration.

### 5. Tie handling

**F13 — §5 falsely claims that discarding ties is the only integer-compatible convention.** Split ties can be represented without floating point by doubling all counts: each directional win contributes 2 and each tie contributes 1 to each side. Whether split ties are statistically desirable is separate, but the asserted incompatibility with integer arithmetic is simply false.

**F14 — §5 mischaracterizes split-tie handling as a "stricter sign-test variant."** Splitting ties changes the estimand and null distribution; it is not merely the same exact discordant-pair test made stricter. The rejection is defended against an imprecisely specified alternative rather than against a pinned competing procedure with its own decision rule.

**F15 — §5 discards potentially important agreement information while using labels that imply overall superiority.** Excluding concordant pairs is appropriate for the exact McNemar null of marginal homogeneity, but it means the inferential result can be driven by a small discordant subset while most tasks are double failures or double successes. Recording ties does not prevent the resulting `W-SUPERIOR` label from overstating what was established. The verdict must be explicitly limited to discordant-cell asymmetry or accompanied by pre-registered marginal accuracy estimates.

### 6. Minimum discordant-pairs floor

**F16 — §6 Clause 2's floor of 20 is not a power calculation for this test.** At `n_d = 20`, W-superiority requires at least 15 wins, an observed discordant win proportion of 75%. Even if W's true probability of winning a discordant pair were 0.70, the upper-tail rejection probability is only about 42%; at 0.75 it is only about 62%. The floor therefore does not support conventional power even for very large directional effects.

**F17 — §6 Clause 2 imports an unrelated constant as though sample-count equality implied evidentiary equality.** `DUALFIX_CORPUS_MIN_N = 20` governed a different metric, arm structure, and decision margin. Reusing that number supplies no assurance for an exact paired-binomial test. The document admits that it is not power-derived but still calls the resulting population "large enough" in §7. That conclusion does not follow.

### 7. W and B arm identities

**F18 — §3 does not actually pin W as a concrete agent definition.** It supplies a generative description of W, not a configuration identifier, immutable artifact digest, tournament commit, selection rule inputs, or selected-agent hash. "The tournament-selected winner" can denote different agents depending on when and how the tournament runs. This leaves Robert Li discretion to select or rerun W before the paired study while still claiming compliance.

**F19 — §3 does not pin B and therefore cannot enforce the claimed equal-treatment comparison.** "The configuration a human would hand-write" and "the best a human would write without the tournament" are subjective procedures, not an arm definition. No prompt text, artifact digest, author, drafting deadline, revision rule, or blindness to W is specified. B can be weakened, strengthened, or tailored after W is known.

**F20 — §3's baseline construction is vulnerable to straw-baseline selection.** Rejecting an explicitly impoverished `s0-minimal` arm does not establish that the chosen B is competent. A fair baseline would need a frozen, independently produced prompt under a pinned human-effort budget, or a representative set of human-written baselines selected without access to outcomes. The current design lets the author choose one convenient baseline and label it "best."

**F21 — §3 does not isolate search from prompt-author effort and selection budget.** W receives bounded mutation plus tournament selection; B receives an undefined one-shot human construction. The measured contrast mixes search, number of candidates evaluated, optimization data, compute, and drafting effort. Calling "presence or absence of search" the sole differing axis hides these bundled treatment differences.

### 8. Substance of the barred comparison

**F22 — §2 omits the most important substance axis: the treatment contrast is exactly prompt search versus a hand-written baseline.** W is produced by reflective prompt mutation and tournament selection; B is the unevolved human-written configuration. That is the central barred comparison described by the reference material. Changing the task object and parser does not change the intervention being compared.

**F23 — §2's four-axis mapping is insufficient because three axes describe substrate implementation rather than the hypothesis.** Task semantics, oracle mechanism, and parser machinery will change whenever the same optimization hypothesis is moved to another vertical. Treating those inevitable engineering changes as three independent substantive differences makes the bar trivially evadable by changing datasets. The causal question remains whether prompt-search beats a hand-written baseline.

**F24 — §2's "not a promotion gate" claim is contradicted by the surrounding workflow.** The study is REQ-69's paired round, immediately precedes Phase 14's REQ-68 admission decision, and gates a real multi-day run for the same pending vertical. Saying admission will use "different evidence" does not identify that evidence or prohibit this result from influencing admission. D-05's absence of a corridor is not proof that the study lacks a promotion-gate role.

**F25 — §§1, 2, and 4 relabel synthetic construction as replay.** The selected tasks are repeatedly called "historical support tickets" with known historical resolutions, but §4 says both the resolution and ticket text are generated from a seed. That is construction, not replay of an independently recorded historical outcome. The claimed `replay + construction` distinction from prior construction-based instruments is therefore weaker than the mapping states.

### 9. Termination and null-result separation

No findings. §7 prohibits extending seeds, redrawing the battery, rerunning an arm, or rebuilding a successor instrument for the same hypothesis after qualification failure. It also specifies distinct terminal-state encodings for termination and completed null results.

### 10. Quantified disclosures

**F26 — §8 item 1 has an off-by-one defect.** Exactly 40 ties leave exactly 20 discordant pairs, which meets Clause 2. Fewer than 20 discordant pairs arise only with at least 41 ties. The disclosure says a tie rate "at or above" 40 leaves fewer than 20 and equates that with Clause 2's underpowered state; both statements are false at the boundary.

**F27 — §8 item 3's threshold is internally incoherent.** It defines a resolution-mismatch rate "excluding no-artifact/non-scoreable" but then expresses the trigger as 54 of 60 attempts. If excluded outcomes exist, the relevant denominator is the number of scoreable attempts, not 60. For example, 54 mismatches among 54 scoreable attempts is 100%, while 50 mismatches among 54 scoreable attempts exceeds 90% but does not reach 54 of 60. The two rules produce different disclosures.

**F28 — §8 item 3 does not bind any decision or interpretation.** Even if 90% of an arm's scoreable outputs are mismatches, the study can still issue `W-SUPERIOR` or `B-SUPERIOR`; the disclosure merely says the comparison "may be uninformative." No required verdict qualifier, sensitivity result, or prohibition on a superiority claim follows. The number is decorative.

**F29 — §8 item 4 violates §8's own promise that every disclosure carries a literal number.** It requires per-seed counts but supplies no numeric heterogeneity threshold, dominance threshold, or action criterion. "Disproportionately" and "one or two seeds" are visual impressions, not a checkable disclosure rule.

### 11. Constant traceability

**F30 — §9 does not contain every constant used in §§3–8.** Missing values include the exactly-one-attempt limit in §3, binary score values 0 and 1 in §§4–5, the four per-task categories in §4, and the "zero shared helper functions" requirement in §4. More importantly, the model digest, timeout, and prompt-length bound are declared pinned in §3 but no literal values or provenance appear in §9.

**F31 — §9 gives no honest source for `α = 0.05`.** "The standard two-sided sign-test significance level" is neither a cited source nor a derivation. Alpha is a design choice, not a mathematical consequence of choosing a sign test. It should be labelled as a chosen conventional value rather than presented as sourced.

**F32 — §9's provenance for the 90% dominant-failure threshold does not derive the value.** "Chosen as a high bar" is an admission of judgment, not a derivation. Worse, the claimed consequence that 90% mismatches means matches on 10% or fewer "of its scoreable attempts" does not follow from `54 of 60` when unscoreable attempts are excluded from the rate.

**F33 — §9's tie-rate constant preserves the §8 boundary error.** `60 - 20 = 40` is the maximum tie count that still leaves the minimum permitted 20 discordances. It is not the point at which the study is underpowered. A disclosure tied to actual Clause 2 failure would use 41 of 60 as the first failing integer boundary.

### 12. Oracle independence and answer-first construction

**F34 — §4 establishes temporal independence from the arms, not independence of ground truth from the generator.** The generator composes the answer, derives the ticket from that answer, and supplies the state against which the answer is checked. Separate matching helpers do not create an exogenous oracle when one generative system defines both the question and what counts as correct.

**F35 — §4 knowingly leaves the question-answer fidelity condition unverified.** It admits that a rendering bug may produce ticket text that does not denote the pinned resolution and defers the fidelity check to Phase 14. That is not a minor implementation detail: without a frozen fidelity oracle, the preregistration has not defined how malformed or ambiguous generated tasks are detected, excluded, or counted. Post-freeze Phase 14 discretion can alter the effective task population.

**F36 — §4's structured match can reward generator-template exploitation rather than support competence.** The target consists of generator-pinned action, category, and parameters, and the ticket is rendered from those same fields. Repeated templates, lexical leakage, or deterministic correlations can let W or B infer generator codes without solving a realistic ticket. No held-out template families, leakage test, or generator-blind validation is pre-registered.

**F37 — §4 assumes a unique correct resolution without defining equivalence.** Real support tickets can admit multiple effective actions, parameterizations, or resolution sequences. Exact matching to the generator's chosen tuple makes "correct" mean "the answer the generator happened to select," not independently verified task success. The design provides no equivalence classes or execution-based outcome check.

**F38 — §4's claim that two readers will classify raw responses identically is unsupported.** Categories 1 and 2 depend on whether a response contains an "identifiable resolution proposal" and whether it names fields in a form the oracle can evaluate. No extraction grammar, parser contract, ambiguity rule, or precedence rule is pinned. Human or implementation discretion can therefore determine scoreability before the supposedly objective binary match occurs.

**Raw finding count — gpt-sol-pro: 38 (F1–F38).**

## Lane: kimi-k3

**Verdict: sound-with-changes**

### Lane 1 — Aggregate-statistic bounds in §6

**F1 — §6 Clause 2 is a floor on a conditioning population whose size is itself a random outcome of the arms' behavior, and the "no numeric-window clause" declaration overstates what that buys.** The closing declaration of §6 is technically accurate — none of Clauses 1–3 bounds a win rate or mean — but Clause 2's floor on `n_d` is a gate on a statistic that is *jointly determined by both arms' tie behavior*, not just by instrument health. A battery where both arms are genuinely strong produces both-1 ties in bulk and can terminate as UNDERPOWERED precisely because the arms are good — the clause gates on the phenomenon under measurement, not merely on data usability. The §6 declaration's framing ("all three constrain only whether the instrument produced enough usable data") papers over this: the discordant count is not neutral metadata like a drop count. The design should state plainly that Clause 2 can terminate the study *because the arms performed too similarly well*, which is a qualitatively different termination cause than "could not run."

### Lane 2 — Sign test as the statistical object

No findings. With paired binary outcomes, the sign test over discordant pairs is McNemar's test — the canonical correct object for this exact data shape. The null (equal probability of W vs B winning a discordant pair) is the right null for a marginal-homogeneity claim, and §10 honestly discloses the magnitude blindness. The object is well-chosen.

### Lane 3 — Critical-value table arithmetic and boundary consistency

**F2 — §9 table verified correct on spot-check, but the table is asserted correct with no machine-checkable derivation artifact.** I recomputed `c(n_d)` from the stated condition (`40 · Σ_{i=c}^{n} C(n,i) ≤ 2^n`) at n=20, 21, 22, 23, 25, 27, 30, 40, 60 and the boundary cases around each claimed `c` (c and c−1); every checked value is correct, and the third column equals `n_d − c(n_d)` at every row checked. The boundary statements (`>=`, `<=`, strict indistinguishable interval) are stated identically in §5, §7, and the §9 table header — consistent. The residual defect: this design explicitly claims DUALFIX §7's "integer rule evaluated once" discipline, but DUALFIX paired its integer rule with a *drift test* (`test/dualfix-study-prereg-sync.test.ts`) against exported constants; here the 41-row table has no stated regeneration script or drift-guard mechanism named in §9 — Phase 14 "transcribes" it by hand. A transcription error in one of 41 integers is undetectable by anything in this document.

### Lane 4 — Seed clustering (§5 option 3)

**F3 — §5 rejects every intra-seed-correlation correction as float-contaminated, but never considers the integer-compatible robust alternative, and its anti-conservative disclosure is unquantified.** The disclosed cost ("rejects MORE OFTEN than nominal α") carries no magnitude. With 6 seeds and high intra-seed sign consistency (the realistic failure mode — a seed whose ten tickets systematically favor one arm), the effective sample size approaches 6, and the true per-tail error at the §9 table can be several times the nominal 0.025; "anti-conservative" is doing a lot of quiet work. Worse, the design's stated reason for adopting option 3 — that options 1 and 2 require data-time floats — is a false trichotomy: a **seed-level sign test** (six blocks, each block scored W-majority / B-majority / tied; decision on the 6-block sign counts against a trivially pinnable integer table, e.g., W-superior iff ≥5 of 6 blocks go W with none tied, or a two-stage rule combining block-level and pooled counts) preserves the pure-integer end-to-end discipline *and* is robust to intra-seed correlation. Option 3 was adopted for pipeline convenience, and the justification given ("a design-time-pinned table has no closed form that absorbs a data-dependent adjustment") does not apply to block-level integer aggregation. The §8 item 4 diagnostic is expressly non-binding ("the decision rule itself stays the plain pooled integer comparison regardless of what the diagnostic shows") — the design detects its own known failure mode and pre-commits to ignoring it.

### Lane 5 — Tie handling

**F4 — §5's stated reason (2) for rejecting split ties is arithmetically false, and the design should not rest on it.** "Splitting a tie requires crediting a fractional (0.5) win, which would reintroduce a non-integer value into `k_w`" — it would not: doubling the entire decision path (compare `2·k_w` against a table of `2·c(n_d)` values) keeps every quantity an exact integer, with ties contributing exactly 1 to the doubled win count. The integer-purity argument is manufactured; the real justification is reason (1) (a tie carries no directional evidence), which is sufficient and standard. Leaving a false arithmetic claim in a pre-registration that elsewhere stakes its credibility on integer exactness is exactly the kind of thing a hostile adjudicator quotes back. The substantive choice (discard ties) is defensible; one of its two stated defenses is not.

### Lane 6 — The 20-pair floor (§6 Clause 2)

**F5 — The floor is decorative as a power check, and the disclosure of that fact does not fix it.** At `n_d = 20`, `c(20) = 15`: W must win ≥75% of discordant pairs for any verdict other than INDISTINGUISHABLE. Against a true discordant-win probability of 0.65 (a large real effect for a tournament-vs-baseline comparison), power at the floor is well under 0.5; against 0.60 it is negligible. So a study landing at n_d = 20–24 passes Clause 2, runs to COMPLETE, and will almost certainly report INDISTINGUISHABLE even under a substantial real effect — producing a *legitimate-looking null result* that §7 explicitly canonizes as "a standalone, legitimate finding," not a caveat. §9 discloses that 20 is "not independently power-derived," but honesty about a decorative floor does not make it non-decorative: the design admits completed runs whose null verdicts carry almost no evidential weight, and §7 forbids the reader from calling them anything other than legitimate. The floor should be raised (or a minimum-power condition stated against a declared smallest effect of interest), or §7's null-result canonization should be conditioned on `n_d` clearing a power threshold, not merely 20.

### Lane 7 — Arm identities (§3)

**F6 — B is not actually pinned, and the design's claimed protection against a straw baseline does not exist operationally.** §3's heading says "W and B, pinned as concrete agent definitions," but the text pins B only as a *description* — "the configuration a human would hand-write without running the tournament machinery" — with no named author, no config artifact, no prompt text, no hash, and no commitment that B is written *before* W's tournament output is observed. The person writing B (presumably Robert Li) is the same person who wants W to win; nothing in §3, §6, or §9 prevents B from being authored after W's definition is known, or iterated informally against W's known weaknesses. §3 rejects the s0-minimal straw framing in prose, but prose rejection is not a mechanism. The minimum the design needs: B's full configuration frozen as a committed artifact whose commit precedes the tournament run producing W, with authorship and blinding stated. As written, the single most important fairness property of the comparison rests entirely on the author's say-so.

### Lane 8 — Substance vs. the barred promotion-gate comparison (§2)

**F7 — The axis-4 clearance relies on a firewall that exists nowhere in the design; the verdict-feeds-gate sentence from DUALFIX §2 is conspicuously absent.** The barred hypothesis is *prompt-search vs hand-written baseline as the phase-5 promotion gate*. This design is, on its face, **search-selected agent vs hand-written baseline** — axes 1–3 differ only because the vertical differs, which the bar already anticipated ("under any label... on substance, not name" was scoped to the two verticals, but the comparison *shape* is the barred one). The entire clearance therefore rides on axis 4: "not a promotion gate... admission is Phase 14's separate REQ-68 decision, made on different evidence." But nothing in this document prevents Phase 14's REQ-68 admission decision from citing a W-SUPERIOR result as evidence — there is no clause comparable to DUALFIX-STUDY-PREREG §2's explicit "**no verdict here feeds such a gate**." The claim "made on different evidence" is an assertion about a future phase's behavior that this pre-registration does not bind. If the author's Phase 14 self cites this study's W-SUPERIOR verdict in the `customer-support` admission argument, the barred-hypothesis substance mapping collapses retroactively, and no artifact in this design would be violated. The mapping's strongest axis is unenforced.

### Lane 9 — Termination (§7)

**F8 — One-shot termination has no harness-fault escape hatch, inverting DUALFIX's own precedent.** DUALFIX-STUDY-PREREG §6 contains `onceWithHarnessRetry` precisely because a single flaky inference slot (connection refused, server restart, kill) must not be allowed to produce a spurious terminal outcome. This design runs against the same single local inference slot, counts no-artifact/non-scoreable toward Clause 3's 6-of-60 per-arm ceiling, and terminates the *hypothesis line permanently* on breach — with no retry rule, no transient-fault carve-out, and no distinction between "the arm produced nothing" and "the slot dropped the request." An infrastructure hiccup affecting 7 of 60 attempts permanently bars REQ-69's hypothesis "under any label." That is a category error baked into a one-way door: a run-integrity gate that cannot distinguish model failure from harness failure should not carry irreversible consequence. On the positive side, the termination-vs-null distinction itself is well constructed: three named termination states vs. COMPLETE + three decision outcomes is genuinely non-conflatable, and no finding on that sub-point.

### Lane 10 — Quantified disclosures (§8)

**F9 — §8 item 1's tie-rate ceiling has an off-by-one error at its stated boundary.** "If the observed tie rate reaches or exceeds 40 of 60 (66.7%), this design is disclosed IN ADVANCE as likely UNDERPOWERED: a tie rate at or above that level leaves fewer than 20 discordant pairs." False at exactly 40: 60 − 40 = 20 discordant pairs, which *meets* Clause 2's floor (`≥ 20`). Only a tie count of **41 or more** leaves fewer than 20. The ceiling as stated (40) and §9's provenance ("60 − 20, the arithmetic complement") encode the wrong side of the boundary: the complement of the *floor* is 41 for a strict "fewer than 20" reading, or the disclosure text should say "leaves at most 20, at the floor" rather than "fewer than 20." In a document whose entire statistical apparatus is inclusive/exclusive-boundary discipline, its flagship disclosure gets its own boundary wrong.

**F10 — §8 item 3 (90% mismatch ceiling) binds nothing.** It is expressly "a disclosure, not a qualification gate," with no stated consequence when breached — not a rebuttable presumption, not a required annotation on the verdict, not even a mandated phrase in the results artifact. Combined with §5's non-binding per-seed diagnostic (F3), the design's pattern is: identify a real confound, attach a number to it, and pre-commit to acting identically whether or not the number is exceeded. A disclosure that changes nothing about any downstream artifact is decorative, and item 3's §9 derivation ("flags only the case where... the oracle's own discriminating power is itself in question") describes a condition under which the study's verdict is *uninterpretable* — which deserves a gate, not a footnote.

### Lane 11 — Constant traceability (§9)

**F11 — Constants used in §3's equal-treatment invariant are missing from §9, falsifying the table's own closing claim.** §3 names "the timeout, the prompt-length bound, the attempt discipline" as pinned-identical across arms — these are constants the design relies on — yet §9 contains no timeout value and no prompt-length bound (contrast DUALFIX §9, which pins `MAX_DUALFIX_PROMPT_CHARS` with file and symbol). §9's closing sentence ("a constant used above and missing here is the defect this table exists to catch; none is left out") is therefore false at rev 1. Either these quantities are pinned (in which case they belong in the table) or they are deferred to Phase 14 (in which case §3's "equal-treatment invariant" currently pins nothing about them and the table's completeness claim must be scoped). Additionally, the literal `40` in §5's combinatorial condition is a design constant (the reciprocal of the per-tail α) that appears nowhere in the constants table as such.

### Lane 12 — Oracle independence (§4)

**F12 — The structured-match equivalence relation is operationally undefined, leaving the oracle's decisive degree of freedom unpinned.** §4 says a proposal matches if it matches "the known resolution's defining structured fact (the action taken, the resolution category, and any resolution-specific parameter)" — but nowhere defines what *matching* means: exact string equality? Normalized equality? Set inclusion? A proposal naming the right category but a synonymous action string scores 0 or 1 depending on an implementation choice that Phase 14 will make *after* this document freezes, with full knowledge of neither constraint nor audit. This is the oracle's single most consequential decision, and it is the one thing §4 leaves open. Relatedly, the disclosed rendering-fidelity gap (same generator renders ticket text from resolution semantics) is more dangerous than the disclosure admits: if the generator's ticket text carries surface regularities correlating with the resolution's structured fact (templated phrasing per category — the default failure mode of a seeded deterministic generator), then an arm can score matches by exploiting *generator tells* rather than task competence — and W, whose tournament selection ran against generator-family batteries, is systematically *better positioned* to exploit those tells than the hand-written B. The paired comparison would then measure differential tell-exploitation, not the tournament mechanism, and the §5 decision rule would certify it as W-SUPERIOR. The disclosure names a fidelity gap but never names this asymmetric-exploitability consequence, which runs in exactly the direction the author wants.

**Raw finding count — kimi-k3: 12 (F1–F12).**

## Lane: qwen-max

**Verdict: sound-with-changes**

### Lane 1: Qualification clauses bounding an aggregate statistic

No findings. §6's three clauses are count-based gates (scoreable-pair floor, discordant-pair floor, unscoreable ceiling) that constrain data sufficiency, not performance location. The closing declaration correctly characterizes them.

### Lane 2: Sign test appropriateness

No findings. The sign test over discordant pairs is appropriate for paired binary outcomes, and the null (W and B equally likely to win a discordant pair) is the correct null for detecting directional difference.

### Lane 3: Critical-value table arithmetic

No findings. Spot-checks confirm correctness: for n_d=20, c=15 gives 40·21700=868000 ≤ 1048576=2²⁰, while c=14 gives 40·60460=2418400 > 1048576. Boundary conditions (inclusive at c(n_d) for W-superior, inclusive at n_d−c(n_d) for B-superior) are stated consistently in §5 and §9.

### Lane 4: Seed clustering

**F1.** §5 adopts option 3 (pooled test) and acknowledges anti-conservatism, but the mitigation—per-seed diagnostic reporting (§8 item 4)—is a disclosure without a decision rule. If the diagnostic reveals one seed driving the pooled result, the design provides no pre-registered action: the pooled integer comparison fires regardless. This leaves the anti-conservative bias uncorrected at the decision point, not merely disclosed.

**F2.** §5's cost disclosure names only the seed-clustering source of anti-conservatism. The design also discards ties (Lane 5), which reduces n_d and can concentrate directional signal, compounding the false-positive tendency. The cumulative anti-conservative bias from both choices together is not acknowledged.

### Lane 5: Tie handling

**F3.** §5's second reason for rejecting split-ties overstates the integer-arithmetic objection. The design claims splitting "would reintroduce a non-integer value into the win count k_w that this section's own decision rule requires to stay a pure integer end to end." This is false: one can split ties (0.5 wins each) and double all counts (k_w' = 2·k_w, n_d' = 2·n_d), preserving integer arithmetic throughout and indexing the same critical-value table at the doubled values. The first reason (ties carry no directional information) is sufficient; the second is asserted as a constraint but is actually a design choice.

### Lane 6: Minimum-discordant-pairs floor

**F4.** §6 Clause 2's floor of 20 is reused from `DUALFIX_CORPUS_MIN_N` for "house-convention consistency" and is explicitly "not independently derived from a power calculation specific to this paired design." At n_d=20, the critical value is 15 (75% win proportion among discordant pairs). Power against a true 60% win probability is approximately 18%; against 65%, approximately 37%. The floor detects only very large effects (≥70% win probability) with reasonable power. This is disclosed but not grappled with: the design does not state what effect sizes it is actually powered to detect at this floor.

### Lane 7: Arm identities

No findings. B is the "best a human would write without the tournament," not a deliberately weakened straw man. The design explicitly rejects the s0-minimal alternative (§3) for this reason.

### Lane 8: Barred promotion-gate hypothesis relabelled

No findings. §2's four-axis mapping shows substantive differences on all four axes, including promotion-gate role (this design is a property measurement under D-05's no-corridor rule, not an admission gate). The mapping is stronger than RECOMMENDATION.md's own 3-of-4 precedent.

### Lane 9: Termination clause

No findings. §7's one-shot termination prohibits extension by seed-list expansion, battery redraw, or arm re-run. Terminal states (TERMINATED-*) are distinct from completion states (COMPLETE with W-SUPERIOR/B-SUPERIOR/INDISTINGUISHABLE), preventing silent conflation.

### Lane 10: Quantified disclosures

No findings. §8's four disclosures carry literal numbers (40/60, α=0.05, 54/60, per-seed counts) that bind the design to checkable thresholds.

### Lane 11: Pinned constants traceability

**F5.** §9's critical-value table provenance states the formula `40 · Σ_{i=c(n_d)}^{n_d} C(n_d, i) ≤ 2^{n_d}` but the constant "40" (derived as 1/0.025, the reciprocal of the per-tail significance level) is not listed as a separate entry in the constants table. While derivable from α=0.05, the table's stated purpose is to catch "a constant used in the prose but missing from this table"—and "40" is used in the formula without its own row.

### Lane 12: Oracle answer-first construction

No findings. §4's answer-first construction composes ground truth before generating the ticket, and the match oracle shares zero helper functions with the generator. The disclosed gap (ticket-text rendering fidelity) is named and deferred to Phase 14, not silently exploited.

**Raw finding count — qwen-max: 5 (F1–F5).**

## Lane: gemma4

**Verdict: unsound**

**1. Qualification clauses (§6)**
No findings.

**2. Sign test appropriateness (§5)**
No findings.

**3. Critical-value table and boundaries (§9, §5)**
No findings.

**4. Seed clustering approach (§5)**
F1: The decision to adopt Option 3 (pooling raw counts across blocks) in §5 explicitly introduces an anti-conservative bias that increases the risk of False Positives (Type I errors). By ignoring intra-seed correlation, the design treats dependent observations as independent, effectively inflating the nominal sample size $n_d$. While §5 and §8 item 4 disclose this as a "diagnostic," a diagnostic is not a correction; it allows the decision rule to fire on a biased statistic while merely providing a post-hoc record of how that bias may have occurred. This creates a systematic path for Robert Li to report W-superiority based on a few lucky seeds rather than a generalizable effect.

**5. Tie handling (§5)**
No findings.

**6. Minimum-discordant-pairs floor (§6 Clause 2)**
No findings.

**7. Arm identities (§3)**
F2: The definition of Arm B as an "unevolved baseline" in §3 is fatally under-specified. It describes B as the configuration a human would write without running tournament machinery, but it fails to require that B be optimized via standard manual prompt engineering (e.g., iterative refinement or few-shotting). Without a requirement for B to be a competitive manual baseline, Robert Li can utilize a naive, unoptimized prompt for Arm B, creating a straw man that ensures the GEPA-selected W appears superior regardless of whether the tournament machinery actually adds value over standard human engineering.

**8. Barred promotion-gate relabelling (§2)**
No findings.

**9. Termination clause (§7)**
No findings.

**10. Quantified disclosures (§8)**
No findings.

**11. Constant traceability (§9)**
No findings.

**12. Answer-first construction (§4)**
No findings.

**Raw finding count — gemma4: 2 (F1–F2).**

## Lane: gpt-oss

**Verdict: unsound**

### 1. Qualification clause (§6) bounds an aggregate statistic?

No findings.

### 2. Appropriateness of the sign test and its null hypothesis

**F1 – Claim:** The design applies a simple sign test over discordant pairs with the null that *W* and *B* are equally likely to win any given discordant pair (i.e., each arm has probability 0.5 of scoring 1). This assumption is invalid when the two arms have different overall rates of producing scoreable resolutions, because a higher rate of valid proposals naturally yields more opportunities for ties and changes the effective probability that an observed win reflects true superiority rather than a difference in failure modes. Consequently, the test may produce misleading p-values and erroneous conclusions about agent performance.
**Location:** §5, paragraph beginning "The test population: discordant pairs only…".

### 3. Correctness of the pinned critical-value table (§9)

No findings.

### 4. Seed-clustering approach (§5, option 3) and intra-seed correlation

**F2 – Claim:** Pooling discordant wins and losses across seeds while treating all sixty pairing units as independent observations ignores the inevitable within-seed correlation induced by identical seed-derived tickets. The design acknowledges this anti-conservative bias but offers no statistical correction or a bound on its impact, thereby risking inflated type-I error rates without justification for the chosen threshold of 20 discordant pairs.
**Location:** §5, sub-section "Seed clustering, addressed head-on."

### 5. Tie handling (discarding vs splitting)

**F3 – Claim:** Discarding ties eliminates directional information that could be informative about agent behavior and reduces the effective sample size, thereby lowering test power. The justification that split-tied pairs would introduce non-integer wins (0.5) and thus violate the integer decision rule is mistaken; a simple rounding scheme preserves integer arithmetic while retaining more information. As written, the design sacrifices statistical efficiency without valid technical reason.
**Location:** §5, paragraph beginning "Rejected tie-handling alternative…"

### 6. Minimum-discordant-pairs floor (20 pairs)

**F4 – Claim:** The choice of a minimum of 20 discordant pairs is arbitrary and not derived from a formal power analysis for the two-sided sign test at α = 0.05. Without such justification, the floor may be either too low to achieve acceptable power or unnecessarily restrictive, undermining confidence in reported results.
**Location:** §6, "Clause 2 — minimum-discordant-pairs floor."

### 7. Fairness of W and B arm identities (§3)

**F5 – Claim:** Defining *B* as the same underlying model without any tournament-driven search creates a straw-man baseline that is unlikely to match real hand-written baselines in complexity or quality. This asymmetry inflates the apparent superiority of *W*, violating the principle of a fair comparison between an evolved agent and a properly engineered human or static model baseline.
**Location:** §3, paragraphs describing *B* as "unevolved baseline" and the discussion of equal-treatment invariants.

### 8. Hypothesis relabeling vs barred promotion-gate comparison

**F6 – Claim:** Although §2 maps the design onto four axes and claims substantive differences from the barred hypothesis ("prompt-search vs hand-written baseline on data-ops or bi-analytics"), both *W* (a prompt-search agent) and *B* (hand-written baseline) are compared in a pairwise win–loss fashion. The original bar prohibits any promotion-gate comparison of a prompt-search instrument against a hand-written baseline regardless of vertical name; therefore the design still falls under the barred class, rendering its compliance claim invalid.
**Location:** §2 and §3 where the mapping is asserted.

### 9. Termination clause (§7) permitting silent extension or null conflation

No findings.

### 10. Quantified disclosures (§8)

No findings.

### 11. Constant provenance in §9's pinned-constants table

No findings.

### 12. Oracle's answer-first construction independence (§4)

**F7 – Claim:** The design claims that ground truth is generated independently of the agent under test, yet the same rendering logic used to compose the known resolution also generates the customer-facing ticket text from that resolution's semantics. Any bug or bias in this shared rendering step would produce tickets whose wording unintentionally hints at the correct resolution, thereby violating true independence of the oracle and potentially inflating match rates.
**Location:** §4, paragraph beginning "What this independence does not cover…"

**Raw finding count — gpt-oss: 7 (F1–F7).**
