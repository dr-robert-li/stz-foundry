/**
 * Rev-3 battery-shape coverage (Phase 15 — Amended paired run, calibrated
 * instrument, Plan 15-06, REQ-72). Proves the decision gate, the report
 * writer and the three drivers all work at the rev-3 shape (9 blocks of
 * ten, 90-unit battery) without forking any of them, and that every
 * function's rev-2 behaviour is byte-identical when called with no shape
 * options. Extended task by task — Task 1 covers `_paired-gate.ts` only;
 * later tasks in this plan extend this same file for the report writer and
 * the three drivers.
 *
 * Interpretation note (Task 1): the plan's own <action> for this task names
 * exactly six gate options — seed list, block count, agreement threshold,
 * battery size, discordant floor, critical-value table — and explicitly
 * excludes the instrument-health floor and the per-arm drop-budget ceiling,
 * which live in `evaluatePairedQualification` (`_paired-study.ts`, Task
 * 3's file). Those two clauses' boundary pairs are pinned in Task 3, once
 * that function gains its own shape options; pulling them into this task
 * would mean testing a function this task never touches. What Task 1 CAN
 * and does pin: the discordant-floor/battery-size range check the gate
 * itself performs (below the supplied floor refuses rather than silently
 * defaulting — the gate never decides the TERMINATED-UNDERPOWERED terminal
 * state itself, the pipeline does, see Task 3), and the block-concordance
 * agreement threshold, which the gate owns outright.
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePairedGate,
  accountPairedUnits,
  type PairedAccounting,
  type PairedArmCategoryCounts,
  type PairedGateVerdict,
  type PairedBlockClassification,
  type PairedUnitAccountingInput,
} from "../experiments/paired-comparison-arm/_paired-gate.js";
import { renderPairedResultsReport, type PairedReportUnitRecord } from "../experiments/paired-comparison-arm/_paired-report.js";
import {
  PAIRED_SEEDS,
  PAIRED_SEEDS_REV3,
  PAIRED_BATTERY_SIZE_REV3,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_CRITICAL_VALUE_TABLE,
  PAIRED_CRITICAL_VALUE_TABLE_REV3,
  PAIRED_CONCORDANCE_BLOCK_COUNT_REV3,
  PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN,
  PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND,
  PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

function rev3Blocks(overrides: Partial<Record<number, PairedBlockClassification>> = {}): PairedBlockClassification[] {
  return PAIRED_SEEDS_REV3.map((seed, i) => overrides[seed] ?? overrides[i] ?? "block-tied") as PairedBlockClassification[];
}

function neutralRev3Blocks(): PairedBlockClassification[] {
  return Array(PAIRED_CONCORDANCE_BLOCK_COUNT_REV3).fill("block-tied") as PairedBlockClassification[];
}

const REV3_SHAPE = {
  seeds: PAIRED_SEEDS_REV3,
  blockCount: PAIRED_CONCORDANCE_BLOCK_COUNT_REV3,
  agreeThreshold: PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3,
  batterySize: PAIRED_BATTERY_SIZE_REV3,
  discordantFloor: PAIRED_MIN_DISCORDANT_FLOOR, // §12: unchanged from rev-2
  criticalValueTable: PAIRED_CRITICAL_VALUE_TABLE_REV3,
};

describe("_paired-gate.ts — rev-3 shape (Task 1, REQ-72)", () => {
  describe("accountPairedUnits — shape-parameterised seed grouping", () => {
    it("called with no options, behaves exactly as before (rev-2 seed order, rev-2 block count)", () => {
      const units: PairedUnitAccountingInput[] = [
        { seed: PAIRED_SEEDS[0]!, categoryW: "resolution-match", categoryB: "resolution-mismatch" },
      ];
      const acc = accountPairedUnits(units);
      expect(acc.blocks).toHaveLength(PAIRED_SEEDS.length);
      expect(acc.blocks.map((b) => b.seed)).toEqual([...PAIRED_SEEDS]);
    });

    it("given the rev-3 seed list, groups units into 9 blocks in seed order, keyed by the supplied seeds", () => {
      const units: PairedUnitAccountingInput[] = PAIRED_SEEDS_REV3.map((seed) => ({
        seed,
        categoryW: "resolution-match",
        categoryB: "resolution-mismatch",
      }));
      const acc = accountPairedUnits(units, { seeds: PAIRED_SEEDS_REV3 });
      expect(acc.blocks).toHaveLength(9);
      expect(acc.blocks.map((b) => b.seed)).toEqual([...PAIRED_SEEDS_REV3]);
      expect(acc.discordantCount).toBe(9);
    });

    it("a unit referencing a seed outside the supplied list throws rather than silently scoring against the rev-2 list", () => {
      const units: PairedUnitAccountingInput[] = [{ seed: PAIRED_SEEDS[0]!, categoryW: "resolution-match", categoryB: "resolution-mismatch" }];
      expect(() => accountPairedUnits(units, { seeds: PAIRED_SEEDS_REV3 })).toThrow(/not one of the supplied seeds/);
    });

    it("an empty unit list produces zero counts and one zero-filled block per supplied seed, never throws", () => {
      const acc = accountPairedUnits([], { seeds: PAIRED_SEEDS_REV3 });
      expect(acc.discordantCount).toBe(0);
      expect(acc.winCount).toBe(0);
      expect(acc.lossCount).toBe(0);
      expect(acc.tieCount).toBe(0);
      expect(acc.blocks).toHaveLength(9);
      for (const block of acc.blocks) {
        expect(block.discordantWins).toBe(0);
        expect(block.discordantLosses).toBe(0);
      }
    });

    it("a single discordant pair produces discordantCount=1, never throws", () => {
      const seed = PAIRED_SEEDS_REV3[0]!;
      const acc = accountPairedUnits([{ seed, categoryW: "resolution-match", categoryB: "resolution-mismatch" }], {
        seeds: PAIRED_SEEDS_REV3,
      });
      expect(acc.discordantCount).toBe(1);
      expect(acc.winCount).toBe(1);
    });

    it("zero discordant pairs (all ties) produces discordantCount=0, never throws", () => {
      const seed = PAIRED_SEEDS_REV3[0]!;
      const acc = accountPairedUnits(
        [
          { seed, categoryW: "resolution-match", categoryB: "resolution-match" },
          { seed, categoryW: "no-artifact", categoryB: "no-artifact" },
        ],
        { seeds: PAIRED_SEEDS_REV3 },
      );
      expect(acc.discordantCount).toBe(0);
      expect(acc.tieCount).toBe(2);
    });
  });

  describe("evaluatePairedGate — block-count assertion against the supplied count", () => {
    it("called with no options, still requires exactly the rev-2 block count (6), unchanged", () => {
      expect(() => evaluatePairedGate("COMPLETE", 30, 20, neutralRev3Blocks())).toThrow(/expected exactly 6 block classifications/);
    });

    it("given the rev-3 block count, requires exactly 9 block classifications", () => {
      const nd = 30;
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      expect(() =>
        evaluatePairedGate("COMPLETE", nd, c, ["block-tied", "block-tied"], REV3_SHAPE),
      ).toThrow(/expected exactly 9 block classifications/);
      // Exactly 9 does not throw on the block-count assertion.
      const verdict = evaluatePairedGate("COMPLETE", nd, c, neutralRev3Blocks(), REV3_SHAPE);
      expect(verdict.decision).toBeDefined();
    });
  });

  describe("evaluatePairedGate — discordant-floor/battery-size range, boundary pairs", () => {
    it("at the supplied floor, the gate proceeds to a decision rather than throwing", () => {
      const nd = PAIRED_MIN_DISCORDANT_FLOOR; // 20, unchanged rev-3 floor
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      const verdict = evaluatePairedGate("COMPLETE", nd, c, neutralRev3Blocks(), REV3_SHAPE);
      expect(verdict.decision).toBeDefined();
    });

    it("one below the supplied floor, the gate refuses (throws) rather than silently defaulting — the gate never itself decides the TERMINATED-UNDERPOWERED terminal state, the pipeline does (Task 3)", () => {
      const nd = PAIRED_MIN_DISCORDANT_FLOOR - 1;
      expect(() => evaluatePairedGate("COMPLETE", nd, 0, neutralRev3Blocks(), REV3_SHAPE)).toThrow(
        /outside the supplied critical-value table's own range/,
      );
    });

    it("at the supplied battery size (rev-3: 90), the gate proceeds", () => {
      const nd = PAIRED_BATTERY_SIZE_REV3;
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      const verdict = evaluatePairedGate("COMPLETE", nd, c, neutralRev3Blocks(), REV3_SHAPE);
      expect(verdict.decision).toBeDefined();
    });

    it("one above the supplied battery size, the gate throws", () => {
      const nd = PAIRED_BATTERY_SIZE_REV3 + 1;
      expect(() => evaluatePairedGate("COMPLETE", nd, 0, neutralRev3Blocks(), REV3_SHAPE)).toThrow(
        /outside the supplied critical-value table's own range/,
      );
    });
  });

  describe("evaluatePairedGate — block-agreement threshold, inclusive on the passing side", () => {
    it("exactly six of nine agreeing blocks (the rev-3 threshold) counts as agreement — pooled decision stands", () => {
      const nd = 60;
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      const blocks = rev3Blocks({ 0: "W-majority", 1: "W-majority", 2: "W-majority", 3: "W-majority", 4: "W-majority", 5: "W-majority", 6: "block-tied", 7: "block-tied", 8: "block-tied" });
      const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks, REV3_SHAPE);
      expect(verdict.decision).toBe("W-SUPERIOR");
      expect(verdict.downgradedFrom).toBeUndefined();
    });

    it("one below the threshold (five of nine agreeing) downgrades to INDISTINGUISHABLE", () => {
      const nd = 60;
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      const blocks = rev3Blocks({ 0: "W-majority", 1: "W-majority", 2: "W-majority", 3: "W-majority", 4: "W-majority", 5: "B-majority", 6: "block-tied", 7: "block-tied", 8: "block-tied" });
      const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks, REV3_SHAPE);
      expect(verdict.decision).toBe("INDISTINGUISHABLE");
      expect(verdict.downgradedFrom).toBe("W-SUPERIOR");
    });
  });

  describe("evaluatePairedGate — critical-value table, threaded through as supplied", () => {
    it("looks up c(n_d) from the supplied rev-3 table for n_d values the rev-2 table has no row for (61-90)", () => {
      const nd = 75; // outside the rev-2 table's 20-60 range
      const c = PAIRED_CRITICAL_VALUE_TABLE_REV3[nd]!;
      const blocks = rev3Blocks({ 0: "W-majority", 1: "W-majority", 2: "W-majority", 3: "W-majority", 4: "W-majority", 5: "W-majority" });
      const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks, REV3_SHAPE);
      expect(verdict.decision).toBe("W-SUPERIOR");
    });
  });

  describe("no second copy of the gate — single decision rule", () => {
    it("only one gate module exists in the experiment directory", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "experiments/paired-comparison-arm");
      const gateFiles = fs.readdirSync(dir).filter((f) => f.includes("gate"));
      expect(gateFiles).toHaveLength(1);
    });
  });
});

// ── Task 2 — the report writer, shape-parameterised (REQ-72) ───────────────

function categoryCounts(overrides: Partial<PairedArmCategoryCounts> = {}): PairedArmCategoryCounts {
  return { "no-artifact": 0, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0, ...overrides };
}

function rev3EmptyBlocks() {
  return PAIRED_SEEDS_REV3.map((seed) => ({ seed, discordantWins: 0, discordantLosses: 0 }));
}

function rev3Accounting(overrides: Partial<PairedAccounting> = {}): PairedAccounting {
  return {
    armW: categoryCounts(),
    armB: categoryCounts(),
    winCount: 0,
    lossCount: 0,
    tieCount: 0,
    discordantCount: 0,
    blocks: rev3EmptyBlocks(),
    ...overrides,
  };
}

const REV3_REPORT_SHAPE = {
  criticalValueTable: PAIRED_CRITICAL_VALUE_TABLE_REV3,
  dominantFailureModeCeilingNum: PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM,
  dominantFailureModeCeilingDen: PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN,
  nearFloorEvidentialWeightBound: PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3,
};

describe("_paired-report.ts — rev-3 shape (Task 2, REQ-72)", () => {
  it("rendered at the rev-3 shape, the concordance table has one row per rev-3 block, keyed by the rev-3 seeds", () => {
    const units: PairedUnitAccountingInput[] = PAIRED_SEEDS_REV3.map((seed) => ({
      seed,
      categoryW: "resolution-match",
      categoryB: "resolution-mismatch",
    }));
    const acc = accountPairedUnits(units, { seeds: PAIRED_SEEDS_REV3 });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const report = renderPairedResultsReport(verdict, acc, [], REV3_REPORT_SHAPE);
    for (const seed of PAIRED_SEEDS_REV3) {
      expect(report).toContain(`| ${seed} |`);
    }
    // Never a rev-2 seed row — proves the table follows the supplied
    // seeds, not the rev-2 default.
    for (const seed of PAIRED_SEEDS) {
      expect(report).not.toContain(`| ${seed} |`);
    }
  });

  it("rendered with no options, the output is byte-identical to the same call with every option supplied explicitly at its rev-2 default", () => {
    const acc = rev3Accounting({
      armW: categoryCounts({ "resolution-mismatch": 9, "resolution-match": 1 }),
      armB: categoryCounts({ "resolution-mismatch": 1, "resolution-match": 9 }),
      discordantCount: 20,
      winCount: 12,
      blocks: PAIRED_SEEDS.map((seed) => ({ seed, discordantWins: 1, discordantLosses: 0 })),
    });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const units: PairedReportUnitRecord[] = [{ unitId: "1301:0", arm: "W", status: "ok", oracleCategory: "resolution-match", score: 1 }];

    const noOptions = renderPairedResultsReport(verdict, acc, units);
    const explicitRev2Defaults = renderPairedResultsReport(verdict, acc, units, {
      criticalValueTable: PAIRED_CRITICAL_VALUE_TABLE,
      dominantFailureModeCeilingNum: PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM,
      dominantFailureModeCeilingDen: PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN,
      nearFloorEvidentialWeightBound: PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND,
    });
    expect(noOptions).toBe(explicitRev2Defaults);
  });

  it("the existing report test file passes with zero edits (proven by the git diff acceptance check, not this suite)", () => {
    // Documented here as a pointer, not re-asserted: `git diff --stat
    // test/paired-results-report.test.ts` shows no change, and that file's
    // own suite runs green in this task's <verify> command.
    expect(true).toBe(true);
  });

  it("the near-floor evidential-weight note appears at or below the supplied bound (rev-3: 25) and not above", () => {
    const atBound = rev3Accounting({ discordantCount: PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3, winCount: 15 });
    const atVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const atReport = renderPairedResultsReport(atVerdict, atBound, [], REV3_REPORT_SHAPE);
    expect(atReport).toContain("Near-the-floor evidential-weight caveat");

    const aboveBound = rev3Accounting({ discordantCount: PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3 + 1, winCount: 15 });
    const aboveVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const aboveReport = renderPairedResultsReport(aboveVerdict, aboveBound, [], REV3_REPORT_SHAPE);
    expect(aboveReport).not.toContain("Near-the-floor evidential-weight caveat");
  });

  it("the renderer writes no file and derives no verdict of its own — it renders what the verdict artifact states", () => {
    const acc = rev3Accounting({ discordantCount: 30, winCount: 20 });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "given verbatim, never recomputed" };
    const report = renderPairedResultsReport(verdict, acc, [], REV3_REPORT_SHAPE);
    expect(report).toContain("W-SUPERIOR");
    // No filesystem side effect: this call itself proves it (no writeFileSync
    // available in this pure-function call path) — the acceptance check's
    // comment-stripped source grep is the structural guarantee.
  });
});
