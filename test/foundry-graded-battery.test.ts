/**
 * Partial-credit scoring + the v2 data-ops battery (the phase-3 battery
 * revision driven by `experiments/dataops-agent-pilot/PILOT-RESULTS.md`).
 *
 * The property under test is narrow and load-bearing: grading must produce a
 * CONTINUOUS selection signal without changing any v1 battery's fitness and
 * without weakening any gate. Every test below is offline — a stub `Provider`,
 * no daemon, no network.
 */
import { describe, it, expect } from "vitest";
import { runAgentBattery } from "../src/foundry/agent-runner.js";
import { makeBattery, BatteryShapeError, type GradedSpec } from "../src/foundry/battery-types.js";
import { gradeCheck, gradeTask } from "../src/foundry/grade.js";
import {
  ACCEPTED_GENERATORS,
  DATA_OPS_GENERATOR_ID,
  DATA_OPS_GENERATOR_V2_ID,
  REVENUE_ZERO_AT,
  acceptedGeneratorReceipt,
  buildTasks,
  buildTasksV2,
  generateFixtureBatteryV2,
  generateWarehouse,
} from "../src/foundry/fixture-warehouse.js";
import type { CheckResult } from "../src/contract/predicate-eval.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const result = (over: Partial<CheckResult>): CheckResult => ({
  checkId: "c",
  pass: false,
  expected: "1000",
  actual: "1000",
  description: "d",
  ...over,
});

const spec = (over: Partial<GradedSpec> = {}): GradedSpec => ({
  checkId: "c",
  kind: "relative-error",
  zeroAt: 0.1,
  ...over,
});

/** Replies with a fixed answer.json body, so a task's score is a pure
 *  function of the numbers below. */
class FixedAnswerProvider implements Provider {
  readonly kind = "openai" as const;
  readonly baseUrl = "http://stub";
  constructor(private readonly body: string) {}
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    return {
      model: "stub",
      text: "```path=answer.json\n" + this.body + "\n```",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  }
}

describe("gradeCheck — partial credit is credit for being CLOSE, never for being absent", () => {
  it("an exactly-passing check scores 1 whatever its grading says", () => {
    expect(gradeCheck(result({ pass: true, expected: "500", actual: "500" }), spec())).toBe(1);
    // Grading can only ever soften a failure — never demote a pass.
    expect(gradeCheck(result({ pass: true }), spec({ zeroAt: 0.0001 }))).toBe(1);
  });

  it("a failing check with NO grading spec scores 0 — v1 behaviour, unchanged", () => {
    expect(gradeCheck(result({ pass: false, expected: "1000", actual: "1001" }), undefined)).toBe(0);
  });

  it("credit decays linearly with relative error and hits 0 at zeroAt", () => {
    // 1% out against a 10% tolerance => 90% credit.
    expect(gradeCheck(result({ expected: "1000", actual: "1010" }), spec())).toBeCloseTo(0.9, 10);
    // 5% out => 50% credit.
    expect(gradeCheck(result({ expected: "1000", actual: "950" }), spec())).toBeCloseTo(0.5, 10);
    // Exactly at the tolerance => 0.
    expect(gradeCheck(result({ expected: "1000", actual: "1100" }), spec())).toBeCloseTo(0, 10);
  });

  it("never returns a negative score, however wild the miss", () => {
    // The granite floor was ~87% out; it must score 0, not -8.
    expect(gradeCheck(result({ expected: "744035", actual: "1394844" }), spec())).toBe(0);
  });

  it("a missing or non-numeric observation scores 0 — absence is not a near miss", () => {
    expect(gradeCheck(result({ actual: "<no-observation>", expected: "1000" }), spec())).toBe(0);
    expect(gradeCheck(result({ actual: '"fifteen"', expected: "1000" }), spec())).toBe(0);
    // `Number("")` is 0 in JS; an empty observation must not read as a
    // near-miss of a small expectation.
    expect(gradeCheck(result({ actual: "", expected: "1" }), spec())).toBe(0);
  });

  it("an expectation of 0 does not divide by zero", () => {
    const score = gradeCheck(result({ expected: "0", actual: "0.05" }), spec());
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("gradeTask — ungraded tasks keep binary fitness exactly", () => {
  it("with no grading, a task scores 1 only when every check passes", () => {
    expect(gradeTask([result({ pass: true }), result({ checkId: "c2", pass: true })], undefined)).toBe(1);
    expect(gradeTask([result({ pass: true }), result({ checkId: "c2", pass: false })], undefined)).toBe(0);
    expect(gradeTask([result({ pass: true })], [])).toBe(1);
  });

  it("with grading, a task scores the mean of its per-check credit", () => {
    const checks = [
      result({ checkId: "exact", pass: true }),
      result({ checkId: "c", pass: false, expected: "1000", actual: "1050" }),
    ];
    // 1 (exact) and 0.5 (5% out of a 10% tolerance) => 0.75.
    expect(gradeTask(checks, [spec()])).toBeCloseTo(0.75, 10);
  });

  it("scores 0 for an empty check list rather than dividing by zero", () => {
    expect(gradeTask([], [spec()])).toBe(0);
  });
});

describe("makeBattery — grading shape guards", () => {
  const base = {
    id: "b",
    receipt: { kind: "execution" as const, acceptedBy: "Dr. Robert Li", lineage: [] },
  };
  const task = (grading: GradedSpec[]) => ({
    id: "t",
    prompt: "p",
    checks: [{ checkId: "real", kind: "output-assertion" as const, expect: "1", description: "d" }],
    grading,
  });

  it("refuses a grading spec naming a check that does not exist", () => {
    // Without this, the task looks graded and silently scores binary.
    expect(() => makeBattery({ ...base, tasks: [task([spec({ checkId: "ghost" })])] })).toThrow(
      BatteryShapeError,
    );
    expect(() => makeBattery({ ...base, tasks: [task([spec({ checkId: "ghost" })])] })).toThrow(/ghost/);
  });

  it("refuses a non-positive or non-finite zeroAt, which would hand out Infinity as fitness", () => {
    for (const zeroAt of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => makeBattery({ ...base, tasks: [task([spec({ checkId: "real", zeroAt })])] })).toThrow(
        BatteryShapeError,
      );
    }
  });

  it("refuses two grading specs for one check", () => {
    expect(() =>
      makeBattery({ ...base, tasks: [task([spec({ checkId: "real" }), spec({ checkId: "real" })])] }),
    ).toThrow(/duplicate grading/);
  });

  it("leaves an ungraded task's `grading` ABSENT, never an empty array", () => {
    const built = makeBattery({
      ...base,
      tasks: [{ id: "t", prompt: "p", checks: task([]).checks }],
    });
    expect("grading" in built.tasks[0]!).toBe(false);
  });
});

describe("runAgentBattery — partial credit reaches the selection signal", () => {
  const gradedBattery = (expectCents: number) =>
    makeBattery({
      id: "graded-battery",
      tasks: [
        {
          id: "t1",
          prompt: "recover the total",
          checks: [
            {
              checkId: "rev",
              kind: "json-invariant",
              input: "answer.json#total",
              expect: JSON.stringify(expectCents),
              description: "total matches",
            },
          ],
          grading: [{ checkId: "rev", kind: "relative-error", zeroAt: 0.1 }],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

  it("a near-miss scores strictly between 0 and 1 — the gradient exact equality destroys", async () => {
    // 2% low against a 10% tolerance => 0.8.
    const run = await runAgentBattery(
      { id: "a" as never, systemPrompt: "s" },
      gradedBattery(1000),
      { providerImpl: new FixedAnswerProvider('{"total": 980}') },
    );
    expect(run.tasks[0]!.pass).toBe(false);
    expect(run.result.testPassRate).toBeCloseTo(0.8, 10);
    // The exact gate is untouched by partial credit.
    expect(run.result.passedGate).toBe(false);
  });

  it("a near-miss and a wild miss are no longer indistinguishable", async () => {
    const near = await runAgentBattery({ id: "a" as never, systemPrompt: "s" }, gradedBattery(1000), {
      providerImpl: new FixedAnswerProvider('{"total": 990}'),
    });
    const wild = await runAgentBattery({ id: "a" as never, systemPrompt: "s" }, gradedBattery(1000), {
      providerImpl: new FixedAnswerProvider('{"total": 400}'),
    });
    // This is the whole point of the revision: under v1 scoring both were 0.
    expect(near.result.testPassRate).toBeGreaterThan(wild.result.testPassRate);
    expect(wild.result.testPassRate).toBe(0);
  });

  it("an exact answer still scores 1 and still passes the gate", async () => {
    const run = await runAgentBattery({ id: "a" as never, systemPrompt: "s" }, gradedBattery(1000), {
      providerImpl: new FixedAnswerProvider('{"total": 1000}'),
    });
    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
  });

  it("an UNGRADED battery's testPassRate is unchanged — v1 fitness is byte-identical", async () => {
    const ungraded = makeBattery({
      id: "ungraded-battery",
      tasks: [
        {
          id: "t1",
          prompt: "p",
          checks: [
            {
              checkId: "rev",
              kind: "json-invariant",
              input: "answer.json#total",
              expect: "1000",
              description: "total matches",
            },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });
    // 1% out. Graded this would be 0.9; ungraded it must be exactly 0.
    const run = await runAgentBattery({ id: "a" as never, systemPrompt: "s" }, ungraded, {
      providerImpl: new FixedAnswerProvider('{"total": 1010}'),
    });
    expect(run.result.testPassRate).toBe(0);
    expect(run.tasks[0]!.score).toBe(0);
  });
});

describe("the v2 battery — less prescriptive prompt, graded revenue", () => {
  const warehouse = generateWarehouse(7);

  it("the v2 prompt no longer hands the candidate the methodology", () => {
    const [v2] = buildTasksV2(warehouse);
    const [v1] = buildTasks(warehouse);
    // v1 spells out every transformation; that is what left a searched system
    // prompt no headroom (PILOT-RESULTS.md).
    //
    // These are PROSE giveaways only. Column names like `amountBackup` are
    // deliberately NOT asserted absent: they appear in the CSV header, which
    // the candidate must see. Discovering what that column means is the
    // competence being measured — hiding it would break the task, not sharpen it.
    for (const giveaway of ["deduplicated", "normalize", "month name", "bare cents"]) {
      expect(v1!.prompt).toContain(giveaway);
      expect(v2!.prompt).not.toContain(giveaway);
    }
  });

  it("the v2 prompt still specifies the artifact contract verbatim", () => {
    // The fence is a PARSING contract with observeCheck, not a task hint —
    // dropping it would measure formatting, not data-ops competence.
    const [v2] = buildTasksV2(warehouse);
    expect(v2!.prompt).toContain("```path=answer.json");
    expect(v2!.prompt).toContain("orderCount");
    expect(v2!.prompt).toContain("revenueCents");
  });

  it("v2 grades revenueCents and leaves orderCount exact", () => {
    for (const task of buildTasksV2(warehouse)) {
      expect(task.grading).toHaveLength(1);
      expect(task.grading![0]!.checkId).toBe(`${task.id}-revenue-cents`);
      expect(task.grading![0]!.zeroAt).toBe(REVENUE_ZERO_AT);
    }
  });

  it("v1 tasks stay ungraded — the accepted v1 generator's behaviour is untouched", () => {
    for (const task of buildTasks(warehouse)) {
      expect(task.grading).toBeUndefined();
    }
  });

  it("v2 is a SEPARATE generator id, separately accepted — v1's acceptance is untouched", () => {
    // Revising prompt+scoring under the v1 id would have silently redefined
    // what the v1 acceptance covered. Two ids, two entries.
    expect(DATA_OPS_GENERATOR_V2_ID).not.toBe(DATA_OPS_GENERATOR_ID);
    expect(ACCEPTED_GENERATORS.get(DATA_OPS_GENERATOR_ID)).toBe("Dr. Robert Li");
    expect(ACCEPTED_GENERATORS.get(DATA_OPS_GENERATOR_V2_ID)).toBe("Dr. Robert Li");
  });

  it("an UNACCEPTED generator id is still refused — the checkpoint is real, not spent", () => {
    // v2 is accepted now, so the refusal is proven with an id that is not in
    // the table. Without this the guard would be untested the moment its one
    // subject was accepted.
    expect(() => acceptedGeneratorReceipt("data-ops-fixture-warehouse-generator-v3")).toThrow(
      /is not in ACCEPTED_GENERATORS/,
    );
  });

  it("a v2 battery now constructs through the real admission path", () => {
    const battery = generateFixtureBatteryV2(7, "data-ops-v2-7");
    expect(battery.tasks).toHaveLength(6);
    expect(battery.receipt.acceptedBy).toBe("Dr. Robert Li");
    // NOT reference-identical: makeBattery defensively copies+freezes the
    // receipt, so a validated battery cannot be mutated into an invalid one
    // after the gate. The reference-identity check (requireGeneratorRooted's
    // Object.is step) runs on the DRAFT, upstream of that copy — so what the
    // battery carries is the accepted generator's lineage, verified there.
    expect(battery.receipt.lineage).toEqual([`constructed:${DATA_OPS_GENERATOR_V2_ID}`]);
    expect(acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V2_ID).lineage).toEqual(
      battery.receipt.lineage,
    );
    // The grading survives makeBattery's freeze, which is what makes the
    // partial credit actually reach a real run.
    expect(battery.tasks[0]!.grading).toHaveLength(1);
  });
});
