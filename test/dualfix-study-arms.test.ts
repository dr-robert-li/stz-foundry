/**
 * The DUALFIX-vs-naive-retry two-arm repair/score core (Phase 11 — Study
 * prereg + build, Plan 11-01, REQ-62) — the tracer's end-to-end proof, fully
 * offline. One failing L3 candidate, built through the receipt-free route,
 * repaired through BOTH arms against a local recording stub `Provider`
 * (never `createProvider`, never a network call — N6 determinism, matching
 * `test/foundry-reflective-mutation.test.ts`'s own pattern).
 *
 * State lives under a fresh `mkdtempSync` directory for every test — no
 * state, log, or corpus file is ever written under `experiments/dualfix-study/`
 * by this suite (RESEARCH Pitfall 3).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBiWarehouse, buildBiQuerySpecs, buildBiTasks, composeReferenceSql } from "../src/foundry/bi-warehouse.js";
import { materializeWarehouse, executeSelect } from "../src/foundry/bi-oracle.js";
import {
  dualfixMutate,
  buildDualfixRepairPrompt,
  dualfixFailureLevel,
  DualfixRefusedError,
  MAX_DUALFIX_PROMPT_CHARS,
  DUALFIX_TRUNCATION_MARKER,
  type DualfixInput,
} from "../src/foundry/dualfix.js";
import {
  DUALFIX_STUDY_SEEDS,
  DUALFIX_LEVEL_ID,
  buildNaiveRetryPrompt,
  runArmOnCandidate,
  dualfixUnitKey,
  loadState,
  once,
  type DualfixCorpusEntry,
} from "../experiments/dualfix-study/_dualfix-arms.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

function fence(info: string, body: string): string {
  return "```" + info + "\n" + body + "\n```";
}

/** A recording stub `Provider` that always returns `replyText` — captures
 *  every request it receives, verbatim, for the symmetry/count assertions
 *  below. */
function makeRecordingProvider(replyText: string): { provider: Provider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      return { text: replyText, model: req.model, usage: { inputTokens: 7, outputTokens: 11, cacheReadInputTokens: 0 } };
    },
  };
  return { provider, calls };
}

// ── one real failing L3 candidate, built through the receipt-free route ────

const SEED = DUALFIX_STUDY_SEEDS[0]!;
const warehouse = generateBiWarehouse(SEED);
const specs = buildBiQuerySpecs(warehouse, DUALFIX_LEVEL_ID);
const spec = specs[0]!;
const tasks = buildBiTasks(warehouse, DUALFIX_LEVEL_ID);
const task = tasks[0]!;
const correctSql = composeReferenceSql(spec);
// Deliberately wrong-but-executable: every aggregate value is shifted by a
// constant no real total in this warehouse's row-scale range can reach, so
// the overlap with the expected multiset is guaranteed zero (gradedScore
// exactly 0, never a partial-overlap "executes-but-wrong" with score > 0).
const wrongSql = correctSql.replace("SUM(fo.quantity) AS total_quantity", "SUM(fo.quantity) + 1000000 AS total_quantity");
if (wrongSql === correctSql) {
  throw new Error("test setup: composeReferenceSql's output shape changed — the wrongSql substitution no-op'd");
}

const executesButWrongEntry: DualfixCorpusEntry = {
  seed: SEED,
  levelId: DUALFIX_LEVEL_ID,
  taskIndex: 0,
  taskId: task.id,
  question: task.prompt,
  rawText: fence("sql", wrongSql),
  artifact: wrongSql,
  category: "executes-but-wrong",
  gradedScore: 0,
  engineError: null,
};

const noArtifactEntry: DualfixCorpusEntry = {
  seed: SEED,
  levelId: DUALFIX_LEVEL_ID,
  taskIndex: 0,
  taskId: task.id,
  question: task.prompt,
  rawText: "I don't know the answer.",
  artifact: null,
  category: "no-artifact",
  gradedScore: 0,
  engineError: null,
};

describe("dualfixMutate refusal — the correct category never spends a call", () => {
  it("throws DualfixRefusedError and the stub provider's call count stays 0", async () => {
    const { provider, calls } = makeRecordingProvider(fence("sql", correctSql));
    const input: DualfixInput = { question: task.prompt, failedArtifact: null, failureCategory: "correct", engineError: null };
    await expect(dualfixMutate(input, provider, "test-model")).rejects.toThrow(DualfixRefusedError);
    expect(calls.length).toBe(0);
  });
});

describe("null-artifact prompts — no artifact section in either arm", () => {
  it("neither arm's prompt contains a fenced SQL echo or a literal null", () => {
    const input: DualfixInput = {
      question: task.prompt,
      failedArtifact: null,
      failureCategory: "no-artifact",
      engineError: null,
    };
    const dualfixPrompt = buildDualfixRepairPrompt(input);
    const naivePrompt = buildNaiveRetryPrompt(input);
    for (const built of [dualfixPrompt, naivePrompt]) {
      // no labeled artifact section at all — the load-bearing assertion:
      // failedArtifact === null must omit the section entirely, never
      // render a "null"/empty-fence placeholder in its place.
      expect(built.user).not.toContain("Failed query (data");
      expect(built.user).not.toContain("Previous query (data");
      expect(built.user).not.toContain("```sql\n```");
    }
  });
});

describe("MAX_DUALFIX_PROMPT_CHARS — the UTF-16 code-unit bound", () => {
  it("is 4000, and an over-long artifact truncates at or under the bound, ending with the marker", () => {
    expect(MAX_DUALFIX_PROMPT_CHARS).toBe(4000);
    const hugeArtifact = Array.from({ length: 500 }, (_, i) => `-- padding line ${i}`).join("\n");
    expect(hugeArtifact.length).toBeGreaterThan(MAX_DUALFIX_PROMPT_CHARS);
    const input: DualfixInput = {
      question: task.prompt,
      failedArtifact: hugeArtifact,
      failureCategory: "executes-but-wrong",
      engineError: null,
    };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user.length).toBeLessThanOrEqual(MAX_DUALFIX_PROMPT_CHARS);
    expect(built.user.endsWith(DUALFIX_TRUNCATION_MARKER)).toBe(true);
  });
});

describe("one failing L3 candidate, both arms, end to end", () => {
  it("a stub returning the reference SQL drives both arms to gradedScore 1 / repaired true", async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), "dualfix-arms-test-")), "state.json");
    const state = loadState(statePath);
    const { provider } = makeRecordingProvider(fence("sql", correctSql));

    const dualfixResult = await once(statePath, state, dualfixUnitKey("dualfix", executesButWrongEntry.taskId), () =>
      runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model"),
    );
    const naiveResult = await once(statePath, state, dualfixUnitKey("naive-retry", executesButWrongEntry.taskId), () =>
      runArmOnCandidate("naive-retry", executesButWrongEntry, provider, "test-model"),
    );

    for (const result of [dualfixResult, naiveResult]) {
      expect(result.category).toBe("correct");
      expect(result.gradedScore).toBe(1);
      expect(result.repaired).toBe(true);
      expect(result.status).toBe("ok");
    }
  });

  it("a stub returning unparseable prose drives both arms to no-artifact / repaired false", async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), "dualfix-arms-test-")), "state.json");
    const state = loadState(statePath);
    const { provider } = makeRecordingProvider("I cannot determine the correct query.");

    const dualfixResult = await runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model");
    const naiveResult = await runArmOnCandidate("naive-retry", executesButWrongEntry, provider, "test-model");

    for (const result of [dualfixResult, naiveResult]) {
      expect(result.category).toBe("no-artifact");
      expect(result.gradedScore).toBe(0);
      expect(result.repaired).toBe(false);
    }
  });

  it("running both arms on ONE candidate leaves exactly two checkpoint entries under distinct keys", async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), "dualfix-arms-test-")), "state.json");
    const state = loadState(statePath);
    const { provider, calls } = makeRecordingProvider(fence("sql", correctSql));

    const dualfixKey = dualfixUnitKey("dualfix", executesButWrongEntry.taskId);
    const naiveKey = dualfixUnitKey("naive-retry", executesButWrongEntry.taskId);
    expect(dualfixKey).not.toBe(naiveKey);

    await once(statePath, state, dualfixKey, () => runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model"));
    await once(statePath, state, naiveKey, () => runArmOnCandidate("naive-retry", executesButWrongEntry, provider, "test-model"));

    expect(Object.keys(state.units).sort()).toEqual([dualfixKey, naiveKey].sort());
    expect(calls.length).toBe(2);

    // a second once() call for either key returns the cached result and does
    // NOT call the provider again
    const cached = await once(statePath, state, dualfixKey, () =>
      runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model"),
    );
    expect(calls.length).toBe(2);
    expect(cached).toEqual(state.units[dualfixKey]);
  });

  it("both arms issue exactly one provider.chat call, same model, temperature/maxTokens absent on both", async () => {
    const { provider, calls } = makeRecordingProvider(fence("sql", correctSql));
    await runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model");
    await runArmOnCandidate("naive-retry", executesButWrongEntry, provider, "test-model");

    expect(calls.length).toBe(2);
    for (const call of calls) {
      expect(call.model).toBe("test-model");
      expect(call.temperature).toBeUndefined();
      expect(call.maxTokens).toBeUndefined();
    }
  });

  it("the DUALFIX prompt names the specification-level failure class and carries execution feedback; the naive-retry prompt carries neither", async () => {
    const { provider, calls } = makeRecordingProvider(fence("sql", correctSql));
    await runArmOnCandidate("dualfix", executesButWrongEntry, provider, "test-model");
    await runArmOnCandidate("naive-retry", executesButWrongEntry, provider, "test-model");

    const [dualfixCall, naiveCall] = calls;
    expect(dualfixCall!.messages[0]!.content).toContain(dualfixFailureLevel("executes-but-wrong"));
    expect(dualfixCall!.messages[0]!.content).toContain("returned the wrong result");
    expect(naiveCall!.messages[0]!.content).not.toContain(dualfixFailureLevel("executes-but-wrong"));
    // both echo the failed artifact (D-01)
    expect(dualfixCall!.messages[0]!.content).toContain("total_quantity");
    expect(naiveCall!.messages[0]!.content).toContain("total_quantity");
  });
});
