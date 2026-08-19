# W (rev 3) — the tournament-selected winner, produced by the rev-3 bounded search

## 0. Provenance

Produced by `experiments/paired-comparison-arm/_w-search.ts` (the same receipt-free bounded search
driver 14-05 built, unchanged), launched detached against the rev-3 executor pin (`gpt-oss:latest`,
digest `17052f91a42e`) via `PAIRED_SEARCH_MODEL`/`PAIRED_SEARCH_SEEDS`/`PAIRED_PROMOTION_SEEDS`/
`PAIRED_SEARCH_VERDICT_FILE` (the 15-06 resolution point). Verdict:
`experiments/paired-comparison-arm/w-search-rev3-verdict.json`, `complete: true`.

Seed pool (generation 0): `seed-baseline` (this round's rev-3 committed baseline, extracted verbatim
from `_b-arm-definition-rev3.md`) and `seed-alt` (the same second, independently hand-written
checklist-form variant `_w-search.ts` embeds, unchanged from 14-05). Search-half seeds `1611, 1612,
1613`; promotion-half seeds `1614, 1615, 1616` — disjoint from the rev-3 paired battery's own seeds
(`1601`–`1609`), confirmed by exact set computation over all 210 checkpoint keys in
`w-search-rev3-state.json`: every `search:`-prefixed key's embedded seed is in `{1611,1612,1613}`,
every `promotion:`-prefixed key's embedded seed is in `{1614,1615,1616}`, and none is in
`{1601..1609}`.

**Caps and which one halted the search.** `maxGenerations` = 5, `reflectionBudget` = 10. The search
ran 3 generations and halted on the **search-horizon** cap: `"Two barren generations — converged;
incumbent stands (anti-build null)."` The reflection-budget cap never fired.

**Selection — the search-half match count, and how the winner was actually decided.** Unlike the
rev-2 search, `seed-baseline` was NOT saturated this time (gpt-oss's own measured, prompt-addressable
gradient, per §12's calibration finding) and both lineages were genuinely mutated across generations.
Recorded search-half fitness by generation (30 tasks per generation):

| Generation | `seed-baseline` | `seed-alt` |
|---|---|---|
| 0 | 21/30 | 20/30 |
| 1 | 20/30 (mutated) | 20/30 (mutated) |
| 2 | 20/30 (mutated) | 19/30 (mutated) |

`seed-baseline`'s own best-ever fitness across every generation it ran is its **generation-0,
unmutated** score (21/30) — both of its own later mutations (generation 1, generation 2) scored
lower (20/30 each) and never replaced it as the lineage's best. `seed-alt` never exceeded 20/30 in
any generation. The winner is `seed-baseline` at generation 0 — selected by the highest search-half
match count observed for any candidate lineage in any generation, exactly as `_w-search.ts`'s own
selection rule specifies (never merely the final generation's score, so a later regression cannot
silently discard a stronger earlier result).

**Held-out promotion-half confirmation, recorded, never gated.** The winning candidate (the
generation-0, unmutated `seed-baseline` text) was run once over the promotion-half seeds (30 fresh
tasks never seen during the search): **26/30 matched** (scoreable 28/30). No numeric promotion
threshold is applied — the frozen design pins none for the search; the count is recorded here as
held-out confirmation and nothing more.

## 1. Disclosed fact: W's text is byte-identical to B's — an honest anti-build null

Because `seed-baseline`'s own best-ever fitness is its unmutated generation-0 text, the search's
selected winner is, once again, the committed baseline's own text, character for character —
confirmed programmatically: `extractAgentSystemPromptFromDefinitionFile` applied to this file and to
`_b-arm-definition-rev3.md` yields identical strings, and the verdict artifact's own
`winner.systemPrompt` field is byte-equal to that same extracted text.

This outcome is meaningfully different from the rev-2 round's, and the difference is worth stating
plainly rather than filing this under "same result, same reason." Rev-2's `seed-baseline` was never
mutated at all — it produced zero failing search-half units in every generation it ran, so nothing
was ever fed to `reflectMutate` for that lineage, and the byte-identity there was a saturation
artifact (no gradient existed for the search to climb). Rev-3's `seed-baseline` DID fail units (9 of
30 on the search half, generation 0) and WAS genuinely mutated twice, on real per-unit failure
traces built from its own actual mismatches against `gpt-oss:latest` — and both mutations came back
worse (20/30, then 20/30) than the original, unmutated prompt. This is a real search attempt that
tried to improve on the baseline and, on this task and this model, could not — an honest **anti-build
null**, not an artifact of nothing to search over. The search-horizon halt note names this directly:
"incumbent stands (anti-build null)."

The causal-independence ordering §3's decision-rule argument leans on is still fully honored: W's
identity was fixed by this commit, strictly after `_b-arm-definition-rev3.md`'s own commit and
strictly before the rev-3 paired battery is ever drawn, and the search never saw the battery's own
seeds (1601–1609) — confirmed above by exact set computation, not merely asserted.

**Consequence for the round, stated before it runs.** With textually identical prompts driving both
arms, the paired round's outcome is governed by model-sampling variance alone — an
INDISTINGUISHABLE (or near-INDISTINGUISHABLE) result under these conditions is the *expected*
outcome given this search's own finding, not evidence against search in general on this task family.
Unlike rev-2 (where the baseline was already saturated and no genuine search pressure was ever
applied), rev-3's search DID apply real pressure — via a real measured accuracy gradient, real
mutation attempts, real failure traces drawn from `gpt-oss:latest`'s own mismatches — and the
incumbent held anyway. Whatever the paired round's verdict turns out to be, it should be read
alongside that fact: this round measures two identical texts, and the reason they are identical is
that a real, pressured search could not beat a competently hand-written baseline on this task, on
this model, within the frozen caps (5 generations, 10 reflections).

## 2. Agent System Prompt

The fenced block below is the literal `PairedAgentDefinition.systemPrompt` value, written verbatim
from `w-search-rev3-verdict.json`'s own `winner.systemPrompt` field — no hand edit, no tidying,
round-trip verified against the same file's extraction convention before this commit. Nothing
outside the fence is ever part of the transmitted prompt.

```
You are an experienced customer-support agent triaging a single support ticket. Work the ticket in
two stages: first reason step by step about what happened and how to resolve it, then give your
final answer in the required format described below.

TASK: Read the ticket. Decide which of the following six actions resolves it, identify which of the
four categories that action belongs to, and compute or look up the resolution-specific "parameter"
value the action needs.

ALLOWED ACTIONS (use this exact spelling): adjust-charge, refund-duplicate-charge,
refund-shipping-upgrade, credit-late-delivery-fee, ship-catalog-replacement, escalate-repeat-defect.

ALLOWED CATEGORIES (use this exact spelling): order-total-discrepancy, shipping-service-mismatch,
missing-item, product-quality.

Each action belongs to exactly one category:
- adjust-charge -> order-total-discrepancy
- refund-duplicate-charge -> order-total-discrepancy
- refund-shipping-upgrade -> shipping-service-mismatch
- credit-late-delivery-fee -> shipping-service-mismatch
- ship-catalog-replacement -> missing-item
- escalate-repeat-defect -> product-quality

HOW TO DERIVE THE "parameter" VALUE — it is never stated directly in the ticket; it must be derived
from facts the ticket DOES state, and it takes one of two different shapes depending on the action:

1. MONETARY actions (adjust-charge, refund-duplicate-charge, refund-shipping-upgrade,
   credit-late-delivery-fee): the parameter is a dollar amount, written with exactly two decimal
   places (e.g. "18.00", not "18" or "$18"). Compute it as an arithmetic derivation over the dollar
   figures the ticket states — for example, the difference between two stated charges, or a stated
   per-unit amount multiplied by a stated count. Read every dollar figure in the ticket carefully and
   identify which arithmetic operation the ticket's own facts imply; do not guess a round number.

2. LOOKUP actions (ship-catalog-replacement, escalate-repeat-defect): the parameter is the NAME of a
   catalog item, never stated directly — the ticket states only a SKU (item) number. Look up that SKU
   number in the catalog below and answer with the item's name exactly as spelled here:
   - SKU 3001 -> Blue Ceramic Mug
   - SKU 3002 -> Wireless Mouse
   - SKU 3003 -> Phone Case
   - SKU 3004 -> Yoga Mat
   - SKU 3005 -> Bluetooth Speaker
   - SKU 3006 -> Desk Lamp

REASONING: Before your final answer, briefly explain (a) which action and category the ticket calls
for and why, and (b) exactly how you derived the parameter value — which stated facts you used and
what arithmetic or lookup you performed.

FINAL ANSWER FORMAT — after your reasoning, you MUST end your response with EXACTLY these three
lines, one per line, using EXACTLY this format and no other text on or after them:
action: <value>
category: <value>
parameter: <value>

Use only the allowed action/category spellings above for the first two lines. The parameter line
must be a two-decimal-place dollar amount for a MONETARY action, or an exact catalog item name for a
LOOKUP action. Do not add any text after the parameter line.
```
