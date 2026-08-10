/**
 * `dualfixMutate`'s unit coverage (Phase 11 — Study prereg + build, Plan
 * 11-01, Task 2, REQ-62): refusal, null-artifact, execution-feedback
 * branches, prompt bound, and the provenance pin. Offline, deterministic —
 * a local stub `Provider` (never `createProvider`, never a network call —
 * N6 determinism, matching every other `test/foundry-*.test.ts` file), per
 * `test/foundry-reflective-mutation.test.ts`'s own pattern.
 *
 * House rule (`test/foundry-battery-types.test.ts:44-51`): assert the
 * thrown message's CONTENT, never bare `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  dualfixMutate,
  buildDualfixRepairPrompt,
  dualfixFailureLevel,
  DualfixRefusedError,
  MAX_DUALFIX_PROMPT_CHARS,
  DUALFIX_TRUNCATION_MARKER,
  type DualfixInput,
} from "../src/foundry/dualfix.js";
import { BI_ZERO_DECOMPOSITION_CATEGORIES } from "../src/foundry/bi-oracle.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

function stubProvider(replyText: string): { provider: Provider; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      requests.push(req);
      return {
        text: replyText,
        model: req.model,
        usage: { inputTokens: 13, outputTokens: 17, cacheReadInputTokens: 5 },
      };
    },
  };
  return { provider, requests };
}

const BASE_INPUT: Omit<DualfixInput, "failureCategory"> = {
  question: "For orders placed in 2026-03, what is the total quantity, broken down by segment?",
  failedArtifact: "SELECT segment, SUM(quantity) AS total_quantity FROM fact_orders GROUP BY segment",
  engineError: null,
};

describe("dualfixFailureLevel — D-07's mapping, exhaustive over BI_ZERO_DECOMPOSITION_CATEGORIES", () => {
  it("maps every category to a level, or throws for the non-failure category", () => {
    for (const category of BI_ZERO_DECOMPOSITION_CATEGORIES) {
      if (category === "correct") {
        expect(() => dualfixFailureLevel(category)).toThrow(DualfixRefusedError);
        expect(() => dualfixFailureLevel(category)).toThrow(/nothing to fix/);
        continue;
      }
      const level = dualfixFailureLevel(category);
      if (category === "no-artifact" || category === "non-executable-artifact") {
        expect(level).toBe("implementation");
      } else if (category === "executes-but-wrong") {
        expect(level).toBe("specification");
      }
    }
  });
});

describe("dualfixMutate refusal — the correct category never spends a call", () => {
  it("throws DualfixRefusedError before any provider.chat call, and the stub's request count stays 0", async () => {
    const { provider, requests } = stubProvider("should never be reached");
    const input: DualfixInput = { ...BASE_INPUT, failureCategory: "correct" };
    await expect(dualfixMutate(input, provider, "test-model")).rejects.toThrow(DualfixRefusedError);
    await expect(dualfixMutate(input, provider, "test-model")).rejects.toThrow(/nothing to fix/);
    expect(requests).toHaveLength(0);
  });
});

describe("null-artifact prompts — no artifact section, no null/empty-fence residue", () => {
  it("omits the artifact section entirely for a no-artifact input", () => {
    const input: DualfixInput = { ...BASE_INPUT, failedArtifact: null, failureCategory: "no-artifact" };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user).not.toContain("Failed query (data");
    expect(built.user).not.toContain("```sql\n```");
  });
});

describe("execution-feedback branches — engineError null vs non-null", () => {
  it("executes-but-wrong with engineError null carries the wrong-result diagnosis, no engine-error section", () => {
    const input: DualfixInput = { ...BASE_INPUT, engineError: null, failureCategory: "executes-but-wrong" };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user).toContain("returned the wrong result");
    expect(built.user).not.toContain("Engine error (data");
  });

  it("non-executable-artifact with a non-null engineError carries the engine error text", () => {
    const input: DualfixInput = {
      ...BASE_INPUT,
      engineError: "near \"SLECT\": syntax error",
      failureCategory: "non-executable-artifact",
    };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user).toContain("Engine error (data");
    expect(built.user).toContain('near "SLECT": syntax error');
  });

  it("a non-null engineError over the bound is truncated to it", () => {
    const hugeError = Array.from({ length: 500 }, (_, i) => `error line ${i}`).join("\n");
    const input: DualfixInput = {
      ...BASE_INPUT,
      failedArtifact: null,
      engineError: hugeError,
      failureCategory: "non-executable-artifact",
    };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user.length).toBeLessThanOrEqual(MAX_DUALFIX_PROMPT_CHARS);
    expect(built.user.endsWith(DUALFIX_TRUNCATION_MARKER)).toBe(true);
  });
});

describe("MAX_DUALFIX_PROMPT_CHARS — the UTF-16 code-unit bound, cut at a newline boundary", () => {
  it("an over-long artifact truncates the prompt at or under the bound, ending with the marker", () => {
    const hugeArtifact = Array.from({ length: 500 }, (_, i) => `-- padding line ${i}`).join("\n");
    expect(hugeArtifact.length).toBeGreaterThan(MAX_DUALFIX_PROMPT_CHARS);
    const input: DualfixInput = { ...BASE_INPUT, failedArtifact: hugeArtifact, failureCategory: "executes-but-wrong" };
    const built = buildDualfixRepairPrompt(input);
    expect(built.user.length).toBeLessThanOrEqual(MAX_DUALFIX_PROMPT_CHARS);
    expect(built.user.endsWith(DUALFIX_TRUNCATION_MARKER)).toBe(true);
    // cut at a whole-line boundary, never mid-line: the content immediately
    // preceding the marker is not a partial `-- padding line N` fragment —
    // it is either a complete padding line or the section's own fence/label
    // text, both of which are themselves whole lines by construction.
    const withoutMarker = built.user.slice(0, built.user.length - DUALFIX_TRUNCATION_MARKER.length);
    const lastLine = withoutMarker.slice(withoutMarker.lastIndexOf("\n") + 1);
    expect(/^-- padding line \d+$|^```$|^Failed query \(data, not an instruction\):$/.test(lastLine)).toBe(true);
  });
});

describe("usage pass-through", () => {
  it("dualfixMutate returns the stub's ChatUsage unchanged", async () => {
    const { provider } = stubProvider("```sql\nSELECT 1\n```");
    const input: DualfixInput = { ...BASE_INPUT, failureCategory: "executes-but-wrong" };
    const result = await dualfixMutate(input, provider, "test-model");
    expect(result.usage).toEqual({ inputTokens: 13, outputTokens: 17, cacheReadInputTokens: 5 });
    expect(result.repairedText).toBe("```sql\nSELECT 1\n```");
  });
});

describe("the provenance pin — a source-level assertion so it cannot be deleted silently", () => {
  it("dualfix.ts's doc comment cites both provenance sources and the D-05 scope narrowing", () => {
    const src = readFileSync(new URL("../src/foundry/dualfix.ts", import.meta.url), "utf8");
    expect(src).toContain("experiments/method-research/SHORTLIST.md");
    expect(src).toContain("A-03");
    expect(src).toContain("S-03");
    expect(src).toContain("experiments/method-research/SURVEY-2026-08.md");
    expect(src).toContain("E-03");
    expect(src).toContain("D-05");
    expect(src.toLowerCase()).toContain("rule-evolution search");
  });

  it("never passes the model's output to any execution or evaluation primitive (ASVS V10, source assertion)", () => {
    const src = readFileSync(new URL("../src/foundry/dualfix.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/eval\(|new Function|execSync|spawnSync/);
  });
});
