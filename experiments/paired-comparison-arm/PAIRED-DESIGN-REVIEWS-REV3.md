# Adversarial panel round — PAIRED-DESIGN-PREREG.md §12 (rev 3 DRAFT amendment) (2026-08-20, plan 15-03)

## Scope of this panel round

This document covers the five-lane adversarial panel over the **rev-3 DRAFT amendment (§12)** of
`PAIRED-DESIGN-PREREG.md` only. It is a separate record from `PAIRED-DESIGN-REVIEWS.md`, which
covers the reachability probe and the full panel round over the frozen rev-2 design (§0–§11) and
stands unchanged — that record is the review of the sections this amendment does not touch. The
rev-2 methodology itself (the oracle, the generator, the equal-treatment invariant, the sign-test
machinery) already cleared its own five-lane panel at rev-2 freeze
(`2f9e6095dc6e20bcc8196a293397f7ec07f8c704`) and is explicitly OUT OF SCOPE here, per the review
packet's own framing below. What this panel reviewed: the executor-model swap, the battery-size
widening (60→90) and its three recomputed values, the widened critical-value table (71 rows),
and the two decisions §12 leaves explicitly open (seed-block shape; near-floor evidential-weight
bound). What it did not review: anything §0–§11 already covers unmodified.

This record covers Task 1 (the three externally-hosted lanes) and Task 2 (the two locally-hosted
lanes) — five lane transcripts in total, recorded verbatim. **No finding below is adjudicated,
merged, deduped, or dismissed in this document** — that is plan 15-04's job. Every lane received
the identical review packet, assembled once (below) and never altered between lanes.

**Panel (Task 1, this section):** gpt-sol-pro (unsound), kimi-k3 (sound-with-changes), qwen-max
(sound-with-changes). Three of the five target lanes; the two locally-hosted lanes (gemma4,
gpt-oss) follow in Task 2 below. No lane was dropped, substituted, or silently re-run.

## Review packet

The packet embedded two reference blocks in full and sent identical text to all five lanes — the
embedded document bodies are not re-duplicated here (mirroring `PAIRED-DESIGN-REVIEWS.md`'s own
practice of naming embedded documents by path and revision rather than inlining them a second
time); only the framing, scope statement, and attack-lane text that wraps them is reproduced below.

- **BLOCK 1** — §5, §6, §7, §8, §9 of the frozen rev-2 design (`PAIRED-DESIGN-PREREG.md` @
  `2f9e6095dc6e20bcc8196a293397f7ec07f8c704`, blob `d68eebb7d47e389745f919d8f975bcd8b45d6349`) — the
  decision rule, the qualification clauses, the terminal states and disclosures, and the rev-2
  pinned-constants table including the 41-row critical-value table at the old battery size (60).
- **BLOCK 2** — §12 of the current DRAFT (`PAIRED-DESIGN-PREREG.md`, uncommitted rev-3 amendment
  text appended after the byte-identical §0–§11 at commit `d48e0f2d051ee5dbd1d7c56652c59666c2c6abce`)
  — the amendment itself, under attack.

> You are an adversarial reviewer of a proposed AMENDMENT to a pre-registered instrument design.
> Attack the amendment as an adversary would — do not summarize it, do not praise it. Assume the
> author, Robert Li, wants this amendment to survive review unchanged, and hunt for where the
> amendment lets him get that.
>
> ### What is and is not under review
>
> This is a REV-3 AMENDMENT to `PAIRED-DESIGN-PREREG.md`, a pre-registered paired win/loss/tie
> comparison design (tournament-selected agent W vs. unevolved baseline B, sign test over discordant
> pairs, `customer-support` replay-checkable subset). The rev-2 design (§0–§11) was ALREADY put
> through a five-lane adversarial panel and frozen at commit `2f9e6095dc6e20bcc8196a293397f7ec07f8c704`
> (34 globally-merged findings, 27 adopted). That panel's own record lives in
> `PAIRED-DESIGN-REVIEWS.md` and stands unchanged — it is not being re-litigated here.
>
> The rev-2 round ITSELF completed and reported `TERMINATED-UNDERPOWERED` (discordantCount=1 against
> the 20-pair floor; 59 of 60 units concordant) because W shipped byte-identical to B — the baseline
> already scored 30/30 on the tournament's own search battery, leaving no gradient for search to
> climb. This amendment (§12, DRAFT status) proposes to re-run the same methodology at a different
> executor model and a wider battery, on the strength of a diagnostic dry-run showing the new model
> has a real, measured accuracy gradient rather than saturating.
>
> **OUT OF SCOPE** — the methodology itself already cleared its own five-lane panel and is not what
> this amendment changes: the oracle, the generator, the equal-treatment invariant, Phase 14's
> `VERTICAL_ADMISSION`, the pairing-unit/battery-construction/per-task-status discipline in
> substance, and the sign-test methodology/null/seed-clustering approach/tie-handling
> convention/termination discipline in substance.
>
> **IN SCOPE** — exactly three things plus two explicit open decisions: (1) the executor-model swap
> and whether the calibration dry-run evidence supports it; (2) the battery-size widening (60→90)
> and its floor-margin arithmetic; (3) the three values recomputed from that widening and the
> widened critical-value table (71 rows, n_d 20–90); (4) open decision 1 — the seed-block shape;
> (5) open decision 2 — the near-floor evidential-weight bound.
>
> A reviewer who agrees with everything has told us nothing useful — say so explicitly as your
> verdict rather than by silence. State clear DISAGREEMENT with the draft's recommended defaults on
> the two open decisions if you have a reasoned basis for one.
>
> ### Attack lanes — address every one, in order
>
> 1. The model swap's own evidence — does the calibration dry-run actually support the swap; is
>    `gpt-oss:latest`'s dual role (proposed executor AND reviewer lane on this panel) adequately
>    disclosed?
> 2. The battery-widening arithmetic — is 90 (from 60) justified by the stated floor-margin
>    arithmetic; is the expected-harvest estimate sound given §5's own seed-clustering discussion?
> 3. The three recomputed values — correctly recomputed from §9's provenance formulas applied to 90?
> 4. The widened critical-value table — arithmetically correct; matches the shared n_d 20–60 rows
>    exactly?
> 5. Open decision 1 — the seed-block shape — is the 9×10 default's worst-case bound (50.78%)
>    correct; does a lower worst-case bound at a wider battery understate a different risk; does the
>    6×15 "zero gate-code change" argument understate any real cost? State a clear preference or
>    state clearly that neither option is defensible as stated.
> 6. Open decision 2 — the near-floor evidential-weight bound — is keeping 24, or re-anchoring to
>    ~34, the more defensible choice, or is there a better anchor?
> 7. What this amendment does NOT touch, verified rather than assumed — does §12 actually leave the
>    oracle, generator, equal-treatment invariant, and pairing-unit discipline untouched, or does the
>    model/battery change create second-order pressure the amendment fails to address?
> 8. Anything else in §12 that would let this amendment survive review unchanged that shouldn't.
>
> Where an attack lane genuinely produces nothing, say so explicitly under that lane's heading
> ("No findings.") rather than omitting it or manufacturing a finding.
>
> ### FORMAT REQUIREMENTS, followed exactly
>
> - Open your entire response with one line of the exact form `**Verdict: X**` where X is exactly
>   one of `sound`, `sound-with-changes`, or `unsound` — nothing else on that line.
> - Number every finding you raise `F1`, `F2`, `F3`, … in the order you raise them, restarting at
>   F1 (this is YOUR OWN local numbering within your response; it will be merged into a global
>   sequence later by a separate plan — do not try to guess or reuse numbers from any other
>   reviewer).
> - Every finding must carry a specific claim and a specific location (a section number, e.g. "§12",
>   or the specific pin/value/table row it attacks).
> - Organize your findings under the eight numbered attack lanes above, in order. If you have no
>   finding under a lane, write "No findings." under that lane's heading rather than omitting it.
> - Close your response with a line of the exact form `Raw finding count: N` where N is the total
>   number of findings you raised across all eight lanes.
>
> This amendment gates a real multi-day paired-comparison run against a single local inference slot.
> A finding worth making is worth stating precisely, with the section and the specific defect. Do
> not edit any files. Output only your review as markdown text.

## Task 1 — Three externally-hosted lanes

**Invocation-path note.** All three ran through the house seam — `node
~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke --slug opencode --as <name> --model
<id from review.reviewer_instances> --run-dir <scratch> --repo-root <repo> --prompt-file
<scratch>/packet.md`, with `~/.opencode/bin` prepended to `PATH` — all three succeeded on the first
attempt (`{ok: true, stubbed: false}` from the seam for every lane), no retry or fallback taken.
The identical packet (above) was sent to all three; none required trimming (packet estimate
~14,500 tokens, well under any lane's budget).

| Lane | Resolved model id | Verdict | Stated raw finding count |
|---|---|---|---|
| `gpt-sol-pro` | `openrouter/openai/gpt-5.6-sol-pro` | unsound | 14 |
| `kimi-k3` | `openrouter/moonshotai/kimi-k3` | sound-with-changes | 12 |
| `qwen-max` | `openrouter/qwen/qwen3.7-max` | sound-with-changes | 10 |

## Lane: gpt-sol-pro

**Verdict: unsound**

### 1. The model swap's own evidence

**F1 — §12 infers discordant-pair yield from marginal baseline accuracy without evidence about paired outcomes.** A 70% B accuracy does not imply a 30% discordance rate. For paired binary scores,
`P(W≠B)=P(W=1,B=0)+P(W=0,B=1)`, which depends on W's accuracy and the joint error structure. The claimed harvests of approximately 18 at 60 and 27 at 90 implicitly require something close to W succeeding whenever B fails, with few reverse discordances. Neither the C0-C6 calibration results nor the 10/10 answer-visible micro-check establish that condition. If W and B make correlated errors, both can differ materially in marginal accuracy while still producing fewer than 20 discordant pairs.

**F2 — §12's C6 result does not demonstrate a search gradient under the proposed paired experiment.** C6 combines an explicit output-contract prompt with selected perturbations and then reports 10/10, but this only shows that one manually constructed prompt repairs ten observed cases. It does not show that the registered tournament search can discover that repair, that the repair generalizes to fresh battery seeds, or that tournament-selected W will differ from B often enough to clear the discordance floor. The amendment converts a post-diagnostic hand repair into evidence for searchability without measuring searchability.

**F3 — §12 uses calibration results obtained from the same generator family to choose both the executor and the failure modes targeted by the amendment.** The observed vocabulary, Unicode-hyphen, and extraction failures informed the explicit C6 contract. That is adaptive instrument development, not independent validation of a gradient. Fresh numerical seeds do not remove generator-level overfitting when ticket templates, oracle extraction rules, and anticipated failure classes remain known. The amendment needs an untouched calibration set or a registered replication of the claimed gradient before treating it as support for a multi-day confirmatory run.

**F4 — §12 does not adequately address `gpt-oss:latest` serving both as proposed executor and as a reviewer lane.** This is not a conventional financial conflict, but it is a methodological dependence: the same model family may share blind spots about its formatting stability, vocabulary substitutions, and instruction sensitivity. Any panel conclusion generated by that model should be identified as non-independent evidence and should not be counted as corroboration of the model-swap rationale. The current text does not disclose that dependence.

### 2. The battery-widening arithmetic

**F5 — §12's 60-to-90 widening is not justified by the stated expected-harvest calculation.** Even granting independent pairs and a true 30% discordance probability, 27 is only the expectation, not a guaranteed or pre-specified assurance level. Sampling variation leaves a nontrivial probability of obtaining fewer than 20 discordances, and seed clustering increases that probability further. The amendment supplies no target probability such as `P(n_d >= 20) >= 0.90` and no clustered sensitivity calculation. Calling a seven-pair expected surplus "comfortable" is therefore an unsupported judgment.

**F6 — §12 applies an independence-shaped expectation immediately after §5 identifies seed clustering as a central threat.** With only six or nine independently generated seed blocks, the effective uncertainty in discordant yield can be governed by block-to-block variation rather than 90 task-level Bernoulli draws. The amendment re-derives the false-positive bound for directional outcomes but does not perform the corresponding block-level analysis for qualification risk. A battery can have expected `n_d=27` and still terminate frequently if discordance is concentrated in a few seeds.

### 3. The three recomputed values

No findings. The stated values are arithmetically consistent with the frozen formulas:

- `72/90` is the worst-case joint-scoreable floor after two non-overlapping per-arm drop sets of at most nine.
- `9/90` preserves the 10% per-arm ceiling and its inclusive boundary.
- `71/90` is the first tie count leaving fewer than 20 discordant pairs, since `90 - 70 = 20` passes and `90 - 71 = 19` fails.

The tie threshold no longer preserves the old percentage, but that is the intended consequence of retaining an absolute discordance floor of 20; it preserves the boundary meaning rather than the old rate.

### 4. The widened critical-value table

No findings. Spot checks at `n_d=61`, `70`, `80`, and `90` support the listed critical values `39`, `44`, `50`, and `55`, respectively: each listed value satisfies the exact upper-tail condition while the immediately preceding integer does not. The shared `n_d=20–60` rows match the embedded rev-2 table exactly, including transition rows such as 22→23, 45→46, and 59→60.

### 5. Open decision 1 — the seed-block shape

**F7 — §12 understates the substantive defect in the 6×15 alternative by framing its benefit as "zero gate-code change."** Increasing cluster size from ten to fifteen makes each seed more influential, reduces the number of independent content draws, preserves the extreme 68.75% null rejection bound, and increases exposure to seed-specific discordance concentration. Breaking the ten-task convention is not merely a house-style cost; it worsens the exact clustering problem the concordance gate exists to mitigate. Avoiding parameterization work is not a defensible statistical reason to choose the inferior design.

The 9×10 arithmetic is correct: under perfect within-seed directional correlation, pooled rejection and the six-of-nine gate both admit `X >= 6` or `X <= 3`, giving `260/512 = 50.78125%`. Equal block sizes also mean one seed cannot independently dominate the pooled result merely because there are more seeds.

I prefer **9×10 with a six-of-nine concordance threshold** and disagree with selecting 6×15. The 50.78% bound remains alarmingly anti-conservative, but it is strictly better than the alternative presented and preserves the established cluster size.

### 6. Open decision 2 — the near-floor evidential-weight bound

**F8 — §12 offers two geometric anchors for "near floor," but neither is tied to evidential weight.** Keeping 24 because it was four units above 20 is arbitrary; moving it to approximately 34 because that is one fifth of the 20-to-90 range is also arbitrary. Evidential weakness depends on the sign test's power or confidence properties at each observed `n_d`, not on the fraction of the instrument's maximum battery represented by that count.

I disagree with the draft's recommendation to retain **24 unchanged**. The bound should be re-derived from a registered evidential criterion, such as the largest `n_d` below which power against a stated discordant-win probability remains below a chosen threshold. If the authors refuse to define such a criterion, neither 24 nor 34 is defensible as an evidential-weight boundary.

### 7. What this amendment does not touch, verified rather than assumed

**F9 — §12 leaves timeout adequacy unaddressed despite changing both model and run volume.** Equal timeout treatment across arms does not establish that the old timeout remains adequate for `gpt-oss:latest`, nor that a 50% larger run on one local inference slot has acceptable infrastructure-fault exposure. Model-specific latency and tail behavior can turn an unchanged timeout into differential missingness across prompt lengths or configurations even when the same literal is applied to both arms. The amendment should pin or justify a rev-3 timeout based on pre-inference operational measurements.

**F10 — §12's claim that battery construction is unchanged except for size is inaccurate.** Moving from six seed blocks to nine changes the block topology, changes the concordance gate from four-of-six to six-of-nine, and changes the number of independent generator draws. Those are decision-rule and dependence-structure changes, not merely a larger battery. The oracle, generator algorithm, per-arm attempt count, and score classification may remain textually unchanged, but the amendment must not describe the statistical construction as untouched.

### 8. Anything else in §12

**F11 — §12 conflicts directly with §7's frozen one-shot termination prohibition.** Section 7 says that after termination, "no successor instrument testing this same hypothesis on this same family may be built under any label by changing the qualification thresholds, the battery construction, the oracle, or the decision rule." Rev 2 terminated, and rev 3 expressly proposes another W-versus-B `customer-support` instrument while changing battery construction from 60 to 90. The fact that the executor also changes does not erase the explicit battery-construction prohibition, especially while §12 characterizes this as re-running the same methodology and hypothesis. Unless rev 3 states and defends a genuinely different hypothesis, the amendment is barred by the preregistration it purports to preserve.

**F12 — §12's freeze clause is temporally false or at least manipulable.** It says pins become immutable "once any rev-3 inference data exists" and then says no inference runs under the amendment before adjudication, yet the executor, prompt failure modes, and battery-size rationale were selected using `gpt-oss` inference data on the same instrument family. Labeling those calls "diagnostic dry-runs" does not make them irrelevant to rev-3 design choices. The clause permits arbitrary pre-freeze experimentation so long as the author declines to label it "under this amendment," which defeats the protection it claims to provide.

**F13 — §12 pins a mutable model tag and an apparently abbreviated digest without stating the verification rule.** `gpt-oss:latest` is not immutable, and `17052f91a42e` appears to be only a digest prefix. The amendment must specify that execution resolves and verifies the full content digest before any probe, search, promotion, or paired inference. Otherwise a tag update or prefix-handling error can silently change the executor while still appearing to satisfy the prose pin.

**F14 — §12's answer-visible ceiling probe cannot protect the model-swap rationale against the failure actually at issue.** The probe establishes extraction-contract satisfiability when the answer is supplied, but the amendment's risk is that `gpt-oss` produces too few usable paired discordances, unstable accuracy, or seed-concentrated errors when solving tickets. Keeping the old format-only probe may be reasonable for its old purpose, but presenting it among the rev-3 safeguards leaves the model swap without any preregistered gate confirming that the diagnostic gradient replicates on fresh data. A separate untouched diagnostic-gradient replication is needed; it should not be disguised as a change to the frozen oracle or qualification methodology.

**Raw finding count — gpt-sol-pro: 14 (F1–F14).**

## Lane: kimi-k3

**Verdict: sound-with-changes**

### Lane 1 — The model swap's own evidence

**F1 (§12, calibration evidence).** The dry-run does not establish what the amendment needs it to establish. The paired round's discordant harvest depends on B's error rate *on the unmodified battery with B's fixed baseline prompt*, but the cited gradient (C0–C5: 70/90/80/70/100/70%) is measured across calibration *variants* (footer-stripped, distractor, two-step-arithmetic, compound) — not on the plain battery with the baseline prompt. C4 at 100% suggests at least one configuration is already saturated for `gpt-oss`; if the unmodified-battery baseline accuracy is materially higher than the headline "≈70%," the harvest arithmetic (lane 2) collapses with it. Further, the "format near-miss, not arithmetic failure" diagnosis rests on a single C6 micro-check of 10/10 — n=10, no variance estimate, and the output-contract prompt that cleared it was authored *after inspecting the failures*. That is post-hoc prompt fitting presented as a diagnostic. The amendment should state the per-config task counts and acknowledge the post-hoc construction of C6.

**F2 (§12, `gpt-oss:latest` dual role).** The proposed executor model is also a reviewer lane on this very panel, and §12 nowhere discloses this. That is a disclosure gap regardless of whether the conflict is substantive: the amendment asks the panel to approve an instrument whose executor is one of its own adjudicators, and a reader of the frozen document would have no way to learn that. The blind spot is real: a reviewer lane evaluating the adequacy of evidence about *itself* has an incentive (however attenuated) to find the gradient evidence sufficient, since the swap is what makes its own outputs the measurement target. This needs an explicit disclosure paragraph in §12, not silence.

### Lane 2 — The battery-widening arithmetic

**F3 (§12 vs. frozen §7 — amendment-threatening).** Frozen §7's one-shot termination clause prohibits, in substance and under any label, "no successor instrument testing this same hypothesis on this same family... by changing the qualification thresholds, the battery construction, the oracle, or the decision rule after this termination." The rev-2 round terminated `TERMINATED-UNDERPOWERED`. This amendment changes the **battery construction** (60→90 units, 6→9 or 15 blocks, new seed set) and the qualification thresholds (72, 9, 71) after that termination — two of the four levers §7 explicitly enumerates. The executor model is *not* in §7's enumerated list, so a model-only re-run might have been defensible; the battery widening is squarely within the barred set. §12 is completely silent on this — it frames itself as "re-parameterising the same methodology" and hopes the reader doesn't check §7's list. The amendment must either (a) state explicitly why §7 does not bar it (e.g., an argument that the executor-model change redefines the W/B populations and hence the hypothesis, with the battery change subordinate to that), or (b) drop the battery widening and re-run at 60 with only the model swap. As drafted, this amendment is void under its own parent document's termination clause, and its survival depends on nobody reading §7 carefully. This is the most serious finding in this review.

**F4 (§12, floor-margin arithmetic).** The "expected harvest roughly 18 at 60, roughly 27 at 90" figures are asserted, not derived, and the implicit derivation is optimistic in a direction that favours the author's preferred conclusion. 27 ≈ 90 × 0.3, i.e., it assumes discordance probability ≈ B's failure rate — which is only true if W rescues *every* B failure and *never* loses a pair B wins. Under independent-arm discordance, P(discordant) = 2p(1−p) ≈ 0.42 at p=0.7 (≈38 expected at 90); under the failure mode rev-2 actually exhibited (W ≈ B with correlated outcomes), the harvest can be arbitrarily close to zero regardless of battery size — that is precisely how rev-2 produced discordantCount=1. The amendment also reports only the *mean* harvest against the floor: with a mean of ~27, the probability of landing below 20 is not negligible, and no quantile is given. Finally, the estimate assumes discordance is uniformly distributed across the battery, which §5's own seed-clustering discussion says may not hold — if discordance concentrates in a few seeds, the effective margin is thinner. "Comfortable margin" is doing rhetorical work the arithmetic hasn't earned.

### Lane 3 — The three recomputed values

**F5 (§12, tie-rate disclosure threshold).** The three recomputations are arithmetically correct from §9's provenance formulas (72 = 90×0.8; 9 = 90×0.1; 71 = 90−19, the first tie count whose complement falls below 20; and 72 is exactly the joint consequence of two arms each dropping 9 non-overlapping). However, the amendment does not flag a genuine qualitative drift: holding the floor at 20 while widening the battery moves the tie-rate disclosure from 68.3% of the battery (41/60) to 78.9% (71/90). A run with, say, 75% ties would have been disclosed-in-advance as likely underpowered under rev-2's threshold but fires no disclosure under rev-3's. This is an inherent consequence of the deliberate choice to keep the floor at 20 (which is otherwise the right, non-gaming choice), but it is a change in the disclosure's *meaning* and should be stated, not left for a reader to notice.

### Lane 4 — The widened critical-value table

No findings. I spot-checked n_d = 20 (c=15: tail 21695 ≤ 26214.4; tail from 14 = 60455 >), 61 (c=39), 65 (c=41), 71 (c=45), 76 (c=48, passes by ~0.001 of tail mass), 85 (c=53), and 90 (c=55: z ≈ 2.00 → ≈0.0226 ≤ 0.025; from 54 ≈ 0.0366 >). All satisfy `40·Σ_{i=c}^{n}C(n,i) ≤ 2^n` with c minimal. Rows 20–60 match the frozen 41-row table entry-for-entry. The claimed drift-guard test (`test/paired-rev3-derivation.test.ts`) covering the shared range is the right mechanical control.

### Lane 5 — Open decision 1: seed-block shape

**F6 (§12, open decision 1 — the 50.78% vs 68.75% comparison is cosmetic).** The 9×10 arithmetic itself checks out (10X ≥ 55 ⟺ X ≥ 6; 10X ≤ 35 ⟺ X ≤ 3; 2×130/512 ≈ 50.78%), and the 6×15 arithmetic checks out (15X ≥ 55 ⟺ X ≥ 4; 15X ≤ 35 ⟺ X ≤ 2; 44/64 = 68.75%). But the draft's framing — "LOWER than rev-2's own 68.75% bound... because tail mass concentrates" — presents as a safety improvement something that is not one. Both bounds are catastrophic against a nominal 0.05 (10× and 13.75× inflation); the design's actual defence is the concordance check, and the draft does not notice that under **both** options the concordance check is *vacuous at exactly the collapse case the bound describes*: under perfect correlation, 9×10's pooled decision fires at X ≥ 6 and the 6-of-9 check requires X ≥ 6 — the check can never downgrade the ceiling case; identically for 6×15 (fires at X ≥ 4, check requires 4-of-6). (This vacuity was inherited from rev-2's 4-of-6 construction; the amendment repeats it while touting the lower bound as a virtue.) The honest comparison between the options is elsewhere: under 9×10 a single seed contributes at most 10/90 ≈ 11% of the battery, versus 15/90 ≈ 16.7% under 6×15 — so one anomalous seed dominates a false-positive read *more* easily under 6×15, and partial-correlation scenarios (the realistic threat) are better diluted under 9×10.

**F7 (§12, open decision 1 — the 6×15 "zero gate-code change" argument understates its cost).** The named cost is "breaking the ten-tasks-per-seed house convention." The unnamed cost is worse: drawing *fifteen* tasks from a single generator seed increases each block's intra-seed homogeneity exposure — the exact correlation threat §5's F-06 bound is built around — while simultaneously reducing the number of independent blocks from 9 to 6, which is why its worst-case bound stays at 68.75%. The option trades away dilution of the design's one acknowledged anti-conservative bias in exchange for not editing a hardcoded literal in `_paired-gate.ts`. That is an implementation-convenience argument overriding a statistical one, and the draft's even-handed "neither pre-selected" framing obscures that. **My position: adopt 9×10 — but on the per-seed-dominance grounds above, and the draft's stated rationale (the lower worst-case bound) should be struck or corrected, since the bound is vacuous-with-check in both options and its comparison across block counts is not the safety property the draft claims.**

### Lane 6 — Open decision 2: the near-floor evidential-weight bound

**F8 (§12, open decision 2).** Keep 24; reject the 34 re-anchoring — and reject its *premise*, which the draft should have done itself. Evidential weight of an INDISTINGUISHABLE result is a function of the power of the sign test *at the observed n_d*, and the sign test conditions on n_d: `c(24)` and the power profile at n_d=24 are identical whether the battery's capacity is 60, 90, or 900. "Near the floor should track a stable fraction of the available range" has no statistical content — the available unused range above n_d contributes nothing to what an observed n_d can support. The counter-argument the draft "states rather than suppresses" is not a live option; it is a confusion, and presenting it as adjudicable lends it legitimacy it hasn't earned. Additionally, the draft's own history is sloppy: Plan 14-03's stated derivation ("roughly a quarter of the way" from 20 to 40) yields 25, not 24, and the proposed re-anchor silently swaps the fraction from ¼ to ⅕ while claiming to preserve the original intent. **My position: keep 24, and rewrite the open decision to state that the bound is battery-invariant by construction, rather than offering the panel a choice between a correct constant and an incorrectly-motivated one.**

### Lane 7 — What the amendment does not touch, verified

**F9 (§12, equal-treatment pins under the model swap).** The amendment leaves §3's deferred pins (timeout, prompt-length bound) "pinned by Phase 14's instrument commit" without noting that those values were calibrated for `qwen3.6`. `gpt-oss` has a different context window and different generation-length behaviour; a prompt-length bound sized for the old model, or a timeout sized for its latency profile, may not be adequate or may be loosened without scrutiny under the new one. The amendment should explicitly state that the deferred pins must be re-derived for the new executor *before* freeze, and that the 1.5× battery (90 vs 60 units against a single local inference slot) changes total wall-clock and the exposure window for §6's harness-fault carve-out — more attempts means more retries consumed, interacting with Clause 1/Clause 3 counting.

**F10 (§12, oracle interaction with the new model's failure mode).** The oracle is unchanged, but the model swap changes *which* failure surface the oracle sees: the C6 evidence says gpt-oss's misses are extraction-contract near-misses (unicode hyphens, bold labels, `elevate-` for `escalate-`). B's baseline prompt is fixed and, per the amendment's own account, lacks the output-contract scaffolding that cleared C6. The paired round can therefore harvest WINs that reflect *prompt-format luck against a brittle extraction contract* rather than capability differences — directionally the intended gradient, but it means a W-SUPERIOR verdict under rev-3 is partly a verdict about the oracle's extraction brittleness, and §8 item 3's 90%-mismatch ceiling will not catch this because a *moderate* format-mismatch rate fires no caveat. The amendment should disclose that the rev-3 estimand is contaminated by extraction-contract sensitivity in a way rev-2's saturated run never had the chance to be.

### Lane 8 — Anything else

**F11 (§12, §6's power-profile disclosure left stale).** §6 Clause 2's F-14 power table discloses power at n_d=20 and n_d=40, with 40 framed as "the battery fills" toward 60. At a 90-unit battery, an n_d of 40 now represents a battery less than half filled, and the disclosure's framing ("Power rises sharply as the battery fills") points at the wrong anchor. The amendment acknowledges in passing (open decision 2's parenthetical) that §6's comparison point "would need its own restatement for n_d=90" but does not include that restatement in the amendment — the disclosed power profile a reader will consult during the rev-3 run is calibrated to the old battery size. Add the restated comparison point (e.g., power at n_d=60 against the same four p values) to §12.

**F12 (§12, "test-proven identical" and the seed-disjointness claim rest on artifacts outside the document).** The amendment's two load-bearing mechanical claims — the 71-row table's identity with rev-2 on the shared range, and the sixteen new seeds' disjointness from the prior union — are cited to a test file and to "this plan's own SUMMARY.md," neither of which is pinned by hash or commit in §12, unlike the ancestry paragraph's careful blob-and-commit citation of rev 2. If the table or seed list is later challenged, the document does not self-contain the evidence. Pin the derivation script's and test's commit the same way the ancestry is pinned. (Note also the prior union now includes 1399, 1401–1406, 1501–1503 — sets that postdate rev-2's §9 union — which is fine, but the amendment should name which studies consumed them so the disjointness claim is auditable.)

**Raw finding count — kimi-k3: 12 (F1–F12).**

## Lane: qwen-max

**Verdict: sound-with-changes**

### Lane 1 — The model swap's own evidence

**F1** (§12, "Why this amendment exists" / calibration dry-run citations). The calibration dry-run measures only the *model's* accuracy on the battery under six configurations. It provides zero evidence about W — the tournament-evolved agent, whose prompts and strategies were selected for performance on `qwen3.6:latest` — running on `gpt-oss:latest`. W's evolved strategies may transfer well, transfer partially, or fail to transfer at all on a different model. The amendment's claim that the paired round will now find "a real, measured gradient" conflates a gradient in the *model's* task-level accuracy with a gradient between *W and B* on this model. The expected discordant harvest of ~27 is therefore unmeasured speculation, not a calibration-backed figure. The amendment needs either (a) a dry-run of W itself on `gpt-oss:latest` showing W's accuracy differs from B's, or (b) an explicit disclosure that the transfer from `qwen3.6`-evolved strategies to `gpt-oss` execution is untested and the expected harvest is a point estimate without empirical support.

**F2** (§12, C6 micro-check citation). The C6 micro-check (10/10) is cited as evidence that C0–C5 misses are "format/vocabulary near-misses… exactly the kind of gap a prompt search can climb." But C6 uses an "explicit output-contract prompt" — a *different prompt* from C0–C5. C6's success may be caused by the more explicit prompt, not by the shallow nature of the failures. If the paired comparison's instrument prompt is closer to C0–C5 than to C6 (and the equal-treatment invariant requires both arms to use the same prompt), the 70% accuracy may reflect systematic reasoning failures the search mechanism cannot climb, not formatting near-misses. Ten samples from one configuration is also too few to characterize the failure mode across six configurations. The causal claim about the nature of failures is confounded by the prompt difference.

**F3** (§12, executor model pin). The dual role of `gpt-oss:latest` — the proposed executor model for the paired round *and* a reviewer lane in this adversarial panel — is not disclosed anywhere in §12. Even if the adversarial format is structurally self-correcting, the absence of disclosure means a reader cannot assess whether the model reviewing its own suitability as executor has any incentive to understate risks (e.g., the transfer problem in F1). This should be named explicitly in §12's pin list, the way the amendment already names other structural choices.

### Lane 2 — The battery-widening arithmetic

**F4** (§12, floor-margin arithmetic). The expected discordant harvest ("roughly 18" at 60, "roughly 27" at 90) assumes an approximately 30% discordance rate. This rate is not derived from any measurement of the W–B joint distribution on `gpt-oss:latest`. The discordance rate depends on P(W=1,B=0) + P(W=0,B=1), which is a function of both arms' marginal accuracies *and* their intra-pair correlation. The calibration dry-run measures only B's marginal accuracy; W's accuracy on `gpt-oss` is unknown (F1), and the correlation structure is unmeasured. Under high positive correlation (W tends to succeed when B succeeds), the discordance rate could be well below 30%, and the expected harvest at 90 could still fall near or below the floor of 20. The amendment should show the joint-distribution assumption behind "roughly 27" or disclose it as an unbacked point estimate.

**F5** (§12, floor-margin arithmetic / "≈70% baseline accuracy"). The calibration dry-run reports per-configuration accuracies of C0 70%, C1 90%, C2 80%, C3 70%, C4 100%, C5 70% — a range from 70% to 100%. The amendment's floor-margin arithmetic uses "≈70%" without stating which configuration the paired comparison will actually run under, or how the six configurations map to the battery's actual task mix. If the paired comparison's instrument configuration corresponds to C4 (100%), the battery saturates again on `gpt-oss` exactly as it did on `qwen3.6`, and the widening to 90 provides no benefit. The amendment must pin the calibration configuration for the paired comparison, not just the model, or disclose that the configuration-to-battery mapping is unsettled.

### Lane 3 — The three recomputed values

No findings. The instrument-health gate floor (90 × 0.8 = 72), the per-arm drop-budget ceiling (90 × 0.1 = 9), and the tie-rate disclosure threshold (90 − 19 = 71) are each correctly recomputed from §9's own provenance formulas applied to 90. All three preserve their rev-2 percentage and boundary direction exactly.

### Lane 4 — The widened critical-value table

No findings. Spot-checked rows against the exact combinatorial condition `40 · Σ_{i=c}^{n_d} C(n_d, i) ≤ 2^{n_d}`:

- `n_d=20, c=15`: `40 × 21700 = 868000 ≤ 1048576` ✓; `c=14` gives `40 × 60460 = 2418400 > 1048576` ✓
- `n_d=60, c=39`: matches rev-2 table exactly ✓
- `n_d=70, c=44`: normal approximation gives per-tail ≈ 0.0211 ≤ 0.025 ✓; `c=43` gives ≈ 0.0365 > 0.025 ✓
- `n_d=80, c=50`: per-tail ≈ 0.0168 ≤ 0.025 ✓; `c=49` gives ≈ 0.0287 > 0.025 ✓
- `n_d=90, c=55`: per-tail ≈ 0.0226 ≤ 0.025 ✓; `c=54` gives ≈ 0.0366 > 0.025 ✓

All 41 shared rows (`n_d` 20–60) match the frozen rev-2 table byte-for-byte.

### Lane 5 — Open decision 1: seed-block shape

**F6** (§12, 6×15 alternative). The 6×15 alternative's "zero gate-code change" argument understates a statistical cost the draft does not name. Under any positive intra-seed correlation ρ, the design effect `1 + (m−1)ρ` grows with cluster size m. At 15 tasks per seed, the design effect is `1 + 14ρ` versus `1 + 9ρ` at 10 tasks per seed — a 50% larger inflation of the effective variance for the same ρ. This makes the effective independent sample size systematically worse under 6×15 than under 9×10 for any realistic partial-correlation regime, not just the perfect-correlation worst case the draft already analyzes. The draft names the house-convention cost of 6×15 but not this statistical cost.

**F7** (§12, Open Decision 1 — clear preference stated as required). The draft's recommended default (9×10) is the more defensible option and the panel should select it. The 6×15 alternative is methodologically dominated: it breaks the ten-tasks-per-seed house convention every prior study used, accepts a worse worst-case bound (68.75% vs. 50.78%), carries a worse design effect under partial correlation (F6), and its sole advantage — zero gate-code change — is an implementation convenience, not a methodological justification. The 9×10 option's 6-of-9 concordance threshold also happens to produce a stricter false-concordance probability under the null (25.4% at `Bin(9,0.5)`) than rev-2's 4-of-6 (34.4% at `Bin(6,0.5)`), an additional conservatism the draft could name but does not.

### Lane 6 — Open decision 2: near-floor evidential-weight bound

**F8** (§12, Open Decision 2 — clear disagreement stated as required). I disagree with the draft's recommended default (keep 24 unchanged), but I also find the counter-argument's re-anchoring to ~34 inadequately justified. Neither option is anchored to the evidentially relevant quantity: the power curve. The purpose of the near-floor bound is to flag `INDISTINGUISHABLE` results with low evidential weight, which is a function of statistical power, not of position within the battery's range. A principled anchor would be the `n_d` at which power against a stated effect size crosses a meaningful threshold. At `p=0.70`, power crosses ~50% near `n_d=25–28` (`c(25)=18`, `P(Bin(25,0.7)≥18) ≈ 51%`; `c(28)=20`, `P(Bin(28,0.7)≥20) ≈ 54%`). This places the evidential-weight boundary between the two proposed values, derived from the same power framework §6 Clause 2's F-14 disclosure already uses. The panel should consider a power-anchored bound rather than accepting either the fixed-24 or the proportional-34 default.

### Lane 7 — What this amendment does NOT touch

**F9** (§12, battery widening operational exposure). The battery widening from 60 to 90 increases total arm-attempts from 120 to 180 — a 50% increase in cumulative harness-fault exposure. §6's harness-fault carve-out allows exactly one retry per pairing unit before counting toward Clause 1/Clause 3 thresholds. At 180 arm-attempts, the probability that at least one pairing unit exhausts its retry and counts as a harness-fault failure is meaningfully higher than at 120 attempts, particularly on a "single local inference slot" running a multi-day batch. The amendment does not discuss whether this increased exposure creates new pressure on the drop-budget ceiling (9 of 90, still 10%) or whether the longer runtime increases exposure to the "long-inference-operational-risk" §5 already names. This is an operational disclosure gap, not a methodological defect, but it should be named.

### Lane 8 — Anything else

**F10** (§12, missing power-profile extension for widened battery). The amendment widens the battery to 90 but does not extend §6 Clause 2's F-14 power-profile disclosure beyond `n_d=40`. The rev-2 design provided power at `n_d=20` and `n_d=40` — two reference points spanning the floor to the full battery (60). At 90 pairing units, the battery can produce `n_d` values up to 90, and a reader evaluating an `INDISTINGUISHABLE` result at, say, `n_d=55` or `n_d=70` has no design-time power context for those `n_d` values. At `p=0.70`, power at `n_d=60` (`c(60)=39`) is approximately 84%, and at `n_d=80` (`c(80)=50`) approximately 94% — substantially more informative than the rev-2 reference points. The widened battery needs at least one additional power reference point (e.g., `n_d=60`) to maintain the same level of reader guidance the rev-2 disclosure provided.

**Raw finding count — qwen-max: 10 (F1–F10).**

## Task 2 — Two locally-hosted lanes, sequential, watchdog-supervised

**Invocation-path note.** Both lanes ran via a direct HTTP POST to Ollama's **native** `/api/chat`
endpoint (`http://localhost:11434/api/chat`), never the OpenAI-compat `/v1/chat/completions`
endpoint — the compatibility path does not reliably honour a `num_ctx` override on a packet this
size, and a silently truncated prompt would produce a review of a document the reviewer never fully
saw. `options.num_ctx: 32000` was set on both requests (the ~58KB / ~14,500-token estimated packet
comfortably fits under that ceiling).

`experiments/dataops-agent-pilot/_memory-watchdog.sh` (`WATCHDOG_CEILING_GB=109`) was started
detached before `gemma4:31b`'s request began and stopped only after `gpt-oss:latest`'s request
completed and was confirmed unloaded; its own log shows only the start line and no breach event,
confirming the ceiling was never crossed for the whole local-model window.

The two models ran **strictly sequentially**: `ollama ps` confirmed empty before `gemma4:31b`
loaded; `gemma4:31b` was explicitly unloaded (`ollama stop gemma4:31b`) and `ollama ps` confirmed
empty again before `gpt-oss:latest` loaded; `gpt-oss:latest` was then unloaded and `ollama ps`
confirmed empty a third time before the watchdog was stopped. At no point were both models resident
together.

**Ingestion check, per lane (never assumed from the fact that a response came back):**

| Lane | Resolved model id | Reported `prompt_eval_count` | Packet estimate (chars/4) | Verdict |
|---|---|---|---|---|
| `gemma4` | `gemma4:31b` | 16,929 | ~14,532 | sound-with-changes |
| `gpt-oss` | `gpt-oss:latest` (digest `17052f91a42e`) | 15,320 | ~14,532 | unsound |

Both reported ingestion counts exceed the packet's own character-based token estimate (the
difference is the chat-template/role-wrapping overhead Ollama's own tokenizer adds on top of the
raw packet text) — neither lane's reported ingestion is materially below the estimate, so neither
lane is judged to have truncated the packet. Both responses carried `done: true`.

## Lane: gemma4

**Verdict: sound-with-changes**

### 1. The model swap's own evidence

**F1: Calibration gradient ≠ Paired gradient (§12).** The justification for the swap relies on `gpt-oss:latest` showing a "real, measured gradient" in calibration dry-runs. However, calibration measures W against a fixed baseline/configuration. It does not measure the relative distance between W and B. If both W and B shift their performance upward or downward on `gpt-oss:latest` in tandem, the "gradient" observed in calibration will not translate to a gradient in the paired round, potentially leading to another `TERMINATED-UNDERPOWERED` result. The dry-run proves the model is not saturated, but it does not prove that W and B are sufficiently separated on this specific executor.

**F2: Reviewer/Executor conflict (§12).** The amendment proposes using `gpt-oss:latest` as the executor model while the same model (or its family) is acting as a reviewer in the adversarial panel for this amendment. This creates a structural blind spot: the model may be biased toward approving an instrument design that favors its own operational characteristics or failure modes, or it may fail to identify risks inherent to its own inference patterns.

### 2. The battery-widening arithmetic

**F3: Opaque "expected harvest" assumptions (§12).** The claim that widening the battery to 90 pairs raises the expected discordant harvest to "roughly 27" is presented without the underlying probability of discordance P(d). If B's accuracy is ≈70%, a harvest of 18/60 (the rev-2 case) implies P(d) ≈ 0.3. For this to occur, W must be nearly perfect (≈100% accuracy), as any decrease in W's accuracy actually *increases* the number of discordant pairs (by increasing LOSSes). By basing the justification on a "worst-case" harvest (where W is so strong it minimizes discordance), the author may be masking the fact that if W is only marginally better than B, the harvest will be much higher, making the widening to 90 potentially excessive or unnecessary.

### 3. The three recomputed values

No findings.

### 4. The widened critical-value table

No findings.

### 5. Open decision 1 — the seed-block shape

**F4: Insufficient justification for 6×15 alternative (§12).** The argument for the 6×15 shape is "zero gate-code change." This is a developer convenience, not a scientific or statistical justification. Breaking the house convention of ten tasks per seed (used in `DUALFIX` and `BI`) introduces an unquantified risk: if the "difficulty" or "noise" of seeds is non-uniform, increasing the units per seed to 15 may increase intra-block variance, potentially making the concordance check less reliable.

**F5: Outlier risk in 9×10 default (§12).** While the worst-case bound for 9×10 (50.78%) is lower than rev-2's, increasing the number of seeds from 6 to 9 increases the probability that the battery includes a "poison" seed (an outlier that systematically favors one arm). The amendment focuses on the *perfect correlation* bound but ignores the *increased sample of seeds* risk.

**Preference:** I prefer the **9×10 default**, provided F5 is acknowledged. The lower worst-case bound and adherence to house convention outweigh the trivial cost of updating a single integer in `_paired-gate.ts`.

### 6. Open decision 2 — the near-floor evidential-weight bound

**F6: Incentive for "Null-Result Inflation" (§12).** The recommended default to keep the bound at 24 is indefensible. As noted in the draft's own counter-argument, 24 represents a much smaller fraction of the new range (20–90) than it did of the old range (20–60). Keeping the bound at 24 allows Robert Li to label more `INDISTINGUISHABLE` results as "strong" nulls rather than "near-floor" (weak) nulls. This creates an incentive to avoid re-deriving the bound to keep the result's evidential weight appearing higher than it is.

**Preference:** I strongly disagree with the recommended default. The bound should be re-anchored to ≈34 (a fifth of the floor-to-90 range) to preserve the original intent of flagging results that lack sufficient discordant mass.

### 7. What this amendment does NOT touch, verified rather than assumed

**F7: Latency/Timeout omission (§12).** The amendment swaps the executor model but explicitly states that timeouts are "pinned by Phase 14's instrument commit." It fails to address whether `gpt-oss:latest` has a different latency profile than `qwen3.6:latest`. If the new model is slower, the existing timeout pins (carried over from rev-2) may trigger an increase in no-artifact/non-scoreable results, potentially causing a breach of Clause 3 (drop-budget ceiling) that would not have occurred with the previous model.

### 8. Anything else in §12 that would let this amendment survive review unchanged that shouldn't

No findings.

**Raw finding count — gemma4: 7 (F1–F7).**

## Lane: gpt-oss

**Verdict: unsound**

### Lane 1 – Model swap evidence

**F1. Insufficient justification for swapping the executor model** – The amendment cites a calibration dry‑run on six micro‑configurations (C0–C5) to claim that `gpt-oss:latest` exhibits a "real, measured gradient." This evidence is limited to a handful of synthetic tickets and does not demonstrate that the new model will produce discordant pairs in the full paired‑comparison battery. The calibration scores may be inflated by prompt or token‑limit effects that do not translate to the actual `customer-support` replay‑match oracle, so the claim that the swap will enable a statistically detectable effect is unsubstantiated.

**F2. Conflict of interest** – The reviewer panel includes an instance of `gpt-oss:latest`, which is also proposed as the executor model for the amendment. This dual role creates a potential bias in the review process, as the same model that will be evaluated is being used to assess its own suitability.

### Lane 2 – Battery‑widening arithmetic

**F3. Unverified expected discordant harvest** – The amendment states that "expected harvest of roughly 18 discordant pairs at 60 and ~27 at 90" based on a baseline accuracy of ≈70%. This calculation implicitly assumes independence between W and B outcomes and identical accuracy across all tickets, yet no derivation is provided. If the true probability of discordance differs (e.g., due to correlated errors or varying per‑ticket accuracies), the floor‑margin argument collapses, potentially leaving the study underpowered even with 90 units.

### Lane 3 – Recomputed constants

**F4. No issue** – The instrument‑health gate floor (72/90), drop‑budget ceiling (9/90), and tie‑rate threshold (71/90) are correctly recomputed from §9's provenance formulas; they preserve the same qualitative properties as their 60‑unit counterparts.

### Lane 4 – Widened critical‑value table

**F5. Lack of verification for n_d > 60 entries** – The 71‑row table extends the critical‑value mapping to n_d = 90, but no audit or test is shown that each row satisfies the combinatorial condition `40·Σ_{i=c}^{n_d} C(n_d,i) ≤ 2^{n_d}`. A single arithmetic error in any of these rows would invalidate the decision rule for a non‑trivial portion of the battery, potentially producing false positives or negatives.

### Lane 5 – Seed‑block shape (open decision 1)

**F6. Inadequate block‑concordance threshold** – The draft proposes a 9×10 default with a 6/9 agreement requirement, yielding a worst‑case rejection probability of ≈50.8% under perfect intra‑seed correlation. While lower than the rev‑2 bound (68.75%), this still represents a high false‑positive risk and does not account for imperfect but non‑trivial correlation that may arise in practice. A stricter threshold (e.g., 7/9) would reduce this risk, yet the draft offers no justification for choosing 6/9.

**F7. Unnecessary code change** – The alternative 6×15 block shape preserves the existing 4/6 threshold but violates the house convention of ten tasks per seed. The draft claims "zero gate‑code change," but this ignores the downstream impact on task scheduling, timeout adequacy, and potential bias introduced by longer blocks.

### Lane 6 – Near‑floor evidential‑weight bound (open decision 2)

**F8. Misaligned scaling** – Keeping the near‑floor bound at 24 when the battery expands to 90 units effectively shrinks its relative position from "four units above the floor" to only ≈1/17 of the new discordant‑pair range (20–90). The draft's rationale for retaining 24 is based on a comparison with the rev‑2 floor‑to‑40 window, which no longer applies. A re‑anchored bound (≈34) would better preserve the intended notion that "near the floor" tracks a stable fraction of the available range.

### Lane 7 – Untouched components

**F9. No issue** – The amendment explicitly states that the oracle, ticket generator, equal‑treatment invariant, and pairing‑unit discipline remain unchanged; no hidden side effects are introduced by the model or battery changes.

### Lane 8 – Other undisclosed pins / potential issues

**F10. Timeout and prompt‑length bounds not revisited** – The amendment introduces a larger battery (90 units) but does not reassess whether the existing timeout or maximum prompt length remain adequate for all runs, especially under the new `gpt-oss:latest` model which may have different latency characteristics.

**F11. Seed disjointness claim unverified** – While the draft asserts that the new seed set (1601–1609) is disjoint from all prior seeds, no formal proof or reference to a seed‑registry lookup is provided; accidental overlap could compromise reproducibility.

**Raw finding count — gpt-oss: 11 (F1–F11).**

**Numbering note, recorded rather than silently normalised.** `gpt-oss`'s own local numbering assigns
a finding number to two "No issue" lane dispositions (F4 under Lane 3, F9 under Lane 7) rather than
leaving those lanes unnumbered the way `gemma4`'s "No findings." convention does. This is a
between-lane inconsistency in how "nothing to report" is recorded, not a claim about either lane's
substance; it is noted here as an observation for 15-04's merge, not adjudicated.

## Task 2 close

Five of five target lanes produced output; no lane was dropped, substituted, or silently re-run.
Both local lanes' full-packet ingestion is evidenced above by their own reported `prompt_eval_count`
against the packet's estimated token count. No finding in this section carries an adjudication, a
merge marker, or a dismissal.
