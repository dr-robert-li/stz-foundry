# W — the tournament-selected winner, produced by the receipt-free bounded search

## 0. Override framing

This definition, and the paired-comparison instrument it belongs to, is produced under the
2026-08-11 human override by Dr. Robert Li as v1.25.0 follow-on work. It is not a Stage-B trigger
outcome, not a retroactive pass of the gate that recorded NOT-MET
(`20*(19-17)=40 < 3*24=72`, `experiments/dualfix-study/STUDY-RESULTS.md`), and not a continuation of
milestone v1.24.0, whose terminal record stays untouched and read-only. Phase 14 exists only because
Dr. Li explicitly directed reopening Phases 13/14, overriding the VOID-BY-RULE closure the Stage-B
miss would otherwise have produced — this document states that plainly, in its own words, rather
than as a footnote.

## 1. What W is, per `PAIRED-DESIGN-PREREG.md` rev 2 §3

W is **the tournament-selected winner agent definition** — the configuration produced by this
project's component-tournament machinery (GEPA-style bounded reflective mutation), from a bounded
search over candidate configurations, selected by the search's own highest-fitness rule. §3's pinning
mechanism requires W's definition to be committed, with its own commit SHA, before the paired
battery's pairing units are drawn or seen by either arm, and requires the data used to select W to be
disjoint from the battery's own seeds (1301–1306) — both satisfied here: this commit lands after B's
own commit and strictly before any paired-battery unit is drawn (14-06's job, not this plan's), and
the search below drew exclusively from the search-half seeds (1401–1403) and the promotion-half seeds
(1404–1406), never the battery's own six.

## 2. Provenance — what actually produced this candidate, and what did not

**PD-1 (`14-01-PLAN.md`, restated in `14-05-PLAN.md`).** This candidate was produced by
`experiments/paired-comparison-arm/_w-search.ts`, a driver built fresh for this plan that
orchestrates the shipped tournament machinery's own PRIMITIVES directly — never by calling the
shipped top-level entry point, `runComponentTournament` (`component-tournament.ts`). That entry point
was deliberately not called because its own search-generation path (`runSearchGeneration`) calls
`runAgentBattery`, which constructs and validates an `OracleReceipt` against a branded
`AgentBattery`/`SplitBattery` value — machinery this phase's own pinned decision (PD-1) refuses to
invoke, because a hand-constructed receipt for this generator would forge a human-acceptance
signature for an acceptance event that never occurred under this phase's autonomous directive.

**Primitives reused by import, never reimplemented:**
- `reflectMutate` (`src/foundry/reflective-mutation.ts`) — the bounded reflective-mutation call,
  invoked with the pinned model (`qwen3.6:latest`) passed explicitly on every call, never the
  helper's own default-model fallback.
- `onReflection`/`initialReflection` (same module) — the reflection-budget state machine, default
  cap `DEFAULT_REFLECTION_BUDGET` = 10.
- `onGeneration`/`initialMeta` (`src/harness.ts`) — the generation-horizon state machine, default
  cap `MAX_GENERATIONS_DEFAULT` = 5.

Fitness came from the same independent oracle the paired round itself scores with
(`classifyCustomerSupportResponse`, called inside the imported, unchanged `runArmOnPairingUnit` from
`_paired-arms.ts`) — never a synthesized `EvalResult` or a call into `select()`/`evalReward`.

**Seed pool (generation 0):** two lineages, never more —
- `seed-baseline`: the committed baseline's own text, extracted verbatim from
  `_b-arm-definition.md` (commit `ac3f452efc1b2580db8cae802649d7c8defacc0e`) via
  `extractAgentSystemPromptFromDefinitionFile`.
- `seed-alt`: a second, independently hand-written starting variant, embedded directly in
  `_w-search.ts` (`SEARCH_SEED_ALT_SYSTEM_PROMPT`) — structured as a numbered checklist rather than
  `seed-baseline`'s prose, covering the same substantive contract (both vocabularies, both
  parameter-derivation paths including the full item catalog, the three-line output format).

**Caps and which one halted the search.** `maxGenerations` = 5, `reflectionBudget` = 10. The search ran
3 generations and halted on the **search-horizon** cap: `"Two barren generations — converged; incumbent stands (anti-build null)."` — the
generation-horizon FSM's own convergence rule (two generations in a row with no fitness improvement
over the running best), not exhaustion of either cap's raw numeric value. The reflection-budget cap
never fired: only 2 of the 10-budget reflections were ever consumed, both spent on the `seed-alt`
lineage (generations 0 and 1) — `seed-baseline` was NEVER mutated, because it produced zero failing
units in every generation it ran, leaving nothing to reflect on (the driver's own "no failures, no
reflection" rule).

**Selection — the search-half match count, and how the winner was actually decided.** Selection rule:
the highest search-half match count observed for a candidate lineage across ANY generation it ran,
ties broken by the original seed-array order. Recorded search-half fitness by generation:

| Generation | `seed-baseline` | `seed-alt` |
|---|---|---|
| 0 | 30/30 | 28/30 |
| 1 | 30/30 | 29/30 |
| 2 | 30/30 | 30/30 |

`seed-baseline` reached the maximum possible score (30/30) in generation 0 and held it; `seed-alt`
improved across two mutations (28 → 29 → 30) but never exceeded `seed-baseline`'s score. The winner
is `seed-baseline`, selected outright by a strictly higher count at generations 0 and 1 — the
deterministic tie-break by array order was never actually invoked to decide the outcome (generation
2's 30-30 tie did not change the winner, since `seed-baseline`'s best-ever fitness was already fixed
at generation 0).

**Held-out promotion-half confirmation, recorded, never gated.** The winning candidate
(`seed-baseline`'s own text) was run once over the promotion-half seeds (1404–1406, 30 fresh tasks
never seen during the search): **30/30 matched**
(scoreable 30/30). No numeric promotion threshold was
applied to this count — the frozen design pins none for the search; the count is recorded here as
held-out confirmation and nothing more.

## 3. Disclosed fact: W's text is byte-identical to B's

Because `seed-baseline` was never mutated, the search's own selected winner is the committed
baseline's own text, character for character — confirmed programmatically
(`extractAgentSystemPromptFromDefinitionFile` applied to both this file and `_b-arm-definition.md`
yields identical strings). This is a legitimate search outcome, not a build defect: §3 requires B to
be a competent, non-impoverished baseline precisely so a result like this one is even possible — the
search machinery genuinely could not find a candidate, including its own mutated lineage, that
outperformed a well-authored hand-written prompt on this task's search half. The causal-independence
ordering §3's decision-rule argument leans on is still fully honored: W's identity was fixed by this
commit before the paired battery is ever drawn, and the search never saw the battery's own seeds.
What is NOT honored, as a matter of substance rather than procedure, is any expectation that the
eventual paired round (14-06) will show a genuine search-vs-no-search difference: with textually
identical prompts driving both arms, that round's outcome is governed by model-sampling variance
alone. 14-06/14-07 should state this plainly when interpreting whatever verdict the paired round
returns, rather than reading an INDISTINGUISHABLE (or near-INDISTINGUISHABLE) result as evidence
against search in general — this run's search simply had nothing to improve on.

## 4. Agent System Prompt

The fenced block below is the literal `PairedAgentDefinition.systemPrompt` value — extracted
programmatically by the same convention `_b-arm-definition.md` uses (`extractAgentSystemPromptFromDefinitionFile`
locates this heading's marker text, then reads the single fenced block that follows it verbatim).
Nothing outside the fence is ever part of the transmitted prompt. This block is byte-identical to
`_b-arm-definition.md`'s own — see §3 above.

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
