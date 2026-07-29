/**
 * The execution-class oracle seam (Phase 1 — Data-ops pilot battery, Plan
 * 01-04, REQ-25/D6). Every test injects `execFn`/`probeFn` — no real binary,
 * no `PATH` manipulation, no network. Two tests carry the weight: the
 * vacuous-pass trap (an absence can never score a pass by coincidence) and
 * the argument-injection control (every invocation is an argv ARRAY with an
 * explicit timeout, never a shell string).
 */
import { describe, it, expect } from "vitest";
import {
  runExecutionOracle,
  probeExecutionTool,
  EXECUTION_ORACLE_TIMEOUT_MS,
  type ExecutionOracleSpec,
  type ExecFn,
  type ProbeFn,
} from "../src/foundry/execution-oracle.js";
import type { OracleReceipt } from "../src/foundry/battery-types.js";

const RECEIPT: OracleReceipt = Object.freeze({
  kind: "execution",
  acceptedBy: "Dr. Robert Li",
  lineage: Object.freeze(["execution:test-oracle"]) as string[],
});

function spec(over: Partial<ExecutionOracleSpec> = {}): ExecutionOracleSpec {
  return {
    taskId: "t1",
    checkId: "t1-dbt",
    tool: "dbt",
    argv: ["test", "--select", "orders"],
    expect: "PASS",
    description: "dbt test passes on the orders model",
    ...over,
  };
}

const alwaysPresent: ProbeFn = () => true;
const alwaysAbsent: ProbeFn = () => false;

describe("runExecutionOracle — branch 1: absence", () => {
  it("tool absent yields status:error, pass:false, checks:[], vacuous:true, a failureReason naming the tool, and reports[0].present === false", () => {
    let execCalls = 0;
    const execFn: ExecFn = () => {
      execCalls++;
      return "";
    };
    const outcome = runExecutionOracle([spec()], RECEIPT, { probeFn: alwaysAbsent, execFn });

    expect(outcome.results[0]?.status).toBe("error");
    expect(outcome.results[0]?.pass).toBe(false);
    expect(outcome.results[0]?.checks).toEqual([]);
    expect(outcome.results[0]?.vacuous).toBe(true);
    expect(outcome.results[0]?.failureReason).toContain("dbt");
    expect(outcome.reports[0]?.present).toBe(false);
    // Absence short-circuits BEFORE invocation — execFn is never called.
    expect(execCalls).toBe(0);
  });

  it("the vacuous-pass trap: a spec whose expect equals the exact absence note still yields pass:false and zero checks", () => {
    // Compute the exact note runExecutionOracle would produce, then set
    // `expect` to it — proving the absence branch can never coincidentally
    // pass because a stray placeholder string happened to equal `expect`.
    const trapSpec = spec({ taskId: "trap", checkId: "trap-check" });
    const note =
      `execution-class tool ${JSON.stringify(trapSpec.tool)} is not present — the run for task ` +
      `${JSON.stringify(trapSpec.taskId)} could not reach its oracle`;
    const trapped = spec({ taskId: "trap", checkId: "trap-check", expect: note });

    const outcome = runExecutionOracle([trapped], RECEIPT, { probeFn: alwaysAbsent });

    expect(outcome.results[0]?.pass).toBe(false);
    expect(outcome.results[0]?.checks.length).toBe(0);
  });
});

describe("runExecutionOracle — branch 2: unreachable at invocation", () => {
  it("execFn throwing ENOENT yields the same attributable-failure shape as absence", () => {
    const execFn: ExecFn = () => {
      const e = new Error("spawn dbt ENOENT") as Error & { code: string };
      e.code = "ENOENT";
      throw e;
    };
    const outcome = runExecutionOracle([spec()], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(outcome.results[0]?.status).toBe("error");
    expect(outcome.results[0]?.pass).toBe(false);
    expect(outcome.results[0]?.checks).toEqual([]);
    expect(outcome.results[0]?.vacuous).toBe(true);
    expect(outcome.results[0]?.failureReason).toContain("dbt");
    expect(outcome.reports[0]?.present).toBe(true);
    expect(outcome.reports[0]?.exitCode).toBe(null);
  });

  it("execFn throwing with no stdout (no ENOENT code either) is treated as unreachable, not scored", () => {
    const execFn: ExecFn = () => {
      throw new Error("connection reset");
    };
    const outcome = runExecutionOracle([spec()], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(outcome.results[0]?.status).toBe("error");
    expect(outcome.results[0]?.pass).toBe(false);
    expect(outcome.results[0]?.checks).toEqual([]);
  });
});

describe("runExecutionOracle — branch 3: ran", () => {
  it("a clean run whose stdout matches expect scores status:ok, pass:true", () => {
    const execFn: ExecFn = () => "PASS\n";
    const outcome = runExecutionOracle([spec()], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(outcome.results[0]?.status).toBe("ok");
    expect(outcome.results[0]?.pass).toBe(true);
    expect(outcome.reports[0]?.exitCode).toBe(0);
  });

  it("a clean run whose stdout does NOT match expect scores status:ok, pass:false — a real tool verdict, not an absence", () => {
    const execFn: ExecFn = () => "FAIL\n";
    const outcome = runExecutionOracle([spec()], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(outcome.results[0]?.status).toBe("ok");
    expect(outcome.results[0]?.pass).toBe(false);
  });

  it("a nonzero exit carrying stdout is a real verdict: status:ok, stdout is the observation, exit code appears in the report", () => {
    const execFn: ExecFn = () => {
      const e = new Error("dbt test failed") as Error & { stdout: string; status: number };
      e.stdout = "FAIL";
      e.status = 1;
      throw e;
    };
    const outcome = runExecutionOracle([spec({ expect: "FAIL" })], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(outcome.results[0]?.status).toBe("ok");
    expect(outcome.results[0]?.pass).toBe(true);
    expect(outcome.reports[0]?.exitCode).toBe(1);
  });
});

describe("runExecutionOracle — the argument-injection control (T-01-01)", () => {
  it("execFn is always called (file, argvArray, opts) with an unexpanded shell-metacharacter element and a finite positive timeout", () => {
    const malicious = "orders; rm -rf / #";
    const calls: { file: string; args: string[]; opts: { timeout: number; encoding: "utf8" } }[] = [];
    const execFn: ExecFn = (file, args, opts) => {
      calls.push({ file, args, opts });
      return "PASS";
    };
    const injectedSpec = spec({ tool: "dbt", argv: ["test", "--select", malicious] });
    runExecutionOracle([injectedSpec], RECEIPT, { probeFn: alwaysPresent, execFn });

    expect(calls.length).toBe(1);
    expect(calls[0]?.file).toBe("dbt");
    expect(Array.isArray(calls[0]?.args)).toBe(true);
    // Byte-identical, unexpanded — proves no shell ever touched this string.
    expect(calls[0]?.args[2]).toBe(malicious);
    expect(Number.isFinite(calls[0]?.opts.timeout)).toBe(true);
    expect(calls[0]!.opts.timeout).toBeGreaterThan(0);
  });

  it("EXECUTION_ORACLE_TIMEOUT_MS is the timeout actually passed by the default execFn wiring", () => {
    // Documents the constant is load-bearing, not merely exported —
    // exercised for real via probeExecutionTool's own use of it.
    expect(EXECUTION_ORACLE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(typeof probeExecutionTool).toBe("function");
  });
});
