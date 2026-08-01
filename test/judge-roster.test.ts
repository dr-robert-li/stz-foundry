/**
 * The component judge roster — measured precedence, and a refusal that cannot
 * be bypassed by availability.
 */
import { describe, it, expect } from "vitest";
import {
  COMPONENT_JUDGE_ROSTER,
  JudgeRosterError,
  profileFor,
  selectJudge,
} from "../src/judge-roster.js";
import { calibrationGate } from "../src/judge-reliability.js";

const ALL = COMPONENT_JUDGE_ROSTER.map((j) => j.model);
const byRole = (role: string) => COMPONENT_JUDGE_ROSTER.find((j) => j.role === role)!;

describe("selectJudge — strict precedence, fail-closed", () => {
  it("picks the primary when everything is available", () => {
    expect(selectJudge(ALL).model).toBe("gemma4:31b");
    expect(selectJudge(ALL).role).toBe("primary");
  });

  it("falls to the alternate, then the fallback, as models drop out", () => {
    expect(selectJudge(ALL.filter((m) => m !== "gemma4:31b")).model).toBe("gpt-oss:latest");
    expect(
      selectJudge(ALL.filter((m) => m !== "gemma4:31b" && m !== "gpt-oss:latest")).model,
    ).toBe("nemotron3:33b");
  });

  it("REFUSES rather than falling through to the refused judge", () => {
    // granite is available and is the only thing left — it must still not be
    // selected. A judge below the trivial-preference baseline is worse than
    // reading nothing; "something is better than nothing" is precisely wrong.
    expect(() => selectJudge(["granite4.1:30b"])).toThrow(JudgeRosterError);
    expect(() => selectJudge(["granite4.1:30b"])).toThrow(/REFUSED/);
    expect(() => selectJudge(["granite4.1:30b"])).toThrow(/below the/);
  });

  it("throws on an empty availability set rather than defaulting", () => {
    expect(() => selectJudge([])).toThrow(JudgeRosterError);
  });

  it("ignores unknown models — an unrostered model is not a judge", () => {
    expect(() => selectJudge(["some-new-model:latest"])).toThrow(JudgeRosterError);
  });
});

describe("the roster's measured claims hold together", () => {
  it("every non-refused judge beats the trivial-preference baseline", () => {
    for (const j of COMPONENT_JUDGE_ROSTER) {
      if (j.role === "refused") continue;
      expect(j.accuracy).toBeGreaterThan(j.baselineAccuracy);
    }
  });

  it("the refused judge is refused BECAUSE it fails that bar", () => {
    const granite = byRole("refused");
    expect(granite.accuracy).toBeLessThanOrEqual(granite.baselineAccuracy);
    expect(granite.bucket).toBe("low");
  });

  it("exactly one primary, and it is the order-perfect one", () => {
    expect(COMPONENT_JUDGE_ROSTER.filter((j) => j.role === "primary")).toHaveLength(1);
    // Consistency, not raw accuracy, is the defensible reason for the pick:
    // the accuracy gaps are inside the measured ±1-pair noise at n=19.
    const primary = byRole("primary");
    for (const j of COMPONENT_JUDGE_ROSTER) {
      expect(primary.consistency).toBeGreaterThanOrEqual(j.consistency);
    }
  });
});

describe("profileFor — feeds the real gate", () => {
  it("a calibrated judge's profile passes calibrationGate", () => {
    for (const role of ["primary", "alternate", "fallback"]) {
      const j = byRole(role);
      expect(calibrationGate(profileFor(j), "component").calibrated).toBe(true);
    }
  });

  it("the refused judge's profile is EMITTED and still fails the gate", () => {
    // Emitted, not omitted: "never calibrated" and "calibrated and found
    // wanting" are different facts and must not collapse into one.
    const profile = profileFor(byRole("refused"));
    expect(profile.perSliceType).toHaveLength(1);
    const gate = calibrationGate(profile, "component");
    expect(gate.calibrated).toBe(false);
    // It fails BOTH guards — sub-threshold consistency and a low accuracy
    // bucket — and the gate reports whichever it checks first (consistency).
    // Asserting the specific string here documents the real order rather than
    // the one that reads more intuitively.
    expect(gate.reason).toContain("consistency");
    expect(byRole("refused").bucket).toBe("low");
  });

  it("a profile for one slice type does not calibrate another", () => {
    const profile = profileFor(byRole("primary"), "component");
    expect(calibrationGate(profile, "some-other-slice").calibrated).toBe(false);
  });
});
