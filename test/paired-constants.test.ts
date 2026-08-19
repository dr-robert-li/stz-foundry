import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PAIRED_BATTERY_SIZE,
  PAIRED_SEEDS,
  PAIRED_TASKS_PER_SEED,
  PAIRED_HEALTH_GATE_FLOOR,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_DROP_BUDGET_CEILING,
  PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD,
  PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN,
  PAIRED_ATTEMPT_DISCIPLINE,
  PAIRED_CONCORDANCE_BLOCK_COUNT,
  PAIRED_CONCORDANCE_AGREE_THRESHOLD,
  PAIRED_SIGNIFICANCE_LEVEL_DOC,
  PAIRED_CRITICAL_VALUE_TABLE,
  CEILING_PROBE_SEED,
  CEILING_PROBE_TASK_COUNT,
  CEILING_PROBE_SCOREABLE_FLOOR,
  TOURNAMENT_SEARCH_SEEDS,
  TOURNAMENT_PROMOTION_SEEDS,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 14-01 (REQ-68/69, T-14-01). This test reads the FROZEN
// PAIRED-DESIGN-PREREG.md rev 2 off disk — never a duplicated copy of the
// numbers — and compares every transcribed symbol in `_paired-constants.ts`
// against the value the document states. A mismatch here is a defect in the
// CODE constant, never a reason to edit the frozen document (§0's freeze
// discipline: rev 2 is a one-way door).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");

function extractSection(text: string, heading: string, nextHeading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`[paired-constants-sync] heading not found: ${heading}`);
  const end = text.indexOf(nextHeading, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** Finds the `| <label> | <value cell> | ...` row for an exact constant
 *  label (plain text, never pre-escaped by the caller) in §9's markdown
 *  table and returns the raw, trimmed value cell. */
function findRowValue(section: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|`, "m");
  const m = section.match(re);
  if (!m || !m[1]) throw new Error(`[paired-constants-sync] §9 row not found for label: ${label}`);
  return m[1].trim();
}

const section9 = extractSection(preregText, "## §9 Pinned constants", "## §10");
const section5 = extractSection(preregText, "## §5 The paired methodology", "## §6");

describe("PAIRED-DESIGN-PREREG.md §9 <-> _paired-constants.ts drift guard (T-14-01)", () => {
  it("declares itself rev 2 and FROZEN (guards against a post-freeze revert of the status line)", () => {
    expect(preregText).toMatch(/\*\*Revision:\*\*\s*rev 2\s*—\s*\*\*FROZEN/);
  });

  it("battery size (60)", () => {
    expect(parseInt(findRowValue(section9, "Battery size (pairing units)"), 10)).toBe(PAIRED_BATTERY_SIZE);
    expect(PAIRED_BATTERY_SIZE).toBe(60);
  });

  it("the six pinned seeds, in order", () => {
    const cell = findRowValue(section9, "Seeds (six, pinned)");
    const docSeeds = cell.split(",").map((s) => parseInt(s.trim(), 10));
    expect(docSeeds).toEqual([...PAIRED_SEEDS]);
  });

  it("tasks per seed (10)", () => {
    expect(parseInt(findRowValue(section9, "Tasks per seed"), 10)).toBe(PAIRED_TASKS_PER_SEED);
  });

  it("instrument-health gate floor (48, §6 Clause 1)", () => {
    const cell = findRowValue(section9, "Instrument-health gate floor (§6 Clause 1)");
    const n = parseInt(cell.match(/^(\d+)/)?.[1] ?? "", 10);
    expect(n).toBe(PAIRED_HEALTH_GATE_FLOOR);
    expect(PAIRED_HEALTH_GATE_FLOOR).toBe(48);
  });

  it("minimum discordant-pairs floor (20, §6 Clause 2)", () => {
    expect(parseInt(findRowValue(section9, "Minimum discordant-pairs floor (§6 Clause 2)"), 10)).toBe(
      PAIRED_MIN_DISCORDANT_FLOOR,
    );
  });

  it("per-arm drop-budget ceiling (6, §6 Clause 3)", () => {
    const cell = findRowValue(section9, "Per-arm drop-budget ceiling (§6 Clause 3)");
    const n = parseInt(cell.match(/^(\d+)/)?.[1] ?? "", 10);
    expect(n).toBe(PAIRED_DROP_BUDGET_CEILING);
  });

  it("tie-rate ceiling disclosure (41, §8 item 1)", () => {
    const cell = findRowValue(section9, "Tie-rate ceiling disclosure (§8 item 1)");
    const n = parseInt(cell.match(/^(\d+)/)?.[1] ?? "", 10);
    expect(n).toBe(PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD);
  });

  it("significance level documentation string carries α = 0.05, two-sided", () => {
    const cell = findRowValue(section9, "Significance level (§5, §8 item 2)");
    expect(cell).toContain("0.05");
    expect(cell).toContain("two-sided");
    expect(PAIRED_SIGNIFICANCE_LEVEL_DOC).toContain("0.05");
    expect(PAIRED_SIGNIFICANCE_LEVEL_DOC).toContain("two-sided");
  });

  it("per-arm dominant-failure-mode ceiling (90%, §8 item 3) as an exact integer fraction", () => {
    const cell = findRowValue(section9, "Per-arm dominant-failure-mode ceiling (§8 item 3)");
    const pct = parseInt(cell.match(/^(\d+)%/)?.[1] ?? "", 10);
    expect(pct).toBe(90);
    expect((PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM / PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN) * 100).toBe(pct);
  });

  it("per-tail-significance reciprocal (40, §5 combinatorial condition)", () => {
    expect(parseInt(findRowValue(section9, "Per-tail-significance reciprocal (§5 combinatorial condition)"), 10)).toBe(
      PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL,
    );
  });

  it("attempt discipline (exactly 1 proposal per arm per pairing unit)", () => {
    const cell = findRowValue(section9, "Attempt discipline (§3 equal-treatment invariant)");
    const n = parseInt(cell.match(/exactly (\d+)/)?.[1] ?? "", 10);
    expect(n).toBe(PAIRED_ATTEMPT_DISCIPLINE);
  });

  it("F-05 concordance check: six blocks, four-of-six agreement threshold (§5 prose, no dedicated §9 row)", () => {
    expect(section5).toMatch(/each of the six seed-blocks/);
    expect(section5).toMatch(/at least four of the six blocks agree/);
    expect(PAIRED_CONCORDANCE_BLOCK_COUNT).toBe(6);
    expect(PAIRED_CONCORDANCE_AGREE_THRESHOLD).toBe(4);
  });

  it("the critical-value table has exactly 41 keys, 20 through 60 inclusive, matching §9's literal table", () => {
    const keys = Object.keys(PAIRED_CRITICAL_VALUE_TABLE)
      .map(Number)
      .sort((a, b) => a - b);
    expect(keys.length).toBe(41);
    expect(keys[0]).toBe(20);
    expect(keys[keys.length - 1]).toBe(60);
    expect(keys).toEqual(Array.from({ length: 41 }, (_, i) => 20 + i));

    const tableRowPattern = /^\| (\d+) \| (\d+) \| (\d+) \|$/gm;
    const docRows = new Map<number, number>();
    let m: RegExpExecArray | null;
    while ((m = tableRowPattern.exec(section9)) !== null) {
      docRows.set(Number(m[1]), Number(m[2]));
    }
    expect(docRows.size).toBe(41);
    for (const nd of keys) {
      expect(docRows.get(nd), `doc has no critical-value row for n_d=${nd}`).toBe(PAIRED_CRITICAL_VALUE_TABLE[nd]);
    }
  });

  it("every pinned seed block (paired battery + Phase-14 build-gate) is pairwise disjoint", () => {
    const blocks: { name: string; seeds: readonly number[] }[] = [
      { name: "PAIRED_SEEDS", seeds: PAIRED_SEEDS },
      { name: "CEILING_PROBE_SEED", seeds: [CEILING_PROBE_SEED] },
      { name: "TOURNAMENT_SEARCH_SEEDS", seeds: TOURNAMENT_SEARCH_SEEDS },
      { name: "TOURNAMENT_PROMOTION_SEEDS", seeds: TOURNAMENT_PROMOTION_SEEDS },
    ];
    const seen = new Map<number, string>();
    for (const block of blocks) {
      for (const seed of block.seeds) {
        const owner = seen.get(seed);
        expect(owner, `seed ${seed} appears in both ${owner} and ${block.name}`).toBeUndefined();
        seen.set(seed, block.name);
      }
    }
    // Also disjoint from every seed set already used by a prior study.
    const priorSeeds = [1201, 1202, 1203, 1204, 1205, 1206, 101, 202, 303, 404, 505, 606, 707, 808, 909, 999];
    for (const seed of priorSeeds) {
      expect(seen.has(seed), `Phase 14 seed block reuses prior-study seed ${seed}`).toBe(false);
    }
  });

  it("Phase-14 build-gate constants are pinned by this commit, not by the frozen table", () => {
    expect(CEILING_PROBE_SEED).toBe(1399);
    expect(CEILING_PROBE_TASK_COUNT).toBe(10);
    expect(CEILING_PROBE_SCOREABLE_FLOOR).toBe(8);
    expect([...TOURNAMENT_SEARCH_SEEDS]).toEqual([1401, 1402, 1403]);
    expect([...TOURNAMENT_PROMOTION_SEEDS]).toEqual([1404, 1405, 1406]);
  });
});
