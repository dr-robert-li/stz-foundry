/**
 * THE INDEPENDENT REFERENCE INTERPRETER for the v3 data-ops battery
 * (`experiments/dataops-agent-pilot/V3-BATTERY-DESIGN.md` rev 2, change S2 —
 * the cross-AI panel's strongest novel finding, from gpt-sol-pro C1).
 *
 * WHAT IT IS FOR. Answer-first construction protects one direction: because
 * the `WarehouseFact` is drawn from the PRNG before any row exists, no row can
 * talk the answer key into agreeing with it. It does NOT protect the other
 * direction — a derivation bug in the generator (an off-by-one in which orders
 * a refund cancels, a conflict decoy that accidentally wins the tie rule)
 * produces a stored fact that a CORRECT solver following the published rules
 * would never reproduce. The battery would then be scoring candidates against
 * an answer key that is wrong, and every downstream number would be garbage in
 * a way no amount of seed-sweeping the generator against itself could reveal.
 *
 * THE RULE THAT MAKES IT WORTH ANYTHING: this file shares NO helper, NO
 * constant and NO type with `src/foundry/fixture-warehouse-v3.ts`. It imports
 * nothing from it. It is written from the PUBLISHED RULE TEXT and the EMITTED
 * CSV — the same two things a candidate gets — and it recomputes every fact
 * from scratch. A common helper would let one bug produce two agreeing wrong
 * answers, which is exactly the failure this exists to catch. If you are
 * tempted to import a parser from the generator to remove the duplication:
 * that duplication IS the mechanism. Do not.
 *
 * Deliberately implemented in a different shape from the generator as well —
 * a single streaming reduce over parsed rows into a `Map` keyed by orderId,
 * rather than the generator's plan-then-derive two-pass — so a shared
 * structural misreading is less likely to survive in both.
 */

/** The six-step pipeline's output for one (customer, payment-month) group. */
export interface RecomputedFact {
  orderCount: number;
  revenueCents: number;
}

interface ParsedRow {
  orderId: string;
  customerId: string;
  type: string;
  origOrderId: string;
  paymentDate: string;
  updatedAt: string;
  amountCents: number;
}

/**
 * Step 1's amount parsing. The published rules say nothing about amount
 * formats — that is the frozen v2 messiness a candidate must discover — so
 * this handles what the CSV actually contains: bare cents, dollars, dollars
 * with a `$`, any of them signed, and the value carried in `amountBackup`
 * whenever `rawAmount` is empty.
 *
 * A dollars rendering is recognised by the decimal point, not by the `$`:
 * `123.45` and `$123.45` are the same quantity, and `12345` is not.
 */
function parseAmountCents(rawAmount: string, amountBackup: string): number {
  const source = rawAmount.trim() !== "" ? rawAmount.trim() : amountBackup.trim();
  if (source === "") return 0;
  const negative = source.startsWith("-");
  const digits = source.replace(/^-/, "").replace(/^\$/, "");
  const magnitude = digits.includes(".")
    ? Math.round(Number.parseFloat(digits) * 100)
    : Number.parseInt(digits, 10);
  if (!Number.isFinite(magnitude)) {
    throw new Error(`[v3-reference-interpreter] unparseable amount ${JSON.stringify(source)}`);
  }
  return negative ? -magnitude : magnitude;
}

/**
 * Parse the emitted CSV by HEADER NAME, never by column position — the v3
 * schema drops `type`/`origOrderId` at grid points with L2 off and `orderDate`
 * at grid points with L3 off, and a positional reader would silently misread
 * every row at four of the five grid points.
 *
 * A missing `type` column means every row is an order (the L2-off schema), and
 * a missing `origOrderId` means no row references another.
 */
function parseCsv(csv: string): ParsedRow[] {
  const lines = csv.trim().split("\n");
  const header = lines[0]!.split(",").map((h) => h.trim());
  const at = (cells: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx === -1 ? "" : (cells[idx] ?? "").trim();
  };
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const type = at(cells, "type");
    return {
      orderId: at(cells, "orderId"),
      customerId: at(cells, "customerId"),
      type: type === "" ? "order" : type,
      origOrderId: at(cells, "origOrderId"),
      paymentDate: at(cells, "paymentDate"),
      updatedAt: at(cells, "updatedAt"),
      amountCents: parseAmountCents(at(cells, "rawAmount"), at(cells, "amountBackup")),
    };
  });
}

/**
 * Run the published six-step pipeline over the emitted CSV and return what a
 * correct solver would answer for one (customer, payment-month) group.
 *
 * The steps, in the order the task prompt states them:
 *   2. rows sharing `orderId` collapse to one — latest `updatedAt` wins; a tie
 *      on `updatedAt` is broken by the largest amount. ISO dates with no time
 *      component compare correctly as plain strings, which is why the design
 *      made them ISO-only.
 *   3. attribute by `paymentDate` (`orderDate`, where present, is never read —
 *      this function does not even extract that column).
 *   4. filter to the requested customer and payment month.
 *   5. a refund/adjustment counts only if its `origOrderId` names an order in
 *      the set that SURVIVED steps 2-4 — evaluated against that set, not
 *      against every orderId in the file.
 *   6. `orderCount` counts surviving `order` rows; `revenueCents` is their
 *      total, less valid refunds, plus signed valid adjustments.
 */
export function recomputeFact(csv: string, customerId: string, month: string): RecomputedFact {
  // Step 2 — one winner per orderId, decided over the WHOLE file before any
  // filtering, because duplicate resolution precedes attribution.
  const winners = new Map<string, ParsedRow>();
  for (const row of parseCsv(csv)) {
    const held = winners.get(row.orderId);
    if (
      held === undefined ||
      row.updatedAt > held.updatedAt ||
      (row.updatedAt === held.updatedAt && row.amountCents > held.amountCents)
    ) {
      winners.set(row.orderId, row);
    }
  }

  // Steps 3 and 4 — bucket by `paymentDate`'s month, keep this customer's.
  const surviving = [...winners.values()].filter(
    (row) => row.customerId === customerId && row.paymentDate.slice(0, 7) === month,
  );

  // Step 5 — the surviving ORDER ids are what a reference may resolve against.
  const survivingOrderIds = new Set(
    surviving.filter((row) => row.type === "order").map((row) => row.orderId),
  );

  // Step 6.
  let orderCount = 0;
  let revenueCents = 0;
  for (const row of surviving) {
    if (row.type === "order") {
      orderCount += 1;
      revenueCents += row.amountCents;
    } else if (survivingOrderIds.has(row.origOrderId)) {
      revenueCents += row.type === "refund" ? -row.amountCents : row.amountCents;
    }
  }
  return { orderCount, revenueCents };
}
