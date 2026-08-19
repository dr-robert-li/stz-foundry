/**
 * The paired-round driver's checkpoint contract, resume order, harness-fault
 * retry, ticket-identity, §6 qualification clause order (including
 * multi-breach precedence), and completeness discipline (Phase 14 —
 * Instrument build, Plan 14-06, REQ-69), fully offline against
 * `_paired-study.ts`'s exported pure/stubbed helpers — no provider, no git
 * call, no process spawn, no `main()` invocation.
 *
 * State lives under a fresh `mkdtempSync` directory for every test — no
 * state or log file is ever written under `experiments/paired-comparison-arm/`
 * by this suite, matching `test/paired-w-search.test.ts`'s own convention.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PAIRED_ARM_SLOTS,
  pairingUnitId,
  pairedUnitKey,
  loadState,
  saveState,
  type PairedArmResult,
  type PairedArmSlot,
  type PairedState,
  type CustomerSupportTicket,
} from "../experiments/paired-comparison-arm/_paired-arms.js";
import { accountPairedUnits, evaluatePairedGate, classifyBlock, type PairedAccounting } from "../experiments/paired-comparison-arm/_paired-gate.js";
import { PAIRED_SEEDS, PAIRED_TASKS_PER_SEED, PAIRED_HEALTH_GATE_FLOOR, PAIRED_MIN_DISCORDANT_FLOOR, PAIRED_DROP_BUDGET_CEILING } from "../experiments/paired-comparison-arm/_paired-constants.js";
import {
  buildPairedStudyUnitOrder,
  onceWithHarnessRetry,
  runPairedStudyUnits,
  computeJointScoreableCount,
  evaluatePairedQualification,
  buildAccountingInputs,
  buildReportUnitRecords,
  validatePairedRunConfigArms,
  assertArmCommitsPinned,
} from "../experiments/paired-comparison-arm/_paired-study.js";

const STUDY_MODULE_PATH = join(__dirname, "..", "experiments", "paired-comparison-arm", "_paired-study.ts");

function freshStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "paired-study-driver-test-")), "state.json");
}

function makeResult(arm: PairedArmSlot, unitId: string, overrides: Partial<PairedArmResult> = {}): PairedArmResult {
  return {
    arm,
    unitId,
    status: "ok",
    rawText: "raw",
    oracleCategory: "resolution-match",
    score: 1,
    inputTokens: 1,
    outputTokens: 1,
    wallMs: 1,
    ...overrides,
  };
}

function makeAccounting(overrides: Partial<PairedAccounting> = {}): PairedAccounting {
  return {
    armW: { "no-artifact": 0, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 },
    armB: { "no-artifact": 0, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 },
    winCount: 0,
    lossCount: 0,
    tieCount: 0,
    discordantCount: 0,
    blocks: [],
    ...overrides,
  };
}

// ── the deterministic, total unit order ─────────────────────────────────

describe("buildPairedStudyUnitOrder — §4's total, deterministic order", () => {
  it("produces exactly 120 entries: 6 seeds x 10 tasks x 2 arms", () => {
    expect(buildPairedStudyUnitOrder()).toHaveLength(PAIRED_SEEDS.length * PAIRED_TASKS_PER_SEED * PAIRED_ARM_SLOTS.length);
  });

  it("PAIRED_ARM_SLOTS is [\"W\", \"B\"] — arm slot order within a pairing unit is W then B", () => {
    expect(PAIRED_ARM_SLOTS).toEqual(["W", "B"]);
  });

  it("follows seed block ascending, then task index within seed, then arm slot within pairing unit", () => {
    const order = buildPairedStudyUnitOrder();
    // First 20 entries: seed PAIRED_SEEDS[0], task indices 0..9, W then B each.
    const firstSeed = PAIRED_SEEDS[0]!;
    expect(order[0]).toEqual({ seed: firstSeed, taskIndex: 0, unitId: pairingUnitId(firstSeed, 0), arm: "W", key: pairedUnitKey("W", pairingUnitId(firstSeed, 0)) });
    expect(order[1]).toEqual({ seed: firstSeed, taskIndex: 0, unitId: pairingUnitId(firstSeed, 0), arm: "B", key: pairedUnitKey("B", pairingUnitId(firstSeed, 0)) });
    expect(order[2]!.taskIndex).toBe(1);
    // The block for the second seed starts at index 20 (10 tasks x 2 arms).
    const secondSeed = PAIRED_SEEDS[1]!;
    expect(order[20]).toEqual({ seed: secondSeed, taskIndex: 0, unitId: pairingUnitId(secondSeed, 0), arm: "W", key: pairedUnitKey("W", pairingUnitId(secondSeed, 0)) });
    // Seed order across the whole array matches PAIRED_SEEDS ascending.
    const seedSequence = Array.from(new Set(order.map((u) => u.seed)));
    expect(seedSequence).toEqual([...PAIRED_SEEDS]);
  });
});

// ── harness-fault retry ──────────────────────────────────────────────────

describe("harness-fault retry — distinct from a wrong/unlabelled/empty arm outcome", () => {
  it("a work function yielding status:'error' is retried exactly once; the retry is recorded; the unit keeps exactly one result", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<PairedArmResult> => {
      calls++;
      return calls === 1 ? makeResult("W", "1301:0", { status: "error", failureReason: "boom" }) : makeResult("W", "1301:0", { status: "ok" });
    };
    const key = pairedUnitKey("W", "1301:0");

    const result = await onceWithHarnessRetry(statePath, state, key, work);

    expect(calls).toBe(2);
    expect(state.retries).toHaveLength(1);
    expect(result.status).toBe("ok");
    expect(Object.keys(state.units)).toEqual([key]);
  });

  it("a work function yielding status:'timeout' is never retried", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<PairedArmResult> => {
      calls++;
      return makeResult("W", "1301:0", { status: "timeout" });
    };
    const result = await onceWithHarnessRetry(statePath, state, pairedUnitKey("W", "1301:0"), work);
    expect(calls).toBe(1);
    expect(state.retries).toHaveLength(0);
    expect(result.status).toBe("timeout");
  });

  it("a second failure after the one retry counts as a normal (non-retried-again) outcome", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<PairedArmResult> => {
      calls++;
      return makeResult("W", "1301:0", { status: "error", failureReason: `fail-${calls}` });
    };
    const result = await onceWithHarnessRetry(statePath, state, pairedUnitKey("W", "1301:0"), work);
    // Retried exactly once (2 calls total), never a third attempt even though
    // the retry ALSO failed — the second failure is the final, permanent result.
    expect(calls).toBe(2);
    expect(state.retries).toHaveLength(1);
    expect(result.status).toBe("error");
  });

  it("a wrong-answer (resolution-mismatch) result is never retried — only status:'error' triggers the retry", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    let calls = 0;
    const work = async (): Promise<PairedArmResult> => {
      calls++;
      return makeResult("W", "1301:0", { status: "ok", oracleCategory: "resolution-mismatch", score: 0 });
    };
    await onceWithHarnessRetry(statePath, state, pairedUnitKey("W", "1301:0"), work);
    expect(calls).toBe(1);
    expect(state.retries).toHaveLength(0);
  });
});

// ── runPairedStudyUnits: call order, resume, ticket identity, one proposal ─

describe("runPairedStudyUnits — resume, ticket identity, exactly-one-proposal", () => {
  it("calls runUnit for every one of the 120 units, in unit-order sequence, each exactly once", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const callOrder: string[] = [];
    const runUnit = async (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot): Promise<PairedArmResult> => {
      callOrder.push(pairedUnitKey(arm, unitId));
      return makeResult(arm, unitId);
    };

    await runPairedStudyUnits(statePath, state, runUnit);

    const expectedOrder = buildPairedStudyUnitOrder().map((u) => u.key);
    expect(callOrder).toEqual(expectedOrder);
    expect(Object.keys(state.units)).toEqual(expectedOrder);
  });

  it("a resumed pass never re-runs a completed arm-on-unit result", async () => {
    const statePath = freshStatePath();
    const order = buildPairedStudyUnitOrder();
    const firstUnit = order[0]!;
    const secondUnit = order[1]!;
    const preseeded: PairedState = {
      units: {
        [firstUnit.key]: makeResult(firstUnit.arm, firstUnit.unitId),
        [secondUnit.key]: makeResult(secondUnit.arm, secondUnit.unitId),
      },
      retries: [],
    };
    saveState(statePath, preseeded);
    const state = loadState(statePath);
    const callOrder: string[] = [];
    const runUnit = async (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot): Promise<PairedArmResult> => {
      callOrder.push(pairedUnitKey(arm, unitId));
      return makeResult(arm, unitId);
    };

    await runPairedStudyUnits(statePath, state, runUnit);

    const expectedResumeOrder = order.slice(2).map((u) => u.key);
    expect(callOrder).toEqual(expectedResumeOrder);
    expect(Object.keys(state.units)).toEqual(order.map((u) => u.key));
  });

  it("both arms of the same pairing unit receive byte-identical ticket text", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const ticketTextByKey = new Map<string, string>();
    const runUnit = async (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot): Promise<PairedArmResult> => {
      ticketTextByKey.set(pairedUnitKey(arm, unitId), ticket.ticketText);
      return makeResult(arm, unitId);
    };

    await runPairedStudyUnits(statePath, state, runUnit);

    for (const seed of PAIRED_SEEDS) {
      for (let taskIndex = 0; taskIndex < PAIRED_TASKS_PER_SEED; taskIndex++) {
        const unitId = pairingUnitId(seed, taskIndex);
        const wText = ticketTextByKey.get(pairedUnitKey("W", unitId));
        const bText = ticketTextByKey.get(pairedUnitKey("B", unitId));
        expect(wText).toBeDefined();
        expect(wText).toBe(bText);
      }
    }
  });

  it("each arm makes exactly one proposal per pairing unit absent a harness fault (no second attempt on a merely wrong answer)", async () => {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const callCounts = new Map<string, number>();
    const runUnit = async (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot): Promise<PairedArmResult> => {
      const key = pairedUnitKey(arm, unitId);
      callCounts.set(key, (callCounts.get(key) ?? 0) + 1);
      // A "wrong answer" outcome — status ok, oracle says mismatch — must
      // never trigger a second attempt.
      return makeResult(arm, unitId, { oracleCategory: "resolution-mismatch", score: 0 });
    };

    await runPairedStudyUnits(statePath, state, runUnit);

    expect(callCounts.size).toBe(120);
    for (const count of callCounts.values()) expect(count).toBe(1);
  });
});

// ── §6 qualification — fixed clause order, including multi-breach precedence

describe("evaluatePairedQualification — §6's three clauses, fixed evaluation order", () => {
  it("Clause 1 (health gate): jointScoreableCount below the floor terminates health-gate-failed, regardless of the other clauses", () => {
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25 }), PAIRED_HEALTH_GATE_FLOOR - 1);
    expect(outcome).toBe("TERMINATED-HEALTH-GATE-FAILED");
  });

  it("Clause 1 passes exactly at the floor", () => {
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25 }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).not.toBe("TERMINATED-HEALTH-GATE-FAILED");
  });

  it("Clause 2 (minimum discordant floor): discordantCount below the floor terminates underpowered once Clause 1 passes", () => {
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: PAIRED_MIN_DISCORDANT_FLOOR - 1 }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).toBe("TERMINATED-UNDERPOWERED");
  });

  it("Clause 2 passes exactly at the floor", () => {
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: PAIRED_MIN_DISCORDANT_FLOOR }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).not.toBe("TERMINATED-UNDERPOWERED");
  });

  it("Clause 3 (per-arm drop-budget ceiling): arm W's unscoreable count above the ceiling terminates drop-budget-breached", () => {
    const armW = { "no-artifact": PAIRED_DROP_BUDGET_CEILING + 1, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25, armW }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).toBe("TERMINATED-DROP-BUDGET-BREACHED");
  });

  it("Clause 3: arm B's unscoreable count above the ceiling also terminates drop-budget-breached", () => {
    const armB = { "no-artifact": 0, "non-scoreable": PAIRED_DROP_BUDGET_CEILING + 1, "resolution-mismatch": 0, "resolution-match": 0 };
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25, armB }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).toBe("TERMINATED-DROP-BUDGET-BREACHED");
  });

  it("Clause 3 passes exactly at the ceiling (allowed up to, not below, the ceiling)", () => {
    const armW = { "no-artifact": PAIRED_DROP_BUDGET_CEILING, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25, armW }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).toBe("COMPLETE");
  });

  it("no clause breached: COMPLETE", () => {
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 30 }), 60);
    expect(outcome).toBe("COMPLETE");
  });

  it("multi-breach precedence: Clause 1 wins over a simultaneous Clause 3 breach (fixed order, first breach reported)", () => {
    const armW = { "no-artifact": PAIRED_DROP_BUDGET_CEILING + 5, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: 25, armW }), PAIRED_HEALTH_GATE_FLOOR - 1);
    expect(outcome).toBe("TERMINATED-HEALTH-GATE-FAILED");
  });

  it("multi-breach precedence: Clause 2 wins over a simultaneous Clause 3 breach once Clause 1 passes", () => {
    const armW = { "no-artifact": PAIRED_DROP_BUDGET_CEILING + 5, "non-scoreable": 0, "resolution-mismatch": 0, "resolution-match": 0 };
    const outcome = evaluatePairedQualification(makeAccounting({ discordantCount: PAIRED_MIN_DISCORDANT_FLOOR - 1, armW }), PAIRED_HEALTH_GATE_FLOOR);
    expect(outcome).toBe("TERMINATED-UNDERPOWERED");
  });
});

describe("computeJointScoreableCount — §6 Clause 1's joint (both-arm) condition", () => {
  it("counts only units where BOTH arms land in a scoreable category", () => {
    const units = [
      { seed: PAIRED_SEEDS[0]!, categoryW: "resolution-match" as const, categoryB: "resolution-mismatch" as const }, // joint scoreable
      { seed: PAIRED_SEEDS[0]!, categoryW: "resolution-match" as const, categoryB: "no-artifact" as const }, // not joint (B unscoreable)
      { seed: PAIRED_SEEDS[0]!, categoryW: "non-scoreable" as const, categoryB: "resolution-match" as const }, // not joint (W unscoreable)
      { seed: PAIRED_SEEDS[0]!, categoryW: "resolution-mismatch" as const, categoryB: "resolution-mismatch" as const }, // joint scoreable
    ];
    expect(computeJointScoreableCount(units)).toBe(2);
  });
});

// ── completeness discipline — the verdict may only ever be computed after
// all 120 arm-on-unit results are final ──────────────────────────────────

describe("buildAccountingInputs / buildReportUnitRecords — completeness discipline", () => {
  it("throws when a pairing unit is missing either arm's result", () => {
    const units: Record<string, PairedArmResult> = {
      [pairedUnitKey("W", pairingUnitId(PAIRED_SEEDS[0]!, 0))]: makeResult("W", pairingUnitId(PAIRED_SEEDS[0]!, 0)),
      // B result for the same unit missing.
    };
    expect(() => buildAccountingInputs(units)).toThrow(/missing result/);
    expect(() => buildReportUnitRecords(units)).toThrow(/missing result/);
  });

  it("succeeds and returns 60/120 entries respectively once the full checkpoint map is present", () => {
    const units: Record<string, PairedArmResult> = {};
    for (const seed of PAIRED_SEEDS) {
      for (let taskIndex = 0; taskIndex < PAIRED_TASKS_PER_SEED; taskIndex++) {
        const unitId = pairingUnitId(seed, taskIndex);
        units[pairedUnitKey("W", unitId)] = makeResult("W", unitId, { oracleCategory: "resolution-match", score: 1 });
        units[pairedUnitKey("B", unitId)] = makeResult("B", unitId, { oracleCategory: "resolution-mismatch", score: 0 });
      }
    }
    const inputs = buildAccountingInputs(units);
    expect(inputs).toHaveLength(60);
    const records = buildReportUnitRecords(units);
    expect(records).toHaveLength(120);
    expect(records[0]).toEqual({
      unitId: pairingUnitId(PAIRED_SEEDS[0]!, 0),
      arm: "W",
      status: "ok",
      oracleCategory: "resolution-match",
      score: 1,
    });
  });
});

// ── run-config validation — malformed input throws, never coerced/skipped ──

describe("validatePairedRunConfigArms", () => {
  it("returns arms.W/arms.B on well-formed input", () => {
    const raw = { arms: { W: { commit: "abc", definitionFile: "_w-arm-definition.md" }, B: { commit: "def", definitionFile: "_b-arm-definition.md" } } };
    expect(validatePairedRunConfigArms(raw)).toEqual({
      W: { commit: "abc", definitionFile: "_w-arm-definition.md" },
      B: { commit: "def", definitionFile: "_b-arm-definition.md" },
    });
  });

  it("throws when the top-level value is not an object", () => {
    expect(() => validatePairedRunConfigArms(null)).toThrow(/not an object/);
    expect(() => validatePairedRunConfigArms("nope")).toThrow(/not an object/);
  });

  it("throws when \"arms\" is missing", () => {
    expect(() => validatePairedRunConfigArms({})).toThrow(/missing "arms"/);
  });

  it("throws when arms.W is missing", () => {
    expect(() => validatePairedRunConfigArms({ arms: { B: { commit: "def", definitionFile: "f.md" } } })).toThrow(/arms\.W/);
  });

  it("throws when a commit field is not a non-empty string", () => {
    const raw = { arms: { W: { commit: "", definitionFile: "f.md" }, B: { commit: "def", definitionFile: "f.md" } } };
    expect(() => validatePairedRunConfigArms(raw)).toThrow(/commit/);
  });

  it("throws when a definitionFile field is missing", () => {
    const raw = { arms: { W: { commit: "abc" }, B: { commit: "def", definitionFile: "f.md" } } };
    expect(() => validatePairedRunConfigArms(raw)).toThrow(/definitionFile/);
  });
});

// ── resume guard — arm identities must not drift between a crash and a
// resume (WR-03-style, mirrors `_dualfix-study.ts`'s `assertCorpusPinned`) ─

describe("assertArmCommitsPinned", () => {
  it("no-ops when runConfig is undefined (first run, nothing pinned yet)", () => {
    expect(() => assertArmCommitsPinned(undefined, { W: "abc", B: "def" })).not.toThrow();
  });

  it("no-ops when the freshly-read commits match what was pinned", () => {
    const runConfig = { armCommits: { W: "abc", B: "def" } };
    expect(() => assertArmCommitsPinned(runConfig, { W: "abc", B: "def" })).not.toThrow();
  });

  it("throws when W's commit diverges from what was pinned", () => {
    const runConfig = { armCommits: { W: "abc", B: "def" } };
    expect(() => assertArmCommitsPinned(runConfig, { W: "different", B: "def" })).toThrow(/arm-commit drift detected/);
  });

  it("throws when B's commit diverges from what was pinned", () => {
    const runConfig = { armCommits: { W: "abc", B: "def" } };
    expect(() => assertArmCommitsPinned(runConfig, { W: "abc", B: "different" })).toThrow(/arm-commit drift detected/);
  });
});

// ── one test per terminal state, end to end through the real assembly
// (runPairedStudyUnits -> buildAccountingInputs -> accountPairedUnits ->
// evaluatePairedQualification -> evaluatePairedGate), plus one COMPLETE
// end-to-end pipeline test ───────────────────────────────────────────────

describe("end-to-end assembly — one test per named terminal state, plus COMPLETE", () => {
  async function runScripted(scoreFor: (seed: number, taskIndex: number, arm: PairedArmSlot) => PairedArmResult["oracleCategory"]) {
    const statePath = freshStatePath();
    const state = loadState(statePath);
    const runUnit = async (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot): Promise<PairedArmResult> => {
      const [seedStr, taskIndexStr] = unitId.split(":");
      const category = scoreFor(Number(seedStr), Number(taskIndexStr), arm);
      return makeResult(arm, unitId, { oracleCategory: category, score: category === "resolution-match" ? 1 : 0 });
    };
    await runPairedStudyUnits(statePath, state, runUnit);
    const accountingInputs = buildAccountingInputs(state.units);
    const accounting = accountPairedUnits(accountingInputs);
    const jointScoreableCount = computeJointScoreableCount(accountingInputs);
    const outcome = evaluatePairedQualification(accounting, jointScoreableCount);
    const blocks = accounting.blocks.map((b) => classifyBlock(b.discordantWins, b.discordantLosses));
    const gateVerdict = evaluatePairedGate(outcome, accounting.discordantCount, accounting.winCount, blocks);
    return { accounting, jointScoreableCount, gateVerdict };
  }

  it("TERMINATED-HEALTH-GATE-FAILED: most units unscoreable on at least one arm — no decision populated", async () => {
    // Only the first seed's 10 units are jointly scoreable (10 < 48); the
    // rest are `no-artifact` for both arms.
    const firstSeed = PAIRED_SEEDS[0]!;
    const { gateVerdict, jointScoreableCount } = await runScripted((seed, taskIndex) =>
      seed === firstSeed ? "resolution-match" : "no-artifact",
    );
    expect(jointScoreableCount).toBeLessThan(PAIRED_HEALTH_GATE_FLOOR);
    expect(gateVerdict.outcome).toBe("TERMINATED-HEALTH-GATE-FAILED");
    expect(gateVerdict.decision).toBeUndefined();
  });

  it("TERMINATED-UNDERPOWERED: fully scoreable but almost all concordant (both-match) ties — no decision populated", async () => {
    // Every unit both-arms resolution-match (concordant tie) except the
    // first seed's units, which are WIN (W match, B mismatch) — discordant
    // count = 10 tasks, below the 20 floor. jointScoreableCount = 60 (all
    // scoreable), no drop-budget breach.
    const firstSeed = PAIRED_SEEDS[0]!;
    const { gateVerdict, accounting } = await runScripted((seed, taskIndex, arm) => {
      if (seed === firstSeed) return arm === "W" ? "resolution-match" : "resolution-mismatch";
      return "resolution-match";
    });
    expect(accounting.discordantCount).toBeLessThan(PAIRED_MIN_DISCORDANT_FLOOR);
    expect(gateVerdict.outcome).toBe("TERMINATED-UNDERPOWERED");
    expect(gateVerdict.decision).toBeUndefined();
  });

  it("TERMINATED-DROP-BUDGET-BREACHED: arm W unscoreable on more than the ceiling's worth of units — no decision populated", async () => {
    // Arm W is no-artifact on the first seed's 10 units (> the 6-unit
    // ceiling); everything else scoreable and discordant enough to have
    // cleared Clauses 1/2 were it not for Clause 3.
    const firstSeed = PAIRED_SEEDS[0]!;
    const { gateVerdict, accounting } = await runScripted((seed, taskIndex, arm) => {
      if (arm === "W" && seed === firstSeed) return "no-artifact";
      return arm === "W" ? "resolution-match" : "resolution-mismatch";
    });
    expect(accounting.armW["no-artifact"]).toBeGreaterThan(PAIRED_DROP_BUDGET_CEILING);
    expect(gateVerdict.outcome).toBe("TERMINATED-DROP-BUDGET-BREACHED");
    expect(gateVerdict.decision).toBeUndefined();
  });

  it("COMPLETE with a W-SUPERIOR decision: all clauses clear, pooled and block-concordant", async () => {
    // Every seed: first 5 tasks WIN (W match, B mismatch), last 5 tasks
    // both-match (concordant tie). discordantCount=30, winCount=30,
    // c(30)=21 -> pooled W-SUPERIOR; every seed's own block is W-majority
    // (5 discordant wins, 0 losses) -> 6/6 concordance, pooled stands.
    const { gateVerdict, jointScoreableCount } = await runScripted((seed, taskIndex, arm) => {
      const isWinSlot = taskIndex < 5;
      if (isWinSlot) return arm === "W" ? "resolution-match" : "resolution-mismatch";
      return "resolution-match";
    });
    expect(jointScoreableCount).toBe(60);
    expect(gateVerdict.outcome).toBe("COMPLETE");
    expect(gateVerdict.decision).toBe("W-SUPERIOR");
  });
});

// ── source assertions — mirrors `test/paired-w-search.test.ts`'s own
// convention: reuse by import only, no acceptance-requiring/receipt route,
// and no concurrency knob anywhere in the file ───────────────────────────

describe("source assertions", () => {
  const src = readFileSync(STUDY_MODULE_PATH, "utf8");
  const commentStripped = src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

  it("never imports/references an acceptance-requiring or receipt-constructing route, or a prior study's own driver module (comment-stripped)", () => {
    expect(commentStripped).not.toMatch(/acceptedGeneratorReceipt|requireGeneratorRooted|makeBattery|makeSplitBattery|admitVerticalBattery|battery-types|_dualfix/);
  });

  it("has no concurrency knob anywhere in the file", () => {
    expect(src).not.toMatch(/concurren|parallel|Promise\.all/i);
  });

  it("imports the generator/oracle-scoring arm-run function, the checkpoint core, and both arm slots from _paired-arms.js", () => {
    expect(src).toMatch(/from\s*"\.\/_paired-arms\.js"/);
    expect(src).toMatch(/\brunArmOnPairingUnit\b/);
    expect(src).toMatch(/\bloadState\b/);
    expect(src).toMatch(/\bsaveState\b/);
    expect(src).toMatch(/\bonce\b/);
  });

  it("imports the accounting function, block classifier, and gate from _paired-gate.js", () => {
    expect(src).toMatch(/from\s*"\.\/_paired-gate\.js"/);
    expect(src).toMatch(/\baccountPairedUnits\b/);
    expect(src).toMatch(/\bclassifyBlock\b/);
    expect(src).toMatch(/\bevaluatePairedGate\b/);
  });
});
