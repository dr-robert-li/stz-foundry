/**
 * The BI-analytics independent oracle seam (Phase 8 — Admission + build,
 * Plan 08-01, REQ-52; `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md`
 * rev 2 §3 — FROZEN, the pre-registration of record for this whole module).
 *
 * THE SQL ENGINE. In-process SQLite per design §1 F-41, obtained LAZILY via
 * `createRequire(import.meta.url)("node:sqlite")` inside a `try`/`catch`.
 * `package.json` declares `engines.node >= 20` and `node:sqlite` is not
 * available unflagged on every such build (stable unflagged since Node 24;
 * `--experimental-sqlite` on Node 22/23), so a top-level VALUE import would
 * crash module load for every consumer that never touches BI — the exact
 * failure mode `execution-oracle.ts`'s doc comment names as this module's
 * FOURTH posture: detect, report, FAIL ATTRIBUTABLY. Never a fallback, never
 * a silent pass.
 *
 * WHY THIS FILE IMPORTS FROM `bi-warehouse.ts` AND NOT THE REVERSE. This is
 * an ADDITIVE layer on top of the generator, the same non-circular
 * direction `execution-oracle.ts` already uses relative to
 * `runAgentBattery` — never imported BY the generator whose output it
 * scores. `bi-warehouse.ts`'s own doc comment states the same rule from the
 * other side.
 */
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { BI_NUMERIC_TOLERANCE, BI_SCHEMA_DDL, type BiWarehouse } from "./bi-warehouse.js";

/** For the absence case: no acceptable degraded substitute for a missing
 *  execution oracle exists (`execution-oracle.ts:1-30`'s posture, followed
 *  verbatim here). */
export class BiSqlEngineUnavailableError extends Error {
  constructor(message: string) {
    super(`[foundry:bi-oracle] ${message}`);
    this.name = "BiSqlEngineUnavailableError";
  }
}

type SqliteModule = { DatabaseSync: typeof DatabaseSync };

let sqliteModuleCache: SqliteModule | undefined;

function loadSqlite(): SqliteModule {
  if (sqliteModuleCache) return sqliteModuleCache;
  const req = createRequire(import.meta.url);
  try {
    sqliteModuleCache = req("node:sqlite") as SqliteModule;
  } catch (e) {
    throw new BiSqlEngineUnavailableError(
      `node:sqlite is unavailable on Node ${process.version} — the BI oracle requires a Node build ` +
        `with node:sqlite (stable unflagged since Node 24; run with --experimental-sqlite on an ` +
        `older Node 20-23 build). Detected, reported, failed attributably — never a fallback, ` +
        `never a silent pass. Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return sqliteModuleCache;
}

export interface BiResultSet {
  columns: string[];
  rows: unknown[][];
}

/**
 * A fresh, freshly-populated in-memory `DatabaseSync` for one warehouse.
 * `returnArrays: true` so every query's rows come back positionally (never
 * objects), matching `BiResultSet`. ANSI-only DDL (`BI_SCHEMA_DDL`, shared
 * with what the candidate is shown, so the two can never drift).
 *
 * Design's "candidate execution isolation" rule (Task 2's action text):
 * callers must materialize a FRESH handle per task execution, never reuse
 * one across tasks — this function's whole job is to make that cheap.
 */
export function materializeWarehouse(warehouse: BiWarehouse): DatabaseSync {
  const { DatabaseSync: Db } = loadSqlite();
  const db = new Db(":memory:", { returnArrays: true });
  for (const ddl of BI_SCHEMA_DDL) db.exec(ddl);

  const insertFact = db.prepare(
    `INSERT INTO fact_orders (order_id, customer_id, product_id, region_id, order_date, quantity, unit_price, discount_pct) ` +
      `VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of warehouse.factOrders) {
    insertFact.run(
      row.orderId,
      row.customerId,
      row.productId,
      row.regionId,
      row.orderDate,
      row.quantity,
      row.unitPrice,
      row.discountPct,
    );
  }

  const insertCustomer = db.prepare(
    `INSERT INTO dim_customers (customer_id, customer_name, segment, region_id) VALUES (?, ?, ?, ?)`,
  );
  for (const row of warehouse.dimCustomers) {
    insertCustomer.run(row.customerId, row.customerName, row.segment, row.regionId);
  }

  const insertProduct = db.prepare(
    `INSERT INTO dim_products (product_id, product_name, category, unit_cost) VALUES (?, ?, ?, ?)`,
  );
  for (const row of warehouse.dimProducts) {
    insertProduct.run(row.productId, row.productName, row.category, row.unitCost);
  }

  const insertRegion = db.prepare(`INSERT INTO dim_regions (region_id, region_name, country) VALUES (?, ?, ?)`);
  for (const row of warehouse.dimRegions) {
    insertRegion.run(row.regionId, row.regionName, row.country);
  }

  return db;
}

/**
 * Executes ONE SQL statement (the caller's job to have already established
 * it is a single read-only `SELECT` — Task 2's `extractSqlArtifact` rule 4)
 * and returns its result set. `node:sqlite`'s `prepare()` silently compiles
 * only the FIRST of a semicolon-separated multi-statement string rather
 * than throwing — verified empirically, not assumed — so a caller must
 * never rely on this function to reject multi-statement input; that is
 * Task 2's own text-level pre-check, run BEFORE this function is called.
 * A syntax error or any other engine rejection throws (the "thrown ...
 * engine error" alternative design §2 rule 3 names).
 */
export function executeSelect(db: DatabaseSync, sql: string): BiResultSet {
  const stmt = db.prepare(sql);
  const columns = stmt.columns().map((c) => c.name);
  // `.all()`'s declared type always claims row objects; `returnArrays: true`
  // (set once in `materializeWarehouse`) makes the RUNTIME shape row arrays
  // instead — a mismatch between the type declarations and the documented
  // runtime option, not modeled by `@types/node`. Cast through `unknown`.
  const rows = stmt.all() as unknown as unknown[][];
  return { columns, rows };
}

/**
 * Type-normalizes one cell value into a canonical bucket key for the
 * multiset comparison both `resultSetsEqual` (here) and `gradedScore`
 * (Task 2) share — F-23's requirement that the equality obligation and the
 * graded score use "the same row-multiset comparison ... and a stated
 * numeric tolerance."
 *
 * ponytail: numbers are bucketed by rounding to `BI_NUMERIC_TOLERANCE`'s own
 * granularity (1e-6) rather than a true epsilon-ball pairwise comparison —
 * sufficient here because every aggregate in this battery sums INTEGER
 * `quantity` values (exact by construction) and every raw numeric column is
 * already rounded to 2 decimals before storage, so the only drift this
 * needs to absorb is SQLite's own IEEE754 round-trip noise (~1e-13),
 * comfortably inside a 1e-6 bucket. Upgrade trigger: a future column whose
 * true tolerance-worthy differences straddle a bucket boundary at the
 * 1e-6 scale, which would need a real epsilon-ball multiset match instead
 * of bucket-key equality.
 */
function normalizeValue(value: unknown): string {
  if (typeof value === "bigint") return normalizeValue(Number(value));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `n:${String(value)}`;
    const bucketed = Math.round(value / BI_NUMERIC_TOLERANCE) * BI_NUMERIC_TOLERANCE;
    return `n:${bucketed.toFixed(9)}`;
  }
  if (value === null || value === undefined) return "z:null";
  return `s:${String(value).trim()}`;
}

/** Builds a canonical `Map<rowKey, count>` bag over a result set's rows,
 *  keyed by the SORTED, lowercased column-name set (order-insensitive,
 *  case-insensitive — the pinned projection-comparison reading) with each
 *  value normalized. Shared by `resultSetsEqual` and (Task 2)
 *  `gradedScore` — F-23's "same row-multiset comparison" requirement. */
function canonicalBag(rs: BiResultSet, orderedLowerColumns: string[]): Map<string, number> {
  const bag = new Map<string, number>();
  for (const row of rs.rows) {
    const byName: Record<string, unknown> = {};
    rs.columns.forEach((c, i) => {
      byName[c.toLowerCase()] = row[i];
    });
    const key = orderedLowerColumns.map((c) => normalizeValue(byName[c])).join("|");
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  return bag;
}

/**
 * The equality obligation's own comparator (design §3 F-23): a defined
 * STRUCTURAL/VALUE equality — the same row-multiset comparison, the same
 * type normalization and `BI_NUMERIC_TOLERANCE` that `gradedScore` (Task 2)
 * uses — NEVER a JavaScript reference/identity comparison, which would be
 * permanently false for separately allocated result objects.
 *
 * Column sets are compared order-insensitively and case-insensitively
 * first (a mismatch is inequality, full stop); rows are compared as an
 * unordered MULTISET with multiplicity (bag semantics — duplicates counted,
 * never deduplicated, consistent with real SQL semantics).
 */
export function resultSetsEqual(expected: BiResultSet, actual: BiResultSet): boolean {
  const expectedCols = [...new Set(expected.columns.map((c) => c.toLowerCase()))].sort();
  const actualCols = [...new Set(actual.columns.map((c) => c.toLowerCase()))].sort();
  if (expectedCols.length !== actualCols.length || expectedCols.some((c, i) => c !== actualCols[i])) {
    return false;
  }
  if (expected.rows.length === 0) return actual.rows.length === 0;

  const expBag = canonicalBag(expected, expectedCols);
  const actBag = canonicalBag(actual, expectedCols);
  if (expBag.size !== actBag.size) return false;
  for (const [key, count] of expBag) {
    if (actBag.get(key) !== count) return false;
  }
  return true;
}
