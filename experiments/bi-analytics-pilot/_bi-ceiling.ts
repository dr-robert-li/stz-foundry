/**
 * THE §6 FORMAT-STABILITY / CEILING GATE — runs FIRST, before any difficulty
 * work (`BI-BATTERY-DESIGN.md` §6, §9 gate condition 1).
 *
 * The question: handed the reference SQL query VERBATIM, can the model land
 * it in the required fence and have it execute? A candidate that simply
 * transcribes the given query into the required fence should score at or
 * near 1.0 if extraction and execution both work — isolating
 * extraction/execution reliability from query-writing capability. If a point
 * cannot clear this at 0.95 with zero extraction/execution failures, whatever
 * a later difficulty probe measures at that point is a format confound
 * wearing a difficulty costume. The terminated v3.1 arm lost a whole grid
 * probe to exactly this shape of confound (§2).
 *
 * Runs at all four grid levels (L1-L4), seeds `BI_CEILING_GATE_SEEDS`
 * (101, 202) only, n = `BI_CEILING_GATE_N_PER_POINT` (20) per point.
 *
 *   TOURNEY_STATE=bi-ceiling-state.json nohup npx tsx _bi-ceiling.ts > bi-ceiling.log 2>&1 &
 *
 * (In practice: launched through `_launch-probe.sh`, the sole sanctioned
 * detached launcher — never a bare `nohup ... &`.)
 */
import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  buildBiQuerySpecs,
  buildBiTasks,
  BI_CEILING_GATE_MEAN_MIN,
  BI_CEILING_GATE_N_PER_POINT,
  BI_CEILING_GATE_SEEDS,
  BI_GRID,
  BI_TASK_TIMEOUT_MS,
  BI_TASKS_PER_SEED_PER_POINT,
  composeReferenceSql,
  generateBiWarehouse,
  type BiLevelId,
} from "../../src/foundry/bi-warehouse.js";
import { executeSelect, materializeWarehouse, BI_ZERO_DECOMPOSITION_CATEGORIES } from "../../src/foundry/bi-oracle.js";
import { mean, scoreBiProbeTasks, type BiProbeTaskInput, type BiProbeTaskResult } from "./_bi-score.js";

const MODEL = process.env.BI_MODEL ?? "qwen3.6:latest";
const TIMEOUT_MS = Number(process.env.BI_TIMEOUT_MS ?? BI_TASK_TIMEOUT_MS);
// In-flight requests. Only useful when the ollama server runs
// OLLAMA_NUM_PARALLEL >= the same value; single ollama slot here, so 1.
const CONCURRENCY = Number(process.env.BI_CONCURRENCY ?? 1);
// Explicit, never defaulted: an omitted state path once pointed a re-run at
// the wrong round's data (the `_v3-ceiling.ts` precedent, one arm over).
const STATE_PATH = process.env.TOURNEY_STATE;
if (!STATE_PATH) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");
// Honoured ONLY when set — the Task 1 end-to-end smoke run. Absent in the
// real run.
const TASK_LIMIT = process.env.BI_CEILING_TASK_LIMIT ? Number(process.env.BI_CEILING_TASK_LIMIT) : undefined;

/**
 * Phase-8-derived pin (`<pinned_constants>`, 08-02-PLAN.md), not a §8-named
 * value — the design's §6 ceiling-gate paragraph specifies only the
 * user-prompt content (task prompt + reference SQL verbatim + the §2
 * output-contract instruction), naming no system prompt at all. Pinned
 * MINIMAL here: no task guidance, no column hints, no join strategy, no
 * aggregation reminder — the gate isolates extraction/execution reliability
 * from query-writing capability, so any engineering guidance would measure
 * the wrong thing and would also pre-empt a Phase-9 arm definition. Recorded
 * verbatim in `CEILING-PROBE.md`'s run-configuration section.
 */
export const BI_CEILING_SYSTEM_PROMPT = "You are a SQL assistant.";

interface RetryLog {
  unitKey: string;
  taskId: string;
  reason: string;
  at: string;
}

interface RunConfig {
  ollamaVersion: string;
  modelDigestLine: string;
  samplerParams: string;
  ollamaNumParallel: string;
  clientConcurrency: number;
  taskOrder: string;
  taskTimeoutMs: number;
  systemPrompt: string;
}

interface State {
  units: Record<string, BiProbeTaskResult[]>;
  retries: RetryLog[];
  runConfig?: RunConfig;
}

const loadState = (): State => {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH!, "utf8")) as Partial<State>;
    return { units: parsed.units ?? {}, retries: parsed.retries ?? [], runConfig: parsed.runConfig };
  } catch {
    return { units: {}, retries: [] };
  }
};

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state. */
const saveState = (state: State): void => {
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH!);
};

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

/** §4: properties of the EXECUTED run, captured at run time, never pinned
 *  as a design constant. */
function captureRunConfig(): RunConfig {
  const ollamaVersion = safeExec("ollama --version");
  const listLine = safeExec("ollama list")
    .split("\n")
    .find((l) => l.startsWith(MODEL) || l.startsWith(MODEL.replace(/:latest$/, "")));
  return {
    ollamaVersion,
    modelDigestLine: listLine ?? `<not found in 'ollama list': ${MODEL}>`,
    // No temperature, no maxTokens sent (provider.ts's openai adapter omits
    // both fields entirely when unset) — server/model default applies.
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    ollamaNumParallel: process.env.OLLAMA_NUM_PARALLEL ?? "<unset — server default>",
    clientConcurrency: CONCURRENCY,
    taskOrder: "battery order, sequential (grid level L1..L4, seed 101 then 202, task 0..9)",
    taskTimeoutMs: TIMEOUT_MS,
    systemPrompt: BI_CEILING_SYSTEM_PROMPT,
  };
}

/**
 * Builds the ceiling-augmented task/expected-result inputs for one
 * (seed, level) unit. Asserts task/spec alignment explicitly BEFORE
 * injecting the reference SQL — on `_v3-ceiling.ts`'s own model — since a
 * silent misalignment would hand every task the wrong reference query and
 * report a confound that does not exist.
 */
function buildUnitInputs(seed: number, levelId: BiLevelId): BiProbeTaskInput[] {
  const warehouse = generateBiWarehouse(seed);
  const specs = buildBiQuerySpecs(warehouse, levelId);
  const tasks = buildBiTasks(warehouse, levelId);
  if (tasks.length !== specs.length || tasks.length !== BI_TASKS_PER_SEED_PER_POINT) {
    throw new Error(
      `[bi-ceiling] task/spec count mismatch for seed ${seed} level ${levelId}: ` +
        `${tasks.length} tasks vs ${specs.length} specs (want ${BI_TASKS_PER_SEED_PER_POINT})`,
    );
  }

  // The reference execution is a KNOWN-QUERY read against the seed's own
  // warehouse — not candidate execution, so one shared handle for all 10
  // reference computations in this unit is fine (candidate isolation only
  // applies to the untrusted, model-authored artifact — `_bi-score.ts`).
  const refDb = materializeWarehouse(warehouse);

  return tasks.map((task, i) => {
    const spec = specs[i]!;
    const expectedTaskId = `bi-analytics-${levelId}-${spec.taskIndex}-${seed}`;
    if (task.id !== expectedTaskId) {
      throw new Error(
        `[bi-ceiling] task/spec misalignment at index ${i}: task id ${JSON.stringify(task.id)} vs ` +
          `expected ${JSON.stringify(expectedTaskId)} — would hand this task the wrong reference query`,
      );
    }
    const referenceSql = composeReferenceSql(spec);
    const expected = executeSelect(refDb, referenceSql);
    const ceilingPrompt = [
      task.prompt,
      ``,
      `The correct SQL query for this question has already been written for you:`,
      "```sql",
      referenceSql,
      "```",
      `Transcribe this exact query into the required fenced SQL code block as your entire response.`,
    ].join("\n");
    return { task: { ...task, prompt: ceilingPrompt }, warehouse, expected };
  });
}

/** Run `items` once per unit key, ever — the checkpoint contract. Applies
 *  the §4 no-redraw rule: a HARNESS fault (`error`) is retried exactly once,
 *  logged in `state.retries` (never appended to the unit's own results
 *  array — every unit array stays exactly `BI_TASKS_PER_SEED_PER_POINT`
 *  long); a `timeout` at the bound is a measurement and is never retried. */
const once = async (state: State, key: string, items: BiProbeTaskInput[]): Promise<BiProbeTaskResult[]> => {
  const cached = state.units[key];
  if (cached) {
    console.log(`  [cached] ${key}`);
    return cached;
  }

  const results = await scoreBiProbeTasks(BI_CEILING_SYSTEM_PROMPT, items, {
    model: MODEL,
    taskTimeoutMs: TIMEOUT_MS,
    concurrency: CONCURRENCY,
  });

  const errorIdxs = results.map((r, i) => (r.status === "error" ? i : -1)).filter((i) => i >= 0);
  for (const i of errorIdxs) {
    const reason = results[i]!.failureReason ?? "unknown harness error";
    console.log(`  !! harness fault on ${results[i]!.taskId} (${reason}) — retrying once`);
    state.retries.push({ unitKey: key, taskId: results[i]!.taskId, reason, at: new Date().toISOString() });
    const [retried] = await scoreBiProbeTasks(BI_CEILING_SYSTEM_PROMPT, [items[i]!], {
      model: MODEL,
      taskTimeoutMs: TIMEOUT_MS,
      concurrency: 1,
    });
    results[i] = retried!;
  }

  state.units[key] = results;
  saveState(state);
  return results;
};

const main = async () => {
  console.log("# BI CEILING GATE — §6 format-stability / ceiling probe");
  console.log(
    `model: ${MODEL} · seeds: ${BI_CEILING_GATE_SEEDS.join(", ")} · points: ${BI_GRID.map((p) => p.id).join(", ")}`,
  );
  console.log(
    `taskTimeoutMs: ${TIMEOUT_MS} · state: ${STATE_PATH} · target: no-artifact-or-non-executable=0 AND mean >= ${BI_CEILING_GATE_MEAN_MIN}` +
      (TASK_LIMIT !== undefined ? ` · BI_CEILING_TASK_LIMIT=${TASK_LIMIT} (smoke mode)` : ""),
  );
  console.log("");

  const state = loadState();
  if (!state.runConfig) {
    state.runConfig = captureRunConfig();
    saveState(state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const byPoint = new Map<string, BiProbeTaskResult[]>();
  let remaining = TASK_LIMIT;

  outer: for (const point of BI_GRID) {
    for (const seed of BI_CEILING_GATE_SEEDS) {
      let items = buildUnitInputs(seed, point.id);
      if (remaining !== undefined) {
        items = items.slice(0, remaining);
        if (items.length === 0) break outer;
      }

      const key = `ceiling-${point.id}-s${seed}`;
      console.log(`\n## ${key} (${items.length} tasks)`);
      const results = await once(state, key, items);

      // Per-task status BEFORE any aggregate (the milestone's standing
      // rule; two harness faults have already masqueraded as capability
      // results on the prior arm).
      const nonOk = results.filter((r) => r.status !== "ok");
      if (nonOk.length > 0) {
        console.log(
          `  !! ${nonOk.length}/${results.length} not ok: ` +
            nonOk.map((r) => `${r.taskId}=${r.status}(${r.failureReason ?? "-"})`).join(", "),
        );
      }
      console.log(
        `  mean=${mean(results.map((r) => r.gradedScore)).toFixed(3)} ` +
          `exact=${results.filter((r) => r.exact).length}/${results.length} ` +
          `medianWallMs=${[...results].map((r) => r.wallMs).sort((a, b) => a - b)[Math.floor(results.length / 2)]}`,
      );

      byPoint.set(point.id, [...(byPoint.get(point.id) ?? []), ...results]);
      if (remaining !== undefined) {
        remaining -= results.length;
        if (remaining <= 0) break outer;
      }
    }
  }

  if (TASK_LIMIT !== undefined) {
    console.log(`\nsmoke mode (BI_CEILING_TASK_LIMIT=${TASK_LIMIT}) — skipping the full verdict table.`);
    return;
  }

  console.log("\n\n## CEILING VERDICT (§9 gate condition 1 — TWO conjuncts, never a bare mean)\n");
  console.log(
    "| point | n | no-artifact | non-executable | no-artifact-OR-non-executable | mean graded | exact rate | verdict |",
  );
  console.log("|---|---|---|---|---|---|---|---|");
  let anyPass = false;
  for (const point of BI_GRID) {
    const results = byPoint.get(point.id) ?? [];
    const counts = Object.fromEntries(BI_ZERO_DECOMPOSITION_CATEGORIES.map((c) => [c, 0])) as Record<string, number>;
    for (const r of results) counts[r.category] = (counts[r.category] ?? 0) + 1;
    const noArtifactOrNonExecutable = (counts["no-artifact"] ?? 0) + (counts["non-executable-artifact"] ?? 0);
    const m = mean(results.map((r) => r.gradedScore));
    const exactRate = results.length > 0 ? results.filter((r) => r.exact).length / results.length : 0;
    const pass = noArtifactOrNonExecutable === 0 && m >= BI_CEILING_GATE_MEAN_MIN;
    if (pass) anyPass = true;
    console.log(
      `| ${point.id} | ${results.length} | ${counts["no-artifact"] ?? 0} | ${counts["non-executable-artifact"] ?? 0} | ` +
        `${noArtifactOrNonExecutable} | ${m.toFixed(3)} | ${exactRate.toFixed(3)} | ${pass ? "GATE PASS" : "GATE FAIL"} |`,
    );
  }
  console.log(
    anyPass
      ? `\n=> At least one point passes both conjuncts — surviving points exist for the Phase-9 difficulty probe.`
      : `\n=> ALL FOUR POINTS FAIL. Falsifier 1 (§11): the content-driven premise is false; this is a terminal ` +
          `finding and the probe stops there.`,
  );
};

main().catch((e) => {
  console.error("FAILED:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
