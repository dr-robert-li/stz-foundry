/**
 * THE INDEPENDENT REFERENCE INTERPRETER for the BI-analytics battery
 * (Phase 8 — Admission + build, Plan 08-01, REQ-52;
 * `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` rev 2 §3 — the
 * panel's strongest novel finding, F-22).
 *
 * WHAT IT IS FOR. Answer-first construction protects one direction: the
 * generator's `precomputed` result is composed and executed BEFORE any
 * candidate sees the question, so no candidate response can talk the
 * answer key into agreeing with it. It does NOT protect the other
 * direction — a derivation bug in `composeReferenceSql`/`generateBiWarehouse`
 * (a wrong join key, an off-by-one month boundary) would produce a
 * `precomputed` result set that a CORRECT solver following the published
 * schema would never reproduce. Every downstream number would then be
 * garbage in a way no amount of seed-sweeping the generator against ITSELF
 * could reveal.
 *
 * THE RULE THAT MAKES IT WORTH ANYTHING: this file imports NOTHING from
 * `src/foundry/bi-warehouse.ts` or `src/foundry/bi-oracle.ts` — not a
 * helper, not a constant, and not a type. It declares its own duck types
 * for the warehouse arrays and the spec, and it never touches
 * the SQL engine: it walks the raw fact/dimension arrays directly and
 * recomputes the same fact by an independently written implementation — a
 * single streaming reduce over the fact rows into a keyed `Map`, a
 * DIFFERENT shape from the generator's compose-SQL-then-execute. If you are
 * tempted to import a helper from the generator to remove the duplication
 * below: that duplication IS the mechanism. Do not.
 *
 * THE INDEPENDENCE SCOPE, precisely (design §3 F-21, quoted so it is not
 * over- or under-built): this is scoped to the COMPUTATION IMPLEMENTATION
 * only — it does NOT cover the shared structural TEMPLATE. The same
 * grid-point definition drives both the reference query's construction and
 * this interpreter's replication of its intended logic (both read the same
 * `spec.filter`/`spec.groupBy`/`spec.aggregate`/`spec.projection` shape);
 * that is a separately disclosed exposure, not something "share zero
 * helper functions" claims to close. What this file's independence DOES
 * mean: it still reads the same seed's warehouse generation state, but the
 * COMPUTATION over that state is written from scratch here.
 */

interface DuckFactOrder {
  orderId: string;
  customerId: number;
  productId: number;
  regionId: number;
  orderDate: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

interface DuckCustomer {
  customerId: number;
  customerName: string;
  segment: string;
  regionId: number;
}

interface DuckProduct {
  productId: number;
  productName: string;
  category: string;
  unitCost: number;
}

/** Duck-typed warehouse state — structurally compatible with
 *  `BiWarehouse`, never imported from it. */
export interface DuckWarehouseState {
  factOrders: DuckFactOrder[];
  dimCustomers: DuckCustomer[];
  dimProducts: DuckProduct[];
}

interface DuckFilter {
  column: string;
  op: string;
  value: string;
}

interface DuckAggregate {
  fn: string;
  column: string;
  alias: string;
}

/** Duck-typed spec — structurally compatible with `BiQuerySpec`, never
 *  imported from it. */
export interface DuckQuerySpec {
  tables: string[];
  filter: DuckFilter;
  groupBy: string[] | null;
  aggregate: DuckAggregate | null;
  projection: string[];
}

export type RecomputedRow = Record<string, string | number>;

export interface RecomputedResult {
  columns: string[];
  rows: RecomputedRow[];
}

/** The one filter concept this battery's grid ever uses — a month-bucket
 *  equality on `order_date`'s year+month, as the CONTIGUOUS `YYYYMM` code
 *  (never a hyphenated `YYYY-MM` — the hyphenated form's 2-digit month
 *  suffix is its own digit-bounded token and can coincidentally equal a
 *  small aggregate value). Written independently of `bi-warehouse.ts`'s
 *  `composeReferenceSql`, which does the SAME logical filter via
 *  `SUBSTR(fo.order_date, 1, 4) || SUBSTR(fo.order_date, 6, 2) = ...` in
 *  SQL text; here it is a plain JS string slice-and-concat over the raw
 *  array. */
function passesFilter(order: DuckFactOrder, filter: DuckFilter): boolean {
  if (filter.column !== "order_month") {
    throw new Error(`[bi-reference-interpreter] unsupported filter column ${JSON.stringify(filter.column)}`);
  }
  const code = order.orderDate.slice(0, 4) + order.orderDate.slice(5, 7);
  return code === filter.value;
}

function groupKeyValue(
  column: string,
  order: DuckFactOrder,
  customerById: Map<number, DuckCustomer>,
  productById: Map<number, DuckProduct>,
): string {
  if (column === "segment") return customerById.get(order.customerId)?.segment ?? "";
  if (column === "category") return productById.get(order.productId)?.category ?? "";
  throw new Error(`[bi-reference-interpreter] unsupported groupBy column ${JSON.stringify(column)}`);
}

function projectedValue(
  column: string,
  order: DuckFactOrder,
  customerById: Map<number, DuckCustomer>,
): string | number {
  if (column === "order_id") return order.orderId;
  if (column === "quantity") return order.quantity;
  if (column === "unit_price") return order.unitPrice;
  if (column === "customer_name") return customerById.get(order.customerId)?.customerName ?? "";
  throw new Error(`[bi-reference-interpreter] unsupported projection column ${JSON.stringify(column)}`);
}

function aggregateAddend(column: string, order: DuckFactOrder): number {
  if (column === "quantity") return order.quantity;
  throw new Error(`[bi-reference-interpreter] unsupported aggregate column ${JSON.stringify(column)}`);
}

/**
 * Recomputes the expected result set for `spec` directly from the raw
 * warehouse arrays — no SQL, no shared helper with the generator.
 *
 * Two shapes, mirroring the two the grid actually uses (never abstracted
 * into one generic path — that would risk re-introducing a shared
 * structural assumption the design's independence scope does not ask for):
 *
 *   - `groupBy` + `aggregate` present: a streaming reduce over the filtered
 *     fact rows into a `Map` keyed by the joined group-key tuple,
 *     accumulating the aggregate addend per key.
 *   - otherwise: a plain per-row projection of the filtered fact rows.
 */
export function recomputeExpected(warehouseState: DuckWarehouseState, spec: DuckQuerySpec): RecomputedResult {
  const filtered = warehouseState.factOrders.filter((o) => passesFilter(o, spec.filter));
  const customerById = new Map(warehouseState.dimCustomers.map((c) => [c.customerId, c] as const));
  const productById = new Map(warehouseState.dimProducts.map((p) => [p.productId, p] as const));

  if (spec.groupBy && spec.aggregate) {
    const groups = new Map<string, { keyValues: string[]; total: number }>();
    for (const order of filtered) {
      const keyValues = spec.groupBy.map((col) => groupKeyValue(col, order, customerById, productById));
      const key = keyValues.join("");
      const existing = groups.get(key) ?? { keyValues, total: 0 };
      existing.total += aggregateAddend(spec.aggregate.column, order);
      groups.set(key, existing);
    }
    const rows: RecomputedRow[] = [...groups.values()].map((g) => {
      const row: RecomputedRow = {};
      spec.groupBy!.forEach((col, i) => {
        row[col] = g.keyValues[i]!;
      });
      row[spec.aggregate!.alias] = g.total;
      return row;
    });
    return { columns: [...spec.groupBy, spec.aggregate.alias], rows };
  }

  const rows: RecomputedRow[] = filtered.map((order) => {
    const row: RecomputedRow = {};
    for (const col of spec.projection) row[col] = projectedValue(col, order, customerById);
    return row;
  });
  return { columns: [...spec.projection], rows };
}
