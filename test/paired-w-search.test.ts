/**
 * The receipt-free bounded search driver (Phase 14 — Instrument build,
 * Plan 14-05, REQ-69). Offline, deterministic: a queue-based stub
 * `Provider`, no network, no daemon — the exact call SEQUENCE
 * `runSearchLoop`/`runPromotionConfirmation` produce is fully determined
 * by the candidate array and options passed in, so a plain FIFO queue of
 * canned response strings is enough to drive every behavior below without
 * a content-matching router.
 *
 * Per this plan's own TDD-gate ordering (14-03-SUMMARY.md's precedent,
 * followed again at 14-04): this project's CLAUDE.md quality bar requires
 * `npm test`/`typecheck` green at EVERY commit, so `_w-search.ts` and this
 * test file are written together and committed green, rather than landing
 * a standalone failing RED commit — the source-assertion tests and the
 * seed-isolation/negative-import checks below supply the RED evidence a
 * temporary mutation would produce, without ever landing a broken suite.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSearchTaskOrder,
  buildPromotionTaskOrder,
  onceWithHarnessRetry,
  runSearchLoop,
  runPromotionConfirmation,
  composeVerdictArtifact,
  extractAgentSystemPromptFromDefinitionFile,
  loadSeedCandidates,
  SEARCH_SEED_ALT_SYSTEM_PROMPT,
  type SearchLoopResult,
} from "../experiments/paired-comparison-arm/_w-search.js";
import { loadState, type PairedState, type PairedAgentDefinition, type PairedArmResult } from "../experiments/paired-comparison-arm/_paired-arms.js";
import { generateCustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";
import { PAIRED_MODEL, TOURNAMENT_SEARCH_SEEDS, TOURNAMENT_PROMOTION_SEEDS } from "../experiments/paired-comparison-arm/_paired-constants.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const SEARCH_MODULE_PATH = join(process.cwd(), "experiments/paired-comparison-arm/_w-search.ts");
const B_ARM_DEFINITION_PATH = join(process.cwd(), "experiments/paired-comparison-arm/_b-arm-definition.md");

// ── the FIFO queue stub — the exact call sequence is fully determined by
// the candidate array + options each test passes in, so a plain array of
// canned response TEXTS is sufficient; no content-matching router needed ─

function makeQueueProvider(responses: string[]): { provider: Provider; calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  let i = 0;
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      if (i >= responses.length) {
        throw new Error(`queueProvider exhausted at call ${i} (only ${responses.length} responses queued)`);
      }
      const text = responses[i++]!;
      return { text, model: req.model, usage: { inputTokens: 5, outputTokens: 5, cacheReadInputTokens: 0 } };
    },
  };
  return { provider, calls };
}

function correctResponseFor(seed: number, taskIndex: number): string {
  const { resolution } = generateCustomerSupportTicket(seed, taskIndex);
  return `action: ${resolution.action}\ncategory: ${resolution.category}\nparameter: ${resolution.parameter}`;
}

/** A well-formed but ALWAYS-wrong response — see the file doc comment in
 *  `_w-search.ts`'s test coverage rationale: `escalate-repeat-defect`'s
 *  parameter is a catalog NAME, so "999.99" can never match any unit's
 *  true resolution, even the ~1/6 of units whose real action happens to be
 *  `escalate-repeat-defect` (action/category would match, parameter would
 *  not — `classifyCustomerSupportResponse` requires all three). */
const WRONG_RESPONSE = "action: escalate-repeat-defect\ncategory: product-quality\nparameter: 999.99";

function allWrongResponses(order: { seed: number; taskIndex: number }[]): string[] {
  return order.map(() => WRONG_RESPONSE);
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "paired-w-search-test-"));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const CAND_A: PairedAgentDefinition = { id: "cand-A", systemPrompt: "SYSTEM PROMPT A" };
const CAND_B: PairedAgentDefinition = { id: "cand-B", systemPrompt: "SYSTEM PROMPT B" };

// ── behavior 1: search-half seeds only for scoring, promotion-half only
// for confirmation, disjoint ──────────────────────────────────────────────

describe("task order — search-half vs promotion-half seed isolation", () => {
  it("buildSearchTaskOrder draws only from TOURNAMENT_SEARCH_SEEDS", () => {
    const seeds = new Set(buildSearchTaskOrder().map((u) => u.seed));
    expect([...seeds].sort((a, b) => a - b)).toEqual([...TOURNAMENT_SEARCH_SEEDS].sort((a, b) => a - b));
  });

  it("buildPromotionTaskOrder draws only from TOURNAMENT_PROMOTION_SEEDS", () => {
    const seeds = new Set(buildPromotionTaskOrder().map((u) => u.seed));
    expect([...seeds].sort((a, b) => a - b)).toEqual([...TOURNAMENT_PROMOTION_SEEDS].sort((a, b) => a - b));
  });

  it("the two seed blocks are disjoint", () => {
    const search = new Set(buildSearchTaskOrder().map((u) => u.seed));
    const promo = new Set(buildPromotionTaskOrder().map((u) => u.seed));
    for (const s of search) expect(promo.has(s)).toBe(false);
  });

  it("runPromotionConfirmation calls the provider exactly once per promotion-half unit, with the pinned model and the candidate's own systemPrompt as the sole system text", async () => {
    const order = buildPromotionTaskOrder();
    const responses = order.map((u) => correctResponseFor(u.seed, u.taskIndex));
    const { provider, calls } = makeQueueProvider(responses);
    const statePath = join(tmpDir, "promo-state.json");
    const state: PairedState = { units: {}, retries: [] };
    const winner: PairedAgentDefinition = { id: "winner-x", systemPrompt: "WINNER PROMPT TEXT" };

    const promo = await runPromotionConfirmation(statePath, state, winner, provider);

    expect(calls.length).toBe(order.length);
    expect(promo.attempted).toBe(order.length);
    expect(promo.matchCount).toBe(order.length);
    for (const req of calls) {
      expect(req.model).toBe(PAIRED_MODEL);
      expect(req.system).toBe("WINNER PROMPT TEXT");
    }
  });
});

// ── behavior 2: each generation mutates surviving candidates through
// reflectMutate, with the pinned model passed explicitly ─────────────────

describe("generation mutation — reflectMutate called with the pinned model", () => {
  it("mutates a single surviving candidate exactly once between two generations, with model: PAIRED_MODEL on that call", async () => {
    const order = buildSearchTaskOrder();
    const wrong30 = allWrongResponses(order);
    // gen0 (all wrong, triggers mutation) + 1 mutation response + gen1 (all wrong again, then halts at maxGenerations=2)
    const responses = [...wrong30, "MUTATED BODY TEXT", ...wrong30];
    const { provider, calls } = makeQueueProvider(responses);
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A], provider, {
      maxGenerations: 2,
      reflectionBudget: 5,
    });

    expect(result.halt.source).toBe("search-horizon");
    expect(result.generationsRun).toBe(2);
    // Exactly one mutation call: index `order.length` (right after gen0's 30 arm calls).
    const mutationCall = calls[order.length]!;
    expect(mutationCall.model).toBe(PAIRED_MODEL);
    expect(mutationCall.system).toMatch(/revising an AI agent's system-prompt BODY/);
    expect(calls.length).toBe(order.length * 2 + 1);
  });

  it("a candidate with zero failures (all matched) is carried forward unmutated — no reflection spent", async () => {
    const order = buildSearchTaskOrder();
    const allCorrect = order.map((u) => correctResponseFor(u.seed, u.taskIndex));
    const { provider, calls } = makeQueueProvider(allCorrect);
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A], provider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    expect(result.winner.searchMatchCount).toBe(order.length);
    expect(calls.length).toBe(order.length); // no mutation call queued or consumed
  });
});

// ── behavior 3: the two independently-exceedable caps ────────────────────

describe("the two independently-exceedable caps", () => {
  it("halts on the reflection-budget cap (cap=0) before any mutation is attempted", async () => {
    const order = buildSearchTaskOrder();
    const wrong30 = allWrongResponses(order);
    const { provider, calls } = makeQueueProvider(wrong30); // no mutation response queued — would throw if one were attempted
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A], provider, {
      maxGenerations: 5,
      reflectionBudget: 0,
    });

    expect(result.halt.source).toBe("reflection-budget");
    expect(result.halt.note).toMatch(/cap=0/);
    expect(calls.length).toBe(order.length); // gen0 only — halted before gen1's calls or any mutation
  });

  it("halts on the search-horizon cap (maxGenerations=1) before any mutation is attempted", async () => {
    const order = buildSearchTaskOrder();
    const wrong30 = allWrongResponses(order);
    const { provider, calls } = makeQueueProvider(wrong30);
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A], provider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    expect(result.halt.source).toBe("search-horizon");
    expect(result.halt.note).toMatch(/Max generations reached/);
    expect(calls.length).toBe(order.length);
  });
});

// ── behavior 4: a completed candidate-on-unit evaluation is never re-run
// on a resumed pass ───────────────────────────────────────────────────────

describe("resumability — completed evaluations and mutations are never re-run", () => {
  it("a second runSearchLoop call against the same on-disk state, with a provider that throws on any call, reproduces the identical result", async () => {
    const order = buildSearchTaskOrder();
    const wrong30 = allWrongResponses(order);
    const statePath = join(tmpDir, "state.json");

    const firstState: PairedState = { units: {}, retries: [] };
    const { provider: firstProvider } = makeQueueProvider(wrong30);
    const firstResult = await runSearchLoop(statePath, firstState, [CAND_A], firstProvider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    // Reload state fresh off disk — the real resume path (`main()` calls
    // `loadState`, never reuses an in-memory object across process
    // restarts). A throw-always provider proves zero new calls happen.
    const resumedState = loadState(statePath);
    const throwingProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(): Promise<ChatResponse> {
        throw new Error("throwingProvider: no call should have been made on a resumed pass");
      },
    };
    const secondResult = await runSearchLoop(statePath, resumedState, [CAND_A], throwingProvider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    expect(secondResult).toEqual(firstResult);
  });

  it("a resumed pass that also needs a NEW generation replays the cached mutation without re-inferring it", async () => {
    const order = buildSearchTaskOrder();
    const wrong30 = allWrongResponses(order);
    const statePath = join(tmpDir, "state.json");

    // First pass: run gen0 + mutate + gen1, halt at maxGenerations=2.
    const firstState: PairedState = { units: {}, retries: [] };
    const { provider: firstProvider } = makeQueueProvider([...wrong30, "MUTATED BODY TEXT", ...wrong30]);
    const firstResult = await runSearchLoop(statePath, firstState, [CAND_A], firstProvider, {
      maxGenerations: 2,
      reflectionBudget: 5,
    });

    // Resume with a fresh state object and a provider that would throw if
    // asked to re-score OR re-mutate anything already cached.
    const resumedState = loadState(statePath);
    const throwingProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(): Promise<ChatResponse> {
        throw new Error("throwingProvider: nothing should be re-run on this resumed pass");
      },
    };
    const secondResult = await runSearchLoop(statePath, resumedState, [CAND_A], throwingProvider, {
      maxGenerations: 2,
      reflectionBudget: 5,
    });

    expect(secondResult).toEqual(firstResult);
  });
});

// ── behavior 5: a transient slot fault is retried exactly once ───────────

describe("onceWithHarnessRetry — transient slot faults", () => {
  const baseResult = (overrides: Partial<PairedArmResult>): PairedArmResult => ({
    arm: "W",
    unitId: "1401:0",
    status: "ok",
    rawText: "",
    oracleCategory: "no-artifact",
    score: 0,
    inputTokens: 0,
    outputTokens: 0,
    wallMs: 1,
    ...overrides,
  });

  it("retries a status:'error' result exactly once, logging the retry, and caches only the final result", async () => {
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };
    let callCount = 0;
    const work = async (): Promise<PairedArmResult> => {
      callCount++;
      if (callCount === 1) return baseResult({ status: "error", failureReason: "ECONNRESET" });
      return baseResult({ status: "ok", oracleCategory: "resolution-mismatch", rawText: "action: x" });
    };

    const result = await onceWithHarnessRetry(statePath, state, "key1", work);

    expect(callCount).toBe(2);
    expect(result.status).toBe("ok");
    expect(state.retries.length).toBe(1);
    expect(state.retries[0]).toMatch(/key1.*harness-fault retry/);
    expect(state.units["key1"]).toEqual(result);

    // A second call with the same key is a pure cache hit — work() never
    // runs again.
    const secondResult = await onceWithHarnessRetry(statePath, state, "key1", work);
    expect(callCount).toBe(2);
    expect(secondResult).toEqual(result);
  });

  it("never retries a timeout (only status:'error' triggers the harness-fault retry)", async () => {
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };
    let callCount = 0;
    const work = async (): Promise<PairedArmResult> => {
      callCount++;
      return baseResult({ status: "timeout", failureReason: "task timeout after 3600000ms" });
    };

    const result = await onceWithHarnessRetry(statePath, state, "key2", work);

    expect(callCount).toBe(1);
    expect(result.status).toBe("timeout");
    expect(state.retries.length).toBe(0);
  });
});

// ── behavior 6: selection returns the highest search-half match count,
// ties broken deterministically by candidate identifier order ───────────

describe("selection — highest search-half match count, deterministic tie-break", () => {
  function responsesWithCorrectAt(order: { seed: number; taskIndex: number }[], correctIndices: Set<number>): string[] {
    return order.map((u, idx) => (correctIndices.has(idx) ? correctResponseFor(u.seed, u.taskIndex) : WRONG_RESPONSE));
  }

  it("picks the candidate with the strictly higher search-half match count", async () => {
    const order = buildSearchTaskOrder();
    const responsesA = responsesWithCorrectAt(order, new Set([0, 1, 2, 3, 4])); // 5 correct
    const responsesB = responsesWithCorrectAt(order, new Set([0, 1, 2])); // 3 correct
    const { provider } = makeQueueProvider([...responsesA, ...responsesB]);
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A, CAND_B], provider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    expect(result.winner.candidateId).toBe("cand-A");
    expect(result.winner.searchMatchCount).toBe(5);
  });

  it("on a tie, breaks by the ORIGINAL seed-array candidate order (earliest wins)", async () => {
    const order = buildSearchTaskOrder();
    const tiedCorrect = new Set([0, 1, 2, 3, 4]);
    const responsesA = responsesWithCorrectAt(order, tiedCorrect);
    const responsesB = responsesWithCorrectAt(order, tiedCorrect);
    const { provider } = makeQueueProvider([...responsesA, ...responsesB]);
    const statePath = join(tmpDir, "state.json");
    const state: PairedState = { units: {}, retries: [] };

    const result = await runSearchLoop(statePath, state, [CAND_A, CAND_B], provider, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });

    expect(result.winner.candidateId).toBe("cand-A");

    // Reversed array order — B now wins the same tie, proving the
    // tie-break tracks array position, not any other property.
    const { provider: provider2 } = makeQueueProvider([...responsesB, ...responsesA]);
    const state2: PairedState = { units: {}, retries: [] };
    const result2 = await runSearchLoop(join(tmpDir, "state2.json"), state2, [CAND_B, CAND_A], provider2, {
      maxGenerations: 1,
      reflectionBudget: 5,
    });
    expect(result2.winner.candidateId).toBe("cand-B");
  });
});

// ── behavior 7: the verdict artifact's completion flag is true only after
// the promotion-half confirmation counts are recorded ───────────────────

describe("verdict composition — complete:true only after promotion confirmation exists", () => {
  it("composeVerdictArtifact requires the promotion confirmation as a non-optional positional argument", () => {
    // Arity proof: (search, promotion, runConfig) — all three required.
    // TypeScript itself refuses a call site missing `promotion`; this
    // arity check is the runtime-visible half of that same guarantee.
    expect(composeVerdictArtifact.length).toBe(3);
  });

  it("the composed verdict carries complete:true and the given promotion object verbatim", () => {
    const fakeSearch: SearchLoopResult = {
      halt: { source: "search-horizon", note: "Max generations reached; keeping best archived incumbent." },
      generationsRun: 1,
      fitnessLog: [],
      winner: { candidateId: "cand-A", systemPrompt: "winning prompt text", generation: 0, searchMatchCount: 22 },
    };
    const fakePromotion = { candidateId: "cand-A", matchCount: 21, scoreable: 28, attempted: 30 };

    const verdict = composeVerdictArtifact(fakeSearch, fakePromotion, { model: PAIRED_MODEL });

    expect(verdict.complete).toBe(true);
    expect(verdict.promotion).toEqual(fakePromotion);
    expect(verdict.winner).toEqual(fakeSearch.winner);
    expect(verdict.searchTaskCount).toBe(buildSearchTaskOrder().length);
    expect(verdict.promotionTaskCount).toBe(buildPromotionTaskOrder().length);
  });
});

// ── the extraction convention shared with `_b-arm-definition.md` /
// `_w-arm-definition.md` ──────────────────────────────────────────────────

describe("extractAgentSystemPromptFromDefinitionFile — the fenced-block convention", () => {
  it("extracts the real committed baseline's operative prompt, excluding the heading and the provenance prose around it", () => {
    const md = readFileSync(B_ARM_DEFINITION_PATH, "utf8");
    const prompt = extractAgentSystemPromptFromDefinitionFile(md);

    expect(prompt).toContain("adjust-charge");
    expect(prompt).toContain("Blue Ceramic Mug");
    expect(prompt).not.toContain("Agent System Prompt");
    expect(prompt).not.toContain("Authoring rationale");
    expect(prompt).not.toContain("Override framing");
  });

  it("throws when the marker is absent", () => {
    expect(() => extractAgentSystemPromptFromDefinitionFile("# no marker here\n```\nx\n```")).toThrow(/marker/);
  });

  it("throws when no fenced block follows the marker", () => {
    expect(() => extractAgentSystemPromptFromDefinitionFile("## Agent System Prompt\nno fence here")).toThrow(/fenced block/);
  });
});

describe("loadSeedCandidates — two distinctly-identified starting candidates", () => {
  it("returns the committed baseline (extracted) plus the second hand-written variant, in a fixed, deterministic order", () => {
    const seeds = loadSeedCandidates();
    expect(seeds.map((c) => c.id)).toEqual(["seed-baseline", "seed-alt"]);
    expect(seeds[0]!.systemPrompt.length).toBeGreaterThan(100);
    expect(seeds[1]!.systemPrompt).toBe(SEARCH_SEED_ALT_SYSTEM_PROMPT);
    // The two starting candidates are genuinely different lineages, not a
    // near-duplicate pair.
    expect(seeds[0]!.systemPrompt).not.toBe(seeds[1]!.systemPrompt);
  });
});

// ── source assertions — mirrors `test/foundry-reflective-mutation.test.ts`'s
// own convention: the shipped primitives are imported and CALLED, never
// re-implemented; nothing receipt/battery-shaped is constructed; no paired
// battery seed numeral appears anywhere in the driver's own source ───────

describe("source assertions", () => {
  const src = readFileSync(SEARCH_MODULE_PATH, "utf8");
  const commentStripped = src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

  it("imports reflectMutate/onReflection/initialReflection from reflective-mutation.js and calls reflectMutate with the pinned model", () => {
    expect(src).toMatch(/import\s*\{[^}]*\breflectMutate\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/foundry\/reflective-mutation\.js"/s);
    expect(src).toMatch(/import\s*\{[^}]*\bonReflection\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/foundry\/reflective-mutation\.js"/s);
    expect(src).toMatch(/reflectMutate\(candidate,\s*trace,\s*provider,\s*\{\s*model:\s*PAIRED_MODEL\s*\}\)/);
  });

  it("imports onGeneration/initialMeta/MAX_GENERATIONS_DEFAULT from harness.js and calls onGeneration", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bonGeneration\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/harness\.js"/s);
    expect(src).toMatch(/onGeneration\(meta,/);
  });

  it("never imports runComponentTournament, battery-types, or any acceptance-requiring/receipt-constructing helper (comment-stripped)", () => {
    expect(commentStripped).not.toMatch(
      /acceptedGeneratorReceipt|requireGeneratorRooted|makeBattery|makeSplitBattery|admitVerticalBattery|battery-types|runComponentTournament/,
    );
  });

  it("never references the paired battery's own seeds (1301-1306), comment-stripped", () => {
    expect(commentStripped).not.toMatch(/\b130[1-6]\b/);
  });
});
