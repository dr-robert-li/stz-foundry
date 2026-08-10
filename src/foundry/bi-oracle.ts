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

// ── §2 extraction, fail-closed, in order ────────────────────────────────

/**
 * The accepted dialect set, FROZEN with the design (§2): a fence labeled
 * exactly `sql` (lowercased, trimmed), and an unlabeled ("bare") fence as
 * the sole fallback alias. Widening this after data exists is a prohibited
 * new generation of this line (§10) — a test asserts this literal has
 * exactly two members so a later widening is a visible edit.
 */
export const BI_ACCEPTED_DIALECTS: readonly string[] = Object.freeze(["sql", ""]);

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

/**
 * §2 rules 1-2, in order, fail-closed. Rules 3-4 (executability and the
 * single-read-only-SELECT shape) are `categorize`'s job below — they need
 * an actual engine handle / a static text scan respectively, neither of
 * which this pure extraction step has or needs.
 *
 * 1. Fenced blocks whose info string, lowercased and trimmed, is EXACTLY
 *    `sql` — if >=1 exists, the FIRST is the artifact.
 * 2. Otherwise, bare-info fences — EXACTLY ONE yields the artifact; zero or
 *    more than one yields none (ambiguity fails closed).
 */
export function extractSqlArtifact(text: string): string | null {
  const fences: { info: string; body: string }[] = [];
  for (const m of text.matchAll(FENCE_RE)) {
    fences.push({ info: (m[1] ?? "").trim().toLowerCase(), body: (m[2] ?? "").trim() });
  }
  const sqlFences = fences.filter((f) => f.info === "sql");
  if (sqlFences.length >= 1) return sqlFences[0]!.body;
  const bareFences = fences.filter((f) => f.info === "");
  if (bareFences.length === 1) return bareFences[0]!.body;
  return null;
}

function skipWhitespaceAndComments(sql: string, start: number): number {
  let i = start;
  for (;;) {
    while (i < sql.length && /\s/.test(sql[i]!)) i++;
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

/** Skips a balanced `( ... )` group starting AT `sql[i] === "("`, returning
 *  the index just past the matching close paren, or -1 if unbalanced. */
function skipParenGroup(sql: string, start: number): number {
  if (sql[start] !== "(") return -1;
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    i++;
    if (depth === 0) return i;
  }
  return -1;
}

/**
 * Walks a `WITH [RECURSIVE] name [(cols)] AS (subquery) [, name2 ...]`
 * clause starting at `sql[i]` matching `/^with\b/i`, returning the index
 * where the MAIN query begins, or -1 if the shape does not parse — fail
 * closed on anything unrecognized, never a best-effort guess.
 */
function skipCteList(sql: string, start: number): number {
  const withMatch = /^with\s+(recursive\s+)?/i.exec(sql.slice(start));
  if (!withMatch) return -1;
  let i = start + withMatch[0].length;

  for (;;) {
    i = skipWhitespaceAndComments(sql, i);
    const nameMatch = /^("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i));
    if (!nameMatch) return -1;
    i += nameMatch[0].length;
    i = skipWhitespaceAndComments(sql, i);
    if (sql[i] === "(") {
      // an optional explicit column list, e.g. "cte_name (a, b) AS (...)"
      const after = skipParenGroup(sql, i);
      if (after === -1) return -1;
      i = skipWhitespaceAndComments(sql, after);
    }
    const asMatch = /^as\b/i.exec(sql.slice(i));
    if (!asMatch) return -1;
    i = skipWhitespaceAndComments(sql, i + asMatch[0].length);
    const after = skipParenGroup(sql, i);
    if (after === -1) return -1;
    i = skipWhitespaceAndComments(sql, after);
    if (sql[i] === ",") {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

/**
 * §2 rule 4's fail-closed PRE-CHECK, run before any execution: the
 * extracted artifact must be a single READ-ONLY `SELECT` statement (a
 * leading `WITH` common-table expression resolving to one `SELECT` is
 * permitted — the Phase-8-pinned reading of rule 4's boundary case). Any
 * DDL, DML, or multi-statement artifact fails this check and is NEVER
 * executed.
 *
 * TEXT ONLY, never delegated to the engine: `node:sqlite`'s `prepare()`
 * silently compiles only the FIRST of a semicolon-separated multi-statement
 * string rather than throwing (verified empirically against this repo's
 * Node build, see `executeSelect`'s doc comment) — trusting it to reject a
 * second statement would be a T-08-01 gap, not a defense.
 */
export function isSingleReadOnlySelect(sql: string): boolean {
  let i = 0;
  let depth = 0;
  let inSingleQuote = false;
  let topLevelSemicolons = 0;
  let trailingAfterFirstSemicolon = "";

  while (i < sql.length) {
    const ch = sql[i]!;
    if (inSingleQuote) {
      if (ch === "'" && sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingleQuote = false;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      i++;
      continue;
    }
    if (ch === ";" && depth === 0) {
      topLevelSemicolons++;
      i++;
      if (topLevelSemicolons === 1) trailingAfterFirstSemicolon = sql.slice(i);
      continue;
    }
    i++;
  }
  if (topLevelSemicolons > 1) return false;
  if (trailingAfterFirstSemicolon.trim() !== "") return false;

  let pos = skipWhitespaceAndComments(sql, 0);
  if (/^with\b/i.test(sql.slice(pos))) {
    pos = skipCteList(sql, pos);
    if (pos === -1) return false;
  }
  pos = skipWhitespaceAndComments(sql, pos);
  return /^select\b/i.test(sql.slice(pos));
}

// ── §3 graded score ──────────────────────────────────────────────────────

/**
 * Design §3's graded score. Column-set mismatch (order-insensitive,
 * case-insensitive — the pinned projection-comparison reading) scores 0
 * outright: a differently-shaped projection is not a partial answer, so a
 * `SELECT *` that returns EXTRA/WRONG columns zeros here, before the
 * multiset comparison ever runs. `expected` empty scores 1.0 iff `actual`
 * is also empty (the defined edge case; Task 3's F-25 sweep is what proves
 * this rule stays a defined edge case rather than a live outcome).
 * Otherwise, `|expected ∩ actual| / max(|expected|, |actual|)` over the
 * SAME row-multiset comparison `resultSetsEqual` uses (F-23) — symmetric
 * under both failure directions: dropping rows shrinks the numerator: an
 * over-broad query (same correct columns, more rows — e.g. a weakened
 * `WHERE` behind a `SELECT *` over an already-correctly-projected
 * subquery) inflates `|actual|`, the denominator, driving the score toward
 * zero as spurious rows accumulate.
 */
export function gradedScore(expected: BiResultSet, actual: BiResultSet): number {
  const expectedCols = [...new Set(expected.columns.map((c) => c.toLowerCase()))].sort();
  const actualCols = [...new Set(actual.columns.map((c) => c.toLowerCase()))].sort();
  const columnsMatch =
    expectedCols.length === actualCols.length && expectedCols.every((c, i) => c === actualCols[i]);
  if (!columnsMatch) return 0;

  if (expected.rows.length === 0) return actual.rows.length === 0 ? 1 : 0;

  const expBag = canonicalBag(expected, expectedCols);
  const actBag = canonicalBag(actual, expectedCols);
  let intersection = 0;
  for (const [key, count] of expBag) {
    intersection += Math.min(count, actBag.get(key) ?? 0);
  }
  return intersection / Math.max(expected.rows.length, actual.rows.length);
}

// ── §4 zero-decomposition ────────────────────────────────────────────────

/** Fixed NOW, before any data exists — no post-hoc category is ever
 *  invented (design §4). A test asserts this literal has exactly four
 *  members. */
export const BI_ZERO_DECOMPOSITION_CATEGORIES = Object.freeze([
  "no-artifact",
  "non-executable-artifact",
  "executes-but-wrong",
  "correct",
] as const);

export type BiCategory = (typeof BI_ZERO_DECOMPOSITION_CATEGORIES)[number];

export interface BiCategorizeResult {
  category: BiCategory;
  /** Only meaningful when `category === "correct"` — §3's `exact` flag
   *  (graded score 1.0 AND `|expected| = |actual|`). */
  exact: boolean;
  gradedScore: number;
  artifact: string | null;
}

/**
 * Ties §2 extraction, §2 rule 4's pre-check, §3's execution + graded score,
 * and §4's zero-decomposition rule together into ONE decision, in order:
 *
 *   1. `extractSqlArtifact` — none -> `no-artifact`.
 *   2. `isSingleReadOnlySelect` — fails -> `non-executable-artifact`
 *      (DDL/DML/multi-statement is NEVER executed, per §2 rule 4).
 *   3. `executeSelect` against `db` — throws (syntax error, engine
 *      rejection) -> `non-executable-artifact`, never `executes-but-wrong`.
 *   4. `gradedScore` — 1.0 -> `correct` (further flagged `exact`);
 *      otherwise -> `executes-but-wrong` (partial and zero overlap alike).
 *
 * `db` must be a FRESH, per-task materialized handle (candidate execution
 * isolation, design §3) — this function never re-materializes it, that is
 * the caller's job so nothing a candidate emits can persist into another
 * task.
 */
export function categorize(responseText: string, db: DatabaseSync, expected: BiResultSet): BiCategorizeResult {
  const artifact = extractSqlArtifact(responseText);
  if (artifact === null) {
    return { category: "no-artifact", exact: false, gradedScore: 0, artifact: null };
  }
  if (!isSingleReadOnlySelect(artifact)) {
    return { category: "non-executable-artifact", exact: false, gradedScore: 0, artifact };
  }

  let actual: BiResultSet;
  try {
    actual = executeSelect(db, artifact);
  } catch {
    return { category: "non-executable-artifact", exact: false, gradedScore: 0, artifact };
  }

  const score = gradedScore(expected, actual);
  const exact = score === 1 && expected.rows.length === actual.rows.length;
  return { category: score === 1 ? "correct" : "executes-but-wrong", exact, gradedScore: score, artifact };
}
