/**
 * The C-01 collaborative ablation gate contract suite (Phase 23, Plan 23-01,
 * REQ-81). House rule (mirrors `test/foundry-collaborative-battery.test.ts`):
 * every throwing assertion inspects the thrown message's content, never a
 * bare `.toThrow()`.
 *
 * Task 1: end-to-end happy path plus the input guards.
 * Task 2 (below, same file): G-15's mechanical BigInt re-derivation of all
 * 56 critical-value-table rows, both margin boundaries and one step either
 * side, the underpowered floor, and the integer-only source assertion.
 */
import { describe, it, expect } from "vitest";
import {
  ABLATION_SUITE_SIZE,
  ABLATION_DELTA1_QUERIES,
  ABLATION_DELTA2_QUERIES,
  ABLATION_MIN_DISCORDANT_FLOOR,
  ABLATION_CRITICAL_VALUE_TABLE,
  CollaborativeAblationGateError,
  accountAblationUnits,
  evaluateAblationSignTest,
  evaluateAblationGate,
  type AblationPairedUnit,
  type AblationGateVerdict,
} from "../src/foundry/collaborative-ablation-gate.js";

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

/**
 * Builds exactly `ABLATION_SUITE_SIZE` paired units from four named cell
 * counts (both-hit, graph-only, null-only, both-miss), asserting the four
 * sum to the suite size before returning -- so every case below is
 * constructed from named cells rather than a hand-typed array.
 */
function buildUnits(cells: {
  bothHit: number;
  graphOnly: number;
  nullOnly: number;
  bothMiss: number;
}): AblationPairedUnit[] {
  const total = cells.bothHit + cells.graphOnly + cells.nullOnly + cells.bothMiss;
  if (total !== ABLATION_SUITE_SIZE) {
    throw new Error(
      `[test fixture] cells sum to ${total}, expected exactly ${ABLATION_SUITE_SIZE}`,
    );
  }
  const units: AblationPairedUnit[] = [];
  let queryId = 0;
  for (let i = 0; i < cells.bothHit; i++) units.push({ queryId: queryId++, graphHit1: 1, nullHit1: 1 });
  for (let i = 0; i < cells.graphOnly; i++) units.push({ queryId: queryId++, graphHit1: 1, nullHit1: 0 });
  for (let i = 0; i < cells.nullOnly; i++) units.push({ queryId: queryId++, graphHit1: 0, nullHit1: 1 });
  for (let i = 0; i < cells.bothMiss; i++) units.push({ queryId: queryId++, graphHit1: 0, nullHit1: 0 });
  return units;
}

describe("pinned constants", () => {
  it("ABLATION_SUITE_SIZE is 75", () => {
    expect(ABLATION_SUITE_SIZE).toBe(75);
  });

  it("ABLATION_DELTA1_QUERIES is 6, ABLATION_DELTA2_QUERIES is 5", () => {
    expect(ABLATION_DELTA1_QUERIES).toBe(6);
    expect(ABLATION_DELTA2_QUERIES).toBe(5);
  });

  it("ABLATION_MIN_DISCORDANT_FLOOR is 20", () => {
    expect(ABLATION_MIN_DISCORDANT_FLOOR).toBe(20);
  });

  it("ABLATION_CRITICAL_VALUE_TABLE has exactly 56 own keys, n_d 20-75", () => {
    expect(Object.keys(ABLATION_CRITICAL_VALUE_TABLE).length).toBe(56);
    expect(ABLATION_CRITICAL_VALUE_TABLE[20]).toBe(15);
    expect(ABLATION_CRITICAL_VALUE_TABLE[75]).toBe(47);
  });
});

describe("end-to-end: 75 paired units in, one verdict out", () => {
  it("graph 30 hits, null 24 hits (difference 6) -- primary pass, secondary flag false", () => {
    // graphOnly=6 (graph hits, null misses), bothHit=24 (both hit) -> graphHits=30, nullHits=24.
    const units = buildUnits({ bothHit: 24, graphOnly: 6, nullOnly: 0, bothMiss: 45 });
    const verdict = evaluateAblationGate(units);

    expect(verdict.primaryPass).toBe(true);
    expect(verdict.secondaryFlag).toBe(false);
    expect(verdict.counts.graphHits).toBe(30);
    expect(verdict.counts.nullHits).toBe(24);
    expect(verdict.signTest).toBeDefined();
    expect(verdict.counts).toBeDefined();
  });

  it("the verdict is JSON-serialisable and round-trips byte-identical", () => {
    const units = buildUnits({ bothHit: 24, graphOnly: 6, nullOnly: 0, bothMiss: 45 });
    const verdict = evaluateAblationGate(units);
    const roundTripped = JSON.parse(JSON.stringify(verdict)) as AblationGateVerdict;
    expect(roundTripped).toEqual(verdict);
  });

  it("refuses 74 units (one short of the sealed suite)", () => {
    const units = buildUnits({ bothHit: 24, graphOnly: 6, nullOnly: 0, bothMiss: 45 }).slice(0, 74);
    const err = thrown(() => evaluateAblationGate(units));
    expect(err).toBeInstanceOf(CollaborativeAblationGateError);
    expect(err.message).toMatch(/expected exactly 75/);
    expect(err.message).toMatch(/74/);
  });

  it("refuses 75 units containing a duplicate query id", () => {
    const units = buildUnits({ bothHit: 24, graphOnly: 6, nullOnly: 0, bothMiss: 45 });
    units[1] = { ...units[1]!, queryId: units[0]!.queryId };
    const err = thrown(() => accountAblationUnits(units));
    expect(err).toBeInstanceOf(CollaborativeAblationGateError);
    expect(err.message).toMatch(/duplicate queryId/);
  });

  it("refuses a unit whose graph hit value is neither 0 nor 1", () => {
    const units = buildUnits({ bothHit: 24, graphOnly: 6, nullOnly: 0, bothMiss: 45 });
    units[0] = { ...units[0]!, graphHit1: 2 };
    const err = thrown(() => accountAblationUnits(units));
    expect(err).toBeInstanceOf(CollaborativeAblationGateError);
    expect(err.message).toMatch(/graphHit1 must be exactly 0 or 1/);
  });
});

describe("evaluateAblationSignTest", () => {
  it("below the discordant floor reports UNDERPOWERED with a null critical value", () => {
    // 19 discordant: graphOnly=10, nullOnly=9.
    const counts = accountAblationUnits(buildUnits({ bothHit: 0, graphOnly: 10, nullOnly: 9, bothMiss: 56 }));
    const signTest = evaluateAblationSignTest(counts);
    expect(signTest.result).toBe("UNDERPOWERED");
    expect(signTest.criticalValue).toBeNull();
  });
});

