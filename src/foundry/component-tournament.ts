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
import { runAgentBattery, type CandidateAgent, type BatteryRun, type RunBatteryOptions } from "./agent-runner.js";
import { exogenousLineageGate, type AgentBattery, type SplitBattery } from "./battery-types.js";
import { select, evalReward } from "../selection.js";
import { checkDiversity } from "../diversity.js";
import { calibrationGate, type JudgeReliabilityProfile } from "../judge-reliability.js";
import { promotionGate, type PromotionVerdict } from "../harness.js";
import type { EvalResult, Judgment, PairwiseVote, PromotionInputs, SpecimenId } from "../types.js";

/**
 * The YAML frontmatter block between the leading `---` delimiter line and the
 * next `---` line, or `""` when absent. A five-line scan, not a YAML parser.
 * ponytail: whole-block string equality is the comparison this exists to
 * feed (`interfaceParity` in `promoteComponentWinner`) — upgrade to per-key
 * comparison once a battery legitimately needs to mutate a purely
 * descriptive frontmatter field (e.g. `description`) without tripping parity.
 */
export function agentFrontmatter(text: string): string {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") return "";
  const end = lines.slice(1).findIndex((l) => l.trim() === "---");
  if (end === -1) return "";
  return lines.slice(1, end + 1).join("\n");
}

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

  return { inputs, verdict, searchFitness, promotionFitness, searchPromotionGap: searchFitness - promotionFitness, reasons };
}

export interface RunComponentTournamentArgs {
  candidates: CandidateAgent[];
  split: SplitBattery;
  incumbentFrontmatter: string | null;
  incumbentFitness: number | null;
  diversityFloor: number;
  judgeProfile: JudgeReliabilityProfile;
  sliceType: string;
  votes?: PairwiseVote[];
  runOpts?: RunBatteryOptions;
}

export interface RunComponentTournamentResult {
  search: SearchGenerationResult;
  winner: SpecimenId | null;
  /** `null` when no specimen passed the eval-gate — no promotion attempt made. */
  promotion: PromoteComponentWinnerResult | null;
}

/**
 * Owns the `SplitBattery`, the single promotion step, and is the ONLY place
 * in this file where the promotion half is ever in lexical scope alongside
 * the search half (REQ-17 — the search-generation loop above never sees it).
 * ponytail: single generation. The bounded meta-loop (`onGeneration`, reused
 * verbatim) that spawns further generations on a barren-but-not-collapsed
 * result is 02-04's; this plan proves the tracer, not the loop.
 */
export async function runComponentTournament(args: RunComponentTournamentArgs): Promise<RunComponentTournamentResult> {
  const search = await runSearchGeneration(args.candidates, args.split.search, {
    ...args.runOpts,
    votes: args.votes,
  });
  const winnerId = search.judgment.winner;
  if (winnerId === null) {
    return { search, winner: null, promotion: null };
  }

  const winnerCandidate = args.candidates.find((c) => c.id === winnerId)!;
  const searchRun = search.runs.get(winnerId)!;
  const promotionRun = await runAgentBattery(winnerCandidate, args.split.promotion, args.runOpts);
  const generationRewards = [...search.runs.values()].map((r) => evalReward(r.result));

  const promotion = promoteComponentWinner({
    searchRun,
    promotionRun,
    searchBattery: args.split.search,
    promotionBattery: args.split.promotion,
    winnerFrontmatter: winnerCandidate.systemPrompt,
    incumbentFrontmatter: args.incumbentFrontmatter,
    incumbentFitness: args.incumbentFitness,
    generationRewards,
    diversityFloor: args.diversityFloor,
    judgeProfile: args.judgeProfile,
    sliceType: args.sliceType,
  });

  return { search, winner: winnerId, promotion };
}
