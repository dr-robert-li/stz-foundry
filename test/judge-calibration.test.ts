/**
 * The blind judge-calibration battery scorer — the missing input to
 * `calibrationGate`'s fail-closed `blindAccuracyBucket`.
 *
 * The property under test is that this cannot mint a passing calibration from
 * thin evidence: too few pairs, indiscriminable pairs, or a malformed verdict
 * must refuse rather than emit a weak-but-usable profile.
 */
import { describe, it, expect } from "vitest";
import {
  scoreCalibrationBattery,
  batteryHash,
  CalibrationBatteryError,
  MIN_BATTERY_SIZE,
  MIN_DISCRIMINABLE_GAP,
  type BlindPair,
} from "../src/judge-calibration.js";
import { calibrationGate } from "../src/judge-reliability.js";

/** n pairs with a clear oracle gap; `correctUpTo` of them judged correctly. */
const pairs = (n: number, correctUpTo: number, over: Partial<BlindPair> = {}): BlindPair[] =>
  Array.from({ length: n }, (_, i) => ({
    pairId: `p${i}`,
    oracleWinner: `win-${i}`,
    oracleLoser: `lose-${i}`,
    gap: 0.4,
    judgeVerdict: i < correctUpTo ? `win-${i}` : `lose-${i}`,
    ...over,
  }));

describe("scoreCalibrationBattery — cannot mint a passing calibration from thin evidence", () => {
  it("refuses a battery smaller than MIN_BATTERY_SIZE even at 100% accuracy", () => {
    // The dangerous case: 3/3 correct reads as perfect, and would hand
    // `calibrationGate` a "high" bucket earned from luck.
    expect(() => scoreCalibrationBattery("component", pairs(3, 3))).toThrow(CalibrationBatteryError);
    expect(() => scoreCalibrationBattery("component", pairs(3, 3))).toThrow(/Refusing to emit a profile/);
  });

  it("DROPS pairs whose oracle gap is inside the noise floor, and says so", () => {
    // Below the floor the oracle itself cannot say which is better — the
    // ordering could flip on a re-run, so scoring the judge on it is scoring
    // it against our own noise.
    const mixed = [
      ...pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE),
      ...pairs(4, 0, { gap: 0.01 }).map((p, i) => ({ ...p, pairId: `tiny${i}` })),
    ];
    const result = scoreCalibrationBattery("component", mixed);
    expect(result.dropped).toBe(4);
    expect(result.scored).toBe(MIN_BATTERY_SIZE);
    // The dropped pairs were all judged WRONG; if they had been scored the
    // accuracy would be 12/16 = 0.75, not 1.0.
    expect(result.accuracy).toBe(1);
    expect(result.notes.join(" ")).toContain("below the");
  });

  it("refuses when too FEW pairs survive the gap filter, however many were supplied", () => {
    const allTiny = pairs(40, 40, { gap: 0.05 });
    expect(() => scoreCalibrationBattery("component", allTiny)).toThrow(/discriminable pair/);
  });

  it("refuses a verdict naming neither side — a wiring bug is not a wrong answer", () => {
    const bad = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    bad[0]!.judgeVerdict = "some-other-specimen";
    expect(() => scoreCalibrationBattery("component", bad)).toThrow(/names\s+neither side/);
  });

  it("refuses duplicate pair ids and self-paired entries", () => {
    const dup = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    dup[1]!.pairId = dup[0]!.pairId;
    expect(() => scoreCalibrationBattery("component", dup)).toThrow(/duplicate pairId/);

    const self = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    self[0]!.oracleLoser = self[0]!.oracleWinner;
    expect(() => scoreCalibrationBattery("component", self)).toThrow(/same id on both sides/);
  });

  it("buckets accuracy, and a coin-flip judge lands LOW", () => {
    const n = 20;
    expect(scoreCalibrationBattery("component", pairs(n, 19)).bucket).toBe("high");
    expect(scoreCalibrationBattery("component", pairs(n, 15)).bucket).toBe("medium");
    // A judge that is right half the time is worthless at ranking, and must
    // not be able to steer promotion.
    expect(scoreCalibrationBattery("component", pairs(n, 10)).bucket).toBe("low");
  });

  it("measures consistency from order-swapped verdicts, and flags when it did NOT", () => {
    const unswapped = scoreCalibrationBattery("component", pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE));
    // consistencyScore returns 1 for an empty set; that is a DEFAULT, not a
    // measurement, and the notes must say so or a reader will bank it.
    expect(unswapped.consistency).toBe(1);
    expect(unswapped.notes.join(" ")).toContain("NOT measured");

    // A judge that flips its answer when the order flips is inconsistent
    // even when it is often "correct" on the original presentation.
    const flipped = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE).map((p, i) => ({
      ...p,
      judgeVerdictSwapped: i < 6 ? p.oracleLoser : p.oracleWinner,
    }));
    const result = scoreCalibrationBattery("component", flipped);
    expect(result.consistency).toBeCloseTo(0.5, 10);
  });
});

describe("batteryHash — the set was fixed before the judge ran, checkably", () => {
  it("is stable under key order and insertion order", () => {
    const a = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    const b = [...a].reverse();
    expect(batteryHash(b)).toBe(batteryHash(a));
  });

  it("ignores the judge's verdicts, so it can be computed BEFORE the judge runs", () => {
    const before = pairs(MIN_BATTERY_SIZE, 0);
    const after = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    expect(batteryHash(after)).toBe(batteryHash(before));
  });

  it("CHANGES if the question set or its ground truth is edited after the fact", () => {
    const original = pairs(MIN_BATTERY_SIZE, MIN_BATTERY_SIZE);
    const h = batteryHash(original);
    // Swapping a ground-truth ordering — the edit that would silently turn a
    // wrong answer into a right one.
    const tampered = original.map((p, i) =>
      i === 0 ? { ...p, oracleWinner: p.oracleLoser, oracleLoser: p.oracleWinner } : p,
    );
    expect(batteryHash(tampered)).not.toBe(h);
    // Dropping an inconvenient pair.
    expect(batteryHash(original.slice(1))).not.toBe(h);
  });
});

describe("the gate this feeds — end to end", () => {
  it("a scored battery finally lets calibrationGate PASS, which it never could before", () => {
    // Before: no profile for the slice type — fail-closed, the state both
    // tournament rounds ran in.
    const empty = { schemaVersion: 1 as const, perSliceType: [] };
    expect(calibrationGate(empty, "component").calibrated).toBe(false);
    expect(calibrationGate(empty, "component").reason).toContain("no-profile");

    // A profile whose battery never ran is still fail-closed.
    const pending = {
      schemaVersion: 1 as const,
      perSliceType: [{ sliceType: "component", consistency: 1, blindAccuracyBucket: null, n: 0 }],
    };
    expect(calibrationGate(pending, "component").calibrated).toBe(false);

    // After: a real scored battery produces an entry the gate accepts.
    const scored = scoreCalibrationBattery(
      "component",
      pairs(20, 19).map((p) => ({ ...p, judgeVerdictSwapped: p.judgeVerdict })),
    );
    const profile = { schemaVersion: 1 as const, perSliceType: [scored.entry] };
    expect(calibrationGate(profile, "component").calibrated).toBe(true);
  });

  it("a LOW-accuracy judge is still refused — calibration is not a rubber stamp", () => {
    const scored = scoreCalibrationBattery(
      "component",
      pairs(20, 10).map((p) => ({ ...p, judgeVerdictSwapped: p.judgeVerdict })),
    );
    const profile = { schemaVersion: 1 as const, perSliceType: [scored.entry] };
    expect(scored.bucket).toBe("low");
    expect(calibrationGate(profile, "component").calibrated).toBe(false);
    expect(calibrationGate(profile, "component").reason).toContain("accuracy low");
  });

  it("a judge that flips under order perturbation is refused even at HIGH accuracy", () => {
    // 2606.14629's confident-but-wrong shape: right often, but not stable.
    const scored = scoreCalibrationBattery(
      "component",
      pairs(20, 19).map((p, i) => ({
        ...p,
        judgeVerdictSwapped: i < 10 ? p.oracleLoser : p.judgeVerdict,
      })),
    );
    expect(scored.bucket).toBe("high");
    expect(scored.consistency).toBeLessThan(0.7);
    const profile = { schemaVersion: 1 as const, perSliceType: [scored.entry] };
    expect(calibrationGate(profile, "component").calibrated).toBe(false);
    expect(calibrationGate(profile, "component").reason).toContain("consistency");
  });
});
