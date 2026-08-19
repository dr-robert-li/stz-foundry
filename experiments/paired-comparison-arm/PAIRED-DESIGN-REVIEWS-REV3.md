# Adversarial panel round — PAIRED-DESIGN-PREREG.md §12 (rev 3 DRAFT amendment) (2026-08-20, plan 15-03)

## Summary — fixed before adjudication

Five lanes, five independent verdicts, five stated raw finding counts, verified against the
findings actually numbered in each lane's own section below (no discrepancy found — every lane's
stated count equals its own numbered-finding count):

| Lane | Resolved model id | Verdict | Raw finding count |
|---|---|---|---|
| `gpt-sol-pro` | `openrouter/openai/gpt-5.6-sol-pro` | unsound | 14 |
| `kimi-k3` | `openrouter/moonshotai/kimi-k3` | sound-with-changes | 12 |
| `qwen-max` | `openrouter/qwen/qwen3.7-max` | sound-with-changes | 10 |
| `gemma4` | `gemma4:31b` | sound-with-changes | 7 |
| `gpt-oss` | `gpt-oss:latest` (digest `17052f91a42e`) | unsound | 11 |

**Raw total: 54** (the arithmetic sum of the five per-lane counts above: 14 + 12 + 10 + 7 + 11 = 54).
This is the number plan 15-04's merge is reconciled against — fixed here, before any finding is read
for adjudication, so a convenient finding cannot quietly disappear during the merge.

**Verdicts, at a glance:** 2 `unsound` (gpt-sol-pro, gpt-oss), 3 `sound-with-changes` (kimi-k3,
qwen-max, gemma4), 0 `sound`. No lane found the amendment acceptable as drafted with zero changes —
every lane raised at least one finding, and no lane's response was silence dressed up as agreement.

**The panel's composition and its independence properties, stated plainly.** Five lanes: three
externally-hosted (via OpenRouter through the house review-lane seam) and two locally-hosted (via
Ollama's native `/api/chat` endpoint, run strictly sequentially under the memory watchdog). One
point worth a reader's attention, disclosed here rather than left for a reader to notice: **one of
the two locally-hosted reviewer lanes (`gpt-oss`) runs the same model — `gpt-oss:latest`, digest
`17052f91a42e` — that this amendment proposes as the rev-3 paired-round executor.** That duality was
already true of the rev-2 panel's own reachability check and this phase's own 15-02 reachability
probe (both recorded it explicitly), and it is not, on its own, a conflict: critiquing a design
document and executing tickets under it are different roles at different times, and the model has
no memory or stake carried between the two. It is disclosed here because a reader should not have
to work it out for themselves, and because three of the five lanes (`gpt-sol-pro`, `kimi-k3`,
`qwen-max`) independently raised this exact duality as a finding within their own sections
(`gpt-sol-pro` F4, `kimi-k3` F2, `qwen-max` F3, `gemma4` F2, `gpt-oss` F2 — five of five lanes
named it, in fact, entirely independently since no lane saw another lane's output). That convergence
is itself notable: it is recorded here as a fact about the panel's composition, not adjudicated as a
finding requiring a fix — that determination belongs to 15-04.

## Adjudication ledger (Plan 15-04)

**Disposition — raw 54, merged into 31 global findings, ADOPTED: 26, REJECTED: 5 (26+5=31).**
Reconciling arithmetic: every one of the 54 raw findings numbered above (14 gpt-sol-pro + 12
kimi-k3 + 10 qwen-max + 7 gemma4 + 11 gpt-oss = 54) is absorbed into exactly one of the 31 global
findings below (GF-01 … GF-31); each global finding's "Absorbs" line names every raw finding it
closes. No raw finding appears in more than one global finding, and none is left unabsorbed — the
per-lane counts below are mechanically checkable against the per-lane totals fixed in the Summary
above (14/12/10/7/11).

Every rejection below names the specific reason on the merits (a stated precedent, an already-frozen
disclosure, a demonstrated statistical error in the finding's own proposed mechanism, or a
demonstration that the finding's premise is refuted by an adopted sibling finding) — never effort,
cost, or schedule. Every adoption states the concrete change §12 must carry; Task 3 (this plan)
applies exactly these changes and no other.

### Lane 1 — the model swap's own evidence

**GF-01 — Calibration evidence is marginal/single-arm accuracy, not W-vs-B joint evidence, and does
not test transfer of W's qwen3.6-evolved strategies to gpt-oss.**
Absorbs: gpt-sol-pro F1, qwen-max F1, gpt-oss F1, gemma4 F1.
Restatement: the dry-run measures the model's own task accuracy under six configurations; it says
nothing about the joint/correlated outcome distribution between W and B (which determines the
discordant-pair rate, not either arm's marginal accuracy alone), and nothing about whether W's
tournament-evolved-on-`qwen3.6` strategies transfer to `gpt-oss:latest` at all.
**Verdict: ADOPTED.** §12 must add an explicit disclosure, alongside the existing calibration
citations, stating plainly that the dry-run establishes only that `gpt-oss:latest` is not saturated
on this family — it is not evidence about the W-B joint distribution or about W's own transfer, both
of which remain unmeasured assumptions the harvest arithmetic (GF-06/GF-08 below) depends on.

**GF-02 — Calibration figures are drawn from six perturbation variants, not the plain battery with
B's fixed prompt; C4's 100% suggests possible saturation; §12 does not pin which configuration the
paired round actually runs under.**
Absorbs: kimi-k3 F1, qwen-max F5.
**Verdict: ADOPTED.** §12 must state explicitly that the paired round's own task prompt is rev-2's
unmodified §4 construction — not any of C0–C6 — and that C0–C5's range (70%–100%) is disclosed as
the observed spread across diagnostic variants, not a plain-battery estimate; C4's 100% is named as
the most saturated observed configuration, not the one the paired round runs under.

**GF-03 — C6's 10/10 used a different, explicit output-contract prompt than C0–C5; it does not show
the tournament search can discover or generalize an equivalent repair, and (since the equal-treatment
invariant requires one identical prompt per arm) does not establish the "format near-miss" diagnosis
for the prompt the paired round will actually use.**
Absorbs: gpt-sol-pro F2, qwen-max F2.
**Verdict: ADOPTED.** §12 must state explicitly that C6 is diagnostic evidence about the *failure
mode* (format vs. arithmetic) only — it is not a proposed prompt for either arm, both of which keep
rev-2's own unmodified §4 prompt unchanged by this amendment — and that whether tournament search
itself discovers or generalizes an equivalent repair is the paired round's own open question, not
something C6 answers in advance.

**GF-04 — Calibration data comes from the same generator family used to select the executor and the
targeted failure modes; an untouched calibration set or registered replication is needed before
treating the gradient as support for a multi-day run.**
Absorbs: gpt-sol-pro F3.
**Verdict: REJECTED.** The calibration dry-run's stated purpose (§12's own framing) is a narrow,
binary saturation check, not a fine-grained failure-mode profile driving a hidden design lever — the
one lever it did inform (C6's prompt) is disclosed as diagnostic-only by GF-03's adoption, not a
silently-adopted design choice. Generator-family familiarity between a calibration check and the
family it calibrates against is not unique to this amendment: every prior study in this project
(`DUALFIX-STUDY-PREREG.md`, `BI-BATTERY-DESIGN.md`) calibrated its own instrument against its own
generator family without a fresh-untouched-set requirement, and this finding does not name a reason
this instance is different in kind. Requiring an untouched replication here, uniquely, would be a new
house-convention bar this project has never applied anywhere else — rejected on that precedent
absence, not on the cost of gathering it.

**GF-05 — `gpt-oss:latest`'s dual role (proposed rev-3 executor and a reviewer lane on this panel) is
not disclosed anywhere in §12's own text.**
Absorbs: gpt-sol-pro F4, kimi-k3 F2, qwen-max F3, gemma4 F2, gpt-oss F2.
**Verdict: ADOPTED.** Five of five lanes raised this independently. §12 must add an explicit
disclosure paragraph naming the dual role, mirroring the disclosure already written into this panel
record's own Summary section above.

### Lane 2 — the battery-widening arithmetic

**GF-06 — The harvest figures (~18 at 60, ~27 at 90) are asserted, not derived from any measured
joint/correlation structure, and no target assurance probability is stated.**
Absorbs: gpt-sol-pro F5, kimi-k3 F4, gpt-oss F3.
**Verdict: ADOPTED.** §12 must add a design-time-computed disclosure of `P(n_d ≥ 20)` under the
stated ≈30% discordance assumption, mirroring §6 Clause 2's own power-table precedent (a design-time
binomial-tail computation, not a data-time one): at the assumed point estimate `p=0.30`,
`P(Bin(90,0.30) ≥ 20) ≈ 96.1%`, versus `P(Bin(60,0.30) ≥ 20) ≈ 33.1%` at the old battery size — and,
disclosed for honesty against a pessimistic assumption, even at `p=0.20`, 90 units yields `≈33.8%`
versus `≈1.1%` at 60. This is the concrete assurance-probability figure the finding correctly says is
missing, computed once at design time and stated as a disclosure, not a guarantee.

**GF-07 — The harvest expectation assumes independence across seeds immediately after §5 names seed
clustering as a live threat to the *decision rule*; no equivalent block-level treatment is applied to
the *harvest/qualification* risk.**
Absorbs: gpt-sol-pro F6.
**Verdict: ADOPTED.** §12 must add a disclosure that the harvest estimate (GF-06) assumes discordance
is roughly uniform across seed blocks; if discordance concentrates unevenly across seeds, the actual
harvest may diverge from the point estimate even though the block-level concordance check (§5,
unchanged) defends the *decision rule* against exactly that concentration — the two are different
defenses against different risks, and §12 should not let the concordance check's existence imply the
harvest arithmetic is also protected.

**GF-08 — The discordance-rate assumption depends on the W–B joint/correlation structure specifically
on `gpt-oss:latest`, which is entirely unmeasured.**
Absorbs: qwen-max F4.
**Verdict: ADOPTED.** §12's floor-margin-arithmetic bullet must state plainly that the ≈30%
discordance-rate assumption is exactly that — an assumption under an implicit near-independence
structure, not a measured correlation — cross-referencing GF-01's disclosure rather than re-deriving
a second one.

**GF-09 — If W is only marginally better than B (not near-perfect), the harvest would be larger, not
smaller, than ~27; the widening to 90 might be excessive rather than insufficiently justified.**
Absorbs: gemma4 F3.
**Verdict: REJECTED.** This reverses the design's actual risk direction: the qualification floor
(§6 Clause 2) is a *minimum*, and any harvest at or above it clears the gate — a larger-than-expected
harvest only increases power and never triggers `TERMINATED-UNDERPOWERED`. The finding does not
identify a threat to any pin, clause, or disclosure in this design; the risk it should be read as
gesturing toward (an *under*-harvest) is the one GF-06/GF-07/GF-08 already correctly identify and
adopt disclosures for.

### Lane 3 — the three recomputed values

**GF-10 — The three recomputed values (72/90, 9/90, 71/90) are correctly derived; no defect found.**
Absorbs: gpt-oss F4.
**Verdict: REJECTED.** The finding raises no defect and proposes no change — nothing to adopt.
Recorded as confirming the recomputation is correct, consistent with the other four lanes'
independent "No findings" verification on this lane.

### Lane 4 — the widened critical-value table

**GF-11 — No audit or test demonstrates every row of the widened 71-row table (beyond the shared
20–60 range) satisfies the combinatorial condition; lane spot-checks are not a substitute.**
Absorbs: gpt-oss F5.
**Verdict: ADOPTED.** Confirmed as a real gap on inspection: `test/paired-rev3-derivation.test.ts`
proves the *derivation function* `deriveRev3Table()` is internally correct and matches the frozen
rev-2 table on the shared range, but nothing currently reads §12's own hand-transcribed 71-row
markdown table off disk and checks it, row by row, against that derivation for the widened range
(61–90) — the exact hand-transcription-error risk §9's own drift-guard provenance row names for the
rev-2 table. Task 3 adds a new test (`test/paired-rev3-table-drift.test.ts`, a Rule-2 addition: a
missing-critical-functionality gap, not a scope expansion of §1–§11) binding §12's own transcribed
table to `deriveRev3Table()` for all 71 rows, mirroring `test/paired-critical-value-drift.test.ts`'s
existing pattern for §9.

### Lane 5 — open decision 1: the seed-block shape

**Settled: 9 blocks of 10 tasks each, six-of-nine concordance agreement threshold** — the panel's
own convergence (four of five lanes engaging this lane preferred 9×10; the fifth, gpt-oss, preferred
a stricter, unelaborated 7-of-9 without a worked bound), strengthened by the findings below.

**GF-12 — The draft's "zero gate-code change" framing of the 6×15 alternative understates a real
statistical/practical cost (per-seed dominance under partial correlation, a larger design effect
`1+14ρ` vs. `1+9ρ`, fewer independent blocks, and downstream scheduling/timeout impact).**
Absorbs: gpt-sol-pro F7, kimi-k3 F7, qwen-max F6, gemma4 F4, gpt-oss F7.
**Verdict: ADOPTED.** Five lanes converge on this. §12's 6×15 bullet must be rewritten to name the
real cost (design-effect inflation under partial correlation, larger per-seed dominance, breaking
house convention) rather than presenting "zero gate-code change" as the option's only cited property.

**GF-13 — The 50.78% vs. 68.75% comparison is presented as a safety improvement, but the block-level
concordance check is vacuous at the exact perfect-correlation collapse case under *both* options (it
can never downgrade the ceiling case) — the "lower bound" framing should be corrected, not celebrated.**
Absorbs: kimi-k3 F6.
**Verdict: ADOPTED.** §12's 9×10 bullet must be corrected to state that the concordance check cannot
downgrade the exact perfect-correlation collapse case under either seed-block shape, so the design's
real comparative advantage is the per-seed-dilution argument (GF-12), not the bound magnitude itself.

**GF-14 — Increasing the seed count from 6 to 9 increases the number of draws that could include an
anomalous ("poison") seed, a risk distinct from the perfect-correlation collapse case already bounded.**
Absorbs: gemma4 F5.
**Verdict: ADOPTED.** §12 must add this as a disclosed, named risk of increasing seed count,
alongside — not in place of — the existing perfect-correlation worst-case-bound disclosure.

**GF-15 — 9×10's 6-of-9 threshold has a stricter false-concordance probability under the null
(one-sided `P(X≥6)` under `Binomial(9,0.5))` than rev-2's 4-of-6 (`P(X≥4)` under `Binomial(6,0.5))`) —
an additional conservatism argument for 9×10 the draft could name but does not.**
Absorbs: qwen-max F7.
**Verdict: ADOPTED**, figures independently re-verified rather than trusted from the lane's own
arithmetic: `P(Bin(9,0.5)≥6) = 130/512 ≈ 25.39%` versus `P(Bin(6,0.5)≥4) = 22/64 ≈ 34.38%` — both
confirmed by direct exact-integer computation. §12 must add this figure to the 9×10 recommendation as
a supporting data point.

**GF-16 — The 6-of-9 threshold is asserted without justification; a stricter 7-of-9 threshold would
reduce risk.**
Absorbs: gpt-oss F6.
**Verdict: REJECTED.** §12 already states its rationale explicitly (preserving the same fraction
rev-2's own already-reviewed 4-of-6 ≈ 66.7% threshold used) — the finding's claim that no
justification is offered is factually incorrect. The finding proposes 7-of-9 without deriving its own
worst-case bound or false-concordance rate for comparison, so no evidence is offered that 7-of-9 is
actually better; the four lanes that engaged this decision with worked arithmetic (GF-12–GF-15,
adopted) converge on 6-of-9 with additional, verified support (GF-15's 25.4% figure), which this
isolated, unelaborated preference does not out-argue.

### Lane 6 — open decision 2: the near-floor evidential-weight bound

**Settled: re-derive the bound to 25, via a power-anchored criterion — the smallest `n_d` at which
power against a stated plausible true discordant-win probability (`p=0.70`, the same reference
probability §6 Clause 2's own power table already uses) first reaches 50%, computed directly from the
pinned `c(n_d)` table.** Independently computed (not trusted from any lane's own arithmetic):
`P(Bin(24,0.70)≥18) ≈ 38.9%`, `P(Bin(25,0.70)≥18) ≈ 51.2%` — 25 is the first `n_d` at which this
crosses 50%. This criterion is a function of `n_d` and the pinned critical-value table alone; it
never references the battery's total capacity (60 or 90), which is exactly kimi-k3 F8's
battery-invariance argument, landed at a concrete number via qwen-max F8's power-anchoring approach
(power itself is not perfectly monotonic in `n_d`, since `c(n_d)` steps unevenly — the "first
crossing" convention is used deliberately, matching the existing house practice of anchoring §6
Clause 2's own power table to two representative points rather than requiring strict monotonicity).

**GF-17 — Neither the draft's recommended default (24) nor the counter-argument (34) is anchored to
the evidentially relevant quantity — the sign test's own power at the observed `n_d`, a function of
`n_d` alone, not of how much larger the full battery has become.**
Absorbs: gpt-sol-pro F8, kimi-k3 F8.
**Verdict: ADOPTED.** This is the correct framing and the basis for the settled value above; §12 must
replace both proposed rationales with the power-anchored derivation.

**GF-18 — The bound should be re-anchored proportionally to ≈34 (a fixed fraction of the widened
floor-to-90 range), since 24 now represents a much smaller fraction of the available range than it
did under rev-2.**
Absorbs: gemma4 F6, gpt-oss F8.
**Verdict: REJECTED.** This finding's own mechanism — scaling the bound as a fraction of total battery
capacity — is exactly the premise GF-17 (adopted, above) demonstrates is statistically unsound: power
at a given `n_d` does not depend on the size of the battery that produced it. Rejected because the
proposed mechanism is refuted by an adopted sibling finding, not because re-deriving it is costly.

**GF-19 — A power-anchored value (qwen-max's own worked figure, ~25–28 at `p=0.70`) sits between the
draft's two proposed values and should be considered as a third, principled option.**
Absorbs: qwen-max F8.
**Verdict: ADOPTED.** This is the approach the settled value above uses; the final figure (25) is
independently re-verified rather than taken from the lane's own approximate arithmetic (which
reported ~25–28 without pinning the specific first-crossing definition used here).

### Lane 7 — what this amendment does not touch, verified rather than assumed

**GF-20 — Equal-treatment pins deferred to Phase 14 (timeout, prompt-length bound) were calibrated
for `qwen3.6:latest`; §12 does not state they must be re-examined for `gpt-oss:latest`.**
Absorbs: gpt-sol-pro F9, kimi-k3 F9, gemma4 F7, gpt-oss F10.
**Verdict: ADOPTED.** §12 must add a disclosure naming a new deferred obligation: the timeout and
prompt-length-bound rows (§9) must be re-examined, and re-pinned if inadequate, for
`gpt-oss:latest`'s own latency/context-window behavior at or before the rev-3 instrument commit —
mirroring Phase 14's original pinning obligation — before any rev-3 probe, search, or paired run.

**GF-21 — The battery widening increases total arm-attempts by 50% (120→180), increasing cumulative
harness-fault exposure against the single local inference slot over a longer run; §12 does not
discuss this.**
Absorbs: qwen-max F9.
**Verdict: ADOPTED.** §12 must add an operational-exposure disclosure naming the 50% increase in
total arm-attempts and its compounding effect on this project's own long-inference-operational-risk
concern (`.planning/STATE.md` Blockers/Concerns) — disclosed, not gated: the harness-fault carve-out
(§6, unchanged) already handles each unit's own exposure individually.

**GF-22 — §12's framing that battery construction changes "only in size" is inaccurate: the
seed-block-shape decision changes block topology and the concordance-gate threshold, which are
structural/dependence changes, not merely a size change (vs. gpt-oss's own "no hidden side effects"
reading of this same lane).**
Absorbs: gpt-sol-pro F10, gpt-oss F9.
**Verdict: ADOPTED**, on gpt-sol-pro's reading — the more substantively correct one, independently
corroborated by kimi-k3 F10/qwen-max F6's own observations about the block-topology change elsewhere
in the panel. §12 must state explicitly that battery construction changes in *both* size and block
topology/concordance-gate threshold (per the settled seed-block-shape decision above), not merely a
larger version of the same shape. gpt-oss F9's "no hidden side effects" reading is correct for the
four *genuinely* untouched surfaces §12 already lists (oracle, generator, pairing-unit discipline,
`VERTICAL_ADMISSION`) — those stay disposed of as accurate — but does not extend to the battery
construction's own characterization, which this adoption corrects.

**GF-23 — The oracle's extraction contract is unchanged, but the model swap changes which failure
surface it actually sees (extraction-contract near-misses); a W-SUPERIOR/B-SUPERIOR verdict may
partly reflect differential extraction-contract brittleness rather than capability, and §8 item 3's
90%-mismatch ceiling would not catch a moderate-rate version of this.**
Absorbs: kimi-k3 F10.
**Verdict: ADOPTED**, as a disclosure — this is the panel's closest approach to a substance-adjacent
finding (does the amendment change *what* is measured, not just *how precisely*), engaged on the
merits rather than reflexively rejected or silently dropped, per this plan's own instruction. §12 must
add a disclosure that the model swap shifts which failure surface the shared, byte-unchanged
extraction contract must handle, and that a verdict should be read alongside §8 item 3's own
already-existing oracle-discrimination-caveat mechanism (unchanged by this amendment). Disposition:
this is read as a measurement-*validity* concern (a confound the design discloses, mirroring §2's own
already-frozen "plausible-looking but wrong resolution" residual) rather than a redefinition of the
hypothesis under test (still tournament-search-vs-not on `customer-support`'s replay-checkable
subset) — but because it is the panel's most substance-adjacent finding, it is named explicitly here
and raised again at the checkpoint below rather than closed as routine.

**GF-24 — §6 Clause 2's F-14 power-profile disclosure is stale: its `n_d=40` reference point ("as the
battery fills") now represents less than half of a 90-unit battery, and §12's own open-decision-2
parenthetical acknowledges the need for restatement without providing it.**
Absorbs: kimi-k3 F11, qwen-max F10.
**Verdict: ADOPTED.** §12 must add a restated power-profile reference point at `n_d=60`, mirroring §6
Clause 2's existing four-probability shape. Independently computed: `P(Bin(60,0.60)≥39)≈25.7%`,
`P(Bin(60,0.65)≥39)≈55.9%`, `P(Bin(60,0.70)≥39)≈83.8%`, `P(Bin(60,0.75)≥39)≈97.0%`.

### Lane 8 — anything else

**GF-25 — §12 conflicts with §7's frozen one-shot termination clause, which bars "changing the
qualification thresholds, the battery construction, the oracle, or the decision rule" for the same
hypothesis after a termination; rev-2 terminated `TERMINATED-UNDERPOWERED`, and this amendment changes
both the battery construction and the derived qualification thresholds. The executor-model change
alone is not on §7's enumerated list. §12 does not engage §7 anywhere in its own text.**
Absorbs: gpt-sol-pro F11, kimi-k3 F3.
**Verdict: ADOPTED — the most load-bearing finding in this panel, surfaced prominently at the
checkpoint below, not closed quietly.** §12's silence on §7 is itself a defect regardless of which way
the substantive question resolves, so this finding is adopted at minimum to require that §12 engage
§7 explicitly rather than never mention it. §12 must add a paragraph stating both readings honestly:
(a) the instrument-identity argument — rev-2's termination was of the `qwen3.6`-instantiated
instrument (W and B are committed, model-specific artifacts; termination cause was saturation/no
gradient specific to that model), so an executor-model swap arguably redefines the instrument/W-B
population being tested, and the widened battery is this new instrument's own from-scratch
construction rather than a modification of the terminated one; against (b) the plain-text reading —
§7 enumerates "battery construction" as a barred lever independent of executor identity, and
separately states termination is "never remedied by... redrawing the battery," language that cuts
directly against (a). Whether (a) is accepted is not this ledger's call to make unilaterally — it is
the checkpoint's primary go/no-go question, with the checkpoint's three options (freeze-as-adjudicated
= accept (a); revise-then-freeze at battery size 60 only = accept (b) but keep the model swap;
another-panel-round = neither reading is dispositive enough to freeze) mapped directly onto it.

**GF-26 — §12's freeze-discipline clause ("pins become immutable once any rev-3 inference data
exists") is in tension with the fact that the executor choice and C6's failure-mode framing were
themselves selected using pre-freeze `gpt-oss` inference data on the same instrument family.**
Absorbs: gpt-sol-pro F12.
**Verdict: ADOPTED.** §12's discipline-clause paragraph must be revised to state explicitly that "no
rev-3 inference data" refers to ceiling-probe, search, or paired-round data collected *under the
frozen rev-3 pins* — not the pre-freeze diagnostic dry-runs that informed those pins, which is a
normal and disclosed part of instrument design, exactly as rev-2's own pins drew on pre-existing
project convention and precedent.

**GF-27 — §12 pins a mutable tag (`gpt-oss:latest`) and what appears to be a digest prefix
(`17052f91a42e`) without stating a verification rule requiring the full content digest be resolved
and checked before any rev-3 inference runs.**
Absorbs: gpt-sol-pro F13.
**Verdict: ADOPTED.** §12's executor-model pin must add a sentence stating that execution resolves and
verifies the full content digest (not a prefix match) against the pinned value before any rev-3
probe, search, promotion, or paired inference runs.

**GF-28 — The ceiling probe (answer-visible mode) validates format-satisfiability only; it does not
gate the model-swap's real risk (too few usable discordant pairs, unstable accuracy, seed-concentrated
errors); a separate diagnostic-gradient replication is needed and should not be conflated with the
frozen oracle/qualification methodology.**
Absorbs: gpt-sol-pro F14.
**Verdict: ADOPTED**, in part. §12's ceiling-probe paragraph must add a cross-reference sentence
stating explicitly that the probe validates format-satisfiability only and is not evidence for the
harvest-rate rationale (GF-01/GF-06's disclosures cover that gap instead). The request for a *new*,
separate diagnostic-gradient replication is not adopted as a data-collection requirement: it asks for
new inference data pre-freeze beyond what 15-01 already collected, which the honest-assumption
disclosures already adopted above (GF-01, GF-06, GF-08) answer without commissioning further runs —
the ceiling probe's own scope (format-only) is itself an already-frozen rev-2 design decision this
amendment does not reopen.

**GF-29 — The table-identity and seed-disjointness claims are cited to a test file and to "this
plan's own SUMMARY.md" without a pinned commit/hash the way the ancestry paragraph pins rev 2; the
amendment should also name which studies consumed the newer prior-union seeds it lists.**
Absorbs: kimi-k3 F12.
**Verdict: ADOPTED.** Verified directly rather than asserted: `1399` is the Phase-14 ceiling-probe
seed (`CEILING_PROBE_SEED`), `1401–1403` are the tournament search seeds, `1404–1406` are the
tournament promotion seeds (all three from `_paired-constants.ts`), and `1501–1503` are the Plan
15-01 calibration-dry-run seeds (`_calibration-dryrun.ts`). §12 must cite `test/paired-rev3-derivation.test.ts`
and `test/paired-rev3-table-drift.test.ts` (added by GF-11) by name for the table-identity claim, and
name these four studies/plans for the seed provenance, replacing the bare "this plan's own SUMMARY.md"
citation.

**GF-30 — The new seed set (1601–1609, 1610, 1611–1616) is claimed disjoint from the prior union
without a formal proof or registry lookup cited in §12 itself.**
Absorbs: gpt-oss F11.
**Verdict: ADOPTED.** Independently verified by direct set computation over the full prior union
`_paired-comparison-arm` has ever used (101, 202, 303, 404, 505, 606, 707, 808, 909, 999, 1201–1206,
1301–1306, 1399, 1401–1406, 1501–1503 — 32 numbers) against the sixteen new numbers (1601–1616):
zero overlap, confirmed by exact computation, not by inspection. §12 must state that this disjointness
was checked by direct set computation over the literal integers already named in its own text (rather
than merely asserted), since the check is pure integer set arithmetic over values already pinned.

**GF-31 — Holding the discordant-pairs floor at 20 while widening the battery moves the tie-rate
disclosure threshold from 68.3% (41/60) to 78.9% (71/90); a run with, say, 75% ties would have fired
rev-2's advance-disclosure but fires none under rev-3, and §12 does not state this.**
Absorbs: kimi-k3 F5.
**Verdict: ADOPTED.** §12's tie-rate-ceiling-threshold bullet must add one sentence disclosing that
this is a consequence of the deliberate, unchanged choice to hold the floor at 20 (itself the right,
non-gaming choice, unchanged by this adoption) — not a silent drift in what the disclosure protects
against.

### Substance gate

**CLEAR, after the adoptions above.** After adoption, the surviving findings argue about evidentiary
sufficiency, disclosure completeness, and procedural engagement with §7 — never that the amendment
redefines the hypothesis under test (tournament-selected W vs. unevolved baseline B, on
`customer-support`'s replay-checkable subset, scored by the unchanged replay-match oracle). The one
finding closest to a substance claim, GF-23 (kimi-k3 F10, oracle/extraction-contract brittleness), is
engaged explicitly above and disposed of as a measurement-validity disclosure, mirroring an already-
frozen rev-2 residual disclosure (§2), not a redefinition of what is measured. GF-25 (§7) is not a
substance-of-measurement finding either — it is a threshold/procedural question about whether a
successor instrument is *permitted* to run at all — but per this plan's own instruction it is not
closed quietly regardless: it is the primary item raised at the checkpoint below.

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
