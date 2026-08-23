/**
 * THE PRE-ROUND CALIBRATION PROBE (Phase 23 -- Ablation gate + powered
 * STaRK round, Plan 23-04, D-03). Answers what no offline test can: real
 * per-call latency for both roles through the collaborative runner
 * (`runCollaborativeBattery`), against the pinned model, and whether the
 * builder actually emits structurally valid artifacts at a workable rate.
 * It is advice the operator reads before choosing the round's per-call
 * ceiling (D-16, Plan 07) -- it wires NO gate into the round driver. No
 * per-call ceiling constant appears anywhere in this file: the ceiling is
 * what this probe's own measurements are FOR, and it is supplied to the
 * round driver as a required input in a later plan, never inferred here.
 *
 * DRAWS FROM THE SELECTION POOL ONLY, never the sealed heldout suite: this
 * file imports `buildCollaborativeBattery` (the selection loader) and
 * nothing else from `collaborative-battery.ts`. It does not import a
 * heldout loader (none exists yet -- D-07 is a separate plan) and does not
 * name the heldout fixture's file.
 *
 * STRICTLY SEQUENTIAL -- one request in flight at a time, no concurrency
 * knob anywhere in this file: `runOpts.concurrency` is passed as the
 * literal `1` on every `runCollaborativeBattery` call below, and pairs and
 * sampled queries are walked with a plain nested `for` loop, never
 * `Promise.all`.
 *
 * CHECKPOINT CORE RE-TYPED FOR THIS STUDY, never imported from the
 * paired-comparison arm's own `_paired-arms.ts`: `loadProbeState`/
 * `saveProbeState`/`onceProbe` below are this file's own copy of that
 * shape (state load distinguishing a missing file from a real error,
 * atomic tmp+rename save, a cached-key short-circuit).
 *
 * MUST be launched through `_launch-collab.sh` -- the sole sanctioned
 * detached launcher for this study directory -- never a bare backgrounded
 * `nohup ... &`:
 *
 *   COLLAB_PAIRS_COMMIT=<sha> bash _launch-collab.sh _collab-probe.ts collab-probe-state.json collab-probe.log
 *
 * (`COLLAB_STATE` is set by the launcher itself from its own second
 * argument -- an operator invoking this script directly, outside the
 * launcher, must set both `COLLAB_STATE` and `COLLAB_PAIRS_COMMIT`.)
 *
 * TESTABILITY: the required-env-var throws (`COLLAB_STATE`,
 * `COLLAB_PAIRS_COMMIT`) and every provider or subprocess call live INSIDE
 * `main()`, which only runs behind the `import.meta.url ===
 * file://process.argv[1]` guard at the bottom -- this module is
 * import-safe for `test/collab-round-pairs.test.ts`, which drives the
 * exported pure functions directly.
 */
import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  makeDefaultKbNeighborhoodFn,
  type KbNeighborhood,
  type KbNeighborhoodFn,
} from "../../src/foundry/collaborative-runner.js";
import { buildCollaborativeBattery, type CollaborativeBatteryTask } from "../../src/foundry/collaborative-battery.js";
import {
  parsePoolManifest,
  parseFingerprintManifest,
  type PoolManifest,
  type FingerprintManifest,
} from "../../src/foundry/collaborative-scoring-bridge.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";
import { loadCommittedPairs, type CommittedPair } from "./_collab-pairs.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(SCRIPT_DIR, "..", "..");

// The two committed manifests only -- pure local file reads, no network, no
// venv, no env var required. Safe at module scope (mirrors
// `test/collaborative-runner-live-smoke.test.ts`'s own module-scope
// manifest reads), so importing this module never throws.
const FIXTURE_STARK_DIR_REL = "test/fixtures/stark";
function readManifestJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, FIXTURE_STARK_DIR_REL, filename), "utf8"));
}
const POOL_MANIFEST: PoolManifest = parsePoolManifest(readManifestJson("prime-pool-manifest.json"));
const FINGERPRINT_MANIFEST: FingerprintManifest = parseFingerprintManifest(readManifestJson("fingerprint-manifest.json"));

// ── D-13: the pinned model this probe measures -- both roles, through the
// existing openai-compatible provider factory against the local Ollama
// endpoint, so this probe's latency figures are transferable to the
// powered round. ─────────────────────────────────────────────────────────

export const COLLAB_PROBE_MODEL = "gpt-oss:latest";
export const COLLAB_PROBE_MODEL_DIGEST = "17052f91a42e";
export const COLLAB_PROBE_BASE_URL = "http://localhost:11434/v1";

/** Ten selection-pool queries -- small enough to run in minutes, large
 *  enough to see real variance across both roles' latency and the
 *  builder's structural-validity rate. */
export const PROBE_SAMPLE_SIZE = 10;

/** Low but strictly positive (checkpoint decision 3a / T-22 precedent):
 *  `makeBattery`/`runCollaborativeBattery` refuse a non-positive
 *  `gateThreshold` as a vacuous pass, so this can never be 0. This probe
 *  tests the seams and measures latency, not model quality -- hit@1 is
 *  not expected to clear any real bar. */
export const PROBE_GATE_THRESHOLD = 0.01;

// ── the checkpoint core (re-typed for this study, never imported from
// `_paired-arms.ts`) ────────────────────────────────────────────────────

export interface ProbeUnitResult {
  pairId: string;
  pairRelPath: string;
  queryId: number;
  /** Whole wall time for this unit's own `runCollaborativeBattery` call,
   *  raw milliseconds, never rounded or converted. */
  wallMs: number;
  /** The preflight's own warm-up scoring call, raw milliseconds. */
  preflightWarmUpWallMs: number;
  /** The scoring bridge's own call for this unit's prediction, raw
   *  milliseconds -- `null` when the unit never reached scoring (a
   *  handoff failure short-circuits before any scoring call is made). */
  scoringWallMs: number | null;
  handoffOutcomeKind: string;
  hit1: number;
  /** Builder artifact's node/edge counts when the handoff succeeded
   *  (structural-validity evidence); `null` on any handoff failure. */
  nodeCount: number | null;
  edgeCount: number | null;
}

export interface ProbeState {
  units: Record<string, ProbeUnitResult>;
  retries: string[];
  runConfig?: Record<string, unknown>;
}

export function loadProbeState(statePath: string): ProbeState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<ProbeState>;
    return { units: parsed.units ?? {}, retries: parsed.retries ?? [], runConfig: parsed.runConfig };
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
export function saveProbeState(statePath: string, state: ProbeState): void {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

/** `${pairId}:${queryId}` -- self-describing checkpoint keys, so
 *  `collab-probe-state.json`'s own keys name both the pair and the query
 *  without a second lookup. */
export function probeUnitKey(pairId: string, queryId: number): string {
  return `${pairId}:${queryId}`;
}

/** Runs `key` once, ever -- a cached entry short-circuits `work` entirely
 *  (a resumed probe run does not repeat spent inference). */
export async function onceProbe(
  statePath: string,
  state: ProbeState,
  key: string,
  work: () => Promise<ProbeUnitResult>,
): Promise<ProbeUnitResult> {
  const cached = state.units[key];
  if (cached) return cached;
  const result = await work();
  state.units[key] = result;
  saveProbeState(statePath, state);
  return result;
}

// ── summary (pure, no filesystem access) ────────────────────────────────

export interface ProbeOrderStats {
  min: number;
  median: number;
  max: number;
}

export interface ProbeGroupSummary {
  unitCount: number;
  outcomeCounts: Record<string, number>;
  /** A count over a count, never a computed rate (the plan's own house
   *  rule) -- the reader divides, this file never rounds it for them. */
  structuralValidity: { successCount: number; totalCount: number };
  wallMs: ProbeOrderStats;
}

export interface ProbePairSummary extends ProbeGroupSummary {
  pairId: string;
  pairRelPath: string;
}

export interface ProbeSummary {
  overall: ProbeGroupSummary;
  byPair: ProbePairSummary[];
}

function orderStats(values: number[]): ProbeOrderStats {
  if (values.length === 0) return { min: 0, median: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { min: sorted[0]!, median, max: sorted[sorted.length - 1]! };
}

function summariseGroup(units: ProbeUnitResult[]): ProbeGroupSummary {
  const outcomeCounts: Record<string, number> = {};
  let successCount = 0;
  for (const u of units) {
    outcomeCounts[u.handoffOutcomeKind] = (outcomeCounts[u.handoffOutcomeKind] ?? 0) + 1;
    if (u.handoffOutcomeKind === "success") successCount++;
  }
  return {
    unitCount: units.length,
    outcomeCounts,
    structuralValidity: { successCount, totalCount: units.length },
    wallMs: orderStats(units.map((u) => u.wallMs)),
  };
}

/** Per pair and overall: unit count, outcome-kind tally, structural-
 *  validity count-over-count, and min/median/max unit wall times. Free of
 *  filesystem access -- takes a `ProbeState` value, returns a plain object. */
export function summariseProbe(state: ProbeState): ProbeSummary {
  const allUnits = Object.values(state.units);
  const byPairId = new Map<string, { pairRelPath: string; units: ProbeUnitResult[] }>();
  for (const unit of allUnits) {
    const entry = byPairId.get(unit.pairId) ?? { pairRelPath: unit.pairRelPath, units: [] };
    entry.units.push(unit);
    byPairId.set(unit.pairId, entry);
  }
  const byPair: ProbePairSummary[] = [...byPairId.entries()].map(([pairId, { pairRelPath, units }]) => ({
    pairId,
    pairRelPath,
    ...summariseGroup(units),
  }));
  return { overall: summariseGroup(allUnits), byPair };
}

// ── running one probe unit ──────────────────────────────────────────────

/** Memoised across pairs -- the same `queryId` recurs once per pair in the
 *  sample, and the underlying neighbourhood is a pure function of
 *  `queryId` alone (same pinned kb revision every call), so recomputing it
 *  per pair would spend a real Python subprocess call for a result already
 *  known (mirrors `test/collaborative-runner-live-smoke.test.ts`'s own
 *  `cachedLiveNeighborhoodFn`). */
function memoizeKbNeighborhoodFn(fn: KbNeighborhoodFn): KbNeighborhoodFn {
  const cache = new Map<number, KbNeighborhood>();
  return (queryId: number) => {
    const cached = cache.get(queryId);
    if (cached) return cached;
    const nb = fn(queryId);
    cache.set(queryId, nb);
    return nb;
  };
}

async function runOneUnit(
  pair: CommittedPair,
  task: CollaborativeBatteryTask,
  provider: Provider,
  warmUpQueryId: number,
  kbNeighborhoodFn: KbNeighborhoodFn,
): Promise<ProbeUnitResult> {
  const startedAt = Date.now();
  const record = await runCollaborativeBattery({
    candidate: pair.candidate,
    tasks: [task],
    batteryIdPrefix: `collab-probe:${pair.candidate.id}`,
    receipt: mintCollaborativeReceipt(),
    gateThreshold: PROBE_GATE_THRESHOLD,
    artifactDir: mkdtempSync(join(tmpdir(), "collab-probe-artifact-")),
    scoringOutputDir: mkdtempSync(join(tmpdir(), "collab-probe-scoring-")),
    kbNeighborhoodFn,
    poolManifest: POOL_MANIFEST,
    fingerprintManifest: FINGERPRINT_MANIFEST,
    warmUp: { queryId: warmUpQueryId, predDict: { "0": 1.0 } },
    // Concurrency of exactly 1, and only ever 1 -- the single local
    // inference slot, one request in flight always (the round's own
    // equal-treatment invariant, applied here too).
    //
    // `provider` here is NOT redundant with `providerImpl`: `providerImpl`
    // supplies the transport (the already-constructed `Provider`, so
    // `runAgentBattery` skips its own `createProvider` call), but the
    // *model name* sent on every chat request comes from
    // `providerSelection.model`, which `agent-runner.ts` resolves as
    // `opts.provider?.model ?? DEFAULT_BATTERY_MODEL` whenever
    // `providerImpl` is set (agent-runner.ts:348-355). Omitting `provider`
    // here silently falls through to `DEFAULT_BATTERY_MODEL` -- currently
    // `"granite4.1:30b"`, D-13's un-pinned model -- on every single call.
    // Fixed post-launch-invalidation: the first probe run (2026-08-23) ran
    // entirely on granite because this field was missing.
    runOpts: {
      providerImpl: provider,
      concurrency: 1,
      provider: { kind: "openai", baseUrl: COLLAB_PROBE_BASE_URL, model: COLLAB_PROBE_MODEL },
    },
  });
  const wallMs = Date.now() - startedAt;
  const outcome = record.outcomes[0]!;
  const attempt = record.attempts[0];
  const nodeCount = outcome.handoffOutcome.kind === "success" ? outcome.handoffOutcome.artifact.nodes.length : null;
  const edgeCount = outcome.handoffOutcome.kind === "success" ? outcome.handoffOutcome.artifact.edges.length : null;
  return {
    pairId: pair.candidate.id,
    pairRelPath: pair.relPath,
    queryId: task.queryId,
    wallMs,
    preflightWarmUpWallMs: record.preflight.warmUpWallTimeMs,
    scoringWallMs: attempt ? attempt.wallTimeMs : null,
    handoffOutcomeKind: outcome.handoffOutcome.kind,
    hit1: outcome.hit1,
    nodeCount,
    edgeCount,
  };
}

// ══════════════════════════════════ main ═══════════════════════════════

const COLLAB_STATE_ENV_VAR = "COLLAB_STATE";
const COLLAB_PAIRS_COMMIT_ENV_VAR = "COLLAB_PAIRS_COMMIT";
const VERDICT_FILE = "collab-probe-verdict.json";

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[collab-probe] ${name} must be set explicitly (no default)`);
  return v;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

function captureRunConfig(pairsCommit: string): Record<string, unknown> {
  return {
    repositoryCommit: safeExec("git rev-parse HEAD"),
    pairFilesCommit: pairsCommit,
    model: COLLAB_PROBE_MODEL,
    modelDigest: COLLAB_PROBE_MODEL_DIGEST,
    baseUrl: COLLAB_PROBE_BASE_URL,
    sampleSize: PROBE_SAMPLE_SIZE,
    concurrency: 1,
    gateThreshold: PROBE_GATE_THRESHOLD,
    startedAt: new Date().toISOString(),
  };
}

function writeVerdict(data: unknown): void {
  const p = join(SCRIPT_DIR, VERDICT_FILE);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

async function main(): Promise<void> {
  const statePath = requireEnvVar(COLLAB_STATE_ENV_VAR);
  const pairsCommit = requireEnvVar(COLLAB_PAIRS_COMMIT_ENV_VAR);
  console.log(
    `# COLLAB PROBE — state: ${statePath} · pairs commit: ${pairsCommit} · model: ${COLLAB_PROBE_MODEL} · ` +
      `sample size: ${PROBE_SAMPLE_SIZE} · gate threshold: ${PROBE_GATE_THRESHOLD}`,
  );

  const state = loadProbeState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig(pairsCommit);
    saveProbeState(statePath, state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const pairs = loadCommittedPairs(pairsCommit);
  const allTasks = buildCollaborativeBattery();
  // Ascending query-id order, defensively re-sorted here (never trusting
  // the fixture's own on-disk order to already be sorted) -- deterministic
  // and reproducible regardless of fixture layout.
  const sample = [...allTasks].sort((a, b) => a.queryId - b.queryId).slice(0, PROBE_SAMPLE_SIZE);
  const warmUpQueryId = sample[0]!.queryId;

  const provider = createProvider({ kind: "openai", baseUrl: COLLAB_PROBE_BASE_URL });
  const kbNeighborhoodFn = memoizeKbNeighborhoodFn(makeDefaultKbNeighborhoodFn());

  for (const pair of pairs) {
    for (const task of sample) {
      const key = probeUnitKey(pair.candidate.id, task.queryId);
      // ponytail: no harness-fault retry wrapper here (unlike D-16's
      // `onceWithHarnessRetry`, which belongs to the round driver) — this
      // probe is advice read once by an operator, not a multi-hour
      // detached round; `state.retries` stays present (for the verdict's
      // wire shape) but unpopulated until a later plan actually needs it.
      await onceProbe(statePath, state, key, () => runOneUnit(pair, task, provider, warmUpQueryId, kbNeighborhoodFn));
    }
  }

  const summary = summariseProbe(state);

  // Written ONLY here, after the full deterministic pair × sample order is
  // exhausted. Nothing else in this file, or in the phase, may treat the
  // probe as finished on any other signal.
  writeVerdict({
    complete: true,
    summary,
    runConfig: state.runConfig,
    retries: state.retries,
  });
  console.log(
    `\n=> COLLAB PROBE complete: ${summary.overall.structuralValidity.successCount}/` +
      `${summary.overall.structuralValidity.totalCount} structurally valid builder artifacts across ` +
      `${summary.overall.unitCount} units. Verdict: ${VERDICT_FILE}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
