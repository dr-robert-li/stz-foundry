/**
 * The execution-class oracle seam (Phase 1 — Data-ops pilot battery, Plan
 * 01-04, REQ-25/D6). dbt / data-diff / a SQL engine invoked as an external
 * process where present; where absent, an attributable failure — never a
 * pass and never a silent downgrade.
 *
 * This is a FOURTH posture, distinct from every other probe-shaped module in
 * this repo:
 *  - `selectEmbedder` (`src/knowledge/embedder.ts`) probes and FALLS BACK —
 *    a weaker embedder is an acceptable trade for an optimization.
 *  - `resolveProviderSelection` (`src/foundry/agent-runner.ts`) deliberately
 *    NEVER probes — substituting a provider would change what is measured.
 *  - `sandbox.ts`'s `probe()` warns and DOWNGRADES but proceeds.
 *  - THIS module detects, reports, and FAILS ATTRIBUTABLY. There is no
 *    acceptable degraded substitute for a missing execution oracle. A future
 *    reader tempted to "fix" this into a fallback or a downgrade should not
 *    — see CONTEXT.md D6 and RESEARCH Pitfall 3.
 *
 * Additive scoring pass layered ON TOP of `runAgentBattery`
 * (`src/foundry/agent-runner.ts`) — RESEARCH Open Question 3, resolved in
 * favour of option (b): `agent-runner.ts` takes ZERO changes,
 * `observeCheck`'s exhaustive four-kind switch is untouched, and no fifth
 * predicate kind is introduced. `runExecutionOracle` produces its own
 * `BatteryTaskResult[]` (the EXISTING shape, reused verbatim) plus an audit
 * `ExecutionOracleReport[]`; `mergeOracleVerdicts` folds both into a real
 * `BatteryRun` so an unreachable oracle actually lowers the score, rather
 * than being a report nobody reads.
 */
import { execFileSync, spawnSync } from "node:child_process";
import type { BatteryRun, BatteryTaskResult } from "./agent-runner.js";
import type { OracleReceipt } from "./battery-types.js";
import { evaluateChecks, type CheckResult } from "../contract/predicate-eval.js";

/** One external-process verdict bound to one battery task. */
export interface ExecutionOracleSpec {
  taskId: string;
  checkId: string;
  tool: string;
  argv: string[];
  expect: string;
  description: string;
}

/** The audit record of what was actually attempted — mirrors `sandbox.ts`'s
 *  `lastIsolation()` "report what was really used" posture. Kept separate
 *  from `BatteryTaskResult` so that type is not widened. */
export interface ExecutionOracleReport {
  taskId: string;
  tool: string;
  present: boolean;
  exitCode: number | null;
  note: string;
}

export interface ExecutionOracleOutcome {
  results: BatteryTaskResult[];
  reports: ExecutionOracleReport[];
}

/** Injectable, following `provider.ts`'s documented injectable-sleep
 *  convention (`provider.ts:78-79`). Deliberately NOT a fake binary on
 *  `PATH` — no such precedent exists in this repo, and injection needs no
 *  new test-helper file. */
export type ExecFn = (file: string, args: string[], opts: { timeout: number; encoding: "utf8" }) => string;
export type ProbeFn = (tool: string) => boolean;

/** `execFileSync` has no default timeout — a hung `dbt test` would otherwise
 *  hang the process forever. A named constant, never an inline literal. */
export const EXECUTION_ORACLE_TIMEOUT_MS = 30_000;

/** For the wiring-bug case: an oracle verdict naming a task this
 *  `BatteryRun` does not have. Fail closed rather than silently drop a
 *  verdict. */
export class ExecutionOracleUnavailableError extends Error {
  constructor(message: string) {
    super(`[foundry:execution-oracle] ${message}`);
    this.name = "ExecutionOracleUnavailableError";
  }
}

/** The default `ProbeFn` — copies `sandbox.ts:76-84`'s shape: present AND
 *  functioning, not merely resolvable on `PATH`. */
export function probeExecutionTool(tool: string): boolean {
  try {
    const r = spawnSync(tool, ["--version"], { timeout: EXECUTION_ORACLE_TIMEOUT_MS, stdio: "ignore" });
    return r.status === 0 && !r.error;
  } catch {
    return false;
  }
}

/** The default `ExecFn` — an argv ARRAY and an explicit timeout, never a
 *  shell string (`worktree.ts`'s `git()` idiom, one altitude up). */
const defaultExecFn: ExecFn = (file, args, opts) => execFileSync(file, args, opts);

export interface RunExecutionOracleOptions {
  execFn?: ExecFn;
  probeFn?: ProbeFn;
}

/** Shape of what a thrown `execFileSync`/injected-`execFn` error may carry —
 *  narrowed defensively, since the thrown value is `unknown` at the catch
 *  site. */
interface SpawnLikeError {
  code?: string;
  status?: number;
  stdout?: string;
  message?: string;
}

/** Mirrors `agent-runner.ts:417-428`'s `record.status !== "ok"` branch
 *  verbatim in shape: `pass: false`, `checks: []`, `vacuous: true`,
 *  unconditionally — independent of any check's `expect` string. Both the
 *  absence branch and the unreachable-at-invocation branch below build the
 *  task result through this ONE function, so there is exactly one place a
 *  reader needs to check for "does this coincide with some check's expect."
 *  It never does: no `Observations` object is constructed here and no
 *  `evaluateChecks` call is made — a placeholder string could otherwise
 *  coincide with a check's `expect` and score a pass by coincidence
 *  (RESEARCH Pitfall 3, `observeCheck`'s own doc comment). */
function attributableFailure(taskId: string, failureReason: string, receipt: OracleReceipt): BatteryTaskResult {
  return {
    taskId,
    pass: false,
    checks: [],
    vacuous: true,
    artifactPaths: [],
    status: "error",
    failureReason,
    receipt,
  };
}

/**
 * Score every `ExecutionOracleSpec` against an external process, or fail
 * attributably where the tool is absent. Three named, separately-mutatable
 * branches per spec — never one compound expression (D8: a mutation
 * disables exactly one, turns exactly one named test red).
 */
export function runExecutionOracle(
  specs: ExecutionOracleSpec[],
  receipt: OracleReceipt,
  opts: RunExecutionOracleOptions = {},
): ExecutionOracleOutcome {
  const probeFn = opts.probeFn ?? probeExecutionTool;
  const execFn = opts.execFn ?? defaultExecFn;

  const results: BatteryTaskResult[] = [];
  const reports: ExecutionOracleReport[] = [];

  for (const spec of specs) {
    // Branch 1: absence. `execFn` is never called — absence short-circuits
    // before invocation.
    if (!probeFn(spec.tool)) {
      const note =
        `execution-class tool ${JSON.stringify(spec.tool)} is not present — the run for task ` +
        `${JSON.stringify(spec.taskId)} could not reach its oracle`;
      results.push(attributableFailure(spec.taskId, `[foundry:execution-oracle] ${note}`, receipt));
      reports.push({ taskId: spec.taskId, tool: spec.tool, present: false, exitCode: null, note });
      continue;
    }

    let stdout: string | undefined;
    let exitCode: number | null = null;
    let unreachableNote: string | null = null;
    try {
      stdout = execFn(spec.tool, spec.argv, { timeout: EXECUTION_ORACLE_TIMEOUT_MS, encoding: "utf8" });
      exitCode = 0;
    } catch (e) {
      const err = e as SpawnLikeError;
      if (err.code === "ENOENT" || typeof err.stdout !== "string") {
        // Branch 2: unreachable at invocation — same attributable-failure
        // shape as absence.
        unreachableNote =
          `execution-class tool ${JSON.stringify(spec.tool)} could not be invoked for task ` +
          `${JSON.stringify(spec.taskId)}: ${String(err.message ?? err.code ?? "spawn failed")}`;
      } else {
        // Branch 3: ran — a nonzero exit that still produced output is a
        // REAL tool verdict, not a spawn failure.
        stdout = err.stdout;
        exitCode = typeof err.status === "number" ? err.status : null;
      }
    }

    if (unreachableNote !== null) {
      results.push(attributableFailure(spec.taskId, `[foundry:execution-oracle] ${unreachableNote}`, receipt));
      reports.push({ taskId: spec.taskId, tool: spec.tool, present: true, exitCode: null, note: unreachableNote });
      continue;
    }

    // Branch 3: ran (clean exit, or nonzero exit carrying stdout). stdout is
    // the PRIMARY verdict signal; the exit code is corroborating and
    // recorded, never decisive.
    //
    // ponytail: both dbt and data-diff have documented, version-dependent
    // inconsistency in exit-code-on-failure behaviour (RESEARCH Assumptions
    // A1/A2 — open dbt-core issues report exit 0 on a failed test in some
    // versions; at least one data-diff fork requires an explicit flag to
    // exit nonzero on a detected diff), and neither tool is installed on
    // this machine to verify against directly. Parsing stdout as the
    // primary signal is the honest hedge for that unverifiable boundary.
    // Upgrade trigger: a real dbt/data-diff install, to verify the parse
    // contract against reality and promote exit code to a co-equal signal
    // if it proves reliable.
    const observed = { [spec.checkId]: (stdout ?? "").trim() };
    const check = { checkId: spec.checkId, kind: "output-assertion" as const, expect: spec.expect, description: spec.description };
    const scored = evaluateChecks([check], observed);
    results.push({
      taskId: spec.taskId,
      pass: scored.pass,
      checks: scored.checks,
      vacuous: scored.vacuous,
      artifactPaths: [],
      status: "ok",
      failureReason: null,
      receipt,
    });
    reports.push({
      taskId: spec.taskId,
      tool: spec.tool,
      present: true,
      exitCode,
      note: exitCode === 0 ? "ran, exit 0" : `ran, exit ${exitCode} (stdout scored as the primary verdict signal)`,
    });
  }

  return { results, reports };
}

/**
 * Fold an `ExecutionOracleOutcome` into a real `BatteryRun` so an
 * unreachable oracle actually lowers `testPassRate` and closes
 * `passedGate` — without this, a verdict is computed and then never scores
 * anything (the "absence reported but the task still passes" vacuity
 * RESEARCH names).
 */
export function mergeOracleVerdicts(run: BatteryRun, outcome: ExecutionOracleOutcome): BatteryRun {
  const oracleByTaskId = new Map(outcome.results.map((r) => [r.taskId, r]));
  const runTaskIds = new Set(run.tasks.map((t) => t.taskId));

  // Fail closed on a wiring bug: a verdict naming a task this run does not
  // have is not silently dropped.
  for (const taskId of oracleByTaskId.keys()) {
    if (!runTaskIds.has(taskId)) {
      throw new ExecutionOracleUnavailableError(
        `oracle verdict names task ${JSON.stringify(taskId)}, which is not in this BatteryRun`,
      );
    }
  }

  const mergedTasks: BatteryTaskResult[] = run.tasks.map((agentResult) => {
    const oracleResult = oracleByTaskId.get(agentResult.taskId);
    if (!oracleResult) return agentResult;

    // Per-task conjunction, each a named line — never one compound
    // expression (D8: a mutation disables exactly one).
    const pass = agentResult.pass && oracleResult.pass;
    const checks: CheckResult[] = [...agentResult.checks, ...oracleResult.checks];
    const vacuous = agentResult.vacuous || oracleResult.vacuous;
    const status = agentResult.status !== "ok" ? agentResult.status : oracleResult.status;
    const failureReason = agentResult.failureReason !== null ? agentResult.failureReason : oracleResult.failureReason;

    return {
      taskId: agentResult.taskId,
      pass,
      checks,
      vacuous,
      artifactPaths: agentResult.artifactPaths,
      status,
      failureReason,
      // Reference-identical to `run.tasks`' own receipt — never re-derived
      // (mirrors the seventh promotion gate's Object.is provenance idiom).
      receipt: agentResult.receipt,
    };
  });

  const passedTasks = mergedTasks.filter((t) => t.pass).length;
  // Denominator: run.tasks.length — the battery's task count, never the
  // surviving-record count. Same rule as agent-runner.ts:446-452, one
  // altitude up.
  const mergedPassRate = passedTasks / run.tasks.length;
  // Deliberately a two-term conjunction over the value runAgentBattery
  // ALREADY computed, so the artifact-vacuity guard (noArtifacts) and the
  // hack-findings term already folded into run.result.passedGate are
  // preserved rather than re-implemented here.
  //
  // ponytail: this is the second place in the repo that composes
  // `passedGate` (agent-runner.ts's own `!noArtifacts && testPassRate >= 1
  // && hackFindings.length === 0` is the first). Upgrade trigger: a third
  // consumer, at which point the composition moves into one shared helper.
  const passedGate = run.result.passedGate && mergedPassRate >= 1;

  return {
    result: { ...run.result, testPassRate: mergedPassRate, passedGate },
    receipt: run.receipt,
    provider: run.provider,
    tasks: mergedTasks,
    records: run.records,
    bounds: run.bounds,
    cost: run.cost,
  };
}
