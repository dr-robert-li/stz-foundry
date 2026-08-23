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
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    const units = buildUnits({ bothHit: 0, graphOnly: 10, nullOnly: 9, bothMiss: 56 });
    const counts = accountAblationUnits(units);
    const signTest = evaluateAblationSignTest(counts);
    expect(signTest.result).toBe("UNDERPOWERED");
    expect(signTest.criticalValue).toBeNull();

    // G-18: the underpowered floor governs the sign test's own output only
    // -- it never blocks or alters the primary margin gate, which is still
    // computed on the raw paired counts regardless of the discordant count.
    const verdict = evaluateAblationGate(units);
    expect(verdict.primaryPass).toBeDefined();
    expect(typeof verdict.primaryPass).toBe("boolean");
    expect(verdict.signTest.result).toBe("UNDERPOWERED");
  });

  it("discordant 20 with graph-only 15 -- graph-superior", () => {
    const counts = accountAblationUnits(
      buildUnits({ bothHit: 0, graphOnly: 15, nullOnly: 5, bothMiss: 55 }),
    );
    expect(evaluateAblationSignTest(counts).result).toBe("GRAPH-SUPERIOR");
  });

  it("discordant 20 with graph-only 14 -- indistinguishable", () => {
    const counts = accountAblationUnits(
      buildUnits({ bothHit: 0, graphOnly: 14, nullOnly: 6, bothMiss: 55 }),
    );
    expect(evaluateAblationSignTest(counts).result).toBe("INDISTINGUISHABLE");
  });

  it("discordant 20 with graph-only 5 -- null-superior (20 minus the critical value 15)", () => {
    const counts = accountAblationUnits(
      buildUnits({ bothHit: 0, graphOnly: 5, nullOnly: 15, bothMiss: 55 }),
    );
    expect(evaluateAblationSignTest(counts).result).toBe("NULL-SUPERIOR");
  });
});

describe("margin boundaries (both inclusive, one step either side)", () => {
  it("graph-only 6, null-only 0 -- primary difference 6, primary pass true", () => {
    const verdict = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 6, nullOnly: 0, bothMiss: 69 }));
    expect(verdict.primaryDifference).toBe(6);
    expect(verdict.primaryPass).toBe(true);
  });

  it("graph-only 5, null-only 0 -- primary difference 5, primary pass false", () => {
    const verdict = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 5, nullOnly: 0, bothMiss: 70 }));
    expect(verdict.primaryDifference).toBe(5);
    expect(verdict.primaryPass).toBe(false);
  });

  it("graph-only 8, null-only 2 -- primary difference 6, primary pass true (the gate reads the difference of totals, not the graph-only cell)", () => {
    const verdict = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 8, nullOnly: 2, bothMiss: 65 }));
    expect(verdict.primaryDifference).toBe(6);
    expect(verdict.primaryPass).toBe(true);
  });

  it("null-only 5, graph-only 0 -- secondary difference 5, secondary flag true, primary pass false", () => {
    const verdict = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 0, nullOnly: 5, bothMiss: 70 }));
    expect(verdict.secondaryDifference).toBe(5);
    expect(verdict.secondaryFlag).toBe(true);
    expect(verdict.primaryPass).toBe(false);
  });

  it("null-only 4, graph-only 0 -- secondary difference 4, secondary flag false", () => {
    const verdict = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 0, nullOnly: 4, bothMiss: 71 }));
    expect(verdict.secondaryDifference).toBe(4);
    expect(verdict.secondaryFlag).toBe(false);
  });
});

describe("the secondary flag is a diagnostic, never the verdict", () => {
  it("two runs with the same primaryPass outcome, one firing the secondary flag and one not", () => {
    // D = graphHits - nullHits = -6: secondaryDifference = 6 >= delta2 (5) -> flag fires.
    const flagged = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 0, nullOnly: 6, bothMiss: 69 }));
    // D = 0: secondaryDifference = 0, below delta2 -> flag does not fire.
    const unflagged = evaluateAblationGate(buildUnits({ bothHit: 0, graphOnly: 2, nullOnly: 2, bothMiss: 71 }));

    expect(flagged.secondaryFlag).toBe(true);
    expect(unflagged.secondaryFlag).toBe(false);
    // Both fall short of the primary margin (D < 6 in both cases), so
    // primaryPass reads false in both regardless of the secondary flag --
    // nothing in evaluateAblationGate lets the flag feed back into the
    // primary field.
    expect(flagged.primaryPass).toBe(unflagged.primaryPass);
    expect(flagged.primaryPass).toBe(false);
  });
});

describe("G-15: mechanical BigInt re-derivation of all 56 critical-value-table rows", () => {
  /**
   * Exact integer binomial-coefficient row for a given `n`, `C(n, 0..n)`,
   * built by Pascal's-triangle recurrence in BigInt end to end -- never a
   * factorial division through a float, and never `Math.pow`/`Math.log`
   * anywhere in this derivation. Local to this test file, never imported
   * from the module under test.
   */
  function binomialRow(n: number): bigint[] {
    const row: bigint[] = [1n];
    for (let k = 1; k <= n; k++) {
      row.push((row[k - 1]! * BigInt(n - k + 1)) / BigInt(k));
    }
    return row;
  }

  /**
   * §7's exact combinatorial condition: the smallest integer c such that
   * 40 * sum_{i=c}^{n} C(n, i) <= 2^n. The suffix sum is accumulated from
   * i = n down to i = 0, entirely in BigInt -- no `Number` arithmetic
   * anywhere in this derivation.
   */
  function deriveCriticalValue(n: number): number {
    const row = binomialRow(n);
    const twoToN = 1n << BigInt(n);
    const perTailSignificanceReciprocal = 40n;
    let runningSum = row.reduce((sum, value) => sum + value, 0n);
    for (let c = 0; c <= n; c++) {
      if (perTailSignificanceReciprocal * runningSum <= twoToN) return c;
      runningSum -= row[c]!;
    }
    throw new Error(`[test] no critical value satisfies §7's condition for n_d=${n}`);
  }

  it("re-derives every n_d from 20 through 75 (56 rows, none skipped) from §7's own condition", () => {
    let visited = 0;
    for (let nd = ABLATION_MIN_DISCORDANT_FLOOR; nd <= ABLATION_SUITE_SIZE; nd++) {
      const derived = deriveCriticalValue(nd);
      expect(derived).toBe(ABLATION_CRITICAL_VALUE_TABLE[nd]);
      visited++;
    }
    expect(visited).toBe(56);
  });
});

describe("integer-only source discipline", () => {
  it("the module's executable code contains no division operator and no decimal literal (comments excluded)", () => {
    const modulePath = join(repoRoot, "src", "foundry", "collaborative-ablation-gate.ts");
    const source = readFileSync(modulePath, "utf8");

    // Strip every block-comment region, then every line whose trimmed form
    // starts with a line-comment marker -- comment-stripping is part of
    // this assertion, not a separate fragile pipeline.
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutLineComments = withoutBlockComments
      .split("\n")
      .map((line) => (line.trimStart().startsWith("//") ? "" : line))
      .join("\n");

    // No division operator between two operands.
    expect(withoutLineComments).not.toMatch(/\d\s*\/\s*\d/);
    // No numeric literal containing a decimal point.
    expect(withoutLineComments).not.toMatch(/\d+\.\d+/);
  });
});
