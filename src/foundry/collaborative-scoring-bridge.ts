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
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

  // Happy path only in this task. Every other branch throws a clearly
  // labelled, unimplemented placeholder — Task 3 replaces this with the
  // full pinned-order branch skeleton.
  let outcome: ScoringOutcome;
  if (result.status === 0 && result.error === undefined) {
    const parsed = JSON.parse(result.stdout) as { metrics: Record<string, number> };
    outcome = { outcome: "scored", metrics: parsed.metrics };
  } else {
    throw new ScoringPreflightError(
      `scorePrediction branch unimplemented for this result shape — Task 3 fills in the ` +
        `pinned failure-outcome branch order`,
    );
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
