/**
 * The paired-round instrument's tracer's end-to-end proof (Phase 14 —
 * Instrument build, Plan 14-01, REQ-68/REQ-69), fully offline. One seeded
 * ticket, both arm slots, an independent oracle, one persisted paired unit —
 * against a local recording stub `Provider` (never `createProvider`, never
 * a network call — N6 determinism, mirroring `test/dualfix-study-arms.test.ts`'s
 * own pattern).
 *
 * State lives under a fresh `mkdtempSync` directory for every test — no
 * state file is ever written under `experiments/paired-comparison-arm/` by
 * this suite.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";
import { classifyCustomerSupportResponse } from "../src/foundry/customer-support-oracle.js";
import {
  PAIRED_ARM_SLOTS,
  pairingUnitId,
  pairedUnitKey,
  runArmOnPairingUnit,
  classifyPair,
  loadState,
  once,
  type PairedAgentDefinition,
} from "../experiments/paired-comparison-arm/_paired-arms.js";
import { PAIRED_SEEDS } from "../experiments/paired-comparison-arm/_paired-constants.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

function makeRecordingProvider(replyText: string): { provider: Provider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      return { text: replyText, model: req.model, usage: { inputTokens: 5, outputTokens: 9, cacheReadInputTokens: 0 } };
    },
  };
  return { provider, calls };
}

const SEED = PAIRED_SEEDS[0]!; // 1301
const TASK_INDEX = 0;
const UNIT_ID = pairingUnitId(SEED, TASK_INDEX);
const AGENT_DEFINITION: PairedAgentDefinition = { id: "test-agent", systemPrompt: "You are a test agent." };

function matchingResponse(resolution: { action: string; category: string; parameter: string }): string {
  return `action: ${resolution.action}\ncategory: ${resolution.category}\nparameter: ${resolution.parameter}`;
}

describe("generateCustomerSupportTicket — determinism and structure", () => {
  it("generating seed 1301 task 0 twice returns byte-identical ticket text and an identical resolution record", () => {
    const first = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const second = generateCustomerSupportTicket(SEED, TASK_INDEX);
    expect(second.ticketText).toBe(first.ticketText);
    expect(second.resolution).toEqual(first.resolution);
  });

  it("the resolution record carries exactly three structured fields", () => {
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    expect(Object.keys(ticket.resolution).sort()).toEqual(["action", "category", "parameter"]);
    expect(typeof ticket.resolution.action).toBe("string");
    expect(typeof ticket.resolution.category).toBe("string");
    expect(typeof ticket.resolution.parameter).toBe("string");
  });
});

describe("classifyCustomerSupportResponse — the four-category extraction/equivalence contract", () => {
  const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);

  it("a response naming all three fields on labelled lines, values equal under normalization, classifies as resolution-match", () => {
    const raw = `Action: ${ticket.resolution.action.toUpperCase()}\n  Category:  ${ticket.resolution.category}  \nparameter: ${ticket.resolution.parameter}`;
    const result = classifyCustomerSupportResponse(raw, ticket.resolution);
    expect(result.category).toBe("resolution-match");
    expect(result.score).toBe(1);
  });

  it("the same response with one field's value altered classifies as resolution-mismatch", () => {
    const raw = `action: ${ticket.resolution.action}\ncategory: ${ticket.resolution.category}\nparameter: 999.99`;
    expect(ticket.resolution.parameter).not.toBe("999.99");
    const result = classifyCustomerSupportResponse(raw, ticket.resolution);
    expect(result.category).toBe("resolution-mismatch");
    expect(result.score).toBe(0);
  });

  it("a response omitting one label classifies as non-scoreable", () => {
    const raw = `action: ${ticket.resolution.action}\nparameter: ${ticket.resolution.parameter}`;
    const result = classifyCustomerSupportResponse(raw, ticket.resolution);
    expect(result.category).toBe("non-scoreable");
    expect(result.score).toBe(0);
  });

  it("a response carrying two candidate values under one label classifies as non-scoreable", () => {
    const raw = `action: ${ticket.resolution.action}\naction: some-other-value\ncategory: ${ticket.resolution.category}\nparameter: ${ticket.resolution.parameter}`;
    const result = classifyCustomerSupportResponse(raw, ticket.resolution);
    expect(result.category).toBe("non-scoreable");
  });

  it("an empty response classifies as no-artifact", () => {
    const result = classifyCustomerSupportResponse("", ticket.resolution);
    expect(result.category).toBe("no-artifact");
    expect(result.score).toBe(0);

    const whitespaceOnly = classifyCustomerSupportResponse("   \n  ", ticket.resolution);
    expect(whitespaceOnly.category).toBe("no-artifact");
  });
});

describe("classifyPair — win/loss/tie by plain integer comparison", () => {
  it("W:1 B:0 classifies as win; W:0 B:1 as loss; equal scores as tie", () => {
    expect(classifyPair(1, 0)).toBe("win");
    expect(classifyPair(0, 1)).toBe("loss");
    expect(classifyPair(1, 1)).toBe("tie");
    expect(classifyPair(0, 0)).toBe("tie");
  });
});

describe("one seeded ticket, both arm slots, one recorded pair — end to end", () => {
  it("both arm slots score against the independent oracle and classify win/loss/tie correctly", async () => {
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider: matchingProvider } = makeRecordingProvider(matchingResponse(ticket.resolution));
    const { provider: mismatchProvider } = makeRecordingProvider("action: wrong\ncategory: wrong\nparameter: 0.00");

    const wResult = await runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, matchingProvider);
    const bResult = await runArmOnPairingUnit(ticket, UNIT_ID, "B", AGENT_DEFINITION, mismatchProvider);

    expect(wResult.oracleCategory).toBe("resolution-match");
    expect(wResult.score).toBe(1);
    expect(bResult.oracleCategory).toBe("resolution-mismatch");
    expect(bResult.score).toBe(0);
    expect(classifyPair(wResult.score, bResult.score)).toBe("win");
  });

  it("running the driver twice over the same state file performs the inference call once — the second pass reads the cached unit", async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), "paired-tracer-test-")), "state.json");
    const state = loadState(statePath);
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider, calls } = makeRecordingProvider(matchingResponse(ticket.resolution));

    const key = pairedUnitKey("W", UNIT_ID);
    const first = await once(statePath, state, key, () => runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider));
    expect(calls.length).toBe(1);

    const second = await once(statePath, state, key, () => runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider));
    expect(calls.length).toBe(1); // no second inference call — cached unit read instead
    expect(second).toEqual(first);

    // Re-loading state from disk and re-running through once() confirms the
    // checkpoint persisted, not merely held in the in-memory object.
    const reloadedState = loadState(statePath);
    const third = await once(statePath, reloadedState, key, () =>
      runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider),
    );
    expect(calls.length).toBe(1);
    expect(third).toEqual(first);
  });

  it("both arm slots persist under distinct checkpoint keys for the same pairing unit", async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), "paired-tracer-test-")), "state.json");
    const state = loadState(statePath);
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider, calls } = makeRecordingProvider(matchingResponse(ticket.resolution));

    const wKey = pairedUnitKey("W", UNIT_ID);
    const bKey = pairedUnitKey("B", UNIT_ID);
    expect(wKey).not.toBe(bKey);
    expect(PAIRED_ARM_SLOTS).toContain("W");
    expect(PAIRED_ARM_SLOTS).toContain("B");

    await once(statePath, state, wKey, () => runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider));
    await once(statePath, state, bKey, () => runArmOnPairingUnit(ticket, UNIT_ID, "B", AGENT_DEFINITION, provider));

    expect(Object.keys(state.units).sort()).toEqual([bKey, wKey].sort());
    expect(calls.length).toBe(2);
  });
});
