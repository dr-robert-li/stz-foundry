/**
 * Offline coverage for the DUALFIX corpus builder's pure decisions (Phase
 * 12 — Corpus + paired repair run + gate, Plan 12-01, REQ-63), plus the two
 * standing-bar invariants (T-12-02): the BI generator stays unaccepted, and
 * the builder's static import surface is exactly the allowlisted set.
 *
 * No provider call anywhere in this file — the module under test keeps
 * every env read and every provider call behind `main()`'s
 * `import.meta.url` guard, so importing its exported pure functions here
 * never touches the network.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDrawOrder,
  isEligibleDraw,
  shouldStopDrawing,
  toCorpusEntry,
  buildBaselinePrompt,
  classifyOutcome,
  type CorpusDrawResult,
} from "../experiments/dualfix-study/_dualfix-corpus-build.js";
import {
  DUALFIX_STUDY_SEEDS,
  DUALFIX_LEVEL_ID,
  DUALFIX_CORPUS_TARGET_N,
  DUALFIX_CORPUS_MIN_N,
} from "../experiments/dualfix-study/_dualfix-arms.js";
import { validateCorpusEntries } from "../experiments/dualfix-study/_dualfix-study.js";
import { ACCEPTED_GENERATORS, BI_ANALYTICS_GENERATOR_ID } from "../src/foundry/fixture-warehouse.js";

const BUILDER_SOURCE_PATH = new URL("../experiments/dualfix-study/_dualfix-corpus-build.ts", import.meta.url);

function makeDraw(overrides: Partial<CorpusDrawResult> = {}): CorpusDrawResult {
  return {
    seed: 1201,
    taskIndex: 0,
    taskId: "bi-analytics-L3-0-1201",
    question: "the arm-neutral prompt",
    status: "ok",
    rawText: "```sql\nSELECT 1\n```",
    artifact: "SELECT 1",
    category: "correct",
    gradedScore: 0,
    engineError: null,
    inputTokens: 1,
    outputTokens: 1,
    wallMs: 1,
    ...overrides,
  };
}

// ── draw order ────────────────────────────────────────────────────────────

describe("buildDrawOrder", () => {
  it("returns 60 units, DUALFIX_STUDY_SEEDS order then taskIndex 0..9 within each seed", () => {
    const order = buildDrawOrder();
    expect(order).toHaveLength(60);

    const expected: { seed: number; taskIndex: number }[] = [];
    for (const seed of DUALFIX_STUDY_SEEDS) {
      for (let taskIndex = 0; taskIndex < 10; taskIndex++) expected.push({ seed, taskIndex });
    }
    expect(order).toEqual(expected);
  });
});

// ── eligibility (§4) ─────────────────────────────────────────────────────

describe("isEligibleDraw — §4 eligibility predicate", () => {
  it("gradedScore 0 is eligible", () => {
    expect(isEligibleDraw({ gradedScore: 0 })).toBe(true);
  });

  it.each([0.25, 0.5, 0.999, 1])("gradedScore %s is not eligible", (gradedScore) => {
    expect(isEligibleDraw({ gradedScore })).toBe(false);
  });

  it("throws rather than coercing a non-numeric gradedScore", () => {
    expect(() => isEligibleDraw({ gradedScore: "0" as unknown as number })).toThrow(/must be a finite number/);
  });
});

// ── stop condition ───────────────────────────────────────────────────────

describe("shouldStopDrawing", () => {
  it("false one below the target, true at the target", () => {
    expect(shouldStopDrawing(DUALFIX_CORPUS_TARGET_N - 1, 999)).toBe(false);
    expect(shouldStopDrawing(DUALFIX_CORPUS_TARGET_N, 999)).toBe(true);
  });
});

// ── §8 termination classification ────────────────────────────────────────

describe("classifyOutcome — §8 boundary", () => {
  it("classifies DUALFIX_CORPUS_MIN_N - 1 eligible entries as UNDERPOWERED", () => {
    expect(classifyOutcome(DUALFIX_CORPUS_MIN_N - 1)).toBe("UNDERPOWERED");
  });

  it("classifies exactly DUALFIX_CORPUS_MIN_N eligible entries as CLOSED-AT-MINIMUM", () => {
    expect(classifyOutcome(DUALFIX_CORPUS_MIN_N)).toBe("CLOSED-AT-MINIMUM");
  });

  it("classifies DUALFIX_CORPUS_TARGET_N eligible entries as TARGET-REACHED", () => {
    expect(classifyOutcome(DUALFIX_CORPUS_TARGET_N)).toBe("TARGET-REACHED");
  });
});

// ── schema round-trip ────────────────────────────────────────────────────

describe("toCorpusEntry — schema round-trip", () => {
  it("output passes the shipped validateCorpusEntries and carries exactly the ten declared fields", () => {
    const draw = makeDraw({ gradedScore: 0, category: "executes-but-wrong" });
    const entry = toCorpusEntry(draw);

    expect(() => validateCorpusEntries([entry])).not.toThrow();
    expect(Object.keys(entry).sort()).toEqual(
      ["seed", "levelId", "taskIndex", "taskId", "question", "rawText", "artifact", "category", "gradedScore", "engineError"].sort(),
    );
    expect(entry.levelId).toBe(DUALFIX_LEVEL_ID);
  });
});

// ── D-A1 pure-suffix guidance prompt ─────────────────────────────────────

describe("buildBaselinePrompt — D-A1 pure suffix", () => {
  it("starts with the task's own arm-neutral prompt and ends with a digit-free guidance suffix", () => {
    const task = { prompt: "You are a BI analyst. Here is the warehouse schema:\n...\nWhat is total revenue?" };
    const composed = buildBaselinePrompt(task);

    expect(composed.startsWith(task.prompt)).toBe(true);
    const suffix = composed.slice(task.prompt.length);
    expect(suffix.length).toBeGreaterThan(0);
    expect(/\d/.test(suffix)).toBe(false);
  });

  it("is deterministic — the same task prompt always produces the same composed prompt", () => {
    const task = { prompt: "identical prompt text" };
    expect(buildBaselinePrompt(task)).toBe(buildBaselinePrompt(task));
  });
});

// ── standing bar 1: the BI generator stays unaccepted ────────────────────

describe("standing bar — BI generator stays unaccepted", () => {
  it("ACCEPTED_GENERATORS does not contain BI_ANALYTICS_GENERATOR_ID, and has exactly two entries", () => {
    expect(ACCEPTED_GENERATORS.has(BI_ANALYTICS_GENERATOR_ID)).toBe(false);
    expect(ACCEPTED_GENERATORS.size).toBe(2);
  });
});

// ── standing bar 2: the builder's static import surface ─────────────────

describe("standing bar — import allowlist (T-12-02)", () => {
  const ALLOWED_SPECIFIERS = new Set([
    "node:fs",
    "../../src/foundry/bi-warehouse.js",
    "../../src/foundry/bi-oracle.js",
    "../../src/foundry/provider.js",
    "./_dualfix-arms.js",
  ]);

  it("the module's set of static `from \"...\"` import specifiers equals the allowlist exactly", () => {
    const source = readFileSync(BUILDER_SOURCE_PATH, "utf8");
    const found = new Set<string>();
    for (const m of source.matchAll(/from\s+"([^"]+)"/g)) found.add(m[1]!);

    expect(found).toEqual(ALLOWED_SPECIFIERS);
  });

  it("never statically imports node:child_process or ./_dualfix-study.js (both reached only via runtime import())", () => {
    const source = readFileSync(BUILDER_SOURCE_PATH, "utf8");
    expect(source).not.toMatch(/from\s+"node:child_process"/);
    expect(source).not.toMatch(/from\s+"\.\/_dualfix-study\.js"/);
    // both ARE present, but only as a runtime `import(...)` call, never a
    // module-level `... from "..."` declaration.
    expect(source).toContain('await import("node:child_process")');
    expect(source).toContain('await import("./_dualfix-study.js")');
  });
});
