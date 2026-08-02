/**
 * v3 battery generator tests — `experiments/dataops-agent-pilot/V3-BATTERY-DESIGN.md`
 * rev 2, steps 1-3 of the build sequence in `HANDOFF-V3.md` §1.
 *
 * Three jobs, in ascending order of what they would catch:
 *   1. The generator is what the design says (structure, determinism, the
 *      pre-registered grid, the acceptance gate).
 *   2. The INDEPENDENT REFERENCE INTERPRETER reproduces every stored fact
 *      across a seed sweep at every grid point (design S2). This is the check
 *      that a derivation bug cannot survive.
 *   3. The extended LEAK CHECKS (design S6): no shortcut that skips the
 *      reasoning the levers exist to demand may score well — measured, not
 *      asserted by inspection.
 */
import { describe, expect, it } from "vitest";
import {
  V3_GRID,
  buildTasksV3,
  generateFixtureBatteryV3,
  generateFixtureSplitBatteryV3,
  generateWarehouseV3,
  v3Knobs,
  type FixtureWarehouseV3,
  type V3Knobs,
} from "../src/foundry/fixture-warehouse-v3.js";
import { ACCEPTED_GENERATORS, DATA_OPS_GENERATOR_V3_ID } from "../src/foundry/fixture-warehouse.js";
import { recomputeFact } from "./fixtures/v3-reference-interpreter.js";

/** The sweep every seed-dependent claim is measured over. */
const SWEEP_SEEDS = [1, 7, 42, 1234, 99991];

/** Parse the emitted CSV into header-keyed cells — test-local, so the leak
 *  checks below never borrow the generator's or the interpreter's reader. */
function rowsOf(warehouse: FixtureWarehouseV3): Record<string, string>[] {
  const lines = warehouse.csv.trim().split("\n");
  const header = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/** Test-local amount reader, written independently of both other copies. */
function cents(row: Record<string, string>): number {
  const raw = (row.rawAmount ?? "").trim() || (row.amountBackup ?? "").trim();
  if (raw === "") return 0;
  const sign = raw.startsWith("-") ? -1 : 1;
  const body = raw.replace("-", "").replace("$", "");
  return sign * (body.includes(".") ? Math.round(Number(body) * 100) : Number(body));
}

describe("v3 generator — structure and the pre-registered grid", () => {
  it("carries exactly the five pre-registered grid points, as point values", () => {
    expect(V3_GRID.map((k) => k.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    expect(V3_GRID.map((k) => k.conflictFraction)).toEqual([0.5, 0.5, 1.0, 1.0, 1.0]);
    expect(V3_GRID.map((k) => k.refundRate)).toEqual([0, 0.1, 0.15, 0.15, 0.15]);
    expect(V3_GRID.map((k) => k.dualDates)).toEqual([false, false, false, true, true]);
    expect(V3_GRID.map((k) => k.groupSizeMax)).toEqual([20, 20, 20, 20, 30]);
    // S5: the refund cap that keeps a filter error from cascading the graded
    // score off the REVENUE_ZERO_AT cliff.
    for (const knobs of V3_GRID) expect(knobs.refundRate).toBeLessThanOrEqual(0.15);
  });

  it("refuses an unknown grid point by name", () => {
    expect(() => v3Knobs("G9")).toThrow(/unknown grid point/);
  });

  it("emits 10 fact groups — 5 customers x 2 months (design S1)", () => {
    for (const knobs of V3_GRID) {
      const w = generateWarehouseV3(7, knobs);
      expect(w.facts).toHaveLength(10);
      expect(new Set(w.facts.map((f) => f.customerId)).size).toBe(5);
      expect(new Set(w.facts.map((f) => f.month)).size).toBe(2);
      expect(buildTasksV3(w)).toHaveLength(10);
    }
  });

  it("replays exactly from one seed, and different seeds move the FACTS", () => {
    for (const knobs of V3_GRID) {
      expect(generateWarehouseV3(7, knobs).csv).toBe(generateWarehouseV3(7, knobs).csv);
      const a = generateWarehouseV3(7, knobs).facts.map((f) => f.revenueCents);
      const b = generateWarehouseV3(8, knobs).facts.map((f) => f.revenueCents);
      expect(a).not.toEqual(b);
    }
  });

  it("keeps every field under 6 digits while every net answer stays at 6+", () => {
    for (const knobs of V3_GRID) {
      for (const seed of SWEEP_SEEDS) {
        const w = generateWarehouseV3(seed, knobs);
        for (const fact of w.facts) expect(fact.revenueCents).toBeGreaterThanOrEqual(100_000);
        for (const row of rowsOf(w)) expect(Math.abs(cents(row))).toBeLessThan(100_000);
      }
    }
  });

  it("drops the L2 and L3 columns at grid points where those levers are off", () => {
    const header = (k: V3Knobs) => generateWarehouseV3(7, k).csv.split("\n")[0]!;
    expect(header(v3Knobs("G1"))).not.toContain("type");
    expect(header(v3Knobs("G1"))).not.toContain("orderDate");
    expect(header(v3Knobs("G2"))).toContain("type");
    expect(header(v3Knobs("G2"))).not.toContain("orderDate");
    expect(header(v3Knobs("G4"))).toContain("orderDate");
  });

  it("blocks every construction path until a human accepts the v3 generator", () => {
    // The acceptance event must come from Dr. Robert Li in session; this test
    // is what proves the gate is real rather than decorative. It FLIPS once
    // the entry exists, and that is the intended signal.
    expect(ACCEPTED_GENERATORS.has(DATA_OPS_GENERATOR_V3_ID)).toBe(false);
    expect(() => generateFixtureBatteryV3(7, "b", v3Knobs("G3"))).toThrow(/not in ACCEPTED_GENERATORS/);
    expect(() => generateFixtureSplitBatteryV3(7, v3Knobs("G3"))).toThrow(/not in ACCEPTED_GENERATORS/);
  });
});

describe("v3 pipeline — hand-computed oracle", () => {
  /**
   * The generator and the interpreter share no code, but they share an AUTHOR
   * and a source document, so their agreement could still encode one
   * misreading of the design held in both. This case is worked by hand from
   * the published rule text, on data small enough to check by eye, and it
   * pins every step that the design had to argue about:
   *
   *   ord-1  two rows, distinct `updatedAt`      -> latest wins (60000, not 50000)
   *   ord-2  amount empty, carried in backup     -> $100.00 = 10000
   *   ord-3  two rows, SAME `updatedAt`          -> larger amount wins (70000)
   *   ord-4  right customer, WRONG month         -> filtered out at step 4
   *   ord-5  right month, WRONG customer         -> filtered out at step 4
   *   rfd-1  references a survivor               -> valid, subtracts 10000
   *   rfd-2  references ord-4 (April)            -> DANGLING: survived the file,
   *                                                 not the post-filter set
   *   rfd-3  references an id that exists nowhere-> DANGLING
   *   adj-1  signed, references a survivor       -> valid, adds -2500
   *   adj-2  references cust-B's ord-5           -> DANGLING
   *
   * orderCount = 3 (ord-1, ord-2, ord-3 — refunds and adjustments are not
   * orders). revenueCents = 60000 + 10000 + 70000 - 10000 - 2500 = 127500.
   *
   * rfd-2 is the case the panel called ambiguous and the design closed: it
   * carries the right customer and the right payment month, so it reaches
   * step 5, and it is rejected there because `origOrderId` must name an order
   * that survived steps 2-4, not merely one that appears in the file.
   */
  const HAND_CSV = [
    "orderId,customerId,type,origOrderId,paymentDate,updatedAt,rawAmount,amountBackup",
    "ord-1,cust-A,order,,2026-03-05,2026-03-10,50000,",
    "ord-1,cust-A,order,,2026-03-05,2026-03-12,60000,",
    "ord-2,cust-A,order,,2026-03-07,2026-03-11,,$100.00",
    "ord-3,cust-A,order,,2026-03-08,2026-03-11,70000,",
    "ord-3,cust-A,order,,2026-03-08,2026-03-11,65000,",
    "ord-4,cust-A,order,,2026-04-02,2026-04-05,80000,",
    "ord-5,cust-B,order,,2026-03-09,2026-03-10,90000,",
    "rfd-1,cust-A,refund,ord-2,2026-03-15,2026-03-16,10000,",
    "rfd-2,cust-A,refund,ord-4,2026-03-16,2026-03-17,80000,",
    "rfd-3,cust-A,refund,ord-99,2026-03-17,2026-03-18,5000,",
    "adj-1,cust-A,adjustment,ord-1,2026-03-18,2026-03-19,-2500,",
    "adj-2,cust-A,adjustment,ord-5,2026-03-19,2026-03-20,3000,",
  ].join("\n");

  it("the interpreter reproduces a by-hand walk of all six steps", () => {
    expect(recomputeFact(HAND_CSV, "cust-A", "2026-03")).toEqual({
      orderCount: 3,
      revenueCents: 127_500,
    });
  });

  it("the other customer's group is unaffected by the first one's dangling rows", () => {
    expect(recomputeFact(HAND_CSV, "cust-B", "2026-03")).toEqual({
      orderCount: 1,
      revenueCents: 90_000,
    });
  });
});

describe("v3 generator — independent reference interpreter (design S2)", () => {
  it("recomputes every stored fact from the emitted CSV alone, across the sweep", () => {
    for (const knobs of V3_GRID) {
      for (const seed of SWEEP_SEEDS) {
        const w = generateWarehouseV3(seed, knobs);
        for (const fact of w.facts) {
          const recomputed = recomputeFact(w.csv, fact.customerId, fact.month);
          expect({ point: knobs.id, seed, group: `${fact.customerId}/${fact.month}`, ...recomputed })
            .toEqual({
              point: knobs.id,
              seed,
              group: `${fact.customerId}/${fact.month}`,
              orderCount: fact.orderCount,
              revenueCents: fact.revenueCents,
            });
        }
      }
    }
  });
});

/**
 * The leak checks. Each shortcut is a strategy a candidate could run WITHOUT
 * doing the reasoning the lever exists to demand; each must fail. "Fail" is
 * measured as an exact-match rate against the answer key over the whole sweep,
 * because a shortcut that lands occasionally by luck is fine and one that
 * lands routinely is a silent difficulty deflation.
 *
 * The threshold is 0.10 — at 50 groups per grid point, a shortcut matching 5+
 * times is doing better than chance on a 6-digit integer and is a real leak.
 */
const LEAK_THRESHOLD = 0.1;

/** Run `strategy` over every group at `knobs` and return its exact-match rate. */
function shortcutMatchRate(
  knobs: V3Knobs,
  strategy: (rows: Record<string, string>[], customerId: string, month: string) => number,
): number {
  let matched = 0;
  let total = 0;
  for (const seed of SWEEP_SEEDS) {
    const w = generateWarehouseV3(seed, knobs);
    const rows = rowsOf(w);
    for (const fact of w.facts) {
      total += 1;
      if (strategy(rows, fact.customerId, fact.month) === fact.revenueCents) matched += 1;
    }
  }
  return matched / total;
}

/** Rows this customer/month owns by `paymentDate`, before any dedup. */
function groupRows(rows: Record<string, string>[], customerId: string, month: string) {
  return rows.filter((r) => r.customerId === customerId && (r.paymentDate ?? "").startsWith(month));
}

/** Collapse to one row per orderId by a caller-chosen rule. */
function collapse(
  rows: Record<string, string>[],
  better: (candidate: Record<string, string>, held: Record<string, string>) => boolean,
): Record<string, string>[] {
  const winners = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const held = winners.get(row.orderId!);
    if (!held || better(row, held)) winners.set(row.orderId!, row);
  }
  return [...winners.values()];
}

/** Sum a collapsed set the way a candidate that ignored step 5 would: every
 *  refund and adjustment counted, valid or not. */
function sumIgnoringValidity(kept: Record<string, string>[]): number {
  return kept.reduce((sum, r) => {
    const type = r.type ?? "order";
    if (type === "refund") return sum - cents(r);
    return sum + cents(r);
  }, 0);
}

describe("v3 generator — leak checks (design S6)", () => {
  it("L1: 'no deduplication at all' never recovers the answer", () => {
    for (const knobs of V3_GRID) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) => sumIgnoringValidity(groupRows(rows, c, m)));
      expect(`${knobs.id}:${rate}`).toBe(`${knobs.id}:0`);
    }
  });

  it("L1: 'the last row in the file wins' never recovers the answer", () => {
    // Row order is shuffled independently of `updatedAt`, so file position
    // carries no information about which duplicate is current.
    for (const knobs of V3_GRID) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) =>
        sumIgnoringValidity(collapse(groupRows(rows, c, m), () => true)),
      );
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("L1: 'the first row in the file wins' never recovers the answer", () => {
    for (const knobs of V3_GRID) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) =>
        sumIgnoringValidity(collapse(groupRows(rows, c, m), () => false)),
      );
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("L1: 'take the largest amount per orderId' never recovers the answer", () => {
    // The decoy on a stale row is LARGER than the truth about half the time,
    // precisely so this shortcut cannot substitute for comparing timestamps.
    for (const knobs of V3_GRID) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) =>
        sumIgnoringValidity(collapse(groupRows(rows, c, m), (cand, held) => cents(cand) > cents(held))),
      );
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("L1: 'take the smallest amount per orderId' never recovers the answer", () => {
    // The mirror of the check above. Every group is guaranteed a tie-break
    // conflict whose decoy is SMALLER than the truth, so the opposite
    // heuristic is no more usable than the first.
    for (const knobs of V3_GRID) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) =>
        sumIgnoringValidity(collapse(groupRows(rows, c, m), (cand, held) => cents(cand) < cents(held))),
      );
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("L2: 'every refund and adjustment is valid' never recovers the answer", () => {
    for (const knobs of V3_GRID.filter((k) => k.refundRate > 0)) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) =>
        sumIgnoringValidity(
          collapse(groupRows(rows, c, m), (cand, held) =>
            cand.updatedAt! > held.updatedAt! ||
            (cand.updatedAt === held.updatedAt && cents(cand) > cents(held)),
          ),
        ),
      );
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("L3: 'bucket by orderDate' never recovers the answer", () => {
    for (const knobs of V3_GRID.filter((k) => k.dualDates)) {
      const rate = shortcutMatchRate(knobs, (rows, c, m) => {
        const byOrderDate = rows.filter(
          (r) => r.customerId === c && (r.orderDate ?? "").startsWith(m),
        );
        return sumIgnoringValidity(
          collapse(byOrderDate, (cand, held) =>
            cand.updatedAt! > held.updatedAt! ||
            (cand.updatedAt === held.updatedAt && cents(cand) > cents(held)),
          ),
        );
      });
      expect(rate).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });

  it("no metadata column trivially encodes either answer (decoy-column check)", () => {
    for (const knobs of V3_GRID) {
      for (const seed of SWEEP_SEEDS) {
        const w = generateWarehouseV3(seed, knobs);
        const rows = rowsOf(w);
        for (const fact of w.facts) {
          const mine = groupRows(rows, fact.customerId, fact.month);
          // Raw row count is not the order count, and no column's raw sum is
          // the net revenue.
          expect(mine.length).not.toBe(fact.orderCount);
          for (const column of Object.keys(rows[0]!)) {
            const sum = mine.reduce((acc, r) => acc + (Number(r[column]) || 0), 0);
            expect(`${column}:${sum}`).not.toBe(`${column}:${fact.revenueCents}`);
          }
        }
      }
    }
  });

  it("L1xL2xL3 combined: the full-lever points leak no more than the simple ones", () => {
    // claude's interaction-leak point: each lever gets its own check above,
    // but a refund can coincidentally cancel a conflict. Measured directly on
    // the combined battery rather than argued from the parts.
    for (const knobs of [v3Knobs("G4"), v3Knobs("G5")]) {
      const naive = shortcutMatchRate(knobs, (rows, c, m) => {
        const byOrderDate = rows.filter(
          (r) => r.customerId === c && (r.orderDate ?? "").startsWith(m),
        );
        return sumIgnoringValidity(collapse(byOrderDate, () => true));
      });
      expect(naive).toBeLessThanOrEqual(LEAK_THRESHOLD);
    }
  });
});

describe("v3 generator — row order carries no timestamp signal (design S6)", () => {
  it("file position and updatedAt rank are uncorrelated", () => {
    const w = generateWarehouseV3(42, v3Knobs("G4"));
    const rows = rowsOf(w);
    const byTime = [...rows].sort((a, b) => a.updatedAt!.localeCompare(b.updatedAt!));
    const rank = new Map(byTime.map((r, i) => [r, i]));
    const n = rows.length;
    const mean = (n - 1) / 2;
    let cov = 0;
    let varPos = 0;
    let varRank = 0;
    rows.forEach((row, i) => {
      const dPos = i - mean;
      const dRank = rank.get(row)! - mean;
      cov += dPos * dRank;
      varPos += dPos * dPos;
      varRank += dRank * dRank;
    });
    expect(Math.abs(cov / Math.sqrt(varPos * varRank))).toBeLessThan(0.15);
  });
});
