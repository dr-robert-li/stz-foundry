/**
 * The full six-trap exogeneity guard + battery vacuity guards (Phase 1 —
 * Agentic eval seam, Plan 01-02). Every throwing assertion checks the thrown
 * message's CONTENT, never bare `.toThrow()`, so a mutation that relocates
 * which branch throws cannot pass by accident (RESEARCH Pitfall 2, CONTEXT D6).
 */
import { describe, it, expect } from "vitest";
import {
  makeBattery,
  resolveRootKind,
  validateReceipt,
  type BatteryTask,
  type OracleReceipt,
} from "../src/foundry/battery-types.js";

function check(overrides: Partial<BatteryTask["checks"][number]> = {}) {
  return {
    checkId: "c1",
    kind: "output-assertion" as const,
    expect: "ok",
    description: "d",
    ...overrides,
  };
}

function task(overrides: Partial<BatteryTask> = {}): BatteryTask {
  return {
    id: "t1",
    prompt: "do the thing",
    checks: [check()],
    ...overrides,
  };
}

function receipt(overrides: Partial<OracleReceipt> = {}): OracleReceipt {
  return {
    kind: "execution",
    acceptedBy: "Dr. Robert Li",
    lineage: [],
    ...overrides,
  };
}

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

describe("resolveRootKind (in isolation, before any test drives it through makeBattery)", () => {
  it("trap 1 — anchored-judge with empty lineage: root is the receipt's own kind, no opinion", () => {
    expect(resolveRootKind(receipt({ kind: "anchored-judge", lineage: [] }))).toBe(
      "anchored-judge",
    );
  });

  it("trap 2 — anchored-judge downstream of an exogenous root: root is the lineage root, not the receipt's kind", () => {
    expect(
      resolveRootKind(receipt({ kind: "anchored-judge", lineage: ["execution:run-042"] })),
    ).toBe("execution");
  });

  it("trap 3 — empty lineage with an exogenous kind: root is the receipt's own kind", () => {
    expect(resolveRootKind(receipt({ kind: "execution", lineage: [] }))).toBe("execution");
    expect(resolveRootKind(receipt({ kind: "replay", lineage: [] }))).toBe("replay");
    expect(resolveRootKind(receipt({ kind: "constructed", lineage: [] }))).toBe("constructed");
  });

  it("trap 3b — execution leaf with an anchored-judge-rooted lineage: the lineage root wins over the receipt's own kind", () => {
    expect(
      resolveRootKind(receipt({ kind: "execution", lineage: ["anchored-judge:j1"] })),
    ).toBe("anchored-judge");
  });

  it("trap 5 — a lineage root entry with no <kind>: prefix throws, naming the entry", () => {
    const e = thrown(() => resolveRootKind(receipt({ lineage: ["run-042"] })));
    expect(e.message).toContain("run-042");
  });

  it("trap 5 — a lineage root entry whose prefix is not an OracleKind throws, naming the entry", () => {
    const e = thrown(() => resolveRootKind(receipt({ lineage: ["bogus:x"] })));
    expect(e.message).toContain("bogus:x");
  });

  it("trap 5 — an entry with an empty prefix throws", () => {
    const e = thrown(() => resolveRootKind(receipt({ lineage: [":x"] })));
    expect(e.message).toContain(":x");
  });

  it("trap 5 — an entry with an empty id throws", () => {
    const e = thrown(() => resolveRootKind(receipt({ lineage: ["execution:"] })));
    expect(e.message).toContain("execution:");
  });
});

describe("makeBattery — exogeneity gate (the six named traps)", () => {
  it("trap 1 — anchored-judge as sole root throws, naming anchored-judge and exogenous", () => {
    const e = thrown(() =>
      makeBattery({ id: "b1", tasks: [task()], receipt: receipt({ kind: "anchored-judge", lineage: [] }) }),
    );
    expect(e.message).toContain("anchored-judge");
    expect(e.message).toContain("exogenous");
  });

  it("trap 2 — anchored-judge downstream of an exogenous root is ACCEPTED (the legal amortizer case)", () => {
    const battery = makeBattery({
      id: "b2",
      tasks: [task()],
      receipt: receipt({ kind: "anchored-judge", lineage: ["execution:run-042"] }),
    });
    expect(battery.receipt.kind).toBe("anchored-judge");
  });

  it("trap 3 — empty lineage with kind execution is accepted (the receipt's own kind is the root)", () => {
    const battery = makeBattery({ id: "b3", tasks: [task()], receipt: receipt({ kind: "execution", lineage: [] }) });
    expect(battery.receipt.kind).toBe("execution");
  });

  it("trap 3 — empty lineage with kind replay is accepted", () => {
    const battery = makeBattery({ id: "b3b", tasks: [task()], receipt: receipt({ kind: "replay", lineage: [] }) });
    expect(battery.receipt.kind).toBe("replay");
  });

  it("trap 3 — empty lineage with kind constructed is accepted", () => {
    const battery = makeBattery({
      id: "b3c",
      tasks: [task()],
      receipt: receipt({ kind: "constructed", lineage: [] }),
    });
    expect(battery.receipt.kind).toBe("constructed");
  });

  it("trap 3b — an execution-kind leaf rooted in an anchored-judge lineage throws — the leaf kind cannot launder the root", () => {
    const e = thrown(() =>
      makeBattery({
        id: "b4",
        tasks: [task()],
        receipt: receipt({ kind: "execution", lineage: ["anchored-judge:j1"] }),
      }),
    );
    expect(e.message).toContain("anchored-judge");
    expect(e.message).toContain("exogenous");
  });

  it("trap 4 — a lineage entry that references the battery's own id throws (self-reference)", () => {
    const e = thrown(() =>
      makeBattery({
        id: "b5",
        tasks: [task()],
        receipt: receipt({ kind: "execution", lineage: ["execution:pre", "constructed:b5"] }),
      }),
    );
    expect(e.message).toContain("b5");
    expect(e.message).toContain("self-referential");
  });

  it("trap 4 — a lineage with a duplicate entry throws", () => {
    const e = thrown(() =>
      makeBattery({
        id: "b6",
        tasks: [task()],
        receipt: receipt({
          kind: "execution",
          lineage: ["execution:run-042", "execution:run-042"],
        }),
      }),
    );
    expect(e.message).toContain("run-042");
    expect(e.message).toContain("duplicate");
  });

  it("trap 5 — an unresolvable root entry with no <kind>: prefix throws, naming the entry", () => {
    const e = thrown(() =>
      makeBattery({ id: "b7", tasks: [task()], receipt: receipt({ lineage: ["run-042"] }) }),
    );
    expect(e.message).toContain("run-042");
  });

  it("trap 5 — an unresolvable root entry whose prefix is not an OracleKind throws, naming the entry", () => {
    const e = thrown(() =>
      makeBattery({ id: "b8", tasks: [task()], receipt: receipt({ lineage: ["bogus:x"] }) }),
    );
    expect(e.message).toContain("bogus:x");
  });

  it("trap 6 — a zero-task battery throws", () => {
    const e = thrown(() => makeBattery({ id: "b9", tasks: [], receipt: receipt() }));
    expect(e.message).toContain("b9");
    expect(e.message).toContain("zero tasks");
  });

  it("trap 6 — a task with zero checks throws", () => {
    const e = thrown(() =>
      makeBattery({ id: "b10", tasks: [task({ checks: [] })], receipt: receipt() }),
    );
    expect(e.message).toContain("t1");
    expect(e.message).toContain("zero checks");
  });

  it("trap 6 — two tasks sharing an id throws", () => {
    const e = thrown(() =>
      makeBattery({
        id: "b11",
        tasks: [task({ id: "dup" }), task({ id: "dup" })],
        receipt: receipt(),
      }),
    );
    expect(e.message).toContain("dup");
    expect(e.message).toContain("duplicate task id");
  });

  it("trap 6 — two checks within one task sharing a checkId throws", () => {
    const e = thrown(() =>
      makeBattery({
        id: "b12",
        tasks: [task({ checks: [check({ checkId: "dup" }), check({ checkId: "dup" })] })],
        receipt: receipt(),
      }),
    );
    expect(e.message).toContain("dup");
    expect(e.message).toContain("duplicate checkId");
  });
});

describe("makeBattery — the human gate (acceptedBy)", () => {
  it("an empty acceptedBy throws", () => {
    const e = thrown(() =>
      makeBattery({ id: "b13", tasks: [task()], receipt: receipt({ acceptedBy: "" }) }),
    );
    expect(e.message).toContain("acceptedBy");
  });

  it("a whitespace-only acceptedBy throws", () => {
    const e = thrown(() =>
      makeBattery({ id: "b14", tasks: [task()], receipt: receipt({ acceptedBy: "   " }) }),
    );
    expect(e.message).toContain("acceptedBy");
  });

  it("an agent-role acceptedBy (specimen) throws naming the agent-role violation", () => {
    const e = thrown(() =>
      makeBattery({ id: "b15", tasks: [task()], receipt: receipt({ acceptedBy: "specimen" }) }),
    );
    expect(e.message).toContain("specimen");
    expect(e.message).toContain("agent role");
  });

  it("an agent-role acceptedBy (Judge, case-insensitive) throws naming the agent-role violation", () => {
    const e = thrown(() =>
      makeBattery({ id: "b16", tasks: [task()], receipt: receipt({ acceptedBy: "Judge" }) }),
    );
    expect(e.message).toContain("Judge");
    expect(e.message).toContain("agent role");
  });

  it("a real human identity is accepted", () => {
    const battery = makeBattery({
      id: "b17",
      tasks: [task()],
      receipt: receipt({ acceptedBy: "Dr. Robert Li" }),
    });
    expect(battery.receipt.acceptedBy).toBe("Dr. Robert Li");
  });
});

describe("makeBattery — battery-id and defensive-copy guards", () => {
  it("an empty battery id throws", () => {
    const e = thrown(() => makeBattery({ id: "  ", tasks: [task()], receipt: receipt() }));
    expect(e.message).toContain("id");
  });

  it("an empty task id throws", () => {
    const e = thrown(() =>
      makeBattery({ id: "b18", tasks: [task({ id: "  " })], receipt: receipt() }),
    );
    expect(e.message).toContain("empty");
  });

  it("an empty task prompt throws", () => {
    const e = thrown(() =>
      makeBattery({ id: "b19", tasks: [task({ prompt: "  " })], receipt: receipt() }),
    );
    expect(e.message).toContain("empty prompt");
  });

  it("returns a frozen battery — mutating it throws (ESM modules are always strict)", () => {
    const battery = makeBattery({ id: "b20", tasks: [task()], receipt: receipt() });
    expect(() => {
      (battery as { id: string }).id = "mutated";
    }).toThrow();
  });

  it("mutating the draft after construction does not affect the returned battery (defensive copy)", () => {
    const draftReceipt = receipt();
    const draftTasks = [task()];
    const battery = makeBattery({ id: "b21", tasks: draftTasks, receipt: draftReceipt });
    draftReceipt.lineage.push("execution:late");
    draftTasks[0]!.checks.push(check({ checkId: "late" }));
    expect(battery.receipt.lineage).toEqual([]);
    expect(battery.tasks[0]!.checks).toHaveLength(1);
  });
});

describe("validateReceipt — exported directly, exercised without going through makeBattery", () => {
  it("accepts a valid execution-rooted receipt with no throw", () => {
    expect(() => validateReceipt(receipt(), "b22")).not.toThrow();
  });

  it("rejects an anchored-judge-rooted receipt", () => {
    const e = thrown(() => validateReceipt(receipt({ kind: "anchored-judge", lineage: [] }), "b23"));
    expect(e.message).toContain("anchored-judge");
  });
});

describe("the AgentBattery brand — makeBattery is the ONLY way to get one", () => {
  it("a hand-built battery-shaped literal does not satisfy AgentBattery (type-level proof)", async () => {
    // The runtime half of this guard is proven in foundry-agent-runner.test.ts
    // ("runAgentBattery rejects an unvalidated battery"). This half proves the
    // TYPE half: the same literal, cast to the parameter type, is a compile
    // error without the cast — so a TypeScript caller cannot forge one at all.
    //
    // Kept as a source assertion rather than a type-test dependency (N: zero
    // runtime deps, and the repo has no tsd/expect-type). The brand's presence
    // in the interface is what makes the cast necessary; if the brand is
    // deleted, this assertion fails and names why.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/foundry/battery-types.ts", import.meta.url), "utf8"),
    );
    expect(src).toContain("declare const VALIDATED_BATTERY: unique symbol");
    expect(src).toContain("readonly [VALIDATED_BATTERY]: true");
  });

  it("makeBattery's return is assignable to AgentBattery (the brand is minted, not merely declared)", () => {
    const battery = makeBattery({ id: "b24", tasks: [task()], receipt: receipt() });
    // If the brand were declared on the interface but never minted by the
    // factory, this assignment would not typecheck and `npm run typecheck`
    // would fail — the test is the assignment itself.
    const asBattery: import("../src/foundry/battery-types.js").AgentBattery = battery;
    expect(asBattery.id).toBe("b24");
  });
});
