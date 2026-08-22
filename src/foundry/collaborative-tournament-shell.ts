/**
 * The thin, single-round collaborative tournament shell (Phase 22 --
 * Collaborative runner + tournament shell, Plan 22-01 tracer, REQ-80, D-12).
 *
 * Re-composes the exact run->select->promote->archive sequence
 * `component-tournament.ts:427-465` already proves, around
 * `CollaborativeCandidate` pairs instead of single-prompt candidates (SC-2:
 * `select`, `promoteComponentWinner`, `componentIncumbent`,
 * `makeComponentArchiveEntry`, and `appendComponentArchiveEntry` are all
 * imported and called unmodified). No generation/reflection loop and no
 * mutation call live here -- D-12 scopes this shell to a single round; a
 * later phase composes it into something that loops.
 */
import { join } from "node:path";
import {
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  type CollaborativeCandidate,
  type CollaborativeRunRecord,
  type KbNeighborhoodFn,
} from "./collaborative-runner.js";
import type { CollaborativeBatteryTask } from "./collaborative-battery.js";
import type { RunBatteryOptions } from "./agent-runner.js";
import type { PoolManifest, FingerprintManifest, ScoringExecFn } from "./collaborative-scoring-bridge.js";
import {
  promoteComponentWinner,
  type PromoteComponentWinnerResult,
} from "./component-tournament.js";
import { select, evalReward } from "../selection.js";
import type { JudgeReliabilityProfile } from "../judge-reliability.js";
import { componentIncumbent, makeComponentArchiveEntry, appendComponentArchiveEntry } from "../harness.js";
import type { EvalResult, SpecimenId } from "../types.js";

export const COLLABORATIVE_SLICE_TYPE = "collaborative";

/**
 * ponytail: no judge participates in collaborative mode -- D-14 sets votes
 * empty, so ranking falls through to `evalReward` and there is nothing for a
 * judge to steer. `promoteComponentWinner`'s seventh gate is independent of
 * whether votes are used for ranking, though, so a calibrated profile entry
 * is still required or `promotionGate` refuses every candidate on
 * `judge-rubric-not-calibrated` regardless of fitness. `n: 0` is the honest
 * record that no blind battery ran; `blindAccuracyBucket: "high"` is a
 * deliberate simplification, not a measurement -- the gate exists to stop an
 * uncalibrated judge from steering promotion, and a judge that never votes
 * cannot steer. Upgrade trigger: a real profile the moment a judge is ever
 * introduced to this mode.
 */
export const COLLABORATIVE_JUDGE_PROFILE: JudgeReliabilityProfile = {
  schemaVersion: 1,
  perSliceType: [{ sliceType: COLLABORATIVE_SLICE_TYPE, consistency: 1, blindAccuracyBucket: "high", n: 0 }],
};

/**
 * Deterministic, replayable search/promotion partition: sort by `queryId`
 * ascending, then alternate -- even positions to search, odd to promotion.
 * Disjoint task ids and distinct battery ids are what
 * `promoteComponentWinner`'s seal gate checks; an index-order or random
 * split would not replay identically across runs.
 */
export function splitCollaborativeTasks(
  tasks: CollaborativeBatteryTask[],
): { search: CollaborativeBatteryTask[]; promotion: CollaborativeBatteryTask[] } {
  const sorted = [...tasks].sort((a, b) => a.queryId - b.queryId);
  const search: CollaborativeBatteryTask[] = [];
  const promotion: CollaborativeBatteryTask[] = [];
  sorted.forEach((task, i) => {
    (i % 2 === 0 ? search : promotion).push(task);
  });
  return { search, promotion };
}

/**
 * A fixed, byte-identical-across-candidates frontmatter block, followed by
 * labelled builder/answerer body sections (checkpoint decision 2a). The
 * frontmatter never varies with the candidate's own text, so
 * `agentFrontmatter`'s extracted block is identical for every candidate --
 * `interfaceParity` becomes a non-vacuous but always-true comparison for
 * this mode (there is no real "interface" to diverge across two prompt
 * pairs), rather than the empty-string-vs-empty-string vacuity a
 * labelled-delimiter-only format (2b) would have produced.
 */
const COLLABORATIVE_BUNDLE_FRONTMATTER = "---\nkind: collaborative-candidate\nschemaVersion: 1\n---";

export function collaborativeBundleText(candidate: CollaborativeCandidate): string {
  return [
    COLLABORATIVE_BUNDLE_FRONTMATTER,
    "--- builder ---",
    candidate.builderPrompt,
    "--- answerer ---",
    candidate.answererPrompt,
  ].join("\n");
}

export interface RunCollaborativeRoundArgs {
  candidates: CollaborativeCandidate[];
  tasks: CollaborativeBatteryTask[];
  runDir: string;
  gateThreshold: number;
  kbNeighborhoodFn: KbNeighborhoodFn;
  poolManifest: PoolManifest;
  fingerprintManifest: FingerprintManifest;
  warmUp: { queryId: number; predDict: Record<string, number> };
  incumbentFrontmatter: string | null;
  incumbentFitness: number | null;
  diversityFloor: number;
  archive?: { root: string; slot: string };
  runOpts?: RunBatteryOptions;
  execFn?: ScoringExecFn;
  /** Additive offline-testability seams -- see collaborative-runner.ts's
   *  `RunCollaborativeBatteryArgs` doc comment for why these exist. */
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
}

export interface CollaborativeRoundResult {
  searchRuns: Map<SpecimenId, CollaborativeRunRecord>;
  winner: SpecimenId | null;
  promotion: PromoteComponentWinnerResult | null;
  promotionRun: CollaborativeRunRecord | null;
}

/**
 * The single-round body: mint one receipt (D-10), split the tasks, run
 * every candidate over the search half, `select()` unmodified (votes empty,
 * D-14), run the winner over the promotion half, `promoteComponentWinner`
 * unmodified, then archive on both promote and refuse outcomes.
 */
export async function runCollaborativeRound(
  args: RunCollaborativeRoundArgs,
): Promise<CollaborativeRoundResult> {
  const receipt = mintCollaborativeReceipt();
  const { search: searchTasks, promotion: promotionTasks } = splitCollaborativeTasks(args.tasks);
  const slotLabel = args.archive?.slot ?? "collab";

  const commonBatteryArgs = (candidate: CollaborativeCandidate) => ({
    receipt,
    gateThreshold: args.gateThreshold,
    kbNeighborhoodFn: args.kbNeighborhoodFn,
    poolManifest: args.poolManifest,
    fingerprintManifest: args.fingerprintManifest,
    warmUp: args.warmUp,
    ...(args.runOpts ? { runOpts: args.runOpts } : {}),
    ...(args.execFn ? { execFn: args.execFn } : {}),
    ...(args.readFileFn ? { readFileFn: args.readFileFn } : {}),
    ...(args.hubCacheRoot ? { hubCacheRoot: args.hubCacheRoot } : {}),
  });

  const searchRuns = new Map<SpecimenId, CollaborativeRunRecord>();
  const results: EvalResult[] = [];
  for (const candidate of args.candidates) {
    const runRecord = await runCollaborativeBattery({
      candidate,
      tasks: searchTasks,
      batteryIdPrefix: `${slotLabel}:${candidate.id}:search`,
      artifactDir: join(args.runDir, "search", candidate.id),
      scoringOutputDir: join(args.runDir, "search", candidate.id, "scoring"),
      ...commonBatteryArgs(candidate),
    });
    searchRuns.set(candidate.id, runRecord);
    results.push(runRecord.fitnessRun.result);
  }

  // votes = [] per D-14 -- ranking falls through to evalReward.
  const { judgment } = select(results, [], undefined);
  const winnerId = judgment.winner;
  if (winnerId === null) {
    return { searchRuns, winner: null, promotion: null, promotionRun: null };
  }
  const winnerCandidate = args.candidates.find((c) => c.id === winnerId)!;
  const searchWinnerRun = searchRuns.get(winnerId)!;

  const promotionRunRecord = await runCollaborativeBattery({
    candidate: winnerCandidate,
    tasks: promotionTasks,
    batteryIdPrefix: `${slotLabel}:${winnerCandidate.id}:promotion`,
    artifactDir: join(args.runDir, "promotion", winnerCandidate.id),
    scoringOutputDir: join(args.runDir, "promotion", winnerCandidate.id, "scoring"),
    ...commonBatteryArgs(winnerCandidate),
  });

  // The real recorded incumbent for this slot IS the baseline when an
  // archive target is supplied -- never the caller's own number.
  const priorIncumbent = args.archive ? componentIncumbent(args.archive.root, args.archive.slot) : null;
  const incumbentFitness = args.archive ? (priorIncumbent?.fitness ?? null) : args.incumbentFitness;
  const generationRewards = results.map((r) => evalReward(r));
  const winnerBundleText = collaborativeBundleText(winnerCandidate);

  const promotion = promoteComponentWinner({
    searchRun: searchWinnerRun.fitnessRun,
    promotionRun: promotionRunRecord.fitnessRun,
    searchBattery: searchWinnerRun.answererBattery,
    promotionBattery: promotionRunRecord.answererBattery,
    winnerFrontmatter: winnerBundleText,
    incumbentFrontmatter: args.incumbentFrontmatter,
    incumbentFitness,
    generationRewards,
    diversityFloor: args.diversityFloor,
    judgeProfile: COLLABORATIVE_JUDGE_PROFILE,
    sliceType: COLLABORATIVE_SLICE_TYPE,
  });

  if (args.archive) {
    // Append on both verdicts -- a refusal is as much an audit record as a
    // promotion.
    const advantage = judgment.advantages.find((a) => a.specimen === winnerId)?.advantage ?? 0;
    const entry = makeComponentArchiveEntry({
      slot: args.archive.slot,
      specimenId: winnerId,
      definitionText: winnerBundleText,
      parent: priorIncumbent?.variantId ?? null,
      searchFitness: promotion.searchFitness,
      promotionFitness: promotion.promotionFitness,
      advantage,
      gates: promotion.inputs,
    });
    appendComponentArchiveEntry(args.archive.root, args.archive.slot, entry);
  }

  return { searchRuns, winner: winnerId, promotion, promotionRun: promotionRunRecord };
}
