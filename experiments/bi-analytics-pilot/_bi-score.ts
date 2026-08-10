/**
 * Shared scorer for the BI CALIBRATION PROBES (ceiling gate; reused unchanged
 * by Phase 9's corridor probe per `BI-BATTERY-DESIGN.md` §6).
 *
 * WHY IT DOES NOT GO THROUGH `runAgentBattery`. Every `AgentBattery` carries
 * an `OracleReceipt` naming the human who accepted its generator —
 * `validateReceipt` refuses anything else, by design. `BI_ANALYTICS_GENERATOR_ID`
 * is deliberately absent from `ACCEPTED_GENERATORS` (08-01) and must stay that
 * way until Phase 9's pre-authorized REQ-57 acceptance event. Writing a name
 * onto a probe battery to satisfy the validator would fabricate exactly that
 * acceptance event. The probe therefore calls `buildBiTasks` directly, never
 * `generateBiBattery`, and runs receipt-free — mirroring
 * `experiments/dataops-agent-pilot/_v3-score.ts`'s own stated rule, one arm
 * over.
 *
 * WHAT IT REUSES, AND WHY THAT MATTERS MORE THAN THE DUPLICATION IT AVOIDS.
 * Scoring runs through `src/foundry/bi-oracle.ts`'s OWN primitives —
 * `extractSqlArtifact`, `isSingleReadOnlySelect` (the §2 rule-4 pre-check),
 * `executeSelect` (against a FRESH per-task materialized handle — the
 * design's candidate-execution-isolation rule), and `gradedScore`. The
 * category dispatch below is `categorize()`'s own four-branch decision
 * (`bi-oracle.ts`) inlined rather than called through that wrapper — ONLY so
 * this function can also capture the executed result set / engine error for
 * the §4 instrumentation record without executing the candidate's SQL twice.
 * No scoring RULE is reimplemented; every decision point calls the oracle's
 * own function. If the probe scored even slightly differently, the corridor
 * it certifies would be measured on a different instrument from the one
 * Phase 9 runs.
 */
import type { DatabaseSync } from "node:sqlite";
import { createProvider } from "../../src/foundry/provider.js";
import {
  executeSelect,
  extractSqlArtifact,
  gradedScore,
  isSingleReadOnlySelect,
  materializeWarehouse,
  type BiCategory,
  type BiResultSet,
} from "../../src/foundry/bi-oracle.js";
import { BI_TASK_TIMEOUT_MS, type BiWarehouse } from "../../src/foundry/bi-warehouse.js";
import type { BatteryTask } from "../../src/foundry/battery-types.js";

/** One task to score: the (ceiling-augmented) prompt, the warehouse it must
 *  materialize a FRESH candidate handle against, and the precomputed
 *  reference result set to grade against. */
export interface BiProbeTaskInput {
  task: BatteryTask;
  warehouse: BiWarehouse;
  expected: BiResultSet;
}

export interface BiProbeTaskResult {
  taskId: string;
  /** `ok` never means "correct" — it means the harness got a complete
   *  answer. Per-task status is verified BEFORE any aggregate is read (§4,
   *  and the milestone's standing rule). */
  status: "ok" | "timeout" | "error";
  failureReason?: string;
  /** Raw response text, verbatim — §4: no probe runs without it. */
  rawText: string;
  artifact: string | null;
  executedResult: BiResultSet | null;
  engineError: string | null;
  gradedScore: number;
  exact: boolean;
  /** §4's zero-decomposition category — always one of the four, even for a
   *  harness `error`/`timeout` (empty response text extracts no artifact,
   *  landing `no-artifact` by the same rule a real empty response would). */
  category: BiCategory;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
}

export interface BiProbeOptions {
  model: string;
  baseUrl?: string;
  /** Default `BI_TASK_TIMEOUT_MS` (3_600_000, §8) — qwen3.6 needs >= 3600000;
   *  1200s once killed slow tasks and faked a capability floor
   *  (`_v3-score.ts`'s own note, one arm over). */
  taskTimeoutMs?: number;
  /** In-flight requests. Default 1. Only useful when the ollama server also
   *  runs `OLLAMA_NUM_PARALLEL` >= the same value. */
  concurrency?: number;
}

/**
 * Score one system prompt against one task list.
 *
 * Order-stable: results land at their task's index whatever order workers
 * finish in, so a checkpointed unit reads identically at any concurrency.
 */
export async function scoreBiProbeTasks(
  systemPrompt: string,
  items: BiProbeTaskInput[],
  opts: BiProbeOptions,
): Promise<BiProbeTaskResult[]> {
  const provider = createProvider({
    kind: "openai",
    baseUrl: opts.baseUrl ?? "http://localhost:11434/v1",
    model: opts.model,
  });
  const taskTimeoutMs = opts.taskTimeoutMs ?? BI_TASK_TIMEOUT_MS;

  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const results: BiProbeTaskResult[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await scoreOneBiTask(provider, opts.model, systemPrompt, items[index]!, taskTimeoutMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function scoreOneBiTask(
  provider: ReturnType<typeof createProvider>,
  model: string,
  systemPrompt: string,
  item: BiProbeTaskInput,
  taskTimeoutMs: number,
): Promise<BiProbeTaskResult> {
  const startedAt = Date.now();
  let status: BiProbeTaskResult["status"] = "ok";
  let failureReason: string | undefined;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // A task that outruns the bound scores as `no-artifact` (empty text) and
    // is otherwise indistinguishable from a wrong answer, so it is recorded
    // as `timeout` rather than folded into the error rate.
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`task timeout after ${taskTimeoutMs}ms`)), taskTimeoutMs).unref(),
    );
    const res = await Promise.race([
      provider.chat({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: item.task.prompt }],
      }),
      timer,
    ]);
    text = res.text;
    inputTokens = res.usage.inputTokens;
    outputTokens = res.usage.outputTokens;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    status = message.includes("task timeout") ? "timeout" : "error";
    failureReason = message;
  }

  // §4 zero-decomposition, in the oracle's own fail-closed order —
  // `categorize()`'s own dispatch (`bi-oracle.ts`), inlined so the executed
  // result set / engine error can be captured alongside the category.
  let artifact: string | null = null;
  let executedResult: BiResultSet | null = null;
  let engineError: string | null = null;
  let score = 0;
  let exact = false;
  let category: BiCategory;

  artifact = extractSqlArtifact(text);
  if (artifact === null) {
    category = "no-artifact";
  } else if (!isSingleReadOnlySelect(artifact)) {
    category = "non-executable-artifact";
  } else {
    // Candidate execution isolation (design §3): a FRESH handle per task,
    // never reused across tasks.
    const db: DatabaseSync = materializeWarehouse(item.warehouse);
    try {
      executedResult = executeSelect(db, artifact);
      score = gradedScore(item.expected, executedResult);
      exact = score === 1 && item.expected.rows.length === executedResult.rows.length;
      category = score === 1 ? "correct" : "executes-but-wrong";
    } catch (e) {
      engineError = e instanceof Error ? e.message : String(e);
      category = "non-executable-artifact";
    }
  }

  return {
    taskId: item.task.id,
    status,
    ...(failureReason ? { failureReason } : {}),
    rawText: text,
    artifact,
    executedResult,
    engineError,
    gradedScore: score,
    exact,
    category,
    inputTokens,
    outputTokens,
    wallMs: Date.now() - startedAt,
  };
}

/** Mean of a numeric list; `0` for an empty list rather than `NaN`. */
export const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
