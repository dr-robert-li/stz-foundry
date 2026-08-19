import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PAIRED_BATTERY_SIZE,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_CRITICAL_VALUE_TABLE,
  PAIRED_BATTERY_SIZE_REV3,
  PAIRED_SEEDS_REV3,
  PAIRED_TASKS_PER_SEED_REV3,
  PAIRED_HEALTH_GATE_FLOOR_REV3,
  PAIRED_DROP_BUDGET_CEILING_REV3,
  PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD_REV3,
  PAIRED_CONCORDANCE_BLOCK_COUNT_REV3,
  PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3,
  PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3,
  PAIRED_CRITICAL_VALUE_TABLE_REV3,
  CEILING_PROBE_SEED_REV3,
  TOURNAMENT_SEARCH_SEEDS_REV3,
  TOURNAMENT_PROMOTION_SEEDS_REV3,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 15-05, Task 2 (REQ-71/72). Binds every rev-3 symbol
// `_paired-constants.ts` added in Task 1 to the FROZEN §12 text, read off
// disk — never a duplicated copy of the numbers. Mirrors
// `test/paired-constants.test.ts`'s read-the-frozen-document-off-disk
// pattern, scoped to §12 instead of §9, and
// `test/paired-critical-value-drift.test.ts`'s independent
// arbitrary-precision re-derivation, applied to the widened rev-3 domain. A
// mismatch here is a defect in the CODE constant or in the transcription,
// never a reason to edit the frozen amendment (§12's own discipline clause:
// rev 3 is a one-way door once inference data exists under it).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");

function extractSection(text: string, heading: string, nextHeading: string | null): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`[paired-constants-rev3] heading not found: ${heading}`);
  if (nextHeading === null) return text.slice(start);
  const end = text.indexOf(nextHeading, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

// §12 is the last section in the document — scope to heading-to-EOF, same as
// test/paired-rev3-table-drift.test.ts, so this scan never collides with
// §9's own pinned-constants table (a separate, already-guarded table).
const section12 = extractSection(preregText, "## §12 Amendment (rev 3)", null);

const WORD_TO_NUM: Record<string, number> = { six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Exact integer binomial-coefficient row for a given `n`, `C(n, 0..n)`,
 * built by Pascal's-triangle recurrence in BigInt end to end — re-derived
 * here rather than imported from `_rev3-critical-values.ts`, so a bug
 * shared between that production script and the transcribed table cannot
 * pass unnoticed. Mirrors `test/paired-critical-value-drift.test.ts`'s own
 * `binomialRow`.
 */
function binomialRow(n: number): bigint[] {
  const row: bigint[] = [1n];
  for (let k = 1; k <= n; k++) {
    row.push((row[k - 1]! * BigInt(n - k + 1)) / BigInt(k));
  }
  return row;
}

const RECIPROCAL = 40n; // §5's frozen per-tail-significance reciprocal, unchanged by this amendment.

/** §5's exact combinatorial condition, restated verbatim by §12: the
 *  smallest integer `c` such that `40 * sum_{i=c}^{n} C(n,i) <= 2^n`. */
function deriveCriticalValue(n: number): number {
  const row = binomialRow(n);
  const twoToN = 1n << BigInt(n);
  let runningSum = row.reduce((sum, value) => sum + value, 0n);
  for (let c = 0; c <= n; c++) {
    if (RECIPROCAL * runningSum <= twoToN) return c;
    runningSum -= row[c]!;
  }
  throw new Error(`[paired-constants-rev3] no critical value satisfies the condition for n=${n}`);
}

describe("PAIRED-DESIGN-PREREG.md §12 <-> _paired-constants.ts rev-3 drift guard (Plan 15-05, REQ-71/72)", () => {
  it("declares itself rev 3 and FROZEN", () => {
    expect(preregText).toMatch(/\*\*Revision:\*\*\s*rev 3\s*—\s*\*\*FROZEN/);
    expect(section12).toContain("## §12 Amendment (rev 3) — FROZEN");
  });

  it("battery size (90, replacing 60)", () => {
    const m = section12.match(/\*\*Battery size:\*\*\s*(\d+) pairing units, replacing 60/);
    expect(m, "§12 battery size row not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_BATTERY_SIZE_REV3);
    expect(PAIRED_BATTERY_SIZE_REV3).toBe(90);
  });

  it("minimum discordant-pairs floor stays 20, unchanged — reuses the rev-2 symbol, no rev-3 duplicate", () => {
    const m = section12.match(/\*\*Minimum discordant-pairs floor:\*\*\s*(\d+), unchanged/);
    expect(m, "§12 discordant-floor row not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_MIN_DISCORDANT_FLOOR);
    expect(PAIRED_MIN_DISCORDANT_FLOOR).toBe(20);
  });

  it("instrument-health gate floor (72 of 90, recomputed from §9's own provenance formula)", () => {
    const m = section12.match(/Instrument-health gate floor[\s\S]*?=\s*(\d+)`?\s*\(of 90\),\s*replacing 48/);
    expect(m, "§12 health-gate-floor row not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_HEALTH_GATE_FLOOR_REV3);
    expect(PAIRED_HEALTH_GATE_FLOOR_REV3).toBe(90 * (1 - 2 * 0.1));
  });

  it("per-arm drop-budget ceiling (9 of 90, recomputed the same way)", () => {
    const m = section12.match(/Per-arm drop-budget ceiling[\s\S]*?=\s*(\d+)`?\s*\(of 90\),\s*replacing 6/);
    expect(m, "§12 drop-budget-ceiling row not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_DROP_BUDGET_CEILING_REV3);
    expect(PAIRED_DROP_BUDGET_CEILING_REV3).toBe(90 * 0.1);
  });

  it("tie-rate ceiling disclosure threshold (71 of 90, recomputed the same way)", () => {
    const m = section12.match(/Tie-rate ceiling disclosure threshold[\s\S]*?=\s*(\d+)`?\s*\(of 90\),\s*replacing 41/);
    expect(m, "§12 tie-rate-threshold row not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD_REV3);
    expect(PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD_REV3).toBe(90 - 19);
  });

  it("seed-block shape SETTLED: 9 blocks of ten, six-of-nine concordance agreement threshold", () => {
    const m = section12.match(/SETTLED:\s*(\d+) blocks of (\w+), (\w+)-of-(\w+) concordance\s+agreement threshold/);
    expect(m, "§12 seed-block-shape decision not found").not.toBeNull();
    const [, blockCountStr, tasksWord, agreeWord, totalWord] = m!;
    const blockCount = parseInt(blockCountStr!, 10);
    expect(WORD_TO_NUM[tasksWord!.toLowerCase()], `unrecognized number word: ${tasksWord}`).toBeDefined();
    expect(WORD_TO_NUM[agreeWord!.toLowerCase()], `unrecognized number word: ${agreeWord}`).toBeDefined();
    expect(WORD_TO_NUM[totalWord!.toLowerCase()], `unrecognized number word: ${totalWord}`).toBeDefined();

    expect(blockCount).toBe(PAIRED_CONCORDANCE_BLOCK_COUNT_REV3);
    expect(WORD_TO_NUM[tasksWord!.toLowerCase()]).toBe(PAIRED_TASKS_PER_SEED_REV3);
    expect(WORD_TO_NUM[agreeWord!.toLowerCase()]).toBe(PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3);
    expect(blockCount).toBe(WORD_TO_NUM[totalWord!.toLowerCase()]);

    expect(PAIRED_CONCORDANCE_BLOCK_COUNT_REV3).toBe(9);
    expect(PAIRED_TASKS_PER_SEED_REV3).toBe(10);
    expect(PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3).toBe(6);
  });

  it("near-floor evidential-weight bound SETTLED: re-derived to 25, via a power-anchored criterion", () => {
    const m = section12.match(
      /PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND`,\s*pinned at\s*24 by Plan 14-03\)\s*—\s*SETTLED:\s*re-derived to (\d+)/,
    );
    expect(m, "§12 near-floor-bound decision not found").not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBe(PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3);
    expect(PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3).toBe(25);
  });

  it("battery seeds (nine, 1601-1609)", () => {
    const m = section12.match(/Battery seeds \(nine[\s\S]*?alternative\):\s*`([^`]+)`/);
    expect(m, "§12 battery-seeds row not found").not.toBeNull();
    const docSeeds = m![1]!.split(",").map((s) => parseInt(s.trim(), 10));
    expect(docSeeds).toEqual([...PAIRED_SEEDS_REV3]);
    expect([...PAIRED_SEEDS_REV3]).toEqual([1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609]);
  });

  it("probe seed (1610), also restated in the ceiling probe's own parameters paragraph", () => {
    const listM = section12.match(/Probe seed \(one\):\s*`(\d+)`/);
    expect(listM, "§12 probe-seed list row not found").not.toBeNull();
    expect(parseInt(listM![1]!, 10)).toBe(CEILING_PROBE_SEED_REV3);

    const paramM = section12.match(/probe\s*\n?\s*seed `(\d+)`/);
    expect(paramM, "§12 ceiling-probe-parameters probe seed not found").not.toBeNull();
    expect(parseInt(paramM![1]!, 10)).toBe(CEILING_PROBE_SEED_REV3);

    expect(CEILING_PROBE_SEED_REV3).toBe(1610);
  });

  it("search seeds (three, 1611-1613)", () => {
    const m = section12.match(/Search seeds \(three\):\s*`([^`]+)`/);
    expect(m, "§12 search-seeds row not found").not.toBeNull();
    const docSeeds = m![1]!.split(",").map((s) => parseInt(s.trim(), 10));
    expect(docSeeds).toEqual([...TOURNAMENT_SEARCH_SEEDS_REV3]);
    expect([...TOURNAMENT_SEARCH_SEEDS_REV3]).toEqual([1611, 1612, 1613]);
  });

  it("promotion seeds (three, 1614-1616)", () => {
    const m = section12.match(/Promotion seeds \(three\):\s*`([^`]+)`/);
    expect(m, "§12 promotion-seeds row not found").not.toBeNull();
    const docSeeds = m![1]!.split(",").map((s) => parseInt(s.trim(), 10));
    expect(docSeeds).toEqual([...TOURNAMENT_PROMOTION_SEEDS_REV3]);
    expect([...TOURNAMENT_PROMOTION_SEEDS_REV3]).toEqual([1614, 1615, 1616]);
  });

  describe("the 71-row critical-value table (§12's own transcribed table, read off disk)", () => {
    const rowPattern = /^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm;
    const docRows: Array<{ nd: number; c: number; ndMinusC: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(section12)) !== null) {
      docRows.push({ nd: Number(match[1]), c: Number(match[2]), ndMinusC: Number(match[3]) });
    }

    it("the key set is exactly the contiguous range from the discordant floor (20) to the rev-3 battery size (90) — 71 keys", () => {
      const keys = Object.keys(PAIRED_CRITICAL_VALUE_TABLE_REV3)
        .map(Number)
        .sort((a, b) => a - b);
      const expectedKeys = Array.from(
        { length: PAIRED_BATTERY_SIZE_REV3 - PAIRED_MIN_DISCORDANT_FLOOR + 1 },
        (_, i) => PAIRED_MIN_DISCORDANT_FLOOR + i,
      );
      expect(keys).toEqual(expectedKeys);
      expect(keys).toHaveLength(71);
    });

    it("parses exactly 71 rows off disk (catches a dropped or duplicated row)", () => {
      expect(docRows).toHaveLength(71);
      expect(docRows.map((r) => r.nd)).toEqual(Array.from({ length: 71 }, (_, i) => 20 + i));
    });

    it("every one of the 71 transcribed module rows matches the frozen §12 document row for the same n_d", () => {
      const docByNd = new Map(docRows.map((r) => [r.nd, r]));
      for (const [ndStr, c] of Object.entries(PAIRED_CRITICAL_VALUE_TABLE_REV3)) {
        const nd = Number(ndStr);
        const docRow = docByNd.get(nd);
        expect(docRow, `no §12 row for n_d=${nd}`).toBeDefined();
        expect(c, `n_d=${nd} c(n_d)`).toBe(docRow!.c);
        expect(nd - c, `n_d=${nd} n_d-c(n_d)`).toBe(docRow!.ndMinusC);
      }
    });

    it("every one of the 71 values is independently re-derived from the frozen combinatorial condition, in arbitrary-precision integer arithmetic", () => {
      for (let nd = 20; nd <= 90; nd++) {
        const derived = deriveCriticalValue(nd);
        expect(derived, `n_d=${nd}`).toBe(PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]);
      }
    });

    it("on the range the rev-2 and rev-3 tables share (20-60), the two tables agree row for row", () => {
      let overlapChecked = 0;
      for (let nd = PAIRED_MIN_DISCORDANT_FLOOR; nd <= PAIRED_BATTERY_SIZE; nd++) {
        expect(PAIRED_CRITICAL_VALUE_TABLE_REV3[nd], `n_d=${nd}`).toBe(PAIRED_CRITICAL_VALUE_TABLE[nd]);
        overlapChecked++;
      }
      expect(overlapChecked).toBe(41);
    });
  });
});
