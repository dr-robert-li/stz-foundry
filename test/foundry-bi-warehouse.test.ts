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
import {
  generateBiWarehouse,
  buildBiQuerySpecs,
  composeReferenceSql,
  generateBiBattery,
  BI_FACT_ROWS_SCALE,
  BI_DIM_CUSTOMERS_SCALE,
  BI_DIM_PRODUCTS_SCALE,
  BI_DIM_REGIONS_SCALE,
} from "../src/foundry/bi-warehouse.js";
import { materializeWarehouse, executeSelect, resultSetsEqual } from "../src/foundry/bi-oracle.js";
import { recomputeExpected, type DuckWarehouseState, type DuckQuerySpec } from "./fixtures/bi-reference-interpreter.js";
import { ACCEPTED_GENERATORS, BI_ANALYTICS_GENERATOR_ID } from "../src/foundry/fixture-warehouse.js";

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
