/**
 * The BI-analytics tracer (Phase 8 — Admission + build, Plan 08-01): one
 * seed travels admission -> generator -> in-process SQLite -> result-set
 * diff -> independent recompute agreement, end to end, at L1. Task 2 adds
 * the L2-L4 grid and the scoring contract's own test file
 * (`test/foundry-bi-oracle.test.ts`); Task 3 adds the full nine-seed sweep,
 * the leak checks, the independence walker and the question-fidelity check
 * to THIS file.
 *
 * House rule (`test/foundry-battery-types.test.ts:44-51`): assert the
 * thrown message's CONTENT, never bare `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateBiWarehouse,
  buildBiQuerySpecs,
  buildBiTasks,
  composeReferenceSql,
  renderQuestion,
  generateBiBattery,
  BI_GRID,
  biLevel,
  BI_TASKS_PER_SEED_PER_POINT,
  BI_STAGE1_SEEDS,
  BI_STAGE2_SEEDS,
  BI_FACT_ROWS_SCALE,
  BI_DIM_CUSTOMERS_SCALE,
  BI_DIM_PRODUCTS_SCALE,
  BI_DIM_REGIONS_SCALE,
  type BiLevelId,
  type BiQuerySpec,
} from "../src/foundry/bi-warehouse.js";
import { materializeWarehouse, executeSelect, resultSetsEqual, type BiResultSet } from "../src/foundry/bi-oracle.js";
import { recomputeExpected, type DuckWarehouseState, type DuckQuerySpec } from "./fixtures/bi-reference-interpreter.js";
import { renderQuestionIndependent, extractQuestionFields } from "./fixtures/bi-question-fidelity.js";
import { ACCEPTED_GENERATORS, BI_ANALYTICS_GENERATOR_ID } from "../src/foundry/fixture-warehouse.js";
import { walkImportGraph, REPO_ROOT } from "./helpers/import-graph.js";

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

function withinTenPercent(count: number, base: number): boolean {
  return Math.abs(count - base) <= Math.round(0.1 * base);
}

describe("generateBiWarehouse — determinism and row scale (design §1)", () => {
  it("emits four tables whose row counts sit within ±10% of the §8 scales", () => {
    const w = generateBiWarehouse(101);
    expect(withinTenPercent(w.factOrders.length, BI_FACT_ROWS_SCALE)).toBe(true);
    expect(withinTenPercent(w.dimCustomers.length, BI_DIM_CUSTOMERS_SCALE)).toBe(true);
    expect(withinTenPercent(w.dimProducts.length, BI_DIM_PRODUCTS_SCALE)).toBe(true);
    expect(withinTenPercent(w.dimRegions.length, BI_DIM_REGIONS_SCALE)).toBe(true);
  });

  it("same seed twice is deep-equal", () => {
    expect(generateBiWarehouse(101)).toEqual(generateBiWarehouse(101));
  });

  it("a different seed produces different data", () => {
    expect(generateBiWarehouse(101)).not.toEqual(generateBiWarehouse(202));
  });

  it("every fact_orders foreign key resolves to a real dimension row", () => {
    const w = generateBiWarehouse(101);
    const customerIds = new Set(w.dimCustomers.map((c) => c.customerId));
    const productIds = new Set(w.dimProducts.map((p) => p.productId));
    const regionIds = new Set(w.dimRegions.map((r) => r.regionId));
    for (const order of w.factOrders) {
      expect(customerIds.has(order.customerId)).toBe(true);
      expect(productIds.has(order.productId)).toBe(true);
      expect(regionIds.has(order.regionId)).toBe(true);
    }
  });
});

describe("composeReferenceSql / bi-oracle execution — L1 (design §1/§3)", () => {
  it("executes against the materialized warehouse and returns a non-empty result set", () => {
    const warehouse = generateBiWarehouse(101);
    const spec = buildBiQuerySpecs(warehouse, "L1")[0]!;
    const db = materializeWarehouse(warehouse);
    const sql = composeReferenceSql(spec);
    const precomputed = executeSelect(db, sql);
    expect(precomputed.rows.length).toBeGreaterThan(0);
    expect(precomputed.columns.map((c) => c.toLowerCase()).sort()).toEqual([...spec.projection].sort());
  });

  it("recomputeExpected (the independent interpreter) agrees with the executed result under resultSetsEqual", () => {
    const warehouse = generateBiWarehouse(101);
    const spec = buildBiQuerySpecs(warehouse, "L1")[0]!;
    const db = materializeWarehouse(warehouse);
    const precomputed = executeSelect(db, composeReferenceSql(spec));

    const duckState: DuckWarehouseState = {
      factOrders: warehouse.factOrders,
      dimCustomers: warehouse.dimCustomers,
      dimProducts: warehouse.dimProducts,
    };
    const duckSpec: DuckQuerySpec = spec;
    const recomputed = recomputeExpected(duckState, duckSpec);
    const recomputedAsResultSet = {
      columns: recomputed.columns,
      rows: recomputed.rows.map((row) => recomputed.columns.map((c) => row[c])),
    };

    expect(resultSetsEqual(precomputed, recomputedAsResultSet)).toBe(true);
  });
});

describe("BI_ANALYTICS_GENERATOR_ID — deliberately unaccepted (REQ-51)", () => {
  it("is absent from ACCEPTED_GENERATORS", () => {
    expect(ACCEPTED_GENERATORS.has(BI_ANALYTICS_GENERATOR_ID)).toBe(false);
  });

  it("generateBiBattery throws, naming BI_ANALYTICS_GENERATOR_ID", () => {
    const err = thrown(() => generateBiBattery(101, "L1", "bi-tracer"));
    expect(err.message).toContain(BI_ANALYTICS_GENERATOR_ID);
  });
});

describe("BI_GRID — the concrete grid, F-17's formula pinned as an assertion (design §5)", () => {
  it("is exactly L1..L4 with knobValue 1,2,3,4", () => {
    expect(BI_GRID.map((p) => p.id)).toEqual(["L1", "L2", "L3", "L4"]);
    expect(BI_GRID.map((p) => p.knobValue)).toEqual([1, 2, 3, 4]);
  });

  it("F-17: knobValue === 1 + joins + aggregations at every level (the '1 +' base term, pinned, not just commented)", () => {
    for (const point of BI_GRID) {
      expect(point.knobValue).toBe(1 + point.joins + point.aggregations);
    }
  });

  it("biLevel('L9') throws, naming the whole grid", () => {
    const err = thrown(() => biLevel("L9"));
    expect(err.message).toContain("L9");
    for (const point of BI_GRID) expect(err.message).toContain(point.id);
  });
});

describe("buildBiTasks — ten tasks per level, distinct filter values (design §1)", () => {
  const LEVELS: BiLevelId[] = ["L1", "L2", "L3", "L4"];

  it.each(LEVELS)("%s: returns exactly BI_TASKS_PER_SEED_PER_POINT tasks, each with a distinct filter value", (levelId) => {
    const warehouse = generateBiWarehouse(101);
    const tasks = buildBiTasks(warehouse, levelId);
    expect(tasks.length).toBe(BI_TASKS_PER_SEED_PER_POINT);

    const specs = buildBiQuerySpecs(warehouse, levelId);
    const filterValues = new Set(specs.map((s) => s.filter.value));
    expect(filterValues.size).toBe(BI_TASKS_PER_SEED_PER_POINT);
  });

  it("every task carries exactly one output-assertion check", () => {
    const warehouse = generateBiWarehouse(101);
    for (const task of buildBiTasks(warehouse, "L3")) {
      expect(task.checks.length).toBe(1);
      expect(task.checks[0]!.kind).toBe("output-assertion");
    }
  });
});

// ── Task 3: the design's Phase-8 obligations as enforced checks ────────────
// (determinism, the nine-seed equality sweep, F-25 non-empty, leak checks,
// F-22 mechanical independence, F-20 question fidelity).

const SWEEP_SEEDS: readonly number[] = [...BI_STAGE1_SEEDS, ...BI_STAGE2_SEEDS];
const LEVELS: readonly BiLevelId[] = ["L1", "L2", "L3", "L4"];

interface SweepEntry {
  seed: number;
  levelId: BiLevelId;
  spec: BiQuerySpec;
  prompt: string;
  precomputed: BiResultSet;
  recomputed: BiResultSet;
}

/** One materialized warehouse + db PER SWEEP SEED, memoized — the sweep is
 *  9 seeds x 4 levels x 10 tasks = 360 executions; memoizing per seed
 *  (never by reducing the sweep) keeps this file's wall time small. */
const seedCache = new Map<number, { warehouse: ReturnType<typeof generateBiWarehouse>; db: ReturnType<typeof materializeWarehouse> }>();
function seedContext(seed: number) {
  let ctx = seedCache.get(seed);
  if (!ctx) {
    const warehouse = generateBiWarehouse(seed);
    const db = materializeWarehouse(warehouse);
    ctx = { warehouse, db };
    seedCache.set(seed, ctx);
  }
  return ctx;
}

let sweepCache: SweepEntry[] | null = null;
function sweep(): SweepEntry[] {
  if (sweepCache) return sweepCache;
  const entries: SweepEntry[] = [];
  for (const seed of SWEEP_SEEDS) {
    const { warehouse, db } = seedContext(seed);
    for (const levelId of LEVELS) {
      const specs = buildBiQuerySpecs(warehouse, levelId);
      const tasks = buildBiTasks(warehouse, levelId);
      const duckState: DuckWarehouseState = {
        factOrders: warehouse.factOrders,
        dimCustomers: warehouse.dimCustomers,
        dimProducts: warehouse.dimProducts,
      };
      specs.forEach((spec, i) => {
        const precomputed = executeSelect(db, composeReferenceSql(spec));
        const recomputedRaw = recomputeExpected(duckState, spec as DuckQuerySpec);
        const recomputed: BiResultSet = {
          columns: recomputedRaw.columns,
          rows: recomputedRaw.rows.map((row) => recomputedRaw.columns.map((c) => row[c])),
        };
        entries.push({ seed, levelId, spec, prompt: tasks[i]!.prompt, precomputed, recomputed });
      });
    }
  }
  sweepCache = entries;
  return entries;
}

describe("byte-identical replay across the full nine-seed sweep (design §1)", () => {
  it.each(SWEEP_SEEDS as number[])("seed %d: same seed twice is deep-equal", (seed) => {
    expect(generateBiWarehouse(seed)).toEqual(generateBiWarehouse(seed));
  });

  it("distinct seeds move the data", () => {
    const warehouses = SWEEP_SEEDS.map((s) => generateBiWarehouse(s));
    for (let i = 0; i < warehouses.length; i++) {
      for (let j = i + 1; j < warehouses.length; j++) {
        expect(warehouses[i]).not.toEqual(warehouses[j]);
      }
    }
  });
});

describe("the nine-seed equality sweep — precomputed === recomputed across 9 seeds × 4 levels × 10 tasks (design §3 F-23)", () => {
  it("360 task comparisons: every precomputed/recomputed pair is structurally equal under resultSetsEqual", () => {
    const entries = sweep();
    expect(entries.length).toBe(SWEEP_SEEDS.length * LEVELS.length * BI_TASKS_PER_SEED_PER_POINT);
    expect(entries.length).toBe(360);
    let compared = 0;
    for (const entry of entries) {
      expect(resultSetsEqual(entry.precomputed, entry.recomputed)).toBe(true);
      compared++;
    }
    expect(compared).toBe(360);
  });

  it("F-25: every task's expected result set is non-empty across the same 360", () => {
    for (const entry of sweep()) {
      expect(entry.precomputed.rows.length).toBeGreaterThan(0);
    }
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The `assertAnswerNotLeakedV3` idiom (`fixture-warehouse-v3.ts:242-253`),
 *  adapted for the BI cell types: digit-boundary for numbers, token
 *  (word)-boundary for non-empty strings. */
function cellLeaked(prompt: string, cell: unknown): boolean {
  if (typeof cell === "number") {
    const needle = escapeRegExp(String(cell));
    return new RegExp(`(?<!\\d)${needle}(?!\\d)`).test(prompt);
  }
  if (typeof cell === "string" && cell.trim() !== "") {
    const needle = escapeRegExp(cell.trim());
    return new RegExp(`(?<!\\w)${needle}(?!\\w)`).test(prompt);
  }
  return false;
}

describe("leak checks — the prompt never carries the reference SQL text or any expected cell value (design §1, REQ-53)", () => {
  it("no task's prompt contains the reference SQL text", () => {
    for (const entry of sweep()) {
      expect(entry.prompt).not.toContain(composeReferenceSql(entry.spec));
    }
  });

  it("no task's prompt contains any expected cell value at a digit/token boundary", () => {
    for (const entry of sweep()) {
      for (const row of entry.precomputed.rows) {
        for (const cell of row) {
          expect(cellLeaked(entry.prompt, cell)).toBe(false);
        }
      }
    }
  });
});

/** F-22's own literal — the four new BI modules plus the EXISTING
 *  `ANSWER_KEY_FORBIDDEN_MODULES` entries (`test/foundry-fixture-warehouse.test.ts`),
 *  copied here as VALUES rather than imported as a binding: importing
 *  another `.test.ts` file's export would re-register that file's own
 *  `describe`/`it` blocks a second time under vitest. */
const BI_INTERPRETER_FORBIDDEN_MODULES: readonly string[] = [
  "src/foundry/bi-warehouse.ts",
  "src/foundry/bi-oracle.ts",
  "src/foundry/fixture-warehouse.ts",
  "src/foundry/fixture-warehouse-v3.ts",
  "src/foundry/provider.ts",
  "src/foundry/agent-runner.ts",
  "src/foundry/model-layer.ts",
  "src/foundry/runner.ts",
  "src/foundry/spawn.ts",
  "src/foundry/component-tournament.ts",
  "src/foundry/reflective-mutation.ts",
];

function isForbiddenBiModule(repoRelativePath: string): boolean {
  return BI_INTERPRETER_FORBIDDEN_MODULES.includes(repoRelativePath) || repoRelativePath.startsWith("src/mock/");
}

describe("F-22 mechanical independence enforcement (design §3) — the reference interpreter", () => {
  it("the reachable set from bi-reference-interpreter.ts is non-empty and has ZERO intersection with BI_INTERPRETER_FORBIDDEN_MODULES", () => {
    const reachable = walkImportGraph(join(REPO_ROOT, "test/fixtures/bi-reference-interpreter.ts"));
    expect(reachable.size).toBeGreaterThan(0);
    const hits = [...reachable].filter((p) => isForbiddenBiModule(p));
    expect(hits).toEqual([]);
  });

  it("the interpreter's source text never names the SQL engine module (a bare specifier the walker cannot see)", () => {
    const src = readFileSync(join(REPO_ROOT, "test/fixtures/bi-reference-interpreter.ts"), "utf8");
    expect(src).not.toContain("node:sqlite");
  });

  it("discrimination control: the SAME walker started at bi-independence-violation.ts DOES report bi-warehouse.ts", () => {
    const reachable = walkImportGraph(join(REPO_ROOT, "test/fixtures/bi-independence-violation.ts"));
    expect(reachable.has("src/foundry/bi-warehouse.ts")).toBe(true);
  });

  it("bi-question-fidelity.ts is ALSO import-clean, exactly as the interpreter is", () => {
    const reachable = walkImportGraph(join(REPO_ROOT, "test/fixtures/bi-question-fidelity.ts"));
    expect(reachable.size).toBeGreaterThan(0);
    const hits = [...reachable].filter((p) => isForbiddenBiModule(p));
    expect(hits).toEqual([]);
    const src = readFileSync(join(REPO_ROOT, "test/fixtures/bi-question-fidelity.ts"), "utf8");
    expect(src).not.toContain("node:sqlite");
  });
});

describe("question fidelity — F-20's Phase-8 obligation (design §3)", () => {
  it("across the nine-seed sweep, the generator's rendering and the independent rendering agree field-for-field, and both agree with the spec", () => {
    for (const entry of sweep()) {
      const fromGenerator = extractQuestionFields(renderQuestion(entry.spec));
      const fromIndependent = extractQuestionFields(renderQuestionIndependent(entry.spec));
      expect(fromGenerator).toEqual(fromIndependent);

      expect([...fromGenerator.tables].sort()).toEqual([...entry.spec.tables].sort());
      expect(fromGenerator.filterColumn).toBe(entry.spec.filter.column);
      expect(fromGenerator.filterValue).toBe(entry.spec.filter.value);
      expect(fromGenerator.groupBy).toEqual(entry.spec.groupBy);
      expect(fromGenerator.aggregateFn).toBe(entry.spec.aggregate?.fn ?? null);
      expect(fromGenerator.aggregateColumn).toBe(entry.spec.aggregate?.column ?? null);
      expect(fromGenerator.aggregateAlias).toBe(entry.spec.aggregate?.alias ?? null);
      expect([...fromGenerator.projection].sort()).toEqual([...entry.spec.projection].sort());
    }
  });
});
