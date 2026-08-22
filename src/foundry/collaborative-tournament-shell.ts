/**
 * The thin, single-round collaborative tournament shell (Phase 22 --
 * Collaborative runner + tournament shell, Plan 22-01 tracer + 22-03,
 * REQ-80, D-12).
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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  type CollaborativeCandidate,
  type CollaborativeRunRecord,
  type KbNeighborhoodFn,
} from "./collaborative-runner.js";
import type { CollaborativeBatteryTask } from "./collaborative-battery.js";
import type { RunBatteryOptions } from "./agent-runner.js";
import type {
  PoolManifest,
  FingerprintManifest,
  ScoringExecFn,
  ScoringAttempt,
} from "./collaborative-scoring-bridge.js";
import type { OracleReceipt } from "./battery-types.js";
import {
  promoteComponentWinner,
  type PromoteComponentWinnerResult,
} from "./component-tournament.js";
import { select, evalReward } from "../selection.js";
import type { JudgeReliabilityProfile } from "../judge-reliability.js";
import {
  componentIncumbent,
  componentDir,
  componentVariantId,
  makeComponentArchiveEntry,
  appendComponentArchiveEntry,
} from "../harness.js";
import { assertSafePathSegment } from "../taxonomy.js";
import type { ComponentArchiveEntry, EvalResult, Judgment, SpecimenId } from "../types.js";

export class CollaborativeTournamentShellError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-tournament-shell] ${message}`);
    this.name = "CollaborativeTournamentShellError";
  }
}

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

/**
 * CD-03: one winner-only promoted subgraph artifact, re-verified against the
 * handoff record's own recorded digest after the copy lands. `attempt` is
 * the SAME `ScoringAttempt` object the runner returned on the winner's
 * promotion-half run (`Object.is`, D-10/SC-3) -- never a re-derived copy.
 */
export interface PromotedSubgraph {
  queryId: number;
  artifactPath: string;
  sha256: string;
  attempt: ScoringAttempt;
}

export interface PromoteWinnerSubgraphsArgs {
  archiveRoot: string;
  slot: string;
  /** The component archive entry's own `variantId` (a sha256-derived hex
   *  string, already path-segment-safe) -- namespaces the promoted
   *  directory so it lines up with the audit entry that names it. */
  winnerVariantId: string;
  /** The winning candidate's PROMOTION-half run record. Never a search-half
   *  run -- CD-03 is winner-only AND promotion-half-only. */
  promotionRun: CollaborativeRunRecord;
}

/**
 * CD-03 winner-only promotion of subgraph artifacts into the audit tree.
 *
 * Layout (Phase 23's replay reads this location):
 *   <componentDir(archiveRoot, slot)>/subgraphs/<winnerVariantId>/q-<queryId>.json
 * one file per promotion-half query, named by query id. The slot segment is
 * guarded by `componentDir`'s own `assertSafePathSegment` call (never a
 * second, bespoke regex); `winnerVariantId` is guarded here with the same
 * function since it does not pass through `componentDir`. Both guards run
 * BEFORE any directory is created, so a traversal segment refuses cleanly.
 *
 * Integrity: for each handoff record, the source artifact's bytes are read,
 * written to the destination, then the destination is re-read and its own
 * digest compared against the digest the handoff record carries. A mismatch
 * -- whether the source was tampered after handoff or the copy itself
 * corrupted the bytes -- is refused by name (query id + both digests),
 * never a silent copy.
 */
export function promoteWinnerSubgraphs(args: PromoteWinnerSubgraphsArgs): PromotedSubgraph[] {
  assertSafePathSegment(args.winnerVariantId, "component winner variant id");
  const destDir = join(componentDir(args.archiveRoot, args.slot), "subgraphs", args.winnerVariantId);

  const promoted: PromotedSubgraph[] = [];
  for (const handoff of args.promotionRun.handoffRecords) {
    const attempt = args.promotionRun.attempts.find((a) => a.queryId === handoff.queryId);
    if (!attempt) {
      throw new CollaborativeTournamentShellError(
        `no scoring attempt recorded for query ${handoff.queryId} on the winner's promotion run`,
      );
    }

    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, `q-${handoff.queryId}.json`);
    const sourceBytes = readFileSync(handoff.artifactPath);
    writeFileSync(destPath, sourceBytes);
    const destBytes = readFileSync(destPath);
    const observedSha256 = createHash("sha256").update(destBytes).digest("hex");
    if (observedSha256 !== handoff.artifactSha256) {
      throw new CollaborativeTournamentShellError(
        `promotion refused for query ${handoff.queryId}: artifact digest mismatch -- ` +
          `handoff recorded ${handoff.artifactSha256}, observed ${observedSha256}`,
      );
    }

    promoted.push({ queryId: handoff.queryId, artifactPath: destPath, sha256: observedSha256, attempt });
  }
  return promoted;
}

export interface CollaborativeRoundResult {
  searchRuns: Map<SpecimenId, CollaborativeRunRecord>;
  winner: SpecimenId | null;
  judgment: Judgment;
  promotion: PromoteComponentWinnerResult | null;
  promotionRun: CollaborativeRunRecord | null;
  /** The entry appended to the component archive this round -- populated on
   *  BOTH promote and refuse outcomes when `archive` is supplied (T-22-14);
   *  `null` only when no archive target was supplied, or no candidate ever
   *  reached selection (`winner === null`). */
  archiveEntry: ComponentArchiveEntry | null;
  /** CD-03: winner-only promoted subgraph artifacts. Empty on refusal, on a
   *  missing archive target, or on a no-winner round. */
  promoted: PromotedSubgraph[];
  /** The promotion battery's own post-mint receipt object (D-10/SC-3) --
   *  `Object.is`-identical to `promotionRun.answererBattery.receipt` and to
   *  `promotionRun.fitnessRun.receipt`. `null` when no winner was promoted
   *  to the promotion half. */
  receipt: OracleReceipt | null;
  /**
   * CD-04: per-candidate, per-role `componentVariantId` values -- diagnostics
   * only, never the specimen id and never an input to the sec8 hash (the
   * joint hash is the D-13 hash-of-hashes over full digests, computed in
   * `makeCollaborativeCandidate`).
   */
  diagnostics: { componentVariantIds: Record<SpecimenId, { builder: string; answerer: string }> };
}

/**
 * The single-round body: mint one receipt (D-10), split the tasks, run
 * every candidate over the search half, `select()` unmodified (votes empty,
 * D-14), run the winner over the promotion half, `promoteComponentWinner`
 * unmodified, archive on both promote and refuse outcomes, and -- on a
 * promote verdict -- promote the winner's subgraph artifacts into the audit
 * tree (CD-03).
 */
export async function runCollaborativeRound(
  args: RunCollaborativeRoundArgs,
): Promise<CollaborativeRoundResult> {
  const receipt = mintCollaborativeReceipt();
  const { search: searchTasks, promotion: promotionTasks } = splitCollaborativeTasks(args.tasks);
  const slotLabel = args.archive?.slot ?? "collab";

  // CD-04: per-role variant ids, diagnostics only -- computed once per
  // candidate up front, never fed into selection or promotion below.
  const componentVariantIds: Record<SpecimenId, { builder: string; answerer: string }> = {};
  for (const candidate of args.candidates) {
    componentVariantIds[candidate.id] = {
      builder: componentVariantId(candidate.builderPrompt),
      answerer: componentVariantId(candidate.answererPrompt),
    };
  }

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

  /**
   * Pitfall 4 -- the reward scale a Phase 23 reader will meet: with
   * `coverage`, `mutationScore` and `codeHealth` all explicitly 0 on the
   * D-09 adapter result and no `suspicion` present, `evalReward` reduces to
   * `0.45 * meanHit1 + 0.25` -- REWARD_WEIGHTS.pass (0.45) on `testPassRate`
   * plus REWARD_WEIGHTS.kill (0.2, since `1 - mutationScore` = 1) plus
   * REWARD_WEIGHTS.clean (0.05, since `suspicion` is absent -> 1). Effective
   * span 0.25..0.70, not 0..1. Three consequences: (1) ranking order is
   * unaffected -- the transform is a strictly increasing affine function of
   * `testPassRate`; (2) `beatsIncumbent` and the noise margin compare on
   * this COMPRESSED scale, so a gap in reward is 45% of the corresponding
   * gap in raw hit@1; (3) `diversityFloor` is a floor on the spread of
   * compressed rewards, so a floor tuned against raw hit@1 intuition reads
   * roughly twice as strict as intended (0.45x compression). None of this
   * is a bug -- `evalReward` is reused verbatim (SC-2) and the compression
   * is an honest consequence of the adapter's structural-metric fields
   * being genuinely absent from collaborative mode, not a workaround.
   *
   * votes = [] per D-14 -- ranking falls through to evalReward; no judge
   * call and no pairwise vote construction happen anywhere in this round.
   */
  const { judgment } = select(results, [], undefined);
  const winnerId = judgment.winner;
  if (winnerId === null) {
    return {
      searchRuns,
      winner: null,
      judgment,
      promotion: null,
      promotionRun: null,
      archiveEntry: null,
      promoted: [],
      receipt: null,
      diagnostics: { componentVariantIds },
    };
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
  // The round's receipt at the exact object identity `promoteComponentWinner`'s
  // provenance gate reads -- `fitnessRun.receipt` is already the post-mint
  // `answererBattery.receipt` object (see collaborative-runner.ts), so this
  // is `Object.is`-identical to both.
  const promotionReceipt = promotionRunRecord.answererBattery.receipt;

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

  let archiveEntry: ComponentArchiveEntry | null = null;
  let promoted: PromotedSubgraph[] = [];
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
    archiveEntry = entry;

    // CD-03: winner-only, and only on a promote verdict -- a refusal
    // promotes no subgraph artifacts at all.
    if (promotion.verdict.promote) {
      promoted = promoteWinnerSubgraphs({
        archiveRoot: args.archive.root,
        slot: args.archive.slot,
        winnerVariantId: entry.variantId,
        promotionRun: promotionRunRecord,
      });
    }
  }

  return {
    searchRuns,
    winner: winnerId,
    judgment,
    promotion,
    promotionRun: promotionRunRecord,
    archiveEntry,
    promoted,
    receipt: promotionReceipt,
    diagnostics: { componentVariantIds },
  };
}
