/**
 * The pre-round instrument-health probe's own proof (Phase 14 — Instrument
 * build, Plan 14-04, REQ-68), fully offline against a local stub `Provider`
 * — never `createProvider`, never a network call (N6 determinism, mirroring
 * `test/paired-tracer.test.ts`'s own pattern). State lives under a fresh
 * `mkdtempSync` directory for every test — no state file is ever written
 * under `experiments/paired-comparison-arm/` by this suite.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";
import { loadState } from "../experiments/paired-comparison-arm/_paired-arms.js";
import { CEILING_PROBE_SEED, CEILING_PROBE_TASK_COUNT, CEILING_PROBE_SCOREABLE_FLOOR } from "../experiments/paired-comparison-arm/_paired-constants.js";
import {
  PROBE_MODES,
  probeUnitKey,
  buildProbePrompt,
  runProbeUnit,
  onceWithHarnessRetry,
  buildProbeUnitOrder,
  runProbeUnits,
  computeProbeModeAccounting,
  evaluateProbePass,
  CEILING_PROBE_TRUNCATION_MARKER,
  type ProbeMode,
} from "../experiments/paired-comparison-arm/_ceiling-probe.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { CustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";

const TICKET = generateCustomerSupportTicket(CEILING_PROBE_SEED, 0);

function matchingResponse(resolution: { action: string; category: string; parameter: string }): string {
  return `action: ${resolution.action}\ncategory: ${resolution.category}\nparameter: ${resolution.parameter}`;
}

function makeQueueProvider(replies: (string | Error)[]): { provider: Provider; calls: ChatRequest[] } {
  const queue = [...replies];
  const calls: ChatRequest[] = [];
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error("queue stub exhausted — more calls issued than replies queued");
      if (next instanceof Error) throw next;
      return { text: next, model: req.model, usage: { inputTokens: 5, outputTokens: 9, cacheReadInputTokens: 0 } };
    },
  };
  return { provider, calls };
}

function freshStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "paired-ceiling-probe-test-")), "state.json");
}

describe("buildProbePrompt — the probe's own minimal instruction, never the real round's arm prompt", () => {
  it("system prompt states the output contract and both closed vocabularies", () => {
    const { system } = buildProbePrompt(TICKET, "normal");
    expect(system).toContain("action: <value>");
    expect(system).toContain("category: <value>");
    expect(system).toContain("parameter: <value>");
    expect(system).toContain(TICKET.resolution.action);
    expect(system).toContain(TICKET.resolution.category);
  });

  it("answer-visible mode shows the resolution verbatim in the user message and asks only for its restatement", () => {
    const { user } = buildProbePrompt(TICKET, "answer-visible");
    expect(user).toContain(TICKET.resolution.action);
    expect(user).toContain(TICKET.resolution.category);
    expect(user).toContain(TICKET.resolution.parameter);
  });

  it("normal mode shows only the ticket text — never the resolution's own parameter value", () => {
    const { user } = buildProbePrompt(TICKET, "normal");
    expect(user).toContain(TICKET.ticketText);
    expect(user).not.toContain(TICKET.resolution.parameter);
  });

  it("truncates at the pinned prompt-character bound, appending a visible marker", () => {
    const hugeTicket: CustomerSupportTicket = { ...TICKET, ticketText: "x".repeat(5000) };
    const { user } = buildProbePrompt(hugeTicket, "normal");
    expect(user.length).toBeLessThanOrEqual(2000);
    expect(user.endsWith(CEILING_PROBE_TRUNCATION_MARKER)).toBe(true);
  });
});

describe("behavior 1 — each unit runs in both modes, recorded under distinct checkpoint keys", () => {
  it("buildProbeUnitOrder produces two entries per task index, answer-visible then normal, with distinct keys", () => {
    const order = buildProbeUnitOrder();
    expect(order.length).toBe(CEILING_PROBE_TASK_COUNT * 2);
    for (let taskIndex = 0; taskIndex < CEILING_PROBE_TASK_COUNT; taskIndex++) {
      const pair = order.filter((u) => u.taskIndex === taskIndex);
      expect(pair.map((u) => u.mode)).toEqual(["answer-visible", "normal"]);
      expect(pair[0]!.key).not.toBe(pair[1]!.key);
    }
    expect(new Set(order.map((u) => u.key)).size).toBe(order.length);
  });

  it("probeUnitKey never collides across modes for the same unit id", () => {
    const unitId = "1399:0";
    expect(probeUnitKey("answer-visible", unitId)).not.toBe(probeUnitKey("normal", unitId));
  });
});

describe("behavior 2 — a completed unit is never re-run on a resumed pass", () => {
  it("running the same unit twice through onceWithHarnessRetry issues exactly one inference call", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider, calls } = makeQueueProvider([matchingResponse(TICKET.resolution)]);
    const key = probeUnitKey("answer-visible", "1399:0");
    const run = () => runProbeUnit(TICKET, "1399:0", "answer-visible", provider);

    const first = await onceWithHarnessRetry(statePath, state, key, run);
    expect(calls.length).toBe(1);
    const second = await onceWithHarnessRetry(statePath, state, key, run);
    expect(calls.length).toBe(1);
    expect(second).toEqual(first);

    const reloaded = loadState(statePath);
    const third = await onceWithHarnessRetry(statePath, reloaded, key, run);
    expect(calls.length).toBe(1);
    expect(third).toEqual(first);
  });
});

describe("behavior 3 — a transient inference-slot fault is retried exactly once", () => {
  it("an error status is retried once, and the retry's own success is the persisted result", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider, calls } = makeQueueProvider([new Error("connection refused"), matchingResponse(TICKET.resolution)]);
    const key = probeUnitKey("normal", "1399:0");

    const result = await onceWithHarnessRetry(statePath, state, key, () =>
      runProbeUnit(TICKET, "1399:0", "normal", provider),
    );

    expect(calls.length).toBe(2);
    expect(result.status).toBe("ok");
    expect(result.oracleCategory).toBe("resolution-match");
    expect(state.retries.length).toBe(1);
    expect(state.retries[0]).toContain(key);
    // Exactly one persisted entry for this key — the retry is not a second
    // logged unit.
    expect(Object.keys(state.units).filter((k) => k === key).length).toBe(1);
  });

  it("a second consecutive error still counts toward the floor — retry is exactly one attempt, not a loop", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider, calls } = makeQueueProvider([new Error("connection refused"), new Error("connection refused")]);
    const key = probeUnitKey("answer-visible", "1399:0");

    const result = await onceWithHarnessRetry(statePath, state, key, () =>
      runProbeUnit(TICKET, "1399:0", "answer-visible", provider),
    );

    expect(calls.length).toBe(2); // original attempt + exactly one retry, never a third call
    expect(result.status).toBe("error");
    expect(state.retries.length).toBe(1);
  });

  it("a timeout is never retried (a measurement, not a harness fault)", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const provider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(): Promise<ChatResponse> {
        return new Promise(() => {}); // never resolves — forces the internal race timer to fire
      },
    };
    const key = probeUnitKey("normal", "1399:0");

    const result = await onceWithHarnessRetry(statePath, state, key, () =>
      runProbeUnit(TICKET, "1399:0", "normal", provider, { taskTimeoutMs: 5 }),
    );

    expect(result.status).toBe("timeout");
    expect(state.retries.length).toBe(0);
  });
});

describe("behavior 4 — the verdict is derivable only after every unit in the deterministic order has a final result", () => {
  it("runProbeUnits exhausts the full deterministic order — every key present, no gaps", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider, calls } = makeQueueProvider(
      Array.from({ length: CEILING_PROBE_TASK_COUNT * 2 }, () => matchingResponse(TICKET.resolution)),
    );
    const runUnit = (ticket: CustomerSupportTicket, unitId: string, mode: ProbeMode) =>
      runProbeUnit(ticket, unitId, mode, provider);

    await runProbeUnits(statePath, state, runUnit);

    const expectedKeys = buildProbeUnitOrder().map((u) => u.key);
    expect(Object.keys(state.units).sort()).toEqual([...expectedKeys].sort());
    expect(calls.length).toBe(CEILING_PROBE_TASK_COUNT * 2);
  });

  it("a resumed runProbeUnits over an already-complete state issues zero further calls", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider, calls } = makeQueueProvider(
      Array.from({ length: CEILING_PROBE_TASK_COUNT * 2 }, () => matchingResponse(TICKET.resolution)),
    );
    const runUnit = (ticket: CustomerSupportTicket, unitId: string, mode: ProbeMode) =>
      runProbeUnit(ticket, unitId, mode, provider);

    await runProbeUnits(statePath, state, runUnit);
    expect(calls.length).toBe(CEILING_PROBE_TASK_COUNT * 2);

    const reloaded = loadState(statePath);
    await runProbeUnits(statePath, reloaded, runUnit);
    expect(calls.length).toBe(CEILING_PROBE_TASK_COUNT * 2); // unchanged — every unit was cached
  });
});

describe("behavior 5 — the pass decision is a plain integer comparison of the answer-visible mode's scoreable count", () => {
  it("evaluateProbePass: at, above, and below the floor", () => {
    expect(evaluateProbePass(8, 8)).toBe(true);
    expect(evaluateProbePass(9, 8)).toBe(true);
    expect(evaluateProbePass(7, 8)).toBe(false);
  });

  it("uses CEILING_PROBE_SCOREABLE_FLOOR, imported, never a retyped literal", () => {
    expect(evaluateProbePass(CEILING_PROBE_SCOREABLE_FLOOR, CEILING_PROBE_SCOREABLE_FLOOR)).toBe(true);
    expect(evaluateProbePass(CEILING_PROBE_SCOREABLE_FLOOR - 1, CEILING_PROBE_SCOREABLE_FLOOR)).toBe(false);
  });

  it("computeProbeModeAccounting reads mode from the checkpoint key prefix, never the vestigial arm field", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const { provider } = makeQueueProvider([
      matchingResponse(TICKET.resolution), // answer-visible: match
      "action: wrong\ncategory: wrong\nparameter: 0.00", // normal: mismatch
    ]);

    await onceWithHarnessRetry(statePath, state, probeUnitKey("answer-visible", "1399:0"), () =>
      runProbeUnit(TICKET, "1399:0", "answer-visible", provider),
    );
    await onceWithHarnessRetry(statePath, state, probeUnitKey("normal", "1399:0"), () =>
      runProbeUnit(TICKET, "1399:0", "normal", provider),
    );

    const av = computeProbeModeAccounting(state.units, "answer-visible");
    const normal = computeProbeModeAccounting(state.units, "normal");
    expect(av.attempted).toBe(1);
    expect(av.scoreable).toBe(1);
    expect(av.matched).toBe(1);
    expect(normal.attempted).toBe(1);
    expect(normal.scoreable).toBe(1);
    expect(normal.matched).toBe(0);
  });
});

describe("PROBE_MODES — the two-mode closed set", () => {
  it("is exactly answer-visible and normal", () => {
    expect(PROBE_MODES).toEqual(["answer-visible", "normal"]);
  });
});
