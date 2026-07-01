/**
 * Per-provider cost tracking (stage 4 of the Foundry rebuild).
 *
 * The mock path meters synthetic per-call tokens (orchestrator `charge()`);
 * foundry runs have REAL usage on every provider response. This module prices
 * that usage against a per-model table and enforces hard caps (N5/R3) at the
 * one place every foundry LLM call flows through (`FoundryModelLayer.ask`).
 *
 * Policy decisions, stated plainly:
 *  - **Unknown models price at $0 and are REPORTED** (`unpricedModels`), never
 *    guessed. Local models (Ollama/vLLM) are legitimately $0; a hosted model
 *    missing from the table shows up in the report instead of silently
 *    mis-pricing a run.
 *  - **Caps are checked after adding** a call's usage: the call that crosses
 *    the cap throws `CostCapExceededError`; everything already spent stays
 *    recorded so the audit trail survives the halt.
 */
import type { ChatUsage } from "./provider.js";

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
  /** USD per million cache-read input tokens (defaults to inputPerMTok/10). */
  cacheReadPerMTok?: number;
}

/** Model name → pricing. Local inference is $0 — simply omit the model. */
export type PricingTable = Record<string, ModelPricing>;

export function priceUsage(usage: ChatUsage, p: ModelPricing | undefined): number {
  if (!p) return 0;
  const cacheRate = p.cacheReadPerMTok ?? p.inputPerMTok / 10;
  // cacheReadInputTokens are billed at the cache rate; they are reported by the
  // API in addition to input_tokens (uncached prefix), so no subtraction here.
  return (
    (usage.inputTokens * p.inputPerMTok +
      usage.outputTokens * p.outputPerMTok +
      usage.cacheReadInputTokens * cacheRate) /
    1_000_000
  );
}

export class CostCapExceededError extends Error {
  constructor(
    message: string,
    readonly totals: CostTotals,
  ) {
    super(message);
    this.name = "CostCapExceededError";
  }
}

export interface CostTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  usd: number;
  /** Models seen but absent from the pricing table (priced $0, reported). */
  unpricedModels: string[];
}

export interface CostCaps {
  /** Hard cap on input+output tokens across the run (N5). */
  maxTokens?: number;
  /** Hard cap on priced spend across the run. */
  maxUsd?: number;
}

export class FoundryCostMeter {
  private t: CostTotals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    usd: 0,
    unpricedModels: [],
  };
  private perRole = new Map<string, { calls: number; tokens: number; usd: number }>();

  constructor(
    private pricing: PricingTable = {},
    private caps: CostCaps = {},
  ) {}

  /** Record one call's real usage. Throws when a cap is crossed (spend stays recorded). */
  add(role: string, model: string, usage: ChatUsage): void {
    const p = this.pricing[model];
    if (!p && !this.t.unpricedModels.includes(model)) this.t.unpricedModels.push(model);
    const usd = priceUsage(usage, p);

    this.t.calls++;
    this.t.inputTokens += usage.inputTokens;
    this.t.outputTokens += usage.outputTokens;
    this.t.cacheReadInputTokens += usage.cacheReadInputTokens;
    this.t.usd += usd;

    const r = this.perRole.get(role) ?? { calls: 0, tokens: 0, usd: 0 };
    r.calls++;
    r.tokens += usage.inputTokens + usage.outputTokens;
    r.usd += usd;
    this.perRole.set(role, r);

    const spentTokens = this.t.inputTokens + this.t.outputTokens;
    if (this.caps.maxTokens !== undefined && spentTokens > this.caps.maxTokens) {
      throw new CostCapExceededError(
        `token cap ${this.caps.maxTokens} exceeded (spent ${spentTokens})`,
        this.totals(),
      );
    }
    if (this.caps.maxUsd !== undefined && this.t.usd > this.caps.maxUsd) {
      throw new CostCapExceededError(
        `USD cap ${this.caps.maxUsd} exceeded (spent ${this.t.usd.toFixed(4)})`,
        this.totals(),
      );
    }
  }

  totals(): CostTotals {
    return { ...this.t, unpricedModels: [...this.t.unpricedModels] };
  }

  byRole(): Record<string, { calls: number; tokens: number; usd: number }> {
    return Object.fromEntries([...this.perRole.entries()].map(([k, v]) => [k, { ...v }]));
  }
}
