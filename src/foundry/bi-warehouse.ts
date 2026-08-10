/**
 * The BI-analytics fixture-warehouse generator (Phase 8 — Admission + build,
 * Plan 08-01, REQ-50/REQ-51/REQ-52; `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md`
 * rev 2 — FROZEN, the pre-registration of record for this whole module).
 * Where this file and the design differ, the design wins; the divergence is
 * a bug here, never a reinterpretation of the doc.
 *
 * ANSWER-FIRST, in this design's own sense (§1) — different from v3's sense.
 * Unlike v3 (a `WarehouseFact` drawn from the PRNG before any row exists),
 * BI answer-first means the reference query AND its executed answer both
 * exist BEFORE any candidate sees the question, so ground truth never
 * depends on the process under test. Warehouse rows precede the answer
 * here: `generateBiWarehouse` draws the star schema first, and a task's
 * `precomputed` result set is derived downstream of that, by executing
 * `composeReferenceSql(spec)` against the materialized warehouse (the
 * caller's job — a test, or the 08-02 driver — via `bi-oracle.ts`; this
 * module deliberately does not import that seam, see below).
 *
 * WHY THIS MODULE DOES NOT IMPORT `bi-oracle.ts`. `bi-oracle.ts` imports
 * `BI_NUMERIC_TOLERANCE` and `BI_SCHEMA_DDL` from here — a warehouse/oracle
 * dependency direction already precedented by `execution-oracle.ts`, which
 * is "layered ON TOP of runAgentBattery" rather than imported by the
 * generator it scores. Reversing the edge here would create an import
 * cycle. `buildBiTasks` therefore builds prompts and specs only; it does
 * not execute SQL or verify non-emptiness itself — that is what Task 1/3's
 * own tests (and the 08-02 driver) do, directly, against the same specs
 * `buildBiQuerySpecs` exports.
 *
 * Determinism (house rule, `fixture-warehouse-v3.ts:260-278`): one seeded
 * `mulberry32` stream per warehouse, Fisher-Yates only, every draw
 * UNCONDITIONAL so the stream length never depends on a branch.
 */
import { createHash } from "node:crypto";
import { mulberry32 } from "../harness.js";
import { admitVerticalBattery } from "./vertical-admission.js";
import { BI_ANALYTICS_GENERATOR_ID, acceptedGeneratorReceipt, requireGeneratorRooted } from "./fixture-warehouse.js";
import type { AgentBattery, BatteryTask } from "./battery-types.js";
import type { PredicateCheck } from "../contract/contract-types.js";

// ── §8-pinned constants, each named for its own row ─────────────────────────

/** §8: "Tasks per seed per grid point" — derived: matches
 *  `V3.1-BATTERY-DESIGN.md` §4's own per-seed task count. */
export const BI_TASKS_PER_SEED_PER_POINT = 10;
/** §8: "Stage-1 probe seeds (six, pinned)". */
export const BI_STAGE1_SEEDS: readonly number[] = Object.freeze([101, 202, 303, 404, 505, 606]);
/** §8: "Stage-2 fresh seeds (three, disjoint from stage 1)". */
export const BI_STAGE2_SEEDS: readonly number[] = Object.freeze([707, 808, 909]);
/** §8: "Pretest seed (single, distinct from stage 1/2)". */
export const BI_PRETEST_SEED = 999;
/** §8: "Ceiling-gate seed subset and n" — the seed half of that row. */
export const BI_CEILING_GATE_SEEDS: readonly number[] = Object.freeze([101, 202]);
/** §8: "Ceiling-gate seed subset and n" — the n-per-point half of that row. */
export const BI_CEILING_GATE_N_PER_POINT = 20;
/** §8: "Ceiling-gate threshold". */
export const BI_CEILING_GATE_MEAN_MIN = 0.95;
/** §8: "Task timeout bound". */
export const BI_TASK_TIMEOUT_MS = 3_600_000;
/** §8: "Warehouse row scale (fact table rows per seed)" — `derived:`. */
export const BI_FACT_ROWS_SCALE = 800;
/** §8: "Dimension-table row scale, dim_customers (F-01)" — `derived:`. */
export const BI_DIM_CUSTOMERS_SCALE = 40;
/** §8: "Dimension-table row scale, dim_products (F-01)" — `derived:`. */
export const BI_DIM_PRODUCTS_SCALE = 25;
/** §8: "Dimension-table row scale, dim_regions (F-01)" — `derived:`. */
export const BI_DIM_REGIONS_SCALE = 8;

/**
 * Phase-8-DERIVED, not §8-pinned (`<pinned_constants>`, this plan). §3 F-23
 * requires "a stated numeric tolerance for floating-point columns" for the
 * structural-equality comparison, but §8 pins no value. Absolute tolerance,
 * applied AFTER type normalization (bigint -> number, then rounded to a
 * granularity well inside this bound before bucketing for the multiset
 * comparison — see `bi-oracle.ts`'s `normalizeValue`). Reasoning recorded
 * again in the 08-01-SUMMARY.md per the plan's own instruction.
 */
export const BI_NUMERIC_TOLERANCE = 1e-6;

// ── the star schema ──────────────────────────────────────────────────────

export interface BiFactOrderRow {
  orderId: string;
  customerId: number;
  productId: number;
  regionId: number;
  orderDate: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export interface BiCustomerRow {
  customerId: number;
  customerName: string;
  segment: string;
  regionId: number;
}

export interface BiProductRow {
  productId: number;
  productName: string;
  category: string;
  unitCost: number;
}

export interface BiRegionRow {
  regionId: number;
  regionName: string;
  country: string;
}

export interface BiWarehouse {
  seed: number;
  factOrders: BiFactOrderRow[];
  dimCustomers: BiCustomerRow[];
  dimProducts: BiProductRow[];
  dimRegions: BiRegionRow[];
}

/**
 * ANSI-compatible DDL only, no engine-specific extensions (design §1 F-41) —
 * shown to the candidate verbatim as the schema (`buildBiTasks`) AND
 * executed verbatim by `bi-oracle.ts`'s `materializeWarehouse`, so the two
 * can never drift apart.
 */
export const BI_SCHEMA_DDL: readonly string[] = Object.freeze([
  `CREATE TABLE fact_orders (
  order_id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  region_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount_pct REAL NOT NULL
)`,
  `CREATE TABLE dim_customers (
  customer_id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  segment TEXT NOT NULL,
  region_id INTEGER NOT NULL
)`,
  `CREATE TABLE dim_products (
  product_id INTEGER PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_cost REAL NOT NULL
)`,
  `CREATE TABLE dim_regions (
  region_id INTEGER PRIMARY KEY,
  region_name TEXT NOT NULL,
  country TEXT NOT NULL
)`,
]);

const BI_MONTHS = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

const REGION_NAMES = [
  "North", "South", "East", "West", "Central", "Pacific", "Mountain", "Atlantic", "Gulf", "Lakes",
];
const COUNTRIES = ["USA", "Canada", "UK", "Germany", "France", "Japan", "Australia", "Brazil"];
const SEGMENTS = ["Enterprise", "SMB", "Mid-Market", "Startup"];
const CATEGORIES = [
  "Electronics", "Apparel", "Home Goods", "Sporting Goods", "Office Supplies", "Garden", "Automotive", "Toys",
];
const CUSTOMER_PREFIX = [
  "Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli", "Cyberdyne", "Massive Dynamic",
];
const CUSTOMER_SUFFIX = ["Corp", "LLC", "Group", "Partners", "Holdings", "Industries", "Co", "Inc"];
const PRODUCT_ADJ = ["Compact", "Deluxe", "Standard", "Premium", "Portable", "Industrial", "Classic", "Modern"];
const PRODUCT_NOUN = ["Widget", "Kit", "Assembly", "Unit", "Bundle", "Set", "Module", "Device"];

/**
 * §5 row-scale realization rule: `BASE + floor(rand() * (2*J + 1)) - J`,
 * `J = round(0.1 * BASE)`, drawn unconditionally from the warehouse's own
 * stream. Row counts are never a function of grid level — the
 * warehouse/level separation rule below.
 */
function scaledCount(base: number, rand: () => number): number {
  const j = Math.round(0.1 * base);
  return base + Math.floor(rand() * (2 * j + 1)) - j;
}

/** Fisher-Yates in place, drawing exactly `n - 1` times — never
 *  `sort(() => rand() - 0.5)` (house rule, `fixture-warehouse-v3.ts:260-278`). */
function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
}

/**
 * Pure function of the seed alone (no `Provider`/`CandidateAgent`/clock
 * parameter) — one `mulberry32(seed)` stream so one seed replays the whole
 * warehouse (design §1: "same seed + same knobs regenerate a byte-identical
 * warehouse").
 *
 * Every fact-order row's `order_date` month is drawn from a POOL that cycles
 * all twelve `BI_MONTHS` labels across the row count, then Fisher-Yates
 * shuffled — guaranteeing BY CONSTRUCTION (never left to chance) that every
 * month is present at least `floor(rowCount / 12)` times for any row count
 * above 12 (the §8 fact scale ~720-880 rows). This is what lets
 * `buildBiQuerySpecs` sample 10 DISTINCT filter values per level from data
 * that is guaranteed to exist, satisfying design §3 F-25's non-empty
 * precondition by construction rather than by a probe discovering it later
 * — the same forced-shape discipline `fixture-warehouse-v3.ts`'s conflict
 * rows use (":356-372").
 */
export function generateBiWarehouse(seed: number): BiWarehouse {
  const rand = mulberry32(seed);

  const regionCount = scaledCount(BI_DIM_REGIONS_SCALE, rand);
  const dimRegions: BiRegionRow[] = [];
  for (let i = 0; i < regionCount; i++) {
    dimRegions.push({
      regionId: i + 1,
      regionName: REGION_NAMES[Math.floor(rand() * REGION_NAMES.length)]!,
      country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)]!,
    });
  }

  const customerCount = scaledCount(BI_DIM_CUSTOMERS_SCALE, rand);
  const dimCustomers: BiCustomerRow[] = [];
  for (let i = 0; i < customerCount; i++) {
    const prefix = CUSTOMER_PREFIX[Math.floor(rand() * CUSTOMER_PREFIX.length)]!;
    const suffix = CUSTOMER_SUFFIX[Math.floor(rand() * CUSTOMER_SUFFIX.length)]!;
    dimCustomers.push({
      customerId: i + 1,
      customerName: `${prefix} ${suffix}`,
      segment: SEGMENTS[Math.floor(rand() * SEGMENTS.length)]!,
      regionId: dimRegions[Math.floor(rand() * dimRegions.length)]!.regionId,
    });
  }

  const productCount = scaledCount(BI_DIM_PRODUCTS_SCALE, rand);
  const dimProducts: BiProductRow[] = [];
  for (let i = 0; i < productCount; i++) {
    const adj = PRODUCT_ADJ[Math.floor(rand() * PRODUCT_ADJ.length)]!;
    const noun = PRODUCT_NOUN[Math.floor(rand() * PRODUCT_NOUN.length)]!;
    dimProducts.push({
      productId: i + 1,
      productName: `${adj} ${noun}`,
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!,
      unitCost: Math.round((5 + rand() * 195) * 100) / 100,
    });
  }

  const factCount = scaledCount(BI_FACT_ROWS_SCALE, rand);
  const monthPool: string[] = [];
  for (let i = 0; i < factCount; i++) monthPool.push(BI_MONTHS[i % BI_MONTHS.length]!);
  shuffleInPlace(monthPool, rand);

  const factOrders: BiFactOrderRow[] = [];
  for (let i = 0; i < factCount; i++) {
    const customerId = dimCustomers[Math.floor(rand() * dimCustomers.length)]!.customerId;
    const productId = dimProducts[Math.floor(rand() * dimProducts.length)]!.productId;
    const regionId = dimRegions[Math.floor(rand() * dimRegions.length)]!.regionId;
    const month = monthPool[i]!;
    const day = 1 + Math.floor(rand() * 28);
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    factOrders.push({
      orderId: `ord-${i + 1}`,
      customerId,
      productId,
      regionId,
      orderDate: `${month}-${dayStr}`,
      quantity: 1 + Math.floor(rand() * 5),
      unitPrice: Math.round((5 + rand() * 195) * 100) / 100,
      discountPct: Math.round(rand() * 0.3 * 100) / 100,
    });
  }

  return { seed, factOrders, dimCustomers, dimProducts, dimRegions };
}

// ── the grid (L1 only in this task; Task 2 completes L2-L4 + `biLevel`) ────

export type BiLevelId = "L1" | "L2" | "L3" | "L4";

export interface BiGridPoint {
  readonly id: BiLevelId;
  readonly knobValue: number;
  readonly joins: number;
  readonly aggregations: number;
}

/** §5's concrete grid, point values only (never ranges). L1 only for now —
 *  Task 2 completes L2-L4 and adds `biLevel(id)` on the `v3Knobs` model. */
export const BI_GRID: readonly BiGridPoint[] = Object.freeze([
  Object.freeze({ id: "L1", knobValue: 1, joins: 0, aggregations: 0 }),
]);

// ── the known-answer query set ───────────────────────────────────────────

export interface BiFilterSpec {
  /** A conceptual column name — see `COLUMN_SOURCE`/`qualify` below. Only
   *  `"order_month"` is implemented in this task; Task 2 does not need to
   *  add more (every level uses the same filter concept, see the module
   *  doc comment on distinctness). */
  column: string;
  op: "=";
  value: string;
}

export interface BiAggregateSpec {
  fn: "SUM";
  /** Conceptual source column, e.g. `"quantity"`. */
  column: string;
  /** Output column name for the aggregate. */
  alias: string;
}

export interface BiQuerySpec {
  levelId: BiLevelId;
  taskIndex: number;
  /** Join order; physical table names, first is the base table. */
  tables: string[];
  filter: BiFilterSpec;
  /** Conceptual column names — a single GROUP BY clause may name more than
   *  one column (F-18: still one aggregation operation). */
  groupBy: string[] | null;
  aggregate: BiAggregateSpec | null;
  /** Output column names, in display order — order-insensitive per the
   *  pinned projection-comparison reading (`bi-oracle.ts`). */
  projection: string[];
}

const TABLE_ALIAS: Record<string, string> = {
  fact_orders: "fo",
  dim_customers: "dc",
  dim_products: "dp",
  dim_regions: "dr",
};

interface ColumnRef {
  table: string;
  column: string;
}

/** Conceptual column name -> its physical source. Deliberately NOT imported
 *  by `test/fixtures/bi-reference-interpreter.ts` — that fixture declares
 *  its own duck types and its own column mapping; the duplication is the
 *  mechanism (design §3, and this module's own doc comment). */
const COLUMN_SOURCE: Record<string, ColumnRef> = {
  order_id: { table: "fact_orders", column: "order_id" },
  quantity: { table: "fact_orders", column: "quantity" },
  unit_price: { table: "fact_orders", column: "unit_price" },
  customer_name: { table: "dim_customers", column: "customer_name" },
  segment: { table: "dim_customers", column: "segment" },
  category: { table: "dim_products", column: "category" },
};

const JOIN_ON: Record<string, string> = {
  dim_customers: "fo.customer_id = dc.customer_id",
  dim_products: "fo.product_id = dp.product_id",
};

function qualify(concept: string): string {
  const ref = COLUMN_SOURCE[concept];
  if (!ref) {
    throw new Error(`[foundry:bi-warehouse] unknown BI column concept ${JSON.stringify(concept)}`);
  }
  return `${TABLE_ALIAS[ref.table]}.${ref.column}`;
}

/**
 * Composes the reference SQL TEXT for a spec — a pure function of `spec`
 * alone, generic over every grid level's join/groupBy/aggregate shape so
 * Task 2's L2-L4 specs need no change here. Does NOT execute anything
 * (`bi-oracle.ts`'s job, kept out of this module — see the module doc
 * comment on the import direction).
 */
export function composeReferenceSql(spec: BiQuerySpec): string {
  const selectParts: string[] = [];
  for (const col of spec.projection) {
    if (spec.aggregate && col === spec.aggregate.alias) {
      selectParts.push(`${spec.aggregate.fn}(${qualify(spec.aggregate.column)}) AS ${spec.aggregate.alias}`);
    } else {
      selectParts.push(`${qualify(col)} AS ${col}`);
    }
  }

  const [baseTable, ...joinTables] = spec.tables;
  if (!baseTable) {
    throw new Error(`[foundry:bi-warehouse] spec.tables must be non-empty`);
  }
  const fromParts = [`${baseTable} ${TABLE_ALIAS[baseTable]}`];
  for (const table of joinTables) {
    const onClause = JOIN_ON[table];
    if (!onClause) {
      throw new Error(`[foundry:bi-warehouse] no known join key for table ${JSON.stringify(table)}`);
    }
    fromParts.push(`JOIN ${table} ${TABLE_ALIAS[table]} ON ${onClause}`);
  }

  const whereClause =
    spec.filter.column === "order_month"
      ? `SUBSTR(fo.order_date, 1, 7) = '${spec.filter.value.replace(/'/g, "''")}'`
      : `${qualify(spec.filter.column)} ${spec.filter.op} '${String(spec.filter.value).replace(/'/g, "''")}'`;

  const groupByClause =
    spec.groupBy && spec.groupBy.length > 0 ? ` GROUP BY ${spec.groupBy.map(qualify).join(", ")}` : "";

  return `SELECT ${selectParts.join(", ")} FROM ${fromParts.join(" ")} WHERE ${whereClause}${groupByClause}`;
}

/**
 * Renders a plain-English business question from the reference query's own
 * semantics (design §1), naming the required output columns explicitly
 * (the pinned projection-comparison reading, `bi-oracle.ts`'s doc comment)
 * so a candidate cannot zero on an aliasing accident. Carries NO data rows
 * and no expected value — the leak checks (Task 3) assert this over the
 * real prompt string.
 *
 * `test/fixtures/bi-question-fidelity.ts`'s `renderQuestionIndependent` is a
 * SEPARATE, independently-written implementation of this same rendering,
 * per design §3 F-20's Phase-8 fidelity obligation.
 */
export function renderQuestion(spec: BiQuerySpec): string {
  const month = spec.filter.value;
  const columns = spec.projection.join(", ");
  const sentence =
    spec.aggregate && spec.groupBy
      ? `For orders placed in ${month}, what is the total ${spec.aggregate.column} ` +
        `(${spec.aggregate.fn}), broken down by ${spec.groupBy.join(" and ")}?`
      : `For orders placed in ${month}, list the ${columns} for each order.`;
  return `${sentence} Return columns: ${columns}.`;
}

/**
 * Hashes the warehouse seed with the level id, then `mulberry32`s that — the
 * `derivePromotionSeed` idiom in `fixture-warehouse.ts`, copied rather than
 * imported (that function is tied to the fixed `"promotion"` label). A
 * task set is replayable on its own: building L3's tasks before or after
 * L1's cannot change either, because neither continues the warehouse's own
 * stream.
 */
function deriveTaskSeed(seed: number, levelId: BiLevelId): number {
  const h = createHash("sha256").update(`${seed}|bi-tasks|${levelId}`).digest("hex");
  return parseInt(h.slice(0, 8), 16);
}

function presentMonths(warehouse: BiWarehouse): string[] {
  return [...new Set(warehouse.factOrders.map((o) => o.orderDate.slice(0, 7)))].sort();
}

/** L1 only in this task — Task 2 adds the L2/L3/L4 cases. */
function levelSpec(levelId: BiLevelId, taskIndex: number, month: string): BiQuerySpec {
  switch (levelId) {
    case "L1":
      return {
        levelId,
        taskIndex,
        tables: ["fact_orders"],
        filter: { column: "order_month", op: "=", value: month },
        groupBy: null,
        aggregate: null,
        projection: ["order_id", "quantity", "unit_price"],
      };
    default:
      throw new Error(`[foundry:bi-warehouse] level ${JSON.stringify(levelId)} is not yet implemented`);
  }
}

/**
 * Derives `BI_TASKS_PER_SEED_PER_POINT` specs for `(warehouse, levelId)` —
 * distinct instantiations of that level's structural template against
 * different filter values, drawn from its own per-(seed, level) stream
 * (`deriveTaskSeed`), sampling filter values from months ACTUALLY PRESENT
 * in this seed's data (guaranteed by `generateBiWarehouse`'s forced month
 * pool) so F-25's non-empty precondition holds by construction.
 */
export function buildBiQuerySpecs(warehouse: BiWarehouse, levelId: BiLevelId): BiQuerySpec[] {
  const months = presentMonths(warehouse);
  if (months.length < BI_TASKS_PER_SEED_PER_POINT) {
    throw new Error(
      `[foundry:bi-warehouse] seed ${warehouse.seed} has only ${months.length} distinct order months ` +
        `present — need at least ${BI_TASKS_PER_SEED_PER_POINT} for ${BI_TASKS_PER_SEED_PER_POINT} ` +
        `distinct-filter-value tasks (this should never happen by construction; see the month-pool guarantee)`,
    );
  }
  const rand = mulberry32(deriveTaskSeed(warehouse.seed, levelId));
  const order = [...months.keys()];
  shuffleInPlace(order, rand);
  const chosenMonths = order.slice(0, BI_TASKS_PER_SEED_PER_POINT).map((idx) => months[idx]!);
  return chosenMonths.map((month, taskIndex) => levelSpec(levelId, taskIndex, month));
}

const BI_OUTPUT_CONTRACT = [
  "Respond with exactly one fenced SQL code block containing a single",
  "read-only SELECT statement (a leading WITH common-table expression that",
  "resolves to one SELECT is allowed). Use a fence labeled ```sql, or a bare",
  "unlabeled fence if you cannot label it. No other statement type, and no",
  "second statement.",
].join(" ");

/**
 * One `BatteryTask` per spec (design §1's per-task prompt shape): the
 * warehouse schema as DDL, the natural-language question naming its output
 * columns, and the §2 output-contract instruction — no data rows, no
 * reference SQL, no expected value (the leak checks, Task 3).
 *
 * Carries ONE `output-assertion` check per task — the parsing-CONTRACT gate
 * (mirrors `buildTasksV3`'s artifact-shape checks,
 * `fixture-warehouse-v3.ts:616-625`). The graded RESULT-SET score is the
 * §3 oracle's own (`bi-oracle.ts`'s `gradedScore`), applied by the 08-02
 * driver as an additive pass in the `execution-oracle.ts` manner — never a
 * fifth predicate kind.
 */
export function buildBiTasks(warehouse: BiWarehouse, levelId: BiLevelId, taskIdPrefix: string = ""): BatteryTask[] {
  const specs = buildBiQuerySpecs(warehouse, levelId);
  return specs.map((spec) => {
    const taskId = `${taskIdPrefix}bi-analytics-${levelId}-${spec.taskIndex}-${warehouse.seed}`;
    const prompt = [
      `You are a BI analyst. Here is the warehouse schema:`,
      "```sql",
      BI_SCHEMA_DDL.join("\n\n"),
      "```",
      ``,
      renderQuestion(spec),
      ``,
      BI_OUTPUT_CONTRACT,
    ].join("\n");

    const checks: PredicateCheck[] = [
      {
        checkId: `${taskId}-sql-artifact`,
        kind: "output-assertion",
        expect: "single-sql-artifact",
        description:
          `the response yields exactly one extractable, executable single read-only SELECT SQL ` +
          `artifact per the §2 output contract — the parsing-contract gate; the graded result-set ` +
          `score is computed separately by the 08-02 driver via bi-oracle's gradedScore, applied ` +
          `as an additive pass in the execution-oracle.ts manner (never a fifth predicate kind)`,
      },
    ];

    return { id: taskId, prompt, checks };
  });
}

/**
 * Mints the receipt FIRST — `acceptedGeneratorReceipt` then
 * `requireGeneratorRooted` — so this throws today (`BI_ANALYTICS_GENERATOR_ID`
 * is deliberately absent from `ACCEPTED_GENERATORS`). Mirrors
 * `generateFixtureBatteryV3` (`fixture-warehouse-v3.ts:701-711`) exactly.
 */
export function generateBiBattery(seed: number, levelId: BiLevelId, batteryId: string): AgentBattery {
  const receipt = acceptedGeneratorReceipt(BI_ANALYTICS_GENERATOR_ID);
  requireGeneratorRooted(receipt, BI_ANALYTICS_GENERATOR_ID);
  const warehouse = generateBiWarehouse(seed);
  const tasks = buildBiTasks(warehouse, levelId);
  return admitVerticalBattery("bi-analytics", { id: batteryId, tasks, receipt });
}
