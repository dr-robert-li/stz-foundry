# B — the baseline, hand-written agent definition

## 0. Override framing

This definition, and the paired-comparison instrument it belongs to, is produced under the
2026-08-11 human override by Dr. Robert Li as v1.25.0 follow-on work. It is not a Stage-B trigger
outcome, not a retroactive pass of the gate that recorded NOT-MET
(`20*(19-17)=40 < 3*24=72`, `experiments/dualfix-study/STUDY-RESULTS.md`), and not a continuation of
milestone v1.24.0, whose terminal record stays untouched and read-only. Phase 14 exists only because
Dr. Li explicitly directed reopening Phases 13/14, overriding the VOID-BY-RULE closure the Stage-B
miss would otherwise have produced — this document states that plainly, in its own words, rather
than as a footnote.

## 1. What B is, per `PAIRED-DESIGN-PREREG.md` rev 2 §3

B is **the baseline unevolved agent definition** — the same underlying model, run against the same
battery, with no search, no mutation, and no tournament selection applied: the configuration a human
would hand-write without running the component-tournament machinery at all. §3 states the standard
explicitly: B must be "the best a human would write without the tournament, not the worst" — ordinary
competitive human prompt-engineering effort, not a first-draft minimum. §3 also names, and rejects,
the alternative of an s0-minimal floor arm (the deliberately impoverished prompt `BI-BATTERY-DESIGN.md`
§6 uses for a different instrument): that alternative tests prompt-engineering floor behaviour, not
the "unevolved baseline" identity this phase actually measures, and a weak B would inflate a
W-superior verdict for a reason the frozen design disclaims in advance.

**Author:** Dr. Robert Li (dr-robert-li), acting as the human prompt engineer this arm's identity
requires — hand-writing this definition without running any search.
**Date:** 2026-08-19.

## 2. Authoring rationale

The task the operative prompt below must cover is `customer-support-warehouse.ts`'s full six-action,
four-category taxonomy (`test/foundry-customer-support-generator.test.ts`), scored by
`customer-support-oracle.ts`'s strict three-field extraction-and-match contract
(`RESOLUTION_FIELD_LABELS`: `action`, `category`, `parameter`) — normalized-equality only, no partial
credit, no synonym tolerance. Three properties of that contract drove every substantive choice below,
each recorded so the comparison this SUMMARY draws against the winner's own structure has something
concrete to compare:

1. **Both closed vocabularies must be reproduced verbatim.** The oracle's `normalizeField` collapses
   case and whitespace but performs no stemming or synonym mapping — the six actions and four
   categories are stated in full, in the exact spelling the generator itself uses
   (`CUSTOMER_SUPPORT_ACTIONS` / `CUSTOMER_SUPPORT_CATEGORIES`), never paraphrased.
2. **The `parameter` field is two structurally different tasks wearing one field name, and a prompt
   that only covers one collapses to guessing on the other.** Four actions declare a `monetary`
   parameter (an arithmetic derivation over stated dollar facts); two — `ship-catalog-replacement`
   and `escalate-repeat-defect` — declare a `lookup` parameter (a catalog item's NAME, reachable only
   by cross-referencing a stated SKU number against a published catalog the ticket never states the
   name from). `_ceiling-probe.ts`'s own real run against this model found the `normal`-mode arm
   correctly identified `action`/`category` on every ticket but the derived `parameter` on zero of
   ten — the parameter derivation, not the vocabulary, is the whole difficulty surface. Omitting
   guidance for either parameter type — most concretely, omitting the six-row item catalog itself —
   would leave roughly a third of the action space (the two `lookup` actions) unreachable by
   construction, which is precisely the impoverished-baseline failure mode §3 rejects: a B this weak
   would inflate any W-superior verdict for a reason that has nothing to do with search.
3. **The output format is a hard three-line contract, not a suggestion.** A response the oracle
   cannot parse into exactly one value per label scores `non-scoreable`, identically to a wrong
   answer — so the operative prompt states the format as an unconditional instruction ("no other
   text"), not merely a preference, mirroring the wording `_paired-arms.ts`'s `buildPairedTaskPrompt`
   and `_ceiling-probe.ts`'s `buildProbePrompt` already use for the same contract.

One further point of design discipline: `_paired-arms.ts`'s `runArmOnPairingUnit` sends only
`agentDefinition.systemPrompt` as the chat `system` message — `buildPairedTaskPrompt`'s own `system`
return (which restates the vocabularies and format contract) is never actually transmitted for either
arm (confirmed in `14-04-SUMMARY.md`'s "Logged, not fixed" note, `.planning/WINDOWS.md` entry 3). That
means the operative prompt below is not a supplement to a contract stated elsewhere — it IS the whole
contract the model receives. Every vocabulary, every format requirement, and the full item catalog are
therefore stated inside it directly, never assumed to arrive from `buildPairedTaskPrompt`.

Worked reasoning guidance is included (state the derivation, then answer) because the extraction
contract reads only the final three labelled lines — a chain of reasoning ahead of them is free real
estate for correctness as long as the format contract's own "no other text" constraint is read as
applying to the final answer block, which the prompt below states explicitly to avoid an ambiguous
read.

## 3. Agent System Prompt

The fenced block below is the literal `PairedAgentDefinition.systemPrompt` value — extracted
programmatically by `_w-search.ts`'s `extractAgentSystemPromptFromDefinitionFile` (and, at the real
paired round, by 14-06's driver) by locating this exact heading and reading the single fenced block
that follows it verbatim. Nothing outside the fence is ever part of the transmitted prompt.

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
