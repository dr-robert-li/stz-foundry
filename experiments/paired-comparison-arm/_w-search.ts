/**
 * THE RECEIPT-FREE BOUNDED SEARCH DRIVER for W, the tournament-selected
 * winner (Phase 14 — Instrument build, Plan 14-05, REQ-69;
 * `PAIRED-DESIGN-PREREG.md` rev 2 §3 — FROZEN. PD-1, `14-01-PLAN.md`).
 *
 * PD-1 (restated verbatim from `14-05-PLAN.md`): this module constructs NO
 * `OracleReceipt` and NO branded battery value, anywhere. It never imports
 * `battery-types.ts`, `fixture-warehouse.ts`, or `runComponentTournament`
 * (`component-tournament.ts`) — the shipped top-level tournament entry
 * point is deliberately NOT called. What IS reused, by import, never
 * reimplemented: the bounded reflective-mutation call (`reflectMutate`,
 * `reflective-mutation.ts`), the reflection-budget state machine
 * (`onReflection`/`initialReflection`, same module), and the
 * generation-horizon state machine (`onGeneration`/`initialMeta`,
 * `harness.ts`) — the two independently-exceedable caps this driver's own
 * loop below drives directly, in the same `{next, action}` shape
 * `component-tournament.ts`'s own search loop uses, re-derived here rather
 * than imported as a unit (REQ-17's own "search half only" boundary: this
 * driver's checkpoint core, arm-run function and prompt builder come from
 * `_paired-arms.ts`, never from `component-tournament.ts`).
 *
 * FITNESS comes from the SAME independent oracle the paired round scores
 * with (`classifyCustomerSupportResponse`, called inside the imported,
 * unchanged `runArmOnPairingUnit`) — never a synthesized `EvalResult` or a
 * call into `select()`/`evalReward` (the shipped selection helper's inputs
 * are shaped for code-mutation testing; inventing values for an agent
 * definition would fabricate fitness inputs, which the plan's own pinned
 * decision explicitly refuses).
 *
 * SEARCH-HALF SEEDS ONLY (`TOURNAMENT_SEARCH_SEEDS`) for candidate scoring;
 * PROMOTION-HALF SEEDS ONLY (`TOURNAMENT_PROMOTION_SEEDS`) for the one
 * held-out confirmation run — both disjoint from the paired battery's own
 * six seeds (`PAIRED_SEEDS`, 1301-1306), which this module never imports
 * and never references, by numeral or by name, anywhere (T-14-15).
 *
 * VESTIGIAL `arm: "W"` ON EVERY RESULT — mirrors `_ceiling-probe.ts`'s own
 * precedent (14-04): no W or B study slot exists during a search generation
 * (the search PRODUCES W; it does not run it). The real discriminator is
 * the checkpoint KEY's own generation/candidate-id prefix
 * (`searchUnitKey`/`promotionUnitKey` below), never this field.
 *
 * NO NUMERIC PROMOTION THRESHOLD is applied anywhere in this file — the
 * frozen design pins none for the search (PD-1's own cost statement).
 * Selection is the highest search-half match count, ties broken by
 * candidate-identifier array order; the promotion-half confirmation is
 * recorded, never gated on.
 *
 * RESUMABLE BY REPLAY: every candidate-on-unit evaluation AND every
 * mutation call is cached (the former via the imported, unchanged `once`;
 * the latter via this file's own small mutation cache, stored inside
 * `PairedState.runConfig` — a plain `Record<string, unknown>`, never a new
 * top-level state shape). A resumed process replays the generation loop
 * from generation 0; every already-completed step is a cache hit (zero new
 * inference calls) until it reaches genuinely new work. `onReflection` is
 * always called (never skipped for a cache hit) so the reflection-budget
 * FSM advances identically on replay — only the EXPENSIVE `reflectMutate`
 * call itself is cache-gated.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateCustomerSupportTicket,
  type CustomerSupportTicket,
} from "../../src/foundry/customer-support-warehouse.js";
import {
  loadState,
  saveState,
  once,
  pairingUnitId,
  runArmOnPairingUnit,
  type PairedAgentDefinition,
  type PairedArmResult,
  type PairedState,
} from "./_paired-arms.js";
import {
  PAIRED_MODEL as PAIRED_MODEL_DEFAULT,
  PAIRED_TIMEOUT_MS,
  PAIRED_MAX_PROMPT_CHARS,
  PAIRED_TASKS_PER_SEED as PAIRED_TASKS_PER_SEED_DEFAULT,
  TOURNAMENT_SEARCH_SEEDS as TOURNAMENT_SEARCH_SEEDS_DEFAULT,
  TOURNAMENT_PROMOTION_SEEDS as TOURNAMENT_PROMOTION_SEEDS_DEFAULT,
} from "./_paired-constants.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";
import {
  reflectMutate,
  onReflection,
  initialReflection,
  DEFAULT_REFLECTION_BUDGET,
  MAX_REFLECTION_TRACE_CHARS,
  TRUNCATION_MARKER,
} from "../../src/foundry/reflective-mutation.js";
import { onGeneration, initialMeta, MAX_GENERATIONS_DEFAULT } from "../../src/harness.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SEARCH_BASE_URL = "http://localhost:11434/v1";

// ── model/shape/artifact-path resolution (Plan 15-06, REQ-72) — the SAME
// env-seam precedent `_calibration-dryrun.ts` established
// (`CALIBRATION_MODEL`/`CALIBRATION_VERDICT_FILE`): shadow the imported
// default under the ORIGINAL name, so every existing downstream reference
// to `PAIRED_MODEL`/`TOURNAMENT_SEARCH_SEEDS`/`TOURNAMENT_PROMOTION_SEEDS`/
// `PAIRED_TASKS_PER_SEED` (including the pinned literal
// `reflectMutate(candidate, trace, provider, { model: PAIRED_MODEL })` this
// file's own test asserts on) keeps working unchanged, resolved to the
// env-overridden value with the env unset (every existing test's own
// context) falling straight back to the rev-2 default. ──────────────────

function parseSeedList(raw: string): number[] {
  return raw.split(",").map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n)) throw new Error(`[w-search] invalid seed in seed list: "${s}"`);
    return n;
  });
}

const PAIRED_MODEL = process.env.PAIRED_SEARCH_MODEL || PAIRED_MODEL_DEFAULT;
const PAIRED_TASKS_PER_SEED = process.env.PAIRED_SEARCH_TASKS_PER_SEED
  ? Number(process.env.PAIRED_SEARCH_TASKS_PER_SEED)
  : PAIRED_TASKS_PER_SEED_DEFAULT;
const TOURNAMENT_SEARCH_SEEDS = process.env.PAIRED_SEARCH_SEEDS
  ? parseSeedList(process.env.PAIRED_SEARCH_SEEDS)
  : TOURNAMENT_SEARCH_SEEDS_DEFAULT;
const TOURNAMENT_PROMOTION_SEEDS = process.env.PAIRED_PROMOTION_SEEDS
  ? parseSeedList(process.env.PAIRED_PROMOTION_SEEDS)
  : TOURNAMENT_PROMOTION_SEEDS_DEFAULT;
/** Verdict artifact filename — defaults to today's literal
 *  `w-search-verdict.json`. */
const W_SEARCH_VERDICT_FILE = process.env.PAIRED_SEARCH_VERDICT_FILE || "w-search-verdict.json";

/** The digest lookup, extracted as a pure function of the resolved model
 *  and an `ollama list` transcript — so a test can pin "the digest is
 *  looked up for the RESOLVED model, not the default one" (T-15-24)
 *  offline, without a real `ollama` call. */
export function findModelDigestLine(model: string, ollamaListOutput: string): string {
  const line = ollamaListOutput.split("\n").find((l) => l.startsWith(model) || l.startsWith(model.replace(/:latest$/, "")));
  return line ?? `<not found in 'ollama list': ${model}>`;
}

/** The resolved values, re-exported under their own names for direct test
 *  visibility (the module-level shadowed identifiers above keep their
 *  ORIGINAL names for the literal-source-regex reasons the block comment
 *  above explains, so a test cannot import `PAIRED_MODEL` from this module
 *  and see the resolved value under that name without colliding with the
 *  rev-2 default of the same name already imported from
 *  `_paired-constants.js` elsewhere in the same test file). With no env
 *  override (every existing test's own process), every one of these equals
 *  its rev-2 default byte-for-byte. */
export const RESOLVED_SEARCH_RUN_OPTIONS = {
  model: PAIRED_MODEL,
  tasksPerSeed: PAIRED_TASKS_PER_SEED,
  searchSeeds: TOURNAMENT_SEARCH_SEEDS,
  promotionSeeds: TOURNAMENT_PROMOTION_SEEDS,
  verdictFile: W_SEARCH_VERDICT_FILE,
};

// ── which of the two independently-exceedable caps halted the search — a
// LOCAL type, never imported from `component-tournament.ts` (whose own
// `TournamentHalt` has this identical shape): this driver never references
// that file at all, by design (see the module doc comment above). ────────

export type SearchHaltSource = "search-horizon" | "reflection-budget";
export interface SearchHalt {
  source: SearchHaltSource;
  note: string;
}

// ── the deterministic, total, resumable task order over one seed block ───

export interface SearchOrderUnit {
  seed: number;
  taskIndex: number;
  unitId: string;
}

function buildTaskOrder(seeds: readonly number[]): SearchOrderUnit[] {
  const order: SearchOrderUnit[] = [];
  for (const seed of seeds) {
    for (let taskIndex = 0; taskIndex < PAIRED_TASKS_PER_SEED; taskIndex++) {
      order.push({ seed, taskIndex, unitId: pairingUnitId(seed, taskIndex) });
    }
  }
  return order;
}

/** Search-half only — candidate-scoring tasks. */
export function buildSearchTaskOrder(): SearchOrderUnit[] {
  return buildTaskOrder(TOURNAMENT_SEARCH_SEEDS);
}

/** Promotion-half only — the one held-out confirmation run. */
export function buildPromotionTaskOrder(): SearchOrderUnit[] {
  return buildTaskOrder(TOURNAMENT_PROMOTION_SEEDS);
}

// ── checkpoint keys — generation/candidate-id is the REAL discriminator,
// never the vestigial `arm` field on the persisted result ────────────────

function searchUnitKey(generation: number, candidateId: string, unitId: string): string {
  return `search:g${generation}:${candidateId}:${unitId}`;
}

function promotionUnitKey(candidateId: string, unitId: string): string {
  return `promotion:${candidateId}:${unitId}`;
}

// ── running one candidate on one unit — reuses `runArmOnPairingUnit`
// (checkpoint core + prompt builder + the pinned model, all from
// `_paired-arms.ts`) unchanged, with the vestigial `arm: "W"` placeholder ─

async function runCandidateOnUnit(
  ticket: CustomerSupportTicket,
  unitId: string,
  candidate: PairedAgentDefinition,
  provider: Provider,
  taskTimeoutMs?: number,
): Promise<PairedArmResult> {
  // Passes the resolved (possibly env-overridden) `PAIRED_MODEL` explicitly
  // — `runArmOnPairingUnit`'s own default falls back to `_paired-arms.ts`'s
  // OWN imported constant, which this module never shadows, so omitting
  // `model` here would silently score against the wrong model whenever
  // this file's own resolution diverges from `_paired-arms.ts`'s default.
  return runArmOnPairingUnit(ticket, unitId, "W", candidate, provider, { taskTimeoutMs, model: PAIRED_MODEL });
}

/** A `status === "error"` result is retried at MOST once, logged into
 *  `state.retries`, never appended as a second checkpoint entry. A
 *  `timeout` is a measurement, never retried — mirrors `_ceiling-probe.ts`'s
 *  own `onceWithHarnessRetry` (driver-local, wrapping the imported,
 *  unchanged `once`). */
export async function onceWithHarnessRetry(
  statePath: string,
  state: PairedState,
  key: string,
  work: () => Promise<PairedArmResult>,
): Promise<PairedArmResult> {
  return once(statePath, state, key, async () => {
    let result = await work();
    if (result.status === "error") {
      state.retries.push(`${key}: harness-fault retry (${result.failureReason ?? "unknown error"})`);
      result = await work();
    }
    return result;
  });
}

// ── the failure trace fed to `reflectMutate` — fresh, never
// `buildReflectionTrace` (shaped for `BatteryRun`/predicate `CheckResult`,
// not this instrument's binary oracle categories). Bounded against the
// SAME exported cap `reflective-mutation.ts` itself warns is load-bearing
// (T-02-05) — `reflectMutate` does not truncate its own `trace` argument. ─

function truncateSearchTrace(full: string): string {
  if (full.length <= MAX_REFLECTION_TRACE_CHARS) return full;
  const budget = MAX_REFLECTION_TRACE_CHARS - TRUNCATION_MARKER.length;
  let cut = full.slice(0, Math.max(0, budget));
  const lastNewline = cut.lastIndexOf("\n");
  if (lastNewline > 0) cut = cut.slice(0, lastNewline);
  return cut + TRUNCATION_MARKER;
}

/** One section per unit that did NOT resolution-match: the candidate's own
 *  raw response (never the ticket's known-correct resolution — nothing
 *  here leaks ground truth into the mutation prompt) plus the oracle
 *  category, or the harness failure reason for a non-`ok` unit. */
export function buildCandidateFailureTrace(results: PairedArmResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.oracleCategory === "resolution-match") continue;
    if (r.status !== "ok") {
      lines.push(`Unit ${r.unitId} (${r.status}): ${r.failureReason ?? "no reason recorded"}`);
      continue;
    }
    const rawSnippet = r.rawText.trim().slice(0, 300);
    lines.push(
      `Unit ${r.unitId} [${r.oracleCategory}]: response did not match the required resolution. ` +
        `Raw response (truncated): ${JSON.stringify(rawSnippet)}`,
    );
  }
  return truncateSearchTrace(lines.join("\n"));
}

// ── the mutation cache — resumability for `reflectMutate` itself, stored
// inside `PairedState.runConfig` (a plain `Record<string, unknown>`, never
// a new persisted shape). Keyed identically to `searchUnitKey`'s own
// (generation, candidateId) pair — the mutation produced BETWEEN generation
// `generation` and `generation+1` for that candidate lineage. ────────────

interface MutationCacheEntry {
  id: string;
  systemPrompt: string;
}

function mutationCacheKey(generation: number, candidateId: string): string {
  return `g${generation}:${candidateId}`;
}

function getCachedMutation(state: PairedState, generation: number, candidateId: string): PairedAgentDefinition | undefined {
  const cache = (state.runConfig?.mutationCache ?? {}) as Record<string, MutationCacheEntry>;
  return cache[mutationCacheKey(generation, candidateId)];
}

function setCachedMutation(
  statePath: string,
  state: PairedState,
  generation: number,
  candidateId: string,
  agent: PairedAgentDefinition,
): void {
  const runConfig: Record<string, unknown> = { ...(state.runConfig ?? {}) };
  const cache: Record<string, MutationCacheEntry> = { ...((runConfig.mutationCache as Record<string, MutationCacheEntry>) ?? {}) };
  cache[mutationCacheKey(generation, candidateId)] = { id: agent.id, systemPrompt: agent.systemPrompt };
  runConfig.mutationCache = cache;
  state.runConfig = runConfig;
  saveState(statePath, state);
}

// ── the search loop itself ────────────────────────────────────────────────

export interface SearchLoopOptions {
  taskTimeoutMs?: number;
  maxGenerations?: number;
  reflectionBudget?: number;
}

export interface CandidateFitnessRecord {
  candidateId: string;
  generation: number;
  matchCount: number;
  scoreable: number;
  attempted: number;
}

export interface SearchLoopWinner {
  candidateId: string;
  systemPrompt: string;
  generation: number;
  searchMatchCount: number;
}

export interface SearchLoopResult {
  halt: SearchHalt;
  generationsRun: number;
  fitnessLog: CandidateFitnessRecord[];
  winner: SearchLoopWinner;
}

/** Belt-and-suspenders only (mirrors `component-tournament.ts`'s own
 *  `LOOP_GUARD_MAX_ITERATIONS`) — `onGeneration`/`onReflection` are the
 *  real, load-bearing bounds; this exists only so a deliberately mutated
 *  (disabled) cap during a review pass cannot hang the process. */
function loopGuard(maxGenerations: number): number {
  return maxGenerations + 2;
}

/**
 * Drives `onGeneration` (search-horizon cap) each generation, mutating
 * every surviving candidate between generations via `reflectMutate`, gated
 * by `onReflection` (reflection-budget cap) — the two caps are
 * independently exceedable; whichever fires first halts the loop and the
 * halt's `source` names which one (never both, never neither — one of the
 * two ends every call that does not throw).
 */
export async function runSearchLoop(
  statePath: string,
  state: PairedState,
  seedCandidates: PairedAgentDefinition[],
  provider: Provider,
  opts: SearchLoopOptions = {},
): Promise<SearchLoopResult> {
  if (seedCandidates.length === 0) {
    throw new Error("runSearchLoop requires at least one seed candidate");
  }
  const maxGenerations = opts.maxGenerations ?? MAX_GENERATIONS_DEFAULT;
  const reflectionBudget = opts.reflectionBudget ?? DEFAULT_REFLECTION_BUDGET;
  const searchOrder = buildSearchTaskOrder();
  // The ORIGINAL seed array order — the deterministic tie-break identity.
  // Never the mutated pool's order (candidate identity, i.e. `id`, is
  // preserved by `reflectMutate` across generations, so this stays valid).
  const candidateOrder = seedCandidates.map((c) => c.id);

  let meta = initialMeta(maxGenerations);
  let reflection = initialReflection(reflectionBudget);
  let candidates = seedCandidates;
  let bestOverallFitness = -Infinity;
  const bestByCandidateId = new Map<
    string,
    { agent: PairedAgentDefinition; fitness: number; generation: number }
  >();
  const fitnessLog: CandidateFitnessRecord[] = [];
  let halt: SearchHalt | null = null;

  const maxIterations = loopGuard(maxGenerations);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const generation = meta.generation;
    const generationResults = new Map<string, PairedArmResult[]>();

    for (const candidate of candidates) {
      const results: PairedArmResult[] = [];
      for (const { seed, taskIndex, unitId } of searchOrder) {
        const ticket = generateCustomerSupportTicket(seed, taskIndex);
        const key = searchUnitKey(generation, candidate.id, unitId);
        const r = await onceWithHarnessRetry(statePath, state, key, () =>
          runCandidateOnUnit(ticket, unitId, candidate, provider, opts.taskTimeoutMs),
        );
        results.push(r);
      }
      generationResults.set(candidate.id, results);
      const matchCount = results.filter((r) => r.oracleCategory === "resolution-match").length;
      const scoreable = results.filter(
        (r) => r.oracleCategory === "resolution-match" || r.oracleCategory === "resolution-mismatch",
      ).length;
      fitnessLog.push({ candidateId: candidate.id, generation, matchCount, scoreable, attempted: results.length });

      const prevBest = bestByCandidateId.get(candidate.id);
      if (!prevBest || matchCount > prevBest.fitness) {
        bestByCandidateId.set(candidate.id, { agent: candidate, fitness: matchCount, generation });
      }
    }

    const bestThisGen = Math.max(
      ...candidates.map((c) => generationResults.get(c.id)!.filter((r) => r.oracleCategory === "resolution-match").length),
    );
    const promoted = bestThisGen > bestOverallFitness;
    bestOverallFitness = Math.max(bestOverallFitness, bestThisGen);

    const gen = onGeneration(meta, { promoted, collapsed: false });
    meta = gen.next;
    if (gen.action.type === "halt") {
      halt = { source: "search-horizon", note: gen.action.note };
      break;
    }

    const nextCandidates: PairedAgentDefinition[] = [];
    let reflectionHalted = false;
    for (const candidate of candidates) {
      const results = generationResults.get(candidate.id)!;
      const trace = buildCandidateFailureTrace(results);
      if (trace === "") {
        // Nothing to reflect on — carried forward unmutated, never
        // spending a reflection (mirrors `component-tournament.ts`'s own
        // "no failures, no reflection" rule).
        nextCandidates.push(candidate);
        continue;
      }
      // `onReflection` is called UNCONDITIONALLY here — even when the
      // mutation itself will be a cache hit below — so the reflection
      // budget's own FSM advances identically on a resumed replay.
      const refl = onReflection(reflection);
      reflection = refl.next;
      if (refl.action.type === "halt") {
        halt = { source: "reflection-budget", note: refl.action.note };
        reflectionHalted = true;
        break;
      }
      const cached = getCachedMutation(state, generation, candidate.id);
      const mutated: PairedAgentDefinition =
        cached ?? (await reflectMutate(candidate, trace, provider, { model: PAIRED_MODEL }));
      if (!cached) setCachedMutation(statePath, state, generation, candidate.id, mutated);
      nextCandidates.push(mutated);
    }
    if (reflectionHalted) break;
    candidates = nextCandidates;
  }

  if (!halt) {
    // Should not happen in practice — `onGeneration`'s own `maxGenerations`
    // cap always fires within `maxIterations` generations. Belt-and-
    // suspenders only, mirrors `component-tournament.ts`'s own posture.
    halt = {
      source: "search-horizon",
      note: `Loop guard (${maxIterations} iterations) reached without either FSM halting.`,
    };
  }

  // Selection: the highest search-half match count OBSERVED FOR THAT
  // CANDIDATE LINEAGE in any generation it ran — never merely the final
  // generation's count, so a mutation that regresses does not silently
  // discard a stronger earlier generation. Ties broken by `candidateOrder`
  // (the original seed array position): iterate in that order and require
  // a STRICT improvement to replace the incumbent, so the first candidate
  // in array order with the maximum fitness wins any tie.
  let winnerId: string | null = null;
  let winnerFitness = -Infinity;
  for (const id of candidateOrder) {
    const best = bestByCandidateId.get(id);
    if (!best) continue;
    if (best.fitness > winnerFitness) {
      winnerFitness = best.fitness;
      winnerId = id;
    }
  }
  if (winnerId === null) {
    throw new Error("runSearchLoop produced no scored candidate — no generation ever ran");
  }
  const winnerBest = bestByCandidateId.get(winnerId)!;

  return {
    halt,
    generationsRun: meta.generation,
    fitnessLog,
    winner: {
      candidateId: winnerId,
      systemPrompt: winnerBest.agent.systemPrompt,
      generation: winnerBest.generation,
      searchMatchCount: winnerBest.fitness,
    },
  };
}

// ── the held-out promotion-half confirmation — run ONCE, never gated on ──

export interface PromotionConfirmation {
  candidateId: string;
  matchCount: number;
  scoreable: number;
  attempted: number;
}

/** Runs the search's own winner over the promotion-half units once,
 *  recording the counts as held-out confirmation — never a fresh numeric
 *  bar (the frozen design pins none for the search). */
export async function runPromotionConfirmation(
  statePath: string,
  state: PairedState,
  winner: PairedAgentDefinition,
  provider: Provider,
  taskTimeoutMs?: number,
): Promise<PromotionConfirmation> {
  const order = buildPromotionTaskOrder();
  const results: PairedArmResult[] = [];
  for (const { seed, taskIndex, unitId } of order) {
    const ticket = generateCustomerSupportTicket(seed, taskIndex);
    const key = promotionUnitKey(winner.id, unitId);
    const r = await onceWithHarnessRetry(statePath, state, key, () =>
      runCandidateOnUnit(ticket, unitId, winner, provider, taskTimeoutMs),
    );
    results.push(r);
  }
  const matchCount = results.filter((r) => r.oracleCategory === "resolution-match").length;
  const scoreable = results.filter(
    (r) => r.oracleCategory === "resolution-match" || r.oracleCategory === "resolution-mismatch",
  ).length;
  return { candidateId: winner.id, matchCount, scoreable, attempted: results.length };
}

// ── the verdict artifact — `promotion` is a REQUIRED positional argument,
// never optional: this function cannot be called, and `complete: true`
// cannot be written, before the promotion-half confirmation exists ───────

export interface VerdictArtifact {
  complete: true;
  winner: SearchLoopWinner;
  searchTaskCount: number;
  promotionTaskCount: number;
  halt: SearchHalt;
  generationsRun: number;
  fitnessLog: CandidateFitnessRecord[];
  promotion: PromotionConfirmation;
  runConfig: Record<string, unknown>;
}

export function composeVerdictArtifact(
  search: SearchLoopResult,
  promotion: PromotionConfirmation,
  runConfig: Record<string, unknown>,
): VerdictArtifact {
  return {
    complete: true,
    winner: search.winner,
    searchTaskCount: buildSearchTaskOrder().length,
    promotionTaskCount: buildPromotionTaskOrder().length,
    halt: search.halt,
    generationsRun: search.generationsRun,
    fitnessLog: search.fitnessLog,
    promotion,
    runConfig,
  };
}

// ── the extraction convention shared with `_b-arm-definition.md` /
// `_w-arm-definition.md`: the substring "Agent System Prompt" (any heading
// level/numbering) followed by the FIRST fenced code block — that fenced
// block's contents, verbatim, are the `PairedAgentDefinition.systemPrompt`
// value. Nothing outside the fence is ever part of the transmitted prompt. ─

const AGENT_SYSTEM_PROMPT_MARKER = "Agent System Prompt";

export function extractAgentSystemPromptFromDefinitionFile(markdown: string): string {
  const markerIdx = markdown.indexOf(AGENT_SYSTEM_PROMPT_MARKER);
  if (markerIdx === -1) {
    throw new Error(`extractAgentSystemPromptFromDefinitionFile: marker "${AGENT_SYSTEM_PROMPT_MARKER}" not found`);
  }
  const afterMarker = markdown.slice(markerIdx + AGENT_SYSTEM_PROMPT_MARKER.length);
  const fenceStart = afterMarker.indexOf("```");
  if (fenceStart === -1) {
    throw new Error("extractAgentSystemPromptFromDefinitionFile: no fenced block found after the marker");
  }
  const afterFenceOpen = afterMarker.slice(fenceStart + 3);
  const firstNewline = afterFenceOpen.indexOf("\n");
  const body = firstNewline === -1 ? afterFenceOpen : afterFenceOpen.slice(firstNewline + 1);
  const fenceEnd = body.indexOf("```");
  if (fenceEnd === -1) {
    throw new Error("extractAgentSystemPromptFromDefinitionFile: unterminated fenced block");
  }
  return body.slice(0, fenceEnd).replace(/\n$/, "");
}

// ── the search's second hand-written starting variant — deliberately
// structured differently from `_b-arm-definition.md` (checklist form
// rather than prose), so generation 0 has genuine lineage diversity rather
// than one candidate plus a near-duplicate. Covers the same substantive
// contract (both vocabularies, both parameter-derivation paths including
// the full catalog, the three-line format) for the same reason B's own
// rationale states: an incomplete seed would auto-fail the two lookup-typed
// actions before any mutation ever ran. ──────────────────────────────────

export const SEARCH_SEED_ALT_SYSTEM_PROMPT = `Role: customer-support ticket triage agent.

Steps:
1. Read the ticket text.
2. Pick exactly one action from: adjust-charge, refund-duplicate-charge, refund-shipping-upgrade, credit-late-delivery-fee, ship-catalog-replacement, escalate-repeat-defect.
3. Map that action to its category:
   - adjust-charge, refund-duplicate-charge -> order-total-discrepancy
   - refund-shipping-upgrade, credit-late-delivery-fee -> shipping-service-mismatch
   - ship-catalog-replacement -> missing-item
   - escalate-repeat-defect -> product-quality
4. Compute the "parameter" value:
   - If the action is adjust-charge, refund-duplicate-charge, refund-shipping-upgrade, or credit-late-delivery-fee: the parameter is a dollar figure, two decimal places, derived by arithmetic (subtraction or multiplication) over the dollar amounts stated in the ticket. Show your arithmetic before answering.
   - If the action is ship-catalog-replacement or escalate-repeat-defect: the ticket states a SKU number, never the item name. Convert the SKU to the item's name using this table, then use that name as the parameter:
     3001 = Blue Ceramic Mug
     3002 = Wireless Mouse
     3003 = Phone Case
     3004 = Yoga Mat
     3005 = Bluetooth Speaker
     3006 = Desk Lamp
5. Show your reasoning for steps 2-4 first.
6. Then, as the LAST thing in your response, output exactly these three lines and nothing after them:
action: <one of the six allowed action values, spelled exactly as listed above>
category: <the category mapped in step 3>
parameter: <the value computed in step 4>

Do not use any wording for action/category other than the exact strings listed above. Do not add any explanation after the parameter line.`;

// ══════════════════════════════════ main ════════════════════════════════

function requireStatePath(): string {
  const v = process.env.TOURNEY_STATE;
  if (!v) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");
  return v;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

/** Properties of the EXECUTED run, captured once at first run, never
 *  re-captured on a resumed pass (mirrors `_ceiling-probe.ts`'s own
 *  `captureRunConfig`/`if (!state.runConfig)` gate). */
function captureRunConfig(): Record<string, unknown> {
  const ollamaVersion = safeExec("ollama --version");
  const modelDigestLine = findModelDigestLine(PAIRED_MODEL, safeExec("ollama list"));
  return {
    model: PAIRED_MODEL,
    modelDigestLine,
    ollamaVersion,
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    timeoutMs: PAIRED_TIMEOUT_MS,
    promptBoundChars: PAIRED_MAX_PROMPT_CHARS,
    maxGenerations: MAX_GENERATIONS_DEFAULT,
    reflectionBudget: DEFAULT_REFLECTION_BUDGET,
    clientConcurrency: 1,
    startedAt: new Date().toISOString(),
    taskOrder: "search-half seed then task index 0..9 within each seed for candidate scoring; promotion-half seed then task index 0..9 for confirmation — both deterministic, total, stable",
  };
}

function writeArtifact(filename: string, data: unknown): void {
  const p = join(SCRIPT_DIR, filename);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

/** Reads the committed baseline definition off disk and extracts its
 *  operative system prompt (§3's fenced-block convention above) — never
 *  re-derived, never hand-copied. Paired with this file's own second
 *  hand-written seed variant. */
export function loadSeedCandidates(): PairedAgentDefinition[] {
  const baselineMd = readFileSync(join(SCRIPT_DIR, "_b-arm-definition.md"), "utf8");
  const baseline: PairedAgentDefinition = {
    id: "seed-baseline",
    systemPrompt: extractAgentSystemPromptFromDefinitionFile(baselineMd),
  };
  const alt: PairedAgentDefinition = { id: "seed-alt", systemPrompt: SEARCH_SEED_ALT_SYSTEM_PROMPT };
  return [baseline, alt];
}

async function main(): Promise<void> {
  const statePath = requireStatePath();
  console.log(
    `# W-SEARCH — state: ${statePath} · model: ${PAIRED_MODEL} · search seeds: ${TOURNAMENT_SEARCH_SEEDS.join(",")} · ` +
      `promotion seeds: ${TOURNAMENT_PROMOTION_SEEDS.join(",")} · maxGenerations: ${MAX_GENERATIONS_DEFAULT} · ` +
      `reflectionBudget: ${DEFAULT_REFLECTION_BUDGET}`,
  );

  const state = loadState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig();
    saveState(statePath, state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const provider = createProvider({ kind: "openai", baseUrl: SEARCH_BASE_URL });
  const seedCandidates = loadSeedCandidates();
  console.log(`seed candidates: ${seedCandidates.map((c) => c.id).join(", ")}`);

  const searchResult = await runSearchLoop(statePath, state, seedCandidates, provider, {
    taskTimeoutMs: PAIRED_TIMEOUT_MS,
    maxGenerations: MAX_GENERATIONS_DEFAULT,
    reflectionBudget: DEFAULT_REFLECTION_BUDGET,
  });
  console.log(
    `search halted: ${searchResult.halt.source} — ${searchResult.halt.note}\n` +
      `winner: ${searchResult.winner.candidateId} (generation ${searchResult.winner.generation}, ` +
      `search-half match ${searchResult.winner.searchMatchCount}/${buildSearchTaskOrder().length})`,
  );

  const winnerAgent: PairedAgentDefinition = {
    id: searchResult.winner.candidateId,
    systemPrompt: searchResult.winner.systemPrompt,
  };
  const promotion = await runPromotionConfirmation(statePath, state, winnerAgent, provider, PAIRED_TIMEOUT_MS);
  console.log(
    `promotion-half confirmation: ${promotion.matchCount}/${buildPromotionTaskOrder().length} matched ` +
      `(scoreable ${promotion.scoreable}/${promotion.attempted})`,
  );

  const verdict = composeVerdictArtifact(searchResult, promotion, state.runConfig ?? {});
  writeArtifact(W_SEARCH_VERDICT_FILE, verdict);
  console.log(
    `\n=> W-SEARCH COMPLETE — winner ${verdict.winner.candidateId}, search ${verdict.winner.searchMatchCount}/` +
      `${verdict.searchTaskCount}, promotion ${verdict.promotion.matchCount}/${verdict.promotionTaskCount}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
