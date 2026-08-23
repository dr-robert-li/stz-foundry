/**
 * The detached round driver's offline suite (Phase 23 -- Ablation gate +
 * powered STaRK round, Plan 23-07, REQ-82), fully offline against
 * `experiments/collab-round/_collab-round.ts`'s exported functions -- no
 * provider, no git call, no process spawn, no real filesystem write outside
 * a fresh `mkdtempSync` directory, and `_launch-collab.sh`/Ollama are never
 * touched.
 *
 * House rule (mirrors `test/collaborative-ablation-gate.test.ts`): every
 * throwing assertion inspects the thrown message's content, never a bare
 * `.toThrow()`.
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireEnv,
  unitKey,
  loadState,
  saveState,
  once,
  onceWithHarnessRetry,
  buildRunConfig,
  toAblationUnits,
  runSelectionRound,
  resolveStatePath,
  runHeldoutUnits,
  assembleVerdict,
  main,
  type CollabUnitResult,
  type CollabRoundState,
  type CollabRoundDeps,
  type RunSelectionRoundArgs,
  type HeldoutRunConfig,
} from "../experiments/collab-round/_collab-round.js";
import {
  mintCollaborativeReceipt,
  CollaborativeRunnerError,
  HANDOFF_OUTCOME_KINDS,
  type CollaborativeCandidate,
  type CollaborativeRunRecord,
  type CollaborativeTaskOutcome,
  type HandoffOutcome,
  type HandoffOutcomeKind,
  type SubgraphArtifactV1,
  type RunCollaborativeBatteryArgs,
} from "../src/foundry/collaborative-runner.js";
import type { CollaborativeBatteryTask } from "../src/foundry/collaborative-battery.js";
import type { CollaborativeRoundResult, RunCollaborativeRoundArgs } from "../src/foundry/collaborative-tournament-shell.js";
import { evaluateAblationGate, ABLATION_SUITE_SIZE, type AblationGateVerdict } from "../src/foundry/collaborative-ablation-gate.js";
import { BatteryShapeError, type AgentBattery } from "../src/foundry/battery-types.js";
import type { BatteryTaskResult } from "../src/foundry/agent-runner.js";
import type { EvalResult, Judgment, ComponentArchiveEntry } from "../src/types.js";
import type { ScoringAttempt } from "../src/foundry/collaborative-scoring-bridge.js";
import type { CollabRoundSelection } from "../experiments/collab-round/_collab-report.js";

const DRIVER_MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "experiments", "collab-round", "_collab-round.ts");
const DRIVER_SOURCE = readFileSync(DRIVER_MODULE_PATH, "utf8");

function freshStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "collab-round-driver-test-")), "state.json");
}

const REQUIRED_ENV = {
  COLLAB_ROUND_STATE: "state.json",
  COLLAB_PAIRS_COMMIT: "abc1234",
  COLLAB_ROUND_CEILING_MS: "1800000",
  COLLAB_ROUND_ARCHIVE_ROOT: ".stz/60-harness/component",
  COLLAB_ROUND_ARCHIVE_SLOT: "collab-stark-prime",
};

// ── stub construction ────────────────────────────────────────────────────

function stubCandidate(id: string): CollaborativeCandidate {
  return { id, builderPrompt: `builder-${id}`, answererPrompt: `answerer-${id}` };
}

function stubArtifact(queryId: number): SubgraphArtifactV1 {
  return { schemaVersion: 1, queryId, kbRevision: "rev", nodes: [], edges: [] };
}

function stubBattery(id: string): AgentBattery {
  return { schemaVersion: 1, id, tasks: [], receipt: mintCollaborativeReceipt() } as unknown as AgentBattery;
}

function stubTaskResult(status: "ok" | "timeout" | "error" = "ok"): BatteryTaskResult {
  return {
    taskId: "t",
    pass: status === "ok",
    score: status === "ok" ? 1 : 0,
    checks: [],
    vacuous: false,
    artifactPaths: [],
    status,
    failureReason: status === "ok" ? null : "stub failure",
    receipt: mintCollaborativeReceipt(),
  };
}

function stubEvalResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    specimen: "cand",
    passedGate: true,
    testPassRate: 1,
    coverage: 0,
    mutationScore: 0,
    codeHealth: 0,
    hackFindings: [],
    ...overrides,
  };
}

function stubBatteryRun(status: "ok" | "timeout" | "error" = "ok", overrides: Record<string, unknown> = {}) {
  return {
    result: stubEvalResult(),
    receipt: mintCollaborativeReceipt(),
    provider: { kind: "openai", baseUrl: "http://x", model: "m", source: "explicit" },
    tasks: [stubTaskResult(status)],
    records: [],
    bounds: { concurrency: 1, taskTimeoutMs: undefined, deadlineMs: undefined },
    cost: undefined,
    ...overrides,
  };
}

function stubScoringAttempt(overrides: Partial<ScoringAttempt> = {}): ScoringAttempt {
  return {
    attemptId: "id",
    queryId: 1,
    kb: "prime",
    hfRevision: "rev",
    submittedPredDict: {},
    forfeitedIds: [],
    forfeitedCount: 0,
    outcome: { outcome: "scored", metrics: { "hit@1": 1, mrr: 1, "hit@5": 1, "recall@20": 1 } },
    wallTimeMs: 100,
    receipt: mintCollaborativeReceipt(),
    artifactPath: "/tmp/x",
    stderrTail: "",
    ...overrides,
  };
}

function stubRunRecord(opts: {
  candidateId: string;
  queryId: number;
  handoffOutcome: HandoffOutcome;
  hit1: number;
  status?: "ok" | "timeout" | "error";
  builderStatus?: "ok" | "timeout" | "error";
  diagnostics?: Record<string, number>;
  withScoringAttempt?: boolean;
  hasBuilderRun?: boolean;
}): CollaborativeRunRecord {
  const status = opts.status ?? "ok";
  const outcome: CollaborativeTaskOutcome = {
    queryId: opts.queryId,
    handoffOutcome: opts.handoffOutcome,
    hit1: opts.hit1,
    diagnostics: opts.diagnostics ?? {},
    ...(opts.withScoringAttempt !== false ? { attempt: stubScoringAttempt({ queryId: opts.queryId }) } : {}),
  };
  return {
    ...(opts.hasBuilderRun !== false
      ? { builderBattery: stubBattery("b"), builderRun: stubBatteryRun(opts.builderStatus ?? "ok") }
      : {}),
    candidateId: opts.candidateId,
    answererBattery: stubBattery("a"),
    answererRun: stubBatteryRun(status),
    fitnessRun: stubBatteryRun(status, { result: stubEvalResult({ testPassRate: opts.hit1 }) }),
    attempts: outcome.attempt ? [outcome.attempt] : [],
    outcomes: [outcome],
    handoffRecords: [],
    preflight: { fingerprintOk: true, warmUpWallTimeMs: 100, warmUpAttempt: stubScoringAttempt() },
  } as unknown as CollaborativeRunRecord;
}

function stubRoundResult(opts: {
  candidates: CollaborativeCandidate[];
  winner: string | null;
  promote: boolean;
  failedReasons?: string[];
}): CollaborativeRoundResult {
  const searchRuns = new Map<string, CollaborativeRunRecord>();
  for (const c of opts.candidates) {
    searchRuns.set(
      c.id,
      stubRunRecord({ candidateId: c.id, queryId: 1, handoffOutcome: { kind: "success", artifact: stubArtifact(1) }, hit1: 1 }),
    );
  }
  return {
    searchRuns,
    winner: opts.winner,
    judgment: { winner: opts.winner, advantages: [] } as unknown as Judgment,
    promotion: opts.winner
      ? ({
          inputs: {},
          verdict: { promote: opts.promote, failed: opts.promote ? [] : (opts.failedReasons ?? ["does-not-beat-incumbent"]) },
          searchFitness: 0.5,
          promotionFitness: 0.5,
          searchPromotionGap: 0,
          noiseMargin: 0,
          reasons: {},
        } as unknown as CollaborativeRoundResult["promotion"])
      : null,
    promotionRun: null,
    archiveEntry: null as unknown as ComponentArchiveEntry | null,
    promoted: [],
    receipt: null,
    diagnostics: { componentVariantIds: {} },
  };
}

function makeBatteryFnSpy(handoffOutcomeFor: (arm: string, queryId: number) => HandoffOutcome = () => ({ kind: "success", artifact: stubArtifact(0) })) {
  const calls: RunCollaborativeBatteryArgs[] = [];
  const fn = async (a: RunCollaborativeBatteryArgs): Promise<CollaborativeRunRecord> => {
    calls.push(a);
    const arm = a.arm ?? "graph";
    const queryId = a.tasks[0]!.queryId;
    const handoffOutcome = handoffOutcomeFor(arm, queryId);
    return stubRunRecord({
      candidateId: a.candidate.id,
      queryId,
      handoffOutcome,
      hit1: handoffOutcome.kind === "success" ? 1 : 0,
      hasBuilderRun: arm === "graph",
    });
  };
  return { fn, calls };
}

function heldoutTasks(n: number): CollaborativeBatteryTask[] {
  const tasks: CollaborativeBatteryTask[] = [];
  for (let i = 0; i < n; i++) {
    const queryId = 100 + i;
    tasks.push({ id: `stark-prime:${queryId}`, queryId, prompt: `prompt ${queryId}` });
  }
  return tasks;
}

const SELECTION_TASKS: CollaborativeBatteryTask[] = [{ id: "stark-prime:1", queryId: 1, prompt: "warm-up task" }];
const POOL_MANIFEST_STUB = { kb: "prime", hfRevision: "rev", form: "explicit", count: 1, min: 0, max: 0, idListSha256: "x", ids: [0] } as any;
const FINGERPRINT_MANIFEST_STUB = { hfPin: "rev" } as any;

/** A stub gate function accepting ANY number of paired units (the real
 *  `evaluateAblationGate` refuses anything but exactly 75) -- used by the
 *  small-scale offline tracer tests below, mirroring the plan's own
 *  instruction to make "the gate function" an injectable seam. */
const stubGateFn = ((units: { graphHit1: number; nullHit1: number }[]) => ({
  primaryPass: true,
  secondaryFlag: false,
  delta1: 6,
  delta2: 5,
  primaryDifference: units.reduce((s, u) => s + u.graphHit1 - u.nullHit1, 0),
  secondaryDifference: 0,
  counts: {
    pairs: units.length,
    graphHits: units.filter((u) => u.graphHit1 === 1).length,
    nullHits: units.filter((u) => u.nullHit1 === 1).length,
    bothHit: 0,
    bothMiss: 0,
    graphOnlyHits: 0,
    nullOnlyHits: 0,
    discordant: 0,
  },
  signTest: { discordant: 0, criticalValue: null, graphOnlyHits: 0, result: "UNDERPOWERED" },
})) as unknown as typeof evaluateAblationGate;

/** Full offline deps for `main()` -- every real call replaced. Overrides
 *  merge shallowly. */
function fullDeps(overrides: Partial<CollabRoundDeps> = {}): CollabRoundDeps {
  const noop = () => {};
  return {
    gateFn: stubGateFn,
    // A fresh, isolated state path per call -- tests must never share a
    // state file (a real "state.json" would leak `state.selection` across
    // unrelated test cases and silently skip the shell round).
    env: { ...REQUIRED_ENV, COLLAB_ROUND_STATE: freshStatePath() },
    chdirFn: noop,
    gitRevParseFn: () => "repo1234",
    loadPairsFn: () => [{ relPath: "_pair-a.md", builderPrompt: "b", answererPrompt: "a", candidate: stubCandidate("cand-a") }],
    selectionTasksFn: () => SELECTION_TASKS,
    heldoutTasksFn: () => heldoutTasks(1),
    providerFn: () => ({ kind: "openai", baseUrl: "http://x", chat: vi.fn() }) as any,
    poolManifest: POOL_MANIFEST_STUB,
    fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
    shellRoundFn: async (a: RunCollaborativeRoundArgs) => stubRoundResult({ candidates: a.candidates, winner: a.candidates[0]!.id, promote: true }),
    batteryFn: makeBatteryFnSpy().fn,
    writeVerdictFn: noop,
    writeReportFn: noop,
    ...overrides,
  };
}

// ── requireEnv / required inputs (Task 1) ────────────────────────────────

describe("required inputs -- no default, throws by name", () => {
  for (const missing of Object.keys(REQUIRED_ENV)) {
    it(`throws naming ${missing} when it is absent`, async () => {
      const env = { ...REQUIRED_ENV } as Record<string, string>;
      delete env[missing];
      await expect(main({ ...fullDeps(), env })).rejects.toThrow(new RegExp(missing));
    });
  }

  it("requireEnv itself throws naming the variable, no default", () => {
    expect(() => requireEnv("SOME_VAR", {})).toThrow(/SOME_VAR/);
  });

  for (const bad of ["0", "-5", "not-a-number"]) {
    it(`ceiling value ${JSON.stringify(bad)} throws naming COLLAB_ROUND_CEILING_MS`, async () => {
      const env = { ...REQUIRED_ENV, COLLAB_ROUND_CEILING_MS: bad };
      await expect(main({ ...fullDeps(), env })).rejects.toThrow(/COLLAB_ROUND_CEILING_MS/);
    });
  }
});

// ── import safety ────────────────────────────────────────────────────────

describe("import safety", () => {
  it("importing the module with no environment variables set performs no call and does not throw", async () => {
    const prevEnv = { ...process.env };
    for (const k of Object.keys(REQUIRED_ENV)) delete process.env[k];
    try {
      const mod = await import("../experiments/collab-round/_collab-round.js");
      expect(typeof mod.main).toBe("function");
    } finally {
      process.env = prevEnv;
    }
  });

  it("exports onceWithHarnessRetry and requireEnv as functions (the plan's own paired precedent -- _paired-study.ts -- also declares onceWithHarnessRetry async, so the literal check is on the export, not the exact 'export function' keyword sequence)", async () => {
    const mod = await import("../experiments/collab-round/_collab-round.js");
    expect(typeof mod.onceWithHarnessRetry).toBe("function");
    expect(typeof mod.requireEnv).toBe("function");
    expect(DRIVER_SOURCE).toMatch(/export (async )?function onceWithHarnessRetry\(/);
    expect(DRIVER_SOURCE).toMatch(/export function requireEnv\(/);
  });

  it("no import specifier resolves into the paired-comparison study directory", () => {
    const importLines = DRIVER_SOURCE.split("\n").filter((l) => /^import /.test(l.trim()));
    for (const line of importLines) {
      expect(line).not.toMatch(/paired-comparison-arm/);
    }
  });

  it("the driver's source names neither probe artifact file", () => {
    expect(DRIVER_SOURCE).not.toMatch(/collab-probe-state\.json/);
    expect(DRIVER_SOURCE).not.toMatch(/collab-probe-verdict\.json/);
  });
});

// ── Task 1 tracer: one pair, one query, both arms, to a completed verdict ──

describe("main() -- one pair, one query, both arms, to a completed verdict (Task 1 tracer)", () => {
  it("calls the injected battery function exactly twice, graph then no-subgraph, same query id", async () => {
    const spy = makeBatteryFnSpy();
    const writeVerdictFn = vi.fn();
    const verdict = await main(fullDeps({ batteryFn: spy.fn, writeVerdictFn }));

    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]!.arm ?? "graph").toBe("graph");
    expect(spy.calls[1]!.arm).toBe("no-subgraph");
    expect(spy.calls[0]!.tasks[0]!.queryId).toBe(spy.calls[1]!.tasks[0]!.queryId);

    expect(writeVerdictFn).toHaveBeenCalledTimes(1);
    expect(verdict.complete).toBe(true);
  });

  it("the injected artifact writer is called exactly once with a completion marker of true", async () => {
    const writeVerdictFn = vi.fn();
    await main(fullDeps({ writeVerdictFn }));
    expect(writeVerdictFn).toHaveBeenCalledTimes(1);
    const payload = writeVerdictFn.mock.calls[0]![0] as { complete: boolean };
    expect(payload.complete).toBe(true);
  });

  it("every heldout battery call's task array has length 1 and its run options carry concurrency 1", async () => {
    const spy = makeBatteryFnSpy();
    await main(fullDeps({ batteryFn: spy.fn }));
    for (const call of spy.calls) {
      expect(call.tasks).toHaveLength(1);
      expect(call.runOpts?.concurrency).toBe(1);
    }
  });

  it("D-13: every heldout battery call pins provider.model, not just providerImpl", async () => {
    const spy = makeBatteryFnSpy();
    await main(fullDeps({ batteryFn: spy.fn }));
    for (const call of spy.calls) {
      expect(call.runOpts?.provider?.model).toBe("gpt-oss:latest");
    }
  });

  it("D-13: the selection round's own run options also pin provider.model", async () => {
    let capturedRunOpts: RunCollaborativeRoundArgs["runOpts"];
    const shellRoundFn = async (a: RunCollaborativeRoundArgs) => {
      capturedRunOpts = a.runOpts;
      return stubRoundResult({ candidates: a.candidates, winner: a.candidates[0]!.id, promote: true });
    };
    await main(fullDeps({ shellRoundFn }));
    expect(capturedRunOpts?.provider?.model).toBe("gpt-oss:latest");
    expect(capturedRunOpts?.concurrency).toBe(1);
  });
});

// ── Task 2: the full round -- 150 interleaved units ──────────────────────

describe("runHeldoutUnits -- 150 units for a 75-query suite, interleaved, winner-only", () => {
  it("runs exactly 150 units for a 75-query suite, ordered ascending query id, graph then null per query", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("winner-1");
    const spy = makeBatteryFnSpy();
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1_000,
      warmUpQueryId: 1,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    await runHeldoutUnits(statePath, state, winner, heldoutTasks(ABLATION_SUITE_SIZE), cfg, spy.fn);

    expect(spy.calls).toHaveLength(150);
    let lastQueryId = -Infinity;
    for (let i = 0; i < spy.calls.length; i += 2) {
      const graphCall = spy.calls[i]!;
      const nullCall = spy.calls[i + 1]!;
      expect(graphCall.arm ?? "graph").toBe("graph");
      expect(nullCall.arm).toBe("no-subgraph");
      expect(graphCall.tasks[0]!.queryId).toBe(nullCall.tasks[0]!.queryId);
      expect(graphCall.tasks[0]!.queryId).toBeGreaterThanOrEqual(lastQueryId);
      lastQueryId = graphCall.tasks[0]!.queryId;
    }
  });

  it("every call's warm-up query id equals the fixed configured value, and only the winner's id appears in unit keys", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("winner-only");
    const spy = makeBatteryFnSpy();
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1_000,
      warmUpQueryId: 42,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    await runHeldoutUnits(statePath, state, winner, heldoutTasks(3), cfg, spy.fn);
    for (const call of spy.calls) expect(call.warmUp.queryId).toBe(42);
    for (const key of Object.keys(state.units)) expect(key).toContain("winner-only");
  });
});

describe("toAblationUnits -- folds 150 unit results into 75 paired units", () => {
  function fillState(winner: string, n: number, overrides: Partial<CollabUnitResult> = {}): CollabRoundState {
    const state: CollabRoundState = { units: {}, retries: [] };
    for (let i = 0; i < n; i++) {
      const queryId = i;
      state.units[unitKey("graph", winner, queryId)] = {
        arm: "graph",
        queryId,
        candidateId: winner,
        status: "ok",
        handoffOutcomeKind: "success",
        hit1: 1,
        wallMs: 1,
        diagnostics: {},
        ...overrides,
      };
      state.units[unitKey("no-subgraph", winner, queryId)] = {
        arm: "no-subgraph",
        queryId,
        candidateId: winner,
        status: "ok",
        handoffOutcomeKind: "success",
        hit1: 0,
        wallMs: 1,
        diagnostics: {},
      };
    }
    return state;
  }

  it("folds exactly 75 units for a 75-query suite", () => {
    const state = fillState("w", ABLATION_SUITE_SIZE);
    const units = toAblationUnits(state, "w", Array.from({ length: ABLATION_SUITE_SIZE }, (_, i) => i));
    expect(units).toHaveLength(ABLATION_SUITE_SIZE);
  });

  it("a non-success handoff outcome, a non-scored bridge outcome, a timeout status and an error status each fold to 0", () => {
    const state: CollabRoundState = { units: {}, retries: [] };
    const cases: Array<[string, Partial<CollabUnitResult>]> = [
      ["cd05-violation", { handoffOutcomeKind: "cd05-violation", hit1: 0 }],
      ["bridge-non-success", { handoffOutcomeKind: "bridge-non-success", hit1: 0 }],
      ["timeout", { status: "timeout", handoffOutcomeKind: "bridge-non-success", hit1: 0 }],
      ["error", { status: "error", handoffOutcomeKind: "bridge-non-success", hit1: 0 }],
    ];
    cases.forEach(([, overrides], i) => {
      state.units[unitKey("graph", "w", i)] = { arm: "graph", queryId: i, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 1, wallMs: 1, diagnostics: {}, ...overrides };
      state.units[unitKey("no-subgraph", "w", i)] = { arm: "no-subgraph", queryId: i, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 0, wallMs: 1, diagnostics: {} };
    });
    const units = toAblationUnits(state, "w", cases.map((_, i) => i));
    for (const u of units) expect(u.graphHit1).toBe(0);
  });

  it("throws by name when an expected unit key is missing", () => {
    const state: CollabRoundState = { units: {}, retries: [] };
    expect(() => toAblationUnits(state, "w", [1])).toThrow(/graph:w:1/);
  });
});

describe("assembleVerdict -- completion marker only when every expected unit exists", () => {
  function fullState(winner: string): CollabRoundState {
    const state: CollabRoundState = { units: {}, retries: [] };
    for (let i = 0; i < ABLATION_SUITE_SIZE; i++) {
      state.units[unitKey("graph", winner, i)] = { arm: "graph", queryId: i, candidateId: winner, status: "ok", handoffOutcomeKind: i < 10 ? "success" : "bridge-non-success", hit1: i < 10 ? 1 : 0, wallMs: 1, diagnostics: {} };
      state.units[unitKey("no-subgraph", winner, i)] = { arm: "no-subgraph", queryId: i, candidateId: winner, status: "ok", handoffOutcomeKind: "success", hit1: 0, wallMs: 1, diagnostics: {} };
    }
    return state;
  }

  const runConfig = buildRunConfig("commit", 1000, ".stz/x", "collab-stark-prime", 1, POOL_MANIFEST_STUB, FINGERPRINT_MANIFEST_STUB, () => "repo1");
  const selection: CollabRoundSelection = {
    pairs: [{ specimenId: "w", pairFileBasename: "_pair-w.md", searchFitness: 0.5 }],
    winner: "w",
    promotionVerdict: { promote: true, reason: "promoted" },
  };

  it("with 149 unit results, throws or does not mark completion", () => {
    const state = fullState("w");
    delete state.units[unitKey("no-subgraph", "w", 74)];
    expect(() => assembleVerdict(state, selection, runConfig, Array.from({ length: ABLATION_SUITE_SIZE }, (_, i) => i))).toThrow(/no-subgraph:w:74/);
  });

  it("with all 150 present, marks completion true and calls the gate exactly once (via injected gateFn)", () => {
    const state = fullState("w");
    const gateFn = vi.fn(evaluateAblationGate) as unknown as typeof evaluateAblationGate;
    const verdict = assembleVerdict(state, selection, runConfig, Array.from({ length: ABLATION_SUITE_SIZE }, (_, i) => i), gateFn);
    expect(verdict.complete).toBe(true);
    expect(gateFn).toHaveBeenCalledTimes(1);
  });

  it("the diagnostics tally's key count equals HANDOFF_OUTCOME_KINDS.length, with every kind present", () => {
    const state = fullState("w");
    const verdict = assembleVerdict(state, selection, runConfig, Array.from({ length: ABLATION_SUITE_SIZE }, (_, i) => i));
    expect(Object.keys(verdict.diagnostics.handoffOutcomeTally)).toHaveLength(HANDOFF_OUTCOME_KINDS.length);
    for (const kind of HANDOFF_OUTCOME_KINDS) expect(verdict.diagnostics.handoffOutcomeTally).toHaveProperty(kind);
  });
});

// ── runSelectionRound -- passes through unaltered, no re-derivation ──────

describe("runSelectionRound -- calls the shell once, returns its result unaltered", () => {
  it("passes all candidates, the task list, concurrency 1, a strictly positive gate threshold, diversityFloor 0, and no incumbent", async () => {
    const candidates = [stubCandidate("a"), stubCandidate("b"), stubCandidate("c")];
    let captured: RunCollaborativeRoundArgs | undefined;
    const shellRoundFn = async (a: RunCollaborativeRoundArgs) => {
      captured = a;
      return stubRoundResult({ candidates: a.candidates, winner: "a", promote: true });
    };
    const args: RunSelectionRoundArgs = {
      candidates,
      tasks: SELECTION_TASKS,
      runDir: "/tmp/x",
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      warmUp: { queryId: 1, predDict: { "0": 1 } },
      archive: { root: ".stz/x", slot: "collab-stark-prime" },
      runOpts: { concurrency: 1, provider: { kind: "openai", baseUrl: "http://x", model: "gpt-oss:latest" } },
    };
    const result = await runSelectionRound(args, shellRoundFn);

    expect(captured!.candidates).toEqual(candidates);
    expect(captured!.tasks).toEqual(SELECTION_TASKS);
    expect(captured!.runOpts?.concurrency).toBe(1);
    expect(captured!.gateThreshold).toBeGreaterThan(0);
    expect(captured!.diversityFloor).toBe(0);
    expect(captured!.incumbentFrontmatter).toBeNull();
    expect(captured!.incumbentFitness).toBeNull();
    expect(captured!.warmUp).toEqual({ queryId: 1, predDict: { "0": 1 } });
    expect(result.winner).toBe("a");
    // T-23-08: the neighbourhood function reaches the shell by IDENTITY --
    // the driver never wraps it in a per-task guard of its own. Refusals are
    // handled one altitude down, inside runCollaborativeBattery, which is
    // the only place a refusal can become one task's miss rather than the
    // whole selection round's crash.
    expect(Object.is(captured!.kbNeighborhoodFn, args.kbNeighborhoodFn)).toBe(true);
  });
});

// ── T-23-08: the state path accepts the launcher's own env-var name ──────

describe("resolveStatePath -- launcher-compatible state path resolution (T-23-08)", () => {
  const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "experiments", "collab-round");

  it("accepts the launcher's COLLAB_STATE when COLLAB_ROUND_STATE is unset, resolved beside the script", () => {
    expect(resolveStatePath({ COLLAB_STATE: "collab-round-state.json" })).toBe(
      join(SCRIPT_DIR, "collab-round-state.json"),
    );
  });

  it("COLLAB_ROUND_STATE still wins when both are set -- every previously documented invocation keeps working", () => {
    expect(
      resolveStatePath({ COLLAB_ROUND_STATE: "explicit.json", COLLAB_STATE: "launcher.json" }),
    ).toBe(join(SCRIPT_DIR, "explicit.json"));
  });

  it("an absolute path is passed through untouched", () => {
    expect(resolveStatePath({ COLLAB_ROUND_STATE: "/tmp/somewhere/state.json" })).toBe("/tmp/somewhere/state.json");
  });

  it("a relative name never resolves against the process cwd -- main() chdirs to the repo root before the first state write", () => {
    const resolved = resolveStatePath({ COLLAB_STATE: "collab-round-state.json" });
    expect(resolved).not.toBe(join(process.cwd(), "collab-round-state.json"));
    expect(resolved.startsWith(SCRIPT_DIR)).toBe(true);
  });

  it("refuses by name, naming BOTH accepted variables, when neither is set", () => {
    expect(() => resolveStatePath({})).toThrow(/COLLAB_ROUND_STATE.*COLLAB_STATE/s);
  });
});

// ── Task 3: crash safety, one retry, promotion-refusal terminal state ────

describe("crash safety -- resume executes only remaining units", () => {
  it("a run resumed against a state file with 100 completed units executes only the remaining 50", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("w");
    const tasks = heldoutTasks(ABLATION_SUITE_SIZE);
    for (let i = 0; i < 50; i++) {
      const q = tasks[i]!.queryId;
      state.units[unitKey("graph", "w", q)] = { arm: "graph", queryId: q, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 1, wallMs: 1, diagnostics: {} };
      state.units[unitKey("no-subgraph", "w", q)] = { arm: "no-subgraph", queryId: q, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 0, wallMs: 1, diagnostics: {} };
    }
    const spy = makeBatteryFnSpy();
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1000,
      warmUpQueryId: 1,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    await runHeldoutUnits(statePath, state, winner, tasks, cfg, spy.fn);
    expect(spy.calls).toHaveLength(50);
  });

  it("cached unit results returned on resume are the SAME object references stored in the state (identity check)", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const cached: CollabUnitResult = { arm: "graph", queryId: 1, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 1, wallMs: 1, diagnostics: {} };
    const key = unitKey("graph", "w", 1);
    state.units[key] = cached;
    let workCalls = 0;
    const result = await once(statePath, state, key, async () => {
      workCalls++;
      throw new Error("must not be called for a cached key");
    });
    expect(workCalls).toBe(0);
    expect(result).toBe(cached);
  });

  it("the state save writes to a temporary path then renames -- no .tmp file survives, and the final path carries the written content", () => {
    const statePath = freshStatePath();
    const tmpPath = `${statePath}.tmp`;
    const written: CollabRoundState = { units: { x: { arm: "graph", queryId: 1, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 1, wallMs: 1, diagnostics: {} } }, retries: [] };
    saveState(statePath, written);
    // The rename target exists with the written content...
    expect(existsSync(statePath)).toBe(true);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual(written);
    // ...and the temporary file used to get there does not survive the
    // rename -- proves this was tmp-write-then-rename, not a direct write.
    expect(existsSync(tmpPath)).toBe(false);
  });
});

describe("onceWithHarnessRetry -- one retry on error, never on timeout", () => {
  it("a unit whose first attempt reports status:'error' is retried once; a second success is recorded; one retry line appended", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<CollabUnitResult> => {
      calls++;
      return calls === 1
        ? { arm: "graph", queryId: 1, candidateId: "w", status: "error", handoffOutcomeKind: "bridge-non-success", hit1: 0, wallMs: 1, diagnostics: {}, failureReason: "boom" }
        : { arm: "graph", queryId: 1, candidateId: "w", status: "ok", handoffOutcomeKind: "success", hit1: 1, wallMs: 1, diagnostics: {} };
    };
    const key = unitKey("graph", "w", 1);
    const result = await onceWithHarnessRetry(statePath, state, key, work);
    expect(calls).toBe(2);
    expect(state.retries).toHaveLength(1);
    expect(result.status).toBe("ok");
    expect(Object.keys(state.units)).toEqual([key]);
  });

  it("a unit that errors twice is recorded once, hit value folds to zero, exactly one retry line", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<CollabUnitResult> => {
      calls++;
      return { arm: "graph", queryId: 1, candidateId: "w", status: "error", handoffOutcomeKind: "bridge-non-success", hit1: 0, wallMs: 1, diagnostics: {}, failureReason: `fail-${calls}` };
    };
    const key = unitKey("graph", "w", 1);
    const result = await onceWithHarnessRetry(statePath, state, key, work);
    expect(calls).toBe(2);
    expect(state.retries).toHaveLength(1);
    expect(Object.keys(state.units)).toEqual([key]);
    expect(result.hit1).toBe(0);
  });

  it("a unit that reports status:'timeout' is never retried and folds to zero", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<CollabUnitResult> => {
      calls++;
      return { arm: "graph", queryId: 1, candidateId: "w", status: "timeout", handoffOutcomeKind: "bridge-non-success", hit1: 0, wallMs: 1, diagnostics: {} };
    };
    const result = await onceWithHarnessRetry(statePath, state, unitKey("graph", "w", 1), work);
    expect(calls).toBe(1);
    expect(state.retries).toHaveLength(0);
    expect(result.hit1).toBe(0);
  });
});

describe("promotion-refusal terminal state (D-12)", () => {
  it("main(): when the shell result carries a refused promotion, no heldout unit runs; verdict outcome is PROMOTION-REFUSED; completion marker true", async () => {
    const shellRoundFn = async (a: RunCollaborativeRoundArgs) =>
      stubRoundResult({ candidates: a.candidates, winner: a.candidates[0]!.id, promote: false, failedReasons: ["does-not-beat-incumbent"] });
    const spy = makeBatteryFnSpy();
    const writeVerdictFn = vi.fn();
    const verdict = await main(fullDeps({ shellRoundFn, batteryFn: spy.fn, writeVerdictFn }));

    expect(spy.calls).toHaveLength(0);
    expect(verdict.outcome).toBe("PROMOTION-REFUSED");
    expect(verdict.complete).toBe(true);
    expect(verdict.diagnostics.selection.promotionVerdict.reason).toMatch(/does-not-beat-incumbent/);
    expect(verdict.unitRecords).toHaveLength(0);
  });

  it("assembleVerdict directly: refused promotion produces an empty unit-record array and no gate counts", () => {
    const state: CollabRoundState = { units: {}, retries: [] };
    const runConfig = buildRunConfig("c", 1000, ".stz/x", "collab-stark-prime", 1, POOL_MANIFEST_STUB, FINGERPRINT_MANIFEST_STUB, () => "repo1");
    const selection: CollabRoundSelection = {
      pairs: [{ specimenId: "w", pairFileBasename: "_pair-w.md", searchFitness: 0.1 }],
      winner: "w",
      promotionVerdict: { promote: false, reason: "seal-integrity-drift" },
    };
    const verdict = assembleVerdict(state, selection, runConfig, []);
    expect(verdict.complete).toBe(true);
    expect(verdict.outcome).toBe("PROMOTION-REFUSED");
    expect(verdict.unitRecords).toEqual([]);
    expect(verdict.gate.counts.pairs).toBe(0);
  });
});

// ── the two synthetic non-completion kinds this driver's own single-task
// shape can observe ────────────────────────────────────────────────────

describe("all-handoffs-failed-battery-refused boundary (deferred-items.md)", () => {
  it("a battery call that throws BatteryShapeError 'has zero tasks' is recorded as a miss, never a crash, never retried", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("w");
    let calls = 0;
    const batteryFn = async (a: RunCollaborativeBatteryArgs): Promise<CollaborativeRunRecord> => {
      calls++;
      if ((a.arm ?? "graph") === "graph") {
        throw new BatteryShapeError(`battery "x:answerer" has zero tasks -- a battery with no tasks trivially passes every candidate agent`);
      }
      return stubRunRecord({ candidateId: a.candidate.id, queryId: a.tasks[0]!.queryId, handoffOutcome: { kind: "success", artifact: stubArtifact(a.tasks[0]!.queryId) }, hit1: 1, hasBuilderRun: false });
    };
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1000,
      warmUpQueryId: 1,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    await runHeldoutUnits(statePath, state, winner, heldoutTasks(1), cfg, batteryFn);
    // 2 calls total (graph + null), no retry (a retry would make it 3+).
    expect(calls).toBe(2);
    const graphUnit = state.units[unitKey("graph", "w", 100)]!;
    expect(graphUnit.hit1).toBe(0);
    expect(graphUnit.status).toBe("ok");
    expect(graphUnit.handoffOutcomeKind).toBe("all-handoffs-failed-battery-refused");
    expect(state.retries).toHaveLength(0);
  });
});

describe("neighbourhood-refused boundary (orchestrator directive, live-discovered bug 4)", () => {
  it("a kbNeighborhoodFn refusal for one query is recorded as a graph-arm miss; the null arm for the same query still completes; the run continues", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("w");
    let calls = 0;
    const batteryFn = async (a: RunCollaborativeBatteryArgs): Promise<CollaborativeRunRecord> => {
      calls++;
      if ((a.arm ?? "graph") === "graph") {
        throw new CollaborativeRunnerError(
          `kbNeighborhoodFn: neighbourhood extraction for query ${a.tasks[0]!.queryId} produced invalid output -- the helper found no seed entity for this query`,
        );
      }
      return stubRunRecord({ candidateId: a.candidate.id, queryId: a.tasks[0]!.queryId, handoffOutcome: { kind: "success", artifact: stubArtifact(a.tasks[0]!.queryId) }, hit1: 1, hasBuilderRun: false });
    };
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1000,
      warmUpQueryId: 1,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    // Two queries -- proves the run CONTINUES past the refusal to the next query.
    await runHeldoutUnits(statePath, state, winner, heldoutTasks(2), cfg, batteryFn);

    expect(calls).toBe(4); // 2 queries x 2 arms, no retry, no crash
    const graphUnit1 = state.units[unitKey("graph", "w", 100)]!;
    expect(graphUnit1.status).toBe("ok"); // never a harness fault
    expect(graphUnit1.handoffOutcomeKind).toBe("neighbourhood-refused");
    expect(graphUnit1.hit1).toBe(0);
    expect(state.retries).toHaveLength(0); // deterministic, never retried

    const nullUnit1 = state.units[unitKey("no-subgraph", "w", 100)]!;
    expect(nullUnit1.handoffOutcomeKind).toBe("success");
    expect(nullUnit1.hit1).toBe(1);

    // Second query's graph unit also refused (same scripted throw) -- proves
    // the loop did not stop after the first refusal.
    const graphUnit2 = state.units[unitKey("graph", "w", 101)]!;
    expect(graphUnit2.handoffOutcomeKind).toBe("neighbourhood-refused");
  });

  it("an unrelated CollaborativeRunnerError (not the kbNeighborhoodFn prefix) still propagates and crashes the run", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const winner = stubCandidate("w");
    const batteryFn = async (): Promise<CollaborativeRunRecord> => {
      throw new CollaborativeRunnerError(`task id "bad id" is not a safe path segment`);
    };
    const cfg: HeldoutRunConfig = {
      ceilingMs: 1000,
      warmUpQueryId: 1,
      gateThreshold: 0.01,
      kbNeighborhoodFn: () => ({ queryId: 0, seeds: [], nodes: [], edges: [], relationNames: {} }),
      poolManifest: POOL_MANIFEST_STUB,
      fingerprintManifest: FINGERPRINT_MANIFEST_STUB,
      provider: {} as any,
    };
    await expect(runHeldoutUnits(statePath, state, winner, heldoutTasks(1), cfg, batteryFn)).rejects.toThrow(/not a safe path segment/);
  });
});

// ── buildRunConfig ────────────────────────────────────────────────────────

describe("buildRunConfig", () => {
  it("records the D-13 pinned model, digest, ceiling, concurrency 1, and the interleaving choice", () => {
    const cfg = buildRunConfig("paircommit", 1_800_000, ".stz/x", "collab-stark-prime", 7, POOL_MANIFEST_STUB, FINGERPRINT_MANIFEST_STUB, () => "repo1234");
    expect(cfg.modelName).toBe("gpt-oss:latest");
    expect(cfg.modelDigest).toBe("17052f91a42e");
    expect(cfg.perCallCeilingMs).toBe(1_800_000);
    expect(cfg.concurrency).toBe(1);
    expect(cfg.pairFileCommit).toBe("paircommit");
    expect(cfg.archiveRoot).toBe(".stz/x");
    expect(cfg.archiveSlot).toBe("collab-stark-prime");
    expect(cfg.warmUpQueryId).toBe(7);
    expect(cfg.interleaving.length).toBeGreaterThan(0);
    expect(cfg.repoCommit).toBe("repo1234");
    expect(typeof cfg.criticalValueTableHash).toBe("string");
    expect(cfg.manifestHashes.poolManifest).toBeTruthy();
    expect(cfg.manifestHashes.fingerprintManifest).toBeTruthy();
  });
});
