# Stage 4 — Per-provider cost/budget tracking (v1.4.0)

**Verdict: ✅ EARNED** (deterministic, 2026-07-02)

## What was built

`src/foundry/cost.ts` — real-usage cost governance for foundry runs (the mock
path keeps its synthetic per-call metering; this prices what providers
actually report):

- **`PricingTable`**: model → USD-per-MTok for input / output / cache-read
  (cache-read defaults to input/10, the standard Anthropic ratio). Local
  models are $0 by omission.
- **`priceUsage`**: pure pricing of one call's `ChatUsage`, cache-read billed
  at its own rate.
- **`FoundryCostMeter`**: run-level aggregation (totals + per-role breakdown)
  with hard caps — `maxTokens` (N5) and `maxUsd` (R3). The call that crosses
  a cap throws `CostCapExceededError`; everything already spent **stays
  recorded**, so the audit trail survives the halt.
- **Unknown models are reported, never guessed** (`unpricedModels`): a local
  Ollama model is legitimately $0; a hosted model missing from the table is
  visible in the report instead of silently mis-pricing a run.

Wiring: `FoundryModelLayer` accepts an optional `meter`; every role call
flows through one seam (`ask`) where the meter records + checks. A cap breach
inside a specimen call propagates as that specimen's failure and is contained
by the stage-3 spawn layer; a breach in a frozen role (test-author, judge)
halts the run — the correct asymmetry (specimens are expendable, the
harness roles are not).

## Eval design

Deterministic (`test/foundry-cost.test.ts`):

1. **Pricing math** — input/output/cache-read at distinct rates; cache-read
   default ratio; unknown model prices $0.
2. **Aggregation** — totals + per-role breakdown across mixed models/roles.
3. **Token cap** — the crossing call throws; the spend remains on the record.
4. **USD cap** — same semantics; the error carries the totals snapshot.
5. **Unpriced-model reporting** — `granite4.1:30b` shows up in
   `unpricedModels` with $0, not a guess.
6. **Composition** — a real `FoundryModelLayer` with a 1 000-token cap over a
   scripted provider: specimen one fits, specimen two breaches mid-spawn and
   is killed as `error: token cap 1000 exceeded` by the spawn layer while the
   meter's record survives (audit intact).

## Results

- 8/8 stage-4 tests green; full suite **272/272**; typecheck clean.
- The roadmap's "budget/cost tracking against per-provider token pricing"
  requirement for the BYO-LLM harness is built and enforced at the single
  choke-point every foundry LLM call passes through.

## Honesty caveats

- No live-price catalog is bundled: prices change; the table is
  operator-supplied configuration (stage 5 reads it from `foundry.json`).
  An empty table means $0 pricing with every hosted model listed in
  `unpricedModels` — visible, not wrong.
- Wall-clock budget (N4) is enforced per specimen (stage 3), not per run;
  a run-level wall-clock cap remains the CLI's job if needed later.
