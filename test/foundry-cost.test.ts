/**
 * Stage-4 earn instrument (Foundry rebuild): real provider usage is priced
 * per model, aggregated per role, hard-capped (tokens and USD), unknown
 * models are reported rather than silently mis-priced, and the cap composes
 * with the model layer + spawn containment.
 * See experiments/foundry-progression/stage-4.md.
 */
import { describe, it, expect } from "vitest";
import {
  FoundryCostMeter,
  CostCapExceededError,
  priceUsage,
  type PricingTable,
} from "../src/foundry/cost.js";
import { FoundryModelLayer } from "../src/foundry/model-layer.js";
import { spawnSpecimens } from "../src/foundry/spawn.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { SliceManifest } from "../src/types.js";

const usage = (i: number, o: number, c = 0) => ({
  inputTokens: i,
  outputTokens: o,
  cacheReadInputTokens: c,
});

const PRICING: PricingTable = {
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3 },
  "gpt-x": { inputPerMTok: 2, outputPerMTok: 8 },
};

describe("priceUsage (stage 4)", () => {
  it("prices input/output/cache-read at their distinct rates", () => {
    // 1M in = $3, 1M out = $15, 1M cache-read = $0.30
    expect(priceUsage(usage(1_000_000, 0), PRICING["claude-sonnet-5"])).toBeCloseTo(3);
    expect(priceUsage(usage(0, 1_000_000), PRICING["claude-sonnet-5"])).toBeCloseTo(15);
    expect(priceUsage(usage(0, 0, 1_000_000), PRICING["claude-sonnet-5"])).toBeCloseTo(0.3);
  });
  it("defaults cache-read to input/10 when unstated", () => {
    expect(priceUsage(usage(0, 0, 1_000_000), PRICING["gpt-x"])).toBeCloseTo(0.2);
  });
  it("prices unknown models at zero", () => {
    expect(priceUsage(usage(1_000_000, 1_000_000), undefined)).toBe(0);
  });
});

describe("FoundryCostMeter (stage 4)", () => {
  it("accumulates totals and per-role breakdowns", () => {
    const m = new FoundryCostMeter(PRICING);
    m.add("specimen", "claude-sonnet-5", usage(100_000, 50_000, 200_000));
    m.add("specimen", "claude-sonnet-5", usage(100_000, 50_000));
    m.add("judge", "gpt-x", usage(10_000, 1_000));
    const t = m.totals();
    expect(t.calls).toBe(3);
    expect(t.inputTokens).toBe(210_000);
    expect(t.outputTokens).toBe(101_000);
    expect(t.cacheReadInputTokens).toBe(200_000);
    // 200k*3 + 100k*15 + 200k*0.3 + 10k*2 + 1k*8 (per MTok)
    expect(t.usd).toBeCloseTo((200_000 * 3 + 100_000 * 15 + 200_000 * 0.3 + 10_000 * 2 + 1_000 * 8) / 1e6);
    expect(t.unpricedModels).toEqual([]);
    const roles = m.byRole();
    expect(roles.specimen!.calls).toBe(2);
    expect(roles.judge!.tokens).toBe(11_000);
  });

  it("reports unknown models instead of silently mis-pricing", () => {
    const m = new FoundryCostMeter(PRICING);
    m.add("specimen", "granite4.1:30b", usage(5_000, 2_000));
    const t = m.totals();
    expect(t.usd).toBe(0);
    expect(t.unpricedModels).toEqual(["granite4.1:30b"]);
  });

  it("throws on the call that crosses the token cap; spend stays recorded", () => {
    const m = new FoundryCostMeter({}, { maxTokens: 1_000 });
    m.add("a", "m", usage(400, 300)); // 700 — fine
    expect(() => m.add("a", "m", usage(400, 0))).toThrow(CostCapExceededError);
    expect(m.totals().inputTokens + m.totals().outputTokens).toBe(1_100); // recorded
  });

  it("throws on the call that crosses the USD cap", () => {
    const m = new FoundryCostMeter(PRICING, { maxUsd: 0.01 });
    m.add("judge", "gpt-x", usage(1_000, 100)); // $0.0028
    let err: unknown;
    try {
      m.add("judge", "gpt-x", usage(5_000_000, 0)); // +$10
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CostCapExceededError);
    expect((err as CostCapExceededError).totals.usd).toBeGreaterThan(0.01);
  });
});

describe("cap composition with the model layer and spawn containment (stage 4)", () => {
  const chattyProvider: Provider = {
    kind: "openai",
    baseUrl: "scripted://",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      return {
        text: "```js\nexport const x = 1;\n```",
        model: req.model,
        usage: usage(600, 200),
      };
    },
  };
  const manifest: SliceManifest = {
    id: "slice-cost",
    name: "cost",
    contract: "export const x: number",
    donePredicates: [{ id: "p", expr: "x === 1", kind: "test" }],
    traceTier: "minimal",
    complexity: 1,
    dependsOn: [],
    judge: { votesPerPair: 1 },
    summary: "stage-4 cap composition",
  };

  it("a cap breach inside a specimen call is contained by the spawn layer", async () => {
    const meter = new FoundryCostMeter({}, { maxTokens: 1_000 });
    const role = { provider: chattyProvider, model: "m" };
    const layer = new FoundryModelLayer({
      roles: { testAuthor: role, strategist: role, specimen: role, judge: role, documenter: role, planner: role },
      meter,
    });
    // Each call spends 800 tokens; cap 1000 ⇒ first specimen ok, second breaches.
    const r = await spawnSpecimens(layer.specimen, manifest, ["s1", "s2"], null, { concurrency: 1 });
    expect(r.outputs).toHaveLength(1);
    expect(r.killed).toHaveLength(1);
    expect(r.killed[0]!.reason).toBe("error");
    expect(r.killed[0]!.detail).toContain("token cap 1000 exceeded");
    // The meter's record survives the kill (audit trail intact).
    expect(meter.totals().calls).toBe(2);
  });
});
