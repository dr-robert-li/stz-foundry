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
  resolveProviderSelection,
  DEFAULT_BATTERY_MODEL,
  type CandidateAgent,
  type BatteryRun,
  type ProviderSelection,
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

/**
 * The ONE spelling of FA-7's empty-seed refusal, used at BOTH ends of the
 * only narrow match this module makes on its own error text: the violation
 * string `parseNeighborhoodStdout` builds when the helper returns zero
 * seeds, and `isNeighbourhoodSeedRefusal`'s test for that exact condition.
 * A single constant so the two cannot drift -- rewording the message
 * without touching the matcher would otherwise silently turn every
 * empty-seed refusal back into a round-killing crash (T-23-08).
 */
export const NEIGHBOURHOOD_EMPTY_SEED_MARKER = "found no seed entity for this query";

/**
 * True for exactly ONE condition: a `kbNeighborhoodFn` dispatch that
 * refused because the KB helper matched no seed entity for the query text
 * (FA-7). Deliberately NARROWER than the driver-side `"kbNeighborhoodFn:"`
 * prefix catch one altitude up (`_collab-round.ts`'s `runOneUnit`): a
 * timeout, an ENOBUFS overrun, a signal kill, an unreachable process, a
 * non-zero exit and any other malformed-output violation are ENVIRONMENT
 * faults, not this query's problem, and stay hard errors that abort the
 * battery. The empty-seed refusal is different in kind -- it is a property
 * of the query text itself, deterministic across every retry, and is
 * therefore this one task's miss (COLLAB-DESIGN.md §7's
 * misses-for-non-completions rule).
 */
function isNeighbourhoodSeedRefusal(e: unknown): boolean {
  return (
    e instanceof CollaborativeRunnerError &&
    e.message.includes("kbNeighborhoodFn:") &&
    e.message.includes(NEIGHBOURHOOD_EMPTY_SEED_MARKER)
  );
}

/** T-23-XX (Phase 23 Plan 06 continuation): Node's `spawnSync` default
 *  `maxBuffer` is 1 MiB. A live query measured against the pinned model
 *  (query 1528, 2-hop/400-node cap) serialises 2,168,562 bytes of
 *  neighbourhood JSON on stdout -- well over that default. Exceeding
 *  `maxBuffer` kills the child (default signal SIGTERM) and sets
 *  `error.code === "ENOBUFS"`, which -- unclassified -- fell into the
 *  branch below reading `result.signal !== null` and was misreported as a
 *  generic "killed by signal SIGTERM", indistinguishable from an external
 *  kill (this is exactly what stalled the probe's resume: every relaunch
 *  died identically on query 1528, a query with a large but entirely valid
 *  neighbourhood). 64 MiB leaves >29x headroom over the measured worst case. */
export const NEIGHBORHOOD_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

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
        `the helper ${NEIGHBOURHOOD_EMPTY_SEED_MARKER} -- ${reason} (an empty seed set is a refusal, ` +
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
      maxBuffer: NEIGHBORHOOD_MAX_BUFFER_BYTES,
    });

    // SAME branch order as scorePrediction (T-22-19): timeout, signal,
    // spawn error, non-zero exit, only THEN a stdout parse -- never
    // reordered, never a second idiom for a second dispatch site. ENOBUFS
    // is checked immediately after ETIMEDOUT and before the generic signal
    // branch for the identical reason ETIMEDOUT is checked first: a
    // maxBuffer overrun ALSO sets `result.signal` (the child is killed), so
    // an unclassified signal check would misreport it as a bare "killed by
    // signal" with no indication the real cause was an output cap.
    const errorCode = result.error !== undefined ? (result.error as NodeJS.ErrnoException).code : undefined;
    if (errorCode === "ETIMEDOUT") {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} timed out after ${timeoutMs}ms`,
      );
    }
    if (errorCode === "ENOBUFS") {
      throw new CollaborativeRunnerError(
        `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} exceeded the ${NEIGHBORHOOD_MAX_BUFFER_BYTES}-byte stdout buffer cap -- ` +
          `the neighbourhood is larger than this cap allows, not a harness fault or an external kill`,
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

/**
 * D-05's canonical handoff hash: sha256 over exactly the canonical bytes
 * above. Recorded on every `HandoffRecord` as `canonicalSha256` (WR-05), for
 * replay and audit -- two byte-different but semantically identical
 * submissions produce the SAME `canonicalSha256`, which is what makes it
 * useful for comparing artifacts across differently-ordered serializations.
 *
 * This is NOT the digest verified at read or at promotion. That digest is
 * `HandoffRecord.artifactSha256` -- the raw-bytes sha256 of the artifact
 * exactly as the builder wrote it to disk, computed inside `readJsonArtifact`
 * and re-verified at both `verifyHandoffAtRead` and
 * `promoteWinnerSubgraphs`' destination-side copy check (T-22-13). Only a
 * raw digest can prove a byte-for-byte copy survived transit; a canonicalized
 * digest is equal across differently-serialized inputs BY CONSTRUCTION,
 * which is exactly what makes it the wrong tool for that proof. Do not
 * conflate the two, and do not repoint either verify site at this function.
 */
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
 * relation id, an edge triple of the wrong length, an edge referencing
 * a node id absent from the artifact's own node list, a `nodes` array
 * containing a repeated id (CR-01a -- a duplicate would otherwise let a
 * padded artifact clear `MIN_SUBGRAPH_NODES`'s raw-length count downstream),
 * a repeated `[src, dst, rel]` edge triple, and an edge list longer than
 * `MAX_SUBGRAPH_EDGES` (CR-01b). Unknown keys are never stripped and never
 * tolerated -- rejected, naming the offending key.
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
  const nodeIds = obj.nodes as number[];
  // CR-01a/T-22-12: reject a padded node list here, before any count is
  // taken downstream -- MIN_SUBGRAPH_NODES is compared against a node COUNT
  // in validateSubgraphAgainstNeighborhood, and a raw array length counts a
  // repeated id once per repeat, letting a below-minimum subgraph pad past
  // the bound. The Set built here is reused for the edge-endpoint
  // membership loop below -- one construction, two uses.
  const nodeIdSet = new Set(nodeIds);
  if (nodeIdSet.size !== nodeIds.length) {
    return { ok: false, violation: `field "nodes" contains one or more duplicate node ids` };
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
  const edges = obj.edges as [number, number, number][];
  // CR-01b: the cap is checked first, so a pathological list is refused
  // before the duplicate-triple scan below (or the endpoint loop further
  // down) ever walks it. Once the fourth CD-05 check (fabricated-edge)
  // ships, artifact edges are also bounded by |neighborhood.edges| -- but
  // that neighbourhood context is not available here, which is exactly why
  // this cap belongs at the schema layer: cheap and exhaustive on an
  // ids-only structure, holding even for a caller that skips CD-05.
  if (edges.length > MAX_SUBGRAPH_EDGES) {
    return {
      ok: false,
      violation: `field "edges" has ${edges.length} entries, exceeding the cap of ${MAX_SUBGRAPH_EDGES}`,
    };
  }
  const edgeKeySet = new Set<string>();
  for (const [src, dst, rel] of edges) {
    const key = `${src}|${dst}|${rel}`;
    if (edgeKeySet.has(key)) {
      return { ok: false, violation: `field "edges" contains a duplicate triple [${src}, ${dst}, ${rel}]` };
    }
    edgeKeySet.add(key);
  }
  for (let i = 0; i < edges.length; i++) {
    const [src, dst] = edges[i] as [number, number, number];
    if (!nodeIdSet.has(src)) {
      return {
        ok: false,
        violation: `edge at position ${i} references source node id ${src} absent from the artifact's own node list`,
      };
    }
    if (!nodeIdSet.has(dst)) {
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
  /** D-05's canonical handoff hash (WR-05) -- NOT the digest verified at
   *  read or promotion (that stays `artifactSha256`, the raw on-disk bytes).
   *  See `hashSubgraphArtifact`'s doc comment for the full distinction. */
  canonicalSha256: string;
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
  | { condition: "outside-neighborhood"; nodeId: number }
  | { condition: "fabricated-edge"; src: number; dst: number; relationId: number };

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
  | { kind: "artifact-unreadable"; path: string; code: string }
  | { kind: "unparseable"; reason: "not-json" | "not-object"; path: string }
  | { kind: "schema-invalid"; violation: string }
  | { kind: "record-absent"; queryId: number }
  | { kind: "record-corrupt"; violation: string }
  | { kind: "hash-mismatch"; recordedSha256: string; observedSha256: string }
  | { kind: "cd05-violation"; violation: Cd05Violation }
  /**
   * T-23-08: the graph arm's neighbourhood could not be extracted for this
   * query because the KB helper matched no seed entity (FA-7). Recorded
   * BEFORE any builder call is made, so the task never reaches the builder,
   * the handoff, or the bridge -- it costs this query hit@1 of zero and the
   * battery continues with the rest. Only the empty-seed refusal lands here
   * (`isNeighbourhoodSeedRefusal`); every other `kbNeighborhoodFn` failure
   * mode is an environment fault and still aborts the battery.
   */
  | { kind: "neighbourhood-refused"; queryId: number; reason: string }
  /**
   * Phase 23-08 fix: this task's builder (or answerer) prompt exceeded the
   * hard budget that keeps every prompt under ollama's silent-truncation
   * limit (`truncating input prompt limit=65538` -- the model keeps the
   * first 4 tokens + the last 65,534, dropping the task prompt itself and
   * recording garbage as a valid outcome). Recorded as THIS query's miss,
   * never a battery crash, exactly like `"neighbourhood-refused"` above --
   * the tripwire fires either on the pre-dispatch character budget
   * (`BUILDER_PROMPT_MAX_CHARS`) or on the provider-reported
   * `prompt_tokens` (`PROMPT_TOKENS_TRUNCATION_LIMIT`).
   */
  | { kind: "builder-prompt-over-budget"; queryId: number; reason: string }
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
  "artifact-unreadable": true,
  unparseable: true,
  "schema-invalid": true,
  "record-absent": true,
  "record-corrupt": true,
  "hash-mismatch": true,
  "cd05-violation": true,
  "neighbourhood-refused": true,
  "builder-prompt-over-budget": true,
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
    case "fabricated-edge":
      return `edge ${v.src} -> ${v.dst} (relation ${v.relationId}) is not a relation the neighborhood records between those two nodes`;
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
    case "artifact-unreadable":
      return `fail-closed: artifact at ${outcome.path} could not be read (errno ${outcome.code})`;
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
    case "neighbourhood-refused":
      return `fail-closed: no KB neighbourhood for query ${outcome.queryId} -- ${outcome.reason}`;
    case "builder-prompt-over-budget":
      return `fail-closed: prompt over budget for query ${outcome.queryId} -- ${outcome.reason}`;
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
  | { status: "unreadable"; code: string }
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
 *
 * WR-04: the catch classifies by errno rather than folding every failure
 * into "absent". A genuinely missing path (ENOENT) is the only case that
 * reports absence; anything else (a permissions error, the path resolving
 * to a directory, a symlink loop, ...) is a real, distinct infrastructure
 * problem and is reported as such -- fail-closed behaviour is unchanged
 * (the caller still treats it as a per-task failure, D-03), only the
 * diagnostic changes from false to true.
 */
function readJsonArtifact(path: string): ReadJsonResult {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { status: "absent" };
    return { status: "unreadable", code: code ?? "unknown" };
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
  | { status: "unreadable"; code: string }
  | { status: "unparseable"; reason: "not-json" | "not-object" }
  | { status: "ok"; sha256: string; value: Record<string, unknown> };

function readSubgraphArtifact(path: string): ReadSubgraphResult {
  const r = readJsonArtifact(path);
  if (r.status === "absent") return { status: "absent" };
  if (r.status === "unreadable") return { status: "unreadable", code: r.code };
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
  if (typeof record.canonicalSha256 !== "string" || record.canonicalSha256.length === 0) {
    return `handoff record missing binding "canonicalSha256"`;
  }
  return null;
}

/**
 * D-08's verify-at-read half of the hash-at-handoff/verify-at-read contract.
 * WR-01/WR-02: this function VALIDATES the identifiers it is given rather
 * than echoing them -- both the caller-supplied `queryId` against the
 * record's own binding, and (once the artifact parses) the artifact's own
 * `queryId` field against the same requested value. No `success` outcome
 * can carry a mismatch on either binding.
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
  // WR-02: the record's OWN queryId binding is validated against the
  // requested one, not merely echoed back -- run AFTER the missing-binding
  // check above (so a record that is both mis-keyed and missing a binding
  // still reports the missing binding, preserving that test's meaning) and
  // BEFORE the read.
  if (record.queryId !== queryId) {
    return {
      kind: "record-corrupt",
      violation: `handoff record queryId (${record.queryId}) does not match the requested queryId (${queryId})`,
    };
  }
  const read = readSubgraphArtifact(record.artifactPath);
  if (read.status === "absent") {
    return { kind: "artifact-absent", path: record.artifactPath };
  }
  if (read.status === "unreadable") {
    return { kind: "artifact-unreadable", path: record.artifactPath, code: read.code };
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
  // WR-01: the artifact's OWN queryId field (builder-controlled, only
  // typeof-checked so far) is cross-checked against the requested queryId
  // here, the choke point every surviving task passes through before an
  // answerer prompt is composed -- no `success` outcome can carry an
  // artifact built for a different query.
  if (schemaResult.artifact.queryId !== queryId) {
    return {
      kind: "schema-invalid",
      violation: `field "queryId" (${schemaResult.artifact.queryId}) does not match the requested queryId (${queryId})`,
    };
  }
  return { kind: "success", artifact: schemaResult.artifact };
}

// ── D-07: CD-05 structural bounds ───────────────────────────────────────

/** Panel-tested structural bounds (D-07). Phase 23 may tune these -- they
 *  are exported constants, not inlined literals, precisely so a later phase
 *  can retune without touching the validator's logic. */
export const MIN_SUBGRAPH_NODES = 3;
export const MAX_SUBGRAPH_NODES = 200;

/** CR-01b's schema-layer edge-list bound (checked in `parseSubgraphArtifact`,
 *  which has no neighbourhood context -- exactly why the cap lives there:
 *  a context-free, cheap, exhaustive bound on an ids-only structure, holding
 *  even for a caller that validates schema without ever running CD-05. A
 *  connected subgraph at `MAX_SUBGRAPH_NODES` (200) needs at least 199 edges
 *  and would realistically carry a few hundred, so 2000 is an order of
 *  magnitude of headroom over any legitimate submission while bounding the
 *  answerer's rendered prompt. Exported, not inlined -- same posture as the
 *  node bounds above, so Phase 23 can retune without touching validator
 *  logic. Once the fourth CD-05 check ships, the true bound in practice is
 *  |neighborhood.edges| -- but that neighbourhood is itself capped at 400
 *  nodes, whose induced edge set can still be large in a dense KB region, so
 *  this schema-layer cap earns its place independently. */
export const MAX_SUBGRAPH_EDGES = 2000;

export type Cd05Result = { ok: true } | { ok: false; violation: Cd05Violation };

/**
 * CD-05's four structural bounds, each independently named (D-07), checked
 * in this fixed order -- never one compound boolean, so a Phase 23 report
 * can tell "too few nodes" from "too many" from "not connected" from
 * "outside the query's own neighbourhood" from "a relation the KB never
 * recorded":
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
 *   4. Edge authenticity (CR-02, checked AFTER membership -- FA-D) -- every
 *      artifact edge must correspond to a real triple in
 *      `neighborhood.edges`, the KB's own induced edges the runner already
 *      holds. Two verified, in-neighbourhood node ids joined by a relation
 *      the KB never recorded between them is refused by name, never
 *      accepted on node-identity alone. Compared UNDIRECTED (FA-E,
 *      mirroring check 2's own posture): the live neighbourhood helper
 *      emits both orientations of its edge tensor, and an artifact listing
 *      the opposite orientation of a real triple is not a fabrication.
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

  // CR-02/T-22-12 (check 4, FA-D -- runs only after node identity is fully
  // verified above): the neighbourhood's own induced edges are the KB's
  // ground truth, already held by the runner, and were sitting unused two
  // fields from the check that needed them. Keyed both orientations (FA-E)
  // so an artifact edge in the opposite orientation to a real triple is not
  // treated as fabricated.
  const realEdgeKeys = new Set<string>();
  for (const [src, dst, rel] of neighborhood.edges) {
    realEdgeKeys.add(`${src}|${dst}|${rel}`);
    realEdgeKeys.add(`${dst}|${src}|${rel}`);
  }
  for (const [src, dst, rel] of artifact.edges) {
    if (!realEdgeKeys.has(`${src}|${dst}|${rel}`)) {
      return { ok: false, violation: { condition: "fabricated-edge", src, dst, relationId: rel } };
    }
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

/**
 * D-05: the two arms `runCollaborativeBattery` can run. `"graph"` is the
 * default and is byte-compatible with Phase 22's shipped behaviour --
 * builder pass, neighbourhood extraction, hash-at-handoff and
 * verify-at-read all run as before. `"no-subgraph"` is §7's pre-registered
 * null control: the builder pass, every neighbourhood-extraction call and
 * the handoff steps are skipped entirely, and the SAME exported
 * `buildAnswererTaskPrompt` renders the answerer prompt from an empty
 * synthetic artifact and an empty synthetic neighbourhood, so equal
 * treatment between the two arms holds by construction -- one code path,
 * never two.
 */
export type CollaborativeArm = "graph" | "no-subgraph";

export interface CollaborativeTaskOutcome {
  queryId: number;
  /** The named, fail-closed outcome (D-03/D-08): `"success"` when the
   *  bridge scored the task, one of the named failure kinds otherwise. */
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
  /** Absent when no builder pass happened -- the no-subgraph condition
   *  (D-05), or (T-23-08) a graph run in which EVERY task's neighbourhood
   *  refused, leaving nothing to build from. A run that did not happen is
   *  never fabricated into the record. Present for any graph run that made
   *  at least one builder call. */
  builderBattery?: AgentBattery;
  answererBattery: AgentBattery;
  /** Absent exactly when the run used the no-subgraph condition (D-05) --
   *  see `builderBattery`'s doc comment above; the two fields are absent or
   *  present together. */
  builderRun?: BatteryRun;
  /** The driver's own answerer result -- diagnostics only (D-09 Pitfall 1).
   *  When `answererBatterySkipped` is present this run was never dispatched:
   *  its `tasks` and `records` are empty and its `result` is the honest zero. */
  answererRun: BatteryRun;
  /**
   * T-23-08: present exactly when every task failed at handoff, so no
   * answerer pass was dispatched at all. `answererBattery` is still a real,
   * receipt-rooted mint (the shell reads `answererBattery.receipt` on the
   * promotion path, and `promoteComponentWinner`'s seal gate reads its task
   * ids), but nothing in this record claims a provider call that never
   * happened: `attempts` is empty, `handoffRecords` is empty, and every
   * entry in `outcomes` carries its own named failure kind with hit@1 of 0.
   */
  answererBatterySkipped?: { reason: "all-handoffs-failed" };
  /** The adapter fitness handed to selection/promotion (D-09). */
  fitnessRun: BatteryRun;
  attempts: ScoringAttempt[];
  outcomes: CollaborativeTaskOutcome[];
  /** Empty under the no-subgraph condition (D-05) -- no handoff occurred,
   *  so no `HandoffRecord` is fabricated for it; populated under the graph
   *  condition exactly as before. */
  handoffRecords: HandoffRecord[];
  preflight: PreflightReport;
}

export interface RunCollaborativeBatteryArgs {
  candidate: CollaborativeCandidate;
  tasks: CollaborativeBatteryTask[];
  batteryIdPrefix: string;
  receipt: OracleReceipt;
  gateThreshold: number;
  /** D-05: which arm this run takes. Defaults to `"graph"`, byte-compatible
   *  with Phase 22's shipped behaviour -- omitting this field or passing
   *  `"graph"` explicitly produce identical behaviour. */
  arm?: CollaborativeArm;
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

/** The placeholder prompt on a skipped answerer battery's tasks (T-23-08).
 *  Never sent to a provider -- `makeBattery` refuses an empty prompt, and a
 *  battery that is minted but never dispatched still has to be a valid one. */
const SKIPPED_ANSWERER_PROMPT =
  "(no answerer pass was dispatched for this task -- every handoff in this run failed structurally)";

/**
 * The `BatteryRun` for an answerer pass that was SKIPPED, not run (T-23-08).
 * `tasks` and `records` are empty because no task was dispatched and no
 * specimen record exists -- a run that did not happen is never fabricated
 * into results. `provider` and `bounds` mirror `runAgentBattery`'s own
 * REPORTED (never probed) resolution of the same options object, so the
 * record says which provider this pass would have used rather than
 * inventing one; `resolveProviderSelection` is a pure function of the
 * caller's own config. `result` is the honest zero: nothing passed, so the
 * gate is not cleared.
 */
function skippedAnswererRun(
  specimen: SpecimenId,
  battery: AgentBattery,
  runOpts: RunBatteryOptions | undefined,
): BatteryRun {
  const impl = runOpts?.providerImpl;
  const provider: ProviderSelection = impl
    ? {
        kind: impl.kind,
        baseUrl: impl.baseUrl,
        model: runOpts?.provider?.model ?? DEFAULT_BATTERY_MODEL,
        source: "explicit",
      }
    : resolveProviderSelection(runOpts?.provider);
  return {
    result: {
      specimen,
      passedGate: false,
      testPassRate: 0,
      coverage: 0,
      mutationScore: 0,
      codeHealth: 0,
      hackFindings: [],
    },
    receipt: battery.receipt,
    provider,
    tasks: [],
    records: [],
    bounds: {
      concurrency: runOpts?.concurrency ?? 1,
      taskTimeoutMs: runOpts?.taskTimeoutMs,
      deadlineMs: runOpts?.deadlineMs,
    },
    cost: undefined,
  };
}

/**
 * IN-03: `task.id` is joined into artifact paths below and must be guarded
 * before any join happens -- the same discipline
 * `collaborative-tournament-shell.ts`'s `promoteWinnerSubgraphs` applies to
 * `winnerVariantId`/`slot` via `assertSafePathSegment`. That shared helper
 * is deliberately NOT imported here, for two independent reasons verified
 * during planning (FA-B):
 *   1. the real pool mints ids as `stark-prime:${query_id}`
 *      (`collaborative-battery.ts`) -- a colon, which
 *      `assertSafePathSegment`'s `[A-Za-z0-9_-]+` character class rejects.
 *      Applying that shared regex verbatim would refuse every real task.
 *   2. importing it would add `../taxonomy.js` to this module's direct
 *      imports, failing `PINNED_RUNNER_IMPORT_ALLOWLIST`'s exact-equality
 *      assertion -- and `taxonomy.ts` itself imports `node:fs/promises`
 *      write APIs, which SC-1's absent-write-capability claim cannot admit
 *      into this module's import set even transitively.
 * So: a module-local, anchored regex admitting the repo's own id vocabulary
 * (alphanumerics, underscore, hyphen, colon) -- no dot, so a
 * parent-directory traversal sequence cannot be spelled at all.
 */
const SAFE_TASK_ID_RE = /^[A-Za-z0-9_:-]+$/;

function assertSafeTaskId(id: string): void {
  if (!SAFE_TASK_ID_RE.test(id)) {
    throw new CollaborativeRunnerError(
      `runCollaborativeBattery refused: task id ${JSON.stringify(id)} is not a safe path segment (expected ${SAFE_TASK_ID_RE})`,
    );
  }
}

/** Phase 23-08 fix: the neighbourhood's induced edge list is unbounded
 *  (a 2-hop/400-node neighbourhood has been measured at >2 MiB of JSON)
 *  and a prompt over ~65k tokens is silently tail-truncated by ollama,
 *  dropping the task prompt itself. Render at most this many edges.
 *  Must stay >= MAX_SUBGRAPH_EDGES (2000): the builder may legitimately
 *  submit up to that many edges, every one "taken from the neighbourhood
 *  above", so the rendered list must be able to show them all. */
export const NEIGHBORHOOD_MAX_RENDERED_EDGES = 2000;

/** Phase 23-08 fix, the hard tripwire behind the render cap above: a
 *  builder prompt must stay under this many characters before it is ever
 *  dispatched. At ~3 chars/token for id-heavy text this is ~60k tokens,
 *  under ollama's 65,538 truncation limit with margin; the normal capped
 *  render is ~120k chars, so this asserts, it does not govern. A breach
 *  records a `"builder-prompt-over-budget"` per-task miss -- never a
 *  thrown battery (the "crash at query 1384" lesson, T-23-08). */
export const BUILDER_PROMPT_MAX_CHARS = 180_000;

/** Phase 23-08 point 4, the post-hoc tripwire behind the character budget:
 *  ollama silently truncates any prompt at 65,538 tokens (first 4 + last
 *  65,534 kept), so a provider-reported `prompt_tokens` at or above this
 *  limit means the model never saw the whole prompt and the call's output
 *  is untrusted -- recorded as a `"builder-prompt-over-budget"` per-task
 *  miss. Catches tokenizer drift the char budget cannot see. */
export const PROMPT_TOKENS_TRUNCATION_LIMIT = 65_000;

/**
 * Phase 23-08 render cap: edges incident to a seed node first (in the
 * helper's own canonical order, which sorts by node id), then the
 * remaining edges in that same order, truncated to
 * `NEIGHBORHOOD_MAX_RENDERED_EDGES`. Seed-first because a plain prefix of
 * the id-sorted list would bias toward low node ids and could drop every
 * seed-incident edge. Deterministic and replayable: same neighbourhood in,
 * same rendered lines out. ONLY the rendering is capped -- the
 * `KbNeighborhood` object itself is untouched, so `verifySubgraphArtifact`
 * still verifies against the FULL induced edge set (a builder that emits a
 * real-but-unrendered edge is not falsely rejected).
 */
export function renderNeighbourhoodLines(nb: KbNeighborhood): string {
  const nodeLines = nb.nodes
    .map((n) => `  - id=${n.id} label=${JSON.stringify(n.label)} type=${JSON.stringify(n.type)}`)
    .join("\n");
  let renderedEdges = nb.edges;
  let truncationNote = "";
  if (nb.edges.length > NEIGHBORHOOD_MAX_RENDERED_EDGES) {
    const seeds = new Set(nb.seeds);
    const seedIncident: [number, number, number][] = [];
    const rest: [number, number, number][] = [];
    for (const e of nb.edges) (seeds.has(e[0]) || seeds.has(e[1]) ? seedIncident : rest).push(e);
    renderedEdges = [...seedIncident, ...rest].slice(0, NEIGHBORHOOD_MAX_RENDERED_EDGES);
    truncationNote =
      `\n(${renderedEdges.length} of ${nb.edges.length} induced edges shown; the ` +
      `${nb.edges.length - renderedEdges.length} omitted edges are still valid for the artifact)`;
  }
  const edgeLines = renderedEdges
    .map(([src, dst, rel]) => `  - ${src} -[${nb.relationNames[String(rel)] ?? rel}]-> ${dst}`)
    .join("\n");
  return `Seeds: ${nb.seeds.join(", ")}\nNodes:\n${nodeLines}\nEdges:\n${edgeLines}${truncationNote}`;
}

export function buildBuilderTaskPrompt(
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
 *
 * D-05: both the graph and no-subgraph arms call this SAME function -- the
 * no-subgraph condition supplies an artifact with empty `nodes`/`edges`
 * arrays together with an empty neighbourhood, so the two renders differ
 * only inside the subgraph block below, never in the surrounding template.
 */
export function buildAnswererTaskPrompt(
  task: CollaborativeBatteryTask,
  artifact: SubgraphArtifactV1,
  nb: KbNeighborhood,
): string {
  const nodesById = new Map(nb.nodes.map((n) => [n.id, n] as const));
  const nodeLines = artifact.nodes
    .map((id) => {
      // IN-02: no label-less fallback -- verifyHandoffAtRead only returns
      // "success" for an artifact that already passed CD-05's
      // neighbourhood-membership check (check 3), which guarantees every
      // artifact.nodes entry is a key in nodesById above. A miss here would
      // mean CD-05 ran after this function, which it structurally cannot.
      const n = nodesById.get(id)!;
      return `  - id=${id} label=${JSON.stringify(n.label)} type=${JSON.stringify(n.type)}`;
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
/** Phase 23-08 point 4: fold every task whose chat call reported a prompt
 *  at or above `PROMPT_TOKENS_TRUNCATION_LIMIT` into the shared per-task
 *  miss map, keyed by the SAME `"builder-prompt-over-budget"` kind the
 *  pre-dispatch character budget uses. Tasks with no reported usage (call
 *  never returned, or a provider that reports none) are left alone --
 *  their own status/outcome paths already handle them. */
function recordTruncatedPromptMisses(
  taskResults: { taskId: string; inputTokens?: number }[],
  tasks: readonly CollaborativeBatteryTask[],
  failedOutcomeByTaskId: Map<string, HandoffOutcome>,
  role: "builder" | "answerer",
): void {
  const queryIdByTaskId = new Map(tasks.map((t) => [t.id, t.queryId] as const));
  for (const t of taskResults) {
    if (t.inputTokens === undefined || t.inputTokens < PROMPT_TOKENS_TRUNCATION_LIMIT) continue;
    failedOutcomeByTaskId.set(t.taskId, {
      kind: "builder-prompt-over-budget",
      queryId: queryIdByTaskId.get(t.taskId)!,
      reason: `${role} call reported prompt_tokens ${t.inputTokens}, at or over PROMPT_TOKENS_TRUNCATION_LIMIT (${PROMPT_TOKENS_TRUNCATION_LIMIT}) -- the model silently truncated the prompt`,
    });
  }
}

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

  // 0b. IN-03: every task id is refused by name, before any path is joined
  // and before any provider call spends a token -- iterating the (already
  // non-empty) task list here is a no-op for the zero-task case above.
  for (const task of args.tasks) {
    assertSafeTaskId(task.id);
  }

  // D-05: resolve the arm once, here -- after both refusals above so they
  // apply identically to both arms, and before the preflight so the
  // preflight itself stays unconditional (D-11's per-call preflight record
  // is unchanged by which arm runs).
  const arm: CollaborativeArm = args.arm ?? "graph";

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

  // D-05: the arm branch is confined to exactly the region that produces
  // the per-task answerer prompt and the per-task handoff outcome (steps
  // 2-5 below) -- everything from the answerer battery mint onward (step 6
  // and after) is shared, unconditional code for both arms. The branch
  // lives here, as an internal conditional, rather than in a second module,
  // because the runner's import set is pinned by an exact-equality boundary
  // test (`PINNED_RUNNER_IMPORT_ALLOWLIST`) and a separate null-arm module
  // would need its own import set and its own prompt-parity proof. This
  // branch adds no import.
  let builderBattery: AgentBattery | undefined;
  let builderRun: BatteryRun | undefined;
  const handoffRecordByTaskId = new Map<string, HandoffRecord>();
  const failedOutcomeByTaskId = new Map<string, HandoffOutcome>();
  const answererPromptByTask = new Map<string, string>();
  const verifiedArtifactByTask = new Map<string, SubgraphArtifactV1>();

  if (arm === "graph") {
    const neighbourhoodByTask = new Map<string, KbNeighborhood>();
    for (const task of args.tasks) {
      // T-23-08: FA-7's empty-seed refusal is THIS query's miss, never the
      // battery's crash -- see `isNeighbourhoodSeedRefusal` for why the
      // match is narrower than the driver's own prefix catch, and why every
      // other kbNeighborhoodFn failure mode still rethrows here.
      try {
        neighbourhoodByTask.set(task.id, args.kbNeighborhoodFn(task.queryId));
      } catch (e) {
        if (!isNeighbourhoodSeedRefusal(e)) throw e;
        failedOutcomeByTaskId.set(task.id, {
          kind: "neighbourhood-refused",
          queryId: task.queryId,
          reason: (e as Error).message,
        });
      }
    }

    // Only tasks that HAVE a neighbourhood reach the builder. Empty exactly
    // when every task refused above -- in which case no builder battery is
    // minted and no builder call is made at all, and every task already
    // carries its own recorded outcome (the all-handoffs-failed branch
    // below returns the resulting all-miss record).
    const buildableTasks = args.tasks.filter((task) => !failedOutcomeByTaskId.has(task.id));

    // 2/3. Builder battery + pass 1. Phase 23-08: every prompt passes the
    // hard character budget BEFORE it is dispatched -- an over-budget
    // prompt would be silently tail-truncated by ollama (task prompt and
    // node list gone, edge tail kept) and its artifact recorded as a valid
    // outcome. A breach is THIS task's miss; the battery continues.
    const builderTasks: BatteryTask[] = [];
    for (const task of buildableTasks) {
      const prompt = buildBuilderTaskPrompt(task, neighbourhoodByTask.get(task.id)!, kbRevision);
      if (prompt.length > BUILDER_PROMPT_MAX_CHARS) {
        failedOutcomeByTaskId.set(task.id, {
          kind: "builder-prompt-over-budget",
          queryId: task.queryId,
          reason: `builder prompt is ${prompt.length} chars, over BUILDER_PROMPT_MAX_CHARS (${BUILDER_PROMPT_MAX_CHARS})`,
        });
        continue;
      }
      builderTasks.push({
        id: task.id,
        prompt,
        checks: [
          {
            checkId: "subgraph-artifact-present",
            kind: "file-invariant",
            input: SUBGRAPH_ARTIFACT_REL_PATH,
            expect: "true",
            description: "the builder emitted a subgraph artifact at the expected path",
          },
        ],
      });
    }
    const builderArtifactDir = join(args.artifactDir, "builder");
    // T-23-08: a builder battery is minted only when at least one task has a
    // neighbourhood to build from. `builderBattery`/`builderRun` therefore
    // stay absent when EVERY task's neighbourhood refused -- the same
    // "a run that did not happen is never fabricated" rule the no-subgraph
    // arm follows, applied to a builder pass that genuinely never ran.
    if (builderTasks.length > 0) {
      builderBattery = makeBattery({
        id: `${args.batteryIdPrefix}:builder`,
        tasks: builderTasks,
        receipt: args.receipt,
      });
      const builderCandidate: CandidateAgent = { id: args.candidate.id, systemPrompt: args.candidate.builderPrompt };
      builderRun = await runAgentBattery(builderCandidate, builderBattery, {
        ...args.runOpts,
        artifactDir: builderArtifactDir,
      });
      // Phase 23-08 point 4: a builder call whose provider-reported prompt
      // size reached the truncation limit produced output the model never
      // saw the whole prompt for -- its artifact is untrusted and the task
      // is THIS query's miss (the step-4 read below skips it, so the kind
      // is never overwritten by artifact-absent).
      recordTruncatedPromptMisses(builderRun.tasks, args.tasks, failedOutcomeByTaskId, "builder");
    }

    // 4. Hash at handoff -- the runner hashes, never the builder. A task whose
    // artifact is absent, unparseable, or schema-invalid gets its outcome
    // recorded here and never proceeds to verify-at-read or the answerer pass
    // (D-03: no scoring call is ever made for a structurally invalid subgraph).
    // Iterates `buildableTasks`, never `args.tasks`: a task whose
    // neighbourhood refused already carries its own outcome and has no
    // builder artifact to look for -- reading one would overwrite the
    // recorded `neighbourhood-refused` kind with a misleading
    // `artifact-absent` (T-23-08).
    for (const task of buildableTasks) {
      // A task that already carries an outcome (over-budget above, or the
      // point-4 prompt_tokens tripwire) has no artifact to look for --
      // reading one would overwrite its recorded kind with a misleading
      // `artifact-absent` (the same T-23-08 trap the neighbourhood-refused
      // path documents on `buildableTasks` itself).
      if (failedOutcomeByTaskId.has(task.id)) continue;
      const artifactPath = join(builderArtifactDir, task.id, SUBGRAPH_ARTIFACT_REL_PATH);
      const read = readSubgraphArtifact(artifactPath);
      if (read.status === "absent") {
        failedOutcomeByTaskId.set(task.id, { kind: "artifact-absent", path: artifactPath });
        continue;
      }
      if (read.status === "unreadable") {
        failedOutcomeByTaskId.set(task.id, { kind: "artifact-unreadable", path: artifactPath, code: read.code });
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
        // WR-05: D-05's canonical hash gains its production call site here --
        // recorded BESIDE the raw-bytes artifactSha256 above, never in place
        // of it (FA-A/see hashSubgraphArtifact's doc comment).
        canonicalSha256: hashSubgraphArtifact(schemaResult.artifact),
      });
    }

    // 5. Verify at read, then render the answerer's prompt from verified ids
    // joined against the SAME pre-extracted neighbourhood (D-06). Only tasks
    // that survived step 4 are attempted here -- a task already failed never
    // reaches verify-at-read, let alone the answerer pass or the bridge.
    for (const task of buildableTasks) {
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
  } else {
    // D-05 no-subgraph condition: §7's pre-registered null control. No
    // builder pass, no neighbourhood-extraction call, no artifact write or
    // read, no hash-at-handoff or verify-at-read step. Each task's answerer
    // prompt is rendered by the SAME exported `buildAnswererTaskPrompt`
    // renderer, given a synthetic artifact with empty `nodes`/`edges` and a
    // synthetic neighbourhood with empty seeds/nodes/edges/relationNames, so
    // the render differs from the graph arm only inside the subgraph block.
    // The per-task handoff outcome is recorded as the success member
    // carrying that synthetic artifact, so the outcome shape below is
    // identical to the graph condition's -- but `handoffRecordByTaskId`
    // stays empty for this arm: no handoff occurred, and a run that did not
    // happen is never fabricated into the record.
    for (const task of args.tasks) {
      const syntheticArtifact: SubgraphArtifactV1 = {
        schemaVersion: SUBGRAPH_SCHEMA_VERSION,
        queryId: task.queryId,
        kbRevision,
        nodes: [],
        edges: [],
      };
      const syntheticNeighbourhood: KbNeighborhood = {
        queryId: task.queryId,
        seeds: [],
        nodes: [],
        edges: [],
        relationNames: {},
      };
      verifiedArtifactByTask.set(task.id, syntheticArtifact);
      answererPromptByTask.set(
        task.id,
        buildAnswererTaskPrompt(task, syntheticArtifact, syntheticNeighbourhood),
      );
    }
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
  // T-23-08: every task failed at handoff. The answerer pass is SKIPPED --
  // there is no verified subgraph to answer from, so dispatching one would
  // spend a provider call per task on a prompt that cannot be rendered --
  // but the run still returns an ordinary, well-formed record: every task
  // carries its own named failure outcome with hit@1 of zero (the loop
  // below already does exactly that for a failed task), the adapter fitness
  // is an honest 0, and selection's own `evalGate` eliminates the candidate
  // on `passedGate` (`gateThreshold` is validated > 0 at battery
  // construction, so a 0 pass rate can never clear it). This replaces the
  // zero-task `makeBattery` refusal that used to abort the whole battery --
  // a wholly-failed pair now simply scores 0 and loses, which is what
  // COLLAB-DESIGN.md §7's misses-for-non-completions rule requires.
  const allHandoffsFailed = survivingTasks.length === 0;

  // Explicit gateThreshold, never left to default -- an absent threshold is
  // the perfection bar, which eliminates every realistic candidate at the
  // eval gate (checkpoint decision 3a).
  const answererBattery = makeBattery({
    id: `${args.batteryIdPrefix}:answerer`,
    // The skipped-pass placeholder keeps the run's OWN task ids (never a
    // synthetic id): `promoteComponentWinner`'s seal gate compares the
    // search and promotion batteries' task-id sets for disjointness, and
    // the shell's own split already guarantees that for these ids. The
    // prompt says plainly that no pass was dispatched -- `answererRun.tasks`
    // is empty and `answererBatterySkipped` is recorded, so nothing here
    // claims a call that never happened.
    tasks: allHandoffsFailed
      ? args.tasks.map((task) => ({
          id: task.id,
          prompt: SKIPPED_ANSWERER_PROMPT,
          checks: [
            {
              checkId: "ranked-answer-present",
              kind: "file-invariant" as const,
              input: ANSWER_ARTIFACT_REL_PATH,
              expect: "true",
              description: "the answerer emitted a ranked-answer artifact at the expected path",
            },
          ],
        }))
      : answererTasks,
    receipt: args.receipt,
    gateThreshold: args.gateThreshold,
  });

  // 6. Pass 2.
  const answererArtifactDir = join(args.artifactDir, "answerer");
  const answererCandidate: CandidateAgent = {
    id: args.candidate.id,
    systemPrompt: args.candidate.answererPrompt,
  };
  const answererRun = allHandoffsFailed
    ? skippedAnswererRun(args.candidate.id, answererBattery, args.runOpts)
    : await runAgentBattery(answererCandidate, answererBattery, {
        ...args.runOpts,
        artifactDir: answererArtifactDir,
      });
  // Phase 23-08 point 4, answerer side of the same tripwire. Structurally
  // the answerer prompt is bounded (<= MAX_SUBGRAPH_NODES nodes +
  // MAX_SUBGRAPH_EDGES edges), so this only ever fires on tokenizer drift.
  // Like a verify-at-read failure, an affected task's handoff record is
  // dropped by the outcome loop below -- existing precedent, and hit@1 is
  // an honest 0 rather than a score parsed from a truncated call.
  recordTruncatedPromptMisses(answererRun.tasks, args.tasks, failedOutcomeByTaskId, "answerer");

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
    // D-05: under the no-subgraph condition no handoff record exists for
    // this task (handoffRecordByTaskId stays empty for that arm) -- pushed
    // only when one is present, so `handoffRecords` stays empty for that
    // arm too, never a fabricated entry for a handoff that never happened.
    const handoffRecord = handoffRecordByTaskId.get(task.id);
    if (handoffRecord) handoffRecords.push(handoffRecord);

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
    ...(allHandoffsFailed ? { answererBatterySkipped: { reason: "all-handoffs-failed" as const } } : {}),
  };
}
