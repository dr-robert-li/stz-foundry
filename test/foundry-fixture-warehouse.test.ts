/**
 * The phase tracer (Phase 1 — Data-ops pilot battery, Plan 01-01): one seed
 * travels facts -> messy source data -> the vertical-admission gate ->
 * `makeBattery`'s generator-rooted receipt guard -> `runAgentBattery` -> a
 * score, offline. The "end to end" test below is a POSITIVE CONTROL: it
 * proves the checks are SATISFIABLE by a candidate that computes the answer
 * from the warehouse's own precomputed facts, never from the prompt — it
 * does NOT prove a real LLM agent can solve the task. Non-triviality
 * controls (a null/echo candidate scoring below 1) are Plan 01-03's job.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath, relative } from "node:path";
import {
  generateWarehouse,
  buildTasks,
  generateFixtureBattery,
  generateFixtureSplitBattery,
  derivePromotionSeed,
  acceptedGeneratorReceipt,
  DATA_OPS_GENERATOR_ID,
  rootGeneratorId,
  requireGeneratorRooted,
  type FixtureWarehouse,
} from "../src/foundry/fixture-warehouse.js";
import {
  admitVertical,
  requireAdmitted,
  admitVerticalBattery,
  VerticalRefusedError,
} from "../src/foundry/vertical-admission.js";
import type { OracleReceipt } from "../src/foundry/battery-types.js";
import { runAgentBattery, type CandidateAgent } from "../src/foundry/agent-runner.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** House rule (test/foundry-battery-types.test.ts:44-51): assert the thrown
 *  message's CONTENT, never bare `.toThrow()` — a mutation that relocates
 *  which branch throws must not pass by accident. */
function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

function fakeWarehouseTotals(warehouse: FixtureWarehouse): Record<string, { orderCount: number; revenueCents: number }> {
  const totals: Record<string, { orderCount: number; revenueCents: number }> = {};
  for (const fact of warehouse.facts) {
    totals[`${fact.customerId}__${fact.month}`] = {
      orderCount: fact.orderCount,
      revenueCents: fact.revenueCents,
    };
  }
  return totals;
}

/** The offline `Provider` double idiom (test/foundry-component-tournament.test.ts:28-57):
 *  computes the correct answer FROM `warehouse.facts` — never from the task
 *  prompt — so this is a satisfiability proof, not an agent capability claim. */
function factDerivedProvider(warehouse: FixtureWarehouse): Provider {
  return {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      const totals = fakeWarehouseTotals(warehouse);
      return {
        text: "```path=answer.json\n" + JSON.stringify({ totals }) + "\n```",
        model: "fact-derived-double",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
      };
    },
  };
}

describe("fixture-warehouse — REQ-24 compile-time signature guarantees", () => {
  it("generateWarehouse takes only a seed — no Provider/CandidateAgent param can be added silently", () => {
    expect(generateWarehouse.length).toBe(1);
  });

  it("generateFixtureBattery takes only (seed, batteryId) — no Provider param can be added silently", () => {
    expect(generateFixtureBattery.length).toBe(2);
  });

  it("generateFixtureSplitBattery takes only a seed — no Provider param can be added silently", () => {
    expect(generateFixtureSplitBattery.length).toBe(1);
  });
});

describe("vertical-admission — arity guarantees (no override/judge parameter)", () => {
  it("admitVertical takes only the vertical name", () => {
    expect(admitVertical.length).toBe(1);
  });

  it("requireAdmitted takes only the vertical name", () => {
    expect(requireAdmitted.length).toBe(1);
  });
});

describe("fixture-warehouse — D3/N6 determinism", () => {
  it("the same seed reproduces the warehouse (facts, rows, csv) exactly", () => {
    const a = generateWarehouse(20260729);
    const b = generateWarehouse(20260729);
    expect(a).toEqual(b);
  });

  it("the same seed reproduces the emitted task prompts and check expects exactly", () => {
    const tasksA = buildTasks(generateWarehouse(20260729));
    const tasksB = buildTasks(generateWarehouse(20260729));
    expect(tasksA.map((t) => t.prompt)).toEqual(tasksB.map((t) => t.prompt));
    expect(tasksA.map((t) => t.checks.map((c) => c.expect))).toEqual(
      tasksB.map((t) => t.checks.map((c) => c.expect)),
    );
  });

  it("different seeds produce different facts/rows/csv — catches a generator that ignores its seed", () => {
    const a = generateWarehouse(1);
    const b = generateWarehouse(2);
    expect(a).not.toEqual(b);
    expect(a.facts).not.toEqual(b.facts);
    // Assertion on FACT VALUES and csv specifically, not merely on a
    // top-level id — a generator that reads seed on a dead code path (Plan
    // 01-01 tracer's Pitfall 2(b)) would still pass the coarser checks above.
    expect(a.facts.map((f) => f.revenueCents)).not.toEqual(b.facts.map((f) => f.revenueCents));
    expect(a.csv).not.toEqual(b.csv);
  });

  it("row ordering is stable across calls for a given seed — no iteration-order or wall-clock dependence", () => {
    const a = generateWarehouse(555);
    const b = generateWarehouse(555);
    expect(a.rows.map((r) => r.orderId)).toEqual(b.rows.map((r) => r.orderId));
  });
});

describe("fixture-warehouse — magnitude discipline (T-01-03, Pitfall 1)", () => {
  it("every fact's revenueCents is >=6 digits, and no single csv field exceeds 5 digits, for several seeds", () => {
    for (const seed of [1, 2, 3, 42, 9999]) {
      const warehouse = generateWarehouse(seed);
      for (const fact of warehouse.facts) {
        expect(String(fact.revenueCents).length).toBeGreaterThanOrEqual(6);
      }
      for (const row of warehouse.rows) {
        for (const field of [row.orderId, row.rawDate, row.rawAmount, row.amountBackup]) {
          for (const digitRun of field.match(/\d+/g) ?? []) {
            expect(digitRun.length).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });
});

describe("fixture-warehouse — the answer key does not leak into the csv (T-01-03)", () => {
  it("no fact's revenueCents appears verbatim in the generated csv, for several seeds", () => {
    for (const seed of [1, 2, 3, 42, 9999]) {
      const warehouse = generateWarehouse(seed);
      for (const fact of warehouse.facts) {
        const re = new RegExp(`(?<!\\d)${fact.revenueCents}(?!\\d)`);
        expect(re.test(warehouse.csv)).toBe(false);
      }
    }
  });
});

describe("fixture-warehouse — two independently-seeded halves (REQ-24, RESEARCH Open Question 2)", () => {
  it("derivePromotionSeed is stable across calls and differs from the input seed", () => {
    const a = derivePromotionSeed(7);
    const b = derivePromotionSeed(7);
    expect(a).toBe(b);
    expect(a).not.toBe(7);
  });

  it("generateFixtureSplitBattery(7) yields halves with distinct ids, disjoint task-id sets, and non-deep-equal facts", () => {
    const split = generateFixtureSplitBattery(7);
    expect(split.search.id).not.toBe(split.promotion.id);

    const searchTaskIds = new Set(split.search.tasks.map((t) => t.id));
    for (const task of split.promotion.tasks) {
      expect(searchTaskIds.has(task.id)).toBe(false);
    }

    const searchWarehouse = generateWarehouse(7);
    const promotionWarehouse = generateWarehouse(derivePromotionSeed(7));
    expect(searchWarehouse.facts).not.toEqual(promotionWarehouse.facts);
  });

  it("both halves carry the SAME pre-makeBattery accepted-generator receipt object", () => {
    const receiptBefore = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const split = generateFixtureSplitBattery(7);
    expect(Object.is(receiptBefore, acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID))).toBe(true);
    expect(split.search.receipt).toEqual(receiptBefore);
    expect(split.promotion.receipt).toEqual(receiptBefore);
  });
});

describe("vertical admission is wired on the REAL construction path (D1/REQ-27, Pitfall 4)", () => {
  it("admitVerticalBattery refuses a battery tagged revops-gtm-exec-strategy through the real construction entry point", () => {
    const warehouse = generateWarehouse(7);
    const tasks = buildTasks(warehouse);
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const draft = { id: "would-be-revops-battery", tasks, receipt };
    const err = (() => {
      try {
        admitVerticalBattery("revops-gtm-exec-strategy", draft);
      } catch (e) {
        return e as Error;
      }
      throw new Error("expected admitVerticalBattery to throw, it did not");
    })();
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("revops-gtm-exec-strategy");
    expect(err.message).toContain("refused");
  });

  it("admitVerticalBattery admits data-ops and returns a real AgentBattery", () => {
    const warehouse = generateWarehouse(8);
    const tasks = buildTasks(warehouse);
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const draft = { id: "data-ops-battery-8", tasks, receipt };
    const battery = admitVerticalBattery("data-ops", draft);
    expect(battery.id).toBe("data-ops-battery-8");
    expect(battery.tasks.length).toBeGreaterThan(0);
  });
});

describe("fixture-warehouse — receipt sharing (REQ-23)", () => {
  it("acceptedGeneratorReceipt returns the SAME frozen object on every call", () => {
    const a = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const b = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    expect(Object.is(a, b)).toBe(true);
  });

  it("two batteries built from two different seeds carry the SAME pre-makeBattery receipt object", () => {
    // makeBattery shallow-copies and freezes a NEW receipt onto the battery
    // (battery-types.ts:264-267), so the two OUTPUT receipts cannot be
    // reference-compared — only the shared input object, held before
    // makeBattery runs, can be. Assert reference identity on that input, and
    // deep equality on the two frozen outputs (they came from the same
    // source object, so their content must match).
    const receiptBefore = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const batteryA = generateFixtureBattery(101, "data-ops-battery-a");
    const batteryB = generateFixtureBattery(202, "data-ops-battery-b");
    expect(Object.is(receiptBefore, acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID))).toBe(true);
    expect(batteryA.receipt).toEqual(batteryB.receipt);
  });
});

describe("fixture-warehouse — generator-rooted receipt discipline (REQ-23, the enforcement makeBattery structurally cannot provide)", () => {
  it("rootGeneratorId resolves the id half of lineage[0]", () => {
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    expect(rootGeneratorId(receipt)).toBe(DATA_OPS_GENERATOR_ID);
  });

  it("rootGeneratorId throws on an empty lineage — a constructed receipt with no lineage names no generator", () => {
    const receipt: OracleReceipt = { kind: "constructed", acceptedBy: "Dr. Robert Li", lineage: [] };
    const err = thrown(() => rootGeneratorId(receipt));
    expect(err.message).toContain("lineage");
  });

  it("rootGeneratorId throws on a lineage[0] with no colon, an empty prefix, or an empty id", () => {
    for (const badEntry of ["no-colon-here", ":empty-prefix", "empty-id:"]) {
      const receipt: OracleReceipt = { kind: "constructed", acceptedBy: "Dr. Robert Li", lineage: [badEntry] };
      const err = thrown(() => rootGeneratorId(receipt));
      expect(err.message).toContain(badEntry);
    }
  });

  it("requireGeneratorRooted passes for the memoized receipt returned by acceptedGeneratorReceipt", () => {
    const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    expect(() => requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_ID)).not.toThrow();
  });

  it("requireGeneratorRooted throws on an INSTANCE-rooted lineage — the id is not in ACCEPTED_GENERATORS", () => {
    const receipt: OracleReceipt = {
      kind: "constructed",
      acceptedBy: "Dr. Robert Li",
      lineage: ["constructed:data-ops-warehouse-seed-7"],
    };
    const err = thrown(() => requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_ID));
    expect(err.message).toContain("data-ops-warehouse-seed-7");
    expect(err.message).toContain(DATA_OPS_GENERATOR_ID);
  });

  it("requireGeneratorRooted throws on an UNACCEPTED-generator lineage", () => {
    const receipt: OracleReceipt = {
      kind: "constructed",
      acceptedBy: "Dr. Robert Li",
      lineage: ["constructed:some-other-generator-v2"],
    };
    const err = thrown(() => requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_ID));
    expect(err.message).toContain("some-other-generator-v2");
    expect(err.message).toContain(DATA_OPS_GENERATOR_ID);
  });

  it("requireGeneratorRooted throws on a field-identical but reference-distinct receipt — the Object.is step no field comparison can substitute for", () => {
    const original = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    const lookalike: OracleReceipt = {
      kind: original.kind,
      acceptedBy: original.acceptedBy,
      lineage: [...original.lineage],
    };
    expect(Object.is(lookalike, original)).toBe(false);
    expect(lookalike).toEqual(original);
    const err = thrown(() => requireGeneratorRooted(lookalike, DATA_OPS_GENERATOR_ID));
    expect(err.message).toContain("not the accepted generator");
  });

  it("generateFixtureBattery calls requireGeneratorRooted before the draft reaches admitVerticalBattery — the receipt threaded into the battery is the memoized object", () => {
    const battery = generateFixtureBattery(555, "data-ops-battery-generator-rooted-check");
    const memoized = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
    expect(battery.receipt).toEqual(memoized);
    expect(rootGeneratorId(battery.receipt)).toBe(DATA_OPS_GENERATOR_ID);
  });
});

describe("fixture-warehouse end to end — one seed, facts to scored run, offline", () => {
  it("a fact-derived candidate double passes every check; the battery is admitted and generator-rooted", async () => {
    const seed = 20260729;
    const battery = generateFixtureBattery(seed, "data-ops-pilot-tracer");
    const warehouse = generateWarehouse(seed);

    const candidate: CandidateAgent = { id: "cand-fact-derived", systemPrompt: "n/a" };
    const run = await runAgentBattery(candidate, battery, { providerImpl: factDerivedProvider(warehouse) });

    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
    expect(run.receipt.kind).toBe("constructed");
    expect(run.receipt.lineage[0]).toContain(DATA_OPS_GENERATOR_ID);
  });
});

// ── non-triviality controls: does this battery measure anything? (SC3,
// RESEARCH Pitfall 1) — four hand-rolled offline Provider doubles, passed as
// providerImpl to the REAL runAgentBattery, matching the house style already
// established by test/foundry-component-tournament.test.ts:28-57. ──────────

/** Returns the task prompt verbatim inside a path=answer.json fenced block.
 *  A battery this passes is measuring nothing. */
const echoProvider: Provider = {
  kind: "openai",
  baseUrl: "http://test-provider.invalid",
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const prompt = req.messages[0]!.content;
    return {
      text: "```path=answer.json\n" + prompt + "\n```",
      model: "echo-double",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

/** Prose, no fenced block at all — asserts the artifact-vacuity guard
 *  (`agent-runner.ts`'s `noArtifacts`) still holds for a GENERATED battery,
 *  not just a hand-built test fixture. */
const emptyProvider: Provider = {
  kind: "openai",
  baseUrl: "http://test-provider.invalid",
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    return {
      text: "I am unable to help with this request.",
      model: "empty-double",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

/** The important control. Genuinely parses the embedded CSV and emits a
 *  well-formed answer.json — but applies NONE of the reversals the task
 *  asks for: sums rawAmount AS WRITTEN (no cents/dollars normalization, so
 *  the three render formats are summed as if they were the same unit),
 *  counts every row including verbatim duplicates (no dedup), drops rows
 *  whose rawAmount is empty (no amountBackup recovery), and groups by the
 *  raw date's first 7 characters (correct only for ISO-formatted rows,
 *  wrong for the slashed/month-name renderings — no date normalization
 *  either). This is the control that proves the messiness transforms are
 *  LOAD-BEARING rather than decorative — without it, "the echo candidate
 *  fails" would be satisfied by any task at all, including an unsolvable
 *  one (RESEARCH Pitfall 1's own framing). */
const rawSumProvider: Provider = {
  kind: "openai",
  baseUrl: "http://test-provider.invalid",
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const csvMatch = req.messages[0]!.content.match(/```csv\n([\s\S]*?)```/);
    const csvBody = csvMatch ? csvMatch[1]! : "";
    const lines = csvBody.trim().split("\n").slice(1); // drop header
    const totals: Record<string, { orderCount: number; revenueCents: number }> = {};
    for (const line of lines) {
      const fields = line.split(",");
      const customerId = fields[1];
      const rawDate = fields[2];
      const rawAmount = fields[3];
      if (!customerId || !rawDate || !rawAmount) continue; // drops empty-rawAmount rows
      const groupKey = `${customerId}__${rawDate.slice(0, 7)}`; // naive: correct only for ISO dates
      const cents = Number(rawAmount); // as written — no format normalization
      const entry = totals[groupKey] ?? { orderCount: 0, revenueCents: 0 };
      entry.orderCount += 1; // no dedup — every row counted, including duplicates
      entry.revenueCents += Number.isFinite(cents) ? cents : 0;
      totals[groupKey] = entry;
    }
    return {
      text: "```path=answer.json\n" + JSON.stringify({ totals }) + "\n```",
      model: "raw-sum-double",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

describe("fixture-warehouse — non-triviality controls: the battery is not trivially passable (SC3, RESEARCH Pitfall 1)", () => {
  it("echo candidate (returns the prompt verbatim) scores testPassRate < 1, across three distinct seeds", async () => {
    for (const seed of [1, 2, 3]) {
      const battery = generateFixtureBattery(seed, `data-ops-echo-control-${seed}`);
      const candidate: CandidateAgent = { id: `cand-echo-${seed}`, systemPrompt: "n/a" };
      const run = await runAgentBattery(candidate, battery, { providerImpl: echoProvider });
      expect(run.result.testPassRate).toBeLessThan(1);
    }
  });

  it("empty candidate (no fenced block at all) scores testPassRate === 0 and passedGate === false", async () => {
    const battery = generateFixtureBattery(7, "data-ops-empty-control");
    const candidate: CandidateAgent = { id: "cand-empty", systemPrompt: "n/a" };
    const run = await runAgentBattery(candidate, battery, { providerImpl: emptyProvider });
    expect(run.result.testPassRate).toBe(0);
    expect(run.result.passedGate).toBe(false);
  });

  it("raw-sum candidate genuinely produces a well-formed answer.json, but scores testPassRate < 1 — the messiness transforms are load-bearing", async () => {
    for (const seed of [1, 2, 3]) {
      const battery = generateFixtureBattery(seed, `data-ops-raw-sum-control-${seed}`);
      const candidate: CandidateAgent = { id: `cand-raw-sum-${seed}`, systemPrompt: "n/a" };
      const run = await runAgentBattery(candidate, battery, { providerImpl: rawSumProvider });
      expect(run.tasks.every((t) => t.artifactPaths.includes("answer.json"))).toBe(true);
      expect(run.result.testPassRate).toBeLessThan(1);
    }
  });

  // Oracle: demonstrates the checks are SATISFIABLE by a candidate holding
  // the right answer — it says NOTHING about whether a real LLM agent can
  // derive it. That honesty is the difference between a control and a
  // claim (see the module doc comment on factDerivedProvider's own tracer
  // usage above, and 01-01-SUMMARY.md's identical framing).
  it("oracle candidate (answers from warehouse.facts directly) scores testPassRate === 1 and passedGate === true — the tasks are genuinely recoverable, not impossible", async () => {
    const seed = 7;
    const warehouse = generateWarehouse(seed);
    const battery = generateFixtureBattery(seed, "data-ops-oracle-control");
    const candidate: CandidateAgent = { id: "cand-oracle", systemPrompt: "n/a" };
    const run = await runAgentBattery(candidate, battery, { providerImpl: factDerivedProvider(warehouse) });
    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
  });
});

describe("fixture-warehouse — answer-key containment at the task-PROMPT level (T-01-03)", () => {
  it("for every task and every fact, a digit-bounded regex for revenueCents does not match the task prompt", () => {
    for (const seed of [1, 2, 3, 42, 9999]) {
      const battery = generateFixtureBattery(seed, `data-ops-containment-check-${seed}`);
      const warehouse = generateWarehouse(seed);
      for (const task of battery.tasks) {
        for (const fact of warehouse.facts) {
          const re = new RegExp(`(?<!\\d)${fact.revenueCents}(?!\\d)`);
          expect(re.test(task.prompt)).toBe(false);
        }
      }
    }
  });
});

// ── answer-key independence as a WALKABLE import-graph invariant (REQ-24/D5,
// RESEARCH Pitfall 5) — a structural check that would stay green even under
// the violation it claims to catch is not a control, it is decoration. The
// discrimination control below (test/fixtures/answer-key-violation.ts) is a
// deliberately-broken sibling module the SAME walker must flag. ────────────

/** The agent/provider layer, named EXPLICITLY rather than pattern-matched —
 *  a later addition to this layer is therefore a deliberate decision to
 *  extend this list, never a silent gap. Anything reachable under
 *  `src/mock/` is ALSO forbidden, checked separately below by directory
 *  prefix (that directory holds several files; an enumerable literal would
 *  drift as it grows, whereas this small named list of single FILES is
 *  exactly what "explicit, not pattern-matched" means for a bounded set). */
export const ANSWER_KEY_FORBIDDEN_MODULES: readonly string[] = [
  "src/foundry/provider.ts",
  "src/foundry/agent-runner.ts",
  "src/foundry/model-layer.ts",
  "src/foundry/runner.ts",
  "src/foundry/spawn.ts",
  "src/foundry/component-tournament.ts",
  "src/foundry/reflective-mutation.ts",
];

function isForbiddenModule(repoRelativePath: string): boolean {
  return ANSWER_KEY_FORBIDDEN_MODULES.includes(repoRelativePath) || repoRelativePath.startsWith("src/mock/");
}

/**
 * Resolves every RELATIVE `from "<specifier>"` in `entryFile` transitively —
 * both value and type imports (a type-only import of `Provider` is still a
 * signal worth refusing, so the regex does not distinguish `import type`
 * from `import`). A `.js` suffix is rewritten to `.ts` (the project's own
 * ESM-specifiers-resolve-to-.ts convention) and each specifier is resolved
 * against the IMPORTING file's own directory, then recursed with a visited
 * set. Bare specifiers (`node:crypto`, `vitest`, ...) are skipped — this
 * walker only follows the repo's own module graph. Returns REPO-ROOT-RELATIVE
 * paths, including the entry file itself (so "the set is non-empty" is a
 * meaningful assertion even for a leaf module).
 */
function walkImportGraph(entryFile: string): Set<string> {
  const visited = new Set<string>();
  const stack = [resolvePath(entryFile)];
  while (stack.length > 0) {
    const abs = stack.pop()!;
    const relPath = relative(REPO_ROOT, abs);
    if (visited.has(relPath)) continue;
    visited.add(relPath);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue; // unreadable — recorded as reachable, cannot be followed further
    }
    for (const match of content.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) continue; // bare specifier — skipped
      const rewritten = specifier.endsWith(".js") ? specifier.slice(0, -3) + ".ts" : specifier;
      stack.push(resolvePath(dirname(abs), rewritten));
    }
  }
  return visited;
}

describe("fixture-warehouse — answer-key independence as a walkable import-graph invariant (REQ-24/D5, RESEARCH Pitfall 5)", () => {
  it("the reachable set from fixture-warehouse.ts has ZERO intersection with the agent/provider layer, and is non-empty", () => {
    const reachable = walkImportGraph(join(REPO_ROOT, "src/foundry/fixture-warehouse.ts"));
    expect(reachable.size).toBeGreaterThan(0);
    expect(reachable.has("src/foundry/battery-types.ts")).toBe(true);
    const forbiddenHits = [...reachable].filter((p) => isForbiddenModule(p));
    expect(forbiddenHits).toEqual([]);
  });

  it("the SAME walker started at the discrimination-control fixture DOES report the provider layer — proving the guard is discriminating, not silent", () => {
    const reachable = walkImportGraph(join(REPO_ROOT, "test/fixtures/answer-key-violation.ts"));
    expect(reachable.has("src/foundry/provider.ts")).toBe(true);
  });
});
