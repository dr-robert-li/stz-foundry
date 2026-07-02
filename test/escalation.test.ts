import { describe, it, expect } from "vitest";
import {
  initialEscalation,
  onNoPassers,
  isHalted,
  escalationTrace,
  MAX_RETRIES,
  MAX_REPLANS,
  DEFAULT_RETRY_POLICY,
} from "../src/escalation.js";

describe("F14 bounded escalation FSM (R1 headline mitigation)", () => {
  it("first failure → GRPO retry", () => {
    const { next, action } = onNoPassers(initialEscalation());
    expect(action.type).toBe("retry");
    expect(next.stage).toBe("grpo-retry");
    expect(next.retryCount).toBe(1);
  });

  it("second failure → replan", () => {
    let s = initialEscalation();
    s = onNoPassers(s).next;
    const { next, action } = onNoPassers(s);
    expect(action.type).toBe("replan");
    expect(next.stage).toBe("replan");
    expect(next.replanCount).toBe(1);
  });

  it("third failure → halt", () => {
    let s = initialEscalation();
    s = onNoPassers(s).next;
    s = onNoPassers(s).next;
    const { next, action } = onNoPassers(s);
    expect(action.type).toBe("halt");
    expect(isHalted(next)).toBe(true);
  });

  it("CEILING HOLDS: trace is exactly retry → replan → halt and terminates", () => {
    const actions = escalationTrace();
    expect(actions.map((a) => a.type)).toEqual(["retry", "replan", "halt"]);
    expect(actions).toHaveLength(MAX_RETRIES + MAX_REPLANS + 1);
  });

  it("halt is absorbing: further calls never escape it", () => {
    let s = initialEscalation();
    for (let i = 0; i < 10; i++) s = onNoPassers(s).next;
    expect(s.stage).toBe("halted");
    expect(s.retryCount).toBeLessThanOrEqual(MAX_RETRIES);
    expect(s.replanCount).toBeLessThanOrEqual(MAX_REPLANS);
  });
});

describe("configurable retryPolicy (1.8.0)", () => {
  it("{retries:0, replans:0} halts on the FIRST no-passers", () => {
    const { next, action } = onNoPassers(initialEscalation(), { retries: 0, replans: 0 });
    expect(action.type).toBe("halt");
    expect(isHalted(next)).toBe(true);
  });

  it("{retries:0, replans:1} skips straight to replan then halts", () => {
    const actions = escalationTrace(initialEscalation(), { retries: 0, replans: 1 });
    expect(actions.map((a) => a.type)).toEqual(["replan", "halt"]);
  });

  it("{retries:3, replans:1} runs the full sequence", () => {
    const actions = escalationTrace(initialEscalation(), { retries: 3, replans: 1 });
    expect(actions.map((a) => a.type)).toEqual(["retry", "retry", "retry", "replan", "halt"]);
  });

  it("{retries:-1} is unbounded: stays in grpo-retry, never halts", () => {
    let s = initialEscalation();
    for (let i = 0; i < 20; i++) {
      const { next, action } = onNoPassers(s, { retries: -1, replans: 0 });
      expect(action.type).toBe("retry");
      s = next;
    }
    expect(s.stage).toBe("grpo-retry");
    expect(s.retryCount).toBe(20);
  });

  it("{replans:-1} after bounded retries: replans forever", () => {
    let s = initialEscalation();
    const policy = { retries: 1, replans: -1 };
    s = onNoPassers(s, policy).next; // consumes the one retry
    for (let i = 0; i < 20; i++) {
      const { next, action } = onNoPassers(s, policy);
      expect(action.type).toBe("replan");
      s = next;
    }
    expect(s.stage).toBe("replan");
  });

  it("escalationTrace refuses unbounded policies (they never terminate)", () => {
    expect(() => escalationTrace(initialEscalation(), { retries: -1, replans: 0 })).toThrow(
      /never terminates/,
    );
  });

  it("default policy equals the engine constants (backward compatible)", () => {
    expect(DEFAULT_RETRY_POLICY).toEqual({ retries: MAX_RETRIES, replans: MAX_REPLANS });
  });
});
