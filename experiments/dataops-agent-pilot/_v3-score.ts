/**
 * Shared scorer for the v3 CALIBRATION PROBES (ceiling probe, grid probe).
 *
 * WHY IT DOES NOT GO THROUGH `runAgentBattery`. That function takes an
 * `AgentBattery`, and every `AgentBattery` carries an `OracleReceipt` naming
 * the human who accepted its generator — `validateReceipt` refuses anything
 * else, by design. The v3 generator has NOT been accepted yet, and it must not
 * be until the probes have told Dr. Robert Li what he would be accepting. So
 * the probes cannot mint a receipt: writing his name onto a probe battery to
 * satisfy the validator would fabricate exactly the acceptance event the whole
 * gate exists to require come from him. The probe runs receipt-free instead,
 * which also means nothing it builds can ever be mistaken for a battery a
 * tournament may consume.
 *
 * WHAT IT REUSES, AND WHY THAT MATTERS MORE THAN THE DUPLICATION IT AVOIDS.
 * The probe decides the knobs; if it scored even slightly more leniently than
 * the tournament, the corridor it certifies would be measured on a different
 * instrument from the one round 3 runs. So the scoring path here is the
 * tournament's own, function for function — `parseArtifacts`,
 * `buildObservations`, `evaluateChecks`, `gradeTask` — and the provider call
 * is byte-identical to `runAgentBattery`'s (same system/user split, no
 * temperature, no `maxTokens`, so the same 4096 default applies). The only
 * thing reimplemented here is the timeout and the sequential loop.
 */
import { createProvider } from "../../src/foundry/provider.js";
import { buildObservations, parseArtifacts } from "../../src/foundry/agent-runner.js";
import { evaluateChecks } from "../../src/contract/predicate-eval.js";
import { gradeTask } from "../../src/foundry/grade.js";
import type { BatteryTask } from "../../src/foundry/battery-types.js";

export interface ProbeTaskResult {
  taskId: string;
  /** `ok` never means "correct" — it means the harness got a complete answer.
   *  HANDOFF-V3 §2: verify this per task before reading any aggregate. Two
   *  harness faults have already masqueraded as capability results. */
  status: "ok" | "timeout" | "error";
  score: number;
  exact: boolean;
  hasArtifact: boolean;
  failureReason?: string;
  promptChars: number;
  /** Real tokenized prompt length, not a char estimate — design §3.6 flags a
   *  >30% inflation over v2 as a comparability risk, and CSV tokenizes at
   *  roughly 1.2 chars/token, so a char-based proxy understates it ~3x. */
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
}

export interface ProbeOptions {
  model: string;
  baseUrl?: string;
  taskTimeoutMs: number;
  /** In-flight requests. Default 1 (the tournament's own default). Raising it
   *  only helps when the ollama server also runs OLLAMA_NUM_PARALLEL >= the
   *  same value — otherwise requests just queue on one slot. Round-2's
   *  separation gate ran concurrency 2 (SEPGATE_CONCURRENCY default), so
   *  parallel scoring of one model has precedent on this arm; the single
   *  RESIDENT MODEL rule (watchdog, sequential model LOADS) is untouched —
   *  this is N requests to one model, never a second model. */
  concurrency?: number;
}

/**
 * Score one system prompt against one task list.
 *
 * Order-stable: results land at their task's index whatever order workers
 * finish in, so a checkpointed unit reads identically at any concurrency.
 */
export async function scoreProbeTasks(
  systemPrompt: string,
  tasks: BatteryTask[],
  opts: ProbeOptions,
): Promise<ProbeTaskResult[]> {
  const provider = createProvider({
    kind: "openai",
    baseUrl: opts.baseUrl ?? "http://localhost:11434/v1",
    model: opts.model,
  });

  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const results: ProbeTaskResult[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await scoreOneTask(provider, systemPrompt, tasks[index]!, opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function scoreOneTask(
  provider: ReturnType<typeof createProvider>,
  systemPrompt: string,
  task: BatteryTask,
  opts: ProbeOptions,
): Promise<ProbeTaskResult> {
  const startedAt = Date.now();
  let status: ProbeTaskResult["status"] = "ok";
  let failureReason: string | undefined;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // A task that outruns the bound scores 0 and is otherwise
    // indistinguishable from a wrong answer, so it is recorded as
    // `timeout` rather than folded into the rate. qwen3.6 needs >= 1h;
    // 1200s once killed slow tasks and faked a capability floor.
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`task timeout after ${opts.taskTimeoutMs}ms`)), opts.taskTimeoutMs).unref(),
    );
    const res = await Promise.race([
      provider.chat({
        model: opts.model,
        system: systemPrompt,
        messages: [{ role: "user", content: task.prompt }],
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

  const files = parseArtifacts(text);
  const observed = buildObservations(task.checks, files, text);
  const checkResults = evaluateChecks(task.checks, observed).checks;
  const score = status === "ok" ? gradeTask(checkResults, task.grading) : 0;

  return {
    taskId: task.id,
    status,
    score,
    exact: status === "ok" && checkResults.every((c) => c.pass),
    hasArtifact: Object.keys(files).length > 0,
    ...(failureReason ? { failureReason } : {}),
    promptChars: task.prompt.length,
    inputTokens,
    outputTokens,
    wallMs: Date.now() - startedAt,
  };
}

/** Mean of a numeric list; `0` for an empty list rather than `NaN`. */
export const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Normal-approximation confidence interval for a mean.
 *
 * The grid's acceptance rule is INTERVAL-based (design §3.3, gpt-sol-pro C3):
 * a point qualifies only if the baseline's 90% CI sits INSIDE [0.30, 0.60], so
 * a point estimate that lands in the corridor on a wide interval does not
 * qualify. z = 1.645 for 90%.
 */
export function meanCi90(xs: number[]): { mean: number; lo: number; hi: number; se: number } {
  const m = mean(xs);
  if (xs.length < 2) return { mean: m, lo: m, hi: m, se: 0 };
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  const se = Math.sqrt(variance / xs.length);
  return { mean: m, lo: m - 1.645 * se, hi: m + 1.645 * se, se };
}
