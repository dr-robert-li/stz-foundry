/**
 * The builder->answerer collaborative runner (Phase 22 -- Collaborative
 * runner + tournament shell, Plan 22-01 tracer, REQ-80).
 *
 * Three architectural facts a future reader must not "fix" away:
 *
 *   1. SC-1 -- this module holds no filesystem write capability, deliberately.
 *      Handoff immutability between the builder pass and the answerer pass is
 *      an ABSENT API, not a runtime lock: nothing exported from this file, or
 *      reachable through it, can create, modify, rename, or remove the
 *      builder's own output. The single filesystem import below is read-only
 *      and stays that way.
 *   2. D-09 -- the fitness this module returns to selection/promotion is
 *      hand-built from the scoring bridge's per-query metrics, never the
 *      battery driver's own `EvalResult`. The driver's own result measures
 *      structural presence only (did an artifact land where expected) and is
 *      carried on the run record purely as diagnostics.
 *   3. D-10 -- one `OracleReceipt` is minted per round and threaded by
 *      reference through both battery mints and the adapter fitness run.
 *      Nothing here spreads, clones, re-derives, or re-stamps it.
 *
 * This module has no path to any gold-bearing artifact or field, deliberately
 * (mirrors the scoring bridge's own posture): it is built to take a query id
 * and a verified subgraph and nothing else. A future reader tempted to import
 * a fixture, a heldout-pool loader, or any module that reads a gold-bearing
 * file should not -- source-text criteria in this plan's own verification
 * enforce that absence.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runAgentBattery,
  type CandidateAgent,
  type BatteryRun,
  type RunBatteryOptions,
} from "./agent-runner.js";
import {
  makeBattery,
  validateReceipt,
  type AgentBattery,
  type BatteryTask,
  type OracleReceipt,
} from "./battery-types.js";
import { requireCollaborativeAdmitted } from "./collaborative-admission.js";
import type { CollaborativeBatteryTask } from "./collaborative-battery.js";
import {
  scorePrediction,
  runScoringPreflight,
  type ScoringAttempt,
  type ScoringExecFn,
  type PoolManifest,
  type FingerprintManifest,
  type PreflightReport,
} from "./collaborative-scoring-bridge.js";
import type { EvalResult, SpecimenId } from "../types.js";

export class CollaborativeRunnerError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-runner] ${message}`);
    this.name = "CollaborativeRunnerError";
  }
}

// ── D-13: the joint candidate ───────────────────────────────────────────

/** Deliberately no single `systemPrompt` field -- the two roles stay
 *  separate all the way through selection (COLLAB-DESIGN.md sec8/CD-02). */
export interface CollaborativeCandidate {
  id: SpecimenId;
  builderPrompt: string;
  answererPrompt: string;
}

/**
 * `id` = COLLAB-DESIGN.md sec8's hash-of-hashes: sha256 each prompt to its
 * full, untruncated 32-byte digest, concatenate the two digests as raw bytes
 * in builder-then-answerer order, sha256 that, take the first 16 hex
 * characters. The inner digests are never hex-encoded or truncated before
 * concatenation -- that would change the bytes the outer hash sees and
 * silently narrow the collision-resistance argument sec8 makes.
 */
export function makeCollaborativeCandidate(
  builderPrompt: string,
  answererPrompt: string,
): CollaborativeCandidate {
  const builderDigest = createHash("sha256").update(builderPrompt).digest();
  const answererDigest = createHash("sha256").update(answererPrompt).digest();
  const outer = createHash("sha256").update(Buffer.concat([builderDigest, answererDigest])).digest("hex");
  return { id: outer.slice(0, 16), builderPrompt, answererPrompt };
}

// ── D-01: the pre-extracted neighbourhood seam ──────────────────────────

export interface KbNeighborhood {
  queryId: number;
  seeds: number[];
  nodes: { id: number; label: string; type: string }[];
  edges: [number, number, number][];
  relationNames: Record<string, string>;
}

export type KbNeighborhoodFn = (queryId: number) => KbNeighborhood;

// ── D-05: the closed, versioned, ids-only handoff artifact ─────────────

export const SUBGRAPH_SCHEMA_VERSION = 1;

/** Ids only, no free-text fields (D-05, sec2's smuggling-channel closure). */
export interface SubgraphArtifactV1 {
  schemaVersion: 1;
  queryId: number;
  kbRevision: string;
  nodes: number[];
  edges: [number, number, number][];
}

/**
 * Canonical serialization ratified at Task 1's checkpoint (1a): fixed key
 * order `schemaVersion, queryId, kbRevision, nodes, edges`; `nodes` sorted
 * ascending; `edges` sorted by source, then destination, then relation id;
 * UTF-8; no incidental whitespace. `JSON.stringify` on an object literal
 * built in this exact field order already preserves that order for
 * non-numeric string keys, so no bespoke stringifier is needed beyond
 * sorting the two arrays first.
 */
export function canonicalSubgraphBytes(artifact: SubgraphArtifactV1): Buffer {
  const sortedNodes = [...artifact.nodes].sort((a, b) => a - b);
  const sortedEdges = [...artifact.edges].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2],
  );
  const canonical = {
    schemaVersion: artifact.schemaVersion,
    queryId: artifact.queryId,
    kbRevision: artifact.kbRevision,
    nodes: sortedNodes,
    edges: sortedEdges,
  };
  return Buffer.from(JSON.stringify(canonical), "utf8");
}

/** Handoff hash = sha256 over exactly the canonical bytes above (1a). */
export function hashSubgraphArtifact(artifact: SubgraphArtifactV1): string {
  return createHash("sha256").update(canonicalSubgraphBytes(artifact)).digest("hex");
}

/**
 * Field presence and type checks plus rejection of a wrong `schemaVersion`
 * only -- unknown-key rejection and CD-05's structural bounds are Plan
 * 22-02's addition, deliberately deferred here.
 */
export function parseSubgraphArtifact(raw: unknown): SubgraphArtifactV1 {
  if (typeof raw !== "object" || raw === null) {
    throw new CollaborativeRunnerError(`subgraph artifact must be an object, got ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== SUBGRAPH_SCHEMA_VERSION) {
    throw new CollaborativeRunnerError(
      `subgraph artifact schemaVersion ${JSON.stringify(obj.schemaVersion)} does not equal ${SUBGRAPH_SCHEMA_VERSION}`,
    );
  }
  if (typeof obj.queryId !== "number") {
    throw new CollaborativeRunnerError(`subgraph artifact field "queryId" must be a number`);
  }
  if (typeof obj.kbRevision !== "string") {
    throw new CollaborativeRunnerError(`subgraph artifact field "kbRevision" must be a string`);
  }
  if (!Array.isArray(obj.nodes) || !obj.nodes.every((n) => typeof n === "number")) {
    throw new CollaborativeRunnerError(`subgraph artifact field "nodes" must be an array of numbers`);
  }
  if (
    !Array.isArray(obj.edges) ||
    !obj.edges.every(
      (e) => Array.isArray(e) && e.length === 3 && e.every((x) => typeof x === "number"),
    )
  ) {
    throw new CollaborativeRunnerError(
      `subgraph artifact field "edges" must be an array of [source, destination, relationId] triples`,
    );
  }
  return {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId: obj.queryId,
    kbRevision: obj.kbRevision,
    nodes: obj.nodes as number[],
    edges: obj.edges as [number, number, number][],
  };
}

// ── D-08: the handoff record ────────────────────────────────────────────

/** Bound to all four identifiers, never a bare hash (D-08). */
export interface HandoffRecord {
  queryId: number;
  attemptId: string;
  definitionHash: string;
  kbRevision: string;
  artifactPath: string;
  artifactSha256: string;
}

// ── D-10: one receipt, minted once per round ────────────────────────────

/**
 * A NEW object every call -- never hoisted to a module-level const. The
 * caller mints ONE of these per round and threads that object by reference
 * into every battery and every adapter run (D-10) -- never one per battery,
 * never one per pass.
 */
export function mintCollaborativeReceipt(): OracleReceipt {
  const record = requireCollaborativeAdmitted("stark-prime");
  const receipt: OracleReceipt = {
    kind: "constructed",
    acceptedBy: record.acceptedBy,
    lineage: [record.lineage, `constructed:hf:snap-stanford/stark@${record.revisionSha}`],
  };
  validateReceipt(receipt, "collaborative-runner");
  return receipt;
}

// ── the run ──────────────────────────────────────────────────────────────

export interface CollaborativeTaskOutcome {
  queryId: number;
  handoff: HandoffRecord;
  attempt: ScoringAttempt;
  /** hit@1 when the attempt's outcome is "scored", 0 otherwise. */
  hit1: number;
  /** Every other metric the bridge reported, diagnostics only -- never fed
   *  to selection or promotion (D-09). Empty when the attempt did not score. */
  diagnostics: Record<string, number>;
}

export interface CollaborativeRunRecord {
  candidateId: SpecimenId;
  builderBattery: AgentBattery;
  answererBattery: AgentBattery;
  builderRun: BatteryRun;
  /** The driver's own answerer result -- diagnostics only (D-09 Pitfall 1). */
  answererRun: BatteryRun;
  /** The adapter fitness handed to selection/promotion (D-09). */
  fitnessRun: BatteryRun;
  attempts: ScoringAttempt[];
  outcomes: CollaborativeTaskOutcome[];
  handoffRecords: HandoffRecord[];
  preflight: PreflightReport;
}

export interface RunCollaborativeBatteryArgs {
  candidate: CollaborativeCandidate;
  tasks: CollaborativeBatteryTask[];
  batteryIdPrefix: string;
  receipt: OracleReceipt;
  gateThreshold: number;
  artifactDir: string;
  scoringOutputDir: string;
  kbNeighborhoodFn: KbNeighborhoodFn;
  poolManifest: PoolManifest;
  fingerprintManifest: FingerprintManifest;
  warmUp: { queryId: number; predDict: Record<string, number> };
  runOpts?: RunBatteryOptions;
  execFn?: ScoringExecFn;
  /**
   * Additive offline-testability seams (Rule 3 deviation from the plan's
   * pinned signature -- see 22-01-SUMMARY.md "Deviations"): without these,
   * `runScoringPreflight`'s fingerprint step reads real files under
   * `tools/stark-eval/data/` and the real Hugging Face hub cache, which do
   * not exist in an offline test environment. Both are optional and forward
   * straight through to `runScoringPreflight` -- absent, this call behaves
   * exactly as the plan's pinned signature describes.
   */
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
}

const SUBGRAPH_ARTIFACT_REL_PATH = "subgraph.json";
const ANSWER_ARTIFACT_REL_PATH = "answer.json";
const CD01_MAX_ENTRIES = 20;

function renderNeighbourhoodLines(nb: KbNeighborhood): string {
  const nodeLines = nb.nodes
    .map((n) => `  - id=${n.id} label=${JSON.stringify(n.label)} type=${JSON.stringify(n.type)}`)
    .join("\n");
  const edgeLines = nb.edges
    .map(([src, dst, rel]) => `  - ${src} -[${nb.relationNames[String(rel)] ?? rel}]-> ${dst}`)
    .join("\n");
  return `Seeds: ${nb.seeds.join(", ")}\nNodes:\n${nodeLines}\nEdges:\n${edgeLines}`;
}

function buildBuilderTaskPrompt(
  task: CollaborativeBatteryTask,
  nb: KbNeighborhood,
  kbRevision: string,
): string {
  return [
    task.prompt,
    `QUERY_ID: ${task.queryId}`,
    "",
    "Knowledge-base neighbourhood (ids, labels, types, relation names):",
    renderNeighbourhoodLines(nb),
    "",
    `Emit a fenced block with info string "path=${SUBGRAPH_ARTIFACT_REL_PATH}" containing a JSON ` +
      `object with exactly these fields, in this order: schemaVersion (must be ` +
      `${SUBGRAPH_SCHEMA_VERSION}), queryId (${task.queryId}), kbRevision ` +
      `(${JSON.stringify(kbRevision)}), nodes (an array of KB node ids taken from the ` +
      `neighbourhood above), edges (an array of [source, destination, relationId] triples ` +
      `taken from the neighbourhood above). No other fields, and no free text outside the ids.`,
  ].join("\n");
}

/**
 * D-06: labels, types and relation names come from the runner-held
 * neighbourhood, never from builder-authored text -- the artifact only ever
 * supplies ids (enforced structurally by `parseSubgraphArtifact`'s type
 * checks, which reject anything but numbers in `nodes`/`edges`).
 */
function buildAnswererTaskPrompt(
  task: CollaborativeBatteryTask,
  artifact: SubgraphArtifactV1,
  nb: KbNeighborhood,
): string {
  const nodesById = new Map(nb.nodes.map((n) => [n.id, n] as const));
  const nodeLines = artifact.nodes
    .map((id) => {
      const n = nodesById.get(id);
      return n
        ? `  - id=${id} label=${JSON.stringify(n.label)} type=${JSON.stringify(n.type)}`
        : `  - id=${id}`;
    })
    .join("\n");
  const edgeLines = artifact.edges
    .map(([src, dst, rel]) => `  - ${src} -[${nb.relationNames[String(rel)] ?? rel}]-> ${dst}`)
    .join("\n");
  return [
    task.prompt,
    `QUERY_ID: ${task.queryId}`,
    "",
    "Verified subgraph (ids joined against the runner-held neighbourhood):",
    "Nodes:",
    nodeLines,
    "Edges:",
    edgeLines,
    "",
    `Emit a fenced block with info string "path=${ANSWER_ARTIFACT_REL_PATH}" containing a JSON ` +
      `array of up to 20 ranked KB node ids, most likely answer first.`,
  ].join("\n");
}

/**
 * CD-01: keep the first 20 entries that parse to a canonical integer id and
 * are not a repeat of one already kept; stop scanning once 20 are kept
 * (entries beyond that point are never inspected, which is the "dropped
 * rather than submitted" behaviour this function's callers rely on). Scores
 * assigned strictly descending by kept position -- the first kept id scores
 * highest.
 */
function rankedListToPredDict(
  rawRanked: unknown[],
): { predDict: Record<string, number>; keptIds: string[]; droppedCount: number } {
  const keptIds: string[] = [];
  const seen = new Set<string>();
  let droppedCount = 0;
  for (const entry of rawRanked) {
    if (keptIds.length >= CD01_MAX_ENTRIES) break;
    let numId: number | null = null;
    if (typeof entry === "number" && Number.isInteger(entry)) {
      numId = entry;
    } else if (typeof entry === "string" && /^-?\d+$/.test(entry) && Number.isInteger(Number(entry))) {
      numId = Number(entry);
    }
    if (numId === null) {
      droppedCount++;
      continue;
    }
    const key = String(numId);
    if (seen.has(key)) {
      droppedCount++;
      continue;
    }
    seen.add(key);
    keptIds.push(key);
  }
  const predDict: Record<string, number> = {};
  keptIds.forEach((key, index) => {
    predDict[key] = keptIds.length - index;
  });
  return { predDict, keptIds, droppedCount };
}

/**
 * Opens the artifact ONE time into a buffer that is both hashed and parsed
 * from that same buffer -- never a re-hash of a path followed by a second
 * open (the TOCTOU window COLLAB-DESIGN.md sec3 names). Called once at
 * handoff and once at verify-at-read; each call is its own single-open
 * operation.
 */
function openHashParse(
  artifactPath: string,
  contextLabel: string,
): { sha256: string; parsed: unknown } {
  let buf: Buffer;
  try {
    buf = readFileSync(artifactPath);
  } catch (e) {
    throw new CollaborativeRunnerError(
      `${contextLabel}: could not read artifact at ${artifactPath}: ${(e as Error).message}`,
    );
  }
  const sha256 = createHash("sha256").update(buf).digest("hex");
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    throw new CollaborativeRunnerError(
      `${contextLabel}: artifact at ${artifactPath} did not parse as JSON: ${(e as Error).message}`,
    );
  }
  return { sha256, parsed };
}

/**
 * One collaborative candidate pair, end to end, offline: preflight, builder
 * pass, hash-at-handoff, verify-at-read, answerer pass, bridge scoring, and
 * the D-09 adapter fitness. A missing or unparseable handoff artifact throws
 * `CollaborativeRunnerError` in this task -- Plan 22-02 replaces that throw
 * with the named fail-closed outcomes D-03 requires.
 */
export async function runCollaborativeBattery(
  args: RunCollaborativeBatteryArgs,
): Promise<CollaborativeRunRecord> {
  // 1. Preflight once (D-11), before any provider call.
  const preflight = runScoringPreflight({
    fingerprintManifest: args.fingerprintManifest,
    poolManifest: args.poolManifest,
    outputDir: args.scoringOutputDir,
    warmUp: args.warmUp,
    ...(args.execFn ? { execFn: args.execFn } : {}),
    ...(args.readFileFn ? { readFileFn: args.readFileFn } : {}),
    ...(args.hubCacheRoot ? { hubCacheRoot: args.hubCacheRoot } : {}),
  });

  const record = requireCollaborativeAdmitted("stark-prime");
  const kbRevision = record.revisionSha;

  const neighbourhoodByTask = new Map<string, KbNeighborhood>();
  for (const task of args.tasks) {
    neighbourhoodByTask.set(task.id, args.kbNeighborhoodFn(task.queryId));
  }

  // 2/3. Builder battery + pass 1.
  const builderTasks: BatteryTask[] = args.tasks.map((task) => ({
    id: task.id,
    prompt: buildBuilderTaskPrompt(task, neighbourhoodByTask.get(task.id)!, kbRevision),
    checks: [
      {
        checkId: "subgraph-artifact-present",
        kind: "file-invariant",
        input: SUBGRAPH_ARTIFACT_REL_PATH,
        expect: "true",
        description: "the builder emitted a subgraph artifact at the expected path",
      },
    ],
  }));
  const builderBattery = makeBattery({
    id: `${args.batteryIdPrefix}:builder`,
    tasks: builderTasks,
    receipt: args.receipt,
  });
  const builderArtifactDir = join(args.artifactDir, "builder");
  const builderCandidate: CandidateAgent = { id: args.candidate.id, systemPrompt: args.candidate.builderPrompt };
  const builderRun = await runAgentBattery(builderCandidate, builderBattery, {
    ...args.runOpts,
    artifactDir: builderArtifactDir,
  });

  // 4. Hash at handoff -- the runner hashes, never the builder.
  const handoffRecords: HandoffRecord[] = args.tasks.map((task) => {
    const artifactPath = join(builderArtifactDir, task.id, SUBGRAPH_ARTIFACT_REL_PATH);
    const opened = openHashParse(
      artifactPath,
      `handoff for task "${task.id}" (query ${task.queryId})`,
    );
    const artifact = parseSubgraphArtifact(opened.parsed);
    return {
      queryId: task.queryId,
      attemptId: randomUUID(),
      definitionHash: args.candidate.id,
      kbRevision: artifact.kbRevision,
      artifactPath,
      artifactSha256: opened.sha256,
    };
  });

  // 5. Verify at read, then render the answerer's prompt from verified ids
  // joined against the SAME pre-extracted neighbourhood (D-06).
  const answererPromptByTask = new Map<string, string>();
  for (const task of args.tasks) {
    const handoffRecord = handoffRecords.find((h) => h.queryId === task.queryId)!;
    const opened = openHashParse(
      handoffRecord.artifactPath,
      `verify-at-read for task "${task.id}" (query ${task.queryId})`,
    );
    if (opened.sha256 !== handoffRecord.artifactSha256) {
      throw new CollaborativeRunnerError(
        `verify-at-read for task "${task.id}" (query ${task.queryId}): artifact hash mismatch -- ` +
          `recorded ${handoffRecord.artifactSha256}, observed ${opened.sha256}`,
      );
    }
    const artifact = parseSubgraphArtifact(opened.parsed);
    answererPromptByTask.set(
      task.id,
      buildAnswererTaskPrompt(task, artifact, neighbourhoodByTask.get(task.id)!),
    );
  }

  const answererTasks: BatteryTask[] = args.tasks.map((task) => ({
    id: task.id,
    prompt: answererPromptByTask.get(task.id)!,
    checks: [
      {
        checkId: "ranked-answer-present",
        kind: "file-invariant",
        input: ANSWER_ARTIFACT_REL_PATH,
        expect: "true",
        description: "the answerer emitted a ranked-answer artifact at the expected path",
      },
    ],
  }));
  // Explicit gateThreshold, never left to default -- an absent threshold is
  // the perfection bar, which eliminates every realistic candidate at the
  // eval gate (checkpoint decision 3a).
  const answererBattery = makeBattery({
    id: `${args.batteryIdPrefix}:answerer`,
    tasks: answererTasks,
    receipt: args.receipt,
    gateThreshold: args.gateThreshold,
  });

  // 6. Pass 2.
  const answererArtifactDir = join(args.artifactDir, "answerer");
  const answererCandidate: CandidateAgent = {
    id: args.candidate.id,
    systemPrompt: args.candidate.answererPrompt,
  };
  const answererRun = await runAgentBattery(answererCandidate, answererBattery, {
    ...args.runOpts,
    artifactDir: answererArtifactDir,
  });

  // 7/8/9. Ranked list -> predDict (CD-01) -> bridge score -> outcome.
  const attempts: ScoringAttempt[] = [];
  const outcomes: CollaborativeTaskOutcome[] = [];
  for (const task of args.tasks) {
    const answerPath = join(answererArtifactDir, task.id, ANSWER_ARTIFACT_REL_PATH);
    let rawList: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(answerPath, "utf8"));
      if (Array.isArray(parsed)) rawList = parsed;
    } catch {
      rawList = [];
    }
    const { predDict } = rankedListToPredDict(rawList);
    const attempt = scorePrediction({
      queryId: task.queryId,
      predDict,
      outputDir: args.scoringOutputDir,
      poolManifest: args.poolManifest,
      ...(args.execFn ? { execFn: args.execFn } : {}),
    });
    attempts.push(attempt);
    const handoffRecord = handoffRecords.find((h) => h.queryId === task.queryId)!;
    const outcome = attempt.outcome;
    const hit1 = outcome.outcome === "scored" ? (outcome.metrics["hit@1"] ?? 0) : 0;
    const diagnostics = outcome.outcome === "scored" ? outcome.metrics : {};
    outcomes.push({
      queryId: task.queryId,
      handoff: handoffRecord,
      attempt,
      hit1,
      diagnostics,
    });
  }

  // 10. The D-09 adapter fitness -- hand-built from bridge metrics, never
  // the driver's own EvalResult. The mean divides by THIS run's own outcome
  // count, never a hard-coded constant.
  const hit1Sum = outcomes.reduce((sum, o) => sum + o.hit1, 0);
  const testPassRate = outcomes.length > 0 ? hit1Sum / outcomes.length : 0;
  const adapterResult: EvalResult = {
    specimen: args.candidate.id,
    passedGate: testPassRate >= args.gateThreshold,
    testPassRate,
    coverage: 0,
    mutationScore: 0,
    codeHealth: 0,
    hackFindings: [],
  };
  // `makeBattery` defensively copies the receipt it is given (a fresh frozen
  // object per mint), so `builderBattery.receipt` and `answererBattery.receipt`
  // are each their OWN object, distinct from `args.receipt` and from each
  // other, by construction the frozen `battery-types.ts` never exposes a way
  // around. `promoteComponentWinner`'s `provenanceOk` gate (component-tournament.ts)
  // requires `Object.is(promotionRun.receipt, promotionBattery.receipt)` --
  // so the fitness run's receipt must be the SAME object as the mint this
  // run's own answerer battery holds, not the caller's original `args.receipt`.
  // Threading `args.receipt` here instead would make every real promotion
  // refuse on provenance. See 22-01-SUMMARY.md "Deviations" for the full
  // reasoning against the plan's literal Object.is wording.
  const fitnessRun: BatteryRun = {
    result: adapterResult,
    receipt: answererBattery.receipt,
    provider: answererRun.provider,
    tasks: answererRun.tasks,
    records: answererRun.records,
    bounds: answererRun.bounds,
    cost: answererRun.cost,
  };

  return {
    candidateId: args.candidate.id,
    builderBattery,
    answererBattery,
    builderRun,
    answererRun,
    fitnessRun,
    attempts,
    outcomes,
    handoffRecords,
    preflight,
  };
}
