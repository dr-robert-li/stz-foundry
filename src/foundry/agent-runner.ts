/**
 * The agentic eval seam (Phase 1 — Agentic eval seam, Plan 01-01 tracer).
 *
 * `runAgentBattery` is glue, not a new engine (RESEARCH summary): it spawns a
 * candidate agent per battery task through the existing `spawnSpecimens`
 * bounded pool, scores artifacts through the existing, unmodified
 * `evaluateChecks`, and emits the existing `EvalResult` shape so the
 * bridge/selection/GRPO path takes zero changes (D-04, REQ-14). The
 * `OracleReceipt` travels ALONGSIDE `EvalResult` on `BatteryRun`, never
 * inside it, so `EvalResult` stays byte-for-byte the existing shape.
 *
 * Scope fence (this plan only): one predicate kind (`output-assertion`), no
 * artifact materialization to disk, no wall-clock/cost bounds beyond what
 * `spawnSpecimens` already offers, no provider-reporting surface beyond what
 * is returned here. The other three predicate kinds land in 01-03; bounds and
 * reporting land in 01-04; the full six-trap exogeneity guard lands in 01-02.
 */
import { join, resolve } from "node:path";
import type { EvalResult, HackFinding, SliceManifest, SpecimenId } from "../types.js";
import type { Specimen, SpecimenOutput } from "../mock/interfaces.js";
import { spawnSpecimens, type SpecimenRunRecord } from "./spawn.js";
import { createProvider, type Provider, type ProviderKind } from "./provider.js";
import { evaluateChecks, type CheckResult, type Observations } from "../contract/predicate-eval.js";
import type { PredicateCheck } from "../contract/contract-types.js";
import type { AgentBattery, OracleReceipt } from "./battery-types.js";
import { resolveContained, writeSpecimenFiles } from "../write-guard.js";
import { FoundryCostMeter, type CostTotals } from "./cost.js";

export interface CandidateAgent {
  id: SpecimenId;
  systemPrompt: string;
}

export interface ProviderSelection {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  /** Reported, never silently inferred (D-03, REQ-15) — see
   *  `resolveProviderSelection`'s doc comment for the full posture. */
  source: "default-local" | "explicit";
}

export interface BatteryTaskResult {
  taskId: string;
  pass: boolean;
  checks: CheckResult[];
  vacuous: boolean;
  artifactPaths: string[];
  status: "ok" | "timeout" | "error";
  failureReason: string | null;
  receipt: OracleReceipt;
}

/**
 * The bounds that actually governed a run, reported so a caller can see what
 * was in effect without re-deriving it from `RunBatteryOptions`. `concurrency`
 * is always resolved (the pool always has one); `taskTimeoutMs`/`deadlineMs`
 * stay `undefined` when the caller left the run unbounded — never defaulted
 * to an arbitrary number (see the "unbounded-but-explicit" comment below).
 */
export interface BatteryBounds {
  concurrency: number;
  taskTimeoutMs: number | undefined;
  deadlineMs: number | undefined;
}

export interface BatteryRun {
  result: EvalResult;
  receipt: OracleReceipt;
  provider: ProviderSelection;
  tasks: BatteryTaskResult[];
  records: SpecimenRunRecord[];
  bounds: BatteryBounds;
  /** `undefined` when no `costMeter` was supplied — reuses `CostTotals` from
   *  `cost.ts` rather than inventing a parallel shape. */
  cost: CostTotals | undefined;
}

export interface RunBatteryOptions {
  provider?: { kind: ProviderKind; baseUrl: string; model: string; apiKey?: string };
  providerImpl?: Provider;
  /**
   * When present, each task's validated artifact map is materialized under
   * `<artifactDir>/<taskId>/` via the shared guarded write path. When absent
   * (the default, and what every test but one uses), nothing is written —
   * artifact keys are still validated either way (see `buildObservations`'s
   * caller in `runAgentBattery`).
   */
  artifactDir?: string;
  /** Max tasks in flight at once. Passed straight through to `spawnSpecimens`
   *  (REQ-16 forbids a second scheduler). Default 1 — a local daemon
   *  serializes generations anyway; raise it once a hosted provider that can
   *  genuinely parallelize is the default. */
  concurrency?: number;
  /** Per-task wall-clock kill (criterion 6). Passed straight through to
   *  `spawnSpecimens`'s `timeoutMs` — the kill comes from the unmodified
   *  pool, never a second timeout layer. Default: no timeout (unbounded but
   *  explicit, matching `spawnSpecimens`'s own default). */
  taskTimeoutMs?: number;
  /** Absolute run-level deadline (epoch ms). Passed straight through to
   *  `spawnSpecimens`'s `deadlineMs`. Default: none. */
  deadlineMs?: number;
  /**
   * When present, every successful `provider.chat` call is metered through it
   * (hosted spend goes through the existing governance, never around it —
   * CONTEXT N5/N9). Absent by default: local inference is $0 and `cost.ts`
   * already prices unknown models at zero and reports them, so there is
   * nothing worth metering until a caller opts into a hosted provider.
   */
  costMeter?: FoundryCostMeter;
}

/** The values `FOUNDRY_CONFIG_TEMPLATE` already defaults to (runner.ts:307-319) — D-03. */
export const DEFAULT_BATTERY_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_BATTERY_MODEL = "granite4.1:30b";

/**
 * Resolve which provider a battery run reports — config-explicit, never
 * probe-and-fallback (criterion 5, D-03, REQ-15). This is the deliberate
 * OPPOSITE of `selectEmbedder` (`src/knowledge/embedder.ts:215-235`), which
 * probes the daemon and falls back because an embedding is an optimization:
 * a wrong/unavailable embedder degrades quality, silently, and that's an
 * acceptable trade for zero setup. A battery has no such slack — the
 * candidate agent IS the measurement, so substituting a reachable provider
 * for an unreachable one would silently change what's being measured. So
 * this resolver is synchronous: it cannot probe anything, by construction,
 * because it never makes a request. An override wins and reports
 * `source: "explicit"`; nothing supplied reports the two DEFAULT_ constants
 * with `source: "default-local"`. An unreachable endpoint is never
 * substituted here — it surfaces later, as a `ProviderError` at call time,
 * converted by `spawnSpecimens`'s existing catch into an attributable task
 * failure (see the "unreachable provider surfaces" test). A future reader
 * tempted to "fix" this inconsistency with `selectEmbedder` should not: the
 * two functions are correct for two different things.
 */
export function resolveProviderSelection(
  override?: { kind: ProviderKind; baseUrl: string; model: string },
): ProviderSelection {
  if (override) {
    return { kind: override.kind, baseUrl: override.baseUrl, model: override.model, source: "explicit" };
  }
  return {
    kind: "openai",
    baseUrl: DEFAULT_BATTERY_BASE_URL,
    model: DEFAULT_BATTERY_MODEL,
    source: "default-local",
  };
}

/**
 * NOT measured — an agent battery has no single source file for V8 to
 * instrument (RESEARCH "EvalResult field mapping"). Best-case, ranking-neutral
 * sentinel: `evalReward`'s weighted terms are a CONSTANT offset within one
 * battery's tournament group, so GRPO advantage is mathematically unaffected
 * by which sentinel pair is used (src/grpo.ts groupRelativeAdvantage). See
 * docs/development/harness-factory.md. A reader seeing `coverage === 1` must
 * not conclude V8 coverage ran.
 */
export const AGENT_BATTERY_COVERAGE_SENTINEL = 1;
/** NOT measured — see AGENT_BATTERY_COVERAGE_SENTINEL. */
export const AGENT_BATTERY_MUTATION_SENTINEL = 0;

// ponytail: an inert synthetic manifest — spawnSpecimens only forwards it to
// implement(), which this adapter ignores entirely. Upgrade trigger: a
// battery that needs real slice context (complexity-based budgeting, contract
// gating) rather than a flat task list.
const BATTERY_MANIFEST: SliceManifest = {
  id: "agent-battery",
  name: "agent-battery",
  contract: "",
  donePredicates: [],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 0 },
  summary: "synthetic manifest for runAgentBattery — not a real tournament slice",
};

const FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g;

/**
 * A fenced block whose info line carries `path=<relative-path>` yields one
 * map entry from that path to the block body (trimmed). A response with no
 * marked block yields an empty map. Exported so 01-03 can test it directly.
 * Writes nothing to disk — the guarded materialization path is 01-03's work.
 */
export function parseArtifacts(responseText: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const match of responseText.matchAll(FENCE_RE)) {
    const infoLine = match[1] ?? "";
    const body = match[2] ?? "";
    const pathMatch = infoLine.match(/path=(\S+)/);
    if (!pathMatch) continue;
    files[pathMatch[1]!] = body.trim();
  }
  return files;
}

/**
 * The kind-dispatching observation PRODUCER (RESEARCH Pattern 1): the fourth
 * such producer in the repo (after `bridge.ts`'s output-assertion-only shell
 * and the two test-file examples), a translation function, never a second
 * evaluator — it must not branch on anything `evalCheck` already decides
 * (D-05, REQ-10). One branch per `PredicateCheck.kind`, each a translation
 * from artifacts to a string.
 *
 * The rule that matters more than the four branches: a missing, unparseable
 * or inapplicable observation returns `undefined` — never `""`, `"false"`,
 * `"null"`, or any `??`/`||` fallback that could coincide with some check's
 * `expect` (RESEARCH Pitfall 3). `evalCheck` already fails a missing
 * observation (`predicate-eval.ts:36-38`); that is the whole safety property.
 *
 * The `switch` is exhaustive over the four kinds — dropping a case is a
 * compile error under `npm run typecheck`, not a silent fallthrough.
 * Exported so 01-03's tests can drive it directly, one check at a time.
 */
export function observeCheck(
  check: PredicateCheck,
  files: Record<string, string>,
  rawResponse: string,
): string | undefined {
  switch (check.kind) {
    case "output-assertion": {
      const value = check.input !== undefined ? files[check.input.trim()] : rawResponse;
      return value !== undefined ? value.trim() : undefined;
    }
    case "file-invariant": {
      if (check.input === undefined) return undefined;
      return Object.prototype.hasOwnProperty.call(files, check.input.trim()) ? "true" : "false";
    }
    case "json-invariant": {
      if (check.input === undefined) return undefined;
      const hashIdx = check.input.indexOf("#");
      // Malformed input (no `#`) is inapplicable, not a crash — undefined,
      // same as every other unresolvable case here (RESEARCH Pitfall 3).
      if (hashIdx < 0) return undefined;
      const artifactPath = check.input.slice(0, hashIdx).trim();
      const dottedPath = check.input.slice(hashIdx + 1).trim();
      const raw = files[artifactPath];
      if (raw === undefined) return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return undefined;
      }
      // ponytail: plain property access — numeric segments index arrays via
      // string-keyed lookup; no bracket, filter or wildcard syntax. Upgrade
      // when a battery task needs one.
      let cur: unknown = parsed;
      if (dottedPath !== "") {
        for (const segment of dottedPath.split(".")) {
          if (cur === null || typeof cur !== "object") return undefined;
          cur = (cur as Record<string, unknown>)[segment];
          if (cur === undefined) return undefined;
        }
      }
      return JSON.stringify(cur);
    }
    case "diff-constraint": {
      // ponytail: exact sorted path-set comparison, not a glob. Upgrade when
      // a battery task needs pattern matching over touched files.
      const keys = Object.keys(files);
      if (keys.length === 0) return undefined;
      return [...keys].sort().join("\n");
    }
  }
}

/**
 * Build `Observations` for one task's checks — maps `observeCheck` over each
 * check in the task. Exported so 01-03 can test it directly.
 */
export function buildObservations(
  checks: PredicateCheck[],
  files: Record<string, string>,
  rawResponse: string,
): Observations {
  const observed: Observations = {};
  for (const check of checks) {
    observed[check.checkId] = observeCheck(check, files, rawResponse);
  }
  return observed;
}

/**
 * Score one candidate agent against one battery, end to end, offline. Spawns
 * the candidate through the existing bounded pool (`spawnSpecimens`,
 * unmodified — RESEARCH assumption A3), scores artifacts through the
 * existing predicate evaluator, and emits the existing `EvalResult` shape
 * (D-04, REQ-14) with its `OracleReceipt` returned alongside.
 */
export async function runAgentBattery(
  candidateAgent: CandidateAgent,
  battery: AgentBattery,
  opts: RunBatteryOptions = {},
): Promise<BatteryRun> {
  let provider: Provider;
  let providerSelection: ProviderSelection;
  if (opts.providerImpl) {
    provider = opts.providerImpl;
    providerSelection = {
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: opts.provider?.model ?? DEFAULT_BATTERY_MODEL,
      source: "explicit",
    };
  } else {
    // Reported, never probed (criterion 5) — see resolveProviderSelection's
    // doc comment for the full contrast with selectEmbedder.
    providerSelection = resolveProviderSelection(opts.provider);
    provider = createProvider({
      kind: providerSelection.kind,
      baseUrl: providerSelection.baseUrl,
      apiKey: opts.provider?.apiKey,
    });
  }

  const tasksById = new Map(battery.tasks.map((t) => [t.id, t]));
  // Side channel for the raw response text, keyed by task id (== `strategy`).
  // `SpecimenOutput.files` only carries the PARSED artifact map, but
  // `buildObservations` also needs the raw text for the no-`input` case.
  // Safe under any concurrency: each task id is written exactly once, by the
  // worker that owns it.
  const rawResponses = new Map<string, string>();

  // `Specimen`-shaped adapter (RESEARCH "Reusing spawnSpecimens", option 1a):
  // here `strategy` IS the battery task id, and `specimen` is the candidate
  // agent's own id — NOT a tournament specimen. `spawnSpecimens` is reused
  // completely unmodified (REQ-16 forbids a second scheduler).
  // Containment base for artifact-key validation: T-01-01. Every parsed key
  // is checked here, at COLLECTION time, independent of whether this run
  // materializes to disk — an in-memory-only battery must still refuse an
  // escaping key, otherwise a later phase that adds materialization would
  // inherit unvalidated keys. The question this answers is "would this key
  // escape the directory it would be written into."
  const artifactContainmentBase = resolve(opts.artifactDir ?? ".");

  const adapter: Specimen = {
    async implement(_manifest, strategy, _refinement): Promise<SpecimenOutput> {
      const task = tasksById.get(strategy);
      if (!task) {
        throw new Error(`[foundry:agent-runner] unknown battery task id "${strategy}"`);
      }
      const res = await provider.chat({
        model: providerSelection.model,
        system: candidateAgent.systemPrompt,
        messages: [{ role: "user", content: task.prompt }],
      });
      // `add` deliberately records spend BEFORE it throws on a cap breach
      // (cost.ts), so the audit trail survives the halt. Let the thrown
      // `CostCapExceededError` propagate out of implement() uncaught —
      // spawnSpecimens's existing catch converts it into an attributable
      // `status: "error"` record, same as any other provider failure. This
      // is deliberately NOT short-circuited: remaining tasks breach on their
      // own first `add` and are attributed the same way, so a cost-cap halt
      // still ends with one record per task — "never a silently missing
      // result" (criterion 6/REQ-16), not "the run stops and some tasks
      // vanish".
      if (opts.costMeter) {
        opts.costMeter.add("battery", providerSelection.model, res.usage, candidateAgent.id);
      }
      rawResponses.set(strategy, res.text);
      const files = parseArtifacts(res.text);
      // An escaping key throws here — uncaught, converted by spawnSpecimens's
      // existing catch into an attributable `status: "error"` record with the
      // guard's message as `killReason`, never a silent drop and never a
      // thrown run (RESEARCH T-01-01).
      for (const key of Object.keys(files)) resolveContained(artifactContainmentBase, key);
      // No second write path (T-01-10): materialization goes only through the
      // shared guarded helper, and only when the caller opted in.
      if (opts.artifactDir) {
        await writeSpecimenFiles(join(opts.artifactDir, task.id), files);
      }
      return { specimen: candidateAgent.id, files, strategy };
    },
  };

  // Bounds pass straight through to the existing pool — this is the entire
  // kill mechanism (REQ-16 forbids a second scheduler). spawn.ts already
  // computes the effective per-task bound as min(timeoutMs, time remaining
  // to deadlineMs), already marks a killed item `stuck-killed`, and already
  // writes a `SpecimenRunRecord` with `status: "timeout"` and a non-null
  // `killReason`. Default concurrency 1 (ponytail: a local daemon serializes
  // generations anyway; upgrade trigger: raise it once a hosted provider
  // that can genuinely parallelize is the default) — unbounded-but-explicit
  // otherwise: no default timeout/deadline, exactly as spawnSpecimens itself
  // defaults, rather than inventing an arbitrary cap number that would
  // surprise a caller.
  const bounds: BatteryBounds = {
    concurrency: opts.concurrency ?? 1,
    taskTimeoutMs: opts.taskTimeoutMs,
    deadlineMs: opts.deadlineMs,
  };
  const spawnResult = await spawnSpecimens(
    adapter,
    BATTERY_MANIFEST,
    battery.tasks.map((t) => t.id),
    null,
    { concurrency: bounds.concurrency, timeoutMs: bounds.taskTimeoutMs, deadlineMs: bounds.deadlineMs },
  );

  const outputsByStrategy = new Map(spawnResult.outputs.map((o) => [o.strategy, o]));

  // Iterate `records`, never `outputs` — a killed task must remain a scored
  // failure, not a dropped row.
  const taskResults: BatteryTaskResult[] = spawnResult.records.map((record) => {
    const task = tasksById.get(record.strategy)!;
    if (record.status !== "ok") {
      return {
        taskId: task.id,
        pass: false,
        checks: [],
        vacuous: true,
        artifactPaths: [],
        status: record.status,
        failureReason: record.killReason,
        receipt: battery.receipt,
      };
    }
    const output = outputsByStrategy.get(record.strategy);
    const files = output?.files ?? {};
    const rawResponse = rawResponses.get(record.strategy) ?? "";
    const observed = buildObservations(task.checks, files, rawResponse);
    const scored = evaluateChecks(task.checks, observed);
    return {
      taskId: task.id,
      pass: scored.pass,
      checks: scored.checks,
      vacuous: scored.vacuous,
      artifactPaths: Object.keys(files),
      status: "ok",
      failureReason: null,
      receipt: battery.receipt,
    };
  });

  const passedTasks = taskResults.filter((t) => t.pass).length;
  // Denominator is battery.tasks.length — NEVER the count of surviving
  // records or successful outputs. A task whose record is not `ok` is
  // `pass: false` and still occupies a slot here (criterion 6's "never a
  // silently missing result", expressed as arithmetic); makeBattery already
  // guarantees battery.tasks.length > 0.
  const testPassRate = passedTasks / battery.tasks.length;
  // Deliberate scope limit (RESEARCH assumption A4): `detectHacks` matches
  // source-code shapes, which agent artifacts need not be.
  const hackFindings: HackFinding[] = [];

  // Artifact-vacuity guard (T-01-08), the `commitEval`/`noSource` shape one
  // altitude up (bridge.ts:239-276): a battery whose checks are all negative
  // `file-invariant`s ("this file must NOT exist") would score a perfect
  // pass against an agent that produced nothing, without this. `noArtifacts`
  // is true only when EVERY task result — passing, failing, or errored —
  // produced zero artifact entries.
  const noArtifacts = taskResults.every((t) => t.artifactPaths.length === 0);

  const result: EvalResult = {
    specimen: candidateAgent.id,
    // Identical threshold shape to bridge.ts:263, now with the same
    // artifact-vacuity term.
    passedGate: !noArtifacts && testPassRate >= 1 && hackFindings.length === 0,
    ...(noArtifacts
      ? {
          gateBlockedReason:
            "no battery task produced any artifact — predicate scoring had no input",
        }
      : {}),
    testPassRate,
    coverage: AGENT_BATTERY_COVERAGE_SENTINEL,
    mutationScore: AGENT_BATTERY_MUTATION_SENTINEL,
    hackFindings,
    // `codeHealth`/`suspicion` left ABSENT — `evalReward` already reads
    // absent as neutral-best/clean (selection.ts:112-113), the same
    // no-unearned-credit honesty as the sentinels above.
  };

  return {
    result,
    receipt: battery.receipt,
    provider: providerSelection,
    tasks: taskResults,
    records: spawnResult.records,
    bounds,
    cost: opts.costMeter?.totals(),
  };
}
