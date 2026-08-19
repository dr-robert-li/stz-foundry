import { describe, it, expect } from "vitest";
import {
  evaluatePairedGate,
  classifyBlock,
  accountPairedUnits,
  PAIRED_STUDY_OUTCOMES,
  type PairedStudyOutcome,
  type PairedBlockClassification,
  type PairedUnitAccountingInput,
} from "../experiments/paired-comparison-arm/_paired-gate.js";
import { PAIRED_CRITICAL_VALUE_TABLE, PAIRED_SEEDS, PAIRED_CONCORDANCE_BLOCK_COUNT } from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 14-03, Task 1 (REQ-69). Covers all nine behaviors §5/§7 pin, plus a
// table-driven boundary sweep across the pinned critical-value table.

const TERMINATION_OUTCOMES = PAIRED_STUDY_OUTCOMES.filter((o) => o !== "COMPLETE") as PairedStudyOutcome[];

/** Six block-tied classifications — a neutral default when a test cares
 *  only about the pooled comparison, not the concordance check. */
function neutralBlocks(): PairedBlockClassification[] {
  return Array(PAIRED_CONCORDANCE_BLOCK_COUNT).fill("block-tied") as PairedBlockClassification[];
}

describe("evaluatePairedGate", () => {
  it("a non-completing outcome returns the termination verdict and never populates a decision", () => {
    for (const outcome of TERMINATION_OUTCOMES) {
      const verdict = evaluatePairedGate(outcome, 30, 20, neutralBlocks());
      expect(verdict.outcome).toBe(outcome);
      expect(verdict.decision).toBeUndefined();
      expect(verdict.downgradedFrom).toBeUndefined();
      expect(verdict.reason.length).toBeGreaterThan(0);
    }
  });

  it("at the full battery size, a win count equal to the critical value reads W-SUPERIOR (upper boundary inclusive)", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const blocks: PairedBlockClassification[] = ["W-majority", "W-majority", "W-majority", "W-majority", "block-tied", "block-tied"];
    const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks);
    expect(verdict.decision).toBe("W-SUPERIOR");
    expect(verdict.downgradedFrom).toBeUndefined();
  });

  it("a win count equal to the battery size minus the critical value reads B-SUPERIOR (lower boundary inclusive)", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const kw = nd - c;
    const blocks: PairedBlockClassification[] = ["B-majority", "B-majority", "B-majority", "B-majority", "block-tied", "block-tied"];
    const verdict = evaluatePairedGate("COMPLETE", nd, kw, blocks);
    expect(verdict.decision).toBe("B-SUPERIOR");
    expect(verdict.downgradedFrom).toBeUndefined();
  });

  it("a win count strictly between the two bounds reads INDISTINGUISHABLE", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const kw = Math.floor(nd / 2); // 30, strictly between (nd-c)=21 and c=39
    expect(kw).toBeGreaterThan(nd - c);
    expect(kw).toBeLessThan(c);
    const verdict = evaluatePairedGate("COMPLETE", nd, kw, neutralBlocks());
    expect(verdict.decision).toBe("INDISTINGUISHABLE");
  });

  it("a pooled W-SUPERIOR with exactly four of six blocks classified W-majority stands", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const blocks: PairedBlockClassification[] = ["W-majority", "W-majority", "W-majority", "W-majority", "B-majority", "block-tied"];
    const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks);
    expect(verdict.decision).toBe("W-SUPERIOR");
    expect(verdict.downgradedFrom).toBeUndefined();
  });

  it("the same pooled W-SUPERIOR with three agreeing blocks downgrades to INDISTINGUISHABLE and records what it was downgraded from", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const blocks: PairedBlockClassification[] = ["W-majority", "W-majority", "W-majority", "B-majority", "B-majority", "block-tied"];
    const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks);
    expect(verdict.decision).toBe("INDISTINGUISHABLE");
    expect(verdict.downgradedFrom).toBe("W-SUPERIOR");
  });

  it("classifyBlock: a block with zero discordant pairs classifies as block-tied and therefore never agrees with either direction", () => {
    expect(classifyBlock(0, 0)).toBe("block-tied");
  });

  it("a pooled null verdict is never upgraded by any block pattern", () => {
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const kw = Math.floor(nd / 2); // pooled indistinguishable
    const allWBlocks: PairedBlockClassification[] = Array(PAIRED_CONCORDANCE_BLOCK_COUNT).fill("W-majority") as PairedBlockClassification[];
    const verdict = evaluatePairedGate("COMPLETE", nd, kw, allWBlocks);
    expect(verdict.decision).toBe("INDISTINGUISHABLE");
    expect(verdict.downgradedFrom).toBeUndefined();
    void c;
  });

  it("a discordant count outside the table's own range throws rather than defaulting", () => {
    expect(() => evaluatePairedGate("COMPLETE", 19, 10, neutralBlocks())).toThrow();
    expect(() => evaluatePairedGate("COMPLETE", 61, 10, neutralBlocks())).toThrow();
  });

  it("table-driven sweep: the boundary-inclusive rule holds at several discordant counts across the table's range", () => {
    for (const nd of [20, 27, 35, 44, 52, 60]) {
      const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
      const wBlocks: PairedBlockClassification[] = ["W-majority", "W-majority", "W-majority", "W-majority", "block-tied", "block-tied"];
      const bBlocks: PairedBlockClassification[] = ["B-majority", "B-majority", "B-majority", "B-majority", "block-tied", "block-tied"];
      expect(evaluatePairedGate("COMPLETE", nd, c, wBlocks).decision).toBe("W-SUPERIOR");
      expect(evaluatePairedGate("COMPLETE", nd, nd - c, bBlocks).decision).toBe("B-SUPERIOR");
      if (nd - c < c - 1) {
        expect(evaluatePairedGate("COMPLETE", nd, c - 1, neutralBlocks()).decision).toBe("INDISTINGUISHABLE");
      }
    }
  });

  it("an unrecognised outcome throws", () => {
    expect(() => evaluatePairedGate("BOGUS" as PairedStudyOutcome, 30, 20, neutralBlocks())).toThrow();
  });

  it("a wrong-length block array throws", () => {
    expect(() => evaluatePairedGate("COMPLETE", 30, 20, ["block-tied"])).toThrow();
  });

  it("a win count exceeding the discordant count throws", () => {
    expect(() => evaluatePairedGate("COMPLETE", 30, 31, neutralBlocks())).toThrow();
  });
});

describe("accountPairedUnits", () => {
  function unit(seed: number, categoryW: PairedUnitAccountingInput["categoryW"], categoryB: PairedUnitAccountingInput["categoryB"]): PairedUnitAccountingInput {
    return { seed, categoryW, categoryB };
  }

  it("counts per-arm category totals, per-battery win/loss/tie, and per-block win/loss pairs", () => {
    const seed = PAIRED_SEEDS[0]!;
    const units: PairedUnitAccountingInput[] = [
      unit(seed, "resolution-match", "resolution-mismatch"), // W win
      unit(seed, "resolution-mismatch", "resolution-match"), // B win (loss)
      unit(seed, "resolution-match", "resolution-match"), // tie (both 1)
      unit(seed, "no-artifact", "non-scoreable"), // tie (both 0)
    ];
    const acc = accountPairedUnits(units);
    expect(acc.winCount).toBe(1);
    expect(acc.lossCount).toBe(1);
    expect(acc.tieCount).toBe(2);
    expect(acc.discordantCount).toBe(2);
    expect(acc.armW["resolution-match"]).toBe(2);
    expect(acc.armW["resolution-mismatch"]).toBe(1);
    expect(acc.armW["no-artifact"]).toBe(1);
    expect(acc.armB["resolution-mismatch"]).toBe(1);
    expect(acc.armB["resolution-match"]).toBe(2);
    expect(acc.armB["non-scoreable"]).toBe(1);
    expect(acc.blocks).toHaveLength(PAIRED_SEEDS.length);
    const block = acc.blocks.find((b) => b.seed === seed)!;
    expect(block.discordantWins).toBe(1);
    expect(block.discordantLosses).toBe(1);
  });

  it("ties never enter the discordant count", () => {
    const seed = PAIRED_SEEDS[0]!;
    const units: PairedUnitAccountingInput[] = [
      unit(seed, "resolution-match", "resolution-match"),
      unit(seed, "no-artifact", "no-artifact"),
    ];
    const acc = accountPairedUnits(units);
    expect(acc.tieCount).toBe(2);
    expect(acc.discordantCount).toBe(0);
  });

  it("a unit referencing an unpinned seed throws", () => {
    expect(() => accountPairedUnits([unit(9999, "resolution-match", "resolution-mismatch")])).toThrow();
  });
});
