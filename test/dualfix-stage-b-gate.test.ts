/**
 * The Stage-B gate evaluator's boundary, precision, firing-discipline and
 * auto-refusal coverage (Phase 12 — Corpus + paired repair run + gate,
 * Plan 12-02, REQ-66), fully offline against `_dualfix-gate.ts`'s exported
 * pure functions — no provider, no state file, no corpus.
 *
 * The §7 and §8 worked cases below are the pre-registration's own numbers,
 * asserted as stated (one step either side included), not paraphrased. The
 * auto-refusal sweep recomputes its expectations from the four imported
 * constants, never from a restated `3`/`20` literal, so a future edit that
 * quietly changes the threshold fails here.
 */
import { describe, it, expect } from "vitest";
import { evaluateStageBGate, assertPairedDenominator } from "../experiments/dualfix-study/_dualfix-gate.js";
import { isUnderpowered, isErrorBudgetExceeded } from "../experiments/dualfix-study/_dualfix-study.js";
import {
  DUALFIX_STAGE_B_MARGIN_NUM,
  DUALFIX_STAGE_B_MARGIN_DEN,
  DUALFIX_ERROR_BUDGET_NUM,
  DUALFIX_ERROR_BUDGET_DEN,
  DUALFIX_CORPUS_MIN_N,
} from "../experiments/dualfix-study/_dualfix-arms.js";

describe("§7 worked cases at n=20 — the prereg's own three boundary illustrations", () => {
  it("kD-kC=3 (exactly at the threshold, inclusive) fires: 20*3=60 >= 3*20=60 -> MET / STAGE B OPEN", () => {
    const r = evaluateStageBGate("COMPLETE", 3, 0, 20);
    expect(r.verdict).toBe("MET");
    expect(r.branch).toBe("STAGE B OPEN");
    expect(r.lhs).toBe(DUALFIX_STAGE_B_MARGIN_DEN * 3);
    expect(r.rhs).toBe(DUALFIX_STAGE_B_MARGIN_NUM * 20);
  });

  it("kD-kC=2 (one step short) does not fire: 20*2=40 < 3*20=60 -> NOT-MET / MILESTONE CLOSING", () => {
    const r = evaluateStageBGate("COMPLETE", 2, 0, 20);
    expect(r.verdict).toBe("NOT-MET");
    expect(r.branch).toBe("MILESTONE CLOSING");
    expect(r.lhs).toBe(DUALFIX_STAGE_B_MARGIN_DEN * 2);
    expect(r.rhs).toBe(DUALFIX_STAGE_B_MARGIN_NUM * 20);
  });

  it("kD-kC=4 (one step over) fires more clearly: 20*4=80 >= 3*20=60 -> MET / STAGE B OPEN", () => {
    const r = evaluateStageBGate("COMPLETE", 4, 0, 20);
    expect(r.verdict).toBe("MET");
    expect(r.branch).toBe("STAGE B OPEN");
    expect(r.lhs).toBe(DUALFIX_STAGE_B_MARGIN_DEN * 4);
    expect(r.rhs).toBe(DUALFIX_STAGE_B_MARGIN_NUM * 20);
  });
});

describe("§8 clause 2 worked cases at attemptedCount=20 — driven through the shipped isErrorBudgetExceeded", () => {
  it("2 errors: 10*2=20, not greater than 20 -> not a breach", () => {
    expect(isErrorBudgetExceeded(2, 20)).toBe(false);
  });

  it("3 errors: 10*3=30 > 20 -> a breach", () => {
    expect(isErrorBudgetExceeded(3, 20)).toBe(true);
  });
});

describe("§8 clause 1 underpowered boundary — driven through the shipped isUnderpowered", () => {
  it("a corpus of DUALFIX_CORPUS_MIN_N - 1 (19) classifies underpowered", () => {
    expect(isUnderpowered(DUALFIX_CORPUS_MIN_N - 1)).toBe(true);
  });

  it("a corpus of exactly DUALFIX_CORPUS_MIN_N (20) does not classify underpowered", () => {
    expect(isUnderpowered(DUALFIX_CORPUS_MIN_N)).toBe(false);
  });
});

describe("precision — both sides of the comparison are exact integers, no ratio, no rounding", () => {
  it("lhs/rhs satisfy Number.isInteger and equal the imported margin constants applied to the inputs, across all three worked cases", () => {
    for (const kD of [2, 3, 4]) {
      const r = evaluateStageBGate("COMPLETE", kD, 0, 20);
      expect(Number.isInteger(r.lhs)).toBe(true);
      expect(Number.isInteger(r.rhs)).toBe(true);
      expect(r.lhs).toBe(DUALFIX_STAGE_B_MARGIN_DEN * (kD - 0));
      expect(r.rhs).toBe(DUALFIX_STAGE_B_MARGIN_NUM * 20);
    }
  });

  it("a non-zero kC is subtracted before multiplication, still an exact integer pair", () => {
    const r = evaluateStageBGate("COMPLETE", 10, 7, 20);
    expect(Number.isInteger(r.lhs)).toBe(true);
    expect(r.lhs).toBe(DUALFIX_STAGE_B_MARGIN_DEN * (10 - 7));
    expect(r.rhs).toBe(DUALFIX_STAGE_B_MARGIN_NUM * 20);
  });
});

describe("firing discipline — §7 is never read outside a COMPLETE outcome", () => {
  it("UNDERPOWERED returns NOT-EVALUATED/MILESTONE CLOSING even with counts that would otherwise fire (kD-kC=4, n=20)", () => {
    const r = evaluateStageBGate("UNDERPOWERED", 20, 16, 20);
    expect(r.verdict).toBe("NOT-EVALUATED");
    expect(r.branch).toBe("MILESTONE CLOSING");
  });

  it("ERROR-BUDGET-EXCEEDED returns NOT-EVALUATED/MILESTONE CLOSING even with counts that would otherwise fire (kD-kC=4, n=20)", () => {
    const r = evaluateStageBGate("ERROR-BUDGET-EXCEEDED", 20, 16, 20);
    expect(r.verdict).toBe("NOT-EVALUATED");
    expect(r.branch).toBe("MILESTONE CLOSING");
  });
});

describe("auto-refusal sweep — the opening branch is unreachable outside the guarded region", () => {
  it("across every (outcome, kD, kC, n) with 0 <= kC,kD <= n <= 30, STAGE B OPEN appears only when outcome is COMPLETE and the imported-constant inequality holds", () => {
    const outcomes = ["COMPLETE", "UNDERPOWERED", "ERROR-BUDGET-EXCEEDED"] as const;
    let sweepCount = 0;
    let openCount = 0;
    for (let n = 0; n <= 30; n++) {
      for (let kD = 0; kD <= n; kD++) {
        for (let kC = 0; kC <= n; kC++) {
          for (const outcome of outcomes) {
            sweepCount++;
            const r = evaluateStageBGate(outcome, kD, kC, n);
            const expectedOpen = outcome === "COMPLETE" && DUALFIX_STAGE_B_MARGIN_DEN * (kD - kC) >= DUALFIX_STAGE_B_MARGIN_NUM * n;
            expect(r.branch === "STAGE B OPEN").toBe(expectedOpen);
            expect(r.verdict === "MET").toBe(expectedOpen);
            if (outcome !== "COMPLETE") expect(r.verdict).toBe("NOT-EVALUATED");
            if (r.branch === "STAGE B OPEN") openCount++;
          }
        }
      }
    }
    expect(sweepCount).toBeGreaterThanOrEqual(5000);
    // Sanity: the swept space does contain openings (the sweep is not vacuous).
    expect(openCount).toBeGreaterThan(0);
  });
});

describe("input validation — no coercion, throw on every rejected class", () => {
  it("throws on a fractional kD", () => {
    expect(() => evaluateStageBGate("COMPLETE", 2.5, 0, 20)).toThrow();
  });

  it("throws on a negative kC", () => {
    expect(() => evaluateStageBGate("COMPLETE", 3, -1, 20)).toThrow();
  });

  it("throws on a NaN n", () => {
    expect(() => evaluateStageBGate("COMPLETE", 3, 0, NaN)).toThrow();
  });

  it("throws when kD exceeds n", () => {
    expect(() => evaluateStageBGate("COMPLETE", 21, 0, 20)).toThrow();
  });

  it("throws when kC exceeds n", () => {
    expect(() => evaluateStageBGate("COMPLETE", 0, 21, 20)).toThrow();
  });

  it("throws on an unrecognised outcome string rather than defaulting to either branch", () => {
    // @ts-expect-error -- deliberately passing an invalid outcome to assert the runtime guard
    expect(() => evaluateStageBGate("PARTIAL", 3, 0, 20)).toThrow();
  });
});

describe("assertPairedDenominator", () => {
  it("returns (no throw) when the two arms' attempted counts are equal", () => {
    expect(() => assertPairedDenominator(20, 20)).not.toThrow();
  });

  it("throws naming both counts when the two arms' attempted counts diverge", () => {
    expect(() => assertPairedDenominator(20, 19)).toThrowError(/20.*19|19.*20/);
  });
});

// Confirm the error-budget constants imported above are the exact ones §8
// clause 2's worked cases depend on — a drifted constant would silently
// change the worked-case expectations without failing any assertion above.
describe("error-budget constants sanity", () => {
  it("DUALFIX_ERROR_BUDGET_NUM/DEN are 1/10, matching §8's stated ratio", () => {
    expect(DUALFIX_ERROR_BUDGET_NUM).toBe(1);
    expect(DUALFIX_ERROR_BUDGET_DEN).toBe(10);
  });
});
