import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PAIRED_CRITICAL_VALUE_TABLE,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_BATTERY_SIZE,
  PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 14-03, Task 2 (REQ-69, F-11's drift-guard obligation). Re-derives all
// 41 pinned critical values in exact BigInt integer arithmetic — never a
// floating-point approximation, which would silently produce wrong values in
// the upper rows where 2^n_d and the binomial coefficients at that size
// exceed a double's exact-integer range — then binds the transcribed table
// to the frozen design document's own §9 table, read off disk. Mirrors
// `test/dualfix-study-prereg-sync.test.ts`'s read-the-frozen-document-off-
// disk pattern.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");

const RECIPROCAL = BigInt(PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL);
const FLOOR = PAIRED_MIN_DISCORDANT_FLOOR;
const SIZE = PAIRED_BATTERY_SIZE;

/**
 * Exact integer binomial-coefficient row for a given `n`, `C(n, 0..n)`,
 * built by Pascal's-triangle recurrence in BigInt end to end — never a
 * factorial division through a float, and never `Math.pow`/`Math.log`
 * anywhere in this derivation.
 */
function binomialRow(n: number): bigint[] {
  const row: bigint[] = [1n];
  for (let k = 1; k <= n; k++) {
    // C(n, k) = C(n, k-1) * (n - k + 1) / k — exact BigInt division: the
    // running product is always divisible by k at this point in the
    // standard incremental-binomial recurrence.
    row.push((row[k - 1]! * BigInt(n - k + 1)) / BigInt(k));
  }
  return row;
}

/**
 * §5's exact combinatorial condition: the smallest integer `c` such that
 * `RECIPROCAL * sum_{i=c}^{n} C(n, i) <= 2^n`. The suffix sum is
 * accumulated from `i = n` down to `i = 0`, entirely in BigInt.
 */
function deriveCriticalValue(n: number): number {
  const row = binomialRow(n);
  const twoToN = 1n << BigInt(n);
  // The suffix sum sum_{i=c}^{n} C(n,i) is monotonically non-increasing as
  // c increases, so the first c from 0 upward satisfying the condition is
  // the smallest such c — walk c from 0 upward, subtracting C(n,c) out of
  // a running total each step.
  let runningSum = row.reduce((sum, value) => sum + value, 0n);
  for (let c = 0; c <= n; c++) {
    if (RECIPROCAL * runningSum <= twoToN) return c;
    runningSum -= row[c]!;
  }
  throw new Error(`[paired-critical-value-drift] no critical value satisfies the condition for n=${n}`);
}

describe("paired critical-value table drift guard (F-11)", () => {
  it(`re-derives all ${SIZE - FLOOR + 1} rows in exact BigInt arithmetic and matches the transcribed table`, () => {
    for (let nd = FLOOR; nd <= SIZE; nd++) {
      const derived = deriveCriticalValue(nd);
      expect(derived, `n_d=${nd}`).toBe(PAIRED_CRITICAL_VALUE_TABLE[nd]);
    }
  });

  it("the transcribed table's key set is exactly the contiguous range from the floor to the battery size", () => {
    const keys = Object.keys(PAIRED_CRITICAL_VALUE_TABLE)
      .map(Number)
      .sort((a, b) => a - b);
    const expectedKeys = Array.from({ length: SIZE - FLOOR + 1 }, (_, i) => FLOOR + i);
    expect(keys).toEqual(expectedKeys);
  });

  describe("bound to the frozen document's own §9 table, parsed off disk", () => {
    const rowPattern = /^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm;
    const docRows: Array<{ nd: number; c: number; ndMinusC: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(preregText)) !== null) {
      docRows.push({ nd: Number(match[1]), c: Number(match[2]), ndMinusC: Number(match[3]) });
    }

    it("parses exactly the pinned range's row count off disk (catches a dropped or duplicated row)", () => {
      expect(docRows).toHaveLength(SIZE - FLOOR + 1);
      expect(docRows.map((r) => r.nd)).toEqual(Array.from({ length: SIZE - FLOOR + 1 }, (_, i) => FLOOR + i));
    });

    for (const nd of [FLOOR, FLOOR + 1, Math.floor((FLOOR + SIZE) / 2), SIZE - 1, SIZE]) {
      it(`the document's own row for n_d=${nd} agrees with the module on all three columns`, () => {
        const row = docRows.find((r) => r.nd === nd);
        expect(row, `no document row for n_d=${nd}`).toBeDefined();
        expect(row!.c).toBe(PAIRED_CRITICAL_VALUE_TABLE[nd]);
        expect(row!.ndMinusC).toBe(nd - PAIRED_CRITICAL_VALUE_TABLE[nd]!);
      });
    }

    it("every one of the 41 document rows agrees with the module on all three columns", () => {
      for (const row of docRows) {
        expect(row.c, `n_d=${row.nd} c column`).toBe(PAIRED_CRITICAL_VALUE_TABLE[row.nd]);
        expect(row.ndMinusC, `n_d=${row.nd} n_d-c column`).toBe(row.nd - PAIRED_CRITICAL_VALUE_TABLE[row.nd]!);
      }
    });
  });
});
