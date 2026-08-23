/**
 * THE DETACHED, CHECKPOINTED ROUND DRIVER (Phase 23 -- Ablation gate +
 * powered STaRK round, Plan 23-07, REQ-82; D-01/D-04/D-06/D-13/D-16 in
 * `.planning/phases/23-ablation-gate-powered-stark-round/23-CONTEXT.md`).
 *
 * Three seeded pairs run the unmodified Phase 22 tournament shell
 * (`runCollaborativeRound`) over the selection pool; the pair the shell's
 * own promotion step actually promotes runs the sealed 75-query heldout
 * suite alone, in two per-query-interleaved arms (graph-handoff, then the
 * pre-registered no-subgraph null); the ablation gate is evaluated exactly
 * once, after every one of the 150 heldout units is complete; one verdict
 * artifact is written exactly once, its completion marker true.
 *
 * SHAPE COPIED FROM THE PAIRED-COMPARISON STUDY DRIVER
 * (`experiments/paired-comparison-arm/_paired-study.ts`/`_paired-arms.ts`),
 * NEVER IMPORTED FROM IT: the env contract's throw-on-missing-input, the
 * checkpoint core (`loadState`/`saveState`/`once`), the harness-fault retry
 * wrapper (`onceWithHarnessRetry`), and `main()`'s ESM direct-execution
 * guard are all re-derived here, fresh, exactly as every prior detached
 * driver in this repository does.
 *
 * MUST be launched through `_launch-collab.sh` -- the sole sanctioned
 * detached launcher for this study directory -- never a bare backgrounded
 * `nohup ... &`:
 *
 *   COLLAB_PAIRS_COMMIT=<sha> COLLAB_ROUND_CEILING_MS=<ms> \
 *   COLLAB_ROUND_ARCHIVE_ROOT=<path> COLLAB_ROUND_ARCHIVE_SLOT=<slot> \
 *   bash _launch-collab.sh _collab-round.ts collab-round-state.json collab-round.log
 *
 * (`COLLAB_ROUND_STATE` is set by the launcher itself from its own second
 * argument -- an operator invoking this script directly, outside the
 * launcher, must set `COLLAB_ROUND_STATE` too.)
 *
 * ONE REQUEST IN FLIGHT AT A TIME, ALWAYS -- every battery call in this file
 * passes `concurrency: 1`, and there is no knob anywhere in this file to
 * raise it. The single local inference slot is what makes the graph and
 * no-subgraph arms a paired comparison at all (equal treatment).
 *
 * THIS DRIVER IS THE SOLE SANCTIONED IMPORTER of the sealed heldout loader
 * (D-07) -- it is named in `test/collaborative-heldout-import-boundary.test.ts`'s
 * own exclusion constant. Every guarantee about the sealed pool being
 * unspent before this point converges here: only the pair the shell's own
 * promotion step actually promoted ever reaches `buildCollaborativeHeldoutBattery`.
 *
 * THE VERDICT IS READ ONLY FROM AN ARTIFACT WHOSE COMPLETION MARKER IS
 * `true`. Nothing downstream (the report renderer, a later phase) may read
 * partial state -- `main()` writes the verdict artifact exactly once, at the
 * very end of a completed pass, through an atomic temporary-file-then-rename
 * writer.
 *
 * TESTABILITY: every provider, filesystem-write, subprocess, git and network
 * call this file makes lives behind an injectable seam that defaults to the
 * real implementation (mirrors `RunCollaborativeBatteryArgs`'s own additive
 * Rule-3 seams one module over) -- `test/collab-round-driver.test.ts` drives
 * every exported function fully offline. Importing this module performs no
 * call and throws nothing, even with no environment variable set; only the
 * `import.meta.url === file://process.argv[1]` entry guard at the bottom
 * invokes `main()` for real.
 */
import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  makeDefaultKbNeighborhoodFn,
  HANDOFF_OUTCOME_KINDS,
  CollaborativeRunnerError,
  type CollaborativeCandidate,
  type RunCollaborativeBatteryArgs,
  type CollaborativeRunRecord,
  type KbNeighborhoodFn,
  type HandoffOutcomeKind,
} from "../../src/foundry/collaborative-runner.js";
import {
  buildCollaborativeBattery,
  buildCollaborativeHeldoutBattery,
  type CollaborativeBatteryTask,
} from "../../src/foundry/collaborative-battery.js";
import {
  runCollaborativeRound,
  type RunCollaborativeRoundArgs,
  type CollaborativeRoundResult,
} from "../../src/foundry/collaborative-tournament-shell.js";
import {
  evaluateAblationGate,
  ABLATION_CRITICAL_VALUE_TABLE,
  type AblationGateVerdict,
  type AblationPairedUnit,
} from "../../src/foundry/collaborative-ablation-gate.js";
import {
  parsePoolManifest,
  parseFingerprintManifest,
  type PoolManifest,
  type FingerprintManifest,
  type ScoringExecFn,
} from "../../src/foundry/collaborative-scoring-bridge.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";
import type { RunBatteryOptions } from "../../src/foundry/agent-runner.js";
import { evalReward } from "../../src/selection.js";
import { BatteryShapeError } from "../../src/foundry/battery-types.js";
import { loadCommittedPairs, type CommittedPair } from "./_collab-pairs.js";
import {
  renderCollabRoundReport,
  type CollabRoundVerdict,
  type CollabRoundArm,
  type CollabRoundUnitRecord,
  type CollabRoundRunConfig,
  type CollabRoundArmDiagnostics,
  type CollabRoundSelectionPair,
  type CollabRoundPromotionVerdict,
  type CollabRoundSelection,
  type CollabRoundDiagnostics,
  type CollabRoundHeadline,
} from "./_collab-report.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(SCRIPT_DIR, "..", "..");

// ── D-13: the pinned model this round measures -- both roles, through the
// existing openai-compatible provider factory against the local Ollama
// endpoint. NOT exported: every consumer reads these values back out of
// `buildRunConfig`'s own output rather than importing a second literal. ────
const COLLAB_ROUND_MODEL = "gpt-oss:latest";
const COLLAB_ROUND_MODEL_DIGEST = "17052f91a42e";
const COLLAB_ROUND_BASE_URL = "http://localhost:11434/v1";

/** Low but strictly positive (mirrors `_collab-probe.ts`'s
 *  `PROBE_GATE_THRESHOLD`): `makeBattery`/`runCollaborativeBattery` refuse a
 *  non-positive `gateThreshold` as a vacuous pass. This round's own §7 gate
 *  is `evaluateAblationGate`, not this per-battery accuracy floor. */
const COLLAB_ROUND_GATE_THRESHOLD = 0.01;

// The two committed manifests only -- pure local file reads, no network, no
// venv, no env var required. Safe at module scope (mirrors
// `_collab-probe.ts`'s own module-scope manifest reads).
const FIXTURE_STARK_DIR_REL = "test/fixtures/stark";
function readManifestJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, FIXTURE_STARK_DIR_REL, filename), "utf8"));
}
const POOL_MANIFEST: PoolManifest = parsePoolManifest(readManifestJson("prime-pool-manifest.json"));
const FINGERPRINT_MANIFEST: FingerprintManifest = parseFingerprintManifest(readManifestJson("fingerprint-manifest.json"));

// ── required inputs (D-16, no default anywhere) ─────────────────────────

const STATE_PATH_ENV_VAR = "COLLAB_ROUND_STATE";
const PAIRS_COMMIT_ENV_VAR = "COLLAB_PAIRS_COMMIT";
const CEILING_MS_ENV_VAR = "COLLAB_ROUND_CEILING_MS";
const ARCHIVE_ROOT_ENV_VAR = "COLLAB_ROUND_ARCHIVE_ROOT";
const ARCHIVE_SLOT_ENV_VAR = "COLLAB_ROUND_ARCHIVE_SLOT";

/** Throws by name -- mirrors `_paired-study.ts`'s own required-state-path
 *  helper, generalised to any env var name. No default exists for any of
 *  the five inputs this driver requires; a caller that wants a different
 *  value sets the environment variable, never a code edit. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name];
  if (!v) {
    throw new Error(`[collab-round] ${name} must be set explicitly (no default)`);
  }
  return v;
}

/**
 * The per-call ceiling is deliberately a required input rather than a
 * source constant (D-16): it is calibrated from Plan 06's own probe
 * measurements, and an uncalibrated round -- one that either times out real
 * calls or waits forever on a genuinely hung one -- is worse than no round
 * at all. Refuses a non-positive or non-integer value by name.
 */
function requirePositiveIntegerEnv(name: string, env: NodeJS.ProcessEnv = process.env): number {
  const raw = requireEnv(name, env);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`[collab-round] ${name} must be a positive integer number of milliseconds, got ${JSON.stringify(raw)}`);
  }
  return n;
}

// ── checkpoint core (re-typed for this study, never imported from
// `_paired-arms.ts` or from `_collab-probe.ts`) ─────────────────────────

export interface CollabUnitResult {
  arm: CollabRoundArm;
  queryId: number;
  candidateId: string;
  /** `ok` never means "hit@1" -- it means the harness completed the call
   *  without a harness-level fault. A genuine miss (wrong/empty answer, a
   *  fail-closed handoff outcome) is still `status: "ok"`; only a harness
   *  fault (a provider/task-level error or timeout) changes this field. */
  status: "ok" | "timeout" | "error";
  /**
   * Loosely typed as `string`, never `HandoffOutcomeKind` (mirrors
   * `_collab-probe.ts`'s own `ProbeUnitResult.handoffOutcomeKind`): this
   * driver's own single-task-per-call shape can observe TWO non-completion
   * events the runner's closed 10-member union has no member for --
   * `"all-handoffs-failed-battery-refused"` (the zero-surviving-tasks
   * battery-shape boundary) and `"neighbourhood-refused"` (a deterministic
   * kbNeighborhoodFn refusal). Every real `HandoffOutcomeKind` value passes
   * through unchanged. See `runOneUnit`'s catch clauses.
   */
  handoffOutcomeKind: string;
  /** 0 or 1 -- a non-completion is already folded to 0 here, by construction
   *  of every branch in `runOneUnit` (§7's non-completion-as-miss rule). */
  hit1: number;
  wallMs: number;
  /** The scoring attempt's own reported wall time -- present only when the
   *  task actually reached the bridge (mirrors
   *  `CollaborativeTaskOutcome.attempt` being optional). */
  scoringAttemptWallMs?: number;
  /** Every other metric the bridge reported, diagnostics only. */
  diagnostics: Record<string, number>;
  failureReason?: string;
}

export interface CollabRoundState {
  units: Record<string, CollabUnitResult>;
  retries: string[];
  runConfig?: CollabRoundRunConfig;
  /**
   * The PROJECTED, JSON-serialisable result of the selection round --
   * winner id, per-pair search fitness, the promotion verdict and its
   * reason. Persisted immediately after the shell round function returns,
   * BEFORE any heldout unit runs. A resumed run reads this back instead of
   * re-calling the shell: `CollaborativeRoundResult` itself (Maps,
   * receipts, live `AgentBattery` objects) is not serialisable, and
   * re-running the shell on resume would re-spend three real batteries of
   * inference, append a SECOND component-archive entry (the shell appends
   * on both verdicts), and -- since `select()` over fresh LLM output is
   * nondeterministic -- could promote a DIFFERENT winner than the first
   * attempt, silently orphaning every heldout unit already checkpointed
   * under the old winner's candidate id.
   */
  selection?: CollabRoundSelection;
}

export function loadState(statePath: string): CollabRoundState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<CollabRoundState>;
    return {
      units: parsed.units ?? {},
      retries: parsed.retries ?? [],
      ...(parsed.runConfig ? { runConfig: parsed.runConfig } : {}),
      ...(parsed.selection ? { selection: parsed.selection } : {}),
    };
  } catch (e) {
    // ENOENT is the ONLY case for which "no state yet, start fresh" is
    // correct -- every other failure (corrupt JSON, EACCES, a typo'd path
    // resolving to an unrelated file) must not be swallowed into empty
    // state (mirrors `_paired-arms.ts`'s own `loadState`).
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { units: {}, retries: [] };
    throw e;
  }
}

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state. */
export function saveState(statePath: string, state: CollabRoundState): void {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

/**
 * `${arm}:${candidateId}:${queryId}` -- self-describing: the state file's
 * own keys name the arm, the promoted candidate and the query without a
 * second lookup, and a retried unit still occupies exactly one entry here.
 */
export function unitKey(arm: CollabRoundArm, candidateId: string, queryId: number): string {
  return `${arm}:${candidateId}:${queryId}`;
}

/** Runs `key` once, ever -- a cached entry short-circuits `work` entirely
 *  and is returned BY REFERENCE (never re-derived), so a resumed run spends
 *  no provider call for an already-completed unit. */
export async function once(
  statePath: string,
  state: CollabRoundState,
  key: string,
  work: () => Promise<CollabUnitResult>,
): Promise<CollabUnitResult> {
  const cached = state.units[key];
  if (cached) return cached;
  const result = await work();
  state.units[key] = result;
  saveState(statePath, state);
  return result;
}

/**
 * D-16: a `status: "error"` result is retried at MOST once, logged into
 * `state.retries`, and never appended as a second entry -- the checkpoint
 * map still holds exactly one result per key. A `timeout` is a
 * non-completion under the pre-registration and is NEVER retried here --
 * re-running it would spend the single inference slot twice for a result
 * that is already a miss.
 */
export async function onceWithHarnessRetry(
  statePath: string,
  state: CollabRoundState,
  key: string,
  work: () => Promise<CollabUnitResult>,
): Promise<CollabUnitResult> {
  return once(statePath, state, key, async () => {
    let result = await work();
    if (result.status === "error") {
      state.retries.push(`${key}: harness-fault retry (${result.failureReason ?? "unknown error"})`);
      result = await work();
    }
    return result;
  });
}

// ── run configuration ────────────────────────────────────────────────────

function sha256Hex(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function defaultGitRevParseHead(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

/**
 * Assembles the run configuration `_collab-report.ts` declares. The two
 * discretionary values CONTEXT.md leaves to this plan's own discretion --
 * the archive root (the project's real `.stz/` audit tree) and the slot (a
 * fresh `collab-stark-prime`) -- are supplied by the operator through the
 * required `COLLAB_ROUND_ARCHIVE_ROOT`/`COLLAB_ROUND_ARCHIVE_SLOT` inputs,
 * never hardcoded here; this comment records what Plan 08's operator is
 * expected to pass.
 */
export function buildRunConfig(
  pairFileCommit: string,
  ceilingMs: number,
  archiveRoot: string,
  archiveSlot: string,
  warmUpQueryId: number,
  poolManifest: PoolManifest,
  fingerprintManifest: FingerprintManifest,
  gitRevParseFn: () => string = defaultGitRevParseHead,
): CollabRoundRunConfig {
  return {
    repoCommit: gitRevParseFn(),
    pairFileCommit,
    modelName: COLLAB_ROUND_MODEL,
    modelDigest: COLLAB_ROUND_MODEL_DIGEST,
    perCallCeilingMs: ceilingMs,
    concurrency: 1,
    gateThreshold: COLLAB_ROUND_GATE_THRESHOLD,
    // D-06/A2, recorded rather than defaulted (CONTEXT.md): one single-task
    // battery call per heldout unit, each paying its own preflight. The
    // resulting per-call overhead (~9.7s warm-up x 150 calls ~= 25 minutes)
    // is accepted per CONTEXT.md; recording the choice here is what makes
    // this run's own timings interpretable to a later reader.
    interleaving: "per-unit single-task battery calls, own preflight each (D-06/A2, accepted overhead)",
    manifestHashes: {
      poolManifest: sha256Hex(poolManifest),
      fingerprintManifest: sha256Hex(fingerprintManifest),
    },
    criticalValueTableHash: sha256Hex(ABLATION_CRITICAL_VALUE_TABLE),
    archiveRoot,
    archiveSlot,
    warmUpQueryId,
  };
}

// ── selection round (D-01: the shell, used verbatim) ────────────────────

export interface RunSelectionRoundArgs {
  candidates: CollaborativeCandidate[];
  tasks: CollaborativeBatteryTask[];
  runDir: string;
  gateThreshold: number;
  kbNeighborhoodFn: KbNeighborhoodFn;
  poolManifest: PoolManifest;
  fingerprintManifest: FingerprintManifest;
  warmUp: { queryId: number; predDict: Record<string, number> };
  archive: { root: string; slot: string };
  runOpts: RunBatteryOptions;
  execFn?: ScoringExecFn;
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
}

/**
 * D-01: calls the shell's own round function ONCE, with all three
 * candidates in the pair-file order, the full selection-pool task list, a
 * concurrency-1 run-options object, a strictly positive accuracy-gate
 * threshold, a zero diversity floor (this round's own three-candidate
 * generation, mirrors `test/foundry-collaborative-tournament-shell.test.ts`'s
 * own precedent), no incumbent (a fresh `collab-stark-prime` slot has none),
 * and the fixed warm-up argument. Returns the shell's result object
 * UNALTERED -- no re-derivation of the winner, no second promotion call.
 * Re-composing selection and promotion here would risk diverging from the
 * exact sequence the shell already proves.
 */
export async function runSelectionRound(
  args: RunSelectionRoundArgs,
  shellRoundFn: (a: RunCollaborativeRoundArgs) => Promise<CollaborativeRoundResult> = runCollaborativeRound,
): Promise<CollaborativeRoundResult> {
  return shellRoundFn({
    candidates: args.candidates,
    tasks: args.tasks,
    runDir: args.runDir,
    gateThreshold: args.gateThreshold,
    kbNeighborhoodFn: args.kbNeighborhoodFn,
    poolManifest: args.poolManifest,
    fingerprintManifest: args.fingerprintManifest,
    warmUp: args.warmUp,
    incumbentFrontmatter: null,
    incumbentFitness: null,
    diversityFloor: 0,
    archive: args.archive,
    runOpts: args.runOpts,
    ...(args.execFn ? { execFn: args.execFn } : {}),
    ...(args.readFileFn ? { readFileFn: args.readFileFn } : {}),
    ...(args.hubCacheRoot ? { hubCacheRoot: args.hubCacheRoot } : {}),
  });
}

/**
 * Projects the shell's own (non-serialisable) result into the JSON shape
 * `CollabRoundState.selection`/`CollabRoundVerdict.diagnostics.selection`
 * need -- per-pair search fitness (`evalReward` over each candidate's own
 * search-half fitness run, never the winner-only promotion fitness), the
 * winner id, and the promotion verdict with its reason joined from
 * `PromotionVerdict.failed` (or a distinct reason when no candidate ever
 * reached selection at all, `judgment.winner === null`).
 */
function projectSelection(result: CollaborativeRoundResult, pairs: CommittedPair[]): CollabRoundSelection {
  const pairsOut: CollabRoundSelectionPair[] = pairs.map((p) => {
    const run = result.searchRuns.get(p.candidate.id);
    return {
      specimenId: p.candidate.id,
      pairFileBasename: p.relPath,
      searchFitness: run ? evalReward(run.fitnessRun.result) : 0,
    };
  });
  const promotionVerdict: CollabRoundPromotionVerdict = result.promotion
    ? {
        promote: result.promotion.verdict.promote,
        reason: result.promotion.verdict.promote ? "promoted" : result.promotion.verdict.failed.join("; "),
      }
    : { promote: false, reason: "no winner selected by the selection round's judgment (judgment.winner === null)" };
  return { pairs: pairsOut, winner: result.winner, promotionVerdict };
}

// ── heldout units (D-04/D-06: winner only, per-query interleaved) ───────

export interface HeldoutRunConfig {
  ceilingMs: number;
  warmUpQueryId: number;
  gateThreshold: number;
  kbNeighborhoodFn: KbNeighborhoodFn;
  poolManifest: PoolManifest;
  fingerprintManifest: FingerprintManifest;
  provider: Provider;
  execFn?: ScoringExecFn;
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
}

/** Kinds this driver's own single-task-per-call shape can observe that the
 *  runner's closed `HandoffOutcomeKind` union has no member for. Both are
 *  non-completions (never a harness fault, never retried); see the two
 *  narrow catch clauses in `runOneUnit` below. */
const ALL_HANDOFFS_FAILED_KIND = "all-handoffs-failed-battery-refused";
const NEIGHBOURHOOD_REFUSED_KIND = "neighbourhood-refused";

async function runOneUnit(
  candidate: CollaborativeCandidate,
  task: CollaborativeBatteryTask,
  arm: CollabRoundArm,
  cfg: HeldoutRunConfig,
  batteryFn: (a: RunCollaborativeBatteryArgs) => Promise<CollaborativeRunRecord>,
): Promise<CollabUnitResult> {
  const startedAt = Date.now();
  try {
    const record = await batteryFn({
      candidate,
      tasks: [task],
      arm,
      batteryIdPrefix: `collab-round:${arm}:${candidate.id}`,
      receipt: mintCollaborativeReceipt(),
      gateThreshold: cfg.gateThreshold,
      artifactDir: mkdtempSync(join(tmpdir(), "collab-round-artifact-")),
      scoringOutputDir: mkdtempSync(join(tmpdir(), "collab-round-scoring-")),
      kbNeighborhoodFn: cfg.kbNeighborhoodFn,
      poolManifest: cfg.poolManifest,
      fingerprintManifest: cfg.fingerprintManifest,
      warmUp: { queryId: cfg.warmUpQueryId, predDict: { "0": 1.0 } },
      // `providerImpl` supplies TRANSPORT ONLY -- the model name actually
      // sent on the wire comes from `provider.model`, which `agent-runner.ts`
      // resolves as `opts.provider?.model ?? DEFAULT_BATTERY_MODEL` whenever
      // `providerImpl` is set. Omitting `provider` here would silently route
      // every call to `DEFAULT_BATTERY_MODEL` ("granite4.1:30b") regardless
      // of D-13's pin -- exactly the bug the orchestrator caught live during
      // Plan 23-06's first probe launch (deferred-items.md). `taskTimeoutMs`
      // is the per-call ceiling seam (verified against `agent-runner.ts` ->
      // `spawnSpecimens`): it bounds each LLM call (builder and answerer
      // separately), never the unit's whole wall time and never the Python
      // scoring subprocess (that keeps `SCORING_TIMEOUT_MS`).
      runOpts: {
        providerImpl: cfg.provider,
        concurrency: 1,
        taskTimeoutMs: cfg.ceilingMs,
        provider: { kind: "openai", baseUrl: COLLAB_ROUND_BASE_URL, model: COLLAB_ROUND_MODEL },
      },
      ...(cfg.execFn ? { execFn: cfg.execFn } : {}),
      ...(cfg.readFileFn ? { readFileFn: cfg.readFileFn } : {}),
      ...(cfg.hubCacheRoot ? { hubCacheRoot: cfg.hubCacheRoot } : {}),
    });
    const wallMs = Date.now() - startedAt;
    const answererStatus = record.answererRun.tasks[0]?.status ?? "ok";
    const builderStatus = record.builderRun?.tasks[0]?.status;
    const status: CollabUnitResult["status"] =
      answererStatus === "timeout" || builderStatus === "timeout"
        ? "timeout"
        : answererStatus === "error" || builderStatus === "error"
          ? "error"
          : "ok";
    const outcome = record.outcomes[0]!;
    return {
      arm,
      queryId: task.queryId,
      candidateId: candidate.id,
      status,
      handoffOutcomeKind: outcome.handoffOutcome.kind,
      hit1: outcome.hit1,
      wallMs,
      ...(outcome.attempt ? { scoringAttemptWallMs: outcome.attempt.wallTimeMs } : {}),
      diagnostics: outcome.diagnostics,
    };
  } catch (e) {
    const wallMs = Date.now() - startedAt;

    // Live-discovered bug 4 (orchestrator, this plan's continuation): a
    // KB-neighbourhood refusal (no seed entity found, timeout, non-zero
    // exit, malformed stdout -- every `makeDefaultKbNeighborhoodFn` failure
    // mode shares the "kbNeighborhoodFn:" message prefix) is a DETERMINISTIC
    // non-completion of the graph arm for this one query -- the same query
    // refuses again on any retry, so this is never a harness fault and is
    // never retried. Caught narrowly on the message this exact dispatch
    // throws (never a bare instanceof-only catch): an unrelated
    // `CollaborativeRunnerError` -- e.g. an unsafe task id or the
    // zero-tasks refusal -- still propagates and crashes this driver, as it
    // should. The no-subgraph null arm never calls `kbNeighborhoodFn` at
    // all (collaborative-runner.ts's own no-subgraph branch), so the null
    // unit for this same query is an entirely separate call and is
    // unaffected -- the pair stays paired.
    if (e instanceof CollaborativeRunnerError && e.message.includes("kbNeighborhoodFn:")) {
      return {
        arm,
        queryId: task.queryId,
        candidateId: candidate.id,
        status: "ok",
        handoffOutcomeKind: NEIGHBOURHOOD_REFUSED_KIND,
        hit1: 0,
        wallMs,
        diagnostics: {},
        failureReason: e.message,
      };
    }

    // The single-task battery-shape boundary (deferred-items.md; this
    // driver's own instance of the bug `_collab-probe.ts` hit live, Plan
    // 23-06). With exactly one task per call, "this unit's task failed
    // handoff" and "every task in the batch failed handoff" are the same
    // event, and `makeBattery` refuses a zero-task answerer battery by
    // design. Never a harness fault -- the model just produced an invalid
    // artifact -- so never retried either.
    if (e instanceof BatteryShapeError && e.message.includes("has zero tasks")) {
      return {
        arm,
        queryId: task.queryId,
        candidateId: candidate.id,
        status: "ok",
        handoffOutcomeKind: ALL_HANDOFFS_FAILED_KIND,
        hit1: 0,
        wallMs,
        diagnostics: {},
        failureReason:
          "all handoffs failed for this unit (runCollaborativeBattery refused a zero-task answerer battery) -- " +
          "recorded as a structural-validity miss, never a crash",
      };
    }

    // Anything else (a preflight failure, an unexpected bug) is systemic,
    // never one query's problem (D-11's own doc comment on
    // `runCollaborativeBattery`) -- rethrown, crashing this run. The
    // checkpoint already on disk means a resume repeats no completed unit
    // and spends no provider call twice; converting a systemic fault into a
    // per-unit miss would silently spend the sealed suite over garbage.
    throw e;
  }
}

/**
 * D-06: for each heldout query, in ascending order, the graph unit runs
 * immediately before its null partner -- both arms meet the same slot
 * conditions across the hours-long run, which is what makes this a paired
 * comparison. D-04: `winnerCandidate` is always the pair the selection
 * round's own promotion step promoted -- this function never receives a
 * losing candidate. Mutates `state` via the checkpoint core; a resumed call
 * with a partially-populated `state.units` executes only the remaining
 * units (`once`'s cached-key short-circuit).
 */
export async function runHeldoutUnits(
  statePath: string,
  state: CollabRoundState,
  winnerCandidate: CollaborativeCandidate,
  heldoutTasks: CollaborativeBatteryTask[],
  cfg: HeldoutRunConfig,
  batteryFn: (a: RunCollaborativeBatteryArgs) => Promise<CollaborativeRunRecord> = runCollaborativeBattery,
): Promise<void> {
  const ordered = [...heldoutTasks].sort((a, b) => a.queryId - b.queryId);
  for (const task of ordered) {
    for (const arm of ["graph", "no-subgraph"] as const) {
      const key = unitKey(arm, winnerCandidate.id, task.queryId);
      await onceWithHarnessRetry(statePath, state, key, () => runOneUnit(winnerCandidate, task, arm, cfg, batteryFn));
    }
  }
}

// ── folding to the gate's input shape ────────────────────────────────────

/**
 * Folds the 150 heldout unit results into 75 paired units, one per query id
 * ascending. Throws by name if either arm's key for a given query is
 * missing (REQ-82 boundary: a partial run cannot produce a verdict, and 149
 * units are not 150). `unit.hit1` already carries §7's non-completion-as-
 * miss discipline from `runOneUnit`'s own construction (every non-success
 * handoff outcome, every non-scored bridge outcome, a timeout, an error
 * after the permitted retry, and both of this driver's own synthetic
 * non-completion kinds already fold to 0) -- restated here as an explicit,
 * non-trusting `=== 1` comparison rather than trusting the stored value's
 * provenance.
 */
export function toAblationUnits(state: CollabRoundState, winnerId: string, queryIds: number[]): AblationPairedUnit[] {
  return queryIds.map((queryId) => {
    const graphKey = unitKey("graph", winnerId, queryId);
    const nullKey = unitKey("no-subgraph", winnerId, queryId);
    const graph = state.units[graphKey];
    const nullUnit = state.units[nullKey];
    if (!graph) {
      throw new Error(`[collab-round] toAblationUnits refused: missing heldout unit ${JSON.stringify(graphKey)} -- a partial run cannot fold to paired units`);
    }
    if (!nullUnit) {
      throw new Error(`[collab-round] toAblationUnits refused: missing heldout unit ${JSON.stringify(nullKey)} -- a partial run cannot fold to paired units`);
    }
    return {
      queryId,
      graphHit1: graph.hit1 === 1 ? 1 : 0,
      nullHit1: nullUnit.hit1 === 1 ? 1 : 0,
    };
  });
}

// ── diagnostics + verdict assembly ───────────────────────────────────────

/** Maps ANY observed unit kind to a real `HandoffOutcomeKind` for TALLY
 *  purposes only -- both of this driver's own synthetic non-completion
 *  kinds (`all-handoffs-failed-battery-refused`, `neighbourhood-refused`)
 *  bucket under `"bridge-non-success"` here ("never reached a scored
 *  state" is the least-false available label among the runner's closed
 *  10-member union) so the tally's key COUNT stays exactly 10 -- the
 *  per-unit table (`unitRecords`, built separately below) keeps the
 *  honest, un-bucketed string, so no audit fidelity is lost overall. Never
 *  bucketed under `"cd05-violation"` -- that would corrupt the D-08
 *  degeneracy reading with events that were never a structural-bounds
 *  violation. */
function tallyKindFor(observed: string): HandoffOutcomeKind {
  return (HANDOFF_OUTCOME_KINDS as readonly string[]).includes(observed) ? (observed as HandoffOutcomeKind) : "bridge-non-success";
}

function computeHandoffTally(units: CollabUnitResult[]): Record<HandoffOutcomeKind, number> {
  const tally = Object.fromEntries(HANDOFF_OUTCOME_KINDS.map((k) => [k, 0])) as Record<HandoffOutcomeKind, number>;
  for (const u of units) tally[tallyKindFor(u.handoffOutcomeKind)]++;
  return tally;
}

function computeArmDiagnostics(units: CollabUnitResult[]): CollabRoundArmDiagnostics {
  const n = units.length;
  const sumDiag = (key: string) => units.reduce((s, u) => s + (u.diagnostics[key] ?? 0), 0);
  return {
    meanReciprocalRank: n > 0 ? sumDiag("mrr") / n : 0,
    hitAt5Count: units.filter((u) => (u.diagnostics["hit@5"] ?? 0) === 1).length,
    recallAt20: n > 0 ? sumDiag("recall@20") / n : 0,
    // ponytail: the bridge's per-query metrics (REQUIRED_METRIC_KEYS =
    // mrr/hit@1/hit@5/recall@20) never carry a token count -- 0 is an
    // honest "not measured", never a fabricated figure. Upgrade trigger:
    // thread a FoundryCostMeter through runOpts and sum BatteryRun.cost if
    // token accounting is ever needed for this report.
    inputTokenCount: 0,
    errorCount: units.filter((u) => u.status === "error").length,
    nonCompletionCount: units.filter((u) => !(u.status === "ok" && u.handoffOutcomeKind === "success")).length,
  };
}

const VACUOUS_ARM_DIAGNOSTICS: CollabRoundArmDiagnostics = {
  meanReciprocalRank: 0,
  hitAt5Count: 0,
  recallAt20: 0,
  inputTokenCount: 0,
  errorCount: 0,
  nonCompletionCount: 0,
};

const VACUOUS_HEADLINE: CollabRoundHeadline = {
  graphHit1Count: 0,
  graphHit1Rate: 0,
  nullHit1Count: 0,
  nullHit1Rate: 0,
  meaningful: false,
};

/**
 * A structurally-valid but semantically vacuous `AblationGateVerdict`, used
 * ONLY on the `PROMOTION-REFUSED` branch below, where `evaluateAblationGate`
 * is never called (no heldout units were ever spent, so there is no
 * 75-paired-unit input to give it). `CollabRoundVerdict.gate` is a required
 * field in `_collab-report.ts`'s own declared shape, but
 * `renderCollabRoundReport` never reads it on the `PROMOTION-REFUSED`
 * branch (verified by inspection of that module) -- this object exists
 * only to satisfy the type, every field a named zero/false, never a real
 * accounting.
 */
const VACUOUS_GATE_VERDICT: AblationGateVerdict = {
  primaryPass: false,
  secondaryFlag: false,
  delta1: 6,
  delta2: 5,
  primaryDifference: 0,
  secondaryDifference: 0,
  counts: { pairs: 0, graphHits: 0, nullHits: 0, bothHit: 0, bothMiss: 0, graphOnlyHits: 0, nullOnlyHits: 0, discordant: 0 },
  signTest: { discordant: 0, criticalValue: null, graphOnlyHits: 0, result: "UNDERPOWERED" },
};

/**
 * Builds the verdict object satisfying `_collab-report.ts`'s declared
 * shape. D-12: when `selection.promotionVerdict.promote` is false, this
 * short-circuits to the `PROMOTION-REFUSED` terminal outcome BEFORE ever
 * calling `toAblationUnits`/`gateFn` -- an empty unit-record array, no gate
 * block requiring real counts, and the completion marker still `true` (a
 * refused promotion is a named terminal state, not a failed run). Otherwise
 * refuses to proceed unless every one of the 150 expected heldout units is
 * present (`toAblationUnits` throws by name on the first missing key), then
 * evaluates the gate exactly once and assembles the full verdict.
 */
export function assembleVerdict(
  state: CollabRoundState,
  selection: CollabRoundSelection,
  runConfig: CollabRoundRunConfig,
  heldoutQueryIds: number[],
  gateFn: typeof evaluateAblationGate = evaluateAblationGate,
): CollabRoundVerdict {
  // "Arm commits" records the exact repository commit both arms ran from --
  // D-05's null arm is one code path, never two, so there is no separate
  // per-arm commit to record; both keys carry the same repo commit as an
  // explicit statement that both arms are provably the same code.
  const armCommits: Record<CollabRoundArm, string> = { graph: runConfig.repoCommit, "no-subgraph": runConfig.repoCommit };

  if (!selection.promotionVerdict.promote) {
    return {
      complete: true,
      outcome: "PROMOTION-REFUSED",
      gate: VACUOUS_GATE_VERDICT,
      headline: VACUOUS_HEADLINE,
      diagnostics: {
        graph: VACUOUS_ARM_DIAGNOSTICS,
        nullArm: VACUOUS_ARM_DIAGNOSTICS,
        handoffOutcomeTally: computeHandoffTally([]),
        selection,
      },
      unitRecords: [],
      retries: state.retries,
      runConfig,
      armCommits,
    };
  }

  const winnerId = selection.winner;
  if (!winnerId) {
    throw new Error("[collab-round] assembleVerdict refused: promotionVerdict.promote is true but selection.winner is null -- inconsistent selection projection");
  }

  const pairedUnits = toAblationUnits(state, winnerId, heldoutQueryIds);
  const gate = gateFn(pairedUnits);

  const ascending = [...heldoutQueryIds].sort((a, b) => a - b);
  const graphUnits = ascending.map((q) => state.units[unitKey("graph", winnerId, q)]!);
  const nullUnits = ascending.map((q) => state.units[unitKey("no-subgraph", winnerId, q)]!);

  const headline: CollabRoundHeadline = {
    graphHit1Count: gate.counts.graphHits,
    graphHit1Rate: gate.counts.pairs > 0 ? gate.counts.graphHits / gate.counts.pairs : 0,
    nullHit1Count: gate.counts.nullHits,
    nullHit1Rate: gate.counts.pairs > 0 ? gate.counts.nullHits / gate.counts.pairs : 0,
    meaningful: gate.primaryPass,
  };

  const diagnostics: CollabRoundDiagnostics = {
    graph: computeArmDiagnostics(graphUnits),
    nullArm: computeArmDiagnostics(nullUnits),
    handoffOutcomeTally: computeHandoffTally([...graphUnits, ...nullUnits]),
    selection,
  };

  const unitRecords: CollabRoundUnitRecord[] = [];
  for (const q of ascending) {
    for (const arm of ["graph", "no-subgraph"] as const) {
      const u = state.units[unitKey(arm, winnerId, q)]!;
      unitRecords.push({
        arm,
        queryId: u.queryId,
        // Cast, not a bucket: the honest observed string (including this
        // driver's own two synthetic non-completion kinds) is preserved
        // here for full audit fidelity -- only the aggregate tally above
        // buckets to the closed union. `_collab-report.ts` only
        // interpolates this field into a markdown table cell; it never
        // validates it against `HANDOFF_OUTCOME_KINDS`.
        handoffOutcomeKind: u.handoffOutcomeKind as HandoffOutcomeKind,
        hit1: u.hit1,
        wallTimeMs: u.wallMs,
        ...(u.scoringAttemptWallMs !== undefined ? { scoringAttemptWallTimeMs: u.scoringAttemptWallMs } : {}),
        diagnostics: u.diagnostics,
      });
    }
  }

  return {
    complete: true,
    outcome: gate.primaryPass ? "GATE-PASS" : "GATE-FAIL",
    gate,
    headline,
    diagnostics,
    unitRecords,
    retries: state.retries,
    runConfig,
    armCommits,
  };
}

// ══════════════════════════════════ main ═══════════════════════════════

const VERDICT_FILE = "collab-round-verdict.json";
const REPORT_FILE = "COLLAB-ROUND-RESULTS.md";

function defaultWriteVerdict(data: unknown): void {
  const p = join(SCRIPT_DIR, VERDICT_FILE);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

function defaultWriteReport(text: string): void {
  const p = join(SCRIPT_DIR, REPORT_FILE);
  writeFileSync(`${p}.tmp`, text);
  renameSync(`${p}.tmp`, p);
}

/**
 * Every collaborator this driver needs is injectable, defaulting to the
 * real implementation (mirrors `RunCollaborativeBatteryArgs`'s own
 * additive Rule-3 seams) -- this is what lets `test/collab-round-driver.test.ts`
 * drive `main()` itself, fully offline, and assert the verdict write
 * happens exactly once.
 */
export interface CollabRoundDeps {
  env?: NodeJS.ProcessEnv;
  shellRoundFn?: (a: RunCollaborativeRoundArgs) => Promise<CollaborativeRoundResult>;
  batteryFn?: (a: RunCollaborativeBatteryArgs) => Promise<CollaborativeRunRecord>;
  gateFn?: typeof evaluateAblationGate;
  kbNeighborhoodFn?: KbNeighborhoodFn;
  execFn?: ScoringExecFn;
  readFileFn?: (path: string) => Buffer;
  hubCacheRoot?: string;
  loadPairsFn?: (commit: string) => CommittedPair[];
  selectionTasksFn?: () => CollaborativeBatteryTask[];
  heldoutTasksFn?: () => CollaborativeBatteryTask[];
  providerFn?: () => Provider;
  poolManifest?: PoolManifest;
  fingerprintManifest?: FingerprintManifest;
  writeVerdictFn?: (data: unknown) => void;
  writeReportFn?: (text: string) => void;
  chdirFn?: (dir: string) => void;
  gitRevParseFn?: () => string;
}

/**
 * The main function, behind the entry guard at the bottom of this file.
 * Requires every input; loads the committed pairs at the pinned commit;
 * loads the selection-pool tasks; builds the provider against the local
 * openai-compatible endpoint with the pinned model; runs the selection
 * round (or reads it back from a resumed state's own projection); on a
 * promotion verdict, runs the heldout units; evaluates the gate; assembles
 * and writes the verdict exactly once through an atomic writer, then
 * renders and writes the markdown report.
 *
 * `deps` is empty for the real, entry-guard-invoked run -- every field
 * defaults to the real implementation. `test/collab-round-driver.test.ts`
 * supplies stubs for every field to drive this function fully offline.
 */
export async function main(deps: CollabRoundDeps = {}): Promise<CollabRoundVerdict> {
  const env = deps.env ?? process.env;
  const statePath = requireEnv(STATE_PATH_ENV_VAR, env);
  const pairFileCommit = requireEnv(PAIRS_COMMIT_ENV_VAR, env);
  const ceilingMs = requirePositiveIntegerEnv(CEILING_MS_ENV_VAR, env);
  const archiveRoot = requireEnv(ARCHIVE_ROOT_ENV_VAR, env);
  const archiveSlot = requireEnv(ARCHIVE_SLOT_ENV_VAR, env);

  console.log(
    `# COLLAB ROUND DRIVER — state: ${statePath} · pairs commit: ${pairFileCommit} · ceiling: ${ceilingMs}ms · ` +
      `archive: ${archiveRoot}/${archiveSlot}`,
  );

  // `_launch-collab.sh` cds into `experiments/collab-round/` before spawning
  // `tsx` (deferred-items.md, live-discovered bug 1) -- every bare
  // repo-root-relative path the scoring bridge resolves
  // (`tools/stark-eval/...`) needs `process.cwd()` to be the repo root.
  // Every path this file itself touches above this line is already
  // absolute (SCRIPT_DIR/repoRoot-derived), so moving cwd here, once,
  // before any battery/scoring call, is safe.
  (deps.chdirFn ?? ((d: string) => process.chdir(d)))(repoRoot);

  const state = loadState(statePath);

  const loadPairsFn = deps.loadPairsFn ?? loadCommittedPairs;
  const pairs = loadPairsFn(pairFileCommit);
  const selectionTasks = (deps.selectionTasksFn ?? buildCollaborativeBattery)();
  const warmUpQueryId = selectionTasks[0]!.queryId;
  const poolManifest = deps.poolManifest ?? POOL_MANIFEST;
  const fingerprintManifest = deps.fingerprintManifest ?? FINGERPRINT_MANIFEST;

  if (!state.runConfig) {
    state.runConfig = buildRunConfig(
      pairFileCommit,
      ceilingMs,
      archiveRoot,
      archiveSlot,
      warmUpQueryId,
      poolManifest,
      fingerprintManifest,
      deps.gitRevParseFn,
    );
    saveState(statePath, state);
  }
  const runConfig = state.runConfig;
  console.log(`run config: ${JSON.stringify(runConfig)}\n`);

  const provider = (deps.providerFn ?? (() => createProvider({ kind: "openai", baseUrl: COLLAB_ROUND_BASE_URL })))();
  const kbNeighborhoodFn = deps.kbNeighborhoodFn ?? makeDefaultKbNeighborhoodFn();
  const runOpts: RunBatteryOptions = {
    providerImpl: provider,
    concurrency: 1,
    taskTimeoutMs: ceilingMs,
    provider: { kind: "openai", baseUrl: COLLAB_ROUND_BASE_URL, model: COLLAB_ROUND_MODEL },
  };

  let selection: CollabRoundSelection;
  if (state.selection) {
    // Resume: never re-run the shell -- see CollabRoundState.selection's own
    // doc comment for why (nondeterministic winner, double-archived entry,
    // orphaned heldout checkpoints under a stale candidate id).
    selection = state.selection;
  } else {
    const result = await runSelectionRound(
      {
        candidates: pairs.map((p) => p.candidate),
        tasks: selectionTasks,
        runDir: mkdtempSync(join(tmpdir(), "collab-round-selection-")),
        gateThreshold: COLLAB_ROUND_GATE_THRESHOLD,
        kbNeighborhoodFn,
        poolManifest,
        fingerprintManifest,
        warmUp: { queryId: warmUpQueryId, predDict: { "0": 1.0 } },
        archive: { root: archiveRoot, slot: archiveSlot },
        runOpts,
        ...(deps.execFn ? { execFn: deps.execFn } : {}),
        ...(deps.readFileFn ? { readFileFn: deps.readFileFn } : {}),
        ...(deps.hubCacheRoot ? { hubCacheRoot: deps.hubCacheRoot } : {}),
      },
      deps.shellRoundFn,
    );
    selection = projectSelection(result, pairs);
    // Persisted BEFORE any heldout call -- crash-safety for the selection
    // half mirrors the unit-level checkpoint below.
    state.selection = selection;
    saveState(statePath, state);
  }

  let verdict: CollabRoundVerdict;
  if (!selection.promotionVerdict.promote) {
    // D-12: the sealed heldout suite and its null arm are never spent on a
    // refused (or no-winner) promotion.
    verdict = assembleVerdict(state, selection, runConfig, [], deps.gateFn);
  } else {
    const winnerCandidate = pairs.find((p) => p.candidate.id === selection.winner)?.candidate;
    if (!winnerCandidate) {
      throw new Error(`[collab-round] no committed pair carries the promoted winner id ${JSON.stringify(selection.winner)}`);
    }
    const heldoutTasks = (deps.heldoutTasksFn ?? buildCollaborativeHeldoutBattery)();
    await runHeldoutUnits(
      statePath,
      state,
      winnerCandidate,
      heldoutTasks,
      {
        ceilingMs,
        warmUpQueryId,
        gateThreshold: COLLAB_ROUND_GATE_THRESHOLD,
        kbNeighborhoodFn,
        poolManifest,
        fingerprintManifest,
        provider,
        ...(deps.execFn ? { execFn: deps.execFn } : {}),
        ...(deps.readFileFn ? { readFileFn: deps.readFileFn } : {}),
        ...(deps.hubCacheRoot ? { hubCacheRoot: deps.hubCacheRoot } : {}),
      },
      deps.batteryFn,
    );
    verdict = assembleVerdict(
      state,
      selection,
      runConfig,
      heldoutTasks.map((t) => t.queryId),
      deps.gateFn,
    );
  }

  // Written ONCE -- the only completion signal anything downstream may read.
  const writeVerdictFn = deps.writeVerdictFn ?? defaultWriteVerdict;
  const writeReportFn = deps.writeReportFn ?? defaultWriteReport;
  writeVerdictFn(verdict);
  writeReportFn(renderCollabRoundReport(verdict));
  console.log(`\n=> COLLAB ROUND OUTCOME: ${verdict.outcome}`);
  return verdict;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
