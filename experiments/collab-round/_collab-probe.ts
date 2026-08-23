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
import { existsSync, readFileSync, renameSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  makeDefaultKbNeighborhoodFn,
  validateSubgraphAgainstNeighborhood,
  CollaborativeRunnerError,
  type KbNeighborhood,
  type KbNeighborhoodFn,
  type SubgraphArtifactV1,
} from "../../src/foundry/collaborative-runner.js";
import { buildCollaborativeBattery, type CollaborativeBatteryTask } from "../../src/foundry/collaborative-battery.js";
import {
  parsePoolManifest,
  parseFingerprintManifest,
  type PoolManifest,
  type FingerprintManifest,
} from "../../src/foundry/collaborative-scoring-bridge.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";
import { BatteryShapeError } from "../../src/foundry/battery-types.js";
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
  /** The preflight's own warm-up scoring call, raw milliseconds -- `null`
   *  when the unit's `runCollaborativeBattery` call threw before returning a
   *  `record` at all (the all-handoffs-failed battery-shape boundary below),
   *  so the figure that WAS observed is simply unrecoverable. Never
   *  fabricated as `0` -- a `0` here would look like a real, fast preflight
   *  instead of "not measured". */
  preflightWarmUpWallMs: number | null;
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
  /** Diagnostic for Plan 08's go/no-go: what actually went wrong on a
   *  failure. Empty on success. Optional -- units checkpointed before this
   *  field existed have no key at all, never an empty array with different
   *  meaning; `summariseGroup` below reads `?? []`. See
   *  `classifyBuilderArtifactFailure`'s own doc comment for what this can
   *  and cannot distinguish. */
  handoffFailureKinds?: string[];
  /** First violation string for the classified failure, or `null` when
   *  none was recoverable (or the unit succeeded). Optional for the same
   *  pre-existing-checkpoint reason as `handoffFailureKinds`. */
  handoffFailureDetail?: string | null;
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
  /** Tally of `handoffFailureKinds` across every unit in the group (a unit
   *  contributes to at most one key today -- `handoffFailureKinds` is
   *  always 0 or 1 elements long as this file constructs it, never
   *  double-counted). Absent on pre-diagnostic checkpointed units, which
   *  contribute nothing here (not a fabricated "unknown" bucket). */
  handoffFailureKindCounts: Record<string, number>;
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
  const handoffFailureKindCounts: Record<string, number> = {};
  let successCount = 0;
  for (const u of units) {
    outcomeCounts[u.handoffOutcomeKind] = (outcomeCounts[u.handoffOutcomeKind] ?? 0) + 1;
    if (u.handoffOutcomeKind === "success") successCount++;
    // `?? []` tolerates units checkpointed before this field existed.
    for (const kind of u.handoffFailureKinds ?? []) {
      handoffFailureKindCounts[kind] = (handoffFailureKindCounts[kind] ?? 0) + 1;
    }
  }
  return {
    unitCount: units.length,
    outcomeCounts,
    structuralValidity: { successCount, totalCount: units.length },
    wallMs: orderStats(units.map((u) => u.wallMs)),
    handoffFailureKindCounts,
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

// Exported (not `main()`-internal) so a throwaway, uncommitted diagnose
// script can call it directly against a single already-checkpointed unit
// for a live re-measurement -- WITHOUT going through `onceProbe`/`main`'s
// state-file write, so the diagnostic run never touches
// `collab-probe-state.json`. Still never driven through vitest: no
// execFn/preflightFn injection point exists here, so a live call still
// spawns the real Python scoring toolchain (see
// `classifyBuilderArtifactFailure`'s own tests for why the offline suite
// tests that function directly instead).
export async function runOneUnit(
  pair: CommittedPair,
  task: CollaborativeBatteryTask,
  provider: Provider,
  warmUpQueryId: number,
  kbNeighborhoodFn: KbNeighborhoodFn,
): Promise<ProbeUnitResult> {
  const startedAt = Date.now();
  // Hoisted out of the call's inline options object so the catch below can
  // read the builder's own artifact directory after a battery refusal --
  // `runCollaborativeBattery` writes (or fails to write) the builder's
  // subgraph artifact here BEFORE the zero-task refusal can ever fire, so
  // the directory is populated by the time any catch branch runs.
  const artifactDir = mkdtempSync(join(tmpdir(), "collab-probe-artifact-"));
  try {
    const record = await runCollaborativeBattery({
      candidate: pair.candidate,
      tasks: [task],
      batteryIdPrefix: `collab-probe:${pair.candidate.id}`,
      receipt: mintCollaborativeReceipt(),
      gateThreshold: PROBE_GATE_THRESHOLD,
      artifactDir,
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
      handoffFailureKinds: outcome.handoffOutcome.kind === "success" ? [] : [outcome.handoffOutcome.kind],
      handoffFailureDetail: null,
    };
  } catch (e) {
    // `runCollaborativeBattery` is called here with exactly ONE task per
    // unit (this probe's own design), so "this unit's task failed handoff"
    // and "every task in the batch failed handoff" are the same event --
    // and `makeBattery` refuses a zero-task answerer battery by design (see
    // `collaborative-runner.ts`'s own comment above `answererBattery`: "a
    // documented boundary this plan does not build machinery around").
    // Every single handoff failure would otherwise crash this whole probe,
    // which defeats D-03's own purpose -- measuring the RATE at which the
    // builder emits structurally valid artifacts necessarily requires
    // surviving some failures. Narrowly matched on the exact message this
    // boundary throws (this repo's own house rule: inspect thrown message
    // content, never a bare instanceof-only catch), so an unrelated
    // BatteryShapeError (a real shape bug, e.g. Plan 07's shared code path)
    // still propagates and crashes the probe as it should.
    if (e instanceof BatteryShapeError && e.message.includes("has zero tasks")) {
      const wallMs = Date.now() - startedAt;
      // Diagnostic capture (Phase 23 Plan 06 continuation #3): the runner's
      // own real classification (`failedOutcomeByTaskId`) is a local
      // variable, thrown away when `makeBattery` refuses -- see
      // `classifyBuilderArtifactFailure`'s own doc comment. This reads the
      // SAME on-disk builder artifact the runner already wrote (or did
      // not) for this unit's one task, best-effort, so Plan 08's go/no-go
      // is not stuck reading eight identical opaque
      // "all-handoffs-failed-battery-refused" rows with no further detail.
      const { kinds, detail } = classifyBuilderArtifactFailure(join(artifactDir, "builder"), task, kbNeighborhoodFn);
      console.log(
        `  [unit failed] pair=${pair.candidate.id} query=${task.queryId}: all handoffs failed for this unit ` +
          `(runCollaborativeBattery refused a zero-task answerer battery) -- recorded as a structural-validity ` +
          `miss, classified as ${JSON.stringify(kinds)}: ${detail}`,
      );
      return {
        pairId: pair.candidate.id,
        pairRelPath: pair.relPath,
        queryId: task.queryId,
        wallMs,
        // Not fabricated as 0 -- the preflight DID run inside the throwing
        // call, but its figure is unrecoverable once the exception ate the
        // `record` it would have lived on. `null` means "not measured",
        // never "measured as instant".
        preflightWarmUpWallMs: null,
        scoringWallMs: null,
        handoffOutcomeKind: "all-handoffs-failed-battery-refused",
        hit1: 0,
        nodeCount: null,
        edgeCount: null,
        handoffFailureKinds: kinds,
        handoffFailureDetail: detail,
      };
    }
    // Regression for launch attempt 4 (2026-08-23): `runCollaborativeBattery`
    // calls `args.kbNeighborhoodFn(task.queryId)` directly inside its own
    // per-task neighbourhood-fetch loop (collaborative-runner.ts:1268),
    // BEFORE the builder battery is even minted -- so `makeDefaultKbNeighborhoodFn`'s
    // FA-7 empty-seed-set refusal reaches this same try/catch as a bare
    // `CollaborativeRunnerError`, never wrapped in a `BatteryShapeError`. A
    // KB-neighbourhood refusal ("no KB node name matched the query text via
    // query-text seeding") is a deterministic non-completion of THIS unit --
    // the model asked about something the KB has no seed for -- not a
    // harness fault, and not a reason to kill the whole probe. Narrowly
    // matched on BOTH the "kbNeighborhoodFn" dispatch-site marker AND the
    // "no seed entity" empty-seed marker (this repo's own house rule:
    // inspect thrown message content, never a bare instanceof-only catch),
    // so a genuine harness fault at the identical dispatch site -- a
    // timeout, a killed subprocess, a spawn error, malformed stdout --
    // still propagates and crashes the probe as it should; only the
    // specific, deterministic empty-seed refusal is recorded as a miss.
    if (
      e instanceof CollaborativeRunnerError &&
      e.message.includes("kbNeighborhoodFn") &&
      e.message.includes("no seed entity")
    ) {
      const wallMs = Date.now() - startedAt;
      console.log(
        `  [unit failed] pair=${pair.candidate.id} query=${task.queryId}: KB-neighbourhood refusal ` +
          `(no seed entity matched this query -- FA-7 empty seed set) -- recorded as a structural-validity miss`,
      );
      return {
        pairId: pair.candidate.id,
        pairRelPath: pair.relPath,
        queryId: task.queryId,
        wallMs,
        // Not fabricated as 0 -- the preflight DID run inside the throwing
        // call (it runs before the neighbourhood fetch), but its figure is
        // unrecoverable once the exception ate the `record` it would have
        // lived on. `null` means "not measured", never "measured as instant"
        // -- mirrors the battery-shape branch above.
        preflightWarmUpWallMs: null,
        scoringWallMs: null,
        handoffOutcomeKind: "neighbourhood-refused",
        hit1: 0,
        nodeCount: null,
        edgeCount: null,
        // Already fully diagnosed by the narrow catch condition itself --
        // no on-disk artifact to read (this throw fires before the builder
        // battery is even minted), so no classifier call is needed here.
        handoffFailureKinds: ["neighbourhood-refused"],
        handoffFailureDetail: e.message,
      };
    }
    throw e;
  }
}

// ── per-handoff failure diagnostics (go/no-go for Plan 08) ─────────────
//
// Defined AFTER `runOneUnit` (not before it, and not co-located with the
// other helpers above `runOneUnit`) so this function's own `try`/`catch`
// (the JSON.parse guard below) never shifts the FIRST `try {` / `} catch
// (e) {` occurrence in this file away from `runOneUnit`'s own -- the
// existing structural regression tests in
// `test/collab-round-pairs.test.ts` locate that boundary by the file's
// first occurrence of each string.

/**
 * Best-effort, probe-side reconstruction of WHY a single-task
 * `runCollaborativeBattery` call refused. D-03's own "battery-refused"
 * boundary (see `runCollaborativeBattery`'s comment above `answererBattery`
 * in `collaborative-runner.ts`) throws a bare `BatteryShapeError` once the
 * answerer battery has zero surviving tasks -- the runner's real per-task
 * classification (`failedOutcomeByTaskId`, computed a few lines earlier in
 * the SAME function) is a local variable, never attached to the throw.
 * Before this fix every miss in this bucket was recorded only as the
 * opaque `"all-handoffs-failed-battery-refused"` outcome kind, with no way
 * to tell "the model cannot produce a valid artifact with these prompts"
 * (round is pointless) from "one structural bound is mis-tuned".
 *
 * Reads the SAME on-disk artifact the runner already wrote (or did not
 * write) before throwing, at the same path the runner itself resolves
 * (`builderArtifactDir/<taskId>/subgraph.json` -- `SUBGRAPH_ARTIFACT_REL_PATH`,
 * a private constant one module over, duplicated here as the literal
 * string rather than reached into), and reproduces the runner's own early
 * checks closely enough to distinguish the buckets that matter for a
 * go/no-go call: file absence, a parse failure, an unexpected shape
 * (mirrors `parseSubgraphArtifact`'s exact-key-set rejection of an unknown
 * field, D-05's smuggling-channel closure), and CD-05 structural
 * violations -- via the runner's own exported
 * `validateSubgraphAgainstNeighborhood`, given a freshly-fetched
 * neighbourhood. Cheap here: `kbNeighborhoodFn` is memoised
 * (`memoizeKbNeighborhoodFn` above) and this queryId was already fetched
 * once inside the failed call, so this second call hits the cache.
 *
 * NOT exhaustive: cannot distinguish `record-absent`/`record-corrupt`/
 * `hash-mismatch` (D-08's verify-at-read step) from a genuinely valid
 * artifact -- those cannot fail for a same-process artifact the runner
 * itself just wrote and read, so if a well-formed, CD-05-valid artifact
 * still lands here, the fallback bucket says so explicitly rather than
 * guessing at a kind this function cannot actually observe.
 */
export function classifyBuilderArtifactFailure(
  builderArtifactDir: string,
  task: CollaborativeBatteryTask,
  kbNeighborhoodFn: KbNeighborhoodFn,
): { kinds: string[]; detail: string } {
  const artifactPath = join(builderArtifactDir, task.id, "subgraph.json");
  if (!existsSync(artifactPath)) {
    return { kinds: ["artifact-absent"], detail: `no artifact at ${artifactPath}` };
  }
  const raw = readFileSync(artifactPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { kinds: ["unparseable"], detail: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kinds: ["unparseable"], detail: "parsed JSON value is not an object" };
  }
  const obj = parsed as Record<string, unknown>;
  const EXPECTED_KEYS = ["edges", "kbRevision", "nodes", "queryId", "schemaVersion"];
  const actualKeys = Object.keys(obj).sort();
  const shapeOk =
    obj.schemaVersion === 1 &&
    typeof obj.queryId === "number" &&
    typeof obj.kbRevision === "string" &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges) &&
    actualKeys.length === EXPECTED_KEYS.length &&
    EXPECTED_KEYS.every((k, i) => actualKeys[i] === k);
  if (!shapeOk) {
    return { kinds: ["schema-invalid"], detail: `unexpected artifact shape (keys: ${actualKeys.join(", ")})` };
  }
  const artifact: SubgraphArtifactV1 = {
    schemaVersion: 1,
    queryId: obj.queryId as number,
    kbRevision: obj.kbRevision as string,
    nodes: obj.nodes as number[],
    edges: obj.edges as [number, number, number][],
  };
  const neighbourhood = kbNeighborhoodFn(task.queryId);
  const cd05 = validateSubgraphAgainstNeighborhood(artifact, neighbourhood);
  if (!cd05.ok) {
    return { kinds: ["cd05-violation"], detail: JSON.stringify(cd05.violation) };
  }
  return {
    kinds: ["schema-and-cd05-valid-but-battery-refused"],
    detail:
      "artifact parses, has the exact expected key set, and passes CD-05 -- the refusal must be at " +
      "verify-at-read (record-absent/record-corrupt/hash-mismatch), which this probe-side reconstruction " +
      "cannot distinguish without the runner's own internal HandoffRecord map",
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
  // Resolved against SCRIPT_DIR (this file's own on-disk location, from
  // `import.meta.url`), never against `process.cwd()` -- the launcher's
  // `COLLAB_STATE` env var carries a bare filename (e.g.
  // "collab-probe-state.json") meant to live beside this script, and the
  // chdir below moves `process.cwd()` to the repo root before this path is
  // used for any read/write.
  const statePath = join(SCRIPT_DIR, requireEnvVar(COLLAB_STATE_ENV_VAR));
  const pairsCommit = requireEnvVar(COLLAB_PAIRS_COMMIT_ENV_VAR);
  console.log(
    `# COLLAB PROBE — state: ${statePath} · pairs commit: ${pairsCommit} · model: ${COLLAB_PROBE_MODEL} · ` +
      `sample size: ${PROBE_SAMPLE_SIZE} · gate threshold: ${PROBE_GATE_THRESHOLD}`,
  );

  // `_launch-collab.sh` (D-14, copied in shape from the paired arm's
  // launcher) does `cd "$(dirname "$0")"` before spawning `tsx`, so this
  // process starts with cwd = experiments/collab-round/, not the repo
  // root. `collaborative-scoring-bridge.ts`'s VENV_PYTHON_REL/
  // SCORE_ONE_REL/SKB_DATA_ROOT_REL (and collaborative-runner.ts's
  // NEIGHBORHOOD_ONE_REL) are bare repo-root-relative strings passed to
  // `spawnSync`/`readFileSync` with no `cwd:` override -- they resolve
  // against `process.cwd()`. Every path this file itself touches above
  // this line is already absolute (SCRIPT_DIR/repoRoot-derived), so moving
  // cwd here is safe and unblocks every scoring/neighbourhood call below
  // without editing the bridge (out of this plan's scope). Replaces the
  // prior `experiments/collab-round/tools -> ../../tools` symlink
  // workaround, which is no longer needed.
  process.chdir(repoRoot);

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
