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
import { spawnSync } from "node:child_process";
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
  SCORING_TIMEOUT_MS,
  VENV_PYTHON_REL,
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

// ── D-01 live half: the real kbNeighborhoodFn dispatch (Plan 22-04) ────

export const NEIGHBORHOOD_ONE_REL = "tools/stark-eval/neighborhood_one.py";
/** FA-7 discretion (extraction parameters, Phase 23 may tune): two hops,
 *  four hundred nodes. `NEIGHBORHOOD_MAX_NODES` must stay above
 *  `MAX_SUBGRAPH_NODES` (200, exported below) -- a valid builder subgraph
 *  could not fit inside a neighbourhood smaller than the structural bound
 *  the builder is allowed to submit. */
export const NEIGHBORHOOD_HOPS = 2;
export const NEIGHBORHOOD_MAX_NODES = 400;

/** The admission table's kb name ("stark-prime") and STaRK's own kb name
 *  ("prime", the argv value the Python helper takes) differ -- carry the
 *  mapping explicitly, mirroring `collaborative-scoring-bridge.ts`'s own
 *  `SCORE_ONE_KB_ARG` precedent one module over. */
const NEIGHBORHOOD_KB_ARG = "prime";

export interface MakeDefaultKbNeighborhoodFnOpts {
  pythonPath?: string;
  scriptPath?: string;
  timeoutMs?: number;
  /** Same shape as the bridge's own `ScoringExecFn` -- this dispatch is a
   *  second call site of the same idiom, never a second shape. */
  execFn?: ScoringExecFn;
}

const defaultKbNeighborhoodExecFn: ScoringExecFn = (file, args, opts) => spawnSync(file, args, opts);

/** Bounded (2000-char) tail, mirroring the bridge's own `boundedTail` --
 *  not exported there, so duplicated here rather than reaching into a
 *  sibling module's private helper. */
function boundedTail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

export type ParseNeighborhoodResult =
  | { ok: true; neighborhood: KbNeighborhood }
  | { ok: false; violation: string };

/**
 * Field-by-field, never a cast (D-05's house discipline, one module-
 * internal neighbour over): rejects a non-object, a missing/wrongly-typed
 * field, a node record whose id is not an integer, a malformed edge triple,
 * and an echoed revision that differs from the pin (T-22-18). An empty seed
 * set is ALSO a named refusal here, not an empty-but-successful
 * neighbourhood (FA-7's stated no-silent-fallback requirement).
 */
export function parseNeighborhoodStdout(raw: string): ParseNeighborhoodResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, violation: "neighbourhood helper stdout did not parse as JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      violation: `neighbourhood helper stdout must be a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
    };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.kb !== "string") {
    return { ok: false, violation: `field "kb" must be a string` };
  }
  if (typeof obj.queryId !== "number") {
    return { ok: false, violation: `field "queryId" must be a number` };
  }
  if (typeof obj.revision !== "string") {
    return { ok: false, violation: `field "revision" must be a string` };
  }
  const record = requireCollaborativeAdmitted("stark-prime");
  if (obj.revision !== record.revisionSha) {
    return {
      ok: false,
      violation: `echoed revision ${JSON.stringify(obj.revision)} does not match the pinned revision ${JSON.stringify(record.revisionSha)}`,
    };
  }
  if (!Array.isArray(obj.seeds)) {
    return { ok: false, violation: `field "seeds" must be an array` };
  }
  for (let i = 0; i < obj.seeds.length; i++) {
    if (!Number.isInteger(obj.seeds[i])) {
      return {
        ok: false,
        violation: `seed at position ${i} is not an integer node id (got ${JSON.stringify(obj.seeds[i])})`,
      };
    }
  }
  if (obj.seeds.length === 0) {
    const reason = typeof obj.reason === "string" && obj.reason.length > 0 ? obj.reason : "no reason given";
    return {
      ok: false,
      violation:
        `the helper found no seed entity for this query -- ${reason} (an empty seed set is a refusal, ` +
        `never an empty-but-successful neighbourhood)`,
    };
  }
  if (!Array.isArray(obj.nodes)) {
    return { ok: false, violation: `field "nodes" must be an array` };
  }
  const nodes: { id: number; label: string; type: string }[] = [];
  for (let i = 0; i < obj.nodes.length; i++) {
    const n = obj.nodes[i];
    if (typeof n !== "object" || n === null || Array.isArray(n)) {
      return { ok: false, violation: `node at position ${i} must be an object` };
    }
    const nObj = n as Record<string, unknown>;
    if (!Number.isInteger(nObj.id)) {
      return {
        ok: false,
        violation: `node at position ${i} has a non-integer "id" (got ${JSON.stringify(nObj.id)})`,
      };
    }
    if (typeof nObj.label !== "string") {
      return { ok: false, violation: `node at position ${i} has a non-string "label"` };
    }
    if (typeof nObj.type !== "string") {
      return { ok: false, violation: `node at position ${i} has a non-string "type"` };
    }
    nodes.push({ id: nObj.id as number, label: nObj.label, type: nObj.type });
  }
  if (!Array.isArray(obj.edges)) {
    return { ok: false, violation: `field "edges" must be an array` };
  }
  const edges: [number, number, number][] = [];
  for (let i = 0; i < obj.edges.length; i++) {
    const e = obj.edges[i];
    if (!Array.isArray(e) || e.length !== 3 || !e.every((x) => Number.isInteger(x))) {
      return {
        ok: false,
        violation: `edge at position ${i} must be a [source, destination, relationId] integer triple (got ${JSON.stringify(e)})`,
      };
    }
    edges.push(e as [number, number, number]);
  }
  if (typeof obj.relationNames !== "object" || obj.relationNames === null || Array.isArray(obj.relationNames)) {
    return { ok: false, violation: `field "relationNames" must be an object` };
  }
  const relationNames: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj.relationNames as Record<string, unknown>)) {
    if (typeof value !== "string") {
      return { ok: false, violation: `relationNames entry "${key}" must be a string` };
    }
    relationNames[key] = value;
  }
  return {
    ok: true,
    neighborhood: { queryId: obj.queryId, seeds: obj.seeds as number[], nodes, edges, relationNames },
  };
}

/**
 * The real `KbNeighborhoodFn` (D-01's live half): a Node-side dispatch to
 * `tools/stark-eval/neighborhood_one.py` in the Phase 18 venv, mirroring
 * `scorePrediction`'s own fail-closed branch order (T-22-19) -- timeout,
 * signal, spawn error, non-zero exit, and only THEN parse stdout -- rather
 * than a second, differently-ordered dispatch idiom for a second dispatch
 * site. The pinned revision is read from `requireCollaborativeAdmitted`,
 * never a second literal, and threaded into argv the same way
 * `scorePrediction` threads it.
 */
export function makeDefaultKbNeighborhoodFn(opts: MakeDefaultKbNeighborhoodFnOpts = {}): KbNeighborhoodFn {
  return (queryId: number): KbNeighborhood => {
    const record = requireCollaborativeAdmitted("stark-prime");
    const execFn = opts.execFn ?? defaultKbNeighborhoodExecFn;
    const argv = [
      opts.scriptPath ?? NEIGHBORHOOD_ONE_REL,
      NEIGHBORHOOD_KB_ARG,
      String(queryId),
      "--hf-revision",
      record.revisionSha,
      "--hops",
      String(NEIGHBORHOOD_HOPS),
      "--cap",
      String(NEIGHBORHOOD_MAX_NODES),
    ];
    const timeoutMs = opts.timeoutMs ?? SCORING_TIMEOUT_MS;
    const result = execFn(opts.pythonPath ?? VENV_PYTHON_REL, argv, {
      input: "",
      timeout: timeoutMs,
      encoding: "utf8",
    });

    // SAME branch order as scorePrediction (T-22-19): timeout, signal,
    // spawn error, non-zero exit, only THEN a stdout parse -- never
    // reordered, never a second idiom for a second dispatch site.
    const errorCode = result.error !== undefined ? (result.error as NodeJS.ErrnoException).code : undefined;
    if (errorCode === "ETIMEDOUT") {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} timed out after ${timeoutMs}ms`,
      );
    }
    if (result.signal !== null) {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} was killed by signal ${result.signal}`,
      );
    }
    if (result.error !== undefined) {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction process for query ${queryId} could not be reached (${result.error.message})`,
      );
    }
    if (result.status !== 0) {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} exited with code ${result.status ?? -1} -- ` +
          `stderr tail: ${boundedTail(result.stderr)}`,
      );
    }
    const parsed = parseNeighborhoodStdout(result.stdout);
    if (!parsed.ok) {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} produced invalid output -- ${parsed.violation}`,
      );
    }
    return parsed.neighborhood;
  };
}

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

export type SchemaValidationResult =
  | { ok: true; artifact: SubgraphArtifactV1 }
  | { ok: false; violation: string };

const RATIFIED_ARTIFACT_KEYS = ["schemaVersion", "queryId", "kbRevision", "nodes", "edges"] as const;

/**
 * Field-by-field, never a cast, never a throw (Plan 22-02 replaces the
 * tracer's throw-on-anything posture with named, continuable outcomes,
 * D-03): rejects a non-object, any key outside the ratified field set
 * (D-05's smuggling-channel closure -- the clause the tracer deliberately
 * deferred), a wrong `schemaVersion`, a non-integer node id, a non-integer
 * relation id, an edge triple of the wrong length, and an edge referencing
 * a node id absent from the artifact's own node list. Unknown keys are
 * never stripped and never tolerated -- rejected, naming the offending key.
 */
export function parseSubgraphArtifact(raw: unknown): SchemaValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      violation: `subgraph artifact must be a plain object, got ${Array.isArray(raw) ? "array" : typeof raw}`,
    };
  }
  const obj = raw as Record<string, unknown>;
  const extraKeys = Object.keys(obj).filter(
    (k) => !(RATIFIED_ARTIFACT_KEYS as readonly string[]).includes(k),
  );
  if (extraKeys.length > 0) {
    return {
      ok: false,
      violation: `subgraph artifact carries unknown key(s) outside the ratified schema: ${extraKeys.join(", ")}`,
    };
  }
  if (obj.schemaVersion !== SUBGRAPH_SCHEMA_VERSION) {
    return {
      ok: false,
      violation: `subgraph artifact schemaVersion ${JSON.stringify(obj.schemaVersion)} does not equal expected ${SUBGRAPH_SCHEMA_VERSION}`,
    };
  }
  if (typeof obj.queryId !== "number") {
    return { ok: false, violation: `field "queryId" must be a number, got ${typeof obj.queryId}` };
  }
  if (typeof obj.kbRevision !== "string") {
    return { ok: false, violation: `field "kbRevision" must be a string, got ${typeof obj.kbRevision}` };
  }
  // T-22-03/SC-1 (Plan 22-05): kbRevision is pin-checked here, mirroring
  // parseNeighborhoodStdout's own revision check one function over -- the
  // builder's own artifact must echo the SAME pinned revision, never an
  // arbitrary string. The violation names the FIELD, never the offending
  // VALUE: this string lands in the returned run record (record.outcomes /
  // a HandoffOutcome), an agent-visible surface (FA-8), unlike
  // parseNeighborhoodStdout's sink, an operator-facing thrown error.
  const admissionRecord = requireCollaborativeAdmitted("stark-prime");
  if (obj.kbRevision !== admissionRecord.revisionSha) {
    return { ok: false, violation: `field "kbRevision" does not match the pinned KB revision` };
  }
  if (!Array.isArray(obj.nodes)) {
    return { ok: false, violation: `field "nodes" must be an array` };
  }
  for (let i = 0; i < obj.nodes.length; i++) {
    if (!Number.isInteger(obj.nodes[i])) {
      return {
        ok: false,
        violation: `node at position ${i} is not an integer node id (got ${JSON.stringify(obj.nodes[i])})`,
      };
    }
  }
  if (!Array.isArray(obj.edges)) {
    return { ok: false, violation: `field "edges" must be an array` };
  }
  for (let i = 0; i < obj.edges.length; i++) {
    const e: unknown = obj.edges[i];
    if (!Array.isArray(e) || e.length !== 3 || !e.every((x) => Number.isInteger(x))) {
      return {
        ok: false,
        violation: `edge at position ${i} must be a [source, destination, relationId] integer triple (got ${JSON.stringify(e)})`,
      };
    }
  }
  const nodeIds = obj.nodes as number[];
  const nodeSet = new Set(nodeIds);
  const edges = obj.edges as [number, number, number][];
  for (let i = 0; i < edges.length; i++) {
    const [src, dst] = edges[i] as [number, number, number];
    if (!nodeSet.has(src)) {
      return {
        ok: false,
        violation: `edge at position ${i} references source node id ${src} absent from the artifact's own node list`,
      };
    }
    if (!nodeSet.has(dst)) {
      return {
        ok: false,
        violation: `edge at position ${i} references destination node id ${dst} absent from the artifact's own node list`,
      };
    }
  }
  return {
    ok: true,
    artifact: {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: obj.queryId,
      kbRevision: obj.kbRevision,
      nodes: nodeIds,
      edges,
    },
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

// ── D-03/D-07/D-08: the named, exhaustive fail-closed handoff outcome ──

/**
 * CD-05's three named structural conditions (Plan 22-02 Task 2). Declared
 * here, in full, so `HandoffOutcome`'s `cd05-violation` member is pinned
 * before Task 2 writes `validateSubgraphAgainstNeighborhood` -- Task 2
 * widens the validator's body, never this type or the union's member list.
 */
export type Cd05Violation =
  | { condition: "below-minimum"; nodeCount: number }
  | { condition: "above-maximum"; nodeCount: number }
  | { condition: "disconnected"; unreachableNodeId: number }
  | { condition: "outside-neighborhood"; nodeId: number };

/**
 * Every way a task can fail to reach a scored bridge outcome, mirroring
 * `ScoringOutcome`'s own discriminated-union/exhaustiveness idiom one
 * module over (`collaborative-scoring-bridge.ts`). `success` is the only
 * member that is not itself a D-03 fail-closed condition. Never collapsed:
 * each failure mode is its own named kind so Phase 23 can report *why* a
 * candidate lost (T-22-11).
 */
export type HandoffOutcome =
  | { kind: "success"; artifact: SubgraphArtifactV1 }
  | { kind: "artifact-absent"; path: string }
  | { kind: "unparseable"; reason: "not-json" | "not-object"; path: string }
  | { kind: "schema-invalid"; violation: string }
  | { kind: "record-absent"; queryId: number }
  | { kind: "record-corrupt"; violation: string }
  | { kind: "hash-mismatch"; recordedSha256: string; observedSha256: string }
  | { kind: "cd05-violation"; violation: Cd05Violation }
  | { kind: "bridge-non-success"; scoringOutcomeKind: string };

export type HandoffOutcomeKind = HandoffOutcome["kind"];

/**
 * Every key of `HandoffOutcome`'s own discriminant, assigned to a
 * `Record<HandoffOutcomeKind, true>` literal -- the same excess/missing
 * property exhaustiveness mechanism `collaborative-scoring-bridge.ts` uses
 * for `SCORING_OUTCOME_KINDS`: a member added to `HandoffOutcome` without a
 * matching key here, or a stray key matching no member, is a typecheck
 * failure.
 */
const ALL_HANDOFF_OUTCOME_KINDS: Record<HandoffOutcomeKind, true> = {
  success: true,
  "artifact-absent": true,
  unparseable: true,
  "schema-invalid": true,
  "record-absent": true,
  "record-corrupt": true,
  "hash-mismatch": true,
  "cd05-violation": true,
  "bridge-non-success": true,
};

/** The full outcome table's discriminants, in the stable order documented
 *  on `ALL_HANDOFF_OUTCOME_KINDS` above. */
export const HANDOFF_OUTCOME_KINDS: readonly HandoffOutcomeKind[] = Object.keys(
  ALL_HANDOFF_OUTCOME_KINDS,
) as HandoffOutcomeKind[];

function describeCd05Violation(v: Cd05Violation): string {
  switch (v.condition) {
    case "below-minimum":
      return `${v.nodeCount} nodes, below MIN_SUBGRAPH_NODES`;
    case "above-maximum":
      return `${v.nodeCount} nodes, above MAX_SUBGRAPH_NODES`;
    case "disconnected":
      return `node ${v.unreachableNodeId} unreachable from the rest of the subgraph (undirected, FA-5)`;
    case "outside-neighborhood":
      return `node ${v.nodeId} is not a member of the pre-extracted neighborhood`;
    default: {
      const _exhaustive: never = v;
      throw new CollaborativeRunnerError(
        `describeCd05Violation: unhandled condition ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

/** One-line, human-readable description of any `HandoffOutcome` -- mirrors
 *  `describeScoringOutcome`'s house idiom one module over, including the
 *  `never`-typed default arm that makes growing the union without a
 *  matching case here a compile error. */
export function describeHandoffOutcome(outcome: HandoffOutcome): string {
  switch (outcome.kind) {
    case "success":
      return `success: verified subgraph for query ${outcome.artifact.queryId}`;
    case "artifact-absent":
      return `fail-closed: no artifact found at ${outcome.path}`;
    case "unparseable":
      return `fail-closed: artifact at ${outcome.path} did not parse (${outcome.reason})`;
    case "schema-invalid":
      return `fail-closed: artifact schema violation -- ${outcome.violation}`;
    case "record-absent":
      return `fail-closed: no handoff record recorded for query ${outcome.queryId}`;
    case "record-corrupt":
      return `fail-closed: handoff record corrupt -- ${outcome.violation}`;
    case "hash-mismatch":
      return `fail-closed: artifact hash mismatch -- recorded ${outcome.recordedSha256}, observed ${outcome.observedSha256}`;
    case "cd05-violation":
      return `fail-closed: CD-05 structural violation -- ${describeCd05Violation(outcome.violation)}`;
    case "bridge-non-success":
      return `fail-closed: bridge did not score -- outcome "${outcome.scoringOutcomeKind}"`;
    default: {
      const _exhaustive: never = outcome;
      throw new CollaborativeRunnerError(
        `describeHandoffOutcome: unhandled outcome kind ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

type ReadJsonResult =
  | { status: "absent" }
  | { status: "unparseable" }
  | { status: "ok"; sha256: string; value: unknown };

/**
 * The ONE read call site in this module (D-08 structural proof, grep-checked
 * by this plan's acceptance criteria): opens `path` into a buffer exactly
 * once, and returns both that buffer's sha256 digest and its parse result
 * computed from the SAME buffer -- no code path may hash one open and parse
 * another (the TOCTOU window COLLAB-DESIGN.md sec3 names). Every artifact
 * read in this module -- the builder's subgraph at hash-at-handoff, the
 * same subgraph again at verify-at-read, and the answerer's ranked list --
 * routes through this single function.
 */
function readJsonArtifact(path: string): ReadJsonResult {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return { status: "absent" };
  }
  const sha256 = createHash("sha256").update(buf).digest("hex");
  try {
    const value: unknown = JSON.parse(buf.toString("utf8"));
    return { status: "ok", sha256, value };
  } catch {
    return { status: "unparseable" };
  }
}

type ReadSubgraphResult =
  | { status: "absent" }
  | { status: "unparseable"; reason: "not-json" | "not-object" }
  | { status: "ok"; sha256: string; value: Record<string, unknown> };

function readSubgraphArtifact(path: string): ReadSubgraphResult {
  const r = readJsonArtifact(path);
  if (r.status === "absent") return { status: "absent" };
  if (r.status === "unparseable") return { status: "unparseable", reason: "not-json" };
  if (typeof r.value !== "object" || r.value === null || Array.isArray(r.value)) {
    return { status: "unparseable", reason: "not-object" };
  }
  return { status: "ok", sha256: r.sha256, value: r.value as Record<string, unknown> };
}

function findMissingHandoffBinding(record: HandoffRecord): string | null {
  if (typeof record.queryId !== "number") return `handoff record missing binding "queryId"`;
  if (typeof record.attemptId !== "string" || record.attemptId.length === 0) {
    return `handoff record missing binding "attemptId"`;
  }
  if (typeof record.definitionHash !== "string" || record.definitionHash.length === 0) {
    return `handoff record missing binding "definitionHash"`;
  }
  if (typeof record.kbRevision !== "string" || record.kbRevision.length === 0) {
    return `handoff record missing binding "kbRevision"`;
  }
  return null;
}

/**
 * D-08's verify-at-read half of the hash-at-handoff/verify-at-read contract.
 * Exported directly for unit testing: `record-absent`, `record-corrupt` and
 * `hash-mismatch` cannot be driven through the full `runCollaborativeBattery`
 * pipeline (the hash-at-handoff and verify-at-read loops run synchronously,
 * back to back, in the same tick -- there is no interleave point for a test
 * to inject a stale or missing record between them), mirroring how
 * `collaborative-scoring-bridge.ts` unit-tests `validatePredDict` directly
 * rather than only through `scorePrediction`.
 */
export function verifyHandoffAtRead(
  queryId: number,
  record: HandoffRecord | undefined,
): HandoffOutcome {
  if (!record) {
    return { kind: "record-absent", queryId };
  }
  const missing = findMissingHandoffBinding(record);
  if (missing) {
    return { kind: "record-corrupt", violation: missing };
  }
  const read = readSubgraphArtifact(record.artifactPath);
  if (read.status === "absent") {
    return { kind: "artifact-absent", path: record.artifactPath };
  }
  if (read.status === "unparseable") {
    return { kind: "unparseable", reason: read.reason, path: record.artifactPath };
  }
  if (read.sha256 !== record.artifactSha256) {
    return { kind: "hash-mismatch", recordedSha256: record.artifactSha256, observedSha256: read.sha256 };
  }
  const schemaResult = parseSubgraphArtifact(read.value);
  if (!schemaResult.ok) {
    return { kind: "schema-invalid", violation: schemaResult.violation };
  }
  return { kind: "success", artifact: schemaResult.artifact };
}

// ── D-07: CD-05 structural bounds ───────────────────────────────────────

/** Panel-tested structural bounds (D-07). Phase 23 may tune these -- they
 *  are exported constants, not inlined literals, precisely so a later phase
 *  can retune without touching the validator's logic. */
export const MIN_SUBGRAPH_NODES = 3;
export const MAX_SUBGRAPH_NODES = 200;

export type Cd05Result = { ok: true } | { ok: false; violation: Cd05Violation };

/**
 * CD-05's three structural bounds, each independently named (D-07), checked
 * in this fixed order -- never one compound boolean, so a Phase 23 report
 * can tell "too few nodes" from "too many" from "not connected" from
 * "outside the query's own neighbourhood":
 *
 *   1. Node count -- below `MIN_SUBGRAPH_NODES` and above
 *      `MAX_SUBGRAPH_NODES` are two distinct named conditions.
 *   2. Connectivity -- derived from the artifact's own edges, treated as
 *      UNDIRECTED (FA-5): a subgraph whose edges all point away from one
 *      node is still one connected neighbourhood. Walked from the first
 *      listed node; every other listed node must be reachable.
 *   3. Neighbourhood membership -- every listed node id must be a member of
 *      the `KbNeighborhood` the runner passed to the builder for this
 *      query, never the artifact's own self-consistency. This is what makes
 *      "query-linked" checkable offline (T-22-12).
 */
export function validateSubgraphAgainstNeighborhood(
  artifact: SubgraphArtifactV1,
  neighborhood: KbNeighborhood,
): Cd05Result {
  const nodeCount = artifact.nodes.length;
  if (nodeCount < MIN_SUBGRAPH_NODES) {
    return { ok: false, violation: { condition: "below-minimum", nodeCount } };
  }
  if (nodeCount > MAX_SUBGRAPH_NODES) {
    return { ok: false, violation: { condition: "above-maximum", nodeCount } };
  }

  const adjacency = new Map<number, Set<number>>();
  for (const id of artifact.nodes) adjacency.set(id, new Set());
  for (const [src, dst] of artifact.edges) {
    adjacency.get(src)?.add(dst);
    adjacency.get(dst)?.add(src);
  }
  const startId = artifact.nodes[0]!;
  const visited = new Set<number>([startId]);
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
  }
  const unreachable = artifact.nodes.find((id) => !visited.has(id));
  if (unreachable !== undefined) {
    return { ok: false, violation: { condition: "disconnected", unreachableNodeId: unreachable } };
  }

  const neighborhoodIds = new Set(neighborhood.nodes.map((n) => n.id));
  const outside = artifact.nodes.find((id) => !neighborhoodIds.has(id));
  if (outside !== undefined) {
    return { ok: false, violation: { condition: "outside-neighborhood", nodeId: outside } };
  }

  return { ok: true };
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
  /** The named, fail-closed outcome (D-03/D-08): `"success"` when the
   *  bridge scored the task, one of the eight failure kinds otherwise. */
  handoffOutcome: HandoffOutcome;
  /** Present only when the task actually reached the bridge -- a task that
   *  fails at handoff is never sent to `scorePrediction` (D-03), so it never
   *  gets an attempt. */
  attempt?: ScoringAttempt;
  /** hit@1 when the bridge scored the attempt, 0 otherwise -- including
   *  every handoff failure and every non-"scored" bridge outcome. */
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
  /**
   * Additive testability seam (Rule 3, same precedent as `readFileFn`/
   * `hubCacheRoot` above): `runScoringPreflight`'s own warm-up call mints a
   * fresh, nonce'd `ScoringAttempt` on every invocation, so there is no way
   * for a test to independently reconstruct the SAME object and assert
   * `Object.is` identity against it without wrapping the call site itself.
   * Absent, this behaves exactly as the plan's pinned signature describes:
   * the module calls the real `runScoringPreflight` directly.
   */
  preflightFn?: typeof runScoringPreflight;
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
 * One collaborative candidate pair, end to end, offline: a zero-task refusal,
 * preflight, builder pass, hash-at-handoff, verify-at-read, answerer pass,
 * bridge scoring, and the D-09 adapter fitness. A per-task handoff or
 * scoring failure is a named, continuable `HandoffOutcome` (D-03) -- it
 * costs that task hit@1 of zero and the run continues; it never aborts the
 * battery. A preflight failure is different in kind (D-11): it is not one
 * query's problem, so it propagates out unchanged rather than becoming a
 * per-task outcome.
 *
 * Preflight cadence (D-11): called exactly ONCE per battery run, before the
 * builder battery is minted and before any provider call -- never once per
 * query. This answers the open question Phase 21's own `runScoringPreflight`
 * doc comment left to this module: a fingerprint check per query would spend
 * a subprocess per task for evidence that cannot change mid-run, so the cost
 * is paid once, up front, before anything else is spent.
 */
export async function runCollaborativeBattery(
  args: RunCollaborativeBatteryArgs,
): Promise<CollaborativeRunRecord> {
  // 0. Refuse a zero-task run BEFORE the preflight is even called -- an
  // empty run would otherwise report a vacuous perfect or zero score, and
  // this is cheaper here than discovering a division by zero in the
  // adapter's own mean (mirrors `makeBattery`'s zero-task refusal one
  // altitude up, `battery-types.ts`).
  if (args.tasks.length === 0) {
    throw new CollaborativeRunnerError(
      `runCollaborativeBattery refused: tasks is empty (0 tasks) -- an empty run would report a vacuous score`,
    );
  }

  // 1. Preflight once (D-11), before any provider call and before the
  // builder battery is minted.
  const preflightArgs = {
    fingerprintManifest: args.fingerprintManifest,
    poolManifest: args.poolManifest,
    outputDir: args.scoringOutputDir,
    warmUp: args.warmUp,
    ...(args.execFn ? { execFn: args.execFn } : {}),
    ...(args.readFileFn ? { readFileFn: args.readFileFn } : {}),
    ...(args.hubCacheRoot ? { hubCacheRoot: args.hubCacheRoot } : {}),
  };
  const preflight = args.preflightFn ? args.preflightFn(preflightArgs) : runScoringPreflight(preflightArgs);

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

  // 4. Hash at handoff -- the runner hashes, never the builder. A task whose
  // artifact is absent, unparseable, or schema-invalid gets its outcome
  // recorded here and never proceeds to verify-at-read or the answerer pass
  // (D-03: no scoring call is ever made for a structurally invalid subgraph).
  const handoffRecordByTaskId = new Map<string, HandoffRecord>();
  const failedOutcomeByTaskId = new Map<string, HandoffOutcome>();

  for (const task of args.tasks) {
    const artifactPath = join(builderArtifactDir, task.id, SUBGRAPH_ARTIFACT_REL_PATH);
    const read = readSubgraphArtifact(artifactPath);
    if (read.status === "absent") {
      failedOutcomeByTaskId.set(task.id, { kind: "artifact-absent", path: artifactPath });
      continue;
    }
    if (read.status === "unparseable") {
      failedOutcomeByTaskId.set(task.id, { kind: "unparseable", reason: read.reason, path: artifactPath });
      continue;
    }
    const schemaResult = parseSubgraphArtifact(read.value);
    if (!schemaResult.ok) {
      failedOutcomeByTaskId.set(task.id, { kind: "schema-invalid", violation: schemaResult.violation });
      continue;
    }
    // CD-05 (D-07): checked immediately after schema validation, before any
    // answerer prompt is composed from the artifact.
    const cd05 = validateSubgraphAgainstNeighborhood(schemaResult.artifact, neighbourhoodByTask.get(task.id)!);
    if (!cd05.ok) {
      failedOutcomeByTaskId.set(task.id, { kind: "cd05-violation", violation: cd05.violation });
      continue;
    }
    handoffRecordByTaskId.set(task.id, {
      queryId: task.queryId,
      attemptId: randomUUID(),
      definitionHash: args.candidate.id,
      kbRevision: schemaResult.artifact.kbRevision,
      artifactPath,
      artifactSha256: read.sha256,
    });
  }

  // 5. Verify at read, then render the answerer's prompt from verified ids
  // joined against the SAME pre-extracted neighbourhood (D-06). Only tasks
  // that survived step 4 are attempted here -- a task already failed never
  // reaches verify-at-read, let alone the answerer pass or the bridge.
  const answererPromptByTask = new Map<string, string>();
  const verifiedArtifactByTask = new Map<string, SubgraphArtifactV1>();
  for (const task of args.tasks) {
    if (failedOutcomeByTaskId.has(task.id)) continue;
    const verify = verifyHandoffAtRead(task.queryId, handoffRecordByTaskId.get(task.id));
    if (verify.kind !== "success") {
      failedOutcomeByTaskId.set(task.id, verify);
      continue;
    }
    verifiedArtifactByTask.set(task.id, verify.artifact);
    answererPromptByTask.set(
      task.id,
      buildAnswererTaskPrompt(task, verify.artifact, neighbourhoodByTask.get(task.id)!),
    );
  }

  const survivingTasks = args.tasks.filter((task) => !failedOutcomeByTaskId.has(task.id));

  const answererTasks: BatteryTask[] = survivingTasks.map((task) => ({
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
  // eval gate (checkpoint decision 3a). NOTE: if every task fails at
  // handoff, `survivingTasks` is empty and `makeBattery` itself refuses a
  // zero-task battery (`battery-types.ts`) -- a documented boundary this
  // plan does not build machinery around, since a wholly-failed run has
  // nothing left to score or select on.
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

  // 7/8/9. Ranked list -> predDict (CD-01) -> bridge score -> outcome. Tasks
  // that already failed at handoff are recorded here too, with hit1 = 0 and
  // no attempt -- the run's own outcome count still includes them (D-03's
  // denominator cannot be gamed by failing more handoffs).
  const attempts: ScoringAttempt[] = [];
  const outcomes: CollaborativeTaskOutcome[] = [];
  const handoffRecords: HandoffRecord[] = [];
  for (const task of args.tasks) {
    const failedOutcome = failedOutcomeByTaskId.get(task.id);
    if (failedOutcome) {
      outcomes.push({ queryId: task.queryId, handoffOutcome: failedOutcome, hit1: 0, diagnostics: {} });
      continue;
    }
    const handoffRecord = handoffRecordByTaskId.get(task.id)!;
    handoffRecords.push(handoffRecord);

    const answerPath = join(answererArtifactDir, task.id, ANSWER_ARTIFACT_REL_PATH);
    let rawList: unknown[] = [];
    const answerRead = readJsonArtifact(answerPath);
    if (answerRead.status === "ok" && Array.isArray(answerRead.value)) {
      rawList = answerRead.value;
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
    const attemptOutcome = attempt.outcome;
    const scored = attemptOutcome.outcome === "scored";
    const hit1 = attemptOutcome.outcome === "scored" ? (attemptOutcome.metrics["hit@1"] ?? 0) : 0;
    const diagnostics = attemptOutcome.outcome === "scored" ? attemptOutcome.metrics : {};
    const handoffOutcome: HandoffOutcome = scored
      ? { kind: "success", artifact: verifiedArtifactByTask.get(task.id)! }
      : { kind: "bridge-non-success", scoringOutcomeKind: attemptOutcome.outcome };
    outcomes.push({ queryId: task.queryId, handoffOutcome, attempt, hit1, diagnostics });
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
