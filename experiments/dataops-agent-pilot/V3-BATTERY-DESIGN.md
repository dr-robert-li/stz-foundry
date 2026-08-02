# v3 battery design — revision 2, post-review

**Status:** revised against the 5-reviewer cross-AI panel (`V3-REVIEWS.md`:
2× SOUND-WITH-CHANGES, 3× UNSOUND — every critical addressed below, each
tagged with its source). Not built; no generator id exists; no acceptance has
occurred.

## 0. The problem (unchanged, measured in rounds 1–2)

Baselines 0.92–0.94 on promotion halves; clean noise floors 0.004–0.153 (40×
draw-dependence); real competence differences with nowhere to express them.
Design inequality: `(1 − baseline) ≥ 3 × 0.153` → **baseline corridor
0.35–0.55**, inside the discriminating band, sign-consistent arms.

## 1. FROZEN (one variable per round) — unchanged

Method (reflective mutation, 2 gens, 2 search warehouses, min-aggregation,
worst-warehouse traces); scoring (graded `revenueCents`, `REVENUE_ZERO_AT`
0.10; `orderCount` exact); discipline (answer-first, leak checks, admission
path, split holdout, replicates, per-task diagnostics, prereg-before-data).

## 2. Structural changes forced by the panel

**S1 — 10 tasks per half** (unanimous: gemma4 C1, qwen C1, claude Q2,
gpt-oss). Exact-rate quantum drops 0.167 → 0.10, below the worst noise floor.
Task count is inside the "battery" variable; it does not confound the levers.
Five customers × two months per warehouse.

**S2 — Independent reference interpreter** (gpt-sol-pro C1 — the panel's
strongest novel finding). A second implementation, sharing NO helpers with the
generator, reads only the emitted CSV + the published rule text and recomputes
every fact. Every generated task must satisfy
`precomputed fact === independent recomputation`, enforced in the generator's
test suite across a seed sweep. Answer-first protects against selection bias;
this closes the other direction — a derivation bug making the stored fact
disagree with what a correct solver would compute.

**S3 — Formally ordered evaluation pipeline** (gpt-sol-pro C2, gemma4 C2/C3,
qwen I5). The task prompt states the pipeline as numbered steps, and the
generator + interpreter implement exactly it:

1. Parse rows (all dates ISO 8601, single timezone, no time component).
2. **Resolve duplicates** (L1): rows sharing `orderId` collapse to one by
   (a) latest `updatedAt`; (b) tie → largest `amount`; (c) identical on both →
   rows are byte-identical by construction (generator guarantee — no
   undefined case exists to adjudicate).
3. **Attribute to month** (L3): every row buckets by `paymentDate` month.
   `orderDate` exists and differs on 20–40% of rows; it is never used.
4. **Filter** to the task's customer + payment-month.
5. **Validate references** (L2): a refund/adjustment counts iff its
   `origOrderId` names an order that SURVIVED steps 2–4 (formal dangling
   definition — gpt-sol-pro's "filtered set" ambiguity closed). Refunds are
   whole-order, at most one per order, never duplicated, never exceed the
   order amount (all interaction ambiguities removed by construction).
6. **Aggregate**: `orderCount` = distinct qualifying orders (type `order`
   only); `revenueCents` = orders − valid refunds ± valid adjustments
   (adjustments carry signed amounts and their own `origOrderId`, same
   validity rule).

**S4 — L3 de-fanged to pure column selection** (qwen C2). Both date columns
ISO-only. The reasoning content is *which column governs bucketing*, not date
parsing. The v2 format zoo (amounts in three renderings) is retained
unchanged — it is part of the frozen v2 messiness, not a new lever.

**S5 — Graded-gradient protection** (qwen C3). Refund rate capped at 0.15 so
a filter error cannot cascade the graded score off the `REVENUE_ZERO_AT`
cliff. The difficulty probe must verify `mean(graded) − mean(exact) ≥ 0.10` —
the partial-credit gradient the battery exists to provide must survive the
new levers, or the knobs back off.

**S6 — Row order shuffled independently of `updatedAt`** (claude) so "last
row wins" pattern-matching cannot substitute for timestamp comparison. Leak
checks extended to net revenue, per-group conflict outcomes, and the combined
L1×L2×L3 battery (claude's interaction-leak point), plus a decoy-column check
(gpt-oss #8): no metadata column may equal or trivially encode an answer.

## 3. Calibration protocol — rebuilt (claude C1/C4, gpt-sol-pro C3, qwen C4/I3/I4)

1. **Pre-registered fixed knob grid**, committed before any probe inference
   (qwen C4 — kills difficulty-shopping): G1 = L1 only (conflicts 0.5/group);
   G2 = L1+L2 (refunds 0.10); G3 = L1+L2 (refunds 0.15, conflicts 1.0);
   G4 = L1+L2+L3 (dual dates); G5 = G4 + L4 reserve (30-row groups).
   Point values, not ranges (claude). 2×2 factorial coverage of L1/L2 sits
   inside G1–G3 (qwen I2's interaction estimate).
2. **Ceiling probe first** (qwen I3): baseline prompt + answer key + CSV →
   must reproduce the JSON at ≥0.95. Fails ⇒ format confound exists; fix
   before any difficulty work.
3. **Probe = 3 seeds × 10 tasks per grid point, baseline AND s0-minimal**
   (n=30/arm/point; claude C4, gpt-oss #2). Acceptance is INTERVAL-based
   (gpt-sol-pro C3): a point qualifies iff the baseline 90% CI ⊆ [0.30, 0.60]
   AND s0 mean ≥ 0.05 AND `mean(graded) − mean(exact) ≥ 0.10`.
4. **Noise replicates inside the probe** (claude C1 — the ordering bug):
   baseline re-scored twice on one promotion-half draw per qualifying point;
   the corridor check re-run against the MEASURED v3 noise, not v2's 0.153.
5. **Selection rule pre-registered** (qwen I4): among qualifying points, the
   one with the smallest measured noise; ties → fewer levers. No qualifying
   point ⇒ L4 reserve enters; still none ⇒ redesign, publicly.
6. Prompt token length recorded per grid point; >30% inflation over v2 flags
   a comparability risk in the prereg (qwen I1, claude).
7. Freeze knobs → `DATA_OPS_GENERATOR_V3_ID` → **human acceptance (Dr. Robert
   Li, in session)** → full separation gate (3 arms × 3 FRESH seeds, SE-aware,
   sign-consistency) → `PREREG-AMENDMENT-2.md` (recording ollama + model
   digests — claude Q5b) → round 3, frozen method.
8. **Rollback** (claude Q5a): separation-gate failure returns to step 5's
   next qualifying point; a knob change after acceptance is a NEW generator
   id + fresh acceptance, never an edit under the accepted one.

## 4. Accepted residual risks (stated, not hidden)

- Calibration tunes difficulty against one baseline family; qwen C4's
  fixed-grid + interval rule bounds but does not eliminate it. Residual
  accepted and recorded.
- L2 reference-validation retains a lookup component (claude C3); bounded by
  S5's gradient check and the formal pipeline. Recorded as partially
  lookup-diligence in the eventual writeup.
- Per-task latency will rise; timeout stays 3600s and per-task wall-clock is
  recorded — a task family averaging >30 min triggers review before round 3
  (claude Q5c).
