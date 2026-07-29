/**
 * Component tournaments (Phase 2 — Component tournaments, Plan 02-01 tracer).
 *
 * Proves the phase's central claim on one thin, production-quality path: two
 * agent-definition specimens run through the UNCHANGED `select()` gate+rank
 * path, and the winner reaches a promotion decision whose seventh gate is
 * computed from the real `BatteryRun` receipt that produced the fitness
 * number — never a caller-supplied boolean (D-02/CONTEXT D2). Every piece of
 * decision logic here is reused verbatim from phase 1 / the existing harness
 * meta-loop machinery (`select`, `evalReward`, `checkDiversity`,
 * `calibrationGate`, `promotionGate`, `runAgentBattery`); this file is
 * orchestration and evidence-assembly, not a new selection engine.
 */
import {
  runAgentBattery,
  resolveProviderSelection,
  DEFAULT_BATTERY_MODEL,
  type CandidateAgent,
  type BatteryRun,
  type RunBatteryOptions,
} from "./agent-runner.js";
import { exogenousLineageGate, type AgentBattery, type SplitBattery } from "./battery-types.js";
import { createProvider, type Provider } from "./provider.js";
import {
  buildReflectionTrace,
  reflectMutate,
  onReflection,
  initialReflection,
  DEFAULT_REFLECTION_BUDGET,
  agentFrontmatter,
} from "./reflective-mutation.js";
import { select, evalReward } from "../selection.js";
import { checkDiversity } from "../diversity.js";
import { calibrationGate, type JudgeReliabilityProfile } from "../judge-reliability.js";
import {
  promotionGate,
  componentIncumbent,
  makeComponentArchiveEntry,
  appendComponentArchiveEntry,
  onGeneration,
  initialMeta,
  MAX_GENERATIONS_DEFAULT,
  type PromotionVerdict,
} from "../harness.js";
import type { EvalResult, Judgment, PairwiseVote, PromotionInputs, SpecimenId } from "../types.js";

/**
 * Re-exported from `reflective-mutation.ts` (moved there in 02-04 task 1 —
 * that module needs the frontmatter helper and cannot import it back from
 * here without a cycle, since THIS file now imports
 * `buildReflectionTrace`/`reflectMutate`/the reflection-budget FSM from it).
 * Existing importers of `agentFrontmatter` from this module are unaffected.
 */
export { agentFrontmatter } from "./reflective-mutation.js";

export interface SearchGenerationResult {
  runs: Map<SpecimenId, BatteryRun>;
  judgment: Judgment;
  eliminated: { specimen: SpecimenId; reason: string }[];
}

/**
 * Search half only: runs `runAgentBattery` once per candidate against the
 * SEARCH battery, then feeds the resulting `EvalResult[]` — unmodified — into
 * the existing `select()` pipeline. `battery`'s type is a plain `AgentBattery`
 * (never `SplitBattery`), so the promotion battery is never in lexical scope
 * inside this function (REQ-17, PATTERNS "Split battery" — the structural
 * guarantee lives in this signature, not just in review discipline).
 */
export async function runSearchGeneration(
  candidates: CandidateAgent[],
  battery: AgentBattery,
  opts: RunBatteryOptions & { votes?: PairwiseVote[] } = {},
): Promise<SearchGenerationResult> {
  const runs = new Map<SpecimenId, BatteryRun>();
  const results: EvalResult[] = [];
  for (const candidate of candidates) {
    const run = await runAgentBattery(candidate, battery, opts);
    runs.set(candidate.id, run);
    results.push(run.result);
  }
  const { judgment, eliminated } = select(results, opts.votes ?? [], undefined);
  return { runs, judgment, eliminated };
}

export interface PromoteComponentWinnerArgs {
  searchRun: BatteryRun;
  promotionRun: BatteryRun;
  searchBattery: AgentBattery;
  promotionBattery: AgentBattery;
  /** The winner's produced agent-definition text (frontmatter + body). */
  winnerFrontmatter: string;
  /** The current incumbent's agent-definition text, or `null` when there is
   *  no incumbent yet (the first-ever promotion has nothing to diverge from). */
  incumbentFrontmatter: string | null;
  /** `null` ⇒ no incumbent fitness on record yet (baseline `-Infinity`). */
  incumbentFitness: number | null;
  /** Every specimen's reward this generation (search half), for the
   *  variance-collapse floor. */
  generationRewards: number[];
  diversityFloor: number;
  judgeProfile: JudgeReliabilityProfile;
  sliceType: string;
}

export interface PromoteComponentWinnerResult {
  inputs: PromotionInputs;
  verdict: PromotionVerdict;
  searchFitness: number;
  promotionFitness: number;
  searchPromotionGap: number;
  reasons: Record<string, string>;
}

/**
 * The single promotion decision. Computes all seven `PromotionInputs`
 * booleans from evidence it holds — accepts NONE of the seven as a
 * parameter, so no caller can assert a gate true (PATTERNS Analog A is the
 * CLI-trusted-boolean shape this must never become; Analog B —
 * `calibrationGate` — is the shape every gate here copies).
 */
export function promoteComponentWinner(args: PromoteComponentWinnerArgs): PromoteComponentWinnerResult {
  const searchFitness = evalReward(args.searchRun.result);
  const promotionFitness = evalReward(args.promotionRun.result);

  const beatsIncumbent = promotionFitness > (args.incumbentFitness ?? -Infinity);
  const hackClean = args.promotionRun.result.hackFindings.length === 0;

  // sealOk — held-out integrity re-checked AT the gate, not trusted from
  // construction time: the two halves must be distinct batteries with
  // disjoint task-id sets.
  const searchTaskIds = new Set(args.searchBattery.tasks.map((t) => t.id));
  const promotionTaskIds = args.promotionBattery.tasks.map((t) => t.id);
  const disjointTaskIds = promotionTaskIds.every((id) => !searchTaskIds.has(id));
  const sealOk = args.searchBattery.id !== args.promotionBattery.id && disjointTaskIds;

  const winnerBlock = agentFrontmatter(args.winnerFrontmatter);
  const interfaceParity =
    args.incumbentFrontmatter === null ? true : winnerBlock === agentFrontmatter(args.incumbentFrontmatter);

  const diversity = checkDiversity(args.generationRewards, args.diversityFloor);
  const diversityOk = diversity.ok;

  const calib = calibrationGate(args.judgeProfile, args.sliceType);
  const rubricCalibrated = calib.calibrated;

  // The seventh gate — TWO named sequential steps, never one compound
  // boolean (D-02/CONTEXT D2). `makeBattery` already makes a non-exogenous
  // `AgentBattery` unconstructable, so "is this receipt exogenous?" alone is
  // tautologically true for anything reaching this call — the real job is
  // step 1, proving the receipt on THIS run is the SAME object the
  // promotion battery was constructed with (never substituted, copied, or
  // re-derived), before step 2 even asks whether it's exogenous.
  const provenanceOk = Object.is(args.promotionRun.receipt, args.promotionBattery.receipt);
  const exo = exogenousLineageGate(args.promotionRun.receipt, args.promotionBattery.id);
  const exogenousLineage = provenanceOk && exo.exogenous;

  const inputs: PromotionInputs = {
    beatsIncumbent,
    hackClean,
    sealOk,
    interfaceParity,
    diversityOk,
    rubricCalibrated,
    exogenousLineage,
  };
  const verdict = promotionGate(inputs);

  const reasons: Record<string, string> = {
    interfaceParity: interfaceParity
      ? "agent-definition frontmatter unchanged from incumbent"
      : "agent-definition frontmatter diverged from incumbent",
    diversityOk: `sigma=${diversity.sigma.toFixed(4)} floor=${diversity.floor} — ${diversityOk ? "spread ok" : "variance collapse"}`,
    rubricCalibrated: calib.reason,
    exogenousLineage: provenanceOk
      ? exo.reason
      : "promotion run's receipt is not the same object as the promotion battery's own receipt " +
        "(provenance check failed — a substituted, copied, or re-derived receipt)",
  };

  // searchPromotionGap sign convention (REQ-21/SC5 — the measured Goodhart
  // bound, arXiv:2606.11045): search minus promotion, so a POSITIVE number
  // means the searched agent scored worse held out than while being
  // searched against (it generalizes worse — the direction that matters).
  // Derived here from the two real `evalReward` numbers above; never a
  // parameter a caller could hand-enter.
  const searchPromotionGap = searchFitness - promotionFitness;

  return { inputs, verdict, searchFitness, promotionFitness, searchPromotionGap, reasons };
}

/** When present on `RunComponentTournamentArgs`, the tournament persists one
 *  `ComponentArchiveEntry` per promotion decision to `.stz/60-harness/component/
 *  <slot>/MANIFEST.json`, and reads `incumbentFitness` from the real recorded
 *  incumbent for `slot` rather than trusting the caller's number. */
export interface ComponentArchiveTarget {
  root: string;
  slot: string;
}

export interface RunComponentTournamentArgs {
  candidates: CandidateAgent[];
  split: SplitBattery;
  incumbentFrontmatter: string | null;
  /** Baseline fitness (`-Infinity`-equivalent `null` ⇒ no incumbent yet).
   *  IGNORED when `archive` is supplied — `componentIncumbent(archive.root,
   *  archive.slot)` is the real baseline in that case (D-02: computed, not
   *  asserted — the same posture the seventh gate has). */
  incumbentFitness: number | null;
  diversityFloor: number;
  judgeProfile: JudgeReliabilityProfile;
  sliceType: string;
  votes?: PairwiseVote[];
  runOpts?: RunBatteryOptions;
  archive?: ComponentArchiveTarget;
  /** The hard search-horizon cap — `onGeneration`'s own `maxGenerations`
   *  (harness.ts, imported and called VERBATIM, never forked). Default
   *  `MAX_GENERATIONS_DEFAULT`. */
  maxGenerations?: number;
  /** The reflection-budget cap — `onReflection`'s own `cap`
   *  (reflective-mutation.ts). Default `DEFAULT_REFLECTION_BUDGET`. */
  reflectionBudget?: number;
}

/** Which of the two independently-exceedable caps (D-04/CONTEXT D4) produced
 *  a halt — so a caller/test can assert WHICH cap fired without parsing
 *  prose (RESEARCH Pitfall 4). `note` is carried verbatim from whichever
 *  FSM (`onGeneration` or `onReflection`) produced the halt action. */
export type TournamentHaltSource = "search-horizon" | "reflection-budget";

export interface TournamentHalt {
  source: TournamentHaltSource;
  note: string;
}

export interface RunComponentTournamentResult {
  search: SearchGenerationResult;
  winner: SpecimenId | null;
  /** `null` when no specimen passed the eval-gate — no promotion attempt made. */
  promotion: PromoteComponentWinnerResult | null;
  /** `null` only when the very first generation produced no gate-passer (no
   *  cap ever had a chance to fire). Otherwise always populated — the search
   *  loop only ever ends by a cap halting it (D-04: nothing here loops
   *  forever by accident; see the belt-and-suspenders `LOOP_GUARD` below). */
  halt: TournamentHalt | null;
}

/** Belt-and-suspenders only (mirrors `escalation.ts`'s `escalationTrace`
 *  guard) — `onGeneration`/`onReflection` are the real, load-bearing bound.
 *  This exists solely so a DELIBERATELY mutated (disabled) cap during a
 *  D-06 mutation check cannot hang the test suite; it is never the cap that
 *  fires in normal operation (`MAX_GENERATIONS_DEFAULT` is 5). */
const LOOP_GUARD_MAX_ITERATIONS = 20;

/**
 * Resolve the `Provider` a mutation call goes to. Mirrors
 * `runAgentBattery`'s own provider resolution (`agent-runner.ts:306-325`)
 * exactly — duplicated rather than extracted, because `agent-runner.ts` is
 * outside this plan's `files_modified` fence; both call sites must resolve
 * the SAME provider for a test's recording double to see every request.
 */
function resolveMutationProvider(opts: RunBatteryOptions = {}): { provider: Provider; model: string } {
  if (opts.providerImpl) {
    return { provider: opts.providerImpl, model: opts.provider?.model ?? DEFAULT_BATTERY_MODEL };
  }
  const sel = resolveProviderSelection(opts.provider);
  return {
    provider: createProvider({ kind: sel.kind, baseUrl: sel.baseUrl, apiKey: opts.provider?.apiKey }),
    model: sel.model,
  };
}

/**
 * Owns the `SplitBattery`, the bounded search loop, the single promotion
 * step, and is the ONLY place in this file where the promotion half is ever
 * in lexical scope alongside the search half (REQ-17 — the search-generation
 * loop above never sees it).
 *
 * The loop drives `onGeneration` (harness.ts, reused VERBATIM — the hard
 * search-horizon cap) each generation, and between generations mutates every
 * candidate from ITS OWN run's execution trace via `reflectMutate`, gated by
 * `onReflection` (the reflection-budget cap, a small sibling FSM). The two
 * caps are independently exceedable (D-04/CONTEXT D4); whichever fires first
 * halts the loop and the halt's `source` names which one. Halting ends the
 * SEARCH — the promotion step and archive append below always still run on
 * the best search-fitness candidate from the generation that halted, so a
 * halt never skips the audit record.
 *
 * ponytail: no `bumpChildCount` analog at this altitude yet — the archive
 * entry's `childCount` starts and stays 0. Upgrade trigger: parent-sampling
 * over the component archive (`sampleParents`, reused verbatim), which is a
 * later phase's concern, not this plan's.
 */
export async function runComponentTournament(args: RunComponentTournamentArgs): Promise<RunComponentTournamentResult> {
  const maxGenerations = args.maxGenerations ?? MAX_GENERATIONS_DEFAULT;
  const reflectionBudget = args.reflectionBudget ?? DEFAULT_REFLECTION_BUDGET;
  const { provider: mutationProvider, model: mutationModel } = resolveMutationProvider(args.runOpts);

  let meta = initialMeta(maxGenerations);
  let reflection = initialReflection(reflectionBudget);
  let candidates = args.candidates;
  // Running best across generations WITHIN this tournament's own search
  // loop — never the archived incumbent. `promoted` fed to `onGeneration` is
  // a SEARCH-ONLY signal (design decision): comparing against the real
  // incumbent here would leak the held-out promotion set's verdict into the
  // search FSM, the exact leak D-03/CONTEXT D3 forbids.
  let bestSearchFitness = -Infinity;
  let halt: TournamentHalt | null = null;
  let search: SearchGenerationResult;

  for (let iteration = 0; iteration < LOOP_GUARD_MAX_ITERATIONS; iteration++) {
    search = await runSearchGeneration(candidates, args.split.search, {
      ...args.runOpts,
      votes: args.votes,
    });
    const winnerId = search.judgment.winner;
    if (winnerId === null) {
      return { search, winner: null, promotion: null, halt: null };
    }

    const generationRewards = [...search.runs.values()].map((r) => evalReward(r.result));
    const diversity = checkDiversity(generationRewards, args.diversityFloor);
    const bestThisGen = Math.max(...generationRewards);
    const promoted = bestThisGen > bestSearchFitness;
    bestSearchFitness = Math.max(bestSearchFitness, bestThisGen);

    const gen = onGeneration(meta, { promoted, collapsed: !diversity.ok });
    meta = gen.next;
    if (gen.action.type === "halt") {
      halt = { source: "search-horizon", note: gen.action.note };
      break;
    }

    // Before spawning the next generation: each candidate mutates from ITS
    // OWN run's trace, one reflection consulted per intended mutation. A
    // candidate whose run produced no failures has nothing to reflect on —
    // carried forward unmutated, never spending a reflection and never
    // silently looking like a halt.
    const nextCandidates: CandidateAgent[] = [];
    let reflectionHalt: TournamentHalt | null = null;
    for (const candidate of candidates) {
      const run = search.runs.get(candidate.id)!;
      const trace = buildReflectionTrace(run);
      if (trace === "") {
        nextCandidates.push(candidate);
        continue;
      }
      const refl = onReflection(reflection);
      reflection = refl.next;
      if (refl.action.type === "halt") {
        reflectionHalt = { source: "reflection-budget", note: refl.action.note };
        break;
      }
      nextCandidates.push(
        await reflectMutate(candidate, trace, mutationProvider, { model: mutationModel, costMeter: args.runOpts?.costMeter }),
      );
    }
    if (reflectionHalt) {
      halt = reflectionHalt;
      break;
    }
    candidates = nextCandidates;
  }

  // `search` is guaranteed assigned: the loop's first iteration always runs
  // before any halt/break, and `winnerId === null` returns early above.
  const winnerId = search!.judgment.winner!;
  const winnerCandidate = candidates.find((c) => c.id === winnerId)!;
  const searchRun = search!.runs.get(winnerId)!;
  const promotionRun = await runAgentBattery(winnerCandidate, args.split.promotion, args.runOpts);
  const generationRewards = [...search!.runs.values()].map((r) => evalReward(r.result));

  // When an archive target is supplied, the real recorded incumbent for this
  // slot IS the baseline — never the caller's own number (D-02: computed,
  // not asserted).
  const priorIncumbent = args.archive ? componentIncumbent(args.archive.root, args.archive.slot) : null;
  const incumbentFitness = args.archive ? (priorIncumbent?.fitness ?? null) : args.incumbentFitness;

  const promotion = promoteComponentWinner({
    searchRun,
    promotionRun,
    searchBattery: args.split.search,
    promotionBattery: args.split.promotion,
    winnerFrontmatter: winnerCandidate.systemPrompt,
    incumbentFrontmatter: args.incumbentFrontmatter,
    incumbentFitness,
    generationRewards,
    diversityFloor: args.diversityFloor,
    judgeProfile: args.judgeProfile,
    sliceType: args.sliceType,
  });

  if (args.archive) {
    // Append on BOTH verdicts — a refusal is as much an audit record as a
    // promotion (REQ-21: Goodharting must stay observable even when the
    // gate refuses). This is the halt-time gate snapshot: `promotion.inputs`
    // was computed from the SAME generation that halted the search, so
    // halting the search never skips the audit record.
    const advantage = search!.judgment.advantages.find((a) => a.specimen === winnerId)?.advantage ?? 0;
    const entry = makeComponentArchiveEntry({
      slot: args.archive.slot,
      specimenId: winnerId,
      definitionText: winnerCandidate.systemPrompt,
      parent: priorIncumbent?.variantId ?? null,
      searchFitness: promotion.searchFitness,
      promotionFitness: promotion.promotionFitness,
      advantage,
      gates: promotion.inputs,
    });
    appendComponentArchiveEntry(args.archive.root, args.archive.slot, entry);
  }

  return { search: search!, winner: winnerId, promotion, halt };
}
