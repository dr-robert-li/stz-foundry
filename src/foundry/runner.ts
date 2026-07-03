/**
 * Standalone foundry runner (stage 5 of the Foundry rebuild): the CLI-ownable
 * spawn-and-collect loop. `stz foundry run` takes a slice manifest + a
 * foundry config and drives the full adversarial tournament through the
 * provider seam — no agent host, no vendor CLI, local-first.
 *
 * Config (`foundry.json`, usually at .stz/00-intent/foundry.json):
 *   {
 *     "providers": { "<name>": { "kind": "openai"|"anthropic", "baseUrl": "...",
 *                                "apiKeyEnv": "ENV_VAR_NAME" } },
 *     "roles": { "default": { "provider": "<name>", "model": "..." },
 *                "judge":   { "provider": "...", "model": "...", "maxTokens": 2048 } },
 *     "pricing": { "<model>": { "inputPerMTok": 3, "outputPerMTok": 15 } },
 *     "caps": { "maxTokens": 500000, "maxUsd": 5 },
 *     "n": 2, "votesPerPair": 1,
 *     "specimenConcurrency": 2, "specimenTimeoutMs": 600000
 *   }
 *
 * API keys are named by ENV VAR (`apiKeyEnv`), never stored in the config —
 * the config lives in the repo's .stz/ tree and must stay secret-free (N-sec).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { SliceManifest, RetryPolicy } from "../types.js";
import { createProvider, type Provider, type ProviderKind } from "./provider.js";
import { FoundryModelLayer, type FoundryRoles, type RoleModel } from "./model-layer.js";
import { FoundryCostMeter, type CostCaps, type PricingTable } from "./cost.js";
import { runSlice, type SliceResult } from "../mock/orchestrator.js";
import { lastIsolation } from "../sandbox.js";
import { auditRoleTiers, withTierPricing, tierOf } from "../tiers.js";

export interface FoundryProviderSpec {
  kind: ProviderKind;
  baseUrl: string;
  /** Name of the env var holding the key. Never the key itself. */
  apiKeyEnv?: string;
  headers?: Record<string, string>;
}

export interface FoundryRoleSpec {
  provider: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface FoundryConfig {
  providers: Record<string, FoundryProviderSpec>;
  roles: { default: FoundryRoleSpec } & Partial<
    Record<"testAuthor" | "strategist" | "specimen" | "judge" | "documenter" | "planner", FoundryRoleSpec>
  >;
  pricing?: PricingTable;
  caps?: CostCaps;
  n?: number;
  votesPerPair?: number;
  specimenConcurrency?: number;
  specimenTimeoutMs?: number;
  /** No-passers escalation bounds (0 = halt, n = bounded, -1 = unbounded). */
  retryPolicy?: RetryPolicy;
  /** Run-level wall-clock cap (ms) across all rounds. 0/undefined = unbounded. */
  runWallClockMs?: number;
  /**
   * Test-author preflight (#5): before the real slice, prove the configured
   * test-author model can author a valid sealed harness for a trivial canary.
   * Test-author strength is the binding constraint for local-model runs; this
   * fails fast with actionable guidance instead of burning the slice's whole
   * escalation budget on a too-weak instrument. Default true; set false to skip.
   */
  preflight?: boolean;
}

const ROLE_NAMES = ["testAuthor", "strategist", "specimen", "judge", "documenter", "planner"] as const;

/** Raised when the test-author preflight (#5) fails — actionable, not a crash. */
export class FoundryPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundryPreflightError";
  }
}

/** The trivial canary: any competent test-author authors a valid harness for it. */
const PREFLIGHT_CANARY: SliceManifest = {
  id: "preflight-canary",
  name: "preflight-canary",
  contract: "export function inc(n) — return n + 1 for any integer n.",
  donePredicates: [{ id: "p1", expr: "inc(1) === 2", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "preflight canary: prove the test-author role can author a sealed harness",
};

/**
 * Test-author preflight (#5). Runs the FULL test-authoring gate (self-check +
 * reference export + reference smoke) against a trivial canary. If the model
 * cannot clear it, the real slice never had a chance — the sealed suite is the
 * selection signal, and a defective author zeroes every specimen. Throws
 * `FoundryPreflightError` with the fix (promote a stronger test-author model).
 */
export async function preflightTestAuthor(
  layer: FoundryModelLayer,
  log?: (msg: string) => void,
): Promise<void> {
  log?.("[preflight] validating test-author model on canary contract…");
  try {
    await layer.testAuthor.authorTests(PREFLIGHT_CANARY);
    log?.("[preflight] test-author OK");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new FoundryPreflightError(
      "test-author preflight failed: the configured test-author model could not produce a valid sealed " +
        "harness for a TRIVIAL canary contract (inc(n) = n+1). Test-author strength is the binding constraint " +
        "for local-model runs — promote a stronger model to the `testAuthor` role in foundry.json before the " +
        `real slice, or set preflight:false to skip this check. Underlying failure: ${detail}`,
    );
  } finally {
    layer.nextRound(); // reset the specimen ordinal the canary may have touched
  }
}

/** Parse + validate a foundry config. Throws with a precise message on defects. */
export function loadFoundryConfig(path: string, env: NodeJS.ProcessEnv = process.env): {
  config: FoundryConfig;
  providers: Record<string, Provider>;
} {
  const raw = JSON.parse(readFileSync(path, "utf8")) as FoundryConfig;
  if (!raw.providers || Object.keys(raw.providers).length === 0)
    throw new Error(`foundry config ${path}: "providers" is required and must not be empty`);
  if (!raw.roles?.default)
    throw new Error(`foundry config ${path}: "roles.default" is required`);

  const providers: Record<string, Provider> = {};
  for (const [name, spec] of Object.entries(raw.providers)) {
    if (spec.kind !== "openai" && spec.kind !== "anthropic")
      throw new Error(`foundry config ${path}: provider "${name}" has unknown kind "${(spec as { kind: string }).kind}"`);
    if (!spec.baseUrl) throw new Error(`foundry config ${path}: provider "${name}" needs baseUrl`);
    if ((spec as unknown as Record<string, unknown>).apiKey !== undefined)
      throw new Error(
        `foundry config ${path}: provider "${name}" embeds an apiKey — use apiKeyEnv (configs must stay secret-free)`,
      );
    const apiKey = spec.apiKeyEnv ? env[spec.apiKeyEnv] : undefined;
    if (spec.apiKeyEnv && !apiKey)
      throw new Error(`foundry config ${path}: provider "${name}" wants env ${spec.apiKeyEnv}, which is unset`);
    providers[name] = createProvider({ kind: spec.kind, baseUrl: spec.baseUrl, apiKey, headers: spec.headers });
  }

  const resolveRole = (spec: FoundryRoleSpec, label: string): void => {
    if (!providers[spec.provider])
      throw new Error(`foundry config ${path}: role "${label}" references unknown provider "${spec.provider}"`);
    if (!spec.model) throw new Error(`foundry config ${path}: role "${label}" needs a model`);
  };
  resolveRole(raw.roles.default, "default");
  for (const r of ROLE_NAMES) if (raw.roles[r]) resolveRole(raw.roles[r]!, r);

  return { config: raw, providers };
}

/** Resolve each foundry role to its concrete model string (default + overrides). */
export function resolveRoleModels(config: FoundryConfig): Record<string, string> {
  const d = config.roles.default.model;
  const out: Record<string, string> = {};
  for (const r of ROLE_NAMES) out[r] = config.roles[r]?.model ?? d;
  return out;
}

/** Materialize the per-role model map from config (default + overrides). */
export function buildRoles(
  config: FoundryConfig,
  providers: Record<string, Provider>,
): FoundryRoles {
  const toRole = (s: FoundryRoleSpec): RoleModel => ({
    provider: providers[s.provider]!,
    model: s.model,
    maxTokens: s.maxTokens,
    temperature: s.temperature,
  });
  const d = toRole(config.roles.default);
  return {
    testAuthor: config.roles.testAuthor ? toRole(config.roles.testAuthor) : d,
    strategist: config.roles.strategist ? toRole(config.roles.strategist) : d,
    specimen: config.roles.specimen ? toRole(config.roles.specimen) : d,
    judge: config.roles.judge ? toRole(config.roles.judge) : d,
    documenter: config.roles.documenter ? toRole(config.roles.documenter) : d,
    planner: config.roles.planner ? toRole(config.roles.planner) : d,
  };
}

export interface FoundryRunResult {
  result: SliceResult;
  cost: ReturnType<FoundryCostMeter["totals"]>;
  costByRole: ReturnType<FoundryCostMeter["byRole"]>;
}

export interface FoundryRunOptions {
  root: string;
  configPath: string;
  manifest: SliceManifest;
  log?: (msg: string) => void;
  env?: NodeJS.ProcessEnv;
}

/** The standalone spawn-and-collect loop: config → layer → tournament → cost report. */
export async function runFoundry(opts: FoundryRunOptions): Promise<FoundryRunResult> {
  const { config, providers } = loadFoundryConfig(opts.configPath, opts.env ?? process.env);

  // #2 model tiers: resolve each role's model, fill tier-default pricing so a
  // premium (Mythos-class: Fable/Mythos) model shows real spend not a silent $0, and
  // surface any misallocation (premium on a high-volume role, or a cheap
  // test-author/judge — the binding constraint) before the run bills for it.
  const roleModels = resolveRoleModels(config);
  const tierWarnings = auditRoleTiers(roleModels);
  for (const w of tierWarnings) opts.log?.(`[tiers] ${w.severity.toUpperCase()}: ${w.message}`);
  const pricing = withTierPricing(config.pricing ?? {}, Object.values(roleModels));

  const meter = new FoundryCostMeter(pricing, config.caps ?? {});
  const layer = new FoundryModelLayer({
    roles: buildRoles(config, providers),
    donePredicates: opts.manifest.donePredicates,
    complexity: opts.manifest.complexity,
    meter,
  });

  // #5: prove the test-author model is strong enough BEFORE the real slice.
  if (config.preflight !== false) await preflightTestAuthor(layer, opts.log);

  const manifest: SliceManifest = config.votesPerPair
    ? { ...opts.manifest, judge: { votesPerPair: config.votesPerPair } }
    : opts.manifest;

  const result = await runSlice({
    root: opts.root,
    manifest,
    model: layer,
    n: config.n ?? 4,
    specimenConcurrency: config.specimenConcurrency,
    specimenTimeoutMs: config.specimenTimeoutMs,
    retryPolicy: config.retryPolicy,
    runWallClockMs: config.runWallClockMs,
    log: opts.log,
  });

  // Real-usage cost report beside the synthetic ledger (90-audit/foundry-cost.md).
  const totals = meter.totals();
  const byRole = meter.byRole();
  const report = [
    `# Foundry cost — ${manifest.id}`,
    "",
    `- **calls:** ${totals.calls}`,
    `- **input tokens:** ${totals.inputTokens}`,
    `- **output tokens:** ${totals.outputTokens}`,
    `- **cache-read tokens:** ${totals.cacheReadInputTokens}`,
    `- **priced spend:** $${totals.usd.toFixed(4)}`,
    `- **eval sandbox isolation:** ${lastIsolation()}` +
      (lastIsolation() === "node-permission" ? " (DEGRADED — no network isolation on this host)" : "") +
      (lastIsolation() === "none" ? " (DISABLED — STZ_SANDBOX=none)" : ""),
    totals.unpricedModels.length
      ? `- **unpriced models ($0 assumed):** ${totals.unpricedModels.join(", ")}`
      : `- **unpriced models:** none`,
    "",
    "## Model tiers",
    ...Object.entries(roleModels).map(([role, model]) => `- **${role}:** \`${model}\` (${tierOf(model)})`),
    tierWarnings.length
      ? "\n" + tierWarnings.map((w) => `- ⚠️ ${w.severity}: ${w.message}`).join("\n")
      : "\n- allocation matches the field-earned recommendation (premium on testAuthor/judge, cheap elsewhere).",
    "",
    "## By role",
    ...Object.entries(byRole).map(
      ([role, v]) => `- **${role}:** ${v.calls} call(s), ${v.tokens} tokens, $${v.usd.toFixed(4)}`,
    ),
    "",
    "## retryPolicy telemetry",
    `- **rounds run:** ${result.retryTelemetry.roundsRun}`,
    `- **escalations:** ${result.retryTelemetry.escalations.join(", ") || "none"}`,
    `- **outcome:** ${result.retryTelemetry.outcome}` +
      (result.retryTelemetry.recoveredAfterEscalation ? " (extra rounds recovered a winner)" : ""),
    `- **tokens round 1:** ${result.retryTelemetry.tokensRound1}`,
    `- **tokens after round 1 (retry cost):** ${result.retryTelemetry.tokensAfterRound1}`,
    "",
  ].join("\n");
  const reportPath = join(opts.root, ".stz", "90-audit", "foundry-cost.md");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");

  return { result, cost: totals, costByRole: byRole };
}

/** Template config written by `stz foundry init` (local-first, secret-free). */
export const FOUNDRY_CONFIG_TEMPLATE: FoundryConfig = {
  providers: {
    local: { kind: "openai", baseUrl: "http://localhost:11434/v1" },
    // hosted example (uncomment + set the env var):
    // anthropic: { kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKeyEnv: "ANTHROPIC_API_KEY" },
  } as FoundryConfig["providers"],
  roles: { default: { provider: "local", model: "granite4.1:30b" } },
  pricing: {},
  caps: { maxTokens: 500_000 },
  n: 2,
  votesPerPair: 1,
  specimenTimeoutMs: 600_000,
};
