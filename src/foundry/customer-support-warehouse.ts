/**
 * The customer-support answer-first ticket generator (Phase 14 — Instrument
 * build, Plan 14-01, REQ-68; `experiments/paired-comparison-arm/
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
 */
import { mulberry32 } from "../harness.js";

/**
 * This generator family and revision's own id, mirroring how
 * `BI_ANALYTICS_GENERATOR_ID` names itself — declared here, never added to
 * `ACCEPTED_GENERATORS`. One action/category pair and one rendering
 * template today (the tracer slice); Plan 14-02 expands both vocabularies
 * and templates without renaming this id.
 */
export const CUSTOMER_SUPPORT_GENERATOR_ID = "customer-support-replay-checkable-generator-v1";

/**
 * The closed action vocabulary — shown VERBATIM to both arm slots in the
 * identical task prompt, so an arm never has to guess the allowed label
 * wording. One entry for the tracer; Plan 14-02 adds siblings without
 * renaming this export.
 */
export const CUSTOMER_SUPPORT_ACTIONS = Object.freeze(["adjust-charge"] as const);
export type CustomerSupportAction = (typeof CUSTOMER_SUPPORT_ACTIONS)[number];

/** The closed category vocabulary — shown verbatim alongside the action
 *  vocabulary above, same rationale. */
export const CUSTOMER_SUPPORT_CATEGORIES = Object.freeze(["order-total-discrepancy"] as const);
export type CustomerSupportCategoryLabel = (typeof CUSTOMER_SUPPORT_CATEGORIES)[number];

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
 *  against. `parameter`'s type is fixed by `action`; for `adjust-charge` it
 *  is a dollar amount, formatted `12.50`-style, two decimal places. */
export interface CustomerSupportResolution {
  action: CustomerSupportAction;
  category: CustomerSupportCategoryLabel;
  parameter: string;
}

export interface CustomerSupportTicket {
  seed: number;
  taskIndex: number;
  resolution: CustomerSupportResolution;
  /** The customer-facing ticket text — rendered from the resolution's own
   *  semantics, AFTER the resolution above is fully composed. Never states
   *  the resolution's three field values verbatim; states only the facts
   *  those values are computed FROM, so an arm has to do the derivation
   *  this task exists to measure. */
  ticketText: string;
}

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Deterministic seeded ticket generation: `generateCustomerSupportTicket(seed, 0)`
 * called twice returns byte-identical output (a pure function of its two
 * integer arguments, no clock/random/env read anywhere). `taskIndex` is
 * folded into the mulberry32 seed itself (`seed * 1000 + taskIndex`) so
 * every task index within a seed draws its own independent stream, never
 * one shared stream advanced across tasks — mirroring the house rule every
 * draw is UNCONDITIONAL so stream length never depends on a branch.
 */
export function generateCustomerSupportTicket(seed: number, taskIndex: number): CustomerSupportTicket {
  const rng = mulberry32(seed * 1000 + taskIndex);

  // Composed FIRST — the ground truth exists before any ticket text.
  const action = CUSTOMER_SUPPORT_ACTIONS[Math.floor(rng() * CUSTOMER_SUPPORT_ACTIONS.length)]!;
  const category = CUSTOMER_SUPPORT_CATEGORIES[Math.floor(rng() * CUSTOMER_SUPPORT_CATEGORIES.length)]!;

  // The two facts the customer's own receipt states — both rendered into
  // the ticket text below. The resolution's own parameter (the correction
  // amount) is their difference, computed here but never itself stated in
  // the rendered text — an arm must derive it from the two facts shown.
  const chargedCents = 1000 + Math.floor(rng() * 9000); // $10.00 – $99.99
  const discrepancyCents = 100 + Math.floor(rng() * 4900); // $1.00 – $49.99
  const correctCents = chargedCents - discrepancyCents;
  const orderNumber = 100000 + Math.floor(rng() * 900000);

  const parameter = centsToDollarString(discrepancyCents);
  const resolution: CustomerSupportResolution = { action, category, parameter };

  // Rendered SECOND, from the resolution's own semantics — never quotes
  // `action`, `category`, or `parameter`'s own literal values (the leak
  // check Plan 14-02 formalizes; this rendering is already written to
  // satisfy it: only the charged/correct amounts and the order number
  // appear, never the discrepancy itself and never the vocabulary words
  // themselves).
  const ticketText =
    `Order #${orderNumber}: I was charged $${centsToDollarString(chargedCents)} for this order, but the ` +
    `receipt attached to my confirmation email shows the total should have been $${centsToDollarString(correctCents)}. ` +
    `Could someone please look into this and correct the amount on my account?`;

  return { seed, taskIndex, resolution, ticketText };
}
