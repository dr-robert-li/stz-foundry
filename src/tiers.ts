/**
 * Model capability/cost tiers (cycle item 2).
 *
 * A Mythos-class model — the Fable and Mythos families, two distinct families
 * that share the same underlying model and both sit above Opus in capability and
 * price — runs today: role models are free-form strings and the cost meter
 * prices anything in its table. What was missing is TIER AWARENESS: the harness
 * had no notion that some roles pay for the premium tier and most do not, and no
 * budgeter to say so.
 *
 * The field finding this encodes (stage-5 live earn, PAPER.md Part II): for a
 * tournament, **test-author strength is the binding constraint** — the sealed
 * suite is the selection signal, so a strong (expensive) model on the frozen
 * test-author and judge roles pays off, while specimens can be small and cheap
 * (small models won tournaments when the test author was strong). Spending the
 * premium tier on the high-VOLUME specimen role is the wasteful inverse.
 *
 * This module is pure classification + advice. It never blocks a run (the user's
 * money, the user's call); it prices the premium tier so its spend is visible
 * rather than silently $0, and it surfaces misallocation so an operator can fix
 * it before, not after, the bill.
 */
import type { PricingTable, ModelPricing } from "./foundry/cost.js";

export type Tier = "fable" | "mythos" | "opus" | "sonnet" | "haiku" | "local" | "unknown";

/**
 * Higher rank = more capable + more expensive. `fable` and `mythos` are TWO
 * distinct Mythos-class families that share the same underlying model (Fable is
 * the generally-available variant with dual-use safety measures; Mythos is the
 * approved-org variant without them), so they sit at the same top rank above
 * Opus — different families, equal capability/cost.
 */
export const TIER_RANK: Record<Tier, number> = {
  fable: 5,
  mythos: 5,
  opus: 4,
  sonnet: 3,
  haiku: 2,
  local: 1,
  unknown: 0,
};

/** Tiers whose per-call cost makes them "premium" — reserve for roles that pay off. */
export const PREMIUM_TIERS: readonly Tier[] = ["fable", "mythos", "opus"];
export const isPremium = (t: Tier): boolean => PREMIUM_TIERS.includes(t);

/**
 * Classify a model string into a tier. Matches Claude families (aliases and full
 * ids: `fable`/`claude-fable-5` and `mythos`/`claude-mythos-5` as the two
 * top-tier families, then `opus`, `sonnet`, `haiku`), recognises common
 * local/OSS families as `local` ($0), and leaves anything else `unknown` (priced
 * $0 and reported, never guessed — same policy as the cost meter).
 */
export function tierOf(model: string): Tier {
  const m = model.toLowerCase();
  if (/\bfable\b|claude-fable/.test(m)) return "fable";
  if (/\bmythos\b|claude-mythos/.test(m)) return "mythos";
  if (/\bopus\b/.test(m)) return "opus";
  if (/\bsonnet\b/.test(m)) return "sonnet";
  if (/\bhaiku\b/.test(m)) return "haiku";
  // Ollama tags carry a ":version" suffix; these OSS families are local-served.
  // Leading boundary only — "llama3.3", "granite4.1" carry a version suffix with
  // no word break before the digits.
  if (/:/.test(m) || /\b(granite|llama|qwen|mistral|mixtral|gemma|phi|deepseek|gpt-oss|codestral|starcoder)/.test(m))
    return "local";
  return "unknown";
}

/**
 * Default per-MTok pricing by tier, applied ONLY to a model the operator did not
 * price themselves — so a premium hosted model shows real spend instead of a
 * silent $0. These are BALLPARK estimates to make the premium tier visible;
 * override with exact numbers in `foundry.json` `pricing`. Local/unknown stay $0
 * (unpriced + reported), unchanged from before.
 */
export const DEFAULT_TIER_PRICING: Record<Tier, ModelPricing | undefined> = {
  // Fable + Mythos share the underlying model → same cost basis (above Opus).
  fable: { inputPerMTok: 20, outputPerMTok: 100 }, // estimate, override
  mythos: { inputPerMTok: 20, outputPerMTok: 100 }, // estimate, override
  opus: { inputPerMTok: 15, outputPerMTok: 75 },
  sonnet: { inputPerMTok: 3, outputPerMTok: 15 },
  haiku: { inputPerMTok: 0.8, outputPerMTok: 4 },
  local: undefined, // $0
  unknown: undefined, // $0 + reported
};

/** Roles where model strength pays off — reserve the premium tier here. */
export const HIGH_VALUE_ROLES = ["testAuthor", "judge"] as const;
/** High-volume roles where premium spend is usually wasteful. */
export const HIGH_VOLUME_ROLES = ["specimen", "strategist", "documenter", "planner"] as const;

export interface TierWarning {
  role: string;
  model: string;
  tier: Tier;
  severity: "warn" | "info";
  message: string;
}

/**
 * Fill a pricing table with tier defaults for any hosted model the operator left
 * unpriced. Returns a NEW table; the operator's explicit entries always win.
 * A model already priced, or one that classifies local/unknown (no default), is
 * left as-is so genuinely-free local runs stay $0.
 */
export function withTierPricing(userTable: PricingTable, models: string[]): PricingTable {
  const out: PricingTable = { ...userTable };
  for (const model of models) {
    if (out[model]) continue;
    const dflt = DEFAULT_TIER_PRICING[tierOf(model)];
    if (dflt) out[model] = dflt;
  }
  return out;
}

/**
 * Audit a role→model assignment against the tier heuristic. Returns advisory
 * warnings, most-severe first; an empty array means the allocation matches the
 * field-earned recommendation (premium on test-author/judge, cheap elsewhere).
 */
export function auditRoleTiers(
  roles: Record<string, string>,
  opts: { highValue?: readonly string[]; highVolume?: readonly string[] } = {},
): TierWarning[] {
  const warnings: TierWarning[] = [];
  const highValue: readonly string[] = opts.highValue ?? HIGH_VALUE_ROLES;
  const highVolume: readonly string[] = opts.highVolume ?? HIGH_VOLUME_ROLES;

  for (const [role, model] of Object.entries(roles)) {
    const tier = tierOf(model);
    if (highVolume.includes(role) && isPremium(tier)) {
      warnings.push({
        role,
        model,
        tier,
        severity: "warn",
        message:
          `premium tier (${tier}) on the high-volume role "${role}" — this is usually wasteful. ` +
          `The field run found small models win tournaments when the test-author is strong; ` +
          `spend the premium tier on testAuthor/judge, not on ${role}.`,
      });
    }
    if (highValue.includes(role) && !isPremium(tier)) {
      warnings.push({
        role,
        model,
        tier,
        severity: "info",
        message:
          `"${role}" is on a ${tier} model. Test-author and judge strength is the binding ` +
          `constraint (the sealed suite is the selection signal); a premium tier (mythos/opus) ` +
          `here often pays off even when specimens stay cheap.`,
      });
    }
  }
  // Sort warn before info; stable within severity.
  return warnings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warn" ? -1 : 1));
}
