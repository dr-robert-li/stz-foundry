/**
 * The phase tracer (Phase 1 — Data-ops pilot battery, Plan 01-01): one seed
 * travels facts -> messy source data -> the vertical-admission gate ->
 * `makeBattery`'s generator-rooted receipt guard -> `runAgentBattery` -> a
 * score, offline. The "end to end" test below is a POSITIVE CONTROL: it
 * proves the checks are SATISFIABLE by a candidate that computes the answer
 * from the warehouse's own precomputed facts, never from the prompt — it
 * does NOT prove a real LLM agent can solve the task. Non-triviality
 * controls (a null/echo candidate scoring below 1) are Plan 01-03's job.
 */
import { describe, it, expect } from "vitest";
import {
  generateWarehouse,
  buildTasks,
  generateFixtureBattery,
  acceptedGeneratorReceipt,
  DATA_OPS_GENERATOR_ID,
  type FixtureWarehouse,
} from "../src/foundry/fixture-warehouse.js";
import {
  admitVertical,
  requireAdmitted,
  admitVerticalBattery,
  VerticalRefusedError,
} from "../src/foundry/vertical-admission.js";
import { runAgentBattery, type CandidateAgent } from "../src/foundry/agent-runner.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

function fakeWarehouseTotals(warehouse: FixtureWarehouse): Record<string, { orderCount: number; revenueCents: number }> {
  const totals: Record<string, { orderCount: number; revenueCents: number }> = {};
  for (const fact of warehouse.facts) {
    totals[`${fact.customerId}__${fact.month}`] = {
      orderCount: fact.orderCount,
      revenueCents: fact.revenueCents,
    };
  }
  return totals;
}

/** The offline `Provider` double idiom (test/foundry-component-tournament.test.ts:28-57):
 *  computes the correct answer FROM `warehouse.facts` — never from the task
 *  prompt — so this is a satisfiability proof, not an agent capability claim. */
function factDerivedProvider(warehouse: FixtureWarehouse): Provider {
  return {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      const totals = fakeWarehouseTotals(warehouse);
      return {
        text: "```path=answer.json\n" + JSON.stringify({ totals }) + "\n```",
        model: "fact-derived-double",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
      };
    },
  };
}

describe("fixture-warehouse — REQ-24 compile-time signature guarantees", () => {
  it("generateWarehouse takes only a seed — no Provider/CandidateAgent param can be added silently", () => {
    expect(generateWarehouse.length).toBe(1);
  });

  it("generateFixtureBattery takes only (seed, batteryId) — no Provider param can be added silently", () => {
    expect(generateFixtureBattery.length).toBe(2);
  });
});

describe("vertical-admission — arity guarantees (no override/judge parameter)", () => {
  it("admitVertical takes only the vertical name", () => {
    expect(admitVertical.length).toBe(1);
  });

  it("requireAdmitted takes only the vertical name", () => {
    expect(requireAdmitted.length).toBe(1);
  });
});

describe("fixture-warehouse — D3/N6 determinism", () => {
  it("the same seed reproduces the warehouse (facts, rows, csv) exactly", () => {
    const a = generateWarehouse(20260729);
    const b = generateWarehouse(20260729);
    expect(a).toEqual(b);
  });

  it("different seeds produce different facts/rows/csv — catches a generator that ignores its seed", () => {
    const a = generateWarehouse(1);
    const b = generateWarehouse(2);
    expect(a).not.toEqual(b);
    expect(a.facts).not.toEqual(b.facts);
  });
});

describe("fixture-warehouse — the answer key does not leak into the csv (T-01-03)", () => {
  it("no fact's revenueCents appears verbatim in the generated csv, for several seeds", () => {
    for (const seed of [1, 2, 3, 42, 9999]) {
      const warehouse = generateWarehouse(seed);
      for (const fact of warehouse.facts) {
        const re = new RegExp(`(?<!\\d)${fact.revenueCents}(?!\\d)`);
        expect(re.test(warehouse.csv)).toBe(false);
      }
    }
  });
});

describe("vertical admission is wired on the REAL construction path (D1/REQ-27, Pitfall 4)", () => {
  it("admitVerticalBattery refuses a battery tagged revops-gtm-exec-strategy through the real construction entry point", () => {
    const warehouse = generateWarehouse(7);
    const tasks = buildTasks(warehouse);
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const draft = { id: "would-be-revops-battery", tasks, receipt };
    const err = (() => {
      try {
        admitVerticalBattery("revops-gtm-exec-strategy", draft);
      } catch (e) {
        return e as Error;
      }
      throw new Error("expected admitVerticalBattery to throw, it did not");
    })();
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("revops-gtm-exec-strategy");
    expect(err.message).toContain("refused");
  });

  it("admitVerticalBattery admits data-ops and returns a real AgentBattery", () => {
    const warehouse = generateWarehouse(8);
    const tasks = buildTasks(warehouse);
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const draft = { id: "data-ops-battery-8", tasks, receipt };
    const battery = admitVerticalBattery("data-ops", draft);
    expect(battery.id).toBe("data-ops-battery-8");
    expect(battery.tasks.length).toBeGreaterThan(0);
  });
});

describe("fixture-warehouse — receipt sharing (REQ-23, partial — full generator-rootedness gate lands in Task 2)", () => {
  it("acceptedGeneratorReceipt returns the SAME frozen object on every call", () => {
    const a = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const b = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    expect(Object.is(a, b)).toBe(true);
  });

  it("two batteries built from two different seeds carry the SAME pre-makeBattery receipt object", () => {
    // makeBattery shallow-copies and freezes a NEW receipt onto the battery
    // (battery-types.ts:264-267), so the two OUTPUT receipts cannot be
    // reference-compared — only the shared input object, held before
    // makeBattery runs, can be. Assert reference identity on that input, and
    // deep equality on the two frozen outputs (they came from the same
    // source object, so their content must match).
    const receiptBefore = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const batteryA = generateFixtureBattery(101, "data-ops-battery-a");
    const batteryB = generateFixtureBattery(202, "data-ops-battery-b");
    expect(Object.is(receiptBefore, acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID))).toBe(true);
    expect(batteryA.receipt).toEqual(batteryB.receipt);
  });
});

describe("fixture-warehouse end to end — one seed, facts to scored run, offline", () => {
  it("a fact-derived candidate double passes every check; the battery is admitted and generator-rooted", async () => {
    const seed = 20260729;
    const battery = generateFixtureBattery(seed, "data-ops-pilot-tracer");
    const warehouse = generateWarehouse(seed);

    const candidate: CandidateAgent = { id: "cand-fact-derived", systemPrompt: "n/a" };
    const run = await runAgentBattery(candidate, battery, { providerImpl: factDerivedProvider(warehouse) });

    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
    expect(run.receipt.kind).toBe("constructed");
    expect(run.receipt.lineage[0]).toContain(DATA_OPS_GENERATOR_ID);
  });
});
