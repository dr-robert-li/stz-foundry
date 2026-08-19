/**
 * The customer-support answer-first ticket generator (Phase 14 — Instrument
 * build, Plans 14-01/14-02, REQ-68; `experiments/paired-comparison-arm/
 * PAIRED-DESIGN-PREREG.md` rev 2 §4 — FROZEN, the pre-registration of record
 * for this whole module). Where this file and the design differ, the design
 * wins; the divergence is a bug here, never a reinterpretation of the doc.
 *
 * ANSWER-FIRST, in `bi-warehouse.ts`'s own sense: the known-correct
 * resolution is composed FIRST, from the seeded stream, before any ticket
 * text exists — the ticket's customer-facing question is then rendered FROM
 * that resolution's own semantics, so ground truth never depends on, or is
 * influenced by, either arm's own attempt.
 *
 * This module never constructs an `OracleReceipt` or a branded battery
 * value, and its generator id (below) is DELIBERATELY ABSENT from
 * `ACCEPTED_GENERATORS` (`fixture-warehouse.ts`) — it is never added there
 * by this phase (PD-1, `14-01-PLAN.md`). This file references nothing from
 * `fixture-warehouse.ts` and nothing from `battery-types.ts`; a ticket is
 * built through this module's own direct function, never a
 * `generateXBattery`-style wrapper.
 *
 * Plan 14-02 expands 14-01's tracer (one action/category/template) into the
 * full taxonomy: six actions across four categories, three rendering
 * templates drawn INDEPENDENTLY of category (the concrete defence against
 * the asymmetric tell-exploitation exposure the frozen design discloses,
 * F-32 — a category cannot be inferred from which template wraps a ticket,
 * because any template can wrap any category). Every action's own
 * resolution-specific `parameter` stays derivable-but-unstated: the ticket
 * states the facts the parameter is computed FROM, never the parameter
 * itself. This is the whole difficulty surface of the task — if the
 * parameter were stated, both arms would score identically and the
 * discordant population would collapse below the frozen floor.
 */
import { mulberry32 } from "../harness.js";

/**
 * This generator family and revision's own id, mirroring how
 * `BI_ANALYTICS_GENERATOR_ID` names itself — declared here, never added to
 * `ACCEPTED_GENERATORS`.
 */
export const CUSTOMER_SUPPORT_GENERATOR_ID = "customer-support-replay-checkable-generator-v1";

/**
 * The closed action vocabulary — shown VERBATIM to both arm slots in the
 * identical task prompt, so an arm never has to guess the allowed label
 * wording. Six actions, spread across four categories (below) — the full
 * taxonomy Plan 14-02 builds.
 */
export const CUSTOMER_SUPPORT_ACTIONS = Object.freeze([
  "adjust-charge",
  "refund-duplicate-charge",
  "refund-shipping-upgrade",
  "credit-late-delivery-fee",
  "ship-catalog-replacement",
  "escalate-repeat-defect",
] as const);
export type CustomerSupportAction = (typeof CUSTOMER_SUPPORT_ACTIONS)[number];

/** The closed category vocabulary — shown verbatim alongside the action
 *  vocabulary above, same rationale. Four categories; several actions may
 *  share one category (many-to-one), but each action pairs with exactly
 *  one, per `CUSTOMER_SUPPORT_ACTION_META` below. */
export const CUSTOMER_SUPPORT_CATEGORIES = Object.freeze([
  "order-total-discrepancy",
  "shipping-service-mismatch",
  "missing-item",
  "product-quality",
] as const);
export type CustomerSupportCategoryLabel = (typeof CUSTOMER_SUPPORT_CATEGORIES)[number];

/** The two declared resolution-parameter shapes an action can carry (task 1
 *  behavior: "each action declaring the type of its resolution-specific
 *  parameter"). `monetary` — a dollar amount computed by arithmetic over
 *  two stated facts (subtraction or a unit-times-count multiplication).
 *  `lookup` — a catalog item's name, selected by a stated SKU fact that is
 *  never itself the item's name. */
export type CustomerSupportParameterType = "monetary" | "lookup";

/** Action -> {category, parameter type} — the fixed pairing table task 1's
 *  wellformedness assertion sweeps ("each of the closed action values pairs
 *  with exactly one category and one declared parameter type"). Pure
 *  declarative data, read by this module's own rendering switch below;
 *  `test/fixtures/customer-support-ticket-fidelity.ts` keeps its OWN
 *  independently-typed copy of this same pairing rather than importing it —
 *  a shared mapping object would let a mapping typo canonicalize as truth
 *  on both the generator's and the fixture's paths, exactly the failure
 *  `test/fixtures/bi-independence-violation.ts`'s own doc comment names. */
export const CUSTOMER_SUPPORT_ACTION_META: Readonly<
  Record<CustomerSupportAction, { category: CustomerSupportCategoryLabel; parameterType: CustomerSupportParameterType }>
> = Object.freeze({
  "adjust-charge": { category: "order-total-discrepancy", parameterType: "monetary" },
  "refund-duplicate-charge": { category: "order-total-discrepancy", parameterType: "monetary" },
  "refund-shipping-upgrade": { category: "shipping-service-mismatch", parameterType: "monetary" },
  "credit-late-delivery-fee": { category: "shipping-service-mismatch", parameterType: "monetary" },
  "ship-catalog-replacement": { category: "missing-item", parameterType: "lookup" },
  "escalate-repeat-defect": { category: "product-quality", parameterType: "lookup" },
});

/** The closed item catalog the two `lookup`-typed actions select from by
 *  SKU. A ticket states only the SKU number (a fact); the item's NAME is
 *  never stated anywhere in the ticket text — it is the parameter the arm
 *  must look up, exactly the leak check's own rule (T-14-05). */
export const CUSTOMER_SUPPORT_ITEM_CATALOG: ReadonlyArray<{ sku: number; name: string }> = Object.freeze([
  { sku: 3001, name: "Blue Ceramic Mug" },
  { sku: 3002, name: "Wireless Mouse" },
  { sku: 3003, name: "Phone Case" },
  { sku: 3004, name: "Yoga Mat" },
  { sku: 3005, name: "Bluetooth Speaker" },
  { sku: 3006, name: "Desk Lamp" },
]);

function catalogNameForSku(sku: number): string {
  const entry = CUSTOMER_SUPPORT_ITEM_CATALOG.find((e) => e.sku === sku);
  if (!entry) throw new Error(`[customer-support-warehouse] no catalog entry for sku ${sku}`);
  return entry.name;
}

/**
 * The three extraction-contract field-name literals, pinned once here so
 * `customer-support-oracle.ts` reads the SAME label names this module's own
 * prompt-building step (`_paired-arms.ts`) publishes — the one thing the
 * oracle module is permitted to reference from this file (§4's
 * zero-shared-helpers rule: nothing else crosses that boundary).
 */
export const RESOLUTION_FIELD_LABELS = Object.freeze(["action", "category", "parameter"] as const);
export type ResolutionFieldLabel = (typeof RESOLUTION_FIELD_LABELS)[number];

/** The resolution's three structured fields, composed FIRST from the
 *  seeded stream — §4's defining structured fact a proposal is matched
 *  against. `parameter`'s shape is fixed by `action`
 *  (`CUSTOMER_SUPPORT_ACTION_META`): a dollar amount (two decimal places)
 *  for `monetary` actions, a catalog item name for `lookup` actions. */
export interface CustomerSupportResolution {
  action: CustomerSupportAction;
  category: CustomerSupportCategoryLabel;
  parameter: string;
}

export interface CustomerSupportTicket {
  seed: number;
  taskIndex: number;
  resolution: CustomerSupportResolution;
  /** The raw facts the ticket states (cents-valued for money facts, plain
   *  integers for counts/SKUs/the order number) — exposed so
   *  `test/fixtures/customer-support-ticket-fidelity.ts` can independently
   *  re-render a ticket "from a resolution record" without importing this
   *  module's own renderer (task 1). Never itself the resolution's
   *  `parameter` value. */
  facts: Record<string, number>;
  /** Which of `TICKET_TEMPLATES` rendered this ticket — drawn
   *  INDEPENDENTLY of `resolution.category` (F-32). Exposed so the
   *  template-independence sweep can group by template without re-deriving
   *  it from the rendered text. */
  templateIndex: number;
  /** The customer-facing ticket text — rendered from the resolution's own
   *  semantics, AFTER the resolution above is fully composed. Never states
   *  the resolution's three field values verbatim; states only the facts
   *  those values are computed FROM (or, for `lookup` actions, an
   *  identifying SKU distinct from the item's own name), so an arm has to
   *  do the derivation this task exists to measure. */
  ticketText: string;
}

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Draws this action's own facts, unconditionally (a straight-line
 *  function per action — no branch on a drawn value decides how many more
 *  draws follow, mirroring the house rule the tracer's own fix comment
 *  states: stream length for a GIVEN action never depends on an
 *  intermediate result). Ranges are chosen so `computeParameter` below can
 *  never equal a stated fact for that same draw (see the per-action proof
 *  in `14-02-SUMMARY.md`) — the leak check's guarantee is structural, not
 *  merely empirically observed on the pinned seeds. */
function drawFacts(action: CustomerSupportAction, rng: () => number): Record<string, number> {
  switch (action) {
    case "adjust-charge": {
      // correct in [2000,9999], discrepancy in [100,999] — ranges strictly
      // disjoint (999 < 2000), so the parameter (discrepancy) can never
      // equal either stated fact.
      const correct = 2000 + Math.floor(rng() * 8000);
      const discrepancy = 100 + Math.floor(rng() * 900);
      const charged = correct + discrepancy;
      return { charged, correct };
    }
    case "refund-duplicate-charge": {
      // parameter = unitCharge * (chargeCount - 1); chargeCount >= 3 means
      // the multiplier is >= 2, so parameter > unitCharge always (strict).
      const unitCharge = 500 + Math.floor(rng() * 1000);
      const chargeCount = 3 + Math.floor(rng() * 4);
      return { unitCharge, chargeCount };
    }
    case "refund-shipping-upgrade": {
      // standardShip in [500,999], expressShip in [2500,3999]. parameter =
      // expressShip - standardShip; parameter == standardShip would need
      // expressShip == 2*standardShip <= 1998, below expressShip's floor of
      // 2500 — impossible. parameter == expressShip would need
      // standardShip == 0 — impossible (floor 500).
      const standardShip = 500 + Math.floor(rng() * 500);
      const expressShip = 2500 + Math.floor(rng() * 1500);
      return { standardShip, expressShip };
    }
    case "credit-late-delivery-fee": {
      // parameter = dailyLateFee * daysLate, daysLate >= 2, so parameter >
      // dailyLateFee always (strict), same proof shape as duplicate-charge.
      const dailyLateFee = 300 + Math.floor(rng() * 700);
      const daysLate = 2 + Math.floor(rng() * 5);
      return { dailyLateFee, daysLate };
    }
    case "ship-catalog-replacement": {
      const idx = Math.floor(rng() * CUSTOMER_SUPPORT_ITEM_CATALOG.length);
      return { replacementSku: CUSTOMER_SUPPORT_ITEM_CATALOG[idx]!.sku };
    }
    case "escalate-repeat-defect": {
      const idx = Math.floor(rng() * CUSTOMER_SUPPORT_ITEM_CATALOG.length);
      const defectCount = 2 + Math.floor(rng() * 3);
      return { defectSku: CUSTOMER_SUPPORT_ITEM_CATALOG[idx]!.sku, defectCount };
    }
  }
}

/** This module's own derivation of `resolution.parameter` from the drawn
 *  facts — arithmetic for `monetary` actions, a catalog lookup for `lookup`
 *  actions. Never stated directly in the rendered ticket text (leak
 *  check). */
function computeParameter(action: CustomerSupportAction, facts: Record<string, number>): string {
  switch (action) {
    case "adjust-charge":
      return centsToDollarString(facts.charged! - facts.correct!);
    case "refund-duplicate-charge":
      return centsToDollarString(facts.unitCharge! * (facts.chargeCount! - 1));
    case "refund-shipping-upgrade":
      return centsToDollarString(facts.expressShip! - facts.standardShip!);
    case "credit-late-delivery-fee":
      return centsToDollarString(facts.dailyLateFee! * facts.daysLate!);
    case "ship-catalog-replacement":
      return catalogNameForSku(facts.replacementSku!);
    case "escalate-repeat-defect":
      return catalogNameForSku(facts.defectSku!);
  }
}

/** The action-specific narrative clause — states the facts, never the
 *  vocabulary words `action`/`category`/`parameter` values themselves and
 *  never the computed parameter. */
function coreStatement(action: CustomerSupportAction, facts: Record<string, number>): string {
  switch (action) {
    case "adjust-charge":
      return (
        `I was charged $${centsToDollarString(facts.charged!)} for this order, but the receipt attached to my ` +
        `confirmation email shows the total should have been $${centsToDollarString(facts.correct!)}.`
      );
    case "refund-duplicate-charge":
      return `I was charged $${centsToDollarString(facts.unitCharge!)} for this order ${facts.chargeCount} separate times.`;
    case "refund-shipping-upgrade":
      return (
        `I paid $${centsToDollarString(facts.expressShip!)} for express shipping, but the tracking shows it was ` +
        `sent using standard shipping instead, which only costs $${centsToDollarString(facts.standardShip!)}.`
      );
    case "credit-late-delivery-fee":
      return (
        `Your stated policy credits $${centsToDollarString(facts.dailyLateFee!)} for every day an order arrives ` +
        `late, and my order arrived ${facts.daysLate} days after the promised date.`
      );
    case "ship-catalog-replacement":
      return `The item with SKU #${facts.replacementSku} never arrived in my package.`;
    case "escalate-repeat-defect":
      return `The item with SKU #${facts.defectSku} has now arrived defective ${facts.defectCount} times in a row.`;
  }
}

/** The disclosed, action-keyed fact footer both this renderer and
 *  `test/fixtures/customer-support-ticket-fidelity.ts`'s independent
 *  renderer emit — the shared CONVENTION (never a shared function) the BI
 *  fidelity fixture's own doc comment names: "the disclosed, spec-driven
 *  template exposure design ... is not a shared helper FUNCTION." Key
 *  names are unique per action so an extractor can dispatch on which keys
 *  are present without ever reading `action`/`category` literals. */
function factsFooter(action: CustomerSupportAction, facts: Record<string, number>, orderNumber: number): string {
  const parts = [`order=${orderNumber}`];
  switch (action) {
    case "adjust-charge":
      parts.push(`charged=${centsToDollarString(facts.charged!)}`, `correct=${centsToDollarString(facts.correct!)}`);
      break;
    case "refund-duplicate-charge":
      parts.push(`unitCharge=${centsToDollarString(facts.unitCharge!)}`, `chargeCount=${facts.chargeCount}`);
      break;
    case "refund-shipping-upgrade":
      parts.push(`standardShip=${centsToDollarString(facts.standardShip!)}`, `expressShip=${centsToDollarString(facts.expressShip!)}`);
      break;
    case "credit-late-delivery-fee":
      parts.push(`dailyLateFee=${centsToDollarString(facts.dailyLateFee!)}`, `daysLate=${facts.daysLate}`);
      break;
    case "ship-catalog-replacement":
      parts.push(`replacementSku=${facts.replacementSku}`);
      break;
    case "escalate-repeat-defect":
      parts.push(`defectSku=${facts.defectSku}`, `defectCount=${facts.defectCount}`);
      break;
  }
  return `Facts: ${parts.join("; ")}`;
}

/** Three rendering templates — different lede/closer prose wrapping the
 *  SAME core statement + facts footer. Deliberately category-agnostic
 *  wrapper text: nothing in the template selection or its wording depends
 *  on which category the ticket belongs to (F-32's own mitigation). */
const TICKET_TEMPLATES: ReadonlyArray<(orderNumber: number, core: string, footer: string) => string> = [
  (orderNumber, core, footer) =>
    `Order #${orderNumber}: ${core} Could someone please look into this and correct my account? [${footer}]`,
  (orderNumber, core, footer) =>
    `Hi, I'm reaching out about order #${orderNumber}. ${core} Thanks for your help. [${footer}]`,
  (orderNumber, core, footer) =>
    `Support ticket regarding order #${orderNumber} — ${core} Please resolve at your earliest convenience. [${footer}]`,
];

/**
 * Deterministic seeded ticket generation: `generateCustomerSupportTicket(seed, 0)`
 * called twice returns byte-identical output (a pure function of its two
 * integer arguments, no clock/random/env read anywhere). `taskIndex` is
 * folded into the mulberry32 seed itself (`seed * 1000 + taskIndex`) so
 * every task index within a seed draws its own independent stream, never
 * one shared stream advanced across tasks.
 *
 * Composition order: action first (from which category and parameter type
 * follow, via `CUSTOMER_SUPPORT_ACTION_META` — never a separate category
 * draw), then that action's own facts, then the order number, then the
 * TEMPLATE — drawn last and INDEPENDENTLY of category, so template choice
 * carries no category signal (F-32).
 */
export function generateCustomerSupportTicket(seed: number, taskIndex: number): CustomerSupportTicket {
  const rng = mulberry32(seed * 1000 + taskIndex);

  // Composed FIRST — the ground truth exists before any ticket text.
  const action = CUSTOMER_SUPPORT_ACTIONS[Math.floor(rng() * CUSTOMER_SUPPORT_ACTIONS.length)]!;
  const category = CUSTOMER_SUPPORT_ACTION_META[action].category;
  const facts = drawFacts(action, rng);
  const orderNumber = 100000 + Math.floor(rng() * 900000);
  // Drawn independently of category/action content — the F-32 mitigation.
  const templateIndex = Math.floor(rng() * TICKET_TEMPLATES.length);

  const parameter = computeParameter(action, facts);
  const resolution: CustomerSupportResolution = { action, category, parameter };

  const core = coreStatement(action, facts);
  const footer = factsFooter(action, facts, orderNumber);
  const ticketText = TICKET_TEMPLATES[templateIndex]!(orderNumber, core, footer);

  return { seed, taskIndex, resolution, facts: { ...facts, order: orderNumber }, templateIndex, ticketText };
}
