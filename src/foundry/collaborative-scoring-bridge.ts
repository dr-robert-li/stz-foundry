/**
 * The fail-closed Node -> Python scoring bridge (Phase 21 — Fail-closed
 * scoring bridge, Plan 21-01, REQ-78). Shells out to
 * `tools/stark-eval/score_one.py` on the `execution-oracle.ts` idiom (argv
 * array, explicit timeout, probe-first, injectable execFn) — but shaped
 * around `spawnSync`'s return object rather than a throw-on-nonzero-exit
 * shape, so SC-2's two named signals (`status`, `error`) are plain fields
 * on one returned object, never re-derived from a catch block (RESEARCH
 * Pitfall 1).
 *
 * THIS module has no path to gold data, deliberately (D-01). It is built to
 * take a query id and a ranked prediction and nothing else — the oracle
 * rejoins gold by query id entirely on the Python side of the process
 * boundary. A future reader tempted to "fix" this by importing a fixture, a
 * task-loading module, or any module that reads a gold-bearing file should
 * not — a named test enforces that absence by scanning this file's own
 * source text and its transitive imports, so even an explanatory comment is
 * load-bearing here (D-02). One `score_one.py` process is spawned per
 * scored prediction, never batched, never retried (D-07) — the simplest
 * fail-closed semantics, matching the spike-verified contract exactly.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  requireCollaborativeAdmitted,
  type CollaborativeAdmissionRecord,
} from "./collaborative-admission.js";
import { validateReceipt, type OracleReceipt } from "./battery-types.js";

/**
 * A reasoned default, not a measured one (FA-2 / RESEARCH Pitfall 3 — no
 * `raw/` transcript in the spike carries a per-call timing marker). Every
 * invocation is a fresh process that deserialises a large processed KB
 * artifact from disk plus imports heavyweight packages on every call (no
 * persistent process, per D-07's strict per-call decision) — a multi-minute
 * ceiling is plausible on that basis alone. `runScoringPreflight`'s
 * probe-first warm-up call is what produces the FIRST real measurement
 * (Plan 21-04), not a re-read of this comment.
 */
export const SCORING_TIMEOUT_MS = 600_000;

export const VENV_PYTHON_REL = "tools/stark-eval/.venv/bin/python";
export const SCORE_ONE_REL = "tools/stark-eval/score_one.py";
export const REQUIRED_METRIC_KEYS = ["mrr", "hit@1", "hit@5", "recall@20"] as const;

/** The `skb:` cache-key namespace's on-disk root (D-06). Exported so callers
 *  (and this module's own test suite, bound by the D-09 CI boundary in
 *  `test/stark-fixtures.test.ts` — no test source file may spell out the
 *  Python toolchain's path literally) resolve it via import, never a second
 *  hand-typed literal. */
export const SKB_DATA_ROOT_REL = "tools/stark-eval/data";

/** The admission table's kb name and the argv value `score_one.py` expects
 *  differ — carry the mapping explicitly rather than slicing a prefix. */
const SCORE_ONE_KB_ARG = "prime";

export class ScoringPreflightError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-scoring-bridge] ${message}`);
    this.name = "ScoringPreflightError";
  }
}

/** Shaped around `spawnSync`'s return object, not a throw-on-failure shape
 *  (RESEARCH Pitfall 1) — returns the full `SpawnSyncReturns` object so
 *  every failure-outcome-table entry is decidable off a plain field, no
 *  try/catch needed. */
export type ScoringExecFn = (
  file: string,
  args: string[],
  opts: { input: string; timeout: number; encoding: "utf8" },
) => SpawnSyncReturns<string>;

const defaultScoringExecFn: ScoringExecFn = (file, args, opts) => spawnSync(file, args, opts);

export interface PoolManifest {
  kb: string;
  hfRevision: string;
  form: "bounds" | "explicit";
  count: number;
  min: number;
  max: number;
  idListSha256: string;
  ids?: number[];
}

/** Two members in this task — `scored` and `prefilter-miss`. A discriminated
 *  union on `outcome` so a later plan widens it without restructuring. */
export type ScoringOutcome =
  | { outcome: "scored"; metrics: Record<string, number> }
  | { outcome: "prefilter-miss"; forfeitedIds: string[] };

export interface ScoringAttempt {
  attemptId: string;
  queryId: number;
  kb: "prime";
  hfRevision: string;
  submittedPredDict: Record<string, number>;
  forfeitedIds: string[];
  forfeitedCount: number;
  outcome: ScoringOutcome;
  wallTimeMs: number;
  receipt: OracleReceipt;
  artifactPath: string;
}

/**
 * Field-by-field explicit checks, never a spread or a cast. Rejects naming
 * the offending field (ASVS V5).
 */
export function parsePoolManifest(raw: unknown): PoolManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new ScoringPreflightError(`pool manifest must be an object, got ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.kb !== "string") {
    throw new ScoringPreflightError(`pool manifest field "kb" must be a string`);
  }
  if (typeof obj.hfRevision !== "string") {
    throw new ScoringPreflightError(`pool manifest field "hfRevision" must be a string`);
  }
  if (obj.form !== "bounds" && obj.form !== "explicit") {
    throw new ScoringPreflightError(
      `pool manifest field "form" must be "bounds" or "explicit", got ${JSON.stringify(obj.form)}`,
    );
  }
  if (typeof obj.idListSha256 !== "string") {
    throw new ScoringPreflightError(`pool manifest field "idListSha256" must be a string`);
  }
  if (!Number.isInteger(obj.count)) {
    throw new ScoringPreflightError(`pool manifest field "count" must be an integer`);
  }
  if (!Number.isInteger(obj.min)) {
    throw new ScoringPreflightError(`pool manifest field "min" must be an integer`);
  }
  if (!Number.isInteger(obj.max)) {
    throw new ScoringPreflightError(`pool manifest field "max" must be an integer`);
  }
  const count = obj.count as number;
  const min = obj.min as number;
  const max = obj.max as number;
  if (count <= 0) {
    throw new ScoringPreflightError(`pool manifest field "count" must be > 0, got ${count}`);
  }
  if (min > max) {
    throw new ScoringPreflightError(`pool manifest field "min" (${min}) must be <= "max" (${max})`);
  }
  if (obj.form === "explicit") {
    if (!Array.isArray(obj.ids) || obj.ids.length === 0) {
      throw new ScoringPreflightError(
        `pool manifest form "explicit" requires a non-empty "ids" array`,
      );
    }
  }
  if (obj.form === "bounds" && count !== max - min + 1) {
    throw new ScoringPreflightError(
      `pool manifest form "bounds" requires count (${count}) === max - min + 1 (${max - min + 1})`,
    );
  }
  return {
    kb: obj.kb,
    hfRevision: obj.hfRevision,
    form: obj.form,
    count,
    min,
    max,
    idListSha256: obj.idListSha256,
    ...(obj.form === "explicit" ? { ids: obj.ids as number[] } : {}),
  };
}

/**
 * Iterate `Object.entries(predDict)` in order so surviving entries keep
 * their original insertion order — no sorting, no re-ranking. A forfeited id
 * is a defined outcome, not an error, and nothing is promoted into its
 * position — record the fact, do not repair it (FA-1).
 */
export function preFilterPredictions(
  predDict: Record<string, number>,
  manifest: PoolManifest,
): { filtered: Record<string, number>; forfeitedIds: string[] } {
  const filtered: Record<string, number> = {};
  const forfeitedIds: string[] = [];
  const explicitSet = manifest.form === "explicit" ? new Set(manifest.ids ?? []) : null;
  for (const [key, score] of Object.entries(predDict)) {
    const id = Number(key);
    const isMember =
      manifest.form === "bounds"
        ? Number.isInteger(id) && id >= manifest.min && id <= manifest.max
        : Number.isInteger(id) && explicitSet !== null && explicitSet.has(id);
    if (isMember) {
      filtered[key] = score;
    } else {
      forfeitedIds.push(key);
    }
  }
  return { filtered, forfeitedIds };
}

/**
 * A NEW object every call — never hoisted to a module-level const. Phase
 * 22's runner threads receipts by object identity (REQ-80).
 */
function buildReceiptForPrediction(record: CollaborativeAdmissionRecord): OracleReceipt {
  const receipt: OracleReceipt = {
    kind: "constructed",
    acceptedBy: record.acceptedBy,
    lineage: [record.lineage, `constructed:hf:snap-stanford/stark@${record.revisionSha}`],
  };
  validateReceipt(receipt, "collaborative-scoring-bridge");
  return receipt;
}

/**
 * The bridge writes this file; it never reads any file back, so a leftover
 * artifact from a crashed prior run is structurally incapable of being
 * mistaken for this attempt's result.
 */
function writeAttemptArtifact(outputDir: string, attempt: ScoringAttempt): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(attempt.artifactPath, JSON.stringify(attempt, null, 2));
}

export interface ScorePredictionArgs {
  queryId: number;
  predDict: Record<string, number>;
  outputDir: string;
  poolManifest: PoolManifest;
  execFn?: ScoringExecFn;
  timeoutMs?: number;
  pythonPath?: string;
  scriptPath?: string;
}

/**
 * The phase's primary entry point. `outputDir` and `poolManifest` are
 * required — no default, no inferred path (A2). Reads the admission pin,
 * runs the pre-filter, spawns exactly one `score_one.py` process (unless
 * the pre-filter left nothing to send), and returns exactly one
 * `ScoringAttempt`.
 */
export function scorePrediction(args: ScorePredictionArgs): ScoringAttempt {
  const record = requireCollaborativeAdmitted("stark-prime");
  const execFn = args.execFn ?? defaultScoringExecFn;
  const attemptId = randomUUID();
  const artifactPath = join(args.outputDir, `attempt-${attemptId}.json`);
  const receipt = buildReceiptForPrediction(record);

  const { filtered, forfeitedIds } = preFilterPredictions(args.predDict, args.poolManifest);

  if (Object.keys(filtered).length === 0) {
    const attempt: ScoringAttempt = {
      attemptId,
      queryId: args.queryId,
      kb: "prime",
      hfRevision: record.revisionSha,
      submittedPredDict: filtered,
      forfeitedIds,
      forfeitedCount: forfeitedIds.length,
      outcome: { outcome: "prefilter-miss", forfeitedIds },
      wallTimeMs: 0,
      receipt,
      artifactPath,
    };
    writeAttemptArtifact(args.outputDir, attempt);
    return attempt;
  }

  const argv = [
    args.scriptPath ?? SCORE_ONE_REL,
    SCORE_ONE_KB_ARG,
    String(args.queryId),
    "--hf-revision",
    record.revisionSha,
  ];

  const startedAt = Date.now();
  const result = execFn(args.pythonPath ?? VENV_PYTHON_REL, argv, {
    input: JSON.stringify(filtered),
    timeout: args.timeoutMs ?? SCORING_TIMEOUT_MS,
    encoding: "utf8",
  });
  const wallTimeMs = Date.now() - startedAt;

  // The branch order below is load-bearing (SC-2): spawnSync sets BOTH an
  // ETIMEDOUT-coded `error` AND `signal: "SIGTERM"` when a timeout fires,
  // so a signal-first branch would misreport every timeout as a signal
  // termination. Reaching the "scored" outcome (branch 5) requires
  // `result.error` to be absent AND `result.status` to be exactly `0` AND
  // the stdout parse to succeed — three independent conditions, none
  // inferred from another. We do not wrap the `execFn` call itself in
  // try/catch: the two signals SC-2 names are plain fields on `spawnSync`'s
  // returned object, and catching would re-hide them. Only the stdout
  // parse below is wrapped, because JSON.parse is the one step in this
  // branch that can itself throw.
  let outcome: ScoringOutcome;
  const errorCode = result.error !== undefined ? (result.error as NodeJS.ErrnoException).code : undefined;
  if (errorCode === "ETIMEDOUT") {
    // (1) timeout — first, because a timed-out spawnSync call ALSO sets
    // `signal`, and this branch must win before branch (2) ever sees it.
    throw new ScoringPreflightError(
      `timeout branch unimplemented for this result shape — a later plan fills in the pinned failure-outcome branch order`,
    );
  } else if (result.signal !== null) {
    // (2) signal termination (SIGKILL/SIGTERM), not a timeout.
    throw new ScoringPreflightError(
      `signal-termination branch unimplemented for this result shape — a later plan fills in the pinned failure-outcome branch order`,
    );
  } else if (result.error !== undefined) {
    // (3) process unreachable for any other reason (ENOENT, spawn failure).
    throw new ScoringPreflightError(
      `process-unreachable branch unimplemented for this result shape — a later plan fills in the pinned failure-outcome branch order`,
    );
  } else if (result.status !== 0) {
    // (4) non-zero exit, no error/signal set.
    throw new ScoringPreflightError(
      `nonzero-exit branch unimplemented for this result shape — a later plan fills in the pinned failure-outcome branch order`,
    );
  } else {
    // (5) otherwise, parse stdout.
    try {
      const parsed = JSON.parse(result.stdout) as { metrics: Record<string, number> };
      outcome = { outcome: "scored", metrics: parsed.metrics };
    } catch {
      throw new ScoringPreflightError(
        `malformed-stdout branch unimplemented for this result shape — a later plan fills in the pinned failure-outcome branch order`,
      );
    }
  }

  const attempt: ScoringAttempt = {
    attemptId,
    queryId: args.queryId,
    kb: "prime",
    hfRevision: record.revisionSha,
    submittedPredDict: filtered,
    forfeitedIds,
    forfeitedCount: forfeitedIds.length,
    outcome,
    wallTimeMs,
    receipt,
    artifactPath,
  };
  writeAttemptArtifact(args.outputDir, attempt);
  return attempt;
}

// ── Task 2: environment fingerprint preflight ───────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/;

/**
 * Captured at provisioning time (D-05). Two namespaces in
 * `cacheKeyFileSha256` because the KB load path touches two independent
 * on-disk caches — the project-local processed-artifact directory and the
 * Hugging Face hub snapshot directory named for the pinned sha
 * (RESEARCH Pitfall 4, D-06): `skb:<path relative to tools/stark-eval/data>`
 * and `hub:<path relative to the pinned snapshot directory>`.
 */
export interface FingerprintManifest {
  pythonPath: string;
  pythonVersion: string;
  starkQaVersion: string;
  torchVersion: string;
  hfPin: string;
  scoreOneSha256: string;
  cacheKeyFileSha256: Record<string, string>;
}

/**
 * Same explicit field-by-field discipline as `parsePoolManifest`. The D-06
 * clause: reject a manifest missing at least one `skb:`-prefixed key or at
 * least one `hub:`-prefixed key — "manifest-lite" still means both cache
 * locations, not either.
 */
export function parseFingerprintManifest(raw: unknown): FingerprintManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new ScoringPreflightError(`fingerprint manifest must be an object, got ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  const stringFields = [
    "pythonPath",
    "pythonVersion",
    "starkQaVersion",
    "torchVersion",
    "hfPin",
    "scoreOneSha256",
  ] as const;
  for (const field of stringFields) {
    if (typeof obj[field] !== "string") {
      throw new ScoringPreflightError(`fingerprint manifest field "${field}" must be a string`);
    }
  }
  if (
    typeof obj.cacheKeyFileSha256 !== "object" ||
    obj.cacheKeyFileSha256 === null ||
    Array.isArray(obj.cacheKeyFileSha256)
  ) {
    throw new ScoringPreflightError(`fingerprint manifest field "cacheKeyFileSha256" must be an object`);
  }
  const cacheEntries = obj.cacheKeyFileSha256 as Record<string, unknown>;
  const cacheKeys = Object.keys(cacheEntries);
  if (cacheKeys.length === 0) {
    throw new ScoringPreflightError(`fingerprint manifest field "cacheKeyFileSha256" must not be empty`);
  }
  const validatedEntries: Record<string, string> = {};
  for (const key of cacheKeys) {
    const value = cacheEntries[key];
    if (typeof value !== "string" || !HEX64_RE.test(value)) {
      throw new ScoringPreflightError(
        `fingerprint manifest cacheKeyFileSha256 entry "${key}" must be a 64-character lowercase hex string`,
      );
    }
    validatedEntries[key] = value;
  }
  if (!cacheKeys.some((key) => key.startsWith("skb:"))) {
    throw new ScoringPreflightError(
      `fingerprint manifest field "cacheKeyFileSha256" has no key prefixed "skb:" — D-06 requires both cache locations`,
    );
  }
  if (!cacheKeys.some((key) => key.startsWith("hub:"))) {
    throw new ScoringPreflightError(
      `fingerprint manifest field "cacheKeyFileSha256" has no key prefixed "hub:" — D-06 requires both cache locations`,
    );
  }
  return {
    pythonPath: obj.pythonPath as string,
    pythonVersion: obj.pythonVersion as string,
    starkQaVersion: obj.starkQaVersion as string,
    torchVersion: obj.torchVersion as string,
    hfPin: obj.hfPin as string,
    scoreOneSha256: obj.scoreOneSha256 as string,
    cacheKeyFileSha256: validatedEntries,
  };
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Resolve a namespaced cache key against its own on-disk location — the
 *  two independent caches D-06 requires covering. */
function resolveCacheKeyPath(key: string, record: CollaborativeAdmissionRecord, hubCacheRoot: string): string {
  if (key.startsWith("hub:")) {
    const relPath = key.slice("hub:".length);
    return join(hubCacheRoot, "datasets--snap-stanford--stark", "snapshots", record.revisionSha, relPath);
  }
  if (key.startsWith("skb:")) {
    const relPath = key.slice("skb:".length);
    return join(SKB_DATA_ROOT_REL, relPath);
  }
  throw new ScoringPreflightError(
    `cacheKeyFileSha256 key "${key}" has neither the "skb:" nor "hub:" namespace prefix`,
  );
}

interface ObserveFingerprintDeps {
  execFn?: ScoringExecFn;
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
  pythonPath?: string;
  scriptPath?: string;
}

/** Re-derives every fact the committed fingerprint manifest records, live.
 *  Every seam is injectable so the whole comparison is unit-testable with
 *  no venv, no network, and no real cache. */
function observeFingerprint(
  expected: FingerprintManifest,
  record: CollaborativeAdmissionRecord,
  deps: ObserveFingerprintDeps,
): FingerprintManifest {
  const execFn = deps.execFn ?? defaultScoringExecFn;
  const readFileFn = deps.readFileFn ?? readFileSync;
  const hubCacheRoot =
    deps.hubCacheRoot ??
    process.env.HF_HUB_CACHE ??
    join(process.env.HF_HOME ?? join(homedir(), ".cache", "huggingface"), "hub");
  const pythonPath = deps.pythonPath ?? VENV_PYTHON_REL;
  const scriptPath = deps.scriptPath ?? SCORE_ONE_REL;

  const versionResult = execFn(
    pythonPath,
    [
      "-c",
      "import sys, torch, stark_qa; print(sys.version.split()[0]); print(torch.__version__); print(stark_qa.__version__)",
    ],
    { input: "", timeout: SCORING_TIMEOUT_MS, encoding: "utf8" },
  );
  const versionLines = versionResult.stdout.trim().split("\n");
  const pythonVersion = versionLines[0] ?? "";
  const torchVersion = versionLines[1] ?? "";
  const starkQaVersion = versionLines[2] ?? "";

  const scoreOneSha256 = hashBytes(readFileFn(scriptPath));

  const cacheKeyFileSha256: Record<string, string> = {};
  for (const key of Object.keys(expected.cacheKeyFileSha256)) {
    const path = resolveCacheKeyPath(key, record, hubCacheRoot);
    cacheKeyFileSha256[key] = hashBytes(readFileFn(path));
  }

  return {
    pythonPath,
    pythonVersion,
    starkQaVersion,
    torchVersion,
    hfPin: record.revisionSha,
    scoreOneSha256,
    cacheKeyFileSha256,
  };
}

/**
 * One named `if` per field, in a fixed, documented order — never one
 * compound boolean. Each throws naming the FIRST mismatching field; sorted
 * cache-key order makes "first mismatching field" deterministic across
 * runs (D-05).
 */
function assertFingerprintMatches(expected: FingerprintManifest, observed: FingerprintManifest): void {
  if (observed.pythonPath !== expected.pythonPath) {
    throw new ScoringPreflightError(
      `pythonPath mismatch: expected ${expected.pythonPath}, observed ${observed.pythonPath}`,
    );
  }
  if (observed.pythonVersion !== expected.pythonVersion) {
    throw new ScoringPreflightError(
      `pythonVersion mismatch: expected ${expected.pythonVersion}, observed ${observed.pythonVersion}`,
    );
  }
  if (observed.starkQaVersion !== expected.starkQaVersion) {
    throw new ScoringPreflightError(
      `starkQaVersion mismatch: expected ${expected.starkQaVersion}, observed ${observed.starkQaVersion}`,
    );
  }
  if (observed.torchVersion !== expected.torchVersion) {
    throw new ScoringPreflightError(
      `torchVersion mismatch: expected ${expected.torchVersion}, observed ${observed.torchVersion}`,
    );
  }
  if (observed.hfPin !== expected.hfPin) {
    throw new ScoringPreflightError(`hfPin mismatch: expected ${expected.hfPin}, observed ${observed.hfPin}`);
  }
  if (observed.scoreOneSha256 !== expected.scoreOneSha256) {
    throw new ScoringPreflightError(
      `scoreOneSha256 mismatch: expected ${expected.scoreOneSha256}, observed ${observed.scoreOneSha256}`,
    );
  }
  const sortedKeys = Object.keys(expected.cacheKeyFileSha256).sort();
  for (const key of sortedKeys) {
    const expectedHash = expected.cacheKeyFileSha256[key];
    const observedHash = observed.cacheKeyFileSha256[key];
    if (observedHash !== expectedHash) {
      throw new ScoringPreflightError(
        `cacheKeyFileSha256 entry "${key}" mismatch: expected ${expectedHash}, observed ${observedHash}`,
      );
    }
  }
}

function idListDigest(ids: number[]): string {
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

export interface PreflightReport {
  fingerprintOk: true;
  warmUpWallTimeMs: number;
  warmUpAttempt: ScoringAttempt;
}

export interface RunScoringPreflightArgs {
  fingerprintManifest: FingerprintManifest;
  poolManifest: PoolManifest;
  outputDir: string;
  warmUp: { queryId: number; predDict: Record<string, number> };
  execFn?: ScoringExecFn;
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
  timeoutMs?: number;
  pythonPath?: string;
  scriptPath?: string;
}

/**
 * Deliberately NOT called from inside `scorePrediction` — Phase 22's runner
 * chooses the cadence (once per battery or once per call, RESEARCH Open
 * Question 2). Steps in order, each failing closed before the next: pin
 * cross-check, pool manifest self-consistency, fingerprint comparison, then
 * one warm-up `scorePrediction` call. If that call's outcome is not
 * `scored`, throws naming the outcome — a systemically broken or slow
 * environment is caught here, before a battery starts (D-08).
 */
export function runScoringPreflight(args: RunScoringPreflightArgs): PreflightReport {
  const record = requireCollaborativeAdmitted("stark-prime");

  if (args.fingerprintManifest.hfPin !== record.revisionSha) {
    throw new ScoringPreflightError(
      `hfPin mismatch: expected ${record.revisionSha}, fingerprint manifest declares ${args.fingerprintManifest.hfPin}`,
    );
  }
  if (args.poolManifest.hfRevision !== record.revisionSha) {
    throw new ScoringPreflightError(
      `hfRevision mismatch: expected ${record.revisionSha}, pool manifest declares ${args.poolManifest.hfRevision}`,
    );
  }

  const impliedIds =
    args.poolManifest.form === "bounds"
      ? Array.from(
          { length: args.poolManifest.max - args.poolManifest.min + 1 },
          (_, i) => args.poolManifest.min + i,
        )
      : [...(args.poolManifest.ids ?? [])].sort((a, b) => a - b);
  const derivedIdListSha256 = idListDigest(impliedIds);
  if (derivedIdListSha256 !== args.poolManifest.idListSha256) {
    throw new ScoringPreflightError(
      `idListSha256 mismatch: expected ${args.poolManifest.idListSha256}, derived ${derivedIdListSha256}`,
    );
  }

  const observed = observeFingerprint(args.fingerprintManifest, record, {
    execFn: args.execFn,
    readFileFn: args.readFileFn,
    hubCacheRoot: args.hubCacheRoot,
    pythonPath: args.pythonPath,
    scriptPath: args.scriptPath,
  });
  assertFingerprintMatches(args.fingerprintManifest, observed);

  const warmUpAttempt = scorePrediction({
    queryId: args.warmUp.queryId,
    predDict: args.warmUp.predDict,
    outputDir: args.outputDir,
    poolManifest: args.poolManifest,
    ...(args.execFn ? { execFn: args.execFn } : {}),
    ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
    ...(args.pythonPath ? { pythonPath: args.pythonPath } : {}),
    ...(args.scriptPath ? { scriptPath: args.scriptPath } : {}),
  });
  if (warmUpAttempt.outcome.outcome !== "scored") {
    throw new ScoringPreflightError(
      `preflight warm-up call did not reach the "scored" outcome (got "${warmUpAttempt.outcome.outcome}") — ` +
        `a systemically broken or slow environment is caught here, before a battery starts`,
    );
  }

  return {
    fingerprintOk: true,
    warmUpWallTimeMs: warmUpAttempt.wallTimeMs,
    warmUpAttempt,
  };
}
