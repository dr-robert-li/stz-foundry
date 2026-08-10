/**
 * The DUALFIX study driver's checkpoint contract, resume order, D-08
 * harness-retry/control-arm distinction, and D-11/D-12 accounting/
 * termination clauses (Phase 11 — Study prereg + build, Plan 11-02,
 * REQ-62), fully offline against `_dualfix-study.ts`'s exported pure
 * helpers — no provider, no process spawn, no `main()` invocation.
 *
 * State lives under a fresh `mkdtempSync` directory for every test — no
 * state, log, or corpus file is ever written under
 * `experiments/dualfix-study/` by this suite (RESEARCH Pitfall 3), matching
 * `test/dualfix-study-arms.test.ts`'s own convention.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DUALFIX_ARMS,
  DUALFIX_CORPUS_MIN_N,
  DUALFIX_ERROR_BUDGET_NUM,
  DUALFIX_ERROR_BUDGET_DEN,
  dualfixUnitKey,
  loadState,
  saveState,
  once,
  type DualfixArm,
  type DualfixArmResult,
  type DualfixState,
  type DualfixCorpusEntry,
} from "../experiments/dualfix-study/_dualfix-arms.js";
import {
  validateCorpusEntries,
  buildUnitOrder,
  onceWithHarnessRetry,
  runStudyUnits,
  computeArmAccounting,
  isUnderpowered,
  isErrorBudgetExceeded,
  assertCorpusPinned,
  requireFinitePositiveNumber,
} from "../experiments/dualfix-study/_dualfix-study.js";

function freshStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "dualfix-study-driver-test-")), "state.json");
}

function makeResult(
  arm: DualfixArm,
  taskId: string,
  status: DualfixArmResult["status"],
  overrides: Partial<DualfixArmResult> = {},
): DualfixArmResult {
  return {
    arm,
    taskId,
    status,
    rawText: "raw",
    artifact: null,
    category: "no-artifact",
    gradedScore: 0,
    exact: false,
    repaired: false,
    engineError: null,
    inputTokens: 1,
    outputTokens: 1,
    wallMs: 1,
    ...overrides,
  };
}

function makeCorpusEntry(overrides: Partial<DualfixCorpusEntry>): DualfixCorpusEntry {
  return {
    seed: 1201,
    levelId: "L3",
    taskIndex: 0,
    taskId: "bi-analytics-L3-0-1201",
    question: "q",
    rawText: "r",
    artifact: null,
    category: "no-artifact",
    gradedScore: 0,
    engineError: null,
    ...overrides,
  };
}

// ── state round-trip ─────────────────────────────────────────────────────

describe("state round-trip", () => {
  it("saveState then loadState round-trips every recorded unit including verbatim raw text; no .tmp survives", () => {
    const statePath = freshStatePath();
    const rawText = '```sql\nSELECT 1\n```\nverbatim text with\nnewlines and "quotes"';
    const result = makeResult("dualfix", "task-1", "ok", { rawText, artifact: "SELECT 1", category: "correct", gradedScore: 1, exact: true, repaired: true });
    const state: DualfixState = { units: { "dualfix::task-1": result }, retries: [] };

    saveState(statePath, state);
    expect(existsSync(`${statePath}.tmp`)).toBe(false);

    const reloaded = loadState(statePath);
    expect(reloaded.units["dualfix::task-1"]).toEqual(result);
    expect(reloaded.units["dualfix::task-1"]!.rawText).toBe(rawText);
  });

  // WR-09: a bare catch collapsed every failure mode into "start fresh" —
  // only ENOENT (no state file yet) should do that.
  it("loadState returns fresh state for a path that does not exist (ENOENT)", () => {
    const state = loadState(freshStatePath());
    expect(state).toEqual({ units: {}, retries: [] });
  });

  it("loadState throws (does not silently discard) on corrupt/truncated JSON", () => {
    const statePath = freshStatePath();
    writeFileSync(statePath, "{ this is not valid json");
    expect(() => loadState(statePath)).toThrow();
  });

  it("loadState throws (does not silently discard) when the path is a directory (EISDIR)", () => {
    const statePath = freshStatePath();
    mkdirSync(statePath);
    expect(() => loadState(statePath)).toThrow();
  });
});

// ── cached once() ────────────────────────────────────────────────────────

describe("once() called twice for the same unit key", () => {
  it("invokes the work function once; the second call returns the cached result", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<DualfixArmResult> => {
      calls++;
      return makeResult("dualfix", "task-1", "ok");
    };

    const first = await once(statePath, state, "dualfix::task-1", work);
    const second = await once(statePath, state, "dualfix::task-1", work);

    expect(calls).toBe(1);
    expect(second).toEqual(first);
  });
});

// ── corpus validation ────────────────────────────────────────────────────

describe("corpus validation", () => {
  it("throws loudly on a malformed entry rather than skipping it", () => {
    expect(() => validateCorpusEntries([{ seed: 1, levelId: "L3" }])).toThrow(/missing required field/);
  });

  it("throws when the corpus is not an array", () => {
    expect(() => validateCorpusEntries({ not: "an array" })).toThrow(/must be a JSON array/);
  });

  it("accepts a well-formed array, nullable fields (artifact/engineError) passed through", () => {
    const good = [makeCorpusEntry({})];
    expect(validateCorpusEntries(good)).toEqual(good);
  });

  // WR-02: type/value validity, not just field presence.
  it("rejects a non-numeric seed", () => {
    expect(() => validateCorpusEntries([makeCorpusEntry({ seed: "not-a-number" as unknown as number })])).toThrow(/"seed" must be a number/);
  });

  it("rejects a negative taskIndex", () => {
    expect(() => validateCorpusEntries([makeCorpusEntry({ taskIndex: -1 })])).toThrow(/"taskIndex" must be a non-negative number/);
  });

  it("rejects a category outside BiCategory's four-member union", () => {
    expect(() => validateCorpusEntries([makeCorpusEntry({ category: "banana" as unknown as DualfixCorpusEntry["category"] })])).toThrow(
      /"category" is not a valid BiCategory/,
    );
  });

  it("rejects a gradedScore other than exactly 0 (§4 eligibility)", () => {
    expect(() => validateCorpusEntries([makeCorpusEntry({ gradedScore: 0.7 })])).toThrow(/"gradedScore" must be exactly 0/);
  });

  it("rejects a hand-built category:\"correct\" entry even if gradedScore were forced to 0", () => {
    expect(() =>
      validateCorpusEntries([makeCorpusEntry({ category: "correct" as unknown as DualfixCorpusEntry["category"], gradedScore: 0 })]),
    ).toThrow(/category "correct"/);
  });
});

// ── ordering helper — the total, stable, array-index tie-break ──────────

describe("ordering helper — the corpus-array-order-then-arm-order tie-break", () => {
  it("two entries identical in every field except array position produce a sequence following array index", () => {
    const identicalEntry = makeCorpusEntry({ taskId: "same-task-id" });
    const corpus = [identicalEntry, identicalEntry];

    const order = buildUnitOrder(corpus);

    expect(order).toEqual([
      { corpusIndex: 0, arm: "dualfix", taskId: "same-task-id", unitKey: "dualfix::same-task-id" },
      { corpusIndex: 0, arm: "naive-retry", taskId: "same-task-id", unitKey: "naive-retry::same-task-id" },
      { corpusIndex: 1, arm: "dualfix", taskId: "same-task-id", unitKey: "dualfix::same-task-id" },
      { corpusIndex: 1, arm: "naive-retry", taskId: "same-task-id", unitKey: "naive-retry::same-task-id" },
    ]);
  });

  it("DUALFIX_ARMS order (dualfix, then naive-retry) is what the sequence follows within one entry", () => {
    expect(DUALFIX_ARMS).toEqual(["dualfix", "naive-retry"]);
  });
});

// ── D-08: the harness-fault retry vs the naive-retry control arm ────────

describe("harness-fault retry (D-08) — distinct from the naive-retry control arm", () => {
  it("a work function yielding status:'error' is retried exactly once; the retry is recorded in state.retries; the unit keeps exactly one result", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<DualfixArmResult> => {
      calls++;
      return calls === 1 ? makeResult("dualfix", "task-1", "error", { failureReason: "boom" }) : makeResult("dualfix", "task-1", "ok");
    };
    const key = dualfixUnitKey("dualfix", "task-1");

    const result = await onceWithHarnessRetry(statePath, state, key, work);

    expect(calls).toBe(2);
    expect(state.retries).toHaveLength(1);
    expect(result.status).toBe("ok");
    // the unit's own result is a single entry, never appended/duplicated by
    // the retry — the retry ledger (state.retries) is a field distinct from
    // the checkpoint map (state.units), reachable by two different
    // identifiers.
    expect(Object.keys(state.units)).toEqual([key]);
  });

  it("a work function yielding status:'timeout' is not retried", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<DualfixArmResult> => {
      calls++;
      return makeResult("dualfix", "task-1", "timeout");
    };
    const key = dualfixUnitKey("dualfix", "task-1");

    const result = await onceWithHarnessRetry(statePath, state, key, work);

    expect(calls).toBe(1);
    expect(state.retries).toHaveLength(0);
    expect(result.status).toBe("timeout");
  });

  it("the naive-retry CONTROL ARM's unit key is reachable only through dualfixUnitKey, never through state.retries", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const controlArmKey = dualfixUnitKey("naive-retry", "task-1");
    expect(controlArmKey).toBe("naive-retry::task-1");

    await onceWithHarnessRetry(statePath, state, controlArmKey, async () => makeResult("naive-retry", "task-1", "ok"));

    expect(state.retries).toHaveLength(0);
    expect(state.units[controlArmKey]).toBeDefined();
  });
});

// ── corpus-order resume ──────────────────────────────────────────────────

describe("corpus-order resume", () => {
  const corpus = [
    makeCorpusEntry({ taskId: "task-a", taskIndex: 0 }),
    makeCorpusEntry({ taskId: "task-b", taskIndex: 1 }),
    makeCorpusEntry({ taskId: "task-c", taskIndex: 2 }),
  ];

  it("unit keys appear in the state map in corpus-array order with both arms per entry", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const callOrder: string[] = [];
    const runUnit = async (arm: DualfixArm, entry: DualfixCorpusEntry): Promise<DualfixArmResult> => {
      callOrder.push(dualfixUnitKey(arm, entry.taskId));
      return makeResult(arm, entry.taskId, "ok");
    };

    await runStudyUnits(statePath, state, corpus, runUnit);

    const expectedOrder = buildUnitOrder(corpus).map((u) => u.unitKey);
    expect(callOrder).toEqual(expectedOrder);
    expect(Object.keys(state.units)).toEqual(expectedOrder);
  });

  it("resumes at the second entry in the same order after the state is truncated to the first entry's units", async () => {
    const statePath = freshStatePath();
    const preseeded: DualfixState = {
      units: {
        [dualfixUnitKey("dualfix", "task-a")]: makeResult("dualfix", "task-a", "ok"),
        [dualfixUnitKey("naive-retry", "task-a")]: makeResult("naive-retry", "task-a", "ok"),
      },
      retries: [],
    };
    saveState(statePath, preseeded);
    const state = loadState(statePath);
    const callOrder: string[] = [];
    const runUnit = async (arm: DualfixArm, entry: DualfixCorpusEntry): Promise<DualfixArmResult> => {
      callOrder.push(dualfixUnitKey(arm, entry.taskId));
      return makeResult(arm, entry.taskId, "ok");
    };

    await runStudyUnits(statePath, state, corpus, runUnit);

    const expectedResumeOrder = buildUnitOrder(corpus)
      .filter((u) => u.corpusIndex > 0)
      .map((u) => u.unitKey);
    expect(callOrder).toEqual(expectedResumeOrder);
    expect(Object.keys(state.units)).toEqual(buildUnitOrder(corpus).map((u) => u.unitKey));
  });
});

// ── D-12: the denominator rule ───────────────────────────────────────────

describe("per-arm accounting — D-12 denominator rule", () => {
  it("counts a timeout and an error unit in the attempted denominator as non-repairs; ok-only counts are reported separately", () => {
    const units: Record<string, DualfixArmResult> = {
      "dualfix::t1": makeResult("dualfix", "t1", "ok", { repaired: true }),
      "dualfix::t2": makeResult("dualfix", "t2", "ok", { repaired: false }),
      "dualfix::t3": makeResult("dualfix", "t3", "timeout", { repaired: false }),
      "dualfix::t4": makeResult("dualfix", "t4", "error", { repaired: false }),
      // a naive-retry unit must not leak into the dualfix arm's accounting
      "naive-retry::t1": makeResult("naive-retry", "t1", "ok", { repaired: true }),
    };

    const acc = computeArmAccounting(units, "dualfix");

    expect(acc.attempted).toBe(4);
    expect(acc.ok).toBe(2);
    expect(acc.timeout).toBe(1);
    expect(acc.error).toBe(1);
    expect(acc.repaired).toBe(1);
    // primary rate: repaired over EVERY attempted unit (timeout/error count
    // as non-repairs, never excluded from the denominator).
    expect(acc.primaryRepairRate).toEqual({ num: 1, den: 4 });
    // ok-only sensitivity figure: never substituted for the primary rate.
    expect(acc.okRepairRate).toEqual({ num: 1, den: 2 });
  });
});

// ── D-11: termination clauses, pinned to the exported constants ─────────

describe("D-11 termination clauses — pinned constants, not inline literals", () => {
  it("isUnderpowered fires exactly at the DUALFIX_CORPUS_MIN_N boundary", () => {
    expect(isUnderpowered(DUALFIX_CORPUS_MIN_N - 1)).toBe(true);
    expect(isUnderpowered(DUALFIX_CORPUS_MIN_N)).toBe(false);
  });

  it("isErrorBudgetExceeded fires per DUALFIX_ERROR_BUDGET_NUM/DUALFIX_ERROR_BUDGET_DEN", () => {
    // exactly at the ratio (errorCount/attempted === NUM/DEN) is NOT exceeded
    expect(isErrorBudgetExceeded(DUALFIX_ERROR_BUDGET_NUM, DUALFIX_ERROR_BUDGET_DEN)).toBe(false);
    // one unit over the ratio IS exceeded
    expect(isErrorBudgetExceeded(DUALFIX_ERROR_BUDGET_NUM + 1, DUALFIX_ERROR_BUDGET_DEN)).toBe(true);
  });
});

// ── WR-03: corpus pinning re-verified on every resume ────────────────────

describe("assertCorpusPinned — corpus drift detection on resume", () => {
  it("no-ops when runConfig is undefined (first run, nothing pinned yet)", () => {
    expect(() => assertCorpusPinned(undefined, 100, 5)).not.toThrow();
  });

  it("no-ops when the freshly-loaded corpus matches the pinned byte length and entry count", () => {
    const runConfig = { corpusByteLength: 100, corpusEntryCount: 5 };
    expect(() => assertCorpusPinned(runConfig, 100, 5)).not.toThrow();
  });

  it("throws when the byte length diverges from what was pinned", () => {
    const runConfig = { corpusByteLength: 100, corpusEntryCount: 5 };
    expect(() => assertCorpusPinned(runConfig, 101, 5)).toThrow(/corpus drift detected/);
  });

  it("throws when the entry count diverges from what was pinned", () => {
    const runConfig = { corpusByteLength: 100, corpusEntryCount: 5 };
    expect(() => assertCorpusPinned(runConfig, 100, 6)).toThrow(/corpus drift detected/);
  });
});

// ── WR-05/WR-06: env var numeric validation ──────────────────────────────

describe("requireFinitePositiveNumber — startup env var validation", () => {
  it("uses the fallback when raw is undefined", () => {
    expect(requireFinitePositiveNumber("X", undefined, 42)).toBe(42);
  });

  it("parses a valid numeric string", () => {
    expect(requireFinitePositiveNumber("X", "17", 42)).toBe(17);
  });

  it("throws a diagnostic naming the variable when raw is non-numeric (would otherwise silently become NaN)", () => {
    expect(() => requireFinitePositiveNumber("DUALFIX_TIMEOUT_MS", "not-a-number", 1000)).toThrow(
      /DUALFIX_TIMEOUT_MS must be a finite positive number, got "not-a-number"/,
    );
  });

  it("throws on zero or negative values", () => {
    expect(() => requireFinitePositiveNumber("X", "0", 1)).toThrow(/finite positive number/);
    expect(() => requireFinitePositiveNumber("X", "-5", 1)).toThrow(/finite positive number/);
  });
});
