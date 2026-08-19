/**
 * THE TICKET-FIDELITY CHECK for the customer-support instrument (Phase 14 —
 * Instrument build, Plan 14-02, REQ-68; `experiments/paired-comparison-arm/
 * PAIRED-DESIGN-PREREG.md` rev 2 §4 — the fidelity gap Plan 14-02 closes,
 * mirroring `test/fixtures/bi-question-fidelity.ts`'s own shape for the
 * BI-analytics battery).
 *
 * WHAT THIS CLOSES. Nothing in `customer-support-oracle.ts` validates that
 * the ticket text shown to a candidate actually DENOTES the resolution it
 * was composed from — a misrendered ticket (wrong facts stated, wrong
 * arithmetic direction) would leave the oracle's own extraction/match
 * contract intact while the candidate is scored against a ticket that does
 * not match the resolution defining "correct." This file builds the
 * independent second-rendering check the frozen design's §4 fidelity
 * obligation and REQ-68 require.
 *
 * IMPORT-CLEAN with respect to the generator's OWN RENDERER: this file
 * imports only TYPES from `src/foundry/customer-support-warehouse.ts` (the
 * resolution record's own shape) — the generator's ticket-rendering
 * function itself is never imported or called here. `CUSTOMER_SUPPORT_ACTION_META` and
 * `CUSTOMER_SUPPORT_ITEM_CATALOG` are duplicated below as literal data
 * rather than imported: a shared mapping object would let a mapping typo
 * canonicalize as truth on both the generator's and this fixture's paths —
 * exactly the failure `test/fixtures/bi-independence-violation.ts`'s own
 * doc comment names. Duplication IS the drift guard the sweep test proves
 * live (a mismatched copy would fail every unit, not silently agree).
 *
 * THE DISCLOSED FACT-FOOTER CONVENTION. `renderTicketIndependent` below
 * emits the SAME `[Facts: key=value; ...]` footer convention the
 * generator's own renderer emits — action-keyed, unique key names per
 * action, values are the STATED FACTS only, never the resolution's own
 * `action`/`category`/`parameter` values. This is the disclosed,
 * action-keyed convention `bi-question-fidelity.ts`'s own doc comment names
 * ("the shared FOOTER CONVENTION is the disclosed, spec-driven template
 * exposure ... not a shared helper FUNCTION"); the LEDE PROSE wrapping that
 * footer is independently authored, different wording from the generator's
 * own `coreStatement`/`TICKET_TEMPLATES`. `extractSituationFields` below
 * parses EITHER rendering (the generator's or this file's own) because both
 * emit the same footer convention — and it re-derives `action`/`category`/
 * `parameter` FRESH from the footer's facts, via this file's own
 * independently-written arithmetic/lookup, never by reading a resolution
 * value out of the ticket text (there is none to read).
 */
import type {
  CustomerSupportAction,
  CustomerSupportCategoryLabel,
  CustomerSupportResolution,
} from "../../src/foundry/customer-support-warehouse.js";

/** `FidelityAction` is `CustomerSupportAction` under a fixture-local name —
 *  the TYPE ONLY import above ("imports the resolution record from the
 *  generator") is the whole of this fixture's dependency on the generator
 *  module; nothing else, and never a value/function import. */
export type FidelityAction = CustomerSupportAction;

/** Structurally identical to `CustomerSupportResolution` — re-declared
 *  under this fixture's own name so a caller reads the return type as
 *  belonging to THIS file's own extraction logic, not a re-export of the
 *  generator's type. */
export type ExtractedSituationFields = CustomerSupportResolution;

/**
 * A SEPARATE, independently-maintained copy of the generator's own
 * action -> category pairing (`CUSTOMER_SUPPORT_ACTION_META` in
 * `customer-support-warehouse.ts`) — duplicated by VALUE, never imported.
 * If the two copies ever disagree, the fidelity sweep goes red on every
 * unit of that action, which is the whole point of keeping two copies
 * rather than one shared table.
 */
const ACTION_CATEGORY: Readonly<Record<FidelityAction, CustomerSupportCategoryLabel>> = Object.freeze({
  "adjust-charge": "order-total-discrepancy",
  "refund-duplicate-charge": "order-total-discrepancy",
  "refund-shipping-upgrade": "shipping-service-mismatch",
  "credit-late-delivery-fee": "shipping-service-mismatch",
  "ship-catalog-replacement": "missing-item",
  "escalate-repeat-defect": "product-quality",
});

/**
 * A SEPARATE, independently-maintained copy of the generator's own item
 * catalog (`CUSTOMER_SUPPORT_ITEM_CATALOG`) — duplicated by VALUE, never
 * imported, same rationale as `ACTION_CATEGORY` above.
 */
const ITEM_CATALOG: ReadonlyArray<{ sku: number; name: string }> = Object.freeze([
  { sku: 3001, name: "Blue Ceramic Mug" },
  { sku: 3002, name: "Wireless Mouse" },
  { sku: 3003, name: "Phone Case" },
  { sku: 3004, name: "Yoga Mat" },
  { sku: 3005, name: "Bluetooth Speaker" },
  { sku: 3006, name: "Desk Lamp" },
]);

function catalogNameForSku(sku: number): string {
  const entry = ITEM_CATALOG.find((e) => e.sku === sku);
  if (!entry) throw new Error(`[customer-support-ticket-fidelity] no catalog entry for sku ${sku}`);
  return entry.name;
}

function dollarsToCents(dollarString: string): number {
  return Math.round(Number(dollarString) * 100);
}

function dollar(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * A second, independently-worded rendering of `facts` for `action` — leads
 * with different sentence shape from `customer-support-warehouse.ts`'s own
 * `coreStatement`/`TICKET_TEMPLATES`, but emits the same disclosed
 * `[Facts: ...]` footer convention (see module doc comment). `facts` is the
 * SAME `CustomerSupportTicket.facts` record the generator's own ticket
 * carries — this function is a rendering of a resolution record's
 * supporting facts, never a call into the generator's own renderer.
 */
export function renderTicketIndependent(action: FidelityAction, facts: Record<string, number>): string {
  const order = facts.order!;
  let lede: string;
  const footerParts = [`order=${order}`];

  switch (action) {
    case "adjust-charge":
      lede =
        `A customer says the receipt for order ${order} lists $${dollar(facts.correct!)} as the correct total, ` +
        `yet the amount actually billed to their card was $${dollar(facts.charged!)}.`;
      footerParts.push(`charged=${dollar(facts.charged!)}`, `correct=${dollar(facts.correct!)}`);
      break;
    case "refund-duplicate-charge":
      lede =
        `Billing shows order ${order} was charged $${dollar(facts.unitCharge!)} on ${facts.chargeCount} separate ` +
        `occasions instead of once.`;
      footerParts.push(`unitCharge=${dollar(facts.unitCharge!)}`, `chargeCount=${facts.chargeCount}`);
      break;
    case "refund-shipping-upgrade":
      lede =
        `Order ${order} was billed $${dollar(facts.expressShip!)} for expedited delivery, though the carrier ` +
        `record shows the cheaper $${dollar(facts.standardShip!)} standard service was actually used.`;
      footerParts.push(`standardShip=${dollar(facts.standardShip!)}`, `expressShip=${dollar(facts.expressShip!)}`);
      break;
    case "credit-late-delivery-fee":
      lede =
        `Order ${order} showed up ${facts.daysLate} days past its promised date; the published late-delivery ` +
        `policy credits $${dollar(facts.dailyLateFee!)} for each day of delay.`;
      footerParts.push(`dailyLateFee=${dollar(facts.dailyLateFee!)}`, `daysLate=${facts.daysLate}`);
      break;
    case "ship-catalog-replacement":
      lede = `Order ${order} is missing the item catalogued under SKU ${facts.replacementSku}.`;
      footerParts.push(`replacementSku=${facts.replacementSku}`);
      break;
    case "escalate-repeat-defect":
      lede =
        `The customer on order ${order} reports SKU ${facts.defectSku} has failed inspection ` +
        `${facts.defectCount} times running.`;
      footerParts.push(`defectSku=${facts.defectSku}`, `defectCount=${facts.defectCount}`);
      break;
  }

  return `${lede} [Facts: ${footerParts.join("; ")}]`;
}

function parseFactsFooter(ticketText: string): Record<string, string> {
  const m = /\[Facts:([^\]]*)\]/.exec(ticketText);
  if (!m) throw new Error(`[customer-support-ticket-fidelity] no "[Facts: ...]" footer found in ${JSON.stringify(ticketText)}`);
  const body = m[1]!.trim();
  const out: Record<string, string> = {};
  for (const rawPair of body.split(";")) {
    const pair = rawPair.trim();
    if (pair.length === 0) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) throw new Error(`[customer-support-ticket-fidelity] malformed fact pair ${JSON.stringify(pair)}`);
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

/**
 * A STRICT extractor — throws if the footer is absent or malformed, and
 * throws on a fact-key set it does not recognize (never guesses). Re-
 * derives `action`, `category`, and `parameter` FRESH from the footer's own
 * stated facts, via this file's own independently-written arithmetic/
 * lookup — the same derivation SHAPE the generator's own
 * `computeParameter` uses, implemented separately, never called from it.
 * Works identically on either renderer's output because both emit the same
 * disclosed footer convention (module doc comment).
 */
export function extractSituationFields(ticketText: string): ExtractedSituationFields {
  const facts = parseFactsFooter(ticketText);

  if ("charged" in facts && "correct" in facts) {
    const action: FidelityAction = "adjust-charge";
    const parameter = dollar(dollarsToCents(facts.charged!) - dollarsToCents(facts.correct!));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }
  if ("unitCharge" in facts && "chargeCount" in facts) {
    const action: FidelityAction = "refund-duplicate-charge";
    const parameter = dollar(dollarsToCents(facts.unitCharge!) * (Number(facts.chargeCount) - 1));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }
  if ("standardShip" in facts && "expressShip" in facts) {
    const action: FidelityAction = "refund-shipping-upgrade";
    const parameter = dollar(dollarsToCents(facts.expressShip!) - dollarsToCents(facts.standardShip!));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }
  if ("dailyLateFee" in facts && "daysLate" in facts) {
    const action: FidelityAction = "credit-late-delivery-fee";
    const parameter = dollar(dollarsToCents(facts.dailyLateFee!) * Number(facts.daysLate));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }
  if ("replacementSku" in facts) {
    const action: FidelityAction = "ship-catalog-replacement";
    const parameter = catalogNameForSku(Number(facts.replacementSku));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }
  if ("defectSku" in facts) {
    const action: FidelityAction = "escalate-repeat-defect";
    const parameter = catalogNameForSku(Number(facts.defectSku));
    return { action, category: ACTION_CATEGORY[action], parameter };
  }

  throw new Error(`[customer-support-ticket-fidelity] unrecognized fact key set: ${JSON.stringify(Object.keys(facts))}`);
}
