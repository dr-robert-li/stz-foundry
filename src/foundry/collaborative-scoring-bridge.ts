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

/**
 * The version-probe's `-c` source (G-21-1/CR-01/WR-01, Task 1). Reads
 * distribution metadata rather than module attributes — the same mechanism
 * `tools/stark-eval/capture_fingerprint.py` used to write the committed
 * fingerprint-manifest.json's three version fields (FA-A, FA-B), so the
 * live re-derivation and the committed record are produced by the same
 * expressions and can actually agree. Importing neither `torch` nor
 * `stark_qa` means nothing prints `stark_qa`'s own import-time WARNING
 * line, and dropping `torch` (also unneeded for its version) makes the
 * probe faster too.
 */
const VERSION_PROBE_PY =
  "import platform; from importlib.metadata import version as pkg_version; " +
  "print(platform.python_version()); print(pkg_version('torch')); print(pkg_version('stark-qa'))";

/** Anchored, digits-only (optional leading minus) pattern — a pre-condition
 *  on the KEY's spelling, not on the parsed number's magnitude (IN-01). A
 *  round-trip check (`String(nodeId) === key`) would reject a zero-padded
 *  key like `"007"`, which is exactly the collision the
 *  `duplicate-prediction-id` outcome three lines below exists to catch
 *  (FA-C) — this regex admits `"007"` while still rejecting `"0x10"`,
 *  `"1e2"`, `"+7"`, `" 7 "`, `"1.0"`. */
const INTEGER_KEY_RE = /^-?\d+$/;

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

/**
 * The complete §6 fail-closed outcome table (Plans 21-01 and 21-03). A
 * discriminated union on `outcome`, thirteen members total: the happy path,
 * six decided before any process is spawned (`validatePredDict` and the
 * pre-filter), and six decided from the `spawnSync` result object's plain
 * fields, in the pinned branch order. `SCORING_OUTCOME_KINDS` and
 * `describeScoringOutcome` below make growing this union without handling
 * every member a compile error.
 */
export type ScoringOutcome =
  | { outcome: "scored"; metrics: Record<string, number> }
  | { outcome: "empty-prediction" }
  | { outcome: "over-cap"; entryCount: number }
  | { outcome: "non-integer-prediction-id"; key: string }
  | { outcome: "duplicate-prediction-id"; nodeId: number }
  | { outcome: "non-finite-score"; key: string }
  | { outcome: "prefilter-miss"; forfeitedIds: string[] }
  | { outcome: "timeout"; timeoutMs: number }
  | { outcome: "signal-terminated"; signal: string }
  | { outcome: "process-unreachable"; errorMessage: string }
  | { outcome: "nonzero-exit"; exitCode: number; stderrTail: string }
  | { outcome: "malformed-stdout"; reason: "not-json" | "not-object" | "multiple-json"; stdoutTail: string }
  | { outcome: "missing-metrics"; missingKeys: string[] };

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
  /** Bounded (2000-char) tail of the subprocess's stderr, recorded for EVERY
   *  attempt regardless of outcome. Diagnostic evidence only — this field is
   *  never read to decide an outcome (Pitfall 6 / kept prohibition). Empty
   *  string for the pre-invocation outcomes, since no process is spawned. */
  stderrTail: string;
}

/** The cap CD-01 sets on a submitted prediction's entry count — checked on
 *  the caller's own list, before the pre-filter runs (so a caller cannot get
 *  25 entries past the cap by having some of them filtered out). */
const CD01_MAX_PREDICTION_ENTRIES = 20;

/** Bounded to the last `maxChars` characters so a torch traceback or a huge
 *  stdout blob cannot make an attempt artifact unreadable or oversized
 *  (T-21-21, accepted residual: the truncation could in principle hide the
 *  tail of a very long diagnostic — the full stream stays available to an
 *  operator re-running the call by hand). */
function boundedTail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The six pre-invocation outcomes, decided bridge-side BEFORE
 * `score_one.py` is ever spawned (Pitfall 6, option (a) — never a stderr
 * substring match). Checks in this fixed order, per entry in insertion
 * order, mirroring `score_one.py`'s own stdin-parser sequence so the two
 * sides agree on semantics without the bridge depending on the Python
 * side's messages. `score_one.py`'s own equivalent checks stay in place as
 * defense in depth and are deliberately not the bridge's primary gate.
 * Returns the first violating outcome, or `null` when the input is
 * acceptable to send onward to the pre-filter.
 */
export function validatePredDict(predDict: Record<string, number>): ScoringOutcome | null {
  const entryCount = Object.keys(predDict).length;
  if (entryCount === 0) {
    return { outcome: "empty-prediction" };
  }
  if (entryCount > CD01_MAX_PREDICTION_ENTRIES) {
    return { outcome: "over-cap", entryCount };
  }
  const seenNodeIds = new Set<number>();
  for (const [key, value] of Object.entries(predDict)) {
    const nodeId = Number(key);
    // IN-01: the numeric test alone accepts key spellings JSON.stringify of
    // an integer would never itself produce (hex-like, exponent-notation,
    // whitespace-padded, a leading "+") — the regex is a pre-condition on
    // the key's spelling, in addition to (never instead of) the magnitude
    // check the duplicate/`007` case below still needs.
    if (!INTEGER_KEY_RE.test(key) || !Number.isInteger(nodeId)) {
      return { outcome: "non-integer-prediction-id", key };
    }
    // The collision "7" vs "007" cannot exist in the raw JSON object (keys
    // are already unique there) and only appears after this integer parse —
    // that is the whole reason this check is not redundant with JSON's own
    // key uniqueness.
    if (seenNodeIds.has(nodeId)) {
      return { outcome: "duplicate-prediction-id", nodeId };
    }
    seenNodeIds.add(nodeId);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { outcome: "non-finite-score", key };
    }
  }
  return null;
}

/**
 * Field-by-field explicit checks, never a spread or a cast. Rejects naming
 * the offending field (ASVS V5). The explicit-form `ids` array is validated
 * element-by-element (WR-02) before its cast to `number[]` below, so that
 * cast rests on a check rather than on hope.
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
    // WR-02: element-by-element, not a spread/cast on faith. Without this,
    // a non-integer entry (a numeric string, a float) passed parse silently
    // and turned every submitted prediction into an undiagnosed pre-filter
    // miss downstream instead of a clear parse-time refusal here.
    obj.ids.forEach((entry, i) => {
      if (!Number.isInteger(entry)) {
        throw new ScoringPreflightError(
          `pool manifest field "ids"[${i}] must be an integer, got ${JSON.stringify(entry)}`,
        );
      }
    });
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

  // Pre-invocation validation runs BEFORE the pre-filter, so the CD-01 cap
  // (and the other four checks) apply to the caller's own list rather than
  // to the post-filter remainder — a caller cannot get 25 entries past the
  // cap by having 5 of them filtered out first.
  const preValidationOutcome = validatePredDict(args.predDict);
  if (preValidationOutcome !== null) {
    const attempt: ScoringAttempt = {
      attemptId,
      queryId: args.queryId,
      kb: "prime",
      hfRevision: record.revisionSha,
      submittedPredDict: {},
      forfeitedIds: [],
      forfeitedCount: 0,
      outcome: preValidationOutcome,
      wallTimeMs: 0,
      receipt,
      artifactPath,
      stderrTail: "",
    };
    writeAttemptArtifact(args.outputDir, attempt);
    return attempt;
  }

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
      stderrTail: "",
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
  const enforcedTimeoutMs = args.timeoutMs ?? SCORING_TIMEOUT_MS;
  if (errorCode === "ETIMEDOUT") {
    // (1) timeout — first, because a timed-out spawnSync call ALSO sets
    // `signal`, and this branch must win before branch (2) ever sees it.
    outcome = { outcome: "timeout", timeoutMs: enforcedTimeoutMs };
  } else if (result.signal !== null) {
    // (2) signal termination (SIGKILL/SIGTERM), not a timeout. Only reached
    // when branch (1) did not fire, which is what keeps a real timeout out
    // of this member.
    outcome = { outcome: "signal-terminated", signal: result.signal };
  } else if (result.error !== undefined) {
    // (3) process unreachable for any other reason (ENOENT, spawn failure).
    // Carries the error's message verbatim — this is the surface that means
    // the venv or the script is not where the bridge thought.
    outcome = { outcome: "process-unreachable", errorMessage: result.error.message };
  } else if (result.status !== 0) {
    // (4) non-zero exit, no error/signal set. Carries a bounded stderr tail
    // so a torch traceback cannot make the attempt artifact unreadable —
    // this records the text, it never interprets it.
    outcome = {
      // ponytail: status is typed number|null, but branches (1)-(3) above
      // rule out every case Node itself documents for a null status here
      // (timeout, signal, spawn error) — the -1 fallback only fires if a
      // future Node release adds a new null-status case this branch order
      // doesn't yet know about.
      outcome: "nonzero-exit",
      exitCode: result.status ?? -1,
      stderrTail: boundedTail(result.stderr),
    };
  } else {
    // (5) otherwise, parse stdout. The ONLY try/catch in this module — only
    // around JSON.parse, which is the one step in this branch that can
    // itself throw.
    const trimmedStdout = result.stdout.trim();
    try {
      const parsed: unknown = JSON.parse(trimmedStdout);
      if (!isPlainObject(parsed)) {
        outcome = { outcome: "malformed-stdout", reason: "not-object", stdoutTail: boundedTail(trimmedStdout) };
      } else {
        const metricsRaw = (parsed as Record<string, unknown>).metrics;
        const metricsObj = isPlainObject(metricsRaw) ? metricsRaw : {};
        const missingKeys = REQUIRED_METRIC_KEYS.filter(
          (key) => !Object.prototype.hasOwnProperty.call(metricsObj, key),
        );
        if (missingKeys.length > 0) {
          outcome = { outcome: "missing-metrics", missingKeys };
        } else {
          outcome = { outcome: "scored", metrics: metricsObj as Record<string, number> };
        }
      }
    } catch {
      // Two concatenated JSON objects take exactly one distinguishing
      // shape: a "}" followed by whitespace then a "{" — JSON.parse itself
      // cannot succeed on that text (only one root value is legal), so the
      // shape test happens here, in the catch, deterministically.
      const looksLikeMultipleJson = /\}\s*\{/.test(trimmedStdout);
      outcome = {
        outcome: "malformed-stdout",
        reason: looksLikeMultipleJson ? "multiple-json" : "not-json",
        stdoutTail: boundedTail(trimmedStdout),
      };
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
    // Recorded for EVERY post-invocation outcome, including "scored" — this
    // is diagnostic evidence only and is never read to decide the outcome
    // above (Pitfall 6 / kept prohibition).
    stderrTail: boundedTail(result.stderr),
  };
  writeAttemptArtifact(args.outputDir, attempt);
  return attempt;
}

// ── Task 3: exhaustiveness and distinctness ─────────────────────────────

type ScoringOutcomeKind = ScoringOutcome["outcome"];

/**
 * Every key of `ScoringOutcome`'s own discriminant, assigned to an object
 * literal typed `Record<ScoringOutcomeKind, true>`. This is the exhaustiveness
 * mechanism, not `SCORING_OUTCOME_KINDS` itself: TypeScript requires EVERY
 * key of `ScoringOutcomeKind` to be present in an object literal assigned to
 * a `Record` of that key type, and rejects any key NOT in that type (excess
 * property check on the literal) — so a member added to `ScoringOutcome`
 * without a matching key here, or a stray key that doesn't match any member,
 * is a typecheck failure. Order here is stable and documented: happy path
 * first, then the six pre-invocation members in `validatePredDict`'s own
 * check order, then the six post-invocation members in `scorePrediction`'s
 * branch order — `Object.keys` preserves insertion order for non-numeric
 * string keys, so this order is what `SCORING_OUTCOME_KINDS` carries.
 */
const ALL_SCORING_OUTCOME_KINDS: Record<ScoringOutcomeKind, true> = {
  scored: true,
  "empty-prediction": true,
  "over-cap": true,
  "non-integer-prediction-id": true,
  "duplicate-prediction-id": true,
  "non-finite-score": true,
  "prefilter-miss": true,
  timeout: true,
  "signal-terminated": true,
  "process-unreachable": true,
  "nonzero-exit": true,
  "malformed-stdout": true,
  "missing-metrics": true,
};

/** The full failure-outcome table's discriminants, in the stable order
 *  documented on `ALL_SCORING_OUTCOME_KINDS` above — for table-driven tests
 *  and Phase 22's logging. */
export const SCORING_OUTCOME_KINDS: readonly ScoringOutcomeKind[] = Object.keys(
  ALL_SCORING_OUTCOME_KINDS,
) as ScoringOutcomeKind[];

/**
 * One-line, human-readable description of any `ScoringOutcome`, worded so a
 * log reader can tell an EXPECTED pre-filter miss apart from a genuine
 * process failure without reading the discriminant (§6's own requirement —
 * this wording is contract, not cosmetics). The `default` arm's `never`
 * assignment is the point of this function: it makes growing `ScoringOutcome`
 * without adding a matching arm here a compile error, and gives Phase 22's
 * runner a ready-made log line as a side effect.
 */
export function describeScoringOutcome(outcome: ScoringOutcome): string {
  switch (outcome.outcome) {
    case "scored":
      return `scored: metrics ${JSON.stringify(outcome.metrics)}`;
    case "empty-prediction":
      return "invalid input: the submitted prediction object had zero entries";
    case "over-cap":
      return `invalid input: submitted ${outcome.entryCount} entries, CD-01 caps at 20`;
    case "non-integer-prediction-id":
      return `invalid input: key "${outcome.key}" does not parse to an integer node id`;
    case "duplicate-prediction-id":
      return `invalid input: node id ${outcome.nodeId} appeared more than once after integer parsing`;
    case "non-finite-score":
      return `invalid input: key "${outcome.key}"'s value is not a finite number`;
    case "prefilter-miss":
      return (
        `expected pre-filter miss: every one of the ${outcome.forfeitedIds.length} submitted id(s) fell ` +
        `outside the committed candidate pool — this is a defined, expected outcome, not a process failure`
      );
    case "timeout":
      return `process failure: the scoring process exceeded the enforced ${outcome.timeoutMs}ms timeout`;
    case "signal-terminated":
      return `process failure: the scoring process was killed by signal ${outcome.signal}`;
    case "process-unreachable":
      return `process failure: the scoring process could not be reached (${outcome.errorMessage})`;
    case "nonzero-exit":
      return `process failure: the scoring process exited with code ${outcome.exitCode}`;
    case "malformed-stdout":
      return `process failure: the scoring process's stdout was not a single valid JSON object (${outcome.reason})`;
    case "missing-metrics":
      return `process failure: the scoring process's metrics omitted ${outcome.missingKeys.join(", ")}`;
    default: {
      const _exhaustive: never = outcome;
      throw new ScoringPreflightError(
        `describeScoringOutcome: unhandled outcome kind ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
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

  const versionResult = execFn(pythonPath, ["-c", VERSION_PROBE_PY], {
    input: "",
    timeout: SCORING_TIMEOUT_MS,
    encoding: "utf8",
  });
  // T-21-29 / CR-01 / WR-01: the same branch-order discipline scorePrediction
  // applies to the real scoring call, a few lines below in this module —
  // this guard runs before any parsing of the probe's output. Without it
  // the probe's own failure was invisible: a dead subprocess's partial/empty
  // output was parsed as though it were three valid version strings,
  // producing a misleading downstream field-mismatch error instead of
  // naming the dead probe.
  if (versionResult.error !== undefined || versionResult.signal !== null || versionResult.status !== 0) {
    const errorCode =
      versionResult.error !== undefined ? (versionResult.error as NodeJS.ErrnoException).code : undefined;
    throw new ScoringPreflightError(
      `version-probe subprocess failed (error=${versionResult.error?.message ?? "none"}, code=${errorCode}, ` +
        `status=${versionResult.status}, signal=${versionResult.signal}); ` +
        `stderr: ${boundedTail(versionResult.stderr ?? "")}`,
    );
  }
  const nonEmptyVersionLines = versionResult.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // T-21-33's "short stdout" case: a probe that exits 0 but somehow prints
  // fewer than three usable lines must be refused by name, never silently
  // yield empty-string version fields that a downstream mismatch message
  // would then misreport as the observed values.
  if (nonEmptyVersionLines.length < 3) {
    throw new ScoringPreflightError(
      `version-probe stdout had only ${nonEmptyVersionLines.length} non-empty line(s) after parsing ` +
        `(need 3): ${boundedTail(versionResult.stdout)}`,
    );
  }
  // T-21-30 braces: read the LAST three non-empty lines, not the first
  // three, so leading import-time chatter from any future source cannot
  // shift the fields — the belt is VERSION_PROBE_PY not importing the
  // package that used to emit the chatter at all. The `?? ""` fallbacks
  // noUncheckedIndexedAccess forces here are unreachable (the length guard
  // above already proved 3 elements exist) — that ordering is the
  // difference between a default and a silent misparse.
  const lastThreeVersionLines = nonEmptyVersionLines.slice(-3);
  const pythonVersion = lastThreeVersionLines[0] ?? "";
  const torchVersion = lastThreeVersionLines[1] ?? "";
  const starkQaVersion = lastThreeVersionLines[2] ?? "";

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
  // WR-03/T-21-32: the admission table's row id ("stark-prime") and STaRK's
  // own kb name ("prime", the argv value score_one.py takes and the name
  // harvest_pool.py writes into the committed manifest) are different
  // strings for the same KB — this check reads the manifest's own
  // vocabulary, a field that until now was parsed and never read.
  if (args.poolManifest.kb !== SCORE_ONE_KB_ARG) {
    throw new ScoringPreflightError(
      `pool manifest kb mismatch: expected "${SCORE_ONE_KB_ARG}", manifest declares "${args.poolManifest.kb}"`,
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
