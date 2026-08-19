import { describe, it, expect } from "vitest";
import { generateCustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";
import {
  pairingUnitId,
  runArmOnPairingUnit,
  type PairedAgentDefinition,
} from "../experiments/paired-comparison-arm/_paired-arms.js";
import {
  PAIRED_MODEL,
  PAIRED_MODEL_DIGEST,
  PAIRED_MODEL_REV3,
  PAIRED_MODEL_DIGEST_REV3,
  PAIRED_SEEDS,
} from "../experiments/paired-comparison-arm/_paired-constants.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

// Plan 15-01, Task 1 (REQ-71). Proves the one architectural seam the whole
// phase depends on: an executor model can be selected per `runArmOnPairingUnit`
// call through an explicit option, and a caller that omits it still gets the
// rev-2 pinned model, byte-for-byte. Against a local stub `Provider` that
// records the model string it is handed — never `createProvider`, never a
// network call — so this suite runs offline in well under a second.
//
// Assertions below compare the recorded model against string LITERALS, not
// against the imported constants: asserting `received === PAIRED_MODEL`
// would stay green even if `PAIRED_MODEL`'s own value drifted, which is
// exactly the regression this seam test exists to catch.

const SEED = PAIRED_SEEDS[0]!; // 1301
const TASK_INDEX = 0;
const UNIT_ID = pairingUnitId(SEED, TASK_INDEX);
const AGENT_DEFINITION: PairedAgentDefinition = { id: "test-agent", systemPrompt: "You are a test agent." };

function makeRecordingProvider(): { provider: Provider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      return { text: "action: x\ncategory: y\nparameter: z", model: req.model, usage: { inputTokens: 5, outputTokens: 9, cacheReadInputTokens: 0 } };
    },
  };
  return { provider, calls };
}

describe("paired model seam — an explicit option selects the executor model (Plan 15-01, T-15-03)", () => {
  it("{ model: PAIRED_MODEL_REV3 } passes gpt-oss:latest to the provider", async () => {
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider, calls } = makeRecordingProvider();
    await runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider, { model: PAIRED_MODEL_REV3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("gpt-oss:latest");
  });

  it("no model field (options argument omitted) passes PAIRED_MODEL — rev-2 behaviour byte-for-byte", async () => {
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider, calls } = makeRecordingProvider();
    await runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("qwen3.6:latest");
  });

  it("{} behaves identically to the argument being omitted", async () => {
    const ticket = generateCustomerSupportTicket(SEED, TASK_INDEX);
    const { provider, calls } = makeRecordingProvider();
    await runArmOnPairingUnit(ticket, UNIT_ID, "W", AGENT_DEFINITION, provider, {});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("qwen3.6:latest");
  });

  it("PAIRED_MODEL and PAIRED_MODEL_DIGEST still hold their rev-2 values", () => {
    expect(PAIRED_MODEL).toBe("qwen3.6:latest");
    expect(PAIRED_MODEL_DIGEST).toBe("07d35212591f");
  });

  it("PAIRED_MODEL_REV3 is gpt-oss:latest and PAIRED_MODEL_DIGEST_REV3 is 17052f91a42e", () => {
    expect(PAIRED_MODEL_REV3).toBe("gpt-oss:latest");
    expect(PAIRED_MODEL_DIGEST_REV3).toBe("17052f91a42e");
  });
});
