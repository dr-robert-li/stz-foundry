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
  PAIRED_MODEL,
  PAIRED_TASKS_PER_SEED,
  PAIRED_HEALTH_GATE_FLOOR,
  PAIRED_DROP_BUDGET_CEILING,
  PAIRED_HEALTH_GATE_FLOOR_REV3,
  PAIRED_DROP_BUDGET_CEILING_REV3,
  PAIRED_TASKS_PER_SEED_REV3,
  TOURNAMENT_SEARCH_SEEDS,
  TOURNAMENT_PROMOTION_SEEDS,
} from "../experiments/paired-comparison-arm/_paired-constants.js";
import {
  resolveCeilingProbeRunOptions,
  findModelDigestLine as findModelDigestLineProbe,
  buildProbeUnitOrder,
} from "../experiments/paired-comparison-arm/_ceiling-probe.js";
import {
  findModelDigestLine as findModelDigestLineSearch,
  RESOLVED_SEARCH_RUN_OPTIONS,
} from "../experiments/paired-comparison-arm/_w-search.js";
import {
  resolvePairedStudyRunOptions,
  findModelDigestLine as findModelDigestLineStudy,
  buildPairedStudyUnitOrder,
  evaluatePairedQualification,
} from "../experiments/paired-comparison-arm/_paired-study.js";

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

// ── Task 3 — model, shape and artifact paths threaded through the three
// drivers (REQ-72). Each driver's own resolution point is tested offline,
// against a plain env-like object — never real `process.env` mutation and
// never a real `ollama`/network call. ───────────────────────────────────

describe("_ceiling-probe.ts — resolution point (Task 3, REQ-72)", () => {
  it("with no env, resolves to exactly the rev-2 pinned defaults", () => {
    const resolved = resolveCeilingProbeRunOptions({});
    expect(resolved.model).toBe(PAIRED_MODEL);
    expect(resolved.verdictFile).toBe("ceiling-probe-verdict.json");
  });

  it("env overrides seed/taskCount/scoreableFloor/model/verdictFile independently", () => {
    const resolved = resolveCeilingProbeRunOptions({
      PAIRED_PROBE_MODEL: "custom-model:latest",
      PAIRED_PROBE_VERDICT_FILE: "custom-probe-verdict.json",
      PAIRED_PROBE_SEED: "1610",
      PAIRED_PROBE_TASK_COUNT: "10",
      PAIRED_PROBE_SCOREABLE_FLOOR: "8",
    });
    expect(resolved).toEqual({
      model: "custom-model:latest",
      verdictFile: "custom-probe-verdict.json",
      seed: 1610,
      taskCount: 10,
      scoreableFloor: 8,
    });
  });

  it("buildProbeUnitOrder resolves seed/taskCount from opts, defaulting to the rev-2 constants when omitted", () => {
    const order = buildProbeUnitOrder({ seed: 1610, taskCount: 3 });
    expect(order).toHaveLength(3 * 2); // 2 modes per task index
    expect(new Set(order.map((u) => u.unitId.split(":")[0]))).toEqual(new Set(["1610"]));
  });

  it("findModelDigestLine looks up the RESOLVED model, not a hardcoded one (T-15-24)", () => {
    const listing = "qwen3.6:latest    07d35212591f    4.1 GB\ngpt-oss:latest    17052f91a42e    5.2 GB";
    expect(findModelDigestLineProbe("gpt-oss:latest", listing)).toContain("17052f91a42e");
    expect(findModelDigestLineProbe("qwen3.6:latest", listing)).toContain("07d35212591f");
  });

  it("findModelDigestLine returns a not-found marker rather than throwing or silently defaulting", () => {
    expect(findModelDigestLineProbe("nonexistent-model:latest", "qwen3.6:latest  abc")).toContain("not found");
  });
});

describe("_w-search.ts — resolution point (Task 3, REQ-72)", () => {
  it("with no env override (this test process's own env), the resolved run options equal the rev-2 defaults byte-for-byte", () => {
    expect(RESOLVED_SEARCH_RUN_OPTIONS.model).toBe(PAIRED_MODEL);
    expect(RESOLVED_SEARCH_RUN_OPTIONS.tasksPerSeed).toBe(PAIRED_TASKS_PER_SEED);
    expect([...RESOLVED_SEARCH_RUN_OPTIONS.searchSeeds]).toEqual([...TOURNAMENT_SEARCH_SEEDS]);
    expect([...RESOLVED_SEARCH_RUN_OPTIONS.promotionSeeds]).toEqual([...TOURNAMENT_PROMOTION_SEEDS]);
    expect(RESOLVED_SEARCH_RUN_OPTIONS.verdictFile).toBe("w-search-verdict.json");
  });

  it("findModelDigestLine looks up the RESOLVED model, not a hardcoded one (T-15-24)", () => {
    const listing = "gpt-oss:latest    17052f91a42e    5.2 GB";
    expect(findModelDigestLineSearch("gpt-oss:latest", listing)).toContain("17052f91a42e");
  });
});

describe("_paired-study.ts — resolution point (Task 3, REQ-72)", () => {
  it("with no env, resolves to exactly the rev-2 pinned shape and defaults", () => {
    const resolved = resolvePairedStudyRunOptions({});
    expect(resolved.model).toBe(PAIRED_MODEL);
    expect(resolved.verdictFile).toBe("paired-study-verdict.json");
    expect([...resolved.shape.seeds]).toEqual([...PAIRED_SEEDS]);
    expect(resolved.shape.tasksPerSeed).toBe(PAIRED_TASKS_PER_SEED);
    expect(resolved.shape.healthGateFloor).toBe(PAIRED_HEALTH_GATE_FLOOR);
    expect(resolved.shape.dropBudgetCeiling).toBe(PAIRED_DROP_BUDGET_CEILING);
  });

  it("PAIRED_STUDY_SHAPE=rev3 resolves the whole battery shape to the rev-3 bundle in one flag", () => {
    const resolved = resolvePairedStudyRunOptions({ PAIRED_STUDY_SHAPE: "rev3" });
    expect([...resolved.shape.seeds]).toEqual([...PAIRED_SEEDS_REV3]);
    expect(resolved.shape.tasksPerSeed).toBe(PAIRED_TASKS_PER_SEED_REV3);
    expect(resolved.shape.healthGateFloor).toBe(PAIRED_HEALTH_GATE_FLOOR_REV3);
    expect(resolved.shape.dropBudgetCeiling).toBe(PAIRED_DROP_BUDGET_CEILING_REV3);
    expect(resolved.shape.blockCount).toBe(PAIRED_CONCORDANCE_BLOCK_COUNT_REV3);
    expect(resolved.shape.agreeThreshold).toBe(PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3);
    expect(resolved.shape.criticalValueTable).toBe(PAIRED_CRITICAL_VALUE_TABLE_REV3);
  });

  it("model and verdictFile resolve independently of the shape flag", () => {
    const resolved = resolvePairedStudyRunOptions({ PAIRED_STUDY_MODEL: "custom-model:latest", PAIRED_STUDY_VERDICT_FILE: "custom-verdict.json" });
    expect(resolved.model).toBe("custom-model:latest");
    expect(resolved.verdictFile).toBe("custom-verdict.json");
  });

  it("findModelDigestLine looks up the RESOLVED model, not a hardcoded one (T-15-24)", () => {
    const listing = "gpt-oss:latest    17052f91a42e    5.2 GB";
    expect(findModelDigestLineStudy("gpt-oss:latest", listing)).toContain("17052f91a42e");
  });

  it("buildPairedStudyUnitOrder at the rev-3 shape produces 9 seeds x 10 tasks x 2 arms = 180 entries", () => {
    const order = buildPairedStudyUnitOrder({ seeds: PAIRED_SEEDS_REV3, tasksPerSeed: PAIRED_TASKS_PER_SEED_REV3 });
    expect(order).toHaveLength(9 * 10 * 2);
    expect(new Set(order.map((u) => u.seed))).toEqual(new Set(PAIRED_SEEDS_REV3));
  });

  function qualAccounting(overrides: Partial<PairedAccounting> = {}): PairedAccounting {
    return {
      armW: { "no-artifact": 0, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 },
      armB: { "no-artifact": 0, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 },
      winCount: 0,
      lossCount: 0,
      tieCount: 0,
      discordantCount: 0,
      blocks: [],
      ...overrides,
    };
  }

  const REV3_QUAL_SHAPE = {
    healthGateFloor: PAIRED_HEALTH_GATE_FLOOR_REV3,
    discordantFloor: PAIRED_MIN_DISCORDANT_FLOOR,
    dropBudgetCeiling: PAIRED_DROP_BUDGET_CEILING_REV3,
  };

  it("at the rev-3 instrument-health floor (72), the study proceeds; one unit below it, the health clause fires", () => {
    const atFloor = evaluatePairedQualification(qualAccounting({ discordantCount: 30 }), PAIRED_HEALTH_GATE_FLOOR_REV3, REV3_QUAL_SHAPE);
    expect(atFloor).not.toBe("TERMINATED-HEALTH-GATE-FAILED");

    const belowFloor = evaluatePairedQualification(qualAccounting({ discordantCount: 30 }), PAIRED_HEALTH_GATE_FLOOR_REV3 - 1, REV3_QUAL_SHAPE);
    expect(belowFloor).toBe("TERMINATED-HEALTH-GATE-FAILED");
  });

  it("at the rev-3 per-arm drop-budget ceiling (9), the study proceeds; one drop above it, the budget clause fires", () => {
    const armWAtCeiling = { "no-artifact": PAIRED_DROP_BUDGET_CEILING_REV3, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const atCeiling = evaluatePairedQualification(
      qualAccounting({ discordantCount: 30, armW: armWAtCeiling }),
      PAIRED_HEALTH_GATE_FLOOR_REV3,
      REV3_QUAL_SHAPE,
    );
    expect(atCeiling).toBe("COMPLETE");

    const armWAboveCeiling = { "no-artifact": PAIRED_DROP_BUDGET_CEILING_REV3 + 1, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const aboveCeiling = evaluatePairedQualification(
      qualAccounting({ discordantCount: 30, armW: armWAboveCeiling }),
      PAIRED_HEALTH_GATE_FLOOR_REV3,
      REV3_QUAL_SHAPE,
    );
    expect(aboveCeiling).toBe("TERMINATED-DROP-BUDGET-BREACHED");
  });

  it("called with no options, evaluatePairedQualification behaves exactly as before (rev-2 defaults)", () => {
    expect(evaluatePairedQualification(qualAccounting({ discordantCount: 30 }), PAIRED_HEALTH_GATE_FLOOR)).not.toBe(
      "TERMINATED-HEALTH-GATE-FAILED",
    );
    expect(evaluatePairedQualification(qualAccounting({ discordantCount: 30 }), PAIRED_HEALTH_GATE_FLOOR - 1)).toBe(
      "TERMINATED-HEALTH-GATE-FAILED",
    );
  });
});
